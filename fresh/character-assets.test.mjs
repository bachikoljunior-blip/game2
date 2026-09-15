import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createNativeCharacterResources,nativeGeometry,nativeFigure,nativeHand} from './character-assets.js';
import {createCharacterRig} from './character-rig.js';
import {updateCharacterRig} from './character-motion.js';

test('native skin and fitted eyes face the viewer through both actual eye openings',()=>{
  const material=new T.MeshBasicMaterial({side:T.FrontSide});
  for(const id of ['player','sentinel','retainer','warden']){
    const data=nativeFigure(id),head=new T.Mesh(nativeGeometry(data.head),material),eyes=new T.Mesh(nativeGeometry(data.eyes),material);
    head.updateMatrixWorld();eyes.updateMatrixWorld();
    for(const side of [-1,1]){
      const ray=new T.Raycaster(new T.Vector3(side*.031,.167,-.8),new T.Vector3(0,0,1));
      const hits=ray.intersectObjects([head,eyes]);
      assert.ok(hits.length,`${id}: missing eye`);assert.equal(hits[0].object,eyes,`${id}: skin obstructs the eyeball opening`);
      assert.ok(hits[0].face.normal.z<0,`${id}: eye front is culled`);
    }
    const nose=new T.Raycaster(new T.Vector3(0,.13,-.8),new T.Vector3(0,0,1)).intersectObject(head);
    assert.ok(nose.length&&nose[0].face.normal.z<0,`${id}: native nose has no outward surface`);
    for(const part of ['head','eyes','hair','brows']){
      const g=data[part];assert.ok(g.position.every(Number.isFinite)&&g.normal.every(Number.isFinite));
      assert.equal(g.uv.length/2,g.position.length/3);
      for(const i of g.index)assert.ok(i>=0&&i<g.position.length/3,'UV-split indices address real vertices');
    }
    assert.ok(data.head.sourceVertex.every(i=>i<13380),'body extraction must exclude joint and fitting helper boxes');
  }
});

test('posed native fingers keep connected bone lengths and a solid-handle clearance',()=>{
  for(const side of [-1,1]){
    const hand=nativeHand(side),suffix=side<0?'l':'r',v=hand.geometry.position;
    for(const finger of ['thumb','index','middle','ring','pinky'])for(let segment=1;segment<=3;segment++){
      const bone=hand.landmarks[`${finger}_0${segment}_${suffix}`],h=new T.Vector3(...bone.head),t=new T.Vector3(...bone.tail);
      assert.ok(Math.abs(h.distanceTo(t)-bone.restLength)<1e-8,'bending cannot stretch a phalanx');
      if(segment<3)assert.ok(t.distanceTo(new T.Vector3(...hand.landmarks[`${finger}_0${segment+1}_${suffix}`].head))<1e-8,'adjacent finger joints stay joined');
    }
    for(let i=0;i<v.length;i+=3){
      assert.ok(hand.geometry.sourceVertex[i/3]<13380,'rendered hands contain only the continuous body mesh');
      if(Math.abs(v[i+1])<.065){
        const radial=Math.hypot(v[i]-hand.gripOffset[0],v[i+2]-hand.gripOffset[2]);
        assert.ok(radial>=.03339,`skin vertex penetrates the solid handle: ${radial}`);
      }
    }
  }
});

test('actual native grip centres stay on the unchanged sword handle through turns and actions',()=>{
  const rig=createCharacterRig('player');let heldSamples=0;
  for(const yaw of [0,.7,Math.PI,4.1])for(const state of ['idle','guard','windup','attack','stagger','broken','dodge']){
    const actor={id:'player',x:2,z:3,yaw,hp:100,state,age:0},world={time:0,mode:'playing',events:[]};
    for(let frame=0;frame<48;frame++){
      actor.age=frame/60;world.time=frame/60;const motion=updateCharacterRig(rig,actor,world,1/60);
      for(let i=0;i<2;i++)if(motion.hands[i].gripWeight>.999999){
        const limb=rig.limbs[i],actual=limb.wrist.localToWorld(limb.gripOffset.clone());
        const intended=rig.sword.localToWorld(new T.Vector3(0,i===1?0:-.135,0));
        assert.ok(actual.distanceTo(intended)<.02,`${state}: native palm leaves its handle target`);heldSamples++;
      }
    }
  }
  assert.ok(heldSamples>1000);
});

test('free wrists are unaffected by the native grip offset and old rigs use zero offset',()=>{
  const native=createCharacterRig('player'),legacy=createCharacterRig('player');
  for(const limb of legacy.limbs)delete limb.gripOffset;
  const actor={id:'player',x:0,z:0,yaw:.5,hp:100,state:'idle',age:0},world={time:0,mode:'playing',events:[]};
  for(let n=0;n<80;n++){
    actor.age+=1/60;world.time+=1/60;actor.z-=.04;
    updateCharacterRig(native,actor,world,1/60);updateCharacterRig(legacy,actor,world,1/60);
    const a=native.limbs[0].wrist.getWorldPosition(new T.Vector3()),b=legacy.limbs[0].wrist.getWorldPosition(new T.Vector3());
    assert.ok(a.distanceTo(b)<1e-9,'free left hand must not receive a hidden handle correction');
    const oldGrip=legacy.limbs[1].wrist.getWorldPosition(new T.Vector3()),handle=legacy.sword.localToWorld(new T.Vector3());
    assert.ok(oldGrip.distanceTo(handle)<.02,'zero-offset fallback preserves the original grip target');
  }
});

test('texture readiness waits for every decode and explicitly rejects a failed asset',async()=>{
  const pending=[];
  const resources=createNativeCharacterResources({textureLoader:{loadAsync:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))}});
  assert.equal(resources.state,'loading');assert.equal(pending.length,4);
  for(const p of pending.slice(0,3))p.resolve(new T.Texture());await Promise.resolve();
  assert.equal(resources.state,'loading','a partially textured actor may not signal readiness');
  pending[3].resolve(new T.Texture());await resources.ready;
  assert.equal(resources.state,'ready');for(const key of ['skin','eyes','hair','brows'])assert.equal(resources[key].map.colorSpace,T.SRGBColorSpace);
  const failed=createNativeCharacterResources({textureLoader:{loadAsync:async()=>{throw new Error('404 fixture');}}});
  await assert.rejects(failed.ready,/could not be loaded/);assert.equal(failed.state,'failed');assert.match(failed.error,/404 fixture/);
});
