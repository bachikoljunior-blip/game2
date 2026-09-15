import * as T from 'three';

// One drawable/index buffer per existing spatial cell. Each twig switches its
// representation independently: nearby branches never force a whole 16 m cell
// to submit all its detailed leaves. All supports and leaf surfaces stay alive.
export function prepareFoliageLod(geometry,{maple=false}={}){
  const p=geometry.attributes.position,s=geometry.attributes.windSupport,k=geometry.attributes.leafPivot;
  if(!k||(!maple&&!Array.from(k.array).some((v,i)=>i%4===3&&v<0)))return null;
  const allIndices=geometry.index.array.slice(),groups=new Map();
  for(let i=0;i<allIndices.length;i+=3){
    const a=allIndices[i],id=s.getW(a);let group=groups.get(id);
    if(!group){group={id,near:[],far:[],wood:[],level:0,bounds:new T.Box3(),normal:new T.Vector3(),leafLength:0};groups.set(id,group);}
    const type=k.getW(a),target=type<0?group.far:type>0?group.near:group.wood;
    target.push(allIndices[i],allIndices[i+1],allIndices[i+2]);
    for(let n=0;n<3;n++)group.bounds.expandByPoint(new T.Vector3().fromBufferAttribute(p,allIndices[i+n]));
    if(type>0)group.leafLength=Math.max(group.leafLength,geometry.attributes.leafAxis.getW(a));
  }
  if(maple){
    // The retained boundary keeps all five major lobes and their separating
    // sinuses. Shared original vertices keep supports, normals and motion;
    // only minor basal serrations and tiny margin curvature are simplified.
    const outline=[1,5,7,8,9,11,13,14,15,17,21];
    for(let base=0;base<p.count;base+=24){
      if(k.getW(base)!==2||base+23>=p.count)throw new Error('Maple LOD requires the authored 24-vertex single leaf surface');
      const group=groups.get(s.getW(base));for(let n=0;n<outline.length;n++)group.far.push(base,base+outline[n],base+outline[(n+1)%outline.length]);
      group.far.push(base+22,base+1,base+21,base+22,base+21,base+23);
    }
  }
  for(const group of groups.values()){
    group.near.push(...group.wood);group.far.push(...group.wood);delete group.wood;
    if(group.far.length&&(maple||k.getW(group.far[0])<0)){
      const [a,b,c]=group.far.slice(0,3).map(i=>new T.Vector3().fromBufferAttribute(p,i));group.normal.copy(b.sub(a).cross(c.sub(a)).normalize());
    }else group.far=group.near;
    const fixed=group.far===group.near;group.near=new Uint32Array(group.near);group.far=fixed?group.near:new Uint32Array(group.far);group.bounds.expandByScalar(.35);
  }
  const lod={kind:maple?'maple':'bamboo',allIndices,groups,fullTriangles:0,activeTriangles:0,nearTwigs:0,farTwigs:0,transitions:0};
  geometry.userData.vegetationLod=lod;
  geometry.index.setUsage(T.DynamicDrawUsage);writeIndices(geometry,lod);return lod;
}
function writeIndices(geometry,lod){
  let count=0;lod.fullTriangles=0;lod.nearTwigs=0;lod.farTwigs=0;
  for(const group of lod.groups.values()){
    const indices=group.level?group.far:group.near;geometry.index.array.set(indices,count);count+=indices.length;lod.fullTriangles+=group.near.length/3;
    if(group.far!==group.near)group.level?lod.farTwigs++:lod.nearTwigs++;
  }
  geometry.setDrawRange(0,count);geometry.index.clearUpdateRanges();geometry.index.addUpdateRange(0,count);geometry.index.needsUpdate=true;lod.activeTriangles=count/3;
}
export function createFoliageLod(){
  const meshes=[],toCamera=new T.Vector3(),center=new T.Vector3();
  const metrics={fullTriangles:0,activeTriangles:0,nearTwigs:0,farTwigs:0,transitions:0,scope:'Index-selected detailed maple / simplified maple margins and detailed bamboo / support-bound cutout fronds. GPU timing and visual transitions require rendered media.'};
  function add(mesh,options){if(prepareFoliageLod(mesh.geometry,options))meshes.push(mesh);}
  function update(camera,pixelHeight){
    const scale=pixelHeight/(2*Math.tan(T.MathUtils.degToRad(camera.fov)*.5));
    for(const mesh of meshes){
      const lod=mesh.geometry.userData.vegetationLod;let changed=false;
      for(const group of lod.groups.values()){
        if(group.far===group.near)continue;
        const distance=Math.max(.1,group.bounds.distanceToPoint(camera.position)),pixels=group.leafLength*scale/distance;
        toCamera.subVectors(camera.position,group.bounds.getCenter(center)).normalize();
        // A grazing view can reveal the depth collapsed by a frond projection.
        // Keep full geometry there. Hysteresis limits threshold chatter; this
        // does not conceal the remaining silhouette/normal transition risk.
        const face=Math.abs(toCamera.dot(group.normal));
        const next=lod.kind==='maple'?(group.level?(pixels>10?0:1):(pixels<7?1:0)):
          group.level?(pixels>8||face<.07?0:1):(pixels<6&&face>.11?1:0);
        if(next!==group.level){group.level=next;changed=true;lod.transitions++;}
      }
      if(changed)writeIndices(mesh.geometry,lod);
    }
    for(const key of ['fullTriangles','activeTriangles','nearTwigs','farTwigs','transitions'])metrics[key]=meshes.reduce((n,m)=>n+m.geometry.userData.vegetationLod[key],0);
  }
  return {add,update,metrics};
}

// CPU silhouette probes use the same base-level bilinear alpha field as the
// cutout material. GPU mip/derivative filtering is a documented subpixel edge
// approximation; transparent texels must never become solid ray blockers.
export function foliageAlphaAt(texture,uv){
  const {width,height,data}=texture.image,x=T.MathUtils.clamp(uv.x*width-.5,0,width-1),y=T.MathUtils.clamp(uv.y*height-.5,0,height-1),x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
  const a=(ix,iy)=>data[(Math.min(height-1,iy)*width+Math.min(width-1,ix))*4+3]/255;
  return T.MathUtils.lerp(T.MathUtils.lerp(a(x0,y0),a(x0+1,y0),fx),T.MathUtils.lerp(a(x0,y0+1),a(x0+1,y0+1),fx),fy);
}
export function foliageHitIsOpaque(hit){
  const alpha=hit.object.userData.foliageAlpha,kind=hit.object.geometry.attributes.leafPivot;
  if(kind&&hit.face&&kind.getW(hit.face.a)>=0)return true;
  return !alpha||!hit.uv||foliageAlphaAt(alpha.map,hit.uv)>=alpha.alphaTest;
}
