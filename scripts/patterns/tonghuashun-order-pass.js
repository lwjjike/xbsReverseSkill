const { runPatternPass } = require("./shared-pattern-pass");
const {
  createSandbox,
  evaluateNodes,
  foldWrapperObjects,
  inlineStringMethodCalls,
  seedSandboxFromAliases,
  traverse,
  t
} = require("./pattern-utils");

function getDecoderPreludeNodes(ast) {
  const topLevelDeclarator = ast.program.body
    .filter((node) => t.isVariableDeclaration(node))
    .flatMap((node) => node.declarations)
    .find((decl) =>
      t.isIdentifier(decl.id) &&
      (
        t.isFunctionExpression(decl.init) ||
        (t.isCallExpression(decl.init) && t.isFunctionExpression(decl.init.callee))
      )
    );

  const rootFunction = !topLevelDeclarator ? null :
    t.isFunctionExpression(topLevelDeclarator.init) ? topLevelDeclarator.init :
    t.isCallExpression(topLevelDeclarator.init) && t.isFunctionExpression(topLevelDeclarator.init.callee) ? topLevelDeclarator.init.callee :
    null;

  if (!rootFunction || !t.isBlockStatement(rootFunction.body)) {
    return [];
  }

  const nodes = [];
  for (const stmt of rootFunction.body.body) {
    if (t.isFunctionDeclaration(stmt) && stmt.id && (stmt.id.name === "t" || stmt.id.name === "u")) {
      nodes.push(stmt);
      continue;
    }
    if (t.isVariableDeclaration(stmt) && stmt.declarations.every((decl) => t.isIdentifier(decl.id) && decl.init == null)) {
      nodes.push(stmt);
      continue;
    }
    if (t.isExpressionStatement(stmt)) {
      nodes.push(stmt);
      break;
    }
  }

  return nodes;
}

function tonghuashunOrderPass(ast) {
  let changed = false;
  let localChanged = false;
  const sandbox = createSandbox();
  const preludeNodes = getDecoderPreludeNodes(ast);
  if (preludeNodes.length > 0 && evaluateNodes(preludeNodes, sandbox, 2000)) {
    while (seedSandboxFromAliases(ast, sandbox)) {
      changed = true;
    }
  }

  const decoderAliasNames = collectDecoderAliasNames(ast, ["t"]);
  do {
    localChanged = false;

    if (replaceDecoderAliasCalls(ast, sandbox, decoderAliasNames)) {
      localChanged = true;
      changed = true;
    }

    if (inlineStringMethodCalls(ast)) {
      localChanged = true;
      changed = true;
    }

    const foldResult = foldWrapperObjects(ast, {
      ignoreDynamicUsage: true
    });
    if (foldResult.changed) {
      localChanged = true;
      changed = true;
    }

    if (inlineStringMethodCalls(ast)) {
      localChanged = true;
      changed = true;
    }
  } while (localChanged);

  return { ast, changed };
}

function collectDecoderAliasNames(ast, seedNames) {
  const aliasNames = new Set(seedNames);
  let expanded = false;

  do {
    expanded = false;
    traverse(ast, {
      VariableDeclarator(path) {
        if (!path.get("id").isIdentifier() || !path.get("init").isIdentifier()) {
          return;
        }
        const sourceName = path.get("init").node.name;
        const aliasName = path.get("id").node.name;
        if (!aliasNames.has(sourceName) || aliasNames.has(aliasName)) {
          return;
        }
        aliasNames.add(aliasName);
        expanded = true;
      },
      AssignmentExpression(path) {
        if (!path.get("left").isIdentifier() || !path.get("right").isIdentifier()) {
          return;
        }
        const sourceName = path.get("right").node.name;
        const aliasName = path.get("left").node.name;
        if (!aliasNames.has(sourceName) || aliasNames.has(aliasName)) {
          return;
        }
        aliasNames.add(aliasName);
        expanded = true;
      }
    });
  } while (expanded);

  return aliasNames;
}

function nodeFromPrimitiveValue(value) {
  if (typeof value === "undefined") {
    return t.identifier("undefined");
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return t.valueToNode(value);
  }
  return null;
}

function replaceDecoderAliasCalls(ast, sandbox, aliasNames) {
  if (typeof sandbox.t !== "function" || aliasNames.size === 0) {
    return false;
  }

  let changed = false;
  traverse(ast, {
    CallExpression(path) {
      const calleePath = path.get("callee");
      let isDecoderAliasCall = false;

      if (calleePath.isIdentifier()) {
        isDecoderAliasCall = aliasNames.has(calleePath.node.name);
      } else if (
        calleePath.isAssignmentExpression({ operator: "=" }) &&
        calleePath.get("left").isIdentifier() &&
        calleePath.get("right").isIdentifier()
      ) {
        isDecoderAliasCall = aliasNames.has(calleePath.get("right").node.name);
      }

      if (!isDecoderAliasCall) {
        return;
      }
      if (path.node.arguments.length !== 1 || !path.get("arguments.0").isNumericLiteral()) {
        return;
      }

      let value;
      try {
        value = sandbox.t(path.get("arguments.0").node.value);
      } catch (error) {
        return;
      }

      const literalNode = nodeFromPrimitiveValue(value);
      if (!literalNode) {
        return;
      }

      path.replaceWith(literalNode);
      changed = true;
    }
  });

  return changed;
}

runPatternPass(tonghuashunOrderPass);
