# 同花顺

当样本属于同花顺，或属于相关的 split-order wrapper 家族时，使用这份规则。

识别信号：

- 残留的 `split('|')` 顺序字符串会驱动 `loop/switch` 平坦化。
- 在抵达真正的顺序字符串之前，包装对象还会层层指向其他包装对象。

流水线建议：

- 在 `flatten-array-control-flow.js` 之前插入专门的顺序源适配器。
- 不要默认把 `inline-literals` 当成这里的瓶颈解法。

当前残留重点：

- 尚未解开的 `split('|')` 顺序数组。
- 由多层包装对象驱动的剩余 `loop/switch` 代码块。
