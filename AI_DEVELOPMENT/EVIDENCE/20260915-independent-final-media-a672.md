独立の有限実媒体レビュー — source a6722c5cf7b1933f1956c6c33ec4edc6adf47640 / CI 34959408734

担当: /root/game2_ultra_finish_validation/independent_final_media

今回の通常入力記録では、石碑前で旧来の頭・上胸全体の継続遮蔽は再現せず、PC-left / touch-left は社の正面へ到着し、合図案内、結末、実際に暖色へ点灯した灯が見えた。枝の画面占有と頭頂・肩への近接／一部重なりは残る。旧位置・全視点の遮蔽閉鎖や枝の減衰動作の成立へ、この結果を拡張しない。

これは単独の実装診断であり、出所を秘匿した参照比較ではない。担当は修正の実装に未関与だが、既存診断記録と関連コードを事前に読んでいる。作者の自己評価、CI成功、画素統計を品質合格の根拠にしていない。全10要素は not measured のまま。自然さ・見応え、音質、実機性能の完成判定は行わない。音は直接聴取していない。

担当受理とUltra指定

親から伝達された正式spawn実引数は task_name="independent_final_media", reasoning_effort="ultra", fork_turns="none", model省略。親の伝達した実受理応答は {"task_name":"/root/game2_ultra_finish_validation/independent_final_media"}。当事者としてこの有限担当を受理し、本稿に記載する読取・実画像検査・報告を実施した。実引数と原応答の取得元は親からの連絡であり、バックエンドの非公開内部実効強度を独立確認したとは主張しない。新しい子孫の起動は行っていない。

出所と検査方法

- 正本入口 CLAUDE.md → FIXED_INSTRUCTIONS.md、SESSION_STATE.yaml / REBUILD_STATE.yaml、関連する758独立媒体記録・provenance・left-arrival-controller-repair.jsonを読んだ。ローカルHEADが指定a672であることを確認した。
- 親が正規に回収した .review/34959408734/fresh/ と experience/ を読んだ。browser-report.json、route-matrix-report.json、recording-report.json、experience-report.json のsourceRevisionはすべてa672と独立確認した。CI全体successとZIP取得照合は親の技術証拠に属する。
- experience artifact 10393525961、ZIP 70,475,946 bytes、sha256 4e50a55b3bfa1f1bcd52f8ec888caf7a6939d22a153c9dc68628e39164b5940e は親からの取得照合報告。下記の実ファイルhashは私が計算した。
- 実画像は元PNGとraw WebMから抽出した時系列サンプル列で確認した。実時間の動画プレイヤー再生や全フレームの実見とは表現しない。1秒／0.25秒間隔などの表示時刻は抽出上の近似であり、world.time、DOM入力の時刻、正確な同期とは区別する。
- 既存758と新a672のold-waystone元PNGを各1枚実見。memory rawの27–62秒を1秒間隔36サンプルで確認し、石碑付近53.0–61.75秒を0.25秒間隔36サンプルで追加確認した。後者は960×540から人物領域320×320+320+140の等倍切出し。接近・停止・離脱を含む。
- PC rawの164–199秒を1秒間隔36サンプル、末尾199–205.5秒を0.5秒間隔14サンプルで確認した。末尾区間は先行列と重複する。touch-left rawは140–179秒を1秒間隔40サンプルで確認した。PC列は640×360、touch列は844×390のゲームviewportを640×296へ縮小。さらに4枚の既存decoded到着／signal-lit元PNGと、rawからのPC205秒、touch179秒・180秒の元解像度抽出を実見した。
- 検査用派生画像は .review/34959408734/independent/ に置いた。初期の全フレーム抽出は必要以上の出力となったため中断し、未使用の途中画像を削除した。この途中抽出を検査済み枚数や全復号の証明に数えていない。

石碑前の所見

758の独立記録が示した対象はold-waystone、raw約26.0–29.0秒の停止中に頭・上胸を太い枝が覆い、29.25秒の離脱で解除する場面だった。旧元PNGでも頭の大半を覆う太い斜枝を実見した。旧記録位置はx=-12.152201271544866,z=-38.75898447460243、world.time=19.066666666666865。

a672はraw約54.5–60.75秒の停止中、頭部の白い帯、首、青い上体・胸、腰から足までの形が継続して読める。旧来の頭・上胸全体を隠す状態はこのサンプル列では再現しない。約61秒に向きを変えて離脱し、後続へ進む。元PNGでも同じ可読性を確認した。

一方、太い枝そのものはほぼ不透明に見えるまま画面を斜断し、頭頂や画面右側の肩に近接／一部重なる。離脱時には前景の紅葉が再び大きく映る。枝が滑らかに減衰・復帰したと、この映像からは断定できない。今回の停止記録はx=-12.243860863506285,z=-38.760253930041856、world.time=18.866666666666877で、旧記録と完全に同一の位置・時刻ではない。従って「今回通常入力の停止列で頭・胸の可読性を確認」が判断範囲であり、旧座標再現試験や全視点の遮蔽解消の代替にしない。

左2経路の到着と点灯

| 記録 | 実画面で確認した順序 | 限定結論 |
| --- | --- | --- |
| PC-left / desktop-continuous.webm | 社の西側で最後の相手と交戦し、倒れた相手の脇から正面の石面へ移動。約180秒以降に合図を送る案内と壁の灯が同時に見える。約199.5秒に結末パネル、約200.5秒以降に灯が暖色へ変化。205秒の元1280×720抽出では点灯した灯・人物全身・「灯、谷へ」本文が読める。 | 社西面で到着できず停止する旧症状はこの通常入力列で再現せず、到着案内と実描画の点灯・結末へ進む。 |
| touch-left / touch-left-continuous.webm | 最後の相手を倒し、社の西側から正面へ移動。約175秒以降に合図案内と「灯す」ボタンが見える。約178秒以降に結末パネル、後続で灯が暖色に変わる。180秒の元844×390 viewport抽出で点灯・人物全身・結末本文が読める。 | 同じく旧到着停止は再現せず、タッチ用の案内・灯す操作先と実描画の点灯・結末へ進む。 |

生の入力イベントを映像だけから同定したわけではない。通常DOM入力と勝利・signalLitの状態記録は同sourceの報告にあり、上表はその到着・点灯が画面に現れることを独立確認したもの。

既存の decoded-desktop-signal-lit.png と decoded-touch-left-signal-lit.png は名前に反して未点灯の画面だった。報告のsignal-lit offsetはPC190.135秒、touch173.695秒だが、その近傍画像だけで点灯を認定できない。rawを後続まで見た結果を優先した。これは同期誤差の観測であり、入力遅延や描画遅延の正確な秒数を測定したとは扱わない。原資料を破棄・改名して差を隠していない。

また、移動中には石灯や看板が身体の一部を一時的に隠す画面がある。到着した人物と灯の可読性の確認を、交戦中の全遮蔽物・刀接触・アニメーション自然さの合格へ拡張しない。

実ファイル識別子

| ファイル（.review/34959408734/以下） | sha256 |
| --- | --- |
| fresh/desktop-continuous.webm | df0d2bce4475d6e40eb42984820bddb390c8d2ff3c8551c5565236d2ca64d0f3 |
| fresh/touch-left-continuous.webm | 3c54123f21bc16e35bd77d4bf3ddb93f72ca27ab40b4dc71d0166b799e657aaf |
| experience/experience-report.json | e0db498c5cf5b8667f7be76234653fc15df1be4ad321b3adc13539d279cba2e1 |
| experience/explore-old-waystone.png | d77d1ef3f88f44292ef8d3dda2d3f4bf71f385dd31340fbf1fb0446de8dfef4f |
| experience/exploration-memory.webm | 4a9b784f67bf61f67f30d1df31f87274aac31fb3223787c246c88e8dc117ba0d |

前2本のhashはrecording-report.jsonの値との一致も確認した。報告には全復号passedと音声トラック0が記載されているが、これを音の自然さやスマートフォン実機性能の合格に使わない。今回、右2経路、14motion全体、残る探索2loop、音声の主観評価は再実施していない。既存修正を再設計せず、remote write・コード変更・automation操作は行っていない。期限2026-09-20T07:51:53Zと全10要素not measuredを維持する。

追加の公開プレビュー検査レビュー — 同じ受理済み担当への有限followup

親から、公開URLのCloudBrowserはGL_VENDOR/GL_RENDERER=DisabledでWebGL contextを作成できず、既存の描画成功GitHub runnerから公開previewを検査する方法へ変更したと連絡を受けた。これは親からの環境報告であり、当担当がCloudBrowserを操作して再現した事実ではない。追加された .github/workflows/fresh-preview.yml と tools/verify-fresh-preview.mjs の2ファイルだけを読み、実行・コード変更・remote write・再委任は行っていない。既存の正式Ultra/none/model省略で受理済み担当へのfollowupであり、新規spawnではない。

P2・具体的な検査欠陥1件: verify-fresh-preview.mjsの53–56行（PC drag）と77–80行（touchCancel）は、解放／取消後のゲーム更新を確認せずswings=0を読み、直後の明示click/button後はswings===1だけを待つ。orbit更新の確認は攻撃入力消費の確認にはならない。もし誤った攻撃が解放／取消後にキューから遅れて消費されれば、その1回を次の明示攻撃の成功と誤認し得る。取消とボタンの間にはscreenshot待ちもある。これはコード上のfalse-positive経路の指摘であり、公開ゲームで不具合を再現したとの主張ではない。

必要な限定修正は、各負の入力検査でイベント送信完了後のworld.timeを基準に後続更新を待ち、攻撃数が不変であることを明示攻撃の前に確認すること。明示攻撃は直前の攻撃数をbaselineにして1増加を確認し、前の入力との因果を分ける。実行前の限定受理にはこの穴の閉鎖が必要。

その他、この2ファイルにはゲーム状態への代入、ゲーム値／到着条件の緩和、公開内容の変更、外部書込は見当たらない。workflowの権限はcontents:read、runtimeとpreviewには固定revisionとの差分gateがある。検査は固定公開URLのHTTP/hash、WebGL描画呼出し、実DOM/CDP入力による開始・PC移動・視点／攻撃分離を対象とし、例外時はexit code1となる。ローカル証拠生成とGitHub artifact uploadは診断結果の保存に限定される。これは公開起動の有限smokeで、実機品質、音の自然さ、全route再検証、全10要素比較を代替しない。

公開プレビュー検査の修正版再読 — 上記P2の読取上の閉鎖

同じ受理済み担当へのfollowupで、親がlocalHEAD ffdb846と示した修正版の同じ2ファイルを再読した。PC drag、touch short/long、touchCancelは、解放／取消の送信完了後に取得したworld.timeを基準に0.3 simulation seconds超の進行を待ってから、イベント前の攻撃数との不変を確認するようになった。その後のPC clickと専用攻撃ボタンは、それぞれ直前の攻撃数を取り直して+1を確認している。上記で指摘した、前の入力の未消費攻撃を次の明示攻撃に取り違える検査順序の穴は、この修正版のコード上では閉鎖した。公開起動の有限smokeとして読取上の限定受理とする。

workflowの固定runtime／preview差分gate、contents:read、HTTP/hash検査、実DOM/CDP入力、例外時exit1は保持されている。この再レビューでもゲームstateへの代入、ゲーム条件の緩和、外部書込の追加は認めない。実行・remote write・コード変更・再委任は行っておらず、公開URLでの検査成功は後続CIの実結果を必要とする。全10要素not measured、音未聴取、実機性能未測定という限定は変わらない。
