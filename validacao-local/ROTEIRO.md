# Roteiro de validação: SAC × Ouvidoria pelo CPF

Rode `VALIDAR-LOCAL.bat`, que fica na raiz do projeto. Ele sobe o sistema em http://localhost:4300 usando o **banco de teste** (`sac-ouvidoria-teste`) com dados fictícios. A faixa amarela no topo confirma que você está no modo local.

Para voltar os dados fictícios ao estado inicial, rode o `.bat` de novo.

## Clientes fictícios

| Cliente | CPF | O que tem | O que deve aparecer |
|---|---|---|---|
| Ana | 111.444.777-35 | SAC #901 em tratativa e Ouvidoria **respondida** | Aviso "O chamado do SAC segue aberto, e a Ouvidoria já tratou" |
| Bruno | 222.555.888-46 | SAC #902 resolvido e Ouvidoria **em andamento** | Aviso "Há manifestação da Ouvidoria ainda em aberto" |
| Carla | 333.666.999-57 | Dois chamados no SAC, um com CPF formatado e outro só com dígitos | Os dois chamados no histórico; Ouvidoria vazia |
| Diego | 444.777.000-83 | Só uma manifestação na Ouvidoria | SAC vazio |
| Elisa | 012.345.678-90 | No SAC o CPF foi gravado **sem o zero à esquerda** | O SAC #905 e a Ouvidoria aparecem juntos |

## O que conferir

1. **Busca no cabeçalho.** Em qualquer tela, digite um CPF no campo "Buscar cliente por CPF" e tecle Enter.
   - O painel "Histórico do cliente" mostra os totais do SAC e da Ouvidoria e uma linha do tempo única.
   - Funciona com ou sem pontos e traço.
   - Em telas estreitas, aparece só a lupa, e o campo de busca fica dentro do painel.
2. **Abrir pelo painel.**
   - Clicar num item do SAC abre o detalhe do chamado ali mesmo.
   - Clicar num item da Ouvidoria vai para a aba Ouvidoria com a manifestação aberta.
3. **Lista do SAC.** Os chamados da Ana, do Bruno e da Elisa têm o selo roxo **Ouvidoria** (ou **Ouv**, na tabela). Clicar no selo abre o histórico do cliente.
4. **Detalhe do chamado no SAC.** Abaixo dos dados aparece a faixa "Ouvidoria: N manifestação(ões) deste CPF…", com o link "Ver histórico do cliente".
5. **Detalhe da manifestação na Ouvidoria.** Mostra o CPF e a faixa "SAC: N chamado(s) deste CPF…".
6. **Registrar manifestação com CPF.** Registre uma manifestação com o CPF da Carla.
   - O selo aparece na hora nos chamados dela no SAC.
   - Um CPF inválido, como `111.111.111-11`, é recusado.
7. **Busca da Ouvidoria.** O campo "Buscar" da aba Ouvidoria também aceita CPF.
