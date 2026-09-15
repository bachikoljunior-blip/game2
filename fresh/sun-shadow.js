// Follow the playable region without widening the shadow frustum or changing
// sunlight direction. Snap in light-space, where one texel has a fixed size.
export const SUN_SHADOW=Object.freeze({offset:Object.freeze({x:-24,y:18,z:-42}),width:56,height:64,mapSize:2048});
const length=Math.hypot(SUN_SHADOW.offset.x,SUN_SHADOW.offset.y,SUN_SHADOW.offset.z);
const back={x:SUN_SHADOW.offset.x/length,y:SUN_SHADOW.offset.y/length,z:SUN_SHADOW.offset.z/length};
const flat=Math.hypot(back.x,back.z),right={x:back.z/flat,y:0,z:-back.x/flat};
const up={x:back.y*right.z,y:back.z*right.x-back.x*right.z,z:-back.y*right.x};
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
export function shadowCenterFor(point){
  const tx=SUN_SHADOW.width/SUN_SHADOW.mapSize,ty=SUN_SHADOW.height/SUN_SHADOW.mapSize;
  const x=Math.round(dot(point,right)/tx)*tx,y=Math.round(dot(point,up)/ty)*ty,z=dot(point,back);
  return {x:right.x*x+up.x*y+back.x*z,y:right.y*x+up.y*y+back.y*z,z:right.z*x+up.z*y+back.z*z};
}
export function followSunShadow(light,point){
  const center=shadowCenterFor(point),offset=SUN_SHADOW.offset;
  light.target.position.set(center.x,center.y,center.z);
  light.position.set(center.x+offset.x,center.y+offset.y,center.z+offset.z);
  light.target.updateMatrixWorld();light.updateMatrixWorld();
  light.shadow.updateMatrices(light);
  return center;
}
