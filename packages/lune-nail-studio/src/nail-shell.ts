import * as THREE from 'three';
import type { NailDesign } from './types';
import { NAIL_REGIONS, createNailPatch, nailUVInside } from './tripo-nails';

type SurfaceFit={coefficients:number[]};
type StressProfile={start:number;join:number;extent:number;baseline:number;roll:number;crown:number;tipCrown:number;slope:number};
type Outline={minimum:number;span:number;bed:number;total:number;minX:number;maxX:number;boundary:THREE.Vector2[];shape:string;profile?:StressProfile};
const surfaceCache=new WeakMap<THREE.BufferGeometry,Map<number,SurfaceFit>>();
const clamp=THREE.MathUtils.clamp;

function smoothBoundary(index:number){
  const raw=NAIL_REGIONS[index].polygon,result:THREE.Vector2[]=[];
  raw.forEach((p,i)=>{
    const last=raw[(i+raw.length-1)%raw.length],next=raw[(i+1)%raw.length];
    const start=last.clone().add(p).multiplyScalar(.5),end=p.clone().add(next).multiplyScalar(.5);
    for(let k=0;k<12;k++){
      const t=k/12;
      result.push(start.clone().multiplyScalar((1-t)**2).addScaledVector(p,2*(1-t)*t).addScaledVector(end,t*t));
    }
  });return result;
}

const boundaries:THREE.Vector2[][]=[];
function boundaryFor(index:number){return boundaries[index]??(boundaries[index]=smoothBoundary(index));}
function horizontalBounds(boundary:THREE.Vector2[],t:number){
  const y=1-t,x:number[]=[];
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length];
    if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))x.push(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y));
  }
  if(x.length>=2)return[Math.min(...x),Math.max(...x)];
  const nearest=boundary.reduce((a,b)=>Math.abs(a.y-y)<Math.abs(b.y-y)?a:b);
  return[nearest.x-.0015,nearest.x+.0015];
}

function freeWidth(t:number,shape:string){
  t=clamp(t,0,1);
  switch(shape){
    case 'square': return t<.92?1:.92+.08*Math.sqrt(Math.max(0,1-((t-.92)/.08)**2));
    case 'squoval': return t<.68?1:.65+.35*Math.sqrt(Math.max(0,1-((t-.68)/.32)**2));
    case 'coffin': return (1-.40*t)*(t<.95?1:1-.04*(t-.95)/.05);
    case 'stiletto': return Math.max(.004,(1-t)**1.05);
    case 'oval': return Math.sqrt(Math.max(.000016,1-t*t));
    // Almond keeps a generous shoulder and a softly rounded point; stiletto is
    // the only shape that deliberately converges into a very narrow spike.
    default:return Math.max(.035,Math.sqrt(Math.max(0,1-t*t))*(1-.22*t));
  }
}

function outlineAt(index:number,nail:NailDesign,layout:Outline,v:number){
  const region=NAIL_REGIONS[index],axial=layout.minimum+clamp(v,0,1)*layout.total;
  let center:number,half:number;
  if(axial<=layout.bed){
    const [left,right]=horizontalBounds(layout.boundary,axial);
    center=(left+right)*.5;half=Math.max(.0015,(right-left)*.5);
  }else{
    const [left,right]=horizontalBounds(layout.boundary,layout.bed),t=(axial-layout.bed)/(layout.minimum+layout.total-layout.bed);
    center=(left+right)*.5;half=(right-left)*.5*freeWidth(t,nail.shape);
  }
  // A finite-width end avoids collapsed fan triangles while remaining subpixel.
  half=Math.max(.0015,half);
  return{center:(center-.5)*region.size.x,half:half*region.size.x,axial};
}

function layoutFor(index:number,nail:NailDesign):Outline{
  const boundary=boundaryFor(index),minimum=Math.min(...boundary.map(p=>1-p.y)),maximum=Math.max(...boundary.map(p=>1-p.y)),span=maximum-minimum;
  // Preserve the scanned bed, while short/medium/long extend the free edge.
  const bed=minimum+span*.76,extension=span*(.18+.67*clamp(nail.length,0,1));
  const layout:Outline={minimum,span,bed,total:bed-minimum+extension,minX:Infinity,maxX:-Infinity,boundary,shape:nail.shape};
  for(let i=0;i<=80;i++){
    const o=outlineAt(index,nail,layout,i/80);
    layout.minX=Math.min(layout.minX,o.center-o.half);layout.maxX=Math.max(layout.maxX,o.center+o.half);
  }
  // Numerical extrema between sampled rows must remain inside the paint atlas.
  const padding=NAIL_REGIONS[index].size.x*.003;
  layout.minX-=padding;layout.maxX+=padding;
  return layout;
}

function fitFor(source:THREE.Mesh,index:number):SurfaceFit{
  let cache=surfaceCache.get(source.geometry);if(!cache){cache=new Map();surfaceCache.set(source.geometry,cache);}
  let fit=cache.get(index);
  if(!fit){
    const patch=createNailPatch(source,index);
    const coefficients=patch.userData.polishSurface?.coefficients as number[]|undefined;
    if(!coefficients)throw new Error(`Cannot fit scanned nail ${index}`);
    fit={coefficients:[...coefficients]};cache.set(index,fit);patch.dispose();
  }
  return fit;
}

function fittedBedHeight(index:number,fit:SurfaceFit,layout:Outline,axial:number,s:number){
  const region=NAIL_REGIONS[index],a=fit.coefficients,[left,right]=horizontalBounds(layout.boundary,axial);
  const u=(left+right)*.5-.5+(right-left)*.5*s,v=axial-.5;
  const curvature=-clamp(-a[3],region.size.x*.25,region.size.x*1.3);
  const progress=clamp((axial-layout.minimum)/(layout.bed-layout.minimum),0,1);
  return a[0]+a[1]*u+a[2]*v+curvature*u*u+a[4]*u*v+a[5]*v*v+.0006+.0004*Math.sin(Math.PI*progress)**2;
}

function stressProfile(index:number,fit:SurfaceFit,layout:Outline):StressProfile{
  if(layout.profile)return layout.profile;
  const region=NAIL_REGIONS[index],length=clamp((layout.total/layout.span-.94)/.67,0,1);
  // Finish fitting the scanned bed before the natural free edge. The builder
  // apex is established here, so the extension does not inherit a hooked scan
  // tip and then bend back upwards to compensate for it.
  const start=layout.minimum+.36*layout.span,join=layout.minimum+.62*layout.span;
  const extent=layout.minimum+layout.total-join;
  const left=fittedBedHeight(index,fit,layout,join,-1),right=fittedBedHeight(index,fit,layout,join,1);
  const baseline=(left+right)*.5,roll=(right-left)*.5;
  const crown=fittedBedHeight(index,fit,layout,join,0)-baseline+region.size.x*(.020+.018*length);
  const [joinLeft,joinRight]=horizontalBounds(layout.boundary,join);
  const [bedLeft,bedRight]=horizontalBounds(layout.boundary,layout.bed);
  // Match the surviving tip C-curve to its width. Rounded/pointed tips flatten
  // progressively; a square/coffin edge keeps a visible arched cross-section.
  const tipHalf=Math.max(.0015,(bedRight-bedLeft)*.5*freeWidth(1,layout.shape));
  const ratio=clamp(tipHalf/((joinRight-joinLeft)*.5),0,1);
  const tipCrown=crown*ratio*ratio;
  // Both side rails descend even when the original scan has a sideways roll.
  // Their slopes are m ± roll/L; this bound prevents either rail curling up.
  const slope=-Math.max(.055,Math.abs(roll)/(extent*region.size.y)+.025);
  return layout.profile={start,join,extent,baseline,roll,crown,tipCrown,slope};
}

function builtHeight(index:number,layout:Outline,profile:StressProfile,axial:number,s:number){
  const q=clamp((axial-profile.join)/profile.extent,0,1),dy=(axial-profile.join)*NAIL_REGIONS[index].size.y;
  const crown=profile.crown+(profile.tipCrown-profile.crown)*q*q;
  return profile.baseline+profile.slope*dy+profile.roll*(1-q)*s+crown*(1-s*s);
}

function heightAt(index:number,fit:SurfaceFit,layout:Outline,o:{center:number;half:number;axial:number},x:number){
  const profile=stressProfile(index,fit,layout),s=clamp((x-o.center)/o.half,-1,1);
  if(o.axial<=profile.start)return fittedBedHeight(index,fit,layout,o.axial,s);
  if(o.axial>=profile.join)return builtHeight(index,layout,profile,o.axial,s);
  // Hermite transition lives on the attached bed, not in the unsupported free
  // edge. It introduces the stress apex while matching the scan at its root.
  const span=profile.join-profile.start,t=(o.axial-profile.start)/span,epsilon=.0001;
  const a=fittedBedHeight(index,fit,layout,profile.start,s),b=builtHeight(index,layout,profile,profile.join,s);
  const da=(fittedBedHeight(index,fit,layout,profile.start+epsilon,s)-fittedBedHeight(index,fit,layout,profile.start-epsilon,s))/(2*epsilon);
  const db=profile.slope*NAIL_REGIONS[index].size.y-profile.roll*s/profile.extent;
  return (2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*span*da+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*span*db;
}

function pointAt(index:number,nail:NailDesign,layout:Outline,fit:SurfaceFit,u:number,v:number){
  const region=NAIL_REGIONS[index],o=outlineAt(index,nail,layout,v);
  const x=layout.minX+u*(layout.maxX-layout.minX),y=(o.axial-.5)*region.size.y;
  return region.center.clone().addScaledVector(region.right,x).addScaledVector(region.up,y).addScaledVector(region.normal,heightAt(index,fit,layout,o,x));
}

/** UV v goes from cuticle (0) to free tip (1), matching the 3D drawing convention. */
export function sampleNailSurface(source:THREE.Mesh,index:number,nail:NailDesign,u:number,v:number):{position:THREE.Vector3;normal:THREE.Vector3}{
  const layout=layoutFor(index,nail),fit=fitFor(source,index),position=pointAt(index,nail,layout,fit,u,v),epsilon=.0005;
  const tangentX=pointAt(index,nail,layout,fit,Math.min(1,u+epsilon),v).sub(pointAt(index,nail,layout,fit,Math.max(0,u-epsilon),v));
  const tangentY=pointAt(index,nail,layout,fit,u,Math.min(1,v+epsilon)).sub(pointAt(index,nail,layout,fit,u,Math.max(0,v-epsilon)));
  const normal=new THREE.Vector3().crossVectors(tangentX,tangentY).normalize();
  if(normal.lengthSq()<.5)normal.copy(NAIL_REGIONS[index].normal);
  return{position,normal};
}

/** A watertight sculpted plate: a C-curved top, underside, root, sides and tip. */
export function createNailShell(source:THREE.Mesh,index:number,nail:NailDesign):THREE.BufferGeometry{
  const region=NAIL_REGIONS[index],layout=layoutFor(index,nail),fit=fitFor(source,index),rows=64,cols=28;
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const point=new THREE.Vector3();
  for(let row=0;row<=rows;row++){
    const v=row/rows,o=outlineAt(index,nail,layout,v);
    for(let col=0;col<=cols;col++){
      const s=col/cols*2-1,x=o.center+o.half*s,y=(o.axial-.5)*region.size.y,z=heightAt(index,fit,layout,o,x);
      point.copy(region.center).addScaledVector(region.right,x).addScaledVector(region.up,y).addScaledVector(region.normal,z);
      positions.push(point.x,point.y,point.z);uv.push((x-layout.minX)/(layout.maxX-layout.minX),v);
      if(row<rows&&col<cols){const a=row*(cols+1)+col,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b);}
    }
  }
  const vertices=positions.length/3,topCount=indices.length;
  for(let i=0;i<vertices;i++){
    const v=uv[i*2+1],o=outlineAt(index,nail,layout,v),x=layout.minX+uv[i*2]*(layout.maxX-layout.minX);
    const cross=Math.max(0,1-((x-o.center)/o.half)**2),length=clamp(nail.length,0,1),width=layout.maxX-layout.minX;
    const rootThickness=width*.014,tipThickness=width*(.045+.015*length),apexThickness=width*(.085+.025*length);
    const axialProgress=(o.axial-layout.minimum)/layout.span,apexPosition=.53;
    const centerThickness=axialProgress<apexPosition
      ?THREE.MathUtils.lerp(rootThickness,apexThickness,THREE.MathUtils.smoothstep(axialProgress,0,apexPosition))
      :THREE.MathUtils.lerp(apexThickness,tipThickness,THREE.MathUtils.smoothstep(axialProgress,apexPosition,layout.total/layout.span));
    const sideThickness=THREE.MathUtils.lerp(rootThickness,tipThickness,THREE.MathUtils.smoothstep(axialProgress,0,.58));
    const thickness=sideThickness+(centerThickness-sideThickness)*cross;
    positions.push(positions[i*3]-region.normal.x*thickness,positions[i*3+1]-region.normal.y*thickness,positions[i*3+2]-region.normal.z*thickness);
    uv.push(uv[i*2],uv[i*2+1]);
  }
  for(let i=0;i<topCount;i+=3)indices.push(indices[i]+vertices,indices[i+2]+vertices,indices[i+1]+vertices);
  const perimeter:number[]=[];
  for(let col=0;col<=cols;col++)perimeter.push(col);
  for(let row=1;row<=rows;row++)perimeter.push(row*(cols+1)+cols);
  for(let col=cols-1;col>=0;col--)perimeter.push(rows*(cols+1)+col);
  for(let row=rows-1;row>0;row--)perimeter.push(row*(cols+1));
  for(let i=0;i<perimeter.length;i++){const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];indices.push(a,a+vertices,b,b,a+vertices,b+vertices);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.addGroup(0,topCount,0);g.addGroup(topCount,indices.length-topCount,1);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  g.name=`nail_shell_${index}_${nail.shape}`;g.userData={nailIndex:index,closedShell:true,shape:nail.shape,length:nail.length,topVertexCount:vertices,topIndexCount:topCount,uvConvention:'u left-right; v cuticle-tip'};
  return g;
}

/** Canvas UV y is downward; unlike sampleNailSurface, this helper receives y=1-v. */
export function nailDesignUVInside(index:number,nail:NailDesign,uv:{x:number;y:number}):boolean{
  if(uv.x<0||uv.x>1||uv.y<0||uv.y>1)return false;
  const layout=layoutFor(index,nail),o=outlineAt(index,nail,layout,1-uv.y),x=layout.minX+uv.x*(layout.maxX-layout.minX);
  return x>=o.center-o.half&&x<=o.center+o.half;
}

export function traceDesignNailPath(ctx:CanvasRenderingContext2D,index:number,nail:NailDesign,x:number,y:number,w:number,h:number){
  const layout=layoutFor(index,nail),width=layout.maxX-layout.minX,steps=100;
  ctx.beginPath();
  for(let row=0;row<=steps;row++){
    const v=row/steps,o=outlineAt(index,nail,layout,v),px=x+(o.center-o.half-layout.minX)/width*w,py=y+(1-v)*h;
    if(row===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  for(let row=steps;row>=0;row--){const v=row/steps,o=outlineAt(index,nail,layout,v);ctx.lineTo(x+(o.center+o.half-layout.minX)/width*w,y+(1-v)*h);}
  ctx.closePath();
}

/**
 * Preserve all original faces and UVs. The old plate is gently recessed and its
 * free edge folded back into the fingertip volume, so there can be no clipped
 * skin triangles or open holes. The untouched original stays available for the
 * press-and-hold comparison. This operation affects only five calibrated beds.
 */
export function createNailPreparedHandGeometry(source:THREE.Mesh):THREE.BufferGeometry{
  source.updateWorldMatrix(true,false);
  const original=source.geometry,p=original.getAttribute('position'),geometry=original.clone();
  const fits=NAIL_REGIONS.map((_,i)=>fitFor(source,i)),recessed=geometry.getAttribute('position') as THREE.BufferAttribute;
  const world=new THREE.Vector3(),local=new THREE.Vector3(),inverse=source.matrixWorld.clone().invert();
  let recessedVertices=0,coveredVertices=0;const moved=new Uint8Array(p.count),bedCover=new Float32Array(p.count);
  const neutral={shape:'oval',length:0,color:'#ffffff',finish:'gloss',pattern:'solid',strokes:[]} as NailDesign;
  const layouts=NAIL_REGIONS.map((_,i)=>layoutFor(i,neutral));
  for(let vertexIndex=0;vertexIndex<p.count;vertexIndex++){
    world.fromBufferAttribute(p,vertexIndex).applyMatrix4(source.matrixWorld);
    for(let i=0;i<NAIL_REGIONS.length;i++){
      const region=NAIL_REGIONS[i],layout=layouts[i],a=fits[i].coefficients;local.copy(world).sub(region.center);
      const x=local.dot(region.right),axial=local.dot(region.up)/region.size.y+.5,z=local.dot(region.normal),u=x/region.size.x,pv=axial-.5;
      if(axial<layout.minimum-.12||axial>layout.minimum+layout.span*1.32||Math.abs(u)>.72)continue;
      const scannedZ=a[0]+a[1]*u+a[2]*pv+a[3]*u*u+a[4]*u*pv+a[5]*pv*pv;
      const depth=z-scannedZ;
      if(depth<-.033||depth>.050)continue;
      const distal=THREE.MathUtils.smoothstep(axial,layout.minimum+layout.span*.62,layout.minimum+layout.span*.78);
      // Expand beyond the traced front contour: the photographed white edge
      // also wraps around the sides and underside of the scanned nail.
      const bounds=horizontalBounds(layout.boundary,clamp(axial,layout.minimum+.025,layout.bed));
      const center=(bounds[0]+bounds[1])*.5-.5,half=(bounds[1]-bounds[0])*.5;
      const edge=Math.abs(u-center)-half;
      const lateral=1-THREE.MathUtils.smoothstep(edge,.025,.14+distal*.07);
      const proximal=THREE.MathUtils.smoothstep(axial,layout.minimum-.065,layout.minimum+.025);
      const depthWeight=THREE.MathUtils.smoothstep(depth,-.033,-.014);
      const weight=lateral*proximal*depthWeight;
      if(weight<.00001)continue;
      const retractedAxial=Math.min(axial,layout.minimum+layout.span*.77);
      const targetX=THREE.MathUtils.lerp(x,clamp(x,(center-half*.86)*region.size.x,(center+half*.86)*region.size.x),distal);
      const v=(retractedAxial-layout.minimum)/layout.total,o=outlineAt(i,neutral,layout,v);
      // Match the skin to the thin sidewall/root instead of leaving a deep
      // trench around the plate. Only the hidden interior is recessed deeply.
      const interior=THREE.MathUtils.smoothstep(half-Math.abs(targetX/region.size.x-center),0,.10);
      const rootBlend=THREE.MathUtils.smoothstep(retractedAxial,layout.minimum,layout.minimum+layout.span*.10);
      const belowShell=heightAt(i,fits[i],layout,o,targetX)-(.00105+.00345*interior*rootBlend);
      const targetZ=Math.min(z,belowShell);
      if(targetZ===z&&retractedAxial===axial&&targetX===x)continue;
      world.addScaledVector(region.normal,(targetZ-z)*weight)
        .addScaledVector(region.up,(retractedAxial-axial)*region.size.y*weight)
        .addScaledVector(region.right,(targetX-x)*weight).applyMatrix4(inverse);
      recessed.setXYZ(vertexIndex,world.x,world.y,world.z);moved[vertexIndex]=1;recessedVertices++;
      // A material-only cover of the original nail, not periungual skin. Its
      // thin inset feather avoids replacing the surrounding authored skin UVs.
      const originalUV={x:u+.5,y:1-axial};
      if(nailUVInside(i,originalUV)){
        let distance=Infinity;
        const polygon=region.polygon;
        for(let edgeIndex=0;edgeIndex<polygon.length;edgeIndex++){
          const a=polygon[edgeIndex],b=polygon[(edgeIndex+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y;
          const t=clamp(((originalUV.x-a.x)*dx+(originalUV.y-a.y)*dy)/(dx*dx+dy*dy),0,1);
          distance=Math.min(distance,Math.hypot(originalUV.x-a.x-t*dx,originalUV.y-a.y-t*dy));
        }
        bedCover[vertexIndex]=THREE.MathUtils.smoothstep(distance,0,.022)*depthWeight;
        if(bedCover[vertexIndex]>.001)coveredVertices++;
      }
      break;
    }
  }
  recessed.needsUpdate=true;geometry.computeVertexNormals();
  // Keep the scan's authored smooth skin normals away from the five edits.
  const originalNormals=original.getAttribute('normal'),updatedNormals=geometry.getAttribute('normal') as THREE.BufferAttribute;
  for(let i=0;i<p.count;i++)if(!moved[i])updatedNormals.setXYZ(i,originalNormals.getX(i),originalNormals.getY(i),originalNormals.getZ(i));
  updatedNormals.needsUpdate=true;geometry.setAttribute('nailBedCover',new THREE.BufferAttribute(bedCover,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData={...original.userData,preparedNailBed:true,removedTriangleCount:0,recessedNailVertices:recessedVertices,coveredNailVertices:coveredVertices};
  const fitCache=surfaceCache.get(original);if(fitCache)surfaceCache.set(geometry,fitCache);
  return geometry;
}
