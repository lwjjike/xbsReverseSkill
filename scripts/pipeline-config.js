const path = require("path");

function step(id, script, options = {}) {
  return {
    id,
    script,
    timeoutMs: 120000,
    ...options
  };
}

const STEP_LIBRARY = {
  normalize: step("normalize", "normalize-structure.js", { timeoutMs: 60000 }),
  prune: step("prune", "prune-fake-branches.js", { timeoutMs: 60000 }),
  inlineDispatchers: step("inline_dispatchers", "inline-dispatchers.js", { timeoutMs: 120000 }),
  flatten: step("flatten", "flatten-array-control-flow.js", { timeoutMs: 180000 }),
  ifToSwitch: step("if_to_switch", "if-chain-to-switch.js", { timeoutMs: 90000 }),
  inlineLiterals: step("inline_literals", "inline-literals.js", { timeoutMs: 90000 }),
  rename: step("rename_identifiers", "rename-identifiers.js", { timeoutMs: 120000 }),
  reese84HeavyPass: step("reese84_heavy_pass", "patterns/reese84-heavy-pass.js", { timeoutMs: 30000 }),
  dingxiangArrayPass: step("dingxiang_array_pass", "patterns/dingxiang-array-pass.js", { timeoutMs: 30000 }),
  geetest4GuardedPass: step("geetest4_guarded_pass", "patterns/geetest4-guarded-pass.js", { timeoutMs: 30000 }),
  tonghuashunOrderPass: step("tonghuashun_order_pass", "patterns/tonghuashun-order-pass.js", { timeoutMs: 30000 }),
  yidunDispatcherPass: step("yidun_dispatcher_pass", "patterns/yidun-dispatcher-pass.js", { timeoutMs: 30000 }),
  xiaohongshuWrapperPass: step("xiaohongshu_wrapper_pass", "patterns/xiaohongshu-wrapper-pass.js", { timeoutMs: 30000 }),
  obVariantPass: step("ob_variant_pass", "patterns/ob-variant-pass.js", { timeoutMs: 360000 })
};

const BASE_PIPELINE = [
  STEP_LIBRARY.normalize,
  STEP_LIBRARY.prune,
  STEP_LIBRARY.inlineDispatchers,
  STEP_LIBRARY.flatten,
  STEP_LIBRARY.ifToSwitch,
  STEP_LIBRARY.prune,
  STEP_LIBRARY.normalize
];

const PATTERNS = [
  {
    id: "generic",
    displayName: "generic layered pipeline",
    reference: null,
    hintTokens: [],
    contentRegexes: [],
    families: ["generic"],
    notes: [
      "Use only the generic passes.",
      "Escalate to a site adapter when residue is stable and reproducible."
    ],
    steps: BASE_PIPELINE
  },
  {
    id: "reese84",
    displayName: "reese84",
    reference: "references/patterns/reese84.md",
    hintTokens: ["reese84"],
    contentRegexes: [/reese84/i],
    families: ["vm-heavy", "dispatcher-heavy"],
    notes: [
      "Skip late inline-literals by default because large reese84 samples can stall there.",
      "Prefer comparing dispatcher residue and flattened handlers against the reference decode."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.reese84HeavyPass,
      STEP_LIBRARY.rename
    ]
  },
  {
    id: "dingxiang",
    displayName: "dingxiang",
    reference: "references/patterns/dingxiang.md",
    hintTokens: ["\u9876\u8c61", "dingxiang", "dx"],
    contentRegexes: [/dingxiang/i],
    families: ["param-array", "dispatcher-heavy"],
    notes: [
      "Resolve IIFE parameter backed arrays before judging the flattener result.",
      "Do not force a second inline-literals pass unless the file stays small."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.dingxiangArrayPass,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.normalize
    ]
  },
  {
    id: "geetest4",
    displayName: "geetest4",
    reference: "references/patterns/geetest4.md",
    hintTokens: ["\u6781\u9a8c4", "geetest4", "geetest"],
    contentRegexes: [/geetest/i],
    families: ["guarded-switch", "vm-heavy"],
    notes: [
      "Keep the guarded-if adapter outside the generic flattener unless the pattern becomes broadly reusable.",
      "Current focus is reducing direct loop-switch residue before touching naming."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.geetest4GuardedPass,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.normalize
    ]
  },
  {
    id: "tonghuashun",
    displayName: "tonghuashun",
    reference: "references/patterns/tonghuashun.md",
    hintTokens: ["\u540c\u82b1\u987a", "tonghuashun", "10jqka"],
    contentRegexes: [/10jqka/i, /split\(\s*["']\|["']\s*\)/],
    families: ["split-order-source", "dispatcher-wrapper"],
    notes: [
      "Add order-source adapters around nested wrapper objects instead of bloating the generic flattener.",
      "This pipeline intentionally skips inline-literals because it is not the main blocker here."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.tonghuashunOrderPass,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.normalize
    ]
  },
  {
    id: "yidun",
    displayName: "yidun",
    reference: "references/patterns/yidun.md",
    hintTokens: ["\u7f51\u6613\u6613\u76fe", "yidun", "163"],
    contentRegexes: [/yidun/i],
    families: ["dispatcher-heavy"],
    notes: [
      "One inline-literals pass can still help here, but keep it early enough to avoid blowups.",
      "Compare remaining dispatcher wrappers against the reference decode."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.yidunDispatcherPass,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.inlineLiterals,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.rename
    ]
  },
  {
    id: "xiaohongshu",
    displayName: "xiaohongshu",
    reference: "references/patterns/xiaohongshu.md",
    hintTokens: ["\u5c0f\u7ea2\u4e66", "xiaohongshu", "xhs"],
    contentRegexes: [/xiaohongshu/i, /\bxhs\b/i],
    families: ["wrapper-light"],
    notes: [
      "Treat this as a lighter wrapper cleanup path.",
      "Prefer readability and structural cleanup over aggressive evaluation."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.xiaohongshuWrapperPass,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.xiaohongshuWrapperPass,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.rename
    ]
  },
  {
    id: "cn-bidding-ob",
    displayName: "cn-bidding-ob",
    reference: "references/patterns/cn-bidding-ob.md",
    hintTokens: ["\u4e2d\u56fd\u62db\u6807\u6295\u6807\u516c\u5171\u670d\u52a1\u5e73\u53f0", "\u62db\u6807\u6295\u6807", "ob"],
    contentRegexes: [/\b_0x[a-f0-9]+\b/i],
    families: ["ob-variant"],
    notes: [
      "Keep OB-family tweaks in a dedicated adapter so the common pipeline stays conservative.",
      "Track remaining loop-switch residue after the OB adapter stage."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.obVariantPass,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.obVariantPass,
      STEP_LIBRARY.normalize
    ]
  },
  {
    id: "mps-ob",
    displayName: "mps-ob",
    reference: "references/patterns/mps-ob.md",
    hintTokens: ["\u4e2d\u534e\u4eba\u6c11\u5171\u548c\u56fd\u516c\u5b89\u90e8", "\u516c\u5b89\u90e8", "mps", "ob"],
    contentRegexes: [/\b_0x[a-f0-9]+\b/i],
    families: ["ob-variant"],
    notes: [
      "Share the OB-family adapter but keep a separate rule document because the residue profile is different from the bidding sample.",
      "Compare remaining loop-switch blocks directly against the reference decode."
    ],
    steps: [
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.inlineDispatchers,
      STEP_LIBRARY.obVariantPass,
      STEP_LIBRARY.flatten,
      STEP_LIBRARY.ifToSwitch,
      STEP_LIBRARY.prune,
      STEP_LIBRARY.obVariantPass,
      STEP_LIBRARY.normalize,
      STEP_LIBRARY.rename
    ]
  }
];

function normalizeHint(value) {
  return String(value || "").toLowerCase();
}

function collectDetection(pattern, inputPath, hint, sourceText) {
  let score = 0;
  const reasons = [];
  const haystacks = [normalizeHint(inputPath), normalizeHint(hint)];
  for (const token of pattern.hintTokens) {
    const normalized = normalizeHint(token);
    if (!normalized) {
      continue;
    }
    if (haystacks.some((value) => value.includes(normalized))) {
      score += 10;
      reasons.push(`hint:${token}`);
    }
  }
  for (const regex of pattern.contentRegexes) {
    if (regex.test(sourceText)) {
      score += 3;
      reasons.push(`content:${regex}`);
    }
  }
  return {
    id: pattern.id,
    score,
    reasons
  };
}

function detectPatterns({ inputPath, hint = "", sourceText }) {
  const detections = PATTERNS
    .filter((pattern) => pattern.id !== "generic")
    .map((pattern) => collectDetection(pattern, inputPath, hint, sourceText))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const bestId = detections.length > 0 ? detections[0].id : "generic";
  return {
    bestId,
    detections,
    selected: getPattern(bestId)
  };
}

function getPattern(id) {
  return PATTERNS.find((pattern) => pattern.id === id) || PATTERNS[0];
}

function buildPipeline(patternId) {
  const pattern = getPattern(patternId);
  return pattern.steps.map((entry) => ({
    ...entry,
    scriptPath: path.join(__dirname, entry.script)
  }));
}

module.exports = {
  BASE_PIPELINE,
  PATTERNS,
  STEP_LIBRARY,
  buildPipeline,
  detectPatterns,
  getPattern
};
