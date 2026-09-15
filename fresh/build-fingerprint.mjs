import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname),build=resolve(root,'fresh-dist');
const output=resolve(process.env.FRESH_BUILD_FINGERPRINT||resolve(root,'AI_DEVELOPMENT/EVIDENCE/fresh-20260913/build-fingerprint.json'));
const files=[];
async function visit(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,item.name);if(item.isDirectory())await visit(path);else{const bytes=await readFile(path);files.push({path:relative(build,path),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await visit(build);files.sort((a,b)=>a.path.localeCompare(b.path));
const report={sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  freshTree:execFileSync('git',['rev-parse','HEAD:fresh'],{cwd:root,encoding:'utf8'}).trim(),files,
  scope:'Hashes of the exact fresh-dist production build used by this revision browser verification.'};
await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
