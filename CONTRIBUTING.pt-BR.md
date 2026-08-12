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
3. **Testar** — `npm run test` e corrigir falhas
4. **Commit** — Somente após o build e os testes passarem

## Estilo de Código

- **Apenas ESM** — `"type": "module"`, use extensão `.js` nos imports
- **Nada de `console.log()`** — o stdout é o stream JSON-RPC. Use `console.error()` via `src/utils/logger.ts`
- **Zod 3.x** — Não faça upgrade para o Zod 4 (compatibilidade com o MCP SDK)
- **Mensagens exibidas ao usuário** — Devem estar em inglês por padrão. A tradução para Português do Brasil é servida via `SENTINEL_LOCALE=pt-BR`, usando os dicionários em `src/locales/` — nunca escreva texto em português direto no código
- **TypeScript strict mode** — Todos os pacotes usam `strict: true`

## Estrutura do Projeto

- `packages/mcp-server/` — Servidor MCP principal
- `packages/playwright-runner/` — Runner de testes web com Playwright
- `packages/maestro-bridge/` — Bridge de testes Flutter com Maestro
- `registry/` — Configuração de apps e specs

## Adicionando uma Nova Ferramenta MCP

1. Crie `packages/mcp-server/src/tools/<nome>.ts`
2. Exporte uma função `register<Nome>(server, ...deps)`
3. Adicione o schema Zod de input em `src/schemas/tools.ts`
4. Conecte em `src/index.ts`
5. Adicione testes

## Rodando os Testes

```bash
npm run test                    # Todos os pacotes
npm run test -w packages/mcp-server  # Pacote específico
node scripts/verify-mcp-flow.mjs     # Verificação E2E
```

## Enviando Mudanças

1. Crie uma branch a partir de `main`
2. Faça suas alterações seguindo o fluxo acima
3. Abra um Pull Request com uma descrição clara
4. Garanta que o CI passe

## Reportando Problemas

Use as [GitHub Issues](https://github.com/eodin/sentinel-qa/issues) informando:
- Passos para reproduzir
- Comportamento esperado vs. observado
- Versão do Node.js e sistema operacional
