const { clone } = require("../shared");
const { runPatternPass } = require("./shared-pattern-pass");
const { createSandbox, evaluateExpression, evaluateNodes, generateCode, traverse, t } = require("./pattern-utils");

function unwrapTopLevelIife(ast) {
  const first = ast.program.body[0];
  if (!first || first.type !== "ExpressionStatement" || first.expression.type !== "CallExpression") {
    return false;
  }
  const callee = first.expression.callee;
  if (callee.type !== "FunctionExpression") {
    return false;
  }
  ast.program.body = callee.body.body.map((node) => clone(node));
  return true;
}

function expandSequenceExpressions(ast) {
  let changed = false;

  traverse(ast, {
    SequenceExpression(path) {
      if (path.parentPath.isExpressionStatement()) {
        path.replaceWithMultiple(path.node.expressions.map((expr) => t.expressionStatement(clone(expr))));
        changed = true;
        return;
      }

      if (path.parentPath.isReturnStatement()) {
        const expressions = path.node.expressions.map((expr) => clone(expr));
        const last = expressions.pop();
        if (!last) {
          return;
        }
        path.parentPath.replaceWithMultiple([
          ...expressions.map((expr) => t.expressionStatement(expr)),
          t.returnStatement(last)
        ]);
        changed = true;
        return;
      }

      if (path.parentPath.isVariableDeclarator()) {
        const declaratorPath = path.parentPath;
        const declarationPath = declaratorPath.parentPath;
        if (!declarationPath || !declarationPath.isVariableDeclaration()) {
          return;
        }

        const expressions = path.node.expressions.map((expr) => clone(expr));
        const last = expressions.pop();
        if (!last) {
          return;
        }

        const inserted = [
          ...expressions.map((expr) => t.expressionStatement(expr)),
          t.variableDeclaration(declarationPath.node.kind, [
            t.variableDeclarator(clone(declaratorPath.node.id), last)
          ])
        ];

        declarationPath.insertAfter(inserted);
        declaratorPath.remove();
        if (declarationPath.get("declarations").length === 0) {
          declarationPath.remove();
        }
        changed = true;
      }
    }
  });

  return changed;
}

function unwrapUnaryIifes(ast) {
  let changed = false;

  traverse(ast, {
    UnaryExpression(path) {
      if (
        path.node.operator !== "!" ||
        !path.get("argument").isCallExpression() ||
        path.get("argument.arguments").length !== 0 ||
        !path.get("argument.callee").isFunctionExpression() ||
        path.get("argument.callee.params").length !== 0
      ) {
        return;
      }

      path.replaceWithMultiple(path.get("argument.callee.body").node.body.map((node) => clone(node)));
      changed = true;
    }
  });

  return changed;
}

function yidunDispatcherPass(ast) {
  let changed = false;

  if (unwrapTopLevelIife(ast)) {
    changed = true;
  }

  if (expandSequenceExpressions(ast)) {
    changed = true;
  }

  if (unwrapUnaryIifes(ast)) {
    changed = true;
  }

  const body = ast.program.body;
  if (body.length >= 2 && body[1].type === "FunctionDeclaration" && body[1].id && body[1].params.length === 2) {
    const sandbox = createSandbox();
    const decoderName = body[1].id.name;
    if (evaluateNodes(body.slice(0, 2), sandbox) && typeof sandbox[decoderName] === "function") {
      traverse(ast, {
        CallExpression(path) {
          if (!path.get("callee").isIdentifier({ name: decoderName }) || path.node.arguments.length !== 1 || !path.get("arguments.0").isNumericLiteral()) {
            return;
          }
          const result = evaluateExpression(path.toString(), sandbox);
          if (!result.ok) {
            return;
          }
          path.replaceWith(t.valueToNode(result.value));
          changed = true;
        }
      });

      ast.program.body = ast.program.body.slice(2).map((node) => clone(node));
      changed = true;
    }
  }

  traverse(ast, {
    VariableDeclaration(path) {
      if (
        path.node.declarations.length !== 5 ||
        !path.get("declarations").every((declarationPath) => {
          return (
            declarationPath.get("init").isMemberExpression() &&
            declarationPath.get("init.object").isNewExpression() &&
            declarationPath.get("init.property").isStringLiteral()
          );
        })
      ) {
        return;
      }

      const prev = path.getPrevSibling();
      const next1 = path.getNextSibling();
      const next2 = next1 && next1.getNextSibling();
      if (!prev || !next1 || !next2 || !prev.node || !next1.node || !next2.node) {
        return;
      }

      const sandbox = createSandbox();
      if (!evaluateNodes([prev.node, path.node, next1.node, next2.node], sandbox)) {
        return;
      }

      const names = []
        .concat(next1.node.declarations || [])
        .concat(next2.node.declarations || [])
        .map((declaration) => declaration.id)
        .filter((idNode) => t.isIdentifier(idNode))
        .map((idNode) => idNode.name);

      names.forEach((name) => {
        const binding = path.scope.getBinding(name);
        if (!binding || !binding.constant) {
          return;
        }
        binding.referencePaths.forEach((refPath) => {
          const parent = refPath.parentPath;
          if (!parent.isMemberExpression({ object: refPath.node }) || !parent.get("property").isNumericLiteral()) {
            return;
          }
          const result = evaluateExpression(generateCode(parent.node), sandbox);
          if (!result.ok) {
            return;
          }
          parent.replaceWith(t.valueToNode(result.value));
          changed = true;
        });
      });

      prev.remove();
      path.remove();
      next1.remove();
      next2.remove();
      changed = true;
    }
  });

  return { ast, changed };
}

runPatternPass(yidunDispatcherPass);
