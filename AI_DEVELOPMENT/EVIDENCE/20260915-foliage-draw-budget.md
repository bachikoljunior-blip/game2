# 植物の描画負荷 — 有限診断と撮影キュー修復

本人: `/root/game2_ultra_art_sound_physics/vegetation_physics`、受理済み Ultra 担当継続、再委任なし。統合担当が報告した source は `e18820165d6008fedfca28d2cc7073a9c4b74b28`。remote は操作せず、隔離 `game2-foliage-pilot` の `e635154aed068c5e903d56d384c7e3be80cd1f64` から許可範囲を修復する。

## 原因候補（GPU 時間は未測定）

統合担当から、e188 は画像アセットの decode と start 成功後に screenshot 15 秒 timeout、22.57 秒の実状態で frame 23 / world 2.55、389 calls / 523,520 triangles と報告された。植物 capture も最初の screenshot が timeout、maple は 0 recorded frames。人物単独の 40 PNG は成功。これらを自分の実 GPU 測定とは記録しない。

source と自分の既存 scene 計数から、植物は acf0 の 141,182 から 293,612 triangles（2.08 倍）、180,628 から 307,138 vertices（1.70 倍）。葉面だけでは 79,488 から 222,912 vertices（2.80 倍）、53,640 から 202,824 triangles（3.78 倍）となる。カエデ単葉の実寸化と樹冠の再接続による葉面数増加が大きい。

葉の各頂点では mode texture 三回取得と、同じ葉で共通する慣性応答を含め約十一個の sin/cos が反復される。毎回の主描画と shadow-map パスで位置変形が必要になる。影は従来の 2048²、全植物が caster のまま。材質には色・粗さの fragment texture 二回取得も追加された。テクスチャ自身は各 128² で、通信や decode の大きさとは別の費用である。これらは具体的な負荷増分であり、原因別の実 GPU 時間を測定した証拠ではない。e188 には人物と景観の追加変更もあり、全 523,520 triangles を植物だけへ帰属させない。

## 第一の限定修復: 画像のない settle を描画しない

旧 capture は 96 回の settle で毎回通常カメラと inspection を二回描画し、初 screenshot 前に 192 全景 draw を enqueue していた。記録中も通常 draw と inspection draw の二回だった。植物量の増加でこの GPU queue が初 screenshot を遅らせる可能性がある。

- presentation の `render(world,dt,orbit,{draw:false})` は最後の GPU 提出だけを省略する。物理、アニメーション、接地、草・葉・落葉、影カメラ追従、通常カメラ、foreground、診断の更新は同じ順序で実行する。既存のデフォルトの呼び出しは一回描画を維持。
- capture は同じ 96 回・同じ dt で通常更新を行い、settle 中は GPU 提出ゼロ。記録フレームでは通常 draw を省き、同じ inspection カメラで一回だけ描画して screenshot を await する。
- 解像度、物理刻み、葉形状、葉数、支持、カメラ選択、風、影の設定、入力経路、timeout の値は変更しない。

検証: `node --test fresh/vegetation-capture-update.test.mjs` **1/1 pass（6.201 秒）**。96 回後の全 mode texture、actor/contact 診断、camera/foreground 診断、全 scene transform/opacity が通常更新と一致。通常経路は 96 draw、draw:false は 0 draw、記録フレームは inspection 一回だけ。その後デフォルト呼び出しへ戻すと通常 draw が復帰する。capture syntax と `git diff --check` も pass。

この修復だけで通常 play の遅さが解消したとは言わない。GPU queue 原因の確定と最初の原画像取得は CI で確認する。通常 scene の費用には、全葉数・支持・風場を保った画面上の寸法に応じる近景高詳細／遠景簡略化を別 commit で扱う。新しい GPU 測定・画像レビューはまだ未実施。全十要素の正式判定は not measured を維持する。
