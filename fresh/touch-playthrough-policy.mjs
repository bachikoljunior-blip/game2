// Test-player decisions only. A recorded failure of the prior dodge-only route
// remains a failure; this additional defensive route does not modify game state.
import {playthroughAction} from './playthrough-policy.mjs';

export function createTouchPlaythroughSession(){
  return {routeKey:null,lastReceived:0,lastDodges:0,lastPosture:0,recoveryOwed:0,recoveryTriggered:false};
}

function observeLeftRetainerRecovery(world,session){
  if(!session)return false;
  const active=world.routeChoice==='left'&&world.routePhase==='branch'&&
    !world.enemies.some(enemy=>enemy.id==='sentinel'&&enemy.hp>0);
  const routeKey=active?world.routeChoiceTime??'left-branch':null;
  if(!active){session.routeKey=null;session.recoveryOwed=0;session.recoveryTriggered=false;return false;}
  if(session.routeKey!==routeKey){
    session.routeKey=routeKey;session.lastReceived=world.totals.received;
    session.lastDodges=world.totals.dodges;session.lastPosture=world.player.posture;
    session.recoveryOwed=0;session.recoveryTriggered=false;return false;
  }
  const received=Math.max(0,world.totals.received-session.lastReceived);
  const postureRise=world.player.posture>session.lastPosture+1;
  const guardedContact=world.events.some(event=>(event.type==='block'||event.type==='parry')&&
    event.source==='retainer'&&event.target==='player'&&event.time>=world.routeChoiceTime);
  if((received||postureRise||guardedContact)&&!session.recoveryTriggered){session.recoveryOwed=1;session.recoveryTriggered=true;}
  session.recoveryOwed=Math.max(0,session.recoveryOwed-Math.max(0,world.totals.dodges-session.lastDodges));
  session.lastReceived=world.totals.received;session.lastDodges=world.totals.dodges;session.lastPosture=world.player.posture;
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
  // Once the left branch begins, count only hits from that encounter. Its first
  // rejected recovery dodge is retried until the observed dodge counter
  // acknowledges it, but later hits cannot starve counterattacks with a queue
  // of defensive pulses. Lock also remains higher priority.
  const dodge=(!Math.hypot(p.dodgeX,p.dodgeZ)||recoveryDue&&world.locked===target.id)&&d<3;
  const guard=d<=4.2&&(target.id!=='retainer'||p.posture<20||recoveryDue);
  return {...base,x:d>3?base.x:0,z:d>3?base.z:0,guard,
    dodge,dodgeNeedsAcknowledgement:recoveryDue,attack:press&&d<=1.95};
}
