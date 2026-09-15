// Offline asset processing, independently authored for this project. No MPFB
// program source is imported. The input meshes, weights and targets are CC0.
// Run: node fresh/character-tools/derive-mpfb.mjs
import * as T from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {surface,shellSurface} from '../character-sculpt.js';

const root=new URL('../character-assets/',import.meta.url);
const read=name=>{const b=readFileSync(new URL(name,root));return (name.endsWith('.gz')?gunzipSync(b):b).toString();};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function obj(text){
  const vertices=[],uv=[],faces=[],groups=new Map();let group='';
  for(const line of text.split(/\r?\n/)){
    const p=line.trim().split(/\s+/);
    if(p[0]==='v')vertices.push(V(...p.slice(1,4).map(Number)));
    else if(p[0]==='vt')uv.push(p.slice(1,3).map(Number));
    else if(p[0]==='g')group=p[1];
    else if(p[0]==='f'){
      const corners=p.slice(1).map(c=>c.split('/').slice(0,2).map(n=>Number(n)-1));
      faces.push({group,corners});if(!groups.has(group))groups.set(group,new Set());
      for(const [i] of corners)groups.get(group).add(i);
    }
  }
  return {vertices,uv,faces,groups};
}
const base=obj(read('source/base.obj.gz')),rig=JSON.parse(read('source/rig.game_engine.json.gz'));
const weights=JSON.parse(read('source/weights.game_engine.json.gz')).weights;
const bodyFaces=base.faces.filter(f=>f.group==='body');
const profiles={
  player:{'head-age-incr':.13,'chin-width-incr':.12},
  sentinel:{'head-age-incr':.34,'chin-width-incr':.28,'head-scale-horiz-incr':.08},
  retainer:{'head-age-incr':.58,'chin-width-decr':.13,'l-cheek-volume-decr':.12,'r-cheek-volume-decr':.12},
  warden:{'head-age-incr':.72,'chin-width-incr':.35,'nose-scale-depth-incr':.10},
};
function shape(profile){
  const vertices=base.vertices.map(v=>v.clone());
  for(const [target,amount] of Object.entries({'asian-male-young':1,...profile})){
    for(const line of read(`targets/${target}.target.gz`).split(/\r?\n/)){
      if(!/^\d+\s/.test(line))continue;
      const [i,x,y,z]=line.split(/\s+/).map(Number);
      if(!vertices[i]||![x,y,z].every(Number.isFinite))throw Error(`Invalid target ${target}:${i}`);
      vertices[i].addScaledVector(V(x,y,z),amount);
    }
  }
  return vertices;
}
function landmark(descriptor,vertices){
  const ids=descriptor.strategy==='CUBE'?[...base.groups.get(descriptor.cube_name)||[]]:descriptor.vertex_indices;
  if(!ids?.length)throw Error(`Unsupported landmark ${JSON.stringify(descriptor)}`);
  return ids.reduce((p,i)=>p.add(vertices[i]),V()).multiplyScalar(1/ids.length);
}
const joint=(name,vertices)=>landmark({strategy:'CUBE',cube_name:name},vertices);
function fitAsset(name,vertices){
  const mesh=obj(read(`source/${name}.obj.gz`)),text=read(`source/${name}.mhclo.gz`),scales=V(1,1,1),fitted=[];
  let entries=false;
  for(const line of text.split(/\r?\n/)){
    const p=line.trim().split(/\s+/);
    if(/^[xyz]_scale$/.test(p[0])){
      const axis=p[0][0];scales[axis]=Math.abs(vertices[+p[1]][axis]-vertices[+p[2]][axis])/(+p[3]);
    }
    if(p[0]==='verts'){entries=true;continue;}
    if(!entries||!/^\d+$/.test(p[0]))continue;
    if(p.length===1)fitted.push(vertices[+p[0]].clone());
    else if(p.length===9){
      const n=p.map(Number),point=V();
      for(let k=0;k<3;k++)point.addScaledVector(vertices[n[k]],n[k+3]);
      point.add(V(n[6]*scales.x,n[7]*scales.y,n[8]*scales.z));fitted.push(point);
    }else throw Error(`Invalid fitting entry ${name}: ${line}`);
  }
  if(fitted.length!==mesh.vertices.length)throw Error(`Fitting count ${name}: ${fitted.length}/${mesh.vertices.length}`);
  return {...mesh,vertices:fitted};
}
function smoothNormals(vertices,faces){
  const normals=vertices.map(()=>V());
  for(const f of faces){const ids=f.corners.map(c=>c[0]);
    for(let j=1;j<ids.length-1;j++){
      const [a,b,c]=[ids[0],ids[j],ids[j+1]],normal=vertices[b].clone().sub(vertices[a]).cross(vertices[c].clone().sub(vertices[a]));
      for(const i of [a,b,c])normals[i].add(normal);
    }
  }
  return normals.map(n=>n.normalize());
}
const round=n=>Math.round(n*1e6)/1e6;
function pack(vertices,uv,faces,normals=null){
  normals||=smoothNormals(vertices,faces);
  const position=[],normal=[],texcoord=[],index=[],sourceVertex=[],keys=new Map();
  for(const face of faces){
    const corners=face.corners.map(([i,t])=>{
      if(!uv[t])throw Error(`Missing UV ${i}/${t}`);
      const key=`${i}/${t}`;
      if(!keys.has(key)){
        keys.set(key,position.length/3);position.push(...vertices[i].toArray().map(round));
        normal.push(...normals[i].toArray().map(round));texcoord.push(...uv[t].map(round));sourceVertex.push(i);
      }
      return keys.get(key);
    });
    for(let j=1;j<corners.length-1;j++)index.push(corners[0],corners[j],corners[j+1]);
  }
  if(!position.every(Number.isFinite)||!normal.every(Number.isFinite))throw Error('Non-finite geometry');
  return {position,normal,uv:texcoord,index,sourceVertex};
}
const figures={};
function fittedCheekGuard(head){
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(head.position,3));geometry.setIndex(head.index);
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld(true);
  const columns=48,rows=20,fields=[];
  const angleAt=(u,v)=>(u-.5)*2.65*(1-.28*T.MathUtils.smoothstep(v,.2,1));
  const height=(angle,v)=>{
    const side=Math.abs(Math.sin(angle)),earRelief=.018*T.MathUtils.smoothstep(Math.abs(angle),.98,1.325);
    return T.MathUtils.lerp(.045+.033*side**.9,.098+.040*side**.9-earRelief,v);
  };
  for(let i=0;i<=columns;i++){
    const radii=[];
    for(let j=0;j<=rows;j++){
      const angle=angleAt(i/columns,j/rows),axis=V(Math.sin(angle),0,-Math.cos(angle));
      const y=height(angle,j/rows),origin=axis.clone().multiplyScalar(.35).add(V(0,y,.010));
      const hit=new T.Raycaster(origin,axis.clone().negate(),0,.35).intersectObject(mesh,false)[0];
      if(!hit)throw Error(`Missing cheek guard fitting surface ${i}/${j}`);
      radii.push(Math.hypot(hit.point.x,hit.point.z-.010)+.0055);
    }
    // A formed plate bridges the mouth's local relief. Fit a smooth bowed
    // column outside the sampled anatomy; do not recolor its lips and nose.
    const low=Math.max(...radii.slice(0,6)),high=Math.max(...radii.slice(-6));let bow=.001;
    for(let j=1;j<rows;j++)bow=Math.max(bow,(radii[j]-T.MathUtils.lerp(low,high,j/rows))/Math.sin(Math.PI*j/rows));
    fields.push({low,high,bow});
  }
  const outer=surface(columns,rows,(u,v)=>{
    const i=Math.round(u*columns),angle=angleAt(u,v),{low,high,bow}=fields[i];
    const radius=T.MathUtils.lerp(low,high,v)+bow*Math.sin(v*Math.PI);
    return [Math.sin(angle)*radius,height(angle,v),.010-Math.cos(angle)*radius];
  },{flip:true});
  const shell=shellSurface(outer,.002),a=shell.attributes;
  const result={position:Array.from(a.position.array,round),normal:Array.from(a.normal.array,round),uv:Array.from(a.uv.array,round),index:Array.from(shell.index.array),
    sourceVertex:Array(a.position.count).fill(-1),construction:'original formed cheek-and-chin shell fitted outside CC0 native anatomy; continuous open-face rim; 2 mm solid edge'};
  shell.dispose();geometry.dispose();mesh.material.dispose();return result;
}
for(const [id,profile] of Object.entries(profiles)){
  const vertices=shape(profile),neck=joint('joint-neck',vertices),headScale=.105;
  const toHead=p=>V(-p.x*headScale,(p.y-neck.y)*headScale+.025,-(p.z-neck.z)*headScale+.010);
  const hp=vertices.map(toHead),headWeights=new Float64Array(vertices.length);
  for(const name of ['head','neck_01'])for(const [i,w] of weights[name])headWeights[i]+=w;
  // The cut is below the anatomical neck. Its uneven edge is buried inside
  // the garment collar, while the visible throat, jaw and skull stay joined.
  const headFaces=bodyFaces.filter(f=>f.corners.every(([i])=>headWeights[i]>.18&&hp[i].y>-.065));
  const headNormals=smoothNormals(hp,bodyFaces),head=pack(hp,base.uv,headFaces,headNormals);
  const sourceHeadWeights=new Map(weights.head);
  head.headRotationWeight=head.sourceVertex.map(i=>round(sourceHeadWeights.get(i)||0));
  const eyes=fitAsset('eyes',vertices),hair=fitAsset('hair',vertices),brows=fitAsset('brows',vertices);
  const eyeGeometry=pack(eyes.vertices.map(toHead),eyes.uv,eyes.faces);
  // The source brown texture is saturated amber. An iris-only vertex tint
  // gives the cast a dark brown iris without tinting the sclera or modifying
  // the licensed original PNG. Keep colour treatment distinct from skin data.
  eyeGeometry.color=[];
  for(let i=0;i<eyeGeometry.uv.length;i+=2){
    const u=eyeGeometry.uv[i],v=eyeGeometry.uv[i+1];
    const distance=Math.min(Math.hypot(u-.293,v-.290),Math.hypot(u-.706,v-.704));
    const amount=1-T.MathUtils.smoothstep(distance,.105,.135);
    eyeGeometry.color.push(round(1-.55*amount),round(1-.24*amount),round(1-.04*amount));
  }
  const hairGeometry=pack(hair.vertices.map(toHead),hair.uv,hair.faces);
  const browGeometry=pack(brows.vertices.map(toHead),brows.uv,brows.faces);
  const mask=fittedCheekGuard(head);
  figures[id]={head,eyes:eyeGeometry,hair:hairGeometry,brows:browGeometry,mask,profile,
    neckSource:neck.toArray(),headScale,headBounds:new T.Box3().setFromPoints(head.sourceVertex.map(i=>hp[i])).min.toArray().concat(new T.Box3().setFromPoints(head.sourceVertex.map(i=>hp[i])).max.toArray())};
}

function bakeHand(side){
  const s=side<0?'l':'r',vertices=shape(profiles.player),origin=joint(`joint-${s}-hand`,vertices),scale=.090;
  const middle=joint(`joint-${s}-finger-3-1`,vertices),index=joint(`joint-${s}-finger-2-1`,vertices),pinky=joint(`joint-${s}-finger-5-1`,vertices);
  const distal=middle.clone().sub(origin).normalize();
  const across=pinky.clone().sub(index).addScaledVector(distal,-pinky.clone().sub(index).dot(distal)).normalize();
  const normal=across.clone().cross(distal).normalize();
  // Across the palm follows the handle axis. Distal fingers curl around it;
  // this is different from four parallel tubes crossing a vertical handle.
  const toHand=p=>{const d=p.clone().sub(origin);return V(-side*d.dot(distal)*scale,-d.dot(across)*scale,-side*d.dot(normal)*scale);};
  const rest=vertices.map(toHand),matrices={},landmarks={},fingerNames=['thumb','index','middle','ring','pinky'];
  const names=Object.keys(weights).filter(n=>n===`hand_${s}`||(n.endsWith(`_${s}`)&&fingerNames.includes(n.split('_')[0])));
  const identity=new T.Matrix4(),influences=Array.from({length:vertices.length},()=>[]),handWeight=new Float64Array(vertices.length);
  for(const [name,ws] of Object.entries(weights))for(const [i,w] of ws){influences[i].push([name,w]);if(names.includes(name))handWeight[i]+=w;}
  matrices[`hand_${s}`]=identity;
  const gripOffset=V(-side*.092,0,.046);
  for(const finger of fingerNames)for(let segment=1;segment<=3;segment++){
    const name=`${finger}_0${segment}_${s}`,definition=rig[name];
    const h=toHand(landmark(definition.head,vertices)),t=toHand(landmark(definition.tail,vertices));
    const parent=matrices[definition.parent]||identity,posedHead=h.clone().applyMatrix4(parent);
    const length=h.distanceTo(t),radial=posedHead.clone().sub(gripOffset),radius=Math.hypot(radial.x,radial.z);
    const dy=finger==='thumb'?[.009,-.001,-.010][segment-1]:(t.y-h.y)*.30;
    const nextRadius=finger==='thumb'?[.048,.046,.044][segment-1]:radius;
    // Circle/sphere intersection: each phalanx keeps its original length
    // while its centreline follows the outside of the actual handle. Constant
    // Euler curls put the fingertips through the handle, especially pinkies.
    const projectedLength=Math.sqrt(length*length-dy*dy);
    const cosine=(radius*radius+nextRadius*nextRadius-projectedLength*projectedLength)/(2*radius*nextRadius);
    if(cosine>1+1e-7||cosine< -1-1e-7)throw Error(`Unreachable finger contact ${name}`);
    const angle=Math.atan2(radial.z,radial.x)+(finger==='thumb'?side:-side)*Math.acos(T.MathUtils.clamp(cosine,-1,1));
    const posedTail=V(gripOffset.x+Math.cos(angle)*nextRadius,posedHead.y+dy,gripOffset.z+Math.sin(angle)*nextRadius);
    const rotation=new T.Quaternion().setFromUnitVectors(t.clone().sub(h).normalize(),posedTail.clone().sub(posedHead).normalize());
    const matrix=new T.Matrix4().compose(posedHead,rotation,V(1,1,1)).multiply(new T.Matrix4().makeTranslation(-h.x,-h.y,-h.z));
    matrices[name]=matrix;landmarks[name]={head:posedHead.toArray(),tail:t.clone().applyMatrix4(matrix).toArray(),restLength:h.distanceTo(t)};
  }
  let contactProjectionCount=0,maxContactProjection=0;
  const posed=rest.map((p,i)=>{
    if(handWeight[i]<=0)return p.clone();
    const out=V();let total=0;
    for(const [name,w] of influences[i]){out.addScaledVector(p.clone().applyMatrix4(matrices[name]||identity),w);total+=w;}
    out.multiplyScalar(1/total);
    // LBS can squash the flesh between two correctly placed finger bones.
    // Bake the handle's unilateral contact into that skin, rather than let
    // triangles disappear inside the solid hilt. UVs and wrist cut stay intact.
    const dx=out.x-gripOffset.x,dz=out.z-gripOffset.z,r=Math.hypot(dx,dz),contactRadius=.0334;
    if(r<contactRadius&&Math.abs(out.y)<.067){
      maxContactProjection=Math.max(maxContactProjection,contactRadius-r);contactProjectionCount++;
      out.x=gripOffset.x+dx*contactRadius/r;out.z=gripOffset.z+dz*contactRadius/r;
    }
    return out;
  });
  const faces=bodyFaces.filter(f=>f.corners.every(([i])=>handWeight[i]>.001&&rest[i].x*(-side)>-.027));
  const geometry=pack(posed,base.uv,faces,smoothNormals(posed,bodyFaces));
  return {geometry,gripOffset:gripOffset.toArray(),sourceSide:s,sourceWrist:origin.toArray(),landmarks,contactProjectionCount,maxContactProjection,
    staticPose:'CC0 game_engine all-influence LBS; four finger chains curl around sword-local Y; thumb opposition',
    bounds:new T.Box3().setFromPoints(geometry.sourceVertex.map(i=>posed[i])).min.toArray().concat(new T.Box3().setFromPoints(geometry.sourceVertex.map(i=>posed[i])).max.toArray())};
}
const hands={left:bakeHand(-1),right:bakeHand(1)};
const data={schema:1,source:'MakeHuman MPFB hm08',license:'CC0-1.0',figures,hands};
const output='// Derived CC0 MPFB mesh/UV data. Rebuild with character-tools/derive-mpfb.mjs.\nexport default '+JSON.stringify(data)+';\n';
writeFileSync(new URL('native-data.js',root),output);
const report={sourceVertices:base.vertices.length,sourceBodyFaces:bodyFaces.length,profiles,
  figures:Object.fromEntries(Object.entries(figures).map(([id,f])=>[id,{headVertices:f.head.position.length/3,headTriangles:f.head.index.length/3,eyeTriangles:f.eyes.index.length/3,hairTriangles:f.hair.index.length/3,headBounds:f.headBounds,
    cheekGuardTriangles:f.mask.index.length/3,cheekGuardConstruction:f.mask.construction}])),
  hands:Object.fromEntries(Object.entries(hands).map(([id,h])=>[id,{vertices:h.geometry.position.length/3,triangles:h.geometry.index.length/3,gripOffset:h.gripOffset,bounds:h.bounds,landmarks:h.landmarks}])),
  outputSha256:createHash('sha256').update(output).digest('hex')};
writeFileSync(new URL('derivation-report.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({figures:report.figures,hands:Object.fromEntries(Object.entries(report.hands).map(([k,v])=>[k,{triangles:v.triangles,bounds:v.bounds,gripOffset:v.gripOffset}])),bytes:Buffer.byteLength(output),sha256:report.outputSha256},null,2));
