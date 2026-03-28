const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { buildPipeline, detectPatterns, getPattern } = require("./pipeline-config");
const { collectMetricsFromFile } = require("./collect-residue-metrics");

function sanitizeStepName(name) {
  return String(name).replace(/[^a-z0-9_]+/gi, "_");
}

function runStep(nodePath, step, currentPath, nextPath) {
  const start = Date.now();
  const result = spawnSync(nodePath, [step.scriptPath, currentPath, nextPath], {
    encoding: "utf8",
    env: process.env,
    timeout: step.timeoutMs
  });
  const durationMs = Date.now() - start;
  const stdout = result.stdout ? result.stdout.trim() : "";
  const stderr = result.stderr ? result.stderr.trim() : "";
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  return {
    id: step.id,
    script: step.script,
    outputFile: path.basename(nextPath),
    timeoutMs: step.timeoutMs,
    durationMs,
    status: timedOut ? "timed_out" : result.status === 0 ? "ok" : "failed",
    exitCode: typeof result.status === "number" ? result.status : null,
    stdout,
    stderr,
    error: result.error ? String(result.error.message || result.error) : ""
  };
}

function copyFile(fromPath, toPath) {
  fs.copyFileSync(fromPath, toPath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const [, , inputPath, outputDir, hint = ""] = process.argv;
  if (!inputPath || !outputDir) {
    console.error("Usage: node run-pipeline.js <input.js> <output-dir> [hint]");
    process.exit(1);
  }

  const absoluteInput = path.resolve(inputPath);
  const absoluteOutputDir = path.resolve(outputDir);
  ensureDir(absoluteOutputDir);

  const sourceText = fs.readFileSync(absoluteInput, "utf8");
  const detection = detectPatterns({
    inputPath: absoluteInput,
    hint,
    sourceText
  });
  const pattern = getPattern(detection.bestId);
  const pipeline = buildPipeline(pattern.id);

  const report = {
    inputPath: absoluteInput,
    outputDir: absoluteOutputDir,
    hint,
    selectedPattern: {
      id: pattern.id,
      displayName: pattern.displayName,
      reference: pattern.reference,
      families: pattern.families,
      notes: pattern.notes
    },
    detections: detection.detections,
    steps: [],
    status: "ok",
    failedStep: null,
    lastGoodFile: "00_source.js",
    finalMetrics: null
  };

  const sourceCopyPath = path.join(absoluteOutputDir, "00_source.js");
  copyFile(absoluteInput, sourceCopyPath);

  let currentPath = sourceCopyPath;
  for (let index = 0; index < pipeline.length; index += 1) {
    const step = pipeline[index];
    const stepName = `${String(index + 1).padStart(2, "0")}_${sanitizeStepName(step.id)}.js`;
    const nextPath = path.join(absoluteOutputDir, stepName);
    const outcome = runStep(process.execPath, step, currentPath, nextPath);
    report.steps.push(outcome);
    if (outcome.status !== "ok") {
      report.status = outcome.status;
      report.failedStep = step.id;
      break;
    }
    currentPath = nextPath;
    report.lastGoodFile = stepName;
  }

  const finalPath = path.join(absoluteOutputDir, "final.js");
  copyFile(currentPath, finalPath);
  report.finalMetrics = collectMetricsFromFile(finalPath);

  fs.writeFileSync(path.join(absoluteOutputDir, "selected-patterns.json"), JSON.stringify({
    bestId: detection.bestId,
    detections: detection.detections,
    selectedPattern: report.selectedPattern
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(absoluteOutputDir, "pipeline-report.json"), JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    selectedPattern: report.selectedPattern.id,
    failedStep: report.failedStep,
    lastGoodFile: report.lastGoodFile
  })}\n`);
}

if (require.main === module) {
  main();
}
