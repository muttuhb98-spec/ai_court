export default [{
  files: ['**/*.js', '**/*.jsx'],
  languageOptions: {
    ecmaVersion: 'latest', sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: {
      process: 'readonly', console: 'readonly', structuredClone: 'readonly', fetch: 'readonly',
      localStorage: 'readonly', location: 'readonly', document: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
      Date: 'readonly', Math: 'readonly', JSON: 'readonly', Promise: 'readonly', Error: 'readonly', Number: 'readonly', String: 'readonly'
    }
  },
  rules: {}
}];
