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

## Native matched figure review — candidate 037fd9d

### Received identity and actual review scope

- Reviewer: `/root/game2_ultra_art_sound_physics/independent_art_review`; integrator: `/root/game2_ultra_art_sound_physics`.
- Received exact candidate runtime: `037fd9d10d35453695bb92da8ed47649e1405eae`.
- Received CI run: `34969080023`; received figure artifact ID: `10396910778`.
- Supplied local media: `.review/34969080023/figures/before/` and `.review/34969080023/figures/after/`.
- Acquisition provenance received from integrator: recovered through authorized read-only CI logs; two reconstructed ZIPs had matching SHA/CRC checks. This reviewer did not conduct the remote acquisition or independently verify those ZIP CRC claims. Instead this reviewer opened the actual recovered PNGs and computed the individual local hashes below.
- Before `report.json` identifies source `b06ade1ad5ab8b72de9bb9996f323a063f5db5ef` and runner `037fd9d10d35453695bb92da8ed47649e1405eae`. After report identifies source and runner `037fd9d10d35453695bb92da8ed47649e1405eae`. Both have empty reported errors and technical `result: passed`. Those report fields are not art acceptance.
- Personally opened all **40 native 960×720 PNGs**: player/sentinel/retainer/warden × full/back/face-front/face-threequarter/face-profile × before/after. No montage or CPU substitute was used for this candidate diagnosis.
- Personally compared all 20 metadata pairs: `camera`, `target`, `id`, and `view` are identical in the before and after reports. These are fixed-light neutral-stage **synthetic idle** renders of the production meshes/materials. They do not measure normal gameplay, running/attack motion, plant dynamics, audio, or real-time performance.
- This is an independent implementation review with **known source identities**. The reviewer knows the assignment, former image diagnosis, and before/after. C06's fixed SEKIRO reference was not acquired or viewed in this stage. No strict blind comparison, source concealment, official C06 result, or platform-equivalent quality is claimed. All ten formal elements remain `not measured`.
- The first six player views were diagnosed and sent to the integrator before receiving its message about the implementer's coinciding repair findings. Remaining images were independently opened afterward. The ordering is recorded because this was a source-known collaborative defect review, not an isolated preference experiment.

### Directly visible improvements

1. **顔の連続面。** 全三角度で、beforeの別々の球状の頬/鼻と角形の口が消え、鼻梁・頬・顎が一つの顔の輪郭として読める。これは部品の追加だけではない実画像上の改善。ただし自然な人物としての完成とは別。
2. **胴・袖・袴の曲面化。** 全身/背面で、beforeの箱状背中と一直線の板状袴が、丸みを持つ胴、布の襞、波打つ裾へ変わった。袴と鎧の表面反射が以前より分かれ、背面でも布として認識しやすい。
3. **装備と足元。** 肩/胴鎧の表面に曲率と反射の変化が出た。靴はbeforeの大きな四角い台座感が減り、足袋/履物の丸い形に近づいた。wardenの顎当てはbeforeの単純な正面矩形より曲がりを持つ。ただし以下の接続欠陥が残る。
4. 青/赤茶/鈍い緑茶/暗赤の四体の配色は保持され、素材を変えても基本的な色による識別は残る。

### New or newly exposed defects requiring repair

| Priority | Direct visual finding | Actual images / extent | Closure needed in later native media |
|---|---|---|---|
| P0 | 露出した首が極端に長い円柱に見え、肩の上に頭を載せた棒の印象。首から鎖骨/肩へ広がる形がなく、背面でも細い支柱に見える。 | All four `after/*-full.png`, `*-back.png`, and face views. | 同じ全身/背面/顔3角度で頭と胸郭が連続した人体比率に見えること。カメラを変えて隠すのは閉鎖としない。 |
| P0 | 肩鎧と袖の上端が黒い中空の輪として開いて見え、腕が胴の外に挿した筒に見える。特に画面右の肩口の空洞が明瞭。 | All four after full/back; very clear lower-right of `player/sentinel/retainer/warden-face-threequarter.png`. | 肩から上腕へ体積がつながり、袖/鎧の内側が不自然な大穴にならないこと。後続の腕を上げる動作も必要。 |
| P0 | 手と前腕に細い肌色/金色の断片が突き出し、握った指のまとまりや袖口→手首の形を読みにくい。 | All four `after/*-full.png`; some wrist separation is also visible in back views. | 左右の手首/握りをnative近景と普通の全身で確認し、破片状シルエットが消えること。実際のメッシュ原因は本画像reviewでは未特定。 |
| P0/P1 | 袴の前面/側面に黒い鋭い縦の割れ、角形/三角形の開口があり、自然な襞の陰影より裂けた布に見える。 | All four after full; player blue布で特に明瞭。 | 同条件で裾/腿前の布面が連続し、動作でも黒い開口や差込板が出ないこと。静止画だけで動作閉鎖とはしない。 |
| P1 | 兜の金色の帯が横顔で兜の輪郭外に離れた細線として見える。 | `after/warden-face-profile.png` (clear separation above/front of helmet). | 金帯が兜の表面に沿って接続することを正面/斜め/横顔で再確認。 |

These are visible art defects. This review does not infer a specific vertex-index, normal, skinning, or shader bug from the pixels alone. The integrator separately reported it authorized bounded runtime repairs and would not publish candidate 037fd9d in its present state; no publication action was taken by this reviewer.

### Residual distance to the requested PS4-level goal

- **目と表情。** 同じ照明下で眼窩が強く暗く凹み、細い白目と小さな黒点の瞳、単純な黒線の口が無表情なマネキンの印象を残す。頬の球を消した改善は明確だが、まぶた・目球と視線、鼻下/口の厚み、頬から顎への形の移行はまだ自然に見えない。
- **顎・耳・髪。** 顎先が鋭い三角形に見え、耳は薄い縁の別部品として目立つ。髪は硬い殻/帽子のような大きな区切りと光沢を持ち、細い束や生え際の読みが弱い。頭頂/髷付近の明るい小さな隙間も見えるが、これを意図しない実メッシュ交差/浮きと確定するには追加の接続確認が必要。
- **材質。** 布に織りに似た細かな変化は出た一方、顔・首・髪/兜に均一な横縞が目立ち、皮膚は木/ゴムのように一様。皮膚・髪・漆・布の違いは改善途中。縞の原因がテクスチャ、法線、ライティング、再標本化のどれかは本画像だけでは未特定。
- **四体の造形差。** player/sentinel/retainerの顔形・目鼻・表情は実画像上ほぼ同じで、主な識別は服色と鎧の枚数。wardenは兜と黒い顎当てで違うが、下の顔と全身体形は同じに見える。これを役柄のある人物群の完成とは扱えない。
- **実プレイでの成立は未測定。** 今回は中立舞台のidleのみ。通常の暗い社前や竹林、背面移動、走り/攻撃でのシルエット・布/手足の連続性・武器接触・fpsはこの資料にはない。以前の世界全体の裸地/岩/社/反復植生の診断も今回の人物画像によって解消されない。

結論: 造形を連続面へ変える方向は実画像上で改善を生んだ。しかし037fd9dは首・肩・手・袴の接続欠陥が強く、人物造形の修復を継続すべき候補。PS4級の品質到達、自然な人物の完成、C06達成のいずれもこのreviewは支持しない。正式10要素は未測定のまま。次の確定candidateを同じnative条件で再撮影し、P0項目の閉鎖と新欠陥を確認する。

### Actually viewed native media and local hashes

Each PNG below was personally opened. Reports were read as JSON. Paths are relative to `.review/34969080023/figures/`.

| File | SHA-256 |
|---|---|
| `before/player-back.png` | `7c537eefaea45f6939b6e969f36a69360277ce61b3fb81cef9f0b561f3d38bb5` |
| `before/player-face-front.png` | `4d2fcb6d87c41a9ca8702f4ef0546ec61975d5e58dda954c8a6c65dd8e8dcdfa` |
| `before/player-face-profile.png` | `9d8af2dfaa2482cbdb50a961c776e440751b80fb17a0c9315e72692e0d5d9b57` |
| `before/player-face-threequarter.png` | `7ad205aff7afea6596d3c5e6af22e2e6f5b732edf91272caa35dc9b63cf4068a` |
| `before/player-full.png` | `13b44c4dccbd5f9f19970f12abd5af279b6624b3f46c96b867e5890298f4fe96` |
| `before/report.json` | `221ddbd37e1c68420363c5b8d2e6161567683861715c30190db14debb4b3ee3c` |
| `before/retainer-back.png` | `9ff6acb2809b682136964ad5ca5daaa5871daa37d3c35cbf034f155af537ca23` |
| `before/retainer-face-front.png` | `ad0233888867c8f65ba230f4030ff4f352efcde1e13bbeea566d337177e9df45` |
| `before/retainer-face-profile.png` | `3f6a9747e09c4b6eddc043a96e39b4ee89009d8befa34f04aaaa0918ddd7718a` |
| `before/retainer-face-threequarter.png` | `ed4c95806590536b232af228c692dabe132bb767b7a8c9f38c25ea8b5a4d8697` |
| `before/retainer-full.png` | `70a6e98f6992aec20bbf5e857e5b90359a790ca06842c2b2467af32026160f40` |
| `before/sentinel-back.png` | `887fe1f2f21bc62ecca5c520992a4afc2558fb012496138f5540d157e9756da8` |
| `before/sentinel-face-front.png` | `80271e34afa4c9b78a8b39fb9c6f4c73c80d38689731605d75e3706b70a73a0b` |
| `before/sentinel-face-profile.png` | `70705106cdf157295a61c2ba6e3e1cfe85e40be01516e29f1d1001941d140ee9` |
| `before/sentinel-face-threequarter.png` | `def38fcfb4f7c642d2bc29a0205551d2163959a449f984697f7734306c531a58` |
| `before/sentinel-full.png` | `b23f9050faf55b947efc6fc5af63d169f85645077462048f9758f02aca35a0ee` |
| `before/warden-back.png` | `f81d5ba9ffa5ac29efc1c18b7b4561bfac97b59ab1d77557536f04e2a645a937` |
| `before/warden-face-front.png` | `a5b9ed8f1165d83eaff38f3dc26a09a583625b47bcc51973d9612b20452f89e0` |
| `before/warden-face-profile.png` | `ddfdd7ce33b0e9f150e95df08431f1bfd2b10d2f750540c414796840c2735b30` |
| `before/warden-face-threequarter.png` | `adee63c9fa3b266e3686913eb15f37015be76b923e1532e3daa7090e2ac08f6c` |
| `before/warden-full.png` | `9bebfcb901ac4759ba1db95b5ef4dd7426cc9f1fa0df3e677daca02f0284e539` |
| `after/player-back.png` | `0387a798f11019a0592a752fc11fa009bee22ec054e7c4dfc4605fa7dbe39906` |
| `after/player-face-front.png` | `396509ed6aace3c3b1d69e9f08f99b075f8a05915b00e888cd673e38e5d27e21` |
| `after/player-face-profile.png` | `0d5d2da1f8577198ba493e0d09eaf81d129191b0b82359c5baacab1c57238a6c` |
| `after/player-face-threequarter.png` | `2ec157848061ce1f5aabe0bf0cd8c494009177a54a29fe4c2a219311fad0e1d8` |
| `after/player-full.png` | `0c083c6673eae9080a31240b806de49bf8b3ed61b69c07730dc5203507e361d3` |
| `after/report.json` | `b6b90655cdd9fea734f1906dd55fbbc5c3777d0620842a1b31d9e51dd0e61dd0` |
| `after/retainer-back.png` | `4bbefdc52553628ff30acb658a5e13162196b0131f869807fc3ddc6b7dca9dec` |
| `after/retainer-face-front.png` | `2b2fce11bd30c300510e6e05f274d142738fcc9891ddd9a61d9983942fc4d6ba` |
| `after/retainer-face-profile.png` | `759f5166eca6833f35d5307eaeda247c89046ad648a66d40f9cd0150d8fb1e15` |
| `after/retainer-face-threequarter.png` | `846bf2a39bc6dc0f8a821d17d5638a20e31fb76b801a787df34fcc1c20801fe7` |
| `after/retainer-full.png` | `5a0191132a18a1d6f4ba0e470f4a555a80450a980252c71e111e79e909763025` |
| `after/sentinel-back.png` | `bea2a189cf3834d31e92e915ff0aa37974c26dea200fb8b9b63653f257e89033` |
| `after/sentinel-face-front.png` | `8ccd73b557b8fdb7eb7a92fa4a3557bee5b534680b2708b5e228135ca6b5e62d` |
| `after/sentinel-face-profile.png` | `0237d063c9c0e3045d2a53b1284ca5a3323644810ece603407fb0b22273e0fd1` |
| `after/sentinel-face-threequarter.png` | `76c900e24e3a0d78280c03deaa1584c0d333550d0c9e136032bc7723fdc8d7c1` |
| `after/sentinel-full.png` | `a4fd915d8df0108714a1d7785415eb4cbea26c75930be1accd6f9367af9a1108` |
| `after/warden-back.png` | `8a73d7ebd8111758bb1ef9f14fbcebaa8c9fc84c5f9ccc359df0004aae16e75d` |
| `after/warden-face-front.png` | `1536bd809111b20519a0d7bb9b805f0c2f83b0175759074c83f7a55b30e3bc52` |
| `after/warden-face-profile.png` | `72cfd3d283f4d6647513bcbe72751cebe1d56358e045d57d941a9a88a87fefd2` |
| `after/warden-face-threequarter.png` | `f6848ef130cc9bb08a77cdcdd52e012e980d49847c14d66911de94b99aac4db2` |
| `after/warden-full.png` | `a3f98b11f02700d37dd8de16ff8be165acfb44bfc30ae036eb97b12eefecae99` |

Candidate review appended at: 2026-09-15T12:39:36.433813+00:00

## Native vegetation media diagnosis — runtime 037fd9d

### Receipt, provenance and exact observation scope

- Reviewer: `/root/game2_ultra_art_sound_physics/independent_art_review`.
- Received candidate: `037fd9d10d35453695bb92da8ed47649e1405eae`; capture CI `34969080023`; received readback run `34971381554`.
- Supplied original media root: `.review/34969080023/vegetation/`. Integrator reported authorized original-media recovery with matching SHA/CRC; remote acquisition/CRC verification was not performed by this reviewer.
- The local report identifies the exact source revision above, 12 authored fps, base-opacity inspection rendering, and synthetic fixed cameras. It correctly describes root/undeformed-tip projections as framing guides. This report is metadata, not proof that every rendered leaf is visible or natural.
- Personally ran ffprobe and ffmpeg with `-xerror` to fully decode all three original h264 streams: `maple.mp4`, 960×720, 12 s, 144 frames; `maple-leaf.mp4`, 960×720, 6 s, 72 frames; `bamboo.mp4`, 960×720, 12 s, 144 frames. **All 30 seconds / 360 frames technically decoded with exit 0 and empty error output.** Each has a video stream and no reported audio stream.
- Personally viewed all six supplied original native PNGs: maple frames 0/132, maple-leaf frames 0/60, bamboo frames 0/132.
- For temporal inspection, decoded **52 selected source-frame instants** to temporary scratch outside the repository, then viewed unscaled 320×180 pixel crops arranged with labels. This preserved source pixel scale within each crop. I did **not** perceptually play or view every frame of the 360-frame videos at their continuous native playback rate. Full decode is not that claim.
- The selected frames span each full interval at 1 fps, with an additional consecutive 12-fps segment for maple-leaf and bamboo (source frames 24–35, video 2.000–2.917 s). Six original PNG instants are included within those 52 instants; they are not counted as extra unique times.
- Derived scratch directory: `/workspace/scratch/27301e95ee53/vegetation-temporal-review-037fd9d/`. No source or runtime file was changed. The first extraction attempt had a local ffmpeg filter-expression quoting error before output; it was corrected, then all 52 selected frames were extracted successfully. That local extraction error is not a game/CI failure.
- `manifest.json` binds every selected PNG to original source frame/time. The original frame 0 corresponds to authored world time 8 s after runner settling; video and authored times are kept separate.
- This is source-known diagnostic media. No reference plant footage or anonymous A/B preference test was used; all formal elements remain `not measured`.

### Selected native temporal regions actually inspected

| Case | Source frames | Native crop rectangle `(left,top,right,bottom)` | Visible purpose |
|---|---|---|---|
| maple | 0,12,24,36,48,60,72,84,96,108,120,132 | (205,75,525,255) | upper leaves, twigs and larger supporting branch |
| maple | same 12 frames | (330,470,650,650) | trunk base, ground contact and adjacent bamboo base |
| maple-leaf | 0,12,24–36,48,60 | (0,155,320,335) | large maple leaves and their thin twig region |
| bamboo | 0,12,24–36,48,60,72,84,96,108,120,132 | (365,155,685,335) | stems, lateral branches and leaf ends |
| bamboo | 0,12,24,36,48,60,72,84,96,108,120,132 | (350,500,670,680) | bamboo bases and adjacent grass |

Crops were composed only for technical inspection; no frame interpolation, retouching, color change, enlargement, or synthesized imagery was applied. Full native frames were viewed separately at the six supplied times to retain scene context.

### Direct observations

1. **Support and terminal motion are visually distinguishable in the sampled material.** The thick maple trunk and root-region outline stay nearly fixed while some maple-leaf edges and orientations change relative to the supporting silhouette. Bamboo's slender side branches and leaf ends also change position/orientation across the sampled times while bases remain stable to visual inspection. This supports a narrower statement that the visible tree is not merely translated/rotated as one rigid object. It does not visually measure a material stiffness ratio, exact natural frequency, or all species' physical correctness.
2. **No obvious root lift/slide or large leaf detachment was found in the visible sampled connections.** The inspected root crops retain ground position. Where thin twigs and leaves can both be seen, no large gap suddenly opens. Many attachments are overlapped or too thin to inspect throughout the scene, so this is not an all-attachment closure. The first/last PNGs and selected frame groups do not show a whole canopy jumping to a new pose or disappearing.
3. **The consecutive 12-fps excerpts show small changes rather than a large discontinuity.** In the maple-leaf and bamboo 2.000–2.917 s selected excerpts, I did not observe a large sudden pose jump, inversion or disconnection. The movement is subtle. The 1-fps samples elsewhere cannot rule out shorter stutters/pop events between sampled instants, and this review does not claim continuous full-film smoothness.
4. **The close-view fixture is only partly useful.** `maple-leaf/0000.png` and `0060.png` have a foreground bamboo culm and leaf sprays crossing the maple. Several maple leaves are large enough to inspect, but the camera is not centered on a single unobstructed leaf-petiole-branch junction. Some large maple leaves are cut by the frame border and multiple attachment chains overlap. Thus full leaf/branch connectivity and local-versus-parent phase are harder to see than the report case name suggests. The updated metadata's warning about native visibility was necessary.
5. **Static form and repetition still dominate the artificial appearance.** Maple leaves are large, flat, uniformly colored, similarly star-shaped planes, with little visible vein, curl, thickness or size hierarchy. The central wood trunk reads as a blunt cylinder/cut top with straight radial supports. Bamboo has very straight culms with blunt tops and repeated comb/feather-like lateral rows of similarly angled slender leaves. These are directly visible art observations; making terminal motion different from trunks does not by itself close them.
6. **No long-period repetition judgment is supported.** Six/twelve-second clips with this sampling can reveal repeated forms in space, but are insufficient to establish the absence of a recognizable animation loop over longer exposure. No claim is made that leaf phases/frequencies are all distinct or that repeated plant instances never synchronize.

### Diagnostic conclusion and remaining work

The sampled native material provides visual evidence of **stable bases with smaller-part relative changes**, which is consistent with the user's requirement that a trunk and leaves should not move as the same rigid object. The evidence is limited to visible regions at the specified instants and one short consecutive segment in two cases. It does **not** establish full naturalness or a formal comparison pass. The largest directly visible remaining problems are flat repeated plant forms and a partly obstructed leaf-close camera. A next perceptual capture should show one unobstructed root-to-branch-to-leaf attachment chain, plus a leaf close-up with its supporting twig in view, and a longer ordinary gameplay interval. Exact stiffness/frequency/phase claims require an appropriate continuous temporal evaluation in addition to technical telemetry.

No definite large animation break requiring immediate source repair was discovered in these selected frames. This is not a blanket plant-quality acceptance; the source-known formal statuses remain `not measured`.

### Original-media local hashes

| File relative to vegetation media root | SHA-256 |
|---|---|
| `bamboo/0000.png` | `a782f9c0a988e80a4f186bbd6a71883a6774600db4519d6cf2ee8cd23115151f` |
| `bamboo/0132.png` | `a1e25c0b2e73aee7c48e1360591308796cf1da3f7aa5158698a7d3df4696b634` |
| `bamboo.mp4` | `e072f7a56266609c18094b250255d091dc3763e932aad4cab51f62354d303881` |
| `maple/0000.png` | `b74e7d0b1c978be7b13b227e076ff5c030fe15186355d43ef0fe16a6f93ba054` |
| `maple/0132.png` | `d1c3f424e5461b7a3db090d0f6ad53d1990c564616c3d6e748d2e17698d8735f` |
| `maple-leaf/0000.png` | `429f8446d164916443cee2046f3a7c8414b63ba83f96675b6c11d02855520c44` |
| `maple-leaf/0060.png` | `62dc928bba4216eb97fc7f20f988ee83c3b477e69c0e38551fa0427a5eb07f92` |
| `maple-leaf.mp4` | `77af00eab59bfae6b9fd4645b0b5dcec1da0e654cd1fc62707dc50c72bb89dd1` |
| `maple.mp4` | `46aad71612307b1cbd598211114592addc84ffabae72971f6414540ec229964b` |
| `report.json` | `8ac5cd3af385803f0b1b7b549c2f369b7a2f2182bfec84a80e4695d0c53b11c2` |

Derived mapping SHA-256: `78b5c74720df95165844cf31e5577c354e04f93df02ac0a447868c99c4d1bc9e`. The selected frame ranges and native crop rectangles above are sufficient to reproduce the inspected material from the source videos.

Vegetation review appended at: 2026-09-15T12:59:24.576491+00:00

## Native repair-closure review — candidate acf0f9e

### Exact receipt and comparison conditions

- Received from `/root/game2_ultra_art_sound_physics`: runtime `acf0f9ec86996245ad712d6adc72e5d6159f6711`, figure-capture CI `34971788118`, original PNG/report recovery with matching SHA/CRC reported by the integrator.
- Supplied root: `.review/34971788118/figures/`. Both current reports identify runner `acf0f9ec86996245ad712d6adc72e5d6159f6711`; before source remains `b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`, after source is `acf0f9ec86996245ad712d6adc72e5d6159f6711`. Both report `errors: []` and a technical capture result of passed. Whole CI completion is not inferred from the figure job.
- Personally opened **all 20 new after PNGs at native 960×720**: four actors × full/back/front/threequarter/profile. Compared against the personally viewed 037fd9d images documented above. The 20 current before PNGs are byte-for-byte identical to the previously viewed baseline PNGs (independently checked); they were not needlessly reopened or counted as newly viewed material.
- Personally compared the current after metadata with 037fd9d after: all 8 full/back camera and target pairs are exactly unchanged. All 12 face views preserve camera-to-target offsets but both camera and target follow the changed head mounting. Target y changes from `1.680890067772631` to `1.6258943319760035`; target z from `0.011106616805731629` to `0.010421748798340133`. Thus these are not 20 identical world-camera pairs.
- Exact git comparison found no change in `fresh/art-direction-capture.mjs` between 037fd9d and acf0f9e. The runner keeps the same 38-degree field of view, 960×720 viewport, fixed lights, and exposure 1.02. Face views can diagnose head-local geometry and attachments; they are not a pixel-registered world-camera comparison. Full/back views independently show the neck-height correction.
- This remains source-known diagnostic review. Future body-source prototyping mentioned by the integrator was not inspected and does not affect the result for this exact candidate. No source file was changed by this reviewer.

### Closure of the earlier visible symptoms

These closure findings apply only to the supplied synthetic idle pose and native views. They are not whole-animation acceptance or a formal concept-element result.

| Previous symptom in 037fd9d | Direct observation in acf0f9e | Bounded diagnostic outcome |
|---|---|---|
| Extreme long cylindrical exposed neck | All four full/back views show the head much closer to the torso. Face views show a shorter exposed neck with a visible neckline. | The extreme-length symptom is closed in the inspected idle. Fine anatomical neck/shoulder continuity remains limited. |
| Large black open shoulder tube | The former opening is filled with fabric-colored surfaces in all four actors. Face-threequarter and back views confirm the large empty hole is gone. | The open-hole symptom is closed in idle. The cap-and-ring shoulder design still looks mechanical and does not close the broader human-body connection issue. |
| Skin-colored finger/forearm shards | The prior protruding fragment-like hand/forearm silhouettes are no longer visible in the supplied full/back views; hands now read as simple solid masses. | The conspicuous shard symptom is closed at this scale/pose. Close hand anatomy and movement/weapon grip remain unmeasured. |
| Sharp black hakama rips/openings | Four full views retain a continuous pleated surface where the previous large sharp gaps were visible. Back views retain a central trouser/hem separation without the former jagged front shapes. | The earlier large static cutout symptom is closed. Running, crouch and attack cloth continuity are unmeasured. |
| Tiny black-dot eyes and heavily dark sockets | Iris/pupil rings are now visible; eyelid/socket darkness is reduced. Chin is less pointed and skin/hair banding is reduced. | Improved, but natural gaze, eyelid construction and facial expression are not closed. The face remains mask-like/mannequin-like. |
| Warden gold helmet strip floating away in profile | Front and threequarter show the strip conforming to the helmet; the detached gold line in the previous profile is absent. | The visible floating-strip symptom is closed in the three supplied head angles. |

### Remaining or newly exposed defects

1. **New/exposed collar fragmentation.** In all four actors' face-front/threequarter views, the pale inner collar is mostly covered by the broad rounded chest surface, leaving a narrow pale triangular sliver and a separate short pale patch. In full views, the old continuous V-shaped garment opening reads as a shortened isolated fragment. This is a directly visible layering defect, particularly clear in `after/player-face-threequarter.png` and equivalent sentinel/retainer/warden views. The pixel review does not prove a particular mesh intersection cause; it establishes that the intended collar line is visually broken/hidden.
2. **Shoulders are closed but remain built from capped pieces.** The circular fabric cap and central circular patch, surrounded by an outer black armor ring, are clearly visible in face-threequarter. Arms and chest still read as separate inserted parts rather than fabric covering a continuous shoulder/upper arm. Filling a hole improved the previous defect without reaching the human-body form target.
3. **Face still lacks life and individual character.** Eyes now have irises, but the large smooth face, thin slit mouth, broad hollow cheek/nose transitions and nearly fixed expression remain mannequin-like. player/sentinel/retainer continue to share virtually the same face in the visible images. The rounded jaw and reduction of horizontal striping are improvements, not proof of natural human fidelity.
4. **Hair and ear integration remain simplified.** Hair forms a smooth segmented shell with a hard band and an attached loop-like topknot. The small bright gap beneath/around the topknot remains visible in player/sentinel/retainer profile/threequarter. Ears remain thin rim-like shapes that read as separate attached pieces. These are residual art observations, not newly diagnosed topology bugs.
5. **Warden face armor remains a plain black attached surface.** The curve and fit have improved, but it reads as a large black patch with sharp raised corners and little visible thickness/fastening. This is a design/material fidelity residual, separate from the closed floating helmet strip.
6. **Runtime movement and the game scene remain outside this closure.** No current running/attack, hand close motion, dark-environment gameplay, plant update or audio has been assessed from this figure set. The neutral-stage static images cannot close those items or establish PS4-level overall visuals.

Conclusion: acf0f9e closes the conspicuous static neck-length, shoulder-hole, shard-hand, torn-hakama and floating-helmet-strip symptoms observed in 037fd9d. It still needs collar-layer correction and stronger continuous anatomy/material/face design. The severe old symptoms should not be reported as still present in these exact static views, nor should their closure be promoted to natural-character/PS4/formal-element acceptance. All ten formal comparisons remain `not measured`.

### New local media hashes

The 20 after PNGs below were personally viewed; report files were read. Baseline PNG byte identity was checked against the prior recorded baseline.

| File relative to `.review/34971788118/figures/` | SHA-256 |
|---|---|
| `after/player-back.png` | `ec00e53747e5c5b039c8a2cd75544c9fd4e023262b8547668094f539d5514e6e` |
| `after/player-face-front.png` | `4622bd57cb36b15dda0c509c058153a1ce4a3ef84196e609630ad267fc0ca433` |
| `after/player-face-profile.png` | `2bad329e57b8ccbef0e637bb372a8f6f4aa735b8a16e148a901519e2c2b5f4a4` |
| `after/player-face-threequarter.png` | `cfc6d9d24f5257a4d831e952c2cabc0a7f8bf63122215a7218bf1064f8418b59` |
| `after/player-full.png` | `7c1777347a3527465382510ed1173ce31c7f009b45bbb53a2bb72343b2a19ca9` |
| `after/report.json` | `5fc66da254660df545f872c13e4eed2a60f0e31618812e3d1f3201d0819488f2` |
| `after/retainer-back.png` | `d4ebe466dd19ebb347d5bbae9e445c5c80ee57a93297951d53615912c5ada713` |
| `after/retainer-face-front.png` | `a178088e69810b16fea52131583554c5ce18c6b5d9ecc60ec881452f98ecd7b3` |
| `after/retainer-face-profile.png` | `26803ceb7a799acd1255de0a32f689fd8eae5ba6e84222d95ec3b6bce4b8088c` |
| `after/retainer-face-threequarter.png` | `a4250a72b92d91c07328fda8593044449ca4d3743e744ce6e257084d57b88e97` |
| `after/retainer-full.png` | `9baac902e761671ab35f352c06a73433d3bfb049ca36c669b4fbcad3b19bc92c` |
| `after/sentinel-back.png` | `14f3e7c9f997ba8d8111eabf11407f28165ae56f36f525be4f76d65afb61b3a7` |
| `after/sentinel-face-front.png` | `534b495cc5969805fe06d75d7e42700b5b9932c93b33b5f936c8f0c0e32c56d2` |
| `after/sentinel-face-profile.png` | `2b199665d9e4c8cbb98ce05d5c68f35a9ac3c9b4da1a799e4604da477cd3bc02` |
| `after/sentinel-face-threequarter.png` | `aaa2eca69aa6ffb67b00ef5132f1c21bb1a13461b77e52c2043352d7d9137776` |
| `after/sentinel-full.png` | `9892a4ae1f7c74a236c6db1bb6833ad799dcf5b8c9238c956cd4aa1a6133f9a9` |
| `after/warden-back.png` | `67c5c6b115e5a74929a2ded2e0e41e59dfcd0b7a25f6314c26ef1b8d2bada0c8` |
| `after/warden-face-front.png` | `9aadc11cb441cc1a1e55fa59d2f9543eab1f97a151cafec2ec9c5b7a0c98b8a9` |
| `after/warden-face-profile.png` | `3873bd0266b011f7fed022d24f084f4c7cf0372e5ddfa2c7d97b7e690ea3c261` |
| `after/warden-face-threequarter.png` | `70990b8586ec3ce8285bb91c20fff044c55bf31bb1c641410cf337f798894a1e` |
| `after/warden-full.png` | `c398084da737538696c6d3747a7b2cba90ec9cc0d9f0842ece69c6554aec4dcb` |
| `before/report.json` | `7a6fb88b73dda51d2918bfabff4e1259dd89a863de3686786942f32e07c9f651` |

Repair review appended at: 2026-09-15T13:02:53.208753+00:00

## Ordinary runtime-screen visual diagnosis — acf0f9e

### Receipt and actual inspection

- Received exact runtime `acf0f9ec86996245ad712d6adc72e5d6159f6711`, CI `34971788118`, fresh job `104389572336`.
- Integrator reported original-byte recovery through authorized job logs with matching ZIP/CRC/SHA. This reviewer did not perform that remote acquisition. Supplied local directory: `.review/34971788118/fresh/`.
- Personally opened all **7 supplied original PNGs** with original image detail: `encounter.png`, `mission-victory.png`, `desktop-right-victory.png`, `title.png` at 1280×720; `mobile.png`, `mobile-mission-victory.png`, `touch-left-victory.png` at 844×390.
- These comprise two ordinary gameplay views, four ending/result views, and one title view. They are not seven continuous gameplay sequences. The displayed filename/event labels are not evidence that an unseen input or animation occurred.
- Read only source/environment metadata from `browser-report.json`, `route-matrix-report.json`, and `build-fingerprint.json`. Both browser reports identify runtime acf0f9e and Chromium/SwiftShader. The fingerprint identifies `fresh` tree `7b4ca3643630ee9420ce2423b69190ac80ed8db4`. Report success is technical provenance, not this reviewer's reproduction of input tests or a visual-quality pass.
- No current runtime video, controls, sound, frame rate or physical phone was tested in this image review. No conclusion about movement smoothness, sound naturalness, input response or completed sheathing is inferred from the still frames or ending text.
- This is source-known diagnosis of the integrated screen. No anonymous reference comparison was conducted; all ten formal comparison elements remain `not measured`. The PS4-level wording is treated as the user's visual-quality target, not a hardware measurement or a universal claim about every PS4 game.

### Improvements actually visible at gameplay distance

1. **Character body changes are visible beyond the neutral stage.** In `encounter.png`, the blue player's back, sleeves and lower garment show curved volumes; the extremely long neck and old box/plate silhouette are not the dominant impression. The nearby brown opponent also reads with a curved torso/cloth arrangement. In `mobile.png`, the back silhouette remains identifiable at the smaller display size. This confirms that some neutral-stage improvement survives normal scene placement. It is not a pixel-matched before/after normal-gameplay comparison: the older ordinary views inspected earlier used different moments/cameras.
2. **The scene has a readable route and depth composition.** In `mobile.png` and `title.png`, the path leads toward the red torii and the shrine beyond. The bright/red landmark, long side shadows and distant vertical bamboo establish a recognizable place. `encounter.png` keeps the nearby actors separated enough by color and shape to identify their positions.
3. **Graphic hierarchy is legible.** The light serif title/result typography and the warm result button are readable against the darker scene. The hanging lantern forms a small warm focus in the ending views. These are existing visible strengths, not claims that this revision newly introduced them.

### Largest integrated-screen defects and residuals

| Priority | Direct visible issue | Images / effect on the whole screen |
|---|---|---|
| P0 for the overall visual target | **Large ground areas remain a single noisy brown surface with sparse repeated vegetation.** Ground texture covers much of the foreground/midground without convincing changes in soil, leaf litter, small stones, erosion or transitions into the path. Thin grass blades recur with similar size/color and distribution. | `encounter.png`, `mobile.png`, `title.png`. Even with an improved actor, most screen area retains an early blockout/staged appearance. |
| P0/P1 | **Environment objects still read as simple repeated solids.** The central rock obstacle resembles several similar rounded lumps arranged inside a rectangular support. Torii posts are smooth broad cylinders/rectangular beams. Shrine walls are large flat panels with repeated red vertical bars; the roof becomes a near-solid black slab. Stone lanterns and paving repeat the same few broad shapes. | Especially `encounter.png` and all four ending views. The world does not yet match the character's more curved surface detail, so the integrated image remains inconsistent in craft/detail. |
| P1 | **Vegetation is visually thin and repetitive at ordinary distance.** Straight bamboo poles and similarly organized narrow leaf sprays repeat across the slopes. Much of the forest reads as lines over bare terrain rather than layered foliage mass. At the captured mobile resolution, fine leaf/stem edges become jagged or merge into repeated stripe-like patterns. | `mobile.png` and `title.png`, also the background of `encounter.png`. This is the appearance at the supplied capture size; physical-phone rendering quality is not measured. |
| P1 | **Lighting gives direction but limited surface integration.** Long directional shadows create a time-of-day cue, yet many hard dark stripes accumulate across the same brown ground. Broad building/rock surfaces carry little material variation, and the shade/foreground grades become very dark. | Gameplay/title images. The light supports composition but does not compensate for simple object shapes and material response. No specific lighting/shader implementation bug is inferred from the stills. |
| P1 | **Ending composition exposes the plain shrine wall and hides most of the landscape.** In all four result images, a large wall with evenly spaced posts occupies most of the visible game area. A wide dark result gradient improves text contrast but removes much of the remaining environment; the actor is relatively small. Pale rectangular pieces on the floor stand out against the dark ground. | `mission-victory.png`, `mobile-mission-victory.png`, `desktop-right-victory.png`, `touch-left-victory.png`. The pale pieces' origin is not established from these images. The result screen does not visually convey a richly finished destination. |
| P1/P2 | **Character integration is improved but still stylized and mechanically assembled.** Curved clothes are now visible, but shoulder rings, simple hands/boots and the largely uniform back remain readable as assembled shapes. Faces are too small in these normal views to close the facial-fidelity problems from the dedicated close-ups. | `encounter.png`, `mobile.png` and result views. A better close-up head alone will not solve the surrounding scene's dominant defects. |

### Result and next visual priorities

The normal runtime screens confirm a visible local character improvement. They do not support claiming the requested PS4-level integrated visual target has been reached. The dominant remaining work is the **world's large forms, material transitions, vegetation mass/variation, and lighting/composition around the character**, alongside the unresolved body/face/collar work from close inspection. Adding only fine facial or costume details cannot address the majority of visible screen area.

For later assessment, keep the current readable path-to-torii-to-shrine composition and evaluate improvements in ordinary encounter and mobile approach frames as well as the ending. Screen-space priorities should include ground/path transitions and natural set dressing, less repetitive rock/building/vegetation forms, and a destination composition with richer visible depth. These are art-direction priorities derived from the images, not claims that the separately developing CC0 body or real-size leaf prototypes already solve them. No future prototype was viewed or credited.

### Local original-file hashes

| File relative to `.review/34971788118/fresh/` | SHA-256 |
|---|---|
| `encounter.png` | `761615c5f4126c0845a3dd37d4e8e45c6bacaa7bef7f75578aa801bbdba5d23d` |
| `mobile.png` | `0b90edc6192c0ec980a3892df9c2d2b05ad51c48cb3c97ebee8c5fb15be7b66a` |
| `mission-victory.png` | `d3d9a57e333d1e1d67bb489ce490a96e4a1dbfebec01514d1b868f739298e3f6` |
| `mobile-mission-victory.png` | `ea0b86ef9e0f4380a31fca003e8a9bf3be22038db253564ece594850768fdd54` |
| `desktop-right-victory.png` | `6ec7477a2fc23caaed6a7df71e2f8c55c03d15f2df18991745c4e01ca4561e75` |
| `touch-left-victory.png` | `4f4f91fd8bd81f1af909305e762055628cd8800f5a68507de39081c95e4d466d` |
| `title.png` | `5e5edaf1a46ab467bf4782a7240a02df0b2ec5a3b1c31d55a34f1c8da02d5aaa` |
| `browser-report.json` | `363bd1a2fa6336160f1a141f60025796f658c0906b4b02a59eece9ce691dd93d` |
| `route-matrix-report.json` | `19f69a1f57acbebadada5bd42034c94a359922aa1e92e01ef9ea0c1da450d6f7` |
| `build-fingerprint.json` | `2e789866e6a09ebfc9551362194e6ca4ac4ff84f7346c5db8388728c5fdecd14` |

Ordinary-screen review appended at: 2026-09-15T13:18:16.944455+00:00


## Independent foliage source / CPU geometry review — 079511e

### Receipt, boundaries and source

- Received isolated frozen candidate `079511e895a1915d36d9eb6bdb0443d168998f64`, base `acf0f9ec86996245ad712d6adc72e5d6159f6711`, at `/workspace/scratch/27301e95ee53/game2-foliage-pilot`.
- Read the listed leaf, inspection, foreground and presentation sources, their relevant tests, the author's foliage evidence and counts/CPU JSON, and unchanged physics/wind code. The author's **203/203 tests and build success** remain the author's reported execution; this reviewer instead ran the bounded independent numerical checks below. The browser/WebGL stub in the supplied scene-construction helper was read before use.
- No new candidate PNG or video was received or viewed in this task. No WebGL rendering, shader compilation, physical-device performance, audio, botanical measurement or reference comparison was performed. Earlier runtime-media observations in this document do not count as observations of this new foliage.
- Source-known technical diagnosis, not a blind comparison. Formal ten-element comparisons remain `not measured`; GPU appearance, naturalness and the PS4 visual target remain unjudged.
- No candidate source, test or author evidence was edited by this reviewer. Only this owned record was appended. No staging, commit, remote or automation action was performed.

### Source findings

1. **Leaf-to-support connection is represented in geometry and the modal hierarchy.** Maple blades have a narrow petiole whose two root vertices straddle the physical pivot, with shared blade-base vertices. Their pivots are placed on actual maple twig centerlines. Bamboo blades similarly include a petiole; their pivots occupy the main short twig and its two actual tapered lateral members. The branch/twig parent assignment remains explicit. All leaf vertices carry a local support, pivot, hinge axis and blade direction, allowing leaf hinge/curl motion relative to the carrying support instead of a shared whole-object sway.
2. **The bamboo lateral members use a disclosed approximation.** The 1,800 short side members and the leaves attached to them are transported through the same parent twig deformation field. They do not acquire independent beam oscillators. This preserves positional attachment in that field but does not establish rigid side members or measured botanical physics. The author's reported 0.10003% maximum chord strain over the stated 20-second sample is an author measurement, not independently reproduced here.
3. **Surface and shadow data are consistently supplied at source level.** Maple has a raised vein junction and folded edges; bamboo has a raised midrib and folded/drooping blade. Vertex normals are computed from the submitted geometry. Color and roughness maps are opaque linear data textures; both color materials and custom wind-deformed depth material are DoubleSide. Color and shadow passes use the same modal displacement code. This establishes wiring, not that GPU compilation, dynamic highlights, underside shading or thin-leaf light transmission look correct. Both sides share the material; no measured leaf translucency is implemented.
4. **The sphere optimization precedes the unchanged triangle test.** Supports are split first, then separate leaves are grouped by pivot and seed within each support. The radius is based on centerline length plus transverse distance and 6 mm guard; the center follows the current support frame. Candidate leaves retain all their triangles and use the same CPU deformation as the full reference. The outer bounds expansion remains 1.4 m; near/far, opacity, hold, fade rates and pause/reset behavior are unchanged in the diff. This review found no concrete false rejection in the independent checks below.
5. **Camera selection has a reporting-scope defect.** Frozen `vegetation-inspection.js` deliberately excludes the inspected tree's own support hierarchy in whole-tree views and the selected twig's ancestors in the close view. Thus `occludedRays: 0` is a result for the included other woody geometry, not for all woody surfaces. It also does not test terrain/buildings/rocks or full leaf visibility. The original runner phrase “clear woody-geometry rays” can be read too broadly. This was sent to the integrator, who requested separate other/self/all diagnostic wording from the author. No camera or shape redesign is recommended solely from these CPU rays before viewing the actual media.
6. **Selection does not hide scene objects.** Its geometry proxies are temporary, with no source visibility/opacity/shadow mutation. At this candidate all 112 actual vegetation mesh world matrices were identity, so the selection proxy's identity transform matches current production geometry. This is a current-scene fact, not a general guarantee for later transformed vegetation objects.

### Independent numerical execution and results

All runs used Node and actual submitted scene geometry with Canvas/WebGL submission stubbed. Commands exited successfully; they did not render images.

| Independent check | Actual scope | Result |
|---|---|---|
| Conservative leaf sphere | All 20,088 submitted leaves / 222,912 leaf vertices; 20 seconds integrated at 60 Hz; vertices inspected at 0, 0.5, 1.5, 3, 5, 8, 12, 16, 20 s | 2,006,208 deformed-vertex checks; 0 outside their leaf sphere; minimum spare radius **0.00768968445 m**. Root drift at the final state 0. |
| Group/index validity | All 112 submitted vegetation batches | 0 triangles spanning separate leaf/wood/support groups; maximum stored blade-direction unit-length error **7.58e-8**. All current world matrices identity. |
| Optimized ray API versus full deformation | **7 actual spatial batches**: 3 maple, 4 bamboo, sampled from smaller/larger batches; 4 phases (0, 0.43, 5.65, 17.9 s); triangle centers, 98% near-corner barycentric points, oblique rays, distant misses and some multiple-target queries | **1,008 queries: 756 full-reference positives, 252 negatives, 0 mismatches**. A console scope label mistakenly said eight batches; the emitted name array and actual query count establish seven, which is the scope recorded here. |
| Historical waystone control | Exact recorded player position (-12.152201271544866, -38.75898447460243), all four maple wood batches fully deformed; 13 phases from 0 to 24 s by 2 s; actual animated actor sight points and current gameplay camera | Full-reference geometry **0/13 blocked**, optimized result **0/13**. This independently confirms the old positive ray no longer crosses the reshaped wood, rather than assuming that the optimizer's negative result is correct. |
| Root/grass preservation | Constructed base presentation source from git and candidate presentation with the same unchanged imports; compared grass geometry and every instance-transform hash, all root rest records, support count | Exact equality; **155 roots**, **2,317 supports**. This independently supports root and grass preservation; the source diff also leaves route/terrain rules intact. |
| Generated leaf winding / normals | 1,000 maple plus 1,000 bamboo leaves across production dimension/seed ranges | **30,000 triangles**, 0 nonpositive projected areas, 0 invalid/nonunit normals; minimum projected area 2.6568682e-6 m², maximum normal length error 3.12e-8. This is geometry validity, not a rendered quality score. |

The ray batches were `maple-leaves--1,-3`, `maple-leaves-0,-3`, `maple-leaves--2,0`, `bamboo-leaves--1,-3`, `bamboo-leaves--2,-4`, `bamboo-leaves-2,1`, and `bamboo-leaves--2,-2`. Full-reference proxies deform every source vertex before ordinary Three.js triangle raycasting; the optimized API's reported blocked state was compared to that independent reference.

### Camera scope reproduced independently

After settling the actual physics for eight seconds at 60 Hz, repeated the chosen subject-neighborhood rays against all current woody triangles, including the own-tree supports omitted by the selector:

| Study | Selector's included-wood result | All-wood result | Camera height above terrain |
|---|---|---|---|
| Maple whole | 0 / 20 | 10 / 20 | 4.77344 m |
| Maple close | 0 / 15 | 1 / 15 | 4.45953 m |
| Bamboo whole | 0 / 25 | 8 / 25 | 6.45011 m |

All extra hits were within the inspected tree's corresponding wood batch (and the bamboo twig wood stored in its leaf batch). Whole-tree rays deliberately target points on the trunk, so own-trunk hits are partly expected and these counts alone do not prove a bad camera. The close-view selector's rest-normal face cosine was 0.9350. This score uses a rest-oriented reference normal, not a measured deformed leaf facing angle. Terrain-height clearance excludes an underground camera at these three positions, but is not complete scene collision or obstruction testing.

### Regression-test judgment and remaining validation

Keeping the historical 13-phase case as an explicit **negative after geometry redistribution**, while adding rays through real currently deformed woody triangles as positive controls, is appropriate. The new positive controls test opacity/depth/shadow fading, pause and reset; the full-reference historical check above confirms this is not simply relaxing a failing intersection implementation. No opacity threshold or outer margin was weakened to obtain the new result.

The author's counts show vegetation triangles **141,182 → 293,612**, vegetation vertices **180,628 → 307,138**, and vegetation attribute bytes **17,340,288 → 32,786,592**, while batches fall 114 → 112. The submitted CPU timing JSON cannot establish GPU cost or physical-phone frame rate. The larger geometry budget and much smaller individual leaves require actual ordinary-distance media to assess canopy density, repetition, edge aliasing, motion visibility and integration with the world. Individual leaf dimensions, valid normals and attached pivots cannot close the user's overall visual complaint.

**Finite technical result:** no concrete implementation blocker found beyond the inspection reporting scope above. The full source/tests/build/GPU are not collectively certified. New rendered evidence is still required for shader output, visible petiole/side-branch connection, leaf backs/shadows, natural movement and integrated visual quality.

At the end of this review the author had begun the integrator-requested wording changes in `vegetation-inspection.js`, `vegetation-capture.mjs`, and `leaf-surface.test.mjs`; HEAD was still 079511e. Those later uncommitted changes are not silently included in this frozen-candidate assessment. The following hashes are read from the exact reviewed commit, not those changing worktree files.

### Frozen reviewed-source hashes

| Path in foliage pilot at 079511e | SHA-256 |
|---|---|
| `fresh/leaf-surface.js` | `7228c50b34e1a4c9f021fad60c5726f75f3fb58565676160b16bb204c045ff24` |
| `fresh/vegetation-inspection.js` | `bc2ecebe344ef9c2d2e733aada7c535cbcdcb6c3144c196e94dab4b99928e616` |
| `fresh/foreground-visibility.js` | `50831843771fe7eb0aca3d055e0757b6bbe8c69133b5720b34a8881b70497fd5` |
| `fresh/presentation.js` | `99a93953bac3033a4c2074ca999100ef025e860d319c99e1131aa76050505785` |
| `fresh/leaf-surface.test.mjs` | `0cadeb2d9248aaffd96f14eb9f309c060c48b4161e346d6c4a48efd649032533` |
| `fresh/foreground-visibility.test.mjs` | `5e01ba5076def38774fd784c49fd9c0c165abda8bbb9db7ecdf94d562abdfc8e` |
| `fresh/vegetation-capture.mjs` | `f98da1c03830582d1023779554d60d9b120101eb62990782b5ed08ab93bea705` |
| `AI_DEVELOPMENT/EVIDENCE/20260915-foliage-pilot.md` | `240b4e9f77f34484de6a3e83abbdcaa9421a4268aed0068ea65d41b336411022` |
| `AI_DEVELOPMENT/EVIDENCE/20260915-foliage-pilot-counts.json` | `459aeab2d033a917084c8f473f138c686fabc5ca87c014c301d5f7f70160433a` |
| `AI_DEVELOPMENT/EVIDENCE/20260915-foliage-pilot-cpu.json` | `8ab0d240c8f7f4a609b4350d23be87380d85fbd12965befe7d45c54fe227bafe` |

Foliage source review appended at: 2026-09-15T13:55:56.492489+00:00
