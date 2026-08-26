# PRD do Agent sentinel-qa

> Versão: 1.1
> Data: 2026-03-31
> Status: rascunho — necessita revisão

---

## 1. Contexto e Motivação

### Estado atual (servidor MCP)
O sentinel-qa hoje é implementado como um servidor MCP (Model Context Protocol). Agentes de IA externos como o pilot-ai se conectam via protocolo MCP e chamam sequencialmente: salvar TC (`save_tests`) → executar testes (`run_tests`) → consultar resultado (`get_report`).

### Limitações
- **Trigger manual**: mesmo com um PR aberto, alguém (o pilot-ai) precisa chamar o MCP para o teste começar
- **Dependência externa para gerar TC**: a responsabilidade de gerar TCs é do pilot-ai, então o sentinel-qa não funciona sozinho
- **Sem conversão para código executável**: o pipeline não converte TC em linguagem natural para código Playwright/Patrol executável
- **Sem loop de feedback**: não há mecanismo implementado que envie pedidos de correção automaticamente quando um teste falha

### Mudança de direção
Transformar o sentinel-qa em um **agente de QA independente**. Ele detecta eventos de PR diretamente, gera TCs via Claude API, e faz sozinho a conversão para código executável. Em caso de falha, envia um bug report ao pilot-ai via Slack, completando o loop de correção automática.

---

## 1.5. Cenário Competitivo e Posicionamento

### Estrutura do mercado

| Categoria | Produtos de referência | Faixa de preço | Diferencial do sentinel-qa |
|------|----------|--------|-------------------|
| Serviço gerenciado | QA Wolf, Bug0 | US$ 5K+/mês | Open source, gratuito, self-hosted |
| Plataforma SaaS | Octomind, Momentic, testRigor | US$ 250+/mês | Sem vendor lock-in, nativo do GitHub Actions |
| Ferramenta open source | TestZeus Hercules, PR Test Generator | Gratuito | Única combinação de validação de analytics + quarantine + loop de falhas |

### Arquitetura de referência

**OpenObserve Council of Sub Agents** — 8 agentes especializados baseados no Claude Code geram automaticamente mais de 700 testes E2E, reduzindo testes flaky em 85%. O pipeline de 4 etapas (analysis → architecture → engineering → healing) é equivalente ao Analyze → Plan → Execute → Report do sentinel-qa. Uma estrutura já validada pelo mercado.

### Pontos fortes exclusivos (vs. concorrentes)
- **Validação de eventos de analytics** — única ferramenta open source que faz data log QA simultaneamente à execução dos testes E2E
- **Sistema de quarantine** — gerencia automaticamente a confiabilidade dos testes com uma janela deslizante de 5 execuções (padrão parecido com o da QA Wolf)
- **Registry de seletores** — mais determinístico e estável do que a interpretação de IA em tempo de execução (Momentic)
- **Entrada dupla PRD + diff** — gera cobertura completa da funcionalidade e TCs focados no escopo de impacto do PR ao mesmo tempo
- **Open source MIT** — custo zero frente a alternativas comerciais (concorrentes cobram de US$ 3K a US$ 90K/ano)

### Tendências do setor (2025-2026)
- 72% das equipes de QA estão explorando fluxos de teste baseados em IA
- Ao adotar agentes de IA, empresas relatam análise 6-10x mais rápida, redução de 85% em testes flaky e aumento de 84% na cobertura
- **A confiabilidade de testes de IA totalmente autônomos caiu para 29%** — o gate de revisão humana continua importante

---

## 2. Objetivos

| Prioridade | Objetivo | Critério de sucesso |
|---------|------|----------|
| P0 | Gerar TCs automaticamente e executar testes E2E quando um PR é aberto | Funciona sem intervenção humana, do trigger do PR no GitHub Actions até o fim do teste |
| P0 | Gerar código de teste executável diretamente via Claude API | O código gerado roda direto no Playwright/Patrol |
| P1 | Enviar bug report automático ao pilot-ai quando um teste falha | Mensagem enviada ao Slack → confirmação de recebimento pelo pilot-ai |
| P1 | Loop de falha → correção → reteste (até 3 vezes) | Possível medir a taxa de recuperação automática dentro de 3 tentativas |
| P2 | Onboarding de um novo app só com o registro em `apps.yaml` | Mantém a estrutura de registry atual, configuração em 3-5 linhas |

---

## 3. Fluxo Principal

```
PR aberto / novo commit
    ↓
GitHub Actions → dispara o sentinel-qa
    ↓
┌─────────────────────────────────────┐
│ 1. ANALYZE                          │
│    - Extrai o diff do PR (git diff) │
│    - Carrega o PRD (Markdown/Notion)│
│    - Consulta o registry (apps.yaml)│
│    - Carrega os seletores           │
│      (selectors/*.yaml)             │
│    - Carrega a spec de eventos      │
│      (event-specs/)                 │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. PLAN (Claude API)                │
│    - PRD + diff + seletores →       │
│      prompt                         │
│    - Gera a lista de TCs (YAML)     │
│    - Gera o código de execução      │
│      por TC                         │
│      - Web: código Playwright TS    │
│      - Flutter: código Patrol Dart  │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. EXECUTE                          │
│    - Valida a segurança do código   │
│      (validator)                    │
│    - Executa Playwright / Patrol    │
│    - Captura eventos                │
│      (validate_events)              │
│    - Confere contra a spec          │
│      de eventos                     │
│    - Registra o status do teste     │
│      (quarantine)                   │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. REPORT                           │
│    - Gera relatório Markdown + JSON │
│    - Publica o resultado como       │
│      comentário no PR               │
│    ├─ Tudo passou → ✅ pode dar     │
│    │  merge                         │
│    └─ Falhou → envia bug report     │
│             pro Slack               │
│             → aguarda correção      │
│               do pilot-ai           │
│             → novo commit dispara   │
│               de novo               │
│             → mais de 3 tentativas  │
│               → intervenção manual  │
└─────────────────────────────────────┘
```

---

## 4. Arquitetura

### 4.1 Estrutura de módulos

```
sentinel-qa/
  src/
    agent/                        # núcleo do agente (novo)
      index.ts                    # orquestrador principal (analyze → plan → execute → report)
      analyzer.ts                 # parsing de PRD + git diff, coleta de contexto
      planner.ts                  # chama a Claude API → gera TC + código executável
      reporter.ts                 # gera relatório + comentário no PR + envio ao Slack

    runners/                      # executores de teste (reaproveita código existente)
      playwright.ts               # ← integra packages/playwright-runner
      patrol.ts                   # ← substitui packages/maestro-bridge pelo Patrol

    event-validation/             # data log QA (reaproveita código existente)
      validator.ts                # valida contra a spec de eventos
      capture-patterns.ts         # matching de URLs do GA4/Firebase/Amplitude
      schema.ts                   # validação Zod da spec de eventos
      types.ts

    store/                        # gerenciamento de estado (reaproveita código existente)
      test-status-store.ts        # sistema de quarantine (janela deslizante de 5 execuções)

    report/                       # formatador de relatório (reaproveita código existente)
      markdown.ts                 # gera o relatório em Markdown

    registry/                     # registry de apps (reaproveita código existente)
      registry.ts                 # carrega apps.yaml + selectors + event-specs

    triggers/                     # triggers (novo)
      github-action.ts            # entrypoint do GitHub Actions
      cli.ts                      # execução manual (npx sentinel-qa run)

    utils/
      logger.ts                   # logging (existente)
      yaml-loader.ts              # parser de YAML (existente)

  registry/                       # configuração dos apps (mantém)
    apps.yaml
    selectors/
    event-specs/

  .github/
    workflows/
      sentinel-qa.yml             # workflow do GitHub Actions (novo)
```

### 4.2 Diretrizes para o código existente

| Módulo existente | Ação | Motivo |
|-----------|------|------|
| `packages/mcp-server/src/tools/` | **Remover** | Não precisa mais do padrão de registro de tools do MCP |
| `packages/mcp-server/src/schemas/tools.ts` | **Remover** | Não precisa mais do schema de input do MCP |
| `packages/mcp-server/src/index.ts` | **Remover** | Não precisa mais do bootstrap do servidor MCP |
| `packages/mcp-server/src/store/test-store.ts` | **Remover** | Storage de TC em memória → substituído pelo estado interno do agente |
| Dependência `@modelcontextprotocol/sdk` | **Remover** | Não precisa mais do protocolo MCP |
| `packages/playwright-runner/` | **Integrar** | Move para `src/runners/playwright.ts` |
| `packages/maestro-bridge/` | **Substituir** | Substitui pelo Patrol, em `src/runners/patrol.ts` |
| `src/event-validation/` | **Manter** | Lógica central do data log QA |
| `src/store/test-status-store.ts` | **Manter** | Sistema de quarantine |
| `src/report/markdown.ts` | **Manter** | Geração de relatório |
| `src/registry/` | **Manter** | Loader do registry de apps |
| `registry/` (arquivos YAML) | **Manter** | Dados de configuração dos apps |

### 4.3 Migração de monorepo para pacote único

Unifica os 3 workspaces atuais (`mcp-server`, `playwright-runner`, `maestro-bridge`) em um **pacote único**. Como o agente tem um único ponto de entrada, a estrutura de monorepo deixa de trazer benefício. A configuração do Turborepo também é removida.

### 4.4 Mudanças na stack técnica

| Item | Atual | Depois da mudança |
|------|------|---------|
| Ponto de entrada | Servidor MCP via stdio | CLI (`npx sentinel-qa run`) + GitHub Actions |
| IA | Nenhuma (dependência externa) | Claude API (Anthropic SDK) |
| Teste Flutter | Maestro | Patrol |
| Teste web | Playwright | Playwright (mantém) |
| Estrutura de pacotes | Monorepo (3 packages) | Pacote único |
| Build | Turborepo + tsc | tsc |
| Comunicação | MCP JSON-RPC (stdin/stdout) | Slack API + GitHub API |

---

## 5. Design Detalhado dos Módulos

### 5.1 Agent — `src/agent/index.ts`

Orquestrador principal. Executa o pipeline de 4 etapas sequencialmente.

```typescript
interface AgentConfig {
  appId: string;
  prNumber?: number;          // número do PR no GitHub
  baseBranch?: string;        // branch base para o diff (default: main)
  maxRetries?: number;        // tentativas em caso de falha (default: 3)
  validateEvents?: boolean;   // habilita o data log QA
  prdPath?: string;           // caminho do arquivo de PRD
}

interface AgentResult {
  status: 'passed' | 'failed' | 'error';
  totalTests: number;
  passed: number;
  failed: number;
  report: string;             // relatório em Markdown
  failedTests: FailedTest[];  // detalhes das falhas
}
```

### 5.2 Analyzer — `src/agent/analyzer.ts`

Coleta o contexto do PR e monta a entrada estruturada que será passada ao Planner.

```typescript
interface AnalysisContext {
  app: AppEntry;                  // consultado no registry
  diff: string;                   // resultado do git diff
  prd: string;                    // conteúdo do documento de PRD
  selectors: SelectorMap;         // seletores de UI
  eventSpecs?: EventSpecConfig;   // spec de eventos (opcional)
  existingTests?: TestStatus[];   // status dos testes existentes (info de quarantine)
}
```

**Fontes de entrada**:
- `git diff <baseBranch>...HEAD` — código alterado
- `registry/apps.yaml` — metadados do app
- `registry/selectors/<app>.yaml` — seletores de UI
- `registry/event-specs/<app>.yaml` — spec de eventos
- Arquivo de PRD (Markdown, caminho configurável)

### 5.3 Planner — `src/agent/planner.ts`

Chama a Claude API para gerar os TCs e o código executável.

```typescript
interface PlannedTest {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  trigger: 'prd' | 'diff';       // origem da geração
  affectedFiles?: string[];       // arquivos relacionados, quando baseado em diff
  platform: 'web' | 'flutter';
  code: string;                   // código Playwright TS ou Patrol Dart executável
}
```

**Estratégia de prompt**:
1. **Prompt de sistema**: papel do sentinel-qa, regras de geração de código, como usar os seletores, **exemplos few-shot** (2-3 testes corretos por framework)
2. **Prompt do usuário**: PRD + diff + mapa de seletores + spec de eventos
3. **Formato de saída**: array JSON (`PlannedTest[]`)
4. **Etapa de self-critique**: a Claude revisa o código gerado mais uma vez — verifica uso incorreto de seletor, assertion faltando, violação de segurança, e corrige

**Regras de geração de código** (incluídas no prompt):
- Web: bloco `test()` do Playwright, usa apenas os seletores fornecidos, inclui `page.goto()`
- Flutter: bloco `patrolTest()` do Patrol, finders baseados em key/texto do widget
- **Smart wait obrigatório**: usar espera explícita como `waitForSelector`, `waitForLoadState` (proibido `waitForTimeout` hardcoded)
- **Padrão retry-friendly**: priorizar assertions com auto-retry como `expect().toBeVisible()` para evitar flakiness
- Proibido fazer requisições de rede externas ou acessar o sistema de arquivos
- Cada teste é independente (sem shared state)

**Evitar duplicar testes existentes**:
- Antes de gerar, inclui no prompt a lista de testes stable já existentes
- Instrui a não gerar de novo cenários semelhantes aos já existentes

### 5.4 Runners

#### Playwright — `src/runners/playwright.ts`
Integra a lógica central do `packages/playwright-runner` existente.

- Grava o código TS gerado em um arquivo temporário
- Dispara `npx playwright test`
- Faz o parsing do `results.json`
- Captura de eventos: intercepta via `page.route()` → coleta em `capturedEvents[]`

#### Patrol — `src/runners/patrol.ts`
Substitui a bridge do Maestro existente pelo Patrol.

- Grava o código Dart gerado no diretório `integration_test/` do app alvo
- Dispara `patrol test`
- Faz o parsing do resultado

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

**Canais de saída**:
1. **Comentário no PR** — publica o resumo do resultado do teste via API do GitHub. Inclui a label `[AI-Generated]`. Se já existir um comentário anterior do sentinel-qa, atualiza em vez de duplicar
2. **Mensagem no Slack** — em caso de falha, envia um bug report estruturado ao canal do pilot-ai
3. **Relatório em arquivo** — salva Markdown + JSON em `reports/<appId>/<timestamp>/` (mantém o comportamento atual)

**Gate de confiabilidade**:
- Cada teste recebe um confidence score (0-1)
- Resultados de baixa confiança (`< 0.7`) aparecem como warning, sem bloquear o PR
- Só marca ✅ pronto pra merge quando tudo passou e a confiança é alta

### 5.6 Triggers

#### GitHub Actions — `src/triggers/github-action.ts`
```typescript
// Extrai as informações do PR das variáveis de ambiente
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
# Execução manual
npx sentinel-qa run --app fridgify --pr 42 --validate-events

# Teste local (sem PR)
npx sentinel-qa run --app arden-web --diff HEAD~1
```

---

## 6. Workflow do GitHub Actions

```yaml
# .github/workflows/sentinel-qa.yml
name: sentinel-qa

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  qa:
    runs-on: macos-latest  # necessário para o simulador Flutter
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # histórico completo para o diff

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

## 7. Data Log QA

Reaproveita o módulo `event-validation/` existente sem alterações.

**Fluxo**:
1. Durante a execução do Playwright, intercepta as requisições de analytics via `page.route('**/collect*')` etc.
2. Coleta os eventos capturados em `CapturedEvent[]`
3. `validateEvents(capturedEvents, eventSpec)` — confere contra a spec
4. Inclui o resultado no relatório (missing / unexpected / param mismatch)

**Plataformas suportadas**: GA4, Firebase Analytics, Amplitude, Mixpanel (via `capture-patterns.ts` existente)

---

## 8. Expansão do Registry de Apps

Adiciona caminho de PRD e informação de repositório ao schema atual do `apps.yaml`.

```yaml
# registry/apps.yaml
apps:
  - id: fridgify
    type: flutter
    repo: github.com/eodin/fridgify
    prd: docs/prd.md                    # novo: caminho do PRD
    context:
      selectors: ./selectors/fridgify.yaml
      event_spec: ./event-specs/fridgify.yaml

  - id: arden-web
    type: web
    url: https://arden.app
    repo: github.com/eodin/arden-web    # novo: endereço do repo
    prd: docs/prd.md                    # novo: caminho do PRD
    context:
      selectors: ./selectors/arden-web.yaml
      event_spec: ./event-specs/arden-web.yaml
```

---

## 9. Configuração

```yaml
# sentinel-qa.config.yaml (raiz do projeto)
anthropic:
  model: claude-sonnet-4-20250514      # modelo usado para gerar os TCs
  max_tokens: 4096

slack:
  webhook_url: ${SLACK_WEBHOOK_URL}    # referência via variável de ambiente
  channel: "#qa-alerts"

github:
  comment_on_pr: true                  # habilita o comentário no PR

test:
  max_retries: 3                       # máximo de tentativas em caso de falha
  timeout: 300000                      # timeout do teste (5 minutos)
  confidence_threshold: 0.7            # abaixo disso, aparece como warning
  quarantine:
    enabled: true
    window: 5                          # tamanho da janela deslizante

cost:
  track_tokens: true                   # loga o uso de tokens da API
  max_tokens_per_run: 100000           # máximo de tokens por execução (aborta se exceder)
```

### Design da interface de LLM

O Planner faz as chamadas ao LLM através de uma interface abstrata. Hoje só suporta a Claude, mas o design permite trocar por outro LLM no futuro.

```typescript
interface LLMClient {
  generateTests(context: AnalysisContext): Promise<PlannedTest[]>;
  critiqueTests(tests: PlannedTest[]): Promise<PlannedTest[]>;
}

// Implementação atual
class ClaudeLLMClient implements LLMClient { ... }
```

---

## 10. Roadmap de Desenvolvimento

| Etapa | Conteúdo | Entregável | Dependência |
|------|------|--------|--------|
| **Etapa 0** | Migração de monorepo para pacote único, remoção do código MCP | Estrutura do projeto organizada | Nenhuma |
| **Etapa 1** | Trigger da CLI + Analyzer (parsing do diff) | `triggers/cli.ts`, `agent/analyzer.ts` | Etapa 0 |
| **Etapa 2** | Planner (Claude API → gera TC + código) | `agent/planner.ts` | Etapa 1 |
| **Etapa 3** | Integração do runner Playwright + primeira validação E2E em app web | `runners/playwright.ts` | Etapa 2 |
| **Etapa 4** | Reporter (Markdown + comentário no PR) | `agent/reporter.ts` | Etapa 3 |
| **Etapa 5** | Workflow do GitHub Actions + trigger via PR | `sentinel-qa.yml`, `triggers/github-action.ts` | Etapa 4 |
| **Etapa 6** | Bug report no Slack + loop com o pilot-ai | Integração com Slack, lógica de retry | Etapa 5 |
| **Etapa 7** | Runner Patrol → integração com app Flutter | `runners/patrol.ts` | Etapa 3 |
| **Etapa 8** | Abertura como open source (README, CONTRIBUTING, MIT) | Repositório público no GitHub | Etapa 6 |

---

## 11. Dependências

### Dependências adicionadas
| Pacote | Uso |
|--------|------|
| `@anthropic-ai/sdk` | Chamadas à Claude API (geração de TC) |
| `@slack/webhook` | Envio de bug report ao Slack |
| `@octokit/rest` | API do GitHub (comentário no PR) |

### Dependências mantidas
| Pacote | Uso |
|--------|------|
| `@playwright/test` | Execução de testes E2E web |
| `yaml` | Parsing de YAML |
| `zod` (3.x) | Validação de input |

### Dependências removidas
| Pacote | Motivo |
|--------|------|
| `@modelcontextprotocol/sdk` | Remoção do protocolo MCP |
| `turbo` | Fim do monorepo |

---

## 12. Pontos em Aberto

- [ ] Escolher o primeiro app alvo para validação (fridgify vs. arden-web)
- [ ] Definir a fonte do PRD — recomendado usar arquivo Markdown no repo inicialmente, Notion fica para depois
- [ ] Verificar se o GitHub Actions runner macOS consegue rodar o simulador Flutter + Patrol
- [ ] Detalhar como o pilot-ai recebe a mensagem no Slack e dispara a correção de código
- [ ] Escolha do modelo da Claude API — sonnet (velocidade/custo) vs. opus (precisão)
- [ ] Estratégia para quando faltar seletor na geração de código de teste (busca automática vs. erro)
- [ ] 9 testes existentes — manter só os testes dos módulos reaproveitados, definir o que mais será removido
- [ ] Validar cedo a qualidade da geração de código Dart do Patrol — mais difícil para o LLM do que YAML do Maestro, considerar manter o Maestro em paralelo se necessário
- [ ] Estratégia de self-healing locator — fallback baseado em prompt na primeira fase, interpretação por IA a longo prazo
- [ ] Teste de regressão visual — avaliar se adiciona comparação de screenshot do Playwright como checagem opcional pós-execução

---

## 13. Referências

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
