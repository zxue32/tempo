import * as THREE from 'three';

/** Decorative backdrop only: never lights, casts on, or intersects the hand. */
export class AmbientSpace {
  private group = new THREE.Group();
  private dust: THREE.Points;
  private sprite: THREE.CanvasTexture;
  private floats: Array<{ mesh: THREE.Mesh; origin: THREE.Vector3; phase: number }> = [];
  private enabled = true;
  private disposed = false;

  constructor(private scene: THREE.Scene) {
    this.group.name = 'atelier_ambient_backdrop';
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16,16,0,16,16,16);
    gradient.addColorStop(0,'rgba(255,255,255,.9)');
    gradient.addColorStop(.25,'rgba(255,255,255,.55)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0,0,32,32);
    this.sprite = new THREE.CanvasTexture(canvas);
    let seed = 1937;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const positions = new Float32Array(54 * 3);
    for (let i=0;i<54;i++) {
      // An empty central lane keeps tiny moving lights away from the nail surfaces.
      positions[i*3] = (i % 2 ? 1 : -1) * (2.4 + random() * 2.0);
      positions[i*3+1] = (random()-.5) * 8.5;
      positions[i*3+2] = -3.0 - random() * 2.0;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material = new THREE.PointsMaterial({color:0xa68b72,size:.075,map:this.sprite,transparent:true,opacity:.43,depthWrite:false,sizeAttenuation:true});
    this.dust = new THREE.Points(geometry,material);this.dust.name='ambient_dust';
    this.dust.raycast = () => {}; this.group.add(this.dust);
    const shapes: Array<{ geometry: THREE.BufferGeometry; position: [number,number,number]; phase:number }> = [
      {geometry:new THREE.OctahedronGeometry(.29,0),position:[-3.1,1.9,-3.8],phase:.3},
      {geometry:new THREE.TorusGeometry(.26,.028,8,40),position:[3.2,-1.3,-3.5],phase:2.4},
      {geometry:new THREE.IcosahedronGeometry(.19,0),position:[-2.75,-2.6,-4.3],phase:4.1},
    ];
    shapes.forEach(({geometry,position,phase})=>{
      const material = new THREE.MeshPhysicalMaterial({color:0xcab8a5,metalness:.05,roughness:.32,transparent:true,opacity:.19,depthWrite:false,clearcoat:.5,side:THREE.DoubleSide});
      const mesh = new THREE.Mesh(geometry,material);mesh.name='ambient_floating_form';mesh.position.set(...position);
      mesh.rotation.set(.35+phase,.65,phase*.25);mesh.raycast=()=>{};
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),new THREE.LineBasicMaterial({color:0xa78d76,transparent:true,opacity:.22,depthWrite:false}));
      edges.raycast=()=>{};mesh.add(edges);this.group.add(mesh);
      this.floats.push({mesh,origin:mesh.position.clone(),phase});
    });
    this.scene.add(this.group);
  }

  update(elapsedSeconds: number, reducedMotion: boolean) {
    if(this.disposed || !this.enabled)return;
    // Static composition under reduced motion, not a frozen frame mid-flight.
    const t = reducedMotion ? 0 : elapsedSeconds;
    this.dust.rotation.z = Math.sin(t*.035)*.025;
    this.dust.position.y = Math.sin(t*.11)*.08;
    for(const {mesh,origin,phase} of this.floats){
      mesh.position.y=origin.y+Math.sin(t*.25+phase)*.11;
      mesh.rotation.x=.35+phase+Math.sin(t*.13)*.12;
      mesh.rotation.y=.65+t*.018;
    }
  }
  setEnabled(enabled: boolean) {this.enabled=enabled;this.group.visible=enabled;}
  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.group.traverse(object=>{
      const renderable=object as THREE.Mesh;
      renderable.geometry?.dispose();
      if(renderable.material)(Array.isArray(renderable.material)?renderable.material:[renderable.material]).forEach(m=>m.dispose());
    });
    this.sprite.dispose();this.scene.remove(this.group);this.group.clear();
  }
}
