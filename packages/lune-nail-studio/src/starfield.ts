import * as THREE from 'three';

/**
 * A night sky around the hand: thousands of stars on a far sphere, so orbiting the hand turns the sky
 * with it, plus a slow drift and a gentle twinkle. Decorative only — never lights or intersects the hand.
 */
export class StarField {
  private group=new THREE.Group();
  private stars:THREE.Points;
  private bright:THREE.Points;
  private material:THREE.ShaderMaterial;
  private brightMaterial:THREE.ShaderMaterial;
  private sprite:THREE.CanvasTexture;
  private enabled=true;
  private disposed=false;
  private drift=new THREE.Vector2();
  private driftTarget=new THREE.Vector2();

  constructor(private scene:THREE.Scene, tint=new THREE.Color('#9fb4ff')){
    this.group.name='lune_starfield';
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d')!;const g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.18,'rgba(255,255,255,.85)');g.addColorStop(.45,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    this.sprite=new THREE.CanvasTexture(canvas);
    let seed=20261030;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const make=(count:number,radius:number,sizeMin:number,sizeMax:number)=>{
      const positions=new Float32Array(count*3),sizes=new Float32Array(count),phases=new Float32Array(count),warm=new Float32Array(count);
      for(let i=0;i<count;i++){
        // uniform on the sphere, but thinner straight behind the hand so the nails stay the brightest thing
        const u=random()*2-1,t=random()*Math.PI*2,r=Math.sqrt(1-u*u);
        const x=r*Math.cos(t),y=u,z=r*Math.sin(t);
        positions[i*3]=x*radius;positions[i*3+1]=y*radius;positions[i*3+2]=z*radius;
        sizes[i]=sizeMin+random()*(sizeMax-sizeMin);phases[i]=random()*Math.PI*2;warm[i]=random();
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
      geometry.setAttribute('aPhase',new THREE.BufferAttribute(phases,1));
      geometry.setAttribute('aWarm',new THREE.BufferAttribute(warm,1));
      return geometry;
    };
    const shader=(opacity:number)=>new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uMap:{value:this.sprite},uTint:{value:tint},uOpacity:{value:opacity},uPixelRatio:{value:1}},
      vertexShader:`attribute float aSize;attribute float aPhase;attribute float aWarm;uniform float uTime;uniform float uPixelRatio;varying float vTwinkle;varying float vWarm;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);float tw=.72+.28*sin(uTime*(1.1+aWarm*1.7)+aPhase);vTwinkle=tw;vWarm=aWarm;
        gl_PointSize=aSize*uPixelRatio*(300.0/-mv.z)*tw;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform sampler2D uMap;uniform vec3 uTint;uniform float uOpacity;varying float vTwinkle;varying float vWarm;
        void main(){vec4 s=texture2D(uMap,gl_PointCoord);vec3 col=mix(uTint,vec3(1.0,.96,.90),vWarm*.8);gl_FragColor=vec4(col,s.a*uOpacity*vTwinkle);}`,
      transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,
    });
    this.material=shader(.75);this.brightMaterial=shader(.95);
    this.stars=new THREE.Points(make(2200,58,.9,2.2),this.material);this.stars.raycast=()=>{};
    this.bright=new THREE.Points(make(90,54,3.2,6.5),this.brightMaterial);this.bright.raycast=()=>{};
    this.group.add(this.stars,this.bright);this.scene.add(this.group);
  }
  setPixelRatio(ratio:number){this.material.uniforms.uPixelRatio.value=ratio;this.brightMaterial.uniforms.uPixelRatio.value=ratio;}
  setTint(color:THREE.Color){this.material.uniforms.uTint.value=color;this.brightMaterial.uniforms.uTint.value=color;}
  /** Pointer position in −1…1, for a touch of parallax while the hand is still. */
  nudge(x:number,y:number){this.driftTarget.set(x,y);}
  update(elapsedSeconds:number,reducedMotion:boolean){
    if(this.disposed||!this.enabled)return;
    const t=reducedMotion?0:elapsedSeconds;
    this.material.uniforms.uTime.value=t;this.brightMaterial.uniforms.uTime.value=t;
    this.drift.lerp(this.driftTarget,.04);
    this.group.rotation.y=t*.012+this.drift.x*.06;
    this.group.rotation.x=Math.sin(t*.05)*.02-this.drift.y*.04;
  }
  setEnabled(enabled:boolean){this.enabled=enabled;this.group.visible=enabled;}
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.stars.geometry.dispose();this.bright.geometry.dispose();this.material.dispose();this.brightMaterial.dispose();this.sprite.dispose();
    this.scene.remove(this.group);this.group.clear();
  }
}
