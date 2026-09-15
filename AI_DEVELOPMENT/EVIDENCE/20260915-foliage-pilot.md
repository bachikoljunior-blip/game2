# 植物の限定造形修復 — 2026-09-15

## 本人・基点・許可範囲

- 本人: `/root/game2_ultra_art_sound_physics/vegetation_physics`。既存の受理済み Ultra 担当として継続。再委任なし。
- 統合担当からの制作許可を受けた隔離 worktree: `game2-foliage-pilot`、local branch `codex/local-foliage-art-20260915`。
- 基点: `acf0f9ec86996245ad712d6adc72e5d6159f6711`。植物 runtime は実見した `037fd9d10d35453695bb92da8ed47649e1405eae` と同一で、人物修復を含む基点。
- 先の本人動画レビューは共有正本の `20260915-vegetation-physics.md` に保持。この worktree から上書きしない。
- この候補は葉・樹冠・竹先端・植物 proxy・inspection と関係試験だけを変更。人物・音・入力・地形・通路・戦闘・公開 root/docs・固定指示・automation は変更しない。ローカル commit まで許可、remote write は統合担当のみ。

## 実媒体の症状から決めた有限変更

旧媒体の巨大な平面星葉、粗い棒状の枝と平らな幹先、竹上部の裸の稈、反復する櫛形葉束、別の竹幹に隠れた葉寄り撮影へ対応する。新候補の画像・動画はまだ取得も実見もしていない。

1. カエデは実寸の深い五裂葉へ変更。幅の生成指定は 7.3–9.7 cm、葉柄は 2.4–3.2 cm。輪郭は左右を少し変え、葉脈の交点を盛り上げて縁を折り、実メッシュに約 6 mm の奥行きを持たせる。23 triangles / 24 vertices の単葉で、単なる透明画像の板ではない。
2. 従来の 324 細枝へ六対ずつの小葉を個別葉柄で接続し、計 3,888 葉。細枝の始点を主枝に沿って分散させ、主幹は樹冠上部まで細くつなぐ。根位置・幹高・支持階層の数は保持。
3. 竹は 150 本を保持し、六つの葉付き主枝を上部まで分散。稈は連続して細くなり、節帯も同じ半径断面に合わせる。枝から細枝が約直角へ曲がっていた接続方向を親枝に沿わせる。
4. 初案の 36 小葉/本では実寸化に伴う葉面積不足が予想されたため、統合担当の有限追加許可により、各 twig に主軸と短い側枝二本を持つ三群×六葉へ変更。108 葉/本、全竹 16,200 葉、短側枝 1,800 本。単葉は 7 triangles / 8 vertices の披針形で、葉柄・盛り上がった主脈・折れた縁・下がる先端を実形状で残す。長さの生成範囲は約 7.8–11.3 cm（葉身）。
5. 葉の色と葉脈、粗さは起動時生成した各 128×128 RGBA データで共有。外部画像・モデル・ゲーム素材を使わない。落葉も同じ小葉形状と共有テクスチャを使う。

形態・寸法の資料は [Royal Botanic Gardens Victoria: Acer palmatum](https://hortflora.rbg.vic.gov.au/taxon/ad9c508e-5340-11e7-b82b-005056b0018f) と [Kew GrassBase: Phyllostachys edulis](https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:415998-1/general-information)。文章から寸法・形態を参照しただけで、写真・図・テクスチャはコピーしない。谷の竹全体を同定済みの当該種と呼ばず、葉身形態の参考として扱う。形状・表面のコードは本人が作成した独自生成物。

## 物理・遮蔽を保つ範囲

`vegetation-physics.js` と `wind.js` は基点とバイト一致。種別の質量・剛性・減衰、葉の慣性・剛性・減衰、根固定、solver と同一 visible/depth 変形を保持する。形状を短くした枝の各値は、既存の長さに応じた質量/剛性/面積の式から引き続き導出する。幹の根位置・高さ・実効質量・剛性・減衰は全 root support で基点と一致した。

短い竹側枝は、独立した振動モードを追加せず親 twig の連続した変形場に従う短部材近似。実木部も葉柄も同じ場に接続する。20 秒を 1/60 s で進め、0.5 秒間隔で調べた最大側枝の端点間長さ変化は **0.10003%**、竹 twig の最大 tip displacement は **0.00367695 m**。完全な剛体や測定済み植物材料とは呼ばない。支持は **2,317**、mode texture は **112,640 bytes**、vertex shader の mode fetch は従来の三回。

小葉を増やすと既存の twig 単位 proxy が近傍の全小葉を毎回変形し、waystone CPU が初案で 28.40 ms 中央値まで増えた。外側の **1.4 m** bounds、視線の near/far、透明度、hold、fade rate は変えず、各葉の実際の現在 pivot と保守的な最大半径で内側の球検査を追加した。球半径は中心線の弧長＋横方向距離の三角不等式に 6 mm の数値余裕を加える。候補に入った葉だけを同じ物理フレームで変形し、proxy の index と drawRange を限定する。visible geometry の頂点・index は変更しない。

全三角形を変形した参照との **162 ray** 比較で陽性・陰性が一致。詳細変形は **26,546 vertices**、毎回全変形した場合は **4,154,004 vertices**。これは計算の一致と削減の検査であり、自然さの視覚判定ではない。

## 計数と CPU 測定

実際の scene builder を使用し、Canvas の描画と WebGL 提出だけを stub にした。ここでの mesh 数は scene object 数であり、GPU draw calls ではない。詳細は `20260915-foliage-pilot-counts.json` と `20260915-foliage-pilot-cpu.json`。

| 全 scene / 植物 | 基点 acf0 | 最終候補 |
|---|---:|---:|
| 全 scene triangles | 208,928 | 362,190 |
| 全 scene vertices（instance 数込み） | 287,382 | 414,660 |
| 全 scene mesh objects | 243 | 241 |
| 植物 triangles | 141,182 | 293,612 |
| 植物 vertices | 180,628 | 307,138 |
| 植物 batches | 114 | 112 |
| 植物 attribute bytes | 17,340,288 | 32,786,592 |
| 植物 index bytes | 847,092 | 1,761,672 |

追加した葉の色/粗さデータは計 262,144 bytes（mipmap 前）。草 3,000 株・9,000 枚・36,000 triangles、全 grass instance matrix の SHA、最小通路距離 **1.53 m** が基点と一致。根の最大丸め誤差は **4.76366649e-7 m**。

次は Node による同じ静止世界 snapshot の 120 samples（初めの 30 frames を除外）。基点 presentation **および基点 foreground module** を Git の基点から読んで比較した。GPU/device/input の試験ではない。

| CPU render | 基点 median / p95 ms | 最終 median / p95 ms |
|---|---:|---:|
| approach | 3.456 / 4.808 | 2.809 / 4.554 |
| water | 7.900 / 10.514 | 5.418 / 7.713 |
| waystone | 7.311 / 8.741 | 6.656 / 8.390 |

physics のみの 780 samples は基点 median/p95 **3.229/4.721 ms**、候補 **2.441/4.180 ms**。同じ mode 数で solver を速めた変更ではなく、JIT/GC 等の変動を含む測定。候補には単発 43.71 ms があり、実機速度の改善保証には使わない。頂点と三角形は増えており、同一解像度・同一入力の実 CI（既存 180 秒上限）で提出量と速度を確認する必要がある。

## 検査の失敗・修復・撮影条件

- 最初の proxy 陽性試験は旧「先頭三角形」を見ていたが、新形状では細い葉柄だった。実際の上部の葉面へ移し、0/1.7/4.2/7.1 秒で同じ現フレームの陽性・陰性と移動を検査。
- 旧 waystone の枝は細く分散して旧 ray を外れ、期待 7/13 以上に対し 0/13。現木部の実三角形へ ray を当てる陽性、pause、reset と遠方陰性を追加。全 364 本のカエデ支持の実頂点 bind 復元と四つの実空間 cell を引き続き検査する。
- 竹を三つの小葉群にした後、旧 water の「遮蔽なし」期待は 6/13 の実交差となった。各 faded cell を **全頂点を変形した参照**と照合する試験にした。最初の照合で environment clock の既存 +0.1 秒を落とした試験側の位相不一致も検出し、描画と同じ時刻に修復した。各 ray の判定値は変更していない。
- 初回全体 suite は **201/202 pass**。失敗は `const leafCluster=mergeGeometries` という旧変数名の文字検査だった。新モジュールも含めて外部アセットを読まない契約へ更新し、実形状・寸法・支持の試験は別途実 scene で行う。
- inspection は実 twig の根・先端・葉柄付近を狙い、96 候補角度を現在の実木部で ray 検査する。別幹を消さず、settle 後の 8 秒時点で一回選んで固定。0795 の選択評価では自木部を一部または全部除外しており、その範囲での遮蔽は maple 全木 **0/20**、maple 寄り **0/15**、bamboo 全長 **0/25**。これは全木部の遮蔽なしを意味しない。除外範囲と自木部を含む再計数は下の訂正追記に示す。通常の camera/opacity/shadow 状態を選択処理が変えないことも検査。
- 撮影の `renderInspection` は既存どおりゲーム用 fade を base opacity に戻した検査画面。root/tip 投影と選択時の ray は framing の補助であり、全動画の葉の可視性・影・自然さを承認する数値ではない。実動画は従来の maple 12 秒、maple-leaf 6 秒、bamboo 12 秒を維持。人物の非同期リソースとの合流に備え `await view.assetsReady` を撮影 fixture と Node helper に追加した。

## 現在の限界と次の実媒体

新候補を実描画で見たとは言わない。葉の密度、曲面や葉脈が画面に読めるか、細い幹先の輪郭、背景との重なり、個別の葉影、shader error、実 GPU 提出量/速度は次の CI 媒体で確認する。葉の透過・透光を物理測定した材質ではなく、短側枝も独立モードではない。旧媒体との比較は source-known の制作自己レビューで、正式ブラインド比較ではない。全十要素は **not measured**、PS4 品質完成とは呼ばない。

### 最終検証

- `node --test fresh/*.test.mjs`: **203/203 pass**, fail 0、153.665 秒。対象には新しい側枝の両端を実木部頂点が囲むこと、親 twig への接続、小さい長さ変化、162 ray の全変形比較を含む。
- `node node_modules/vite/bin/vite.js build --config fresh/vite.config.mjs`: **pass**、28 modules、3.44 秒。JS は 658.54 kB（gzip 186.79 kB）。既存の chunk-size warning を伴うが、ビルド失敗・shader 実コンパイルの証拠とは扱わない。
- `git diff --check`: pass。公開 root/docs/旧 src・人物・音・入力・wind/vegetation solver の基点との差分なしを確認。
- runtime 編集を凍結。統合後の source での実描画・GPU 提出量・180 秒入力 CI・原動画全復号・制作自己レビュー・独立レビュー・公開は統合担当へ引き継ぐ。ここでは未実施。

## 訂正追記: inspection の診断範囲

本人 `/root/game2_ultra_art_sound_physics/vegetation_physics` が、独立レビューの指摘を受け、統合担当から許可された追加診断修復を `079511e895a1915d36d9eb6bdb0443d168998f64` の上で実施した。新たな造形・撮影角度の調整ではない。

0795 の `occludedRays: 0` は、選択用の除外対象を外した ray 評価だった。全木撮影では対象植物の全支持を除外し、葉寄りでは対象 twig と祖先支持を除外する（同じ木の祖先以外の枝は選択評価へ残る）。`clear woody geometry` という旧 capture の文言は、この限定を読み手へ示せていなかった。

追加修復では選択値を `selectionOccludedRays` とし、`selectionScope` に **other woody objects** と実際の自木部除外範囲を明記した。カメラを選んだ後、同じ ray を自木部・他木部・双方へそれぞれ当て直し、`woodyOcclusion.self / other / all` を別保存する。`all` は union count であり、自他双方へ当たる ray を二重加算しない。`geometryScope` は登録された竹稈、カエデ木部、竹葉 batch 内の木部三角形を対象とし、葉身や他の scene mesh はこの計数の対象外であることを示す。

| 0795 と同じ撮影カメラ・8 秒の検査 | 選択評価 | 自木部 self | 他木部 other | 双方 all |
|---|---:|---:|---:|---:|
| maple 全木 | 0/20 | 10/20 | 0/20 | 10/20 |
| maple 葉寄り | 0/15 | 1/15 | 0/15 | 1/15 |
| bamboo 全長 | 0/25 | 8/25 | 0/25 | 8/25 |

自幹内部を狙う ray を含むため、自木部への交差は一部当然に生じる。この値を自然さ・全葉可視・一般的な視認性の合否へ変換しない。capture の assertion は選択用の除外範囲での 0 だけを確認し、全木部が clear とは主張しない。

検証: `node --test fresh/leaf-surface.test.mjs` **4/4 pass、7.760 秒**。三つのカメラ座標が 0795 の fixture と完全一致すること、自/他/全の再計数、通常の camera/opacity/shadow が変わらないことを確認。`node --check fresh/vegetation-capture.mjs` と `git diff --check` は pass。presentation・葉形状・solver・風・foreground 判定コードは 0795 と差分なし。203 全体 suite の再実行はこの診断差分では行わず、元の成功と区別する。新しい実描画は引き続き未確認で、統合後 CI へ引き継ぐ。
