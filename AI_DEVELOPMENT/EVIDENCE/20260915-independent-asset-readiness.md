# 人物素材readiness検証器の独立静的レビュー — 2026-09-15

担当 `/root/game2_ultra_art_sound_physics/c06_reference_material`。受理済みUltraの有限担当、再委任なし。検証器作者 `/root/game2_ultra_art_sound_physics/sound_revision` と独立して読み合わせた。私が変更したのは本証拠だけで、runtime・検証器・workflowへの編集、browser起動、remote writeは行っていない。

## 対象と測定の境界

初回指定 apparatus SHA-256 `824c0c81146e18b6cf0d962b190c7a162e4e9b5ee996cc105dc3430e1e685bfb` を実読取で確認。読取時repo HEADは `3bcc5df515eb394c484e6eaf9caf0efcd50e78c5` だが、並行統合中なのでHEADだけで未commitの実ファイルを同定せず、以下のSHAを使う。

| 初回実ファイル | SHA-256 |
|---|---|
| `fresh/assets-browser-smoke.mjs` | `824c0c81146e18b6cf0d962b190c7a162e4e9b5ee996cc105dc3430e1e685bfb` |
| `fresh/character-assets.js` | `4951b0257e6a1cde08c0fab76fe38b902f6bb441773d54c539bb5fb10c515ac3` |
| `fresh/character-rig.js` | `5266988e51e0f49aaa30beb69fc55a1d6922cc0805bffe01de9f31ff4e1fa47a` |
| `fresh/main.js` | `0a38ad3342bc964502134e1f49d6d831b3d418d975039ba9485e25e47af91c03` |
| `fresh/presentation.js` | `56ab2371dbe39ad504e0db7b5feaca8acba9da072d56f99caf9ed7ffff3c60b1` |
| `.github/workflows/fresh-game.yml` | `8dd44072f042fc73eb7a8ced5711f9b6770d04f080eabc11874cec0b418c6e76` |

実Chromeがないため静的apparatus reviewとNode構文検査のみ。初回 `node --check fresh/assets-browser-smoke.mjs` はpass。browserでのPNG保留/abort、画像decode、WebGLへの画像供給、開始操作が成功したという実測結果ではない。再描画、PS4品質、音の聴取、実機性能、要素の匿名比較の合格とも呼ばない。

## 実装契約との対応

- `createNativeCharacterResources` はskin/eyes/hair/browsの4件を `TextureLoader.loadAsync` で開始し、各finallyでpendingを減らす。全成功時だけready、1件以上失敗時はfailedを保つ。Promise.allは早期rejectするため、検証器のfailed caseがさらに `pendingCount===0` を待ち、3成功/1失敗を確かめる点は適切。
- `createCharacterResources.ready` → `presentation.assetsReady` → `main.js` の成功/失敗分岐がつながる。開始ボタンは初期disabled、未ready/contextLostならclick handlerでも開始拒否。rAFもassetsReadyまで `view.render` を呼ばない。失敗時はボタンと可視文を更新し、renderを開始しない。
- ready後のbefore-start画像描画と、実ボタンクリック後のrunning/world.time増加を検証器が分ける。4rigの存在、4画像/1geometryというactual runtime診断、rendererのdraw-call計数を照合する。単なるボタンの文言変更だけを開始成功と扱わない。
- ローカルThreeソースのImageLoaderはHTMLImageElementのload/errorからresolve/rejectする。検証器はHTMLImageElement.decode()を代行せず、load完了・natural dimensions・PNG bytes・原WebGL画像API供給を観測する。decoder内部の時刻やGPU texel/readbackを測ったとは記録しない。

## 保留・abort・エラーの扱い

- 1件だけ実requestをrouteし、正常ケースは `route.continue()` まで保留、失敗ケースは `route.abort('failed')`。PNGをfixtureへ差し替えず、Promise状態の偽造も行わない。重複取得/想定外retryはエラーになる。
- `page.goto(..., waitUntil:'domcontentloaded')` を使い、保留PNGに依存するwindow loadイベントを待たない。mainはtop-level awaitで画像を待たずdiagnosticsを設置するため、既知のload待ちdeadlockは避けている。
- pending1/ready3/render.calls0/runningfalseを実clickの前後で確認。disabledボタンへmouse座標clickするため、Locator.clickのenabled待ちと混同しない。
- failedは別の `chromium.launch` とnewContextで開始し、前ケースの画像cacheやready状態を再利用しない。failed/disabled/可視失敗文、click後もworld.time不変、部分textureを描画しないことを確認する構造。
- 注入したURLと `net::ERR_FAILED` に完全一致するrequest failureだけをexpectedにする。consoleの除外も同じURLと完全一致文字列だけ。全pageerror、unhandledrejection、他のrequest failure/console errorは失敗へ残す。unhandledrejectionのdefaultを抑制しない。曖昧なsubstring除外はない。
- PNG responseは同origin・200・image/png・signature・正のIHDR寸法・bytesを記録し、WebGL APIへ供給された画像URL/自然寸法と照合。受領bytesのhashはあるが、これだけをGPU画像内容のreadbackとは呼ばない。

## 初回所見と作者への連絡

1. **WebGL warning診断の欠落／観測主張の上限**：原版119行はconsole errorだけを記録する。WebGLのINVALID_OPERATION等はJS throwではなくdriver error状態になり、browserがwarningとして示す場合がある。原版51行のReflect.applyが返っただけでは、そのAPIへの画像供給以上の成功証拠にならない。errorだけのcollectorでは、その種の診断を見落とせる。作者・統合者へ具体的に連絡し、warningも保存してGLエラーを識別する修復と、供給までへの表現限定を依頼した。`getError()` を読んでdriver errorを消費する修復は要求しない。
2. **Vite cleanup API**：原版250行は `server.httpServer.close`。HTTP portは閉じるが、使用中のViteの `server.close()` はさらに登録SIGTERM listener解除と内部resolvedUrlsの清掃を行う。現行standalone processで実リークを観測したものではないが、作者に正規の `server.close()` の利用を勧め、統合者が修復を依頼した。

原WebGL観測はprototypeのtexImage2D/texSubImage2Dへwrapperを置く。`Reflect.apply(original,this,args)` とoriginal returnを保ち、画像や引数を差し替えず、gl.getError、pixelStore、texture binding、decode Promiseへ介入しない。現在の実PNG URL/同realm HTMLImageElementに対する観測は呼出し契約を保つ。CDP sessionやGPUの偽装を使う実装ではない。wrapperのCPUコストがあるため、裸のゲーム性能を測るapparatusではない。

## 所有権・port・出力

- `fresh/vite.config.mjs` のfresh-distだけをread-only previewで配信し、127.0.0.1:4178 / strictPort:true。別サーバーがportを使っていれば失敗し、別serverへfallback/attachしたり他processをkillしたりしない。
- 各caseのfinallyでholdをrelease、route jobとPNG body収集をsettle、観測を回収、browser.closeを待つ。個別caseの失敗でも次caseへ進む。top-level finallyで自分のserverを閉じreportを保存する構造。
- 検証器の書込みは指定evidence下のreportとPNGだけ。old root index.html/public/docsをwrite/copy/deployするコードはない。これは静的な操作範囲の確認で、実行前後のpublic bytesを測ったものではない。
- asset-readiness CI jobはcheckout ${github.sha}、HEAD一致、fresh build、tracked diffゼロの順でこのapparatusを起動する。buildとcurrent sourceの結び付けはこのjob側にある。検証器単体はHEAD/apparatus SHA/ビルドindex SHA/受領PNG SHAを記録するため、別の古いfresh-distに対する単独実行を同じソースの合格と読み替えない。

## 修復後の独立確認

修復後 apparatus SHA-256 **`f09729c3dad03e347a6207a96da9f85365b51a2e9422d9e6226654a9792145e5`** を実readback。作者の受領通知にあるhashと一致し、修復箇所と全record参照を再読した。

- `consoleWarnings` は全warningを保存。error/warningの両配列からGL enum（INVALID_*、OUT_OF_MEMORY、CONTEXT_LOST）と明示WebGL/OpenGL error/context-lossを `glErrorDiagnostics` へ取り出し、1件でもerrorsへ加える。従来のconsole error、pageerror、unhandledrejection、想定外network failureの失敗条件を保持。通常の性能warningを削除せず記録した上で判定対象と分ける。
- 記録名を `textureApiSubmissions` へ統一。正例、失敗例の空配列、PNG responseとの照合でも改名後のfieldを使い、旧textureUploadsへの参照はない。`textureObservationScope` とコメントが、API供給の証拠でありGPU転送成功や未報告GPUエラーの不在は未証明と明示する。getError呼出し、GL error消費を加えていない。
- finallyは `await server.close()` へ変更し、その拒否もreport.failedへ残す。caseごとのrelease/browser.closeは保持。
- 修復後 `node --check fresh/assets-browser-smoke.mjs` は本人実行でpass。加えて本人が実sourceから `isGlErrorDiagnostic` だけをNode VMへ抽出し、GLエラー8件と性能warning等の負例4件、合計12件を照合してpass。これは合成文字列の分類器チェックで、実Chrome/GLのエラー発生・取得を再現した実測ではない。作者の32 VM assertionsは作者からの返却であり、本人が同じ32件を実行したとはしない。
- 並行統合でpresentationの全体hashは `227512ef00cdf89fa21c0d0b7252062a88654fb51b58763348183db3ce3db288` へ変わった。actorResources生成、assetsReady返却、diagnosticsへのstate/pending/ready/failed/error受渡しを現ファイル508/629/630行で再確認し、この契約は維持されている。main / character-assets / character-rig / workflowのhashは上表と同じ。

**静的レビューの結論：指摘2点の対応を確認し、この範囲に残るCI投入の阻害欠陥は見つからなかった。** 実PNG hold/abortと実WebGL API供給・起動の成否は未実行で、後続CIが両caseを完走し、原report/PNGを返すことを要する。GPU texel/readback、一般的なエラー不在、画面品質の合格へは拡張しない。
