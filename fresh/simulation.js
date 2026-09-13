// Fresh implementation. This module has no rendering, browser or legacy imports.
export const STEP = 1 / 60;
export const OBSTACLES = [
  { x: -3.5, z: 7, w: .55, d: .55, h: 4.5 },
  { x: 3.5, z: 7, w: .55, d: .55, h: 4.5 },
  { x: 0, z: -23, w: 10, d: 7, h: 5 },
];
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const face = (a, b) => Math.atan2(b.x - a.x, -(b.z - a.z));
const actor = (id, x, z) => ({ id, x, z, yaw: 0, hp: 100, posture: 0,
  state: 'idle', age: 0, guardAge: 99, hit: [], cooldown: 0, stride: 0 });
export function createWorld() {
  return { time: 0, remainder: 0, ticks: 0, mode: 'playing', player: actor('player', 0, 18),
    enemies: [actor('sentinel', 0, 1), actor('retainer', -3, -9), actor('warden', 3, -16)],
    locked: null, events: [], totals: { hits: 0, received: 0, parries: 0, kills: 0 } };
}
function enter(a, state) { a.state = state; a.age = 0; a.hit = []; }
function move(a, dx, dz) {
  a.x = Math.max(-13, Math.min(13, a.x + dx));
  a.z = Math.max(-28, Math.min(23, a.z + dz));
  const r = .35;
  for (const o of OBSTACLES) {
    const x = Math.max(o.x - o.w / 2, Math.min(o.x + o.w / 2, a.x));
    const z = Math.max(o.z - o.d / 2, Math.min(o.z + o.d / 2, a.z));
    const d = Math.hypot(a.x - x, a.z - z);
    if (d > 0 && d < r) { a.x += (a.x - x) / d * (r - d); a.z += (a.z - z) / d * (r - d); }
    else if (d === 0) {
      const sides = [[o.x - o.w / 2 - r, a.z], [o.x + o.w / 2 + r, a.z],
        [a.x, o.z - o.d / 2 - r], [a.x, o.z + o.d / 2 + r]];
      sides.sort((p, q) => Math.hypot(p[0] - a.x, p[1] - a.z) - Math.hypot(q[0] - a.x, q[1] - a.z));
      [a.x, a.z] = sides[0];
    }
  }
  a.stride += Math.hypot(dx, dz);
}
function event(w, type, a, b) { w.events.push({ type, time: w.time, source: a.id, target: b.id, x: b.x, z: b.z }); }
function strike(w, a, b) {
  if (b.hp <= 0 || a.hit.includes(b.id) || distance(a, b) > 1.95 ||
      Math.abs(angleDelta(face(a, b), a.yaw)) > .95) return;
  a.hit.push(b.id);
  if (b.state === 'dodge' && b.age < .32) { event(w, 'evade', a, b); return; }
  const facing = Math.abs(angleDelta(face(b, a), b.yaw)) < 1.1;
  if (b.state === 'guard' && facing) {
    if (b.guardAge <= .15) {
      a.posture += 52; enter(a, a.posture >= 100 ? 'broken' : 'stagger');
      w.totals.parries++; event(w, 'parry', a, b);
    } else {
      b.posture += 34; if (b.posture >= 100) enter(b, 'broken');
      event(w, 'block', a, b);
    }
    return;
  }
  const damage = b.state === 'broken' ? 100 : a.id === 'player' ? 34 : 24;
  b.hp = Math.max(0, b.hp - damage); b.posture += 20;
  enter(b, b.hp === 0 ? 'dead' : b.posture >= 100 ? 'broken' : 'stagger');
  if (a.id === 'player') w.totals.hits++; else w.totals.received++;
  event(w, 'hit', a, b);
  if (b.hp === 0) { if (b.id !== 'player') w.totals.kills++; event(w, 'death', a, b); }
}
export function stepWorld(w, input = {}) {
  if (w.mode !== 'playing') return;
  w.time += STEP; w.ticks++; w.events = w.events.filter(e => w.time - e.time < 1);
  const p = w.player, actors = [p, ...w.enemies];
  for (const a of actors) {
    a.age += STEP; a.cooldown = Math.max(0, a.cooldown - STEP);
    if (a.state === 'guard') a.guardAge += STEP; else a.guardAge = 99;
    if (a.state === 'idle') a.posture = Math.max(0, a.posture - STEP * 7);
    if ((a.state === 'attack' && a.age >= .65) || (a.state === 'stagger' && a.age >= .38) ||
        (a.state === 'dodge' && a.age >= .46) || (a.state === 'broken' && a.age >= 1.8)) {
      if (a.state === 'broken') a.posture = 0;
      enter(a, 'idle');
    }
  }
  if (w.locked && !w.enemies.some(e => e.id === w.locked && e.hp > 0)) w.locked = null;
  if (input.lock) {
    const targets = w.enemies.filter(e => e.hp > 0 && distance(p, e) < 12).sort((a,b) => distance(p,a)-distance(p,b));
    w.locked = w.locked ? null : targets[0]?.id ?? null;
  }
  const target = w.enemies.find(e => e.id === w.locked);
  if (target && p.state !== 'attack' && p.state !== 'dead') p.yaw = face(p, target);
  if (p.state === 'guard' && !input.guard) enter(p, 'idle');
  if (p.state === 'idle' || p.state === 'guard') {
    if (input.dodge) enter(p, 'dodge');
    else if (input.attack) enter(p, 'attack');
    else if (input.guard && p.state !== 'guard') { enter(p, 'guard'); p.guardAge = 0; }
    const x = input.x || 0, z = input.z || 0, n = Math.max(1, Math.hypot(x,z));
    if (p.state === 'idle' || p.state === 'guard') {
      move(p, x/n*STEP*3.8, z/n*STEP*3.8);
      if (!target && Math.hypot(x,z) > .1) p.yaw = Math.atan2(x, -z);
    }
  }
  if (p.state === 'dodge') move(p, Math.sin(p.yaw)*STEP*7, -Math.cos(p.yaw)*STEP*7);
  // One attacking enemy at a time gives other combatants an observable circling role.
  let occupied = w.enemies.some(e => e.state === 'windup' || e.state === 'attack');
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    if (e.state === 'idle' && distance(e,p) < 11) {
      e.yaw = face(e,p);
      if (distance(e,p) > 1.65) move(e, Math.sin(e.yaw)*STEP*1.8, -Math.cos(e.yaw)*STEP*1.8);
      else if (!occupied && e.cooldown === 0) { enter(e,'windup'); occupied = true; }
    }
    if (e.state === 'windup' && e.age >= .65) { enter(e,'attack'); e.cooldown = 1.1; }
  }
  for (const a of actors) {
    if (a.state !== 'attack') continue;
    if (a.age < .18) {
      // A lunge closes distance; it must not carry the attacker through its target.
      const targets=(a===p?w.enemies:[p]).filter(b=>b.hp>0 && Math.abs(angleDelta(face(a,b),a.yaw))<.95);
      const gap=targets.length?Math.min(...targets.map(b=>distance(a,b))):Infinity;
      const travel=Math.min(STEP*1.8,Math.max(0,gap-1.1));
      move(a, Math.sin(a.yaw)*travel, -Math.cos(a.yaw)*travel);
    }
    if (a.age >= .18 && a.age <= .34) {
      for (const b of a === p ? w.enemies : [p]) strike(w,a,b);
    }
  }
  if (p.hp <= 0) w.mode = 'defeat';
  else if (w.enemies.every(e => e.hp <= 0)) w.mode = 'victory';
}
export function advance(w, seconds, input = {}) {
  w.remainder += Math.min(.25, Math.max(0, seconds));
  let first = true;
  while (w.remainder + 1e-10 >= STEP) {
    stepWorld(w, first ? input : { ...input, attack: false, dodge: false, lock: false });
    w.remainder -= STEP; first = false;
  }
  return !first;
}
