# GitHub Actions Workflows

This directory contains CI/CD workflows for the event-service-agent-kata project.

## Workflows

### 🔗 Pull Request Checks (`pull-request-checks.yml`)

Runs on every pull request targeting the `main` branch.

**Jobs:**

- ✅ **Typecheck**: Validates TypeScript types across all packages
- ✅ **Lint**: Checks code quality using Biome linter
- ✅ **Format**: Verifies code formatting using Biome formatter
- ✅ **Test**: Runs all test suites using Bun test runner

### 🚀 Push Checks (`push-checks.yml`)

Runs on pushes to feature branches (excluding `main`).

**Jobs:**

- ✅ **Typecheck**: Validates TypeScript types across all packages
- ✅ **Lint**: Checks and auto-fixes code quality issues using Biome linter
- ✅ **Format**: Checks and auto-formats code using Biome formatter
- ✅ **Test**: Runs all test suites using Bun test runner

**Auto-fix Behavior:** This workflow automatically commits lint and format fixes back to the branch using `[skip ci]` to prevent workflow loops.

### 🎯 Main Branch Checks (`main-checks.yml`)

Runs on pushes to the `main` branch and can be manually triggered.

**Jobs:**

- ✅ **Typecheck**: Validates TypeScript types across all packages
- ✅ **Lint**: Checks code quality using Biome linter (no auto-fix)
- ✅ **Format**: Verifies code formatting using Biome formatter (no auto-fix)
- ✅ **Test**: Runs all test suites using Bun test runner

## Setup Action

The `actions/setup` composite action handles:

- 📦 **Bun Installation**: Installs Bun runtime using version from `package.json`
- 🗂️ **Dependency Caching**: Caches Bun dependencies for faster builds
- 🧩 **Dependency Installation**: Runs `bun install --frozen-lockfile`

## Local Development

You can run the same checks locally:

```bash
# Typecheck
bun run type-check

# Lint
bun run lint

# Format
bun run format

# Check (lint + format)
bun run check

# Test
bun test
```

## Requirements

- **Runtime**: Bun 1.2.23+ (specified in `package.json`)
- **Lockfile**: `bun.lock` must be committed and up-to-date
