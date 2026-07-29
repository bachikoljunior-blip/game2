import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[];
p.on('pageerror', e=>errs.push(e.message));
p.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
await p.goto('file:///home/user/game2/dist-single/kagerou.html?autostart&q=medium&capture', { waitUntil:'load', timeout:120000 });
let ok=true;
try { await p.waitForFunction('window.__kagerouReady === true', undefined, { timeout:400000, polling:500 }); } catch { ok=false; }
await p.waitForTimeout(6000);
await p.screenshot({ path:'/home/user/game2/shots/single-check.png', timeout:300000 });
const st = await p.evaluate(()=>{const k=window.__kagerou;return k?{draws:k.engine.stats.drawCalls,tris:k.engine.stats.triangles,tier:k.quality.tier}:null;}).catch(()=>null);
console.log('booted:',ok,'| errors:',errs.length, errs.slice(0,2).join(' | '));
console.log('stats:', JSON.stringify(st));
await b.close();
