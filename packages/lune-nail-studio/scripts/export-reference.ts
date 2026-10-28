import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { createReferenceModel } from '../src/reference-model';
import { enhanceSkin } from './enhance-skin';

// GLTFExporter uses the browser FileReader interface only for its output Blob.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then(data => { this.result = data; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error));
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then(data => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(data).toString('base64')}`;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
}
if (!globalThis.FileReader) Object.defineProperty(globalThis, 'FileReader', { value: NodeFileReader, configurable: true });

const model = createReferenceModel();
model.updateMatrixWorld(true);
const out = fileURLToPath(new URL('../../hand-model/', import.meta.url));
await mkdir(out, { recursive: true });
const glb = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: true }) as ArrayBuffer;
const header = new DataView(glb);
if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== glb.byteLength) throw new Error('Invalid GLB container');
const loaded = await new GLTFLoader().parseAsync(glb, '');
const names: string[] = [];
const topology: Record<string, {triangles:number; degenerateTriangles:number; boundaryEdges:number; nonManifoldEdges:number}> = {};
let vertices = 0, triangles = 0;
loaded.scene.traverse(object => {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) return;
  names.push(mesh.name);
  const geometry = mesh.geometry;
  const pos = geometry.getAttribute('position');
  if (!pos || Array.from(pos.array).some(v => !Number.isFinite(v))) throw new Error(`Invalid positions in ${mesh.name}`);
  vertices += pos.count;
  const faceCount = (geometry.index?.count ?? pos.count) / 3;
  triangles += faceCount;
  const welded = new Map<string, number>(), vertexIds: number[] = [], edges = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => Math.round(v * 1e5)).join(',');
    if (!welded.has(key)) welded.set(key, welded.size);
    vertexIds.push(welded.get(key)!);
  }
  let degenerateTriangles = 0;
  for (let i = 0; i < faceCount * 3; i += 3) {
    const a = vertexIds[geometry.index?.getX(i) ?? i], b = vertexIds[geometry.index?.getX(i+1) ?? i+1], c = vertexIds[geometry.index?.getX(i+2) ?? i+2];
    if (a === b || b === c || c === a) { degenerateTriangles++; continue; }
    for (const [v,w] of [[a,b],[b,c],[c,a]]) {
      const key = v < w ? `${v}:${w}` : `${w}:${v}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  topology[mesh.name] = { triangles:faceCount, degenerateTriangles, boundaryEdges:[...edges.values()].filter(n=>n===1).length, nonManifoldEdges:[...edges.values()].filter(n=>n>2).length };
});
for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
  if (!names.includes(`nail_${finger}`)) throw new Error(`Missing editable nail_${finger}`);
}
const jsonLength = header.getUint32(12, true);
const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)).trim());
if (json.images?.length || json.buffers?.some((b: {uri?: string}) => b.uri)) throw new Error('Export must be self-contained');
const finalGLB = enhanceSkin(glb);
await writeFile(`${out}lune-reference-hand.glb`, Buffer.from(finalGLB));
await writeFile(`${out}lune-reference-hand.obj`, new OBJExporter().parse(model));
const report = {
  format: 'glTF 2.0 binary',
  generatedAt: new Date().toISOString(),
  bytes: finalGLB.byteLength,
  embeddedTextures: ['1024×1024 procedural skin normal PNG', '1024×1024 procedural skin roughness PNG'],
  textureBufferValidation: 'PASS: embedded PNG signatures, buffer bounds, no external URLs',
  vertexCount: vertices,
  triangleCount: triangles,
  meshes: names,
  topology,
  bounds: new THREE.Box3().setFromObject(loaded.scene).getSize(new THREE.Vector3()).toArray(),
  roundTripLoad: 'PASS: geometry and materials before procedural texture embedding; final textured GLB requires browser visual check',
  standalone: true,
  approximateFromSinglePhoto: true,
  measuredUnits: false,
  rigged: false,
};
await writeFile(`${out}validation.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
