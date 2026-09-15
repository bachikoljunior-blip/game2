import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {headlessPresentation} from './vegetation-test-support.mjs';
import {VEGETATION_MODELS} from './vegetation-physics.js';

test('supported maple laminae present distributed surface normals in both fixed whole-tree views',async t=>{
 const view=await headlessPresentation(),specimen=view.scene.userData.vegetationSpecimens.maple;
 for(let i=0;i<=480;i++)view.vegetation.update(i/60);
 const rootOf=id=>{while(view.vegetation.beams[id].parent!==null)id=view.vegetation.beams[id].parent;return id;},rows=[];
 for(const cameraX of [-14.212534234788277,-29.787465765211723]){
  const camera=new T.Vector3(cameraX,6.03363304163433,11),target=new T.Vector3(-22,4.292204452121128,11);view.renderInspection(camera,target);
  const leaves=[];
  view.scene.traverse(mesh=>{const g=mesh.geometry;if(g?.userData.vegetationLod?.kind!=='maple')return;const ids=g.userData.vegetationLod.allIndices;
   for(let base=0;base<g.attributes.position.count;base+=24){const id=g.attributes.windSupport.getW(base);if(rootOf(id)!==specimen.beam)continue;
    const beam=view.vegetation.beams[id],spec=VEGETATION_MODELS[beam.kind],ratio=beam.length/spec.length;assert.equal(beam.mass,spec.mass*ratio);assert.equal(beam.area,spec.area*ratio);
    const points=Array.from({length:24},(_,n)=>new T.Vector3(...view.vegetation.deformVertex(g,base+n,8))),center=points.reduce((v,p)=>v.add(p),new T.Vector3()).divideScalar(24),direction=center.clone().sub(camera).normalize();let area=0,weightedFace=0;
    for(let i=base/24*69;i<base/24*69+69;i+=3){const [a,b,c]=Array.from(ids.slice(i,i+3),n=>points[n-base]),cross=b.clone().sub(a).cross(c.clone().sub(a)),weight=cross.length()/2;area+=weight;weightedFace+=Math.abs(cross.normalize().dot(direction))*weight;}
    leaves.push(weightedFace/area);
   }
  });
  leaves.sort((a,b)=>a-b);assert.equal(leaves.length,972);
  assert.ok(leaves[486]>.3,'the majority of the crown must not return to the former nearly edge-on normal band');
  assert.ok(leaves.filter(f=>f<.1).length<leaves.length*.18,'retain differently inclined surfaces rather than a crown of thin lines');
  rows.push({camera:camera.toArray(),leaves:leaves.length,medianFace:leaves[486],belowPointOne:leaves.filter(f=>f<.1).length});
 }
 t.diagnostic(JSON.stringify({scope:'Actual CPU-deformed leaf triangle normals only; shading, naturalness and native visibility unmeasured',rows}));
});
