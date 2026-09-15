// Original optional valley walks. The mission's three duels and signal remain
// on their existing route; these circuits have two distinct entrances each.
const point = (x,z) => Object.freeze({x,z});
const loop = (id,name,width,nodes,discoveries) => Object.freeze({id,name,width,
  nodes:Object.freeze(nodes.map(([x,z])=>point(x,z))),discoveries:Object.freeze(discoveries)});
const discovery = (id,loopId,name,x,z,encounter,text) => Object.freeze({id,loopId,name,x,z,
  radius:2.7,clearing:4.4,encounter,text});
export const EXPLORATION = Object.freeze({
  bounds:Object.freeze({minX:-38,maxX:40,minZ:-54,maxZ:26}),
  central:Object.freeze({minX:-13,maxX:13,minZ:-28,maxZ:23}),
  loops:Object.freeze([
    loop('water','水音の小径',2.9,[[-8,15],[-17,19],[-28,14],[-32,4],[-28,-2],[-23,-9],[-13,-13],[-5,-15]],['spring-basin','stream-stones']),
    loop('ridge','夕風の尾根',3.1,[[8,10],[17,17],[30,10],[34,-2],[30,-13],[26,-20],[15,-28],[8,-17]],['valley-frame','sun-ring']),
    loop('memory','社裏の古道',2.8,[[-8,-18],[-16,-28],[-12,-39],[0,-48],[11,-39],[18,-29],[8,-18]],['old-waystone','white-tree'])
  ]),
  points:Object.freeze([
    discovery('spring-basin','water','澄み水の鉢',-28,14,'water','岩の割れ目から清水が湧く。谷の人々が残した水鉢は、今も満ちている。'),
    discovery('stream-stones','water','流れの渡り石',-28,-2,'leaves','足音に押され、渡り石に積もった葉が流れへほどけた。石の列は参道へ続く。'),
    discovery('valley-frame','ridge','谷見の風架',30,10,'birds','竹の上を鳥が渡る。二本の柱の間に、合図を待つ谷と山の社が並ぶ。'),
    discovery('sun-ring','ridge','夕映えの石輪',26,-20,'gust','石の輪に夕日がかかる。布の向こう、社へ戻る道が尾根を下っている。'),
    discovery('old-waystone','memory','古い道しるべ',-12,-39,'leaves','削れた石には谷と社を結ぶ二筋の刻み。人が行き交った道は、竹の奥にも残っている。'),
    discovery('white-tree','memory','社裏の白い木',11,-39,'gust','白い枝に結ばれた布がほどけずに揺れる。ここからも、社の灯は谷へ届く。')
  ])
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function segmentProjection(x,z,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
  const px=a.x+dx*t,pz=a.z+dz*t;
  return {x:px,z:pz,distance:Math.hypot(x-px,z-pz)};
}
export function explorationPathDistance(x,z){
  let distance=Infinity;
  for(const walk of EXPLORATION.loops)for(let i=1;i<walk.nodes.length;i++)
    distance=Math.min(distance,segmentProjection(x,z,walk.nodes[i-1],walk.nodes[i]).distance);
  return distance;
}
export function explorationClearingDistance(x,z){
  let distance=explorationPathDistance(x,z)-1.8;
  for(const p of EXPLORATION.points)distance=Math.min(distance,Math.hypot(x-p.x,z-p.z)-p.clearing);
  return distance;
}
// The union is a real walkable network, not an enlarged rectangular arena.
// Projection preserves tangential movement when the actor meets a bank.
export function constrainExplorationPosition(actor,radius=.35){
  const x=actor.x,z=actor.z,c=EXPLORATION.central;
  let px=clamp(x,c.minX,c.maxX),pz=clamp(z,c.minZ,c.maxZ),best=Math.hypot(x-px,z-pz);
  if(best===0)return actor;
  const candidate=(cx,cz,allowed)=>{
    const d=Math.hypot(x-cx,z-cz),outside=Math.max(0,d-allowed);
    if(outside>=best)return;
    best=outside;
    const scale=d>0?Math.min(1,allowed/d):0;
    px=cx+(x-cx)*scale;pz=cz+(z-cz)*scale;
  };
  for(const walk of EXPLORATION.loops)for(let i=1;i<walk.nodes.length;i++){
    const p=segmentProjection(x,z,walk.nodes[i-1],walk.nodes[i]);candidate(p.x,p.z,walk.width-radius);
  }
  for(const p of EXPLORATION.points)candidate(p.x,p.z,p.clearing-radius);
  actor.x=px;actor.z=pz;return actor;
}
export function isExplorationWalkable(x,z,radius=.35){
  const p={x,z};constrainExplorationPosition(p,radius);return Math.hypot(x-p.x,z-p.z)<1e-7;
}
export function createExplorationState(){
  return {discovered:[],completed:[],encounters:{},dwell:{},progress:{},region:null,lastDiscovery:null,lastDiscoveryTime:null};
}
export function advanceExploration(world,seconds){
  if(world.mode!=='playing'||world.player.hp<=0)return;
  const state=world.exploration??(world.exploration=createExplorationState()),p=world.player;
  state.region=null;
  const emit=(type,detail)=>world.events.push({type,time:world.time,source:p.id,target:p.id,x:p.x,z:p.z,...detail});
  for(const walk of EXPLORATION.loops){
    if(walk.nodes.some((node,i)=>i&&segmentProjection(p.x,p.z,walk.nodes[i-1],node).distance<walk.width))state.region=walk.id;
    const progress=state.progress[walk.id]??(state.progress[walk.id]={direction:0,next:0,entrance:null});
    if(progress.direction&&!state.completed.includes(walk.id)){
      const goal=walk.nodes[progress.next];
      if(goal&&Math.hypot(p.x-goal.x,p.z-goal.z)<walk.width){
        progress.next+=progress.direction;
        if(progress.next<0||progress.next>=walk.nodes.length){
          state.completed.push(walk.id);emit('exploration-loop',{loop:walk.id,name:walk.name});
        }
      }
    }
    const entrance=Math.hypot(p.x-walk.nodes[0].x,p.z-walk.nodes[0].z)<2.8?0:
      Math.hypot(p.x-walk.nodes.at(-1).x,p.z-walk.nodes.at(-1).z)<2.8?walk.nodes.length-1:null;
    // An abandoned approach does not reserve a direction forever. Re-arm only
    // on entrance entry, after resolving a legitimate final checkpoint above;
    // dwelling at an entrance must never restart a walk every fixed tick.
    if(entrance!==null&&entrance!==progress.entrance&&!state.completed.includes(walk.id)){
      progress.direction=entrance===0?1:-1;
      progress.next=entrance+progress.direction;
    }
    progress.entrance=entrance;
  }
  for(const place of EXPLORATION.points){
    const distance=Math.hypot(p.x-place.x,p.z-place.z);
    if(distance<place.radius+2.5&&state.encounters[place.id]===undefined){
      state.encounters[place.id]=world.time;
      emit('environment-encounter',{place:place.id,encounter:place.encounter});
    }
    if(state.discovered.includes(place.id))continue;
    state.dwell[place.id]=distance<place.radius?(state.dwell[place.id]??0)+Math.max(0,seconds):0;
    if(state.dwell[place.id]>=.8){
      state.discovered.push(place.id);state.lastDiscovery=place.id;state.lastDiscoveryTime=world.time;
      emit('discovery',{place:place.id,name:place.name,text:place.text});
    }
  }
}
export function explorationText(world){
  const state=world.exploration;if(!state)return '';
  const place=EXPLORATION.points.find(p=>p.id===state.lastDiscovery);
  if(place&&world.time-state.lastDiscoveryTime<7)return `${place.name}　${place.text}`;
  if(state.region)return `${EXPLORATION.loops.find(loop=>loop.id===state.region).name}　見つけた場所 ${state.discovered.length} / ${EXPLORATION.points.length}`;
  return '';
}
