# Independent art revision review — received baseline and first diagnosis

## Receipt and limits

- Reviewer: `/root/game2_ultra_art_sound_physics/independent_art_review`.
- Assigning integrator: `/root/game2_ultra_art_sound_physics`.
- Received assignment: finite independent visual/technical review; explicit Ultra designation; no delegation; no remote writes, commits, automation changes, or runtime edits.
- The actual spawn arguments and private effective reasoning strength are not independently visible to this reviewer. This record is this reviewer's receipt and work evidence, not a substitute for the integrator's spawn receipt.
- Repository: `bachikoljunior-blip/game2`; canonical branch `codex/game2-rebuild-20260913`.
- Received and locally verified baseline HEAD: `b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`.
- Received baseline runtime: `a6722c5cf7b1933f1956c6c33ec4edc6adf47640`; corroborated by `.review/34959408734/experience/motion-study/report.json` and `experience-report.json`.
- Media root: `.review/34959408734/` (existing local material supplied in this conversation's workspace).
- Deadline received: `2026-09-20T07:51:53Z`; no user confirmation needed.
- Read applicable `CLAUDE.md`, full `AI_DEVELOPMENT/FIXED_INSTRUCTIONS.md`, and relevant `AI_DEVELOPMENT/SESSION_STATE.yaml` state/remaining issues.
- This is a source-known diagnosis of the game's actual rendered media, **not a blind reference comparison**. All ten formal comparison elements remain `not measured`. No reference work was compared in this review.
- Before diagnosis, no candidate implementation diff was read. The character and vegetation implementers are separate agents.
- Only this new evidence file is written by this reviewer. Root/docs/old untracked material is preserved. Repository-backed evidence is not duplicated into another storage system.

## Actually inspected material

The PNGs listed below were opened as images. The study images are synthetic scene-state renders at authored 12 fps using an inspection camera; they are not normal-input gameplay or real-time performance measurements. The four route PNGs are existing decoded frames from the ordinary-input route recordings; the memory overview is an existing contact sheet. Gameplay provenance is read from the recording reports, not inferred from a filename alone. No claim is made that this reviewer watched every continuous route-video frame.

| PNG, relative to media root | SHA-256 |
|---|---|
| `experience/motion-study/idle/0000.png` | `8e01fe405be884c7e31b83aa6312d23af0d0588cb4e36139955fc6e34b36aed6` |
| `experience/motion-study/start-run-stop/0006.png` | `2c0f3de850987df263b4f8103b7696f8144e34938c20f6e44d8dd87bccb57cfc` |
| `experience/motion-study/start-run-stop/0018.png` | `661a273258abad8ed7e0b330679e857bdaa01ac39ac1428c8d7d12c304690a7e` |
| `experience/motion-study/start-run-stop/0030.png` | `3eea41fa82bf3a8b00d262972fe3db79390b87b28c7f3d5acef430d16b1faddb` |
| `experience/motion-study/attack/0000.png` | `b9be07e9efbcebae09ddaf4fbce181e10e0486426e90ecd768b28ee438bc9c75` |
| `experience/motion-study/attack/0006.png` | `cab5044ae8c06f4f1e04c423d1448e5573cbff4b81a2eaf44f4dde1b13b13db7` |
| `experience/motion-study/attack/0012.png` | `d2ddc7bf2cd1cb25ceedf6ea401969939dfd7364ec6f623a6d1b7402297f98eb` |
| `experience/motion-study/wind/0000.png` | `46a3bf94ca9c8220f1429f736e7c0bd555d1243030a43936263007137c66a26a` |
| `experience/motion-study/wind/0012.png` | `65ea11f4673429c821a01a6e4a9ca5fa1bc10d8f5ea9efc7baf8bddf7de6a1ad` |
| `experience/motion-study/wind/0030.png` | `8af2df909f483a5d48341dceafbb432924891078ea8764daaa9806c468a624cf` |
| `experience/motion-study/wind/0042.png` | `ecb5a2e86cb620f615cbf08aa0df9e2eea4d8aa90c8bed7da527c74d17f925eb` |
| `fresh/decoded/decoded-desktop-fork-entry.png` | `520ac886f9945de28c9bb74a74d28d247579ffb15c9b91d1b3e2ad5235321ea9` |
| `fresh/decoded/decoded-desktop-route-consequence.png` | `b6dcff3a727d0ee07222a094cdedef81c7dcc3f369c26473cf5499b83486395f` |
| `fresh/decoded/decoded-touch-route-landmark.png` | `2654f0ec9ff89e45233accb8590409be525a517a43529afd2a070845e7ff8747` |
| `fresh/decoded/decoded-desktop-post-rejoin-shrine-view.png` | `0e81066ac7886e159c38371f910d387ad73933519c3c21ef6dec816ce20ef144` |
| `independent/memory/overview-02.png` | `5bb8f0b4c346bef08803695f33fa029c146e713959a71bea79f8042bcbd35de0` |

The following MP4s were personally probed and fully decoded with ffmpeg to the null muxer: all returned exit 0 with empty error output. This is technical file integrity evidence, not a claim of full-rate perceptual playback. Temporal visual observations below are limited to the listed PNG samples.

| MP4 under `experience/motion-study/` | Dimensions / rate / duration / frames | SHA-256 |
|---|---|---|
| `idle.mp4` | 960×540 / 12 fps / 3 s / 36 | `7f4799b3ccbcbdab2a2dcd22e9acb8939af0583bc769b6ab855f7c511e5a9718` |
| `start-run-stop.mp4` | 960×540 / 12 fps / 4 s / 48 | `455f4275308078de040bbef83577762252a853ddc3ff3120e169d2729dda4d35` |
| `attack.mp4` | 960×540 / 12 fps / 3 s / 36 | `1c432ba18c254238743e282c919a9122fb63c6f2e28bdbd367f0c38820a0dc07` |
| `wind.mp4` | 960×540 / 12 fps / 4 s / 48 | `0dc149bfa773d808fb335d6a8fb75eec5755e5218ea326f7c3a22ddf957d1615` |

## Baseline visual diagnosis

These are direct visual observations and art judgments within the inspected images, not scores against a PS4 reference.

1. **人物の大形と接続を最優先。** `idle/0000.png`では頬・鼻が独立した丸い塊に見え、頭頸が短く寸胴、肩鎧は大きな角板、胴鎧はほぼ平面、袖は円筒に見える。通常戦闘の`decoded-desktop-fork-entry.png`でも背中は青い箱、肩甲周りは白い角板として読める。装飾が存在しても、人物全体の印象は人間の身体より組立人形に近い。改善の優先対象は頬顎から首、胸郭から肩/上腕、袖から手の形のつながりと比率。リベット/紐/小傷だけの増量ではこの主要因は消えない。
2. **衣服と装備の重なり・材質に階層が足りない。** 袴は縦に硬い板が並んだ形、肩は分厚い一枚板に見える。布の大きなしわ/重なり、袖口・帯・襟の厚みと影、金属のエッジと漆/布/肌の異なる反射が必要。上半身正面と通常距離の背中の両方で読める変化が先。青/白/黒の強い配色は人物を見つけやすくする長所だが、現在は各部の継ぎ目を強調している。
3. **走り・攻撃中も衣服が硬い形を保つ。** run 0.5/1.5/2.5 sとattack 0/0.5/1 sでは脚・腕の姿勢は変わるが、胴と袴の大きな体積/表面は硬く見える。これは画像標本からの造形診断。滑走量、接地の継続時間、速度変化の自然さ、動作の滑らかさはこの疎い画像だけでは未測定。攻撃0.5 sでは手の前の刀身が背景/胴周辺に埋もれ、刀の方向を読み取りにくい。武器の全動作や接触の良否までは断定しない。
4. **植生の最大の見た目の問題は反復と孤立した板状の草。** windと通常gameplayの両方で、草は細い尖った板がほぼ単独/小束で地面に立つ。大面積に同じ見え方が続く。竹は幹の節を読める一方、似た大きさの尖った葉束が反復し、疎密/方向/葉の曲面の違いが少なく見える。物理の差を実装しても、この静止形と配置の単調さは別に残る。
5. **幹と葉の物理はまだ視覚的に分離して評価できていない。** wind 0/1/2.5/3.5 sで草の向きと竹葉束の姿勢差は確認した。幹基部が抜ける/大移動する明白な破綻はこの標本にはない。しかし太い支持部と末端葉の振幅・周波数・遅れを連続して判定するには標本が疎い。『物理が自然』『幹と葉は同じ物理』のいずれもこの画像だけで断定しない。candidateでは基部から先端まで見える固定カメラ媒体で、支持部のゆっくり小さい曲がりと、末端の局所的で速い変化を確認する必要がある。
6. **画面全体の大形と材質も目標との差を支配。** 裸地の茶色い細かなノイズ面が大きい。遠景崖は広い均一な霧色の多角形に見え、中景の岩は同形に近い丸塊が箱に並ぶ。社の壁は広い平面と反復する赤い縦棒、黒く潰れた屋根で構成され、樹木・社・石灯籠の接地/境界の作り込みが薄い。長い影と稜線/竹の層は場所の奥行きを与えるが、面の密度と材質の一様さを補えていない。今回人物/植物を改善しても、これらを残したままPS4級の画面全体を達成したとは扱えない。
7. **通常のプレイ距離で評価する必要がある。** touch route-landmarkでは人物が小さく、細かな顔/紐より頭・肩・胴・袴のシルエットと姿勢が読まれる。近景inspectionだけで良く見える改修は十分ではない。shrine-viewでは前景の丸い岩が画面下部を大きく占め、社壁とキャラクターの明度差も小さくなる。通常距離・側背面・背景との重なりを同じ条件でbefore/after確認すること。

## Priorities passed to implementation/integration

- P0: 人物の頭頸/肩胸/肘手/袴の大形と接続、および普通の背面カメラでの人体感。
- P1: 布・金属・肌・革/紐の反射/厚み/重なりの差と、動作中に崩れないシルエット。
- P1: 幹/枝/葉の変形の役割分担を可視化しつつ、草/竹の形と配置の反復を減らす。
- P2: 通常距離の地表・岩・社・明暗の統合改善。今回の担当外であっても達成扱いにしない。

## Unmeasured and inference boundaries

- Sound: no perceptual listening was performed. Available inspected MP4s have only an h264 video stream. Tool availability review did not establish a suitable local-audio listening input; spoken-content summarization is not a substitute. Wind loudness, footstep heaviness, and audio naturalness remain unmeasured by this reviewer; the user's complaint is received evidence, not my listening result.
- All ten formal elements: `not measured`, unchanged. No comparison criteria or references changed.
- PS4-level visual fidelity: remains a target. This diagnosis identifies defects; it does not establish platform-equivalent fidelity or a blind win.
- Continuous real-time motion, exact plant phase/frequency, control quality, physical-phone performance: not measured in this bounded image review.
- Inference: improving only micro-detail will likely leave the dominant primitive silhouette/material/scene repetition problems. This is an art-direction inference grounded in the inspected images, not a tested outcome.

## Pending candidate receipt

No finished candidate media has been received as of this first record. Await an exact revision/tree identity and matching idle/front/back/ordinary-gameplay/attack/run/wind frames or recordings from the integrator. I will inspect the candidate independently and append actual differences and residuals. No acceptance of the in-progress code is implied.

First record written at: 2026-09-15T11:55:16.093642+00:00

## Additional bounded static capture-runner review

Received from `/root/game2_ultra_art_sound_physics`: review `fresh/art-direction-capture.mjs`, `fresh/vegetation-capture.mjs`, `fresh/build-fingerprint.mjs`, and the new `art` job in `.github/workflows/fresh-game.yml`. Baseline remains `b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`; candidate runtime is still in progress. No runner, browser, shader, build, or CI job was executed by this reviewer. Only the three JavaScript parser checks (`node --check`) ran: all exit 0 with no output. No runtime implementation was edited. Narrow dependency/API reads were made only to verify capture fixtures; no assessment of the in-progress character, sound, or vegetation implementation is made here.

Snapshot inspected (working files, not a committed candidate):

| File | SHA-256 at syntax/snapshot check |
|---|---|
| `fresh/art-direction-capture.mjs` | `f5ee943aff0daa8ee4955ce1a658dda79a0b80b05b3e5421e4452738eab5badb` |
| `fresh/vegetation-capture.mjs` | `e4073bf372c212d3d0f9b0333056e814b5f4b343ae7f00458f2428557c70bbe5` |
| `fresh/build-fingerprint.mjs` | `035720c5dbe7c2acefba0050956e716ad7938a34cdb4c34547c72fc1c01cf19f` |
| `.github/workflows/fresh-game.yml` | `fb965068b53efcaeb098e97a8c0e4cb966fc26765a4b68a6e4cf68c7a7e9c5e5` |

### Result and concrete fixture/coverage findings

**No static blocker to starting the runners was found; runners remain unexecuted by this reviewer.** Existing baseline character APIs return `neck` and accept the synthetic actor/world fixture. The Vite allow paths include both main and baseline source roots, and the workflow provisions the baseline dependency symlink. The supplied baseline and the previously reviewed runtime have the same `fresh` tree: `7834a39af3424ced8832e53a8b460cb88a7bd6d1` for both `b06ade1...:fresh` and `a6722c5...:fresh`. Thus the chosen source baseline is consistent with the initial media's runtime tree.

1. **Plant capture retains foreground visibility computed for a different camera.** In the inspected `vegetation-capture.mjs`, `view.render(world,1/12,0,{animate:true})` executes before the inspection camera is installed. In `presentation.js`, that call computes the ordinary player camera and runs `foreground.update(camera.position,sightPoints,...)`, which can change registered leaf/wood opacity, depth writing, and shadow casting. The runner then replaces only the camera and renders again. Consequently the inspection frame can retain fades/shadow decisions made for another viewpoint. This is a concrete fixture inconsistency; whether a visible wrong fade actually occurs at these exact specimens is not yet measured. For reliable isolated art/dynamics evidence, use an explicit presentation inspection-camera hook before foreground processing, or deliberately disable/reset that presentation behavior for the inspection and record the change. Merely moving the camera after the render does not establish its correctness.
2. **Root/tip assertion does not check the rendered canopy or its visibility.** `vegetation-capture.mjs` projects only undeformed reference points `(x,y,z)` and `(x,y+height,z)`. These are not actual deformed branch/leaf extrema. The check does not detect occlusion, clipping of a lateral branch, leaves outside frame, a camera inside terrain/scenery, or a leaf-close camera with no useful leaf visible. The close case skips even that two-point assertion. Therefore `Full root-to-tip and leaf close views` is a capture intention, not verified coverage until actual PNG/MP4 inspection. This could waste a green CI capture by producing unusable material without an assertion failure.
3. **Matched before/after is presently character idle only.** The art runner produces four actor IDs × five views = 20 synthetic-idle images for each source. Vegetation has a hard-coded current source root and output directory, uses new `vegetationSpecimens`, and is invoked only once. It does not provide a same-runner baseline vegetation comparison. Existing `experience`/motion jobs can supply candidate gameplay and movement evidence, but the new art job alone does not establish matched before/after motion or ordinary gameplay. No such evidence should be claimed from its 40 neutral-stage images.
4. **Origin guarantees are conditional on CI cleanliness.** `build-fingerprint.mjs` records `HEAD`, `HEAD:fresh`, and built-file hashes but does not itself assert that the worktree is clean or that the existing `fresh-dist` belongs to that source. In the inspected `fresh` job it follows an explicit production build and a later clean-worktree gate, so the planned CI ordering provides the missing association. Running it directly in the currently dirty local tree would label candidate bytes with old `HEAD` without detecting that mismatch. The neutral-stage art runner imports source modules through Vite rather than using `fresh-dist`; the build fingerprint from another job does not hash those inspection images or their exact module bytes.
5. **Before failure can prevent candidate figure capture.** The after-capture step has default success-only execution, so a baseline-capture failure skips after images even if the candidate is renderable. The vegetation step uses `always()` and will still be attempted. This is a recoverability/coverage limitation, not a known imminent baseline failure. If independent evidence on each side is desired, run both and combine statuses afterward.

No shader compilation, resulting pixels, audio quality, art improvement, or PS4-level acceptance was passed by this static review. The earlier image-based diagnosis remains separately scoped. All ten formal comparison elements remain `not measured`.

Static review appended at: 2026-09-15T12:06:13.056752+00:00

### Remediation receipt after static findings

The integrator reported that the vegetation owner is adding a `view.renderInspection(position,target)` API that resets foreground fades/shadow state to base before the inspection draw. A subsequent read confirmed that `vegetation-capture.mjs` now calls that API and its scope explicitly limits undeformed root/tip projections to framing guides, leaving actual branch/leaf visibility and motion for native-media review. At that read boundary, `presentation.js` did not yet contain the API (the owner was still implementing it); the integrator was notified to ensure it exists and is exposed in the presentation return value before CI. This is an in-progress dependency receipt, not a final candidate failure. Runtime correction and rendered opacity remain unverified. No other definite startup blocker was found in this bounded review.

Receipt appended at: 2026-09-15T12:06:50.202674+00:00
