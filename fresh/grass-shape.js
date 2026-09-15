import {PlaneGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original three-leaf tuft. Each leaf still has only two longitudinal segments.
// Width crosses the curved centreline: the bend is not a wider flat spear.
const LEAVES=[
  {angle:0,rows:[[0,0,0,.024],[.004,.46,.022,.056],[.014,.79,.115,.0012]]},
  {angle:2.12,rows:[[0,0,0,.022],[-.008,.58,.055,.048],[-.015,.54,.175,.001]]},
  {angle:4.39,rows:[[0,0,0,.018],[.012,.40,.036,.04],[.025,.34,.145,.0008]]}
];

export function createGrassClumpGeometry(){
  const blades=LEAVES.map(leaf=>{
    const geometry=new PlaneGeometry(1,1,1,2),positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const row=Math.round((positions.getY(i)+.5)*2),[x,y,z,width]=leaf.rows[row];
      positions.setXYZ(i,x+Math.sign(positions.getX(i))*width/2,y,z);
    }
    geometry.rotateY(leaf.angle);geometry.computeVertexNormals();return geometry;
  });
  const geometry=mergeGeometries(blades);blades.forEach(blade=>blade.dispose());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
