<p align="center">
  <img src="https://raw.githubusercontent.com/ahn283/sentinel-qa/main/img/sentinel_logo.png" alt="Sentinel QA" width="480" />
</p>

<p align="center">
  <strong>Agente de QA autônomo — gera e executa testes E2E em eventos de PR via Claude API.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sentinel-qa"><img src="https://img.shields.io/npm/v/sentinel-qa.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/sentinel-qa"><img src="https://img.shields.io/npm/dm/sentinel-qa.svg" alt="npm downloads" /></a>
  <img src="https://img.shields.io/node/v/sentinel-qa.svg" alt="node version" />
  <a href="https://github.com/ahn283/sentinel-qa/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/sentinel-qa.svg" alt="license" /></a>
</p>

---

> 🇺🇸 [Read this in English](README.en.md)

O sentinel-qa lê uma mudança de código, decide o que precisa ser testado, escreve os testes, executa-os e reporta o resultado. É um agente autocontido: aponte-o para um pull request ou um diff local, e ele conduz o ciclo completo sem que uma pessoa precise escrever casos de teste.

> **Status do projeto: em desenvolvimento inicial.** O pipeline Analyze → Plan → Execute → Report roda de ponta a ponta para web (Playwright). Execução Flutter, comentários em PRs, relatórios no Slack e captura de analytics durante a execução ainda não foram implementados — veja o [Roadmap](#roadmap).

## Arquitetura

Um pipeline sequencial de quatro etapas:

```
                    ┌──────────────────────────────────────────┐
  Evento de PR /    │ 1. Analyze   git diff, PRD, app registry, │
  CLI            ──>│              seletores, event specs,      │
                    │              status de testes existentes  │
                    ├──────────────────────────────────────────┤
                    │ 2. Plan      Claude API gera os casos de  │
                    │              teste + código executável,   │
                    │              depois se autocritica        │
                    ├──────────────────────────────────────────┤
                    │ 3. Execute   Gate de validação AST ──>    │
                    │              Playwright (web)             │
                    ├──────────────────────────────────────────┤
                    │ 4. Report    Relatório Markdown + JSON,   │
                    │              exit code 0 / 1              │
                    └──────────────────────────────────────────┘
```

| Etapa | Módulo | O que faz |
|-------|--------|--------------|
| Analyze | `src/agent/analyzer.ts` | Coleta o git diff, o arquivo de PRD opcional, a entrada do app, os seletores de UI, as specs de eventos de analytics e o status de testes anteriores em um `AnalysisContext`. |
| Plan | `src/agent/planner.ts` | Envia esse contexto para a Claude, interpreta a resposta como um `PlannedTest[]` validado com Zod, e então roda uma etapa de autocrítica sobre o código gerado. |
| Execute | `src/agent/index.ts` → `src/runners/` | Valida cada teste gerado com uma checagem de segurança baseada em AST, grava os sobreviventes em um diretório temporário e os executa com o Playwright. |
| Report | `src/report/` | Renderiza um relatório em Markdown, salva junto com o JSON bruto, imprime no stdout e retorna um exit code de sucesso/falha. |

## Início Rápido

```bash
# Instala as dependências e faz o build
npm install
npm run build

# Chave da Claude API (lida pelo Anthropic SDK)
export ANTHROPIC_API_KEY=sk-ant-...

# Executa contra o último commit, sem precisar de PR
npx sentinel-qa run --app arden-web --diff HEAD~1
```

O agente encerra com `0` quando todos os testes passam e `1` em caso de qualquer falha ou erro, então pode servir como gate direto de um job de CI.

### CLI

```
sentinel-qa run [options]

  --app <id>              ID do app no registry/apps.yaml (obrigatório)
  --pr <number>           Número do PR do GitHub
  --base-branch <branch>  Branch base para o diff (padrão: main)
  --diff <ref>            Referência de diff do Git (ex.: HEAD~1)
  --validate-events       Habilita o data log QA
  --prd <path>            Caminho para o arquivo de PRD
  --config <path>         Caminho para o diretório de configuração
  --help                  Exibe esta mensagem de ajuda
```

Sem `--diff`, o agente compara `<base-branch>...HEAD`. Um PRD passado via `--prd` é fornecido ao planner como contexto de produto, para que os testes possam cobrir intenções que o diff sozinho não revela — cada teste gerado registra se veio do `diff` ou do `prd`.

> Por padrão, todas as mensagens de CLI, logs e relatórios são exibidas em **inglês**, seguindo a convenção deste projeto. Para usar a versão em **Português do Brasil**, defina a variável de ambiente `SENTINEL_LOCALE=pt-BR` antes de rodar o comando:
> ```bash
> SENTINEL_LOCALE=pt-BR npx sentinel-qa run --app arden-web --diff HEAD~1
> ```

## Registro de Apps (App Registry)

Os apps são declarados em `registry/apps.yaml`:

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

**Selectors** (`registry/selectors/<app>.yaml`) mapeiam nomes lógicos para localizadores de UI. O planner recebe esse mapa para que o código gerado referencie nomes estáveis em vez de inventar seletores:

```yaml
add_ingredient_button: "Adicionar ingrediente"
generate_button: "Gerar receita"
recipe_card: "Receita gerada"
```

**Event specs** (`registry/event-specs/<app>.yaml`) declaram os eventos de analytics que um fluxo precisa emitir, com os tipos de parâmetros obrigatórios e opcionais:

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

## Configuração

Coloque um `sentinel-qa.config.yaml` (ou `.yml`) no diretório de trabalho, ou aponte para seu diretório com `--config`. Todos os campos são opcionais; os padrões abaixo se aplicam quando o arquivo está ausente.

```yaml
anthropic:
  model: claude-sonnet-4-20250514
  max_tokens: 4096

slack:
  webhook_url: ~                    # ou defina SLACK_WEBHOOK_URL
  channel: "#qa-alerts"

github:
  comment_on_pr: true

test:
  max_retries: 3
  timeout: 300000                   # por execução do Playwright, em ms
  confidence_threshold: 0.7
  quarantine:
    enabled: true
    window: 5                       # execuções rastreadas por teste

cost:
  track_tokens: true
  max_tokens_per_run: 100000        # limite rígido para uma única execução do agente
```

### Variáveis de ambiente

| Variável | Descrição |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Chave da Claude API. Obrigatória — consumida diretamente pelo Anthropic SDK. |
| `SLACK_WEBHOOK_URL` | Sobrescreve `slack.webhook_url` no arquivo de configuração. |
| `DEBUG` | Habilita o log em nível debug. |
| `SENTINEL_LOCALE` | Define o idioma das mensagens exibidas ao usuário (CLI, logs, relatórios). Padrão: inglês. Defina como `pt-BR` para usar Português do Brasil. |

As localizações do registry e dos relatórios estão atualmente fixadas em `./registry` e `./reports`, relativas ao diretório de trabalho.

## Funcionalidades

### Gate de segurança para código gerado

Código de teste produzido por um LLM é input não confiável, então nada chega ao Playwright sem validação. `src/runners/playwright/validator.ts` interpreta cada teste com a TypeScript compiler API e o rejeita ao encontrar:

- chamadas a `eval`, `Function` e `require`
- imports fora da allowlist — apenas `@playwright/*` e `playwright` são permitidos
- módulos nativos do Node como `child_process`, `fs`, `net`, `vm` e `worker_threads`
- acesso a `process.exit`, `process.kill` e `process.env`
- padrões de acesso dinâmico a globais, como `globalThis[...]`

Testes rejeitados são registrados como `skipped` com o erro de validação, e a execução continua. A execução em si acontece gravando os testes em um diretório temporário e disparando o Playwright como um subprocesso — nunca via `eval`.

### Controle de orçamento de tokens

Toda chamada à Claude é registrada em log com sua contagem de tokens de entrada/saída, e o total acumulado é verificado antes de cada requisição. Exceder `cost.max_tokens_per_run` aborta a execução em vez de continuar gastando silenciosamente.

### Rastreamento de quarentena

`src/store/test-status-store.ts` mantém uma janela deslizante das últimas N execuções por teste em `reports/<app-id>/status.yaml` e classifica cada teste como `new`, `stable`, `quarantine` ou `rejected` com base na sua taxa de aprovação. O analyzer devolve esse status atual para o planner, para que ele não regenere testes que já existem e já passam.

### Data Log QA

`src/event-validation/` compara os eventos de analytics capturados contra a spec: eventos ausentes, eventos inesperados e erros de tipo de parâmetro. Há parsers prontos para os endpoints do GA4, Firebase, Amplitude e Mixpanel.

> A captura ainda não está conectada ao runner do Playwright. Hoje, `--validate-events` carrega a event spec no contexto de planejamento; a interceptação ao vivo via `page.route()` está no roadmap.

### Relatórios

Cada execução grava `reports/<app-id>/<timestamp>/report.md` mais `result.json`, e imprime o Markdown no stdout. O relatório contém um resumo da execução, uma tabela por teste e o detalhamento de cada falha.

## Estrutura do Projeto

```
sentinel-qa/
  src/
    index.ts               # ponto de entrada do binário
    triggers/cli.ts        # parsing de argumentos da CLI
    agent/                 # analyzer, planner, prompts, llm-client, orquestrador
    locales/                # dicionários de mensagens (i18n: en / pt-BR)
    runners/
      playwright/          # runner web + validador AST
      maestro/              # bridge legado do Flutter (sendo substituído pelo Patrol)
    event-validation/      # padrões de captura de analytics + validação de specs
    registry/               # loader do registro de apps
    report/                 # renderização em Markdown + armazenamento de relatórios
    store/                  # rastreamento de status de testes / quarentena
    config/                 # loader de configuração YAML
    utils/                  # logger, sanitize, YAML loader
    __tests__/              # testes unitários (node:test)
  registry/
    apps.yaml               # apps registrados
    selectors/               # mapas de seletores de UI
    event-specs/             # specs de eventos de analytics
  reports/                   # relatórios e status gerados (no gitignore)
  docs/agent/                # PRD e checklist de desenvolvimento
```

## Desenvolvimento

```bash
npm install
npm run build            # tsc
npm run test             # node:test sobre dist/
npm run lint
```

Os testes rodam contra o código já compilado, então o `npm run build` precisa ser executado com sucesso antes. O workflow completo de contribuição — desenvolver → build → revisão → teste → checklist → commit — está descrito em [CLAUDE.md](CLAUDE.md) e [CONTRIBUTING.md](CONTRIBUTING.md) (também disponível em [CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md)).

**Restrições importantes antes de mexer em qualquer coisa:**

- Apenas ESM (`"type": "module"`) — os imports usam extensão `.js` mesmo para arquivos `.ts`.
- Zod 3.x. Não faça upgrade para o Zod 4.
- Todo input externo (YAML, respostas de API, variáveis de ambiente) é validado via schemas Zod.
- IDs fornecidos pelo usuário que chegam a um caminho de arquivo precisam passar por `sanitizeId()`.
- As strings exibidas ao usuário (CLI, logs, relatórios) usam **inglês por padrão** — a tradução para Português do Brasil fica disponível via `SENTINEL_LOCALE=pt-BR` (veja `src/locales/`). Documentação em Inglês e Português.

## Roadmap

| Área | Status |
|------|--------|
| Trigger de CLI, etapa Analyze | Concluído |
| Etapa Plan (Claude API, autocrítica) | Concluído |
| Etapa Execute (Playwright, gate AST) | Concluído |
| Geração de relatórios (Markdown + JSON) | Concluído |
| Módulo de i18n (CLI, logs e relatórios em pt-BR) | Concluído |
| Captura de analytics durante a execução dos testes | Planejado |
| Score de confiança + uso de tokens nos relatórios | Planejado |
| Comentários em PRs no GitHub (`@octokit/rest`) | Planejado |
| Trigger e workflow do GitHub Actions | Planejado |
| Relatórios de bugs no Slack, loop de retry | Planejado |
| Runner Patrol para Flutter | Planejado |

Detalhamento das tarefas: [`docs/agent/sentinel-qa-checklist.md`](docs/agent/sentinel-qa-checklist.md).

## Licença

[MIT](LICENSE)
