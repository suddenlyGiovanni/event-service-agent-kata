# Formatting & Quality Pipeline

## Purpose

This document maps all formatting, linting, and quality check tools used in the project. It clarifies:

- What each tool does
- Where it's configured
- How it's invoked (locally vs CI)
- The execution order to prevent conflicts

---

## Tool Capability Matrix

Quick reference organized by context (how developers think about their work):

### 📦 Source Code (TypeScript/JavaScript/JSON)

| Capability              | Biome                          | Deno          | Prettier      | tsc       |
|-------------------------|--------------------------------|---------------|---------------|-----------|
| **Format**              | ✅ Primary (fast, configurable) | ✅ Alternative | ❌             | ❌         |
| **Lint**                | ✅ Primary                      | ✅ Alternative | ❌             | ❌         |
| **Type-check**          | ❌                              | ✅ Alternative | ❌             | ✅ Primary |
| **Import organization** | ✅                              | ❌             | ❌             | ❌         |
| **Format JSON**         | ✅ Primary                      | ❌             | ✅ Alternative | ❌         |
| **Auto-fix**            | ✅                              | ✅             | ✅             | ❌         |

**Decision**: Use **Biome** for all source formatting/linting + **tsc** for type-checking

**Rationale**:

- Biome is faster (Rust-based) and more configurable than Deno
- Avoid conflicts: don't run both Biome and Deno fmt on same files
- tsc is authoritative for TypeScript type-checking

---

### 📝 TSDoc/JSDoc (Documentation in Source)

| Capability                       | Prettier     | Deno                          | Biome |
|----------------------------------|--------------|-------------------------------|-------|
| **Format prose** (comment text)  | ✅ Primary    | ❌                             | ❌     |
| **Format `@example` code**       | ✅ Can format | ✅ Validates                   | ❌     |
| **Type-check `@example` blocks** | ❌            | ✅ Primary                     | ❌     |
| **Test `@example` blocks**       | ❌            | ✅ Primary                     | ❌     |
| **Validate structure**           | ❌            | ✅ Primary (`deno doc --lint`) | ❌     |
| **Auto-fix**                     | ✅            | ✅                             | ❌     |

**Decision**: **Prettier** formats → **Deno** validates

**Rationale**:

- Prettier (with `prettier-plugin-jsdoc`) is the only tool that formats JSDoc prose
- Deno provides comprehensive validation (structure, type-check, test)
- Run Prettier first to format, then Deno to validate (one-way flow)

**Current Gap**: ❌ Prettier configured but NOT invoked in scripts!

---

### 📄 Markdown Documentation

| Capability                        | Prettier     | Deno        | markdownlint |
|-----------------------------------|--------------|-------------|--------------|
| **Format prose**                  | ✅ Primary    | ❌           | ❌            |
| **Format code fences** (TS/JS)    | ✅ Can format | ✅ Validates | ❌            |
| **Lint syntax** (headings, lists) | ❌            | ❌           | ✅ Primary    |
| **Type-check code fences**        | ❌            | ✅ Primary   | ❌            |
| **Auto-fix**                      | ✅            | ✅           | ✅            |

**Decision**: **markdownlint** fixes syntax → **Prettier** formats prose/code → **Deno** validates code

**Rationale**:

- markdownlint handles structural rules (heading levels, list formatting)
- Prettier formats prose flow and code fence content
- Deno ensures code fences are type-correct and executable
- Run in order: structure → format → validate

**Current Gap**: ❌ Prettier configured but NOT invoked for Markdown!

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
1. Prettier --write '**/*.ts'  # Format JSDoc prose + @example code
2. Deno fmt                    # Final pass on @example code (enforce arrow parens)
3. deno check --doc            # Type-check @example blocks
4. deno test --doc             # Execute @example tests
5. deno doc --lint             # Validate JSDoc structure
```

#### **Markdown Context**

```bash
1. markdownlint --fix          # Fix syntax (headings, lists, spacing)
2. Prettier --write '**/*.md'  # Format prose + code fences
3. deno fmt                    # Final pass on code fences (if TS/JS)
4. deno check --doc-only       # Type-check code fences
```

---

### 🚨 Tool Conflicts & Resolutions

| Conflict                  | Tools                | Resolution        | Why                                               |
|---------------------------|----------------------|-------------------|---------------------------------------------------|
| **TS source formatting**  | Biome vs Deno fmt    | Use Biome only    | Faster, configurable, avoids arrow paren fights   |
| **Code fence formatting** | Prettier vs Deno fmt | Both (sequential) | Prettier formats first, Deno enforces final rules |
| **JSON formatting**       | Biome vs Prettier    | Use Biome only    | Already primary tool, consistent with TS          |
| **JSDoc code examples**   | Prettier vs Deno fmt | Both (sequential) | Prettier formats prose, Deno enforces code rules  |

---

### ✅ Coverage Summary

| Context         | Format                | Lint           | Type-Check | Test     | Validate       |
|-----------------|-----------------------|----------------|------------|----------|----------------|
| **Source Code** | ✅ Biome               | ✅ Biome        | ✅ tsc      | ✅ Vitest | ✅ Biome        |
| **TSDoc**       | ⚠️ Prettier (unused!) | ❌ N/A          | ✅ Deno     | ✅ Deno   | ✅ Deno         |
| **Markdown**    | ⚠️ Prettier (unused!) | ✅ markdownlint | ✅ Deno     | ❌ N/A    | ✅ markdownlint |

**Legend**: ✅ Implemented | ⚠️ Configured but not invoked | ❌ Not applicable

---

## Formatting Concerns (Goal-Based Organization)

This section organizes formatting by **what you want to achieve**, not by tool or file type. Each concern is independently invokable and composable for different contexts (IDE vs CI).

### Atomic Formatting Concerns (Building Blocks)

#### 1. `format:ts` - Format TypeScript Source

**What**: Format TS/JS/JSON source code (indent, quotes, spacing, semicolons)

**Tool**: `biome format --write`

**Files**: `*.ts`, `*.js`, `*.json`

**Use cases**: IDE on-save, local dev, CI

**Speed**: ⚡ Fast (Rust-based)

**Dependencies**: None

---

#### 2. `format:jsdoc` - Format JSDoc Prose

**What**: Format JSDoc comment text (wrapping, tag alignment, descriptions)

**Tool**: `prettier --write '**/*.ts'` (with `prettier-plugin-jsdoc`)

**Files**: JSDoc blocks in `*.ts`

**Use cases**: CI only (slow), manual cleanup

**Speed**: 🐌 Slower (Node.js)

**Dependencies**: None

---

#### 3. `format:jsdoc:examples` - Format JSDoc Examples

**What**: Format TypeScript code in `@example` blocks

**Tool**: `deno fmt` (runs after Prettier)

**Files**: `@example` blocks in JSDoc

**Use cases**: CI only, manual cleanup

**Speed**: 🐌 Slower

**Dependencies**: ⚠️ Requires `format:jsdoc` to run first (Prettier → Deno)

---

#### 4. `format:markdown:structure` - Fix Markdown Structure

**What**: Fix heading hierarchy, list spacing, blank lines, syntax rules

**Tool**: `markdownlint --fix`

**Files**: `*.md`

**Use cases**: CI auto-fix, manual cleanup

**Speed**: ⚡ Fast

**Dependencies**: None

---

#### 5. `format:markdown:prose` - Format Markdown Prose

**What**: Format Markdown text and code fence content

**Tool**: `prettier --write '**/*.md'`

**Files**: `*.md`

**Use cases**: CI only, manual cleanup

**Speed**: 🐌 Slower

**Dependencies**: ⚠️ Requires `format:markdown:structure` first (markdownlint → Prettier)

---

#### 6. `format:markdown:code` - Format Markdown Code Fences

**What**: Format TypeScript/JavaScript in code fences

**Tool**: `deno fmt` (runs after Prettier)

**Files**: Code fences in `*.md`

**Use cases**: CI only, manual cleanup

**Speed**: 🐌 Slower

**Dependencies**: ⚠️ Requires `format:markdown:prose` first (Prettier → Deno)

---

### Composite Formatting Concerns (Workflows)

#### 7. `format:code` - Format Source Code

**Pipeline**: `format:ts`

**Use cases**: IDE, local dev, fast iteration

**Speed**: ⚡ Fast

**Description**: Minimal formatting for quick feedback during development. Only runs Biome on source code.

---

#### 8. `format:docs:jsdoc` - Format All JSDoc

**Pipeline**: `format:jsdoc → format:jsdoc:examples`

**Use cases**: CI, manual doc cleanup

**Speed**: 🐌 Slower

**Description**: Comprehensive JSDoc formatting. Prettier formats prose, then Deno enforces final code style in examples.

---

#### 9. `format:docs:markdown` - Format All Markdown

**Pipeline**: `format:markdown:structure → format:markdown:prose → format:markdown:code`

**Use cases**: CI, manual doc cleanup

**Speed**: 🐌 Slower

**Description**: Comprehensive Markdown formatting. Sequential pipeline: fix structure → format prose → format code.

---

#### 10. `format:docs` - Format All Documentation

**Pipeline**: `format:docs:jsdoc` + `format:docs:markdown` (can run in parallel)

**Use cases**: CI, comprehensive doc cleanup

**Speed**: 🐌 Slower

**Description**: Format all documentation (JSDoc + Markdown). The two sub-pipelines are independent and can run concurrently.

---

#### 11. `format:all` - Format Everything

**Pipeline**: `format:code → format:docs` (or parallel where possible)

**Use cases**: CI, pre-commit, full cleanup

**Speed**: 🐌 Slowest

**Description**: Format entire project. Runs source formatting, then documentation formatting.

---

### Dependency Graph

Visual representation of formatting concern dependencies:

```text
format:all
├── format:code
│   └── format:ts (Biome)
│
└── format:docs (parallel sub-pipelines possible)
    ├── format:docs:jsdoc
    │   ├── format:jsdoc (Prettier)
    │   └── format:jsdoc:examples (Deno fmt)
    │
    └── format:docs:markdown
        ├── format:markdown:structure (markdownlint)
        ├── format:markdown:prose (Prettier)
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

**Rationale**: Minimize latency for on-save formatting. Skip slow tools (Prettier, Deno).

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
2. format:docs:jsdoc (Prettier → Deno)
3. format:docs:markdown (markdownlint → Prettier → Deno)
```

**Pros**: Predictable, easy to debug
**Cons**: Slower (no parallelization)

---

#### Parallel Execution (Fast, Complex)

```text
1. format:code (Biome)
2. [format:docs:jsdoc + format:docs:markdown] (parallel)
   - JSDoc: Prettier → Deno
   - Markdown: markdownlint → Prettier → Deno
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

- Prettier runs on `*.ts` (JSDoc) and Biome runs on `*.ts` (source) concurrently
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
- Import sorting & organization
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

### 2. **Prettier** (`prettier` + `prettier-plugin-jsdoc`)

**Purpose**: Format JSDoc/TSDoc prose and markdown

**Configuration**: `.prettierrc.json`

**Capabilities**:

- Format JSDoc comment blocks (prose wrapping, tag alignment)
- Format markdown files
- Format code fences in markdown
- TSDoc-aware (via `tsdoc: true`)

**File Scope**:

- Potentially: `**/*.{ts,md}` (currently NOT invoked in scripts)
- JSDoc blocks inside `.ts` files (via plugin)
- Markdown files in `docs/**/*.md`

**Current Invocations**:

- ❌ **NOT currently invoked** in package.json or CI
- Configuration exists but unused in automation

**Notes**:

- Complementary to Biome (handles prose, not code structure)
- `prettier-plugin-jsdoc` formats JSDoc comment content
- Can conflict with Biome if not run in correct order

---

### 3. **Deno** (CLI tools)

**Purpose**: Type-check, format, lint, and test documentation examples

**Configuration**: `deno.json`

**Capabilities**:

- `deno fmt`: Format TypeScript files (alternative to Biome/Prettier)
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
- Can conflict with Biome/Prettier if used for formatting

---

### 4. **markdownlint-cli2**

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
- Complements Prettier (which formats code fences)

---

### 5. **TypeScript Compiler** (`tsc`)

**Purpose**: Type-check TypeScript source code

**Configuration**: `tsconfig.json` (root + workspace packages)

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
|----------------------|---------------------------------------------|--------------|------------------------|
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
|----------------------|-------------------------------------|---------------------------|
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
|--------------|----------------------------------------------------------|--------------|------------------|
| Fix Markdown | `markdownlint-cli2-action` (fix: true)                   | markdownlint | MD syntax fixes  |
| Format code  | `biome check --formatter-enabled=true --write --changed` | Biome        | TS/JS formatting |
| Lint code    | `biome check --linter-enabled=true --write --changed`    | Biome        | TS/JS linting    |

#### pull-request-checks.yml (Validate only)

| Job         | Command                       | Tool         | Purpose                   |
|-------------|-------------------------------|--------------|---------------------------|
| `lint`      | `biome ci --reporter=github`  | Biome        | Format + lint check       |
| `typecheck` | `bun run type-check`          | TypeScript   | Source type-check         |
| `typecheck` | `deno task docs:type-check`   | Deno         | JSDoc examples type-check |
| `typecheck` | `deno run docs:type-check:md` | Deno         | MD code fences type-check |
| `markdown`  | `markdownlint-cli2-action`    | markdownlint | MD syntax check           |
| `tests`     | `bun run test --run`          | Vitest       | Unit tests                |
| `tests`     | `deno run docs:test`          | Deno         | JSDoc example tests       |

---

## Issues & Conflicts

### 1. **Prettier Not Used**

- Configuration exists (`.prettierrc.json`) but NO scripts invoke it
- JSDoc prose is NOT being formatted
- Markdown code fences are NOT being formatted by Prettier

### 2. **Deno fmt vs Biome Conflicts**

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
3. Prettier --write (JSDoc + MD code fences)
4. deno fmt (TSDoc examples + MD code fences) - FINAL PASS
5. Commit if changed
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

1. **Add Prettier to pipeline**
   - Create `docs:format:jsdoc` script
   - Run Prettier on `.ts` and `.md` files before `deno fmt`

2. **Consolidate scripts**
   - Move all Deno task commands to `package.json`
   - Remove duplication between `package.json` and `deno.json`

3. **Fix CI typos**
   - Change `deno run` → `deno task` in workflows

4. **Group CI jobs by concern**
   - `code-quality`: Biome checks
   - `documentation`: All doc validation (TSDoc + MD)
   - `tests`: Unit tests only (no doc tests)

5. **Add pre-commit hook support**
   - All CI scripts runnable locally
   - Optional: Install `husky` or git hooks

6. **Document final pipeline**
   - Update this file with final scripts
   - Add README section on "How to run CI locally"
