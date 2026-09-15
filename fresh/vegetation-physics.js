import { DataTexture, Float32BufferAttribute, FloatType, NearestFilter, RGBAFormat, Vector2, Vector3 } from 'three';

// Reduced, two-axis cantilever modes. Units are metres, kilograms, seconds and
// N/m; these are authored effective canopy modes, not measured material values.
// k scales as L^-3 and modal mass as L. Crown drag is included in effective area.
export const VEGETATION_MODELS=Object.freeze({
  bamboo: Object.freeze({length:9,mass:2.8,stiffness:72,damping:.48,area:.65,maxRatio:.045}),
  wood: Object.freeze({length:5,mass:14,stiffness:7200,damping:.72,area:1.9,maxRatio:.008}),
  bambooBranch: Object.freeze({length:1.2,mass:.05,stiffness:20,damping:.38,area:.09,maxRatio:.13}),
  woodBranch: Object.freeze({length:2.2,mass:.65,stiffness:260,damping:.55,area:.38,maxRatio:.06}),
  twig: Object.freeze({length:.6,mass:.003,stiffness:3.2,damping:.36,area:.012,maxRatio:.12})
});
export const LEAF_MODELS=Object.freeze({
  bamboo:Object.freeze({inertia:.0000012,stiffness:.00047,damping:.43}),
  maple:Object.freeze({inertia:.000005,stiffness:.00144,damping:.52})
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vadd=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const vsub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a,s)=>a.map(v=>v*s);
const normalize=a=>scale(a,1/(Math.hypot(...a)||1));
const qInverse=q=>[-q[0],-q[1],-q[2],q[3]];
export function rotateVector(p,q){
  const uv=cross(q,p),uuv=cross(q,uv);
  return p.map((v,i)=>v+2*(q[3]*uv[i]+uuv[i]));
}
function qMultiply(a,b){return [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function fromY(v){
  const d=normalize(v);return d[1]<-.999999?[1,0,0,0]:normalize([d[2],0,-d[0],1+d[1]]);
}

// Exact underdamped solution while the applied force is constant over this
// substep. Unlike a displaced sine, removing force leaves a decaying free mode.
export function stepDampedSpring(state,force,seconds,{mass,stiffness,damping}){
  if(seconds<=0)return state;
  const omega=Math.sqrt(stiffness/mass),decay=damping*omega,
    damped=omega*Math.sqrt(1-damping*damping),target=force/stiffness,
    offset=state.position-target,c=Math.cos(damped*seconds),s=Math.sin(damped*seconds),e=Math.exp(-decay*seconds),
    quadrature=(state.velocity+decay*offset)/damped;
  state.position=target+e*(offset*c+quadrature*s);
  state.velocity=e*(state.velocity*c-(decay*state.velocity+omega*omega*offset)/damped*s);
  return state;
}

// End-load beam mode f(u)=1.5u²-.5u³. The shortening integrates 1/2|f' d/L|²;
// at the small authored bend limits the remaining arc-length error is O(slope^4).
export function bendFrame(point,length,tip){
  const u=clamp(point[1]/length,0,1),f=u*u*(1.5-.5*u),df=u*(3-1.5*u),r2=(tip[0]**2+tip[1]**2)/(length*length),
    shortening=length*r2*.5*u*u*u*(3-2.25*u+.45*u*u),
    tangent=[tip[0]/length*df,1-r2*.5*df*df,tip[1]/length*df],rotation=fromY(tangent),
    center=[tip[0]*f,point[1]-shortening,tip[1]*f];
  return {position:vadd(center,rotateVector([point[0],0,point[2]],rotation)),rotation};
}

export function beamSurfaceNormal(point,normal,length,tip){
  const frame=bendFrame(point,length,tip),u=clamp(point[1]/length,0,1),amount=Math.hypot(...tip),
    slope=amount/length*u*(3-1.5*u),vertical=1-.5*slope*slope,
    axis=amount>1e-12?[tip[1]/amount,0,-tip[0]/amount]:[0,0,0],
    derivative=(point[1]>=0&&point[1]<=length)?amount/(length*length)*(3-3*u)*(1+.5*slope*slope)/(vertical*vertical+slope*slope):0,
    offset=rotateVector([point[0],0,point[2]],frame.rotation),
    dx=rotateVector([1,0,0],frame.rotation),dz=rotateVector([0,0,1],frame.rotation),
    dy=vadd([tip[0]/length*u*(3-1.5*u),vertical,tip[1]/length*u*(3-1.5*u)],scale(cross(axis,offset),derivative));
  return normalize(vadd(vadd(scale(cross(dy,dz),normal[0]),scale(cross(dz,dx),normal[1])),scale(cross(dx,dy),normal[2])));
}

export function createVegetationPhysics(sampleWind){
  const beams=[],textureUniform={value:null},textureSizeUniform={value:new Vector2(1,1)};
  let lastTime=null,data=null;
  const metrics={solver:'damped-cantilever-modes',beamCount:0,speciesCounts:{},maxTipDisplacement:0,maxTipByKind:{},maxRootDrift:0,textureBytes:0};
  function addBeam({kind,start,end,parent=null}){
    if(data)throw new Error('Vegetation geometry must be registered before its first update');
    const spec=VEGETATION_MODELS[kind];if(!spec)throw new Error(`Unknown vegetation mode ${kind}`);
    const direction=vsub(end,start),length=Math.hypot(...direction);
    if(length<.015)throw new Error('Vegetation support is too short');
    const ratio=length/spec.length,restRotation=fromY(direction),p=parent===null?null:beams[parent];
    if(parent!==null&&!p)throw new Error('Vegetation parent must be registered first');
    const id=beams.length,beam={id,kind,length,restOrigin:[...start],restRotation,
      parent,attachment:p?rotateVector(vsub(start,p.restOrigin),qInverse(p.restRotation)):null,
      relativeRotation:p?qMultiply(qInverse(p.restRotation),restRotation):restRotation,
      origin:[...start],rotation:[...restRotation],mass:spec.mass*ratio,stiffness:spec.stiffness/ratio**3,
      damping:spec.damping,area:spec.area*ratio,maxRatio:spec.maxRatio,
      x:{position:0,velocity:0},z:{position:0,velocity:0},pressure:0};
    beams.push(beam);metrics.beamCount=beams.length;metrics.speciesCounts[kind]=(metrics.speciesCounts[kind]??0)+1;return id;
  }
  function localPoint(id,point){const b=beams[id];return rotateVector(vsub(point,b.restOrigin),qInverse(b.restRotation));}
  function frameAt(id,point){
    const b=beams[id],frame=bendFrame(point,b.length,[b.x.position,b.z.position]);
    return {position:vadd(b.origin,rotateVector(frame.position,b.rotation)),rotation:qMultiply(b.rotation,frame.rotation)};
  }
  function deformVertex(geometry,index,time){
    const support=geometry.attributes.windSupport,pivot=geometry.attributes.leafPivot,axis=geometry.attributes.leafAxis,direction=geometry.attributes.leafDirection,
      id=support.getW(index),point=[support.getX(index),support.getY(index),support.getZ(index)];
    if(pivot.getW(index)<.5)return frameAt(id,point).position;
    const b=beams[id],root=[pivot.getX(index),pivot.getY(index),pivot.getZ(index)],
      a=normalize([axis.getX(index),axis.getY(index),axis.getZ(index)]),d=normalize([direction.getX(index),direction.getY(index),direction.getZ(index)]),
      seed=direction.getW(index)+b.origin[0]*.73+b.origin[2]*1.17,motion=sampleLeafMotion(time,seed,b.pressure,pivot.getW(index)),
      local=vsub(point,root),along=local.reduce((sum,v,i)=>sum+v*d[i],0),curl=motion.curl*clamp(along/Math.max(.03,axis.getW(index)),0,1),
      turn=angle=>[...scale(a,Math.sin(angle*.5)),Math.cos(angle*.5)],
      center=vadd(scale(d,along*(1-curl*curl/6)),scale(cross(a,d),along*(curl*.5-curl**3/24))),
      blade=rotateVector(vadd(center,rotateVector(vsub(local,scale(d,along)),turn(curl))),turn(motion.hinge)),frame=frameAt(id,root);
    return vadd(frame.position,rotateVector(blade,frame.rotation));
  }
  function bindGeometry(g,id){
    const beam=beams[id],inverse=qInverse(beam.restRotation),p=g.getAttribute('position'),n=g.getAttribute('normal'),support=[];
    if(!g.hasAttribute('leafPivot'))setLeafAttachment(g);
    const pivots=g.getAttribute('leafPivot'),axes=g.getAttribute('leafAxis'),directions=g.getAttribute('leafDirection');
    for(let i=0;i<p.count;i++){
      support.push(...localPoint(id,[p.getX(i),p.getY(i),p.getZ(i)]),id);
      n.setXYZ(i,...rotateVector([n.getX(i),n.getY(i),n.getZ(i)],inverse));
      if(pivots.getW(i)>0){
        pivots.setXYZ(i,...localPoint(id,[pivots.getX(i),pivots.getY(i),pivots.getZ(i)]));
        axes.setXYZ(i,...rotateVector([axes.getX(i),axes.getY(i),axes.getZ(i)],inverse));
        directions.setXYZ(i,...rotateVector([directions.getX(i),directions.getY(i),directions.getZ(i)],inverse));
      }
    }
    g.setAttribute('windSupport',new Float32BufferAttribute(support,4));return g;
  }
  function update(time){
    if(lastTime===time)return;
    if(!data){
      const width=128,height=Math.max(1,Math.ceil(beams.length*3/width));data=new Float32Array(width*height*4);
      const texture=new DataTexture(data,width,height,RGBAFormat,FloatType);texture.magFilter=texture.minFilter=NearestFilter;texture.generateMipmaps=false;
      textureUniform.value=texture;textureSizeUniform.value.set(width,height);metrics.textureBytes=data.byteLength;
    }
    const reset=lastTime===null||time<lastTime,dt=reset?0:Math.min(.1,time-lastTime),steps=Math.max(1,Math.ceil(dt/(1/60))),step=dt/steps;
    for(let s=0;s<steps;s++){
      const t=reset?time:time-dt+(s+.5)*step;
      for(const b of beams){
        const w=sampleWind(b.restOrigin[0],b.restOrigin[2],t),force=rotateVector([w.x*4*b.area,0,w.z*4*b.area],qInverse(b.restRotation));
        b.pressure=w.pressure;
        if(reset){b.x.position=force[0]/b.stiffness;b.z.position=force[2]/b.stiffness;b.x.velocity=b.z.velocity=0;}
        else{stepDampedSpring(b.x,force[0],step,b);stepDampedSpring(b.z,force[2],step,b);}
        const amount=Math.hypot(b.x.position,b.z.position),limit=b.length*b.maxRatio;
        if(amount>limit){const factor=limit/amount;b.x.position*=factor;b.z.position*=factor;b.x.velocity*=factor;b.z.velocity*=factor;}
      }
    }
    metrics.maxTipDisplacement=0;metrics.maxRootDrift=0;metrics.maxTipByKind={};
    for(const b of beams){
      if(b.parent!==null){const parent=frameAt(b.parent,b.attachment);b.origin=parent.position;b.rotation=qMultiply(parent.rotation,b.relativeRotation);}
      const displacement=Math.hypot(b.x.position,b.z.position);
      metrics.maxTipDisplacement=Math.max(metrics.maxTipDisplacement,displacement);
      metrics.maxTipByKind[b.kind]=Math.max(metrics.maxTipByKind[b.kind]??0,displacement);
      if(b.parent===null)metrics.maxRootDrift=Math.max(metrics.maxRootDrift,Math.hypot(...vsub(b.origin,b.restOrigin)));
      const offset=b.id*12;data.set([...b.origin,b.length,...b.rotation,b.x.position,b.z.position,b.pressure,0],offset);
    }
    textureUniform.value.needsUpdate=true;lastTime=time;
  }
  return {addBeam,bindGeometry,localPoint,frameAt,deformVertex,update,beams,metrics,textureUniform,textureSizeUniform};
}

// Leaf metadata follows authored transforms before the geometry is bound to its
// supporting beam. Every vertex of one blade shares its actual petiole pivot.
export function setLeafAttachment(g,{pivot=[0,0,0],axis=[0,1,0],direction=[1,0,0],length=1,kind=0,seed=0}={}){
  const count=g.getAttribute('position').count,p=[],a=[],d=[];
  for(let i=0;i<count;i++){p.push(...pivot,kind);a.push(...axis,length);d.push(...direction,seed);}
  g.setAttribute('leafPivot',new Float32BufferAttribute(p,4));g.setAttribute('leafAxis',new Float32BufferAttribute(a,4));g.setAttribute('leafDirection',new Float32BufferAttribute(d,4));return g;
}
export function transformLeafGeometry(g,matrix){
  const pivots=g.getAttribute('leafPivot'),axes=g.getAttribute('leafAxis'),directions=g.getAttribute('leafDirection'),v=new Vector3(),origin=new Vector3().applyMatrix4(matrix);
  if(pivots)for(let i=0;i<pivots.count;i++){
    if(!pivots.getW(i))continue;
    v.set(pivots.getX(i),pivots.getY(i),pivots.getZ(i)).applyMatrix4(matrix);pivots.setXYZ(i,v.x,v.y,v.z);
    v.set(directions.getX(i),directions.getY(i),directions.getZ(i)).applyMatrix4(matrix).sub(origin);
    const length=v.length();v.normalize();directions.setXYZ(i,v.x,v.y,v.z);axes.setW(i,axes.getW(i)*length);
    const direction=v.clone();v.set(axes.getX(i),axes.getY(i),axes.getZ(i)).transformDirection(matrix);
    // Nonuniform authoring scale shears a pair of perpendicular directions.
    // Rebuild the in-plane hinge axis before applying torsion/curl rotations.
    v.addScaledVector(direction,-v.dot(direction)).normalize();axes.setXYZ(i,v.x,v.y,v.z);
  }
  g.applyMatrix4(matrix);return g;
}

// A torsional mode's exact steady response to each forcing frequency. The
// frequencies describe small local eddies; inertia, stiffness and damping set
// their attenuation AND phase. They do not prescribe a shared leaf angle.
export function harmonicResponse(time,frequency,phase,omega,damping){
  const ratio=frequency/omega,a=1-ratio*ratio,b=2*damping*ratio;
  return (a*Math.sin(time*frequency+phase)-b*Math.cos(time*frequency+phase))/(a*a+b*b);
}
export function sampleLeafMotion(time,seed,pressure,kind=1){
  const model=kind===2?LEAF_MODELS.maple:LEAF_MODELS.bamboo,omega=Math.sqrt(model.stiffness/model.inertia)*(1+.12*Math.sin(seed*2.7)),
    slow=harmonicResponse(time,7.7+Math.sin(seed)*1.6,seed,omega,model.damping),
    fast=harmonicResponse(time,16.3+Math.cos(seed*.73)*2.2,seed*2.37,omega,model.damping);
  return {hinge:pressure*(.09*slow+.045*fast),curl:pressure*(.042*slow-.022*fast)};
}

export const VEGETATION_ATTRIBUTES=`
attribute vec4 windSupport;
attribute vec4 leafPivot;
attribute vec4 leafAxis;
attribute vec4 leafDirection;
uniform sampler2D vegetationModes;
uniform vec2 vegetationModesSize;
`;
export const VEGETATION_GLSL=`
vec4 vegetationTexel(float offset){
  return texture2D(vegetationModes,(vec2(mod(offset,vegetationModesSize.x),floor(offset/vegetationModesSize.x))+.5)/vegetationModesSize);
}
vec3 modeRotate(vec3 p,vec4 q){return p+2.*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
vec4 modeFromY(vec3 v){v=normalize(v);return normalize(vec4(v.z,0.,-v.x,1.+v.y));}
vec4 leafRotation(vec3 axis,float angle){return vec4(axis*sin(angle*.5),cos(angle*.5));}
void modeFrame(vec3 p,float beamLength,vec2 tip,out vec3 bent,out vec4 turn){
  float u=clamp(p.y/beamLength,0.,1.),f=u*u*(1.5-.5*u),df=u*(3.-1.5*u),r2=dot(tip,tip)/(beamLength*beamLength);
  float shortening=beamLength*r2*.5*u*u*u*(3.-2.25*u+.45*u*u);
  turn=modeFromY(vec3(tip.x/beamLength*df,1.-r2*.5*df*df,tip.y/beamLength*df));
  bent=vec3(tip.x*f,p.y-shortening,tip.y*f)+modeRotate(vec3(p.x,0.,p.z),turn);
}
vec3 modeNormal(vec3 p,vec3 n,float beamLength,vec2 tip,vec4 turn){
  float u=clamp(p.y/beamLength,0.,1.),amount=length(tip),slope=amount/beamLength*u*(3.-1.5*u),vertical=1.-.5*slope*slope;
  vec3 axis=vec3(tip.y,0.,-tip.x)/max(amount,.0000001);
  float derivative=amount/(beamLength*beamLength)*(3.-3.*u)*(1.+.5*slope*slope)/(vertical*vertical+slope*slope);
  vec3 dx=modeRotate(vec3(1.,0.,0.),turn),dz=modeRotate(vec3(0.,0.,1.),turn),
    dy=vec3(tip.x/beamLength*u*(3.-1.5*u),vertical,tip.y/beamLength*u*(3.-1.5*u))+derivative*cross(axis,modeRotate(vec3(p.x,0.,p.z),turn));
  return normalize(cross(dy,dz)*n.x+cross(dz,dx)*n.y+cross(dx,dy)*n.z);
}
float modeHarmonic(float t,float frequency,float phase,float omega,float damping){
  float ratio=frequency/omega,a=1.-ratio*ratio,b=2.*damping*ratio;
  return (a*sin(t*frequency+phase)-b*cos(t*frequency+phase))/(a*a+b*b);
}
void vegetationDeform(out vec3 p,out vec3 n){
  float offset=windSupport.w*3.;vec4 origin=vegetationTexel(offset),base=vegetationTexel(offset+1.),mode=vegetationTexel(offset+2.);
  vec4 turn;vec3 bent;
  if(leafPivot.w>.5){
    float seed=leafDirection.w+dot(origin.xz,vec2(.73,1.17)),isMaple=step(1.5,leafPivot.w),
      omega=mix(${Math.sqrt(LEAF_MODELS.bamboo.stiffness/LEAF_MODELS.bamboo.inertia)},${Math.sqrt(LEAF_MODELS.maple.stiffness/LEAF_MODELS.maple.inertia)},isMaple)*(1.+.12*sin(seed*2.7)),
      damping=mix(${LEAF_MODELS.bamboo.damping},${LEAF_MODELS.maple.damping},isMaple),
      slow=modeHarmonic(windTime,7.7+sin(seed)*1.6,seed,omega,damping),
      fast=modeHarmonic(windTime,16.3+cos(seed*.73)*2.2,seed*2.37,omega,damping),
      hinge=mode.z*(.09*slow+.045*fast),curl=mode.z*(.042*slow-.022*fast);
    vec3 axis=normalize(leafAxis.xyz),direction=normalize(leafDirection.xyz),local=windSupport.xyz-leafPivot.xyz;
    float along=dot(local,direction),a=curl*clamp(along/max(.03,leafAxis.w),0.,1.);
    vec3 center=direction*along*(1.-a*a/6.)+cross(axis,direction)*along*(a*.5-a*a*a/24.);
    vec4 curlTurn=leafRotation(axis,a),hingeTurn=leafRotation(axis,hinge);
    local=modeRotate(center+modeRotate(local-direction*along,curlTurn),hingeTurn);
    modeFrame(leafPivot.xyz,origin.w,mode.xy,bent,turn);
    p=origin.xyz+modeRotate(bent+modeRotate(local,turn),base);
    n=modeRotate(modeRotate(modeRotate(modeRotate(normal,curlTurn),hingeTurn),turn),base);
  }else{
    modeFrame(windSupport.xyz,origin.w,mode.xy,bent,turn);
    p=origin.xyz+modeRotate(bent,base);
    n=modeRotate(modeNormal(windSupport.xyz,normal,origin.w,mode.xy,turn),base);
  }
}
`;
