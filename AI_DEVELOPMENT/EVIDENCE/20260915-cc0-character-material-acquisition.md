# 人物制作素材の具体候補 — 2026-09-15

担当 `/root/game2_ultra_art_sound_physics/c06_reference_material`。既存Ultra受理下の有限調査、再委任なし。制作素材の選定であり、C06固定参照SEKIRO・PS4世代の品質目標・期限 `2026-09-20T07:51:53Z` は変更していない。本調査でrepo/runtime/remoteは編集していない。

## 結論

**MakeHuman / MPFBのCC0人体を、人物を連続した人体面とスキニングへ作り直す第一候補にする。** 原権利者配布のOBJ、UV、人体骨格定義、頂点ウェイト、形態targets、2048肌、眼球・1024眼texture、短髪・2048髪textureを実取得し、取得OBJそのものから首・肩・顔の表示を作った。球・箱の部品を増やす方法から変更するための具体物がある。肌、目、髪、和装、剣を含む完成キャラクターやPS4品質への到達は未検証。

次点はQuaternius Universal Base Characters無料Standard。作者の実モデル画像とCC0根拠は取得済み、公式無料取得操作も到達したが、122MB ZIPの受領確認に失敗しており、実glTF/FBXを取得済みとは扱わない。無料モデルの筋肉質な様式化と顔立ちは、そのまま和装の写実剣士には適合しない。

## 候補比較

| 候補 | 実取得・形式 | 権利根拠 | 品質/工程上の意味 | 不足 |
|---|---|---|---|---|
| **1. MakeHuman / MPFB core** | 公式44,656,319-byte archive。`base.obj`、UV、53骨GameEngine rig JSON、weights JSON、1,258形態targetと2分類JSON、2048肌/1024眼/2048髪texture・眼球と髪OBJ。便宜的なbody-only GLBを本担当が作成 | 原権利者のCC0明示、core/outputとソースGPLを区別 | 首・鎖骨・肩、眼窩・鼻・口、手指が一つの人体mesh系。実body 13,380頂点、13,378quad / 26,756tri。パラメータで独自顔/体形へ変更できる | まだneutral形状。眼球/歯/肌/髪/和装未装着。53骨は独立JSONで、取得OBJ/便宜GLBに実際にバインドしたわけではない。実アニメーション・接地・握り・可動部変形を未検証 |
| **2. Quaternius Universal Base Characters Standard** | 公式提供FBX/glTF/OBJ。無料版紹介画像を取得・目視。ZIP downloadは実操作後60秒でbrowser実行がtimeoutし、受領パスなし | 作者公式配布ページCC0。無料版と有料Source版を区別 | 作者公称平均13k triangles、Humanoid rig、retarget対応。公式無料版画像は男女2体と髪5種、連続した首肩/顔/指を持つ | 実ファイルのtriangle数・骨数・texture解像度・animationを未測定。無料版に通常体形6種類全部が含まれるとはいわない。和装・剣戟動作なし。様式化から写実品質への作業は必要 |

## 1. MakeHuman / MPFB — 実物と一次権利根拠

- [公式ライセンス説明](https://static.makehumancommunity.org/about/license.html)
- [原権利者GitHub LICENSE.md](https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md)
- [CC0全文 LICENSE.ASSETS.md](https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.ASSETS.md)
- [実取得した公式archive](https://codeload.github.com/makehumancommunity/mpfb2/zip/refs/heads/master)
- [公式export手順](https://static.makehumancommunity.org/mpfb/docs/exporting.html)
- [公式CC0 system assets一覧とdownload](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)

ライセンス原文の短い根拠：**“These assets have been released under CC0 1.0 Universal.”** 対象としてbase mesh/proxy、targets/modifiers、textures、clothes、rigs/poses/expressions、mesh情報JSONが明記される。出力のモデル/画像/FBX等への権利を主張しないことも明示されている。ソースコードはGPLv3であり、これをゲームへ取り込む話と、CC0の素材/出力を取り込む話を分ける。今回ゲームへソースコードをコピーしていない。

`master` の移動するURLを取得したため、再現にはURLだけでなくarchive hashと抽出ファイルhashを使う。取得archive SHA-256:

`e82923cd5a8b5fe2587605419a6d9bdd3c3757fcdb11248e14137d868b3d82b9`

| 実ファイル | Bytes | SHA-256 |
|---|---:|---|
| `assets/mpfb-core/base.obj` | 1,749,303 | `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c` |
| `assets/mpfb-core/rig.game_engine.json` | 40,936 | `b324ddb4b707721c19630bfadb87c3e3b38eed3b6e4590bb3cead43ea918f799` |
| `assets/mpfb-core/weights.game_engine.json` | 3,026,778 | `9f4a773e74ce5ba08415b4f30070338e9f75bae5971b5075b10cd6b9caa58473` |
| `assets/mpfb-core/body-geometry-only.glb` | 643,332 | `849795d60fe2f9e80bef86d07ddb5f94498a0f5b7fb15d4bc17c786e60650ce2` |

原OBJ全体には19,158頂点 / 18,486polygonとhelper/joint geometryを含む。body groupだけを数えると13,380使用頂点 / 13,378quad、三角化後26,756tri。53骨はRoot込みの実JSON key数である。先行メッセージの52骨は誤記として訂正した。head、neck、clavicle、upper/lower arm、hand、指3節、pelvis、spine、legs/feet等を含む。

便宜GLBは原OBJのbody groupを三角化して滑らかな法線を算出した**形状確認専用**。UV、texture、skinning、animationsを付けていない。原OBJの単位・座標を保持しており、人間のメートル尺度を設定済みではない。これをゲーム投入用の完成GLBと扱わない。原OBJとUV、原骨格/weightsを保持した。

### 実取得meshの画像

- `previews/mpfb-native-head-shoulders.png`: 取得したOBJを直接ソフトウェアで表示。灰色の単純材質、20度方向。首肩と眼窩・鼻・口の面を読める。
- `previews/mpfb-native-front.png`: 同じOBJの全身正面。
- 再生成コード: `provenance/render_body_preview.py`。

これは作者の宣伝画像でも画像生成でもなく、取得頂点・面から作った実モデル表示。ただしThree.jsゲーム内の照明・素材・スキニング・モバイル負荷を測ったものではない。

### 使用可能な制作経路と残る実装

公式exportガイドはGameEngine rig、テクスチャベースPBRのGameEngine材質、helper削除、shape key bake、必要なら低解像度proxy、FBX exportを案内する。モデルをBlender/MPFBで独自の成年男性の比率・顔へ整え、目/歯/肌/眉/髪を装着し、オリジナルの和装を作り、53骨をバインドしてからFBXまたはBlender標準glTF/GLB出力へ進める。OBJ/rig JSONをそのまま既存の剛体部品rigへ押し込む方法を推奨しない。

現在の環境には `blender` 実行ファイルがなく、MPFBを起動して肌つき完成人物をexportしてはいない。採用時は正規のBlender配布/実行環境で変形確認を行うか、公式データ仕様を保った別の実装経路を独立検証する。静止時の連続性だけでは、肩の挙上、肘膝屈曲、指の握り、まぶた、布の食込みは解消したといえない。

以前の「boot時生成・外部runtime assetゼロ」という方針を、本調査だけで変更したとは扱わない。素材をJSへ埋め込むだけでその方針を守ったと呼ぶこともしない。実制作へ採用するかは最新の制作指示を適用する統合担当の判断範囲で、本担当は調査・取得・検証物を渡す。

## 2. Quaternius — 明確な無料版、未受領範囲

- [作者公式紹介](https://quaternius.com/packs/universalbasecharacters.html)
- [作者公式配布](https://quaternius.itch.io/universal-base-characters)
- [実取得した無料版モデル画像](https://img.itch.zone/aW1hZ2UvMzgyMjI1OS8yMjgzNDE5MS5wbmc=/original/ykS%2F9D.png)
- [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

作者ページの短い原文：**“Free to use in personal, educational and commercial projects. (CC0 License)”**。

実画像 `previews/quaternius-standard.png` は1,618,727 bytes、SHA-256 `1103be343aafc740fa18bf8f7d291af756c273298449eb7112bd2951abdcf43a`。無料版の男女2体/髪5種を実見した。無料版が完全な6体全種類という誤解を避ける。Source版は別の有料枠で、未購入・未取得。

公式ブラウザでDownload Now → No thanks, just take me to the downloads → Standard Downloadへ進んだ。ログイン・email・決済は一切行っていない。download完了待ちが60秒でtimeoutしブラウザ実行状態がリセット、同期済みZIPも確認できなかった。したがって**無料download経路は確認、ZIPの実受領・中身・native renderは未確認**。別作者による再配布repoから穴埋めしない。

## 採用対象から除外した高精細スキャン

[Renderpeople無料rigged人物](https://renderpeople.com/free-3d-people/)は作者公称10–15k quad、8K diffuse/normal/gloss/alpha、skinned skeletonを持ち、FBXへの公開downloadリンクがある。[現行規約](https://renderpeople.com/general-terms-and-conditions/)4.1(b)は商用ゲーム用途を含む一方、4.3(b)はモデルを単独ファイルとして容易にdownload/extractできる提供を禁じ、4.2(b)も原形/改変の第三者移転を制限する。このため、公開repoや単独GLBを配信する今回の構成への再配布を明確に許す候補には数えない。形式を変えるだけでこの制限を回避しない。

公式実モデル画像は `previews/renderpeople-rigged.jpg` に取得して読んだが、実モデルZIPは取得していない。人体の写実度が高いというだけで再配布可能なCC0素材と混同しない。第三候補を埋めるために条件を弱めない。

## 検証範囲

- 第一候補の原archive/OBJ/rig/weights/権利文書を実取得、ハッシュ化。OBJをparseしbody topologyを実測、実表示を生成して目視した。
- 第二候補は作者の無料モデル実画像と無料download UIまで確認。ZIP/native model/texture解像度の測定は未完了。
- ゲーム抜き取り、SEKIROの参照媒体転用、無断購入、ログイン資格情報利用、取得制限回避は行っていない。
- SEKIROとの匿名比較、PS4到達、ゲーム統合、スキニング・アニメーション品質の合格を主張しない。


## 追加取得完了：実肌textureと眼球素材

公式system-assets ZIPは280,737,770 bytes。最初の全体取得とmirror1の大きい範囲取得は長時間完了しなかったため、自分の転送を停止した。公開サーバーの正式なHTTP Range対応（206、Accept-Ranges/Content-Range）で中央ディレクトリを読み、公式ページに併記されたmirror2から必要な3.67MBだけを取得した。両mirrorは同一の総size・Last-Modified・ETag `10bbb7ea-6160e7c0d7996` を返した。認証/DRM/ネット制約を回避したものではなく、公開配布の正規部分取得である。**一括ZIP全体を取得したとは扱わない。**

- 実肌: `assets/mpfb-system-sample/skins/young_asian_male/young_lightskinned_male_diffuse3.png`。**2048×2048 PNG / 3,593,099 bytes**。SHA-256 `f50016a5507fc687dc8df06599c8ea48de950cd185de33a71cafc1319ddab4d5`。全画素decodeとZIP member CRC32一致を確認。
- 対応材質: 同じディレクトリの `young_asian_male.mhmat` / 1,452 bytes。実ファイル内にも2020年9月CC0公開の説明・原権利者・上記diffuse texture参照がある。
- 作者の実モデルthumbnail: `previews/mpfb-official-young-asian-male.png`（原thumbと同一bytes、256×256）。灰色native previewとは別で、作者が肌を載せた状態の小さい見本。
- 眼球用実OBJとfitting記述: `assets/mpfb-system-sample/eyes/low-poly/low-poly.obj`（6,604 bytes）、`low-poly.mhclo`、`low-poly.thumb`。既取得ZIP末尾の正規範囲から復号しCRC32一致。まだ人体へ装着していない。
- 個別出所/ハッシュ/CRC記録: `provenance/mpfb-system-sample-files.json` と `provenance/mpfb-eye-files.json`。

これにより**core人体mesh / rig / weights / CC0原文 / 実2048肌texture / 実眼球OBJ / native形状preview / 作者肌thumbnail**を一式で具体的に渡せる。今回の肌サンプルはdiffuse一枚であり、4K/8Kの完成PBRセット、毛穴normal、roughness、皮下散乱のゲーム実装を取得・検証したとはいわない。native previewと便宜GLBは引き続き未着色・未rigで、肌を装着した完成人物のexportは次の作業である。

## 制作担当への追加素材引渡し：成人形態・眼・短髪

今回のデータは**原権利者から取得したCC0素材**であり、本担当が生成した人体・肌・髪とは記録しない。便宜GLBとnative表示だけは本担当による取得データの変換物である。素材情報を `/root/game2_ultra_art_sound_physics/character_art` へ直接共有した。制作担当の隔離試作先は `/workspace/scratch/27301e95ee53/game2-mpfb-pilot`。本担当はそのrepoを変更していない。

### 成人形態データ

`assets/mpfb-targets/` に公式MPFB archive内の .target.gz と分類JSONを原パス構造で抽出。**1,260 files / 36,584,831 bytes**。1,258個のgzip差分を全解凍し、行形式と原OBJの0-based頂点index範囲 `0..19157` を確認した。空の差分もあり、平均体格などのno-opを欠損扱いしない。全ファイルの元archive member、SHA、使用indexは `provenance/mpfb-targets-files.json`。CC0適用範囲は既取得 `assets/mpfb-core/LICENSE.ASSETS.md` に明記される。

具体的なasset ID（このroot以下）:

- `macrodetails/asian-male-young.target.gz`：成人側の男性形態。19,150頂点差分、SHA `0928ed8b9f08f60afb9884cf9e9f33a939ed3a85d7f136de9ccc88a76981d6d7`。
- `macrodetails/asian-male-old.target.gz`：加齢側形態。19,150頂点差分。
- `macrodetails/universal-male-young-maxmuscle-averageweight.target.gz`：筋量側差分。6,825頂点。平均筋量/平均体重の同系列targetは空の正常no-op。
- `head/head-age-incr.target.gz`：局所顔の加齢差分。3,195頂点。
- `neck/neck-scale-horiz-incr.target.gz`：首幅差分。702頂点。
- `macrodetails/macro.json` / `target.json`：年齢・男女・筋量・体重・身長等の補間と局所分類。

gzip展開時の各行は `index dx dy dz`。原OBJの頂点座標へ重み付き差分を加える。公式Blender readerは座標系変換として `(x, -z, y)` を行うため、原OBJ座標で処理する時にその変換を二重適用しない。参考コードは取得archive内 `src/mpfb/services/targetservice.py` の `_target_string_to_shape_key_info`、`calculate_target_stack_from_macro_info_dict`、`reapply_macro_details`。コード本体はGPLであり、仕様を確認するために読み、ゲームへコードをコピーしていない。`asian` 等は作者のasset IDであり、これだけで独自人物の顔や日本の時代人物への適合が完成するとは扱わない。

### 眼・短髪

公式system assetsの公開HTTP Range取得を継続し、全memberのCRC32、SHA、画像decodeを確認。記録 `provenance/mpfb-brown-eye-short-hair-files.json`。

| 実asset ID（`assets/mpfb-system-sample/` 以下） | 実測 | 許可・適用情報 |
|---|---|---|
| `eyes/materials/brown_eye.png` + `brown.mhmat` | 1024×1024、610,817 bytes。PNG SHA `4659691c7295ad6206c78b003e5fd0e5f91dcd53032fa914a229bb48cabe424b` | `.mhmat` にSep 2020 CC0・原権利者とtexture参照を実記載 |
| `eyes/low-poly/low-poly.obj` + `.mhclo` | 96頂点、86quad / 172tri | UUID `1cc97a30-85a1-42e6-a9f7-b3e753732baa`、basemesh `hm08`。材質は `../materials/brown.mhmat` |
| `hair/short04/short04.obj` + `.mhclo` + `.mhmat` | 865頂点、525quad / 1,050tri | UUID `e09bfd91-f83f-4f9a-ba8c-4635cd1ae0d8`、basemesh `hm08`。各記述にCC0・原権利者 |
| `hair/short04/short04_diffuse.png` | 2048×2048、2,308,132 bytes。SHA `0bef7fc0e403db5a40fabb2111ebfa6f7e8158e204c6e56b8da98e9ef527846e` | 髪用透過材質。原`.mhmat` の `transparent True` / `backfaceCull False` 等を確認。実際のThree.js alpha/depth見えは未検証 |

`previews/mpfb-official-short04.png` は作者の髪thumbnailを同一bytesで保存し目視したもの。短髪のhair cardsで、髷や和装人物の完成髪型を取得したものではない。

**位置合わせ上の具体的な注意:** low-polyの `.mhclo` は `verts 0` 以下に原OBJの眼helper頂点（14598..14738等）を直接参照する。body-onlyへ切り出した後の連番へ当てると別頂点になる。元19,158頂点で形態targetを適用し、元indexと眼helperを保ったまま眼を合わせてから部位を抽出する。髪の`.mhclo` は3頂点と重み/offsetを使うfittingを持つ。髪や眼をneutral座標のまま成人化した頭へ置いた結果は適合検証済みとは扱わない。

本調査の素材取得はここで完了。描画、UV適用、部位接続、握り、スキニング、和装、剣戟、PS4品質到達の判断は制作と実測に引き渡す。
