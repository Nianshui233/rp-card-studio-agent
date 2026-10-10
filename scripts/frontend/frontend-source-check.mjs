import { parse } from 'acorn';
const UTILITIES = new Set(['createScriptIdIframe', 'createScriptIdDiv', 'teleportStyle']);

// These names are template imports, not host globals. Work with syntax nodes, never comments or explanatory examples.
export function checkFrontendScript(code) {
  const issues = [];
  let ast;
  try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (e) { return { ok: false, issues: ['前端脚本无法解析：' + e.message] }; }
  const scopes = new Map();
  const addPattern = (node, scope) => {
    if (!node) return;
    if (node.type === 'Identifier') scope.names.add(node.name);
    else if (node.type === 'RestElement') addPattern(node.argument, scope);
    else if (node.type === 'AssignmentPattern') addPattern(node.left, scope);
    else if (node.type === 'ArrayPattern') node.elements.forEach(x => addPattern(x, scope));
    else if (node.type === 'ObjectPattern') node.properties.forEach(x => addPattern(x.type === 'RestElement' ? x.argument : x.value, scope));
  };
  const root = { parent: null, names: new Set(), functionScope: true };
  function collect(node, scope = root) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id) scope.names.add(node.id.name);
    if (node.type === 'ClassDeclaration' && node.id) scope.names.add(node.id.name);
    if (/^(?:Function|ArrowFunction)/.test(node.type)) {
      scope = { parent: scope, names: new Set(), functionScope: true };
      if (node.id) scope.names.add(node.id.name); node.params.forEach(p => addPattern(p, scope));
    } else if (['BlockStatement','CatchClause','ForStatement','ForInStatement','ForOfStatement','SwitchStatement'].includes(node.type)) {
      scope = { parent: scope, names: new Set(), functionScope: false }; addPattern(node.param, scope);
    }
    scopes.set(node, scope);
    if (node.type === 'VariableDeclaration') {
      let target = scope; if (node.kind === 'var') while (!target.functionScope) target = target.parent;
      node.declarations.forEach(d => addPattern(d.id, target));
    }
    if (node.type === 'ImportDeclaration') node.specifiers.forEach(s => addPattern(s.local, scope));
    for (const [key, value] of Object.entries(node)) if (!['start', 'end'].includes(key)) {
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) collect(child, scope); });
      else if (value?.type) collect(value, scope);
    }
  }
  collect(ast);
  function check(node, parent, key) {
    if (!node?.type) return;
    if (node.type === 'Identifier' && UTILITIES.has(node.name)) {
      const propertyName = parent?.type === 'ImportSpecifier' && key === 'imported' || parent?.type === 'ExportSpecifier' && key === 'exported' || parent?.type === 'MemberExpression' && key === 'property' && !parent.computed
        || ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent?.type) && key === 'key' && !parent.computed && !parent.shorthand;
      if (!propertyName) {
        let scope = scopes.get(node), found = false;
        while (scope) { if (scope.names.has(node.name)) { found = true; break; } scope = scope.parent; }
        if (!found) issues.push('模板辅助函数未导入或未打包，不能当成宿主全局：' + node.name);
      }
    }
    for (const [k, value] of Object.entries(node)) {
      if (Array.isArray(value)) value.forEach(child => check(child, node, k));
      else if (value?.type) check(value, node, k);
    }
  }
  check(ast);
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}
