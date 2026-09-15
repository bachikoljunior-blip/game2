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

// Draped panels have curved hems and a cross-section of broad pleats with
// narrow valleys. The waist stays fixed; silhouette narrows between the legs.
export function hakamaPanel(side,front){
  return surface(26,22,(u,v)=>{
    const fall=1-v,width=.226+fall*.028;
    const x=(u-.5)*width+side*fall*.012;
    const crease=Math.sin(u*Math.PI*7+.25)*.010*(.35+.65*fall);
    const broad=.032*Math.cos((u-.5)*Math.PI);
    const z=front*(broad+crease+fall*.012+Math.sin(fall*4+u*2)*.006);
    const y=-fall*(.465+.017*Math.cos(u*Math.PI*2))-.012*Math.sin(u*Math.PI);
    return [x,y,z];
  },{flip:front<0});
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

export function shoulderPlate(side,row){
  return surface(20,4,(u,v)=>{
    const angle=(u-.5)*Math.PI*1.22,radius=.096+row*.003+Math.sin(v*Math.PI)*.003;
    const x=side*(.014+Math.cos(angle)*radius),z=Math.sin(angle)*radius*1.12;
    const y=.043-row*.045-v*.046-Math.sin(angle)**2*.017;
    return [x,y,z];
  },{flip:side<0});
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
