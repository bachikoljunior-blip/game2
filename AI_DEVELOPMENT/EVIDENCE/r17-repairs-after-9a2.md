# Round 17 repairs after candidate 9a2

Status: **local candidate repairs pass focused checks; rendered and 20-encounter evidence
remain mandatory.** Baseline evidence is candidate
`9a2e0395772315115ab7214475eef74cab3091f1` in GitHub Actions run
[34622792639](https://github.com/bachikoljunior-blip/game2/actions/runs/34622792639).
No criterion is promoted by the source checks in this record.

## Combat posture race

The corrected 20-encounter trace measured 5 posture-resolved enemy deaths out of 16
(31.25%) against the unchanged `BM-COMBAT-02` threshold of at least 60%. Every ordinary
player hit in that trace added `damage * 0.85` posture. Enemy damage resolution subtracts
both resources, then resolves health death before posture break when one discrete hit empties
both. Replaying the eleven health-only damage sequences as a counterfactual, while retaining
their authored delays and conservatively omitting helpful parries, projected:

| posture per damage | projected posture-resolved deaths |
|---:|---:|
| 0.85 | 5/16 actual; no health-only sequence converts |
| 1.00 | 9/16 |
| 1.05–1.10 | 11/16 |
| 1.15 | 14/16 (87.5%) |

`src/gameplay/Combat.js` therefore changes `POSTURE_PER_DAMAGE` from 0.85 to 1.15. This
does not change the 130 ms perfect window, the late window, dodge invulnerability, guard
conversion, the 750 ms punish opening, or the perfect/late payoff. The real Combat/Enemy
fixture now proves both ashigaru and ronin enter posture break alive before the same authored
hit sequences can deplete HP. This is a bounded source-level prediction, not a benchmark
result; a fresh run of at least 20 scripted encounters decides the criterion.

## Black radial artifact

The independent motion review recorded a dominant staircase-edged dark band in combat and
a related trail behind the walking player. It is present in decoded PNGs and is not an MP4
compression artifact. CPU skinning checks then bounded player and ashigaru body triangle
edges below 0.164 m, weapon lengths below 0.727 m, and cloth extents below 1.599 m with no
non-finite value. The combat band also begins by frame 5, before an attack clip or active
weapon. This rejects a spanning Rig/weapon/trail polygon as the direct mechanism.

The candidate's MEDIUM tier disables TAA and motion blur but enables god rays at a
quarter-resolution 337x156 buffer. Between combat setup and the first band, camera travel is
only 0.0258 m; the material change is the appearance of one enemy 6.52 m from the camera.
The god-ray occlusion pass treated every near opaque texel as a zero emitter and marched it
toward the sun for 24 samples. That makes a compact fighter silhouette a screen-spanning
relative dark shaft whose edges inherit the quarter-resolution staircase.

`src/render/PostFX.js` now classifies only a 6–12 m near-field depth discontinuity across
the sun ray as an omitted observation. The radial pass skips those packed-alpha samples and
renormalises the remaining radiance, capped at 1.5x. Continuous near terrain remains an
occluder, and all architecture at 18 m or farther keeps the authored shaft pattern. God rays
remain enabled. `tools/check-postfx-r17.mjs` verifies those boundaries and the compensation
cap. A replacement native render must prove the black band is gone without erasing the
world/architecture shafts.

## Cloth update defect

The Rig investigation found a separate confirmed character defect. `Float32BufferAttribute`
cloned the typed arrays supplied by `ClothBatch`, so the Verlet solver updated `pos`/`nor`
arrays that were no longer the arrays uploaded to the GPU. `src/anim/Rig.js` now uses shared
dynamic `BufferAttribute` instances and flushes initial cloth positions/normals before first
render. `tools/check-rig-r17.mjs` verifies array identity, finite initial geometry, bounded
cloth extents, bounded skinned triangle edges, and weapon length for the player and ashigaru.
Rendered character construction still requires a new independent review.

## Motion fixture and verification boundary

The previous fixed late tap/flick never intersected an enemy hit volume. The replacement
combat clip uses the already-tested aggressive-v2 script through registered DOM pointer and
guard input, with no combat-state injection. It must still produce a real enemy startup,
active window, and enemy-attributable hit, damage-taken, parry, or clash inside the 180-frame
clip. Because this repair tree changes game source, the next CI must run the full evidence
job and use normal `[motion]` opt-in; it must not reuse 9a2's interaction result as if the
build were unchanged.

Focused local checks and the production build pass. Remaining proof is the full five-frame
gate, at least 20 scripted encounters, all 300 consecutive motion frames, coverage validation,
and a fresh independent motion/still review. Software rendering is not physical-device
performance evidence.
