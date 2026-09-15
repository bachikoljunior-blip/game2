// Offline comparison against a separately extracted, fixed Git baseline.
// Usage: CHARACTER_INDEX_BASELINE=/absolute/baseline node <this file> [report.json]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const current=new URL('../../',import.meta.url),base=pathToFileURL(resolve(process.env.CHARACTER_INDEX_BASELINE)+'/');
const load=(root,path)=>import(new URL('fresh/'+path,root));
const [oldRig,newRig,motion,terrain,simulation]=await Promise.all([load(base,'character-rig.js'),load(current,'character-rig.js'),load(current,'character-motion.js'),load(current,'terrain.js'),load(current,'simulation.js')]);
const unchanged=['character-motion.js','character-assets.js','character-assets/native-data.js','character-sculpt.js','main.js',
  ...['young-asian-male','brown-eye','short-hair','eyebrows'].map(n=>'character-assets/textures/'+n+'.png')];
for(const path of unchanged)assert.deepEqual(readFileSync(new URL('fresh/'+path,current)),readFileSync(new URL('fresh/'+path,base)),path);
const source=readFileSync(new URL('fresh/character-rig.js',current),'utf8').replace("import {indexStaticCharacterGeometry} from './character-static-index.js';\n",'').replace('    indexStaticCharacterGeometry(geometry);\n','');
assert.equal(source,readFileSync(new URL('fresh/character-rig.js',base),'utf8'));
const resources=[oldRig.createCharacterResources(),newRig.createCharacterResources()],report={base:'4fa13484c88dfa3d572c189e3a8999e8f254e70e',method:'Exact expanded corner bytes against extracted baseline, every mesh/attribute; dynamic/contact/motion unchanged; no renderer',unchanged,actors:[],poses:[]};
function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function expanded(g,name){const a=g.attributes[name],stride=a.itemSize*a.array.BYTES_PER_ELEMENT,source=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),out=Buffer.alloc((g.index?.count??a.count)*stride);for(let i=0;i<out.length/stride;i++){const k=g.index?g.index.getX(i):i;out.set(source.subarray(k*stride,(k+1)*stride),i*stride);}return out;}
function meshes(rig){const out=[];rig.root.traverse(n=>{if(n.isMesh)out.push(n);});return out;}
function check(a,b){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){
  const x=a[i],y=b[i];assert.equal(x.name,y.name);assert.equal(x.parent.name,y.parent.name);
  assert.equal(x.visible,y.visible);assert.equal(x.castShadow,y.castShadow);assert.equal(x.receiveShadow,y.receiveShadow);
  assert.deepEqual(x.matrixWorld.elements,y.matrixWorld.elements);assert.deepEqual(x.geometry.groups,y.geometry.groups);assert.deepEqual(x.geometry.drawRange,y.geometry.drawRange);
  assert.deepEqual(Object.keys(x.geometry.attributes),Object.keys(y.geometry.attributes));
  for(const name of Object.keys(x.geometry.attributes)){assert.deepEqual(expanded(x.geometry,name),expanded(y.geometry,name),`${i}/${name}`);for(const k of ['itemSize','normalized','gpuType','usage','name'])assert.equal(x.geometry.attributes[name][k],y.geometry.attributes[name][k]);}
  assert.deepEqual(x.geometry.userData.contactPositions,y.geometry.userData.contactPositions,'contact order and exact points');
  assert.equal(x.material.name,y.material.name);for(const k of ['side','roughness','metalness','transparent','opacity','alphaTest'])assert.equal(x.material[k],y.material[k]);
  const dynamic=x.geometry.userData.anchoredHead||x.name==='articulated-hakama-surface';if(dynamic){assert.deepEqual(x.geometry.index?.array,y.geometry.index?.array);assert.equal(x.geometry.attributes.position.count,y.geometry.attributes.position.count);assert.deepEqual(x.geometry.attributes.position.updateRanges,y.geometry.attributes.position.updateRanges);}
}}
for(const id of ['player','sentinel','retainer','warden']){
  const rigs=[oldRig.createCharacterRig(id,resources[0]),newRig.createCharacterRig(id,resources[1])],sets=rigs.map(meshes);rigs.forEach(r=>r.root.updateMatrixWorld(true));check(...sets);
  assert.deepEqual(rigs[0].metrics,rigs[1].metrics);
  const summary=sets.map(list=>({vertices:list.reduce((s,m)=>s+m.geometry.attributes.position.count,0),staticVertices:list.filter(m=>!m.geometry.userData.anchoredHead&&m.name!=='articulated-hakama-surface').reduce((s,m)=>s+m.geometry.attributes.position.count,0),attributeBytes:list.reduce((s,m)=>s+Object.values(m.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),0),indexBytes:list.reduce((s,m)=>s+(m.geometry.index?.array.byteLength??0),0)}));
  report.actors.push({id,metrics:rigs[1].metrics,before:summary[0],after:summary[1],meshes:sets[0].map((m,i)=>({parent:m.parent.name,name:m.name,material:m.material.name,triangles:(m.geometry.index?.count??m.geometry.attributes.position.count)/3,beforeVertices:m.geometry.attributes.position.count,afterVertices:sets[1][i].geometry.attributes.position.count,expandedSha256:Object.fromEntries(Object.keys(m.geometry.attributes).map(n=>[n,hash(expanded(m.geometry,n))]))}))});
  // Same real input stream at the authored slope; changing only geometry storage
  // must leave bones, cloth, contact correction and blade transforms identical.
  const worlds=[simulation.createWorld(),simulation.createWorld()],actors=worlds.map(w=>({id,x:2,z:-5,yaw:.7,hp:100,state:'idle',age:0}));
  for(const [state,frames] of [['idle',18],['attack',22],['broken',18],['dead',32],['victory',88]]){
    for(let f=0;f<frames;f++)for(let n=0;n<2;n++){const w=worlds[n],a=actors[n];a.state=state==='victory'?'idle':state;a.hp=state==='dead'?0:100;a.age=f/60;w.time+=1/60;w.mode=state==='victory'?'victory':state==='dead'?'defeat':'playing';motion.updateCharacterRig(rigs[n],a,w,1/60,{groundHeightAt:terrain.groundHeightAt});}
    check(...sets);assert.deepEqual(rigs[0].motion.metrics,rigs[1].motion.metrics);report.poses.push({id,state,frames,identical:true});
  }
}
report.passed=true;const text=JSON.stringify(report,null,2)+'\n';if(process.argv[2])writeFileSync(process.argv[2],text);else process.stdout.write(text);
console.log(JSON.stringify({passed:true,actors:report.actors.map(({id,before,after,metrics})=>({id,before,after,triangles:metrics.triangles,meshes:metrics.drawMeshes})),poses:report.poses.length}));
