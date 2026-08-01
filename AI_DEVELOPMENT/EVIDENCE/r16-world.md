# Round 16 — [world] evidence

Owner: `src/world/Terrain.js`, `src/world/Props.js`, `src/world/Level.js`,
`src/world/Constants.js`.
Baseline: `shots/phone-*-r16.png`, 2532×1170, phone/MEDIUM, build fingerprint
`8c9d2e4b…`, commit `4811ba0`, clean tree.

Findings routed here:

| id | severity | file | subject |
|---|---|---|---|
| F1 | major | `Terrain.js` | distant terrain desaturated to near-neutral |
| F2 | major | `Props.js` | shrine plaza carries no evidence of use |
| F3 | major | `Props.js` | two backlit nobori render as opaque matte slabs |

All measurements below are `tools/probe.mjs stats` on the named UV box, or a script
that imports `stats()` from that same file so it cannot disagree with it. The
harness is `scratchpad/boxes.mjs`; its first run reproduced the critic's figures
for all four F1 boxes to the digit (`[46.0,46.1,46.3]`, `[61.2,61.3,64.0]`,
`[136.9,125.6,120.1]` sat 0.119, `[211.5,195.0,174.2]` sat 0.182), which is the
apparatus check before anything was changed.

---

## Disproofs — reported as results

### D1. The F1(a) "open ground" box is not distant terrain, and no aerial term touches it

The critic files the box at `wide` UV (0.08,0.62,0.18,0.10) as "the valley floor …
of the 1.8 km landscape". Ray-marching the `wide` pose says otherwise.

`wide` is `pos (6.0, 821.5, 88.0)`, `target (0.0, 816.5, 16.0)`, fov 52°, aspect
2532/1170 = 2.164. The box centre UV (0.17, 0.67) gives NDC (−0.66, −0.34) and a
world ray direction of (−0.6311, −0.1906, −0.7519). The plateau is flat at 812 m
(WORLD.PLATEAU_HEIGHT) out to a radius of 78 m; the eye is 9.5 m above it, so the
ray lands after **49.8 m** at (−25.4, 812, 50.6), radius 56.6 m from the plateau
centre — inside the flat apron.

At 49.8 m the terrain's aerial patch evaluates to exactly zero:
`kgA = 1 − exp(−pow(max(kgDist·kgDens − 90, 0)·0.00085, 1.18))` and `kgDist < 90`,
while `kgMist = smoothstep(915,806,812)·smoothstep(130,520,49.8)` has a zero second
factor. **`kgA = 0`.** Nothing in the aerial term draws those pixels, so the
neutral grey there cannot be haze, and the critic's hypothesis ("the distance fade
blending toward a fixed grey") is not the mechanism for this box.

### D2. F1(a)'s warm/cool split already passes; it is the *mean* that cancels

The box mean is `[46.0,46.1,46.3]` — neutral to 0.3 code values, as filed. But the
mean is the wrong statistic for a warm/cool split, because a correct split cancels
in it. Splitting the same 456×117 box at its own luma quartiles:

| | pixels | mean RGB | R−B |
|---|---|---|---|
| brightest quartile (sunward) | 13,350 | 64.9, 57.7, 52.9 | **+12.1** |
| darkest quartile (shaded) | 13,345 | 30.0, 35.0, 39.0 | **−9.0** |

The critic's own targets are "sunward ground warm (R−B ≥ 12) and shaded ground cool
(B−R ≥ 6)". Measured: **+12.1 and +9.0**. Both already pass on the r16 pixels. The
second box, `wide` UV (0.55,0.60,0.18,0.06), gives +10.2 / +9.2 — one code value
short on the warm side. So F1(a) as a warm/cool complaint is closed by measurement,
and what is actually missing there is F1(d): value structure, `lumaSpread` 47.7
against a target of 80.

### D3. R9-DRESSING-001 (a) and (b) are already satisfied in the placement code

The critic reports the approach lanterns as "all the same model at the same height,
all upright, all with an identical elliptical pool". Reproducing `Level.js`'s
private `makeRandom(0x10ee5a17)` stream in node, in the same draw order as
`_buildLanterns`:

- row A z = 40.03, 46.81, 54.16, 62.27, 67.09 → gaps 6.77, 7.36, 8.11, 4.82,
  mean 6.77, **max deviation ±28.7 %**
- row B z = 40.62, 47.62, 55.49, 63.66, 68.44 → gaps 7.00, 7.86, 8.17, 4.78,
  mean 6.96, **max deviation ±31.2 %**
- approach heights are `0.80 + rnd()·0.44` about a mean of 1.02 → **±21.6 %**
- lean: **6 of 16** placed lanterns lean, by 2.0–4.9°
- moss/lichen weathering: **4 of 16**

against thresholds of ±25 % spacing, ±15 % height, and ≥ 1 in 4 carrying a lean or
weathering difference. All four pass in the geometry. This is a symptom call the
build contradicts, and no placement change was made for it. What the plaza is
genuinely missing is (c) — a walked path that separates from the plaza — and (d),
joint-scale accumulation; both are material work, and both were done.

### D4. The "two large hanging cloth banners" are nobori, and they already carry a hem, a printed device and a rest curl

Confirmed by crop (`sun` UV 0.30–0.48, full height): pole, crossarm and hanging
sheet, two of them, with the great torii's near upright beside them. The critic's
"no printed device" and "no crease" are wrong about the source — `nobori()` stamps
a three-block kanji column into the vertex colour and hangs the sheet on an S curl.
They are right about the *pixels*, and for one reason the source makes obvious: the
ink is authored as `1 − ink·0.80` on a cloth that is already reading near black
when backlit, and the curl is one wavelength across 2.5 m. Neither survives to the
frame. So the finding stands; its stated mechanism does not.

---

## Changes

### C1 `Terrain.js` — aerial perspective stops bleaching chroma (F1b, F1c)

The fade target was `mix(vec3(kgLum), uSkyTint, 0.7)`: three tenths of it was the
surface's own luminance with the chroma removed. Two consequences, both measured
in the file's own comments before this round — line 2489 already recorded that
"barely a third of any lit/shaded colour split survives to the eye" and compensated
in the albedo.

Replaced by `mix(gl_FragColor.rgb, uSkyTint, kgA * 0.616)`.

**The two forms are algebraically identical on an achromatic surface.** Expand:

```
old = c(1 − 0.88a) + 0.88a(0.3·L + 0.7·S) = c(1 − 0.616a) + 0.264a·L + 0.616a·S
new = c(1 − 0.616a)                       + 0.616a·S
old − new = 0.264a·(L − c),  L = luma(c)
```

which is zero for every channel when `c` has no chroma. So this is not a
haze-strength change and cannot move a grey pixel by one code value; it restores
`0.264·kgA` of the surface's own chroma and lifts the cap on how much of the sky's
chroma reaches the far range from 0.7 to 1.0.

`kgA` at the two F1 boxes, from the shader's own optical-depth form:

- mountain body, 1040 m of range to surface at ~1000 m ASL: `kgHb = 0.2326`,
  `kgDens = 0.8925`, **`kgA = 0.488`** → chroma restored 0.129 of the surface's own
- snowcap, ~1300 m of range to ~1150 m ASL: `kgDens = 0.7585`, **`kgA = 0.516`** →
  0.136

Paired with it, the far range's slope-aspect chroma goes 0.30/0.06/−0.26 →
0.40/0.08/−0.34, because the compensation it was carrying is no longer needed at
the same discount.

### C2 `Terrain.js` — snow's lit albedo stops leaning blue (F1c)

`vec3(0.902, 0.922, 0.962)` → `vec3(0.958, 0.930, 0.899)`. Same mean reflectance
(0.929), the lean reversed. The old value is a fresh-powder property; the model
above it is explicitly late-autumn wind-packed cover with rock standing through it,
and it was subtracting from the one surface in the frame that has to read warm at a
13° key. B/R goes 1.067 → 0.938.

### C3 `Terrain.js` — ground cover at the scale the probe box reads (F1d)

Everything in the mid band was locked to ~12 buffer pixels, i.e. 3–8 m of ground
across 30–155 m. The F1(d) probe is 456×117 px and spans roughly 40 m of ground, so
a field that finishes an octave below the window cannot move what the window reads.
Added, inside the existing `coreMid` branch only (30–330 m, core field), two
octaves at 19 m and 59 m split into exposed grit and held turf, skewed bright
rather than symmetric in stops so the floor does not come down with the ceiling.
Cost: two `fbm2(·,2)` calls in a branch near ground and the far massif never enter.

### C4 `Props.js` — cloth transmits (F3)

`_installWind` now also patches the fragment stage of every `CLOTH_MATERIALS`
material with a two-lobe transmission term at `lights_fragment_end`: a wrap term
for light standing on the face we cannot see, and a `pow(·,3)` forward lobe for the
fraction that keeps its direction through a thin sheet, tinted by `diffuseColor`
itself. `USE_TRANSMISSION` is the stock answer and costs a per-material backbuffer
pass; this costs four ALU and no samples. Tinting by `diffuseColor` is what makes
the printed device read — the ink is already in the vertex colour, so it blocks the
transmitted light exactly as it blocks the reflected light.

`directionalLights[0]` is the sun by construction: `Lighting.js` adds its cascade
lights first and they all share one direction and colour, so index 0 is the key and
reading only it cannot double-count the cascades.

Known limitation: the term is unshadowed. Every nobori in the review set stands in
the open, but cloth inside a cast shadow will transmit as though it were not.

### C5 `Props.js` — the nobori gets folds and an irregular outline (F3)

11×22 → 15×30 (484 → 900 triangles), plus standing drape folds ~26 cm apart at
±0.019 m — a ±24° normal swing at a scale that survives at the 66 px the banner
occupies in `sun` — plus a bottom hem that sags away from the pole and an outer
ring perturbed per edge cell so the silhouette is no longer the parametric domain.
Twelve banners are placed, so **+4,992 submitted triangles** at worst pose.

### C6 `Props.js` — the plaza accumulates, and the walked line reads (F2c, F2d)

`kagWear` was `1 − smoothstep(1.6, 4.4, abs(P.x))`: a straight-sided corridor 8.8 m
wide. The `torii` eye stands at x = 1.6, 2 m back from the bottom of frame, where
the frame's half-width is 2.1 m — so the shot contains the middle of that band and
neither of its edges, and the path could not read as a path at any contrast. Now
the centreline wanders on an ~18 m period and the band is 2.3 m of full polish
falling off over 2.2 m, with the on/off contrast raised from ×1.19 to ×1.39.

Accumulation: one 1.6 m field read from both ends — high tail moss holding damp in
the joint, low tail leaf litter and grit drifted into it — gated on a joint mask
taken from the normal map's own z, and scrubbed out of the walked line. One extra
`fbm2` and one extra texture fetch on the ground material.

---

## Verification apparatus

Four other owners are editing this working tree right now, so a capture of it would
have mixed their work into my before/after. The verification build is therefore a
**detached git worktree pinned at `4811ba0`** — the exact commit the r16 review set
was built from — with only `Terrain.js` and `Props.js` copied in, its own `dist/`,
and `node_modules` symlinked. `git status` in it reads exactly two modified files.
`/home/user/game2/dist` is never written. The shared `shots/.rig.lock` and
`shots/.capture.lock` are still taken around the whole build-and-shoot so the rig
stays serialised; one other owner's `interaction-capture` held the capture lock for
53 minutes and this run waited it out.

Consequence to read the numbers with: **the sky fix is not in this build.** The
critic's own instruction on F1 was to fix the sky first and re-measure, and
`uSkyTint` is `sky.horizonColor`, so every figure below is the terrain-only
component of a change whose other half is landing in `Sky.js` this round.

## Results — pass 1 (`r16wld`, phone/MEDIUM, 2532×1170)

Budget, from the rig's own worst-pose assertion:
**draw calls 119 → 120 (limit 140), triangles 784,449 → 781,386 (limit 900,000).**
Boot ok, no page errors, 119 programs.

### F1 — distant terrain

| box | metric | r16 | r16wld |
|---|---|---|---|
| `wide` (0.10,0.12,0.08,0.05) mountain body | saturation | 0.119 | **0.136** |
| | mean R−B | 16.8 | **19.4** |
| `torii` (0.06,0.42,0.12,0.06) mountain body | saturation | 0.105 | **0.120** |
| `wide` (0.30,0.03,0.08,0.05) snowcap | mean R−B | 37.3 | **42.9** |
| | saturation | 0.182 | **0.204** |
| `wide` (0.08,0.62,0.18,0.10) plateau apron | lumaSpread | 47.7 | 48.9 |
| | mean R−B | −0.3 | +0.8 |
| | p50 luma | 45.5 | 46.7 |
| `wide` (0.55,0.60,0.18,0.06) | lumaSpread | 81.5 | 83.6 |

Targets were saturation ≥ 0.20 on the mountain body, R−B ≥ 55 on the snowcap and
lumaSpread ≥ 80 on the apron. Direction right on all three, magnitude short on all
three.

The apron is the interesting failure. C3 raised its mean by 3.5 % where the term as
written should have raised it by ~16 %, and four other boxes on the same surface
moved by 2–5 % likewise. That ratio says the box is not mostly terrain albedo: it is
substantially [foliage]'s instanced ground cover — the "sparse tiny black tufts" the
critic describes — over terrain that is itself in shadow at a 13° key. Terrain
albedo alone cannot take that box to lumaSpread 80, and pushing it harder buys 3 %
per doubling.

### F3 — the nobori

| box | metric | r16 | r16wld |
|---|---|---|---|
| `sun` (0.398,0.56,0.026,0.12) crimson nobori | detail | 3.09 | **4.47** |
| | mean RGB | 121.4, 80.2, 50.7 | **188.3, 86.7, 53.4** |
| | saturation | 0.592 | **0.716** |
| | p50 luma | 83.2 | **102.5** |
| `sun` (0.335,0.56,0.025,0.12) indigo nobori | detail | 5.45 | 5.71 |
| `sun` (0.40,0.80,0.06,0.08) flagstone control | detail | 7.34 | 7.37 |
| | mean RGB | 127.4, 89.4, 65.1 | 126.6, 88.8, 64.4 |

The control box is the apparatus check: the flagstone beside the banner moved by
under one code value, so nothing here is a global exposure shift.

The crimson banner now transmits — mean R +67, p50 luma +23, saturation +0.12 — and
by eye the printed kanji column reads as a dark device inside a glowing sheet, which
is what tinting the transmission by `diffuseColor` was for. The **indigo** banner
barely moves, and that is correct rather than broken: the key is `[1, 0.412, 0.134]`
and an indigo albedo has almost no red to pass, so there is very little light for it
to transmit. Detail is still short of the 6.0 target.

### F2 — the plaza

World coordinates for the probe boxes, by ray-marching the `torii` pose
(`pos (1.6, 813.45, 45.0)`, `target (−0.4, 817.2, 33.0)`, fov 62°) onto y = 812:

| box | world x | world z | range |
|---|---|---|---|
| (0.40,0.86,0.08,0.08) | −1.34 | 35.70 | 9.9 m — **on path** |
| (0.30,0.86,0.08,0.08) | −3.60 | 36.08 | 10.4 m — off path |
| (0.72,0.86,0.08,0.08) | +5.88 | 34.50 | 11.4 m — off path |

| metric | r16 | r16wld |
|---|---|---|
| on-path p50 luma | 46.0 | **49.2** |
| off-path p50 luma (mean of the two) | 42.0 | **41.6** |
| on/off separation | 9.5 % | **18.3 %** |
| off-path green fraction (x = +5.88) | 0.006 | 0.006 |
| off-path green fraction (x = −3.60) | 0.000 | 0.000 |

So the walked line nearly doubled its separation, and **the accumulation was a
no-op**. Diagnosed rather than guessed: moss is gated on `kagJoint * (1 − kagWear)`,
both off-path boxes have `kagWear ≈ 0`, so `(1 − kagWear)` is not the suppressor and
`kagJoint` must be ≈ 0. The mask keyed on the normal map's decoded z through
`smoothstep(0.88, 0.34, z)`, and z on a tangent-space map sits near 1 almost
everywhere — the useful range is whatever is left below it, which for this cobble map
is nothing. Fixed by keying on the xy magnitude instead, which is zero on flat ground
regardless of how hard the map was authored.

## Pass 2 — predictions stated before the capture

Changes: joint mask → `smoothstep(0.04, 0.30, length(normalMap.xy))`; far-range
aspect chroma 0.40/0.08/−0.34 → 0.56/0.10/−0.46; snow surge 2.55 → 2.95; mid-ground
`mBare` gain 0.62 → 1.00; nobori drape amplitude 0.030/0.010 → 0.052/0.019.

1. `torii` off-path box (0.72,0.86) green fraction 0.006 → **≥ 0.05**, hue
   populations 2 → **≥ 3**.
2. on/off path p50 separation 18.3 % → **≥ 25 %**.
3. `wide` mountain body saturation 0.136 → **≥ 0.155**.
4. `wide` snowcap mean R−B 42.9 → **≥ 47**.
5. `sun` crimson nobori detail 4.47 → **≥ 5.5**.
6. Budget holds: triangles < 800,000, draw calls ≤ 125.

## Results — pass 2 (`r16wld2`)

| box | metric | r16 | pass 1 | pass 2 | target |
|---|---|---|---|---|---|
| `wide` mountain body | saturation | 0.119 | 0.136 | **0.145** | 0.20 |
| | mean R−B | 16.8 | 19.4 | **20.8** | — |
| `torii` mountain body | saturation | 0.105 | 0.120 | **0.129** | — |
| `wide` snowcap | mean R−B | 37.3 | 42.9 | **43.1** | 55 |
| | saturation | 0.182 | 0.204 | 0.199 | — |
| | luma p99 | 222.8 | — | 226.2 | no clipping |
| `wide` plateau apron | lumaSpread | 47.7 | 48.9 | **50.6** | 80 |
| `wide` (0.55,0.60) | lumaSpread | 81.5 | 83.6 | **86.2** | — |
| `sun` crimson nobori | detail | 3.09 | 4.47 | **4.62** | 6.0 |
| | mean RGB | 121,80,51 | 188,87,53 | **186,87,54** | — |
| | saturation | 0.592 | 0.716 | **0.713** | — |
| `sun` flagstone control | detail | 7.34 | 7.37 | 7.30 | unchanged |
| `torii` on-path p50 | | 46.0 | 49.2 | **49.0** | — |
| `torii` off-path p50 (mean of two) | | 42.0 | 41.6 | **41.0** | — |
| on/off separation | | 9.5 % | 18.3 % | **19.5 %** | 25 % |

Prediction 1 (green fraction ≥ 0.05) was **wrong, and the metric was wrong with it**:
under a `[1, 0.412, 0.134]` key a green albedo does not come out green. For a moss
tint of `(0.52, 0.86, 0.44)` the lit ratio is R : G = 0.52 : 0.354, so R still leads
and `greenFrac` cannot detect moss in this frame at all. Predictions 3, 4 and 5
missed; 6 held.

The interesting result is what the levers did, not that they missed:

- far-range aspect chroma 0.40 → 0.56 (+40 %) moved mountain saturation
  0.136 → 0.145 (+0.009);
- the snow surge 2.55 → 2.95 (+16 %) moved the snowcap R−B 42.9 → 43.1 (+0.2);
- nobori drape amplitude +73 % moved detail 4.47 → 4.62 (+0.15);
- mid-ground `mBare` 0.62 → 1.00 (+61 %) moved apron lumaSpread 48.9 → 50.6.

Every one of these is deep into diminishing returns, and they all say the same
thing: **the terrain-side levers are exhausted and the far range's colour is now
limited by the in-scatter colour itself.** `uSkyTint` is `sky.horizonColor`, which
in this build is the near-neutral sky the critic filed as its own blocker. The
chroma path from the sky to the far range is now unobstructed (that is C1, and it is
worth 0.264·kgA ≈ 0.13 of the surface's chroma plus the removal of a 0.7 cap); what
it needs is a sky with chroma in it. That is exactly the order the critic asked for
and it is not this owner's file.

The nobori is the round's clear win and it is qualitative as much as numeric: R +65,
p50 luma +19, saturation +0.12, and by eye the sheet now glows with its printed
device reading as a dark figure inside it (crop: `scratchpad/sun-after.png`). Detail
is limited by the 66 px the banner occupies, not by fold amplitude — 73 % more relief
bought 3 % more Laplacian.

## Pass 3 — the plaza accumulation, and its second disproof

Two passes measured the accumulation as ≈ 0 whichever channel the joint mask keyed
on. `Materials.js` says why, and it is deliberate: the `cobble` recipe authors its
joints as "4 mm of dish at ~22 degrees" because a 58° joint wall under a 13° key
turned the whole plaza into a dried lakebed — "lit lip, black core", the review's own
words two rounds ago. **There is no strong joint signal in this material to key on,
and there should not be one.** So the joint term becomes a bias rather than a gate:
accumulation gets 45 % of its weight everywhere off the walked line and the rest
where the surface does dip.

Prediction, stated before the capture: the off-path box `torii` (0.72,0.86,0.08,0.08)
at world x = +5.88 m must move by ≥ 4 code values on at least one channel from its
pass-2 value `[46.8, 35.2, 31.7]`, and the on/off p50 separation must exceed 19.5 %.

What the change is worth arithmetically, independent of the capture: the gate was
measured at ≈ 0, so replacing it with `0.45 + 0.55·kagJoint` takes the term from ≈ 0
to ≈ 0.45 of its authored weight. Off the walked line that is a blend of about
0.45 × 0.3 × 0.70 ≈ 0.095 toward the moss tint and 0.45 × 0.3 × 0.55 ≈ 0.074 toward
the litter tint — a 7–10 % albedo modulation at a 1.6 m scale. It cannot fail to
draw, and it is too small to blotch.

**Not captured.** The pass-3 run held the rig mutex for 18 minutes waiting on another
owner's `interaction-capture --tag=i2 --scenarios=encounters`, which was still running
at 19 minutes with no end in sight; the previous one from the same owner ran 53. Four
other owners were queued behind me for a two-shot verification of one weight, so the
mutex was released rather than held. **This one change is therefore reasoned, not
frame-measured**, and the coordinator should treat it as the single unverified line in
this commit. The two-shot check that would close it is:

```
node tools/capture.mjs --profile=phone --shots=torii,wide --tag=r16wld3
node scratchpad/cmp.mjs shots/phone-torii-r16.png shots/phone-torii-r16wld3.png \
  0.40,0.86,0.08,0.08 0.72,0.86,0.08,0.08 0.30,0.86,0.08,0.08
```

Everything else in this commit was captured and measured, twice.

## Not reached

- **F1 all three numeric targets.** Mountain saturation 0.145 against 0.20, snowcap
  R−B 43.1 against 55, apron lumaSpread 50.6 against 80. The first two are limited
  by `uSkyTint`, which is the sky's own colour and the sky's own blocker; the third
  is limited by the box not being mostly terrain.
- **F2 (d), three separable albedo populations.** Two passes measured the joint mask
  at ≈ 0 and `Materials.js` explains why it must stay that way. Pass 3 raises the
  accumulation off that gate; whether it clears the critic's bar is the open
  question.
- **F2's "concentrate accumulation against the torii post bases and in the lee of
  the buildings."** The ground material has no knowledge of prop positions. Doing it
  properly means Level passing a small array of collector positions into
  `groundMaterial` — both files are mine, but it is new plumbing and was not started
  this round.
- **F3 (a), detail ≥ 6.0 on the banner.** 3.09 → 4.62. A 73 % increase in fold
  amplitude bought 3 % more Laplacian, so the limit is the 66 px the banner occupies,
  not the relief. Reaching 6.0 needs structure at the *texture* scale — a weave in
  the cloth material's own map — and `Materials.js` is not this owner's file.
- **The indigo nobori.** It transmits almost nothing, and correctly so: the key is
  `[1, 0.412, 0.134]` and an indigo albedo has no red to pass. If it has to glow it
  needs a different dye, which is an art-direction decision rather than a bug.

## Ownership note for the coordinator

The sakura **blossom emissive** is `Props.js` (`blossomMaterial`, `__blossom` in
`CLOTH_MATERIALS`); the instanced canopy geometry and its cards are `Foliage.js`.
The round-16 canopy blocker is about card silhouette, alpha falloff and a two-
population hue split — all properties of the cards and their placement — so it
belongs where it was routed. If [foliage] finds the hue split comes from the
blossom *tint* rather than from the cards, that half is mine and I did not touch it
this round.
