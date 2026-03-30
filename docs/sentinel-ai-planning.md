# [ARCHIVED] sentinel-qa 프로젝트 기획 정리

> **⚠️ 이 문서는 아카이브되었습니다.** MCP 서버 기반 설계는 에이전트 아키텍처로 대체되었습니다.
> 최신 기획: `docs/agent/sentinel-qa-agent-prd.md`
> 최신 체크리스트: `docs/agent/sentinel-qa-checklist.md`

> 논의 일자: 2026-03-14
> 목적: PRD 기반 QA 자동화 인프라 설계 및 pilot-ai 연동 계획

---

## 1. 프로젝트 개요

### 목표
- pilot-ai가 PRD를 읽고 테스트케이스를 생성하면, sentinel-qa가 이를 실행하고 결과를 반환
- Flutter 앱 (iOS/Android) 및 웹 (React/Next.js) UI 동작을 자동으로 테스트
- 단위 테스트를 넘어 실제 사용자 플로우 기반 E2E 테스트 자동화
- **데이터 로그 QA**: E2E 테스트 실행 중 analytics 이벤트(Firebase, Amplitude 등) 발화를 캡처하고 스펙과 비교 검증
- pilot-ai와 연동해 Slack/Telegram 자연어 명령으로 테스트 트리거

### 역할 분리
- **pilot-ai**: LLM 보유. PRD 파싱, 테스트케이스 생성, 코드 생성 등 AI 판단 담당
- **sentinel-qa**: LLM 없음. 테스트 실행, 결과 수집, 리포트 등 인프라 담당 (MCP 서버)

### 프로젝트 이름
- **`sentinel-qa`** (오픈소스 공개 예정)
- npm 충돌 없음 확인
- pilot-ai와 `-ai` suffix 계열 통일 → 에코시스템 일관성
- "AI 기반 감시/QA 도구" 의미 직관적으로 전달

---

## 2. 핵심 아키텍처

```
pilot-ai (LLM 보유)
  ├─ PRD 읽기 + 테스트케이스 YAML 생성
  ├─ YAML + 앱 컨텍스트(selectors) → 실행 가능한 코드 생성
  └─ sentinel-qa MCP 서버 호출 (stdio)
       ↓
sentinel-qa (MCP 서버 — 테스트 인프라)
  ├─ 테스트케이스 저장 및 관리
  ├─ 플랫폼별 UI 자동화 실행
  │    ├─ Flutter 앱 (iOS/Android) → Maestro
  │    ├─ 웹 (React/Next.js) → Playwright
  │    └─ API 레이어 → pytest + httpx (선택적)
  ├─ 데이터 로그 QA (analytics 이벤트 캡처 + 검증)
  │    ├─ 웹 → Playwright network interception
  │    └─ Flutter → 디바이스 로그 캡처 / 프록시
  ├─ 진행률 보고 (MCP progress notifications)
  ├─ 결과 수집 및 보고 (Allure / HTML Report)
  └─ CI/CD 트리거 (GitHub Actions)
```

### 전체 플로우 예시

```
Telegram: "fridgify 레시피 테스트 돌려줘"
    ↓
pilot-ai (LLM 판단)
  ├─ PRD에서 테스트케이스 YAML 생성
  ├─ YAML → Playwright/Maestro 실행 코드 생성
  └─ sentinel-qa MCP 호출
       → save_tests({ app: "fridgify", tests: [...] })
       → run_tests({ app: "fridgify", suite: "recipe" })
            ↓ (progress: "3/10 테스트 실행 중...")
       → get_report({ app: "fridgify" })
       ↓
pilot-ai → Telegram 리포트 전송
```

---

## 3. 플랫폼별 테스트 도구

### 도구 선택 근거

| 플랫폼 | 도구 | 이유 |
|--------|------|------|
| Flutter (iOS/Android) | **Maestro** | YAML 기반 테스트 정의, CLI 외부 트리거 용이, 네이티브 요소 접근 가능, 오픈소스 무료 |
| React / Next.js 웹 | **Playwright** | 크로스 브라우저, 자동 대기, TypeScript 지원 |
| API 레이어 | **pytest + httpx** | 가볍고 빠름, 선택적 추가 |

### Patrol 대신 Maestro를 선택한 이유

| 기준 | Patrol | Maestro |
|------|--------|---------|
| 테스트 정의 방식 | Dart 코드 | YAML (AI 생성과 자연스럽게 호환) |
| 외부 시스템 연동 | CLI 있지만 결과 파싱 어려움 | CLI + JSON 결과 출력 내장 |
| JUnit/JSON 리포트 | 미내장 (Gradle/xcodebuild 의존) | 내장 지원 |
| 실시간 이벤트 | 미지원 | CLI stdout으로 진행률 확인 가능 |
| 네이티브 요소 접근 | 지원 | 지원 |
| 테스트 파일 간 재빌드 | 필요 (느림) | 불필요 |
| 비용 | 무료 (오픈소스) | CLI 무료 (오픈소스), Cloud는 유료 |
| CI/CD | GitHub Actions 가능 | GitHub Actions 가능 + Cloud 옵션 |

> Maestro의 YAML 기반 테스트 정의는 pilot-ai가 LLM으로 생성하기에 최적이며,
> sentinel-qa가 외부에서 실행하고 결과를 수집하기에도 가장 적합하다.

### Playwright로 Flutter/React Native 테스트가 불가능한 이유

- **웹 (React/Next.js)**: Playwright → Chromium DevTools Protocol → DOM 직접 조작 ✅
- **Flutter 네이티브**: Playwright → Chromium DevTools Protocol → Skia/Impeller 렌더러 (DOM 없음) ❌
- Flutter는 DOM이 아닌 캔버스에 픽셀을 직접 그리기 때문에 Playwright가 UI 요소를 인식 불가

### 코드 예시

```typescript
// Playwright — 웹 UI + API 동시 검증
await page.route('**/api/recipes', route => route.fulfill({ json: mockData }));
await page.click('button[data-testid="generate"]');
await expect(page.locator('.recipe-card')).toBeVisible();
```

```yaml
# Maestro — Flutter 앱 E2E 테스트 (YAML 기반)
appId: com.eodin.fridgify
---
- tapOn: "재료 추가"
- inputText: "계란"
- tapOn: "레시피 생성"
- assertVisible: "레시피 생성 완료"
```

```python
# pytest + httpx — 순수 API 계약 테스트
response = await client.post("/api/recipes", json={"ingredients": ["egg"]})
assert response.status_code == 200
```

### 참고: @playwright/mcp 공식 서버

Microsoft가 공개한 `@playwright/mcp`는 **브라우저 조작용** MCP 서버이다 (AI 에이전트가 웹을 탐색하는 용도).
sentinel-qa의 **테스트 실행용** MCP 서버와는 목적이 다르지만, pilot-ai가 탐색적 테스트나 DOM 스냅샷 수집 시 함께 활용할 수 있다.

---

## 4. 레포지토리 구조

### 기본 원칙
- **플랫폼 독립적 QA 인프라**: 어떤 앱이 추가돼도 `apps.yaml`에 등록만 하면 온보딩 완료
- `sentinel-qa`는 독립 레포로 분리
- 오픈소스 공개 전제로 설계 (Eodin 브랜드 종속 최소화)
- sentinel-qa는 LLM을 직접 호출하지 않음 (AI 로직은 pilot-ai 담당)

### 모노레포 도구
- **npm workspaces + turborepo**
- npm은 Node.js 내장이라 별도 설치 불필요, 오픈소스 기여자 진입 장벽 최소화
- turborepo로 빌드 캐싱 및 병렬 실행 지원

```json
// package.json (root)
{
  "name": "sentinel-qa",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"]
}
```

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "cache": false
    },
    "lint": {}
  }
}
```

### 디렉토리 구조

```
sentinel-qa/                   # 독립 레포 (오픈소스)
  packages/
    mcp-server/                # MCP 서버 (진입점) — pilot-ai와 stdio 통신
    playwright-runner/         # 웹 테스트 러너 (write-to-temp-file + child process)
    maestro-bridge/            # Flutter 테스트 트리거 + 결과 수집
    reporter/                  # Allure + Slack/Telegram 리포트
  registry/
    apps.yaml                  # 등록된 앱 목록
    selectors/                 # 앱별 UI selector 매핑
  .github/workflows/           # CI/CD
```

### MCP 서버 패키지 구조 (npm 배포용)

```
packages/mcp-server/
  src/
    index.ts               # #!/usr/bin/env node + 서버 진입점
    tools/                 # MCP 툴 핸들러
    schemas/               # Zod 스키마 (input/output 검증)
  package.json
  tsconfig.json
```

```json
// packages/mcp-server/package.json
{
  "name": "sentinel-qa",
  "type": "module",
  "bin": {
    "sentinel-qa": "./dist/index.js"
  },
  "files": ["dist"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^latest",
    "zod": "^3"
  }
}
```

> `bin` 필드로 `npx sentinel-qa` 실행 가능
> 빌드된 `dist/index.js`는 `#!/usr/bin/env node` shebang 필수

### 앱 온보딩 방식

```yaml
# registry/apps.yaml
apps:
  - id: fridgify
    type: flutter
    repo: github.com/eodin/fridgify
    prd: notion://...
    context:
      selectors: ./selectors/fridgify.yaml

  - id: arden-web
    type: web
    url: https://arden.app
    prd: notion://...
    context:
      selectors: ./selectors/arden-web.yaml
```

### 앱별 Selector 매핑

```yaml
# registry/selectors/fridgify.yaml (Maestro용)
add_ingredient_button: "재료 추가"
generate_button: "레시피 생성"
recipe_card: "레시피 생성 완료"

# registry/selectors/arden-web.yaml (Playwright용)
add_ingredient_button: "button[data-testid='addIngredient']"
generate_button: "button[data-testid='generate']"
recipe_card: ".recipe-card"
```

pilot-ai가 테스트 코드 생성 시 sentinel-qa의 `get_selectors` 툴로 조회하여 참조한다.

---

## 5. MCP 서버 설계

### 전송 방식: stdio

pilot-ai가 로컬 Mac daemon이므로 **stdio 전송**을 사용한다.
- pilot-ai가 sentinel-qa를 subprocess로 실행
- JSON-RPC 메시지를 stdin/stdout으로 교환
- 별도 네트워크/인증 불필요

> **주의**: `console.log()` 사용 금지. stdout은 JSON-RPC 스트림 전용이므로 오염 시 통신 장애 발생.
> 모든 디버그 로깅은 `console.error()` (stderr)로 출력한다.

### sentinel-qa가 노출하는 MCP 툴

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "sentinel-qa", version: "1.0.0" });

// 앱 관리
server.registerTool("list_apps", {
  description: "등록된 앱 목록 조회",
}, async () => ({
  content: [{ type: "text", text: JSON.stringify(apps) }],
}));

server.registerTool("get_selectors", {
  description: "앱의 UI selector 매핑 조회 (테스트 코드 생성 시 참조)",
  inputSchema: {
    app_id: z.string().describe("앱 ID"),
  },
}, async ({ app_id }) => ({
  content: [{ type: "text", text: JSON.stringify(selectors) }],
}));

// 테스트 관리
server.registerTool("save_tests", {
  description: "생성된 테스트케이스/코드를 저장",
  inputSchema: {
    app_id: z.string().describe("앱 ID"),
    test_cases: z.array(z.object({
      id: z.string(),
      title: z.string(),
      confidence: z.number(),
      status: z.enum(["approved", "pending"]),
      platform: z.array(z.enum(["flutter", "web"])),
      code: z.string().describe("실행 가능한 테스트 코드"),
    })),
  },
}, async ({ app_id, test_cases }) => ({
  content: [{ type: "text", text: `${test_cases.length}개 테스트 저장 완료` }],
}));

server.registerTool("run_tests", {
  description: "특정 앱 테스트 실행 (장시간 소요 가능, progress 알림 지원)",
  inputSchema: {
    app_id: z.string().describe("앱 ID"),
    suite: z.string().optional().describe("테스트 스위트 이름"),
    platform: z.enum(["web", "ios", "android"]).optional(),
  },
}, async ({ app_id, suite, platform }, { progressToken }) => {
  // progress 알림을 통해 실행 중간 상태를 pilot-ai에 전달
  // pilot-ai는 이를 Telegram으로 중계 가능
  return {
    content: [{ type: "text", text: JSON.stringify(testResult) }],
  };
}));

server.registerTool("get_report", {
  description: "최근 테스트 결과 요약 조회 (상세 로그는 resource link로 제공)",
  inputSchema: {
    app_id: z.string().describe("앱 ID"),
  },
}, async ({ app_id }) => ({
  content: [
    { type: "text", text: JSON.stringify(summary) },
    { type: "resource_link", uri: `file:///reports/${app_id}/latest.html` },
  ],
}));
```

### 장시간 작업 처리 (Progress & Cancellation)

테스트 실행은 수 분이 걸릴 수 있으므로 MCP의 공식 메커니즘을 활용한다.

**Progress Notifications:**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 3,
    "total": 10,
    "message": "Running: TC-003 재료 없이 생성 시 에러 메시지"
  }
}
```

**Cancellation:**
- pilot-ai가 `notifications/cancelled`를 보내면 테스트 runner child process를 kill
- 실행 중이던 브라우저/에뮬레이터 프로세스 정리

**대용량 응답 처리:**
- 테스트 결과 요약은 `content`에 직접 포함 (LLM이 파싱)
- 상세 로그, 스크린샷, trace 파일은 `resource_link`로 제공 (LLM 컨텍스트 폭발 방지)

### pilot-ai 설정

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

---

## 6. 테스트 코드 실행 패턴

### 웹 (Playwright): Write-to-Temp-File 패턴

pilot-ai가 생성한 Playwright 코드를 직접 `eval()` 하지 않는다.
보안과 안정성을 위해 임시 파일에 쓰고 child process로 실행한다.

```
pilot-ai가 생성한 코드
    ↓
save_tests()로 sentinel-qa에 전달
    ↓
sentinel-qa: 임시 디렉토리에 .spec.ts 파일 작성
    ↓
child_process.execSync("npx playwright test <temp-file> --reporter=json")
    ↓
JSON 결과 파싱 → 구조화된 응답 반환
```

**보안 고려사항:**
- AST 파싱으로 허용된 Playwright API만 사용하는지 검증
- 임시 파일 실행 후 cleanup
- 리소스 제한 (timeout, memory)
- 브라우저 컨텍스트 격리

### Flutter (Maestro): CLI 실행 패턴

Maestro는 YAML 기반이므로 코드 보안 검증이 상대적으로 단순하다.

```
pilot-ai가 생성한 Maestro YAML
    ↓
save_tests()로 sentinel-qa에 전달
    ↓
sentinel-qa: 임시 디렉토리에 .yaml 파일 작성
    ↓
child_process.execSync("maestro test <temp-file> --format json")
    ↓
JSON 결과 파싱 → 구조화된 응답 반환
```

---

## 7. 데이터 로그 QA

E2E 테스트 실행 중 앱이 발화하는 analytics 이벤트(Firebase Analytics, Amplitude, GA4, Mixpanel 등)를 캡처하고, 사전 정의된 스펙과 비교하여 누락·오발화·파라미터 오류를 검증한다.

### 왜 필요한가

- UI가 정상 동작해도 analytics 이벤트가 누락되면 데이터 팀이 피해를 입음
- 수동 검증은 비용이 높고 누락이 잦음
- E2E 테스트와 동시에 캡처하면 추가 실행 비용 없이 검증 가능

### 플랫폼별 캡처 방식

| 플랫폼 | 캡처 방법 | 비고 |
|--------|----------|------|
| 웹 (Playwright) | `page.route()` / `page.on('request')` 로 analytics 엔드포인트 요청 인터셉트 | GA4: `google-analytics.com/g/collect`, Amplitude: `api.amplitude.com` 등 |
| Flutter (Maestro) | 디바이스 로그 캡처 (`adb logcat` / Xcode console) 또는 HTTP 프록시 (mitmproxy) | Firebase Debug Mode 활용 가능 |

### 이벤트 스펙 정의

앱별로 `registry/event-specs/` 디렉토리에 기대 이벤트 스펙을 YAML로 정의한다.

```yaml
# registry/event-specs/fridgify.yaml
events:
  - trigger: "레시피 생성 버튼 탭"
    event_name: "generate_recipe"
    required_params:
      ingredient_count: number
      source: string
    optional_params:
      recipe_type: string

  - trigger: "레시피 결과 화면 진입"
    event_name: "view_recipe_result"
    required_params:
      recipe_id: string
      load_time_ms: number
```

### 검증 플로우

```
E2E 테스트 실행 (Playwright / Maestro)
    ↓ 동시에
네트워크 요청 / 디바이스 로그 캡처
    ↓
캡처된 이벤트 파싱 → 구조화
    ↓
event-spec YAML과 diff 비교
    ↓
결과 리포트 생성
  ├─ ✅ 모든 기대 이벤트 발화 + 파라미터 일치
  ├─ ❌ 누락 이벤트 (expected but not fired)
  ├─ ⚠️ 예상치 못한 이벤트 (fired but not in spec)
  └─ ❌ 파라미터 불일치 (wrong type, missing required param)
```

### MCP 툴 연동

`run_tests`에 `validate_events` 옵션을 추가하여 데이터 로그 QA를 활성화한다.

```typescript
server.registerTool("run_tests", {
  inputSchema: {
    app_id: z.string(),
    suite: z.string().optional(),
    platform: z.enum(["web", "ios", "android"]).optional(),
    validate_events: z.boolean().optional().describe("데이터 로그 QA 활성화 (기본: false)"),
  },
  // ...
});
```

`get_report` 응답에 데이터 로그 검증 결과를 포함한다.

```json
{
  "app_id": "fridgify",
  "ui_tests": { "passed": 8, "failed": 2 },
  "event_validation": {
    "total_expected": 12,
    "matched": 10,
    "missing": ["view_recipe_result"],
    "unexpected": ["debug_tap_event"],
    "param_errors": [
      { "event": "generate_recipe", "param": "ingredient_count", "expected": "number", "got": "string" }
    ]
  }
}
```

### 앱 레지스트리 확장

```yaml
# registry/apps.yaml
apps:
  - id: fridgify
    type: flutter
    context:
      selectors: ./selectors/fridgify.yaml
      event_spec: ./event-specs/fridgify.yaml    # 데이터 로그 QA 스펙
```

---

## 8. 테스트 신뢰성 관리 (Quarantine 시스템)

> 기존 7절에서 번호 변경

AI가 생성한 테스트는 flaky할 수 있으므로 단계적 승격 체계를 적용한다.

### 테스트 생명주기

```
신규 테스트 (new)
    ↓ 5회 연속 실행
    ├─ 5/5 통과 → stable (정규 테스트 스위트에 편입)
    ├─ 3-4/5 통과 → quarantine (격리 + 리뷰 대기)
    └─ 0-2/5 통과 → rejected (거부, pilot-ai에 재생성 요청)
```

### 상태 관리

```yaml
# tests/fridgify/status.yaml
tests:
  - id: TC-001
    status: stable        # 5/5 통과
    last_run: 2026-03-14
    pass_rate: 1.0

  - id: TC-003
    status: quarantine    # 3/5 통과, 리뷰 필요
    last_run: 2026-03-14
    pass_rate: 0.6
    failure_reason: "타이밍 이슈 — 네트워크 응답 대기 부족"
```

### MCP 툴 연동

`run_tests` 실행 시 기본적으로 `stable` 상태의 테스트만 실행한다.
`quarantine` 테스트는 별도 옵션으로 포함 가능.

---

## 9. 테스트케이스 생성 플로우 (pilot-ai 측)

> 이 섹션은 pilot-ai의 동작을 설명하며, sentinel-qa 구현 범위 밖이다.
> sentinel-qa는 생성된 결과물을 받아 저장하고 실행하는 역할만 한다.

### 2-pass 생성 파이프라인 (pilot-ai가 수행)

```
Pass 1: PRD → 테스트케이스 YAML (플랫폼 무관한 시나리오, 사람이 읽고 리뷰 가능)
Pass 2: YAML + sentinel-qa의 get_selectors() → 실행 가능한 Playwright/Maestro 코드
```

### PRD 파싱 품질 관리

생성된 테스트케이스에 confidence score를 포함하여 품질을 관리한다.

```
PRD → pilot-ai LLM 생성 → draft 테스트케이스 (YAML)
                              ↓
                      confidence score 포함
                              ↓
                ┌─ high (≥0.8): 자동 승인
                └─ low (<0.8): 사람 리뷰 대기
```

### 출력 예시 (test case YAML)

```yaml
test_cases:
  - id: TC-001
    title: "재료 1개 입력 시 레시피 반환"
    confidence: 0.92
    status: approved
    platform: [flutter]
    steps:
      - 앱 실행
      - 재료 추가 (예: 계란)
      - 레시피 생성 버튼 탭
    expected: "레시피 1개 이상 표시"

  - id: TC-002
    title: "재료 없이 생성 시 에러 메시지"
    confidence: 0.85
    status: approved
    platform: [flutter, web]
    steps:
      - 앱 실행
      - 재료 추가 없이 생성 버튼 탭
    expected: "에러 메시지 또는 가이드 문구 표시"

  - id: TC-003
    title: "네트워크 에러 시 재시도"
    confidence: 0.55
    status: pending     # 사람 리뷰 필요
    platform: [flutter, web]
    steps:
      - 앱 실행
      - 네트워크 차단 상태에서 레시피 생성
    expected: "에러 안내 및 재시도 버튼 표시"
```

---

## 10. 환경 설정 관리

sentinel-qa는 LLM API 키가 필요 없다. 필요한 설정은 테스트 실행 환경 관련뿐이다.

```
sentinel-qa/
  .env.example          # 커밋됨 — 필요한 키 목록만 기재
  .env                  # 로컬 개발용 (gitignore)
```

```bash
# .env.example
SLACK_WEBHOOK_URL=        # 리포트 알림 (선택)
TELEGRAM_BOT_TOKEN=       # 리포트 알림 (선택)
```

> `ANTHROPIC_API_KEY`, `NOTION_API_KEY` 등 LLM/외부 서비스 키는 pilot-ai 측에서 관리

---

## 11. 개발 순서 (로드맵)

| 단계 | 내용 | 산출물 |
|------|------|--------|
| 1단계 | MCP 서버 기본 구조 + 앱 레지스트리 + stdio 통신 | `mcp-server` 패키지 |
| 2단계 | Playwright 웹 테스트 러너 (write-to-temp-file 패턴) | `playwright-runner` 패키지 |
| 3단계 | pilot-ai 연동 검증 (E2E: 명령 → 테스트 → 결과) | pilot-ai 설정 |
| 4단계 | Maestro 브릿지 → Flutter 앱 연동 | `maestro-bridge` 패키지 |
| 5단계 | 데이터 로그 QA (analytics 이벤트 캡처 + 스펙 검증) | `mcp-server` + 러너 확장 |
| 6단계 | 테스트 신뢰성 관리 (quarantine 시스템) | `mcp-server` 확장 |
| 7단계 | 리포트 + Telegram 알림 | `reporter` 패키지 |
| 8단계 | GitHub Actions CI/CD 통합 | `.github/workflows/` |
| 9단계 | 오픈소스 공개 (README, CONTRIBUTING, LICENSE) | GitHub 공개 레포 |

> 1단계 완료 시 MCP 서버로 기본 통신 가능
> 3단계 완료 시 pilot-ai로 "테스트 돌려줘" → 실행 → 결과 반환 전체 플로우 동작

---

## 12. 배포 형태 요약

| 컴포넌트 | 형태 | 비고 |
|---------|------|------|
| sentinel-qa | npm 모노레포 (npm workspaces + turborepo) | MCP 서버로 동작 |
| 웹 테스트 실행 | Playwright (child process) | write-to-temp-file 패턴 |
| Flutter 테스트 실행 | Maestro CLI (child process) | YAML 기반, JSON 결과 출력 |
| CI/CD | GitHub Actions | 웹: Playwright Docker, Flutter: Maestro + Emulator |
| pilot-ai 연동 | MCP 서버 (stdio) | pilot-ai daemon에서 subprocess 호출 |
| 리포트 | Allure + S3 정적 호스팅 | 초기엔 로컬 HTML로 충분 |

---

## 13. MCP 서버 구현 시 주의사항

| 항목 | 설명 |
|------|------|
| stdout 오염 금지 | `console.log()` 사용 금지, 모든 로깅은 `console.error()` (stderr) |
| shebang 필수 | `dist/index.js` 첫 줄에 `#!/usr/bin/env node` |
| ESM 필수 | `"type": "module"` + TypeScript SDK는 deep imports 사용 |
| 입력 검증 | 모든 tool input을 Zod 스키마로 검증 (LLM 입력을 신뢰하지 않음) |
| 에러 구분 | 프로토콜 에러 (JSON-RPC) vs 비즈니스 에러 (`isError: true`) 분리 |
| 대용량 응답 | 상세 로그는 `resource_link`로 분리, 요약만 content에 포함 |
| cancellation | `notifications/cancelled` 수신 시 child process kill + cleanup |
| rate limiting | progress 알림의 과도한 전송 방지 |

---

## 14. 미결 사항 / 다음 논의 주제

- [ ] 첫 번째 검증 대상 앱 선정 (Fridgify 웹? Tempy?)
- [ ] PRD 소스 확정 (Notion API 연동 vs Markdown 파일)
- [ ] GitHub 레포 공개 시점 및 라이선스 선택 (MIT 추천)
- [ ] Maestro 테스트 실행 환경 (로컬 시뮬레이터 vs CI 에뮬레이터)
- [ ] 리포트 호스팅 방식 (S3, GitHub Pages 등)
- [ ] 데이터 로그 QA: 지원할 analytics SDK 목록 확정 (Firebase, Amplitude, GA4 등)
- [ ] 데이터 로그 QA: Flutter 이벤트 캡처 방식 확정 (adb logcat vs HTTP 프록시 vs Firebase Debug View)
