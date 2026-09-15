import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Fresh, boot-generated figures. Anatomical joints are separate from clothing,
// so a sleeve or a rigid skirt panel never substitutes for a knee or an elbow.
export const ANATOMY = Object.freeze({ thigh: .43, shin: .43, sole: .09, upperArm: .32, forearm: .30, hipWidth: .15 });
const palettes = {
  player: { cloth:'#365a70', shadow:'#243b4a', armor:'#27373b', trim:'#b9bbab', cord:'#aaa581', skin:'#bd9c81' },
  sentinel: { cloth:'#774934', shadow:'#472b25', armor:'#42382d', trim:'#bb9868', cord:'#b99d73', skin:'#b79577' },
  retainer: { cloth:'#656253', shadow:'#373e39', armor:'#313a39', trim:'#b8ad83', cord:'#9eaa96', skin:'#af9076' },
  warden: { cloth:'#724640', shadow:'#412c2d', armor:'#303439', trim:'#bba071', cord:'#bba07b', skin:'#b49176' },
};

export function createCharacterResources() {
  // A tiny deterministic woven height field shared by all cloth. No URL loads.
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,v=135+(x%4<2?17:-17)+(y%4<2?11:-11)+((x*13+y*7)%9);
    data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const weave=new T.DataTexture(data,size,size,T.RGBAFormat);weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.repeat.set(3,3);weave.needsUpdate=true;
  const materials=new Map();
  function material(color,roughness=.8,metalness=0,fabric=false){
    const key=[color,roughness,metalness,fabric].join(':');
    if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness,metalness,...(fabric?{bumpMap:weave,bumpScale:.012}:{} )}));
    return materials.get(key);
  }
  return { material, weave };
}

export function createCharacterRig(id, resources=createCharacterResources()) {
  const colors=palettes[id]||palettes.sentinel,mat=resources.material;
  const cloth=mat(colors.cloth,.9,0,true),shadow=mat(colors.shadow,.95,0,true),armor=mat(colors.armor,.53,.22),
    trim=mat(colors.trim,.64,.15),cord=mat(colors.cord,.87),skin=mat(colors.skin,.88),dark=mat('#191f23',.88),
    hair=mat('#22221f',.96),lip=mat('#74534a',.94),eyes=mat('#1c1c19',.73),white=mat('#c4bba6',.9),
    steel=mat(id==='player'?'#e7f4f4':'#ffe0a6',.2,.85),edge=mat('#eff4e5',.13,.92),brass=mat('#b7955b',.34,.7);
  steel.emissive.set(id==='player'?'#7397a1':'#a64b24');steel.emissiveIntensity=id==='player'?.13:.24;
  const root=new T.Group();root.name=`actor-${id}`;
  const body=new T.Group();body.name='pelvis';body.position.y=.92;root.add(body);
  const chest=new T.Group();chest.name='ribcage';chest.position.y=.26;body.add(chest);
  const neck=new T.Group();neck.name='neck';neck.position.y=.37;chest.add(neck);
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
  const ellipsoid=(p,m,x,y,z,w,h,d)=>part(p,new T.SphereGeometry(1,12,9),m,x,y,z,w,h,d);
  const cylinder=(p,m,x,y,z,r1,r2,h,rx=0,ry=0,rz=0)=>part(p,new T.CylinderGeometry(r1,r2,h,10),m,x,y,z,1,1,1,rx,ry,rz);

  // A tapered torso, crossed collar, stitched cloth seams and restrained armor.
  part(chest,new T.CylinderGeometry(.235,.265,.43,14),cloth,0,0,0,1,1,.72);
  ellipsoid(chest,shadow,0,-.16,.005,.247,.14,.167);
  box(chest,armor,0,.025,-.142,.385,.275,.075);
  for(let row=0;row<4;row++){
    box(chest,armor,0,.145-row*.065,-.19,.36-row*.012,.043,.027);
    for(const side of [-1,1])cylinder(chest,cord,side*.117,.145-row*.065,-.212,.008,.008,.037,0,0,.45*side);
  }
  for(const side of [-1,1]){
    box(chest,white,side*.061,.178,-.161,.061,.29,.031,0,0,side*.38);
    box(chest,trim,side*.093,.17,-.18,.018,.28,.021,0,0,side*.38);
    box(chest,shadow,side*.188,-.032,.117,.014,.34,.018,0,0,-side*.12);
    // Laced shoulder lamellae remain attached to the upper arm below.
  }
  part(body,new T.CylinderGeometry(.255,.27,.135,14),shadow,0,.045,0,1,1,.76);
  part(body,new T.CylinderGeometry(.271,.275,.065,14),trim,0,.043,0,1,1,.78);
  for(const side of [-1,1])box(body,cord,side*.065,.055,-.226,.13,.033,.035,0,0,side*.18);
  ellipsoid(body,cord,0,.056,-.236,.039,.027,.032);

  // Face volumes include cheek/jaw planes, eyelids and a narrow mouth. Hair
  // follows the skull; the rear knot and ties make the rear silhouette readable.
  cylinder(neck,skin,0,.022,0,.065,.076,.12);
  ellipsoid(neck,skin,0,.13,-.008,.124,.158,.116);
  ellipsoid(neck,skin,0,.058,-.04,.095,.074,.079);
  for(const side of [-1,1]){
    ellipsoid(neck,skin,side*.073,.108,-.078,.048,.055,.045);
    ellipsoid(neck,skin,side*.12,.126,0,.025,.041,.02);
    ellipsoid(neck,lip,side*.132,.126,-.004,.006,.021,.012);
    box(neck,eyes,side*.049,.159,-.11,.038,.009,.01,0,0,side*.07);
    box(neck,skin,side*.049,.165,-.112,.043,.008,.012,0,0,side*.07);
    box(neck,hair,side*.05,.18,-.107,.048,.01,.012,0,0,-side*.13);
  }
  ellipsoid(neck,skin,0,.122,-.121,.019,.043,.025);
  box(neck,lip,0,.077,-.11,.05,.006,.008);
  part(neck,new T.SphereGeometry(.127,14,10,0,Math.PI*2,0,Math.PI*.58),hair,0,.171,.003,1,1.03,.98);
  for(const side of [-1,1])ellipsoid(neck,hair,side*.1,.19,.033,.035,.073,.06);
  ellipsoid(neck,hair,0,.263,.051,.054,.047,.061);
  part(neck,new T.TorusGeometry(.128,.012,5,20),trim,0,.186,0,1,.92,1,Math.PI/2);
  for(let s=-1;s<=1;s++)box(neck,dark,s*.036,.25,.083,.014,.012,.09,-.15,0,s*.09);
  if(id==='warden'){
    // A distinct practical crest and lower face guard, not a copied costume.
    part(neck,new T.SphereGeometry(.139,14,8,0,Math.PI*2,0,Math.PI*.48),armor,0,.185,.01,1,1,.99);
    box(neck,brass,0,.284,-.051,.037,.085,.025,0,0,-.16);
    box(neck,armor,0,.061,-.102,.135,.075,.04);
  }

  const limbs=[],panels=[],ties=[];
  for(const side of [-1,1]){
    const hip=new T.Group();hip.name=side<0?'left-hip':'right-hip';hip.position.set(side*ANATOMY.hipWidth,0,0);body.add(hip);
    part(hip,new T.CylinderGeometry(.132,.105,ANATOMY.thigh,12),shadow,0,-.205,0,1,1,1.03);
    for(let pleat=-1;pleat<=1;pleat++)box(hip,cloth,pleat*.06,-.23,-.114,.012,.34,.017,0,0,pleat*.07);
    const knee=new T.Group();knee.name='knee';knee.position.y=-ANATOMY.thigh;hip.add(knee);
    ellipsoid(knee,shadow,0,.007,-.007,.104,.095,.104);
    cylinder(knee,dark,0,-.205,0,.086,.066,.37);
    box(knee,armor,0,-.19,-.071,.108,.26,.042);
    for(let wrap=0;wrap<3;wrap++)cylinder(knee,cord,0,-.07-wrap*.112,0,.09-wrap*.006,.09-wrap*.006,.025);
    const ankle=new T.Group();ankle.name='ankle';ankle.position.y=-ANATOMY.shin;knee.add(ankle);
    ellipsoid(ankle,white,0,-.031,-.05,.075,.05,.143);
    box(ankle,cord,0,-.071,-.052,.163,.028,.305);
    box(ankle,dark,0,-.085,-.052,.17,.009,.31);
    for(const strap of [-1,1])box(ankle,dark,strap*.027,-.002,-.09,.028,.018,.15,-.11,strap*.45);
    box(ankle,dark,0,-.023,-.186,.005,.044,.034);
    const arm=new T.Group();arm.name=side<0?'left-shoulder':'right-shoulder';arm.position.set(side*.265,.2,0);chest.add(arm);
    part(arm,new T.CylinderGeometry(.115,.096,ANATOMY.upperArm,12),cloth,0,-.15,0);
    for(let plate=0;plate<3;plate++)box(arm,armor,side*.068,-.005-plate*.044,.0,.165,.044,.24,0,0,-side*.09);
    box(arm,trim,side*.077,.019,0,.17,.017,.24,0,0,-side*.09);
    const elbow=new T.Group();elbow.name='elbow';elbow.position.y=-ANATOMY.upperArm;arm.add(elbow);
    ellipsoid(elbow,shadow,0,0,0,.078,.075,.075);
    cylinder(elbow,skin,0,-.115,0,.073,.054,.24);
    cylinder(elbow,shadow,0,-.114,0,.078,.068,.18);
    box(elbow,armor,0,-.127,-.063,.087,.155,.032);
    for(let wrap=0;wrap<3;wrap++)cylinder(elbow,cord,0,-.066-wrap*.047,0,.078-wrap*.004,.078-wrap*.004,.015);
    const wrist=new T.Group();wrist.name='wrist';wrist.position.y=-ANATOMY.forearm;elbow.add(wrist);
    ellipsoid(wrist,skin,0,0,0,.05,.064,.038);
    for(let finger=0;finger<4;finger++)ellipsoid(wrist,skin,(finger-1.5)*.021,-.018,-.025,.013,.031,.016);
    ellipsoid(wrist,skin,side*.049,.018,-.017,.019,.034,.022);
    limbs.push({side,hip,knee,ankle,arm,elbow,wrist,hand:wrist});
    for(const front of [-1,1]){
      const panel=new T.Group();panel.name=front<0?'hakama-front':'hakama-back';panel.position.set(side*.13,-.045,front*.135);body.add(panel);
      box(panel,front<0?shadow:cloth,0,-.235,0,.232,.47,.033,0,0,-side*.025);
      for(let fold=-1;fold<=1;fold++)box(panel,front<0?cloth:shadow,fold*.065,-.238,front*.021,.01,.434,.008,0,0,fold*.023);
      box(panel,trim,0,-.462,0,.225,.013,.036);
      panels.push({node:panel,side,front});
    }
    const tie=new T.Group();tie.name='headband-tail';tie.position.set(side*.054,.177,.115);neck.add(tie);
    box(tie,trim,0,-.108,.022,.027,.22,.008,-.17,0,side*.14);ties.push(tie);
  }
  const sash=new T.Group();sash.name='sash-tail';sash.position.set(-.19,.03,.16);body.add(sash);
  box(sash,cord,0,-.14,.011,.063,.29,.012,-.11,0,.1);ties.push(sash);

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
    const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const mesh=new T.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
  }
  let meshes=0;root.traverse(node=>{if(node.isMesh)meshes++;});
  return {id,root,body,chest,neck,limbs,panels,ties,sword,blade,scabbard,ring,signal,contact,
    metrics:{generatedParts,drawMeshes:meshes,articulatedJoints:24,externalRuntimeAssets:0},motion:null};
}
