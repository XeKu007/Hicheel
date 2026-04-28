import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import security from "eslint-plugin-security";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Security rules — catches common vulnerabilities at lint time
  {
    plugins: { security },
    rules: {
      // Detect object injection (bracket notation with variable keys)
      "security/detect-object-injection": "warn",
      // Note: eslint-plugin-security@1.7.1 is not fully compatible with ESLint 9 flat config.
      // The rules below call deprecated context.getScope() and crash the lint run.
      "security/detect-non-literal-regexp": "off",
      "security/detect-non-literal-require": "off",
      "security/detect-non-literal-fs-filename": "off",
      // Detect eval() usage
      "security/detect-eval-with-expression": "error",
      // Detect unsafe child_process usage
      "security/detect-child-process": "off",
      // Detect disable of certificate validation
      "security/detect-disable-mustache-escape": "warn",
      // Detect possible timing attacks (non-constant-time comparisons)
      "security/detect-possible-timing-attacks": "warn",
      // Detect pseudoRandom number generators (use crypto.randomBytes instead)
      "security/detect-pseudoRandomBytes": "warn",
      // Detect buffer allocation without size check
      "security/detect-buffer-noassert": "error",
      // Detect new Buffer() (deprecated, use Buffer.alloc)
      "security/detect-new-buffer": "error",
    },
  },

  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "prisma/**",
    ],
  },
];

export default eslintConfig;
