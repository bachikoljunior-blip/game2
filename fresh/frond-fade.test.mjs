import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {headlessPresentation} from './vegetation-test-support.mjs';
import {foliageAlphaAt,foliageHitIsOpaque} from './foliage-lod.js';

// Execute the alpha-related scalar operations extracted from actual patched
// Three physical/depth shader sources. This is source/numerical verification,
// not GLSL compilation, rasterization, mip selection or a GPU screenshot.
function alphaProgram(material,library){
 const shader={uniforms:{},vertexShader:library.vertexShader,fragmentShader:library.fragmentShader};material.onBeforeCompile(shader);
 assert.match(shader.fragmentShader,/float foliageMaskAlpha = 1.0/);assert.match(shader.fragmentShader,/diffuseColor.a = foliageFadeAlpha/);
 let source=shader.fragmentShader.slice(shader.fragmentShader.indexOf('float foliageFadeAlpha'),shader.fragmentShader.indexOf('// foliage-mask-end'));
 const include=s=>s.replace(/#include <([^>]+)>/g,(_,name)=>include(T.ShaderChunk[name]));source=include(source);
 const defines=new Set(['USE_MAP','USE_ALPHATEST']),states=[true],lines=[];
 for(const line of source.split('\n')){
  const normalized=line.trim().replace(/^#if defined\(\s*(\w*)\s*\)/,'#ifdef $1').replace(/^#elif defined\(\s*(\w*)\s*\)/,'#elifdef $1'),match=normalized.match(/^#(ifdef|ifndef|elifdef|else|endif)\s*(\w*)/);
  if(match){const [,op,key]=match;if(op==='ifdef'||op==='ifndef')states.push(states.at(-1)&&(op==='ifdef'?defines.has(key):!defines.has(key)));else if(op==='elifdef')states[states.length-1]=states.at(-2)&&!states.at(-1)&&defines.has(key);else if(op==='else')states[states.length-1]=states.at(-2)&&!states.at(-1);else states.pop();continue;}
  if(states.every(Boolean))lines.push(line);
 }
 source=lines.join('\n').replace(/\b(float|vec4)\b/g,'let').replace(/texture2D\( map, vMapUv \)/g,'sample').replace('diffuseColor *= sampledDiffuseColor;','diffuseColor.a *= sampledDiffuseColor.a;').replace(/\bdiscard;/g,'return {discarded:true,alpha:diffuseColor.a};');
 assert.doesNotMatch(source,/#/,'the finite shader subset has no unhandled preprocessor directives');
 return {shader,run:new Function('opacity','sample','foliageCutout','alphaTest',`let diffuseColor={a:opacity};${source}\nreturn {discarded:false,alpha:diffuseColor.a};`)};
}

test('frond coverage is independent of foreground opacity in actual Three visible/depth chunks and CPU masks',async t=>{
 const view=await headlessPresentation();let mesh;view.scene.traverse(m=>{if(!mesh&&m.geometry?.userData.vegetationLod?.kind==='bamboo')mesh=m;});
 const visible=alphaProgram(mesh.material,T.ShaderLib.physical),depth=alphaProgram(mesh.customDepthMaterial,T.ShaderLib.depth),{map,alphaTest}=mesh.userData.foliageAlpha;
 assert.equal(map,mesh.customDepthMaterial.map);assert.equal(alphaTest,.4);assert.equal(mesh.material.alphaMap,null);assert.equal(mesh.customDepthMaterial.alphaMap,null);
 assert.equal((visible.shader.fragmentShader.match(/sampledDiffuseColor = texture2D/g)||[]).length,0,'map sampling remains in the one existing Three include');
 const samples=[];for(let y=0;y<256;y+=3)for(let x=0;x<256;x+=3)samples.push(new T.Vector2((x+.5)/512,(y+.5)/512));
 // Also include exact alpha boundaries, in addition to the actual image texels.
 for(const opacity of [1,.5,.4,.2,.08]){
  mesh.material.opacity=opacity;let passed=0,holes=0,oldProductPassed=0;
  for(const uv of samples){
   const mask=foliageAlphaAt(map,uv),expected=mask>=alphaTest,colour=visible.run(opacity,{a:mask},1,alphaTest),shadow=depth.run(1,{a:mask},1,alphaTest),cpu=foliageHitIsOpaque({object:{geometry:new T.BufferGeometry(),userData:{foliageAlpha:{map,alphaTest}}},uv});
   assert.equal(!colour.discarded,expected);assert.equal(!shadow.discarded,expected);assert.equal(cpu,expected);
   if(expected){assert.equal(colour.alpha,opacity,'accepted coverage keeps the requested foreground fade');assert.equal(shadow.alpha,1);passed++;}else holes++;
   oldProductPassed+=Number(opacity*mask>=alphaTest);
  }
  for(const mask of [0,.399999,.4,.400001,.5,1]){
   const result=visible.run(opacity,{a:mask},1,alphaTest);assert.equal(result.discarded,mask<.4);
   const wood=visible.run(opacity,{a:mask},0,alphaTest);assert.equal(wood.discarded,false);assert.equal(wood.alpha,opacity,'opaque wood and detailed leaves retain fade even in mixed atlas mips');
  }
  assert.ok(passed>0&&holes>0);if(opacity<.4)assert.equal(oldProductPassed,0,'the fixture reproduces complete disappearance in the rejected product-alpha implementation');
  t.diagnostic(JSON.stringify({opacity,sampledTexels:samples.length,visiblePassed:passed,depthPassed:passed,cpuPassed:passed,oldProductPassed,holes}));
 }
});
