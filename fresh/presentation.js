import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OBSTACLES } from './simulation.js';
import { SIGNAL } from './mission.js';
import { cameraTrackingTranslation, computeCameraFrame, foregroundObstacleOpacity, interpolateCameraFrame, usesArrivalFrame, usesRejoinVista } from './camera-framing.js';
import { groundHeightAt, terrainVertexHeight, shrineBaseSize } from './terrain.js';
import { indexForBatch } from './batch-geometry.js';
import { spatialCell, partitionInstances } from './spatial-batches.js';
import { ROUTE_FORK, distanceFromRoute, routeCenterAt, routePathCenters, routePathLength } from './route-layout.js';
import { EXPLORATION, explorationClearingDistance, explorationSolid } from './exploration.js';
import { advanceEnvironmentClock, createEnvironmentClock, installWindMaterial, sampleWind, signalFlame } from './wind.js';
import { createCharacterResources, createCharacterRig } from './character-rig.js';
import { seedCharacterRig, updateCharacterRig } from './character-motion.js';
import { followSunShadow, SUN_SHADOW } from './sun-shadow.js';
import { characterSightPoints, createForegroundVisibility } from './foreground-visibility.js';
import { createGrassClumpGeometry } from './grass-shape.js';
import { createSceneArt } from './scene-art.js';
import { groundSurfaceAt } from './scene-surface.js';
import { createVegetationPhysics, setLeafAttachment, transformLeafGeometry } from './vegetation-physics.js';
import { createMapleLeafGeometry, createBambooLeafGeometry, configureLeafSurface } from './leaf-surface.js';
import { createFrondAtlas, remapBambooLeafUv, addBambooCrownLoad, installFrondCutout, projectedFrondDragArea } from './bamboo-frond.js';
import { createFoliageLod } from './foliage-lod.js';

const clamp = T.MathUtils.clamp;
export function createPresentation(canvas,{characterResources}={}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  const scene = new T.Scene(); scene.fog = new T.FogExp2('#bcab94',.009);
  const camera = new T.PerspectiveCamera(52,1,.1,230);
  const foreground=createForegroundVisibility(),foliageLod=createFoliageLod();let foliagePixelHeight=720;
  scene.add(new T.HemisphereLight('#a4bfd3','#42372a',1.55));
  const sun = new T.DirectionalLight('#ffd29a',3.4); sun.position.set(-24,18,-42); sun.castShadow=true;
  sun.shadow.mapSize.set(SUN_SHADOW.mapSize,SUN_SHADOW.mapSize); Object.assign(sun.shadow.camera,{left:-SUN_SHADOW.width/2,right:SUN_SHADOW.width/2,top:SUN_SHADOW.height/2,bottom:-SUN_SHADOW.height/2,near:1,far:110});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-.0004; sun.shadow.normalBias=.025; scene.add(sun,sun.target);
  const rim=new T.DirectionalLight('#b6c6d0',1.35);rim.position.set(18,12,22);scene.add(rim);
  let seed = 310519;
  const random = () => { seed = (1664525*seed+1013904223)>>>0; return seed/4294967296; };
  const material = (color, roughness=.85, metalness=0) => new T.MeshStandardMaterial({color,roughness,metalness});
  const bark=material('#485647'),bambooNode=material('#91906b'),red=material('#92432d'),stone=material('#7f8275'),roof=material('#303e3d'),
    leaf=material('#72834c'),brass=material('#c5a36b',.35,.65),skin=material('#b49478'),dark=material('#181f25'),
    routeCloth=material('#b94f2f',.72,.02),routeBinding=material('#b7a477',.62,.08),
    playerBlade=material('#e7f4f4',.16,.92),enemyBlade=material('#ffe0a6',.22,.82);
  playerBlade.emissive.set('#7397a1');playerBlade.emissiveIntensity=.13;
  enemyBlade.emissive.set('#a64b24');enemyBlade.emissiveIntensity=.24;
  leaf.side=T.DoubleSide;
  const wind={value:0};
  const vegetation=createVegetationPhysics(sampleWind);wind.vegetation=vegetation;
  const vegetationSpecimens={};scene.userData.vegetationSpecimens=vegetationSpecimens;
  const environmentClock=createEnvironmentClock(),encounterClocks=new Map();let signalIgnition=null;
  const bambooBark=bark.clone(),autumnLeaf=material('#ae6734');autumnLeaf.side=T.DoubleSide;
  configureLeafSurface(leaf,'bamboo');configureLeafSurface(autumnLeaf,'maple');
  const frondAtlas=createFrondAtlas(leaf);
  const vegetationMaterials=new Set([leaf,bambooBark,bambooNode,autumnLeaf]);
  vegetationMaterials.forEach(mat=>installWindMaterial(mat,wind));
  const leafDepth=installWindMaterial(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide}),wind);
  let bambooLeafDepth;
  routeCloth.side=T.DoubleSide;
  routeCloth.emissive.set('#4b140d');routeCloth.emissiveIntensity=.18;
  installWindMaterial(routeCloth,wind,'cloth');
  // The visible cloth and its depth pass share the exact pinned edge.
  const clothDepth=installWindMaterial(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide}),wind,'cloth');
  // A generated atmospheric dome and sun establish one continuous magic-hour light field.
  const sky=new T.Mesh(new T.SphereGeometry(190,32,18),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{sunDirection:{value:new T.Vector3(-24,18,-42).normalize()}},
    vertexShader:'varying vec3 ray; void main(){ray=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 ray; uniform vec3 sunDirection; void main(){vec3 r=normalize(ray);float h=smoothstep(-.14,.7,r.y);vec3 horizon=vec3(.84,.59,.38);vec3 zenith=vec3(.16,.27,.38);float glow=pow(max(dot(r,sunDirection),0.),16.);float bands=sin(r.x*12.+r.z*8.+r.y*27.)*.5+sin(r.x*25.-r.z*19.+r.y*42.)*.24;float cloud=smoothstep(.24,.62,bands)*smoothstep(.08,.25,r.y)*(1.-smoothstep(.5,.72,r.y));vec3 c=mix(horizon,zenith,h)+vec3(1.,.44,.12)*glow*.36;c=mix(c,vec3(.65,.43,.36),cloud*.26);gl_FragColor=vec4(c,1.);}'
  }));scene.add(sky);
  const sunCanvas=document.createElement('canvas');sunCanvas.width=sunCanvas.height=128;
  const sunCtx=sunCanvas.getContext('2d'),sunGradient=sunCtx.createRadialGradient(64,64,4,64,64,62);
  sunGradient.addColorStop(0,'rgba(255,246,207,1)');sunGradient.addColorStop(.18,'rgba(255,209,132,.95)');sunGradient.addColorStop(.5,'rgba(255,143,75,.24)');sunGradient.addColorStop(1,'rgba(255,120,55,0)');
  sunCtx.fillStyle=sunGradient;sunCtx.fillRect(0,0,128,128);
  const sunSprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(sunCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  sunSprite.position.copy(sun.position).normalize().multiplyScalar(110);sunSprite.scale.set(24,24,1);scene.add(sunSprite);
  // Generated grain has no external texture request.
  const texCanvas=document.createElement('canvas');texCanvas.width=texCanvas.height=256;
  const ctx=texCanvas.getContext('2d');ctx.fillStyle='#b9b5a1';ctx.fillRect(0,0,256,256);
  for(let i=0;i<6500;i++){ctx.fillStyle=`rgba(${random()<.55?'40,43,30':'235,221,170'},${.05+random()*.18})`;ctx.fillRect(random()*256,random()*256,1+random()*6,1+random()*3);}
  for(let i=0;i<95;i++){ctx.strokeStyle='rgba(54,54,39,.1)';ctx.beginPath();const x=random()*256,y=random()*256;ctx.moveTo(x,y);ctx.lineTo(x+random()*18-9,y+random()*20);ctx.stroke();}
  const texture=new T.CanvasTexture(texCanvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(32,40);texture.colorSpace=T.SRGBColorSpace;
  const sceneArt=createSceneArt(scene,foreground),groundMat=sceneArt.ground;
  const stoneTexture=texture.clone();stoneTexture.repeat.set(1.3,1.3);stone.map=stoneTexture;stone.bumpMap=stoneTexture;stone.bumpScale=.06;
  const batches=new Map();const matrix=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3(),pos=new T.Vector3();
  function queuePart(geometry,mat,x,z){
    if(!batches.has(mat))batches.set(mat,new Map());
    const cells=batches.get(mat),key=vegetationMaterials.has(mat)?spatialCell(x,z):'all';
    if(!cells.has(key))cells.set(key,[]);cells.get(key).push(geometry);
  }
  function staticPart(geometry,mat,x,y,z,sx=1,sy=1,sz=1,ry=0){
    indexForBatch(geometry);
    q.setFromAxisAngle(T.Object3D.DEFAULT_UP,ry);matrix.compose(pos.set(x,y,z),q,s.set(sx,sy,sz));geometry.applyMatrix4(matrix);
    queuePart(geometry,mat,x,z);
  }
  const box=(m,x,y,z,w,h,d,ry=0)=>staticPart(new T.BoxGeometry(1,1,1),m,x,y,z,w,h,d,ry);
  const column=(m,x,y,z,r,h)=>staticPart(new T.CylinderGeometry(r*.88,r,h,8),m,x,y,z);
  function vegetationRoot(x,y,z,height,kind){
    return {x,y,z,height,kind,beam:vegetation.addBeam({kind,start:[x,y,z],end:[x,y+height,z]})};
  }
  function windPart(g,mat,beam,x,y,z,sx=1,sy=1,sz=1,ry=0){
    indexForBatch(g);q.setFromAxisAngle(T.Object3D.DEFAULT_UP,ry);
    transformLeafGeometry(g,new T.Matrix4().compose(new T.Vector3(x,y,z),q,new T.Vector3(sx,sy,sz)));
    vegetation.bindGeometry(g,beam);queuePart(g,mat,x,z);
  }
  function leafBranch(x,y,z,endX,endY,endZ,root,mat=leaf,thickness=.023,parent=root.beam,kind=root.kind==='bamboo'?'bambooBranch':'woodBranch'){
    const start=new T.Vector3(x,y,z),end=new T.Vector3(endX,endY,endZ),delta=end.clone().sub(start),length=delta.length();
    const beam=vegetation.addBeam({kind,start:start.toArray(),end:end.toArray(),parent});
    const g=new T.CylinderGeometry(thickness*.35,thickness,length,5,2,true);
    if(mat.vertexColors)g.setAttribute('color',new T.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(.58),3));
    const rotation=new T.Quaternion().setFromUnitVectors(T.Object3D.DEFAULT_UP,delta.normalize());
    g.applyMatrix4(new T.Matrix4().compose(start.add(end).multiplyScalar(.5),rotation,new T.Vector3(1,1,1)));
    if(mat===leaf)remapBambooLeafUv(g);
    vegetation.bindGeometry(g,beam);queuePart(g,mat,(x+endX)/2,(z+endZ)/2);return beam;
  }
  const groundGeometry=new T.PlaneGeometry(160,200,64,80);groundGeometry.rotateX(-Math.PI/2);
  const groundPosition=groundGeometry.getAttribute('position');
  const groundColors=[],soilDeposits=[],groundColor=new T.Color();
  for(let i=0;i<groundPosition.count;i++){
    const x=groundPosition.getX(i),z=groundPosition.getZ(i);
    groundPosition.setY(i,terrainVertexHeight(x,z));
    const surface=groundSurfaceAt(x,z,groundColor);soilDeposits.push(surface.deposit);
    groundColors.push(groundColor.r,groundColor.g,groundColor.b);
  }
  groundGeometry.setAttribute('color',new T.Float32BufferAttribute(groundColors,3));
  groundGeometry.setAttribute('soilDeposit',new T.Float32BufferAttribute(soilDeposits,1));
  groundGeometry.computeVertexNormals();
  const ground=new T.Mesh(groundGeometry,groundMat);ground.receiveShadow=true;scene.add(ground);
  // One approach visibly divides around the solid ridge and joins again at the
  // shrine. Each z/x sample consumes one noise bundle, so adding the second
  // authored centre does not randomise the rest of the established valley.
  let routeStoneTiles=0;
  for(let z=-19;z<24;z+=1.1)for(let x=-.65;x<=.6501;x+=.325){
    const centers=routePathCenters(z),jitter=(random()-.5)*.06,w=.27+random()*.05,d=.89+random()*.13;
    const y=.005+random()*.016,rotation=(random()-.5)*.06;
    for(const center of centers){sceneArt.addPaver(center+x+jitter,y,z+jitter,w,d,rotation);routeStoneTiles++;}
  }
  // Two low generated binding-stone traces make the unchanged physical exits
  // legible from the postcombat overview. They meet at one shared stone after
  // the ridge; they are visual floor detail, not collision or route telemetry.
  let routeBindingStones=0;
  for(let z=ROUTE_FORK.obstacleBackZ-.25;z>ROUTE_FORK.rejoinZ;z-=.5){
    for(const x of routePathCenters(z)){
      const y=groundHeightAt(x,z);
      box(routeBinding,x,y+.055,z,.16,.07,.3);routeBindingStones++;
    }
  }
  box(routeBinding,0,groundHeightAt(0,ROUTE_FORK.rejoinZ)+.065,ROUTE_FORK.rejoinZ,.82,.09,.36);
  routeBindingStones++;
  const toriiPosts=[];
  for(const o of OBSTACLES){if(o.kind==='torii'){
    const postMaterial=red.clone();postMaterial.transparent=true;
    const post=new T.Mesh(new T.CylinderGeometry(.3*.88,.3,o.h,8),postMaterial);
    post.position.set(o.x,o.h/2,o.z);post.castShadow=post.receiveShadow=true;scene.add(post);
    toriiPosts.push({mesh:post,obstacle:o,opacity:1});
  }else if(o.kind==='shrine'){
    sceneArt.addShrine(o);
  }}
  box(red,0,4.1,7,8.4,.25,.38);box(dark,0,4.65,7,9,.28,.6);box(red,0,4.35,7,.42,.5,.35);
  for(const x of [-3.5,3.5]){box(stone,x,.12,7,.8,.24,.8);box(dark,x,.6,7,.61,.16,.61);}
  for(let z=-15;z<22;z+=9)for(const x of [-7.2,7.2]){
    const y=groundHeightAt(x,z);
    box(stone,x,y+.18,z,.95,.36,.95);column(stone,x,y+.75,z,.18,.95);
    box(stone,x,y+1.45,z,.7,.14,.7);box(brass,x,y+1.68,z,.34,.35,.34);box(roof,x,y+1.99,z,.85,.16,.85);
  }
  // The low rock spine occupies the same footprint as ROUTE_FORK.obstacle.
  // A continuous buried foot and fractured profiles cover the physical spine;
  // the art module has its own seed and preserves the valley random sequence.
  const fork=ROUTE_FORK.obstacle;
  sceneArt.addRidge(fork);
  // Left: compact generated stone lamps signal the shorter, earlier duel.
  for(const marker of ROUTE_FORK.left.markers){
    const y=groundHeightAt(marker.x,marker.z);
    box(stone,marker.x,y+.11,marker.z,.62,.22,.62);
    column(stone,marker.x,y+.64,marker.z,.13,.88);
    box(stone,marker.x,y+1.08,marker.z,.64,.12,.64);
    box(roof,marker.x,y+1.24,marker.z,.48,.2,.48);
  }
  // Right: generated cloth hangs from three poles and visibly moves with the
  // same wind clock as the bamboo. The longer lateral path reveals the ridge.
  const routeBanners=[];
  for(const marker of ROUTE_FORK.right.markers){
    const y=groundHeightAt(marker.x,marker.z);
    column(dark,marker.x,y+1.35,marker.z,.045,2.7);
    const bannerGeometry=new T.PlaneGeometry(.9,1.6,5,8);bannerGeometry.translate(-.45,-.8,0);
    const banner=new T.Mesh(bannerGeometry,routeCloth);banner.customDepthMaterial=clothDepth;
    banner.position.set(marker.x-.04,y+2.5,marker.z);banner.castShadow=true;banner.receiveShadow=true;
    foreground.add(banner,{cloth:true,id:`route-cloth-${routeBanners.length}`});scene.add(banner);routeBanners.push(banner);
  }
  // Three optional walks have different silhouettes, ground treatment and
  // discoveries. Paths follow the same triangles as the actor's feet.
  let explorationSeed=15092026;
  const exploreRandom=()=>{explorationSeed=(1664525*explorationSeed+1013904223)>>>0;return explorationSeed/4294967296;};
  const trailMat=material('#9b8765'),waterMat=material('#5c8580',.26,.32);
  trailMat.map=stoneTexture;
  const discoveryMarkers=new Map(),waterSurfaces=[],rippleRings=[];
  let sideTrailMeters=0,sideTrailTriangles=0;
  for(const walk of EXPLORATION.loops){
    const vertices=[],uvs=[],indices=[];
    for(let k=1;k<walk.nodes.length;k++){
      const a=walk.nodes[k-1],b=walk.nodes[k],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/.7);
      const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length,base=vertices.length/3;
      for(let i=0;i<=count;i++)for(const side of [-1,1]){
        const t=i/count,x=a.x+(b.x-a.x)*t+nx*side*1.05,z=a.z+(b.z-a.z)*t+nz*side*1.05;
        vertices.push(x,groundHeightAt(x,z)+.025,z);uvs.push((side+1)/2,t*length*.7);
      }
      for(let i=0;i<count;i++){const v=base+i*2;indices.push(v,v+2,v+1,v+1,v+2,v+3);}
      sideTrailMeters+=length;
      // Low stones indicate the return direction without blocking the trail.
      for(let t=.25;t<1;t+=7.5/length){
        const x=a.x+(b.x-a.x)*t+nx*1.5,z=a.z+(b.z-a.z)*t+nz*1.5,y=groundHeightAt(x,z);
        staticPart(new T.DodecahedronGeometry(1,0),stone,x,y+.08,z,.24,.13,.32,Math.atan2(nx,nz));
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    sideTrailTriangles+=indices.length/3;queuePart(g,trailMat,walk.nodes[2].x,walk.nodes[2].z);
    const signCanvas=document.createElement('canvas');signCanvas.width=384;signCanvas.height=96;
    const signContext=signCanvas.getContext('2d');signContext.fillStyle='#443d30';signContext.fillRect(0,0,384,96);
    signContext.strokeStyle='#b6aa88';signContext.lineWidth=3;signContext.strokeRect(6,6,372,84);
    signContext.fillStyle='#e7d9b4';signContext.font='500 43px sans-serif';signContext.textAlign='center';signContext.textBaseline='middle';signContext.fillText(walk.name,192,49);
    const signTexture=new T.CanvasTexture(signCanvas);signTexture.colorSpace=T.SRGBColorSpace;
    const signMaterial=new T.MeshStandardMaterial({map:signTexture,roughness:.95,side:T.DoubleSide});
    for(let i=0;i<2;i++){
      const prop=explorationSolid(`${walk.id}-sign-${i}`),sx=prop.x,sz=prop.z,sy=groundHeightAt(sx,sz);
      column(bark,sx,sy+.7,sz,.05,1.4);box(bark,sx,sy+1.19,sz,prop.width,.52,prop.depth,prop.rotation);
      const sign=new T.Mesh(new T.PlaneGeometry(prop.width-.05,.48),signMaterial);
      sign.rotation.y=prop.rotation;sign.position.set(sx+Math.sin(prop.rotation)*.056,sy+1.19,sz+Math.cos(prop.rotation)*.056);scene.add(sign);
    }
  }
  const warmStone=material('#b5a487'),paleBark=material('#b7b8a0'),waterDepth=material('#405d59',.75);
  function postCloth(prop,height=2.9){
    const {x,z}=prop;
    const y=groundHeightAt(x,z);column(bark,x,y+height*.5,z,.065,height);
    box(routeBinding,x-.46,y+height-.05,z,.94,.045,.045);
    const g=new T.PlaneGeometry(.9,1.6,7,12);g.translate(-.45,-.8,0);
    const m=new T.Mesh(g,routeCloth);m.position.set(x,y+height-.05,z);m.castShadow=m.receiveShadow=true;
    m.customDepthMaterial=clothDepth;foreground.add(m,{cloth:true,id:prop.id});scene.add(m);return m;
  }
  function waterDisk(x,z,radius,y){
    const disk=new T.Mesh(new T.CircleGeometry(radius,32),waterMat);disk.rotation.x=-Math.PI/2;disk.position.set(x,y,z);scene.add(disk);
    waterSurfaces.push(disk);
    for(let i=0;i<3;i++){
      const ring=new T.Mesh(new T.RingGeometry(.96,1,32),new T.MeshBasicMaterial({color:'#d4d8ae',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));
      ring.rotation.x=-Math.PI/2;ring.position.set(x,y+.006,z);scene.add(ring);rippleRings.push({mesh:ring,radius,phase:i/3});
    }
  }
  for(const place of EXPLORATION.points){
    const {x,z}=place,y=groundHeightAt(x,z);
    // Inset markers turn warm after discovery; they are not combat upgrades.
    const m=new T.Mesh(new T.CylinderGeometry(.12,.16,.14,8),brass.clone());m.position.set(x+1.15,groundHeightAt(x+1.15,z)+.08,z);
    scene.add(m);discoveryMarkers.set(place.id,m);
    if(place.id==='spring-basin'){
      const prop=explorationSolid('spring-basin'),bx=prop.x,bz=prop.z,by=groundHeightAt(bx,bz);
      column(warmStone,bx,by+.3,bz,prop.radius-.35,.6);
      staticPart(new T.TorusGeometry(.88,.15,7,24).rotateX(Math.PI/2),stone,bx,by+.61,bz);
      waterDisk(bx,bz,.79,by+.61);
      box(paleBark,bx-.85,by+1.03,bz,.12,.12,1.35,.2);
      for(let i=0;i<4;i++)staticPart(new T.DodecahedronGeometry(1,0),warmStone,bx-1.1+i*.1,by+.75+i*.15,bz-.55,.3,.18,.29,i);
    }else if(place.id==='stream-stones'){
      // A shallow pool rests alongside the open stepping-stone path.
      const prop=explorationSolid('stream-pool'),px=prop.x,pz=prop.z,py=groundHeightAt(px,pz)+.06;
      column(waterDepth,px,py-.1,pz,prop.radius-.45,.18);waterDisk(px,pz,prop.radius-.6,py);
      for(let i=0;i<7;i++){
        const a=i/7*Math.PI*2,rx=px+Math.sin(a)*(prop.radius-.5),rz=pz+Math.cos(a)*(prop.radius-.5);
        staticPart(new T.DodecahedronGeometry(1,0),stone,rx,groundHeightAt(rx,rz)+.12,rz,.48,.2,.35,a);
      }
      for(let i=-2;i<=2;i++)box(warmStone,x,groundHeightAt(x,z+i*.8)+.04,z+i*.8,.88,.07,.53,i*.08);
    }else if(place.id==='valley-frame'){
      // Open frame: no deck floats above the terrain and no railing blocks entry.
      for(const id of ['valley-frame-left','valley-frame-right']){
        const prop=explorationSolid(id);column(bark,prop.x,groundHeightAt(prop.x,prop.z)+1.7,prop.z,prop.radius,3.4);postCloth(prop,3.4);
      }
      box(paleBark,x,y+3.45,z-1,4.5,.16,.17);
      for(let i=-2;i<=2;i++)box(warmStone,x+i*.55,groundHeightAt(x+i*.55,z-1.6)+.04,z-1.6,.4,.075,.6);
    }else if(place.id==='sun-ring'){
      const prop=explorationSolid('sun-ring'),py=groundHeightAt(prop.x,prop.z),ring=new T.TorusGeometry(prop.width/2-.25,.21,7,22);ring.rotateY(prop.rotation);
      staticPart(ring,warmStone,prop.x,py+1.6,prop.z);
      box(stone,prop.x,py+.18,prop.z,prop.width-.6,.35,prop.depth-.15,prop.rotation);postCloth(explorationSolid('sun-cloth'),2.8);
    }else if(place.id==='old-waystone'){
      const prop=explorationSolid('old-waystone');
      box(warmStone,prop.x,y+.82,prop.z,prop.width,1.64,prop.depth,prop.rotation);
      // Two branching, shallow dark inlays were drawn specifically for this waystone.
      for(const dx of [-.15,.15])box(dark,x-1.9+dx,y+1.02,z+.25,.045,.62,.022,dx>0?-.3:.3);
      box(dark,x-1.9,y+.55,z+.255,.045,.35,.025);
      const cairn=explorationSolid('old-cairn');
      for(let i=0;i<5;i++)staticPart(new T.DodecahedronGeometry(1,0),stone,cairn.x,y+.12+i*.13,cairn.z,cairn.radius-i*.045,.12,.35-i*.04,i);
    }else if(place.id==='white-tree'){
      const prop=explorationSolid('white-tree'),tx=prop.x,tz=prop.z,ty=groundHeightAt(tx,tz),root=vegetationRoot(tx,ty,tz,5.2,'wood');
      // The pale tree's woody core shares the same anchored deformation.
      const treeMat=paleBark.clone();vegetationMaterials.add(treeMat);installWindMaterial(treeMat,wind);
      windPart(new T.CylinderGeometry(.12,prop.radius,4.7,7,8),treeMat,root.beam,tx,ty+2.35,tz);
      for(const side of [-1,1]){
        leafBranch(tx,ty+2.8,tz,tx+side*1.8,ty+4.7,tz-.4,root,treeMat,.12);
        postCloth(explorationSolid(side<0?'white-cloth-left':'white-cloth-right'),2.5);
      }
    }
  }
  // Distant terrain is original boot-generated geometry, layered through the haze.
  const mountainMats=[material('#3e535e',1),material('#65716b',1)];
  for(let i=0;i<28;i++){
    const a=i/28*Math.PI*2,rr=65+random()*40;
    const g=new T.DodecahedronGeometry(1,1);g.translate(0,.55,0);
    staticPart(g,mountainMats[i%2],Math.sin(a)*rr,-3,Math.cos(a)*rr,15+random()*15,12+random()*18,17+random()*18,random()*6);
  }
  // Side outcrops frame the arrival corridor; no decoration enters the clear combat strip.
  for(let i=0;i<28;i++){
    const x=(i%2?-1:1)*(8.5+random()*13),z=-33+random()*60;
    if(explorationClearingDistance(x,z)<2.2)continue;
    const y=groundHeightAt(x,z);
    sceneArt.addOutcrop(x,y-.18,z,.7+random()*1.5,.5+random()*1.2,.8+random()*1.7,random()*6.28);
  }
  const sceneArtMetrics=sceneArt.finish();
  const foliageMetrics={mapleLeaves:0,bambooLeaves:0,rigidSideShoots:0,maplePetioleRange:[Infinity,0],mapleWidthRange:[Infinity,0],bambooLengthRange:[Infinity,0],geometry:{vertices:0,triangles:0,batches:0}};
  // Three boot-generated variants avoid repeating one comb. A leaf attaches
  // along the twig, with alternating insertion and a differently tilted blade.
  const bambooClusters=Array.from({length:3},(_,variant)=>{
    const parts=[],leafParts=[],oldParts=[],length=.38+variant*.025;let oldArea=0,oldCrosswindArea=0;
    const shoots=[{start:new T.Vector3(),end:new T.Vector3(length,0,0)},
      {start:new T.Vector3(length*.3,0,0),end:new T.Vector3(length*.78,.025,-.17)},
      {start:new T.Vector3(length*.55,0,0),end:new T.Vector3(length*.98,.035,.15)}];
    for(let shootIndex=0;shootIndex<shoots.length;shootIndex++){
      const {start,end}=shoots[shootIndex],delta=end.clone().sub(start),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),delta.clone().normalize());
      for(let k=0;k<12;k++){
        const side=k%2?1:-1,bladeLength=.145+.015*Math.sin(k*1.7+variant),g=createBambooLeafGeometry({bladeLength,width:.021+variant*.0015,seed:k*1.73+variant*2.1+shootIndex*8.37});
        const transform=new T.Matrix4().compose(start,rotation,new T.Vector3(1,1,1));
        transform.multiply(new T.Matrix4().makeTranslation(delta.length()*(.12+k*.078),0,0));
        transform.multiply(new T.Matrix4().makeRotationX(-Math.PI/2+.14*Math.sin(k*2.1+variant+shootIndex)));
        transform.multiply(new T.Matrix4().makeRotationZ(side*(.62+.21*Math.sin(k*1.7+variant))));
        transformLeafGeometry(g,transform);parts.push(g);leafParts.push(g);
      }
      if(shootIndex){
        // These 0.22–0.26 m lateral shoots use the existing twig's transported
        // frame as a rigid short-member approximation, not another oscillator.
        const g=new T.CylinderGeometry(.0006,.0015,delta.length(),3,2,true),turn=new T.Quaternion().setFromUnitVectors(T.Object3D.DEFAULT_UP,delta.normalize());
        g.applyMatrix4(new T.Matrix4().compose(start.clone().add(end).multiplyScalar(.5),turn,new T.Vector3(1,1,1)));
        g.setAttribute('color',new T.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(.53),3));setLeafAttachment(g);remapBambooLeafUv(g);parts.push(g);
      }
    }
    const twig=new T.CylinderGeometry(.0009,.003,length,3,3,true);twig.rotateZ(-Math.PI/2);twig.translate(length/2,0,0);
    twig.setAttribute('color',new T.Float32BufferAttribute(Array(twig.attributes.position.count*3).fill(.53),3));
    setLeafAttachment(twig);remapBambooLeafUv(twig);parts.push(twig);
    // Reconstruct only the former lamina area for the modal load delta. No
    // random stream or support changes result from these local templates.
    for(let shootIndex=0;shootIndex<shoots.length;shootIndex++)for(let k=0;k<6;k++){
      const old=createBambooLeafGeometry({bladeLength:.094+.008*Math.sin(k*1.7+variant),width:.010+variant*.001}),p=old.attributes.position,
        delta=shoots[shootIndex].end.clone().sub(shoots[shootIndex].start),turn=new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),delta.normalize());
      old.rotateZ((k%2?1:-1)*(.62+.21*Math.sin(k*1.7+variant)));old.rotateX(-Math.PI/2+.14*Math.sin(k*2.1+variant+shootIndex));old.applyQuaternion(turn);old.translate(...shoots[shootIndex].start.clone().lerp(shoots[shootIndex].end,.16+k*.155).toArray());
      for(let i=0;i<old.index.count;i+=3){const [a,b,c]=[0,1,2].map(n=>new T.Vector3().fromBufferAttribute(p,old.index.getX(i+n))),cross=b.sub(a).cross(c.sub(a));oldArea+=cross.length()*.5;oldCrosswindArea+=Math.hypot(cross.x,cross.z)/Math.PI;}oldParts.push(old);
    }
    const frond=frondAtlas.bake(leafParts,variant);oldCrosswindArea=projectedFrondDragArea(oldParts);frond.crosswindArea=projectedFrondDragArea(leafParts);oldParts.forEach(g=>g.dispose());leafParts.forEach(remapBambooLeafUv);parts.push(frond.geometry);
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());return {geometry,length,shoots,area:frond.area,oldArea,crosswindArea:frond.crosswindArea,oldCrosswindArea,collapsedDepth:frond.collapsedDepth};
  });
  foliageMetrics.atlas=frondAtlas.finish();installFrondCutout(leaf);foliageMetrics.frondTemplates=bambooClusters.map(({area,oldArea,crosswindArea,oldCrosswindArea,collapsedDepth})=>({area,oldArea,crosswindArea,oldCrosswindArea,collapsedDepth}));
  bambooLeafDepth=installFrondCutout(installWindMaterial(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide,map:leaf.map,alphaTest:leaf.alphaTest}),wind));
  const stemProfiles={bamboo:[[0,1],[.3,.91],[.55,.73],[.76,.48],[.9,.24],[.97,.09],[1,.014]],
    wood:[[0,1],[.16,.76],[.34,.48],[.52,.25],[.7,.12],[.85,.047],[1,.008]]};
  function taperedStem(height,radius,kind){
    return new T.LatheGeometry(stemProfiles[kind].map(([u,r])=>new T.Vector2(radius*r,height*u)),7);
  }
  function stemRadius(u,kind){
    const profile=stemProfiles[kind];
    for(let i=1;i<profile.length;i++)if(u<=profile[i][0]){
      const [a,ra]=profile[i-1],[b,rb]=profile[i];return T.MathUtils.lerp(ra,rb,(u-a)/(b-a));
    }
    return profile.at(-1)[1];
  }
  for(let i=0;i<150;i++){
    const side=random()<.5?-1:1;let x,z;
    do{x=side*(8+random()*30);z=-53+random()*88;}while(explorationClearingDistance(x,z)<1.2);
    const h=5.5+random()*6.5,y=groundHeightAt(x,z),root=vegetationRoot(x,y,z,h,'bamboo');
    const specimen={x,y,z,height:h,beam:root.beam,inspection:[]};
    if(!vegetationSpecimens.bamboo||Math.hypot(x+22,z-11)<Math.hypot(vegetationSpecimens.bamboo.x+22,vegetationSpecimens.bamboo.z-11))vegetationSpecimens.bamboo=specimen;
    windPart(taperedStem(h,.09,'bamboo'),bambooBark,root.beam,x,y,z);
    for(let dy=.8;dy<h*.96;dy+=1.15){
      const top=.09*stemRadius((dy+.016)/h,'bamboo')*1.012,bottom=.09*stemRadius((dy-.016)/h,'bamboo')*1.025;
      windPart(new T.CylinderGeometry(top,bottom,.032,7,1,true),bambooNode,root.beam,x,y+dy,z);
    }
    for(let j=0;j<6;j++){
      // Keep the same random draws and roots: grass placement and route
      // fixtures cannot shift just because a new blade has more vertices.
      const a=random()*Math.PI*2,reach=(.5+random()*.75)*(1-j*.09),u=.52+j*.09;
      const endX=x+Math.sin(a)*reach,endY=y+h*u+.08,endZ=z+Math.cos(a)*reach;
      const branch=leafBranch(x,y+h*u-.12,z,endX,endY,endZ,root,leaf,.011*(1-j*.105));
      const sx=.91+random()*.2,sy=.91+random()*.18,sz=.91+random()*.2,cluster=bambooClusters[(i+j)%3],twigYaw=a-Math.PI/2+.25*Math.sin(i+j*1.7);
      const leafSupport=vegetation.addBeam({kind:'twig',start:[endX,endY,endZ],end:[endX+cluster.length*sx*Math.cos(twigYaw),endY,endZ-cluster.length*sx*Math.sin(twigYaw)],parent:branch});
      const clusterTransform=new T.Matrix4().compose(new T.Vector3(endX,endY,endZ),new T.Quaternion().setFromAxisAngle(T.Object3D.DEFAULT_UP,twigYaw),new T.Vector3(sx,sy,sz));
      addBambooCrownLoad(vegetation.beams[leafSupport],cluster.oldArea*sx*Math.max(sy,sz),cluster.area*sx*Math.max(sy,sz),cluster.oldCrosswindArea*sx*Math.max(sy,sz),cluster.crosswindArea*sx*Math.max(sy,sz),vegetation.beams);
      vegetation.beams[leafSupport].attachmentSegments=cluster.shoots.map(({start,end})=>[start,end].map(p=>vegetation.localPoint(leafSupport,p.clone().applyMatrix4(clusterTransform).toArray())));
      windPart(cluster.geometry.clone(),leaf,leafSupport,endX,endY,endZ,sx,sy,sz,twigYaw);
      foliageMetrics.bambooLeaves+=36;foliageMetrics.rigidSideShoots+=2;
      foliageMetrics.bambooLengthRange[0]=Math.min(foliageMetrics.bambooLengthRange[0],(.145-.015)*Math.min(sx,sy,sz));
      foliageMetrics.bambooLengthRange[1]=Math.max(foliageMetrics.bambooLengthRange[1],(.145+.015)*Math.max(sx,sy,sz));
      if(j>=4)specimen.inspection.push({beam:leafSupport,point:[endX+cluster.length*sx*.5*Math.cos(twigYaw),endY,endZ-cluster.length*sx*.5*Math.sin(twigYaw)]});
    }
  }
  bambooClusters.forEach(c=>c.geometry.dispose());
  const mapleGeometry=createMapleLeafGeometry();
  const mapleBark=material('#675647');vegetationMaterials.add(mapleBark);installWindMaterial(mapleBark,wind);
  for(let treeIndex=0;treeIndex<4;treeIndex++){
    const prop=explorationSolid(`maple-${treeIndex}`),{x,z}=prop;
    const y=groundHeightAt(x,z),h=4.8+exploreRandom(),root=vegetationRoot(x,y,z,h,'wood');
    const specimen={x,y,z,height:h,beam:root.beam,inspection:[]};
    if(treeIndex===0)vegetationSpecimens.maple=specimen;
    windPart(taperedStem(h,prop.radius,'wood'),mapleBark,root.beam,x,y,z);
    for(let i=0;i<9;i++){
      const a=i*2.399,reach=1.2+(i%3)*.45,bx=x+Math.sin(a)*reach,bz=z+Math.cos(a)*reach,by=y+h*(.58+(i%3)*.165);
      const branchStart=new T.Vector3(x,y+h*(.33+(i%3)*.14),z),branchEnd=new T.Vector3(bx,by,bz);
      const branch=leafBranch(...branchStart.toArray(),bx,by,bz,root,mapleBark,.065-(i%3)*.01);
      for(let n=0;n<9;n++){
        const phase=exploreRandom()*6.28,tilt=exploreRandom(),rx=exploreRandom(),ry=exploreRandom(),rz=exploreRandom();
        const start=branchStart.clone().lerp(branchEnd,.3+n*.081),side=n%2?1:-1,
          angle=a+side*(.58+rx*.34),length=.46+rz*.28,
          end=start.clone().add(new T.Vector3(Math.sin(angle)*length,.07+ry*.16,Math.cos(angle)*length));
        const twig=leafBranch(...start.toArray(),...end.toArray(),root,mapleBark,.0042,branch,'twig'),delta=end.clone().sub(start),
          rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),delta.clone().normalize()),parts=[];
        for(let pair=0;pair<6;pair++)for(const leafSide of [-1,1]){
          const leafSeed=treeIndex*29+i*3.71+n*1.137+pair*.87+leafSide*.39,
            width=.073+.024*(.5+.5*Math.sin(leafSeed*2.3)),bladeLength=.066+.018*(.5+.5*Math.cos(leafSeed*1.7)),
            petiole=.024+.008*(.5+.5*Math.sin(leafSeed)),g=createMapleLeafGeometry({width,bladeLength,petiole,seed:leafSeed}),u=.19+pair*.146;
          const local=new T.Matrix4().makeTranslation(delta.length()*u,0,0);
          local.multiply(new T.Matrix4().makeRotationX(-Math.PI/2+.24*Math.sin(phase+pair*1.23)+leafSide*.12+(tilt-.5)*.12));
          local.multiply(new T.Matrix4().makeRotationZ(leafSide*(.89+.2*Math.sin(phase+pair*1.9))));
          transformLeafGeometry(g,new T.Matrix4().compose(start,rotation,new T.Vector3(1,1,1)).multiply(local));parts.push(g);
          foliageMetrics.mapleLeaves++;foliageMetrics.mapleWidthRange[0]=Math.min(foliageMetrics.mapleWidthRange[0],width);foliageMetrics.mapleWidthRange[1]=Math.max(foliageMetrics.mapleWidthRange[1],width);
          foliageMetrics.maplePetioleRange[0]=Math.min(foliageMetrics.maplePetioleRange[0],petiole);foliageMetrics.maplePetioleRange[1]=Math.max(foliageMetrics.maplePetioleRange[1],petiole);
        }
        const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());vegetation.bindGeometry(g,twig);queuePart(g,autumnLeaf,start.x,start.z);
        if(i===4&&n===6)specimen.inspection.push({beam:twig,point:start.clone().lerp(end,.53).toArray(),root:start.toArray(),tip:end.toArray(),normal:new T.Vector3(0,1,0).applyQuaternion(rotation).toArray()});
      }
    }
  }
  for(const [mat,cells] of batches)for(const [cell,geoms] of cells){
    const merged=mergeGeometries(geoms);merged.computeBoundingSphere();
    if(merged.hasAttribute('windSupport')){foliageMetrics.geometry.vertices+=merged.attributes.position.count;foliageMetrics.geometry.triangles+=merged.index.count/3;foliageMetrics.geometry.batches++;}
    if(vegetationMaterials.has(mat))merged.boundingSphere.radius+=1.4;
    const mesh=new T.Mesh(merged,mat);mesh.castShadow=mesh.receiveShadow=true;
    if(mat===bambooBark)mesh.name=`bamboo-culms-${cell}`;
    if(vegetationMaterials.has(mat))mesh.customDepthMaterial=mat===leaf?bambooLeafDepth:leafDepth;
    if(mat===leaf){foliageLod.add(mesh);mesh.userData.foliageAlpha=leaf.userData.foliageAlpha;}
    if(mat===autumnLeaf)foliageLod.add(mesh,{maple:true});
    if(mat===leaf||mat===autumnLeaf||mat===mapleBark)foreground.add(mesh,{vegetation,id:`${mat===leaf?'bamboo-leaves':mat===mapleBark?'maple-wood':'maple-leaves'}-${cell}`});
    scene.add(mesh);geoms.forEach(g=>g.dispose());
  }
  const grassMat=material('#b8b77d');grassMat.side=T.DoubleSide;
  installWindMaterial(grassMat,wind,'grass');
  const grassDepth=installWindMaterial(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide}),wind,'grass');
  const grassGeo=createGrassClumpGeometry();
  grassGeo.setAttribute('grassBlade',new T.Float32BufferAttribute(Array.from({length:grassGeo.getAttribute('position').count},(_,i)=>Math.floor(i/6)),1));
  const grass=new T.InstancedMesh(grassGeo,grassMat,3000),grassColor=new T.Color();
  let rootError=0,minGrassRouteClearance=Infinity;
  for(let i=0;i<3000;i++){
    // Keep the authored amount while pulling tall foreground blades out of the duel corridor.
    const side=random()<.5?-1:1,near=random()<.22;let x,z;
    do{z=-53+random()*82;x=side*((near?4.8:9)+random()*(near?5.2:28));}while(explorationClearingDistance(x,z)<.8);
    const routeClearance=1.45,initialClearance=distanceFromRoute(x,z);
    if(initialClearance<routeClearance)x+=side*(routeClearance-initialClearance+.08);
    q.setFromAxisAngle(T.Object3D.DEFAULT_UP,random()*Math.PI*2);const scale=.65+random()*.65;
    matrix.compose(pos.set(x,groundHeightAt(x,z)+.006,z),q,s.set(scale,scale,scale));grass.setMatrixAt(i,matrix);
    grassColor.setHSL(.105+random()*.08,.22+random()*.2,.40+random()*.22);grass.setColorAt(i,grassColor);
    rootError=Math.max(rootError,Math.abs(grass.instanceMatrix.array[i*16+13]-groundHeightAt(x,z)-.006));
    minGrassRouteClearance=Math.min(minGrassRouteClearance,distanceFromRoute(x,z));
  }
  const landscapeMetrics={grassClumps:3000,grassBlades:9000,grassTriangles:grassGeo.index.count/3*grass.count,maxRootError:rootError,minGrassRouteClearance,baseFootprint:shrineBaseSize(OBSTACLES.find(o=>o.kind==='shrine')),
    route:{obstacle:{...ROUTE_FORK.obstacle},stoneTiles:routeStoneTiles,bindingStones:routeBindingStones,pathCenters:{approach:routePathCenters(0),ridge:routePathCenters(ROUTE_FORK.obstacle.z),rejoined:routePathCenters(-18)},
      left:{landmark:ROUTE_FORK.left.landmark,markers:ROUTE_FORK.left.markers.length,pathLength:routePathLength('left')},
      right:{landmark:ROUTE_FORK.right.landmark,markers:routeBanners.length,pathLength:routePathLength('right')}}};
  landscapeMetrics.sceneArt=sceneArtMetrics;
  landscapeMetrics.exploration={loops:EXPLORATION.loops.length,places:EXPLORATION.points.length,sideTrailMeters,sideTrailTriangles,bounds:EXPLORATION.bounds};
  vegetation.update(0);
  landscapeMetrics.wind={sharedField:true,rootAnchored:true,pinnedClothEdge:true,shadowDeformation:true,normalDeformation:true,physics:vegetation.metrics,specimens:vegetationSpecimens,foliage:foliageMetrics,lod:foliageLod.metrics};
  landscapeMetrics.sunShadow={followsPlayer:true,width:SUN_SHADOW.width,height:SUN_SHADOW.height,mapSize:SUN_SHADOW.mapSize,texelSnapped:true};
  const grassGroups=partitionInstances(grass);grass.dispose();grassGroups.forEach(g=>{g.customDepthMaterial=grassDepth;scene.add(g);});
  landscapeMetrics.grassBatches=grassGroups.length;landscapeMetrics.leafBatches=batches.get(leaf).size;
  // Sparse falling leaves describe the shared air current. Their visible lives
  // fade at the canopy/ground, so recycling never teleports a visible leaf.
  const fallingMaterial=autumnLeaf.clone();
  const fallingLeaves=new T.InstancedMesh(mapleGeometry,fallingMaterial,64),fallingSeeds=[];
  fallingLeaves.frustumCulled=false;fallingLeaves.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(fallingLeaves);
  for(let i=0;i<64;i++){
    const place=EXPLORATION.points[i%EXPLORATION.points.length];
    fallingSeeds.push({x:place.x+(exploreRandom()-.5)*8,z:place.z+(exploreRandom()-.5)*8,phase:exploreRandom(),height:3.5+exploreRandom()*3.5,speed:.07+exploreRandom()*.035,spin:exploreRandom()*6.28});
  }
  const birds=[],birdMaterial=material('#35413d');birdMaterial.side=T.DoubleSide;
  const wingShape=new T.Shape();wingShape.moveTo(0,0);wingShape.lineTo(.38,-.12);wingShape.lineTo(.63,-.38);wingShape.lineTo(.14,-.24);wingShape.closePath();
  const wingGeometry=new T.ShapeGeometry(wingShape);wingGeometry.rotateX(-Math.PI/2);
  for(let i=0;i<7;i++){
    const group=new T.Group(),left=new T.Mesh(wingGeometry,birdMaterial),right=new T.Mesh(wingGeometry,birdMaterial);
    left.scale.x=-1;group.add(left,right);
    const body=new T.Mesh(new T.ConeGeometry(.065,.36,5),birdMaterial);body.rotation.x=-Math.PI/2;group.add(body);
    group.visible=false;scene.add(group);birds.push({group,left,right,phase:i*.67});
  }
  const leafRotation=new T.Euler();
  function updateEnvironment(world){
    const t=wind.value;
    for(const [id,marker] of discoveryMarkers){
      const found=world.exploration?.discovered.includes(id)??false;
      marker.material.emissive.set(found?'#b17b31':'#000000');marker.material.emissiveIntensity=found?.45:0;
    }
    waterMat.roughness=.24+sampleWind(-28,8,t).pressure*.035;
    for(const ripple of rippleRings){
      const age=(t*.26+ripple.phase)%1,size=.08+age*ripple.radius;
      ripple.mesh.scale.setScalar(size);ripple.mesh.material.opacity=Math.sin(age*Math.PI)*.18;
    }
    for(let i=0;i<fallingSeeds.length;i++){
      const seed=fallingSeeds[i],age=(t*seed.speed+seed.phase)%1,w=sampleWind(seed.x,seed.z,t-age*.3);
      const x=seed.x+w.x*age*3+Math.sin(age*8+seed.spin)*.3,z=seed.z+w.z*age*3+Math.cos(age*7+seed.spin)*.24;
      const y=groundHeightAt(x,z)+.08+(1-age)*seed.height;
      const visible=clamp(age*14,0,1)*clamp((1-age)*12,0,1),scale=visible;
      leafRotation.set(Math.sin(t*1.5+seed.spin)*.65,t*.48+seed.spin,Math.sin(t*1.2+seed.spin)*.5);
      q.setFromEuler(leafRotation);matrix.compose(pos.set(x,y,z),q,s.setScalar(scale));fallingLeaves.setMatrixAt(i,matrix);
    }
    fallingLeaves.instanceMatrix.needsUpdate=true;
    const birdEncounter=world.exploration?.encounters['valley-frame'];
    if(birdEncounter!==undefined&&!encounterClocks.has('valley-frame'))encounterClocks.set('valley-frame',t);
    const birdStart=encounterClocks.get('valley-frame'),elapsed=birdStart===undefined?-1:t-birdStart;
    for(let i=0;i<birds.length;i++){
      const bird=birds[i],age=elapsed-i*.075;bird.group.visible=age>=0&&age<9;
      if(!bird.group.visible)continue;
      const turn=age*.11,spread=(i-3)*.46,px=28-age*2.5,pz=8+Math.sin(turn)*9+spread;
      const py=groundHeightAt(30,10)+2.3+Math.min(age,3)*.9+Math.sin(age*.6+i)*.25;
      bird.group.position.set(px,py,pz);bird.group.rotation.set(-.05,-Math.PI/2-turn,.16*Math.sin(turn));
      const flap=age<2.2?Math.sin(age*9+bird.phase)*.5:Math.sin(age*3.4+bird.phase)*.12;
      bird.left.rotation.z=-flap;bird.right.rotation.z=flap;
      bird.group.scale.setScalar(clamp((9-age)/1.5,0,1)*.7);
    }
  }
  const rigs=new Map(),actorResources=characterResources??createCharacterResources(),actorMetrics={partsByRig:{},rigs:{},motionByRig:{}};
  // The hanging signal stays on the shared horizontal mission position, but is
  // lifted clear of the actor silhouette and held by generated wall hardware.
  const SIGNAL_HEIGHT=3.15;
  const signalMaterial=material('#74624a');
  const signalLamp=new T.Mesh(new T.CylinderGeometry(.3,.27,.65,12),signalMaterial);
  signalLamp.position.set(SIGNAL.x,SIGNAL_HEIGHT,SIGNAL.z);scene.add(signalLamp);
  const signalCap=new T.Mesh(new T.ConeGeometry(.43,.24,8),roof);
  signalCap.position.set(SIGNAL.x,SIGNAL_HEIGHT+.45,SIGNAL.z);scene.add(signalCap);
  const signalBracket=new T.Group();signalBracket.position.set(SIGNAL.x,SIGNAL_HEIGHT+.72,SIGNAL.z+.08);scene.add(signalBracket);
  const bracketArm=new T.Mesh(new T.BoxGeometry(.72,.07,.08),brass);bracketArm.position.x=.28;bracketArm.castShadow=true;signalBracket.add(bracketArm);
  const bracketDrop=new T.Mesh(new T.CylinderGeometry(.025,.025,.48,6),dark);bracketDrop.position.set(0,-.23,0);bracketDrop.castShadow=true;signalBracket.add(bracketDrop);
  const signalLight=new T.PointLight('#ffbb66',0,5.5,2);
  signalLight.position.set(SIGNAL.x,SIGNAL_HEIGHT,SIGNAL.z+.5);scene.add(signalLight);
  const signalHalo=new T.Sprite(new T.SpriteMaterial({map:sunSprite.material.map,color:'#ffd08a',transparent:true,opacity:.08,depthWrite:false,blending:T.AdditiveBlending}));
  signalHalo.position.set(SIGNAL.x,SIGNAL_HEIGHT+.05,SIGNAL.z+.18);signalHalo.scale.set(1.9,1.9,1);signalHalo.visible=false;scene.add(signalHalo);
  function rig(id){
    const character=createCharacterRig(id,actorResources);scene.add(character.root);
    actorMetrics.partsByRig[id]=character.metrics.generatedParts;
    actorMetrics.rigs[id]=character.metrics;rigs.set(id,character);return character;
  }
  const look=new T.Vector3(),overviewProbe=new T.Vector3();
  const cameraFrame={x:0,y:0,z:0,lookX:0,lookY:0,lookZ:0},smoothedFrame={...cameraFrame};let initialized=false,cameraWorld=null,previousPlayer=null;
  function beginWorld(world){
    for(const actor of [world.player,...world.enemies])seedCharacterRig(rigs.get(actor.id)||rig(actor.id),actor,world);
    foreground.reset();initialized=false;cameraWorld=world;previousPlayer=null;
  }
  const cameraMetrics={lockedFrames:0,minHorizontalStandoff:null,maxDownAngleDegrees:0,foregroundPostOpacity:1,
    rejoinVistaFrames:0,rejoinComposition:null,rejoinFrameError:null,rejoinSightlineClearance:null,
    arrivalOverviewFrames:0,arrivalComposition:null,arrivalFrameError:null};
  function resize(){foliagePixelHeight=innerHeight*Math.min(devicePixelRatio,1.5);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();
  function render(world,dt,orbit=0,options={}){
    const animate=options.animate!==false;
    landscapeMetrics.sunShadow.center=followSunShadow(sun,{x:world.player.x,y:groundHeightAt(world.player.x,world.player.z)+.8,z:world.player.z});
    if(advanceEnvironmentClock(environmentClock,world,dt,options.animate!==false)){encounterClocks.clear();signalIgnition=null;}
    wind.value=environmentClock.value;
    vegetation.update(wind.value);
    updateEnvironment(world);
    signalMaterial.emissive.set(world.signalLit?'#ffb84f':'#000000');
    if(world.signalLit&&signalIgnition===null)signalIgnition=wind.value;
    if(!world.signalLit)signalIgnition=null;
    const flame=signalFlame(signalIgnition===null?0:wind.value-signalIgnition);
    signalMaterial.emissiveIntensity=world.signalLit?flame.emissive:0;
    // The ignition envelope approaches the existing light cap continuously.
    signalLight.intensity=world.signalLit?flame.light:0;
    signalHalo.visible=world.signalLit;
    signalHalo.material.opacity=world.signalLit?flame.opacity:0;signalHalo.scale.set(flame.scale,flame.scale,1);
    for(const a of [world.player,...world.enemies]){
      const r=rigs.get(a.id)||rig(a.id);
      actorMetrics.motionByRig[a.id]=updateCharacterRig(r,a,world,dt,{animate,groundHeightAt});
    }
    if(cameraWorld!==world){foreground.reset();initialized=false;previousPlayer=null;cameraWorld=world;}
    computeCameraFrame(world,orbit,camera.aspect,cameraFrame);
    interpolateCameraFrame(smoothedFrame,cameraFrame,dt,initialized,cameraTrackingTranslation(world,previousPlayer));
    previousPlayer={x:world.player.x,z:world.player.z};
    camera.position.set(smoothedFrame.x,smoothedFrame.y,smoothedFrame.z);
    look.set(smoothedFrame.lookX,smoothedFrame.lookY,smoothedFrame.lookZ);
    camera.lookAt(look);initialized=true;
    if(usesRejoinVista(world)){
      camera.updateMatrixWorld();
      const exitZ=ROUTE_FORK.obstacleBackZ-.3;
      const probes={
        leftExit:{x:routeCenterAt('left',exitZ),y:groundHeightAt(routeCenterAt('left',exitZ),exitZ),z:exitZ},
        rightExit:{x:routeCenterAt('right',exitZ),y:groundHeightAt(routeCenterAt('right',exitZ),exitZ),z:exitZ},
        sharedJoin:{x:0,y:groundHeightAt(0,ROUTE_FORK.rejoinZ),z:ROUTE_FORK.rejoinZ}
      };
      cameraMetrics.rejoinVistaFrames++;
      cameraMetrics.rejoinFrameError=Math.max(...['x','y','z','lookX','lookY','lookZ'].map(key=>Math.abs(smoothedFrame[key]-cameraFrame[key])));
      const joinY=groundHeightAt(0,ROUTE_FORK.rejoinZ),rayT=(ROUTE_FORK.obstacleBackZ-smoothedFrame.z)/(ROUTE_FORK.rejoinZ-smoothedFrame.z);
      cameraMetrics.rejoinSightlineClearance=smoothedFrame.y+(joinY-smoothedFrame.y)*rayT-ROUTE_FORK.obstacle.h;
      cameraMetrics.rejoinComposition=Object.fromEntries(Object.entries(probes).map(([id,point])=>{
        overviewProbe.set(point.x,point.y,point.z).project(camera);
        return [id,{x:overviewProbe.x,y:overviewProbe.y,z:overviewProbe.z,inFrame:Math.abs(overviewProbe.x)<.92&&Math.abs(overviewProbe.y)<.92&&overviewProbe.z>-1&&overviewProbe.z<1}];
      }));
    }
    if(usesArrivalFrame(world)){
      camera.updateMatrixWorld();cameraMetrics.arrivalOverviewFrames++;
      cameraMetrics.arrivalFrameError=Math.max(...['x','y','z','lookX','lookY','lookZ'].map(key=>Math.abs(smoothedFrame[key]-cameraFrame[key])));
      const probes={
        player:{x:world.player.x,y:groundHeightAt(world.player.x,world.player.z)+1.1,z:world.player.z},
        signal:{x:SIGNAL.x,y:SIGNAL_HEIGHT,z:SIGNAL.z},
        shrine:{x:0,y:5.5,z:-23}
      };
      cameraMetrics.arrivalComposition=Object.fromEntries(Object.entries(probes).map(([id,point])=>{
        overviewProbe.set(point.x,point.y,point.z).project(camera);
        return [id,{x:overviewProbe.x,y:overviewProbe.y,z:overviewProbe.z,inFrame:Math.abs(overviewProbe.x)<.92&&Math.abs(overviewProbe.y)<.92&&overviewProbe.z>-1&&overviewProbe.z<1}];
      }));
    }
    const postBlend=1-Math.exp(-Math.max(0,Math.min(dt,.1))*18);
    let foregroundPostOpacity=1;
    for(const post of toriiPosts){
      const wanted=world.mode==='playing'&&world.locked?foregroundObstacleOpacity(smoothedFrame,look,post.obstacle):1;
      post.opacity+= (wanted-post.opacity)*postBlend;
      post.mesh.material.opacity=post.opacity;
      post.mesh.material.depthWrite=post.opacity>.55;
      post.mesh.castShadow=post.opacity>.55;
      foregroundPostOpacity=Math.min(foregroundPostOpacity,post.opacity);
    }
    cameraMetrics.foregroundPostOpacity=foregroundPostOpacity;
    const sightPoints=characterSightPoints(rigs.get(world.player.id));
    if(world.locked)characterSightPoints(rigs.get(world.locked),sightPoints);
    foliageLod.update(camera,foliagePixelHeight);
    foreground.update(camera.position,sightPoints,dt,wind.value,{animate});
    cameraMetrics.foregroundObjects=foreground.diagnostics();
    if(world.mode==='playing'&&world.locked){
      const horizontal=Math.hypot(smoothedFrame.x-smoothedFrame.lookX,smoothedFrame.z-smoothedFrame.lookZ);
      const downAngle=Math.atan2(smoothedFrame.y-smoothedFrame.lookY,horizontal)*180/Math.PI;
      cameraMetrics.lockedFrames++;
      cameraMetrics.minHorizontalStandoff=Math.min(cameraMetrics.minHorizontalStandoff??Infinity,horizontal);
      cameraMetrics.maxDownAngleDegrees=Math.max(cameraMetrics.maxDownAngleDegrees,downAngle);
    }
    if(options.draw!==false)renderer.render(scene,camera);
  }
  // Inspection apparatus only. A new inspection camera must not inherit the
  // gameplay camera's transparent foliage or disabled shadows. Normal play
  // never calls this method and retains its existing occlusion decisions.
  function renderInspection(position,target){
    foreground.reset();
    for(const post of toriiPosts){post.opacity=1;post.mesh.material.opacity=1;post.mesh.material.depthWrite=true;post.mesh.castShadow=true;}
    camera.position.copy(position);camera.lookAt(target.x,target.y,target.z);camera.updateMatrixWorld();foliageLod.update(camera,foliagePixelHeight);renderer.render(scene,camera);
  }
  return {beginWorld,render,renderInspection,resize,renderer,scene,camera,vegetation,assetsReady:actorResources.ready,
    cameraDiagnostics:()=>({...cameraMetrics,frame:{...smoothedFrame}}),landscapeDiagnostics:()=>({...landscapeMetrics}),actorDiagnostics:()=>JSON.parse(JSON.stringify({...actorMetrics,assets:{...actorResources.native.info,state:actorResources.native.state,pendingCount:actorResources.native.pendingCount,readyCount:actorResources.native.readyCount,failedCount:actorResources.native.failedCount,error:actorResources.native.error}}))};
}
