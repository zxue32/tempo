import type { NailDesign } from './types';
import { nailWidthAt } from './nail-profile';
import { normalizeNail } from './state';

/** Stable particles: changing the view or another layer never moves the artwork. */
export function seededRandom(seed=1739) { return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }; }
export function tint(hex:string, other:string, amount:number) {
  const a=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)),b=other.slice(1).match(/../g)!.map(v=>parseInt(v,16));
  return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*amount).toString(16).padStart(2,'0')).join('');
}
export function particleLayout(kind:string) {
  const random=seededRandom(), count=kind==='shimmer'?950:kind==='glitter'?155:kind==='foil'?28:kind==='shell'?18:0;
  return Array.from({length:count},()=>({x:.08+random()*.84,y:.04+random()*.91,size:kind==='shimmer'?.0007+random()*.0013:kind==='glitter'?.002+random()*.004:kind==='foil'?.012+random()*.024:.022+random()*.029,angle:random()*Math.PI*2,tone:random()}));
}
function flake(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,angle:number,kind:string) {
  ctx.beginPath(); const corners=kind==='shell'?5:kind==='foil'?4:6;
  for(let j=0;j<corners;j++){const a=angle+j/corners*Math.PI*2,rr=r*(j%2?.74:1);const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(j)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();
}
export function drawDecoration(ctx:CanvasRenderingContext2D,nail:NailDesign,size:number) {
  const n=normalizeNail(nail);ctx.save();ctx.strokeStyle=ctx.fillStyle=n.decorationColor;
  if(n.decoration==='star')for(const [x,y,r] of [[.46,.34,.10],[.66,.63,.052]]){
    ctx.beginPath();for(let j=0;j<8;j++){const a=-Math.PI/2+j*Math.PI/4,rr=(j%2?.19:1)*r*size;const px=x*size+Math.cos(a)*rr,py=y*size+Math.sin(a)*rr;if(j)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();ctx.fill();
  }
  if(n.decoration==='line'){ctx.lineWidth=size*.009;ctx.beginPath();ctx.moveTo(size*.25,size*.10);ctx.bezierCurveTo(size*.8,size*.4,size*.18,size*.52,size*.65,size*.92);ctx.stroke();}
  if(n.decoration==='pearl'||n.decoration==='rhinestone')for(const [x,y,r]of [[.5,.82,.043],[.40,.87,.026],[.60,.87,.026]]){
    const g=ctx.createRadialGradient(x*size-r*size*.3,y*size-r*size*.4,0,x*size,y*size,r*size);g.addColorStop(0,tint(n.decorationColor,'#ffffff',.8));g.addColorStop(.55,n.decorationColor);g.addColorStop(1,tint(n.decorationColor,'#675a52',.35));ctx.fillStyle=g;ctx.beginPath();ctx.arc(x*size,y*size,r*size,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

/** Full, opaque UV artwork. Physical transparency comes from the 3D gel, never alpha-cut holes. */
export function renderTexture(nail: NailDesign, size = 1024, includeDecorations=true): HTMLCanvasElement {
  const n=normalizeNail(nail),canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!;
  const base=n.base==='jelly'?tint(n.color,'#e8c5b4',.10):n.base==='milky'?tint(n.color,'#fff7ec',.32):n.color;
  ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  if(n.base==='jelly'){const g=ctx.createLinearGradient(0,0,0,size);g.addColorStop(0,tint(base,'#fff9f2',.10));g.addColorStop(.5,base);g.addColorStop(1,tint(base,'#d2a89c',.12));ctx.fillStyle=g;ctx.fillRect(0,0,size,size);}
  if(n.pattern==='ombre') {const g=ctx.createLinearGradient(0,0,0,size);g.addColorStop(0,n.patternColor);g.addColorStop(.35,n.patternColor+'b0');g.addColorStop(.83,n.patternColor+'00');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);}
  if(n.pattern==='french') {ctx.fillStyle=n.patternColor;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(size,0);ctx.lineTo(size,size*.25);ctx.quadraticCurveTo(size*.5,size*.015,0,size*.25);ctx.closePath();ctx.fill();}
  if(n.pattern==='bloom') {const random=seededRandom(518);for(let i=0;i<11;i++){const x=random()*size,y=random()*size,r=(.12+random()*.32)*size,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,n.patternColor+'b0');g.addColorStop(.32,n.patternColor+'6a');g.addColorStop(.65,n.patternColor+'22');g.addColorStop(1,n.patternColor+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}ctx.save();ctx.globalAlpha=.26;ctx.strokeStyle=tint(n.patternColor,'#fff4dd',.5);ctx.lineWidth=size*.007;ctx.beginPath();ctx.moveTo(size*.1,0);ctx.bezierCurveTo(size*.88,size*.32,size*.02,size*.56,size*.82,size);ctx.stroke();ctx.restore();}
  if(n.optical==='mirror'){ctx.fillStyle=n.opticalColor+'a0';ctx.fillRect(0,0,size,size);}
  if(n.optical==='aurora'){const g=ctx.createLinearGradient(0,0,size,size);g.addColorStop(0,n.opticalColor+'66');g.addColorStop(.45,'#e7efec22');g.addColorStop(1,tint(n.opticalColor,'#d9b9ea',.65)+'88');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);}
  // Preview a soft magnetic band in the 2D editor; the actual hand gets a view-dependent shader.
  if(n.optical==='catEye'&&includeDecorations){const g=ctx.createLinearGradient(0,size*.2,size,size*.8);g.addColorStop(0,n.opticalColor+'00');g.addColorStop(.36,n.opticalColor+'08');g.addColorStop(.5,n.opticalColor+'bb');g.addColorStop(.64,n.opticalColor+'08');g.addColorStop(1,n.opticalColor+'00');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);}
  for(const p of particleLayout(n.particles)) {const x=p.x*size,y=p.y*size,r=p.size*size;ctx.fillStyle=tint(n.particleColor,p.tone>.48?'#fff8de':'#66534d',p.tone>.48?.12+p.tone*.35:.05+p.tone*.2);ctx.save();ctx.globalAlpha=n.particles==='shimmer'?.52:n.particles==='shell'?.8:.92;flake(ctx,x,y,r,p.angle,n.particles);ctx.fill();if(n.particles==='foil'||n.particles==='shell'){ctx.strokeStyle=tint(n.particleColor,'#ffffff',.5);ctx.lineWidth=Math.max(.6,size*.0008);ctx.stroke();}ctx.restore();}
  if(n.topCoatColor!=='#ffffff'){ctx.fillStyle=n.topCoatColor+'12';ctx.fillRect(0,0,size,size);}
  if(includeDecorations)drawDecoration(ctx,n,size);
  for(const stroke of n.strokes){if(!stroke.points.length)continue;ctx.strokeStyle=ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width*size;ctx.lineJoin=ctx.lineCap='round';ctx.beginPath();stroke.points.forEach((p,i)=>i?ctx.lineTo(p.x*size,p.y*size):ctx.moveTo(p.x*size,p.y*size));ctx.stroke();if(stroke.points.length===1){const p=stroke.points[0];ctx.beginPath();ctx.arc(p.x*size,p.y*size,stroke.width*size/2,0,Math.PI*2);ctx.fill();}}
  return canvas;
}

/** Particle response uses the same deterministic placement as the pigment texture. */
export function renderParticleMap(nail:NailDesign,size=512):HTMLCanvasElement {
  const n=normalizeNail(nail),canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#101010';ctx.fillRect(0,0,size,size);
  for(const p of particleLayout(n.particles)){ctx.fillStyle=n.particles==='shell'?'#b8b8b8':'#ffffff';flake(ctx,p.x*size,p.y*size,Math.max(.7,p.size*size),p.angle,n.particles);ctx.fill();}return canvas;
}

export function nailPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, shape: NailDesign['shape']) {
  const steps=96;ctx.beginPath();ctx.moveTo(x+w*.5,y+h);
  for(let i=1;i<=steps;i++){const v=i/steps;ctx.lineTo(x+w*.5-w*.5*nailWidthAt(v,shape),y+h*(1-v));}
  for(let i=steps;i>=0;i--){const v=i/steps;ctx.lineTo(x+w*.5+w*.5*nailWidthAt(v,shape),y+h*(1-v));}ctx.closePath();
}
