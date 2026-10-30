import * as THREE from 'three';
import { NAIL_REGIONS } from './tripo-nails';

/**
 * The scan is anatomically exact: tendons, knuckles and veins read as "bony" on a design page.
 * Soften the skin with a few passes of Laplacian smoothing, leaving the fitted nail beds untouched so the
 * nail shells keep sitting exactly where they were calibrated. Works on the mesh's own vertex frame.
 */
export function softenHandGeometry(geometry:THREE.BufferGeometry, meshWorld:THREE.Matrix4, options:{iterations?:number;strength?:number}={}):void {
  const iterations=options.iterations??9, strength=options.strength??.5;
  const position=geometry.getAttribute('position'), index=geometry.getIndex();
  if(!index||position.count<3)return;
  const count=position.count;
  // UV seams duplicate vertices: weld them by position so a seam vertex sees the whole ring around it and
  // both copies end up in the same place (otherwise the seams open into cracks)
  const canon=new Uint32Array(count), seen=new Map<string,number>();
  for(let i=0;i<count;i++){
    const key=`${Math.round(position.getX(i)*1e5)},${Math.round(position.getY(i)*1e5)},${Math.round(position.getZ(i)*1e5)}`;
    const c=seen.get(key);if(c===undefined){seen.set(key,i);canon[i]=i;}else canon[i]=c;
  }
  // adjacency over the index buffer, on welded ids
  const degree=new Uint16Array(count), offsets=new Uint32Array(count+1);
  const ia=index.array;
  for(let i=0;i<ia.length;i+=3){degree[canon[ia[i]]]+=2;degree[canon[ia[i+1]]]+=2;degree[canon[ia[i+2]]]+=2;}
  for(let i=0;i<count;i++)offsets[i+1]=offsets[i]+degree[i];
  const neighbours=new Uint32Array(offsets[count]), fill=new Uint32Array(count);
  const link=(a:number,b:number)=>{neighbours[offsets[a]+fill[a]++]=b;};
  for(let i=0;i<ia.length;i+=3){const a=canon[ia[i]],b=canon[ia[i+1]],c=canon[ia[i+2]];link(a,b);link(a,c);link(b,a);link(b,c);link(c,a);link(c,b);}
  // keep the nail beds (and a margin around them) exactly as fitted
  const weight=new Float32Array(count), v=new THREE.Vector3();
  const radii=NAIL_REGIONS.map(r=>Math.max(r.size.x,r.size.y)*1.35);
  for(let i=0;i<count;i++){
    v.fromBufferAttribute(position,i).applyMatrix4(meshWorld);
    let w=1;
    for(let r=0;r<NAIL_REGIONS.length;r++){
      const d=v.distanceTo(NAIL_REGIONS[r].center), inner=radii[r]*.8, outer=radii[r]*1.6;
      if(d<inner){w=0;break;}
      if(d<outer)w=Math.min(w,(d-inner)/(outer-inner));
    }
    weight[i]=w*strength;
  }
  // the scan's attributes are interleaved, so read and write through the attribute API, never its raw array
  const a=new Float32Array(count*3), b=new Float32Array(count*3);
  for(let i=0;i<count;i++){a[i*3]=position.getX(i);a[i*3+1]=position.getY(i);a[i*3+2]=position.getZ(i);}
  let from=a, to=b;
  for(let it=0;it<iterations;it++){
    for(let i=0;i<count;i++){
      const w=weight[i], o=i*3, n=degree[i];
      if(canon[i]!==i){const c=canon[i]*3;to[o]=to[c];to[o+1]=to[c+1];to[o+2]=to[c+2];continue;}
      if(w===0||n===0){to[o]=from[o];to[o+1]=from[o+1];to[o+2]=from[o+2];continue;}
      let x=0,y=0,z=0;
      for(let k=offsets[i];k<offsets[i]+n;k++){const j=neighbours[k]*3;x+=from[j];y+=from[j+1];z+=from[j+2];}
      to[o]=from[o]+(x/n-from[o])*w;to[o+1]=from[o+1]+(y/n-from[o+1])*w;to[o+2]=from[o+2]+(z/n-from[o+2])*w;
    }
    [from,to]=[to,from];
  }
  for(let i=0;i<count;i++)position.setXYZ(i,from[i*3],from[i*3+1],from[i*3+2]);
  position.needsUpdate=true;
  // normals follow the softened surface everywhere the surface moved
  const normals=geometry.getAttribute('normal') as THREE.BufferAttribute|THREE.InterleavedBufferAttribute|undefined;
  if(normals){
    const keep=new Float32Array(count*3);
    for(let i=0;i<count;i++){keep[i*3]=normals.getX(i);keep[i*3+1]=normals.getY(i);keep[i*3+2]=normals.getZ(i);}
    geometry.computeVertexNormals();
    const fresh=geometry.getAttribute('normal') as THREE.BufferAttribute;
    for(let i=0;i<count;i++)if(weight[i]===0)fresh.setXYZ(i,keep[i*3],keep[i*3+1],keep[i*3+2]);
    fresh.needsUpdate=true;
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
}
