# Contributing to sentinel-qa

Thank you for your interest in contributing to sentinel-qa!

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm run test`

## Development Workflow

Always follow this sequence:

1. **Develop** — Write/edit code
2. **Build** — `npm run build` and fix compile errors
3. **Code review** — Review the change for clean code, security, and data flow
4. **Test** — `npm run test` and fix failures
5. **Update checklist** — Mark completed items in `docs/agent/sentinel-qa-checklist.md`
6. **Commit** — Only after steps 1–5 pass

See [CLAUDE.md](CLAUDE.md) for the full set of project conventions.

## Code Style

- **ESM only** — `"type": "module"`, use `.js` extensions in imports (even for `.ts` sources)
- **Zod 3.x** — Do not upgrade to Zod 4
- **User-facing messages** — Default to English; the pt-BR translation lives in `src/locales/` and is opt-in via `SENTINEL_LOCALE=pt-BR`. Add new strings to the locale dictionaries instead of hardcoding them at the call site
- **TypeScript strict mode** — `strict: true`
- **Path safety** — User-provided IDs that reach a file path must go through `sanitizeId()` (`src/utils/sanitize.ts`)

## Project Structure

- `src/agent/` — analyzer, planner, prompts, llm-client, orchestrator
- `src/runners/` — Playwright (web) and Maestro/Patrol (Flutter) test execution
- `src/event-validation/` — analytics capture patterns + spec validation (data log QA)
- `src/registry/` — app registry loader (`registry/apps.yaml`, selectors, event specs)
- `src/report/` — Markdown report rendering + report storage
- `src/store/` — test status / quarantine tracking
- `src/config/` — YAML config loader
- `src/locales/` — i18n message dictionaries (English default, pt-BR opt-in)
- `src/triggers/` — entry points (CLI today; GitHub Actions planned)
- `registry/` — app configuration and specs consumed at runtime

## Adding Support for a New App

1. Add an entry to `registry/apps.yaml` (see the existing `example-web` / `example-flutter` entries as a template)
2. Add a selector map at `registry/selectors/<app-id>.yaml`
3. Optionally add an event spec at `registry/event-specs/<app-id>.yaml` for data log QA
4. Run `npx sentinel-qa run --app <app-id> --diff HEAD~1` to verify

## Running Tests

```bash
npm run build            # tests run against compiled output in dist/
npm run test             # runs everything under dist/__tests__/
```

## Submitting Changes

1. Create a branch from `main`
2. Make your changes following the workflow above
3. Open a Pull Request with a clear description
4. Ensure CI passes

## Reporting Issues

Please use [GitHub Issues](https://github.com/pcristinapds-pixel/craftQA/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
