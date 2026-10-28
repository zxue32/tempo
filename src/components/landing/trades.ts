// What the landing page shows for each trade: the caption under the sculpture, the people and services in the
// example calendar, and the trade's own feature. All of it is example data and labelled as such on the page.
import type { Trade } from './shapes'

type Txt = { zh: string; en: string }
export type Booking = { col: number; start: number; len: number; who: Txt; what: Txt }   // start/len in half hours from 10:00
export type TradeInfo = {
  industry: 'nail' | 'hair' | 'barber' | 'spa' | 'beauty' | 'tattoo' | 'pet' | 'pilates' | 'fitness' | 'other'
  caption: Txt
  staff: Array<{ name: Txt; color: string }>
  bookings: Booking[]
  special: 'tryon' | 'hair' | 'prefs'
  prefs?: Txt[]
  skills: Txt[]
}

const T = (zh: string, en: string): Txt => ({ zh, en })
const COLORS = ['#C8445A', '#8E5BA8', '#2F8A78', '#C9822F']

export const TRADE_INFO: Record<Trade, TradeInfo> = {
  nail: {
    industry: 'nail', caption: T('美甲 · 月光猫眼 75 分钟', 'Nails · Moonlight cat-eye, 75 min'),
    staff: [T('米娅', 'Mia'), T('露娜', 'Luna'), T('艾薇', 'Ivy'), T('可可', 'Coco')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 3, who: T('王小姐', 'Emily'), what: T('猫眼延长', 'Cat-eye extensions') }, { col: 1, start: 2, len: 2, who: T('陈小姐', 'Grace'), what: T('凝胶美甲', 'Gel manicure') },
      { col: 2, start: 1, len: 4, who: T('李小姐', 'Sophia'), what: T('Gel-X 延长', 'Gel-X') }, { col: 3, start: 4, len: 3, who: T('张小姐', 'Hannah'), what: T('足部 SPA', 'Spa pedicure') },
      { col: 0, start: 6, len: 2, who: T('周小姐', 'Ava'), what: T('卸甲 + 单色', 'Removal + colour') }, { col: 1, start: 7, len: 3, who: T('林小姐', 'Chloe'), what: T('珍珠法式', 'Pearl french') },
      { col: 2, start: 9, len: 2, who: T('黄小姐', 'Mia R.'), what: T('凝胶美甲', 'Gel manicure') }, { col: 3, start: 10, len: 3, who: T('吴小姐', 'Zoe'), what: T('琥珀晕染', 'Amber blooming') },
    ],
    special: 'tryon', skills: [T('凝胶', 'Gel'), T('延长', 'Extensions'), T('猫眼', 'Cat-eye')],
  },
  hair: {
    industry: 'hair', caption: T('美发 · 手刷挑染 2 小时 30 分', 'Hair · Balayage, 2 h 30'),
    staff: [T('Coco', 'Coco'), T('Leo', 'Leo'), T('小雅', 'Ya'), T('Sam', 'Sam')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 5, who: T('王小姐', 'Emily'), what: T('手刷挑染', 'Balayage') }, { col: 1, start: 0, len: 2, who: T('陈先生', 'Daniel'), what: T('男士剪发', "Men's cut") },
      { col: 2, start: 2, len: 3, who: T('李小姐', 'Sophia'), what: T('全头染发', 'Colour') }, { col: 3, start: 3, len: 5, who: T('张小姐', 'Hannah'), what: T('烫发', 'Perm') },
      { col: 1, start: 4, len: 2, who: T('周小姐', 'Ava'), what: T('女士剪发', "Women's cut") }, { col: 0, start: 7, len: 2, who: T('林先生', 'Ryan'), what: T('男士剪发', "Men's cut") },
      { col: 2, start: 8, len: 2, who: T('黄小姐', 'Zoe'), what: T('头皮护理', 'Scalp treatment') }, { col: 1, start: 9, len: 3, who: T('吴小姐', 'Chloe'), what: T('剪发 + 护发', 'Cut + conditioning') },
    ],
    special: 'hair', skills: [T('剪发', 'Cuts'), T('染发', 'Colour'), T('烫发', 'Perms')],
  },
  barber: {
    industry: 'barber', caption: T('理发 · 渐变推剪 45 分钟', 'Barber · Skin fade, 45 min'),
    staff: [T('Dre', 'Dre'), T('阿凯', 'Kai'), T('Sam', 'Sam'), T('老周', 'Joe')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 2, who: T('陈先生', 'Jordan'), what: T('渐变推剪', 'Skin fade') }, { col: 1, start: 1, len: 2, who: T('李先生', 'Sam R.'), what: T('剪发 + 修胡', 'Cut + beard') },
      { col: 2, start: 0, len: 1, who: T('散客', 'Walk-in'), what: T('寸头', 'Buzz cut') }, { col: 3, start: 2, len: 2, who: T('王先生', 'Marcus'), what: T('热毛巾剃须', 'Hot towel shave') },
      { col: 0, start: 3, len: 2, who: T('张先生', 'Leo'), what: T('渐变推剪', 'Skin fade') }, { col: 2, start: 4, len: 1, who: T('小宝', 'Kid'), what: T('儿童剪发', 'Kids cut') },
      { col: 1, start: 6, len: 2, who: T('周先生', 'Tyler'), what: T('剪发', 'Haircut') }, { col: 3, start: 7, len: 2, who: T('吴先生', 'Chris'), what: T('剪发 + 修胡', 'Cut + beard') },
    ],
    special: 'hair', skills: [T('渐变', 'Fades'), T('修胡', 'Beards'), T('剃须', 'Shaves')],
  },
  spa: {
    industry: 'spa', caption: T('按摩 SPA · 精油推拿 60 分钟', 'Massage · Swedish, 60 min'),
    staff: [T('小林', 'Lin'), T('阿美', 'Mei'), T('大卫', 'David'), T('安娜', 'Anna')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 2, who: T('王女士', 'Emily'), what: T('精油推拿', 'Swedish') }, { col: 1, start: 1, len: 3, who: T('陈先生', 'Daniel'), what: T('热石按摩', 'Hot stone') },
      { col: 2, start: 0, len: 2, who: T('李先生', 'Ryan'), what: T('深层组织', 'Deep tissue') }, { col: 3, start: 2, len: 2, who: T('张女士', 'Hannah'), what: T('足底按摩', 'Reflexology') },
      { col: 0, start: 3, len: 3, who: T('周女士', 'Ava'), what: T('精油推拿 + 加钟', 'Swedish + 15') }, { col: 2, start: 4, len: 2, who: T('林女士', 'Chloe'), what: T('全身磨砂', 'Body scrub') },
      { col: 1, start: 6, len: 2, who: T('黄先生', 'Marcus'), what: T('深层组织', 'Deep tissue') }, { col: 3, start: 6, len: 3, who: T('吴女士', 'Zoe'), what: T('热石按摩', 'Hot stone') },
    ],
    special: 'prefs', prefs: [T('力度：偏重', 'Pressure: firm'), T('精油：薰衣草', 'Oil: lavender'), T('避开：左肩旧伤', 'Avoid: left shoulder'), T('常约：小林', 'Usually sees Lin')],
    skills: [T('推拿', 'Swedish'), T('深层', 'Deep tissue'), T('热石', 'Hot stone')],
  },
  beauty: {
    industry: 'beauty', caption: T('美睫 · 自然款嫁接 2 小时', 'Lashes · Classic full set, 2 h'),
    staff: [T('小雪', 'Snow'), T('Nana', 'Nana'), T('琪琪', 'Kiki'), T('Lily', 'Lily')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 4, who: T('王小姐', 'Emily'), what: T('美睫嫁接', 'Lash full set') }, { col: 1, start: 1, len: 2, who: T('陈小姐', 'Grace'), what: T('补睫毛', 'Lash fill') },
      { col: 2, start: 0, len: 1, who: T('李小姐', 'Sophia'), what: T('修眉', 'Brow shaping') }, { col: 3, start: 2, len: 2, who: T('张小姐', 'Hannah'), what: T('面部护理', 'Facial') },
      { col: 2, start: 2, len: 2, who: T('周小姐', 'Ava'), what: T('野生眉', 'Brow lamination') }, { col: 1, start: 4, len: 2, who: T('林小姐', 'Chloe'), what: T('睫毛翘睫', 'Lash lift') },
      { col: 0, start: 6, len: 4, who: T('黄小姐', 'Zoe'), what: T('美睫嫁接', 'Lash full set') }, { col: 3, start: 6, len: 2, who: T('吴小姐', 'Mia R.'), what: T('面部护理', 'Facial') },
    ],
    special: 'prefs', prefs: [T('款式：自然款 9–11 mm', 'Style: natural, 9–11 mm'), T('胶水：低刺激', 'Glue: sensitive'), T('上次：3 周前', 'Last visit: 3 weeks ago'), T('常约：小雪', 'Usually sees Snow')],
    skills: [T('嫁接', 'Extensions'), T('翘睫', 'Lifts'), T('眉毛', 'Brows')],
  },
  tattoo: {
    industry: 'tattoo', caption: T('纹身 · 小图细线 60 分钟', 'Tattoo · Fine-line small piece, 60 min'),
    staff: [T('阿墨', 'Mo'), T('Rex', 'Rex'), T('小野', 'Yano'), T('Jade', 'Jade')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 1, who: T('王小姐', 'Emily'), what: T('图案咨询', 'Consultation') }, { col: 1, start: 0, len: 8, who: T('陈先生', 'Daniel'), what: T('半天场', 'Half-day session') },
      { col: 2, start: 1, len: 2, who: T('李小姐', 'Sophia'), what: T('小图纹身', 'Small tattoo') }, { col: 3, start: 2, len: 1, who: T('张同学', 'Hannah'), what: T('耳洞', 'Ear piercing') },
      { col: 0, start: 3, len: 2, who: T('周先生', 'Leo'), what: T('小图纹身', 'Small tattoo') }, { col: 2, start: 5, len: 1, who: T('林小姐', 'Chloe'), what: T('补色', 'Touch-up') },
      { col: 3, start: 5, len: 2, who: T('黄先生', 'Marcus'), what: T('小图纹身', 'Small tattoo') }, { col: 0, start: 7, len: 1, who: T('吴小姐', 'Zoe'), what: T('图案咨询', 'Consultation') },
    ],
    special: 'prefs', prefs: [T('风格：细线黑灰', 'Style: fine-line black & grey'), T('位置：左前臂', 'Placement: left forearm'), T('下次：一个月后补色', 'Next: touch-up in a month'), T('常约：阿墨', 'Usually sees Mo')],
    skills: [T('细线', 'Fine-line'), T('彩色', 'Colour'), T('穿孔', 'Piercing')],
  },
  pet: {
    industry: 'pet', caption: T('宠物美容 · 小型犬洗护 90 分钟', 'Grooming · Small dog full groom, 90 min'),
    staff: [T('小米', 'Mimi'), T('阿杰', 'Jay'), T('朵朵', 'Dodo'), T('Ben', 'Ben')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 3, who: T('豆豆 · 柯基', 'Bean · corgi'), what: T('洗护美容', 'Full groom') }, { col: 1, start: 0, len: 2, who: T('咪咪 · 布偶猫', 'Mochi · cat'), what: T('洗澡吹干', 'Bath & dry') },
      { col: 2, start: 1, len: 5, who: T('大黄 · 金毛', 'Sunny · golden'), what: T('大型犬洗护', 'Large dog groom') }, { col: 3, start: 1, len: 3, who: T('团团 · 泰迪', 'Coco · poodle'), what: T('洗护美容', 'Full groom') },
      { col: 0, start: 4, len: 2, who: T('可乐 · 柴犬', 'Cola · shiba'), what: T('洗澡吹干', 'Bath & dry') }, { col: 1, start: 3, len: 3, who: T('雪球 · 比熊', 'Snow · bichon'), what: T('洗护美容', 'Full groom') },
      { col: 3, start: 5, len: 3, who: T('奶糖 · 猫咪', 'Milk · cat'), what: T('猫咪洗护', 'Cat groom') }, { col: 2, start: 7, len: 2, who: T('布丁 · 法斗', 'Pudding · frenchie'), what: T('洗澡 + 剪指甲', 'Bath + nails') },
    ],
    special: 'prefs', prefs: [T('豆豆 · 柯基 · 5 岁', 'Bean · corgi · 5'), T('怕吹风机，要慢慢来', 'Scared of the dryer: go slowly'), T('用低敏沐浴露', 'Hypoallergenic shampoo'), T('常约：小米', 'Usually sees Mimi')],
    skills: [T('狗狗', 'Dogs'), T('猫咪', 'Cats'), T('造型', 'Styling')],
  },
  pilates: {
    industry: 'pilates', caption: T('普拉提 · 器械私教 55 分钟', 'Pilates · Private reformer, 55 min'),
    staff: [T('Ella', 'Ella'), T('小悠', 'Yu'), T('Mia', 'Mia'), T('阿哲', 'Zhe')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 2, who: T('王小姐', 'Emily'), what: T('器械私教', 'Reformer') }, { col: 1, start: 0, len: 2, who: T('陈小姐 + 闺蜜', 'Grace + 1'), what: T('双人课', 'Duet') },
      { col: 2, start: 2, len: 2, who: T('李先生', 'Ryan'), what: T('体验课', 'Intro session') }, { col: 3, start: 1, len: 2, who: T('张小姐', 'Hannah'), what: T('垫上私教', 'Mat private') },
      { col: 0, start: 3, len: 2, who: T('周小姐', 'Ava'), what: T('器械私教', 'Reformer') }, { col: 1, start: 4, len: 2, who: T('林小姐', 'Chloe'), what: T('器械私教', 'Reformer') },
      { col: 2, start: 5, len: 2, who: T('黄小姐', 'Zoe'), what: T('器械私教', 'Reformer') }, { col: 3, start: 6, len: 2, who: T('吴先生', 'Marcus'), what: T('体验课', 'Intro session') },
    ],
    special: 'prefs', prefs: [T('目标：改善圆肩', 'Goal: open up the shoulders'), T('注意：腰椎间盘突出', 'Watch: lower-back disc'), T('偏好：早上的课', 'Prefers mornings'), T('常约：Ella', 'Usually sees Ella')],
    skills: [T('器械', 'Reformer'), T('垫上', 'Mat'), T('产后', 'Postnatal')],
  },
  fitness: {
    industry: 'fitness', caption: T('健身私教 · 私教课 60 分钟', 'Personal training · 60 min'),
    staff: [T('阿强', 'Max'), T('Kelly', 'Kelly'), T('大鹏', 'Peng'), T('Nina', 'Nina')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 2, who: T('王先生', 'Daniel'), what: T('私教课', 'Personal training') }, { col: 1, start: 1, len: 1, who: T('陈小姐', 'Grace'), what: T('30 分钟私教', 'PT 30 min') },
      { col: 2, start: 0, len: 2, who: T('李先生', 'Ryan'), what: T('体测与计划', 'Assessment') }, { col: 3, start: 2, len: 2, who: T('张小姐', 'Hannah'), what: T('私教课', 'Personal training') },
      { col: 0, start: 3, len: 2, who: T('周先生', 'Leo'), what: T('私教课 + 拉伸', 'PT + stretch') }, { col: 1, start: 4, len: 2, who: T('林小姐', 'Chloe'), what: T('私教课', 'Personal training') },
      { col: 2, start: 5, len: 1, who: T('黄先生', 'Marcus'), what: T('30 分钟私教', 'PT 30 min') }, { col: 3, start: 6, len: 2, who: T('吴小姐', 'Zoe'), what: T('私教课', 'Personal training') },
    ],
    special: 'prefs', prefs: [T('目标：减脂 6 公斤', 'Goal: lose 6 kg'), T('每周 3 次，早上', '3 times a week, mornings'), T('注意：右膝旧伤', 'Watch: right knee'), T('常约：阿强', 'Usually sees Max')],
    skills: [T('力量', 'Strength'), T('减脂', 'Fat loss'), T('康复', 'Rehab')],
  },
  other: {
    industry: 'other', caption: T('任何预约制服务 · 60 分钟', 'Any appointment · 60 min'),
    staff: [T('Alex', 'Alex'), T('小周', 'Zhou'), T('Sam', 'Sam'), T('Mia', 'Mia')].map((name, i) => ({ name, color: COLORS[i] })),
    bookings: [
      { col: 0, start: 0, len: 2, who: T('王女士', 'Emily'), what: T('标准服务', 'Appointment') }, { col: 1, start: 1, len: 1, who: T('陈先生', 'Daniel'), what: T('咨询', 'Consultation') },
      { col: 2, start: 0, len: 2, who: T('李女士', 'Sophia'), what: T('标准服务', 'Appointment') }, { col: 3, start: 2, len: 1, who: T('张先生', 'Ryan'), what: T('短时服务', 'Short visit') },
      { col: 0, start: 3, len: 2, who: T('周女士', 'Ava'), what: T('标准服务', 'Appointment') }, { col: 1, start: 4, len: 2, who: T('林先生', 'Leo'), what: T('标准服务', 'Appointment') },
      { col: 2, start: 5, len: 1, who: T('黄女士', 'Zoe'), what: T('咨询', 'Consultation') }, { col: 3, start: 6, len: 2, who: T('吴先生', 'Marcus'), what: T('标准服务', 'Appointment') },
    ],
    special: 'prefs', prefs: [T('偏好：下午的时段', 'Prefers afternoons'), T('提醒：提前一天发短信', 'Reminder: text the day before'), T('上次：两周前', 'Last visit: 2 weeks ago'), T('常约：Alex', 'Usually sees Alex')],
    skills: [T('服务 A', 'Service A'), T('服务 B', 'Service B'), T('咨询', 'Consults')],
  },
}

export const HAIR_SHADES: Array<{ name: Txt; hex: string }> = [
  { name: T('奶茶棕', 'Milk tea'), hex: '#A57B5B' }, { name: T('雾霾蓝', 'Smoke blue'), hex: '#56657A' }, { name: T('蜜糖金', 'Honey'), hex: '#C99A4E' },
  { name: T('冷灰棕', 'Ash brown'), hex: '#6E625A' }, { name: T('樱桃红', 'Cherry'), hex: '#7B1F2E' }, { name: T('亚麻', 'Linen'), hex: '#D3BC98' },
]
