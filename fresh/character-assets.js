import * as T from 'three';
import nativeData from './character-assets/native-data.js';
import {surface,tunicPoint} from './character-sculpt.js';

// These are imported CC0 production assets, not procedurally generated art.
// The source OBJ, UVs, targets, fitting data and all-influence hand bake remain
// reproducible in character-assets/source and character-tools/derive-mpfb.mjs.
export const CHARACTER_ASSET_INFO=Object.freeze({source:nativeData.source,license:nativeData.license,
  textureCount:4,geometry:'static head-neck and posed hands; native eye/hair/eyebrow fitting',
  skin:'young_asian_male / diffuse only',eyes:'Low-Poly / brown',hair:'short04 with original tied knot'});

export function nativeGeometry(data){
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(data.position,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(data.normal,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));
  if(data.color)geometry.setAttribute('color',new T.Float32BufferAttribute(data.color,3));
  geometry.setIndex(data.index);
  geometry.userData.sourceVertex=data.sourceVertex;
  geometry.userData.assetLicense='CC0-1.0';
  return geometry;
}
export function nativeFigure(id){return nativeData.figures[id]||nativeData.figures.sentinel;}
export function nativeHand(side){return nativeData.hands[side<0?'left':'right'];}

function necklineHeight(angle){return .013-.036*Math.max(0,-Math.cos(angle))**3;}
export function tailoredHead(data){
  // The lower imported skin is under the sewn collar. Clip its hidden cut
  // there so the old chest-extraction triangles cannot emerge over a shoulder.
  const position=[],normal=[],uv=[],headWeight=[];
  const corner=i=>({p:new T.Vector3().fromArray(data.position,i*3),n:new T.Vector3().fromArray(data.normal,i*3),uv:new T.Vector2().fromArray(data.uv,i*2),w:data.headRotationWeight?.[i]??1});
  const signed=c=>c.p.y-necklineHeight(Math.atan2(c.p.x,c.p.z-.010))+.007;
  for(let i=0;i<data.index.length;i+=3){
    const source=data.index.slice(i,i+3).map(corner),polygon=[];
    for(let j=0;j<3;j++){
      const a=source[j],b=source[(j+1)%3],fa=signed(a),fb=signed(b);
      if(fa>=0)polygon.push(a);
      if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);polygon.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.clone().lerp(b.uv,t),w:T.MathUtils.lerp(a.w,b.w,t)});}
    }
    for(let j=1;j<polygon.length-1;j++)for(const c of [polygon[0],polygon[j],polygon[j+1]]){
      position.push(...c.p.toArray());normal.push(...c.n.toArray());uv.push(...c.uv.toArray());
      const above=c.p.y-necklineHeight(Math.atan2(c.p.x,c.p.z-.010));
      headWeight.push(T.MathUtils.smoothstep(c.w,.05,.85)*T.MathUtils.smoothstep(above,.005,.030));
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normal,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.userData.assetLicense='CC0-1.0';
  geometry.userData.headWeight=new Float32Array(headWeight);return geometry;
}

export function prepareAnchoredHead(geometry){
  // Keep moving triangles and their normal-sharing neighbours together. The
  // resulting contiguous upload ranges exclude most of the rigid face/scalp.
  const original=geometry.attributes.position,oldWeights=geometry.userData.headWeight,near=new Set(),movingFaces=[],fixedFaces=[],keys=[];
  for(let i=0;i<original.count;i++)keys.push([original.getX(i),original.getY(i),original.getZ(i)].map(v=>Math.round(v*1e7)).join(','));
  for(let i=0;i<original.count;i+=3){if([0,1,2].some(k=>oldWeights[i+k]<1)){movingFaces.push(i);for(let k=0;k<3;k++)near.add(keys[i+k]);}else fixedFaces.push(i);}
  const fringe=fixedFaces.filter(i=>[0,1,2].some(k=>near.has(keys[i+k]))),fringeSet=new Set(fringe),order=[...movingFaces,...fringe,...fixedFaces.filter(i=>!fringeSet.has(i))];
  for(const name of ['position','normal','uv']){const old=geometry.attributes[name],array=new Float32Array(old.array.length);let offset=0;
    for(const i of order){array.set(old.array.subarray(i*old.itemSize,(i+3)*old.itemSize),offset);offset+=old.itemSize*3;}
    geometry.setAttribute(name,new T.BufferAttribute(array,old.itemSize));}
  geometry.userData.headWeight=new Float32Array(order.flatMap(i=>[oldWeights[i],oldWeights[i+1],oldWeights[i+2]]));
  const p=geometry.attributes.position,n=geometry.attributes.normal,weights=geometry.userData.headWeight,groups=[],byPosition=new Map(),vertexGroup=new Uint32Array(p.count);
  p.setUsage(T.DynamicDrawUsage);n.setUsage(T.DynamicDrawUsage);
  for(let i=0;i<p.count;i++){
    const point=new T.Vector3().fromBufferAttribute(p,i),key=point.toArray().map(v=>Math.round(v*1e7)).join(',');let group=byPosition.get(key);
    if(!group){group={id:groups.length,point,vertices:[],weight:weights[i],restSum:new T.Vector3(),fixedSum:new T.Vector3(),sum:new T.Vector3(),adjust:new T.Vector3(),rotation:new T.Quaternion()};byPosition.set(key,group);groups.push(group);}
    group.vertices.push(i);vertexGroup[i]=group.id;
  }
  const movingTriangles=[],normalGroups=new Set(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);const face=b.sub(a).cross(c.sub(a));
    const moving=[0,1,2].some(k=>groups[vertexGroup[i+k]].weight<1);
    if(moving)movingTriangles.push(i);
    for(let k=0;k<3;k++){const group=groups[vertexGroup[i+k]];group.restSum.add(face);if(moving)normalGroups.add(group);else group.fixedSum.add(face);}
  }
  const normals=[...normalGroups],moving=groups.filter(g=>g.weight<1);
  for(const group of normals)group.adjust.fromBufferAttribute(n,group.vertices[0]).multiplyScalar(group.restSum.length()).sub(group.restSum);
  const contacts=new Float32Array(groups.length*3);for(const group of groups)group.point.toArray(contacts,group.id*3);
  const range=list=>{const indices=list.flatMap(g=>g.vertices);return {start:Math.min(...indices)*3,count:(Math.max(...indices)-Math.min(...indices)+1)*3};};
  geometry.userData.contactPositions=contacts;
  geometry.userData.anchoredHead={groups,moving,normals,movingTriangles,vertexGroup,positionRange:range(moving),normalRange:range(normals),last:new T.Quaternion(NaN,0,0,0),inverse:new T.Quaternion(),point:new T.Vector3(),a,b,c};
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export function deformAnchoredHead(mesh,headRotation){
  const geometry=mesh?.geometry,s=geometry?.userData.anchoredHead;if(!s)return false;
  if(s.last.equals(headRotation))return true;
  s.inverse.copy(headRotation).invert();const p=geometry.attributes.position,n=geometry.attributes.normal,contacts=geometry.userData.contactPositions;
  for(const group of s.moving){
    group.rotation.identity().slerp(headRotation,group.weight).premultiply(s.inverse);
    s.point.copy(group.point).applyQuaternion(group.rotation);s.point.toArray(contacts,group.id*3);
    for(const i of group.vertices)p.setXYZ(i,s.point.x,s.point.y,s.point.z);
  }
  for(const group of s.normals)group.sum.copy(group.fixedSum);
  for(const i of s.movingTriangles){
    s.a.fromBufferAttribute(p,i);s.b.fromBufferAttribute(p,i+1);s.c.fromBufferAttribute(p,i+2);s.b.sub(s.a).cross(s.c.sub(s.a));
    for(let k=0;k<3;k++)s.groups[s.vertexGroup[i+k]].sum.add(s.b);
  }
  for(const group of s.normals){
    s.point.copy(group.adjust).applyQuaternion(group.rotation);group.sum.add(s.point).normalize();
    for(const i of group.vertices)n.setXYZ(i,group.sum.x,group.sum.y,group.sum.z);
  }
  for(const [attribute,range] of [[p,s.positionRange],[n,s.normalRange]]){attribute.clearUpdateRanges();attribute.addUpdateRange(range.start,range.count);attribute.needsUpdate=true;}
  geometry.boundingBox.setFromArray(contacts);geometry.boundingBox.getCenter(geometry.boundingSphere.center);let radiusSquared=0;
  for(let i=0;i<contacts.length;i+=3)radiusSquared=Math.max(radiusSquared,s.point.fromArray(contacts,i).distanceToSquared(geometry.boundingSphere.center));
  geometry.boundingSphere.radius=Math.sqrt(radiusSquared);s.last.copy(headRotation);return true;
}

const collarRings=new WeakMap();
const collarTemplates=new WeakMap();
export function nativeCollar(data,{from=0,to=1,offset=0}={}){
  let templates=collarTemplates.get(data);if(!templates){templates=new Map();collarTemplates.set(data,templates);}
  const key=`${from}:${to}:${offset}`;if(templates.has(key))return templates.get(key).clone();
  // Intersect the continuous native neck with one neckline, rather than use
  // the uneven topology extraction cut as the visible cloth boundary.
  const count=64;let ring=collarRings.get(data);
  if(!ring){
    const mesh=new T.Mesh(nativeGeometry(data),new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld(true);ring=[];
    for(let i=0;i<=count;i++){
      const angle=i/count*Math.PI*2;
      const y=necklineHeight(angle),axis=new T.Vector3(Math.sin(angle),0,Math.cos(angle));
      const origin=axis.clone().multiplyScalar(.3).add(new T.Vector3(0,y,.010));
      const hit=new T.Raycaster(origin,axis.clone().negate(),0,.3).intersectObject(mesh,false)[0];
      if(!hit)throw new Error(`Native neckline is open at section ${i}`);
      ring.push(hit.point.addScaledVector(axis,.003));
    }
    ring[count].copy(ring[0]);mesh.geometry.dispose();mesh.material.dispose();collarRings.set(data,ring);
  }
  const support=new T.Mesh(nativeGeometry(data),new T.MeshBasicMaterial({side:T.DoubleSide}));support.updateMatrixWorld(true);
  const ray=new T.Raycaster(),axis=new T.Vector3(),origin=new T.Vector3();ray.near=0;ray.far=.3;
  const geometry=surface(count,to-from>.5?6:4,(u,v)=>{
    if(u===1)u=0; // close the wrap with identical coordinates, including its seam ray
    const i=Math.min(count-1,Math.floor(u*count)),t=u*count-i;
    const top=ring[i].clone().lerp(ring[i+1],t),angle=u*Math.PI*2,w=from+(to-from)*v;
    const bottom=new T.Vector3(...tunicPoint(angle,.235));bottom.y-=.315;
    bottom.x+=Math.sin(angle)*.002;bottom.z+=Math.cos(angle)*.002;
    const p=top.lerp(bottom,w),rise=Math.sin(w*Math.PI)*.0015+offset;
    p.x+=Math.sin(angle)*rise;p.z+=Math.cos(angle)*rise;
    // The anatomical neck widens nonlinearly just below the neckline. Fit
    // the lining between its two seams as well, rather than only its edges.
    axis.set(p.x,0,p.z-.010).normalize();origin.copy(axis).multiplyScalar(.3).add(new T.Vector3(0,p.y,.010));
    ray.set(origin,axis.clone().negate());const hit=ray.intersectObject(support,false)[0];
    if(hit){const radius=Math.max(Math.hypot(p.x,p.z-.010),Math.hypot(hit.point.x,hit.point.z-.010)+.004);
      p.x=axis.x*radius;p.z=.010+axis.z*radius;}
    return p.toArray();
  },{wrap:true,flip:true});
  support.geometry.dispose();support.material.dispose();templates.set(key,geometry);return geometry.clone();
}

export function createNativeCharacterResources({textureLoader}={}){
  const skin=new T.MeshStandardMaterial({color:'#ffffff',roughness:.74,metalness:0});skin.name='mpfb-cc0-skin';
  const eyes=new T.MeshStandardMaterial({color:'#ffffff',roughness:.29,metalness:0,vertexColors:true});eyes.name='mpfb-cc0-eyes';
  const hair=new T.MeshStandardMaterial({color:'#ffffff',roughness:.86,metalness:0,side:T.DoubleSide,alphaTest:.42});hair.name='mpfb-cc0-hair';
  const brows=new T.MeshStandardMaterial({color:'#ffffff',roughness:.96,metalness:0,side:T.DoubleSide,alphaTest:.35,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});brows.name='mpfb-cc0-eyebrows';brows.userData.castShadow=false;
  const resources={skin,eyes,hair,brows,state:'loading',pendingCount:4,readyCount:0,failedCount:0,error:null,ready:null,info:CHARACTER_ASSET_INFO};
  // Node geometry/animation tests do not decode browser images. They must not
  // advertise a successful texture load or attempt to access a fake document.
  if(!textureLoader&&typeof document==='undefined'){
    resources.state='geometry-only';resources.pendingCount=0;resources.ready=Promise.resolve(resources);return resources;
  }
  const loader=textureLoader||new T.TextureLoader();
  const assets=[
    [skin,new URL('./character-assets/textures/young-asian-male.png',import.meta.url).href],
    [eyes,new URL('./character-assets/textures/brown-eye.png',import.meta.url).href],
    [hair,new URL('./character-assets/textures/short-hair.png',import.meta.url).href],
    [brows,new URL('./character-assets/textures/eyebrows.png',import.meta.url).href],
  ];
  resources.ready=Promise.all(assets.map(async([material,url])=>{
    try{
      const texture=await loader.loadAsync(url);texture.colorSpace=T.SRGBColorSpace;
      texture.anisotropy=4;texture.name=material.name;material.map=texture;material.needsUpdate=true;resources.readyCount++;
    }catch(error){resources.failedCount++;throw error;}
    finally{resources.pendingCount--;}
  })).then(()=>{resources.state='ready';return resources;},error=>{
    resources.state='failed';resources.error=String(error);throw new Error('Character textures could not be loaded',{cause:error});
  });
  return resources;
}
