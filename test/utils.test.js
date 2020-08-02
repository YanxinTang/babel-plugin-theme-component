const utils = require('../src/utils');

describe('utils', () => {
  test('path join', () => {
    const cases = [
      {
        input: ['a', 'b', 'c'],
        expected: 'a/b/c'
      },
      {
        input: ['a', '', 'c'],
        expected: 'a/c'
      }
    ];
    for (const { input, expected } of cases) {
      expect(utils.pathJoin(...input)).toBe(expected);
    }
  });
});