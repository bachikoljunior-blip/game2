import * as T from 'three';

// Only newly assembled, immutable batches enter here. Exact byte equality
// includes every attribute, so UV seams, hard normals and signed zero survive.
// Do not remap cached contacts, mutable ranges or morph/cloth/head metadata.
export function indexStaticCharacterGeometry(geometry){
  const entries=Object.entries(geometry.attributes),count=geometry.attributes.position?.count;
  if(geometry.index||!count||Object.keys(geometry.userData).length||
    Object.keys(geometry.morphAttributes).length||geometry.morphTargetsRelative)return geometry;
  if(entries.some(([,a])=>a.isInterleavedBufferAttribute||a.isInstancedBufferAttribute||
    a.count!==count||a.usage!==T.StaticDrawUsage||a.updateRanges.length||a.version!==0||
    a.onUploadCallback!==T.BufferAttribute.prototype.onUploadCallback))return geometry;
  const sources=entries.map(([,a])=>({bytes:new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),stride:a.itemSize*a.array.BYTES_PER_ELEMENT}));
  const buckets=new Map(),unique=[],indices=new Uint32Array(count);
  const equal=(a,b)=>sources.every(({bytes,stride})=>{
    for(let k=0;k<stride;k++)if(bytes[a*stride+k]!==bytes[b*stride+k])return false;
    return true;
  });
  for(let vertex=0;vertex<count;vertex++){
    let hash=2166136261;
    for(const {bytes,stride} of sources)for(let k=0;k<stride;k++)hash=Math.imul(hash^bytes[vertex*stride+k],16777619);
    let bucket=buckets.get(hash),index=bucket?.find(i=>equal(vertex,unique[i]));
    if(index===undefined){index=unique.length;unique.push(vertex);if(bucket)bucket.push(index);else buckets.set(hash,[index]);}
    indices[vertex]=index;
  }
  if(unique.length===count)return geometry;
  for(const [name,attribute] of entries){
    const packed=attribute.clone(),array=new attribute.array.constructor(unique.length*attribute.itemSize);
    const source=new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength),
      target=new Uint8Array(array.buffer),stride=attribute.itemSize*attribute.array.BYTES_PER_ELEMENT;
    for(let i=0;i<unique.length;i++)target.set(source.subarray(unique[i]*stride,(unique[i]+1)*stride),i*stride);
    packed.array=array;packed.count=unique.length;geometry.setAttribute(name,packed);
  }
  // Index entries retain original corner order. Groups and drawRange therefore
  // address the same triangles; bounds and materials need no alteration.
  geometry.setIndex(new T.BufferAttribute(unique.length<=65535?new Uint16Array(indices):indices,1));
  return geometry;
}
