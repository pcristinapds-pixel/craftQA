# [ARQUIVADO] Checklist de Desenvolvimento do sentinel-qa

> **⚠️ Este documento foi arquivado.** O checklist baseado no servidor MCP foi substituído pela arquitetura de agente.
> Checklist atual: `docs/agent/sentinel-qa-checklist.md`

> Documento de referência: `docs/sentinel-qa-planning.md`
> Criado em: 2026-03-14

---

## Etapa 1: Estrutura Básica do Servidor MCP + Registry de Apps

### Inicialização do projeto
- [x] Inicializar o repositório Git + configurar `.gitignore`
- [x] Criar o `package.json` raiz (`private: true`, `type: module`, `workspaces`)
- [x] Criar o `turbo.json` (pipeline de build/test/lint)
- [x] Configuração comum do TypeScript (`tsconfig.base.json`)
- [x] Configurar o Prettier (ESLint fica para depois)
- [x] Criar o `.env.example`
- [x] Adicionar `.env` ao `.gitignore`

### Pacote mcp-server
- [x] Criar `packages/mcp-server/package.json` (`bin`, `type: module`, `files`)
- [x] Criar `packages/mcp-server/tsconfig.json`
- [x] Instalar as dependências `@modelcontextprotocol/sdk`, `zod`
- [x] Criar o ponto de entrada `src/index.ts` (shebang `#!/usr/bin/env node`)
- [x] Implementar a conexão via `StdioServerTransport`
- [x] Implementar o utilitário de logging (só `console.error`, para não poluir o stdout)

### Implementação das tools do MCP
- [x] `list_apps` — lê o apps.yaml e retorna a lista de apps
- [x] `get_selectors` — retorna o mapa de seletores por app
- [x] `save_tests` — salva caso de teste/código (com validação de schema Zod)
- [x] `run_tests` — executa os testes (stub; a integração real com o runner fica pra Etapa 2)
- [x] `get_report` — retorna o resumo do resultado dos testes (stub)

### Registry de apps
- [x] Criar o `registry/apps.yaml` (registro do primeiro app)
- [x] Criar o diretório `registry/selectors/` + arquivo de exemplo de seletor
- [x] Implementar o utilitário de parsing de YAML

### Build & Validação
- [x] Confirmar o build com `npm run build`
- [x] Confirmar que o shebang está incluído no resultado do build (`chmod 755`)
- [x] Validar manualmente via JSON-RPC — initialize + tools/list + tools/call, tudo funcionando
- [ ] Validação interativa com o MCP Inspector (opcional)

---

## Etapa 2: Runner Web de Testes Playwright

### Pacote playwright-runner
- [x] Criar `packages/playwright-runner/package.json`
- [x] Instalar a dependência `@playwright/test`
- [x] Configuração básica do `playwright.config.ts` (headless, timeout, reporter=json)

### Padrão de Execução Write-to-Temp-File
- [x] Utilitário de criação de diretório temporário
- [x] Escrever o código de teste em arquivo temporário `.spec.ts`
- [x] Executar via `child_process.spawn("npx playwright test ...")`
- [x] Parsing do resultado do JSON reporter
- [x] Limpeza dos arquivos/diretórios temporários

### Segurança
- [x] Implementar o módulo de validação de código (bloqueia APIs perigosas: eval, fs, child_process etc.)
- [x] Configurar timeout de execução
- [x] Confirmar o isolamento do contexto do navegador

### Integração com o mcp-server
- [x] Conectar a chamada do `playwright-runner` na tool `run_tests`
- [x] Implementar as notificações de progress (progresso do teste)
- [x] Implementar cancelamento (kill do child process + AbortSignal)
- [x] Incluir o caminho do screenshot na resposta em caso de falha

### Testes
- [x] Validação E2E rodando Playwright em um app web de exemplo (contra example.com, 5 casos)
- [x] Teste unitário do parsing do resultado JSON (8 casos passando)
- [x] Teste unitário da validação de código (18 casos passando)

---

## Etapa 3: Validação da Integração com o pilot-ai

### Configuração do pilot-ai
- [x] Adicionar o sentinel-qa na configuração `mcpServers` do pilot-ai (`~/.pilot/mcp-config.json`)
- [x] Adicionar a entrada do sentinel-qa no registry do MCP do pilot-ai
- [x] Confirmar a resposta de initialize do servidor MCP do sentinel-qa

### Validação do fluxo E2E
- [x] Escrever o script de validação E2E do MCP (`scripts/verify-mcp-flow.mjs`)
- [x] Fluxo completo initialize → list_apps → get_selectors → save_tests → run_tests → get_report — 6/6 passando
- [ ] Confirmar o funcionamento do fluxo completo a partir de um comando em linguagem natural real no pilot-ai (depois da lógica de geração de código de teste do lado do pilot-ai estar implementada)
- [ ] Confirmar o funcionamento do fluxo completo a partir de um comando em linguagem natural no Telegram/Slack

### Confirmação de progress
- [ ] Confirmar se as notificações de progress durante `run_tests` chegam ao pilot-ai
- [ ] Confirmar se o pilot-ai retransmite o progress para o Telegram

### Documentação de integração
- [x] Escrever o guia de integração para a equipe do pilot-ai (`docs/pilot-ai-integration-guide.md`)
- [x] Incluir o guia de resposta do pilot-ai para quando o sentinel-qa for atualizado

---

## Etapa 4: Bridge do Maestro (apps Flutter)

### Pacote maestro-bridge
- [x] Criar `packages/maestro-bridge/package.json`
- [x] Instalar o Flutter SDK (3.41.4)
- [x] Baixar a CLI do Maestro (precisa do Java instalado — `brew install --cask temurin`)

### Padrão de Execução via YAML
- [x] Escrever o YAML do Maestro em arquivo temporário
- [x] Executar via `child_process.spawn("maestro test ... --format json")`
- [x] Parsing do resultado JSON (`parseMaestroResult()`)
- [x] Limpeza dos arquivos temporários
- [x] Suporte a cancelamento via AbortSignal

### Integração com o mcp-server
- [x] Fazer o roteamento por plataforma na tool `run_tests` (web → playwright, flutter → maestro)
- [x] Implementar as notificações de progress
- [x] Implementar cancelamento
- [x] Registrar (`recordRun`) e salvar o relatório após a execução do Maestro

### Ambiente de CI/CD
- [ ] Testar a execução com emulador Android + Maestro no GitHub Actions
- [ ] Testar a execução com simulador iOS + Maestro no GitHub Actions (runner macos)

### Testes
- [x] Teste unitário do parser de resultado JSON do Maestro (9 casos passando)
- [ ] Validação E2E rodando um YAML do Maestro em um app Flutter de exemplo (após instalar o Java)
- [ ] Fluxo completo: pilot-ai → gera YAML do Maestro → sentinel-qa executa → retorna o resultado

---

## Etapa 5: Data Log QA (Validação de Eventos de Analytics)

### Gerenciamento da spec de eventos
- [x] Criar o diretório `registry/event-specs/`
- [x] Definir o formato YAML da spec de eventos (`event_name`, `required_params`, `optional_params`)
- [x] Escrever specs de eventos de exemplo (`registry/event-specs/fridgify.yaml`, `arden-web.yaml`)
- [x] Adicionar o campo `event_spec` ao `apps.yaml`
- [x] Implementar o carregamento da spec de eventos no `AppRegistry` (`getEventSpec()`)

### Captura de eventos web (Playwright)
- [x] Mapeamento de padrões de URL por SDK suportado (GA4, Firebase, Amplitude, Mixpanel)
- [x] Parsing do nome do evento + parâmetros a partir das requisições capturadas (parser por SDK)
- [x] `matchAnalyticsUrl()` — determina se a URL é um endpoint de analytics
- [ ] Interceptação em tempo real via `page.on('request')` / `page.route()` (integração com o Playwright runner)

### Captura de eventos Flutter (Maestro)
- [ ] Definir o método de captura (`adb logcat` / proxy HTTP / Firebase Debug Mode)
- [ ] Parsing de eventos de analytics a partir do log do dispositivo
- [ ] Converter o resultado da captura em array de eventos estruturado

### Lógica de validação contra a spec
- [x] Implementar o motor de comparação (diff) entre eventos capturados e a spec (`event-validation/validator.ts`)
- [x] Detectar eventos ausentes (esperados mas não disparados)
- [x] Detectar eventos inesperados (disparados mas fora da spec)
- [x] Detectar divergência de parâmetro (erro de tipo, parâmetro obrigatório ausente)
- [x] Validar o input da spec de eventos com schema Zod (`eventSpecConfigSchema`)

### Integração com o mcp-server
- [x] Adicionar a opção `validate_events: boolean` ao schema de `run_tests`
- [x] Incluir o resultado de `event_validation` na resposta de `get_report` (seção adicionada ao relatório Markdown)
- [x] Definir o formato do resultado da validação de eventos (`matched`, `missing`, `unexpected`, `param_errors`)

### Testes
- [x] Teste unitário do motor de validação de eventos (11 casos passando)
- [x] Teste unitário do matching de padrão de URL de analytics + parser por SDK (10 casos passando)
- [x] Teste de validação do schema Zod da spec de eventos (7 casos passando)
- [ ] Teste E2E de captura + validação de eventos de analytics em um app web de exemplo

---

## Etapa 6: Gerenciamento de Confiabilidade dos Testes (Quarantine)

### Gerenciamento de estado
- [x] Implementar o `TestStatusStore` (baseado em YAML, `tests/<app_id>/status.yaml`)
- [x] CRUD do status do teste (new → stable / quarantine / rejected)
- [x] Lógica de cálculo do pass_rate (baseado nas últimas 5 execuções)

### Lógica de promoção/rebaixamento
- [x] Decisão automática após 5 execuções
- [x] 5/5 passou → promove automaticamente para stable
- [x] 3-4/5 passou → quarantine + registra failure_reason
- [x] 0-2/5 passou → marca como rejected

### Integração com run_tests
- [x] Execução padrão: inclui só testes stable + new, exclui rejected
- [x] Adiciona a opção `include_quarantine`
- [x] Chama `recordRun()` automaticamente após a execução do teste

### Testes
- [x] Teste unitário do TestStatusStore (17 casos passando)

---

## Etapa 7: Relatório + Notificação no Telegram

### Relatório em Markdown (básico)
- [x] Implementar o módulo de geração de relatório Markdown (`report/markdown.ts`)
- [x] Estrutura de caminho `reports/<app_id>/<timestamp>/report.md`
- [x] Salvar também o resultado bruto em JSON (`result.json`)
- [x] ReportStore — módulo de salvamento/consulta de relatório (`report/report-store.ts`)
- [x] Salvamento automático do relatório após a execução de `run_tests`
- [x] `get_report` retorna o relatório Markdown mais recente
- [x] Teste unitário da geração de relatório (6 casos passando)

### Relatório Allure / HTML (próxima fase)
- [ ] Integração com geração de relatório Allure (opcional)
- [ ] Geração de relatório HTML (opcional)

### Integração de notificações
- [ ] Implementar notificação via Slack Webhook (opcional)
- [ ] Implementar notificação via Telegram Bot (opcional)
- [ ] Definir o formato da notificação (resumo de aprovação/falha, links)

---

## Etapa 8: Integração de CI/CD com GitHub Actions

### Pipeline de CI (`ci.yml`)
- [x] Workflow de build + teste (matriz Node 20/22)
- [x] `npx playwright install chromium --with-deps`
- [x] Upload do artifact com o resultado dos testes

### Workflow específico do Playwright (`playwright.yml`)
- [x] Executa só quando há mudança nos paths filtrados
- [x] Artifact do relatório do Playwright (retenção de 30 dias)
- [x] Upload de screenshot/trace em caso de falha

### Release (`release.yml`)
- [x] Trigger manual via workflow_dispatch
- [x] Bump de versão + npm publish + GitHub Release

### CI do Maestro (próxima fase)
- [ ] Workflow com emulador Android + Maestro
- [ ] Workflow com simulador iOS + Maestro (runner macos)

---

## Etapa 9: Abertura como Open Source

### Documentação
- [x] README.md (apresentação do projeto, arquitetura, quick start, spec das tools do MCP)
- [x] CONTRIBUTING.md (guia de contribuição)
- [x] LICENSE (MIT)
- [x] CHANGELOG.md

### Limpeza de código
- [ ] Remover código dependente da marca Eodin
- [ ] Remover URLs/caminhos internos hardcoded
- [ ] Verificar vazamento de informação sensível (chaves de API, domínios internos etc.)

### Publicação no npm
- [ ] Testar `npm publish` (dry-run)
- [ ] Validação E2E: instalar via `npx sentinel-qa` → executar
- [ ] Criar as tags no GitHub Releases

### Comunidade
- [x] Templates de GitHub Issues (bug report, feature request)
- [ ] Ativar o GitHub Discussions (opcional)

---

## Pontos em Aberto (decisão necessária)

- [ ] Escolher o primeiro app alvo para validação (Fridgify web? Tempy?)
- [ ] Definir a fonte do PRD (integração com a API do Notion vs. arquivo Markdown)
- [ ] Definir o momento de tornar o repositório público no GitHub e a licença
- [ ] Ambiente de execução dos testes do Maestro (simulador local vs. emulador de CI)
- [ ] Forma de hospedar os relatórios (S3, GitHub Pages etc.)
- [ ] Data log QA: definir a lista de SDKs de analytics suportados (Firebase, Amplitude, GA4 etc.)
- [ ] Data log QA: definir o método de captura de eventos no Flutter (adb logcat vs. proxy HTTP vs. Firebase Debug View)
