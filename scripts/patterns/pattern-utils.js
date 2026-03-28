const vm = require("vm");
const generator = require("@babel/generator").default;
const { clone, t, traverse } = require("../shared");

function generateCode(node) {
  return generator(node, {
    compact: true,
    comments: false,
    jsescOption: { minimal: true }
  }).code;
}

function getPropertyKey(node) {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isStringLiteral(node) || t.isNumericLiteral(node)) {
    return String(node.value);
  }
  return null;
}

function resolvePropertyKeyNode(node, options = {}) {
  const directKey = getPropertyKey(node);
  if (directKey !== null) {
    return directKey;
  }

  if (!options.sandbox) {
    return null;
  }

  const result = evaluateExpression(generateCode(node), options.sandbox, options.timeoutMs || 500);
  if (!result.ok) {
    return null;
  }

  if (typeof result.value === "string" || typeof result.value === "number") {
    return String(result.value);
  }

  return null;
}

function isSafeMemberReplacement(path) {
  const parent = path.parentPath;
  if (!parent) {
    return false;
  }
  if ((parent.isAssignmentExpression() || parent.isAssignmentPattern()) && path.key === "left") {
    return false;
  }
  if (parent.isUpdateExpression() && path.key === "argument") {
    return false;
  }
  if ((parent.isForInStatement() || parent.isForOfStatement()) && path.key === "left") {
    return false;
  }
  if (parent.isUnaryExpression({ operator: "delete" }) && path.key === "argument") {
    return false;
  }
  return true;
}

function createSandbox(extra = {}) {
  const sandbox = {
    Array,
    Boolean,
    Buffer,
    Date,
    Error,
    Function,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Proxy,
    Reflect,
    RegExp,
    Set,
    String,
    Symbol,
    TypeError,
    WeakMap,
    WeakSet,
    atob,
    btoa,
    clearInterval,
    clearTimeout,
    console,
    decodeURIComponent,
    encodeURIComponent,
    escape,
    isFinite,
    isNaN,
    parseFloat,
    parseInt,
    setInterval,
    setTimeout,
    unescape,
    Uint8Array,
    ...extra
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  return sandbox;
}

function isPrimitiveValue(value) {
  return value === null || ["string", "number", "boolean", "undefined"].includes(typeof value);
}

function isSerializableValue(value, depth = 0) {
  if (depth > 4) {
    return false;
  }
  if (isPrimitiveValue(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isSerializableValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return false;
    }
    return Object.keys(value).every((key) => isSerializableValue(value[key], depth + 1));
  }
  return false;
}

function literalNodeFromValue(value) {
  if (!isSerializableValue(value)) {
    return null;
  }
  if (typeof value === "undefined") {
    return t.identifier("undefined");
  }
  return t.valueToNode(value);
}

function getBindingAliasInitPath(binding) {
  if (!binding || !binding.path) {
    return null;
  }

  if (binding.path.isVariableDeclarator()) {
    const initPath = binding.path.get("init");
    if (initPath && initPath.node) {
      return initPath;
    }
  }

  if (binding.path.parentPath && binding.path.parentPath.isVariableDeclarator()) {
    const initPath = binding.path.parentPath.get("init");
    if (initPath && initPath.node) {
      return initPath;
    }
  }

  if (binding.constantViolations.length === 1) {
    const violationPath = binding.constantViolations[0];
    if (
      violationPath &&
      violationPath.isAssignmentExpression() &&
      violationPath.get("left").isIdentifier() &&
      violationPath.get("right").isIdentifier()
    ) {
      return violationPath.get("right");
    }
  }

  return null;
}

function evaluateNodes(nodes, sandbox, timeoutMs = 1000) {
  try {
    const code = nodes.map(generateCode).join(";\n");
    vm.runInNewContext(code, sandbox, { timeout: timeoutMs });
    return true;
  } catch (error) {
    return false;
  }
}

function evaluateExpression(code, sandbox, timeoutMs = 1000) {
  try {
    return {
      ok: true,
      value: vm.runInNewContext(code, sandbox, { timeout: timeoutMs })
    };
  } catch (error) {
    return {
      ok: false,
      error
    };
  }
}

function shouldEvaluateTopLevelStatement(node) {
  if (t.isFunctionDeclaration(node)) {
    return true;
  }
  if (t.isVariableDeclaration(node)) {
    return true;
  }
  if (!t.isExpressionStatement(node)) {
    return false;
  }

  const expr = node.expression;
  if (t.isAssignmentExpression(expr)) {
    return true;
  }
  if (t.isCallExpression(expr)) {
    if (t.isFunctionExpression(expr.callee) || t.isArrowFunctionExpression(expr.callee)) {
      return expr.callee.body && (!t.isBlockStatement(expr.callee.body) || expr.callee.body.body.length <= 40);
    }
    return t.isIdentifier(expr.callee);
  }
  if (t.isUnaryExpression(expr) && t.isCallExpression(expr.argument)) {
    const call = expr.argument;
    if (t.isFunctionExpression(call.callee) || t.isArrowFunctionExpression(call.callee)) {
      return call.callee.body && (!t.isBlockStatement(call.callee.body) || call.callee.body.body.length <= 40);
    }
  }
  return false;
}

function evaluatePreludeStatements(ast, options = {}) {
  const maxStatements = options.maxStatements || 10;
  const timeoutMs = options.timeoutMs || 1000;
  const sandbox = options.sandbox || createSandbox();
  const executed = [];

  for (const node of ast.program.body) {
    if (executed.length >= maxStatements) {
      break;
    }
    if (!shouldEvaluateTopLevelStatement(node)) {
      break;
    }
    if (!evaluateNodes([node], sandbox, timeoutMs)) {
      break;
    }
    executed.push(node);
  }

  return {
    sandbox,
    executedCount: executed.length
  };
}

function seedSandboxFromAliases(ast, sandbox) {
  let changed = false;

  traverse(ast, {
    VariableDeclarator(path) {
      if (!path.get("id").isIdentifier() || !path.get("init").isIdentifier()) {
        return;
      }

      const aliasName = path.node.id.name;
      const sourceName = path.node.init.name;
      if (!Object.prototype.hasOwnProperty.call(sandbox, sourceName) || Object.prototype.hasOwnProperty.call(sandbox, aliasName)) {
        return;
      }

      sandbox[aliasName] = sandbox[sourceName];
      changed = true;
    },
    AssignmentExpression(path) {
      if (!path.get("left").isIdentifier() || !path.get("right").isIdentifier()) {
        return;
      }

      const aliasName = path.node.left.name;
      const sourceName = path.node.right.name;
      if (!Object.prototype.hasOwnProperty.call(sandbox, sourceName) || Object.prototype.hasOwnProperty.call(sandbox, aliasName)) {
        return;
      }

      sandbox[aliasName] = sandbox[sourceName];
      changed = true;
    }
  });

  return changed;
}

function replacePrimitiveIdentifiers(ast, sandbox, options = {}) {
  const includeGlobals = options.includeGlobals === true;
  const globalAllowlist = new Set(options.globalAllowlist || []);
  const bindingLiterals = new Map();
  let changed = false;

  traverse(ast, {
    VariableDeclarator(path) {
      if (!path.get("id").isIdentifier()) {
        return;
      }
      const name = path.node.id.name;
      const binding = path.scope.getBinding(name);
      if (!Object.prototype.hasOwnProperty.call(sandbox, name)) {
        return;
      }
      const node = literalNodeFromValue(sandbox[name]);
      if (binding && binding.constant && node) {
        bindingLiterals.set(binding, node);
      }
    },
    Identifier(path) {
      if (!includeGlobals) {
        return;
      }
      if (!path.isReferencedIdentifier()) {
        return;
      }
      if (globalAllowlist.size > 0 && !globalAllowlist.has(path.node.name)) {
        return;
      }
      const binding = path.scope.getBinding(path.node.name);
      if (binding) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(sandbox, path.node.name)) {
        return;
      }
      const node = literalNodeFromValue(sandbox[path.node.name]);
      if (!node || t.isIdentifier(node, { name: path.node.name })) {
        return;
      }
      path.replaceWith(clone(node));
      changed = true;
    }
  });

  if (bindingLiterals.size > 0) {
    traverse(ast, {
      Identifier(path) {
        if (!path.isReferencedIdentifier()) {
          return;
        }
        const binding = path.scope.getBinding(path.node.name);
        const node = binding ? bindingLiterals.get(binding) : null;
        if (!node || t.isIdentifier(node, { name: path.node.name })) {
          return;
        }
        path.replaceWith(clone(node));
        changed = true;
      }
    });

    for (const [binding, node] of bindingLiterals.entries()) {
      if (binding.path && !binding.path.removed) {
        if (binding.path.isVariableDeclarator()) {
          const initPath = binding.path.get("init");
          if (initPath && initPath.node) {
            initPath.replaceWith(clone(node));
          }
        }
        binding.path.remove();
        changed = true;
      }
    }
  }

  return changed;
}

function resolveSandboxCallableName(path, sandbox, seenBindings = new Set()) {
  if (!path || !path.node || !path.isIdentifier()) {
    return null;
  }

  const directName = path.node.name;
  const binding = path.scope.getBinding(directName);
  const programScope = path.scope.getProgramParent();

  if (!binding) {
    return typeof sandbox[directName] === "function" ? directName : null;
  }

  if (binding.scope === programScope && typeof sandbox[directName] === "function") {
    return directName;
  }

  if (seenBindings.has(binding)) {
    return null;
  }
  seenBindings.add(binding);

  const initPath = getBindingAliasInitPath(binding);
  if (!initPath || !initPath.node || !initPath.isIdentifier()) {
    return null;
  }

  return resolveSandboxCallableName(initPath, sandbox, seenBindings);
}

function replaceCallsFromSandbox(ast, sandbox, options = {}) {
  const allowPredicate = options.allowPredicate || (() => true);
  let changed = false;

  traverse(ast, {
    CallExpression(path) {
      const calleeName = resolveSandboxCallableName(path.get("callee"), sandbox);
      if (!calleeName || !allowPredicate(path, calleeName)) {
        return;
      }

      const argValues = [];
      for (const argPath of path.get("arguments")) {
        const evaluated = evaluateExpression(generateCode(argPath.node), sandbox, options.timeoutMs || 1000);
        if (!evaluated.ok) {
          return;
        }
        argValues.push(evaluated.value);
      }

      let value;
      try {
        value = sandbox[calleeName](...argValues);
      } catch (error) {
        const result = evaluateExpression(generateCode(path.node), sandbox, options.timeoutMs || 1000);
        if (!result.ok) {
          return;
        }
        value = result.value;
      }

      const node = literalNodeFromValue(value);
      if (!node) {
        return;
      }

      path.replaceWith(node);
      changed = true;
    }
  });

  return changed;
}

function resolveSandboxValueName(path, sandbox, seenBindings = new Set()) {
  if (!path || !path.node || !path.isIdentifier()) {
    return null;
  }

  const directName = path.node.name;
  const binding = path.scope.getBinding(directName);
  const programScope = path.scope.getProgramParent();

  if (!binding) {
    return Object.prototype.hasOwnProperty.call(sandbox, directName) ? directName : null;
  }

  if (binding.scope === programScope && Object.prototype.hasOwnProperty.call(sandbox, directName)) {
    return directName;
  }

  if (seenBindings.has(binding)) {
    return null;
  }
  seenBindings.add(binding);

  const initPath = getBindingAliasInitPath(binding);
  if (!initPath || !initPath.node || !initPath.isIdentifier()) {
    return null;
  }

  return resolveSandboxValueName(initPath, sandbox, seenBindings);
}

function replaceMembersFromSandbox(ast, sandbox) {
  let changed = false;

  traverse(ast, {
    MemberExpression(path) {
      if (!isSafeMemberReplacement(path)) {
        return;
      }

      const key = path.node.computed ? resolvePropertyKeyNode(path.node.property, { sandbox }) : resolvePropertyKeyNode(path.node.property, { sandbox });
      if (key === null) {
        return;
      }

      const objectName = resolveSandboxValueName(path.get("object"), sandbox);
      if (!objectName) {
        return;
      }

      const container = sandbox[objectName];
      if (!container || (typeof container !== "object" && typeof container !== "function")) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(container, key)) {
        return;
      }

      const node = literalNodeFromValue(container[key]);
      if (!node) {
        return;
      }

      path.replaceWith(node);
      changed = true;
    }
  });

  return changed;
}

function inlineStringMethodCalls(ast) {
  let changed = false;

  function resolveString(path, seen = new Set()) {
    if (!path || !path.node) {
      return null;
    }
    if (path.isStringLiteral()) {
      return path.node.value;
    }
    if (path.isTemplateLiteral() && path.node.expressions.length === 0) {
      return path.node.quasis[0].value.cooked;
    }
    if (path.isIdentifier()) {
      const binding = path.scope.getBinding(path.node.name);
      if (!binding || seen.has(binding) || !binding.path.parentPath || !binding.path.parentPath.isVariableDeclarator()) {
        return null;
      }
      seen.add(binding);
      return resolveString(binding.path.parentPath.get("init"), seen);
    }
    return null;
  }

  traverse(ast, {
    CallExpression(path) {
      if (!path.get("callee").isMemberExpression()) {
        return;
      }
      const callee = path.get("callee");
      const property = callee.node.computed ? getPropertyKey(callee.node.property) : getPropertyKey(callee.node.property);
      if (!["substring", "substr", "slice", "split"].includes(property)) {
        return;
      }
      const source = resolveString(callee.get("object"));
      if (typeof source !== "string") {
        return;
      }

      const argValues = [];
      for (const argPath of path.get("arguments")) {
        const evaluated = argPath.evaluate();
        if (!evaluated.confident || !isPrimitiveValue(evaluated.value)) {
          return;
        }
        argValues.push(evaluated.value);
      }

      let value;
      try {
        value = source[property](...argValues);
      } catch (error) {
        return;
      }

      const node = literalNodeFromValue(value);
      if (!node) {
        return;
      }
      path.replaceWith(node);
      changed = true;
    }
  });

  return changed;
}

function descriptorForValue(node, options = {}) {
  if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)) {
    return { type: "literal", node: clone(node) };
  }
  if (t.isIdentifier(node, { name: "undefined" })) {
    return { type: "literal", node: t.identifier("undefined") };
  }

  if (collectReferencedIdentifierNames(node).size === 0) {
    const sandbox = options.sandbox || createSandbox();
    const evaluated = evaluateExpression(generateCode(node), sandbox, options.timeoutMs || 500);
    if (evaluated.ok) {
      const literalNode = literalNodeFromValue(evaluated.value);
      if (literalNode) {
        return { type: "literal", node: literalNode };
      }
    }
  }

  return null;
}

function isHarmlessWrapperPreludeInit(node) {
  return (
    node == null ||
    t.isIdentifier(node) ||
    t.isMemberExpression(node) ||
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node)
  );
}

function collectReferencedIdentifierNames(node) {
  const names = new Set();
  if (!node) {
    return names;
  }

  traverse(t.file(t.program([t.expressionStatement(clone(node))])), {
    Identifier(path) {
      if (path.isReferencedIdentifier()) {
        names.add(path.node.name);
      }
    }
  });

  return names;
}

function getWrapperReturnArgument(fnNode) {
  if (!t.isFunctionExpression(fnNode) || fnNode.body.body.length === 0) {
    return null;
  }

  const body = fnNode.body.body;
  const last = body[body.length - 1];
  if (!t.isReturnStatement(last) || !last.argument) {
    return null;
  }

  const referenced = collectReferencedIdentifierNames(last.argument);
  for (const stmt of body.slice(0, -1)) {
    if (!t.isVariableDeclaration(stmt) || stmt.kind !== "var") {
      return null;
    }

    for (const declaration of stmt.declarations) {
      if (!t.isIdentifier(declaration.id) || referenced.has(declaration.id.name) || !isHarmlessWrapperPreludeInit(declaration.init)) {
        return null;
      }
    }
  }

  return last.argument;
}

function collectWrapperDescriptor(node, wrapperMap, options = {}) {
  const literal = descriptorForValue(node, options);
  if (literal) {
    return literal;
  }

  if (t.isMemberExpression(node) && t.isIdentifier(node.object)) {
    const key = node.computed ? resolvePropertyKeyNode(node.property, options) : resolvePropertyKeyNode(node.property, options);
    if (key !== null) {
      return { type: "member", objectName: node.object.name, key };
    }
  }

  if (t.isFunctionExpression(node)) {
    const argument = getWrapperReturnArgument(node);
    if (!argument) {
      return null;
    }
    if (t.isBinaryExpression(argument) && t.isIdentifier(argument.left) && t.isIdentifier(argument.right)) {
      return { type: "binary", operator: argument.operator };
    }
    if (t.isLogicalExpression(argument) && t.isIdentifier(argument.left) && t.isIdentifier(argument.right)) {
      return { type: "logical", operator: argument.operator };
    }
    if (t.isUnaryExpression(argument) && t.isIdentifier(argument.argument)) {
      return { type: "unary", operator: argument.operator, prefix: argument.prefix !== false };
    }
    if (t.isCallExpression(argument) && t.isIdentifier(argument.callee)) {
      return { type: "call" };
    }
    if (t.isCallExpression(argument) && t.isMemberExpression(argument.callee) && t.isIdentifier(argument.callee.object)) {
      const key = argument.callee.computed ? resolvePropertyKeyNode(argument.callee.property, options) : resolvePropertyKeyNode(argument.callee.property, options);
      if (key !== null) {
        return resolveDescriptor(wrapperMap, { type: "member", objectName: argument.callee.object.name, key });
      }
    }
  }

  return null;
}

function resolveDescriptor(wrapperMap, descriptor, seen = new Set()) {
  if (!descriptor) {
    return null;
  }
  if (descriptor.type !== "member") {
    return descriptor;
  }

  const token = `${descriptor.objectName}:${descriptor.key}`;
  if (seen.has(token)) {
    return null;
  }
  seen.add(token);

  const next = wrapperMap[descriptor.objectName] && wrapperMap[descriptor.objectName][descriptor.key];
  if (!next) {
    return null;
  }
  return resolveDescriptor(wrapperMap, next, seen) || next;
}

function collectWrapperObjects(ast, options = {}) {
  const wrapperMap = Object.create(null);
  const removableEntries = [];

  traverse(ast, {
    "VariableDeclarator|AssignmentExpression"(path) {
      const idPath = path.isVariableDeclarator() ? path.get("id") : path.get("left");
      const valuePath = path.isVariableDeclarator() ? path.get("init") : path.get("right");

      if (!idPath.isIdentifier() || !valuePath.isObjectExpression()) {
        return;
      }

      const name = idPath.node.name;
      const collected = wrapperMap[name] || Object.create(null);
      let localChanged = false;
      let supportedPropertyCount = 0;
      let collectedPropertyCount = 0;
      const propertyEntries = [];

      valuePath.get("properties").forEach((propertyPath) => {
        if (!propertyPath.isObjectProperty()) {
          return;
        }
        supportedPropertyCount += 1;
        const key = resolvePropertyKeyNode(propertyPath.node.key, options);
        if (key === null) {
          return;
        }
        const descriptor = collectWrapperDescriptor(propertyPath.node.value, wrapperMap, options);
        if (descriptor) {
          collected[key] = descriptor;
          localChanged = true;
          collectedPropertyCount += 1;
          propertyEntries.push({ key, path: propertyPath });
        }
      });

      if (localChanged) {
        wrapperMap[name] = collected;
        removableEntries.push({
          path,
          objectName: name,
          propertyEntries,
          removable: supportedPropertyCount > 0 && supportedPropertyCount === collectedPropertyCount
        });
      }
    }
  });

  return {
    wrapperMap,
    removableEntries
  };
}

function applyWrapperObjects(ast, wrapperMap, options = {}) {
  let changed = false;

  traverse(ast, {
    CallExpression(path) {
      if (!path.get("callee").isMemberExpression() || !path.get("callee.object").isIdentifier()) {
        return;
      }

      const objectName = path.node.callee.object.name;
      const key = path.node.callee.computed ? resolvePropertyKeyNode(path.node.callee.property, options) : resolvePropertyKeyNode(path.node.callee.property, options);
      const resolved = resolveDescriptor(wrapperMap, { type: "member", objectName, key });
      if (!resolved) {
        return;
      }

      const args = path.node.arguments.map((arg) => clone(arg));
      if (resolved.type === "binary" && args.length >= 2) {
        path.replaceWith(t.binaryExpression(resolved.operator, args[0], args[1]));
        changed = true;
      } else if (resolved.type === "logical" && args.length >= 2) {
        path.replaceWith(t.logicalExpression(resolved.operator, args[0], args[1]));
        changed = true;
      } else if (resolved.type === "unary" && args.length >= 1) {
        path.replaceWith(t.unaryExpression(resolved.operator, args[0], resolved.prefix !== false));
        changed = true;
      } else if (resolved.type === "call" && args.length >= 1) {
        path.replaceWith(t.callExpression(args[0], args.slice(1)));
        changed = true;
      }
    },
    MemberExpression(path) {
      if (!path.get("object").isIdentifier() || !isSafeMemberReplacement(path)) {
        return;
      }

      const objectName = path.node.object.name;
      const key = path.node.computed ? resolvePropertyKeyNode(path.node.property, options) : resolvePropertyKeyNode(path.node.property, options);
      const resolved = resolveDescriptor(wrapperMap, { type: "member", objectName, key });
      if (!resolved || resolved.type !== "literal") {
        return;
      }

      path.replaceWith(clone(resolved.node));
      changed = true;
    }
  });

  return changed;
}

function removeWrapperOwnerPath(path) {
  if (!path || !path.node || path.removed) {
    return false;
  }

  if (path.isVariableDeclarator()) {
    const declarationPath = path.parentPath;
    path.remove();
    if (declarationPath && declarationPath.node && declarationPath.get("declarations").length === 0) {
      declarationPath.remove();
    }
    return true;
  }

  if (path.isAssignmentExpression()) {
    if (path.parentPath && path.parentPath.isExpressionStatement()) {
      path.parentPath.remove();
    } else {
      path.remove();
    }
    return true;
  }

  path.remove();
  return true;
}

function collectLiveWrapperPropertyUsage(ast, wrapperNames, options = {}) {
  const liveKeys = new Set();
  const unsafeObjects = new Set();
  const ignoreDynamicUsage = options.ignoreDynamicUsage === true;

  traverse(ast, {
    Identifier(path) {
      if (!path.isReferencedIdentifier() || !wrapperNames.has(path.node.name)) {
        return;
      }

      const parent = path.parentPath;
      if (
        parent &&
        parent.isMemberExpression() &&
        path.key === "object" &&
        parent.get("object") === path
      ) {
        return;
      }

      unsafeObjects.add(path.node.name);
    },
    MemberExpression(path) {
      if (!path.get("object").isIdentifier()) {
        return;
      }

      const objectName = path.get("object").node.name;
      if (!wrapperNames.has(objectName)) {
        return;
      }

      const key = path.node.computed ? resolvePropertyKeyNode(path.node.property, options) : resolvePropertyKeyNode(path.node.property, options);
      if (key === null || !isSafeMemberReplacement(path)) {
        if (!ignoreDynamicUsage) {
          unsafeObjects.add(objectName);
        }
        return;
      }

      liveKeys.add(`${objectName}:${key}`);
    }
  });

  return {
    liveKeys,
    unsafeObjects
  };
}

function pruneResolvedWrapperProperties(ast, removableEntries, options = {}) {
  if (removableEntries.length === 0) {
    return false;
  }

  const wrapperNames = new Set(removableEntries.map((entry) => entry.objectName));
  const { liveKeys, unsafeObjects } = collectLiveWrapperPropertyUsage(ast, wrapperNames, options);
  let changed = false;

  removableEntries.forEach(({ path, objectName, propertyEntries, removable }) => {
    if (!path || !path.node || path.removed || unsafeObjects.has(objectName)) {
      return;
    }

    propertyEntries.forEach(({ key, path: propertyPath }) => {
      if (!propertyPath || !propertyPath.node || propertyPath.removed) {
        return;
      }
      if (liveKeys.has(`${objectName}:${key}`)) {
        return;
      }
      propertyPath.remove();
      changed = true;
    });

    const valuePath = path.isVariableDeclarator() ? path.get("init") : path.get("right");
    if (!valuePath || !valuePath.node || !valuePath.isObjectExpression()) {
      return;
    }

    const remainingProperties = valuePath.get("properties");
    if (remainingProperties.length > 0) {
      return;
    }

    if (removable || propertyEntries.length > 0) {
      if (removeWrapperOwnerPath(path)) {
        changed = true;
      }
    }
  });

  return changed;
}

function getWrapperOwnerBinding(entry) {
  if (!entry || !entry.path || !entry.path.node) {
    return null;
  }

  if (entry.path.isVariableDeclarator()) {
    const idPath = entry.path.get("id");
    return idPath.isIdentifier() ? entry.path.scope.getBinding(idPath.node.name) : null;
  }

  if (entry.path.isAssignmentExpression()) {
    const leftPath = entry.path.get("left");
    return leftPath.isIdentifier() ? entry.path.scope.getBinding(leftPath.node.name) : null;
  }

  return null;
}

function pruneUnusedWrapperOwners(removableEntries) {
  let changed = false;

  removableEntries.forEach((entry) => {
    if (!entry.removable || !entry.path || !entry.path.node || entry.path.removed) {
      return;
    }

    const binding = getWrapperOwnerBinding(entry);
    if (!binding || binding.referencePaths.length !== 0) {
      return;
    }

    if (removeWrapperOwnerPath(entry.path)) {
      changed = true;
    }
  });

  return changed;
}

function foldWrapperObjects(ast, options = {}) {
  const { wrapperMap, removableEntries } = collectWrapperObjects(ast, options);
  const applied = applyWrapperObjects(ast, wrapperMap, options);
  let changed = applied;

  if (pruneResolvedWrapperProperties(ast, removableEntries, options)) {
    changed = true;
  }

  if (applied) {
    removableEntries.forEach(({ path, removable }) => {
      if (removable && removeWrapperOwnerPath(path)) {
        changed = true;
      }
    });
  }

  if (pruneUnusedWrapperOwners(removableEntries)) {
    changed = true;
  }

  return { ast, changed };
}

function getTopLevelIifeInfo(programPath) {
  const first = programPath.get("body.0");
  if (!first || !first.isExpressionStatement()) {
    return null;
  }

  let exprPath = first.get("expression");
  if (exprPath.isUnaryExpression()) {
    exprPath = exprPath.get("argument");
  }
  if (!exprPath.isCallExpression()) {
    return null;
  }

  let calleePath = exprPath.get("callee");
  if (calleePath.isUnaryExpression()) {
    calleePath = calleePath.get("argument");
  }
  if (!calleePath.isFunctionExpression()) {
    return null;
  }

  return {
    statementPath: first,
    callPath: exprPath,
    calleePath,
    argPaths: exprPath.get("arguments")
  };
}

module.exports = {
  createSandbox,
  evaluateExpression,
  evaluatePreludeStatements,
  evaluateNodes,
  foldWrapperObjects,
  generateCode,
  getPropertyKey,
  getTopLevelIifeInfo,
  inlineStringMethodCalls,
  isSafeMemberReplacement,
  literalNodeFromValue,
  replaceCallsFromSandbox,
  replaceMembersFromSandbox,
  replacePrimitiveIdentifiers,
  seedSandboxFromAliases,
  resolveDescriptor,
  traverse,
  t
};
