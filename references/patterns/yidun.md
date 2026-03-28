# 网易易盾

当样本属于网易易盾时，使用这份规则。

识别信号：

- 通用 dispatcher 处理之后，wrapper 仍然比较密集。
- 做一轮字面量传播通常仍然有帮助，而且不至于把文件推向病态体积。

流水线建议：

- 让 dispatcher 适配器尽量贴近 `inline-dispatchers` 这一步。
- 允许执行一轮 `inline-literals`，但不要盲目重复。

当前残留重点：

- 相对 `decode.js` 的 dispatcher 包装层数量差距。
- 主平坦化已经消除后，仍然存在的少量结构差距。
