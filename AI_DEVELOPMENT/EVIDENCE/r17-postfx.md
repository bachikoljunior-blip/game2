# Round 17 — [postfx] — the sun disc renders neutral white

Finding: MAJOR, `sun` + `valley`, owner `src/render/PostFX.js`. Unchanged since round 16,
where it was filed as a minor against `Sky.js` and not fixed.

File changed: `src/render/PostFX.js` only.

---

## Apparatus, checked before anything was believed

- **The review set is tier MEDIUM, not HIGH.** `shots/report-r17.json` records `stats.tier 1`
  and `TIER = { LOW: 0, MEDIUM: 1, HIGH: 2, ULTRA: 3 }` (`src/core/Quality.js:9`); the live
  probe read back `quality.tier === 1` on the same URL the rig uses. The round brief said
  HIGH. Every measurement below was therefore taken at `q=medium`, matching the frames the
  critic judged. At MEDIUM the composite compiles with `USE_BLOOM USE_GODRAYS USE_CHROMATIC
  USE_GRAIN USE_CAS USE_FXAA USE_AUTO_EXPOSURE USE_LUT` — no DOF, no TAA, no motion blur —
  read back from `pipeline.mComposite.defines` in the running page, not from the preset table.
- **My probe reproduces the critic's four boxes exactly** off the committed r17 PNGs:
  `node tools/probe.mjs px shots/phone-sun-r17.png 1520,525,40,40` → mean RGB
  253.3/253.1/244.0, saturation 0.037; `1300,525,40,40` → 238.5/221.0/156.4, saturation 0.344;
  `phone-valley-r17.png 930,30,30,30` → 246.1/246.4/244.7, saturation 0.007;
  `790,30,30,30` → 223.8/214.7/170.3, saturation 0.239. Same numbers as the finding, so the
  measuring apparatus and the critic's are the same apparatus.
- **One rig fault of my own, caught and fixed before it produced a number.** My first probe
  boot issued `__kagerouStart()` and `menus.skipIntro()` in a single `page.evaluate`, and
  every frame it took was the 陽炎 title card over an ink wash — the disc box read
  2.9/2.0/2.0. This is the round-16 fault in HANDOFF, re-committed verbatim. The rig now
  splits the two evaluates and asserts a mid-frame `luma.p50 > 30` before it will measure a
  frame. No number in this file comes from the discarded boot.
- Measurements were taken from a private probe on an isolated build of `504477a` in
  `/tmp/.../scratchpad`, never from `tools/capture.mjs` — three other owners held the rig.

---

## Hypothesis: proved

The critic's routing note was explicitly not a proof ("if PostFX proves the clip happens
before it receives tScene, say so and hand it back"). It is PostFX's, and the mechanism is
the ACES fit's asymptote, not the emitter.

`rrtOdtFit(v) = (v(v + 0.0245786) - 0.000090537) / (v(0.983729v + 0.432951) + 0.238081)`
tends to `1/0.983729 = 1.0166` as `v` grows, and crosses 1.0 at `v = 25.67`. Solving
`0.016271v² - 0.408372v - 0.238172 = 0` gives that root exactly. Because the fit is applied
per channel and all three channels share one asymptote, **every colour whose channels are all
past that point is mapped to the same white**, whatever its chroma. The map is many-to-one up
there, which is precisely why round 16's input-side experiment failed: cutting the disc's
radiance 53x from the sky side returned saturation 0.010, not 0.25 — a smaller number inside
a many-to-one region is still inside it.

**The decisive test is the fix itself.** The rolloff below is a *scalar multiply of the
composite's tone-map input*. A scalar multiple of a neutral colour is still neutral, so if
the chroma had already been destroyed upstream — in `Sky.js`, in the HDR buffer, in the
additive bloom or god-ray terms — no value of the knee or ceiling could produce a saturated
disc. It produces one (numbers below). That is a proof, not an inference, that the composite
receives the disc with its chroma intact and destroys it at the tone map.

MEASURED_TAP

---

## What changed

`src/render/PostFX.js`, one new function in `FRAG_COMPOSITE` plus its uniform:

```glsl
vec3 highlightRolloff(vec3 c) {
  float k = uHiRolloff.x, cap = uHiRolloff.y;
  float peak = max(c.r, max(c.g, c.b));
  if (cap <= k || peak <= k) return c;
  float span = cap - k;
  return c * ((k + span * (1.0 - exp(-(peak - k) / span))) / peak);
}
```

called as the first line of `tonemap()`, so it covers the Narkowicz (LOW tier) branch too.
`hiRolloffKnee = 2.0`, `hiRolloffCeiling = 3.2`, pushed through `uHiRolloff` in
`_passComposite`. Setting the ceiling at or below the knee makes the pass an exact identity,
which is what the ablation below uses.

Three properties that matter:

- **Hue is exactly invariant.** The correction is one scalar multiplying all three channels,
  so `(max − min)` and `(G − B)` scale together and the HSV hue angle is unchanged. This is a
  saturation restore, never a hue push.
- **Below the knee it is an identity by construction**, not by tuning: `peak <= k` returns `c`
  untouched. The knee is above every pixel in the review set that must not move.
- **It can only darken**, so it cannot lift the black floor. `p0.1` is unreachable from this
  branch.

Knee and ceiling were sized against an offline twin of the whole composite tail (ACES fit,
vignette, sRGB encode, lift/gamma/gain, contrast, the 32³ LUT rebuilt from `_gradeSample`
with its 8-bit quantisation, and `filmicToeShoulder`). The twin was validated before it was
used: it predicts the `valley` disc's clipped white as (246.6, 246.8, 245.4) against the
frame's measured (246.1, 246.4, 244.7) — inside 0.7 of a code value on all three channels,
including the vignette's tilt that makes that disc 246 rather than 255.

MEASURED_RESULTS

---

## Disproved / ruled out, so the next round does not rebuild on them

- **"Lower the disc's input radiance."** Already dead from round 16 (53x cut → 0.010) and now
  explained: below 25.67 linear the fit separates channels, above it does not, so the input
  side has no lever that is not also a two-stop hole in the sky. Not re-tested, per the brief.
- **"It is a saturation problem, so push saturation."** `uSaturation` is applied in linear
  HDR *before* the fit; raising it moves the whole frame and still lands in the same
  many-to-one region at the disc. The sky control boxes are the guard against this reading,
  and they are what the ablation holds still.
- **"The disc's white comes from the additive bloom or god-ray terms"** (they are added ahead
  of exposure and the fit, and HANDOFF records a god-ray pass that once manufactured white
  from a constant emission floor). MEASURED_ADDITIVE
