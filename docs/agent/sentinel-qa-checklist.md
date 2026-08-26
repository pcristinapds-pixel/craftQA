# Checklist de Desenvolvimento do Agent sentinel-qa

> PRD: `docs/agent/sentinel-qa-agent-prd.md` (v1.1)
> Code review: `docs/prd/code-review-report.md`
> Última atualização: 2026-03-31

---

## Etapa 0: Migração da Estrutura do Projeto

### 0-1. Desmembramento do monorepo
- [x] Achata o código de `packages/` em `src/`
  - [x] `packages/playwright-runner/src/` → `src/runners/playwright/`
  - [x] `packages/maestro-bridge/src/` → `src/runners/maestro/` (mantido temporariamente até a migração para o Patrol)
  - [x] `packages/mcp-server/src/event-validation/` → `src/event-validation/`
  - [x] `packages/mcp-server/src/store/test-status-store.ts` → `src/store/`
  - [x] `packages/mcp-server/src/report/` → `src/report/`
  - [x] `packages/mcp-server/src/registry/` → `src/registry/`
  - [x] `packages/mcp-server/src/utils/` → `src/utils/`
- [x] Remove `workspaces` do `package.json` raiz
- [x] Remove os 3 `package.json` dos subpacotes, unifica as dependências na raiz
- [x] Apaga o `turbo.json`
- [x] Unifica o `tsconfig.json` (estrutura base + packages → um único tsconfig)
- [x] Corrige o script de build (build único via `tsc`)
- [x] Confirma que `npm run build` funciona
- [x] Confirma que `npm run test` funciona

### 0-2. Remoção do código MCP
- [x] Remove `packages/mcp-server/src/index.ts` (bootstrap do servidor MCP)
- [x] Remove toda a pasta `packages/mcp-server/src/tools/` (5 tools do MCP)
- [x] Remove `packages/mcp-server/src/schemas/tools.ts` (schema de input do MCP)
- [x] Remove `packages/mcp-server/src/store/test-store.ts` (storage de TC em memória)
- [x] Remove a dependência `@modelcontextprotocol/sdk`
- [x] Remove os testes relacionados ao MCP (só os testes desses módulos)
- [x] Remove `scripts/verify-mcp-flow.mjs`
- [x] Limpa a entrada `bin` e o script de shebang do `postbuild`

### 0-3. Correção de issues de segurança (code review C-01, C-02)
- [x] `validator.ts` do Playwright — reforçado com validação baseada em AST
  - [x] Inspeciona CallExpression e ImportDeclaration via TypeScript Compiler API
  - [x] Allowlist de módulos permitidos (`@playwright/test`, etc.)
  - [x] Bloqueia padrões de acesso dinâmico como `globalThis[...]`
  - [x] Migra os testes antigos baseados em regex para a versão baseada em AST
- [x] Runner Maestro/Patrol — previne path traversal via `test.id`
  - [x] Adiciona a função `sanitizeId()` (permite só alfanumérico/hífen/underscore)
  - [x] Valida que o caminho do resultado fica dentro do tempDir
  - [x] Adiciona teste

### 0-4. Melhoria de qualidade dos módulos reaproveitados (code review H-02 ~ H-05)
- [x] `yaml-loader.ts` — integra validação com schema Zod
  - [x] Muda a assinatura para `loadYaml<T>(path, schema)` (parâmetro schema opcional)
  - [ ] Atualiza os pontos de chamada (registry, event-spec — aplicar depois de definir os schemas)
- [x] `test-status-store.ts` — adiciona o método `recordBatch()`
  - [x] Grava N resultados em uma única operação de I/O
  - [x] Mantém `recordRun()` existente (delega para o recordBatch)
  - [x] Adiciona teste
- [x] Define a interface comum dos runners
  - [x] Cria o tipo `UnifiedRunResult` (`src/types/runner.ts`)
  - [ ] Implementa em ambos, Playwright e Maestro/Patrol (aplicar na integração dos runners)
- [ ] Captura de eventos — retornar aviso de "ainda não implementado" (implementar na integração dos runners)

### 0-5. Atualização de documentação e configuração
- [x] Atualiza o `CLAUDE.md`
  - [x] Remove a restrição "sem chamadas a LLM"
  - [x] Reflete a estrutura de pacote único
  - [x] Reflete os novos comandos de build/teste
  - [x] Atualiza o workflow para 6 etapas (desenvolver→build→code review→teste→checklist→commit)
- [x] Marca `docs/sentinel-ai-planning.md` e `docs/sentinel-ai-checklist.md` existentes como arquivados

---

## Etapa 1: Trigger da CLI + Analyzer

### 1-1. Novo ponto de entrada (`src/index.ts`)
- [x] Cria o ponto de entrada principal do agente
- [x] Implementa o parser da CLI (argumentos: `--app`, `--pr`, `--base-branch`, `--diff`, `--validate-events`, `--prd`)
- [x] Define a interface `AgentConfig`
- [x] Registra o `bin` para permitir a execução via `npx sentinel-qa run`
- [x] Implementa a saída do `--help`

### 1-2. Analyzer (`src/agent/analyzer.ts`)
- [x] Define a interface `AnalysisContext`
- [x] Executa `git diff <baseBranch>...HEAD` → coleta a string do diff
- [x] Carrega o arquivo de PRD (leitura de Markdown)
- [x] Consulta as informações do app no AppRegistry
- [x] Carrega os seletores
- [x] Carrega a spec de eventos (opcional)
- [x] Carrega o status dos testes existentes (informação de quarantine)
- [x] Escreve os testes

### 1-3. Arquivo de configuração (`sentinel-qa.config.yaml`)
- [x] Define o schema Zod de configuração (seções anthropic, slack, github, test, cost)
- [x] Implementa o loader de configuração (arquivo + override por variável de ambiente)
- [x] Trata os valores padrão
- [x] Inclui a configuração `confidence_threshold`
- [x] Inclui as configurações `cost.track_tokens` e `cost.max_tokens_per_run`

---

## Etapa 2: Planner (Claude API)

### 2-1. Interface de LLM (`src/agent/llm-client.ts`)
- [x] Define a interface `LLMClient` (`call`, `getTotalUsage`)
- [x] Implementa o `ClaudeLLMClient`
- [x] Instala o `@anthropic-ai/sdk` e inicializa o client
- [x] Loga o uso de tokens (tokens de entrada/saída por chamada)
- [x] Lógica de aborto quando `max_tokens_per_run` é excedido

### 2-2. Planner (`src/agent/planner.ts`)
- [x] Define a interface `PlannedTest`
- [x] Escreve o prompt de sistema
  - [x] Define o papel (engenheiro(a) de QA sênior)
  - [x] Regras de geração de código (uso dos seletores, testes independentes, restrições de segurança)
  - [x] **Regra de smart wait** (`waitForSelector` obrigatório, `waitForTimeout` proibido)
  - [x] **Padrão retry-friendly** (prioriza assertions com auto-retry como `expect().toBeVisible()`)
  - [x] Formato de saída (array JSON)
  - [x] **Exemplos few-shot** (2 testes corretos em Playwright)
- [x] Monta o prompt do usuário (PRD + diff + seletores + spec de eventos)
- [x] **Inclui a lista de testes stable existentes** → evita gerar duplicados
- [x] Chama a Claude API → faz o parsing da resposta JSON
- [x] Valida a resposta com Zod (`PlannedTest[]`)
- [x] **Etapa de self-critique** — a Claude revisa o código gerado (uso incorreto de seletor, assertion faltando, violação de segurança)
- [x] Tratamento de erro (falha da API, falha de parsing, resposta vazia)
- [x] Escreve os testes (com resposta de API mockada)

### 2-3. Templates de prompt
- [x] Prompt de geração de código Playwright + exemplos few-shot
- [x] Prompt de geração de código Patrol (few-shot adicionado na etapa do runner Patrol)
- [x] Lógica de distinção entre TC baseado em diff vs. baseado em PRD (via campo trigger)

---

## Etapa 3: Integração do Runner Playwright

### 3-1. Integração do runner (`src/runners/playwright.ts`)
- [x] Move a lógica central do `packages/playwright-runner` existente (concluído na Etapa 0)
- [x] Interface `UnifiedRunResult` — convertida e usada pelo agent
- [x] Aplica o validator baseado em AST — validação executada em agent/index.ts antes de rodar
- [ ] Integração de captura de eventos (interceptação via `page.route()`)
  - [ ] Conectar com o matching de URL do `capture-patterns.ts`
  - [ ] Lógica de coleta do `CapturedEvent[]`
- [x] Mantém o cancelamento via AbortSignal
- [x] Migra os testes existentes + adiciona novos

### 3-2. Primeira validação E2E em app web
- [ ] Escolher o app alvo da validação (arden-web recomendado — já é web, então o Playwright pode ser usado direto)
- [ ] Gerar TC a partir de um diff real de PR → executar no Playwright → conferir o resultado
- [ ] Revisar a qualidade do código de teste gerado
- [ ] Verificar se os padrões de smart wait / retry-friendly foram aplicados

---

## Etapa 4: Reporter

### 4-1. Geração do relatório (`src/agent/reporter.ts`)
- [ ] Integrar com o `report/markdown.ts` existente
- [ ] Converter `AgentResult` → relatório em Markdown
- [ ] Incluir o **confidence score** (confiabilidade por teste)
- [ ] Incluir o **uso de tokens da API** no relatório
- [ ] Manter a gravação em `reports/<appId>/<timestamp>/`
- [ ] Manter a gravação do resultado em JSON

### 4-2. Comentário no PR
- [ ] Instalar o `@octokit/rest`
- [ ] Autenticação com a API do GitHub (GITHUB_TOKEN)
- [ ] Lógica de criação/atualização do comentário no PR
  - [ ] Incluir a label **`[AI-Generated]`**
  - [ ] Tudo passou + alta confiança (≥ 0.7): ✅ pode dar merge
  - [ ] Tudo passou + baixa confiança (< 0.7): ⚠️ exibir como warning (sem bloquear)
  - [ ] Falha: detalhe dos testes que falharam + resultado da validação de eventos
- [ ] Atualizar o comentário anterior do sentinel-qa, se existir (evita duplicar)

---

## Etapa 5: Workflow do GitHub Actions

### 5-1. Arquivo de workflow (`sentinel-qa.yml`)
- [ ] Trigger em eventos de PR (opened, synchronize)
- [ ] Configurar Node.js 20
- [ ] `fetch-depth: 0` (histórico completo)
- [ ] Injetar variáveis de ambiente (ANTHROPIC_API_KEY, SLACK_WEBHOOK_URL, GITHUB_TOKEN)
- [ ] Executar `npx sentinel-qa run`
- [ ] Tratar o exit code em caso de falha

### 5-2. Trigger do GitHub Actions (`src/triggers/github-action.ts`)
- [ ] Montar o `AgentConfig` a partir das variáveis de ambiente
- [ ] Fazer o parsing das informações do PR a partir de `GITHUB_EVENT_PATH`
- [ ] Chamar o loop principal do agent
- [ ] Retornar o exit code (0: passou, 1: falhou)

---

## Etapa 6: Bug Report no Slack + Loop com o pilot-ai

### 6-1. Integração com o Slack
- [ ] Instalar `@slack/webhook`
- [ ] Converter `BugReport` em mensagem no formato Block Kit do Slack
- [ ] Configurar a Webhook URL (variável de ambiente)
- [ ] Fallback em caso de falha no envio (registrar em log)
- [ ] Teste (com webhook mockado)

### 6-2. Loop de retry
- [ ] Adicionar a lógica de retry em `agent/index.ts`
- [ ] Configurar o número máximo de tentativas (`maxRetries`, default: 3)
- [ ] Detectar novo commit (evento `synchronize` do GitHub Actions)
- [ ] Notificar no Slack "intervenção manual necessária" após 3 tentativas
- [ ] Incluir a contagem de tentativas no relatório

---

## Etapa 7: Runner Patrol (Flutter)

### 7-1. Validação antecipada da qualidade de geração de código Patrol
- [ ] Testar a geração de código Dart do Patrol via Claude API (mais difícil do que YAML do Maestro)
- [ ] Se a qualidade gerada não for suficiente, definir estratégia de uso em paralelo com o Maestro YAML

### 7-2. Implementação do runner Patrol (`src/runners/patrol.ts`)
- [ ] Integração com a CLI do Patrol (`patrol test`)
- [ ] Gravar o código de teste Dart em arquivo temporário
- [ ] Fazer o parsing do resultado
- [ ] Implementar `UnifiedRunResult`
- [ ] Consultar o código da bridge do Maestro existente antes de removê-lo

### 7-3. Validação do ambiente Flutter
- [ ] Instalar o Flutter SDK no runner macOS do GitHub Actions
- [ ] Confirmar a execução do simulador iOS
- [ ] Confirmar a execução dos testes do Patrol
- [ ] Rodar o teste E2E completo no app alvo de validação

---

## Etapa 8: Abertura como Open Source

### 8-1. Documentação
- [ ] Reescrever completamente o README.md (apresentação do agente, Quick Start, como configurar)
- [ ] Escrever o CONTRIBUTING.md
- [ ] Confirmar a LICENSE (MIT)

### 8-2. Pacote
- [ ] Organizar o `package.json` (keywords, description, repository)
- [ ] Testar a publicação no npm (`npm pack` → revisar)
- [ ] Confirmar o funcionamento de `npx sentinel-qa run --help`
- [ ] Tornar o repositório do GitHub público

---

## Preocupações Transversais (comuns a todas as etapas)

### Testes
- [ ] Confirmar que `npm run test` passa ao final de cada etapa
- [ ] Escrever teste unitário para cada novo módulo
- [ ] Executar os testes automaticamente no CI

### Segurança de tipos
- [ ] Proibido usar o tipo `any`
- [ ] Validar todo input externo (YAML, resposta de API, variáveis de ambiente) com Zod
- [ ] Concentrar os tipos compartilhados em `src/types/`

### Logging
- [ ] Aplicar logging estruturado (formato JSON, level + timestamp)
- [ ] Proibido logar informação sensível (chaves de API, etc.)

### Segurança
- [ ] Todo código de teste gerado precisa passar pelo AST validator antes de rodar
- [ ] Sanitizar caminhos de arquivo que incluam input do usuário
- [ ] Gerenciar segredos via variáveis de ambiente (proibido hardcode)
- [ ] Egress de rede — considerar permitir apenas a URL do app alvo + endpoints de analytics durante a execução dos testes

### Gestão de custo
- [ ] Logar o uso de tokens da Claude API a cada chamada
- [ ] Rastrear o total acumulado por execução → abortar se exceder `max_tokens_per_run`
- [ ] Exibir o uso total de tokens no relatório
