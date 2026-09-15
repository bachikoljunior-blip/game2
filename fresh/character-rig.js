import * as T from 'three';
import {createNativeCharacterResources,nativeFigure,nativeHand,nativeGeometry,nativeCollar} from './character-assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface,loft,headSculpt,facePoint,eyeSurface,eyeDisc,faceRibbon,hakamaPanel,clothRibbon,
  breastplate,shoulderPlate,hairCap,scalpLock,earSculpt,handSculpt,fingerSculpt,footSculpt,createSurfaceTextures } from './character-sculpt.js';

// CC0 native head/neck and hands join original generated clothing and weapons.
// Anatomical joints are separate from clothing,
// so clothing never substitutes for an anatomical knee or elbow.
export const ANATOMY = Object.freeze({ thigh: .43, shin: .43, sole: .09, upperArm: .32, forearm: .30, hipWidth: .15 });
const palettes = {
  player: { cloth:'#426781', shadow:'#273e50', armor:'#343e43', trim:'#a8ad9f', cord:'#9e987d', skin:'#bb9276' },
  sentinel: { cloth:'#774934', shadow:'#472b25', armor:'#42382d', trim:'#bb9868', cord:'#b99d73', skin:'#b79577' },
  retainer: { cloth:'#656253', shadow:'#373e39', armor:'#313a39', trim:'#b8ad83', cord:'#9eaa96', skin:'#af9076' },
  warden: { cloth:'#724640', shadow:'#412c2d', armor:'#303439', trim:'#bba071', cord:'#bba07b', skin:'#b49176' },
};

export function createCharacterResources(options={}) {
  const textures=createSurfaceTextures(),materials=new Map(),native=createNativeCharacterResources(options);
  function material(color,roughness=.8,metalness=0,type=null,doubleSided=false){
    if(type===true)type='cloth';
    const key=[color,roughness,metalness,type,doubleSided].join(':');
    if(!materials.has(key)){
      const maps=textures[type]||{},bumpScale=type==='cloth'?.00025:type==='skin'?.00006:type==='hair'?.00015:.00035;
      const m=new T.MeshStandardMaterial({color,roughness,metalness,...maps,bumpScale});
      m.name=`character-${type||'plain'}-${color}`;
      // Open garment cuts and thin armour must cast the same two-sided shadow
      // as the visible surface; no shader-only displacement is used.
      if(type==='cloth'||type==='hair'||type==='metal'||doubleSided)m.side=T.DoubleSide;
      materials.set(key,m);
    }
    return materials.get(key);
  }
  return { material,textures,weave:textures.cloth.bumpMap,native,ready:native.ready };
}

export function createCharacterRig(id, resources=createCharacterResources()) {
  const colors=palettes[id]||palettes.sentinel,mat=resources.material;
  const cloth=mat(colors.cloth,.99,0,'cloth'),shadow=mat(colors.shadow,1,0,'cloth'),armor=mat(colors.armor,.78,.38,'metal'),
    trim=mat(colors.trim,.92,0,'cloth'),cord=mat(colors.cord,.98,0,'cord'),skin=mat(colors.skin,.97,0,'skin'),dark=mat('#242523',.95,0,'leather'),
    hair=mat('#252420',.98,0,'hair'),lip=mat('#866055',.89),eyes=mat('#141512',.39),white=mat('#928c76',1,0,'cloth'),
    steel=mat(id==='player'?'#e7f4f4':'#ffe0a6',.2,.85),edge=mat('#eff4e5',.13,.92),brass=mat('#b7955b',.34,.7);
  steel.emissive.set(id==='player'?'#7397a1':'#a64b24');steel.emissiveIntensity=id==='player'?.13:.24;
  const root=new T.Group();root.name=`actor-${id}`;
  const body=new T.Group();body.name='pelvis';body.position.y=.92;root.add(body);
  const chest=new T.Group();chest.name='ribcage';chest.position.y=.26;body.add(chest);
  const neck=new T.Group();neck.name='neck';neck.position.y=.315;chest.add(neck);
  const batches=new Map();let generatedParts=0;
  // Merge static details per articulated bone/material, not across joints.
  function part(parent,geometry,material,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    const transform=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(sx,sy,sz));
    geometry.applyMatrix4(transform);let nonindexed=geometry.index?geometry.toNonIndexed():geometry;
    if(nonindexed!==geometry)geometry.dispose();
    if(!batches.has(parent))batches.set(parent,new Map());const bucket=batches.get(parent);
    if(!bucket.has(material))bucket.set(material,[]);bucket.get(material).push(nonindexed);generatedParts++;
  }
  const box=(p,m,x,y,z,w,h,d,rx=0,ry=0,rz=0)=>part(p,new T.BoxGeometry(w,h,d),m,x,y,z,1,1,1,rx,ry,rz);
  const cylinder=(p,m,x,y,z,r1,r2,h,rx=0,ry=0,rz=0)=>part(p,new T.CylinderGeometry(r1,r2,h,10),m,x,y,z,1,1,1,rx,ry,rz);

  // Continuous tailored volumes preserve the skeletal pivots and reach. The
  // cloth is broad over ribs/scapulae and compressed into the waist sash.
  part(chest,loft([[-.25,.183,.119,0],[-.18,.204,.140,.005],[-.075,.215,.151,.008],
    [.045,.229,.159,.008],[.157,.247,.146,.006],[.207,.250,.132,.002],[.246,.190,.107,0],[.280,.095,.075,0]],
    {fold:.006,folds:11,segments:24,rows:16,deform:(p,u,v)=>{
      p[2]+=.009*Math.max(0,Math.cos(u*Math.PI*2))*Math.sin(v*Math.PI);return p;
    }}),cloth);
  // The cuirass follows the ribcage. Its lames overlap vertically while the
  // collar stays cloth, keeping the neck/shoulder transition soft and narrow.
  for(let row=0;row<5;row++){
    const top=.110-row*.051,bottom=top-.056,width=.315+(row<2?row*.009:(4-row)*.009);
    part(chest,breastplate(top,bottom,width,row*.001),armor);
    for(const side of [-1,1]){
      const x=side*(.104+row*.001);
      part(chest,clothRibbon([[x,top-.009,-.204],[x+side*.009,top-.020,-.211],[x,top-.032,-.207]],.0045,{steps:8}),cord);
    }
  }
  part(chest,clothRibbon([[-.083,.258,-.076],[-.064,.205,-.136],[.006,.10,-.181],[.09,-.018,-.182]],.043),trim);
  part(chest,clothRibbon([[.083,.258,-.076],[.062,.207,-.139],[-.008,.110,-.190],[-.10,-.012,-.191]],.047),cloth);
  part(chest,clothRibbon([[.081,.258,-.082],[.060,.207,-.145],[-.013,.106,-.195],[-.099,-.012,-.197]],.006),trim);
  // Folded cloth at the back collar and seams moulds to the body, not a box.
  part(chest,loft([[.242,.126,.092,0],[.272,.092,.078,0],[.288,.077,.066,0]],{segments:24,rows:6}),shadow);
  for(const side of [-1,1])part(chest,clothRibbon([[side*.179,.180,.083],[side*.201,.057,.142],
    [side*.173,-.096,.126],[side*.157,-.210,.104]],.007),shadow);
  part(body,loft([[-.032,.224,.161,0],[.015,.230,.169,0],[.095,.224,.161,0],[.113,.213,.151,0]],
    {fold:.0025,folds:14,rows:8}),shadow);
  for(let band=0;band<3;band++)part(body,loft([[.014+band*.026,.231,.170,0],[.035+band*.026,.229,.170,0]],
    {segments:28,rows:2}),cord);
  part(body,clothRibbon([[-.14,.064,-.163],[-.06,.043,-.182],[.037,.069,-.183],[.104,.043,-.167]],.025),cord);
  part(body,clothRibbon([[-.017,.063,-.182],[.012,.088,-.198],[.031,.053,-.196],[.006,.038,-.187]],.027),cord);

  const figure=nativeFigure(id);
  // The collar follows the imported lower neck and hides its extraction cut.
  // It is carried by the chest; the exposed head/neck retains its own pivot.
  part(chest,nativeCollar(figure.head),cloth,0,neck.position.y,0);
  part(neck,nativeGeometry(figure.head),resources.native.skin);
  part(neck,nativeGeometry(figure.eyes),resources.native.eyes);
  part(neck,nativeGeometry(figure.hair),resources.native.hair);
  part(neck,nativeGeometry(figure.brows),resources.native.brows);
  // The fitted hairline is the CC0 short04 asset. The tied rear lock is an
  // original, modest addition; this pilot does not claim a finished hairstyle.
  part(neck,loft([[.245,.012,.013,.049],[.268,.031,.027,.053],[.291,.032,.025,.043],[.308,.016,.014,.028],[.310,.002,.003,.024]],
    {segments:22,rows:12,fold:.001,folds:9}),hair);
  part(neck,loft([[.279,.034,.027,.048],[.287,.032,.025,.045]],{segments:22,rows:2}),cord);
  if(id==='warden'){
    part(neck,surface(36,14,(u,v)=>{
      const theta=u*Math.PI*2,phi=.10+v*1.24;
      return [Math.sin(theta)*Math.sin(phi)*.111,.171+Math.cos(phi)*.127,-.027+Math.cos(theta)*Math.sin(phi)*.124];
    },{wrap:true,flip:true}),armor);
    part(neck,surface(4,18,(u,v)=>{
      const theta=Math.PI+(u-.5)*.14,phi=.16+v*1.03;
      return [Math.sin(theta)*Math.sin(phi)*.1125,.171+Math.cos(phi)*.1285,
        -.027+Math.cos(theta)*Math.sin(phi)*.1255];
    },{flip:true}),brass);
    part(neck,nativeGeometry(figure.mask),armor);
  }

  const limbs=[],panels=[],ties=[];
  for(const side of [-1,1]){
    const hip=new T.Group();hip.name=side<0?'left-hip':'right-hip';hip.position.set(side*ANATOMY.hipWidth,0,0);body.add(hip);
    part(hip,loft([[-.435,.069,.073,0],[-.360,.091,.087,.003],[-.255,.103,.093,.003],
      [-.112,.105,.092,0],[.023,.100,.091,0]],{fold:.005,folds:9,rows:22,phase:side*.3}),shadow);
    const knee=new T.Group();knee.name='knee';knee.position.y=-ANATOMY.thigh;hip.add(knee);
    part(knee,loft([[-.397,.052,.059,.006],[-.303,.061,.071,.012],[-.202,.073,.082,.014],[-.090,.078,.080,.004],[.035,.079,.080,0]],
      {segments:24,rows:20,fold:.003,folds:7}),shadow);
    part(knee,surface(16,10,(u,v)=>{
      const angle=(u-.5)*1.65,y=-.320+v*.269,r=.062+Math.sin(v*Math.PI)*.017;
      return [Math.sin(angle)*r,y,-Math.cos(angle)*(r+.004)];
    }),armor);
    for(let wrap=0;wrap<4;wrap++){
      const y=-.055-wrap*.085,r=.080-wrap*.007;
      part(knee,loft([[y-.015,r,r+.003,.006],[y+.012,r+.001,r+.004,.006]],{segments:22,rows:2}),cord);
    }
    const ankle=new T.Group();ankle.name='ankle';ankle.position.y=-ANATOMY.shin;knee.add(ankle);
    part(ankle,footSculpt({side}),white);part(ankle,footSculpt({sole:true,side}),cord);
    part(ankle,loft([[-.029,.048,.050,.024],[.023,.049,.050,.022],[.076,.047,.047,.018]],{segments:22,rows:12,fold:.0018,folds:8}),white);
    for(const strap of [-1,1])part(ankle,clothRibbon([[strap*.057,-.032,-.024],[strap*.032,.006,-.055],[0,-.023,-.127]],.012),dark);
    part(ankle,clothRibbon([[side*.020,-.043,-.184],[side*.018,-.027,-.164],[side*.017,-.015,-.139]],.0025),dark);
    const arm=new T.Group();arm.name=side<0?'left-shoulder':'right-shoulder';arm.position.set(side*.265,.2,0);chest.add(arm);
    part(arm,loft([[-.335,.082,.075,.002],[-.282,.104,.098,.008],[-.204,.098,.091,.004],
      [-.119,.094,.091,0],[-.025,.098,.095,0],[.035,.087,.085,0],[.073,.020,.026,0]],{segments:24,rows:22,fold:.006,folds:8,phase:side}),cloth);
    const shoulderRows=id==='player'?2:id==='warden'?4:3;
    for(let plate=0;plate<shoulderRows;plate++)part(arm,shoulderPlate(side,plate),armor);
    part(arm,loft([[-.329,.085,.079,.002],[-.305,.094,.089,.005]],{segments:26,rows:2}),shadow);
    const elbow=new T.Group();elbow.name='elbow';elbow.position.y=-ANATOMY.upperArm;arm.add(elbow);
    // A cloth cuff overlaps the native wrist cut. There is one continuous
    // exposed hand surface rather than a separate skin tube under the sleeve.
    part(elbow,loft([[-.307,.032,.031,0],[-.283,.037,.035,0],[-.244,.044,.040,0],[-.224,.044,.040,0]],
      {segments:22,rows:10,fold:.001,folds:7}),shadow);
    part(elbow,loft([[-.112,.061,.056,.002],[-.024,.072,.066,.003],[.029,.067,.064,0],[.058,.034,.038,0]],
      {segments:24,rows:14,fold:.002,folds:7}),shadow);
    part(elbow,loft([[-.244,.044,.040,0],[-.175,.061,.055,.002],[-.058,.070,.064,.003]],
      {segments:24,rows:16,fold:.0025,folds:8}),shadow);
    part(elbow,surface(16,10,(u,v)=>{
      const angle=(u-.5)*1.55,y=-.222+v*.155,r=.047+v*.020;
      return [Math.sin(angle)*r,y,-Math.cos(angle)*(r+.003)];
    }),armor);
    for(let wrap=0;wrap<3;wrap++){
      const y=-.091-wrap*.052,r=.068-wrap*.009;
      part(elbow,loft([[y-.008,r,r*.94,.002],[y+.006,r+.001,r*.94+.001,.002]],{segments:22,rows:2}),cord);
    }
    const wrist=new T.Group();wrist.name='wrist';wrist.position.y=-ANATOMY.forearm;elbow.add(wrist);
    const importedHand=nativeHand(side);
    part(wrist,nativeGeometry(importedHand.geometry),resources.native.skin);
    const gripOffset=new T.Vector3(...importedHand.gripOffset);
    limbs.push({side,hip,knee,ankle,arm,elbow,wrist,hand:wrist,gripOffset});
    for(const front of [-1,1]){
      const panel=new T.Group();panel.name=front<0?'hakama-front':'hakama-back';panel.position.set(side*.128,-.041,front*.139);body.add(panel);
      part(panel,hakamaPanel(side,front),cloth);panels.push({node:panel,side,front});
    }

  }
  const sash=new T.Group();sash.name='sash-tail';sash.position.set(-.19,.030,.138);body.add(sash);
  part(sash,clothRibbon([[0,0,0],[-.006,-.09,.015],[.013,-.18,.021],[.026,-.262,.012]],.048,{fray:.0008}),
    mat(colors.cord,.98,0,'cord',true));ties.push(sash);

  const scabbard=new T.Group();scabbard.name='scabbard';scabbard.position.set(-.225,.04,.045);scabbard.rotation.set(1.76,0,-.11);body.add(scabbard);
  cylinder(scabbard,dark,0,.525,0,.035,.044,1.05);
  cylinder(scabbard,brass,0,.018,0,.049,.049,.047);
  cylinder(scabbard,brass,0,1.035,0,.04,.035,.052);
  for(let band=0;band<2;band++)cylinder(scabbard,cord,0,.17+band*.12,0,.043,.044,.033);
  const sword=new T.Group();sword.name='katana';root.add(sword);
  cylinder(sword,dark,0,-.046,0,.028,.033,.245);
  for(let wrap=0;wrap<7;wrap++){
    box(sword,cord,0,-.146+wrap*.032,-.029,.038,.012,.006,0,0,wrap%2?.65:-.65);
    box(sword,cord,0,-.146+wrap*.032,.029,.038,.012,.006,0,0,wrap%2?-.65:.65);
  }
  cylinder(sword,brass,0,.087,0,.067,.067,.019);
  cylinder(sword,brass,0,.109,0,.032,.03,.036);
  const blade=new T.Group();blade.name='curved-blade';sword.add(blade);
  // Four-sided curved section with a pointed final segment; the edge is a
  // separate narrow bevel, so highlights follow the swing instead of a box.
  function bladeStrip(x0,x1,material){
    const positions=[];
    for(let n=0;n<15;n++){
      const a=n/15,b=(n+1)/15,curve=t=>.045*t*t;
      const width=t=>t>.86?(1-t)/.14:1;
      for(const face of [-1,1]){
        const v=[[curve(a)+x0*width(a),.128+a*.96,face*.01],[curve(a)+x1*width(a),.128+a*.96,face*.007],
          [curve(b)+x1*width(b),.128+b*.96,face*.007],[curve(b)+x0*width(b),.128+b*.96,face*.01]];
        for(const k of (face===1?[0,1,2,0,2,3]:[2,1,0,3,2,0]))positions.push(...v[k]);
      }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();part(blade,geometry,material);
  }
  bladeStrip(-.025,.017,steel);bladeStrip(.017,.029,edge);
  const contact=new T.Mesh(new T.CircleGeometry(.46,20),new T.MeshBasicMaterial({color:'#0b1011',transparent:true,opacity:.24,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=.012;root.add(contact);
  const ring=new T.Mesh(new T.TorusGeometry(.5,.013,5,32),brass);ring.rotation.x=Math.PI/2;ring.position.y=.028;ring.visible=false;root.add(ring);
  const signal=new T.Mesh(new T.OctahedronGeometry(.065),brass);signal.position.y=2.04;signal.visible=false;root.add(signal);
  for(const [parent,byMaterial] of batches)for(const [material,parts] of byMaterial){
    const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());
    // Rendering retains face normals/UV splits. Ground contact only needs each
    // exact position once; prepare that smaller point set during generation.
    const positions=geometry.getAttribute('position'),seen=new Set(),contactPositions=[];
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),key=`${x},${y},${z}`;
      if(seen.has(key))continue;seen.add(key);contactPositions.push(x,y,z);
    }
    geometry.userData.contactPositions=new Float32Array(contactPositions);
    const mesh=new T.Mesh(geometry,material);mesh.castShadow=material.userData.castShadow!==false;mesh.receiveShadow=true;parent.add(mesh);
  }
  let meshes=0,triangles=0,groundContactPoints=0;
  root.traverse(node=>{if(node.isMesh){
    meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
    groundContactPoints+=(node.geometry.userData.contactPositions?.length||0)/3;
  }});
  return {id,root,body,chest,neck,limbs,panels,ties,sword,blade,scabbard,ring,signal,contact,
    metrics:{generatedParts,drawMeshes:meshes,triangles,groundContactPoints,articulatedJoints:24,
      surfaceConstruction:'CC0-native-head-neck-hands-and-original-draped-clothing',externalRuntimeAssets:5,
      importedTextureAssets:4,importedGeometryAssets:1,
      assetSource:'MakeHuman MPFB hm08 CC0',textureState:resources.native.state},motion:null};
}
