import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, Vector3, Matrix4, PerspectiveCamera } from 'three';
import { Input } from '../src/core/Input.js';
import { Level, LAYOUT, ENCOUNTERS } from '../src/world/Level.js';
import { WORLD } from '../src/world/Constants.js';
import { Terrain, CORE_HALF, VIEW_DISTANCE } from '../src/world/Terrain.js';
import { PropFactory } from '../src/world/Props.js';
import { PhysicsWorld } from '../src/gameplay/Physics.js';
import { EnemyManager, ARCHETYPES } from '../src/gameplay/Enemy.js';
import { SHOTS } from '../src/core/Cinematic.js';
import { makeRandom } from '../src/core/Noise.js';

// Exercise the real input queue and real enemy manager without GL, a DOM or the capture rig.
globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 844 };
globalThis.document = { addEventListener() {}, pointerLockElement: null };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [] } });
const canvas = { addEventListener() {} };
const floor = WORLD.PLATEAU_HEIGHT;
const reports = [];

function fixture() {
  const events = [], audio = [], order = [];
  const ctx = {
    scene: new Group(), quality: { tier: 1, maxEnemies: 6 },
    engine: { frame: 0, elapsed: 0, paused: false },
    input: new Input(canvas), terrain: { heightAt: () => floor },
    bus: { emit(name, data) { events.push({ name, data, at: ctx.engine.elapsed }); } },
    audio: { play(name) { audio.push(name); } },
    player: {
      position: new Vector3(), forward: new Vector3(0, 0, -1), state: 'idle',
      isAlive: true, health: 55, maxHealth: 100, radius: 0.35,
      respawn(p) {
        order.push('respawn'); this.position.copy(p); this.state = 'sheathed';
        this.isAlive = true; this.health = this.maxHealth;
      },
    },
    combat: { reset() { order.push('combat.reset'); } },
  };
  const level = ctx.level = new Level(ctx);
  ctx.enemies = new EnemyManager(ctx);
  const despawnAll = ctx.enemies.despawnAll.bind(ctx.enemies);
  ctx.enemies.despawnAll = () => { order.push('despawnAll'); despawnAll(); };
  level._probeGround(); level._applyQualityKnobs(ctx.quality);
  level._buildSpawnPoints(); level._buildInteractables();
  level._built = true; level._foliageBound = true;
  const tick = (dt = 1 / 60) => {
    ctx.engine.frame++; ctx.engine.elapsed += Number.isFinite(dt) ? dt : 0;
    level.update(dt, ctx.engine.elapsed, Number.isFinite(dt) && dt > 0 ? dt : 1 / 60);
    ctx.input.endFrame();
  };
  const key = (code, down) => ctx.input._key({ code, preventDefault() {} }, down);
  const press = (code = 'KeyF', dt = 1 / 60) => { key(code, true); tick(dt); key(code, false); };
  const at = (id) => {
    const it = level.interactables.find((x) => x.id === id);
    ctx.player.position.set(it.position.x, floor, it.position.z);
    return it;
  };
  const waitForBell = () => level._advanceEncounter(ENCOUNTERS.findIndex((x) => x.id === 'bell'));
  return { ctx, level, events, audio, order, tick, key, press, at, waitForBell };
}

{
  const f = fixture();
  const old = { x: 0, z: 8 };
  const h = LAYOUT.haiden;
  assert.ok(Math.abs(old.x - h.x) < h.w / 2 && Math.abs(old.z - h.z) < h.d / 2);
  assert.equal(f.level.playerSpawn, f.level.spawnPoints.player);
  assert.deepEqual(f.level.playerSpawn.position.toArray(), [0, floor, 73]);
  assert.ok(f.level.playerSpawn.position.z > h.z + h.d / 2);
  reports.push({ check: 'spawn interface', oldSpawnInsideHaiden: true, authoritativeSpawn: f.level.playerSpawn.position.toArray() });
}

{
  const f = fixture(); f.waitForBell(); const bell = f.at('bell');
  assert.match(f.level.nearestInteractable(f.ctx.player.position).consequence, /敵/);
  // Movement and the usual gesture attack cannot substitute for a dedicated interaction.
  f.key('KeyW', true);
  for (let i = 0; i < 120; i++) { f.ctx.input.state.pressed.add('attack'); f.tick(); }
  f.key('KeyW', false);
  assert.equal(bell.used, false); assert.equal(f.audio.length, 0);
  f.key('KeyF', true); f.tick();
  const ringTime = f.ctx.engine.elapsed;
  assert.equal(bell.used, true); assert.deepEqual(f.audio, ['templeBell']);
  const warning = f.events.find((e) => e.name === 'objective' && e.data.text === '鐘が谷を渡る');
  assert.ok(warning); assert.equal(warning.at, ringTime);
  assert.equal(f.ctx.enemies.aliveCount, 0);
  for (let i = 0; i < 119; i++) { f.key('KeyF', true); f.tick(); }
  assert.equal(f.audio.length, 1, 'held F or key repeat cannot ring twice');
  assert.equal(f.ctx.enemies.aliveCount, 0, 'warning precedes the first wave by two simulated seconds');
  f.tick(); f.tick();
  assert.equal(f.ctx.enemies.aliveCount, 2);
  assert.deepEqual(f.ctx.enemies.list.map((e) => e.archetype), ['ronin', 'ronin']);
  assert.equal(f.level.ringBell(), false, 'direct repeat cannot bypass availability');
  reports.push({ check: 'deliberate bell', accidentalRings: 0, heldKeyRings: f.audio.length, warningSecondsBeforeSpawn: +(f.ctx.engine.elapsed - warning.at).toFixed(4), firstWave: f.ctx.enemies.list.map((e) => e.archetype) });
}

{
  const f = fixture(); const bell = f.at('bell');
  f.press(); assert.equal(bell.used, false, 'a premature ring cannot consume future progression');
  f.waitForBell();
  for (const reason of ['paused', 'dead', 'disabled', 'attack', 'out-of-range', 'NaN-position', 'NaN-health']) {
    f.at('bell'); f.ctx.player.isAlive = true; f.ctx.player.health = 55; f.ctx.player.state = 'idle';
    f.ctx.engine.paused = false; f.ctx.input.enabled = true;
    if (reason === 'paused') f.ctx.engine.paused = true;
    if (reason === 'dead') f.ctx.player.isAlive = false;
    if (reason === 'disabled') f.ctx.input.enabled = false;
    if (reason === 'attack') f.ctx.player.state = 'attack';
    if (reason === 'out-of-range') f.ctx.player.position.x += 10;
    if (reason === 'NaN-position') f.ctx.player.position.x = NaN;
    if (reason === 'NaN-health') f.ctx.player.health = NaN;
    // Seed the edge before a disable too: release, pause and death must not defer it.
    f.ctx.input.state.pressed.add('interact'); f.tick(reason === 'paused' ? 0 : 0.25);
    assert.equal(bell.used, false, reason);
    assert.equal(f.ctx.input.consume('interact'), false, reason + ' intent drained');
    assert.equal(f.level.nearestInteractable(f.ctx.player.position), null, reason + ' prompt absent');
  }
  f.at('bell'); f.ctx.player.health = 55; f.ctx.input.enabled = true;
  f.tick(); assert.equal(bell.used, false, 'invalid state does not leave a deferred ring');
  f.press(); assert.equal(bell.used, true);
  reports.push({ check: 'safety and recovery', rejectedStates: 7, staleRings: 0, recoveredRings: 1 });
}

{
  const f = fixture();
  for (const id of ['ema', 'omikuji', 'rest']) {
    const it = f.at(id); f.press(); assert.equal(it.used, true, id + ' authored response reachable');
    f.tick(0.25); f.tick(0.25);
  }
  assert.equal(f.ctx.player.health, 85);
  f.press(); assert.equal(f.ctx.player.health, 85, 'purification cannot be farmed');
  assert.deepEqual(f.audio, ['uiConfirm', 'uiConfirm', 'footstep_water']);
  const text = f.events.filter((e) => e.name === 'objective').map((e) => e.data.text);
  assert.equal(new Set(text).size, 3);
  assert.ok(text.every((x) => [...x].length <= 12));
  f.at('ema'); f.press();
  assert.equal(f.events.at(-1).data.text, '刀に託した願い');
  f.ctx.player.maxHealth = Infinity; f.at('rest');
  assert.equal(f.level.nearestInteractable(f.ctx.player.position), null);
  reports.push({ check: 'optional discoveries', reachableOffPath: 3, distinctResponses: text, healthBefore: 55, healthAfter: 85, repeatRestGain: 0 });
}

{
  const f = fixture();
  f.ctx.enemies.maxEnemies = 1;
  f.level._spawnEnemy('ronin', 'east');
  f.level._spawnEnemy('oyoroi', 'west');
  assert.equal(f.ctx.enemies.list[0].archetype, 'ronin');
  assert.deepEqual(f.ctx.enemies.list[0].position.toArray(), f.level.spawnPoints.byId.get('east').position.toArray());
  assert.equal(f.level.spawnQueue.length, 1, 'tier-cap overflow retained');
  f.ctx.enemies.despawnAll(); f.level._drainSpawnQueue();
  assert.equal(f.ctx.enemies.list[0].archetype, 'oyoroi');
  assert.deepEqual(f.ctx.enemies.list[0].position.toArray(), f.level.spawnPoints.byId.get('west').position.toArray());
  assert.equal(f.level.spawnQueue.length, 0);
  assert.ok(ENCOUNTERS.every((e) => e.waves.every((w) => w.spawn.every(([a]) => ARCHETYPES[a]))));
  reports.push({ check: 'authored spawn contract', archetypes: ['ronin', 'oyoroi'], exactPlacements: 2, tierOverflowDelivered: 1 });
}

{
  const f = fixture();
  let totalSpawns = 0;
  const spawn = f.ctx.enemies.spawn.bind(f.ctx.enemies);
  f.ctx.enemies.spawn = (...a) => { const e = spawn(...a); if (e) totalSpawns++; return e; };
  f.level._advanceEncounter(0); f.ctx.player.position.set(0, floor, 47);
  for (let i = 0; i < 8; i++) f.tick(0.25);
  assert.equal(f.level._enc.active.id, 'forecourt');
  f.ctx.player.position.set(0, floor, 31);
  for (let i = 0; i < 105; i++) { f.tick(0.25); f.ctx.enemies.despawnAll(); }
  assert.equal(f.level._enc.active.id, 'bell'); assert.equal(f.level._enc.armed, false);
  f.at('bell'); f.press();
  for (let i = 0; i < 60; i++) { f.tick(0.25); f.ctx.enemies.despawnAll(); }
  assert.equal(f.level._enc.active, null);
  assert.equal(totalSpawns, 12, 'all seven forecourt and five bell arrivals delivered');
  assert.equal(f.events.filter((x) => x.name === 'victory').length, 1);
  for (let i = 0; i < 12; i++) f.tick(0.25);
  assert.equal(f.events.filter((x) => x.name === 'victory').length, 1);
  f.ctx.player.isAlive = false; f.ctx.player.health = 0;
  f.ctx.input.state.pressed.add('interact'); f.order.length = 0;
  assert.equal(f.level.restart(), true);
  assert.deepEqual(f.order, ['despawnAll', 'combat.reset', 'respawn']);
  assert.equal(f.level._enc.active.id, 'arrival');
  assert.equal(f.level._enc.done.size, 0);
  assert.equal(f.ctx.enemies.aliveCount, 0);
  assert.equal(f.level.spawnQueue.length, 0);
  assert.ok(f.level.interactables.every((x) => !x.used && (x.cursor ?? 0) === 0));
  assert.equal(f.ctx.input.consume('interact'), false);
  assert.equal(f.ctx.player.health, 100);
  assert.deepEqual(f.ctx.player.position.toArray(), [0, floor, 73]);
  reports.push({ check: 'encounter completion and retry', completedEncounters: 4, totalSpawns, victories: 1, resetOrder: f.order, retrySpawn: f.ctx.player.position.toArray() });
}

// Pinpoint east-edge visibility using original collider geometry, labelled per prop.
// The flat plateau excludes Terrain's sub-metre dressing and is a diagnosis, not a frame gate.
{
  const ctx = { quality: { tier: 1 }, terrain: { heightAt: () => floor }, scene: new Group() };
  const level = new Level(ctx); level._probeGround(); level._applyQualityKnobs(ctx.quality);
  const physics = ctx.physics = new PhysicsWorld(ctx);
  physics.addHeightfield();
  function collect(label, build) {
    build();
    for (const [key, geos] of level._colliders) {
      for (const geometry of geos) physics.addStatic({ type: 'triangleMesh', geometry, matrix: new Matrix4(), userData: label, surface: key.split('|')[0] });
    }
    level._colliders.clear();
  }
  for (let i = 0; i < LAYOUT.torii.length; i++) collect('torii-' + i, () => level._buildTorii(i));
  for (const [name, options] of [['haiden', '_haidenOpts'], ['honden', '_hondenOpts'], ['shamusho', '_shamushoOpts'], ['kagura', '_kaguraOpts']]) {
    const tasks = [];
    level._hallTasks((label, build) => tasks.push(build), name, () => level[options]());
    for (const build of tasks) collect(name, build);
  }
  collect('bell-tower', () => level._buildBellTower());
  collect('chozuya', () => level._buildChozuya());
  collect('bridge', () => level._buildBridge());
  for (let i = 0; i < 4; i++) collect('fence-' + i, () => level._buildFences(i));
  collect('votives', () => level._buildVotives());
  const ground = (x, z) => physics.raycastDown(x, floor + 80, z, 400, 17).point.y;
  const eye = new Vector3(22, ground(22, 34) + 1.62, 34);
  const camera = new PerspectiveCamera(58, 844 / 390, 0.1, 2000);
  camera.position.copy(eye); camera.lookAt(0, eye.y - 1.62 + 2, -4.5);
  camera.updateMatrixWorld(true); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const anchors = [
    ['great-torii', 0, 38.5, 5.6], ['honden-roof', 0, -4.5, 8],
    ['bell-tower', 16.5, 27, 4.6], ['haiden-roof', 0, 8.5, 7],
  ];
  const diagnostic = [];
  for (const [name, x, z, up] of anchors) {
    const p = new Vector3(x, ground(x, z) + up, z);
    const ndc = p.clone().project(camera);
    const dir = p.clone().sub(eye); const distance = dir.length(); dir.normalize();
    const hit = physics.raycast(eye, dir, distance - 0.6, 17);
    diagnostic.push({ name, target: p.toArray(), ndc: ndc.toArray().map((n) => +n.toFixed(4)), inFrame: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z < 1, blocker: hit?.hit ? hit.collider?.userData ?? hit.collider?.kind : null, hitDistance: hit?.hit ? +hit.distance.toFixed(3) : null });
  }
  assert.equal(level.landmarks.length, 4);
  const corrected = level.landmarks.map((a) => {
    const ndc = a.position.clone().project(camera);
    const dir = a.position.clone().sub(eye); const distance = dir.length(); dir.normalize();
    const hit = physics.raycast(eye, dir, distance - 0.6, 17);
    return { id: a.id, height: a.position.y, ndcY: +ndc.y.toFixed(4), visible: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z < 1 && !hit?.hit };
  });
  assert.ok(corrected.find((x) => x.id === 'bell-tower').visible);
  level._buildSpawnPoints(); level._buildInteractables();
  const bell = level.interactables.find((x) => x.id === 'bell');
  const foot = new Vector3(bell.position.x, floor + 0.36, bell.position.z);
  const head = new Vector3(bell.position.x, floor + 1.4, bell.position.z);
  assert.equal(physics.capsuleOverlap(foot, head, 0.35, 17), 0, 'pull rope has a collision-free standing position');
  const tower = level.factory.bellTower({ size: 4.4, floorY: 1.55, postH: 3.4, seed: 47 });
  const triangles = tower.parts.reduce((n, p) => n + (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3, 0);
  assert.equal(tower.parts.length, 16, 'pull merges into the existing rope part');
  assert.equal(tower.colliders.length, 6);
  reports.push({ check: 'landmark diagnosis only', exactColliderCount: physics.statics.length, eye: eye.toArray(), oldAnchors: diagnostic, geometryDerivedAnchors: corrected, reachablePull: bell.position.toArray(), pullHasClearStandingCapsule: true, bellTrianglesBefore: 1626, bellTrianglesAfter: triangles, bellPartsBeforeAndAfter: 16, baselineSurvey: JSON.parse(readFileSync(new URL('../shots/interaction-i1.json', import.meta.url))).extras.landmarks.points.find((p) => p.name === 'east-edge') });
}

// Establish which geometry owns the critic's mountain crop. Rays through its native
// coordinates strike the macro terrain hundreds of metres before the 1.8 km distant
// band begins, so this is a Terrain._macro landform problem, not a ridge-band shader
// or a surface-detail absence.
{
  const terrain = Object.create(Terrain.prototype);
  const pose = SHOTS.wide;
  const camera = new PerspectiveCamera(pose.fov, 2532 / 1170, 0.1, 10000);
  camera.position.set(pose.pos[0], pose.pos[1] + WORLD.PLATEAU_HEIGHT, pose.pos[2]);
  camera.lookAt(pose.target[0], pose.target[1] + WORLD.PLATEAU_HEIGHT, pose.target[2]);
  camera.updateMatrixWorld(true);
  const hits = [];
  for (const [px, py] of [[800, 130], [1040, 212], [1280, 295]]) {
    const ray = new Vector3(px / 2532 * 2 - 1, 1 - py / 1170 * 2, 1)
      .unproject(camera).sub(camera.position).normalize();
    let previous = camera.position.y - terrain._macro(camera.position.x, camera.position.z);
    let hit = null;
    for (let distance = 2; distance < VIEW_DISTANCE; distance += 2) {
      const x = camera.position.x + ray.x * distance;
      const y = camera.position.y + ray.y * distance;
      const z = camera.position.z + ray.z * distance;
      const delta = y - terrain._macro(x, z);
      if (delta <= 0 && previous > 0) { hit = { px, py, distance, x, z }; break; }
      previous = delta;
    }
    assert.ok(hit, `mountain crop ray ${px},${py} must hit macro terrain`);
    assert.ok(hit.distance > CORE_HALF && hit.distance < VIEW_DISTANCE);
    hits.push(hit);
  }
  const height = (x, z) => terrain._macro(x, z);
  const hierarchy = {
    primary: height(-185, -448), primaryFlanks: [height(-95, -633), height(-275, -262)],
    westShoulder: height(-265, -340), westOuter: height(-175, -245),
    eastShoulder: height(-38, -308), eastOuter: height(-104, -221),
  };
  assert.ok(hierarchy.primary > Math.max(...hierarchy.primaryFlanks) + 80);
  assert.ok(hierarchy.westShoulder > hierarchy.westOuter + 70);
  assert.ok(hierarchy.eastShoulder > hierarchy.eastOuter + 40);
  assert.ok(Object.values(hierarchy).flat().every(Number.isFinite));
  reports.push({ check: 'mountain owner and hierarchy', cropRayDistances: hits.map((h) => h.distance), hierarchy });
}

// The close hanging lantern keeps one paper part/draw while gaining three continuous
// under-paper hoops. Their low vertex values route through the existing emissive
// material; paper intensity and the standing tone contract are untouched.
{
  const factory = new PropFactory({});
  const lamp = factory.hangingLantern({});
  const paperParts = lamp.parts.filter((p) => p.material === '__lanternPaper');
  assert.equal(paperParts.length, 1);
  const paper = paperParts[0].geometry;
  const pos = paper.getAttribute('position');
  const color = paper.getAttribute('color');
  const hoopRows = [-0.35 - 0.27 * 0.52, -0.35 - 0.50 * 0.52, -0.35 - 0.73 * 0.52];
  const supportVertices = hoopRows.map((y) => {
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - y) <= 0.008 && color.getX(i) <= 0.53) n++;
    }
    return n;
  });
  assert.ok(supportVertices.every((n) => n >= 28));
  assert.equal(lamp.parts.length, 3, 'supports must not add a material part/draw');
  assert.equal(paper.index.count / 3, 660);
  reports.push({ check: 'lantern form-following supports', continuousHoops: supportVertices.length, supportVertices, paperParts: paperParts.length, paperTrianglesBefore: 504, paperTrianglesAfter: 660 });
}

// The sacred tree's previous clump was three four-corner planes sharing one exact
// centre. Pin the replacement to staggered ten-lobed fans and to the existing single
// blossom part, without turning the structural check into a visual verdict.
{
  const factory = new PropFactory({});
  const sprays = [];
  factory._blossomCluster(sprays, 0, 0, 0, makeRandom(123));
  assert.equal(sprays.length, 3);
  const centres = sprays.map((g) => {
    assert.equal(g.getAttribute('position').count, 11);
    assert.equal(g.index.count / 3, 10);
    assert.deepEqual(Object.keys(g.attributes).sort(), ['aFlutter', 'color', 'normal', 'position', 'uv']);
    const p = g.getAttribute('position');
    return [p.getX(0), p.getY(0), p.getZ(0)];
  });
  assert.equal(new Set(centres.map((p) => p.map((v) => v.toFixed(4)).join(','))).size, 3);
  const tree = factory.sacredTree({ height: 11, depth: 5, seed: 1861, leafy: true });
  const blossom = tree.parts.filter((p) => p.material === '__blossom');
  assert.equal(blossom.length, 1, 'crown remains one merged material part/draw');
  const blossomTriangles = blossom[0].geometry.index.count / 3;
  assert.equal(blossomTriangles, 9090);
  assert.ok(blossomTriangles < 10000);
  const conservativeTriangleDelta = (blossomTriangles - 1818) + (660 - 504) * 9;
  const estimatedPriorWorst = 789214 + conservativeTriangleDelta;
  assert.ok(estimatedPriorWorst <= 900000);
  reports.push({ check: 'sacred-tree clump construction', oldRectangularCardsPerClump: 3, rectangularCardsAfter: 0, lobedSpraysPerClump: sprays.length, distinctSprayCentres: 3, blossomParts: blossom.length, blossomTrianglesBefore: 1818, blossomTrianglesAfter: blossomTriangles, conservativeTriangleDelta, estimatedPriorWorst, rendererMeasurementRequired: true });
}

console.log(JSON.stringify({ behavioralChecksPassed: 9, reports, limits: 'Pure Node behavior/geometry evidence. Does not verify real touch dispatch, HUD pixels, rendered terrain/lantern/blossom appearance, tonal gates or phone performance.' }, null, 2));
