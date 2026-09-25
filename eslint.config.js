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
    // Build tooling (the art CLI, cache and GLB utilities, codegen, world
    // tools) is plain ESM JavaScript, not TypeScript, so it gets the general
    // rules with Node globals and the default parser.
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
      // Warn, not error: remaining findings are tolerated in tooling scripts.
      // Editing a file in tools/art/cache.mjs PIPELINE_TOOLCHAIN_FILES changes
      // the published manifest's toolchain hash, so run `npm run art:sync --
      // --all` after such a cleanup.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }]
    }
  },
  {
    ignores: [".agents/**", ".claude/worktrees/**", "dist/**", "node_modules/**", "generated/**", "public/**", "output/**", "test-results/**"]
  }
];
