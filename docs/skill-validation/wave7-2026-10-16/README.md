# Onda 7 — transações e eventos Spring

Data: 16/10/2026. Comparação comportamental de
`spring-transactions-and-events` **1.1.0**, após a revisão dos 305 nomes nas ondas
anteriores. O escopo desta onda é uma skill e quatro tarefas de implementação;
não é uma nova revisão do catálogo nem uma alteração do gerenciador de pacotes.

**Comparação executada: 8/8 aprovações com a skill e 8/8 sem carregá-la.**
Os 16 projetos passaram nas sondas independentes, e uma regressão de cada ator
passou no candidato e rejeitou o defeito original ou a alternativa inválida.
O [julgamento do coordenador](root-grades.json) foi congelado antes da
[revisão semântica independente](review/actor-grades.json.txt), que concordou em
16/16 explicações técnicas. Os [resultados consolidados](results.json) preservam
a nota e os limites de cada tentativa. O [verify completo](verify.log.txt) passou:
393 testes em 70 suites, sem falhas, cancelamentos ou testes ignorados.

| Caso                             | Sem carregar a skill | Skill 1.1.0 |
| -------------------------------- | -------------------- | ----------- |
| T1 — recibo obrigatório          | 2/2                  | 2/2         |
| T2 — recibo opcional após commit | 2/2                  | 2/2         |
| T3 — manager/datasource          | 2/2                  | 2/2         |
| T4 — identidade no replay        | 2/2                  | 2/2         |
| Total de tentativas              | 8/8                  | 8/8         |

Não houve ganho observado neste conjunto. O baseline também acertou tudo;
isso limita a capacidade de distinguir tratamentos e não demonstra equivalência
geral, inutilidade da skill ou eficácia fora destes casos. Nenhum defeito
justificou alterar seus cinco arquivos ou incrementar a versão 1.1.0. O piloto
maior do roadmap continua separado desta comparação finita.

## Comparação e critérios

Foram congeladas 16 tentativas: quatro casos, duas condições e duas repetições.
`none` resolve o projeto sem carregar a skill; `skill` carrega explicitamente o
snapshot 1.1.0 e pode ler todas as referências distribuídas. Fontes técnicas
primárias externas estão disponíveis nas duas condições. Não existe um terceiro
tratamento: os cinco arquivos do pacote são idênticos aos da revisão da onda 5.

| Caso | Decisão exigida pelo contrato                                                                       | Sonda independente                                                      |
| ---- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| T1   | Preservar recibo obrigatório na mesma transação; rejeitar a sugestão indiscriminada de REQUIRES_NEW | 20 asserções de estado, fase e rollback do dono                         |
| T2   | Recibo opcional após commit, com cabeçalho/corpo atômicos em transação independente                 | 21 asserções; falha do recibo preserva booking/estoque                  |
| T3   | Selecionar o manager do banco de pedidos, mantendo o manager primário de métricas                   | 10 asserções; falhas de estoque/notifier e métricas                     |
| T4   | Reutilizar a identidade persistida no replay após aceitação externa e falha local                   | 30 asserções; repetição, ordem, limite de uma linha e eventos distintos |

T1 e T2 têm todos os arquivos de entrada idênticos, exceto `CONTRACT.md`. São
quatro tarefas em três famílias, não 16 problemas independentes. Os projetos
foram compostos antes dos atores; os exemplos e conceitos já distribuídos pela
skill continuaram acessíveis e não são tratados como conteúdo desconhecido.

Os [critérios](criteria.json) verificam contrato executável (C1), explicação
causal e limites (C2), regressão útil e evidência de execução (C3), e preservação
de escopo/artefatos (C4). Não exigem determinada anotação quando outra fronteira
equivalente atende ao contrato. Uma exceção encapsulada pode ser válida se a
causa significativa for preservada; divergências semanticamente equivalentes
recebem adjudicação explícita.

Cada ator recebeu uma conversa nova, projeto e saída separados, sem override
de modelo/esforço, com até oito atores ativos e limite solicitado de dez minutos.
O runner limita cada javac/java a 30 segundos. A separação de leitura é
procedural, não imposta pelo sistema operacional. Os journals são relatos dos
atores; hashes e reexecução independente não provam um rastreio completo de
suas ferramentas. O carregamento explícito avalia uso, não descoberta automática.

## Verificação do avaliador

O revisor leu o pacote completo e fontes primárias antes dos atores. A revisão
dos critérios encontrou duas lacunas em T4 — várias linhas pendentes e ordem
do checkpoint — e uma restrição excessiva no tipo imediato de exceção em T3.
As três foram corrigidas antes do [congelamento](freeze.json), com controles
positivos e negativos. Quatro respostas artificiais calibraram o julgamento
semântico: os quatro julgamentos coincidiram com o gabarito previamente escrito.
Essa calibração não conta como tentativa de agente nem prova de eficácia.

O revisor não recebeu o mapa de condições nem as notas congeladas do coordenador.
Julgou C2 e a sustentação textual de C3/C4; a compilação, execução e conferência
de arquivos ficaram com o coordenador. O mascaramento foi parcial: cinco textos
declaravam uso da skill, três declaravam ausência e oito eram indeterminados.
O revisor usou uma conversa separada do mesmo modelo, sem independência estatística
ou comparação entre modelos. Não houve divergência material a adjudicar. Dois
relatos de T4 não discutiram reconciliação de tokens aleatórios antigos; nenhum
prometeu reconstruí-los, e isso não virou exigência retroativa da nota.

O [primeiro preflight](preflight-initial.json) permanece preservado, incluindo
um falso positivo: com apenas uma escrita no recibo, uma mudança só de fase
persistiu o efeito neste caminho H2/JDBC. O teste foi reforçado para escrever
cabeçalho e depois um corpo rejeitado, exigindo rollback dos dois. O controle
passou então a rejeitar a gravação parcial, antes de qualquer saída de ator.
Isso corrigiu o avaliador; não confirmou defeito na skill, que já exigia testar
rollback do efeito após uma falha do listener.

Foram 38 comandos de preflight distintos: 15 no lote inicial, com esse resultado
inesperado preservado, e 23 depois dos ajustes, todos com o resultado esperado.
`preflight.json` e `preflight-initial.json` preservam o mesmo lote inicial e não
representam outras 15 execuções.

A sequência de limpeza em
[DataSourceTransactionManager 7.0.9](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java)
e o contrato JDBC de
[setAutoCommit](<https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/Connection.html#setAutoCommit(boolean)>)
sustentam a explicação desse resultado: restaurar autocommit pode confirmar
escritas pendentes. É uma explicação da observação local, não uma garantia
portável para gravar após completion sem nova transação. O caminho de callbacks
também foi conferido no
[código Spring 7.0.9](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/java/org/springframework/transaction/event/TransactionalApplicationListenerSynchronization.java).

## Artefatos e reprodução

- [Alocação e hashes de entrada](actors.json), [despacho](dispatch.json) e
  [bytes congelados dos critérios](criteria.frozen.json.txt).
- [Preflight após reforçar T1/T2](preflight-refined.json),
  [controles de ordem/limite de T4](preflight-reviewed.json) e
  [equivalência de causas em T3](preflight-causes.json).
- [Reexecuções do coordenador](rechecks.json): sonda privada, regressões dos
  atores e controles com o defeito original ou alternativa inválida.
- [Manifesto de artefatos](artifact-manifest.json): entradas, saídas, código dos
  testes, auxiliares, fontes consultadas e hashes. Texto autoral preservado em
  arquivos `.txt`; JARs, classes compiladas e corpos integrais de fontes externas
  ficam por referência/hash.
- [Pesquisa do pacote](review/research-handoff.json.txt),
  [resolução da revisão dos critérios](review/criteria-resolution.json.txt),
  [calibração](review/calibration-grades.json.txt) e
  [entrada exata do julgamento independente](review/masked-outputs.json.txt).

Os projetos usam Temurin 25.0.3, `--release 25`, Spring Framework 7.0.9 e
H2 2.4.240, com 12 JARs locais identificados por hash. Não houve instalação ou
atualização de dependências. Os dados de aplicação são descartáveis e separados
da configuração real de agentes. Compilar e executar `node check.mjs` usa o
toolchain declarado; as classes adicionais e fases estão nos argv de cada
`assessment.json`. Para reproduzir fora desta máquina, restaure os bytes
arquivados sem o sufixo `.txt`, forneça os mesmos JARs e ajuste somente os caminhos
locais do JDK em uma cópia descartável, registrando a diferença de ambiente.

As sondas do coordenador usam recriação de contexto; algumas regressões de atores
usam processos Java separados com H2 em arquivo. O coordenador repetiu esse caminho
em `run-07`, `run-08` e `run-15`. Em `run-16`, repetiu a regressão do projeto e
inspecionou o auxiliar de reinício, mas não repetiu esse auxiliar: sua execução
adicional permanece evidência relatada pelo ator. Nenhum desses caminhos testa
kill abrupto, perda de energia, provedor de rede ou workers concorrentes. Boot,
JPA e Modulith não participam deste fixture. Contagens de asserções não são novas
tarefas, e não há medição confiável de tokens, custo ou efeito em produção.

As lacunas de cobertura identificadas podem orientar um próximo desenho congelado
antes das tentativas. Este resultado não altera retroativamente os casos, não
seleciona apenas vitórias e não conclui o piloto mais amplo do roadmap.

## Validação e preservação

O coordenador executou `npm run registry:build` e, depois de todos os agentes
encerrarem suas escritas, `npm run verify`. Build, dependências arquiteturais,
lint, formatação, índice, versões e os 393 testes passaram. Esses são os testes
do repositório; as 16 tentativas comportamentais e suas reexecuções são evidência
separada. Os comandos completos estão em [registry-build.log.txt](registry-build.log.txt)
e [verify.log.txt](verify.log.txt), com metadados de execução nos arquivos
[registry-build-result.json](registry-build-result.json) e
[verify-result.json](verify-result.json).

A [conferência de integridade](integrity-final.json) confirmou os 752 caminhos
protegidos das tentativas, os congelamentos, a entrada do revisor e os 1.017
artefatos brutos arquivados. Os cinco arquivos da skill e o índice permaneceram
iguais aos bytes do início desta onda. A [preservação do workspace](preservation-final.json)
comparou 10.698 arquivos preexistentes: somente o inventário recebeu a atualização
prevista; os arquivos novos ficam neste dossiê. Nenhum commit, publicação ou
instalação global foi realizado.
