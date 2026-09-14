// Test-player decisions only. A recorded failure of the prior dodge-only route
// remains a failure; this additional defensive route does not modify game state.
import {playthroughAction} from './playthrough-policy.mjs';

export function createTouchPlaythroughSession(){
  return {routeKey:null,lastDodges:0,recoveryOwed:0,recoveryTriggered:false};
}

function observeLeftRetainerRecovery(world,session){
  if(!session)return false;
  const active=world.routeChoice==='left'&&world.routePhase==='branch'&&
    !world.enemies.some(enemy=>enemy.id==='sentinel'&&enemy.hp>0);
  const routeKey=active?world.routeChoiceTime??'left-branch':null;
  if(!active){session.routeKey=null;session.recoveryOwed=0;session.recoveryTriggered=false;return false;}
  if(session.routeKey!==routeKey){
    session.routeKey=routeKey;session.lastDodges=world.totals.dodges;
    // The left route deliberately meets its retainer early. Arm one spacing
    // dodge at branch entry instead of waiting a whole observation round trip
    // for the first block, which can accumulate broken posture under a slow
    // software-rendered touch recording.
    session.recoveryOwed=1;session.recoveryTriggered=true;
  }
  session.recoveryOwed=Math.max(0,session.recoveryOwed-Math.max(0,world.totals.dodges-session.lastDodges));
  session.lastDodges=world.totals.dodges;
  return session.recoveryOwed>0;
}

export function touchPlaythroughAction(world,preferredRoute='left',session=null) {
  const p=world.player,base=playthroughAction(world,preferredRoute);
  const recoveryDue=observeLeftRetainerRecovery(world,session);
  const live=world.enemies.filter(e=>e.hp>0);
  const target=live.find(e=>e.id===base.targetId);
  if(!target)return {...base,guard:false,dodge:false};
  const d=Math.hypot(target.x-p.x,target.z-p.z);
  // Inputs arrive after the observed frame. Establish spacing before close
  // contact, then guard a strike and press the attack instead of waiting for a
  // narrow animation window which may have expired by delivery time.
  const missedContactRecovery=p.state==='guard'&&p.guardAge>=2&&target.state==='windup';
  const press=p.posture>0||world.totals.hits>0||missedContactRecovery;
  // A close unlocked retainer gets lock and dodge in one delivered touch frame;
  // a separate lock round trip was long enough for three blocks in CI. A
  // rejected spacing pulse is retried until the dodge counter acknowledges it.
  // Later hits cannot queue more defensive pulses and starve counterattacks.
  const lockAndDodge=recoveryDue&&!world.locked&&base.lock&&target.id==='retainer'&&d<3;
  const dodge=(!Math.hypot(p.dodgeX,p.dodgeZ)||(recoveryDue&&world.locked===target.id)||lockAndDodge)&&d<3;
  const postDodgeRetainer=target.id==='retainer'&&session?.recoveryTriggered&&!recoveryDue;
  // After spacing, let the pursuing retainer close instead of paying three
  // delayed joystick commands to run straight back into its windup. At 2.25m
  // the authored 0.18s lunge can reach the unchanged 1.95m strike radius.
  const awaitRetainer=postDodgeRetainer&&d>2.25;
  const guard=d<=4.2&&(target.id!=='retainer'||recoveryDue||p.posture<20&&!postDodgeRetainer);
  return {...base,x:awaitRetainer?0:d>3?base.x:0,z:awaitRetainer?0:d>3?base.z:0,guard,
    dodge,lockAndDodge,dodgeNeedsAcknowledgement:recoveryDue,
    attack:postDodgeRetainer?d<=2.25:press&&d<=1.95};
}
