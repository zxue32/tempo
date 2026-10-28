import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import landmarks from './nail-landmarks.json';
import { renderTexture } from './texture';
import type { NailDesign } from './types';
export {createNailShell,createNailPreparedHandGeometry,sampleNailSurface,traceDesignNailPath,nailDesignUVInside} from './nail-shell';

export interface NailRegion {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  quaternion: THREE.Quaternion;
  size: THREE.Vector3;
  /** Canvas coordinates: x left-to-right, y tip-to-cuticle. */
  polygon: THREE.Vector2[];
  up: THREE.Vector3;
  right: THREE.Vector3;
}

/** Jacobi diagonalization of a small symmetric covariance matrix. */
function eigenvectors(covariance: number[][]) {
  const a = covariance.map(row => [...row]);
  const v = [[1,0,0],[0,1,0],[0,0,1]];
  for (let iteration = 0; iteration < 30; iteration++) {
    let p = 0, q = 1;
    for (const [i,j] of [[0,2],[1,2]]) if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p=i; q=j; }
    if (Math.abs(a[p][q]) < 1e-13) break;
    const angle = .5 * Math.atan2(2*a[p][q], a[q][q]-a[p][p]);
    const c=Math.cos(angle),s=Math.sin(angle),app=a[p][p],aqq=a[q][q],apq=a[p][q];
    for (let k=0;k<3;k++) if(k!==p&&k!==q) {
      const akp=a[k][p],akq=a[k][q];
      a[k][p]=a[p][k]=c*akp-s*akq;
      a[k][q]=a[q][k]=s*akp+c*akq;
    }
    a[p][p]=c*c*app-2*s*c*apq+s*s*aqq;
    a[q][q]=s*s*app+2*s*c*apq+c*c*aqq;
    a[p][q]=a[q][p]=0;
    for(let k=0;k<3;k++) {
      const vkp=v[k][p],vkq=v[k][q];
      v[k][p]=c*vkp-s*vkq;v[k][q]=s*vkp+c*vkq;
    }
  }
  return [0,1,2].map(i=>({value:a[i][i],vector:new THREE.Vector3(v[0][i],v[1][i],v[2][i]).normalize()})).sort((a,b)=>a.value-b.value);
}

function fitRegion(samples: typeof landmarks[number], index:number):NailRegion {
  const points=samples.map(s=>new THREE.Vector3(...s.p as [number,number,number]));
  const mean=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
  const covariance=[[0,0,0],[0,0,0],[0,0,0]];
  points.forEach(p=>{const d=p.clone().sub(mean).toArray();for(let i=0;i<3;i++)for(let j=0;j<3;j++)covariance[i][j]+=d[i]*d[j];});
  const axes=eigenvectors(covariance),normal=axes[0].vector;
  const facing=samples.reduce((a,s)=>a.add(new THREE.Vector3(...s.n as [number,number,number])),new THREE.Vector3());
  if(normal.dot(facing)<0)normal.negate();
  const up=axes[2].vector;
  if(up.dot(index===0?new THREE.Vector3(0,.4,-1):new THREE.Vector3(0,1,-.3))<0)up.negate();
  const right=new THREE.Vector3().crossVectors(up,normal).normalize();
  up.crossVectors(normal,right).normalize();
  const basis=new THREE.Matrix4().makeBasis(right,up,normal);
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(basis);
  const projected=points.map(p=>{const d=p.clone().sub(mean);return new THREE.Vector3(d.dot(right),d.dot(up),d.dot(normal));});
  const box=new THREE.Box3().setFromPoints(projected),extent=box.getSize(new THREE.Vector3()),middle=box.getCenter(new THREE.Vector3());
  // Edge samples sit lower than the nail apex. Include the C-curve's centre,
  // then reject rear-facing surfaces during extraction instead of slicing it off.
  const size=new THREE.Vector3(extent.x*1.035,extent.y*1.035,Math.max(.035,extent.z+.02));
  const center=mean.clone().addScaledVector(right,middle.x).addScaledVector(up,middle.y).addScaledVector(normal,middle.z);
  const polygon=projected.map(p=>new THREE.Vector2((p.x-middle.x)/size.x+.5,.5-(p.y-middle.y)/size.y));
  return {center,normal,quaternion,size,polygon,up,right};
}

export const NAIL_REGIONS: NailRegion[]=landmarks.map(fitRegion);

function solveLinear(matrix:number[][],rhs:number[]):number[]|undefined {
  const rows=matrix.map((row,i)=>[...row,rhs[i]]),count=rhs.length;
  for(let c=0;c<count;c++) {
    let pivot=c;
    for(let r=c+1;r<count;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
    if(Math.abs(rows[pivot][c])<1e-12)return;
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const divisor=rows[c][c];for(let j=c;j<=count;j++)rows[c][j]/=divisor;
    for(let r=0;r<count;r++)if(r!==c){const factor=rows[r][c];for(let j=c;j<=count;j++)rows[r][j]-=factor*rows[c][j];}
  }
  return rows.map(row=>row[count]);
}

/**
 * A thin gel coat self-levels optically instead of repeating reconstruction noise.
 * Fit only its smooth reflection normals; the scanned positions/skin never move.
 */
function smoothPolishNormals(geometry:THREE.BufferGeometry,index:number) {
  const region=NAIL_REGIONS[index],p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  const bins=new Map<string,{u:number;v:number;z:number;count:number}>();
  const position=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    const u=uv.getX(i)-.5,v=uv.getY(i)-.5;
    if(!nailUVInside(index,{x:u+.5,y:.5-v}))continue;
    const z=position.fromBufferAttribute(p,i).sub(region.center).dot(region.normal);
    const key=`${Math.floor((u+.5)*22)}:${Math.floor((v+.5)*36)}`;
    const bin=bins.get(key)??{u:0,v:0,z:0,count:0};
    bin.u+=u;bin.v+=v;bin.z+=z;bin.count++;bins.set(key,bin);
  }
  const matrix=Array.from({length:6},()=>Array(6).fill(0) as number[]),rhs=Array(6).fill(0) as number[];
  for(const bin of bins.values()) {
    const u=bin.u/bin.count,v=bin.v/bin.count,z=bin.z/bin.count,terms=[1,u,v,u*u,u*v,v*v];
    for(let r=0;r<6;r++){rhs[r]+=terms[r]*z;for(let c=0;c<6;c++)matrix[r][c]+=terms[r]*terms[c];}
  }
  // Small regularizer avoids unstable high slopes when only a tiny patch is present.
  for(let i=0;i<6;i++)matrix[i][i]+=1e-8;
  const fit=solveLinear(matrix,rhs);if(!fit||bins.size<12)return;
  const normals=new Float32Array(p.count*3),normal=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    const u=uv.getX(i)-.5,v=uv.getY(i)-.5;
    const dx=(fit[1]+2*fit[3]*u+fit[4]*v)/region.size.x;
    const dy=(fit[2]+fit[4]*u+2*fit[5]*v)/region.size.y;
    normal.copy(region.normal).addScaledVector(region.right,-dx).addScaledVector(region.up,-dy).normalize();
    normal.toArray(normals,i*3);
  }
  geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  geometry.userData.polishSurface={kind:'quadratic-optical-coat',coefficients:fit};
}

/** Source mesh must be in its original GLB coordinate frame before host normalization. */
export function createNailPatch(source:THREE.Mesh,index:number):THREE.BufferGeometry {
  const region=NAIL_REGIONS[index];
  if(!region)throw new Error('Unknown nail index');
  source.updateWorldMatrix(true,false);
  const raw=new DecalGeometry(source,region.center,new THREE.Euler().setFromQuaternion(region.quaternion),region.size);
  const p=raw.getAttribute('position'),n=raw.getAttribute('normal'),uv=raw.getAttribute('uv');
  const positions:number[]=[],normals:number[]=[],coordinates:number[]=[];
  const normal=new THREE.Vector3();
  for(let triangle=0;triangle<p.count;triangle+=3) {
    normal.set(0,0,0);
    for(let j=0;j<3;j++)normal.add(new THREE.Vector3().fromBufferAttribute(n,triangle+j));
    // The projector must never paint the underside of a finger.
    if(normal.normalize().dot(region.normal)<.12)continue;
    for(let j=0;j<3;j++) {
      const i=triangle+j;
      positions.push(p.getX(i)+n.getX(i)*.00028,p.getY(i)+n.getY(i)*.00028,p.getZ(i)+n.getZ(i)*.00028);
      normals.push(n.getX(i),n.getY(i),n.getZ(i));coordinates.push(uv.getX(i),uv.getY(i));
    }
  }
  raw.dispose();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coordinates,2));
  smoothPolishNormals(geometry,index);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.name=`tripo_nail_patch_${index}`;
  return geometry;
}

export function traceNailPath(ctx:CanvasRenderingContext2D,index:number,x:number,y:number,w:number,h:number) {
  const points=NAIL_REGIONS[index].polygon;
  ctx.beginPath();
  // Midpoint quadratics round inward: no spline overshoot can colour the skin.
  const last=points[points.length-1],first=points[0];
  ctx.moveTo(x+(last.x+first.x)*w/2,y+(last.y+first.y)*h/2);
  points.forEach((p,i)=>{
    const next=points[(i+1)%points.length];
    ctx.quadraticCurveTo(x+p.x*w,y+p.y*h,x+(p.x+next.x)*w/2,y+(p.y+next.y)*h/2);
  });
  ctx.closePath();
}

/** Artwork is clipped to the traced real nail rather than a generic ellipse. */
export function paintNailTexture(nail:NailDesign,index:number,size=1024):HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d')!;
  ctx.save();traceNailPath(ctx,index,0,0,size,size);ctx.clip();ctx.drawImage(renderTexture(nail,size),0,0);ctx.restore();
  return canvas;
}

/** Input UV uses the canvas convention (y=0 at the nail tip). */
export function nailUVInside(index:number,uv:{x:number;y:number}):boolean {
  const p=NAIL_REGIONS[index]?.polygon;if(!p)return false;
  let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++) {
    const a=p[i],b=p[j];
    if(((a.y>uv.y)!==(b.y>uv.y))&&(uv.x<(b.x-a.x)*(uv.y-a.y)/(b.y-a.y)+a.x))inside=!inside;
  }
  return inside;
}
