# KAGEROU 陽炎 — current direction

## 最新の直接指定：全ての委任可能なモデル作業をUltraへ統一
<!-- ULTRA-ALL-20260914-v2 BEGIN -->

指示ID: `ULTRA-ALL-20260914-v2`。ユーザー原文:「全ての作業をウルトラでやるようにして。切り替え確認までして」。
この節は次回の定期実行と既に進行中の主制作の両方に適用する。下記の旧 `ULTRA-LIVE-20260914-v1`、`ULTRA-VERIFY-20260914-v1`、`ULTRA-VERIFY-ALL3-20260914-v1` および従来のUltra委任指定のうち、担当範囲、親の知的作業、下位強度への代替、切替完了判定に関する競合箇所を本v2で置き換える。旧v1にある「親が計画・調査・独立評価・統合判断を自分で進める」「Ultraが使えなければ親が通常の制作を継続する」という許可は、このv2により失効する。委任方法以外の最新の制作目標・固定基準・開始日・期限・期限評価・継続/復旧条件・各回のmain反映・公開条件・安全制約、別セッションの最新指示を保持する。

1. 全ての知的作業を対象にする。制作の計画、優先順位、継続状態と期限見通しの判断、停止原因の調査、設計、素材方針、参照作品/実資料の選定と調査、実装、修復、試験の設計と実行結果の判断、独立レビュー、ブラインド比較、差分/品質の評価、統合判断、main反映の具体的手順の確定、報告内容の作成まで、委任可能な全てのモデル作業をUltra指定の担当へ渡す。小さい・簡単・短い・監視だけという理由で下位強度へ落とさない。Git、ビルド、試験プロセス等の非モデル道具に架空のUltra設定を付けない。画像/音声等の専用生成モデルや外部評価系をUltraと称さない。それらの利用計画・素材選択・品質判断はUltra担当が行い、利用できる機能の範囲と実際のモデル/指定を区別して記録する。任意に選んだ外部LLMによる評価・比較・分析もモデル作業であり、匿名化・独立性・固定条件を維持できる正規のUltra担当へ移す。固定要件で特定の外部モデルが必須など変更できない場合は、下位強度の代替を全Ultraと扱わず未対応範囲として明示する。参照条件、独立性、正規の取得/生成/検証手段は勝手に変更しない。

2. 実際のUltra起動を必須にする。自立した有限な役割を1つ以上のUltra担当にまとめ、不要な子を乱造しない。全ての新規の子・孫以降の担当は、正式な `collaboration.spawn_agent` に `reasoning_effort="ultra"`、`fork_turns="none"` を実引数として渡し、`model` は省略して現在のモデルを継承する。 `task_name` と自立した `message` に役割、対象repoと確定した基点SHA、最新指示/正本の取得経路、固定基準・期限・許可範囲、正確な継続地点、編集範囲、必要な検証、成果と証拠の返却条件を渡す。文章中のUltra宣言、強度未指定の継承、親や子の自己申告だけで指定確認にしない。実引数、受理応答、受理された担当ID、役割、基点SHA、成果を対応付けて残す。独立比較は実装担当と評価担当を分け、評価者には出所や開発側の自己評価を漏らさない匿名化済み実資料と評価条件だけを渡す。

3. 既存担当を安全に切り替える。現在の非Ultraまたは強度未確認の担当には、その実行の親が利用可能な正式な連絡機能でv2を伝え、最初の安全な区切りで作業、未保存差分、途中成果、進行中ツール、未完了操作、検証済み地点と正確な次の作業を保存させる。引継ぎ完了後の新しい作業からUltra指定の担当へ移す。進行中ツールや保存中成果を突然停止・削除せず、同じ作業を重複委任しない。既にUltra指定で受理されている担当は維持し、v2の担当範囲と証拠条件を引き継ぐ。外から元の主制作を停止・再起動・置換しない。旧ジョブや親の実効強度、連絡や引継ぎが未確認なら、その担当と範囲を未確認として残す。

4. 親の役割と単独の実行者を明確にする。公開されている `automations_update` には親の `model`/`reasoning_effort` 欄がなく、既存親や別会話の推論強度を直接変更・読取する正式なツールも現時点では確認できない。親自身の強度を制御できない場合、親の役割は正式な起動・受理確認、権限上親に限定される機械的なツール実行/転送に必要な最小限の調整に絞る。実質的な計画・判断・レビュー・報告内容はUltra担当で作り、主制作内の一人のUltra統合担当へ変更・検証・main反映の判断をまとめる。リモート操作の実行者を子へ移すのは、既存親の未完了操作が終わり、排他的な担当移譲を確認できた場合だけとする。子と親、または別の制作/定期実行が同時にpush・main更新・状態記録書込みをしない。移譲を確認できなければUltra担当が確定した具体的操作を既存の単独実行者が正規権限で実行し、その非モデル操作と親の強度未確認を区別する。最新head・必須検証・既存のmain反映と公開条件を守り、ユーザーが既に承認したゲーム制作の範囲に限る。保護・承認・認証・アクセス制限の回避はしない。

5. 下位強度への旧フォールバックを廃止する。Ultra非対応・拒否・状態不明のとき、同じ知的作業を下位強度や強度未指定で黙って継続しない。未受理、受理済み進行中、終了確認済み、状態不明を区別し、実際の応答と阻害範囲を残す。安全な成果保全、事実記録、正式な状態確認は行い、既に受理済みのUltra作業と、競合せずUltraで実行できる独立作業は継続する。既存の受理済み作業や完了済み検証を切替だけのためにやり直さない。稼働していない処理を背景継続中と呼ばず、許可された連絡/再開機構がない場合はないと記録する。自動化の有効状態・予定をUltra切替のために変更しない。

6. 全工程の適用を証拠で確認する。v2の読取・受理時刻と安全な切替地点を、実際に受理した元の主実行が既存の状態記録と必要最小限の証拠へ残す。切替以降の仕事/役割ごとに、実際のspawn引数、受理担当ID、担当範囲、基点/成果SHA、実成果、検証、統合/main反映の証拠を対応付ける。計画・期限判断・調査・実装・検証・独立比較・統合判断・報告も対象に含め、未着手工程、非Ultra/強度未確認の残存担当と親、引継ぎ未了を明示する。該当工程がまだ不要なら理由を示して未実施と記録し、確認済みに水増ししない。確認側が受理や成果を代筆しない。設定保存、監査用担当の起動、本設定改定担当のUltra起動、旧v1の一部担当の成功、CI成功だけで本制作のv2全工程切替完了にしない。

7. 確認完了の判定もv2へ更新する。既存の各回の確認とQによる3件の横断読取は、本v2の全工程対応を基準に続ける。旧v1の受理/成果が3件そろっただけで横断確認を終了しない。Ultra担当が最新の正当な制作正本と実証拠を確認し、新しい確認事実・残る阻害点・固定commitの根拠URLと確認範囲を報告する。バックエンド実効強度が公開されなければ「全委任先のultra指定受理・成果」と「親/バックエンドの実効強度は未確認」を必ず分離し、後者を無視して「全作業Ultra化完了」と報告しない。親を含む実効強度までの確認が可能な正式機能が後に得られた場合だけ、その実証拠を追加する。確認中も競合しない許可済み制作と各回のmain反映をUltraによる判断で進め、変化のない待機報告を繰り返さない。切替確認を理由に制作オートメーションを停止せず、制作自体の既存終了条件を保持する。

<!-- ULTRA-ALL-20260914-v2 END -->

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
