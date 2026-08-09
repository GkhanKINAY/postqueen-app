import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config, run from the repo root (see CLAUDE.md — root is the only
 * supported place to lint from).
 *
 * This replaced a `FlatCompat`-based config that could not work:
 * `eslint-config-next@16` exports flat arrays and peers on `eslint >= 9`, so
 * feeding it through the eslintrc compatibility layer failed schema validation,
 * and the validator then crashed trying to `JSON.stringify` a config containing
 * self-referential plugin objects. The visible symptom was "Converting circular
 * structure to JSON", which hid the real error underneath it.
 */

/**
 * `eslint-config-next`'s entries mostly carry no `files` of their own, so
 * spreading them as-is applies React, hooks and `@next/next` rules to the
 * NestJS apps, the SDK and the extension as well. Narrow every rule-bearing
 * entry to the surfaces that actually render React.
 *
 * Entries that consist solely of `ignores` are passed through untouched: in
 * flat config an `ignores`-only object is a *global* ignore, and giving it a
 * `files` key silently demotes it to an ordinary config block that ignores
 * nothing.
 */
const scopeTo = (files) => (config) =>
  Object.keys(config).length === 1 && config.ignores
    ? config
    : { ...config, files };

/** Everything that renders React. `libraries/helpers` has a few .tsx too. */
const REACT_SURFACES = [
  'apps/frontend/**/*.{js,jsx,mjs,ts,tsx}',
  'libraries/react-shared-libraries/**/*.{js,jsx,mjs,ts,tsx}',
  'libraries/helpers/**/*.{js,jsx,mjs,ts,tsx}',
];

const eslintConfig = [
  {
    // Build output and generated trees. The old config had no ignores at all,
    // which only went unnoticed because it never successfully ran.
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      'tmp/**',
      'uploads/**',
      '**/*.min.js',
      // Static assets served verbatim, including vendored third-party scripts.
      // `public/f.js` alone accounted for 522 of 960 warnings on the first run —
      // noise about code we neither wrote nor can change.
      'apps/frontend/public/**',
      // The design handoff prototype. Git-ignored, not ours, and one file in it
      // is ~800 KB.
      'design/**',
      // The Prisma client. Since Prisma 7 this is TypeScript source generated
      // into the tree rather than a package in node_modules, so it is inside
      // every lint glob unless it is named here.
      'libraries/nestjs-libraries/src/database/prisma/generated/**',
      // `tsc --build` output for the wallets package. It is committed rather
      // than gitignored, but it is still generated — 35 of the 46
      // `no-require-imports` errors on the first run came from this one file.
      'libraries/postqueen-wallets/lib/**',
    ],
  },

  // React / Next / hooks / jsx-a11y — frontend surfaces only.
  ...nextCoreWebVitals.map(scopeTo(REACT_SURFACES)),

  {
    // Lint runs from the repo root, but the Next app is a directory down, so
    // `no-html-link-for-pages` looked for `./pages` and printed a "Pages
    // directory cannot be found" banner on every single run.
    files: REACT_SURFACES,
    settings: { next: { rootDir: 'apps/frontend' } },
  },

  // typescript-eslint recommended — every app, including the NestJS ones.
  // These are the non-type-checked presets, so no `project` wiring is needed.
  ...nextTypescript,

  {
    /**
     * React Compiler rules, demoted to warnings.
     *
     * `eslint-config-next@16` bundles `eslint-plugin-react-hooks@7`, whose
     * recommended set is the compiler ruleset — fifteen rules that ship as
     * `error`. On a codebase this size that had never been linted they account
     * for 381 of 437 errors, 267 from `preserve-manual-memoization` alone: it
     * fires on hand-written `useMemo`/`useCallback` that predates the compiler,
     * which is essentially all of it.
     *
     * They stay on as warnings rather than off, because several of them
     * (`set-state-in-effect`, `refs`, `immutability`) describe real bugs and the
     * list is the backlog. What they must not do is drown the 56 errors that
     * are actionable today.
     *
     * `rules-of-hooks` deliberately stays an error — CLAUDE.md treats it as
     * non-negotiable — and `exhaustive-deps` keeps its upstream `warn`.
     *
     * Scoped to the same surfaces that load the plugin. An `off` can be written
     * for a plugin that is not in scope, but anything that *enables* a rule
     * cannot: without `files` here ESLint tries to resolve `react-hooks` for the
     * NestJS apps too and refuses to start.
     */
    files: REACT_SURFACES,
    rules: {
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
    },
  },

  {
    // `.cjs` is CommonJS by definition, so `require` is the correct call there,
    // not a leftover. Hits `tailwind.config.cjs` and friends.
    //
    // `jest.preset.js` is the same case wearing a `.js` extension: the root
    // package has no `"type": "module"`, so Node parses it as CommonJS and it
    // already uses `module.exports`. An `import` there is a runtime syntax
    // error, not a modernisation.
    files: ['**/*.cjs', 'jest.preset.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Carried over verbatim from the previous config. These are deliberate
    // project-wide decisions, not a backlog: the codebase leans on `any` at
    // integration boundaries and on ts-comments around generated Prisma types.
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react/display-name': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/prefer-as-const': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
    },
  },
];

export default eslintConfig;
