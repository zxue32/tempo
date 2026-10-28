import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDesign, createDefaultDesign, DESIGN_LIMITS, validateDesign } from '../src/state';
import type { StudioDesign } from '../src/types';

function stroke() { return { color: '#ffffff', width: 0.02, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }; }
function rejects(change: (design: StudioDesign) => void, expected?: RegExp) {
  const design = createDefaultDesign();
  change(design);
  assert.throws(() => validateDesign(design), expected ?? /设计文件无效/);
}

test('default has five independent nails and survives a JSON round trip', () => {
  const design = createDefaultDesign();
  assert.deepEqual(validateDesign(JSON.parse(JSON.stringify(design))), design);
  design.nails[0].strokes.push(stroke());
  assert.equal(design.nails[1].strokes.length, 0);
});

test('validation copies nested input, normalizes hex, and accepts UV boundary points', () => {
  const design = createDefaultDesign();
  design.nails[0].color = '#ABCDEF';
  design.nails[0].strokes.push(stroke());
  const copy = validateDesign(design);
  assert.equal(copy.nails[0].color, '#abcdef');
  copy.nails[0].strokes[0].points[0].x = 0.5;
  assert.equal(design.nails[0].strokes[0].points[0].x, 0);
});

test('undo clone preserves values and isolates deeply nested paint data', () => {
  const design = createDefaultDesign();
  design.nails[2].strokes.push(stroke());
  const copy = cloneDesign(design);
  assert.deepEqual(copy, design);
  copy.nails[2].strokes[0].points[0].x = 0.25;
  copy.nails[1].color = '#000000';
  assert.equal(design.nails[2].strokes[0].points[0].x, 0);
  assert.notEqual(design.nails[1].color, copy.nails[1].color);
});

test('reject unsupported schema, missing nails, unknown choices, and unsafe colors', () => {
  rejects(d => { (d as any).schemaVersion = 2; });
  rejects(d => { d.nails.pop(); });
  rejects(d => { d.nails.push(d.nails[0]); });
  rejects(d => { (d.nails[0] as any).shape = 'constructor'; });
  rejects(d => { (d.nails[0] as any).finish = 'glass'; });
  rejects(d => { (d.nails[0] as any).pattern = 'toString'; });
  for (const color of ['red', '#fff', '#ffffff00', 'url(https://example.com)', '<script>', '#zzzzzz']) {
    rejects(d => { d.nails[0].color = color; });
    rejects(d => { d.skinTone = color; });
  }
});

test('reject non-finite and out-of-range lengths, brushes, and coordinates', () => {
  for (const value of [NaN, Infinity, -Infinity, -0.01, 1.01, '0.5']) {
    rejects(d => { (d.nails[0] as any).length = value; });
    rejects(d => { d.nails[0].strokes.push(stroke()); (d.nails[0].strokes[0].points[0] as any).x = value; });
  }
  for (const width of [NaN, Infinity, 0, -1, 0.201]) {
    rejects(d => { d.nails[0].strokes.push({ ...stroke(), width }); });
  }
});

test('reject missing, overlong, control-character names and invalid calendar dates', () => {
  for (const name of ['', '  ', 'x'.repeat(81), 'hello\u0000world', 'line\nline']) rejects(d => { d.name = name; });
  for (const timestamp of ['now', '', '2025-02-30T00:00:00.000Z', '2025-01-01', '2025-01-01T00:00:00+00:00']) {
    rejects(d => { d.updatedAt = timestamp; });
  }
});

test('reject excessive strokes and points before returning a design', () => {
  rejects(d => { d.nails[0].strokes = Array.from({ length: DESIGN_LIMITS.strokesPerNail + 1 }, stroke); });
  rejects(d => {
    d.nails[0].strokes = [{ ...stroke(), points: Array.from({ length: DESIGN_LIMITS.pointsPerStroke + 1 }, () => ({ x: 0, y: 0 })) }];
  });
  rejects(d => { d.nails[0].strokes = [{ ...stroke(), points: [] }]; });
  rejects(d => {
    d.nails[0].strokes = Array.from({ length: 50 }, () => ({
      ...stroke(), points: Array.from({ length: 2048 }, () => ({ x: 0.5, y: 0.5 })),
    }));
  }, /总路径点数/);
});

test('reject prototype keys, inherited objects, symbols, and accessor fields without invoking getters', () => {
  const base = createDefaultDesign();
  const polluted = JSON.parse(JSON.stringify(base).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{"polluted":true}'));
  assert.throws(() => validateDesign(polluted), /未知字段/);
  assert.equal(({} as any).polluted, undefined);
  assert.throws(() => validateDesign(Object.assign(Object.create({ inherited: true }), base)), /对象类型/);
  const symbolic = { ...base, [Symbol('unknown')]: true };
  assert.throws(() => validateDesign(symbolic), /未知字段/);
  let invoked = false;
  const accessor = { ...base };
  Object.defineProperty(accessor, 'name', { get() { invoked = true; return 'test'; }, enumerable: true });
  assert.throws(() => validateDesign(accessor), /普通数据字段/);
  assert.equal(invoked, false);
});

test('reject sparse arrays and array accessors without executing them', () => {
  rejects(d => { delete d.nails[2]; });
  const d = createDefaultDesign();
  let invoked = false;
  Object.defineProperty(d.nails, '0', { get() { invoked = true; return {}; } });
  assert.throws(() => validateDesign(d), /连续的数据数组/);
  assert.equal(invoked, false);
});

// Regression: 3D picking used to serialize nailIndex/pointer fields into strokes.
test('a picked 3D point remains importable after discarding raycast metadata', async () => {
  const {copyUVPoint}=await import('../src/state');
  const design=createDefaultDesign();
  const hit={index:2,pointer:19,x:.35,y:.7};
  design.nails[2].strokes=[{color:'#fff7e9',width:.025,points:[copyUVPoint(hit)]}];
  const restored=validateDesign(JSON.parse(JSON.stringify(design)));
  assert.deepEqual(restored.nails[2].strokes[0].points,[{x:.35,y:.7}]);
});
