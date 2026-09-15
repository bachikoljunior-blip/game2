# KAGEROU 陽炎 — current direction

## 最新の直接指定：親の強度は問わず、全実作業をUltraの子へ
<!-- ULTRA-CHILDREN-20260914-v3 BEGIN -->

指示ID: `ULTRA-CHILDREN-20260914-v3`。最新ユーザー原文:「親はなんでもいい。子に全部やらせればいい。」「そしてgame2を停止してからQを有効にして」。以前の確認後の有効対象指定は第6項で更新する。
進行中の主制作と今後の定期実行の両方に適用する。旧v2・v1を含む下記の委任方法・親の役割・確認条件・最新指定に基づく有効状態に関する競合規則は本節で更新する。制作目標・品質基準・開始日・期限・期限評価・継続/復旧・毎回のmain反映・公開条件・安全制約と別セッションの最新変更を保持する。

1. 親のモデル/推論強度は何でもよい。親の強度の変更・確認・スクリーンショットをユーザーへ要求せず、親の強度不明を阻害要因や完了条件にしない。親は正式な起動・連絡・結果受渡しと、子が確定した具体的操作を権限上親でなければ実行できない場合に機械的に実行して原応答を返す最小限の調整だけを行う。

2. 計画、優先順位、継続/期限判断、調査、設計、素材・参照資料の選定、実装、修復、試験・比較・独立レビュー、統合判断、main反映、報告まで全実作業をUltra指定の子へ渡す。自立した有限の担当単位を一人のUltra進行/統合担当へまとめ、必要な独立部分だけを他のUltra担当へ分ける。全ての新規の子・孫は正式な `collaboration.spawn_agent` に `reasoning_effort="ultra"`、`fork_turns="none"` を実引数で渡し、`model` は省略する。役割、対象repo・基点SHA、最新正本の取得経路、固定基準・期限・許可範囲、正確な継続地点、編集範囲、検証と成果の返却条件を自立したmessageで渡す。軽い・監視だけという例外や、非Ultra/強度未指定への黙ったfallbackを設けない。

3. Ultra統合担当が意思決定、実作業、成果・検証・統合を担当する。リモート実行権を子へ移すのは、既存の単独writerの未完了操作が終わり、排他的な引継ぎを確認した後だけとする。親でなければ使えない操作のみ第1項の方法で既存の単独writerが実行する。親子や別の主実行による二重書込み・二重制作をせず、最新head・必須検証・正規権限を守る。既存の受理済みUltra担当の正当な引継ぎを活用し、marker更新だけで再起動しない。非Ultra/指定未確認の旧担当は最初の安全な区切りで未保存差分、途中成果、進行中ツール、未完了操作、検証済み地点と次の作業を保全して移す。元の主制作を外から強制停止・置換しない。

4. 実行確認は、元の本制作で全役割がUltraの子へ割当済みであることと、実spawn引数・受理応答/担当ID・当該担当の具体的な仕事、成果/検証/統合の証拠を対応付けて行う。実際の当事者が既存の状態記録と必要最小限の証拠へ残し、確認側は受理や成果を代筆しない。既存v2の実記録もこの役割分担を満たせば利用でき、v3の文字追記を待たない。今は不要な工程の実施、ゲーム全体の完成、全比較の合格まで確認を待たない。未着手の必要工程もUltra担当を明示し、実施済みの証拠に数えない。今は不要な工程は理由を明示する。旧v1の一部委任、指示保存、CI成功、本設定/監査会話の子の起動だけを本制作全体の証拠にしない。バックエンド実効強度が表示されなくても、実Ultra指定の受理と仕事が確認できた範囲で「全実作業をUltra指定の子へ委任した」と判定できる。非公開の内部強度は断定せず、親の強度未確認を理由に確認を再び止めない。

5. 匿名評価・独立性・固定品質基準・正規の取得/生成/検証手段を保持する。任意に選んだ非UltraのLLM評価・比較はUltraの独立した子へ移す。評価者には出所や自己評価を漏らさず匿名化済みの実資料と条件だけを渡す。Git・ビルド等の非モデル道具や画像/音声専用モデルに架空のUltra設定を付けない。その計画・素材選定・品質判断はUltraの子が行う。変更不能な必須の外部モデル、Ultra非対応/拒否、受理後の状態不明は実応答と対象範囲を正確に残し、下位強度をUltraと称さない。既存の受理済みUltra作業と安全な成果保全、競合しない実行可能なUltra作業は継続する。

6. この切替は今回のユーザー指示を受けた単独writerが一度だけ担当し、各automationの今後の定期実行に3件の切替権限を与えるものではない。最新ユーザー原文「そしてgame2を停止してからQを有効にして」に従い、全実作業のUltra子への委任確認を待たず、最新の `automations.peek` で対象IDと状態を再確認し、game2 `6aa4047ea44c8191aa35d6c428969a7a` を `is_enabled=false` に保存し、無効であることをreadbackで確認できた場合に限り、その後Q `6aa72048f4388191a7448b249cf6578d` を `is_enabled=true` に保存してreadbackする。完了済みの指定状態を再保存せず、確認・保存が失敗した場合はその状態変更を止めて実応答を報告する。Qの有効化失敗を理由にgame2を再有効化しない。survival `6aa71e69ffec81919e059ecff6d98f82` の有効状態はこの指示で変更しない。旧「3件の委任確認後にgame2のみ有効・survival/Q停止」と旧game2専任担当による条件付き復帰処理は取り消す。全実作業をUltraの子へ委任する第1〜5項は維持する。ユーザーの新しい直接指定がない限り、下記の旧復旧文・継続文・状態記録や後日のUltra確認を根拠にgame2を再有効化したりQを停止したりしない。第1・3項の権限と単独writerを守り、完了済みの切替を繰り返さず、現状態とreadback根拠を報告する。削除せず一時停止し、この切替ではgame2/Qの有効状態以外の予定・title・timezone・survival・O・無関係なautomationを変更しない。無効化を実行中プロセスの強制終了の証明とは扱わない。

7. Ultra委任の未確認分は、現在有効な既存定期実行または既に進行中の正当な制作のUltraの子が、それぞれの既存タスクと許可された範囲の正規GitHub読取で確認し続ける。確認のために停止済みのautomationを再有効化せず、専用watcherや重複producerを新規起動しない。読取先は bachikoljunior-blip/survival の `claude/repo-instructions-constraints-r0070m` の `AI_DEVELOPMENT/SESSION_STATE.yaml`、bachikoljunior-blip/game2 の `codex/game2-rebuild-20260913` の `AI_DEVELOPMENT/SESSION_STATE.yaml`、bachikoljunior-blip/Q の最新mainの `docs/PROJECT_STATE.md` と各実証拠。旧ゲーム/旧PR10へ戻さず、他repoの状態や成果を代筆せず、確認範囲・根拠URL・未確認点を制作会話へ報告する。変化のない未確認通知を繰り返さず、確認中も許可済みで競合しない制作と各回のmain反映をUltraの子の判断で進める。新規automationは作らない。

<!-- ULTRA-CHILDREN-20260914-v3 END -->

対象は bachikoljunior-blip/game2。制作正本は codex/game2-rebuild-20260913 の最新、入口 CLAUDE.md、継続状態 AI_DEVELOPMENT/SESSION_STATE.yaml。現在の設計先行の新規制作と固定指示を維持し、旧ゲーム/旧PR #10を主経路へ戻さない。指定制作ブランチへの保存と各定期実行のmain反映を保持する。

Read `AI_DEVELOPMENT/FIXED_INSTRUCTIONS.md` first, then `AI_DEVELOPMENT/REBUILD_STATE.yaml`.
Latest direct instruction: rebuild the game from zero. Define the desired design and
component requirements first; only then inspect and selectively reuse matching old parts.
Do not inspect the old game first and use it as the new design. This supersedes the
earlier optional-rebuild clarification. Read `AI_DEVELOPMENT/FRESH_DESIGN.md`.

The active implementation branch is **codex/game2-rebuild-20260913**. Fetch its latest
head. Old PR #10 is preserved history and a possible source of narrowly needed parts,
not the main implementation path. New runtime progress is recorded in SESSION_STATE.
`AI_DEVELOPMENT/SESSION_STATE.yaml` names the exact next work. Preserve other writers.
Deadline: **2026-09-20T07:51:53Z**. No human intervention or response waiting.

## Product concept

Build a game at the level of a shipped AAA console title. The bar is Ghost of Tsushima
and SEKIRO: Japanese sword action, third person, mobile-first with desktop support,
in Three.js. Every runtime texture, mesh, animation and sound is generated at boot,
with zero external runtime assets. The mountain shrine, bamboo valley and autumn
magic-hour setting remain the creative brief.

Each concept element needs its own justified reference and actual blind comparison
under the fixed instructions. All elements must be satisfied; a working build or a
technical CI PASS is not completion. Do not copy reference content into the game.
Read `AI_DEVELOPMENT/COMPARISON_ELEMENTS.yaml` for the fresh comparison catalog and
explicitly unresolved reference research; historical technical results are separate.

## Execution

The fixed instructions and the user's explicit deadline, no-human-intervention and
concurrency directives govern. Implementation, tooling and order of work are the AI's
choice. Architecture, 62 technical tests, round machinery and plans are supporting
material, not additional fixed instructions. Follow the new design-first rebuild direction.
Do not claim old implementation evidence or simulated hardware timing for the new game.

Standing authorization covers verified checkpoints, main integration and GitHub Pages
publication. Keep the existing public payload until a replacement is verified. Read
remote heads before editing and publication; never force push. Record exact evidence,
limitations and the next action. Continue from unfinished work rather than duplicating it.


## 進行中の実行にも適用するUltra委任（2026-09-14）

指示ID: `ULTRA-LIVE-20260914-v1`。
ユーザー原文:「現在進行中の実行もそれに切り替えて」。
「それ」は、制作・修復・調査・検証の実作業をUltra指定のサブエージェントへ担当させ、既存の親実行が成果を確認して保存・main反映を行う方式を指す。この指示は次回の定期起動だけでなく、既に進行中の主制作にも適用する。

- この指示を受領した既存の主実行は、現在の作業・未保存差分・実行中ツール・受理済みの子・検証結果・正確な継続地点を保持し、最初の安全な作業境界から新しい担当単位をUltraへ切り替える。定期起動を待つ必要はない。切替のために正常な主実行を停止・再起動・置換したり、既に進行している同じ作業を重複実行したりしない。
- 利用可能な正式な `collaboration.spawn_agent` に、`reasoning_effort="ultra"` と `fork_turns="none"` を実際の引数として渡す。`model`は省略して現在のモデルを継承する。`task_name`と自立した`message`に、対象リポジトリ、基点SHA、最新指示と正本の取得経路、固定基準・期限、正確な未完了地点、具体的で有限な担当範囲、編集場所、検証と成果の返却条件を含める。文中にUltraと書くだけで設定した扱いにしない。
- 親は独立した読み取り・調査・統合準備を進め、親子で同じファイルやブランチを同時編集しない。子には隔離した作業場所または明示した編集範囲を割り当て、リモートpush・main更新・PRマージ・公開・オートメーション変更は委任しない。既存の統合担当が成果を確認し、指定保存先と最新head・必須検証を守ってmainへ反映する。他の正常な主制作が存在する場合は、その実行を維持し、Ultra担当は競合しない固定SHAのレビュー等に限定する。
- 独立評価が必要な場合は実装担当と評価担当を分ける。ブラインド比較の評価者には匿名化した実資料と評価条件だけを渡し、出所・開発側の自己評価を漏らさない。
- 各担当単位の切替前に最新リモートのこの節と既存の継続状態を再確認する。受理した主実行自身が既存の状態記録へ指示ID、受理時刻、切替地点、指定引数、子のIDと受理結果、成果の基点／対象SHA、検証とmain反映結果を記録する。指示ファイルへの保存だけを、主実行の受理や切替完了の証明にしない。
- 子の状態が不明なら同じ作業を重複起動せず、子と受理済み操作を確認する。利用できない・非対応・拒否の場合は実際の応答を残し、未受理または終了確認済みの作業は親が許可済みの範囲で継続する。黙って別モデル・下位強度へ変更してUltraと称さない。実効強度がツール結果で確認できなければ、Ultraを指定して起動が受理された事実と、実効強度の独立確認が未取得であることを区別する。

この追加は委任方法の変更である。既存の主実行・所有権・再開地点、別セッションで更新された最新方針、コンセプト・品質基準・期限・期限評価・main反映・公開範囲・正規権限と安全条件を保持する。親実行そのもののモデルや推論強度を変更したとは扱わない。


## 最新の直接品質修正 — 2026-09-15

ユーザー原文：「どんだけ風吹いてんの？おと。足音重すぎ木の葉っぱとみきの揺れ方は違うし物理を考えて揺れ方考えるべき。人の造形もおざなりps4のげーむのビジュアルくらいのクオリティにして」

公開previewを実際に見聞きした指摘として、風音の過大な強風感、重すぎる足音、幹と葉の物理の混同、粗い人物造形を優先して修正する。PS4世代ゲームのビジュアル水準を新しい直接目標として保持し、手続き的な部品・飾りの追加や技術CI成功を到達の証明にしない。固定のコンセプト・参照作品・比較基準は保持する。最新原文、実媒体の改善・残差・未測定、実装と一致するpreview公開の証拠を状態へ残す。この直接制作依頼で停止済みautomationを再有効化しない。


## 今回の品質修正で選んだ素材制作方法 — 2026-09-15

上記の直接品質指示に対する制作判断として、人物の頭・首・手の解剖形状と皮膚・眼・髪には、再配布できることを原ライセンスで確認した MakeHuman/MPFB の CC0 素材を導出・同梱する方法へ移行する。以前の「全 runtime 素材を起動時に生成し、外部素材ゼロ」という制作方法の記述に対する、この人物部位の限定的な変更である。これはユーザーが素材名を指定したという記録ではなく、実際の通常画面と同条件の寄りで残った粗い造形を修正するため、許可済みの素材選定・実装権限で統合担当が選んだ方法である。

原データ・選択した形態 target・派生手順・ライセンス・hash を保存し、参照作品の形状や画像は取り込まない。GPL の制作プログラムをゲームへコピーせず、CC0 と確認できた素材を独立した変換処理で利用する。runtime は公開 preview と同じ origin に build した必要素材だけを読み込み、decode 完了後に開始し、取得失敗を隠さない。脚の接地、膝の方向、刀と実手の握り、入力の分離を回帰検査する。

PS4 目標は部位の三角形数ではなく、通常画面での人物と周囲を含む外観として保持する。素材導入や技術検査だけで到達と呼ばず、実描画・独立レビュー・正式比較の範囲を分ける。コンセプト、固定全文、選定済み参照、期限、単独 writer、root/docs 保全、preview 一致確認、automation 指定は維持する。
