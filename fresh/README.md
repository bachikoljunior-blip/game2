# 新規制作本体

旧 `src/` を読み込まない独立した新規エントリ。旧ゲームは保全用に残っている。
必要性と設計は先に `AI_DEVELOPMENT/FRESH_DESIGN.md` に記録。旧部品の再利用はまだない。

```sh
node --test fresh/simulation.test.mjs
node node_modules/vite/bin/vite.js build --config fresh/vite.config.mjs
node node_modules/vite/bin/vite.js preview --config fresh/vite.config.mjs --port 4178
node fresh/browser-smoke.mjs
```

`npm run build` は現在まだ旧ゲームのビルド。新規ゲームは上記の明示コマンドを使う。
出力は `fresh-dist/`。公開用 `docs/` へまだ置き換えていない。
見た目・音・ゲーム内容はいずれも初期試作で、AAA品質・全要素達成ではない。
ブラウザ証拠は新しい Fresh game verification CI の同一SHAから取得する。
