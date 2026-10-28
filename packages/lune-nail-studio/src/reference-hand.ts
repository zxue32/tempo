import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { nailWidthAt } from './nail-profile';
import type { NailDesign } from './types';

/** Fixed dorsal pose reconstructed from image proportions; not a metric scan. */
export interface FingerFrame { x:number; y:number; z:number; rotation:number; width:number; bed:number; rotationX?:number; rotationY?:number; }
// Order is anatomical: thumb, index, middle, ring, little. Thumb is at viewer right.
export const FINGER_FRAMES: FingerFrame[] = [
  { x:1.490, y:.715, z:.015, rotation:.055, rotationY:.85, rotationX:-.07, width:.330, bed:.490 },
  { x:.945, y:2.985, z:.025, rotation:-.055, rotationX:-.055, width:.365, bed:.635 },
  { x:.220, y:3.510, z:.025, rotation:-.045, rotationX:-.060, width:.385, bed:.680 },
  { x:-.425, y:3.130, z:.015, rotation:-.115, rotationX:-.060, width:.355, bed:.620 },
  { x:-1.685, y:2.160, z:-.030, rotation:.215, rotationX:-.065, width:.270, bed:.485 },
];
export const REFERENCE_SKIN_COLOR = '#d5ad96';
export const REFERENCE_NAIL_COLOR = '#d9aaa5';

const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
function smoothMin(a:number,b:number,k:number){ const h=Math.max(k-Math.abs(a-b),0)/k; return Math.min(a,b)-h*h*k*.25; }
function ellipsoid(x:number,y:number,z:number,rx:number,ry:number,rz:number){
  const k0=Math.hypot(x/rx,y/ry,z/rz),k1=Math.hypot(x/(rx*rx),y/(ry*ry),z/(rz*rz));
  return k0*(k0-1)/Math.max(k1,1e-6);
}
function ellipseAt(x:number,y:number,z:number,cx:number,cy:number,cz:number,rx:number,ry:number,rz:number,angle=0){
  const dx=x-cx,dy=y-cy,c=Math.cos(angle),s=Math.sin(angle);
  return ellipsoid(c*dx-s*dy,s*dx+c*dy,z-cz,rx,ry,rz);
}
type Node=[number,number,number,number];
interface Segment { a:Node; b:Node; flatten:number; blend:number; }
const fingers:Node[][]=[
  [[.89,-1.03,-.055,.39],[1.33,-.28,-.045,.30],[1.415,.23,-.040,.245],[1.405,.68,-.075,.205]],
  [[.70,.02,-.025,.292],[.80,1.34,.005,.268],[.90,2.23,-.015,.245],[.945,2.965,-.070,.220]],
  [[.06,.27,-.020,.295],[.13,1.58,.012,.280],[.19,2.60,-.015,.253],[.22,3.49,-.075,.233]],
  [[-.54,.22,-.025,.279],[-.625,1.39,.000,.253],[-.52,2.34,-.020,.234],[-.425,3.11,-.075,.213]],
  [[-1.01,-.03,-.040,.245],[-1.34,.93,-.015,.220],[-1.52,1.54,-.035,.190],[-1.685,2.14,-.085,.170]],
];
const segments:Segment[]=[];
fingers.forEach((nodes,fi)=>{for(let i=1;i<nodes.length;i++)segments.push({a:nodes[i-1],b:nodes[i],flatten:fi===0?.80:.72,blend:i===1?.135:.025});});
function capsule(x:number,y:number,z:number,s:Segment){
  const a=s.a,b=s.b;const dx=b[0]-a[0],dy=b[1]-a[1],dz=(b[2]-a[2])/s.flatten;
  const px=x-a[0],py=y-a[1],pz=(z-a[2])/s.flatten;
  const t=clamp((px*dx+py*dy+pz*dz)/(dx*dx+dy*dy+dz*dz));
  const radius=a[3]+(b[3]-a[3])*t;
  return (Math.hypot(px-dx*t,py-dy*t,pz-dz*t)-radius)*.78;
}
function handDistance(x:number,y:number,z:number){
  let d=ellipseAt(x,y,z,-.10,-.62,-.05,1.01,1.22,.305,.17);
  d=smoothMin(d,ellipseAt(x,y,z,-.62,-1.91,-.075,.640,1.13,.265,.24),.22);
  d=smoothMin(d,ellipseAt(x,y,z,.69,-.77,-.105,.51,.88,.34,.17),.16);
  d=smoothMin(d,ellipseAt(x,y,z,-.84,-.55,-.10,.37,.87,.28,.12),.13);
  for(const s of segments)d=smoothMin(d,capsule(x,y,z,s),s.blend);
  // A closed, oblique wrist section follows the photograph's visible boundary.
  const cut=-(y+.47*x+2.76)/Math.sqrt(1+.47*.47);
  return -smoothMin(-d,-cut,.035);
}

/** Continuous skin, indexed for efficient GLB export; UVs are dorsal planar coordinates. */
export function createHandGeometry():THREE.BufferGeometry{
  const resolution=104, sx=2.45, sy=3.95, sz=.66;
  const material=new THREE.MeshBasicMaterial();
  const mc=new MarchingCubes(resolution,material,false,false,100000);mc.isolation=0;
  for(let k=0;k<resolution;k++)for(let j=0;j<resolution;j++)for(let i=0;i<resolution;i++){
    const x=(i/resolution*2-1)*sx,y=(j/resolution*2-1)*sy+.20,z=(k/resolution*2-1)*sz;
    mc.field[i+j*resolution+k*resolution*resolution]=-handDistance(x,y,z);
  }
  mc.update();const count=mc.geometry.drawRange.count;
  const raw=new THREE.BufferGeometry();
  raw.setAttribute('position',new THREE.BufferAttribute(mc.geometry.attributes.position.array.slice(0,count*3),3));
  raw.scale(sx,sy,sz);raw.translate(0,.20,0);
  // Weld vertices before computing normals to avoid triangulation seams.
  const g=mergeVertices(raw,1e-5);raw.dispose();
  const cleanIndices:number[]=[];const points=g.getAttribute('position'),old=g.getIndex()!;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<old.count;i+=3){
    const ia=old.getX(i),ib=old.getX(i+1),ic=old.getX(i+2);
    a.fromBufferAttribute(points,ia);b.fromBufferAttribute(points,ib);c.fromBufferAttribute(points,ic);
    if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-18)cleanIndices.push(ia,ib,ic);
  }
  g.setIndex(cleanIndices);
  // Taubin smoothing removes grid aliasing and softens joints without shrinking the silhouette.
  const adjacent:Array<Set<number>>=Array.from({length:points.count},()=>new Set<number>());
  for(let i=0;i<cleanIndices.length;i+=3){const a=cleanIndices[i],b=cleanIndices[i+1],c=cleanIndices[i+2];adjacent[a].add(b).add(c);adjacent[b].add(a).add(c);adjacent[c].add(a).add(b);}
  for(let pass=0;pass<6;pass++){
    const factor=pass%2===0?.32:-.335,next=new Float32Array(points.array.length);
    for(let i=0;i<points.count;i++){
      const neighbors=adjacent[i];let x=0,y=0,z=0;
      for(const j of neighbors){x+=points.getX(j);y+=points.getY(j);z+=points.getZ(j);}
      const n=neighbors.size||1;
      next[3*i]=points.getX(i)+factor*(x/n-points.getX(i));next[3*i+1]=points.getY(i)+factor*(y/n-points.getY(i));next[3*i+2]=points.getZ(i)+factor*(z/n-points.getZ(i));
    }
    points.array.set(next);
  }
  // Seal any tiny triangular holes left by removing collapsed marching cells.
  const edges=new Map<string,{a:number;b:number;count:number}>();
  for(let i=0;i<cleanIndices.length;i+=3)for(const [a,b] of [[cleanIndices[i],cleanIndices[i+1]],[cleanIndices[i+1],cleanIndices[i+2]],[cleanIndices[i+2],cleanIndices[i]]]){
    const key=a<b?`${a}:${b}`:`${b}:${a}`,entry=edges.get(key);if(entry)entry.count++;else edges.set(key,{a,b,count:1});
  }
  const boundary=new Map<number,number>();for(const edge of edges.values())if(edge.count===1)boundary.set(edge.a,edge.b);
  while(boundary.size){
    const start=boundary.keys().next().value as number,loop:number[]=[start];let current=start;
    for(let step=0;step<100;step++){const next=boundary.get(current);boundary.delete(current);if(next===undefined||next===start)break;loop.push(next);current=next;}
    if(loop.length>=3)for(let j=1;j<loop.length-1;j++)cleanIndices.push(loop[0],loop[j+1],loop[j]);
  }
  g.setIndex(cleanIndices);g.computeVertexNormals();
  const p=g.getAttribute('position'),colors=new Float32Array(p.count*3),uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    uv[2*i]=(x+2.45)/4.90;uv[2*i+1]=(y+3.75)/7.90;
    // Neutral multipliers retain host-selected skin tone; subtle warm joint shading.
    let joint=0;
    for(const nodes of fingers)for(const node of nodes.slice(1,3))joint=Math.max(joint,Math.exp(-((x-node[0])**2/.055+(y-node[1])**2/.014)));
    const warm=joint*.035;
    const grain=.0025*Math.sin(x*131+y*197)*Math.sin(y*103+z*151);
    colors[3*i]=clamp(.99-warm*.20+grain);colors[3*i+1]=clamp(.985-warm+grain);colors[3*i+2]=clamp(.978-warm*1.2+grain);
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.computeBoundingBox();g.computeBoundingSphere();g.name='reference_hand_skin';
  mc.geometry.dispose();material.dispose();return g;
}

/** Closed C-curved nail shell. UV convention matches the studio's painting canvas. */
export function createNailGeometry(nail:NailDesign,finger:FingerFrame):THREE.BufferGeometry{
  const rows=36,cols=20,length=finger.bed+.55*nail.length;
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let row=0;row<=rows;row++){
    const v=row/rows,w=Math.max(.018,nailWidthAt(v,nail.shape));
    for(let col=0;col<=cols;col++){
      const s=col/cols*2-1,x=s*finger.width*.5*w;
      const z=.023+.064*(1-s*s*w*w)+.016*Math.sin(Math.PI*v)-.018*v*v-.015*v;
      positions.push(x,v*length-finger.bed+.12,z);uv.push(x/finger.width+.5,v);
      if(row<rows&&col<cols){const a=row*(cols+1)+col,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b);}
    }
  }
  const vertexCount=positions.length/3,topCount=indices.length;
  for(let i=0;i<vertexCount;i++){positions.push(positions[3*i],positions[3*i+1],positions[3*i+2]-.014);uv.push(uv[2*i],uv[2*i+1]);}
  for(let i=0;i<topCount;i+=3)indices.push(indices[i]+vertexCount,indices[i+2]+vertexCount,indices[i+1]+vertexCount);
  const perimeter:number[]=[];
  for(let c=0;c<=cols;c++)perimeter.push(c);
  for(let r=1;r<=rows;r++)perimeter.push(r*(cols+1)+cols);
  for(let c=cols-1;c>=0;c--)perimeter.push(rows*(cols+1)+c);
  for(let r=rows-1;r>0;r--)perimeter.push(r*(cols+1));
  for(let i=0;i<perimeter.length;i++){const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];indices.push(a,a+vertexCount,b,b,a+vertexCount,b+vertexCount);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

export function makeCuticle(f:FingerFrame,material:THREE.Material):THREE.Mesh{
  const points:THREE.Vector3[]=[];
  for(let i=0;i<=24;i++){
    const a=Math.PI+i/24*Math.PI;
    points.push(new THREE.Vector3(Math.cos(a)*f.width*.485,-f.bed+.21+Math.sin(a)*.09,.032+.048*Math.abs(Math.sin(a))));
  }
  const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),28,.008,5,false);
  const rawPositions=Array.from(tube.attributes.position.array),rawUV=Array.from(tube.attributes.uv.array),indices=Array.from(tube.index!.array);
  for(const end of [0,28]){
    const offset=end*6,centerIndex=rawPositions.length/3,center=new THREE.Vector3();
    for(let j=0;j<5;j++)center.add(new THREE.Vector3().fromBufferAttribute(tube.attributes.position,offset+j));
    center.multiplyScalar(1/5);rawPositions.push(center.x,center.y,center.z);rawUV.push(.5,.5);
    for(let j=0;j<5;j++){if(end===0)indices.push(centerIndex,offset+j+1,offset+j);else indices.push(centerIndex,offset+j,offset+j+1);}
  }
  tube.setAttribute('position',new THREE.Float32BufferAttribute(rawPositions,3));tube.setAttribute('uv',new THREE.Float32BufferAttribute(rawUV,2));tube.setIndex(indices);tube.deleteAttribute('normal');tube.computeVertexNormals();
  const mesh=new THREE.Mesh(tube,material);mesh.name='cuticle';return mesh;
}

/** Subtle joint creases lie on the phalange surface; no decorative ring geometry. */
export function makeSkinDetail(material:THREE.LineBasicMaterial):THREE.Group{
  const group=new THREE.Group();group.name='reference_joint_creases';
  fingers.forEach((nodes,fi)=>{
    for(let ni=1;ni<3;ni++){
      const n=nodes[ni],before=nodes[ni-1],after=nodes[ni+1];
      const dx=after[0]-before[0],dy=after[1]-before[1],len=Math.hypot(dx,dy),nx=dy/len,ny=-dx/len;
      for(const offset of [-.035,.018]){
        const points:THREE.Vector3[]=[];
        for(let j=0;j<=16;j++){
          const t=j/16*2-1,s=t*.72;
          const x=n[0]+nx*s*n[3]+dx/len*offset;
          const y=n[1]+ny*s*n[3]+dy/len*(offset+.018*(1-t*t));
          const z=n[2]+n[3]*(fi===0?.8:.72)*Math.sqrt(1-s*s)+.003;
          points.push(new THREE.Vector3(x,y,z));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material));
      }
    }
  });return group;
}
