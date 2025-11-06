# TypeScript Configuration

This monorepo uses TypeScript Project References to enable efficient type checking across all packages.

## Type Checking

### Check All Packages (from root)

```bash
tsc --build
```

This command type-checks all packages in the monorepo using TypeScript project references. It will check all referenced packages and report errors from any of them.

**Note**: Use `tsc --build` (not `tsc --noEmit`) at the root level. With project references, `--build` is required to actually check the referenced projects.

### Check Individual Package

```bash
cd packages/<package-name>
tsc --noEmit
```

Each package can be type-checked independently using `tsc --noEmit`.

### Using npm/bun Scripts

```bash
# Root (checks all packages)
bun run type-check

# Individual package
cd packages/<package-name>
bun run type-check
```

## Configuration Structure

### Root `tsconfig.json`

Contains references to all packages and an empty `files` array to indicate this config is an orchestrator (doesn't compile any files itself):

```json
{
  "files": [],
  "references": [
    { "path": "./packages/adapters" },
    { "path": "./packages/api" },
    // ... other packages
  ]
}
```

**Note**: The `files: []` is required. Without it, TypeScript would try to compile files in the root directory, which would conflict with the project references pattern.

### Package `tsconfig.json`

Each package enables composite mode and extends the base config:

```json
{
  "compilerOptions": {
    "composite": true
  },
  "extends": "../typescript/tsconfig.json",
  "include": ["src/**/*"]
}
```

### Base Config (`packages/typescript/tsconfig.json`)

Contains shared compiler options for all packages with strict type checking enabled.

## Benefits

- **Single Command**: Type-check entire monorepo with `tsc --build` from root
- **Fast**: TypeScript uses project references for incremental checking
- **Independent**: Each package can still be checked individually
- **Standard**: Works with plain `tsc` without requiring bun

## Notes

- The configuration requires TypeScript 3.0+ for project references support
- **Root type checking**: Use `tsc --build` to check all packages via project references
- **Package type checking**: Use `tsc --noEmit` when checking individual packages
