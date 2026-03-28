const { clone } = require("../shared");
const { runPatternPass } = require("./shared-pattern-pass");
const { createSandbox, evaluateExpression, evaluateNodes, generateCode, traverse, t } = require("./pattern-utils");

function geetest4GuardedPass(ast) {
  let changed = false;
  const body = ast.program.body;

  if (body.length >= 5) {
    const sandbox = createSandbox();
    const decriptPropName = body[2] && body[2].expression && body[2].expression.left ? generateCode(body[2].expression.left) : "";
    const ctrlVarName = body[3] && body[3].expression && body[3].expression.left ? generateCode(body[3].expression.left) : "";

    if (decriptPropName && evaluateNodes(body.slice(0, 5), sandbox)) {
      traverse(ast, {
        VariableDeclaration(path) {
          if (
            path.node.declarations.length !== 3 ||
            !path.get("declarations.0.init").node ||
            generateCode(path.get("declarations.0.init").node) !== decriptPropName
          ) {
            return;
          }

          const next1 = path.getNextSibling();
          const next2 = next1 && next1.getNextSibling();
          if (!next1 || !next2 || !next1.node || !next2.node) {
            return;
          }

          const candidateNames = [0, 2]
            .map((index) => path.get(`declarations.${index}.id`))
            .filter((idPath) => idPath && idPath.isIdentifier())
            .map((idPath) => idPath.node.name);

          candidateNames.forEach((name) => {
            const binding = path.scope.getBinding(name);
            if (!binding) {
              return;
            }
            binding.referencePaths.forEach((refPath) => {
              const parent = refPath.parentPath;
              if (!parent.isCallExpression() || parent.node.arguments.length !== 1 || !parent.get("arguments.0").isNumericLiteral()) {
                return;
              }
              const argValue = parent.node.arguments[0].value;
              const result = evaluateExpression(`${decriptPropName}(${argValue})`, sandbox);
              if (!result.ok) {
                return;
              }
              parent.replaceWith(t.valueToNode(result.value));
              changed = true;
            });
          });

          path.remove();
          next1.remove();
          next2.remove();
          changed = true;
        },
        ForStatement(path) {
          if (
            path.node.init !== null ||
            path.node.update !== null ||
            !path.get("test").isBinaryExpression() ||
            !generateCode(path.get("test.right").node).includes(ctrlVarName) ||
            !path.get("body").isBlockStatement() ||
            path.get("body.body").length !== 1 ||
            !path.get("body.body.0").isSwitchStatement()
          ) {
            return;
          }

          const testNamePath = path.get("test.left");
          if (!testNamePath.isIdentifier()) {
            return;
          }

          const testName = testNamePath.node.name;
          const statements = [];
          path.get("body.body.0.cases").forEach((casePath) => {
            casePath.get("consequent").forEach((stmtPath) => {
              if (stmtPath.isBreakStatement()) {
                return;
              }
              if (
                stmtPath.isExpressionStatement() &&
                stmtPath.get("expression").isAssignmentExpression() &&
                stmtPath.get("expression.left").isIdentifier({ name: testName })
              ) {
                return;
              }
              statements.push(clone(stmtPath.node));
            });
          });

          if (statements.length > 0) {
            path.replaceWithMultiple(statements);
            const prev = path.getPrevSibling();
            if (prev && prev.node) {
              prev.remove();
            }
            changed = true;
          }
        }
      });
    }
  }

  return { ast, changed };
}

runPatternPass(geetest4GuardedPass);
