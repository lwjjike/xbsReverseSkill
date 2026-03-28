const fs = require("fs");
const path = require("path");
const { detectPatterns } = require("./pipeline-config");

function main() {
  const [, , inputPath, hint = "", outputPath = ""] = process.argv;
  if (!inputPath) {
    console.error("Usage: node detect-patterns.js <input.js> [hint] [output.json]");
    process.exit(1);
  }

  const sourceText = fs.readFileSync(inputPath, "utf8");
  const result = detectPatterns({
    inputPath: path.resolve(inputPath),
    hint,
    sourceText
  });

  const serializable = {
    inputPath: path.resolve(inputPath),
    hint,
    bestId: result.bestId,
    selected: {
      id: result.selected.id,
      displayName: result.selected.displayName,
      reference: result.selected.reference,
      families: result.selected.families,
      notes: result.selected.notes
    },
    detections: result.detections
  };

  const json = JSON.stringify(serializable, null, 2);
  if (outputPath) {
    fs.writeFileSync(outputPath, json, "utf8");
  } else {
    process.stdout.write(`${json}\n`);
  }
}

if (require.main === module) {
  main();
}
