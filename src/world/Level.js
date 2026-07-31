/**
 * Level.js — the mountain shrine: layout, merging, collision, spawns, encounters.
 *
 * ## The place
 *
 * A processional axis runs north along −Z. You arrive from +Z up a worn stone
 * stair, pass three torii of increasing size, cross a gravel forecourt, and face
 * the haiden; the honden sits behind it with its doorway on `WORLD.ORIGIN`. The
 * forecourt is deliberately a **26 × 20 m combat arena**: flat gravel, cover only
 * at the edges (cairns, lanterns, the bell tower, the chōzuya), and clear
 * sightlines back down the axis so you always read where the next oni came from.
 * A cliff-edge overlook to the south-east frames the bamboo valley.
 *
 * ## How it is built
 *
 * `PropFactory` returns geometry in a local frame; Level transforms it into world
 * space and drops it into a bucket keyed by `(layer, spatial cell, material)`.
 * Every bucket is merged once at the end, so the entire shrine renders in a few
 * dozen draw calls and the frustum cull actually has cell-sized work to do.
 * Anything that repeats — lanterns, ema, banners, leaves — becomes an
 * `InstancedMesh` instead. Build work is chunked against a 9 ms budget and yields
 * to the compositor, because on a phone this is a couple of hundred milliseconds
 * of geometry synthesis and the loading bar has to keep painting.
 *
 * `update()` allocates nothing.
 */

import { Group, Mesh, Vector3, Matrix4, Sphere, BoxGeometry, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PropFactory, InstancedProto, normalizeGeo, CLOTH_MATERIALS, EMISSIVE } from './Props.js';
import { WORLD, inPlayable } from './Constants.js';
import { makeRandom, clamp, lerp, noise } from '../core/Noise.js';

// ------------------------------------------------------------------ layout

/**
 * The whole shrine in one table, in plateau-local metres (+Z is the approach,
 * y = 0 is the plateau floor). Everything downstream — spawns, reverb zones,
 * encounters, the cinematic shots — is derived from these numbers.
 */
export const LAYOUT = {
  axis: 0,
  honden: { x: 0, z: -4.5, w: 9.0, d: 9.0, floor: 1.95 },
  haiden: { x: 0, z: 8.5, w: 15.0, d: 11.0, floor: 1.15 },
  kagura: { x: -17.0, z: 12.0, w: 8.0, d: 8.0, floor: 0.95 },
  shamusho: { x: 18.0, z: 6.0, w: 9.0, d: 6.5, floor: 0.55 },
  bellTower: { x: 16.5, z: 27.0 },
  chozuya: { x: -14.5, z: 30.0 },
  /** The fight happens here. 26 × 20, flat, gravel. */
  arena: { x: 0, z: 26.0, hx: 13.0, hz: 10.0 },
  torii: [
    { z: 68.0, height: 3.35, span: 2.9 },
    { z: 54.0, height: 4.20, span: 3.6 },
    { z: 38.5, height: 5.60, span: 4.8 },
  ],
  stairTop: 72.0,
  stairBottom: 97.0,
  emaRack: { x: 10.5, z: 43.0 },
  omikujiRack: { x: -10.5, z: 43.0 },
  sacredTree: { x: -12.0, z: 19.5, height: 11.0 },
  deadTree: { x: 21.0, z: -3.0, height: 8.0 },
  caskWall: { x: -19.5, z: 30.0 },
  overlook: { x: 36.0, z: 36.0 },
  bridge: { x: 24.0, z: 34.0 },
  /** Beyond this radius the plateau falls away; also where the guard rail goes. */
  rimRadius: 74.0,
  approachGapDeg: 15,
};

/** Spatial cell size for the merged statics. Tuned so a cell ≈ one landmark. */
const CELL = 40;

/**
 * Cell size for the merged shadow proxies. Deliberately coarser than `CELL`: the
 * colour pass splits by material and wants small cells to cull, the shadow pass
 * wants as few casters as the cascade frusta will tolerate.
 *
 * At 96 this produced four proxies for one shrine — measured on the round-7 `torii`
 * pose at ten draw calls (three of them each in the colour pass and both cascades)
 * for 220,055 submitted triangles. The whole built world spans about 80 m on X and
 * 95 m on Z, so a grid that lands it in one cell submits 238,707 triangles in three
 * calls: seven calls back for 18,652 triangles against a 900k budget carrying 637k.
 *
 * `SHADOW_ORIGIN` shifts the lattice so the shrine is not straddling `floor()`'s
 * discontinuity at zero — without it, any cell size at all yields two columns and
 * two rows, because the plateau is centred on the world origin by WORLD.
 */
const SHADOW_CELL = 192;
const SHADOW_ORIGIN = 96;

// -------------------------------------------------------------- encounters

/**
 * The opening beat, kept as data so it can be retuned without touching logic.
 *
 *  - `trigger`: `{type:'start'}` | `{type:'zone', x, z, r}` | `{type:'event', name}`
 *  - `waves[].at`: seconds after the encounter starts.
 *  - `waves[].spawn`: `[archetype, spawnPointId, count]`.
 */
export const ENCOUNTERS = [
  {
    id: 'arrival',
    trigger: { type: 'start' },
    objective: { text: '山の社へ', sub: 'Climb to the mountain shrine' },
    waves: [],
    next: 'gate',
  },
  {
    id: 'gate',
    trigger: { type: 'zone', x: 0, z: 47, r: 10 },
    objective: { text: '鳥居をくぐれ', sub: 'Pass beneath the great torii' },
    waves: [],
    next: 'forecourt',
  },
  {
    id: 'forecourt',
    trigger: { type: 'zone', x: 0, z: 31, r: 12 },
    objective: { text: '境内を清めよ', sub: 'Clear the forecourt' },
    clearObjective: { text: '鐘を鳴らせ', sub: 'Ring the bell' },
    waves: [
      { at: 0.8, spawn: [['ashigaru', 'torii_c', 1], ['ashigaru', 'torii_l', 1]] },
      { at: 11.0, spawn: [['ashigaru', 'torii_r', 1], ['ronin', 'east', 1]] },
      { at: 24.0, spawn: [['ronin', 'west', 1], ['ashigaru', 'torii_c', 2]] },
    ],
    next: 'bell',
  },
  {
    id: 'bell',
    trigger: { type: 'event', name: 'bell' },
    objective: { text: '奥の敵を討て', sub: 'The bell has called them' },
    waves: [
      { at: 0.5, spawn: [['ronin', 'haiden_l', 1], ['ronin', 'haiden_r', 1]] },
      { at: 13.0, spawn: [['oni', 'torii_c', 1], ['ashigaru', 'stair', 2]] },
    ],
    next: null,
  },
];

// ------------------------------------------------------------ frame scratch

const _v = new Vector3();
const _v2 = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();

// ============================================================== Level

export class Level {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new Group();
    this.root.name = 'level';
    this.root.matrixAutoUpdate = false;

    /** Chunked-build progress hook, matching the other boot systems. */
    this.onProgress = null;

    this.factory = new PropFactory(ctx);
    this.rnd = makeRandom(0x4a9e2017);

    // build-time accumulators
    this._buckets = new Map();          // "layer|cx|cz|material" -> geometry[]
    this._colliders = new Map();        // "surface|walkable" -> geometry[]
    this._protos = new Map();           // key -> InstancedProto
    this._silhouettes = [];             // far-LOD parts
    this._lightRequests = [];

    // runtime
    this.cells = [];                    // { mesh, cx, cy, cz, r, layer }
    this.instances = [];                // { proto, meshes, cull, full }
    this.farMesh = null;
    this.spawnPoints = null;
    this.interactables = [];
    this.spawnQueue = [];
    /** Lantern flames, nearest the arena first — see `_realizeLights`. */
    this.propLights = [];
    this.stats = { drawCalls: 0, triangles: 0, cells: 0, instances: 0 };

    this._enc = { active: null, index: -1, t: 0, waveIndex: 0, done: new Set(), cleared: false };
    this._lodTimer = 0;
    this._foliageBound = false;
    this._bindTries = 0;
    this._farActive = false;
    this._clutterDist = 40;
    this._farDist = 120;
    this._shrineCenter = new Vector3();
    this._emberBase = EMISSIVE.flame.intensity;
    this._built = false;
  }

  // =====================================================================
  //  BUILD
  // =====================================================================

  async init() {
    const q = this.ctx?.quality;
    this._applyQualityKnobs(q);

    const tasks = [];
    const T = (label, fn) => tasks.push([label, fn]);

    // Material resolution can synthesise fallback textures, so it gets its own
    // budgeted slot rather than being lumped into the first geometry task.
    T('shrine materials', () => { this.factory.init().catch((e) => console.error('[level] materials', e)); });
    T('terrain probe', () => this._probeGround());
    for (let i = 0; i < 4; i++) {
      T('the approach stair', () => this._buildStairFlight(i, 0));
      T('the approach stair', () => this._buildStairFlight(i, 1));
    }
    T('the sandō', () => this._buildPath());
    T('the forecourt', () => this._buildForecourt());
    for (let i = 0; i < LAYOUT.torii.length; i++) T('torii', () => this._buildTorii(i));
    this._hallTasks(T, 'haiden', () => this._haidenOpts());
    T('lanterns of the haiden', () => this._buildHaidenLanterns());
    this._hallTasks(T, 'honden', () => this._hondenOpts());
    for (let i = 0; i < 5; i++) T('tamagaki', () => this._buildHondenFence(i));
    this._hallTasks(T, 'kagura-den', () => this._kaguraOpts());
    this._hallTasks(T, 'shamusho', () => this._shamushoOpts());
    T('bell tower', () => this._buildBellTower());
    T('chōzuya', () => this._buildChozuya());
    for (let i = 0; i < 4; i++) T('fences', () => this._buildFences(i));
    T('overlook', () => this._buildOverlook());
    T('bridge', () => this._buildBridge());
    T('sacred trees', () => this._buildTrees());
    T('lanterns', () => this._buildLanterns());
    T('banners', () => this._buildBanners());
    T('ema and omikuji', () => this._buildVotives());
    T('clutter', () => this._buildClutter());
    T('jizō and cairns', () => this._buildRoadside());
    T('fallen leaves', () => this._buildLeaves());
    T('boundary', () => this._buildBoundary());

    await this._run(tasks, 0, 0.62);

    this._bakeSmallInstances();
    this._collapseSmallBuckets();

    const mergeTasks = [];
    for (const key of this._buckets.keys()) {
      mergeTasks.push([`merging ${key.split('|')[3]}`, () => this._realizeBucket(key)]);
    }
    mergeTasks.push(['shadow proxies', () => this._realizeShadowProxies()]);
    mergeTasks.push(['far silhouette', () => this._realizeSilhouette()]);
    mergeTasks.push(['instances', () => this._realizeInstances()]);
    mergeTasks.push(['collision', () => this._realizePhysics()]);
    mergeTasks.push(['lights', () => this._realizeLights()]);
    await this._run(mergeTasks, 0.62, 1.0);

    this._buildSpawnPoints();
    this._buildInteractables();

    this.ctx?.scene?.add(this.root);
    this.root.updateMatrixWorld(true);

    this._shrineCenter.set(0, this._plateauY + 4, 12);
    this._built = true;
    this._countStats();

    this._enc.index = -1;
    this._advanceEncounter(0);
    return this;
  }

  /** Run build tasks against a 9 ms budget, yielding to the compositor. */
  async _run(tasks, p0, p1) {
    let t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    for (let i = 0; i < tasks.length; i++) {
      const [label, fn] = tasks[i];
      try { fn(); }
      catch (err) { console.error(`[level] task "${label}" failed`, err); }
      this.onProgress?.(i + 1, tasks.length, label);
      if (now() - t0 > 7) {
        await new Promise((r) => (typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(() => setTimeout(r, 0))
          : setTimeout(r, 0)));
        t0 = now();
      }
    }
  }

  _applyQualityKnobs(q) {
    const tier = q?.tier ?? 1;
    this._clutterDist = [26, 40, 58, 72][tier] ?? 40;
    this._farDist = [80, 120, 170, 210][tier] ?? 120;
    this._density = [0.42, 0.68, 1.0, 1.25][tier] ?? 0.68;
    this._maxPropLights = [0, 3, 8, 14][tier] ?? 3;
    this._treeDepth = [3, 4, 4, 5][tier] ?? 4;
  }

  // ---------------------------------------------------------------- ground

  _probeGround() {
    this._plateauY = WORLD.PLATEAU_HEIGHT;
    // Sanity-check the terrain: a placeholder returns 0 and everything would sink.
    const probe = this._rawHeight(0, 0);
    this._terrainLive = probe !== null;
  }

  _rawHeight(x, z) {
    const h = this.ctx?.terrain?.heightAt?.(x, z);
    return (typeof h === 'number' && isFinite(h) && h > 100) ? h : null;
  }

  /** Absolute world Y of the ground. Falls back to the plateau if Terrain is not up. */
  groundY(x, z) {
    const h = this._rawHeight(x, z);
    return h === null ? WORLD.PLATEAU_HEIGHT : h;
  }

  /** Surface normal, or straight up. Writes into `out` and returns it. */
  groundNormal(x, z, out) {
    const n = this.ctx?.terrain?.normalAt?.(x, z, out);
    if (n && typeof n.x === 'number') { out.set(n.x, n.y, n.z); return out.normalize(); }
    return out.set(0, 1, 0);
  }

  // ---------------------------------------------------------------- buckets

  _cellKey(layer, x, z, material) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    return `${layer}|${cx}|${cz}|${material}`;
  }

  /**
   * Transform a build into world space and file every part into its bucket.
   * `matrix` maps the prop's local frame to world. Geometry is consumed unless
   * `clone` is set, so a prototype can be stamped more than once.
   *
   * `partsOnly` files the geometry and nothing else. It exists for
   * `_bakeSmallInstances`, which re-files a prototype's build once per instance:
   * the instanced path never emitted that build's colliders or light requests, so
   * stamping them now would silently add a collider per copy and a light per copy.
   */
  _emit(build, matrix, opts = {}) {
    if (!build) return;
    const layer = opts.layer ?? 'static';
    const partsOnly = !!opts.partsOnly;
    const clone = !!opts.clone;
    const tint = opts.tint;
    _v.setFromMatrixPosition(matrix);

    for (const part of build.parts) {
      let g = clone ? part.geometry.clone() : part.geometry;
      g.applyMatrix4(matrix);
      normalizeGeo(g, CLOTH_MATERIALS.has(part.material));
      if (tint) {
        const col = g.getAttribute('color');
        for (let i = 0; i < col.count; i++) {
          col.setXYZ(i, col.getX(i) * tint[0], col.getY(i) * tint[1], col.getZ(i) * tint[2]);
        }
      }
      const key = this._cellKey(layer, _v.x, _v.z, part.material);
      let list = this._buckets.get(key);
      if (!list) { list = []; this._buckets.set(key, list); }
      list.push(g);
    }

    if (partsOnly) return;

    for (const c of build.colliders) {
      const g = clone ? c.geometry.clone() : c.geometry;
      g.applyMatrix4(matrix);
      const key = `${c.surface}|${c.walkable ? 1 : 0}`;
      let list = this._colliders.get(key);
      if (!list) { list = []; this._colliders.set(key, list); }
      list.push(g);
    }

    for (const l of build.lights) {
      _v2.set(l.x, l.y, l.z).applyMatrix4(matrix);
      this._lightRequests.push({
        x: _v2.x, y: _v2.y, z: _v2.z,
        color: l.color, intensity: l.intensity, distance: l.distance, flicker: l.flicker,
      });
    }

    if (build.silhouette && opts.silhouette !== false) {
      for (const p of build.silhouette) {
        const g = p.geometry.clone();
        g.applyMatrix4(matrix);
        normalizeGeo(g);
        this._silhouettes.push({ geometry: g, material: p.material });
      }
    }
  }

  /** Register a raw collision box directly (invisible walls, arena floor). */
  _collide(geometry, surface, walkable = false) {
    const key = `${surface}|${walkable ? 1 : 0}`;
    let list = this._colliders.get(key);
    if (!list) { list = []; this._colliders.set(key, list); }
    list.push(geometry);
  }

  /** Get-or-create an instancing prototype. */
  _proto(key, builder, opts) {
    let p = this._protos.get(key);
    if (!p) {
      p = new InstancedProto(this.factory, builder(), Object.assign({ name: key }, opts));
      this._protos.set(key, p);
    }
    return p;
  }

  /** World matrix for a prop dropped on the ground at (x,z). */
  _ground(x, z, ry = 0, s = 1, lift = 0) {
    _m.makeRotationY(ry);
    _m.scale(_v.set(s, s, s));
    _m.setPosition(x, this.groundY(x, z) + lift, z);
    return _m.clone();
  }

  /** As `_ground`, but tilted onto the terrain normal — for stones and clutter. */
  _grounded(x, z, ry, s, lift, align = 0.7) {
    const m = this._ground(x, z, ry, s, lift);
    if (align > 0) {
      this.groundNormal(x, z, _v2);
      if (_v2.y < 0.999) {
        _v.set(0, 1, 0);
        const t = new Matrix4();
        const axis = new Vector3().crossVectors(_v, _v2);
        const len = axis.length();
        if (len > 1e-4) {
          axis.divideScalar(len);
          t.makeRotationAxis(axis, Math.asin(clamp(len, -1, 1)) * align);
          const pos = new Vector3().setFromMatrixPosition(m);
          m.premultiply(t);
          m.setPosition(pos);
        }
      }
    }
    return m;
  }

  // =====================================================================
  //  COMPOSITION
  // =====================================================================

  /**
   * The stair descends in four flights separated by landings, so the climb has a
   * beat in it and each flight stays a bite-sized build task.
   */
  _flights() {
    if (this._flightCache) return this._flightCache;
    const topZ = LAYOUT.stairTop;
    const yTop = this.groundY(0, topZ);
    const drop = Math.max(2.2, yTop - this.groundY(0, LAYOUT.stairBottom));
    const N = 4;
    const out = [];
    let y = yTop, z = topZ;
    for (let i = 0; i < N; i++) {
      const d = drop / N;
      const steps = Math.max(3, Math.round(d / 0.185));
      const fl = { z, y, drop: d, steps, width: 5.0 + i * 0.22, landing: i < N - 1 };
      out.push(fl);
      y -= d;
      z += steps * 0.38 + (fl.landing ? 2.4 : 0);
    }
    this._flightCache = out;
    return out;
  }

  _buildStairFlight(i, half) {
    const fl = this._flights()[i];
    const mid = Math.ceil(fl.steps / 2);
    const st = this.factory.stairs({
      width: fl.width, steps: fl.steps, rise: fl.drop / fl.steps, run: 0.38, wear: 1.2,
      material: 'stone', cheeks: i === 0 || i === 3, seed: 300 + i * 7,
      stepFrom: half === 0 ? 1 : mid + 1,
      stepTo: half === 0 ? mid : fl.steps,
    });
    _m.identity();
    _m.setPosition(0, fl.y - fl.drop, fl.z);
    this._emit(st, _m.clone());

    if (fl.landing && half === 1) {
      const zA = fl.z + fl.steps * 0.38;
      const y = fl.y - fl.drop;
      const g = new BoxGeometry(fl.width + 1.2, 0.34, 2.5);
      g.translate(0, y - 0.17, zA + 1.2);
      normalizeGeo(g);
      this._pushRaw(g, '__groundStone', 'static');
      this._collide(this._box(fl.width + 1.2, 0.34, 2.5, 0, y - 0.34, zA + 1.2), 'stone', true);
    }
  }

  _buildPath() {
    const topZ = LAYOUT.stairTop;
    // 参道 the gravel approach path from the stair head to the forecourt.
    const path = [];
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const z0 = lerp(LAYOUT.arena.z + LAYOUT.arena.hz, topZ, i / segs);
      const z1 = lerp(LAYOUT.arena.z + LAYOUT.arena.hz, topZ, (i + 1) / segs);
      const zc = (z0 + z1) * 0.5;
      const g = new BoxGeometry(5.6, 0.16, Math.abs(z1 - z0) + 0.05);
      g.translate(0, this.groundY(0, zc) + 0.05, zc);
      normalizeGeo(g);
      const k = 0.92 + this.rnd() * 0.14;
      this._tint(g, k, k * 0.99, k * 0.96);
      path.push({ g, zc });
    }
    for (const p of path) this._pushRaw(p.g, '__groundStone', 'static');
  }

  /** 玉砂利 the forecourt itself — flat, level, and the fight happens on it. */
  _buildForecourt() {
    const a = LAYOUT.arena;
    const g = new BoxGeometry(a.hx * 2 + 2.4, 0.18, a.hz * 2 + 2.4);
    g.translate(a.x, this.groundY(a.x, a.z) + 0.05, a.z);
    normalizeGeo(g);
    this._shade(g, (x, yy, z) => 0.92 + noise.fbm2(x * 0.35, z * 0.35, 3) * 0.12);
    this._pushRaw(g, '__groundStone', 'static');
    this._collide(this._box(a.hx * 2 + 2.4, 0.2, a.hz * 2 + 2.4, a.x, this.groundY(a.x, a.z) - 0.05, a.z), 'gravel', true);
  }

  _buildTorii(i) {
    const f = this.factory;
    const t = LAYOUT.torii[i];
    const build = f.torii({ height: t.height, span: t.span, seed: 700 + i * 13 });
    const y = this.groundY(0, t.z);
    _m.makeRotationY(0);
    _m.setPosition(0, y, t.z);
    this._emit(build, _m.clone());

    // 注連縄 strung under the nuki of the two larger gates.
    if (i >= 1) {
      const a = build.anchors;
      const span = Math.abs(a.ropeRight[0] - a.ropeLeft[0]);
      const rope = f.shimenawa({
        span: span * 0.98, sag: 0.10 * t.height, radius: 0.045 * t.height,
        shide: 5, seed: 900 + i,
      });
      _m.makeRotationY(0);
      _m.setPosition(0, y + a.ropeLeft[1], t.z + 0.02);
      this._emit(rope, _m.clone());
    }

    // 提灯 a pair hung inside the great gate. They sit close to the camera in the
    // god-ray shot and are the highlight the frame was missing there.
    if (i === LAYOUT.torii.length - 1) {
      const proto = this._proto('chochin', () => f.hangingLantern({}), { castShadow: false });
      const hangY = y + build.anchors.ropeLeft[1] - 0.34;
      for (const sx of [-1, 1]) {
        _m.makeRotationY((this.rnd() - 0.5) * 0.5);
        _m.scale(_v.set(1.35, 1.35, 1.35));
        _m.setPosition(sx * t.span * 0.30, hangY, t.z + 0.10);
        proto.place(_m, [1, 0.97 + this.rnd() * 0.06, 0.92 + this.rnd() * 0.1]);
      }
    }
  }

  /**
   * A hall is 80–110 ms of geometry in one call, so it goes in as four tasks.
   * `optsFn` returns `{ x, z, ry, hall }`; the anchors of the last stage are
   * stashed so follow-up tasks (hanging lanterns) can hang things off the eaves.
   */
  _hallTasks(T, label, optsFn) {
    const stages = [['frame'], ['walls'], ['brackets'], ['roof', 'silhouette']];
    for (const s of stages) {
      T(`${label} · ${s[0]}`, () => {
        const o = optsFn();
        const build = this.factory.hall(Object.assign({}, o.hall, { stages: s }));
        this._emit(build, this._ground(o.x, o.z, o.ry || 0));
        this._hallAnchors = this._hallAnchors || {};
        this._hallAnchors[label] = build.anchors;
      });
    }
  }

  _haidenOpts() {
    const L = LAYOUT.haiden;
    return {
      x: L.x, z: L.z, ry: 0,
      hall: {
        width: L.w, depth: L.d, floorY: L.floor, wallH: 3.3,
        veranda: 1.15, eaveOut: 2.05, rise: 3.5,
        roofMaterial: 'roofTile', wallMaterial: 'plaster',
        hip: 0.5, seed: 11, segX: 9, segZ: 6,
      },
    };
  }

  _hondenOpts() {
    const L = LAYOUT.honden;
    return {
      x: L.x, z: L.z, ry: 0,
      hall: {
        width: L.w, depth: L.d, floorY: L.floor, wallH: 2.8,
        veranda: 0.85, eaveOut: 1.85, rise: 3.2,
        roofMaterial: 'cedar', soffitMaterial: 'cedar', wallMaterial: 'plaster',
        hip: 0.42, seed: 23, segX: 7, segZ: 5,
      },
    };
  }

  _kaguraOpts() {
    const K = LAYOUT.kagura;
    return {
      x: K.x, z: K.z, ry: Math.PI * 0.5,
      hall: {
        width: K.w, depth: K.d, floorY: K.floor, wallH: 2.5, open: true,
        veranda: 0.7, eaveOut: 1.7, rise: 2.7, roofMaterial: 'cedar',
        hip: 0.6, shrineRidge: false, seed: 31, segX: 6, segZ: 5,
      },
    };
  }

  _shamushoOpts() {
    const S = LAYOUT.shamusho;
    return {
      x: S.x, z: S.z, ry: -Math.PI * 0.5,
      hall: {
        width: S.w, depth: S.d, floorY: S.floor, wallH: 2.5,
        veranda: 0.6, eaveOut: 1.35, rise: 2.2, roofMaterial: 'roofTile',
        hip: 0.28, shrineRidge: false, seed: 37, segX: 6, segZ: 4,
      },
    };
  }

  /** A row of chōchin under the haiden's front eave — the lit line that reads at dusk. */
  _buildHaidenLanterns() {
    const L = LAYOUT.haiden;
    const anchors = this._hallAnchors?.haiden;
    const eaveY = anchors ? anchors.eaveFront[1] : L.floor + 4.6;
    const proto = this._proto('chochin', () => this.factory.hangingLantern({}), { castShadow: false });
    const y = this.groundY(L.x, L.z) + eaveY - 0.15;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = lerp(-L.w * 0.42, L.w * 0.42, i / (n - 1));
      _m.makeRotationY((this.rnd() - 0.5) * 0.6);
      _m.setPosition(L.x + x, y, L.z + L.d * 0.5 + 1.55);
      proto.place(_m, [1, 0.96 + this.rnd() * 0.08, 0.9 + this.rnd() * 0.12]);
    }
    this._lightRequests.push({
      x: L.x, y: y - 0.7, z: L.z + L.d * 0.5 + 1.55,
      color: 0xffb060, intensity: 2.0, distance: 9, flicker: 0.5,
    });
  }

  /**
   * 玉垣 the inner fence that keeps you out of the sanctuary, gated on the axis.
   * One run per build task — a 50 m fence is ~260 individually swept slats.
   */
  _buildHondenFence(run) {
    const L = LAYOUT.honden;
    const fx = L.w * 0.5 + 2.6, fz0 = L.z - L.d * 0.5 - 2.4, fz1 = L.z + L.d * 0.5 + 2.6;
    const runs = [
      [[1.5, fz1], [fx, fz1]],
      [[fx, fz1], [fx, fz0]],
      [[fx, fz0], [-fx, fz0]],
      [[-fx, fz0], [-fx, fz1]],
      [[-fx, fz1], [-1.5, fz1]],
    ];
    if (!runs[run]) return;
    this._emit(this.factory.tamagaki({
      points: runs[run], height: 1.42, slatSpacing: 0.21, seed: 55 + run,
    }), this._ground(0, L.z, 0));
  }

  _buildBellTower() {
    const B = LAYOUT.bellTower;
    const build = this.factory.bellTower({ size: 4.4, floorY: 1.55, postH: 3.4, seed: 47 });
    const m = this._ground(B.x, B.z, -Math.PI * 0.25);
    this._emit(build, m);
    _v.set(build.anchors.bell[0], build.anchors.bell[1], build.anchors.bell[2]).applyMatrix4(m);
    this._bellPos = _v.clone();
  }

  _buildChozuya() {
    const C = LAYOUT.chozuya;
    const build = this.factory.chozuya({ width: 3.6, depth: 3.0, postH: 2.4, seed: 53 });
    const m = this._ground(C.x, C.z, Math.PI * 0.5);
    this._emit(build, m);
    _v.set(0, build.anchors.basin[1], 0).applyMatrix4(m);
    this._chozuyaPos = _v.clone();
  }

  _buildFences(part) {
    const f = this.factory;
    const a = LAYOUT.arena;
    // Low tamagaki down both sides of the forecourt: cover, and it keeps the
    // arena readable without walling the fight in. Bamboo flanks the approach.
    if (part === 0) {
      this._emit(f.tamagaki({
        points: [[-a.hx - 1.6, a.z - a.hz + 1.5], [-a.hx - 1.6, a.z + a.hz - 2.0]],
        height: 1.15, slatSpacing: 0.22, seed: 61,
      }), this._ground(a.x, a.z, 0));
    } else if (part === 1) {
      this._emit(f.tamagaki({
        points: [[a.hx + 1.6, a.z + a.hz - 1.0], [a.hx + 1.6, a.z - a.hz + 3.0]],
        height: 1.15, slatSpacing: 0.22, seed: 71,
      }), this._ground(a.x, a.z, 0));
    } else {
      const sx = part === 2 ? -1 : 1;
      this._emit(f.bambooFence({
        points: [[sx * 4.6, 66.0], [sx * 4.6, 40.0]],
        height: 1.45, seed: 67 + part,
      }), this._ground(0, 53, 0));
    }
  }

  _buildOverlook() {
    const O = LAYOUT.overlook;
    const y = this.groundY(O.x, O.z);
    // A stone terrace stepping out toward the valley, railed at the lip.
    const terrace = new BoxGeometry(9.0, 0.5, 7.0);
    terrace.translate(O.x, y + 0.08, O.z);
    normalizeGeo(terrace);
    this._shade(terrace, (x, yy, z) => 0.9 + noise.fbm2(x * 0.6, z * 0.6, 3) * 0.14);
    this._pushRaw(terrace, 'stone', 'static');
    this._collide(this._box(9.0, 0.5, 7.0, O.x, y - 0.17, O.z), 'stone', true);

    const rail = this.factory.tamagaki({
      points: [[-4.2, 3.2], [4.2, 3.2], [4.2, -3.2]],
      height: 1.05, slatSpacing: 0.26, seed: 79,
    });
    this._emit(rail, this._ground(O.x, O.z, Math.PI * 0.25, 1, 0.33));

    // A bench and a pair of lanterns framing the valley view.
    const bench = new BoxGeometry(2.2, 0.14, 0.44);
    bench.translate(O.x - 1.4, y + 0.83, O.z - 1.6);
    normalizeGeo(bench);
    this._pushRaw(bench, 'cedar', 'clutter');
    for (const sx of [-1, 1]) {
      const leg = new BoxGeometry(0.16, 0.42, 0.38);
      leg.translate(O.x - 1.4 + sx * 0.85, y + 0.55, O.z - 1.6);
      normalizeGeo(leg);
      this._pushRaw(leg, 'cedar', 'clutter');
    }
    this._collide(this._box(2.2, 0.5, 0.5, O.x - 1.4, y + 0.4, O.z - 1.6), 'wood');
  }

  _buildBridge() {
    const B = LAYOUT.bridge;
    const dir = Math.atan2(LAYOUT.overlook.x - LAYOUT.arena.hx, LAYOUT.overlook.z - LAYOUT.arena.z);
    const y = this.groundY(B.x, B.z);
    const build = this.factory.bridge({
      span: 7.5, width: 2.3, camber: 0.8, dropL: 1.9, dropR: 1.9, seed: 83,
    });
    _m.makeRotationY(dir);
    _m.setPosition(B.x, y + 0.55, B.z);
    this._emit(build, _m.clone());
  }

  _buildTrees() {
    const f = this.factory;
    const S = LAYOUT.sacredTree;
    // The sacred tree is pinned to full depth on every tier. It is one tree, its
    // crown has to read as *in bloom* at thumbnail size, and the whole thing is
    // ~4.3k triangles — tier-gating it only ever bought back noise.
    const tree = f.sacredTree({ height: S.height, depth: 5, seed: 1861, leafy: true });
    const m = this._ground(S.x, S.z, 0.4);
    this._emit(tree, m);
    // The rope is tied round the trunk at chest height, not draped over a branch.
    const girth = tree.anchors.girth[0];
    const rope = f.shimenawa({ span: girth * 2.9, sag: 0.16, radius: 0.13, shide: 4, seed: 1862 });
    _m.makeRotationY(0.4);
    _m.setPosition(S.x, this.groundY(S.x, S.z) + tree.anchors.girth[1], S.z + girth * 0.9);
    this._emit(rope, _m.clone());

    const D = LAYOUT.deadTree;
    this._emit(f.sacredTree({
      height: D.height, depth: Math.max(3, this._treeDepth - 1), seed: 1877, leafy: false,
    }), this._ground(D.x, D.z, -1.1));
  }

  _buildLanterns() {
    const build = this.factory.stoneLantern({ height: 2.05, seed: 91 });
    const fireY = build.anchors.fire ? build.anchors.fire[1] : 1.6;
    const fireLight = build.lights[0];
    const proto = this._proto('lantern', () => build);
    // The spill is a second prototype on purpose. The stone can lean and sink into
    // its footing; its pool must remain horizontal and sit on the visible path,
    // forecourt or terrain surface. It replaces the old embedded part one-for-one,
    // so this correction adds neither a draw call nor submitted triangles.
    const pool = this._proto('lantern-pool', () => this.factory.groundLightPool(), {
      castShadow: false, receiveShadow: false,
    });
    // Keep light variation independent from both the shared world stream and the
    // stone-weathering stream. The same seed reproduces review frames, while size,
    // stretch and strength no longer stamp one identical disc down the whole sandō.
    const poolVary = makeRandom(0x1a117e55);
    // A private stream for the lean and the weathering. `this.rnd` is shared and every
    // prop placed after this one indexes off it, so taking extra numbers out of it here
    // would reshuffle the whole forecourt; a local stream buys the variation for free
    // and keeps this function's draw count on the shared stream exactly where it was.
    const vary = makeRandom(0x10ee5a17);
    const place = (x, z, s) => {
      const y = this.groundY(x, z);
      // A third of them have settled. Two to five degrees is what a granite tōrō does
      // over a century on soft ground — enough to read as an object with a history at
      // contact-sheet size, small enough that it never looks knocked over. Sinking it
      // by half its base half-width times the lean keeps the low corner in the dirt
      // instead of hanging the plinth off one edge.
      const lean = vary() < 0.34 ? 0.035 + vary() * 0.055 : 0.0;
      const leanDir = vary() * Math.PI * 2;
      const yaw = this.rnd() * Math.PI * 2;
      _m.makeRotationY(yaw);
      if (lean > 0) {
        _m2.makeRotationAxis(_v2.set(Math.cos(leanDir), 0, Math.sin(leanDir)), lean);
        _m.premultiply(_m2);
      }
      _m.scale(_v.set(s, s, s));
      _m.setPosition(x, y - 0.04 - lean * 0.45 * s, z);
      // Quarry variation is a *value* shift, not a warm one. The old tint took
      // up to 6% off blue on every single lantern and never added any back, so
      // twenty-six of them leaned the same way at once — under an amber key that
      // is the difference between dressed granite and sandstone, and it is a
      // large part of why these read as pale sandy clay. Half the stones now lean
      // warm and half lean cool, and neither by much.
      //
      // Three draws, deliberately: `this.rnd` is one shared stream and every
      // prop placed after this one indexes off it, so changing how many numbers
      // a lantern consumes reshuffles the whole forecourt.
      const k = 0.88 + this.rnd() * 0.24;
      const warm = (this.rnd() - 0.5) * 0.075;
      const val = 0.985 + this.rnd() * 0.03;
      // One in four is under moss and lichen on its north face and has not been
      // scrubbed in a generation. A quarry shift of ±12% is a difference you can only
      // find by measuring; this one is visible at contact-sheet size, which is the
      // whole complaint — twenty-six stones weathered identically read as one stone
      // stamped twenty-six times. Off the private stream, so no draw count moves.
      const moss = vary() < 0.26 ? 1.0 : 0.0;
      const wr = 1.0 - moss * 0.30, wg = 1.0 - moss * 0.19, wb = 1.0 - moss * 0.34;
      proto.place(_m, [k * (1 + warm) * wr, k * val * wg, k * (1 - warm) * wb]);
      const poolSize = 0.88 + poolVary() * 0.24;
      const poolStretch = (poolVary() - 0.5) * 0.18;
      const poolStrength = 0.86 + poolVary() * 0.22;
      const poolWarmth = (poolVary() - 0.5) * 0.08;
      _m2.makeRotationY(yaw);
      _m2.scale(_v.set(
        s * poolSize * (1 + poolStretch),
        s,
        s * poolSize * (1 - poolStretch),
      ));
      _m2.setPosition(x, this._lanternSpillY(x, z), z);
      pool.place(_m2, [
        poolStrength * (1 + poolWarmth),
        poolStrength,
        poolStrength * (1 - poolWarmth * 0.35),
      ]);
      // Instanced props never pass through `_emit`, so hoist their flame here.
      if (fireLight) {
        this._lightRequests.push({
          x, y: y + fireY * s, z,
          color: fireLight.color, intensity: fireLight.intensity * s,
          distance: fireLight.distance * s, flicker: fireLight.flicker,
        });
      }
    };
    // A pair flanking every gate. This is how a real sandō is lit, and it is also
    // where the camera is: each of the axis shots looks through a torii, so a lit
    // aperture close to the lens is the frame's brightest thing by a wide margin.
    for (const t of LAYOUT.torii) {
      for (const sx of [-1, 1]) place(sx * (t.span * 0.5 + 1.25), t.z + 1.1, 1.12 + this.rnd() * 0.1);
    }
    // Down the approach. It used to be `z += 6.2` with ±0.4 m of jitter — a constant
    // pitch to within ±6.5%, the two sides in lockstep, every post the same height to
    // within ±8%. A sandō is not surveyed: posts go where a donor paid for one and
    // where the ground will take one, so the gaps run 4.0–8.6 m (measured: ±28.7% and
    // ±31.2% about each side's own mean) and the two sides do not line up with each
    // other. The pitch comes off the private stream; the two shared draws per lantern
    // stay exactly where they were, one now spending itself on an outward lateral
    // offset instead of on the pitch and the other on a wider height range — 0.80–1.24
    // against 0.92–1.08, so ±22% of height instead of ±8%. Outward only, because inward
    // is where the gate lanterns and the nobori already are, and the closest pair in
    // the old layout was 1.05 m: this cannot shorten it.
    const rowZ = [0, 1].map(() => {
      let z = 39.2 + vary() * 1.6;
      const out = [];
      for (let i = 0; i < 5; i++) { out.push(Math.min(z, 69.4)); z += 4.0 + vary() * 4.6; }
      return out;
    });
    for (let i = 0; i < 5; i++) {
      for (let si = 0; si < 2; si++) {
        place((si ? 1 : -1) * (5.4 + this.rnd() * 0.9), rowZ[si][i], 0.80 + this.rnd() * 0.44);
      }
    }
    const a = LAYOUT.arena;
    for (const [x, z] of [
      [-a.hx + 0.9, a.z - a.hz + 1.2], [a.hx - 0.9, a.z - a.hz + 1.2],
      [-a.hx + 0.9, a.z + a.hz - 1.2], [a.hx - 0.9, a.z + a.hz - 1.2],
      [-6.5, 15.0], [6.5, 15.0],
    ]) place(x, z, 1.0 + this.rnd() * 0.18);
    // Flanking the honden gate.
    for (const sx of [-1, 1]) place(sx * 3.4, 2.2, 1.12);
  }

  /**
   * Visible surface under a lantern's baked spill. The forecourt is one level
   * slab, while the sandō is nine independently levelled boxes; using terrain Y
   * alone put their old embedded discs below both surfaces. Raw-ground pools get
   * 12 mm of clearance to avoid z-fighting without visibly hovering.
   */
  _lanternSpillY(x, z) {
    const a = LAYOUT.arena;
    if (Math.abs(x - a.x) <= a.hx + 1.2 && Math.abs(z - a.z) <= a.hz + 1.2) {
      return this.groundY(a.x, a.z) + 0.14 + 0.006;
    }

    const pathStart = a.z + a.hz;
    const pathEnd = LAYOUT.stairTop;
    if (Math.abs(x) <= 2.8 && z >= pathStart && z <= pathEnd) {
      const segs = 9;
      const u = clamp((z - pathStart) / (pathEnd - pathStart), 0, 1 - Number.EPSILON);
      const i = Math.min(segs - 1, Math.floor(u * segs));
      const z0 = lerp(pathStart, pathEnd, i / segs);
      const z1 = lerp(pathStart, pathEnd, (i + 1) / segs);
      return this.groundY(0, (z0 + z1) * 0.5) + 0.13 + 0.006;
    }

    return this.groundY(x, z) + 0.012;
  }

  _buildBanners() {
    const crimson = this._proto('nobori-c', () => this.factory.nobori({ material: 'clothCrimson', seed: 121 }), { castShadow: false });
    const indigo = this._proto('nobori-i', () => this.factory.nobori({ material: 'clothIndigo', seed: 122 }), { castShadow: false });
    const place = (x, z, ry, alt) => {
      _m.makeRotationY(ry);
      _m.setPosition(x, this.groundY(x, z), z);
      const p = alt ? indigo : crimson;
      const k = 0.9 + this.rnd() * 0.2;
      p.place(_m, [k, k, k]);
    };
    // Cleared off the lanterns. A nobori is a 0.62 x 2.5 m sheet hung from a
    // crossarm at 3.5 m and it swings with the wind field, so it needs more than a
    // prop's own radius of clearance from anything with a roof on it. It did not
    // have it: the gate lanterns sit at |x| = span/2 + 1.25, z = t.z + 1.1 and stand
    // 2.3 m to a kasa that overhangs its shaft by a good half metre, and the banner
    // pole was 0.65 m outboard and 1.5 m forward of that with its cloth swinging into
    // the gap — which is the intersection round 8 found in 'torii'. The arena pair
    // was worse: 0.30 m in x and 0.60 m in z from the corner lanterns. 1.30 m and
    // 1.15 m of clearance at the gates, 1.50 m and 1.30 m at the arena.
    let alt = false;
    for (const t of LAYOUT.torii) {
      for (const sx of [-1, 1]) {
        place(sx * (t.span * 0.5 + 2.55), t.z - 1.15, sx > 0 ? -Math.PI / 2 : Math.PI / 2, alt);
      }
      alt = !alt;
    }
    const a = LAYOUT.arena;
    for (const sx of [-1, 1]) {
      place(sx * (a.hx - 2.4), a.z + a.hz - 0.6, sx > 0 ? -Math.PI / 2 : Math.PI / 2, true);
      place(sx * (a.hx - 2.4), a.z - a.hz + 2.7, sx > 0 ? -Math.PI / 2 : Math.PI / 2, false);
    }
  }

  _buildVotives() {
    const f = this.factory;
    const E = LAYOUT.emaRack;
    const rack = f.emaRack({ width: 3.2, height: 1.9 });
    this._emit(rack, this._ground(E.x, E.z, -Math.PI * 0.5));

    const ema = this._proto('ema', () => f.emaPlaque({ seed: 131 }), { castShadow: false });
    const yBase = this.groundY(E.x, E.z);
    const count = Math.round(34 * this._density);
    for (let i = 0; i < count; i++) {
      const row = i % 2;
      const t = ((i / 2) | 0) / Math.max(1, (count / 2 - 1));
      const off = lerp(-1.45, 1.45, t) + (this.rnd() - 0.5) * 0.06;
      const y = yBase + (row === 0 ? 1.76 : 1.03) - this.rnd() * 0.02;
      _m.makeRotationY(-Math.PI * 0.5 + (this.rnd() - 0.5) * 0.5);
      _m.setPosition(E.x, y, E.z + off);
      const k = 0.9 + this.rnd() * 0.2;
      ema.place(_m, [k, k * (0.96 + this.rnd() * 0.08), k * (0.9 + this.rnd() * 0.12)]);
    }
    _v.set(E.x, yBase + 1.4, E.z);
    this._emaPos = _v.clone();

    const O = LAYOUT.omikujiRack;
    this._emit(f.omikujiRack({
      width: 2.8, height: 1.7, rows: 3, density: clamp(this._density, 0.35, 1), seed: 88,
    }), this._ground(O.x, O.z, Math.PI * 0.5));
  }

  _buildClutter() {
    const f = this.factory;
    const S = LAYOUT.shamusho;

    // 菰樽 the stacked sake-cask wall — the one hit of saturated colour up here.
    const cask = this._proto('cask', () => f.sakeCask({ seed: 141 }));
    const C = LAYOUT.caskWall;
    const rows = 3, per = 7;
    for (let r = 0; r < rows; r++) {
      const n = per - r;
      for (let i = 0; i < n; i++) {
        const z = lerp(-(n - 1) * 0.27, (n - 1) * 0.27, n === 1 ? 0.5 : i / (n - 1));
        const y = this.groundY(C.x, C.z + z) + r * 0.60;
        _m.makeRotationY(Math.PI * 0.5 + (this.rnd() - 0.5) * 0.12);
        _m.setPosition(C.x + (this.rnd() - 0.5) * 0.03, y, C.z + z);
        const k = 0.9 + this.rnd() * 0.2;
        cask.place(_m, [k, k, k]);
      }
    }
    this._collide(this._box(0.7, rows * 0.6, per * 0.56, C.x, this.groundY(C.x, C.z), C.z), 'wood');

    const barrel = this._proto('barrel', () => f.barrel({ seed: 143 }));
    const crate = this._proto('crate', () => f.crate({ seed: 147 }));
    const bale = this._proto('bale', () => f.strawBale({ seed: 149 }));
    const bucket = this._proto('bucket', () => f.bucket({}), { castShadow: false });
    const coil = this._proto('coil', () => f.ropeCoil({}), { castShadow: false });

    const drop = (proto, x, z, ry, s = 1) => {
      _m.makeRotationY(ry);
      _m.scale(_v.set(s, s, s));
      _m.setPosition(x, this.groundY(x, z), z);
      const k = 0.88 + this.rnd() * 0.26;
      proto.place(_m, [k, k * (0.97 + this.rnd() * 0.06), k * (0.93 + this.rnd() * 0.1)]);
    };

    // The service yard behind the shamusho.
    drop(barrel, S.x - 3.0, S.z - 3.6, 0.4);
    drop(barrel, S.x - 3.6, S.z - 2.9, 1.7, 0.92);
    drop(crate, S.x - 2.0, S.z - 4.2, 0.9);
    drop(crate, S.x - 2.4, S.z - 4.0, 2.2, 0.86);
    drop(bale, S.x + 2.4, S.z - 3.4, 0.3);
    drop(bale, S.x + 2.7, S.z - 2.6, 1.9, 0.94);
    drop(bucket, S.x - 4.2, S.z + 1.2, 0.7);
    drop(coil, S.x - 3.8, S.z + 1.9, 0.0);

    this._emit(f.woodpile({ width: 2.4, rows: 4, seed: 151 }),
      this._ground(S.x + 3.2, S.z + 4.6, -Math.PI * 0.5), { layer: 'clutter' });

    // Around the chōzuya: buckets, a coil, a broom leaning on a post.
    const Cz = LAYOUT.chozuya;
    drop(bucket, Cz.x + 2.6, Cz.z + 1.5, 1.2);
    drop(bucket, Cz.x + 2.9, Cz.z + 1.0, 2.4, 0.9);
    drop(coil, Cz.x - 2.4, Cz.z - 1.6, 0.5);
    {
      const broom = f.broom({ height: 1.45, seed: 153 });
      _m.makeRotationY(0.6);
      const bm = new Matrix4().makeRotationX(0.22).premultiply(_m);
      bm.setPosition(Cz.x + 2.2, this.groundY(Cz.x + 2.2, Cz.z - 1.5), Cz.z - 1.5);
      this._emit(broom, bm, { layer: 'clutter' });
    }

    // A few barrels and crates at the forecourt edge, doubling as arena cover.
    const a = LAYOUT.arena;
    drop(barrel, a.hx - 2.4, a.z + a.hz - 3.0, 0.8);
    drop(crate, a.hx - 3.1, a.z + a.hz - 3.4, 2.1);
    drop(bale, -a.hx + 2.6, a.z - a.hz + 2.4, 1.1);
  }

  _buildRoadside() {
    const f = this.factory;
    const jizo = this._proto('jizo', () => f.jizo({ height: 0.78, seed: 99 }));
    for (let i = 0; i < 5; i++) {
      const z = 47 + i * 3.4;
      const x = -8.6 - noise.noise2(i * 3.1, 0.5) * 0.5;
      _m.makeRotationY(Math.PI + (this.rnd() - 0.5) * 0.5);
      _m.scale(_v.set(1, 1, 1).multiplyScalar(0.9 + this.rnd() * 0.24));
      _m.setPosition(x, this.groundY(x, z) - 0.02, z);
      const k = 0.86 + this.rnd() * 0.26;
      jizo.place(_m, [k, k * (0.99 + this.rnd() * 0.04), k * (0.95 + this.rnd() * 0.07)]);
    }

    const cairn = this._proto('cairn', () => f.prayerStones({ count: 6, radius: 0.34, seed: 66 }));
    const a = LAYOUT.arena;
    const spots = [
      [-a.hx + 3.2, a.z + 3.4], [a.hx - 3.6, a.z - 4.2],
      [-a.hx + 2.0, a.z - 6.0], [a.hx - 2.2, a.z + 6.4],
      [-16.0, 42.0], [15.0, 48.0], [-19.0, 56.0], [11.5, 60.0],
    ];
    for (const [x, z] of spots) {
      // Cairns sit *on* the ground, so they lean with it.
      const m = this._grounded(x, z, this.rnd() * Math.PI * 2, 0.82 + this.rnd() * 0.5, -0.03, 0.8);
      const k = 0.85 + this.rnd() * 0.3;
      cairn.place(m, [k, k, k * 0.98]);
    }
  }

  _buildLeaves() {
    const proto = this._proto('leaves', () => this.factory.fallenLeaves({ count: 5, seed: 71 }),
      { castShadow: false, receiveShadow: true, cullDistance: 1 });
    const n = Math.round(340 * this._density);
    for (let i = 0; i < n; i++) {
      // Drifts pile against the edges of paved ground, not in the middle of it.
      const a = this.rnd() * Math.PI * 2;
      const r = 8 + Math.pow(this.rnd(), 0.6) * 52;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r + 22;
      if (!inPlayable(x, z, -6)) continue;
      if (Math.hypot(x, z - 12) > 66) continue;
      // Leaves lie flat on whatever they landed on — fully normal-aligned.
      const m = this._grounded(x, z, this.rnd() * Math.PI * 2, 0.7 + this.rnd() * 0.8, 0.012, 1.0);
      const k = 0.75 + this.rnd() * 0.5;
      proto.place(m, [k, k * (0.92 + this.rnd() * 0.18), k * 0.85]);
    }
  }

  /**
   * Guard rails: the fenced playable square, plus a ring at the plateau lip with
   * a gap where the approach stair comes up. Invisible, but they are the only
   * thing between the player and a 30 m fall on a mistimed dodge.
   */
  _buildBoundary() {
    const half = WORLD.PLAYABLE * 0.5;
    const y = WORLD.PLATEAU_HEIGHT;
    for (const [x, z, w, d] of [
      [0, half, WORLD.PLAYABLE, 1], [0, -half, WORLD.PLAYABLE, 1],
      [half, 0, 1, WORLD.PLAYABLE], [-half, 0, 1, WORLD.PLAYABLE],
    ]) {
      this._collide(this._box(w, 40, d, x, y - 12, z), 'stone');
    }

    const R = LAYOUT.rimRadius;
    const segs = 56;
    const gap = (LAYOUT.approachGapDeg * Math.PI) / 180;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      // Azimuth 0 is +Z, the approach; leave that arc open for the stair.
      const rel = Math.atan2(Math.sin(a0), Math.cos(a0));
      if (Math.abs(rel) < gap) continue;
      const x = Math.sin(a0) * R;
      const z = Math.cos(a0) * R;
      const g = new BoxGeometry(0.8, 6, (2 * Math.PI * R) / segs + 0.6);
      const m = new Matrix4().makeRotationY(a0);
      m.setPosition(x, this.groundY(x, z) + 1.4, z);
      g.applyMatrix4(m);
      g.deleteAttribute('uv'); g.deleteAttribute('normal');
      this._collide(g, 'stone');
    }
  }

  // ------------------------------------------------------------- raw helpers

  _box(w, h, d, x, y, z) {
    const g = new BoxGeometry(w, h, d);
    g.translate(x, y + h * 0.5, z);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    return g;
  }

  _pushRaw(geometry, material, layer = 'static') {
    normalizeGeo(geometry, CLOTH_MATERIALS.has(material));
    geometry.computeBoundingSphere();
    const c = geometry.boundingSphere;
    const key = this._cellKey(layer, c ? c.center.x : 0, c ? c.center.z : 0, material);
    let list = this._buckets.get(key);
    if (!list) { list = []; this._buckets.set(key, list); }
    list.push(geometry);
  }

  _tint(geo, r, g, b) {
    normalizeGeo(geo);
    const col = geo.getAttribute('color');
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * r, col.getY(i) * g, col.getZ(i) * b);
    return geo;
  }

  _shade(geo, fn) {
    normalizeGeo(geo);
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    for (let i = 0; i < col.count; i++) {
      const k = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
      col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
    }
    return geo;
  }

  // =====================================================================
  //  REALIZE
  // =====================================================================

  /**
   * An `InstancedMesh` is a draw call whether it carries three copies or three
   * hundred, and it is a second and third one per shadow cascade if it casts.
   * Nine of the fourteen prototypes here place eight instances or fewer — three
   * crates, two rope coils, five jizō, a barrel in the service yard — and between
   * them they were costing 27 draw calls at the round-7 `torii` pose for 6,800
   * triangles. Stamped into the merged statics instead they cost none of their own:
   * the triangles are identical (an instanced draw already submits count × tris),
   * the cell bucket that receives them is already being drawn, and the per-cell
   * shadow proxy absorbs their casting.
   *
   * The cut-off is deliberately low. A prototype that repeats twenty-four times —
   * the stone lanterns, the ema boards, the cask wall — is exactly what instancing
   * is for and is left alone.
   */
  _bakeSmallInstances() {
    const MAX_INSTANCES = 8;
    const MAX_TRIS = 3000;                  // total across every instance and part
    let baked = 0, tris = 0;
    for (const [key, proto] of [...this._protos]) {
      const n = proto.entries?.length | 0;
      if (!n || n > MAX_INSTANCES) continue;
      let per = 0;
      for (const p of proto.build.parts) per += (p.geometry.index ? p.geometry.index.count : 0) / 3;
      if (per * n > MAX_TRIS) continue;
      for (const e of proto.entries) {
        this._emit(proto.build, e.m, { clone: true, tint: e.t || undefined, partsOnly: true });
      }
      this._protos.delete(key);
      baked += proto.build.parts.length;
      tris += per * n;
    }
    this.stats.bakedInstances = baked;
    this.stats.bakedTriangles = Math.round(tris);
  }

  /**
   * Spatial cells only pay for themselves when there is enough geometry in them
   * to be worth culling. A material that totals a few hundred triangles across
   * the whole shrine — the gold plaques, the copper ridge caps — is cheaper as
   * one draw call than as four cullable ones.
   */
  _collapseSmallBuckets() {
    // Raised from 4,200 once `_bakeSmallInstances` started feeding these buckets.
    // The four materials between the old ceiling and this one — rope at 4,492
    // triangles over three cells, cedarBeam at 9,476 over three, vermilion at
    // 10,808 over two, bambooCulm at 9,540 over two — were paying ten draw calls
    // to cull 34k triangles that are all inside the same 80 m shrine and almost
    // always in frame together. §7 counts calls, and this trades the right one.
    const THRESHOLD = 12000;                // triangles, per layer+material
    const totals = new Map();
    for (const [key, list] of this._buckets) {
      if (!list) continue;
      const [layer, , , material] = key.split('|');
      const id = `${layer}|${material}`;
      let t = totals.get(id) || 0;
      for (const g of list) t += g.index ? g.index.count / 3 : 0;
      totals.set(id, t);
    }
    const moves = [];
    for (const [key, list] of this._buckets) {
      if (!list) continue;
      const [layer, , , material] = key.split('|');
      if ((totals.get(`${layer}|${material}`) || 0) > THRESHOLD) continue;
      moves.push([key, `${layer}|0|0|${material}`, list]);
    }
    for (const [from, to, list] of moves) {
      if (from === to) continue;
      this._buckets.delete(from);
      let dst = this._buckets.get(to);
      if (!dst) { dst = []; this._buckets.set(to, dst); }
      for (const g of list) dst.push(g);
    }
  }

  _materialFor(name) { return this.factory.specialMaterial(name); }

  _realizeBucket(key) {
    const list = this._buckets.get(key);
    if (!list || !list.length) return;
    const [layer, cx, cz, material] = key.split('|');
    let geo;
    try {
      geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
    } catch (err) {
      console.error(`[level] merge failed for ${key}`, err);
      return;
    }
    if (!geo) return;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    const mat = this._materialFor(material);
    const mesh = new Mesh(geo, mat);
    mesh.name = `level:${layer}:${cx},${cz}:${material}`;
    // Shadow casting is decided later, in `_realizeShadowProxies` — everything
    // opaque hands its silhouette to a per-cell proxy instead of casting itself.
    mesh.castShadow = false;
    mesh.receiveShadow = material !== '__ember' && material !== '__glowPool';
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = true;
    this.root.add(mesh);

    const s = geo.boundingSphere || new Sphere();
    this.cells.push({
      mesh, layer, material, cx, cz,
      x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius,
    });
    this._buckets.set(key, null);
  }

  /**
   * One merged depth proxy per spatial cell, so the shadow pass stops paying for
   * the colour pass's material split.
   *
   * The merge has to be per material for colour, which made chunk `0,0` alone
   * thirteen shadow casters for one lump of geometry — measured at 54 casters ×
   * 2 cascades = 102 of a 204-call phone frame. A depth-only pass does not care
   * about material except where alpha test changes the silhouette, so all the
   * opaque geometry in a cell collapses into one caster.
   *
   * **The proxy cannot be `visible = false`.** Verified against three r180 rather
   * than assumed: `WebGLShadowMap.renderObject` bails on `object.visible === false`
   * (line 344) *and* on `material.visible === false` (line 380), and the colour
   * pass tests the same `camera.layers` the shadow pass does, so layers cannot
   * separate them either. A shadow-only object does not exist in stock three. The
   * proxy is therefore submitted to both passes and made free in the colour one:
   * no colour write, no depth write, no depth test, drawn first. That costs one
   * trivially-shaded draw per cell and saves two shadow draws per material per
   * cell.
   *
   * Alpha-tested surfaces (paper, blossom) keep casting for themselves — their
   * cutout is their silhouette and folding them into an opaque proxy would put
   * the whole quad back into the shadow map.
   */
  _realizeShadowProxies() {
    const NEVER_CASTS = new Set(['__ember', '__glowPool', '__water']);
    const byCell = new Map();

    for (const c of this.cells) {
      if (c.layer === 'proxy') continue;
      if (NEVER_CASTS.has(c.material)) { c.mesh.castShadow = false; continue; }
      const mat = c.mesh.material;
      if (mat && mat.alphaTest > 0) { c.mesh.castShadow = true; continue; }
      c.mesh.castShadow = false;
      // A coarser grid than the colour cells: proxies exist to be few, and a
      // cascade frustum is tens of metres across, so splitting them at the
      // colour cell size just buys back the draw calls this is meant to remove.
      const px = Math.floor((c.x + SHADOW_ORIGIN) / SHADOW_CELL);
      const pz = Math.floor((c.z + SHADOW_ORIGIN) / SHADOW_CELL);
      const key = `${px}|${pz}`;
      let list = byCell.get(key);
      if (!list) { list = []; byCell.set(key, list); }
      // Position + index only, sharing the live attribute objects: merging reads
      // them and writes fresh arrays, so this adds one position buffer per cell
      // and nothing else. The wrappers are never rendered and never disposed —
      // disposing one would free the GPU buffer its source is still using.
      const src = c.mesh.geometry;
      const wrap = new BufferGeometry();
      wrap.setAttribute('position', src.getAttribute('position'));
      wrap.setIndex(src.getIndex());
      list.push(wrap);
    }

    for (const [key, list] of byCell) {
      if (!list.length) continue;
      const [cx, cz] = key.split('|');
      let geo;
      // Always merge, even a single entry: that copies the arrays out of the
      // wrapper. Handing the wrapper straight to a Mesh would leave the proxy
      // sharing BufferAttributes with a live colour mesh, and disposing one
      // would free the GPU buffers the other is still drawing from.
      try { geo = mergeGeometries(list, false); }
      catch (err) { console.error(`[level] shadow proxy merge failed for ${key}`, err); continue; }
      if (!geo) continue;
      geo.computeBoundingSphere();

      const mesh = new Mesh(geo, this.factory.shadowProxyMaterial);
      mesh.name = `level:proxy:${cx},${cz}`;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = true;
      mesh.renderOrder = 9000;          // after the scene, so early-Z kills it
      this.root.add(mesh);

      const s = geo.boundingSphere || new Sphere();
      this.cells.push({
        mesh, layer: 'proxy', material: '__shadowProxy', cx, cz,
        x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius,
      });
    }
  }

  _realizeSilhouette() {
    if (!this._silhouettes.length) return;
    const byMat = new Map();
    for (const s of this._silhouettes) {
      let l = byMat.get(s.material);
      if (!l) { l = []; byMat.set(s.material, l); }
      l.push(s.geometry);
    }
    const geos = [];
    // One material for the far LOD: it is a silhouette, nothing more.
    for (const [, l] of byMat) for (const g of l) geos.push(g);
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, this._materialFor('cedar'));
    mesh.name = 'level:far-silhouette';
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.root.add(mesh);
    this.farMesh = mesh;
    this._silhouettes.length = 0;
  }

  _realizeInstances() {
    for (const [key, proto] of this._protos) {
      const meshes = proto.realize(this.rnd);
      for (const m of meshes) this.root.add(m);
      if (!meshes.length) continue;
      const s = meshes[0].boundingSphere || new Sphere();
      this.instances.push({
        key, proto, meshes, full: proto.count,
        cull: proto.cullDistance > 0,
        x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius,
      });
    }
  }

  _realizePhysics() {
    const phys = this.ctx?.physics;
    if (!phys?.addStatic) return;
    const layerId = phys.LAYER?.STATIC ?? phys.LAYER?.WORLD ?? undefined;
    for (const [key, list] of this._colliders) {
      if (!list || !list.length) continue;
      const [surface, walkable] = key.split('|');
      let geo;
      try {
        geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      } catch (err) {
        console.error(`[level] collider merge failed for ${key}`, err);
        continue;
      }
      if (!geo) continue;
      geo.computeBoundingSphere();
      try {
        phys.addStatic({
          type: 'triangleMesh',
          geometry: geo,
          matrix: new Matrix4(),
          surface,
          walkable: walkable === '1',
          layer: layerId,
        });
      } catch (err) {
        console.error('[level] physics.addStatic rejected a collider', err);
      }
    }
    this._colliders.clear();
  }

  /**
   * Lantern illumination is emissive, not lit.
   *
   * `Lighting.requestLight(pos, color, intensity, radius, ttl)` is a **transient
   * spark pool**: a handful of slots shared with combat impacts, a `(1-u)²`
   * envelope across a 0.35 s default ttl, and a steal-the-oldest allocator. It is
   * the right API for a parry flash and the wrong one for a lantern that has to
   * stand still and burn for the whole level — a granted light would fade out
   * inside half a second, and holding a dozen of them alive would starve the pool
   * that hit sparks depend on.
   *
   * So the lanterns carry their own radiance instead: an HDR emissive core behind
   * a lit-paper liner (`EMISSIVE.flame` / `EMISSIVE.paper`), plus a baked spill
   * disc on the flagstone (`EMISSIVE.pool`, deliberately under the bloom
   * threshold). The requests are still collected during the build so that a future
   * persistent-light API has something to consume; on tiers that can afford it we
   * simply keep the list.
   */
  _realizeLights() {
    const a = LAYOUT.arena;
    this._lightRequests.sort((p, q) =>
      (Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z)));
    this.propLights = this._lightRequests.slice(0, Math.max(0, this._maxPropLights));
    this._lightRequests.length = 0;
  }

  _countStats() {
    let calls = 0, tris = 0;
    for (const c of this.cells) {
      calls++;
      const idx = c.mesh.geometry.index;
      tris += idx ? idx.count / 3 : 0;
    }
    for (const inst of this.instances) {
      calls += inst.meshes.length;
      for (const m of inst.meshes) {
        const idx = m.geometry.index;
        tris += (idx ? idx.count / 3 : 0) * m.count;
      }
    }
    this.stats.drawCalls = calls;
    this.stats.triangles = Math.round(tris);
    this.stats.cells = this.cells.length;
    this.stats.instances = this.instances.length;
    if (this.ctx?.debug) console.info('[level] built', this.stats);
  }

  // =====================================================================
  //  SPAWNS / ZONES / INTERACTABLES
  // =====================================================================

  /** Yaw such that a −Z-forward entity at (x,z) looks at (tx,tz). */
  _faceYaw(x, z, tx, tz) {
    return Math.atan2(-(tx - x), -(tz - z));
  }

  _spawnPoint(id, x, z, tag, lookX = LAYOUT.arena.x, lookZ = LAYOUT.arena.z) {
    return {
      id, tag,
      position: new Vector3(x, this.groundY(x, z), z),
      yaw: this._faceYaw(x, z, lookX, lookZ),
    };
  }

  _buildSpawnPoints() {
    const a = LAYOUT.arena;
    const t3 = LAYOUT.torii[2];
    const enemy = [
      this._spawnPoint('torii_c', 0, t3.z + 1.5, 'torii'),
      this._spawnPoint('torii_l', -3.2, t3.z + 2.4, 'torii'),
      this._spawnPoint('torii_r', 3.2, t3.z + 2.4, 'torii'),
      this._spawnPoint('east', a.hx + 1.0, a.z + 2.0, 'flank'),
      this._spawnPoint('west', -a.hx - 1.0, a.z - 1.0, 'flank'),
      this._spawnPoint('haiden_l', -6.0, a.z - a.hz - 1.6, 'inner'),
      this._spawnPoint('haiden_r', 6.0, a.z - a.hz - 1.6, 'inner'),
      this._spawnPoint('bell', LAYOUT.bellTower.x - 1.5, LAYOUT.bellTower.z, 'flank'),
      this._spawnPoint('chozuya', LAYOUT.chozuya.x + 2.0, LAYOUT.chozuya.z, 'flank'),
      this._spawnPoint('stair', 0, LAYOUT.torii[0].z + 2.0, 'stair'),
    ];

    const pt = (x, z) => new Vector3(x, this.groundY(x, z), z);

    this.spawnPoints = {
      /** Where the player materialises: below the outer torii, facing the climb. */
      player: {
        position: pt(0, LAYOUT.torii[0].z + 5.0),
        yaw: 0,                                   // −Z forward: straight up the axis
      },
      arena: {
        center: pt(a.x, a.z),
        halfX: a.hx, halfZ: a.hz,
        radius: Math.hypot(a.hx, a.hz),
      },
      enemy,
      byId: new Map(enemy.map((e) => [e.id, e])),
      patrols: [
        {
          id: 'forecourt-loop', loop: true, speed: 1.4,
          points: [
            pt(-a.hx + 2.5, a.z + a.hz - 2.5), pt(a.hx - 2.5, a.z + a.hz - 2.5),
            pt(a.hx - 2.5, a.z - a.hz + 2.5), pt(-a.hx + 2.5, a.z - a.hz + 2.5),
          ],
        },
        {
          id: 'approach-walk', loop: false, speed: 1.1,
          points: [pt(0, LAYOUT.torii[0].z), pt(0, LAYOUT.torii[1].z), pt(0, LAYOUT.torii[2].z), pt(0, a.z + 2)],
        },
        {
          id: 'overlook-watch', loop: true, speed: 1.0,
          points: [
            pt(LAYOUT.overlook.x - 3, LAYOUT.overlook.z), pt(LAYOUT.overlook.x + 3, LAYOUT.overlook.z + 1),
            pt(LAYOUT.bridge.x, LAYOUT.bridge.z),
          ],
        },
      ],
      rest: [
        { id: 'chozuya', position: this._chozuyaPos ? this._chozuyaPos.clone() : pt(LAYOUT.chozuya.x, LAYOUT.chozuya.z + 2) },
        { id: 'overlook', position: pt(LAYOUT.overlook.x - 1.4, LAYOUT.overlook.z - 1.6) },
      ],
    };
  }

  _buildInteractables() {
    const bell = this._bellPos || new Vector3(LAYOUT.bellTower.x, WORLD.PLATEAU_HEIGHT + 2, LAYOUT.bellTower.z);
    const ema = this._emaPos || new Vector3(LAYOUT.emaRack.x, WORLD.PLATEAU_HEIGHT + 1.4, LAYOUT.emaRack.z);
    const rest = this.spawnPoints?.rest?.[0]?.position
      || new Vector3(LAYOUT.chozuya.x, WORLD.PLATEAU_HEIGHT, LAYOUT.chozuya.z);

    this.interactables = [
      {
        id: 'bell', kind: 'bell', position: bell.clone(), radius: 2.8,
        prompt: '鐘を撞く — Ring the bell', used: false,
      },
      {
        id: 'ema', kind: 'read', position: ema.clone(), radius: 2.0,
        prompt: '絵馬を読む — Read the ema', used: false,
        lines: [
          '「息子が無事に帰りますように」',
          '"Let my son come home."',
          '「刀が折れませんように」',
          '"May the blade not break."',
        ],
        cursor: 0,
      },
      {
        id: 'rest', kind: 'rest', position: rest.clone(), radius: 2.4,
        prompt: '手を清める — Purify your hands', used: false,
      },
    ];
  }

  /**
   * Nearest interactable within its own radius, or null. Zero allocation — this
   * runs from the HUD every frame.
   */
  nearestInteractable(position) {
    if (!position) return null;
    let best = null, bestD = Infinity;
    for (let i = 0; i < this.interactables.length; i++) {
      const it = this.interactables[i];
      const dx = it.position.x - position.x;
      const dy = it.position.y - position.y;
      const dz = it.position.z - position.z;
      const d = dx * dx + dz * dz + dy * dy * 0.25;
      if (d < it.radius * it.radius && d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  /** Fire an interactable by id. Returns true if something happened. */
  interact(id) {
    const it = this.interactables.find((x) => x.id === id);
    if (!it) return false;
    if (it.kind === 'bell') return this.ringBell();
    if (it.kind === 'read') {
      const line = it.lines[it.cursor % it.lines.length];
      it.cursor++;
      this.ctx?.bus?.emit('objective', { text: line, sub: '絵馬 — a votive plaque' });
      this.ctx?.audio?.play?.('uiSoft');
      return true;
    }
    if (it.kind === 'rest') {
      this.ctx?.audio?.play?.('water');
      this.ctx?.bus?.emit('objective', { text: '身を清めた', sub: 'Purified' });
      const p = this.ctx?.player;
      if (p && typeof p.health === 'number') p.health = Math.min(p.maxHealth ?? p.health, p.health + 30);
      return true;
    }
    return false;
  }

  /** Ringing it is both an audio cue and the trigger for the second wave set. */
  ringBell() {
    const it = this.interactables.find((x) => x.id === 'bell');
    if (it) it.used = true;
    this.ctx?.audio?.play?.('templeBell');
    this.ctx?.bus?.emit('camera-shake', { amount: 0.12, duration: 0.9, freq: 6 });
    const em = this.ctx?.enemies;
    if (em?.alertAll) { try { em.alertAll(this._bellPos); } catch { /* optional */ } }
    this._fireTrigger('bell');
    return true;
  }

  /**
   * Which acoustic space a point is in.
   * `'forest' | 'stoneCourtyard' | 'interiorWood' | 'valley'`
   */
  reverbZoneAt(position) {
    if (!position) return 'forest';
    const x = position.x, y = position.y, z = position.z;
    const plateau = WORLD.PLATEAU_HEIGHT;

    // Under a roof and above its floor: interior.
    for (const L of [LAYOUT.haiden, LAYOUT.honden, LAYOUT.kagura, LAYOUT.shamusho]) {
      const hw = L.w * 0.5 + 1.0, hd = L.d * 0.5 + 1.0;
      if (x > L.x - hw && x < L.x + hw && z > L.z - hd && z < L.z + hd
        && y > plateau + L.floor - 0.6 && y < plateau + L.floor + 6.5) return 'interiorWood';
    }
    if (Math.hypot(x - LAYOUT.bellTower.x, z - LAYOUT.bellTower.z) < 4.0 && y < plateau + 6) return 'interiorWood';

    const d = Math.hypot(x, z);
    if (y < plateau - 4.5 || d > LAYOUT.rimRadius + 4) return 'valley';

    const a = LAYOUT.arena;
    if (x > a.x - a.hx - 2 && x < a.x + a.hx + 2 && z > a.z - a.hz - 12 && z < a.z + a.hz + 2) return 'stoneCourtyard';
    if (Math.abs(x) < 7 && z > a.z && z < LAYOUT.stairTop + 4) return 'stoneCourtyard';

    return 'forest';
  }

  // =====================================================================
  //  ENCOUNTERS
  // =====================================================================

  _advanceEncounter(index) {
    const e = ENCOUNTERS[index];
    if (!e) { this._enc.active = null; return; }
    this._enc.index = index;
    this._enc.active = e;
    this._enc.t = 0;
    this._enc.waveIndex = 0;
    this._enc.armed = e.trigger?.type === 'start';
    this._enc.cleared = false;
    if (this._enc.armed && e.objective) this.ctx?.bus?.emit('objective', e.objective);
  }

  /** Public: jump straight to a named encounter (debug and cinematics use this). */
  startEncounter(id) {
    const i = ENCOUNTERS.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this._advanceEncounter(i);
    this._enc.armed = true;
    const e = ENCOUNTERS[i];
    if (e.objective) this.ctx?.bus?.emit('objective', e.objective);
    return true;
  }

  _fireTrigger(name) {
    const e = this._enc.active;
    if (e && !this._enc.armed && e.trigger?.type === 'event' && e.trigger.name === name) {
      this._enc.armed = true;
      this._enc.t = 0;
      if (e.objective) this.ctx?.bus?.emit('objective', e.objective);
    }
  }

  _tickEncounter(dt) {
    const st = this._enc;
    const e = st.active;
    if (!e) return;

    if (!st.armed) {
      const tr = e.trigger;
      if (tr?.type === 'zone') {
        const p = this.ctx?.player?.position || this.ctx?.player?.root?.position;
        if (p) {
          const dx = p.x - tr.x, dz = p.z - tr.z;
          if (dx * dx + dz * dz < tr.r * tr.r) {
            st.armed = true;
            st.t = 0;
            if (e.objective) this.ctx?.bus?.emit('objective', e.objective);
          }
        }
      }
      return;
    }

    st.t += dt;
    while (st.waveIndex < e.waves.length && st.t >= e.waves[st.waveIndex].at) {
      const wave = e.waves[st.waveIndex++];
      for (const [archetype, pointId, count] of wave.spawn) {
        for (let i = 0; i < count; i++) this._spawnEnemy(archetype, pointId, i);
      }
      if (wave.objective) this.ctx?.bus?.emit('objective', wave.objective);
    }

    if (st.waveIndex >= e.waves.length && !st.cleared) {
      const alive = this._aliveEnemies();
      if (alive === 0 && st.t > (e.waves.length ? 1.5 : 0.2)) {
        st.cleared = true;
        if (e.clearObjective) this.ctx?.bus?.emit('objective', e.clearObjective);
        const next = e.next ? ENCOUNTERS.findIndex((x) => x.id === e.next) : -1;
        if (next >= 0) this._advanceEncounter(next);
        else st.active = null;
      }
    }
  }

  _aliveEnemies() {
    const em = this.ctx?.enemies;
    if (!em) return 0;
    if (typeof em.aliveCount === 'number') return em.aliveCount;
    if (typeof em.aliveCount === 'function') return em.aliveCount();
    const list = em.entities || em.enemies || em.active;
    if (Array.isArray(list)) {
      let n = 0;
      for (let i = 0; i < list.length; i++) if (list[i]?.isAlive) n++;
      return n;
    }
    return 0;
  }

  _spawnEnemy(archetype, pointId, offset = 0) {
    const p = this.spawnPoints?.byId?.get(pointId);
    if (!p) return;
    const jitter = offset === 0 ? 0 : (offset % 2 === 0 ? 1 : -1) * (0.9 + offset * 0.35);
    _v.copy(p.position);
    _v.x += Math.cos(p.yaw) * jitter;
    _v.z -= Math.sin(p.yaw) * jitter;
    _v.y = this.groundY(_v.x, _v.z);

    const em = this.ctx?.enemies;
    const fn = em?.spawn || em?.spawnEnemy || em?.spawnAt;
    if (typeof fn === 'function') {
      try {
        fn.call(em, { archetype, type: archetype, position: _v.clone(), yaw: p.yaw, spawnPoint: pointId });
        return;
      } catch (err) { console.error('[level] enemy spawn failed', err); }
    }
    // EnemyManager not up yet — hold it and drain later.
    this.spawnQueue.push({ archetype, position: _v.clone(), yaw: p.yaw, spawnPoint: pointId });
  }

  _drainSpawnQueue() {
    if (!this.spawnQueue.length) return;
    const em = this.ctx?.enemies;
    const fn = em?.spawn || em?.spawnEnemy || em?.spawnAt;
    if (typeof fn !== 'function') return;
    for (let i = 0; i < this.spawnQueue.length; i++) {
      const s = this.spawnQueue[i];
      try { fn.call(em, { archetype: s.archetype, type: s.archetype, position: s.position, yaw: s.yaw, spawnPoint: s.spawnPoint }); }
      catch (err) { console.error('[level] queued spawn failed', err); }
    }
    this.spawnQueue.length = 0;
  }

  // =====================================================================
  //  FRAME
  // =====================================================================

  update(dt, elapsed, rawDt) {
    if (!this._built) return;

    // Lantern flame breathing — one uniform write, shared by every firebox.
    const ember = this.factory._ember;
    if (ember) {
      const f = 0.82
        + Math.sin(elapsed * 5.7) * 0.10
        + Math.sin(elapsed * 13.3 + 1.7) * 0.06
        + Math.sin(elapsed * 27.1) * 0.03;
      ember.emissiveIntensity = this._emberBase * f;
    }

    // FoliageSystem boots after Level, so its verified blossom card cannot be
    // bound at build time. Adopt it on the first frame it exists, then stop asking.
    if (!this._foliageBound && this._bindTries < 240) {
      this._bindTries++;
      if (this.factory.bindFoliageTextures(this.ctx?.foliage)) this._foliageBound = true;
    }

    this._tickEncounter(dt);
    if (this.spawnQueue.length) this._drainSpawnQueue();

    this._lodTimer += rawDt || dt;
    if (this._lodTimer >= 0.13) {
      this._lodTimer = 0;
      this._updateLOD();
    }
  }

  /**
   * Distance LOD. Fine clutter drops out past `_clutterDist`; past `_farDist` the
   * entire shrine collapses to one silhouette mesh, which is what the player sees
   * from the valley floor in the establishing shot.
   */
  _updateLOD() {
    const cam = this.ctx?.camera;
    if (!cam) return;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;

    const far = Math.hypot(cx - this._shrineCenter.x, cz - this._shrineCenter.z) > this._farDist;
    if (far !== this._farActive) {
      this._farActive = far;
      if (this.farMesh) this.farMesh.visible = far;
    }

    const clutterSq = this._clutterDist * this._clutterDist;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (this._farActive) { c.mesh.visible = false; continue; }
      if (c.layer !== 'clutter') { c.mesh.visible = true; continue; }
      const dx = cx - c.x, dy = cy - c.y, dz = cz - c.z;
      const d = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - c.r);
      c.mesh.visible = d * d < clutterSq;
    }

    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];
      if (this._farActive) {
        for (let k = 0; k < inst.meshes.length; k++) inst.meshes[k].visible = false;
        continue;
      }
      let vis = true;
      if (inst.cull) {
        const dx = cx - inst.x, dy = cy - inst.y, dz = cz - inst.z;
        const d = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - inst.r);
        vis = d < this._clutterDist * 2.2;
      }
      for (let k = 0; k < inst.meshes.length; k++) inst.meshes[k].visible = vis;
    }
  }

  /**
   * A tier change thins the decorative scatter rather than rebuilding it —
   * entries were shuffled at realize time, so trimming the tail stays spatially
   * even. Landmarks (lanterns, banners, jizō) are never thinned: they are how you
   * navigate, and having them appear and disappear with a settings change would
   * be worse than the frames it saves.
   */
  applyQuality(quality) {
    this._applyQualityKnobs(quality);
    const THINNABLE = new Set(['leaves', 'ema']);
    for (const inst of this.instances) {
      const n = THINNABLE.has(inst.key)
        ? Math.round(inst.full * clamp(this._density, 0.15, 1))
        : inst.full;
      inst.proto.setCount(n);
    }
    this._lodTimer = 1;
  }

  dispose() {
    for (const c of this.cells) {
      c.mesh.geometry?.dispose?.();
      this.root.remove(c.mesh);
    }
    this.cells.length = 0;
    for (const inst of this.instances) {
      for (const m of inst.meshes) this.root.remove(m);
      inst.proto.dispose();
    }
    this.instances.length = 0;
    if (this.farMesh) { this.farMesh.geometry?.dispose?.(); this.root.remove(this.farMesh); }
    this.farMesh = null;
    this._protos.clear();
    this._buckets.clear();
    this._colliders.clear();
    this.factory.dispose();
    this.ctx?.scene?.remove(this.root);
    this._built = false;
  }
}

export default Level;
