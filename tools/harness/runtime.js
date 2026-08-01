/**
 * harness/runtime.js — the page-side half of the interaction-capture rig.
 *
 * This file is injected with `page.addInitScript` *before* any application code runs
 * and is never part of the shipped bundle, which is why nothing in `src/` had to gain a
 * test hook to make interaction measurable (ARCHITECTURE.md §0 rule 5c: checkpoint and
 * state-injection controls are test-only). Everything here reaches the game through
 * surfaces a player already has — DOM pointer and keyboard events on the real canvas —
 * or reads state the game already exposes on `window.__kagerou`.
 *
 * It solves three problems that make a still-frame rig unable to judge interaction:
 *
 *  1. **Time.** Under SwiftShader a frame costs 100-300 ms of wall clock, so a real-time
 *     run measures the software rasteriser, not the game: every `dt` slams into Engine's
 *     0.25 s clamp and a 130 ms parry window is unreachable by construction. We virtualise
 *     `performance.now` and `requestAnimationFrame`, so the simulation advances by exactly
 *     the authored timestep per frame regardless of how long the frame took to draw.
 *     THREE.Clock reads `performance.now`, so Engine's own `dt` follows without a patch.
 *
 *  2. **Input.** Gestures are timed by `performance.now` inside Input.js (SWIPE_MAX_TIME,
 *     TAP_MAX_TIME). Because the same virtual clock backs both, a scripted flick that is
 *     authored as "180 px over 6 frames" is seen by the game as 100 ms, on any machine.
 *
 *  3. **Cost.** Twenty scripted encounters is ~36,000 frames. `setRender(false)` swaps the
 *     post pipeline for a stub that only runs `scene.updateMatrixWorld(true)` — the part of
 *     `renderer.render` the simulation actually depends on, since bone world matrices feed
 *     blade positions and foot contacts. That substitution is a hypothesis about the
 *     engine, not a fact, so `tools/interaction-capture.mjs` runs an A/B that measures the
 *     divergence instead of assuming it is zero.
 *
 * Nothing here decides whether a criterion passes. It records; `tools/interaction-metrics.mjs`
 * judges, in Node, from the written trace.
 */

(() => {
  'use strict';

  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCancelRAF = window.cancelAnimationFrame.bind(window);
  const nativeNow = performance.now.bind(performance);

  // ------------------------------------------------------------------ clock
  //
  // 'free' passes everything through, so boot behaves exactly as it does under the
  // screenshot rig. We only take the clock over once the game is up and started,
  // because boot itself yields through rAF and would deadlock against a queue that
  // nobody is flushing yet.
  let mode = 'free';
  let vnow = nativeNow();
  let queue = [];
  let nextRafId = 1;
  let frameIndex = 0;

  performance.now = () => (mode === 'free' ? nativeNow() : vnow);

  window.requestAnimationFrame = (cb) => {
    if (mode === 'free') return nativeRAF(cb);
    const id = nextRafId++;
    queue.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (mode === 'free') return nativeCancelRAF(id);
    queue = queue.filter((e) => e.id !== id);
  };

  // ------------------------------------------------------------- event tap
  //
  // EventBus.emit returns early when an event has no listeners, so subscribing to a
  // name only sees what someone else already cared about. Wrapping the funnel catches
  // every emission, including ones no system listens for. Payloads are pooled and
  // reused by their emitters, so every field is copied out on the spot — a retained
  // reference would read whatever the next emission wrote.
  const events = [];
  let tapped = false;

  const scalarise = (v) => {
    const t = typeof v;
    if (v === null || t === 'number' || t === 'string' || t === 'boolean') return v;
    if (t === 'object') {
      // Entities are the common payload field; identify them without retaining them.
      if (v.faction || v.archetype) {
        return { id: v.id ?? null, faction: v.faction ?? null, archetype: v.archetype ?? null };
      }
      if (typeof v.x === 'number' && typeof v.z === 'number') {
        return { x: +v.x.toFixed(3), y: +(v.y ?? 0).toFixed(3), z: +v.z.toFixed(3) };
      }
    }
    return undefined;
  };

  function installTaps() {
    if (tapped) return false;
    const k = window.__kagerou;
    if (!k || !k.bus) return false;
    const bus = k.bus;
    const original = bus.emit.bind(bus);
    bus.emit = (name, payload) => {
      const rec = { f: frameIndex, t: +(vnow / 1000).toFixed(4), name };
      if (payload && typeof payload === 'object') {
        for (const key of Object.keys(payload)) {
          const s = scalarise(payload[key]);
          if (s !== undefined) rec[key] = s;
        }
      } else if (payload !== undefined) {
        rec.value = scalarise(payload);
      }
      events.push(rec);
      return original(name, payload);
    };
    tapped = true;
    return true;
  }

  // --------------------------------------------------------------- rendering
  let renderPatched = null;

  function setRender(on) {
    const k = window.__kagerou;
    if (!k) return false;
    if (on) {
      if (renderPatched) {
        k.engine.pipeline = renderPatched.real;
        k.pipeline = renderPatched.real;
        renderPatched = null;
      }
      return true;
    }
    if (renderPatched) return true;
    const real = k.engine.pipeline;
    if (!real) return false;
    const scene = k.scene;
    // A Proxy rather than a stub object: PostFX carries setFocus, setSize, applyQuality
    // and uniform state that other systems reach for by name, and a stub would silently
    // drop those calls instead of failing loudly.
    const cam = k.camera;
    const stub = new Proxy(real, {
      get(target, prop, recv) {
        if (prop === 'render') {
          return () => {
            scene.updateMatrixWorld(true);
            // `Vector3.project` reads `camera.matrixWorldInverse`, and three only
            // refreshes that inside `renderer.render`. Skipping the render left it
            // frozen at its boot value, so every NDC probe and the landmark survey
            // projected through a camera that had not moved since the title screen —
            // and the survey duly reported zero landmarks visible from all eight
            // approach points.
            cam.updateMatrixWorld(true);
            cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
          };
        }
        return Reflect.get(target, prop, recv);
      },
    });
    renderPatched = { real };
    k.engine.pipeline = stub;
    k.pipeline = stub;
    return true;
  }

  // ------------------------------------------------------------------ input
  //
  // Real DOM PointerEvents on the real canvas: Input.js's zone hit-testing, stick-half
  // resolution, swipe/tap classification and left-handed mirroring all run exactly as
  // they do under a thumb. What this does *not* exercise is the browser's own event
  // synthesis from a hardware digitiser; tools/interaction-capture.mjs cross-checks that
  // seam separately with Playwright's CDP touch input and records the agreement.
  const canvas = () => document.getElementById('game-canvas');
  const live = new Map();          // pointerId -> {x, y}

  function pointer(type, id, x, y, opts = {}) {
    const el = canvas();
    if (!el) return false;
    const target = type === 'pointerdown' ? el : window;
    const ev = new PointerEvent(type, {
      pointerId: id,
      pointerType: opts.pointerType || 'touch',
      isPrimary: opts.isPrimary !== false,
      clientX: x, clientY: y,
      screenX: x, screenY: y,
      button: opts.button ?? 0,
      buttons: type === 'pointerup' ? 0 : (opts.buttons ?? 1),
      bubbles: true, cancelable: true, composed: true,
      width: opts.width ?? 24, height: opts.height ?? 24,
      pressure: type === 'pointerup' ? 0 : 0.5,
    });
    target.dispatchEvent(ev);
    if (type === 'pointerup' || type === 'pointercancel') live.delete(id);
    else live.set(id, { x, y });
    return true;
  }

  function key(code, down) {
    const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code, key: code, bubbles: true, cancelable: true,
    });
    window.dispatchEvent(ev);
    return true;
  }

  // ------------------------------------------------------------ action verbs
  //
  // Scenarios are data, not closures, so the exact input timeline that produced a
  // measurement is serialised into the trace and can be replayed or diffed. Everything
  // a scenario may do is one of these verbs — there is no eval path into the page.
  const VERBS = {
    touchDown: (a) => pointer('pointerdown', a.id, a.x, a.y),
    touchMove: (a) => pointer('pointermove', a.id, a.x, a.y),
    touchUp: (a) => pointer('pointerup', a.id, a.x, a.y ?? 0),
    touchCancel: (a) => pointer('pointercancel', a.id, a.x, a.y ?? 0),
    mouseDown: (a) => pointer('pointerdown', a.id, a.x, a.y, { pointerType: 'mouse', button: a.button ?? 0 }),
    mouseMove: (a) => pointer('pointermove', a.id, a.x, a.y, { pointerType: 'mouse' }),
    mouseUp: (a) => pointer('pointerup', a.id, a.x, a.y, { pointerType: 'mouse', button: a.button ?? 0 }),
    keyDown: (a) => key(a.code, true),
    keyUp: (a) => key(a.code, false),
    mark: (a) => { events.push({ f: frameIndex, t: +(vnow / 1000).toFixed(4), name: 'mark', label: a.label }); return true; },
    call: (a) => {
      const k = window.__kagerou;
      const owner = a.target ? k?.[a.target] : k;
      const fn = owner?.[a.method];
      if (typeof fn !== 'function') return false;
      try { fn.apply(owner, a.args || []); return true; }
      catch (err) { events.push({ f: frameIndex, name: 'harness-error', where: `${a.target}.${a.method}`, message: String(err && err.message || err) }); return false; }
    },
    set: (a) => {
      const k = window.__kagerou;
      const owner = a.target ? k?.[a.target] : k;
      if (!owner) return false;
      owner[a.prop] = a.value;
      return true;
    },
    bot: (a) => { bot.enabled = !!a.on; bot.policy = a.policy || bot.policy; bot.reset(); return true; },
    /**
     * Put the player somewhere specific. The physics capsule owns its own position, so
     * moving `root.position` alone leaves the controller behind and the character walks
     * back — the controller's own teleport is the only correct door.
     */
    teleport: (a) => {
      const k = window.__kagerou;
      const p = k?.player;
      if (!p) return false;
      let x = a.x, y = a.y, z = a.z;
      if (a.to === 'bell') {
        const b = k.level?._bellPos;
        if (!b) return false;
        x = b.x + (a.dx ?? 2.0); y = b.y + (a.dy ?? 0); z = b.z + (a.dz ?? 2.0);
      }
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      // Ground the destination by raycast rather than keeping the current height: a
      // teleport that leaves the capsule buried makes every later frame a depenetration,
      // which reads as "the controller cannot move" and is not a fact about the game.
      if (!Number.isFinite(y)) {
        const hit = k.physics?.raycastDown?.(x, (k.player.root.position.y || 0) + 40, z, 200, 17);
        y = hit && hit.hit ? hit.point.y + 0.02 : p.root.position.y;
      }
      p.root.position.set(x, y, z);
      p.controller?.teleport?.(x, y, z);
      p.controller?.setPosition?.(p.root.position);
      p.velocity?.set?.(0, 0, 0);
      // Face a world heading, and take the camera with it, so a scenario can aim its
      // run-up: the stick is camera-relative, so setting the player's yaw alone would
      // send it somewhere else entirely.
      if (Number.isFinite(a.yaw)) {
        p.yaw = a.yaw;
        p.desiredYaw = a.yaw;
        if (k.playerCamera) { k.playerCamera.yaw = a.yaw; k.playerCamera.snap?.(); }
      }
      // A teleport is a discontinuity in every position series in the trace. Recording it
      // as an event is what lets a metric exclude it instead of reporting an 18 m camera
      // jump the game never made.
      events.push({ f: frameIndex, name: 'teleport', label: a.label ?? null, x: +x.toFixed(2), z: +z.toFixed(2) });
      return true;
    },
    /**
     * How far the player could walk from here on a given heading before something solid
     * stops them. Scenarios that measure locomotion need a clear run-up, and this records
     * the clearance they actually got instead of assuming the plateau is empty.
     */
    clearance: (a) => {
      const k = window.__kagerou;
      const p = k?.player;
      if (!p || !k.physics) return false;
      const yaw = a.yaw ?? p.yaw;
      const dir = { x: Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
      const origin = { x: p.root.position.x, y: p.root.position.y + 0.9, z: p.root.position.z };
      const hit = k.physics.raycast(origin, dir, a.maxDist ?? 60, 17);
      events.push({
        f: frameIndex, name: 'clearance', label: a.label ?? null,
        yaw: +yaw.toFixed(4),
        metres: hit && hit.hit ? +hit.distance.toFixed(2) : (a.maxDist ?? 60),
        blocked: !!(hit && hit.hit),
      });
      return true;
    },
  };

  // ------------------------------------------------------------------- probes

  const probeState = {
    feet: { l: null, r: null },
    lastCam: null,
  };

  const V = {};   // lazily-built scratch, allocated once
  function vec3() { return new (window.__kagerou.player.position.constructor)(); }

  function probePlayer(k, out) {
    const p = k.player;
    if (!p) return;
    out.px.push(round(p.position.x)); out.py.push(round(p.position.y)); out.pz.push(round(p.position.z));
    out.pyaw.push(round(p.yaw, 4));
    out.pspeed.push(round(p.speed, 4));
    out.phealth.push(round(p.health, 2));
    out.pposture.push(round(p.posture, 2));
    out.pstamina.push(round(p.stamina, 2));
    out.pgrounded.push(p.grounded ? 1 : 0);
    out.pstate.push(stateId(p.state));
    out.pweapon.push(p.weapon?.active ? 1 : 0);
    out.pinvuln.push(p.invulnerable ? 1 : 0);
  }

  function probeInput(k, out) {
    const s = k.input?.state;
    if (!s) return;
    out.imag.push(round(s.moveMag, 4));
    out.imx.push(round(s.move.x, 4));
    out.imy.push(round(s.move.y, 4));
    out.ilook.push(round(s.look.x, 5));
    out.iguard.push(s.guard ? 1 : 0);
    out.islash.push(s.slashes.length);
    // `pressed` is cleared by Input.endFrame() at the end of the frame we are about to
    // run, so this samples the edge set the *previous* frame produced.
    out.ipressed.push([...s.pressed].join('|'));
  }

  function probeCamera(k, out) {
    const c = k.camera;
    out.cx.push(round(c.position.x)); out.cy.push(round(c.position.y)); out.cz.push(round(c.position.z));
    out.cfov.push(round(c.fov, 3));
    const pc = k.playerCamera;
    out.cboom.push(round(pc?._boomActual ?? 0, 4));
    out.ctrauma.push(round(pc?.trauma ?? 0, 4));
    out.clock.push(pc?.lockTarget ? 1 : 0);
    // Distance from the eye to the nearest solid surface. The camera "renders from inside
    // geometry" when that distance is under the near plane — a conservative proxy for a
    // containment test the physics world does not expose.
    let near = 999;
    const ph = k.physics;
    if (ph && ph.overlapSphere) {
      // 17 = LAYER.WORLD | LAYER.PROP (Physics.js LAYER_SOLID), inlined because the
      // module constant is not reachable from the page.
      const n = ph.overlapSphere(c.position, c.near * 1.05, 17, null);
      near = n > 0 ? 0 : 999;
    }
    out.cinside.push(near === 0 ? 1 : 0);
    // Per-frame eye displacement: the sphere-cast pull-in must never teleport.
    const last = probeState.lastCam;
    out.cjump.push(last ? round(Math.hypot(c.position.x - last[0], c.position.y - last[1], c.position.z - last[2]), 4) : 0);
    probeState.lastCam = [c.position.x, c.position.y, c.position.z];
  }

  function probeEnemies(k, out) {
    const list = k.enemies?.list || [];
    const row = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const rec = k.combat?._records?.get?.(e) || null;
      row.push([
        e.id, e.archetype, stateId(e.state), behaviourId(e.ai?.behaviour),
        round(e.health, 1), round(e.posture, 1),
        round(e.position.x), round(e.position.z),
        rec?.token ? 1 : 0,
        e.ai?.canSee ? 1 : 0,
        round(e.ai?.alertness ?? 0, 3),
      ]);
    }
    out.enemies.push(row);
  }

  /**
   * Live count and the authored ceiling, one number each per frame. Separate from the
   * full `enemies` probe because the token criterion needs every frame of a 20-encounter
   * run and the full rows do not fit in a trace at that length.
   */
  function probeTokens(k, out) {
    const list = k.enemies?.list || [];
    let committed = 0, alive = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.isAlive && e.state !== 'dead' && e.state !== 'executed') alive++;
      if (k.combat?._records?.get?.(e)?.token) committed++;
    }
    out.ecount.push(list.length);
    out.ealive.push(alive);
    out.etokens.push(committed);
    out.etokenmax.push(k.combat?.diff?.melee ?? null);
  }

  /**
   * Per-enemy visible motion: how far the weapon hand travelled this frame. An attack's
   * *startup* has to be measured from the first frame the body actually moves, not from
   * the state flag — the state can change several frames before anything is on screen,
   * and that gap is the whole question BM-ANIM-01 asks.
   */
  const _emotionPrev = new Map();
  function probeEnemyMotion(k, out) {
    const list = k.enemies?.list || [];
    const row = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const b = e.rig?.bones?.hand_r || e.rig?.bones?.handR || e.rig?.bones?.weapon_tip || null;
      if (!b) { row.push([e.id, null]); continue; }
      const w = b.getWorldPosition(scratchA);
      const prev = _emotionPrev.get(e.id);
      const d = prev ? Math.hypot(w.x - prev[0], w.y - prev[1], w.z - prev[2]) : 0;
      _emotionPrev.set(e.id, [w.x, w.y, w.z]);
      row.push([e.id, round(d, 5), stateId(e.state), e.weapon?.active ? 1 : 0]);
    }
    out.emotion.push(row);
  }

  function probeFeet(k, out) {
    const bones = k.player?.rig?.bones;
    if (!bones || !bones.foot_l || !bones.foot_r) { out.feet.push(null); return; }
    const wl = bones.foot_l.getWorldPosition(scratchA);
    const l = [wl.x, wl.y, wl.z];
    const wr = bones.foot_r.getWorldPosition(scratchA);
    const r = [wr.x, wr.y, wr.z];
    // Ground height under each foot, so "in contact" is a measured clearance rather than
    // an assumption about which foot the locomotion blend believes is planted.
    const gl = groundY(k, l[0], l[2]);
    const gr = groundY(k, r[0], r[2]);
    if (!Number.isFinite(gl) && !Number.isFinite(gr)) { out.feet.push(null); return; }
    const dl = probeState.feet.l ? Math.hypot(l[0] - probeState.feet.l[0], l[2] - probeState.feet.l[2]) : 0;
    const dr = probeState.feet.r ? Math.hypot(r[0] - probeState.feet.r[0], r[2] - probeState.feet.r[2]) : 0;
    probeState.feet.l = l; probeState.feet.r = r;
    out.feet.push([
      round(l[1] - gl, 4), round(dl, 5),
      round(r[1] - gr, 4), round(dr, 5),
    ]);
  }

  function probeBlade(k, out) {
    const p = k.player;
    if (!p || !p.bladeTip) { out.blade.push(null); return; }
    const tip = p.bladeTip, prev = p.prevBladeTip;
    const sp = prev ? Math.hypot(tip.x - prev.x, tip.y - prev.y, tip.z - prev.z) : 0;
    out.blade.push([round(tip.x), round(tip.y), round(tip.z), round(sp, 5), p.weapon?.active ? 1 : 0]);
  }

  function probeNdc(k, out) {
    // Player and locked target in normalised device coordinates — the only honest way to
    // ask "are both bodies still in frame" without a human looking at pixels.
    const cam = k.camera;
    const p = k.player;
    const t = k.playerCamera?.lockTarget || null;
    const project = (obj, yOff) => {
      if (!obj) return null;
      scratchA.set(obj.position.x, obj.position.y + yOff, obj.position.z);
      scratchA.project(cam);
      return [round(scratchA.x, 4), round(scratchA.y, 4), round(scratchA.z, 4)];
    };
    out.ndc.push([project(p, 1.0), project(t, 0.9)]);
  }

  function probeStats(k, out) {
    out.draws.push(k.engine.stats.drawCalls);
    out.tris.push(k.engine.stats.triangles);
  }

  function probeControl(k, out) {
    // "Control is never removed for more than a beat" needs a per-frame answer to
    // "could the player act right now?" — input enabled, no cinematic camera hold, not
    // paused, and the gameplay camera still attached.
    const cine = !!k.cinematic?.active;
    const paused = !!k.engine.paused;
    const enabled = k.input?.enabled !== false;
    const pcOn = k.playerCamera?.enabled !== false;
    out.control.push((enabled && !cine && !paused && pcOn) ? 1 : 0);
    // The title beat is drawn ink, not a state: it dims the frame and fades the HUD but
    // never touches input. Recording it separately is what lets the metric say whether a
    // sequence was non-interactive or merely looked like it.
    const m = k.menus;
    out.intro.push((m && (m._title >= 0 || m._titleA > 0.004 || m._introWash > 0.004)) ? 1 : 0);
    out.menu.push(m && m.mode && m.mode !== 'none' ? 1 : 0);
  }

  const PROBES = {
    player: probePlayer, input: probeInput, camera: probeCamera, enemies: probeEnemies,
    tokens: probeTokens, emotion: probeEnemyMotion,
    feet: probeFeet, blade: probeBlade, ndc: probeNdc, stats: probeStats, control: probeControl,
  };

  const COLUMNS = {
    player: ['px', 'py', 'pz', 'pyaw', 'pspeed', 'phealth', 'pposture', 'pstamina', 'pgrounded', 'pstate', 'pweapon', 'pinvuln'],
    input: ['imag', 'imx', 'imy', 'ilook', 'iguard', 'islash', 'ipressed'],
    camera: ['cx', 'cy', 'cz', 'cfov', 'cboom', 'ctrauma', 'clock', 'cinside', 'cjump'],
    enemies: ['enemies'],
    tokens: ['ecount', 'ealive', 'etokens', 'etokenmax'],
    emotion: ['emotion'],
    feet: ['feet'], blade: ['blade'], ndc: ['ndc'], stats: ['draws', 'tris'],
    control: ['control', 'intro', 'menu'],
  };

  // Interned string tables keep the trace numeric; the names travel once in the header.
  const stateNames = [];
  const behaviourNames = [];
  function stateId(s) { if (s == null) return -1; let i = stateNames.indexOf(s); if (i < 0) { i = stateNames.length; stateNames.push(s); } return i; }
  function behaviourId(s) { if (s == null) return -1; let i = behaviourNames.indexOf(s); if (i < 0) { i = behaviourNames.length; behaviourNames.push(s); } return i; }
  function round(v, d = 3) { return Number.isFinite(v) ? +v.toFixed(d) : null; }

  let scratchA = null;
  /**
   * Ground height under a point.
   *
   * The origin is taken from the player's own height, not from a constant. The first
   * version cast down from y = 3 — the shrine plateau stands at y = 812, so every ray
   * started underground, every foot read ~812 m of clearance, and the foot-plant
   * criterion recorded zero contact samples across a full walk/run/sprint run.
   */
  function groundY(k, x, z) {
    const from = (k.player?.root?.position?.y ?? 0) + 2.5;
    const hit = k.physics?.raycastDown?.(x, from, z, 8, 17);
    if (hit && hit.hit) return hit.point.y;
    return NaN;
  }

  // --------------------------------------------------------------------- bot
  //
  // A scripted opponent policy, so an encounter-level criterion has *some* defined
  // player behind it. It reads only what a player can see — entity positions, states,
  // telegraph cues published on the bus — never enemy internals, and it acts through the
  // same synthetic touch surface as every other scenario. It is not a player and no
  // measurement taken under it may be reported as a human result.
  const bot = {
    enabled: false,
    policy: 'aggressive',
    reactFrames: 12,          // ~200 ms at 60 Hz — deliberately slower than REACTION_FLOOR
    _pending: -1,
    _cool: 0,
    _stickDown: false,
    reset() { this._pending = -1; this._cool = 0; },
    tick(k, f, layout) {
      if (!this.enabled) return;
      const p = k.player;
      if (!p || !p.isAlive) return;
      const list = k.enemies?.list || [];
      let near = null, nd = 1e9;
      for (const e of list) {
        if (!e.isAlive || e.state === 'dead') continue;
        const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
        if (d < nd) { nd = d; near = e; }
      }
      if (!near) { this._release(layout); return; }

      // React to a published telegraph after a human-ish latency, then guard.
      const tel = k.combat?.getTelegraph?.(near) || null;
      if (tel && this._pending < 0) this._pending = f + this.reactFrames;

      if (this._pending >= 0 && f >= this._pending) {
        this._pending = -1;
        if (tel === 'unblockable') VERBS.keyDown({ code: 'Space' }), VERBS.keyUp({ code: 'Space' });
        else this._guard(layout, true);
        this._cool = f + 24;
      } else if (f > this._cool) {
        this._guard(layout, false);
      }

      // Close distance, then swing. Both through the touch surface.
      if (nd > 2.6) {
        this._stick(layout, 1.0, Math.atan2(near.position.x - p.position.x, -(near.position.z - p.position.z)) - (k.playerCamera?.yaw ?? 0));
      } else {
        this._release(layout);
        // Alternate a tap (light attack) with a flick (directional slash) so the trace
        // contains both verbs; a bot that only taps produced one slash in fourteen
        // seconds and left every combat metric without a sample.
        if (f % 22 === 0 && this.policy === 'aggressive') {
          const c = layout.gestureCentre;
          if ((f / 22) % 2 === 0) {
            pointer('pointerdown', 90, c.x, c.y);
            pointer('pointerup', 90, c.x, c.y);
          } else {
            this._flick = { f0: f, x: c.x, y: c.y, dx: (f % 44 === 0 ? 150 : -150), dy: (f % 66 === 0 ? 70 : -70) };
            pointer('pointerdown', 91, c.x, c.y);
          }
        }
      }
      // A flick has to be a real drag over real frames or Input classifies it as a tap.
      if (this._flick) {
        const k2 = f - this._flick.f0;
        const t = k2 / 6;
        if (t <= 1) pointer('pointermove', 91, this._flick.x + this._flick.dx * t, this._flick.y + this._flick.dy * t);
        else { pointer('pointerup', 91, this._flick.x + this._flick.dx, this._flick.y + this._flick.dy); this._flick = null; }
      }
    },
    _stick(layout, mag, angle) {
      const o = layout.stickOrigin;
      const r = layout.stickRadius * (0.14 + mag * 0.86);
      const x = o.x + Math.sin(angle) * r;
      const y = o.y - Math.cos(angle) * r;
      if (!this._stickDown) { pointer('pointerdown', 80, o.x, o.y); this._stickDown = true; }
      pointer('pointermove', 80, x, y);
    },
    _release(layout) {
      if (this._stickDown) { pointer('pointerup', 80, layout.stickOrigin.x, layout.stickOrigin.y); this._stickDown = false; }
    },
    _guard(layout, on) {
      const k = window.__kagerou;
      if (!k?.input) return;
      // Guard is a held HUD zone; press it through its registered rect so the zone
      // plumbing is exercised rather than bypassed.
      const z = (k.input._zones || []).find((zz) => zz.name === 'guard');
      const r = z?.rect?.();
      if (!r) { k.input.state.guard = on; return; }
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (on) pointer('pointerdown', 81, cx, cy);
      else pointer('pointerup', 81, cx, cy);
    },
  };

  // ------------------------------------------------------------------ runner

  let run = null;

  function layoutFor(k) {
    const w = window.innerWidth, h = window.innerHeight;
    const stickLeft = (k.input?.stickSide ?? 'left') === 'left';
    const half = k.input?.stickHalf ?? 0.42;
    return {
      w, h,
      stickOrigin: { x: stickLeft ? w * half * 0.5 : w * (1 - half * 0.5), y: h * 0.68 },
      stickRadius: 62 * (k.input?.uiScale ?? 1),
      gestureCentre: { x: stickLeft ? w * 0.72 : w * 0.28, y: h * 0.42 },
    };
  }

  function begin(plan) {
    const k = window.__kagerou;
    if (!k) return { ok: false, error: 'game not booted' };
    installTaps();
    if (!scratchA) scratchA = vec3();
    setRender(plan.render !== false);
    events.length = 0;
    frameIndex = 0;
    probeState.feet.l = probeState.feet.r = null;
    probeState.lastCam = null;
    bot.enabled = false;
    bot.reset();

    const cols = {};
    for (const p of plan.probes || []) for (const c of COLUMNS[p] || []) cols[c] = [];

    const byFrame = new Map();
    for (const a of plan.actions || []) {
      if (!byFrame.has(a.f)) byFrame.set(a.f, []);
      byFrame.get(a.f).push(a);
    }

    run = {
      plan, cols, byFrame, layout: layoutFor(k),
      dt: plan.dtMs ?? (1000 / 60),
      stride: Math.max(1, plan.stride || 1),
      sampled: [],
      failedActions: [],
      startedAt: nativeNow(),
    };
    _emotionPrev.clear();
    return { ok: true, frames: plan.frames, columns: Object.keys(cols) };
  }

  function advance(n) {
    if (!run) return { ok: false, error: 'no active run' };
    const k = window.__kagerou;
    const end = Math.min(run.plan.frames, frameIndex + n);
    while (frameIndex < end) {
      const acts = run.byFrame.get(frameIndex);
      if (acts) {
        for (const a of acts) {
          const verb = VERBS[a.do];
          const ok = verb ? verb(a) : false;
          if (!ok) run.failedActions.push({ f: frameIndex, do: a.do, label: a.label ?? null });
        }
      }
      bot.tick(k, frameIndex, run.layout);

      // Sample *before* the step so a column at index i describes the state the frame
      // was entered with, alongside the action list that was applied to it. `stride`
      // exists because a 24,000-frame encounter run cannot carry per-enemy rows for every
      // frame; the sampled frame indices travel with the trace so no metric has to guess.
      if (frameIndex % run.stride === 0) {
        for (const p of run.plan.probes || []) PROBES[p]?.(k, run.cols);
        run.sampled.push(frameIndex);
      }

      vnow += run.dt;
      const gen = queue;
      queue = [];
      for (const e of gen) { try { e.cb(vnow); } catch (err) { events.push({ f: frameIndex, name: 'frame-error', message: String(err && err.message || err) }); } }
      frameIndex++;
    }
    return { ok: true, frame: frameIndex, done: frameIndex >= run.plan.frames, events: events.length };
  }

  function finish() {
    if (!run) return { ok: false, error: 'no active run' };
    const out = {
      id: run.plan.id,
      frames: frameIndex,
      dtMs: run.dt,
      stride: run.stride,
      sampledFrames: run.sampled,
      render: run.plan.render !== false,
      wallMs: Math.round(nativeNow() - run.startedAt),
      columns: run.cols,
      events: events.slice(),
      failedActions: run.failedActions,
      stateNames: stateNames.slice(),
      behaviourNames: behaviourNames.slice(),
    };
    setRender(true);
    run = null;
    return out;
  }

  window.__kh = {
    version: 1,
    lock() { if (mode === 'locked') return true; vnow = nativeNow(); mode = 'locked'; return true; },
    free() { mode = 'free'; const gen = queue; queue = []; for (const e of gen) nativeRAF(e.cb); return true; },
    get mode() { return mode; },
    get frame() { return frameIndex; },
    get virtualNow() { return vnow; },
    installTaps, setRender, begin, advance, finish,
    /**
     * Per-system frame cost over `n` stepped frames, in milliseconds.
     *
     * Wraps each registered system's `update`/`lateUpdate` and tallies real time. Written
     * because a scenario with three enemies ran 800× slower than one without and the
     * cause could have been any of a dozen systems — "it is probably the AI" is exactly
     * the kind of guess this project has been burned by. Also the only apparatus that can
     * speak to the ≤ 5 ms JS-per-frame budget without a profiler.
     */
    profile(n) {
      const k = window.__kagerou;
      const systems = k.engine.systems;
      const rows = systems.map((s) => ({ name: s.constructor?.name || '(anonymous)', update: 0, lateUpdate: 0 }));
      const saved = systems.map((s) => ({ update: s.update, lateUpdate: s.lateUpdate }));
      systems.forEach((s, i) => {
        if (saved[i].update) s.update = function (...a) { const t = nativeNow(); try { return saved[i].update.apply(this, a); } finally { rows[i].update += nativeNow() - t; } };
        if (saved[i].lateUpdate) s.lateUpdate = function (...a) { const t = nativeNow(); try { return saved[i].lateUpdate.apply(this, a); } finally { rows[i].lateUpdate += nativeNow() - t; } };
      });
      const t0 = nativeNow();
      for (let i = 0; i < n; i++) {
        vnow += 1000 / 60;
        const gen = queue;
        queue = [];
        for (const e of gen) { try { e.cb(vnow); } catch { /* a failing frame still costs time */ } }
      }
      const total = nativeNow() - t0;
      systems.forEach((s, i) => { if (saved[i].update) s.update = saved[i].update; if (saved[i].lateUpdate) s.lateUpdate = saved[i].lateUpdate; });
      return {
        frames: n,
        totalMs: +total.toFixed(1),
        msPerFrame: +(total / n).toFixed(3),
        systems: rows
          .map((r) => ({ name: r.name, msPerFrame: +((r.update + r.lateUpdate) / n).toFixed(4) }))
          .filter((r) => r.msPerFrame > 0.001)
          .sort((a, b) => b.msPerFrame - a.msPerFrame),
      };
    },
    /** Step frames outside a scenario — used to settle the world between runs. */
    pump(n) {
      for (let i = 0; i < n; i++) {
        vnow += 1000 / 60;
        const gen = queue;
        queue = [];
        for (const e of gen) { try { e.cb(vnow); } catch { /* settling frames are allowed to fail */ } }
      }
      return n;
    },
    pointer, key, events,
    layout: () => layoutFor(window.__kagerou),
    /** Advance real (unvirtualised) time — used by the audio scenario, which needs the
     *  AudioContext's own clock and therefore cannot run under the virtual one. */
    realFrames: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
})();
