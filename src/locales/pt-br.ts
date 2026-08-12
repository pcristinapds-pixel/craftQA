// Portuguese (Brazil) translation of every message sentinel-qa shows to a
// human. This file must have exactly the same shape as en.ts — the
// `satisfies Messages` at the bottom makes the TypeScript compiler check
// that for us, so if a new message is added to en.ts and forgotten here,
// `npm run build` will fail with a clear error instead of silently showing
// English text to a pt-BR user.
//
// Translation notes for future editors:
// - Code identifiers (function names, variable names, file paths like
//   "registry/apps.yaml") are never translated — only the human sentences.
// - Well-established technical terms (Pull Request/PR, diff, branch, AST,
//   pipeline, token, build, setup, output, payload, etc.) are kept as-is,
//   the way most Brazilian developers actually say them.

import type { Messages } from './en.js';

export const ptBr = {
  cli: {
    description: 'Agente de QA autônomo',
    usageLabel: 'Uso:',
    optionsLabel: 'Opções:',
    appOptionDescription: 'ID do app no registry/apps.yaml (obrigatório)',
    prOptionDescription: 'Número do PR do GitHub',
    baseBranchOptionDescription: 'Branch base para o diff (padrão: main)',
    diffOptionDescription: 'Referência de diff do Git (ex.: HEAD~1)',
    validateEventsOptionDescription: 'Habilita o data log QA',
    prdOptionDescription: 'Caminho para o arquivo de PRD',
    configOptionDescription: 'Caminho para o diretório de configuração',
    helpOptionDescription: 'Exibe esta mensagem de ajuda',
    missingAppOption: 'Opção obrigatória ausente: --app <id>',
    agentFailed: 'O agente falhou com o seguinte erro:',
  },
  report: {
    title: (appId) => `# Relatório de Testes: ${appId}`,
    fieldColumn: 'Campo',
    valueColumn: 'Valor',
    appLabel: 'App',
    suiteLabel: 'Suíte',
    platformLabel: 'Plataforma',
    timestampLabel: 'Data/Hora',
    durationLabel: 'Duração',
    summaryHeading: '## Resumo',
    totalColumn: 'Total',
    passedColumn: 'Aprovados',
    failedColumn: 'Reprovados',
    timedOutColumn: 'Tempo Esgotado',
    skippedColumn: 'Ignorados',
    allPassed: '**Resultado: TODOS APROVADOS**',
    failureCount: (count) => `**Resultado: ${count} FALHA(S)**`,
    testDetailsHeading: '## Detalhes dos Testes',
    indexColumn: '#',
    idColumn: 'ID',
    titleColumn: 'Título',
    statusColumn: 'Status',
    failuresHeading: '## Falhas',
    statusDetailLabel: 'Status',
    durationDetailLabel: 'Duração',
    errorLabel: 'Erro',
    screenshotLabel: 'Captura de Tela',
    statusPassed: 'APROVADO',
    statusFailed: 'REPROVADO',
    statusTimedOut: 'TIMEOUT',
    statusSkipped: 'IGNORADO',
    eventValidationHeading: '## Validação de Eventos (Data Log QA)',
    expectedColumn: 'Esperado',
    matchedColumn: 'Correspondido',
    missingColumn: 'Ausente',
    paramErrorsColumn: 'Erros de Parâmetro',
    unexpectedColumn: 'Inesperado',
    eventAllMatched: '**Validação de Eventos: TUDO CORRESPONDIDO**',
    eventIssuesFound: '**Validação de Eventos: PROBLEMAS ENCONTRADOS**',
    eventResultsHeading: '### Resultados dos Eventos',
    eventColumn: 'Evento',
    triggerColumn: 'Gatilho',
    eventStatusMatched: 'CORRESPONDIDO',
    eventStatusMissing: 'AUSENTE',
    eventStatusParamError: 'ERRO_DE_PARAMETRO',
    parameterErrorsHeading: '### Erros de Parâmetro',
    parameterColumn: 'Parâmetro',
    gotColumn: 'Obtido',
    unexpectedEventsHeading: '### Eventos Inesperados',
    paramsColumn: 'Parâmetros',
    footer: (timestamp) => `*Gerado pelo sentinel-qa em ${timestamp}*`,
  },
  config: {
    loadedFrom: (path) => `Configuração carregada de ${path}`,
  },
  registry: {
    appsFileNotFound: (path) => `apps.yaml não encontrado em ${path}`,
    loaded: (count) => `${count} app(s) carregado(s) do registry`,
    selectorFileNotFound: (path) => `Arquivo de seletores não encontrado: ${path}`,
    eventSpecFileNotFound: (path) => `Arquivo de spec de eventos não encontrado: ${path}`,
  },
  store: {
    saved: (count, appId) => `${count} status(es) de teste salvo(s) para ${appId}`,
  },
  reportStore: {
    saved: (path) => `Relatório salvo: ${path}`,
  },
  agentPipeline: {
    stageAnalyze: 'Etapa 1: Análise — coletando contexto...',
    stagePlan: 'Etapa 2: Planejamento — gerando casos de teste...',
    noTestsGenerated: 'Nenhum teste gerado. Nada a executar.',
    noTestsGeneratedReportBody: 'Nenhum teste foi gerado para este PR.',
    testsGenerated: (count) => `${count} teste(s) gerado(s)`,
    stageExecute: 'Etapa 3: Execução — executando os testes...',
    flutterNotImplemented: 'Execução Flutter/Patrol ainda não implementada. Pulando os testes Flutter.',
    stageReport: 'Etapa 4: Relatório — gerando o relatório...',
    testValidationFailed: (testId, errors) => `O teste ${testId} falhou na validação: ${errors}`,
  },
  analyzer: {
    appNotFound: (appId) => `App "${appId}" não encontrado no registry`,
    complete: ({ diffLength, prdLength, selectorsLoaded, eventSpecsLoaded, existingTestsCount }) =>
      `Análise concluída: diff=${diffLength} caracteres, prd=${prdLength} caracteres, ` +
      `seletores=${selectorsLoaded ? 'carregado' : 'nenhum'}, ` +
      `specs de eventos=${eventSpecsLoaded ? 'carregado' : 'nenhum'}, ` +
      `testes existentes=${existingTestsCount}`,
    diffFailedFallback: (diffRef) => `git diff falhou para "${diffRef}", usando HEAD~1 como alternativa`,
    diffFallbackFailed: 'git diff HEAD~1 também falhou, retornando diff vazio',
    noPrdPath: 'Nenhum caminho de PRD especificado, pulando o carregamento do PRD',
    prdFileNotFound: (path) => `Arquivo de PRD não encontrado: ${path}`,
  },
  planner: {
    generating: 'Gerando casos de teste via LLM...',
    noTestsReturned: 'O LLM não retornou nenhum teste',
    generatedRunningCritique: (count) => `${count} teste(s) gerado(s). Executando autocrítica...`,
    critiqueComplete: (count) => `Autocrítica concluída: ${count} teste(s) após revisão`,
    critiqueEmpty: 'A autocrítica retornou resultado vazio, usando os testes originais',
    critiqueFailed: 'A autocrítica falhou, usando os testes originais:',
    parseFailed: 'Falha ao interpretar a resposta do LLM como PlannedTest[]:',
  },
  llmClient: {
    tokenBudgetExceeded: (consumed, max) =>
      `Orçamento de tokens excedido: ${consumed} >= ${max}. ` +
      'Aumente cost.max_tokens_per_run na configuração para continuar.',
    calling: (model) => `Chamando a API da Claude (modelo: ${model})...`,
    response: (input, output, total) =>
      `Resposta da API da Claude: ${input} tokens de entrada + ${output} de saída (total: ${total})`,
  },
} satisfies Messages;
