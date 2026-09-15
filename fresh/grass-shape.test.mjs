import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createGrassClumpGeometry} from './grass-shape.js';

const vertex=(positions,index)=>new Vector3().fromBufferAttribute(positions,index);
const rowCenter=(positions,index)=>vertex(positions,index).add(vertex(positions,index+1)).multiplyScalar(.5);

test('three two-segment leaves retain the 36000 triangle budget and standard wind-compatible attributes',()=>{
  const geometry=createGrassClumpGeometry(),positions=geometry.getAttribute('position');
  assert.equal(positions.count,18);assert.equal(geometry.index.count/3,12);
  assert.equal(geometry.index.count/3*3000,36000);
  assert.deepEqual(Object.keys(geometry.attributes).sort(),['normal','position','uv']);
  for(const attribute of Object.values(geometry.attributes)){
    assert.equal(attribute.count,positions.count);assert.ok(attribute.array.every(Number.isFinite));
  }
  for(let i=0;i<geometry.index.count;i+=3){
    const a=vertex(positions,geometry.index.getX(i)),b=vertex(positions,geometry.index.getX(i+1)),c=vertex(positions,geometry.index.getX(i+2));
    assert.ok(b.sub(a).cross(c.sub(a)).length()>.00001,'the narrow, drooping tip still forms real triangles');
  }
  assert.equal(geometry.boundingBox.min.y,0);assert.ok(geometry.boundingBox.max.y<=.82);
  for(let i=0;i<positions.count;i++)assert.ok(Math.hypot(positions.getX(i),positions.getZ(i))<.195,
    'rest geometry stays within the prior clump footprint');
  geometry.dispose();
});

test('all three roots remain at the instance origin while narrow leaves have distinct heights and curved drooping tips',()=>{
  const geometry=createGrassClumpGeometry(),positions=geometry.getAttribute('position'),heights=[];let drooping=0;
  for(let leaf=0;leaf<3;leaf++){
    const start=leaf*6,tip=rowCenter(positions,start),middle=rowCenter(positions,start+2),root=rowCenter(positions,start+4);
    assert.equal(root.length(),0);
    assert.equal(positions.getY(start+4),0);assert.equal(positions.getY(start+5),0);
    // The existing wind uses height squared, so both root-edge vertices remain fixed.
    for(let row=0;row<3;row++){
      const width=vertex(positions,start+row*2).distanceTo(vertex(positions,start+row*2+1));
      assert.ok(width>0&&width<=.05600001);
    }
    const projection=tip.clone().multiplyScalar(middle.dot(tip)/tip.lengthSq());
    assert.ok(middle.distanceTo(projection)>.035,'the centreline does not reduce to a straight tapered board');
    heights.push(Math.max(tip.y,middle.y));if(tip.y<middle.y)drooping++;
  }
  assert.equal(drooping,2);
  assert.ok(heights[0]-heights[1]>.15&&heights[1]-heights[2]>.15,'each leaf has a different silhouette height');
  geometry.dispose();
});

test('clump vertex data is deterministic and independent of Three geometry UUID randomness',()=>{
  const previousRandom=Math.random;let a,b;
  try{Math.random=()=>.1;a=createGrassClumpGeometry();Math.random=()=>.9;b=createGrassClumpGeometry();}
  finally{Math.random=previousRandom;}
  for(const name of Object.keys(a.attributes)){
    assert.deepEqual(a.attributes[name].array,b.attributes[name].array);
    assert.notEqual(a.attributes[name].array,b.attributes[name].array);
  }
  assert.deepEqual(a.index.array,b.index.array);a.dispose();b.dispose();
});
