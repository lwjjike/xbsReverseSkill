const { parseArgs, parseFile, saveAst, t, traverse } = require("./shared");

const typeAlias = {
  ArrayExpression: "array",
  AssignmentExpression: "assign",
  AwaitExpression: "await",
  BinaryExpression: "bin",
  BooleanLiteral: "bool",
  CallExpression: "call",
  ConditionalExpression: "cond",
  FunctionExpression: "func",
  Identifier: "id",
  LogicalExpression: "logic",
  MemberExpression: "member",
  NewExpression: "new",
  NullLiteral: "null",
  NumericLiteral: "num",
  ObjectExpression: "obj",
  SequenceExpression: "seq",
  StringLiteral: "str",
  ThisExpression: "this",
  UnaryExpression: "unary"
};

function shouldRename(name) {
  return /^_0x/i.test(name) || /^[a-zA-Z]$/.test(name);
}

function buildName(scopeTag, binding, init) {
  const fromInit = init && typeAlias[init.type];
  const fromRef = binding && binding.referencePaths[0] && typeAlias[binding.referencePaths[0].parentPath.type];
  const base = fromInit || fromRef || "value";
  return `${scopeTag}_${base}`;
}

const { inputPath, outputPath } = parseArgs();
const ast = parseFile(inputPath);

traverse(ast, {
  VariableDeclarator(path) {
    if (!path.get("id").isIdentifier()) {
      return;
    }
    const name = path.node.id.name;
    if (!shouldRename(name)) {
      return;
    }
    const binding = path.scope.getBinding(name);
    const scopeTag = path.scope.block.type === "Program" ? "glb" : "loc";
    const nextName = path.scope.generateUidIdentifier(buildName(scopeTag, binding, path.node.init)).name;
    path.scope.rename(name, nextName);
  },
  CatchClause(path) {
    if (path.node.param && t.isIdentifier(path.node.param)) {
      path.scope.rename(path.node.param.name, path.scope.generateUidIdentifier("error_msg").name);
    }
  },
  "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": {
    exit(path) {
      if (path.node.id && t.isIdentifier(path.node.id) && shouldRename(path.node.id.name)) {
        path.scope.rename(path.node.id.name, path.scope.generateUidIdentifier("fn").name);
      }
      path.node.params.forEach((param, index) => {
        if (t.isIdentifier(param) && shouldRename(param.name)) {
          path.scope.rename(param.name, `arg_${index + 1}`);
        }
      });
    }
  }
});

saveAst(ast, outputPath);
