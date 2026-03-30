# sentinel-qa Agent PRD

> 버전: 1.1
> 작성일: 2026-03-31
> 상태: 초안 — 리뷰 필요

---

## 1. 배경 및 동기

### 현재 상태 (MCP 서버)
sentinel-qa는 현재 MCP(Model Context Protocol) 서버로 구현되어 있다. pilot-ai 같은 외부 AI 에이전트가 MCP 프로토콜로 접속해 TC 저장(`save_tests`) → 테스트 실행(`run_tests`) → 결과 조회(`get_report`)를 순차 호출하는 구조다.

### 한계
- **수동 트리거**: PR이 열려도 누군가(pilot-ai)가 MCP를 호출해야 테스트가 시작됨
- **TC 생성 외부 의존**: TC 생성 책임이 pilot-ai에 있어 sentinel-qa 단독 사용 불가
- **실행 코드 변환 부재**: 자연어 TC → 실행 가능한 Playwright/Patrol 코드 변환이 파이프라인에 없음
- **피드백 루프 없음**: 테스트 실패 시 자동으로 수정 요청을 보내는 메커니즘 미구현

### 방향 전환
sentinel-qa를 **독립적인 QA 에이전트**로 전환한다. PR 이벤트를 직접 감지하고, Claude API로 TC를 생성하며, 실행 코드 변환까지 자체 수행한다. 실패 시 Slack을 통해 pilot-ai에게 버그 리포트를 보내 자동 수정 루프를 완성한다.

---

## 1.5. 경쟁 환경 및 포지셔닝

### 시장 구조

| 구분 | 대표 제품 | 가격대 | sentinel-qa 차별점 |
|------|----------|--------|-------------------|
| 매니지드 서비스 | QA Wolf, Bug0 | $5K+/월 | 오픈소스, 무료, 셀프 호스팅 |
| SaaS 플랫폼 | Octomind, Momentic, testRigor | $250+/월 | 벤더 종속 없음, GitHub Actions 네이티브 |
| 오픈소스 도구 | TestZeus Hercules, PR Test Generator | 무료 | analytics 검증 + quarantine + 실패 루프 조합 유일 |

### 레퍼런스 아키텍처

**OpenObserve Council of Sub Agents** — Claude Code 기반 8개 전문 에이전트로 700+ E2E 테스트 자동 생성, flaky 테스트 85% 감소. 4단계 파이프라인(analysis → architecture → engineering → healing)이 sentinel-qa의 Analyze → Plan → Execute → Report과 일치. 업계에서 검증된 구조.

### 고유 강점 (경쟁사 대비)
- **Analytics 이벤트 검증** — E2E 테스트 중 데이터 로그 QA를 동시에 수행하는 유일한 오픈소스 도구
- **Quarantine 시스템** — 5회 슬라이딩 윈도우 기반 테스트 신뢰도 자동 관리 (QA Wolf 유사 패턴)
- **셀렉터 레지스트리** — 런타임 AI 해석(Momentic)보다 결정적이고 안정적
- **PRD + diff 이중 입력** — 기능 전체 커버리지 + PR 영향 범위 집중 TC를 동시에 생성
- **MIT 오픈소스** — 상용 대안 대비 $0 (경쟁사 연간 $3K ~ $90K)

### 업계 트렌드 (2025-2026)
- 72%의 QA 팀이 AI 기반 테스트 워크플로우 탐색 중
- AI 에이전트 도입 시 분석 속도 6-10배, flaky 테스트 85% 감소, 커버리지 84% 증가 보고
- **자율 AI 테스트 신뢰도는 29%로 하락** — 사람의 리뷰 게이트가 여전히 중요

---

## 2. 목표

| 우선순위 | 목표 | 성공 기준 |
|---------|------|----------|
| P0 | PR 오픈 시 자동으로 TC 생성 + E2E 테스트 실행 | GitHub Actions에서 PR 트리거 → 테스트 완료까지 무인 동작 |
| P0 | Claude API로 실행 가능한 테스트 코드 직접 생성 | 생성된 코드가 Playwright/Patrol에서 바로 실행됨 |
| P1 | 테스트 실패 시 pilot-ai에 자동 버그 리포트 | Slack 메시지 전송 → pilot-ai 수신 확인 |
| P1 | 실패 → 수정 → 재테스트 루프 (최대 3회) | 3회 이내 자동 복구율 측정 가능 |
| P2 | `apps.yaml` 등록만으로 새 앱 온보딩 | 기존 레지스트리 구조 유지, 설정 3~5줄 |

---

## 3. 핵심 플로우

```
PR 오픈 / 재커밋
    ↓
GitHub Actions → sentinel-qa 트리거
    ↓
┌─────────────────────────────────────┐
│ 1. ANALYZE                          │
│    - PR diff 추출 (git diff)        │
│    - PRD 로드 (Markdown / Notion)   │
│    - 앱 레지스트리 조회 (apps.yaml) │
│    - 셀렉터 로드 (selectors/*.yaml) │
│    - 이벤트 스펙 로드 (event-specs/) │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. PLAN (Claude API)                │
│    - PRD + diff + 셀렉터 → 프롬프트 │
│    - TC 목록 생성 (YAML)            │
│    - TC별 실행 코드 생성             │
│      - 웹: Playwright TS 코드       │
│      - Flutter: Patrol Dart 코드    │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. EXECUTE                          │
│    - 코드 안전성 검증 (validator)    │
│    - Playwright / Patrol 실행       │
│    - 이벤트 캡처 (validate_events)  │
│    - 이벤트 스펙 대조 검증          │
│    - 테스트 상태 기록 (quarantine)  │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. REPORT                           │
│    - Markdown + JSON 리포트 생성    │
│    - PR 코멘트로 결과 게시          │
│    ├─ 전체 통과 → ✅ 머지 가능      │
│    └─ 실패 → Slack 버그 리포트 전송 │
│             → pilot-ai 수정 대기    │
│             → 재커밋 시 재트리거     │
│             → 3회 초과 → 수동 개입   │
└─────────────────────────────────────┘
```

---

## 4. 아키텍처

### 4.1 모듈 구조

```
sentinel-qa/
  src/
    agent/                        # 에이전트 코어 (신규)
      index.ts                    # 메인 오케스트레이터 (analyze → plan → execute → report)
      analyzer.ts                 # PRD + git diff 파싱, 컨텍스트 수집
      planner.ts                  # Claude API 호출 → TC + 실행 코드 생성
      reporter.ts                 # 리포트 생성 + PR 코멘트 + Slack 전송

    runners/                      # 테스트 실행기 (기존 코드 재활용)
      playwright.ts               # ← packages/playwright-runner 통합
      patrol.ts                   # ← packages/maestro-bridge → Patrol로 교체

    event-validation/             # 데이터 로그 QA (기존 코드 재활용)
      validator.ts                # 이벤트 스펙 대조 검증
      capture-patterns.ts         # GA4/Firebase/Amplitude URL 매칭
      schema.ts                   # 이벤트 스펙 Zod 검증
      types.ts

    store/                        # 상태 관리 (기존 코드 재활용)
      test-status-store.ts        # quarantine 시스템 (5회 슬라이딩 윈도우)

    report/                       # 리포트 포맷터 (기존 코드 재활용)
      markdown.ts                 # Markdown 리포트 생성

    registry/                     # 앱 레지스트리 (기존 코드 재활용)
      registry.ts                 # apps.yaml + selectors + event-specs 로더

    triggers/                     # 트리거 (신규)
      github-action.ts            # GitHub Actions entrypoint
      cli.ts                      # 수동 실행 (npx sentinel-qa run)

    utils/
      logger.ts                   # 로깅 (기존)
      yaml-loader.ts              # YAML 파서 (기존)

  registry/                       # 앱 설정 (기존 유지)
    apps.yaml
    selectors/
    event-specs/

  .github/
    workflows/
      sentinel-qa.yml             # GitHub Actions 워크플로우 (신규)
```

### 4.2 기존 코드 처리 방침

| 기존 모듈 | 처리 | 사유 |
|-----------|------|------|
| `packages/mcp-server/src/tools/` | **삭제** | MCP 도구 등록 패턴 불필요 |
| `packages/mcp-server/src/schemas/tools.ts` | **삭제** | MCP 입력 스키마 불필요 |
| `packages/mcp-server/src/index.ts` | **삭제** | MCP 서버 부트스트랩 불필요 |
| `packages/mcp-server/src/store/test-store.ts` | **삭제** | 인메모리 TC 저장소 → 에이전트 내부 상태로 대체 |
| `@modelcontextprotocol/sdk` 의존성 | **삭제** | MCP 프로토콜 불필요 |
| `packages/playwright-runner/` | **통합** | `src/runners/playwright.ts`로 이동 |
| `packages/maestro-bridge/` | **교체** | Patrol로 교체, `src/runners/patrol.ts` |
| `src/event-validation/` | **유지** | 데이터 로그 QA 핵심 로직 |
| `src/store/test-status-store.ts` | **유지** | quarantine 시스템 |
| `src/report/markdown.ts` | **유지** | 리포트 생성 |
| `src/registry/` | **유지** | 앱 레지스트리 로더 |
| `registry/` (YAML 파일들) | **유지** | 앱 설정 데이터 |

### 4.3 모노레포 → 단일 패키지 전환

현재 3개 workspace(`mcp-server`, `playwright-runner`, `maestro-bridge`)를 **단일 패키지**로 통합한다. 에이전트가 하나의 진입점을 가지므로 모노레포 구조의 이점이 없다. Turborepo 설정도 제거한다.

### 4.4 기술 스택 변경

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 진입점 | MCP stdio 서버 | CLI (`npx sentinel-qa run`) + GitHub Actions |
| AI | 없음 (외부 의존) | Claude API (Anthropic SDK) |
| Flutter 테스트 | Maestro | Patrol |
| 웹 테스트 | Playwright | Playwright (유지) |
| 패키지 구조 | 모노레포 (3 packages) | 단일 패키지 |
| 빌드 | Turborepo + tsc | tsc |
| 통신 | MCP JSON-RPC (stdin/stdout) | Slack API + GitHub API |

---

## 5. 상세 모듈 설계

### 5.1 Agent — `src/agent/index.ts`

메인 오케스트레이터. 4단계 파이프라인을 순차 실행한다.

```typescript
interface AgentConfig {
  appId: string;
  prNumber?: number;          // GitHub PR 번호
  baseBranch?: string;        // diff 기준 브랜치 (default: main)
  maxRetries?: number;        // 실패 시 재시도 (default: 3)
  validateEvents?: boolean;   // 데이터 로그 QA 활성화
  prdPath?: string;           // PRD 파일 경로
}

interface AgentResult {
  status: 'passed' | 'failed' | 'error';
  totalTests: number;
  passed: number;
  failed: number;
  report: string;             // Markdown 리포트
  failedTests: FailedTest[];  // 실패 상세
}
```

### 5.2 Analyzer — `src/agent/analyzer.ts`

PR 컨텍스트를 수집해 Planner에 전달할 구조화된 입력을 만든다.

```typescript
interface AnalysisContext {
  app: AppEntry;                  // registry에서 조회
  diff: string;                   // git diff 결과
  prd: string;                    // PRD 문서 내용
  selectors: SelectorMap;         // UI 셀렉터
  eventSpecs?: EventSpecConfig;   // 이벤트 스펙 (선택)
  existingTests?: TestStatus[];   // 기존 테스트 상태 (quarantine 정보)
}
```

**입력 소스**:
- `git diff <baseBranch>...HEAD` — 변경 코드
- `registry/apps.yaml` — 앱 메타데이터
- `registry/selectors/<app>.yaml` — UI 셀렉터
- `registry/event-specs/<app>.yaml` — 이벤트 스펙
- PRD 파일 (Markdown, 경로 설정)

### 5.3 Planner — `src/agent/planner.ts`

Claude API를 호출해 TC + 실행 코드를 생성한다.

```typescript
interface PlannedTest {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  trigger: 'prd' | 'diff';       // 생성 근거
  affectedFiles?: string[];       // diff 기반일 때 관련 파일
  platform: 'web' | 'flutter';
  code: string;                   // 실행 가능한 Playwright TS 또는 Patrol Dart 코드
}
```

**프롬프트 전략**:
1. **시스템 프롬프트**: sentinel-qa의 역할, 코드 생성 규칙, 셀렉터 사용법, **few-shot 예제** (프레임워크별 올바른 테스트 코드 2-3개)
2. **유저 프롬프트**: PRD + diff + 셀렉터 맵 + 이벤트 스펙
3. **출력 형식**: JSON 배열 (`PlannedTest[]`)
4. **Self-critique 단계**: 생성된 코드를 Claude가 한 번 더 검토 — 셀렉터 오용, 누락된 assertion, 보안 위반 체크 후 수정

**코드 생성 규칙** (프롬프트에 포함):
- 웹: Playwright `test()` 블록, 제공된 셀렉터만 사용, `page.goto()` 포함
- Flutter: Patrol `patrolTest()` 블록, 위젯 키/텍스트 기반 파인더
- **smart wait 필수**: `waitForSelector`, `waitForLoadState` 등 명시적 대기 사용 (하드코딩된 `waitForTimeout` 금지)
- **retry-friendly 패턴**: flaky 방지를 위해 `expect().toBeVisible()` 등 auto-retry assertion 우선 사용
- 외부 네트워크 요청 금지, 파일시스템 접근 금지
- 각 테스트는 독립적 (shared state 없음)

**기존 테스트 중복 방지**:
- 생성 전 기존 stable 테스트 목록을 프롬프트에 포함
- 유사한 시나리오가 있으면 새로 생성하지 않도록 지시

### 5.4 Runners

#### Playwright — `src/runners/playwright.ts`
기존 `packages/playwright-runner`의 코어 로직을 통합한다.

- 생성된 TS 코드를 임시 파일에 기록
- `npx playwright test` 스폰
- `results.json` 파싱
- 이벤트 캡처: `page.route()` 인터셉트 → `capturedEvents[]` 수집

#### Patrol — `src/runners/patrol.ts`
기존 Maestro 브릿지를 Patrol로 교체한다.

- 생성된 Dart 코드를 대상 앱의 `integration_test/` 디렉터리에 기록
- `patrol test` 스폰
- 결과 파싱

### 5.5 Reporter — `src/agent/reporter.ts`

```typescript
interface BugReport {
  app: string;
  pr: number;
  commit: string;
  totalTests: number;
  failedCount: number;
  retryCount: number;
  failures: {
    testId: string;
    title: string;
    error: string;
    file?: string;
    line?: number;
  }[];
}
```

**출력 채널**:
1. **PR 코멘트** — GitHub API로 테스트 결과 요약 게시. `[AI-Generated]` 라벨 포함. 이전 sentinel-qa 코멘트가 있으면 업데이트 (중복 방지)
2. **Slack 메시지** — 실패 시 pilot-ai 채널에 구조화된 버그 리포트 전송
3. **파일 리포트** — `reports/<appId>/<timestamp>/` 에 Markdown + JSON 저장 (기존 유지)

**신뢰도 게이트**:
- 각 테스트에 confidence score (0-1) 부여
- 저신뢰 결과(`< 0.7`)가 PR을 블록하지 않도록 warning으로 표시
- 전체 통과 + 고신뢰일 때만 ✅ 머지 가능 표시

### 5.6 Triggers

#### GitHub Actions — `src/triggers/github-action.ts`
```typescript
// 환경 변수에서 PR 정보 추출
const config: AgentConfig = {
  appId: process.env.SENTINEL_APP_ID,
  prNumber: parseInt(process.env.GITHUB_PR_NUMBER),
  baseBranch: process.env.GITHUB_BASE_REF,
  validateEvents: process.env.SENTINEL_VALIDATE_EVENTS === 'true',
  prdPath: process.env.SENTINEL_PRD_PATH,
};
```

#### CLI — `src/triggers/cli.ts`
```bash
# 수동 실행
npx sentinel-qa run --app fridgify --pr 42 --validate-events

# 로컬 테스트 (PR 없이)
npx sentinel-qa run --app arden-web --diff HEAD~1
```

---

## 6. GitHub Actions 워크플로우

```yaml
# .github/workflows/sentinel-qa.yml
name: sentinel-qa

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  qa:
    runs-on: macos-latest  # Flutter 시뮬레이터 필요 시
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # full history for diff

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run sentinel-qa
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SENTINEL_APP_ID: ${{ github.event.repository.name }}
          GITHUB_PR_NUMBER: ${{ github.event.pull_request.number }}
        run: npx sentinel-qa run
```

---

## 7. 데이터 로그 QA

기존 `event-validation/` 모듈을 그대로 활용한다. 변경 없음.

**플로우**:
1. Playwright 실행 중 `page.route('**/collect*')` 등으로 analytics 요청 인터셉트
2. 캡처된 이벤트를 `CapturedEvent[]`로 수집
3. `validateEvents(capturedEvents, eventSpec)` — 스펙 대조
4. 결과를 리포트에 포함 (missing / unexpected / param mismatch)

**지원 플랫폼**: GA4, Firebase Analytics, Amplitude, Mixpanel (기존 `capture-patterns.ts`)

---

## 8. 앱 레지스트리 확장

기존 `apps.yaml` 스키마에 PRD 경로와 리포지토리 정보를 추가한다.

```yaml
# registry/apps.yaml
apps:
  - id: fridgify
    type: flutter
    repo: github.com/eodin/fridgify
    prd: docs/prd.md                    # 신규: PRD 경로
    context:
      selectors: ./selectors/fridgify.yaml
      event_spec: ./event-specs/fridgify.yaml

  - id: arden-web
    type: web
    url: https://arden.app
    repo: github.com/eodin/arden-web    # 신규: 리포 주소
    prd: docs/prd.md                    # 신규: PRD 경로
    context:
      selectors: ./selectors/arden-web.yaml
      event_spec: ./event-specs/arden-web.yaml
```

---

## 9. 설정

```yaml
# sentinel-qa.config.yaml (프로젝트 루트)
anthropic:
  model: claude-sonnet-4-20250514      # TC 생성 모델
  max_tokens: 4096

slack:
  webhook_url: ${SLACK_WEBHOOK_URL}    # 환경 변수 참조
  channel: "#qa-alerts"

github:
  comment_on_pr: true                  # PR 코멘트 활성화

test:
  max_retries: 3                       # 실패 시 최대 재시도
  timeout: 300000                      # 테스트 타임아웃 (5분)
  confidence_threshold: 0.7            # 이 이하는 warning으로 표시
  quarantine:
    enabled: true
    window: 5                          # 슬라이딩 윈도우 크기

cost:
  track_tokens: true                   # API 토큰 사용량 로깅
  max_tokens_per_run: 100000           # 런당 최대 토큰 (초과 시 중단)
```

### LLM 인터페이스 설계

Planner는 LLM 호출을 추상화된 인터페이스를 통해 수행한다. 현재는 Claude만 지원하되, 향후 다른 LLM으로 교체 가능하도록 설계한다.

```typescript
interface LLMClient {
  generateTests(context: AnalysisContext): Promise<PlannedTest[]>;
  critiqueTests(tests: PlannedTest[]): Promise<PlannedTest[]>;
}

// 현재 구현
class ClaudeLLMClient implements LLMClient { ... }
```

---

## 10. 개발 로드맵

| 단계 | 내용 | 산출물 | 의존성 |
|------|------|--------|--------|
| **0단계** | 모노레포 → 단일 패키지 전환, MCP 코드 제거 | 정리된 프로젝트 구조 | 없음 |
| **1단계** | CLI 트리거 + Analyzer (diff 파싱) | `triggers/cli.ts`, `agent/analyzer.ts` | 0단계 |
| **2단계** | Planner (Claude API → TC + 코드 생성) | `agent/planner.ts` | 1단계 |
| **3단계** | Playwright 러너 통합 + 첫 웹 앱 E2E 검증 | `runners/playwright.ts` | 2단계 |
| **4단계** | Reporter (Markdown + PR 코멘트) | `agent/reporter.ts` | 3단계 |
| **5단계** | GitHub Actions 워크플로우 + PR 트리거 | `sentinel-qa.yml`, `triggers/github-action.ts` | 4단계 |
| **6단계** | Slack 버그 리포트 + pilot-ai 루프 | Slack 연동, 재시도 로직 | 5단계 |
| **7단계** | Patrol 러너 → Flutter 앱 연동 | `runners/patrol.ts` | 3단계 |
| **8단계** | 오픈소스 공개 (README, CONTRIBUTING, MIT) | GitHub public | 6단계 |

---

## 11. 의존성

### 추가되는 의존성
| 패키지 | 용도 |
|--------|------|
| `@anthropic-ai/sdk` | Claude API 호출 (TC 생성) |
| `@slack/webhook` | Slack 버그 리포트 전송 |
| `@octokit/rest` | GitHub API (PR 코멘트) |

### 유지되는 의존성
| 패키지 | 용도 |
|--------|------|
| `@playwright/test` | 웹 E2E 테스트 실행 |
| `yaml` | YAML 파싱 |
| `zod` (3.x) | 입력 검증 |

### 삭제되는 의존성
| 패키지 | 사유 |
|--------|------|
| `@modelcontextprotocol/sdk` | MCP 프로토콜 제거 |
| `turbo` | 모노레포 해체 |

---

## 12. 미결 사항

- [ ] 첫 번째 검증 대상 앱 선정 (fridgify vs arden-web)
- [ ] PRD 소스 확정 — 초기엔 레포 내 Markdown 파일 권장, Notion은 후순위
- [ ] GitHub Actions macOS runner에서 Flutter 시뮬레이터 + Patrol 실행 가능 여부 검증
- [ ] pilot-ai Slack 수신 → 코드 수정 트리거 방식 상세 설계
- [ ] Claude API 모델 선택 — sonnet (속도/비용) vs opus (정확도)
- [ ] 테스트 코드 생성 시 셀렉터 부족 대응 전략 (자동 탐색 vs 에러)
- [ ] 기존 테스트 9개 — 재활용 모듈 테스트만 유지, 나머지 삭제 범위 확정
- [ ] Patrol Dart 코드 생성 품질 조기 검증 — Maestro YAML보다 LLM 난이도 높음, 필요 시 Maestro 병행 고려
- [ ] 셀프 힐링 로케이터 전략 — 1차 프롬프트 기반 fallback, 장기적으로 AI 로케이터 해석
- [ ] 비주얼 리그레션 테스트 — Playwright 스크린샷 비교를 선택적 post-run 체크로 추가 여부

---

## 13. 참고 자료

- [OpenObserve — 700+ Test Coverage with AI Agents](https://openobserve.ai/blog/autonomous-qa-testing-ai-agents-claude-code/)
- [QA Wolf — Best AI Testing Tools 2026](https://www.qawolf.com/blog/the-12-best-ai-testing-tools-in-2026)
- [QA Wolf — Self-Healing Test Automation Types](https://www.qawolf.com/blog/self-healing-test-automation-types)
- [Octomind — AI E2E Testing](https://octomind.dev/)
- [Momentic — Self-Healing Guide](https://momentic.ai/blog/self-healing-test-automation-guide)
- [Anthropic claude-code-action](https://github.com/anthropics/claude-code-action)
- [Qodo PR-Agent (open source)](https://github.com/qodo-ai/pr-agent)
- [TestZeus Hercules (open source)](https://github.com/test-zeus-ai/testzeus-hercules)
- [PR Test Generator — Claude + Magnitude](https://github.com/ka-brian/self-testing-github-action)
- [AI Code Quality Guardrails 2026](https://tfir.io/ai-code-quality-2026-guardrails/)
