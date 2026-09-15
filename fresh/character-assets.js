import * as T from 'three';
import nativeData from './character-assets/native-data.js';

// These are imported CC0 production assets, not procedurally generated art.
// The source OBJ, UVs, targets, fitting data and all-influence hand bake remain
// reproducible in character-assets/source and character-tools/derive-mpfb.mjs.
export const CHARACTER_ASSET_INFO=Object.freeze({source:nativeData.source,license:nativeData.license,
  textureCount:4,geometry:'static head-neck and posed hands; native eye/hair/eyebrow fitting',
  skin:'young_asian_male / diffuse only',eyes:'Low-Poly / brown',hair:'short04 with original tied knot'});

export function nativeGeometry(data){
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(data.position,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(data.normal,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));
  if(data.color)geometry.setAttribute('color',new T.Float32BufferAttribute(data.color,3));
  geometry.setIndex(data.index);
  geometry.userData.sourceVertex=data.sourceVertex;
  geometry.userData.assetLicense='CC0-1.0';
  return geometry;
}
export function nativeFigure(id){return nativeData.figures[id]||nativeData.figures.sentinel;}
export function nativeHand(side){return nativeData.hands[side<0?'left':'right'];}

export function nativeCollar(data){
  const position=[],normal=[],uv=[],edges=new Map();
  const vertex=i=>({p:new T.Vector3(...data.position.slice(i*3,i*3+3)),
    n:new T.Vector3(...data.normal.slice(i*3,i*3+3)),uv:new T.Vector2(...data.uv.slice(i*2,i*2+2))});
  const append=corner=>{position.push(...corner.p.toArray());normal.push(...corner.n.toArray());uv.push(...corner.uv.toArray());};
  const signed=p=>p.p.y-(.013-.038*Math.max(0,-p.p.z/.09)*Math.max(0,1-Math.abs(p.p.x)/.075));
  for(let n=0;n<data.index.length;n+=3){
    const ids=data.index.slice(n,n+3);
    for(let j=0;j<3;j++){
      const a=ids[j],b=ids[(j+1)%3],sa=data.sourceVertex[a],sb=data.sourceVertex[b],key=sa<sb?`${sa}:${sb}`:`${sb}:${sa}`;
      if(edges.has(key))edges.get(key).count++;else edges.set(key,{a,b,count:1});
    }
    let polygon=ids.map(vertex);
    const clipped=[];
    for(let j=0;j<polygon.length;j++){
      const a=polygon[j],b=polygon[(j+1)%polygon.length],fa=signed(a),fb=signed(b);
      if(fa<=0)clipped.push(a);
      if((fa<=0)!==(fb<=0)){
        const t=fa/(fa-fb);clipped.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.clone().lerp(b.uv,t)});
      }
    }
    polygon=clipped;
    for(let j=1;j<polygon.length-1;j++)for(const corner of [polygon[0],polygon[j],polygon[j+1]]){
      position.push(...corner.p.clone().addScaledVector(corner.n,.0035).toArray());normal.push(...corner.n.toArray());uv.push(...corner.uv.toArray());
    }
  }
  // Extend the actual lower cut into the shirt. Merely copying the neck band
  // leaves a floating ring because the anatomical cut is wider than the top
  // of the old shirt. Source vertex IDs join UV seams before finding edges.
  for(const edge of edges.values())if(edge.count===1){
    const a=vertex(edge.a),b=vertex(edge.b);
    if(Math.max(a.p.y,b.p.y)>.025)continue;
    for(const c of [a,b])c.p.addScaledVector(c.n,.0035);
    const lower=c=>({p:new T.Vector3(c.p.x*1.2,c.p.y-.045,c.p.z*1.2),n:c.n.clone(),uv:c.uv.clone().add(new T.Vector2(0,-.04))});
    const al=lower(a),bl=lower(b);
    for(const c of [b,a,al,b,al,bl])append(c);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normal,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));return geometry;
}

export function createNativeCharacterResources({textureLoader}={}){
  const skin=new T.MeshStandardMaterial({color:'#ffffff',roughness:.74,metalness:0});skin.name='mpfb-cc0-skin';
  const eyes=new T.MeshStandardMaterial({color:'#ffffff',roughness:.29,metalness:0,vertexColors:true});eyes.name='mpfb-cc0-eyes';
  const hair=new T.MeshStandardMaterial({color:'#ffffff',roughness:.86,metalness:0,side:T.DoubleSide,alphaTest:.42});hair.name='mpfb-cc0-hair';
  const brows=new T.MeshStandardMaterial({color:'#ffffff',roughness:.96,metalness:0,side:T.DoubleSide,alphaTest:.35,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});brows.name='mpfb-cc0-eyebrows';brows.userData.castShadow=false;
  const resources={skin,eyes,hair,brows,state:'loading',pendingCount:4,readyCount:0,failedCount:0,error:null,ready:null,info:CHARACTER_ASSET_INFO};
  // Node geometry/animation tests do not decode browser images. They must not
  // advertise a successful texture load or attempt to access a fake document.
  if(!textureLoader&&typeof document==='undefined'){
    resources.state='geometry-only';resources.pendingCount=0;resources.ready=Promise.resolve(resources);return resources;
  }
  const loader=textureLoader||new T.TextureLoader();
  const assets=[
    [skin,new URL('./character-assets/textures/young-asian-male.png',import.meta.url).href],
    [eyes,new URL('./character-assets/textures/brown-eye.png',import.meta.url).href],
    [hair,new URL('./character-assets/textures/short-hair.png',import.meta.url).href],
    [brows,new URL('./character-assets/textures/eyebrows.png',import.meta.url).href],
  ];
  resources.ready=Promise.all(assets.map(async([material,url])=>{
    try{
      const texture=await loader.loadAsync(url);texture.colorSpace=T.SRGBColorSpace;
      texture.anisotropy=4;texture.name=material.name;material.map=texture;material.needsUpdate=true;resources.readyCount++;
    }catch(error){resources.failedCount++;throw error;}
    finally{resources.pendingCount--;}
  })).then(()=>{resources.state='ready';return resources;},error=>{
    resources.state='failed';resources.error=String(error);throw new Error('Character textures could not be loaded',{cause:error});
  });
  return resources;
}
