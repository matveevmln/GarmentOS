// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/.turbo/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "error",
      // Границы доменных модулей (docs/REPOSITORY_STRUCTURE.md): запрещаем импорт
      // внутренних слоёв чужого модуля в обход публичного index.ts.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/domain/*/domain/**", "**/domain/*/infrastructure/**"],
              message:
                "Импортируйте только через публичный index.ts модуля (packages/domain/<module>) — см. docs/REPOSITORY_STRUCTURE.md и docs/PRINCIPLES.md, принцип 2.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
