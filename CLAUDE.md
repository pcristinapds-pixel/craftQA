# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

sentinel-qa is an autonomous QA agent that triggers on PR events, generates test cases via Claude API, executes E2E tests (Playwright for web, Patrol for Flutter), and reports results back to PRs and Slack. It also performs **data log QA** — capturing analytics events (Firebase, Amplitude, etc.) during test runs and validating them against predefined specs.

## Build & Run

```bash
npm install              # Install dependencies
npm run build            # Build via tsc
npm run test             # Run tests (depends on build)
npm run lint             # Lint
```

### CLI

```bash
npx sentinel-qa run --app <app-id> --pr <number> --validate-events
npx sentinel-qa run --app <app-id> --diff HEAD~1   # local, no PR
```

## Architecture

**Single package**: All source under `src/`.

**Agent pipeline** (`src/agent/`): 4-stage sequential pipeline:
1. **Analyze** — collect PR diff, PRD, selectors, event specs from registry
2. **Plan** — Claude API generates test cases + executable test code
3. **Execute** — run tests via Playwright (web) or Patrol (Flutter)
4. **Report** — generate Markdown report, post PR comment, send Slack bug report on failure

**Runners** (`src/runners/`): Test execution engines.
- `playwright.ts` — web E2E via Playwright
- `patrol.ts` — Flutter E2E via Patrol

**Event Validation** (`src/event-validation/`): Captures analytics network requests during test runs and compares against event specs in `registry/event-specs/`.

**App Registry** (`registry/`): YAML-based app configuration. Each app has selectors (`registry/selectors/`) and optional event specs (`registry/event-specs/`).

**Triggers** (`src/triggers/`): Entry points — GitHub Actions webhook and CLI.

## Critical Constraints

- **ESM only**: `"type": "module"` everywhere. Use `.js` extensions in imports (even for `.ts` files).
- **Zod 3.x**: Do not upgrade to Zod 4.
- **Input validation**: All external inputs (YAML, API responses, env vars) validated via Zod schemas.
- **Test code security**: All AI-generated test code must pass AST-based validator before execution.
- **Path safety**: User-provided IDs used in file paths must be sanitized (alphanumeric, hyphens, underscores only).

## Workflow

Always follow this sequence when making changes:

1. **Develop** — write/edit code
2. **Build** — `npm run build` and fix any compile errors
3. **Code review** — review written code for clean code, security, data flow
4. **Unit test** — `npm run test` and fix any failures
5. **Update checklist** — mark completed items in `docs/agent/sentinel-qa-checklist.md`
6. **Commit** — only after steps 1–5 pass

Never skip steps or reorder. Do not commit code that doesn't build or pass tests.

## Language

- **User-facing messages**: All strings shown to users (CLI output, error messages, report output) must be in **English**.
- **Documentation and commit messages**: May be in Korean.
- **Code**: English for all code (variable names, comments, etc.).
