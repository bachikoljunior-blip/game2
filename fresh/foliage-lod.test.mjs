import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {headlessPresentation} from './vegetation-test-support.mjs';
import {createForegroundVisibility} from './foreground-visibility.js';
import {foliageAlphaAt,foliageHitIsOpaque} from './foliage-lod.js';
import {createWorld} from './simulation.js';
import {VEGETATION_MODELS} from './vegetation-physics.js';

const ready=headlessPresentation();
function activeFaces(g,predicate){let count=0;for(let i=0;i<Math.min(g.index.count,g.drawRange.count);i+=3)if(predicate(g.attributes.leafPivot.getW(g.index.getX(i))))count++;return count;}

test('draw selection preserves opaque wood and all physical leaves, uses one cutout per distant twig, and reverses without new drawables',async t=>{
 const view=await ready,meshes=[];view.scene.traverse(m=>{if(m.geometry?.userData.vegetationLod)meshes.push(m);});
 assert.ok(meshes.length>10);const mesh=meshes[0],g=mesh.geometry,lod=g.userData.vegetationLod,group=[...lod.groups.values()].find(g=>g.far!==g.near),center=group.bounds.getCenter(new T.Vector3()),normal=group.normal.clone(),original=g.attributes.position.array.slice();
 const totalWood=meshes.reduce((sum,m)=>sum+activeFaces(m.geometry,k=>k===0),0),objects=view.scene.children.length;
 const setDistance=d=>view.renderInspection(center.clone().addScaledVector(normal,d),center);
 setDistance(.7);assert.equal(group.level,0);const nearIndices=Array.from(g.index.array.slice(0,g.drawRange.count));
 const beforeTransition=lod.transitions;setDistance(60);assert.equal(group.level,1);assert.ok(lod.transitions>beforeTransition);
 assert.equal(meshes.reduce((sum,m)=>sum+activeFaces(m.geometry,k=>k===0),0),totalWood,'every original wood triangle survives the representation change');
 assert.equal(group.far.length/3,2+group.near.length/3-36*7,'the frond replaces exactly 36 seven-face leaves');
 for(const d of [61,60,59,60])setDistance(d);const stable=lod.transitions;setDistance(60);assert.equal(lod.transitions,stable);
 setDistance(.7);assert.equal(group.level,0);assert.deepEqual(g.attributes.position.array,original,'no physical surface or bind position is rewritten');assert.equal(view.scene.children.length,objects);
 assert.ok(nearIndices.length>0);
 const world=createWorld();view.beginWorld(world);view.render(world,1/60,0,{draw:false});const stats=view.landscapeDiagnostics().wind.lod;
 const bambooFar=meshes.filter(m=>m.geometry.userData.vegetationLod.kind==='bamboo').reduce((n,m)=>n+m.geometry.userData.vegetationLod.farTwigs,0);
 assert.ok(bambooFar>450,'normal arrival selects a majority of the 900 bamboo twig fronds');assert.ok(stats.activeTriangles<stats.fullTriangles*.65,'normal submitted bamboo faces are materially fewer despite twice as many small leaves');
 t.diagnostic(JSON.stringify(stats));
});

test('original atlas masks have gaps, preserve near wood opacity and share alpha-aware visible/depth/proxy silhouettes',async t=>{
 const view=await ready;let mesh;view.scene.traverse(m=>{if(!mesh&&m.geometry?.userData.vegetationLod)mesh=m;});
 const {map,alphaTest}=mesh.userData.foliageAlpha;assert.equal(map,mesh.material.map);assert.equal(map,mesh.customDepthMaterial.map);assert.equal(alphaTest,mesh.customDepthMaterial.alphaTest);assert.equal(map.generateMipmaps,false);assert.equal(map.mipmaps.length,7);assert.equal(map.mipmaps.at(-1).width,8);
 const atlas=view.landscapeDiagnostics().wind.foliage.atlas;assert.ok(atlas.coverage.every(v=>v>.05&&v<.5));
 for(const row of atlas.coverageMips.filter(r=>r.size>=32))for(let i=0;i<3;i++)assert.ok(Math.abs(row.fronds[i]-atlas.coverage[i])<.045,'cutout mip coverage does not collapse into bare sticks');
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <alphatest_fragment>'},depth={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <alphatest_fragment>'};mesh.material.onBeforeCompile(shader);mesh.customDepthMaterial.onBeforeCompile(depth);assert.equal(shader.vertexShader,depth.vertexShader);assert.equal(shader.fragmentShader,depth.fragmentShader);assert.match(shader.fragmentShader,/if\(foliageCutout>\.5\)/);
 const g=mesh.geometry,p=g.attributes.leafPivot,uv=g.attributes.uv;let checked=0;
 for(let i=0;i<p.count;i++)if(p.getW(i)===0){assert.equal(foliageAlphaAt(map,new T.Vector2(uv.getX(i),uv.getY(i))),1);checked++;}assert.ok(checked>20);
 // Exact ray agreement for the active far triangle at moving support states,
 // including transparent pixels within its rectangular geometric boundary.
 const group=[...g.userData.vegetationLod.groups.values()].find(x=>x.far!==x.near),center=group.bounds.getCenter(new T.Vector3());view.renderInspection(center.clone().addScaledVector(group.normal,70),center);assert.equal(group.level,1);
 const visibility=createForegroundVisibility();visibility.add(mesh,{vegetation:view.vegetation,id:'frond-mask'});let holes=0,opaque=0;
 for(const time of [0,2.3,7.1]){
   view.vegetation.update(time);const copy=g.clone(),position=copy.attributes.position;for(let i=0;i<position.count;i++)position.setXYZ(i,...view.vegetation.deformVertex(g,i,time));copy.computeBoundingBox();copy.computeBoundingSphere();
   const proxy=new T.Mesh(copy,new T.MeshBasicMaterial({side:T.DoubleSide}));proxy.userData.foliageAlpha=mesh.userData.foliageAlpha;proxy.updateMatrixWorld();
   const [a,b,c]=Array.from(group.far.slice(0,3),i=>new T.Vector3().fromBufferAttribute(position,i)),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
   for(const [u,v] of [[.05,.05],[.2,.1],[.3,.4],[.65,.1],[.1,.8],[.4,.2],[.15,.65],[.6,.25]]){
     const point=a.clone().multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v),camera=point.clone().addScaledVector(normal,.4),target=point.clone().addScaledVector(normal,-.4),ray=new T.Raycaster(camera,normal.clone().negate(),.02,.765),hits=ray.intersectObject(proxy,false),expected=hits.some(foliageHitIsOpaque);
     if(hits.length&&!expected)holes++;if(expected)opaque++;visibility.reset();visibility.update(camera,[target],.25,time);assert.equal(visibility.diagnostics().some(e=>e.blocked),expected);
   }
   copy.dispose();proxy.material.dispose();
 }
 assert.ok(holes>0&&opaque>0,'both actual blade coverage and holes inside the card are tested');t.diagnostic(JSON.stringify({atlasCoverage:atlas.coverage,holes,opaque,woodVertices:checked}));
});

test('added foliage carries finite modal mass and measured projected-area loads while roots, woody stiffness and damping remain fixed',async t=>{
 const view=await ready,physics=view.vegetation;let loaded=0,totalMass=0,maxStrain=0;
 for(const beam of physics.beams){const spec=VEGETATION_MODELS[beam.kind];assert.equal(beam.stiffness,spec.stiffness/(beam.length/spec.length)**3);assert.equal(beam.damping,spec.damping);
  if(beam.foliageLoad){loaded++;const l=beam.foliageLoad;assert.ok(l.newArea>l.oldArea*5);
   // Inclined crowns expose more area than the former horizontal leaves. The
   // eight-azimuth mean projection of any triangle is at most .654 of its area;
   // overlap can only decrease it. This geometric bound replaces the obsolete
   // horizontal-only .3 ratio; the dynamic strain bound below is unchanged.
   assert.ok(l.newCrosswindArea<l.newArea*.66);assert.ok(l.extraDragArea>0&&l.extraDragArea<l.shelter*(l.newArea*.66+(l.newArea-l.oldArea)*l.verticalEddyFraction));assert.ok(l.extraMass>0);totalMass+=l.extraMass;}
 }
 assert.equal(loaded,900);
 for(let i=0;i<=1200;i++){physics.update(i/60);if(i%30===0)for(const beam of physics.beams)if(beam.attachmentSegments)for(const [a,b] of beam.attachmentSegments.slice(1)){
  const rest=new T.Vector3(...a).distanceTo(new T.Vector3(...b)),current=new T.Vector3(...physics.frameAt(beam.id,a).position).distanceTo(new T.Vector3(...physics.frameAt(beam.id,b).position));maxStrain=Math.max(maxStrain,Math.abs(current/rest-1));
 }}
 assert.equal(physics.metrics.maxRootDrift,0);assert.ok(maxStrain<.002,'the increased projected load retains the existing short-member strain bound');t.diagnostic(JSON.stringify({loaded,totalAdditionalLaminaMassKg:totalMass,maxShortMemberStrain:maxStrain,maxTipByKind:physics.metrics.maxTipByKind}));
});

test('distant maple retains each real leaf and major lobe while CPU rays follow its selected shared-vertex triangles',async()=>{
 const view=await ready;let mesh;view.scene.traverse(m=>{if(!mesh&&m.geometry?.userData.vegetationLod?.kind==='maple')mesh=m;});const g=mesh.geometry,group=[...g.userData.vegetationLod.groups.values()][0],center=group.bounds.getCenter(new T.Vector3());view.renderInspection(center.clone().add(new T.Vector3(0,60,0)),center);assert.equal(group.level,1);
 assert.equal(group.near.length/3,12*23);assert.equal(group.far.length/3,12*13);
 const leafSet=indices=>new Set(Array.from(indices,i=>[g.attributes.leafPivot.getX(i),g.attributes.leafPivot.getY(i),g.attributes.leafPivot.getZ(i),g.attributes.leafDirection.getW(i)].join('/')));assert.deepEqual(leafSet(group.far),leafSet(group.near));
 const visibility=createForegroundVisibility();visibility.add(mesh,{vegetation:view.vegetation,id:'maple-lod'});
 for(const time of [0,3.2,8.4]){
  view.vegetation.update(time);const reference=g.clone(),p=reference.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,...view.vegetation.deformVertex(g,i,time));reference.computeBoundingBox();reference.computeBoundingSphere();const proxy=new T.Mesh(reference,new T.MeshBasicMaterial({side:T.DoubleSide}));proxy.updateMatrixWorld();
  for(let face=0;face<group.far.length;face+=39){const [a,b,c]=Array.from(group.far.slice(face,face+3),i=>new T.Vector3().fromBufferAttribute(p,i)),point=a.clone().add(b).add(c).divideScalar(3),normal=b.sub(a).cross(c.sub(a)).normalize();
   for(const offset of [new T.Vector3(),new T.Vector3(.18,.23,-.19)]){const camera=point.clone().add(offset).addScaledVector(normal,.3),target=point.clone().add(offset).addScaledVector(normal,-.3),ray=new T.Raycaster(camera,normal.clone().negate(),.02,.565),expected=ray.intersectObject(proxy,false).length>0;visibility.reset();visibility.update(camera,[target],.25,time);assert.equal(visibility.diagnostics().some(e=>e.blocked),expected);}
  }reference.dispose();proxy.material.dispose();
 }
});
