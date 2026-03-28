const vm = require("vm");
const { clone } = require("../shared");
const { runPatternPass } = require("./shared-pattern-pass");
const { createSandbox, evaluateExpression, evaluateNodes, evaluatePreludeStatements, foldWrapperObjects, generateCode, literalNodeFromValue, replaceCallsFromSandbox, replaceMembersFromSandbox, replacePrimitiveIdentifiers, seedSandboxFromAliases, traverse, t } = require("./pattern-utils");

function inlineAssignmentObjects(ast) {
  let changed = false;

  traverse(ast, {
    VariableDeclaration(path) {
      if (path.node.declarations.length !== 1) {
        return;
      }

      const declaration = path.get("declarations.0");
      if (!declaration.get("id").isIdentifier() || !declaration.get("init").isObjectExpression({ properties: [] })) {
        return;
      }

      const name = declaration.node.id.name;
      const binding = path.scope.getBinding(name);
      if (!binding) {
        return;
      }

      const objectEntries = Object.create(null);
      binding.referencePaths.forEach((refPath) => {
        const memberPath = refPath.parentPath;
        const assignmentPath = memberPath && memberPath.parentPath;
        if (
          !memberPath ||
          !memberPath.isMemberExpression({ object: refPath.node }) ||
          !assignmentPath ||
          !assignmentPath.isAssignmentExpression({ left: memberPath.node, operator: "=" })
        ) {
          return;
        }

        const key = memberPath.node.computed ? String(memberPath.node.property.value) : memberPath.node.property.name;
        objectEntries[key] = clone(assignmentPath.node.right);
        assignmentPath.remove();
        changed = true;
      });

      const properties = Object.entries(objectEntries).map(([key, valueNode]) => t.objectProperty(t.stringLiteral(key), valueNode));
      if (properties.length > 0) {
        declaration.get("init").replaceWith(t.objectExpression(properties));
        changed = true;
      }
    }
  });

  return changed;
}

function getLeadingPreludeNodes(ast, maxStatements = 12) {
  const collected = [];
  for (const node of ast.program.body) {
    if (collected.length >= maxStatements) {
      break;
    }
    if (t.isFunctionDeclaration(node) || t.isVariableDeclaration(node)) {
      collected.push(node);
      continue;
    }
    break;
  }
  return collected;
}

function findRotationIifeNode(ast, preludeCount) {
  const node = ast.program.body[preludeCount];
  if (!node || !t.isExpressionStatement(node)) {
    return null;
  }
  const expr = node.expression;
  if (t.isCallExpression(expr) && (t.isFunctionExpression(expr.callee) || t.isArrowFunctionExpression(expr.callee))) {
    return node;
  }
  return null;
}

function findPxSetterFunctionName(ast) {
  for (const node of ast.program.body) {
    if (!t.isFunctionDeclaration(node) || !node.id) {
      continue;
    }
    let matched = false;
    traverse(t.file(t.program([clone(node)])), {
      AssignmentExpression(path) {
        if (path.get("left").isIdentifier({ name: "PX" })) {
          matched = true;
          path.stop();
        }
      }
    });
    if (matched) {
      return node.id.name;
    }
  }
  return null;
}

function findDecoderFunctionName(ast) {
  for (const node of ast.program.body) {
    if (t.isFunctionDeclaration(node) && node.id && node.id.name) {
      return node.id.name;
    }
  }
  return null;
}

function collectValidationTargets(ast) {
  const targets = [];
  const seen = new Set();

  traverse(ast, {
    CallExpression(path) {
      const firstArgPath = path.get("arguments.0");
      if (
        !path.get("callee").isMemberExpression() ||
        !firstArgPath ||
        !firstArgPath.node ||
        !firstArgPath.isStringLiteral({ value: "|" })
      ) {
        return;
      }

      const propertyPath = path.get("callee.property");
      if (!propertyPath.isCallExpression() || !propertyPath.get("arguments.0").isNumericLiteral()) {
        return;
      }

      const argValue = propertyPath.get("arguments.0").node.value;
      const objectPath = path.get("callee.object");
      if (!objectPath.isCallExpression() || !objectPath.get("arguments.0").isNumericLiteral()) {
        return;
      }

      const orderArgValue = objectPath.get("arguments.0").node.value;
      const token = `split:${argValue}:order:${orderArgValue}`;
      if (seen.has(token)) {
        return;
      }

      seen.add(token);
      targets.push({
        argValue,
        expected: "split",
        orderArgValue
      });
    }
  });

  return targets;
}

function runCodeInSandbox(code, sandbox, timeoutMs) {
  try {
    vm.runInNewContext(code, sandbox, { timeout: timeoutMs });
    return true;
  } catch (error) {
    return false;
  }
}

function buildDynamicDecoderSandbox(preludeCode, rotationCode, pxSetterName, pxValue) {
  const sandbox = createSandbox();
  if (!runCodeInSandbox(preludeCode, sandbox, 5000)) {
    return null;
  }

  sandbox[pxSetterName] = function patchedPxSetter() {
    sandbox.PX = pxValue;
    return "nBfa";
  };

  // OB variants can spend noticeably longer in the bootstrap rotation loop.
  if (!runCodeInSandbox(rotationCode, sandbox, 3000)) {
    return null;
  }

  return sandbox;
}

function validateDynamicDecoderSandbox(sandbox, decoderName, targets) {
  if (!sandbox || typeof sandbox[decoderName] !== "function" || targets.length === 0) {
    return false;
  }

  try {
    return targets.every((target) => {
      if (sandbox[decoderName](target.argValue) !== target.expected) {
        return false;
      }
      if (typeof target.orderArgValue !== "number") {
        return true;
      }
      const orderValue = sandbox[decoderName](target.orderArgValue);
      return typeof orderValue === "string" && orderValue.includes("|");
    });
  } catch (error) {
    return false;
  }
}

function bootstrapDynamicDecoderSandbox(ast) {
  const preludeNodes = getLeadingPreludeNodes(ast);
  const rotationNode = findRotationIifeNode(ast, preludeNodes.length);
  const pxSetterName = findPxSetterFunctionName(ast);
  const decoderName = findDecoderFunctionName(ast);
  const targets = collectValidationTargets(ast);
  const preludeCode = preludeNodes.map((node) => generateCode(node)).join(";\n");
  const rotationCode = rotationNode ? generateCode(rotationNode) : "";

  if (!rotationNode || !pxSetterName || !decoderName || targets.length === 0) {
    return null;
  }

  const pxCandidates = [];
  for (let pxValue = 256; pxValue <= 512; pxValue += 1) {
    pxCandidates.push(pxValue);
  }
  for (let pxValue = 0; pxValue < 256; pxValue += 1) {
    pxCandidates.push(pxValue);
  }

  for (const pxValue of pxCandidates) {
    const sandbox = buildDynamicDecoderSandbox(preludeCode, rotationCode, pxSetterName, pxValue);
    if (!validateDynamicDecoderSandbox(sandbox, decoderName, targets)) {
      continue;
    }
    return {
      sandbox,
      decoderName,
      pxValue
    };
  }

  return null;
}

function obVariantPass(ast) {
  let changed = false;
  const body = ast.program.body;

  if (body.length >= 3 && body[2].type === "VariableDeclaration" && body[2].declarations.length > 0 && t.isIdentifier(body[2].declarations[0].id)) {
    const sandbox = createSandbox();
    const decoderName = body[2].declarations[0].id.name;
    if (evaluateNodes(body.slice(0, 3), sandbox) && typeof sandbox[decoderName] === "function") {
      ast.program.body = body.slice(3).map((node) => clone(node));
      changed = true;

      traverse(ast, {
        CallExpression(path) {
          if (!path.get("callee").isIdentifier({ name: decoderName })) {
            return;
          }
          const result = evaluateExpression(path.toString(), sandbox);
          if (!result.ok) {
            return;
          }
          path.replaceWith(t.valueToNode(result.value));
          changed = true;
        },
        BinaryExpression: {
          exit(path) {
            const evaluated = path.evaluate();
            if (evaluated.confident) {
              path.replaceWith(t.valueToNode(evaluated.value));
              changed = true;
            }
          }
        }
      });
    }
  }

  const dynamicDecoder = bootstrapDynamicDecoderSandbox(ast);
  const prelude = dynamicDecoder ? null : evaluatePreludeStatements(ast, {
    sandbox: createSandbox(),
    maxStatements: 8,
    timeoutMs: 1500
  });
  const sandbox = dynamicDecoder ? dynamicDecoder.sandbox : prelude.sandbox;
  if (dynamicDecoder || prelude.executedCount > 0) {
    if (seedSandboxFromAliases(ast, sandbox)) {
      changed = true;
    }

    if (replaceCallsFromSandbox(ast, sandbox, {
      timeoutMs: 800,
      allowPredicate: (path) => path.node.arguments.every((arg) => t.isLiteral(arg))
    })) {
      changed = true;
    }

    if (replaceMembersFromSandbox(ast, sandbox)) {
      changed = true;
    }

    traverse(ast, {
      VariableDeclarator(path) {
        const initPath = path.get("init");
        if (!initPath.node) {
          return;
        }
        const result = evaluateExpression(generateCode(initPath.node), sandbox, 800);
        const node = result.ok ? literalNodeFromValue(result.value) : null;
        if (!node) {
          return;
        }
        initPath.replaceWith(node);
        changed = true;
      }
    });

    if (replacePrimitiveIdentifiers(ast, sandbox)) {
      changed = true;
    }

    if (replaceMembersFromSandbox(ast, sandbox)) {
      changed = true;
    }

    if (replaceCallsFromSandbox(ast, sandbox, {
      timeoutMs: 800,
      allowPredicate: (path) => path.node.arguments.every((arg) => t.isLiteral(arg))
    })) {
      changed = true;
    }
  }

  if (inlineAssignmentObjects(ast)) {
    changed = true;
  }

  let localChanged = false;
  do {
    ({ changed: localChanged } = foldWrapperObjects(ast, {
      sandbox,
      timeoutMs: 800
    }));
    if (localChanged) {
      changed = true;
    }
  } while (localChanged);

  return { ast, changed };
}

runPatternPass(obVariantPass);
