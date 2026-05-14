# Story 02-01: Package Structure & Build Toolchain

**Epic:** [buildbarn-forms Core Library](epic.md)
**Status:** Complete
**Points:** 3

## Description

Set up the `@hermetiq/buildbarn-forms` npm package with TypeScript, ESLint, Prettier, Jest, Husky pre-commit hooks, and a `copyfiles` CSS copy step. The package must output a correct `dist/` that consumers can import including CSS files alongside the compiled JS/TS.

## Acceptance Criteria

- [ ] `npm run build` compiles TypeScript and copies CSS files to `dist/`
- [ ] `npm run test` runs Jest with `@testing-library/react`
- [ ] `npm run lint` runs ESLint on all `.ts/.tsx` files
- [ ] `npm run typecheck` type-checks without emitting output
- [ ] Husky pre-commit hook runs `lint-staged` (prettier + eslint on staged files)
- [ ] `package.json` declares `"type": "module"` for ESM output
- [ ] Peer dependencies declared: `react ^18 || ^19`, `react-dom ^18 || ^19`
- [ ] `publishConfig.registry` set to `https://npm.pkg.github.com`
- [ ] `.prettierignore` excludes `dist/` and generated files

## Key Configuration Files

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react",
    "declaration": true,
    "outDir": "dist",
    "strict": true,
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.tsx", "**/*.test.ts"]
}
```

**Build script (package.json):**
```json
{
  "build": "npm run build:ts && npm run build:css",
  "build:ts": "tsc",
  "build:css": "copyfiles -u 1 'src/**/*.css' dist/"
}
```

## Files

- `package.json`, `tsconfig.json`, `.eslintrc.js`, `.prettierrc`, `jest.config.cjs`
- `.husky/pre-commit`
- `.gitignore`, `.prettierignore`
