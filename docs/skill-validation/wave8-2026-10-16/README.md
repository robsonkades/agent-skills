# Onda 8 — decisões sobre consultas SQL

Data: 16/10/2026. Avaliação comportamental de `sql-query-performance` **1.2.3**,
próxima skill na sequência dos pilotos do roadmap, após concorrência e Spring.
As 305 skills já passaram por revisão individual nas ondas anteriores; esta
onda aprofunda a evidência de uma delas. O gerenciador de pacotes fica fora do escopo.

**Resultado: empate de 8/8 com a skill e 8/8 sem ela, sem ganho observado neste
conjunto.** Foram executadas 16 tentativas: quatro casos, duas condições e duas
repetições. A revisão técnica e os resultados não identificaram um defeito que
justificasse alterar o pacote. Os cinco arquivos permanecem idênticos aos da
onda 5 e ao HEAD; não há candidata distinta a comparar como terceiro tratamento.

## Desenho e limites

| Caso | Decisão avaliada                                                                         | Evidência disponível                                                    |
| ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Q1   | Julgar um `OR` dividido em dois ramos quando `active` não admite `NULL`                  | Schema, seed e SQL; sem captura de desempenho                           |
| Q2   | Mesma proposta quando `active` admite `NULL`                                             | Mesmos arquivos de Q1, salvo a restrição `NOT NULL`                     |
| Q3   | Diagnosticar trabalho repetido e rejeitar conclusões indevidas de planos não comparáveis | Artefatos **autorais**, com contadores estipulados de PostgreSQL 17     |
| Q4   | Implementar continuação com `DESC NULLS LAST`, `ASC` e desempate `DESC`                  | SQL e schema; cursor anulável, prioridades negativas e limites inteiros |

São quatro tarefas em três famílias, não 16 problemas independentes. Q1/Q2
reaproveitam a família de casos proposta na onda 5 e ensinada pela própria skill.
Q3/Q4 são composições novas, mas não constituem um conjunto reservado independente
do desenvolvimento do avaliador. O tratamento `skill` carrega explicitamente o
snapshot e tem acesso a todas as referências distribuídas; `none` não carrega
corpos ou referências de skills. Isso avalia uso, não descoberta automática.

Cada tentativa recebe contexto novo e diretórios próprios, com modelo/esforço
herdados, sem override. Até oito atores executam simultaneamente, com orçamento
solicitado de oito minutos e subprocessos limitados a 20 segundos. A separação
de leitura é procedural, não imposta pelo sistema operacional. Journals são
relatos dos atores, não rastreamento integral de ferramentas.

Node 25.6.1 fornece `node:sqlite` experimental com SQLite 3.51.2. Os testes
executam somente o subconjunto semântico usado pelos fixtures. Nenhum servidor
PostgreSQL foi fornecido ou executado. Aprovação semântica local não estabelece
planos, coerções gerais, concorrência, durabilidade ou desempenho do PostgreSQL.
Os tempos de Q3 são dados estipulados do exercício; não são medições produzidas
nesta onda. Não há medição confiável de tokens ou custo por tentativa.

## Qualidade do avaliador

Os [critérios](criteria.json), [entradas](actors.json), sonda privada e hashes
foram [congelados](freeze.json) antes do primeiro ator. C1 verifica resultados
SQL ou a aritmética do plano; C2 verifica diagnóstico e limites; C3 exige
regressão útil nos casos executáveis e evidência adequada no diagnóstico; C4
verifica preservação de escopo e artefatos. SQL equivalente é aceito. Um teste
de regressão pode demonstrar sensibilidade por reexecução do coordenador, sem
obrigar o ator a ter executado sua própria variante incorreta.

A revisão independente pediu cinco ajustes antes do congelamento: explicitar o
desencontro de ordenação de `NULL` no índice de Q4, esclarecer C3, distinguir
custos/buffers de contadores por loop, rejeitar números serializados como strings
e exercitar prioridades nos limites inteiros para detectar sentinelas inválidas.
Quatro respostas artificiais calibraram o julgamento semântico, com concordância
4/4 com o gabarito escrito antes; elas não contam como tentativas de agentes.

O primeiro preflight revelou erro do próprio avaliador: seis placeholders para
uma tabela de cinco colunas. O erro e seus resultados foram preservados e
corrigidos antes das tentativas. Falha de preparação não vale como detecção de
erro semântico. O [preflight final](preflight-reviewed.json) contém 21 controles,
todos com resultado esperado; os 13 negativos falham com asserções de contrato.
As execuções anteriores permanecem nos registros, sem serem ocultadas ou
reclassificadas como evidência de qualidade da skill.

As distinções técnicas foram conferidas nas fontes primárias: contadores e custo
em [EXPLAIN do PostgreSQL 17](https://www.postgresql.org/docs/17/using-explain.html),
direções e posição de `NULL` em
[ORDER BY](https://www.postgresql.org/docs/17/queries-order.html), e a semântica local
do [SELECT do SQLite](https://www.sqlite.org/lang_select.html). A pesquisa independente
registra outras fontes específicas e os limites de versão.

## Resultados

| Caso                                | Sem carregar a skill | Com a skill 1.2.3 |
| ----------------------------------- | -------------------: | ----------------: |
| Q1 — proposta válida sob `NOT NULL` |                  2/2 |               2/2 |
| Q2 — perda de linhas com `NULL`     |                  2/2 |               2/2 |
| Q3 — interpretação dos planos       |                  2/2 |               2/2 |
| Q4 — cursor com direções e `NULL`   |                  2/2 |               2/2 |
| **Total de tentativas aceitas**     |              **8/8** |           **8/8** |

Os [resultados por tentativa](results.json) combinam leitura dos artefatos,
[reexecuções do coordenador](rechecks.json) e julgamento textual independente.
As 840 verificações da sonda são comparações internas — não 840 tarefas ou
tentativas de agentes. As 12 regressões SQL passaram com a solução entregue e
falharam com uma variante semanticamente incorreta: `UNION` deduplicando Q1,
proposta original perdendo `NULL` em Q2 e tupla incorreta em Q4. As falhas foram
de resultado, não de sintaxe ou preparação. Q3 teve quatro campos numéricos
conferidos em cada tentativa e avaliação do raciocínio; não exigia executar SQL.

O coordenador leu o SQL e o código das regressões antes de reexecutá-los em
cópias isoladas. Helpers adicionais relatados pelos atores não foram todos
reexecutados; as evidências repetidas estão delimitadas nos logs. Para run-07,
a cópia de reexecução incluiu o diretório `../input` usado pelo teste para
conferir preservação, mantendo sua estrutura original.

As [notas do coordenador](root-grades.json) foram
[seladas](root-grades-seal.json) antes do julgamento independente. O revisor
recebeu IDs opacos e respostas sem o mapa de condições; suas 16 decisões
[textuais](review/actor-grades.json.txt) concordaram com as notas anteriores,
sem divergência a resolver. Ele avaliou C2 e os aspectos textuais de C3/C4;
**não reexecutou os artefatos**. O mascaramento foi parcial, o revisor já
conhecia os casos e todos compartilham a mesma família de modelo. Isso não é
validação por um modelo ou especialista externo. Os journals registram carga
da skill somente nas oito tentativas previstas, sem garantir isolamento de
leitura imposto pelo sistema operacional.

O conjunto atingiu o teto de aprovação nas duas condições. Isso impede estimar
uma vantagem de acerto aqui e não demonstra que a skill seja inútil ou que
sempre produza bons resultados. Os prompts fornecem contratos detalhados,
fixtures e acesso a documentação primária para ambos os grupos; a família
`OR`/`NULL` também é conteúdo conhecido. Esses fatores podem tornar o controle
forte, mas esta avaliação não isolou suas causas. Para sustentar uma afirmação
de ganho, faltam tarefas independentes mais discriminantes e, para desempenho
SQL, execução comparável no PostgreSQL. Não foi medido benefício em custo,
tokens ou tempo de resolução.

## Evidência e reprodução

O [manifesto de artefatos](artifact-manifest.json) relaciona os arquivos brutos
e seus SHA-256. Entradas, respostas, SQL, testes, journals, revisão, snapshots
e helpers autorais foram arquivados com sufixo adicional `.txt`, preservando os
bytes. Corpos completos de fontes externas e binários ficam fora desse arquivo
de evidências; referências e hashes identificam eventuais exclusões.

Para repetir a verificação local, reconstrua uma tentativa em um diretório
temporário: remova apenas o sufixo adicional `.txt` dos arquivos em
`actor-outputs/run-NN/` para formar `output/`, e de
`actor-inputs/run-NN/input/` para formar o diretório irmão `input/`. Copie
`probe.frozen.mjs.txt` como `probe.mjs`. Execute `node probe.mjs QN <output>`;
nos casos Q1/Q2/Q4, execute também `node verify.mjs` dentro de `output/`.
Use uma cópia separada para testar uma variante incorreta. O ambiente observado
foi Node 25.6.1 / SQLite 3.51.2; isso não reproduz um servidor PostgreSQL.
Os helpers de coordenação também estão arquivados, mas seus caminhos absolutos
registram o ambiente original e precisam ser adaptados para outra máquina.

## Integração

Somente os artefatos desta onda e a entrada correspondente no inventário foram
adicionados ou atualizados. A skill permanece em **1.2.3**, sem alteração de
conteúdo ou bump de versão. Não houve commit, publicação ou instalação global.

`npm run registry:build` passou com 305 skills; o índice resultante permaneceu
byte a byte igual ao início da onda. O [log de `npm run verify`](verify.log.txt)
registra build, limites arquiteturais, lint, formatação, registro, versões e
**393 testes em 70 suítes**, sem falhas, cancelamentos ou testes ignorados.

A [conferência de integridade](integrity-final.json) passou: 272 arquivos de
entrada protegidos, 427 artefatos brutos arquivados e os hashes dos critérios,
sonda, snapshots e notas conferidos. A
[conferência de preservação](preservation-final.json) compara os 12.110 arquivos
preexistentes e registra o inventário como única alteração autorizada fora do
novo diretório desta onda. A verificação de versões considera também mudanças
das ondas anteriores no diretório de trabalho; seus 85 bumps aprovados não são
alterações produzidas nesta onda.
