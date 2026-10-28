import * as THREE from 'three';
import type { NailDesign } from './types';
import { normalizeNail } from './state';
import { renderTexture, renderParticleMap, tint } from './texture';
import { NAIL_REGIONS, sampleNailSurface } from './tripo-nails';

/** Surface appearance stays separate from the closed structural nail shell. */
export function createPolishMaterial(nail:NailDesign,anisotropy=4):THREE.MeshPhysicalMaterial {
  const n=normalizeNail(nail),mat=new THREE.MeshPhysicalMaterial();
  const tex=new THREE.CanvasTexture(renderTexture(n,1024,false));tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=anisotropy;
  const particles=new THREE.CanvasTexture(renderParticleMap(n));particles.colorSpace=THREE.NoColorSpace;
  const matte=n.topCoat==='matte';
  mat.map=tex;mat.color.set('#ffffff');mat.side=THREE.FrontSide;mat.depthWrite=true;mat.transparent=false;
  mat.roughness=matte?.72:n.optical==='mirror'?.12:n.optical==='catEye'?.32:n.base==='jelly'?.21:.25;
  mat.metalness=n.optical==='mirror'?.96:n.optical==='catEye'?.12:n.optical==='aurora'?.24:.02;
  mat.clearcoat=matte?.035:n.optical==='catEye'?.72:1;mat.clearcoatRoughness=matte?.62:n.optical==='catEye'?.18:.12;
  mat.transmission=n.base==='jelly'&&n.optical==='none'&&!matte?.14:0;
  mat.thickness=.004;mat.attenuationColor.set(n.color);mat.attenuationDistance=.035;mat.ior=1.48;
  mat.iridescence=n.optical==='aurora'?1:0;mat.iridescenceIOR=1.36;mat.iridescenceThicknessRange=[160,470];
  mat.anisotropy=0;mat.anisotropyRotation=-.48;
  mat.envMapIntensity=n.optical==='mirror'?1.0:n.optical==='aurora'?.9:.65;
  const uniforms={
    uOptical:{value:n.optical==='catEye'?1:n.optical==='aurora'?2:0},
    uOpticalColor:{value:new THREE.Color(n.opticalColor)},uParticles:{value:particles},
    uParticleColor:{value:new THREE.Color(n.particleColor)},uParticleStrength:{value:n.particles==='none'?0:matte?.10:n.particles==='shimmer'?.23:.42},
  };
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nuniform float uOptical;\nuniform vec3 uOpticalColor;\nuniform sampler2D uParticles;\nuniform vec3 uParticleColor;\nuniform float uParticleStrength;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      #ifdef USE_MAP
        vec3 eye = normalize(vViewPosition);
        float facing = clamp(dot(normal, eye),0.0,1.0);
        if (uOptical > .5 && uOptical < 1.5) {
          float magnetic = vMapUv.x + .28 * vMapUv.y - .64 - normal.x*.28 - normal.y*.11;
          float band = exp(-magnetic*magnetic*110.0);
          float core = exp(-magnetic*magnetic*620.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uOpticalColor, band * .42);
          totalEmissiveRadiance += uOpticalColor * core * .13 * pow(facing,.3);
        }
        if (uOptical > 1.5) diffuseColor.rgb = mix(diffuseColor.rgb,uOpticalColor,(1.0-facing)*.22);
        float fleck = texture2D(uParticles,vMapUv).r;
        float inclusion = max(0.0,fleck-.15) * min(1.0,uParticleStrength*4.0);
        metalnessFactor = mix(metalnessFactor,.82,inclusion);
        roughnessFactor = mix(roughnessFactor,.14,inclusion*.7);
        float glint = pow(max(0.0,dot(reflect(-eye,normal),normalize(vec3(-.3,.7,.7)))),14.0);
        totalEmissiveRadiance += uParticleColor * max(0.0,fleck-.15) * uParticleStrength * (.12+glint*1.5);
      #endif
    `);
  };
  mat.customProgramCacheKey=()=>`lune-layered-polish-v2`;
  mat.userData.particleTexture=particles;
  mat.userData.disposeExtra=()=>particles.dispose();
  return mat;
}
/** The free edge and underside carry construction colour, never a duplicate printed design. */
export function createNailStructureMaterial(nail:NailDesign):THREE.MeshPhysicalMaterial {
  const n=normalizeNail(nail),base=n.base==='jelly'?tint(n.color,'#e8c5b4',.22):n.base==='milky'?tint(n.color,'#fff7ec',.32):n.color;
  return new THREE.MeshPhysicalMaterial({color:base,roughness:n.topCoat==='matte'?.64:.30,metalness:.015,clearcoat:n.topCoat==='matte'?.03:.55,clearcoatRoughness:.2,side:THREE.FrontSide,depthWrite:true,envMapIntensity:.5});
}
export function disposePolishMaterial(mat:THREE.Material) {
  const physical=mat as THREE.MeshPhysicalMaterial;physical.map?.dispose();mat.userData.disposeExtra?.();mat.dispose();
}

/** Gems and pearls are actual volume; contours follow the fitted nail, not a screen overlay. */
export function createDecorations(source:THREE.Mesh,index:number,nail:NailDesign):THREE.Group {
  const n=normalizeNail(nail),group=new THREE.Group();group.name=`nail_decorations_${index}`;
  if(n.decoration==='none')return group;
  const width=NAIL_REGIONS[index].size.x,baseColor=new THREE.Color(n.decorationColor);
  const sample=(u:number,v:number)=>sampleNailSurface(source,index,n,u,v);
  const place=(mesh:THREE.Mesh,u:number,v:number,lift:number)=>{const s=sample(u,v);mesh.position.copy(s.position).addScaledVector(s.normal,lift);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),s.normal);group.add(mesh);};
  if(n.decoration==='pearl'||n.decoration==='rhinestone'){
    const pearl=n.decoration==='pearl';
    for(const [u,v,r] of [[.5,.18,.080],[.35,.13,.047],[.65,.13,.047]]){
      const radius=width*r;
      const material=new THREE.MeshPhysicalMaterial({color:baseColor,roughness:pearl?.22:.07,metalness:pearl?.08:.18,clearcoat:1,clearcoatRoughness:.06,iridescence:pearl?.24:.15,transmission:pearl?0:.32,thickness:radius*.4,ior:pearl?1.45:2.0,envMapIntensity:1.2});
      const gem=new THREE.Mesh(pearl?new THREE.SphereGeometry(radius,20,14):new THREE.OctahedronGeometry(radius,0),material);
      if(pearl)gem.scale.z=.72;
      place(gem,u,v,radius*(pearl?.56:.58));
    }
  }
  if(n.decoration==='star')for(const [u,v,r] of [[.46,.66,.10],[.66,.37,.052]]){
    const shape=new THREE.Shape(),radius=width*r;
    for(let j=0;j<8;j++){const angle=Math.PI/2+j*Math.PI/4,rr=radius*(j%2?.20:1),x=Math.cos(angle)*rr,y=Math.sin(angle)*rr;if(j)shape.lineTo(x,y);else shape.moveTo(x,y);}shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:width*.006,bevelEnabled:true,bevelThickness:width*.002,bevelSize:width*.0015,bevelSegments:2,steps:1});
    const star=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({color:baseColor,metalness:.82,roughness:.2,clearcoat:1}));place(star,u,v,width*.002);
  }
  if(n.decoration==='line'){
    const p0=new THREE.Vector2(.25,.9),p1=new THREE.Vector2(.8,.6),p2=new THREE.Vector2(.18,.48),p3=new THREE.Vector2(.65,.08),points:THREE.Vector3[]=[];
    for(let i=0;i<=48;i++){const t=i/48,s=1-t;const uv=p0.clone().multiplyScalar(s*s*s).addScaledVector(p1,3*s*s*t).addScaledVector(p2,3*s*t*t).addScaledVector(p3,t*t*t);const p=sample(uv.x,uv.y);points.push(p.position.addScaledVector(p.normal,width*.0035));}
    const line=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),60,width*.0045,6,false),new THREE.MeshPhysicalMaterial({color:baseColor,metalness:.88,roughness:.18,clearcoat:1}));group.add(line);
  }
  return group;
}

/** Cover only the retracted original plate, preserving every surrounding skin texel. */
export function repairPreparedNailBed(material:THREE.MeshStandardMaterial,enabled:{value:number}) {
  const compatible=material as THREE.MeshStandardMaterial & {defaultAttributeValues?:Record<string,number[]>};
  compatible.defaultAttributeValues={...compatible.defaultAttributeValues,nailBedCover:[0]};
  const previous=material.onBeforeCompile;
  const tintUniform={value:new THREE.Color('#cda697')};
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.enablePreparedNailBed=enabled;shader.uniforms.preparedNailBedTint=tintUniform;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float nailBedCover;\nvarying float vNailBedCover;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNailBedCover = nailBedCover;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vNailBedCover;\nuniform float enablePreparedNailBed;\nuniform vec3 preparedNailBedTint;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float preparedBedMask = clamp(vNailBedCover,0.0,1.0) * enablePreparedNailBed;
      diffuseColor.rgb = mix(diffuseColor.rgb,preparedNailBedTint,preparedBedMask * .96);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`vec3 preparedBedSmoothNormal = normal;
      #include <normal_fragment_maps>
      normal = normalize(mix(normal,preparedBedSmoothNormal,preparedBedMask * .96));
      roughnessFactor = mix(roughnessFactor,.62,preparedBedMask);
      metalnessFactor *= 1.0-preparedBedMask;
    `);
  };
  material.customProgramCacheKey=()=> 'lune-original-skin-prepared-bed-v1';
  material.needsUpdate=true;
}
