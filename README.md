<p align="center">
  <img src="https://raw.githubusercontent.com/ahn283/sentinel-qa/main/img/sentinel_logo.png" alt="Sentinel QA" width="480" />
</p>

<p align="center">
  <strong>Autonomous QA agent — generates and runs E2E tests on PR events via the Claude API.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sentinel-qa"><img src="https://img.shields.io/npm/v/sentinel-qa.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/sentinel-qa"><img src="https://img.shields.io/npm/dm/sentinel-qa.svg" alt="npm downloads" /></a>
  <img src="https://img.shields.io/node/v/sentinel-qa.svg" alt="node version" />
  <a href="https://github.com/ahn283/sentinel-qa/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/sentinel-qa.svg" alt="license" /></a>
</p>

---

sentinel-qa reads a code change, decides what needs testing, writes the tests, runs them, and reports back. It is a self-contained agent: point it at a pull request or a local diff, and it drives the full cycle without a human writing test cases.

> **Project status: early development.** The Analyze → Plan → Execute → Report pipeline runs end to end for web (Playwright). Flutter execution, PR comments, Slack reporting, and in-run analytics capture are not implemented yet — see [Roadmap](#roadmap).

## Architecture

A four-stage sequential pipeline:

```
                    ┌──────────────────────────────────────────┐
  PR event / CLI ──>│ 1. Analyze   git diff, PRD, app registry, │
                    │              selectors, event specs,      │
                    │              existing test statuses       │
                    ├──────────────────────────────────────────┤
                    │ 2. Plan      Claude API generates test    │
                    │              cases + executable code,     │
                    │              then self-critiques them     │
                    ├──────────────────────────────────────────┤
                    │ 3. Execute   AST validation gate ──>      │
                    │              Playwright (web)             │
                    ├──────────────────────────────────────────┤
                    │ 4. Report    Markdown report + JSON,      │
                    │              exit code 0 / 1              │
                    └──────────────────────────────────────────┘
```

| Stage | Module | What it does |
|-------|--------|--------------|
| Analyze | `src/agent/analyzer.ts` | Collects the git diff, optional PRD file, app entry, UI selectors, analytics event specs, and prior test statuses into an `AnalysisContext`. |
| Plan | `src/agent/planner.ts` | Sends that context to Claude, parses the response into a Zod-validated `PlannedTest[]`, then runs a self-critique pass over the generated code. |
| Execute | `src/agent/index.ts` → `src/runners/` | Validates every generated test through an AST-based security check, writes the survivors to a temp directory, and runs them with Playwright. |
| Report | `src/report/` | Renders a Markdown report, saves it alongside raw JSON, prints it to stdout, and returns a pass/fail exit code. |

## Quick Start

```bash
# Install dependencies and build
npm install
npm run build

# Claude API key (read by the Anthropic SDK)
export ANTHROPIC_API_KEY=sk-ant-...

# Run against the last commit, no PR required
npx sentinel-qa run --app arden-web --diff HEAD~1
```

The agent exits `0` when every test passes and `1` on any failure or error, so it can gate a CI job directly.

### CLI

```
sentinel-qa run [options]

  --app <id>              App ID from registry/apps.yaml (required)
  --pr <number>           GitHub PR number
  --base-branch <branch>  Base branch for diff (default: main)
  --diff <ref>            Git diff reference (e.g., HEAD~1)
  --validate-events       Enable data log QA
  --prd <path>            Path to PRD file
  --config <path>         Path to config directory
  --help                  Show this help message
```

Without `--diff`, the agent diffs `<base-branch>...HEAD`. A PRD passed via `--prd` is fed to the planner as product context, so tests can cover intent that the diff alone does not reveal — each generated test records whether it came from the `diff` or the `prd`.

## App Registry

Apps are declared in `registry/apps.yaml`:

```yaml
apps:
  - id: arden-web
    type: web                       # web | flutter
    url: https://arden.app
    prd: notion://placeholder
    context:
      selectors: ./selectors/arden-web.yaml
      event_spec: ./event-specs/arden-web.yaml
```

**Selectors** (`registry/selectors/<app>.yaml`) map logical names to UI locators. The planner is given this map so generated code references stable names instead of inventing selectors:

```yaml
add_ingredient_button: "재료 추가"
generate_button: "레시피 생성"
recipe_card: "레시피 생성 완료"
```

**Event specs** (`registry/event-specs/<app>.yaml`) declare the analytics events a flow must emit, with required and optional parameter types:

```yaml
events:
  - trigger: "Recipe generate button tap"
    event_name: generate_recipe
    required_params:
      ingredient_count: number
      source: string
    optional_params:
      recipe_type: string
```

## Configuration

Drop a `sentinel-qa.config.yaml` (or `.yml`) in the working directory, or point at its directory with `--config`. Every field is optional; the defaults below apply when the file is absent.

```yaml
anthropic:
  model: claude-sonnet-4-20250514
  max_tokens: 4096

slack:
  webhook_url: ~                    # or set SLACK_WEBHOOK_URL
  channel: "#qa-alerts"

github:
  comment_on_pr: true

test:
  max_retries: 3
  timeout: 300000                   # per Playwright run, ms
  confidence_threshold: 0.7
  quarantine:
    enabled: true
    window: 5                       # runs tracked per test

cost:
  track_tokens: true
  max_tokens_per_run: 100000        # hard stop for a single agent run
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key. Required — consumed directly by the Anthropic SDK. |
| `SLACK_WEBHOOK_URL` | Overrides `slack.webhook_url` in the config file. |
| `DEBUG` | Enables debug-level logging. |

Registry and report locations are currently fixed at `./registry` and `./reports` relative to the working directory.

## Features

### Generated-code security gate

Test code produced by an LLM is untrusted input, so nothing reaches Playwright unvalidated. `src/runners/playwright/validator.ts` parses each test with the TypeScript compiler API and rejects it on:

- calls to `eval`, `Function`, and `require`
- imports outside the allowlist — only `@playwright/*` and `playwright` are permitted
- Node built-ins such as `child_process`, `fs`, `net`, `vm`, and `worker_threads`
- `process.exit`, `process.kill`, and `process.env` access
- dynamic global access patterns such as `globalThis[...]`

Rejected tests are recorded as `skipped` with the validation error and the run continues. Execution itself happens by writing tests to a temp directory and spawning Playwright as a subprocess — never through `eval`.

### Token budget enforcement

Every Claude call is logged with its input/output token counts, and the running total is checked before each request. Exceeding `cost.max_tokens_per_run` aborts the run rather than silently spending more.

### Quarantine tracking

`src/store/test-status-store.ts` keeps a rolling window of the last N runs per test in `reports/<app-id>/status.yaml` and classifies each test as `new`, `stable`, `quarantine`, or `rejected` based on its pass rate. The analyzer feeds the current statuses back into the planner so it does not regenerate tests that already exist and pass.

### Data log QA

`src/event-validation/` compares captured analytics events against the spec: missing events, unexpected events, and parameter type errors. Parsers ship for GA4, Firebase, Amplitude, and Mixpanel endpoints.

> Capture is not yet wired into the Playwright runner. Today `--validate-events` loads the event spec into the planning context; live `page.route()` interception is on the roadmap.

### Reports

Each run writes `reports/<app-id>/<timestamp>/report.md` plus `result.json`, and prints the Markdown to stdout. The report contains a run summary, a per-test table, and expanded detail for each failure.

## Project Structure

```
sentinel-qa/
  src/
    index.ts               # bin entry point
    triggers/cli.ts        # CLI argument parsing
    agent/                 # analyzer, planner, prompts, llm-client, orchestrator
    runners/
      playwright/          # web runner + AST validator
      maestro/             # legacy Flutter bridge (being replaced by Patrol)
    event-validation/      # analytics capture patterns + spec validation
    registry/              # app registry loader
    report/                # Markdown rendering + report storage
    store/                 # test status / quarantine tracking
    config/                # YAML config loader
    utils/                 # logger, sanitize, YAML loader
    __tests__/             # unit tests (node:test)
  registry/
    apps.yaml              # registered apps
    selectors/             # UI selector maps
    event-specs/           # analytics event specs
  reports/                 # generated reports + status (gitignored)
  docs/agent/              # PRD and development checklist
```

## Development

```bash
npm install
npm run build            # tsc
npm run test             # node:test over dist/
npm run lint
```

Tests run against compiled output, so `npm run build` must succeed first. The full contributor workflow — develop → build → review → test → checklist → commit — is described in [CLAUDE.md](CLAUDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

**Constraints worth knowing before you patch anything:**

- ESM only (`"type": "module"`) — imports use `.js` extensions even for `.ts` sources.
- Zod 3.x. Do not upgrade to Zod 4.
- All external input (YAML, API responses, env vars) is validated through Zod schemas.
- User-provided IDs that reach a file path must go through `sanitizeId()`.
- User-facing strings are English; docs and commit messages may be Korean.

## Roadmap

| Area | Status |
|------|--------|
| CLI trigger, Analyze stage | Done |
| Plan stage (Claude API, self-critique) | Done |
| Execute stage (Playwright, AST gate) | Done |
| Report generation (Markdown + JSON) | Done |
| Analytics capture during test runs | Planned |
| Confidence score + token usage in reports | Planned |
| GitHub PR comments (`@octokit/rest`) | Planned |
| GitHub Actions trigger + workflow | Planned |
| Slack bug reports, retry loop | Planned |
| Patrol runner for Flutter | Planned |

Detailed task breakdown: [`docs/agent/sentinel-qa-checklist.md`](docs/agent/sentinel-qa-checklist.md).

## License

[MIT](LICENSE)
