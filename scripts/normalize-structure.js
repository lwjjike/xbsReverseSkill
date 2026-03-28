const { parseArgs, parseFile, reparse, saveAst, t, traverse } = require("./shared");

function toStatements(expressions) {
  return expressions.map(expr => t.expressionStatement(expr));
}

function hasUnsafeContinue(bodyPath) {
  let found = false;
  bodyPath.traverse({
    Function(path) {
      path.skip();
    },
    ContinueStatement(path) {
      found = true;
      path.stop();
    }
  });
  return found;
}

function ensureBlock(path) {
  if (path.isBlockStatement()) {
    return path;
  }
  path.replaceWith(t.blockStatement([path.node]));
  return path.parentPath.get(path.key);
}

function replaceStatement(path, node) {
  if (path.inList) {
    path.replaceWith(node);
    return;
  }
  path.replaceWith(t.blockStatement([node]));
}

function replaceStatementWithStatements(path, statements) {
  if (statements.length === 0) {
    path.remove();
    return;
  }
  if (path.inList) {
    path.replaceWithMultiple(statements);
    return;
  }
  if (statements.length === 1) {
    path.replaceWith(statements[0]);
    return;
  }
  path.replaceWith(t.blockStatement(statements));
}

function normalize(ast) {
  let changed = false;

  traverse(ast, {
    UnaryExpression(path) {
      if (path.node.operator === "void" && path.parentPath.isExpressionStatement()) {
        path.replaceWith(path.node.argument);
        changed = true;
      }
    },
    SequenceExpression(path) {
      if (path.parentPath.isExpressionStatement()) {
        replaceStatementWithStatements(path.parentPath, toStatements(path.node.expressions));
        changed = true;
        return;
      }

      if (path.parentPath.isReturnStatement()) {
        if (!path.parentPath.inList) {
          return;
        }
        const exprs = path.node.expressions.slice();
        const returnExpr = exprs.pop();
        path.parentPath.insertBefore(toStatements(exprs));
        path.replaceWith(returnExpr);
        changed = true;
        return;
      }

      if (path.parentPath.isIfStatement() && path.key === "test") {
        if (!path.parentPath.inList) {
          return;
        }
        const exprs = path.node.expressions.slice();
        const testExpr = exprs.pop();
        path.parentPath.insertBefore(toStatements(exprs));
        path.replaceWith(testExpr);
        changed = true;
        return;
      }

      if (path.parentPath.isForStatement() && path.key === "init") {
        if (!path.parentPath.inList) {
          return;
        }
        path.parentPath.insertBefore(toStatements(path.node.expressions));
        path.remove();
        changed = true;
        return;
      }

      if (path.parentPath.isForStatement() && path.key === "test") {
        const exprs = path.node.expressions.slice();
        const testExpr = exprs.pop();
        const forPath = path.parentPath;
        const bodyPath = ensureBlock(forPath.get("body"));
        bodyPath.unshiftContainer(
          "body",
          t.ifStatement(t.unaryExpression("!", testExpr, true), t.blockStatement([t.breakStatement()]))
        );
        bodyPath.unshiftContainer("body", toStatements(exprs));
        path.remove();
        changed = true;
        return;
      }

      if (path.parentPath.isForStatement() && path.key === "update") {
        const forPath = path.parentPath;
        const bodyPath = ensureBlock(forPath.get("body"));
        if (hasUnsafeContinue(bodyPath)) {
          return;
        }
        bodyPath.pushContainer("body", toStatements(path.node.expressions));
        path.remove();
        changed = true;
      }
    },
    ConditionalExpression(path) {
      if (path.parentPath.isExpressionStatement()) {
        replaceStatement(
          path.parentPath,
          t.ifStatement(
            path.node.test,
            t.blockStatement([t.expressionStatement(path.node.consequent)]),
            t.blockStatement([t.expressionStatement(path.node.alternate)])
          )
        );
        changed = true;
      }
    },
    LogicalExpression(path) {
      if (!path.parentPath.isExpressionStatement()) {
        return;
      }
      const body = t.blockStatement([t.expressionStatement(path.node.right)]);
      if (path.node.operator === "&&") {
        replaceStatement(path.parentPath, t.ifStatement(path.node.left, body, null));
      } else if (path.node.operator === "||") {
        replaceStatement(path.parentPath, t.ifStatement(t.unaryExpression("!", path.node.left, true), body, null));
      } else {
        return;
      }
      changed = true;
    },
    AssignmentExpression(path) {
      if (!path.parentPath.isExpressionStatement() || !t.isConditionalExpression(path.node.right)) {
        return;
      }
      const test = path.node.right.test;
      const consequent = t.expressionStatement(
        t.assignmentExpression(path.node.operator, t.cloneNode(path.node.left, true), path.node.right.consequent)
      );
      const alternate = t.expressionStatement(
        t.assignmentExpression(path.node.operator, t.cloneNode(path.node.left, true), path.node.right.alternate)
      );
      replaceStatement(path.parentPath, t.ifStatement(test, t.blockStatement([consequent]), t.blockStatement([alternate])));
      changed = true;
    },
    CallExpression(path) {
      if (!path.parentPath.isExpressionStatement()) {
        return;
      }
      if (path.get("callee").isFunctionExpression() && path.node.arguments.length === 0) {
        replaceStatementWithStatements(path.parentPath, path.node.callee.body.body);
        changed = true;
        return;
      }
      if (
        path.get("callee").isMemberExpression() &&
        path.get("callee.object").isFunctionExpression() &&
        path.get("callee.property").isIdentifier({ name: "call" }) &&
        path.node.arguments.length === 1 &&
        path.get("arguments.0").isThisExpression()
      ) {
        replaceStatementWithStatements(path.parentPath, path.node.callee.object.body.body);
        changed = true;
      }
    },
    BlockStatement(path) {
      if (path.parentPath.isSwitchCase()) {
        path.replaceWithMultiple(path.node.body);
        changed = true;
      }
    }
  });

  return { ast, changed };
}

const { inputPath, outputPath } = parseArgs();
let ast = parseFile(inputPath);
let changed = false;
do {
  ({ ast, changed } = normalize(ast));
  if (changed) {
    ast = reparse(ast);
  }
} while (changed);
saveAst(ast, outputPath);
