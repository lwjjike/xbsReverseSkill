const { clone } = require("../shared");
const { runPatternPass } = require("./shared-pattern-pass");
const { createSandbox, evaluateExpression, evaluateNodes, foldWrapperObjects, traverse, t } = require("./pattern-utils");

function getOpcodeTestInfo(testPath) {
  if (!testPath.isBinaryExpression()) {
    return null;
  }
  if (!["===", "=="].includes(testPath.node.operator)) {
    return null;
  }

  if (testPath.get("left").isNumericLiteral() && testPath.get("right").isIdentifier()) {
    return {
      discriminant: clone(testPath.get("right").node),
      discriminantName: testPath.get("right").node.name,
      caseValue: clone(testPath.get("left").node)
    };
  }

  if (testPath.get("right").isNumericLiteral() && testPath.get("left").isIdentifier()) {
    return {
      discriminant: clone(testPath.get("left").node),
      discriminantName: testPath.get("left").node.name,
      caseValue: clone(testPath.get("right").node)
    };
  }

  return null;
}

function blockify(node) {
  if (!node) {
    return [];
  }
  if (t.isBlockStatement(node)) {
    return node.body.map((stmt) => clone(stmt));
  }
  return [clone(node)];
}

function withTrailingBreak(statements) {
  if (statements.length === 0) {
    return [t.breakStatement()];
  }
  const last = statements[statements.length - 1];
  if (t.isBreakStatement(last) || t.isReturnStatement(last) || t.isThrowStatement(last) || t.isContinueStatement(last)) {
    return statements;
  }
  return [...statements, t.breakStatement()];
}

function collectOpcodeCasesFromAlternate(node, discriminantName, cases) {
  if (!node) {
    return;
  }

  if (t.isIfStatement(node)) {
    const info = getOpcodeTestInfo({
      isBinaryExpression: () => t.isBinaryExpression(node.test),
      node: node.test,
      get(key) {
        if (key === "left") {
          return {
            isNumericLiteral: () => t.isNumericLiteral(node.test.left),
            isIdentifier: () => t.isIdentifier(node.test.left),
            node: node.test.left
          };
        }
        return {
          isNumericLiteral: () => t.isNumericLiteral(node.test.right),
          isIdentifier: () => t.isIdentifier(node.test.right),
          node: node.test.right
        };
      }
    });

    if (info && info.discriminantName === discriminantName) {
      cases.push(t.switchCase(info.caseValue, withTrailingBreak(blockify(node.consequent))));
      collectOpcodeCasesFromAlternate(node.alternate, discriminantName, cases);
      return;
    }

    cases.push(t.switchCase(null, withTrailingBreak(blockify(node))));
    return;
  }

  if (t.isBlockStatement(node)) {
    node.body.forEach((stmt) => {
      if (t.isIfStatement(stmt)) {
        const info = getOpcodeTestInfo({
          isBinaryExpression: () => t.isBinaryExpression(stmt.test),
          node: stmt.test,
          get(key) {
            if (key === "left") {
              return {
                isNumericLiteral: () => t.isNumericLiteral(stmt.test.left),
                isIdentifier: () => t.isIdentifier(stmt.test.left),
                node: stmt.test.left
              };
            }
            return {
              isNumericLiteral: () => t.isNumericLiteral(stmt.test.right),
              isIdentifier: () => t.isIdentifier(stmt.test.right),
              node: stmt.test.right
            };
          }
        });

        if (info && info.discriminantName === discriminantName) {
          cases.push(t.switchCase(info.caseValue, withTrailingBreak(blockify(stmt.consequent))));
          collectOpcodeCasesFromAlternate(stmt.alternate, discriminantName, cases);
          return;
        }
      }

      cases.push(t.switchCase(null, withTrailingBreak([clone(stmt)])));
    });
    return;
  }

  cases.push(t.switchCase(null, withTrailingBreak([clone(node)])));
}

function convertOpcodeIfChains(ast) {
  let changed = false;

  traverse(ast, {
    IfStatement(path) {
      const info = getOpcodeTestInfo(path.get("test"));
      if (!info) {
        return;
      }

      const cases = [
        t.switchCase(info.caseValue, withTrailingBreak(blockify(path.node.consequent)))
      ];
      collectOpcodeCasesFromAlternate(path.node.alternate, info.discriminantName, cases);
      path.replaceWith(t.switchStatement(info.discriminant, cases));
      path.skip();
      changed = true;
    }
  });

  return changed;
}

function stripPseudoForLoops(ast) {
  let changed = false;

  traverse(ast, {
    ForStatement(path) {
      const testPath = path.get("test");
      if (
        !testPath.isBinaryExpression() ||
        path.node.update !== null ||
        !(
          testPath.get("left").isNumericLiteral() ||
          testPath.get("right").isNumericLiteral()
        )
      ) {
        return;
      }

      if (path.node.init) {
        path.replaceWith(clone(path.node.init));
      } else {
        path.remove();
      }
      changed = true;
    }
  });

  return changed;
}

function xiaohongshuWrapperPass(ast) {
  let changed = false;
  const body = ast.program.body;

  if (
    body.length >= 3 &&
    body[1].type === "VariableDeclaration" &&
    body[1].declarations.length > 0 &&
    t.isIdentifier(body[1].declarations[0].id)
  ) {
    const sandbox = createSandbox();
    const decoderName = body[1].declarations[0].id.name;

    if (evaluateNodes(body.slice(0, 3), sandbox) && typeof sandbox[decoderName] === "function") {
      ast.program.body = body.slice(3).map((node) => clone(node));
      changed = true;

      const aliasNames = new Set([decoderName]);
      let progress = false;
      do {
        progress = false;

        traverse(ast, {
          VariableDeclarator(path) {
            if (!path.get("id").isIdentifier() || !path.get("init").isIdentifier()) {
              return;
            }
            if (aliasNames.has(path.node.init.name) && !aliasNames.has(path.node.id.name)) {
              aliasNames.add(path.node.id.name);
              progress = true;
            }
          },
          CallExpression(path) {
            if (!path.get("callee").isIdentifier() || !aliasNames.has(path.node.callee.name) || path.node.arguments.length !== 1) {
              return;
            }
            const result = evaluateExpression(`${decoderName}(${path.get("arguments.0").toString()})`, sandbox);
            if (!result.ok) {
              return;
            }
            path.replaceWith(t.valueToNode(result.value));
            progress = true;
            changed = true;
          }
        });
      } while (progress);

      traverse(ast, {
        VariableDeclarator(path) {
          if (!path.get("id").isIdentifier() || !path.get("init").isIdentifier()) {
            return;
          }
          if (aliasNames.has(path.node.id.name) && aliasNames.has(path.node.init.name)) {
            path.remove();
            changed = true;
          }
        }
      });
    }
  }

  let localChanged = false;
  do {
    ({ changed: localChanged } = foldWrapperObjects(ast));
    if (localChanged) {
      changed = true;
    }
  } while (localChanged);

  if (convertOpcodeIfChains(ast)) {
    changed = true;
  }

  if (stripPseudoForLoops(ast)) {
    changed = true;
  }

  return { ast, changed };
}

runPatternPass(xiaohongshuWrapperPass);
