const { clone, parseArgs, parseFile, reparse, saveAst, t, traverse } = require("./shared");

function collectDispatcherValue(node, dispatcherMap) {
  if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node)) {
    return { type: "literal", value: clone(node) };
  }
  if (t.isMemberExpression(node) && t.isIdentifier(node.object) && !node.computed && t.isIdentifier(node.property)) {
    return { type: "member", objectName: node.object.name, key: node.property.name };
  }
  if (t.isFunctionExpression(node) && node.body.body.length === 1 && t.isReturnStatement(node.body.body[0])) {
    const arg = node.body.body[0].argument;
    if (t.isBinaryExpression(arg) && t.isIdentifier(arg.left) && t.isIdentifier(arg.right)) {
      return { type: "binary", operator: arg.operator };
    }
    if (t.isLogicalExpression(arg) && t.isIdentifier(arg.left) && t.isIdentifier(arg.right)) {
      return { type: "logical", operator: arg.operator };
    }
    if (t.isCallExpression(arg) && t.isIdentifier(arg.callee)) {
      return { type: "call" };
    }
    if (t.isCallExpression(arg) && t.isMemberExpression(arg.callee) && t.isIdentifier(arg.callee.object) && !arg.callee.computed && t.isIdentifier(arg.callee.property)) {
      const target = dispatcherMap[arg.callee.object.name] && dispatcherMap[arg.callee.object.name][arg.callee.property.name];
      if (target && (target.type === "binary" || target.type === "logical" || target.type === "call")) {
        return target;
      }
    }
  }
  return null;
}

function inlineDispatchers(ast) {
  let changed = false;
  const dispatcherMap = Object.create(null);
  const removableEntries = [];

  traverse(ast, {
    VariableDeclarator(path) {
      if (!path.get("id").isIdentifier() || !path.get("init").isObjectExpression()) {
        return;
      }
      const name = path.node.id.name;
      const collected = dispatcherMap[name] || Object.create(null);
      let localChanged = false;
      let supportedPropertyCount = 0;
      let collectedPropertyCount = 0;
      path.get("init.properties").forEach(propertyPath => {
        if (!propertyPath.isObjectProperty()) {
          return;
        }
        supportedPropertyCount += 1;
        const keyNode = propertyPath.node.key;
        const key = t.isIdentifier(keyNode) ? keyNode.name : keyNode.value;
        const value = collectDispatcherValue(propertyPath.node.value, dispatcherMap);
        if (value) {
          collected[key] = value;
          localChanged = true;
          collectedPropertyCount += 1;
        }
      });
      if (localChanged) {
        dispatcherMap[name] = collected;
        removableEntries.push({
          path,
          removable: supportedPropertyCount > 0 && supportedPropertyCount === collectedPropertyCount
        });
      }
    }
  });

  traverse(ast, {
    CallExpression(path) {
      if (!path.get("callee").isMemberExpression()) {
        return;
      }
      const objectName = path.node.callee.object.name;
      const key = path.node.callee.computed ? path.node.callee.property.value : path.node.callee.property.name;
      const entry = dispatcherMap[objectName] && dispatcherMap[objectName][key];
      if (!entry) {
        return;
      }
      const args = path.node.arguments.map(arg => clone(arg));
      if (entry.type === "binary" && args.length >= 2) {
        path.replaceWith(t.binaryExpression(entry.operator, args[0], args[1]));
        changed = true;
      } else if (entry.type === "logical" && args.length >= 2) {
        path.replaceWith(t.logicalExpression(entry.operator, args[0], args[1]));
        changed = true;
      } else if (entry.type === "call" && args.length >= 1) {
        path.replaceWith(t.callExpression(args[0], args.slice(1)));
        changed = true;
      }
    },
    MemberExpression(path) {
      if (!path.get("object").isIdentifier()) {
        return;
      }
      const objectName = path.node.object.name;
      const key = path.node.computed ? path.node.property.value : path.node.property.name;
      const entry = dispatcherMap[objectName] && dispatcherMap[objectName][key];
      if (!entry) {
        return;
      }
      if (entry.type === "literal") {
        path.replaceWith(clone(entry.value));
        changed = true;
      }
    }
  });

  if (changed) {
    removableEntries.forEach(({ path, removable }) => {
      if (removable && !path.removed) {
        path.remove();
      }
    });
  }

  return { ast, changed };
}

const { inputPath, outputPath } = parseArgs();
let ast = parseFile(inputPath);
let changed = false;
do {
  ({ ast, changed } = inlineDispatchers(ast));
  if (changed) {
    ast = reparse(ast);
  }
} while (changed);
saveAst(ast, outputPath);
