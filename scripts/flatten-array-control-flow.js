const generator = require("@babel/generator").default;
const { clone, parseArgs, parseFile, reparse, saveAst, t, traverse } = require("./shared");

function getCaseStatements(casePath) {
  return casePath.get("consequent").filter(stmt => !stmt.isContinueStatement() && !stmt.isBreakStatement()).map(stmt => clone(stmt.node));
}

function hasLexicalBindings(nodes) {
  return nodes.some((node) => t.isVariableDeclaration(node) && node.kind !== "var");
}

function isSimpleDiscriminant(node) {
  return t.isIdentifier(node) || t.isLiteral(node);
}

function normalizeCaseConsequent(nodes) {
  const statements = nodes.map((node) => clone(node));
  if (statements.length === 0) {
    return [t.continueStatement()];
  }

  const last = statements[statements.length - 1];
  if (t.isBreakStatement(last)) {
    statements.pop();
    statements.push(t.continueStatement());
    return statements;
  }
  if (t.isContinueStatement(last) || t.isReturnStatement(last) || t.isThrowStatement(last)) {
    return statements;
  }

  return null;
}

function buildIfChainFromSwitch(switchNode) {
  if (!isSimpleDiscriminant(switchNode.discriminant)) {
    return null;
  }

  let root = null;
  let current = null;
  let defaultBlock = null;

  for (const caseNode of switchNode.cases) {
    const normalized = normalizeCaseConsequent(caseNode.consequent);
    if (!normalized || hasLexicalBindings(normalized)) {
      return null;
    }

    if (caseNode.test === null) {
      defaultBlock = t.blockStatement(normalized);
      continue;
    }

    const test = t.logicalExpression(
      "&&",
      t.binaryExpression("===", clone(switchNode.discriminant), clone(caseNode.test)),
      t.booleanLiteral(true)
    );
    const nextIf = t.ifStatement(test, t.blockStatement(normalized));

    if (!root) {
      root = nextIf;
    } else {
      current.alternate = nextIf;
    }
    current = nextIf;
  }

  if (!root) {
    return null;
  }
  if (current && defaultBlock) {
    current.alternate = defaultBlock;
  }
  return root;
}

function replaceLoopSwitchWithIf(path) {
  const body = path.get("body");
  if (!body.isBlockStatement()) {
    return false;
  }

  const statements = body.get("body");
  if (statements.length !== 1 || !statements[0].isSwitchStatement()) {
    return false;
  }

  const ifChain = buildIfChainFromSwitch(statements[0].node);
  if (!ifChain) {
    return false;
  }

  body.replaceWith(t.blockStatement([ifChain]));
  return true;
}

const UNRESOLVED = Symbol("unresolved");

function getResolvedFunctionCallPath(functionPath) {
  if (functionPath.parentPath.isCallExpression() && functionPath.parentKey === "callee") {
    return functionPath.parentPath;
  }
  if (
    functionPath.parentPath.isUnaryExpression() &&
    functionPath.parentPath.parentPath &&
    functionPath.parentPath.parentPath.isCallExpression() &&
    functionPath.parentPath.parentKey === "callee"
  ) {
    return functionPath.parentPath.parentPath;
  }
  return null;
}

function resolveObjectPropertyFromBinding(objectPath, propertyValue, seenBindings = new Set()) {
  if (!objectPath || !objectPath.node || !objectPath.isIdentifier()) {
    return UNRESOLVED;
  }

  const binding = objectPath.scope.getBinding(objectPath.node.name);
  if (!binding || seenBindings.has(binding)) {
    return UNRESOLVED;
  }
  seenBindings.add(binding);

  const declaratorPath = getDeclaratorForBinding(binding);
  if (!declaratorPath) {
    seenBindings.delete(binding);
    return UNRESOLVED;
  }

  const initPath = declaratorPath.get("init");
  if (!initPath.node) {
    seenBindings.delete(binding);
    return UNRESOLVED;
  }

  if (initPath.isIdentifier()) {
    const resolved = resolveObjectPropertyFromBinding(initPath, propertyValue, seenBindings);
    seenBindings.delete(binding);
    return resolved;
  }

  if (!initPath.isObjectExpression()) {
    seenBindings.delete(binding);
    return UNRESOLVED;
  }

  for (const propertyPath of initPath.get("properties")) {
    if (!propertyPath.isObjectProperty()) {
      continue;
    }

    const keyPath = propertyPath.get("key");
    const key = propertyPath.node.computed ? resolveStatic(keyPath, seenBindings) : keyPath.isIdentifier() ? keyPath.node.name : resolveStatic(keyPath, seenBindings);
    if (key === UNRESOLVED || String(key) !== String(propertyValue)) {
      continue;
    }

    const resolved = resolveStatic(propertyPath.get("value"), seenBindings);
    seenBindings.delete(binding);
    return resolved;
  }

  seenBindings.delete(binding);
  return UNRESOLVED;
}

function resolveStatic(path, seenBindings = new Set()) {
  if (!path || !path.node) {
    return UNRESOLVED;
  }

  if (path.isStringLiteral() || path.isNumericLiteral() || path.isBooleanLiteral()) {
    return path.node.value;
  }
  if (path.isNullLiteral()) {
    return null;
  }
  if (path.isTemplateLiteral() && path.node.expressions.length === 0) {
    return path.node.quasis[0].value.cooked;
  }
  if (path.isIdentifier({ name: "undefined" })) {
    return undefined;
  }

  if (path.isArrayExpression()) {
    const values = [];
    for (const elementPath of path.get("elements")) {
      if (!elementPath.node) {
        values.push(undefined);
        continue;
      }
      const value = resolveStatic(elementPath, seenBindings);
      if (value === UNRESOLVED) {
        return UNRESOLVED;
      }
      values.push(value);
    }
    return values;
  }

  if (path.isObjectExpression()) {
    const out = Object.create(null);
    for (const propPath of path.get("properties")) {
      if (!propPath.isObjectProperty()) {
        return UNRESOLVED;
      }
      const keyPath = propPath.get("key");
      const key = propPath.node.computed ? resolveStatic(keyPath, seenBindings) : keyPath.isIdentifier() ? keyPath.node.name : resolveStatic(keyPath, seenBindings);
      if (key === UNRESOLVED) {
        return UNRESOLVED;
      }
      const value = resolveStatic(propPath.get("value"), seenBindings);
      if (value === UNRESOLVED) {
        return UNRESOLVED;
      }
      out[key] = value;
    }
    return out;
  }

  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding || seenBindings.has(binding)) {
      return UNRESOLVED;
    }
    seenBindings.add(binding);

    let resolved = UNRESOLVED;
    if (binding.path.parentPath && binding.path.parentPath.isVariableDeclarator()) {
      resolved = resolveStatic(binding.path.parentPath.get("init"), seenBindings);
    } else if (binding.kind === "param" && binding.path.parentPath && binding.path.parentPath.isFunction()) {
      const callPath = getResolvedFunctionCallPath(binding.path.parentPath);
      if (callPath && typeof binding.path.key === "number") {
        resolved = resolveStatic(callPath.get(`arguments.${binding.path.key}`), seenBindings);
      }
    }

    seenBindings.delete(binding);
    if (resolved !== UNRESOLVED) {
      return resolved;
    }
  }

  if (path.isMemberExpression()) {
    const propertyValue = path.node.computed
      ? resolveStatic(path.get("property"), seenBindings)
      : path.get("property").isIdentifier()
        ? path.node.property.name
        : resolveStatic(path.get("property"), seenBindings);
    if (propertyValue === UNRESOLVED) {
      return UNRESOLVED;
    }

    const directPropertyValue = resolveObjectPropertyFromBinding(path.get("object"), propertyValue, seenBindings);
    if (directPropertyValue !== UNRESOLVED) {
      return directPropertyValue;
    }

    const objectValue = resolveStatic(path.get("object"), seenBindings);
    if (objectValue === UNRESOLVED) {
      return UNRESOLVED;
    }
    if (Array.isArray(objectValue)) {
      const index = Number(propertyValue);
      return Number.isInteger(index) ? objectValue[index] : UNRESOLVED;
    }
    if (objectValue && typeof objectValue === "object" && propertyValue in objectValue) {
      return objectValue[propertyValue];
    }
    return UNRESOLVED;
  }

  if (
    path.isCallExpression() &&
    path.get("callee").isMemberExpression() &&
    (
      path.get("callee.property").isIdentifier({ name: "split" }) ||
      path.get("callee.property").isStringLiteral({ value: "split" })
    ) &&
    path.get("arguments.0").isStringLiteral()
  ) {
    const source = resolveStatic(path.get("callee.object"), seenBindings);
    if (typeof source === "string") {
      return source.split(path.node.arguments[0].value);
    }
  }

  const evaluated = path.evaluate();
  return evaluated.confident ? evaluated.value : UNRESOLVED;
}

function getLiteralValue(path) {
  const resolved = resolveStatic(path);
  if (typeof resolved === "string" || typeof resolved === "number") {
    return resolved;
  }
  return null;
}

function normalizeKey(node) {
  return generator(node, {
    compact: true,
    comments: false,
    jsescOption: { minimal: true }
  }).code;
}

function getCaseKey(casePath) {
  const value = getLiteralValue(casePath.get("test"));
  return value === null ? normalizeKey(casePath.node.test) : value;
}

function getOrderFromInit(initPath) {
  if (initPath.isArrayExpression()) {
    const values = [];
    for (const elementPath of initPath.get("elements")) {
      if (!elementPath.node) {
        return null;
      }
      const value = getLiteralValue(elementPath);
      values.push(value === null ? normalizeKey(elementPath.node) : value);
    }
    return values;
  }

  if (
    initPath.isCallExpression() &&
    initPath.get("callee").isMemberExpression() &&
    (
      initPath.get("callee.property").isIdentifier({ name: "split" }) ||
      initPath.get("callee.property").isStringLiteral({ value: "split" })
    ) &&
    initPath.get("arguments.0").isStringLiteral()
  ) {
    const source = getLiteralValue(initPath.get("callee.object"));
    if (typeof source === "string") {
      return source.split(initPath.node.arguments[0].value);
    }
  }

  return null;
}

function getOrderFromResolvedValue(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const order = [];
  for (const item of value) {
    if (typeof item === "string" || typeof item === "number") {
      order.push(item);
      continue;
    }
    return null;
  }
  return order;
}

function getDeclaratorForBinding(binding) {
  if (!binding || !binding.path) {
    return null;
  }
  if (binding.path.isVariableDeclarator()) {
    return binding.path;
  }
  if (binding.path.parentPath && binding.path.parentPath.isVariableDeclarator()) {
    return binding.path.parentPath;
  }
  return null;
}

function getOrderFromBinding(binding) {
  const declaratorPath = getDeclaratorForBinding(binding);
  if (!declaratorPath) {
    return null;
  }

  const initPath = declaratorPath.get("init");
  if (!initPath.node) {
    return null;
  }

  return getOrderFromInit(initPath) || getOrderFromResolvedValue(resolveStatic(initPath));
}

function getOrderFromSplitCallWithObjectTable(initPath, loopPath) {
  if (
    !initPath.isCallExpression() ||
    !initPath.get("callee").isMemberExpression() ||
    !(
      initPath.get("callee.property").isIdentifier({ name: "split" }) ||
      initPath.get("callee.property").isStringLiteral({ value: "split" })
    ) ||
    !initPath.get("arguments.0").isStringLiteral()
  ) {
    return null;
  }

  const sourcePath = initPath.get("callee.object");
  if (!sourcePath.isMemberExpression() || !sourcePath.get("object").isIdentifier()) {
    return null;
  }

  const objectName = sourcePath.get("object").node.name;
  const propertyKey = sourcePath.node.computed ? getStaticPropertyKey(sourcePath.node.property) : getStaticPropertyKey(sourcePath.node.property);
  if (propertyKey === null) {
    return null;
  }

  const match = collectObjectPipeStringCandidates(loopPath, objectName).find((candidate) => candidate.key === propertyKey);
  return match ? match.order : null;
}

function getOrderFromDiscriminant(discriminantPath) {
  if (!discriminantPath.isMemberExpression()) {
    return null;
  }

  const objectPath = discriminantPath.get("object");
  const directOrder = getOrderFromResolvedValue(resolveStatic(objectPath));
  if (directOrder) {
    return directOrder;
  }

  if (!objectPath.isIdentifier()) {
    return null;
  }

  const binding = objectPath.scope.getBinding(objectPath.node.name);
  return getOrderFromBinding(binding);
}

function findNearbyOrderDeclaration(loopPath, maxSiblings = 3) {
  let siblingPath = loopPath.getPrevSibling();
  for (let seen = 0; siblingPath && siblingPath.node && seen < maxSiblings; seen += 1) {
    if (!siblingPath.isVariableDeclaration()) {
      break;
    }

    for (const declaratorPath of siblingPath.get("declarations")) {
      if (!declaratorPath.node || !declaratorPath.get("init").node) {
        continue;
      }
      const order =
        getOrderFromInit(declaratorPath.get("init")) ||
        getOrderFromSplitCallWithObjectTable(declaratorPath.get("init"), loopPath) ||
        getOrderFromResolvedValue(resolveStatic(declaratorPath.get("init")));
      if (order) {
        return {
          order,
          declarationPath: siblingPath
        };
      }
    }

    siblingPath = siblingPath.getPrevSibling();
  }

  return null;
}

function buildBlocksFromSwitchOrder(switchStmt, order) {
  if (!order) {
    return null;
  }

  const caseMap = new Map();
  switchStmt.get("cases").forEach(casePath => {
    if (!casePath.node.test) {
      return;
    }
    caseMap.set(getCaseKey(casePath), getCaseStatements(casePath));
  });

  const blocks = [];
  order.forEach(key => {
    const stmts = caseMap.get(key);
    if (stmts) {
      blocks.push(...stmts);
    }
  });

  return blocks.length > 0 ? blocks : null;
}

function getStaticPropertyKey(node) {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isStringLiteral(node) || t.isNumericLiteral(node)) {
    return String(node.value);
  }
  return null;
}

function resolveObjectAliasNames(loopPath, objectName) {
  const names = new Set();
  let currentName = objectName;

  while (currentName) {
    if (names.has(currentName)) {
      break;
    }
    names.add(currentName);

    const binding = loopPath.scope.getBinding(currentName);
    const declaratorPath = getDeclaratorForBinding(binding);
    if (!declaratorPath || !declaratorPath.get("init").isIdentifier()) {
      break;
    }

    currentName = declaratorPath.get("init").node.name;
  }

  return names;
}

function splitPipeString(value) {
  if (typeof value !== "string" || !value.includes("|")) {
    return null;
  }
  const parts = value.split("|");
  return parts.length > 1 ? parts : null;
}

function getPipeOrderFromValuePath(valuePath) {
  if (!valuePath || !valuePath.node) {
    return null;
  }

  if (valuePath.isStringLiteral()) {
    return splitPipeString(valuePath.node.value);
  }

  const resolved = resolveStatic(valuePath);
  return splitPipeString(resolved);
}

function getCaseKeys(switchStmt) {
  const keys = [];
  switchStmt.get("cases").forEach(casePath => {
    if (!casePath.node.test) {
      return;
    }
    keys.push(getCaseKey(casePath));
  });
  return keys;
}

function sameSequenceKeySet(order, caseKeys) {
  if (!order || order.length !== caseKeys.length) {
    return false;
  }

  const counts = new Map();
  caseKeys.forEach((key) => counts.set(String(key), (counts.get(String(key)) || 0) + 1));
  for (const item of order) {
    const key = String(item);
    const count = counts.get(key);
    if (!count) {
      return false;
    }
    if (count === 1) {
      counts.delete(key);
    } else {
      counts.set(key, count - 1);
    }
  }
  return counts.size === 0;
}

function getAncestorBodyStatements(loopPath) {
  const bodies = [];
  const seen = new Set();
  let current = loopPath;

  while (current) {
    if (current.isProgram()) {
      const key = `program:${current.node.start || 0}`;
      if (!seen.has(key)) {
        bodies.push(current.get("body"));
        seen.add(key);
      }
    } else if (current.isBlockStatement() && Array.isArray(current.node.body)) {
      const key = `block:${current.node.start || 0}`;
      if (!seen.has(key)) {
        bodies.push(current.get("body"));
        seen.add(key);
      }
    }
    current = current.parentPath;
  }

  return bodies;
}

function collectObjectPipeStringCandidates(loopPath, objectName) {
  if (!objectName) {
    return [];
  }

  const objectNames = resolveObjectAliasNames(loopPath, objectName);
  const candidates = [];
  const loopStart = loopPath.node.start || 0;
  getAncestorBodyStatements(loopPath).forEach((statements) => {
    statements.forEach((stmtPath) => {
      if (!stmtPath.node || (stmtPath.node.start || 0) >= loopStart) {
        return;
      }

      if (stmtPath.isVariableDeclaration()) {
        stmtPath.get("declarations").forEach((declPath) => {
          if (!declPath.get("id").isIdentifier() || !objectNames.has(declPath.get("id").node.name) || !declPath.get("init").isObjectExpression()) {
            return;
          }
          declPath.get("init.properties").forEach((propPath) => {
            if (!propPath.isObjectProperty()) {
              return;
            }
            const keyPath = propPath.get("key");
            const key = propPath.node.computed ? getStaticPropertyKey(keyPath.node) : getStaticPropertyKey(keyPath.node);
            const valuePath = propPath.get("value");
            const pipeOrder = getPipeOrderFromValuePath(valuePath);
            if (pipeOrder) {
              candidates.push({ key, order: pipeOrder, start: stmtPath.node.start || 0 });
            }
          });
        });
        return;
      }

      if (!stmtPath.isExpressionStatement()) {
        return;
      }

      const exprPath = stmtPath.get("expression");
      if (!exprPath.isAssignmentExpression({ operator: "=" })) {
        return;
      }

      const leftPath = exprPath.get("left");
      const rightPath = exprPath.get("right");
      if (!leftPath.isMemberExpression() || !leftPath.get("object").isIdentifier() || !objectNames.has(leftPath.get("object").node.name)) {
        return;
      }

      const key = leftPath.node.computed ? getStaticPropertyKey(leftPath.node.property) : getStaticPropertyKey(leftPath.node.property);
      if (key === null) {
        return;
      }

      const pipeOrder = getPipeOrderFromValuePath(rightPath);
      if (pipeOrder) {
        candidates.push({ key, order: pipeOrder, start: stmtPath.node.start || 0 });
      }
    });
  });

  candidates.sort((a, b) => b.start - a.start);
  return candidates;
}

function getOrderFromObjectStringTable(loopPath, switchStmt) {
  const discriminant = switchStmt.get("discriminant");
  if (!discriminant.isMemberExpression() || !discriminant.get("object").isIdentifier()) {
    return null;
  }

  const candidates = collectObjectPipeStringCandidates(loopPath, discriminant.get("object").node.name);
  if (candidates.length === 0) {
    return null;
  }

  const caseKeys = getCaseKeys(switchStmt);
  const match = candidates.find((candidate) => sameSequenceKeySet(candidate.order, caseKeys));
  return match ? match.order : null;
}

function flatten(ast) {
  let changed = false;

  traverse(ast, {
    ForStatement(path) {
      const body = path.get("body");
      if (!body.isBlockStatement() || body.get("body").length === 0) {
        return;
      }
      const firstStmt = body.get("body.0");
      if (firstStmt.isSwitchStatement() && path.get("init").isVariableDeclaration() && path.node.update === null) {
        let order = null;
        const leftovers = [];
        path.get("init.declarations").forEach(decl => {
          if (decl.node.init === null) {
            leftovers.push(t.variableDeclaration("var", [clone(decl.node)]));
            return;
          }
          const candidate =
            getOrderFromInit(decl.get("init")) ||
            getOrderFromSplitCallWithObjectTable(decl.get("init"), path) ||
            getOrderFromResolvedValue(resolveStatic(decl.get("init")));
          if (candidate) {
            order = candidate;
          }
        });
        if (order) {
          const caseMap = new Map();
          firstStmt.get("cases").forEach(casePath => {
            if (!casePath.node.test) {
              return;
            }
            caseMap.set(getCaseKey(casePath), getCaseStatements(casePath));
          });
          const blocks = [...leftovers];
          order.forEach(key => {
            const stmts = caseMap.get(key);
            if (stmts) {
              blocks.push(...stmts);
            }
          });
          if (blocks.length > 0) {
            path.replaceWithMultiple(blocks);
            changed = true;
            return;
          }
        }
      }

      if (replaceLoopSwitchWithIf(path)) {
        changed = true;
      }
    },
    WhileStatement(path) {
      if (path.get("test").isUnaryExpression() && path.get("body").isBlockStatement()) {
        const switchStmt = path.get("body.body.0");
        if (switchStmt.isSwitchStatement()) {
          const nearby = findNearbyOrderDeclaration(path);
          const order =
            (nearby && nearby.order) ||
            getOrderFromDiscriminant(switchStmt.get("discriminant")) ||
            getOrderFromObjectStringTable(path, switchStmt);
          const blocks = buildBlocksFromSwitchOrder(switchStmt, order);
          if (blocks) {
            path.replaceWithMultiple(blocks);
            if (nearby && nearby.declarationPath && nearby.declarationPath.node) {
              nearby.declarationPath.remove();
            }
            changed = true;
            return;
          }
        }
      }

      if (replaceLoopSwitchWithIf(path)) {
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
  ({ ast, changed } = flatten(ast));
  if (changed) {
    ast = reparse(ast);
  }
} while (changed);
saveAst(ast, outputPath);
