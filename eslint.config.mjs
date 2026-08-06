import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

const sourceFiles = ["**/*.{ts,tsx}"];
const typedRules = {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-floating-promises": "warn",
  "@typescript-eslint/no-misused-promises": "warn",
  "@typescript-eslint/no-unsafe-argument": "warn",
  "@typescript-eslint/no-unsafe-assignment": "warn",
  "@typescript-eslint/no-unsafe-call": "warn",
  "@typescript-eslint/no-unsafe-member-access": "warn",
  "@typescript-eslint/no-unsafe-return": "warn",
  "@typescript-eslint/no-unused-vars": "off",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "import/no-duplicates": "error",
  "no-console": ["error", { allow: ["warn", "error"] }],
};

const workspace = (files, project, extra = {}) => ({
  files,
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  plugins: { import: importPlugin, "unused-imports": unusedImports },
  rules: { ...typedRules, ...extra },
  settings: {
    "import/resolver": { typescript: { project } },
  },
});

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "node_modules/**", "apps/api/data/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: sourceFiles })),
  workspace(["apps/api/**/*.ts"], "apps/api/tsconfig.json"),
  workspace(["packages/shared/**/*.ts"], "packages/shared/tsconfig.json"),
  workspace(["apps/web/**/*.{ts,tsx}"], "apps/web/tsconfig.json", {
    ...react.configs.recommended.rules,
    ...reactHooks.configs.recommended.rules,
    "react/react-in-jsx-scope": "off",
    "react-hooks/exhaustive-deps": "error",
  }),
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
  },
  {
    files: ["apps/api/src/lib/logger.ts", "apps/api/src/scripts/**/*.ts", "**/*.test.{ts,tsx}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
);
