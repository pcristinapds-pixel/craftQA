<p align="center">
  <img src="https://raw.githubusercontent.com/ahn283/sentinel-qa/main/img/sentinel_logo.png" alt="Sentinel QA" width="480" />
</p>

<p align="center">
  <strong>MCP server for AI-powered QA automation — run Playwright & Maestro tests, validate analytics events, and generate reports.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sentinel-qa"><img src="https://img.shields.io/npm/v/sentinel-qa.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/sentinel-qa"><img src="https://img.shields.io/npm/dm/sentinel-qa.svg" alt="npm downloads" /></a>
  <img src="https://img.shields.io/node/v/sentinel-qa.svg" alt="node version" />
  <a href="https://github.com/ahn283/sentinel-qa/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/sentinel-qa.svg" alt="license" /></a>
</p>

---

> sentinel-qa contains no LLM calls. It is purely test execution infrastructure designed to be driven by an AI agent like [pilot-ai](https://github.com/ahn283/pilot-ai).

## Architecture

```
pilot-ai (LLM) ──stdio──> sentinel-qa (MCP Server)
                              ├── Playwright (web E2E tests)
                              ├── Maestro (Flutter E2E tests)
                              ├── Data Log QA (analytics event validation)
                              ├── Quarantine (test reliability management)
                              └── Markdown Reports
```

## Quick Start

```bash
# Install
npm install
npm run build

# Run MCP server
node packages/mcp-server/dist/index.js

# Or via npx (after npm publish)
npx sentinel-qa
```

### Configure in your MCP client

```json
{
  "mcpServers": {
    "sentinel-qa": {
      "command": "npx",
      "args": ["sentinel-qa"]
    }
  }
}
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_apps` | List registered apps from registry |
| `get_selectors` | Get UI selector mappings for an app |
| `save_tests` | Save test cases (code) for an app |
| `run_tests` | Execute tests via Playwright/Maestro with optional analytics validation |
| `get_report` | Get the latest Markdown test report |

### Example Flow

```
1. list_apps()              → See available apps
2. get_selectors("my-app")  → Get UI selectors for code generation
3. save_tests(...)          → Save generated test code
4. run_tests("my-app", platform: "web", validate_events: true)
                            → Run Playwright tests + validate analytics
5. get_report("my-app")    → Get Markdown report
```

## Features

### Playwright Web Testing
- Write-to-temp-file execution pattern (no eval)
- Code validation blocks dangerous APIs (eval, fs, child_process, etc.)
- Headless by default, configurable timeout
- JSON result parsing with screenshot capture on failure

### Data Log QA
- Define expected analytics events in YAML (`registry/event-specs/`)
- Validate captured events against spec: missing, unexpected, param errors
- Supports GA4, Firebase, Amplitude, Mixpanel URL patterns
- Event validation results included in Markdown reports

### Quarantine System
- Tracks test reliability over last 5 runs
- Auto-promotes: 5/5 pass → `stable`
- Auto-quarantines: 3-4/5 pass → `quarantine`
- Auto-rejects: 0-2/5 pass → `rejected`
- Rejected tests excluded from runs; quarantined tests opt-in via `include_quarantine`

### Markdown Reports
- Auto-generated on each test run
- Stored at `reports/<app_id>/<timestamp>/report.md`
- Includes summary, test details, failures, and event validation results
- Raw JSON also saved for programmatic access

## Project Structure

```
sentinel-qa/
  packages/
    mcp-server/           # MCP server (entry point)
    playwright-runner/    # Playwright web test runner
    maestro-bridge/       # Maestro Flutter test bridge
  registry/
    apps.yaml             # Registered apps
    selectors/            # App UI selector mappings
    event-specs/          # Analytics event specifications
  reports/                # Generated test reports (gitignored)
  tests/                  # Test status tracking (gitignored)
  scripts/
    verify-mcp-flow.mjs   # E2E verification script
```

## App Registry

Register apps in `registry/apps.yaml`:

```yaml
apps:
  - id: my-web-app
    type: web
    url: https://my-app.com
    context:
      selectors: ./selectors/my-web-app.yaml
      event_spec: ./event-specs/my-web-app.yaml
```

## Development

```bash
npm install              # Install dependencies
npm run build            # Build all packages
npm run test             # Run all tests
npm run lint             # Lint all packages
```

### Verify MCP server

```bash
node scripts/verify-mcp-flow.mjs
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SENTINEL_REGISTRY_DIR` | App registry directory | `registry/` |
| `SENTINEL_REPORTS_DIR` | Report output directory | `reports/` |
| `SENTINEL_TESTS_DIR` | Test status directory | `tests/` |
| `DEBUG` | Enable debug logging | (unset) |

## License

[MIT](LICENSE)
