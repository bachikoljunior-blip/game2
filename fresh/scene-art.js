import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shrineBaseSize} from './terrain.js';
import {createLitterTexture,installGroundLitter,groundSurfaceAt} from './scene-surface.js';

// Original boot-built scenery. All coordinates below are decorative; the
// simulation, terrain samples and authored route remain their sole owners.
const fract=x=>x-Math.floor(x);
const hash=(x,z,seed=0)=>fract(Math.sin(x*127.1+z*311.7+seed*73.9)*43758.5453);
const smooth=t=>t*t*(3-2*t);
function noise(x,z,seed=0){
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(fract(x)),v=smooth(fract(z));
  const a=hash(ix,iz,seed),b=hash(ix+1,iz,seed),c=hash(ix,iz+1,seed),d=hash(ix+1,iz+1,seed);
  return T.MathUtils.lerp(T.MathUtils.lerp(a,b,u),T.MathUtils.lerp(c,d,u),v);
}
function grainTexture(kind){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const fine=hash(x,y,17),patch=noise(x/21,y/21,4),micro=noise(x/3,y/3,9);
    let shade=.70+fine*.14+patch*.10+micro*.06;
    if(kind==='wood'){
      const fiber=Math.sin(x*.68+noise(x/38,y/58,5)*9+y*.025);
      shade=.65+noise(x/3,y/83,4)*.17+fine*.06+Math.abs(fiber)*.10;
    }else if(kind==='soil')shade=.75+patch*.09+micro*.10+fine*.06;
    else if(kind==='roof')shade=.79+patch*.10+fine*.06;
    const i=(y*size+x)*4,c=Math.round(shade*255);
    data[i]=c;data[i+1]=c;data[i+2]=c;data[i+3]=255;
  }
  const texture=new T.DataTexture(data,size,size,T.RGBAFormat);
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;
  texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
function material(color,texture,{bump=.02,roughness=.92,vertexColors=true}={}){
  return new T.MeshStandardMaterial({color,map:texture,bumpMap:texture,bumpScale:bump,roughness,vertexColors});
}
function colored(geometry,seed=0,variation=.06){
  const g=geometry.index?geometry.toNonIndexed():geometry;
  if(g!==geometry)geometry.dispose();
  const p=g.attributes.position,colors=[];
  for(let i=0;i<p.count;i+=3){
    const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
    const tone=1-variation+noise(x*1.4,z*1.4,seed)*variation*2;
    for(let j=0;j<3;j++)colors.push(tone,tone*.993,tone*.974);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));return g;
}
function surface(vertices,indices,seed=0){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);
  const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]*.8,vertices[i+2]*.8+vertices[i+1]*.6);
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return colored(flat,seed,.09);
}
// A closed weathered foot extends below the real ground while retaining exact
// collider coverage. Color matching alone cannot establish ground contact. Above
// it, irregular fracture cells make real ledges, bevels and recessed joints;
// the front/back emerge from the soil instead of closing as a tall flat cap.
export function ridgeSections(fork){
  const rows=9,columns=4,hx=fork.w/2,hz=fork.d/2,seeds=[],parts=Array.from({length:rows},()=>[]);
  const masses=[[-.42,-3.15,1.63,2.0,1.25],[.36,-1.25,2.02,2.15,2.18],[-.30,1.04,1.95,2.05,2.46],[.40,3.25,1.70,1.75,1.44]];
  const height=(x,z)=>{
    const px=x-fork.x,pz=z-fork.z;let body=0;
    for(const [cx,cz,rx,rz,h] of masses){
      const radius=Math.pow(Math.abs((px-cx)/rx),1.65)+Math.pow(Math.abs((pz-cz)/rz),1.65);
      body=Math.max(body,h*Math.pow(Math.max(0,1-radius),.63));
    }
    const buried=T.MathUtils.smoothstep(hx-Math.abs(px),0,.32)*T.MathUtils.smoothstep(hz-Math.abs(pz),0,.30);
    return .055+body*buried;
  };
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
    seeds.push({x:fork.x-hx+(c+.28+hash(r,c,37)*.44)*fork.w/columns,
      z:fork.z-hz+(r+.26+hash(r,c,41)*.48)*fork.d/rows,row:r,id:r*columns+c});
  }
  const clip=(polygon,nx,nz,d)=>{
    const result=[];for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a[0]*nx+a[1]*nz-d,db=b[0]*nx+b[1]*nz-d;
      if(da<=1e-9)result.push(a);
      if((da<0)!==(db<0)){const t=da/(da-db);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }return result;
  };
  // Close every strip through y=0 into the ground. The former open top strips
  // and cell bases all began at +.055, leaving an actual 5.5 cm air gap.
  for(let r=0;r<rows;r++){
    const a=fork.z-hz+r/rows*fork.d,b=fork.z-hz+(r+1)/rows*fork.d;
    const v=[],f=[0,2,1,0,3,2,4,5,6,4,6,7];
    for(const y of [.055,-.08])v.push(fork.x-hx,y,a,fork.x+hx,y,a,fork.x+hx,y,b,fork.x-hx,y,b);
    for(let i=0;i<4;i++){const next=(i+1)%4;f.push(i,next,i+4,next,next+4,i+4);}
    parts[r].push(surface(v,f,r));
  }
  for(const seed of seeds){
    let polygon=[[fork.x-hx,fork.z-hz],[fork.x+hx,fork.z-hz],[fork.x+hx,fork.z+hz],[fork.x-hx,fork.z+hz]];
    for(const other of seeds){if(other===seed)continue;
      const nx=other.x-seed.x,nz=other.z-seed.z,d=(other.x*other.x+other.z*other.z-seed.x*seed.x-seed.z*seed.z)/2;
      polygon=clip(polygon,nx,nz,d);if(!polygon.length)break;
    }
    const cx=polygon.reduce((sum,p)=>sum+p[0],0)/polygon.length,cz=polygon.reduce((sum,p)=>sum+p[1],0)/polygon.length;
    const h=height(cx,cz)+(hash(seed.id,3,13)-.5)*.34;
    const slopeX=(height(cx+.12,cz)-height(cx-.12,cz))/.24+(hash(seed.id,7)-.5)*.38;
    const slopeZ=(height(cx,cz+.12)-height(cx,cz-.12))/.24+(hash(seed.id,5)-.5)*.32;
    const top=(x,z)=>T.MathUtils.clamp(Math.min(h+(x-cx)*slopeX+(z-cz)*slopeZ,height(x,z)+.12),.085,fork.h-.12);
    const v=[],f=[],n=polygon.length;
    for(let ring=0;ring<3;ring++)for(let i=0;i<n;i++){
      const p=polygon[i],inset=ring===0?1:ring===1?.984+hash(seed.id,i,19)*.013:.82+hash(seed.id,i,52)*.12;
      const x=cx+(p[0]-cx)*inset,z=cz+(p[1]-cz)*inset;
      v.push(x,ring===0?-.08:Math.max(.06,top(x,z)-(ring===1?.04+hash(seed.id,i,8)*.10:0)),z);
    }
    for(let ring=0;ring<2;ring++)for(let i=0;i<n;i++){
      const a=ring*n+i,b=ring*n+(i+1)%n,d=(ring+1)*n+i,e=(ring+1)*n+(i+1)%n;
      f.push(a,d,b,b,d,e);
    }
    v.push(cx,top(cx,cz),cz);for(let i=0;i<n;i++)f.push(3*n,2*n+(i+1)%n,2*n+i);
    const g=surface(v,f,seed.id+6),p=g.attributes.position,colors=g.attributes.color;
    // Soil staining grows from the actual buried foot; fracture tops retain
    // pale mineral faces instead of every triangle receiving arbitrary color.
    for(let i=0;i<p.count;i++){
      const contact=1-T.MathUtils.smoothstep(p.getY(i),.06,.42),tone=1-contact*.21;
      colors.setXYZ(i,colors.getX(i)*tone,colors.getY(i)*tone,colors.getZ(i)*tone*(1-contact*.055));
    }
    parts[seed.row].push(g);
  }
  const groundTint=new T.Color('#c3beb0'),rockTint=new T.Color('#777d70'),contactColor=new T.Color();
  return parts.map(geometries=>{
    const g=mergeGeometries(geometries);geometries.forEach(part=>part.dispose());
    const p=g.attributes.position,c=g.attributes.color;
    for(let i=0;i<p.count;i++){
      const blend=1-T.MathUtils.smoothstep(p.getY(i),.06,.28);if(!blend)continue;
      groundSurfaceAt(p.getX(i),p.getZ(i),contactColor);contactColor.multiply(groundTint);
      c.setXYZ(i,T.MathUtils.lerp(c.getX(i),contactColor.r/rockTint.r,blend),T.MathUtils.lerp(c.getY(i),contactColor.g/rockTint.g,blend),T.MathUtils.lerp(c.getZ(i),contactColor.b/rockTint.b,blend));
    }return g;
  });
}
export function pavingStoneGeometry(width,depth,height=.055,seed=0){
  const hx=width/2,hz=depth/2,cut=.045+hash(seed,1)*.065;
  const outline=[[-hx+width*cut,-hz], [hx-width*(cut+.04),-hz], [hx,-hz+depth*(cut+.015)],
    [hx,hz-depth*(cut+.05)], [hx-width*(cut+.06),hz],[-hx+width*cut,hz],[-hx,hz-depth*cut],[-hx,-hz+depth*(cut+.025)]];
  for(let i=0;i<outline.length;i++){outline[i][0]+=(hash(seed,i,6)-.5)*width*.045;outline[i][1]+=(hash(seed,i,4)-.5)*depth*.025;}
  const v=[],f=[];
  for(let ring=0;ring<3;ring++)for(let i=0;i<8;i++){
    const [x,z]=outline[i],inset=ring===2?.91:1;
    v.push(x*inset,ring===0?-height/2:ring===1?height/2-.012:height/2+(hash(seed,i,8)-.5)*.005,z*(ring===2?.983:1));
  }
  for(let ring=0;ring<2;ring++)for(let i=0;i<8;i++){
    const n=(i+1)%8,a=ring*8+i,b=ring*8+n,c=(ring+1)*8+i,d=(ring+1)*8+n;f.push(a,c,b,b,c,d);
  }
  v.push(0,height/2,0);for(let i=0;i<8;i++)f.push(24,16+(i+1)%8,16+i);
  return surface(v,f,seed);
}
function roofHeight(t){return 6.52-2.08*t+.44*t*t*t*t;}
function roofSheet(side,underside=false){
  const cols=24,rows=12,v=[],f=[];
  for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
    const t=r/rows,x=-5.95+c/cols*11.9;
    v.push(x,roofHeight(t)-(underside?.17:0)+Math.pow(Math.abs(x)/5.95,7)*.11*t,-23+side*t*4.65);
  }
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const a=r*(cols+1)+c,b=a+1,d=a+cols+1,e=d+1;
    if((side===1)!==underside)f.push(a,d,b,b,d,e);else f.push(a,b,d,b,e,d);
  }
  // Smooth roof curvature; tile caps carry the smaller profile.
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(f);
  const uv=[];for(let i=0;i<v.length;i+=3)uv.push(v[i]*.9,v[i+2]*.9);
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();return colored(g,3,.025);
}
export function createSceneArt(scene,foreground){
  const started=performance.now(),textures={stone:grainTexture('stone'),wood:grainTexture('wood'),soil:grainTexture('soil'),roof:grainTexture('roof')};
  const mats={rock:material('#777d70',textures.stone,{bump:.035}),paving:material('#aaa492',textures.stone,{bump:.012}),
    foundation:material('#7c8077',textures.stone),wood:material('#665342',textures.wood),timber:material('#4d3930',textures.wood),
    lacquer:material('#703e2d',textures.wood,{bump:.006,roughness:.79}),roof:material('#485454',textures.roof,{bump:.008}),
    roofEdge:material('#59615c',textures.roof,{bump:.012})};
  const ground=material('#c3beb0',textures.soil,{vertexColors:true,bump:.008});ground.map.repeat.set(80,100);
  const litter=createLitterTexture();installGroundLitter(ground,litter);
  const groups=new Map(),metrics={vertices:0,triangles:0,meshes:0,ridgeSections:0,pavingStones:0,pavingPieces:0,generatedTextureBytes:5*256*256*4,litterTextureBytes:litter.image.data.byteLength};
  let cpuMs=performance.now()-started;
  const transform=(g,x,y,z,sx=1,sy=1,sz=1,ry=0)=>g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromAxisAngle(T.Object3D.DEFAULT_UP,ry),new T.Vector3(sx,sy,sz)));
  const queue=(g,mat)=>{if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(g);};
  const box=(mat,x,y,z,w,h,d,ry=0)=>queue(colored(transform(new T.BoxGeometry(w,h,d),x,y,z,1,1,1,ry),x+z,.035),mat);
  const beam=(mat,a,b,width,depth=width)=>{
    const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from);
    const g=new T.BoxGeometry(width,delta.length(),depth);
    g.applyMatrix4(new T.Matrix4().compose(from.add(to).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(T.Object3D.DEFAULT_UP,delta.normalize()),new T.Vector3(1,1,1)));
    queue(colored(g,4,.03),mat);
  };
  const addMesh=(g,mat,name,fade=false)=>{
    const mesh=new T.Mesh(g,mat);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;
    if(fade)foreground.add(mesh,{id:name});scene.add(mesh);
    metrics.vertices+=g.attributes.position.count;metrics.triangles+=(g.index?g.index.count:g.attributes.position.count)/3;metrics.meshes++;
    return mesh;
  };
  function addRidge(fork){
    const meshes=ridgeSections(fork).map((g,i)=>addMesh(g,mats.rock,`route-rock-stratum-${i}`,true));
    metrics.ridgeSections=meshes.length;return meshes;
  }
  function addPaver(x,y,z,width,depth,rotation){
    const seed=x*17+z*3,split=hash(seed,8)<.52;
    const pieces=split?[[.36+hash(seed,3)*.28,0]]:[[1,0]];
    if(split){const first=pieces[0][0];pieces[0][1]=(first-1)*depth/2;pieces.push([1-first,first*depth/2]);}
    for(const [fraction,offset] of pieces){
      const g=pavingStoneGeometry(width,depth*fraction-(split?.026:0),.055,seed+offset*19);
      queue(transform(g,x+Math.sin(rotation)*offset,y,z+Math.cos(rotation)*offset,1,1,1,rotation),mats.paving);metrics.pavingPieces++;
    }
    metrics.pavingStones++;
  }
  function addShrine(o){
    const base=shrineBaseSize(o),front=o.z+o.d/2;
    // Base stays entirely inside the physics rectangle; mortar is recessed.
    box(mats.timber,o.x,.27,o.z,base.width-.015,base.height-.02,base.depth-.015);
    for(let row=0;row<2;row++)for(let col=0;col<10;col++){
      const x=o.x-base.width/2+(col+.5)*base.width/10;
      box(mats.foundation,x,.135+row*.27,front-.12,.96,.247,.23);
    }
    box(mats.wood,o.x,2.49,o.z,o.w-.24,3.85,o.d-.24);
    // Exposed side walls carry broad horizontal boards and posts, at their
    // own construction scale instead of a single unarticulated box face.
    for(const side of [-1,1]){
      const x=side*4.90;
      for(let row=0;row<15;row++)box(mats.wood,x,.78+row*.235,-23,.065,.222,6.79);
      for(const z of [-26.35,-24.68,-23,-21.32,-19.65])box(mats.timber,x+side*.045,2.49,z,.12,3.72,.14);
      for(const y of [.64,4.30])box(mats.timber,x+side*.05,y,-23,.12,.17,6.89);
      for(let row=0;row<9;row++){
        const y=4.53+row*.19,half=(6.36-y)/1.97*3.40;
        if(half>.1)box(mats.wood,x+side*.012,y,-23,.05,.179,half*2);
      }
    }
    // Horizontal sill/lintel and actual panel bays establish load-bearing order.
    for(const y of [.7,1.25,3.75,4.32])box(mats.timber,0,y,front-.03,9.9,y===4.32?.26:.14,.19);
    for(let bay=0;bay<5;bay++){
      const center=-4+bay*2;
      for(let plank=0;plank<8;plank++){
        const x=center-.83+plank*.237;
        box(mats.wood,x,.98,front+.005,.22,.47,.075);
      }
      // Dark recess is behind the lattice; it is not a painted flat pattern.
      box(mats.timber,center,2.46,front+.016,1.73,2.36,.06);
      for(let slat=0;slat<9;slat++)box(mats.wood,center-.8+slat*.2,2.47,front+.065,.035,2.31,.05);
      for(let slat=0;slat<6;slat++)box(mats.wood,center,1.53+slat*.37,front+.092,1.68,.032,.045);
    }
    for(let x=-4.9;x<=4.91;x+=1.96){
      box(mats.lacquer,x,2.5,front+.07,.20,3.85,.24);
      box(mats.timber,x,4.40,front+.14,.42,.13,.44);
      beam(mats.timber,[x,4.04,front+.08],[x,4.51,front+.52],.13,.14);
    }
    for(const side of [-1,1]){
      queue(roofSheet(side),mats.roof);queue(roofSheet(side,true),mats.timber);
      // Continuous fascia follows the eave. End boards close the roof thickness.
      beam(mats.roofEdge,[-5.98,roofHeight(1)-.05,-23+side*4.65],[5.98,roofHeight(1)-.05,-23+side*4.65],.16,.16);
      for(const x of [-5.95,5.95])for(let r=0;r<12;r++){
        const t=r/12,u=(r+1)/12;
        beam(mats.timber,[x,roofHeight(t)-.08,-23+side*t*4.65],[x,roofHeight(u)-.08,-23+side*u*4.65],.16,.19);
      }
      // Low half-round tile seams carry a repeated construction scale without
      // turning the whole roof into stacked slabs or hundreds of draw calls.
      for(let r=1;r<=9;r++){
        const t=r/10;beam(mats.roof,[-5.90,roofHeight(t)+.022,-23+side*t*4.65],[5.90,roofHeight(t)+.022,-23+side*t*4.65],.019,.028);
      }
      for(let x=-5.7;x<=5.71;x+=.38)for(let r=0;r<10;r++){
        const t=r/10,u=(r+1)/10,a=new T.Vector3(x,roofHeight(t)+.025,-23+side*t*4.65),b=new T.Vector3(x,roofHeight(u)+.025,-23+side*u*4.65),delta=b.clone().sub(a);
        const tile=new T.CylinderGeometry(.045,.054,delta.length()+.008,5,1,true,0,Math.PI);
        tile.applyMatrix4(new T.Matrix4().compose(a.add(b).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(T.Object3D.DEFAULT_UP,delta.normalize()),new T.Vector3(1,1,1)));
        queue(colored(tile,x+r,.035),mats.roofEdge);
      }
      // Under-eave rafters have visible ends and stop at the wall plate.
      for(let x=-5.5;x<=5.51;x+=.55)beam(mats.timber,[x,4.87,-23+side*3.35],[x,4.79,-23+side*4.60],.08,.105);
    }
    box(mats.roofEdge,0,6.57,-23,11.92,.18,.28);
    box(mats.roof,0,6.71,-23,11.78,.10,.19);
    // Triangular timber gable ends fill the space beneath the roof at both sides.
    for(const x of [-4.90,4.90]){
      const v=[x,4.39,-26.43,x,6.36,-23,x,4.39,-19.57];
      const g=surface(v,x<0?[0,2,1]:[0,1,2],3);queue(g,mats.wood);
      beam(mats.timber,[x,4.45,-26.44],[x,6.38,-23],.13,.14);
      beam(mats.timber,[x,6.38,-23],[x,4.45,-19.56],.13,.14);
    }
  }
  function addOutcrop(x,y,z,sx,sy,sz,rotation){
    const g=new T.IcosahedronGeometry(1,1),p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const px=p.getX(i),py=p.getY(i),pz=p.getZ(i),shear=noise(px*3,pz*3,12);
      p.setXYZ(i,px*(.92+shear*.14)+py*.12,py*(py>0?.84:1),pz*(.9+shear*.18));
    }
    g.computeVertexNormals();queue(colored(transform(g,x,y,z,sx,sy,sz,rotation),x+z,.06),mats.rock);
  }
  function finish(){
    const finishStarted=performance.now();
    for(const [mat,geometries] of groups){const g=mergeGeometries(geometries);g.computeBoundingSphere();addMesh(g,mat,`scene-art-${Object.keys(mats).find(k=>mats[k]===mat)}`);geometries.forEach(part=>part.dispose());}
    cpuMs+=performance.now()-finishStarted;metrics.generationCpuMs=cpuMs;scene.userData.sceneArt={...metrics};return {...metrics};
  }
  const timed=fn=>(...args)=>{const before=performance.now();const result=fn(...args);cpuMs+=performance.now()-before;return result;};
  return {ground,addRidge:timed(addRidge),addPaver:timed(addPaver),addShrine:timed(addShrine),addOutcrop:timed(addOutcrop),finish,metrics};
}
