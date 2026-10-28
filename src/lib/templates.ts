// Starter service menus by industry. Owners edit names, times and prices after onboarding.
/** Every kind of appointment shop the platform opens. Order = the order owners see when they sign up. */
export const INDUSTRIES = ['nail', 'hair', 'barber', 'spa', 'beauty', 'tattoo', 'pet', 'pilates', 'fitness', 'both', 'other'] as const
export type Industry = (typeof INDUSTRIES)[number]
export const isIndustry = (v: unknown): v is Industry => typeof v === 'string' && (INDUSTRIES as readonly string[]).includes(v)

export const CATEGORIES: Record<Industry, string[]> = {
  nail: ['hand', 'ext', 'foot', 'other'],
  hair: ['cut', 'color', 'perm', 'care', 'other'],
  barber: ['hair', 'beard', 'other'],
  spa: ['massage', 'body', 'foot', 'other'],
  beauty: ['lash', 'brow', 'facial', 'other'],
  tattoo: ['consult', 'tattoo', 'piercing', 'other'],
  pet: ['groom', 'wash', 'other'],
  pilates: ['private', 'intro', 'other'],
  fitness: ['private', 'assess', 'other'],
  both: ['hand', 'ext', 'foot', 'hair', 'beard', 'other'],
  other: ['service', 'other'],
}

/** The nail try-on and nail colour board. */
export const hasNailTools = (i: Industry) => i === 'nail' || i === 'both'
/** The hair colour board. */
export const hasHairTools = (i: Industry) => i === 'hair' || i === 'barber' || i === 'both'

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

const HAIR: TemplateService[] = [
  { key: 'h1', kind: 'service', category: 'cut', name: "Women's Cut & Style", nameZh: '女士剪发造型', descEn: 'Consultation, wash, cut and blow-dry', descZh: '沟通、洗发、剪发、吹造型', min: 60, price: 65 },
  { key: 'h2', kind: 'service', category: 'cut', name: "Men's Cut", nameZh: '男士剪发', min: 30, price: 35 },
  { key: 'h3', kind: 'service', category: 'color', name: 'Single-process Colour', nameZh: '全头染发', descEn: 'Root to tip, one shade', descZh: '一个颜色，发根到发尾', min: 90, price: 95 },
  { key: 'h4', kind: 'service', category: 'color', name: 'Balayage / Highlights', nameZh: '手刷挑染', descEn: 'Hand-painted lightening', descZh: '手刷漂染，层次自然', min: 150, price: 180 },
  { key: 'h5', kind: 'service', category: 'perm', name: 'Perm', nameZh: '烫发', descEn: 'Soft waves or curls', descZh: '纹理烫或卷发', min: 150, price: 150 },
  { key: 'h6', kind: 'service', category: 'care', name: 'Scalp Treatment', nameZh: '头皮护理', min: 45, price: 50 },
  { key: 'ha1', kind: 'addon', category: 'addon', appliesTo: ['cut', 'color', 'perm'], name: 'Deep Conditioning', nameZh: '深层护发', min: 15, price: 25 },
  { key: 'ha2', kind: 'addon', category: 'addon', appliesTo: ['color', 'perm', 'care'], name: 'Blow-dry Styling', nameZh: '吹造型', min: 20, price: 20 },
]

const SPA: TemplateService[] = [
  { key: 's1', kind: 'service', category: 'massage', name: 'Swedish Massage', nameZh: '精油推拿', descEn: 'Full body, medium pressure', descZh: '全身，中等力度', min: 60, price: 90 },
  { key: 's2', kind: 'service', category: 'massage', name: 'Deep Tissue Massage', nameZh: '深层组织按摩', descEn: 'Firm pressure for tight muscles', descZh: '大力度，放松紧绷的肌肉', min: 60, price: 105 },
  { key: 's3', kind: 'service', category: 'massage', name: 'Hot Stone Massage', nameZh: '热石按摩', min: 90, price: 140 },
  { key: 's4', kind: 'service', category: 'body', name: 'Body Scrub', nameZh: '全身磨砂', min: 45, price: 70 },
  { key: 's5', kind: 'service', category: 'foot', name: 'Foot Reflexology', nameZh: '足底按摩', min: 45, price: 55 },
  { key: 'sa1', kind: 'addon', category: 'addon', appliesTo: ['massage', 'foot'], name: 'Extra 15 Minutes', nameZh: '加钟 15 分钟', min: 15, price: 25 },
  { key: 'sa2', kind: 'addon', category: 'addon', appliesTo: ['massage', 'body'], name: 'Aromatherapy Oil', nameZh: '芳香精油', min: 5, price: 10 },
]

const BEAUTY: TemplateService[] = [
  { key: 'e1', kind: 'service', category: 'lash', name: 'Classic Lash Full Set', nameZh: '美睫嫁接（自然款）', min: 120, price: 120 },
  { key: 'e2', kind: 'service', category: 'lash', name: 'Lash Fill', nameZh: '补睫毛', descEn: 'Within 3 weeks', descZh: '3 周内', min: 60, price: 60 },
  { key: 'e3', kind: 'service', category: 'lash', name: 'Lash Lift', nameZh: '睫毛翘睫', min: 60, price: 75 },
  { key: 'e4', kind: 'service', category: 'brow', name: 'Brow Shaping', nameZh: '修眉', min: 20, price: 20 },
  { key: 'e5', kind: 'service', category: 'brow', name: 'Brow Lamination', nameZh: '野生眉', min: 45, price: 65 },
  { key: 'e6', kind: 'service', category: 'facial', name: 'Classic Facial', nameZh: '基础面部护理', min: 60, price: 85 },
  { key: 'ea1', kind: 'addon', category: 'addon', appliesTo: ['lash'], name: 'Lash Removal', nameZh: '卸睫毛', min: 20, price: 20 },
  { key: 'ea2', kind: 'addon', category: 'addon', appliesTo: ['brow'], name: 'Brow Tint', nameZh: '染眉', min: 15, price: 15 },
]

const TATTOO: TemplateService[] = [
  { key: 't1', kind: 'service', category: 'consult', name: 'Design Consultation', nameZh: '图案咨询', descEn: 'Talk through the idea, size and placement', descZh: '聊想法、大小和位置', min: 30, price: 0 },
  { key: 't2', kind: 'service', category: 'tattoo', name: 'Small Tattoo', nameZh: '小图纹身', descEn: 'Up to palm size', descZh: '手掌大小以内', min: 60, price: 150 },
  { key: 't3', kind: 'service', category: 'tattoo', name: 'Half-day Session', nameZh: '半天场', min: 240, price: 500 },
  { key: 't4', kind: 'service', category: 'tattoo', name: 'Touch-up', nameZh: '补色', min: 30, price: 50 },
  { key: 't5', kind: 'service', category: 'piercing', name: 'Ear Piercing', nameZh: '耳洞', descEn: 'Jewellery included', descZh: '含首饰', min: 20, price: 40 },
]

const PET: TemplateService[] = [
  { key: 'p1', kind: 'service', category: 'groom', name: 'Small Dog Full Groom', nameZh: '小型犬洗护美容', descEn: 'Bath, haircut, nails, ears', descZh: '洗澡、修剪、剪指甲、清耳朵', min: 90, price: 70 },
  { key: 'p2', kind: 'service', category: 'groom', name: 'Medium Dog Full Groom', nameZh: '中型犬洗护美容', min: 120, price: 90 },
  { key: 'p3', kind: 'service', category: 'groom', name: 'Large Dog Full Groom', nameZh: '大型犬洗护美容', min: 150, price: 120 },
  { key: 'p4', kind: 'service', category: 'groom', name: 'Cat Groom', nameZh: '猫咪洗护', min: 90, price: 85 },
  { key: 'p5', kind: 'service', category: 'wash', name: 'Bath & Dry', nameZh: '洗澡吹干', min: 60, price: 45 },
  { key: 'pa1', kind: 'addon', category: 'addon', appliesTo: ['groom', 'wash'], name: 'Nail Trim', nameZh: '剪指甲', min: 10, price: 15 },
  { key: 'pa2', kind: 'addon', category: 'addon', appliesTo: ['groom', 'wash'], name: 'Teeth Brushing', nameZh: '刷牙', min: 10, price: 10 },
]

const PILATES: TemplateService[] = [
  { key: 'l1', kind: 'service', category: 'private', name: 'Private Reformer Session', nameZh: '器械私教课', min: 55, price: 95 },
  { key: 'l2', kind: 'service', category: 'private', name: 'Duet Session', nameZh: '双人课', descEn: 'Two people, one instructor', descZh: '两人一位教练', min: 55, price: 130 },
  { key: 'l3', kind: 'service', category: 'private', name: 'Mat Private Session', nameZh: '垫上私教课', min: 55, price: 80 },
  { key: 'l4', kind: 'service', category: 'intro', name: 'Intro Session', nameZh: '体验课', descEn: 'First visit: posture check and basics', descZh: '第一次来：体态评估和基础动作', min: 45, price: 50 },
]

const FITNESS: TemplateService[] = [
  { key: 'f1', kind: 'service', category: 'private', name: 'Personal Training', nameZh: '私教课', min: 60, price: 90 },
  { key: 'f2', kind: 'service', category: 'private', name: 'Personal Training (30 min)', nameZh: '30 分钟私教', min: 30, price: 55 },
  { key: 'f3', kind: 'service', category: 'assess', name: 'Assessment & Plan', nameZh: '体测与训练计划', min: 60, price: 60 },
  { key: 'fa1', kind: 'addon', category: 'addon', appliesTo: ['private'], name: 'Assisted Stretch', nameZh: '拉伸放松', min: 15, price: 20 },
]

const OTHER: TemplateService[] = [
  { key: 'o1', kind: 'service', category: 'service', name: 'Standard Appointment', nameZh: '标准服务', min: 60, price: 50 },
  { key: 'o2', kind: 'service', category: 'service', name: 'Short Appointment', nameZh: '短时服务', min: 30, price: 30 },
  { key: 'o3', kind: 'service', category: 'service', name: 'Consultation', nameZh: '咨询', min: 30, price: 0 },
]

const MENUS: Record<Industry, TemplateService[]> = {
  nail: NAIL, hair: HAIR, barber: BARBER, spa: SPA, beauty: BEAUTY, tattoo: TATTOO, pet: PET, pilates: PILATES, fitness: FITNESS,
  both: [...NAIL, ...BARBER], other: OTHER,
}

export function templateFor(industry: Industry): TemplateService[] {
  return MENUS[industry] ?? OTHER
}

const THEME_FOR: Record<Industry, string> = {
  nail: 'lacquer', hair: 'clean', barber: 'brass', spa: 'sage', beauty: 'lacquer', tattoo: 'brass', pet: 'sage', pilates: 'sage', fitness: 'clean', both: 'clean', other: 'clean',
}
export function defaultThemeFor(industry: Industry): string {
  return THEME_FOR[industry] ?? 'clean'
}
