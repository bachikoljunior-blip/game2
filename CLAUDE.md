# KAGEROU 陽炎 — current direction

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
