const { join } = require('./utils');
const { addSideEffect, addDefault } = require('@babel/helper-module-imports');
const { name: pluginName } = require('../package.json');

const defaultOptions = {
  libraryName: 'module',
  libraryDirectory: 'dist',
  style: false,
  styleDirectory: 'dist',
  styleExtension: 'css',
}

const imported = {
  libraries: [],
  modules: {},
};
const importAll = {};

module.exports = function ({ types: t }) {
  let libraries = {};
  let specified = {};
  let selectedModule = {};

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
      modulePath = join(libraryName);
    } else {
      if (imported.modules[libraryName]) {
        console.log(imported.modules[libraryName])
        imported.modules[libraryName].push(moduleName);
      } else {
        imported.modules[libraryName] = [moduleName];
      }
      // else imported module is a component sub module
      modulePath = join(libraryName, libraryDirectory, moduleName);
    }

    if (style) {
      if (isLibraryModule || !imported.libraries.includes(libraryName)) {
        // if library already been imported all, do not import component style
        const styleName = isLibraryModule ? 'index' : moduleName;
        const stylePath = join(libraryName, styleDirectory, `${styleName}.${styleExtension}`);
        addSideEffect(file.path, stylePath);
      }
    }
    return selectedModule[moduleName] = addDefault(file.path, modulePath, { nameHint: moduleName });
  }

  function buildExpressionHandler(node, props, path, state) {
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    props.forEach(prop => {
      if (!t.isIdentifier(node[prop])) return;
      if (specified[node[prop].name]) {
        node[prop] = importModule(node[prop].name, file, state.opts);
      }
    });
  }
  
  function buildDeclaratorHandler(node, prop, path, state) {
    const file = (path && path.hub && path.hub.file) || (state && state.file);
    if (!t.isIdentifier(node[prop])) return;
    if (specified[node[prop].name]) {
      node[prop] = importModule(node[prop].name, file, state.opts);
    }
  }

  return {
    visitor: {
      Program() {
        libraries = {};
        specified = {};
        selectedModule = {};
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
          // console.log('Identifier')
        } else {
          node.arguments = node.arguments.map(arg => {
            if (specified[arg.name]) {
              return importModule(specified[arg.name], file, state.opts);
            } else if (libraries[arg.name]) {
              return importModule(libraries[arg.name], file, state.opts);
            }
            return arg;
          });
        }
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
        if (libraries[node.right.name] || specified[node.right.name]) {
          node.right = importModule(node.right.name, file, state.opts);
        }
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