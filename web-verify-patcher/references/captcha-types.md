# 验证码类型

在 `scripts/classify_verify.py` 给出初步类型后读取本文件。这里整理的是判断依据、证据需求和方案方向，不包含未授权求解或自动提交步骤。

## 判断表

| 类型 | 主要信号 | 有用证据 | 应向用户输出 |
| --- | --- | --- | --- |
| `text` | “输入验证码”、验证码输入框旁的图片、短位数扭曲字符、`ImageToText` | 验证码图片 URL 或元素截图、字符集、刷新逻辑 | OCR/预处理方案、字符集约束、置信度风险 |
| `math` | “计算结果”、算术表达式、`1+2`、`7 x 8`、算术验证码 | 图片/文本表达式、答案格式、运算符集合 | OCR 后解析表达式的方案、歧义处理 |
| `slider` | “拖动滑块”“拼图”“缺口”、滑块手柄、背景图/滑块图 | 背景图、滑块图、canvas 状态、坐标系、轨道宽度 | 缺口/偏移识别方案、坐标校准、行为验证注意点 |
| `click-select` | “依次点击”“点击文字”、英文 click/select/tap、词语或物体提示 | 题面文本、截图、目标坐标、坐标原点 | 题面识别和坐标返回方案 |
| `rotate` | “旋转”“拖动使图片正向”、角度、旋转手柄 | 挑战图片、轨道宽度、角度范围、拖动映射 | 角度识别和偏移换算方案 |
| `grid` | “九宫格”“选择所有”、3x3 图片网格、红绿灯/斑马线/自行车等提示 | 完整网格截图、题面、格子边界、多轮状态 | 目标分类和格子编号/坐标方案 |
| `audio` | “语音验证码”“音频验证码”、听音输入、播放按钮或音频资源 | 音频文件/播放接口、题面、答案格式、视觉替代方案 | 音频转写、数字/字符约束、可访问性替代 |
| `drag-drop` | “拖放”“拖到目标区域”、draggable/droppable/dropzone | 被拖动元素、目标区域、坐标系、释放判定 | 目标定位、拖放路径、释放点校准 |
| `trace-draw` | “轨迹绘制”“连线”“画线”、draw/trace/connect dots | 目标路径截图、canvas 尺寸、采样点格式 | 路径提取、采样重建、轨迹格式分析 |
| `scratch` | “刮刮卡”“刮开”、scratch card | 刮开前后状态、刮动区域、通过阈值 | 覆盖比例、轨迹采样、状态变化分析 |
| `image-restore` | “图像复原”“图片还原”“乱序拼图”“滑动还原”“切片乱序”“分块乱序”“瓦片重排” | 分块图片、块边界、目标排列、`tileOrder`/`pieceOrder`、CSS/canvas 切片线索、滑动/拖动映射 | 先判定是否为 `tile-scramble`，再做页面顺序还原或图像边缘匹配 |
| `area-select` | “面积验证”“框选”“圈出”“选择区域” | 完整题面截图、区域边界、坐标原点 | 目标分割、边界框/多边形坐标输出 |
| `difference-click` | “找不同”“找茬”“点击差异” | 两张对比图、差异点、点击次数 | 图像差分、差异定位、点击坐标 |
| `font-identify` | “字体识别”“同字体”“不同字体” | 候选文字截图、目标字体规则、顺序要求 | OCR + 字形特征/视觉模型识别 |
| `semantic-reasoning` | “空间语义”“语义推理”、最左/最大/相邻等关系 | 题面、完整截图、目标关系、坐标系 | VLM/检测模型做关系推理并返回坐标 |
| `game-challenge` | “小游戏”“3D”“骰子”、Arkose/FunCaptcha Enforcement | 截图/帧、题面、交互控件、challenge id | 题面理解、状态识别、授权场景人工/模型辅助 |
| `pow-challenge` | proof-of-work、工作量证明、nonce/difficulty/solution、ALTCHA/FriendlyCaptcha/Cap.js/mCaptcha | 组件脚本、challenge/payload、difficulty、校验接口 | 识别计算挑战与校验字段，不把它当图片题 |
| `risk-score` | “无感”“无痕”“风险评分”“invisible”“score”、reCAPTCHA v3 | sitekey/action、评分阈值、服务端校验结果 | 参数识别、评分/阈值解释、集成诊断 |
| `one-click` | “一键验证”“checkbox”“press and hold”“点击完成验证” | 组件 HTML、按钮状态、callback、是否二次挑战 | 组件状态分析、失败时转入具体子类型 |
| `multi-step` | “多轮”“下一题”“continue verification”、分页挑战 | 每轮截图、轮次状态、上一轮结果、最终成功标记 | 逐轮记录，优先标注每轮具体子类型 |
| `qa-logic` | “问答验证码”“回答问题”“logic captcha” | 问题原文、答案格式、语言/知识范围 | 问题解析、确定性回答或人工复核 |
| `biometric-liveness` | “活体检测”“人脸验证”“biometric/liveness” | SDK 标识、动作要求、授权/隐私说明 | 仅做产品识别、合规接入和人工复核建议 |
| `token-widget` | `sitekey`、`pageurl`、`action`、`cdata`、iframe 组件、checkbox、invisible/managed 模式 | 脚本/iframe URL、sitekey、action、callback、页面 URL | 组件参数分析、token TTL、callback 和服务端校验注意点 |
| `waf-challenge` | “Just a moment”、WAF token/cookie、PoW、sensor data、`cf_clearance`、`aws-waf-token`、`datadome`、`_abck`、`bm_sz`、`reese84`、`px-captcha`、`x-kpsdk`、`TSPD` | 响应头、challenge HTML、JS URL、cookie 名、状态码 | 反自动化产品识别和环境诊断方案 |
| `unknown-custom` | 自研 canvas、无品牌混淆 JS、证据不足 | HTML、截图、脚本、网络接口名 | 请求补充证据并建立自定义分类 |

## 类型说明

### `text`

把文字验证码当作图片识别问题处理。常规流程是：

1. 定位精确的验证码图片或元素截图。
2. 必要时做预处理：灰度化、二值化、降噪、纠偏、颜色过滤、去边框。
3. 字符集简单时优先用本地 OCR：ddddocr、Tesseract 或小型自定义模型。
4. 站点只接受数字、大写字母或固定长度时，加上字符集/长度约束。
5. 本地 OCR 不稳定或题面包含语义要求时，再考虑 VLM 或云端识别，并先确认授权范围。

需要向用户追问目标字符集、期望长度、刷新接口，以及图片是否随 session 或每次尝试重新生成。

### `math`

可见题面要求计算表达式结果时，分类为 `math`。OCR 只是第一步，还要归一化运算符：`x`、`X`、`×`、`*`，以及 `÷`、`/`，再做安全解析和求值。

如果图片使用中文数字、噪声明显、竖排布局，或是文字应用题而不是简单表达式，要降低置信度。

### `slider`

用户需要拖动手柄、拼图块或轨道时，分类为 `slider`。分析时拆成四层：

- 图片识别：从背景图和滑块图中识别缺口/目标偏移。
- 坐标校准：把图片像素映射到 DOM/CSS 像素和滑块轨道像素。
- 行为验证：在授权 QA 场景里检查时间、速度和移动曲线是否符合产品限制。
- 参数分析：把视觉偏移和厂商加密/绑定参数分开处理。

优先向用户索要背景图和滑块图。如果只有一张合成图，要判断是单图边缘/对比任务，还是 canvas 渲染的拼图。

### `click-select`

题面要求点击文字、图标、物体或坐标，尤其包含顺序要求时，分类为 `click-select`。方案需要：

- 提取题面：点击什么、按什么顺序点击。
- 识别目标：OCR、目标检测、模板匹配或 VLM。
- 坐标换算：截图像素到浏览器元素坐标。
- 多轮复核：部分厂商会在局部成功后刷新新题。

中文“文字点选”必须保留原始汉字和目标顺序。

### `rotate`

题面要求把图片/物体旋转到正确方向时，分类为 `rotate`。方案需要：

- 通过图像匹配、边缘方向、物体正向判断或 VLM 估计角度。
- 把角度换算为拖动距离或滑块位置。
- 做固定偏移校准，因为很多产品存在非线性映射或厂商特定偏移。

需要向用户索要轨道宽度、角度范围和初始角度信息。

### `grid`

固定格子、多数为 3x3 的图片选择任务，分类为 `grid`。方案需要：

- 解析题面。
- 对每个格子做目标/类别识别。
- 输出格子编号或中心坐标。
- 预期多轮验证，因为 reCAPTCHA、hCaptcha、AWS WAF 可能连续出题。

对 reCAPTCHA/hCaptcha，不要假设一轮网格选择就结束；只在授权测试中确认 response token 或 UI 成功状态。

### `audio`

页面要求播放音频并输入听到的数字、字符或短语时，分类为 `audio`。不要把短信、电话或语音 OTP 当作音频验证码；那类属于账号/MFA 边界。

分析时需要音频文件、播放接口、题面语言和答案格式。方案通常是音频转写、数字/字符白名单、噪声过滤和人工复核；如果站点提供视觉替代题，也要同时记录。

### `drag-drop`

拖动物体、图形、卡片或图片到指定目标区域时，分类为 `drag-drop`。它和 `slider` 的区别是目标不是单一水平滑块缺口，而是“元素到区域”的拖放关系。

需要记录被拖动元素边界、目标区域边界、释放点、缩放/DPR 和是否存在吸附或容错半径。

### `trace-draw`

题面要求沿路径画线、连线、描轨迹或完成轨迹绘制时，分类为 `trace-draw`。百度等产品会把轨迹绘制作为独立形态。

需要画布尺寸、路径参考图、采样点格式和提交字段。方案重点是路径提取、点列重采样、速度/间隔记录和坐标归一化。

### `scratch`

刮刮卡式验证要求用户用鼠标/触摸“刮开”指定区域，分类为 `scratch`。它通常不是识别答案，而是检测覆盖比例、轨迹和状态变化。

需要刮开前后截图、canvas 区域、通过阈值和轨迹采样格式。报告里不要把它简化为普通滑块。

### `image-restore`

图片/图像复原、乱序拼图、滑动还原或分块重排，分类为 `image-restore`。阿里云 2.0、顶象等产品可能出现这类形态。

需要原始分块、目标排列线索、分块边界和拖动/滑动映射。方案可以是边缘连续性匹配、特征点匹配、模板匹配或 VLM 辅助判断。

如果验证码是一整张图被切成多个块后顺序打乱，保持 `captcha_type: image-restore`，并补充 `captcha_variant: tile-scramble`。处理顺序必须是：

1. 先判断是否存在切片乱序信号：`tileOrder`、`pieceOrder`、`sliceOrder`、CSS `background-position`/sprite、canvas `drawImage`、`shuffle`/`scramble`、或截图中可见规则网格切片。
2. 优先从页面逻辑还原顺序：接口字段、JS 数组、DOM 顺序、CSS 背景定位、canvas 源/目标坐标通常比纯视觉更可靠。
3. 页面逻辑不足时，再用图片方法：按行列切片，比较左右/上下边缘连续性、颜色/纹理连续性、特征点匹配，输出候选顺序和置信度。
4. 重复纹理、纯色块、随机裁剪或顺序字段加密时，降低置信度并建议人工/平台复核。

边界判断：

- 普通 `slider` 重点是找缺口或滑块目标偏移；`tile-scramble` 的目标是还原整张图或分块顺序。
- 普通 `grid` 是按题面选择格子；`tile-scramble` 是把格子重新排列成完整图片，不是选择红绿灯/自行车等类别。
- 如果需要拖动滑块才能触发还原，报告里同时记录滑动映射，但主类型仍按最终目标归为 `image-restore`。

### `area-select`

题面要求框选、圈选或选择图片中某个区域时，分类为 `area-select`。它和点选不同，输出通常是矩形、多边形或面积范围，而不是单点。

需要完整截图、题面、坐标原点和目标区域规则。方案以目标检测/分割、边界框返回和多边形坐标为主。

### `difference-click`

找不同、找茬或点击差异点，分类为 `difference-click`。这类题通常需要比较两张图或同一图中的局部差异。

需要两张对比图、点击次数和差异点坐标。方案可用图像配准、差分、显著性检测和人工/VLM 复核。

### `font-identify`

题面要求选择相同字体、不同字体或指定字体样式时，分类为 `font-identify`。不要只按文字内容做 OCR，因为关键在字形。

需要候选文字截图、目标字体规则和点击顺序。方案是 OCR 识别字符内容，再做字形特征、模板或视觉模型判断。

### `semantic-reasoning`

空间语义或视觉关系题要求理解“最左”“最大”“相邻”“被遮挡”等关系，分类为 `semantic-reasoning`。

需要题面原文、完整截图和坐标系。方案以目标检测 + 关系推理或 VLM 为主，并输出理由、坐标和置信度。

### `game-challenge`

小游戏、3D、骰子或 Arkose/FunCaptcha Enforcement 类交互题，分类为 `game-challenge`。这类题经常是多状态交互，不能只靠一次 OCR。

需要题面、初始截图/帧、交互控件、厂商 public key 或 challenge id。方案应说明状态识别、题面理解、人工接管或授权测试中的模型辅助，不给未授权自动通关步骤。

### `pow-challenge`

工作量证明、哈希难题、浏览器计算挑战，分类为 `pow-challenge`。FriendlyCaptcha、ALTCHA、Private Captcha、Cap.js、mCaptcha 等通常属于这个方向。

需要组件脚本、challenge/payload、difficulty、nonce/solution 字段和服务端校验接口。重点是说明这是计算挑战和服务端校验，不是图片识别题。

### `risk-score`

无感、无痕、隐形或风险评分验证，分类为 `risk-score`。典型例子包括 reCAPTCHA v3 或国内厂商的智能无感模式。

需要 sitekey、action、页面 URL、评分阈值、服务端校验结果和失败时是否升级到可见挑战。方案是集成诊断、评分解释、阈值/动作绑定检查。

### `one-click`

一键验证、checkbox、点击/按住完成验证，分类为 `one-click`。如果点击后升级为滑块、点选、九宫格等，应把升级后的具体类型作为主类型或补充类型记录。

需要组件 HTML、按钮状态、callback、二次挑战状态。注意普通表单 checkbox 不是验证码，必须有 captcha/verify/challenge 或厂商证据。

### `multi-step`

多轮、多步或分页挑战，分类为 `multi-step`。它常常是元流程；如果每轮都有具体形态，应优先输出具体子类型，并在报告中说明多轮状态。

需要每轮截图、轮次编号、上一轮结果和最终成功标记。方案是逐轮取证，而不是只保存最后一帧。

### `qa-logic`

问答、逻辑题或安全问题式验证码，分类为 `qa-logic`。简单算术仍优先归到 `math`。

需要问题原文、答案格式和语言范围。方案是文本解析、确定性知识回答或人工复核；动态题库要降低置信度。

### `biometric-liveness`

活体、人脸或生物识别验证，分类为 `biometric-liveness`。这通常涉及隐私和合规，不应提供绕过、伪造或未授权自动化方案。

报告只做产品/类型识别、授权接入检查、可访问性方案、人工复核和隐私合规建议。

### `token-widget`

出现 sitekey 型组件但当前没有具体图片题时，分类为 `token-widget`。记录：

- 厂商脚本和 iframe URL。
- `sitekey`、`action`、`cdata`、`rqdata`、`s` 或 enterprise payload 线索。
- callback 名和隐藏 response 字段。
- 页面 URL 和 token 有效期。

报告中要说明服务端校验和绑定检查决定最终是否有效；看到 token 不等于业务动作一定会被接受。

### `waf-challenge`

Cloudflare challenge page、AWS WAF、DataDome、Akamai/Imperva/PerimeterX/Kasada 类流程、PoW 挑战等，分类为 `waf-challenge`。这不是普通图片验证码。

重点放在产品识别、环境诊断、浏览器/TLS/cookie 绑定，以及用户是否拥有或被授权测试目标系统。
