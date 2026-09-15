# 2026-09-15 — quiet air and sandal contact revision

Author / performing agent: `/root/game2_ultra_art_sound_physics/sound_revision`.
Parent / integration owner: `/root/game2_ultra_art_sound_physics`.
Own work completed at `2026-09-15T12:07:13Z`.

I accepted the parent's finite sound-design, implementation and measurement task,
designated as an Ultra child. This is my own acceptance/result record, not a
substitute for the parent's actual spawn receipt or a claim about hidden backend
reasoning strength. I did not delegate, commit, stage, write a remote, publish,
edit automation, or write the parent's acceptance/integration record.

Repository: `bachikoljunior-blip/game2`; production branch:
`codex/game2-rebuild-20260913`. Starting SHA supplied by the integrator after its
authorized canonical GitHub read:
`b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`. The same local `git show` source was
archived before editing. I read CLAUDE.md, FIXED_INSTRUCTIONS.md, the current
SESSION_STATE continuation and FRESH_DESIGN before implementing this correction.
The deadline stays `2026-09-20T07:51:53Z`.

## Design and actual change

The user's direct listening feedback says the wind suggests too much wind and
the footfalls are too heavy. This supplied perceptual feedback is the starting
evidence. My subsequent numerical work is not a replacement listening verdict.

- Air: replace the large low-frequency noise component with stochastic air
  filtered above the rumble region and below the harsh upper range. Preserve
  200–1000 Hz body; do not substitute pure high-frequency hiss. Use bounded slow
  swells, 2.2/2.5-second entry/exit envelopes and gentler bed overlap.
- Leaves: replace 36 overlapping broad noise grains with five short irregular
  fibre-contact packets, separated by silence. Change environmental trigger
  interval from 2.3–5.8 to 5.8–11.0 seconds. A leaf encounter remains synchronous.
- Feet: remove the 153 Hz stone oscillator and the large low-noise impact in both
  surfaces. A short band-limited woven sole contact is followed by forefoot
  settlement and scattered fibre/soil grains. Earth spreads the contact and has
  more scattered friction; stone has a shorter contact edge. The generator stays
  original and boot-generated, without runtime recordings or copied reference
  material.
- Force: use actual distance / elapsed simulation time from the existing contact
  tracker. Walk at 1.8 m/s uses gain 0.57647, run at 3.8 m/s uses 0.8. Playback
  rates are 1.00294 and 1.05, with narrow additional variation. Slower contact
  reduces gain without shifting a foot into a pitched bass impact. The previous
  common foot gain was 0.8 at every speed. Reduce the repetitive accompanying
  cloth layer and shorten its fibre excitation.
- Shared field: read the vegetation owner's preserved
  `sampleWind(x,z,time).pressure` API; `.28–.72` is a normalized artistic load,
  not pascals. Smooth a dedicated air bus with a 0.65-second time constant.
  It applies to wind/leaves only. Master gain remains 0.78, and weapon/body
  contact remains on the master bus. A gust encounter has a bounded 0.24 source
  gain so it cannot add a full-volume second wind bed.
- Keep event identity delivery, same-tick hit/death, pause/retry cancellation,
  wall-push silence, left/right alternation and the shared gait contact phase.
  Input and simulation mechanics were not edited by this task.

## Measurements

The comparison here is **old synthesis vs revised synthesis**, not an anonymous
comparison against the selected reference work. All formal 10-element verdicts
remain **not measured**. New perceptual naturalness is **not measured**.

`fresh/audio-analysis.mjs` performs a zero-padded whole-clip FFT with one-sided
power accounting, RMS, centroid, 10–90% cumulative energy width and 20 ms activity
windows. It measures all four generated variants. Known 100 Hz and 2 kHz tone
tests verify band assignment. These are digital full-scale measurements, not
physical sound-pressure measurements. The table uses variant 0, at 24 kHz,
without peak normalization or loudness mastering.

| Source | Below 200 Hz before | Below 200 Hz after | Source RMS change | Below-200-Hz RMS change | Energy 10–90% before → after |
|---|---:|---:|---:|---:|---:|
| Wind | 73.82% | 1.39% | −6.28 dB | −23.53 dB | 7037 → 6165 ms |
| Leaves | 4.85% | 0.018% | −17.20 dB | −41.43 dB | 2179 → 1350 ms |
| Cloth | 14.01% | 0.105% | −18.28 dB | −39.53 dB | 106 → 66.3 ms |
| Earth contact | 31.28% | 0.803% | −14.26 dB | −30.17 dB | 82.3 → 60.0 ms |
| Stone contact | 49.08% | 0.367% | −8.63 dB | −29.89 dB | 28.2 → 21.1 ms |

The revised wind still has 44.81% of energy between 200–1000 Hz. Revised earth
and stone have 24.39% and 31.04% there. Across the four variants, below-200-Hz
fractions are 1.329–1.443% for wind, 0.285–1.091% for earth, and 0.367–1.130%
for stone. Thus the change includes spectrum, envelope, material layering,
temporal density and force response; it is not only a global volume reduction.

Leaf variant 0 has 29.52% active 20 ms windows, where a window is active at or
above 15% of that clip's maximum window RMS. This describes packet spacing, not
perceived quality. Wind interval is now 9.6–10.4 seconds instead of 8.1–8.8.
The air bus at normalized pressure .45 is .64659. Final wind source gain is
0.40 (old 0.70); it was lowered after examining the relative wind/foot balance,
in addition to the spectrum and timing redesign. The designed quiet sequence
peaks at .040551, while the updated multi-event sequence peaks at .405929.
These peak measurements are integrity observations only.

### Duration, complete mix and relative levels

The integrator requested an explicit answer about the amount and persistence of
wind as well as low-frequency composition. I added a **matched 60-second modeled
mix** to the measurement script. It uses exact generated source PCM and nominal
runtime contact gains/rates, equal-power stereo panning, master .78, fixed
pressure .45 and deterministic environmental scheduling. Both versions have
80 foot contacts across four stone/earth walk/run groups and the same three
weapon/contact pairs. Variants cycle explicitly and small runtime random
foot-gain/rate perturbations are omitted. It is an authored controlled model,
not a simulation event trace or browser recording.

| Matched 60-second layer | Old RMS dBFS | New RMS dBFS | Change |
|---|---:|---:|---:|
| Wind | −40.10 | −55.76 | −15.66 dB |
| Leaves | −40.52 | −71.31 | −30.80 dB |
| Foot contacts | −40.39 | −55.95 | −15.56 dB |
| Movement cloth | −48.86 | −73.63 | −24.77 dB |
| Weapon/contact events | −44.04 | −44.04 | 0.00 dB |
| Quiet scene (air, leaves, feet, cloth) | −35.37 | −52.75 | −17.38 dB |
| Complete scene including combat | −34.82 | −43.50 | −8.68 dB |

- Wind maximum 50 ms RMS changes from −33.23 to −52.10 dBFS, a **18.87 dB**
  reduction in the loudest short wind window in this controlled scene.
- Total overlap of two wind buffers inside the 60-second window falls from
  **18.45 to 7.09 seconds**. There are eight vs seven starts. The much quieter
  air bed remains scheduled continuously; this change does not pretend that all
  ambient air is silent between gusts. Above a fixed digital −60 dBFS threshold,
  wind occupies 99.75% vs 83.08% of 50 ms windows. This is a numeric threshold,
  not a claim about human hearing at an unspecified playback volume.
- Leaf starts fall from **16 to eight**; windows above that same digital
  threshold fall from **79.83% to 3.58%**, combining sparser triggers, shorter
  packets and the dedicated environmental mix.
- The strongest 50 ms foot window stands **12.49 dB above average wind before,
  12.94 dB after**. Thus lighter feet retain approximately the same transient
  separation from the quieter air. The corresponding combat separation is
  **19.85 → 35.51 dB**, because its PCM and effect gain were preserved. This
  expanded quiet/combat contrast still requires listening; it is not a balance
  approval. The complete scene's maximum 50 ms RMS changes only −0.096 dB,
  showing why overall peak/no-clipping alone would miss the change in background.

The earlier **9.24-second actual-browser capture** recorded in SESSION_STATE
belongs to the previous implementation and its Start/move/swing/dodge/pause/
resume verification. It cannot validate the new gain or synthesis. This task's
**33-second generated audition** is a current designed listening asset with
explicit contact groups, not a new capture of those same DOM actions. Neither
the unmatched 9.24/33-second pair nor the new controlled 60-second model is
claimed as a perceptual or formal reference comparison.

All 17 untouched categories (swish, parry, block, hit, death, dodge, evade, signal,
victory, defeat, route, landmark, rejoin, consequence, water, birds, discovery)
retain identical variant-0 WAV SHA-256 values against the archived baseline.

## Verification and deliverables

Passed `node --test fresh/audio.test.mjs fresh/character-motion.test.mjs
fresh/audio-capture-clock.test.mjs fresh/audio-pcm.test.mjs`: **40 / 40** tests.
This includes audio/contact phase alignment, alternating contact cadence at
60 Hz and 250 ms frames, muted-recording negative control, delayed resume,
same-tick events, spectral regression, packet gaps, walk/run force and separate
air/master routing. A final sound-only repeat passed **16 / 16**. JS syntax and
`git diff --check` for the owned code changes passed. The final integration
owner still owns validation against its complete, frozen shared-worktree state.

New browser execution was attempted locally. The first launch could not create
the default `/tmp/playwright-artifacts-*`; routing temporary output to the
authorized scratch directory resolved that first issue. The second launch
reported missing `chromium_headless_shell-1194/chrome-linux/headless_shell`;
there was no installed system Chromium/Chrome in PATH. Therefore this task does
not claim a new browser master-bus recording. No approval bypass, external
installation or fake recording was used.

The available audio-related tool registry was inspected. It exposed speech
summarization, speech generation/editing and catalog search, not a supported
general audio-listening evaluator. I did not claim to hear the generated WAVs
or treat waveform plots, decoded PCM, this user-feedback correction, or a
speech-only model as an independent listening test. The earlier unsupported
audio-response attempt remains a limitation, not a listening pass.

Artifacts from this task are in the new scratch directory
`/workspace/scratch/27301e95ee53/sound-revision-20260915/`:

- `audio-before.js`: exact baseline audio source.
- `before/`: baseline category WAVs, original designed scene and manifest.
- `after/`: revised category WAVs, `generated-scene-audition.wav`,
  `quiet-walk-and-run.wav`, and manifest. The quiet 33-second scene contains
  four eight-contact groups: stone walk, earth walk, stone run, earth run.
  It uses the runtime mix constants, material rates and a fixed pressure .45;
  it is a designed listening asset, not an actual gameplay recording.
- `measurement/analysis.json`: complete four-variant PCM measurements and
  before/after mix data, including the controlled 60-second layer and combined
  mix levels, event schedules, overlap and relative levels.
- `mix-measurement.txt`: full console output from the final measurement.
- `audio-regression.tap`: final 16-test sound run.

Reproduce without overwriting historical evidence:

```sh
git show b06ade1ad5ab8b72de9bb9996f323a063f5db5ef:fresh/audio.js > /new/scratch/audio-before.js
AUDIO_BASELINE_SOURCE=/new/scratch/audio-before.js AUDIO_ANALYSIS_OUTPUT=/new/scratch/measurement node fresh/audio-analysis.mjs
AUDIO_OUTPUT=/new/scratch/after node fresh/audio-audition.mjs
```

| Artifact | SHA-256 |
|---|---|
| `fresh/audio.js` | `d38cc9a7e5055c6c8bfa4c849bfbab27046790327223e55dff098f293ecc5dcf` |
| `fresh/audio.test.mjs` | `a0bd20ac425b18dd3992709251f8d87c84fccd4eb11b9863e83d53809db6c684` |
| `fresh/audio-audition.mjs` | `1310b6f918da6facadc193b3c0420d56d4ebcc636c453ab70862456d5910b6e2` |
| `fresh/audio-analysis.mjs` | `30197433e5fca30e2506d65fbe276374b75b8fe31a32beba4fa5ae37498fbc8e` |
| Baseline `audio-before.js` | `13603d10e07c4427502de698a56bfc15ee111bdb59e3915368795406b159d8f3` |
| `measurement/analysis.json` | `a994782ec4f18c823943bdbca564d7e85df694771439251056a54cd70bd8d085` |
| `after/quiet-walk-and-run.wav` | `a9726881497473734b9cee67559487537ba5ba2a62e05000103580c9de9bcdbb` |

My edited files are exactly `fresh/audio.js`, `fresh/audio.test.mjs`,
`fresh/audio-audition.mjs`, new `fresh/audio-analysis.mjs`, and this evidence
record. I did not write or stage the old untracked
`AI_DEVELOPMENT/EVIDENCE/fresh-20260913/` tree.

Residual work: supported real listening of the revised quiet and combat mix,
actual browser playback/recording of the final integration, checking masking and
weight across device playback conditions, and valid source-concealed reference
comparison. The reported numeric corrections and passing regressions do not
complete these unmeasured quality requirements.
