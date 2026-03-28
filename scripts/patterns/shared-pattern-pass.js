const { parseArgs, parseFile, reparse, saveAst } = require("../shared");

function runPatternPass(transform) {
  const { inputPath, outputPath } = parseArgs();
  let ast = parseFile(inputPath);
  const result = typeof transform === "function" ? transform(ast) || { ast, changed: false } : { ast, changed: false };
  if (result.changed) {
    ast = reparse(result.ast || ast);
  } else if (result.ast) {
    ast = result.ast;
  }
  saveAst(ast, outputPath);
}

module.exports = {
  runPatternPass
};
