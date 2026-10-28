import * as THREE from 'three';
import { FINGER_FRAMES, createHandGeometry, createNailGeometry, makeCuticle } from './reference-hand';
import type { NailDesign } from './types';

export const REFERENCE_NAIL: NailDesign = {color:'#d9a9a1',shape:'oval',length:.28,finish:'gloss',pattern:'solid',strokes:[]};
export const REFERENCE_SKIN = '#cda98f';
export const FINGER_IDS = ['thumb','index','middle','ring','pinky'];

/** Real 3D geometry fitted approximately to a single dorsal reference; no calibrated scale. */
export function createReferenceModel(): THREE.Group {
  const model = new THREE.Group(); model.name='LUNE_PhotoReference_Hand';
  model.userData={approximateFromSinglePhoto:true,multiViewReference:true,referenceMode:'photo-and-three-render-screenshots',measuredUnits:false,units:'normalized_not_measured',pose:'fixed',reference:'hand-black-enhanced.png',unseenSurfaces:'artist-estimated',nailOrder:FINGER_IDS};
  const skinGeometry=createHandGeometry();
  const skinMaterial=new THREE.MeshPhysicalMaterial({color:REFERENCE_SKIN,vertexColors:!!skinGeometry.getAttribute('color'),roughness:.56,metalness:0,sheen:.15,sheenColor:'#e8c0a9',sheenRoughness:.8});
  skinMaterial.name='Skin_Satin';
  const skin=new THREE.Mesh(skinGeometry,skinMaterial);skin.name='hand_skin';model.add(skin);
  const cuticleMaterial=new THREE.MeshStandardMaterial({color:REFERENCE_SKIN,roughness:.64});cuticleMaterial.name='Cuticle_Soft';
  FINGER_FRAMES.forEach((frame,index)=>{
    const mount=new THREE.Group();mount.name=`finger_${FINGER_IDS[index]}`;
    mount.position.set(frame.x,frame.y,frame.z);mount.rotation.set(frame.rotationX??0,frame.rotationY??0,frame.rotation);
    const geometry=createNailGeometry(REFERENCE_NAIL,frame);
    const colors=new Float32Array(geometry.getAttribute('position').count*3);
    const pink=new THREE.Color('#d2a5a2'),ivory=new THREE.Color('#ece4d0');
    const uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++){
      const u=uv.getX(i),v=uv.getY(i);
      const edge=.82+.08*(1-(u*2-1)**2);
      const blend=THREE.MathUtils.smoothstep(v,edge-.018,edge+.025);
      const color=pink.clone().lerp(ivory,blend);color.toArray(colors,i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const material=new THREE.MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,roughness:.27,clearcoat:.75,clearcoatRoughness:.2});material.name=`NaturalNail_${FINGER_IDS[index]}`;
    const nail=new THREE.Mesh(geometry,material);nail.name=`nail_${FINGER_IDS[index]}`;
    nail.userData={nailIndex:index,editable:true,uvConvention:'x left-to-right, v cuticle-to-tip',...REFERENCE_NAIL,strokes:[]};
    const cuticle=makeCuticle(frame,cuticleMaterial);cuticle.name=`cuticle_${FINGER_IDS[index]}`;
    mount.add(nail,cuticle);model.add(mount);
  });
  return model;
}
