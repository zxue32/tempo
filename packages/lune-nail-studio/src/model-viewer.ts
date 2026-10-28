import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const container=document.querySelector<HTMLElement>('#stage')!;
async function main(){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#000000');renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;container.prepend(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.01,100);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=4;controls.maxDistance=22;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room,.03);scene.environment=env.texture;scene.environmentIntensity=.5;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff0df,0x817369,.75));
  const key=new THREE.DirectionalLight('#fff0df',2.5);key.position.set(-3,5,6);scene.add(key);
  const fill=new THREE.DirectionalLight('#d8e5ff',.7);fill.position.set(4,0,2);scene.add(fill);
  const rim=new THREE.DirectionalLight('#e4c2a5',1.4);rim.position.set(2,3,-3);scene.add(rim);
  const embedded=document.querySelector('#embedded-glb')?.textContent?.trim();
  const loader=new GLTFLoader();
  const asset=embedded ? await loader.parseAsync(Uint8Array.from(atob(embedded),c=>c.charCodeAt(0)).buffer,'') : await loader.loadAsync('./models/lune-reference-hand.glb');
  const model=asset.scene;scene.add(model);
  const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const originalMaterials=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();let faces=0;
  model.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){faces+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;if(m.name.startsWith('nail_'))originalMaterials.set(m,m.material);}});
  document.querySelector('#face-count')!.textContent=Math.round(faces).toLocaleString();
  let currentView='front';
  const setView=(view:string)=>{currentView=view;const distance=Math.max(size.y*2.05,size.x*2.1/camera.aspect);controls.target.copy(center);camera.position.copy(center).add(view==='back'?new THREE.Vector3(0,0,-distance):view==='side'?new THREE.Vector3(distance,.1,.5):new THREE.Vector3(.08,.08,distance));controls.update();};
  const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();setView(currentView);});observer.observe(container);
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.view!);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));}));
  const polish=new THREE.MeshPhysicalMaterial({color:'#7a3048',roughness:.22,clearcoat:1,clearcoatRoughness:.12});
  const pearl=new THREE.MeshPhysicalMaterial({color:'#e8d1c3',roughness:.28,clearcoat:1,metalness:.18,iridescence:.4});
  document.querySelectorAll<HTMLButtonElement>('[data-finish]').forEach(b=>b.addEventListener('click',()=>{originalMaterials.forEach((mat,mesh)=>{mesh.material=b.dataset.finish==='natural'?mat:b.dataset.finish==='burgundy'?polish:pearl;});document.querySelectorAll('[data-finish]').forEach(x=>x.classList.toggle('active',x===b));}));
  let last=0;const tick=(time:number)=>{requestAnimationFrame(tick);if(document.hidden||time-last<32)return;last=time;controls.update();renderer.render(scene,camera);};setView('front');requestAnimationFrame(tick);
}
main().catch(error=>{const notice=document.createElement('p');notice.className='error';notice.textContent='模型预览暂时不可用。你仍可下载 GLB 文件，在支持 3D 的软件中打开。';container.append(notice);console.error(error);});
