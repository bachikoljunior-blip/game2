import test from 'node:test';
import assert from 'node:assert/strict';
import { CylinderGeometry, Matrix4, PlaneGeometry, Quaternion, ShaderLib, Vector3 } from 'three';
import { beamSurfaceNormal, bendFrame, createVegetationPhysics, harmonicResponse, LEAF_MODELS, rotateVector, sampleLeafMotion, setLeafAttachment, stepDampedSpring, transformLeafGeometry, VEGETATION_MODELS } from './vegetation-physics.js';
import { installWindMaterial, sampleWind } from './wind.js';

const near=(a,b,tolerance=1e-8)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<tolerance,`${a} != ${b}`);
const difference=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function specimen(field=sampleWind){
  const system=createVegetationPhysics(field),wood=system.addBeam({kind:'wood',start:[0,2,0],end:[0,7,0]}),
    branch=system.addBeam({kind:'woodBranch',start:[0,5.5,0],end:[1.8,6.5,.6],parent:wood}),
    twig=system.addBeam({kind:'twig',start:[1.8,6.5,.6],end:[2.35,6.6,.8],parent:branch}),
    bamboo=system.addBeam({kind:'bamboo',start:[5,2,0],end:[5,13,0]});
  return {system,wood,branch,twig,bamboo};
}

test('unforced modes retain inertia, cross rest, and dissipate mechanical energy',()=>{
  const model={mass:.15,stiffness:11,damping:.24},state={position:.1,velocity:0};
  let energy=.5*model.stiffness*state.position**2,crossed=false;
  for(let t=0;t<4;t+=1/240){
    stepDampedSpring(state,0,1/240,model);
    const next=.5*model.mass*state.velocity**2+.5*model.stiffness*state.position**2;
    assert.ok(next<=energy+1e-12,'damping cannot inject energy');energy=next;crossed||=state.position<0;
  }
  assert.ok(crossed,'a spring carries momentum through rest instead of following a prescribed displacement');
  assert.ok(energy<1e-7);
  const light={position:0,velocity:0},heavy={position:0,velocity:0};
  stepDampedSpring(light,1,.06,model);stepDampedSpring(heavy,1,.06,{...model,mass:model.mass*8});
  assert.ok(light.position>heavy.position*4,'mass changes response before equilibrium');
});

test('constant wind reaches force/stiffness while different species retain their separate compliance',()=>{
  const field=()=>({x:.48,z:.16,pressure:Math.hypot(.48,.16)}),{system,wood,bamboo}=specimen(field);
  system.update(0);
  const w=system.beams[wood],b=system.beams[bamboo];
  assert.ok(Math.hypot(b.x.position,b.z.position)>Math.hypot(w.x.position,w.z.position)*35);
  for(let t=1/60;t<12;t+=1/60)system.update(t);
  near([w.x.position,w.z.position],[.48*4*w.area/w.stiffness,.16*4*w.area/w.stiffness],1e-10);
  assert.ok(VEGETATION_MODELS.wood.mass>VEGETATION_MODELS.bamboo.mass);
  assert.ok(VEGETATION_MODELS.wood.stiffness>VEGETATION_MODELS.bamboo.stiffness*50);
});

test('the root ring is pinned and every child inherits the exact deformed attachment frame',()=>{
  const {system,wood,branch,twig}=specimen();
  const initialRoot=[[.2,0,0],[-.2,0,.04],[0,0,-.2]].map(p=>[p[0],p[1]+2,p[2]]);
  for(let t=0;t<20;t+=1/30){
    system.update(t);
    for(const [i,p] of [[.2,0,0],[-.2,0,.04],[0,0,-.2]].entries())near(system.frameAt(wood,p).position,initialRoot[i]);
    for(const id of [branch,twig]){
      const child=system.beams[id],attachment=system.frameAt(child.parent,child.attachment);
      near(child.origin,attachment.position);
      near(system.frameAt(id,[0,0,0]).position,attachment.position);
      const offset=id*12,data=system.textureUniform.value.image.data;
      near([...data.slice(offset,offset+3)],attachment.position,1e-6);
    }
  }
});

test('cantilever bending preserves length to the small-slope error bound and transports normals with its Jacobian',()=>{
  const length=1.8,tip=[.17,-.06];let total=0,previous=bendFrame([0,0,0],length,tip).position;
  for(let i=1;i<=1000;i++){
    const current=bendFrame([0,length*i/1000,0],length,tip).position;total+=Math.hypot(...difference(current,previous));previous=current;
  }
  assert.ok(Math.abs(total-length)/length<.00006,'no rubber stretch along the support');
  for(const y of [.1,.6,1.3,1.75]){
    const p=[.023,y,.015],normal=[1,0,0],transported=beamSurfaceNormal(p,normal,length,tip),eps=1e-5;
    const dy=difference(bendFrame([p[0],y+eps,p[2]],length,tip).position,bendFrame([p[0],y-eps,p[2]],length,tip).position),
      dz=difference(bendFrame([p[0],y,p[2]+eps],length,tip).position,bendFrame([p[0],y,p[2]-eps],length,tip).position);
    assert.ok(Math.abs(dot(transported,dy))/Math.hypot(...dy)<1e-7);
    assert.ok(Math.abs(dot(transported,dz))/Math.hypot(...dz)<1e-7);
  }
});

test('a real transformed leaf keeps one petiole, per-leaf direction, length, and support-local normal',()=>{
  const system=createVegetationPhysics(sampleWind),id=system.addBeam({kind:'twig',start:[2,4,3],end:[3,4,3]}),
    g=new PlaneGeometry(.4,.08);g.translate(.2,0,0);setLeafAttachment(g,{length:.4,kind:1});
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.7),matrix=new Matrix4().compose(new Vector3(2.4,4,3),q,new Vector3(1.3,1,1));
  transformLeafGeometry(g,matrix);system.bindGeometry(g,id);system.update(0);
  const pivots=g.getAttribute('leafPivot'),direction=g.getAttribute('leafDirection'),axes=g.getAttribute('leafAxis');
  for(let i=0;i<pivots.count;i++){
    near([pivots.getX(i),pivots.getY(i),pivots.getZ(i)],system.localPoint(id,[2.4,4,3]),1e-6);
    assert.ok(Math.abs(Math.hypot(direction.getX(i),direction.getY(i),direction.getZ(i))-1)<1e-6);
    assert.ok(Math.abs(axes.getW(i)-.52)<1e-6);
  }
  // A cylinder's bind pose reconstructs the actual authoring transform, so
  // shader normals must not be left in world space and rotated a second time.
  const cylinder=new CylinderGeometry(.01,.02,1,5,3);cylinder.rotateZ(-Math.PI/2);cylinder.translate(2.5,4,3);
  const before=cylinder.getAttribute('normal').array.slice();system.bindGeometry(cylinder,id);
  for(let i=0;i<cylinder.getAttribute('normal').count;i++){
    const n=cylinder.getAttribute('normal'),world=rotateVector([n.getX(i),n.getY(i),n.getZ(i)],system.beams[id].restRotation);
    near(world,[...before.slice(i*3,i*3+3)],1e-6);
  }
});

test('leaf torsional response depends on inertia and damping, decorrelates neighbors, and remains gentle',()=>{
  assert.ok(LEAF_MODELS.maple.inertia>LEAF_MODELS.bamboo.inertia*3);
  const a=[],b=[];let maxHinge=0,maxCurl=0;
  for(let t=0;t<12;t+=1/120){
    const x=sampleLeafMotion(t,.3,.64,1),y=sampleLeafMotion(t,1.7,.64,1);
    a.push(x.hinge);b.push(y.hinge);maxHinge=Math.max(maxHinge,Math.abs(x.hinge));maxCurl=Math.max(maxCurl,Math.abs(x.curl));
  }
  assert.ok(maxHinge>.045&&maxHinge<.17);assert.ok(maxCurl<.06);
  const correlation=dot(a,b)/Math.sqrt(dot(a,a)*dot(b,b));assert.ok(Math.abs(correlation)<.65,'neighbor blades do not flap as one card');
  assert.ok(Math.abs(harmonicResponse(0,40,Math.PI/2,8,.5))<.05,'inertia rejects forcing far above a mode frequency');
});

test('30, 60 and 144 Hz advance the same dynamics; pause is exact and retry reestablishes time-zero equilibrium',()=>{
  const trajectories=[];
  for(const fps of [30,60,144]){
    const {system,bamboo}=specimen();system.update(0);const initial=system.textureUniform.value.image.data.slice();
    for(let frame=1;frame<=fps*9;frame++)system.update(frame/fps);
    const state=system.beams[bamboo];trajectories.push([state.x.position,state.z.position]);
    const held=system.textureUniform.value.image.data.slice();system.update(9);assert.deepEqual(system.textureUniform.value.image.data,held);
    system.update(0);assert.deepEqual(system.textureUniform.value.image.data,initial);
  }
  near(trajectories[0],trajectories[1],.000004);near(trajectories[1],trajectories[2],.000008);
});

test('visible and depth programs fetch the same three mode texels and calculate position/normal once',()=>{
  const {system}=specimen();system.update(0);const clock={value:0,vegetation:system};
  for(const source of [ShaderLib.standard.vertexShader,ShaderLib.depth.vertexShader]){
    const shader={uniforms:{},vertexShader:source},material={};installWindMaterial(material,clock);material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.vegetationModes,system.textureUniform);
    assert.equal((shader.vertexShader.match(/vegetationDeform\(windPosition,windNormal\)/g)??[]).length,1);
    assert.equal((shader.vertexShader.match(/vegetationTexel\(offset/g)??[]).length,3);
    assert.ok(shader.vertexShader.includes('objectNormal=windNormal;'));
    assert.ok(shader.vertexShader.includes('transformed=windPosition;'));
  }
});
