# Guia de Integração sentinel-qa × pilot-ai

> Data: 2026-03-14
> Público-alvo: equipe de desenvolvimento do pilot-ai

---

## 1. Visão Geral

O sentinel-qa é a infraestrutura de execução de QA do pilot-ai.
Quando o pilot-ai gera casos de teste a partir do PRD, o sentinel-qa executa esses testes via Playwright (web) / Maestro (Flutter) e retorna o resultado.

```
pilot-ai (LLM) ──stdio──▶ sentinel-qa (servidor MCP)
                              ├─ Playwright (E2E web)
                              ├─ Maestro (Flutter, planejado)
                              └─ Data Log QA (validação de analytics, planejado)
```

---

## 2. Configuração do Servidor MCP

### Ambiente de desenvolvimento (build local)

Clone o repositório do sentinel-qa, faça o build e registre o caminho local.

```bash
git clone https://github.com/eodin/sentinel-qa.git
cd sentinel-qa
npm install
npm run build
```

Adicione em `~/.pilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "sentinel-qa": {
      "command": "node",
      "args": ["/absolute/path/to/sentinel-qa/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Produção (após o npm publish)

Depois da publicação no npm, execute via `npx`.

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

### Variáveis de ambiente

O sentinel-qa **não precisa de nenhuma chave de API**. Variáveis de ambiente opcionais:

| Variável | Descrição | Padrão |
|------|------|--------|
| `SENTINEL_REGISTRY_DIR` | Caminho do diretório do registry de apps | `registry/` dentro do sentinel-qa |
| `SENTINEL_REPORTS_DIR` | Caminho do diretório de armazenamento dos relatórios | `reports/` dentro do sentinel-qa |
| `DEBUG` | Habilita o log de debug | (não definido) |

### Estrutura de armazenamento dos relatórios

Ao executar `run_tests`, o relatório em Markdown + JSON é gerado automaticamente.

```
reports/
  <app_id>/
    <timestamp>/
      report.md        # relatório em Markdown (formato legível para humanos)
      result.json      # resultado bruto em JSON (para consumo programático)
```

Exemplo:
```
reports/
  arden-web/
    2026-03-14T10-30-00-000Z/
      report.md
      result.json
    2026-03-14T14-15-22-123Z/
      report.md
      result.json
  fridgify/
    2026-03-14T11-00-00-000Z/
      report.md
      result.json
```

O diretório `reports/` está no `.gitignore`, então não é commitado.

---

## 3. Especificação das Tools do MCP

O sentinel-qa disponibiliza 5 tools do MCP.

### 3.1. `list_apps`

Retorna a lista de apps registrados.

**Input**: nenhum

**Output** (exemplo):
```json
[
  { "id": "fridgify", "type": "flutter", "repo": "github.com/eodin/fridgify" },
  { "id": "arden-web", "type": "web", "url": "https://arden.app" }
]
```

### 3.2. `get_selectors`

Retorna o mapa de seletores de UI por app. Usado como referência na geração de código de teste.

**Input**:
```json
{ "app_id": "arden-web" }
```

**Output** (exemplo):
```json
{
  "add_ingredient_button": "button[data-testid='addIngredient']",
  "generate_button": "button[data-testid='generate']",
  "recipe_card": ".recipe-card"
}
```

### 3.3. `save_tests`

Salva os casos de teste gerados no sentinel-qa.

**Input**:
```json
{
  "app_id": "arden-web",
  "test_cases": [
    {
      "id": "TC-001",
      "title": "Load home page",
      "confidence": 0.95,
      "status": "approved",
      "platform": ["web"],
      "code": "import { test, expect } from '@playwright/test';\n\ntest('home page', async ({ page }) => {\n  await page.goto('https://example.com');\n  await expect(page.locator('h1')).toBeVisible();\n});"
    }
  ]
}
```

**Campos de test_cases**:

| Campo | Tipo | Descrição |
|------|------|------|
| `id` | string | ID único do teste (ex.: TC-001) |
| `title` | string | Título do teste |
| `confidence` | number (0-1) | Score de confiança da geração pelo LLM |
| `status` | `"approved"` \| `"pending"` | Status de aprovação |
| `platform` | `("flutter" \| "web")[]` | Plataforma alvo |
| `code` | string | **Código de teste executável** (ver as regras de código abaixo) |

### 3.4. `run_tests`

Executa os testes salvos. Na plataforma web, a execução é feita via Playwright.

**Input**:
```json
{
  "app_id": "arden-web",
  "suite": "recipe",
  "platform": "web"
}
```

| Campo | Tipo | Descrição |
|------|------|------|
| `app_id` | string | Obrigatório. ID do app |
| `suite` | string? | Opcional. Nome da suíte de testes (para filtragem) |
| `platform` | `"web"` \| `"ios"` \| `"android"`? | Opcional. Se não informado, detecta automaticamente pelo tipo do app |

**Output** (exemplo):
```json
{
  "app_id": "arden-web",
  "suite": "all",
  "platform": "web",
  "total": 2,
  "passed": 1,
  "failed": 1,
  "skipped": 0,
  "timedOut": 0,
  "duration": 3500,
  "tests": [
    {
      "id": "TC-001",
      "title": "home page loads",
      "status": "passed",
      "duration": 1200
    },
    {
      "id": "TC-002",
      "title": "recipe generation",
      "status": "failed",
      "duration": 2300,
      "error": "Expected element to be visible",
      "screenshotPath": "/tmp/screenshot-1.png"
    }
  ],
  "report_path": "/path/to/sentinel-qa/reports/arden-web/2026-03-14T10-30-00-000Z/report.md"
}
```

> Ao executar `run_tests`, o relatório em Markdown é gerado automaticamente, e o caminho do arquivo vem em `report_path`.

### 3.5. `get_report`

Retorna o relatório em Markdown do resultado de teste mais recente.

**Input**:
```json
{ "app_id": "arden-web" }
```

**Output** (exemplo):

O primeiro item de `content` é o resumo em JSON, o segundo é o corpo do relatório em Markdown.

```json
{
  "app_id": "arden-web",
  "report_path": "/path/to/reports/arden-web/2026-03-14T10-30-00-000Z/report.md",
  "summary": {
    "total": 2,
    "passed": 1,
    "failed": 1,
    "skipped": 0,
    "timedOut": 0,
    "duration": 3500,
    "timestamp": "2026-03-14T10-30-00-000Z"
  }
}
```

Se não houver relatório, retorna `"status": "no reports available"`.

---

## 4. Regras de Escrita do Código de Teste

O código de teste que o pilot-ai coloca no campo `code` de `save_tests` precisa seguir estas regras.

### Permitido

- Import do módulo `@playwright/test` (`test`, `expect`, `Page`, etc.)
- API do Playwright (`page.goto`, `page.click`, `page.locator`, `expect`, etc.)

### Proibido (bloqueado pela validação de código)

| Padrão | Motivo |
|------|------|
| `eval()`, `Function()` | Previne code injection |
| `require()` | Só ESM é permitido |
| Import de `child_process`, `fs`, `net`, `vm`, `worker_threads` | Bloqueia acesso ao sistema |
| `process.exit()`, `process.kill()`, `process.env` | Bloqueia controle do processo |
| Import de módulos fora de `@playwright` | Bloqueia dependência não permitida |
| `import()` dinâmico (fora do Playwright) | Bloqueia carregamento dinâmico de módulo |

**Exemplo de código válido:**
```typescript
import { test, expect } from '@playwright/test';

test('recipe generation', async ({ page }) => {
  await page.goto('https://arden.app');
  await page.click("button[data-testid='addIngredient']");
  await page.fill("input[data-testid='ingredientInput']", 'egg');
  await page.click("button[data-testid='generate']");
  await expect(page.locator('.recipe-card')).toBeVisible();
});
```

---

## 5. Fluxo Completo de Chamadas

Fluxo recomendado quando o pilot-ai recebe o comando "rodar os testes":

```
1. list_apps()
   → confirma o app alvo (fridgify, arden-web etc.)

2. get_selectors({ app_id: "arden-web" })
   → obtém o mapa de seletores de UI

3. [LLM do pilot-ai] gera o código de teste do Playwright a partir do PRD + seletores

4. save_tests({ app_id: "arden-web", test_cases: [...] })
   → salva o código de teste gerado no sentinel-qa

5. run_tests({ app_id: "arden-web", platform: "web" })
   → executa o teste no Playwright (leva de alguns segundos a minutos)

6. get_report({ app_id: "arden-web" })
   → confirma o resumo do resultado (depois que a Etapa 7 estiver implementada)

7. [pilot-ai] reporta o resultado via Telegram/Slack
```

---

## 6. Validação da Integração

O fluxo completo pode ser testado com o script de validação incluído no repositório do sentinel-qa.

```bash
cd sentinel-qa
npm run build
node scripts/verify-mcp-flow.mjs
```

Saída esperada:
```
[1. initialize]          PASS
[2. list_apps]           PASS
[3. get_selectors]       PASS
[4. save_tests]          PASS
[5. run_tests (web)]     PASS
[6. get_report (stub)]   PASS

Results: 6 passed, 0 failed
```

---

## 7. Guia de Resposta do pilot-ai em Atualizações do sentinel-qa

### Classificação das atualizações

As mudanças do sentinel-qa são classificadas em 3 níveis:

| Nível | Exemplo | Resposta necessária do pilot-ai |
|------|------|---------------|
| **Patch (não destrutiva)** | Correção de bug, melhoria de performance, refactor interno | **Nenhuma ação necessária**. Só refazer o build |
| **Minor (compatível)** | Nova tool adicionada, campo opcional adicionado a uma tool existente | **Ação opcional**. Só precisa mexer no código do pilot-ai se quiser usar a nova funcionalidade |
| **Major (destrutiva)** | Remoção de tool, renomeação de campo, novo campo obrigatório | **Ação obrigatória**. Precisa alterar o código do pilot-ai |

### Procedimento de atualização

#### Ambiente de desenvolvimento local

```bash
cd sentinel-qa
git pull
npm install
npm run build
# → refletido automaticamente ao reiniciar o pilot-ai (o caminho no mcp-config.json aponta pro resultado do build)
```

#### Ambiente publicado no npm

```bash
# Lado do sentinel-qa
cd sentinel-qa
npm version patch  # ou minor, major
npm publish

# Lado do pilot-ai
# O npx usa a versão mais recente automaticamente, sem ação extra necessária
# Mas pode ser preciso atualizar o cache do npx:
npx --yes sentinel-qa@latest
```

### Checklist de resposta a mudanças destrutivas

Itens que a equipe do pilot-ai deve conferir quando uma mudança destrutiva acontecer no sentinel-qa:

1. **Conferir o `CHANGELOG.md`** — identificar quais tools/campos mudaram
2. **Conferir mudanças no schema Zod** — checar o schema de input em `packages/mcp-server/src/schemas/tools.ts`
3. **Ajustar o código do pilot-ai** — atualizar os pontos do prompt do LLM que chamam as tools do sentinel-qa
4. **Rodar o script de validação** — confirmar a integração com `node scripts/verify-mcp-flow.mjs`
5. **Teste de regressão** — confirmar o fluxo completo de "rodar os testes" no pilot-ai

### Princípios de gerenciamento de compatibilidade de versão

- O sentinel-qa segue **Semantic Versioning (semver)**
- Toda mudança destrutiva vem obrigatoriamente acompanhada de um **bump de versão major**
- Antes de uma mudança destrutiva, um **aviso de deprecation** é adicionado primeiro (mantido por pelo menos 1 versão minor)
- É possível fixar uma versão estável especificando a versão do npmPackage do sentinel-qa no `mcp-registry.ts` do pilot-ai:
  ```typescript
  {
    id: 'sentinel-qa',
    npmPackage: 'sentinel-qa@^0.2.0', // atualização automática dentro do range major
  }
  ```

### Compatibilidade em nível de protocolo MCP

Mudanças no protocolo MCP em si são raras, mas se acontecerem:
- Tanto o sentinel-qa quanto o pilot-ai precisam alinhar a versão do `@modelcontextprotocol/sdk`
- Se o campo `protocolVersion` (atualmente `2024-11-05`) mudar, os dois lados precisam ser atualizados

---

## 8. Roadmap Futuro (impacto no pilot-ai)

| Etapa | Mudança no sentinel-qa | Impacto no pilot-ai |
|------|-----------------|---------------|
| Etapa 4: Bridge do Maestro | `run_tests` passa a executar de verdade com `platform: "ios"/"android"` | pilot-ai precisa adicionar a lógica de geração de código YAML do Maestro |
| Etapa 5: Data Log QA | Adiciona a opção `validate_events` em `run_tests` | pilot-ai passa a enviar a opção de ativação da validação de eventos |
| Etapa 6: Quarantine | Adiciona a opção `include_quarantine` em `run_tests` | pilot-ai decide se inclui os testes em quarantine |
| Etapa 7: Reporter | Remove o stub de `get_report`, passa a retornar o relatório real | pilot-ai implementa o parsing do relatório e o envio para o Telegram |

---

## 9. Contato

- Issues do sentinel-qa: https://github.com/eodin/sentinel-qa/issues
- Slack interno: #sentinel-qa
