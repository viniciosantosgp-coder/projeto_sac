# SAC — Grupo Presença (Angular)

Migração do arquivo único `SAC.html` para uma aplicação Angular 19 (standalone components + signals).
Mesmo Firestore, mesmo esquema de dados, mesmas regras de SLA e de status — nada de migração de banco.

## Rodar localmente

```bash
npm install
npm start            # http://localhost:4200
```

## Publicar no Firebase Hosting

```bash
npm install
npm run build        # gera dist/sac/browser
firebase deploy --only hosting,firestore:rules --project presenca26
```

O `firebase.json` já aponta o Hosting para `dist/sac/browser`, com `no-cache` no index e
cache longo nos arquivos com hash.

## Estrutura

```
src/app/
  core/
    constantes.ts        produtos, motivos, gravidades, prazos de SLA, config do Firebase
    modelos.ts           tipos do documento `reclamacoes`
    dominio.ts           regras puras: status, SLA, pacotes gravados, backfill
    metricas.ts          apurações: por registro, por atuação (esteira) e SLA por gravidade
    api.service.ts       chamadas à API da Presença (login / validação de sessão)
    sessao.service.ts    guarda de acesso: token, revalidação e encerramento
    chamados.service.ts  Firestore: leitura, normalização, transições, observações
    excel.service.ts     exportação (5 abas + gráficos) e CSV de contingência
    tema.service.ts      modo claro/escuro
    sessao.guard.ts      rotas protegidas (dashboard exige visão geral)
  features/
    login/               tela de entrada
    shell/               cabeçalho e navegação
    chamados/            lista, fila, filtros, modais de novo chamado e detalhe
    dashboard/           indicadores, SLA por gravidade, produção e gráfico de rosca
```

## Decisões que vieram da versão anterior

- **Status em 3 estados** gravados como `Aberto` / `Pendente` / `Resolvida`; os rótulos de tela
  ("Chamado aberto", "Em tratativa") não vão para o banco.
- **SLA por gravidade** (Crítica 1d · Alta 2d · Média 5d · Baixa 7d), com prazo e vencimento
  gravados no chamado e congelados na resolução.
- **Backfill automático** na primeira leitura da coleção, em lotes de 400.
- **Produção separada** entre quem registrou e quem atuou na esteira.
- **Sessão**: nada é lido ou gravado sem token válido; `401`/`403` derrubam, `404`/`5xx`/rede não.

## Ajuste necessário

`src/app/core/constantes.ts` → `API_ROTA_SESSAO` deve apontar para a rota real de validação de
token da API (hoje `'/me'`).
