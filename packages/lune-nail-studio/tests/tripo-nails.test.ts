import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NAIL_REGIONS, createNailPatch, nailUVInside,createNailShell,createNailPreparedHandGeometry,sampleNailSurface,nailDesignUVInside } from '../src/tripo-nails';
import type {NailDesign} from '../src/types';

test('all five traced nail regions have normalized orthogonal frames and bounded UVs',()=>{
  assert.equal(NAIL_REGIONS.length,5);
  for(const r of NAIL_REGIONS){
    assert.ok(r.size.x>.015&&r.size.x<.12);assert.ok(r.size.y>.04&&r.size.y<.16);
    assert.ok(r.size.z>.005&&r.size.z<.06);
    assert.ok(Math.abs(r.normal.length()-1)<1e-8);
    assert.ok(Math.abs(r.normal.dot(r.up))<1e-8);
    assert.ok(Math.abs(r.right.dot(r.up))<1e-8);
    assert.ok(r.polygon.length>=10);
    for(const p of r.polygon)assert.ok(p.x>0&&p.x<1&&p.y>0&&p.y<1);
  }
});

test('paint mask accepts the nail centre but rejects transparent corners',()=>{
  NAIL_REGIONS.forEach((_,i)=>{assert.ok(nailUVInside(i,{x:.5,y:.5}));assert.equal(nailUVInside(i,{x:0,y:0}),false);assert.equal(nailUVInside(i,{x:1,y:1}),false);});
});

/** Decode only numeric accessors; textures need no browser for extraction tests. */
function sourceMesh(){
  const bytes=readFileSync(new URL('../public/models/tripo-hand.glb',import.meta.url));
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),binStart=28+length;
  const primitive=json.meshes[0].primitives[0],geometry=new THREE.BufferGeometry();
  const read=(id:number)=>{
    const a=json.accessors[id],v=json.bufferViews[a.bufferView];
    const components=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4} as Record<string,number>)[a.type];
    const offset=binStart+(v.byteOffset??0)+(a.byteOffset??0);
    const byteSize=a.componentType===5123?2:4,stride=v.byteStride??components*byteSize;
    const array=a.componentType===5126?new Float32Array(a.count*components):a.componentType===5125?new Uint32Array(a.count*components):new Uint16Array(a.count*components);
    for(let i=0;i<a.count;i++)for(let c=0;c<components;c++){
      const location=offset+i*stride+c*byteSize;
      array[i*components+c]=a.componentType===5126?bytes.readFloatLE(location):a.componentType===5125?bytes.readUInt32LE(location):bytes.readUInt16LE(location);
    }
    return new THREE.BufferAttribute(array,components);
  };
  geometry.setAttribute('position',read(primitive.attributes.POSITION));geometry.setAttribute('normal',read(primitive.attributes.NORMAL));geometry.setAttribute('uv',read(primitive.attributes.TEXCOORD_0));geometry.setIndex(read(primitive.indices));
  return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
}

test('each coating patch conforms to the actual optimized mesh and has usable paint UVs',()=>{
  const source=sourceMesh();
  NAIL_REGIONS.forEach((region,i)=>{
    const patch=createNailPatch(source,i),p=patch.getAttribute('position'),uv=patch.getAttribute('uv'),n=patch.getAttribute('normal');
    assert.ok(p.count>90,`empty or inadequate patch ${i}`);
    assert.equal(p.count,uv.count);assert.equal(p.count,n.count);
    for(const v of p.array)assert.ok(Number.isFinite(v));
    for(const v of uv.array)assert.ok(v>=-1e-4&&v<=1.0001);
    assert.equal(patch.userData.polishSurface?.kind,'quadratic-optical-coat');
    const normal=new THREE.Vector3();
    for(let j=0;j<n.count;j++) {
      normal.fromBufferAttribute(n,j);
      assert.ok(Math.abs(normal.length()-1)<1e-5,`invalid optical normal ${i}`);
      assert.ok(normal.dot(region.normal)>.25,`flipped optical normal ${i}`);
    }
    const centre=patch.boundingBox!.getCenter(new THREE.Vector3());assert.ok(centre.distanceTo(region.center)<.06);
    const ray=new THREE.Raycaster(region.center.clone().addScaledVector(region.normal,.12),region.normal.clone().negate());
    const patchMesh=new THREE.Mesh(patch,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    patchMesh.updateMatrixWorld();
    assert.ok(ray.intersectObject(patchMesh).length>0,`patch ${i} lost its curved nail apex`);
    (patchMesh.material as THREE.Material).dispose();
    patch.dispose();
  });source.geometry.dispose();
});

test('six shapes and three lengths form closed positive-volume shells on the real scan',()=>{
  const source=sourceMesh();
  for(let finger=0;finger<5;finger++)for(const shape of ['almond','oval','square','squoval','coffin','stiletto']){
    let previousTip=-Infinity;
    for(const length of [0,.5,1]){
      const nail={color:'#7a3048',shape,length,finish:'gloss',pattern:'solid',strokes:[]} as NailDesign;
      const shell=createNailShell(source,finger,nail),positions=shell.getAttribute('position'),normals=shell.getAttribute('normal'),uv=shell.getAttribute('uv'),indices=shell.getIndex()!;
      assert.deepEqual(shell.groups.map(g=>g.materialIndex),[0,1]);
      assert.equal(shell.groups[0].count,shell.userData.topIndexCount);
      const edges=new Map<string,number>();let volume=0,tip=-Infinity,degenerate=0;
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      for(let i=0;i<indices.count;i+=3){
        const ia=indices.getX(i),ib=indices.getX(i+1),ic=indices.getX(i+2);
        a.fromBufferAttribute(positions,ia);b.fromBufferAttribute(positions,ib);c.fromBufferAttribute(positions,ic);
        volume+=a.dot(b.clone().cross(c))/6;
        if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()<1e-24)degenerate++;
        for(const [v,w] of [[ia,ib],[ib,ic],[ic,ia]]){const key=v<w?`${v}:${w}`:`${w}:${v}`;edges.set(key,(edges.get(key)??0)+1);}
      }
      for(let i=0;i<positions.count;i++){
        a.fromBufferAttribute(positions,i);tip=Math.max(tip,a.sub(NAIL_REGIONS[finger].center).dot(NAIL_REGIONS[finger].up));
        b.fromBufferAttribute(normals,i);assert.ok(Number.isFinite(b.length())&&b.length()>.99);
        assert.ok(uv.getX(i)>=-1e-5&&uv.getX(i)<=1.00001,`${finger}/${shape}/${length} uv=${uv.getX(i)}`);assert.ok(uv.getY(i)>=0&&uv.getY(i)<=1);
      }
      assert.equal([...edges.values()].filter(v=>v!==2).length,0,`${finger}/${shape}/${length}: open shell`);
      assert.equal(degenerate,0,`${finger}/${shape}/${length}: degenerate face`);
      assert.ok(volume>1e-8,`${finger}/${shape}/${length}: inverted or empty volume`);
      assert.ok(tip>previousTip+.01,`${finger}/${shape}: length must visibly extend`);previousTip=tip;
      const sample=sampleNailSurface(source,finger,nail,.5,.5);assert.ok(sample.normal.dot(NAIL_REGIONS[finger].normal)>.5);
      assert.ok(nailDesignUVInside(finger,nail,{x:.5,y:.5}));
      shell.dispose();
    }
  }
  source.geometry.dispose();
});

test('prepared hand is a separate UV-preserving geometry with continuous old-nail recession and no deleted faces',()=>{
  const source=sourceMesh(),originalCount=source.geometry.getIndex()!.count;
  const prepared=createNailPreparedHandGeometry(source);
  assert.notEqual(prepared,source.geometry);assert.equal(source.geometry.getIndex()!.count,originalCount);
  assert.equal(prepared.getAttribute('position').count,source.geometry.getAttribute('position').count);
  assert.equal(prepared.getAttribute('uv').count,source.geometry.getAttribute('uv').count);
  assert.equal(prepared.getIndex()!.count,originalCount);
  assert.ok(prepared.getIndex()!.count>originalCount*.85,'must preserve the hand and fingers');
  assert.equal(prepared.userData.removedTriangleCount,0);
  assert.ok(prepared.userData.recessedNailVertices>100,'scan ridges must sit below the new shell');
  assert.equal(source.geometry.getAttribute('nailBedCover'),undefined,'original comparison remains untouched');
  const cover=prepared.getAttribute('nailBedCover');assert.equal(cover.count,prepared.getAttribute('position').count);
  let covered=0;for(const value of cover.array){assert.ok(value>=0&&value<=1);if(value>.001)covered++;}
  assert.ok(covered>100&&covered<cover.count*.10,`the local nail cover must not paint surrounding hand skin: ${covered}/${cover.count}`);
  assert.deepEqual(prepared.getAttribute('uv').array,source.geometry.getAttribute('uv').array,'preserve the original atlas');
  for(let i=0;i<cover.count;i++)if(cover.getX(i)>.001){
    const point=new THREE.Vector3().fromBufferAttribute(source.geometry.getAttribute('position'),i);
    assert.ok(NAIL_REGIONS.some((region,index)=>{
      const local=point.clone().sub(region.center),u=local.dot(region.right)/region.size.x+.5,v=local.dot(region.up)/region.size.y+.5;
      return Math.abs(local.dot(region.normal))<.06&&nailUVInside(index,{x:u,y:1-v});
    }),'a cover vertex escaped all traced nail contours');
  }
  const displayed=new THREE.Mesh(prepared,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));displayed.updateMatrixWorld();
  const neutral={shape:'oval',length:0,color:'#ffffff',finish:'gloss',pattern:'solid',strokes:[]} as NailDesign;
  for(let finger=0;finger<5;finger++)for(const u of [.32,.5,.68])for(const v of [.25,.5,.7]){
    if(!nailDesignUVInside(finger,neutral,{x:u,y:1-v}))continue;
    const point=sampleNailSurface(source,finger,neutral,u,v),ray=new THREE.Raycaster(point.position.clone().addScaledVector(point.normal,.05),point.normal.clone().negate());
    const hit=ray.intersectObject(displayed)[0];
    assert.ok(!hit||hit.distance>=.0497,`old scan pierces nail ${finger} at ${u},${v}: ${hit?.distance}`);
  }
  (displayed.material as THREE.Material).dispose();
  prepared.dispose();source.geometry.dispose();
});


test('the bed-to-extension junction has a continuous first derivative',()=>{
  const source=sourceMesh();
  for(let finger=0;finger<5;finger++)for(const length of [0,.5,1]){
    const nail={color:'#7a3048',shape:'almond',length,finish:'gloss',pattern:'solid',strokes:[]} as NailDesign;
    const junction=.76/(.76+.18+.67*length);
    for(const u of [.32,.5,.68]){
      const before=sampleNailSurface(source,finger,nail,u,junction-.00001).normal;
      const after=sampleNailSurface(source,finger,nail,u,junction+.00001).normal;
      assert.ok(before.angleTo(after)<.005,`visible tangent discontinuity on finger ${finger}`);
    }
  }
  source.geometry.dispose();
});

/** Inspect the exported mesh in the nail's anatomical frame, independent of its height formula. */
function shellProfile(shell:THREE.BufferGeometry,index:number){
  const region=NAIL_REGIONS[index],position=shell.getAttribute('position'),uv=shell.getAttribute('uv'),indices=shell.getIndex()!;
  const topGroup=shell.groups.find(group=>group.materialIndex===0)!;
  const topVertices=new Set<number>();
  for(let i=topGroup.start;i<topGroup.start+topGroup.count;i++)topVertices.add(indices.getX(i));
  type Point={x:number;y:number;z:number};
  const topRows=new Map<number,Point[]>(),throughThickness=new Map<string,{v:number;min:number;max:number}>();
  const point=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).sub(region.center);
    const p={x:point.dot(region.right),y:point.dot(region.up),z:point.dot(region.normal)},v=uv.getY(i);
    // Opposite faces share a paint coordinate, even if vertex ordering changes.
    // Their measured separation is the solid plate's thickness, not a material setting.
    const key=`${uv.getX(i)}:${v}`,column=throughThickness.get(key)??{v,min:Infinity,max:-Infinity};
    column.min=Math.min(column.min,p.z);column.max=Math.max(column.max,p.z);throughThickness.set(key,column);
    if(topVertices.has(i)){const row=topRows.get(v)??[];row.push(p);topRows.set(v,row);}
  }
  const rows=[...topRows].sort((a,b)=>a[0]-b[0]).map(([v,points])=>{
    points.sort((a,b)=>a.x-b.x);const left=points[0],right=points.at(-1)!,mid=(left.x+right.x)/2;
    const next=Math.max(1,points.findIndex(point=>point.x>=mid)),a=points[next-1],b=points[next];
    const centerHeight=THREE.MathUtils.lerp(a.z,b.z,(mid-a.x)/(b.x-a.x));
    return{v,left,right,width:right.x-left.x,crown:centerHeight-(left.z+right.z)/2};
  });
  return{rows,width:Math.max(...rows.map(row=>row.width)),columns:[...throughThickness.values()]};
}

// Regression baseline: the previous thin plate measured just 1.72–2.56% of
// nail width at the tip. Some medium oval edges rose by 17.1% of nail width
// over the last 30%, despite the centreline itself pointing downward.
test('medium and long nails retain substantial tip thickness and a crowned cross-section',()=>{
  const source=sourceMesh(),failures:string[]=[];
  for(let finger=0;finger<5;finger++)for(const shape of ['almond','oval','square','squoval','coffin','stiletto'])for(const length of [.5,1]){
    const nail={color:'#7a3048',shape,length,finish:'gloss',pattern:'solid',strokes:[]} as NailDesign;
    const shell=createNailShell(source,finger,nail),profile=shellProfile(shell,finger),id=`${finger}/${shape}/${length}`;
    const tipColumns=profile.columns.filter(column=>column.v>=.95);
    assert.ok(tipColumns.length>=3,`${id}: the tip needs inspectable solid geometry`);
    const thickness=Math.min(...tipColumns.map(column=>column.max-column.min));
    if(thickness<profile.width*.03-1e-7)failures.push(`${id}: tip thickness ${(100*thickness/profile.width).toFixed(2)}% < 3% of nail width`);
    // Ignore the infinitesimal point of tapered shapes: it may close to a point.
    // Everywhere with useful width must retain a C-curve, not a flat lifted strip.
    const crownedRows=profile.rows.filter(row=>row.v>=.45&&row.v<=.9&&row.width>=profile.width*.20);
    assert.ok(crownedRows.length>=8,`${id}: not enough transverse sections`);
    for(const row of crownedRows)if(row.crown<row.width*.015-1e-7){
      failures.push(`${id}: flat/inverted section at ${row.v.toFixed(3)} (${(100*row.crown/row.width).toFixed(2)}% crown)`);break;
    }
    shell.dispose();
  }
  source.geometry.dispose();(source.material as THREE.Material).dispose();
  assert.deepEqual(failures,[],'Extended nails must be solid and retain a rounded transverse profile');
});

test('tapering cannot lift either side edge through the final 30 percent of an extension',()=>{
  const source=sourceMesh(),failures:string[]=[];
  for(let finger=0;finger<5;finger++)for(const shape of ['almond','oval','square','squoval','coffin','stiletto'])for(const length of [.5,1]){
    const nail={color:'#7a3048',shape,length,finish:'gloss',pattern:'solid',strokes:[]} as NailDesign;
    const shell=createNailShell(source,finger,nail),profile=shellProfile(shell,finger),distal=profile.rows.filter(row=>row.v>=.7);
    assert.ok(distal.length>=10,'Need several independently measured longitudinal edge samples');
    for(const side of ['left','right'] as const){
      let low=distal[0][side].z,maxRise=0;
      for(const row of distal){maxRise=Math.max(maxRise,row[side].z-low);low=Math.min(low,row[side].z);}
      // Permit sub-visible meshing/rounding noise, not a run of rising sidewall samples.
      if(maxRise>profile.width*.003+1e-7)failures.push(`${finger}/${shape}/${length} ${side}: edge climbs ${(100*maxRise/profile.width).toFixed(2)}% of nail width`);
    }
    shell.dispose();
  }
  source.geometry.dispose();(source.material as THREE.Material).dispose();
  assert.deepEqual(failures,[],'A narrowing silhouette must not turn into an upturned side profile');
});

test('decoration and paint surface sampling stays on the rebuilt extended top mesh',()=>{
  const source=sourceMesh(),expected=new THREE.Vector3();
  for(let finger=0;finger<5;finger++)for(const shape of ['almond','oval','square','squoval','coffin','stiletto'])for(const length of [.5,1]){
    const nail={color:'#7a3048',shape,length,finish:'gloss',pattern:'solid',strokes:[]} as NailDesign;
    const shell=createNailShell(source,finger,nail),position=shell.getAttribute('position'),uv=shell.getAttribute('uv'),indices=shell.getIndex()!;
    const group=shell.groups.find(group=>group.materialIndex===0)!,vertices=new Set<number>();
    for(let i=group.start;i<group.start+group.count;i++)vertices.add(indices.getX(i));
    for(const targetV of [.25,.55,.85])for(const targetU of [.35,.5,.65]){
      // Select actual top vertices rather than assuming a particular grid resolution.
      let selected=-1,score=Infinity;
      for(const vertex of vertices){const distance=Math.abs(uv.getY(vertex)-targetV)*100+Math.abs(uv.getX(vertex)-targetU);if(distance<score){score=distance;selected=vertex;}}
      assert.ok(selected>=0);
      expected.fromBufferAttribute(position,selected);
      const sampled=sampleNailSurface(source,finger,nail,uv.getX(selected),uv.getY(selected));
      assert.ok(sampled.position.distanceTo(expected)<=NAIL_REGIONS[finger].size.x*.0001,
        `${finger}/${shape}/${length}: paint/decorations float off the top mesh at ${uv.getX(selected)},${uv.getY(selected)}`);
      assert.ok(Number.isFinite(sampled.normal.length())&&sampled.normal.length()>.99,'a usable placement normal is required');
    }
    shell.dispose();
  }
  source.geometry.dispose();(source.material as THREE.Material).dispose();
});
