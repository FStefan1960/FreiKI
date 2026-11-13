import tseslint from 'typescript-eslint';
export default tseslint.config({
  files: ['server.js', 'src/**/*.js'],
  languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }, sourceType: 'commonjs' },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
  },
});
