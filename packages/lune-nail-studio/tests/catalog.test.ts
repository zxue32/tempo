import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_COLORS, STYLE_PRESETS, buildTechnicianSummary } from '../src/catalog';
import { createDefaultDesign, normalizeNail, SHAPES, validateDesign } from '../src/state';
import type { NailDesign } from '../src/types';

test('eight editable styles use 15 unique named colours and six supported shapes',()=>{
  assert.equal(COMMON_COLORS.length,15);
  assert.equal(new Set(COMMON_COLORS.map(color=>color.value)).size,15);
  assert.equal(SHAPES.length,6);
  assert.equal(STYLE_PRESETS.length,8);
  assert.equal(new Set(STYLE_PRESETS.map(style=>style.id)).size,8);
  for(const style of STYLE_PRESETS){
    const design={...createDefaultDesign(),name:style.name,nails:style.nails};
    assert.deepEqual(validateDesign(JSON.parse(JSON.stringify(design))),design);
    assert.equal(style.nails.length,5);
    assert.ok(Number.isInteger(style.thumbnailIndex)&&style.thumbnailIndex>=0&&style.thumbnailIndex<5);
    assert.notEqual(style.nails[0],style.nails[1]);
    assert.notEqual(style.nails[0].strokes,style.nails[1].strokes);
  }
});

test('pearl French thumbnail uses the real finger carrying a pearl',()=>{
  const style=STYLE_PRESETS.find(style=>style.id==='pearl-french')!;
  assert.equal(style.thumbnailIndex,1);
  assert.equal(style.nails[style.thumbnailIndex].decoration,'pearl');
});

test('legacy schema 1 imports migrate to complete layer data without losing paint',()=>{
  const design=createDefaultDesign();
  const old:NailDesign={color:'#ABCDEF',shape:'oval',length:.45,finish:'chrome',pattern:'french',strokes:[{color:'#FFFFFF',width:.02,points:[{x:.2,y:.3}]}]};
  design.nails=Array.from({length:5},()=>old);
  const copy=validateDesign(design);
  assert.equal(copy.schemaVersion,1);
  assert.equal(copy.nails[0].length,.5);
  assert.equal(copy.nails[0].base,'solid');
  assert.equal(copy.nails[0].optical,'mirror');
  assert.equal(copy.nails[0].opticalColor,'#abcdef');
  assert.equal(copy.nails[0].topCoat,'gloss');
  assert.equal(copy.nails[0].strokes[0].color,'#ffffff');
  copy.nails[0].strokes[0].points[0].x=.8;
  assert.equal(old.strokes[0].points[0].x,.2);
  assert.equal(copy.nails[1].strokes[0].points[0].x,.2);
  assert.deepEqual(validateDesign(copy),copy);
});

test('legacy length values snap to three visual extension settings',()=>{
  const source=createDefaultDesign().nails[0];
  assert.equal(normalizeNail({...source,length:.1}).length,0);
  assert.equal(normalizeNail({...source,length:.6}).length,.5);
  assert.equal(normalizeNail({...source,length:.9}).length,1);
});

test('layer validation rejects unknown effects, unsafe colours and accessors without calling them',()=>{
  for(const field of ['base','optical','particles','decoration','topCoat']){
    const design=createDefaultDesign();
    (design.nails[0] as any)[field]='constructor';
    assert.throws(()=>validateDesign(design),/设计文件无效/);
  }
  for(const field of ['patternColor','opticalColor','particleColor','decorationColor','topCoatColor']){
    const design=createDefaultDesign();
    (design.nails[0] as any)[field]='url(https://example.com)';
    assert.throws(()=>validateDesign(design),/颜色/);
  }
  let accessed=false;
  const accessor=createDefaultDesign();
  Object.defineProperty(accessor.nails[0],'optical',{get(){accessed=true;return 'catEye';},enumerable:true});
  assert.throws(()=>validateDesign(accessor),/普通数据字段/);
  assert.equal(accessed,false);
  const extra=createDefaultDesign();
  (extra.nails[0] as any).unknownLayer=true;
  assert.throws(()=>validateDesign(extra),/未知字段/);
});

test('technician sentence groups the actual starry accent fingers and describes all active layers',()=>{
  const style=STYLE_PRESETS.find(style=>style.id==='starry')!;
  const summary=buildTechnicianSummary({...createDefaultDesign(),nails:style.nails});
  assert.match(summary,/拇指、食指、无名指：方圆 · 短 · 实色夜空黑 · 银河银猫眼 · 银河银闪粉 · 亮面封层/);
  assert.match(summary,/中指、小指：方圆 · 短 · 冰透裸色 · 夜空黑四角星 · 亮面封层/);
  assert.equal(summary.split('；').length,2);
});

test('inactive layer colours do not split matching nails; distinct strokes do',()=>{
  const design=createDefaultDesign();
  design.nails=Array.from({length:5},()=>normalizeNail({color:'#d7b3a5',shape:'oval',length:0,finish:'gloss',pattern:'solid',strokes:[]}));
  design.nails[2].particleColor='#151b26';
  assert.match(buildTechnicianSummary(design),/^整手：/);
  design.nails[2].strokes.push({color:'#ffffff',width:.02,points:[{x:.1,y:.1}]});
  const summary=buildTechnicianSummary(design);
  assert.equal(summary.split('；').length,2);
  assert.match(summary,/中指：.*手绘 1 笔（按设计卡图案）/);
});
