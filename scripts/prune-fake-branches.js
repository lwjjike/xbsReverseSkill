const { parseArgs, parseFile, reparse, saveAst, t, traverse } = require("./shared");

function isLiteralLike(node) {
  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isIdentifier(node, { name: "undefined" })
  );
}

function evaluateBinary(node) {
  if (!t.isBinaryExpression(node) || !["==", "===", "!=", "!=="].includes(node.operator)) {
    return null;
  }
  if (!isLiteralLike(node.left) || !isLiteralLike(node.right)) {
    return null;
  }
  const left = t.isIdentifier(node.left, { name: "undefined" }) ? undefined : node.left.value;
  const right = t.isIdentifier(node.right, { name: "undefined" }) ? undefined : node.right.value;
  switch (node.operator) {
    case "==":
      return left == right;
    case "===":
      return left === right;
    case "!=":
      return left != right;
    case "!==":
      return left !== right;
    default:
      return null;
  }
}

function replaceStatement(path, node) {
  if (!node) {
    path.remove();
    return;
  }
  if (t.isBlockStatement(node)) {
    path.replaceWithMultiple(node.body);
    return;
  }
  path.replaceWith(node);
}

function simplify(ast) {
  let changed = false;

  traverse(ast, {
    IfStatement: {
      exit(path) {
        let decision = evaluateBinary(path.node.test);
        if (decision === null) {
          const evaluated = path.get("test").evaluate();
          if (evaluated.confident && typeof evaluated.value === "boolean") {
            decision = evaluated.value;
          }
        }
        if (decision === null) {
          return;
        }
        replaceStatement(path, decision ? path.node.consequent : path.node.alternate);
        changed = true;
      }
    },
    ConditionalExpression(path) {
      let decision = evaluateBinary(path.node.test);
      if (decision === null) {
        const evaluated = path.get("test").evaluate();
        if (evaluated.confident && typeof evaluated.value === "boolean") {
          decision = evaluated.value;
        }
      }
      if (decision === null) {
        return;
      }
      path.replaceWith(decision ? path.node.consequent : path.node.alternate);
      changed = true;
    }
  });

  return { ast, changed };
}

const { inputPath, outputPath } = parseArgs();
let ast = parseFile(inputPath);
let changed = false;
do {
  ({ ast, changed } = simplify(ast));
  if (changed) {
    ast = reparse(ast);
  }
} while (changed);
saveAst(ast, outputPath);

