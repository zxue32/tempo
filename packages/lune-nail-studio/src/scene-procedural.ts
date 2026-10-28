import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { StudioDesign, NailDesign } from './types';
import { renderTexture } from './texture';
import { createHandGeometry, createNailGeometry, FINGER_FRAMES, makeCuticle, makeSkinDetail } from './reference-hand';

export interface SceneCallbacks {
  onSelect: (index: number) => void;
  onPaint: (index: number, uv: { x: number; y: number }, phase: 'start' | 'move' | 'end') => void;
  onError?: (message: string) => void;
}

/** Self-contained WebGL view; no global listeners survive dispose(). */
export class NailScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, .05, 80);
  private controls: OrbitControls;
  private model = new THREE.Group();
  private nailMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>[] = [];
  private skinMaterial = new THREE.MeshPhysicalMaterial({ color: '#c9977a', roughness: .65, metalness: 0, sheen: .25, sheenRoughness: .85, sheenColor: '#edb7a0' });
  private cuticleMaterial = new THREE.MeshStandardMaterial({ color: '#c18a73', roughness: .75 });
  private creaseMaterial = new THREE.LineBasicMaterial({ color: '#8b5942', transparent: true, opacity: .16, depthWrite: false });
  private textures: THREE.CanvasTexture[] = [];
  private signatures: string[] = [];
  private geometrySignatures: string[] = [];
  private design?: StudioDesign;
  private selected = 2;
  private mode: 'orbit' | 'paint' = 'orbit';
  private view: 'hand' | 'detail' = 'hand';
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private indicator: THREE.Mesh;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private envMap: THREE.WebGLRenderTarget;
  private raf = 0;
  private disposed = false;
  private visible = true;
  private contextLost = false;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private activeStroke: { index: number; x: number; y: number; pointer: number } | null = null;
  private down: { x: number; y: number } | null = null;
  private targetPosition = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();
  private transition = false;
  private lastFrame = 0;

  constructor(private container: HTMLElement, private callbacks: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '交互式 3D 手模。拖动旋转、滚轮缩放；绘画模式下可直接在甲面画线。');
    this.canvas.setAttribute('role', 'img');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .85;
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.canvas);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.envMap = pmrem.fromScene(environment, .04);
    this.scene.environment = this.envMap.texture;
    environment.dispose(); pmrem.dispose();
    this.scene.environmentIntensity = .5;
    this.scene.add(new THREE.HemisphereLight(0xfff7ed, 0xbcb3b0, .75));
    const key = new THREE.DirectionalLight(0xfff7ef, 2.2); key.position.set(-3, 5, 6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xf6f8ff, .7); fill.position.set(4, 1, 3); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd4bc, 1.1); rim.position.set(-2, -3, -2); this.scene.add(rim);

    const skin = new THREE.Mesh(createHandGeometry(), this.skinMaterial);
    this.skinMaterial.vertexColors = !!skin.geometry.getAttribute('color');
    this.model.add(skin);
    this.model.add(makeSkinDetail(this.creaseMaterial));
    this.model.rotation.set(.035, -.09, -.055);
    this.scene.add(this.model);
    for (let i = 0; i < 5; i++) {
      const f = FINGER_FRAMES[i];
      const mount = new THREE.Group(); mount.position.set(f.x, f.y, f.z); mount.rotation.set(f.rotationX??0,f.rotationY??0,f.rotation);
      const material = new THREE.MeshPhysicalMaterial({ color: '#fff', clearcoat: 1, clearcoatRoughness: .10, roughness: .25, side: THREE.DoubleSide });
      const nail = new THREE.Mesh(new THREE.BufferGeometry(), material);
      nail.userData.nailIndex = i;
      mount.add(nail, makeCuticle(f, this.cuticleMaterial));
      this.model.add(mount); this.nailMeshes.push(nail);
    }
    // A quiet marker beside the selected nail keeps the colour surface unobstructed.
    this.indicator = new THREE.Mesh(new THREE.SphereGeometry(.035, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8b4352 }));
    this.model.add(this.indicator);
    this.addShadow();
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = .12;
    this.controls.enablePan = false; this.controls.minDistance = 1.9; this.controls.maxDistance = 18;
    this.controls.minPolarAngle = Math.PI * .15; this.controls.maxPolarAngle = Math.PI * .87;
    this.controls.minAzimuthAngle = -Math.PI * .43; this.controls.maxAzimuthAngle = Math.PI * .43;
    this.controls.addEventListener('start', this.onControlStart);
    this.resetView();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.intersectionObserver = new IntersectionObserver(entries => {
      this.visible = entries[0]?.isIntersecting ?? true;
      if (this.visible) this.startLoop(); else this.stopLoop();
    }, { rootMargin: '80px' });
    this.intersectionObserver.observe(container);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('lostpointercapture', this.onLostPointerCapture);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize(); this.startLoop();
  }

  private addShadow() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(90,63,48,.17)'); gradient.addColorStop(1, 'rgba(90,63,48,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c); this.textures.push(tex);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 7.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    shadow.position.set(.30, -.40, -.75); this.scene.add(shadow);
  }

  update(design: StudioDesign, selected: number) {
    if (this.disposed) return;
    const changedSelection = selected !== this.selected;
    this.design = design; this.selected = selected;
    this.skinMaterial.color.set(design.skinTone);
    this.cuticleMaterial.color.set(design.skinTone).multiplyScalar(.97);
    this.creaseMaterial.color.set(design.skinTone).multiplyScalar(.48);
    for (let i = 0; i < 5; i++) {
      const nail = design.nails[i], mesh = this.nailMeshes[i];
      if (!nail) continue;
      const geometrySignature = `${nail.shape}:${nail.length}`;
      if (geometrySignature !== this.geometrySignatures[i]) {
        mesh.geometry.dispose(); mesh.geometry = createNailGeometry(nail, FINGER_FRAMES[i]);
        this.geometrySignatures[i] = geometrySignature;
      }
      const signature = JSON.stringify(nail);
      if (signature !== this.signatures[i]) {
        const canvas = renderTexture(nail, 1024);
        if (mesh.material.map) {
          mesh.material.map.image = canvas; mesh.material.map.needsUpdate = true;
        } else {
          const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
          mesh.material.map = texture; this.textures.push(texture);
        }
        this.applyFinish(mesh.material, nail.finish);
        this.signatures[i] = signature;
      }
    }
    this.updateMarker();
    if (changedSelection && this.view === 'detail') this.moveCamera();
    this.render();
  }

  private applyFinish(m: THREE.MeshPhysicalMaterial, finish: NailDesign['finish']) {
    m.metalness = finish === 'chrome' ? .92 : finish === 'pearl' ? .22 : 0;
    m.roughness = finish === 'matte' ? .78 : finish === 'chrome' ? .18 : finish === 'pearl' ? .29 : .25;
    m.clearcoat = finish === 'matte' ? .02 : 1;
    m.clearcoatRoughness = finish === 'pearl' ? .22 : .10;
    m.iridescence = finish === 'pearl' ? .65 : 0;
    m.iridescenceIOR = 1.35; m.iridescenceThicknessRange = [180, 350];
    m.envMapIntensity = finish === 'chrome' ? 1.5 : .65;
    m.needsUpdate = true;
  }

  private updateMarker() {
    const f = FINGER_FRAMES[this.selected];
    if (!f) return;
    const point = new THREE.Vector3(f.width * .68, -.20, .13);
    point.applyAxisAngle(new THREE.Vector3(0, 0, 1), f.rotation).add(new THREE.Vector3(f.x, f.y, f.z));
    this.indicator.position.copy(point);
    this.indicator.visible = this.mode !== 'paint';
  }

  setMode(mode: 'orbit' | 'paint') {
    if (this.activeStroke) this.endStroke();
    this.mode = mode; this.controls.enabled = mode === 'orbit';
    this.canvas.style.cursor = mode === 'paint' ? 'crosshair' : 'grab';
    this.updateMarker();
  }

  setView(view: 'hand' | 'detail') { this.view = view; this.moveCamera(); }
  resetView() { this.view = 'hand'; this.moveCamera(true); }

  private moveCamera(immediate = false) {
    this.model.updateMatrixWorld(true);
    if (this.view === 'detail') {
      const f = FINGER_FRAMES[this.selected];
      const nail = this.design?.nails[this.selected];
      this.targetLookAt.set(f.x, f.y - .13 + (nail?.length ?? .5) * .13, f.z + .06);
      this.model.localToWorld(this.targetLookAt);
      const distance = this.camera.aspect < 1 ? 3.1 : 2.7;
      this.targetPosition.copy(this.targetLookAt).add(new THREE.Vector3(.13, -.12, distance));
    } else {
      this.targetLookAt.set(0, .05, 0);
      const distance = this.camera.aspect < .8 ? 14.8 : 14.2;
      this.targetPosition.set(.15, .15, distance);
    }
    if (immediate || this.reducedMotion.matches) {
      this.camera.position.copy(this.targetPosition); this.controls.target.copy(this.targetLookAt); this.controls.update(); this.transition = false;
    } else this.transition = true;
  }

  private onControlStart = () => { this.transition = false; };
  private resize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w < 1 || h < 1) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.moveCamera(true); this.render();
  };
  private hit(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.nailMeshes, false)[0];
    if (!hit?.uv) return null;
    return { index: hit.object.userData.nailIndex as number, x: THREE.MathUtils.clamp(hit.uv.x, 0, 1), y: THREE.MathUtils.clamp(1 - hit.uv.y, 0, 1) };
  }
  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.activeStroke) return;
    this.down = { x: e.clientX, y: e.clientY };
    const hit = this.hit(e);
    if (this.mode === 'paint' && hit) {
      e.preventDefault(); this.callbacks.onSelect(hit.index);
      this.activeStroke = { ...hit, pointer: e.pointerId };
      this.canvas.setPointerCapture(e.pointerId);
      this.callbacks.onPaint(hit.index, { x: hit.x, y: hit.y }, 'start');
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.activeStroke || this.activeStroke.pointer !== e.pointerId) return;
    e.preventDefault();
    const hit = this.hit(e);
    if (hit?.index === this.activeStroke.index) {
      this.activeStroke.x = hit.x; this.activeStroke.y = hit.y;
      this.callbacks.onPaint(hit.index, { x: hit.x, y: hit.y }, 'move');
    } else {
      // Leaving a nail ends the segment; re-entry never draws a connecting slash.
      this.endStroke();
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.activeStroke?.pointer === e.pointerId) this.endStroke();
    else if (this.mode === 'orbit' && this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5) {
      const hit = this.hit(e); if (hit) this.callbacks.onSelect(hit.index);
    }
    this.down = null;
  };
  private onPointerCancel = () => { this.endStroke(); this.down = null; };
  private onLostPointerCapture = () => { if (this.activeStroke) this.endStroke(); };
  private endStroke() {
    const active = this.activeStroke; if (!active) return;
    this.activeStroke = null;
    this.callbacks.onPaint(active.index, { x: active.x, y: active.y }, 'end');
    if (this.canvas.hasPointerCapture(active.pointer)) this.canvas.releasePointerCapture(active.pointer);
  }
  private onVisibility = () => { if (document.hidden) this.stopLoop(); else this.startLoop(); };
  private onContextLost = (e: Event) => {
    e.preventDefault(); this.contextLost = true; this.stopLoop();
    this.callbacks.onError?.('3D 显示暂时中断，设计已保留。请尝试刷新页面。');
  };
  private onContextRestored = () => {
    this.contextLost = false; this.startLoop();
  };
  private startLoop() {
    if (this.raf || this.disposed || document.hidden || !this.visible || this.contextLost) return;
    this.raf = requestAnimationFrame(this.tick);
  }
  private stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  private tick = (time: number) => {
    this.raf = 0;
    if (this.disposed || document.hidden || !this.visible || this.contextLost) return;
    // 30fps is plenty for a small embedded salon configurator; gestures stay responsive.
    if (time - this.lastFrame > 30) {
      this.lastFrame = time;
      if (this.transition) {
        this.camera.position.lerp(this.targetPosition, .15); this.controls.target.lerp(this.targetLookAt, .15);
        if (this.camera.position.distanceTo(this.targetPosition) < .006) this.transition = false;
      }
      this.controls.update(); this.render();
    }
    this.startLoop();
  };
  private render() {
    if (!this.disposed && !this.contextLost) this.renderer.render(this.scene, this.camera);
  }
  capture(): string {
    if (this.contextLost) throw new Error('3D 画布暂时不可用');
    const wasVisible = this.indicator.visible; this.indicator.visible = false; this.render();
    const image = this.canvas.toDataURL('image/png');
    this.indicator.visible = wasVisible; this.render(); return image;
  }
  dispose() {
    if (this.disposed) return;
    this.endStroke(); this.disposed = true; this.stopLoop();
    this.resizeObserver.disconnect(); this.intersectionObserver.disconnect();
    this.controls.removeEventListener('start', this.onControlStart); this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    document.removeEventListener('visibilitychange', this.onVisibility);
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
    this.envMap.dispose(); this.scene.clear(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove();
  }
}
