#!/usr/bin/env node
/**
 * inline-single.mjs — fold the one-chunk build into a single hostable document.
 *
 * The Artifact host wraps whatever it is given in its own `<html>/<head>/<body>`
 * skeleton, so this emits body-level content only: the stylesheet, the markup, and
 * the bundle as one inline module. Nothing is fetched at runtime, which is what lets
 * the page work under a CSP that forbids every external origin.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist-single');

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const assets = readdirSync(join(DIST, 'assets'));
const jsName = assets.find((f) => f.endsWith('.js'));
if (!jsName) throw new Error('no js chunk in dist-single/assets');
const js = readFileSync(join(DIST, 'assets', jsName), 'utf8');

// Body content only — strip the document scaffolding the host supplies itself.
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
const bodyNoScript = body.replace(/<script[\s\S]*?<\/script>/g, '').trim();

// `</script>` inside a string literal would close the tag we are writing it into.
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const out = `<title>KAGEROU 陽炎</title>
<style>
${style}
/* The host supplies the page frame; make sure the canvas still fills it. */
html, body { margin: 0; padding: 0; overflow: hidden; background: #05050a; }
</style>
${bodyNoScript}
<script type="module">
${safeJs}
</script>
`;

const target = join(ROOT, 'dist-single', 'kagerou.html');
writeFileSync(target, out);
console.log(`${target}  ${(Buffer.byteLength(out) / 1048576).toFixed(2)} MB`);
