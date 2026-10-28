import type { NailDesign, NailFinish, NailPattern, NailShape, NailBase, NailOptical, NailParticles, NailDecoration, NailTopCoat, NormalizedNailDesign, Stroke, StudioDesign } from './types';

export const SHAPES: ReadonlyArray<{ value: NailShape; label: string }> = [
  { value: 'almond', label: '杏仁' }, { value: 'oval', label: '椭圆' },
  { value: 'square', label: '方形' }, { value: 'squoval', label: '方圆' }, { value: 'coffin', label: '芭蕾' },
  { value: 'stiletto', label: '尖形' },
];
export const FINISHES: ReadonlyArray<{ value: NailFinish; label: string }> = [
  { value: 'gloss', label: '亮面' }, { value: 'matte', label: '哑光' },
  { value: 'pearl', label: '珠光' }, { value: 'chrome', label: '金属' },
];
export const PATTERNS: ReadonlyArray<{ value: NailPattern; label: string }> = [
  { value: 'solid', label: '纯色' }, { value: 'french', label: '法式' },
  { value: 'ombre', label: '渐变' }, { value: 'bloom', label: '晕染' },
];
export const BASES: ReadonlyArray<{value:NailBase;label:string}> = [
  {value:'jelly',label:'冰透'},{value:'milky',label:'奶白'},{value:'solid',label:'实色'},
];
export const OPTICALS: ReadonlyArray<{value:NailOptical;label:string}> = [
  {value:'none',label:'无'},{value:'catEye',label:'猫眼'},{value:'mirror',label:'镜面'},{value:'aurora',label:'极光'},
];
export const PARTICLES: ReadonlyArray<{value:NailParticles;label:string}> = [
  {value:'none',label:'无'},{value:'shimmer',label:'细闪'},{value:'glitter',label:'闪粉'},{value:'foil',label:'金箔'},{value:'shell',label:'贝壳片'},
];
export const DECORATIONS: ReadonlyArray<{value:NailDecoration;label:string}> = [
  {value:'none',label:'无'},{value:'star',label:'四角星'},{value:'line',label:'金属线'},{value:'rhinestone',label:'水钻'},{value:'pearl',label:'珍珠'},
];
export const TOP_COATS: ReadonlyArray<{value:NailTopCoat;label:string}> = [
  {value:'gloss',label:'亮面'},{value:'matte',label:'磨砂'},
];
export const LENGTHS = [{value:0,label:'短'},{value:.5,label:'中长'},{value:1,label:'长需延长'}] as const;
export const normalizeLength = (length:number):number => length < .25 ? 0 : length < .75 ? .5 : 1;
export const getLengthLabel = (length:number):string => LENGTHS.find(item=>item.value===normalizeLength(length))!.label;

/** Internal typed-data normalizer. Untrusted input must pass validateDesign first. */
export function normalizeNail(nail:NailDesign):NormalizedNailDesign {
  return {...nail,
    length:normalizeLength(nail.length),
    base:nail.base??'solid',patternColor:nail.patternColor??'#f1e8db',
    optical:nail.optical??(nail.finish==='chrome'?'mirror':nail.finish==='pearl'?'aurora':'none'),
    opticalColor:nail.opticalColor??(nail.finish==='chrome'?nail.color:'#b7c6d2'),
    particles:nail.particles??'none',particleColor:nail.particleColor??'#c9a767',
    decoration:nail.decoration??'none',decorationColor:nail.decorationColor??'#e8dfcc',
    topCoat:nail.topCoat??(nail.finish==='matte'?'matte':'gloss'),topCoatColor:nail.topCoatColor??'#ffffff',
    strokes:nail.strokes.map(stroke=>({...stroke,points:stroke.points.map(point=>({...point}))})),
  };
}
export const FINGER_NAMES = ['拇指', '食指', '中指', '无名指', '小指'] as const;

/** Enforced on every imported design; the host should also cap file size before parsing. */
export const DESIGN_LIMITS = Object.freeze({
  name: 80,
  strokesPerNail: 200,
  pointsPerStroke: 2048,
  totalPoints: 100_000,
  minBrushWidth: 0.001,
  maxBrushWidth: 0.2,
  fileBytes: 5 * 1024 * 1024,
});

export function createDefaultDesign(): StudioDesign {
  return {
    schemaVersion: 1,
    name: '月光猫眼',
    skinTone: '#c98f73',
    updatedAt: new Date().toISOString(),
    nails: Array.from({ length: 5 }, () => normalizeNail({
      color:'#29364f',shape:'almond',length:.5,finish:'gloss',pattern:'solid',strokes:[],
      base:'jelly',optical:'catEye',opticalColor:'#b7c6d2',particles:'shimmer',particleColor:'#b7c6d2',
    })),
  };
}

function fail(message: string): never { throw new Error(`设计文件无效：${message}`); }

/** Only copy known, plain, own data fields. Never merge an imported object into app state. */
function record(input: unknown, fields: readonly string[], label: string, optional:readonly string[]=[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(`${label}应为对象`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label}包含不支持的对象类型`);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  if (fields.some(field=>!Object.hasOwn(descriptors,field)) || keys.some(key => typeof key !== 'string' || (!fields.includes(key)&&!optional.includes(key)))) {
    fail(`${label}字段缺失或包含未知字段`);
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const field of [...fields,...optional]) {
    const descriptor = descriptors[field];
    if(!descriptor&&optional.includes(field))continue;
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(`${label}必须使用普通数据字段`);
    result[field] = descriptor.value;
  }
  return result;
}

function array(input: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(input) || input.length > max) fail(`${label}数量超过限制或格式错误`);
  // Sparse arrays and accessor elements are not JSON data; reject them without executing getters.
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(`${label}必须是连续的数据数组`);
  }
  return input;
}

function hex(input: unknown, label: string): string {
  if (typeof input !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input)) fail(`${label}应为六位十六进制颜色`);
  return input.toLowerCase();
}

function number(input: unknown, min: number, max: number, label: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) {
    fail(`${label}必须在 ${min}–${max} 之间`);
  }
  return input;
}

function choice<T extends string>(input: unknown, choices: ReadonlyArray<{value: T}>, label: string): T {
  if (typeof input !== 'string' || !choices.some(choice => choice.value === input)) fail(`${label}不受支持`);
  return input as T;
}

/** Validate and return a detached, sanitized copy. Throws a user-readable Chinese error. */
export function validateDesign(input: unknown): StudioDesign {
  const source = record(input, ['schemaVersion', 'skinTone', 'nails', 'name', 'updatedAt'], '设计');
  if (source.schemaVersion !== 1) fail('不支持此版本，请使用 schemaVersion 1');
  if (typeof source.name !== 'string' || source.name.trim().length === 0 || source.name.length > DESIGN_LIMITS.name) {
    fail(`作品名称需为 1–${DESIGN_LIMITS.name} 个字符`);
  }
  if (/[\u0000-\u001f\u007f]/.test(source.name)) fail('作品名称不能包含控制字符');
  if (typeof source.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(source.updatedAt)) {
    fail('更新时间需为 ISO UTC 时间');
  }
  const parsedDate = new Date(source.updatedAt);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString() !== source.updatedAt) fail('更新时间不存在');
  const nailInputs = array(source.nails, 5, '指甲');
  if (nailInputs.length !== 5) fail('必须包含按拇指至小指排列的五枚指甲');
  let pointCount = 0;
  const nails: NailDesign[] = nailInputs.map((input, index) => {
    const label = FINGER_NAMES[index];
    const nail = record(input, ['color', 'shape', 'length', 'finish', 'pattern', 'strokes'], label, ['base','patternColor','optical','opticalColor','particles','particleColor','decoration','decorationColor','topCoat','topCoatColor']);
    const strokes: Stroke[] = array(nail.strokes, DESIGN_LIMITS.strokesPerNail, `${label}笔画`).map((input, strokeIndex) => {
      const strokeLabel = `${label}第 ${strokeIndex + 1} 笔`;
      const stroke = record(input, ['color', 'width', 'points'], strokeLabel);
      const points = array(stroke.points, DESIGN_LIMITS.pointsPerStroke, `${strokeLabel}路径`);
      if (!points.length) fail(`${strokeLabel}至少需要一个点`);
      pointCount += points.length;
      if (pointCount > DESIGN_LIMITS.totalPoints) fail(`总路径点数不能超过 ${DESIGN_LIMITS.totalPoints}`);
      return {
        color: hex(stroke.color, `${strokeLabel}颜色`),
        width: number(stroke.width, DESIGN_LIMITS.minBrushWidth, DESIGN_LIMITS.maxBrushWidth, `${strokeLabel}笔宽`),
        points: points.map(input => {
          const point = record(input, ['x', 'y'], `${strokeLabel}坐标`);
          return { x: number(point.x, 0, 1, '横坐标'), y: number(point.y, 0, 1, '纵坐标') };
        }),
      };
    });
    return normalizeNail({
      color: hex(nail.color, `${label}颜色`),
      shape: choice(nail.shape, SHAPES, '甲型'),
      length: number(nail.length, 0, 1, '长度'),
      finish: choice(nail.finish, FINISHES, '材质'),
      pattern: choice(nail.pattern, PATTERNS, '款式'),
      strokes,
      ...(Object.hasOwn(nail,'base')?{base:choice(nail.base,BASES,'底色质地')}:{}),
      ...(Object.hasOwn(nail,'patternColor')?{patternColor:hex(nail.patternColor,'图案颜色')}:{}),
      ...(Object.hasOwn(nail,'optical')?{optical:choice(nail.optical,OPTICALS,'光泽')}:{}),
      ...(Object.hasOwn(nail,'opticalColor')?{opticalColor:hex(nail.opticalColor,'光泽颜色')}:{}),
      ...(Object.hasOwn(nail,'particles')?{particles:choice(nail.particles,PARTICLES,'颗粒')}:{}),
      ...(Object.hasOwn(nail,'particleColor')?{particleColor:hex(nail.particleColor,'颗粒颜色')}:{}),
      ...(Object.hasOwn(nail,'decoration')?{decoration:choice(nail.decoration,DECORATIONS,'装饰')}:{}),
      ...(Object.hasOwn(nail,'decorationColor')?{decorationColor:hex(nail.decorationColor,'装饰颜色')}:{}),
      ...(Object.hasOwn(nail,'topCoat')?{topCoat:choice(nail.topCoat,TOP_COATS,'封层')}:{}),
      ...(Object.hasOwn(nail,'topCoatColor')?{topCoatColor:hex(nail.topCoatColor,'封层颜色')}:{}),
    });
  });
  return {
    schemaVersion: 1,
    skinTone: hex(source.skinTone, '肤色'),
    nails,
    name: source.name.trim(),
    updatedAt: source.updatedAt,
  };
}

/** Internal clone for undo snapshots; validateDesign is the entry point for untrusted data. */
export function cloneDesign(design: StudioDesign): StudioDesign {
  return {
    ...design,
    nails: design.nails.map(nail => ({
      ...nail,
      strokes: nail.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point })) })),
    })),
  };
}

/** Ray hits may carry nail IDs and pointer metadata; portable strokes contain UV only. */
export function copyUVPoint(point: {x:number;y:number}): {x:number;y:number} {
  return {x:point.x,y:point.y};
}
