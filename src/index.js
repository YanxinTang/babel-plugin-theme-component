const { pathJoin } = require('./utils');
const { addSideEffect, addDefault } = require('@babel/helper-module-imports');
const { name: pluginName } = require('../package.json');
const defaultOptions = require('./defaultOptions');

module.exports = function ({ types: t }) {
  let libraries = {};
  let specified = {};
  let selectedModule = {};
  let imported = {
    libraries: [],
    modules: {},
  };

  function importModule(moduleName, file, opts) {
    if (selectedModule[moduleName]) {
      return selectedModule[moduleName];
    }

    const { 
      libraryName, 
      libraryDirectory,
      style,
      styleDirectory,
      styleExtension,
    } = {...defaultOptions, ...opts};

    let modulePath = '';
    const isLibraryModule = moduleName === libraryName;
    if (isLibraryModule) {
      // if imported module is library
      imported.libraries.push(libraryName);
      if (style && imported.modules[libraryName]) {
        console.warn(`[${pluginName}] If you are using both on-demand and importing all, make sure to invoke the importing all first.`);
      }
      modulePath = pathJoin(libraryName);
    } else {
      if (imported.modules[libraryName]) {
        imported.modules[libraryName].push(moduleName);
      } else {
        imported.modules[libraryName] = [moduleName];
      }
      // else imported module is a component sub module
      modulePath = pathJoin(libraryName, libraryDirectory, moduleName);
    }

    if (style) {
      if (isLibraryModule || !imported.libraries.includes(libraryName)) {
        // if library already been imported all, do not import component style
        const styleName = isLibraryModule ? 'index' : moduleName;
        const stylePath = pathJoin(libraryName, styleDirectory, `${styleName}.${styleExtension}`);
        addSideEffect(file.path, stylePath);
      }
    }
    return selectedModule[moduleName] = addDefault(file.path, modulePath, { nameHint: moduleName });
  }

  function buildExpressionHandler(node, props, path, state) {
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    props.forEach(prop => {
      if (!t.isIdentifier(node[prop])) return;
      const moduleName = libraries[node[prop].name] || specified[node[prop].name];
      if (moduleName) {
        node[prop] = importModule(node[prop].name, file, state.opts);
      }
    });
  }
  
  function buildDeclaratorHandler(node, prop, path, state) {
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    if (!t.isIdentifier(node[prop])) return;
    const moduleName = libraries[node[prop].name] || specified[node[prop].name];
    if (moduleName) {
      node[prop] = importModule(node[prop].name, file, state.opts);
    }
  }

  return {
    name: pluginName,
    visitor: {
      Program() {
        libraries = {};
        specified = {};
        selectedModule = {};
        imported = {
          libraries: [],
          modules: {},
        };
      },
      ImportDeclaration(path, { opts }) {
        const { node } = path;
        const { value } = node.source;
        if (value === opts.libraryName) {
          for (const spec of node.specifiers) {
            if (t.isImportSpecifier(spec)) {
              specified[spec.local.name] = spec.imported.name;
            } else {
              libraries[spec.local.name] = value;
            }
          }
          if (!imported.libraries.includes(value)) {
            path.remove();
          }
        }
      },
      CallExpression(path, state) {
        const { node } = path;
        const file = (path && path.hub && path.hub.file) || (state && state.file);
        const { name } = node.callee;

        if (t.isIdentifier(node.callee)) {
          if (libraries[name]) {
            node.callee = importModule(libraries[name], file, state.opts);
          } else if (specified[name]) {
            node.callee = importModule(specified[name], file, state.opts);
          }
        }

        node.arguments = node.arguments.map(arg => {
          const { name: argName } = arg;
          if (specified[argName]) {
            return importModule(specified[argName], file, state.opts);
          } else if (libraries[argName]) {
            return importModule(libraries[argName], file, state.opts);
          }
          return arg;
        });
      },
      MemberExpression(path, state) { 
        const file = (path && path.hub && path.hub.file) || (state && state.file);
        if (!file) return;
        const { node } = path;
        if (libraries[node.object.name] || specified[node.object.name]) {
          node.object = importModule(node.object.name, file, state.opts);
        }
      },
      AssignmentExpression(path, state) {
        const file = (path && path.hub && path.hub.file) || (state && state.file);
        if (!file) return;
        const { node } = path;
        if (node.operator !== '=') return;
        const moduleName = libraries[node.right.name] || specified[node.right.name];
        if (moduleName) {
          node.right = importModule(moduleName, file, state.opts);
        }
      },
      ArrayExpression(path, { opts }) {
        const file = (path && path.hub && path.hub.file) || (state && state.file);
        if (!file) return;
        const { elements } = path.node;

        elements.forEach((item, key) => {
          const moduleName = libraries[item.name] || specified[item.name];
          if (moduleName) {
            elements[key] = importModule(moduleName, file, opts);
          }
        });
      },
      Property(path, state) {
        const { node } = path;
        buildDeclaratorHandler(node, 'value', path, state);
      },

      VariableDeclarator(path, state) {
        const { node } = path;
        buildDeclaratorHandler(node, 'init', path, state);
      },

      LogicalExpression(path, state) {
        const { node } = path;
        buildExpressionHandler(node, ['left', 'right'], path, state);
      },

      ConditionalExpression(path, state) {
        const { node } = path;
        buildExpressionHandler(node, ['test', 'consequent', 'alternate'], path, state);
      },

      IfStatement(path, state) {
        const { node } = path;
        buildExpressionHandler(node, ['test'], path, state);
        buildExpressionHandler(node.test, ['left', 'right'], path, state);
      },
    },
  }
}