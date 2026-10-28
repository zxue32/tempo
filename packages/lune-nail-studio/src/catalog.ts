import { BASES, DECORATIONS, FINGER_NAMES, getLengthLabel, normalizeNail, OPTICALS, PARTICLES, PATTERNS, SHAPES, TOP_COATS } from './state';
import type { NailDesign, NormalizedNailDesign, StudioDesign } from './types';

/** Product colour names, not claims of a match to a particular polish brand. */
export const COMMON_COLORS = [
  {value:'#d7b3a5',label:'裸色'}, {value:'#f1e8db',label:'奶白'}, {value:'#e3bac1',label:'樱花粉'},
  {value:'#b97989',label:'豆沙玫瑰'}, {value:'#6b2940',label:'勃艮第红'}, {value:'#9b5828',label:'琥珀'},
  {value:'#50372f',label:'巧克力'}, {value:'#a79d99',label:'奶灰'}, {value:'#819489',label:'鼠尾草'},
  {value:'#aaa0c5',label:'雾紫'}, {value:'#29364f',label:'午夜蓝'}, {value:'#151b26',label:'夜空黑'},
  {value:'#b7c6d2',label:'银河银'}, {value:'#c9a767',label:'香槟金'}, {value:'#e8dfcc',label:'珍珠白'},
] as const;

export interface StudioPreset {
  id:string;
  name:string;
  description:string;
  /** Which actual finger best represents this style in its rendered close-up. */
  thumbnailIndex:number;
  nails:NormalizedNailDesign[];
}

function nail(patch:Partial<NailDesign>={}):NormalizedNailDesign {
  return normalizeNail({color:'#d7b3a5',shape:'almond',length:.5,finish:'gloss',pattern:'solid',strokes:[],...patch});
}
function preset(id:string,name:string,description:string,base:Partial<NailDesign>,accents:Record<number,Partial<NailDesign>>={},thumbnailIndex=2):StudioPreset {
  return {id,name,description,thumbnailIndex,nails:Array.from({length:5},(_,i)=>nail({...base,...accents[i]}))};
}

/** Editable recipes. Thumbnail imagery is rendered from the supplied hand model. */
export const STYLE_PRESETS:ReadonlyArray<StudioPreset> = [
  preset('moonlight','月光猫眼','透蓝底色，银色磁光随视角流动。',
    {color:'#29364f',base:'jelly',optical:'catEye',opticalColor:'#b7c6d2',particles:'shimmer',particleColor:'#b7c6d2'}),
  preset('ice-nude','冰透裸色','轻薄裸色，保留柔和的甲床通透感。',
    {color:'#d7b3a5',base:'jelly',shape:'oval',length:0,optical:'none',particles:'none'}),
  preset('amber-gold','琥珀碎金','温润琥珀晕染，叠加不规则金箔。',
    {color:'#9b5828',base:'jelly',shape:'squoval',pattern:'bloom',patternColor:'#50372f',particles:'foil',particleColor:'#c9a767'}),
  preset('milky-shimmer','奶灰细闪','柔雾奶灰与细密银闪，低调而细腻。',
    {color:'#a79d99',base:'milky',shape:'squoval',length:0,particles:'shimmer',particleColor:'#b7c6d2'}),
  preset('starry','星空跳色','黑色猫眼与银河闪粉，裸色星星跳色。',
    {color:'#151b26',base:'solid',shape:'squoval',length:0,optical:'catEye',opticalColor:'#b7c6d2',particles:'glitter',particleColor:'#b7c6d2'},
    {2:{color:'#d7b3a5',base:'jelly',optical:'none',particles:'none',decoration:'star',decorationColor:'#151b26'},
     4:{color:'#d7b3a5',base:'jelly',optical:'none',particles:'none',decoration:'star',decorationColor:'#151b26'}}),
  preset('acetate-shell','醋酸贝壳','奶茶醋酸纹，透叠彩光与贝壳碎片。',
    {color:'#d7b3a5',base:'jelly',shape:'coffin',pattern:'bloom',patternColor:'#9b5828',optical:'aurora',opticalColor:'#aaa0c5',particles:'shell',particleColor:'#e8dfcc'},
    {3:{color:'#f1e8db',base:'milky',patternColor:'#c9a767'}}),
  preset('pearl-french','珍珠法式','乳白微笑线，搭配小颗珍珠点缀。',
    {color:'#d7b3a5',base:'jelly',shape:'oval',pattern:'french',patternColor:'#f1e8db'},
    {1:{decoration:'pearl',decorationColor:'#e8dfcc'},3:{decoration:'pearl',decorationColor:'#e8dfcc'}},1),
  preset('chocolate-mirror','巧克力镜面','浓郁可可底色，带暖棕镜面反射。',
    {color:'#50372f',base:'solid',shape:'square',length:0,optical:'mirror',opticalColor:'#9b5828'}),
];

const LEGACY_COLORS:Record<string,string>={
  '#ffffff':'白色','#000000':'黑色','#fff7e9':'暖白','#c3a16c':'香槟金',
  '#d4b7a1':'奶茶裸','#7a3048':'酒红','#788c84':'鼠尾草','#d9a9a1':'裸粉',
};
export function getColorLabel(value:string):string {
  return COMMON_COLORS.find(color=>color.value===value.toLowerCase())?.label??LEGACY_COLORS[value.toLowerCase()]??`自定义色 ${value.toUpperCase()}`;
}
const labelOf=(options:ReadonlyArray<{value:string;label:string}>,value:string)=>options.find(option=>option.value===value)?.label??value;

function instruction(nail:NormalizedNailDesign):string {
  const steps=[labelOf(SHAPES,nail.shape),getLengthLabel(nail.length),`${labelOf(BASES,nail.base)}${getColorLabel(nail.color)}`];
  if(nail.pattern!=='solid')steps.push(`${getColorLabel(nail.patternColor)}${labelOf(PATTERNS,nail.pattern)}`);
  if(nail.optical!=='none')steps.push(`${getColorLabel(nail.opticalColor)}${labelOf(OPTICALS,nail.optical)}`);
  if(nail.particles!=='none')steps.push(`${getColorLabel(nail.particleColor)}${labelOf(PARTICLES,nail.particles)}`);
  if(nail.decoration!=='none')steps.push(`${getColorLabel(nail.decorationColor)}${labelOf(DECORATIONS,nail.decoration)}`);
  if(nail.strokes.length)steps.push(`手绘 ${nail.strokes.length} 笔（按设计卡图案）`);
  const tint=nail.topCoatColor==='#ffffff'?'':`${getColorLabel(nail.topCoatColor)}微染`;
  steps.push(`${tint}${labelOf(TOP_COATS,nail.topCoat)}封层`);
  return steps.join(' · ');
}

/** Group visually identical nails; never silently discard a finger's custom painting. */
export function buildTechnicianSummary(design:StudioDesign):string {
  const groups=new Map<string,{nail:NormalizedNailDesign;indices:number[]}>();
  design.nails.forEach((source,index)=>{
    const nail=normalizeNail(source);
    // Old finish is superseded by explicit optical/top-coat fields. Colours for disabled
    // layers are retained in the editable file, but do not split an identical visible look.
    const key=JSON.stringify({shape:nail.shape,length:nail.length,base:nail.base,color:nail.color,
      pattern:nail.pattern,patternColor:nail.pattern==='solid'?null:nail.patternColor,
      optical:nail.optical,opticalColor:nail.optical==='none'?null:nail.opticalColor,
      particles:nail.particles,particleColor:nail.particles==='none'?null:nail.particleColor,
      decoration:nail.decoration,decorationColor:nail.decoration==='none'?null:nail.decorationColor,
      topCoat:nail.topCoat,topCoatColor:nail.topCoatColor,strokes:nail.strokes});
    const group=groups.get(key)??{nail,indices:[]};group.indices.push(index);groups.set(key,group);
  });
  return [...groups.values()].sort((a,b)=>b.indices.length-a.indices.length||a.indices[0]-b.indices[0]).map(group=>{
    const fingers=group.indices.length===5?'整手':group.indices.map(index=>FINGER_NAMES[index]).join('、');
    return `${fingers}：${instruction(group.nail)}`;
  }).join('；');
}
