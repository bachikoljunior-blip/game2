import * as T from 'three';
import {clothDisplacement} from './wind.js';
import {foliageHitIsOpaque} from './foliage-lod.js';

// The authored ridge keeps its seed, transforms and solid footprint. Separate
// drawables let an intervening rock fade without changing the distant spine.
export function addForegroundRidge(foreground,scene,material,fork){
  const rocks=[];
  function add(geometry,x,y,z,sx,sy,sz,rotation=0){
    const rock=new T.Mesh(geometry,material);
    rock.position.set(x,y,z);rock.scale.set(sx,sy,sz);rock.rotation.y=rotation;
    rock.castShadow=rock.receiveShadow=true;
    foreground.add(rock,{id:`route-rock-${rocks.length}`});scene.add(rock);rocks.push(rock);
  }
  add(new T.BoxGeometry(1,1,1),fork.x,.62,fork.z,fork.w,1.24,fork.d);
  let seed=9042026;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let z=fork.z+fork.d/2-.65;z>fork.z-fork.d/2+.45;z-=1.45)for(const x of [-1.35,0,1.35]){
    const rock=new T.DodecahedronGeometry(1,1),sx=.72+random()*.22,sy=.72+random()*.5,sz=.72+random()*.25;
    add(rock,x+(random()-.5)*.18,.75+sy*.52,z+(random()-.5)*.16,sx,sy,sz,random()*6.28);
  }
  return rocks;
}

// Probe the animated anatomy and the whole blade, rather than the camera's
// between-actors focus: a clear focus ray can still hide either combatant.
export function characterSightPoints(rig,out=[]){
  if(!rig)return out;
  rig.root.updateWorldMatrix(true,true);
  for(const [joint,x,y,z] of [[rig.neck,0,.14,0],
    [rig.chest,0,.08,0],[rig.chest,-.2,.08,0],[rig.chest,.2,.08,0],
    [rig.body,0,0,0]])out.push(new T.Vector3(x,y,z).applyMatrix4(joint.matrixWorld));
  if(rig.blade.visible)for(const u of [0,.25,.5,.75,1]){
    out.push(new T.Vector3(.045*u*u,.128+.96*u,0).applyMatrix4(rig.sword.matrixWorld));
  }
  return out;
}

// The render and intersection passes read the SAME current support state.
// Re-solving an old wind formula here would fade leaves that are not on the ray.
function bendLeaves(part,time,physics,matrixWorld,meetsSphere){
  const {proxy,source,ranges,sphere}=part,p=proxy.geometry.attributes.position,index=proxy.geometry.index.array;
  let count=0;proxy.geometry.boundingBox.makeEmpty();
  for(const range of ranges){
    const level=part.lodGroup?.level??0,selected=range.indicesByLevel[level];
    if(!selected.length)continue;
    if(range.pivot){
      sphere.center.fromArray(physics.frameAt(range.beam,range.pivot).position);sphere.radius=range.radius;sphere.applyMatrix4(matrixWorld);
      if(!meetsSphere(sphere))continue;
    }
    for(const i of range.verticesByLevel[level]){
      const point=physics.deformVertex(source,i,time);p.setXYZ(i,...point);part.vertex.fromArray(point);proxy.geometry.boundingBox.expandByPoint(part.vertex);
    }
    index.set(selected,count);count+=selected.length;
  }
  proxy.geometry.setDrawRange(0,count);
  // Mesh.raycast uses this bound before individual triangles. Only the active
  // vertices above participate; unselected leaves keep their immutable source.
  if(count)proxy.geometry.boundingBox.getBoundingSphere(proxy.geometry.boundingSphere);
  return count>0;
}

function leafRanges(source,nearIndices=source.index.array,farIndices=nearIndices){
  const p=source.attributes.position,pivot=source.attributes.leafPivot,support=source.attributes.windSupport,direction=source.attributes.leafDirection,
    groups=new Map(),byVertex=[];
  for(let i=0;i<p.count;i++){
    const kind=pivot.getW(i),leaf=kind>0,key=leaf?[pivot.getX(i),pivot.getY(i),pivot.getZ(i),direction.getW(i)].join('/'):kind<0?'frond':'wood';
    let range=groups.get(key);
    if(!range){range={kind,vertices:[],indicesByLevel:[[],[]],beam:support.getW(i),pivot:leaf?[pivot.getX(i),pivot.getY(i),pivot.getZ(i)]:null,radius:0};groups.set(key,range);}
    range.vertices.push(i);byVertex[i]=range;
    if(leaf){
      const offset=new T.Vector3(support.getX(i)-pivot.getX(i),support.getY(i)-pivot.getY(i),support.getZ(i)-pivot.getZ(i)),axis=new T.Vector3(direction.getX(i),direction.getY(i),direction.getZ(i)),along=offset.dot(axis);
      // Triangle inequality: curved centreline arc plus perpendicular offset.
      // Rotation cannot enlarge either length. The 6 mm guard also covers the
      // small-angle centreline approximation and Float32 bind rounding.
      range.radius=Math.max(range.radius,Math.abs(along)+offset.addScaledVector(axis,-along).length()+.006);
    }
  }
  for(const [level,indices] of [[0,nearIndices],[1,farIndices]])for(const vertex of indices)byVertex[vertex].indicesByLevel[level].push(vertex);
  for(const range of groups.values())range.verticesByLevel=range.indicesByLevel.map(indices=>[...new Set(indices)]);
  return [...groups.values()];
}

// Rendering retains the existing spatial batches. CPU intersection proxies
// have smaller branch bounds, so a near cell does not animate all its leaves
// on the CPU merely because one branch is in front of the camera.
function leafProxies(source,material,alpha){
  const lod=source.userData.vegetationLod,groups=new Map(),support=source.attributes.windSupport,names=['position','uv','windSupport','leafPivot','leafAxis','leafDirection'];
  const vertexGroup=[],localIndex=[];
  for(let i=0;i<source.attributes.position.count;i++){
    const key=support.getW(i);
    let group=groups.get(key);
    if(!group){group=Object.fromEntries([...names,'indices'].map(name=>[name,[]]));group.lodGroup=lod?.groups.get(key);groups.set(key,group);}
    vertexGroup[i]=group;localIndex[i]=group.position.length/3;
    for(const name of names){
      const a=source.attributes[name];for(let k=0;k<a.itemSize;k++)group[name].push(a.array[i*a.itemSize+k]);
    }
  }
  const indices=lod?.allIndices??source.index?.array,count=indices?.length??source.attributes.position.count;
  for(let i=0;i<count;i++){
    const vertex=indices?indices[i]:i;vertexGroup[vertex].indices.push(localIndex[vertex]);
  }
  return [...groups.values()].map(group=>{
    const nearIndices=group.lodGroup?Array.from(group.lodGroup.near,i=>localIndex[i]):group.indices,farIndices=group.lodGroup?Array.from(group.lodGroup.far,i=>localIndex[i]):nearIndices;
    const source=new T.BufferGeometry();
    for(const name of names)source.setAttribute(name,new T.Float32BufferAttribute(group[name],name==='position'?3:name==='uv'?2:4));
    source.setIndex(group.indices);source.computeBoundingBox();
    const proxy=new T.Mesh(source.clone(),material);proxy.matrixAutoUpdate=false;proxy.geometry.boundingSphere=new T.Sphere();proxy.userData.foliageAlpha=alpha;
    return {source,proxy,lodGroup:group.lodGroup,ranges:leafRanges(source,nearIndices,farIndices),sphere:new T.Sphere(),vertex:new T.Vector3(),bounds:source.boundingBox.clone().expandByScalar(1.4),worldBounds:new T.Box3()};
  });
}

// Every registered visible object owns its opacity. Material.clone does not
// copy compile hooks; preserve them explicitly, including the wind clock.
export function createForegroundVisibility(){
  const entries=[],raycaster=new T.Raycaster(),direction=new T.Vector3(),intersection=new T.Vector3();
  const rayMaterial=new T.MeshBasicMaterial({side:T.DoubleSide});
  function add(mesh,{cloth=false,vegetation=false,id=mesh.name||`foreground-${entries.length}`}={}){
    if(!mesh.name)mesh.name=id;
    const source=mesh.material,material=source.clone();
    material.onBeforeCompile=source.onBeforeCompile;
    material.customProgramCacheKey=source.customProgramCacheKey;
    mesh.material=material;
    const geometry=cloth?mesh.geometry.clone():mesh.geometry;
    const proxy=new T.Mesh(geometry,rayMaterial);proxy.matrixAutoUpdate=false;
    mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox.clone();if(cloth||vegetation)bounds.expandByScalar(1.4);
    entries.push({id,mesh,proxy,cloth,vegetation,leafParts:vegetation?leafProxies(mesh.geometry,rayMaterial,mesh.userData.foliageAlpha):[],bounds,worldBounds:new T.Box3(),positions:cloth?mesh.geometry.attributes.position.array.slice():null,
      opacity:source.opacity,baseOpacity:source.opacity,transparent:source.transparent,
      depthWrite:source.depthWrite,castShadow:mesh.castShadow,hold:0,blocked:false});
    return mesh;
  }
  function apply(entry){
    const {mesh}=entry,faded=entry.opacity<entry.baseOpacity-.001;
    mesh.material.opacity=entry.opacity;
    const transparent=entry.transparent||faded;
    if(mesh.material.transparent!==transparent){mesh.material.transparent=transparent;mesh.material.needsUpdate=true;}
    mesh.material.depthWrite=faded?false:entry.depthWrite;
    mesh.castShadow=entry.castShadow&&entry.opacity>entry.baseOpacity*.55;
  }
  function reset(){for(const entry of entries){entry.opacity=entry.baseOpacity;entry.hold=0;entry.blocked=false;apply(entry);}}
  function update(camera,points,seconds,windTime,{animate=true}={}){
    if(!animate)return;
    const dt=Math.max(0,Math.min(seconds,.25));
    const meetsSightline=bounds=>points.some(point=>{
      const distance=direction.subVectors(point,camera).length();
      if(distance<.08)return false;
      raycaster.set(camera,direction.multiplyScalar(1/distance));
      return bounds.containsPoint(camera)||
        (raycaster.ray.intersectBox(bounds,intersection)&&intersection.distanceTo(camera)<distance);
    });
    const meetsSphere=sphere=>points.some(point=>{
      const distance=direction.subVectors(point,camera).length();if(distance<.08)return false;
      raycaster.set(camera,direction.multiplyScalar(1/distance));
      return sphere.containsPoint(camera)||(raycaster.ray.intersectSphere(sphere,intersection)&&intersection.distanceTo(camera)<distance);
    });
    for(const entry of entries){
      const {mesh,proxy}=entry;
      mesh.updateWorldMatrix(true,false);proxy.matrixWorld.copy(mesh.matrixWorld);
      entry.worldBounds.copy(entry.bounds).applyMatrix4(mesh.matrixWorld);
      const nearby=mesh.visible&&meetsSightline(entry.worldBounds),proxies=entry.vegetation?[]:[proxy];
      if(nearby&&entry.cloth){
        const p=proxy.geometry.attributes.position,base=entry.positions;
        for(let i=0;i<p.count;i++){
          const x=base[i*3],y=base[i*3+1],z=base[i*3+2];
          const d=clothDisplacement(x,y,windTime,mesh.matrixWorld.elements[12],mesh.matrixWorld.elements[14]);
          p.setXYZ(i,x+d.x,y+d.y,z+d.z);
        }
        proxy.geometry.computeBoundingSphere();proxy.geometry.computeBoundingBox();
      }
      if(nearby&&entry.vegetation)for(const part of entry.leafParts){
        part.worldBounds.copy(part.bounds).applyMatrix4(mesh.matrixWorld);
        if(!meetsSightline(part.worldBounds))continue;
        part.proxy.matrixWorld.copy(mesh.matrixWorld);
        if(bendLeaves(part,windTime,entry.vegetation,mesh.matrixWorld,meetsSphere))proxies.push(part.proxy);
      }
      entry.blocked=false;
      if(nearby)for(const point of points){
        const distance=direction.subVectors(point,camera).length();
        if(distance<.08)continue;
        raycaster.set(camera,direction.multiplyScalar(1/distance));
        raycaster.near=.02;raycaster.far=distance-.035;
        if(raycaster.intersectObjects(proxies,false).some(foliageHitIsOpaque)){entry.blocked=true;break;}
      }
      // Brief release hysteresis stops a fluttering edge or sword tip from
      // repeatedly switching the material; opacity itself remains continuous.
      entry.hold=entry.blocked?.18:Math.max(0,entry.hold-dt);
      const wanted=entry.hold>0?entry.baseOpacity*.08:entry.baseOpacity;
      entry.opacity+=(wanted-entry.opacity)*(1-Math.exp(-dt*(wanted<entry.opacity?22:5)));
      if(Math.abs(entry.opacity-wanted)<.0005)entry.opacity=wanted;
      apply(entry);
    }
  }
  const diagnostics=()=>entries.filter(e=>e.opacity<e.baseOpacity-.001||e.blocked)
    .map(e=>({id:e.id,opacity:e.opacity,blocked:e.blocked}));
  return {add,update,reset,diagnostics};
}
