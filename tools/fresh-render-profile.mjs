// Bounded production-module diagnosis. This runner never edits PROFILE_SOURCE_ROOT.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {build,preview} from 'vite';
import {chromium} from 'playwright';

const runnerRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baseline='acf0f9ec86996245ad712d6adc72e5d6159f6711';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorText=e=>e?.stack||String(e);
const glDiagnostic=text=>/\b(?:GL_)?(?:INVALID_ENUM|INVALID_VALUE|INVALID_OPERATION|INVALID_FRAMEBUFFER_OPERATION|OUT_OF_MEMORY|CONTEXT_LOST(?:_WEBGL)?)\b/i.test(text)||/\b(?:WebGL|OpenGL)\b[^\n]*(?:\berror\b|\bcontext\s+(?:lost|loss)\b)/i.test(text);
function bounded(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} exceeded ${ms}ms`)),ms);})]).finally(()=>clearTimeout(timer));}

// Runs in the inspection page with the actual imported production factories.
// No simulation advance/input, alternate geometry or inspection camera is used.
function browserProfile(createPresentation,createWorld,needsTextures){
  const state=window.renderProfileState={status:'creating',samples:[],errors:[],restored:false};
  const clock=()=>performance.now();let view,world,originalRender,variant='full',leaves=[];
  const defaults=new Map();
  const restore=()=>{for(const [mesh,flags] of defaults){mesh.visible=flags.visible;mesh.castShadow=flags.castShadow;}};
  const fail=error=>{state.status='failed';state.errors.push(String(error?.stack||error));};
  addEventListener('unhandledrejection',event=>state.errors.push(String(event.reason?.stack||event.reason)));
  window.renderProfileRestore=()=>{
    restore();if(view&&originalRender)view.renderer.render=originalRender;
    state.restored=leaves.every(mesh=>mesh.visible===defaults.get(mesh).visible&&mesh.castShadow===defaults.get(mesh).castShadow);return {restored:state.restored};
  };
  (async()=>{
    const before=clock();view=createPresentation(document.querySelector('canvas'));state.createPresentationCpuMs=clock()-before;
    const assetStart=clock();
    if(needsTextures){if(!view.assetsReady?.then)throw new Error('Candidate must expose actual assetsReady');await view.assetsReady;}
    else if(view.assetsReady?.then)await view.assetsReady;
    state.assetWaitWallMs=clock()-assetStart;state.assets=view.actorDiagnostics().assets??{state:'no-external-character-assets-at-baseline',textureCount:0};
    if(needsTextures&&(state.assets.state!=='ready'||state.assets.textureCount!==4||state.assets.readyCount!==4||state.assets.pendingCount!==0||state.assets.failedCount!==0))throw new Error('Four real character textures did not become ready');
    world=createWorld();view.beginWorld(world);
    state.actorRigCount=Object.keys(view.actorDiagnostics().rigs).length;if(state.actorRigCount!==4)throw new Error('All four production actors are required');
    state.worldFixture={player:world.player,enemies:world.enemies,mode:world.mode,locked:world.locked};
    // Scan each geometry exactly once. A mixed leaf/twig mesh is reported as
    // mixed, because disabling its drawable also disables those twig triangles.
    const scanned=new Map();state.leafScan={geometryCount:0,verticesVisited:0,meshes:[]};
    view.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;const g=mesh.geometry,p=g.attributes.leafPivot;if(!p)return;
      if(!scanned.has(g)){
        let leafVertices=0;for(let i=0;i<p.count;i++)if(p.getW(i)>.5)leafVertices++;
        scanned.set(g,{leafVertices,totalVertices:p.count});state.leafScan.geometryCount++;state.leafScan.verticesVisited+=p.count;
      }
      const found=scanned.get(g);if(!found.leafVertices)return;
      leaves.push(mesh);defaults.set(mesh,{visible:mesh.visible,castShadow:mesh.castShadow});
      state.leafScan.meshes.push({name:mesh.name,uuid:mesh.uuid,...found,mixed:found.leafVertices!==found.totalVertices,instances:mesh.isInstancedMesh?mesh.count:1,triangles:(g.index?g.index.count:g.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1),castShadow:mesh.castShadow,visible:mesh.visible});
    });
    if(!leaves.length)throw new Error('No production leafPivot.w > 0.5 drawables found');
    state.leafScan.scope='Whole drawables containing at least one leafPivot.w > 0.5 vertex, including mixed woody side branches; not isolated leaf triangles';
    state.leafScan.meshCount=leaves.length;state.leafScan.triangles=state.leafScan.meshes.reduce((sum,m)=>sum+m.triangles,0);
    const gl=view.renderer.getContext();if(typeof gl.finish!=='function')throw new Error('Real WebGL finish is required');
    state.gl={version:gl.getParameter(gl.VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER)};
    const debug=gl.getExtension('WEBGL_debug_renderer_info');if(debug)state.gl.unmaskedRenderer=gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    state.viewport={width:innerWidth,height:innerHeight,devicePixelRatio,rendererPixelRatio:view.renderer.getPixelRatio(),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
    if(innerWidth!==960||innerHeight!==720||devicePixelRatio!==1||view.renderer.getPixelRatio()!==1)throw new Error('Viewport/DPR mismatch');
    originalRender=view.renderer.render;
    view.renderer.render=function(...args){
      if(variant==='full')return Reflect.apply(originalRender,this,args);
      const flags=leaves.map(mesh=>({mesh,visible:mesh.visible,castShadow:mesh.castShadow}));
      try{
        for(const {mesh} of flags){if(variant==='no-leaf-shadows')mesh.castShadow=false;if(variant==='no-leaves')mesh.visible=false;}
        return Reflect.apply(originalRender,this,args);
      }finally{for(const saved of flags){saved.mesh.visible=saved.visible;saved.mesh.castShadow=saved.castShadow;}}
    };
    window.renderProfileBegin=name=>{
      if(!['full','no-leaf-shadows','no-leaves'].includes(name))throw new Error('Unknown variant');
      restore();variant=name;world=createWorld();view.beginWorld(world);
      return {variant:name,worldTime:world.time,player:{x:world.player.x,z:world.player.z},enemies:world.enemies.map(a=>({id:a.id,x:a.x,z:a.z})),diagnosticOnly:name!=='full'};
    };
    window.renderProfileFrame=frame=>{
      if(!Number.isInteger(frame)||frame<0||frame>12)throw new Error('Bounded frame index required');
      world.time=frame/60;for(const actor of [world.player,...world.enemies])actor.age=frame/60;
      const before=clock();view.render(world,1/60,0,{animate:true});const rendered=clock();
      gl.finish();const finished=clock();
      const sample={variant,frame,worldTime:world.time,cpuRenderMs:rendered-before,finishWaitMs:finished-rendered,totalWallMs:finished-before,
        render:{...view.renderer.info.render},memory:{...view.renderer.info.memory},programs:view.renderer.info.programs?.length,
        camera:view.camera.position.toArray(),cameraQuaternion:view.camera.quaternion.toArray(),contextLost:gl.isContextLost()};
      state.samples.push(sample);if(sample.contextLost)throw new Error('WebGL context lost');return sample;
    };
    state.status='ready';
  })().catch(fail);
}

async function fingerprint(root){
  const names=execFileSync('git',['ls-files','-z','fresh'],{cwd:root}).toString().split('\0').filter(Boolean).sort();
  const entries=[];for(const name of names){const bytes=await readFile(resolve(root,name));entries.push({path:name,bytes:bytes.length,sha256:hash(bytes)});}
  return {sha256:hash(JSON.stringify(entries)),files:entries};
}
async function treeFiles(root,folder=root){
  const result=[];for(const item of await readdir(folder,{withFileTypes:true})){const path=resolve(folder,item.name);
    if(item.isDirectory())result.push(...await treeFiles(root,path));else{const bytes=await readFile(path);result.push({path:relative(root,path),bytes:bytes.length,sha256:hash(bytes)});}}
  return result.sort((a,b)=>a.path.localeCompare(b.path));
}
function summary(samples){
  const result={};for(const key of ['cpuRenderMs','finishWaitMs','totalWallMs']){
    const values=samples.map(s=>s[key]).sort((a,b)=>a-b);result[key]={min:values[0],median:values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2,max:values.at(-1)};
  }return result;
}
async function main(){
  const sourceRoot=resolve(process.env.PROFILE_SOURCE_ROOT||runnerRoot),out=resolve(process.env.PROFILE_OUTPUT||resolve(runnerRoot,'AI_DEVELOPMENT/EVIDENCE/fresh-render-profile'));
  const variants=(process.env.PROFILE_VARIANTS||'full,no-leaf-shadows,no-leaves').split(',');
  assert.ok(variants[0]==='full'&&new Set(variants).size===variants.length&&variants.every(v=>['full','no-leaf-shadows','no-leaves'].includes(v)),'PROFILE_VARIANTS must start with full and use unique known variants');
  await mkdir(out,{recursive:true});
  const report={schemaVersion:1,result:'running',startedAt:new Date().toISOString(),sourceRoot,variants,viewport:{width:960,height:720,dpr:1},
    apparatusSha256:hash(await readFile(fileURLToPath(import.meta.url))),limits:{operationMs:60000,fullFrames:13,diagnosticFramesEach:6},
    scope:'Production createPresentation/createWorld, built by Vite, Chromium SwiftShader. Fixed initial world and normal animation/camera. Diagnostic flags never enter the source runtime. Not physical-device performance or visual quality acceptance.',
    formulas:{cpuRenderMs:'t_after_view_render - t_before_view_render; JS plus any driver/compiler blocking inside render, not pure CPU execution',finishWaitMs:'t_after_gl_finish - t_after_view_render; additional WebGL completion wait including synchronization/IPC, not isolated GPU execution time',totalWallMs:'cpuRenderMs + finishWaitMs',authoredTime:'world.time = frame / 60; dt = 1/60; actor age = frame/60; no simulation advance',firstFrame:'full frame 0 includes first renderer shader/program compilation and first draw; initial WebGL construction and asset loading are reported separately',variants:'Each begins with a fresh createWorld + beginWorld at the same positions. Six frames use time 0..5/60. These are diagnostic samples, not twelve-frame warmed benchmark equivalents; programs/textures may be cached from full. Leaf ray/physics CPU work remains active.'},
    cases:[],errors:[],consoleErrors:[],consoleWarnings:[],pageErrors:[],requestFailures:[],cleanup:{}};
  const persist=()=>writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  let temporary,server,browserServer,browser,page,abandonPage=false;const buildOnly=process.argv.includes('--build-only');
  const evaluate=async(fn,arg,label)=>{try{return await bounded(page.evaluate(fn,arg),60000,label);}catch(e){abandonPage=true;throw e;}};
  try{
    report.sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
    report.runnerRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:runnerRoot,encoding:'utf8'}).trim();
    report.sourceFreshTree=execFileSync('git',['rev-parse','HEAD:fresh'],{cwd:sourceRoot,encoding:'utf8'}).trim();
    execFileSync('git',['diff','--exit-code','HEAD','--','fresh'],{cwd:sourceRoot});
    const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','fresh'],{cwd:sourceRoot,encoding:'utf8'}).trim();assert.equal(untracked,'','Source fresh/ must be immutable and tracked');
    report.sourceFingerprint=await fingerprint(sourceRoot);
    report.dependencies=Object.fromEntries(await Promise.all(['three','vite','playwright'].map(async name=>[name,JSON.parse(await readFile(resolve(runnerRoot,'node_modules',name,'package.json'),'utf8')).version])));
    const expected=JSON.parse(await readFile(resolve(sourceRoot,'package-lock.json'),'utf8')).packages?.['node_modules/three']?.version;
    assert.equal(report.dependencies.three,expected,'use the exact locked Three version for each source');
    temporary=await mkdtemp(resolve(out,'.inspection-'));
    const imports=`import {createPresentation} from ${JSON.stringify(resolve(sourceRoot,'fresh/presentation.js'))};\nimport {createWorld} from ${JSON.stringify(resolve(sourceRoot,'fresh/simulation.js'))};`;
    const html='<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#20282a}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas></canvas><script type="module">'+imports+'\n('+browserProfile.toString()+')(createPresentation,createWorld,'+(report.sourceRevision!==baseline)+');</script></body></html>';
    await writeFile(resolve(temporary,'index.html'),html);
    const started=performance.now();
    await build({configFile:false,root:temporary,logLevel:'error',resolve:{alias:[{find:/^three$/,replacement:resolve(runnerRoot,'node_modules/three/build/three.module.js')},{find:/^three\/addons\//,replacement:resolve(runnerRoot,'node_modules/three/examples/jsm/')+'/'}]},build:{outDir:resolve(temporary,'dist'),emptyOutDir:true}});
    report.buildWallMs=performance.now()-started;report.inspectionBuild=await treeFiles(resolve(temporary,'dist'));await persist();
    if(buildOnly){report.staticBuildOnly=true;return;}
    server=await preview({configFile:false,root:temporary,logLevel:'error',build:{outDir:resolve(temporary,'dist')},preview:{host:'127.0.0.1',port:4196,strictPort:true}});
    browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',port:0,executablePath:process.env.CHROME_PATH,timeout:60000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    browser=await chromium.connect(browserServer.wsEndpoint(),{timeout:60000});report.browserVersion=browser.version();
    const context=await browser.newContext({viewport:{width:960,height:720},deviceScaleFactor:1,serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',e=>report.pageErrors.push(errorText(e)));
    page.on('console',m=>{const event={text:m.text(),location:m.location()};if(m.type()==='error')report.consoleErrors.push(event);if(m.type()==='warning')report.consoleWarnings.push(event);});
    page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
    await page.goto('http://127.0.0.1:4196/',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>['ready','failed'].includes(window.renderProfileState?.status),null,{timeout:60000});
    report.pageSetup=await evaluate(()=>window.renderProfileState,null,'read setup');assert.equal(report.pageSetup.status,'ready');
    for(const variant of variants){
      const item={variant,diagnosticOnly:variant!=='full',samples:[],result:'running'};report.cases.push(item);await persist();
      item.fixture=await evaluate(v=>window.renderProfileBegin(v),variant,`begin ${variant}`);
      const count=variant==='full'?13:6;
      for(let frame=0;frame<count;frame++){
        const started=performance.now();const sample=await evaluate(i=>window.renderProfileFrame(i),frame,`${variant} frame ${frame}`);
        sample.nodeRoundTripWallMs=performance.now()-started;item.samples.push(sample);await persist();
      }
      if(variant==='full'){
        item.firstCompileFrame=item.samples[0];item.warm12Summary=summary(item.samples.slice(1));
        item.capture={startedAt:new Date().toISOString(),timeoutMs:60000};await persist();const started=performance.now();
        try{await bounded(page.screenshot({path:resolve(out,'full.png'),timeout:60000}),60000,'full PNG');
          item.capture={...item.capture,result:'passed',elapsedMs:performance.now()-started,sha256:hash(await readFile(resolve(out,'full.png')))};
        }catch(e){item.capture={...item.capture,result:'failed',elapsedMs:performance.now()-started,error:errorText(e)};report.errors.push({fullCapture:errorText(e)});}
      }else item.sixFrameSummary=summary(item.samples);
      item.result='measured';await persist();
    }
    report.finalPage=await evaluate(()=>window.renderProfileState,null,'read final state');
    report.restoration=await evaluate(()=>window.renderProfileRestore(),null,'restore flags');assert.equal(report.restoration.restored,true);
  }catch(e){report.errors.push(errorText(e));}
  finally{
    await persist();
    if(abandonPage)report.restoration={restored:false,scope:'Page evaluation timed out; flags restoration inside that call is unconfirmed. The isolated owned browser is closed below; source runtime was never edited.'};
    if(page&&!abandonPage&&!report.restoration){try{report.restoration=await bounded(page.evaluate(()=>window.renderProfileRestore?.()),5000,'failure restore');}catch(e){report.cleanup.restoreError=errorText(e);}}
    if(browser)try{await bounded(browser.close(),10000,'browser disconnect');report.cleanup.browserClosed=true;}catch(e){report.cleanup.browserError=errorText(e);}
    if(browserServer)try{await bounded(browserServer.close(),10000,'owned browser close');report.cleanup.browserProcessClosed=true;}catch(e){report.cleanup.browserProcessError=errorText(e);try{await bounded(browserServer.kill(),10000,'owned browser kill');report.cleanup.browserKilled=true;}catch(k){report.cleanup.killError=errorText(k);}}
    if(server)try{await bounded(server.close(),10000,'Vite close');report.cleanup.serverClosed=true;}catch(e){report.cleanup.serverError=errorText(e);}
    if(temporary)await rm(temporary,{recursive:true,force:true}).catch(e=>report.cleanup.temporaryError=errorText(e));
    if(report.sourceFingerprint)try{const after=await fingerprint(sourceRoot);report.sourceUnchanged=after.sha256===report.sourceFingerprint.sha256;assert.equal(report.sourceUnchanged,true);}catch(e){report.errors.push(errorText(e));}
    report.glErrorDiagnostics=[...report.consoleErrors,...report.consoleWarnings].filter(e=>glDiagnostic(e.text));
    if(report.consoleErrors.length||report.pageErrors.length||report.requestFailures.length||report.glErrorDiagnostics.length)report.errors.push('Browser console/page/network/GL diagnostics failed; retained in full arrays');
    if(report.finalPage?.errors?.length)report.errors.push({pageState:report.finalPage.errors});
    if(Object.keys(report.cleanup).some(k=>k.endsWith('Error')))report.errors.push('Cleanup encountered errors');
    report.result=report.errors.length?'failed':buildOnly?'static-build-only':'passed';report.finishedAt=new Date().toISOString();await persist();if(report.errors.length)process.exitCode=1;
  }
  console.log(JSON.stringify({result:report.result,sourceRevision:report.sourceRevision,report:resolve(out,'report.json'),cases:report.cases.map(c=>({variant:c.variant,frames:c.samples.length}))}));
  if(report.result!=='passed')process.exitCode=1;
}

if(process.argv.includes('--self-check')){
  // Parse the exact browser body without executing any browser/runtime code.
  new vm.Script('('+browserProfile.toString()+')');
  assert.deepEqual(summary([{cpuRenderMs:1,finishWaitMs:2,totalWallMs:3},{cpuRenderMs:3,finishWaitMs:4,totalWallMs:7}]).totalWallMs,{min:3,median:5,max:7});
  assert.ok(glDiagnostic('WebGL: INVALID_OPERATION: texImage2D'));assert.equal(glDiagnostic('GPU stall due to ReadPixels'),false);
  assert.equal(await bounded(Promise.resolve(17),20,'positive'),17);
  await assert.rejects(bounded(new Promise(()=>{}),5,'timeout'),/exceeded 5ms/);
  // Exercise the exact page body with a small instrumented fake renderer. This
  // checks mutation/restoration and failure paths; it is not a rendering test.
  const mesh={isMesh:true,name:'mixed-leaf-and-twig',uuid:'fixture',visible:true,castShadow:true,
    geometry:{attributes:{leafPivot:{count:6,getW:i=>i<3?1:0},position:{count:6}}}};
  let ticks=0,throwDraw=false;const observed=[];
  const gl={finish(){},getParameter(){return 'fixture';},getExtension(){return null;},isContextLost(){return false;},drawingBufferWidth:960,drawingBufferHeight:720};
  const draw=function(){observed.push({visible:mesh.visible,castShadow:mesh.castShadow});if(throwDraw)throw new Error('fixture draw failure');};
  const renderer={render:draw,getContext:()=>gl,getPixelRatio:()=>1,info:{render:{calls:1},memory:{},programs:[]}};
  const view={renderer,scene:{traverse:visit=>visit(mesh)},camera:{position:{toArray:()=>[0,0,0]},quaternion:{toArray:()=>[0,0,0,1]}},
    actorDiagnostics:()=>({rigs:{player:{},sentinel:{},retainer:{},warden:{}}}),beginWorld(){},render(){return renderer.render();}};
  const context={window:{},document:{querySelector:()=>({})},performance:{now:()=>++ticks},innerWidth:960,innerHeight:720,devicePixelRatio:1,addEventListener(){},
    createPresentation:()=>view,createWorld:()=>({time:0,mode:'playing',player:{x:0,z:18},enemies:[{id:'a',x:0,z:1},{id:'b',x:-3,z:-9},{id:'c',x:3,z:-16}]})};
  vm.runInNewContext('('+browserProfile.toString()+')(createPresentation,createWorld,false)',context);
  const api=context.window;assert.equal(api.renderProfileState.status,'ready');assert.equal(api.renderProfileState.leafScan.meshes[0].mixed,true);assert.equal(api.renderProfileState.leafScan.triangles,2);
  api.renderProfileBegin('full');mesh.castShadow=false;const sample=api.renderProfileFrame(0);
  assert.deepEqual(observed.at(-1),{visible:true,castShadow:false});assert.equal(sample.totalWallMs,sample.cpuRenderMs+sample.finishWaitMs);
  api.renderProfileBegin('no-leaf-shadows');api.renderProfileFrame(0);
  assert.deepEqual(observed.at(-1),{visible:true,castShadow:false});assert.equal(mesh.castShadow,true);
  api.renderProfileBegin('no-leaves');api.renderProfileFrame(0);
  assert.deepEqual(observed.at(-1),{visible:false,castShadow:true});assert.equal(mesh.visible,true);
  throwDraw=true;assert.throws(()=>api.renderProfileFrame(1),/fixture draw failure/);assert.equal(mesh.visible,true);assert.equal(mesh.castShadow,true);
  assert.throws(()=>api.renderProfileFrame(13),/Bounded frame/);assert.equal(api.renderProfileRestore().restored,true);assert.equal(renderer.render,draw);
  console.log(JSON.stringify({result:'passed',scope:'static browser-body parse, summary, diagnostic classifier, bounded promises and exact page-body fake-renderer restoration/failure checks only; no Chrome or WebGL'}));
}else await main();
