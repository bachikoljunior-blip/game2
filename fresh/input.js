export function createInput(canvas, onPause) {
  const held=new Set(), pulse={attack:false,dodge:false,lock:false};let stick={x:0,z:0},orbit=0;
  const touch=document.querySelector('#touch'),pad=document.querySelector('#stick'),knob=pad.querySelector('i');
  const coarse=matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints>0;
  let active=false,stickId=null,look=null;
  const clear=()=>{held.clear();guardPointers.clear();stick={x:0,z:0};stickId=null;look=null;Object.keys(pulse).forEach(k=>pulse[k]=false);knob.style.transform='';};
  window.addEventListener('blur',()=>{clear();onPause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();onPause();}});
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'){onPause();return;}if(!active)return;
    if(['Space','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(e.code))e.preventDefault();
    if(!e.repeat){if(e.code==='Space')pulse.dodge=true;if(e.code==='KeyE')pulse.lock=true;}
    held.add(e.code);
  });
  window.addEventListener('keyup',e=>held.delete(e.code));
  canvas.addEventListener('pointerdown',e=>{if(!active)return;canvas.setPointerCapture(e.pointerId);look={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0};});
  canvas.addEventListener('pointermove',e=>{if(look?.id!==e.pointerId)return;const dx=e.clientX-look.x;look.travel+=Math.abs(dx)+Math.abs(e.clientY-look.y);orbit-=dx*.006;look.x=e.clientX;look.y=e.clientY;});
  canvas.addEventListener('pointerup',e=>{if(look?.id===e.pointerId){if(look.travel<15&&active)pulse.attack=true;look=null;}});
  canvas.addEventListener('pointercancel',()=>{look=null;});
  pad.addEventListener('pointerdown',e=>{if(!active||stickId!==null)return;stickId=e.pointerId;pad.setPointerCapture(e.pointerId);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId!==stickId)return;const b=pad.getBoundingClientRect(),x=(e.clientX-b.x-b.width/2)/35,z=(e.clientY-b.y-b.height/2)/35,n=Math.max(1,Math.hypot(x,z));stick={x:x/n,z:z/n};knob.style.transform=`translate(${stick.x*28}px,${stick.z*28}px)`;});
  const release=e=>{if(e.pointerId===stickId){stickId=null;stick={x:0,z:0};knob.style.transform='';}};
  pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);pad.addEventListener('lostpointercapture',release);
  const guardPointers=new Set();
  for(const b of touch.querySelectorAll('button')){
    b.addEventListener('pointerdown',e=>{if(!active)return;e.preventDefault();b.setPointerCapture(e.pointerId);const a=b.dataset.action;if(a==='guard'){guardPointers.add(e.pointerId);held.add('touchGuard');}else pulse[a]=true;});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,e=>{if(b.dataset.action==='guard'){guardPointers.delete(e.pointerId);if(!guardPointers.size)held.delete('touchGuard');}});
  }
  return {clear,get orbit(){return orbit;},setActive(v){active=v;touch.hidden=!v||!coarse;if(!v)clear();},
    sample(){const x=stick.x+Number(held.has('KeyD'))-Number(held.has('KeyA')),z=stick.z+Number(held.has('KeyS'))-Number(held.has('KeyW'));
      return {x:x*Math.cos(orbit)+z*Math.sin(orbit),z:z*Math.cos(orbit)-x*Math.sin(orbit),guard:held.has('KeyQ')||held.has('touchGuard'),...pulse};},
    consume(){Object.keys(pulse).forEach(k=>pulse[k]=false);}};
}
