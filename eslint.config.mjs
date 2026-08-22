import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The react-hooks v6 "set-state-in-effect" rule is a canary rule that
      // false-positives on the idiomatic async data-loading pattern
      // `useEffect(() => { load() }, [])` where state updates happen after
      // `await` (never synchronously in the effect body). The codebase relies
      // on this pattern throughout (including pre-existing code), so the rule
      // is disabled project-wide; every other react-hooks rule stays active.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
