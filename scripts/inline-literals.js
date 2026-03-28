const { clone, isPrimitiveNode, parseArgs, parseFile, reparse, saveAst, t, traverse } = require("./shared");

function getReplacementTarget(path) {
  let current = path;
  while (current.parentPath.isMemberExpression() && current.key === "object") {
    current = current.parentPath;
  }
  return current;
}

function isUnsafeReplacementTarget(path) {
  const target = getReplacementTarget(path);
  if (target.parentPath.isUpdateExpression() && target.key === "argument") {
    return true;
  }
  if ((target.parentPath.isAssignmentExpression() || target.parentPath.isAssignmentPattern()) && target.key === "left") {
    return true;
  }
  if ((target.parentPath.isForInStatement() || target.parentPath.isForOfStatement()) && target.key === "left") {
    return true;
  }
  if (target.parentPath.isUnaryExpression({ operator: "delete" }) && target.key === "argument") {
    return true;
  }
  if (target.parentPath.isObjectProperty() && target.key === "key" && !target.parent.computed) {
    return true;
  }
  return false;
}

function replaceSafely(path, node) {
  if (isUnsafeReplacementTarget(path)) {
    return false;
  }
  path.replaceWith(node);
  return true;
}

function allRefsAfter(binding, position) {
  return binding.referencePaths.every(refPath => typeof refPath.node.start !== "number" || refPath.node.start > position);
}

function inlineLiterals(ast) {
  let changed = false;

  traverse(ast, {
    MemberExpression(path) {
      if (t.isArrayExpression(path.node.object) && path.node.object.elements.length === 0 && t.isArrayExpression(path.node.property) && path.node.property.elements.length === 0) {
        if (replaceSafely(path, t.identifier("undefined"))) {
          changed = true;
        }
      }
    },
    VariableDeclarator(path) {
      if (!path.get("id").isIdentifier()) {
        return;
      }
      const name = path.node.id.name;
      const init = path.node.init;
      const binding = path.scope.getBinding(name);
      if (!binding) {
        return;
      }
      if (t.isStringLiteral(init) || t.isNumericLiteral(init) || t.isBooleanLiteral(init)) {
        if (!binding.constant) {
          return;
        }
        let replacedAll = binding.referencePaths.length > 0;
        let replacedAny = false;
        binding.referencePaths.forEach(refPath => {
          if (!replaceSafely(refPath, clone(init))) {
            replacedAll = false;
            return;
          }
          replacedAny = true;
        });
        if (replacedAny) {
          changed = true;
        }
        if (replacedAll) {
          path.remove();
        }
        return;
      }
      if (t.isSequenceExpression(init) && init.expressions.length > 0 && init.expressions.every(expr => t.isStringLiteral(expr))) {
        path.get("init").replaceWith(clone(init.expressions[init.expressions.length - 1]));
        changed = true;
        return;
      }
      if (t.isArrayExpression(init) && init.elements.length > 0 && init.elements.every(el => el && isPrimitiveNode(el))) {
        let replacedAll = binding.referencePaths.length > 0;
        let replacedCount = 0;
        binding.referencePaths.forEach(refPath => {
          const parent = refPath.parentPath;
          if (!parent.isMemberExpression({ object: refPath.node }) || !parent.get("property").isNumericLiteral()) {
            replacedAll = false;
            return;
          }
          const index = parent.node.property.value;
          if (!init.elements[index]) {
            replacedAll = false;
            return;
          }
          if (!replaceSafely(parent, clone(init.elements[index]))) {
            replacedAll = false;
            return;
          }
          replacedCount += 1;
          changed = true;
        });
        if (replacedAll && replacedCount > 0) {
          path.remove();
        }
      }
    },
    AssignmentExpression(path) {
      if (!path.get("left").isIdentifier() || path.node.operator !== "=") {
        return;
      }
      if (!path.parentPath.isExpressionStatement()) {
        return;
      }
      const binding = path.scope.getBinding(path.node.left.name);
      if (!binding) {
        return;
      }
      if (typeof path.node.start === "number" && !allRefsAfter(binding, path.node.start)) {
        return;
      }
      if (path.get("right").isStringLiteral() || path.get("right").isNumericLiteral() || path.get("right").isBooleanLiteral()) {
        const right = clone(path.node.right);
        let replacedAll = binding.referencePaths.length > 0;
        let replacedAny = false;
        binding.referencePaths.forEach(refPath => {
          if (!replaceSafely(refPath, clone(right))) {
            replacedAll = false;
            return;
          }
          replacedAny = true;
        });
        if (replacedAny) {
          changed = true;
        }
        if (replacedAll) {
          path.remove();
        }
        return;
      }
      if (path.get("right").isArrayExpression() && path.node.right.elements.every(el => el && isPrimitiveNode(el))) {
        const elements = path.node.right.elements;
        let replacedAll = binding.referencePaths.length > 0;
        let replacedCount = 0;
        binding.referencePaths.forEach(refPath => {
          const parent = refPath.parentPath;
          if (!parent.isMemberExpression({ object: refPath.node }) || !parent.get("property").isNumericLiteral()) {
            replacedAll = false;
            return;
          }
          const index = parent.node.property.value;
          if (!elements[index]) {
            replacedAll = false;
            return;
          }
          if (!replaceSafely(parent, clone(elements[index]))) {
            replacedAll = false;
            return;
          }
          replacedCount += 1;
          changed = true;
        });
        if (replacedAll && replacedCount > 0) {
          path.remove();
        }
      }
    }
  });

  return { ast, changed };
}

const { inputPath, outputPath } = parseArgs();
let ast = parseFile(inputPath);
let changed = false;
do {
  ({ ast, changed } = inlineLiterals(ast));
  if (changed) {
    ast = reparse(ast);
  }
} while (changed);
saveAst(ast, outputPath);
