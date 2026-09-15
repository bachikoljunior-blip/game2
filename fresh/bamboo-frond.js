import * as T from 'three';
import {setLeafAttachment} from './vegetation-physics.js';

// Original atlas rasterized at boot from the SAME small leaf triangles used
// nearby. No external artwork, enlarged leaf silhouette or camera-facing sprite.
// Three fronds + one detailed leaf surface occupy four isolated atlas tiles.
export const FROND_ALPHA_TEST=.4;
const TILE=256,SIZE=TILE*2,PAD=5;
const tileOrigin=tile=>[(tile%2)*TILE,Math.floor(tile/2)*TILE];
function atlasUv(tile,u,v){const [x,y]=tileOrigin(tile);return [(x+PAD+u*(TILE-2*PAD))/SIZE,(y+PAD+v*(TILE-2*PAD))/SIZE];}
export function remapBambooLeafUv(g){
  const uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,...atlasUv(3,T.MathUtils.clamp(uv.getX(i),0,1),T.MathUtils.clamp(uv.getY(i),0,1)));
}
// Propagate the nearest painted RGB within each frond tile, leaving alpha
// and every painted texel unchanged. Transparent black/bright filler is not
// leaf colour and must not leak through bilinear or minification filtering.
export function extendFrondRgb(data,size){
  const side=size/2;
  for(let tile=0;tile<3;tile++){
    const x0=tile%2*side,y0=Math.floor(tile/2)*side,owner=new Int32Array(side*side).fill(-1),queue=new Int32Array(side*side);let head=0,tail=0;
    const offset=i=>((y0+Math.floor(i/side))*size+x0+i%side)*4;
    for(let i=0;i<owner.length;i++)if(data[offset(i)+3]){owner[i]=i;queue[tail++]=i;}
    while(head<tail){const i=queue[head++],x=i%side,y=Math.floor(i/side);for(const next of [x>0?i-1:-1,x+1<side?i+1:-1,y>0?i-side:-1,y+1<side?i+side:-1])if(next>=0&&owner[next]===-1){owner[next]=owner[i];queue[tail++]=next;}}
    for(let i=0;i<owner.length;i++)if(owner[i]>=0&&!data[offset(i)+3])for(let c=0;c<3;c++)data[offset(i)+c]=data[offset(owner[i])+c];
  }
  return data;
}
function tileCoverage(data,size,tile,scale=1,samples=64){
  const side=size/2,x0=tile%2*side,y0=Math.floor(tile/2)*side,alpha=(x,y)=>x<0||y<0||x>=side||y>=side?0:Math.min(255,data[((y0+y)*size+x0+x)*4+3]*scale);let covered=0;
  for(let y=0;y<samples;y++)for(let x=0;x<samples;x++){
    const px=(x+.5)/samples*side-.5,py=(y+.5)/samples*side-.5,ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,
      a=(alpha(ix,iy)*(1-fx)+alpha(ix+1,iy)*fx)*(1-fy)+(alpha(ix,iy+1)*(1-fx)+alpha(ix+1,iy+1)*fx)*fy;
    covered+=Number(a>=255*FROND_ALPHA_TEST);
  }
  return covered/(samples*samples);
}

// Colour is averaged using UNRESCALED coverage weights. Alpha is independently
// scaled to preserve filtered cutout coverage, never fed back into colour or
// the next raw mip. Stop at four texels per tile: below this size a 16% binary
// mask degenerates into an empty/filled tile and eventually mixes all four.
// Three allocates precisely these immutable levels, so ES3 clamps minification
// to this last level. Far aliasing remains a media check, not a quality claim.
export function buildFrondMipmaps(data,size){
  extendFrondRgb(data,size);
  const levels=[{data,width:size,height:size}],coverage=[],target=Array.from({length:3},(_,tile)=>tileCoverage(data,size,tile,1,256));let raw=data;
  while(size>8){
    const nextSize=size/2,nextRaw=new Float64Array(nextSize*nextSize*4),side=nextSize/2;
    for(let y=0;y<nextSize;y++)for(let x=0;x<nextSize;x++){
      const indices=[(y*2*size+x*2)*4,(y*2*size+x*2+1)*4,((y*2+1)*size+x*2)*4,((y*2+1)*size+x*2+1)*4],weight=indices.reduce((sum,i)=>sum+raw[i+3],0),to=(y*nextSize+x)*4;
      for(let c=0;c<3;c++)nextRaw[to+c]=weight?indices.reduce((sum,i)=>sum+raw[i+c]*raw[i+3],0)/weight:0;
      nextRaw[to+3]=weight*.25;
    }
    const out=extendFrondRgb(Uint8Array.from(nextRaw,v=>Math.round(v)),nextSize),row=[],filtered=[];
    // A one-texel transparent guard prevents adjacent tiles (including the
    // opaque detail tile) entering a cutout through coarse bilinear filtering.
    // Detail/wood faces explicitly ignore map alpha, preserving their opacity.
    for(let tile=0;tile<4;tile++){const x0=tile%2*side,y0=Math.floor(tile/2)*side;for(let n=0;n<side;n++)for(const [x,y] of [[n,0],[n,side-1],[0,n],[side-1,n]])out[((y0+y)*nextSize+x0+x)*4+3]=0;}
    for(let tile=0;tile<3;tile++){
      let low=0,high=16;
      for(let step=0;step<16;step++){const scale=(low+high)*.5;if(tileCoverage(out,nextSize,tile,scale)<target[tile])low=scale;else high=scale;}
      const scale=(low+high)*.5,x0=tile%2*side,y0=Math.floor(tile/2)*side;let count=0;
      for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=((y0+y)*nextSize+x0+x)*4+3;out[i]=Math.min(255,Math.round(out[i]*scale));count+=Number(out[i]>=255*FROND_ALPHA_TEST);}
      row.push(count/(side*side));filtered.push(tileCoverage(out,nextSize,tile));
    }
    levels.push({data:out,width:nextSize,height:nextSize});coverage.push({size:nextSize,fronds:row,filteredFronds:filtered});raw=nextRaw;size=nextSize;
  }
  return {levels,coverage,filteredTarget:target};
}
export function createFrondAtlas(material){
  const color=new Uint8Array(SIZE*SIZE*4),rough=new Uint8Array(SIZE*SIZE*4),source=material.map.image,sourceRough=material.roughnessMap.image;
  // Unpainted RGB is replaced with tile-local neighbouring leaf colour in finish().
  for(let i=0;i<color.length;i+=4){color.set([92,111,60,0],i);rough.set([220,220,220,255],i);}
  function sample(image,u,v){const x=T.MathUtils.clamp(Math.round(u*(image.width-1)),0,image.width-1),y=T.MathUtils.clamp(Math.round(v*(image.height-1)),0,image.height-1);return (y*image.width+x)*4;}
  const [tx,ty]=tileOrigin(3);
  for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
    const u=T.MathUtils.clamp((x-PAD)/(TILE-2*PAD),0,1),v=T.MathUtils.clamp((y-PAD)/(TILE-2*PAD),0,1),from=sample(source,u,v),to=((ty+y)*SIZE+tx+x)*4;
    color.set(source.data.subarray(from,from+4),to);rough.set(sourceRough.data.subarray(from,from+4),to);
  }
  function bake(parts,tile){
    const bounds=new T.Box3();let area=0,crosswindArea=0;
    for(const g of parts){g.computeBoundingBox();bounds.union(g.boundingBox);}
    bounds.expandByScalar(.006);const extent=bounds.getSize(new T.Vector3()),[ox,oy]=tileOrigin(tile),span=TILE-2*PAD;
    for(const g of parts){
      const p=g.attributes.position,uv=g.attributes.uv,tint=g.attributes.color;
      for(let i=0;i<g.index.count;i+=3){
        const ids=[0,1,2].map(n=>g.index.getX(i+n)),points=ids.map(id=>new T.Vector3().fromBufferAttribute(p,id));
        const cross=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        area+=cross.length()*.5;crosswindArea+=Math.hypot(cross.x,cross.z)/Math.PI;
        const xy=points.map(p=>[(p.x-bounds.min.x)/extent.x*span+PAD,(p.z-bounds.min.z)/extent.z*span+PAD]);
        const [[ax,ay],[bx,by],[cx,cy]]=xy,den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-10)continue;
        const minX=Math.max(PAD,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(TILE-PAD-1,Math.ceil(Math.max(ax,bx,cx))),minY=Math.max(PAD,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(TILE-PAD-1,Math.ceil(Math.max(ay,by,cy)));
        for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
          let covered=0,su=0,sv=0;const weights=[0,0,0];
          for(const [dx,dy] of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]){
            const a=((by-cy)*(x+dx-cx)+(cx-bx)*(y+dy-cy))/den,b=((cy-ay)*(x+dx-cx)+(ax-cx)*(y+dy-cy))/den,c=1-a-b;
            if(Math.min(a,b,c)<0)continue;covered++;weights[0]+=a;weights[1]+=b;weights[2]+=c;
          }
          if(!covered)continue;for(let n=0;n<3;n++){weights[n]/=covered;su+=uv.getX(ids[n])*weights[n];sv+=uv.getY(ids[n])*weights[n];}
          const from=sample(source,su,sv),to=((oy+y)*SIZE+ox+x)*4,coverage=covered*255/4;
          for(let c=0;c<3;c++)color[to+c]=Math.round(source.data[from+c]*ids.reduce((sum,id,n)=>sum+tint.array[id*3+c]*weights[n],0));
          color[to+3]=Math.max(color[to+3],coverage);rough.set(sourceRough.data.subarray(from,from+4),to);
        }
      }
    }
    // The projected frond lies in the leaf group's mean horizontal plane. The
    // maximum lost depth is recorded and grazing cameras retain real geometry.
    const y=(bounds.min.y+bounds.max.y)*.5,positions=[bounds.min.x,y,bounds.min.z,bounds.max.x,y,bounds.min.z,bounds.max.x,y,bounds.max.z,bounds.min.x,y,bounds.max.z];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute([[0,0],[1,0],[1,1],[0,1]].flatMap(([u,v])=>atlasUv(tile,u,v)),2));g.setIndex([0,2,1,0,3,2]);g.computeVertexNormals();
    g.setAttribute('color',new T.Float32BufferAttribute(Array(12).fill(1),3));setLeafAttachment(g,{kind:-1});
    return {geometry:g,area,crosswindArea,collapsedDepth:extent.y,projectedArea:extent.x*extent.z};
  }
  function finish(){
    for(const [data,key] of [[color,'map'],[rough,'roughnessMap']]){
      const texture=new T.DataTexture(data,SIZE,SIZE,T.RGBAFormat);texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;if(key==='map'){const mips=buildFrondMipmaps(data,SIZE);texture.mipmaps=mips.levels;texture.generateMipmaps=false;texture.userData={coverageMips:mips.coverage,filteredCoverageTarget:mips.filteredTarget,minMipSize:8};}texture.needsUpdate=true;material[key]=texture;
    }
    material.alphaTest=FROND_ALPHA_TEST;material.userData.foliageAlpha={map:material.map,alphaTest:FROND_ALPHA_TEST};
    return {width:SIZE,height:SIZE,bytes:color.byteLength+rough.byteLength,coverageMips:material.map.userData.coverageMips,filteredCoverageTarget:material.map.userData.filteredCoverageTarget,minMipSize:8,coverage:Array.from({length:3},(_,tile)=>{const [x0,y0]=tileOrigin(tile);let count=0;for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++)if(color[((y0+y)*SIZE+x0+x)*4+3]>=255*FROND_ALPHA_TEST)count++;return count/(TILE*TILE);})};
  }
  return {bake,finish};
}

// Geometric shelter proxy: area of the union of actual leaves projected into
// eight horizontal wind directions. Summing leaf areas would count overlapped
// laminae repeatedly. This is a finite optical shelter approximation, not CFD.
export function projectedFrondDragArea(parts,size=96){
  let total=0;
  for(let direction=0;direction<8;direction++){
    const a=direction*Math.PI/4,c=Math.cos(a),s=Math.sin(a),triangles=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const g of parts){const p=g.attributes.position;for(let i=0;i<g.index.count;i+=3){const triangle=[];for(let n=0;n<3;n++){const id=g.index.getX(i+n),x=p.getX(id)*c+p.getZ(id)*s,y=p.getY(id);triangle.push([x,y]);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}triangles.push(triangle);}}
    const w=maxX-minX,h=maxY-minY;if(w*h<1e-12)continue;const mask=new Uint8Array(size*size);
    for(const triangle of triangles){
      const [[ax,ay],[bx,by],[cx,cy]]=triangle.map(([x,y])=>[(x-minX)/w*size,(y-minY)/h*size]),den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-12)continue;
      for(let y=Math.max(0,Math.floor(Math.min(ay,by,cy)));y<Math.min(size,Math.ceil(Math.max(ay,by,cy)));y++)for(let x=Math.max(0,Math.floor(Math.min(ax,bx,cx)));x<Math.min(size,Math.ceil(Math.max(ax,bx,cx)));x++){
        const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den,v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den;if(Math.min(u,v,1-u-v)>=0)mask[y*size+x]=1;
      }
    }
    total+=mask.reduce((sum,x)=>sum+x,0)/(size*size)*w*h;
  }
  return total/8;
}

// The atlas shares a material with real opaque leaves and wood. Only frond
// vertices carry kind=-1 and perform alpha discard. This remains true even in
// the final atlas mip where opaque and cutout tiles inevitably share a texel.
export function installFrondCutout(material){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=shader=>{
    previous(shader);
    shader.vertexShader='varying float foliageCutout;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfoliageCutout=step(leafPivot.w,-.5);');
    shader.fragmentShader='varying float foliageCutout;\n'+shader.fragmentShader;
    // The map's alpha is a coverage mask, while diffuseColor.a on entry is
    // foreground opacity. Testing their product would erase an entire frond
    // once opacity fell below alphaTest (the foreground target is 0.08).
    // Reuse Three's existing map sample: no additional texture lookup.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      'float foliageFadeAlpha = diffuseColor.a;\n#include <map_fragment>\nfloat foliageMaskAlpha = 1.0;\n#ifdef USE_MAP\nfoliageMaskAlpha = sampledDiffuseColor.a;\n#endif\ndiffuseColor.a = foliageFadeAlpha;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',
      '#ifdef USE_ALPHATEST\nif(foliageCutout>.5){\nif(foliageMaskAlpha < alphaTest) discard;\n}\n#endif\n// foliage-mask-end');
  };
  material.customProgramCacheKey=()=>key+'-frond-cutout-v2';return material;
}

// The old modal mass already included its sparse crown. Add only the measured
// area difference, using authored effective lamina density and mutual shelter.
// This is a calibrated-design coefficient, not a measured species claim.
export function addBambooCrownLoad(beam,oldArea,newArea,oldCrosswindArea,newCrosswindArea,beams){
  const extraArea=Math.max(0,newArea-oldArea),arealMass=.06,shelter=.65;
  // Horizontal projected lamina area is the union of actual leaf triangles,
  // sampled at eight wind azimuths. Nearly horizontal blades do not
  // expose their entire face to the scene's horizontal airflow. The residual
  // 3% area models unresolved vertical eddies; shelter models mutual overlap.
  const extraDragArea=(Math.max(0,newCrosswindArea-oldCrosswindArea)+extraArea*.03)*shelter;
  beam.foliageLoad={oldArea,newArea,oldCrosswindArea,newCrosswindArea,extraMass:extraArea*arealMass,extraDragArea,arealMass,shelter,verticalEddyFraction:.03};
  beam.mass+=beam.foliageLoad.extraMass;beam.area+=beam.foliageLoad.extraDragArea;
  // The same added distal foliage participates in each ancestor's mode with
  // its cantilever shape at the attachment: mass uses f², force uses f. These
  // are modal contributions, not separately created physical leaves.
  let child=beam,participation=1;
  while(beams&&child.parent!==null){
    const parent=beams[child.parent],u=T.MathUtils.clamp(child.attachment[1]/parent.length,0,1);participation*=u*u*(1.5-.5*u);
    const mass=beam.foliageLoad.extraMass*participation**2,area=beam.foliageLoad.extraDragArea*participation;
    parent.crownLoad??={extraMass:0,extraDragArea:0};parent.crownLoad.extraMass+=mass;parent.crownLoad.extraDragArea+=area;parent.mass+=mass;parent.area+=area;child=parent;
  }
}
