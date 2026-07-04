# 解决方案手册

这些方案用于授权场景下的验证码识别和验证分析。

## 输出原则

识别到厂商和类型后，按这个顺序给方案：

1. 先给开源/本地方案：能离线处理的优先用 ddddocr、OpenCV、Tesseract、Whisper/faster-whisper、YOLO/CLIP/VLM、规则解析或官方测试环境。
2. 再给通过率不足时的备选：打码平台、人工接管、厂商支持或官方集成诊断。平台只作为用户自行选择的授权 QA 备选，不默认调用。
3. 最后给切换条件：什么时候从开源方案切到平台/人工，什么时候应停在厂商集成诊断。
4. 第二阶段不要无限沿用当前方案：同一授权目标、同一验证码类型、同一用户选择方案连续 5 次失败且没有成功，图片/坐标/轨迹/切片还原/补环境/challenge 新鲜度均无明显异常时，主动建议打码平台作为授权 QA 对照。
5. 真实网页验证前先建立用户手动成功样本基线：同一授权目标至少 5 次成功；如出现动态切题，每个验证码类型至少 2 次成功。基线不足时必须强提示，但用户确认后可继续离线分析或受控验证。

常见备选平台按类型选择：

- 图片文字/计算/坐标/滑块/点选：云码/JFBYM、超级鹰、2Captcha、Anti-Captcha。
- reCAPTCHA/hCaptcha/Turnstile/GeeTest/FunCaptcha/AWS WAF 等 token 或交互任务：2Captcha、CapSolver、CapMonster Cloud、Anti-Captcha、YesCaptcha/NoCaptchaAI。
- Arkose/FunCaptcha 小游戏：2Captcha、CapSolver、Anti-Captcha、NopeCHA，或 人工接管。
- PoW、无感评分、WAF、活体类：优先做官方接入和环境诊断；平台只用于授权对照测试或不建议使用。

## 第二阶段方案切换规则

在用户确认方案并开始授权验证后，按 `references/verification-workflow.md` 记录 attempts JSON，并用 `scripts/evaluate_verification_attempts.py` 判断是否切换：

- 先用 `scripts/evaluate_success_baseline.py` 检查用户手动成功样本；缺少成功基线时，不要把失败原因过早归咎于图片识别、轨迹或平台。
- `slider`、`image-restore/tile-scramble`、`click-select`、`grid`、`rotate`、`token-widget`：满足 5 次失败门槛且诊断均为 `ok` 时，优先推荐平台对照，输出 `recommended_next_route: platform-control`。
- `text`、`math`、`audio`、`qa-logic`：满足 5 次失败门槛且图片/OCR/ASR/题面解析无明显异常时，可切平台或人工复核，用来判断本地识别是否低通过率。
- `drag-drop`、`trace-draw`、`scratch`、`area-select`、`difference-click`、`font-identify`、`semantic-reasoning`、`game-challenge`、`multi-step`：先检查坐标、轨迹、多轮状态和题面变化；诊断均为 `ok` 后再推荐平台/人工接管对照。
- `pow-challenge`、`waf-challenge`、`biometric-liveness`：不默认推荐普通打码平台；优先官方协议、环境诊断、厂商日志、人工复核或厂商支持。
- 若失败不足 5 次、已有成功、或存在明确坐标/轨迹/图片/乱序还原/补环境/challenge 过期问题，先继续当前路线并修复阻塞项。

## 类型方案速查

| 类型 | 开源/本地优先 | 低通过率时备选 | 切换条件 |
| --- | --- | --- | --- |
| `text` | ddddocr、Tesseract、OpenCV 预处理 | 云码/JFBYM、超级鹰、2Captcha ImageToText、Anti-Captcha Image | 扭曲/噪声导致 OCR 不稳定 |
| `math` | OCR + 运算符归一化 + 安全求值 | 云码/JFBYM、超级鹰、2Captcha Normal Captcha | 表达式干扰、中文数字或应用题 |
| `slider` | ddddocr slide-match、OpenCV 匹配、轨迹校准 | 云码/JFBYM、超级鹰、CapSolver、2Captcha GeeTest/slider | 缺口弱、背景乱序、行为评分失败；或 5 次失败且图像/坐标/轨迹/环境均正常 |
| `click-select` | OCR/模板匹配、YOLO、VLM 坐标 | 云码/JFBYM、超级鹰、2Captcha Coordinates、CapSolver ComplexImageTask | 目标重叠、语义复杂、多轮点选；或 5 次失败且识别/坐标/环境均正常 |
| `rotate` | OpenCV 角度估计、特征匹配、VLM | 云码/JFBYM、超级鹰、CapSolver/2Captcha 图片任务 | 对称图、角度映射非线性；或 5 次失败且角度/坐标/轨迹/环境均正常 |
| `grid` | 分格 + 分类模型、YOLO/CLIP/VLM | 2Captcha、CapSolver、CapMonster Cloud、Anti-Captcha、NopeCHA | 多轮、跨格、题面语义复杂；或 5 次失败且格子/坐标/环境均正常 |
| `audio` | faster-whisper/Whisper、降噪、白名单纠错 | 2Captcha Audio、CapMonster/Anti-Captcha 音频或人工任务 | 强噪声、口音、多语言 |
| `drag-drop` | 目标检测/VLM、DOM 坐标、释放点校准 | 云码/JFBYM、超级鹰、CapSolver ComplexImageTask、人工接管 | 吸附/动画/行为评分复杂 |
| `trace-draw` | OpenCV 路径提取、骨架化、点列重采样 | 云码/JFBYM、超级鹰、人工标注 | 路径遮挡、采样格式未知 |
| `scratch` | canvas 区域、覆盖轨迹、状态差分 | 人工接管、云码/JFBYM 定制、超级鹰定制 | 阈值未知、刮开后二次题 |
| `image-restore` | 先判定切片乱序；页面 `tileOrder`/CSS/canvas 还原；OpenCV/Pillow 边缘连续性 | 云码/JFBYM、超级鹰、CapSolver/2Captcha 图片任务 | 重复纹理、随机裁剪、顺序字段加密、参数绑定；或 5 次失败且还原/坐标/轨迹/环境均正常 |
| `area-select` | 检测/分割、SAM/YOLO、VLM 框选 | 云码/JFBYM、超级鹰、CapSolver ComplexImageTask | 边界模糊、多目标、多边形要求 |
| `difference-click` | 图像配准 + 差分、显著性检测、VLM | 云码/JFBYM、超级鹰、人工标注 | 压缩噪声、差异细微 |
| `font-identify` | OCR + 字形特征、模板、VLM | 云码/JFBYM、超级鹰人工/坐标 | 字体相近、缩放抗锯齿 |
| `semantic-reasoning` | 目标检测 + 规则推理、VLM | 云码/JFBYM、超级鹰、CapSolver ComplexImageTask | 关系歧义、遮挡、VLM 低置信度 |
| `game-challenge` | 截图状态识别、VLM 解析、拆子类型 | 2Captcha FunCaptcha、CapSolver、Anti-Captcha、NopeCHA、人工接管 | 3D 连续状态、题目频繁更新 |
| `pow-challenge` | 官方协议、difficulty/nonce/TTL、防重放诊断 | 通常不需要平台；仅授权兼容测试考虑 ALTCHA/PoW 支持 | 服务端签名/绑定异常 |
| `risk-score` | 官方校验日志、action/hostname/score 阈值诊断 | 2Captcha、CapSolver、CapMonster Cloud、Anti-Captcha | 授权 QA 需要 token 对照 |
| `one-click` | 组件状态、callback、人工点击复现 | 2Captcha/CapSolver/CapMonster token 任务、人工接管 | 升级二次挑战或状态不同步 |
| `multi-step` | 逐轮取证，每轮按子类型选择工具 | 按子类型平台，人工接管 | 多轮混合、状态过期 |
| `qa-logic` | 文本解析、规则库、本地 LLM/VLM、人工复核 | 云码/JFBYM、超级鹰、2Captcha Normal Captcha | 题库动态或语义歧义 |
| `biometric-liveness` | 官方 SDK、设备权限、人工审核、可访问性方案 | 不建议平台；合规授权下联系厂商/人工审核 | 隐私合规、误识别、设备兼容 |
| `token-widget` | 官方测试 key、sitekey/action/callback/TTL、服务端日志 | 2Captcha、CapSolver、CapMonster Cloud、Anti-Captcha、YesCaptcha/NoCaptchaAI | 授权 QA 需要 token 对照；或 5 次失败且 sitekey/action/TTL/环境均正常 |
| `waf-challenge` | 真实浏览器取证、WAF 日志、TLS/HTTP/JS 环境诊断 | 厂商支持、人工复核；授权对照谨慎评估平台支持 | 误伤真实用户或环境指纹异常；普通打码平台不是默认路线 |
| `unknown-custom` | 补 HTML/脚本/截图/接口，归入相近类型 | 云码/JFBYM 定制、超级鹰定制、通用图片/坐标任务 | 证据不足或自研混淆 |

## `text`

目标：从文字、数字或字母数字混合图片验证码中识别答案。

方案：

1. 提取精确的验证码图片或元素截图，避免直接使用整页截图。
2. 确认约束：长度、字符集、大小写、刷新行为、答案格式。
3. 优先尝试本地 OCR：
   - ddddocr：适合常见中文网页图片验证码。
   - Tesseract：适合简单数字/字母，可配合白名单。
   - OpenCV：用于降噪、颜色过滤、纠偏、去干扰线等预处理。
4. 本地 OCR 不稳定时，再在用户确认授权范围后考虑 VLM 或云端识别服务。
5. 输出置信度；如果验证码每次尝试都会刷新，要求用户提供新样本复核。

关键风险：字体扭曲、`0/O` 和 `1/I/l` 混淆、彩色背景、服务端图片 token 单次有效。

## `math`

目标：识别并计算简单算术验证码。

方案：

1. 提取图片/文本，先按 `text` 的 OCR 流程识别表达式。
2. 归一化运算符：`x`、`X`、`×` 转为 `*`，`÷` 转为 `/`，中文“加减乘除”转为运算符。
3. 只允许数字、括号和基础运算符进入解析。
4. 安全求值；遇到 OCR 歧义时不要猜测。
5. 同时返回归一化表达式和计算结果。

关键风险：非整数除法、文字应用题、中文数字、`+` 与 `t` 或 `-` 与噪点混淆。

## `slider`

目标：估计滑块目标偏移，并说明授权流程中如何验证。

方案：

1. 判断图片模式：
   - 双图模式：滑块/目标图 + 背景图。
   - 单图模式：一张图内有明显缺口。
   - canvas 模式：背景由 canvas 渲染，可能需要元素截图。
2. 识别偏移：
   - 常见双图任务可尝试 ddddocr `slide-match` 或 `slide-comparison`。
   - 可使用 OpenCV 模板匹配、边缘匹配、差分匹配。
   - 本地匹配失败时，再考虑 VLM 或云端识别。
3. 校准坐标：
   - 图片像素映射到 CSS 像素和轨道像素。
   - 处理 DPR、缩放、裁剪偏移、轨道 padding。
4. 在自有或授权 QA 中，用合理轨迹模型验证拖动行为和产品限制；不要表述成通用绕过。
5. 把厂商 verify 参数和视觉偏移分开。极验、腾讯、易盾、阿里云可能把加密参数绑定到浏览器状态和行为采集。

关键风险：背景乱序/还原、透明滑块块、弱边缘缺口、设备像素比不一致、challenge ID 防重放、加密 `verify` payload。

## `click-select`

目标：识别题面目标，并返回用于分析的点击坐标或目标顺序。

方案：

1. 精确提取题面，尤其是“依次”“从左到右”等顺序词。
2. 文字题用 OCR；物体/图标题用目标检测、模板匹配或 VLM。
3. 尽量同时返回截图像素坐标和元素相对坐标。
4. 判断厂商是否要求有序点击、多轮题面或点击后确认。
5. 中文文字点选必须保留原始字符和目标顺序。

关键风险：字符重叠、干扰文字、动态缩放、多轮刷新、隐藏点击顺序评分。

## `rotate`

目标：估计图片/物体应旋转的角度，并换算成拖动偏移。

方案：

1. 提取图片：单图旋转、内外环、参考图/目标图。
2. 用图像匹配、主方向检测、特征匹配或 VLM 判断角度。
3. 校准角度到移动距离：
   - 确认轨道宽度和角度范围。
   - 处理固定偏移和非线性映射。
   - 在受控测试样本中校准。
4. 返回角度、估计拖动距离和置信度。

关键风险：对称图片、边缘模糊、非线性滑块映射、厂商固定偏移。

## `grid`

目标：分类图片格子，并选择格子编号或中心坐标。

方案：

1. 同时截取完整网格和题面。
2. 分割格子，记录每个格子的边界和中心点。
3. 按题面选择模型：
   - reCAPTCHA/hCaptcha 类题面可能需要专项图片分类模型或 VLM。
   - AWS WAF 网格可能需要 WAF 专项分类。
   - 简单自研九宫格可用模板或目标匹配。
4. 返回选中格子编号和中心坐标，并给出每格置信度。
5. 预期多轮题面和题目变化。

关键风险：目标跨格、低分辨率裁剪、题面歧义、多轮验证。

## `audio`

目标：识别网页音频验证码中的数字、字符或短语。

方案：

1. 提取音频资源或播放接口，确认语言、长度、答案格式和是否有视觉替代方案。
2. 先做降噪、音量归一化和静音裁剪。
3. 数字/字母类题目使用 ASR 后加字符集和长度约束。
4. 噪声强、口音明显或多语言时，使用人工复核或授权范围内的云端语音识别。
5. 不处理短信、电话、语音 OTP 或 MFA 场景。

关键风险：背景噪声、重叠语音、动态音频一次性有效、语言识别错误。

## `drag-drop`

目标：定位被拖动对象和目标区域，并说明拖放验证分析路径。

方案：

1. 提取完整挑战截图，标注拖动元素、目标区域和容器边界。
2. 用模板匹配、目标检测或 VLM 识别源对象和目标区域。
3. 校准截图像素到 DOM/CSS 坐标，记录 DPR、缩放和滚动偏移。
4. 在授权 QA 中分析拖放路径、释放点、停顿和吸附规则。
5. 如果题目本质是水平拼图缺口，改归类为 `slider` 或 `image-restore`。

关键风险：目标区域不明显、拖放吸附、元素动画、释放点容错半径不明。

## `trace-draw`

目标：提取目标轨迹，并转换为可分析的点列。

方案：

1. 获取题面截图、canvas 尺寸和目标路径。
2. 用边缘/颜色分割、骨架化或模板匹配提取路径。
3. 将路径重采样为厂商接受的点列格式，记录时间间隔和坐标系。
4. 对授权测试样本做轨迹平滑、速度和采样密度校准。
5. 百度等轨迹绘制形态要单独标注，不要混入普通滑块。

关键风险：路径被遮挡、抗锯齿导致边缘不稳定、轨迹采样格式绑定浏览器状态。

## `scratch`

目标：分析刮刮卡验证的区域覆盖和状态变化。

方案：

1. 记录刮开前后截图、canvas 区域和可操作边界。
2. 判断通过条件是覆盖比例、轨迹形态还是隐藏内容识别。
3. 在授权 QA 中用规则化轨迹覆盖目标区域，并观察状态字段变化。
4. 如果刮开后还要识别文字/图像，继续转入对应子类型。

关键风险：覆盖阈值不明、canvas 状态不可直接读取、移动端触摸事件差异。

## `image-restore`

目标：还原乱序图片、复原拼图或估计滑动还原偏移。

方案：

1. 提取分块图片、块边界、目标区域和交互方式。
2. 先判断是否为 `tile-scramble`：图片被切片/分块后顺序打乱，常见线索是 `tileOrder`、`pieceOrder`、`sliceOrder`、`background-position`、sprite、canvas `drawImage`、`shuffle` 或 `scramble`。
3. 优先走页面逻辑还原：
   - 从接口字段或 JS 数组读取每个目标位置对应的来源切片。
   - 从 CSS `background-position` 反推出 sprite 来源块。
   - 从 canvas `drawImage(sx, sy, sw, sh, dx, dy, dw, dh)` 反推出源块到目标块的映射。
   - 可用 `scripts/analyze_tile_restore.py` 输出 `order_source_by_target` 和还原图。
4. 页面逻辑缺失时，再走图片匹配：
   - 按 `rows/cols` 或块宽高切片。
   - 用左右/上下边缘连续性、颜色/纹理连续性、特征点匹配或 VLM 判断候选排列。
   - 输出候选顺序、置信度和低置信度原因。
5. 将目标排列转换为拖动、交换或滑动偏移；滑动还原类任务还要校准轨道长度、DPR 和固定偏移。
6. 标明它和普通 `slider` 的区别：目标是复原完整图片或分块顺序，而不只是找到缺口。

关键风险：重复纹理、纯色块、随机裁剪、分块顺序加密、视觉复原与提交参数分离。低置信度时切换人工复核、云码/JFBYM、超级鹰、CapSolver/2Captcha 图片任务或厂商授权测试环境。

## `area-select`

目标：识别并返回需要选择的区域。

方案：

1. 精确提取完整题面和图片区域。
2. 用目标检测、图像分割、OCR 或 VLM 找到目标区域。
3. 返回矩形、多边形或中心点集合，并说明坐标原点。
4. 如果产品只接受单点点击，转为 `click-select`；如果接受框选面积，保持 `area-select`。

关键风险：边界模糊、多个候选区域、坐标缩放、区域选择格式不一致。

## `difference-click`

目标：找出差异点并输出点击坐标。

方案：

1. 获取两张对比图或完整挑战截图。
2. 做图像配准，消除缩放、平移和压缩差异。
3. 用差分、显著性检测或 VLM 找出候选差异点。
4. 输出点击点、差异描述和置信度。
5. 多个差异点时记录点击次数和顺序要求。

关键风险：压缩噪声、细微差异、动态背景、差异点跨元素边界。

## `font-identify`

目标：按字体或字形规则选择目标。

方案：

1. 提取题面和候选文字截图。
2. 先 OCR 出文字内容，再用字形特征或视觉模型判断字体关系。
3. 区分“相同字体”“不同字体”“指定字体”三种题面。
4. 输出目标文字、坐标和字体判断理由。

关键风险：文字内容识别正确但字体判断错误、缩放抗锯齿、字体样式相近。

## `semantic-reasoning`

目标：理解题面中的空间/语义关系并返回目标坐标。

方案：

1. 保留题面原文，尤其是最左、最大、相邻、遮挡、上下关系等关键词。
2. 用目标检测或 VLM 识别候选目标。
3. 对候选目标做关系推理，输出选择理由、坐标和置信度。
4. 题面歧义时要求人工确认，不要猜测。

关键风险：关系词歧义、目标遮挡、截图裁剪、模型幻觉。

## `game-challenge`

目标：识别小游戏/3D/FunCaptcha 类交互题的题面和状态。

方案：

1. 记录厂商、public key/challenge id、题面和初始截图/帧。
2. 判断交互目标：旋转、选择、对齐、计数或多状态操作。
3. 优先做人工接管或授权 QA 中的模型辅助分析。
4. 如能拆成更具体的子类型，报告中同时标注子类型。
5. 不提供未授权自动通关脚本。

关键风险：题目状态连续变化、3D 渲染差异、服务端行为评分、挑战频繁更新。

## `pow-challenge`

目标：识别工作量证明类验证码/组件，并解释计算与校验约束。

方案：

1. 识别 FriendlyCaptcha、ALTCHA、Private Captcha、Cap.js、mCaptcha 等组件线索。
2. 提取非秘密字段：challenge、payload、difficulty、nonce、salt、signature、endpoint。
3. 区分前端计算结果、服务端签名校验和业务动作校验。
4. 对自有系统，建议按官方协议检查难度、TTL、防重放和失败重试。
5. 不把 PoW 组件当成 OCR 或图片验证码。

关键风险：计算结果短期有效、payload 绑定页面/session、难度动态变化、防重放。

## `risk-score`

目标：分析无感、无痕、隐形或风险评分验证。

方案：

1. 识别 sitekey、action、页面 URL、厂商脚本和 callback。
2. 获取服务端校验结果中的 score、risk level、action/hostname 是否匹配。
3. 了解失败路径：直接拒绝、升级一键、升级滑块/点选或人工复核。
4. 对自有系统，建议调整阈值前先对照业务日志和误伤样本。
5. 不把低分自动规避写成解决方案。

关键风险：score 不稳定、action 不匹配、hostname/session/IP 绑定、误伤真实用户。

## `one-click`

目标：识别一键、checkbox、点击或按住类验证。

方案：

1. 提取组件 HTML、按钮状态、callback 和 response 字段。
2. 判断它是最终验证，还是触发后升级到滑块、点选、网格等二次挑战。
3. 授权 QA 中记录点击/按住时长、状态变化和错误文案。
4. 普通表单 checkbox 不归类为验证码，除非存在 captcha/verify/challenge 或厂商证据。

关键风险：二次挑战、行为评分、无障碍模式差异、组件状态和服务端校验不同步。

## `multi-step`

目标：记录多轮、多步或分页挑战流程。

方案：

1. 对每轮单独保存题面、截图、接口状态和结果。
2. 每轮优先标注具体子类型，例如 `grid`、`click-select` 或 `game-challenge`。
3. 记录轮次间的 challenge id、状态字段和刷新规则。
4. 输出最终流程图式总结，而不是只给最后一轮结果。

关键风险：上一轮结果影响下一轮、状态过期、多轮截图混淆、局部成功被误判为完成。

## `qa-logic`

目标：解析问答或逻辑题验证码。

方案：

1. 保留问题原文和答案格式。
2. 简单算术转入 `math`；常识/逻辑问题保持 `qa-logic`。
3. 用文本解析、规则库或人工复核得到答案。
4. 动态题库或语义模糊时输出低置信度。

关键风险：语言歧义、题库动态变化、看似常识但依赖上下文。

## `biometric-liveness`

目标：识别活体、人脸或生物识别验证并给出合规建议。

方案：

1. 识别 SDK/厂商标识、动作要求和业务场景。
2. 检查用户是否在自有系统或明确授权范围内分析。
3. 给出接入诊断、可访问性替代、人工复核和隐私合规建议。
4. 不提供绕过、伪造、替身或未授权自动化方案。

关键风险：隐私合规、误识别、设备权限、不可逆生物特征处理。

## `token-widget`

目标：识别组件参数，并解释 token 校验约束。

方案：

1. 识别厂商脚本/iframe 和产品模式。
2. 提取非秘密参数：`sitekey`、页面 URL、`action`、callback 名、enterprise 标记、`cdata`、`rqdata`，或 Arkose public key/blob、Yandex SmartCaptcha、CaptchaFox、Procaptcha、TrustCaptcha、Private Captcha、Cap.js、mCaptcha 等组件配置存在性。
3. 只作为可选方案说明 solver 类别，不默认执行：
   - 2Captcha、CapSolver、CapMonster、Anti-Captcha 风格 token 服务。
   - QA 场景中可暂停人工验证的浏览器自动化框架。
   - 自有系统按官方文档做服务端校验。
4. 记录 TTL 和绑定限制：
   - token 通常短期有效且单次使用。
   - 服务端可能校验 action、hostname、IP/session、score、浏览器状态。
   - callback 和隐藏 response 字段因厂商而异。
5. 不注入 token，不操作受保护账号流程。

关键风险：token 过期、action/page URL 不匹配、enterprise payload 不匹配、score 过低、callback 未触发、服务端 hostname/action 校验失败。

## `waf-challenge`

目标：识别反自动化/WAF 产品，并给出诊断建议。

方案：

1. 从响应头、cookie、脚本 URL、状态码和页面文案识别产品，例如 Cloudflare WAF、AWS WAF、DataDome、Akamai、Imperva/Incapsula、PerimeterX/HUMAN、Kasada、Netacea、Radware 或 F5。
2. 区分可见验证码和更大的 WAF 流程。图片题可能只是环境验证的一部分。
3. 诊断证据：
   - 浏览器特性支持和 JS 运行错误。
   - cookie/token 绑定。
   - TLS/HTTP 指纹一致性。
   - IP 信誉、频率限制、session 粘性。
   - 资源被拦截或 challenge JS 过期。
4. 对自有或授权系统，建议用干净浏览器复现、对比 accepted/rejected session，并检查服务端日志。
5. 对未授权第三方目标，只做产品识别和高层诊断建议。

关键风险：clearance cookie 绑定、PoW 防重放、动态 JS 过期、误以为 OCR 能解决完整挑战。

## `unknown-custom`

目标：收集足够证据，判断自研或未知挑战。

方案：

1. 要求用户提供组件附近 HTML、脚本 URL、可见文案、截图和网络接口名。
2. 用 `provider-products.md` 排除已知厂商。
3. 如果可能，把可见交互先归到标准类型之一。
4. 如果该模式会重复出现，可补充信号并运行 `scripts/classify_verify.py` 建立小型测试夹具。

关键风险：只凭一张截图过拟合、动态加载的厂商 JS 被漏掉、原始 HAR/cookie 中的会话材料影响判断。
