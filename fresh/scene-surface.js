import * as T from 'three';
import {distanceFromRoute} from './route-layout.js';

// Original soil and fallen-leaf artwork, generated synchronously. No loader,
// copied scan, changed terrain or additional runtime request is involved.
const fract=x=>x-Math.floor(x);
const hash=(x,z)=>fract(Math.sin(x*127.1+z*311.7)*43758.5453);
const smooth=t=>t*t*(3-2*t);
function field(x,z){
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(fract(x)),v=smooth(fract(z));
  return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),T.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}
const dry=new T.Color('#aaa08a'),damp=new T.Color('#655f4b'),humus=new T.Color('#666b50'),clay=new T.Color('#a18a64');
export function groundSurfaceAt(x,z,color=new T.Color()){
  const broad=field(x*.13+13,z*.13-7),broken=field(x*.37-4,z*.37+9),distance=distanceFromRoute(x,z);
  const undisturbed=T.MathUtils.smoothstep(distance,.7,3.8);
  const drainage=T.MathUtils.clamp((.69-broad)*1.45+broken*.17,0,1);
  color.copy(dry).lerp(damp,drainage).lerp(humus,undisturbed*(.12+broad*.30));
  color.lerp(clay,(1-undisturbed)*(.20+broken*.16));
  // Broad drift islands remain near path shoulders. The individual dry leaves
  // come from the tile below; this channel controls accumulation, not elevation.
  const deposit=undisturbed*T.MathUtils.smoothstep(broad*.7+broken*.3,.24,.69);
  return {color,deposit};
}
export function createLitterTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  const palette=[[154,121,65],[125,101,62],[174,145,85],[109,96,65]];
  // A curled lanceolate leaf has a narrow pointed end, asymmetric center vein
  // and a shaded curled edge. Different lengths/orientations overlap as debris.
  for(let leaf=0;leaf<760;leaf++){
    const cx=hash(leaf,1)*size,cy=hash(leaf,2)*size,angle=hash(leaf,3)*Math.PI*2;
    const length=9+hash(leaf,4)*15,width=1.2+hash(leaf,5)*2.7,cs=Math.cos(angle),sn=Math.sin(angle);
    const base=palette[Math.floor(hash(leaf,6)*palette.length)],curl=(hash(leaf,7)-.5)*.8;
    const radius=Math.ceil(length/2+width+2);
    for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
      const u=(x*cs+y*sn)/(length/2);if(Math.abs(u)>=1)continue;
      const vein=curl*(1-u*u),v=(-x*sn+y*cs)/width-vein;
      const half=Math.pow(1-Math.abs(u),.62);if(Math.abs(v)>half)continue;
      const px=((Math.floor(cx+x)%size)+size)%size,py=((Math.floor(cy+y)%size)+size)%size,i=(py*size+px)*4;
      const shade=Math.abs(v)<.1?1.13:v>half*.66?.65:.88+v*.11;
      data[i]=Math.round(base[0]*shade);data[i+1]=Math.round(base[1]*shade);data[i+2]=Math.round(base[2]*shade);data[i+3]=255;
    }
  }
  const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.name='original-fallen-bamboo-leaves';
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
export function installGroundLitter(material,texture){
  material.onBeforeCompile=shader=>{
    shader.uniforms.sceneLitter={value:texture};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float soilDeposit; varying float vSoilDeposit;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvSoilDeposit = soilDeposit;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D sceneLitter; varying float vSoilDeposit;')
      .replace('#include <map_fragment>','#include <map_fragment>\nvec4 litter = texture2D(sceneLitter, vMapUv);\ndiffuseColor.rgb = mix(diffuseColor.rgb, litter.rgb, litter.a * clamp(vSoilDeposit, 0.0, 1.0));');
  };
  material.customProgramCacheKey=()=> 'original-ground-litter-v1';
}
