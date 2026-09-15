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


## Independent native figure review — e188201

### Receipt and personally inspected scope

- Received runtime **`e18820165d6008fedfca28d2cc7073a9c4b74b28`**, CI **`34978382509`**, art job **`104411930711`**, with 40 original PNGs and two reports in `.review/34978382509/figures/{before,after}/`. The integrator reported successful original ZIP/SHA/CRC verification; this reviewer did not perform the remote acquisition.
- Personally opened **all 20 new after PNGs at original detail**, covering player, sentinel, retainer and warden, each in full-body, back, front face, three-quarter face and profile. Each original is **960×720**.
- Reopened six supplied baseline PNGs: player full/back/front-face/profile and warden front-face/profile. Independently compared all 20 baseline PNG bytes against `.review/34971788118/figures/before/`: **20/20 identical**. The other 14 baseline images were previously inspected in the earlier full native review and were not unnecessarily reopened in this task. This is not a claim to have newly displayed all 40 supplied PNGs.
- Also reopened four exact previous repaired-candidate images from `.review/34971788118/figures/after/`: player full/front-face/profile and warden three-quarter. These establish which problems are new relative to **acf0f9ec86996245ad712d6adc72e5d6159f6711**, rather than attributing every old defect to the latest head.
- Reports identify baseline source b06ade1ad5ab8b72de9bb9996f323a063f5db5ef and new source e188201, with e188201 as runner revision on both. The images are a synthetic idle pose on a neutral stage. Report success and asset-ready labels are provenance, not perceptual acceptance.
- Camera/target comparison: current baseline versus new has **8/8 matching full/back cameras**. The 12 face cameras follow the already lowered head target, shifting about **-0.0549957358 m in y and -0.0006848680 m in z** relative to b06. Current e188 after versus previous acf0 after has **20/20 exactly matching camera and target arrays**. Thus the explicitly reopened acf0 comparison supports localized regression judgments without that camera shift.
- This is known-source technical/appearance review. No author self-evaluation was supplied or used. No new fixed C06 reference inspection or anonymous comparison was conducted. Formal ten comparison elements remain `not measured`. Ordinary gameplay screens, motion, audio, grip under action and device performance are outside these still images. The integrated PS4 visual target remains incomplete and cannot be closed from these portraits.

### Actual improvements

1. **The face now reads as human anatomy.** The player/sentinel/retainer front, three-quarter and profile images show connected orbital rims, nasal bridge and nostril wings, upper/lower lips, cheek planes, jaw and a continuous neck. Ears have recognizable outer and inner folds and sit naturally against the side of the head. The imported-looking skin color variation and small surface detail are visibly present. This is a substantial improvement over the b06 disconnected cheek/nose/ear solids and also over acf0's smooth mannequin head with separate ear plates.
2. **The anatomical profile and scalp are more coherent.** The side of the face flows from forehead through nose, lips and chin. Hair follows the scalp around the ear and nape more closely than acf0's broad separate cap and straps. The forehead no longer reads as a helmet-like solid band on the three unhelmeted characters. This improvement does not remove the hair-edge and topknot defects listed below.
3. **Earlier full-body progress survives.** Relative to b06, full/back images retain curved sleeves, a rounded torso, folded lower cloth, rounded shin armor and shaped feet instead of the old boxes and hanging boards. These improvements largely predate e188 and are not all credited to this particular revision. The extreme 037 neck/shoulder openings, loose skin shards and large black garment tears do not visibly recur in these supplied idle full views. Hands are small in these frames, so detailed finger contact and grip quality remain unmeasured.
4. **The helmet stripe remains attached in the visible views.** The warden's gold stripe follows the crown rather than floating above it as in the earlier failed candidate. Its face covering creates a separate serious problem below.

### Major defects, regressions and concrete evidence

| Priority / status | Direct visible finding | Native evidence and review limit |
|---|---|---|
| **Major new regression versus acf0** | **The raised collar does not join the torso cleanly.** Both collar ends form triangular openings through which the stage background is visible. A separate dark curved strip sits across the upper chest beneath the neck. The pale diagonal front trim remains partly buried in the chest, leaving a thin sliver and a separate short pale patch. The result resembles several intersecting cut pieces, not a finished overlapping garment. | All four `after/*-face-front.png` and three-quarter views; especially `player-face-front.png` and `sentinel-face-threequarter.png`. The collar-end gaps and extra separated strip are new compared with reopened acf0 player front; the partly buried pale trim was already reported at acf0. Full-body views also expose the disconnected front-trim arrangement. |
| **Major new regression versus acf0** | **The warden's black lower-face covering has large sawtooth edges and bulbous facial protrusions.** The upper cheek edge, ear-side boundary and underside break into large triangular teeth. The nasal area becomes a round black protrusion, and the mouth/nose relief merges into a dark solid mass. This visually overwhelms the improved face. | `after/warden-face-front.png`, `warden-face-threequarter.png`, `warden-face-profile.png`, visible even in `warden-full.png`. Reopened acf0 warden three-quarter had a smoother trapezoidal covering; the new edge is clearly worse. From images alone, this reviewer does not assign a code cause or assume whether the intended object is armor, a mask or facial hair. |
| **Major residual from acf0** | **Shoulders still read as mechanical caps and floating armor arcs.** The sleeve ends have a large flat circular fill with a smaller round disk at its center. The black shoulder plate forms a broad arch separated from the underlying cloth, with background visible under parts of the rim. | All four front/three-quarter face images and full/back views. `player-face-threequarter.png` and `warden-face-threequarter.png` make the circular surface and rim gap especially clear. Reopened acf0 images show the same construction; it is retained, not newly introduced. |
| **Residual, not newly introduced** | **The topknot contains a conspicuous pale triangular interior.** In profile and three-quarter views the dark loop-like hair form has pale/background-colored triangular pieces inside, giving the impression of an open shell rather than a dense tied bundle. | Player/sentinel/retainer profiles and three-quarter images; also partly visible behind the warden helmet. The same feature exists in reopened acf0 player profile. The initial early message was corrected: this is an old unresolved defect, not a new e188 regression. Its precise geometry/material cause is not established by the still image. |
| **P1 facial finish** | **Eyes are excessively dark within the openings, and hair/brow edges are coarse.** Pupil/iris and sclera separate weakly; little white or catchlight is visible, giving a black-slot appearance despite improved eyelids. The forehead/temple hairline and eyebrows have dense jagged edge steps. | Player, sentinel and retainer front/three-quarter; the warden's exposed eyes repeat the issue. This is a rendered appearance finding under this fixed lighting, not proof of missing eyeballs, a specific shader bug or absent eye textures. |
| **P1 art consistency / variety** | **The realistic head and simple costume now differ sharply in finish.** Sleeves remain broad near-cylinders, the breastplate consists of repeated horizontal bars, the belt has flat layered strips and a lumpy central knot, and the back is a mostly uniform slab of cloth with limited tailoring. The three exposed faces appear visually indistinguishable; costume color does most of the identification. | All full/back views and the three exposed front faces. The family resemblance and repeated costumes do not establish distinct characters comparable to the requested visual reference. No hidden asset identities are inferred from the image similarities. |

### Finite repair priorities

1. **Close and fit the neckline:** make the raised collar ends, upper chest and crossing pale trim read as one continuous layered garment from front, three-quarter and profile, without background triangles or stray strip/sliver shapes.
2. **Rebuild the warden covering's visible boundary and fit:** remove the large triangular edge teeth and black nasal bulb; keep a clear intentional material/form and attachment around cheeks, ears and jaw.
3. **Finish the existing shoulder and hair assembly:** bring the armor rim into a believable relation with the sleeve, remove the circular hub/cap impression, and close the exposed topknot interior. These are residual issues made more conspicuous by the better head.
4. **Refine eye and hair-edge rendering:** restore readable iris/sclera/light response and a finer hair/brow boundary in all three face views. Confirm that any change still reads at normal gameplay distance.

The first two are the clearest new regressions to address before presenting the character revision as finished. The new anatomical head is a visible and substantial improvement worth preserving. These neutral-stage figures still do not support a claim of completed PS4-reference-level visual finish: visible clothing and equipment assembly defects, eye/hair finish and repeated character appearance remain. The forthcoming ordinary gameplay images are needed to assess the character together with the surrounding world; this review does not anticipate their outcome.

### Inspected media and local SHA-256

`Displayed now` below distinguishes actual native display in this task from byte verification against previously inspected originals. Hashing a PNG is not a visual inspection.

| File relative to `.review/34978382509/figures/` | Displayed now | SHA-256 |
|---|---|---|
| `before/player-back.png` | yes | `7c537eefaea45f6939b6e969f36a69360277ce61b3fb81cef9f0b561f3d38bb5` |
| `before/player-face-front.png` | yes | `4d2fcb6d87c41a9ca8702f4ef0546ec61975d5e58dda954c8a6c65dd8e8dcdfa` |
| `before/player-face-profile.png` | yes | `9d8af2dfaa2482cbdb50a961c776e440751b80fb17a0c9315e72692e0d5d9b57` |
| `before/player-face-threequarter.png` | previously viewed; bytes reverified | `7ad205aff7afea6596d3c5e6af22e2e6f5b732edf91272caa35dc9b63cf4068a` |
| `before/player-full.png` | yes | `13b44c4dccbd5f9f19970f12abd5af279b6624b3f46c96b867e5890298f4fe96` |
| `before/retainer-back.png` | previously viewed; bytes reverified | `9ff6acb2809b682136964ad5ca5daaa5871daa37d3c35cbf034f155af537ca23` |
| `before/retainer-face-front.png` | previously viewed; bytes reverified | `ad0233888867c8f65ba230f4030ff4f352efcde1e13bbeea566d337177e9df45` |
| `before/retainer-face-profile.png` | previously viewed; bytes reverified | `3f6a9747e09c4b6eddc043a96e39b4ee89009d8befa34f04aaaa0918ddd7718a` |
| `before/retainer-face-threequarter.png` | previously viewed; bytes reverified | `ed4c95806590536b232af228c692dabe132bb767b7a8c9f38c25ea8b5a4d8697` |
| `before/retainer-full.png` | previously viewed; bytes reverified | `70a6e98f6992aec20bbf5e857e5b90359a790ca06842c2b2467af32026160f40` |
| `before/sentinel-back.png` | previously viewed; bytes reverified | `887fe1f2f21bc62ecca5c520992a4afc2558fb012496138f5540d157e9756da8` |
| `before/sentinel-face-front.png` | previously viewed; bytes reverified | `80271e34afa4c9b78a8b39fb9c6f4c73c80d38689731605d75e3706b70a73a0b` |
| `before/sentinel-face-profile.png` | previously viewed; bytes reverified | `70705106cdf157295a61c2ba6e3e1cfe85e40be01516e29f1d1001941d140ee9` |
| `before/sentinel-face-threequarter.png` | previously viewed; bytes reverified | `def38fcfb4f7c642d2bc29a0205551d2163959a449f984697f7734306c531a58` |
| `before/sentinel-full.png` | previously viewed; bytes reverified | `b23f9050faf55b947efc6fc5af63d169f85645077462048f9758f02aca35a0ee` |
| `before/warden-back.png` | previously viewed; bytes reverified | `f81d5ba9ffa5ac29efc1c18b7b4561bfac97b59ab1d77557536f04e2a645a937` |
| `before/warden-face-front.png` | yes | `a5b9ed8f1165d83eaff38f3dc26a09a583625b47bcc51973d9612b20452f89e0` |
| `before/warden-face-profile.png` | yes | `ddfdd7ce33b0e9f150e95df08431f1bfd2b10d2f750540c414796840c2735b30` |
| `before/warden-face-threequarter.png` | previously viewed; bytes reverified | `adee63c9fa3b266e3686913eb15f37015be76b923e1532e3daa7090e2ac08f6c` |
| `before/warden-full.png` | previously viewed; bytes reverified | `9bebfcb901ac4759ba1db95b5ef4dd7426cc9f1fa0df3e677daca02f0284e539` |
| `before/report.json` | metadata read | `c5a0a3a3e9e7e126be5045164afdfc6a87574151ce1f39f2b4f8b313e7e0f2b3` |
| `after/player-back.png` | yes | `6209ce0532b6573c27700b3177abc7aa570e5c20383bffa61e19a41bb052e471` |
| `after/player-face-front.png` | yes | `c73003f27c1507394be4fb20f68cc2920e90764d5eec725b0fa921111b3b7fc6` |
| `after/player-face-profile.png` | yes | `a9cc0a3a3854e33dad7f14d5626348f02dfd255217805b5631cd20babc63750c` |
| `after/player-face-threequarter.png` | yes | `31ca9d0bc6ee28184d1a4d0e2f9f40c548dcf3393e88929b65db3cb660a85906` |
| `after/player-full.png` | yes | `12b366cab3811bc89587f8733115f49e35280aa2df5d958b08fe76cd176b37fb` |
| `after/retainer-back.png` | yes | `7e20b13ad7747869b82593197e7d8c10d60c8140075c57ac996adfab1c130cce` |
| `after/retainer-face-front.png` | yes | `73df45ddd00b8343c2b04f925bc8500abdd26f0be0f3b543c82c990bcee1b168` |
| `after/retainer-face-profile.png` | yes | `3e02c303c1b4ee52036982b032c1e7b557d1969b0562dc8b8b95a650f6a2cf30` |
| `after/retainer-face-threequarter.png` | yes | `df4c94c505af1c340b9ab56a1c83c0e3232c9d447bb891c1baaa35fd8730b0d7` |
| `after/retainer-full.png` | yes | `d8cd2173b599f3dfbeec265fe97a8340d4d9272cd2fe4b418fa194095cd2ca98` |
| `after/sentinel-back.png` | yes | `e58bee168fea7745a9e0325fb7c6704c6cd3002584dae4d39267fb27f6e56f88` |
| `after/sentinel-face-front.png` | yes | `e5b7ef2580ff647fa02af2ea6cdbfcaa901142306cb14ca4165d54b772ce2e08` |
| `after/sentinel-face-profile.png` | yes | `af7dc3bf5ee009c26da262470ddde2214d1b99ecfa120b7b379cae21010cb8ee` |
| `after/sentinel-face-threequarter.png` | yes | `14379654e547e6e71df3059170c0088f1f2bd5cab76fd1e3b8a891deec588a7c` |
| `after/sentinel-full.png` | yes | `8120b860fad0c1a4e9008349548b2dbbdad76dcb5c2851103eac9703a393b457` |
| `after/warden-back.png` | yes | `4b19434b4de8191f4174a0f97c95da64f009af7d4adc0887fe17472fc138f098` |
| `after/warden-face-front.png` | yes | `d46a0fd667d6e0cc115ca623826466ee88a0a19fa17f1b7473ba035dcaf207ac` |
| `after/warden-face-profile.png` | yes | `9e2ffcdd6f7cbc46a02a8a511d2b22df2a6d314040a0e1ae00656b1623232545` |
| `after/warden-face-threequarter.png` | yes | `fa81cbebbfc458ded3bf49b052c42748820566d5a7397d4fb4b4a817896e4233` |
| `after/warden-full.png` | yes | `00a94c856d88f3c9357c9bde5853662ca8b99be74510d264e4b2ed98a65ed94b` |
| `after/report.json` | metadata read | `f655a5c6773322d303a29509da04f1a0fadc5644d3ea68cf878f75a4acc763d3` |

Additional acf0 originals reopened from `.review/34971788118/figures/after/`:

| File | SHA-256 |
|---|---|
| `warden-face-threequarter.png` | `70990b8586ec3ce8285bb91c20fff044c55bf31bb1c641410cf337f798894a1e` |
| `player-face-front.png` | `4622bd57cb36b15dda0c509c058153a1ce4a3ef84196e609630ad267fc0ca433` |
| `player-face-profile.png` | `2bad329e57b8ccbef0e637bb372a8f6f4aa735b8a16e148a901519e2c2b5f4a4` |
| `player-full.png` | `7c1777347a3527465382510ed1173ce31c7f009b45bbb53a2bb72343b2a19ca9` |

Change scope: this owned evidence section only; no runtime or other author document edited. Native figure review appended at: 2026-09-15T14:12:14.668371+00:00


## Independent ordinary-screen / finite video-frame review — e188201

### Receipt, actual display and failure boundaries

- Received the same runtime **e18820165d6008fedfca28d2cc7073a9c4b74b28**, CI **34978382509**, ordinary-media directory `.review/34978382509/fresh/`. No author visual ratings were supplied. The future closed-hakama repair f869 is **not present in this evidence** and receives no credit in this review.
- Personally opened all four supplied original PNGs at original detail: **title.png, encounter.png and desktop-right-victory.png at 1280×720; mobile.png at 844×390**. Reopened the four same-named acf0 PNGs from `.review/34971788118/fresh/` for direct comparison of corresponding situations. These are source-known, non-pixel-matched scene comparisons: the situations correspond, but actor timing/camera/scene content are not certified identical.
- Supplied video: `derived/desktop-right-fork-to-signal.mp4`, SHA-256 **84a156620c857b1d7fe8a501a5318fb026558df8067b43023d18cfd06201c734**, locally verified equal to the received hash. H.264, **960×540, 25 encoded fps, 133.52 s, 3,338 frames**, video stream only.
- Ran ffmpeg through the **entire video stream** to a null sink with error reporting; exit 0, no decode errors. A complete frame-hash decode also emitted 3,338 frames. This proves decoding of the supplied stream, not full continuous perceptual playback.
- Personally displayed **15 selected, unscaled decoded PNG frames at original detail**, at relative clip times **0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130 and 133.48 seconds**, corresponding to frame indices **0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000, 3250 and 3337**. This is finite chronological image sampling, not a claim to have visually watched every frame or judged continuous motion smoothness. Temporary decoded inspection files were made outside the repository; the repository edit is this owned record only.
- An initial sampling-filter command failed because its commas were incorrectly quoted; it emitted no sample images. The corrected argument-list invocation succeeded. The original full-decode verification was a separate successful command. This was a local extraction-command error, not a source-media defect.
- Read provenance/failure metadata from the build fingerprint and browser/route/recording reports. The fingerprint gives fresh tree **fba4359ccf034502acc04eff43201fe065cc79ba**. Browser and route reports identify Chromium/SwiftShader and explicitly say this is not physical-device performance. All three browser/route/recording reports have **result: failed**; empty error arrays and saved recording filenames do not turn them into passes.
- The integrator reports **211 tests succeeded**, followed by ordinary-route failures and some cancelled work, with severe slowdown making e188 unsuitable for publication. This reviewer did not rerun that suite. The integrator reports only the **PC-right mission** complete in this run; PC-left and touch-left/right completion remain unavailable. None of the visual improvements below supersedes those failed/incomplete checks.
- No audio was heard or evaluated; the supplied MP4 has no audio stream. No physical phone, live input, complete route matrix, control latency, frame-rate acceptance or source-blind reference assessment was performed. Formal ten-element comparison status remains **not measured**.

### Coverage mismatch in the supplied derived video

The file is named `fork-to-signal`, but its last decoded frame (**3337 / 133.48 s**) shows the two characters by the shrine with the enemy kneeling and a visible decisive-hit label. It does **not** show the lantern turning on or the victory screen. The t=130 s sample is also in this final duel/defeat sequence. Therefore the filename is not evidence of continuous coverage through signaling. The separate supplied `desktop-right-victory.png` visibly shows a lit lantern and result overlay, and the reported PC-right mission completion remains a separate source of evidence. This is a coverage limit of the reviewed derived clip, not a claim that the full source PC-right mission failed. It was promptly reported to the integrator so future clip selection can be checked by actual ending frames.

The encoded 25 fps rate also does not establish a responsive 25 fps game. A diagnostic exact-pixel hash pass found 3,312 distinct hashes and 24 adjacent identical pairs, with a longest identical run of three encoded frames (0.12 s); codec variation and other pixel changes make this unsuitable for counting actual rendered gameplay updates. No smoothness or slowdown conclusion is derived from that hash statistic. The reported CI slowdown remains unresolved regardless.

### Improvements actually visible in the integrated screen

1. **The shrine now reads as a constructed building.** In new `encounter.png`, roof tiles and the eave line are visible. New `desktop-right-victory.png` shows lattice doors, upper wall panels, projecting eave brackets/beams and a stone-colored base course. The corresponding acf0 result view was dominated by a flat wall and repeated bare vertical posts. This is a clear improvement in depth and recognizable construction. Video samples at t=20–110 s show those forms from changing approach and elevated viewpoints, so the improvement is not confined to one still.
2. **The paving has more distinct stone form and surface.** New title/encounter/mobile views show irregular edges, small height/thickness cues and varied surface shading, replacing much of the old uniformly flat rectangular-strip appearance. The pale paving separates the playable route clearly from the soil. The route remains readable toward the torii, around the obstacle, and toward the shrine. These are visible strengths; the repeated patch layout and abrupt ground meeting still need work below.
3. **The central obstacle has a more coherent large silhouette.** The old encounter image showed many similar rounded lumps arranged on a rectangular support. The new image/video shows a connected outcrop-like mass. That is a local improvement, although the very large planar facets and straight lower boundary remain a strong defect.
4. **The closer anatomical face survives ordinary scene placement, with limited screen impact.** The opponent's face in the 1280×720 encounter view is more recognizably human, and the player's scalp/topknot silhouette is visible from behind. Clothing curvature and the blue/brown actor separation remain readable. Most normal views show small rear-facing characters, so the close-up facial improvement affects much less screen area than the world. These normal images do not close the previously reported collar/face-covering defects merely because those features become small.
5. **Some excessive ground-grain contrast is reduced.** Against the reopened acf0 title/encounter images, the new brown surface has less conspicuous fine noisy grain. That reduces one synthetic cue but leaves large areas too uniform. The existing warm lantern and legible result typography remain compositional strengths; they are not all newly introduced by this revision.

### Largest remaining defects and visible regression

| Priority | Direct observation | Evidence / precise scope |
|---|---|---|
| **P0 for the requested integrated visual target; visible regression in foliage mass** | **Bamboo now reads mainly as thin bare poles.** The earlier large leaf sprays were artificial but supplied visible clusters. In the new title, mobile and encounter images those clusters are largely absent at ordinary distance; most stems end in almost invisible lines or tiny specks. A pale branching tree behind the shrine also reads as bare branches. Small individual leaf shape cannot be judged in these views. The scene has lost foliage volume and layering rather than achieving a convincing forest. | Direct new/old PNG comparison, plus video t=0–60 and t=120–133.48 s. This establishes screen appearance, not that leaf geometry failed to exist or failed to render. CPU-valid real-size leaves do not by themselves supply adequate visible canopy density. |
| **P0/P1** | **Large bare ground areas and repeated upright grass dominate.** Soil covers most hillsides and much of the foreground with little convincing leaf litter, roots, low vegetation, pebble variation or gradual transition into paths. Thin yellow-green blades recur at similar scale and spacing over broad areas, resembling scattered repeated marks. Long dark shadows stripe the same open surface. | All ordinary PNGs and the entire span of sampled video views. The architecture improvement occupies a smaller part of the overall screen than these unresolved surfaces. Grass is visibly present; this is not a claim of a missing grass system. |
| **P1** | **The connected rock still looks like a very coarse polygon mass.** Huge flat faces meet along straight diagonals, broad repeated peaks run along the ridge, and the lower silhouette is nearly a straight horizontal cut against the soil. It is now one coherent form but still resembles an unfinished terrain/obstacle mesh. | New encounter and video t=0, 20, 30, 40, 70–100, 120 s. At t=70–100 the elevated camera gives much of the foreground to this simple mass. No collision/route-footprint change is requested by this observation. |
| **P1** | **Repeated props and paving are still visibly assembled.** Stone lanterns repeat simple cap/post/base solids; red banners are broad uniform rectangles; many paving blocks recur in similarly sized separated rectangular patches, with abrupt dark gaps and weak soil blending. Pale yellow rectangular pieces remain conspicuous near the destination. | New mobile/encounter/result and video t=20–133.48. Improved stone edges do not by themselves make the overall paving arrangement or terrain contact natural. The origin of the pale destination pieces is not inferred from their appearance. |
| **P1** | **Material and light integration remain limited.** The shrine has better geometry, but broad timber/roof surfaces repeat similar tones and patterns; lower walls and ground become very dark. Foreground soil, bright stones and simple grass lack a convincing shared weathering/contact treatment. | Especially new result and video t=70–133.48. This is a visual residual, not a diagnosis of a particular light/shader defect. Existing foreground transparency in some frames is not treated as proof that the new foliage was removed. |
| **P1 character residual** | **The improved head still sits in a simpler costume silhouette.** Shoulder caps/armor rings and a largely uniform blue back remain visible. In raised-leg/running samples, the lower garment separates into strip-like panels around the legs. The ordinary frames do not establish a continuous, repaired hakama shell. | New encounter/mobile and selected video t=10, 20, 30, 60, 110, 120 s. These are selected poses only; no tear-free animation or completed clothing repair is claimed. The later f869 closed-hakama work is explicitly excluded. |
| **Composition residual** | **The ending remains dominated by one dark wall, and the overview emphasizes empty ground and the coarse obstacle.** The richer shrine wall is better than the old panel, yet the result gradient obscures much of the remaining world. Elevated route views are readable but expose how little natural variation surrounds the path. | `desktop-right-victory.png`, video t=70–110 s. This is an assessment of the visible composition, not a request to weaken the route's readability or input behavior. |

### What the selected video frames do and do not establish

Across the selected timestamps, characters occupy different positions and poses, the camera moves from the front approach to the right of the obstacle and then to an elevated view, and nearer banners sometimes become translucent. These frames establish that the improved architecture and the identified world defects recur across multiple views. They do not establish contact correctness, smooth gait, timely camera transitions, natural cloth motion, or a responsive game.

Leaves are too small and sparse at this capture scale to distinguish trunk-versus-leaf phase, frequency or attachment quality from these finite normal-camera frames. The prior CPU hierarchy checks and earlier plant-study footage cannot replace a perceptual review of this exact revised foliage. No claim of natural wind behavior, stable whole-canopy attachment or successful ordinary-distance leaf animation is made here.

### Finite next priorities and result

1. **Treat the failed/slow ordinary runtime as a blocking integration issue.** Restore the required PC/touch route coverage and responsive execution before considering e188 publishable. The local art gains are not a substitute for those checks.
2. **Restore visible foliage mass within the performance budget.** Evaluate species-appropriate branch/leaf grouping, placement, canopy layering and distant readability in the actual approach/mobile/encounter views. Merely validating centimeter-sized isolated leaves is insufficient, and blindly multiplying expensive geometry is not a supported resolution of the present slowdown.
3. **Improve the dominant world surfaces and forms.** Give the rock's sides/base a convincing irregular form and terrain contact, and give soil/path edges visible natural transitions and varied low-scale set dressing. Retain the now clearer shrine construction and route composition.
4. **Complete the finite character repairs already identified:** collar/torso connection, warden covering boundary, shoulder/topknot assembly and the separately pending closed-hakama work, then verify the same normal and action views at the repaired runtime. Do not count unseen later code as closed defects.

**Result:** e188 has real local improvements in anatomy, shrine construction and paving. The ordinary images still do not support the requested PS4-reference-level integrated appearance, and visible foliage mass has worsened. The runtime is additionally blocked by the supplied failed/incomplete CI and slowdown status. This is a source-known diagnosis, not a scored anonymous benchmark; formal quality elements, continuous-motion naturalness, audio and physical-device performance remain unmeasured.

### Original and metadata hashes

| File relative to current `.review/34978382509/fresh/` | SHA-256 |
|---|---|
| `title.png` | `15443ae3bdf920901b120ae40963a8a999141ef87846cd6175eeafc5468768d1` |
| `encounter.png` | `f088783855e43eec3c973e32a4696bbf2db4da6382d9acff2409d8e44876a402` |
| `mobile.png` | `6c27c11e73de9e4efac12eed7aaafc65cf084d6e5eb21720a83cff6068fbc5d6` |
| `desktop-right-victory.png` | `d33b51c93cb9143a9bb92f201eb120d7fb35dc94651de3514a31025180f7c215` |
| `derived/desktop-right-fork-to-signal.mp4` | `84a156620c857b1d7fe8a501a5318fb026558df8067b43023d18cfd06201c734` |
| `build-fingerprint.json` | `39b83d3123b38bd2b1b436a66d1c56ea90ea99e81913f16ddc1f30227cf585d4` |
| `browser-report.json` | `ff30aee28f8e4720626c7fd5e0a8fbec633088e833293128cf8ccf1625fbf55f` |
| `route-matrix-report.json` | `708a28005892b969d33793bfd09cf139e1c7092178f0eaeeb9e9fa53f87dd91a` |
| `recording-report.json` | `096f4d9298243b14f3df53599dda650080fb48ba4e638e54817090e80885e8e0` |
| `derived/desktop-right-fixed-five.json` | `5ec27d19518b7e610e35579cfc39d32acc425afb00cc271dc0f17f47bb0210db` |

Reopened acf0 originals from `.review/34971788118/fresh/`:

| File | SHA-256 |
|---|---|
| `title.png` | `5e5edaf1a46ab467bf4782a7240a02df0b2ec5a3b1c31d55a34f1c8da02d5aaa` |
| `encounter.png` | `761615c5f4126c0845a3dd37d4e8e45c6bacaa7bef7f75578aa801bbdba5d23d` |
| `mobile.png` | `0b90edc6192c0ec980a3892df9c2d2b05ad51c48cb3c97ebee8c5fb15be7b66a` |
| `desktop-right-victory.png` | `6ec7477a2fc23caaed6a7df71e2f8c55c03d15f2df18991745c4e01ca4561e75` |

Displayed decoded samples of the exact current MP4 (PNG hashes refer to the lossless decoded inspection files):

| Source frame | Relative seconds | PNG SHA-256 |
|---|---|---|
| 0 | 0 | `77dea9f5ef3a1698016916c733ca933eaba6d1dabc4fbcb13f3a7f9e044922b0` |
| 250 | 10 | `8a5b243877b1c87122a5897b11cbc3fa7b99c93089b5df9c0a7c69b58d5792b9` |
| 500 | 20 | `fd6a40ff9460de36e0cf9cada505590791924638b4ad06064ac4d10550c64a83` |
| 750 | 30 | `549bacc2285af7a39f89faa05734fea6d64d716c8c392beb8492a212e0994575` |
| 1000 | 40 | `032e23698e71c0f849c291aa24e4844fb581abff134496902130bdd1ca2049d9` |
| 1250 | 50 | `657c8ef41e635b830af0bddd54f8342b65783f9747b9cd394c0f862082b88c52` |
| 1500 | 60 | `730fb0e04a90d33ae09637d70b31b6f888323c74fadd73dbd1ad5480381469c9` |
| 1750 | 70 | `a48edb31cc84fc4e732ca0c2820a3593719542b22f5d67d539529837fb165121` |
| 2000 | 80 | `ec9f3950b1ae46f91da13705eb1e9c1ba417b4b32f177ed110eaf469e3962d3c` |
| 2250 | 90 | `6728592fd3d8810149b6e44f3b4943aa5033df529cf5c16108d3d1e99cfafb69` |
| 2500 | 100 | `dd40ccca0d05a33851baedf844f651007c91ed5cdf4dfc9ae5953de46355a343` |
| 2750 | 110 | `9509d6d8baf6c44020106cb7fbb879d115c89938cc13f0f324e768e6f11aeee3` |
| 3000 | 120 | `739ccb6b27a2ee17c91d0f43e1d5ef882819e32a05d9d71bed49a7b5fdb8465b` |
| 3250 | 130 | `64cd71994c84aca16ac09dbd885ef9b9ee4be66d1af5a965117b5ab556fadbbf` |
| 3337 | 133.48 | `4a009905426c70c1d455f4c4f74d31128599e13f5e5581184c1614bc95b046ba` |

Repository change scope: this owned evidence file only. No runtime, other author evidence, stage, commit, remote or automation changes. Ordinary e188 review appended at: 2026-09-15T14:26:30.326046+00:00


## Recovered original-recording tail: visible signal and ending — e188201

### Receipt and inspection scope

- Received authorized recovery CI **34982421501**, referring to existing source CI **34978382509**, runtime **e18820165d6008fedfca28d2cc7073a9c4b74b28**. This is additional material from the already-recorded game, **not a new runtime render, character repair or performance repair**.
- Reported original source is `desktop-right-continuous.webm`, duration **196.72 s**, SHA-256 **9086ff0cf575ad72a9485427478e4ba00f213f2a88f2d5e8bb28af60549c2596**. The integrator/CI reports original full decoding and recovery ZIP/SHA/CRC verification successful. This reviewer did not independently fetch or fully decode that absent original WebM in this task; the locally supplied recovered PNGs and tail were inspected.
- Local received files: `.review/34982421501/raw-tail/report.json`, `raw-184.png`, `raw-188.png`, `raw-192.png`, `raw-196.png`, and `tail.mp4`. All four original decoded PNGs were personally displayed at original 1280×720 detail. SHA-256 of each supplied file was computed locally.
- Tail metadata: H.264 **1280×720, 25 encoded fps, 24.00 seconds, 600 frames**, video stream only. The report identifies its source start as raw time **172.72 s**. Independently ran ffmpeg over the **entire supplied tail** to a null sink: exit 0, no decode errors.
- Personally displayed eight additional unscaled decoded tail frames at relative times **0, 8, 16, 20, 21, 22, 23, 23.96 s**, indices **0, 200, 400, 500, 525, 550, 575, 599**. These are finite native image samples, not continuous perceptual playback of all 600 frames. Temporary decoded files were created outside the repository; only this owned evidence record was edited in the repository.

### What is actually visible

| Supplied original / selected tail time | Direct observation |
|---|---|
| `raw-184.png` | Player stands at the shrine; the hanging lamp is dark. The top-left instruction asks for the signal action. No ending overlay is visible. |
| `raw-188.png`, `raw-192.png` | The same dark lamp and signal-action instruction remain. The player and defeated enemy are visible. These images do not show completed visible signaling despite being later than the reported state-event timestamp. |
| `raw-196.png` | The hanging lamp emits a clearly visible warm yellow light; nearby timber/lattice receives a warm glow. The large ending overlay and restart button are simultaneously visible. This is direct visible completion in the original recording's later frames. |
| Tail t=0, 8, 16 s | Final encounter/defeat, approach and then the dark-lamp signal-action state appear in sequence across these samples. |
| Tail t=20, 21, 22, 23, 23.96 s | The ending overlay is visible in all five selected samples. Warm illumination is visible on the hanging lamp, with intensity differing between the selected frames; t=20, 22, 23 and the last frame show it especially clearly. The last supplied tail frame therefore includes both the lit destination lamp and the ending screen. |

The first ending image among these chosen tail samples is **relative t=20 s**. Adding the reported cut start gives a nominal raw position of **about 192.72 s**. That mapping is source/tail metadata, not an independently measured first visible-transition timestamp. `raw-192.png` remains dark, while the t=20 tail sample already shows light and ending; no exact first changed frame is claimed. The originally reported signal telemetry offset **176.548 s is not treated as a visible-completion time**, nor is a precise display/input latency inferred from subtracting those timestamps.

### Updated coverage conclusion, without changing prior quality status

The missing evidence is now supplied: **the existing e188 PC-right original recording does contain visible destination illumination and an ending screen in its later tail**. This adds firsthand visible support beyond the earlier standalone victory PNG and event metadata.

The previous **133.52 s / 3,338-frame derived `desktop-right-fork-to-signal.mp4`** still ends in the final decisive-hit scene and still omits the later visible light/ending. Its original coverage judgment remains correct; the recovered tail supplements it rather than retroactively adding frames to that short file. No new gameplay execution occurred in the recovery.

This confirmation does not establish the complete unseen PC-left or touch routes, does not repair e188's failed/incomplete CI or slowdown, and does not apply any later character/clothing/performance change. The previously identified ordinary-world, foliage and character defects remain. The overall visual target is still unmet; formal ten-element/source-blind quality, natural motion, audio, response latency and physical-device performance remain **not measured**. Only the finite visible-ending coverage gap described above is closed for this recovered PC-right original.

### Supplied-file hashes

| Relative file under `.review/34982421501/raw-tail/` | SHA-256 |
|---|---|
| `report.json` | `b57226e83dfa04fc1d09ff806c0c363f185bff32a423783bf5dfab71bdafbad4` |
| `raw-184.png` | `7fdb0972ebec401a350e4a4df183efacdc3755504c63f8f221f5fc6b827f5887` |
| `raw-188.png` | `3f3dec663aa33539baec509031add2d8c9ca215c90b5cb3c33e1565612bc6d8d` |
| `raw-192.png` | `10f47781cce0a6d4a0c664246194dbe7a015b86960c64bd4eca6dac6fa55e539` |
| `raw-196.png` | `0e219da483f8e5f5df9b3415ae4a116710d40126e596fcbeb5c2912ec393799f` |
| `tail.mp4` | `9935c6464a4dd487b8e16f1dc8e6b919835c56486bdeb9b172b5cd33cc81fb39` |

Additional tail frames personally displayed:

| Tail frame | Relative seconds | Decoded PNG SHA-256 |
|---|---|---|
| 0 | 0 | `73dc6c572fe940e97b53913bde588e984f916e009534a78d7a17d715f43f1d92` |
| 200 | 8 | `5c16fcc469635003adb3879860d0dc4ba273e8d6bdb4daa85d9cd8d712871287` |
| 400 | 16 | `fb326521c9d4cb011c86f0743ef48cfdbbbacce9431005e74cb0028f49a6893d` |
| 500 | 20 | `70feee3d42402f9a765d672f57cd5a6cf34754db392f8f141d8963ab2eaf8b74` |
| 525 | 21 | `08fcbb4ca3c8ac1a7fe83b067e0cd9f0f79ce94c4ae597e9244ce69949315f7c` |
| 550 | 22 | `9d5731a55aeb2774cd69f6425e405def4871685d8cc07f067a6e82a02e87143a` |
| 575 | 23 | `094f0f736529edb558a426dd5e430e5b0187d78f4f41c58185f8c4e29ca468c0` |
| 599 | 23.96 | `478a16d9b83da4b8e8e056d319d1486b5b8112e3cb1d9cec994242594e1fb323` |

Repository change scope: this owned evidence file only; no runtime/other author edits, staging, commit, remote or automation actions. Recovered-tail review appended at: 2026-09-15T14:41:07.885566+00:00


## Independent foliage LOD geometry/atlas review — 1dd29a7, with alpha repair 26a7b47

### Receipt, provenance and limits

- Finite independent reviewer task received for isolated `game2-foliage-pilot`, frozen **1dd29a763a6521e0aadb52a8d5d8fba1df471b4e**, parent **374e9b1e907a4aefbe965a320d6c4847d4b363a6**. The integrator identified canonical diagnostic HEAD e426 and runtime origin e188; this review does not silently evaluate later combined character/runtime changes.
- Read actual `fresh/bamboo-frond.js`, `foliage-lod.js`, `foreground-visibility.js`, relevant presentation/inspection/leaf-surface diffs, LOD tests, author `20260915-foliage-lod.md` and counts, and installed Three shader chunks. Author-reported 51 passing tests are receipt information, not this reviewer's independent test evidence.
- Personally displayed `.foliage-check/atlas.png` at original **512×512**, then an independently generated alpha-channel data visualization at original size. The PNG contains three narrow, pointed, feather-like frond silhouettes with internal leaf gaps and an opaque fourth tile. It is a CPU-generated atlas, **not a game/WebGL render**. No native game image for 1dd or 26a7 was supplied or viewed here.
- Atlas PNG SHA-256: `c02acf5a39e19d56762612b33e73a344a1ffd133d25b489c4096f2954b79c5cd`. Actual independently generated raw RGBA bytes match `.foliage-check/atlas.rgba`: `126038f7144af047a3a1b247ae0a5a0146c79d75e3f9d575375ad2643bc13b7e` (1,048,576 bytes). Outside-repository temporary `independent-foliage-lod/atlas-alpha.png` SHA-256: `3ea53e6788566ccde9fb165a9ee70fc81b0af3252553fef41e2b7b69cf6c104e`.
- This is known-source technical/appearance diagnosis. It is not an anonymous reference comparison. Formal ten elements, PS4-equivalent visual quality, GPU time, shader compilation, native LOD transition appearance and natural motion remain **not measured**. Earlier e188 ordinary-screen bare bamboo remains the measured motivation, not proof that this new candidate repairs it.

### Independent geometry, attachment and CPU-ray results

| Check actually performed | Result and scope |
|---|---|
| All detailed leaf roots to actual support line / attachment segments | **36,288 leaves** (32,400 bamboo, 3,888 maple); maximum distance **0.000002705342270525232 m**. No detached root was found by this finite geometric measure. |
| Frond tile assignment and triangle types | **900** fronds, **300** per tile 0/1/2; no mixed-kind triangle, no near/far woody-index mismatch. 36 bamboo and 3 maple LOD meshes; their actual world matrices are identity. |
| Independently deformed triangles and bilinear base-alpha reference vs optimized CPU ray | **612 queries**, 3 atlas variants, near/far representations, times **0, 1.37, 6.83 s**; **180 positive**, **432 negative**, including **126 geometric-card-hit holes**; **0 mismatches**. The alpha reference was separately written, not the production `foliageAlphaAt`/`foliageHitIsOpaque` helper. This checks selected rays, not every possible ray or GPU mip filtering. |
| Support hierarchy/rest/physical parameter preservation against 374 | **2,317 supports**, equal stable-field hash `e4e7b304825e97421edad8b81ef743cbc0b7af1f966070c436ae24039544a01b`. Actual 374 presentation was instantiated using common current dependencies for construction; this is a stable geometry/hierarchy check, not a full old-runtime rendering or performance run. |
| Grass preservation | **3,000 instances**, equal hash `70733f5d139fb4d7f2a898540bcd3e16a2e6dd1bbc08efc4951cbed3507c81c1`. Relevant source diff against 374 was empty for wind, vegetation physics, grass shape, terrain, route layout and simulation modules. |
| Independent 20 s / 60 Hz physics integration | Root drift **0**; side-chord samples every 0.5 s had maximum strain **0.0016684072374864023** (0.1668407%, below existing 0.2% bound). Final maximum tip offsets by kind: wood 0.0008008541 m, woodBranch 0.0058519798 m, bamboo 0.0529916374 m, bambooBranch 0.0112589852 m, twig 0.0171942805 m. These numeric distinctions do not establish perceived naturalness. |
| Actual transformed lamina area vs load approximation | Detailed bamboo triangle area sum **61.53968031838697 m²**; added mass sum **3.1595769577481696 kg**. Authored newArea / independently measured per-instance transformed area ratio **0.9895544463–1.165917428**. The maximum-axis scaling is an approximation, up to about 16.6% high, not exact transformed-area measurement. |

Near bamboo now has 36 small leaves per twig / 216 per tree, connected through existing short side shoots. Those shoots remain in their twig's transported support field; they do not add independent oscillators. Far fronds come from the same near triangles projected into a mean plane, with the same support and placement. They deliberately omit individual far-leaf hinge/curl motion and depth; source identity does not mean identical shading or motion. At the first actual instance for each tile, maximum near-vertex distance to the frond plane was **0.0381002 / 0.0420723 / 0.0403862 m**. The maple far index retains major lobes but simplifies minor edge vertices. Both selected geometry and CPU ray indices follow the active representation; no restored shared trunk/leaf sine was found. `forceSinglePass` applies to the foliage materials, including the bamboo material's thin woody twig members; it is not a global opaque-wood setting.

Bamboo thresholds remain 6/8 projected individual-leaf pixels and 0.11/0.07 facing hysteresis; maple uses 7/10 pixels. Rest-bound/rest-normal selection and the deliberately collapsed frond plane leave motion, grazing-angle and shading transitions for native inspection. Existing 1.4 m outer bounds, the inner leaf guard, route/root/grass data and full modal support model are retained within the inspected source/numerical scope.

### Major alpha/fade defect found in 1dd, then separately repaired

**1dd major:** Three physical shading begins with opacity in `diffuseColor.a`; its map chunk multiplies that by sampled texture alpha; the old conditional alpha-test then tested this product. Foreground target opacity is 0.08 but alpha-test threshold is 0.4. Thus an otherwise opaque frond pixel is discarded whenever fade opacity drops below 0.4, while CPU base-mask rays continue to report it opaque. Existing fade integration at 60 Hz yields opacity **0.717597, 0.521881, 0.386241** on the first three updates: all frond pixels therefore disappear at the third update instead of retaining the intended translucent coverage. This source/numeric defect was sent immediately to integrator and vegetation author.

Received frozen repair **26a7b47cda779980a968ceb3a48a1ae44e8a8b49**, directly after 1dd. Reviewed its complete three-file diff: `bamboo-frond.js`, new `frond-fade.test.mjs`, and author evidence. It changes the shader hook and cache version, not geometry, atlas generation, physics, routes or LOD thresholds. The author-reported 14 tests/build success is separate from the independent checks below.

**Independent repair verification:** Instantiated the actual scene headlessly; applied actual visible and depth hooks to installed Three physical/depth shader sources; recursively expanded include chunks. Independently executed their selected alpha operations in source order, with the actual three-component vertex-color condition, across **14,672 scalar cases**:

- Physical and depth material; map enabled and absent; wood/detailed-leaf vs cutout-frond kind.
- Every 8-bit alpha value plus exact 0.4, adjacent floating-point values, 0 and 1.
- Entry opacity **0, 0.08, 0.2, 0.399999, 0.4, 0.5, 1**.

All matched the independent expected contract: discard is based only on the frond mask below 0.4; surviving output alpha retains entry opacity; wood is not discarded by the atlas mask. Both real material hooks have cache key `valley-wind-v3-modal-vegetation-frond-cutout-v2`; visible/depth/CPU share the map. There is exactly one existing map texture sample in each expanded shader. `alphaMap` is null, `alphaToCoverage` and `premultipliedAlpha` are false. **10,609** independently checked base-texel centers across all four atlas tiles matched CPU acceptance. Full base accepted counts were **10,865 / 10,815 / 10,667 / 65,536**. Atlas byte hash remained unchanged. Source hash at completion matched frozen 26a7.

An initial reviewer-only subset harness stopped because its preprocessor did not yet handle Three's `#if defined` vertex-color branch; it produced no pass claim. The corrected independent harness handles that branch and completed with exit 0. No product file was edited to obtain these results.

**Closure:** the reported opacity-product defect is closed at the reviewed **source/alpha-numeric** level for 26a7. This is not GLSL compilation, GPU rasterization, physical-device performance or native visual closure. Later mip work is not included in this closure.

### Remaining measured atlas differences and finite priorities

1. **Medium: mip RGB brightening, potentially ordinary-distance relevant.** Base accepted-frond pixels have mean linear luminance (byte units, 0.2126R + 0.7152G + 0.0722B) **50.9835 / 50.8113 / 50.7479**. At global 64×64 mip these become **63.7297 / 63.2499 / 62.2871**, about **23–25%** higher; global 32×32 gives **71.5349 / 71.0872 / 69.2836**, about **36–40%** higher. Transparent RGB gutter `[92,111,60]` mixes into downsampled leaf color. The measurement uses each mip's accepted pixels, so it is a stored-field discrepancy, not a measured on-screen luminance delta. With a 246-texel tile span, approximately front-facing/isotropic projection would select these scales for frond quads of roughly **31 / 15 pixels**; LOD-transition or ordinary distant foliage can plausibly reach them. Exact world distances and GPU derivative/mip selection were not measured.
2. **Medium distant-loss risk: smallest mip removes frond coverage.** Global 4×4 and 2×2 have no pixels at alpha ≥ 0.4 in any of the three frond tiles; the final global 1×1 pixel alpha is **98/255**, also below threshold. Front-facing isotropic scale is roughly a **2-pixel** frond dimension or smaller; grazing minification may reach the relevant derivative sooner. The new opacity separation does not fix this base-mask disappearance. Native visibility/severity and exact onset remain unmeasured. The integrator requested a separate finite mip repair after receipt of these measurements.
3. **Low: raster union undercoverage.** Independently OR-ed four subpixel coverage bits per actual projected near triangle, instead of the implementation's per-triangle maximum. Expected covered pixels **10,929 / 10,880 / 10,725**; actual atlas misses **65 / 66 / 58** and has **1 / 1 / 0** extras (the tiny extras can be Float32 projection rounding). Misses are about **0.6%**, including **3 / 7 / 3** pixels whose independent four-sample union is fully covered. This remains an explicit silhouette approximation; it is not treated as a standalone pre-CI blocker in this finite review.
4. **Native verification still required:** canopy volume at ordinary game distance; near/far color and silhouette transition; rigid frond vs detailed-leaf movement; potential aliasing; CPU base-mask vs filtered GPU mip boundaries; continued actual performance. Source and CPU atlas alone do not establish that the previously sparse canopy looks natural or reaches the PS4 target.

For transparency, the longer geometry/ray/physics process imported the original 1dd module before the author edited the shader hook. Its start hash was the original `04d45...`; the end file hash was repaired `debb20...`. The full frozen diff confirms only the hook changed in that source, and the other checked geometry/LOD/CPU source hashes were unchanged. Those results therefore remain scoped to the loaded 1dd geometry/physics. The separate repair run above started and ended with the frozen 26a7 source hash and unchanged atlas bytes.

### Frozen inspected source hashes

| Frozen source | SHA-256 |
|---|---|
| 1dd `fresh/bamboo-frond.js` | `04d45b5e2a69aa556b5f2afdbcfefc8371edfcf04706bfd1394220be47057c6b` |
| 26a7 `fresh/bamboo-frond.js` | `debb20ec16840f10df67fa9017210fed9bc39ae7dc38371056e7748b87b3bf29` |
| Both `fresh/foliage-lod.js` | `7b20c8cacbe1113cd6c7048c628f4a970ff16bc349b0d7579ee629a9af43d76c` |
| Both `fresh/foreground-visibility.js` | `770bc22b9470782ee7dddd382b49b091bf552945fae05efde35ff584e393aac3` |
| Both `fresh/presentation.js` | `d2b634942eb54de38a390d5ac958a419f1e5a5beeb12ee03caf409986e0750e2` |
| 26a7 `fresh/frond-fade.test.mjs` (read, not used as independent oracle) | `d41a4fe3f33ceb41318a5f483a75c7560368838ededc9a1ebe9ca37e539bb8a6` |

Repository mutation by this reviewer: this owned evidence file only. No runtime/author test/other author evidence changes, staging, commits, remote operations or redelegation. Temporary numerical/image inspection files stayed outside the repository. Existing root/docs/older untracked work was preserved. This round is complete pending separately supplied frozen mip repair or native media.

LOD / alpha-repair review appended at: 2026-09-15T15:08:35.114886+00:00


## Independent finite mip repair review — 57a2d75

### Frozen receipt and source scope

Received frozen **57a2d750a003c593e00429279da9ea348e581732**, directly after **26a7b47cda779980a968ceb3a48a1ae44e8a8b49**, in the authorized isolated `game2-foliage-pilot` worktree. Reviewed the full five-file diff, author receipt/metrics, new mip test, installed Three `WebGLTextures` upload path and the official Khronos ES specification. Author-reported results are distinct from the independent executions below. No new native image, game video, physical-device measurement or actual GPU shader/texture execution was supplied for this review.

The runtime change is limited to tile-local transparent RGB extension, original-alpha-weighted mip color, filtered coverage adjustment, alpha-zero coarse tile guards, and seven manual levels ending at 8×8. `installFrondCutout`, `remapBambooLeafUv`, `projectedFrondDragArea` and `addBambooCrownLoad` function bodies exactly match frozen 26a7. Git diff is empty for presentation, foliage LOD, foreground visibility, vegetation physics, wind, leaf surface and grass shape modules. Thus this follow-up does not change the near geometry, physics hierarchy/load, root data, LOD thresholds, CPU ray algorithm or separated opacity/mask hook within the inspected source scope; no new full physics run is claimed.

### Same-input independent reproduction and repair verification

Loaded the retained exact original 512×512 raw atlas bytes (`126038f7144af047a3a1b247ae0a5a0146c79d75e3f9d575375ad2643bc13b7e`). Imported the actual old builder from frozen `git show 26a7b47:fresh/bamboo-frond.js` and the actual frozen new builder. Ran both on separate copies. The old builder reproduced the preceding review's luminance and texel-center coverage figures.

The new base atlas changes **0 alpha bytes**, **0 painted RGB bytes** (all alpha > 0 pixels), and **0 bytes in the opaque detailed-leaf fourth tile**. Exactly **486,948** transparent RGB channel bytes change. The new raw base SHA-256 is **dbddcabf4b17da028c38dc21055b38180f2fbeff8c3d7031b870896345ca3323**. Separately instantiated the actual scene headlessly: its base and all seven mip buffers matched these independently generated bytes exactly; visible/depth/CPU references share the same map.

The table uses the **same accepted texel-center luminance metric as the first review**: mean linear luminance in byte units over alpha ≥ 102 pixels. This is texture-data arithmetic, not an actual screen luminance measurement.

| Global mip | Old mean luminance, tile 0 / 1 / 2 | New mean luminance, tile 0 / 1 / 2 |
|---|---|---|
| 512 base | 50.9835 / 50.8113 / 50.7479 | 50.9835 / 50.8113 / 50.7479 |
| 64 | 63.7297 / 63.2499 / 62.2871 | 50.5736 / 50.4132 / 50.4637 |
| 32 | 71.5349 / 71.0872 / 69.2836 | 50.0816 / 50.0780 / 50.2683 |
| 8 | 80.0401 / 77.6841 / 78.4216 | 50.5648 / 50.7243 / 50.3860 |
| 4 / 2 | No accepted frond texel centers | These levels are not allocated |
| 1 | Alpha 98/255, below threshold everywhere | This level is not allocated |

Independently integrated original base-alpha-weighted color directly over each accepted new mip pixel's base footprint, without using the recursive mip routine or corrected mip alpha as an oracle. **94,932 RGB channel comparisons** had maximum deviation **0.5 byte**, consistent with final rounding. The old +23–40% covered-color brightening is absent in these stored mip values.

Independently wrote the clamped four-neighbor bilinear sampler, rather than calling the production coverage/CPU helper. Used a **257×257** lattice per tile/mip; new filtered coverage is:

| Global mip | Tile 0 / 1 / 2 filtered covered fraction |
|---|---|
| 512 base | 0.1625006 / 0.1630153 / 0.1615316 |
| 64 | 0.1679813 / 0.1688141 / 0.1618041 |
| 32 | 0.1673303 / 0.1658011 / 0.1650290 |
| 8 terminal | 0.1661342 / 0.1643780 / 0.1625611 |

All allocated levels retain accepted frond pixels. The terminal mip has **4/16 = 25% texel-center coverage** in each tile; its bilinearly filtered area is about **16.26–16.61%**. Those two metrics are not interchangeable. Additional **54** independent adjacent-mip blend cases (six intervals × fractions 0.2/0.5/0.8 × three tiles, each **131×131** samples) had coverage **0.1578579–0.1677641** and accepted luminance **50.4394–50.9695**. No all-empty intermediate field appeared in those finite samples.

**Clarification of the old minimum-mip result:** the prior 4×4/2×2 zero-coverage statement was about frond texel centers. This new independent bilinear check also reproduces false coverage near the opaque neighboring tile: in the old 2×2 level, tiles 1 and 2 each have about **0.1724931** filtered acceptance although their own texel is below cutoff. Old 4×4 similarly gives about 0.10854/0.10978 for those two tiles. This is cross-tile mask leakage, not surviving original leaves. Old final 1×1 alpha 98 still rejects everywhere. New coarse guards were independently checked at **4,032** boundary entries across all four tiles/six reduced levels, all exactly alpha zero; the empty/mixed 4/2/1 levels are no longer allocated. This refines the old source diagnosis without claiming any unseen GPU appearance.

### Actual Three upload path and normative partial-chain check

Independently executed installed `three/src/renderers/webgl/WebGLTextures.js` with a recording substitute that captures both raw GL and Three state calls. This is real uploader JavaScript with stubbed GL calls, not a driver:

- One `texStorage2D(TEXTURE_2D, 7, RGBA8, 512, 512)` allocation.
- Seven `texSubImage2D` uploads at levels 0–6 with dimensions **512, 256, 128, 64, 32, 16, 8**; each upload receives the exact corresponding mip byte buffer.
- **0** mutable `texImage2D` calls and **0** `generateMipmap` calls on either recording interface.
- Rebinding the unchanged texture causes **0** additional allocations/uploads.

Read the [official Khronos OpenGL ES 3.0.6 specification](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf), §3.8.7 equation **3.15**, printed p.150 (PDF page 163). Its effective maximum level for immutable textures is clamped by the allocated immutable level count minus one. Section 3.8.10.4 also identifies the last immutable array by that count. With seven allocated levels and unchanged base level 0, this supports level 6 as the effective terminal level; a full chain to 1×1 is not required by that rule. The actual JavaScript upload path matches that allocation. **Driver texture completeness and raster behavior remain unmeasured.** No screenshot of a specification page is counted as gameplay evidence.

Reviewer additionally executed existing `frond-mip.test.mjs` and `frond-fade.test.mjs`: **3 passed, 0 failed, exit 0**, about **4.19 s**. Those author-authored fixtures cover poison RGB, mip/three-upload behavior and visible/depth opacity separation; they supplement the independent checks above and are not relabeled as independently designed tests.

### Conclusion and remaining limits

**The two reported defects are closed within this frozen source/CPU-data scope:** old ordinary-mip color brightening is reproduced and removed; the old completely rejecting terminal mip is replaced by a valid seven-level allocation whose terminal filtered mask retains coverage. No new static blocker was found in this finite follow-up. The prior opacity/mask separation is preserved, with its regression fixture passing.

This does not establish stable subpixel raster visibility: the retained 4×4 tile can still alias/shimmer as the frond becomes very small. It also does not prove natural canopy volume, correct perceived near/far switching or shadows, GPU performance, complete input routes or PS4-equivalent visual quality. Those require the next native CI material. The approximately 0.6% base-union undercoverage remains unchanged because the base mask/near geometry are unchanged. Formal ten-element comparison remains **not measured**; this is known-source technical diagnosis.

### Inspected byte fingerprints

| New generated level | SHA-256 |
|---|---|
| 512 | `dbddcabf4b17da028c38dc21055b38180f2fbeff8c3d7031b870896345ca3323` |
| 256 | `80a8dd421a7189bbf4185c74ebbfe7b83076fbb17b00cdbb5126a33b05c0b22e` |
| 128 | `02b2e031906aff5e8cb48b09b112be4de8236248e6e6d46d2f73108eb22bc44c` |
| 64 | `a489bf7e68f8ad3f644e753aad3d79d6a6fd1f11a800744ee8038bc8fa1de400` |
| 32 | `1cda42f9f3965d1fe4c9adea3eb1b546f51aac967a1ff1950dde5dbc62673bb0` |
| 16 | `c37f887fd39199ebfe49247d80cde6e19c25c2c991f96a3f4cc157acf83c8c1e` |
| 8 | `12f93142d6965f68e66b1eb6e70e7daace8535287f48886780ef635c9f92a28a` |

Frozen `fresh/bamboo-frond.js` SHA-256 **77e3f3932b2d23ac3fd2f0f47e0ff5fc0aa32d8e8304d304ab18d33b71746922**, independently checked at script start/end and in the separate upload/unchanged-source check. The only repository edit by this reviewer is this evidence append. No runtime/test/other author evidence edits, staging, commits, remote operations or redelegation.

Finite mip-repair review appended at: 2026-09-15T15:24:08.569369+00:00


## First native ordinary-view review — 9068522

### Receipt and actual inspection

Received runtime **9068522520b0f269cc937057b444f06c7c187978**, original recovered media from CI **34988388499** and **34988388555**. Integrator reports original ZIP SHA/CRC and per-file verification; this reviewer independently computed supplied local PNG/report hashes. Personally displayed at original detail:

1. `.review/34988388499/render-profile-candidate/full.png`, **960×720**: production full rendering at a fixed initial ordinary camera.
2. `.review/34988388555/asset-readiness/normal.png`, **1280×720**: actual start after asset readiness, with ordinary HUD visible.
3. Same-run `.review/34988388499/render-profile-baseline/full.png`, **960×720**, frozen baseline **acf0f9ec86996245ad712d6adc72e5d6159f6711**.
4. Reopened existing e188 `.review/34978382509/fresh/encounter.png` and `title.png`, both **1280×720**, for limited context comparison.

This round therefore inspected **two new candidate ordinary images, one newly recovered old-runtime matched view, and two previously reviewed e188 images**. Supplied readiness `failed.png` was identified and hashed but **not visually inspected** or used as an ordinary-quality sample. No new figure close-ups or video were available in this finite round. No audio was heard. This is known-source diagnosis, not source-blind comparison.

### Comparison conditions

The candidate and same-run acf profile reports identify the same apparatus SHA **1e915d1ed590327b0528efb39ed3cd815815ecfaada08900acc8428033da6651**, viewport 960×720/DPR 1, initial player position (0,18), and the same three enemy positions. Independently compared all **13** full samples over authored time **0–0.2 s**: corresponding camera positions and quaternions have **maximum numerical difference 0**. Initial camera is (0.85,2.8,23.8). Both files are the `full`, non-ablation variant. These are matched fixed-camera native images from the production view, not a complete ordinary-input route or a blinded reference fixture.

The readiness image comes from a different runner and 1280×720 viewport. Its report records `started-and-rendered`, world time **0.35**, running true. This metadata defines scope; its event name is not proof of visible quality. The two candidate images are not claimed to be a pixel-identical matched pair. The old e188 title has a dimming/menu overlay, and its encounter uses a different camera/location; those images support continuity of visible scene features, not equal-lighting or equal-camera measurements against 906852.

Profile report source revision is the exact received 906852; candidate fresh-tree fingerprint **8acf757156b6f47ac788029d6d7cefe4d3a998a1587bb2c67e67c57387b7db5a**, baseline fingerprint **206f474d9c81779beb142d59680574f0cdc1d0fb6bd04b205424c7aeff88ad47**. The candidate fingerprint includes the reviewed mip repair `bamboo-frond.js` SHA `77e3f3932b2d23ac3fd2f0f47e0ff5fc0aa32d8e8304d304ab18d33b71746922`. Receipt/source identification does not convert its earlier numerical pass into an appearance pass. The apparatus is Chromium/SwiftShader; no performance conclusion is drawn from these still images or the report's `passed` label.

### Direct appearance observations

| Area | Improvement actually visible | Remaining defect / judgment |
|---|---|---|
| Bamboo canopy | Small branch/leaf marks do appear among the stems. This confirms some visible marks, not a convincing crown. | **Major unresolved ordinary-view defect:** both candidate images remain dominated by many bare thin culms and extremely fine black dots/short lines. In matched acf `full.png`, green feather-like leaf groups are clearly readable in the upper-left and upper-right; those same image regions in the new full view are mostly sparse stippled/linear marks. The canopy-volume goal is **not visibly repaired at this ordinary camera**, and leaf-group legibility is worse than the matched acf image. Exact camera equality rules out camera displacement as the explanation for this pair's visible difference; this review does not yet assign the underlying source cause. |
| Near/far foliage color | No large bright frond patch was observed in these two new stills. | Most leaf surfaces are too visually slight to judge color cohesion or a near/far transition. The absence of an obvious bright patch is **not** native closure of mip color/silhouette behavior; there is no moving camera sequence here. |
| Shrine and route | Latticed door panels, roof tile lines/eave structure, individual paving stones with irregular edges and material variation read clearly compared with acf's flatter facade and rectangular slabs. These improvements were already visible in e188 and remain in the new view. | The shrine still has very simple large planes and surrounding repeated props. Adding these details has not brought the complete environment to the requested visual target. |
| Central rock and ground | The rock now reads as one coherent mass rather than acf's rounded lumps mounted together. Ground grain is more restrained than the old coarse repeating mottling. | The rock still has large obvious flat facets, a broad straight-looking lower edge and an abrupt meeting with the ground. Bare tan-brown ground occupies large uninterrupted areas; isolated yellow-green rod-like grass clumps repeat at similar scale and spacing. There is little readable transition from path to soil to planted ground, so props appear placed on a sparse surface. |
| Props, light and integration | The torii, path and shrine remain easy to recognize as the intended route. | Repeated identical block-like lanterns, uniformly simple banners and many long dark linear shadows dominate the clearing. Sparse vegetation and weak surface/contact variation leave the setting looking assembled from repeated simple parts. Static shadow shapes alone do not establish shadow motion, correctness under movement or rendering performance. |
| Player at actual game distance | The rear head/neck silhouette is more integrated than the old helmet-like acf head. The lower blue garment reads as broader closed cloth panels rather than a row of thin repeated pleat strips; the player remains readable against the ground. | The torso/sleeves still have rigid swollen forms and dark shoulder-joint separations. This rear ordinary view cannot close prior front collar, face, warden covering or hand defects. The dark shoulder parts are a visual integration concern here; no new background-through-mesh hole is asserted without the forthcoming close views. |

The old e188 encounter confirms that the improved paving, coherent rock mass and detailed shrine predate this candidate. They are retained progress, not newly credited to this foliage/repair round. Its same sparse bamboo appearance also remains relevant; no matched-frame magnitude claim is made against e188 because the camera/menu conditions differ.

### Finite priorities and overall judgment

1. **Restore legible bamboo leaf groups in the actual ordinary view.** The same-camera native result must change from bare poles and stipples into readable connected foliage volume. Successful atlas arithmetic and increased leaf counts have not achieved that visible result in these images. Preserve the physical distinctions while diagnosing this appearance failure; these stills do not identify whether placement, orientation, projected size, filtering or another cause dominates.
2. **Improve the ground/rock/planting connections as a whole.** The uninterrupted bare surface, isolated repeated grass, abrupt rock base and repeated prop pattern are larger contributors to the unfinished landscape than further small shrine detail.
3. **Complete character silhouette and garment/joint integration using the incoming figure media.** The rear panel improvement is visible, but shoulder forms and the rest of the body cannot be accepted from this one rear view. Front/three-quarter/face and hand closure remains pending those originals.

**The complete ordinary-screen appearance still does not support the requested PS4-level visual target.** This is an independent art judgment grounded in the concrete defects above, not a newly performed reference-game benchmark or numeric quality score. The 57a2 source/CPU mip closure remains valid within its original scope, while ordinary foliage volume is visibly unresolved. Motion/naturalness, trunk-versus-leaf temporal behavior, sound balance, frame timing, responsiveness, route completion and formal ten-element comparison remain **not measured in this round**. No complete-quality or publication acceptance follows from these two stills.

### Supplied-file hashes

| File relative to canonical root | SHA-256 |
|---|---|
| `.review/34988388499/render-profile-candidate/full.png` | `c7094722f42a42a25eaf61491734e97398b8820672c390c3341cf9d73deb7461` |
| `.review/34988388499/render-profile-candidate/report.json` | `079def0c6bbb275a5dcf74caaf55fc5fe40b1064cc98d48979735377aa582e2a` |
| `.review/34988388499/render-profile-baseline/full.png` | `f00eeb892729a2e46ae9b370fddb49394aae025128dd410183673ee79bdac824` |
| `.review/34988388499/render-profile-baseline/report.json` | `80a47c20631953b2feef2532522e254505ecc02afab094dfce7e71f07d77a9b6` |
| `.review/34988388555/asset-readiness/normal.png` | `d8b5f432413fa1eadf76d1a5364da49f0a6823e9819a1673612236ee00289e3e` |
| `.review/34988388555/asset-readiness/report.json` | `aedc96cb66ac0c4c7f21f4723faa3771f1719f0b13ef70868adb4e245959f6e5` |
| `.review/34988388555/asset-readiness/failed.png` (received/hash only, not viewed) | `f634d86e24df93eb64d1bad987d46470b196035f74dbba30e4565dd372ce7dae` |
| `.review/34978382509/fresh/encounter.png` (e188 reopened) | `f088783855e43eec3c973e32a4696bbf2db4da6382d9acff2409d8e44876a402` |
| `.review/34978382509/fresh/title.png` (e188 reopened) | `15443ae3bdf920901b120ae40963a8a999141ef87846cd6175eeafc5468768d1` |

Only this owned evidence file was edited. No runtime/other author changes, staging, commit, remote operation or redelegation. Early specific findings were returned to the integrator and vegetation author without using author visual scores.

906852 ordinary-view review appended at: 2026-09-15T15:34:00.782326+00:00


## Independent native figure repair review — 9068522 / CI 34988388555

### Receipt, personally viewed images and matching conditions

Received art job **104446321736** from CI **34988388555**, runtime **9068522520b0f269cc937057b444f06c7c187978**. Integrator reports original 29+29 PNG/report recovery and full SHA/CRC agreement. Personally displayed all **21 requested new native 960×720 PNGs** in `.review/34988388555/after/after/`: player, sentinel, retainer and warden × full/back/face-front/face-threequarter/face-profile, plus `warden-face-profile-left.png`. The eight player neck-pose files were **not inspected in this art round**; the integrator assigned that separate scope to the runtime reviewer. No native figure video or motion was viewed here.

For actual previous-candidate comparison, reopened six original e188 PNGs at full detail: player full/back/face-front/face-threequarter and warden face-threequarter/face-profile. Reopened two b06 before originals (player full/face-front) in the new recovery. Independently confirmed all **20** regular new-recovery b06 before files are byte-identical to the previously reviewed `.review/34978382509/figures/before/` files. That equality is provenance reuse, not a claim that all 20 before files were newly viewed in this round.

New reports identify source 906852 and runner 906852; before identifies source **b06ade1ad5ab8b72de9bb9996f323a063f5db5ef** with runner 906852. The fixture is a neutral stage with production meshes/materials, fixed lights, synthetic idle and inspection cameras. **All 20 regular candidate camera/target pairs exactly match the corresponding e188 report values.** Against b06, eight full/back pairs match; the twelve face pairs follow the different head position (about 0.054996 m lower and 0.000685 m shifted in z for the new candidate), so those face images are not described as identical world-camera framing. The added left-profile warden image has no matching e188 left-profile file in the prior 20-image set.

This is source-known technical/visual diagnosis. b06 is an earlier version of this same game, **not the fixed reference game**. No source-blind reference comparison or formal ten-element measurement is performed. Close-up improvements do not override the preceding ordinary-world review.

### Visible closure against e188, limited to inspected static views

| Prior specific symptom | New original-image evidence | Closure scope |
|---|---|---|
| Raised collar ends, conspicuous background triangles at the sides, separate dark band across upper chest | All four front/three-quarter face sets now show a low continuous neckline with narrow trim. Player full/back and matching e188 views show the collar sitting around the neck rather than standing away from it. | The earlier large static collar-opening symptom is **not reproduced** in these inspected views. Small dark neckline slivers and imperfect trim edges remain; no all-pose/inside-surface closure is claimed. |
| Large black shoulder arcs floating away from the upper arm | New player three-quarter/full/back and the other three figures have smaller shell-like caps seated much closer to the sleeve. The old e188 three-quarter exposes a large isolated arc; the new counterpart does not. | The obvious large floating-arc symptom is **visibly improved/closed in these static views**. Shoulder/cap forms still look hard and assembled; fit during articulation is unmeasured here. |
| Warden cheek/ear/jaw sawtooth boundary and protruding black nose | Warden front, three-quarter, right profile and added left profile show continuous black cheek-guard surfaces; the skin nose remains separate and visible above the guard. The old e188 right/profile originals explicitly show the former large teeth and black nose protrusion. | The reported static jagged-intersection/black-nose symptom is **not reproduced** in these four new face angles. This is not a claim of natural finished armor design. |
| Pale triangular fragments inside the topknot | Old e188 three-quarter/profile show pale triangular gaps inside the knot. New player and warden profiles/three-quarter show a continuous dark knot with a small tie band; those conspicuous triangular fragments are absent. | Finite static visible symptom closed; detailed hair geometry or motion not inspected. |
| Lower clothing reads as separate hanging boards / large open pleat strips | All four new full/back views show connected, closed-looking cloth volumes around the legs. The old e188 player full/back displays flat separated strips. | Clear silhouette/surface improvement in these views. Interior topology and dynamic collision are not inferred from the stills. |

The original b06 block-and-sphere face, disconnected-looking neck, box shoulders and board clothing are substantially surpassed: continuous facial anatomy, ear contours, skin variation, a joined-looking head/neck, curved garments and material differences are now directly visible. The human head/skin improvement already existed in e188; it is retained progress, not a new face revision credited to 906852. The new visible progress is chiefly collar, shoulder placement, guard boundary and clothing integration.

### Remaining art defects and priorities

1. **Garment silhouette and shoulder integration remain the largest full-figure issues.** New trousers/hakama have two broad rounded, bag-like thigh volumes with weak readable cloth folding; sleeves remain swollen cylinders and the chest a rigid rounded panel. The shoulders are better attached but their black caps still read as separate hard parts. Preserve the closed cloth surface while improving its drape, fold placement and transitions; this does not favor restoring the older open strips. Full/back images of all four characters support this observation.
2. **Face finish and character distinction remain below the requested target.** The eyelid/eye interiors read as dark flat gaps with little visible wet highlight or internal material detail relative to the skin. Hairline/sideburn edges have sharp, visibly serrated texture boundaries, while the topknot remains a simple solid lump. Player, sentinel and retainer present the same recognizable facial shape, hair and expression; clothing color is their strongest visible distinction. These are static appearance observations, not diagnoses of facial animation or inferred human identity.
3. **The warden guard is cleanly bounded but still visually crude.** In both profiles it projects as a thick broad slab around the lower face, with a straight lower edge and sharply ending side plates beneath the ears. The attachment/retention relationship is not convincingly readable. The repaired surface avoids the old sawteeth, yet it does not look like finished fitted protective equipment. No physical detachment is asserted merely from the appearance.
4. **Small trim and seam artifacts remain.** A short isolated pale/gold slash remains high on the chest; neckline trim has clipped/uneven ends and a small dark sliver near the front throat in three-quarter/profile images. A narrow dark vertical line remains on the right side of the back panel. These are lower-priority visible integration/polish concerns; this still review does not assign mesh/UV causes or label every dark line a hole.

The four figures are recognizably more human and connected than b06, and several explicit e188 visual failures are closed in the supplied static angles. **They still do not support completion of the requested PS4-level art target.** The human head now exposes the simpler garment/armor shapes more clearly. The ordinary-world foliage/ground/prop defects documented immediately above remain part of the overall appearance judgment.

The eight extreme neck poses, dynamic garment/armor contact, facial motion, locomotion, sound, performance and complete-route behavior are outside this finite review. Formal ten-element/source-blind reference quality remains **not measured**. No new source/test change or runtime acceptance is implied by this appearance review.

### Personally inspected candidate PNG hashes

All files below are relative to `.review/34988388555/after/after/`.

| Original file | SHA-256 |
|---|---|
| `player-full.png` | `48d8b200eedfa82d9460249d196f7a68a6b067d258d998f0558fc0737aa93bd3` |
| `player-back.png` | `1b1e4f0c4266dc5702b893b26bb847c743a1ae981c5a0b946d2ab18dec8001ba` |
| `player-face-front.png` | `52ac6d7e191816cfa7376d12e0389a2c8684f858e93360904c4befd96d6328be` |
| `player-face-threequarter.png` | `2de9d2a01cf35b28efea280b5ede94c0eca58798ff8b8fd01ed1f70464771265` |
| `player-face-profile.png` | `9a0401db836f465af5c56c586e165788ebcab10c9363c3bd393a9ca3fe8a5001` |
| `sentinel-full.png` | `8c70edc5d9448d174bb4efe589a72d28e89f1e2326b728313f69e41fee60686d` |
| `sentinel-back.png` | `5f37c8fc6e1b6e72bb522fbcf35e9c11f0e0ec97113f454d034370770b73acca` |
| `sentinel-face-front.png` | `4dd1ce076eda08f244437c9ab103de1cf29e913bd1cf5399590d8a35b9ee1197` |
| `sentinel-face-threequarter.png` | `ecd9399f145d5366d3f691d9778f95c9a046caa2ae986b7c72c58497d83605ec` |
| `sentinel-face-profile.png` | `dcdf668c54f687db567a1d471e041ddbf90d9dd648326207351035ef6f3c8caf` |
| `retainer-full.png` | `0f9202a1c2dfba29fdf75a9130fdd8554122cf934b3be2005849f3c5dbe94e4e` |
| `retainer-back.png` | `7fcb61313e66904ccdb3ba46b4ef5cbebfedc5c36d25574eca78fff937737f79` |
| `retainer-face-front.png` | `5d8270c885d14efa034adffa2ca4b20d4f03c9f0547f06987f9689737989f50c` |
| `retainer-face-threequarter.png` | `6ca2640399eba3c7896bd3bb06b5889e75be6ced631b6bf779d8379914bf5e07` |
| `retainer-face-profile.png` | `9515e8948e5cd524a72c1ca325b6824916058f2af866ab8f1d8667603492ea55` |
| `warden-full.png` | `47e351b4acf6636a28c7e5d305ba8ab4f1ed0f2515e8df5d21cdff04af1d6a4c` |
| `warden-back.png` | `e29d0b79dc12a049b4fc7cc20b0e4590ddfe9f43578371f9a0143b4e987b05ae` |
| `warden-face-front.png` | `b9ee4c4b4fbba354672685dd2f5cfd0d659e7f75c2b3e41e9135f1bc320a4045` |
| `warden-face-threequarter.png` | `3de7148d6aa14dbccca30364a0a6f0d735d915c41c9ec5d59feec6c85466db2c` |
| `warden-face-profile.png` | `0d8a455e329371801b5019c5a4fd19d1881609d21f36bde19cee2ec6a75d2245` |
| `warden-face-profile-left.png` | `0ce73ce58ca8ed6cffd7522c8314bb93f41d2aaac85725c0048a1424d37bccd7` |

Additional report / reopened-original hashes:

| File relative to canonical root | SHA-256 |
|---|---|
| `.review/34988388555/after/after/report.json` | `5a24e7a238068252fc2d9563ade62eba0487fffffa260cc936e7816a1902c520` |
| `.review/34988388555/before/before/report.json` | `5a91691f11cf309724168c938f48d529434585fe8b153fb71543945ac0c9c5da` |
| `.review/34988388555/before/before/player-full.png` | `13b44c4dccbd5f9f19970f12abd5af279b6624b3f46c96b867e5890298f4fe96` |
| `.review/34988388555/before/before/player-face-front.png` | `4d2fcb6d87c41a9ca8702f4ef0546ec61975d5e58dda954c8a6c65dd8e8dcdfa` |
| `.review/34978382509/figures/after/player-face-front.png` | `c73003f27c1507394be4fb20f68cc2920e90764d5eec725b0fa921111b3b7fc6` |
| `.review/34978382509/figures/after/player-face-threequarter.png` | `31ca9d0bc6ee28184d1a4d0e2f9f40c548dcf3393e88929b65db3cb660a85906` |
| `.review/34978382509/figures/after/player-full.png` | `12b366cab3811bc89587f8733115f49e35280aa2df5d958b08fe76cd176b37fb` |
| `.review/34978382509/figures/after/player-back.png` | `6209ce0532b6573c27700b3177abc7aa570e5c20383bffa61e19a41bb052e471` |
| `.review/34978382509/figures/after/warden-face-threequarter.png` | `fa81cbebbfc458ded3bf49b052c42748820566d5a7397d4fb4b4a817896e4233` |
| `.review/34978382509/figures/after/warden-face-profile.png` | `9e2ffcdd6f7cbc46a02a8a511d2b22df2a6d314040a0e1ae00656b1623232545` |
| `.review/34978382509/figures/after/report.json` | `f655a5c6773322d303a29509da04f1a0fadc5644d3ea68cf878f75a4acc763d3` |

Only this owned evidence record was edited. No runtime/test/other author changes, staging, commits, remote operations or redelegation. Early concrete closure/residual findings were returned to the integrator before completing this record.

906852 figure review appended at: 2026-09-15T15:39:07.028228+00:00


## Independent fixed bamboo / maple inclination source review — ef36bc1 and 2b5b1ba

### Exact receipt and method

Integrator assigned the frozen isolated bamboo candidate **ef36bc10a117a6e193b9bf59d0c271dd43289df4**, parent **57a2d750a003c593e00429279da9ea348e581732**, then maple **2b5b1baf946f8708b75993a7a0458812e4f46914** directly after ef36, in `game2-foliage-pilot`. Canonical runtime at assignment was **9068522520b0f269cc937057b444f06c7c187978**. The integrator subsequently combined these changes into **4fa13484c88dfa3d572c189e3a8999e8f254e70e**. I read each exact commit diff and imported its frozen `git show` presentation source through the headless helper; I did not accidentally evaluate the later working-tree presentation as the bamboo baseline. Renderer calls were stubbed. These are independent CPU/source calculations, not native rasterization, GPU validation, a source-blind reference comparison, or a visual quality score.

Read the relevant transform/binding, LOD selection, selected geometry/foreground ray logic and the changed tests/author evidence. Author test/build results remain attributed to the author. The numerical checks below were separately calculated in my own inline Node harness. The first bamboo harness incorrectly expected every woody batch support to have crown attachment segments; I corrected its selection. The first maple rigid-fit harness was ill-conditioned on almost planar leaf points; the completed check instead fitted two well-separated vectors and their orthogonal frame. These were reviewer-harness failures, not product test failures or source changes.

| Frozen presentation source | SHA-256 |
|---|---|
| 57a2 baseline | `d2b634942eb54de38a390d5ac958a419f1e5a5beeb12ee03caf409986e0750e2` |
| ef36 bamboo candidate / maple baseline | `afeae3c5c6fdf51a7cb38f92ac826f8abb54f1ece41b2d17ade8106849d88e86` |
| 2b5 maple candidate | `5be1150f9760eb6d570608e6978ac8d6ce64b036917f3a54599f131a78c93321` |

### Bamboo source findings and independently calculated preservation

At ef36 `fresh/presentation.js:356–363`, all near leaves, their short side shoots and the matching baked far card rotate once about the supporting twig's x axis by variant angles −1.10, +1.24 or −1.35 rad. The main supporting twig endpoints remain fixed. Leaf metadata and attachment-segment coordinates receive the corresponding transform; the shader does not acquire a camera-facing billboard or a common time-varying sine. Existing hierarchical branch/leaf dynamics remain in place. Template projected drag area is recalculated after inclination; no new spring coefficient or main support dimension is introduced. The only `bamboo-frond.js` change is explanatory text about the inclined projected area.

Independent results across the full generated scene:

- **900 crowns, 32,400 bamboo leaves**; **298,800 crown vertices** checked against the common affine transform; **16,200 other woody vertices** in bamboo material batches unchanged exactly.
- Main twig segment endpoints unchanged exactly. Maximum leaf pivot distance to its actual short side shoot/main attachment segment **0.0000026003 m**; maximum pivot-transform residual **0.0000060445 m**; maximum transformed vertex residual **0.0000084094 m**.
- UV arrays, full topology and near/far topology unchanged exactly. Maximum inverse-transpose unit-normal discrepancy **0.000099318** and transformed hinge-axis discrepancy **0.000017462**; transformed `leafAxis.w` error **0.0000028920 m**. These are finite float-coordinate residuals, not visual tolerances.
- All **2,317** structural beam records retain id, parent, kind, rest origin/rotation, attachment, relative rotation, length, mass, stiffness, damping and max ratio. The selected-record SHA-256 is **b5e4f26b4bfe7eb41321afbd8e55571a0a01f3d9572696c1d481d083696e541a** before and after.
- All seven atlas/mip byte hashes unchanged; grass data unchanged, SHA-256 **70733f5d139fb4d7f2a898540bcd3e16a2e6dd1bbc08efc4951cbed3507c81c1**.
- At four camera orientations, independently reconstructed selected near/far indices and draw ranges matched **2,569,650** checked index entries. Unchanged cutout/fade separation and common visible/depth transforms are retained in source; this does not replace GPU shadow or transparency inspection.
- Independently integrated 20 seconds at 60 Hz, sampling short-member chord strain each 0.5 s: maximum **0.0015674286 = 0.15674286%**, below the retained 0.2% condition; root drift **0**. This finite simulation is not a proof over all wind states.

**Important dimension limitation:** the crown rotation is rigid in template space, before the already-existing nonuniform instance scale (`presentation.js:397–402`). Consequently world-space leaf dimensions are **not exactly preserved**. Across the generated leaves, new/old `leafAxis.w` ranges from **0.8350563 to 1.1691743** (approximately **−16.5% to +16.9%**). The transformed metadata correctly follows these changed world lengths; this is not a detached pivot. Template dimensions and supporting twig endpoints remain fixed. Unchanged mass/stiffness and the existing area-scaling approximation must not be described as exact world-shape/aerodynamic preservation. I sent this limitation to both integrator and author. The integrator explicitly accepted correcting the claim and judging the bounded size range together with native appearance, without adding another geometry repair solely because of this range.

Independent production-camera projection at world time 0, 960×720, using actual deformed far-card corners (no alpha rasterization):

| Orbit | Fully inside frame, old → new | Median card height, px | Median projected quad area, px² | Far groups, old → new | Active bamboo triangles, old → new |
|---|---:|---:|---:|---:|---:|
| 0 | 329 → 328 | 1.1449 → 8.4658 | 6.2996 → 38.9715 | 167 → 301 | 134,850 → 99,600 |
| π | 1 → 1 | 3.9440 → 29.0615 | 69.9414 → 130.7077 | 0 → 0 | 111,350 → 95,100 |
| π − 0.65 | 16 → 12 | 3.1985 → 23.1024 | 51.2263 → 337.4274 | 7 → 8 | 109,850 → 94,100 |
| π + 0.65 | 20 → 16 | 2.7744 → 14.5407 | 25.6462 → 118.4326 | 18 → 14 | 114,100 → 97,600 |

Production camera positions were `[0.85,2.8,23.8]`, `[-0.85,2.8,12.2]`, `[2.8334099245,2.8,12.8683055235]`, `[-4.1867523820,2.8,13.8971224133]`. The main-view count of fully visible crowns below 1 px² went **0 → 5**, so this is not a universal per-crown improvement. The exact opposite view has only one fully visible crown and cannot support a broad opposite-view canopy claim. Projected card area is not green-pixel coverage, rendered naturalness or measured performance.

The changed former positive water ray is explicitly recorded as now **zero** after the geometric rotation. Source review found that the replacement full-deformation comparison covers relevant nearby cells on both faded and clear sides instead of only existing faded cells; separate positive moving ray controls remain. I did **not** rerun the author's 162 positive ray cases in this round or count them as mine. The author changed the geometric horizontal-area expectation to match inclined leaves while keeping the dynamic 0.2% strain condition; the latter was independently checked above.

### Maple fixed petiole, normal cache and opposite-view results

At frozen 2b5 `fresh/presentation.js:435`, only the fixed per-leaf x-roll distribution changes, before the existing side rotation and twig attachment transform. The local root translation is unchanged. It does not animate the leaf with a new shared sine. The source retains existing maple physics records/effective canopy drag areas; this is **not** an exact recomputation of orientation-dependent maple aerodynamics.

Independent full-scene checks:

- All **3,888 maple leaves / 93,312 vertices** checked against a proper rigid rotation about the unchanged stored pivot; maximum vertex-fit error **0.0000093542 m**, pivot-radius difference **0.0000037625 m**, unit-normal discrepancy **0.0001121841**, and `leafAxis.w` change **0**.
- Every maple pivot, UV, full index and map byte unchanged. Every group cached normal matches its actual new far triangle exactly (**maximum difference 0**).
- **330,184 non-maple vegetation vertices** unchanged exactly. All **2,317 entire beam records** unchanged before integration, including fields beyond the selected bamboo structural hash.
- After independent 480-step / 8 s integration, projected the actual deformed maple triangles using original 906 whole/close inspection cameras and a mirrored whole-tree camera. All near triangles are measured geometrically, without occlusion or fragment alpha. The exact original close camera differs very slightly from the author's derived close camera; my numbers are independently calculated, not copied from the author table.

| Camera | Fully visible leaves, both | Median leaf area old → new, px² | Median facing old → new | Facing < 0.1, old → new | Submitted maple triangles, both |
|---|---:|---:|---:|---:|---:|
| Native whole | 972 | 4.0217 → 9.4669 | 0.13656 → 0.35525 | 310 → 124 | 67,104 |
| Native close | 150 | 614.0115 → 557.3760 | 0.83731 → 0.73902 | 0 → 8 | 69,984 |
| Opposite whole | 972 | 10.0992 → 10.3410 | 0.36568 → 0.37517 | 45 → 96 | 69,984 |

Native whole position/target: `[-14.212534234788277,6.03363304163433,11]` / `[-22,4.292204452121128,11]`; close: `[-22.653767959023295,6.160196911555961,9.707845414072473]` / `[-22.07739162130612,5.230039856604955,9.469102517959085]`; opposite whole mirrors the first camera about target x to `[-29.78746576521172,6.03363304163433,11]`. Facing is the area-weighted absolute triangle-normal/view-direction cosine per leaf. The prior report's single helper-normal cosine is not used as an all-leaf measurement.

The whole-view distribution improves, but **the count of nearly edge-on leaves worsens in the opposite and close views** despite the opposite median remaining slightly better. This is a retained view-dependent tradeoff; neither all-view improvement nor canopy completion is claimed. No new major source/geometric consistency blocker was found in this finite bamboo/maple scope. GPU cutout/depth continuity, switching, visual naturalness and performance still require native evidence. The immediately following review records only the supplied ordinary still, not those missing dynamic conditions.

## Independent ordinary native still review — 4fa13484 / CI 34992059112

### Receipt and comparison conditions

Personally reopened original `.review/34988388555/asset-readiness/normal.png` for runtime **9068522520b0f269cc937057b444f06c7c187978**, then displayed original `.review/34992059112/asset-readiness/normal.png` for runtime **4fa13484c88dfa3d572c189e3a8999e8f254e70e**, both at native **1280×720** detail. These are two ordinary production arrival views after start, not the neutral figure stage. Read both corresponding reports and independently checked PNG hashes against their capture entries. The integrator reports original artifact/hash agreement.

Both reports use apparatus SHA-256 **34d122a1f06ac5dfd98a7bf537ba9674f2cd08710e28b002347475436e0ef4aa** and Chromium **141.0.7390.37**, with the same visible framing and start location. They are nevertheless **not exact same-time/phase captures**: the recorded before/after screenshot world-time brackets are **0.35 → 3.85 s** for 906 and **0.45 → 3.95 s** for 4fa. The exact drawn screenshot instant is not inferred from either boundary. The report contains no camera-pose equality measurement used here, so visually aligned framing is not promoted to a numerical identical-camera assertion. Both capture brackets say running, assets ready, no context loss. These state fields delimit capture conditions; they are not evidence that a visible effect happened at a telemetry event.

The integrator had already supplied an opinion about sparse foliage before this review. I know both version identities and that opinion. This is explicitly a **source-known technical/visual diagnosis**, with that awareness limitation, not a blind or independent anonymous score. My concrete observations below come from personally displaying both originals.

### Actual visible change and remaining ordinary-view defects

- **Small foliage legibility improves.** Across the upper-left and upper-middle bamboo, many former almost-black horizontal dashes are now visible green leaf fragments. At the upper-right edge, some sprays read as narrow radiating leaf groups rather than isolated dots. On the left ground, several separated branching leaf-shaped shadow patches are more readable than the former small diffuse spots. This is visible progress, not merely a projection-number claim.
- **The ordinary forest still reads as sparsely decorated poles.** Long bare bamboo lengths and large uninterrupted sky/haze gaps dominate. Most crowns remain tiny scattered marks instead of layered foliage masses. The new still does not close the previously recorded lack of canopy volume, and it does not establish that a large percentage increase in geometric card footprint becomes a comparable overall visual improvement. Individual cropped sprays remain visibly thin and spoke-like.
- **No conspicuous new bright rectangular atlas patch or wholly erased vegetation block is visible in this image.** The tiny distant fragments do not provide enough information to approve all mip color, near/far transition, alpha cutout or shadow behavior. No maple crown is sufficiently isolated and legible here to close the separate maple whole-tree complaint.
- **The person remains visually integrated at this distance, with continuous blue lower clothing, readable head and sword, and contact near the paving.** This image does not expose facial finish or prove garment/shoulder articulation. No new face or body improvement is credited to this vegetation revision; the already-reviewed 906 figure residuals remain.
- **Scene materials and placement retain their earlier gains and limitations.** The shaped paving stones, roof tiles and lattice doors remain readable, but broad brown ground areas are uniform; thin upright grass blades repeat at similar scale and orientation; lantern blocks repeat conspicuously along both sides. Large faceted rocks meet the soil abruptly, with little convincing ground transition. Long hard bamboo/prop shadows and bare space expose these repeated shapes. These are still-level appearance observations, not a lighting-engine diagnosis.

For the next finite art work, the leading remaining issue is **readable layered foliage mass in ordinary cameras**, followed by **ground/rock/grass transitions and repetition**, alongside the previously documented **garment/armor silhouette and face finish**. This does not prescribe more leaves or larger world dimensions solely from one still; alternate native views and motion are needed to choose a remedy.

**The requested overall PS4-level visual target remains unsupported.** There is a visible local foliage improvement over 906, but the integrated ordinary scene retains major art deficits. The source checks above do not close these art issues. No motion, sound, performance, complete route, physical-device quality, native opposite view or dynamic LOD transition was measured in this two-still review. Formal ten-element/source-blind reference assessment remains **not measured**. Any CI route/performance failures are unaffected by this appearance finding.

| Personally read/viewed file | SHA-256 |
|---|---|
| `.review/34992059112/asset-readiness/normal.png` | `b96119262c4898a3402dfa32abbdd031a5bdbd172cded4723699380b23d60d9b` |
| `.review/34992059112/asset-readiness/report.json` | `a26d3417de0a9d92d50462e8d3d393221b4586fe813eea1abf6db7dd6e8216ec` |
| `.review/34988388555/asset-readiness/normal.png` | `d8b5f432413fa1eadf76d1a5364da49f0a6823e9819a1673612236ee00289e3e` |
| `.review/34988388555/asset-readiness/report.json` | `aedc96cb66ac0c4c7f21f4723faa3771f1719f0b13ef70868adb4e245959f6e5` |

Only this owned evidence file was edited. No author implementation/test file, runtime, staging, commit, remote operation or redelegation. Early source limitations and native findings were returned directly to the integrator.

Fixed inclination source and 4fa ordinary still review appended at: 2026-09-15T16:11:15.971697+00:00
