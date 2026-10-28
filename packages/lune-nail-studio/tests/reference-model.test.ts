import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createReferenceModel } from '../src/reference-model';

const model = createReferenceModel();
const meshes: THREE.Mesh[] = [];
model.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });

test('five independently addressable nail meshes preserve thumb-to-pinky IDs', () => {
  const expected = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  expected.forEach((finger, i) => {
    const nail = meshes.find(mesh => mesh.name === `nail_${finger}`);
    assert.ok(nail, `missing nail_${finger}`);
    assert.equal(nail.userData.nailIndex, i);
    const uv = nail.geometry.getAttribute('uv');
    assert.ok(uv && uv.count > 20);
    assert.equal(uv.count, nail.geometry.getAttribute('position').count);
    for (const value of uv.array) assert.ok(value >= -1e-5 && value <= 1.00001);
  });
});

test('all model geometry positions and normals are finite with meaningful 3D volume', () => {
  assert.ok(meshes.length >= 6);
  meshes.forEach(mesh => {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    assert.ok(positions?.count > 2, mesh.name);
    assert.ok(normals && normals.count === positions.count, mesh.name);
    for (const value of positions.array) assert.ok(Number.isFinite(value), mesh.name);
    for (const value of normals.array) assert.ok(Number.isFinite(value), mesh.name);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0, `${mesh.name}: flat/empty geometry`);
    if (geometry.index) for (const value of geometry.index.array) assert.ok(value >= 0 && value < positions.count);
  });
});

test('photo approximation metadata and editable material separation remain available', () => {
  assert.equal(model.userData.approximateFromSinglePhoto, true);
  assert.equal(model.userData.measuredUnits, false);
  const nails = meshes.filter(mesh => mesh.name.startsWith('nail_'));
  assert.equal(nails.length, 5);
  assert.equal(new Set(nails.map(mesh => mesh.material)).size, 5);
});

test('geometry stays within the interactive web preview polygon budget', () => {
  const total = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
  assert.ok(total < 90_000, `web-preview budget exceeded: ${total}`);
  const skin = meshes.find(mesh => mesh.name === 'hand_skin');
  assert.ok(skin);
  const bounds = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  assert.ok(bounds.z > .2 && bounds.y > bounds.x, 'expected a complete volumetric portrait hand');
});
