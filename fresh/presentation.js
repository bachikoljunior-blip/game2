import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OBSTACLES } from './simulation.js';
import { SIGNAL } from './mission.js';
import { computeCameraFrame } from './camera-framing.js';

const clamp = T.MathUtils.clamp;
export function createPresentation(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
  const scene = new T.Scene(); scene.fog = new T.FogExp2('#9eaaa8',.0105);
  const camera = new T.PerspectiveCamera(52,1,.1,230);
  scene.add(new T.HemisphereLight('#bdd4e2','#3c3433',1.35));
  const sun = new T.DirectionalLight('#ffe0a8',3.8); sun.position.set(-24,28,18); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-28,right:28,top:32,bottom:-32,near:1,far:110});
  sun.shadow.bias=-.0004; sun.shadow.normalBias=.025; scene.add(sun);
  const rim=new T.DirectionalLight('#8fbdd2',1.15);rim.position.set(18,12,22);scene.add(rim);
  let seed = 310519;
  const random = () => { seed = (1664525*seed+1013904223)>>>0; return seed/4294967296; };
  const material = (color, roughness=.85, metalness=0) => new T.MeshStandardMaterial({color,roughness,metalness});
  const bark=material('#516142'),bambooNode=material('#89905a'),red=material('#a3462f'),stone=material('#747a70'),roof=material('#303e3d'),
    leaf=material('#747b3f'),brass=material('#c5a36b',.35,.65),skin=material('#b49478'),dark=material('#181f25');
  leaf.side=T.DoubleSide;
  // A generated atmospheric dome and sun establish one continuous magic-hour light field.
  const sky=new T.Mesh(new T.SphereGeometry(190,32,18),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{sunDirection:{value:new T.Vector3(-.48,.24,-.84).normalize()}},
    vertexShader:'varying vec3 ray; void main(){ray=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 ray; uniform vec3 sunDirection; void main(){float h=smoothstep(-.18,.72,ray.y);vec3 horizon=vec3(.82,.58,.39);vec3 zenith=vec3(.19,.31,.39);float glow=pow(max(dot(normalize(ray),sunDirection),0.),18.);vec3 c=mix(horizon,zenith,h)+vec3(1.,.43,.12)*glow*.32;gl_FragColor=vec4(c,1.);}'
  }));scene.add(sky);
  const sunCanvas=document.createElement('canvas');sunCanvas.width=sunCanvas.height=128;
  const sunCtx=sunCanvas.getContext('2d'),sunGradient=sunCtx.createRadialGradient(64,64,4,64,64,62);
  sunGradient.addColorStop(0,'rgba(255,246,207,1)');sunGradient.addColorStop(.18,'rgba(255,209,132,.95)');sunGradient.addColorStop(.5,'rgba(255,143,75,.24)');sunGradient.addColorStop(1,'rgba(255,120,55,0)');
  sunCtx.fillStyle=sunGradient;sunCtx.fillRect(0,0,128,128);
  const sunSprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(sunCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  sunSprite.position.set(-52,28,-92);sunSprite.scale.set(24,24,1);scene.add(sunSprite);
  // Generated grain has no external texture request.
  const texCanvas=document.createElement('canvas');texCanvas.width=texCanvas.height=128;
  const ctx=texCanvas.getContext('2d');ctx.fillStyle='#a4a092';ctx.fillRect(0,0,128,128);
  for(let i=0;i<3500;i++){ctx.fillStyle=`rgba(40,42,34,${random()*.14})`;ctx.fillRect(random()*128,random()*128,1+random()*3,1);}
  const texture=new T.CanvasTexture(texCanvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(16,16);texture.colorSpace=T.SRGBColorSpace;
  const groundMat=material('#a5a18d');groundMat.map=texture;
  const batches=new Map();const matrix=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3(),pos=new T.Vector3();
  function staticPart(geometry,mat,x,y,z,sx=1,sy=1,sz=1,ry=0){
    q.setFromAxisAngle(T.Object3D.DEFAULT_UP,ry);matrix.compose(pos.set(x,y,z),q,s.set(sx,sy,sz));geometry.applyMatrix4(matrix);
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(geometry);
  }
  const box=(m,x,y,z,w,h,d,ry=0)=>staticPart(new T.BoxGeometry(1,1,1),m,x,y,z,w,h,d,ry);
  const column=(m,x,y,z,r,h)=>staticPart(new T.CylinderGeometry(r*.88,r,h,8),m,x,y,z);
  const groundGeometry=new T.PlaneGeometry(160,200,64,80);groundGeometry.rotateX(-Math.PI/2);
  const groundPosition=groundGeometry.getAttribute('position');
  for(let i=0;i<groundPosition.count;i++){
    const x=groundPosition.getX(i),z=groundPosition.getZ(i),edge=clamp((Math.abs(x)-4)/28,0,1);
    const ridge=(2.2+Math.sin(x*.17+z*.055)*1.25+Math.sin(z*.11-x*.07)*.65)*edge;
    groundPosition.setY(i,Math.max(0,ridge));
  }
  groundGeometry.computeVertexNormals();
  const ground=new T.Mesh(groundGeometry,groundMat);ground.receiveShadow=true;scene.add(ground);
  // Stone paths use broken edge courses; open central ground remains navigable.
  for(let z=-19;z<24;z+=1.1) for(let x=-1.8;x<2;x+=.9)box(stone,x,.015,z,.85,.07,1.02,random()*.02);
  for(const o of OBSTACLES){if(o.h<5)column(red,o.x,o.h/2,o.z,.3,o.h);else{
    box(stone,o.x,.28,o.z,o.w+1.6,.56,o.d+1.6);
    box(bark,o.x,2.3,o.z,o.w,4,o.d);
    for(let x=-4;x<=4;x+=1)box(red,x,2.6,-19.45,.16,4.4,.2);
    for(let x=-3.8;x<=4;x+=.25)box(brass,x,2.2,-19.39,.025,2.7,.03);
    for(let tier=0;tier<9;tier++)box(roof,0,5+tier*.19,-23,12-tier*.52,.23,9-tier*.5);
    box(brass,0,6.82,-23,8.5,.14,.25);
  }}
  box(red,0,4.1,7,8.4,.25,.38);box(dark,0,4.65,7,9,.28,.6);box(red,0,4.35,7,.42,.5,.35);
  for(const x of [-3.5,3.5]){box(stone,x,.12,7,.8,.24,.8);box(dark,x,.6,7,.61,.16,.61);}
  for(let z=-15;z<22;z+=9)for(const x of [-4.8,4.8]){
    box(stone,x,.18,z,.95,.36,.95);column(stone,x,.75,z,.18,.95);
    box(stone,x,1.45,z,.7,.14,.7);box(brass,x,1.68,z,.34,.35,.34);box(roof,x,1.99,z,.85,.16,.85);
  }
  // Distant terrain is original boot-generated geometry, layered through the haze.
  const mountainMats=[material('#435d5e',1),material('#657b73',1)];
  for(let i=0;i<28;i++){
    const a=i/28*Math.PI*2,rr=65+random()*40;
    const g=new T.DodecahedronGeometry(1,1);g.translate(0,.55,0);
    staticPart(g,mountainMats[i%2],Math.sin(a)*rr,-3,Math.cos(a)*rr,15+random()*15,12+random()*18,17+random()*18,random()*6);
  }
  const leafParts=[];
  for(const angle of [-.48,0,.48]){
    const g=new T.PlaneGeometry(.95,.22,2,1);g.translate(.42,0,0);g.rotateZ(angle);leafParts.push(g);
    const crossed=g.clone();crossed.rotateY(Math.PI/2);leafParts.push(crossed);
  }
  const leafCluster=mergeGeometries(leafParts);leafParts.forEach(g=>g.dispose());
  for(let i=0;i<150;i++){
    const side=random()<.5?-1:1,x=side*(10+random()*39),z=-50+random()*90,h=7+random()*7;
    column(bark,x,h/2,z,.08,h);
    for(let y=.8;y<h;y+=1.15)column(bambooNode,x,y,z,.095,.035);
    for(let j=0;j<6;j++)staticPart(leafCluster.clone(),leaf,x+(random()-.5)*.8,h*.43+j*h*.075,z+(random()-.5)*.8,.8+random()*.55,.8+random()*.35,.8+random()*.55,random()*Math.PI*2);
  }
  leafCluster.dispose();
  for(const [mat,geoms] of batches){const merged=mergeGeometries(geoms);const mesh=new T.Mesh(merged,mat);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);geoms.forEach(g=>g.dispose());}
  const grassMat=material('#8b8951');grassMat.side=T.DoubleSide;
  const wind={value:0};grassMat.onBeforeCompile=shader=>{shader.uniforms.windTime=wind;shader.vertexShader='uniform float windTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(windTime * 1.6 + instanceMatrix[3].x * .3 + instanceMatrix[3].z * .2) * position.y * .24;');};
  const grassGeo=new T.PlaneGeometry(.07,.68,1,3);grassGeo.translate(0,.34,0);
  const grass=new T.InstancedMesh(grassGeo,grassMat,6000);
  for(let i=0;i<6000;i++){const x=(random()<.5?-1:1)*(3+random()*30),z=-38+random()*67;q.setFromAxisAngle(T.Object3D.DEFAULT_UP,random()*Math.PI);matrix.compose(pos.set(x,0,z),q,s.setScalar(.5+random()));grass.setMatrixAt(i,matrix);}
  grass.instanceMatrix.needsUpdate=true;scene.add(grass);
  const rigs=new Map();
  // The hanging signal sits on the existing shrine wall, outside the walking path.
  const signalMaterial=material('#74624a');
  const signalLamp=new T.Mesh(new T.CylinderGeometry(.3,.27,.65,12),signalMaterial);
  signalLamp.position.set(SIGNAL.x,2.3,SIGNAL.z);scene.add(signalLamp);
  const signalCap=new T.Mesh(new T.ConeGeometry(.43,.24,8),roof);
  signalCap.position.set(SIGNAL.x,2.75,SIGNAL.z);scene.add(signalCap);
  const signalLight=new T.PointLight('#ffbb66',0,8,2);
  signalLight.position.set(SIGNAL.x,2.3,SIGNAL.z+.5);scene.add(signalLight);
  function mesh(parent,geom,mat,x,y,z){const m=new T.Mesh(geom,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  function rig(id){
    const root=new T.Group();scene.add(root);const cloth=material(id==='player'?'#344c62':'#7c463a');
    cloth.emissive.set(id==='player'?'#122637':'#32150f');cloth.emissiveIntensity=.22;
    const contact=new T.Mesh(new T.CircleGeometry(.46,20),new T.MeshBasicMaterial({color:'#0b1011',transparent:true,opacity:.28,depthWrite:false}));
    contact.rotation.x=-Math.PI/2;contact.position.y=.018;root.add(contact);
    const body=new T.Group();root.add(body);
    mesh(body,new T.CylinderGeometry(.24,.29,.55,10),cloth,0,1.22,0);
    mesh(body,new T.CylinderGeometry(.29,.29,.09,10),brass,0,.97,0);
    const head=mesh(body,new T.SphereGeometry(.145,12,10),skin,0,1.66,0);head.scale.set(.85,1.12,.9);
    mesh(body,new T.SphereGeometry(.148,12,8,0,Math.PI*2,0,Math.PI*.55),dark,0,1.69,0);
    mesh(body,new T.SphereGeometry(.075,8,6),dark,0,1.84,.025);
    const limbs=[];
    for(const side of [-1,1]){
      const hip=new T.Group();hip.position.set(side*.15,.96,0);body.add(hip);
      mesh(hip,new T.CylinderGeometry(.17,.21,.52,8),cloth,0,-.23,0);
      const knee=new T.Group();knee.position.y=-.49;hip.add(knee);
      mesh(knee,new T.CylinderGeometry(.095,.07,.4,8),dark,0,-.18,0);
      mesh(knee,new T.BoxGeometry(.15,.11,.3),dark,0,-.38,-.07);
      const arm=new T.Group();arm.position.set(side*.28,1.43,0);body.add(arm);
      mesh(arm,new T.CylinderGeometry(.12,.09,.33,8),cloth,0,-.15,0);
      const elbow=new T.Group();elbow.position.y=-.31;arm.add(elbow);
      mesh(elbow,new T.CylinderGeometry(.075,.055,.3,8),skin,0,-.14,0);
      limbs.push({hip,knee,arm,elbow});
    }
    const sword=new T.Group();limbs[1].elbow.add(sword);sword.position.y=-.3;
    mesh(sword,new T.CylinderGeometry(.035,.035,.2,6),dark,0,-.06,0);
    mesh(sword,new T.CylinderGeometry(.07,.07,.025,8),brass,0,-.16,0);
    mesh(sword,new T.BoxGeometry(.055,.9,.018),material('#e6efec',.2,.9),0,-.61,0);
    const ring=mesh(root,new T.TorusGeometry(.5,.013,5,32),brass,0,.035,0);ring.rotation.x=Math.PI/2;ring.visible=false;
    const signal=mesh(root,new T.OctahedronGeometry(.1),brass,0,2.1,0);signal.visible=false;
    rigs.set(id,{root,body,limbs,ring,signal});return rigs.get(id);
  }
  const look=new T.Vector3(),wanted=new T.Vector3(),lookWanted=new T.Vector3();
  const cameraFrame={x:0,y:0,z:0,lookX:0,lookY:0,lookZ:0};let initialized=false;
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();
  function render(world,dt,orbit=0){
    wind.value=world.time;
    signalMaterial.emissive.set(world.signalLit?'#ffb84f':'#000000');
    signalMaterial.emissiveIntensity=world.signalLit?2:0;
    signalLight.intensity=world.signalLit?14:0;
    for(const a of [world.player,...world.enemies]){
      const r=rigs.get(a.id)||rig(a.id);r.root.position.set(a.x,0,a.z);r.root.rotation.y=-a.yaw;
      r.body.rotation.z=a.hp<=0?-Math.PI/2:0;r.body.position.y=a.hp<=0?-.65:0;
      r.ring.visible=world.locked===a.id;r.signal.visible=a.state==='windup';
      const walking=a.state==='idle'?Math.sin(a.stride*6)*.55:0;
      r.limbs.forEach((l,i)=>{const phase=i?walking:-walking;l.hip.rotation.x=phase;l.knee.rotation.x=Math.max(0,-phase)*.8;l.arm.rotation.set(-.2,0,i?-.15:.15);l.elbow.rotation.x=-.55;});
      if(a.state==='guard'||a.state==='windup'){r.limbs[1].arm.rotation.x=-1.6;r.limbs[1].elbow.rotation.x=-1.1;}
      if(a.state==='attack'){
        const u=clamp((a.age-.1)/.24,0,1);r.limbs[1].arm.rotation.x=-2.7+u*2.5;r.limbs[1].arm.rotation.z=-.5+u*.9;r.limbs[1].elbow.rotation.x=-.3;
      }
      if(a.state==='dodge')r.body.rotation.x=-.35;else r.body.rotation.x=0;
    }
    computeCameraFrame(world,orbit,camera.aspect,cameraFrame);
    wanted.set(cameraFrame.x,cameraFrame.y,cameraFrame.z);
    lookWanted.set(cameraFrame.lookX,cameraFrame.lookY,cameraFrame.lookZ);
    const smooth=initialized?1-Math.exp(-Math.min(dt,.1)*8):1;
    camera.position.lerp(wanted,smooth);look.lerp(lookWanted,smooth);camera.lookAt(look);initialized=true;
    renderer.render(scene,camera);
  }
  return {render,resize,renderer,scene,camera};
}
