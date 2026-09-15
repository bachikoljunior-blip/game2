# 中央岩盤・社・舗石の有限制作候補 — 2026-09-15

担当 `/root/game2_ultra_art_sound_physics/c06_reference_material`。受理済みUltraの有限担当を継続、再委任なし。ユーザーのPS4世代ビジュアル目標を保持する。出所を知る制作・形状診断であり、匿名比較ではない。全10要素は未測定、期限 `2026-09-20T07:51:53Z` は変更していない。

## 基点と所有範囲

- 基点 `acf0f9ec86996245ad712d6adc72e5d6159f6711`。
- 隔離worktree `/workspace/scratch/27301e95ee53/game2-scene-art`、branch `codex/local-scene-art-20260915`。
- 変更：`fresh/scene-art.js`、`fresh/presentation.js` の岩盤/社/舗石/地表材質/側岩の呼出しと計数、`fresh/scene-art.test.mjs`、本証拠のみ。
- 衝突定義、route、terrain height、人物、植生、戦闘、カメラ、UI、固定全文には編集なし。原presentationの乱数消費を保ち、装飾moduleは独自hashを用いる。
- ローカルcommitまで。remote push、PR、main、公開preview、automationの操作なし。

## 実画像からの設計と実装

依頼元の `.review/34971788118/fresh/` にある `encounter.png`、`mobile.png`、`mission-victory.png`、`title.png` を実見。中央ridgeは直方体の土台が露出し、その上に同形の球状岩が並ぶ。社は箱を積んだ屋根と平面壁、舗石は細長い同幅の反復が大形を支配していた。

1. **岩盤**：4.4×10の既存衝突矩形を保ち、土中の裾から偏った稜線まで連続する9区画へ変更。端面と中腹の高さを変え、同形球岩列と露出箱台を置換。区画間の断面を共有し、偽の通り抜け穴を作らない。各区画は既存foreground機構へ個別登録する。
2. **社**：足場は既存矩形内。連続した勾配の屋根、軒の厚み、棟、低い瓦の合わせ目、軒下の垂木を作成。前面に梁・柱・奥に沈んだ格子、側面に板と柱、妻面に板と縁材を付けた。geometryは材質別にまとめる。
3. **舗石/地面**：既存265区画の中心・幅と同じ乱数消費を保持し、421枚の長短の石へ分割。角の欠け・縁の面・控えた高さ差を持つ。地表は新しい生成細粒textureを2m反復尺度で使い、旧大粒の紙状模様を細かくした。地形の頂点は変更していない。
4. **側岩**：既存の配置・尺度・乱数消費で、歪んだ稜線を持つ角張った形へ変更。植物の形状・位置・揺れには変更なし。

全形状とtextureは独自にboot生成する。SEKIRO等の参照作品、前担当で取得した人体素材、第三者の美術データを本moduleへ取り込んでいない。

## 実形状表示と未測定の区別

`ridge-shape.png`、`shrine-shape.png`、`paving-shape.png` は実際に生成された頂点・面を `render-shape.py` で描いた**CPU形状診断**。目視済み。WebGLのゲーム画像ではなく、ゲームtexture・影・fog・postprocessを再現しない。社の側壁と舗石の長短をこの形状表示で一度修復し、同じ未描画候補への追加装飾をここで止めた。

最終候補の通常ゲーム画面、モバイル画面、motion-study、現行人物との組合せは**native未判定**。PS4品質、C04/C06合格、見た目の総合改善をこれらCPU画像やテストだけでは宣言しない。

## 検証

- 初期候補に対して `node --test fresh/*.test.mjs`：**201/201 pass**。その後に岩盤高さ配列・社側壁・舗石の分割とCPU計時を調整したため、この201件を最終版全体の再実行とは扱わない。
- 最終候補に対して scene-art / foreground-visibility / terrain / route-layout / presentation-contract：**39/39 pass**、4.86秒。`final-related-tests.txt`。
- 最終 `node node_modules/vite/bin/vite.js build --config fresh/vite.config.mjs`：pass、28modules、JS 657.94kB（gzip186.91kB）。`final-build.txt`。既存の500kB bundle警告は保持。
- `git diff --check`：pass。
- 新規3件は、実三角形の矩形coverageと左右経路の負例、過去記録の人物視線と実表面の陽性透過/reset、既存の停止足位置に社の基壇が張り出さないことを測る。
- 過去PC視点 `(4.6944679627,4.2998959693,-11.6796437363)` の人物rayは新しい低い端では0遮蔽。古い22個岩の20番が遮るという前提を新形状へ強要せず、このclear caseと実三角形へ当てるpositive caseを分離した。既存 `foreground-visibility.js` とその旧回帰testは保持。
- 地形頂点hashは基点と一致。全windSupport/葉geometryの位置hash配列も一致。詳細 `measurements.json`。

## 幾何・CPU測定

`measure.mjs` が基点presentationと候補presentationを同じ依存moduleで各3回生成。Canvas2DとWebGLRendererをstubにした**Node CPU構築**であり、実GPU提出、ゲームframe時間、スマートフォン/実機検証ではない。actorをupdate/renderする前の同じ初期scene段階を比較した。三角形/頂点instance数はInstancedMeshのcountを掛けた構造計数。

| 初期scene構造計数 | 基点 | 最終候補 | 差 |
|---|---:|---:|---:|
| Mesh objects | 243 | 238 | -5 |
| 頂点instances | 287,382 | 358,296 | +70,914 |
| 三角形instances | 208,928 | 231,290 | +22,362 |
| 固有geometry頂点 | 232,592 | 303,506 | +70,914 |

- 新module単体：92,394頂点、30,798三角形、17meshes（うち岩盤9）、舗石265区画/421枚、生成RGBA texture bytes 1,048,576（mipmapとGPU展開は含まない）。
- 全scene CPU構築median：基点 536.63ms、候補 626.00ms。各sampleを記録。順次実行・GC/JIT・共有環境の揺れがあり、実プレイ性能へ外挿しない。
- 候補moduleが所有する生成呼出しだけのCPU時間：122.37, 118.74, 112.83ms。scene内の別担当geometry生成待ちは計時から除く。

## 次の実capture

統合者の単独writerで実描画検証へ進む。candidate SHAと同一buildを使い、既存180秒基準を緩めない。

- PC/touch左右route：title→最初の交戦→左右の岩盤脇→rejoin→社前点灯/勝利。
- 既存motion-studyの頭/足/刀の視線、人物と岩盤の重なり、個別fadeからreset、布の前景。
- 社の壁/軒による新しい遮蔽、屋根裏の表裏、格子のちらつき、瓦線と地面textureのモアレ、舗石の地面接触。
- 通常距離と社到着距離の双方で、人物/植物/周囲の読みやすさと全体外観を観察。CPU形状診断をnative結果として転記しない。

## ソース同定

最終ソースSHA-256は `source-sha256.json`。ローカルcommit SHAは担当の返却応答に記載する。
