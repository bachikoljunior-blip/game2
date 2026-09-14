import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OBSTACLES } from './simulation.js';
import { SIGNAL } from './mission.js';
import { computeCameraFrame, foregroundObstacleOpacity, interpolateCameraFrame } from './camera-framing.js';
import { groundHeightAt, terrainVertexHeight, shrineBaseSize } from './terrain.js';
import { indexForBatch } from './batch-geometry.js';
import { spatialCell, partitionInstances } from './spatial-batches.js';

const clamp = T.MathUtils.clamp;
export function createPresentation(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  const scene = new T.Scene(); scene.fog = new T.FogExp2('#bcab94',.009);
  const camera = new T.PerspectiveCamera(52,1,.1,230);
  scene.add(new T.HemisphereLight('#a4bfd3','#42372a',1.55));
  const sun = new T.DirectionalLight('#ffd29a',3.4); sun.position.set(-24,18,-42); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-28,right:28,top:32,bottom:-32,near:1,far:110});
  sun.shadow.bias=-.0004; sun.shadow.normalBias=.025; scene.add(sun);
  const rim=new T.DirectionalLight('#b6c6d0',1.35);rim.position.set(18,12,22);scene.add(rim);
  let seed = 310519;
  const random = () => { seed = (1664525*seed+1013904223)>>>0; return seed/4294967296; };
  const material = (color, roughness=.85, metalness=0) => new T.MeshStandardMaterial({color,roughness,metalness});
  const bark=material('#485647'),bambooNode=material('#91906b'),red=material('#92432d'),stone=material('#7f8275'),roof=material('#303e3d'),
    leaf=material('#72834c'),brass=material('#c5a36b',.35,.65),skin=material('#b49478'),dark=material('#181f25'),
    playerBlade=material('#e7f4f4',.16,.92),enemyBlade=material('#ffe0a6',.22,.82);
  playerBlade.emissive.set('#7397a1');playerBlade.emissiveIntensity=.13;
  enemyBlade.emissive.set('#a64b24');enemyBlade.emissiveIntensity=.24;
  leaf.side=T.DoubleSide;
  const wind={value:0};
  const leafWind=shader=>{shader.uniforms.windTime=wind;shader.vertexShader='uniform float windTime; attribute float windWeight;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n float gust=sin(windTime*1.15+position.x*.19+position.z*.13)*windWeight; transformed.x+=gust*.13; transformed.z+=gust*.071;');};
  leaf.onBeforeCompile=leafWind;
  const leafDepth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});leafDepth.onBeforeCompile=leafWind;
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
  const groundMat=material('#d8cbb4');groundMat.map=texture;groundMat.vertexColors=true;
  const stoneTexture=texture.clone();stoneTexture.repeat.set(1.3,1.3);stone.map=stoneTexture;stone.bumpMap=stoneTexture;stone.bumpScale=.06;
  const batches=new Map();const matrix=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3(),pos=new T.Vector3();
  function queuePart(geometry,mat,x,z){
    if(!batches.has(mat))batches.set(mat,new Map());
    const cells=batches.get(mat),key=mat===leaf?spatialCell(x,z):'all';
    if(!cells.has(key))cells.set(key,[]);cells.get(key).push(geometry);
  }
  function staticPart(geometry,mat,x,y,z,sx=1,sy=1,sz=1,ry=0){
    indexForBatch(geometry);
    q.setFromAxisAngle(T.Object3D.DEFAULT_UP,ry);matrix.compose(pos.set(x,y,z),q,s.set(sx,sy,sz));geometry.applyMatrix4(matrix);
    queuePart(geometry,mat,x,z);
  }
  const box=(m,x,y,z,w,h,d,ry=0)=>staticPart(new T.BoxGeometry(1,1,1),m,x,y,z,w,h,d,ry);
  const column=(m,x,y,z,r,h)=>staticPart(new T.CylinderGeometry(r*.88,r,h,8),m,x,y,z);
  function leafBranch(x,y,z,endX,endY,endZ){
    const start=new T.Vector3(x,y,z),end=new T.Vector3(endX,endY,endZ),delta=end.clone().sub(start),length=delta.length();
    const g=new T.CylinderGeometry(.008,.023,length,5,1,true),p=g.getAttribute('position'),weights=[];
    for(let i=0;i<p.count;i++)weights.push(clamp(p.getY(i)/length+.5,0,1));
    g.setAttribute('windWeight',new T.Float32BufferAttribute(weights,1));
    const rotation=new T.Quaternion().setFromUnitVectors(T.Object3D.DEFAULT_UP,delta.normalize());
    g.applyMatrix4(new T.Matrix4().compose(start.add(end).multiplyScalar(.5),rotation,new T.Vector3(1,1,1)));
    queuePart(g,leaf,(x+endX)/2,(z+endZ)/2);
  }
  const groundGeometry=new T.PlaneGeometry(160,200,64,80);groundGeometry.rotateX(-Math.PI/2);
  const groundPosition=groundGeometry.getAttribute('position');
  const groundColors=[],soil=new T.Color('#927550'),bank=new T.Color('#596349'),groundColor=new T.Color();
  for(let i=0;i<groundPosition.count;i++){
    const x=groundPosition.getX(i),z=groundPosition.getZ(i);
    groundPosition.setY(i,terrainVertexHeight(x,z));
    const patch=.5+Math.sin(x*.43+z*.22)*.25+Math.sin(z*.51-x*.17)*.15;
    groundColor.copy(soil).lerp(bank,clamp((Math.abs(x)-2.7)/9,0,1)*(.55+patch*.42));
    groundColor.multiplyScalar(.84+patch*.24);groundColors.push(groundColor.r,groundColor.g,groundColor.b);
  }
  groundGeometry.setAttribute('color',new T.Float32BufferAttribute(groundColors,3));
  groundGeometry.computeVertexNormals();
  const ground=new T.Mesh(groundGeometry,groundMat);ground.receiveShadow=true;scene.add(ground);
  // Stone paths use broken edge courses; open central ground remains navigable.
  for(let z=-19;z<24;z+=1.1)for(let x=-1.8;x<2;x+=.9){
    const pathCenter=Math.sin((z+8)*.13)*.42;
    const jitter=(random()-.5)*.1,w=.74+random()*.1,d=.89+random()*.13;
    box(stone,pathCenter+x+jitter,.005+random()*.016,z+jitter,w,.055,d,(random()-.5)*.06);
  }
  const toriiPosts=[];
  for(const o of OBSTACLES){if(o.h<5){
    const postMaterial=red.clone();postMaterial.transparent=true;
    const post=new T.Mesh(new T.CylinderGeometry(.3*.88,.3,o.h,8),postMaterial);
    post.position.set(o.x,o.h/2,o.z);post.castShadow=post.receiveShadow=true;scene.add(post);
    toriiPosts.push({mesh:post,obstacle:o,opacity:1});
  }else{
    const base=shrineBaseSize(o);box(stone,o.x,base.height/2,o.z,base.width,base.height,base.depth);
    box(bark,o.x,2.3,o.z,o.w,4,o.d);
    for(let x=-4;x<=4;x+=1)box(red,x,2.6,-19.45,.16,4.4,.2);
    for(let x=-3.8;x<=4;x+=.25)box(brass,x,2.2,-19.39,.025,2.7,.03);
    for(let tier=0;tier<9;tier++)box(roof,0,5+tier*.19,-23,12-tier*.52,.23,9-tier*.5);
    box(brass,0,6.82,-23,8.5,.14,.25);
  }}
  box(red,0,4.1,7,8.4,.25,.38);box(dark,0,4.65,7,9,.28,.6);box(red,0,4.35,7,.42,.5,.35);
  for(const x of [-3.5,3.5]){box(stone,x,.12,7,.8,.24,.8);box(dark,x,.6,7,.61,.16,.61);}
  for(let z=-15;z<22;z+=9)for(const x of [-7.2,7.2]){
    const y=groundHeightAt(x,z);
    box(stone,x,y+.18,z,.95,.36,.95);column(stone,x,y+.75,z,.18,.95);
    box(stone,x,y+1.45,z,.7,.14,.7);box(brass,x,y+1.68,z,.34,.35,.34);box(roof,x,y+1.99,z,.85,.16,.85);
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
    const rock=new T.DodecahedronGeometry(1,1);const y=groundHeightAt(x,z);
    staticPart(rock,stone,x,y-.18,z,.7+random()*1.5,.5+random()*1.2,.8+random()*1.7,random()*6.28);
  }
  const leafParts=[];
  for(let k=0;k<7;k++){
    const shape=new T.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(.34,.14,.82,.025);shape.quadraticCurveTo(.4,-.10,0,0);
    const g=new T.ShapeGeometry(shape,3);g.setAttribute('windWeight',new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(1),1));g.rotateZ((k%2?-1:1)*(.25+k*.10));g.translate(k*.11,(k%2?1:-1)*.025,0);g.rotateX(-.42);leafParts.push(g);
    const crossed=g.clone();crossed.rotateY(.9);leafParts.push(crossed);
  }
  const leafCluster=mergeGeometries(leafParts);leafParts.forEach(g=>g.dispose());
  for(let i=0;i<150;i++){
    const side=random()<.5?-1:1,x=side*(8+random()*27),z=-46+random()*83,h=5.5+random()*6.5,y=groundHeightAt(x,z);
    column(bark,x,y+h/2,z,.09,h);
    for(let dy=.8;dy<h;dy+=1.15)column(bambooNode,x,y+dy,z,.105,.04);
    for(let j=0;j<6;j++){
      const a=random()*Math.PI*2,reach=.55+random()*1.2;
      const endX=x+Math.sin(a)*reach,endY=y+h*.32+j*h*.095,endZ=z+Math.cos(a)*reach;
      leafBranch(x,endY-.24,z,endX,endY,endZ);
      staticPart(leafCluster.clone(),leaf,endX,endY,endZ,1+random()*.7,1+random()*.4,1+random()*.7,a);
    }
  }
  leafCluster.dispose();
  for(const [mat,cells] of batches)for(const geoms of cells.values()){
    const merged=mergeGeometries(geoms);merged.computeBoundingSphere();
    if(mat===leaf)merged.boundingSphere.radius+=.2;
    const mesh=new T.Mesh(merged,mat);mesh.castShadow=mesh.receiveShadow=true;
    if(mat===leaf)mesh.customDepthMaterial=leafDepth;
    scene.add(mesh);geoms.forEach(g=>g.dispose());
  }
  const grassMat=material('#b8b77d');grassMat.side=T.DoubleSide;
  grassMat.onBeforeCompile=shader=>{shader.uniforms.windTime=wind;shader.vertexShader='uniform float windTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n float gust=sin(windTime*1.15+instanceMatrix[3].x*.19+instanceMatrix[3].z*.13); vec2 gustDelta=vec2(.22,.12)*gust*position.y*position.y; vec2 localX=normalize(vec2(instanceMatrix[0].x,instanceMatrix[0].z)); vec2 localZ=normalize(vec2(instanceMatrix[2].x,instanceMatrix[2].z)); transformed.x+=dot(gustDelta,localX); transformed.z+=dot(gustDelta,localZ);');};
  const blades=[];
  for(let i=0;i<3;i++){
    const blade=new T.PlaneGeometry(.16,.82,1,2);blade.translate(0,.41,0);
    const p=blade.getAttribute('position');
    for(let n=0;n<p.count;n++){const h=p.getY(n)/.82;p.setX(n,p.getX(n)*(1-h*.97)+h*h*.17);p.setZ(n,h*h*.09);}
    blade.rotateY(i*Math.PI*2/3);blade.computeVertexNormals();blades.push(blade);
  }
  const grassGeo=mergeGeometries(blades);blades.forEach(g=>g.dispose());
  const grass=new T.InstancedMesh(grassGeo,grassMat,3000),grassColor=new T.Color();
  let rootError=0;
  for(let i=0;i<3000;i++){
    // Keep the authored amount while pulling tall foreground blades out of the duel corridor.
    const side=random()<.5?-1:1,near=random()<.22,x=side*((near?4.8:9)+random()*(near?5.2:23)),z=-38+random()*67;
    q.setFromAxisAngle(T.Object3D.DEFAULT_UP,random()*Math.PI*2);const scale=.65+random()*.65;
    matrix.compose(pos.set(x,groundHeightAt(x,z)+.006,z),q,s.set(scale,scale,scale));grass.setMatrixAt(i,matrix);
    grassColor.setHSL(.105+random()*.08,.22+random()*.2,.40+random()*.22);grass.setColorAt(i,grassColor);
    rootError=Math.max(rootError,Math.abs(grass.instanceMatrix.array[i*16+13]-groundHeightAt(x,z)-.006));
  }
  const landscapeMetrics={grassClumps:3000,grassBlades:9000,grassTriangles:grassGeo.index.count/3*grass.count,maxRootError:rootError,baseFootprint:shrineBaseSize(OBSTACLES.find(o=>o.h>=5))};
  const grassGroups=partitionInstances(grass);grass.dispose();grassGroups.forEach(g=>scene.add(g));
  landscapeMetrics.grassBatches=grassGroups.length;landscapeMetrics.leafBatches=batches.get(leaf).size;
  const rigs=new Map(),actorMetrics={partsByRig:{}};
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
  function mesh(parent,geom,mat,x,y,z){const m=new T.Mesh(geom,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  function rig(id){
    const root=new T.Group();scene.add(root);const isPlayer=id==='player';
    const cloth=material(isPlayer?'#315873':'#824638',.78),clothShadow=material(isPlayer?'#1d3346':'#492722',.9),
      armor=material(isPlayer?'#263942':'#3d2b28',.66,.08),trim=material(isPlayer?'#c9c7ae':'#c5a166',.62,.14);
    cloth.emissive.set(isPlayer?'#102536':'#32150f');cloth.emissiveIntensity=.16;
    const contact=new T.Mesh(new T.CircleGeometry(.46,20),new T.MeshBasicMaterial({color:'#0b1011',transparent:true,opacity:.28,depthWrite:false}));
    contact.rotation.x=-Math.PI/2;contact.position.y=.018;root.add(contact);
    const body=new T.Group();root.add(body);
    mesh(body,new T.CylinderGeometry(.23,.3,.58,12),cloth,0,1.22,0);
    mesh(body,new T.BoxGeometry(.43,.3,.16),armor,0,1.27,-.08);
    for(let plate=0;plate<3;plate++)mesh(body,new T.BoxGeometry(.39-plate*.025,.045,.19),trim,0,1.38-plate*.085,-.17);
    mesh(body,new T.CylinderGeometry(.31,.32,.105,10),trim,0,.96,0);
    const leftCollar=mesh(body,new T.BoxGeometry(.075,.4,.035),trim,-.07,1.43,-.205);leftCollar.rotation.z=-.34;
    const rightCollar=mesh(body,new T.BoxGeometry(.075,.4,.035),trim,.07,1.43,-.206);rightCollar.rotation.z=.34;
    for(const side of [-1,1]){
      const shoulder=mesh(body,new T.BoxGeometry(.23,.11,.34),armor,side*.31,1.45,0);shoulder.rotation.z=-side*.14;
      const shoulderTrim=mesh(body,new T.BoxGeometry(.19,.035,.35),trim,side*.315,1.49,0);shoulderTrim.rotation.z=-side*.14;
    }
    const skirtFront=[];
    for(const side of [-1,1]){
      const panel=mesh(body,new T.BoxGeometry(.235,.52,.115),clothShadow,side*.13,.69,-.055);panel.rotation.z=side*.045;skirtFront.push(panel);
      const backPanel=mesh(body,new T.BoxGeometry(.21,.48,.08),cloth,side*.12,.71,.13);backPanel.rotation.z=-side*.035;
    }
    const head=mesh(body,new T.SphereGeometry(.145,12,10),skin,0,1.66,0);head.scale.set(.85,1.12,.9);
    mesh(body,new T.SphereGeometry(.148,12,8,0,Math.PI*2,0,Math.PI*.55),dark,0,1.69,0);
    mesh(body,new T.SphereGeometry(.075,8,6),dark,0,1.84,.025);
    const headband=mesh(body,new T.TorusGeometry(.145,.016,4,14),trim,0,1.7,0);headband.rotation.x=Math.PI/2;
    const facePlane=mesh(body,new T.BoxGeometry(.13,.1,.018),skin,0,1.65,-.14);facePlane.rotation.x=-.06;
    const nose=mesh(body,new T.ConeGeometry(.026,.065,6),skin,0,1.66,-.172);nose.rotation.x=-Math.PI/2;
    for(const side of [-1,1])mesh(body,new T.SphereGeometry(.028,6,5),skin,side*.13,1.67,0);
    const limbs=[];
    for(const side of [-1,1]){
      const hip=new T.Group();hip.position.set(side*.15,.96,0);body.add(hip);
      mesh(hip,new T.CylinderGeometry(.145,.205,.52,8),clothShadow,0,-.23,0);
      const knee=new T.Group();knee.position.y=-.49;hip.add(knee);
      mesh(knee,new T.CylinderGeometry(.095,.07,.4,8),dark,0,-.18,0);
      mesh(knee,new T.BoxGeometry(.15,.11,.3),dark,0,-.38,-.07);
      const arm=new T.Group();arm.position.set(side*.28,1.43,0);body.add(arm);
      mesh(arm,new T.CylinderGeometry(.125,.095,.33,8),cloth,0,-.15,0);
      const elbow=new T.Group();elbow.position.y=-.31;arm.add(elbow);
      mesh(elbow,new T.CylinderGeometry(.075,.058,.3,8),skin,0,-.14,0);
      const forearmWrap=mesh(elbow,new T.CylinderGeometry(.08,.075,.12,8),trim,0,-.08,0);
      const hand=mesh(elbow,new T.SphereGeometry(.065,8,6),skin,0,-.31,0);hand.scale.set(.82,1,.8);
      limbs.push({hip,knee,arm,elbow,forearmWrap,hand});
    }
    const scabbard=mesh(body,new T.CylinderGeometry(.048,.06,1.02,8),dark,-.22,.83,.02);scabbard.rotation.z=Math.PI*.42;
    const sword=new T.Group();limbs[1].elbow.add(sword);sword.position.y=-.3;
    mesh(sword,new T.CylinderGeometry(.035,.035,.2,6),dark,0,-.06,0);
    mesh(sword,new T.CylinderGeometry(.07,.07,.025,8),brass,0,-.16,0);
    mesh(sword,new T.BoxGeometry(.065,.9,.022),id==='player'?playerBlade:enemyBlade,0,-.61,0);
    const ring=mesh(root,new T.TorusGeometry(.5,.013,5,32),brass,0,.035,0);ring.rotation.x=Math.PI/2;ring.visible=false;
    const signal=mesh(root,new T.OctahedronGeometry(.1),brass,0,2.1,0);signal.visible=false;
    let generatedParts=0;root.traverse(node=>{if(node.isMesh)generatedParts++;});actorMetrics.partsByRig[id]=generatedParts;
    rigs.set(id,{root,body,limbs,sword,scabbard,ring,signal});return rigs.get(id);
  }
  const look=new T.Vector3();
  const cameraFrame={x:0,y:0,z:0,lookX:0,lookY:0,lookZ:0},smoothedFrame={...cameraFrame};let initialized=false;
  const cameraMetrics={lockedFrames:0,minHorizontalStandoff:null,maxDownAngleDegrees:0,foregroundPostOpacity:1};
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();
  function render(world,dt,orbit=0){
    wind.value=world.time;
    signalMaterial.emissive.set(world.signalLit?'#ffb84f':'#000000');
    signalMaterial.emissiveIntensity=world.signalLit ? .36 : 0;
    signalLight.intensity=world.signalLit?3.2:0;
    signalHalo.visible=world.signalLit;
    for(const a of [world.player,...world.enemies]){
      const r=rigs.get(a.id)||rig(a.id);r.root.position.set(a.x,groundHeightAt(a.x,a.z),a.z);r.root.rotation.y=-a.yaw;
      r.body.rotation.z=a.hp<=0?-Math.PI/2:0;r.body.position.y=a.hp<=0?-.65:0;
      r.sword.visible=!(world.mode==='victory'&&a.id==='player');
      r.ring.visible=world.locked===a.id;r.signal.visible=a.state==='windup';
      const walking=a.state==='idle'?Math.sin(a.stride*6)*.55:0;
      r.limbs.forEach((l,i)=>{const phase=i?walking:-walking;l.hip.rotation.x=phase;l.knee.rotation.x=Math.max(0,-phase)*.8;l.arm.rotation.set(-.2,0,i?-.15:.15);l.elbow.rotation.x=-.55;});
      if(a.state==='guard'||a.state==='windup'){r.limbs[1].arm.rotation.x=-1.6;r.limbs[1].elbow.rotation.x=-1.1;}
      if(a.state==='attack'){
        const u=clamp((a.age-.1)/.24,0,1);r.limbs[1].arm.rotation.x=-2.7+u*2.5;r.limbs[1].arm.rotation.z=-.5+u*.9;r.limbs[1].elbow.rotation.x=-.3;
      }
      if(a.state==='dodge')r.body.rotation.x=-.35;else r.body.rotation.x=0;
      if(world.mode==='victory'&&a.id==='player'&&a.hp>0){
        r.body.rotation.set(0,0,0);
        r.limbs[0].arm.rotation.set(-.42,0,.18);r.limbs[0].elbow.rotation.x=-.28;
        r.limbs[1].arm.rotation.set(-.52,0,-.18);r.limbs[1].elbow.rotation.x=-.32;
      }
    }
    computeCameraFrame(world,orbit,camera.aspect,cameraFrame);
    interpolateCameraFrame(smoothedFrame,cameraFrame,dt,initialized);
    camera.position.set(smoothedFrame.x,smoothedFrame.y,smoothedFrame.z);
    look.set(smoothedFrame.lookX,smoothedFrame.lookY,smoothedFrame.lookZ);
    camera.lookAt(look);initialized=true;
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
    if(world.mode==='playing'&&world.locked){
      const horizontal=Math.hypot(smoothedFrame.x-smoothedFrame.lookX,smoothedFrame.z-smoothedFrame.lookZ);
      const downAngle=Math.atan2(smoothedFrame.y-smoothedFrame.lookY,horizontal)*180/Math.PI;
      cameraMetrics.lockedFrames++;
      cameraMetrics.minHorizontalStandoff=Math.min(cameraMetrics.minHorizontalStandoff??Infinity,horizontal);
      cameraMetrics.maxDownAngleDegrees=Math.max(cameraMetrics.maxDownAngleDegrees,downAngle);
    }
    renderer.render(scene,camera);
  }
  return {render,resize,renderer,scene,camera,cameraDiagnostics:()=>({...cameraMetrics,frame:{...smoothedFrame}}),landscapeDiagnostics:()=>({...landscapeMetrics}),actorDiagnostics:()=>JSON.parse(JSON.stringify(actorMetrics))};
}
