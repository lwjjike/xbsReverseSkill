# 模式分层

将这个 skill 保持为三层结构：

1. 通用变换层
   只处理稳定、低风险、能跨多个样本复用的改写。
2. 检测与流水线选择层
   先命中混淆家族或站点，再决定步骤顺序。
3. 家族或站点适配层
   当某种残留可以稳定复现，但又不适合泛化时，新增窄范围脚本和配套规则文档。

新增一个适配器时，要一起更新这些位置：

- `references/patterns/<pattern>.md`
- `scripts/patterns/<pattern>.js`
- `scripts/pipeline-config.js`
- `scripts/detect-patterns.js` 对应的配置命中项

除非某条规则已经在多个无关样本中重复出现，而且安全边界依然清晰，否则不要把站点规则回灌进通用脚本。
