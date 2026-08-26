# Contribuindo com o sentinel-qa

> Este documento é a tradução para Português do Brasil de [CONTRIBUTING.md](CONTRIBUTING.md). Em caso de divergência, o arquivo em inglês é a referência oficial.

Obrigado pelo interesse em contribuir com o sentinel-qa!

## Primeiros Passos

1. Faça um fork e clone o repositório
2. Instale as dependências: `npm install`
3. Build: `npm run build`
4. Rode os testes: `npm run test`

## Fluxo de Desenvolvimento

Siga sempre esta sequência:

1. **Desenvolver** — Escrever/editar código
2. **Build** — `npm run build` e corrigir erros de compilação
3. **Code review** — Revisar a mudança quanto a clean code, segurança e data flow
4. **Testar** — `npm run test` e corrigir falhas
5. **Atualizar o checklist** — Marcar os itens concluídos em `docs/agent/sentinel-qa-checklist.md`
6. **Commit** — Somente após os passos 1–5 passarem

Veja o [CLAUDE.md](CLAUDE.md) para o conjunto completo de convenções do projeto.

## Estilo de Código

- **Apenas ESM** — `"type": "module"`, use extensão `.js` nos imports (mesmo para arquivos `.ts`)
- **Zod 3.x** — Não faça upgrade para o Zod 4
- **Mensagens exibidas ao usuário** — Usam inglês por padrão; a tradução para pt-BR fica em `src/locales/` e é opt-in via `SENTINEL_LOCALE=pt-BR`. Adicione novas strings aos dicionários de locale em vez de deixá-las hardcoded no ponto de uso
- **TypeScript strict mode** — `strict: true`
- **Segurança de caminho** — IDs fornecidos pelo usuário que chegam a um caminho de arquivo precisam passar por `sanitizeId()` (`src/utils/sanitize.ts`)

## Estrutura do Projeto

- `src/agent/` — analyzer, planner, prompts, llm-client, orquestrador
- `src/runners/` — execução de teste via Playwright (web) e Maestro/Patrol (Flutter)
- `src/event-validation/` — padrões de captura de analytics + validação de spec (data log QA)
- `src/registry/` — loader do registry de apps (`registry/apps.yaml`, seletores, event specs)
- `src/report/` — renderização do relatório em Markdown + armazenamento de relatórios
- `src/store/` — rastreamento de status de teste / quarantine
- `src/config/` — loader de configuração YAML
- `src/locales/` — dicionários de mensagens de i18n (padrão inglês, pt-BR opt-in)
- `src/triggers/` — pontos de entrada (CLI hoje; GitHub Actions planejado)
- `registry/` — configuração de apps e specs consumidas em runtime

## Adicionando Suporte a um Novo App

1. Adicione uma entrada em `registry/apps.yaml` (use as entradas existentes `example-web` / `example-flutter` como modelo)
2. Adicione um mapa de seletores em `registry/selectors/<app-id>.yaml`
3. Opcionalmente, adicione uma event spec em `registry/event-specs/<app-id>.yaml` para o data log QA
4. Rode `npx sentinel-qa run --app <app-id> --diff HEAD~1` para validar

## Rodando os Testes

```bash
npm run build            # os testes rodam contra o código já compilado em dist/
npm run test             # roda tudo dentro de dist/__tests__/
```

## Enviando Mudanças

1. Crie uma branch a partir de `main`
2. Faça suas alterações seguindo o fluxo acima
3. Abra um Pull Request com uma descrição clara
4. Garanta que o CI passe

## Reportando Problemas

Use as [GitHub Issues](https://github.com/pcristinapds-pixel/craftQA/issues) informando:
- Passos para reproduzir
- Comportamento esperado vs. observado
- Versão do Node.js e sistema operacional
