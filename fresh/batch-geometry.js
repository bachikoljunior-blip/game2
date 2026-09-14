// Preserve every vertex and triangle while making mixed generated parts mergeable.
export function indexForBatch(geometry){
  if(!geometry.index)geometry.setIndex(Array.from({length:geometry.getAttribute('position').count},(_,i)=>i));
  return geometry;
}
