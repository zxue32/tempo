// Starter service menus by industry. Owners edit names, times and prices after onboarding.
export type Industry = 'nail' | 'barber' | 'both'

export const CATEGORIES: Record<Industry, string[]> = {
  nail: ['hand', 'ext', 'foot', 'other'],
  barber: ['hair', 'beard', 'other'],
  both: ['hand', 'ext', 'foot', 'hair', 'beard', 'other'],
}

export type TemplateService = {
  key: string
  kind: 'service' | 'addon'
  category: string
  appliesTo?: string[]
  name: string
  nameZh: string
  descEn?: string
  descZh?: string
  min: number
  price: number
}

const NAIL: TemplateService[] = [
  { key: 'n1', kind: 'service', category: 'hand', name: 'Classic Manicure', nameZh: '经典修手', descEn: 'Shape, cuticle care, regular polish', descZh: '修型、护理死皮、普通甲油', min: 30, price: 25 },
  { key: 'n2', kind: 'service', category: 'hand', name: 'Gel Manicure', nameZh: '凝胶美甲', descEn: 'Long-wear gel colour', descZh: '持久凝胶色', min: 45, price: 40 },
  { key: 'n3', kind: 'service', category: 'hand', name: 'Builder Gel (BIAB)', nameZh: '加固美甲 BIAB', descEn: 'Strengthening overlay on natural nails', descZh: '真甲加固', min: 60, price: 55 },
  { key: 'n4', kind: 'service', category: 'ext', name: 'Gel-X Extensions', nameZh: 'Gel-X 延长甲', descEn: 'Full set, any shape', descZh: '延长全套，任意甲型', min: 90, price: 75 },
  { key: 'n5', kind: 'service', category: 'ext', name: 'Acrylic Full Set', nameZh: '水晶甲全套', descEn: 'Classic acrylic extensions', descZh: '经典水晶延长', min: 75, price: 60 },
  { key: 'n6', kind: 'service', category: 'ext', name: 'Fill / Rebalance', nameZh: '补甲', descEn: 'Maintain your extensions', descZh: '延长甲补长', min: 60, price: 45 },
  { key: 'n7', kind: 'service', category: 'foot', name: 'Classic Pedicure', nameZh: '经典修脚', descEn: 'Soak, scrub, shape, polish', descZh: '泡脚、去角质、修型、甲油', min: 45, price: 35 },
  { key: 'n8', kind: 'service', category: 'foot', name: 'Gel Pedicure', nameZh: '凝胶足部', descEn: 'Classic pedicure with gel colour', descZh: '修脚 + 凝胶色', min: 60, price: 50 },
  { key: 'n9', kind: 'service', category: 'foot', name: 'Spa Pedicure', nameZh: '足部 SPA', descEn: 'Mask, hot towels, longer massage', descZh: '足膜、热毛巾、加长按摩', min: 75, price: 65 },
  { key: 'na1', kind: 'addon', category: 'addon', appliesTo: ['hand', 'ext', 'foot'], name: 'Gel Removal', nameZh: '卸甲', min: 15, price: 10 },
  { key: 'na2', kind: 'addon', category: 'addon', appliesTo: ['hand', 'ext'], name: 'Nail Art', nameZh: '彩绘', descEn: 'Simple designs', descZh: '简约图案', min: 15, price: 15 },
  { key: 'na3', kind: 'addon', category: 'addon', appliesTo: ['hand', 'ext', 'foot'], name: 'Chrome / Cat-eye', nameZh: '魔镜粉 / 猫眼', min: 10, price: 10 },
  { key: 'na4', kind: 'addon', category: 'addon', appliesTo: ['hand', 'ext', 'foot'], name: 'French Tips', nameZh: '法式边', min: 10, price: 8 },
  { key: 'na5', kind: 'addon', category: 'addon', appliesTo: ['hand', 'ext'], name: 'Rhinestones', nameZh: '钻饰', min: 15, price: 12 },
]

const BARBER: TemplateService[] = [
  { key: 'b1', kind: 'service', category: 'hair', name: 'Haircut', nameZh: '剪发', descEn: 'Cut and style', descZh: '剪发造型', min: 30, price: 35 },
  { key: 'b2', kind: 'service', category: 'hair', name: 'Skin Fade', nameZh: '渐变推剪', descEn: 'Zero fade, cleaned up', descZh: '零号渐变', min: 45, price: 45 },
  { key: 'b3', kind: 'service', category: 'hair', name: 'Buzz Cut', nameZh: '寸头', min: 20, price: 25 },
  { key: 'b4', kind: 'service', category: 'hair', name: 'Kids Cut', nameZh: '儿童剪发', descEn: '12 and under', descZh: '12 岁及以下', min: 25, price: 25 },
  { key: 'b5', kind: 'service', category: 'hair', name: 'Cut + Beard', nameZh: '剪发 + 修胡', min: 50, price: 55 },
  { key: 'b6', kind: 'service', category: 'beard', name: 'Beard Trim', nameZh: '修胡子', min: 20, price: 20 },
  { key: 'b7', kind: 'service', category: 'beard', name: 'Hot Towel Shave', nameZh: '热毛巾剃须', min: 40, price: 45 },
  { key: 'ba1', kind: 'addon', category: 'addon', appliesTo: ['hair'], name: 'Hair Wash', nameZh: '洗头', min: 10, price: 8 },
  { key: 'ba2', kind: 'addon', category: 'addon', appliesTo: ['hair', 'beard'], name: 'Hot Towel', nameZh: '热毛巾', min: 5, price: 5 },
  { key: 'ba3', kind: 'addon', category: 'addon', appliesTo: ['hair'], name: 'Design / Part Line', nameZh: '刻线造型', min: 10, price: 10 },
  { key: 'ba4', kind: 'addon', category: 'addon', appliesTo: ['beard', 'hair'], name: 'Eyebrow Clean-up', nameZh: '修眉', min: 10, price: 10 },
]

export function templateFor(industry: Industry): TemplateService[] {
  if (industry === 'nail') return NAIL
  if (industry === 'barber') return BARBER
  return [...NAIL, ...BARBER]
}

export function defaultThemeFor(industry: Industry): string {
  return industry === 'barber' ? 'brass' : industry === 'both' ? 'clean' : 'lacquer'
}
