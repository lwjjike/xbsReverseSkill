# reese84

当文件路径、hint 或样本标签明确指向 `reese84` 时，使用这份规则。

识别信号：

- 样本体量大，呈现明显的 VM 风格，并且 dispatcher 残留较重。
- 完成结构性处理后，`inline-literals` 的开销会显著升高。

流水线建议：

- 优先采用 `normalize -> prune -> inline-dispatchers -> flatten -> if-to-switch` 这条顺序。
- 除非在更小的裁剪样本上已经验证安全，否则跳过后置的 `inline-literals`。

当前残留重点：

- 仍然存在的 dispatcher 包装层。
- 相对 `decode.js` 的最终行数差距。
