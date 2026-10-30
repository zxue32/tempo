import styles from './style.css?inline';
import { NailScene, type StudioLighting } from './scene';
import { traceDesignNailPath } from './tripo-nails';
import { renderTexture } from './texture';
import { createDefaultDesign, validateDesign, cloneDesign, SHAPES, FINISHES, PATTERNS, FINGER_NAMES, DESIGN_LIMITS, copyUVPoint, normalizeNail, BASES, OPTICALS, PARTICLES, DECORATIONS, TOP_COATS, getLengthLabel } from './state';
import type { StudioDesign, NailDesign, Stroke, StrokePoint } from './types';
import { COMMON_COLORS, STYLE_PRESETS, buildTechnicianSummary } from './catalog';
export type { StudioDesign, NailDesign, Stroke } from './types';
export { validateDesign, createDefaultDesign } from './state';

const LEGACY_PALETTE = ['#7a3048','#ac5368','#c58088','#d9a9a1','#e8c6b7','#f4e8da','#593640','#8a6257','#b39478','#a6a68d','#788c84','#3e464e'];
const SKINS = ['#f0d1b6','#dfb394','#c98f73','#a76c50','#7c4d36','#4d3026'];
const ICONS: Record<string,string> = {
  palette:'<circle cx="12" cy="12" r="8"/><circle cx="8" cy="9" r=".6"/><circle cx="12" cy="7" r=".6"/><circle cx="16" cy="10" r=".6"/><path d="M8 18c-2-5 8-7 9-2"/>',
  shape:'<path d="M7 18V9a5 5 0 0 1 10 0v9c-3 3-7 3-10 0Z"/>',
  pen:'<path d="m5 15 10-10 4 4L9 19l-5 1 1-5Zm8-8 4 4"/>',
  hand:'<path d="M7 13V7a1.5 1.5 0 0 1 3 0v5-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6c0 7-9 8-12 3l-3-5c-1-2 1-3 3-1Z"/>',
  zoom:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M10 7v6m-3-3h6"/>',
  reset:'<path d="M5 7a8 8 0 1 1-1 9M4 3v5h5"/>',
  undo:'<path d="m7 5-4 4 4 4M3 9h10a6 6 0 0 1 0 12"/>',
  redo:'<path d="m17 5 4 4-4 4m4-4H11a6 6 0 0 0 0 12"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  save:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
};
const icon=(name:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.shape}</svg>`;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const label=(items:ReadonlyArray<{value:string;label:string}>,value:string)=>items.find(i=>i.value===value)?.label||value;
const swatch=(color:string,active:string,action:string,title=color)=>`<button class="swatch" style="--swatch:${color}" data-action="${action}" data-value="${color}" aria-label="${title}" aria-pressed="${color===active}" title="${title}"></button>`;

export class LuneNailStudio extends HTMLElement {
  private root = this.attachShadow({mode:'open'});
  private design = createDefaultDesign();
  private scene?: NailScene;
  private selected = 2;
  private tab = 'shape';
  private allSelected = true;
  private thumbnails = new Map<string,string>();
  private thumbnailRun = 0;
  private activePreset = '';
  private strokeAll = false;
  private view: 'hand'|'detail' = 'hand';
  private mode: 'orbit'|'paint' = 'orbit';
  private brushColor = '#fff7e9';
  private brushWidth = .025;
  private history: StudioDesign[] = [];
  private future: StudioDesign[] = [];
  private stroke?: Stroke;
  private strokeIndex = -1;
  private strokeBefore?: StudioDesign;
  private strokePointCount = 0;
  private drawing = false;
  private controller?: AbortController;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private webgl = true;
  private initialized = false;
  private presetDesign = false;
  private busy = false;
  private restoreWarning = '';
  private lighting:StudioLighting='daylight';
  private original=false;
  private atmosphere=true;
  private modelReady=false;
  private revealObserver?:IntersectionObserver;

  getDesign(): StudioDesign { return cloneDesign(this.design); }
  setDesign(value: unknown): void {
    const checked = validateDesign(value);
    this.presetDesign = true;
    this.change(()=>{ this.design = checked;this.activePreset=''; });
  }
  connectedCallback() {
    if(this.initialized) return;
    this.initialized=true; this.controller=new AbortController();
    if (!this.presetDesign) this.restore();
    this.render(); this.bind();
    try {
      this.scene=new NailScene(this.$('.scene'), {
        onSelect:index=>this.select(index),
        onPaint:(index,uv,phase)=>this.paint(index,uv,phase),
        onError:message=>this.fallback(message),
        onProgress:percent=>{if(!this.initialized)return;this.$<HTMLProgressElement>('.model-progress').value=percent;this.$('.loading-percent').textContent=percent?`${percent}%`:'正在读取';},
        onReady:()=>{if(!this.initialized)return;this.modelReady=true;this.webgl=true;this.scene?.setLighting(this.lighting);this.scene?.setAtmosphere(this.atmosphere);this.scene?.setMode(this.mode);this.scene?.setOriginal(this.original);this.scene?.setView(this.view);this.$('.model-loading').hidden=true;this.$('.fallback').hidden=true;this.$('.live-badge').innerHTML='<span class="dot"></span>REAL HAND · LIVE DESIGN';this.$<HTMLButtonElement>('[data-action="export-card"]').disabled=false;this.root.querySelectorAll<HTMLButtonElement>('[data-action="view"],[data-action="reset-view"],[data-action="paint-mode"]').forEach(b=>b.disabled=false);this.updateHint();this.emit('lune:ready',{webgl:true});void this.generateThumbnails();},
      },this.getAttribute('model-src')||new URL('./models/tripo-hand.glb',document.baseURI).href);
      this.scene.update(this.design,this.selected);
    } catch { this.fallback('当前设备未能开启 3D。你仍然可以选择甲型、配色，并使用平面画板。'); }
    this.refresh();
    if(this.restoreWarning) this.toast(this.restoreWarning);
    this.revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-revealed');this.revealObserver?.unobserve(entry.target);}}),{threshold:.08});
    this.root.querySelectorAll('.intro,.workspace,.bottom-strip').forEach(el=>{el.classList.add('reveal-pending');this.revealObserver!.observe(el);});
  }
  disconnectedCallback() {
    this.finishStroke(); this.persist(); this.scene?.dispose(); this.scene=undefined;
    this.controller?.abort(); clearTimeout(this.toastTimer); clearTimeout(this.saveTimer);
    this.revealObserver?.disconnect();this.thumbnailRun++;this.modelReady=false;this.initialized=false;
  }
  private $<T extends Element = HTMLElement>(selector:string): T { return this.root.querySelector(selector)! as T; }
  private emit(name:string,detail:unknown) { this.dispatchEvent(new CustomEvent(name,{detail,bubbles:true,composed:true})); }
  private get storageKey() { return this.getAttribute('storage-key') || 'lune-nail-studio:v1'; }
  private restore() {
    try { const text=localStorage.getItem(this.storageKey); if(text) {
      if(text.length>DESIGN_LIMITS.fileBytes) throw new Error();
      this.design=validateDesign(JSON.parse(text));
    } } catch { this.restoreWarning='无法读取本机草稿，已打开初始设计。'; }
  }
  private persist() {
    try { localStorage.setItem(this.storageKey,JSON.stringify(this.design)); if(this.initialized) this.$('.save-state').textContent='已保存在此设备'; }
    catch { if(this.initialized) this.$('.save-state').textContent='本机存储不可用 · 请导出文件'; }
  }
  private changed() {
    this.design.updatedAt=new Date().toISOString();
    this.refresh(); this.emit('lune:change',this.getDesign());
    clearTimeout(this.saveTimer); this.saveTimer=setTimeout(()=>this.persist(),300);
  }
  private remember(before:StudioDesign) {
    this.history.push(before); if(this.history.length>30) this.history.shift(); this.future=[];
  }
  private change(fn:()=>void, panel=true) {
    this.finishStroke();this.setComparison(false);this.updateHint(); const before=this.getDesign(); fn(); this.remember(before); this.changed();
    if(panel && this.initialized) this.renderPanel();
  }
  private updateNail(patch:Partial<NailDesign>,panel=true) {
    this.change(()=>{this.activePreset='';this.design.nails.forEach((n,i)=>{if(this.allSelected||i===this.selected)Object.assign(n,patch);});},panel);
  }
  private select(index:number) {
    this.finishStroke(); this.allSelected=index<0; if(index>=0)this.selected=index; this.refresh(); this.renderPanel();
  }
  private toast(message:string) {
    if(!this.initialized)return; const el=this.$('.toast'); el.textContent=message; el.classList.add('visible');
    clearTimeout(this.toastTimer); this.toastTimer=setTimeout(()=>el.classList.remove('visible'),3600);
  }
  private fallback(message:string) {
    this.webgl=false;this.modelReady=false;
    if(!this.initialized)return;
    this.$('.model-loading').hidden=true;this.$<HTMLButtonElement>('[data-action="export-card"]').disabled=false;
    this.$('.fallback').hidden=false;this.$('.fallback p').textContent=message+' 可继续使用平面画板。'; this.$('.live-badge').textContent='2D DESIGN MODE';
    this.$('.hint').textContent='平面设计模式 · 在右侧「手绘」中创作';
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="view"],[data-action="reset-view"],[data-action="paint-mode"]').forEach(b=>b.disabled=true);
    this.renderPanel();this.toast(message); this.emit('lune:error',{message});
  }
  private get scopeName(){return this.allSelected?'整手':FINGER_NAMES[this.selected];}
  private render() {
    this.root.innerHTML=`<style>${styles}</style><section class="studio" aria-label="LUNE 3D 美甲设计工作室" lang="zh-CN">
      <header class="topbar"><div class="brand">${escape(this.getAttribute('brand')||'3D 试色')}</div><div class="local-status"><span class="dot"></span><span class="save-state">草稿保存在此设备</span></div></header>
      <div class="workspace"><div class="visual"><div class="viewport"><div class="scene" aria-label="交互式手模。拖动旋转，滚轮缩放；点击指甲可单独设计。"></div><div class="stage-label"><strong class="design-title"></strong></div><div class="live-badge" hidden></div><div class="model-loading" role="status"><span>正在加载手模与完整甲体</span><progress class="model-progress" max="100" value="0"></progress><small class="loading-percent">正在读取</small></div><div class="fallback" hidden><p>在平面画板中继续创作</p><button class="secondary" data-action="retry">重新加载手模</button>${Array.from({length:5},(_,i)=>`<canvas data-fallback="${i}" width="150" height="260"></canvas>`).join('')}</div><button class="compare-button" data-compare aria-label="按住看原甲" aria-pressed="false">◐ 按住看原甲</button><div class="stage-tools"><button data-action="view" data-value="hand" class="active" aria-pressed="true">${icon('hand')}全手</button><button data-action="view" data-value="detail" aria-pressed="false">${icon('zoom')}甲面特写</button><span class="divider"></span><button data-action="reset-view" aria-label="复位视角">${icon('reset')}</button></div></div><p class="hint">拖动转一转 · 点一枚指甲单独改</p><div class="finger-tray"><div class="tray-heading"><span class="scope-hint"></span><button class="link-button" data-action="copy">复制此甲到五指 ↗</button></div><div class="finger-list"><button class="finger whole-hand" data-action="finger" data-value="-1" aria-pressed="true">${icon('hand')}<span>整手</span></button>${FINGER_NAMES.map((name,i)=>`<button class="finger" data-action="finger" data-value="${i}" aria-pressed="false"><canvas data-nail="${i}" width="100" height="150"></canvas><span>${name}</span></button>`).join('')}</div></div><div class="view-settings"><div class="lighting-control">${[['daylight','自然日光'],['studio','柔光影棚'],['warm','暖光室内']].map(([v,t])=>`<button data-action="lighting" data-value="${v}" aria-pressed="${this.lighting===v}">${t}</button>`).join('')}</div><label class="sync"><input type="checkbox" data-input="atmosphere" ${this.atmosphere?'checked':''}>星空</label></div></div>
      <aside class="controls" aria-label="设计工具"><div class="panel-head"><h2><span class="selected-name"></span></h2><div class="tabs workflow-tabs" role="tablist" aria-label="设计步骤">${[['shape','甲型'],['style','款式'],['base','底色'],['effects','效果'],['decoration','装饰'],['topcoat','封层']].map(([v,t],i)=>`<button id="tab-${v}" role="tab" aria-controls="panel" aria-selected="${this.tab===v}" data-action="tab" data-value="${v}"><small>${i+1}</small>${t}</button>`).join('')}</div><div class="edit-scope"><span class="scope-caption"></span><button class="link-button" data-action="tab" data-value="draw">${icon('pen')}自由手绘</button></div></div><div class="panel-body" id="panel" role="tabpanel"></div><div class="panel-footer"><div class="workflow-navigation"><button class="secondary" data-action="previous">上一步</button><button class="secondary" data-action="next">下一步 ${icon('arrow')}</button></div><div class="history-row"><button data-action="undo" aria-label="撤销">${icon('undo')}撤销</button><button data-action="redo" aria-label="重做">${icon('redo')}重做</button></div><input class="file-input" type="file" accept="application/json,.json" aria-label="导入设计 JSON 文件" hidden></div></aside></div>
      <section class="technician-card" aria-label="给技师的设计说明"><div class="technician-copy"><h2>技师会看到</h2><p class="technician-summary" aria-live="polite"></p><small>屏幕颜色仅供沟通，实际颜色和延长到店确认。</small></div><div class="handoff-actions"><button class="primary" data-action="book">带着这个设计去预约 ${icon('arrow')}</button><button class="secondary" data-action="export-card" disabled>${icon('save')} 保存设计卡</button></div></section>
      <dialog class="handoff-dialog" aria-labelledby="handoff-title"><button class="dialog-close" data-action="close-handoff" aria-label="关闭">×</button><h2 id="handoff-title">带着设计去预约</h2><p class="handoff-summary"></p><p class="subtle">先保存设计卡，预约时出示给美甲师，一起确认工艺和时间。</p><div class="dialog-actions"><button class="primary" data-action="export-card">保存到店设计卡</button><button class="secondary" data-action="export-brief">保存文字说明</button><a class="primary booking-link" hidden>继续选择预约时间 →</a></div></dialog><div class="toast" role="status" aria-live="polite"></div></section>`;
    this.renderPanel();
  }
  private choiceField(title:string,action:string,choices:ReadonlyArray<{value:string;label:string}>,active:string){
    return `<div class="field"><div class="field-title"><span>${title}</span></div><div class="choice-grid">${choices.map(c=>`<button class="pattern" data-action="${action}" data-value="${c.value}" aria-pressed="${c.value===active}">${c.label}</button>`).join('')}</div></div>`;
  }
  private colorField(title:string,key:string,color:string){
    return `<label class="color-value layer-color"><input type="color" data-layer-color="${key}" value="${color}" aria-label="${title}"><span>${title}</span><code>${color.toUpperCase()}</code></label>`;
  }
  private renderPanel() {
    if(!this.initialized)return;
    const nail=normalizeNail(this.design.nails[this.selected]);
    this.root.querySelectorAll<HTMLElement>('[role="tab"]').forEach(el=>{const active=el.dataset.value===this.tab;el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});
    const panel=this.$('#panel');if(this.tab==='draw'){panel.removeAttribute('aria-labelledby');panel.setAttribute('aria-label','自由手绘');}else{panel.setAttribute('aria-labelledby',`tab-${this.tab}`);panel.removeAttribute('aria-label');}
    let html='';
    if(this.tab==='style')html=`<div class="field-title"><span>选一个款式</span><small>之后每一层都能改</small></div><div class="lookbook">${STYLE_PRESETS.map((p,i)=>`<button class="look-card" data-action="preset" data-value="${p.id}" aria-pressed="${this.activePreset===p.id}"><span class="look-image" data-look-image="${p.id}">${this.thumbnails.has(p.id)?`<img src="${this.thumbnails.get(p.id)}" alt="${p.name}在这只手的${FINGER_NAMES[p.thumbnailIndex]}甲面上的特写">`:`<span class="thumb-pending">${this.webgl?'正在生成甲面特写':'3D 预览不可用'}</span>`}<small>0${i+1}</small></span><strong>${p.name}</strong><span class="look-description">${p.description}</span></button>`).join('')}</div>`;
    if(this.tab==='shape')html=`<div class="field"><div class="field-title"><span>先选甲型</span></div><div class="shape-options">${SHAPES.map(f=>`<button class="shape-option" data-action="shape" data-value="${f.value}" aria-pressed="${nail.shape===f.value}"><i class="shape-icon ${f.value}"></i>${f.label}</button>`).join('')}</div></div><div class="field"><div class="field-title"><span>选择长度</span></div><div class="length-options">${[[0,'短','利落日常'],[.5,'中长','修长比例'],[1,'长','需延长']].map(([v,t,d])=>`<button class="pattern" data-action="length" data-value="${v}" aria-pressed="${nail.length===v}"><strong>${t}</strong><small>${d}</small></button>`).join('')}</div></div><p class="notice">长款要做延长，到店由美甲师确认。</p>`;
    if(this.tab==='base')html=this.choiceField('底色质地','base',BASES,nail.base)+`<div class="field"><div class="field-title"><span>常用色</span></div><div class="swatches named-swatches">${COMMON_COLORS.map(c=>`<div>${swatch(c.value,nail.color,'color',c.label)}<small>${c.label}</small></div>`).join('')}</div>${this.colorField('自定义底色','color',nail.color)}</div>`;
    if(this.tab==='effects')html=`<div class="effect-section">${this.choiceField('图案','pattern',PATTERNS,nail.pattern)}${this.colorField('图案颜色','patternColor',nail.patternColor)}</div><div class="effect-section">${this.choiceField('光泽','optical',OPTICALS,nail.optical)}${this.colorField('光泽颜色','opticalColor',nail.opticalColor)}</div><div class="effect-section">${this.choiceField('颗粒','particles',PARTICLES,nail.particles)}${this.colorField('颗粒颜色','particleColor',nail.particleColor)}</div>`;
    if(this.tab==='decoration')html=this.choiceField('给甲面一点细节','decoration',DECORATIONS,nail.decoration)+this.colorField('装饰颜色','decorationColor',nail.decorationColor)+`<p class="subtle">装饰只加在${this.scopeName}。</p><button class="secondary full-width" data-action="tab" data-value="draw">${icon('pen')} 自由画线 · 添加你的签名</button>`;
    if(this.tab==='topcoat')html=this.choiceField('最后一道封层','topCoat',TOP_COATS,nail.topCoat)+this.colorField('封层微染色','topCoatColor',nail.topCoatColor)+`<div class="field name-field"><label class="field-title" for="design-name">给作品起个名字</label><input id="design-name" class="design-name" data-input="name" value="${escape(this.design.name)}" maxlength="80"></div>`;
    if(this.tab==='draw')html=`<div class="field"><div class="field-title"><span>自由手绘</span><small>当前：${this.scopeName}</small></div><div class="editor-wrap"><canvas class="paint-editor" width="560" height="430" aria-label="甲面手绘画板，使用鼠标或触控笔绘制"></canvas><span class="editor-label">画线实时同步 3D</span></div><div class="draw-tools"><button data-action="clear">清空彩绘</button><button data-action="paint-mode" aria-pressed="${this.mode==='paint'}" ${!this.webgl?'disabled':''}>3D 直绘</button></div></div><div class="field"><div class="field-title"><span>画笔颜色</span></div><div class="paint-palette">${['#fff7e9','#c3a16c','#7a3048','#303934','#dba5b6'].map(c=>swatch(c,this.brushColor,'brush')).join('')}<input type="color" data-input="brush-color" aria-label="自定义画笔颜色" value="${this.brushColor}"></div></div><div class="field"><div class="field-title"><label for="brush-width">笔触粗细</label><small class="width-value">${Math.round(this.brushWidth*1000)}</small></div><input class="range" id="brush-width" data-input="brush-width" type="range" min="0.005" max="0.1" step="0.005" value="${this.brushWidth}"></div><p class="subtle">开启 3D 直绘后会锁定旋转；点到哪枚指甲，就只绘制哪枚。⌘ / Ctrl + Z 撤销。</p>`;
    panel.innerHTML=html;this.updateScope();this.updateHistory();if(this.tab==='draw')this.renderEditor();
  }
  private updateScope(){
    this.$('.selected-name').textContent=this.scopeName;
    this.$('.scope-caption').textContent=this.allSelected?`修改同步五指 · 色值参考${FINGER_NAMES[this.selected]}`:`只编辑${this.scopeName} · 其余指甲保持原样`;
    this.$('.scope-hint').textContent=this.allSelected?'整手已选中 · 修改同步五指':`${this.scopeName}已选中 · 修改仅影响这一枚`;
    this.root.querySelectorAll<HTMLElement>('.finger').forEach(el=>{const i=Number(el.dataset.value);el.setAttribute('aria-pressed',String(i===-1?this.allSelected:!this.allSelected&&i===this.selected));});
  }
  private updateHistory(){this.root.querySelectorAll<HTMLButtonElement>('[data-action="undo"]').forEach(b=>b.disabled=!this.history.length);this.root.querySelectorAll<HTMLButtonElement>('[data-action="redo"]').forEach(b=>b.disabled=!this.future.length);this.$<HTMLButtonElement>('[data-action="previous"]').disabled=this.tab==='shape';this.$<HTMLButtonElement>('[data-action="next"]').textContent=this.tab==='topcoat'?'去预约 ↓':this.tab==='draw'?'返回装饰':'下一步 →';}
  private async generateThumbnails(){
    const run=++this.thumbnailRun;
    for(const preset of STYLE_PRESETS){
      if(!this.initialized||run!==this.thumbnailRun||!this.scene||!this.modelReady)return;
      if(!this.thumbnails.has(preset.id)){try{this.thumbnails.set(preset.id,this.scene.renderNailThumbnail(preset.nails[preset.thumbnailIndex],preset.thumbnailIndex));}catch{continue;}}
      const host=this.root.querySelector(`[data-look-image="${preset.id}"]`);if(host){const img=document.createElement('img');img.src=this.thumbnails.get(preset.id)!;img.alt=`${preset.name}在这只手的${FINGER_NAMES[preset.thumbnailIndex]}甲面上的特写`;host.prepend(img);host.querySelector('.thumb-pending')?.remove();}
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
  }
  private refresh() {
    if(!this.initialized)return;
    this.scene?.update(this.design,this.selected);
    this.$('.design-title').textContent=this.design.name;
    this.updateScope();
    this.$('.technician-summary').textContent=buildTechnicianSummary(this.design);
    this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-nail],canvas[data-fallback]').forEach(canvas=>{
      const index=Number(canvas.dataset.nail??canvas.dataset.fallback); const nail=this.design.nails[index]; const ctx=canvas.getContext('2d')!;
      const {width:w,height:h}=canvas;ctx.clearRect(0,0,w,h);ctx.save();traceDesignNailPath(ctx,index,nail,w*.13,h*.05,w*.74,h*.9);ctx.clip();ctx.drawImage(renderTexture(nail,128),w*.13,h*.05,w*.74,h*.9);ctx.restore();
    });
    this.renderEditor();
    this.updateHistory();
  }
  private editorBounds(){return{x:175,y:23,w:210,h:365};}
  private renderEditor() {
    const canvas=this.$<HTMLCanvasElement>('.paint-editor');if(!canvas)return;
    const ctx=canvas.getContext('2d')!;const b=this.editorBounds();const nail=this.design.nails[this.selected];
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();
    ctx.shadowColor='#69423422';ctx.shadowBlur=24;ctx.shadowOffsetY=10;traceDesignNailPath(ctx,this.selected,this.design.nails[this.selected],b.x,b.y,b.w,b.h);ctx.fillStyle=nail.color;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.clip();
    ctx.drawImage(renderTexture(nail,512),b.x,b.y,b.w,b.h);
    ctx.restore();ctx.strokeStyle='#bfa89a77';ctx.lineWidth=1;traceDesignNailPath(ctx,this.selected,this.design.nails[this.selected],b.x,b.y,b.w,b.h);ctx.stroke();
  }
  private bind() {
    const options={signal:this.controller!.signal};
    this.root.addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLButtonElement>('button[data-action]');if(button&&!button.disabled)void this.action(button.dataset.action!,button.dataset.value);},options);
    this.root.addEventListener('keydown',e=>{
      const event=e as KeyboardEvent;const target=event.target as HTMLElement;
      if(target.matches('input,textarea'))return;
      if(target.getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();const tabs=['shape','style','base','effects','decoration','topcoat'];const current=tabs.indexOf(this.tab);const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
        void this.action('tab',tabs[index]);this.$<HTMLButtonElement>(`#tab-${tabs[index]}`).focus();return;
      }
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();this.undo(event.shiftKey);}
    },options);
    this.root.addEventListener('input',e=>{
      const input=e.target as HTMLInputElement;
      if(input.dataset.input==='brush-width'){this.brushWidth=Number(input.value);this.$('.width-value').textContent=String(Math.round(this.brushWidth*1000));}
      if(input.dataset.input==='brush-color'){this.brushColor=input.value;}
      if(input.dataset.input==='length')this.$('.length-value').textContent=`${Math.round(Number(input.value)*100)}%`;
    },options);
    this.root.addEventListener('change',e=>{
      const input=e.target as HTMLInputElement;
      switch(input.dataset.input){
        case 'color':this.updateNail({color:input.value});break;

        case 'atmosphere':this.atmosphere=input.checked;this.scene?.setAtmosphere(this.atmosphere);break;
        case 'length':this.updateNail({length:Number(input.value)},false);break;
        case 'name':{const name=input.value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80)||'我的指尖设计';this.change(()=>this.design.name=name,false);input.value=name;break;}
      }
      if(input.dataset.layerColor){const key=input.dataset.layerColor as keyof NailDesign;this.updateNail({[key]:input.value});}
      if(input.classList.contains('file-input'))void this.importFile(input.files?.[0]);
    },options);
    this.root.addEventListener('pointerdown',e=>{
      const event=e as PointerEvent;const canvas=event.target as HTMLCanvasElement;
      if(canvas.closest('[data-compare]')){if(event.button!==0)return;event.preventDefault();(canvas.closest('[data-compare]') as HTMLElement).setPointerCapture(event.pointerId);this.setComparison(true);return;}
      if(!canvas.matches('.paint-editor')||event.button!==0||!event.isPrimary)return;
      const uv=this.editorPoint(event,canvas,true);if(!uv)return;
      event.preventDefault();canvas.setPointerCapture(event.pointerId);this.drawing=true;this.paint(this.selected,uv,'start');
    },options);
    this.root.addEventListener('pointermove',e=>{
      const event=e as PointerEvent;const canvas=event.target as HTMLCanvasElement;
      if(!this.drawing||!canvas.matches('.paint-editor'))return;
      const uv=this.editorPoint(event,canvas,false);if(uv)this.paint(this.selected,uv,'move');
    },options);
    const end=()=>{this.setComparison(false);if(this.drawing){this.drawing=false;this.finishStroke();}};
    this.root.addEventListener('pointerup',end,options);this.root.addEventListener('pointercancel',end,options);this.root.addEventListener('lostpointercapture',end,options);
    window.addEventListener('blur',()=>this.setComparison(false),options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.setComparison(false);},options);
    this.root.addEventListener('keydown',e=>{const ev=e as KeyboardEvent;if((ev.target as Element).closest('[data-compare]')&&[' ','Enter'].includes(ev.key)){ev.preventDefault();this.setComparison(true);}},options);
    this.root.addEventListener('keyup',e=>{const ev=e as KeyboardEvent;if([' ','Enter'].includes(ev.key))this.setComparison(false);},options);
    this.root.addEventListener('focusout',e=>{if((e.target as Element).closest('[data-compare]'))this.setComparison(false);},options);
  }
  private editorPoint(event:PointerEvent,canvas:HTMLCanvasElement,checkShape:boolean):StrokePoint|undefined {
    const rect=canvas.getBoundingClientRect(),b=this.editorBounds();
    const x=(event.clientX-rect.left)*canvas.width/rect.width,y=(event.clientY-rect.top)*canvas.height/rect.height;
    if(checkShape){const ctx=canvas.getContext('2d')!;traceDesignNailPath(ctx,this.selected,this.design.nails[this.selected],b.x,b.y,b.w,b.h);if(!ctx.isPointInPath(x,y))return;}
    return{x:Math.max(0,Math.min(1,(x-b.x)/b.w)),y:Math.max(0,Math.min(1,(y-b.y)/b.h))};
  }
  private paint(index:number,uv:StrokePoint,phase:'start'|'move'|'end') {
    // Store only the public UV contract, never raycaster metadata or pointer IDs.
    uv=copyUVPoint(uv);
    if(phase==='end'){this.finishStroke();return;}
    if(phase==='start'){
      this.finishStroke();
      if(this.design.nails.some((n,i)=>(this.allSelected||i===index)&&n.strokes.length>=DESIGN_LIMITS.strokesPerNail)){this.toast('这枚指甲已达 200 笔，请清空部分设计后继续。');return;}
      const total=this.design.nails.reduce((a,n)=>a+n.strokes.reduce((b,s)=>b+s.points.length,0),0);
      if(total+(this.allSelected?5:1)>DESIGN_LIMITS.totalPoints){this.toast('设计已达到绘画容量，请导出并开始新设计。');return;}
      this.strokePointCount=total;
      this.activePreset='';this.strokeAll=this.allSelected;this.selected=index;this.strokeBefore=this.getDesign();this.strokeIndex=index;
      this.stroke={color:this.brushColor,width:this.brushWidth,points:[uv]};this.design.nails[index].strokes.push(this.stroke);
    }else if(this.stroke&&index===this.strokeIndex){
      const last=this.stroke.points.at(-1)!;
      if(Math.hypot(last.x-uv.x,last.y-uv.y)<.002)return;
      if(this.stroke.points.length>=DESIGN_LIMITS.pointsPerStroke||this.strokePointCount+(this.stroke.points.length+1)*(this.strokeAll?5:1)>DESIGN_LIMITS.totalPoints){this.finishStroke();this.toast('本笔已达到长度上限，抬笔后可继续绘制。');return;}
      this.stroke.points.push(uv);
    }
    this.refresh();
  }
  private finishStroke(){
    if(this.strokeBefore){if(this.strokeAll&&this.stroke)this.design.nails.forEach((n,i)=>{if(i!==this.strokeIndex&&n.strokes.length<DESIGN_LIMITS.strokesPerNail)n.strokes.push(structuredClone(this.stroke!));});this.strokeAll=false;this.remember(this.strokeBefore);this.strokeBefore=undefined;this.stroke=undefined;this.strokeIndex=-1;this.changed();}
  }
  private undo(redo=false){
    this.finishStroke();const from=redo?this.future:this.history,to=redo?this.history:this.future;const next=from.pop();
    if(!next)return;to.push(this.getDesign());this.design=next;this.activePreset='';this.changed();this.renderPanel();
  }
  private async action(action:string,value?:string) {
    switch(action){
      case 'retry':this.disconnectedCallback();this.connectedCallback();break;
      case 'finger':this.select(Number(value));break;
      case 'lighting':this.lighting=value as StudioLighting;this.scene?.setLighting(this.lighting);this.root.querySelectorAll<HTMLElement>('[data-action="lighting"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===value)));break;
      case 'tab':this.finishStroke();this.tab=value!;if(this.tab!=='draw'){this.mode='orbit';this.scene?.setMode('orbit');}this.renderPanel();this.updateHint();break;
      case 'color':this.updateNail({color:value!});break;
      case 'finish':this.updateNail({finish:value as NailDesign['finish']});break;
      case 'shape':this.updateNail({shape:value as NailDesign['shape']});break;
      case 'skin':this.change(()=>this.design.skinTone=value!);break;
      case 'view':this.view=value as 'hand'|'detail';this.scene?.setView(this.view);this.root.querySelectorAll<HTMLElement>('[data-action="view"]').forEach(el=>{el.classList.toggle('active',el.dataset.value===value);el.setAttribute('aria-pressed',String(el.dataset.value===value));});break;
      case 'reset-view':this.scene?.resetView();this.view='hand';this.root.querySelectorAll<HTMLElement>('[data-action="view"]').forEach(el=>{const active=el.dataset.value==='hand';el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});break;
      case 'copy':{const n=cloneDesign(this.design).nails[this.selected];const points=n.strokes.reduce((sum,stroke)=>sum+stroke.points.length,0);if(points*5>DESIGN_LIMITS.totalPoints){this.toast('复制后绘画容量会超限，请先简化当前甲面彩绘。');break;}this.change(()=>{this.activePreset='';this.design.nails=Array.from({length:5},()=>structuredClone(n));});this.toast('已将当前甲面设计应用到五指');break;}
      case 'brush':this.brushColor=value!;this.renderPanel();break;
      case 'clear':this.change(()=>this.design.nails.forEach((n,i)=>{if(this.allSelected||i===this.selected)n.strokes=[];}));this.toast('已清空当前甲面彩绘，可撤销恢复');break;
      case 'undo':this.undo();break;
      case 'redo':this.undo(true);break;
      case 'paint-mode':this.finishStroke();this.mode=this.mode==='paint'?'orbit':'paint';this.scene?.setMode(this.mode);if(this.mode==='paint')this.original=false;if(this.mode==='paint'){this.view='detail';await this.action('view','detail');}this.renderPanel();this.updateHint();break;
      case 'preset':{const preset=STYLE_PRESETS.find(p=>p.id===value);if(!preset)break;this.change(()=>{const keep=(i:number,n:NailDesign)=>({...structuredClone(n),shape:this.design.nails[i].shape,length:this.design.nails[i].length});if(this.allSelected)this.design.nails=preset.nails.map((n,i)=>keep(i,n));else this.design.nails[this.selected]=keep(this.selected,preset.nails[this.selected]);this.design.name=preset.name;this.activePreset=preset.id;});this.toast(this.allSelected?'已换上这个款式，甲型保留你刚选的':`已为${this.scopeName}换上款式`);break;}
      case 'base':case 'pattern':case 'optical':case 'particles':case 'decoration':case 'topCoat':this.updateNail({[action]:value});break;
      case 'length':this.updateNail({length:Number(value)});break;
      case 'previous':case 'next':{const order=['shape','style','base','effects','decoration','topcoat'];const i=order.indexOf(this.tab);if(action==='next'&&i===5){this.$('.technician-card').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'});break;}await this.action('tab',this.tab==='draw'?'decoration':order[Math.max(0,Math.min(5,i+(action==='next'?1:-1)))]);break;}
      case 'book':this.openHandoff();break;
      case 'close-handoff':this.$<HTMLDialogElement>('.handoff-dialog').close();break;
      case 'export-brief':this.download(new Blob([this.design.name+'\n\n'+buildTechnicianSummary(this.design)+'\n\n请与美甲师确认天然甲状况、延长方式、工艺、时间与报价。'],{type:'text/plain;charset=utf-8'}),'lune-technician-brief.txt');break;
      case 'export-json':this.finishStroke();this.download(new Blob([JSON.stringify(this.getDesign(),null,2)],{type:'application/json'}),'lune-design.json');this.toast('已导出可再次编辑的设计文件');break;
      case 'import':this.$<HTMLInputElement>('.file-input').click();break;
      case 'export-card':{
        if(this.busy)return;this.busy=true;const button=this.$<HTMLButtonElement>('[data-action="export-card"]');button.disabled=true;button.textContent='正在生成设计卡…';
        try{this.finishStroke();const design=this.getDesign(),image=await this.exportCard();this.download(image,'lune-salon-design.png');this.emit('lune:handoff',{design,image});this.toast('设计卡已下载，可发送给美甲师确认');}
        catch(error){this.toast('设计卡生成失败，请先导出可编辑文件。');this.emit('lune:error',{message:error instanceof Error?error.message:'导出失败'});}
        finally{this.busy=false;button.disabled=false;button.innerHTML=`保存到店设计卡 ${icon('arrow')}`;}break;
      }
    }
  }
  private updateHint(){if(this.webgl&&this.initialized)this.$('.hint').textContent=this.original?'原甲对照中 · 松开即返回你的设计':this.mode==='paint'?'3D 直绘已开启 · 在甲面拖动画线 · 关闭后恢复旋转':'拖动转一转 · 点一枚指甲单独改';}
  private setComparison(value:boolean){if(this.original===value)return;this.original=value;this.scene?.setOriginal(value);const button=this.$<HTMLButtonElement>('[data-compare]');if(button){button.setAttribute('aria-pressed',String(value));button.textContent=value?'◐ 原甲 · 松开返回':'◐ 按住看原甲';}this.updateHint();}
  private openHandoff(){
    this.finishStroke();this.persist();const summary=buildTechnicianSummary(this.design);const event=new CustomEvent('lune:book',{detail:{design:this.getDesign(),summary},bubbles:true,composed:true,cancelable:true});if(!this.dispatchEvent(event))return;
    this.$('.handoff-summary').textContent=summary;const link=this.$<HTMLAnchorElement>('.booking-link');link.hidden=true;
    const target=this.getAttribute('booking-url');if(target){try{const url=new URL(target,document.baseURI);if(['http:','https:'].includes(url.protocol)){link.href=url.href;link.hidden=false;}}catch{}}
    this.$<HTMLDialogElement>('.handoff-dialog').showModal();
  }
  private async importFile(file?:File){
    if(!file)return;
    try{if(file.size>DESIGN_LIMITS.fileBytes)throw new Error('设计文件不能超过 5 MB');const data=JSON.parse(await file.text());this.setDesign(data);this.toast('设计已恢复，可以继续编辑');}
    catch(error){this.toast(error instanceof Error?error.message:'无法读取设计文件');}
    this.$<HTMLInputElement>('.file-input').value='';
  }
  private download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}

  /** A private-by-default salon brief. The host may upload the returned Blob with user consent. */
  async exportCard():Promise<Blob> {
    this.finishStroke();const d=this.getDesign();const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=2100;
    const ctx=canvas.getContext('2d')!;ctx.font='23px sans-serif';const briefLines:string[]=[];let briefLine='';for(const char of buildTechnicianSummary(d)){if(ctx.measureText(briefLine+char).width>1420){briefLines.push(briefLine);briefLine=char;}else briefLine+=char;}if(briefLine)briefLines.push(briefLine);canvas.height=Math.max(2100,1630+briefLines.length*36+170);
    ctx.fillStyle='#f9f6f0';ctx.fillRect(0,0,1600,canvas.height);
    ctx.fillStyle='#783c4a';ctx.font='24px Georgia';ctx.fillText('L U N E   A T E L I E R  /  N A I L   D E S I G N',90,95);
    ctx.fillStyle='#342e2c';ctx.font='48px Georgia,"Songti SC",serif';ctx.fillText(d.name,90,172,1420);
    ctx.fillStyle='#8c827d';ctx.font='23px sans-serif';ctx.fillText('我的到店设计卡 · 请与美甲师一起确认最终方案',90,220);
    if(this.scene&&this.webgl){
      try{const image=new Image();image.src=this.scene.capture();await image.decode();
        const scale=Math.min(1420/image.width,750/image.height);ctx.drawImage(image,800-image.width*scale/2,260+(750-image.height*scale)/2,image.width*scale,image.height*scale);
      }catch{ctx.fillStyle='#8c827d';ctx.font='22px sans-serif';ctx.fillText('手模快照不可用 · 下方保留完整五指平面设计',90,400);}
    }else{ctx.fillStyle='#8c827d';ctx.font='22px sans-serif';ctx.fillText('平面设计模式 · 五指款式与彩绘详见下方',90,400);}
    ctx.strokeStyle='#ddd1c6';ctx.beginPath();ctx.moveTo(90,1040);ctx.lineTo(1510,1040);ctx.stroke();
    for(let i=0;i<5;i++){
      const n=d.nails[i],x=100+i*290;
      ctx.save();traceDesignNailPath(ctx,i,n,x+55,1090,130,210);ctx.clip();ctx.drawImage(renderTexture(n,512),x+55,1090,130,210);ctx.restore();
      ctx.fillStyle='#342e2c';ctx.textAlign='center';ctx.font='25px sans-serif';ctx.fillText(FINGER_NAMES[i],x+120,1350);
      ctx.fillStyle='#8c827d';ctx.font='20px sans-serif';ctx.fillText(`${label(SHAPES,n.shape)} · ${getLengthLabel(n.length)}`,x+120,1390);
      ctx.fillText(`${label(BASES,normalizeNail(n).base)} · ${label(TOP_COATS,normalizeNail(n).topCoat)}`,x+120,1428);
      ctx.font='19px monospace';ctx.fillText(n.color.toUpperCase(),x+120,1466);
      ctx.font='18px sans-serif';ctx.fillText(`手绘 ${n.strokes.length} 笔`,x+120,1502);
    }
    ctx.textAlign='left';ctx.fillStyle='#783c4a';ctx.font='26px sans-serif';ctx.fillText('技师会看到 / YOUR SALON BRIEF',90,1580);
    ctx.fillStyle='#53443e';ctx.font='23px sans-serif';briefLines.forEach((line,i)=>ctx.fillText(line,90,1630+i*36));
    ctx.fillStyle='#8c827d';ctx.font='20px sans-serif';ctx.fillText('屏幕效果供款式沟通，实际颜色、延长方式、制作时长与报价请到店确认。',90,canvas.height-90);
    ctx.font='17px monospace';ctx.fillText(`DESIGN V1 · ${d.updatedAt} · LUNE ATELIER`,90,canvas.height-40);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 导出失败')),'image/png'));
  }
}
if(!customElements.get('lune-nail-studio'))customElements.define('lune-nail-studio',LuneNailStudio);
declare global {interface HTMLElementTagNameMap {'lune-nail-studio':LuneNailStudio}}
