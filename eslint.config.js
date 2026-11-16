import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'files', 'reference'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // 引擎與資料必須是純 TypeScript：不可依賴 React 或瀏覽器專用 API
    // 模擬器的機器人與統計也要可重現，套用同樣的限制（CLI 入口 simulate.ts 例外，可以計時）
    files: ['src/engine/**/*.ts', 'src/data/**/*.ts', 'src/sim/greedyBot.ts', 'src/sim/simulator.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['react', 'react-dom', 'react/*', 'react-dom/*', '**/ui/**'], message: '引擎與資料不可 import React 或 UI。' }] },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: '引擎不可依賴瀏覽器環境。' },
        { name: 'document', message: '引擎不可依賴瀏覽器環境。' },
        { name: 'localStorage', message: '引擎不可依賴瀏覽器環境。' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '請改用 engine/rng.ts 的種子亂數。' },
        { object: 'Date', property: 'now', message: '引擎不可讀取時間。' },
      ],
    },
  },
  {
    files: ['src/sim/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
