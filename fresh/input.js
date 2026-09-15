// The canvas owns camera gestures. Only a short primary mouse click or the
// dedicated attack button can attack; touch and pen releases never do.
export const MOUSE_CLICK = Object.freeze({ travel: 6, duration: 350 });
export function createInput(canvas,onPause){
  const held=new Set(),pulse={attack:false,dodge:false,lock:false},guardPointers=new Set(),canvasPointers=new Set();
  let stick={x:0,z:0},orbit=0,active=false,stickId=null,look=null;
  const touch=document.querySelector('#touch'),pad=document.querySelector('#stick'),knob=pad.querySelector('i');
  const coarse=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
  const capture=(element,id)=>{try{element.setPointerCapture(id);}catch{/* The browser may already have cancelled this pointer. */}};
  const stamp=e=>Number.isFinite(e.timeStamp)?e.timeStamp:performance.now();
  const clear=()=>{held.clear();guardPointers.clear();canvasPointers.clear();stick={x:0,z:0};stickId=null;look=null;Object.keys(pulse).forEach(k=>pulse[k]=false);knob.style.transform='';};
  window.addEventListener('blur',()=>{clear();onPause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();onPause();}});
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'){onPause();return;}if(!active)return;
    if(['Space','KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(e.code))e.preventDefault();
    if(!e.repeat){if(e.code==='Space')pulse.dodge=true;if(e.code==='KeyE')pulse.lock=true;}
    held.add(e.code);
  });
  window.addEventListener('keyup',e=>held.delete(e.code));
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(!active)return;
    // A second finger cannot take over the first gesture or revive its click.
    canvasPointers.add(e.pointerId);
    if(look){look.click=false;return;}
    if(canvasPointers.size!==1)return;
    e.preventDefault();capture(canvas,e.pointerId);
    look={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0,start:stamp(e),
      click:e.pointerType==='mouse'&&e.button===0&&e.isPrimary!==false};
  });
  const track=e=>{
    if(look?.id!==e.pointerId)return;
    const dx=e.clientX-look.x,dy=e.clientY-look.y;
    look.travel+=Math.hypot(dx,dy);if(look.travel>MOUSE_CLICK.travel)look.click=false;
    orbit-=dx*.006;look.x=e.clientX;look.y=e.clientY;
  };
  canvas.addEventListener('pointermove',e=>{if(active)track(e);});
  canvas.addEventListener('pointerup',e=>{
    if(look?.id===e.pointerId){
      track(e);
      if(active&&look.click&&canvasPointers.size===1&&stamp(e)-look.start<=MOUSE_CLICK.duration)pulse.attack=true;
      look=null;
    }
    canvasPointers.delete(e.pointerId);
  });
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{
    if(look?.id===e.pointerId)look=null;canvasPointers.delete(e.pointerId);
  });
  pad.addEventListener('pointerdown',e=>{if(!active||stickId!==null)return;e.preventDefault();stickId=e.pointerId;capture(pad,e.pointerId);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId!==stickId)return;const b=pad.getBoundingClientRect(),x=(e.clientX-b.x-b.width/2)/35,z=(e.clientY-b.y-b.height/2)/35,n=Math.max(1,Math.hypot(x,z));stick={x:x/n,z:z/n};knob.style.transform=`translate(${stick.x*28}px,${stick.z*28}px)`;});
  const release=e=>{if(e.pointerId===stickId){stickId=null;stick={x:0,z:0};knob.style.transform='';}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,release);
  for(const b of touch.querySelectorAll('button')){
    b.addEventListener('pointerdown',e=>{if(!active)return;e.preventDefault();capture(b,e.pointerId);const a=b.dataset.action;if(a==='guard'){guardPointers.add(e.pointerId);held.add('touchGuard');}else if(a in pulse)pulse[a]=true;});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,e=>{if(b.dataset.action==='guard'){guardPointers.delete(e.pointerId);if(!guardPointers.size)held.delete('touchGuard');}});
  }
  return {clear,get orbit(){return orbit;},setActive(v){active=v;touch.hidden=!v||!coarse;if(!v)clear();},
    sample(){const x=stick.x+Number(held.has('KeyD'))-Number(held.has('KeyA')),z=stick.z+Number(held.has('KeyS'))-Number(held.has('KeyW'));
      return {x:x*Math.cos(orbit)+z*Math.sin(orbit),z:z*Math.cos(orbit)-x*Math.sin(orbit),guard:held.has('KeyQ')||held.has('touchGuard'),...pulse};},
    consume(){Object.keys(pulse).forEach(k=>pulse[k]=false);}};
}
