# Formatting & Quality Pipeline

## Purpose

This document maps all formatting, linting, and quality check tools used in the project. It clarifies:

- What each tool does
- Where it's configured
- How it's invoked (locally vs. CI)
- The execution order to prevent conflicts

---

## Tool Capability Matrix

Quick reference organized by context (how developers think about their work):

### 📦 Source Code (TypeScript/JavaScript/JSON)

| Capability              | Biome                           | Deno           | tsc        |
| ----------------------- | ------------------------------- | -------------- | ---------- |
| **Format**              | ✅ Primary (fast, configurable) | ✅ Alternative | ❌         |
| **Lint**                | ✅ Primary                      | ✅ Alternative | ❌         |
| **Type-check**          | ❌                              | ✅ Alternative | ✅ Primary |
| **Import organization** | ✅                              | ❌             | ❌         |
| **Format JSON**         | ✅ Primary                      | ❌             | ❌         |
| **Auto-fix**            | ✅                              | ✅             | ❌         |

**Decision**: Use **Biome** for all source formatting/linting + **tsc** for type-checking

**Rationale**:

- Biome is faster (Rust-based) and more configurable than Deno
- Avoid conflicts: don't run both Biome and Deno fmt on the same files
- tsc is authoritative for TypeScript type-checking

---

### 📝 TSDoc/JSDoc (Documentation in Source)

| Capability                       | Deno                           | Biome |
| -------------------------------- | ------------------------------ | ----- |
| **Format prose** (comment text)  | ✅ Primary (via deno fmt)      | ❌    |
| **Format `@example` code**       | ✅ Primary                     | ❌    |
| **Type-check `@example` blocks** | ✅ Primary                     | ❌    |
| **Test `@example` blocks**       | ✅ Primary                     | ❌    |
| **Validate structure**           | ✅ Primary (`deno doc --lint`) | ❌    |
| **Auto-fix**                     | ✅                             | ❌    |

**Decision**: **Deno fmt** handles all TSDoc formatting and validation

**Rationale**:

- Deno provides comprehensive formatting, validation, type-checking, and testing
- Single tool for all TSDoc concerns (simpler pipeline)
- No conflicts with source code formatters

---

### 📄 Markdown Documentation

| Capability                        | Deno       | markdownlint |
| --------------------------------- | ---------- | ------------ |
| **Format prose**                  | ⚠️ Manual  | ❌           |
| **Format code fences** (TS/JS)    | ✅ Primary | ❌           |
| **Lint syntax** (headings, lists) | ❌         | ✅ Primary   |
| **Type-check code fences**        | ✅ Primary | ❌           |
| **Auto-fix**                      | ✅         | ✅           |

**Decision**: **markdownlint** fixes syntax → **Deno** formats/validates code fences

**Rationale**:

- markdownlint handles structural rules (heading levels, list formatting)
- Deno formats and validates TypeScript/JavaScript code fences
- Prose formatting is manual (acceptable trade-off for simplicity)
- Run in order: structure → code validation

---

### 🎯 Recommended Pipeline (Context-Based)

Based on the matrices above, here's the conflict-free execution order:

#### **Source Code Context**

```bash
1. Biome format --write       # Format TS/JS/JSON
2. Biome lint --write          # Lint and auto-fix
3. tsc --noEmit                # Type-check (no conflicts with formatting)
```

#### **TSDoc Context**

```bash
1. deno fmt                    # Format JSDoc prose + @example code
2. deno check --doc            # Type-check @example blocks
3. deno test --doc             # Execute @example tests
4. deno doc --lint             # Validate JSDoc structure
```

#### **Markdown Context**

```bash
1. markdownlint --fix          # Fix syntax (headings, lists, spacing)
2. deno fmt                    # Format code fences (if TS/JS)
3. deno check --doc-only       # Type-check code fences
```

---

### 🚨 Tool Conflicts & Resolutions

| Conflict                 | Tools             | Resolution     | Why                                             |
| ------------------------ | ----------------- | -------------- | ----------------------------------------------- |
| **TS source formatting** | Biome vs Deno fmt | Use Biome only | Faster, configurable, avoids arrow paren fights |
| **TSDoc formatting**     | N/A               | Deno fmt only  | Single tool for format + validate               |
| **Markdown code fences** | N/A               | Deno fmt only  | Formats and validates in one pass               |
| **JSON formatting**      | Biome vs Deno     | Use Biome only | Already primary tool, consistent with TS        |

---

### ✅ Coverage Summary

| Context         | Format                | Lint            | Type-Check | Test      | Validate        |
| --------------- | --------------------- | --------------- | ---------- | --------- | --------------- |
| **Source Code** | ✅ Biome              | ✅ Biome        | ✅ tsc     | ✅ Vitest | ✅ Biome        |
| **TSDoc**       | ✅ Deno               | ❌ N/A          | ✅ Deno    | ✅ Deno   | ✅ Deno         |
| **Markdown**    | ✅ Deno (code fences) | ✅ markdownlint | ✅ Deno    | ❌ N/A    | ✅ markdownlint |

**Legend**: ✅ Implemented | ❌ Not applicable

---

## Formatting Concerns (Goal-Based Organization)

This section organizes formatting by **what you want to achieve**, not by tool or file type. Each concern is independently invokable and composable for different contexts (IDE vs. CI).

### Atomic Formatting Concerns (Building Blocks)

#### 1. `format:ts` - Format TypeScript Source

**What**: Format TS/JS/JSON source code (indent, quotes, spacing, semicolons)

**Tool**: `biome format --write`

**Files**: `*.ts`, `*.js`, `*.json`

**Use cases**: IDE on-save, local dev, CI

**Speed**: ⚡ Fast (Rust-based)

**Dependencies**: None

---

#### 2. `format:markdown:structure` - Fix Markdown Structure

**What**: Fix heading hierarchy, list spacing, blank lines, syntax rules

**Tool**: `markdownlint --fix`

**Files**: `*.md`

**Use cases**: CI auto-fix, manual cleanup

**Speed**: ⚡ Fast

**Dependencies**: None

---

#### 3. `format:markdown:code` - Format Markdown Code Fences

**What**: Format TypeScript/JavaScript in code fences

**Tool**: `deno fmt`

**Files**: Code fences in `*.md`

**Use cases**: CI only, manual cleanup

**Speed**: ⚡ Fast

**Dependencies**: ⚠️ Requires `format:markdown:structure` first (markdownlint → Deno)

---

### Composite Formatting Concerns (Workflows)

#### 4. `format:code` - Format Source Code

**Pipeline**: `format:ts`

**Use cases**: IDE, local dev, fast iteration

**Speed**: ⚡ Fast

**Description**: Minimal formatting for quick feedback during development. Only runs Biome on source code.

---

#### 5. `format:docs:jsdoc` - Format All JSDoc

**Pipeline**: `deno fmt`

**Use cases**: CI, manual doc cleanup

**Speed**: ⚡ Fast

**Description**: Format JSDoc comments and `@example` blocks using Deno. Single tool handles all TSDoc formatting.

---

#### 6. `format:docs:markdown` - Format All Markdown

**Pipeline**: `format:markdown:structure → format:markdown:code`

**Use cases**: CI, manual doc cleanup

**Speed**: ⚡ Fast

**Description**: Format Markdown files. Sequential pipeline: fix structure → format code fences.

---

#### 7. `format:docs` - Format All Documentation

**Pipeline**: `format:docs:jsdoc` + `format:docs:markdown` (can run in parallel)

**Use cases**: CI, comprehensive doc cleanup

**Speed**: ⚡ Fast

**Description**: Format all documentation (JSDoc + Markdown). The two sub-pipelines are independent and can run concurrently.

---

#### 8. `format:all` - Format Everything

**Pipeline**: `format:code → format:docs` (or parallel where possible)

**Use cases**: CI, pre-commit, full cleanup

**Speed**: 🐌 Slowest

**Description**: Format the entire project. Runs source formatting, then documentation formatting.

---

### Dependency Graph

Visual representation of formatting concerns dependencies:

```text
format:all
├── format:code
│   └── format:ts (Biome)
│
└── format:docs (parallel sub-pipelines possible)
    ├── format:docs:jsdoc (Deno fmt)
    │
    └── format:docs:markdown
        ├── format:markdown:structure (markdownlint)
        └── format:markdown:code (Deno fmt)
```

**Key**:

- `→` Sequential dependency (must run in order)
- `+` Parallel opportunity (can run concurrently)
- `(Tool)` Actual tool invoked

---

### Context-Based Usage Patterns

#### IDE Context (Fast, Frequent)

```bash
format:code  # Only Biome (instant feedback)
```

**Rationale**: Minimize latency for on-save formatting. Biome is fast enough for on-save.

---

#### CI Push Context (Comprehensive, Auto-fix)

```bash
format:all   # Everything, commit changes if modified
```

**Rationale**: Ensure all formatting is applied before merge. Auto-commit fixes.

---

#### CI PR Context (Validation Only)

```bash
# Use --check variants (separate from formatting goals)
# format:all would use --check flags instead of --write
```

**Rationale**: Validate formatting without modifying files. Fail if not formatted.

---

#### Manual Cleanup Context

```bash
# Granular cleanup options:
format:docs:jsdoc     # Just JSDoc
format:docs:markdown  # Just Markdown
format:docs           # All docs
format:all            # Everything
```

**Rationale**: Developer can choose scope based on what they're working on.

---

### Execution Order & Parallelization

#### Sequential Execution (Safe, Simple)

```text
1. format:code (Biome)
2. format:docs:jsdoc (Deno)
3. format:docs:markdown (markdownlint → Deno)
```

**Pros**: Predictable, easy to debug
**Cons**: Slower (no parallelization)

---

#### Parallel Execution (Fast, Complex)

```text
1. format:code (Biome)
2. [format:docs:jsdoc + format:docs:markdown] (parallel)
   - JSDoc: Deno
   - Markdown: markdownlint → Deno
```

**Pros**: Faster (JSDoc and Markdown pipelines run concurrently)
**Cons**: More complex, harder to debug failures

**Why safe**: JSDoc and Markdown pipelines operate on independent file sets (JSDoc in `*.ts`, Markdown in `*.md`). No conflicts.

---

#### Full Parallel Execution (Maximum Speed)

```text
[format:code + format:docs:jsdoc + format:docs:markdown] (all parallel)
```

**Pros**: Fastest possible
**Cons**:

- Deno runs on `packages/*/src` (JSDoc) and Biome runs on `*.ts` (source) - different paths
- Potential race condition on same files
- ⚠️ **NOT RECOMMENDED** due to potential conflicts

---

### Benefits of This Organization

1. **Separation of Concerns**: Each formatting task is isolated and independently invokable
2. **Context Flexibility**: IDE uses minimal tools, CI uses comprehensive tools
3. **Composability**: Atomic concerns combine into workflows
4. **Clear Naming**: Script names describe intent (`format:jsdoc`, `format:all`)
5. **Parallel Opportunities**: Independent pipelines can run concurrently for speed
6. **Incremental Adoption**: Can implement one concern at a time

---

## Tool Inventory

### 1. **Biome** (`@biomejs/biome`)

**Purpose**: Primary formatter and linter for TypeScript/JavaScript source code

**Configuration**: `biome.json`

**Capabilities**:

- Format TypeScript/JavaScript files
- Lint TypeScript/JavaScript files
- Format JSON files
- Import sorting and organization
- Quick fixes (assists)

**File Scope**:

- All `.ts`, `.js`, `.json` files
- Excludes: `node_modules/`, generated files

**Current Invocations**:

- `package.json`:
  - `bun run format` → `biome format --write .`
  - `bun run lint` → `biome lint --write .`
  - `bun run check` → `biome check --write .`
- CI (push-checks.yml):
  - Format: `biome check --formatter-enabled=true --linter-enabled=false --write --changed`
  - Lint: `biome check --formatter-enabled=false --linter-enabled=true --write --changed`
- CI (pull-request-checks.yml):
  - Check: `biome ci --reporter=github`

**Notes**:

- Fast (Rust-based)
- Handles 95% of TypeScript formatting
- Does NOT format JSDoc prose (only code structure)

---

### 3. **Deno** (CLI tools)

**Purpose**: Type-check, format, lint, and test documentation examples

**Configuration**: `deno.json`

**Capabilities**:

- `deno fmt`: Format TypeScript files (alternative to Biome)
- `deno lint`: Lint TypeScript files
- `deno check --doc`: Type-check `@example` code blocks in JSDoc
- `deno check --doc-only`: Type-check code fences in Markdown
- `deno test --doc`: Execute `@example` code blocks as tests
- `deno doc --lint`: Validate JSDoc structure/completeness

**File Scope** (per `deno.json`):

- Format/Lint: `packages/*/src/**/*.ts` (excludes tests, vitest configs)
- Doc checks: All `.ts` files in `packages/*/src/*` (excludes tests)
- Doc-only checks: All `.md` files in `docs/`

**Current Invocations**:

- `package.json`:
  - `bun run docs:check` → `deno task docs:check`
  - `bun run docs:type-check` → `deno task docs:type-check`
  - `bun run docs:type-check:md` → `deno task docs:type-check:md`
  - `bun run docs:test` → `deno task docs:test`
- `deno.json` tasks:
  - `docs:check`: `deno doc --lint $(find packages ...)`
  - `docs:type-check`: `deno check --doc $(find packages ...)`
  - `docs:type-check:md`: `deno check --doc-only $(find docs ...)`
  - `docs:test`: `deno test --doc $(find packages ...)`
  - `format`: `deno fmt`
  - `format:check`: `deno fmt --check`
  - `lint`: `deno lint`
- CI (pull-request-checks.yml):
  - Type-check docs: `deno task docs:type-check`
  - Type-check MD: `deno run docs:type-check:md` (typo: should be `task`)
  - Test docs: `deno run docs:test` (typo: should be `task`)

**Notes**:

- `deno fmt` has IMMUTABLE settings (e.g., arrow parens always)
- Used primarily for documentation validation, not source formatting
- Can conflict with Biome if used for source code formatting

---

### 3. **markdownlint-cli2**

**Purpose**: Validate and fix Markdown syntax/style

**Configuration**: `.markdownlint.json` (assumed to exist)

**Capabilities**:

- Lint Markdown syntax (headings, lists, spacing, etc.)
- Auto-fix common issues
- Does NOT format code fences (only prose structure)

**File Scope**:

- `docs/**/*.md`

**Current Invocations**:

- `package.json`:
  - `bun run docs:lint` → `bunx markdownlint-cli2 --fix docs/**/*.md`
- CI (push-checks.yml):
  - Auto-fix: `markdownlint-cli2-action` with `fix: true`
- CI (pull-request-checks.yml):
  - Check: `markdownlint-cli2-action` (no fix)

**Notes**:

- Focuses on prose structure, not code formatting
- Complements Deno (which formats code fences)

---

### 4. **TypeScript Compiler** (`tsc`)

**Purpose**: Type-check TypeScript source code

**Configuration**: `tsconfig.json` (root and workspace packages)

**Capabilities**:

- Static type checking
- No formatting or linting

**File Scope**:

- All `.ts` files in workspace packages

**Current Invocations**:

- `package.json`:
  - `bun run type-check` → `bun --bun --workspaces type-check`
- CI (pull-request-checks.yml):
  - `bun run type-check`

**Notes**:

- Separate from Deno's `check --doc` (which validates examples)
- Does NOT validate JSDoc code blocks

---

## Current Script Mapping

### package.json (Root)

| Script               | Command                                     | Tool(s)      | Scope                  |
| -------------------- | ------------------------------------------- | ------------ | ---------------------- |
| `format`             | `biome format --write .`                    | Biome        | All TS/JS/JSON         |
| `lint`               | `biome lint --write .`                      | Biome        | All TS/JS/JSON         |
| `check`              | `biome check --write .`                     | Biome        | Format + Lint combined |
| `type-check`         | `bun --bun --workspaces type-check`         | TypeScript   | All TS source          |
| `test`               | `bun --bun vitest`                          | Vitest       | Unit tests             |
| `docs:check`         | `deno task docs:check`                      | Deno         | JSDoc structure        |
| `docs:type-check`    | `deno task docs:type-check`                 | Deno         | JSDoc examples         |
| `docs:type-check:md` | `deno task docs:type-check:md`              | Deno         | MD code fences         |
| `docs:test`          | `deno task docs:test`                       | Deno         | JSDoc example tests    |
| `docs:lint`          | `bunx markdownlint-cli2 --fix docs/**/*.md` | markdownlint | MD syntax              |

### deno.json (Tasks)

| Task                 | Command                             | Purpose                   |
| -------------------- | ----------------------------------- | ------------------------- |
| `docs:check`         | `deno doc --lint $(find ...)`       | Validate JSDoc structure  |
| `docs:type-check`    | `deno check --doc $(find ...)`      | Type-check JSDoc examples |
| `docs:type-check:md` | `deno check --doc-only $(find ...)` | Type-check MD code fences |
| `docs:test`          | `deno test --doc $(find ...)`       | Execute JSDoc examples    |
| `format`             | `deno fmt`                          | Format TS files           |
| `format:check`       | `deno fmt --check`                  | Validate formatting       |
| `lint`               | `deno lint`                         | Lint TS files             |

### CI Workflows

#### push-checks.yml (Auto-fix on push)

| Step         | Command                                                  | Tool         | Purpose          |
| ------------ | -------------------------------------------------------- | ------------ | ---------------- |
| Fix Markdown | `markdownlint-cli2-action` (fix: true)                   | markdownlint | MD syntax fixes  |
| Format code  | `biome check --formatter-enabled=true --write --changed` | Biome        | TS/JS formatting |
| Lint code    | `biome check --linter-enabled=true --write --changed`    | Biome        | TS/JS linting    |

#### pull-request-checks.yml (Validate only)

| Job         | Command                       | Tool         | Purpose                   |
| ----------- | ----------------------------- | ------------ | ------------------------- |
| `lint`      | `biome ci --reporter=github`  | Biome        | Format + lint check       |
| `typecheck` | `bun run type-check`          | TypeScript   | Source type-check         |
| `typecheck` | `deno task docs:type-check`   | Deno         | JSDoc examples type-check |
| `typecheck` | `deno run docs:type-check:md` | Deno         | MD code fences type-check |
| `markdown`  | `markdownlint-cli2-action`    | markdownlint | MD syntax check           |
| `tests`     | `bun run test --run`          | Vitest       | Unit tests                |
| `tests`     | `deno run docs:test`          | Deno         | JSDoc example tests       |

---

## Issues & Conflicts

### 1. **Deno fmt vs Biome Conflicts**

- Both can format TypeScript
- `deno fmt` enforces arrow parens (not configurable)
- If both run, they may fight over formatting
- **Current state**: Only Biome runs for source formatting

### 3. **Scattered Invocations**

- Some commands in `package.json`
- Some in `deno.json` tasks
- Some directly in CI YAML
- Hard to trace "what runs when"

### 4. **CI Typos**

- `pull-request-checks.yml` uses `deno run` instead of `deno task`
- Should be: `deno task docs:type-check:md`, not `deno run`

### 5. **Documentation Grouping**

- TSDoc checks scattered across `typecheck` and `tests` jobs
- Should be grouped in a single `documentation` job

### 6. **No Pre-commit Hooks**

- All automation is CI-only
- Developers can't easily run "CI pipeline" locally

---

## Proposed Execution Order (Conflict-Free)

To prevent tools from fighting, run in this order:

### Local Development (Fast)

```bash
1. Biome format (TS source)
2. Biome lint (TS source)
```

### CI Push (Auto-fix)

```bash
1. markdownlint --fix (MD syntax)
2. Biome format --write (TS source)
3. deno fmt (TSDoc + MD code fences)
4. Commit if changed
```

### CI Pull Request (Validate)

```bash
1. biome ci (format + lint check)
2. deno fmt --check (ensure examples formatted)
3. markdownlint (MD syntax check)
4. tsc (source type-check)
5. deno check --doc (JSDoc examples type-check)
6. deno check --doc-only (MD code fences type-check)
7. deno test --doc (JSDoc example tests)
8. vitest (unit tests)
```

---

## Next Steps

1. **Consolidate scripts**
   - Move all Deno task commands to `package.json`
   - Remove duplication between `package.json` and `deno.json`

2. **Fix CI typos**
   - Change `deno run` → `deno task` in workflows

3. **Group CI jobs by concern**
   - `code-quality`: Biome checks
   - `documentation`: All doc validation (TSDoc + MD)
   - `tests`: Unit tests only (no doc tests)

4. **Add pre-commit hook support**
   - All CI scripts runnable locally
   - Optional: Install `husky` or git hooks

5. **Document final pipeline**
   - Update this file with final scripts
   - Add a README section on "How to run CI locally"
