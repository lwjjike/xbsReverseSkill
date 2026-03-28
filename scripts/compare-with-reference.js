const fs = require("fs");
const path = require("path");
const { collectMetricsFromFile } = require("./collect-residue-metrics");

function pushGap(gaps, condition, message) {
  if (condition) {
    gaps.push(message);
  }
}

function compareOutputs(caseId, oursPath, referencePath) {
  const ours = collectMetricsFromFile(oursPath);
  const reference = collectMetricsFromFile(referencePath);
  const gaps = [];

  pushGap(gaps, ours.splitPipeCount > reference.splitPipeCount, "still contains unresolved split('|') order sources");
  pushGap(gaps, ours.loopSwitchCount > reference.loopSwitchCount, "still contains direct loop/switch flattening");
  pushGap(gaps, ours.opcodeIfChainCount > reference.opcodeIfChainCount, "still contains opcode if-chain residue");
  pushGap(gaps, ours.dispatcherWrapperCount > reference.dispatcherWrapperCount, "still contains uninlined dispatcher wrappers");
  pushGap(gaps, ours.hexIdentifierCount > reference.hexIdentifierCount, "still contains more _0x-style identifiers than the reference");
  pushGap(gaps, ours.lineCount > reference.lineCount * 1.2, "output is still significantly noisier than the reference");

  return {
    caseId,
    ours,
    reference,
    gaps,
    status: gaps.length === 0 ? "matched-or-better-on-heuristics" : "residue-remains"
  };
}

function main() {
  const [, , oursPath, referencePath, outputPath = "", caseId = "unknown"] = process.argv;
  if (!oursPath || !referencePath) {
    console.error("Usage: node compare-with-reference.js <ours.js> <reference.js> [output.json] [caseId]");
    process.exit(1);
  }

  const result = compareOutputs(caseId, oursPath, referencePath);
  const json = JSON.stringify(result, null, 2);
  if (outputPath) {
    fs.writeFileSync(outputPath, json, "utf8");
  } else {
    process.stdout.write(`${json}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  compareOutputs
};
