import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createMapleLeafGeometry,createBambooLeafGeometry,configureLeafSurface} from './leaf-surface.js';
import {headlessPresentation} from './vegetation-test-support.mjs';
import {chooseVegetationInspection} from './vegetation-inspection.js';

test('metre-sized leaves have a narrow attached petiole, curved surface and consistently oriented real silhouette',()=>{
  for(const [kind,build] of [['maple',createMapleLeafGeometry],['bamboo',createBambooLeafGeometry]])for(const seed of [0,1.7,4.8]){
    const g=build({seed}),p=g.attributes.position,n=g.attributes.normal;g.computeBoundingBox();
    const size=g.boundingBox.getSize(new T.Vector3());
    assert.ok(size.x>.09&&size.x<.12);assert.ok(size.z>.003&&size.z<.009,'a real curved surface, not a planar card');
    assert.ok(kind==='maple'?size.y>.08&&size.y<.1:size.y>.01&&size.y<.014);
    let roots=0,normalVariation=0;
    for(let i=0;i<p.count;i++){
      assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
      normalVariation=Math.max(normalVariation,Math.abs(n.getX(i))+Math.abs(n.getY(i)));
      if(p.getX(i)===0){roots++;assert.ok(Math.abs(p.getY(i))<.0006&&p.getZ(i)===0);}
      assert.equal(g.attributes.leafPivot.getX(i),0);assert.equal(g.attributes.leafPivot.getY(i),0);assert.equal(g.attributes.leafPivot.getZ(i),0);
    }
    assert.equal(roots,2);assert.ok(normalVariation>.1);
    for(let i=0;i<g.index.count;i+=3){
      const [a,b,c]=[0,1,2].map(k=>g.index.getX(i+k)),area=(p.getX(b)-p.getX(a))*(p.getY(c)-p.getY(a))-(p.getY(b)-p.getY(a))*(p.getX(c)-p.getX(a));
      assert.ok(area>1e-8,'every projected face keeps its winding and nonzero area');
    }
  }
});

test('vein and roughness surfaces are deterministic opaque boot data with shared visible/depth silhouettes',()=>{
  for(const kind of ['maple','bamboo']){
    const a=configureLeafSurface(new T.MeshStandardMaterial(),kind),b=configureLeafSurface(new T.MeshStandardMaterial(),kind);
    assert.deepEqual(a.map.image.data,b.map.image.data);assert.deepEqual(a.roughnessMap.image.data,b.roughnessMap.image.data);
    assert.equal(a.alphaMap,null);assert.equal(a.alphaTest,0);assert.equal(a.transparent,false);assert.equal(a.side,T.DoubleSide);assert.equal(a.forceSinglePass,true);
    const data=a.map.image.data;for(let i=3;i<data.length;i+=4)assert.equal(data[i],255);
    const rough=a.roughnessMap.image.data;assert.ok(new Set(rough.filter((_,i)=>i%4!==3)).size>20,'veins and lamina have distinct roughness');
    assert.equal(a.map.image.width,128);assert.equal(a.roughnessMap.image.height,128);
  }
});

test('all generated leaves attach on existing twigs or connected short side shoots, while roots, grass and support counts stay fixed',async t=>{
  const view=await headlessPresentation(),physics=view.vegetation,metrics=view.landscapeDiagnostics(),leaves=new Map(),woodByBeam=new Map();
  view.scene.traverse(mesh=>{
    if(!mesh.name.includes('-leaves-'))return;
    const g=mesh.geometry,a=g.attributes.leafPivot,s=g.attributes.windSupport,d=g.attributes.leafDirection;
    for(let i=0;i<a.count;i++)if(a.getW(i)>0){
      const id=s.getW(i),key=[id,d.getW(i),a.getX(i),a.getY(i),a.getZ(i)].join('/');
      if(!leaves.has(key))leaves.set(key,{kind:a.getW(i),beam:id,length:g.attributes.leafAxis.getW(i)});
      const beam=physics.beams[id],pivot=new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)),segments=beam.attachmentSegments??[[[0,0,0],[0,beam.length,0]]];
      const distance=Math.min(...segments.map(([a,b])=>new T.Line3(new T.Vector3(...a),new T.Vector3(...b)).closestPointToPoint(pivot,true,new T.Vector3()).distanceTo(pivot)));
      assert.ok(distance<.000004,'every leaf pivot lies within its real twig or side-shoot centreline');
    }else if(a.getW(i)===0){
      const id=s.getW(i);if(!woodByBeam.has(id))woodByBeam.set(id,[]);woodByBeam.get(id).push(new T.Vector3(s.getX(i),s.getY(i),s.getZ(i)));
    }
  });
  const maple=[...leaves.values()].filter(l=>l.kind===2),bamboo=[...leaves.values()].filter(l=>l.kind===1);
  assert.equal(maple.length,3888);assert.equal(bamboo.length,32400);
  assert.equal(new Set(maple.map(l=>l.beam)).size,324);assert.equal(new Set(bamboo.map(l=>l.beam)).size,900);
  assert.ok([...leaves.values()].every(l=>l.length>.075&&l.length<(l.kind===1?.19:.13)),'no giant authored leaf remains');
  assert.equal(physics.beams.length,2317);assert.equal(physics.beams.filter(b=>b.kind==='bamboo'&&b.parent===null).length,150);
  assert.equal(metrics.grassClumps,3000);assert.equal(metrics.grassBlades,9000);assert.equal(metrics.grassTriangles,36000);
  assert.ok(metrics.maxRootError<.000001);assert.equal(metrics.minGrassRouteClearance,1.5300000000000002);
  for(let step=0;step<=240;step++)physics.update(step/60);
  assert.equal(physics.metrics.maxRootDrift,0);
  let sideShoots=0,maxChordStrain=0;
  for(const beam of physics.beams)if(beam.attachmentSegments){
    const wood=woodByBeam.get(beam.id),main=new T.Line3(...beam.attachmentSegments[0].map(p=>new T.Vector3(...p)));
    for(const [a,b] of beam.attachmentSegments.slice(1)){
      const start=new T.Vector3(...a),end=new T.Vector3(...b),length=start.distanceTo(end);
      assert.ok(main.closestPointToPoint(start,true,new T.Vector3()).distanceTo(start)<.000004,'the short member starts inside its actual main twig');
      for(const endpoint of [start,end])assert.ok(Math.min(...wood.map(p=>p.distanceTo(endpoint)))<.0025,'actual wood vertices surround both attachment and growing tip');
      const pa=new T.Vector3(...physics.frameAt(beam.id,a).position),pb=new T.Vector3(...physics.frameAt(beam.id,b).position);
      maxChordStrain=Math.max(maxChordStrain,Math.abs(pa.distanceTo(pb)/length-1));sideShoots++;
    }
  }
  assert.equal(sideShoots,1800);assert.ok(maxChordStrain<.002,'short-member transport remains a small-strain approximation');
  t.diagnostic(JSON.stringify({leafCount:leaves.size,geometry:metrics.wind.foliage.geometry,supports:physics.beams.length}));
});

test('inspection separates other-wood selection from self/all intersections and preserves the 0795 cameras and gameplay state',async t=>{
  const view=await headlessPresentation();for(let i=0;i<=480;i++)view.vegetation.update(i/60);
  const beforeCamera=view.camera.matrixWorld.clone(),before=[];
  view.scene.traverse(m=>{if(m.isMesh)before.push([m,m.visible,m.material.opacity,m.castShadow]);});
  const fixtures=[['maple',false,[-14.212534234788277,6.03363304163433,11],10],
    ['maple',true,[-22.653732723345136,6.160202290925306,9.707858565434153],1],
    ['bamboo',false,[-10.855302543191842,7.088122691379403,11.815975591540337],8]];
  for(const [kind,close,previousCamera,selfRays] of fixtures){
    const s=view.scene.userData.vegetationSpecimens[kind],choice=chooseVegetationInspection(view,s,{close,time:8});
    assert.deepEqual(choice.position,previousCamera,'diagnostic recount cannot change the chosen 0795 camera');
    assert.equal(choice.selectionOccludedRays,0);assert.match(choice.selectionScope,/other woody objects/);
    assert.match(choice.selectionScope,close?/target twig and ancestor supports excluded/:/entire target plant excluded/);
    assert.deepEqual(choice.woodyOcclusion,{self:selfRays,other:0,all:selfRays,totalRays:choice.totalRays,time:8});
    assert.ok(choice.woodyOcclusion.all>0,'a zero selection count is not an all-wood visibility pass');
    if(close)assert.ok(choice.faceCosine>.65);
    const camera=new T.PerspectiveCamera(view.camera.fov,view.camera.aspect,.1,230);camera.position.fromArray(choice.position);camera.lookAt(new T.Vector3(...choice.target));camera.updateMatrixWorld();
    const points=close?choice.subject:[[s.x,s.y,s.z],[s.x,s.y+s.height,s.z]];
    for(const p of points){const projected=new T.Vector3(...p).project(camera);assert.ok(Math.abs(projected.x)<.94&&Math.abs(projected.y)<.94&&projected.z>-1&&projected.z<1);}
    t.diagnostic(JSON.stringify({kind,close,camera:choice.position,selectionScope:choice.selectionScope,selectionOccludedRays:choice.selectionOccludedRays,woodyOcclusion:choice.woodyOcclusion}));
  }
  assert.deepEqual(view.camera.matrixWorld,beforeCamera);
  for(const [mesh,visible,opacity,shadow] of before){assert.equal(mesh.visible,visible);assert.equal(mesh.material.opacity,opacity);assert.equal(mesh.castShadow,shadow);}
});
