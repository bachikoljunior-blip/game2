(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))i(r);new MutationObserver(r=>{for(const s of r)if(s.type==="childList")for(const o of s.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&i(o)}).observe(document,{childList:!0,subtree:!0});function t(r){const s={};return r.integrity&&(s.integrity=r.integrity),r.referrerPolicy&&(s.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?s.credentials="include":r.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(r){if(r.ep)return;r.ep=!0;const s=t(r);fetch(r.href,s)}})();const $c=n=>n*n*(3-2*n),Jc=(n,e,t)=>Math.max(e,Math.min(t,n)),nt=Object.freeze({splitStartZ:-1.5,obstacleFrontZ:-4.25,obstacleBackZ:-14.25,rejoinZ:-17.2,pathHalfWidth:.82,rejoinHalfWidth:2.1,obstacle:Object.freeze({kind:"route-ridge",x:0,z:-9.25,w:4.4,d:10,h:2.8}),left:Object.freeze({id:"left",x:-3.45,label:"石灯の道",landmark:"石灯",consequence:"近い道で留守居と早く対峙",consequenceId:"early-retainer",enemyId:"retainer",markers:Object.freeze([Object.freeze({x:-4.9,z:-6.25}),Object.freeze({x:-4.75,z:-9.75}),Object.freeze({x:-4.45,z:-13.1})])}),right:Object.freeze({id:"right",x:4.55,label:"風布の道",landmark:"風布",consequence:"長い迂回で岩尾根と社を見渡す",consequenceId:"overlook-warden",enemyId:"warden",markers:Object.freeze([Object.freeze({x:5.85,z:-6.15}),Object.freeze({x:5.95,z:-9.7}),Object.freeze({x:5.55,z:-13.25})])})}),Au=Object.freeze(["left","right"]),vc=n=>Au.includes(n);function Rh(n,e,t){const i=Au.find(r=>nt[r].enemyId===t);return!i||n==="rejoined"||e===i}const yc=n=>{if(!vc(n))throw new RangeError(`Unknown route: ${n}`);return nt[n]};function hr(n,e){const t=yc(n),{splitStartZ:i,obstacleFrontZ:r,obstacleBackZ:s,rejoinZ:o}=nt;if(e>=i||e<=o)return 0;if(e>r){const l=Jc((i-e)/(i-r),0,1);return t.x*$c(l)}if(e>=s)return t.x;const c=Jc((s-e)/(s-o),0,1);return t.x*(1-$c(c))}function ur(n){const e=hr("left",n),t=hr("right",n);return Math.abs(t-e)<.7?[0]:[e,t]}function _a(n,e){return Math.min(...ur(e).map(t=>Math.abs(n-t)))}function Kc(n){const e=yc(n);return Math.hypot(e.x,nt.splitStartZ-nt.obstacleFrontZ)+(nt.obstacleFrontZ-nt.obstacleBackZ)+Math.hypot(e.x,nt.obstacleBackZ-nt.rejoinZ)}function Ch(n){if(n.z>nt.obstacleFrontZ+.28||n.z<nt.obstacleBackZ-.28)return null;const t=nt.obstacle.w/2+.35;return n.x<=-t&&n.x>=nt.left.x-1.7?"left":n.x>=t&&n.x<=nt.right.x+1.7?"right":null}function Qc(n){return yc(n).label}const Nt=Object.freeze({x:0,z:-19.6,radius:1.65}),Ph="谷に残る人々へ、山道が開いたことを知らせる。道を塞ぐ剣士を退け、社の正面の灯をともそう。",Ru=Object.freeze(["社の灯がともった。","谷で待つ人々に、","山道が開いたことが伝わる。","刃を納め、風を聞く。"]);Ru.join("");function Mc(n){return n.pathCleared&&vc(n.routeChoice)&&n.routePhase==="rejoined"&&n.player.hp>0&&n.enemies.every(e=>e.hp<=0)&&Math.hypot(n.player.x-Nt.x,n.player.z-Nt.z)<=Nt.radius}function Lh(n){var t;if(n.player.hp<=0)return"灯はまだ消えている。もう一度、山道へ。";if(n.signalLit)return"社の灯が、谷への合図になった";const e=n.enemies.filter(i=>i.hp>0).length;return e?n.player.z>10&&!n.totals.kills?"谷へ合図を送るため、鳥居の先へ":!n.routeChoice&&((t=n.enemies.find(i=>i.id==="sentinel"))==null?void 0:t.hp)<=0?"二つに分かれた参道から、社へ":n.routeChoice?`${Qc(n.routeChoice)}を進む　残る剣士 ${e}`:`灯へ続く道を開く　残る剣士 ${e}`:Mc(n)?"E または「灯す」で、谷へ合図を送る":n.routeChoice?n.routePhase!=="rejoined"?`${Qc(n.routeChoice)}を抜け、社の前へ`:"道は開いた。社の正面の灯に近づく":"道は開いた。分かれた参道を通って灯へ"}const Dh=(n,e)=>Object.freeze({x:n,z:e}),bo=(n,e,t,i,r)=>Object.freeze({id:n,name:e,width:t,nodes:Object.freeze(i.map(([s,o])=>Dh(s,o))),discoveries:Object.freeze(r)}),Wi=(n,e,t,i,r,s,o)=>Object.freeze({id:n,loopId:e,name:t,x:i,z:r,radius:2.7,clearing:4.4,encounter:s,text:o}),Ht=Object.freeze({bounds:Object.freeze({minX:-38,maxX:40,minZ:-54,maxZ:26}),central:Object.freeze({minX:-13,maxX:13,minZ:-28,maxZ:23}),loops:Object.freeze([bo("water","水音の小径",2.9,[[-8,15],[-17,19],[-28,14],[-32,4],[-28,-2],[-23,-9],[-13,-13],[-5,-15]],["spring-basin","stream-stones"]),bo("ridge","夕風の尾根",3.1,[[8,10],[17,17],[30,10],[34,-2],[30,-13],[26,-20],[15,-28],[8,-17]],["valley-frame","sun-ring"]),bo("memory","社裏の古道",2.8,[[-8,-18],[-16,-28],[-12,-39],[0,-48],[11,-39],[18,-29],[8,-18]],["old-waystone","white-tree"])]),points:Object.freeze([Wi("spring-basin","water","澄み水の鉢",-28,14,"water","岩の割れ目から清水が湧く。谷の人々が残した水鉢は、今も満ちている。"),Wi("stream-stones","water","流れの渡り石",-28,-2,"leaves","足音に押され、渡り石に積もった葉が流れへほどけた。石の列は参道へ続く。"),Wi("valley-frame","ridge","谷見の風架",30,10,"birds","竹の上を鳥が渡る。二本の柱の間に、合図を待つ谷と山の社が並ぶ。"),Wi("sun-ring","ridge","夕映えの石輪",26,-20,"gust","石の輪に夕日がかかる。布の向こう、社へ戻る道が尾根を下っている。"),Wi("old-waystone","memory","古い道しるべ",-12,-39,"leaves","削れた石には谷と社を結ぶ二筋の刻み。人が行き交った道は、竹の奥にも残っている。"),Wi("white-tree","memory","社裏の白い木",11,-39,"gust","白い枝に結ばれた布がほどけずに揺れる。ここからも、社の灯は谷へ届く。")])}),dn=(n,e,t,i,r)=>Object.freeze({id:n,shape:e,x:t,z:i,...r}),Sc=Object.freeze([dn("spring-basin","circle",-29.9,14,{radius:1.4}),dn("stream-pool","circle",-32,-.7,{radius:2.1}),dn("valley-frame-left","circle",27.9,9,{radius:.12}),dn("valley-frame-right","circle",32.1,9,{radius:.12}),dn("sun-ring","box",28.1,-21.2,{width:3.4,depth:1,rotation:-.45}),dn("sun-cloth","circle",24.1,-20.6,{radius:.065}),dn("old-waystone","box",-13.9,-39,{width:1.08,depth:.48,rotation:.23}),dn("old-cairn","circle",-10.2,-39,{radius:.39}),dn("white-tree","circle",13.15,-39.8,{radius:.29}),dn("white-cloth-left","circle",11.35,-40.2,{radius:.065}),dn("white-cloth-right","circle",14.95,-40.2,{radius:.065}),...[[-22,11],[-24,4],[-10,-34],[14,-43]].map(([n,e],t)=>dn(`maple-${t}`,"circle",n,e,{radius:.28})),...Ht.loops.flatMap(n=>[0,n.nodes.length-1].map((e,t)=>{const i=n.nodes[e],r=n.nodes[e===0?1:e-1],s=r.x-i.x,o=r.z-i.z,c=Math.hypot(s,o),l=-o*Math.sign(i.x)<0?-1:1,a=-o/c*l,u=s/c*l,h=n.id==="memory"&&t===0?4.4:2.1;return dn(`${n.id}-sign-${t}`,"box",i.x+a*h,i.z+u*h,{width:1.95,depth:.1,rotation:Math.atan2(-u,a),loopId:n.id})}))]),Rn=n=>Sc.find(e=>e.id===n),is=(n,e,t)=>Math.max(e,Math.min(t,n));function Ec(n,e,t,i){const r=i.x-t.x,s=i.z-t.z,o=is(((n-t.x)*r+(e-t.z)*s)/(r*r+s*s),0,1),c=t.x+r*o,l=t.z+s*o;return{x:c,z:l,distance:Math.hypot(n-c,e-l)}}function Ih(n,e){let t=1/0;for(const i of Ht.loops)for(let r=1;r<i.nodes.length;r++)t=Math.min(t,Ec(n,e,i.nodes[r-1],i.nodes[r]).distance);return t}function To(n,e){let t=Ih(n,e)-1.8;for(const i of Ht.points)t=Math.min(t,Math.hypot(n-i.x,e-i.z)-i.clearing);for(const i of Sc)t=Math.min(t,Math.hypot(n-i.x,e-i.z)-(i.radius??Math.hypot(i.width,i.depth)/2));return t}function el(n,e=.35){const t=n.x,i=n.z,r=Ht.central;let s=is(t,r.minX,r.maxX),o=is(i,r.minZ,r.maxZ),c=Math.hypot(t-s,i-o);if(c===0)return n;const l=(a,u,h)=>{const d=Math.hypot(t-a,i-u),f=Math.max(0,d-h);if(f>=c)return;c=f;const g=d>0?Math.min(1,h/d):0;s=a+(t-a)*g,o=u+(i-u)*g};for(const a of Ht.loops)for(let u=1;u<a.nodes.length;u++){const h=Ec(t,i,a.nodes[u-1],a.nodes[u]);l(h.x,h.z,a.width-e)}for(const a of Ht.points)l(a.x,a.z,a.clearing-e);return n.x=s,n.z=o,n}function Cu(n,e,t){const i=Math.cos(t.rotation??0),r=Math.sin(t.rotation??0),s=n-t.x,o=e-t.z;return{x:i*s-r*o,z:r*s+i*o}}function tl(n,e,t=.35){return Sc.find(i=>{if(i.shape==="circle")return Math.hypot(n-i.x,e-i.z)<i.radius+t-1e-8;const r=Cu(n,e,i),s=Math.max(0,Math.abs(r.x)-i.width/2),o=Math.max(0,Math.abs(r.z)-i.depth/2);return Math.hypot(s,o)<t-1e-8})??null}function Uh(n,e=.35){el(n,e);for(let t=0;t<4;t++){const i=tl(n.x,n.z,e);if(!i)break;const r=[];if(i.shape==="circle"){const o=Math.atan2(n.z-i.z,n.x-i.x),c=i.radius+e;for(let l=0;l<33;l++){const a=l===0?o:(l-1)*Math.PI/16;r.push({x:i.x+Math.cos(a)*c,z:i.z+Math.sin(a)*c})}}else{const o=Cu(n.x,n.z,i),c=i.width/2,l=i.depth/2,a=Math.cos(i.rotation),u=Math.sin(i.rotation),h=is(o.x,-c,c),d=is(o.z,-l,l),f=o.x-h,g=o.z-d,x=Math.hypot(f,g),m=[{x:-c-e,z:d},{x:c+e,z:d},{x:h,z:-l-e},{x:h,z:l+e}];x>0&&m.unshift({x:h+f/x*e,z:d+g/x*e});for(const p of m)r.push({x:i.x+a*p.x+u*p.z,z:i.z-u*p.x+a*p.z})}r.sort((o,c)=>Math.hypot(o.x-n.x,o.z-n.z)-Math.hypot(c.x-n.x,c.z-n.z));const s=r.find(o=>{const c={...o};return el(c,e),Math.hypot(c.x-o.x,c.z-o.z)<1e-7&&!tl(o.x,o.z,e)});if(!s)break;n.x=s.x,n.z=s.z}return n}function Pu(){return{discovered:[],completed:[],encounters:{},dwell:{},progress:{},region:null,lastDiscovery:null,lastDiscoveryTime:null}}function Nh(n,e){if(n.mode!=="playing"||n.player.hp<=0)return;const t=n.exploration??(n.exploration=Pu()),i=n.player;t.region=null;const r=(s,o)=>n.events.push({type:s,time:n.time,source:i.id,target:i.id,x:i.x,z:i.z,...o});for(const s of Ht.loops){s.nodes.some((l,a)=>a&&Ec(i.x,i.z,s.nodes[a-1],l).distance<s.width)&&(t.region=s.id);const o=t.progress[s.id]??(t.progress[s.id]={direction:0,next:0,entrance:null});if(o.direction&&!t.completed.includes(s.id)){const l=s.nodes[o.next];l&&Math.hypot(i.x-l.x,i.z-l.z)<s.width&&(o.next+=o.direction,(o.next<0||o.next>=s.nodes.length)&&(t.completed.push(s.id),r("exploration-loop",{loop:s.id,name:s.name})))}const c=Math.hypot(i.x-s.nodes[0].x,i.z-s.nodes[0].z)<2.8?0:Math.hypot(i.x-s.nodes.at(-1).x,i.z-s.nodes.at(-1).z)<2.8?s.nodes.length-1:null;c!==null&&c!==o.entrance&&!t.completed.includes(s.id)&&(o.direction=c===0?1:-1,o.next=c+o.direction),o.entrance=c}for(const s of Ht.points){const o=Math.hypot(i.x-s.x,i.z-s.z);o<s.radius+2.5&&t.encounters[s.id]===void 0&&(t.encounters[s.id]=n.time,r("environment-encounter",{place:s.id,encounter:s.encounter})),!t.discovered.includes(s.id)&&(t.dwell[s.id]=o<s.radius?(t.dwell[s.id]??0)+Math.max(0,e):0,t.dwell[s.id]>=.8&&(t.discovered.push(s.id),t.lastDiscovery=s.id,t.lastDiscoveryTime=n.time,r("discovery",{place:s.id,name:s.name,text:s.text})))}}function Fh(n){const e=n.exploration;if(!e)return"";const t=Ht.points.find(i=>i.id===e.lastDiscovery);return t&&n.time-e.lastDiscoveryTime<7?`${t.name}　${t.text}`:e.region?`${Ht.loops.find(i=>i.id===e.region).name}　見つけた場所 ${e.discovered.length} / ${Ht.points.length}`:""}const rn=1/60,xa=[{x:-3.5,z:7,w:.55,d:.55,h:4.5,kind:"torii"},{x:3.5,z:7,w:.55,d:.55,h:4.5,kind:"torii"},nt.obstacle,{x:0,z:-23,w:10,d:7,h:5,kind:"shrine"}],va=(n,e)=>Math.atan2(Math.sin(n-e),Math.cos(n-e)),fi=(n,e)=>Math.hypot(n.x-e.x,n.z-e.z),Kr=(n,e)=>Math.atan2(e.x-n.x,-(e.z-n.z)),vs=(n,e,t)=>({id:n,x:e,z:t,yaw:0,hp:100,posture:0,state:"idle",age:0,guardAge:99,hit:[],cooldown:0,stride:0,dodgeX:0,dodgeZ:0}),wo=(n,e)=>Rh(n.routePhase,n.routeChoice,e.id);function Lu(){return{time:0,remainder:0,ticks:0,mode:"playing",player:vs("player",0,18),enemies:[vs("sentinel",0,1),vs("retainer",-3,-9),vs("warden",3,-16)],locked:null,routeChoice:null,routePhase:"approach",routeChoiceTime:null,routeChoicePosition:null,routeLandmark:null,routeLandmarkTime:null,routeConsequence:null,routeConsequenceTime:null,routeRejoinTime:null,routeRejoinPosition:null,pathCleared:!1,signalLit:!1,exploration:Pu(),events:[],totals:{hits:0,received:0,parries:0,kills:0,dodges:0,swings:0}}}function Dn(n,e){n.state=e,n.age=0,n.hit=[]}function ys(n,e,t){const i=n.x,r=n.z;n.x+=e,n.z+=t,Uh(n);const s=.35;for(const o of xa){const c=Math.max(o.x-o.w/2,Math.min(o.x+o.w/2,n.x)),l=Math.max(o.z-o.d/2,Math.min(o.z+o.d/2,n.z)),a=Math.hypot(n.x-c,n.z-l);if(a>0&&a<s)n.x+=(n.x-c)/a*(s-a),n.z+=(n.z-l)/a*(s-a);else if(a===0){const u=[[o.x-o.w/2-s,n.z],[o.x+o.w/2+s,n.z],[n.x,o.z-o.d/2-s],[n.x,o.z+o.d/2+s]];u.sort((h,d)=>Math.hypot(h[0]-n.x,h[1]-n.z)-Math.hypot(d[0]-n.x,d[1]-n.z)),[n.x,n.z]=u[0]}}n.stride+=Math.hypot(n.x-i,n.z-r)}function mn(n,e,t,i,r={}){n.events.push({type:e,time:n.time,source:t.id,target:i.id,x:i.x,z:i.z,...r})}function zh(n,e,t){if(t.hp<=0||e.hit.includes(t.id)||fi(e,t)>1.95||Math.abs(va(Kr(e,t),e.yaw))>.95)return;if(e.hit.push(t.id),t.state==="dodge"&&t.age<.32){mn(n,"evade",e,t);return}const i=Math.abs(va(Kr(t,e),t.yaw))<1.1;if(t.state==="guard"&&i){t.guardAge<=.15?(e.posture+=52,Dn(e,e.posture>=100?"broken":"stagger"),n.totals.parries++,mn(n,"parry",e,t)):(t.posture+=34,t.posture>=100&&Dn(t,"broken"),mn(n,"block",e,t));return}const r=t.state==="broken"?100:e.id==="player"?34:24;t.hp=Math.max(0,t.hp-r),t.posture+=20,Dn(t,t.hp===0?"dead":t.posture>=100?"broken":"stagger"),e.id==="player"?n.totals.hits++:n.totals.received++,mn(n,"hit",e,t),t.hp===0&&(t.id!=="player"&&n.totals.kills++,mn(n,"death",e,t))}function Oh(n,e={}){var l;if(n.mode!=="playing")return;n.time+=rn,n.ticks++,n.events=n.events.filter(a=>n.time-a.time<1);const t=n.player,i=[t,...n.enemies];for(const a of i)a.age+=rn,a.cooldown=Math.max(0,a.cooldown-rn),a.state==="guard"?a.guardAge+=rn:a.guardAge=99,a.state==="idle"&&(a.posture=Math.max(0,a.posture-rn*7)),(a.state==="attack"&&a.age>=.65||a.state==="stagger"&&a.age>=.38||a.state==="dodge"&&a.age>=.46||a.state==="broken"&&a.age>=1.8)&&(a.state==="broken"&&(a.posture=0),Dn(a,"idle"));if(n.locked&&!n.enemies.some(a=>a.id===n.locked&&a.hp>0&&wo(n,a))&&(n.locked=null),e.lock){const a=n.enemies.filter(u=>u.hp>0&&wo(n,u)&&fi(t,u)<12).sort((u,h)=>fi(t,u)-fi(t,h));n.locked=n.locked?null:((l=a[0])==null?void 0:l.id)??null}const r=n.enemies.find(a=>a.id===n.locked);if(r&&t.state!=="attack"&&t.state!=="dead"&&(t.yaw=Kr(t,r)),t.state==="guard"&&!e.guard&&Dn(t,"idle"),t.state==="idle"||t.state==="guard"){if(e.dodge){const d=e.x||0,f=e.z||0,g=Math.hypot(d,f);t.dodgeX=g>.1?d/g:-Math.sin(t.yaw),t.dodgeZ=g>.1?f/g:Math.cos(t.yaw),n.totals.dodges++,Dn(t,"dodge"),mn(n,"dodge",t,t)}else e.attack?(Dn(t,"attack"),n.totals.swings=(n.totals.swings??0)+1,mn(n,"swing",t,t)):e.guard&&t.state!=="guard"&&(Dn(t,"guard"),t.guardAge=0);const a=e.x||0,u=e.z||0,h=Math.max(1,Math.hypot(a,u));(t.state==="idle"||t.state==="guard")&&(ys(t,a/h*rn*3.8,u/h*rn*3.8),!r&&Math.hypot(a,u)>.1&&(t.yaw=Math.atan2(a,-u)))}t.state==="dodge"&&ys(t,t.dodgeX*rn*7,t.dodgeZ*rn*7);let s=n.enemies.some(a=>a.state==="windup"||a.state==="attack");for(const a of n.enemies)a.hp<=0||wo(n,a)&&(a.state==="idle"&&fi(a,t)<11&&(a.yaw=Kr(a,t),fi(a,t)>1.65?ys(a,Math.sin(a.yaw)*rn*1.8,-Math.cos(a.yaw)*rn*1.8):!s&&a.cooldown===0&&(Dn(a,"windup"),s=!0)),a.state==="windup"&&a.age>=.65&&(Dn(a,"attack"),a.cooldown=1.1,mn(n,"swing",a,a)));for(const a of i)if(a.state==="attack"){if(a.age<.18){const u=(a===t?n.enemies:[t]).filter(f=>f.hp>0&&Math.abs(va(Kr(a,f),a.yaw))<.95),h=u.length?Math.min(...u.map(f=>fi(a,f))):1/0,d=Math.min(rn*1.8,Math.max(0,h-1.1));ys(a,Math.sin(a.yaw)*d,-Math.cos(a.yaw)*d)}if(a.age>=.18&&a.age<=.34)for(const u of a===t?n.enemies:[t])zh(n,a,u)}const o=t.hp>0&&Ch(t);let c=!1;if(!n.routeChoice&&o&&(n.routeChoice=o,n.routePhase="branch",n.routeChoiceTime=n.time,n.routeChoicePosition={x:t.x,z:t.z},c=!0,mn(n,"route",t,t,{route:o})),n.routeChoice&&n.routePhase==="branch"&&!c){const a=nt[n.routeChoice];!n.routeLandmark&&a.markers.some(h=>Math.hypot(t.x-h.x,t.z-h.z)<=1.8)&&(n.routeLandmark=a.landmark,n.routeLandmarkTime=n.time,mn(n,"landmark",t,t,{route:n.routeChoice,landmark:a.landmark}));const u=n.enemies.find(h=>h.id===a.enemyId);!n.routeConsequence&&u&&(u.hp<100||fi(t,u)<=4.2)&&(n.routeConsequence=a.consequenceId,n.routeConsequenceTime=n.time,mn(n,"route-consequence",t,u,{route:n.routeChoice,consequence:a.consequenceId})),t.z<=nt.rejoinZ-.25&&Math.abs(t.x)<=nt.rejoinHalfWidth&&(n.routePhase="rejoined",n.routeRejoinTime=n.time,n.routeRejoinPosition={x:t.x,z:t.z},mn(n,"route-rejoin",t,t,{route:n.routeChoice}))}t.hp>0&&Nh(n,rn),t.hp<=0?n.mode="defeat":n.enemies.every(a=>a.hp<=0)&&(n.pathCleared&&e.lock&&Mc(n)&&(n.signalLit=!0,n.mode="victory",mn(n,"signal",t,t)),n.pathCleared=!0)}function Bh(n,e,t={}){n.remainder+=Math.min(.25,Math.max(0,e));let i=!0;for(;n.remainder+1e-10>=rn;)Oh(n,i?t:{...t,attack:!1,dodge:!1,lock:!1}),n.remainder-=rn,i=!1;return!i}/**
 * @license
 * Copyright 2010-2025 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const bc="180",kh=0,nl=1,Hh=2,Du=1,Iu=2,Zn=3,xi=0,on=1,Ft=2,gi=0,fr=1,co=2,il=3,rl=4,Vh=5,Pi=100,Gh=101,Wh=102,Xh=103,qh=104,Yh=200,Zh=201,jh=202,$h=203,ya=204,Ma=205,Jh=206,Kh=207,Qh=208,ed=209,td=210,nd=211,id=212,rd=213,sd=214,Sa=0,Ea=1,ba=2,gr=3,Ta=4,wa=5,Aa=6,Ra=7,Uu=0,od=1,ad=2,_i=0,cd=1,ld=2,ud=3,Nu=4,hd=5,dd=6,fd=7,Fu=300,_r=301,xr=302,Ca=303,Pa=304,xo=306,rs=1e3,Di=1001,La=1002,xn=1003,pd=1004,Ms=1005,Nn=1006,Ao=1007,Ii=1008,On=1009,zu=1010,Ou=1011,ss=1012,Tc=1013,Ui=1014,Fn=1015,ms=1016,wc=1017,Ac=1018,os=1020,Bu=35902,ku=35899,Hu=1021,Vu=1022,Tn=1023,as=1026,cs=1027,Rc=1028,Cc=1029,Gu=1030,Pc=1031,Lc=1033,Ks=33776,Qs=33777,eo=33778,to=33779,Da=35840,Ia=35841,Ua=35842,Na=35843,Fa=36196,za=37492,Oa=37496,Ba=37808,ka=37809,Ha=37810,Va=37811,Ga=37812,Wa=37813,Xa=37814,qa=37815,Ya=37816,Za=37817,ja=37818,$a=37819,Ja=37820,Ka=37821,Qa=36492,ec=36494,tc=36495,nc=36283,ic=36284,rc=36285,sc=36286,md=3200,no=3201,Wu=0,gd=1,pi="",un="srgb",vr="srgb-linear",lo="linear",Et="srgb",Xi=7680,sl=519,_d=512,xd=513,vd=514,Xu=515,yd=516,Md=517,Sd=518,Ed=519,oc=35044,bd=35048,ol="300 es",zn=2e3,uo=2001;class Tr{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)}hasEventListener(e,t){const i=this._listeners;return i===void 0?!1:i[e]!==void 0&&i[e].indexOf(t)!==-1}removeEventListener(e,t){const i=this._listeners;if(i===void 0)return;const r=i[e];if(r!==void 0){const s=r.indexOf(t);s!==-1&&r.splice(s,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const i=t[e.type];if(i!==void 0){e.target=this;const r=i.slice(0);for(let s=0,o=r.length;s<o;s++)r[s].call(this,e);e.target=null}}}const Jt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Ro=Math.PI/180,ac=180/Math.PI;function ei(){const n=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(Jt[n&255]+Jt[n>>8&255]+Jt[n>>16&255]+Jt[n>>24&255]+"-"+Jt[e&255]+Jt[e>>8&255]+"-"+Jt[e>>16&15|64]+Jt[e>>24&255]+"-"+Jt[t&63|128]+Jt[t>>8&255]+"-"+Jt[t>>16&255]+Jt[t>>24&255]+Jt[i&255]+Jt[i>>8&255]+Jt[i>>16&255]+Jt[i>>24&255]).toLowerCase()}function lt(n,e,t){return Math.max(e,Math.min(t,n))}function Td(n,e){return(n%e+e)%e}function Co(n,e,t){return(1-t)*n+t*e}function Un(n,e){switch(e.constructor){case Float32Array:return n;case Uint32Array:return n/4294967295;case Uint16Array:return n/65535;case Uint8Array:return n/255;case Int32Array:return Math.max(n/2147483647,-1);case Int16Array:return Math.max(n/32767,-1);case Int8Array:return Math.max(n/127,-1);default:throw new Error("Invalid component type.")}}function bt(n,e){switch(e.constructor){case Float32Array:return n;case Uint32Array:return Math.round(n*4294967295);case Uint16Array:return Math.round(n*65535);case Uint8Array:return Math.round(n*255);case Int32Array:return Math.round(n*2147483647);case Int16Array:return Math.round(n*32767);case Int8Array:return Math.round(n*127);default:throw new Error("Invalid component type.")}}const wd={clamp:lt};class Ce{constructor(e=0,t=0){Ce.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,i=this.y,r=e.elements;return this.x=r[0]*t+r[3]*i+r[6],this.y=r[1]*t+r[4]*i+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=lt(this.x,e.x,t.x),this.y=lt(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=lt(this.x,e,t),this.y=lt(this.y,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(lt(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const i=this.dot(e)/t;return Math.acos(lt(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,i=this.y-e.y;return t*t+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const i=Math.cos(t),r=Math.sin(t),s=this.x-e.x,o=this.y-e.y;return this.x=s*i-o*r+e.x,this.y=s*r+o*i+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Vt{constructor(e=0,t=0,i=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=i,this._w=r}static slerpFlat(e,t,i,r,s,o,c){let l=i[r+0],a=i[r+1],u=i[r+2],h=i[r+3];const d=s[o+0],f=s[o+1],g=s[o+2],x=s[o+3];if(c===0){e[t+0]=l,e[t+1]=a,e[t+2]=u,e[t+3]=h;return}if(c===1){e[t+0]=d,e[t+1]=f,e[t+2]=g,e[t+3]=x;return}if(h!==x||l!==d||a!==f||u!==g){let m=1-c;const p=l*d+a*f+u*g+h*x,b=p>=0?1:-1,S=1-p*p;if(S>Number.EPSILON){const w=Math.sqrt(S),E=Math.atan2(w,p*b);m=Math.sin(m*E)/w,c=Math.sin(c*E)/w}const _=c*b;if(l=l*m+d*_,a=a*m+f*_,u=u*m+g*_,h=h*m+x*_,m===1-c){const w=1/Math.sqrt(l*l+a*a+u*u+h*h);l*=w,a*=w,u*=w,h*=w}}e[t]=l,e[t+1]=a,e[t+2]=u,e[t+3]=h}static multiplyQuaternionsFlat(e,t,i,r,s,o){const c=i[r],l=i[r+1],a=i[r+2],u=i[r+3],h=s[o],d=s[o+1],f=s[o+2],g=s[o+3];return e[t]=c*g+u*h+l*f-a*d,e[t+1]=l*g+u*d+a*h-c*f,e[t+2]=a*g+u*f+c*d-l*h,e[t+3]=u*g-c*h-l*d-a*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,i,r){return this._x=e,this._y=t,this._z=i,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const i=e._x,r=e._y,s=e._z,o=e._order,c=Math.cos,l=Math.sin,a=c(i/2),u=c(r/2),h=c(s/2),d=l(i/2),f=l(r/2),g=l(s/2);switch(o){case"XYZ":this._x=d*u*h+a*f*g,this._y=a*f*h-d*u*g,this._z=a*u*g+d*f*h,this._w=a*u*h-d*f*g;break;case"YXZ":this._x=d*u*h+a*f*g,this._y=a*f*h-d*u*g,this._z=a*u*g-d*f*h,this._w=a*u*h+d*f*g;break;case"ZXY":this._x=d*u*h-a*f*g,this._y=a*f*h+d*u*g,this._z=a*u*g+d*f*h,this._w=a*u*h-d*f*g;break;case"ZYX":this._x=d*u*h-a*f*g,this._y=a*f*h+d*u*g,this._z=a*u*g-d*f*h,this._w=a*u*h+d*f*g;break;case"YZX":this._x=d*u*h+a*f*g,this._y=a*f*h+d*u*g,this._z=a*u*g-d*f*h,this._w=a*u*h-d*f*g;break;case"XZY":this._x=d*u*h-a*f*g,this._y=a*f*h-d*u*g,this._z=a*u*g+d*f*h,this._w=a*u*h+d*f*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const i=t/2,r=Math.sin(i);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,i=t[0],r=t[4],s=t[8],o=t[1],c=t[5],l=t[9],a=t[2],u=t[6],h=t[10],d=i+c+h;if(d>0){const f=.5/Math.sqrt(d+1);this._w=.25/f,this._x=(u-l)*f,this._y=(s-a)*f,this._z=(o-r)*f}else if(i>c&&i>h){const f=2*Math.sqrt(1+i-c-h);this._w=(u-l)/f,this._x=.25*f,this._y=(r+o)/f,this._z=(s+a)/f}else if(c>h){const f=2*Math.sqrt(1+c-i-h);this._w=(s-a)/f,this._x=(r+o)/f,this._y=.25*f,this._z=(l+u)/f}else{const f=2*Math.sqrt(1+h-i-c);this._w=(o-r)/f,this._x=(s+a)/f,this._y=(l+u)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let i=e.dot(t)+1;return i<1e-8?(i=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=i):(this._x=0,this._y=-e.z,this._z=e.y,this._w=i)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=i),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(lt(this.dot(e),-1,1)))}rotateTowards(e,t){const i=this.angleTo(e);if(i===0)return this;const r=Math.min(1,t/i);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const i=e._x,r=e._y,s=e._z,o=e._w,c=t._x,l=t._y,a=t._z,u=t._w;return this._x=i*u+o*c+r*a-s*l,this._y=r*u+o*l+s*c-i*a,this._z=s*u+o*a+i*l-r*c,this._w=o*u-i*c-r*l-s*a,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);const i=this._x,r=this._y,s=this._z,o=this._w;let c=o*e._w+i*e._x+r*e._y+s*e._z;if(c<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,c=-c):this.copy(e),c>=1)return this._w=o,this._x=i,this._y=r,this._z=s,this;const l=1-c*c;if(l<=Number.EPSILON){const f=1-t;return this._w=f*o+t*this._w,this._x=f*i+t*this._x,this._y=f*r+t*this._y,this._z=f*s+t*this._z,this.normalize(),this}const a=Math.sqrt(l),u=Math.atan2(a,c),h=Math.sin((1-t)*u)/a,d=Math.sin(t*u)/a;return this._w=o*h+this._w*d,this._x=i*h+this._x*d,this._y=r*h+this._y*d,this._z=s*h+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,i){return this.copy(e).slerp(t,i)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),i=Math.random(),r=Math.sqrt(1-i),s=Math.sqrt(i);return this.set(r*Math.sin(e),r*Math.cos(e),s*Math.sin(t),s*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class I{constructor(e=0,t=0,i=0){I.prototype.isVector3=!0,this.x=e,this.y=t,this.z=i}set(e,t,i){return i===void 0&&(i=this.z),this.x=e,this.y=t,this.z=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(al.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(al.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,i=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[3]*i+s[6]*r,this.y=s[1]*t+s[4]*i+s[7]*r,this.z=s[2]*t+s[5]*i+s[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,i=this.y,r=this.z,s=e.elements,o=1/(s[3]*t+s[7]*i+s[11]*r+s[15]);return this.x=(s[0]*t+s[4]*i+s[8]*r+s[12])*o,this.y=(s[1]*t+s[5]*i+s[9]*r+s[13])*o,this.z=(s[2]*t+s[6]*i+s[10]*r+s[14])*o,this}applyQuaternion(e){const t=this.x,i=this.y,r=this.z,s=e.x,o=e.y,c=e.z,l=e.w,a=2*(o*r-c*i),u=2*(c*t-s*r),h=2*(s*i-o*t);return this.x=t+l*a+o*h-c*u,this.y=i+l*u+c*a-s*h,this.z=r+l*h+s*u-o*a,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,i=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[4]*i+s[8]*r,this.y=s[1]*t+s[5]*i+s[9]*r,this.z=s[2]*t+s[6]*i+s[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=lt(this.x,e.x,t.x),this.y=lt(this.y,e.y,t.y),this.z=lt(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=lt(this.x,e,t),this.y=lt(this.y,e,t),this.z=lt(this.z,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(lt(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const i=e.x,r=e.y,s=e.z,o=t.x,c=t.y,l=t.z;return this.x=r*l-s*c,this.y=s*o-i*l,this.z=i*c-r*o,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const i=e.dot(this)/t;return this.copy(e).multiplyScalar(i)}projectOnPlane(e){return Po.copy(this).projectOnVector(e),this.sub(Po)}reflect(e){return this.sub(Po.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const i=this.dot(e)/t;return Math.acos(lt(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,i=this.y-e.y,r=this.z-e.z;return t*t+i*i+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,i){const r=Math.sin(t)*e;return this.x=r*Math.sin(i),this.y=Math.cos(t)*e,this.z=r*Math.cos(i),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,i){return this.x=e*Math.sin(t),this.y=i,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),i=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=i,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,i=Math.sqrt(1-t*t);return this.x=i*Math.cos(e),this.y=t,this.z=i*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const Po=new I,al=new Vt;class it{constructor(e,t,i,r,s,o,c,l,a){it.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,i,r,s,o,c,l,a)}set(e,t,i,r,s,o,c,l,a){const u=this.elements;return u[0]=e,u[1]=r,u[2]=c,u[3]=t,u[4]=s,u[5]=l,u[6]=i,u[7]=o,u[8]=a,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],this}extractBasis(e,t,i){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const i=e.elements,r=t.elements,s=this.elements,o=i[0],c=i[3],l=i[6],a=i[1],u=i[4],h=i[7],d=i[2],f=i[5],g=i[8],x=r[0],m=r[3],p=r[6],b=r[1],S=r[4],_=r[7],w=r[2],E=r[5],C=r[8];return s[0]=o*x+c*b+l*w,s[3]=o*m+c*S+l*E,s[6]=o*p+c*_+l*C,s[1]=a*x+u*b+h*w,s[4]=a*m+u*S+h*E,s[7]=a*p+u*_+h*C,s[2]=d*x+f*b+g*w,s[5]=d*m+f*S+g*E,s[8]=d*p+f*_+g*C,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],o=e[4],c=e[5],l=e[6],a=e[7],u=e[8];return t*o*u-t*c*a-i*s*u+i*c*l+r*s*a-r*o*l}invert(){const e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],o=e[4],c=e[5],l=e[6],a=e[7],u=e[8],h=u*o-c*a,d=c*l-u*s,f=a*s-o*l,g=t*h+i*d+r*f;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);const x=1/g;return e[0]=h*x,e[1]=(r*a-u*i)*x,e[2]=(c*i-r*o)*x,e[3]=d*x,e[4]=(u*t-r*l)*x,e[5]=(r*s-c*t)*x,e[6]=f*x,e[7]=(i*l-a*t)*x,e[8]=(o*t-i*s)*x,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,i,r,s,o,c){const l=Math.cos(s),a=Math.sin(s);return this.set(i*l,i*a,-i*(l*o+a*c)+o+e,-r*a,r*l,-r*(-a*o+l*c)+c+t,0,0,1),this}scale(e,t){return this.premultiply(Lo.makeScale(e,t)),this}rotate(e){return this.premultiply(Lo.makeRotation(-e)),this}translate(e,t){return this.premultiply(Lo.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,i,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,i=e.elements;for(let r=0;r<9;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<9;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){const i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const Lo=new it;function qu(n){for(let e=n.length-1;e>=0;--e)if(n[e]>=65535)return!0;return!1}function ho(n){return document.createElementNS("http://www.w3.org/1999/xhtml",n)}function Ad(){const n=ho("canvas");return n.style.display="block",n}const cl={};function ls(n){n in cl||(cl[n]=!0,console.warn(n))}function Rd(n,e,t){return new Promise(function(i,r){function s(){switch(n.clientWaitSync(e,n.SYNC_FLUSH_COMMANDS_BIT,0)){case n.WAIT_FAILED:r();break;case n.TIMEOUT_EXPIRED:setTimeout(s,t);break;default:i()}}setTimeout(s,t)})}const ll=new it().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),ul=new it().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Cd(){const n={enabled:!0,workingColorSpace:vr,spaces:{},convert:function(r,s,o){return this.enabled===!1||s===o||!s||!o||(this.spaces[s].transfer===Et&&(r.r=ti(r.r),r.g=ti(r.g),r.b=ti(r.b)),this.spaces[s].primaries!==this.spaces[o].primaries&&(r.applyMatrix3(this.spaces[s].toXYZ),r.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===Et&&(r.r=pr(r.r),r.g=pr(r.g),r.b=pr(r.b))),r},workingToColorSpace:function(r,s){return this.convert(r,this.workingColorSpace,s)},colorSpaceToWorking:function(r,s){return this.convert(r,s,this.workingColorSpace)},getPrimaries:function(r){return this.spaces[r].primaries},getTransfer:function(r){return r===pi?lo:this.spaces[r].transfer},getToneMappingMode:function(r){return this.spaces[r].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(r,s=this.workingColorSpace){return r.fromArray(this.spaces[s].luminanceCoefficients)},define:function(r){Object.assign(this.spaces,r)},_getMatrix:function(r,s,o){return r.copy(this.spaces[s].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(r){return this.spaces[r].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(r=this.workingColorSpace){return this.spaces[r].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(r,s){return ls("THREE.ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),n.workingToColorSpace(r,s)},toWorkingColorSpace:function(r,s){return ls("THREE.ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),n.colorSpaceToWorking(r,s)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],i=[.3127,.329];return n.define({[vr]:{primaries:e,whitePoint:i,transfer:lo,toXYZ:ll,fromXYZ:ul,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:un},outputColorSpaceConfig:{drawingBufferColorSpace:un}},[un]:{primaries:e,whitePoint:i,transfer:Et,toXYZ:ll,fromXYZ:ul,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:un}}}),n}const xt=Cd();function ti(n){return n<.04045?n*.0773993808:Math.pow(n*.9478672986+.0521327014,2.4)}function pr(n){return n<.0031308?n*12.92:1.055*Math.pow(n,.41666)-.055}let qi;class Pd{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let i;if(e instanceof HTMLCanvasElement)i=e;else{qi===void 0&&(qi=ho("canvas")),qi.width=e.width,qi.height=e.height;const r=qi.getContext("2d");e instanceof ImageData?r.putImageData(e,0,0):r.drawImage(e,0,0,e.width,e.height),i=qi}return i.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=ho("canvas");t.width=e.width,t.height=e.height;const i=t.getContext("2d");i.drawImage(e,0,0,e.width,e.height);const r=i.getImageData(0,0,e.width,e.height),s=r.data;for(let o=0;o<s.length;o++)s[o]=ti(s[o]/255)*255;return i.putImageData(r,0,0),t}else if(e.data){const t=e.data.slice(0);for(let i=0;i<t.length;i++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[i]=Math.floor(ti(t[i]/255)*255):t[i]=ti(t[i]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let Ld=0;class Dc{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Ld++}),this.uuid=ei(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const i={uuid:this.uuid,url:""},r=this.data;if(r!==null){let s;if(Array.isArray(r)){s=[];for(let o=0,c=r.length;o<c;o++)r[o].isDataTexture?s.push(Do(r[o].image)):s.push(Do(r[o]))}else s=Do(r);i.url=s}return t||(e.images[this.uuid]=i),i}}function Do(n){return typeof HTMLImageElement<"u"&&n instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&n instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&n instanceof ImageBitmap?Pd.getDataURL(n):n.data?{data:Array.from(n.data),width:n.width,height:n.height,type:n.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}let Dd=0;const Io=new I;class Qt extends Tr{constructor(e=Qt.DEFAULT_IMAGE,t=Qt.DEFAULT_MAPPING,i=Di,r=Di,s=Nn,o=Ii,c=Tn,l=On,a=Qt.DEFAULT_ANISOTROPY,u=pi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Dd++}),this.uuid=ei(),this.name="",this.source=new Dc(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=i,this.wrapT=r,this.magFilter=s,this.minFilter=o,this.anisotropy=a,this.format=c,this.internalFormat=null,this.type=l,this.offset=new Ce(0,0),this.repeat=new Ce(1,1),this.center=new Ce(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new it,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(Io).x}get height(){return this.source.getSize(Io).y}get depth(){return this.source.getSize(Io).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const i=e[t];if(i===void 0){console.warn(`THREE.Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const r=this[t];if(r===void 0){console.warn(`THREE.Texture.setValues(): property '${t}' does not exist.`);continue}r&&i&&r.isVector2&&i.isVector2||r&&i&&r.isVector3&&i.isVector3||r&&i&&r.isMatrix3&&i.isMatrix3?r.copy(i):this[t]=i}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const i={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),t||(e.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Fu)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case rs:e.x=e.x-Math.floor(e.x);break;case Di:e.x=e.x<0?0:1;break;case La:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case rs:e.y=e.y-Math.floor(e.y);break;case Di:e.y=e.y<0?0:1;break;case La:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}Qt.DEFAULT_IMAGE=null;Qt.DEFAULT_MAPPING=Fu;Qt.DEFAULT_ANISOTROPY=1;class Tt{constructor(e=0,t=0,i=0,r=1){Tt.prototype.isVector4=!0,this.x=e,this.y=t,this.z=i,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,i,r){return this.x=e,this.y=t,this.z=i,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,i=this.y,r=this.z,s=this.w,o=e.elements;return this.x=o[0]*t+o[4]*i+o[8]*r+o[12]*s,this.y=o[1]*t+o[5]*i+o[9]*r+o[13]*s,this.z=o[2]*t+o[6]*i+o[10]*r+o[14]*s,this.w=o[3]*t+o[7]*i+o[11]*r+o[15]*s,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,i,r,s;const l=e.elements,a=l[0],u=l[4],h=l[8],d=l[1],f=l[5],g=l[9],x=l[2],m=l[6],p=l[10];if(Math.abs(u-d)<.01&&Math.abs(h-x)<.01&&Math.abs(g-m)<.01){if(Math.abs(u+d)<.1&&Math.abs(h+x)<.1&&Math.abs(g+m)<.1&&Math.abs(a+f+p-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const S=(a+1)/2,_=(f+1)/2,w=(p+1)/2,E=(u+d)/4,C=(h+x)/4,L=(g+m)/4;return S>_&&S>w?S<.01?(i=0,r=.707106781,s=.707106781):(i=Math.sqrt(S),r=E/i,s=C/i):_>w?_<.01?(i=.707106781,r=0,s=.707106781):(r=Math.sqrt(_),i=E/r,s=L/r):w<.01?(i=.707106781,r=.707106781,s=0):(s=Math.sqrt(w),i=C/s,r=L/s),this.set(i,r,s,t),this}let b=Math.sqrt((m-g)*(m-g)+(h-x)*(h-x)+(d-u)*(d-u));return Math.abs(b)<.001&&(b=1),this.x=(m-g)/b,this.y=(h-x)/b,this.z=(d-u)/b,this.w=Math.acos((a+f+p-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=lt(this.x,e.x,t.x),this.y=lt(this.y,e.y,t.y),this.z=lt(this.z,e.z,t.z),this.w=lt(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=lt(this.x,e,t),this.y=lt(this.y,e,t),this.z=lt(this.z,e,t),this.w=lt(this.w,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(lt(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this.w=e.w+(t.w-e.w)*i,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class Id extends Tr{constructor(e=1,t=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Nn,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},i),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=i.depth,this.scissor=new Tt(0,0,e,t),this.scissorTest=!1,this.viewport=new Tt(0,0,e,t);const r={width:e,height:t,depth:i.depth},s=new Qt(r);this.textures=[];const o=i.count;for(let c=0;c<o;c++)this.textures[c]=s.clone(),this.textures[c].isRenderTargetTexture=!0,this.textures[c].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview}_setTextureOptions(e={}){const t={minFilter:Nn,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,i=1){if(this.width!==e||this.height!==t||this.depth!==i){this.width=e,this.height=t,this.depth=i;for(let r=0,s=this.textures.length;r<s;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=i,this.textures[r].isArrayTexture=this.textures[r].image.depth>1;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,i=e.textures.length;t<i;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const r=Object.assign({},e.textures[t].image);this.textures[t].source=new Dc(r)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Ni extends Id{constructor(e=1,t=1,i={}){super(e,t,i),this.isWebGLRenderTarget=!0}}class Yu extends Qt{constructor(e=null,t=1,i=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=xn,this.minFilter=xn,this.wrapR=Di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class Ud extends Qt{constructor(e=null,t=1,i=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=xn,this.minFilter=xn,this.wrapR=Di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Bn{constructor(e=new I(1/0,1/0,1/0),t=new I(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t+=3)this.expandByPoint(Cn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,i=e.count;t<i;t++)this.expandByPoint(Cn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const i=Cn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const i=e.geometry;if(i!==void 0){const s=i.getAttribute("position");if(t===!0&&s!==void 0&&e.isInstancedMesh!==!0)for(let o=0,c=s.count;o<c;o++)e.isMesh===!0?e.getVertexPosition(o,Cn):Cn.fromBufferAttribute(s,o),Cn.applyMatrix4(e.matrixWorld),this.expandByPoint(Cn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Ss.copy(e.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),Ss.copy(i.boundingBox)),Ss.applyMatrix4(e.matrixWorld),this.union(Ss)}const r=e.children;for(let s=0,o=r.length;s<o;s++)this.expandByObject(r[s],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Cn),Cn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Nr),Es.subVectors(this.max,Nr),Yi.subVectors(e.a,Nr),Zi.subVectors(e.b,Nr),ji.subVectors(e.c,Nr),oi.subVectors(Zi,Yi),ai.subVectors(ji,Zi),yi.subVectors(Yi,ji);let t=[0,-oi.z,oi.y,0,-ai.z,ai.y,0,-yi.z,yi.y,oi.z,0,-oi.x,ai.z,0,-ai.x,yi.z,0,-yi.x,-oi.y,oi.x,0,-ai.y,ai.x,0,-yi.y,yi.x,0];return!Uo(t,Yi,Zi,ji,Es)||(t=[1,0,0,0,1,0,0,0,1],!Uo(t,Yi,Zi,ji,Es))?!1:(bs.crossVectors(oi,ai),t=[bs.x,bs.y,bs.z],Uo(t,Yi,Zi,ji,Es))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Cn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Cn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Gn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Gn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Gn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Gn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Gn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Gn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Gn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Gn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Gn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const Gn=[new I,new I,new I,new I,new I,new I,new I,new I],Cn=new I,Ss=new Bn,Yi=new I,Zi=new I,ji=new I,oi=new I,ai=new I,yi=new I,Nr=new I,Es=new I,bs=new I,Mi=new I;function Uo(n,e,t,i,r){for(let s=0,o=n.length-3;s<=o;s+=3){Mi.fromArray(n,s);const c=r.x*Math.abs(Mi.x)+r.y*Math.abs(Mi.y)+r.z*Math.abs(Mi.z),l=e.dot(Mi),a=t.dot(Mi),u=i.dot(Mi);if(Math.max(-Math.max(l,a,u),Math.min(l,a,u))>c)return!1}return!0}const Nd=new Bn,Fr=new I,No=new I;class gs{constructor(e=new I,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const i=this.center;t!==void 0?i.copy(t):Nd.setFromPoints(e).getCenter(i);let r=0;for(let s=0,o=e.length;s<o;s++)r=Math.max(r,i.distanceToSquared(e[s]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const i=this.center.distanceToSquared(e);return t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Fr.subVectors(e,this.center);const t=Fr.lengthSq();if(t>this.radius*this.radius){const i=Math.sqrt(t),r=(i-this.radius)*.5;this.center.addScaledVector(Fr,r/i),this.radius+=r}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(No.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Fr.copy(e.center).add(No)),this.expandByPoint(Fr.copy(e.center).sub(No))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}const Wn=new I,Fo=new I,Ts=new I,ci=new I,zo=new I,ws=new I,Oo=new I;class Zu{constructor(e=new I,t=new I(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Wn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=Wn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Wn.copy(this.origin).addScaledVector(this.direction,t),Wn.distanceToSquared(e))}distanceSqToSegment(e,t,i,r){Fo.copy(e).add(t).multiplyScalar(.5),Ts.copy(t).sub(e).normalize(),ci.copy(this.origin).sub(Fo);const s=e.distanceTo(t)*.5,o=-this.direction.dot(Ts),c=ci.dot(this.direction),l=-ci.dot(Ts),a=ci.lengthSq(),u=Math.abs(1-o*o);let h,d,f,g;if(u>0)if(h=o*l-c,d=o*c-l,g=s*u,h>=0)if(d>=-g)if(d<=g){const x=1/u;h*=x,d*=x,f=h*(h+o*d+2*c)+d*(o*h+d+2*l)+a}else d=s,h=Math.max(0,-(o*d+c)),f=-h*h+d*(d+2*l)+a;else d=-s,h=Math.max(0,-(o*d+c)),f=-h*h+d*(d+2*l)+a;else d<=-g?(h=Math.max(0,-(-o*s+c)),d=h>0?-s:Math.min(Math.max(-s,-l),s),f=-h*h+d*(d+2*l)+a):d<=g?(h=0,d=Math.min(Math.max(-s,-l),s),f=d*(d+2*l)+a):(h=Math.max(0,-(o*s+c)),d=h>0?s:Math.min(Math.max(-s,-l),s),f=-h*h+d*(d+2*l)+a);else d=o>0?-s:s,h=Math.max(0,-(o*d+c)),f=-h*h+d*(d+2*l)+a;return i&&i.copy(this.origin).addScaledVector(this.direction,h),r&&r.copy(Fo).addScaledVector(Ts,d),f}intersectSphere(e,t){Wn.subVectors(e.center,this.origin);const i=Wn.dot(this.direction),r=Wn.dot(Wn)-i*i,s=e.radius*e.radius;if(r>s)return null;const o=Math.sqrt(s-r),c=i-o,l=i+o;return l<0?null:c<0?this.at(l,t):this.at(c,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null}intersectPlane(e,t){const i=this.distanceToPlane(e);return i===null?null:this.at(i,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let i,r,s,o,c,l;const a=1/this.direction.x,u=1/this.direction.y,h=1/this.direction.z,d=this.origin;return a>=0?(i=(e.min.x-d.x)*a,r=(e.max.x-d.x)*a):(i=(e.max.x-d.x)*a,r=(e.min.x-d.x)*a),u>=0?(s=(e.min.y-d.y)*u,o=(e.max.y-d.y)*u):(s=(e.max.y-d.y)*u,o=(e.min.y-d.y)*u),i>o||s>r||((s>i||isNaN(i))&&(i=s),(o<r||isNaN(r))&&(r=o),h>=0?(c=(e.min.z-d.z)*h,l=(e.max.z-d.z)*h):(c=(e.max.z-d.z)*h,l=(e.min.z-d.z)*h),i>l||c>r)||((c>i||i!==i)&&(i=c),(l<r||r!==r)&&(r=l),r<0)?null:this.at(i>=0?i:r,t)}intersectsBox(e){return this.intersectBox(e,Wn)!==null}intersectTriangle(e,t,i,r,s){zo.subVectors(t,e),ws.subVectors(i,e),Oo.crossVectors(zo,ws);let o=this.direction.dot(Oo),c;if(o>0){if(r)return null;c=1}else if(o<0)c=-1,o=-o;else return null;ci.subVectors(this.origin,e);const l=c*this.direction.dot(ws.crossVectors(ci,ws));if(l<0)return null;const a=c*this.direction.dot(zo.cross(ci));if(a<0||l+a>o)return null;const u=-c*ci.dot(Oo);return u<0?null:this.at(u/o,s)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class mt{constructor(e,t,i,r,s,o,c,l,a,u,h,d,f,g,x,m){mt.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,i,r,s,o,c,l,a,u,h,d,f,g,x,m)}set(e,t,i,r,s,o,c,l,a,u,h,d,f,g,x,m){const p=this.elements;return p[0]=e,p[4]=t,p[8]=i,p[12]=r,p[1]=s,p[5]=o,p[9]=c,p[13]=l,p[2]=a,p[6]=u,p[10]=h,p[14]=d,p[3]=f,p[7]=g,p[11]=x,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new mt().fromArray(this.elements)}copy(e){const t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=i[11],t[12]=i[12],t[13]=i[13],t[14]=i[14],t[15]=i[15],this}copyPosition(e){const t=this.elements,i=e.elements;return t[12]=i[12],t[13]=i[13],t[14]=i[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,i){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this}makeBasis(e,t,i){return this.set(e.x,t.x,i.x,0,e.y,t.y,i.y,0,e.z,t.z,i.z,0,0,0,0,1),this}extractRotation(e){const t=this.elements,i=e.elements,r=1/$i.setFromMatrixColumn(e,0).length(),s=1/$i.setFromMatrixColumn(e,1).length(),o=1/$i.setFromMatrixColumn(e,2).length();return t[0]=i[0]*r,t[1]=i[1]*r,t[2]=i[2]*r,t[3]=0,t[4]=i[4]*s,t[5]=i[5]*s,t[6]=i[6]*s,t[7]=0,t[8]=i[8]*o,t[9]=i[9]*o,t[10]=i[10]*o,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,i=e.x,r=e.y,s=e.z,o=Math.cos(i),c=Math.sin(i),l=Math.cos(r),a=Math.sin(r),u=Math.cos(s),h=Math.sin(s);if(e.order==="XYZ"){const d=o*u,f=o*h,g=c*u,x=c*h;t[0]=l*u,t[4]=-l*h,t[8]=a,t[1]=f+g*a,t[5]=d-x*a,t[9]=-c*l,t[2]=x-d*a,t[6]=g+f*a,t[10]=o*l}else if(e.order==="YXZ"){const d=l*u,f=l*h,g=a*u,x=a*h;t[0]=d+x*c,t[4]=g*c-f,t[8]=o*a,t[1]=o*h,t[5]=o*u,t[9]=-c,t[2]=f*c-g,t[6]=x+d*c,t[10]=o*l}else if(e.order==="ZXY"){const d=l*u,f=l*h,g=a*u,x=a*h;t[0]=d-x*c,t[4]=-o*h,t[8]=g+f*c,t[1]=f+g*c,t[5]=o*u,t[9]=x-d*c,t[2]=-o*a,t[6]=c,t[10]=o*l}else if(e.order==="ZYX"){const d=o*u,f=o*h,g=c*u,x=c*h;t[0]=l*u,t[4]=g*a-f,t[8]=d*a+x,t[1]=l*h,t[5]=x*a+d,t[9]=f*a-g,t[2]=-a,t[6]=c*l,t[10]=o*l}else if(e.order==="YZX"){const d=o*l,f=o*a,g=c*l,x=c*a;t[0]=l*u,t[4]=x-d*h,t[8]=g*h+f,t[1]=h,t[5]=o*u,t[9]=-c*u,t[2]=-a*u,t[6]=f*h+g,t[10]=d-x*h}else if(e.order==="XZY"){const d=o*l,f=o*a,g=c*l,x=c*a;t[0]=l*u,t[4]=-h,t[8]=a*u,t[1]=d*h+x,t[5]=o*u,t[9]=f*h-g,t[2]=g*h-f,t[6]=c*u,t[10]=x*h+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Fd,e,zd)}lookAt(e,t,i){const r=this.elements;return fn.subVectors(e,t),fn.lengthSq()===0&&(fn.z=1),fn.normalize(),li.crossVectors(i,fn),li.lengthSq()===0&&(Math.abs(i.z)===1?fn.x+=1e-4:fn.z+=1e-4,fn.normalize(),li.crossVectors(i,fn)),li.normalize(),As.crossVectors(fn,li),r[0]=li.x,r[4]=As.x,r[8]=fn.x,r[1]=li.y,r[5]=As.y,r[9]=fn.y,r[2]=li.z,r[6]=As.z,r[10]=fn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const i=e.elements,r=t.elements,s=this.elements,o=i[0],c=i[4],l=i[8],a=i[12],u=i[1],h=i[5],d=i[9],f=i[13],g=i[2],x=i[6],m=i[10],p=i[14],b=i[3],S=i[7],_=i[11],w=i[15],E=r[0],C=r[4],L=r[8],v=r[12],y=r[1],R=r[5],U=r[9],F=r[13],Y=r[2],G=r[6],H=r[10],J=r[14],W=r[3],le=r[7],_e=r[11],we=r[15];return s[0]=o*E+c*y+l*Y+a*W,s[4]=o*C+c*R+l*G+a*le,s[8]=o*L+c*U+l*H+a*_e,s[12]=o*v+c*F+l*J+a*we,s[1]=u*E+h*y+d*Y+f*W,s[5]=u*C+h*R+d*G+f*le,s[9]=u*L+h*U+d*H+f*_e,s[13]=u*v+h*F+d*J+f*we,s[2]=g*E+x*y+m*Y+p*W,s[6]=g*C+x*R+m*G+p*le,s[10]=g*L+x*U+m*H+p*_e,s[14]=g*v+x*F+m*J+p*we,s[3]=b*E+S*y+_*Y+w*W,s[7]=b*C+S*R+_*G+w*le,s[11]=b*L+S*U+_*H+w*_e,s[15]=b*v+S*F+_*J+w*we,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],i=e[4],r=e[8],s=e[12],o=e[1],c=e[5],l=e[9],a=e[13],u=e[2],h=e[6],d=e[10],f=e[14],g=e[3],x=e[7],m=e[11],p=e[15];return g*(+s*l*h-r*a*h-s*c*d+i*a*d+r*c*f-i*l*f)+x*(+t*l*f-t*a*d+s*o*d-r*o*f+r*a*u-s*l*u)+m*(+t*a*h-t*c*f-s*o*h+i*o*f+s*c*u-i*a*u)+p*(-r*c*u-t*l*h+t*c*d+r*o*h-i*o*d+i*l*u)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,i){const r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=i),this}invert(){const e=this.elements,t=e[0],i=e[1],r=e[2],s=e[3],o=e[4],c=e[5],l=e[6],a=e[7],u=e[8],h=e[9],d=e[10],f=e[11],g=e[12],x=e[13],m=e[14],p=e[15],b=h*m*a-x*d*a+x*l*f-c*m*f-h*l*p+c*d*p,S=g*d*a-u*m*a-g*l*f+o*m*f+u*l*p-o*d*p,_=u*x*a-g*h*a+g*c*f-o*x*f-u*c*p+o*h*p,w=g*h*l-u*x*l-g*c*d+o*x*d+u*c*m-o*h*m,E=t*b+i*S+r*_+s*w;if(E===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const C=1/E;return e[0]=b*C,e[1]=(x*d*s-h*m*s-x*r*f+i*m*f+h*r*p-i*d*p)*C,e[2]=(c*m*s-x*l*s+x*r*a-i*m*a-c*r*p+i*l*p)*C,e[3]=(h*l*s-c*d*s-h*r*a+i*d*a+c*r*f-i*l*f)*C,e[4]=S*C,e[5]=(u*m*s-g*d*s+g*r*f-t*m*f-u*r*p+t*d*p)*C,e[6]=(g*l*s-o*m*s-g*r*a+t*m*a+o*r*p-t*l*p)*C,e[7]=(o*d*s-u*l*s+u*r*a-t*d*a-o*r*f+t*l*f)*C,e[8]=_*C,e[9]=(g*h*s-u*x*s-g*i*f+t*x*f+u*i*p-t*h*p)*C,e[10]=(o*x*s-g*c*s+g*i*a-t*x*a-o*i*p+t*c*p)*C,e[11]=(u*c*s-o*h*s-u*i*a+t*h*a+o*i*f-t*c*f)*C,e[12]=w*C,e[13]=(u*x*r-g*h*r+g*i*d-t*x*d-u*i*m+t*h*m)*C,e[14]=(g*c*r-o*x*r-g*i*l+t*x*l+o*i*m-t*c*m)*C,e[15]=(o*h*r-u*c*r+u*i*l-t*h*l-o*i*d+t*c*d)*C,this}scale(e){const t=this.elements,i=e.x,r=e.y,s=e.z;return t[0]*=i,t[4]*=r,t[8]*=s,t[1]*=i,t[5]*=r,t[9]*=s,t[2]*=i,t[6]*=r,t[10]*=s,t[3]*=i,t[7]*=r,t[11]*=s,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],i=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,i,r))}makeTranslation(e,t,i){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,i,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),i=Math.sin(e);return this.set(1,0,0,0,0,t,-i,0,0,i,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,0,i,0,0,1,0,0,-i,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,0,i,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const i=Math.cos(t),r=Math.sin(t),s=1-i,o=e.x,c=e.y,l=e.z,a=s*o,u=s*c;return this.set(a*o+i,a*c-r*l,a*l+r*c,0,a*c+r*l,u*c+i,u*l-r*o,0,a*l-r*c,u*l+r*o,s*l*l+i,0,0,0,0,1),this}makeScale(e,t,i){return this.set(e,0,0,0,0,t,0,0,0,0,i,0,0,0,0,1),this}makeShear(e,t,i,r,s,o){return this.set(1,i,s,0,e,1,o,0,t,r,1,0,0,0,0,1),this}compose(e,t,i){const r=this.elements,s=t._x,o=t._y,c=t._z,l=t._w,a=s+s,u=o+o,h=c+c,d=s*a,f=s*u,g=s*h,x=o*u,m=o*h,p=c*h,b=l*a,S=l*u,_=l*h,w=i.x,E=i.y,C=i.z;return r[0]=(1-(x+p))*w,r[1]=(f+_)*w,r[2]=(g-S)*w,r[3]=0,r[4]=(f-_)*E,r[5]=(1-(d+p))*E,r[6]=(m+b)*E,r[7]=0,r[8]=(g+S)*C,r[9]=(m-b)*C,r[10]=(1-(d+x))*C,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,i){const r=this.elements;let s=$i.set(r[0],r[1],r[2]).length();const o=$i.set(r[4],r[5],r[6]).length(),c=$i.set(r[8],r[9],r[10]).length();this.determinant()<0&&(s=-s),e.x=r[12],e.y=r[13],e.z=r[14],Pn.copy(this);const a=1/s,u=1/o,h=1/c;return Pn.elements[0]*=a,Pn.elements[1]*=a,Pn.elements[2]*=a,Pn.elements[4]*=u,Pn.elements[5]*=u,Pn.elements[6]*=u,Pn.elements[8]*=h,Pn.elements[9]*=h,Pn.elements[10]*=h,t.setFromRotationMatrix(Pn),i.x=s,i.y=o,i.z=c,this}makePerspective(e,t,i,r,s,o,c=zn,l=!1){const a=this.elements,u=2*s/(t-e),h=2*s/(i-r),d=(t+e)/(t-e),f=(i+r)/(i-r);let g,x;if(l)g=s/(o-s),x=o*s/(o-s);else if(c===zn)g=-(o+s)/(o-s),x=-2*o*s/(o-s);else if(c===uo)g=-o/(o-s),x=-o*s/(o-s);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+c);return a[0]=u,a[4]=0,a[8]=d,a[12]=0,a[1]=0,a[5]=h,a[9]=f,a[13]=0,a[2]=0,a[6]=0,a[10]=g,a[14]=x,a[3]=0,a[7]=0,a[11]=-1,a[15]=0,this}makeOrthographic(e,t,i,r,s,o,c=zn,l=!1){const a=this.elements,u=2/(t-e),h=2/(i-r),d=-(t+e)/(t-e),f=-(i+r)/(i-r);let g,x;if(l)g=1/(o-s),x=o/(o-s);else if(c===zn)g=-2/(o-s),x=-(o+s)/(o-s);else if(c===uo)g=-1/(o-s),x=-s/(o-s);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+c);return a[0]=u,a[4]=0,a[8]=0,a[12]=d,a[1]=0,a[5]=h,a[9]=0,a[13]=f,a[2]=0,a[6]=0,a[10]=g,a[14]=x,a[3]=0,a[7]=0,a[11]=0,a[15]=1,this}equals(e){const t=this.elements,i=e.elements;for(let r=0;r<16;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<16;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){const i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e[t+9]=i[9],e[t+10]=i[10],e[t+11]=i[11],e[t+12]=i[12],e[t+13]=i[13],e[t+14]=i[14],e[t+15]=i[15],e}}const $i=new I,Pn=new mt,Fd=new I(0,0,0),zd=new I(1,1,1),li=new I,As=new I,fn=new I,hl=new mt,dl=new Vt;class an{constructor(e=0,t=0,i=0,r=an.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=i,this._order=r}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,i,r=this._order){return this._x=e,this._y=t,this._z=i,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,i=!0){const r=e.elements,s=r[0],o=r[4],c=r[8],l=r[1],a=r[5],u=r[9],h=r[2],d=r[6],f=r[10];switch(t){case"XYZ":this._y=Math.asin(lt(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-u,f),this._z=Math.atan2(-o,s)):(this._x=Math.atan2(d,a),this._z=0);break;case"YXZ":this._x=Math.asin(-lt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(c,f),this._z=Math.atan2(l,a)):(this._y=Math.atan2(-h,s),this._z=0);break;case"ZXY":this._x=Math.asin(lt(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-h,f),this._z=Math.atan2(-o,a)):(this._y=0,this._z=Math.atan2(l,s));break;case"ZYX":this._y=Math.asin(-lt(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(l,s)):(this._x=0,this._z=Math.atan2(-o,a));break;case"YZX":this._z=Math.asin(lt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,a),this._y=Math.atan2(-h,s)):(this._x=0,this._y=Math.atan2(c,f));break;case"XZY":this._z=Math.asin(-lt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(d,a),this._y=Math.atan2(c,s)):(this._x=Math.atan2(-u,f),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,i===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,i){return hl.makeRotationFromQuaternion(e),this.setFromRotationMatrix(hl,t,i)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return dl.setFromEuler(this),this.setFromQuaternion(dl,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}an.DEFAULT_ORDER="XYZ";class Ic{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let Od=0;const fl=new I,Ji=new Vt,Xn=new mt,Rs=new I,zr=new I,Bd=new I,kd=new Vt,pl=new I(1,0,0),ml=new I(0,1,0),gl=new I(0,0,1),_l={type:"added"},Hd={type:"removed"},Ki={type:"childadded",child:null},Bo={type:"childremoved",child:null};class It extends Tr{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Od++}),this.uuid=ei(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=It.DEFAULT_UP.clone();const e=new I,t=new an,i=new Vt,r=new I(1,1,1);function s(){i.setFromEuler(t,!1)}function o(){t.setFromQuaternion(i,void 0,!1)}t._onChange(s),i._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:r},modelViewMatrix:{value:new mt},normalMatrix:{value:new it}}),this.matrix=new mt,this.matrixWorld=new mt,this.matrixAutoUpdate=It.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=It.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Ic,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Ji.setFromAxisAngle(e,t),this.quaternion.multiply(Ji),this}rotateOnWorldAxis(e,t){return Ji.setFromAxisAngle(e,t),this.quaternion.premultiply(Ji),this}rotateX(e){return this.rotateOnAxis(pl,e)}rotateY(e){return this.rotateOnAxis(ml,e)}rotateZ(e){return this.rotateOnAxis(gl,e)}translateOnAxis(e,t){return fl.copy(e).applyQuaternion(this.quaternion),this.position.add(fl.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(pl,e)}translateY(e){return this.translateOnAxis(ml,e)}translateZ(e){return this.translateOnAxis(gl,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Xn.copy(this.matrixWorld).invert())}lookAt(e,t,i){e.isVector3?Rs.copy(e):Rs.set(e,t,i);const r=this.parent;this.updateWorldMatrix(!0,!1),zr.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Xn.lookAt(zr,Rs,this.up):Xn.lookAt(Rs,zr,this.up),this.quaternion.setFromRotationMatrix(Xn),r&&(Xn.extractRotation(r.matrixWorld),Ji.setFromRotationMatrix(Xn),this.quaternion.premultiply(Ji.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(_l),Ki.child=e,this.dispatchEvent(Ki),Ki.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Hd),Bo.child=e,this.dispatchEvent(Bo),Bo.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Xn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Xn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Xn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(_l),Ki.child=e,this.dispatchEvent(Ki),Ki.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let i=0,r=this.children.length;i<r;i++){const o=this.children[i].getObjectByProperty(e,t);if(o!==void 0)return o}}getObjectsByProperty(e,t,i=[]){this[e]===t&&i.push(this);const r=this.children;for(let s=0,o=r.length;s<o;s++)r[s].getObjectsByProperty(e,t,i);return i}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(zr,e,Bd),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(zr,kd,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].updateMatrixWorld(e)}updateWorldMatrix(e,t){const i=this.parent;if(e===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){const r=this.children;for(let s=0,o=r.length;s<o;s++)r[s].updateWorldMatrix(!1,!0)}}toJSON(e){const t=e===void 0||typeof e=="string",i={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const r={};r.uuid=this.uuid,r.type=this.type,this.name!==""&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.isInstancedMesh&&(r.type="InstancedMesh",r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type="BatchedMesh",r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(c=>({...c,boundingBox:c.boundingBox?c.boundingBox.toJSON():void 0,boundingSphere:c.boundingSphere?c.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(c=>({...c})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function s(c,l){return c[l.uuid]===void 0&&(c[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=s(e.geometries,this.geometry);const c=this.geometry.parameters;if(c!==void 0&&c.shapes!==void 0){const l=c.shapes;if(Array.isArray(l))for(let a=0,u=l.length;a<u;a++){const h=l[a];s(e.shapes,h)}else s(e.shapes,l)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(s(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const c=[];for(let l=0,a=this.material.length;l<a;l++)c.push(s(e.materials,this.material[l]));r.material=c}else r.material=s(e.materials,this.material);if(this.children.length>0){r.children=[];for(let c=0;c<this.children.length;c++)r.children.push(this.children[c].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let c=0;c<this.animations.length;c++){const l=this.animations[c];r.animations.push(s(e.animations,l))}}if(t){const c=o(e.geometries),l=o(e.materials),a=o(e.textures),u=o(e.images),h=o(e.shapes),d=o(e.skeletons),f=o(e.animations),g=o(e.nodes);c.length>0&&(i.geometries=c),l.length>0&&(i.materials=l),a.length>0&&(i.textures=a),u.length>0&&(i.images=u),h.length>0&&(i.shapes=h),d.length>0&&(i.skeletons=d),f.length>0&&(i.animations=f),g.length>0&&(i.nodes=g)}return i.object=r,i;function o(c){const l=[];for(const a in c){const u=c[a];delete u.metadata,l.push(u)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let i=0;i<e.children.length;i++){const r=e.children[i];this.add(r.clone())}return this}}It.DEFAULT_UP=new I(0,1,0);It.DEFAULT_MATRIX_AUTO_UPDATE=!0;It.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;const Ln=new I,qn=new I,ko=new I,Yn=new I,Qi=new I,er=new I,xl=new I,Ho=new I,Vo=new I,Go=new I,Wo=new Tt,Xo=new Tt,qo=new Tt;class bn{constructor(e=new I,t=new I,i=new I){this.a=e,this.b=t,this.c=i}static getNormal(e,t,i,r){r.subVectors(i,t),Ln.subVectors(e,t),r.cross(Ln);const s=r.lengthSq();return s>0?r.multiplyScalar(1/Math.sqrt(s)):r.set(0,0,0)}static getBarycoord(e,t,i,r,s){Ln.subVectors(r,t),qn.subVectors(i,t),ko.subVectors(e,t);const o=Ln.dot(Ln),c=Ln.dot(qn),l=Ln.dot(ko),a=qn.dot(qn),u=qn.dot(ko),h=o*a-c*c;if(h===0)return s.set(0,0,0),null;const d=1/h,f=(a*l-c*u)*d,g=(o*u-c*l)*d;return s.set(1-f-g,g,f)}static containsPoint(e,t,i,r){return this.getBarycoord(e,t,i,r,Yn)===null?!1:Yn.x>=0&&Yn.y>=0&&Yn.x+Yn.y<=1}static getInterpolation(e,t,i,r,s,o,c,l){return this.getBarycoord(e,t,i,r,Yn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(s,Yn.x),l.addScaledVector(o,Yn.y),l.addScaledVector(c,Yn.z),l)}static getInterpolatedAttribute(e,t,i,r,s,o){return Wo.setScalar(0),Xo.setScalar(0),qo.setScalar(0),Wo.fromBufferAttribute(e,t),Xo.fromBufferAttribute(e,i),qo.fromBufferAttribute(e,r),o.setScalar(0),o.addScaledVector(Wo,s.x),o.addScaledVector(Xo,s.y),o.addScaledVector(qo,s.z),o}static isFrontFacing(e,t,i,r){return Ln.subVectors(i,t),qn.subVectors(e,t),Ln.cross(qn).dot(r)<0}set(e,t,i){return this.a.copy(e),this.b.copy(t),this.c.copy(i),this}setFromPointsAndIndices(e,t,i,r){return this.a.copy(e[t]),this.b.copy(e[i]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,i,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,i),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Ln.subVectors(this.c,this.b),qn.subVectors(this.a,this.b),Ln.cross(qn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return bn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return bn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,i,r,s){return bn.getInterpolation(e,this.a,this.b,this.c,t,i,r,s)}containsPoint(e){return bn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return bn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const i=this.a,r=this.b,s=this.c;let o,c;Qi.subVectors(r,i),er.subVectors(s,i),Ho.subVectors(e,i);const l=Qi.dot(Ho),a=er.dot(Ho);if(l<=0&&a<=0)return t.copy(i);Vo.subVectors(e,r);const u=Qi.dot(Vo),h=er.dot(Vo);if(u>=0&&h<=u)return t.copy(r);const d=l*h-u*a;if(d<=0&&l>=0&&u<=0)return o=l/(l-u),t.copy(i).addScaledVector(Qi,o);Go.subVectors(e,s);const f=Qi.dot(Go),g=er.dot(Go);if(g>=0&&f<=g)return t.copy(s);const x=f*a-l*g;if(x<=0&&a>=0&&g<=0)return c=a/(a-g),t.copy(i).addScaledVector(er,c);const m=u*g-f*h;if(m<=0&&h-u>=0&&f-g>=0)return xl.subVectors(s,r),c=(h-u)/(h-u+(f-g)),t.copy(r).addScaledVector(xl,c);const p=1/(m+x+d);return o=x*p,c=d*p,t.copy(i).addScaledVector(Qi,o).addScaledVector(er,c)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}const ju={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},ui={h:0,s:0,l:0},Cs={h:0,s:0,l:0};function Yo(n,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?n+(e-n)*6*t:t<1/2?e:t<2/3?n+(e-n)*6*(2/3-t):n}class ct{constructor(e,t,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,i)}set(e,t,i){if(t===void 0&&i===void 0){const r=e;r&&r.isColor?this.copy(r):typeof r=="number"?this.setHex(r):typeof r=="string"&&this.setStyle(r)}else this.setRGB(e,t,i);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=un){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,xt.colorSpaceToWorking(this,t),this}setRGB(e,t,i,r=xt.workingColorSpace){return this.r=e,this.g=t,this.b=i,xt.colorSpaceToWorking(this,r),this}setHSL(e,t,i,r=xt.workingColorSpace){if(e=Td(e,1),t=lt(t,0,1),i=lt(i,0,1),t===0)this.r=this.g=this.b=i;else{const s=i<=.5?i*(1+t):i+t-i*t,o=2*i-s;this.r=Yo(o,s,e+1/3),this.g=Yo(o,s,e),this.b=Yo(o,s,e-1/3)}return xt.colorSpaceToWorking(this,r),this}setStyle(e,t=un){function i(s){s!==void 0&&parseFloat(s)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let s;const o=r[1],c=r[2];switch(o){case"rgb":case"rgba":if(s=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(c))return i(s[4]),this.setRGB(Math.min(255,parseInt(s[1],10))/255,Math.min(255,parseInt(s[2],10))/255,Math.min(255,parseInt(s[3],10))/255,t);if(s=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(c))return i(s[4]),this.setRGB(Math.min(100,parseInt(s[1],10))/100,Math.min(100,parseInt(s[2],10))/100,Math.min(100,parseInt(s[3],10))/100,t);break;case"hsl":case"hsla":if(s=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(c))return i(s[4]),this.setHSL(parseFloat(s[1])/360,parseFloat(s[2])/100,parseFloat(s[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){const s=r[1],o=s.length;if(o===3)return this.setRGB(parseInt(s.charAt(0),16)/15,parseInt(s.charAt(1),16)/15,parseInt(s.charAt(2),16)/15,t);if(o===6)return this.setHex(parseInt(s,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=un){const i=ju[e.toLowerCase()];return i!==void 0?this.setHex(i,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=ti(e.r),this.g=ti(e.g),this.b=ti(e.b),this}copyLinearToSRGB(e){return this.r=pr(e.r),this.g=pr(e.g),this.b=pr(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=un){return xt.workingToColorSpace(Kt.copy(this),e),Math.round(lt(Kt.r*255,0,255))*65536+Math.round(lt(Kt.g*255,0,255))*256+Math.round(lt(Kt.b*255,0,255))}getHexString(e=un){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=xt.workingColorSpace){xt.workingToColorSpace(Kt.copy(this),t);const i=Kt.r,r=Kt.g,s=Kt.b,o=Math.max(i,r,s),c=Math.min(i,r,s);let l,a;const u=(c+o)/2;if(c===o)l=0,a=0;else{const h=o-c;switch(a=u<=.5?h/(o+c):h/(2-o-c),o){case i:l=(r-s)/h+(r<s?6:0);break;case r:l=(s-i)/h+2;break;case s:l=(i-r)/h+4;break}l/=6}return e.h=l,e.s=a,e.l=u,e}getRGB(e,t=xt.workingColorSpace){return xt.workingToColorSpace(Kt.copy(this),t),e.r=Kt.r,e.g=Kt.g,e.b=Kt.b,e}getStyle(e=un){xt.workingToColorSpace(Kt.copy(this),e);const t=Kt.r,i=Kt.g,r=Kt.b;return e!==un?`color(${e} ${t.toFixed(3)} ${i.toFixed(3)} ${r.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(r*255)})`}offsetHSL(e,t,i){return this.getHSL(ui),this.setHSL(ui.h+e,ui.s+t,ui.l+i)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,i){return this.r=e.r+(t.r-e.r)*i,this.g=e.g+(t.g-e.g)*i,this.b=e.b+(t.b-e.b)*i,this}lerpHSL(e,t){this.getHSL(ui),e.getHSL(Cs);const i=Co(ui.h,Cs.h,t),r=Co(ui.s,Cs.s,t),s=Co(ui.l,Cs.l,t);return this.setHSL(i,r,s),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,i=this.g,r=this.b,s=e.elements;return this.r=s[0]*t+s[3]*i+s[6]*r,this.g=s[1]*t+s[4]*i+s[7]*r,this.b=s[2]*t+s[5]*i+s[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Kt=new ct;ct.NAMES=ju;let Vd=0;class wr extends Tr{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Vd++}),this.uuid=ei(),this.name="",this.type="Material",this.blending=fr,this.side=xi,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=ya,this.blendDst=Ma,this.blendEquation=Pi,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new ct(0,0,0),this.blendAlpha=0,this.depthFunc=gr,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=sl,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Xi,this.stencilZFail=Xi,this.stencilZPass=Xi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const i=e[t];if(i===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}const r=this[t];if(r===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(i):r&&r.isVector3&&i&&i.isVector3?r.copy(i):this[t]=i}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(i.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(i.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(i.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.shadowSide!==null&&(i.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),this.blending!==fr&&(i.blending=this.blending),this.side!==xi&&(i.side=this.side),this.vertexColors===!0&&(i.vertexColors=!0),this.opacity<1&&(i.opacity=this.opacity),this.transparent===!0&&(i.transparent=!0),this.blendSrc!==ya&&(i.blendSrc=this.blendSrc),this.blendDst!==Ma&&(i.blendDst=this.blendDst),this.blendEquation!==Pi&&(i.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(i.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(i.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(i.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(i.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(i.blendAlpha=this.blendAlpha),this.depthFunc!==gr&&(i.depthFunc=this.depthFunc),this.depthTest===!1&&(i.depthTest=this.depthTest),this.depthWrite===!1&&(i.depthWrite=this.depthWrite),this.colorWrite===!1&&(i.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(i.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==sl&&(i.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(i.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(i.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Xi&&(i.stencilFail=this.stencilFail),this.stencilZFail!==Xi&&(i.stencilZFail=this.stencilZFail),this.stencilZPass!==Xi&&(i.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(i.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(i.rotation=this.rotation),this.polygonOffset===!0&&(i.polygonOffset=!0),this.polygonOffsetFactor!==0&&(i.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(i.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(i.linewidth=this.linewidth),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.dithering===!0&&(i.dithering=!0),this.alphaTest>0&&(i.alphaTest=this.alphaTest),this.alphaHash===!0&&(i.alphaHash=!0),this.alphaToCoverage===!0&&(i.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(i.premultipliedAlpha=!0),this.forceSinglePass===!0&&(i.forceSinglePass=!0),this.wireframe===!0&&(i.wireframe=!0),this.wireframeLinewidth>1&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(i.flatShading=!0),this.visible===!1&&(i.visible=!1),this.toneMapped===!1&&(i.toneMapped=!1),this.fog===!1&&(i.fog=!1),Object.keys(this.userData).length>0&&(i.userData=this.userData);function r(s){const o=[];for(const c in s){const l=s[c];delete l.metadata,o.push(l)}return o}if(t){const s=r(e.textures),o=r(e.images);s.length>0&&(i.textures=s),o.length>0&&(i.images=o)}return i}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let i=null;if(t!==null){const r=t.length;i=new Array(r);for(let s=0;s!==r;++s)i[s]=t[s].clone()}return this.clippingPlanes=i,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}class _s extends wr{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new ct(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new an,this.combine=Uu,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const Ot=new I,Ps=new Ce;let Gd=0;class vn{constructor(e,t,i=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Gd++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=i,this.usage=oc,this.updateRanges=[],this.gpuType=Fn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,i){e*=this.itemSize,i*=t.itemSize;for(let r=0,s=this.itemSize;r<s;r++)this.array[e+r]=t.array[i+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,i=this.count;t<i;t++)Ps.fromBufferAttribute(this,t),Ps.applyMatrix3(e),this.setXY(t,Ps.x,Ps.y);else if(this.itemSize===3)for(let t=0,i=this.count;t<i;t++)Ot.fromBufferAttribute(this,t),Ot.applyMatrix3(e),this.setXYZ(t,Ot.x,Ot.y,Ot.z);return this}applyMatrix4(e){for(let t=0,i=this.count;t<i;t++)Ot.fromBufferAttribute(this,t),Ot.applyMatrix4(e),this.setXYZ(t,Ot.x,Ot.y,Ot.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)Ot.fromBufferAttribute(this,t),Ot.applyNormalMatrix(e),this.setXYZ(t,Ot.x,Ot.y,Ot.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)Ot.fromBufferAttribute(this,t),Ot.transformDirection(e),this.setXYZ(t,Ot.x,Ot.y,Ot.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let i=this.array[e*this.itemSize+t];return this.normalized&&(i=Un(i,this.array)),i}setComponent(e,t,i){return this.normalized&&(i=bt(i,this.array)),this.array[e*this.itemSize+t]=i,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Un(t,this.array)),t}setX(e,t){return this.normalized&&(t=bt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Un(t,this.array)),t}setY(e,t){return this.normalized&&(t=bt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Un(t,this.array)),t}setZ(e,t){return this.normalized&&(t=bt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Un(t,this.array)),t}setW(e,t){return this.normalized&&(t=bt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,i){return e*=this.itemSize,this.normalized&&(t=bt(t,this.array),i=bt(i,this.array)),this.array[e+0]=t,this.array[e+1]=i,this}setXYZ(e,t,i,r){return e*=this.itemSize,this.normalized&&(t=bt(t,this.array),i=bt(i,this.array),r=bt(r,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this}setXYZW(e,t,i,r,s){return e*=this.itemSize,this.normalized&&(t=bt(t,this.array),i=bt(i,this.array),r=bt(r,this.array),s=bt(s,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this.array[e+3]=s,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==oc&&(e.usage=this.usage),e}}class $u extends vn{constructor(e,t,i){super(new Uint16Array(e),t,i)}}class Ju extends vn{constructor(e,t,i){super(new Uint32Array(e),t,i)}}class ot extends vn{constructor(e,t,i){super(new Float32Array(e),t,i)}}let Wd=0;const En=new mt,Zo=new It,tr=new I,pn=new Bn,Or=new Bn,Yt=new I;class qt extends Tr{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Wd++}),this.uuid=ei(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(qu(e)?Ju:$u)(e,1):this.index=e,this}setIndirect(e){return this.indirect=e,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,i=0){this.groups.push({start:e,count:t,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const i=this.attributes.normal;if(i!==void 0){const s=new it().getNormalMatrix(e);i.applyNormalMatrix(s),i.needsUpdate=!0}const r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return En.makeRotationFromQuaternion(e),this.applyMatrix4(En),this}rotateX(e){return En.makeRotationX(e),this.applyMatrix4(En),this}rotateY(e){return En.makeRotationY(e),this.applyMatrix4(En),this}rotateZ(e){return En.makeRotationZ(e),this.applyMatrix4(En),this}translate(e,t,i){return En.makeTranslation(e,t,i),this.applyMatrix4(En),this}scale(e,t,i){return En.makeScale(e,t,i),this.applyMatrix4(En),this}lookAt(e){return Zo.lookAt(e),Zo.updateMatrix(),this.applyMatrix4(Zo.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(tr).negate(),this.translate(tr.x,tr.y,tr.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const i=[];for(let r=0,s=e.length;r<s;r++){const o=e[r];i.push(o.x,o.y,o.z||0)}this.setAttribute("position",new ot(i,3))}else{const i=Math.min(e.length,t.count);for(let r=0;r<i;r++){const s=e[r];t.setXYZ(r,s.x,s.y,s.z||0)}e.length>t.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Bn);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new I(-1/0,-1/0,-1/0),new I(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let i=0,r=t.length;i<r;i++){const s=t[i];pn.setFromBufferAttribute(s),this.morphTargetsRelative?(Yt.addVectors(this.boundingBox.min,pn.min),this.boundingBox.expandByPoint(Yt),Yt.addVectors(this.boundingBox.max,pn.max),this.boundingBox.expandByPoint(Yt)):(this.boundingBox.expandByPoint(pn.min),this.boundingBox.expandByPoint(pn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new gs);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new I,1/0);return}if(e){const i=this.boundingSphere.center;if(pn.setFromBufferAttribute(e),t)for(let s=0,o=t.length;s<o;s++){const c=t[s];Or.setFromBufferAttribute(c),this.morphTargetsRelative?(Yt.addVectors(pn.min,Or.min),pn.expandByPoint(Yt),Yt.addVectors(pn.max,Or.max),pn.expandByPoint(Yt)):(pn.expandByPoint(Or.min),pn.expandByPoint(Or.max))}pn.getCenter(i);let r=0;for(let s=0,o=e.count;s<o;s++)Yt.fromBufferAttribute(e,s),r=Math.max(r,i.distanceToSquared(Yt));if(t)for(let s=0,o=t.length;s<o;s++){const c=t[s],l=this.morphTargetsRelative;for(let a=0,u=c.count;a<u;a++)Yt.fromBufferAttribute(c,a),l&&(tr.fromBufferAttribute(e,a),Yt.add(tr)),r=Math.max(r,i.distanceToSquared(Yt))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const i=t.position,r=t.normal,s=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new vn(new Float32Array(4*i.count),4));const o=this.getAttribute("tangent"),c=[],l=[];for(let L=0;L<i.count;L++)c[L]=new I,l[L]=new I;const a=new I,u=new I,h=new I,d=new Ce,f=new Ce,g=new Ce,x=new I,m=new I;function p(L,v,y){a.fromBufferAttribute(i,L),u.fromBufferAttribute(i,v),h.fromBufferAttribute(i,y),d.fromBufferAttribute(s,L),f.fromBufferAttribute(s,v),g.fromBufferAttribute(s,y),u.sub(a),h.sub(a),f.sub(d),g.sub(d);const R=1/(f.x*g.y-g.x*f.y);isFinite(R)&&(x.copy(u).multiplyScalar(g.y).addScaledVector(h,-f.y).multiplyScalar(R),m.copy(h).multiplyScalar(f.x).addScaledVector(u,-g.x).multiplyScalar(R),c[L].add(x),c[v].add(x),c[y].add(x),l[L].add(m),l[v].add(m),l[y].add(m))}let b=this.groups;b.length===0&&(b=[{start:0,count:e.count}]);for(let L=0,v=b.length;L<v;++L){const y=b[L],R=y.start,U=y.count;for(let F=R,Y=R+U;F<Y;F+=3)p(e.getX(F+0),e.getX(F+1),e.getX(F+2))}const S=new I,_=new I,w=new I,E=new I;function C(L){w.fromBufferAttribute(r,L),E.copy(w);const v=c[L];S.copy(v),S.sub(w.multiplyScalar(w.dot(v))).normalize(),_.crossVectors(E,v);const R=_.dot(l[L])<0?-1:1;o.setXYZW(L,S.x,S.y,S.z,R)}for(let L=0,v=b.length;L<v;++L){const y=b[L],R=y.start,U=y.count;for(let F=R,Y=R+U;F<Y;F+=3)C(e.getX(F+0)),C(e.getX(F+1)),C(e.getX(F+2))}}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let i=this.getAttribute("normal");if(i===void 0)i=new vn(new Float32Array(t.count*3),3),this.setAttribute("normal",i);else for(let d=0,f=i.count;d<f;d++)i.setXYZ(d,0,0,0);const r=new I,s=new I,o=new I,c=new I,l=new I,a=new I,u=new I,h=new I;if(e)for(let d=0,f=e.count;d<f;d+=3){const g=e.getX(d+0),x=e.getX(d+1),m=e.getX(d+2);r.fromBufferAttribute(t,g),s.fromBufferAttribute(t,x),o.fromBufferAttribute(t,m),u.subVectors(o,s),h.subVectors(r,s),u.cross(h),c.fromBufferAttribute(i,g),l.fromBufferAttribute(i,x),a.fromBufferAttribute(i,m),c.add(u),l.add(u),a.add(u),i.setXYZ(g,c.x,c.y,c.z),i.setXYZ(x,l.x,l.y,l.z),i.setXYZ(m,a.x,a.y,a.z)}else for(let d=0,f=t.count;d<f;d+=3)r.fromBufferAttribute(t,d+0),s.fromBufferAttribute(t,d+1),o.fromBufferAttribute(t,d+2),u.subVectors(o,s),h.subVectors(r,s),u.cross(h),i.setXYZ(d+0,u.x,u.y,u.z),i.setXYZ(d+1,u.x,u.y,u.z),i.setXYZ(d+2,u.x,u.y,u.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,i=e.count;t<i;t++)Yt.fromBufferAttribute(e,t),Yt.normalize(),e.setXYZ(t,Yt.x,Yt.y,Yt.z)}toNonIndexed(){function e(c,l){const a=c.array,u=c.itemSize,h=c.normalized,d=new a.constructor(l.length*u);let f=0,g=0;for(let x=0,m=l.length;x<m;x++){c.isInterleavedBufferAttribute?f=l[x]*c.data.stride+c.offset:f=l[x]*u;for(let p=0;p<u;p++)d[g++]=a[f++]}return new vn(d,u,h)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new qt,i=this.index.array,r=this.attributes;for(const c in r){const l=r[c],a=e(l,i);t.setAttribute(c,a)}const s=this.morphAttributes;for(const c in s){const l=[],a=s[c];for(let u=0,h=a.length;u<h;u++){const d=a[u],f=e(d,i);l.push(f)}t.morphAttributes[c]=l}t.morphTargetsRelative=this.morphTargetsRelative;const o=this.groups;for(let c=0,l=o.length;c<l;c++){const a=o[c];t.addGroup(a.start,a.count,a.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){const l=this.parameters;for(const a in l)l[a]!==void 0&&(e[a]=l[a]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const i=this.attributes;for(const l in i){const a=i[l];e.data.attributes[l]=a.toJSON(e.data)}const r={};let s=!1;for(const l in this.morphAttributes){const a=this.morphAttributes[l],u=[];for(let h=0,d=a.length;h<d;h++){const f=a[h];u.push(f.toJSON(e.data))}u.length>0&&(r[l]=u,s=!0)}s&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);const o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));const c=this.boundingSphere;return c!==null&&(e.data.boundingSphere=c.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const i=e.index;i!==null&&this.setIndex(i.clone());const r=e.attributes;for(const a in r){const u=r[a];this.setAttribute(a,u.clone(t))}const s=e.morphAttributes;for(const a in s){const u=[],h=s[a];for(let d=0,f=h.length;d<f;d++)u.push(h[d].clone(t));this.morphAttributes[a]=u}this.morphTargetsRelative=e.morphTargetsRelative;const o=e.groups;for(let a=0,u=o.length;a<u;a++){const h=o[a];this.addGroup(h.start,h.count,h.materialIndex)}const c=e.boundingBox;c!==null&&(this.boundingBox=c.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}const vl=new mt,Si=new Zu,Ls=new gs,yl=new I,Ds=new I,Is=new I,Us=new I,jo=new I,Ns=new I,Ml=new I,Fs=new I;class pt extends It{constructor(e=new qt,t=new _s){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){const r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,o=r.length;s<o;s++){const c=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[c]=s}}}}getVertexPosition(e,t){const i=this.geometry,r=i.attributes.position,s=i.morphAttributes.position,o=i.morphTargetsRelative;t.fromBufferAttribute(r,e);const c=this.morphTargetInfluences;if(s&&c){Ns.set(0,0,0);for(let l=0,a=s.length;l<a;l++){const u=c[l],h=s[l];u!==0&&(jo.fromBufferAttribute(h,e),o?Ns.addScaledVector(jo,u):Ns.addScaledVector(jo.sub(t),u))}t.add(Ns)}return t}raycast(e,t){const i=this.geometry,r=this.material,s=this.matrixWorld;r!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),Ls.copy(i.boundingSphere),Ls.applyMatrix4(s),Si.copy(e.ray).recast(e.near),!(Ls.containsPoint(Si.origin)===!1&&(Si.intersectSphere(Ls,yl)===null||Si.origin.distanceToSquared(yl)>(e.far-e.near)**2))&&(vl.copy(s).invert(),Si.copy(e.ray).applyMatrix4(vl),!(i.boundingBox!==null&&Si.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(e,t,Si)))}_computeIntersections(e,t,i){let r;const s=this.geometry,o=this.material,c=s.index,l=s.attributes.position,a=s.attributes.uv,u=s.attributes.uv1,h=s.attributes.normal,d=s.groups,f=s.drawRange;if(c!==null)if(Array.isArray(o))for(let g=0,x=d.length;g<x;g++){const m=d[g],p=o[m.materialIndex],b=Math.max(m.start,f.start),S=Math.min(c.count,Math.min(m.start+m.count,f.start+f.count));for(let _=b,w=S;_<w;_+=3){const E=c.getX(_),C=c.getX(_+1),L=c.getX(_+2);r=zs(this,p,e,i,a,u,h,E,C,L),r&&(r.faceIndex=Math.floor(_/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{const g=Math.max(0,f.start),x=Math.min(c.count,f.start+f.count);for(let m=g,p=x;m<p;m+=3){const b=c.getX(m),S=c.getX(m+1),_=c.getX(m+2);r=zs(this,o,e,i,a,u,h,b,S,_),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}else if(l!==void 0)if(Array.isArray(o))for(let g=0,x=d.length;g<x;g++){const m=d[g],p=o[m.materialIndex],b=Math.max(m.start,f.start),S=Math.min(l.count,Math.min(m.start+m.count,f.start+f.count));for(let _=b,w=S;_<w;_+=3){const E=_,C=_+1,L=_+2;r=zs(this,p,e,i,a,u,h,E,C,L),r&&(r.faceIndex=Math.floor(_/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{const g=Math.max(0,f.start),x=Math.min(l.count,f.start+f.count);for(let m=g,p=x;m<p;m+=3){const b=m,S=m+1,_=m+2;r=zs(this,o,e,i,a,u,h,b,S,_),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}}}function Xd(n,e,t,i,r,s,o,c){let l;if(e.side===on?l=i.intersectTriangle(o,s,r,!0,c):l=i.intersectTriangle(r,s,o,e.side===xi,c),l===null)return null;Fs.copy(c),Fs.applyMatrix4(n.matrixWorld);const a=t.ray.origin.distanceTo(Fs);return a<t.near||a>t.far?null:{distance:a,point:Fs.clone(),object:n}}function zs(n,e,t,i,r,s,o,c,l,a){n.getVertexPosition(c,Ds),n.getVertexPosition(l,Is),n.getVertexPosition(a,Us);const u=Xd(n,e,t,i,Ds,Is,Us,Ml);if(u){const h=new I;bn.getBarycoord(Ml,Ds,Is,Us,h),r&&(u.uv=bn.getInterpolatedAttribute(r,c,l,a,h,new Ce)),s&&(u.uv1=bn.getInterpolatedAttribute(s,c,l,a,h,new Ce)),o&&(u.normal=bn.getInterpolatedAttribute(o,c,l,a,h,new I),u.normal.dot(i.direction)>0&&u.normal.multiplyScalar(-1));const d={a:c,b:l,c:a,normal:new I,materialIndex:0};bn.getNormal(Ds,Is,Us,d.normal),u.face=d,u.barycoord=h}return u}class ni extends qt{constructor(e=1,t=1,i=1,r=1,s=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:r,heightSegments:s,depthSegments:o};const c=this;r=Math.floor(r),s=Math.floor(s),o=Math.floor(o);const l=[],a=[],u=[],h=[];let d=0,f=0;g("z","y","x",-1,-1,i,t,e,o,s,0),g("z","y","x",1,-1,i,t,-e,o,s,1),g("x","z","y",1,1,e,i,t,r,o,2),g("x","z","y",1,-1,e,i,-t,r,o,3),g("x","y","z",1,-1,e,t,i,r,s,4),g("x","y","z",-1,-1,e,t,-i,r,s,5),this.setIndex(l),this.setAttribute("position",new ot(a,3)),this.setAttribute("normal",new ot(u,3)),this.setAttribute("uv",new ot(h,2));function g(x,m,p,b,S,_,w,E,C,L,v){const y=_/C,R=w/L,U=_/2,F=w/2,Y=E/2,G=C+1,H=L+1;let J=0,W=0;const le=new I;for(let _e=0;_e<H;_e++){const we=_e*R-F;for(let qe=0;qe<G;qe++){const at=qe*y-U;le[x]=at*b,le[m]=we*S,le[p]=Y,a.push(le.x,le.y,le.z),le[x]=0,le[m]=0,le[p]=E>0?1:-1,u.push(le.x,le.y,le.z),h.push(qe/C),h.push(1-_e/L),J+=1}}for(let _e=0;_e<L;_e++)for(let we=0;we<C;we++){const qe=d+we+G*_e,at=d+we+G*(_e+1),ne=d+(we+1)+G*(_e+1),Ie=d+(we+1)+G*_e;l.push(qe,at,Ie),l.push(at,ne,Ie),W+=6}c.addGroup(f,W,v),f+=W,d+=J}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ni(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}function yr(n){const e={};for(const t in n){e[t]={};for(const i in n[t]){const r=n[t][i];r&&(r.isColor||r.isMatrix3||r.isMatrix4||r.isVector2||r.isVector3||r.isVector4||r.isTexture||r.isQuaternion)?r.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][i]=null):e[t][i]=r.clone():Array.isArray(r)?e[t][i]=r.slice():e[t][i]=r}}return e}function sn(n){const e={};for(let t=0;t<n.length;t++){const i=yr(n[t]);for(const r in i)e[r]=i[r]}return e}function qd(n){const e=[];for(let t=0;t<n.length;t++)e.push(n[t].clone());return e}function Ku(n){const e=n.getRenderTarget();return e===null?n.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:xt.workingColorSpace}const Yd={clone:yr,merge:sn};var Zd=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,jd=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class ii extends wr{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Zd,this.fragmentShader=jd,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=yr(e.uniforms),this.uniformsGroups=qd(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const r in this.uniforms){const o=this.uniforms[r].value;o&&o.isTexture?t.uniforms[r]={type:"t",value:o.toJSON(e).uuid}:o&&o.isColor?t.uniforms[r]={type:"c",value:o.getHex()}:o&&o.isVector2?t.uniforms[r]={type:"v2",value:o.toArray()}:o&&o.isVector3?t.uniforms[r]={type:"v3",value:o.toArray()}:o&&o.isVector4?t.uniforms[r]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?t.uniforms[r]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?t.uniforms[r]={type:"m4",value:o.toArray()}:t.uniforms[r]={value:o}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const i={};for(const r in this.extensions)this.extensions[r]===!0&&(i[r]=!0);return Object.keys(i).length>0&&(t.extensions=i),t}}class Qu extends It{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new mt,this.projectionMatrix=new mt,this.projectionMatrixInverse=new mt,this.coordinateSystem=zn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}}const hi=new I,Sl=new Ce,El=new Ce;class _n extends Qu{constructor(e=50,t=1,i=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=i,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=ac*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(Ro*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return ac*2*Math.atan(Math.tan(Ro*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,i){hi.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(hi.x,hi.y).multiplyScalar(-e/hi.z),hi.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(hi.x,hi.y).multiplyScalar(-e/hi.z)}getViewSize(e,t){return this.getViewBounds(e,Sl,El),t.subVectors(El,Sl)}setViewOffset(e,t,i,r,s,o){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=s,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(Ro*.5*this.fov)/this.zoom,i=2*t,r=this.aspect*i,s=-.5*r;const o=this.view;if(this.view!==null&&this.view.enabled){const l=o.fullWidth,a=o.fullHeight;s+=o.offsetX*r/l,t-=o.offsetY*i/a,r*=o.width/l,i*=o.height/a}const c=this.filmOffset;c!==0&&(s+=e*c/this.getFilmWidth()),this.projectionMatrix.makePerspective(s,s+r,t,t-i,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}const nr=-90,ir=1;class $d extends It{constructor(e,t,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;const r=new _n(nr,ir,e,t);r.layers=this.layers,this.add(r);const s=new _n(nr,ir,e,t);s.layers=this.layers,this.add(s);const o=new _n(nr,ir,e,t);o.layers=this.layers,this.add(o);const c=new _n(nr,ir,e,t);c.layers=this.layers,this.add(c);const l=new _n(nr,ir,e,t);l.layers=this.layers,this.add(l);const a=new _n(nr,ir,e,t);a.layers=this.layers,this.add(a)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[i,r,s,o,c,l]=t;for(const a of t)this.remove(a);if(e===zn)i.up.set(0,1,0),i.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),s.up.set(0,0,-1),s.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),c.up.set(0,1,0),c.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===uo)i.up.set(0,-1,0),i.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),s.up.set(0,0,1),s.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),c.up.set(0,-1,0),c.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const a of t)this.add(a),a.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:i,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[s,o,c,l,a,u]=this.children,h=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;const x=i.texture.generateMipmaps;i.texture.generateMipmaps=!1,e.setRenderTarget(i,0,r),e.render(t,s),e.setRenderTarget(i,1,r),e.render(t,o),e.setRenderTarget(i,2,r),e.render(t,c),e.setRenderTarget(i,3,r),e.render(t,l),e.setRenderTarget(i,4,r),e.render(t,a),i.texture.generateMipmaps=x,e.setRenderTarget(i,5,r),e.render(t,u),e.setRenderTarget(h,d,f),e.xr.enabled=g,i.texture.needsPMREMUpdate=!0}}class eh extends Qt{constructor(e=[],t=_r,i,r,s,o,c,l,a,u){super(e,t,i,r,s,o,c,l,a,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Jd extends Ni{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const i={width:e,height:e,depth:1},r=[i,i,i,i,i,i];this.texture=new eh(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new ni(5,5,5),s=new ii({name:"CubemapFromEquirect",uniforms:yr(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:on,blending:gi});s.uniforms.tEquirect.value=t;const o=new pt(r,s),c=t.minFilter;return t.minFilter===Ii&&(t.minFilter=Nn),new $d(1,10,this).update(e,o),t.minFilter=c,o.geometry.dispose(),o.material.dispose(),this}clear(e,t=!0,i=!0,r=!0){const s=e.getRenderTarget();for(let o=0;o<6;o++)e.setRenderTarget(this,o),e.clear(t,i,r);e.setRenderTarget(s)}}class Dt extends It{constructor(){super(),this.isGroup=!0,this.type="Group"}}const Kd={type:"move"};class $o{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Dt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Dt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new I,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new I),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Dt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new I,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new I),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const i of e.hand.values())this._getHandJoint(t,i)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,i){let r=null,s=null,o=null;const c=this._targetRay,l=this._grip,a=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(a&&e.hand){o=!0;for(const x of e.hand.values()){const m=t.getJointPose(x,i),p=this._getHandJoint(a,x);m!==null&&(p.matrix.fromArray(m.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=m.radius),p.visible=m!==null}const u=a.joints["index-finger-tip"],h=a.joints["thumb-tip"],d=u.position.distanceTo(h.position),f=.02,g=.005;a.inputState.pinching&&d>f+g?(a.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!a.inputState.pinching&&d<=f-g&&(a.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(s=t.getPose(e.gripSpace,i),s!==null&&(l.matrix.fromArray(s.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,s.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(s.linearVelocity)):l.hasLinearVelocity=!1,s.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(s.angularVelocity)):l.hasAngularVelocity=!1));c!==null&&(r=t.getPose(e.targetRaySpace,i),r===null&&s!==null&&(r=s),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1,this.dispatchEvent(Kd)))}return c!==null&&(c.visible=r!==null),l!==null&&(l.visible=s!==null),a!==null&&(a.visible=o!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const i=new Dt;i.matrixAutoUpdate=!1,i.visible=!1,e.joints[t.jointName]=i,e.add(i)}return e.joints[t.jointName]}}class Uc{constructor(e,t=25e-5){this.isFogExp2=!0,this.name="",this.color=new ct(e),this.density=t}clone(){return new Uc(this.color,this.density)}toJSON(){return{type:"FogExp2",name:this.name,color:this.color.getHex(),density:this.density}}}class Qd extends It{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new an,this.environmentIntensity=1,this.environmentRotation=new an,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}class ef{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=oc,this.updateRanges=[],this.version=0,this.uuid=ei()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,i){e*=this.stride,i*=t.stride;for(let r=0,s=this.stride;r<s;r++)this.array[e+r]=t.array[i+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=ei()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),i=new this.constructor(t,this.stride);return i.setUsage(this.usage),i}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=ei()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const nn=new I;class fo{constructor(e,t,i,r=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=i,this.normalized=r}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,i=this.data.count;t<i;t++)nn.fromBufferAttribute(this,t),nn.applyMatrix4(e),this.setXYZ(t,nn.x,nn.y,nn.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)nn.fromBufferAttribute(this,t),nn.applyNormalMatrix(e),this.setXYZ(t,nn.x,nn.y,nn.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)nn.fromBufferAttribute(this,t),nn.transformDirection(e),this.setXYZ(t,nn.x,nn.y,nn.z);return this}getComponent(e,t){let i=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(i=Un(i,this.array)),i}setComponent(e,t,i){return this.normalized&&(i=bt(i,this.array)),this.data.array[e*this.data.stride+this.offset+t]=i,this}setX(e,t){return this.normalized&&(t=bt(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=bt(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=bt(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=bt(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Un(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Un(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Un(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Un(t,this.array)),t}setXY(e,t,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=bt(t,this.array),i=bt(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=i,this}setXYZ(e,t,i,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=bt(t,this.array),i=bt(i,this.array),r=bt(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=i,this.data.array[e+2]=r,this}setXYZW(e,t,i,r,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=bt(t,this.array),i=bt(i,this.array),r=bt(r,this.array),s=bt(s,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=i,this.data.array[e+2]=r,this.data.array[e+3]=s,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let i=0;i<this.count;i++){const r=i*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return new vn(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new fo(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let i=0;i<this.count;i++){const r=i*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}class cc extends wr{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new ct(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}let rr;const Br=new I,sr=new I,or=new I,ar=new Ce,kr=new Ce,th=new mt,Os=new I,Hr=new I,Bs=new I,bl=new Ce,Jo=new Ce,Tl=new Ce;class wl extends It{constructor(e=new cc){if(super(),this.isSprite=!0,this.type="Sprite",rr===void 0){rr=new qt;const t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),i=new ef(t,5);rr.setIndex([0,1,2,0,2,3]),rr.setAttribute("position",new fo(i,3,0,!1)),rr.setAttribute("uv",new fo(i,2,3,!1))}this.geometry=rr,this.material=e,this.center=new Ce(.5,.5),this.count=1}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),sr.setFromMatrixScale(this.matrixWorld),th.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),or.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&sr.multiplyScalar(-or.z);const i=this.material.rotation;let r,s;i!==0&&(s=Math.cos(i),r=Math.sin(i));const o=this.center;ks(Os.set(-.5,-.5,0),or,o,sr,r,s),ks(Hr.set(.5,-.5,0),or,o,sr,r,s),ks(Bs.set(.5,.5,0),or,o,sr,r,s),bl.set(0,0),Jo.set(1,0),Tl.set(1,1);let c=e.ray.intersectTriangle(Os,Hr,Bs,!1,Br);if(c===null&&(ks(Hr.set(-.5,.5,0),or,o,sr,r,s),Jo.set(0,1),c=e.ray.intersectTriangle(Os,Bs,Hr,!1,Br),c===null))return;const l=e.ray.origin.distanceTo(Br);l<e.near||l>e.far||t.push({distance:l,point:Br.clone(),uv:bn.getInterpolation(Br,Os,Hr,Bs,bl,Jo,Tl,new Ce),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}}function ks(n,e,t,i,r,s){ar.subVectors(n,t).addScalar(.5).multiply(i),r!==void 0?(kr.x=s*ar.x-r*ar.y,kr.y=r*ar.x+s*ar.y):kr.copy(ar),n.copy(e),n.x+=kr.x,n.y+=kr.y,n.applyMatrix4(th)}class nh extends Qt{constructor(e=null,t=1,i=1,r,s,o,c,l,a=xn,u=xn,h,d){super(null,o,c,l,a,u,r,s,h,d),this.isDataTexture=!0,this.image={data:e,width:t,height:i},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Al extends vn{constructor(e,t,i,r=1){super(e,t,i),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=r}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const cr=new mt,Rl=new mt,Hs=[],Cl=new Bn,tf=new mt,Vr=new pt,Gr=new gs;class lc extends pt{constructor(e,t,i){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new Al(new Float32Array(i*16),16),this.instanceColor=null,this.morphTexture=null,this.count=i,this.boundingBox=null,this.boundingSphere=null;for(let r=0;r<i;r++)this.setMatrixAt(r,tf)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new Bn),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let i=0;i<t;i++)this.getMatrixAt(i,cr),Cl.copy(e.boundingBox).applyMatrix4(cr),this.boundingBox.union(Cl)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new gs),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let i=0;i<t;i++)this.getMatrixAt(i,cr),Gr.copy(e.boundingSphere).applyMatrix4(cr),this.boundingSphere.union(Gr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const i=t.morphTargetInfluences,r=this.morphTexture.source.data.data,s=i.length+1,o=e*s+1;for(let c=0;c<i.length;c++)i[c]=r[o+c]}raycast(e,t){const i=this.matrixWorld,r=this.count;if(Vr.geometry=this.geometry,Vr.material=this.material,Vr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Gr.copy(this.boundingSphere),Gr.applyMatrix4(i),e.ray.intersectsSphere(Gr)!==!1))for(let s=0;s<r;s++){this.getMatrixAt(s,cr),Rl.multiplyMatrices(i,cr),Vr.matrixWorld=Rl,Vr.raycast(e,Hs);for(let o=0,c=Hs.length;o<c;o++){const l=Hs[o];l.instanceId=s,l.object=this,t.push(l)}Hs.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new Al(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}setMorphAt(e,t){const i=t.morphTargetInfluences,r=i.length+1;this.morphTexture===null&&(this.morphTexture=new nh(new Float32Array(r*this.count),r,this.count,Rc,Fn));const s=this.morphTexture.source.data.data;let o=0;for(let a=0;a<i.length;a++)o+=i[a];const c=this.geometry.morphTargetsRelative?1:1-o,l=r*e;s[l]=c,s.set(i,l+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const Ko=new I,nf=new I,rf=new it;class Ri{constructor(e=new I(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,i,r){return this.normal.set(e,t,i),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,i){const r=Ko.subVectors(i,t).cross(nf.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){const i=e.delta(Ko),r=this.normal.dot(i);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const s=-(e.start.dot(this.normal)+this.constant)/r;return s<0||s>1?null:t.copy(e.start).addScaledVector(i,s)}intersectsLine(e){const t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const i=t||rf.getNormalMatrix(e),r=this.coplanarPoint(Ko).applyMatrix4(e),s=this.normal.applyMatrix3(i).normalize();return this.constant=-r.dot(s),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const Ei=new gs,sf=new Ce(.5,.5),Vs=new I;class Nc{constructor(e=new Ri,t=new Ri,i=new Ri,r=new Ri,s=new Ri,o=new Ri){this.planes=[e,t,i,r,s,o]}set(e,t,i,r,s,o){const c=this.planes;return c[0].copy(e),c[1].copy(t),c[2].copy(i),c[3].copy(r),c[4].copy(s),c[5].copy(o),this}copy(e){const t=this.planes;for(let i=0;i<6;i++)t[i].copy(e.planes[i]);return this}setFromProjectionMatrix(e,t=zn,i=!1){const r=this.planes,s=e.elements,o=s[0],c=s[1],l=s[2],a=s[3],u=s[4],h=s[5],d=s[6],f=s[7],g=s[8],x=s[9],m=s[10],p=s[11],b=s[12],S=s[13],_=s[14],w=s[15];if(r[0].setComponents(a-o,f-u,p-g,w-b).normalize(),r[1].setComponents(a+o,f+u,p+g,w+b).normalize(),r[2].setComponents(a+c,f+h,p+x,w+S).normalize(),r[3].setComponents(a-c,f-h,p-x,w-S).normalize(),i)r[4].setComponents(l,d,m,_).normalize(),r[5].setComponents(a-l,f-d,p-m,w-_).normalize();else if(r[4].setComponents(a-l,f-d,p-m,w-_).normalize(),t===zn)r[5].setComponents(a+l,f+d,p+m,w+_).normalize();else if(t===uo)r[5].setComponents(l,d,m,_).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Ei.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Ei.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Ei)}intersectsSprite(e){Ei.center.set(0,0,0);const t=sf.distanceTo(e.center);return Ei.radius=.7071067811865476+t,Ei.applyMatrix4(e.matrixWorld),this.intersectsSphere(Ei)}intersectsSphere(e){const t=this.planes,i=e.center,r=-e.radius;for(let s=0;s<6;s++)if(t[s].distanceToPoint(i)<r)return!1;return!0}intersectsBox(e){const t=this.planes;for(let i=0;i<6;i++){const r=t[i];if(Vs.x=r.normal.x>0?e.max.x:e.min.x,Vs.y=r.normal.y>0?e.max.y:e.min.y,Vs.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Vs)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Qo extends Qt{constructor(e,t,i,r,s,o,c,l,a){super(e,t,i,r,s,o,c,l,a),this.isCanvasTexture=!0,this.needsUpdate=!0}}class ih extends Qt{constructor(e,t,i=Ui,r,s,o,c=xn,l=xn,a,u=as,h=1){if(u!==as&&u!==cs)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const d={width:e,height:t,depth:h};super(d,r,s,o,c,l,u,i,a),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Dc(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}class rh extends Qt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class vo extends qt{constructor(e=1,t=32,i=0,r=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:i,thetaLength:r},t=Math.max(3,t);const s=[],o=[],c=[],l=[],a=new I,u=new Ce;o.push(0,0,0),c.push(0,0,1),l.push(.5,.5);for(let h=0,d=3;h<=t;h++,d+=3){const f=i+h/t*r;a.x=e*Math.cos(f),a.y=e*Math.sin(f),o.push(a.x,a.y,a.z),c.push(0,0,1),u.x=(o[d]/e+1)/2,u.y=(o[d+1]/e+1)/2,l.push(u.x,u.y)}for(let h=1;h<=t;h++)s.push(h,h+1,0);this.setIndex(s),this.setAttribute("position",new ot(o,3)),this.setAttribute("normal",new ot(c,3)),this.setAttribute("uv",new ot(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new vo(e.radius,e.segments,e.thetaStart,e.thetaLength)}}class Bt extends qt{constructor(e=1,t=1,i=1,r=32,s=1,o=!1,c=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:i,radialSegments:r,heightSegments:s,openEnded:o,thetaStart:c,thetaLength:l};const a=this;r=Math.floor(r),s=Math.floor(s);const u=[],h=[],d=[],f=[];let g=0;const x=[],m=i/2;let p=0;b(),o===!1&&(e>0&&S(!0),t>0&&S(!1)),this.setIndex(u),this.setAttribute("position",new ot(h,3)),this.setAttribute("normal",new ot(d,3)),this.setAttribute("uv",new ot(f,2));function b(){const _=new I,w=new I;let E=0;const C=(t-e)/i;for(let L=0;L<=s;L++){const v=[],y=L/s,R=y*(t-e)+e;for(let U=0;U<=r;U++){const F=U/r,Y=F*l+c,G=Math.sin(Y),H=Math.cos(Y);w.x=R*G,w.y=-y*i+m,w.z=R*H,h.push(w.x,w.y,w.z),_.set(G,C,H).normalize(),d.push(_.x,_.y,_.z),f.push(F,1-y),v.push(g++)}x.push(v)}for(let L=0;L<r;L++)for(let v=0;v<s;v++){const y=x[v][L],R=x[v+1][L],U=x[v+1][L+1],F=x[v][L+1];(e>0||v!==0)&&(u.push(y,R,F),E+=3),(t>0||v!==s-1)&&(u.push(R,U,F),E+=3)}a.addGroup(p,E,0),p+=E}function S(_){const w=g,E=new Ce,C=new I;let L=0;const v=_===!0?e:t,y=_===!0?1:-1;for(let U=1;U<=r;U++)h.push(0,m*y,0),d.push(0,y,0),f.push(.5,.5),g++;const R=g;for(let U=0;U<=r;U++){const Y=U/r*l+c,G=Math.cos(Y),H=Math.sin(Y);C.x=v*H,C.y=m*y,C.z=v*G,h.push(C.x,C.y,C.z),d.push(0,y,0),E.x=G*.5+.5,E.y=H*.5*y+.5,f.push(E.x,E.y),g++}for(let U=0;U<r;U++){const F=w+U,Y=R+U;_===!0?u.push(Y,Y+1,F):u.push(Y+1,Y,F),L+=3}a.addGroup(p,L,_===!0?1:2),p+=L}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Bt(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class po extends Bt{constructor(e=1,t=1,i=32,r=1,s=!1,o=0,c=Math.PI*2){super(0,e,t,i,r,s,o,c),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:i,heightSegments:r,openEnded:s,thetaStart:o,thetaLength:c}}static fromJSON(e){return new po(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class yo extends qt{constructor(e=[],t=[],i=1,r=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:i,detail:r};const s=[],o=[];c(r),a(i),u(),this.setAttribute("position",new ot(s,3)),this.setAttribute("normal",new ot(s.slice(),3)),this.setAttribute("uv",new ot(o,2)),r===0?this.computeVertexNormals():this.normalizeNormals();function c(b){const S=new I,_=new I,w=new I;for(let E=0;E<t.length;E+=3)f(t[E+0],S),f(t[E+1],_),f(t[E+2],w),l(S,_,w,b)}function l(b,S,_,w){const E=w+1,C=[];for(let L=0;L<=E;L++){C[L]=[];const v=b.clone().lerp(_,L/E),y=S.clone().lerp(_,L/E),R=E-L;for(let U=0;U<=R;U++)U===0&&L===E?C[L][U]=v:C[L][U]=v.clone().lerp(y,U/R)}for(let L=0;L<E;L++)for(let v=0;v<2*(E-L)-1;v++){const y=Math.floor(v/2);v%2===0?(d(C[L][y+1]),d(C[L+1][y]),d(C[L][y])):(d(C[L][y+1]),d(C[L+1][y+1]),d(C[L+1][y]))}}function a(b){const S=new I;for(let _=0;_<s.length;_+=3)S.x=s[_+0],S.y=s[_+1],S.z=s[_+2],S.normalize().multiplyScalar(b),s[_+0]=S.x,s[_+1]=S.y,s[_+2]=S.z}function u(){const b=new I;for(let S=0;S<s.length;S+=3){b.x=s[S+0],b.y=s[S+1],b.z=s[S+2];const _=m(b)/2/Math.PI+.5,w=p(b)/Math.PI+.5;o.push(_,1-w)}g(),h()}function h(){for(let b=0;b<o.length;b+=6){const S=o[b+0],_=o[b+2],w=o[b+4],E=Math.max(S,_,w),C=Math.min(S,_,w);E>.9&&C<.1&&(S<.2&&(o[b+0]+=1),_<.2&&(o[b+2]+=1),w<.2&&(o[b+4]+=1))}}function d(b){s.push(b.x,b.y,b.z)}function f(b,S){const _=b*3;S.x=e[_+0],S.y=e[_+1],S.z=e[_+2]}function g(){const b=new I,S=new I,_=new I,w=new I,E=new Ce,C=new Ce,L=new Ce;for(let v=0,y=0;v<s.length;v+=9,y+=6){b.set(s[v+0],s[v+1],s[v+2]),S.set(s[v+3],s[v+4],s[v+5]),_.set(s[v+6],s[v+7],s[v+8]),E.set(o[y+0],o[y+1]),C.set(o[y+2],o[y+3]),L.set(o[y+4],o[y+5]),w.copy(b).add(S).add(_).divideScalar(3);const R=m(w);x(E,y+0,b,R),x(C,y+2,S,R),x(L,y+4,_,R)}}function x(b,S,_,w){w<0&&b.x===1&&(o[S]=b.x-1),_.x===0&&_.z===0&&(o[S]=w/2/Math.PI+.5)}function m(b){return Math.atan2(b.z,-b.x)}function p(b){return Math.atan2(-b.y,Math.sqrt(b.x*b.x+b.z*b.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new yo(e.vertices,e.indices,e.radius,e.details)}}class jn extends yo{constructor(e=1,t=0){const i=(1+Math.sqrt(5))/2,r=1/i,s=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-r,-i,0,-r,i,0,r,-i,0,r,i,-r,-i,0,-r,i,0,r,-i,0,r,i,0,-i,0,-r,i,0,-r,-i,0,r,i,0,r],o=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];super(s,o,e,t),this.type="DodecahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new jn(e.radius,e.detail)}}class kn{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){console.warn("THREE.Curve: .getPoint() not implemented.")}getPointAt(e,t){const i=this.getUtoTmapping(e);return this.getPoint(i,t)}getPoints(e=5){const t=[];for(let i=0;i<=e;i++)t.push(this.getPoint(i/e));return t}getSpacedPoints(e=5){const t=[];for(let i=0;i<=e;i++)t.push(this.getPointAt(i/e));return t}getLength(){const e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;const t=[];let i,r=this.getPoint(0),s=0;t.push(0);for(let o=1;o<=e;o++)i=this.getPoint(o/e),s+=i.distanceTo(r),t.push(s),r=i;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t=null){const i=this.getLengths();let r=0;const s=i.length;let o;t?o=t:o=e*i[s-1];let c=0,l=s-1,a;for(;c<=l;)if(r=Math.floor(c+(l-c)/2),a=i[r]-o,a<0)c=r+1;else if(a>0)l=r-1;else{l=r;break}if(r=l,i[r]===o)return r/(s-1);const u=i[r],d=i[r+1]-u,f=(o-u)/d;return(r+f)/(s-1)}getTangent(e,t){let r=e-1e-4,s=e+1e-4;r<0&&(r=0),s>1&&(s=1);const o=this.getPoint(r),c=this.getPoint(s),l=t||(o.isVector2?new Ce:new I);return l.copy(c).sub(o).normalize(),l}getTangentAt(e,t){const i=this.getUtoTmapping(e);return this.getTangent(i,t)}computeFrenetFrames(e,t=!1){const i=new I,r=[],s=[],o=[],c=new I,l=new mt;for(let f=0;f<=e;f++){const g=f/e;r[f]=this.getTangentAt(g,new I)}s[0]=new I,o[0]=new I;let a=Number.MAX_VALUE;const u=Math.abs(r[0].x),h=Math.abs(r[0].y),d=Math.abs(r[0].z);u<=a&&(a=u,i.set(1,0,0)),h<=a&&(a=h,i.set(0,1,0)),d<=a&&i.set(0,0,1),c.crossVectors(r[0],i).normalize(),s[0].crossVectors(r[0],c),o[0].crossVectors(r[0],s[0]);for(let f=1;f<=e;f++){if(s[f]=s[f-1].clone(),o[f]=o[f-1].clone(),c.crossVectors(r[f-1],r[f]),c.length()>Number.EPSILON){c.normalize();const g=Math.acos(lt(r[f-1].dot(r[f]),-1,1));s[f].applyMatrix4(l.makeRotationAxis(c,g))}o[f].crossVectors(r[f],s[f])}if(t===!0){let f=Math.acos(lt(s[0].dot(s[e]),-1,1));f/=e,r[0].dot(c.crossVectors(s[0],s[e]))>0&&(f=-f);for(let g=1;g<=e;g++)s[g].applyMatrix4(l.makeRotationAxis(r[g],f*g)),o[g].crossVectors(r[g],s[g])}return{tangents:r,normals:s,binormals:o}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){const e={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}}class Fc extends kn{constructor(e=0,t=0,i=1,r=1,s=0,o=Math.PI*2,c=!1,l=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=e,this.aY=t,this.xRadius=i,this.yRadius=r,this.aStartAngle=s,this.aEndAngle=o,this.aClockwise=c,this.aRotation=l}getPoint(e,t=new Ce){const i=t,r=Math.PI*2;let s=this.aEndAngle-this.aStartAngle;const o=Math.abs(s)<Number.EPSILON;for(;s<0;)s+=r;for(;s>r;)s-=r;s<Number.EPSILON&&(o?s=0:s=r),this.aClockwise===!0&&!o&&(s===r?s=-r:s=s-r);const c=this.aStartAngle+e*s;let l=this.aX+this.xRadius*Math.cos(c),a=this.aY+this.yRadius*Math.sin(c);if(this.aRotation!==0){const u=Math.cos(this.aRotation),h=Math.sin(this.aRotation),d=l-this.aX,f=a-this.aY;l=d*u-f*h+this.aX,a=d*h+f*u+this.aY}return i.set(l,a)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){const e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}}class of extends Fc{constructor(e,t,i,r,s,o){super(e,t,i,i,r,s,o),this.isArcCurve=!0,this.type="ArcCurve"}}function zc(){let n=0,e=0,t=0,i=0;function r(s,o,c,l){n=s,e=c,t=-3*s+3*o-2*c-l,i=2*s-2*o+c+l}return{initCatmullRom:function(s,o,c,l,a){r(o,c,a*(c-s),a*(l-o))},initNonuniformCatmullRom:function(s,o,c,l,a,u,h){let d=(o-s)/a-(c-s)/(a+u)+(c-o)/u,f=(c-o)/u-(l-o)/(u+h)+(l-c)/h;d*=u,f*=u,r(o,c,d,f)},calc:function(s){const o=s*s,c=o*s;return n+e*s+t*o+i*c}}}const Gs=new I,ea=new zc,ta=new zc,na=new zc;class af extends kn{constructor(e=[],t=!1,i="centripetal",r=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=e,this.closed=t,this.curveType=i,this.tension=r}getPoint(e,t=new I){const i=t,r=this.points,s=r.length,o=(s-(this.closed?0:1))*e;let c=Math.floor(o),l=o-c;this.closed?c+=c>0?0:(Math.floor(Math.abs(c)/s)+1)*s:l===0&&c===s-1&&(c=s-2,l=1);let a,u;this.closed||c>0?a=r[(c-1)%s]:(Gs.subVectors(r[0],r[1]).add(r[0]),a=Gs);const h=r[c%s],d=r[(c+1)%s];if(this.closed||c+2<s?u=r[(c+2)%s]:(Gs.subVectors(r[s-1],r[s-2]).add(r[s-1]),u=Gs),this.curveType==="centripetal"||this.curveType==="chordal"){const f=this.curveType==="chordal"?.5:.25;let g=Math.pow(a.distanceToSquared(h),f),x=Math.pow(h.distanceToSquared(d),f),m=Math.pow(d.distanceToSquared(u),f);x<1e-4&&(x=1),g<1e-4&&(g=x),m<1e-4&&(m=x),ea.initNonuniformCatmullRom(a.x,h.x,d.x,u.x,g,x,m),ta.initNonuniformCatmullRom(a.y,h.y,d.y,u.y,g,x,m),na.initNonuniformCatmullRom(a.z,h.z,d.z,u.z,g,x,m)}else this.curveType==="catmullrom"&&(ea.initCatmullRom(a.x,h.x,d.x,u.x,this.tension),ta.initCatmullRom(a.y,h.y,d.y,u.y,this.tension),na.initCatmullRom(a.z,h.z,d.z,u.z,this.tension));return i.set(ea.calc(l),ta.calc(l),na.calc(l)),i}copy(e){super.copy(e),this.points=[];for(let t=0,i=e.points.length;t<i;t++){const r=e.points[t];this.points.push(r.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){const e=super.toJSON();e.points=[];for(let t=0,i=this.points.length;t<i;t++){const r=this.points[t];e.points.push(r.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,i=e.points.length;t<i;t++){const r=e.points[t];this.points.push(new I().fromArray(r))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}}function Pl(n,e,t,i,r){const s=(i-e)*.5,o=(r-t)*.5,c=n*n,l=n*c;return(2*t-2*i+s+o)*l+(-3*t+3*i-2*s-o)*c+s*n+t}function cf(n,e){const t=1-n;return t*t*e}function lf(n,e){return 2*(1-n)*n*e}function uf(n,e){return n*n*e}function Qr(n,e,t,i){return cf(n,e)+lf(n,t)+uf(n,i)}function hf(n,e){const t=1-n;return t*t*t*e}function df(n,e){const t=1-n;return 3*t*t*n*e}function ff(n,e){return 3*(1-n)*n*n*e}function pf(n,e){return n*n*n*e}function es(n,e,t,i,r){return hf(n,e)+df(n,t)+ff(n,i)+pf(n,r)}class sh extends kn{constructor(e=new Ce,t=new Ce,i=new Ce,r=new Ce){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=e,this.v1=t,this.v2=i,this.v3=r}getPoint(e,t=new Ce){const i=t,r=this.v0,s=this.v1,o=this.v2,c=this.v3;return i.set(es(e,r.x,s.x,o.x,c.x),es(e,r.y,s.y,o.y,c.y)),i}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}}class mf extends kn{constructor(e=new I,t=new I,i=new I,r=new I){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=e,this.v1=t,this.v2=i,this.v3=r}getPoint(e,t=new I){const i=t,r=this.v0,s=this.v1,o=this.v2,c=this.v3;return i.set(es(e,r.x,s.x,o.x,c.x),es(e,r.y,s.y,o.y,c.y),es(e,r.z,s.z,o.z,c.z)),i}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}}class oh extends kn{constructor(e=new Ce,t=new Ce){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=e,this.v2=t}getPoint(e,t=new Ce){const i=t;return e===1?i.copy(this.v2):(i.copy(this.v2).sub(this.v1),i.multiplyScalar(e).add(this.v1)),i}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new Ce){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class gf extends kn{constructor(e=new I,t=new I){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=e,this.v2=t}getPoint(e,t=new I){const i=t;return e===1?i.copy(this.v2):(i.copy(this.v2).sub(this.v1),i.multiplyScalar(e).add(this.v1)),i}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new I){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class ah extends kn{constructor(e=new Ce,t=new Ce,i=new Ce){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=e,this.v1=t,this.v2=i}getPoint(e,t=new Ce){const i=t,r=this.v0,s=this.v1,o=this.v2;return i.set(Qr(e,r.x,s.x,o.x),Qr(e,r.y,s.y,o.y)),i}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class _f extends kn{constructor(e=new I,t=new I,i=new I){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=e,this.v1=t,this.v2=i}getPoint(e,t=new I){const i=t,r=this.v0,s=this.v1,o=this.v2;return i.set(Qr(e,r.x,s.x,o.x),Qr(e,r.y,s.y,o.y),Qr(e,r.z,s.z,o.z)),i}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class ch extends kn{constructor(e=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=e}getPoint(e,t=new Ce){const i=t,r=this.points,s=(r.length-1)*e,o=Math.floor(s),c=s-o,l=r[o===0?o:o-1],a=r[o],u=r[o>r.length-2?r.length-1:o+1],h=r[o>r.length-3?r.length-1:o+2];return i.set(Pl(c,l.x,a.x,u.x,h.x),Pl(c,l.y,a.y,u.y,h.y)),i}copy(e){super.copy(e),this.points=[];for(let t=0,i=e.points.length;t<i;t++){const r=e.points[t];this.points.push(r.clone())}return this}toJSON(){const e=super.toJSON();e.points=[];for(let t=0,i=this.points.length;t<i;t++){const r=this.points[t];e.points.push(r.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,i=e.points.length;t<i;t++){const r=e.points[t];this.points.push(new Ce().fromArray(r))}return this}}var Ll=Object.freeze({__proto__:null,ArcCurve:of,CatmullRomCurve3:af,CubicBezierCurve:sh,CubicBezierCurve3:mf,EllipseCurve:Fc,LineCurve:oh,LineCurve3:gf,QuadraticBezierCurve:ah,QuadraticBezierCurve3:_f,SplineCurve:ch});class xf extends kn{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){const e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);if(!e.equals(t)){const i=e.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Ll[i](t,e))}return this}getPoint(e,t){const i=e*this.getLength(),r=this.getCurveLengths();let s=0;for(;s<r.length;){if(r[s]>=i){const o=r[s]-i,c=this.curves[s],l=c.getLength(),a=l===0?0:1-o/l;return c.getPointAt(a,t)}s++}return null}getLength(){const e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;const e=[];let t=0;for(let i=0,r=this.curves.length;i<r;i++)t+=this.curves[i].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){const t=[];for(let i=0;i<=e;i++)t.push(this.getPoint(i/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){const t=[];let i;for(let r=0,s=this.curves;r<s.length;r++){const o=s[r],c=o.isEllipseCurve?e*2:o.isLineCurve||o.isLineCurve3?1:o.isSplineCurve?e*o.points.length:e,l=o.getPoints(c);for(let a=0;a<l.length;a++){const u=l[a];i&&i.equals(u)||(t.push(u),i=u)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,i=e.curves.length;t<i;t++){const r=e.curves[t];this.curves.push(r.clone())}return this.autoClose=e.autoClose,this}toJSON(){const e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,i=this.curves.length;t<i;t++){const r=this.curves[t];e.curves.push(r.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,i=e.curves.length;t<i;t++){const r=e.curves[t];this.curves.push(new Ll[r.type]().fromJSON(r))}return this}}class Dl extends xf{constructor(e){super(),this.type="Path",this.currentPoint=new Ce,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,i=e.length;t<i;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){const i=new oh(this.currentPoint.clone(),new Ce(e,t));return this.curves.push(i),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,i,r){const s=new ah(this.currentPoint.clone(),new Ce(e,t),new Ce(i,r));return this.curves.push(s),this.currentPoint.set(i,r),this}bezierCurveTo(e,t,i,r,s,o){const c=new sh(this.currentPoint.clone(),new Ce(e,t),new Ce(i,r),new Ce(s,o));return this.curves.push(c),this.currentPoint.set(s,o),this}splineThru(e){const t=[this.currentPoint.clone()].concat(e),i=new ch(t);return this.curves.push(i),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,i,r,s,o){const c=this.currentPoint.x,l=this.currentPoint.y;return this.absarc(e+c,t+l,i,r,s,o),this}absarc(e,t,i,r,s,o){return this.absellipse(e,t,i,i,r,s,o),this}ellipse(e,t,i,r,s,o,c,l){const a=this.currentPoint.x,u=this.currentPoint.y;return this.absellipse(e+a,t+u,i,r,s,o,c,l),this}absellipse(e,t,i,r,s,o,c,l){const a=new Fc(e,t,i,r,s,o,c,l);if(this.curves.length>0){const h=a.getPoint(0);h.equals(this.currentPoint)||this.lineTo(h.x,h.y)}this.curves.push(a);const u=a.getPoint(1);return this.currentPoint.copy(u),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){const e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}}class io extends Dl{constructor(e){super(e),this.uuid=ei(),this.type="Shape",this.holes=[]}getPointsHoles(e){const t=[];for(let i=0,r=this.holes.length;i<r;i++)t[i]=this.holes[i].getPoints(e);return t}extractPoints(e){return{shape:this.getPoints(e),holes:this.getPointsHoles(e)}}copy(e){super.copy(e),this.holes=[];for(let t=0,i=e.holes.length;t<i;t++){const r=e.holes[t];this.holes.push(r.clone())}return this}toJSON(){const e=super.toJSON();e.uuid=this.uuid,e.holes=[];for(let t=0,i=this.holes.length;t<i;t++){const r=this.holes[t];e.holes.push(r.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.uuid=e.uuid,this.holes=[];for(let t=0,i=e.holes.length;t<i;t++){const r=e.holes[t];this.holes.push(new Dl().fromJSON(r))}return this}}function vf(n,e,t=2){const i=e&&e.length,r=i?e[0]*t:n.length;let s=lh(n,0,r,t,!0);const o=[];if(!s||s.next===s.prev)return o;let c,l,a;if(i&&(s=bf(n,e,s,t)),n.length>80*t){c=1/0,l=1/0;let u=-1/0,h=-1/0;for(let d=t;d<r;d+=t){const f=n[d],g=n[d+1];f<c&&(c=f),g<l&&(l=g),f>u&&(u=f),g>h&&(h=g)}a=Math.max(u-c,h-l),a=a!==0?32767/a:0}return us(s,o,t,c,l,a,0),o}function lh(n,e,t,i,r){let s;if(r===Nf(n,e,t,i)>0)for(let o=e;o<t;o+=i)s=Il(o/i|0,n[o],n[o+1],s);else for(let o=t-i;o>=e;o-=i)s=Il(o/i|0,n[o],n[o+1],s);return s&&Mr(s,s.next)&&(ds(s),s=s.next),s}function Fi(n,e){if(!n)return n;e||(e=n);let t=n,i;do if(i=!1,!t.steiner&&(Mr(t,t.next)||Lt(t.prev,t,t.next)===0)){if(ds(t),t=e=t.prev,t===t.next)break;i=!0}else t=t.next;while(i||t!==e);return e}function us(n,e,t,i,r,s,o){if(!n)return;!o&&s&&Cf(n,i,r,s);let c=n;for(;n.prev!==n.next;){const l=n.prev,a=n.next;if(s?Mf(n,i,r,s):yf(n)){e.push(l.i,n.i,a.i),ds(n),n=a.next,c=a.next;continue}if(n=a,n===c){o?o===1?(n=Sf(Fi(n),e),us(n,e,t,i,r,s,2)):o===2&&Ef(n,e,t,i,r,s):us(Fi(n),e,t,i,r,s,1);break}}}function yf(n){const e=n.prev,t=n,i=n.next;if(Lt(e,t,i)>=0)return!1;const r=e.x,s=t.x,o=i.x,c=e.y,l=t.y,a=i.y,u=Math.min(r,s,o),h=Math.min(c,l,a),d=Math.max(r,s,o),f=Math.max(c,l,a);let g=i.next;for(;g!==e;){if(g.x>=u&&g.x<=d&&g.y>=h&&g.y<=f&&Yr(r,c,s,l,o,a,g.x,g.y)&&Lt(g.prev,g,g.next)>=0)return!1;g=g.next}return!0}function Mf(n,e,t,i){const r=n.prev,s=n,o=n.next;if(Lt(r,s,o)>=0)return!1;const c=r.x,l=s.x,a=o.x,u=r.y,h=s.y,d=o.y,f=Math.min(c,l,a),g=Math.min(u,h,d),x=Math.max(c,l,a),m=Math.max(u,h,d),p=uc(f,g,e,t,i),b=uc(x,m,e,t,i);let S=n.prevZ,_=n.nextZ;for(;S&&S.z>=p&&_&&_.z<=b;){if(S.x>=f&&S.x<=x&&S.y>=g&&S.y<=m&&S!==r&&S!==o&&Yr(c,u,l,h,a,d,S.x,S.y)&&Lt(S.prev,S,S.next)>=0||(S=S.prevZ,_.x>=f&&_.x<=x&&_.y>=g&&_.y<=m&&_!==r&&_!==o&&Yr(c,u,l,h,a,d,_.x,_.y)&&Lt(_.prev,_,_.next)>=0))return!1;_=_.nextZ}for(;S&&S.z>=p;){if(S.x>=f&&S.x<=x&&S.y>=g&&S.y<=m&&S!==r&&S!==o&&Yr(c,u,l,h,a,d,S.x,S.y)&&Lt(S.prev,S,S.next)>=0)return!1;S=S.prevZ}for(;_&&_.z<=b;){if(_.x>=f&&_.x<=x&&_.y>=g&&_.y<=m&&_!==r&&_!==o&&Yr(c,u,l,h,a,d,_.x,_.y)&&Lt(_.prev,_,_.next)>=0)return!1;_=_.nextZ}return!0}function Sf(n,e){let t=n;do{const i=t.prev,r=t.next.next;!Mr(i,r)&&hh(i,t,t.next,r)&&hs(i,r)&&hs(r,i)&&(e.push(i.i,t.i,r.i),ds(t),ds(t.next),t=n=r),t=t.next}while(t!==n);return Fi(t)}function Ef(n,e,t,i,r,s){let o=n;do{let c=o.next.next;for(;c!==o.prev;){if(o.i!==c.i&&Df(o,c)){let l=dh(o,c);o=Fi(o,o.next),l=Fi(l,l.next),us(o,e,t,i,r,s,0),us(l,e,t,i,r,s,0);return}c=c.next}o=o.next}while(o!==n)}function bf(n,e,t,i){const r=[];for(let s=0,o=e.length;s<o;s++){const c=e[s]*i,l=s<o-1?e[s+1]*i:n.length,a=lh(n,c,l,i,!1);a===a.next&&(a.steiner=!0),r.push(Lf(a))}r.sort(Tf);for(let s=0;s<r.length;s++)t=wf(r[s],t);return t}function Tf(n,e){let t=n.x-e.x;if(t===0&&(t=n.y-e.y,t===0)){const i=(n.next.y-n.y)/(n.next.x-n.x),r=(e.next.y-e.y)/(e.next.x-e.x);t=i-r}return t}function wf(n,e){const t=Af(n,e);if(!t)return e;const i=dh(t,n);return Fi(i,i.next),Fi(t,t.next)}function Af(n,e){let t=e;const i=n.x,r=n.y;let s=-1/0,o;if(Mr(n,t))return t;do{if(Mr(n,t.next))return t.next;if(r<=t.y&&r>=t.next.y&&t.next.y!==t.y){const h=t.x+(r-t.y)*(t.next.x-t.x)/(t.next.y-t.y);if(h<=i&&h>s&&(s=h,o=t.x<t.next.x?t:t.next,h===i))return o}t=t.next}while(t!==e);if(!o)return null;const c=o,l=o.x,a=o.y;let u=1/0;t=o;do{if(i>=t.x&&t.x>=l&&i!==t.x&&uh(r<a?i:s,r,l,a,r<a?s:i,r,t.x,t.y)){const h=Math.abs(r-t.y)/(i-t.x);hs(t,n)&&(h<u||h===u&&(t.x>o.x||t.x===o.x&&Rf(o,t)))&&(o=t,u=h)}t=t.next}while(t!==c);return o}function Rf(n,e){return Lt(n.prev,n,e.prev)<0&&Lt(e.next,n,n.next)<0}function Cf(n,e,t,i){let r=n;do r.z===0&&(r.z=uc(r.x,r.y,e,t,i)),r.prevZ=r.prev,r.nextZ=r.next,r=r.next;while(r!==n);r.prevZ.nextZ=null,r.prevZ=null,Pf(r)}function Pf(n){let e,t=1;do{let i=n,r;n=null;let s=null;for(e=0;i;){e++;let o=i,c=0;for(let a=0;a<t&&(c++,o=o.nextZ,!!o);a++);let l=t;for(;c>0||l>0&&o;)c!==0&&(l===0||!o||i.z<=o.z)?(r=i,i=i.nextZ,c--):(r=o,o=o.nextZ,l--),s?s.nextZ=r:n=r,r.prevZ=s,s=r;i=o}s.nextZ=null,t*=2}while(e>1);return n}function uc(n,e,t,i,r){return n=(n-t)*r|0,e=(e-i)*r|0,n=(n|n<<8)&16711935,n=(n|n<<4)&252645135,n=(n|n<<2)&858993459,n=(n|n<<1)&1431655765,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,n|e<<1}function Lf(n){let e=n,t=n;do(e.x<t.x||e.x===t.x&&e.y<t.y)&&(t=e),e=e.next;while(e!==n);return t}function uh(n,e,t,i,r,s,o,c){return(r-o)*(e-c)>=(n-o)*(s-c)&&(n-o)*(i-c)>=(t-o)*(e-c)&&(t-o)*(s-c)>=(r-o)*(i-c)}function Yr(n,e,t,i,r,s,o,c){return!(n===o&&e===c)&&uh(n,e,t,i,r,s,o,c)}function Df(n,e){return n.next.i!==e.i&&n.prev.i!==e.i&&!If(n,e)&&(hs(n,e)&&hs(e,n)&&Uf(n,e)&&(Lt(n.prev,n,e.prev)||Lt(n,e.prev,e))||Mr(n,e)&&Lt(n.prev,n,n.next)>0&&Lt(e.prev,e,e.next)>0)}function Lt(n,e,t){return(e.y-n.y)*(t.x-e.x)-(e.x-n.x)*(t.y-e.y)}function Mr(n,e){return n.x===e.x&&n.y===e.y}function hh(n,e,t,i){const r=Xs(Lt(n,e,t)),s=Xs(Lt(n,e,i)),o=Xs(Lt(t,i,n)),c=Xs(Lt(t,i,e));return!!(r!==s&&o!==c||r===0&&Ws(n,t,e)||s===0&&Ws(n,i,e)||o===0&&Ws(t,n,i)||c===0&&Ws(t,e,i))}function Ws(n,e,t){return e.x<=Math.max(n.x,t.x)&&e.x>=Math.min(n.x,t.x)&&e.y<=Math.max(n.y,t.y)&&e.y>=Math.min(n.y,t.y)}function Xs(n){return n>0?1:n<0?-1:0}function If(n,e){let t=n;do{if(t.i!==n.i&&t.next.i!==n.i&&t.i!==e.i&&t.next.i!==e.i&&hh(t,t.next,n,e))return!0;t=t.next}while(t!==n);return!1}function hs(n,e){return Lt(n.prev,n,n.next)<0?Lt(n,e,n.next)>=0&&Lt(n,n.prev,e)>=0:Lt(n,e,n.prev)<0||Lt(n,n.next,e)<0}function Uf(n,e){let t=n,i=!1;const r=(n.x+e.x)/2,s=(n.y+e.y)/2;do t.y>s!=t.next.y>s&&t.next.y!==t.y&&r<(t.next.x-t.x)*(s-t.y)/(t.next.y-t.y)+t.x&&(i=!i),t=t.next;while(t!==n);return i}function dh(n,e){const t=hc(n.i,n.x,n.y),i=hc(e.i,e.x,e.y),r=n.next,s=e.prev;return n.next=e,e.prev=n,t.next=r,r.prev=t,i.next=t,t.prev=i,s.next=i,i.prev=s,i}function Il(n,e,t,i){const r=hc(n,e,t);return i?(r.next=i.next,r.prev=i,i.next.prev=r,i.next=r):(r.prev=r,r.next=r),r}function ds(n){n.next.prev=n.prev,n.prev.next=n.next,n.prevZ&&(n.prevZ.nextZ=n.nextZ),n.nextZ&&(n.nextZ.prevZ=n.prevZ)}function hc(n,e,t){return{i:n,x:e,y:t,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function Nf(n,e,t,i){let r=0;for(let s=e,o=t-i;s<t;s+=i)r+=(n[o]-n[s])*(n[s+1]+n[o+1]),o=s;return r}class Ff{static triangulate(e,t,i=2){return vf(e,t,i)}}class ts{static area(e){const t=e.length;let i=0;for(let r=t-1,s=0;s<t;r=s++)i+=e[r].x*e[s].y-e[s].x*e[r].y;return i*.5}static isClockWise(e){return ts.area(e)<0}static triangulateShape(e,t){const i=[],r=[],s=[];Ul(e),Nl(i,e);let o=e.length;t.forEach(Ul);for(let l=0;l<t.length;l++)r.push(o),o+=t[l].length,Nl(i,t[l]);const c=Ff.triangulate(i,r);for(let l=0;l<c.length;l+=3)s.push(c.slice(l,l+3));return s}}function Ul(n){const e=n.length;e>2&&n[e-1].equals(n[0])&&n.pop()}function Nl(n,e){for(let t=0;t<e.length;t++)n.push(e[t].x),n.push(e[t].y)}class Oc extends yo{constructor(e=1,t=0){const i=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],r=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(i,r,e,t),this.type="OctahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new Oc(e.radius,e.detail)}}class Kn extends qt{constructor(e=1,t=1,i=1,r=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:r};const s=e/2,o=t/2,c=Math.floor(i),l=Math.floor(r),a=c+1,u=l+1,h=e/c,d=t/l,f=[],g=[],x=[],m=[];for(let p=0;p<u;p++){const b=p*d-o;for(let S=0;S<a;S++){const _=S*h-s;g.push(_,-b,0),x.push(0,0,1),m.push(S/c),m.push(1-p/l)}}for(let p=0;p<l;p++)for(let b=0;b<c;b++){const S=b+a*p,_=b+a*(p+1),w=b+1+a*(p+1),E=b+1+a*p;f.push(S,_,E),f.push(_,w,E)}this.setIndex(f),this.setAttribute("position",new ot(g,3)),this.setAttribute("normal",new ot(x,3)),this.setAttribute("uv",new ot(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Kn(e.width,e.height,e.widthSegments,e.heightSegments)}}class Bc extends qt{constructor(e=.5,t=1,i=32,r=1,s=0,o=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:i,phiSegments:r,thetaStart:s,thetaLength:o},i=Math.max(3,i),r=Math.max(1,r);const c=[],l=[],a=[],u=[];let h=e;const d=(t-e)/r,f=new I,g=new Ce;for(let x=0;x<=r;x++){for(let m=0;m<=i;m++){const p=s+m/i*o;f.x=h*Math.cos(p),f.y=h*Math.sin(p),l.push(f.x,f.y,f.z),a.push(0,0,1),g.x=(f.x/t+1)/2,g.y=(f.y/t+1)/2,u.push(g.x,g.y)}h+=d}for(let x=0;x<r;x++){const m=x*(i+1);for(let p=0;p<i;p++){const b=p+m,S=b,_=b+i+1,w=b+i+2,E=b+1;c.push(S,_,E),c.push(_,w,E)}}this.setIndex(c),this.setAttribute("position",new ot(l,3)),this.setAttribute("normal",new ot(a,3)),this.setAttribute("uv",new ot(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Bc(e.innerRadius,e.outerRadius,e.thetaSegments,e.phiSegments,e.thetaStart,e.thetaLength)}}class ns extends qt{constructor(e=new io([new Ce(0,.5),new Ce(-.5,-.5),new Ce(.5,-.5)]),t=12){super(),this.type="ShapeGeometry",this.parameters={shapes:e,curveSegments:t};const i=[],r=[],s=[],o=[];let c=0,l=0;if(Array.isArray(e)===!1)a(e);else for(let u=0;u<e.length;u++)a(e[u]),this.addGroup(c,l,u),c+=l,l=0;this.setIndex(i),this.setAttribute("position",new ot(r,3)),this.setAttribute("normal",new ot(s,3)),this.setAttribute("uv",new ot(o,2));function a(u){const h=r.length/3,d=u.extractPoints(t);let f=d.shape;const g=d.holes;ts.isClockWise(f)===!1&&(f=f.reverse());for(let m=0,p=g.length;m<p;m++){const b=g[m];ts.isClockWise(b)===!0&&(g[m]=b.reverse())}const x=ts.triangulateShape(f,g);for(let m=0,p=g.length;m<p;m++){const b=g[m];f=f.concat(b)}for(let m=0,p=f.length;m<p;m++){const b=f[m];r.push(b.x,b.y,0),s.push(0,0,1),o.push(b.x,b.y)}for(let m=0,p=x.length;m<p;m++){const b=x[m],S=b[0]+h,_=b[1]+h,w=b[2]+h;i.push(S,_,w),l+=3}}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){const e=super.toJSON(),t=this.parameters.shapes;return zf(t,e)}static fromJSON(e,t){const i=[];for(let r=0,s=e.shapes.length;r<s;r++){const o=t[e.shapes[r]];i.push(o)}return new ns(i,e.curveSegments)}}function zf(n,e){if(e.shapes=[],Array.isArray(n))for(let t=0,i=n.length;t<i;t++){const r=n[t];e.shapes.push(r.uuid)}else e.shapes.push(n.uuid);return e}class mr extends qt{constructor(e=1,t=32,i=16,r=0,s=Math.PI*2,o=0,c=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:i,phiStart:r,phiLength:s,thetaStart:o,thetaLength:c},t=Math.max(3,Math.floor(t)),i=Math.max(2,Math.floor(i));const l=Math.min(o+c,Math.PI);let a=0;const u=[],h=new I,d=new I,f=[],g=[],x=[],m=[];for(let p=0;p<=i;p++){const b=[],S=p/i;let _=0;p===0&&o===0?_=.5/t:p===i&&l===Math.PI&&(_=-.5/t);for(let w=0;w<=t;w++){const E=w/t;h.x=-e*Math.cos(r+E*s)*Math.sin(o+S*c),h.y=e*Math.cos(o+S*c),h.z=e*Math.sin(r+E*s)*Math.sin(o+S*c),g.push(h.x,h.y,h.z),d.copy(h).normalize(),x.push(d.x,d.y,d.z),m.push(E+_,1-S),b.push(a++)}u.push(b)}for(let p=0;p<i;p++)for(let b=0;b<t;b++){const S=u[p][b+1],_=u[p][b],w=u[p+1][b],E=u[p+1][b+1];(p!==0||o>0)&&f.push(S,_,E),(p!==i-1||l<Math.PI)&&f.push(_,w,E)}this.setIndex(f),this.setAttribute("position",new ot(g,3)),this.setAttribute("normal",new ot(x,3)),this.setAttribute("uv",new ot(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new mr(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}class Sr extends qt{constructor(e=1,t=.4,i=12,r=48,s=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:i,tubularSegments:r,arc:s},i=Math.floor(i),r=Math.floor(r);const o=[],c=[],l=[],a=[],u=new I,h=new I,d=new I;for(let f=0;f<=i;f++)for(let g=0;g<=r;g++){const x=g/r*s,m=f/i*Math.PI*2;h.x=(e+t*Math.cos(m))*Math.cos(x),h.y=(e+t*Math.cos(m))*Math.sin(x),h.z=t*Math.sin(m),c.push(h.x,h.y,h.z),u.x=e*Math.cos(x),u.y=e*Math.sin(x),d.subVectors(h,u).normalize(),l.push(d.x,d.y,d.z),a.push(g/r),a.push(f/i)}for(let f=1;f<=i;f++)for(let g=1;g<=r;g++){const x=(r+1)*f+g-1,m=(r+1)*(f-1)+g-1,p=(r+1)*(f-1)+g,b=(r+1)*f+g;o.push(x,m,b),o.push(m,p,b)}this.setIndex(o),this.setAttribute("position",new ot(c,3)),this.setAttribute("normal",new ot(l,3)),this.setAttribute("uv",new ot(a,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Sr(e.radius,e.tube,e.radialSegments,e.tubularSegments,e.arc)}}class dc extends wr{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new ct(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ct(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Wu,this.normalScale=new Ce(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new an,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class ro extends wr{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=md,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Of extends wr{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}class kc extends It{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new ct(e),this.intensity=t}dispose(){}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(t.object.target=this.target.uuid),t}}class Bf extends kc{constructor(e,t,i){super(e,i),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(It.DEFAULT_UP),this.updateMatrix(),this.groundColor=new ct(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}}const ia=new mt,Fl=new I,zl=new I;class fh{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Ce(512,512),this.mapType=On,this.map=null,this.mapPass=null,this.matrix=new mt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Nc,this._frameExtents=new Ce(1,1),this._viewportCount=1,this._viewports=[new Tt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,i=this.matrix;Fl.setFromMatrixPosition(e.matrixWorld),t.position.copy(Fl),zl.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(zl),t.updateMatrixWorld(),ia.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(ia,t.coordinateSystem,t.reversedDepth),t.reversedDepth?i.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):i.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),i.multiply(ia)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}const Ol=new mt,Wr=new I,ra=new I;class kf extends fh{constructor(){super(new _n(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new Ce(4,2),this._viewportCount=6,this._viewports=[new Tt(2,1,1,1),new Tt(0,1,1,1),new Tt(3,1,1,1),new Tt(1,1,1,1),new Tt(3,0,1,1),new Tt(1,0,1,1)],this._cubeDirections=[new I(1,0,0),new I(-1,0,0),new I(0,0,1),new I(0,0,-1),new I(0,1,0),new I(0,-1,0)],this._cubeUps=[new I(0,1,0),new I(0,1,0),new I(0,1,0),new I(0,1,0),new I(0,0,1),new I(0,0,-1)]}updateMatrices(e,t=0){const i=this.camera,r=this.matrix,s=e.distance||i.far;s!==i.far&&(i.far=s,i.updateProjectionMatrix()),Wr.setFromMatrixPosition(e.matrixWorld),i.position.copy(Wr),ra.copy(i.position),ra.add(this._cubeDirections[t]),i.up.copy(this._cubeUps[t]),i.lookAt(ra),i.updateMatrixWorld(),r.makeTranslation(-Wr.x,-Wr.y,-Wr.z),Ol.multiplyMatrices(i.projectionMatrix,i.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Ol,i.coordinateSystem,i.reversedDepth)}}class Hf extends kc{constructor(e,t,i=0,r=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=i,this.decay=r,this.shadow=new kf}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}}class ph extends Qu{constructor(e=-1,t=1,i=1,r=-1,s=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=i,this.bottom=r,this.near=s,this.far=o,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,i,r,s,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=s,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,r=(this.top+this.bottom)/2;let s=i-e,o=i+e,c=r+t,l=r-t;if(this.view!==null&&this.view.enabled){const a=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;s+=a*this.view.offsetX,o=s+a*this.view.width,c-=u*this.view.offsetY,l=c-u*this.view.height}this.projectionMatrix.makeOrthographic(s,o,c,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}class Vf extends fh{constructor(){super(new ph(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Bl extends kc{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(It.DEFAULT_UP),this.updateMatrix(),this.target=new It,this.shadow=new Vf}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}}class Gf extends _n{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}const kl=new mt;class Wf{constructor(e,t,i=0,r=1/0){this.ray=new Zu(e,t),this.near=i,this.far=r,this.camera=null,this.layers=new Ic,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,(t.near+t.far)/(t.near-t.far)).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):console.error("THREE.Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return kl.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(kl),this}intersectObject(e,t=!0,i=[]){return fc(e,this,i,t),i.sort(Hl),i}intersectObjects(e,t=!0,i=[]){for(let r=0,s=e.length;r<s;r++)fc(e[r],this,i,t);return i.sort(Hl),i}}function Hl(n,e){return n.distance-e.distance}function fc(n,e,t,i){let r=!0;if(n.layers.test(e.layers)&&n.raycast(e,t)===!1&&(r=!1),r===!0&&i===!0){const s=n.children;for(let o=0,c=s.length;o<c;o++)fc(s[o],e,t,!0)}}function Vl(n,e,t,i){const r=Xf(i);switch(t){case Hu:return n*e;case Rc:return n*e/r.components*r.byteLength;case Cc:return n*e/r.components*r.byteLength;case Gu:return n*e*2/r.components*r.byteLength;case Pc:return n*e*2/r.components*r.byteLength;case Vu:return n*e*3/r.components*r.byteLength;case Tn:return n*e*4/r.components*r.byteLength;case Lc:return n*e*4/r.components*r.byteLength;case Ks:case Qs:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case eo:case to:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Ia:case Na:return Math.max(n,16)*Math.max(e,8)/4;case Da:case Ua:return Math.max(n,8)*Math.max(e,8)/2;case Fa:case za:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case Oa:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Ba:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case ka:return Math.floor((n+4)/5)*Math.floor((e+3)/4)*16;case Ha:return Math.floor((n+4)/5)*Math.floor((e+4)/5)*16;case Va:return Math.floor((n+5)/6)*Math.floor((e+4)/5)*16;case Ga:return Math.floor((n+5)/6)*Math.floor((e+5)/6)*16;case Wa:return Math.floor((n+7)/8)*Math.floor((e+4)/5)*16;case Xa:return Math.floor((n+7)/8)*Math.floor((e+5)/6)*16;case qa:return Math.floor((n+7)/8)*Math.floor((e+7)/8)*16;case Ya:return Math.floor((n+9)/10)*Math.floor((e+4)/5)*16;case Za:return Math.floor((n+9)/10)*Math.floor((e+5)/6)*16;case ja:return Math.floor((n+9)/10)*Math.floor((e+7)/8)*16;case $a:return Math.floor((n+9)/10)*Math.floor((e+9)/10)*16;case Ja:return Math.floor((n+11)/12)*Math.floor((e+9)/10)*16;case Ka:return Math.floor((n+11)/12)*Math.floor((e+11)/12)*16;case Qa:case ec:case tc:return Math.ceil(n/4)*Math.ceil(e/4)*16;case nc:case ic:return Math.ceil(n/4)*Math.ceil(e/4)*8;case rc:case sc:return Math.ceil(n/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Xf(n){switch(n){case On:case zu:return{byteLength:1,components:1};case ss:case Ou:case ms:return{byteLength:2,components:1};case wc:case Ac:return{byteLength:2,components:4};case Ui:case Tc:case Fn:return{byteLength:4,components:1};case Bu:case ku:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${n}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:bc}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=bc);/**
 * @license
 * Copyright 2010-2025 Three.js Authors
 * SPDX-License-Identifier: MIT
 */function mh(){let n=null,e=!1,t=null,i=null;function r(s,o){t(s,o),i=n.requestAnimationFrame(r)}return{start:function(){e!==!0&&t!==null&&(i=n.requestAnimationFrame(r),e=!0)},stop:function(){n.cancelAnimationFrame(i),e=!1},setAnimationLoop:function(s){t=s},setContext:function(s){n=s}}}function qf(n){const e=new WeakMap;function t(c,l){const a=c.array,u=c.usage,h=a.byteLength,d=n.createBuffer();n.bindBuffer(l,d),n.bufferData(l,a,u),c.onUploadCallback();let f;if(a instanceof Float32Array)f=n.FLOAT;else if(typeof Float16Array<"u"&&a instanceof Float16Array)f=n.HALF_FLOAT;else if(a instanceof Uint16Array)c.isFloat16BufferAttribute?f=n.HALF_FLOAT:f=n.UNSIGNED_SHORT;else if(a instanceof Int16Array)f=n.SHORT;else if(a instanceof Uint32Array)f=n.UNSIGNED_INT;else if(a instanceof Int32Array)f=n.INT;else if(a instanceof Int8Array)f=n.BYTE;else if(a instanceof Uint8Array)f=n.UNSIGNED_BYTE;else if(a instanceof Uint8ClampedArray)f=n.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+a);return{buffer:d,type:f,bytesPerElement:a.BYTES_PER_ELEMENT,version:c.version,size:h}}function i(c,l,a){const u=l.array,h=l.updateRanges;if(n.bindBuffer(a,c),h.length===0)n.bufferSubData(a,0,u);else{h.sort((f,g)=>f.start-g.start);let d=0;for(let f=1;f<h.length;f++){const g=h[d],x=h[f];x.start<=g.start+g.count+1?g.count=Math.max(g.count,x.start+x.count-g.start):(++d,h[d]=x)}h.length=d+1;for(let f=0,g=h.length;f<g;f++){const x=h[f];n.bufferSubData(a,x.start*u.BYTES_PER_ELEMENT,u,x.start,x.count)}l.clearUpdateRanges()}l.onUploadCallback()}function r(c){return c.isInterleavedBufferAttribute&&(c=c.data),e.get(c)}function s(c){c.isInterleavedBufferAttribute&&(c=c.data);const l=e.get(c);l&&(n.deleteBuffer(l.buffer),e.delete(c))}function o(c,l){if(c.isInterleavedBufferAttribute&&(c=c.data),c.isGLBufferAttribute){const u=e.get(c);(!u||u.version<c.version)&&e.set(c,{buffer:c.buffer,type:c.type,bytesPerElement:c.elementSize,version:c.version});return}const a=e.get(c);if(a===void 0)e.set(c,t(c,l));else if(a.version<c.version){if(a.size!==c.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(a.buffer,c,l),a.version=c.version}}return{get:r,remove:s,update:o}}var Yf=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Zf=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,jf=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,$f=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Jf=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Kf=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Qf=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,ep=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,tp=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,np=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,ip=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,rp=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,sp=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,op=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,ap=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,cp=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,lp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,up=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,hp=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,dp=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,fp=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,pp=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,mp=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,gp=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,_p=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,xp=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,vp=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,yp=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Mp=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Sp=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Ep="gl_FragColor = linearToOutputTexel( gl_FragColor );",bp=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Tp=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,wp=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Ap=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Rp=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Cp=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Pp=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Lp=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Dp=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Ip=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Up=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Np=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Fp=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,zp=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Op=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,Bp=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,kp=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Hp=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Vp=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Gp=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Wp=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Xp=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,qp=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Yp=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Zp=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,jp=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,$p=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Jp=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Kp=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Qp=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,em=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,tm=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,nm=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,im=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,rm=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,sm=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,om=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,am=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,cm=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,lm=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,um=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,hm=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,dm=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,fm=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,pm=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,mm=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,gm=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,_m=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,xm=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,vm=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,ym=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Mm=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,Sm=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Em=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,bm=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Tm=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,wm=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Am=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Rm=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		float depth = unpackRGBAToDepth( texture2D( depths, uv ) );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			return step( depth, compare );
		#else
			return step( compare, depth );
		#endif
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow( sampler2D shadow, vec2 uv, float compare ) {
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			float hard_shadow = step( distribution.x, compare );
		#else
			float hard_shadow = step( compare, distribution.x );
		#endif
		if ( hard_shadow != 1.0 ) {
			float distance = compare - distribution.x;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,Cm=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Pm=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Lm=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Dm=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Im=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Um=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Nm=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Fm=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,zm=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Om=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Bm=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,km=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,Hm=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,Vm=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Gm=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Wm=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,Xm=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const qm=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Ym=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Zm=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,jm=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,$m=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Jm=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Km=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,Qm=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,e0=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,t0=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,n0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,i0=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,r0=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,s0=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,o0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,a0=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,c0=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,l0=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,u0=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,h0=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,d0=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,f0=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,p0=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,m0=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,g0=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,_0=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,x0=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,v0=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,y0=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,M0=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,S0=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,E0=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,b0=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,T0=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,st={alphahash_fragment:Yf,alphahash_pars_fragment:Zf,alphamap_fragment:jf,alphamap_pars_fragment:$f,alphatest_fragment:Jf,alphatest_pars_fragment:Kf,aomap_fragment:Qf,aomap_pars_fragment:ep,batching_pars_vertex:tp,batching_vertex:np,begin_vertex:ip,beginnormal_vertex:rp,bsdfs:sp,iridescence_fragment:op,bumpmap_pars_fragment:ap,clipping_planes_fragment:cp,clipping_planes_pars_fragment:lp,clipping_planes_pars_vertex:up,clipping_planes_vertex:hp,color_fragment:dp,color_pars_fragment:fp,color_pars_vertex:pp,color_vertex:mp,common:gp,cube_uv_reflection_fragment:_p,defaultnormal_vertex:xp,displacementmap_pars_vertex:vp,displacementmap_vertex:yp,emissivemap_fragment:Mp,emissivemap_pars_fragment:Sp,colorspace_fragment:Ep,colorspace_pars_fragment:bp,envmap_fragment:Tp,envmap_common_pars_fragment:wp,envmap_pars_fragment:Ap,envmap_pars_vertex:Rp,envmap_physical_pars_fragment:Bp,envmap_vertex:Cp,fog_vertex:Pp,fog_pars_vertex:Lp,fog_fragment:Dp,fog_pars_fragment:Ip,gradientmap_pars_fragment:Up,lightmap_pars_fragment:Np,lights_lambert_fragment:Fp,lights_lambert_pars_fragment:zp,lights_pars_begin:Op,lights_toon_fragment:kp,lights_toon_pars_fragment:Hp,lights_phong_fragment:Vp,lights_phong_pars_fragment:Gp,lights_physical_fragment:Wp,lights_physical_pars_fragment:Xp,lights_fragment_begin:qp,lights_fragment_maps:Yp,lights_fragment_end:Zp,logdepthbuf_fragment:jp,logdepthbuf_pars_fragment:$p,logdepthbuf_pars_vertex:Jp,logdepthbuf_vertex:Kp,map_fragment:Qp,map_pars_fragment:em,map_particle_fragment:tm,map_particle_pars_fragment:nm,metalnessmap_fragment:im,metalnessmap_pars_fragment:rm,morphinstance_vertex:sm,morphcolor_vertex:om,morphnormal_vertex:am,morphtarget_pars_vertex:cm,morphtarget_vertex:lm,normal_fragment_begin:um,normal_fragment_maps:hm,normal_pars_fragment:dm,normal_pars_vertex:fm,normal_vertex:pm,normalmap_pars_fragment:mm,clearcoat_normal_fragment_begin:gm,clearcoat_normal_fragment_maps:_m,clearcoat_pars_fragment:xm,iridescence_pars_fragment:vm,opaque_fragment:ym,packing:Mm,premultiplied_alpha_fragment:Sm,project_vertex:Em,dithering_fragment:bm,dithering_pars_fragment:Tm,roughnessmap_fragment:wm,roughnessmap_pars_fragment:Am,shadowmap_pars_fragment:Rm,shadowmap_pars_vertex:Cm,shadowmap_vertex:Pm,shadowmask_pars_fragment:Lm,skinbase_vertex:Dm,skinning_pars_vertex:Im,skinning_vertex:Um,skinnormal_vertex:Nm,specularmap_fragment:Fm,specularmap_pars_fragment:zm,tonemapping_fragment:Om,tonemapping_pars_fragment:Bm,transmission_fragment:km,transmission_pars_fragment:Hm,uv_pars_fragment:Vm,uv_pars_vertex:Gm,uv_vertex:Wm,worldpos_vertex:Xm,background_vert:qm,background_frag:Ym,backgroundCube_vert:Zm,backgroundCube_frag:jm,cube_vert:$m,cube_frag:Jm,depth_vert:Km,depth_frag:Qm,distanceRGBA_vert:e0,distanceRGBA_frag:t0,equirect_vert:n0,equirect_frag:i0,linedashed_vert:r0,linedashed_frag:s0,meshbasic_vert:o0,meshbasic_frag:a0,meshlambert_vert:c0,meshlambert_frag:l0,meshmatcap_vert:u0,meshmatcap_frag:h0,meshnormal_vert:d0,meshnormal_frag:f0,meshphong_vert:p0,meshphong_frag:m0,meshphysical_vert:g0,meshphysical_frag:_0,meshtoon_vert:x0,meshtoon_frag:v0,points_vert:y0,points_frag:M0,shadow_vert:S0,shadow_frag:E0,sprite_vert:b0,sprite_frag:T0},Te={common:{diffuse:{value:new ct(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new it},alphaMap:{value:null},alphaMapTransform:{value:new it},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new it}},envmap:{envMap:{value:null},envMapRotation:{value:new it},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new it}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new it}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new it},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new it},normalScale:{value:new Ce(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new it},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new it}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new it}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new it}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ct(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new ct(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new it},alphaTest:{value:0},uvTransform:{value:new it}},sprite:{diffuse:{value:new ct(16777215)},opacity:{value:1},center:{value:new Ce(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new it},alphaMap:{value:null},alphaMapTransform:{value:new it},alphaTest:{value:0}}},In={basic:{uniforms:sn([Te.common,Te.specularmap,Te.envmap,Te.aomap,Te.lightmap,Te.fog]),vertexShader:st.meshbasic_vert,fragmentShader:st.meshbasic_frag},lambert:{uniforms:sn([Te.common,Te.specularmap,Te.envmap,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.fog,Te.lights,{emissive:{value:new ct(0)}}]),vertexShader:st.meshlambert_vert,fragmentShader:st.meshlambert_frag},phong:{uniforms:sn([Te.common,Te.specularmap,Te.envmap,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.fog,Te.lights,{emissive:{value:new ct(0)},specular:{value:new ct(1118481)},shininess:{value:30}}]),vertexShader:st.meshphong_vert,fragmentShader:st.meshphong_frag},standard:{uniforms:sn([Te.common,Te.envmap,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.roughnessmap,Te.metalnessmap,Te.fog,Te.lights,{emissive:{value:new ct(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:st.meshphysical_vert,fragmentShader:st.meshphysical_frag},toon:{uniforms:sn([Te.common,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.gradientmap,Te.fog,Te.lights,{emissive:{value:new ct(0)}}]),vertexShader:st.meshtoon_vert,fragmentShader:st.meshtoon_frag},matcap:{uniforms:sn([Te.common,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.fog,{matcap:{value:null}}]),vertexShader:st.meshmatcap_vert,fragmentShader:st.meshmatcap_frag},points:{uniforms:sn([Te.points,Te.fog]),vertexShader:st.points_vert,fragmentShader:st.points_frag},dashed:{uniforms:sn([Te.common,Te.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:st.linedashed_vert,fragmentShader:st.linedashed_frag},depth:{uniforms:sn([Te.common,Te.displacementmap]),vertexShader:st.depth_vert,fragmentShader:st.depth_frag},normal:{uniforms:sn([Te.common,Te.bumpmap,Te.normalmap,Te.displacementmap,{opacity:{value:1}}]),vertexShader:st.meshnormal_vert,fragmentShader:st.meshnormal_frag},sprite:{uniforms:sn([Te.sprite,Te.fog]),vertexShader:st.sprite_vert,fragmentShader:st.sprite_frag},background:{uniforms:{uvTransform:{value:new it},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:st.background_vert,fragmentShader:st.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new it}},vertexShader:st.backgroundCube_vert,fragmentShader:st.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:st.cube_vert,fragmentShader:st.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:st.equirect_vert,fragmentShader:st.equirect_frag},distanceRGBA:{uniforms:sn([Te.common,Te.displacementmap,{referencePosition:{value:new I},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:st.distanceRGBA_vert,fragmentShader:st.distanceRGBA_frag},shadow:{uniforms:sn([Te.lights,Te.fog,{color:{value:new ct(0)},opacity:{value:1}}]),vertexShader:st.shadow_vert,fragmentShader:st.shadow_frag}};In.physical={uniforms:sn([In.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new it},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new it},clearcoatNormalScale:{value:new Ce(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new it},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new it},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new it},sheen:{value:0},sheenColor:{value:new ct(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new it},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new it},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new it},transmissionSamplerSize:{value:new Ce},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new it},attenuationDistance:{value:0},attenuationColor:{value:new ct(0)},specularColor:{value:new ct(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new it},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new it},anisotropyVector:{value:new Ce},anisotropyMap:{value:null},anisotropyMapTransform:{value:new it}}]),vertexShader:st.meshphysical_vert,fragmentShader:st.meshphysical_frag};const qs={r:0,b:0,g:0},bi=new an,w0=new mt;function A0(n,e,t,i,r,s,o){const c=new ct(0);let l=s===!0?0:1,a,u,h=null,d=0,f=null;function g(S){let _=S.isScene===!0?S.background:null;return _&&_.isTexture&&(_=(S.backgroundBlurriness>0?t:e).get(_)),_}function x(S){let _=!1;const w=g(S);w===null?p(c,l):w&&w.isColor&&(p(w,1),_=!0);const E=n.xr.getEnvironmentBlendMode();E==="additive"?i.buffers.color.setClear(0,0,0,1,o):E==="alpha-blend"&&i.buffers.color.setClear(0,0,0,0,o),(n.autoClear||_)&&(i.buffers.depth.setTest(!0),i.buffers.depth.setMask(!0),i.buffers.color.setMask(!0),n.clear(n.autoClearColor,n.autoClearDepth,n.autoClearStencil))}function m(S,_){const w=g(_);w&&(w.isCubeTexture||w.mapping===xo)?(u===void 0&&(u=new pt(new ni(1,1,1),new ii({name:"BackgroundCubeMaterial",uniforms:yr(In.backgroundCube.uniforms),vertexShader:In.backgroundCube.vertexShader,fragmentShader:In.backgroundCube.fragmentShader,side:on,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),u.geometry.deleteAttribute("normal"),u.geometry.deleteAttribute("uv"),u.onBeforeRender=function(E,C,L){this.matrixWorld.copyPosition(L.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(u)),bi.copy(_.backgroundRotation),bi.x*=-1,bi.y*=-1,bi.z*=-1,w.isCubeTexture&&w.isRenderTargetTexture===!1&&(bi.y*=-1,bi.z*=-1),u.material.uniforms.envMap.value=w,u.material.uniforms.flipEnvMap.value=w.isCubeTexture&&w.isRenderTargetTexture===!1?-1:1,u.material.uniforms.backgroundBlurriness.value=_.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(w0.makeRotationFromEuler(bi)),u.material.toneMapped=xt.getTransfer(w.colorSpace)!==Et,(h!==w||d!==w.version||f!==n.toneMapping)&&(u.material.needsUpdate=!0,h=w,d=w.version,f=n.toneMapping),u.layers.enableAll(),S.unshift(u,u.geometry,u.material,0,0,null)):w&&w.isTexture&&(a===void 0&&(a=new pt(new Kn(2,2),new ii({name:"BackgroundMaterial",uniforms:yr(In.background.uniforms),vertexShader:In.background.vertexShader,fragmentShader:In.background.fragmentShader,side:xi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),a.geometry.deleteAttribute("normal"),Object.defineProperty(a.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(a)),a.material.uniforms.t2D.value=w,a.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,a.material.toneMapped=xt.getTransfer(w.colorSpace)!==Et,w.matrixAutoUpdate===!0&&w.updateMatrix(),a.material.uniforms.uvTransform.value.copy(w.matrix),(h!==w||d!==w.version||f!==n.toneMapping)&&(a.material.needsUpdate=!0,h=w,d=w.version,f=n.toneMapping),a.layers.enableAll(),S.unshift(a,a.geometry,a.material,0,0,null))}function p(S,_){S.getRGB(qs,Ku(n)),i.buffers.color.setClear(qs.r,qs.g,qs.b,_,o)}function b(){u!==void 0&&(u.geometry.dispose(),u.material.dispose(),u=void 0),a!==void 0&&(a.geometry.dispose(),a.material.dispose(),a=void 0)}return{getClearColor:function(){return c},setClearColor:function(S,_=1){c.set(S),l=_,p(c,l)},getClearAlpha:function(){return l},setClearAlpha:function(S){l=S,p(c,l)},render:x,addToRenderList:m,dispose:b}}function R0(n,e){const t=n.getParameter(n.MAX_VERTEX_ATTRIBS),i={},r=d(null);let s=r,o=!1;function c(y,R,U,F,Y){let G=!1;const H=h(F,U,R);s!==H&&(s=H,a(s.object)),G=f(y,F,U,Y),G&&g(y,F,U,Y),Y!==null&&e.update(Y,n.ELEMENT_ARRAY_BUFFER),(G||o)&&(o=!1,_(y,R,U,F),Y!==null&&n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,e.get(Y).buffer))}function l(){return n.createVertexArray()}function a(y){return n.bindVertexArray(y)}function u(y){return n.deleteVertexArray(y)}function h(y,R,U){const F=U.wireframe===!0;let Y=i[y.id];Y===void 0&&(Y={},i[y.id]=Y);let G=Y[R.id];G===void 0&&(G={},Y[R.id]=G);let H=G[F];return H===void 0&&(H=d(l()),G[F]=H),H}function d(y){const R=[],U=[],F=[];for(let Y=0;Y<t;Y++)R[Y]=0,U[Y]=0,F[Y]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:R,enabledAttributes:U,attributeDivisors:F,object:y,attributes:{},index:null}}function f(y,R,U,F){const Y=s.attributes,G=R.attributes;let H=0;const J=U.getAttributes();for(const W in J)if(J[W].location>=0){const _e=Y[W];let we=G[W];if(we===void 0&&(W==="instanceMatrix"&&y.instanceMatrix&&(we=y.instanceMatrix),W==="instanceColor"&&y.instanceColor&&(we=y.instanceColor)),_e===void 0||_e.attribute!==we||we&&_e.data!==we.data)return!0;H++}return s.attributesNum!==H||s.index!==F}function g(y,R,U,F){const Y={},G=R.attributes;let H=0;const J=U.getAttributes();for(const W in J)if(J[W].location>=0){let _e=G[W];_e===void 0&&(W==="instanceMatrix"&&y.instanceMatrix&&(_e=y.instanceMatrix),W==="instanceColor"&&y.instanceColor&&(_e=y.instanceColor));const we={};we.attribute=_e,_e&&_e.data&&(we.data=_e.data),Y[W]=we,H++}s.attributes=Y,s.attributesNum=H,s.index=F}function x(){const y=s.newAttributes;for(let R=0,U=y.length;R<U;R++)y[R]=0}function m(y){p(y,0)}function p(y,R){const U=s.newAttributes,F=s.enabledAttributes,Y=s.attributeDivisors;U[y]=1,F[y]===0&&(n.enableVertexAttribArray(y),F[y]=1),Y[y]!==R&&(n.vertexAttribDivisor(y,R),Y[y]=R)}function b(){const y=s.newAttributes,R=s.enabledAttributes;for(let U=0,F=R.length;U<F;U++)R[U]!==y[U]&&(n.disableVertexAttribArray(U),R[U]=0)}function S(y,R,U,F,Y,G,H){H===!0?n.vertexAttribIPointer(y,R,U,Y,G):n.vertexAttribPointer(y,R,U,F,Y,G)}function _(y,R,U,F){x();const Y=F.attributes,G=U.getAttributes(),H=R.defaultAttributeValues;for(const J in G){const W=G[J];if(W.location>=0){let le=Y[J];if(le===void 0&&(J==="instanceMatrix"&&y.instanceMatrix&&(le=y.instanceMatrix),J==="instanceColor"&&y.instanceColor&&(le=y.instanceColor)),le!==void 0){const _e=le.normalized,we=le.itemSize,qe=e.get(le);if(qe===void 0)continue;const at=qe.buffer,ne=qe.type,Ie=qe.bytesPerElement,Z=ne===n.INT||ne===n.UNSIGNED_INT||le.gpuType===Tc;if(le.isInterleavedBufferAttribute){const K=le.data,oe=K.stride,Me=le.offset;if(K.isInstancedInterleavedBuffer){for(let fe=0;fe<W.locationSize;fe++)p(W.location+fe,K.meshPerAttribute);y.isInstancedMesh!==!0&&F._maxInstanceCount===void 0&&(F._maxInstanceCount=K.meshPerAttribute*K.count)}else for(let fe=0;fe<W.locationSize;fe++)m(W.location+fe);n.bindBuffer(n.ARRAY_BUFFER,at);for(let fe=0;fe<W.locationSize;fe++)S(W.location+fe,we/W.locationSize,ne,_e,oe*Ie,(Me+we/W.locationSize*fe)*Ie,Z)}else{if(le.isInstancedBufferAttribute){for(let K=0;K<W.locationSize;K++)p(W.location+K,le.meshPerAttribute);y.isInstancedMesh!==!0&&F._maxInstanceCount===void 0&&(F._maxInstanceCount=le.meshPerAttribute*le.count)}else for(let K=0;K<W.locationSize;K++)m(W.location+K);n.bindBuffer(n.ARRAY_BUFFER,at);for(let K=0;K<W.locationSize;K++)S(W.location+K,we/W.locationSize,ne,_e,we*Ie,we/W.locationSize*K*Ie,Z)}}else if(H!==void 0){const _e=H[J];if(_e!==void 0)switch(_e.length){case 2:n.vertexAttrib2fv(W.location,_e);break;case 3:n.vertexAttrib3fv(W.location,_e);break;case 4:n.vertexAttrib4fv(W.location,_e);break;default:n.vertexAttrib1fv(W.location,_e)}}}}b()}function w(){L();for(const y in i){const R=i[y];for(const U in R){const F=R[U];for(const Y in F)u(F[Y].object),delete F[Y];delete R[U]}delete i[y]}}function E(y){if(i[y.id]===void 0)return;const R=i[y.id];for(const U in R){const F=R[U];for(const Y in F)u(F[Y].object),delete F[Y];delete R[U]}delete i[y.id]}function C(y){for(const R in i){const U=i[R];if(U[y.id]===void 0)continue;const F=U[y.id];for(const Y in F)u(F[Y].object),delete F[Y];delete U[y.id]}}function L(){v(),o=!0,s!==r&&(s=r,a(s.object))}function v(){r.geometry=null,r.program=null,r.wireframe=!1}return{setup:c,reset:L,resetDefaultState:v,dispose:w,releaseStatesOfGeometry:E,releaseStatesOfProgram:C,initAttributes:x,enableAttribute:m,disableUnusedAttributes:b}}function C0(n,e,t){let i;function r(a){i=a}function s(a,u){n.drawArrays(i,a,u),t.update(u,i,1)}function o(a,u,h){h!==0&&(n.drawArraysInstanced(i,a,u,h),t.update(u,i,h))}function c(a,u,h){if(h===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,a,0,u,0,h);let f=0;for(let g=0;g<h;g++)f+=u[g];t.update(f,i,1)}function l(a,u,h,d){if(h===0)return;const f=e.get("WEBGL_multi_draw");if(f===null)for(let g=0;g<a.length;g++)o(a[g],u[g],d[g]);else{f.multiDrawArraysInstancedWEBGL(i,a,0,u,0,d,0,h);let g=0;for(let x=0;x<h;x++)g+=u[x]*d[x];t.update(g,i,1)}}this.setMode=r,this.render=s,this.renderInstances=o,this.renderMultiDraw=c,this.renderMultiDrawInstances=l}function P0(n,e,t,i){let r;function s(){if(r!==void 0)return r;if(e.has("EXT_texture_filter_anisotropic")===!0){const C=e.get("EXT_texture_filter_anisotropic");r=n.getParameter(C.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else r=0;return r}function o(C){return!(C!==Tn&&i.convert(C)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_FORMAT))}function c(C){const L=C===ms&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(C!==On&&i.convert(C)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_TYPE)&&C!==Fn&&!L)}function l(C){if(C==="highp"){if(n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.HIGH_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.HIGH_FLOAT).precision>0)return"highp";C="mediump"}return C==="mediump"&&n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.MEDIUM_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let a=t.precision!==void 0?t.precision:"highp";const u=l(a);u!==a&&(console.warn("THREE.WebGLRenderer:",a,"not supported, using",u,"instead."),a=u);const h=t.logarithmicDepthBuffer===!0,d=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),f=n.getParameter(n.MAX_TEXTURE_IMAGE_UNITS),g=n.getParameter(n.MAX_VERTEX_TEXTURE_IMAGE_UNITS),x=n.getParameter(n.MAX_TEXTURE_SIZE),m=n.getParameter(n.MAX_CUBE_MAP_TEXTURE_SIZE),p=n.getParameter(n.MAX_VERTEX_ATTRIBS),b=n.getParameter(n.MAX_VERTEX_UNIFORM_VECTORS),S=n.getParameter(n.MAX_VARYING_VECTORS),_=n.getParameter(n.MAX_FRAGMENT_UNIFORM_VECTORS),w=g>0,E=n.getParameter(n.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:c,precision:a,logarithmicDepthBuffer:h,reversedDepthBuffer:d,maxTextures:f,maxVertexTextures:g,maxTextureSize:x,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:b,maxVaryings:S,maxFragmentUniforms:_,vertexTextures:w,maxSamples:E}}function L0(n){const e=this;let t=null,i=0,r=!1,s=!1;const o=new Ri,c=new it,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(h,d){const f=h.length!==0||d||i!==0||r;return r=d,i=h.length,f},this.beginShadows=function(){s=!0,u(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(h,d){t=u(h,d,0)},this.setState=function(h,d,f){const g=h.clippingPlanes,x=h.clipIntersection,m=h.clipShadows,p=n.get(h);if(!r||g===null||g.length===0||s&&!m)s?u(null):a();else{const b=s?0:i,S=b*4;let _=p.clippingState||null;l.value=_,_=u(g,d,S,f);for(let w=0;w!==S;++w)_[w]=t[w];p.clippingState=_,this.numIntersection=x?this.numPlanes:0,this.numPlanes+=b}};function a(){l.value!==t&&(l.value=t,l.needsUpdate=i>0),e.numPlanes=i,e.numIntersection=0}function u(h,d,f,g){const x=h!==null?h.length:0;let m=null;if(x!==0){if(m=l.value,g!==!0||m===null){const p=f+x*4,b=d.matrixWorldInverse;c.getNormalMatrix(b),(m===null||m.length<p)&&(m=new Float32Array(p));for(let S=0,_=f;S!==x;++S,_+=4)o.copy(h[S]).applyMatrix4(b,c),o.normal.toArray(m,_),m[_+3]=o.constant}l.value=m,l.needsUpdate=!0}return e.numPlanes=x,e.numIntersection=0,m}}function D0(n){let e=new WeakMap;function t(o,c){return c===Ca?o.mapping=_r:c===Pa&&(o.mapping=xr),o}function i(o){if(o&&o.isTexture){const c=o.mapping;if(c===Ca||c===Pa)if(e.has(o)){const l=e.get(o).texture;return t(l,o.mapping)}else{const l=o.image;if(l&&l.height>0){const a=new Jd(l.height);return a.fromEquirectangularTexture(n,o),e.set(o,a),o.addEventListener("dispose",r),t(a.texture,o.mapping)}else return null}}return o}function r(o){const c=o.target;c.removeEventListener("dispose",r);const l=e.get(c);l!==void 0&&(e.delete(c),l.dispose())}function s(){e=new WeakMap}return{get:i,dispose:s}}const dr=4,Gl=[.125,.215,.35,.446,.526,.582],Li=20,sa=new ph,Wl=new ct;let oa=null,aa=0,ca=0,la=!1;const Ci=(1+Math.sqrt(5))/2,lr=1/Ci,Xl=[new I(-Ci,lr,0),new I(Ci,lr,0),new I(-lr,0,Ci),new I(lr,0,Ci),new I(0,Ci,-lr),new I(0,Ci,lr),new I(-1,1,-1),new I(1,1,-1),new I(-1,1,1),new I(1,1,1)],I0=new I;class ql{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,i=.1,r=100,s={}){const{size:o=256,position:c=I0}=s;oa=this._renderer.getRenderTarget(),aa=this._renderer.getActiveCubeFace(),ca=this._renderer.getActiveMipmapLevel(),la=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,i,r,l,c),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=jl(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Zl(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(oa,aa,ca),this._renderer.xr.enabled=la,e.scissorTest=!1,Ys(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===_r||e.mapping===xr?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),oa=this._renderer.getRenderTarget(),aa=this._renderer.getActiveCubeFace(),ca=this._renderer.getActiveMipmapLevel(),la=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const i=t||this._allocateTargets();return this._textureToCubeUV(e,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,i={magFilter:Nn,minFilter:Nn,generateMipmaps:!1,type:ms,format:Tn,colorSpace:vr,depthBuffer:!1},r=Yl(e,t,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Yl(e,t,i);const{_lodMax:s}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=U0(s)),this._blurMaterial=N0(s,e,t)}return r}_compileMaterial(e){const t=new pt(this._lodPlanes[0],e);this._renderer.compile(t,sa)}_sceneToCubeUV(e,t,i,r,s){const l=new _n(90,1,t,i),a=[1,-1,1,1,1,1],u=[1,1,1,-1,-1,-1],h=this._renderer,d=h.autoClear,f=h.toneMapping;h.getClearColor(Wl),h.toneMapping=_i,h.autoClear=!1,h.state.buffers.depth.getReversed()&&(h.setRenderTarget(r),h.clearDepth(),h.setRenderTarget(null));const x=new _s({name:"PMREM.Background",side:on,depthWrite:!1,depthTest:!1}),m=new pt(new ni,x);let p=!1;const b=e.background;b?b.isColor&&(x.color.copy(b),e.background=null,p=!0):(x.color.copy(Wl),p=!0);for(let S=0;S<6;S++){const _=S%3;_===0?(l.up.set(0,a[S],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x+u[S],s.y,s.z)):_===1?(l.up.set(0,0,a[S]),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y+u[S],s.z)):(l.up.set(0,a[S],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y,s.z+u[S]));const w=this._cubeSize;Ys(r,_*w,S>2?w:0,w,w),h.setRenderTarget(r),p&&h.render(m,l),h.render(e,l)}m.geometry.dispose(),m.material.dispose(),h.toneMapping=f,h.autoClear=d,e.background=b}_textureToCubeUV(e,t){const i=this._renderer,r=e.mapping===_r||e.mapping===xr;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=jl()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Zl());const s=r?this._cubemapMaterial:this._equirectMaterial,o=new pt(this._lodPlanes[0],s),c=s.uniforms;c.envMap.value=e;const l=this._cubeSize;Ys(t,0,0,3*l,2*l),i.setRenderTarget(t),i.render(o,sa)}_applyPMREM(e){const t=this._renderer,i=t.autoClear;t.autoClear=!1;const r=this._lodPlanes.length;for(let s=1;s<r;s++){const o=Math.sqrt(this._sigmas[s]*this._sigmas[s]-this._sigmas[s-1]*this._sigmas[s-1]),c=Xl[(r-s-1)%Xl.length];this._blur(e,s-1,s,o,c)}t.autoClear=i}_blur(e,t,i,r,s){const o=this._pingPongRenderTarget;this._halfBlur(e,o,t,i,r,"latitudinal",s),this._halfBlur(o,e,i,i,r,"longitudinal",s)}_halfBlur(e,t,i,r,s,o,c){const l=this._renderer,a=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");const u=3,h=new pt(this._lodPlanes[r],a),d=a.uniforms,f=this._sizeLods[i]-1,g=isFinite(s)?Math.PI/(2*f):2*Math.PI/(2*Li-1),x=s/g,m=isFinite(s)?1+Math.floor(u*x):Li;m>Li&&console.warn(`sigmaRadians, ${s}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Li}`);const p=[];let b=0;for(let C=0;C<Li;++C){const L=C/x,v=Math.exp(-L*L/2);p.push(v),C===0?b+=v:C<m&&(b+=2*v)}for(let C=0;C<p.length;C++)p[C]=p[C]/b;d.envMap.value=e.texture,d.samples.value=m,d.weights.value=p,d.latitudinal.value=o==="latitudinal",c&&(d.poleAxis.value=c);const{_lodMax:S}=this;d.dTheta.value=g,d.mipInt.value=S-i;const _=this._sizeLods[r],w=3*_*(r>S-dr?r-S+dr:0),E=4*(this._cubeSize-_);Ys(t,w,E,3*_,2*_),l.setRenderTarget(t),l.render(h,sa)}}function U0(n){const e=[],t=[],i=[];let r=n;const s=n-dr+1+Gl.length;for(let o=0;o<s;o++){const c=Math.pow(2,r);t.push(c);let l=1/c;o>n-dr?l=Gl[o-n+dr-1]:o===0&&(l=0),i.push(l);const a=1/(c-2),u=-a,h=1+a,d=[u,u,h,u,h,h,u,u,h,h,u,h],f=6,g=6,x=3,m=2,p=1,b=new Float32Array(x*g*f),S=new Float32Array(m*g*f),_=new Float32Array(p*g*f);for(let E=0;E<f;E++){const C=E%3*2/3-1,L=E>2?0:-1,v=[C,L,0,C+2/3,L,0,C+2/3,L+1,0,C,L,0,C+2/3,L+1,0,C,L+1,0];b.set(v,x*g*E),S.set(d,m*g*E);const y=[E,E,E,E,E,E];_.set(y,p*g*E)}const w=new qt;w.setAttribute("position",new vn(b,x)),w.setAttribute("uv",new vn(S,m)),w.setAttribute("faceIndex",new vn(_,p)),e.push(w),r>dr&&r--}return{lodPlanes:e,sizeLods:t,sigmas:i}}function Yl(n,e,t){const i=new Ni(n,e,t);return i.texture.mapping=xo,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function Ys(n,e,t,i,r){n.viewport.set(e,t,i,r),n.scissor.set(e,t,i,r)}function N0(n,e,t){const i=new Float32Array(Li),r=new I(0,1,0);return new ii({name:"SphericalGaussianBlur",defines:{n:Li,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${n}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:i},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:r}},vertexShader:Hc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:gi,depthTest:!1,depthWrite:!1})}function Zl(){return new ii({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Hc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:gi,depthTest:!1,depthWrite:!1})}function jl(){return new ii({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Hc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:gi,depthTest:!1,depthWrite:!1})}function Hc(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function F0(n){let e=new WeakMap,t=null;function i(c){if(c&&c.isTexture){const l=c.mapping,a=l===Ca||l===Pa,u=l===_r||l===xr;if(a||u){let h=e.get(c);const d=h!==void 0?h.texture.pmremVersion:0;if(c.isRenderTargetTexture&&c.pmremVersion!==d)return t===null&&(t=new ql(n)),h=a?t.fromEquirectangular(c,h):t.fromCubemap(c,h),h.texture.pmremVersion=c.pmremVersion,e.set(c,h),h.texture;if(h!==void 0)return h.texture;{const f=c.image;return a&&f&&f.height>0||u&&f&&r(f)?(t===null&&(t=new ql(n)),h=a?t.fromEquirectangular(c):t.fromCubemap(c),h.texture.pmremVersion=c.pmremVersion,e.set(c,h),c.addEventListener("dispose",s),h.texture):null}}}return c}function r(c){let l=0;const a=6;for(let u=0;u<a;u++)c[u]!==void 0&&l++;return l===a}function s(c){const l=c.target;l.removeEventListener("dispose",s);const a=e.get(l);a!==void 0&&(e.delete(l),a.dispose())}function o(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:i,dispose:o}}function z0(n){const e={};function t(i){if(e[i]!==void 0)return e[i];let r;switch(i){case"WEBGL_depth_texture":r=n.getExtension("WEBGL_depth_texture")||n.getExtension("MOZ_WEBGL_depth_texture")||n.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":r=n.getExtension("EXT_texture_filter_anisotropic")||n.getExtension("MOZ_EXT_texture_filter_anisotropic")||n.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":r=n.getExtension("WEBGL_compressed_texture_s3tc")||n.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||n.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":r=n.getExtension("WEBGL_compressed_texture_pvrtc")||n.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:r=n.getExtension(i)}return e[i]=r,r}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){const r=t(i);return r===null&&ls("THREE.WebGLRenderer: "+i+" extension not supported."),r}}}function O0(n,e,t,i){const r={},s=new WeakMap;function o(h){const d=h.target;d.index!==null&&e.remove(d.index);for(const g in d.attributes)e.remove(d.attributes[g]);d.removeEventListener("dispose",o),delete r[d.id];const f=s.get(d);f&&(e.remove(f),s.delete(d)),i.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,t.memory.geometries--}function c(h,d){return r[d.id]===!0||(d.addEventListener("dispose",o),r[d.id]=!0,t.memory.geometries++),d}function l(h){const d=h.attributes;for(const f in d)e.update(d[f],n.ARRAY_BUFFER)}function a(h){const d=[],f=h.index,g=h.attributes.position;let x=0;if(f!==null){const b=f.array;x=f.version;for(let S=0,_=b.length;S<_;S+=3){const w=b[S+0],E=b[S+1],C=b[S+2];d.push(w,E,E,C,C,w)}}else if(g!==void 0){const b=g.array;x=g.version;for(let S=0,_=b.length/3-1;S<_;S+=3){const w=S+0,E=S+1,C=S+2;d.push(w,E,E,C,C,w)}}else return;const m=new(qu(d)?Ju:$u)(d,1);m.version=x;const p=s.get(h);p&&e.remove(p),s.set(h,m)}function u(h){const d=s.get(h);if(d){const f=h.index;f!==null&&d.version<f.version&&a(h)}else a(h);return s.get(h)}return{get:c,update:l,getWireframeAttribute:u}}function B0(n,e,t){let i;function r(d){i=d}let s,o;function c(d){s=d.type,o=d.bytesPerElement}function l(d,f){n.drawElements(i,f,s,d*o),t.update(f,i,1)}function a(d,f,g){g!==0&&(n.drawElementsInstanced(i,f,s,d*o,g),t.update(f,i,g))}function u(d,f,g){if(g===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,f,0,s,d,0,g);let m=0;for(let p=0;p<g;p++)m+=f[p];t.update(m,i,1)}function h(d,f,g,x){if(g===0)return;const m=e.get("WEBGL_multi_draw");if(m===null)for(let p=0;p<d.length;p++)a(d[p]/o,f[p],x[p]);else{m.multiDrawElementsInstancedWEBGL(i,f,0,s,d,0,x,0,g);let p=0;for(let b=0;b<g;b++)p+=f[b]*x[b];t.update(p,i,1)}}this.setMode=r,this.setIndex=c,this.render=l,this.renderInstances=a,this.renderMultiDraw=u,this.renderMultiDrawInstances=h}function k0(n){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(s,o,c){switch(t.calls++,o){case n.TRIANGLES:t.triangles+=c*(s/3);break;case n.LINES:t.lines+=c*(s/2);break;case n.LINE_STRIP:t.lines+=c*(s-1);break;case n.LINE_LOOP:t.lines+=c*s;break;case n.POINTS:t.points+=c*s;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function r(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:r,update:i}}function H0(n,e,t){const i=new WeakMap,r=new Tt;function s(o,c,l){const a=o.morphTargetInfluences,u=c.morphAttributes.position||c.morphAttributes.normal||c.morphAttributes.color,h=u!==void 0?u.length:0;let d=i.get(c);if(d===void 0||d.count!==h){let y=function(){L.dispose(),i.delete(c),c.removeEventListener("dispose",y)};var f=y;d!==void 0&&d.texture.dispose();const g=c.morphAttributes.position!==void 0,x=c.morphAttributes.normal!==void 0,m=c.morphAttributes.color!==void 0,p=c.morphAttributes.position||[],b=c.morphAttributes.normal||[],S=c.morphAttributes.color||[];let _=0;g===!0&&(_=1),x===!0&&(_=2),m===!0&&(_=3);let w=c.attributes.position.count*_,E=1;w>e.maxTextureSize&&(E=Math.ceil(w/e.maxTextureSize),w=e.maxTextureSize);const C=new Float32Array(w*E*4*h),L=new Yu(C,w,E,h);L.type=Fn,L.needsUpdate=!0;const v=_*4;for(let R=0;R<h;R++){const U=p[R],F=b[R],Y=S[R],G=w*E*4*R;for(let H=0;H<U.count;H++){const J=H*v;g===!0&&(r.fromBufferAttribute(U,H),C[G+J+0]=r.x,C[G+J+1]=r.y,C[G+J+2]=r.z,C[G+J+3]=0),x===!0&&(r.fromBufferAttribute(F,H),C[G+J+4]=r.x,C[G+J+5]=r.y,C[G+J+6]=r.z,C[G+J+7]=0),m===!0&&(r.fromBufferAttribute(Y,H),C[G+J+8]=r.x,C[G+J+9]=r.y,C[G+J+10]=r.z,C[G+J+11]=Y.itemSize===4?r.w:1)}}d={count:h,texture:L,size:new Ce(w,E)},i.set(c,d),c.addEventListener("dispose",y)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(n,"morphTexture",o.morphTexture,t);else{let g=0;for(let m=0;m<a.length;m++)g+=a[m];const x=c.morphTargetsRelative?1:1-g;l.getUniforms().setValue(n,"morphTargetBaseInfluence",x),l.getUniforms().setValue(n,"morphTargetInfluences",a)}l.getUniforms().setValue(n,"morphTargetsTexture",d.texture,t),l.getUniforms().setValue(n,"morphTargetsTextureSize",d.size)}return{update:s}}function V0(n,e,t,i){let r=new WeakMap;function s(l){const a=i.render.frame,u=l.geometry,h=e.get(l,u);if(r.get(h)!==a&&(e.update(h),r.set(h,a)),l.isInstancedMesh&&(l.hasEventListener("dispose",c)===!1&&l.addEventListener("dispose",c),r.get(l)!==a&&(t.update(l.instanceMatrix,n.ARRAY_BUFFER),l.instanceColor!==null&&t.update(l.instanceColor,n.ARRAY_BUFFER),r.set(l,a))),l.isSkinnedMesh){const d=l.skeleton;r.get(d)!==a&&(d.update(),r.set(d,a))}return h}function o(){r=new WeakMap}function c(l){const a=l.target;a.removeEventListener("dispose",c),t.remove(a.instanceMatrix),a.instanceColor!==null&&t.remove(a.instanceColor)}return{update:s,dispose:o}}const gh=new Qt,$l=new ih(1,1),_h=new Yu,xh=new Ud,vh=new eh,Jl=[],Kl=[],Ql=new Float32Array(16),eu=new Float32Array(9),tu=new Float32Array(4);function Ar(n,e,t){const i=n[0];if(i<=0||i>0)return n;const r=e*t;let s=Jl[r];if(s===void 0&&(s=new Float32Array(r),Jl[r]=s),e!==0){i.toArray(s,0);for(let o=1,c=0;o!==e;++o)c+=t,n[o].toArray(s,c)}return s}function Wt(n,e){if(n.length!==e.length)return!1;for(let t=0,i=n.length;t<i;t++)if(n[t]!==e[t])return!1;return!0}function Xt(n,e){for(let t=0,i=e.length;t<i;t++)n[t]=e[t]}function Mo(n,e){let t=Kl[e];t===void 0&&(t=new Int32Array(e),Kl[e]=t);for(let i=0;i!==e;++i)t[i]=n.allocateTextureUnit();return t}function G0(n,e){const t=this.cache;t[0]!==e&&(n.uniform1f(this.addr,e),t[0]=e)}function W0(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Wt(t,e))return;n.uniform2fv(this.addr,e),Xt(t,e)}}function X0(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(n.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Wt(t,e))return;n.uniform3fv(this.addr,e),Xt(t,e)}}function q0(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Wt(t,e))return;n.uniform4fv(this.addr,e),Xt(t,e)}}function Y0(n,e){const t=this.cache,i=e.elements;if(i===void 0){if(Wt(t,e))return;n.uniformMatrix2fv(this.addr,!1,e),Xt(t,e)}else{if(Wt(t,i))return;tu.set(i),n.uniformMatrix2fv(this.addr,!1,tu),Xt(t,i)}}function Z0(n,e){const t=this.cache,i=e.elements;if(i===void 0){if(Wt(t,e))return;n.uniformMatrix3fv(this.addr,!1,e),Xt(t,e)}else{if(Wt(t,i))return;eu.set(i),n.uniformMatrix3fv(this.addr,!1,eu),Xt(t,i)}}function j0(n,e){const t=this.cache,i=e.elements;if(i===void 0){if(Wt(t,e))return;n.uniformMatrix4fv(this.addr,!1,e),Xt(t,e)}else{if(Wt(t,i))return;Ql.set(i),n.uniformMatrix4fv(this.addr,!1,Ql),Xt(t,i)}}function $0(n,e){const t=this.cache;t[0]!==e&&(n.uniform1i(this.addr,e),t[0]=e)}function J0(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Wt(t,e))return;n.uniform2iv(this.addr,e),Xt(t,e)}}function K0(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Wt(t,e))return;n.uniform3iv(this.addr,e),Xt(t,e)}}function Q0(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Wt(t,e))return;n.uniform4iv(this.addr,e),Xt(t,e)}}function eg(n,e){const t=this.cache;t[0]!==e&&(n.uniform1ui(this.addr,e),t[0]=e)}function tg(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Wt(t,e))return;n.uniform2uiv(this.addr,e),Xt(t,e)}}function ng(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Wt(t,e))return;n.uniform3uiv(this.addr,e),Xt(t,e)}}function ig(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Wt(t,e))return;n.uniform4uiv(this.addr,e),Xt(t,e)}}function rg(n,e,t){const i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r);let s;this.type===n.SAMPLER_2D_SHADOW?($l.compareFunction=Xu,s=$l):s=gh,t.setTexture2D(e||s,r)}function sg(n,e,t){const i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture3D(e||xh,r)}function og(n,e,t){const i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTextureCube(e||vh,r)}function ag(n,e,t){const i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture2DArray(e||_h,r)}function cg(n){switch(n){case 5126:return G0;case 35664:return W0;case 35665:return X0;case 35666:return q0;case 35674:return Y0;case 35675:return Z0;case 35676:return j0;case 5124:case 35670:return $0;case 35667:case 35671:return J0;case 35668:case 35672:return K0;case 35669:case 35673:return Q0;case 5125:return eg;case 36294:return tg;case 36295:return ng;case 36296:return ig;case 35678:case 36198:case 36298:case 36306:case 35682:return rg;case 35679:case 36299:case 36307:return sg;case 35680:case 36300:case 36308:case 36293:return og;case 36289:case 36303:case 36311:case 36292:return ag}}function lg(n,e){n.uniform1fv(this.addr,e)}function ug(n,e){const t=Ar(e,this.size,2);n.uniform2fv(this.addr,t)}function hg(n,e){const t=Ar(e,this.size,3);n.uniform3fv(this.addr,t)}function dg(n,e){const t=Ar(e,this.size,4);n.uniform4fv(this.addr,t)}function fg(n,e){const t=Ar(e,this.size,4);n.uniformMatrix2fv(this.addr,!1,t)}function pg(n,e){const t=Ar(e,this.size,9);n.uniformMatrix3fv(this.addr,!1,t)}function mg(n,e){const t=Ar(e,this.size,16);n.uniformMatrix4fv(this.addr,!1,t)}function gg(n,e){n.uniform1iv(this.addr,e)}function _g(n,e){n.uniform2iv(this.addr,e)}function xg(n,e){n.uniform3iv(this.addr,e)}function vg(n,e){n.uniform4iv(this.addr,e)}function yg(n,e){n.uniform1uiv(this.addr,e)}function Mg(n,e){n.uniform2uiv(this.addr,e)}function Sg(n,e){n.uniform3uiv(this.addr,e)}function Eg(n,e){n.uniform4uiv(this.addr,e)}function bg(n,e,t){const i=this.cache,r=e.length,s=Mo(t,r);Wt(i,s)||(n.uniform1iv(this.addr,s),Xt(i,s));for(let o=0;o!==r;++o)t.setTexture2D(e[o]||gh,s[o])}function Tg(n,e,t){const i=this.cache,r=e.length,s=Mo(t,r);Wt(i,s)||(n.uniform1iv(this.addr,s),Xt(i,s));for(let o=0;o!==r;++o)t.setTexture3D(e[o]||xh,s[o])}function wg(n,e,t){const i=this.cache,r=e.length,s=Mo(t,r);Wt(i,s)||(n.uniform1iv(this.addr,s),Xt(i,s));for(let o=0;o!==r;++o)t.setTextureCube(e[o]||vh,s[o])}function Ag(n,e,t){const i=this.cache,r=e.length,s=Mo(t,r);Wt(i,s)||(n.uniform1iv(this.addr,s),Xt(i,s));for(let o=0;o!==r;++o)t.setTexture2DArray(e[o]||_h,s[o])}function Rg(n){switch(n){case 5126:return lg;case 35664:return ug;case 35665:return hg;case 35666:return dg;case 35674:return fg;case 35675:return pg;case 35676:return mg;case 5124:case 35670:return gg;case 35667:case 35671:return _g;case 35668:case 35672:return xg;case 35669:case 35673:return vg;case 5125:return yg;case 36294:return Mg;case 36295:return Sg;case 36296:return Eg;case 35678:case 36198:case 36298:case 36306:case 35682:return bg;case 35679:case 36299:case 36307:return Tg;case 35680:case 36300:case 36308:case 36293:return wg;case 36289:case 36303:case 36311:case 36292:return Ag}}class Cg{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.setValue=cg(t.type)}}class Pg{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Rg(t.type)}}class Lg{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,i){const r=this.seq;for(let s=0,o=r.length;s!==o;++s){const c=r[s];c.setValue(e,t[c.id],i)}}}const ua=/(\w+)(\])?(\[|\.)?/g;function nu(n,e){n.seq.push(e),n.map[e.id]=e}function Dg(n,e,t){const i=n.name,r=i.length;for(ua.lastIndex=0;;){const s=ua.exec(i),o=ua.lastIndex;let c=s[1];const l=s[2]==="]",a=s[3];if(l&&(c=c|0),a===void 0||a==="["&&o+2===r){nu(t,a===void 0?new Cg(c,n,e):new Pg(c,n,e));break}else{let h=t.map[c];h===void 0&&(h=new Lg(c),nu(t,h)),t=h}}}class so{constructor(e,t){this.seq=[],this.map={};const i=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<i;++r){const s=e.getActiveUniform(t,r),o=e.getUniformLocation(t,s.name);Dg(s,o,this)}}setValue(e,t,i,r){const s=this.map[t];s!==void 0&&s.setValue(e,i,r)}setOptional(e,t,i){const r=t[i];r!==void 0&&this.setValue(e,i,r)}static upload(e,t,i,r){for(let s=0,o=t.length;s!==o;++s){const c=t[s],l=i[c.id];l.needsUpdate!==!1&&c.setValue(e,l.value,r)}}static seqWithValue(e,t){const i=[];for(let r=0,s=e.length;r!==s;++r){const o=e[r];o.id in t&&i.push(o)}return i}}function iu(n,e,t){const i=n.createShader(e);return n.shaderSource(i,t),n.compileShader(i),i}const Ig=37297;let Ug=0;function Ng(n,e){const t=n.split(`
`),i=[],r=Math.max(e-6,0),s=Math.min(e+6,t.length);for(let o=r;o<s;o++){const c=o+1;i.push(`${c===e?">":" "} ${c}: ${t[o]}`)}return i.join(`
`)}const ru=new it;function Fg(n){xt._getMatrix(ru,xt.workingColorSpace,n);const e=`mat3( ${ru.elements.map(t=>t.toFixed(4))} )`;switch(xt.getTransfer(n)){case lo:return[e,"LinearTransferOETF"];case Et:return[e,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",n),[e,"LinearTransferOETF"]}}function su(n,e,t){const i=n.getShaderParameter(e,n.COMPILE_STATUS),s=(n.getShaderInfoLog(e)||"").trim();if(i&&s==="")return"";const o=/ERROR: 0:(\d+)/.exec(s);if(o){const c=parseInt(o[1]);return t.toUpperCase()+`

`+s+`

`+Ng(n.getShaderSource(e),c)}else return s}function zg(n,e){const t=Fg(e);return[`vec4 ${n}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}function Og(n,e){let t;switch(e){case cd:t="Linear";break;case ld:t="Reinhard";break;case ud:t="Cineon";break;case Nu:t="ACESFilmic";break;case dd:t="AgX";break;case fd:t="Neutral";break;case hd:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+n+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const Zs=new I;function Bg(){xt.getLuminanceCoefficients(Zs);const n=Zs.x.toFixed(4),e=Zs.y.toFixed(4),t=Zs.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${n}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function kg(n){return[n.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",n.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Zr).join(`
`)}function Hg(n){const e=[];for(const t in n){const i=n[t];i!==!1&&e.push("#define "+t+" "+i)}return e.join(`
`)}function Vg(n,e){const t={},i=n.getProgramParameter(e,n.ACTIVE_ATTRIBUTES);for(let r=0;r<i;r++){const s=n.getActiveAttrib(e,r),o=s.name;let c=1;s.type===n.FLOAT_MAT2&&(c=2),s.type===n.FLOAT_MAT3&&(c=3),s.type===n.FLOAT_MAT4&&(c=4),t[o]={type:s.type,location:n.getAttribLocation(e,o),locationSize:c}}return t}function Zr(n){return n!==""}function ou(n,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return n.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function au(n,e){return n.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const Gg=/^[ \t]*#include +<([\w\d./]+)>/gm;function pc(n){return n.replace(Gg,Xg)}const Wg=new Map;function Xg(n,e){let t=st[e];if(t===void 0){const i=Wg.get(e);if(i!==void 0)t=st[i],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,i);else throw new Error("Can not resolve #include <"+e+">")}return pc(t)}const qg=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function cu(n){return n.replace(qg,Yg)}function Yg(n,e,t,i){let r="";for(let s=parseInt(e);s<parseInt(t);s++)r+=i.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return r}function lu(n){let e=`precision ${n.precision} float;
	precision ${n.precision} int;
	precision ${n.precision} sampler2D;
	precision ${n.precision} samplerCube;
	precision ${n.precision} sampler3D;
	precision ${n.precision} sampler2DArray;
	precision ${n.precision} sampler2DShadow;
	precision ${n.precision} samplerCubeShadow;
	precision ${n.precision} sampler2DArrayShadow;
	precision ${n.precision} isampler2D;
	precision ${n.precision} isampler3D;
	precision ${n.precision} isamplerCube;
	precision ${n.precision} isampler2DArray;
	precision ${n.precision} usampler2D;
	precision ${n.precision} usampler3D;
	precision ${n.precision} usamplerCube;
	precision ${n.precision} usampler2DArray;
	`;return n.precision==="highp"?e+=`
#define HIGH_PRECISION`:n.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:n.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function Zg(n){let e="SHADOWMAP_TYPE_BASIC";return n.shadowMapType===Du?e="SHADOWMAP_TYPE_PCF":n.shadowMapType===Iu?e="SHADOWMAP_TYPE_PCF_SOFT":n.shadowMapType===Zn&&(e="SHADOWMAP_TYPE_VSM"),e}function jg(n){let e="ENVMAP_TYPE_CUBE";if(n.envMap)switch(n.envMapMode){case _r:case xr:e="ENVMAP_TYPE_CUBE";break;case xo:e="ENVMAP_TYPE_CUBE_UV";break}return e}function $g(n){let e="ENVMAP_MODE_REFLECTION";if(n.envMap)switch(n.envMapMode){case xr:e="ENVMAP_MODE_REFRACTION";break}return e}function Jg(n){let e="ENVMAP_BLENDING_NONE";if(n.envMap)switch(n.combine){case Uu:e="ENVMAP_BLENDING_MULTIPLY";break;case od:e="ENVMAP_BLENDING_MIX";break;case ad:e="ENVMAP_BLENDING_ADD";break}return e}function Kg(n){const e=n.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,i=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:i,maxMip:t}}function Qg(n,e,t,i){const r=n.getContext(),s=t.defines;let o=t.vertexShader,c=t.fragmentShader;const l=Zg(t),a=jg(t),u=$g(t),h=Jg(t),d=Kg(t),f=kg(t),g=Hg(s),x=r.createProgram();let m,p,b=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Zr).join(`
`),m.length>0&&(m+=`
`),p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Zr).join(`
`),p.length>0&&(p+=`
`)):(m=[lu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Zr).join(`
`),p=[lu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+a:"",t.envMap?"#define "+u:"",t.envMap?"#define "+h:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==_i?"#define TONE_MAPPING":"",t.toneMapping!==_i?st.tonemapping_pars_fragment:"",t.toneMapping!==_i?Og("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",st.colorspace_pars_fragment,zg("linearToOutputTexel",t.outputColorSpace),Bg(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Zr).join(`
`)),o=pc(o),o=ou(o,t),o=au(o,t),c=pc(c),c=ou(c,t),c=au(c,t),o=cu(o),c=cu(c),t.isRawShaderMaterial!==!0&&(b=`#version 300 es
`,m=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,p=["#define varying in",t.glslVersion===ol?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===ol?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);const S=b+m+o,_=b+p+c,w=iu(r,r.VERTEX_SHADER,S),E=iu(r,r.FRAGMENT_SHADER,_);r.attachShader(x,w),r.attachShader(x,E),t.index0AttributeName!==void 0?r.bindAttribLocation(x,0,t.index0AttributeName):t.morphTargets===!0&&r.bindAttribLocation(x,0,"position"),r.linkProgram(x);function C(R){if(n.debug.checkShaderErrors){const U=r.getProgramInfoLog(x)||"",F=r.getShaderInfoLog(w)||"",Y=r.getShaderInfoLog(E)||"",G=U.trim(),H=F.trim(),J=Y.trim();let W=!0,le=!0;if(r.getProgramParameter(x,r.LINK_STATUS)===!1)if(W=!1,typeof n.debug.onShaderError=="function")n.debug.onShaderError(r,x,w,E);else{const _e=su(r,w,"vertex"),we=su(r,E,"fragment");console.error("THREE.WebGLProgram: Shader Error "+r.getError()+" - VALIDATE_STATUS "+r.getProgramParameter(x,r.VALIDATE_STATUS)+`

Material Name: `+R.name+`
Material Type: `+R.type+`

Program Info Log: `+G+`
`+_e+`
`+we)}else G!==""?console.warn("THREE.WebGLProgram: Program Info Log:",G):(H===""||J==="")&&(le=!1);le&&(R.diagnostics={runnable:W,programLog:G,vertexShader:{log:H,prefix:m},fragmentShader:{log:J,prefix:p}})}r.deleteShader(w),r.deleteShader(E),L=new so(r,x),v=Vg(r,x)}let L;this.getUniforms=function(){return L===void 0&&C(this),L};let v;this.getAttributes=function(){return v===void 0&&C(this),v};let y=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return y===!1&&(y=r.getProgramParameter(x,Ig)),y},this.destroy=function(){i.releaseStatesOfProgram(this),r.deleteProgram(x),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Ug++,this.cacheKey=e,this.usedTimes=1,this.program=x,this.vertexShader=w,this.fragmentShader=E,this}let e_=0;class t_{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){const t=e.vertexShader,i=e.fragmentShader,r=this._getShaderStage(t),s=this._getShaderStage(i),o=this._getShaderCacheForMaterial(e);return o.has(r)===!1&&(o.add(r),r.usedTimes++),o.has(s)===!1&&(o.add(s),s.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let i=t.get(e);return i===void 0&&(i=new Set,t.set(e,i)),i}_getShaderStage(e){const t=this.shaderCache;let i=t.get(e);return i===void 0&&(i=new n_(e),t.set(e,i)),i}}class n_{constructor(e){this.id=e_++,this.code=e,this.usedTimes=0}}function i_(n,e,t,i,r,s,o){const c=new Ic,l=new t_,a=new Set,u=[],h=r.logarithmicDepthBuffer,d=r.vertexTextures;let f=r.precision;const g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function x(v){return a.add(v),v===0?"uv":`uv${v}`}function m(v,y,R,U,F){const Y=U.fog,G=F.geometry,H=v.isMeshStandardMaterial?U.environment:null,J=(v.isMeshStandardMaterial?t:e).get(v.envMap||H),W=J&&J.mapping===xo?J.image.height:null,le=g[v.type];v.precision!==null&&(f=r.getMaxPrecision(v.precision),f!==v.precision&&console.warn("THREE.WebGLProgram.getParameters:",v.precision,"not supported, using",f,"instead."));const _e=G.morphAttributes.position||G.morphAttributes.normal||G.morphAttributes.color,we=_e!==void 0?_e.length:0;let qe=0;G.morphAttributes.position!==void 0&&(qe=1),G.morphAttributes.normal!==void 0&&(qe=2),G.morphAttributes.color!==void 0&&(qe=3);let at,ne,Ie,Z;if(le){const ht=In[le];at=ht.vertexShader,ne=ht.fragmentShader}else at=v.vertexShader,ne=v.fragmentShader,l.update(v),Ie=l.getVertexShaderID(v),Z=l.getFragmentShaderID(v);const K=n.getRenderTarget(),oe=n.state.buffers.depth.getReversed(),Me=F.isInstancedMesh===!0,fe=F.isBatchedMesh===!0,Ue=!!v.map,ye=!!v.matcap,A=!!J,Oe=!!v.aoMap,Ye=!!v.lightMap,V=!!v.bumpMap,ee=!!v.normalMap,Pe=!!v.displacementMap,xe=!!v.emissiveMap,Be=!!v.metalnessMap,gt=!!v.roughnessMap,_t=v.anisotropy>0,P=v.clearcoat>0,M=v.dispersion>0,B=v.iridescence>0,$=v.sheen>0,ie=v.transmission>0,Q=_t&&!!v.anisotropyMap,He=P&&!!v.clearcoatMap,ge=P&&!!v.clearcoatNormalMap,Le=P&&!!v.clearcoatRoughnessMap,Ve=B&&!!v.iridescenceMap,he=B&&!!v.iridescenceThicknessMap,Ae=$&&!!v.sheenColorMap,je=$&&!!v.sheenRoughnessMap,Ge=!!v.specularMap,Ee=!!v.specularColorMap,Je=!!v.specularIntensityMap,N=ie&&!!v.transmissionMap,de=ie&&!!v.thicknessMap,ve=!!v.gradientMap,Ne=!!v.alphaMap,ue=v.alphaTest>0,te=!!v.alphaHash,Fe=!!v.extensions;let Ke=_i;v.toneMapped&&(K===null||K.isXRRenderTarget===!0)&&(Ke=n.toneMapping);const vt={shaderID:le,shaderType:v.type,shaderName:v.name,vertexShader:at,fragmentShader:ne,defines:v.defines,customVertexShaderID:Ie,customFragmentShaderID:Z,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:f,batching:fe,batchingColor:fe&&F._colorsTexture!==null,instancing:Me,instancingColor:Me&&F.instanceColor!==null,instancingMorph:Me&&F.morphTexture!==null,supportsVertexTextures:d,outputColorSpace:K===null?n.outputColorSpace:K.isXRRenderTarget===!0?K.texture.colorSpace:vr,alphaToCoverage:!!v.alphaToCoverage,map:Ue,matcap:ye,envMap:A,envMapMode:A&&J.mapping,envMapCubeUVHeight:W,aoMap:Oe,lightMap:Ye,bumpMap:V,normalMap:ee,displacementMap:d&&Pe,emissiveMap:xe,normalMapObjectSpace:ee&&v.normalMapType===gd,normalMapTangentSpace:ee&&v.normalMapType===Wu,metalnessMap:Be,roughnessMap:gt,anisotropy:_t,anisotropyMap:Q,clearcoat:P,clearcoatMap:He,clearcoatNormalMap:ge,clearcoatRoughnessMap:Le,dispersion:M,iridescence:B,iridescenceMap:Ve,iridescenceThicknessMap:he,sheen:$,sheenColorMap:Ae,sheenRoughnessMap:je,specularMap:Ge,specularColorMap:Ee,specularIntensityMap:Je,transmission:ie,transmissionMap:N,thicknessMap:de,gradientMap:ve,opaque:v.transparent===!1&&v.blending===fr&&v.alphaToCoverage===!1,alphaMap:Ne,alphaTest:ue,alphaHash:te,combine:v.combine,mapUv:Ue&&x(v.map.channel),aoMapUv:Oe&&x(v.aoMap.channel),lightMapUv:Ye&&x(v.lightMap.channel),bumpMapUv:V&&x(v.bumpMap.channel),normalMapUv:ee&&x(v.normalMap.channel),displacementMapUv:Pe&&x(v.displacementMap.channel),emissiveMapUv:xe&&x(v.emissiveMap.channel),metalnessMapUv:Be&&x(v.metalnessMap.channel),roughnessMapUv:gt&&x(v.roughnessMap.channel),anisotropyMapUv:Q&&x(v.anisotropyMap.channel),clearcoatMapUv:He&&x(v.clearcoatMap.channel),clearcoatNormalMapUv:ge&&x(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Le&&x(v.clearcoatRoughnessMap.channel),iridescenceMapUv:Ve&&x(v.iridescenceMap.channel),iridescenceThicknessMapUv:he&&x(v.iridescenceThicknessMap.channel),sheenColorMapUv:Ae&&x(v.sheenColorMap.channel),sheenRoughnessMapUv:je&&x(v.sheenRoughnessMap.channel),specularMapUv:Ge&&x(v.specularMap.channel),specularColorMapUv:Ee&&x(v.specularColorMap.channel),specularIntensityMapUv:Je&&x(v.specularIntensityMap.channel),transmissionMapUv:N&&x(v.transmissionMap.channel),thicknessMapUv:de&&x(v.thicknessMap.channel),alphaMapUv:Ne&&x(v.alphaMap.channel),vertexTangents:!!G.attributes.tangent&&(ee||_t),vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!G.attributes.color&&G.attributes.color.itemSize===4,pointsUvs:F.isPoints===!0&&!!G.attributes.uv&&(Ue||Ne),fog:!!Y,useFog:v.fog===!0,fogExp2:!!Y&&Y.isFogExp2,flatShading:v.flatShading===!0&&v.wireframe===!1,sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:h,reversedDepthBuffer:oe,skinning:F.isSkinnedMesh===!0,morphTargets:G.morphAttributes.position!==void 0,morphNormals:G.morphAttributes.normal!==void 0,morphColors:G.morphAttributes.color!==void 0,morphTargetsCount:we,morphTextureStride:qe,numDirLights:y.directional.length,numPointLights:y.point.length,numSpotLights:y.spot.length,numSpotLightMaps:y.spotLightMap.length,numRectAreaLights:y.rectArea.length,numHemiLights:y.hemi.length,numDirLightShadows:y.directionalShadowMap.length,numPointLightShadows:y.pointShadowMap.length,numSpotLightShadows:y.spotShadowMap.length,numSpotLightShadowsWithMaps:y.numSpotLightShadowsWithMaps,numLightProbes:y.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:v.dithering,shadowMapEnabled:n.shadowMap.enabled&&R.length>0,shadowMapType:n.shadowMap.type,toneMapping:Ke,decodeVideoTexture:Ue&&v.map.isVideoTexture===!0&&xt.getTransfer(v.map.colorSpace)===Et,decodeVideoTextureEmissive:xe&&v.emissiveMap.isVideoTexture===!0&&xt.getTransfer(v.emissiveMap.colorSpace)===Et,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===Ft,flipSided:v.side===on,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionClipCullDistance:Fe&&v.extensions.clipCullDistance===!0&&i.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Fe&&v.extensions.multiDraw===!0||fe)&&i.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:i.has("KHR_parallel_shader_compile"),customProgramCacheKey:v.customProgramCacheKey()};return vt.vertexUv1s=a.has(1),vt.vertexUv2s=a.has(2),vt.vertexUv3s=a.has(3),a.clear(),vt}function p(v){const y=[];if(v.shaderID?y.push(v.shaderID):(y.push(v.customVertexShaderID),y.push(v.customFragmentShaderID)),v.defines!==void 0)for(const R in v.defines)y.push(R),y.push(v.defines[R]);return v.isRawShaderMaterial===!1&&(b(y,v),S(y,v),y.push(n.outputColorSpace)),y.push(v.customProgramCacheKey),y.join()}function b(v,y){v.push(y.precision),v.push(y.outputColorSpace),v.push(y.envMapMode),v.push(y.envMapCubeUVHeight),v.push(y.mapUv),v.push(y.alphaMapUv),v.push(y.lightMapUv),v.push(y.aoMapUv),v.push(y.bumpMapUv),v.push(y.normalMapUv),v.push(y.displacementMapUv),v.push(y.emissiveMapUv),v.push(y.metalnessMapUv),v.push(y.roughnessMapUv),v.push(y.anisotropyMapUv),v.push(y.clearcoatMapUv),v.push(y.clearcoatNormalMapUv),v.push(y.clearcoatRoughnessMapUv),v.push(y.iridescenceMapUv),v.push(y.iridescenceThicknessMapUv),v.push(y.sheenColorMapUv),v.push(y.sheenRoughnessMapUv),v.push(y.specularMapUv),v.push(y.specularColorMapUv),v.push(y.specularIntensityMapUv),v.push(y.transmissionMapUv),v.push(y.thicknessMapUv),v.push(y.combine),v.push(y.fogExp2),v.push(y.sizeAttenuation),v.push(y.morphTargetsCount),v.push(y.morphAttributeCount),v.push(y.numDirLights),v.push(y.numPointLights),v.push(y.numSpotLights),v.push(y.numSpotLightMaps),v.push(y.numHemiLights),v.push(y.numRectAreaLights),v.push(y.numDirLightShadows),v.push(y.numPointLightShadows),v.push(y.numSpotLightShadows),v.push(y.numSpotLightShadowsWithMaps),v.push(y.numLightProbes),v.push(y.shadowMapType),v.push(y.toneMapping),v.push(y.numClippingPlanes),v.push(y.numClipIntersection),v.push(y.depthPacking)}function S(v,y){c.disableAll(),y.supportsVertexTextures&&c.enable(0),y.instancing&&c.enable(1),y.instancingColor&&c.enable(2),y.instancingMorph&&c.enable(3),y.matcap&&c.enable(4),y.envMap&&c.enable(5),y.normalMapObjectSpace&&c.enable(6),y.normalMapTangentSpace&&c.enable(7),y.clearcoat&&c.enable(8),y.iridescence&&c.enable(9),y.alphaTest&&c.enable(10),y.vertexColors&&c.enable(11),y.vertexAlphas&&c.enable(12),y.vertexUv1s&&c.enable(13),y.vertexUv2s&&c.enable(14),y.vertexUv3s&&c.enable(15),y.vertexTangents&&c.enable(16),y.anisotropy&&c.enable(17),y.alphaHash&&c.enable(18),y.batching&&c.enable(19),y.dispersion&&c.enable(20),y.batchingColor&&c.enable(21),y.gradientMap&&c.enable(22),v.push(c.mask),c.disableAll(),y.fog&&c.enable(0),y.useFog&&c.enable(1),y.flatShading&&c.enable(2),y.logarithmicDepthBuffer&&c.enable(3),y.reversedDepthBuffer&&c.enable(4),y.skinning&&c.enable(5),y.morphTargets&&c.enable(6),y.morphNormals&&c.enable(7),y.morphColors&&c.enable(8),y.premultipliedAlpha&&c.enable(9),y.shadowMapEnabled&&c.enable(10),y.doubleSided&&c.enable(11),y.flipSided&&c.enable(12),y.useDepthPacking&&c.enable(13),y.dithering&&c.enable(14),y.transmission&&c.enable(15),y.sheen&&c.enable(16),y.opaque&&c.enable(17),y.pointsUvs&&c.enable(18),y.decodeVideoTexture&&c.enable(19),y.decodeVideoTextureEmissive&&c.enable(20),y.alphaToCoverage&&c.enable(21),v.push(c.mask)}function _(v){const y=g[v.type];let R;if(y){const U=In[y];R=Yd.clone(U.uniforms)}else R=v.uniforms;return R}function w(v,y){let R;for(let U=0,F=u.length;U<F;U++){const Y=u[U];if(Y.cacheKey===y){R=Y,++R.usedTimes;break}}return R===void 0&&(R=new Qg(n,y,v,s),u.push(R)),R}function E(v){if(--v.usedTimes===0){const y=u.indexOf(v);u[y]=u[u.length-1],u.pop(),v.destroy()}}function C(v){l.remove(v)}function L(){l.dispose()}return{getParameters:m,getProgramCacheKey:p,getUniforms:_,acquireProgram:w,releaseProgram:E,releaseShaderCache:C,programs:u,dispose:L}}function r_(){let n=new WeakMap;function e(o){return n.has(o)}function t(o){let c=n.get(o);return c===void 0&&(c={},n.set(o,c)),c}function i(o){n.delete(o)}function r(o,c,l){n.get(o)[c]=l}function s(){n=new WeakMap}return{has:e,get:t,remove:i,update:r,dispose:s}}function s_(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.material.id!==e.material.id?n.material.id-e.material.id:n.z!==e.z?n.z-e.z:n.id-e.id}function uu(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.z!==e.z?e.z-n.z:n.id-e.id}function hu(){const n=[];let e=0;const t=[],i=[],r=[];function s(){e=0,t.length=0,i.length=0,r.length=0}function o(h,d,f,g,x,m){let p=n[e];return p===void 0?(p={id:h.id,object:h,geometry:d,material:f,groupOrder:g,renderOrder:h.renderOrder,z:x,group:m},n[e]=p):(p.id=h.id,p.object=h,p.geometry=d,p.material=f,p.groupOrder=g,p.renderOrder=h.renderOrder,p.z=x,p.group=m),e++,p}function c(h,d,f,g,x,m){const p=o(h,d,f,g,x,m);f.transmission>0?i.push(p):f.transparent===!0?r.push(p):t.push(p)}function l(h,d,f,g,x,m){const p=o(h,d,f,g,x,m);f.transmission>0?i.unshift(p):f.transparent===!0?r.unshift(p):t.unshift(p)}function a(h,d){t.length>1&&t.sort(h||s_),i.length>1&&i.sort(d||uu),r.length>1&&r.sort(d||uu)}function u(){for(let h=e,d=n.length;h<d;h++){const f=n[h];if(f.id===null)break;f.id=null,f.object=null,f.geometry=null,f.material=null,f.group=null}}return{opaque:t,transmissive:i,transparent:r,init:s,push:c,unshift:l,finish:u,sort:a}}function o_(){let n=new WeakMap;function e(i,r){const s=n.get(i);let o;return s===void 0?(o=new hu,n.set(i,[o])):r>=s.length?(o=new hu,s.push(o)):o=s[r],o}function t(){n=new WeakMap}return{get:e,dispose:t}}function a_(){const n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new I,color:new ct};break;case"SpotLight":t={position:new I,direction:new I,color:new ct,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new I,color:new ct,distance:0,decay:0};break;case"HemisphereLight":t={direction:new I,skyColor:new ct,groundColor:new ct};break;case"RectAreaLight":t={color:new ct,position:new I,halfWidth:new I,halfHeight:new I};break}return n[e.id]=t,t}}}function c_(){const n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ce};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ce};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ce,shadowCameraNear:1,shadowCameraFar:1e3};break}return n[e.id]=t,t}}}let l_=0;function u_(n,e){return(e.castShadow?2:0)-(n.castShadow?2:0)+(e.map?1:0)-(n.map?1:0)}function h_(n){const e=new a_,t=c_(),i={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let a=0;a<9;a++)i.probe.push(new I);const r=new I,s=new mt,o=new mt;function c(a){let u=0,h=0,d=0;for(let v=0;v<9;v++)i.probe[v].set(0,0,0);let f=0,g=0,x=0,m=0,p=0,b=0,S=0,_=0,w=0,E=0,C=0;a.sort(u_);for(let v=0,y=a.length;v<y;v++){const R=a[v],U=R.color,F=R.intensity,Y=R.distance,G=R.shadow&&R.shadow.map?R.shadow.map.texture:null;if(R.isAmbientLight)u+=U.r*F,h+=U.g*F,d+=U.b*F;else if(R.isLightProbe){for(let H=0;H<9;H++)i.probe[H].addScaledVector(R.sh.coefficients[H],F);C++}else if(R.isDirectionalLight){const H=e.get(R);if(H.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){const J=R.shadow,W=t.get(R);W.shadowIntensity=J.intensity,W.shadowBias=J.bias,W.shadowNormalBias=J.normalBias,W.shadowRadius=J.radius,W.shadowMapSize=J.mapSize,i.directionalShadow[f]=W,i.directionalShadowMap[f]=G,i.directionalShadowMatrix[f]=R.shadow.matrix,b++}i.directional[f]=H,f++}else if(R.isSpotLight){const H=e.get(R);H.position.setFromMatrixPosition(R.matrixWorld),H.color.copy(U).multiplyScalar(F),H.distance=Y,H.coneCos=Math.cos(R.angle),H.penumbraCos=Math.cos(R.angle*(1-R.penumbra)),H.decay=R.decay,i.spot[x]=H;const J=R.shadow;if(R.map&&(i.spotLightMap[w]=R.map,w++,J.updateMatrices(R),R.castShadow&&E++),i.spotLightMatrix[x]=J.matrix,R.castShadow){const W=t.get(R);W.shadowIntensity=J.intensity,W.shadowBias=J.bias,W.shadowNormalBias=J.normalBias,W.shadowRadius=J.radius,W.shadowMapSize=J.mapSize,i.spotShadow[x]=W,i.spotShadowMap[x]=G,_++}x++}else if(R.isRectAreaLight){const H=e.get(R);H.color.copy(U).multiplyScalar(F),H.halfWidth.set(R.width*.5,0,0),H.halfHeight.set(0,R.height*.5,0),i.rectArea[m]=H,m++}else if(R.isPointLight){const H=e.get(R);if(H.color.copy(R.color).multiplyScalar(R.intensity),H.distance=R.distance,H.decay=R.decay,R.castShadow){const J=R.shadow,W=t.get(R);W.shadowIntensity=J.intensity,W.shadowBias=J.bias,W.shadowNormalBias=J.normalBias,W.shadowRadius=J.radius,W.shadowMapSize=J.mapSize,W.shadowCameraNear=J.camera.near,W.shadowCameraFar=J.camera.far,i.pointShadow[g]=W,i.pointShadowMap[g]=G,i.pointShadowMatrix[g]=R.shadow.matrix,S++}i.point[g]=H,g++}else if(R.isHemisphereLight){const H=e.get(R);H.skyColor.copy(R.color).multiplyScalar(F),H.groundColor.copy(R.groundColor).multiplyScalar(F),i.hemi[p]=H,p++}}m>0&&(n.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=Te.LTC_FLOAT_1,i.rectAreaLTC2=Te.LTC_FLOAT_2):(i.rectAreaLTC1=Te.LTC_HALF_1,i.rectAreaLTC2=Te.LTC_HALF_2)),i.ambient[0]=u,i.ambient[1]=h,i.ambient[2]=d;const L=i.hash;(L.directionalLength!==f||L.pointLength!==g||L.spotLength!==x||L.rectAreaLength!==m||L.hemiLength!==p||L.numDirectionalShadows!==b||L.numPointShadows!==S||L.numSpotShadows!==_||L.numSpotMaps!==w||L.numLightProbes!==C)&&(i.directional.length=f,i.spot.length=x,i.rectArea.length=m,i.point.length=g,i.hemi.length=p,i.directionalShadow.length=b,i.directionalShadowMap.length=b,i.pointShadow.length=S,i.pointShadowMap.length=S,i.spotShadow.length=_,i.spotShadowMap.length=_,i.directionalShadowMatrix.length=b,i.pointShadowMatrix.length=S,i.spotLightMatrix.length=_+w-E,i.spotLightMap.length=w,i.numSpotLightShadowsWithMaps=E,i.numLightProbes=C,L.directionalLength=f,L.pointLength=g,L.spotLength=x,L.rectAreaLength=m,L.hemiLength=p,L.numDirectionalShadows=b,L.numPointShadows=S,L.numSpotShadows=_,L.numSpotMaps=w,L.numLightProbes=C,i.version=l_++)}function l(a,u){let h=0,d=0,f=0,g=0,x=0;const m=u.matrixWorldInverse;for(let p=0,b=a.length;p<b;p++){const S=a[p];if(S.isDirectionalLight){const _=i.directional[h];_.direction.setFromMatrixPosition(S.matrixWorld),r.setFromMatrixPosition(S.target.matrixWorld),_.direction.sub(r),_.direction.transformDirection(m),h++}else if(S.isSpotLight){const _=i.spot[f];_.position.setFromMatrixPosition(S.matrixWorld),_.position.applyMatrix4(m),_.direction.setFromMatrixPosition(S.matrixWorld),r.setFromMatrixPosition(S.target.matrixWorld),_.direction.sub(r),_.direction.transformDirection(m),f++}else if(S.isRectAreaLight){const _=i.rectArea[g];_.position.setFromMatrixPosition(S.matrixWorld),_.position.applyMatrix4(m),o.identity(),s.copy(S.matrixWorld),s.premultiply(m),o.extractRotation(s),_.halfWidth.set(S.width*.5,0,0),_.halfHeight.set(0,S.height*.5,0),_.halfWidth.applyMatrix4(o),_.halfHeight.applyMatrix4(o),g++}else if(S.isPointLight){const _=i.point[d];_.position.setFromMatrixPosition(S.matrixWorld),_.position.applyMatrix4(m),d++}else if(S.isHemisphereLight){const _=i.hemi[x];_.direction.setFromMatrixPosition(S.matrixWorld),_.direction.transformDirection(m),x++}}}return{setup:c,setupView:l,state:i}}function du(n){const e=new h_(n),t=[],i=[];function r(u){a.camera=u,t.length=0,i.length=0}function s(u){t.push(u)}function o(u){i.push(u)}function c(){e.setup(t)}function l(u){e.setupView(t,u)}const a={lightsArray:t,shadowsArray:i,camera:null,lights:e,transmissionRenderTarget:{}};return{init:r,state:a,setupLights:c,setupLightsView:l,pushLight:s,pushShadow:o}}function d_(n){let e=new WeakMap;function t(r,s=0){const o=e.get(r);let c;return o===void 0?(c=new du(n),e.set(r,[c])):s>=o.length?(c=new du(n),o.push(c)):c=o[s],c}function i(){e=new WeakMap}return{get:t,dispose:i}}const f_=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,p_=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function m_(n,e,t){let i=new Nc;const r=new Ce,s=new Ce,o=new Tt,c=new ro({depthPacking:no}),l=new Of,a={},u=t.maxTextureSize,h={[xi]:on,[on]:xi,[Ft]:Ft},d=new ii({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ce},radius:{value:4}},vertexShader:f_,fragmentShader:p_}),f=d.clone();f.defines.HORIZONTAL_PASS=1;const g=new qt;g.setAttribute("position",new vn(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const x=new pt(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Du;let p=this.type;this.render=function(E,C,L){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||E.length===0)return;const v=n.getRenderTarget(),y=n.getActiveCubeFace(),R=n.getActiveMipmapLevel(),U=n.state;U.setBlending(gi),U.buffers.depth.getReversed()===!0?U.buffers.color.setClear(0,0,0,0):U.buffers.color.setClear(1,1,1,1),U.buffers.depth.setTest(!0),U.setScissorTest(!1);const F=p!==Zn&&this.type===Zn,Y=p===Zn&&this.type!==Zn;for(let G=0,H=E.length;G<H;G++){const J=E[G],W=J.shadow;if(W===void 0){console.warn("THREE.WebGLShadowMap:",J,"has no shadow.");continue}if(W.autoUpdate===!1&&W.needsUpdate===!1)continue;r.copy(W.mapSize);const le=W.getFrameExtents();if(r.multiply(le),s.copy(W.mapSize),(r.x>u||r.y>u)&&(r.x>u&&(s.x=Math.floor(u/le.x),r.x=s.x*le.x,W.mapSize.x=s.x),r.y>u&&(s.y=Math.floor(u/le.y),r.y=s.y*le.y,W.mapSize.y=s.y)),W.map===null||F===!0||Y===!0){const we=this.type!==Zn?{minFilter:xn,magFilter:xn}:{};W.map!==null&&W.map.dispose(),W.map=new Ni(r.x,r.y,we),W.map.texture.name=J.name+".shadowMap",W.camera.updateProjectionMatrix()}n.setRenderTarget(W.map),n.clear();const _e=W.getViewportCount();for(let we=0;we<_e;we++){const qe=W.getViewport(we);o.set(s.x*qe.x,s.y*qe.y,s.x*qe.z,s.y*qe.w),U.viewport(o),W.updateMatrices(J,we),i=W.getFrustum(),_(C,L,W.camera,J,this.type)}W.isPointLightShadow!==!0&&this.type===Zn&&b(W,L),W.needsUpdate=!1}p=this.type,m.needsUpdate=!1,n.setRenderTarget(v,y,R)};function b(E,C){const L=e.update(x);d.defines.VSM_SAMPLES!==E.blurSamples&&(d.defines.VSM_SAMPLES=E.blurSamples,f.defines.VSM_SAMPLES=E.blurSamples,d.needsUpdate=!0,f.needsUpdate=!0),E.mapPass===null&&(E.mapPass=new Ni(r.x,r.y)),d.uniforms.shadow_pass.value=E.map.texture,d.uniforms.resolution.value=E.mapSize,d.uniforms.radius.value=E.radius,n.setRenderTarget(E.mapPass),n.clear(),n.renderBufferDirect(C,null,L,d,x,null),f.uniforms.shadow_pass.value=E.mapPass.texture,f.uniforms.resolution.value=E.mapSize,f.uniforms.radius.value=E.radius,n.setRenderTarget(E.map),n.clear(),n.renderBufferDirect(C,null,L,f,x,null)}function S(E,C,L,v){let y=null;const R=L.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(R!==void 0)y=R;else if(y=L.isPointLight===!0?l:c,n.localClippingEnabled&&C.clipShadows===!0&&Array.isArray(C.clippingPlanes)&&C.clippingPlanes.length!==0||C.displacementMap&&C.displacementScale!==0||C.alphaMap&&C.alphaTest>0||C.map&&C.alphaTest>0||C.alphaToCoverage===!0){const U=y.uuid,F=C.uuid;let Y=a[U];Y===void 0&&(Y={},a[U]=Y);let G=Y[F];G===void 0&&(G=y.clone(),Y[F]=G,C.addEventListener("dispose",w)),y=G}if(y.visible=C.visible,y.wireframe=C.wireframe,v===Zn?y.side=C.shadowSide!==null?C.shadowSide:C.side:y.side=C.shadowSide!==null?C.shadowSide:h[C.side],y.alphaMap=C.alphaMap,y.alphaTest=C.alphaToCoverage===!0?.5:C.alphaTest,y.map=C.map,y.clipShadows=C.clipShadows,y.clippingPlanes=C.clippingPlanes,y.clipIntersection=C.clipIntersection,y.displacementMap=C.displacementMap,y.displacementScale=C.displacementScale,y.displacementBias=C.displacementBias,y.wireframeLinewidth=C.wireframeLinewidth,y.linewidth=C.linewidth,L.isPointLight===!0&&y.isMeshDistanceMaterial===!0){const U=n.properties.get(y);U.light=L}return y}function _(E,C,L,v,y){if(E.visible===!1)return;if(E.layers.test(C.layers)&&(E.isMesh||E.isLine||E.isPoints)&&(E.castShadow||E.receiveShadow&&y===Zn)&&(!E.frustumCulled||i.intersectsObject(E))){E.modelViewMatrix.multiplyMatrices(L.matrixWorldInverse,E.matrixWorld);const F=e.update(E),Y=E.material;if(Array.isArray(Y)){const G=F.groups;for(let H=0,J=G.length;H<J;H++){const W=G[H],le=Y[W.materialIndex];if(le&&le.visible){const _e=S(E,le,v,y);E.onBeforeShadow(n,E,C,L,F,_e,W),n.renderBufferDirect(L,null,F,_e,E,W),E.onAfterShadow(n,E,C,L,F,_e,W)}}}else if(Y.visible){const G=S(E,Y,v,y);E.onBeforeShadow(n,E,C,L,F,G,null),n.renderBufferDirect(L,null,F,G,E,null),E.onAfterShadow(n,E,C,L,F,G,null)}}const U=E.children;for(let F=0,Y=U.length;F<Y;F++)_(U[F],C,L,v,y)}function w(E){E.target.removeEventListener("dispose",w);for(const L in a){const v=a[L],y=E.target.uuid;y in v&&(v[y].dispose(),delete v[y])}}}const g_={[Sa]:Ea,[ba]:Aa,[Ta]:Ra,[gr]:wa,[Ea]:Sa,[Aa]:ba,[Ra]:Ta,[wa]:gr};function __(n,e){function t(){let N=!1;const de=new Tt;let ve=null;const Ne=new Tt(0,0,0,0);return{setMask:function(ue){ve!==ue&&!N&&(n.colorMask(ue,ue,ue,ue),ve=ue)},setLocked:function(ue){N=ue},setClear:function(ue,te,Fe,Ke,vt){vt===!0&&(ue*=Ke,te*=Ke,Fe*=Ke),de.set(ue,te,Fe,Ke),Ne.equals(de)===!1&&(n.clearColor(ue,te,Fe,Ke),Ne.copy(de))},reset:function(){N=!1,ve=null,Ne.set(-1,0,0,0)}}}function i(){let N=!1,de=!1,ve=null,Ne=null,ue=null;return{setReversed:function(te){if(de!==te){const Fe=e.get("EXT_clip_control");te?Fe.clipControlEXT(Fe.LOWER_LEFT_EXT,Fe.ZERO_TO_ONE_EXT):Fe.clipControlEXT(Fe.LOWER_LEFT_EXT,Fe.NEGATIVE_ONE_TO_ONE_EXT),de=te;const Ke=ue;ue=null,this.setClear(Ke)}},getReversed:function(){return de},setTest:function(te){te?K(n.DEPTH_TEST):oe(n.DEPTH_TEST)},setMask:function(te){ve!==te&&!N&&(n.depthMask(te),ve=te)},setFunc:function(te){if(de&&(te=g_[te]),Ne!==te){switch(te){case Sa:n.depthFunc(n.NEVER);break;case Ea:n.depthFunc(n.ALWAYS);break;case ba:n.depthFunc(n.LESS);break;case gr:n.depthFunc(n.LEQUAL);break;case Ta:n.depthFunc(n.EQUAL);break;case wa:n.depthFunc(n.GEQUAL);break;case Aa:n.depthFunc(n.GREATER);break;case Ra:n.depthFunc(n.NOTEQUAL);break;default:n.depthFunc(n.LEQUAL)}Ne=te}},setLocked:function(te){N=te},setClear:function(te){ue!==te&&(de&&(te=1-te),n.clearDepth(te),ue=te)},reset:function(){N=!1,ve=null,Ne=null,ue=null,de=!1}}}function r(){let N=!1,de=null,ve=null,Ne=null,ue=null,te=null,Fe=null,Ke=null,vt=null;return{setTest:function(ht){N||(ht?K(n.STENCIL_TEST):oe(n.STENCIL_TEST))},setMask:function(ht){de!==ht&&!N&&(n.stencilMask(ht),de=ht)},setFunc:function(ht,yn,jt){(ve!==ht||Ne!==yn||ue!==jt)&&(n.stencilFunc(ht,yn,jt),ve=ht,Ne=yn,ue=jt)},setOp:function(ht,yn,jt){(te!==ht||Fe!==yn||Ke!==jt)&&(n.stencilOp(ht,yn,jt),te=ht,Fe=yn,Ke=jt)},setLocked:function(ht){N=ht},setClear:function(ht){vt!==ht&&(n.clearStencil(ht),vt=ht)},reset:function(){N=!1,de=null,ve=null,Ne=null,ue=null,te=null,Fe=null,Ke=null,vt=null}}}const s=new t,o=new i,c=new r,l=new WeakMap,a=new WeakMap;let u={},h={},d=new WeakMap,f=[],g=null,x=!1,m=null,p=null,b=null,S=null,_=null,w=null,E=null,C=new ct(0,0,0),L=0,v=!1,y=null,R=null,U=null,F=null,Y=null;const G=n.getParameter(n.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let H=!1,J=0;const W=n.getParameter(n.VERSION);W.indexOf("WebGL")!==-1?(J=parseFloat(/^WebGL (\d)/.exec(W)[1]),H=J>=1):W.indexOf("OpenGL ES")!==-1&&(J=parseFloat(/^OpenGL ES (\d)/.exec(W)[1]),H=J>=2);let le=null,_e={};const we=n.getParameter(n.SCISSOR_BOX),qe=n.getParameter(n.VIEWPORT),at=new Tt().fromArray(we),ne=new Tt().fromArray(qe);function Ie(N,de,ve,Ne){const ue=new Uint8Array(4),te=n.createTexture();n.bindTexture(N,te),n.texParameteri(N,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(N,n.TEXTURE_MAG_FILTER,n.NEAREST);for(let Fe=0;Fe<ve;Fe++)N===n.TEXTURE_3D||N===n.TEXTURE_2D_ARRAY?n.texImage3D(de,0,n.RGBA,1,1,Ne,0,n.RGBA,n.UNSIGNED_BYTE,ue):n.texImage2D(de+Fe,0,n.RGBA,1,1,0,n.RGBA,n.UNSIGNED_BYTE,ue);return te}const Z={};Z[n.TEXTURE_2D]=Ie(n.TEXTURE_2D,n.TEXTURE_2D,1),Z[n.TEXTURE_CUBE_MAP]=Ie(n.TEXTURE_CUBE_MAP,n.TEXTURE_CUBE_MAP_POSITIVE_X,6),Z[n.TEXTURE_2D_ARRAY]=Ie(n.TEXTURE_2D_ARRAY,n.TEXTURE_2D_ARRAY,1,1),Z[n.TEXTURE_3D]=Ie(n.TEXTURE_3D,n.TEXTURE_3D,1,1),s.setClear(0,0,0,1),o.setClear(1),c.setClear(0),K(n.DEPTH_TEST),o.setFunc(gr),V(!1),ee(nl),K(n.CULL_FACE),Oe(gi);function K(N){u[N]!==!0&&(n.enable(N),u[N]=!0)}function oe(N){u[N]!==!1&&(n.disable(N),u[N]=!1)}function Me(N,de){return h[N]!==de?(n.bindFramebuffer(N,de),h[N]=de,N===n.DRAW_FRAMEBUFFER&&(h[n.FRAMEBUFFER]=de),N===n.FRAMEBUFFER&&(h[n.DRAW_FRAMEBUFFER]=de),!0):!1}function fe(N,de){let ve=f,Ne=!1;if(N){ve=d.get(de),ve===void 0&&(ve=[],d.set(de,ve));const ue=N.textures;if(ve.length!==ue.length||ve[0]!==n.COLOR_ATTACHMENT0){for(let te=0,Fe=ue.length;te<Fe;te++)ve[te]=n.COLOR_ATTACHMENT0+te;ve.length=ue.length,Ne=!0}}else ve[0]!==n.BACK&&(ve[0]=n.BACK,Ne=!0);Ne&&n.drawBuffers(ve)}function Ue(N){return g!==N?(n.useProgram(N),g=N,!0):!1}const ye={[Pi]:n.FUNC_ADD,[Gh]:n.FUNC_SUBTRACT,[Wh]:n.FUNC_REVERSE_SUBTRACT};ye[Xh]=n.MIN,ye[qh]=n.MAX;const A={[Yh]:n.ZERO,[Zh]:n.ONE,[jh]:n.SRC_COLOR,[ya]:n.SRC_ALPHA,[td]:n.SRC_ALPHA_SATURATE,[Qh]:n.DST_COLOR,[Jh]:n.DST_ALPHA,[$h]:n.ONE_MINUS_SRC_COLOR,[Ma]:n.ONE_MINUS_SRC_ALPHA,[ed]:n.ONE_MINUS_DST_COLOR,[Kh]:n.ONE_MINUS_DST_ALPHA,[nd]:n.CONSTANT_COLOR,[id]:n.ONE_MINUS_CONSTANT_COLOR,[rd]:n.CONSTANT_ALPHA,[sd]:n.ONE_MINUS_CONSTANT_ALPHA};function Oe(N,de,ve,Ne,ue,te,Fe,Ke,vt,ht){if(N===gi){x===!0&&(oe(n.BLEND),x=!1);return}if(x===!1&&(K(n.BLEND),x=!0),N!==Vh){if(N!==m||ht!==v){if((p!==Pi||_!==Pi)&&(n.blendEquation(n.FUNC_ADD),p=Pi,_=Pi),ht)switch(N){case fr:n.blendFuncSeparate(n.ONE,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case co:n.blendFunc(n.ONE,n.ONE);break;case il:n.blendFuncSeparate(n.ZERO,n.ONE_MINUS_SRC_COLOR,n.ZERO,n.ONE);break;case rl:n.blendFuncSeparate(n.DST_COLOR,n.ONE_MINUS_SRC_ALPHA,n.ZERO,n.ONE);break;default:console.error("THREE.WebGLState: Invalid blending: ",N);break}else switch(N){case fr:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case co:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE,n.ONE,n.ONE);break;case il:console.error("THREE.WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case rl:console.error("THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:console.error("THREE.WebGLState: Invalid blending: ",N);break}b=null,S=null,w=null,E=null,C.set(0,0,0),L=0,m=N,v=ht}return}ue=ue||de,te=te||ve,Fe=Fe||Ne,(de!==p||ue!==_)&&(n.blendEquationSeparate(ye[de],ye[ue]),p=de,_=ue),(ve!==b||Ne!==S||te!==w||Fe!==E)&&(n.blendFuncSeparate(A[ve],A[Ne],A[te],A[Fe]),b=ve,S=Ne,w=te,E=Fe),(Ke.equals(C)===!1||vt!==L)&&(n.blendColor(Ke.r,Ke.g,Ke.b,vt),C.copy(Ke),L=vt),m=N,v=!1}function Ye(N,de){N.side===Ft?oe(n.CULL_FACE):K(n.CULL_FACE);let ve=N.side===on;de&&(ve=!ve),V(ve),N.blending===fr&&N.transparent===!1?Oe(gi):Oe(N.blending,N.blendEquation,N.blendSrc,N.blendDst,N.blendEquationAlpha,N.blendSrcAlpha,N.blendDstAlpha,N.blendColor,N.blendAlpha,N.premultipliedAlpha),o.setFunc(N.depthFunc),o.setTest(N.depthTest),o.setMask(N.depthWrite),s.setMask(N.colorWrite);const Ne=N.stencilWrite;c.setTest(Ne),Ne&&(c.setMask(N.stencilWriteMask),c.setFunc(N.stencilFunc,N.stencilRef,N.stencilFuncMask),c.setOp(N.stencilFail,N.stencilZFail,N.stencilZPass)),xe(N.polygonOffset,N.polygonOffsetFactor,N.polygonOffsetUnits),N.alphaToCoverage===!0?K(n.SAMPLE_ALPHA_TO_COVERAGE):oe(n.SAMPLE_ALPHA_TO_COVERAGE)}function V(N){y!==N&&(N?n.frontFace(n.CW):n.frontFace(n.CCW),y=N)}function ee(N){N!==kh?(K(n.CULL_FACE),N!==R&&(N===nl?n.cullFace(n.BACK):N===Hh?n.cullFace(n.FRONT):n.cullFace(n.FRONT_AND_BACK))):oe(n.CULL_FACE),R=N}function Pe(N){N!==U&&(H&&n.lineWidth(N),U=N)}function xe(N,de,ve){N?(K(n.POLYGON_OFFSET_FILL),(F!==de||Y!==ve)&&(n.polygonOffset(de,ve),F=de,Y=ve)):oe(n.POLYGON_OFFSET_FILL)}function Be(N){N?K(n.SCISSOR_TEST):oe(n.SCISSOR_TEST)}function gt(N){N===void 0&&(N=n.TEXTURE0+G-1),le!==N&&(n.activeTexture(N),le=N)}function _t(N,de,ve){ve===void 0&&(le===null?ve=n.TEXTURE0+G-1:ve=le);let Ne=_e[ve];Ne===void 0&&(Ne={type:void 0,texture:void 0},_e[ve]=Ne),(Ne.type!==N||Ne.texture!==de)&&(le!==ve&&(n.activeTexture(ve),le=ve),n.bindTexture(N,de||Z[N]),Ne.type=N,Ne.texture=de)}function P(){const N=_e[le];N!==void 0&&N.type!==void 0&&(n.bindTexture(N.type,null),N.type=void 0,N.texture=void 0)}function M(){try{n.compressedTexImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function B(){try{n.compressedTexImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function $(){try{n.texSubImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function ie(){try{n.texSubImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Q(){try{n.compressedTexSubImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function He(){try{n.compressedTexSubImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function ge(){try{n.texStorage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Le(){try{n.texStorage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Ve(){try{n.texImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function he(){try{n.texImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Ae(N){at.equals(N)===!1&&(n.scissor(N.x,N.y,N.z,N.w),at.copy(N))}function je(N){ne.equals(N)===!1&&(n.viewport(N.x,N.y,N.z,N.w),ne.copy(N))}function Ge(N,de){let ve=a.get(de);ve===void 0&&(ve=new WeakMap,a.set(de,ve));let Ne=ve.get(N);Ne===void 0&&(Ne=n.getUniformBlockIndex(de,N.name),ve.set(N,Ne))}function Ee(N,de){const Ne=a.get(de).get(N);l.get(de)!==Ne&&(n.uniformBlockBinding(de,Ne,N.__bindingPointIndex),l.set(de,Ne))}function Je(){n.disable(n.BLEND),n.disable(n.CULL_FACE),n.disable(n.DEPTH_TEST),n.disable(n.POLYGON_OFFSET_FILL),n.disable(n.SCISSOR_TEST),n.disable(n.STENCIL_TEST),n.disable(n.SAMPLE_ALPHA_TO_COVERAGE),n.blendEquation(n.FUNC_ADD),n.blendFunc(n.ONE,n.ZERO),n.blendFuncSeparate(n.ONE,n.ZERO,n.ONE,n.ZERO),n.blendColor(0,0,0,0),n.colorMask(!0,!0,!0,!0),n.clearColor(0,0,0,0),n.depthMask(!0),n.depthFunc(n.LESS),o.setReversed(!1),n.clearDepth(1),n.stencilMask(4294967295),n.stencilFunc(n.ALWAYS,0,4294967295),n.stencilOp(n.KEEP,n.KEEP,n.KEEP),n.clearStencil(0),n.cullFace(n.BACK),n.frontFace(n.CCW),n.polygonOffset(0,0),n.activeTexture(n.TEXTURE0),n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),n.bindFramebuffer(n.READ_FRAMEBUFFER,null),n.useProgram(null),n.lineWidth(1),n.scissor(0,0,n.canvas.width,n.canvas.height),n.viewport(0,0,n.canvas.width,n.canvas.height),u={},le=null,_e={},h={},d=new WeakMap,f=[],g=null,x=!1,m=null,p=null,b=null,S=null,_=null,w=null,E=null,C=new ct(0,0,0),L=0,v=!1,y=null,R=null,U=null,F=null,Y=null,at.set(0,0,n.canvas.width,n.canvas.height),ne.set(0,0,n.canvas.width,n.canvas.height),s.reset(),o.reset(),c.reset()}return{buffers:{color:s,depth:o,stencil:c},enable:K,disable:oe,bindFramebuffer:Me,drawBuffers:fe,useProgram:Ue,setBlending:Oe,setMaterial:Ye,setFlipSided:V,setCullFace:ee,setLineWidth:Pe,setPolygonOffset:xe,setScissorTest:Be,activeTexture:gt,bindTexture:_t,unbindTexture:P,compressedTexImage2D:M,compressedTexImage3D:B,texImage2D:Ve,texImage3D:he,updateUBOMapping:Ge,uniformBlockBinding:Ee,texStorage2D:ge,texStorage3D:Le,texSubImage2D:$,texSubImage3D:ie,compressedTexSubImage2D:Q,compressedTexSubImage3D:He,scissor:Ae,viewport:je,reset:Je}}function x_(n,e,t,i,r,s,o){const c=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),a=new Ce,u=new WeakMap;let h;const d=new WeakMap;let f=!1;try{f=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(P,M){return f?new OffscreenCanvas(P,M):ho("canvas")}function x(P,M,B){let $=1;const ie=_t(P);if((ie.width>B||ie.height>B)&&($=B/Math.max(ie.width,ie.height)),$<1)if(typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&P instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&P instanceof ImageBitmap||typeof VideoFrame<"u"&&P instanceof VideoFrame){const Q=Math.floor($*ie.width),He=Math.floor($*ie.height);h===void 0&&(h=g(Q,He));const ge=M?g(Q,He):h;return ge.width=Q,ge.height=He,ge.getContext("2d").drawImage(P,0,0,Q,He),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+ie.width+"x"+ie.height+") to ("+Q+"x"+He+")."),ge}else return"data"in P&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+ie.width+"x"+ie.height+")."),P;return P}function m(P){return P.generateMipmaps}function p(P){n.generateMipmap(P)}function b(P){return P.isWebGLCubeRenderTarget?n.TEXTURE_CUBE_MAP:P.isWebGL3DRenderTarget?n.TEXTURE_3D:P.isWebGLArrayRenderTarget||P.isCompressedArrayTexture?n.TEXTURE_2D_ARRAY:n.TEXTURE_2D}function S(P,M,B,$,ie=!1){if(P!==null){if(n[P]!==void 0)return n[P];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+P+"'")}let Q=M;if(M===n.RED&&(B===n.FLOAT&&(Q=n.R32F),B===n.HALF_FLOAT&&(Q=n.R16F),B===n.UNSIGNED_BYTE&&(Q=n.R8)),M===n.RED_INTEGER&&(B===n.UNSIGNED_BYTE&&(Q=n.R8UI),B===n.UNSIGNED_SHORT&&(Q=n.R16UI),B===n.UNSIGNED_INT&&(Q=n.R32UI),B===n.BYTE&&(Q=n.R8I),B===n.SHORT&&(Q=n.R16I),B===n.INT&&(Q=n.R32I)),M===n.RG&&(B===n.FLOAT&&(Q=n.RG32F),B===n.HALF_FLOAT&&(Q=n.RG16F),B===n.UNSIGNED_BYTE&&(Q=n.RG8)),M===n.RG_INTEGER&&(B===n.UNSIGNED_BYTE&&(Q=n.RG8UI),B===n.UNSIGNED_SHORT&&(Q=n.RG16UI),B===n.UNSIGNED_INT&&(Q=n.RG32UI),B===n.BYTE&&(Q=n.RG8I),B===n.SHORT&&(Q=n.RG16I),B===n.INT&&(Q=n.RG32I)),M===n.RGB_INTEGER&&(B===n.UNSIGNED_BYTE&&(Q=n.RGB8UI),B===n.UNSIGNED_SHORT&&(Q=n.RGB16UI),B===n.UNSIGNED_INT&&(Q=n.RGB32UI),B===n.BYTE&&(Q=n.RGB8I),B===n.SHORT&&(Q=n.RGB16I),B===n.INT&&(Q=n.RGB32I)),M===n.RGBA_INTEGER&&(B===n.UNSIGNED_BYTE&&(Q=n.RGBA8UI),B===n.UNSIGNED_SHORT&&(Q=n.RGBA16UI),B===n.UNSIGNED_INT&&(Q=n.RGBA32UI),B===n.BYTE&&(Q=n.RGBA8I),B===n.SHORT&&(Q=n.RGBA16I),B===n.INT&&(Q=n.RGBA32I)),M===n.RGB&&(B===n.UNSIGNED_INT_5_9_9_9_REV&&(Q=n.RGB9_E5),B===n.UNSIGNED_INT_10F_11F_11F_REV&&(Q=n.R11F_G11F_B10F)),M===n.RGBA){const He=ie?lo:xt.getTransfer($);B===n.FLOAT&&(Q=n.RGBA32F),B===n.HALF_FLOAT&&(Q=n.RGBA16F),B===n.UNSIGNED_BYTE&&(Q=He===Et?n.SRGB8_ALPHA8:n.RGBA8),B===n.UNSIGNED_SHORT_4_4_4_4&&(Q=n.RGBA4),B===n.UNSIGNED_SHORT_5_5_5_1&&(Q=n.RGB5_A1)}return(Q===n.R16F||Q===n.R32F||Q===n.RG16F||Q===n.RG32F||Q===n.RGBA16F||Q===n.RGBA32F)&&e.get("EXT_color_buffer_float"),Q}function _(P,M){let B;return P?M===null||M===Ui||M===os?B=n.DEPTH24_STENCIL8:M===Fn?B=n.DEPTH32F_STENCIL8:M===ss&&(B=n.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):M===null||M===Ui||M===os?B=n.DEPTH_COMPONENT24:M===Fn?B=n.DEPTH_COMPONENT32F:M===ss&&(B=n.DEPTH_COMPONENT16),B}function w(P,M){return m(P)===!0||P.isFramebufferTexture&&P.minFilter!==xn&&P.minFilter!==Nn?Math.log2(Math.max(M.width,M.height))+1:P.mipmaps!==void 0&&P.mipmaps.length>0?P.mipmaps.length:P.isCompressedTexture&&Array.isArray(P.image)?M.mipmaps.length:1}function E(P){const M=P.target;M.removeEventListener("dispose",E),L(M),M.isVideoTexture&&u.delete(M)}function C(P){const M=P.target;M.removeEventListener("dispose",C),y(M)}function L(P){const M=i.get(P);if(M.__webglInit===void 0)return;const B=P.source,$=d.get(B);if($){const ie=$[M.__cacheKey];ie.usedTimes--,ie.usedTimes===0&&v(P),Object.keys($).length===0&&d.delete(B)}i.remove(P)}function v(P){const M=i.get(P);n.deleteTexture(M.__webglTexture);const B=P.source,$=d.get(B);delete $[M.__cacheKey],o.memory.textures--}function y(P){const M=i.get(P);if(P.depthTexture&&(P.depthTexture.dispose(),i.remove(P.depthTexture)),P.isWebGLCubeRenderTarget)for(let $=0;$<6;$++){if(Array.isArray(M.__webglFramebuffer[$]))for(let ie=0;ie<M.__webglFramebuffer[$].length;ie++)n.deleteFramebuffer(M.__webglFramebuffer[$][ie]);else n.deleteFramebuffer(M.__webglFramebuffer[$]);M.__webglDepthbuffer&&n.deleteRenderbuffer(M.__webglDepthbuffer[$])}else{if(Array.isArray(M.__webglFramebuffer))for(let $=0;$<M.__webglFramebuffer.length;$++)n.deleteFramebuffer(M.__webglFramebuffer[$]);else n.deleteFramebuffer(M.__webglFramebuffer);if(M.__webglDepthbuffer&&n.deleteRenderbuffer(M.__webglDepthbuffer),M.__webglMultisampledFramebuffer&&n.deleteFramebuffer(M.__webglMultisampledFramebuffer),M.__webglColorRenderbuffer)for(let $=0;$<M.__webglColorRenderbuffer.length;$++)M.__webglColorRenderbuffer[$]&&n.deleteRenderbuffer(M.__webglColorRenderbuffer[$]);M.__webglDepthRenderbuffer&&n.deleteRenderbuffer(M.__webglDepthRenderbuffer)}const B=P.textures;for(let $=0,ie=B.length;$<ie;$++){const Q=i.get(B[$]);Q.__webglTexture&&(n.deleteTexture(Q.__webglTexture),o.memory.textures--),i.remove(B[$])}i.remove(P)}let R=0;function U(){R=0}function F(){const P=R;return P>=r.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+P+" texture units while this GPU supports only "+r.maxTextures),R+=1,P}function Y(P){const M=[];return M.push(P.wrapS),M.push(P.wrapT),M.push(P.wrapR||0),M.push(P.magFilter),M.push(P.minFilter),M.push(P.anisotropy),M.push(P.internalFormat),M.push(P.format),M.push(P.type),M.push(P.generateMipmaps),M.push(P.premultiplyAlpha),M.push(P.flipY),M.push(P.unpackAlignment),M.push(P.colorSpace),M.join()}function G(P,M){const B=i.get(P);if(P.isVideoTexture&&Be(P),P.isRenderTargetTexture===!1&&P.isExternalTexture!==!0&&P.version>0&&B.__version!==P.version){const $=P.image;if($===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if($.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{Z(B,P,M);return}}else P.isExternalTexture&&(B.__webglTexture=P.sourceTexture?P.sourceTexture:null);t.bindTexture(n.TEXTURE_2D,B.__webglTexture,n.TEXTURE0+M)}function H(P,M){const B=i.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&B.__version!==P.version){Z(B,P,M);return}t.bindTexture(n.TEXTURE_2D_ARRAY,B.__webglTexture,n.TEXTURE0+M)}function J(P,M){const B=i.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&B.__version!==P.version){Z(B,P,M);return}t.bindTexture(n.TEXTURE_3D,B.__webglTexture,n.TEXTURE0+M)}function W(P,M){const B=i.get(P);if(P.version>0&&B.__version!==P.version){K(B,P,M);return}t.bindTexture(n.TEXTURE_CUBE_MAP,B.__webglTexture,n.TEXTURE0+M)}const le={[rs]:n.REPEAT,[Di]:n.CLAMP_TO_EDGE,[La]:n.MIRRORED_REPEAT},_e={[xn]:n.NEAREST,[pd]:n.NEAREST_MIPMAP_NEAREST,[Ms]:n.NEAREST_MIPMAP_LINEAR,[Nn]:n.LINEAR,[Ao]:n.LINEAR_MIPMAP_NEAREST,[Ii]:n.LINEAR_MIPMAP_LINEAR},we={[_d]:n.NEVER,[Ed]:n.ALWAYS,[xd]:n.LESS,[Xu]:n.LEQUAL,[vd]:n.EQUAL,[Sd]:n.GEQUAL,[yd]:n.GREATER,[Md]:n.NOTEQUAL};function qe(P,M){if(M.type===Fn&&e.has("OES_texture_float_linear")===!1&&(M.magFilter===Nn||M.magFilter===Ao||M.magFilter===Ms||M.magFilter===Ii||M.minFilter===Nn||M.minFilter===Ao||M.minFilter===Ms||M.minFilter===Ii)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),n.texParameteri(P,n.TEXTURE_WRAP_S,le[M.wrapS]),n.texParameteri(P,n.TEXTURE_WRAP_T,le[M.wrapT]),(P===n.TEXTURE_3D||P===n.TEXTURE_2D_ARRAY)&&n.texParameteri(P,n.TEXTURE_WRAP_R,le[M.wrapR]),n.texParameteri(P,n.TEXTURE_MAG_FILTER,_e[M.magFilter]),n.texParameteri(P,n.TEXTURE_MIN_FILTER,_e[M.minFilter]),M.compareFunction&&(n.texParameteri(P,n.TEXTURE_COMPARE_MODE,n.COMPARE_REF_TO_TEXTURE),n.texParameteri(P,n.TEXTURE_COMPARE_FUNC,we[M.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(M.magFilter===xn||M.minFilter!==Ms&&M.minFilter!==Ii||M.type===Fn&&e.has("OES_texture_float_linear")===!1)return;if(M.anisotropy>1||i.get(M).__currentAnisotropy){const B=e.get("EXT_texture_filter_anisotropic");n.texParameterf(P,B.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(M.anisotropy,r.getMaxAnisotropy())),i.get(M).__currentAnisotropy=M.anisotropy}}}function at(P,M){let B=!1;P.__webglInit===void 0&&(P.__webglInit=!0,M.addEventListener("dispose",E));const $=M.source;let ie=d.get($);ie===void 0&&(ie={},d.set($,ie));const Q=Y(M);if(Q!==P.__cacheKey){ie[Q]===void 0&&(ie[Q]={texture:n.createTexture(),usedTimes:0},o.memory.textures++,B=!0),ie[Q].usedTimes++;const He=ie[P.__cacheKey];He!==void 0&&(ie[P.__cacheKey].usedTimes--,He.usedTimes===0&&v(M)),P.__cacheKey=Q,P.__webglTexture=ie[Q].texture}return B}function ne(P,M,B){return Math.floor(Math.floor(P/B)/M)}function Ie(P,M,B,$){const Q=P.updateRanges;if(Q.length===0)t.texSubImage2D(n.TEXTURE_2D,0,0,0,M.width,M.height,B,$,M.data);else{Q.sort((he,Ae)=>he.start-Ae.start);let He=0;for(let he=1;he<Q.length;he++){const Ae=Q[He],je=Q[he],Ge=Ae.start+Ae.count,Ee=ne(je.start,M.width,4),Je=ne(Ae.start,M.width,4);je.start<=Ge+1&&Ee===Je&&ne(je.start+je.count-1,M.width,4)===Ee?Ae.count=Math.max(Ae.count,je.start+je.count-Ae.start):(++He,Q[He]=je)}Q.length=He+1;const ge=n.getParameter(n.UNPACK_ROW_LENGTH),Le=n.getParameter(n.UNPACK_SKIP_PIXELS),Ve=n.getParameter(n.UNPACK_SKIP_ROWS);n.pixelStorei(n.UNPACK_ROW_LENGTH,M.width);for(let he=0,Ae=Q.length;he<Ae;he++){const je=Q[he],Ge=Math.floor(je.start/4),Ee=Math.ceil(je.count/4),Je=Ge%M.width,N=Math.floor(Ge/M.width),de=Ee,ve=1;n.pixelStorei(n.UNPACK_SKIP_PIXELS,Je),n.pixelStorei(n.UNPACK_SKIP_ROWS,N),t.texSubImage2D(n.TEXTURE_2D,0,Je,N,de,ve,B,$,M.data)}P.clearUpdateRanges(),n.pixelStorei(n.UNPACK_ROW_LENGTH,ge),n.pixelStorei(n.UNPACK_SKIP_PIXELS,Le),n.pixelStorei(n.UNPACK_SKIP_ROWS,Ve)}}function Z(P,M,B){let $=n.TEXTURE_2D;(M.isDataArrayTexture||M.isCompressedArrayTexture)&&($=n.TEXTURE_2D_ARRAY),M.isData3DTexture&&($=n.TEXTURE_3D);const ie=at(P,M),Q=M.source;t.bindTexture($,P.__webglTexture,n.TEXTURE0+B);const He=i.get(Q);if(Q.version!==He.__version||ie===!0){t.activeTexture(n.TEXTURE0+B);const ge=xt.getPrimaries(xt.workingColorSpace),Le=M.colorSpace===pi?null:xt.getPrimaries(M.colorSpace),Ve=M.colorSpace===pi||ge===Le?n.NONE:n.BROWSER_DEFAULT_WEBGL;n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,M.flipY),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),n.pixelStorei(n.UNPACK_ALIGNMENT,M.unpackAlignment),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,Ve);let he=x(M.image,!1,r.maxTextureSize);he=gt(M,he);const Ae=s.convert(M.format,M.colorSpace),je=s.convert(M.type);let Ge=S(M.internalFormat,Ae,je,M.colorSpace,M.isVideoTexture);qe($,M);let Ee;const Je=M.mipmaps,N=M.isVideoTexture!==!0,de=He.__version===void 0||ie===!0,ve=Q.dataReady,Ne=w(M,he);if(M.isDepthTexture)Ge=_(M.format===cs,M.type),de&&(N?t.texStorage2D(n.TEXTURE_2D,1,Ge,he.width,he.height):t.texImage2D(n.TEXTURE_2D,0,Ge,he.width,he.height,0,Ae,je,null));else if(M.isDataTexture)if(Je.length>0){N&&de&&t.texStorage2D(n.TEXTURE_2D,Ne,Ge,Je[0].width,Je[0].height);for(let ue=0,te=Je.length;ue<te;ue++)Ee=Je[ue],N?ve&&t.texSubImage2D(n.TEXTURE_2D,ue,0,0,Ee.width,Ee.height,Ae,je,Ee.data):t.texImage2D(n.TEXTURE_2D,ue,Ge,Ee.width,Ee.height,0,Ae,je,Ee.data);M.generateMipmaps=!1}else N?(de&&t.texStorage2D(n.TEXTURE_2D,Ne,Ge,he.width,he.height),ve&&Ie(M,he,Ae,je)):t.texImage2D(n.TEXTURE_2D,0,Ge,he.width,he.height,0,Ae,je,he.data);else if(M.isCompressedTexture)if(M.isCompressedArrayTexture){N&&de&&t.texStorage3D(n.TEXTURE_2D_ARRAY,Ne,Ge,Je[0].width,Je[0].height,he.depth);for(let ue=0,te=Je.length;ue<te;ue++)if(Ee=Je[ue],M.format!==Tn)if(Ae!==null)if(N){if(ve)if(M.layerUpdates.size>0){const Fe=Vl(Ee.width,Ee.height,M.format,M.type);for(const Ke of M.layerUpdates){const vt=Ee.data.subarray(Ke*Fe/Ee.data.BYTES_PER_ELEMENT,(Ke+1)*Fe/Ee.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,ue,0,0,Ke,Ee.width,Ee.height,1,Ae,vt)}M.clearLayerUpdates()}else t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,ue,0,0,0,Ee.width,Ee.height,he.depth,Ae,Ee.data)}else t.compressedTexImage3D(n.TEXTURE_2D_ARRAY,ue,Ge,Ee.width,Ee.height,he.depth,0,Ee.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else N?ve&&t.texSubImage3D(n.TEXTURE_2D_ARRAY,ue,0,0,0,Ee.width,Ee.height,he.depth,Ae,je,Ee.data):t.texImage3D(n.TEXTURE_2D_ARRAY,ue,Ge,Ee.width,Ee.height,he.depth,0,Ae,je,Ee.data)}else{N&&de&&t.texStorage2D(n.TEXTURE_2D,Ne,Ge,Je[0].width,Je[0].height);for(let ue=0,te=Je.length;ue<te;ue++)Ee=Je[ue],M.format!==Tn?Ae!==null?N?ve&&t.compressedTexSubImage2D(n.TEXTURE_2D,ue,0,0,Ee.width,Ee.height,Ae,Ee.data):t.compressedTexImage2D(n.TEXTURE_2D,ue,Ge,Ee.width,Ee.height,0,Ee.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):N?ve&&t.texSubImage2D(n.TEXTURE_2D,ue,0,0,Ee.width,Ee.height,Ae,je,Ee.data):t.texImage2D(n.TEXTURE_2D,ue,Ge,Ee.width,Ee.height,0,Ae,je,Ee.data)}else if(M.isDataArrayTexture)if(N){if(de&&t.texStorage3D(n.TEXTURE_2D_ARRAY,Ne,Ge,he.width,he.height,he.depth),ve)if(M.layerUpdates.size>0){const ue=Vl(he.width,he.height,M.format,M.type);for(const te of M.layerUpdates){const Fe=he.data.subarray(te*ue/he.data.BYTES_PER_ELEMENT,(te+1)*ue/he.data.BYTES_PER_ELEMENT);t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,te,he.width,he.height,1,Ae,je,Fe)}M.clearLayerUpdates()}else t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,0,he.width,he.height,he.depth,Ae,je,he.data)}else t.texImage3D(n.TEXTURE_2D_ARRAY,0,Ge,he.width,he.height,he.depth,0,Ae,je,he.data);else if(M.isData3DTexture)N?(de&&t.texStorage3D(n.TEXTURE_3D,Ne,Ge,he.width,he.height,he.depth),ve&&t.texSubImage3D(n.TEXTURE_3D,0,0,0,0,he.width,he.height,he.depth,Ae,je,he.data)):t.texImage3D(n.TEXTURE_3D,0,Ge,he.width,he.height,he.depth,0,Ae,je,he.data);else if(M.isFramebufferTexture){if(de)if(N)t.texStorage2D(n.TEXTURE_2D,Ne,Ge,he.width,he.height);else{let ue=he.width,te=he.height;for(let Fe=0;Fe<Ne;Fe++)t.texImage2D(n.TEXTURE_2D,Fe,Ge,ue,te,0,Ae,je,null),ue>>=1,te>>=1}}else if(Je.length>0){if(N&&de){const ue=_t(Je[0]);t.texStorage2D(n.TEXTURE_2D,Ne,Ge,ue.width,ue.height)}for(let ue=0,te=Je.length;ue<te;ue++)Ee=Je[ue],N?ve&&t.texSubImage2D(n.TEXTURE_2D,ue,0,0,Ae,je,Ee):t.texImage2D(n.TEXTURE_2D,ue,Ge,Ae,je,Ee);M.generateMipmaps=!1}else if(N){if(de){const ue=_t(he);t.texStorage2D(n.TEXTURE_2D,Ne,Ge,ue.width,ue.height)}ve&&t.texSubImage2D(n.TEXTURE_2D,0,0,0,Ae,je,he)}else t.texImage2D(n.TEXTURE_2D,0,Ge,Ae,je,he);m(M)&&p($),He.__version=Q.version,M.onUpdate&&M.onUpdate(M)}P.__version=M.version}function K(P,M,B){if(M.image.length!==6)return;const $=at(P,M),ie=M.source;t.bindTexture(n.TEXTURE_CUBE_MAP,P.__webglTexture,n.TEXTURE0+B);const Q=i.get(ie);if(ie.version!==Q.__version||$===!0){t.activeTexture(n.TEXTURE0+B);const He=xt.getPrimaries(xt.workingColorSpace),ge=M.colorSpace===pi?null:xt.getPrimaries(M.colorSpace),Le=M.colorSpace===pi||He===ge?n.NONE:n.BROWSER_DEFAULT_WEBGL;n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,M.flipY),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),n.pixelStorei(n.UNPACK_ALIGNMENT,M.unpackAlignment),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,Le);const Ve=M.isCompressedTexture||M.image[0].isCompressedTexture,he=M.image[0]&&M.image[0].isDataTexture,Ae=[];for(let te=0;te<6;te++)!Ve&&!he?Ae[te]=x(M.image[te],!0,r.maxCubemapSize):Ae[te]=he?M.image[te].image:M.image[te],Ae[te]=gt(M,Ae[te]);const je=Ae[0],Ge=s.convert(M.format,M.colorSpace),Ee=s.convert(M.type),Je=S(M.internalFormat,Ge,Ee,M.colorSpace),N=M.isVideoTexture!==!0,de=Q.__version===void 0||$===!0,ve=ie.dataReady;let Ne=w(M,je);qe(n.TEXTURE_CUBE_MAP,M);let ue;if(Ve){N&&de&&t.texStorage2D(n.TEXTURE_CUBE_MAP,Ne,Je,je.width,je.height);for(let te=0;te<6;te++){ue=Ae[te].mipmaps;for(let Fe=0;Fe<ue.length;Fe++){const Ke=ue[Fe];M.format!==Tn?Ge!==null?N?ve&&t.compressedTexSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe,0,0,Ke.width,Ke.height,Ge,Ke.data):t.compressedTexImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe,Je,Ke.width,Ke.height,0,Ke.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):N?ve&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe,0,0,Ke.width,Ke.height,Ge,Ee,Ke.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe,Je,Ke.width,Ke.height,0,Ge,Ee,Ke.data)}}}else{if(ue=M.mipmaps,N&&de){ue.length>0&&Ne++;const te=_t(Ae[0]);t.texStorage2D(n.TEXTURE_CUBE_MAP,Ne,Je,te.width,te.height)}for(let te=0;te<6;te++)if(he){N?ve&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,Ae[te].width,Ae[te].height,Ge,Ee,Ae[te].data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,Je,Ae[te].width,Ae[te].height,0,Ge,Ee,Ae[te].data);for(let Fe=0;Fe<ue.length;Fe++){const vt=ue[Fe].image[te].image;N?ve&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe+1,0,0,vt.width,vt.height,Ge,Ee,vt.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe+1,Je,vt.width,vt.height,0,Ge,Ee,vt.data)}}else{N?ve&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,Ge,Ee,Ae[te]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,Je,Ge,Ee,Ae[te]);for(let Fe=0;Fe<ue.length;Fe++){const Ke=ue[Fe];N?ve&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe+1,0,0,Ge,Ee,Ke.image[te]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+te,Fe+1,Je,Ge,Ee,Ke.image[te])}}}m(M)&&p(n.TEXTURE_CUBE_MAP),Q.__version=ie.version,M.onUpdate&&M.onUpdate(M)}P.__version=M.version}function oe(P,M,B,$,ie,Q){const He=s.convert(B.format,B.colorSpace),ge=s.convert(B.type),Le=S(B.internalFormat,He,ge,B.colorSpace),Ve=i.get(M),he=i.get(B);if(he.__renderTarget=M,!Ve.__hasExternalTextures){const Ae=Math.max(1,M.width>>Q),je=Math.max(1,M.height>>Q);ie===n.TEXTURE_3D||ie===n.TEXTURE_2D_ARRAY?t.texImage3D(ie,Q,Le,Ae,je,M.depth,0,He,ge,null):t.texImage2D(ie,Q,Le,Ae,je,0,He,ge,null)}t.bindFramebuffer(n.FRAMEBUFFER,P),xe(M)?c.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,$,ie,he.__webglTexture,0,Pe(M)):(ie===n.TEXTURE_2D||ie>=n.TEXTURE_CUBE_MAP_POSITIVE_X&&ie<=n.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&n.framebufferTexture2D(n.FRAMEBUFFER,$,ie,he.__webglTexture,Q),t.bindFramebuffer(n.FRAMEBUFFER,null)}function Me(P,M,B){if(n.bindRenderbuffer(n.RENDERBUFFER,P),M.depthBuffer){const $=M.depthTexture,ie=$&&$.isDepthTexture?$.type:null,Q=_(M.stencilBuffer,ie),He=M.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,ge=Pe(M);xe(M)?c.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,ge,Q,M.width,M.height):B?n.renderbufferStorageMultisample(n.RENDERBUFFER,ge,Q,M.width,M.height):n.renderbufferStorage(n.RENDERBUFFER,Q,M.width,M.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,He,n.RENDERBUFFER,P)}else{const $=M.textures;for(let ie=0;ie<$.length;ie++){const Q=$[ie],He=s.convert(Q.format,Q.colorSpace),ge=s.convert(Q.type),Le=S(Q.internalFormat,He,ge,Q.colorSpace),Ve=Pe(M);B&&xe(M)===!1?n.renderbufferStorageMultisample(n.RENDERBUFFER,Ve,Le,M.width,M.height):xe(M)?c.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,Ve,Le,M.width,M.height):n.renderbufferStorage(n.RENDERBUFFER,Le,M.width,M.height)}}n.bindRenderbuffer(n.RENDERBUFFER,null)}function fe(P,M){if(M&&M.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(n.FRAMEBUFFER,P),!(M.depthTexture&&M.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const $=i.get(M.depthTexture);$.__renderTarget=M,(!$.__webglTexture||M.depthTexture.image.width!==M.width||M.depthTexture.image.height!==M.height)&&(M.depthTexture.image.width=M.width,M.depthTexture.image.height=M.height,M.depthTexture.needsUpdate=!0),G(M.depthTexture,0);const ie=$.__webglTexture,Q=Pe(M);if(M.depthTexture.format===as)xe(M)?c.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,ie,0,Q):n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.TEXTURE_2D,ie,0);else if(M.depthTexture.format===cs)xe(M)?c.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,n.DEPTH_STENCIL_ATTACHMENT,n.TEXTURE_2D,ie,0,Q):n.framebufferTexture2D(n.FRAMEBUFFER,n.DEPTH_STENCIL_ATTACHMENT,n.TEXTURE_2D,ie,0);else throw new Error("Unknown depthTexture format")}function Ue(P){const M=i.get(P),B=P.isWebGLCubeRenderTarget===!0;if(M.__boundDepthTexture!==P.depthTexture){const $=P.depthTexture;if(M.__depthDisposeCallback&&M.__depthDisposeCallback(),$){const ie=()=>{delete M.__boundDepthTexture,delete M.__depthDisposeCallback,$.removeEventListener("dispose",ie)};$.addEventListener("dispose",ie),M.__depthDisposeCallback=ie}M.__boundDepthTexture=$}if(P.depthTexture&&!M.__autoAllocateDepthBuffer){if(B)throw new Error("target.depthTexture not supported in Cube render targets");const $=P.texture.mipmaps;$&&$.length>0?fe(M.__webglFramebuffer[0],P):fe(M.__webglFramebuffer,P)}else if(B){M.__webglDepthbuffer=[];for(let $=0;$<6;$++)if(t.bindFramebuffer(n.FRAMEBUFFER,M.__webglFramebuffer[$]),M.__webglDepthbuffer[$]===void 0)M.__webglDepthbuffer[$]=n.createRenderbuffer(),Me(M.__webglDepthbuffer[$],P,!1);else{const ie=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,Q=M.__webglDepthbuffer[$];n.bindRenderbuffer(n.RENDERBUFFER,Q),n.framebufferRenderbuffer(n.FRAMEBUFFER,ie,n.RENDERBUFFER,Q)}}else{const $=P.texture.mipmaps;if($&&$.length>0?t.bindFramebuffer(n.FRAMEBUFFER,M.__webglFramebuffer[0]):t.bindFramebuffer(n.FRAMEBUFFER,M.__webglFramebuffer),M.__webglDepthbuffer===void 0)M.__webglDepthbuffer=n.createRenderbuffer(),Me(M.__webglDepthbuffer,P,!1);else{const ie=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,Q=M.__webglDepthbuffer;n.bindRenderbuffer(n.RENDERBUFFER,Q),n.framebufferRenderbuffer(n.FRAMEBUFFER,ie,n.RENDERBUFFER,Q)}}t.bindFramebuffer(n.FRAMEBUFFER,null)}function ye(P,M,B){const $=i.get(P);M!==void 0&&oe($.__webglFramebuffer,P,P.texture,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,0),B!==void 0&&Ue(P)}function A(P){const M=P.texture,B=i.get(P),$=i.get(M);P.addEventListener("dispose",C);const ie=P.textures,Q=P.isWebGLCubeRenderTarget===!0,He=ie.length>1;if(He||($.__webglTexture===void 0&&($.__webglTexture=n.createTexture()),$.__version=M.version,o.memory.textures++),Q){B.__webglFramebuffer=[];for(let ge=0;ge<6;ge++)if(M.mipmaps&&M.mipmaps.length>0){B.__webglFramebuffer[ge]=[];for(let Le=0;Le<M.mipmaps.length;Le++)B.__webglFramebuffer[ge][Le]=n.createFramebuffer()}else B.__webglFramebuffer[ge]=n.createFramebuffer()}else{if(M.mipmaps&&M.mipmaps.length>0){B.__webglFramebuffer=[];for(let ge=0;ge<M.mipmaps.length;ge++)B.__webglFramebuffer[ge]=n.createFramebuffer()}else B.__webglFramebuffer=n.createFramebuffer();if(He)for(let ge=0,Le=ie.length;ge<Le;ge++){const Ve=i.get(ie[ge]);Ve.__webglTexture===void 0&&(Ve.__webglTexture=n.createTexture(),o.memory.textures++)}if(P.samples>0&&xe(P)===!1){B.__webglMultisampledFramebuffer=n.createFramebuffer(),B.__webglColorRenderbuffer=[],t.bindFramebuffer(n.FRAMEBUFFER,B.__webglMultisampledFramebuffer);for(let ge=0;ge<ie.length;ge++){const Le=ie[ge];B.__webglColorRenderbuffer[ge]=n.createRenderbuffer(),n.bindRenderbuffer(n.RENDERBUFFER,B.__webglColorRenderbuffer[ge]);const Ve=s.convert(Le.format,Le.colorSpace),he=s.convert(Le.type),Ae=S(Le.internalFormat,Ve,he,Le.colorSpace,P.isXRRenderTarget===!0),je=Pe(P);n.renderbufferStorageMultisample(n.RENDERBUFFER,je,Ae,P.width,P.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+ge,n.RENDERBUFFER,B.__webglColorRenderbuffer[ge])}n.bindRenderbuffer(n.RENDERBUFFER,null),P.depthBuffer&&(B.__webglDepthRenderbuffer=n.createRenderbuffer(),Me(B.__webglDepthRenderbuffer,P,!0)),t.bindFramebuffer(n.FRAMEBUFFER,null)}}if(Q){t.bindTexture(n.TEXTURE_CUBE_MAP,$.__webglTexture),qe(n.TEXTURE_CUBE_MAP,M);for(let ge=0;ge<6;ge++)if(M.mipmaps&&M.mipmaps.length>0)for(let Le=0;Le<M.mipmaps.length;Le++)oe(B.__webglFramebuffer[ge][Le],P,M,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,Le);else oe(B.__webglFramebuffer[ge],P,M,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0);m(M)&&p(n.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(He){for(let ge=0,Le=ie.length;ge<Le;ge++){const Ve=ie[ge],he=i.get(Ve);let Ae=n.TEXTURE_2D;(P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(Ae=P.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(Ae,he.__webglTexture),qe(Ae,Ve),oe(B.__webglFramebuffer,P,Ve,n.COLOR_ATTACHMENT0+ge,Ae,0),m(Ve)&&p(Ae)}t.unbindTexture()}else{let ge=n.TEXTURE_2D;if((P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(ge=P.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(ge,$.__webglTexture),qe(ge,M),M.mipmaps&&M.mipmaps.length>0)for(let Le=0;Le<M.mipmaps.length;Le++)oe(B.__webglFramebuffer[Le],P,M,n.COLOR_ATTACHMENT0,ge,Le);else oe(B.__webglFramebuffer,P,M,n.COLOR_ATTACHMENT0,ge,0);m(M)&&p(ge),t.unbindTexture()}P.depthBuffer&&Ue(P)}function Oe(P){const M=P.textures;for(let B=0,$=M.length;B<$;B++){const ie=M[B];if(m(ie)){const Q=b(P),He=i.get(ie).__webglTexture;t.bindTexture(Q,He),p(Q),t.unbindTexture()}}}const Ye=[],V=[];function ee(P){if(P.samples>0){if(xe(P)===!1){const M=P.textures,B=P.width,$=P.height;let ie=n.COLOR_BUFFER_BIT;const Q=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,He=i.get(P),ge=M.length>1;if(ge)for(let Ve=0;Ve<M.length;Ve++)t.bindFramebuffer(n.FRAMEBUFFER,He.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ve,n.RENDERBUFFER,null),t.bindFramebuffer(n.FRAMEBUFFER,He.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ve,n.TEXTURE_2D,null,0);t.bindFramebuffer(n.READ_FRAMEBUFFER,He.__webglMultisampledFramebuffer);const Le=P.texture.mipmaps;Le&&Le.length>0?t.bindFramebuffer(n.DRAW_FRAMEBUFFER,He.__webglFramebuffer[0]):t.bindFramebuffer(n.DRAW_FRAMEBUFFER,He.__webglFramebuffer);for(let Ve=0;Ve<M.length;Ve++){if(P.resolveDepthBuffer&&(P.depthBuffer&&(ie|=n.DEPTH_BUFFER_BIT),P.stencilBuffer&&P.resolveStencilBuffer&&(ie|=n.STENCIL_BUFFER_BIT)),ge){n.framebufferRenderbuffer(n.READ_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.RENDERBUFFER,He.__webglColorRenderbuffer[Ve]);const he=i.get(M[Ve]).__webglTexture;n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,he,0)}n.blitFramebuffer(0,0,B,$,0,0,B,$,ie,n.NEAREST),l===!0&&(Ye.length=0,V.length=0,Ye.push(n.COLOR_ATTACHMENT0+Ve),P.depthBuffer&&P.resolveDepthBuffer===!1&&(Ye.push(Q),V.push(Q),n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,V)),n.invalidateFramebuffer(n.READ_FRAMEBUFFER,Ye))}if(t.bindFramebuffer(n.READ_FRAMEBUFFER,null),t.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),ge)for(let Ve=0;Ve<M.length;Ve++){t.bindFramebuffer(n.FRAMEBUFFER,He.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ve,n.RENDERBUFFER,He.__webglColorRenderbuffer[Ve]);const he=i.get(M[Ve]).__webglTexture;t.bindFramebuffer(n.FRAMEBUFFER,He.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+Ve,n.TEXTURE_2D,he,0)}t.bindFramebuffer(n.DRAW_FRAMEBUFFER,He.__webglMultisampledFramebuffer)}else if(P.depthBuffer&&P.resolveDepthBuffer===!1&&l){const M=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,[M])}}}function Pe(P){return Math.min(r.maxSamples,P.samples)}function xe(P){const M=i.get(P);return P.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&M.__useRenderToTexture!==!1}function Be(P){const M=o.render.frame;u.get(P)!==M&&(u.set(P,M),P.update())}function gt(P,M){const B=P.colorSpace,$=P.format,ie=P.type;return P.isCompressedTexture===!0||P.isVideoTexture===!0||B!==vr&&B!==pi&&(xt.getTransfer(B)===Et?($!==Tn||ie!==On)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",B)),M}function _t(P){return typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement?(a.width=P.naturalWidth||P.width,a.height=P.naturalHeight||P.height):typeof VideoFrame<"u"&&P instanceof VideoFrame?(a.width=P.displayWidth,a.height=P.displayHeight):(a.width=P.width,a.height=P.height),a}this.allocateTextureUnit=F,this.resetTextureUnits=U,this.setTexture2D=G,this.setTexture2DArray=H,this.setTexture3D=J,this.setTextureCube=W,this.rebindTextures=ye,this.setupRenderTarget=A,this.updateRenderTargetMipmap=Oe,this.updateMultisampleRenderTarget=ee,this.setupDepthRenderbuffer=Ue,this.setupFrameBufferTexture=oe,this.useMultisampledRTT=xe}function v_(n,e){function t(i,r=pi){let s;const o=xt.getTransfer(r);if(i===On)return n.UNSIGNED_BYTE;if(i===wc)return n.UNSIGNED_SHORT_4_4_4_4;if(i===Ac)return n.UNSIGNED_SHORT_5_5_5_1;if(i===Bu)return n.UNSIGNED_INT_5_9_9_9_REV;if(i===ku)return n.UNSIGNED_INT_10F_11F_11F_REV;if(i===zu)return n.BYTE;if(i===Ou)return n.SHORT;if(i===ss)return n.UNSIGNED_SHORT;if(i===Tc)return n.INT;if(i===Ui)return n.UNSIGNED_INT;if(i===Fn)return n.FLOAT;if(i===ms)return n.HALF_FLOAT;if(i===Hu)return n.ALPHA;if(i===Vu)return n.RGB;if(i===Tn)return n.RGBA;if(i===as)return n.DEPTH_COMPONENT;if(i===cs)return n.DEPTH_STENCIL;if(i===Rc)return n.RED;if(i===Cc)return n.RED_INTEGER;if(i===Gu)return n.RG;if(i===Pc)return n.RG_INTEGER;if(i===Lc)return n.RGBA_INTEGER;if(i===Ks||i===Qs||i===eo||i===to)if(o===Et)if(s=e.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(i===Ks)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===Qs)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===eo)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===to)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=e.get("WEBGL_compressed_texture_s3tc"),s!==null){if(i===Ks)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===Qs)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===eo)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===to)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===Da||i===Ia||i===Ua||i===Na)if(s=e.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(i===Da)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===Ia)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===Ua)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===Na)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===Fa||i===za||i===Oa)if(s=e.get("WEBGL_compressed_texture_etc"),s!==null){if(i===Fa||i===za)return o===Et?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(i===Oa)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(i===Ba||i===ka||i===Ha||i===Va||i===Ga||i===Wa||i===Xa||i===qa||i===Ya||i===Za||i===ja||i===$a||i===Ja||i===Ka)if(s=e.get("WEBGL_compressed_texture_astc"),s!==null){if(i===Ba)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===ka)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===Ha)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Va)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===Ga)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===Wa)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===Xa)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===qa)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Ya)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Za)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===ja)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===$a)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===Ja)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Ka)return o===Et?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===Qa||i===ec||i===tc)if(s=e.get("EXT_texture_compression_bptc"),s!==null){if(i===Qa)return o===Et?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===ec)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===tc)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===nc||i===ic||i===rc||i===sc)if(s=e.get("EXT_texture_compression_rgtc"),s!==null){if(i===nc)return s.COMPRESSED_RED_RGTC1_EXT;if(i===ic)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===rc)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===sc)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===os?n.UNSIGNED_INT_24_8:n[i]!==void 0?n[i]:null}return{convert:t}}const y_=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,M_=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class S_{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const i=new rh(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,i=new ii({vertexShader:y_,fragmentShader:M_,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new pt(new Kn(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class E_ extends Tr{constructor(e,t){super();const i=this;let r=null,s=1,o=null,c="local-floor",l=1,a=null,u=null,h=null,d=null,f=null,g=null;const x=typeof XRWebGLBinding<"u",m=new S_,p={},b=t.getContextAttributes();let S=null,_=null;const w=[],E=[],C=new Ce;let L=null;const v=new _n;v.viewport=new Tt;const y=new _n;y.viewport=new Tt;const R=[v,y],U=new Gf;let F=null,Y=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Z){let K=w[Z];return K===void 0&&(K=new $o,w[Z]=K),K.getTargetRaySpace()},this.getControllerGrip=function(Z){let K=w[Z];return K===void 0&&(K=new $o,w[Z]=K),K.getGripSpace()},this.getHand=function(Z){let K=w[Z];return K===void 0&&(K=new $o,w[Z]=K),K.getHandSpace()};function G(Z){const K=E.indexOf(Z.inputSource);if(K===-1)return;const oe=w[K];oe!==void 0&&(oe.update(Z.inputSource,Z.frame,a||o),oe.dispatchEvent({type:Z.type,data:Z.inputSource}))}function H(){r.removeEventListener("select",G),r.removeEventListener("selectstart",G),r.removeEventListener("selectend",G),r.removeEventListener("squeeze",G),r.removeEventListener("squeezestart",G),r.removeEventListener("squeezeend",G),r.removeEventListener("end",H),r.removeEventListener("inputsourceschange",J);for(let Z=0;Z<w.length;Z++){const K=E[Z];K!==null&&(E[Z]=null,w[Z].disconnect(K))}F=null,Y=null,m.reset();for(const Z in p)delete p[Z];e.setRenderTarget(S),f=null,d=null,h=null,r=null,_=null,Ie.stop(),i.isPresenting=!1,e.setPixelRatio(L),e.setSize(C.width,C.height,!1),i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Z){s=Z,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Z){c=Z,i.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return a||o},this.setReferenceSpace=function(Z){a=Z},this.getBaseLayer=function(){return d!==null?d:f},this.getBinding=function(){return h===null&&x&&(h=new XRWebGLBinding(r,t)),h},this.getFrame=function(){return g},this.getSession=function(){return r},this.setSession=async function(Z){if(r=Z,r!==null){if(S=e.getRenderTarget(),r.addEventListener("select",G),r.addEventListener("selectstart",G),r.addEventListener("selectend",G),r.addEventListener("squeeze",G),r.addEventListener("squeezestart",G),r.addEventListener("squeezeend",G),r.addEventListener("end",H),r.addEventListener("inputsourceschange",J),b.xrCompatible!==!0&&await t.makeXRCompatible(),L=e.getPixelRatio(),e.getSize(C),x&&"createProjectionLayer"in XRWebGLBinding.prototype){let oe=null,Me=null,fe=null;b.depth&&(fe=b.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,oe=b.stencil?cs:as,Me=b.stencil?os:Ui);const Ue={colorFormat:t.RGBA8,depthFormat:fe,scaleFactor:s};h=this.getBinding(),d=h.createProjectionLayer(Ue),r.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),_=new Ni(d.textureWidth,d.textureHeight,{format:Tn,type:On,depthTexture:new ih(d.textureWidth,d.textureHeight,Me,void 0,void 0,void 0,void 0,void 0,void 0,oe),stencilBuffer:b.stencil,colorSpace:e.outputColorSpace,samples:b.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{const oe={antialias:b.antialias,alpha:!0,depth:b.depth,stencil:b.stencil,framebufferScaleFactor:s};f=new XRWebGLLayer(r,t,oe),r.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),_=new Ni(f.framebufferWidth,f.framebufferHeight,{format:Tn,type:On,colorSpace:e.outputColorSpace,stencilBuffer:b.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}_.isXRRenderTarget=!0,this.setFoveation(l),a=null,o=await r.requestReferenceSpace(c),Ie.setContext(r),Ie.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function J(Z){for(let K=0;K<Z.removed.length;K++){const oe=Z.removed[K],Me=E.indexOf(oe);Me>=0&&(E[Me]=null,w[Me].disconnect(oe))}for(let K=0;K<Z.added.length;K++){const oe=Z.added[K];let Me=E.indexOf(oe);if(Me===-1){for(let Ue=0;Ue<w.length;Ue++)if(Ue>=E.length){E.push(oe),Me=Ue;break}else if(E[Ue]===null){E[Ue]=oe,Me=Ue;break}if(Me===-1)break}const fe=w[Me];fe&&fe.connect(oe)}}const W=new I,le=new I;function _e(Z,K,oe){W.setFromMatrixPosition(K.matrixWorld),le.setFromMatrixPosition(oe.matrixWorld);const Me=W.distanceTo(le),fe=K.projectionMatrix.elements,Ue=oe.projectionMatrix.elements,ye=fe[14]/(fe[10]-1),A=fe[14]/(fe[10]+1),Oe=(fe[9]+1)/fe[5],Ye=(fe[9]-1)/fe[5],V=(fe[8]-1)/fe[0],ee=(Ue[8]+1)/Ue[0],Pe=ye*V,xe=ye*ee,Be=Me/(-V+ee),gt=Be*-V;if(K.matrixWorld.decompose(Z.position,Z.quaternion,Z.scale),Z.translateX(gt),Z.translateZ(Be),Z.matrixWorld.compose(Z.position,Z.quaternion,Z.scale),Z.matrixWorldInverse.copy(Z.matrixWorld).invert(),fe[10]===-1)Z.projectionMatrix.copy(K.projectionMatrix),Z.projectionMatrixInverse.copy(K.projectionMatrixInverse);else{const _t=ye+Be,P=A+Be,M=Pe-gt,B=xe+(Me-gt),$=Oe*A/P*_t,ie=Ye*A/P*_t;Z.projectionMatrix.makePerspective(M,B,$,ie,_t,P),Z.projectionMatrixInverse.copy(Z.projectionMatrix).invert()}}function we(Z,K){K===null?Z.matrixWorld.copy(Z.matrix):Z.matrixWorld.multiplyMatrices(K.matrixWorld,Z.matrix),Z.matrixWorldInverse.copy(Z.matrixWorld).invert()}this.updateCamera=function(Z){if(r===null)return;let K=Z.near,oe=Z.far;m.texture!==null&&(m.depthNear>0&&(K=m.depthNear),m.depthFar>0&&(oe=m.depthFar)),U.near=y.near=v.near=K,U.far=y.far=v.far=oe,(F!==U.near||Y!==U.far)&&(r.updateRenderState({depthNear:U.near,depthFar:U.far}),F=U.near,Y=U.far),U.layers.mask=Z.layers.mask|6,v.layers.mask=U.layers.mask&3,y.layers.mask=U.layers.mask&5;const Me=Z.parent,fe=U.cameras;we(U,Me);for(let Ue=0;Ue<fe.length;Ue++)we(fe[Ue],Me);fe.length===2?_e(U,v,y):U.projectionMatrix.copy(v.projectionMatrix),qe(Z,U,Me)};function qe(Z,K,oe){oe===null?Z.matrix.copy(K.matrixWorld):(Z.matrix.copy(oe.matrixWorld),Z.matrix.invert(),Z.matrix.multiply(K.matrixWorld)),Z.matrix.decompose(Z.position,Z.quaternion,Z.scale),Z.updateMatrixWorld(!0),Z.projectionMatrix.copy(K.projectionMatrix),Z.projectionMatrixInverse.copy(K.projectionMatrixInverse),Z.isPerspectiveCamera&&(Z.fov=ac*2*Math.atan(1/Z.projectionMatrix.elements[5]),Z.zoom=1)}this.getCamera=function(){return U},this.getFoveation=function(){if(!(d===null&&f===null))return l},this.setFoveation=function(Z){l=Z,d!==null&&(d.fixedFoveation=Z),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=Z)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(U)},this.getCameraTexture=function(Z){return p[Z]};let at=null;function ne(Z,K){if(u=K.getViewerPose(a||o),g=K,u!==null){const oe=u.views;f!==null&&(e.setRenderTargetFramebuffer(_,f.framebuffer),e.setRenderTarget(_));let Me=!1;oe.length!==U.cameras.length&&(U.cameras.length=0,Me=!0);for(let A=0;A<oe.length;A++){const Oe=oe[A];let Ye=null;if(f!==null)Ye=f.getViewport(Oe);else{const ee=h.getViewSubImage(d,Oe);Ye=ee.viewport,A===0&&(e.setRenderTargetTextures(_,ee.colorTexture,ee.depthStencilTexture),e.setRenderTarget(_))}let V=R[A];V===void 0&&(V=new _n,V.layers.enable(A),V.viewport=new Tt,R[A]=V),V.matrix.fromArray(Oe.transform.matrix),V.matrix.decompose(V.position,V.quaternion,V.scale),V.projectionMatrix.fromArray(Oe.projectionMatrix),V.projectionMatrixInverse.copy(V.projectionMatrix).invert(),V.viewport.set(Ye.x,Ye.y,Ye.width,Ye.height),A===0&&(U.matrix.copy(V.matrix),U.matrix.decompose(U.position,U.quaternion,U.scale)),Me===!0&&U.cameras.push(V)}const fe=r.enabledFeatures;if(fe&&fe.includes("depth-sensing")&&r.depthUsage=="gpu-optimized"&&x){h=i.getBinding();const A=h.getDepthInformation(oe[0]);A&&A.isValid&&A.texture&&m.init(A,r.renderState)}if(fe&&fe.includes("camera-access")&&x){e.state.unbindTexture(),h=i.getBinding();for(let A=0;A<oe.length;A++){const Oe=oe[A].camera;if(Oe){let Ye=p[Oe];Ye||(Ye=new rh,p[Oe]=Ye);const V=h.getCameraImage(Oe);Ye.sourceTexture=V}}}}for(let oe=0;oe<w.length;oe++){const Me=E[oe],fe=w[oe];Me!==null&&fe!==void 0&&fe.update(Me,K,a||o)}at&&at(Z,K),K.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:K}),g=null}const Ie=new mh;Ie.setAnimationLoop(ne),this.setAnimationLoop=function(Z){at=Z},this.dispose=function(){}}}const Ti=new an,b_=new mt;function T_(n,e){function t(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function i(m,p){p.color.getRGB(m.fogColor.value,Ku(n)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function r(m,p,b,S,_){p.isMeshBasicMaterial||p.isMeshLambertMaterial?s(m,p):p.isMeshToonMaterial?(s(m,p),h(m,p)):p.isMeshPhongMaterial?(s(m,p),u(m,p)):p.isMeshStandardMaterial?(s(m,p),d(m,p),p.isMeshPhysicalMaterial&&f(m,p,_)):p.isMeshMatcapMaterial?(s(m,p),g(m,p)):p.isMeshDepthMaterial?s(m,p):p.isMeshDistanceMaterial?(s(m,p),x(m,p)):p.isMeshNormalMaterial?s(m,p):p.isLineBasicMaterial?(o(m,p),p.isLineDashedMaterial&&c(m,p)):p.isPointsMaterial?l(m,p,b,S):p.isSpriteMaterial?a(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function s(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,t(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===on&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,t(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===on&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,t(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,t(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,t(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);const b=e.get(p),S=b.envMap,_=b.envMapRotation;S&&(m.envMap.value=S,Ti.copy(_),Ti.x*=-1,Ti.y*=-1,Ti.z*=-1,S.isCubeTexture&&S.isRenderTargetTexture===!1&&(Ti.y*=-1,Ti.z*=-1),m.envMapRotation.value.setFromMatrix4(b_.makeRotationFromEuler(Ti)),m.flipEnvMap.value=S.isCubeTexture&&S.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,t(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,t(p.aoMap,m.aoMapTransform))}function o(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform))}function c(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function l(m,p,b,S){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*b,m.scale.value=S*.5,p.map&&(m.map.value=p.map,t(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function a(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function u(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function h(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function d(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,t(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,t(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function f(m,p,b){m.ior.value=p.ior,p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,t(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,t(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,t(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,t(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,t(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===on&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,t(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,t(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=b.texture,m.transmissionSamplerSize.value.set(b.width,b.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,t(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,t(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,t(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,t(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,t(p.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,p){p.matcap&&(m.matcap.value=p.matcap)}function x(m,p){const b=e.get(p).light;m.referencePosition.value.setFromMatrixPosition(b.matrixWorld),m.nearDistance.value=b.shadow.camera.near,m.farDistance.value=b.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:r}}function w_(n,e,t,i){let r={},s={},o=[];const c=n.getParameter(n.MAX_UNIFORM_BUFFER_BINDINGS);function l(b,S){const _=S.program;i.uniformBlockBinding(b,_)}function a(b,S){let _=r[b.id];_===void 0&&(g(b),_=u(b),r[b.id]=_,b.addEventListener("dispose",m));const w=S.program;i.updateUBOMapping(b,w);const E=e.render.frame;s[b.id]!==E&&(d(b),s[b.id]=E)}function u(b){const S=h();b.__bindingPointIndex=S;const _=n.createBuffer(),w=b.__size,E=b.usage;return n.bindBuffer(n.UNIFORM_BUFFER,_),n.bufferData(n.UNIFORM_BUFFER,w,E),n.bindBuffer(n.UNIFORM_BUFFER,null),n.bindBufferBase(n.UNIFORM_BUFFER,S,_),_}function h(){for(let b=0;b<c;b++)if(o.indexOf(b)===-1)return o.push(b),b;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(b){const S=r[b.id],_=b.uniforms,w=b.__cache;n.bindBuffer(n.UNIFORM_BUFFER,S);for(let E=0,C=_.length;E<C;E++){const L=Array.isArray(_[E])?_[E]:[_[E]];for(let v=0,y=L.length;v<y;v++){const R=L[v];if(f(R,E,v,w)===!0){const U=R.__offset,F=Array.isArray(R.value)?R.value:[R.value];let Y=0;for(let G=0;G<F.length;G++){const H=F[G],J=x(H);typeof H=="number"||typeof H=="boolean"?(R.__data[0]=H,n.bufferSubData(n.UNIFORM_BUFFER,U+Y,R.__data)):H.isMatrix3?(R.__data[0]=H.elements[0],R.__data[1]=H.elements[1],R.__data[2]=H.elements[2],R.__data[3]=0,R.__data[4]=H.elements[3],R.__data[5]=H.elements[4],R.__data[6]=H.elements[5],R.__data[7]=0,R.__data[8]=H.elements[6],R.__data[9]=H.elements[7],R.__data[10]=H.elements[8],R.__data[11]=0):(H.toArray(R.__data,Y),Y+=J.storage/Float32Array.BYTES_PER_ELEMENT)}n.bufferSubData(n.UNIFORM_BUFFER,U,R.__data)}}}n.bindBuffer(n.UNIFORM_BUFFER,null)}function f(b,S,_,w){const E=b.value,C=S+"_"+_;if(w[C]===void 0)return typeof E=="number"||typeof E=="boolean"?w[C]=E:w[C]=E.clone(),!0;{const L=w[C];if(typeof E=="number"||typeof E=="boolean"){if(L!==E)return w[C]=E,!0}else if(L.equals(E)===!1)return L.copy(E),!0}return!1}function g(b){const S=b.uniforms;let _=0;const w=16;for(let C=0,L=S.length;C<L;C++){const v=Array.isArray(S[C])?S[C]:[S[C]];for(let y=0,R=v.length;y<R;y++){const U=v[y],F=Array.isArray(U.value)?U.value:[U.value];for(let Y=0,G=F.length;Y<G;Y++){const H=F[Y],J=x(H),W=_%w,le=W%J.boundary,_e=W+le;_+=le,_e!==0&&w-_e<J.storage&&(_+=w-_e),U.__data=new Float32Array(J.storage/Float32Array.BYTES_PER_ELEMENT),U.__offset=_,_+=J.storage}}}const E=_%w;return E>0&&(_+=w-E),b.__size=_,b.__cache={},this}function x(b){const S={boundary:0,storage:0};return typeof b=="number"||typeof b=="boolean"?(S.boundary=4,S.storage=4):b.isVector2?(S.boundary=8,S.storage=8):b.isVector3||b.isColor?(S.boundary=16,S.storage=12):b.isVector4?(S.boundary=16,S.storage=16):b.isMatrix3?(S.boundary=48,S.storage=48):b.isMatrix4?(S.boundary=64,S.storage=64):b.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",b),S}function m(b){const S=b.target;S.removeEventListener("dispose",m);const _=o.indexOf(S.__bindingPointIndex);o.splice(_,1),n.deleteBuffer(r[S.id]),delete r[S.id],delete s[S.id]}function p(){for(const b in r)n.deleteBuffer(r[b]);o=[],r={},s={}}return{bind:l,update:a,dispose:p}}class A_{constructor(e={}){const{canvas:t=Ad(),context:i=null,depth:r=!0,stencil:s=!1,alpha:o=!1,antialias:c=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:a=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:h=!1,reversedDepthBuffer:d=!1}=e;this.isWebGLRenderer=!0;let f;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");f=i.getContextAttributes().alpha}else f=o;const g=new Uint32Array(4),x=new Int32Array(4);let m=null,p=null;const b=[],S=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=_i,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const _=this;let w=!1;this._outputColorSpace=un;let E=0,C=0,L=null,v=-1,y=null;const R=new Tt,U=new Tt;let F=null;const Y=new ct(0);let G=0,H=t.width,J=t.height,W=1,le=null,_e=null;const we=new Tt(0,0,H,J),qe=new Tt(0,0,H,J);let at=!1;const ne=new Nc;let Ie=!1,Z=!1;const K=new mt,oe=new I,Me=new Tt,fe={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Ue=!1;function ye(){return L===null?W:1}let A=i;function Oe(T,z){return t.getContext(T,z)}try{const T={alpha:!0,depth:r,stencil:s,antialias:c,premultipliedAlpha:l,preserveDrawingBuffer:a,powerPreference:u,failIfMajorPerformanceCaveat:h};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${bc}`),t.addEventListener("webglcontextlost",ve,!1),t.addEventListener("webglcontextrestored",Ne,!1),t.addEventListener("webglcontextcreationerror",ue,!1),A===null){const z="webgl2";if(A=Oe(z,T),A===null)throw Oe(z)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(T){throw console.error("THREE.WebGLRenderer: "+T.message),T}let Ye,V,ee,Pe,xe,Be,gt,_t,P,M,B,$,ie,Q,He,ge,Le,Ve,he,Ae,je,Ge,Ee,Je;function N(){Ye=new z0(A),Ye.init(),Ge=new v_(A,Ye),V=new P0(A,Ye,e,Ge),ee=new __(A,Ye),V.reversedDepthBuffer&&d&&ee.buffers.depth.setReversed(!0),Pe=new k0(A),xe=new r_,Be=new x_(A,Ye,ee,xe,V,Ge,Pe),gt=new D0(_),_t=new F0(_),P=new qf(A),Ee=new R0(A,P),M=new O0(A,P,Pe,Ee),B=new V0(A,M,P,Pe),he=new H0(A,V,Be),ge=new L0(xe),$=new i_(_,gt,_t,Ye,V,Ee,ge),ie=new T_(_,xe),Q=new o_,He=new d_(Ye),Ve=new A0(_,gt,_t,ee,B,f,l),Le=new m_(_,B,V),Je=new w_(A,Pe,V,ee),Ae=new C0(A,Ye,Pe),je=new B0(A,Ye,Pe),Pe.programs=$.programs,_.capabilities=V,_.extensions=Ye,_.properties=xe,_.renderLists=Q,_.shadowMap=Le,_.state=ee,_.info=Pe}N();const de=new E_(_,A);this.xr=de,this.getContext=function(){return A},this.getContextAttributes=function(){return A.getContextAttributes()},this.forceContextLoss=function(){const T=Ye.get("WEBGL_lose_context");T&&T.loseContext()},this.forceContextRestore=function(){const T=Ye.get("WEBGL_lose_context");T&&T.restoreContext()},this.getPixelRatio=function(){return W},this.setPixelRatio=function(T){T!==void 0&&(W=T,this.setSize(H,J,!1))},this.getSize=function(T){return T.set(H,J)},this.setSize=function(T,z,q=!0){if(de.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}H=T,J=z,t.width=Math.floor(T*W),t.height=Math.floor(z*W),q===!0&&(t.style.width=T+"px",t.style.height=z+"px"),this.setViewport(0,0,T,z)},this.getDrawingBufferSize=function(T){return T.set(H*W,J*W).floor()},this.setDrawingBufferSize=function(T,z,q){H=T,J=z,W=q,t.width=Math.floor(T*q),t.height=Math.floor(z*q),this.setViewport(0,0,T,z)},this.getCurrentViewport=function(T){return T.copy(R)},this.getViewport=function(T){return T.copy(we)},this.setViewport=function(T,z,q,j){T.isVector4?we.set(T.x,T.y,T.z,T.w):we.set(T,z,q,j),ee.viewport(R.copy(we).multiplyScalar(W).round())},this.getScissor=function(T){return T.copy(qe)},this.setScissor=function(T,z,q,j){T.isVector4?qe.set(T.x,T.y,T.z,T.w):qe.set(T,z,q,j),ee.scissor(U.copy(qe).multiplyScalar(W).round())},this.getScissorTest=function(){return at},this.setScissorTest=function(T){ee.setScissorTest(at=T)},this.setOpaqueSort=function(T){le=T},this.setTransparentSort=function(T){_e=T},this.getClearColor=function(T){return T.copy(Ve.getClearColor())},this.setClearColor=function(){Ve.setClearColor(...arguments)},this.getClearAlpha=function(){return Ve.getClearAlpha()},this.setClearAlpha=function(){Ve.setClearAlpha(...arguments)},this.clear=function(T=!0,z=!0,q=!0){let j=0;if(T){let O=!1;if(L!==null){const ce=L.texture.format;O=ce===Lc||ce===Pc||ce===Cc}if(O){const ce=L.texture.type,be=ce===On||ce===Ui||ce===ss||ce===os||ce===wc||ce===Ac,ze=Ve.getClearColor(),De=Ve.getClearAlpha(),Ze=ze.r,$e=ze.g,We=ze.b;be?(g[0]=Ze,g[1]=$e,g[2]=We,g[3]=De,A.clearBufferuiv(A.COLOR,0,g)):(x[0]=Ze,x[1]=$e,x[2]=We,x[3]=De,A.clearBufferiv(A.COLOR,0,x))}else j|=A.COLOR_BUFFER_BIT}z&&(j|=A.DEPTH_BUFFER_BIT),q&&(j|=A.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),A.clear(j)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",ve,!1),t.removeEventListener("webglcontextrestored",Ne,!1),t.removeEventListener("webglcontextcreationerror",ue,!1),Ve.dispose(),Q.dispose(),He.dispose(),xe.dispose(),gt.dispose(),_t.dispose(),B.dispose(),Ee.dispose(),Je.dispose(),$.dispose(),de.dispose(),de.removeEventListener("sessionstart",jt),de.removeEventListener("sessionend",Bi),Hn.stop()};function ve(T){T.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),w=!0}function Ne(){console.log("THREE.WebGLRenderer: Context Restored."),w=!1;const T=Pe.autoReset,z=Le.enabled,q=Le.autoUpdate,j=Le.needsUpdate,O=Le.type;N(),Pe.autoReset=T,Le.enabled=z,Le.autoUpdate=q,Le.needsUpdate=j,Le.type=O}function ue(T){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",T.statusMessage)}function te(T){const z=T.target;z.removeEventListener("dispose",te),Fe(z)}function Fe(T){Ke(T),xe.remove(T)}function Ke(T){const z=xe.get(T).programs;z!==void 0&&(z.forEach(function(q){$.releaseProgram(q)}),T.isShaderMaterial&&$.releaseShaderCache(T))}this.renderBufferDirect=function(T,z,q,j,O,ce){z===null&&(z=fe);const be=O.isMesh&&O.matrixWorld.determinant()<0,ze=vi(T,z,q,j,O);ee.setMaterial(j,be);let De=q.index,Ze=1;if(j.wireframe===!0){if(De=M.getWireframeAttribute(q),De===void 0)return;Ze=2}const $e=q.drawRange,We=q.attributes.position;let rt=$e.start*Ze,dt=($e.start+$e.count)*Ze;ce!==null&&(rt=Math.max(rt,ce.start*Ze),dt=Math.min(dt,(ce.start+ce.count)*Ze)),De!==null?(rt=Math.max(rt,0),dt=Math.min(dt,De.count)):We!=null&&(rt=Math.max(rt,0),dt=Math.min(dt,We.count));const Rt=dt-rt;if(Rt<0||Rt===1/0)return;Ee.setup(O,j,ze,q,De);let St,et=Ae;if(De!==null&&(St=P.get(De),et=je,et.setIndex(St)),O.isMesh)j.wireframe===!0?(ee.setLineWidth(j.wireframeLinewidth*ye()),et.setMode(A.LINES)):et.setMode(A.TRIANGLES);else if(O.isLine){let Xe=j.linewidth;Xe===void 0&&(Xe=1),ee.setLineWidth(Xe*ye()),O.isLineSegments?et.setMode(A.LINES):O.isLineLoop?et.setMode(A.LINE_LOOP):et.setMode(A.LINE_STRIP)}else O.isPoints?et.setMode(A.POINTS):O.isSprite&&et.setMode(A.TRIANGLES);if(O.isBatchedMesh)if(O._multiDrawInstances!==null)ls("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),et.renderMultiDrawInstances(O._multiDrawStarts,O._multiDrawCounts,O._multiDrawCount,O._multiDrawInstances);else if(Ye.get("WEBGL_multi_draw"))et.renderMultiDraw(O._multiDrawStarts,O._multiDrawCounts,O._multiDrawCount);else{const Xe=O._multiDrawStarts,Qe=O._multiDrawCounts,ut=O._multiDrawCount,$t=De?P.get(De).bytesPerElement:1,An=xe.get(j).currentProgram.getUniforms();for(let en=0;en<ut;en++)An.setValue(A,"_gl_DrawID",en),et.render(Xe[en]/$t,Qe[en])}else if(O.isInstancedMesh)et.renderInstances(rt,Rt,O.count);else if(q.isInstancedBufferGeometry){const Xe=q._maxInstanceCount!==void 0?q._maxInstanceCount:1/0,Qe=Math.min(q.instanceCount,Xe);et.renderInstances(rt,Rt,Qe)}else et.render(rt,Rt)};function vt(T,z,q){T.transparent===!0&&T.side===Ft&&T.forceSinglePass===!1?(T.side=on,T.needsUpdate=!0,Mn(T,z,q),T.side=xi,T.needsUpdate=!0,Mn(T,z,q),T.side=Ft):Mn(T,z,q)}this.compile=function(T,z,q=null){q===null&&(q=T),p=He.get(q),p.init(z),S.push(p),q.traverseVisible(function(O){O.isLight&&O.layers.test(z.layers)&&(p.pushLight(O),O.castShadow&&p.pushShadow(O))}),T!==q&&T.traverseVisible(function(O){O.isLight&&O.layers.test(z.layers)&&(p.pushLight(O),O.castShadow&&p.pushShadow(O))}),p.setupLights();const j=new Set;return T.traverse(function(O){if(!(O.isMesh||O.isPoints||O.isLine||O.isSprite))return;const ce=O.material;if(ce)if(Array.isArray(ce))for(let be=0;be<ce.length;be++){const ze=ce[be];vt(ze,q,O),j.add(ze)}else vt(ce,q,O),j.add(ce)}),p=S.pop(),j},this.compileAsync=function(T,z,q=null){const j=this.compile(T,z,q);return new Promise(O=>{function ce(){if(j.forEach(function(be){xe.get(be).currentProgram.isReady()&&j.delete(be)}),j.size===0){O(T);return}setTimeout(ce,10)}Ye.get("KHR_parallel_shader_compile")!==null?ce():setTimeout(ce,10)})};let ht=null;function yn(T){ht&&ht(T)}function jt(){Hn.stop()}function Bi(){Hn.start()}const Hn=new mh;Hn.setAnimationLoop(yn),typeof self<"u"&&Hn.setContext(self),this.setAnimationLoop=function(T){ht=T,de.setAnimationLoop(T),T===null?Hn.stop():Hn.start()},de.addEventListener("sessionstart",jt),de.addEventListener("sessionend",Bi),this.render=function(T,z){if(z!==void 0&&z.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(w===!0)return;if(T.matrixWorldAutoUpdate===!0&&T.updateMatrixWorld(),z.parent===null&&z.matrixWorldAutoUpdate===!0&&z.updateMatrixWorld(),de.enabled===!0&&de.isPresenting===!0&&(de.cameraAutoUpdate===!0&&de.updateCamera(z),z=de.getCamera()),T.isScene===!0&&T.onBeforeRender(_,T,z,L),p=He.get(T,S.length),p.init(z),S.push(p),K.multiplyMatrices(z.projectionMatrix,z.matrixWorldInverse),ne.setFromProjectionMatrix(K,zn,z.reversedDepth),Z=this.localClippingEnabled,Ie=ge.init(this.clippingPlanes,Z),m=Q.get(T,b.length),m.init(),b.push(m),de.enabled===!0&&de.isPresenting===!0){const ce=_.xr.getDepthSensingMesh();ce!==null&&ki(ce,z,-1/0,_.sortObjects)}ki(T,z,0,_.sortObjects),m.finish(),_.sortObjects===!0&&m.sort(le,_e),Ue=de.enabled===!1||de.isPresenting===!1||de.hasDepthSensing()===!1,Ue&&Ve.addToRenderList(m,T),this.info.render.frame++,Ie===!0&&ge.beginShadows();const q=p.state.shadowsArray;Le.render(q,T,z),Ie===!0&&ge.endShadows(),this.info.autoReset===!0&&this.info.reset();const j=m.opaque,O=m.transmissive;if(p.setupLights(),z.isArrayCamera){const ce=z.cameras;if(O.length>0)for(let be=0,ze=ce.length;be<ze;be++){const De=ce[be];Cr(j,O,T,De)}Ue&&Ve.render(T);for(let be=0,ze=ce.length;be<ze;be++){const De=ce[be];Vn(m,T,De,De.viewport)}}else O.length>0&&Cr(j,O,T,z),Ue&&Ve.render(T),Vn(m,T,z);L!==null&&C===0&&(Be.updateMultisampleRenderTarget(L),Be.updateRenderTargetMipmap(L)),T.isScene===!0&&T.onAfterRender(_,T,z),Ee.resetDefaultState(),v=-1,y=null,S.pop(),S.length>0?(p=S[S.length-1],Ie===!0&&ge.setGlobalState(_.clippingPlanes,p.state.camera)):p=null,b.pop(),b.length>0?m=b[b.length-1]:m=null};function ki(T,z,q,j){if(T.visible===!1)return;if(T.layers.test(z.layers)){if(T.isGroup)q=T.renderOrder;else if(T.isLOD)T.autoUpdate===!0&&T.update(z);else if(T.isLight)p.pushLight(T),T.castShadow&&p.pushShadow(T);else if(T.isSprite){if(!T.frustumCulled||ne.intersectsSprite(T)){j&&Me.setFromMatrixPosition(T.matrixWorld).applyMatrix4(K);const be=B.update(T),ze=T.material;ze.visible&&m.push(T,be,ze,q,Me.z,null)}}else if((T.isMesh||T.isLine||T.isPoints)&&(!T.frustumCulled||ne.intersectsObject(T))){const be=B.update(T),ze=T.material;if(j&&(T.boundingSphere!==void 0?(T.boundingSphere===null&&T.computeBoundingSphere(),Me.copy(T.boundingSphere.center)):(be.boundingSphere===null&&be.computeBoundingSphere(),Me.copy(be.boundingSphere.center)),Me.applyMatrix4(T.matrixWorld).applyMatrix4(K)),Array.isArray(ze)){const De=be.groups;for(let Ze=0,$e=De.length;Ze<$e;Ze++){const We=De[Ze],rt=ze[We.materialIndex];rt&&rt.visible&&m.push(T,be,rt,q,Me.z,We)}}else ze.visible&&m.push(T,be,ze,q,Me.z,null)}}const ce=T.children;for(let be=0,ze=ce.length;be<ze;be++)ki(ce[be],z,q,j)}function Vn(T,z,q,j){const O=T.opaque,ce=T.transmissive,be=T.transparent;p.setupLightsView(q),Ie===!0&&ge.setGlobalState(_.clippingPlanes,q),j&&ee.viewport(R.copy(j)),O.length>0&&ri(O,z,q),ce.length>0&&ri(ce,z,q),be.length>0&&ri(be,z,q),ee.buffers.depth.setTest(!0),ee.buffers.depth.setMask(!0),ee.buffers.color.setMask(!0),ee.setPolygonOffset(!1)}function Cr(T,z,q,j){if((q.isScene===!0?q.overrideMaterial:null)!==null)return;p.state.transmissionRenderTarget[j.id]===void 0&&(p.state.transmissionRenderTarget[j.id]=new Ni(1,1,{generateMipmaps:!0,type:Ye.has("EXT_color_buffer_half_float")||Ye.has("EXT_color_buffer_float")?ms:On,minFilter:Ii,samples:4,stencilBuffer:s,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:xt.workingColorSpace}));const ce=p.state.transmissionRenderTarget[j.id],be=j.viewport||R;ce.setSize(be.z*_.transmissionResolutionScale,be.w*_.transmissionResolutionScale);const ze=_.getRenderTarget(),De=_.getActiveCubeFace(),Ze=_.getActiveMipmapLevel();_.setRenderTarget(ce),_.getClearColor(Y),G=_.getClearAlpha(),G<1&&_.setClearColor(16777215,.5),_.clear(),Ue&&Ve.render(q);const $e=_.toneMapping;_.toneMapping=_i;const We=j.viewport;if(j.viewport!==void 0&&(j.viewport=void 0),p.setupLightsView(j),Ie===!0&&ge.setGlobalState(_.clippingPlanes,j),ri(T,q,j),Be.updateMultisampleRenderTarget(ce),Be.updateRenderTargetMipmap(ce),Ye.has("WEBGL_multisampled_render_to_texture")===!1){let rt=!1;for(let dt=0,Rt=z.length;dt<Rt;dt++){const St=z[dt],et=St.object,Xe=St.geometry,Qe=St.material,ut=St.group;if(Qe.side===Ft&&et.layers.test(j.layers)){const $t=Qe.side;Qe.side=on,Qe.needsUpdate=!0,Hi(et,q,j,Xe,Qe,ut),Qe.side=$t,Qe.needsUpdate=!0,rt=!0}}rt===!0&&(Be.updateMultisampleRenderTarget(ce),Be.updateRenderTargetMipmap(ce))}_.setRenderTarget(ze,De,Ze),_.setClearColor(Y,G),We!==void 0&&(j.viewport=We),_.toneMapping=$e}function ri(T,z,q){const j=z.isScene===!0?z.overrideMaterial:null;for(let O=0,ce=T.length;O<ce;O++){const be=T[O],ze=be.object,De=be.geometry,Ze=be.group;let $e=be.material;$e.allowOverride===!0&&j!==null&&($e=j),ze.layers.test(q.layers)&&Hi(ze,z,q,De,$e,Ze)}}function Hi(T,z,q,j,O,ce){T.onBeforeRender(_,z,q,j,O,ce),T.modelViewMatrix.multiplyMatrices(q.matrixWorldInverse,T.matrixWorld),T.normalMatrix.getNormalMatrix(T.modelViewMatrix),O.onBeforeRender(_,z,q,j,T,ce),O.transparent===!0&&O.side===Ft&&O.forceSinglePass===!1?(O.side=on,O.needsUpdate=!0,_.renderBufferDirect(q,z,j,O,T,ce),O.side=xi,O.needsUpdate=!0,_.renderBufferDirect(q,z,j,O,T,ce),O.side=Ft):_.renderBufferDirect(q,z,j,O,T,ce),T.onAfterRender(_,z,q,j,O,ce)}function Mn(T,z,q){z.isScene!==!0&&(z=fe);const j=xe.get(T),O=p.state.lights,ce=p.state.shadowsArray,be=O.state.version,ze=$.getParameters(T,O.state,ce,z,q),De=$.getProgramCacheKey(ze);let Ze=j.programs;j.environment=T.isMeshStandardMaterial?z.environment:null,j.fog=z.fog,j.envMap=(T.isMeshStandardMaterial?_t:gt).get(T.envMap||j.environment),j.envMapRotation=j.environment!==null&&T.envMap===null?z.environmentRotation:T.envMapRotation,Ze===void 0&&(T.addEventListener("dispose",te),Ze=new Map,j.programs=Ze);let $e=Ze.get(De);if($e!==void 0){if(j.currentProgram===$e&&j.lightsStateVersion===be)return Lr(T,ze),$e}else ze.uniforms=$.getUniforms(T),T.onBeforeCompile(ze,_),$e=$.acquireProgram(ze,De),Ze.set(De,$e),j.uniforms=ze.uniforms;const We=j.uniforms;return(!T.isShaderMaterial&&!T.isRawShaderMaterial||T.clipping===!0)&&(We.clippingPlanes=ge.uniform),Lr(T,ze),j.needsLights=Ir(T),j.lightsStateVersion=be,j.needsLights&&(We.ambientLightColor.value=O.state.ambient,We.lightProbe.value=O.state.probe,We.directionalLights.value=O.state.directional,We.directionalLightShadows.value=O.state.directionalShadow,We.spotLights.value=O.state.spot,We.spotLightShadows.value=O.state.spotShadow,We.rectAreaLights.value=O.state.rectArea,We.ltc_1.value=O.state.rectAreaLTC1,We.ltc_2.value=O.state.rectAreaLTC2,We.pointLights.value=O.state.point,We.pointLightShadows.value=O.state.pointShadow,We.hemisphereLights.value=O.state.hemi,We.directionalShadowMap.value=O.state.directionalShadowMap,We.directionalShadowMatrix.value=O.state.directionalShadowMatrix,We.spotShadowMap.value=O.state.spotShadowMap,We.spotLightMatrix.value=O.state.spotLightMatrix,We.spotLightMap.value=O.state.spotLightMap,We.pointShadowMap.value=O.state.pointShadowMap,We.pointShadowMatrix.value=O.state.pointShadowMatrix),j.currentProgram=$e,j.uniformsList=null,$e}function Pr(T){if(T.uniformsList===null){const z=T.currentProgram.getUniforms();T.uniformsList=so.seqWithValue(z.seq,T.uniforms)}return T.uniformsList}function Lr(T,z){const q=xe.get(T);q.outputColorSpace=z.outputColorSpace,q.batching=z.batching,q.batchingColor=z.batchingColor,q.instancing=z.instancing,q.instancingColor=z.instancingColor,q.instancingMorph=z.instancingMorph,q.skinning=z.skinning,q.morphTargets=z.morphTargets,q.morphNormals=z.morphNormals,q.morphColors=z.morphColors,q.morphTargetsCount=z.morphTargetsCount,q.numClippingPlanes=z.numClippingPlanes,q.numIntersection=z.numClipIntersection,q.vertexAlphas=z.vertexAlphas,q.vertexTangents=z.vertexTangents,q.toneMapping=z.toneMapping}function vi(T,z,q,j,O){z.isScene!==!0&&(z=fe),Be.resetTextureUnits();const ce=z.fog,be=j.isMeshStandardMaterial?z.environment:null,ze=L===null?_.outputColorSpace:L.isXRRenderTarget===!0?L.texture.colorSpace:vr,De=(j.isMeshStandardMaterial?_t:gt).get(j.envMap||be),Ze=j.vertexColors===!0&&!!q.attributes.color&&q.attributes.color.itemSize===4,$e=!!q.attributes.tangent&&(!!j.normalMap||j.anisotropy>0),We=!!q.morphAttributes.position,rt=!!q.morphAttributes.normal,dt=!!q.morphAttributes.color;let Rt=_i;j.toneMapped&&(L===null||L.isXRRenderTarget===!0)&&(Rt=_.toneMapping);const St=q.morphAttributes.position||q.morphAttributes.normal||q.morphAttributes.color,et=St!==void 0?St.length:0,Xe=xe.get(j),Qe=p.state.lights;if(Ie===!0&&(Z===!0||T!==y)){const k=T===y&&j.id===v;ge.setState(j,T,k)}let ut=!1;j.version===Xe.__version?(Xe.needsLights&&Xe.lightsStateVersion!==Qe.state.version||Xe.outputColorSpace!==ze||O.isBatchedMesh&&Xe.batching===!1||!O.isBatchedMesh&&Xe.batching===!0||O.isBatchedMesh&&Xe.batchingColor===!0&&O.colorTexture===null||O.isBatchedMesh&&Xe.batchingColor===!1&&O.colorTexture!==null||O.isInstancedMesh&&Xe.instancing===!1||!O.isInstancedMesh&&Xe.instancing===!0||O.isSkinnedMesh&&Xe.skinning===!1||!O.isSkinnedMesh&&Xe.skinning===!0||O.isInstancedMesh&&Xe.instancingColor===!0&&O.instanceColor===null||O.isInstancedMesh&&Xe.instancingColor===!1&&O.instanceColor!==null||O.isInstancedMesh&&Xe.instancingMorph===!0&&O.morphTexture===null||O.isInstancedMesh&&Xe.instancingMorph===!1&&O.morphTexture!==null||Xe.envMap!==De||j.fog===!0&&Xe.fog!==ce||Xe.numClippingPlanes!==void 0&&(Xe.numClippingPlanes!==ge.numPlanes||Xe.numIntersection!==ge.numIntersection)||Xe.vertexAlphas!==Ze||Xe.vertexTangents!==$e||Xe.morphTargets!==We||Xe.morphNormals!==rt||Xe.morphColors!==dt||Xe.toneMapping!==Rt||Xe.morphTargetsCount!==et)&&(ut=!0):(ut=!0,Xe.__version=j.version);let $t=Xe.currentProgram;ut===!0&&($t=Mn(j,z,O));let An=!1,en=!1,Ut=!1;const wt=$t.getUniforms(),cn=Xe.uniforms;if(ee.useProgram($t.program)&&(An=!0,en=!0,Ut=!0),j.id!==v&&(v=j.id,en=!0),An||y!==T){ee.buffers.depth.getReversed()&&T.reversedDepth!==!0&&(T._reversedDepth=!0,T.updateProjectionMatrix()),wt.setValue(A,"projectionMatrix",T.projectionMatrix),wt.setValue(A,"viewMatrix",T.matrixWorldInverse);const X=wt.map.cameraPosition;X!==void 0&&X.setValue(A,oe.setFromMatrixPosition(T.matrixWorld)),V.logarithmicDepthBuffer&&wt.setValue(A,"logDepthBufFC",2/(Math.log(T.far+1)/Math.LN2)),(j.isMeshPhongMaterial||j.isMeshToonMaterial||j.isMeshLambertMaterial||j.isMeshBasicMaterial||j.isMeshStandardMaterial||j.isShaderMaterial)&&wt.setValue(A,"isOrthographic",T.isOrthographicCamera===!0),y!==T&&(y=T,en=!0,Ut=!0)}if(O.isSkinnedMesh){wt.setOptional(A,O,"bindMatrix"),wt.setOptional(A,O,"bindMatrixInverse");const k=O.skeleton;k&&(k.boneTexture===null&&k.computeBoneTexture(),wt.setValue(A,"boneTexture",k.boneTexture,Be))}O.isBatchedMesh&&(wt.setOptional(A,O,"batchingTexture"),wt.setValue(A,"batchingTexture",O._matricesTexture,Be),wt.setOptional(A,O,"batchingIdTexture"),wt.setValue(A,"batchingIdTexture",O._indirectTexture,Be),wt.setOptional(A,O,"batchingColorTexture"),O._colorsTexture!==null&&wt.setValue(A,"batchingColorTexture",O._colorsTexture,Be));const D=q.morphAttributes;if((D.position!==void 0||D.normal!==void 0||D.color!==void 0)&&he.update(O,q,$t),(en||Xe.receiveShadow!==O.receiveShadow)&&(Xe.receiveShadow=O.receiveShadow,wt.setValue(A,"receiveShadow",O.receiveShadow)),j.isMeshGouraudMaterial&&j.envMap!==null&&(cn.envMap.value=De,cn.flipEnvMap.value=De.isCubeTexture&&De.isRenderTargetTexture===!1?-1:1),j.isMeshStandardMaterial&&j.envMap===null&&z.environment!==null&&(cn.envMapIntensity.value=z.environmentIntensity),en&&(wt.setValue(A,"toneMappingExposure",_.toneMappingExposure),Xe.needsLights&&Dr(cn,Ut),ce&&j.fog===!0&&ie.refreshFogUniforms(cn,ce),ie.refreshMaterialUniforms(cn,j,W,J,p.state.transmissionRenderTarget[T.id]),so.upload(A,Pr(Xe),cn,Be)),j.isShaderMaterial&&j.uniformsNeedUpdate===!0&&(so.upload(A,Pr(Xe),cn,Be),j.uniformsNeedUpdate=!1),j.isSpriteMaterial&&wt.setValue(A,"center",O.center),wt.setValue(A,"modelViewMatrix",O.modelViewMatrix),wt.setValue(A,"normalMatrix",O.normalMatrix),wt.setValue(A,"modelMatrix",O.matrixWorld),j.isShaderMaterial||j.isRawShaderMaterial){const k=j.uniformsGroups;for(let X=0,ae=k.length;X<ae;X++){const me=k[X];Je.update(me,$t),Je.bind(me,$t)}}return $t}function Dr(T,z){T.ambientLightColor.needsUpdate=z,T.lightProbe.needsUpdate=z,T.directionalLights.needsUpdate=z,T.directionalLightShadows.needsUpdate=z,T.pointLights.needsUpdate=z,T.pointLightShadows.needsUpdate=z,T.spotLights.needsUpdate=z,T.spotLightShadows.needsUpdate=z,T.rectAreaLights.needsUpdate=z,T.hemisphereLights.needsUpdate=z}function Ir(T){return T.isMeshLambertMaterial||T.isMeshToonMaterial||T.isMeshPhongMaterial||T.isMeshStandardMaterial||T.isShadowMaterial||T.isShaderMaterial&&T.lights===!0}this.getActiveCubeFace=function(){return E},this.getActiveMipmapLevel=function(){return C},this.getRenderTarget=function(){return L},this.setRenderTargetTextures=function(T,z,q){const j=xe.get(T);j.__autoAllocateDepthBuffer=T.resolveDepthBuffer===!1,j.__autoAllocateDepthBuffer===!1&&(j.__useRenderToTexture=!1),xe.get(T.texture).__webglTexture=z,xe.get(T.depthTexture).__webglTexture=j.__autoAllocateDepthBuffer?void 0:q,j.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(T,z){const q=xe.get(T);q.__webglFramebuffer=z,q.__useDefaultFramebuffer=z===void 0};const Vi=A.createFramebuffer();this.setRenderTarget=function(T,z=0,q=0){L=T,E=z,C=q;let j=!0,O=null,ce=!1,be=!1;if(T){const De=xe.get(T);if(De.__useDefaultFramebuffer!==void 0)ee.bindFramebuffer(A.FRAMEBUFFER,null),j=!1;else if(De.__webglFramebuffer===void 0)Be.setupRenderTarget(T);else if(De.__hasExternalTextures)Be.rebindTextures(T,xe.get(T.texture).__webglTexture,xe.get(T.depthTexture).__webglTexture);else if(T.depthBuffer){const We=T.depthTexture;if(De.__boundDepthTexture!==We){if(We!==null&&xe.has(We)&&(T.width!==We.image.width||T.height!==We.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");Be.setupDepthRenderbuffer(T)}}const Ze=T.texture;(Ze.isData3DTexture||Ze.isDataArrayTexture||Ze.isCompressedArrayTexture)&&(be=!0);const $e=xe.get(T).__webglFramebuffer;T.isWebGLCubeRenderTarget?(Array.isArray($e[z])?O=$e[z][q]:O=$e[z],ce=!0):T.samples>0&&Be.useMultisampledRTT(T)===!1?O=xe.get(T).__webglMultisampledFramebuffer:Array.isArray($e)?O=$e[q]:O=$e,R.copy(T.viewport),U.copy(T.scissor),F=T.scissorTest}else R.copy(we).multiplyScalar(W).floor(),U.copy(qe).multiplyScalar(W).floor(),F=at;if(q!==0&&(O=Vi),ee.bindFramebuffer(A.FRAMEBUFFER,O)&&j&&ee.drawBuffers(T,O),ee.viewport(R),ee.scissor(U),ee.setScissorTest(F),ce){const De=xe.get(T.texture);A.framebufferTexture2D(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_CUBE_MAP_POSITIVE_X+z,De.__webglTexture,q)}else if(be){const De=z;for(let Ze=0;Ze<T.textures.length;Ze++){const $e=xe.get(T.textures[Ze]);A.framebufferTextureLayer(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0+Ze,$e.__webglTexture,q,De)}}else if(T!==null&&q!==0){const De=xe.get(T.texture);A.framebufferTexture2D(A.FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,De.__webglTexture,q)}v=-1},this.readRenderTargetPixels=function(T,z,q,j,O,ce,be,ze=0){if(!(T&&T.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let De=xe.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&be!==void 0&&(De=De[be]),De){ee.bindFramebuffer(A.FRAMEBUFFER,De);try{const Ze=T.textures[ze],$e=Ze.format,We=Ze.type;if(!V.textureFormatReadable($e)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!V.textureTypeReadable(We)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}z>=0&&z<=T.width-j&&q>=0&&q<=T.height-O&&(T.textures.length>1&&A.readBuffer(A.COLOR_ATTACHMENT0+ze),A.readPixels(z,q,j,O,Ge.convert($e),Ge.convert(We),ce))}finally{const Ze=L!==null?xe.get(L).__webglFramebuffer:null;ee.bindFramebuffer(A.FRAMEBUFFER,Ze)}}},this.readRenderTargetPixelsAsync=async function(T,z,q,j,O,ce,be,ze=0){if(!(T&&T.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let De=xe.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&be!==void 0&&(De=De[be]),De)if(z>=0&&z<=T.width-j&&q>=0&&q<=T.height-O){ee.bindFramebuffer(A.FRAMEBUFFER,De);const Ze=T.textures[ze],$e=Ze.format,We=Ze.type;if(!V.textureFormatReadable($e))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!V.textureTypeReadable(We))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const rt=A.createBuffer();A.bindBuffer(A.PIXEL_PACK_BUFFER,rt),A.bufferData(A.PIXEL_PACK_BUFFER,ce.byteLength,A.STREAM_READ),T.textures.length>1&&A.readBuffer(A.COLOR_ATTACHMENT0+ze),A.readPixels(z,q,j,O,Ge.convert($e),Ge.convert(We),0);const dt=L!==null?xe.get(L).__webglFramebuffer:null;ee.bindFramebuffer(A.FRAMEBUFFER,dt);const Rt=A.fenceSync(A.SYNC_GPU_COMMANDS_COMPLETE,0);return A.flush(),await Rd(A,Rt,4),A.bindBuffer(A.PIXEL_PACK_BUFFER,rt),A.getBufferSubData(A.PIXEL_PACK_BUFFER,0,ce),A.deleteBuffer(rt),A.deleteSync(Rt),ce}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(T,z=null,q=0){const j=Math.pow(2,-q),O=Math.floor(T.image.width*j),ce=Math.floor(T.image.height*j),be=z!==null?z.x:0,ze=z!==null?z.y:0;Be.setTexture2D(T,0),A.copyTexSubImage2D(A.TEXTURE_2D,q,0,0,be,ze,O,ce),ee.unbindTexture()};const si=A.createFramebuffer(),Ur=A.createFramebuffer();this.copyTextureToTexture=function(T,z,q=null,j=null,O=0,ce=null){ce===null&&(O!==0?(ls("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),ce=O,O=0):ce=0);let be,ze,De,Ze,$e,We,rt,dt,Rt;const St=T.isCompressedTexture?T.mipmaps[ce]:T.image;if(q!==null)be=q.max.x-q.min.x,ze=q.max.y-q.min.y,De=q.isBox3?q.max.z-q.min.z:1,Ze=q.min.x,$e=q.min.y,We=q.isBox3?q.min.z:0;else{const D=Math.pow(2,-O);be=Math.floor(St.width*D),ze=Math.floor(St.height*D),T.isDataArrayTexture?De=St.depth:T.isData3DTexture?De=Math.floor(St.depth*D):De=1,Ze=0,$e=0,We=0}j!==null?(rt=j.x,dt=j.y,Rt=j.z):(rt=0,dt=0,Rt=0);const et=Ge.convert(z.format),Xe=Ge.convert(z.type);let Qe;z.isData3DTexture?(Be.setTexture3D(z,0),Qe=A.TEXTURE_3D):z.isDataArrayTexture||z.isCompressedArrayTexture?(Be.setTexture2DArray(z,0),Qe=A.TEXTURE_2D_ARRAY):(Be.setTexture2D(z,0),Qe=A.TEXTURE_2D),A.pixelStorei(A.UNPACK_FLIP_Y_WEBGL,z.flipY),A.pixelStorei(A.UNPACK_PREMULTIPLY_ALPHA_WEBGL,z.premultiplyAlpha),A.pixelStorei(A.UNPACK_ALIGNMENT,z.unpackAlignment);const ut=A.getParameter(A.UNPACK_ROW_LENGTH),$t=A.getParameter(A.UNPACK_IMAGE_HEIGHT),An=A.getParameter(A.UNPACK_SKIP_PIXELS),en=A.getParameter(A.UNPACK_SKIP_ROWS),Ut=A.getParameter(A.UNPACK_SKIP_IMAGES);A.pixelStorei(A.UNPACK_ROW_LENGTH,St.width),A.pixelStorei(A.UNPACK_IMAGE_HEIGHT,St.height),A.pixelStorei(A.UNPACK_SKIP_PIXELS,Ze),A.pixelStorei(A.UNPACK_SKIP_ROWS,$e),A.pixelStorei(A.UNPACK_SKIP_IMAGES,We);const wt=T.isDataArrayTexture||T.isData3DTexture,cn=z.isDataArrayTexture||z.isData3DTexture;if(T.isDepthTexture){const D=xe.get(T),k=xe.get(z),X=xe.get(D.__renderTarget),ae=xe.get(k.__renderTarget);ee.bindFramebuffer(A.READ_FRAMEBUFFER,X.__webglFramebuffer),ee.bindFramebuffer(A.DRAW_FRAMEBUFFER,ae.__webglFramebuffer);for(let me=0;me<De;me++)wt&&(A.framebufferTextureLayer(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,xe.get(T).__webglTexture,O,We+me),A.framebufferTextureLayer(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,xe.get(z).__webglTexture,ce,Rt+me)),A.blitFramebuffer(Ze,$e,be,ze,rt,dt,be,ze,A.DEPTH_BUFFER_BIT,A.NEAREST);ee.bindFramebuffer(A.READ_FRAMEBUFFER,null),ee.bindFramebuffer(A.DRAW_FRAMEBUFFER,null)}else if(O!==0||T.isRenderTargetTexture||xe.has(T)){const D=xe.get(T),k=xe.get(z);ee.bindFramebuffer(A.READ_FRAMEBUFFER,si),ee.bindFramebuffer(A.DRAW_FRAMEBUFFER,Ur);for(let X=0;X<De;X++)wt?A.framebufferTextureLayer(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,D.__webglTexture,O,We+X):A.framebufferTexture2D(A.READ_FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,D.__webglTexture,O),cn?A.framebufferTextureLayer(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,k.__webglTexture,ce,Rt+X):A.framebufferTexture2D(A.DRAW_FRAMEBUFFER,A.COLOR_ATTACHMENT0,A.TEXTURE_2D,k.__webglTexture,ce),O!==0?A.blitFramebuffer(Ze,$e,be,ze,rt,dt,be,ze,A.COLOR_BUFFER_BIT,A.NEAREST):cn?A.copyTexSubImage3D(Qe,ce,rt,dt,Rt+X,Ze,$e,be,ze):A.copyTexSubImage2D(Qe,ce,rt,dt,Ze,$e,be,ze);ee.bindFramebuffer(A.READ_FRAMEBUFFER,null),ee.bindFramebuffer(A.DRAW_FRAMEBUFFER,null)}else cn?T.isDataTexture||T.isData3DTexture?A.texSubImage3D(Qe,ce,rt,dt,Rt,be,ze,De,et,Xe,St.data):z.isCompressedArrayTexture?A.compressedTexSubImage3D(Qe,ce,rt,dt,Rt,be,ze,De,et,St.data):A.texSubImage3D(Qe,ce,rt,dt,Rt,be,ze,De,et,Xe,St):T.isDataTexture?A.texSubImage2D(A.TEXTURE_2D,ce,rt,dt,be,ze,et,Xe,St.data):T.isCompressedTexture?A.compressedTexSubImage2D(A.TEXTURE_2D,ce,rt,dt,St.width,St.height,et,St.data):A.texSubImage2D(A.TEXTURE_2D,ce,rt,dt,be,ze,et,Xe,St);A.pixelStorei(A.UNPACK_ROW_LENGTH,ut),A.pixelStorei(A.UNPACK_IMAGE_HEIGHT,$t),A.pixelStorei(A.UNPACK_SKIP_PIXELS,An),A.pixelStorei(A.UNPACK_SKIP_ROWS,en),A.pixelStorei(A.UNPACK_SKIP_IMAGES,Ut),ce===0&&z.generateMipmaps&&A.generateMipmap(Qe),ee.unbindTexture()},this.initRenderTarget=function(T){xe.get(T).__webglFramebuffer===void 0&&Be.setupRenderTarget(T)},this.initTexture=function(T){T.isCubeTexture?Be.setTextureCube(T,0):T.isData3DTexture?Be.setTexture3D(T,0):T.isDataArrayTexture||T.isCompressedArrayTexture?Be.setTexture2DArray(T,0):Be.setTexture2D(T,0),ee.unbindTexture()},this.resetState=function(){E=0,C=0,L=null,ee.reset(),Ee.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return zn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=xt._getDrawingBufferColorSpace(e),t.unpackColorSpace=xt._getUnpackColorSpace()}}function mo(n,e=!1){const t=n[0].index!==null,i=new Set(Object.keys(n[0].attributes)),r=new Set(Object.keys(n[0].morphAttributes)),s={},o={},c=n[0].morphTargetsRelative,l=new qt;let a=0;for(let u=0;u<n.length;++u){const h=n[u];let d=0;if(t!==(h.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(const f in h.attributes){if(!i.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+'. All geometries must have compatible attributes; make sure "'+f+'" attribute exists among all geometries, or in none of them.'),null;s[f]===void 0&&(s[f]=[]),s[f].push(h.attributes[f]),d++}if(d!==i.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". Make sure all geometries have the same number of attributes."),null;if(c!==h.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(const f in h.morphAttributes){if(!r.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+".  .morphAttributes must be consistent throughout all geometries."),null;o[f]===void 0&&(o[f]=[]),o[f].push(h.morphAttributes[f])}if(e){let f;if(t)f=h.index.count;else if(h.attributes.position!==void 0)f=h.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". The geometry must have either an index or a position attribute"),null;l.addGroup(a,f,u),a+=f}}if(t){let u=0;const h=[];for(let d=0;d<n.length;++d){const f=n[d].index;for(let g=0;g<f.count;++g)h.push(f.getX(g)+u);u+=n[d].attributes.position.count}l.setIndex(h)}for(const u in s){const h=fu(s[u]);if(!h)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+u+" attribute."),null;l.setAttribute(u,h)}for(const u in o){const h=o[u][0].length;if(h===0)break;l.morphAttributes=l.morphAttributes||{},l.morphAttributes[u]=[];for(let d=0;d<h;++d){const f=[];for(let x=0;x<o[u].length;++x)f.push(o[u][x][d]);const g=fu(f);if(!g)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+u+" morphAttribute."),null;l.morphAttributes[u].push(g)}}return l}function fu(n){let e,t,i,r=-1,s=0;for(let a=0;a<n.length;++a){const u=n[a];if(e===void 0&&(e=u.array.constructor),e!==u.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(t===void 0&&(t=u.itemSize),t!==u.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(i===void 0&&(i=u.normalized),i!==u.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(r===-1&&(r=u.gpuType),r!==u.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;s+=u.count*t}const o=new e(s),c=new vn(o,t,i);let l=0;for(let a=0;a<n.length;++a){const u=n[a];if(u.isInterleavedBufferAttribute){const h=l/t;for(let d=0,f=u.count;d<f;d++)for(let g=0;g<t;g++){const x=u.getComponent(d,g);c.setComponent(d+h,g,x)}}else o.set(u.array,l);l+=u.count*t}return r!==void 0&&(c.gpuType=r),c}const go=(n,e,t)=>Math.max(e,Math.min(t,n)),pu=n=>n*n*(3-2*n);function jr(n,e){const t=pu(go((Math.abs(n)-5)/28,0,1)),i=4.3+Math.sin(e*.065+n*.07)*1.65+Math.sin(e*.13-n*.12)*.85,r=Math.exp(-((n+15)**2/100+(e-9)**2/330))*1.3,s=Math.exp(-((n-29)**2/210+(e+6)**2/900))*2.5,o=Math.exp(-((n+28)**2/100+(e-6)**2/500))*.8,c=pu(go((-e-30)/14,0,1))*(1.5+Math.sin(n*.085)*.45);return Math.max(0,(i+r+s-o)*t+c)}function ft(n,e){const t=go((n+80)/2.5,0,63.999999999),i=go((e+100)/2.5,0,80-1e-9),r=Math.floor(t),s=Math.floor(i),o=t-r,c=i-s,l=-80+r*2.5,a=-100+s*2.5,u=jr(l,a),h=jr(l+2.5,a),d=jr(l,a+2.5),f=jr(l+2.5,a+2.5);return o+c<=1?u+(h-u)*o+(d-u)*c:f+(d-f)*(1-o)+(h-f)*(1-c)}function mu(n){return{width:n.w,depth:n.d,height:.56}}const _o=(n,e,t)=>Math.max(e,Math.min(t,n));function Vc(n){if(n.mode!=="playing"||n.routePhase!=="branch"||!vc(n.routeChoice)||n.player.z<nt.rejoinZ-.25||Math.abs(n.player.x)>6.5)return!1;const e=n.enemies.find(t=>t.id===nt[n.routeChoice].enemyId);return(e==null?void 0:e.hp)<=0&&n.player.z<=nt.obstacleBackZ+1.4}const Gc=n=>n.mode==="playing"&&n.pathCleared&&n.routePhase==="rejoined"&&!n.signalLit&&Math.hypot(n.player.x-Nt.x,n.player.z-Nt.z)<=7.5;function R_(n,e,t){const i=n.player,r=e<.8,s=e>1.9;return t.x=Nt.x+(r?4:4.8),t.y=r?3.15:3.35,t.z=Nt.z+(r?6.25:6.5),t.lookX=(i.x+Nt.x)*.5-(s?1.15:r?0:.7),t.lookY=1.55,t.lookZ=(i.z+Nt.z)*.5-.25,t}function C_(n,e,t){const i=e.x-n.x,r=e.z-n.z,s=Math.hypot(i,r);if(s<.001)return 1;const o=t.x-n.x,c=t.z-n.z,l=Math.hypot(o,c),a=(o*i+c*r)/s,u=Math.abs(o*r-c*i)/s;return l<=4.6&&a>.15&&a<s+1.5&&u<=2.65?.16:1}function P_(n,e,t,i){const r=n.player,s=ft(r.x,r.z);if(n.mode==="victory"||Gc(n))return R_(n,t,i);if(Vc(n))return i.x=0,i.y=11.5,i.z=-7,i.lookX=0,i.lookY=.8,i.lookZ=nt.rejoinZ,i;const o=n.enemies.find(a=>a.id===n.locked&&a.hp>0);if(o){const a=o.x-r.x,u=o.z-r.z,h=Math.max(.001,Math.hypot(a,u)),d=h>.05?a/h:Math.sin(r.yaw??e),f=h>.05?u/h:-Math.cos(r.yaw??e),g=t<.8,x=_o((5-h)/3,0,1),m=g?6.5-x*2.7:5.8-x*1.8,p=g?1.25+x*1.45:_o(1.55+t*.28,1.75,2.15)+x*1.95,b=Math.min(2.35,h*.38);return i.x=r.x-d*m+f*p,i.y=s+(r.hp>0?3:2.5),i.z=r.z-f*m-d*p,i.lookX=r.x+d*b,i.lookY=s+1.25,i.lookZ=r.z+f*b,i}const c=Math.cos(e),l=Math.sin(e);return i.x=r.x+.85*c+5.8*l,i.y=s+(r.hp>0?0:-.3)+2.8,i.z=r.z-.85*l+5.8*c,i.lookX=r.x,i.lookY=s+1.25,i.lookZ=r.z-.6,i}function L_(n,e){if(!e||n.mode==="victory"||Gc(n)||Vc(n))return null;const t=n.player;return{x:t.x-e.x,y:ft(t.x,t.z)-ft(e.x,e.z),z:t.z-e.z}}function D_(n,e,t,i,r=null){if(!i)return Object.assign(n,e);if(r)for(const[L,v,y]of[["x","lookX","x"],["y","lookY","y"],["z","lookZ","z"]])n[L]+=r[y],n[v]+=r[y];const s=n.x,o=n.z,c=Math.max(0,Math.min(t,.1)),l=1-Math.exp(-c*8),a=(L,v,y)=>L+_o((v-L)*l,-y,y),u=Math.hypot(n.x-n.lookX,n.z-n.lookZ),h=Math.hypot(e.x-e.lookX,e.z-e.lookZ),d=Math.atan2(n.x-n.lookX,n.z-n.lookZ),f=Math.atan2(e.x-e.lookX,e.z-e.lookZ),g=Math.atan2(Math.sin(f-d),Math.cos(f-d)),x=d+_o(g*l,-1.5*c,1.5*c),m=a(u,h,3*c);for(const L of["lookX","lookY","lookZ"])n[L]=a(n[L],e[L],5*c);n.y=a(n.y,e.y,4*c);const p=n.lookX+Math.sin(x)*m,b=n.lookZ+Math.cos(x)*m,S=p-s,_=b-o,w=Math.hypot(S,_),E=7*c,C=w>E&&w>0?E/w:1;return n.x=s+S*C,n.z=o+_*C,n}function gu(n){return n.index||n.setIndex(Array.from({length:n.getAttribute("position").count},(e,t)=>t)),n}const yh=(n,e)=>`${Math.floor(n/16)},${Math.floor(e/16)}`;function I_(n){const e=new Map,t=new mt,i=new ct;for(let r=0;r<n.count;r++){n.getMatrixAt(r,t);const s=yh(t.elements[12],t.elements[14]);e.has(s)||e.set(s,[]),e.get(s).push(r)}return[...e.values()].map(r=>{const s=new lc(n.geometry,n.material,r.length);return s.castShadow=n.castShadow,s.receiveShadow=n.receiveShadow,r.forEach((o,c)=>{n.getMatrixAt(o,t),s.setMatrixAt(c,t),n.instanceColor&&(n.getColorAt(o,i),s.setColorAt(c,i))}),s.instanceMatrix.needsUpdate=!0,s.instanceColor&&(s.instanceColor.needsUpdate=!0),s.computeBoundingSphere(),s.boundingSphere.radius+=.3,s})}const Wc=(n,e,t)=>Math.max(e,Math.min(t,n));function U_(){return{value:0,world:null,lastWorldTime:0}}function N_(n,e,t,i=!0){const r=n.world!==e||e.time<n.lastWorldTime;return r&&(n.value=e.time),n.world=e,n.lastWorldTime=e.time,i&&(n.value+=Wc(t,0,.1)),r}function F_(n){const e=Wc(n/.72,0,1),t=e*e*(3-2*e),i=.96+.019*Math.sin(n*7.13)+.012*Math.sin(n*11.71+.6)+.008*Math.sin(n*3.17);return{light:Math.min(3.2,3.2*t*i),emissive:.36*t*i,opacity:.08*t*i,scale:1.9*(.87+.13*t)+.018*t*Math.sin(n*5.23)}}function fs(n,e,t){const i=t-n*.055-e*.034,r=.5+.5*Math.sin(i*.39+Math.sin(i*.17)*.7),s=.48+r*r*.85+.12*Math.sin(i*1.13+n*.019-e*.027),o=.44+.18*Math.sin(i*.23)+.07*Math.sin(i*.61);return{x:Math.cos(o)*s,z:Math.sin(o)*s,pressure:s}}function z_(n,e,t,i=0,r=0){const s=Wc(-e/1.6,0,1),o=fs(i,r,t-s*.23);return{x:o.x*.09*s*s,y:-.014*s*s,z:s*s*(o.z*.3+Math.sin(t*2.3-s*5+n*2)*.065*o.pressure)}}const O_=`
uniform float windTime;
vec3 valleyWind(vec2 p,float time){
  float t=time-p.x*.055-p.y*.034;
  float swell=.5+.5*sin(t*.39+sin(t*.17)*.7);
  float pressure=.48+swell*swell*.85+.12*sin(t*1.13+p.x*.019-p.y*.027);
  float direction=.44+.18*sin(t*.23)+.07*sin(t*.61);
  return vec3(cos(direction)*pressure,sin(direction)*pressure,pressure);
}
vec3 stemWind(vec3 p,vec4 root){
  float h=max(0.,p.y-root.y),u=clamp(h/root.w,0.,1.);
  vec3 w=valleyWind(root.xz,windTime-u*.32);
  vec2 d=w.xy*(root.w*.042*u*u);
  return p+vec3(d.x,-dot(d,d)/max(.2,2.*h),d.y);
}`,B_="attribute vec4 windRoot; attribute vec4 windBranch; attribute vec4 windLeaf;",k_=`
  vec3 branchWind=valleyWind(windRoot.xz,windTime-.35);
  float reach=length(position.xz-windBranch.xz);
  float branchFlex=reach*reach*windBranch.w;
  transformed+=vec3(branchWind.x*.035,-branchWind.z*.028,branchWind.y*.035)*branchFlex;
  float flutter=sin(windTime*3.3-windLeaf.x*.51-windLeaf.z*.37)*windLeaf.w;
  transformed.y+=flutter*.025*branchWind.z;
  transformed=stemWind(transformed,windRoot);`,H_=`
  float loose=clamp(-position.y/1.6,0.,1.);
  vec3 w=valleyWind(modelMatrix[3].xz,windTime-loose*.23);
  transformed.x+=w.x*.09*loose*loose;
  transformed.y-=.014*loose*loose;
  transformed.z+=loose*loose*(w.y*.3+sin(windTime*2.3-loose*5.+position.x*2.)*.065*w.z);`,V_=`
  vec3 w=valleyWind(instanceMatrix[3].xz,windTime-position.y*.2);
  float height=max(0.,position.y);
  vec2 d=w.xy*.16*height*height;
  vec2 axisX=normalize(vec2(instanceMatrix[0].x,instanceMatrix[0].z));
  vec2 axisZ=normalize(vec2(instanceMatrix[2].x,instanceMatrix[2].z));
  transformed.x+=dot(d,axisX);transformed.z+=dot(d,axisZ);
  transformed.y-=dot(d,d)/max(.2,height*2.);`;function di(n,e,t="vegetation"){return n.onBeforeCompile=i=>{i.uniforms.windTime=e,i.vertexShader=O_+`
`+(t==="vegetation"?B_:"")+`
`+i.vertexShader,i.vertexShader=i.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
`+(t==="cloth"?H_:t==="grass"?V_:k_))},n.customProgramCacheKey=()=>`valley-wind-v2-${t}`,n}const Gt=Object.freeze({thigh:.43,shin:.43,sole:.09,upperArm:.32,forearm:.3,hipWidth:.15}),_u={player:{cloth:"#365a70",shadow:"#243b4a",armor:"#27373b",trim:"#b9bbab",cord:"#aaa581",skin:"#bd9c81"},sentinel:{cloth:"#774934",shadow:"#472b25",armor:"#42382d",trim:"#bb9868",cord:"#b99d73",skin:"#b79577"},retainer:{cloth:"#656253",shadow:"#373e39",armor:"#313a39",trim:"#b8ad83",cord:"#9eaa96",skin:"#af9076"},warden:{cloth:"#724640",shadow:"#412c2d",armor:"#303439",trim:"#bba071",cord:"#bba07b",skin:"#b49176"}};function Mh(){const e=new Uint8Array(16384);for(let s=0;s<64;s++)for(let o=0;o<64;o++){const c=(s*64+o)*4,l=135+(o%4<2?17:-17)+(s%4<2?11:-11)+(o*13+s*7)%9;e[c]=e[c+1]=e[c+2]=l,e[c+3]=255}const t=new nh(e,64,64,Tn);t.wrapS=t.wrapT=rs,t.repeat.set(3,3),t.needsUpdate=!0;const i=new Map;function r(s,o=.8,c=0,l=!1){const a=[s,o,c,l].join(":");return i.has(a)||i.set(a,new dc({color:s,roughness:o,metalness:c,...l?{bumpMap:t,bumpScale:.012}:{}})),i.get(a)}return{material:r,weave:t}}function G_(n,e=Mh()){const t=_u[n]||_u.sentinel,i=e.material,r=i(t.cloth,.9,0,!0),s=i(t.shadow,.95,0,!0),o=i(t.armor,.53,.22),c=i(t.trim,.64,.15),l=i(t.cord,.87),a=i(t.skin,.88),u=i("#191f23",.88),h=i("#22221f",.96),d=i("#74534a",.94),f=i("#1c1c19",.73),g=i("#c4bba6",.9),x=i(n==="player"?"#e7f4f4":"#ffe0a6",.2,.85),m=i("#eff4e5",.13,.92),p=i("#b7955b",.34,.7);x.emissive.set(n==="player"?"#7397a1":"#a64b24"),x.emissiveIntensity=n==="player"?.13:.24;const b=new Dt;b.name=`actor-${n}`;const S=new Dt;S.name="pelvis",S.position.y=.92,b.add(S);const _=new Dt;_.name="ribcage",_.position.y=.26,S.add(_);const w=new Dt;w.name="neck",w.position.y=.37,_.add(w);const E=new Map;let C=0;function L(ne,Ie,Z,K=0,oe=0,Me=0,fe=1,Ue=1,ye=1,A=0,Oe=0,Ye=0){const V=new mt().compose(new I(K,oe,Me),new Vt().setFromEuler(new an(A,Oe,Ye)),new I(fe,Ue,ye));Ie.applyMatrix4(V);let ee=Ie.index?Ie.toNonIndexed():Ie;ee!==Ie&&Ie.dispose(),E.has(ne)||E.set(ne,new Map);const Pe=E.get(ne);Pe.has(Z)||Pe.set(Z,[]),Pe.get(Z).push(ee),C++}const v=(ne,Ie,Z,K,oe,Me,fe,Ue,ye=0,A=0,Oe=0)=>L(ne,new ni(Me,fe,Ue),Ie,Z,K,oe,1,1,1,ye,A,Oe),y=(ne,Ie,Z,K,oe,Me,fe,Ue)=>L(ne,new mr(1,12,9),Ie,Z,K,oe,Me,fe,Ue),R=(ne,Ie,Z,K,oe,Me,fe,Ue,ye=0,A=0,Oe=0)=>L(ne,new Bt(Me,fe,Ue,10),Ie,Z,K,oe,1,1,1,ye,A,Oe);L(_,new Bt(.235,.265,.43,14),r,0,0,0,1,1,.72),y(_,s,0,-.16,.005,.247,.14,.167),v(_,o,0,.025,-.142,.385,.275,.075);for(let ne=0;ne<4;ne++){v(_,o,0,.145-ne*.065,-.19,.36-ne*.012,.043,.027);for(const Ie of[-1,1])R(_,l,Ie*.117,.145-ne*.065,-.212,.008,.008,.037,0,0,.45*Ie)}for(const ne of[-1,1])v(_,g,ne*.061,.178,-.161,.061,.29,.031,0,0,ne*.38),v(_,c,ne*.093,.17,-.18,.018,.28,.021,0,0,ne*.38),v(_,s,ne*.188,-.032,.117,.014,.34,.018,0,0,-ne*.12);L(S,new Bt(.255,.27,.135,14),s,0,.045,0,1,1,.76),L(S,new Bt(.271,.275,.065,14),c,0,.043,0,1,1,.78);for(const ne of[-1,1])v(S,l,ne*.065,.055,-.226,.13,.033,.035,0,0,ne*.18);y(S,l,0,.056,-.236,.039,.027,.032),R(w,a,0,.022,0,.065,.076,.12),y(w,a,0,.13,-.008,.124,.158,.116),y(w,a,0,.058,-.04,.095,.074,.079);for(const ne of[-1,1])y(w,a,ne*.073,.108,-.078,.048,.055,.045),y(w,a,ne*.12,.126,0,.025,.041,.02),y(w,d,ne*.132,.126,-.004,.006,.021,.012),v(w,f,ne*.049,.159,-.11,.038,.009,.01,0,0,ne*.07),v(w,a,ne*.049,.165,-.112,.043,.008,.012,0,0,ne*.07),v(w,h,ne*.05,.18,-.107,.048,.01,.012,0,0,-ne*.13);y(w,a,0,.122,-.121,.019,.043,.025),v(w,d,0,.077,-.11,.05,.006,.008),L(w,new mr(.127,14,10,0,Math.PI*2,0,Math.PI*.58),h,0,.171,.003,1,1.03,.98);for(const ne of[-1,1])y(w,h,ne*.1,.19,.033,.035,.073,.06);y(w,h,0,.263,.051,.054,.047,.061),L(w,new Sr(.128,.012,5,20),c,0,.186,0,1,.92,1,Math.PI/2);for(let ne=-1;ne<=1;ne++)v(w,u,ne*.036,.25,.083,.014,.012,.09,-.15,0,ne*.09);n==="warden"&&(L(w,new mr(.139,14,8,0,Math.PI*2,0,Math.PI*.48),o,0,.185,.01,1,1,.99),v(w,p,0,.284,-.051,.037,.085,.025,0,0,-.16),v(w,o,0,.061,-.102,.135,.075,.04));const U=[],F=[],Y=[];for(const ne of[-1,1]){const Ie=new Dt;Ie.name=ne<0?"left-hip":"right-hip",Ie.position.set(ne*Gt.hipWidth,0,0),S.add(Ie),L(Ie,new Bt(.132,.105,Gt.thigh,12),s,0,-.205,0,1,1,1.03);for(let ye=-1;ye<=1;ye++)v(Ie,r,ye*.06,-.23,-.114,.012,.34,.017,0,0,ye*.07);const Z=new Dt;Z.name="knee",Z.position.y=-Gt.thigh,Ie.add(Z),y(Z,s,0,.007,-.007,.104,.095,.104),R(Z,u,0,-.205,0,.086,.066,.37),v(Z,o,0,-.19,-.071,.108,.26,.042);for(let ye=0;ye<3;ye++)R(Z,l,0,-.07-ye*.112,0,.09-ye*.006,.09-ye*.006,.025);const K=new Dt;K.name="ankle",K.position.y=-Gt.shin,Z.add(K),y(K,g,0,-.031,-.05,.075,.05,.143),v(K,l,0,-.071,-.052,.163,.028,.305),v(K,u,0,-.085,-.052,.17,.009,.31);for(const ye of[-1,1])v(K,u,ye*.027,-.002,-.09,.028,.018,.15,-.11,ye*.45);v(K,u,0,-.023,-.186,.005,.044,.034);const oe=new Dt;oe.name=ne<0?"left-shoulder":"right-shoulder",oe.position.set(ne*.265,.2,0),_.add(oe),L(oe,new Bt(.115,.096,Gt.upperArm,12),r,0,-.15,0);for(let ye=0;ye<3;ye++)v(oe,o,ne*.068,-.005-ye*.044,0,.165,.044,.24,0,0,-ne*.09);v(oe,c,ne*.077,.019,0,.17,.017,.24,0,0,-ne*.09);const Me=new Dt;Me.name="elbow",Me.position.y=-Gt.upperArm,oe.add(Me),y(Me,s,0,0,0,.078,.075,.075),R(Me,a,0,-.115,0,.073,.054,.24),R(Me,s,0,-.114,0,.078,.068,.18),v(Me,o,0,-.127,-.063,.087,.155,.032);for(let ye=0;ye<3;ye++)R(Me,l,0,-.066-ye*.047,0,.078-ye*.004,.078-ye*.004,.015);const fe=new Dt;fe.name="wrist",fe.position.y=-Gt.forearm,Me.add(fe),y(fe,a,0,0,0,.05,.064,.038);for(let ye=0;ye<4;ye++)y(fe,a,(ye-1.5)*.021,-.018,-.025,.013,.031,.016);y(fe,a,ne*.049,.018,-.017,.019,.034,.022),U.push({side:ne,hip:Ie,knee:Z,ankle:K,arm:oe,elbow:Me,wrist:fe,hand:fe});for(const ye of[-1,1]){const A=new Dt;A.name=ye<0?"hakama-front":"hakama-back",A.position.set(ne*.13,-.045,ye*.135),S.add(A),v(A,ye<0?s:r,0,-.235,0,.232,.47,.033,0,0,-ne*.025);for(let Oe=-1;Oe<=1;Oe++)v(A,ye<0?r:s,Oe*.065,-.238,ye*.021,.01,.434,.008,0,0,Oe*.023);v(A,c,0,-.462,0,.225,.013,.036),F.push({node:A,side:ne,front:ye})}const Ue=new Dt;Ue.name="headband-tail",Ue.position.set(ne*.054,.177,.115),w.add(Ue),v(Ue,c,0,-.108,.022,.027,.22,.008,-.17,0,ne*.14),Y.push(Ue)}const G=new Dt;G.name="sash-tail",G.position.set(-.19,.03,.16),S.add(G),v(G,l,0,-.14,.011,.063,.29,.012,-.11,0,.1),Y.push(G);const H=new Dt;H.name="scabbard",H.position.set(-.225,.04,.045),H.rotation.set(1.76,0,-.11),S.add(H),R(H,u,0,.525,0,.035,.044,1.05),R(H,p,0,.018,0,.049,.049,.047),R(H,p,0,1.035,0,.04,.035,.052);for(let ne=0;ne<2;ne++)R(H,l,0,.17+ne*.12,0,.043,.044,.033);const J=new Dt;J.name="katana",b.add(J),R(J,u,0,-.046,0,.028,.033,.245);for(let ne=0;ne<7;ne++)v(J,l,0,-.146+ne*.032,-.029,.038,.012,.006,0,0,ne%2?.65:-.65),v(J,l,0,-.146+ne*.032,.029,.038,.012,.006,0,0,ne%2?-.65:.65);R(J,p,0,.087,0,.067,.067,.019),R(J,p,0,.109,0,.032,.03,.036);const W=new Dt;W.name="curved-blade",J.add(W);function le(ne,Ie,Z){const K=[];for(let Me=0;Me<15;Me++){const fe=Me/15,Ue=(Me+1)/15,ye=Oe=>.045*Oe*Oe,A=Oe=>Oe>.86?(1-Oe)/.14:1;for(const Oe of[-1,1]){const Ye=[[ye(fe)+ne*A(fe),.128+fe*.96,Oe*.01],[ye(fe)+Ie*A(fe),.128+fe*.96,Oe*.007],[ye(Ue)+Ie*A(Ue),.128+Ue*.96,Oe*.007],[ye(Ue)+ne*A(Ue),.128+Ue*.96,Oe*.01]];for(const V of Oe===1?[0,1,2,0,2,3]:[2,1,0,3,2,0])K.push(...Ye[V])}}const oe=new qt;oe.setAttribute("position",new ot(K,3)),oe.computeVertexNormals(),L(W,oe,Z)}le(-.025,.017,x),le(.017,.029,m);const _e=new pt(new vo(.46,20),new _s({color:"#0b1011",transparent:!0,opacity:.24,depthWrite:!1}));_e.rotation.x=-Math.PI/2,_e.position.y=.012,b.add(_e);const we=new pt(new Sr(.5,.013,5,32),p);we.rotation.x=Math.PI/2,we.position.y=.028,we.visible=!1,b.add(we);const qe=new pt(new Oc(.065),p);qe.position.y=2.04,qe.visible=!1,b.add(qe);for(const[ne,Ie]of E)for(const[Z,K]of Ie){const oe=mo(K,!1);K.forEach(A=>A.dispose());const Me=oe.getAttribute("position"),fe=new Set,Ue=[];for(let A=0;A<Me.count;A++){const Oe=Me.getX(A),Ye=Me.getY(A),V=Me.getZ(A),ee=`${Oe},${Ye},${V}`;fe.has(ee)||(fe.add(ee),Ue.push(Oe,Ye,V))}oe.userData.contactPositions=new Float32Array(Ue);const ye=new pt(oe,Z);ye.castShadow=ye.receiveShadow=!0,ne.add(ye)}let at=0;return b.traverse(ne=>{ne.isMesh&&at++}),{id:n,root:b,body:S,chest:_,neck:w,limbs:U,panels:F,ties:Y,sword:J,blade:W,scabbard:H,ring:we,signal:qe,contact:_e,metrics:{generatedParts:C,drawMeshes:at,articulatedJoints:24,externalRuntimeAssets:0},motion:null}}const wi=Object.freeze({stepDistance:.72,stanceFraction:.6,runStepDistance:1.12,runStanceFraction:.4,walkSpeed:1.8,runSpeed:3.8}),W_=Object.freeze({activeStart:.18,activeEnd:.34,end:.65}),Zt=(n,e=0,t=1)=>Math.max(e,Math.min(t,n)),hn=(n,e,t)=>n+(e-n)*t,gn=n=>(n=Zt(n),n*n*(3-2*n)),js=n=>Math.atan2(Math.sin(n),Math.cos(n)),X_=()=>0,xu=new I(0,-1,0),Xc=new I(0,1,0);function qc(n=0){const e=gn((Math.max(0,n)-wi.walkSpeed)/(wi.runSpeed-wi.walkSpeed));return{stepDistance:hn(wi.stepDistance,wi.runStepDistance,e),stanceFraction:hn(wi.stanceFraction,wi.runStanceFraction,e),run:e}}function Sh(n,e,t=0){const i=Number.isFinite(e)?Math.max(0,e):0,r=Number.isFinite(t)&&t>0?i/t:0;return n+i/(2*qc(r).stepDistance)}function mc(){return{pelvis:[0,.916,0],body:[.025,0,0],chest:[-.015,0,0],head:[0,0,0],weapon:[.225,1.045,-.285],weaponRotation:[-1.92,0,-.16],leftHand:[-.29,.99,-.035],feet:[[-.15,.09,-.07],[.15,.09,.085]],footPitch:[0,0],twoHands:0,fall:0,sheath:0,phase:"idle",active:!1}}const $r=(n,e)=>({...n,...e});function Eh(n){const e={...n};for(const t of["pelvis","body","chest","head","weapon","weaponRotation","leftHand","footPitch"])e[t]=n[t].slice();return e.feet=n.feet.map(t=>t.slice()),e}function Yc(n,e,t){const i={...e};for(const r of["pelvis","body","chest","head","weapon","weaponRotation","leftHand","footPitch"])i[r]=n[r].map((s,o)=>hn(s,e[r][o],t));i.feet=n.feet.map((r,s)=>r.map((o,c)=>hn(o,e.feet[s][c],t)));for(const r of["twoHands","fall","sheath"])i[r]=hn(n[r],e[r],t);return i}function Ai(n,e,t){if(t<=e[0][0])return $r(n,e[0][1]);for(let i=1;i<e.length;i++)if(t<=e[i][0]){const r=$r(n,e[i-1][1]),s=$r(n,e[i][1]);return Yc(r,s,gn((t-e[i-1][0])/(e[i][0]-e[i-1][0])))}return $r(n,e.at(-1)[1])}const ha={pelvis:[0,.865,.035],body:[-.04,0,-.035],chest:[.025,-.14,.015],weapon:[.15,1.6,.015],weaponRotation:[.34,-.12,-.22],twoHands:1,feet:[[-.18,.09,-.235],[.18,.09,.245]]},Ct={pelvis:[0,.865,.02],body:[.045,0,-.015],chest:[-.045,.1,0],weapon:[.12,1.26,-.38],weaponRotation:[-.67,-.13,-.25],twoHands:1,feet:[[-.19,.09,-.19],[.2,.09,.2]]},$s={pelvis:[-.015,.835,-.045],body:[-.14,0,.035],chest:[-.035,.32,.02],weapon:[-.09,1.19,-.47],weaponRotation:[-1.73,.05,.36],twoHands:1,feet:[[-.2,.09,-.32],[.19,.09,.22]]};function q_(n,e=0,{time:t=0,speed:i=0,phase:r=0,turn:s=0,acceleration:o=0,direction:c=[0,-1],victoryAge:l=0}={}){let a=mc();const u=Zt(i/2.2),h=qc(i),d=h.run,f=Math.sin(t*1.65)*.004;if(a.chest[0]+=f,a.head[0]-=f*.45,a.pelvis[0]=Zt(s*.004,-.025,.025)*u,a.body[0]-=Zt(o*.005,-.045,.075)+d*.085,a.chest[1]=Zt(s*.026,-.2,.2),a.head[1]=-a.chest[1]*.5,n==="idle"||n==="guard"){const g=r*Math.PI*2;a.pelvis[1]-=u*(.024+Math.cos(g*2)*.01);const x=r%.5,m=Zt(x/h.stanceFraction),p=x>h.stanceFraction?(x-h.stanceFraction)/(.5-h.stanceFraction):0,b=.9-.065*Math.sin(Math.PI*m)+.006*4*p*(1-p);a.pelvis[1]=hn(a.pelvis[1],b,d*u);const S=F=>F<h.stanceFraction?1-2*F/h.stanceFraction:hn(-1,1,gn((F-h.stanceFraction)/(1-h.stanceFraction))),_=F=>F<h.stanceFraction?Math.sin(Math.PI*F/h.stanceFraction):0,w=r%1,E=(r+.5)%1,C=S(w),L=S(E),v=_(E)-_(w),y=(C-L)*.5,R=u*(.4+d*.6),U=-y*.075*R;a.pelvis[0]+=v*.026*R,a.pelvis[2]-=d*u*.022,a.body[0]-=d*u*.065,a.body[1]=U,a.body[2]=-v*.024*R-Zt(s*.008,-.065,.065)*u,a.chest[1]-=U*2.4,a.chest[2]=v*.017*R,a.leftHand=[-.29-v*.018*R,.985+gn((1-C)*.5)*.13*R,.035+C*.235*R],a.weapon[0]+=y*.018*R,a.weapon[1]+=(a.pelvis[1]-.89)*.45*u,a.weapon[2]+=L*.06*R,a.weaponRotation[1]-=U*.45,a.weaponRotation[2]-=v*.026*R,a.head[0]-=(a.body[0]+a.chest[0])*.85*u,a.head[1]-=(a.body[1]+a.chest[1])*.82*u,a.head[2]-=(a.body[2]+a.chest[2])*.9*u,a.phase=i>.15?"locomotion":"idle"}if(n==="guard")a=Yc(a,$r(a,Ct),gn(e/.11)),a.phase="guard",a.chest[0]+=f*.5;else if(n==="windup")a=Ai(a,[[0,Ct],[.18,{...Ct,pelvis:[.025,.85,.065],chest:[-.025,-.18,-.025]}],[.53,ha],[.65,ha]],e),a.phase="anticipation";else if(n==="attack")a=Ai(a,[[0,{...Ct,weapon:[.21,1.33,-.21]}],[.115,ha],[.18,{...$s,weapon:[.06,1.35,-.47],weaponRotation:[-1.15,0,.18]}],[.245,{...$s,weapon:[-.04,1.27,-.47],weaponRotation:[-1.48,.025,.3]}],[.34,$s],[.43,{...$s,weapon:[-.16,1.09,-.405],weaponRotation:[-2.02,.08,.51]}],[.56,{...Ct,weapon:[.1,1.12,-.345],weaponRotation:[-1.12,0,-.1]}],[.65,Ct]],e),a.phase=e<.18?"anticipation":e<=.34?"active":"recovery",a.active=e>=.18&&e<=.34;else if(n==="stagger")a=Ai(a,[[0,Ct],[.055,{...Ct,pelvis:[.035,.795,.1],body:[.16,-.035,-.115],chest:[-.13,.18,.08],head:[-.16,-.05,.045],weapon:[.27,1.29,-.2],weaponRotation:[-.6,.1,-.44]}],[.13,{...Ct,pelvis:[.02,.775,.065],body:[-.15,-.02,-.065],chest:[-.12,.1,.05],head:[.065,-.025,.018],weapon:[.22,1.1,-.29],weaponRotation:[-.97,.06,-.28]}],[.235,{...Ct,pelvis:[.01,.822,.035],body:[-.055,0,-.025],chest:[-.035,.1,.018],head:[.035,0,0],weapon:[.16,1.18,-.35],weaponRotation:[-.8,-.04,-.26]}],[.38,Ct]],e),a.phase="hit-recoil";else if(n==="broken"){const g={...Ct,pelvis:[.025,.645,.03],body:[-.3,0,.1],chest:[-.15,.13,-.04],head:[.28,-.1,-.03],weapon:[.255,.74,-.26],weaponRotation:[-1.9,.1,-.3],twoHands:0,leftHand:[-.22,.56,-.3],feet:[[-.2,.09,-.24],[.18,.09,.27]]};a=Ai(a,[[0,Ct],[.26,g],[1.22,g],[1.6,{...Ct,pelvis:[.01,.8,.03],body:[-.18,0,.03]}],[1.8,Ct]],e),a.phase="posture-broken"}else if(n==="dodge"){const g=c[0],x=c[1];a=Ai(a,[[0,Ct],[.09,{...Ct,pelvis:[g*.065,.66,x*.06],body:[.2*x,0,-g*.24],chest:[.09,g*.15,g*.08],weapon:[.21,1,-.16],weaponRotation:[-1.5,-.2,-.7],feet:[[-.26,.11,-.12],[.26,.15,.13]]}],[.27,{...Ct,pelvis:[g*.04,.735,x*.025],body:[.14*x,0,-g*.16],weapon:[.24,1.06,-.19],weaponRotation:[-1.43,0,-.55],feet:[[-.25,.15,-.23],[.25,.1,.21]]}],[.38,{...Ct,pelvis:[0,.8,0],body:[.1,0,g*.055]}],[.46,Ct]],e),a.phase="dodge"}else if(n==="dead")a=Ai(a,[[0,Ct],[.17,{...Ct,pelvis:[.01,.85,.07],body:[-.16,0,-.08],weapon:[.29,1.13,-.19],twoHands:0,leftHand:[-.3,1.03,.01]}],[.48,{...Ct,pelvis:[.055,.57,.075],body:[.36,0,.1],chest:[.1,.15,-.04],head:[.16,.08,.1],weapon:[.35,.6,-.04],weaponRotation:[-1.8,.1,-.8],twoHands:0,leftHand:[-.29,.4,.03],feet:[[-.23,.09,-.15],[.23,.095,.22]],fall:.2}],[.91,{pelvis:[-.04,.31,.09],body:[1.06,0,.12],chest:[.1,.12,-.04],head:[.17,.06,.1],weapon:[.46,.14,-.32],weaponRotation:[-.1,.2,1.4],twoHands:0,leftHand:[-.34,.13,.44],feet:[[.15,.1,-.19],[.32,.13,.27]],fall:.85}],[1.28,{pelvis:[-.08,.215,.085],body:[1.48,0,.12],chest:[.05,.1,0],head:[.06,.08,.1],weapon:[.49,.064,-.33],weaponRotation:[0,.2,1.57],twoHands:0,leftHand:[-.35,.095,.64],feet:[[.18,.105,-.24],[.35,.115,.19]],fall:1}],[1.56,{pelvis:[-.08,.213,.085],body:[1.47,0,.12],chest:[.05,.1,0],head:[.04,.08,.1],weapon:[.49,.059,-.33],weaponRotation:[0,.2,1.57],twoHands:0,leftHand:[-.35,.095,.64],feet:[[.18,.105,-.24],[.35,.115,.19]],fall:1}]],e),a.phase=e<1.28?"fall":"rest-dead";else if(n==="victory"){const g={pelvis:[0,.905,0],body:[.03,0,0],chest:[.04,.62,0],head:[.1,-.22,0],weapon:[-.1,1.15,-.38],weaponRotation:[1.5,0,-.12],leftHand:[-.225,.972,.045],twoHands:0};a=Ai(a,[[0,Ct],[.42,{...Ct,weapon:[.17,1.15,-.3],weaponRotation:[-1.3,0,-.16]}],[.94,{weapon:[.12,1.4,-.35],weaponRotation:[-.55,0,-.2],head:[-.06,.09,0]}],[1.44,{...g,sheath:0}],[1.82,{...g,sheath:.35}],[2.45,{...g,sheath:1}],[3.05,{...g,chest:[0,0,0],head:[-.04,-.1,0],leftHand:[-.28,1,.01],sheath:1}],[3.6,{...g,chest:[0,0,0],head:[-.04,-.1,0],leftHand:[-.28,1,.01],sheath:1}]],l),a.phase=l<1.44?"salute":l<2.45?"sheathing":"sheathed"}return Eh(a)}function Y_(n,e){const t={pelvis:[0,0,0],body:[0,0,0],chest:[0,0,0],head:[0,0,0],weapon:[0,0,0],weaponRotation:[0,0,0]},i={pelvis:[0,-.012,0],body:[0,0,0],chest:[-.022,-.065,.014],head:[.015,.045,-.01],weapon:[.014,.012,.018],weaponRotation:[-.035,-.08,-.29]},r={pelvis:[0,-.035,.026],body:[.045,0,.015],chest:[-.068,.025,.012],head:[.025,-.016,0],weapon:[-.012,-.032,.06],weaponRotation:[.115,0,.12]},s=n==="parry"?[[0,i],[.022,i],[.065,{chest:[0,.035,0],weapon:[-.012,.008,-.012],weaponRotation:[0,.035,.085]}],[.16,t]]:[[0,r],[.04,r],[.105,{pelvis:[0,-.019,.01],body:[.01,0,.006],chest:[-.035,.01,0],head:[.015,0,0],weapon:[0,-.015,.022],weaponRotation:[.035,0,.03]}],[.24,t]];if(e<0||e>=s.at(-1)[0])return t;for(let o=1;o<s.length;o++)if(e<=s[o][0]){const c=s[o-1],l=s[o],a=gn((e-c[0])/(l[0]-c[0]));return Object.fromEntries(Object.keys(t).map(u=>[u,t[u].map((h,d)=>hn((c[1][u]??t[u])[d],(l[1][u]??t[u])[d],a))]))}return t}function vu(n,e,t,i,r){const s=new I().subVectors(e,n),o=s.length();o<1e-8?s.set(0,-1,0):s.multiplyScalar(1/o);const c=Zt(o,Math.abs(i-r)+.001,i+r-.001),l=t.clone().addScaledVector(s,-t.dot(s));l.lengthSq()<1e-8&&l.set(1,0,0).addScaledVector(s,-s.x),l.normalize();const a=(i*i-r*r+c*c)/(2*c),u=Math.sqrt(Math.max(0,i*i-a*a)),h=n.clone().addScaledVector(s,a).addScaledVector(l,u),d=n.clone().addScaledVector(s,c),f=new Vt().setFromUnitVectors(xu,h.clone().sub(n).normalize()),g=d.clone().sub(h).normalize().applyQuaternion(f.clone().invert()),x=new Vt().setFromUnitVectors(xu,g);return{joint:h,end:d,upperQuaternion:f,lowerQuaternion:x,reachError:Math.abs(o-c),bendAngle:Math.PI-Math.acos(Zt((i*i+r*r-c*c)/(2*i*r),-1,1))}}function bh(n,e){return{actor:n,worldTime:e.time,position:{x:n.x,z:n.z},yaw:n.yaw||0,time:0,state:n.state,age:n.age||0,speed:0,lastSpeed:0,measuredSpeed:0,directionWorld:{x:Math.sin(n.yaw||0),z:-Math.cos(n.yaw||0)},phase:0,cycles:0,pivotPhase:0,gaitWeight:0,feet:[null,null],pose:mc(),from:mc(),transition:1,victoryAge:0,lastMode:e.mode,lastEventTime:-1,impact:0,impactKind:null,impactAge:1/0,cloth:0,clothVelocity:0,turn:0,metrics:{}}}function Z_(n,e,t){n.motion=bh(e,t)}function Jr(n,e,t,i){const r=Math.cos(t),s=Math.sin(t);return{x:e.x+r*n[0]-s*n[2],y:i+n[1],z:e.z+s*n[0]+r*n[2]}}function yu(n,e,t,i){const r=Math.cos(t),s=Math.sin(t),o=n.x-e.x,c=n.z-e.z;return[r*o+s*c,n.y-i,-s*o+r*c]}const Mu=n=>new I(...n);function gc(n,e,t,i){const s=(i(n+.08,e)-i(n-.08,e))/.16,o=(i(n,e+.08)-i(n,e-.08))/(.08*2),c=Math.cos(t),l=Math.sin(t);return new Vt().setFromUnitVectors(Xc,new I(-c*s-l*o,1,l*s-c*o).normalize())}function j_(n,e,t,i,r,s){const o=Jr(n,t,i,r),c=gc(o.x,o.z,i,s);c.multiply(new Vt().setFromEuler(new an(e,0,0)));const l=new Vt().setFromAxisAngle(Xc,-i),a=l.multiply(c),u=new I;let h=-1/0;for(let d=0;d<3;d++)for(let f=0;f<7;f++)u.set(-.085+d*.085,-Gt.sole,-.207+f*.052).applyQuaternion(a),h=Math.max(h,s(o.x+u.x,o.z+u.z)-u.y);return{rotation:c,y:h-r+Math.max(0,n[1]-Gt.sole)}}function Xr(n,e){let t=0;const i=new Bn,r=new I;return n.traverseVisible(s=>{if(!s.isMesh)return;const o=s.geometry,c=o.getAttribute("position"),l=o.userData.contactPositions;o.boundingBox||o.computeBoundingBox(),i.copy(o.boundingBox).applyMatrix4(s.matrixWorld);const a=(i.min.x+i.max.x)/2,u=(i.min.z+i.max.z)/2,h=e(a,u),d=.04,f=(e(a+d,u)-e(a-d,u))/(2*d),g=(e(a,u+d)-e(a,u-d))/(2*d);let x=!0;for(const m of[i.min.x,a,i.max.x])for(const p of[i.min.z,u,i.max.z])Math.abs(e(m,p)-(h+f*(m-a)+g*(p-u)))>1e-6&&(x=!1);for(let m=0;m<(l?l.length/3:c.count);m++){l?r.fromArray(l,m*3):r.fromBufferAttribute(c,m),r.applyMatrix4(s.matrixWorld);const p=x?h+f*(r.x-a)+g*(r.z-u):e(r.x,r.z);t=Math.max(t,p-r.y)}}),t}function $_(n,e,t,i,{animate:r=!0,groundHeightAt:s=X_}={}){var Oe,Ye;(!n.motion||n.motion.actor!==e||t.time<n.motion.worldTime)&&(n.motion=bh(e,t));const o=n.motion,c=r&&Number.isFinite(i)?Math.max(0,i):0,l=Zt(c,0,.1),a=s(e.x,e.z);if(!r&&o.initialized)return o.metrics;if(o.time+=l,o.settled&&e.hp<=0&&e.x===o.position.x&&e.z===o.position.z&&e.yaw===o.settledYaw&&a===o.settledGround&&s===o.settledHeightAt)return o.age=Math.max(e.age||0,o.age+l),o.worldTime=t.time,o.metrics={...o.metrics,simulationAge:e.age,visualAge:o.age,visualTime:o.time},o.metrics;const u=e.x-o.position.x,h=e.z-o.position.z,d=Math.hypot(u,h),f=(e.state==="idle"||e.state==="guard")&&e.hp>0&&t.mode==="playing",g=Math.max(0,t.time-o.worldTime),x=f?g:c;(g>0||!f)&&(o.measuredSpeed=f?Math.min(8,d/g):0);const m=o.measuredSpeed;o.lastSpeed=o.speed,o.speed=hn(o.speed,m,1-Math.exp(-x*14));const p=x>0?(o.speed-o.lastSpeed)/x:0;f&&g>0&&(o.cycles=Sh(o.cycles,d,g),o.phase=o.cycles%1);const b=qc(m>.08?m:o.speed);o.gaitWeight=hn(o.gaitWeight,m>.08?1:0,1-Math.exp(-x*(m>.08?13:11)));const S=o.yaw,_=js((e.yaw||0)-o.yaw),w=e.state==="attack"||e.state==="windup";o.yaw+=Zt(_*(1-Math.exp(-l*(w?36:16))),-l*(w?30:9),l*(w?30:9)),o.turn=l>0?js(o.yaw-S)/l:0;const E=t.mode==="victory"&&e.id==="player"?"victory":e.hp<=0?"dead":e.state;E!==o.state?(o.from=o.pose,o.transition=E==="victory"?0:e.age||0,o.state=E,o.age=e.age||0,o.feet=[null,null]):o.transition=Math.max(o.transition+l,E==="victory"?0:e.age||0),o.age=E==="dead"?Math.max(e.age||0,o.age+l):e.age||0,E==="victory"?o.victoryAge+=l:o.victoryAge=0;const C=Math.cos(o.yaw),L=Math.sin(o.yaw),v=Math.max(d,1e-8);d>1e-4&&(o.directionWorld={x:u/v,z:h/v});const y=[C*o.directionWorld.x+L*o.directionWorld.z,-L*o.directionWorld.x+C*o.directionWorld.z];let R=q_(E,o.age,{time:o.time,speed:o.speed,phase:o.phase,turn:o.turn,acceleration:p,direction:y,victoryAge:o.victoryAge});const U=E==="stagger"?.028:.09;o.transition<U&&!(E==="attack"&&o.age>=W_.activeStart)&&(R=Yc(o.from,R,gn(o.transition/U)));const F=[!1,!1];if(f&&o.gaitWeight>.015)for(let V=0;V<2;V++){const ee=(o.phase+V*.5)%1,Pe=ee<b.stanceFraction,xe=b.stepDistance*2,Be=xe*b.stanceFraction/2;let gt,_t=0,P=0;if(Pe){const $=ee/b.stanceFraction;gt=Be-xe*ee,P=$>.8?-($-.8)/.2*.32:$<.12?(1-$/.12)*.13:0}else{const $=(ee-b.stanceFraction)/(1-b.stanceFraction);gt=hn(-Be,Be,gn($)),_t=(.1+Zt((o.speed-1.5)/2.3)*.12)*Math.sin(Math.PI*$)**1.35,P=-.3*(1-gn($))+.13*gn($)}const M=[n.limbs[V].side*.15+y[0]*gt,Gt.sole+_t,y[1]*gt],B=R.feet[V].map(($,ie)=>hn($,M[ie],o.gaitWeight));if(Pe&&m>.1&&o.gaitWeight>.87){if(!((Oe=o.feet[V])!=null&&Oe.planted)){const ie=Jr(B,e,o.yaw,a);ie.y=s(ie.x,ie.z)+Gt.sole,o.feet[V]={...ie,planted:!0}}const $=yu(o.feet[V],e,o.yaw,a);Math.hypot($[0]-n.limbs[V].side*.15,$[2])<.54?(B.splice(0,3,$[0],Gt.sole,$[2]),F[V]=!0):o.feet[V]=null}else o.feet[V]=null;R.feet[V]=B,R.footPitch[V]=P*o.gaitWeight}else o.feet=[null,null];if(f&&m<.08&&Math.abs(o.turn)>.6){o.pivotPhase=(o.pivotPhase+Math.abs(js(o.yaw-S))/.9)%1;for(let V=0;V<2;V++){const ee=(o.pivotPhase+V*.5)%1;ee<.5?((Ye=o.feet[V])!=null&&Ye.planted||(o.feet[V]={...Jr(R.feet[V],e,o.yaw,a),planted:!0}),R.feet[V]=yu(o.feet[V],e,o.yaw,a),R.feet[V][1]=Gt.sole,F[V]=!0):(o.feet[V]=null,R.feet[V][1]+=.065*Math.sin((ee-.5)*Math.PI*2),F[V]=!1)}R.phase="pivot",R.pelvis[1]-=.018}let Y=!1;for(const V of t.events||[])V.target===e.id&&V.time>o.lastEventTime&&(V.type==="parry"||V.type==="block")&&(o.impact=1,o.impactKind=V.type,o.impactAge=Math.max(0,t.time-V.time),o.lastEventTime=V.time,Y=!0);if(o.impact>.001&&e.hp>0&&E!=="victory"){o.impactAge=Math.max(0,t.time-o.lastEventTime);const V=Y_(o.impactKind,Y?0:o.impactAge);for(const ee of["pelvis","body","chest","head","weapon","weaponRotation"])for(let Pe=0;Pe<3;Pe++)R[ee][Pe]+=V[ee][Pe]}o.impact*=Math.exp(-c*14);const G=Eh(R),H=R.feet.map((V,ee)=>j_(V,R.footPitch[ee],e,o.yaw,a,s)),J=H.reduce((V,ee,Pe)=>V+ee.y-R.feet[Pe][1],0)/2;R.feet.forEach((V,ee)=>{V[1]=H[ee].y}),n.root.position.set(e.x,a,e.z),n.root.rotation.set(0,-o.yaw,0),n.body.position.fromArray(R.pelvis),n.body.rotation.fromArray([...R.body,"XYZ"]),n.body.position.y+=J;const W=gc(e.x,e.z,o.yaw,s);if(n.contact.quaternion.copy(W).multiply(new Vt().setFromAxisAngle(new I(1,0,0),-Math.PI/2)),n.ring.quaternion.copy(W).multiply(new Vt().setFromAxisAngle(new I(1,0,0),Math.PI/2)),E==="dead"&&n.body.quaternion.premultiply(new Vt().slerp(W,R.fall)),n.chest.rotation.fromArray([...R.chest,"XYZ"]),n.neck.rotation.fromArray([...R.head,"XYZ"]),n.scabbard.rotation.x=hn(1.76,Math.PI/2-R.body[0],Zt(R.fall*2)),E!=="dead")for(let V=0;V<2;V++){const ee=R.feet[V],Pe=Math.hypot(ee[0]-n.limbs[V].side*.15-R.pelvis[0],ee[2]-R.pelvis[2]),xe=ee[1]+Math.sqrt(Math.max(.05,(Gt.thigh+Gt.shin-.004)**2-Pe**2));n.body.position.y=Math.min(n.body.position.y,xe)}n.root.updateMatrixWorld(!0);const le=n.root.matrixWorld.clone().invert(),_e=new mt().multiplyMatrices(le,n.body.matrixWorld),we=_e.clone().invert(),qe=[];for(let V=0;V<2;V++){const ee=n.limbs[V],Pe=Mu(R.feet[V]).applyMatrix4(we),xe=new I(0,0,-1),Be=vu(ee.hip.position,Pe,xe,Gt.thigh,Gt.shin);ee.hip.quaternion.copy(Be.upperQuaternion),ee.knee.quaternion.copy(Be.lowerQuaternion);const gt=n.body.quaternion.clone().multiply(ee.hip.quaternion).multiply(ee.knee.quaternion);ee.ankle.quaternion.copy(gt.invert()).multiply(H[V].rotation);const _t=Be.joint.clone().applyMatrix4(_e),P=Be.end.clone().applyMatrix4(_e);qe.push({side:ee.side,kneeFlexion:Be.bendAngle,kneeRotationX:new an().setFromQuaternion(ee.knee.quaternion).x,kneeLocal:_t.toArray(),footLocal:P.toArray(),footWorld:Jr(P.toArray(),e,o.yaw,a),contact:F[V]||!f&&E!=="dead"&&E!=="dodge",reachError:Be.reachError})}const at=n.body.position.y-R.pelvis[1];if(n.sword.position.fromArray(R.weapon),n.sword.rotation.fromArray([...R.weaponRotation,"XYZ"]),E==="dead"){const V=Jr(R.weapon,e,o.yaw,a);n.sword.position.y+=s(V.x,V.z)-a,n.sword.quaternion.premultiply(new Vt().slerp(gc(V.x,V.z,o.yaw,s),R.fall))}else n.sword.position.y+=at;let ne=!1;if(E==="victory"&&o.victoryAge>1.32){n.scabbard.updateWorldMatrix(!0,!1);const V=n.scabbard.getWorldPosition(new I).applyMatrix4(le),ee=n.root.getWorldQuaternion(new Vt).invert().multiply(n.scabbard.getWorldQuaternion(new Vt)),Pe=Xc.clone().applyQuaternion(ee),xe=V.addScaledVector(Pe,-hn(.4,.125,R.sheath)),Be=gn((o.victoryAge-1.32)/.26);n.sword.position.lerp(xe,Be),n.sword.quaternion.slerp(ee,Be),ne=R.sheath>=.999}n.sword.visible=!0,n.blade.visible=!ne,n.root.updateMatrixWorld(!0);let Ie=0;if(E!=="dead"&&E!=="victory"){const V=n.sword.localToWorld(new I(.045,1.088,0));if(V.y-s(V.x,V.z)<.035&&Xr(n.blade,s)>.001){const ee=n.sword.rotation.x;let Pe=0,xe=.8;for(let Be=0;Be<9;Be++){const gt=(Pe+xe)/2;n.sword.rotation.x=ee+gt,n.sword.updateWorldMatrix(!1,!0),Xr(n.blade,s)>5e-4?Pe=gt:xe=gt}Ie=xe,n.sword.rotation.x=ee+xe,n.sword.updateWorldMatrix(!1,!0)}}const Z=n.sword.localToWorld(new I(0,0,0)),K=n.sword.localToWorld(new I(0,-.135,0)),oe=[];for(let V=0;V<2;V++){const ee=Mu(R.leftHand);ee.y+=at;const Pe=n.limbs[V],xe=V===1?Z.clone():n.root.localToWorld(ee).lerp(K,R.twoHands);if(E==="dead"&&o.age>.45&&V===1){const M=n.chest.localToWorld(new I(.31,-.37,.07));xe.lerp(M,gn((o.age-.45)/.3))}if(E==="victory"&&o.victoryAge>=1.44&&o.victoryAge<2.6&&V===0&&n.scabbard.getWorldPosition(xe),E==="victory"&&o.victoryAge>2.65&&V===1){const M=n.root.localToWorld(new I(.28,1,-.025));xe.lerp(M,gn((o.victoryAge-2.65)/.4))}const Be=n.chest.matrixWorld.clone().invert();xe.applyMatrix4(Be);const gt=E==="dead"?new I(Pe.side*.8,.8,0).applyQuaternion(n.chest.getWorldQuaternion(new Vt).invert()):new I(Pe.side*.8,-.15,.4),_t=vu(Pe.arm.position,xe,gt,Gt.upperArm,Gt.forearm);Pe.arm.quaternion.copy(_t.upperQuaternion),Pe.elbow.quaternion.copy(_t.lowerQuaternion);const P=n.body.quaternion.clone().multiply(n.chest.quaternion).multiply(Pe.arm.quaternion).multiply(Pe.elbow.quaternion);Pe.wrist.quaternion.copy(P.invert()).multiply(n.sword.quaternion),oe.push({side:Pe.side,reachError:_t.reachError})}const Me=Zt(-p*.004+o.speed*.013+R.body[0]*.35,-.18,.3),fe=Math.max(1,Math.ceil(l/(1/120))),Ue=l/fe;for(let V=0;V<fe;V++)o.clothVelocity+=(Me-o.cloth)*Ue*90-o.clothVelocity*Ue*14,o.cloth+=o.clothVelocity*Ue;for(const V of n.panels){const ee=n.limbs[V.side<0?0:1],Pe=new an().setFromQuaternion(ee.hip.quaternion).x;V.node.rotation.set(Zt(o.cloth+Pe*.34+(V.front<0?.045:-.035),-.52,.55),Zt(-o.turn*.014,-.18,.18),V.side*.02+Math.sin(o.time*1.25+V.side)*.009)}n.ties.forEach((V,ee)=>V.rotation.set(Zt(o.cloth*.7+.06,-.18,.3),Zt(-o.turn*.015,-.25,.25),Math.sin(o.time*1.4+ee*.9)*.018+o.turn*.012)),n.contact.scale.set(1+R.fall*.5,1+R.fall*.1,1),n.contact.material.opacity=.24-R.fall*.05,n.ring.visible=t.locked===e.id&&e.hp>0,n.signal.visible=e.state==="windup"&&e.hp>0,n.root.updateMatrixWorld(!0);let ye=0,A=0;if(E==="broken"||E==="dodge")for(const V of n.panels)for(let ee=0;ee<5&&Xr(V.node,s)>.001;ee++)V.node.rotation.x+=V.front<0?.15:-.15,V.node.updateWorldMatrix(!1,!0);return E==="dead"&&(ye=Xr(n.body,s),A=Xr(n.sword,s),n.body.position.y+=ye,n.sword.position.y+=A,n.root.updateMatrixWorld(!0),qe.forEach((V,ee)=>{const Pe=n.limbs[ee].ankle.getWorldPosition(new I);V.footWorld={x:Pe.x,y:Pe.y,z:Pe.z},V.footLocal=n.root.worldToLocal(Pe).toArray()})),o.pose=G,o.position={x:e.x,z:e.z},o.worldTime=t.time,o.lastMode=t.mode,o.initialized=!0,o.settled=E==="dead"&&o.age>=1.6&&Math.abs(js(o.yaw-(e.yaw||0)))<1e-4,o.settledYaw=e.yaw,o.settledGround=a,o.settledHeightAt=s,o.metrics={state:E,phase:R.phase,simulationAge:e.age,visualAge:o.age,victoryAge:o.victoryAge,visualTime:o.time,root:{x:e.x,y:a,z:e.z,yaw:o.yaw},pelvis:n.body.position.toArray(),speed:o.speed,gaitPhase:o.phase,feet:qe,hands:oe,attackActive:R.active,sheathed:ne,sheathProgress:R.sheath,cloth:o.cloth,bodyGroundLift:ye,weaponGroundLift:A,weaponGroundTilt:Ie,bladeTipWorld:n.sword.localToWorld(new I(.045,1.088,0)).toArray(),bladeVisible:n.blade.visible},o.metrics}const kt=Object.freeze({offset:Object.freeze({x:-24,y:18,z:-42}),width:56,height:64,mapSize:2048}),da=Math.hypot(kt.offset.x,kt.offset.y,kt.offset.z),wn={x:kt.offset.x/da,y:kt.offset.y/da,z:kt.offset.z/da},Su=Math.hypot(wn.x,wn.z),mi={x:wn.z/Su,y:0,z:-wn.x/Su},Js={x:wn.y*mi.z,y:wn.z*mi.x-wn.x*mi.z,z:-wn.y*mi.x},fa=(n,e)=>n.x*e.x+n.y*e.y+n.z*e.z;function J_(n){const e=kt.width/kt.mapSize,t=kt.height/kt.mapSize,i=Math.round(fa(n,mi)/e)*e,r=Math.round(fa(n,Js)/t)*t,s=fa(n,wn);return{x:mi.x*i+Js.x*r+wn.x*s,y:mi.y*i+Js.y*r+wn.y*s,z:mi.z*i+Js.z*r+wn.z*s}}function K_(n,e){const t=J_(e),i=kt.offset;return n.target.position.set(t.x,t.y,t.z),n.position.set(t.x+i.x,t.y+i.y,t.z+i.z),n.target.updateMatrixWorld(),n.updateMatrixWorld(),n.shadow.updateMatrices(n),t}function Q_(n,e,t,i){const r=[];function s(l,a,u,h,d,f,g,x=0){const m=new pt(l,t);m.position.set(a,u,h),m.scale.set(d,f,g),m.rotation.y=x,m.castShadow=m.receiveShadow=!0,n.add(m,{id:`route-rock-${r.length}`}),e.add(m),r.push(m)}s(new ni(1,1,1),i.x,.62,i.z,i.w,1.24,i.d);let o=9042026;const c=()=>(o=1664525*o+1013904223>>>0,o/4294967296);for(let l=i.z+i.d/2-.65;l>i.z-i.d/2+.45;l-=1.45)for(const a of[-1.35,0,1.35]){const u=new jn(1,1),h=.72+c()*.22,d=.72+c()*.5,f=.72+c()*.25;s(u,a+(c()-.5)*.18,.75+d*.52,l+(c()-.5)*.16,h,d,f,c()*6.28)}return r}function Eu(n,e=[]){if(!n)return e;n.root.updateWorldMatrix(!0,!0);for(const[t,i,r,s]of[[n.neck,0,.14,0],[n.chest,0,.08,0],[n.chest,-.2,.08,0],[n.chest,.2,.08,0],[n.body,0,0,0]])e.push(new I(i,r,s).applyMatrix4(t.matrixWorld));if(n.blade.visible)for(const t of[0,.25,.5,.75,1])e.push(new I(.045*t*t,.128+.96*t,0).applyMatrix4(n.sword.matrixWorld));return e}function ex(n,e,t){const i=n.attributes.position,r=e.attributes.windRoot,s=e.attributes.windBranch,o=e.attributes.windLeaf,c=e.attributes.position,l=new Map;for(let a=0;a<i.count;a++){const u=r.getX(a),h=r.getY(a),d=r.getZ(a),f=r.getW(a),g=u+","+d;let x=l.get(g);x||(x=fs(u,d,t-.35),l.set(g,x));let m=c.getX(a),p=c.getY(a),b=c.getZ(a);const S=(m-s.getX(a))**2+(b-s.getZ(a))**2,_=S*s.getW(a);m+=x.x*.035*_,p-=x.pressure*.028*_,b+=x.z*.035*_,p+=Math.sin(t*3.3-o.getX(a)*.51-o.getZ(a)*.37)*o.getW(a)*.025*x.pressure;const w=Math.max(0,p-h),E=Math.max(0,Math.min(1,w/f)),C=fs(u,d,t-E*.32),L=C.x*f*.042*E*E,v=C.z*f*.042*E*E;i.setXYZ(a,m+L,p-(L*L+v*v)/Math.max(.2,2*w),b+v)}n.computeBoundingSphere(),n.computeBoundingBox()}function tx(n,e){const t=new Map,i=n.attributes.windRoot,r=n.attributes.windBranch,s=[],o=[];for(let l=0;l<n.attributes.position.count;l++){const a=[i.getX(l),i.getZ(l),r.getX(l),r.getY(l),r.getZ(l)].join(",");let u=t.get(a);u||(u={positions:[],windRoot:[],windBranch:[],windLeaf:[],indices:[]},t.set(a,u)),s[l]=u,o[l]=u.positions.length/3;for(const[h,d]of[["position","positions"],["windRoot","windRoot"],["windBranch","windBranch"],["windLeaf","windLeaf"]]){const f=n.attributes[h];for(let g=0;g<f.itemSize;g++)u[d].push(f.array[l*f.itemSize+g])}}const c=n.index?n.index.count:n.attributes.position.count;for(let l=0;l<c;l++){const a=n.index?n.index.getX(l):l;s[a].indices.push(o[a])}return[...t.values()].map(l=>{const a=new qt;a.setAttribute("position",new ot(l.positions,3));for(const h of["windRoot","windBranch","windLeaf"])a.setAttribute(h,new ot(l[h],4));a.setIndex(l.indices),a.computeBoundingBox();const u=new pt(a.clone(),e);return u.matrixAutoUpdate=!1,{source:a,proxy:u,bounds:a.boundingBox.clone().expandByScalar(1.4),worldBounds:new Bn}})}function nx(){const n=[],e=new Wf,t=new I,i=new I,r=new _s({side:Ft});function s(u,{cloth:h=!1,vegetation:d=!1,id:f=u.name||`foreground-${n.length}`}={}){u.name||(u.name=f);const g=u.material,x=g.clone();x.onBeforeCompile=g.onBeforeCompile,x.customProgramCacheKey=g.customProgramCacheKey,u.material=x;const m=h?u.geometry.clone():u.geometry,p=new pt(m,r);p.matrixAutoUpdate=!1,u.geometry.computeBoundingBox();const b=u.geometry.boundingBox.clone();return(h||d)&&b.expandByScalar(1.4),n.push({id:f,mesh:u,proxy:p,cloth:h,vegetation:d,leafParts:d?tx(u.geometry,r):[],bounds:b,worldBounds:new Bn,positions:h?u.geometry.attributes.position.array.slice():null,opacity:g.opacity,baseOpacity:g.opacity,transparent:g.transparent,depthWrite:g.depthWrite,castShadow:u.castShadow,hold:0,blocked:!1}),u}function o(u){const{mesh:h}=u,d=u.opacity<u.baseOpacity-.001;h.material.opacity=u.opacity;const f=u.transparent||d;h.material.transparent!==f&&(h.material.transparent=f,h.material.needsUpdate=!0),h.material.depthWrite=d?!1:u.depthWrite,h.castShadow=u.castShadow&&u.opacity>u.baseOpacity*.55}function c(){for(const u of n)u.opacity=u.baseOpacity,u.hold=0,u.blocked=!1,o(u)}function l(u,h,d,f,{animate:g=!0}={}){if(!g)return;const x=Math.max(0,Math.min(d,.25)),m=p=>h.some(b=>{const S=t.subVectors(b,u).length();return S<.08?!1:(e.set(u,t.multiplyScalar(1/S)),p.containsPoint(u)||e.ray.intersectBox(p,i)&&i.distanceTo(u)<S)});for(const p of n){const{mesh:b,proxy:S}=p;b.updateWorldMatrix(!0,!1),S.matrixWorld.copy(b.matrixWorld),p.worldBounds.copy(p.bounds).applyMatrix4(b.matrixWorld);const _=b.visible&&m(p.worldBounds),w=p.vegetation?[]:[S];if(_&&p.cloth){const C=S.geometry.attributes.position,L=p.positions;for(let v=0;v<C.count;v++){const y=L[v*3],R=L[v*3+1],U=L[v*3+2],F=z_(y,R,f,b.matrixWorld.elements[12],b.matrixWorld.elements[14]);C.setXYZ(v,y+F.x,R+F.y,U+F.z)}S.geometry.computeBoundingSphere(),S.geometry.computeBoundingBox()}if(_&&p.vegetation)for(const C of p.leafParts)C.worldBounds.copy(C.bounds).applyMatrix4(b.matrixWorld),m(C.worldBounds)&&(C.proxy.matrixWorld.copy(b.matrixWorld),ex(C.proxy.geometry,C.source,f),w.push(C.proxy));if(p.blocked=!1,_)for(const C of h){const L=t.subVectors(C,u).length();if(!(L<.08)&&(e.set(u,t.multiplyScalar(1/L)),e.near=.02,e.far=L-.035,e.intersectObjects(w,!1).length)){p.blocked=!0;break}}p.hold=p.blocked?.18:Math.max(0,p.hold-x);const E=p.hold>0?p.baseOpacity*.08:p.baseOpacity;p.opacity+=(E-p.opacity)*(1-Math.exp(-x*(E<p.opacity?22:5))),Math.abs(p.opacity-E)<5e-4&&(p.opacity=E),o(p)}}return{add:s,update:l,reset:c,diagnostics:()=>n.filter(u=>u.opacity<u.baseOpacity-.001||u.blocked).map(u=>({id:u.id,opacity:u.opacity,blocked:u.blocked}))}}const ix=[{angle:0,rows:[[0,0,0,.024],[.004,.46,.022,.056],[.014,.79,.115,.0012]]},{angle:2.12,rows:[[0,0,0,.022],[-.008,.58,.055,.048],[-.015,.54,.175,.001]]},{angle:4.39,rows:[[0,0,0,.018],[.012,.4,.036,.04],[.025,.34,.145,8e-4]]}];function rx(){const n=ix.map(t=>{const i=new Kn(1,1,1,2),r=i.getAttribute("position");for(let s=0;s<r.count;s++){const o=Math.round((r.getY(s)+.5)*2),[c,l,a,u]=t.rows[o];r.setXYZ(s,c+Math.sign(r.getX(s))*u/2,l,a)}return i.rotateY(t.angle),i.computeVertexNormals(),i}),e=mo(n);return n.forEach(t=>t.dispose()),e.computeBoundingBox(),e.computeBoundingSphere(),e}const qr=wd.clamp;function sx(n){const e=new A_({canvas:n,antialias:!0,powerPreference:"high-performance"});e.setPixelRatio(Math.min(devicePixelRatio,1.5)),e.shadowMap.enabled=!0,e.shadowMap.type=Iu,e.toneMapping=Nu,e.toneMappingExposure=1.02;const t=new Qd;t.fog=new Uc("#bcab94",.009);const i=new _n(52,1,.1,230),r=nx();t.add(new Bf("#a4bfd3","#42372a",1.55));const s=new Bl("#ffd29a",3.4);s.position.set(-24,18,-42),s.castShadow=!0,s.shadow.mapSize.set(kt.mapSize,kt.mapSize),Object.assign(s.shadow.camera,{left:-kt.width/2,right:kt.width/2,top:kt.height/2,bottom:-kt.height/2,near:1,far:110}),s.shadow.camera.updateProjectionMatrix(),s.shadow.bias=-4e-4,s.shadow.normalBias=.025,t.add(s,s.target);const o=new Bl("#b6c6d0",1.35);o.position.set(18,12,22),t.add(o);let c=310519;const l=()=>(c=1664525*c+1013904223>>>0,c/4294967296),a=(D,k=.85,X=0)=>new dc({color:D,roughness:k,metalness:X}),u=a("#485647"),h=a("#91906b"),d=a("#92432d"),f=a("#7f8275"),g=a("#555b55"),x=a("#303e3d"),m=a("#72834c"),p=a("#c5a36b",.35,.65);a("#b49478");const b=a("#181f25"),S=a("#b94f2f",.72,.02),_=a("#b7a477",.62,.08),w=a("#e7f4f4",.16,.92),E=a("#ffe0a6",.22,.82);w.emissive.set("#7397a1"),w.emissiveIntensity=.13,E.emissive.set("#a64b24"),E.emissiveIntensity=.24,m.side=Ft;const C={value:0},L=U_(),v=new Map;let y=null;const R=u.clone(),U=a("#ae6734");U.side=Ft;const F=new Set([m,R,h,U]);F.forEach(D=>di(D,C));const Y=di(new ro({depthPacking:no,side:Ft}),C);S.side=Ft,S.emissive.set("#4b140d"),S.emissiveIntensity=.18,di(S,C,"cloth");const G=di(new ro({depthPacking:no,side:Ft}),C,"cloth"),H=new pt(new mr(190,32,18),new ii({side:on,depthWrite:!1,uniforms:{sunDirection:{value:new I(-24,18,-42).normalize()}},vertexShader:"varying vec3 ray; void main(){ray=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"varying vec3 ray; uniform vec3 sunDirection; void main(){vec3 r=normalize(ray);float h=smoothstep(-.14,.7,r.y);vec3 horizon=vec3(.84,.59,.38);vec3 zenith=vec3(.16,.27,.38);float glow=pow(max(dot(r,sunDirection),0.),16.);float bands=sin(r.x*12.+r.z*8.+r.y*27.)*.5+sin(r.x*25.-r.z*19.+r.y*42.)*.24;float cloud=smoothstep(.24,.62,bands)*smoothstep(.08,.25,r.y)*(1.-smoothstep(.5,.72,r.y));vec3 c=mix(horizon,zenith,h)+vec3(1.,.44,.12)*glow*.36;c=mix(c,vec3(.65,.43,.36),cloud*.26);gl_FragColor=vec4(c,1.);}"}));t.add(H);const J=document.createElement("canvas");J.width=J.height=128;const W=J.getContext("2d"),le=W.createRadialGradient(64,64,4,64,64,62);le.addColorStop(0,"rgba(255,246,207,1)"),le.addColorStop(.18,"rgba(255,209,132,.95)"),le.addColorStop(.5,"rgba(255,143,75,.24)"),le.addColorStop(1,"rgba(255,120,55,0)"),W.fillStyle=le,W.fillRect(0,0,128,128);const _e=new wl(new cc({map:new Qo(J),transparent:!0,depthWrite:!1,blending:co}));_e.position.copy(s.position).normalize().multiplyScalar(110),_e.scale.set(24,24,1),t.add(_e);const we=document.createElement("canvas");we.width=we.height=256;const qe=we.getContext("2d");qe.fillStyle="#b9b5a1",qe.fillRect(0,0,256,256);for(let D=0;D<6500;D++)qe.fillStyle=`rgba(${l()<.55?"40,43,30":"235,221,170"},${.05+l()*.18})`,qe.fillRect(l()*256,l()*256,1+l()*6,1+l()*3);for(let D=0;D<95;D++){qe.strokeStyle="rgba(54,54,39,.1)",qe.beginPath();const k=l()*256,X=l()*256;qe.moveTo(k,X),qe.lineTo(k+l()*18-9,X+l()*20),qe.stroke()}const at=new Qo(we);at.wrapS=at.wrapT=rs,at.repeat.set(32,40),at.colorSpace=un;const ne=a("#d8cbb4");ne.map=at,ne.vertexColors=!0;const Ie=at.clone();Ie.repeat.set(1.3,1.3),f.map=Ie,f.bumpMap=Ie,f.bumpScale=.06;const Z=new Map,K=new mt,oe=new Vt,Me=new I,fe=new I;function Ue(D,k,X,ae){Z.has(k)||Z.set(k,new Map);const me=Z.get(k),re=F.has(k)?yh(X,ae):"all";me.has(re)||me.set(re,[]),me.get(re).push(D)}function ye(D,k,X,ae,me,re=1,pe=1,Se=1,Re=0){gu(D),oe.setFromAxisAngle(It.DEFAULT_UP,Re),K.compose(fe.set(X,ae,me),oe,Me.set(re,pe,Se)),D.applyMatrix4(K),Ue(D,k,X,me)}const A=(D,k,X,ae,me,re,pe,Se=0)=>ye(new ni(1,1,1),D,k,X,ae,me,re,pe,Se),Oe=(D,k,X,ae,me,re)=>ye(new Bt(me*.88,me,re,8),D,k,X,ae);function Ye(D,k,X,ae=0){var Re;const me=D.getAttribute("position"),re=[],pe=[],Se=[];for(let se=0;se<me.count;se++)re.push(k.x,k.y,k.z,k.height),pe.push(X.x,X.y,X.z,X.flex??0),Se.push(me.getX(se),me.getY(se),me.getZ(se),ae*(((Re=D.getAttribute("windWeight"))==null?void 0:Re.getX(se))??0));return D.deleteAttribute("windWeight"),D.setAttribute("windRoot",new ot(re,4)),D.setAttribute("windBranch",new ot(pe,4)),D.setAttribute("windLeaf",new ot(Se,4)),D}function V(D,k,X,ae,me,re,pe,Se=1,Re=1,se=1,ke=0,tt=0){gu(D),oe.setFromAxisAngle(It.DEFAULT_UP,ke),D.applyMatrix4(new mt().compose(new I(me,re,pe),oe,new I(Se,Re,se))),Ye(D,X,ae,tt),Ue(D,k,me,pe)}function ee(D,k,X,ae,me,re,pe,Se=m,Re=.023){const se=new I(D,k,X),ke=new I(ae,me,re),tt=ke.clone().sub(se),yt=tt.length(),At=new Bt(Re*.35,Re,yt,5,2,!0),zt=new Vt().setFromUnitVectors(It.DEFAULT_UP,tt.normalize());At.applyMatrix4(new mt().compose(se.add(ke).multiplyScalar(.5),zt,new I(1,1,1))),Ye(At,pe,{x:D,y:k,z:X,flex:1}),Ue(At,Se,(D+ae)/2,(X+re)/2)}const Pe=new Kn(160,200,64,80);Pe.rotateX(-Math.PI/2);const xe=Pe.getAttribute("position"),Be=[],gt=new ct("#927550"),_t=new ct("#596349"),P=new ct;for(let D=0;D<xe.count;D++){const k=xe.getX(D),X=xe.getZ(D);xe.setY(D,jr(k,X));const ae=.5+Math.sin(k*.43+X*.22)*.25+Math.sin(X*.51-k*.17)*.15;P.copy(gt).lerp(_t,qr((Math.abs(k)-2.7)/9,0,1)*(.55+ae*.42)),P.multiplyScalar(.84+ae*.24),Be.push(P.r,P.g,P.b)}Pe.setAttribute("color",new ot(Be,3)),Pe.computeVertexNormals();const M=new pt(Pe,ne);M.receiveShadow=!0,t.add(M);let B=0;for(let D=-19;D<24;D+=1.1)for(let k=-.65;k<=.6501;k+=.325){const X=ur(D),ae=(l()-.5)*.06,me=.27+l()*.05,re=.89+l()*.13,pe=.005+l()*.016,Se=(l()-.5)*.06;for(const Re of X)A(f,Re+k+ae,pe,D+ae,me,.055,re,Se),B++}let $=0;for(let D=nt.obstacleBackZ-.25;D>nt.rejoinZ;D-=.5)for(const k of ur(D)){const X=ft(k,D);A(_,k,X+.055,D,.16,.07,.3),$++}A(_,0,ft(0,nt.rejoinZ)+.065,nt.rejoinZ,.82,.09,.36),$++;const ie=[];for(const D of xa)if(D.kind==="torii"){const k=d.clone();k.transparent=!0;const X=new pt(new Bt(.3*.88,.3,D.h,8),k);X.position.set(D.x,D.h/2,D.z),X.castShadow=X.receiveShadow=!0,t.add(X),ie.push({mesh:X,obstacle:D,opacity:1})}else if(D.kind==="shrine"){const k=mu(D);A(f,D.x,k.height/2,D.z,k.width,k.height,k.depth),A(u,D.x,2.3,D.z,D.w,4,D.d);for(let X=-4;X<=4;X+=1)A(d,X,2.6,-19.45,.16,4.4,.2);for(let X=-3.8;X<=4;X+=.25)A(p,X,2.2,-19.39,.025,2.7,.03);for(let X=0;X<9;X++)A(x,0,5+X*.19,-23,12-X*.52,.23,9-X*.5);A(p,0,6.82,-23,8.5,.14,.25)}A(d,0,4.1,7,8.4,.25,.38),A(b,0,4.65,7,9,.28,.6),A(d,0,4.35,7,.42,.5,.35);for(const D of[-3.5,3.5])A(f,D,.12,7,.8,.24,.8),A(b,D,.6,7,.61,.16,.61);for(let D=-15;D<22;D+=9)for(const k of[-7.2,7.2]){const X=ft(k,D);A(f,k,X+.18,D,.95,.36,.95),Oe(f,k,X+.75,D,.18,.95),A(f,k,X+1.45,D,.7,.14,.7),A(p,k,X+1.68,D,.34,.35,.34),A(x,k,X+1.99,D,.85,.16,.85)}const Q=nt.obstacle;Q_(r,t,g,Q);for(const D of nt.left.markers){const k=ft(D.x,D.z);A(f,D.x,k+.11,D.z,.62,.22,.62),Oe(f,D.x,k+.64,D.z,.13,.88),A(f,D.x,k+1.08,D.z,.64,.12,.64),A(x,D.x,k+1.24,D.z,.48,.2,.48)}const He=[];for(const D of nt.right.markers){const k=ft(D.x,D.z);Oe(b,D.x,k+1.35,D.z,.045,2.7);const X=new Kn(.9,1.6,5,8);X.translate(-.45,-.8,0);const ae=new pt(X,S);ae.customDepthMaterial=G,ae.position.set(D.x-.04,k+2.5,D.z),ae.castShadow=!0,ae.receiveShadow=!0,r.add(ae,{cloth:!0,id:`route-cloth-${He.length}`}),t.add(ae),He.push(ae)}let ge=15092026;const Le=()=>(ge=1664525*ge+1013904223>>>0,ge/4294967296),Ve=a("#9b8765"),he=a("#5c8580",.26,.32);Ve.map=Ie;const Ae=new Map,je=[];let Ge=0,Ee=0;for(const D of Ht.loops){const k=[],X=[],ae=[];for(let se=1;se<D.nodes.length;se++){const ke=D.nodes[se-1],tt=D.nodes[se],yt=Math.hypot(tt.x-ke.x,tt.z-ke.z),At=Math.ceil(yt/.7),zt=-(tt.z-ke.z)/yt,Sn=(tt.x-ke.x)/yt,Eo=k.length/3;for(let ln=0;ln<=At;ln++)for(const tn of[-1,1]){const Gi=ln/At,xs=ke.x+(tt.x-ke.x)*Gi+zt*tn*1.05,jc=ke.z+(tt.z-ke.z)*Gi+Sn*tn*1.05;k.push(xs,ft(xs,jc)+.025,jc),X.push((tn+1)/2,Gi*yt*.7)}for(let ln=0;ln<At;ln++){const tn=Eo+ln*2;ae.push(tn,tn+2,tn+1,tn+1,tn+2,tn+3)}Ge+=yt;for(let ln=.25;ln<1;ln+=7.5/yt){const tn=ke.x+(tt.x-ke.x)*ln+zt*1.5,Gi=ke.z+(tt.z-ke.z)*ln+Sn*1.5,xs=ft(tn,Gi);ye(new jn(1,0),f,tn,xs+.08,Gi,.24,.13,.32,Math.atan2(zt,Sn))}}const me=new qt;me.setAttribute("position",new ot(k,3)),me.setAttribute("uv",new ot(X,2)),me.setIndex(ae),me.computeVertexNormals(),Ee+=ae.length/3,Ue(me,Ve,D.nodes[2].x,D.nodes[2].z);const re=document.createElement("canvas");re.width=384,re.height=96;const pe=re.getContext("2d");pe.fillStyle="#443d30",pe.fillRect(0,0,384,96),pe.strokeStyle="#b6aa88",pe.lineWidth=3,pe.strokeRect(6,6,372,84),pe.fillStyle="#e7d9b4",pe.font="500 43px sans-serif",pe.textAlign="center",pe.textBaseline="middle",pe.fillText(D.name,192,49);const Se=new Qo(re);Se.colorSpace=un;const Re=new dc({map:Se,roughness:.95,side:Ft});for(let se=0;se<2;se++){const ke=Rn(`${D.id}-sign-${se}`),tt=ke.x,yt=ke.z,At=ft(tt,yt);Oe(u,tt,At+.7,yt,.05,1.4),A(u,tt,At+1.19,yt,ke.width,.52,ke.depth,ke.rotation);const zt=new pt(new Kn(ke.width-.05,.48),Re);zt.rotation.y=ke.rotation,zt.position.set(tt+Math.sin(ke.rotation)*.056,At+1.19,yt+Math.cos(ke.rotation)*.056),t.add(zt)}}const Je=a("#b5a487"),N=a("#b7b8a0"),de=a("#405d59",.75);function ve(D,k=2.9){const{x:X,z:ae}=D,me=ft(X,ae);Oe(u,X,me+k*.5,ae,.065,k),A(_,X-.46,me+k-.05,ae,.94,.045,.045);const re=new Kn(.9,1.6,7,12);re.translate(-.45,-.8,0);const pe=new pt(re,S);return pe.position.set(X,me+k-.05,ae),pe.castShadow=pe.receiveShadow=!0,pe.customDepthMaterial=G,r.add(pe,{cloth:!0,id:D.id}),t.add(pe),pe}function Ne(D,k,X,ae){const me=new pt(new vo(X,32),he);me.rotation.x=-Math.PI/2,me.position.set(D,ae,k),t.add(me);for(let re=0;re<3;re++){const pe=new pt(new Bc(.96,1,32),new _s({color:"#d4d8ae",transparent:!0,opacity:0,depthWrite:!1,side:Ft}));pe.rotation.x=-Math.PI/2,pe.position.set(D,ae+.006,k),t.add(pe),je.push({mesh:pe,radius:X,phase:re/3})}}for(const D of Ht.points){const{x:k,z:X}=D,ae=ft(k,X),me=new pt(new Bt(.12,.16,.14,8),p.clone());if(me.position.set(k+1.15,ft(k+1.15,X)+.08,X),t.add(me),Ae.set(D.id,me),D.id==="spring-basin"){const re=Rn("spring-basin"),pe=re.x,Se=re.z,Re=ft(pe,Se);Oe(Je,pe,Re+.3,Se,re.radius-.35,.6),ye(new Sr(.88,.15,7,24).rotateX(Math.PI/2),f,pe,Re+.61,Se),Ne(pe,Se,.79,Re+.61),A(N,pe-.85,Re+1.03,Se,.12,.12,1.35,.2);for(let se=0;se<4;se++)ye(new jn(1,0),Je,pe-1.1+se*.1,Re+.75+se*.15,Se-.55,.3,.18,.29,se)}else if(D.id==="stream-stones"){const re=Rn("stream-pool"),pe=re.x,Se=re.z,Re=ft(pe,Se)+.06;Oe(de,pe,Re-.1,Se,re.radius-.45,.18),Ne(pe,Se,re.radius-.6,Re);for(let se=0;se<7;se++){const ke=se/7*Math.PI*2,tt=pe+Math.sin(ke)*(re.radius-.5),yt=Se+Math.cos(ke)*(re.radius-.5);ye(new jn(1,0),f,tt,ft(tt,yt)+.12,yt,.48,.2,.35,ke)}for(let se=-2;se<=2;se++)A(Je,k,ft(k,X+se*.8)+.04,X+se*.8,.88,.07,.53,se*.08)}else if(D.id==="valley-frame"){for(const re of["valley-frame-left","valley-frame-right"]){const pe=Rn(re);Oe(u,pe.x,ft(pe.x,pe.z)+1.7,pe.z,pe.radius,3.4),ve(pe,3.4)}A(N,k,ae+3.45,X-1,4.5,.16,.17);for(let re=-2;re<=2;re++)A(Je,k+re*.55,ft(k+re*.55,X-1.6)+.04,X-1.6,.4,.075,.6)}else if(D.id==="sun-ring"){const re=Rn("sun-ring"),pe=ft(re.x,re.z),Se=new Sr(re.width/2-.25,.21,7,22);Se.rotateY(re.rotation),ye(Se,Je,re.x,pe+1.6,re.z),A(f,re.x,pe+.18,re.z,re.width-.6,.35,re.depth-.15,re.rotation),ve(Rn("sun-cloth"),2.8)}else if(D.id==="old-waystone"){const re=Rn("old-waystone");A(Je,re.x,ae+.82,re.z,re.width,1.64,re.depth,re.rotation);for(const Se of[-.15,.15])A(b,k-1.9+Se,ae+1.02,X+.25,.045,.62,.022,Se>0?-.3:.3);A(b,k-1.9,ae+.55,X+.255,.045,.35,.025);const pe=Rn("old-cairn");for(let Se=0;Se<5;Se++)ye(new jn(1,0),f,pe.x,ae+.12+Se*.13,pe.z,pe.radius-Se*.045,.12,.35-Se*.04,Se)}else if(D.id==="white-tree"){const re=Rn("white-tree"),pe=re.x,Se=re.z,Re=ft(pe,Se),se={x:pe,y:Re,z:Se,height:5.2},ke=N.clone();F.add(ke),di(ke,C),V(new Bt(.12,re.radius,4.7,7,8),ke,se,{x:pe,y:Re,z:Se,flex:0},pe,Re+2.35,Se);for(const tt of[-1,1])ee(pe,Re+2.8,Se,pe+tt*1.8,Re+4.7,Se-.4,se,ke,.12),ve(Rn(tt<0?"white-cloth-left":"white-cloth-right"),2.5)}}const ue=[a("#3e535e",1),a("#65716b",1)];for(let D=0;D<28;D++){const k=D/28*Math.PI*2,X=65+l()*40,ae=new jn(1,1);ae.translate(0,.55,0),ye(ae,ue[D%2],Math.sin(k)*X,-3,Math.cos(k)*X,15+l()*15,12+l()*18,17+l()*18,l()*6)}for(let D=0;D<28;D++){const k=(D%2?-1:1)*(8.5+l()*13),X=-33+l()*60;if(To(k,X)<2.2)continue;const ae=new jn(1,1),me=ft(k,X);ye(ae,f,k,me-.18,X,.7+l()*1.5,.5+l()*1.2,.8+l()*1.7,l()*6.28)}const te=[];for(let D=0;D<7;D++){const k=new io;k.moveTo(0,0),k.quadraticCurveTo(.34,.14,.82,.025),k.quadraticCurveTo(.4,-.1,0,0);const X=new ns(k,3),ae=[];for(let re=0;re<X.getAttribute("position").count;re++)ae.push(qr(X.getAttribute("position").getX(re)/.82,0,1)**2);X.setAttribute("windWeight",new ot(ae,1)),X.rotateZ((D%2?-1:1)*(.25+D*.1)),X.translate(D*.11,(D%2?1:-1)*.025,0),X.rotateX(-.42),te.push(X);const me=X.clone();me.rotateY(.9),te.push(me)}const Fe=new Bt(.009,.015,.75,5,1,!0);Fe.rotateZ(-Math.PI/2),Fe.translate(.375,0,0),Fe.setAttribute("windWeight",new ot(new Float32Array(Fe.getAttribute("position").count),1)),te.push(Fe);const Ke=mo(te);te.forEach(D=>D.dispose());for(let D=0;D<150;D++){const k=l()<.5?-1:1;let X,ae;do X=k*(8+l()*30),ae=-53+l()*88;while(To(X,ae)<1.2);const me=5.5+l()*6.5,re=ft(X,ae),pe={x:X,y:re,z:ae,height:me},Se={x:X,y:re,z:ae,flex:0};V(new Bt(.079,.09,me,7,6),R,pe,Se,X,re+me/2,ae);for(let Re=.8;Re<me;Re+=1.15)V(new Bt(.098,.105,.04,7),h,pe,Se,X,re+Re,ae);for(let Re=0;Re<6;Re++){const se=l()*Math.PI*2,ke=.55+l()*1.2,tt=X+Math.sin(se)*ke,yt=re+me*.32+Re*me*.095,At=ae+Math.cos(se)*ke;ee(X,yt-.24,ae,tt,yt,At,pe),V(Ke.clone(),m,pe,{x:X,y:yt-.24,z:ae,flex:1},tt,yt,At,1+l()*.7,1+l()*.4,1+l()*.7,se,1)}}Ke.dispose();const vt=new io;[[0,0],[-.1,.12],[-.3,.17],[-.18,.25],[-.34,.44],[-.09,.38],[0,.64],[.1,.39],[.34,.45],[.19,.23],[.3,.15],[.09,.11]].forEach(([D,k],X)=>X?vt.lineTo(D,k):vt.moveTo(D,k)),vt.closePath();const ht=new ns(vt),yn=[];for(let D=0;D<ht.getAttribute("position").count;D++)yn.push((ht.getAttribute("position").getY(D)/.64)**2);ht.setAttribute("windWeight",new ot(yn,1));const jt=a("#675647");F.add(jt),di(jt,C);for(let D=0;D<4;D++){const k=Rn(`maple-${D}`),{x:X,z:ae}=k,me=ft(X,ae),re=4.8+Le(),pe={x:X,y:me,z:ae,height:re},Se={x:X,y:me,z:ae,flex:0};V(new Bt(.11,k.radius,re*.8,7,7),jt,pe,Se,X,me+re*.4,ae);for(let Re=0;Re<9;Re++){const se=Re*2.399,ke=1.2+Re%3*.45,tt=X+Math.sin(se)*ke,yt=ae+Math.cos(se)*ke,At=me+re*(.58+Re%3*.14);ee(X,me+re*.49,ae,tt,At,yt,pe,jt,.09);for(let zt=0;zt<9;zt++){const Sn=ht.clone();Sn.rotateZ(Le()*6.28),Sn.rotateX(-.6+Le()*1.1);const Eo=tt+(Le()-.5)*1.25,ln=At+(Le()-.5)*.55,tn=yt+(Le()-.5)*1.25;V(Sn,U,pe,{x:X,y:me+re*.49,z:ae,flex:.32},Eo,ln,tn,.7,.7,.7,se,1)}}}for(const[D,k]of Z)for(const[X,ae]of k){const me=mo(ae);me.computeBoundingSphere(),F.has(D)&&(me.boundingSphere.radius+=1.4);const re=new pt(me,D);re.castShadow=re.receiveShadow=!0,F.has(D)&&(re.customDepthMaterial=Y),(D===m||D===U||D===jt)&&r.add(re,{vegetation:!0,id:`${D===m?"bamboo-leaves":D===jt?"maple-wood":"maple-leaves"}-${X}`}),t.add(re),ae.forEach(pe=>pe.dispose())}const Bi=a("#b8b77d");Bi.side=Ft,di(Bi,C,"grass");const Hn=di(new ro({depthPacking:no,side:Ft}),C,"grass"),ki=rx(),Vn=new lc(ki,Bi,3e3),Cr=new ct;let ri=0,Hi=1/0;for(let D=0;D<3e3;D++){const k=l()<.5?-1:1,X=l()<.22;let ae,me;do me=-53+l()*82,ae=k*((X?4.8:9)+l()*(X?5.2:28));while(To(ae,me)<.8);const re=1.45,pe=_a(ae,me);pe<re&&(ae+=k*(re-pe+.08)),oe.setFromAxisAngle(It.DEFAULT_UP,l()*Math.PI*2);const Se=.65+l()*.65;K.compose(fe.set(ae,ft(ae,me)+.006,me),oe,Me.set(Se,Se,Se)),Vn.setMatrixAt(D,K),Cr.setHSL(.105+l()*.08,.22+l()*.2,.4+l()*.22),Vn.setColorAt(D,Cr),ri=Math.max(ri,Math.abs(Vn.instanceMatrix.array[D*16+13]-ft(ae,me)-.006)),Hi=Math.min(Hi,_a(ae,me))}const Mn={grassClumps:3e3,grassBlades:9e3,grassTriangles:ki.index.count/3*Vn.count,maxRootError:ri,minGrassRouteClearance:Hi,baseFootprint:mu(xa.find(D=>D.kind==="shrine")),route:{obstacle:{...nt.obstacle},stoneTiles:B,bindingStones:$,pathCenters:{approach:ur(0),ridge:ur(nt.obstacle.z),rejoined:ur(-18)},left:{landmark:nt.left.landmark,markers:nt.left.markers.length,pathLength:Kc("left")},right:{landmark:nt.right.landmark,markers:He.length,pathLength:Kc("right")}}};Mn.exploration={loops:Ht.loops.length,places:Ht.points.length,sideTrailMeters:Ge,sideTrailTriangles:Ee,bounds:Ht.bounds},Mn.wind={sharedField:!0,rootAnchored:!0,pinnedClothEdge:!0,shadowDeformation:!0},Mn.sunShadow={followsPlayer:!0,width:kt.width,height:kt.height,mapSize:kt.mapSize,texelSnapped:!0};const Pr=I_(Vn);Vn.dispose(),Pr.forEach(D=>{D.customDepthMaterial=Hn,t.add(D)}),Mn.grassBatches=Pr.length,Mn.leafBatches=Z.get(m).size;const Lr=a("#b8843f");Lr.side=Ft;const vi=new lc(ht,Lr,64),Dr=[];vi.frustumCulled=!1,vi.instanceMatrix.setUsage(bd),t.add(vi);for(let D=0;D<64;D++){const k=Ht.points[D%Ht.points.length];Dr.push({x:k.x+(Le()-.5)*8,z:k.z+(Le()-.5)*8,phase:Le(),height:3.5+Le()*3.5,speed:.07+Le()*.035,spin:Le()*6.28})}const Ir=[],Vi=a("#35413d");Vi.side=Ft;const si=new io;si.moveTo(0,0),si.lineTo(.38,-.12),si.lineTo(.63,-.38),si.lineTo(.14,-.24),si.closePath();const Ur=new ns(si);Ur.rotateX(-Math.PI/2);for(let D=0;D<7;D++){const k=new Dt,X=new pt(Ur,Vi),ae=new pt(Ur,Vi);X.scale.x=-1,k.add(X,ae);const me=new pt(new po(.065,.36,5),Vi);me.rotation.x=-Math.PI/2,k.add(me),k.visible=!1,t.add(k),Ir.push({group:k,left:X,right:ae,phase:D*.67})}const T=new an;function z(D){var re,pe;const k=C.value;for(const[Se,Re]of Ae){const se=((re=D.exploration)==null?void 0:re.discovered.includes(Se))??!1;Re.material.emissive.set(se?"#b17b31":"#000000"),Re.material.emissiveIntensity=se?.45:0}he.roughness=.24+fs(-28,8,k).pressure*.035;for(const Se of je){const Re=(k*.26+Se.phase)%1,se=.08+Re*Se.radius;Se.mesh.scale.setScalar(se),Se.mesh.material.opacity=Math.sin(Re*Math.PI)*.18}for(let Se=0;Se<Dr.length;Se++){const Re=Dr[Se],se=(k*Re.speed+Re.phase)%1,ke=fs(Re.x,Re.z,k-se*.3),tt=Re.x+ke.x*se*3+Math.sin(se*8+Re.spin)*.3,yt=Re.z+ke.z*se*3+Math.cos(se*7+Re.spin)*.24,At=ft(tt,yt)+.08+(1-se)*Re.height,zt=qr(se*14,0,1)*qr((1-se)*12,0,1),Sn=.19*zt;T.set(Math.sin(k*1.5+Re.spin)*.65,k*.48+Re.spin,Math.sin(k*1.2+Re.spin)*.5),oe.setFromEuler(T),K.compose(fe.set(tt,At,yt),oe,Me.setScalar(Sn)),vi.setMatrixAt(Se,K)}vi.instanceMatrix.needsUpdate=!0,((pe=D.exploration)==null?void 0:pe.encounters["valley-frame"])!==void 0&&!v.has("valley-frame")&&v.set("valley-frame",k);const ae=v.get("valley-frame"),me=ae===void 0?-1:k-ae;for(let Se=0;Se<Ir.length;Se++){const Re=Ir[Se],se=me-Se*.075;if(Re.group.visible=se>=0&&se<9,!Re.group.visible)continue;const ke=se*.11,tt=(Se-3)*.46,yt=28-se*2.5,At=8+Math.sin(ke)*9+tt,zt=ft(30,10)+2.3+Math.min(se,3)*.9+Math.sin(se*.6+Se)*.25;Re.group.position.set(yt,zt,At),Re.group.rotation.set(-.05,-Math.PI/2-ke,.16*Math.sin(ke));const Sn=se<2.2?Math.sin(se*9+Re.phase)*.5:Math.sin(se*3.4+Re.phase)*.12;Re.left.rotation.z=-Sn,Re.right.rotation.z=Sn,Re.group.scale.setScalar(qr((9-se)/1.5,0,1)*.7)}}const q=new Map,j=Mh(),O={partsByRig:{},rigs:{},motionByRig:{}},ce=3.15,be=a("#74624a"),ze=new pt(new Bt(.3,.27,.65,12),be);ze.position.set(Nt.x,ce,Nt.z),t.add(ze);const De=new pt(new po(.43,.24,8),x);De.position.set(Nt.x,ce+.45,Nt.z),t.add(De);const Ze=new Dt;Ze.position.set(Nt.x,ce+.72,Nt.z+.08),t.add(Ze);const $e=new pt(new ni(.72,.07,.08),p);$e.position.x=.28,$e.castShadow=!0,Ze.add($e);const We=new pt(new Bt(.025,.025,.48,6),b);We.position.set(0,-.23,0),We.castShadow=!0,Ze.add(We);const rt=new Hf("#ffbb66",0,5.5,2);rt.position.set(Nt.x,ce,Nt.z+.5),t.add(rt);const dt=new wl(new cc({map:_e.material.map,color:"#ffd08a",transparent:!0,opacity:.08,depthWrite:!1,blending:co}));dt.position.set(Nt.x,ce+.05,Nt.z+.18),dt.scale.set(1.9,1.9,1),dt.visible=!1,t.add(dt);function Rt(D){const k=G_(D,j);return t.add(k.root),O.partsByRig[D]=k.metrics.generatedParts,O.rigs[D]=k.metrics,q.set(D,k),k}const St=new I,et=new I,Xe={x:0,y:0,z:0,lookX:0,lookY:0,lookZ:0},Qe={...Xe};let ut=!1,$t=null,An=null;function en(D){for(const k of[D.player,...D.enemies])Z_(q.get(k.id)||Rt(k.id),k,D);r.reset(),ut=!1,$t=D,An=null}const Ut={lockedFrames:0,minHorizontalStandoff:null,maxDownAngleDegrees:0,foregroundPostOpacity:1,rejoinVistaFrames:0,rejoinComposition:null,rejoinFrameError:null,rejoinSightlineClearance:null,arrivalOverviewFrames:0,arrivalComposition:null,arrivalFrameError:null};function wt(){e.setSize(innerWidth,innerHeight,!1),i.aspect=innerWidth/innerHeight,i.updateProjectionMatrix()}wt();function cn(D,k,X=0,ae={}){const me=ae.animate!==!1;Mn.sunShadow.center=K_(s,{x:D.player.x,y:ft(D.player.x,D.player.z)+.8,z:D.player.z}),N_(L,D,k,ae.animate!==!1)&&(v.clear(),y=null),C.value=L.value,z(D),be.emissive.set(D.signalLit?"#ffb84f":"#000000"),D.signalLit&&y===null&&(y=C.value),D.signalLit||(y=null);const re=F_(y===null?0:C.value-y);be.emissiveIntensity=D.signalLit?re.emissive:0,rt.intensity=D.signalLit?re.light:0,dt.visible=D.signalLit,dt.material.opacity=D.signalLit?re.opacity:0,dt.scale.set(re.scale,re.scale,1);for(const se of[D.player,...D.enemies]){const ke=q.get(se.id)||Rt(se.id);O.motionByRig[se.id]=$_(ke,se,D,k,{animate:me,groundHeightAt:ft})}if($t!==D&&(r.reset(),ut=!1,An=null,$t=D),P_(D,X,i.aspect,Xe),D_(Qe,Xe,k,ut,L_(D,An)),An={x:D.player.x,z:D.player.z},i.position.set(Qe.x,Qe.y,Qe.z),St.set(Qe.lookX,Qe.lookY,Qe.lookZ),i.lookAt(St),ut=!0,Vc(D)){i.updateMatrixWorld();const se=nt.obstacleBackZ-.3,ke={leftExit:{x:hr("left",se),y:ft(hr("left",se),se),z:se},rightExit:{x:hr("right",se),y:ft(hr("right",se),se),z:se},sharedJoin:{x:0,y:ft(0,nt.rejoinZ),z:nt.rejoinZ}};Ut.rejoinVistaFrames++,Ut.rejoinFrameError=Math.max(...["x","y","z","lookX","lookY","lookZ"].map(At=>Math.abs(Qe[At]-Xe[At])));const tt=ft(0,nt.rejoinZ),yt=(nt.obstacleBackZ-Qe.z)/(nt.rejoinZ-Qe.z);Ut.rejoinSightlineClearance=Qe.y+(tt-Qe.y)*yt-nt.obstacle.h,Ut.rejoinComposition=Object.fromEntries(Object.entries(ke).map(([At,zt])=>(et.set(zt.x,zt.y,zt.z).project(i),[At,{x:et.x,y:et.y,z:et.z,inFrame:Math.abs(et.x)<.92&&Math.abs(et.y)<.92&&et.z>-1&&et.z<1}])))}if(Gc(D)){i.updateMatrixWorld(),Ut.arrivalOverviewFrames++,Ut.arrivalFrameError=Math.max(...["x","y","z","lookX","lookY","lookZ"].map(ke=>Math.abs(Qe[ke]-Xe[ke])));const se={player:{x:D.player.x,y:ft(D.player.x,D.player.z)+1.1,z:D.player.z},signal:{x:Nt.x,y:ce,z:Nt.z},shrine:{x:0,y:5.5,z:-23}};Ut.arrivalComposition=Object.fromEntries(Object.entries(se).map(([ke,tt])=>(et.set(tt.x,tt.y,tt.z).project(i),[ke,{x:et.x,y:et.y,z:et.z,inFrame:Math.abs(et.x)<.92&&Math.abs(et.y)<.92&&et.z>-1&&et.z<1}])))}const pe=1-Math.exp(-Math.max(0,Math.min(k,.1))*18);let Se=1;for(const se of ie){const ke=D.mode==="playing"&&D.locked?C_(Qe,St,se.obstacle):1;se.opacity+=(ke-se.opacity)*pe,se.mesh.material.opacity=se.opacity,se.mesh.material.depthWrite=se.opacity>.55,se.mesh.castShadow=se.opacity>.55,Se=Math.min(Se,se.opacity)}Ut.foregroundPostOpacity=Se;const Re=Eu(q.get(D.player.id));if(D.locked&&Eu(q.get(D.locked),Re),r.update(i.position,Re,k,C.value,{animate:me}),Ut.foregroundObjects=r.diagnostics(),D.mode==="playing"&&D.locked){const se=Math.hypot(Qe.x-Qe.lookX,Qe.z-Qe.lookZ),ke=Math.atan2(Qe.y-Qe.lookY,se)*180/Math.PI;Ut.lockedFrames++,Ut.minHorizontalStandoff=Math.min(Ut.minHorizontalStandoff??1/0,se),Ut.maxDownAngleDegrees=Math.max(Ut.maxDownAngleDegrees,ke)}e.render(t,i)}return{beginWorld:en,render:cn,resize:wt,renderer:e,scene:t,camera:i,cameraDiagnostics:()=>({...Ut,frame:{...Qe}}),landscapeDiagnostics:()=>({...Mn}),actorDiagnostics:()=>JSON.parse(JSON.stringify(O))}}const bu=Object.freeze({travel:6,duration:350});function ox(n,e){const t=new Set,i={attack:!1,dodge:!1,lock:!1},r=new Set,s=new Set;let o={x:0,z:0},c=0,l=!1,a=null,u=null;const h=document.querySelector("#touch"),d=document.querySelector("#stick"),f=d.querySelector("i"),g=matchMedia("(pointer:coarse)").matches||navigator.maxTouchPoints>0,x=(_,w)=>{try{_.setPointerCapture(w)}catch{}},m=_=>Number.isFinite(_.timeStamp)?_.timeStamp:performance.now(),p=()=>{t.clear(),r.clear(),s.clear(),o={x:0,z:0},a=null,u=null,Object.keys(i).forEach(_=>i[_]=!1),f.style.transform=""};window.addEventListener("blur",()=>{p(),e()}),document.addEventListener("visibilitychange",()=>{document.hidden&&(p(),e())}),window.addEventListener("keydown",_=>{if(_.code==="Escape"){e();return}l&&(["Space","KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE"].includes(_.code)&&_.preventDefault(),_.repeat||(_.code==="Space"&&(i.dodge=!0),_.code==="KeyE"&&(i.lock=!0)),t.add(_.code))}),window.addEventListener("keyup",_=>t.delete(_.code)),n.addEventListener("contextmenu",_=>_.preventDefault()),n.addEventListener("pointerdown",_=>{if(l){if(s.add(_.pointerId),u){u.click=!1;return}s.size===1&&(_.preventDefault(),x(n,_.pointerId),u={id:_.pointerId,x:_.clientX,y:_.clientY,travel:0,start:m(_),click:_.pointerType==="mouse"&&_.button===0&&_.isPrimary!==!1})}});const b=_=>{if((u==null?void 0:u.id)!==_.pointerId)return;const w=_.clientX-u.x,E=_.clientY-u.y;u.travel+=Math.hypot(w,E),u.travel>bu.travel&&(u.click=!1),c-=w*.006,u.x=_.clientX,u.y=_.clientY};n.addEventListener("pointermove",_=>{l&&b(_)}),n.addEventListener("pointerup",_=>{(u==null?void 0:u.id)===_.pointerId&&(b(_),l&&u.click&&s.size===1&&m(_)-u.start<=bu.duration&&(i.attack=!0),u=null),s.delete(_.pointerId)});for(const _ of["pointercancel","lostpointercapture"])n.addEventListener(_,w=>{(u==null?void 0:u.id)===w.pointerId&&(u=null),s.delete(w.pointerId)});d.addEventListener("pointerdown",_=>{!l||a!==null||(_.preventDefault(),a=_.pointerId,x(d,_.pointerId))}),d.addEventListener("pointermove",_=>{if(_.pointerId!==a)return;const w=d.getBoundingClientRect(),E=(_.clientX-w.x-w.width/2)/35,C=(_.clientY-w.y-w.height/2)/35,L=Math.max(1,Math.hypot(E,C));o={x:E/L,z:C/L},f.style.transform=`translate(${o.x*28}px,${o.z*28}px)`});const S=_=>{_.pointerId===a&&(a=null,o={x:0,z:0},f.style.transform="")};for(const _ of["pointerup","pointercancel","lostpointercapture"])d.addEventListener(_,S);for(const _ of h.querySelectorAll("button")){_.addEventListener("pointerdown",w=>{if(!l)return;w.preventDefault(),x(_,w.pointerId);const E=_.dataset.action;E==="guard"?(r.add(w.pointerId),t.add("touchGuard")):E in i&&(i[E]=!0)});for(const w of["pointerup","pointercancel","lostpointercapture"])_.addEventListener(w,E=>{_.dataset.action==="guard"&&(r.delete(E.pointerId),r.size||t.delete("touchGuard"))})}return{clear:p,get orbit(){return c},setActive(_){l=_,h.hidden=!_||!g,_||p()},sample(){const _=o.x+Number(t.has("KeyD"))-Number(t.has("KeyA")),w=o.z+Number(t.has("KeyS"))-Number(t.has("KeyW"));return{x:_*Math.cos(c)+w*Math.sin(c),z:w*Math.cos(c)-_*Math.sin(c),guard:t.has("KeyQ")||t.has("touchGuard"),...i}},consume(){Object.keys(i).forEach(_=>i[_]=!1)}}}const pa=Math.PI*2,_c=Object.freeze({wind:11.3,leaves:3.4,cloth:.38,footEarth:.25,footStone:.22,swish:.38,parry:1.3,block:.68,hit:.34,death:1.15,dodge:.52,evade:.26,signal:2.6,victory:4.8,defeat:2.1,route:.38,landmark:.75,rejoin:.55,consequence:.42,water:4.7,birds:2.8,discovery:.9}),ax=Object.freeze({swing:"swish",dodge:"dodge",evade:"evade",parry:"parry",block:"block",hit:"hit",death:"death",signal:"signal",route:"route",landmark:"landmark","route-rejoin":"rejoin","route-consequence":"consequence","environment-encounter":"leaves",discovery:"discovery","exploration-loop":"rejoin"});function cx(n){return n.type==="environment-encounter"?{water:"water",leaves:"leaves",birds:"birds",gust:"wind"}[n.encounter]??"leaves":ax[n.type]}function Th(n){let e=n>>>0;return()=>{e+=1831565813;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}const Tu=(n,e,t)=>Math.max(e,Math.min(t,n)),Mt=(n,e,t)=>n<0?0:(1-Math.exp(-n/e))*Math.exp(-n/t);function lx(n,e=0,t=24e3){if(!(n in _c))throw new Error(`Unknown generated sound: ${n}`);const i=_c[n],r=new Float32Array(Math.ceil(i*t)),s=Array.from(n).reduce((w,E)=>Math.imul(w,31)+E.charCodeAt(0),73)+e*997,o=Th(s),c=.95+o()*.1,l=Array.from({length:n==="wind"?28:n==="leaves"?36:16},()=>({at:o()*i,width:.025+o()*(n==="wind"?1.7:n==="leaves"?.32:.08),strength:.2+o()*.8})),a=(w,E,C)=>E.map((L,v)=>({hz:w*L*c,level:1/(1+v*.8),decay:C/(1+v*.62)})),u=a(n==="parry"?1320:620,[1,1.49,2.13,2.81,3.63],n==="parry"?.44:.15),h=a(n==="victory"?246:344,[1,2.71,4.09,5.43],n==="victory"?1.25:.52),d=h.map(w=>({...w,hz:w.hz*1.5})),f=a(n==="landmark"?420:240,n==="landmark"?[1,1.83,3.2]:[1,2.18,3.45],n==="landmark"?.09:.065),g=Array.from({length:4},(w,E)=>({at:.18+E*.43+o()*.13,hz:2650+o()*1800,length:.048+o()*.046,sweep:600+o()*1300}));let x=0,m=0;const p=(w,E)=>w<0?0:E.reduce((C,L)=>C+Math.sin(pa*L.hz*w)*Math.exp(-w/L.decay)*L.level,0);for(let w=0;w<r.length;w++){const E=w/t,C=o()*2-1;x+=.012*(C-x),m+=.18*(C-m);const L=C-m;let v=0;for(const F of l){const Y=(E-F.at)/F.width;Math.abs(Y)<3&&(v+=F.strength*Math.exp(-Y*Y*3))}let y=0;switch(n){case"wind":y=(x*1.1+m*.08)*(.26+v*.11);break;case"leaves":y=(L*.052+m*.11)*v;break;case"water":y=(m*.075+L*.042+x*.19)*(.5+v*.2);break;case"birds":for(const F of g){const Y=E-F.at;if(Y>0&&Y<F.length){const G=Y/F.length;y+=(Math.sin(pa*(F.hz*Y+F.sweep*Y*Y/(2*F.length)))+L*.07)*Math.pow(Math.sin(Math.PI*G),2)*.042}}break;case"discovery":y=p(E-.08,h)*.023*Mt(E-.08,.004,.36)+(m*.06+L*.01)*Mt(E,.04,.19);break;case"cloth":y=(m*.42+L*.018)*Mt(E,.014,.105)*(1+v*.4);break;case"footEarth":y=(x*2.3+m*.19)*Mt(E,.002,.024)+L*.06*Mt(E-.018,.005,.057)*(1+v);break;case"footStone":y=(x*2.1+m*.42)*Mt(E,.001,.018)+L*.062*Mt(E-.012,.002,.031)+Math.sin(pa*153*c*E)*.05*Mt(E,.001,.02);break;case"swish":y=(m*.18+L*.2)*Math.exp(-Math.pow((E-.17)/.055,2))*(.7+v*.22);break;case"parry":case"block":y=p(E,u)*.12*Mt(E,8e-4,2)+L*.36*Mt(E,7e-4,.018)+m*.27*Mt(E,.001,.044);break;case"hit":y=(x*3+m*.42)*Mt(E,.001,.04)+L*.1*Mt(E,.001,.018)+m*.2*Mt(E-.035,.012,.09);break;case"death":y=(x*2.2+m*.14)*Mt(E-.24,.004,.095)+(m*.32+L*.025)*Mt(E-.07,.028,.18)*(1+v*.4);break;case"dodge":y=(m*.43+L*.033)*Mt(E,.045,.13)+(x*1.7+m*.16)*Mt(E-.34,.002,.035);break;case"evade":y=(m*.18+L*.1)*Math.exp(-Math.pow((E-.075)/.042,2));break;case"signal":y=(m*.17+L*.024)*Mt(E,.04,.5)*(1+v*.7)+p(E-.14,h)*.058*Mt(E-.14,.002,3);break;case"victory":y=(x*.4+m*.05)*Mt(E,.4,1.4)+p(E-.18,h)*.045*Mt(E-.18,.005,5)+p(E-1.05,d)*.031*Mt(E-1.05,.012,4);break;case"defeat":y=(x*.65+m*.045)*Mt(E,.15,.45)+(x*1.2+m*.12)*Mt(E-.18,.004,.09);break;case"route":y=(m*.2+L*.025)*Mt(E,.02,.075)*(1+v*.4);break;case"landmark":y=(m*.1+L*.028)*Mt(E,.045,.19)*v+p(E,f)*.025*Mt(E,.001,1);break;case"rejoin":y=(m*.1+L*.025)*Mt(E,.07,.14)*v;break;case"consequence":y=(m*.3+L*.02)*Mt(E,.02,.12)+p(E,f)*.035*Mt(E,.002,1);break}const R=n==="wind"?.9:n==="leaves"?.09:.001,U=n==="wind"?1.8:n==="leaves"?.5:.025;r[w]=y*Math.min(1,E/R)*Math.min(1,(i-E)/U)}let b=0,S=0;for(const w of r)b+=w;const _=b/r.length;for(let w=0;w<r.length;w++)r[w]-=_*Math.min(1,w/48,(r.length-1-w)/48),S=Math.max(S,Math.abs(r[w]));if(S>.75)for(let w=0;w<r.length;w++)r[w]*=.75/S;return r[0]=r[r.length-1]=0,{name:n,variant:e,sampleRate:t,duration:i,data:r}}function ux(){let n=new WeakSet;return{read(e){const t=[];for(const i of e)n.has(i)||(n.add(i),t.push(i));return t},reset(){n=new WeakSet}}}function hx(n,e){if(e>=-19&&e<=24&&_a(n,e)<=.65+.2)return"footStone";const t=(s,o,c,l,a=0)=>{const u=n-s,h=e-o,d=Math.cos(a),f=Math.sin(a);return Math.abs(d*u-f*h)<=c/2+.08&&Math.abs(f*u+d*h)<=l/2+.08},i=Ht.points.find(s=>s.id==="stream-stones");if(i){for(let s=-2;s<=2;s++)if(t(i.x,i.z+s*.8,.88,.53,s*.08))return"footStone"}const r=Ht.points.find(s=>s.id==="valley-frame");if(r){for(let s=-2;s<=2;s++)if(t(r.x+s*.55,r.z-1.6,.4,.6))return"footStone"}return"footEarth"}function dx(){const n=new Map;return{reset(){n.clear()},update(e){const t=[];for(const i of[e.player,...e.enemies]){let r=n.get(i.id);if(!r){r={x:i.x,z:i.z,time:e.time,cycles:0},n.set(i.id,r);continue}const s=Math.hypot(i.x-r.x,i.z-r.z),o=e.time-r.time;if(r.x=i.x,r.z=i.z,r.time=e.time,i.hp<=0||!["idle","guard","run","walk"].includes(i.state)||s>3||o<=0)continue;const c=Math.floor(r.cycles*2);r.cycles=Sh(r.cycles,s,o);const l=Math.floor(r.cycles*2);for(let a=c+1;a<=l;a++)t.push({actor:i,right:a%2===1,surface:hx(i.x,i.z)})}return t}}}function fx(n={}){let e=n.context??null,t=null,i=null,r=!1,s=!1,o=!1,c=null,l=0,a=0,u=0,h=0,d="playing",f=0;const g=[],x=new Set,m=ux(),p=dx(),b=Th(8173),S={events:0,steps:0,unknownEvents:[],categories:{}};function _(){if(i)return!0;try{e??(e=new(globalThis.AudioContext||globalThis.webkitAudioContext)),t=e.createGain(),t.gain.value=0,t.connect(e.destination),i={};for(const U of Object.keys(_c))i[U]=Array.from({length:U==="wind"||U==="leaves"?3:4},(F,Y)=>{const G=lx(U,Y),H=e.createBuffer(1,G.data.length,G.sampleRate);return H.copyToChannel(G.data,0),H});return!0}catch{return!1}}function w(){for(const U of[...x]){U.source.onended=null;try{U.source.stop()}catch{}for(const F of U.nodes)F.disconnect();x.delete(U)}}function E(U,F){if(!U||!F||U.id==="player")return{gain:1,pan:0};const Y=U.x-F.player.x,G=U.z-F.player.z,H=Math.hypot(Y,G);return{gain:1/(1+H*.12),pan:Tu((Y*Math.cos(f)-G*Math.sin(f))/Math.max(3,H),-.9,.9)}}function C(U,{at:F=(e==null?void 0:e.currentTime)??0,gain:Y=1,pan:G=0,rate:H=1}={}){if(!i||!r||!s||e.state!=="running"||!(U in i))return;const J=e.createBufferSource(),W=e.createGain(),le=[J,W];if(J.buffer=i[U][h++%i[U].length],J.playbackRate.value=H,W.gain.value=Y,J.connect(W),e.createStereoPanner){const we=e.createStereoPanner();we.pan.value=G,W.connect(we),we.connect(t),le.push(we)}else W.connect(t);const _e={source:J,nodes:le};x.add(_e),J.onended=()=>{for(const we of le)we.disconnect();x.delete(_e)},J.start(F),S.categories[U]=(S.categories[U]??0)+1}function L(U){l++,g.length=0,w(),m.reset(),p.reset(),c=U,d="playing",h=0,U&&p.update(U),a=(e==null?void 0:e.currentTime)??0,u=a+.8}function v(U){var H;c!==U&&L(U),r=!0,s=!1;const Y=++l;if(!_())return r=!1,g.length=0,Promise.resolve(!1);const G=((H=e.resume)==null?void 0:H.call(e))??Promise.resolve();return Promise.resolve(G).then(()=>Y!==l||!r?!1:(t.gain.cancelScheduledValues(e.currentTime),t.gain.setValueAtTime(0,e.currentTime),t.gain.linearRampToValueAtTime(o?0:.78,e.currentTime+.08),s=!0,a=e.currentTime,u=a+.6,!0)).catch(()=>(Y===l&&(r=!1,s=!1,g.length=0),!1))}function y(){var U;r=!1,s=!1,l++,g.length=0,w(),t&&(t.gain.cancelScheduledValues(e.currentTime),t.gain.setValueAtTime(0,e.currentTime)),(U=e==null?void 0:e.suspend)==null||U.call(e).catch(()=>{})}function R(U,F,Y=0){c!==U&&L(U),f=Y;const G=m.read(U.events);if(S.events+=G.length,!r||(g.push(...G),!s||!i||e.state!=="running"))return G;if(s&&i&&e.state==="running"){const H=e.currentTime;H>=a&&(C("wind",{gain:.7,pan:b()*.4-.2}),a=H+8.1+b()*.7),H>=u&&(C("leaves",{gain:.35+b()*.18,pan:b()*1.4-.7,rate:.88+b()*.24}),u=H+2.3+b()*3.5)}for(const H of g.splice(0)){const J=cx(H);if(!J){S.unknownEvents.includes(H.type)||S.unknownEvents.push(H.type);continue}const W=[U.player,...U.enemies].find(_e=>_e.id===(H.type==="swing"||H.type==="dodge"?H.source:H.target)),le=E(W,U);C(J,{...le,rate:J==="signal"?1:.96+b()*.08}),(J==="swish"||J==="dodge")&&C("cloth",{...le,gain:le.gain*.45})}if(U.mode==="playing")for(const H of p.update(U)){S.steps++;const J=E(H.actor,U);C(H.surface,{...J,gain:J.gain*.8,pan:Tu(J.pan+(H.right?.045:-.045),-1,1),rate:.94+b()*.12}),C("cloth",{...J,gain:J.gain*.23,rate:.88+b()*.16})}return U.mode!==d&&((U.mode==="victory"||U.mode==="defeat")&&C(U.mode),d=U.mode),G}return{resume:v,pause:y,reset:L,update:R,play:C,setMuted(U){o=!!U,t&&(t.gain.cancelScheduledValues(e.currentTime),t.gain.setTargetAtTime(r&&!o?.78:0,e.currentTime,.02))},diagnostics(){return{available:!!i,contextState:(e==null?void 0:e.state)??"unavailable",active:r,ready:s,muted:o,pendingEvents:g.length,liveVoices:x.size,...structuredClone(S),provenance:"Original synthesized PCM generated at startup; no runtime audio files or field recordings."}}}}const So=document.querySelector("#scene"),zi=document.querySelector("#menu"),wh=document.querySelector("#hud"),Oi=document.querySelector("#message"),Rr=document.querySelector("#start"),xc=document.querySelector("#notice"),wu=document.querySelector("#objective"),ma=document.querySelector("#exploration");let Qn,Pt=Lu(),Jn=!1,Er=!1,oo=0,br=!1;const ps=fx(),ao={scope:"Actual rAF intervals and JavaScript advance/render call durations in this browser; not isolated GPU time or physical-device performance. Includes each recorded mode; bounded to first3000 callbacks.",samples:[],omitted:0};let ga=null;Oi.textContent=Ph;function px(){Oi.replaceChildren(...Ru.map(n=>{const e=document.createElement("span");return e.className="ending-phrase",e.textContent=n,e}))}zi.dataset.mode="intro";function Zc(){ps.pause(),Jn&&(Jn=!1,Er=!0,$n.setActive(!1),zi.hidden=!1,zi.dataset.mode="pause",Oi.textContent="風の中で、ひと息。",Rr.textContent="続ける")}const $n=ox(So,Zc);try{Qn=sx(So)}catch(n){throw Oi.textContent="描画を開始できませんでした。WebGLが利用可能なブラウザで再読み込みしてください。",Rr.disabled=!0,n}Rr.addEventListener("click",()=>{br||(Er||(Pt=Lu(),Qn.beginWorld(Pt)),Er=!1,Jn=!0,zi.hidden=!0,zi.dataset.mode="playing",wh.hidden=!1,xc.textContent="",$n.setActive(!0),ps.resume(Pt),oo=performance.now())});document.querySelector("#pause").addEventListener("click",Zc);window.addEventListener("resize",()=>Qn.resize());So.addEventListener("webglcontextlost",n=>{n.preventDefault(),br=!0,Zc(),Rr.disabled=!0,Oi.textContent="描画を復旧しています…"});So.addEventListener("webglcontextrestored",()=>{br=!1,Rr.disabled=!1,Oi.textContent="描画が復旧しました。",Qn.resize()});function Ah(n){requestAnimationFrame(Ah);const e=ga===null?null:n-ga;ga=n;const t=oo?Math.min(.25,(n-oo)/1e3):0;oo=n;let i=0;if(Jn){const s=performance.now();Bh(Pt,t,$n.sample())&&$n.consume(),i=performance.now()-s,document.querySelector("#health i").style.width=Pt.player.hp+"%",document.querySelector("#posture i").style.width=Math.min(100,Pt.player.posture)+"%";const o=Pt.enemies.find(d=>d.id===Pt.locked);document.querySelector("#enemy").textContent=o?`対峙　${o.hp} / 100`:"";const c=Lh(Pt);wu.textContent!==c&&(wu.textContent=c);const l=Fh(Pt);ma.textContent!==l&&(ma.textContent=l),ma.hidden=!l;const a=document.querySelector("[data-action=lock]"),u=Mc(Pt)?"灯す":"注視";a.textContent!==u&&(a.textContent=u);const h=ps.update(Pt,t,$n.orbit);for(const d of h)["parry","block","death"].includes(d.type)&&(xc.textContent=d.type==="parry"?"弾き":d.type==="block"?"受け":"決着");Pt.events.length||(xc.textContent=""),Pt.mode!=="playing"&&(Jn=!1,Er=!1,$n.setActive(!1),wh.hidden=!0,zi.hidden=!1,zi.dataset.mode=Pt.mode,Pt.mode==="victory"?px():Oi.textContent="灯はまだ消えている。もう一度、山道へ。",Rr.textContent="もう一度")}!Jn&&!Er&&!br&&Pt.mode!=="playing"&&ps.update(Pt,t,$n.orbit);let r=null;if(!br){const s=performance.now();Qn.render(Pt,t,$n.orbit,{animate:Jn||Pt.mode==="victory"||Pt.mode==="defeat"}),r=performance.now()-s}ao.samples.length<3e3?ao.samples.push({mode:Pt.mode,running:Jn,intervalMs:e,simulationMs:i,renderCallMs:r}):ao.omitted++}requestAnimationFrame(Ah);new URLSearchParams(location.search).has("diagnostic")&&Object.defineProperty(window,"freshDiagnostics",{value:(n=!1)=>JSON.parse(JSON.stringify({world:Pt,running:Jn,paused:Er,contextLost:br,input:{orbit:$n.orbit},audio:ps.diagnostics(),render:Qn.renderer.info.render,camera:Qn.cameraDiagnostics(),landscape:Qn.landscapeDiagnostics(),actors:Qn.actorDiagnostics(),...n?{timings:ao}:{}})),writable:!1});
