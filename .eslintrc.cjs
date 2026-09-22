/**
 * Names:
 * - Folders are kebab-case: app/orders, app/webhooks, app/dashboard.
 * - Modules are kebab-case. Server-only modules end in .server.ts.
 * - React components that are not routes are PascalCase.tsx.
 * - app/routes keeps React Router flat-route names (dots and a leading underscore).
 *
 * Size:
 * - A file stays under 300 lines.
 * - A function stays under 50 lines.
 * - Cyclomatic complexity stays at 8 or below.
 * - Blocks nest at most 4 levels deep.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  ignorePatterns: ["!**/.server", "!**/.client"],

  // Base config
  extends: ["eslint:recommended"],

  overrides: [
    // React
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      plugins: ["react", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
      ],
      settings: {
        react: {
          version: "detect",
        },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
        "import/resolver": {
          typescript: {},
        },
      },
      rules: {
        "react/no-unknown-property": ["error", { ignore: ["variant"] }],
      },
    },

    // Typescript
    {
      files: ["**/*.{ts,tsx}"],
      plugins: ["@typescript-eslint", "import"],
      parser: "@typescript-eslint/parser",
      settings: {
        "import/internal-regex": "^~/",
        "import/resolver": {
          node: {
            extensions: [".ts", ".tsx"],
          },
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
      ],
      rules: {
        complexity: ["error", 8],
        "max-depth": ["error", 4],
        "max-lines": [
          "error",
          { max: 300, skipBlankLines: true, skipComments: true },
        ],
        "max-lines-per-function": [
          "error",
          { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true },
        ],
        "import/no-duplicates": "off",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-non-null-assertion": "warn",
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports", fixStyle: "separate-type-imports" },
        ],
        "no-restricted-syntax": [
          "error",
          {
            selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
            message: "Do not use dangerouslySetInnerHTML in this app.",
          },
        ],
      },
    },

    // Typed lint for application server modules
    {
      files: [
        "app/**/*.server.ts",
        "app/orders/**/*.ts",
        "app/webhooks/**/*.ts",
      ],
      parserOptions: {
        project: "./tsconfig.json",
      },
      extends: ["plugin:@typescript-eslint/recommended-type-checked"],
      rules: {
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/no-unsafe-assignment": "error",
        "@typescript-eslint/no-unsafe-argument": "error",
        "@typescript-eslint/no-unsafe-return": "error",
        "@typescript-eslint/no-unsafe-member-access": "error",
      },
    },

    {
      files: ["tests/**/*.ts"],
      rules: {
        "max-lines-per-function": "off",
      },
    },

    // Node
    {
      files: [
        ".eslintrc.cjs",
        "vite.config.{js,ts}",
        ".graphqlrc.{js,ts}",
        "shopify.server.{js,ts}",
        "**/*.server.{js,ts}",
      ],
      env: {
        node: true,
      },
    },
  ],
  globals: {
    shopify: "readonly",
  },
};
