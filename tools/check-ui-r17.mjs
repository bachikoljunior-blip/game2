import assert from 'node:assert/strict';
import { Input } from '../src/core/Input.js';
import { TouchControls } from '../src/ui/TouchControls.js';
import { HUD } from '../src/ui/HUD.js';
import { Menus } from '../src/ui/Menus.js';

globalThis.window = Object.assign(new EventTarget(), { innerWidth: 844, innerHeight: 390 });
globalThis.document = new EventTarget();
const canvas = new EventTarget();
const input = new Input(canvas);
function dispatch(target, type, fields) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, fields);
  target.dispatchEvent(e);
}
const touch = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 520, clientY: 130 };
dispatch(canvas, 'pointerdown', touch);
dispatch(window, 'pointermove', { ...touch, clientX: 640 });
dispatch(window, 'pointercancel', { ...touch, clientX: 640 });
assert.equal(input.state.slashes.length, 0, 'OS-cancelled drag must not turn into a slash');
assert.equal(input.consume('attack'), false, 'cancel must not tap attack');
input.state.pressed.add('interact');
input.state.slashes.push({ dir: 'r', power: 1, t: performance.now() });
input._pendingLook.set(1, 1);
input.state.lockHeld = true;
input.releaseAll();
input.update();
assert.equal(input.consume('interact'), false, 'pause must not retain a pending bell activation');
assert.equal(input.state.slashes.length, 0);
assert.equal(input.state.look.length(), 0);
assert.equal(input.state.lockHeld, false);

const rect = { x: 450, y: 100, w: 180, h: 80 };
input.registerZone('interact', () => rect);
dispatch(canvas, 'pointerdown', { ...touch, pointerId: 2 });
assert.equal(input.consume('interact'), true);
assert.equal(input.consume('attack'), false);

const gamepad = { axes: [1, 0, 0, 0], buttons: [] };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [gamepad] }, configurable: true });
input.usingTouch = false;
input._gamepadIndex = 0;
input.update();
assert.ok(input.state.move.length() > 0);
gamepad.axes[0] = 0;
input.update();
assert.equal(input.state.move.length(), 0, 'neutral gamepad must stop the last movement');
input._gamepadIndex = null;
dispatch(window, 'pointerup', { ...touch, pointerId: 2 });
input.endFrame();
dispatch(canvas, 'pointerdown', { ...touch, pointerId: 3, pointerType: 'mouse' });
assert.equal(input.consume('interact'), true, 'context control must work with a mouse too');
assert.equal(input.consume('attack'), false);

// Menus handles keydown in capture phase, before Input's bubble listener.
const menus = new Menus({ input, engine: { paused: false, contextLost: false }, level: { restart: () => input.releaseAll() } });
menus.mode = 'death';
input.enabled = false;
const retry = new Event('keydown', { cancelable: true });
Object.assign(retry, { code: 'Space' });
menus._key(retry);
input._key(retry, true);
assert.equal(menus.mode, 'none');
assert.equal(input.enabled, true);
assert.equal(input.consume('dodge'), false, 'Retry must not leak Space to gameplay');
menus.ctx.engine.contextLost = true;
menus._setPaused(false);
assert.equal(input.enabled, false, 'Resume cannot re-enable input while graphics are suspended');
menus.ctx.engine.contextLost = false;
menus._setPaused(false);
assert.equal(input.enabled, true);

let layouts = 0;
for (const [w, h, inset] of [[568, 320, 0], [667, 375, 0], [844, 390, 44], [932, 430, 34]]) {
  for (const mirror of [false, true]) {
    const s = Math.max(.8, Math.min(1.35, Math.min(w * .55, h) / 430));
    const safe = { left: inset, right: inset, top: 0, bottom: inset ? 21 : 0 };
    const ctx = { input: { stickSide: mirror ? 'right' : 'left' }, settings: { leftHanded: mirror } };
    const hud = Object.assign(Object.create(HUD.prototype), { ctx, w, h, s, safe, dpr: 1, ink: { sprite: () => ({}) }, _interactionRect: { x: 0, y: 0, w: 0, h: 80 } });
    ctx.hud = hud;
    const controls = hud.touch = new TouchControls(ctx, hud);
    controls.resize(w, h);
    ctx.menus = new Menus(ctx);
    ctx.menus.settings.leftHanded = mirror;
    ctx.menus.resize(w, h);
    assert.equal(hud._placeInteraction(), true, `${w}: context action remains available`);
    const all = [...controls.buttons, { name: 'interact', r: 40, hit: 40, rect: hud._interactionRect }, { name: 'pause', r: ctx.menus._sealSize / 2, hit: ctx.menus._pauseZoneRect.w / 2, rect: ctx.menus._pauseZoneRect }];
    for (const b of all) {
      assert.ok(b.r * 2 >= 48 && b.hit * 2 >= 64, `${w}: target size ${b.name}`);
      assert.ok(b.rect.x >= safe.left + 16 && b.rect.x + b.rect.w <= w - safe.right - 16, `${w}: horizontal edge ${b.name}`);
      assert.ok(b.rect.y >= safe.top + 16 && b.rect.y + b.rect.h <= h - safe.bottom - 16, `${w}: vertical edge ${b.name}`);
      for (const other of all) if (other !== b) {
        const r = other.rect;
        const overlap = b.rect.x < r.x + r.w && b.rect.x + b.rect.w > r.x && b.rect.y < r.y + r.h && b.rect.y + b.rect.h > r.y;
        assert.equal(overlap, false, `${w}: ${b.name} steals ${other.name}`);
      }
    }
    layouts++;
  }
}
console.log(`UI: ${layouts} landscape/notch/handedness layouts; no intersecting hit zones, 16px OS margins, cancelled gestures and paused input pass. Canvas art and real digitiser remain browser/device gates.`);
