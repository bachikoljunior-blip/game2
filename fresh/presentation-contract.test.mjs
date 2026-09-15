import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Vector3} from 'three';
import {cameraTrackingTranslation,computeCameraFrame,foregroundObstacleOpacity,interpolateCameraFrame,usesArrivalFrame,usesRejoinVista} from './camera-framing.js';
import {SIGNAL} from './mission.js';
import {ROUTE_FORK,routeCenterAt} from './route-layout.js';
import {createCharacterRig} from './character-rig.js';
import {EXPLORATION} from './exploration.js';
import {groundHeightAt} from './terrain.js';

test('ordinary tracking keeps the actual actor in frame throughout all circuits even with250ms simulation frames',()=>{
  const camera=new PerspectiveCamera(52,16/9,.1,230),point=new Vector3();
  for(const loop of EXPLORATION.loops)for(const dt of [1/60,.25]){
    const world={mode:'playing',routePhase:'approach',routeChoice:null,locked:null,enemies:[],player:{x:loop.nodes[0].x,z:loop.nodes[0].z,hp:100}};
    const current=computeCameraFrame(world,0,16/9,{});
    for(const goal of loop.nodes.slice(1)){
      while(Math.hypot(goal.x-world.player.x,goal.z-world.player.z)>.0001){
        const previous={...world.player},distance=Math.hypot(goal.x-previous.x,goal.z-previous.z),step=Math.min(distance,3.8*dt);
        world.player.x+=(goal.x-previous.x)/distance*step;world.player.z+=(goal.z-previous.z)/distance*step;
        interpolateCameraFrame(current,computeCameraFrame(world,0,16/9,{}),dt,true,cameraTrackingTranslation(world,previous));
        camera.position.set(current.x,current.y,current.z);camera.lookAt(current.lookX,current.lookY,current.lookZ);camera.updateMatrixWorld();
        for(const height of [.08,1.9]){
          point.set(world.player.x,groundHeightAt(world.player.x,world.player.z)+height,world.player.z).project(camera);
          assert.ok(Math.abs(point.x)<.75&&Math.abs(point.y)<.85&&point.z>-1&&point.z<1,`${loop.id} ${dt}: grounded actor remains visible`);
        }
        assert.ok(Math.abs(current.lookX-world.player.x)<.02,'no accumulating lateral lag');
      }
    }
  }
});

test('junction and arrival cameras release to player follow on every optional walk',()=>{
  for(const place of EXPLORATION.points){
    const world={mode:'playing',routeChoice:'left',routePhase:'branch',pathCleared:false,signalLit:false,locked:null,
      player:{x:place.x,z:place.z,hp:100},enemies:[{id:'retainer',hp:0}]};
    assert.equal(usesRejoinVista(world),false,place.id+' after chosen-route duel');
    world.routePhase='rejoined';world.pathCleared=true;
    assert.equal(usesArrivalFrame(world),false,place.id+' after all duels');
    const frame=computeCameraFrame(world,0,844/390,{});
    assert.ok(Math.hypot(frame.x-place.x,frame.z-place.z)<6,place.id+' keeps player-following distance');
    assert.equal(frame.lookX,place.x);
  }
});

const angle=(camera,a,b)=>{
  const ax=a.x-camera.x,az=a.z-camera.z,bx=b.x-camera.x,bz=b.z-camera.z;
  return Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(Math.hypot(ax,az)*Math.hypot(bx,bz)))));
};

test('locked camera separates player and close target instead of stacking them',()=>{
  const player={x:0,z:0,hp:100},enemy={id:'sentinel',x:0,z:-1.8,hp:100};
  const frame=computeCameraFrame({player,enemies:[enemy],locked:enemy.id},0,16/9,{});
  assert.ok(Math.abs(frame.x-player.x)>1.7);
  assert.ok(angle(frame,player,enemy)>.18);
  assert.ok(frame.lookZ<player.z,'focus leads toward the locked target');
});

test('portrait framing preserves a smaller lateral offset',()=>{
  const player={x:2,z:3,hp:100},enemy={id:'sentinel',x:2,z:-5,hp:100};
  const landscape=computeCameraFrame({player,enemies:[enemy],locked:enemy.id},0,16/9,{});
  const portrait=computeCameraFrame({player,enemies:[enemy],locked:enemy.id},0,9/16,{});
  assert.ok(Math.abs(portrait.x-player.x)<Math.abs(landscape.x-player.x));
});

test('a reversing lock bearing cannot pull the interpolated camera overhead',()=>{
  const world={player:{x:0,z:0,hp:100},enemies:[{id:'e',x:0,z:-1.8,hp:100}],locked:'e'};
  const current=computeCameraFrame(world,0,844/390,{});
  world.enemies[0].z=1.8;
  const desired=computeCameraFrame(world,0,844/390,{});
  // This interval makes the previous Cartesian lerp pass exactly through the duel.
  interpolateCameraFrame(current,desired,Math.log(2)/8,true);
  assert.ok(Math.hypot(current.x-current.lookX,current.z-current.lookZ)>4.5);
  for(let n=0;n<60;n++){
    world.enemies[0].z=n%2?1.8:-1.8;
    interpolateCameraFrame(current,computeCameraFrame(world,0,844/390,{}),1/60,true);
    assert.ok(Math.hypot(current.x-current.lookX,current.z-current.lookZ)>4.5);
  }
});

test('large authored composition changes remain continuous after a dropped frame',()=>{
  const world={mode:'playing',pathCleared:false,routeChoice:'left',routePhase:'branch',signalLit:false,
    player:{x:-3.4,z:-13,hp:100},enemies:[{id:'retainer',hp:0}],locked:null};
  const current={x:-2.55,y:2.8,z:-7.2,lookX:-3.4,lookY:1.25,lookZ:-13.6};
  const wanted=computeCameraFrame(world,0,16/9,{}),before={...current};
  interpolateCameraFrame(current,wanted,.1,true);
  assert.ok(Math.abs(current.y-before.y)<=.4+1e-9,'one delayed render cannot jump vertically into the vista');
  assert.ok(Math.hypot(current.x-before.x,current.z-before.z)<=.7+1e-9,'one delayed render cannot cut horizontally to the vista');
  for(let n=0;n<100;n++)interpolateCameraFrame(current,wanted,.1,true);
  assert.ok(Math.max(...['x','y','z','lookX','lookY','lookZ'].map(key=>Math.abs(current[key]-wanted[key])))<.18,
    'the bounded transition still settles within the browser composition gate');
});

test('vista exit and arrival entry retain the same per-frame continuity bound',()=>{
  const rightVista={mode:'playing',pathCleared:false,routeChoice:'right',routePhase:'branch',signalLit:false,
    player:{x:4.5,z:-13,hp:100},enemies:[{id:'warden',hp:0}],locked:null};
  const ordinary={...rightVista,routePhase:'rejoined',player:{x:.5,z:-17.5,hp:100},enemies:[],routeChoice:'right'};
  const locked={...ordinary,player:{x:0,z:-18,hp:100},enemies:[{id:'sentinel',x:0,z:-19.4,hp:100}],locked:'sentinel'};
  const arrival={...ordinary,pathCleared:true,signalLit:false,locked:null,enemies:[]};
  for(const [from,to] of [[computeCameraFrame(rightVista,0,16/9,{}),computeCameraFrame(ordinary,0,16/9,{})],
    [computeCameraFrame(locked,0,16/9,{}),computeCameraFrame(arrival,0,16/9,{})]]){
    const current={...from},before={...from};
    interpolateCameraFrame(current,to,.1,true);
    assert.ok(Math.abs(current.y-before.y)<=.4+1e-9);
    assert.ok(Math.hypot(current.x-before.x,current.z-before.z)<=.7+1e-9);
    for(let n=0;n<100;n++)interpolateCameraFrame(current,to,.1,true);
    assert.ok(Math.max(...['x','y','z','lookX','lookY','lookZ'].map(key=>Math.abs(current[key]-to[key])))<.18);
  }
});

test('post-rejoin unlocked descent makes the later lock satisfy the unchanged duel angle',()=>{
  for(const [route,aspect,enemy] of [
    ['left',16/9,{id:'warden',x:3,z:-16,hp:100}],
    ['right',844/390,{id:'retainer',x:-3,z:-9,hp:100}]
  ]){
    const vista={mode:'playing',pathCleared:false,routeChoice:route,routePhase:'branch',signalLit:false,
      player:{x:routeCenterAt(route,-13),z:-13,hp:100},enemies:[{id:route==='left'?'retainer':'warden',hp:0}],locked:null};
    const ordinary={...vista,routePhase:'rejoined',player:{x:route==='left'?-.5:.5,z:-17.5,hp:100},enemies:[enemy],locked:null};
    const current=computeCameraFrame(vista,0,aspect,{});
    let downAngleDegrees=Infinity;
    for(let n=0;n<600&&downAngleDegrees>30;n++){
      interpolateCameraFrame(current,computeCameraFrame(ordinary,0,aspect,{}),1/60,true);
      const horizontal=Math.hypot(current.x-current.lookX,current.z-current.lookZ);
      downAngleDegrees=Math.atan2(current.y-current.lookY,horizontal)*180/Math.PI;
    }
    assert.ok(downAngleDegrees<=30,'the unlocked guard dwell must have a finite safe endpoint');
    ordinary.locked=enemy.id;
    for(let n=0;n<240;n++){
      interpolateCameraFrame(current,computeCameraFrame(ordinary,0,aspect,{}),1/60,true);
      const horizontal=Math.hypot(current.x-current.lookX,current.z-current.lookZ);
      downAngleDegrees=Math.atan2(current.y-current.lookY,horizontal)*180/Math.PI;
      assert.ok(downAngleDegrees<=35,'lock may start only after the continuous camera descent satisfies the original limit');
    }
  }
});

test('coincident fighters retain a finite camera direction and standoff',()=>{
  const world={player:{x:2,z:1,hp:100,yaw:.7},enemies:[{id:'e',x:2,z:1,hp:100}],locked:'e'};
  const frame=computeCameraFrame(world,0,390/844,{});
  assert.ok(Object.values(frame).every(Number.isFinite));
  assert.ok(Math.hypot(frame.x-frame.lookX,frame.z-frame.lookZ)>4.5);
});

test('victory framing shows the signal from an authored oblique angle',()=>{
  const world={mode:'victory',player:{x:.4,z:-18.8,hp:100},enemies:[],locked:null};
  const frame=computeCameraFrame(world,0,16/9,{});
  assert.ok(frame.x>4,'camera moves beside the signal instead of facing the wall from behind the player');
  assert.ok(frame.z>-14,'camera retains the shrine, signal and player in depth');
  assert.ok(frame.lookZ<-18.5,'camera looks back toward the lit signal');
});

test('pre-rejoin vista contains both physical route exits and their shared join',()=>{
  const world={mode:'playing',pathCleared:false,routeChoice:'left',routePhase:'branch',signalLit:false,
    player:{x:-3.4,z:-13,hp:100},enemies:[{id:'retainer',hp:0}],locked:null};
  assert.equal(usesRejoinVista(world),true);
  const frame=computeCameraFrame(world,0,16/9,{});
  assert.ok(frame.y>=11,'rejoin camera must rise above the unchanged solid ridge');
  const camera=new PerspectiveCamera(52,16/9,.1,230);
  camera.position.set(frame.x,frame.y,frame.z);
  camera.lookAt(frame.lookX,frame.lookY,frame.lookZ);
  camera.updateMatrixWorld();
  const exitZ=ROUTE_FORK.obstacleBackZ-.3;
  const subjects=[
    new Vector3(routeCenterAt('left',exitZ),0,exitZ),
    new Vector3(routeCenterAt('right',exitZ),0,exitZ),
    new Vector3(0,0,ROUTE_FORK.rejoinZ),
    new Vector3(world.player.x,1.1,world.player.z)
  ];
  for(const subject of subjects){
    const projected=subject.project(camera);
    assert.ok(Math.abs(projected.x)<.92&&Math.abs(projected.y)<.92&&projected.z>-1&&projected.z<1,
      'each route exit and the shared join must fit the authored landscape frame');
  }
  const rayHeight=frame.y+(0-frame.y)*(ROUTE_FORK.obstacleBackZ-frame.z)/(ROUTE_FORK.rejoinZ-frame.z);
  assert.ok(rayHeight>ROUTE_FORK.obstacle.h+.3,'the sightline to the join must clear the unchanged ridge height');
  for(const [route,enemyId] of [['left','retainer'],['right','warden']])for(const aspect of [16/9,844/390]){
    const routeWorld={...world,routeChoice:route,player:{...world.player,x:routeCenterAt(route,world.player.z)},enemies:[{id:enemyId,hp:0}]};
    const routeFrame=computeCameraFrame(routeWorld,0,aspect,{}),routeCamera=new PerspectiveCamera(52,aspect,.1,230);
    routeCamera.position.set(routeFrame.x,routeFrame.y,routeFrame.z);routeCamera.lookAt(routeFrame.lookX,routeFrame.lookY,routeFrame.lookZ);routeCamera.updateMatrixWorld();
    const player=new Vector3(routeWorld.player.x,1.1,routeWorld.player.z).project(routeCamera);
    assert.ok(Math.abs(player.x)<.92&&Math.abs(player.y)<.92&&player.z>-1&&player.z<1,`${route} player must remain in the landscape vista`);
  }
  assert.equal(usesRejoinVista({...world,enemies:[{id:'retainer',hp:1}]}),false,'the view must not bypass the chosen encounter');
  assert.equal(usesRejoinVista({...world,routePhase:'rejoined'}),false,'the view ends at the real simulation transition');
});

test('unlit arrival uses the same oblique signal frame as victory and clears the shrine lattice',()=>{
  const player={x:.4,z:-18.2,hp:100};
  const arrival={mode:'playing',pathCleared:true,routePhase:'rejoined',signalLit:false,player,enemies:[],locked:null};
  const victory={mode:'victory',pathCleared:true,routePhase:'rejoined',signalLit:true,player,enemies:[],locked:null};
  assert.equal(usesArrivalFrame(arrival),true);
  const before=computeCameraFrame(arrival,0,16/9,{}),after=computeCameraFrame(victory,0,16/9,{});
  assert.deepEqual(before,after,'lighting the signal must not cut to another camera');
  const xAt=z=>before.x+(SIGNAL.x-before.x)*(z-before.z)/(SIGNAL.z-before.z);
  assert.ok(Math.abs(xAt(-19.45))>.08,'signal sightline must clear the central red shrine bar');
  const brassX=xAt(-19.39),nearestBrass=-3.8+Math.round((brassX+3.8)/.25)*.25;
  assert.ok(Math.abs(brassX-nearestBrass)>.0125,'signal sightline must clear the fine brass lattice');
  for(const aspect of [16/9,844/390])for(const position of [{x:0,z:SIGNAL.z+SIGNAL.radius},{x:SIGNAL.radius-.05,z:SIGNAL.z}]){
    const staged={...arrival,player:{...player,...position}},stagedFrame=computeCameraFrame(staged,0,aspect,{});
    const camera=new PerspectiveCamera(52,aspect,.1,230);camera.position.set(stagedFrame.x,stagedFrame.y,stagedFrame.z);camera.lookAt(stagedFrame.lookX,stagedFrame.lookY,stagedFrame.lookZ);camera.updateMatrixWorld();
    for(const subject of [new Vector3(position.x,1.1,position.z),new Vector3(SIGNAL.x,3.15,SIGNAL.z),new Vector3(0,5.5,-23)]){
      const projected=subject.project(camera);
      assert.ok(Math.abs(projected.x)<.92&&Math.abs(projected.y)<.92&&projected.z>-1&&projected.z<1,'arrival-stage player, signal and shrine must share the landscape frame');
    }
  }
});

test('only the near foreground torii post fades for the verified first encounter frame',()=>{
  const camera={x:-3.8547,z:11.0246},focus={x:0,z:6.176};
  assert.ok(foregroundObstacleOpacity(camera,focus,{x:-3.5,z:7})<=.2);
  assert.equal(foregroundObstacleOpacity(camera,focus,{x:3.5,z:7}),1);
  assert.equal(foregroundObstacleOpacity({x:-3.5,z:15},focus,{x:-3.5,z:7}),1);
});

test('interface gives labels an opaque backing and keeps victory title off the lamp',()=>{
  const css=readFileSync(new URL('./mission.css',import.meta.url),'utf8');
  const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  assert.match(css,/#objective,#enemy\{[^}]*background:#10191d/);
  assert.match(css,/#enemy:empty\{display:none\}/);
  assert.match(css,/#menu\[data-mode="victory"\] h1/);
  assert.match(css,/#menu\[data-mode="victory"\] \.result-heading\{display:block/);
  assert.match(css,/#menu\[data-mode="victory"\]::before/);
  assert.match(css,/@media\(max-aspect-ratio:4\/5\)/);
  assert.match(html,/class="result-heading">灯、谷へ</);
  assert.match(main,/menu\.dataset\.mode=world\.mode/);
  assert.match(main,/input\.setActive\(false\);hud\.hidden=true;menu\.hidden=false/);
});

test('generated landscape replaces flat background and cone bamboo without external assets',()=>{
  const source=readFileSync(new URL('./presentation.js',import.meta.url),'utf8');
  assert.match(source,/new T\.ShaderMaterial/);
  assert.match(source,/new T\.PlaneGeometry\(160,200,64,80\)/);
  // Leaf surface generation is now a module with several small twig variants;
  // the actual silhouette, sizing and attachment are exercised by its scene
  // tests. Keep the original no-external-assets contract across that boundary.
  const leafSource=readFileSync(new URL('./leaf-surface.js',import.meta.url),'utf8');
  assert.match(source,/createBambooLeafGeometry/);
  assert.doesNotMatch(leafSource,/TextureLoader|\.glb|\.gltf|fetch\(/);
  assert.match(source,/new T\.DodecahedronGeometry/);
  assert.match(source,/const rim=new T\.DirectionalLight/);
  assert.match(readFileSync(new URL('./character-rig.js',import.meta.url),'utf8'),/new T\.CircleGeometry\(\.46,20\)/);
  assert.match(source,/signalHalo\.visible=world\.signalLit/);
  assert.doesNotMatch(source,/new T\.ConeGeometry\(1\.6-j\*\.22,2\.5,5\)/);
  assert.doesNotMatch(source,/TextureLoader|\.glb|\.gltf|fetch\(/);
});

test('scene and actor pass preserves density while clearing combat silhouettes and sheathing the victory pose',()=>{
  const source=readFileSync(new URL('./presentation.js',import.meta.url),'utf8');
  assert.match(source,/new T\.InstancedMesh\(grassGeo,grassMat,3000\)/);
  assert.match(source,/\(near\?4\.8:9\)/);
  assert.match(source,/const centers=routePathCenters\(z\)/);
  assert.match(source,/playerBlade=material\('#e7f4f4'/);
  assert.match(source,/enemyBlade=material\('#ffe0a6'/);
  assert.match(source,/enemyBlade\.emissiveIntensity=\.24/);
  for(const id of ['player','sentinel','retainer','warden']){
    const rig=createCharacterRig(id);
    assert.ok(rig.metrics.generatedParts>=40,'all actors retain detailed generated bodies');
    assert.equal(rig.scabbard.name,'scabbard');assert.equal(rig.blade.name,'curved-blade');
    assert.equal(rig.limbs.length,2);assert.ok(rig.limbs.every(l=>l.knee&&l.ankle&&l.elbow&&l.wrist));
  }
  assert.match(source,/updateCharacterRig\(r,a,world,dt,\{animate,groundHeightAt\}\)/);
});

test('foreground, signal, actor and branching-route hierarchy use the shared gameplay geometry',()=>{
  const source=readFileSync(new URL('./presentation.js',import.meta.url),'utf8');
  const simulation=readFileSync(new URL('./simulation.js',import.meta.url),'utf8');
  assert.match(source,/const toriiPosts=\[\]/);
  assert.match(source,/foregroundObstacleOpacity\(smoothedFrame,look,post\.obstacle\)/);
  assert.match(source,/const SIGNAL_HEIGHT=3\.15/);
  assert.match(source,/signalLight\.intensity=world\.signalLit\?flame\.light:0/);
  assert.match(source,/const flame=signalFlame\(/);
  assert.match(simulation,/\{ x: -3\.5, z: 7, w: \.55, d: \.55, h: 4\.5, kind: 'torii' \}/);
  assert.match(simulation,/\{ x: 3\.5, z: 7, w: \.55, d: \.55, h: 4\.5, kind: 'torii' \}/);
  assert.match(simulation,/ROUTE_FORK\.obstacle/);
  assert.match(source,/if\(o\.kind==='torii'\)/);
  assert.match(source,/else if\(o\.kind==='shrine'\)/);
  assert.match(source,/const fork=ROUTE_FORK\.obstacle/);
  assert.match(source,/ROUTE_FORK\.left\.markers/);
  assert.match(source,/ROUTE_FORK\.right\.markers/);
  assert.match(source,/installWindMaterial\(routeCloth,wind,'cloth'\)/);
  assert.match(source,/rejoinSightlineClearance/);
  assert.match(source,/rejoinFrameError/);
  assert.match(source,/arrivalFrameError/);
});

test('route checkpoint images are decoded after capture instead of perturbing held movement',()=>{
  const browser=readFileSync(new URL('./browser-smoke.mjs',import.meta.url),'utf8');
  const matrix=readFileSync(new URL('./route-matrix-smoke.mjs',import.meta.url),'utf8');
  const rejoin=readFileSync(new URL('./rejoin-evidence.mjs',import.meta.url),'utf8');
  const verifier=readFileSync(new URL('./verify-recordings.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/fresh-game.yml',import.meta.url),'utf8');
  for(const source of [browser,matrix]){
    const start=source.indexOf('held=new Set');
    const end=source.indexOf('for(const key of held)',start);
    assert.ok(start>=0&&end>start);
    assert.doesNotMatch(source.slice(start,end),/screenshot\(/,'live route observation must not leave movement held during image encoding');
    assert.match(source,/routePhase==='branch'&&w\.routeChoice/,'route-side samples must stop after physical reconvergence');
    assert.match(source,/tapLockUntilObserved/,'touch combat must wait for one lock pulse instead of queuing lock toggles');
  }
  assert.match(browser,/preflightBrowser\.close\(\)[\s\S]*recording\('touch'/,'recorded touch mission must start in a browser launched after preflight closes');
  const recordedTouchStart=browser.indexOf("const mobileRecording=recording('touch'");
  assert.doesNotMatch(browser.slice(recordedTouchStart),/mobile\.reload\(/,'recorded touch mission must not reuse a preflight page through reload');
  assert.match(workflow,/browser-smoke\.mjs \|\| browser_status=\$\?[\s\S]*route-matrix-smoke\.mjs \|\| matrix_status=\$\?/,'one failed apparatus must not suppress the other route evidence');
  assert.match(verifier,/\['full-mission-start','fork-entry','route-choice','rejoin-approach','route-rejoin','rejoin-camera-settled','post-rejoin-shrine-view','destination-arrival','signal-input','signal-lit','victory','clean-retry','context-close'\]/);
  for(const source of [browser,matrix])assert.match(source,/settleRejoinAndLock\(/,'both apparatuses use the tested guard, retreat, camera-descent and single-lock sequence');
  assert.match(rejoin,/settled\.locked===null&&settled\.playerState==='guard'&&settled\.downAngleDegrees<=30/);
  assert.match(rejoin,/await controls\.guard\(\)/);
  assert.match(matrix,/result\.camera=await cameraContract\(page\)/,'both complementary routes must retain the unchanged final camera contract');
  assert.match(verifier,/routeSpecificEvents=\[landmark,consequence\]\.sort\(\(a,b\)=>a\.detail\.time-b\.detail\.time/);
  assert.match(verifier,/\['fork-entry',\.\.\.routeSpecificEvents,'route-rejoin','destination-arrival'\]/);
  assert.match(verifier,/fixed-five frames must be byte-distinct/);
  assert.match(verifier,/fully decoded before event checks/);
  assert.match(verifier,/for\(const id of expectedIds\)/,'raw filenames must be discovered independently of parsed report entries');
  assert.ok(verifier.indexOf("ff(['-xerror'")<verifier.indexOf("ordered(item.events"),'raw full decode must precede event-metadata assertions');
  assert.match(verifier,/snapshotBytes>0/);
});
