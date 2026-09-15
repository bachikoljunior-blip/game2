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

## Follow-up: actual browser PCM independently decoded at 13:02 UTC

On `2026-09-15T13:02:33Z`, I, the same performing agent
`/root/game2_ultra_art_sound_physics/sound_revision`, completed the integrator's
additional finite artifact-analysis task. I changed no runtime. This follow-up
adds actual browser-output evidence for the revised audio, while the earlier
local missing-Chromium attempt remains an accurate historical observation.
Listening/naturalness remains **not measured**.

The integrator supplied the authorized readback from `34971381554`, archive
SHA-256 `6f55a8c53b5c94560de3c1deeff6e97f3267bf65e573620ff0fd5a685b4b2949`,
and reported full ZIP CRC agreement. My own checks below operate on the exact
extracted audio files at
`.review/34969080023/experience/audio/`; the ZIP acquisition/CRC check belongs
to the integrator and is not represented as my own action.

The capture report identifies source/CI
`037fd9d10d35453695bb92da8ed47649e1405eae`, actual Chromium master-bus recording,
and served bundle `index-p-GxVTiw.js` (646,830 bytes, SHA-256
`0e4112ed5aee4812f2c798760ff2b999b9a0a6b684c1f9643d9a009d26d95ff9`).
Its audio-capture result is passed; this does not turn the separate route-matrix
failure in run `34969080023` into a whole-CI pass.

I independently read the local Git objects for this source and
`acf0f9ec86996245ad712d6adc72e5d6159f6711`: `fresh/audio.js` has the same
`d38cc9a7e5055c6c8bfa4c849bfbab27046790327223e55dff098f293ecc5dcf`
SHA-256 in both. A source diff of audio.js, wind.js, character-motion.js,
route-layout.js and exploration.js is empty. The generated manifest's 22
category hashes and both 33-second scene hashes also match my prior generated
artifacts. Thus this is revised-audio evidence, unlike the earlier historical
9.24-second capture. It is still the 037fd9d capture, not a new recording of acf.

### Actual decode and level measurements

I decoded the WebM, WAV and muted negative with the repository's ffmpeg-backed
`decodePcm`. WebM bytes match the report hash. Its complete measured PCM object
matches the capture report exactly, including all sample counts and gate values.
The independently decoded negative also matches its report exactly.

| Actual artifact / measurement | Result |
|---|---|
| Recording format | 24,000 Hz, stereo, 11.28 seconds, 541,440 channel samples |
| WebM decoded RMS | 0.006183146, **−44.18 dBFS** |
| Decoded sample peak | 0.16366075, **−15.72 dBFS** |
| Maximum 50 ms RMS | **−24.03 dBFS**, sample interval 5.10–5.15 seconds |
| Median 50 ms RMS | **−57.03 dBFS**, including startup/silent windows |
| Fraction of 50 ms windows above −60 dBFS | **61.50%**, an absolute digital threshold |
| Nonfinite / clipped samples | 0 / 0 |
| 16-bit WAV RMS | 0.006183158; same duration/sample count as WebM decode |
| WAV vs float WebM decode | Maximum error **1/65,536**, RMS error 0.0000079101; consistent with 16-bit rounding |
| Deliberately muted negative | 1.20 seconds / 57,600 channel samples; RMS 0, peak 0; rejected as silent |

The full recording contains **2.15933 seconds of leading exact-zero PCM**.
Its first sample exceeding absolute magnitude `1e-6` occurs at 2.17354 seconds.
For transparency about the effect of that prefix, the remaining 9.10646-second
diagnostic region has RMS **−43.25 dBFS**. The delivered recording was not trimmed
or normalized; the full-clip result above remains the main measurement. Neither
threshold is a human audibility claim.

Stereo energy fractions of the actual combined master bus are **8.21% below
200 Hz**, **17.19% at 200–1000 Hz**, **36.15% at 1000–4000 Hz**, and **38.45%
above 4000 Hz**. This is a spectrum of all mixed actions and ambience, not an
isolated wind spectrum or a naturalness score. A complete half-second level
timeline and 50 ms statistics are saved in the scratch analysis described below.

### Actual event volume and limits on alignment

The capture report supplies these cumulative, actual runtime counters:

| Observation | Wind | Leaves | Stone contacts | Cloth | Swish | Dodge | Live voices |
|---|---:|---:|---:|---:|---:|---:|---:|
| Started | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Movement observed | 1 | 1 | 2 | 2 | 0 | 0 | 4 |
| Swing and dodge observed | 1 | 1 | 2 | 4 | 1 | 1 | 3 |
| Paused | 1 | 1 | 3 | 5 | 1 | 1 | **0** |
| Resumed | **2** | **2** | 3 | 5 | 1 | 1 | 2 |

Unknown events and pending events are zero at all recorded checkpoints. The
observed wind increment is one bed on start and one on resume after all prior
voices were stopped. This short stop/resume capture does not exercise the full
long-term ambient renewal/overlap schedule. It has three stone contacts and one
swish/dodge; it does not cover earth footsteps, multiple walk/run groups,
parry/block/hit, a full fight or all sound categories.

Only the combined master was recorded. An isolated air-bus RMS, wind/foot
masking ratio, and actual per-voice gain automation were **not separately
measured**. The event report contains wall-clock checkpoints and simulation
times but lacks a sample-aligned recorder/event anchor. I therefore do not label
the 5.10-second peak or other waveform windows as particular individual sounds,
or derive input/voice latency from them. Runtime event counts and actual waveform
levels are both evidence, with different timing resolution.

The earlier 60-second model keeps a prescribed pressure .45, 80 footsteps and
three combat-contact pairs. The 33-second audition uses authored contact times;
the present 11.28-second file is real browser output with startup and stop/resume.
Their RMS values are not a matched before/after comparison. In particular,
the modeled **−15.66 dB wind reduction** remains a modeled result; it is not
relabelled as a measured wind-only reduction from this master-bus recording.
No-clipping, nonzero sound, successful decoding or matching hashes is used to
declare naturalness achieved. I have not listened through a supported model.

### Follow-up artifacts and identities

My analysis outputs are at
`/workspace/scratch/27301e95ee53/actual-audio-34969080023/`:
`decode-verification.json`, `decoded-webm.f32`, and `levels.json`.

| File | SHA-256 |
|---|---|
| Actual `actual-gameplay-audio.webm` | `54c5a25f20e9c4fd6daf9a28381c44c09972f5c0feea5d598c7115ea785e8925` |
| Actual `actual-gameplay-audio.wav` | `fa5658d78bd03c3080d5dd9a934580806adeffee96425ea48185deb90658ecd1` |
| Actual `muted-negative-probe.webm` | `a34934ce1dc3f83f755efa5940b8be54d52d404a4fd2f19c33888a0ae5c61b0e` |
| Actual `actual-capture-report.json` | `84f974f110c2d32d43da18304a154e695546a101575df969780bfb8de7c43669` |
| Actual generated `manifest.json` | `ed95182976da9f57d0b299ef232967f686b42b7cfdbb33e6253d676fe7bad85f` |
| My `decode-verification.json` | `d62de9a41341fd0a434ff22f6b76706facb8948c6339e84e2c5153a75ca259bf` |
| My `levels.json` | `7514170d1bfd942bea1eed5afc26e9e9ca49a7e5394be2e937950bfa41ab0efb` |

The next exact-source CI audio artifact can be checked separately when available.
Perceptual listening and all 10 formal source-concealed comparisons remain
**not measured**, and the fixed deadline is unchanged.

## Follow-up: acf0f9ec actual audio verified at 13:24 UTC

I, `/root/game2_ultra_art_sound_physics/sound_revision`, accepted and completed
the integrator's next finite actual-audio check at `2026-09-15T13:24:18Z`, using
the existing Ultra assignment without redelegation. The integrator reports all
four jobs of CI `34971788118` completed successfully and supplied the verified
experience artifact at `.review/34971788118/experience/audio/`. Its acquisition
and ZIP verification belong to the integrator; my own work is the independent
file/hash/decode/level/counter analysis below. Only this evidence file was edited.

The new capture report names source and CI
`acf0f9ec86996245ad712d6adc72e5d6159f6711`. Its served bundle is
`index-CaXCJhF9.js`, 647,956 bytes, SHA-256
`9d31fc3c31d7ea109209501b782aa1c201ab35b6dfd9346b48923e6a34903656`.
I again read `fresh/audio.js` from the 037fd9d and acf0f9ec local Git objects:
both hash to
`d38cc9a7e5055c6c8bfa4c849bfbab27046790327223e55dff098f293ecc5dcf`.
The generated manifest is byte-identical to the previous artifact, and all
22 categories plus both 33-second designed scene identities match.

### Actual output and pause/resume

Independent ffmpeg decoding reproduces the entire new capture-report PCM object
exactly. WebM and negative-file SHA values match that report. ffprobe identifies
the WAV as 16-bit PCM, 24 kHz stereo, 1,198,158 bytes. The WAV contains the same
599,040 channel samples as the WebM decode, with a maximum difference
0.00001525873 and RMS difference 0.00000794474, consistent with 16-bit rounding.

| Observation | acf0f9ec actual recording |
|---|---:|
| Decoded duration | **12.48 seconds** |
| Full master RMS | **0.00593528 / −44.53 dBFS** |
| Sample peak | **0.16751593 / −15.52 dBFS** |
| Maximum 50 ms RMS | **−24.38 dBFS**, sample interval 6.25–6.30 s |
| Median 50 ms RMS | **−56.98 dBFS**, including startup/silent windows |
| Windows above digital −60 dBFS | **63.60%** |
| Leading exact-zero interval | **0–2.30683 seconds** |
| First sample above absolute `1e-6` | **2.31279 seconds** |
| Remaining-region diagnostic RMS | **−43.64 dBFS**, 10.16721 seconds; original file untrimmed |
| Nonfinite / clipped samples | **0 / 0** |
| Deliberately muted negative | **1.20 seconds**, 57,600 channel samples, RMS/peak **0 / 0**; correctly rejected |

The combined stereo spectral fractions are 8.39% below 200 Hz, 17.28% at
200–1000 Hz, 36.24% at 1000–4000 Hz and 38.09% above 4000 Hz. They remain
whole-master measurements, not measurements of an isolated wind bus.

The actual report shows wind **1** at start, **1** at pause, and **2** after
resume. At pause `active=false`, context `suspended`, and **liveVoices=0**.
After resume the context is running, active/ready are true and liveVoices=2.
The final counters are **wind 2, leaves 3, stone contacts 3, cloth 5, swish 1,
dodge 1**, with zero unknown or pending events. Leaves increased from 1 to 2
before pause and to 3 on resume; the extra leaf event is not an extra wind bed.

Scanning the actual PCM finds no further interval of at least 50 ms containing
only exact-zero samples after the leading interval. The recording does not
provide a sample-aligned event/audio-clock anchor for the pause checkpoint.
Accordingly, suspension/all-voices-stopped is confirmed from the actual runtime
snapshot, and the deliberately muted negative confirms a real silent capture;
I do not claim that a particular later waveform segment independently measures
the wall-clock pause. No window is mislabeled as an individually isolated sound.

### Difference from the previous actual capture

| Actual observation | 037fd9d / run 34969080023 | acf0f9ec / run 34971788118 |
|---|---:|---:|
| Duration | 11.28 s | 12.48 s |
| Full master RMS | −44.18 dBFS | −44.53 dBFS |
| Sample peak | −15.72 dBFS | −15.52 dBFS |
| Maximum 50 ms RMS | −24.03 dBFS | −24.38 dBFS |
| Leading exact-zero PCM | 2.15933 s | 2.30683 s |
| Final wind / leaves / stone contacts | 2 / 2 / 3 | 2 / 3 / 3 |

The full RMS differs by −0.355 dB, sample peak by +0.202 dB and maximum 50 ms
RMS by −0.352 dB. These are two observations of **unchanged audio code**, with
different recording duration, startup timing and environmental trigger count.
They are not a controlled mix A/B or evidence of a new sound-quality change.
The earlier 60-second modeled wind reduction remains a modeled result.
No supported model listening occurred; perceptual naturalness and all formal
10-element comparisons remain **not measured**.

My new outputs are at
`/workspace/scratch/27301e95ee53/actual-audio-34971788118/`:
`decode-verification.json`, `decoded-webm.f32`, and `levels.json` (including
half-second levels and the complete silence/threshold measurements).

| Artifact | SHA-256 |
|---|---|
| Actual WebM | `7cae7bd226beb2f3620a24eb4971febe019cd5c21a9aa4fe7121b688ca58723f` |
| Actual WAV | `a3e8a576f8efa4b57d1fdb8c834dc50dcabe879885f6b09a0c2d82aaccae9c72` |
| Muted negative WebM | `2f5c1bd5a44a47ed1c7d75c94fb2292b10986a8a78aec5e19e1f8ff3dd7f39d0` |
| Capture report | `dc307d826c6e9675133bdda8cb9caeb16aea4a722b708bf70094c77a86810790` |
| My decode verification | `c60d798d30caaa57686476fe1d825a3d6b817c73c36a951d7620edb3790b0211` |
| My level analysis | `7c08140e5ff17ed1d4accde7053325f3337d0cf7d44a6186706b76d15c225c19` |

No runtime, old evidence artifact, stage, commit, remote or automation was changed
by this follow-up. The fixed deadline remains `2026-09-20T07:51:53Z`.

## Follow-up: 906 actual browser audio, CI 34988388555

I, `/root/game2_ultra_art_sound_physics/sound_revision`, accepted the integrator's
additional finite actual-audio verification on 2026-09-15 using the existing
accepted Ultra assignment, without redelegation. The integrator recovered the
experience artifact and verified its acquisition/ZIP identities. My independent
work reads the five local files at `.review/34988388555/experience/audio/`,
checks file hashes, completely decodes the actual WebM, delivered WAV and muted
negative, and measures the resulting PCM. Only this authored evidence file is
changed by the audio follow-up; the earlier normal-route analysis has its own
`20260915-906-normal-failures.json` record.

The native capture report identifies source and CI revision
`9068522520b0f269cc937057b444f06c7c187978`. The reported served bundle is
`index-DG38851A.js`, 4,042,294 bytes, SHA-256
`e6dbec3eeb7ae36a2b593a4601e819a2cd67716cf05219aa189f07000596ce95`.
This is readback of the captured provenance, not a new browser execution.
I read `fresh/audio.js` from the local Git objects for both that source and
`4fa13484c88dfa3d572c189e3a8999e8f254e70e`. Both, and the working audio file at
analysis time, have SHA-256
`d38cc9a7e5055c6c8bfa4c849bfbab27046790327223e55dff098f293ecc5dcf`.
The generated manifest is byte-identical to the acf capture's manifest: its 22
categories and two authored 33-second scenes are unchanged.

### Independent decode and levels

The finite analysis passed **45 assertions**. `ffmpeg -xerror` completely
decoded all three audio files into 24 kHz stereo float32 PCM. An independent
Python measurement reproduced every numeric PCM field of the actual and
negative capture reports **exactly**, including ordered scalar accumulation of
sample energy. An initial use of Python's compensated built-in `sum` differed
from the report's sequential JavaScript RMS by `2.38e-16`; changing the analysis
to explicit ordered addition reproduced the report without changing any gate.

| Measurement | Actual browser master bus |
|---|---:|
| Duration / channel samples | **13.08 s / 627,840** |
| RMS | **0.005903307789 / −44.57809 dBFS** |
| Sample peak | **0.155674248934 / −16.15566 dBFS** |
| Maximum 50 ms RMS | **−24.00247 dBFS**, sample interval 6.60–6.65 s |
| Median 50 ms RMS | **−56.95513 dBFS**, including startup/silent windows |
| Fraction of 50 ms windows above digital −60 dBFS | **62.9771%** |
| Nonfinite / clipped samples, clipping threshold 0.999 | **0 / 0** |
| Leading exact-zero PCM | **0–2.314333 s** |
| First frame exceeding absolute `1e-6` | **2.328208 s** |
| Additional exact-zero intervals of at least 50 ms | **None** |
| Deliberately muted negative | **1.20 s / 57,600 channel samples**, all exactly zero |

The delivered 16-bit WAV has the same duration and sample count as the float32
WebM decode. Maximum difference is exactly `1/65,536`; RMS difference is
`0.000007977980454`, consistent with 16-bit rounding. The original recordings
were not trimmed, normalized or modified. The diagnostic tail beginning at the
first `1e-6` frame is 10.751792 seconds and has RMS −43.72682 dBFS; the complete
13.08-second result remains the primary observation. Digital thresholds are
not human audibility measurements.

Whole-master spectral energy fractions are **10.5883% below 200 Hz**,
**17.5289% at 200–1000 Hz**, **35.5839% at 1000–4000 Hz**, and **36.2988%
above 4000 Hz**. These fractions include every recorded action and ambience;
they do not isolate the wind bus or measure its masking of footsteps.

### Stop, resume and actual event coverage

| Recorded checkpoint | Wind | Leaves | Stone contacts | Cloth | Swish | Dodge | Live voices |
|---|---:|---:|---:|---:|---:|---:|---:|
| Started | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Actual movement | 1 | 1 | 2 | 2 | 0 | 0 | 3 |
| Swing and dodge | 1 | 2 | 2 | 4 | 1 | 1 | 4 |
| Paused, all voices stopped | 1 | 2 | 2 | 4 | 1 | 1 | **0** |
| Resumed | **2** | **3** | **3** | **5** | **1** | **1** | **2** |

At pause the actual snapshot has context `suspended`, `active=false` and
`ready=false`; world time remains 2.083333333333331 at both the preceding and
paused checkpoints. At resume, context is `running`, active/ready are true and
world time is 2.583333333333329. Unknown events and pending events are zero at
all five checkpoints. The second wind start follows stopped voices; this short
capture does not exercise long-run wind renewal or prove its overlap pattern.

The negative capture begins after the mute target at audio time 16.1910884354,
gain arrival at 16.2017233560, and a drained recorder start at 16.9505668934.
Capture reaches audio time 18.1609070295, satisfying its original 1.2 audio-second
requirement. Independently decoded PCM is entirely zero, and the native gate
correctly rejects it for `silent or inaudible PCM` while its codec decode passes.

The actual report has wall-clock checkpoints and simulation times but lacks a
sample-aligned event/recorder anchor. Therefore the stopped-voice/context claim
comes from the runtime snapshot; I do not assign a waveform interval to that
wall-clock pause or identify the 6.60-second loudest window as a particular
sound. The capture contains three stone contacts and one swish/dodge. It does
not guarantee earth footsteps, combat impacts, parry/block, or all categories.

The prior 60-second model prescribes pressure, contact counts and combat times;
the 33-second auditions prescribe different timelines. This 13.08-second actual
playthrough includes startup and stop/resume, so its full RMS is not a causal
mix A/B against either designed sequence or the earlier actual captures.
Unchanged audio source also prevents calling this a newly implemented sound
improvement. No supported model listening occurred. Naturalness, the user's
perceived wind/footstep balance, and all 10 formal comparisons remain
**not measured**. Successful decode, zero clipping and a nonzero waveform do
not certify those qualities.

### Identities and reproducible local analysis

My analysis script, three decoded float32 buffers, and full measurement/event
record are under
`/workspace/scratch/27301e95ee53/actual-audio-34988388555/`.
`analyze.py` reproduces the checks; `decode-verification.json` includes complete
50 ms and half-second timelines, source hashes, ffprobe outputs and assertion
names. The five recovered original files retain these identities:

| Artifact | SHA-256 |
|---|---|
| Actual WebM | `3dca42dedccf1fb725f1cdea786ab1e160dd589ca04683b301378425c1230da8` |
| Actual WAV | `23d5c721d780256844097b67e762e652f0d1bb04d713c2d731fe39e7ceea0ce3` |
| Muted negative WebM | `cfbf94a90f9a821698324cd55b8ac0e57ca81dfad4fda60788392ee35e2f9812` |
| Capture report | `82f6f667ed8d017d2eab04f35039d93958b96508fb6fd20baf3fd92be7cc3c0f` |
| Generated manifest | `ed95182976da9f57d0b299ef232967f686b42b7cfdbb33e6253d676fe7bad85f` |
| My decode verification | `c09c7b7ca399d45a19004e9c929b29bc7fe8908609be5933766e41cbe5b8f287` |

No runtime, input, measurement gate, Git stage/commit, remote or automation was
changed. The fixed deadline remains `2026-09-20T07:51:53Z`.
