const path = require('path');
const pluginTester = require('babel-plugin-tester').default
const plugin = require('../src');
const defaultOptions = require('../src/defaultOptions');

pluginTester({
  plugin,
  fixtures: path.join(__dirname, '__fixtures__'),
  pluginOptions: defaultOptions,
  snapshot: true,
})