# 给 Claude 的接入说明 · LUNE 1.2.1

## 任务范围与现有项目

将本目录已实现的 Web Component 接入 Tempo 店铺页面，完成「款式选择 → 甲型长度 → 底色 → 效果 → 装饰 → 封层 → 技师说明／预约入口」。保留实际 3D 交互，不换成静态效果图。

交付目录为 `outputs/lune-nail-studio/`，现有应用源码在 `work/tempo-source/`。店铺路由位于 `src/app/[slug]/`；接入时保持 `loadStorefront(slug)` 的草稿／预览权限，并按项目 `AGENTS.md` 读取本地 Next.js 文档。组件本身不依赖 Next.js。不要把演示插件的完成等同于已经接入线上预约后端。

## 部署与挂载

同时部署两个文件：

1. `dist/lune-nail-studio.js` → 应用 `public/vendor/lune-nail-studio.js`。
2. `public/models/tripo-hand.glb` → 应用 `public/models/tripo-hand.glb`。

样式已内嵌，GLB 内含纹理，无额外解码器。不能只复制 JS 而漏掉模型。

```html
<lune-nail-studio
  model-src="/models/tripo-hand.glb"
  brand="LUNE ATELIER"
  storage-key="lune-design:demo1"
></lune-nail-studio>
```

明确设置 `model-src`。默认路径相对于 `document.baseURI`，在嵌套路由可能不同。属性在挂载前设置；草稿键按店铺隔离，账户切换时由宿主处理。使用 `examples/react-next.tsx` 的客户端封装，先注册事件后挂载，卸载时清理监听器和元素；不要在 Server Component 顶层导入浏览器模块，也不要操作 Shadow DOM 内部节点来绑业务逻辑。

## 当前真实功能

- 8 款可编辑配方：月光猫眼、冰透裸色、琥珀碎金、奶灰细闪、星空跳色、醋酸贝壳、珍珠法式、巧克力镜面。
- 缩略图由同一手模的对应代表甲面实时渲染，不部署或引用小红书参考图片。
- 6 甲型及短／中长／长需延长；甲体含平滑顶面、侧壁、自由缘和底面。
- 冰透／奶白／实色底色，15 常用色及自定义色；渐变／法式／晕染，猫眼／镜面／极光，细闪／闪粉／金箔／贝壳片，各层可改颜色。
- 四角星／金属线／水钻／珍珠，亮面／磨砂封层；另有手绘、撤销重做和设计导入导出。
- “整手”修改五指；点模型甲面或指名切到单指，后续修改只影响该指。预设也遵循当前整手／单指选择。
- 按住看原甲，松开恢复设计；鼠标、触屏及键盘空格／回车支持按住对照。
- 技师说明自动按相同款式分组，列明工艺和跳色手指；手绘需要结合设计卡。

皮肤纹理保留原样，甲型和长度现在实际影响预览几何，不再是旧版只保存的占位字段。`skinTone` 仅兼容旧数据，不重染手部。Tripo 生成模型不等同于真人扫描，长款预览不是毫米测量或工艺承诺。

## 模型标定约束

1.2.1 修复中长／长甲收尖时侧缘上翘和自由缘过薄的问题。延长段使用独立的侧缘轮廓、横向拱曲和实体厚度；饰品与画笔仍使用同一甲面采样。升级时替换 `dist/lune-nail-studio.js`，并让宿主清除旧模块缓存。配套 GLB、设计文件格式和组件接口不变。

配套 GLB 原本是整体网格。`src/nail-landmarks.json` 和 `src/tripo-nails.ts` 根据其坐标与表面生成各甲体，并为原甲对照保留源几何。更换 GLB、烘焙旋转或修改源比例后，需要重新标定和检查侧壁、指缘、拇指及绘画命中，不能把 `model-src` 当成任意 GLB 上传入口。

优化基础手模约 9.38 MB、168,474 三角面、4K 颜色贴图；运行时甲体及饰品增加几何。用户原文件未修改。旧程序化手模代码和旧展示页只为此前版本保留，不是当前工作室的手模来源。

## API 与事件

- `getDesign(): StudioDesign`：深拷贝设计。
- `setDesign(value: unknown): void`：校验后载入；非法输入抛错。
- `exportCard(): Promise<Blob>`：生成到店 PNG，不上传。
- `lune:ready`：`{ webgl: true }`，模型与甲体就绪；上下文恢复后可能再次触发。
- `lune:change`：`StudioDesign`。
- `lune:error`：`{ message: string }`，可能是模型、上下文或导出错误。
- `lune:book`：`{ design: StudioDesign; summary: string }`，可取消；用户点击“带着这个设计去预约”触发。
- `lune:handoff`：`{ design: StudioDesign; image: Blob }`，用户主动下载设计卡触发，不表示已经发送或预约成功。

监听器应在挂载前注册。`customElements.whenDefined()` 不是模型就绪信号。加载失败不触发 `webgl:false` 的 ready，而是显示平面降级与重试；宿主 error 处理要停止等待，成功重试的 ready 要清除旧错误。

## 如何接现有预约

默认行为是打开设计交接弹窗，可下载设计卡和文字说明。若只需连接已有预约网址，在挂载前设置 `booking-url`；它接受 HTTP/HTTPS URL 或相对路径，只在弹窗显示继续预约链接，不自动上传、传入或保存设计。

要真正关联设计，监听 `lune:book`，**在异步处理前同步 `event.preventDefault()`** 接管弹窗，再由宿主确认并保存设计／说明，取得设计 ID，进入现有预约步骤。不要把完整设计放进 URL；不要把未经验证的输入直接写入数据库。保持现有门店权限、用户身份、错误提示与预约确认流程。

React 示例的 `onBook` 属性在提供时会同步接管事件；回调收到 `{design,summary}`。未提供 `onBook` 则保留插件弹窗；可同时提供 `bookingUrl` 作为默认弹窗链接。只有实际提交成功后，宿主才能显示预约成功。

## 设计文件兼容

`schemaVersion` 仍为 `1`。五指顺序为拇指、食指、中指、无名指、小指。新增层字段在类型中可选以支持旧文件，`validateDesign`／`normalizeNail` 补齐默认值；旧长度归到 `0`／`0.5`／`1`。新文件不保证能由旧插件读取。

`shape` 新增 `squoval`，`pattern` 新增 `bloom`。新增字段：`base`、`patternColor`、`optical`、`opticalColor`、`particles`、`particleColor`、`decoration`、`decorationColor`、`topCoat`、`topCoatColor`。旧 `finish` 用于迁移；新光泽和封层优先使用独立字段。封层颜色 `#ffffff` 代表无色，其余为微染。

JSON 保存所有图层和画线，不保存灯光、相机、背景、按住原甲状态或撤销历史。导入限制 5 MB、更新时间会刷新。绘画 UV 的 `y=0` 是甲尖，`y=1` 是甲根。`src/state.ts` 的输入验证拒绝未知字段、访问器、非法颜色、非法选项和过量笔画。若保存到后端，服务器仍应执行自己的校验和容量限制。

## 接入验收

- JS 与 GLB 从部署域名正确加载；加载失败可见，重试和恢复状态正常。
- 6 步骤、8 预设与实际甲面缩略图可用；先整手后单指修改不会误改其余指甲。
- 六种甲型、三个长度从正面、两侧、甲尖和背面查看；没有旧甲穿出或明显开放边。
- 按住对比在松开、失焦和取消触控时恢复设计，不停留在原甲。
- 分层颜色、透感、反光、颗粒与立体装饰有可辨变化；JSON 往返保留所有设置和手绘。
- 技师说明反映当前五指，设计卡包含完整手部预览；预约入口不会误报提交成功。
- 390 px 手机宽度、键盘操作、减少动态效果和卸载释放可用。
- 既有店铺访问权限、预约步骤和数据保存方式不被绕过。

运行 `pnpm test` 和 `pnpm build`，并在目标网站实际测试用户流程。浏览器预览与实体胶色可能有差异，工艺、延长、饰品牢固度、价格和耗时由门店确认。

## 可直接交给 Claude 的任务

> 读取本目录 README、CLAUDE_HANDOFF 和 Tempo 项目的 AGENTS.md，复用 LUNE 1.2.1 Web Component 在 `/{slug}/design` 接入美甲设计。部署 JS 与配套 GLB，指定 model-src，保留店铺访问权限。验证六步骤、八款式真实模型特写、甲型长度、逐指跳色、分层颜色、按住原甲、手绘、JSON 和设计卡。通过可取消 lune:book 接现有预约流程，或设置 booking-url 展示预约链接；不能把本机保存或点击按钮当成预约成功。保留皮肤原纹理，按实际效果说明屏幕色差和延长限制。交付实际改动、验证结果和预览。
