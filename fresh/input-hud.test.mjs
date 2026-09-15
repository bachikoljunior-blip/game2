import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInput } from './input.js';

// Callback-level regression coverage; this does not emulate browser pointer dispatch.
class Element {
  constructor(action) {
    this.dataset = { action };
    this.style = {};
    this.listeners = new Map();
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  emit(type, pointerId, extra = {}) {
    const event = { pointerId, clientX: 0, clientY: 0, preventDefault() {}, ...extra };
    for (const callback of this.listeners.get(type) ?? []) callback(event);
  }
  setPointerCapture() {}
  querySelector() { return this.knob; }
  querySelectorAll() { return this.buttons; }
}

function fixture(t) {
  const canvas = new Element(), pad = new Element(), touch = new Element();
  const buttons = Object.fromEntries(['guard', 'lock', 'attack', 'dodge'].map(action => [action, new Element(action)]));
  pad.knob = new Element();
  touch.buttons = Object.values(buttons);
  const window = new Element(), document = new Element();
  document.querySelector = selector => selector === '#touch' ? touch : pad;
  const globals = { window, document, matchMedia: () => ({ matches: true }), navigator: { maxTouchPoints: 3 } };
  const descriptors = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  t.after(() => {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let pauses = 0;
  const input = createInput(canvas, () => { pauses++; });
  input.setActive(true);
  return { input, canvas, pad, buttons, window, get pauses() { return pauses; } };
}

const releases = ['pointerup', 'pointercancel', 'lostpointercapture'];
for (const action of ['lock', 'attack', 'dodge']) {
  for (const release of releases) {
    test(`held guard survives unrelated ${action} ${release}`, t => {
      const { input, buttons } = fixture(t);
      buttons.guard.emit('pointerdown', 1);
      assert.equal(input.sample().guard, true);
      buttons[action].emit('pointerdown', 2);
      buttons[action].emit(release, 2);
      assert.equal(input.sample().guard, true);
    });
  }
}

for (const release of releases) {
  test(`guard's own ${release} releases guard`, t => {
    const { input, buttons } = fixture(t);
    buttons.guard.emit('pointerdown', 1);
    assert.equal(input.sample().guard, true);
    buttons.guard.emit(release, 1);
    assert.equal(input.sample().guard, false);
  });
}

for (const reset of ['clear', 'deactivate', 'blur']) {
  test(`${reset} clears guard ownership and allows clean guard release after resume`, t => {
    const f = fixture(t);
    f.buttons.guard.emit('pointerdown', 1);
    f.window.emit('keydown', 0, { code: 'KeyQ', repeat: false });
    assert.equal(f.input.sample().guard, true);
    if (reset === 'clear') f.input.clear();
    else if (reset === 'deactivate') f.input.setActive(false);
    else f.window.emit('blur', 0);
    assert.equal(f.input.sample().guard, false);
    assert.equal(f.pauses, reset === 'blur' ? 1 : 0);
    f.input.setActive(true);
    // Pointer 1 deliberately never releases: a reset must discard its ownership.
    f.buttons.guard.emit('pointerdown', 2);
    assert.equal(f.input.sample().guard, true);
    f.buttons.guard.emit('pointerup', 2);
    assert.equal(f.input.sample().guard, false);
  });
}

function updateActualHud(world) {
  const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  // Execute the actual target-selection + HUD-assignment block, not a copied implementation.
  // Keep this boundary explicit: it must fail visibly if a refactor moves the block.
  const block = source.match(/const locked=[\s\S]*?(?=\s*const newObjective=)/);
  assert.ok(block, 'Could not locate current main.js enemy-HUD block; update extraction after refactoring');
  const target = { textContent: '' };
  const document = { querySelector(selector) { assert.equal(selector, '#enemy'); return target; } };
  new Function('world', 'document', block[0])(world, document);
  return target.textContent;
}

const hudWorld = locked => ({
  locked,
  player: { x: 0, z: 18 },
  enemies: [
    { id: 'sentinel', x: 0, z: 1, hp: 34 },
    { id: 'retainer', x: 0, z: 17, hp: 100 },
  ],
});

test('actual HUD reports locked sentinel health despite nearer retainer', () => {
  assert.equal(updateActualHud(hudWorld('sentinel')), '対峙　34 / 100');
});

test('actual HUD displays no opponent health when unlocked', () => {
  assert.equal(updateActualHud(hudWorld(null)), '');
});

for(const pointerType of ['touch','pen']){
  for(const path of [[],[3],[36],[42,0]]){
    test(`${pointerType} canvas gesture ${JSON.stringify(path)} changes only camera`,t=>{
      const {input,canvas}=fixture(t);
      canvas.emit('pointerdown',1,{pointerType,button:0,timeStamp:0});
      for(const clientX of path)canvas.emit('pointermove',1,{clientX});
      canvas.emit('pointerup',1,{clientX:path.at(-1)??0,timeStamp:100});
      assert.equal(input.sample().attack,false);
      if(path.length&&path.at(-1)!==0)assert.notEqual(input.orbit,0);
    });
  }
}
test('primary mouse short click attacks exactly once',t=>{
  const {input,canvas}=fixture(t);
  canvas.emit('pointerdown',1,{pointerType:'mouse',button:0,timeStamp:20});
  canvas.emit('pointerup',1,{timeStamp:120});
  assert.equal(input.sample().attack,true);input.consume();assert.equal(input.sample().attack,false);
});
for(const scenario of ['returning drag','release-only displacement','long press','secondary button','nonprimary','cancel','lost capture','deactivate']){
  test(`desktop ${scenario} cannot become an attack`,t=>{
    const {input,canvas}=fixture(t);
    canvas.emit('pointerdown',1,{pointerType:'mouse',button:scenario==='secondary button'?2:0,isPrimary:scenario!=='nonprimary',timeStamp:0});
    if(scenario==='returning drag'){canvas.emit('pointermove',1,{clientX:5});canvas.emit('pointermove',1,{clientX:0});}
    if(scenario==='cancel')canvas.emit('pointercancel',1);
    if(scenario==='lost capture')canvas.emit('lostpointercapture',1);
    if(scenario==='deactivate')input.setActive(false);
    canvas.emit('pointerup',1,{clientX:scenario==='release-only displacement'?12:0,timeStamp:scenario==='long press'?700:150});
    assert.equal(input.sample().attack,false);
  });
}
test('second canvas pointer neither hijacks orbit nor restores a click after release',t=>{
  const {input,canvas}=fixture(t);
  canvas.emit('pointerdown',1,{pointerType:'mouse',button:0,timeStamp:0});
  canvas.emit('pointerdown',2,{pointerType:'touch'});
  canvas.emit('pointermove',2,{clientX:100});assert.equal(input.orbit,0);
  canvas.emit('pointercancel',2);
  canvas.emit('pointermove',1,{clientX:3});assert.notEqual(input.orbit,0);
  canvas.emit('pointerup',1,{clientX:3,timeStamp:100});assert.equal(input.sample().attack,false);
});
test('two fingers can guard and turn while only the dedicated attack button attacks',t=>{
  const {input,canvas,buttons}=fixture(t);
  buttons.guard.emit('pointerdown',1);
  canvas.emit('pointerdown',2,{pointerType:'touch'});canvas.emit('pointermove',2,{clientX:45});canvas.emit('pointerup',2,{clientX:45});
  assert.equal(input.sample().attack,false);assert.equal(input.sample().guard,true);
  buttons.attack.emit('pointerdown',3);assert.equal(input.sample().attack,true);
  buttons.attack.emit('lostpointercapture',3);assert.equal(input.sample().guard,true);
});
