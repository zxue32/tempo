import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import type { NailDesign } from './types';
import { nailWidthAt } from './nail-profile';

export interface FingerFrame { x: number; y: number; z: number; rotation: number; width: number; bed: number; }
// The camera sees the dorsal surface. Index order is thumb → little finger.
export const FINGER_FRAMES: FingerFrame[] = [
  { x: -1.83, y: .44, z: .130, rotation: .67, width: .51, bed: .67 },
  { x: -.75, y: 2.40, z: .117, rotation: .055, width: .435, bed: .66 },
  { x: -.13, y: 2.79, z: .120, rotation: .012, width: .445, bed: .70 },
  { x: .49, y: 2.54, z: .112, rotation: -.055, width: .415, bed: .67 },
  { x: 1.03, y: 1.94, z: .094, rotation: -.12, width: .355, bed: .56 },
];

const smoothMin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * .25;
};
function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k0 * (k0 - 1) / Math.max(k1, .00001);
}
interface Segment { ax: number; ay: number; az: number; bx: number; by: number; bz: number; ra: number; rb: number; }
const segments: Segment[] = [];
function segment(ax:number, ay:number, az:number, bx:number, by:number, bz:number, ra:number, rb:number) {
  segments.push({ax,ay,az,bx,by,bz,ra,rb});
}
// Three phalanges taper gently; slight irregularities keep the silhouette organic.
for (let i = 1; i < 5; i++) {
  const f = FINGER_FRAMES[i];
  const baseX = [-.68, -.13, .44, .87][i - 1];
  const baseY = [.25, .39, .30, .04][i - 1];
  const tipX = f.x - Math.sin(f.rotation) * .11;
  const tipY = f.y + Math.cos(f.rotation) * .11;
  const r = f.width * .58;
  const midX = baseX * .45 + tipX * .55;
  const midY = baseY * .45 + tipY * .55;
  segment(baseX, baseY, -.025, midX, midY, .035, r * 1.14, r);
  segment(midX, midY, .035, tipX, tipY, .032, r, r * .89);
}
segment(-.72, -1.10, -.04, -1.39, -.32, -.005, .40, .31);
segment(-1.39, -.32, -.005, -1.91, .54, .015, .31, .275);

function handDistance(x: number, y: number, z: number) {
  let d = ellipsoid(x + .02, y + .67, z + .025, 1.13, 1.48, .365);
  d = smoothMin(d, ellipsoid(x -.025, y + 2.15, z + .045, .665, 1.45, .305), .25);
  // Thenar eminence and the little-finger side make a less symmetrical palm.
  d = smoothMin(d, ellipsoid(x + .72, y + .73, z + .035, .52, .88, .34), .16);
  for (const s of segments) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, dz = (s.bz - s.az) / .76;
    const px = x - s.ax, py = y - s.ay, pz = (z - s.az) / .76;
    const t = THREE.MathUtils.clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
    const r = s.ra + (s.rb - s.ra) * t;
    const sd = (Math.hypot(px - t * dx, py - t * dy, pz - t * dz) - r) * .84;
    d = smoothMin(d, sd, .115);
  }
  return d;
}

/** Single watertight implicit skin: no intersecting cylinder joints or seams. */
export function createHandGeometry(): THREE.BufferGeometry {
  const n = 88;
  const temporaryMaterial = new THREE.MeshBasicMaterial();
  const marching = new MarchingCubes(n, temporaryMaterial, false, false, 80000);
  marching.isolation = 0;
  const sx = 2.8, sy = 3.8, sz = .85;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    marching.field[x + y * n + z * n * n] = -handDistance((x / n * 2 - 1) * sx, (y / n * 2 - 1) * sy, (z / n * 2 - 1) * sz);
  }
  marching.update();
  const count = marching.geometry.drawRange.count;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(marching.geometry.attributes.position.array.slice(0, count * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(marching.geometry.attributes.normal.array.slice(0, count * 3), 3));
  g.scale(sx, sy, sz);
  g.computeBoundingSphere();
  marching.geometry.dispose();
  temporaryMaterial.dispose();
  return g;
}

/** Curved nail plate with a C-curve, a gentle apex and a thin sealed free edge. */
export function createNailGeometry(nail: NailDesign, finger: FingerFrame): THREE.BufferGeometry {
  const rows = 64, cols = 32;
  const width = finger.width;
  const length = finger.bed + .55 * nail.length;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    const w = nailWidthAt(v, nail.shape);
    for (let col = 0; col <= cols; col++) {
      const u = col / cols, s = u * 2 - 1;
      const x = s * width * .5 * w;
      const z = .025 + .075 * (1 - s * s * w * w) + .028 * Math.sin(v * Math.PI);
      positions.push(x, v * length - finger.bed + .12, z);
      // Full rectangular artwork is fitted to the nail silhouette, same convention as the 2D pad.
      uvs.push(x / width + .5, v);
      if (row < rows && col < cols) {
        const a = row * (cols + 1) + col, b = a + cols + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // Duplicate the surface for a closed underside and connect the entire perimeter.
  const perimeter: number[] = [];
  for (let c = 0; c <= cols; c++) perimeter.push(c);
  for (let r = 1; r <= rows; r++) perimeter.push(r * (cols + 1) + cols);
  for (let c = cols - 1; c >= 0; c--) perimeter.push(rows * (cols + 1) + c);
  for (let r = rows - 1; r > 0; r--) perimeter.push(r * (cols + 1));
  const bottomOffset = positions.length / 3;
  const topIndexCount = indices.length;
  for (let p = 0; p < bottomOffset; p++) {
    positions.push(positions[p * 3], positions[p * 3 + 1], positions[p * 3 + 2] - .018);
    uvs.push(uvs[p * 2], uvs[p * 2 + 1]);
  }
  for (let i = 0; i < topIndexCount; i += 3) {
    indices.push(indices[i] + bottomOffset, indices[i + 2] + bottomOffset, indices[i + 1] + bottomOffset);
  }
  for (let k = 0; k < perimeter.length; k++) {
    const a = perimeter[k], b = perimeter[(k + 1) % perimeter.length];
    indices.push(a, bottomOffset + a, b, b, bottomOffset + a, bottomOffset + b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

export function makeCuticle(f: FingerFrame, material: THREE.Material): THREE.Mesh {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI + i / 32 * Math.PI;
    points.push(new THREE.Vector3(Math.cos(a) * f.width * .505, -f.bed + .12 + .12 + Math.sin(a) * .12, .056 + .046 * Math.abs(Math.sin(a))));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, .014, 6, false), material);
}

export function makeSkinDetail(material: THREE.LineBasicMaterial): THREE.Group {
  const group = new THREE.Group();
  for (let i = 1; i < 5; i++) {
    const f = FINGER_FRAMES[i];
    for (const shift of [.77, 1.40]) {
      if (i === 4 && shift > 1) continue;
      const y = f.y - shift;
      for (const offset of [0, -.055]) {
        const points: THREE.Vector3[] = [];
        for (let j = 0; j <= 20; j++) {
          const t = j / 20 * 2 - 1;
          points.push(new THREE.Vector3(f.x + t * f.width * .36, y + offset + .025 * (1 - t * t), .035 + f.width * .58 * .76 * Math.sqrt(1 - (t * .65) ** 2) + .003));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
      }
    }
  }
  return group;
}
