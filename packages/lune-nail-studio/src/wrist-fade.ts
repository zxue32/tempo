import * as THREE from 'three';

/**
 * The scan stops at the wrist with a flat cut, which reads as an amputation on a dark stage.
 * Instead of hiding the cut behind a prop, let the forearm dissolve into the night: skin alpha
 * fades out along the arm axis over the last stretch of the wrist, and the fading band picks up
 * a faint sky-coloured rim so the hand seems to rise out of starlight rather than end.
 */
export type WristFade={axis:THREE.Vector3;start:number;end:number};

/** Where the fade sits, in the mesh's own vertex frame: axis points from wrist to fingertips. */
export function measureWristFade(geometry:THREE.BufferGeometry,meshWorld:THREE.Matrix4,portion=.32):WristFade {
  // world "up" (fingers) expressed in the mesh's local frame
  const axis=new THREE.Vector3(0,1,0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(meshWorld).invert()).normalize();
  const position=geometry.getAttribute('position'),v=new THREE.Vector3();
  let min=Infinity,max=-Infinity;
  for(let i=0;i<position.count;i++){const h=v.fromBufferAttribute(position,i).dot(axis);if(h<min)min=h;if(h>max)max=h;}
  const span=max-min;
  // fully transparent at the cut, fully opaque a quarter of the way up: the wrist, not the palm
  return {axis,start:min+span*.01,end:min+span*portion};
}

export function applyWristFade(material:THREE.MeshStandardMaterial,fade:WristFade,glow=new THREE.Color('#8fa6ff')):void {
  const previous=material.onBeforeCompile;
  material.transparent=true;material.depthWrite=true;material.alphaToCoverage=false;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.wristAxis={value:fade.axis};shader.uniforms.wristStart={value:fade.start};shader.uniforms.wristEnd={value:fade.end};shader.uniforms.wristGlow={value:glow};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform vec3 wristAxis;\nvarying float vWristH;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWristH = dot( position, wristAxis );');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vWristH;\nuniform float wristStart;\nuniform float wristEnd;\nuniform vec3 wristGlow;');
    // alpha: smooth S-curve so there is no visible line where the fade begins
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>
      // ease-in: skin stays nearly solid through the palm and lets go only in the last stretch
      float wristT = smoothstep( wristStart, wristEnd, vWristH );
      float wristAlpha = pow( wristT, 1.6 );
      diffuseColor.a *= wristAlpha;`);
    // the dissolving band catches the sky: strongest just before the skin disappears
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float wristBand = ( 1.0 - wristT ) * wristT * 4.0;
      totalEmissiveRadiance += wristGlow * ( wristBand * .09 + ( 1.0 - wristT ) * .05 );`);
  };
  const key=material.customProgramCacheKey;material.customProgramCacheKey=()=>`${key.call(material)}|wrist-fade-v2`;
  material.needsUpdate=true;
}

/** A soft pool of light under the wrist, so the hand rises out of a nebula instead of a hard edge. */
export function createWristGlow(color=new THREE.Color('#8fa6ff')):THREE.Sprite {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;const g=ctx.createRadialGradient(128,128,0,128,128,128);
  g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.25,'rgba(255,255,255,.28)');g.addColorStop(.6,'rgba(255,255,255,.07)');g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,opacity:.9}));
  sprite.name='lune_wrist_glow';sprite.renderOrder=-5;sprite.raycast=()=>{};
  return sprite;
}
