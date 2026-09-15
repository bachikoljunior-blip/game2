import * as T from 'three';

// Authored surfaces in metres. The figure is generated from continuous sections
// and cut cloth surfaces, rather than adding primitives to suggest anatomy.
const TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const bell=(n,c,r)=>Math.exp(-(((n-c)/r)**2));
const smooth=t=>t*t*(3-2*t);

export function surface(columns,rows,point,{flip=false,wrap=false}={}){
  const positions=[],uvs=[],indices=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
    positions.push(...point(i/columns,j/rows));uvs.push(i/columns,j/rows);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const a=j*(columns+1)+i,b=a+1,c=a+columns+1,d=c+1;
    indices.push(...(flip?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  if(wrap){
    const normals=geometry.attributes.normal;
    for(let j=0;j<=rows;j++){
      const a=j*(columns+1),b=a+columns;
      const n=new T.Vector3(normals.getX(a)+normals.getX(b),normals.getY(a)+normals.getY(b),normals.getZ(a)+normals.getZ(b)).normalize();
      normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
    }
  }
  return geometry;
}

function section(profile,y){
  let i=0;while(i<profile.length-2&&y>profile[i+1][0])i++;
  const a=profile[i],b=profile[i+1],before=profile[Math.max(0,i-1)],after=profile[Math.min(profile.length-1,i+2)];
  const t=clamp((y-a[0])/(b[0]-a[0])),t2=t*t,t3=t2*t;
  return a.slice(1).map((n,k)=>{
    const m=k+1,da=(b[m]-before[m])/(b[0]-before[0])*(b[0]-a[0]);
    const db=(after[m]-a[m])/(after[0]-a[0])*(b[0]-a[0]);
    return (2*t3-3*t2+1)*n+(t3-2*t2+t)*da+(-2*t3+3*t2)*b[m]+(t3-t2)*db;
  });
}

// Sections: height, half-width, depth radius, depth centre. A y-dependent fold
// field displaces the actual silhouette; normals and shadows share that shape.
export function loft(profile,{segments=28,rows=20,fold=0,folds=9,phase=0,deform=null,closed=true}={}){
  const low=profile[0][0],high=profile.at(-1)[0];
  const geometry=surface(segments,rows,(u,v)=>{
    const y=low+(high-low)*v,[w,d,z=0]=section(profile,y),angle=u*TAU;
    const pleat=fold*Math.sin(angle*folds+phase+Math.sin(v*5+angle*2)*.42)*Math.sin(Math.PI*v)**.65;
    const p=[Math.sin(angle)*(w+pleat),y,Math.cos(angle)*(d+pleat)+z];
    return deform?deform(p,u,v):p;
  },{wrap:true});
  if(closed){
    // Close each actual section, including its deformation. A sleeve or wrist
    // that rotates away from its neighbour must not expose a hollow tube.
    // Duplicate cap rims keep the rim crease out of the smooth side normals.
    const p=Array.from(geometry.attributes.position.array),n=Array.from(geometry.attributes.normal.array),
      uv=Array.from(geometry.attributes.uv.array),indices=Array.from(geometry.index.array);
    for(const row of [0,rows]){
      const normal=row===0?-1:1,center=[0,0,0];
      for(let i=0;i<segments;i++)for(let k=0;k<3;k++)center[k]+=p[(row*(segments+1)+i)*3+k]/segments;
      const start=p.length/3;p.push(...center);n.push(0,normal,0);uv.push(.5,.5);
      for(let i=0;i<=segments;i++){
        const source=(row*(segments+1)+i)*3;p.push(p[source],p[source+1],p[source+2]);n.push(0,normal,0);
        uv.push(.5+Math.sin(i/segments*TAU)*.5,.5+Math.cos(i/segments*TAU)*.5);
      }
      for(let i=0;i<segments;i++)indices.push(...(normal>0?[start,start+i+1,start+i+2]:[start,start+i+2,start+i+1]));
    }
    geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));
    geometry.setAttribute('normal',new T.Float32BufferAttribute(n,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  }
  return geometry;
}

const headSections=[
  [.012,.022,.024,-.024],[.025,.043,.043,-.017],[.047,.063,.066,-.005],
  [.078,.074,.078,.002],[.118,.086,.084,.008],[.153,.084,.087,.011],
  [.182,.084,.090,.010],[.218,.079,.085,.011],[.247,.058,.065,.012],
  [.265,.028,.032,.010],[.272,.001,.002,.009],
];

function faceDepth(x,y,z){
  // Eye sockets, malar plane, brow, bridge, alar cartilage and muzzle belong
  // to one watertight skull surface. No separate cheek or nose spheres.
  let delta=0;
  for(const side of [-1,1]){
    delta+=.0038*bell(x,side*.038,.023)*bell(y,.157,.017);
    delta-=.003*bell(x,side*.042,.035)*bell(y,.179,.013);
    delta-=.0065*bell(x,side*.063,.020)*bell(y,.123,.024);
    delta-=.008*bell(x,side*.012,.009)*bell(y,.112,.009);
  }
  delta-=.015*bell(x,0,.012)*bell(y,.141,.037);
  delta-=.014*bell(x,0,.012)*bell(y,.117,.010);
  delta-=.007*bell(x,0,.035)*bell(y,.080,.023);
  delta-=.003*bell(x,0,.029)*bell(y,.083,.004);
  delta+=.0028*bell(x,0,.026)*bell(y,.077,.002);
  return z+delta;
}

export function facePoint(x,y,offset=0){
  const [w,d,z]=section(headSections,y),cos=-Math.sqrt(Math.max(0,1-(x/w)**2));
  return [x,y,faceDepth(x,y,cos*d+z)-offset];
}

export function headSculpt(){
  return loft(headSections,{segments:72,rows:64,deform:(p,u)=>{
    const front=smooth(clamp((-Math.cos(u*TAU)-.25)/.65));
    p[2]+=(faceDepth(p[0],p[1],p[2])-p[2])*front;return p;
  }});
}

export function eyeSurface(side,{lid=false,upper=true}={}){
  return surface(18,lid?3:6,(u,v)=>{
    const across=(u-.5)*2,x=side*.038+across*.016;
    const arch=Math.sqrt(Math.max(0,1-across*across));
    const center=.158+side*across*.0018;
    const y=lid?center+(upper?1:-1)*arch*(.0039+v*.0028):center+(v-.5)*2*arch*.0041;
    const dome=.0012*(1-across*across)*(1-(2*v-1)**2);
    return facePoint(x,y,lid?.0022:.0014+dome);
  },{flip:!lid||upper});
}

export function eyeDisc(side,radius,offset){
  return surface(24,5,(u,v)=>{
    const theta=u*TAU,r=radius*v,x=side*.038+Math.sin(theta)*r,y=.158+Math.cos(theta)*r;
    return facePoint(x,y,offset+.0007*(1-v*v));
  },{wrap:true,flip:true});
}

export function faceRibbon(points,width){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  return surface(18,2,(u,v)=>{
    const p=curve.getPoint(u);p.y+=(v-.5)*width*Math.sin(Math.PI*u)**.25;
    return facePoint(p.x,p.y,p.z);
  },{flip:points.at(-1)[0]>=points[0][0]});
}

// Each front/back half joins at the side seams to make one wide trouser leg.
// The rolled hem turns inward. Its animated surface remains a volume around
// the knee, rather than two disconnected boards hanging from the pelvis.
export function hakamaPanel(side,front){
  const columns=26,rows=22;
  const geometry=surface(columns,rows,(u,v)=>{
    const fall=1-v,angle=(front<0?Math.PI:0)+(u-.5)*Math.PI;
    const width=.112+.043*Math.sin(Math.PI*fall*.83),depth=.134+.008*Math.sin(fall*Math.PI);
    const crease=Math.sin(angle*8+side*.2)*.009*(.25+.75*fall);
    return [Math.sin(angle)*(width+crease)+side*.004*Math.sin(fall*Math.PI),
      .070-fall*.610+.004*Math.cos(angle*2)*fall,Math.cos(angle)*(depth+crease)];
  });
  const positions=Array.from(geometry.attributes.position.array),uv=Array.from(geometry.attributes.uv.array),indices=Array.from(geometry.index.array);
  const start=positions.length/3;
  for(let i=0;i<=columns;i++){
    const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2],r=Math.hypot(x,z);
    positions.push(x*(1-.003/r),y+.011,z*(1-.003/r));uv.push(i/columns,.018);
  }
  for(let i=0;i<columns;i++)indices.push(i+1,i,start+i,i+1,start+i,start+i+1);
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.deleteAttribute('normal');geometry.computeVertexNormals();
  geometry.userData.restPositions=geometry.attributes.position.array.slice();
  geometry.userData.contactPositions=geometry.attributes.position.array;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

function capsuleOutside(point,a,b,radius,scratch){
  const axis=scratch.axis.copy(b).sub(a),lengthSquared=axis.lengthSq();
  const along=lengthSquared?clamp(scratch.delta.copy(point).sub(a).dot(axis)/lengthSquared):0;
  const closest=scratch.closest.copy(a).addScaledVector(axis,along),delta=scratch.delta.copy(point).sub(closest),distance=delta.length();
  if(distance<radius){
    if(distance<1e-8)delta.set(0,0,1);else delta.multiplyScalar(1/distance);
    point.copy(closest).addScaledVector(delta,radius);
  }
}

// CPU-visible surface posing. The same current vertex array drives draw,
// normals, bounds and contact; no stale rest cache or GPU-only skinning exists.
export function deformHakamaPanel(panel,limb,body,{cloth=0,fall=0,time=0,groundHeightAt}){
  const geometry=panel.mesh?.geometry,rest=geometry?.userData.restPositions;
  if(!rest)return false;
  const s=panel.surfaceScratch||(panel.surfaceScratch={
    hip:new T.Matrix4(),knee:new T.Matrix4(),bindKnee:new T.Matrix4(),bindOffset:new T.Matrix4(),world:new T.Matrix4(),inverse:new T.Matrix4(),
    p:new T.Vector3(),h:new T.Vector3(),k:new T.Vector3(),fixed:new T.Vector3(),worldPoint:new T.Vector3(),gravity:new T.Vector3(),radial:new T.Vector3(),
    hipPoint:new T.Vector3(),kneePoint:new T.Vector3(),anklePoint:new T.Vector3(),axis:new T.Vector3(),delta:new T.Vector3(),closest:new T.Vector3(),sphereWorld:new T.Vector3(),
    worldBox:new T.Box3(),rotation:new T.Quaternion(),hipRotation:new T.Quaternion(),kneeRotation:new T.Quaternion(),mixedRotation:new T.Quaternion(),posedRotation:new T.Quaternion(),
  });
  limb.hip.updateMatrix();limb.knee.updateMatrix();body.updateWorldMatrix(true,false);
  s.hip.copy(limb.hip.matrix);s.knee.multiplyMatrices(s.hip,limb.knee.matrix);
  s.hipRotation.setFromRotationMatrix(s.hip);s.kneeRotation.setFromRotationMatrix(s.knee);
  s.bindKnee.copy(s.knee).multiply(s.bindOffset.makeTranslation(0,-limb.knee.position.y,0));
  s.hipPoint.setFromMatrixPosition(s.hip);s.kneePoint.setFromMatrixPosition(s.knee);
  s.anklePoint.set(0,limb.ankle.position.y,0).applyMatrix4(s.knee);
  s.gravity.set(0,-1,0).applyQuaternion(body.getWorldQuaternion(s.rotation).invert());
  panel.node.rotation.set(0,0,0);panel.node.updateMatrix();
  s.world.multiplyMatrices(body.matrixWorld,panel.node.matrix);s.inverse.copy(s.world).invert();
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    s.p.fromArray(rest,i*3);const depth=Math.max(0,-s.p.y),hem=clamp(depth/.54),hipWeight=smooth(clamp(depth/.19)),kneeWeight=smooth(clamp((depth-.29)/.25));
    if(depth===0){positions.setXYZ(i,rest[i*3],rest[i*3+1],rest[i*3+2]);continue;}
    // Blend the centreline and rotation separately so a sharply folded knee
    // does not collapse a cloth ring as ordinary linear vertex skinning does.
    s.radial.set(s.p.x,0,s.p.z);s.h.set(0,s.p.y,0).applyMatrix4(s.hip);s.k.set(0,s.p.y,0).applyMatrix4(s.bindKnee);
    s.fixed.set(0,s.p.y,0).add(panel.node.position);s.p.copy(s.fixed).lerp(s.h.lerp(s.k,kneeWeight),hipWeight);
    s.mixedRotation.copy(s.hipRotation).slerp(s.kneeRotation,kneeWeight);s.posedRotation.identity().slerp(s.mixedRotation,hipWeight);
    s.p.add(s.radial.applyQuaternion(s.posedRotation));
    // Cloth lags the body and hangs in world gravity. The waist has no drift.
    s.p.z+=cloth*hem*hem*.18;
    s.p.addScaledVector(s.gravity,fall*.045*hem*hem);
    const crease=fall*.009*Math.sin(depth*36+rest[i*3]*31)*hem*hem;
    s.p.x+=crease*panel.side;s.p.z+=Math.sin(time*1.25+rest[i*3]*13)*.003*hem*hem*(1-fall);
    if(depth>.07){capsuleOutside(s.p,s.hipPoint,s.kneePoint,.116,s);capsuleOutside(s.p,s.kneePoint,s.anklePoint,.093,s);}
    s.p.sub(panel.node.position);positions.setXYZ(i,s.p.x,s.p.y,s.p.z);
  }
  geometry.computeBoundingBox();s.worldBox.copy(geometry.boundingBox).applyMatrix4(s.world);
  const maximum=groundHeightAt.maximumInRect?.(s.worldBox.min.x,s.worldBox.min.z,s.worldBox.max.x,s.worldBox.max.z);
  let groundSamples=0;
  if(maximum===undefined||s.worldBox.min.y<maximum+.003){
    for(let i=0;i<positions.count;i++){
      if(rest[i*3+1]>=0)continue; // fixed waist is carried by the body contact solve
      s.worldPoint.fromBufferAttribute(positions,i).applyMatrix4(s.world);
      let touched=false;
      for(let iteration=0;iteration<3;iteration++){
        const floor=groundHeightAt(s.worldPoint.x,s.worldPoint.z)+.003;groundSamples++;
        if(s.worldPoint.y>=floor)break;
        s.worldPoint.y=floor;touched=true;
        // At ground contact, a vertical push alone can drive cloth back into
        // the knee. Move along the floor/capsule intersection instead.
        for(const [a,b,radius] of [[s.hipPoint,s.kneePoint,.116],[s.kneePoint,s.anklePoint,.093]]){
          s.p.copy(s.worldPoint).applyMatrix4(s.inverse).add(panel.node.position);
          s.axis.copy(b).sub(a);const t=clamp(s.delta.copy(s.p).sub(a).dot(s.axis)/s.axis.lengthSq());
          s.closest.copy(a).addScaledVector(s.axis,t);
          if(s.p.distanceToSquared(s.closest)>=radius*radius)continue;
          s.sphereWorld.copy(s.closest).applyMatrix4(body.matrixWorld);
          const dy=s.worldPoint.y-s.sphereWorld.y,needed=Math.sqrt(Math.max(0,radius*radius-dy*dy));
          let dx=s.worldPoint.x-s.sphereWorld.x,dz=s.worldPoint.z-s.sphereWorld.z,d=Math.hypot(dx,dz);
          if(d<1e-8){dx=panel.side;dz=panel.front;d=Math.SQRT2;}
          s.worldPoint.x=s.sphereWorld.x+dx/d*needed;s.worldPoint.z=s.sphereWorld.z+dz/d*needed;
        }
      }
      if(touched){
        s.worldPoint.y=Math.max(s.worldPoint.y,groundHeightAt(s.worldPoint.x,s.worldPoint.z)+.003);groundSamples++;
        s.worldPoint.applyMatrix4(s.inverse);positions.setXYZ(i,s.worldPoint.x,s.worldPoint.y,s.worldPoint.z);
      }
    }
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.contactPositions=positions.array;
  panel.surfaceMetrics={vertices:positions.count,groundSamples};return true;
}

export function clothRibbon(points,width,{steps=20,fray=0}={}){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  return surface(3,steps,(u,v)=>{
    const p=curve.getPoint(v),t=curve.getTangent(v),normal=new T.Vector3(t.y,-t.x,0).normalize();
    const edge=(u-.5)*width*(1-v*.08)+(fray?Math.sin(v*183)*fray*(Math.abs(u-.5)*2)**8:0);
    p.addScaledVector(normal,edge);p.z+=Math.sin(u*Math.PI)*.003;
    return p.toArray();
  },{flip:true});
}

export function breastplate(top,bottom,width,depthOffset=0){
  return surface(24,4,(u,v)=>{
    const x=(u-.5)*width,y=bottom+(top-bottom)*v;
    const curve=Math.sqrt(Math.max(.05,1-(x/(width*.64))**2));
    const bevel=Math.sin(Math.PI*v)**.35*.003;
    return [x,y,-.126-curve*.075-depthOffset-bevel];
  },{flip:true});
}

const tunicProfile=[[-.25,.183,.119,0],[-.18,.204,.140,.005],[-.075,.215,.151,.008],
  [.045,.229,.159,.008],[.157,.247,.146,.006],[.207,.263,.132,.002],[.246,.214,.107,0],[.280,.095,.075,0]];
export function tunicPoint(angle,y){
  const [w,d,z]=section(tunicProfile,y),v=clamp((y+.25)/.53);
  const fold=.006*Math.sin(angle*11+Math.sin(v*5+angle*2)*.42)*Math.sin(Math.PI*v)**.65;
  return [Math.sin(angle)*(w+fold),y,Math.cos(angle)*(d+fold)+z+.009*Math.max(0,Math.cos(angle))*Math.sin(v*Math.PI)];
}
export function tunicSurface(){return loft(tunicProfile,{segments:32,rows:24,fold:.006,folds:11,deform:(p,u,v)=>{p[2]+=.009*Math.max(0,Math.cos(u*TAU))*Math.sin(v*Math.PI);return p;}});}
export function tunicLapel(side,width,offset=0,end=1){
  const path=new T.CatmullRomCurve3([[side*.062,.246,0],[side*.044,.208,0],[side*.008,.156,0],[-side*.048,.096,0]] .map(p=>new T.Vector3(...p)));
  return surface(6,24,(u,v)=>{
    const p=path.getPoint(v*end),t=path.getTangent(v*end),edge=(u-.5)*width;
    p.add(new T.Vector3(t.y,-t.x,0).normalize().multiplyScalar(edge));
    const w=section(tunicProfile,p.y)[0],angle=Math.PI-Math.asin(clamp(p.x/w,-.98,.98));
    p.z=tunicPoint(angle,p.y)[2]-.0025-offset-Math.sin(u*Math.PI)*.001;
    return p.toArray();
  },{flip:true});
}

const sleeveProfile=[[-.335,.082,.075,.002],[-.282,.104,.098,.008],[-.204,.098,.091,.004],
  [-.119,.097,.094,0],[-.025,.104,.101,0],[.025,.086,.083,0],[.052,.060,.057,0],[.073,.025,.023,0],[.081,.001,.001,0]];
function sleevePoint(angle,y,side){
  const [w,d,z]=section(sleeveProfile,y),v=clamp((y+.335)/.416);
  const fold=.004*Math.sin(angle*8+side+Math.sin(v*5+angle*2)*.42)*Math.sin(Math.PI*v)**.65;
  return [Math.sin(angle)*(w+fold),y,Math.cos(angle)*(d+fold)+z];
}
export function upperSleeve(side){return loft(sleeveProfile,{segments:32,rows:26,fold:.004,folds:8,phase:side});}

// Give a thin fitted patch an inner face and an actual narrow edge. The
// perimeter is closed; it does not appear as an unsupported open hoop.
export function shellSurface(outer,thickness=.002){
  const p=outer.attributes.position,n=outer.attributes.normal,uv=outer.attributes.uv,count=p.count;
  const positions=Array.from(p.array),uvs=Array.from(uv.array),indices=Array.from(outer.index.array),edges=new Map();
  for(let i=0;i<count;i++){positions.push(p.getX(i)-n.getX(i)*thickness,p.getY(i)-n.getY(i)*thickness,p.getZ(i)-n.getZ(i)*thickness);uvs.push(uv.getX(i),uv.getY(i));}
  for(let i=0;i<outer.index.count;i+=3){
    const a=outer.index.getX(i),b=outer.index.getX(i+1),c=outer.index.getX(i+2);indices.push(c+count,b+count,a+count);
    for(const [from,to] of [[a,b],[b,c],[c,a]]){const key=from<to?`${from}:${to}`:`${to}:${from}`;if(edges.has(key))edges.get(key).count++;else edges.set(key,{a:from,b:to,count:1});}
  }
  for(const {a,b,count:n} of edges.values())if(n===1)indices.push(b,a,a+count,b,a+count,b+count);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();outer.dispose();return geometry;
}
export function shoulderPlate(side,row){
  return shellSurface(surface(24,5,(u,v)=>{
    const angle=side*Math.PI/2+(u-.5)*2.60,y=.039-row*.044-v*.047-Math.sin((u-.5)*Math.PI)**2*.007;
    const p=sleevePoint(angle,y,side),raise=.0032+Math.sin(v*Math.PI)*.0008;
    p[0]+=Math.sin(angle)*raise;p[2]+=Math.cos(angle)*raise;return p;
  },{flip:true}),.002);
}

const knotProfile=[[.249,.013,.014,.041],[.263,.024,.022,.042],[.283,.030,.026,.039],[.302,.020,.018,.029],[.313,.001,.001,.020]];
export function tiedHair(){return loft(knotProfile,{segments:28,rows:20,fold:.0007,folds:9});}
export function hairTie(){
  return surface(28,3,(u,v)=>{const y=.260+v*.006,[w,d,z]=section(knotProfile,y),a=u*TAU;return [Math.sin(a)*(w+.0008),y,Math.cos(a)*(d+.0008)+z];},{wrap:true});
}

export function hairCap(){
  return surface(48,24,(u,v)=>{
    const theta=u*TAU,front=Math.max(0,-Math.cos(theta));
    // Hairline rises over the brow, recedes at temples, and descends at nape.
    const end=1.90-front*.50-Math.abs(Math.sin(theta))*.08;
    const phi=.012+v*end,strand=Math.sin(theta*34+phi*5)*.0012*Math.sin(phi);
    const x=Math.sin(theta)*Math.sin(phi)*(.091+strand);
    const y=.181+Math.cos(phi)*.096;
    const z=.014+Math.cos(theta)*Math.sin(phi)*(.103+strand);
    return [x,y,z];
  },{wrap:true,flip:true});
}

export function scalpLock(side,sector){
  const starts=[.20,.48,.57],ends=[1.51,1.87,2.02],angles=[.45,1.02,2.02];
  return surface(5,18,(u,v)=>{
    const taper=Math.sin(Math.PI*(v*.93+.035))**.45;
    const theta=Math.PI-side*(angles[sector]+.16*Math.sin(v*Math.PI)+(u-.5)*.20*taper);
    const phi=starts[sector]+v*(ends[sector]-starts[sector]);
    const raised=.0015+.002*Math.sin(u*Math.PI)*taper;
    return [Math.sin(theta)*Math.sin(phi)*(.092+raised),
      .181+Math.cos(phi)*(.097+raised),.014+Math.cos(theta)*Math.sin(phi)*(.104+raised)];
  },{flip:side<0});
}

export function earSculpt(side){
  return surface(16,16,(u,v)=>{
    const angle=u*TAU,radial=v,outline=.83+.17*Math.sin(angle);
    const y=.134+Math.sin(angle)*.031*radial;
    const z=.004+Math.cos(angle)*.018*radial*outline;
    const x=side*(.089+.010*radial+.007*bell(radial,.80,.17)-.004*bell(radial,.35,.25));
    return [x,y,z];
  },{flip:side<0});
}

export function handSculpt(side){
  // Palm follows metacarpal breadth, narrows at the wrist and has a thenar
  // slope; fingers curl around the existing exact sword-local grip axis.
  return loft([[-.064,.025,.020,-.002],[-.047,.037,.025,.003],[-.012,.044,.032,.005],
    [.026,.035,.028,.005],[.056,.027,.023,.005]],{segments:22,rows:16,deform:p=>{
    p[0]+=side*.006*bell(p[1],-.008,.035);return p;
  }});
}

export function fingerSculpt(index,side){
  const lengths=[.067,.074,.070,.055],length=lengths[index],x=(index-1.5)*.020;
  const curve=new T.CatmullRomCurve3([
    new T.Vector3(x,-.027,.004),new T.Vector3(x,-.045,-.019),
    new T.Vector3(x,-.018-length*.35,-.035),new T.Vector3(x,-.010,-.032),
  ]);
  const geometry=new T.TubeGeometry(curve,12,.009-index*.00045,7,false);
  // Keep the thumb side consistent with each handed palm.
  geometry.userData.handedness=side;return geometry;
}

export function footSculpt({sole=false,side=1}={}){
  return surface(28,16,(u,v)=>{
    const angle=u*TAU,z=.075-v*.260;
    const width=(.047+.019*bell(v,.70,.25))*(.20+.80*Math.sin(Math.PI*v)**.22);
    const height=sole?.012:.022+.025*bell(v,.26,.23);
    const centre=sole?-.074:-.063+height;
    const x=Math.sin(angle)*width+side*.003*bell(v,.75,.3);
    return [x,centre+Math.cos(angle)*height,z];
  },{wrap:true});
}

export function createSurfaceTextures(){
  const maps={};
  for(const kind of ['cloth','leather','metal','skin','hair','cord']){
    const size=kind==='skin'?256:128,color=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=(y*size+x)*4,u=x/size,v=y/size;
      let seed=(Math.imul(x+11,374761393)+Math.imul(y+37,668265263))|0;
      seed=Math.imul(seed^(seed>>>13),1274126177);
      const noise=((seed^(seed>>>16))>>>0)/4294967295;
      const cloud=Math.sin(u*TAU*3+Math.sin(v*TAU*2))*.5+Math.cos(v*TAU*5-u*TAU)*.22;
      let c=.90,h=.5,r=.90,red=1,green=1,blue=1;
      if(kind==='cloth'){
        const warp=Math.sin(x*Math.PI/2),weft=Math.sin(y*Math.PI/2),thread=(warp+weft)*.5;
        c=.85+cloud*.065+noise*.05+thread*.025;h=.5+thread*.18+noise*.09;r=.84+noise*.13;
      }else if(kind==='leather'){
        h=.45+noise*.25+Math.sin(u*TAU*23+Math.sin(v*TAU*17))*.08;c=.78+cloud*.10+noise*.10;r=.65+noise*.22;
      }else if(kind==='metal'){
        const scratch=Math.sin(v*800+Math.sin(u*38))>.97?.08:0;
        c=.84+cloud*.055+noise*.06+scratch;h=.45+noise*.11;r=.52+noise*.17-scratch;
      }else if(kind==='hair'){
        const strand=Math.sin(u*TAU*44+Math.sin(v*8)*.6);
        c=.82+strand*.035+noise*.025;h=.5+strand*.08;r=.87+noise*.06;
      }else if(kind==='cord'){
        const twist=Math.sin((u*14+v*31)*TAU);c=.86+twist*.06+noise*.07;h=.5+twist*.22;r=.85;
      }else{
        // Anatomical colour is painted in this head's own cylindrical UVs.
        const theta=u*TAU,yy=.012+v*.26,[w]=section(headSections,yy),xx=Math.sin(theta)*w;
        const front=smooth(clamp((-Math.cos(theta)-.25)/.65));
        const cheek=(bell(xx,.06,.023)+bell(xx,-.06,.023))*bell(yy,.12,.025)*front;
        const socket=(bell(xx,.038,.025)+bell(xx,-.038,.025))*bell(yy,.157,.012)*front;
        const stubble=bell(yy,.060,.035)*front*(.4+noise*.6);
        c=.94+noise*.022-socket*.035-stubble*.04;red=1+cheek*.055;green=1-cheek*.035;blue=1-cheek*.04;
        h=.48+noise*.075;r=.80+noise*.10-cheek*.05;
      }
      color.set([clamp(c*red)*255,clamp(c*green)*255,clamp(c*blue)*255,255],i);
      height.set([h*255,h*255,h*255,255],i);rough.set([r*255,r*255,r*255,255],i);
    }
    function texture(data,srgb=false){
      const map=new T.DataTexture(data,size,size,T.RGBAFormat);map.wrapS=map.wrapT=T.RepeatWrapping;
      map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;
      if(srgb)map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;return map;
    }
    maps[kind]={map:texture(color,true),bumpMap:texture(height),roughnessMap:texture(rough)};
    if(kind==='cloth'){
      maps[kind].bumpMap.repeat.set(6,10);
      maps[kind].roughnessMap.repeat.set(4,4);
    }
  }
  return maps;
}
