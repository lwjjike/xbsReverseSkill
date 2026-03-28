const generator = require("@babel/generator").default;
const { clone, parseArgs, parseFile, reparse, saveAst, t, traverse } = require("./shared");

function normalizeCode(node) {
  return generator(node, {
    compact: true,
    comments: false,
    jsescOption: { minimal: true }
  }).code;
}

function getCaseInfo(testNode) {
  if (!t.isBinaryExpression(testNode) || !["==", "==="].includes(testNode.operator)) {
    return null;
  }

  const leftLiteral = t.isLiteral(testNode.left);
  const rightLiteral = t.isLiteral(testNode.right);
  if (leftLiteral === rightLiteral) {
    return null;
  }

  if (leftLiteral) {
    return {
      discriminant: testNode.right,
      caseValue: testNode.left
    };
  }

  return {
    discriminant: testNode.left,
    caseValue: testNode.right
  };
}

function toCaseStatements(node) {
  if (!node) {
    return [];
  }
  if (t.isBlockStatement(node)) {
    return node.body.map((stmt) => clone(stmt));
  }
  return [clone(node)];
}

function unwrapAlternate(path) {
  if (!path.node) {
    return { kind: "empty", path: null, node: null };
  }
  if (path.isIfStatement()) {
    return { kind: "if", path, node: path.node };
  }
  if (path.isBlockStatement()) {
    const body = path.get("body");
    if (body.length === 1 && body[0].isIfStatement()) {
      return { kind: "if", path: body[0], node: body[0].node };
    }
    return { kind: "default", path, node: path.node };
  }
  return { kind: "default", path, node: path.node };
}

function isTerminalStatement(node) {
  return t.isReturnStatement(node) || t.isThrowStatement(node) || t.isBreakStatement(node) || t.isContinueStatement(node);
}

function collectIfChain(path) {
  if (path.parentPath.isIfStatement() && path.key === "alternate") {
    return null;
  }

  let currentPath = path;
  let discriminantCode = null;
  let discriminantNode = null;
  const cases = [];
  let defaultStatements = null;

  while (currentPath && currentPath.isIfStatement()) {
    const info = getCaseInfo(currentPath.node.test);
    if (!info) {
      return null;
    }

    const currentCode = normalizeCode(info.discriminant);
    if (discriminantCode === null) {
      discriminantCode = currentCode;
      discriminantNode = clone(info.discriminant);
    } else if (currentCode !== discriminantCode) {
      return null;
    }

    cases.push({
      test: clone(info.caseValue),
      statements: toCaseStatements(currentPath.node.consequent)
    });

    const alternate = unwrapAlternate(currentPath.get("alternate"));
    if (alternate.kind === "empty") {
      break;
    }
    if (alternate.kind === "if") {
      currentPath = alternate.path;
      continue;
    }
    defaultStatements = toCaseStatements(alternate.node);
    break;
  }

  if (cases.length < 2) {
    return null;
  }

  return {
    discriminant: discriminantNode,
    cases,
    defaultStatements
  };
}

function buildSwitchStatementFromChain(chain) {
  const switchCases = chain.cases.map((entry) => {
    const statements = entry.statements.slice();
    if (statements.length === 0 || !isTerminalStatement(statements[statements.length - 1])) {
      statements.push(t.breakStatement());
    }
    return t.switchCase(entry.test, statements);
  });

  if (chain.defaultStatements) {
    switchCases.push(t.switchCase(null, chain.defaultStatements));
  }

  return t.switchStatement(chain.discriminant, switchCases);
}

function collectConsecutiveIfCases(statementPaths, startIndex) {
  const firstPath = statementPaths[startIndex];
  if (!firstPath || !firstPath.isIfStatement() || firstPath.node.alternate) {
    return null;
  }

  const firstInfo = getCaseInfo(firstPath.node.test);
  if (!firstInfo) {
    return null;
  }

  const discriminantCode = normalizeCode(firstInfo.discriminant);
  const cases = [{
    test: clone(firstInfo.caseValue),
    statements: toCaseStatements(firstPath.node.consequent)
  }];

  let endIndex = startIndex + 1;
  while (endIndex < statementPaths.length) {
    const nextPath = statementPaths[endIndex];
    if (!nextPath.isIfStatement() || nextPath.node.alternate) {
      break;
    }

    const info = getCaseInfo(nextPath.node.test);
    if (!info || normalizeCode(info.discriminant) !== discriminantCode) {
      break;
    }

    cases.push({
      test: clone(info.caseValue),
      statements: toCaseStatements(nextPath.node.consequent)
    });
    endIndex += 1;
  }

  if (cases.length < 2) {
    return null;
  }

  return {
    startIndex,
    endIndex,
    switchNode: buildSwitchStatementFromChain({
      discriminant: clone(firstInfo.discriminant),
      cases,
      defaultStatements: null
    })
  };
}

function rewriteStatementList(statementPaths) {
  if (!Array.isArray(statementPaths) || statementPaths.length < 2) {
    return null;
  }

  const nextBody = [];
  let changed = false;

  for (let index = 0; index < statementPaths.length;) {
    const run = collectConsecutiveIfCases(statementPaths, index);
    if (!run) {
      nextBody.push(statementPaths[index].node);
      index += 1;
      continue;
    }

    nextBody.push(run.switchNode);
    index = run.endIndex;
    changed = true;
  }

  return changed ? nextBody : null;
}

function rewrite(ast) {
  let changed = false;

  traverse(ast, {
    IfStatement(path) {
      const chain = collectIfChain(path);
      if (!chain) {
        return;
      }

      path.replaceWith(buildSwitchStatementFromChain(chain));
      changed = true;
    },
    "Program|BlockStatement": {
      exit(path) {
        const nextBody = rewriteStatementList(path.get("body"));
        if (nextBody) {
          path.node.body = nextBody;
          changed = true;
        }
      }
    },
    SwitchCase: {
      exit(path) {
        const nextConsequent = rewriteStatementList(path.get("consequent"));
        if (nextConsequent) {
          path.node.consequent = nextConsequent;
          changed = true;
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
  ({ ast, changed } = rewrite(ast));
  if (changed) {
    ast = reparse(ast);
  }
} while (changed);
saveAst(ast, outputPath);
