import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const source=process.argv[2];
if(!source) throw new Error('Usage: node scripts/prepare-tripo.mjs /path/to/source.glb');
const out=resolve(import.meta.dirname,'../public/models/tripo-hand.glb');
const reportPath=resolve(import.meta.dirname,'../public/models/tripo-asset-report.json');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document=await io.read(source);
const root=document.getRoot();
const counts=()=>root.listMeshes().reduce((result,mesh)=>{
  for(const primitive of mesh.listPrimitives()){
    result.vertices+=primitive.getAttribute('POSITION').getCount();
    result.triangles+=(primitive.getIndices()?.getCount()??primitive.getAttribute('POSITION').getCount())/3;
  } return result;
},{vertices:0,triangles:0});
const before=counts();
await MeshoptSimplifier.ready;
await document.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.085,error:.0006,lockBorder:false}),prune());
const textures=[];
for(const texture of root.listTextures()){
  const image=texture.getImage();if(!image)continue;
  const name=texture.getName();const metadata=await sharp(image).metadata();
  // Keep original 4K skin colour for close-up realism. Maps are less perceptually sensitive.
  if(/normal/i.test(name)){
    texture.setImage(await sharp(image).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer());
    texture.setMimeType('image/png');
  } else if(/_rm|rough|metal/i.test(name)){
    texture.setImage(await sharp(image).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer());
    texture.setMimeType('image/jpeg');
  }
  const final=await sharp(texture.getImage()).metadata();
  textures.push({name,before:{width:metadata.width,height:metadata.height,bytes:image.byteLength},after:{width:final.width,height:final.height,bytes:texture.getImage().byteLength}});
}
for(const node of root.listNodes())node.setName('tripo_hand_original');
for(const mesh of root.listMeshes())mesh.setName('tripo_hand_surface');
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
  const pos=p.getAttribute('POSITION').getArray();
  for(let i=0;i<pos.length;i++) {const axis=i%3;bounds.min[axis]=Math.min(bounds.min[axis],pos[i]);bounds.max[axis]=Math.max(bounds.max[axis],pos[i]);}
  if(!p.getAttribute('TEXCOORD_0')||!p.getAttribute('NORMAL'))throw new Error('Expected UVs and normals');
}
await mkdir(resolve(out,'..'),{recursive:true});
await io.write(out,document);
const bytes=(await stat(out)).size;
const report={sourceName:'hand 3d model.glb',sourceUnmodified:true,sourceBytes:(await stat(source)).size,optimizedBytes:bytes,before,after:counts(),bounds,textures,simplification:{targetRatio:.085,maxErrorFraction:.0006},preserved:{coordinateSystem:true,uvs:true,baseColor4K:true,normalMap:true,roughnessMetallicMap:true},nailMeshesSeparate:false,compression:'none; standard glTF geometry and embedded textures, no decoder required'};
await writeFile(reportPath,JSON.stringify(report,null,2));
const roundTrip=await io.read(out);
if(roundTrip.getRoot().listMeshes().length!==1)throw new Error('Unexpected mesh count');
const buffer=await readFile(out);if(buffer.readUInt32LE(0)!==0x46546c67)throw new Error('Invalid GLB');
console.log(JSON.stringify(report,null,2));
