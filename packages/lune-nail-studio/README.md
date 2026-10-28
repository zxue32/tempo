# LUNE Nail Studio · 分层材质与闭合甲体版

可嵌入现有网页的 Web Component。加载用户提供的 Tripo 手模，保留手部皮肤纹理，用闭合甲体预览甲型、长度、分层材质和手绘，再生成技师说明与到店设计卡。Three.js 和 Shadow DOM 样式打包在一个 JavaScript 模块中，配套 GLB 独立加载。

**1.2.1 侧面轮廓修复**：中长／长甲重新构建侧缘、横向拱曲和延长段厚度，避免收尖时边缘向上翘起、前端呈薄片。已有设计可直接打开；更新嵌入模块即可使用新的甲体。

## 按美甲师的顺序设计

1. **款式**：月光猫眼、冰透裸色、琥珀碎金、奶灰细闪、星空跳色、醋酸贝壳、珍珠法式、巧克力镜面。8 张缩略图从配套手模的对应代表甲面实时渲染，不使用小红书图片。
2. **甲型**：杏仁、椭圆、方形、方圆、芭蕾、尖形；短／中长／长需延长。甲体有弧面、侧壁、自由缘和底面，长度是视觉档位，不是毫米尺寸。
3. **底色**：冰透、奶白、实色；15 个命名常用色及自定义颜色。
4. **效果**：纯色／渐变／法式／晕染，猫眼／镜面／极光，细闪／闪粉／金箔／贝壳片。图案、光泽、颗粒各自选择颜色。
5. **装饰**：四角星、金属线、水钻、珍珠，可选颜色；另有平面和 3D 自由手绘。
6. **封层**：亮面或磨砂，可轻微染色；白色代表无色封层。

选择“整手”后修改五指；点手上的甲面或下方指名后只修改那一指。按住“看原甲”显示原始 Tripo 指甲，松开恢复设计。支持自然日光／柔光影棚／暖光室内、旋转缩放、甲面特写、撤销重做、本机草稿、JSON 导入导出及 PNG 设计卡。背景含可关闭的粒子与漂浮几何体，支持系统减少动态效果。

**皮肤保留原始纹理，甲型和长度可调。** Tripo 生成资产不等同于真人扫描。闭合甲体是依照当前模型校准的造型预览，长款是否可做及延长方式仍需由美甲师确认。

## 运行与交付文件

需要 Node.js 20.19+ 和 pnpm：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

部署时同时复制：

| 本目录文件 | 网站推荐位置 |
| --- | --- |
| `dist/lune-nail-studio.js` | `/vendor/lune-nail-studio.js` |
| `public/models/tripo-hand.glb` | `/models/tripo-hand.glb` |

没有单独的 CSS。`demo-dist/` 是构建后的独立演示站，须通过 HTTP/HTTPS 托管。无需运行时 CDN、Tripo 密钥或服务器图像生成。

## 配色（Tempo 加的主题变量）

组件的颜色全部来自下面这些 CSS 变量，宿主在 `<lune-nail-studio>` 元素上设置即可（外部样式优先于 Shadow DOM 里的 `:host` 默认值）。不设置时和原版完全一样。

| 变量 | 用途 | 默认 |
| --- | --- | --- |
| `--paper` | 整个工作室的底色（应等于网页背景） | `#f9f6f1` |
| `--card` | 面板、卡片、按钮底 | `#fffdf9` |
| `--sunk` | 凹陷区、标签栏底 | `#f3efe9` |
| `--line` | 线条、边框 | `#e7e0d9` |
| `--ink` / `--muted` | 正文 / 次要文字 | `#342e2c` / `#8c827d` |
| `--wine` / `--wine-ink` | 主色（选中、主按钮）/ 主色上的文字 | `#783c4a` / `#fffaf7` |
| `--stage` | 手模背后的展示台（可以用撞色） | 同 `--sunk` |
| `--stage-ink` / `--stage-muted` | 直接压在展示台上的文字 | 同 `--ink` / `--muted` |

材质小球、甲油色块和设计卡 PNG 保持原样，不跟主题变色。

## 网页接入

```html
<script type="module" src="/vendor/lune-nail-studio.js"></script>
<lune-nail-studio
  model-src="/models/tripo-hand.glb"
  brand="LUNE ATELIER"
  storage-key="lune-design:demo1"
></lune-nail-studio>
```

所有属性在挂载前设置。推荐明确指定 `model-src`；默认按 `document.baseURI` 解析 `./models/tripo-hand.glb`，嵌套路由可能解析到错误位置。按店铺或账户设置不同 `storage-key`。普通网页和 React／Next.js 客户端示例分别位于 `examples/plain-html.html`、`examples/react-next.tsx`。

**`model-src` 不是通用 GLB 上传接口。** `src/nail-landmarks.json`、`src/tripo-nails.ts` 的标定绑定配套模型的坐标系和表面。更换模型、烘焙旋转或改动比例后，必须重新标定并验证甲缘和侧视效果。

## 技师说明与预约入口

每次修改都会更新“技师会看到”的一句工艺说明，自动按相同设计分组，列明甲型、长度、底色、有效图层、装饰及封层；手绘以设计卡图案为准。

“带着这个设计去预约”触发可取消的 `lune:book` 事件。没有宿主接管时，组件打开设计交接弹窗，可下载设计卡和文字说明。可选 `booking-url` 属性只接受 HTTP/HTTPS 地址（包括可解析为这两类地址的相对路径），在弹窗增加“继续选择预约时间”链接；不会把设计自动上传到该地址，也不会宣告预约成功。

宿主若已有预约流程，可同步调用 `preventDefault()`，再使用经过校验的设计、说明或已保存设计 ID 进入现有预约页面：

```js
studio.addEventListener('lune:book', (event) => {
  event.preventDefault(); // 在任何 await 之前接管默认弹窗
  const { design, summary } = event.detail;
  // 交给宿主现有预约流程；数据保存、权限与失败反馈由宿主负责。
  openExistingBookingFlow({ design, summary });
});
```

上面的 `openExistingBookingFlow` 是宿主自行实现的函数，不属于插件 API。

## API 与事件

```js
const studio = document.querySelector('lune-nail-studio');
const design = studio.getDesign();        // 深拷贝
studio.setDesign(design);                 // 校验后载入，非法输入抛错
const image = await studio.exportCard();  // PNG Blob，不上传
```

事件监听应在挂载元素前注册；需要 3D 快照时等 `lune:ready`：

| 事件 | `event.detail` | 含义 |
| --- | --- | --- |
| `lune:ready` | `{ webgl: true }` | 模型和校准甲体就绪；3D 上下文恢复后可能再次触发 |
| `lune:change` | `StudioDesign` | 当前设计变化 |
| `lune:error` | `{ message: string }` | 加载、上下文或导出错误 |
| `lune:book` | `{ design, summary: string }` | 用户点击预约入口；可用 `preventDefault()` 接管 |
| `lune:handoff` | `{ design, image: Blob }` | 用户主动下载设计卡后的交接事件 |

`customElements.whenDefined()` 只保证类注册，不能替代模型就绪事件。加载失败时发出 `lune:error`，显示平面设计模式和重试按钮，不发出 `webgl: false` 的 ready。每次 error 不一定都是模型失败，导出错误也使用此事件。

## 数据与兼容

设计仍使用 `schemaVersion: 1`，按拇指、食指、中指、无名指、小指保存五枚指甲。`validateDesign()` 接受旧版文件，补齐新增分层字段，把旧长度归入 `0`／`0.5`／`1` 三档；未知字段、非法选项、颜色和访问器字段仍会被拒绝。旧版本插件不保证能读取新增字段。

新增字段包括 `base`、`patternColor`、`optical`、`opticalColor`、`particles`、`particleColor`、`decoration`、`decorationColor`、`topCoat`、`topCoatColor`。`finish` 保留兼容旧文件；新的光泽及封层优先使用各自字段。`skinTone` 保留数据兼容，不重染原手部皮肤。完整类型和验证规则见 `src/types.ts`、`src/state.ts`，款式及工艺说明见 `src/catalog.ts`。

JSON 保存名称、甲型、长度、所有材质层和笔画，不保存灯光、原甲对照、背景开关、相机或撤销历史。导入上限 5 MB，载入后刷新 `updatedAt`。绘画坐标为甲面归一化坐标，`y=0` 在甲尖、`y=1` 在甲根。PNG 设计卡使用整手设计画面，导出后恢复原视角和对照状态。

## 资产与范围

原始 `hand 3d model.glb` 未被修改。优化 GLB 约 9.38 MB、168,474 三角面，保留原坐标、UV 和 4K 颜色贴图；法线 2K，粗糙度／金属度 1K，不需要 Draco 解码器。该面数只描述基础手模；新增甲体和装饰在运行时生成。资产报告见 `public/models/tripo-asset-report.json`。

模型纹理可能含原始光照，屏幕和灯光也会影响颜色。材质模拟用于视觉沟通，不能保证与门店实体胶色完全一致。插件不自动上传设计、发消息或提交预约；草稿存在当前浏览器。跨设备保存、预约关联、价格和技师工艺确认由宿主及门店处理。
