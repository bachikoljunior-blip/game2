import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCharacterRig} from './character-rig.js';
import {updateCharacterRig} from './character-motion.js';

function fixture(kind='run'){
  return {rig:createCharacterRig('player'),actor:{id:'player',x:0,z:18,yaw:0,hp:kind==='death'?0:100,state:kind==='death'?'dead':'idle',age:0},
    world:{time:0,mode:kind==='death'?'defeat':'playing',events:[]},kind};
}
function frame(f,n){
  f.actor.age=n/12;f.world.time+=1/12;
  if(f.kind==='run')f.actor.z=18-Math.min(2.5,Math.max(0,n/12-.45))*3.8;
  updateCharacterRig(f.rig,f.actor,f.world,1/12);
}

test('the running and falling knees seen in the source video are covered by real cloth surfaces',()=>{
  for(const kind of ['run','death']){
    const f=fixture(kind);
    for(let n=0;n<=18;n++){
      frame(f,n);if(!(kind==='run'?[13,14]:[9,12,13,14]).includes(n))continue;
      const camera=new T.Vector3(f.actor.x+2.5,1.45,f.actor.z-3.6);
      for(const limb of f.rig.limbs){
        const knee=limb.knee.getWorldPosition(new T.Vector3()),ray=new T.Raycaster(camera,knee.clone().sub(camera).normalize(),0,8);
        const legHit=ray.intersectObject(limb.hip,true)[0],clothHit=ray.intersectObjects(f.rig.panels.filter(p=>p.side===limb.side).map(p=>p.mesh))[0];
        assert.ok(legHit,`${kind} ${n}: probe actually sees leg geometry`);
        assert.ok(clothHit&&clothHit.distance<legHit.distance-.001,`${kind} ${n} ${limb.side}: the visible knee breaks through its cloth`);
      }
    }
  }
});

test('current cloth drawing, contact cache and bounds stay synchronized while the waist remains fixed',()=>{
  const f=fixture();let changed=0;
  for(let n=0;n<30;n++){
    frame(f,n);
    for(const panel of f.rig.panels){
      const g=panel.mesh.geometry,p=g.attributes.position,normal=g.attributes.normal,rest=g.userData.restPositions,contact=g.userData.contactPositions;
      assert.equal(contact.length,p.array.length);assert.equal(normal.count,p.count,'the folded hem has valid normals for every rendered vertex');assert.ok(g.boundingSphere.radius>0);
      for(let i=0;i<p.count;i++){
        const vertex=new T.Vector3().fromBufferAttribute(p,i);
        assert.ok(g.boundingBox.containsPoint(vertex),'frustum/contact bounds include current cloth vertices');
        for(let k=0;k<3;k++){
          assert.equal(contact[i*3+k],p.array[i*3+k],'contact must not read the undeformed rest mesh');
          assert.ok(Number.isFinite(normal.array[i*3+k]));
          if(rest[i*3+1]>=0)assert.equal(p.array[i*3+k],rest[i*3+k],'the waistband cannot detach from the pelvis');
          else if(Math.abs(p.array[i*3+k]-rest[i*3+k])>.01)changed++;
        }
      }
    }
  }
  assert.ok(changed>0,'the checked cache belongs to a genuinely deformed surface');
});

test('a paused cloth surface keeps its shape and retry returns to the new actor pose',()=>{
  const f=fixture();for(let n=0;n<18;n++)frame(f,n);
  const before=f.rig.panels.map(p=>Array.from(p.mesh.geometry.attributes.position.array));
  f.world.time+=4;updateCharacterRig(f.rig,f.actor,f.world,4,{animate:false});
  f.rig.panels.forEach((p,i)=>assert.deepEqual(Array.from(p.mesh.geometry.attributes.position.array),before[i]));
  const fresh=fixture(),actor={...fresh.actor};
  updateCharacterRig(f.rig,actor,fresh.world,1/60);updateCharacterRig(fresh.rig,fresh.actor,fresh.world,1/60);
  f.rig.panels.forEach((p,i)=>assert.deepEqual(Array.from(p.mesh.geometry.attributes.position.array),Array.from(fresh.rig.panels[i].mesh.geometry.attributes.position.array)));
});
