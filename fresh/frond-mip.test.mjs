import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WebGLTextures} from 'three/src/renderers/webgl/WebGLTextures.js';
import {buildFrondMipmaps} from './bamboo-frond.js';
import {foliageAlphaAt} from './foliage-lod.js';
import {headlessPresentation} from './vegetation-test-support.mjs';

const luminance=(data,i)=>.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
function measure(level,tile){
 const {data,width:size}=level,side=size/2,x0=tile%2*side,y0=Math.floor(tile/2)*side;let sum=0,count=0,weighted=0,weight=0;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=((y0+y)*size+x0+x)*4;if(data[i+3]>=102){sum+=luminance(data,i);count++;}weighted+=luminance(data,i)*data[i+3];weight+=data[i+3];}
 // Independent sampling calls the CPU bilinear helper at a finer, differently
 // phased lattice than the mip builder's own coverage search.
 let covered=0;const samples=127,texture={image:{width:size,height:size,data}};
 for(let y=0;y<samples;y++)for(let x=0;x<samples;x++)covered+=Number(foliageAlphaAt(texture,new T.Vector2((x0+(x+.5)/samples*side)/size,(y0+(y+.5)/samples*side)/size))>=.4);
 return {pixelCoverage:count/(side*side),filteredCoverage:covered/(samples*samples),coveredLuminance:sum/count,alphaWeightedLuminance:weighted/weight};
}

function filteredRgba(level,u,v){
 const size=level.width,x=Math.max(0,Math.min(size-1,u*size-.5)),y=Math.max(0,Math.min(size-1,v*size-.5)),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,p=(a,b,c)=>level.data[(Math.min(size-1,b)*size+Math.min(size-1,a))*4+c];
 return [0,1,2,3].map(c=>(p(ix,iy,c)*(1-fx)+p(ix+1,iy,c)*fx)*(1-fy)+(p(ix,iy+1,c)*(1-fx)+p(ix+1,iy+1,c)*fx)*fy);
}
function measureBlend(a,b,fraction,tile){
 let count=0,sum=0;const samples=96,x0=tile%2,y0=Math.floor(tile/2);
 for(let y=0;y<samples;y++)for(let x=0;x<samples;x++){
  const u=(x0+(x+.5)/samples)*.5,v=(y0+(y+.5)/samples)*.5,first=filteredRgba(a,u,v),second=filteredRgba(b,u,v),rgba=first.map((value,c)=>value*(1-fraction)+second[c]*fraction);
  if(rgba[3]>=102){count++;sum+=luminance(rgba,0);}
 }
 return {coverage:count/(samples*samples),coveredLuminance:sum/count};
}

function checkThreeUpload(texture){
 const allocations=[],uploads=[],calls=[],enums=new Map();let enumId=100;
 const gl=new Proxy({createTexture:()=>({}),pixelStorei(){},texParameteri(){},texParameterf(){}},{get:(target,key)=>{
  if(key in target)return target[key];if(/^[A-Z0-9_]+$/.test(key)){if(!enums.has(key))enums.set(key,enumId++);return enums.get(key);}return (...args)=>calls.push({method:key,args});
 }});
 const state=new Proxy({texStorage2D:(...args)=>allocations.push(args),texSubImage2D:(...args)=>uploads.push(args)},{get:(target,key)=>target[key]??(()=>{})}),cache=new WeakMap();
 const properties={get:key=>{if(!cache.has(key))cache.set(key,{});return cache.get(key);},remove:key=>cache.delete(key)},extensions={has:()=>false,get:()=>null},capabilities={maxTextureSize:4096,maxTextures:16,getMaxAnisotropy:()=>1},utils={convert:value=>value===T.RGBAFormat?gl.RGBA:value===T.UnsignedByteType?gl.UNSIGNED_BYTE:value};
 const textures=new WebGLTextures(gl,extensions,state,properties,capabilities,utils,{memory:{textures:0},render:{frame:0}});textures.setTexture2D(texture,0);
 assert.deepEqual(allocations,[[gl.TEXTURE_2D,7,gl.RGBA8,512,512]],'actual Three uploader reserves exactly seven immutable levels');
 assert.deepEqual(uploads.map(args=>[args[1],args[4],args[5]]),[[0,512,512],[1,256,256],[2,128,128],[3,64,64],[4,32,32],[5,16,16],[6,8,8]]);
 for(const [i,args] of uploads.entries())assert.equal(args[8],texture.mipmaps[i].data,'the actual mip bytes reach the uploader unchanged');
 assert.ok(!calls.some(call=>call.method==='generateMipmap'||call.method==='texImage2D'),'no full-chain regeneration or mutable incomplete texture path');
 return {scope:'Actual Three upload code with WebGL calls stubbed; driver completeness/rendering is not measured',immutableLevels:allocations[0][1],uploadedSizes:uploads.map(args=>args[4])};
}

test('transparent filler never alters painted base colours or enters weighted mip colour',()=>{
 const size=32,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const tile=Math.floor(x/16)+2*Math.floor(y/16),lx=x%16,ly=y%16,i=(y*size+x)*4,painted=tile===3||(lx>=5&&lx<=10&&ly>=4&&ly<=11);
  data.set(painted?[20+tile*8,40+tile*7,12+tile*4,((lx+ly)%3===0&&tile<3)?128:255]:[255,0,255,0],i);
 }
 const before=data.slice(),mips=buildFrondMipmaps(data,size);
 for(let i=0;i<data.length;i+=4){assert.equal(data[i+3],before[i+3]);if(before[i+3])assert.deepEqual(data.slice(i,i+4),before.slice(i,i+4));}
 for(const level of mips.levels)for(let tile=0;tile<3;tile++){
  const side=level.width/2,x0=tile%2*side,y0=Math.floor(tile/2)*side;
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=((y0+y)*level.width+x0+x)*4;assert.deepEqual(Array.from(level.data.slice(i,i+3)),[20+tile*8,40+tile*7,12+tile*4],'every frond texel receives its own painted colour, with no magenta or neighbouring tile mixture');}
 }
 assert.equal(mips.levels.at(-1).width,8);
});

test('actual frond mip colours and bilinear coverage stay near base values without an empty terminal mip',async t=>{
 const view=await headlessPresentation();let mesh;view.scene.traverse(m=>{if(!mesh&&m.geometry?.userData.vegetationLod?.kind==='bamboo')mesh=m;});
 const texture=mesh.material.map,levels=texture.mipmaps,base=Array.from({length:3},(_,tile)=>measure(levels[0],tile)),rows=[];
 assert.equal(texture,mesh.customDepthMaterial.map);assert.equal(texture.generateMipmaps,false);assert.equal(texture.minFilter,T.LinearMipmapLinearFilter);assert.deepEqual(levels.map(l=>l.width),[512,256,128,64,32,16,8]);
 for(const level of levels){
  const row={size:level.width,fronds:[]};
  for(let tile=0;tile<3;tile++){
   const m=measure(level,tile);row.fronds.push(m);assert.ok(m.pixelCoverage>0,'every allocated mip retains actual cutout texels');
   assert.ok(Math.abs(m.filteredCoverage-base[tile].filteredCoverage)<.035,'independent bilinear coverage retains the frond area, not just thresholded texel centres');
   assert.ok(Math.abs(m.coveredLuminance/base[tile].coveredLuminance-1)<.08,'covered colours do not brighten by the old 23–40%');
  }
  rows.push(row);
 }
 // Ground truth colour integration from BASE texels, independent of the
 // recursive mip routine or its coverage scaling. Alpha-zero filler contributes
 // no colour; roundoff from byte-valued intermediate levels is bounded.
 let maxColourError=0;
 for(const level of levels.slice(1)){
  const scale=512/level.width;
  for(let y=0;y<level.width;y++)for(let x=0;x<level.width;x++){
   let weight=0;const sums=[0,0,0];
   for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y*scale+dy)*512)+x*scale+dx)*4,a=levels[0].data[i+3];weight+=a;for(let c=0;c<3;c++)sums[c]+=levels[0].data[i+c]*a;}
   if(!weight||level.data[(y*level.width+x)*4+3]<102)continue;for(let c=0;c<3;c++)maxColourError=Math.max(maxColourError,Math.abs(level.data[(y*level.width+x)*4+c]-sums[c]/weight));
  }
 }
 assert.ok(maxColourError<.51,'raw-coverage colour integration remains independent of scaled output mask');
 const blends=[];
 for(let i=0;i<levels.length-1;i++)for(const fraction of [.25,.5,.75]){
  const fronds=[];for(let tile=0;tile<3;tile++){const result=measureBlend(levels[i],levels[i+1],fraction,tile);fronds.push(result);assert.ok(Math.abs(result.coveredLuminance/base[tile].coveredLuminance-1)<.08);assert.ok(Math.abs(result.coverage-base[tile].filteredCoverage)<.035,'trilinear transitions keep covered area instead of losing the crown between levels');}
  blends.push({from:levels[i].width,to:levels[i+1].width,fraction,fronds});
 }
 const upload=checkThreeUpload(texture);
 t.diagnostic(JSON.stringify({upload,scope:'CPU atlas/mip arithmetic and independent bilinear samples; actual WebGL upload/render not measured',rows,blends,maxColourError}));
});
