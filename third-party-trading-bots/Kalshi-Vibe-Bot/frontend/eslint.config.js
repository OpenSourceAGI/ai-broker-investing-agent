import path from 'node:path'
import { fileURLToPath } from 'node:url'

import eslint from '@eslint/js'
import globals from 'globals'
import reactPlugin from 'eslint-plugin-react'
import tseslint from 'typescript-eslint'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  { ignores: ['dist/**', 'eslint.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react: reactPlugin },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
        jsxPragma: null,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'commonjs',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
)
