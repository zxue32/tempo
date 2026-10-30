import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { StarField } from './starfield';
import { softenHandGeometry } from './hand-soften';
import { NAIL_REGIONS, createNailShell, createNailPreparedHandGeometry } from './tripo-nails';
import { createPolishMaterial, createNailStructureMaterial, createDecorations, disposePolishMaterial, repairPreparedNailBed } from './materials';
import { createDefaultDesign } from './state';
import { renderTexture } from './texture';
import type { StudioDesign, NailDesign } from './types';

export interface SceneCallbacks {
  onSelect:(index:number)=>void;
  onPaint:(index:number,uv:{x:number;y:number},phase:'start'|'move'|'end')=>void;
  onError?:(message:string)=>void;
  onProgress?:(percent:number)=>void;
  onReady?:()=>void;
}
export type StudioLighting = 'daylight'|'studio'|'warm';

function disposeTree(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
  root.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));});
  materials.forEach(m=>{Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v);});m.dispose();});
  textures.forEach(t=>{const source=t.source?.data;if(source&&typeof source.close==='function')source.close();t.dispose();});geometries.forEach(g=>g.dispose());
}

/** Original Tripo skin with five closed, fitted structural nails and layered gel materials. */
export class NailScene {
  readonly canvas:HTMLCanvasElement;
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(34,1,.01,100);
  private controls:OrbitControls;
  private model=new THREE.Group();
  private nailMeshes:THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial[]>[]=[];
  private source?:THREE.Object3D;
  private calibration?:THREE.Mesh;
  private displayMesh?:THREE.Mesh;
  private originalGeometry?:THREE.BufferGeometry;
  private preparedGeometry?:THREE.BufferGeometry;
  private skinBedRepair={value:1};
  private decorations:THREE.Group[]=[];
  private geometrySignatures:string[]=[];
  private materialSignatures:string[]=[];
  private decorationSignatures:string[]=[];
  private ambient:StarField;
  private envMap:THREE.WebGLRenderTarget;
  private key=new THREE.DirectionalLight('#fff6ee',1.25);
  private fill=new THREE.DirectionalLight('#f3ecff',.75);
  private rim=new THREE.DirectionalLight('#9fb4ff',.9);
  private hemisphere=new THREE.HemisphereLight('#fff1ea','#8b7f93',.9);
  private indicator=new THREE.Mesh(new THREE.SphereGeometry(.014,16,12),new THREE.MeshBasicMaterial({color:'#86465a'}));
  private design?:StudioDesign;
  private signatures:string[]=[];
  private selected=2;
  private mode:'orbit'|'paint'='orbit';
  private view:'hand'|'detail'='hand';
  private original=false;
  private atmosphere=true;
  private loaded=false;
  private disposed=false;
  private visible=true;
  private contextLost=false;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  private raf=0;
  private lastFrame=0;
  private transition=false;
  private targetPosition=new THREE.Vector3();
  private targetLookAt=new THREE.Vector3();
  private raycaster=new THREE.Raycaster();
  private pointer=new THREE.Vector2();
  private down?:{x:number;y:number};
  private activeStroke?:{index:number;x:number;y:number;pointer:number};
  private resizeObserver:ResizeObserver;
  private intersectionObserver:IntersectionObserver;

  constructor(private container:HTMLElement,private callbacks:SceneCallbacks,modelUrl='./models/tripo-hand.glb'){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.canvas=this.renderer.domElement;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','真实手模试色。拖动旋转，滚轮或双指缩放。');
    this.canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none;cursor:grab';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1;this.renderer.setClearColor('#e9e3dc',0);container.append(this.canvas);
    const pmrem=new THREE.PMREMGenerator(this.renderer),room=new THREE.Scene();room.background=new THREE.Color('#77736e');
    const softbox=new THREE.Mesh(new THREE.PlaneGeometry(3,7),new THREE.MeshBasicMaterial({color:new THREE.Color(3.0,2.95,2.85),side:THREE.DoubleSide}));softbox.position.set(-3,4,6);softbox.lookAt(0,0,0);room.add(softbox);
    const bounce=new THREE.Mesh(new THREE.PlaneGeometry(4,6),new THREE.MeshBasicMaterial({color:new THREE.Color(.8,.82,.85),side:THREE.DoubleSide}));bounce.position.set(5,1,3);bounce.lookAt(0,0,0);room.add(bounce);
    this.envMap=pmrem.fromScene(room,.035);disposeTree(room);pmrem.dispose();
    this.scene.environment=this.envMap.texture;this.scene.environmentIntensity=.55;
    this.key.position.set(-3,5,7);this.fill.position.set(4,1,4);this.rim.position.set(1,3,-6);this.scene.add(this.hemisphere,this.key,this.fill,this.rim,this.model,this.indicator);this.indicator.visible=false;
    this.ambient=new StarField(this.scene);this.ambient.setPixelRatio(this.renderer.getPixelRatio());
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.14;this.controls.enablePan=false;this.controls.minDistance=1.3;this.controls.maxDistance=20;
    // the hand is always seen from the nail side: swing left/right and tilt enough to see tips and sidewalls, never the palm
    this.controls.minAzimuthAngle=THREE.MathUtils.degToRad(-62);this.controls.maxAzimuthAngle=THREE.MathUtils.degToRad(48);
    this.controls.minPolarAngle=THREE.MathUtils.degToRad(28);this.controls.maxPolarAngle=THREE.MathUtils.degToRad(104);
    this.controls.addEventListener('start',this.onControlStart);
    this.resizeObserver=new ResizeObserver(this.resize);this.resizeObserver.observe(container);
    this.intersectionObserver=new IntersectionObserver(entries=>{this.visible=entries[0]?.isIntersecting??true;if(this.visible)this.startLoop();else this.stopLoop();},{rootMargin:'80px'});this.intersectionObserver.observe(container);
    this.canvas.addEventListener('pointerdown',this.onPointerDown);this.canvas.addEventListener('pointermove',this.onPointerMove);this.canvas.addEventListener('pointerup',this.onPointerUp);this.canvas.addEventListener('pointercancel',this.onCancel);this.canvas.addEventListener('lostpointercapture',this.onCancel);
    this.canvas.addEventListener('webglcontextlost',this.onContextLost);this.canvas.addEventListener('webglcontextrestored',this.onContextRestored);document.addEventListener('visibilitychange',this.onVisibility);
    this.resize();this.startLoop();void this.load(modelUrl);
  }
  get isLoaded(){return this.loaded;}
  private async load(url:string){
    try{
      const gltf=await new GLTFLoader().loadAsync(url,p=>{if(!this.disposed)this.callbacks.onProgress?.(p.total?Math.min(99,Math.round(p.loaded/p.total*100)):0);});
      if(this.disposed){disposeTree(gltf.scene);return;}
      const source=gltf.scene;source.updateMatrixWorld(true);
      const sourceMeshes:THREE.Mesh[]=[];source.traverse(o=>{if((o as THREE.Mesh).isMesh)sourceMeshes.push(o as THREE.Mesh);});
      if(sourceMeshes.length!==1)throw new Error('当前校准对应指定的 Tripo 单网格手模，请使用配套模型文件。');
      const mesh=sourceMeshes[0];
      // Calibrate only in the original asset frame; host normalization must never leak into fitting.
      const calibration=new THREE.Mesh(mesh.geometry,mesh.material);calibration.matrix.copy(mesh.matrixWorld);calibration.matrixAutoUpdate=false;calibration.updateMatrixWorld(true);
      this.calibration=calibration;this.displayMesh=mesh;this.originalGeometry=mesh.geometry;
      const prepared=createNailPreparedHandGeometry(calibration);softenHandGeometry(prepared,calibration.matrixWorld);this.preparedGeometry=prepared;mesh.geometry=prepared;
      const initial=this.design??createDefaultDesign();
      const nailGeometries=initial.nails.map((nail,index)=>createNailShell(calibration,index,nail));
      if(nailGeometries.some(g=>g.getAttribute('position').count<3)){nailGeometries.forEach(g=>g.dispose());disposeTree(source);throw new Error('当前校准无法匹配这个模型，请使用配套的 Tripo 手模文件。');}
      const box=new THREE.Box3().setFromObject(source),center=box.getCenter(new THREE.Vector3()),scale=6.4/box.getSize(new THREE.Vector3()).y;
      this.model.scale.setScalar(scale);this.model.position.copy(center).multiplyScalar(-scale);this.model.add(source);this.source=source;
      // skin: a soft, slightly powdered look instead of the scan's harsh micro-relief
      const skins=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(mat=>{
        if(!(mat instanceof THREE.MeshStandardMaterial))return mat;
        const skin=new THREE.MeshPhysicalMaterial({map:mat.map,normalMap:mat.normalMap,roughnessMap:mat.roughnessMap,metalnessMap:mat.metalnessMap,color:'#ffe6dc',envMapIntensity:.42,roughness:.78,metalness:0,side:mat.side});
        if(skin.normalMap)skin.normalScale.set(.22,.22);skin.sheen=.45;skin.sheenRoughness=.85;skin.sheenColor.set('#ffc9bd');
        // the scan's colour map has veins and pores baked in: read it a little blurred and pull it towards an even tone
        skin.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
          #ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vMapUv, 1.4 );
            sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( .94, .78, .71 ), .16 );
            diffuseColor *= sampledDiffuseColor;
          #endif`);};
        skin.customProgramCacheKey=()=>'lune-soft-skin-v1';
        repairPreparedNailBed(skin,this.skinBedRepair);mat.dispose();return skin;
      });
      mesh.material=skins.length===1?skins[0]:skins;
      for(let index=0;index<5;index++){
        const material=[createPolishMaterial(initial.nails[index],Math.min(8,this.renderer.capabilities.getMaxAnisotropy())),createNailStructureMaterial(initial.nails[index])];
        const nail=new THREE.Mesh(nailGeometries[index],material);nail.name=`polish_${index}`;nail.userData.nailIndex=index;this.nailMeshes.push(nail);this.model.add(nail);
        this.geometrySignatures[index]=`${initial.nails[index].shape}:${initial.nails[index].length}`;
        const decoration=createDecorations(calibration,index,initial.nails[index]);this.decorations.push(decoration);this.model.add(decoration);
      }
      this.loaded=true;this.model.updateMatrixWorld(true);this.signatures=[];if(this.design)this.update(this.design,this.selected);
      this.moveCamera(true);this.callbacks.onProgress?.(100);this.callbacks.onReady?.();
    }catch(error){if(!this.disposed){this.callbacks.onError?.(error instanceof Error&&error.message.includes('校准')?error.message:'真实手模加载失败，请检查模型文件地址或稍后重试。');}}
  }
  update(design:StudioDesign,selected:number){
    if(this.disposed)return;const focused=Number.isInteger(selected)&&selected>=0&&selected<5?selected:this.selected;const changed=focused!==this.selected;this.design=design;this.selected=focused;
    if(!this.loaded||!this.calibration)return;
    let reshaped=false;
    design.nails.forEach((nail,index)=>{
      const mesh=this.nailMeshes[index],signature=JSON.stringify(nail),geometrySignature=`${nail.shape}:${nail.length}`;
      if(geometrySignature!==this.geometrySignatures[index]){
        const geometry=createNailShell(this.calibration!,index,nail);mesh.geometry.dispose();mesh.geometry=geometry;this.geometrySignatures[index]=geometrySignature;reshaped=true;
      }
      if(signature!==this.signatures[index]){
        const {strokes,...layers}=nail,materialSignature=JSON.stringify(layers);
        if(materialSignature!==this.materialSignatures[index]){
          mesh.material.forEach(disposePolishMaterial);mesh.material=[createPolishMaterial(nail,Math.min(8,this.renderer.capabilities.getMaxAnisotropy())),createNailStructureMaterial(nail)];this.materialSignatures[index]=materialSignature;
        }else if(mesh.material[0].map){mesh.material[0].map.image=renderTexture(nail,1024,false);mesh.material[0].map.needsUpdate=true;}
        const decorationSignature=`${nail.decoration}:${nail.decorationColor}:${geometrySignature}`;
        if(decorationSignature!==this.decorationSignatures[index]){
          const previous=this.decorations[index];if(previous){this.model.remove(previous);disposeTree(previous);}
          const decoration=createDecorations(this.calibration!,index,nail);this.decorations[index]=decoration;this.model.add(decoration);this.decorationSignatures[index]=decorationSignature;
        }
        this.signatures[index]=signature;
      }
    });
    this.applyOriginalVisibility();this.updateMarker();if((changed||reshaped)&&this.view==='detail')this.moveCamera();this.render();
  }
  private applyOriginalVisibility(){
    this.skinBedRepair.value=this.original?0:1;
    this.nailMeshes.forEach(m=>m.visible=!this.original);this.decorations.forEach(m=>m.visible=!this.original);
    if(this.displayMesh&&this.originalGeometry&&this.preparedGeometry)this.displayMesh.geometry=this.original?this.originalGeometry:this.preparedGeometry;
  }
  setLighting(value:StudioLighting){
    this.key.color.set(value==='warm'?'#ffddad':'#ffffff');this.fill.color.set(value==='warm'?'#fff1d8':value==='studio'?'#f4edff':'#eff5ff');
    this.key.intensity=value==='studio'?1.35:1.8;this.scene.environmentIntensity=value==='studio'?.75:.55;this.renderer.toneMappingExposure=1;this.render();
  }
  setOriginal(value:boolean){this.endStroke();this.original=value;this.applyOriginalVisibility();this.updateMarker();this.render();}
  setAtmosphere(value:boolean){this.atmosphere=value;this.ambient.setEnabled(value);this.render();}
  setMode(mode:'orbit'|'paint'){this.endStroke();this.mode=mode;this.controls.enabled=mode==='orbit';this.canvas.style.cursor=mode==='paint'?'crosshair':'grab';if(mode==='paint')this.setOriginal(false);this.updateMarker();}
  setView(view:'hand'|'detail'){this.view=view;this.moveCamera();}
  resetView(){this.view='hand';this.moveCamera(true);}
  private updateMarker(){
    if(!this.loaded)return;const region=NAIL_REGIONS[this.selected];const p=region.center.clone();const side=new THREE.Vector3(1,0,0).applyQuaternion(region.quaternion);p.addScaledVector(side,region.size.x*.66).addScaledVector(region.normal,.003);this.model.localToWorld(p);this.indicator.position.copy(p);this.indicator.visible=!this.original&&this.mode!=='paint';
  }
  private fittedNail(index:number,margin=1.18){
    const geometry=this.nailMeshes[index].geometry;geometry.computeBoundingSphere();const sphere=geometry.boundingSphere!;
    const target=sphere.center.clone();this.model.localToWorld(target);
    const radius=sphere.radius*this.model.scale.x,halfVertical=THREE.MathUtils.degToRad(this.camera.fov/2),halfHorizontal=Math.atan(Math.tan(halfVertical)*this.camera.aspect);
    return{target,distance:Math.max(1.30,radius/Math.sin(Math.min(halfVertical,halfHorizontal))*margin)};
  }
  private moveCamera(immediate=false){
    if(this.view==='detail'&&this.loaded){const region=NAIL_REGIONS[this.selected],fit=this.fittedNail(this.selected);this.targetLookAt.copy(fit.target);this.targetPosition.copy(fit.target).addScaledVector(region.normal,fit.distance);}
    else{this.targetLookAt.set(0,.12,0);const maxLength=Math.max(0,...(this.design?.nails.map(n=>n.length)??[]));const distance=(this.camera.aspect<.8?14.1:12.9)+maxLength*.7;this.targetPosition.copy(this.targetLookAt).addScaledVector(new THREE.Vector3(-.119,.354,.928),distance);}
    if(immediate||this.reduced.matches){this.camera.position.copy(this.targetPosition);this.controls.target.copy(this.targetLookAt);this.controls.update();this.transition=false;}else this.transition=true;
  }
  private resize=()=>{if(this.disposed)return;const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.moveCamera(true);this.render();};
  private onControlStart=()=>{this.transition=false;};
  private hit(e:PointerEvent){
    if(!this.loaded||this.original)return null;const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects(this.nailMeshes,false);for(const hit of hits){const index=hit.object.userData.nailIndex as number;if(!hit.uv)continue;const mesh=hit.object as THREE.Mesh;const topTriangles=mesh.geometry.userData.topIndexCount/3;if(this.mode==='paint'&&(hit.faceIndex==null||hit.faceIndex>=topTriangles))continue;const uv={x:hit.uv.x,y:1-hit.uv.y};if(uv.x>=0&&uv.x<=1&&uv.y>=0&&uv.y<=1)return{index,...uv};}return null;
  }
  private onPointerDown=(e:PointerEvent)=>{if(e.button!==0||this.activeStroke)return;this.down={x:e.clientX,y:e.clientY};const hit=this.hit(e);if(this.mode==='paint'&&hit){e.preventDefault();this.callbacks.onSelect(hit.index);this.activeStroke={...hit,pointer:e.pointerId};this.canvas.setPointerCapture(e.pointerId);this.callbacks.onPaint(hit.index,{x:hit.x,y:hit.y},'start');}};
  private onPointerMove=(e:PointerEvent)=>{if(!this.activeStroke&&!this.down){const r=this.canvas.getBoundingClientRect();this.ambient.nudge((e.clientX-r.left)/r.width*2-1,(e.clientY-r.top)/r.height*2-1);}if(!this.activeStroke||e.pointerId!==this.activeStroke.pointer)return;e.preventDefault();const hit=this.hit(e);if(hit?.index===this.activeStroke.index){Object.assign(this.activeStroke,{x:hit.x,y:hit.y});this.callbacks.onPaint(hit.index,{x:hit.x,y:hit.y},'move');}else this.endStroke();};
  private onPointerUp=(e:PointerEvent)=>{if(this.activeStroke?.pointer===e.pointerId)this.endStroke();else if(this.mode==='orbit'&&this.down&&Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)<5){const hit=this.hit(e);if(hit)this.callbacks.onSelect(hit.index);}this.down=undefined;};
  private onCancel=()=>{this.endStroke();this.down=undefined;};
  private endStroke(){const active=this.activeStroke;if(!active)return;this.activeStroke=undefined;this.callbacks.onPaint(active.index,{x:active.x,y:active.y},'end');if(this.canvas.hasPointerCapture(active.pointer))this.canvas.releasePointerCapture(active.pointer);}
  private onContextLost=(e:Event)=>{e.preventDefault();this.contextLost=true;this.endStroke();this.stopLoop();this.callbacks.onError?.('3D 显示暂时中断，草稿已保留，请刷新后继续。');};
  private onContextRestored=()=>{this.contextLost=false;this.callbacks.onReady?.();this.startLoop();};
  private onVisibility=()=>{if(document.hidden)this.stopLoop();else this.startLoop();};
  private startLoop(){if(this.raf||this.disposed||document.hidden||!this.visible||this.contextLost)return;this.raf=requestAnimationFrame(this.tick);}
  private stopLoop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;}
  private tick=(time:number)=>{this.raf=0;if(this.disposed||document.hidden||!this.visible||this.contextLost)return;if(time-this.lastFrame>30){this.lastFrame=time;if(this.transition){this.camera.position.lerp(this.targetPosition,.18);this.controls.target.lerp(this.targetLookAt,.18);if(this.camera.position.distanceTo(this.targetPosition)<.004)this.transition=false;}this.ambient.update(time/1000,this.reduced.matches);this.controls.update();this.render();}this.startLoop();};
  private render(){if(!this.disposed&&!this.contextLost)this.renderer.render(this.scene,this.camera);}
  capture(){
    if(!this.loaded||this.contextLost)throw new Error('真实手模尚未就绪');
    const saved={position:this.camera.position.clone(),target:this.controls.target.clone(),targetPosition:this.targetPosition.clone(),targetLookAt:this.targetLookAt.clone(),view:this.view,original:this.original,marker:this.indicator.visible,transition:this.transition};
    try{this.view='hand';this.moveCamera(true);this.original=false;this.applyOriginalVisibility();this.indicator.visible=false;this.ambient.setEnabled(false);this.render();return this.canvas.toDataURL('image/png');}
    finally{this.camera.position.copy(saved.position);this.controls.target.copy(saved.target);this.controls.update();this.targetPosition.copy(saved.targetPosition);this.targetLookAt.copy(saved.targetLookAt);this.view=saved.view;this.original=saved.original;this.transition=saved.transition;this.applyOriginalVisibility();this.indicator.visible=saved.marker;this.ambient.setEnabled(this.atmosphere);this.render();}
  }
  /** Render a real fingertip from this same hand; never substitutes a reference photograph. */
  renderNailThumbnail(nail:NailDesign,index=2):string {
    if(!this.loaded||this.contextLost||!this.design)throw new Error('手模尚未就绪');
    const size=this.renderer.getSize(new THREE.Vector2());
    const saved={design:this.design,selected:this.selected,position:this.camera.position.clone(),up:this.camera.up.clone(),target:this.controls.target.clone(),targetPosition:this.targetPosition.clone(),targetLookAt:this.targetLookAt.clone(),aspect:this.camera.aspect,ratio:this.renderer.getPixelRatio(),background:this.scene.background,view:this.view,original:this.original,marker:this.indicator.visible,transition:this.transition};
    try{
      this.original=false;this.view='hand';this.scene.background=new THREE.Color('#e9e3dc');const preview={...saved.design,nails:saved.design.nails.map((n,i)=>i===index?nail:n)};this.update(preview,index);
      this.renderer.setPixelRatio(1);this.renderer.setSize(320,400,false);this.camera.aspect=.8;this.camera.updateProjectionMatrix();
      this.model.updateMatrixWorld(true);const region=NAIL_REGIONS[index],fit=this.fittedNail(index,1.30),target=fit.target,distance=fit.distance;
      this.camera.position.copy(target).addScaledVector(region.normal,distance).addScaledVector(region.right,distance*.10).addScaledVector(region.up,distance*.06);this.camera.up.copy(region.up);this.camera.lookAt(target);
      this.indicator.visible=false;this.ambient.setEnabled(false);this.render();return this.canvas.toDataURL('image/jpeg',.88);
    }finally{
      this.original=saved.original;this.scene.background=saved.background;this.view='hand';this.update(saved.design,saved.selected);this.renderer.setPixelRatio(saved.ratio);this.renderer.setSize(size.x,size.y,false);this.camera.aspect=saved.aspect;this.camera.updateProjectionMatrix();this.camera.position.copy(saved.position);this.camera.up.copy(saved.up);this.controls.target.copy(saved.target);this.camera.lookAt(saved.target);this.targetPosition.copy(saved.targetPosition);this.targetLookAt.copy(saved.targetLookAt);this.view=saved.view;this.transition=saved.transition;this.indicator.visible=saved.marker;this.ambient.setEnabled(this.atmosphere);this.applyOriginalVisibility();this.render();
    }
  }
  dispose(){
    if(this.disposed)return;this.endStroke();this.disposed=true;this.stopLoop();this.resizeObserver.disconnect();this.intersectionObserver.disconnect();this.controls.removeEventListener('start',this.onControlStart);this.controls.dispose();this.ambient.dispose();
    this.canvas.removeEventListener('pointerdown',this.onPointerDown);this.canvas.removeEventListener('pointermove',this.onPointerMove);this.canvas.removeEventListener('pointerup',this.onPointerUp);this.canvas.removeEventListener('pointercancel',this.onCancel);this.canvas.removeEventListener('lostpointercapture',this.onCancel);this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.canvas.removeEventListener('webglcontextrestored',this.onContextRestored);document.removeEventListener('visibilitychange',this.onVisibility);
    this.nailMeshes.forEach(m=>m.material.forEach(material=>material.userData.disposeExtra?.()));if(this.originalGeometry&&this.displayMesh?.geometry!==this.originalGeometry)this.originalGeometry.dispose();if(this.preparedGeometry&&this.displayMesh?.geometry!==this.preparedGeometry)this.preparedGeometry.dispose();disposeTree(this.scene);this.envMap.dispose();this.scene.clear();this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();
  }
}
