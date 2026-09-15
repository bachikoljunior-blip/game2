import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {shoulderPlate,upperSleeve,tunicSurface,tiedHair,hairTie} from './character-sculpt.js';
import {nativeCollar,nativeFigure,nativeGeometry,tailoredHead} from './character-assets.js';

const material=new T.MeshBasicMaterial({side:T.DoubleSide});
function mesh(g){const m=new T.Mesh(g,material);m.updateMatrixWorld(true);return m;}
function closedEdges(g){
  const edges=new Map(),p=g.attributes.position,key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e7)).join(',');
  const indices=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i);
  for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){
    const u=key(a),v=key(b);if(u===v)continue;const k=u<v?`${u}/${v}`:`${v}/${u}`;edges.set(k,(edges.get(k)||0)+1);
  }
  for(const count of edges.values())assert.equal(count,2,'a solid shell has two faces at every welded edge');
}

test('the shoulder shells are closed and fitted just outside the actual curved sleeves',()=>{
  for(const side of [-1,1]){
    const sleeve=mesh(upperSleeve(side));
    for(let row=0;row<4;row++){
      const g=shoulderPlate(side,row),p=g.attributes.position;closedEdges(g);
      for(let i=0;i<p.count/2;i++){
        const point=new T.Vector3().fromBufferAttribute(p,i),outward=new T.Vector3(point.x,0,point.z).normalize();
        const hit=new T.Raycaster(point.clone().addScaledVector(outward,.02),outward.clone().negate(),0,.05).intersectObject(sleeve)[0];
        assert.ok(hit,'plate must have a real sleeve beneath it');
        const clearance=hit.distance-.02;
        assert.ok(clearance>=.002&&clearance<=.006,'solid plate should sit above cloth without the former open gap');
      }
      g.dispose();
    }
    sleeve.geometry.dispose();
  }
});

test('the neckline stays outside native skin and its hem joins the actual tunic surface',()=>{
  const shirt=mesh(tunicSurface());
  for(const id of ['player','sentinel','retainer','warden']){
    const collar=nativeCollar(nativeFigure(id).head),p=collar.attributes.position,uv=collar.attributes.uv,head=mesh(tailoredHead(nativeFigure(id).head));
    for(let index=0;index<p.count;index++)if(uv.getY(index)===0||uv.getY(index)===1){
      const angle=uv.getX(index)*Math.PI*2,outward=new T.Vector3(Math.sin(angle),0,Math.cos(angle));
      const support=uv.getY(index)===0?head:shirt,shift=uv.getY(index)===0?0:.315;
      {
        const point=new T.Vector3().fromBufferAttribute(p,index);point.y+=shift;
        const hit=new T.Raycaster(point.clone().addScaledVector(outward,.02),outward.clone().negate(),0,.05).intersectObject(support)[0];
        assert.ok(hit,`${id}: neckline/hem must be supported by the actual skin or garment`);
        const gap=hit.distance-.02;assert.ok(gap>=-.0005&&gap<=.006,`${id}: unsupported or intersecting collar seam ${gap}`);
      }
    }
    collar.dispose();head.geometry.dispose();
  }
  shirt.geometry.dispose();
});

test('the cheek guard has a continuous solid rim and leaves the real nose clear',()=>{
  const guard=mesh(nativeGeometry(nativeFigure('warden').mask));closedEdges(guard.geometry);
  const face=mesh(nativeGeometry(nativeFigure('warden').head));
  for(const y of [.125,.130,.14]){
    const ray=new T.Raycaster(new T.Vector3(0,y,-.8),new T.Vector3(0,0,1));
    assert.ok(ray.intersectObject(face).length,'probe must intersect the actual native nose');
    assert.equal(ray.intersectObject(guard).length,0,'a cheek guard must not create a copied black nose');
  }
  guard.geometry.dispose();face.geometry.dispose();
});

test('the tied hair is closed and its winding band cannot expose a cap through the hair centre',()=>{
  const hair=mesh(tiedHair()),band=mesh(hairTie());closedEdges(hair.geometry);
  for(const x of [-.008,0,.008]){
    const ray=new T.Raycaster(new T.Vector3(x,.36,-.03),new T.Vector3(0,-.9,.5).normalize());
    const hits=ray.intersectObjects([hair,band]);assert.ok(hits.length);assert.equal(hits[0].object,hair,'the knot centre shows opaque hair before the winding band');
  }
  hair.geometry.dispose();band.geometry.dispose();
});
