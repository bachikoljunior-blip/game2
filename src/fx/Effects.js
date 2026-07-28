/**
 * Effects.js — the impact language.
 *
 * A cut has to *land*. Every impact here is authored as one beat: particles, a light,
 * a decal, a shake and a sound fired together on the same timing curve. The simulation
 * itself lives entirely on the GPU — the CPU only writes spawn data into a ring buffer
 * and bumps a draw count, so a 200-spark parry costs a memcpy and nothing else.
 *
 *   _add / _alpha   two instanced-quad particle meshes, one per blend mode
 *   _cards          oriented/billboard quads (slash crescents, flashes, rings)
 *   _decals         projected quads conforming to the terrain, pooled oldest-first
 *   _trails         katana ribbons, one pooled mesh per active blade
 *   shake / hitstop trauma-based 6-DOF camera shake and re-entrant time dilation
 */

import {
  AdditiveBlending, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute,
  InstancedBufferAttribute, InstancedBufferGeometry, BufferGeometry, LinearFilter,
  LinearMipmapLinearFilter, Mesh, NormalBlending, Quaternion, ShaderMaterial,
  SRGBColorSpace, CanvasTexture, Vector3, Matrix4, ClampToEdgeWrapping,
} from 'three';

import { noise, makeRandom, clamp, glslNoise } from '../core/Noise.js';

// --------------------------------------------------------------------- palette
// Authored in sRGB per ARCHITECTURE §4; Color converts into the linear working space.
const C_SPARK_HOT = new Color('#fff6dc');
const C_SPARK_COOL = new Color('#ff7a1e');
const C_STEEL = new Color('#c9d3dc');
const C_BLOOD = new Color('#7a0d12');
const C_BLOOD_DARK = new Color('#3d060a');
const C_BLOOD_MIST = new Color('#5e0b10');
const C_DUST = new Color('#a89a83');
const C_DUST_DARK = new Color('#6e6455');
const C_WOOD = new Color('#5a4436');
const C_WOOD_LIGHT = new Color('#9b7f5e');
const C_STONE = new Color('#8b8778');
const C_WATER = new Color('#c8dbe4');
const C_FLASH = new Color('#ffffff');
const C_PARRY = new Color('#ffe9b0');
const C_SCUFF = new Color('#3b3229');

// Sprite atlas cells (4×4).
const S_PUFF = 0, S_SPARK = 1, S_SMOKE = 2, S_EMBER = 3, S_SPATTER = 4;
const S_PETAL = 5, S_MOTE = 6, S_LEAF = 7, S_DROPLET = 8, S_CRESCENT = 9;
const S_FLASH = 10, S_RING = 11, S_CORE = 12, S_MIST = 13, S_CROWN = 14, S_SPECK = 15;

// Decal atlas cells (4×4).
const D_POOL = 0, D_SPATTER_A = 1, D_SPATTER_B = 2, D_SCUFF = 3;
const D_SCORCH = 4, D_FOOT_L = 5, D_FOOT_R = 6, D_RING = 7;
const D_SMEAR = 8, D_CRACK = 9, D_DROPS = 10, D_RIPPLE = 11;

const GRAVITY = -22.0;              // game-feel gravity, ARCHITECTURE §4
const DECAL_LIFE = 40.0;            // seconds until a decal has fully faded
const MAX_TRAILS = 6;

// ------------------------------------------------------- zero-alloc scratch pads

/** The one spawn descriptor. Compositions fill it, `_emit` copies it into the ring. */
const SP = {
  px: 0, py: 0, pz: 0,
  vx: 0, vy: 0, vz: 0,
  life: 1, delay: 0, seed: 0, sprite: S_PUFF,
  size0: 0.2, size1: 0.05, rot: 0, rotSpeed: 0,
  gravity: 0, drag: 0.6, restitution: 0, groundY: -1e9,
  stretch: 0, wind: 0, turbulence: 0, fade: 0.45,
  r0: 1, g0: 1, b0: 1, a0: 1,
  r1: 1, g1: 1, b1: 1, a1: 0,
};

function spReset() {
  SP.px = SP.py = SP.pz = 0;
  SP.vx = SP.vy = SP.vz = 0;
  SP.life = 1; SP.delay = 0; SP.seed = 0; SP.sprite = S_PUFF;
  SP.size0 = 0.2; SP.size1 = 0.05; SP.rot = 0; SP.rotSpeed = 0;
  SP.gravity = 0; SP.drag = 0.6; SP.restitution = 0; SP.groundY = -1e9;
  SP.stretch = 0; SP.wind = 0; SP.turbulence = 0; SP.fade = 0.45;
  SP.r0 = SP.g0 = SP.b0 = 1; SP.a0 = 1;
  SP.r1 = SP.g1 = SP.b1 = 1; SP.a1 = 0;
}

function spCol0(c, a) { SP.r0 = c.r; SP.g0 = c.g; SP.b0 = c.b; SP.a0 = a; }
function spCol1(c, a) { SP.r1 = c.r; SP.g1 = c.g; SP.b1 = c.b; SP.a1 = a; }

const _v0 = new Vector3(), _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();
const _v4 = new Vector3(), _v5 = new Vector3(), _v6 = new Vector3();
const _q0 = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _sfxPayload = { name: '', position: null, gain: 1, pitch: 1 };
const _lightReq = { position: null, color: null, intensity: 1, distance: 8, decay: 2, duration: 0.12 };
const _lightColor = new Color();
const _basis = new Matrix4();

/** Orthonormal basis as a rotation matrix, columns X/Y/Z. Reused, never allocated. */
function _basisMatrix(x, y, z) {
  _basis.set(
    x.x, y.x, z.x, 0,
    x.y, y.y, z.y, 0,
    x.z, y.z, z.z, 0,
    0, 0, 0, 1,
  );
  return _basis;
}

export class EffectsSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = makeRandom(0xC0FFEE);

    /** Shader clock, advanced by scaled dt so hit-stop freezes the sparks too. */
    this.time = 0;
    this.realTime = 0;

    // --- camera shake (trauma-based, consumed by PlayerCamera) -----------------
    this.trauma = 0;
    this.traumaDecay = 1.8;
    this.shakeFreq = 22;
    this.shakeScale = 1.0;
    this.shakeOffset = new Vector3();
    this.shakeQuat = new Quaternion();
    this._shakeEuler = new Vector3();
    this._shakeSeed = 0;

    // --- hit-stop -------------------------------------------------------------
    this._hsUntil = -1;
    this._hsScale = 1;
    this._hsActive = false;

    // --- sub-systems (built in init) ------------------------------------------
    this._add = null;
    this._alpha = null;
    this._cards = null;
    this._decals = null;
    this._trails = new Map();
    this._trailPool = [];
    this._pending = null;
    this._pendingHead = 0;

    this._grindCooldown = 0;
    this._footFlip = new Map();

    this._unsub = [];
    this._disposed = false;
  }

  // ============================================================================ init

  async init() {
    const q = this.ctx.quality;
    const budget = Math.max(64, q?.particleBudget ?? 900);

    this.spriteAtlas = makeSpriteAtlas((q?.tier ?? 1) >= 2 ? 512 : 256);
    this.decalAtlas = makeDecalAtlas((q?.tier ?? 1) >= 2 ? 512 : 256);

    this._add = this._buildParticleSystem(Math.round(budget * 0.6), true, 'fx-additive');
    this._alpha = this._buildParticleSystem(Math.round(budget * 0.4), false, 'fx-alpha');
    this._cards = this._buildCardSystem(56);
    this._decals = this._buildDecalSystem(Math.max(8, q?.decalBudget ?? 64));
    this._buildTrailPool(Math.max(6, q?.trailSegments ?? 20));

    this._pending = new Array(96);
    for (let i = 0; i < this._pending.length; i++) {
      this._pending[i] = {
        t: -1, x: 0, y: 0, z: 0, type: D_SPATTER_A,
        size: 0.2, rot: 0, color: new Color(), alpha: 1, life: DECAL_LIFE,
      };
    }

    this._subscribe();
  }

  // ------------------------------------------------------------------ particle mesh

  _quadGeometry() {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.instanceCount = 0;
    return g;
  }

  _buildParticleSystem(capacity, additive, name) {
    capacity = Math.max(16, capacity | 0);
    const geo = this._quadGeometry();

    const aT = new Float32Array(capacity * 4);
    const aPos = new Float32Array(capacity * 3);
    const aVel = new Float32Array(capacity * 3);
    const aCtrl = new Float32Array(capacity * 4);
    const aSize = new Float32Array(capacity * 4);
    const aMisc = new Float32Array(capacity * 4);
    const aCol0 = new Float32Array(capacity * 4);
    const aCol1 = new Float32Array(capacity * 4);
    // Park every slot far in the past so nothing draws before its first spawn.
    for (let i = 0; i < capacity; i++) { aT[i * 4] = -1e6; aT[i * 4 + 1] = 1; }

    const attrs = [];
    const bind = (key, arr, size) => {
      const a = new InstancedBufferAttribute(arr, size);
      a.setUsage(DynamicDrawUsage);
      geo.setAttribute(key, a);
      attrs.push(a);
    };
    bind('aT', aT, 4); bind('aPos', aPos, 3); bind('aVel', aVel, 3);
    bind('aCtrl', aCtrl, 4); bind('aSize', aSize, 4); bind('aMisc', aMisc, 4);
    bind('aCol0', aCol0, 4); bind('aCol1', aCol1, 4);

    const mat = new ShaderMaterial({
      name,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: this.spriteAtlas },
        uWind: { value: new Float32Array([0.82, 0.57, 0.45, 0]) },
        uGravity: { value: GRAVITY },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      side: DoubleSide,
      fog: !additive,
      toneMapped: true,
    });

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = additive ? 12 : 10;
    mesh.matrixAutoUpdate = false;
    this.ctx.scene?.add(mesh);

    return {
      capacity, geo, mat, mesh, attrs,
      aT, aPos, aVel, aCtrl, aSize, aMisc, aCol0, aCol1,
      head: 0, used: 0, wrapped: false, deadAfter: -1,
      dirtyMin: 1e9, dirtyMax: -1,
    };
  }

  // ---------------------------------------------------------------------- cards

  _buildCardSystem(capacity) {
    const geo = this._quadGeometry();
    const cT = new Float32Array(capacity * 4);
    const cPos = new Float32Array(capacity * 3);
    const cQuat = new Float32Array(capacity * 4);
    const cSize = new Float32Array(capacity * 4);
    const cCol = new Float32Array(capacity * 4);
    const cFlags = new Float32Array(capacity * 4);
    for (let i = 0; i < capacity; i++) { cT[i * 4] = -1e6; cT[i * 4 + 1] = 1; cQuat[i * 4 + 3] = 1; }

    const attrs = [];
    const bind = (key, arr, size) => {
      const a = new InstancedBufferAttribute(arr, size);
      a.setUsage(DynamicDrawUsage);
      geo.setAttribute(key, a); attrs.push(a);
    };
    bind('cT', cT, 4); bind('cPos', cPos, 3); bind('cQuat', cQuat, 4);
    bind('cSize', cSize, 4); bind('cCol', cCol, 4); bind('cFlags', cFlags, 4);

    const mat = new ShaderMaterial({
      name: 'fx-cards',
      uniforms: { uTime: { value: 0 }, uMap: { value: this.spriteAtlas } },
      vertexShader: CARD_VERT,
      fragmentShader: CARD_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: true,
    });

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 13;
    mesh.matrixAutoUpdate = false;
    this.ctx.scene?.add(mesh);

    return {
      capacity, geo, mat, mesh, attrs, cT, cPos, cQuat, cSize, cCol, cFlags,
      head: 0, used: 0, wrapped: false, deadAfter: -1,
      dirtyMin: 1e9, dirtyMax: -1,
    };
  }

  // --------------------------------------------------------------------- decals

  _buildDecalSystem(capacity) {
    const geo = new BufferGeometry();
    const pos = new Float32Array(capacity * 4 * 3);
    const uv = new Float32Array(capacity * 4 * 2);
    const dat = new Float32Array(capacity * 4 * 4);   // spawn, life, seed, unused
    const col = new Float32Array(capacity * 4 * 4);
    const idx = new Array(capacity * 6);
    for (let i = 0; i < capacity; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
      for (let k = 0; k < 4; k++) { dat[(v + k) * 4] = -1e6; dat[(v + k) * 4 + 1] = 1; }
    }

    const aPos = new Float32BufferAttribute(pos, 3); aPos.setUsage(DynamicDrawUsage);
    const aUv = new Float32BufferAttribute(uv, 2); aUv.setUsage(DynamicDrawUsage);
    const aDat = new Float32BufferAttribute(dat, 4); aDat.setUsage(DynamicDrawUsage);
    const aCol = new Float32BufferAttribute(col, 4); aCol.setUsage(DynamicDrawUsage);
    geo.setAttribute('position', aPos);
    geo.setAttribute('uv', aUv);
    geo.setAttribute('aData', aDat);
    geo.setAttribute('aColor', aCol);
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);

    const mat = new ShaderMaterial({
      name: 'fx-decals',
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: this.decalAtlas },
        uTint: { value: new Color(0xffffff) },
      },
      vertexShader: DECAL_VERT,
      fragmentShader: DECAL_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
      fog: true,
      toneMapped: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.matrixAutoUpdate = false;
    this.ctx.scene?.add(mesh);

    return {
      capacity, geo, mat, mesh,
      attrs: [aPos, aUv, aDat, aCol],
      pos, uv, dat, col,
      head: 0, used: 0, wrapped: false,
      dirtyMin: 1e9, dirtyMax: -1,
    };
  }

  // ----------------------------------------------------------------- trail pool

  _buildTrailPool(segments) {
    for (let i = 0; i < MAX_TRAILS; i++) this._trailPool.push(this._makeTrail(segments));
  }

  _makeTrail(segments) {
    const S = Math.max(6, segments | 0);
    const geo = new BufferGeometry();
    const verts = S * 2;
    const position = new Float32Array(verts * 3);
    const aBase = new Float32Array(verts * 3);
    const aTip = new Float32Array(verts * 3);
    const aSide = new Float32Array(verts);
    const aAge = new Float32Array(verts);
    for (let i = 0; i < S; i++) { aSide[i * 2] = 0; aSide[i * 2 + 1] = 1; }

    const index = new Array(Math.max(6, (S - 1) * 6)).fill(0);
    for (let i = 0; i < S - 1; i++) {
      const a = i * 2, o = i * 6;
      index[o] = a; index[o + 1] = a + 1; index[o + 2] = a + 3;
      index[o + 3] = a; index[o + 4] = a + 3; index[o + 5] = a + 2;
    }

    const mk = (arr, size) => { const a = new Float32BufferAttribute(arr, size); a.setUsage(DynamicDrawUsage); return a; };
    geo.setAttribute('position', mk(position, 3));
    geo.setAttribute('aBase', mk(aBase, 3));
    geo.setAttribute('aTip', mk(aTip, 3));
    geo.setAttribute('aSide', mk(aSide, 1));
    geo.setAttribute('aAge', mk(aAge, 1));
    geo.setIndex(index);
    geo.setDrawRange(0, 0);

    const mat = new ShaderMaterial({
      name: 'fx-trail',
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color('#6fb6ff') },
        uCore: { value: new Color('#e9f6ff') },
        uEdge: { value: new Color('#ffffff') },
        uIntensity: { value: 1.0 },
        uTaper: { value: 0.22 },
      },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: true,
    });

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 14;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.ctx.scene?.add(mesh);

    return {
      segments: S, geo, mat, mesh, position, aBase, aTip, aAge,
      hist: new Float32Array(S * 7),     // bx,by,bz, tx,ty,tz, time
      head: 0, count: 0,
      inUse: false, active: false,
      life: 0.24, entity: null, prevValid: false,
      pb: new Vector3(), pt: new Vector3(),
    };
  }

  // ====================================================================== events

  _subscribe() {
    const bus = this.ctx.bus;
    if (!bus) return;
    const on = (n, f) => { this._unsub.push(bus.on(n, f)); };

    on('hit', (p) => this._onHit(p));
    on('parry', (p) => this._onParry(p));
    on('clash', (p) => this._onClash(p));
    on('death', (p) => this._onDeath(p));
    on('footstep', (p) => this._onFootstep(p));
    on('slash', (p) => this._onSlash(p));
    on('camera-shake', (p) => { if (p) this.addShake(p.amount || 0, p.duration || 0.3, p.freq || 22); });
    on('hitstop', (p) => { if (p) this.hitstop(p.scale ?? 0.08, p.duration ?? 0.07); });
    on('damage-taken', (p) => this._onDamageTaken(p));
    on('posture-break', (p) => this._onPostureBreak(p));
  }

  _onHit(p) {
    if (!p || !p.point) return;
    const dmg = p.damage || 10;
    const amount = clamp(dmg / 28, 0.35, 2.2) * (p.crit ? 1.6 : 1);
    _v6.copy(p.normal && p.normal.isVector3 ? p.normal : _up).normalize();

    if (p.kind === 'blunt') {
      this.dustPuff(p.point, _v6, amount * 1.2);
      this.stoneChip(p.point, _v6, amount * 0.7);
      this.addShake(0.20 * amount, 0.34, 18);
      this.hitstop(0.10, 0.055 + 0.03 * amount);
      this._sfx('impact_blunt', p.point, clamp(amount, 0.4, 1.4), 1);
    } else {
      this.bloodImpact(p.point, _v6, amount, !!p.crit);
      if (p.crit) this.sparkBurst(p.point, _v6, 0.5);
      this.addShake(0.16 * amount + (p.crit ? 0.16 : 0), 0.3, 24);
      this.hitstop(p.crit ? 0.045 : 0.10, p.crit ? 0.10 : 0.055);
      this._sfx(p.kind === 'thrust' ? 'impact_thrust' : 'impact_slash', p.point, clamp(amount, 0.4, 1.5), 1);
    }
  }

  _onParry(p) {
    if (!p || !p.point) return;
    const perfect = !!p.perfect;
    this.clashFlash(p.point, perfect ? 1.35 : 0.9);
    this.sparkBurst(p.point, _up, perfect ? 1.5 : 0.9);
    this.addShake(perfect ? 0.42 : 0.26, 0.4, 26);
    this.hitstop(perfect ? 0.035 : 0.12, perfect ? 0.13 : 0.07);
    this.ctx.pipeline?.pulseParry?.(perfect ? 1 : 0.6);
    this._sfx(perfect ? 'parry_perfect' : 'parry', p.point, 1, perfect ? 1.06 : 1);
  }

  _onClash(p) {
    if (!p || !p.point) return;
    this.sparkBurst(p.point, _up, 1.1);
    this.clashFlash(p.point, 0.6);
    this.addShake(0.3, 0.36, 28);
    this.hitstop(0.09, 0.08);
    this._sfx('clash', p.point, 1, 1);
  }

  _onDeath(p) {
    if (!p || !p.point) return;
    _v6.copy(p.direction && p.direction.isVector3 ? p.direction : _up).normalize();
    this.bloodImpact(p.point, _v6, 2.4, true);
    this.arterialArc(p.point, _v6, 1.0);
    _v5.copy(p.point); _v5.y = this._groundY(p.point.x, p.point.z);
    this.addDecal(_v5, D_POOL, 1.1 + this.rng() * 0.5, this.rng() * 6.283, C_BLOOD_DARK, 0.9, DECAL_LIFE, null);
    this.addShake(0.4, 0.5, 16);
    this.hitstop(0.06, 0.14);
    this._sfx('death', p.point, 1, 1);
  }

  _onFootstep(p) {
    if (!p || !p.point) return;
    const speed = p.speed || 2;
    const amount = clamp(speed / 5.4, 0.2, 1.4);
    const surface = p.surface || 'dirt';

    if (surface === 'water') this.waterSplash(p.point, amount);
    else if (surface === 'stone') this.dustPuff(p.point, _up, amount * 0.5);
    else this.dustPuff(p.point, _up, amount);

    // Alternate left/right so a run leaves a readable track.
    const flip = this._footFlip.get(p.entity) ? 0 : 1;
    this._footFlip.set(p.entity, flip);
    const fwd = p.entity?.forward;
    const heading = fwd ? Math.atan2(fwd.x, fwd.z) : 0;
    if (surface !== 'stone' && surface !== 'water') {
      _v5.copy(p.point); _v5.y = this._groundY(p.point.x, p.point.z);
      this.addDecal(_v5, flip ? D_FOOT_L : D_FOOT_R, 0.17, heading, C_SCUFF, 0.42 * amount, DECAL_LIFE * 0.55, null);
    }
    this._sfx('footstep_' + surface, p.point, clamp(amount, 0.15, 1), 0.94 + this.rng() * 0.12);
  }

  _onSlash(p) {
    if (!p || !p.from || !p.to) return;
    _v3.copy(p.to).sub(p.from);
    _v4.crossVectors(_v3, _up);
    if (_v4.lengthSq() < 1e-6) _v4.set(0, 0, 1);
    _v4.normalize();
    this.slashArc(p.from, p.to, _v4, p.heavy ? 1.35 : 1.0);
    this._sfx(p.heavy ? 'whoosh_heavy' : 'whoosh', p.to, p.heavy ? 1 : 0.7, 1);
  }

  _onDamageTaken(p) {
    if (!p) return;
    const a = clamp((p.amount || 10) / 30, 0.2, 1.5);
    this.addShake(0.24 * a, 0.42, 15);
    this.ctx.pipeline?.pulseDamage?.(a);
    if (p.entity?.position) {
      _v6.copy(p.direction && p.direction.isVector3 ? p.direction : _up).normalize().multiplyScalar(-1);
      _v5.copy(p.entity.position); _v5.y += (p.entity.height || 1.75) * 0.6;
      this.bloodImpact(_v5, _v6, a, false);
    }
  }

  _onPostureBreak(p) {
    const e = p?.entity;
    if (!e?.position) return;
    _v5.copy(e.position); _v5.y += (e.height || 1.75) * 0.55;
    this.clashFlash(_v5, 1.1);
    this.addShake(0.34, 0.45, 14);
    this._sfx('posture_break', _v5, 1, 1);
  }

  // ================================================================== low-level API

  /** Fill `SP` then call this. `additive` picks the blend-mode bucket. */
  spawn(additive) { this._emit(additive ? this._add : this._alpha); }

  _emit(sys) {
    if (!sys || sys.capacity === 0) return;
    const i = sys.head;
    sys.head = (i + 1) % sys.capacity;
    if (sys.head === 0) sys.wrapped = true;
    sys.used = sys.wrapped ? sys.capacity : Math.max(sys.used, sys.head);
    if (i < sys.dirtyMin) sys.dirtyMin = i;
    if (i > sys.dirtyMax) sys.dirtyMax = i;

    const i3 = i * 3, i4 = i * 4;
    const spawnT = this.time + SP.delay;

    sys.aT[i4] = spawnT; sys.aT[i4 + 1] = SP.life; sys.aT[i4 + 2] = SP.seed; sys.aT[i4 + 3] = SP.sprite;
    sys.aPos[i3] = SP.px; sys.aPos[i3 + 1] = SP.py; sys.aPos[i3 + 2] = SP.pz;
    sys.aVel[i3] = SP.vx; sys.aVel[i3 + 1] = SP.vy; sys.aVel[i3 + 2] = SP.vz;
    sys.aCtrl[i4] = SP.gravity; sys.aCtrl[i4 + 1] = SP.drag; sys.aCtrl[i4 + 2] = SP.restitution; sys.aCtrl[i4 + 3] = SP.groundY;
    sys.aSize[i4] = SP.size0; sys.aSize[i4 + 1] = SP.size1; sys.aSize[i4 + 2] = SP.rot; sys.aSize[i4 + 3] = SP.rotSpeed;
    sys.aMisc[i4] = SP.stretch; sys.aMisc[i4 + 1] = SP.wind; sys.aMisc[i4 + 2] = SP.turbulence; sys.aMisc[i4 + 3] = SP.fade;
    sys.aCol0[i4] = SP.r0; sys.aCol0[i4 + 1] = SP.g0; sys.aCol0[i4 + 2] = SP.b0; sys.aCol0[i4 + 3] = SP.a0;
    sys.aCol1[i4] = SP.r1; sys.aCol1[i4 + 1] = SP.g1; sys.aCol1[i4 + 2] = SP.b1; sys.aCol1[i4 + 3] = SP.a1;

    const dead = spawnT + SP.life;
    if (dead > sys.deadAfter) sys.deadAfter = dead;
  }

  /** Oriented or camera-facing quad card. Pass `quat = null` for a billboard. */
  addCard(pos, quat, sprite, w0, h0, w1, h1, color, alpha, life, spin, fade, billboard) {
    const sys = this._cards;
    if (!sys) return;
    const i = sys.head;
    sys.head = (i + 1) % sys.capacity;
    if (sys.head === 0) sys.wrapped = true;
    sys.used = sys.wrapped ? sys.capacity : Math.max(sys.used, sys.head);
    if (i < sys.dirtyMin) sys.dirtyMin = i;
    if (i > sys.dirtyMax) sys.dirtyMax = i;

    const i3 = i * 3, i4 = i * 4;
    sys.cT[i4] = this.time; sys.cT[i4 + 1] = life; sys.cT[i4 + 2] = sprite; sys.cT[i4 + 3] = this.rng();
    sys.cPos[i3] = pos.x; sys.cPos[i3 + 1] = pos.y; sys.cPos[i3 + 2] = pos.z;
    if (quat) { sys.cQuat[i4] = quat.x; sys.cQuat[i4 + 1] = quat.y; sys.cQuat[i4 + 2] = quat.z; sys.cQuat[i4 + 3] = quat.w; }
    else { sys.cQuat[i4] = 0; sys.cQuat[i4 + 1] = 0; sys.cQuat[i4 + 2] = 0; sys.cQuat[i4 + 3] = 1; }
    sys.cSize[i4] = w0; sys.cSize[i4 + 1] = h0; sys.cSize[i4 + 2] = w1; sys.cSize[i4 + 3] = h1;
    sys.cCol[i4] = color.r; sys.cCol[i4 + 1] = color.g; sys.cCol[i4 + 2] = color.b; sys.cCol[i4 + 3] = alpha;
    sys.cFlags[i4] = billboard ? 1 : 0; sys.cFlags[i4 + 1] = spin; sys.cFlags[i4 + 2] = fade; sys.cFlags[i4 + 3] = 0;

    const dead = this.time + life;
    if (dead > sys.deadAfter) sys.deadAfter = dead;
  }

  // ------------------------------------------------------------------ shake / time

  /** Trauma is additive and clamped; the visible shake is trauma². */
  addShake(amount, duration = 0.3, freq = 22) {
    if (!(amount > 0)) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
    this.traumaDecay = clamp(1 / Math.max(0.05, duration), 0.6, 8);
    this.shakeFreq = freq;
    this.ctx.playerCamera?.addShake?.(amount, duration, freq);
  }

  /**
   * Writes the current shake into caller-owned objects; returns false on a calm
   * frame so PlayerCamera can skip the maths entirely.
   */
  getShakeOffset(outPos, outQuat) {
    if (outPos) outPos.copy(this.shakeOffset);
    if (outQuat) outQuat.copy(this.shakeQuat);
    return this.trauma > 0.001;
  }

  /** Re-entrant: overlapping hits extend the window and keep the harshest scale. */
  hitstop(scale = 0.08, duration = 0.06) {
    const end = this.realTime + Math.max(0.01, duration);
    if (end > this._hsUntil) this._hsUntil = end;
    this._hsScale = this._hsActive ? Math.min(this._hsScale, scale) : scale;
    this._hsActive = true;
    this.ctx.engine?.setTimeScale?.(this._hsScale, true);
  }

  // ====================================================================== update

  update(dt, elapsed, rawDt) {
    if (this._disposed) return;
    const rdt = rawDt || dt || 0;
    this.time += dt || 0;
    this.realTime += rdt;

    // Released on unscaled time, so a 60 ms freeze is 60 ms of wall clock.
    if (this._hsActive && this.realTime >= this._hsUntil) {
      this._hsActive = false;
      this._hsScale = 1;
      this.ctx.engine?.setTimeScale?.(1, false);
    }

    this._updateShake(rdt);
    this._updatePending();
    this._updateTrails(rdt);

    const w = this.ctx.wind;
    const uw = this._add.mat.uniforms.uWind.value;
    if (w) {
      uw[0] = w.direction?.x ?? 0.82;
      uw[1] = w.direction?.z ?? 0.57;
      uw[2] = w.strength ?? 0.45;
      uw[3] = w.gust ?? 0;
    }
    const uw2 = this._alpha.mat.uniforms.uWind.value;
    uw2[0] = uw[0]; uw2[1] = uw[1]; uw2[2] = uw[2]; uw2[3] = uw[3];

    this._add.mat.uniforms.uTime.value = this.time;
    this._alpha.mat.uniforms.uTime.value = this.time;
    this._cards.mat.uniforms.uTime.value = this.time;
    this._decals.mat.uniforms.uTime.value = this.time;

    // Decals sit in the same light as the ground they are stamped on.
    const amb = this.ctx.lighting?.ambientColor || this.ctx.sky?.groundColor;
    if (amb && amb.isColor) {
      this._decals.mat.uniforms.uTint.value.copy(amb).multiplyScalar(1.35).addScalar(0.3);
    }

    this._flushInstanced(this._add);
    this._flushInstanced(this._alpha);
    this._flushInstanced(this._cards);
    this._flushDecals(this._decals);

    if (this._grindCooldown > 0) this._grindCooldown -= rdt;
  }

  _updateShake(rdt) {
    if (this.trauma <= 0) {
      if (this.shakeOffset.lengthSq() !== 0) this.shakeOffset.set(0, 0, 0);
      this.shakeQuat.set(0, 0, 0, 1);
      return;
    }
    this.trauma = Math.max(0, this.trauma - this.traumaDecay * rdt);
    this._shakeSeed += rdt * this.shakeFreq;
    const s = this.trauma * this.trauma * this.shakeScale;
    const t = this._shakeSeed;

    // Six independent noise channels — a shared seed reads as a single wobble.
    this.shakeOffset.set(
      noise.noise2(t, 11.3) * 0.11 * s,
      noise.noise2(t, 43.7) * 0.09 * s,
      noise.noise2(t, 71.1) * 0.06 * s,
    );
    this._shakeEuler.set(
      noise.noise2(t * 0.83, 131.5) * 0.035 * s,
      noise.noise2(t * 0.91, 197.2) * 0.045 * s,
      noise.noise2(t * 1.07, 233.9) * 0.060 * s,
    );
    const e = this._shakeEuler;
    const cx = Math.cos(e.x * 0.5), sx = Math.sin(e.x * 0.5);
    const cy = Math.cos(e.y * 0.5), sy = Math.sin(e.y * 0.5);
    const cz = Math.cos(e.z * 0.5), sz = Math.sin(e.z * 0.5);
    this.shakeQuat.set(
      sx * cy * cz + cx * sy * sz,
      cx * sy * cz - sx * cy * sz,
      cx * cy * sz + sx * sy * cz,
      cx * cy * cz - sx * sy * sz,
    );
  }

  /** Droplets get their decal queued at spawn from a predicted landing point. */
  _updatePending() {
    const arr = this._pending;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (p.t < 0 || this.time < p.t) continue;
      p.t = -1;
      _v5.set(p.x, p.y, p.z);
      this.addDecal(_v5, p.type, p.size, p.rot, p.color, p.alpha, p.life, null);
    }
  }

  _queueDecal(delay, x, y, z, type, size, rot, color, alpha, life) {
    const p = this._pending[this._pendingHead];
    this._pendingHead = (this._pendingHead + 1) % this._pending.length;
    p.t = this.time + delay;
    p.x = x; p.y = y; p.z = z;
    p.type = type; p.size = size; p.rot = rot;
    p.color.copy(color); p.alpha = alpha; p.life = life;
  }

  // -------------------------------------------------------------- buffer flushing

  _flushInstanced(sys) {
    if (sys.deadAfter >= 0 && this.time > sys.deadAfter) {
      sys.geo.instanceCount = 0;
      sys.head = 0; sys.used = 0; sys.wrapped = false; sys.deadAfter = -1;
    } else {
      sys.geo.instanceCount = sys.used;
    }
    if (sys.dirtyMin > sys.dirtyMax) return;
    const lo = sys.dirtyMin, hi = sys.dirtyMax;
    for (let i = 0; i < sys.attrs.length; i++) {
      const a = sys.attrs[i];
      if (a.clearUpdateRanges) { a.clearUpdateRanges(); a.addUpdateRange(lo * a.itemSize, (hi - lo + 1) * a.itemSize); }
      a.needsUpdate = true;
    }
    sys.dirtyMin = 1e9; sys.dirtyMax = -1;
  }

  _flushDecals(sys) {
    sys.geo.setDrawRange(0, sys.used * 6);
    if (sys.dirtyMin > sys.dirtyMax) return;
    const lo = sys.dirtyMin * 4, hi = sys.dirtyMax * 4 + 3;
    for (let i = 0; i < sys.attrs.length; i++) {
      const a = sys.attrs[i];
      if (a.clearUpdateRanges) { a.clearUpdateRanges(); a.addUpdateRange(lo * a.itemSize, (hi - lo + 1) * a.itemSize); }
      a.needsUpdate = true;
    }
    sys.dirtyMin = 1e9; sys.dirtyMax = -1;
  }

  // ---------------------------------------------------------------- misc helpers

  _groundY(x, z) {
    const h = this.ctx.terrain?.heightAt?.(x, z);
    return typeof h === 'number' && isFinite(h) ? h : 0;
  }

  _sfx(name, position, gain = 1, pitch = 1) {
    this.ctx.audio?.play?.(name, position, gain, pitch);
    _sfxPayload.name = name; _sfxPayload.position = position;
    _sfxPayload.gain = gain; _sfxPayload.pitch = pitch;
    this.ctx.bus?.emit('sfx', _sfxPayload);
  }

  _light(position, color, intensity, distance, duration) {
    const lighting = this.ctx.lighting;
    if (!lighting?.requestLight) return;
    _lightColor.copy(color);
    _lightReq.position = position;
    _lightReq.color = _lightColor;
    _lightReq.intensity = intensity;
    _lightReq.distance = distance;
    _lightReq.decay = 2;
    _lightReq.duration = duration;
    lighting.requestLight(_lightReq);
  }

  /** Budget-aware count: LOW must not choke on a ten-enemy brawl. */
  _n(base) {
    const scale = clamp((this.ctx.quality?.particleBudget ?? 900) / 900, 0.25, 2.2);
    return Math.max(1, Math.round(base * scale));
  }

  /** Random unit vector inside a cone of half-angle `spread` around `axis`. */
  _cone(axis, spread, out) {
    const r = this.rng, r2 = this.rng();
    const phi = r() * 6.283185;
    const cosT = 1 - r2 * (1 - Math.cos(spread));
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    // build a basis around the axis
    _v0.copy(axis).normalize();
    if (Math.abs(_v0.y) > 0.94) _v1.set(1, 0, 0); else _v1.set(0, 1, 0);
    _v2.crossVectors(_v0, _v1).normalize();
    _v1.crossVectors(_v2, _v0).normalize();
    out.copy(_v0).multiplyScalar(cosT)
      .addScaledVector(_v1, sinT * Math.cos(phi))
      .addScaledVector(_v2, sinT * Math.sin(phi));
    return out;
  }

  // ============================================================= IMPACT LIBRARY

  /**
   * Steel on steel. Hot white-orange sparks that really ricochet off the ground,
   * a one-frame point light, and a radial flash card to sell the ignition.
   */
  sparkBurst(point, normal, intensity = 1) {
    const n = normal && normal.isVector3 ? normal : _up;
    const gy = this._groundY(point.x, point.z);
    const count = this._n(Math.round(9 + 17 * intensity));

    for (let i = 0; i < count; i++) {
      spReset();
      this._cone(n, 1.15, _v3);
      const speed = 3.2 + this.rng() * 8.4 * (0.6 + intensity * 0.5);
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = _v3.x * speed; SP.vy = _v3.y * speed + 1.4; SP.vz = _v3.z * speed;
      SP.life = 0.24 + this.rng() * 0.42;
      SP.seed = this.rng();
      SP.sprite = S_SPARK;
      SP.size0 = 0.05 + this.rng() * 0.035;
      SP.size1 = 0.008;
      SP.gravity = 1.0;
      SP.drag = 0.85;
      SP.restitution = 0.34 + this.rng() * 0.22;
      SP.groundY = gy;
      SP.stretch = 1.7;
      SP.turbulence = 0.35;
      SP.fade = 0.35;
      spCol0(C_SPARK_HOT, 1.4);
      spCol1(C_SPARK_COOL, 0.0);
      this.spawn(true);
    }

    // a couple of fat glow cores at the contact point
    const cores = this._n(3);
    for (let i = 0; i < cores; i++) {
      spReset();
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.life = 0.10 + this.rng() * 0.07;
      SP.seed = this.rng();
      SP.sprite = S_CORE;
      SP.size0 = 0.22 * intensity + 0.1;
      SP.size1 = 0.02;
      SP.drag = 3;
      SP.fade = 0.0;
      spCol0(C_SPARK_HOT, 1.5);
      spCol1(C_SPARK_COOL, 0.0);
      this.spawn(true);
    }

    // fine grit drifting off the contact, alpha bucket so it reads as matter
    const grit = this._n(Math.round(3 * intensity));
    for (let i = 0; i < grit; i++) {
      spReset();
      this._cone(n, 1.4, _v3);
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = _v3.x * 0.8; SP.vy = _v3.y * 0.8 + 0.5; SP.vz = _v3.z * 0.8;
      SP.life = 0.5 + this.rng() * 0.4;
      SP.seed = this.rng();
      SP.sprite = S_SPECK;
      SP.size0 = 0.06; SP.size1 = 0.14;
      SP.drag = 2.2; SP.wind = 0.5; SP.fade = 0.1;
      spCol0(C_STEEL, 0.20);
      spCol1(C_STEEL, 0.0);
      this.spawn(false);
    }

    this.addCard(point, null, S_FLASH, 0.05, 0.05, 0.9 * intensity + 0.35, 0.9 * intensity + 0.35,
      C_SPARK_HOT, 0.85 * intensity, 0.10, 0, 0.0, true);
    this._light(point, C_SPARK_COOL, 5.5 * intensity, 6.5, 0.10);
  }

  /**
   * Stylised, not gory: a fast mist card, arcing droplets that stamp the ground
   * where they land, and a pool for anything fatal. Dark `#7a0d12`.
   */
  bloodImpact(point, direction, amount = 1, big = false) {
    const dir = direction && direction.isVector3 ? direction : _up;
    const gy = this._groundY(point.x, point.z);

    // 1. mist card — the first 60 ms of the beat
    const mists = this._n(big ? 5 : 3);
    for (let i = 0; i < mists; i++) {
      spReset();
      this._cone(dir, 0.9, _v3);
      SP.px = point.x + _v3.x * 0.05;
      SP.py = point.y + _v3.y * 0.05;
      SP.pz = point.z + _v3.z * 0.05;
      const sp = 1.6 + this.rng() * 2.6 * amount;
      SP.vx = _v3.x * sp; SP.vy = _v3.y * sp + 0.4; SP.vz = _v3.z * sp;
      SP.life = 0.18 + this.rng() * 0.16;
      SP.seed = this.rng();
      SP.sprite = S_MIST;
      SP.size0 = 0.16 * amount + 0.08;
      SP.size1 = 0.62 * amount + 0.25;
      SP.rot = this.rng() * 6.283;
      SP.rotSpeed = (this.rng() - 0.5) * 3;
      SP.drag = 4.5; SP.gravity = 0.15; SP.wind = 0.3;
      SP.fade = 0.12;
      spCol0(C_BLOOD_MIST, 0.62 * clamp(amount, 0.4, 1.3));
      spCol1(C_BLOOD_DARK, 0.0);
      this.spawn(false);
    }

    // 2. arcing droplets, each one pre-queues its landing mark
    const drops = this._n(Math.round((big ? 16 : 8) * clamp(amount, 0.4, 2)));
    for (let i = 0; i < drops; i++) {
      spReset();
      this._cone(dir, 1.0, _v3);
      const sp = 2.4 + this.rng() * 5.5 * amount;
      const vx = _v3.x * sp, vy = _v3.y * sp + 1.6, vz = _v3.z * sp;
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = vx; SP.vy = vy; SP.vz = vz;
      SP.life = 0.45 + this.rng() * 0.7;
      SP.seed = this.rng();
      SP.sprite = S_SPATTER;
      SP.size0 = 0.035 + this.rng() * 0.045;
      SP.size1 = 0.02;
      SP.gravity = 1.0; SP.drag = 0.25; SP.stretch = 0.8;
      SP.fade = 0.6;
      spCol0(C_BLOOD, 1.0);
      spCol1(C_BLOOD_DARK, 0.9);
      this.spawn(false);

      // analytic ballistic landing: t where y + vy t + ½gt² = groundY
      const h = point.y - gy;
      const disc = vy * vy + 2 * 22 * h;
      if (disc > 0) {
        const tHit = (vy + Math.sqrt(disc)) / 22;
        if (tHit > 0.02 && tHit < 2.2) {
          this._queueDecal(tHit, point.x + vx * tHit, gy, point.z + vz * tHit,
            this.rng() > 0.5 ? D_SPATTER_A : D_SPATTER_B,
            0.10 + this.rng() * 0.22 * amount, this.rng() * 6.283,
            C_BLOOD, 0.55 + this.rng() * 0.35, DECAL_LIFE);
        }
      }
    }

    if (big) {
      this.addCard(point, null, S_MIST, 0.2, 0.2, 1.5 * amount, 1.5 * amount,
        C_BLOOD_MIST, 0.35, 0.22, 0.4, 0.05, true);
    }
  }

  /** The finisher: a sustained stream of droplets on a staggered GPU-side delay. */
  arterialArc(point, direction, strength = 1) {
    const dir = direction && direction.isVector3 ? direction : _up;
    const gy = this._groundY(point.x, point.z);
    const pulses = this._n(Math.round(24 * strength));
    for (let i = 0; i < pulses; i++) {
      const f = i / pulses;
      spReset();
      this._cone(dir, 0.30, _v3);
      // pressure falls off across the arc; the spurt eases rather than stops
      const sp = (7.5 - f * 3.4) * (0.85 + this.rng() * 0.3) * strength;
      const vx = _v3.x * sp, vy = _v3.y * sp + 3.2 - f * 1.4, vz = _v3.z * sp;
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = vx; SP.vy = vy; SP.vz = vz;
      SP.delay = f * 0.42;
      SP.life = 0.55 + this.rng() * 0.5;
      SP.seed = this.rng();
      SP.sprite = S_DROPLET;
      SP.size0 = 0.05 + this.rng() * 0.05;
      SP.size1 = 0.03;
      SP.gravity = 1.0; SP.drag = 0.2; SP.stretch = 1.1;
      SP.fade = 0.66;
      spCol0(C_BLOOD, 1.0);
      spCol1(C_BLOOD_DARK, 0.85);
      this.spawn(false);

      const h = point.y - gy;
      const disc = vy * vy + 2 * 22 * h;
      if (disc > 0) {
        const tHit = (vy + Math.sqrt(disc)) / 22;
        if (tHit > 0.02 && tHit < 2.6) {
          this._queueDecal(SP.delay + tHit, point.x + vx * tHit, gy, point.z + vz * tHit,
            D_DROPS, 0.18 + this.rng() * 0.2, this.rng() * 6.283,
            C_BLOOD, 0.5, DECAL_LIFE);
        }
      }
    }
  }

  /** Footfalls, landings, dodges. Alpha bucket, wind-advected, no gravity. */
  dustPuff(point, normal, amount = 1) {
    const n = normal && normal.isVector3 ? normal : _up;
    const count = this._n(Math.round(2 + 5 * amount));
    for (let i = 0; i < count; i++) {
      spReset();
      this._cone(n, 1.35, _v3);
      const sp = 0.35 + this.rng() * 1.4 * amount;
      SP.px = point.x + _v3.x * 0.08;
      SP.py = point.y + 0.03;
      SP.pz = point.z + _v3.z * 0.08;
      SP.vx = _v3.x * sp; SP.vy = 0.25 + this.rng() * 0.5 * amount; SP.vz = _v3.z * sp;
      SP.life = 0.7 + this.rng() * 0.9;
      SP.seed = this.rng();
      SP.sprite = this.rng() > 0.4 ? S_PUFF : S_SMOKE;
      SP.size0 = 0.10 + 0.14 * amount;
      SP.size1 = 0.45 + 0.7 * amount;
      SP.rot = this.rng() * 6.283;
      SP.rotSpeed = (this.rng() - 0.5) * 1.1;
      SP.drag = 1.9; SP.gravity = -0.03; SP.wind = 0.75; SP.turbulence = 0.16;
      SP.fade = 0.18;
      spCol0(C_DUST, 0.26 * clamp(amount, 0.35, 1.3));
      spCol1(C_DUST_DARK, 0.0);
      this.spawn(false);
    }
  }

  /** Blade into cedar: pale splinters that bounce, plus a short brown haze. */
  woodChip(point, normal, amount = 1) {
    const n = normal && normal.isVector3 ? normal : _up;
    const gy = this._groundY(point.x, point.z);
    const count = this._n(Math.round(5 + 9 * amount));
    for (let i = 0; i < count; i++) {
      spReset();
      this._cone(n, 1.0, _v3);
      const sp = 1.8 + this.rng() * 4.5 * amount;
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = _v3.x * sp; SP.vy = _v3.y * sp + 1.8; SP.vz = _v3.z * sp;
      SP.life = 0.6 + this.rng() * 0.8;
      SP.seed = this.rng();
      SP.sprite = S_SPECK;
      SP.size0 = 0.045 + this.rng() * 0.05;
      SP.size1 = 0.03;
      SP.rot = this.rng() * 6.283;
      SP.rotSpeed = (this.rng() - 0.5) * 9;
      SP.gravity = 1.0; SP.drag = 0.6; SP.restitution = 0.28; SP.groundY = gy;
      SP.fade = 0.6;
      spCol0(C_WOOD_LIGHT, 1.0);
      spCol1(C_WOOD, 0.85);
      this.spawn(false);
    }
    this.dustPuff(point, n, amount * 0.5);
    this._sfx('chip_wood', point, clamp(amount, 0.3, 1), 1);
  }

  /** Blade into stone: grey chips, a dust cough and a few sparks. */
  stoneChip(point, normal, amount = 1) {
    const n = normal && normal.isVector3 ? normal : _up;
    const gy = this._groundY(point.x, point.z);
    const count = this._n(Math.round(4 + 8 * amount));
    for (let i = 0; i < count; i++) {
      spReset();
      this._cone(n, 1.05, _v3);
      const sp = 1.6 + this.rng() * 4.0 * amount;
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = _v3.x * sp; SP.vy = _v3.y * sp + 1.5; SP.vz = _v3.z * sp;
      SP.life = 0.55 + this.rng() * 0.7;
      SP.seed = this.rng();
      SP.sprite = S_SPECK;
      SP.size0 = 0.04 + this.rng() * 0.05;
      SP.size1 = 0.025;
      SP.rot = this.rng() * 6.283;
      SP.rotSpeed = (this.rng() - 0.5) * 7;
      SP.gravity = 1.0; SP.drag = 0.5; SP.restitution = 0.34; SP.groundY = gy;
      SP.fade = 0.6;
      spCol0(C_STONE, 1.0);
      spCol1(C_STONE, 0.7);
      this.spawn(false);
    }
    this.dustPuff(point, n, amount * 0.85);
    this.sparkBurst(point, n, amount * 0.35);
  }

  /**
   * Blade dragged along a surface — call every frame while grinding. Internally
   * rate-limited so a two-second guard-slide does not eat the whole budget.
   */
  sparkGrind(point, direction, intensity = 1) {
    if (this._grindCooldown > 0) return;
    this._grindCooldown = 0.022;
    const dir = direction && direction.isVector3 ? direction : _up;
    const gy = this._groundY(point.x, point.z);
    const count = this._n(Math.round(2 + 4 * intensity));
    for (let i = 0; i < count; i++) {
      spReset();
      this._cone(dir, 0.6, _v3);
      const sp = 2.5 + this.rng() * 6 * intensity;
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = _v3.x * sp; SP.vy = _v3.y * sp + 0.9; SP.vz = _v3.z * sp;
      SP.life = 0.16 + this.rng() * 0.3;
      SP.seed = this.rng();
      SP.sprite = S_SPARK;
      SP.size0 = 0.035 + this.rng() * 0.025;
      SP.size1 = 0.006;
      SP.gravity = 1.0; SP.drag = 1.1;
      SP.restitution = 0.3; SP.groundY = gy;
      SP.stretch = 2.0; SP.fade = 0.3;
      spCol0(C_SPARK_HOT, 1.2);
      spCol1(C_SPARK_COOL, 0.0);
      this.spawn(true);
    }
    this._light(point, C_SPARK_COOL, 1.6 * intensity, 3.5, 0.05);
  }

  /** A step or a body into water: crown card, droplets, a ripple decal. */
  waterSplash(point, amount = 1) {
    const count = this._n(Math.round(5 + 11 * amount));
    for (let i = 0; i < count; i++) {
      spReset();
      this._cone(_up, 0.85, _v3);
      const sp = 1.4 + this.rng() * 3.6 * amount;
      SP.px = point.x; SP.py = point.y + 0.02; SP.pz = point.z;
      SP.vx = _v3.x * sp; SP.vy = Math.abs(_v3.y) * sp + 1.9 * amount; SP.vz = _v3.z * sp;
      SP.life = 0.35 + this.rng() * 0.45;
      SP.seed = this.rng();
      SP.sprite = S_DROPLET;
      SP.size0 = 0.035 + this.rng() * 0.05;
      SP.size1 = 0.02;
      SP.gravity = 1.0; SP.drag = 0.35; SP.stretch = 0.9;
      SP.fade = 0.5;
      spCol0(C_WATER, 0.85);
      spCol1(C_WATER, 0.0);
      this.spawn(false);
    }
    // crown lies flat on the surface
    _q0.setFromUnitVectors(_v0.set(0, 0, 1), _up);
    _v5.copy(point); _v5.y += 0.02;
    this.addCard(_v5, _q0, S_CROWN, 0.12, 0.12, 0.55 * amount + 0.25, 0.55 * amount + 0.25,
      C_WATER, 0.55, 0.30, 0, 0.15, false);
    this.addDecal(point, D_RIPPLE, 0.35 * amount + 0.2, this.rng() * 6.283, C_WATER, 0.32, 2.6, null);
    this._sfx('splash', point, clamp(amount, 0.3, 1.2), 1);
  }

  /**
   * The crescent that hangs in the air for ~120 ms after a swing. Oriented in the
   * cut plane (`normal`), never billboarded — a billboard arc reads as a decal.
   */
  slashArc(from, to, normal, scale = 1) {
    _v3.copy(to).sub(from);
    const len = _v3.length();
    if (len < 0.05) return;
    _v3.divideScalar(len);
    _v4.copy(normal && normal.isVector3 ? normal : _up).normalize();
    _v5.crossVectors(_v4, _v3).normalize();
    _v4.crossVectors(_v3, _v5).normalize();
    // columns X=_v3, Y=_v5, Z=_v4 → quaternion via the matrix trace
    _q0.setFromRotationMatrix(_basisMatrix(_v3, _v5, _v4));

    _v0.copy(from).addScaledVector(_v3, len * 0.5);
    const w = len * 1.12 * scale;
    const h = len * 0.44 * scale;
    this.addCard(_v0, _q0, S_CRESCENT, w * 0.72, h * 0.6, w, h,
      C_STEEL, 0.75 * scale, 0.13, 0, 0.05, false);
    this.addCard(_v0, _q0, S_CRESCENT, w * 0.55, h * 0.4, w * 0.86, h * 0.8,
      C_FLASH, 0.5 * scale, 0.07, 0, 0.0, false);
  }

  /** The parry moment: white radial burst, an expanding ring, sparks, a pulse. */
  clashFlash(point, scale = 1) {
    this.addCard(point, null, S_FLASH, 0.1, 0.1, 1.6 * scale, 1.6 * scale,
      C_FLASH, 1.0, 0.13, 0.6, 0.0, true);
    this.addCard(point, null, S_RING, 0.15, 0.15, 2.6 * scale, 2.6 * scale,
      C_PARRY, 0.85, 0.34, 0, 0.05, true);
    this.addCard(point, null, S_RING, 0.1, 0.1, 1.5 * scale, 1.5 * scale,
      C_FLASH, 0.6, 0.20, 0, 0.0, true);

    const count = this._n(Math.round(8 * scale));
    for (let i = 0; i < count; i++) {
      spReset();
      this._cone(_up, 3.14, _v3);
      const sp = 4 + this.rng() * 7 * scale;
      SP.px = point.x; SP.py = point.y; SP.pz = point.z;
      SP.vx = _v3.x * sp; SP.vy = _v3.y * sp; SP.vz = _v3.z * sp;
      SP.life = 0.14 + this.rng() * 0.16;
      SP.seed = this.rng();
      SP.sprite = S_SPARK;
      SP.size0 = 0.06; SP.size1 = 0.01;
      SP.drag = 4.0; SP.stretch = 2.2; SP.fade = 0.1;
      spCol0(C_FLASH, 1.5);
      spCol1(C_PARRY, 0.0);
      this.spawn(true);
    }
    this._light(point, C_PARRY, 9 * scale, 9, 0.16);
  }

  /** Heavy landing: an expanding additive ring, a dust wall and a scuff decal. */
  groundShockwave(point, radius = 3) {
    _q0.setFromUnitVectors(_v0.set(0, 0, 1), _up);
    _v5.copy(point); _v5.y += 0.05;
    this.addCard(_v5, _q0, S_RING, 0.4, 0.4, radius * 2, radius * 2,
      C_DUST, 0.6, 0.55, 0, 0.1, false);

    const count = this._n(Math.round(10 + radius * 4));
    for (let i = 0; i < count; i++) {
      spReset();
      const a = (i / count) * 6.283185 + this.rng() * 0.3;
      const sp = radius * (1.6 + this.rng() * 1.2);
      SP.px = point.x; SP.py = point.y + 0.06; SP.pz = point.z;
      SP.vx = Math.cos(a) * sp; SP.vy = 0.5 + this.rng() * 1.1; SP.vz = Math.sin(a) * sp;
      SP.life = 0.9 + this.rng() * 0.9;
      SP.seed = this.rng();
      SP.sprite = this.rng() > 0.5 ? S_SMOKE : S_PUFF;
      SP.size0 = 0.25; SP.size1 = 1.2 + radius * 0.2;
      SP.rot = this.rng() * 6.283;
      SP.rotSpeed = (this.rng() - 0.5) * 0.9;
      SP.drag = 2.4; SP.gravity = -0.04; SP.wind = 0.6; SP.turbulence = 0.25;
      SP.fade = 0.16;
      spCol0(C_DUST, 0.3);
      spCol1(C_DUST_DARK, 0.0);
      this.spawn(false);
    }

    _v5.copy(point); _v5.y = this._groundY(point.x, point.z);
    this.addDecal(_v5, D_SCUFF, radius * 0.9, this.rng() * 6.283, C_SCUFF, 0.5, DECAL_LIFE, null);
    this.addDecal(_v5, D_CRACK, radius * 0.6, this.rng() * 6.283, C_SCUFF, 0.35, DECAL_LIFE, null);
    this.addShake(clamp(radius * 0.12, 0.1, 0.6), 0.5, 14);
    this._sfx('landing_heavy', point, 1, 1);
  }

  /** Ash/scorch mark. Exposed because Level and Combat both want it. */
  scorch(point, radius = 0.6, alpha = 0.7) {
    _v5.copy(point); _v5.y = this._groundY(point.x, point.z);
    this.addDecal(_v5, D_SCORCH, radius, this.rng() * 6.283, C_SCUFF, alpha, DECAL_LIFE, null);
  }

  // ================================================================= DECAL SYSTEM

  /**
   * A lightweight projected quad. On the ground the four corners are dropped onto
   * the terrain individually (`ctx.terrain.heightAt`) so the stamp follows the
   * slope; on a wall (`normal` supplied and not up-ish) it becomes a flat card.
   * Pooled oldest-first from `quality.decalBudget`.
   */
  addDecal(center, type, size, heading, color, alpha, life = DECAL_LIFE, normal = null) {
    const sys = this._decals;
    if (!sys || sys.capacity === 0) return;

    const i = sys.head;
    sys.head = (i + 1) % sys.capacity;
    if (sys.head === 0) sys.wrapped = true;
    sys.used = sys.wrapped ? sys.capacity : Math.max(sys.used, sys.head);
    if (i < sys.dirtyMin) sys.dirtyMin = i;
    if (i > sys.dirtyMax) sys.dirtyMax = i;

    const ca = Math.cos(heading), sa = Math.sin(heading);
    const upish = !normal || normal.y > 0.65;

    const base = i * 4;
    const pos = sys.pos, uvs = sys.uv, dat = sys.dat, col = sys.col;
    const cell = type | 0;
    const gu = (cell % 4) * 0.25, gv = Math.floor(cell / 4) * 0.25;
    const seed = this.rng();

    for (let k = 0; k < 4; k++) {
      const cx = (k === 0 || k === 3) ? -1 : 1;
      const cy = (k < 2) ? -1 : 1;
      const v = base + k;

      if (upish) {
        const dx = (cx * ca - cy * sa) * size;
        const dz = (cx * sa + cy * ca) * size;
        const wx = center.x + dx, wz = center.z + dz;
        pos[v * 3] = wx;
        pos[v * 3 + 1] = this._groundY(wx, wz) + 0.025;
        pos[v * 3 + 2] = wz;
      } else {
        // wall stamp: build a tangent frame from the surface normal
        _v0.copy(normal).normalize();
        if (Math.abs(_v0.y) > 0.94) _v1.set(1, 0, 0); else _v1.set(0, 1, 0);
        _v2.crossVectors(_v1, _v0).normalize();
        _v1.crossVectors(_v0, _v2).normalize();
        const dx = (cx * ca - cy * sa) * size;
        const dy = (cx * sa + cy * ca) * size;
        pos[v * 3] = center.x + _v2.x * dx + _v1.x * dy + _v0.x * 0.02;
        pos[v * 3 + 1] = center.y + _v2.y * dx + _v1.y * dy + _v0.y * 0.02;
        pos[v * 3 + 2] = center.z + _v2.z * dx + _v1.z * dy + _v0.z * 0.02;
      }

      uvs[v * 2] = gu + ((cx + 1) * 0.5) * 0.25;
      uvs[v * 2 + 1] = gv + ((cy + 1) * 0.5) * 0.25;

      dat[v * 4] = this.time; dat[v * 4 + 1] = life; dat[v * 4 + 2] = seed; dat[v * 4 + 3] = 0;
      col[v * 4] = color.r; col[v * 4 + 1] = color.g; col[v * 4 + 2] = color.b; col[v * 4 + 3] = alpha;
    }
  }

  // ================================================================= BLADE TRAILS

  /**
   * Start capturing a ribbon for `entity`'s blade.
   * opts: { color, coreColor, edgeColor, life, taper, intensity }
   */
  beginTrail(entity, opts) {
    if (!entity) return null;
    let tr = this._trails.get(entity);
    if (!tr) {
      for (let i = 0; i < this._trailPool.length; i++) {
        if (!this._trailPool[i].inUse) { tr = this._trailPool[i]; break; }
      }
      // All ribbons busy: steal the one with the fewest samples left.
      if (!tr) {
        let best = null;
        for (let i = 0; i < this._trailPool.length; i++) {
          const c = this._trailPool[i];
          if (!best || c.count < best.count) best = c;
        }
        tr = best;
        if (tr?.entity) this._trails.delete(tr.entity);
      }
      if (!tr) return null;
      this._trails.set(entity, tr);
    }
    tr.inUse = true;
    tr.active = true;
    tr.entity = entity;
    tr.head = 0; tr.count = 0; tr.prevValid = false;
    tr.life = opts?.life ?? 0.24;
    tr.mesh.visible = true;
    const u = tr.mat.uniforms;
    if (opts?.color) u.uColor.value.set(opts.color);
    if (opts?.coreColor) u.uCore.value.set(opts.coreColor);
    if (opts?.edgeColor) u.uEdge.value.set(opts.edgeColor);
    u.uIntensity.value = opts?.intensity ?? 1.0;
    u.uTaper.value = opts?.taper ?? 0.22;
    return tr;
  }

  /**
   * Push one blade sample. Called once per frame by Rig/Combat; we synthesise the
   * missing sub-frame samples by slerping the blade direction between the previous
   * and current pose, so a 30 fps phone still gets a smooth arc instead of a fan.
   */
  pushTrail(entity, basePos, tipPos) {
    const tr = this._trails.get(entity);
    if (!tr || !tr.active) return;

    if (tr.prevValid) {
      _v0.copy(tr.pt).sub(tr.pb);
      _v1.copy(tipPos).sub(basePos);
      const l0 = _v0.length(), l1 = _v1.length();
      if (l0 > 1e-4 && l1 > 1e-4) {
        _v0.divideScalar(l0); _v1.divideScalar(l1);
        const dot = clamp(_v0.dot(_v1), -1, 1);
        const ang = Math.acos(dot);
        const steps = Math.min(4, Math.max(1, Math.ceil(ang / 0.20)));
        for (let s = 1; s < steps; s++) {
          const f = s / steps;
          _v2.copy(_v0).lerp(_v1, f);
          if (_v2.lengthSq() < 1e-8) continue;
          _v2.normalize().multiplyScalar(l0 + (l1 - l0) * f);
          _v3.copy(tr.pb).lerp(basePos, f);
          _v4.copy(_v3).add(_v2);
          this._writeTrailSample(tr, _v3, _v4);
        }
      }
    }
    this._writeTrailSample(tr, basePos, tipPos);
    tr.pb.copy(basePos); tr.pt.copy(tipPos);
    tr.prevValid = true;
  }

  /** Stop capturing; the ribbon keeps fading for its remaining life. */
  endTrail(entity) {
    const tr = this._trails.get(entity);
    if (!tr) return;
    tr.active = false;
    tr.prevValid = false;
  }

  _writeTrailSample(tr, b, t) {
    const h = tr.head;
    const o = h * 7;
    tr.hist[o] = b.x; tr.hist[o + 1] = b.y; tr.hist[o + 2] = b.z;
    tr.hist[o + 3] = t.x; tr.hist[o + 4] = t.y; tr.hist[o + 5] = t.z;
    tr.hist[o + 6] = this.time;
    tr.head = (h + 1) % tr.segments;
    if (tr.count < tr.segments) tr.count++;
  }

  _updateTrails(rdt) {
    if (this._trails.size === 0) return;
    for (const tr of this._trails.values()) {
      this._rebuildTrail(tr);
      if (!tr.active && tr.count === 0) {
        tr.mesh.visible = false;
        tr.inUse = false;
        if (tr.entity) this._trails.delete(tr.entity);
        tr.entity = null;
      }
    }
  }

  /**
   * Rewrite the strip from oldest to newest. 36 segments is 72 vertices — far
   * cheaper than maintaining a wrapping index buffer, and it keeps the ribbon
   * topologically correct through the ring wrap.
   */
  _rebuildTrail(tr) {
    const S = tr.segments;
    const now = this.time;
    const life = tr.life;
    const pos = tr.position, ab = tr.aBase, at = tr.aTip, ag = tr.aAge;

    let written = 0;
    const start = (tr.head - tr.count + S * 2) % S;
    for (let k = 0; k < tr.count; k++) {
      const src = ((start + k) % S) * 7;
      const age = (now - tr.hist[src + 6]) / life;
      if (age >= 1 || age < 0) continue;
      const v0 = written * 2, v1 = v0 + 1;
      const bx = tr.hist[src], by = tr.hist[src + 1], bz = tr.hist[src + 2];
      const tx = tr.hist[src + 3], ty = tr.hist[src + 4], tz = tr.hist[src + 5];
      pos[v0 * 3] = bx; pos[v0 * 3 + 1] = by; pos[v0 * 3 + 2] = bz;
      pos[v1 * 3] = tx; pos[v1 * 3 + 1] = ty; pos[v1 * 3 + 2] = tz;
      ab[v0 * 3] = bx; ab[v0 * 3 + 1] = by; ab[v0 * 3 + 2] = bz;
      ab[v1 * 3] = bx; ab[v1 * 3 + 1] = by; ab[v1 * 3 + 2] = bz;
      at[v0 * 3] = tx; at[v0 * 3 + 1] = ty; at[v0 * 3 + 2] = tz;
      at[v1 * 3] = tx; at[v1 * 3 + 1] = ty; at[v1 * 3 + 2] = tz;
      ag[v0] = age; ag[v1] = age;
      written++;
    }

    // Drop fully-faded samples out of the ring so the buffer drains.
    if (written < tr.count) tr.count = written;

    if (written < 2) {
      tr.geo.setDrawRange(0, 0);
      tr.mesh.visible = false;
      return;
    }
    tr.mesh.visible = true;
    tr.geo.setDrawRange(0, (written - 1) * 6);
    tr.geo.attributes.position.needsUpdate = true;
    tr.geo.attributes.aBase.needsUpdate = true;
    tr.geo.attributes.aTip.needsUpdate = true;
    tr.geo.attributes.aAge.needsUpdate = true;
    tr.mat.uniforms.uTime.value = now;
  }

  resize() { /* nothing screen-space here; PostFX owns the framebuffer */ }

  applyQuality(q) {
    if (!q || this._disposed) return;
    const wantAdd = Math.round(Math.max(64, q.particleBudget) * 0.6);
    if (this._add && this._add.capacity !== Math.max(16, wantAdd)) {
      this._destroyMesh(this._add);
      this._destroyMesh(this._alpha);
      this._add = this._buildParticleSystem(wantAdd, true, 'fx-additive');
      this._alpha = this._buildParticleSystem(Math.round(Math.max(64, q.particleBudget) * 0.4), false, 'fx-alpha');
    }
    const wantDecals = Math.max(8, q.decalBudget);
    if (this._decals && this._decals.capacity !== wantDecals) {
      this._destroyMesh(this._decals);
      this._decals = this._buildDecalSystem(wantDecals);
    }
    const seg = Math.max(6, q.trailSegments | 0);
    if (this._trailPool.length && this._trailPool[0].segments !== seg) {
      for (let i = 0; i < this._trailPool.length; i++) this._destroyMesh(this._trailPool[i]);
      this._trailPool.length = 0;
      this._trails.clear();
      this._buildTrailPool(seg);
    }
  }

  _destroyMesh(sys) {
    if (!sys) return;
    this.ctx.scene?.remove(sys.mesh);
    sys.geo.dispose();
    sys.mat.dispose();
  }

  dispose() {
    this._disposed = true;
    for (let i = 0; i < this._unsub.length; i++) this._unsub[i]?.();
    this._unsub.length = 0;
    this._destroyMesh(this._add);
    this._destroyMesh(this._alpha);
    this._destroyMesh(this._cards);
    this._destroyMesh(this._decals);
    for (let i = 0; i < this._trailPool.length; i++) this._destroyMesh(this._trailPool[i]);
    this._trailPool.length = 0;
    this._trails.clear();
    this.spriteAtlas?.dispose();
    this.decalAtlas?.dispose();
    this.ctx.engine?.setTimeScale?.(1, true);
  }
}

// =============================================================================
//  GLSL — all simulation happens here; the CPU never touches a live particle.
// =============================================================================

const PARTICLE_COMMON = /* glsl */`
${glslNoise}

vec3 pDisp(vec3 v0, float k, vec3 g, float t){
  if (k > 0.001){
    float e = exp(-k * t);
    float a = (1.0 - e) / k;
    return v0 * a + g * (t - a) / k;
  }
  return v0 * t + 0.5 * g * t * t;
}

/** Ballistic path with up to three ground bounces — sparks must ricochet. */
vec3 pBounce(vec3 p0, vec3 v0, vec3 g, float rest, float groundY, float t){
  vec3 p = p0;
  vec3 v = v0;
  float tr = t;
  for (int i = 0; i < 3; i++){
    float h = p.y - groundY;
    if (h < 0.0) { p.y = groundY; h = 0.0; }
    float disc = v.y * v.y - 2.0 * g.y * h;
    float th = 1e9;
    if (disc > 0.0 && g.y < 0.0) th = (v.y + sqrt(disc)) / (-g.y);
    if (th >= tr || th <= 0.0005) break;
    p += v * th + 0.5 * g * th * th;
    p.y = groundY;
    v += g * th;
    v.y = -v.y * rest;
    v.xz *= 0.58;
    tr -= th;
  }
  p += v * tr + 0.5 * g * tr * tr;
  p.y = max(p.y, groundY);
  return p;
}
`;

const PARTICLE_VERT = /* glsl */`
attribute vec4 aT;      // spawn, life, seed, spriteIndex
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aCtrl;   // gravityScale, drag, restitution, groundY
attribute vec4 aSize;   // size0, size1, rot0, rotSpeed
attribute vec4 aMisc;   // stretch, windInfluence, turbulence, fadeShape
attribute vec4 aCol0;
attribute vec4 aCol1;

uniform float uTime;
uniform vec4  uWind;     // dirX, dirZ, strength, gust
uniform float uGravity;

varying vec2 vUv;
varying vec4 vColor;

${PARTICLE_COMMON}

#include <fog_pars_vertex>

void main(){
  float life = max(aT.y, 1e-4);
  float t = uTime - aT.x;
  float t01 = t / life;
  if (t01 < 0.0 || t01 > 1.0){
    vUv = vec2(0.0);
    vColor = vec4(0.0);
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }

  vec3 g = vec3(0.0, uGravity * aCtrl.x, 0.0);
  vec3 wp;
  if (aCtrl.z > 0.001) wp = pBounce(aPos, aVel, g, aCtrl.z, aCtrl.w, t);
  else                 wp = aPos + pDisp(aVel, aCtrl.y, g, t);

  // Smoke and dust ride the same gust field the grass does.
  vec3 windVec = vec3(uWind.x, 0.0, uWind.y) * (uWind.z + uWind.w);
  wp += windVec * aMisc.y * t;

  if (aMisc.z > 0.0001){
    float sd = aT.z * 91.7;
    wp += vec3(
      snoise2(vec2(sd, t * 0.75)),
      snoise2(vec2(sd + 13.1, t * 0.61)) * 0.6,
      snoise2(vec2(sd + 41.7, t * 0.83))
    ) * aMisc.z * t;
  }

  float ease = t01 * t01 * (3.0 - 2.0 * t01);
  float size = mix(aSize.x, aSize.y, ease);

  vec4 mvPosition = viewMatrix * modelMatrix * vec4(wp, 1.0);

  vec2 c = position.xy;
  float ang = aSize.z + aSize.w * t;
  float ca = cos(ang), sa = sin(ang);
  vec2 rc = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
  vec2 off = rc * size;

  if (aMisc.x > 0.001){
    // Velocity-aligned streak — the whole reason a spark reads as a spark.
    vec3 vw = aVel + g * t;
    vec3 vv = mat3(viewMatrix * modelMatrix) * vw;
    float vl = length(vv.xy);
    if (vl > 1e-4){
      vec2 ax = vv.xy / vl;
      vec2 ay = vec2(-ax.y, ax.x);
      float stretched = size * (1.0 + aMisc.x * min(vl * 0.11, 7.0));
      off = ax * (c.y * stretched) + ay * (c.x * size);
    }
  }
  mvPosition.xy += off;

  gl_Position = projectionMatrix * mvPosition;

  float cell = floor(aT.w + 0.5);
  vec2 grid = vec2(mod(cell, 4.0), floor(cell / 4.0));
  vUv = (uv + grid) * 0.25;

  float fadeIn = smoothstep(0.0, 0.09, t01);
  float fadeOut = 1.0 - smoothstep(aMisc.w, 1.0, t01);
  vColor = vec4(
    mix(aCol0.rgb, aCol1.rgb, ease),
    mix(aCol0.a, aCol1.a, ease) * fadeIn * pow(fadeOut, 1.35)
  );

  #include <fog_vertex>
}
`;

const PARTICLE_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;

#include <fog_pars_fragment>

void main(){
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const CARD_VERT = /* glsl */`
attribute vec4 cT;      // spawn, life, sprite, seed
attribute vec3 cPos;
attribute vec4 cQuat;
attribute vec4 cSize;   // w0, h0, w1, h1
attribute vec4 cCol;
attribute vec4 cFlags;  // billboard, spin, fadeShape, unused

uniform float uTime;

varying vec2 vUv;
varying vec4 vColor;

vec3 qrot(vec4 q, vec3 v){ return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

void main(){
  float life = max(cT.y, 1e-4);
  float t01 = (uTime - cT.x) / life;
  if (t01 < 0.0 || t01 > 1.0){
    vUv = vec2(0.0);
    vColor = vec4(0.0);
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }

  float e = 1.0 - pow(1.0 - t01, 2.2);     // snaps open, settles late
  float w = mix(cSize.x, cSize.z, e);
  float h = mix(cSize.y, cSize.w, e);

  float ang = cFlags.y * (uTime - cT.x);
  float ca = cos(ang), sa = sin(ang);
  vec2 c = position.xy;
  vec2 rc = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);

  if (cFlags.x > 0.5){
    vec4 mv = viewMatrix * vec4(cPos, 1.0);
    mv.xy += rc * vec2(w, h);
    gl_Position = projectionMatrix * mv;
  } else {
    vec3 local = vec3(rc.x * w, rc.y * h, 0.0);
    vec3 wp = cPos + qrot(normalize(cQuat), local);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }

  float cell = floor(cT.z + 0.5);
  vec2 grid = vec2(mod(cell, 4.0), floor(cell / 4.0));
  vUv = (uv + grid) * 0.25;

  float a = cCol.a * smoothstep(0.0, 0.06, t01) * (1.0 - smoothstep(cFlags.z, 1.0, t01));
  vColor = vec4(cCol.rgb, a);
}
`;

const CARD_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
void main(){
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const DECAL_VERT = /* glsl */`
attribute vec4 aData;   // spawn, life, seed, unused
attribute vec4 aColor;

uniform float uTime;

varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;

#include <fog_pars_vertex>

void main(){
  float life = max(aData.y, 1e-4);
  float t01 = (uTime - aData.x) / life;
  if (t01 < 0.0 || t01 > 1.0){
    vUv = vec2(0.0);
    vColor = vec4(0.0);
    vSeed = 0.0;
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    return;
  }
  vUv = uv;
  vSeed = aData.z;
  vColor = vec4(aColor.rgb, aColor.a * smoothstep(0.0, 0.05, t01) * (1.0 - smoothstep(0.45, 1.0, t01)));

  vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const DECAL_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uTint;
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;

${glslNoise}

#include <fog_pars_fragment>

void main(){
  vec4 tex = texture2D(uMap, vUv);
  // Break up the stamp so two blood pools never read as the same sticker.
  float grain = 0.84 + 0.30 * fbm2(vUv * 26.0 + vSeed * 41.0, 3);
  float a = tex.a * vColor.a * grain;
  if (a < 0.006) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb * uTint, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const TRAIL_VERT = /* glsl */`
attribute vec3 aBase;
attribute vec3 aTip;
attribute float aSide;
attribute float aAge;

uniform float uTaper;

varying float vAge;
varying float vSide;

void main(){
  vAge = aAge;
  vSide = aSide;
  // Older segments narrow toward a pivot near the guard third, so the smear
  // tapers to a thread instead of ending in a flat slab.
  float w = mix(1.0, uTaper, pow(aAge, 0.85));
  vec3 anchor = mix(aBase, aTip, 0.30);
  vec3 own = mix(aBase, aTip, aSide);
  vec3 p = mix(anchor, own, w);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const TRAIL_FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uIntensity;
uniform float uTime;

varying float vAge;
varying float vSide;

${glslNoise}

void main(){
  float alpha = pow(1.0 - vAge, 1.55);
  // Soft caps at both ends of the blade: no hard border anywhere on the ribbon.
  alpha *= smoothstep(0.0, 0.10, vSide) * smoothstep(0.0, 0.14, 1.0 - vSide);

  float core = exp(-pow((vSide - 0.58) / 0.30, 2.0));
  float lead = smoothstep(0.16, 0.0, vAge);

  alpha *= 0.88 + 0.24 * snoise2(vec2(vSide * 5.0, vAge * 9.0 - uTime * 3.0));

  vec3 col = mix(uColor, uCore, core * 0.85);
  col += uEdge * lead * 0.9;
  col *= uIntensity;

  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// =============================================================================
//  Procedural sprite atlases (ARCHITECTURE §0: nothing is downloaded, ever)
// =============================================================================

function cellCtx(g, size, i) {
  const cell = size / 4;
  g.save();
  g.beginPath();
  g.rect((i % 4) * cell, Math.floor(i / 4) * cell, cell, cell);
  g.clip();
  g.translate((i % 4) * cell + cell * 0.5, Math.floor(i / 4) * cell + cell * 0.5);
  return cell;
}

function radial(g, r, stops) {
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(0.001, r));
  for (let i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
  return grd;
}

function makeSpriteAtlas(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const rnd = makeRandom(4242);
  g.clearRect(0, 0, size, size);

  const R = (i) => cellCtx(g, size, i) * 0.5 * 0.88;
  const done = () => g.restore();

  // 0 — soft round puff
  {
    const r = R(S_PUFF);
    g.fillStyle = radial(g, r, [[0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.42)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 26; k++) {
      const a = rnd() * 6.2832, d = rnd() * r * 0.9;
      g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.06 + rnd() * 0.16), 0, 6.2832); g.fill();
    }
    done();
  }

  // 1 — sharp spark streak, drawn vertical so the velocity stretch runs along +Y
  {
    const r = R(S_SPARK);
    const grd = g.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.30, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.50, 'rgba(255,255,255,1)');
    grd.addColorStop(0.72, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -r);
    g.quadraticCurveTo(r * 0.30, 0, 0, r);
    g.quadraticCurveTo(-r * 0.30, 0, 0, -r);
    g.fill();
    g.fillStyle = radial(g, r * 0.30, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath(); g.arc(0, 0, r * 0.30, 0, 6.2832); g.fill();
    done();
  }

  // 2 — smoke wisp
  {
    const r = R(S_SMOKE);
    for (let k = 0; k < 7; k++) {
      const a = rnd() * 6.2832, d = rnd() * r * 0.42, rr = r * (0.42 + rnd() * 0.4);
      g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d);
      g.fillStyle = radial(g, rr, [[0, 'rgba(255,255,255,0.34)'], [0.6, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]);
      g.beginPath(); g.arc(0, 0, rr, 0, 6.2832); g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 30; k++) {
      const a = rnd() * 6.2832, d = rnd() * r;
      g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.18})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.08 + rnd() * 0.2), 0, 6.2832); g.fill();
    }
    done();
  }

  // 3 — ember: a hot pinpoint wearing a bloom halo
  {
    const r = R(S_EMBER);
    g.fillStyle = radial(g, r, [
      [0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.85)'],
      [0.35, 'rgba(255,255,255,0.20)'], [1, 'rgba(255,255,255,0)'],
    ]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 4 — spatter blob with satellites
  {
    const r = R(S_SPATTER);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    const lobes = 18;
    for (let k = 0; k <= lobes; k++) {
      const a = (k / lobes) * 6.2832;
      const rr = r * (0.46 + 0.28 * noise.noise2(Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6 + 7));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    for (let k = 0; k < 7; k++) {
      const a = rnd() * 6.2832, d = r * (0.55 + rnd() * 0.4);
      g.globalAlpha = 0.5 + rnd() * 0.5;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.03 + rnd() * 0.08), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    done();
  }

  // 5 — sakura petal (notched teardrop)
  {
    const r = R(S_PETAL);
    const grd = g.createLinearGradient(0, -r, 0, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.72)');
    grd.addColorStop(0.55, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0.86)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, r * 0.92);
    g.bezierCurveTo(r * 0.85, r * 0.30, r * 0.60, -r * 0.62, r * 0.14, -r * 0.86);
    g.quadraticCurveTo(0, -r * 0.62, -r * 0.14, -r * 0.86);
    g.bezierCurveTo(-r * 0.60, -r * 0.62, -r * 0.85, r * 0.30, 0, r * 0.92);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = Math.max(1, r * 0.05);
    g.beginPath(); g.moveTo(0, r * 0.8); g.lineTo(0, -r * 0.7); g.stroke();
    done();
  }

  // 6 — dust mote
  {
    const r = R(S_MOTE);
    g.fillStyle = radial(g, r, [[0, 'rgba(255,255,255,0.85)'], [0.5, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 7 — leaf with a midrib and veins
  {
    const r = R(S_LEAF);
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath();
    g.moveTo(0, -r * 0.95);
    g.bezierCurveTo(r * 0.72, -r * 0.35, r * 0.58, r * 0.55, 0, r * 0.95);
    g.bezierCurveTo(-r * 0.58, r * 0.55, -r * 0.72, -r * 0.35, 0, -r * 0.95);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = 'rgba(0,0,0,0.30)';
    g.lineWidth = Math.max(1, r * 0.06);
    g.beginPath(); g.moveTo(0, -r * 0.9); g.lineTo(0, r * 0.9); g.stroke();
    g.lineWidth = Math.max(1, r * 0.035);
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const y = k * r * 0.22;
      g.beginPath(); g.moveTo(0, y); g.lineTo(r * 0.45, y + r * 0.2); g.stroke();
      g.beginPath(); g.moveTo(0, y); g.lineTo(-r * 0.45, y + r * 0.2); g.stroke();
    }
    done();
  }

  // 8 — water droplet
  {
    const r = R(S_DROPLET);
    g.fillStyle = radial(g, r, [[0, 'rgba(255,255,255,0.95)'], [0.55, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath();
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.55, -r * 0.1, r * 0.48, r * 0.72, 0, r * 0.86);
    g.bezierCurveTo(-r * 0.48, r * 0.72, -r * 0.55, -r * 0.1, 0, -r);
    g.fill();
    done();
  }

  // 9 — crescent cut card
  {
    const r = R(S_CRESCENT);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.moveTo(-r, r * 0.10);
    g.quadraticCurveTo(0, -r * 0.98, r, r * 0.10);
    g.quadraticCurveTo(0, -r * 0.52, -r, r * 0.10);
    g.fill();
    // Feather the horns so the arc glows out rather than ending in a chisel.
    g.globalCompositeOperation = 'destination-out';
    const fg = g.createLinearGradient(-r, 0, r, 0);
    fg.addColorStop(0, 'rgba(0,0,0,0.95)');
    fg.addColorStop(0.16, 'rgba(0,0,0,0.12)');
    fg.addColorStop(0.84, 'rgba(0,0,0,0.12)');
    fg.addColorStop(1, 'rgba(0,0,0,0.95)');
    g.fillStyle = fg;
    g.fillRect(-r, -r, r * 2, r * 2);
    done();
  }

  // 10 — radial flash (star burst)
  {
    const r = R(S_FLASH);
    g.fillStyle = radial(g, r * 0.5, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath(); g.arc(0, 0, r * 0.5, 0, 6.2832); g.fill();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * 6.2832 + rnd() * 0.2;
      const len = r * (0.55 + rnd() * 0.45);
      g.save(); g.rotate(a);
      const lg = g.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0.85)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(0, -r * 0.035); g.lineTo(len, 0); g.lineTo(0, r * 0.035);
      g.closePath(); g.fill();
      g.restore();
    }
    done();
  }

  // 11 — ring / shockwave
  {
    const r = R(S_RING);
    g.fillStyle = radial(g, r, [
      [0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'],
      [0.80, 'rgba(255,255,255,0.85)'], [0.92, 'rgba(255,255,255,0.95)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 12 — tight glow core
  {
    const r = R(S_CORE);
    g.fillStyle = radial(g, r, [
      [0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.55)'],
      [0.60, 'rgba(255,255,255,0.10)'], [1, 'rgba(255,255,255,0)'],
    ]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 13 — blood mist wisp: dense core, ragged droplet fringe
  {
    const r = R(S_MIST);
    for (let k = 0; k < 9; k++) {
      const a = rnd() * 6.2832, d = rnd() * r * 0.5, rr = r * (0.30 + rnd() * 0.45);
      g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d);
      g.fillStyle = radial(g, rr, [[0, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]);
      g.beginPath(); g.arc(0, 0, rr, 0, 6.2832); g.fill(); g.restore();
    }
    for (let k = 0; k < 20; k++) {
      const a = rnd() * 6.2832, d = r * (0.4 + rnd() * 0.6);
      g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.015 + rnd() * 0.05), 0, 6.2832); g.fill();
    }
    done();
  }

  // 14 — splash crown
  {
    const r = R(S_CROWN);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = Math.max(1, r * 0.07);
    g.beginPath(); g.arc(0, 0, r * 0.72, 0, 6.2832); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 6.2832 + rnd() * 0.15;
      const h = r * (0.16 + rnd() * 0.26);
      g.save(); g.rotate(a);
      g.beginPath();
      g.moveTo(r * 0.66, -r * 0.05); g.lineTo(r * 0.72 + h, 0); g.lineTo(r * 0.66, r * 0.05);
      g.closePath(); g.fill();
      g.restore();
    }
    done();
  }

  // 15 — speck cluster (grit, chips, splinters)
  {
    const r = R(S_SPECK);
    for (let k = 0; k < 14; k++) {
      const a = rnd() * 6.2832, d = rnd() * r * 0.85;
      g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.04 + rnd() * 0.10), 0, 6.2832); g.fill();
    }
    done();
  }

  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  // No mipmaps: a 4×4 atlas bleeds across cells at low mips and a bleeding spark
  // streak looks like a bug. Particles are soft, so the aliasing never shows.
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeDecalAtlas(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const rnd = makeRandom(90210);
  g.clearRect(0, 0, size, size);
  const R = (i) => cellCtx(g, size, i) * 0.5 * 0.90;
  const done = () => g.restore();

  const blob = (r, lobes, rough, alpha) => {
    g.beginPath();
    const n = 36;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * 6.2832;
      const rr = r * (1 - rough + rough * (0.5 + 0.5 * noise.noise2(Math.cos(a) * lobes, Math.sin(a) * lobes)));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    g.fill();
  };

  // 0 — blood pool
  {
    const r = R(D_POOL);
    blob(r * 0.86, 2.2, 0.34, 0.95);
    g.fillStyle = '#fff';
    for (let k = 0; k < 9; k++) {
      const a = rnd() * 6.2832, d = r * (0.7 + rnd() * 0.28);
      g.globalAlpha = 0.5 + rnd() * 0.4;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.03 + rnd() * 0.09), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = radial(g, r, [[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 1 / 2 — spatter variants
  {
    const ids = [D_SPATTER_A, D_SPATTER_B];
    for (let s = 0; s < ids.length; s++) {
      const r = R(ids[s]);
      g.fillStyle = '#fff';
      for (let k = 0; k < 20 + s * 8; k++) {
        const a = rnd() * 6.2832, d = Math.pow(rnd(), 0.6) * r * 0.94;
        const rr = r * (0.03 + Math.pow(rnd(), 2) * 0.20);
        g.globalAlpha = 0.4 + rnd() * 0.6;
        g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d); g.rotate(a);
        g.beginPath(); g.ellipse(0, 0, rr * (1 + rnd() * 1.6), rr, 0, 0, 6.2832); g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
      done();
    }
  }

  // 3 — dirt scuff
  {
    const r = R(D_SCUFF);
    g.fillStyle = '#fff';
    for (let k = 0; k < 16; k++) {
      g.save(); g.rotate(rnd() * 6.2832);
      g.globalAlpha = 0.10 + rnd() * 0.22;
      g.beginPath(); g.ellipse(0, 0, r * (0.35 + rnd() * 0.6), r * (0.08 + rnd() * 0.2), 0, 0, 6.2832); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = radial(g, r, [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,1)']]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 4 — scorch
  {
    const r = R(D_SCORCH);
    blob(r * 0.88, 3.0, 0.28, 0.9);
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 40; k++) {
      const a = rnd() * 6.2832, d = rnd() * r;
      g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.3})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.04 + rnd() * 0.14), 0, 6.2832); g.fill();
    }
    g.fillStyle = radial(g, r, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.95)']]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 5 / 6 — tabi footprints; +Y is the heading direction
  {
    const feet = [[D_FOOT_L, -1], [D_FOOT_R, 1]];
    for (let s = 0; s < feet.length; s++) {
      const r = R(feet[s][0]);
      g.save(); g.scale(feet[s][1], 1);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.ellipse(0, -r * 0.28, r * 0.34, r * 0.44, 0.06, 0, 6.2832); g.fill();
      g.beginPath(); g.ellipse(r * 0.03, r * 0.44, r * 0.26, r * 0.30, -0.04, 0, 6.2832); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = 'rgba(0,0,0,0.9)';
      g.beginPath(); g.ellipse(-r * 0.02, r * 0.02, r * 0.10, r * 0.16, 0, 0, 6.2832); g.fill();
      g.restore();
      done();
    }
  }

  // 7 — ring
  {
    const r = R(D_RING);
    g.fillStyle = radial(g, r, [
      [0, 'rgba(255,255,255,0)'], [0.66, 'rgba(255,255,255,0)'],
      [0.84, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)'],
    ]);
    g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
    done();
  }

  // 8 — directional smear (a body dragged, a boot sliding)
  {
    const r = R(D_SMEAR);
    const lg = g.createLinearGradient(0, -r, 0, r);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(-r * 0.42, -r * 0.9);
    g.quadraticCurveTo(r * 0.5, 0, -r * 0.10, r * 0.9);
    g.quadraticCurveTo(-r * 0.75, 0, -r * 0.42, -r * 0.9);
    g.fill();
    done();
  }

  // 9 — impact crack
  {
    const r = R(D_CRACK);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 9; k++) {
      let ang = (k / 9) * 6.2832 + rnd() * 0.4;
      g.lineWidth = Math.max(1, r * (0.035 - k * 0.001));
      g.beginPath(); g.moveTo(0, 0);
      let x = 0, y = 0;
      for (let s = 0; s < 5; s++) {
        ang += (rnd() - 0.5) * 0.7;
        const step = r * (0.10 + rnd() * 0.14);
        x += Math.cos(ang) * step; y += Math.sin(ang) * step;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    done();
  }

  // 10 — scattered drops
  {
    const r = R(D_DROPS);
    g.fillStyle = '#fff';
    for (let k = 0; k < 26; k++) {
      const a = rnd() * 6.2832, d = Math.pow(rnd(), 0.5) * r;
      g.globalAlpha = 0.3 + rnd() * 0.6;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.02 + rnd() * 0.07), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    done();
  }

  // 11 — water ripple
  {
    const r = R(D_RIPPLE);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = Math.max(1, r * 0.045);
    g.beginPath(); g.arc(0, 0, r * 0.86, 0, 6.2832); g.stroke();
    g.globalAlpha = 0.6;
    g.beginPath(); g.arc(0, 0, r * 0.58, 0, 6.2832); g.stroke();
    g.globalAlpha = 0.35;
    g.beginPath(); g.arc(0, 0, r * 0.34, 0, 6.2832); g.stroke();
    g.globalAlpha = 1;
    done();
  }

  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
