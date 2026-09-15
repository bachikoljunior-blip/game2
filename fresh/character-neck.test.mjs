import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCharacterRig,createCharacterResources} from './character-rig.js';
import {nativeFigure,nativeGeometry,nativeCollar} from './character-assets.js';
import {updateCharacterRig} from './character-motion.js';

const states=[['idle',.3],['broken',.3],['dead',.5],['victory',1.45],['stagger',.05]];
function pose(id,state,age,resources){
  const rig=createCharacterRig(id,resources),actor={id,x:0,z:0,yaw:0,hp:state==='dead'?0:100,state:state==='victory'?'idle':state,age:0};
  const world={time:0,mode:state==='victory'?'victory':state==='dead'?'defeat':'playing',events:[],locked:null};
  for(let t=0;t<=age+1e-8;t+=1/60){actor.age=t;world.time=t;updateCharacterRig(rig,actor,world,1/60);}
  rig.root.updateMatrixWorld(true);return {rig,actor,world};
}
function edges(g){
  const found=new Map(),ix=g.index.array;
  for(let i=0;i<ix.length;i+=3)for(const [a,b] of [[ix[i],ix[i+1]],[ix[i+1],ix[i+2]],[ix[i+2],ix[i]]])found.set(a<b?`${a}:${b}`:`${b}:${a}`,[a,b]);
  return [...found.values()];
}
function segmentHits(a,b,mesh){const direction=b.clone().sub(a),length=direction.length();return new T.Raycaster(a,direction.normalize(),1e-7,length-1e-7).intersectObject(mesh,false);}

test('real moving necks cover the original-head positive rays and do not intersect the sewn collars',t=>{
  const resources=createCharacterResources(),controlMaterial=new T.MeshBasicMaterial({side:T.FrontSide}),report=[];
  for(const id of ['player','sentinel','retainer','warden'])for(const [state,age] of states){
    const {rig}=pose(id,state,age,resources),control=new T.Mesh(nativeGeometry(nativeFigure(id).head),controlMaterial);
    control.matrixAutoUpdate=false;control.matrix.copy(rig.neck.matrixWorld);control.updateMatrixWorld(true);let gaps=0,positive=0,crossings=0;
    // Exact independent c824 reproduction: 64 directions, 51 heights, 0.2 m.
    for(let i=0;i<64;i++)for(let j=0;j<51;j++){
      const a=i/64*Math.PI*2,y=-.03+j*.001,axis=new T.Vector3(Math.sin(a),0,Math.cos(a));
      const origin=rig.chest.localToWorld(axis.multiplyScalar(.2).add(new T.Vector3(0,y+.315,.01)));
      const target=rig.chest.localToWorld(new T.Vector3(0,y+.315,.01)),ray=new T.Raycaster(origin,target.sub(origin).normalize(),0,.2);
      const missing=ray.intersectObject(rig.root,true).length===0;
      // A candidate hit already disproves an opening. As in the independent
      // reproduction, evaluate the control for every candidate miss; also
      // obtain a positive control even when the candidate is fully covered.
      const original=(missing||positive===0)&&ray.intersectObject(control,false).length>0;if(original)positive++;
      if(original&&missing)gaps++;
    }
    assert.ok(positive>0,'the control must actually see the uncut native head');
    assert.equal(gaps,0,`${id}/${state}: a real neck opening remains`);
    const skin=new T.Mesh(rig.headSkin.geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));skin.matrixAutoUpdate=false;skin.matrix.copy(rig.headSkin.matrixWorld);skin.updateMatrixWorld(true);
    for(const options of [{from:.10},{to:.12,offset:-.0005}]){
      const collar=nativeCollar(nativeFigure(id).head,options),point=i=>rig.chest.localToWorld(new T.Vector3().fromBufferAttribute(collar.attributes.position,i).add(new T.Vector3(0,.315,0)));
      for(const [a,b] of edges(collar))crossings+=segmentHits(point(a),point(b),skin).length;
      collar.dispose();
    }
    assert.equal(crossings,0,`${id}/${state}: the cloth surface cuts through actual skin`);
    report.push({id,state,age,rays:3264,positive,gaps,crossings});control.geometry.dispose();skin.material.dispose();
  }
  controlMaterial.dispose();t.diagnostic(JSON.stringify(report));
});

test('animated neck positions, smooth normals, contact cache and bounds agree and pause/retry preserve the correct shape',()=>{
  const f=pose('player','broken',.3),g=f.rig.headSkin.geometry,s=g.userData.anchoredHead,p=g.attributes.position,n=g.attributes.normal;
  assert.ok(s.moving.length>0&&s.moving.length<s.groups.length,'only the neck region needs deformation');
  for(const group of s.groups)for(const i of group.vertices){
    const point=new T.Vector3().fromBufferAttribute(p,i);assert.ok(g.boundingBox.containsPoint(point));
    assert.ok(point.distanceTo(g.boundingSphere.center)<=g.boundingSphere.radius+1e-7);
    for(let k=0;k<3;k++)assert.equal(p.array[i*3+k],g.userData.contactPositions[group.id*3+k]);
    assert.ok(Math.abs(new T.Vector3().fromBufferAttribute(n,i).length()-1)<1e-5);
  }
  for(const i of s.movingTriangles){
    const a=new T.Vector3().fromBufferAttribute(p,i),b=new T.Vector3().fromBufferAttribute(p,i+1),c=new T.Vector3().fromBufferAttribute(p,i+2);
    const face=b.sub(a).cross(c.sub(a)),normal=new T.Vector3().fromBufferAttribute(n,i).add(new T.Vector3().fromBufferAttribute(n,i+1)).add(new T.Vector3().fromBufferAttribute(n,i+2));
    assert.ok(face.dot(normal)>=0,'the deformed neck must not turn its surface inside out');
  }
  const before=[p.array.slice(),n.array.slice(),g.userData.contactPositions.slice()];
  updateCharacterRig(f.rig,f.actor,f.world,3,{animate:false});
  [p.array,n.array,g.userData.contactPositions].forEach((array,i)=>assert.deepEqual(array,before[i]));
  const fresh=pose('player','idle',0),actor={...fresh.actor};updateCharacterRig(f.rig,actor,fresh.world,1/60);
  assert.deepEqual(p.array,fresh.rig.headSkin.geometry.attributes.position.array);
  assert.deepEqual(n.array,fresh.rig.headSkin.geometry.attributes.normal.array);
});

test('every finite edge of the fitted warden guard clears the actual head near both ears',()=>{
  const data=nativeFigure('warden'),guard=nativeGeometry(data.mask),head=new T.Mesh(nativeGeometry(data.head),new T.MeshBasicMaterial({side:T.DoubleSide}));head.updateMatrixWorld(true);
  const point=i=>new T.Vector3().fromBufferAttribute(guard.attributes.position,i);let count=0;
  for(const [a,b] of edges(guard)){count++;assert.equal(segmentHits(point(a),point(b),head).length,0,`guard edge ${a}/${b} crosses a real head surface`);}
  assert.ok(count>6000,'the check includes the complete formed shell, not just its sampled vertices');guard.dispose();head.geometry.dispose();head.material.dispose();
});
