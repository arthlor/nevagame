// eslint.config.js
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }]
    }
  },
  {
    // Build tooling is plain ESM JavaScript, not TypeScript. It was previously
    // unlinted entirely (~3,900 lines, including the 1,789-line Blender CLI),
    // so it gets the general rules with Node globals and the default parser.
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        __dirname: "readonly",
        __filename: "readonly"
      }
    },
    rules: {
      // Warn, not error. There are 19 real dead-code findings in
      // tools/blender/cli.mjs (18 unused imports left over from when this file
      // did its own pooling/optimization, plus a dead `runBlender`). They are
      // deliberately NOT fixed here: `computeToolchainHash` hashes every .mjs
      // under tools/blender/, so ANY edit to cli.mjs invalidates all 196
      // cached assets and forces a full Blender regeneration. Batch that
      // cleanup with an art regeneration, not with a lint config change.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }]
    }
  },
  {
    ignores: [".agents/**", "dist/**", "node_modules/**", "generated/**", "public/**"]
  }
];
