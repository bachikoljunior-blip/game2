import * as T from 'three';

export const spatialCell = (x,z) => `${Math.floor(x/16)},${Math.floor(z/16)}`;

// Keep each matrix and color byte-for-byte. Culling changes the submitted work,
// never the authored population. The margin includes the largest wind offset.
export function partitionInstances(source) {
  const cells=new Map(),matrix=new T.Matrix4(),color=new T.Color();
  for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);
    const key=spatialCell(matrix.elements[12],matrix.elements[14]);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(i);
  }
  return [...cells.values()].map(indices=>{
    const mesh=new T.InstancedMesh(source.geometry,source.material,indices.length);
    mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
    indices.forEach((index,i)=>{
      source.getMatrixAt(index,matrix);mesh.setMatrixAt(i,matrix);
      if(source.instanceColor){source.getColorAt(index,color);mesh.setColorAt(i,color);}
    });
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.3;
    return mesh;
  });
}
