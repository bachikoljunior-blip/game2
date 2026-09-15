import {readFileSync} from 'node:fs';
import {createCharacterResources} from './character-rig.js';

// Actual scene creation, with ONLY browser painting/WebGL submission stubbed.
// This cannot produce evidence about rendered appearance or device timing.
export async function headlessPresentation(override){
  const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  const three=moduleUrl(`export * from ${JSON.stringify(import.meta.resolve('three'))};
    export class WebGLRenderer{constructor(){this.shadowMap={};}setPixelRatio(){}setSize(){}render(){}}`);
  const file=new URL('./presentation.js',import.meta.url);
  const source=(override??readFileSync(file,'utf8')).replace(/from '([^']+)'/g,(_,path)=>
    `from ${JSON.stringify(path==='three'?three:path.startsWith('.')?new URL(path,file).href:import.meta.resolve(path))}`);
  const {createPresentation}=await import(moduleUrl(source));
  // Construct real geometry-only Node resources before the canvas-only fake
  // document exists. The fake canvas cannot decode images; it must neither
  // trigger browser image loading nor report successful texture readiness.
  const characterResources=createCharacterResources();
  const keys=['document','innerWidth','innerHeight','devicePixelRatio'],before=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k));
  const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(object,key)=>object[key]??(()=>{})});
  Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})},innerWidth:960,innerHeight:720,devicePixelRatio:1});
  try{const view=createPresentation({},{characterResources});await view.assetsReady;return view;}finally{keys.forEach((k,i)=>before[i]?Object.defineProperty(globalThis,k,before[i]):delete globalThis[k]);}
}
