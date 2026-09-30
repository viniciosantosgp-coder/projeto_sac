# Guia do projeto SAC

Este guia explica como o projeto é organizado, o que foi feito em 30/09/2026
para recuperar a versão perdida, como funciona a função nova de "SLA estourado"
e como trabalhar no código daqui pra frente.

---

## 1. O que aconteceu (e por que o GitHub estava desatualizado)

O site `https://sac-presenca.web.app` é publicado no **Firebase Hosting** com o
comando `firebase deploy`. Esse comando pega a pasta compilada (`dist/sac/browser`)
**direto do computador** e manda para o Firebase — ele não passa pelo GitHub.

Por isso a versão de 22/09 estava no ar, mas o GitHub tinha só a de 25/08: o
código foi publicado da máquina antiga e nunca foi enviado (`git push`) ao GitHub.

> **Regra de ouro daqui pra frente:** sempre que for publicar, faça antes
> `git commit` + `git push`. Assim o GitHub sempre tem o que está no ar.

---

## 2. Como a versão de 22/09 foi recuperada

O Firebase não guarda o código-fonte, só o resultado compilado (JavaScript
"minificado": tudo numa linha, com nomes de variáveis trocados por letras).
O caminho foi:

1. **Baixar o site publicado.** Os arquivos do Hosting são públicos: baixei o
   `index.html` e todos os `chunk-*.js` que ele carrega.
2. **Guardar uma cópia intacta.** Os arquivos estão na pasta `backup-build-no-ar/`
   e na branch `backup/versao-no-ar-2026-09-22` do GitHub. Se tudo der errado,
   dá para republicar exatamente o que estava no ar (veja o `LEIAME.md` da pasta).
3. **Compilar o código do GitHub** (`ng build`) e comparar com o do ar, parte por parte,
   procurando textos e estruturas que só existiam num dos lados.
4. **Formatar o código do ar** (com `prettier`) para ficar legível e ler as partes
   que mudaram.
5. **Reescrever essas partes em TypeScript** e compilar de novo até os tamanhos
   baterem com os do ar.

### O que existia no ar e não estava no GitHub

| Mudança | Onde ficou no código |
|---|---|
| Painel **"Minhas notas"** (anotações pessoais de cada atendente, coleção `notas_sac` no Firestore) | `src/app/core/notas.service.ts` e `src/app/features/chamados/notas-painel.component.ts` |
| Botão **"Notas"** com contador na tela de Chamados | `src/app/features/chamados/chamados.component.ts` |
| Botão "Atualizar" do dashboard com ícone girando e "Atualizado às HH:mm:ss" | `src/app/features/dashboard/dashboard.component.ts` |
| Caixa vermelha explicando quando o Excel falha e cai para CSV | `dashboard.component.ts` |
| **Excel redesenhado**: aba "Visão Geral" com faixa laranja, gráficos de barras, "Média por dia", rodapé "Página X de Y · Confidencial", abas coloridas, impressão ajustada | `src/app/core/excel.service.ts` |

> A reconstrução foi feita lendo o código compilado — é fiel no comportamento,
> mas não é uma cópia letra por letra do original.

---

## 3. Como o projeto está organizado

É um app **Angular 19** (componentes "standalone" e *signals*) com **Tailwind** para
o visual e **Firebase Firestore** como banco.

```
src/
  index.html, main.ts, styles.css      ← ponto de partida e estilos globais
  app/
    app.component.ts                   ← "casca": cabeçalho + área onde as telas aparecem
    app.routes.ts                      ← rotas: /login, /chamados, /dashboard
    core/                              ← regras e serviços (sem tela)
      modelos.ts        ← formato dos dados (Chamado, EventoStatus...)
      constantes.ts     ← listas fixas (produtos, motivos, prazos de SLA, cores, config do Firebase)
      dominio.ts        ← regras de negócio de UM chamado (status, SLA, vencimento, histórico)
      metricas.ts       ← contas sobre VÁRIOS chamados (totais, SLA por gravidade, atuação...)
      chamados.service.ts ← lê/grava a coleção `reclamacoes` no Firestore
      notas.service.ts    ← lê/grava a coleção `notas_sac`
      excel.service.ts    ← monta a planilha do dashboard
      sessao.service.ts   ← login/token da API da Presença
    features/                          ← telas
      login/        chamados/        dashboard/        shell/ (cabeçalho)
```

**Como as peças conversam** (exemplo do dashboard):

```
Firestore ──► chamados.service.ts ──► registros()  (lista de chamados em memória)
                                           │
dashboard.component.ts filtra por período/produto ──► registros()
                                           │
             metricas.ts calcula ◄─────────┘   (usa as regras de dominio.ts)
                                           │
             o template (HTML dentro do componente) mostra na tela
```

### Três conceitos de Angular que aparecem em todo lugar

- **`signal(valor)`**: uma variável "observável". Quando muda, a tela se atualiza
  sozinha. Lê com `nome()` e muda com `nome.set(novo)`.
- **`computed(() => ...)`**: um valor calculado a partir de outros signals. É
  recalculado automaticamente quando algum deles muda.
- **Template**: o HTML dentro de `template: \`...\``. `{{ x }}` mostra um valor,
  `(click)="f()"` chama uma função, `@if` / `@for` controlam o que aparece.

---

## 4. A função nova: "Chamados com SLA estourado"

**Onde fica:** Dashboard, logo abaixo do quadro "SLA por gravidade". Também virou
uma aba nova no Excel exportado ("SLA estourado").

**O que mostra**, para cada chamado que estourou o prazo no período filtrado:

| Coluna | De onde vem |
|---|---|
| Chamado, produto | `id`, `produto` |
| Proposta, CPF | `idProposta`, `cpf` |
| Aberto em | `criadoEm` |
| Venceu em | `slaVenceEm` (ou abertura + prazo da gravidade, para registros antigos) |
| Tratativa iniciada (data + quem) | `tratativaIniciadaEm` / `tratativaPor`. Se o campo estiver vazio (registro antigo), usa o evento "Chamado aberto → Em tratativa" do histórico. Marca **"após vencer"** em vermelho se a tratativa começou depois do vencimento |
| Resolvido em (data + quem) | `resolvidoEm` / `resolvidoPor` |
| Atraso | quanto passou do prazo (para resolvidos, congela na data de resolução) |
| Situação | "Em aberto, atrasado" ou "Resolvido com atraso" |

- Os botões **Todos / Ainda em aberto / Resolvidos com atraso** filtram o quadro.
- **Clicar numa linha** abre o histórico completo do chamado (cada mudança de
  status, quando e por quem), útil para ver reaberturas.
- Os filtros do topo (período, produto e os cards) também valem para este quadro.

**Onde está o código:**

1. `src/app/core/metricas.ts`, função `listarSlaEstourado()`: separa os chamados
   estourados e monta cada linha (a regra fica aqui, separada da tela).
2. `src/app/features/dashboard/dashboard.component.ts`: signals `slaEstourados`,
   `visaoEstourados`, `estouradosExibidos`, `historicoAberto`; o HTML do quadro
   está no template, procure o comentário `Chamados com SLA estourado`.
3. `src/app/core/excel.service.ts`, função `abaSlaEstourado()`: a aba do Excel.

**Limites dos dados:**
- Chamados de antes do "controle de esteira" podem não ter data de tratativa
  gravada; aparecem como "não iniciada" / "resolvido sem tratativa".
- Se um chamado foi reaberto, `resolvidoEm` é apagado na reabertura. Nesse caso,
  a resolução anterior aparece no histórico (clique na linha).

---

## 5. Como rodar e mexer no projeto

### Preparar a máquina (uma vez)
1. **Node.js**: já instalado (`node -v` para conferir).
2. **Git**: nesta máquina só existe o git que vem dentro do GitHub Desktop.
   Instale o **Git for Windows** (https://git-scm.com) para usar `git` no terminal,
   ou use o **GitHub Desktop** para commit/push.
3. **Firebase CLI** (para publicar): `npm install -g firebase-tools` e depois `firebase login`.

### Rodar localmente
```powershell
cd C:\Users\vinicio.santos\source\repos\projeto_sac
npm install        # só na primeira vez ou quando mudar o package.json
npm start          # sobe em http://localhost:4200 (abra no navegador); recarrega a cada alteração salva
```
> O login usa a API da Presença e o banco é o Firestore **real**: o que você
> fizer rodando localmente (criar/resolver chamado, nota) grava de verdade.

### Fluxo para fazer uma alteração
1. Crie uma branch: `git checkout -b minha-alteracao`
2. Altere o código e confira em `npm start`.
3. Gere a versão de produção: `npx ng build` (se tiver erro, ele aparece aqui).
4. Salve no GitHub: `git add -A`, `git commit -m "o que mudou"`, `git push`
5. Publique (seção 6).

### Onde mexer para coisas comuns
| Quero... | Arquivo |
|---|---|
| Mudar prazos de SLA, produtos, motivos, canais | `core/constantes.ts` |
| Dar acesso ao dashboard a alguém | `USUARIOS_VISAO_GERAL` em `core/constantes.ts` |
| Mudar uma regra de status/SLA | `core/dominio.ts` |
| Novo número/indicador no dashboard | calcular em `core/metricas.ts`, mostrar em `dashboard.component.ts` |
| Mudar a planilha | `core/excel.service.ts` |

---

## 6. Como publicar com segurança

```powershell
npx ng build
firebase deploy --only hosting
```

- Use **`--only hosting`**. Um `firebase deploy` completo também envia o
  `firestore.rules`, que **substitui as regras do banco**.
- O `firestore.rules` do GitHub não liberava a coleção `notas_sac`; isso foi
  corrigido nesta versão. Mesmo assim, antes de publicar as regras, compare com o
  que está no Console do Firebase (Firestore → Regras): as regras atuais podem ter
  sido editadas direto lá.
- Se precisar voltar atrás: o Console do Firebase (Hosting → histórico de
  versões) permite reverter para uma versão anterior com um clique.

---

## 7. Pendências e observações

- **Segurança do banco:** as regras permitem ler e gravar em `reclamacoes` e
  `notas_sac` sem autenticação no Firebase (o controle é feito pelo app). Qualquer
  pessoa com a chave pública do projeto conseguiria acessar os dados. O próprio
  comentário no `firestore.rules` recomenda ativar o **App Check**.
- As notas "só você vê" são filtradas **na tela**: o banco guarda as notas de
  todos juntas.
