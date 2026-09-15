import * as T from 'three';
import { ANATOMY } from './character-rig.js';

// Audio and gait use actual displacement, never input intent or actor.stride.
export const LOCOMOTION=Object.freeze({stepDistance:.72,stanceFraction:.60});
export const ATTACK_PHASES=Object.freeze({activeStart:.18,activeEnd:.34,end:.65});
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const down=new T.Vector3(0,-1,0),up=new T.Vector3(0,1,0);
const q=new T.Quaternion(),euler=new T.Euler();

function restPose(){return {
  pelvis:[0,.916,0],body:[.025,0,0],chest:[-.015,0,0],head:[0,0,0],
  weapon:[.225,1.045,-.285],weaponRotation:[-1.92,0,-.16],
  leftHand:[-.29,.99,-.035],feet:[[-.15,.09,-.07],[.15,.09,.085]],footPitch:[0,0],
  twoHands:0,fall:0,sheath:0,phase:'idle',active:false,
};}
const poseWith=(base,patch)=>({...base,...patch});
function blendPose(a,b,t){
  const result={...b};
  for(const key of ['pelvis','body','chest','head','weapon','weaponRotation','leftHand','footPitch'])result[key]=a[key].map((n,i)=>mix(n,b[key][i],t));
  result.feet=a.feet.map((foot,i)=>foot.map((n,k)=>mix(n,b.feet[i][k],t)));
  for(const key of ['twoHands','fall','sheath'])result[key]=mix(a[key],b[key],t);
  return result;
}
function track(base,keys,time){
  if(time<=keys[0][0])return poseWith(base,keys[0][1]);
  for(let n=1;n<keys.length;n++)if(time<=keys[n][0]){
    const before=poseWith(base,keys[n-1][1]),after=poseWith(base,keys[n][1]);
    return blendPose(before,after,ease((time-keys[n-1][0])/(keys[n][0]-keys[n-1][0])));
  }
  return poseWith(base,keys.at(-1)[1]);
}
const ready={pelvis:[0,.865,.035],body:[-.04,0,-.035],chest:[.025,-.14,.015],weapon:[.15,1.60,.015],weaponRotation:[.34,-.12,-.22],twoHands:1,feet:[[-.18,.09,-.235],[.18,.09,.245]]};
const guard={pelvis:[0,.865,.02],body:[.045,0,-.015],chest:[-.045,.1,0],weapon:[.12,1.26,-.38],weaponRotation:[-.67,-.13,-.25],twoHands:1,feet:[[-.19,.09,-.19],[.2,.09,.2]]};
const cut={pelvis:[-.015,.835,-.045],body:[-.14,0,.035],chest:[-.035,.32,.02],weapon:[-.09,1.19,-.47],weaponRotation:[-1.73,.05,.36],twoHands:1,feet:[[-.2,.09,-.32],[.19,.09,.22]]};

/** Deterministic authored poses in actor-local metres/radians. Hit windows are
 * read directly from simulation age; blending never delays the active swing. */
export function sampleCharacterPose(state,age=0,{time=0,speed=0,phase=0,turn=0,acceleration=0,direction=[0,-1],victoryAge=0}={}){
  let pose=restPose();
  const moving=clamp(speed/2.2),run=clamp((speed-1.5)/2.3);
  const breath=Math.sin(time*1.65)*.004;
  pose.chest[0]+=breath;pose.head[0]-=breath*.45;
  pose.pelvis[0]=clamp(turn*.004,-.025,.025)*moving;
  pose.body[0]-=clamp(acceleration*.005,-.045,.075)+run*.085;
  pose.chest[1]=clamp(turn*.026,-.20,.20);
  pose.head[1]=-pose.chest[1]*.5;
  if(state==='idle'||state==='guard'){
    const gait=phase*Math.PI*2;
    pose.pelvis[1]-=moving*(.024+Math.cos(gait*2)*.01);
    pose.body[2]=Math.sin(gait)*.03*moving-clamp(turn*.008,-.065,.065)*moving;
    pose.chest[1]+=-Math.sin(gait)*.055*moving;
    pose.leftHand=[-.285,.99+Math.cos(gait)*.07*moving,.035-Math.sin(gait)*.19*moving];
    pose.weapon[1]+=Math.cos(gait+.3)*.025*moving;pose.weapon[2]+=Math.sin(gait)*.055*moving;
    pose.phase=speed>.15?'locomotion':'idle';
  }
  if(state==='guard'){
    pose=blendPose(pose,poseWith(pose,guard),ease(age/.11));pose.phase='guard';
    pose.chest[0]+=breath*.5;
  }else if(state==='windup'){
    pose=track(pose,[[0,guard],[.18,{...guard,pelvis:[.025,.85,.065],chest:[-.025,-.18,-.025]}],[.53,ready],[.65,ready]],age);pose.phase='anticipation';
  }else if(state==='attack'){
    pose=track(pose,[[0,{...guard,weapon:[.21,1.33,-.21]}],[.15,ready],[.18,ready],
      [.245,{...cut,weapon:[.04,1.42,-.49],weaponRotation:[-.98,0,.18]}],[.34,cut],
      [.43,{...cut,weapon:[-.16,1.09,-.405],weaponRotation:[-2.02,.08,.51]}],
      [.56,{...guard,weapon:[.10,1.12,-.345],weaponRotation:[-1.12,0,-.1]}],[.65,guard]],age);
    pose.phase=age<.18?'anticipation':age<=.34?'active':'recovery';pose.active=age>=.18&&age<=.34;
  }else if(state==='stagger'){
    pose=track(pose,[[0,guard],[.075,{...guard,pelvis:[.01,.855,.065],body:[-.19,0,-.09],head:[-.12,.06,.05],weapon:[.27,1.38,-.20],weaponRotation:[-.43,0,-.57]}],
      [.20,{...guard,pelvis:[.01,.86,.038],body:[-.08,0,-.035],head:[-.04,0,0]}],[.38,guard]],age);pose.phase='hit-recoil';
  }else if(state==='broken'){
    const collapsed={...guard,pelvis:[.025,.645,.03],body:[-.3,0,.10],chest:[-.15,.13,-.04],head:[.28,-.1,-.03],weapon:[.255,.74,-.26],weaponRotation:[-1.9,.1,-.3],twoHands:0,leftHand:[-.22,.56,-.30],feet:[[-.20,.09,-.24],[.18,.09,.27]]};
    pose=track(pose,[[0,guard],[.26,collapsed],[1.22,collapsed],[1.60,{...guard,pelvis:[.01,.8,.03],body:[-.18,0,.03]}],[1.8,guard]],age);pose.phase='posture-broken';
  }else if(state==='dodge'){
    const dx=direction[0],dz=direction[1];
    pose=track(pose,[[0,guard],[.09,{...guard,pelvis:[dx*.065,.66,dz*.06],body:[.20*dz,0,-dx*.24],chest:[.09,dx*.15,dx*.08],weapon:[.21,1.00,-.16],weaponRotation:[-1.5,-.2,-.7],feet:[[-.26,.11,-.12],[.26,.15,.13]]}],
      [.27,{...guard,pelvis:[dx*.04,.735,dz*.025],body:[.14*dz,0,-dx*.16],weapon:[.24,1.06,-.19],weaponRotation:[-1.43,0,-.55],feet:[[-.25,.15,-.23],[.25,.1,.21]]}],
      [.38,{...guard,pelvis:[0,.8,0],body:[.1,0,dx*.055]}],[.46,guard]],age);pose.phase='dodge';
  }else if(state==='dead'){
    pose=track(pose,[[0,guard],[.17,{...guard,pelvis:[.01,.85,.07],body:[-.16,0,-.08],weapon:[.29,1.13,-.19],twoHands:0,leftHand:[-.30,1.03,.01]}],
      [.48,{...guard,pelvis:[.055,.57,.075],body:[.36,0,.10],chest:[.10,.15,-.04],head:[.16,.08,.1],weapon:[.35,.6,-.04],weaponRotation:[-1.8,.1,-.8],twoHands:0,leftHand:[-.29,.40,.03],feet:[[-.23,.09,-.15],[.23,.095,.22]],fall:.2}],
      [.91,{pelvis:[-.04,.31,.09],body:[1.06,0,.12],chest:[.10,.12,-.04],head:[.17,.06,.10],weapon:[.46,.14,-.32],weaponRotation:[-.1,.2,1.40],twoHands:0,leftHand:[-.34,.13,.44],feet:[[.15,.10,-.19],[.32,.13,.27]],fall:.85}],
      [1.28,{pelvis:[-.08,.215,.085],body:[1.48,0,.12],chest:[.05,.10,0],head:[.06,.08,.1],weapon:[.49,.064,-.33],weaponRotation:[0,.2,1.57],twoHands:0,leftHand:[-.35,.095,.64],feet:[[.18,.105,-.24],[.35,.115,.19]],fall:1}],
      [1.56,{pelvis:[-.08,.213,.085],body:[1.47,0,.12],chest:[.05,.10,0],head:[.04,.08,.1],weapon:[.49,.059,-.33],weaponRotation:[0,.2,1.57],twoHands:0,leftHand:[-.35,.095,.64],feet:[[.18,.105,-.24],[.35,.115,.19]],fall:1}]],age);pose.phase=age<1.28?'fall':'rest-dead';
  }else if(state==='victory'){
    const align={pelvis:[0,.905,0],body:[.03,0,0],chest:[.04,.62,0],head:[.10,-.22,0],weapon:[-.10,1.15,-.38],weaponRotation:[1.50,0,-.12],leftHand:[-.225,.972,.045],twoHands:0};
    pose=track(pose,[[0,guard],[.42,{...guard,weapon:[.17,1.15,-.30],weaponRotation:[-1.30,0,-.16]}],
      [.94,{weapon:[.12,1.40,-.35],weaponRotation:[-.55,0,-.2],head:[-.06,.09,0]}],
      [1.44,{...align,sheath:0}],[1.82,{...align,sheath:.35}],[2.45,{...align,sheath:1}],
      [3.05,{...align,chest:[0,0,0],head:[-.04,-.10,0],leftHand:[-.28,1.00,.01],sheath:1}],
      [3.6,{...align,chest:[0,0,0],head:[-.04,-.10,0],leftHand:[-.28,1.00,.01],sheath:1}]],victoryAge);
    pose.phase=victoryAge<1.44?'salute':victoryAge<2.45?'sheathing':'sheathed';
  }
  return pose;
}

/** Two-bone IK with an explicit bend pole. Knee and elbow joints are solved
 * from segment lengths; neither can acquire the old reversed knee rotation. */
export function solveTwoBone(origin,target,pole,upper,lower){
  const direction=new T.Vector3().subVectors(target,origin),rawDistance=direction.length();
  if(rawDistance<1e-8)direction.set(0,-1,0);else direction.multiplyScalar(1/rawDistance);
  const distance=clamp(rawDistance,Math.abs(upper-lower)+.001,upper+lower-.001);
  const bend=pole.clone().addScaledVector(direction,-pole.dot(direction));
  if(bend.lengthSq()<1e-8)bend.set(1,0,0).addScaledVector(direction,-direction.x);
  bend.normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const joint=origin.clone().addScaledVector(direction,along).addScaledVector(bend,height);
  const end=origin.clone().addScaledVector(direction,distance);
  const upperQuaternion=new T.Quaternion().setFromUnitVectors(down,joint.clone().sub(origin).normalize());
  const lowerDirection=end.clone().sub(joint).normalize().applyQuaternion(upperQuaternion.clone().invert());
  const lowerQuaternion=new T.Quaternion().setFromUnitVectors(down,lowerDirection);
  return {joint,end,upperQuaternion,lowerQuaternion,reachError:Math.abs(rawDistance-distance),bendAngle:Math.PI-Math.acos(clamp((upper*upper+lower*lower-distance*distance)/(2*upper*lower),-1,1))};
}

function memory(actor,world){return {
  actor,worldTime:world.time,position:{x:actor.x,z:actor.z},yaw:actor.yaw||0,time:0,state:actor.state,age:actor.age||0,
  speed:0,lastSpeed:0,phase:0,pivotPhase:0,gaitWeight:0,feet:[null,null],pose:restPose(),from:restPose(),transition:1,
  victoryAge:0,lastMode:world.mode,lastEventTime:-1,impact:0,impactKind:null,
  cloth:0,clothVelocity:0,turn:0,metrics:{},
};}
function localToWorld(point,actor,yaw,ground){const c=Math.cos(yaw),s=Math.sin(yaw);return {x:actor.x+c*point[0]-s*point[2],y:ground+point[1],z:actor.z+s*point[0]+c*point[2]};}
function worldToLocal(point,actor,yaw,ground){const c=Math.cos(yaw),s=Math.sin(yaw),dx=point.x-actor.x,dz=point.z-actor.z;return [c*dx+s*dz,point.y-ground,-s*dx+c*dz];}
const toVector=a=>new T.Vector3(...a);

export function updateCharacterRig(rig,actor,world,seconds,{animate=true,groundHeightAt=()=>0}={}){
  // New world instances reset ending, planted feet and cloth on retry.
  if(!rig.motion||rig.motion.actor!==actor||world.time<rig.motion.worldTime)rig.motion=memory(actor,world);
  const m=rig.motion,dt=animate?clamp(seconds,0,.1):0,ground=groundHeightAt(actor.x,actor.z);
  if(!animate&&m.initialized)return m.metrics;
  m.time+=dt;
  const dx=actor.x-m.position.x,dz=actor.z-m.position.z,displacement=Math.hypot(dx,dz),locomotion=(actor.state==='idle'||actor.state==='guard')&&actor.hp>0&&world.mode==='playing';
  const rawSpeed=dt>0&&locomotion?Math.min(8,displacement/dt):0;
  m.lastSpeed=m.speed;m.speed=mix(m.speed,rawSpeed,1-Math.exp(-dt*14));
  const acceleration=dt>0?(m.speed-m.lastSpeed)/dt:0;
  if(locomotion)m.phase=(m.phase+displacement/(LOCOMOTION.stepDistance*2))%1;
  m.gaitWeight=mix(m.gaitWeight,rawSpeed>.08?1:0,1-Math.exp(-dt*(rawSpeed>.08?13:11)));
  const previousYaw=m.yaw,delta=wrap((actor.yaw||0)-m.yaw);
  const combat=actor.state==='attack'||actor.state==='windup';
  m.yaw+=clamp(delta*(1-Math.exp(-dt*(combat?36:16))),-dt*(combat?30:9),dt*(combat?30:9));
  m.turn=dt>0?wrap(m.yaw-previousYaw)/dt:0;
  const state=world.mode==='victory'&&actor.id==='player'?'victory':actor.hp<=0?'dead':actor.state;
  if(state!==m.state){m.from=m.pose;m.transition=0;m.state=state;m.age=actor.age||0;m.feet=[null,null];}
  else m.transition+=dt;
  m.age=state==='dead'?Math.max(actor.age||0,m.age+dt):actor.age||0;
  if(state==='victory')m.victoryAge+=dt;
  else m.victoryAge=0;
  const c=Math.cos(m.yaw),s=Math.sin(m.yaw),length=Math.max(displacement,1e-8);
  const direction=displacement>.0001?[c*dx/length+s*dz/length,-s*dx/length+c*dz/length]:[0,-1];
  let pose=sampleCharacterPose(state,m.age,{time:m.time,speed:m.speed,phase:m.phase,turn:m.turn,acceleration,direction,victoryAge:m.victoryAge});
  // A short state entry blend preserves the previous silhouette; by the .18s
  // hit window the authored pose is exact, not low-pass filtered behind hits.
  if(m.transition<.09)pose=blendPose(m.from,pose,ease(m.transition/.09));
  const contacts=[false,false];
  if(locomotion&&m.gaitWeight>.015){
    for(let i=0;i<2;i++){
      const phase=(m.phase+i*.5)%1,stance=phase<LOCOMOTION.stanceFraction;
      const stride=LOCOMOTION.stepDistance*2,lead=stride*LOCOMOTION.stanceFraction/2;
      let distance,height=0,pitch=0;
      if(stance){distance=lead-stride*phase;pitch=phase>.48?-(phase-.48)/.12*.32:phase<.07?(1-phase/.07)*.13:0;}
      else{
        const swing=(phase-LOCOMOTION.stanceFraction)/(1-LOCOMOTION.stanceFraction);
        distance=mix(-lead,lead,ease(swing));height=(.10+clamp((m.speed-1.5)/2.3)*.12)*Math.sin(Math.PI*swing)**1.35;
        pitch=-.30*(1-ease(swing))+.13*ease(swing);
      }
      const stanceFoot=[rig.limbs[i].side*.15+direction[0]*distance,ANATOMY.sole+height,direction[1]*distance];
      const desired=pose.feet[i].map((n,k)=>mix(n,stanceFoot[k],m.gaitWeight));
      if(stance&&rawSpeed>.1&&m.gaitWeight>.87){
        if(!m.feet[i]?.planted){const position=localToWorld(desired,actor,m.yaw,ground);position.y=groundHeightAt(position.x,position.z)+ANATOMY.sole;m.feet[i]={...position,planted:true};}
        const planted=worldToLocal(m.feet[i],actor,m.yaw,ground);
        // Very abrupt reversal releases the loaded heel for a corrective step.
        if(Math.hypot(planted[0]-rig.limbs[i].side*.15,planted[2])<.54){desired.splice(0,3,...planted);contacts[i]=true;}
        else m.feet[i]=null;
      }else m.feet[i]=null;
      desired[1]+=Math.abs(pitch)*.11;
      pose.feet[i]=desired;pose.footPitch[i]=pitch*m.gaitWeight;
    }
  }else m.feet=[null,null];
  if(locomotion&&rawSpeed<.08&&Math.abs(m.turn)>.6){
    m.pivotPhase=(m.pivotPhase+Math.abs(wrap(m.yaw-previousYaw))/.9)%1;
    for(let i=0;i<2;i++){
      const phase=(m.pivotPhase+i*.5)%1,planted=phase<.5;
      if(planted){
        if(!m.feet[i]?.planted)m.feet[i]={...localToWorld(pose.feet[i],actor,m.yaw,ground),planted:true};
        pose.feet[i]=worldToLocal(m.feet[i],actor,m.yaw,ground);contacts[i]=true;
      }else{
        m.feet[i]=null;pose.feet[i][1]+=.065*Math.sin((phase-.5)*Math.PI*2);contacts[i]=false;
      }
    }
    pose.phase='pivot';pose.pelvis[1]-=.018;
  }
  // Reactions belong to the recipient: a successful parry drives a small wrist
  // deflection and recovery; the interrupted attacker uses stagger/broken.
  for(const event of world.events||[])if(event.target===actor.id&&event.time>m.lastEventTime&&(event.type==='parry'||event.type==='block')){
    m.impact=1;m.impactKind=event.type;m.lastEventTime=event.time;
  }
  if(m.impact>.001&&actor.hp>0&&state!=='victory'){
    const pulse=m.impact*m.impact;pose.chest[0]-=pulse*.045;pose.weaponRotation[2]+=pulse*(m.impactKind==='parry'?-.24:.14);pose.weapon[2]+=pulse*.045;
  }
  m.impact*=Math.exp(-dt*14);
  rig.root.position.set(actor.x,ground,actor.z);rig.root.rotation.set(0,-m.yaw,0);
  rig.body.position.fromArray(pose.pelvis);rig.body.rotation.fromArray([...pose.body,'XYZ']);
  rig.chest.rotation.fromArray([...pose.chest,'XYZ']);rig.neck.rotation.fromArray([...pose.head,'XYZ']);
  rig.scabbard.rotation.x=mix(1.76,Math.PI/2-pose.body[0],clamp(pose.fall*2));
  // Keep planted legs inside their anatomical reach by lowering the pelvis,
  // not by hyperextending knees or changing the segment lengths.
  if(state!=='dead')for(let i=0;i<2;i++){
    const f=pose.feet[i],horizontal=Math.hypot(f[0]-rig.limbs[i].side*.15-pose.pelvis[0],f[2]-pose.pelvis[2]);
    const allowed=f[1]+Math.sqrt(Math.max(.05,(ANATOMY.thigh+ANATOMY.shin-.004)**2-horizontal**2));
    rig.body.position.y=Math.min(rig.body.position.y,allowed);
  }
  rig.root.updateMatrixWorld(true);
  const rootInverse=rig.root.matrixWorld.clone().invert(),bodyToRoot=new T.Matrix4().multiplyMatrices(rootInverse,rig.body.matrixWorld),rootToBody=bodyToRoot.clone().invert();
  const legMetrics=[];
  for(let i=0;i<2;i++){
    const limb=rig.limbs[i],target=toVector(pose.feet[i]).applyMatrix4(rootToBody),pole=new T.Vector3(0,0,-1);
    const solved=solveTwoBone(limb.hip.position,target,pole,ANATOMY.thigh,ANATOMY.shin);
    limb.hip.quaternion.copy(solved.upperQuaternion);limb.knee.quaternion.copy(solved.lowerQuaternion);
    // Feet keep their own orientation, cancelling the hip/knee/body rotation.
    const chain=rig.body.quaternion.clone().multiply(limb.hip.quaternion).multiply(limb.knee.quaternion);
    limb.ankle.quaternion.copy(chain.invert()).multiply(q.setFromEuler(euler.set(pose.footPitch[i],0,0)));
    const knee=solved.joint.clone().applyMatrix4(bodyToRoot),foot=solved.end.clone().applyMatrix4(bodyToRoot);
    legMetrics.push({side:limb.side,kneeFlexion:solved.bendAngle,kneeRotationX:new T.Euler().setFromQuaternion(limb.knee.quaternion).x,
      kneeLocal:knee.toArray(),footLocal:foot.toArray(),footWorld:localToWorld(foot.toArray(),actor,m.yaw,ground),contact:contacts[i]||(!locomotion&&state!=='dead'&&state!=='dodge'),reachError:solved.reachError});
  }
  rig.sword.position.fromArray(pose.weapon);rig.sword.rotation.fromArray([...pose.weaponRotation,'XYZ']);
  let sheathed=false;
  if(state==='victory'&&m.victoryAge>1.32){
    rig.scabbard.updateWorldMatrix(true,false);
    const mouth=rig.scabbard.getWorldPosition(new T.Vector3()).applyMatrix4(rootInverse);
    const rotation=rig.root.getWorldQuaternion(new T.Quaternion()).invert().multiply(rig.scabbard.getWorldQuaternion(new T.Quaternion()));
    const axis=up.clone().applyQuaternion(rotation),grip=mouth.addScaledVector(axis,-mix(.40,.125,pose.sheath));
    const align=ease((m.victoryAge-1.32)/.26);
    rig.sword.position.lerp(grip,align);rig.sword.quaternion.slerp(rotation,align);
    sheathed=pose.sheath>=.999;
  }
  rig.sword.visible=true;rig.blade.visible=!sheathed;
  rig.root.updateMatrixWorld(true);
  // The sword is the grip target for both hands. Arms are solved afterwards,
  // avoiding a blade that drifts away from a separately animated hand.
  const rightGrip=rig.sword.localToWorld(new T.Vector3(0,0,0)),leftGrip=rig.sword.localToWorld(new T.Vector3(0,-.135,0));
  const armMetrics=[];
  for(let i=0;i<2;i++){
    const limb=rig.limbs[i],target=i===1?rightGrip.clone():rig.root.localToWorld(toVector(pose.leftHand)).lerp(leftGrip,pose.twoHands);
    if(state==='dead'&&m.age>.45&&i===1){
      const release=rig.chest.localToWorld(new T.Vector3(.31,-.37,.07));target.lerp(release,ease((m.age-.45)/.30));
    }
    if(state==='victory'&&m.victoryAge>=1.44&&m.victoryAge<2.6&&i===0)rig.scabbard.getWorldPosition(target);
    if(state==='victory'&&m.victoryAge>2.65&&i===1){
      const rest=rig.root.localToWorld(new T.Vector3(.28,1.00,-.025));target.lerp(rest,ease((m.victoryAge-2.65)/.4));
    }
    const chestInverse=rig.chest.matrixWorld.clone().invert();target.applyMatrix4(chestInverse);
    const elbowPole=state==='dead'?new T.Vector3(limb.side*.8,.8,0).applyQuaternion(rig.chest.getWorldQuaternion(new T.Quaternion()).invert()):new T.Vector3(limb.side*.8,-.15,.40);
    const solved=solveTwoBone(limb.arm.position,target,elbowPole,ANATOMY.upperArm,ANATOMY.forearm);
    limb.arm.quaternion.copy(solved.upperQuaternion);limb.elbow.quaternion.copy(solved.lowerQuaternion);
    const chain=rig.body.quaternion.clone().multiply(rig.chest.quaternion).multiply(limb.arm.quaternion).multiply(limb.elbow.quaternion);
    limb.wrist.quaternion.copy(chain.invert()).multiply(rig.sword.quaternion);
    armMetrics.push({side:limb.side,reachError:solved.reachError});
  }
  // Damped cloth follows acceleration, turns and body motion. The low-amplitude
  // air ripple is secondary to the inertia, and every driver stops on pause.
  const clothTarget=clamp(-acceleration*.004+m.speed*.013+pose.body[0]*.35,-.18,.30);
  const steps=Math.max(1,Math.ceil(dt/(1/120))),h=dt/steps;
  for(let n=0;n<steps;n++){m.clothVelocity+=(clothTarget-m.cloth)*h*90-m.clothVelocity*h*14;m.cloth+=m.clothVelocity*h;}
  for(const panel of rig.panels){
    const leg=rig.limbs[panel.side<0?0:1];
    const hipPitch=new T.Euler().setFromQuaternion(leg.hip.quaternion).x;
    panel.node.rotation.set(clamp(m.cloth+hipPitch*.34+(panel.front<0?.045:-.035),-.52,.55),
      clamp(-m.turn*.014,-.18,.18),panel.side*.02+Math.sin(m.time*1.25+panel.side)*.009);
  }
  rig.ties.forEach((tie,i)=>tie.rotation.set(clamp(m.cloth*.7+.06,-.18,.3),clamp(-m.turn*.015,-.25,.25),Math.sin(m.time*1.4+i*.9)*.018+m.turn*.012));
  rig.contact.scale.set(1+pose.fall*.5,1+pose.fall*.1,1);rig.contact.material.opacity=.24-pose.fall*.05;
  rig.ring.visible=world.locked===actor.id&&actor.hp>0;rig.signal.visible=actor.state==='windup'&&actor.hp>0;
  rig.root.updateMatrixWorld(true);
  m.pose=pose;m.position={x:actor.x,z:actor.z};m.worldTime=world.time;m.lastMode=world.mode;m.initialized=true;
  m.metrics={state,phase:pose.phase,simulationAge:actor.age,visualAge:m.age,victoryAge:m.victoryAge,visualTime:m.time,
    root:{x:actor.x,y:ground,z:actor.z,yaw:m.yaw},pelvis:rig.body.position.toArray(),speed:m.speed,gaitPhase:m.phase,
    feet:legMetrics,hands:armMetrics,attackActive:pose.active,sheathed,sheathProgress:pose.sheath,cloth:m.cloth,
    bladeTipWorld:rig.sword.localToWorld(new T.Vector3(.045,1.088,0)).toArray(),bladeVisible:rig.blade.visible};
  return m.metrics;
}
