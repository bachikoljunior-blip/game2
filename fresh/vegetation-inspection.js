import * as T from 'three';

// Inspection only: choose a fixed, reproducible camera against real woody
// geometry. It never changes the gameplay camera, fades, world or vegetation.
export function chooseVegetationInspection(view,specimen,{close=false,time=8}={}){
  const physics=view.vegetation,sample=specimen.inspection[0],asVector=p=>new T.Vector3(...p);
  if(!sample)throw new Error('Inspection requires an actual supported twig.');
  const current=(id,point)=>asVector(physics.frameAt(id,physics.localPoint(id,point)).position),
    root=new T.Vector3(specimen.x,specimen.y,specimen.z),tip=root.clone().add(new T.Vector3(0,specimen.height,0)),
    target=close?current(sample.beam,sample.point):root.clone().lerp(tip,.51),
    subject=close?[current(sample.beam,sample.root),current(sample.beam,sample.tip),target]:
      [root.clone().lerp(tip,.035),root.clone().lerp(tip,.45),root.clone().lerp(tip,.97),...specimen.inspection.map(s=>current(s.beam,s.point))];
  const ownSupports=new Set();
  for(const beam of physics.beams){let id=beam.id;while(id!==null&&id!==specimen.beam)id=physics.beams[id].parent;if(id===specimen.beam)ownSupports.add(beam.id);}
  const excluded=new Set();
  if(close){for(let id=sample.beam;id!==null;id=physics.beams[id].parent)excluded.add(id);}
  else for(const id of ownSupports)excluded.add(id);
  const blockers=[],selfBlockers=[],otherBlockers=[],material=new T.MeshBasicMaterial({side:T.DoubleSide});
  view.scene.traverse(mesh=>{
    if(!mesh.name.startsWith('bamboo-culms-')&&!mesh.name.startsWith('maple-wood-')&&!mesh.name.startsWith('bamboo-leaves-'))return;
    const source=mesh.geometry,indices=[],self=[],other=[],p=source.attributes.position,support=source.attributes.windSupport;
    for(let i=0;i<source.index.count;i+=3){
      const a=source.index.getX(i);if(source.attributes.leafPivot.getW(a)!==0)continue;
      const triangle=[a,source.index.getX(i+1),source.index.getX(i+2)],id=support.getW(a);
      if(!excluded.has(id))indices.push(...triangle);
      (ownSupports.has(id)?self:other).push(...triangle);
    }
    if(!self.length&&!other.length)return;
    const positions=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++)positions.set(physics.deformVertex(source,i,time),i*3);
    const position=new T.BufferAttribute(positions,3);
    for(const [faces,collection] of [[indices,blockers],[self,selfBlockers],[other,otherBlockers]])if(faces.length){
      const g=new T.BufferGeometry();g.setAttribute('position',position);g.setIndex(faces);g.computeBoundingSphere();
      const proxy=new T.Mesh(g,material);proxy.updateMatrixWorld();collection.push(proxy);
    }
  });
  const ray=new T.Raycaster(),direction=new T.Vector3(),normal=asVector(sample.normal??[0,1,0]);
  const probeCamera=new T.PerspectiveCamera(view.camera.fov,view.camera.aspect,.1,230);
  let best;
  for(const elevation of close?[.42,.7,.98]:[.08,.22,.36])for(let k=0;k<32;k++){
    const a=k*Math.PI/16,distance=close?1.12:specimen.height*1.6,
      position=target.clone().add(new T.Vector3(Math.cos(a)*Math.cos(elevation),Math.sin(elevation),Math.sin(a)*Math.cos(elevation)).multiplyScalar(distance));
    probeCamera.position.copy(position);probeCamera.lookAt(target);probeCamera.updateMatrixWorld();
    const projections=(close?subject:[root,tip]).map(p=>p.clone().project(probeCamera));
    if(projections.some(p=>Math.abs(p.x)>.90||Math.abs(p.y)>.90||p.z<=-1||p.z>=1))continue;
    let occluded=0;
    // The centre and four nearby rays reserve visible space around each
    // subject point, so a trunk skimming its centre cannot dominate the crop.
    const right=new T.Vector3(1,0,0).applyQuaternion(probeCamera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(probeCamera.quaternion),margin=close?.09:.15;
    for(const point of subject)for(const [dx,dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
      const pointOnSubject=point.clone().addScaledVector(right,dx*margin).addScaledVector(up,dy*margin),distance=direction.subVectors(pointOnSubject,position).length();
      ray.set(position,direction.multiplyScalar(1/distance));ray.near=.02;ray.far=distance-.025;
      if(ray.intersectObjects(blockers,false).length)occluded++;
    }
    const face=Math.abs(normal.dot(position.clone().sub(target).normalize())),score=occluded*10+(close?(1-face):0)+Math.abs(elevation-(close?.7:.22))*.01;
    if(!best||score<best.score)best={position:position.toArray(),target:target.toArray(),selectionOccludedRays:occluded,totalRays:subject.length*5,score,elevation,azimuth:a,subject:subject.map(p=>p.toArray()),faceCosine:face};
  }
  if(!best)throw new Error('No inspection camera contains the actual subject.');
  // Diagnostic recount only, AFTER the original camera selection. A ray can
  // hit both classes, so "all" is a union count rather than self + other.
  probeCamera.position.fromArray(best.position);probeCamera.lookAt(target);probeCamera.updateMatrixWorld();
  const right=new T.Vector3(1,0,0).applyQuaternion(probeCamera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(probeCamera.quaternion),margin=close?.09:.15;
  const woodyOcclusion={self:0,other:0,all:0,totalRays:best.totalRays,time};
  for(const point of subject)for(const [dx,dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
    const end=point.clone().addScaledVector(right,dx*margin).addScaledVector(up,dy*margin),distance=direction.subVectors(end,probeCamera.position).length();
    ray.set(probeCamera.position,direction.multiplyScalar(1/distance));ray.near=.02;ray.far=distance-.025;
    const self=ray.intersectObjects(selfBlockers,false).length>0,other=ray.intersectObjects(otherBlockers,false).length>0;
    woodyOcclusion.self+=Number(self);woodyOcclusion.other+=Number(other);woodyOcclusion.all+=Number(self||other);
  }
  [...blockers,...selfBlockers,...otherBlockers].forEach(m=>m.geometry.dispose());material.dispose();
  return {...best,woodyOcclusion,
    selectionScope:close?'other woody objects and non-ancestor wood of the target plant; target twig and ancestor supports excluded':'other woody objects; entire target plant excluded',
    geometryScope:'registered bamboo culms, maple wood, and woody triangles in bamboo leaf batches; leaf blades and other scene meshes are outside these counts',
    scope:'fixed camera selected with the stated self-support exclusions; self/other/all recount uses the same rays after selection. Self means every support descending from the target plant root. All includes self-intersections, including rays aimed into the target stem. Counts concern sampled woody geometry, not complete plant visibility or natural motion; media review is required'};
}
