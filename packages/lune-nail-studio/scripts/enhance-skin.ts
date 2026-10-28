import { deflateSync } from 'node:zlib';

/** Embedded procedural shading textures, not a reconstruction of photographed pores. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type:string, bytes:Uint8Array):Buffer {
  const body=Buffer.concat([Buffer.from(type),bytes]);
  const head=Buffer.alloc(4);head.writeUInt32BE(bytes.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head,body,crc]);
}
function png(size:number,pixels:Uint8Array):Buffer {
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  const rows=Buffer.alloc(size*(size*3+1));
  for(let y=0;y<size;y++) rows.set(pixels.subarray(y*size*3,(y+1)*size*3),y*(size*3+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',new Uint8Array())]);
}
function hash(x:number,y:number):number {const n=Math.sin(x*127.1+y*311.7+42.19)*43758.5453;return n-Math.floor(n);}
function textures(size=1024):{normal:Buffer;roughness:Buffer} {
  const heights=new Float32Array(size*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    // A small staggered pore field with randomized pore location and depth.
    const cell=7,gx=Math.floor(x/cell),gy=Math.floor(y/cell);
    let pore=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const cx=(gx+dx+.2+.6*hash(gx+dx,gy+dy))*cell;
      const cy=(gy+dy+.2+.6*hash(gx+dx+23,gy+dy-17))*cell;
      const dist=((x-cx)**2+(y-cy)**2)/2.3;
      pore-=Math.exp(-dist)*(.09+.07*hash(gx+dx-8,gy+dy+3));
    }
    // Fine crossing skin lines; no oversized ridges or exaggerated folds.
    const lines=.014*Math.sin(x*.53+y*.31)+.012*Math.sin(x*.29-y*.49);
    heights[y*size+x]=pore+lines;
  }
  const normal=new Uint8Array(size*size*3),roughness=new Uint8Array(size*size*3);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;
    const dx=heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size];
    const dy=heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x];
    const nx=-dx*2.6,ny=dy*1.65,nz=1,length=Math.hypot(nx,ny,nz);
    normal[i*3]=Math.round((nx/length*.5+.5)*255);normal[i*3+1]=Math.round((ny/length*.5+.5)*255);normal[i*3+2]=Math.round((nz/length*.5+.5)*255);
    roughness[i*3]=255;roughness[i*3+1]=Math.round(Math.max(0,Math.min(1,.88-heights[i]*.2))*255);roughness[i*3+2]=0;
  }
  return {normal:png(size,normal),roughness:png(size,roughness)};
}

export function enhanceSkin(input:ArrayBuffer):ArrayBuffer {
  const view=new DataView(input);const jsonLength=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(input,20,jsonLength)).trim());
  const binOffset=20+jsonLength;const oldBinLength=view.getUint32(binOffset,true);
  const segments:Buffer[]=[Buffer.from(input,binOffset+8,oldBinLength)];let length=oldBinLength;
  json.bufferViews ||= [];json.images ||= [];json.textures ||= [];json.samplers ||= [];
  const sampler=json.samplers.length;json.samplers.push({magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497});
  const addImage=(data:Buffer,name:string)=>{
    const padding=(4-length%4)%4;if(padding){segments.push(Buffer.alloc(padding));length+=padding;}
    const bufferView=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});segments.push(data);length+=data.length;
    const source=json.images.length;json.images.push({name,mimeType:'image/png',bufferView});
    const texture=json.textures.length;json.textures.push({sampler,source,name});return texture;
  };
  const images=textures();const normal=addImage(images.normal,'Skin_Procedural_MicroNormal');const roughness=addImage(images.roughness,'Skin_Procedural_Roughness');
  const material=json.materials.find((item:{name?:string})=>item.name==='Skin_Satin');
  if(!material)throw new Error('Skin_Satin material missing');
  material.normalTexture={index:normal,scale:.38};material.pbrMetallicRoughness.metallicRoughnessTexture={index:roughness};material.pbrMetallicRoughness.roughnessFactor=.65;
  material.extras={...material.extras,detailOrigin:'deterministic procedural microdetail; not scanned skin'};
  json.buffers[0].byteLength=length;
  const binPadding=(4-length%4)%4;segments.push(Buffer.alloc(binPadding));const binary=Buffer.concat(segments);
  const rawJSON=Buffer.from(JSON.stringify(json));const jsonPadding=(4-rawJSON.length%4)%4;const encoded=Buffer.concat([rawJSON,Buffer.alloc(jsonPadding,32)]);
  const result=Buffer.alloc(12+8+encoded.length+8+binary.length);
  result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(encoded.length,12);result.writeUInt32LE(0x4e4f534a,16);encoded.copy(result,20);
  const next=20+encoded.length;result.writeUInt32LE(binary.length,next);result.writeUInt32LE(0x004e4942,next+4);binary.copy(result,next+8);
  // Validate every embedded image before returning; no external image/resource URL is permitted.
  for(const image of json.images){
    if(image.uri || image.mimeType!=='image/png')throw new Error('Unexpected image dependency');
    const b=json.bufferViews[image.bufferView];if(b.byteOffset+b.byteLength>json.buffers[0].byteLength)throw new Error('Image buffer exceeds GLB bounds');
    if(!binary.subarray(b.byteOffset,b.byteOffset+8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('PNG signature invalid');
  }
  return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}
