import * as T from 'three';
import {setLeafAttachment} from './vegetation-physics.js';

// Original boot-generated surfaces. Dimensions are metres. The blade starts
// after a narrow, visible petiole; the physics pivot is its attached end (0).
// The silhouette is real geometry, shared by colour, depth and CPU ray probes.
export const LEAF_DIMENSIONS=Object.freeze({
  maple:Object.freeze({width:.09,bladeLength:.082,petiole:.027}),
  bamboo:Object.freeze({width:.012,bladeLength:.105,petiole:.008})
});

function finish(positions,indices,uv,kind,length,seed){
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);
  g.computeVertexNormals();setLeafAttachment(g,{kind,length,seed});
  const tint=new T.Color().setHSL(kind===2?.055+.036*(.5+.5*Math.sin(seed*1.37)):.21,
    kind===2?.23:.12,.79+.05*Math.sin(seed*2.1));
  g.setAttribute('color',new T.Float32BufferAttribute(Array.from({length:positions.length/3},()=>tint.toArray()).flat(),3));
  return g;
}

export function createMapleLeafGeometry({width=.09,bladeLength=.082,petiole=.027,seed=0}={}){
  // Five unequal long lobes, deep sinuses, and a heart-shaped base. This is a
  // radial triangulation around the vein junction: every face remains within
  // the deeply cut outline, unlike a convex fan over the tip of the petiole.
  const outline=[[-.07,0],[-.25,.08],[-.36,.01],[-.29,.22],[-.51,.35],[-.28,.33],
    [-.19,.42],[-.41,.71],[-.19,.62],[-.15,.73],[0,1],
    [.12,.76],[.18,.62],[.43,.73],[.22,.43],[.29,.35],[.5,.37],
    [.31,.21],[.36,.025],[.24,.08],[.075,0]];
  const positions=[petiole+bladeLength*.26,0,bladeLength*.048],uv=[.26,.5],indices=[];
  for(let i=0;i<outline.length;i++){
    const [cross,along]=outline[i],asymmetry=1+.025*Math.sin(seed*1.7+i*.83),x=petiole+along*bladeLength;
    positions.push(x,cross*width*asymmetry,
      bladeLength*(.047*Math.sin(along*Math.PI)-.038*Math.abs(cross)*2+.019*Math.sin(seed+along*4)*cross));
    uv.push(along,cross+.5);
  }
  for(let i=1;i<outline.length;i++)indices.push(0,i,i+1);
  indices.push(0,outline.length,1);
  // A very narrow petiole reaches the actual support. The base pair is shared
  // with the blade, so both the hinge and the visible silhouette meet at it.
  const root=positions.length/3;positions.push(0,-.00055,0,0,.00055,0);
  uv.push(-petiole/bladeLength,.494,-petiole/bladeLength,.506);
  indices.push(root,1,outline.length,root,outline.length,root+1);
  return finish(positions,indices,uv,2,petiole+bladeLength,seed);
}

export function createBambooLeafGeometry({width=.012,bladeLength=.105,petiole=.008,seed=0}={}){
  const positions=[0,-.00035,0,0,.00035,0],uv=[-.08,.47,-.08,.53],indices=[];
  // Raised midrib, folded margins and an acute drooping tip. Seven faces
  // retain that real curved section for the more numerous small bamboo leaves.
  positions.push(petiole,-width*.08,0,petiole,width*.08,0);
  uv.push(0,.42,0,.58);
  for(const side of [-1,0,1]){
    positions.push(petiole+bladeLength*.39,side*width*.5,bladeLength*(side===0?.025:-.003));uv.push(.39,.5+side*.5);
  }
  positions.push(petiole+bladeLength,0,-bladeLength*.022);uv.push(1,.5);
  indices.push(0,2,3,0,3,1,2,4,5,2,5,3,3,5,6,4,7,5,5,7,6);
  return finish(positions,indices,uv,1,petiole+bladeLength,seed);
}

function segmentDistance(x,y,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,t=T.MathUtils.clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}

export function configureLeafSurface(material,kind){
  const size=128,pixels=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4);
  const base=new T.Color(kind==='maple'?'#c88d42':'#87975d').toArray();
  // Veins branch from the petiole junction, not a screen-space repeated stripe.
  const veins=kind==='maple'?[[.0,.5,1,.5],[.26,.5,.71,.09],[.26,.5,.73,.93],
    [.26,.5,.35,0],[.26,.5,.37,1]]:[[0,.5,1,.5]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1),v=y/(size-1),grain=Math.sin(x*1.71+y*2.93)*Math.sin(y*.47-x*.23);
    let distance=Math.min(...veins.map(line=>segmentDistance(u,v,...line)));
    if(kind==='bamboo')for(const offset of [-.24,-.12,.12,.24])distance=Math.min(distance,Math.abs(v-.5-offset)*1.9);
    else for(const side of [-1,1])for(let n=1;n<5;n++)distance=Math.min(distance,
      segmentDistance(u,v,.28+n*.12,.5,.22+n*.12,.5+side*.18));
    const vein=Math.exp(-distance*distance/(kind==='maple'?.000022:.00006));
    const m=.88+.07*Math.sin(u*7+v*4)+grain*.035-vein*.15,i=(y*size+x)*4;
    for(let c=0;c<3;c++)pixels[i+c]=Math.round(T.MathUtils.clamp(base[c]*m+vein*.045,0,1)*255);
    pixels[i+3]=255;const r=Math.round((.84+grain*.035-vein*.12)*255);
    roughness.set([r,r,r,255],i);
  }
  const map=new T.DataTexture(pixels,size,size,T.RGBAFormat),rough=new T.DataTexture(roughness,size,size,T.RGBAFormat);
  // Values above are in linear colour, so the colour texture stays linear.
  for(const texture of [map,rough]){texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;}
  material.color.set('#ffffff');material.map=map;material.roughnessMap=rough;material.roughness=1;
  material.side=T.DoubleSide;material.vertexColors=true;
  return material;
}
