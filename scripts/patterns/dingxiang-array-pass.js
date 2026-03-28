const { clone } = require("../shared");
const { runPatternPass } = require("./shared-pattern-pass");
const { getTopLevelIifeInfo, traverse, t } = require("./pattern-utils");

function dingxiangArrayPass(ast) {
  let changed = false;

  traverse(ast, {
    Program(programPath) {
      const info = getTopLevelIifeInfo(programPath);
      if (!info) {
        return;
      }

      const actualArgs = info.argPaths.map((argPath) => argPath.node);
      const formalParams = info.calleePath.node.params;
      const paramElementMap = Object.create(null);

      formalParams.forEach((paramNode, index) => {
        if (!t.isIdentifier(paramNode)) {
          return;
        }
        const actualNode = actualArgs[index];
        if (t.isArrayExpression(actualNode)) {
          paramElementMap[paramNode.name] = actualNode.elements.map((element) => (element ? clone(element) : t.identifier("undefined")));
        }
      });

      if (Object.keys(paramElementMap).length === 0) {
        return;
      }

      info.statementPath.traverse({
        UnaryExpression(path) {
          const callPath = path.get("argument");
          if (
            !callPath.isCallExpression() ||
            !callPath.get("callee").isFunctionExpression() ||
            callPath.node.arguments.length !== 2 ||
            !callPath.get("arguments").every((argPath) => argPath.isArrayExpression())
          ) {
            return;
          }

          callPath.get("callee.params").forEach((paramPath) => {
            if (!paramPath.isIdentifier()) {
              return;
            }
            const elements = paramElementMap[paramPath.node.name];
            if (!elements) {
              return;
            }
            const binding = paramPath.scope.getBinding(paramPath.node.name);
            if (!binding || !binding.constant) {
              return;
            }
            binding.referencePaths.forEach((refPath) => {
              const parent = refPath.parentPath;
              if (!parent.isMemberExpression({ object: refPath.node }) || !parent.get("property").isNumericLiteral()) {
                return;
              }
              const index = parent.node.property.value;
              if (!Number.isInteger(index) || index < 0 || index >= elements.length) {
                return;
              }
              parent.replaceWith(clone(elements[index]));
              changed = true;
            });
          });

          path.replaceWithMultiple(callPath.get("callee.body").node.body.map((node) => clone(node)));
          changed = true;
        }
      });
    }
  });

  return { ast, changed };
}

runPatternPass(dingxiangArrayPass);
