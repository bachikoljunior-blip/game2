import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {indexStaticCharacterGeometry} from './character-static-index.js';

function fixture(){
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,-1,0,0],3));
  g.setAttribute('normal',new T.Float32BufferAttribute(Array.from({length:6},()=>[0,0,1]).flat(),3));
  g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,0,0,0,1,1,0],2));
  g.setAttribute('color',new T.Uint8BufferAttribute(Array(18).fill(127),3,true));
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(Array(24).fill(2),4));
  g.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from({length:6},()=>[1,0,0,0]).flat(),4));
  g.attributes.skinIndex.gpuType=T.IntType;g.attributes.uv.name='retained UV seam';
  g.addGroup(0,3,0);g.addGroup(3,3,1);g.setDrawRange(3,3);g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function expandedBytes(g,name){
  const a=g.attributes[name],bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),stride=a.itemSize*a.array.BYTES_PER_ELEMENT;
  return Buffer.concat(Array.from({length:g.index?.count??a.count},(_,i)=>Buffer.from(bytes.subarray((g.index?g.index.getX(i):i)*stride,(g.index?g.index.getX(i)+1:i+1)*stride))));
}

test('indexing retains every corner byte, winding, attribute seam, group and draw range',()=>{
  const g=fixture();g.attributes.normal.setXYZ(3,0,1,0);g.attributes.color.setXYZ(4,128,127,127);
  // Three corners still share position; normal and color must prevent welding.
  const before=g.clone(),groups=structuredClone(g.groups),range={...g.drawRange},box=g.boundingBox.clone(),sphere=g.boundingSphere.clone();
  indexStaticCharacterGeometry(g);
  for(const name of Object.keys(before.attributes)){
    assert.deepEqual(expandedBytes(g,name),expandedBytes(before,name),name);
    for(const key of ['itemSize','normalized','gpuType','name','usage'])assert.equal(g.attributes[name][key],before.attributes[name][key]);
  }
  assert.deepEqual(g.groups,groups);assert.deepEqual(g.drawRange,range);assert.deepEqual(g.boundingBox,box);assert.deepEqual(g.boundingSphere,sphere);
  const clean=fixture();indexStaticCharacterGeometry(clean);assert.equal(clean.attributes.position.count,4);assert.deepEqual(Array.from(clean.index.array),[0,1,2,0,2,3]);
  const materials=[new T.MeshBasicMaterial(),new T.MeshBasicMaterial()],ray=new T.Raycaster(new T.Vector3(-.2,.2,1),new T.Vector3(0,0,-1));
  const a=ray.intersectObject(new T.Mesh(fixture(),materials))[0],b=ray.intersectObject(new T.Mesh(clean,materials))[0];
  assert.ok(a&&b);assert.equal(a.faceIndex,b.faceIndex);assert.equal(a.face.materialIndex,b.face.materialIndex);assert.deepEqual(a.point,b.point);assert.deepEqual(a.uv,b.uv);assert.deepEqual(a.face.normal,b.face.normal);
});

test('signed zero and distinct NaN payloads remain different exact attributes',()=>{
  const g=fixture(),bits=new Uint32Array([0,0,0,0x80000000,0,0]);
  g.setAttribute('custom',new T.BufferAttribute(new Float32Array(bits.buffer),1));
  const original=expandedBytes(g,'custom');indexStaticCharacterGeometry(g);assert.deepEqual(expandedBytes(g,'custom'),original);assert.notEqual(g.index.getX(0),g.index.getX(3));
  const n=fixture(),nanBits=new Uint32Array([0x7fc00001,0,0,0x7fc00002,0,0]);n.setAttribute('custom',new T.BufferAttribute(new Float32Array(nanBits.buffer),1));
  const nanOriginal=expandedBytes(n,'custom');indexStaticCharacterGeometry(n);assert.deepEqual(expandedBytes(n,'custom'),nanOriginal);assert.notEqual(n.index.getX(0),n.index.getX(3));
});

test('mutable geometry, caches, morphs and special upload layouts are left untouched',()=>{
  for(const alter of [g=>g.userData.contactPositions=new Float32Array(3),g=>g.userData.anchoredHead={},g=>g.userData.cloth={},
    g=>g.attributes.position.setUsage(T.DynamicDrawUsage),g=>g.attributes.position.addUpdateRange(0,3),g=>g.attributes.position.needsUpdate=true,
    g=>g.morphAttributes.position=[g.attributes.position.clone()],g=>g.morphTargetsRelative=true,
    g=>g.attributes.position.onUpload(()=>{}),g=>g.setAttribute('instance',new T.InstancedBufferAttribute(new Float32Array(6),1)),
    g=>g.setAttribute('position',new T.InterleavedBufferAttribute(new T.InterleavedBuffer(new Float32Array(18),3),3,0))]){
    const g=fixture();alter(g);const p=g.attributes.position;assert.equal(indexStaticCharacterGeometry(g),g);assert.equal(g.index,null);assert.equal(g.attributes.position,p);
  }
});
