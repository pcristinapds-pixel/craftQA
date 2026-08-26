# [ARQUIVADO] Planejamento do Projeto sentinel-qa

> **⚠️ Este documento foi arquivado.** O design baseado no servidor MCP foi substituído pela arquitetura de agente.
> Planejamento atual: `docs/agent/sentinel-qa-agent-prd.md`
> Checklist atual: `docs/agent/sentinel-qa-checklist.md`

> Data da discussão: 2026-03-14
> Objetivo: desenhar a infraestrutura de automação de QA baseada em PRD e planejar a integração com o pilot-ai

---

## 1. Visão Geral do Projeto

### Objetivos
- Quando o pilot-ai lê o PRD e gera os casos de teste, o sentinel-qa executa esses testes e retorna o resultado
- Testar automaticamente o comportamento de UI de apps Flutter (iOS/Android) e web (React/Next.js)
- Ir além do teste unitário: automatizar testes E2E baseados em fluxos reais de usuário
- **Data Log QA**: durante a execução dos testes E2E, capturar o disparo de eventos de analytics (Firebase, Amplitude, etc.) e validar contra a spec
- Integrar com o pilot-ai para disparar testes via comando em linguagem natural no Slack/Telegram

### Divisão de responsabilidades
- **pilot-ai**: tem o LLM. Responsável pelo julgamento de IA — parsing do PRD, geração de caso de teste, geração de código
- **sentinel-qa**: sem LLM. Responsável pela infraestrutura — execução de teste, coleta de resultado, relatório (servidor MCP)

### Nome do projeto
- **`sentinel-qa`** (planejado para ser aberto como open source)
- Confirmado que não há conflito no npm
- Sufixo `-ai` alinhado com o pilot-ai → consistência no ecossistema
- Transmite de forma intuitiva o significado de "ferramenta de vigilância/QA baseada em IA"

---

## 2. Arquitetura Central

```
pilot-ai (tem o LLM)
  ├─ lê o PRD + gera o YAML de casos de teste
  ├─ YAML + contexto do app (selectors) → gera código executável
  └─ chama o servidor MCP do sentinel-qa (stdio)
       ↓
sentinel-qa (servidor MCP — infraestrutura de teste)
  ├─ salva e gerencia os casos de teste
  ├─ executa a automação de UI por plataforma
  │    ├─ App Flutter (iOS/Android) → Maestro
  │    ├─ Web (React/Next.js) → Playwright
  │    └─ Camada de API → pytest + httpx (opcional)
  ├─ Data Log QA (captura + validação de eventos de analytics)
  │    ├─ Web → interceptação de rede do Playwright
  │    └─ Flutter → captura de log do dispositivo / proxy
  ├─ reporta o progresso (progress notifications do MCP)
  ├─ coleta e reporta os resultados (Allure / HTML Report)
  └─ trigger de CI/CD (GitHub Actions)
```

### Exemplo de fluxo completo

```
Telegram: "roda o teste de receita do fridgify"
    ↓
pilot-ai (julgamento do LLM)
  ├─ gera o YAML de caso de teste a partir do PRD
  ├─ YAML → gera o código de execução Playwright/Maestro
  └─ chama o MCP do sentinel-qa
       → save_tests({ app: "fridgify", tests: [...] })
       → run_tests({ app: "fridgify", suite: "recipe" })
            ↓ (progress: "executando teste 3/10...")
       → get_report({ app: "fridgify" })
       ↓
pilot-ai → envia o relatório pro Telegram
```

---

## 3. Ferramentas de Teste por Plataforma

### Motivo da escolha das ferramentas

| Plataforma | Ferramenta | Motivo |
|--------|------|------|
| Flutter (iOS/Android) | **Maestro** | Definição de teste baseada em YAML, fácil de disparar externamente via CLI, acesso a elementos nativos, open source e gratuito |
| Web React / Next.js | **Playwright** | Cross-browser, espera automática, suporte a TypeScript |
| Camada de API | **pytest + httpx** | Leve e rápido, adição opcional |

### Por que Maestro em vez de Patrol

| Critério | Patrol | Maestro |
|------|--------|---------|
| Forma de definir o teste | Código Dart | YAML (compatível naturalmente com geração por IA) |
| Integração com sistema externo | Tem CLI, mas o parsing do resultado é difícil | CLI + saída de resultado em JSON já embutida |
| Relatório JUnit/JSON | Não embutido (depende de Gradle/xcodebuild) | Suporte embutido |
| Eventos em tempo real | Não suportado | Dá pra acompanhar o progresso via stdout da CLI |
| Acesso a elemento nativo | Suportado | Suportado |
| Rebuild entre arquivos de teste | Necessário (lento) | Desnecessário |
| Custo | Gratuito (open source) | CLI gratuita (open source), Cloud é pago |
| CI/CD | Possível no GitHub Actions | Possível no GitHub Actions + opção Cloud |

> A definição de teste em YAML do Maestro é ideal para o pilot-ai gerar via LLM,
> e também é a mais adequada para o sentinel-qa executar externamente e coletar o resultado.

### Por que o Playwright não consegue testar Flutter/React Native

- **Web (React/Next.js)**: Playwright → Chromium DevTools Protocol → manipula o DOM diretamente ✅
- **Flutter nativo**: Playwright → Chromium DevTools Protocol → renderer Skia/Impeller (sem DOM) ❌
- O Flutter desenha pixels diretamente em um canvas em vez de usar DOM, então o Playwright não consegue reconhecer os elementos de UI

### Exemplos de código

```typescript
// Playwright — valida UI web + API ao mesmo tempo
await page.route('**/api/recipes', route => route.fulfill({ json: mockData }));
await page.click('button[data-testid="generate"]');
await expect(page.locator('.recipe-card')).toBeVisible();
```

```yaml
# Maestro — teste E2E de app Flutter (baseado em YAML)
appId: com.eodin.fridgify
---
- tapOn: "Adicionar ingrediente"
- inputText: "Ovo"
- tapOn: "Gerar receita"
- assertVisible: "Receita gerada"
```

```python
# pytest + httpx — teste puro de contrato de API
response = await client.post("/api/recipes", json={"ingredients": ["egg"]})
assert response.status_code == 200
```

### Referência: servidor oficial @playwright/mcp

O `@playwright/mcp` publicado pela Microsoft é um servidor MCP **para controle de navegador** (usado por agentes de IA para navegar na web).
O propósito é diferente do servidor MCP do sentinel-qa, que é **para execução de teste**, mas o pilot-ai pode usá-lo em conjunto para testes exploratórios ou coleta de snapshot do DOM.

---

## 4. Estrutura do Repositório

### Princípios básicos
- **Infraestrutura de QA independente de plataforma**: qualquer app novo só precisa ser registrado em `apps.yaml` para completar o onboarding
- O `sentinel-qa` é separado em um repositório independente
- Desenhado com a premissa de abertura como open source (minimizar dependência da marca Eodin)
- O sentinel-qa não chama o LLM diretamente (a lógica de IA é responsabilidade do pilot-ai)

### Ferramenta de monorepo
- **npm workspaces + turborepo**
- O npm já vem embutido no Node.js, então não precisa de instalação separada, minimizando a barreira de entrada para contribuidores open source
- O turborepo dá suporte a cache de build e execução paralela

```json
// package.json (raiz)
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

### Estrutura de diretórios

```
sentinel-qa/                   # repositório independente (open source)
  packages/
    mcp-server/                # servidor MCP (ponto de entrada) — comunicação stdio com o pilot-ai
    playwright-runner/         # runner de teste web (write-to-temp-file + child process)
    maestro-bridge/            # trigger de teste Flutter + coleta de resultado
    reporter/                  # relatório Allure + Slack/Telegram
  registry/
    apps.yaml                  # lista de apps registrados
    selectors/                 # mapa de seletores de UI por app
  .github/workflows/           # CI/CD
```

### Estrutura do pacote do servidor MCP (para publicação no npm)

```
packages/mcp-server/
  src/
    index.ts               # #!/usr/bin/env node + ponto de entrada do servidor
    tools/                 # handlers das tools do MCP
    schemas/               # schemas Zod (validação de input/output)
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

> O campo `bin` permite executar via `npx sentinel-qa`
> O `dist/index.js` gerado no build precisa obrigatoriamente do shebang `#!/usr/bin/env node`

### Forma de onboarding de um app

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

### Mapa de Selectors por App

```yaml
# registry/selectors/fridgify.yaml (para o Maestro)
add_ingredient_button: "Adicionar ingrediente"
generate_button: "Gerar receita"
recipe_card: "Receita gerada"

# registry/selectors/arden-web.yaml (para o Playwright)
add_ingredient_button: "button[data-testid='addIngredient']"
generate_button: "button[data-testid='generate']"
recipe_card: ".recipe-card"
```

Ao gerar código de teste, o pilot-ai consulta a tool `get_selectors` do sentinel-qa como referência.

---

## 5. Design do Servidor MCP

### Forma de transporte: stdio

Como o pilot-ai é um daemon Mac local, usa-se **transporte stdio**.
- O pilot-ai executa o sentinel-qa como um subprocess
- Troca mensagens JSON-RPC via stdin/stdout
- Não precisa de rede ou autenticação separada

> **Atenção**: proibido usar `console.log()`. O stdout é exclusivo para o stream JSON-RPC — poluí-lo quebra a comunicação.
> Todo log de debug deve sair via `console.error()` (stderr).

### Tools do MCP expostas pelo sentinel-qa

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "sentinel-qa", version: "1.0.0" });

// Gerenciamento de apps
server.registerTool("list_apps", {
  description: "Consulta a lista de apps registrados",
}, async () => ({
  content: [{ type: "text", text: JSON.stringify(apps) }],
}));

server.registerTool("get_selectors", {
  description: "Consulta o mapa de seletores de UI do app (usado como referência na geração de código de teste)",
  inputSchema: {
    app_id: z.string().describe("ID do app"),
  },
}, async ({ app_id }) => ({
  content: [{ type: "text", text: JSON.stringify(selectors) }],
}));

// Gerenciamento de testes
server.registerTool("save_tests", {
  description: "Salva o caso de teste/código gerado",
  inputSchema: {
    app_id: z.string().describe("ID do app"),
    test_cases: z.array(z.object({
      id: z.string(),
      title: z.string(),
      confidence: z.number(),
      status: z.enum(["approved", "pending"]),
      platform: z.array(z.enum(["flutter", "web"])),
      code: z.string().describe("Código de teste executável"),
    })),
  },
}, async ({ app_id, test_cases }) => ({
  content: [{ type: "text", text: `${test_cases.length} teste(s) salvo(s) com sucesso` }],
}));

server.registerTool("run_tests", {
  description: "Executa o teste de um app específico (pode levar bastante tempo, suporta notificação de progress)",
  inputSchema: {
    app_id: z.string().describe("ID do app"),
    suite: z.string().optional().describe("Nome da suíte de testes"),
    platform: z.enum(["web", "ios", "android"]).optional(),
  },
}, async ({ app_id, suite, platform }, { progressToken }) => {
  // usa notificação de progress para passar o estado intermediário da execução ao pilot-ai
  // o pilot-ai pode retransmitir isso para o Telegram
  return {
    content: [{ type: "text", text: JSON.stringify(testResult) }],
  };
}));

server.registerTool("get_report", {
  description: "Consulta o resumo do resultado de teste mais recente (o log detalhado é fornecido via resource link)",
  inputSchema: {
    app_id: z.string().describe("ID do app"),
  },
}, async ({ app_id }) => ({
  content: [
    { type: "text", text: JSON.stringify(summary) },
    { type: "resource_link", uri: `file:///reports/${app_id}/latest.html` },
  ],
}));
```

### Tratamento de operações longas (Progress & Cancellation)

Como a execução do teste pode levar vários minutos, usa-se o mecanismo oficial do MCP.

**Progress Notifications:**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 3,
    "total": 10,
    "message": "Executando: TC-003 mensagem de erro ao gerar sem ingredientes"
  }
}
```

**Cancellation:**
- Quando o pilot-ai envia `notifications/cancelled`, o child process do runner de teste é morto (kill)
- Os processos de navegador/emulador em execução são limpos

**Tratamento de resposta grande:**
- O resumo do resultado do teste vai direto em `content` (para o LLM parsear)
- Log detalhado, screenshot e arquivo de trace são fornecidos via `resource_link` (evita estourar o contexto do LLM)

### Configuração do pilot-ai

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

## 6. Padrão de Execução do Código de Teste

### Web (Playwright): padrão Write-to-Temp-File

O código Playwright gerado pelo pilot-ai não é executado via `eval()` diretamente.
Por segurança e estabilidade, é gravado em um arquivo temporário e executado como child process.

```
Código gerado pelo pilot-ai
    ↓
Enviado ao sentinel-qa via save_tests()
    ↓
sentinel-qa: grava o arquivo .spec.ts em um diretório temporário
    ↓
child_process.execSync("npx playwright test <temp-file> --reporter=json")
    ↓
Faz o parsing do resultado JSON → retorna a resposta estruturada
```

**Considerações de segurança:**
- Valida via parsing AST se só a API permitida do Playwright está sendo usada
- Cleanup depois de executar o arquivo temporário
- Limite de recursos (timeout, memória)
- Isolamento do contexto do navegador

### Flutter (Maestro): padrão de execução via CLI

Como o Maestro é baseado em YAML, a validação de segurança do código é relativamente mais simples.

```
YAML do Maestro gerado pelo pilot-ai
    ↓
Enviado ao sentinel-qa via save_tests()
    ↓
sentinel-qa: grava o arquivo .yaml em um diretório temporário
    ↓
child_process.execSync("maestro test <temp-file> --format json")
    ↓
Faz o parsing do resultado JSON → retorna a resposta estruturada
```

---

## 7. Data Log QA

Durante a execução do teste E2E, captura os eventos de analytics (Firebase Analytics, Amplitude, GA4, Mixpanel etc.) disparados pelo app e valida contra uma spec pré-definida, detectando eventos ausentes, disparos indevidos e erros de parâmetro.

### Por que isso é necessário

- Mesmo com a UI funcionando corretamente, se o evento de analytics ficar faltando, a equipe de dados sofre o prejuízo
- A validação manual tem custo alto e falhas frequentes
- Capturar simultaneamente ao teste E2E permite validar sem custo de execução adicional

### Forma de captura por plataforma

| Plataforma | Método de captura | Observação |
|--------|----------|------|
| Web (Playwright) | Intercepta requisições ao endpoint de analytics via `page.route()` / `page.on('request')` | GA4: `google-analytics.com/g/collect`, Amplitude: `api.amplitude.com`, etc. |
| Flutter (Maestro) | Captura de log do dispositivo (`adb logcat` / console do Xcode) ou proxy HTTP (mitmproxy) | Pode usar o Firebase Debug Mode |

### Definição da spec de eventos

Para cada app, a spec de eventos esperada é definida em YAML no diretório `registry/event-specs/`.

```yaml
# registry/event-specs/fridgify.yaml
events:
  - trigger: "Toque no botão de gerar receita"
    event_name: "generate_recipe"
    required_params:
      ingredient_count: number
      source: string
    optional_params:
      recipe_type: string

  - trigger: "Entrada na tela de resultado da receita"
    event_name: "view_recipe_result"
    required_params:
      recipe_id: string
      load_time_ms: number
```

### Fluxo de validação

```
Execução do teste E2E (Playwright / Maestro)
    ↓ simultaneamente
Captura de requisição de rede / log do dispositivo
    ↓
Parsing dos eventos capturados → estruturação
    ↓
Comparação (diff) contra o YAML da event-spec
    ↓
Geração do relatório de resultado
  ├─ ✅ Todos os eventos esperados disparados + parâmetros corretos
  ├─ ❌ Evento ausente (esperado mas não disparado)
  ├─ ⚠️ Evento inesperado (disparado mas fora da spec)
  └─ ❌ Divergência de parâmetro (tipo errado, parâmetro obrigatório faltando)
```

### Integração com a tool do MCP

Adiciona a opção `validate_events` em `run_tests` para ativar o Data Log QA.

```typescript
server.registerTool("run_tests", {
  inputSchema: {
    app_id: z.string(),
    suite: z.string().optional(),
    platform: z.enum(["web", "ios", "android"]).optional(),
    validate_events: z.boolean().optional().describe("Ativa o Data Log QA (padrão: false)"),
  },
  // ...
});
```

O resultado da validação do data log é incluído na resposta de `get_report`.

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

### Expansão do registry de apps

```yaml
# registry/apps.yaml
apps:
  - id: fridgify
    type: flutter
    context:
      selectors: ./selectors/fridgify.yaml
      event_spec: ./event-specs/fridgify.yaml    # spec do Data Log QA
```

---

## 8. Gerenciamento de Confiabilidade dos Testes (Sistema de Quarantine)

> Renumerado a partir da antiga seção 7

Como testes gerados por IA podem ser flaky, aplica-se um sistema de promoção em etapas.

### Ciclo de vida do teste

```
Teste novo (new)
    ↓ 5 execuções consecutivas
    ├─ 5/5 passou → stable (entra na suíte de testes regular)
    ├─ 3-4/5 passou → quarantine (isolado + aguardando revisão)
    └─ 0-2/5 passou → rejected (rejeitado, solicita nova geração ao pilot-ai)
```

### Gerenciamento de estado

```yaml
# tests/fridgify/status.yaml
tests:
  - id: TC-001
    status: stable        # 5/5 passou
    last_run: 2026-03-14
    pass_rate: 1.0

  - id: TC-003
    status: quarantine    # 3/5 passou, precisa de revisão
    last_run: 2026-03-14
    pass_rate: 0.6
    failure_reason: "Problema de timing — espera insuficiente pela resposta de rede"
```

### Integração com a tool do MCP

Por padrão, `run_tests` executa só os testes com status `stable`.
Testes em `quarantine` podem ser incluídos via uma opção separada.

---

## 9. Fluxo de Geração de Casos de Teste (lado do pilot-ai)

> Esta seção descreve o comportamento do pilot-ai e está fora do escopo de implementação do sentinel-qa.
> O sentinel-qa só recebe, salva e executa o resultado já gerado.

### Pipeline de geração em 2 passos (executado pelo pilot-ai)

```
Passo 1: PRD → YAML de caso de teste (cenário independente de plataforma, legível e revisável por humanos)
Passo 2: YAML + get_selectors() do sentinel-qa → código Playwright/Maestro executável
```

### Gerenciamento de qualidade do parsing do PRD

A qualidade é gerenciada incluindo um confidence score no caso de teste gerado.

```
PRD → geração via LLM do pilot-ai → rascunho do caso de teste (YAML)
                              ↓
                      inclui o confidence score
                              ↓
                ┌─ alto (≥0.8): aprovação automática
                └─ baixo (<0.8): aguarda revisão humana
```

### Exemplo de saída (YAML de caso de teste)

```yaml
test_cases:
  - id: TC-001
    title: "Retorna receita ao inserir 1 ingrediente"
    confidence: 0.92
    status: approved
    platform: [flutter]
    steps:
      - Abrir o app
      - Adicionar ingrediente (ex.: ovo)
      - Tocar no botão de gerar receita
    expected: "Exibe pelo menos 1 receita"

  - id: TC-002
    title: "Mensagem de erro ao gerar sem ingredientes"
    confidence: 0.85
    status: approved
    platform: [flutter, web]
    steps:
      - Abrir o app
      - Tocar no botão de gerar sem adicionar ingrediente
    expected: "Exibe mensagem de erro ou texto de orientação"

  - id: TC-003
    title: "Retry em caso de erro de rede"
    confidence: 0.55
    status: pending     # precisa de revisão humana
    platform: [flutter, web]
    steps:
      - Abrir o app
      - Gerar receita com a rede bloqueada
    expected: "Exibe aviso de erro e botão de tentar novamente"
```

---

## 10. Gerenciamento de Configuração de Ambiente

O sentinel-qa não precisa de chave de API de LLM. As únicas configurações necessárias são relacionadas ao ambiente de execução de teste.

```
sentinel-qa/
  .env.example          # commitado — lista só as chaves necessárias
  .env                  # uso local de desenvolvimento (gitignore)
```

```bash
# .env.example
SLACK_WEBHOOK_URL=        # notificação de relatório (opcional)
TELEGRAM_BOT_TOKEN=       # notificação de relatório (opcional)
```

> Chaves de LLM/serviços externos como `ANTHROPIC_API_KEY`, `NOTION_API_KEY` etc. são gerenciadas do lado do pilot-ai

---

## 11. Ordem de Desenvolvimento (Roadmap)

| Etapa | Conteúdo | Entregável |
|------|------|--------|
| Etapa 1 | Estrutura básica do servidor MCP + registry de apps + comunicação stdio | Pacote `mcp-server` |
| Etapa 2 | Runner de teste web Playwright (padrão write-to-temp-file) | Pacote `playwright-runner` |
| Etapa 3 | Validação da integração com o pilot-ai (E2E: comando → teste → resultado) | Configuração do pilot-ai |
| Etapa 4 | Bridge do Maestro → integração com app Flutter | Pacote `maestro-bridge` |
| Etapa 5 | Data Log QA (captura de eventos de analytics + validação de spec) | `mcp-server` + expansão do runner |
| Etapa 6 | Gerenciamento de confiabilidade dos testes (sistema de quarantine) | Expansão do `mcp-server` |
| Etapa 7 | Relatório + notificação no Telegram | Pacote `reporter` |
| Etapa 8 | Integração de CI/CD com GitHub Actions | `.github/workflows/` |
| Etapa 9 | Abertura como open source (README, CONTRIBUTING, LICENSE) | Repositório público no GitHub |

> Ao concluir a Etapa 1, a comunicação básica via servidor MCP já funciona
> Ao concluir a Etapa 3, o fluxo completo "roda o teste" pelo pilot-ai → execução → retorno do resultado já funciona

---

## 12. Resumo do Formato de Deploy

| Componente | Formato | Observação |
|---------|------|------|
| sentinel-qa | Monorepo npm (npm workspaces + turborepo) | Funciona como servidor MCP |
| Execução de teste web | Playwright (child process) | Padrão write-to-temp-file |
| Execução de teste Flutter | CLI do Maestro (child process) | Baseado em YAML, saída de resultado em JSON |
| CI/CD | GitHub Actions | Web: Playwright Docker, Flutter: Maestro + Emulador |
| Integração com o pilot-ai | Servidor MCP (stdio) | Chamado como subprocess a partir do daemon do pilot-ai |
| Relatório | Allure + hospedagem estática no S3 | No início, HTML local já é suficiente |

---

## 13. Cuidados na Implementação do Servidor MCP

| Item | Descrição |
|------|------|
| Proibido poluir o stdout | Proibido usar `console.log()`; todo log deve sair via `console.error()` (stderr) |
| Shebang obrigatório | Primeira linha de `dist/index.js` precisa ser `#!/usr/bin/env node` |
| ESM obrigatório | `"type": "module"` + o SDK do TypeScript usa deep imports |
| Validação de input | Todo input de tool é validado com schema Zod (não confia no input do LLM) |
| Distinção de erro | Separar erro de protocolo (JSON-RPC) de erro de negócio (`isError: true`) |
| Resposta grande | Log detalhado vai separado via `resource_link`, só o resumo entra no content |
| cancellation | Ao receber `notifications/cancelled`, mata o child process + faz cleanup |
| rate limiting | Evita envio excessivo de notificações de progress |

---

## 14. Pontos em Aberto / Próximos Temas de Discussão

- [ ] Escolher o primeiro app alvo para validação (Fridgify web? Tempy?)
- [ ] Definir a fonte do PRD (integração com a API do Notion vs. arquivo Markdown)
- [ ] Definir o momento de abrir o repositório no GitHub e escolher a licença (MIT recomendado)
- [ ] Ambiente de execução dos testes do Maestro (simulador local vs. emulador de CI)
- [ ] Forma de hospedar os relatórios (S3, GitHub Pages etc.)
- [ ] Data Log QA: definir a lista de SDKs de analytics suportados (Firebase, Amplitude, GA4 etc.)
- [ ] Data Log QA: definir o método de captura de eventos no Flutter (adb logcat vs. proxy HTTP vs. Firebase Debug View)
