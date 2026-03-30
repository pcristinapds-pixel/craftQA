# [ARCHIVED] sentinel-qa 개발 체크리스트

> **⚠️ 이 문서는 아카이브되었습니다.** MCP 서버 기반 체크리스트는 에이전트 아키텍처로 대체되었습니다.
> 최신 체크리스트: `docs/agent/sentinel-qa-checklist.md`

> 기준 문서: `docs/sentinel-qa-planning.md`
> 생성일: 2026-03-14

---

## 1단계: MCP 서버 기본 구조 + 앱 레지스트리

### 프로젝트 초기화
- [x] Git 레포 초기화 + `.gitignore` 설정
- [x] root `package.json` 생성 (`private: true`, `type: module`, `workspaces`)
- [x] `turbo.json` 생성 (build/test/lint 파이프라인)
- [x] TypeScript 공통 설정 (`tsconfig.base.json`)
- [x] Prettier 설정 (ESLint는 후속 추가)
- [x] `.env.example` 생성
- [x] `.env`를 `.gitignore`에 추가

### mcp-server 패키지
- [x] `packages/mcp-server/package.json` 생성 (`bin`, `type: module`, `files`)
- [x] `packages/mcp-server/tsconfig.json` 생성
- [x] `@modelcontextprotocol/sdk`, `zod` 의존성 설치
- [x] `src/index.ts` 진입점 생성 (`#!/usr/bin/env node` shebang)
- [x] `StdioServerTransport` 연결 구현
- [x] 로깅 유틸리티 구현 (`console.error` 전용, stdout 오염 방지)

### MCP 툴 구현
- [x] `list_apps` — apps.yaml 읽어서 앱 목록 반환
- [x] `get_selectors` — 앱별 selector 매핑 반환
- [x] `save_tests` — 테스트케이스/코드 저장 (Zod 스키마 검증)
- [x] `run_tests` — 테스트 실행 (스텁, 실제 러너 연동은 2단계)
- [x] `get_report` — 테스트 결과 요약 반환 (스텁)

### 앱 레지스트리
- [x] `registry/apps.yaml` 생성 (첫 앱 등록)
- [x] `registry/selectors/` 디렉토리 + 샘플 selector 파일
- [x] YAML 파싱 유틸리티 구현

### 빌드 & 검증
- [x] `npm run build` 로 빌드 확인
- [x] 빌드 결과물에 shebang 포함 확인 (`chmod 755`)
- [x] 수동 JSON-RPC로 initialize + tools/list + tools/call 검증 완료
- [ ] MCP Inspector로 대화형 검증 (선택)

---

## 2단계: Playwright 웹 테스트 러너

### playwright-runner 패키지
- [x] `packages/playwright-runner/package.json` 생성
- [x] `@playwright/test` 의존성 설치
- [x] `playwright.config.ts` 기본 설정 (headless, timeout, reporter=json)

### Write-to-Temp-File 실행 패턴
- [x] 임시 디렉토리 생성 유틸리티
- [x] 테스트 코드 → `.spec.ts` 임시 파일 작성
- [x] `child_process.spawn("npx playwright test ...")` 실행
- [x] JSON reporter 결과 파싱
- [x] 임시 파일/디렉토리 cleanup

### 보안
- [x] 코드 검증 모듈 구현 (위험 API 차단: eval, fs, child_process 등)
- [x] 실행 timeout 설정
- [x] 브라우저 컨텍스트 격리 확인

### mcp-server 연동
- [x] `run_tests` 툴에서 `playwright-runner` 호출 연결
- [x] progress notifications 구현 (테스트 진행률)
- [x] cancellation 구현 (child process kill + AbortSignal)
- [x] 실패 시 스크린샷 경로를 응답에 포함

### 테스트
- [x] 샘플 웹앱으로 Playwright 테스트 실행 E2E 검증 (example.com 대상, 5개 케이스)
- [x] JSON 결과 파싱 단위 테스트 (8개 케이스 통과)
- [x] 코드 검증 단위 테스트 (18개 케이스 통과)

---

## 3단계: pilot-ai 연동 검증

### pilot-ai 설정
- [x] pilot-ai `mcpServers` 설정에 sentinel-qa 추가 (`~/.pilot/mcp-config.json`)
- [x] pilot-ai MCP registry에 sentinel-qa 엔트리 추가
- [x] sentinel-qa MCP 서버 initialize 응답 확인

### E2E 플로우 검증
- [x] MCP E2E 검증 스크립트 작성 (`scripts/verify-mcp-flow.mjs`)
- [x] initialize → list_apps → get_selectors → save_tests → run_tests → get_report 전체 플로우 6/6 통과
- [ ] pilot-ai에서 실제 자연어 명령 → 전체 플로우 동작 확인 (pilot-ai 측 테스트 코드 생성 로직 구현 후)
- [ ] Telegram/Slack에서 자연어 명령 → 전체 플로우 동작 확인

### progress 확인
- [ ] `run_tests` 실행 중 progress 알림이 pilot-ai에 전달되는지 확인
- [ ] pilot-ai가 progress를 Telegram으로 중계하는지 확인

### 연동 문서
- [x] pilot-ai 팀 연동 가이드 작성 (`docs/pilot-ai-integration-guide.md`)
- [x] sentinel-qa 업데이트 시 pilot-ai 대응 가이드 포함

---

## 4단계: Maestro 브릿지 (Flutter 앱)

### maestro-bridge 패키지
- [x] `packages/maestro-bridge/package.json` 생성
- [x] Flutter SDK 설치 (3.41.4)
- [x] Maestro CLI 다운로드 (Java 설치 필요 — `brew install --cask temurin`)

### YAML 실행 패턴
- [x] Maestro YAML → 임시 파일 작성
- [x] `child_process.spawn("maestro test ... --format json")` 실행
- [x] JSON 결과 파싱 (`parseMaestroResult()`)
- [x] 임시 파일 cleanup
- [x] AbortSignal 기반 cancellation 지원

### mcp-server 연동
- [x] `run_tests` 툴에서 platform 분기 (web → playwright, flutter → maestro)
- [x] progress notifications 구현
- [x] cancellation 구현
- [x] Maestro 실행 후 recordRun + 리포트 저장

### CI/CD 환경
- [ ] GitHub Actions에서 Android 에뮬레이터 + Maestro 실행 테스트
- [ ] GitHub Actions에서 iOS 시뮬레이터 + Maestro 실행 테스트 (macos runner)

### 테스트
- [x] Maestro JSON 결과 파서 단위 테스트 (9개 케이스 통과)
- [ ] 샘플 Flutter 앱으로 Maestro YAML 실행 E2E 검증 (Java 설치 후)
- [ ] pilot-ai → Maestro YAML 생성 → sentinel-qa 실행 → 결과 반환

---

## 5단계: 데이터 로그 QA (Analytics 이벤트 검증)

### 이벤트 스펙 관리
- [x] `registry/event-specs/` 디렉토리 생성
- [x] 이벤트 스펙 YAML 포맷 정의 (`event_name`, `required_params`, `optional_params`)
- [x] 샘플 이벤트 스펙 작성 (`registry/event-specs/fridgify.yaml`, `arden-web.yaml`)
- [x] `apps.yaml`에 `event_spec` 필드 추가
- [x] `AppRegistry`에서 이벤트 스펙 로딩 구현 (`getEventSpec()`)

### 웹 이벤트 캡처 (Playwright)
- [x] 지원 SDK별 URL 패턴 매핑 (GA4, Firebase, Amplitude, Mixpanel)
- [x] 캡처된 요청에서 이벤트 이름 + 파라미터 파싱 (SDK별 파서)
- [x] `matchAnalyticsUrl()` — URL이 analytics 엔드포인트인지 판별
- [ ] `page.on('request')` / `page.route()` 로 실시간 인터셉트 (Playwright runner 통합)

### Flutter 이벤트 캡처 (Maestro)
- [ ] 캡처 방식 확정 (`adb logcat` / HTTP 프록시 / Firebase Debug Mode)
- [ ] 디바이스 로그에서 analytics 이벤트 파싱
- [ ] 캡처 결과 → 구조화된 이벤트 배열로 변환

### 스펙 대비 검증 로직
- [x] 캡처 이벤트 vs 스펙 diff 비교 엔진 구현 (`event-validation/validator.ts`)
- [x] 누락 이벤트 (expected but not fired) 감지
- [x] 예상치 못한 이벤트 (fired but not in spec) 감지
- [x] 파라미터 불일치 감지 (타입 오류, 필수 파라미터 누락)
- [x] Zod 스키마로 이벤트 스펙 입력 검증 (`eventSpecConfigSchema`)

### mcp-server 연동
- [x] `run_tests` 스키마에 `validate_events: boolean` 옵션 추가
- [x] `get_report` 응답에 `event_validation` 결과 포함 (Markdown 리포트에 섹션 추가)
- [x] 이벤트 검증 결과 포맷 정의 (`matched`, `missing`, `unexpected`, `param_errors`)

### 테스트
- [x] 이벤트 검증 엔진 단위 테스트 (11개 케이스 통과)
- [x] analytics URL 패턴 매칭 + SDK별 파서 단위 테스트 (10개 케이스 통과)
- [x] Zod 이벤트 스펙 스키마 검증 테스트 (7개 케이스 통과)
- [ ] 샘플 웹앱에서 analytics 이벤트 캡처 + 검증 E2E 테스트

---

## 6단계: 테스트 신뢰성 관리 (Quarantine)

### 상태 관리
- [x] `TestStatusStore` 구현 (`tests/<app_id>/status.yaml` YAML 기반)
- [x] 테스트 상태 CRUD (new → stable / quarantine / rejected)
- [x] pass_rate 계산 로직 (최근 5회 실행 기준)

### 승격/강등 로직
- [x] 5회 실행 후 자동 판정
- [x] 5/5 통과 → stable 자동 승격
- [x] 3-4/5 통과 → quarantine + failure_reason 기록
- [x] 0-2/5 통과 → rejected 처리

### run_tests 연동
- [x] 기본 실행: stable + new 테스트만 포함, rejected 제외
- [x] `include_quarantine` 옵션 추가
- [x] 테스트 실행 후 `recordRun()` 자동 호출

### 테스트
- [x] TestStatusStore 단위 테스트 (17개 케이스 통과)

---

## 7단계: 리포트 + Telegram 알림

### Markdown 리포트 (기본)
- [x] Markdown 리포트 생성 모듈 구현 (`report/markdown.ts`)
- [x] `reports/<app_id>/<timestamp>/report.md` 경로 구조
- [x] JSON 원본 결과 동시 저장 (`result.json`)
- [x] ReportStore — 리포트 저장/조회 모듈 (`report/report-store.ts`)
- [x] `run_tests` 실행 후 자동 리포트 저장
- [x] `get_report`에서 최신 Markdown 리포트 반환
- [x] 리포트 생성 단위 테스트 (6개 케이스 통과)

### Allure / HTML 리포트 (후속)
- [ ] Allure 리포트 생성 연동 (선택)
- [ ] HTML 리포트 생성 (선택)

### 알림 연동
- [ ] Slack Webhook 알림 구현 (선택)
- [ ] Telegram Bot 알림 구현 (선택)
- [ ] 알림 포맷 정의 (통과/실패 요약, 링크)

---

## 8단계: GitHub Actions CI/CD 통합

### CI 파이프라인 (`ci.yml`)
- [x] 빌드 + 테스트 워크플로우 (Node 20/22 매트릭스)
- [x] `npx playwright install chromium --with-deps`
- [x] 테스트 결과 artifact 업로드

### Playwright 전용 (`playwright.yml`)
- [x] paths 필터로 변경 시에만 실행
- [x] Playwright 리포트 artifact (30일 보관)
- [x] 실패 시 스크린샷/trace 업로드

### 릴리스 (`release.yml`)
- [x] workflow_dispatch로 수동 트리거
- [x] 버전 bump + npm publish + GitHub Release

### Maestro CI (후속)
- [ ] Android 에뮬레이터 + Maestro 워크플로우
- [ ] iOS 시뮬레이터 + Maestro 워크플로우 (macos runner)

---

## 9단계: 오픈소스 공개

### 문서
- [x] README.md (프로젝트 소개, 아키텍처, 퀵스타트, MCP 도구 스펙)
- [x] CONTRIBUTING.md (기여 가이드)
- [x] LICENSE (MIT)
- [x] CHANGELOG.md

### 코드 정리
- [ ] Eodin 브랜드 종속 코드 제거
- [ ] 하드코딩된 내부 URL/경로 제거
- [ ] 민감 정보 유출 점검 (API 키, 내부 도메인 등)

### npm 배포
- [ ] `npm publish` 테스트 (dry-run)
- [ ] `npx sentinel-qa` 설치 → 실행 E2E 검증
- [ ] GitHub Releases 태깅

### 커뮤니티
- [x] GitHub Issues 템플릿 (bug report, feature request)
- [ ] GitHub Discussions 활성화 (선택)

---

## 미결 사항 (결정 필요)

- [ ] 첫 번째 검증 대상 앱 선정 (Fridgify 웹? Tempy?)
- [ ] PRD 소스 확정 (Notion API 연동 vs Markdown 파일)
- [ ] GitHub 레포 공개 시점 및 라이선스 확정
- [ ] Maestro 테스트 실행 환경 (로컬 시뮬레이터 vs CI 에뮬레이터)
- [ ] 리포트 호스팅 방식 (S3, GitHub Pages 등)
- [ ] 데이터 로그 QA: 지원할 analytics SDK 목록 확정 (Firebase, Amplitude, GA4 등)
- [ ] 데이터 로그 QA: Flutter 이벤트 캡처 방식 확정 (adb logcat vs HTTP 프록시 vs Firebase Debug View)
