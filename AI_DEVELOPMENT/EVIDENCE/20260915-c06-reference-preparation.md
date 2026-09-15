# C06 reference-media preparation — 2026-09-15

Status: **real still media acquired; whole C06 comparison not ready; not measured**.

## Scope and receipt

- Actual acquisition/inspection author: `/root/game2_ultra_art_sound_physics/c06_reference_material`.
- Assignment received from `/root/game2_ultra_art_sound_physics` as a bounded Ultra reference-acquisition task; no redelegation. The parent's assignment identifies the formal Ultra designation. Hidden backend reasoning strength is not independently verified here.
- Repository: `bachikoljunior-blip/game2`; canonical branch `codex/game2-rebuild-20260913`; assigned and locally confirmed base `b06ade1ad5ab8b72de9bb9996f323a063f5db5ef`.
- Recorded at: `2026-09-15T12:08:35.510021+00:00`. Deadline remains `2026-09-20T07:51:53Z`.
- Read `CLAUDE.md`, `FIXED_INSTRUCTIONS.md`, the exact C06 object in `COMPARISON_ELEMENTS.yaml`, `SESSION_STATE.yaml`, `REBUILD_STATE.yaml`, and relevant `FRESH_DESIGN.md` / previous acquisition evidence.
- Fixed reference remains **SK = SEKIRO: SHADOWS DIE TWICE**. No reference selection or four-axis research verdict changed. All ten formal element statuses remain `not measured`.
- C06 remains the whole character/sword unit: form, costume/materials, pose, transitions, weight, cloth and sword behavior in full-body, close, combat, idle, movement, attack, defense and hit contexts. Static shape evidence does not satisfy movement.

## Actual files acquired

This author retrieved **12 original-size JPEGs**, each **1600 × 900**, totaling **3,798,412 bytes**, from the official Japanese game's image gallery. All 12 returned HTTP 200 and were fully decoded with Pillow. Also retrieved 34 official gallery thumbnails (3,646,189 bytes) solely to select relevant original images, plus the public gallery HTML, its viewer JavaScript, system HTML and rights-holder posting-guideline HTML.

Scratch root: `/workspace/scratch/27301e95ee53/game2-c06-reference-20260915`.

- Actual unmodified still files: `originals/NNN.jpg`.
- Exact source URLs, HTTP response headers, actual acquisition UTC timestamps, byte counts, dimensions, decode result and SHA-256: `provenance/original-acquisition.json`.
- Source page hashes: `provenance/source-page-manifest.json`.
- Thumbnail requests/results: `provenance/thumbnail-acquisition.json`.
- Source-labelled inspection sheets: `provenance/source-labelled-selected-contact-sheet.jpg` and `provenance/source-labelled-additional-contact-sheet.jpg`.
- Machine-readable coverage limitations: `provenance/coverage.json`.

These are actual published raster files, not generated lookalikes, remembered images, review scores or descriptive text. I inspected all 12 through their contact sheets and the face image at original dimensions. Their source is official promotional imagery; exact game executable version, PS4 capture hardware, retail-build identity and realtime/cutscene capture conditions are **not supplied by the gallery** and are not established. Some files combine a game-rendered scene with marketing copy. They are useful for bounded visual preparation, not automatically a matched ordinary-play benchmark.

## Provenance and rights handling

The public source is [SEKIRO official MOVIE & IMAGE](https://www.sekiro.jp/movieandimage.html). The site's own [viewer JavaScript](https://www.sekiro.jp/static/js2/movieandimage.js) line 88 resolves the selected visible gallery index to `https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/NNN.jpg`. Downloads used that documented public mapping with ordinary HTTPS GET, without authentication, cookies, DRM, media extraction, proxy changes or access-control bypass. The initial gallery request took about 18 seconds and succeeded; web image fetches returned intermittent internal errors, but ordinary direct GET of the documented official image resources succeeded. No failed access gate was circumvented.

Copyright remains with FromSoftware and other identified rights holders. The gallery displays the 2019/2020 FromSoftware rights notice. Local comparison acquisition authorized by the user is distinct from a license to redistribute protected media. These raw reference images and derived contact sheets are held only in the comparison scratch area; **none is added to the game payload or this repository by this task**. This Markdown may be integrated as provenance evidence by the single integrator. Do not publish the raw images/contact sheets merely because this record contains URLs/hashes.

The [current FromSoftware posting guidelines](https://www.fromsoftware.jp/jp/guidelines_video.html), observed on this date with page-listed last update March 15, 2022, cover specified individual users, key visuals/screenshots and qualifying self-captured gameplay, with conditions on publication and commercial/advertising use. They do not establish that this project's public reuse falls within that scope. They specifically disallow using extracts from the company's videos posted to video-sharing sites. Consequently this task **did not download or cut the official YouTube trailers**. No broad public-comparison/republication permission was inferred from availability. These limitations are concrete source conditions, not a change to the user's fixed comparison rule.

## Selected actual still inventory

All entries use the official page above; each link below is the exact fetched image. The complete hashes identify bytes and are not visual-quality scores.

| ID / file | Visible C06 content and limitation | SHA-256 |
|---|---|---|
| [SK-IMG-002](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/002.jpg) / `originals/002.jpg` | 全身の広い踏み込み、屈曲した脚、上げた刀、倒れた敵。静止した攻撃/敵接触姿勢。 | `5c5ca6df0fea7b4e6eee427c6d345913bdb6e1d68ab666aa3b93616da964dfb1` |
| [SK-IMG-004](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/004.jpg) / `originals/004.jpg` | 近接した両人物、握り・刀身・布・甲冑。右側に「忍殺」と説明文が焼込み。 | `6d96a19add6b33e921221417ab16742864304788159c40982c70a36cdda106e8` |
| [SK-IMG-007](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/007.jpg) / `originals/007.jpg` | 複数の剣士と構え、刀と胴の位置関係。前景人物の脚は切れ、動作判別は不可。 | `aafbc49428531dc78b2add354fdb2d04a1d1cdfd37ed5b2845dbaec78d49a42d` |
| [SK-IMG-008](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/008.jpg) / `originals/008.jpg` | 柱際で静止する全身の人物、足・膝・腰・装束と巡回姿勢の敵。待機ループ自体ではない。 | `83c1e1ac116ca92d3b628add8ef1c6d0b982d0809a2ad2597de5a91c0a5b286b` |
| [SK-IMG-011](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/011.jpg) / `originals/011.jpg` | 空中の全身、伸展/屈曲した四肢と翻った装束、鉤縄。通常の走行代用にはしない。 | `a4327487a74da0e1329dd841d6db7bbcc4997b7735d3c5c799da29fc8715c98c` |
| [SK-IMG-013](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/013.jpg) / `originals/013.jpg` | 後方からの人物と草地。下肢が草で隠れ、全身接地と歩行の資料には弱い。 | `ccdf2eb16bd02dd7ea1d9d44471ad0a2caa74d91177bd04976b2308f146b29be` |
| [SK-IMG-014](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/014.jpg) / `originals/014.jpg` | 顔・頭髪・髭・皮膚・襟・手の近接。右側に人物名「狼」と物語説明が焼込み。 | `feb8e46e4b071c81fcba6f57091aa7d9adb636f0966993209bae430233e2b67e` |
| [SK-IMG-016](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/016.jpg) / `originals/016.jpg` | 敵との近接接触・倒れた敵、刀と腕の位置。被弾からの連続反応は証明できない。 | `c3168611b7615916e54018c914736480d17da4275366b7565b0bd6693e3656e8` |
| [SK-IMG-019](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/019.jpg) / `originals/019.jpg` | 斜面上の脚・鞘・布と対峙姿勢。右下に敵名「破戒僧」と説明文が焼込み。 | `5092a4e400e82e0f1cfc7f8bb69898428bccafb9632d9caecffd026cc6053035` |
| [SK-IMG-023](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/023.jpg) / `originals/023.jpg` | 二者が刀を接触させた近接構図、両腕の握り、胴・膝・布。受け/弾きの一瞬に見えるが時系列不明。 | `7ec6ba03eb49b1003933141e7dc0c2878d7f40bbc4c4cdf406ce98da0beef94b` |
| [SK-IMG-024](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/024.jpg) / `originals/024.jpg` | 斬撃と敵接触、踏み込む全身、脚、衣服、刀身。血の表現を含む。 | `918ad82fd9b03412f5fd8fd689160f85043343c2e06d6d7efaa9e497c730b5cc` |
| [SK-IMG-028](https://media.fromsoftware.jp/sekiro/static/img/movieandimage/images/wide/028.jpg) / `originals/028.jpg` | 複数敵との低い攻撃姿勢。右側に「流派技」と説明文が焼込み。 | `520b70d55c830647c39ddbaa9b4f56ea866fc993c0f78f826eb63871491f8a29` |

## Coverage and source concealment

| Required C06 coverage | What is actually available | Exact remaining gap |
|---|---|---|
| Whole body / character form | 002, 008, 011, 024 show limbs, torso, clothing and weapon together; 014 provides face detail | Same-purpose front/side/back ordinary-gameplay views, controlled light/distance and known capture build |
| Idle | 008 standing pose | Continuous idle, breathing, weight shifts, hand/foot stability |
| Movement | 011 airborne pose; 019 sloped stance | Start, walk, run, stop, turn, planted/swing leg phases at ordinary distance |
| Attack | 002, 004, 016, 024, 028 depict attack/contact poses | Preparation, contact and recovery with uninterrupted blade/hand/body motion |
| Defense | 007 stance and 023 two blades in contact | Sustained guard, timed deflection, recoil and recovery; one image cannot identify the state reliably |
| Hit | 002, 016, 024 include enemy contact/grounded bodies | Protagonist and enemy hit reaction, center-of-mass response, stun/recovery/death transitions |
| Cloth and sword motion | Surface folds, silhouette, hand/blade relationship in stills | Temporal lag, inertia, attachment continuity, contact response and settling |
| Sheathing | No acquired image establishes it | Actual sheathing event, blade path/hand placement and settled idle |

004, 014, 019 and 028 contain burned-in Japanese labels/character names or descriptive copy and are **not anonymous as supplied**. Across the set, the distinctive one-armed figure, prosthetic, facial scar, hair, scarf/costume, opponents and locations can reveal the source even if filenames/text are removed. Those features are also part of C06, so erasing or replacing them would compromise the element being tested. No claim is made that cropping alone can meet strict concealment.

All source mapping, rights text, notes and source-labelled contact sheets remain under `provenance/` or this integrator-only record. No evaluator has received a neutral packet; no evaluator familiarity check, source-recognition gate or preference vote has occurred. A later preparer must supply only independent neutral copies and conditions, keep this provenance separate, and reject a packet if the evaluator can identify its source. **This file must not be provided to a blind evaluator.**

## Avoided duplication and next regular acquisition

The relevant existing repository evidence documents GT/C04 media acquisition and prior C04 anonymous gates; C06 itself explicitly lacked whole-action media. A scoped `rg` inspection found no C06-specific SEKIRO raster/video set in the available repository evidence. The historical GT files are a different reference/element and were not substituted. The pre-existing untracked `AI_DEVELOPMENT/EVIDENCE/fresh-20260913/` was not modified or overwritten. Other workers' source changes were preserved.

The official gallery currently embeds its video items through YouTube, while the official system page supplies still images. I did not obtain an independently downloadable official continuous gameplay file with comparison/excerpt rights in this bounded task. Missing **video bytes**, capture-build identity and full-action coverage therefore remain explicit, not implied by a trailer URL.

The next regular method is a legitimate retail installation and an authorized self-capture, or a rights-holder-supplied gameplay file with explicit permission for the needed comparison use. Do not extract another uploader's video without applicable permission and do not evade authentication, age restrictions, DRM or download controls. No game license, playable installation, existing user capture or explicit third-party comparison license was supplied in this assignment; none was fabricated or purchased.

The acquisition should record the actual game/platform/build, capture resolution/frame rate, controller procedure and original uninterrupted files; include (1) 10 seconds stationary full body plus near-face/hand/sword inspection, (2) continuous start/walk/run/stop/turn, (3) ordinary enemy engagement with attack preparation/contact/recovery, held defense/deflection and both sides' hit responses, and (4) weapon settling/sheathing where the game permits it. Preserve several seconds before and after each action, keep feet, hands and blade visible, and retain the raw provenance separately. Those shot lengths are a capture plan, not new fixed acceptance criteria. Match candidate media to the same purpose only after the reference's actual content is verified.

## Result and integration boundary

**Prepared:** 12 decoded, hashed original official stills, 34 selection thumbnails, source-page receipts and a precise coverage/source-recognition map. **Not prepared:** a valid whole-C06 moving reference packet. No formal blind assessment or quality verdict was performed. C06 and all ten elements remain `not measured`; the four-axis C06 dossier remains incomplete.

Only this new evidence Markdown was written inside the repository. Raw references, contact sheets and manifests are outside it. No runtime source, fixed catalog, automation, remote branch, main, commit, PR or publication was changed by this subtask. The task's remaining files are reproducible private comparison work; the single integrator decides appropriate later preservation under actual rights conditions.
