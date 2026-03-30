# sentinel-qa Agent 개발 체크리스트

> PRD: `docs/agent/sentinel-qa-agent-prd.md` (v1.1)
> 코드 리뷰: `docs/prd/code-review-report.md`
> 최종 업데이트: 2026-03-31

---

## 0단계: 프로젝트 구조 전환

### 0-1. 모노레포 해체
- [x] `packages/` 하위 소스를 `src/`로 평탄화
  - [x] `packages/playwright-runner/src/` → `src/runners/playwright/`
  - [x] `packages/maestro-bridge/src/` → `src/runners/maestro/` (Patrol 전환 전 임시 보존)
  - [x] `packages/mcp-server/src/event-validation/` → `src/event-validation/`
  - [x] `packages/mcp-server/src/store/test-status-store.ts` → `src/store/`
  - [x] `packages/mcp-server/src/report/` → `src/report/`
  - [x] `packages/mcp-server/src/registry/` → `src/registry/`
  - [x] `packages/mcp-server/src/utils/` → `src/utils/`
- [x] 루트 `package.json`에서 `workspaces` 제거
- [x] 하위 `package.json` 3개 제거, 의존성을 루트로 통합
- [x] `turbo.json` 삭제
- [x] `tsconfig.json` 단일화 (base + packages 구조 → 단일 tsconfig)
- [x] 빌드 스크립트 수정 (`tsc` 단독 빌드)
- [x] `npm run build` 정상 확인
- [x] `npm run test` 정상 확인

### 0-2. MCP 코드 제거
- [x] `packages/mcp-server/src/index.ts` 삭제 (MCP 서버 부트스트랩)
- [x] `packages/mcp-server/src/tools/` 전체 삭제 (5개 MCP 도구)
- [x] `packages/mcp-server/src/schemas/tools.ts` 삭제 (MCP 입력 스키마)
- [x] `packages/mcp-server/src/store/test-store.ts` 삭제 (인메모리 TC 저장소)
- [x] `@modelcontextprotocol/sdk` 의존성 제거
- [x] MCP 관련 테스트 삭제 (해당 모듈 테스트만)
- [x] `scripts/verify-mcp-flow.mjs` 삭제
- [x] `bin` 엔트리 및 `postbuild` shebang 스크립트 정리

### 0-3. 보안 이슈 수정 (코드 리뷰 C-01, C-02)
- [x] Playwright `validator.ts` — AST 기반 검증으로 강화
  - [x] TypeScript Compiler API로 CallExpression, ImportDeclaration 검사
  - [x] 허용 모듈 화이트리스트 (`@playwright/test` 등)
  - [x] `globalThis[...]` 동적 접근 패턴 차단
  - [x] 기존 정규식 테스트를 AST 기반으로 마이그레이션
- [x] Maestro/Patrol runner — `test.id` path traversal 방지
  - [x] `sanitizeId()` 함수 추가 (알파벳/숫자/하이픈/언더스코어만 허용)
  - [x] 결과 경로가 tempDir 내부인지 검증
  - [x] 테스트 추가

### 0-4. 재활용 모듈 품질 개선 (코드 리뷰 H-02 ~ H-05)
- [x] `yaml-loader.ts` — Zod 스키마 검증 통합
  - [x] `loadYaml<T>(path, schema)` 시그니처로 변경 (선택적 schema 파라미터)
  - [ ] 호출처 업데이트 (registry, event-spec — 스키마 정의 후 적용)
- [x] `test-status-store.ts` — `recordBatch()` 메서드 추가
  - [x] N개 결과를 1회 파일 I/O로 기록
  - [x] 기존 `recordRun()` 유지 (recordBatch 위임)
  - [x] 테스트 추가
- [x] Runner 공통 인터페이스 정의
  - [x] `UnifiedRunResult` 타입 생성 (`src/types/runner.ts`)
  - [ ] Playwright, Maestro/Patrol 양쪽에서 구현 (러너 통합 시 적용)
- [ ] Event capture — "not yet implemented" 경고 반환 (러너 통합 시 구현)

### 0-5. 문서 및 설정 업데이트
- [x] `CLAUDE.md` 업데이트
  - [x] "No LLM calls" 제약 제거
  - [x] 단일 패키지 구조 반영
  - [x] 새 빌드/테스트 커맨드 반영
  - [x] 워크플로우 6단계로 업데이트 (개발→빌드→코드리뷰→테스트→체크리스트→커밋)
- [x] 기존 `docs/sentinel-ai-planning.md`, `docs/sentinel-ai-checklist.md` 아카이브 표시

---

## 1단계: CLI 트리거 + Analyzer

### 1-1. 새 진입점 (`src/index.ts`)
- [x] 에이전트 메인 엔트리포인트 생성
- [x] CLI 파서 구현 (인자: `--app`, `--pr`, `--base-branch`, `--diff`, `--validate-events`, `--prd`)
- [x] `AgentConfig` 인터페이스 정의
- [x] `npx sentinel-qa run` 으로 실행 가능하도록 `bin` 등록
- [x] `--help` 출력

### 1-2. Analyzer (`src/agent/analyzer.ts`)
- [x] `AnalysisContext` 인터페이스 정의
- [x] `git diff <baseBranch>...HEAD` 실행 → diff 문자열 수집
- [x] PRD 파일 로드 (Markdown 읽기)
- [x] AppRegistry에서 앱 정보 조회
- [x] 셀렉터 로드
- [x] 이벤트 스펙 로드 (선택)
- [x] 기존 테스트 상태 로드 (quarantine 정보)
- [x] 테스트 작성

### 1-3. 설정 파일 (`sentinel-qa.config.yaml`)
- [x] 설정 스키마 Zod 정의 (anthropic, slack, github, test, cost 섹션)
- [x] 설정 로더 구현 (파일 + 환경 변수 오버라이드)
- [x] 기본값 처리
- [x] `confidence_threshold` 설정 포함
- [x] `cost.track_tokens`, `cost.max_tokens_per_run` 설정 포함

---

## 2단계: Planner (Claude API)

### 2-1. LLM 인터페이스 (`src/agent/llm-client.ts`)
- [ ] `LLMClient` 인터페이스 정의 (`generateTests`, `critiqueTests`)
- [ ] `ClaudeLLMClient` 구현
- [ ] `@anthropic-ai/sdk` 설치 및 클라이언트 초기화
- [ ] 토큰 사용량 로깅 (input/output tokens per call)
- [ ] `max_tokens_per_run` 초과 시 중단 로직

### 2-2. Planner (`src/agent/planner.ts`)
- [ ] `PlannedTest` 인터페이스 정의
- [ ] 시스템 프롬프트 작성
  - [ ] 역할 정의 (시니어 QA 엔지니어)
  - [ ] 코드 생성 규칙 (셀렉터 사용, 독립 테스트, 보안 제약)
  - [ ] **smart wait 규칙** (`waitForSelector` 필수, `waitForTimeout` 금지)
  - [ ] **retry-friendly 패턴** (`expect().toBeVisible()` 등 auto-retry assertion 우선)
  - [ ] 출력 형식 (JSON 배열)
  - [ ] **few-shot 예제** (Playwright 올바른 테스트 2-3개)
- [ ] 유저 프롬프트 조립 (PRD + diff + selectors + event specs)
- [ ] **기존 stable 테스트 목록 포함** → 중복 생성 방지
- [ ] Claude API 호출 → JSON 응답 파싱
- [ ] 응답 Zod 검증 (`PlannedTest[]`)
- [ ] **Self-critique 단계** — 생성 코드를 Claude가 재검토 (셀렉터 오용, 누락 assertion, 보안 위반)
- [ ] 에러 핸들링 (API 실패, 파싱 실패, 빈 응답)
- [ ] 테스트 작성 (모킹된 API 응답)

### 2-3. 프롬프트 템플릿
- [ ] Playwright 코드 생성용 프롬프트 + few-shot 예제
- [ ] Patrol 코드 생성용 프롬프트 + few-shot 예제
- [ ] diff 기반 TC vs PRD 기반 TC 구분 로직

---

## 3단계: Playwright 러너 통합

### 3-1. 러너 통합 (`src/runners/playwright.ts`)
- [ ] 기존 `packages/playwright-runner` 코어 로직 이동
- [ ] `UnifiedRunResult` 인터페이스 구현
- [ ] AST 기반 validator 적용 (0-3에서 구현한 것)
- [ ] 이벤트 캡처 통합 (`page.route()` 인터셉트)
  - [ ] `capture-patterns.ts`의 URL 매칭 연동
  - [ ] `CapturedEvent[]` 수집 로직
- [ ] AbortSignal 기반 취소 유지
- [ ] 기존 테스트 마이그레이션 + 추가

### 3-2. 첫 웹 앱 E2E 검증
- [ ] 검증 대상 앱 선정 (arden-web 권장 — 웹이므로 Playwright 즉시 사용 가능)
- [ ] 실제 PR diff로 TC 생성 → Playwright 실행 → 결과 확인
- [ ] 생성된 테스트 코드 품질 검토
- [ ] smart wait / retry-friendly 패턴 적용 여부 확인

---

## 4단계: Reporter

### 4-1. 리포트 생성 (`src/agent/reporter.ts`)
- [ ] 기존 `report/markdown.ts` 연동
- [ ] `AgentResult` → Markdown 리포트 변환
- [ ] **confidence score** 포함 (테스트별 신뢰도)
- [ ] **API 토큰 사용량** 리포트에 포함
- [ ] `reports/<appId>/<timestamp>/` 파일 저장 유지
- [ ] JSON 결과 저장 유지

### 4-2. PR 코멘트
- [ ] `@octokit/rest` 설치
- [ ] GitHub API 인증 (GITHUB_TOKEN)
- [ ] PR 코멘트 생성/업데이트 로직
  - [ ] **`[AI-Generated]` 라벨** 포함
  - [ ] 전체 통과 + 고신뢰(≥ 0.7): ✅ 머지 가능
  - [ ] 전체 통과 + 저신뢰(< 0.7): ⚠️ warning으로 표시 (블록하지 않음)
  - [ ] 실패: 실패 테스트 상세 + 이벤트 검증 결과
- [ ] 이전 sentinel-qa 코멘트가 있으면 업데이트 (중복 방지)

---

## 5단계: GitHub Actions 워크플로우

### 5-1. 워크플로우 파일 (`sentinel-qa.yml`)
- [ ] PR 이벤트 트리거 (opened, synchronize)
- [ ] Node.js 20 설정
- [ ] `fetch-depth: 0` (full history)
- [ ] 환경 변수 주입 (ANTHROPIC_API_KEY, SLACK_WEBHOOK_URL, GITHUB_TOKEN)
- [ ] `npx sentinel-qa run` 실행
- [ ] 실패 시 exit code 처리

### 5-2. GitHub Actions 트리거 (`src/triggers/github-action.ts`)
- [ ] 환경 변수에서 `AgentConfig` 조립
- [ ] `GITHUB_EVENT_PATH`에서 PR 정보 파싱
- [ ] agent 메인 루프 호출
- [ ] exit code 반환 (0: 통과, 1: 실패)

---

## 6단계: Slack 버그 리포트 + pilot-ai 루프

### 6-1. Slack 연동
- [ ] `@slack/webhook` 설치
- [ ] `BugReport` → Slack Block Kit 메시지 변환
- [ ] Webhook URL 설정 (환경 변수)
- [ ] 전송 실패 시 fallback (로그 출력)
- [ ] 테스트 (모킹된 webhook)

### 6-2. 재시도 루프
- [ ] `agent/index.ts`에 재시도 로직 추가
- [ ] 최대 재시도 횟수 설정 (`maxRetries`, default: 3)
- [ ] 재커밋 감지 (GitHub Actions `synchronize` 이벤트)
- [ ] 3회 초과 시 "수동 개입 필요" Slack 알림
- [ ] 재시도 카운트를 리포트에 포함

---

## 7단계: Patrol 러너 (Flutter)

### 7-1. Patrol 코드 생성 품질 검증 (조기 검증)
- [ ] Claude API로 Patrol Dart 코드 생성 테스트 (Maestro YAML보다 난이도 높음)
- [ ] 생성 품질 미달 시 Maestro YAML 병행 전략 수립

### 7-2. Patrol 러너 구현 (`src/runners/patrol.ts`)
- [ ] Patrol CLI 연동 (`patrol test`)
- [ ] Dart 테스트 코드를 임시 파일에 기록
- [ ] 결과 파싱
- [ ] `UnifiedRunResult` 구현
- [ ] 기존 Maestro bridge 코드 참고 후 삭제

### 7-3. Flutter 환경 검증
- [ ] GitHub Actions macOS runner에서 Flutter SDK 설치
- [ ] iOS 시뮬레이터 실행 확인
- [ ] Patrol 테스트 실행 확인
- [ ] 검증 대상 앱으로 E2E 테스트

---

## 8단계: 오픈소스 공개

### 8-1. 문서
- [ ] README.md 전면 재작성 (에이전트 소개, Quick Start, 설정법)
- [ ] CONTRIBUTING.md 작성
- [ ] LICENSE 확인 (MIT)

### 8-2. 패키지
- [ ] `package.json` 정리 (keywords, description, repository)
- [ ] npm 배포 테스트 (`npm pack` → 검토)
- [ ] `npx sentinel-qa run --help` 동작 확인
- [ ] GitHub 레포 public 전환

---

## 횡단 관심사 (전 단계 공통)

### 테스트
- [ ] 각 단계 완료 시 `npm run test` 통과 확인
- [ ] 새 모듈마다 유닛 테스트 작성
- [ ] CI에서 테스트 자동 실행

### 타입 안전성
- [ ] `any` 타입 사용 금지
- [ ] 외부 입력(YAML, API 응답, env vars)은 Zod로 검증
- [ ] 공통 타입은 `src/types/` 에 집중

### 로깅
- [ ] 구조화된 로깅 적용 (JSON 포맷, level + timestamp)
- [ ] 민감 정보 (API 키 등) 로그 출력 금지

### 보안
- [ ] 생성된 테스트 코드는 반드시 AST validator 통과 후 실행
- [ ] 파일 경로에 사용자 입력 포함 시 sanitize
- [ ] 환경 변수로 시크릿 관리 (하드코딩 금지)
- [ ] 네트워크 이그레스 — 테스트 실행 중 대상 앱 URL + analytics 엔드포인트만 허용 고려

### 비용 관리
- [ ] Claude API 토큰 사용량 매 호출 로깅
- [ ] 런당 누적 토큰 추적 → `max_tokens_per_run` 초과 시 중단
- [ ] 리포트에 총 토큰 사용량 표시
