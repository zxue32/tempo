// The landing page's 3D space (Three.js): a field of glitter that takes the shape of each trade's signature object,
// iridescent gems drifting at different depths, a lamp and a camera that follow the pointer, and formations that
// change as the page scrolls (the week calendar, a far field, a closing ring). Client only; loaded on demand.
import * as THREE from 'three'
import { formation, TRADE_COLORS, type Formation, type Trade } from './shapes'

export type Stage = 'hero' | 'calendar' | 'field' | 'ring'
/** The box on the page a formation should fill, in CSS pixels. `follow` boxes are in page coordinates and move with
    the scroll; the others are where the box sits in the window (the hero art at the top, the sticky calendar). */
export type Slot = { x: number; y: number; w: number; h: number; follow?: boolean }
export type Slots = Partial<Record<'hero' | 'calendar' | 'ring', Slot>>
export type SceneHandle = {
  setTrade(t: Trade): void
  setStage(s: Stage): void
  setSlots(s: Slots): void
  dispose(): void
}

const VS = `
attribute vec3 aFrom; attribute vec3 aTo; attribute vec4 aRnd;
uniform float uMix, uTime, uDrift, uSize, uPix, uColMix;
uniform vec3 uA0, uB0, uA1, uB1;
varying vec3 vCol; varying float vTw; varying float vSeed;
void main() {
  float e = clamp(uMix * 1.4 - aRnd.x * 0.4, 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  vec3 p = mix(aFrom, aTo, e);
  vec3 dir = normalize(p + vec3(0.001, 0.002, 0.003));
  p += dir * sin(e * 3.14159) * (0.5 + aRnd.y * 0.9);
  float t = uTime;
  p += uDrift * vec3(sin(t * 0.7 + aRnd.z * 31.0), cos(t * 0.55 + aRnd.w * 27.0), sin(t * 0.45 + aRnd.y * 23.0)) * (0.025 + 0.04 * aRnd.w);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.55 + 0.45 * sin(t * (1.2 + aRnd.w * 2.6) + aRnd.z * 40.0);
  gl_PointSize = uSize * (0.35 + aRnd.y * 1.1) * (0.7 + 0.5 * tw) * uPix / max(0.5, -mv.z);
  vec3 c0 = mix(uA0, uB0, aRnd.z), c1 = mix(uA1, uB1, aRnd.z);
  vCol = mix(c0, c1, smoothstep(aRnd.x * 0.5, aRnd.x * 0.5 + 0.5, uColMix));
  vTw = tw; vSeed = aRnd.w;
}`

const FS = `
precision mediump float;
uniform float uAlpha;
varying vec3 vCol; varying float vTw; varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float core = smoothstep(0.5, 0.0, d);
  float glint = step(0.86, vSeed);
  float star = (max(0.0, 1.0 - abs(c.x) * 16.0) * smoothstep(0.5, 0.05, abs(c.y)) + max(0.0, 1.0 - abs(c.y) * 16.0) * smoothstep(0.5, 0.05, abs(c.x))) * glint;
  float a = (core * core * 0.85 + star * 0.9 * vTw) * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol * (0.55 + 0.9 * vTw) + star * 0.4, a);
}`

// the glitter shader writes its colour straight to the screen, so it takes the sRGB values as they are
const col = (h: string) => new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace)

/** A dark studio for the gems to reflect: a near-black room with a few coloured light panels,
    so chrome reads as chrome (bright edges, deep body) instead of grey plastic. */
function studio(pmrem: THREE.PMREMGenerator) {
  const room = new THREE.Scene()
  const disposables: Array<{ dispose(): void }> = []
  const wall = new THREE.SphereGeometry(20, 32, 16), wallMat = new THREE.MeshBasicMaterial({ color: 0x2a2444, side: THREE.BackSide })
  room.add(new THREE.Mesh(wall, wallMat)); disposables.push(wall, wallMat)
  const panel = (hex: number, k: number, w: number, h: number, x: number, y: number, z: number) => {
    const g = new THREE.PlaneGeometry(w, h), m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); room.add(mesh); disposables.push(g, m)
  }
  panel(0xffffff, 6, 14, 3, 0, 9, 3)       // long soft strip overhead
  panel(0x8c9bff, 4, 7, 11, -9, 1, 1)       // cool blue from the left
  panel(0xff8fc8, 3.2, 7, 10, 9, -1, 2)     // rose from the right
  panel(0xe9cfa0, 2.6, 12, 3, 0, -8, 4)     // gold bounce from below
  panel(0xffffff, 3, 4, 4, 4, 3, 10)        // key in front, for the sparkle
  const tex = pmrem.fromScene(room, 0.03, 0.1, 100, { size: 128 }).texture   // small gems: a small reflection map is plenty
  disposables.forEach(d => d.dispose())
  return tex
}

/** Where the gems sit, as fractions of the visible frame at their depth: [x -1..1, y -1..1, z, size].
    They stay clear of the text column in every layout. */
type Anchor = [number, number, number, number]
const GEMS_AT: Record<'heroWide' | 'heroTall' | 'ringWide' | 'ringTall', Anchor[]> = {
  heroWide: [[0.28, 0.64, -3, 1.0], [0.92, 0.46, -4.5, 0.85], [0.93, -0.8, -1.8, 1.05], [0.32, -0.74, -5, 0.8], [0.66, 0.76, -6.5, 0.7], [0.99, -0.06, -7, 0.65], [0.26, -0.12, -8.5, 0.55]],
  heroTall: [[-0.82, 0.62, -3, 0.9], [0.84, 0.76, -4.5, 0.8], [0.8, 0.44, -2, 0.9], [-0.7, 0.36, -6, 0.65]],
  ringWide: [[-0.84, 0.55, -3, 1.0], [0.86, 0.6, -4.5, 0.85], [-0.72, -0.62, -2, 1.05], [0.8, -0.52, -5, 0.8], [-0.96, 0.02, -7, 0.65], [0.6, 0.84, -6.5, 0.7], [0.95, -0.9, -8.5, 0.55]],
  ringTall: [[-0.86, 0.72, -3, 0.8], [0.86, 0.56, -4.5, 0.7], [-0.82, -0.72, -2, 0.9], [0.84, -0.62, -5, 0.7]],
}

export function createScene(host: HTMLElement, opts: { trade: Trade; calm: boolean; small: boolean; onFail?: () => void; onReady?: () => void }): SceneHandle | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
  } catch {
    opts.onFail?.()
    return null
  }
  const dpr = Math.min(window.devicePixelRatio || 1, opts.small ? 1.5 : 1.75)
  renderer.setPixelRatio(dpr)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.set(0, 0, 12)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = studio(pmrem)
  scene.environment = env

  // ---------- glitter that becomes each trade's object
  const N = opts.small ? 3600 : 9000
  const geo = new THREE.BufferGeometry()
  const start = formation(opts.trade, N)
  const from = new THREE.BufferAttribute(start.slice(), 3), to = new THREE.BufferAttribute(start.slice(), 3)
  const rnd = new Float32Array(N * 4)
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random()
  geo.setAttribute('position', new THREE.BufferAttribute(start.slice(), 3))
  geo.setAttribute('aFrom', from); geo.setAttribute('aTo', to); geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20)
  const [a0, b0] = TRADE_COLORS[opts.trade]
  const uni = {
    uMix: { value: 1 }, uTime: { value: 0 }, uDrift: { value: opts.calm ? 0 : 1 }, uSize: { value: opts.small ? 30 : 34 }, uPix: { value: dpr },
    uAlpha: { value: 1 }, uColMix: { value: 1 }, uA0: { value: col(a0) }, uB0: { value: col(b0) }, uA1: { value: col(a0) }, uB1: { value: col(b0) },
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const points = new THREE.Points(geo, mat)
  const sculpt = new THREE.Group()
  sculpt.add(points)
  scene.add(sculpt)

  // ---------- chrome gems and pearls drifting at different depths
  const gems = new THREE.Group()
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xf4f0ff, metalness: 1, roughness: 0.2, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [240, 560], envMapIntensity: 1.8, flatShading: true, transparent: true })
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xeee4dc, roughness: 0.32, sheen: 1, sheenColor: new THREE.Color(0xffd9ec), iridescence: 0.7, iridescenceThicknessRange: [200, 480], envMapIntensity: 1.1, transparent: true })
  const cut = new THREE.LatheGeometry([new THREE.Vector2(0, -0.36), new THREE.Vector2(0.3, 0.02), new THREE.Vector2(0.22, 0.12), new THREE.Vector2(0, 0.12)], 8)
  const shapes: THREE.BufferGeometry[] = [cut, new THREE.OctahedronGeometry(0.3, 0), new THREE.SphereGeometry(0.2, 32, 16), new THREE.IcosahedronGeometry(0.26, 0), new THREE.TorusGeometry(0.21, 0.065, 16, 48), cut, new THREE.SphereGeometry(0.16, 32, 16)]
  const gemCount = opts.small ? 4 : 7
  const seed = (i: number) => { const x = Math.sin(i * 91.7) * 43758.5453; return x - Math.floor(x) }
  for (let i = 0; i < gemCount; i++) {
    const g = shapes[i % shapes.length]
    const m = new THREE.Mesh(g, g instanceof THREE.SphereGeometry ? pearl : chrome)
    m.rotation.set(seed(i + 1) * 6, seed(i + 2) * 6, 0)
    m.userData = { at: new THREE.Vector3(), size: 1, spin: 0.15 + seed(i + 11) * 0.45, bob: 0.4 + seed(i + 13) * 0.8, z: -4 }
    gems.add(m)
  }
  scene.add(gems)
  let gemFade = 1, gemFadeT = 1
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 5, 6); scene.add(key)
  scene.add(new THREE.AmbientLight(0xb8c0ff, 0.2))

  // ---------- state
  let trade = opts.trade, stage: Stage = 'hero', shown: Formation = opts.trade
  let mixT = 1, colT = 1, scrollY = 0
  const pointer = new THREE.Vector2(), pointerT = new THREE.Vector2()
  let layoutX = 0, layoutY = 0, layoutS = 1, placed = false, slots: Slots = {}
  const target = { x: 0, y: 0, s: 1 }

  function current(): Float32Array {   // where each particle is right now, so a new shape starts from there
    const out = new Float32Array(N * 3), f = from.array as Float32Array, t = to.array as Float32Array, rr = rnd
    for (let i = 0; i < N; i++) {
      let e = Math.min(1, Math.max(0, uni.uMix.value * 1.4 - rr[i * 4] * 0.4)); e = e * e * (3 - 2 * e)
      for (let k = 0; k < 3; k++) out[i * 3 + k] = f[i * 3 + k] + (t[i * 3 + k] - f[i * 3 + k]) * e
    }
    return out
  }
  function morph(kind: Formation) {
    if (kind === shown) return
    shown = kind
    ;(from.array as Float32Array).set(current()); from.needsUpdate = true
    ;(to.array as Float32Array).set(formation(kind, N)); to.needsUpdate = true
    uni.uMix.value = 0; mixT = 1
    if (opts.calm) uni.uMix.value = 1
    kick()
  }
  function recolor(t: Trade) {
    const [a, b] = TRADE_COLORS[t]
    uni.uA0.value.copy(blendNow(uni.uA0.value, uni.uA1.value)); uni.uB0.value.copy(blendNow(uni.uB0.value, uni.uB1.value))
    uni.uA1.value = col(a); uni.uB1.value = col(b); uni.uColMix.value = opts.calm ? 1 : 0; colT = 1
  }
  function blendNow(c0: THREE.Color, c1: THREE.Color) { return c0.clone().lerp(c1, uni.uColMix.value) }

  /** Where the formation goes: into the page box it belongs to when the page has told us one, else a sensible default. */
  function aim() {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z, halfW = halfH * camera.aspect
    const wide = w >= 768
    const sl = stage === 'hero' || stage === 'calendar' || stage === 'ring' ? slots[stage] : undefined
    if (sl && sl.w > 0 && sl.h > 0) {
      const top = sl.follow ? sl.y - scrollY : sl.y
      const ww = (sl.w / w) * 2 * halfW, hh = (sl.h / h) * 2 * halfH
      layoutX = ((sl.x + sl.w / 2) / w * 2 - 1) * halfW
      layoutY = (1 - (top + sl.h / 2) / h * 2) * halfH
      layoutS = stage === 'hero' ? Math.min(1.1, Math.min(ww, hh) / 4.4)          // the sculpture fills the art box
        : stage === 'calendar' ? Math.min(ww / 6.2, hh / 3.8) * 0.95               // the light grid sits right behind the glass calendar
        : Math.min((halfW * 0.95) / 2.6, Math.max(0.6, (ww * 0.8) / 5.2), 1)       // the ring circles the wordmark
    } else if (stage === 'hero') { layoutX = wide ? 0.45 * halfW : 0; layoutY = wide ? 0 : 1.6; layoutS = wide ? 1.05 : 0.62 }
    else if (stage === 'calendar') { layoutX = wide ? 0.4 * halfW : 0; layoutY = wide ? 0 : -0.95; layoutS = wide ? 0.9 : 0.5 }
    else if (stage === 'ring') { layoutX = 0; layoutY = wide ? 1.45 : 0.35; layoutS = wide ? 0.9 : 0.6 }
    else { layoutX = 0; layoutY = 0; layoutS = 1 }
    target.x = layoutX; target.y = layoutY; target.s = layoutS
  }

  function layout() {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const wide = w >= 768   // the page goes to two columns here
    aim()
    // the gems: on the free side of the hero, round the edges at the close, away while the calendar and tools are up
    const set = stage === 'ring' ? (wide ? GEMS_AT.ringWide : GEMS_AT.ringTall) : (wide ? GEMS_AT.heroWide : GEMS_AT.heroTall)
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    gems.children.forEach((m, i) => {
      const [fx, fy, z, size] = set[i % set.length], hh = half * (camera.position.z - z)
      const u = m.userData as { at: THREE.Vector3; size: number; z: number; perPx: number }
      u.at.set(fx * hh * camera.aspect, fy * hh, z); u.size = size; u.z = z; u.perPx = (2 * hh) / h
      if (opts.calm || !placed) { m.position.copy(u.at); m.scale.setScalar(size) }
    })
    placed = true
    gemFadeT = stage === 'hero' || stage === 'ring' ? 1 : 0
    if (opts.calm) gemFade = gemFadeT
    kick()
  }

  // ---------- loop
  let raf = 0, running = true, last = performance.now(), visible = true, ready = false
  const clock = { t: 0 }
  function frame(now: number) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    if (!opts.calm) clock.t += dt
    uni.uTime.value = clock.t
    if (uni.uMix.value < mixT) uni.uMix.value = Math.min(mixT, uni.uMix.value + dt / 1.6)
    if (uni.uColMix.value < colT) uni.uColMix.value = Math.min(colT, uni.uColMix.value + dt / 1.2)
    pointer.lerp(pointerT, 1 - Math.exp(-dt * 3))
    const ease = 1 - Math.exp(-dt * 2.4)
    sculpt.position.x += (target.x - sculpt.position.x) * ease
    sculpt.position.y += (target.y - sculpt.position.y) * ease
    const s = sculpt.scale.x + (target.s - sculpt.scale.x) * ease
    sculpt.scale.setScalar(s)
    const spin = stage === 'hero' && !opts.calm ? clock.t * 0.18 : 0
    sculpt.rotation.y = spin + pointer.x * 0.5
    sculpt.rotation.x = -pointer.y * 0.35 + (stage === 'calendar' ? 0.08 : 0)
    camera.position.x = pointer.x * 0.8; camera.position.y = pointer.y * 0.5
    camera.lookAt(0, 0, 0)
    gemFade += (gemFadeT - gemFade) * (1 - Math.exp(-dt * 3))
    chrome.opacity = pearl.opacity = gemFade
    gems.visible = gemFade > 0.01
    const lift = stage === 'hero' ? Math.min(scrollY, window.innerHeight) : 0   // the gems rise slower than the page: depth
    gems.children.forEach((m, i) => {
      const u = m.userData as { at: THREE.Vector3; size: number; spin: number; bob: number; z: number; perPx: number }
      const near = 1 - (u.z + 9) / 9 * 0.5            // nearer gems answer the pointer more
      const gx = u.at.x - pointer.x * (1.1 - near) * 0.55
      const gy = u.at.y + Math.sin(clock.t * u.bob + i * 1.7) * 0.18 + lift * u.perPx * 0.35
      m.position.x += (gx - m.position.x) * ease; m.position.y += (gy - m.position.y) * ease; m.position.z += (u.at.z - m.position.z) * ease
      m.scale.setScalar(m.scale.x + (u.size - m.scale.x) * ease)
      m.rotation.x += dt * u.spin; m.rotation.y += dt * u.spin * 1.3
    })
    key.position.set(-4 + pointer.x * 6, 5 + pointer.y * 3, 6)
    renderer.render(scene, camera)
    const busy = uni.uMix.value < mixT || uni.uColMix.value < colT || Math.abs(target.x - sculpt.position.x) > 0.002 || Math.abs(target.y - sculpt.position.y) > 0.002 || pointer.distanceTo(pointerT) > 0.001 || Math.abs(gemFadeT - gemFade) > 0.01
    if (running && visible && (!opts.calm || busy)) raf = requestAnimationFrame(frame)
  }
  function kick() { if (!raf && running && visible && ready) { last = performance.now(); raf = requestAnimationFrame(frame) } }

  const onPointer = (e: PointerEvent) => { if (opts.calm) return; pointerT.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1)); kick() }
  const onResize = () => layout()
  const onScroll = () => { scrollY = window.scrollY; if (stage === 'ring' || stage === 'hero') aim(); kick() }
  const onVis = () => { visible = document.visibilityState !== 'hidden'; if (visible) kick() }
  const onLost = (e: Event) => { e.preventDefault(); opts.onFail?.() }
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, { passive: true })
  scrollY = window.scrollY
  document.addEventListener('visibilitychange', onVis)
  renderer.domElement.addEventListener('webglcontextlost', onLost)
  layout()
  // compile the shaders off the main thread where the browser can, so the page stays responsive; the still image
  // stays up until the first real frame is ready
  renderer.compileAsync(scene, camera).catch(() => {}).then(() => {
    if (!running) return
    ready = true
    kick()
    opts.onReady?.()
  })

  return {
    setTrade(t) { if (t === trade) return; trade = t; recolor(t); if (stage === 'hero') morph(t); kick() },
    setStage(s) {
      if (s === stage) return
      stage = s
      morph(s === 'hero' ? trade : s)
      uni.uAlpha.value = s === 'field' ? 0.55 : s === 'calendar' ? 0.62 : 1
      layout()
    },
    setSlots(next) { slots = next; aim(); kick() },
    dispose() {
      running = false; if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVis)
      geo.dispose(); mat.dispose(); chrome.dispose(); pearl.dispose(); new Set(shapes).forEach(s => s.dispose()); env.dispose(); pmrem.dispose()
      renderer.dispose(); renderer.domElement.remove()
    },
  }
}
