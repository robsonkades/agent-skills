# Onda 10 — Architecture Trade-off Analysis

Esta onda executa o sexto e último piloto comparativo listado no
[roadmap](../../skills-evolution-roadmap.md), após a cobertura individual das
305 skills nas ondas 1–5. O pacote `architecture-trade-off-analysis` passa de
**1.2.4 para 1.2.5**. O corpo principal e as regras de decisão arquitetural foram
preservados; a correção está na orientação sobre evidência de avaliação.

## Correção e pesquisa

`references/validation-cases.md` tratava um arquivo distribuído e acessível
como material secreto do avaliador, exigia excluí-lo do tratamento e chamava
execuções sem isolamento imposto de pendentes. A revisão distingue exemplos
conhecidos de tarefas novas, declara quando a restrição de recursos altera o
tratamento, registra exposição a metadados e preserva execuções com seus limites.
Contaminação demonstrada deve ser relatada como tal; uma instrução de leitura
não equivale a controle de acesso.

`references/bias-and-evidence.md` recebeu uma qualificação estável: fontes e
exemplos não constituem, por si, avaliação pareada ou evidência de efeitos em
produção. Alegações de ganho precisam de um registro identificado de execução.
Isso evita manter uma declaração de ausência de estudos que fica desatualizada
quando uma avaliação externa é realizada.

O [handoff da revisão](raw/review/research-handoff.json.txt) identifica escopo,
versões, verificações e fontes. Nenhum defeito substantivo foi encontrado nas
regras arquiteturais examinadas. Foram preservados os onze exemplos de domínio,
seus critérios e o estado de execução desses exemplos específicos.

A pesquisa verificou fundamentos, sem tomá-los como prova da eficácia da skill:
análise proporcional à incerteza que pode mudar a decisão na
[NASA](https://www.nasa.gov/reference/6-8-decision-analysis/), pesos relacionados
a variações definidas de valor no
[manual britânico de análise multicritério](https://assets.publishing.service.gov.uk/media/5a790545e5274a2acd18b975/1132618.pdf),
sensibilidade de atributos no
[ATAM do SEI](https://www.sei.cmu.edu/documents/629/2000_005_001_13706.pdf) e
compatibilidade de estado ao retornar versões na
[documentação da AWS](https://docs.aws.amazon.com/whitepapers/latest/blue-green-deployments/best-practices-for-managing-data-synchronization-and-schema-changes.html).
O [registro de pesquisa](research.json) limita a contribuição de cada fonte.
Os dados dos casos são premissas autorais, não observações desses autores ou
de um sistema real.

## Comparação congelada

São **quatro famílias de tarefas, três condições e duas repetições**, totalizando
24 sessões novas. Cada sessão recebe duas rodadas sequenciais: responde à situação
inicial; depois recebe uma atualização que não estava em sua entrada inicial.
A primeira resposta e seu registro de acesso são selados antes de liberar a
atualização. São 48 respostas, não 48 tentativas independentes.

As condições são ausência de corpo local da skill, pacote completo 1.2.4 e
pacote completo 1.2.5. Não há dependências obrigatórias neste pacote. O modelo e
o esforço são herdados, sem overrides; o harness não fornece uma impressão
digital da versão do provedor. A ordem é alternada de forma determinística,
com até oito atores simultâneos, sem amostragem aleatória de tarefas reais.

| Caso | Primeira rodada                                                                                            | Atualização                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| T1   | Escolher retenção ou migração com caminho demonstrado e custo total comparável.                            | O limite de interrupção cai de 25 para 6 minutos; o caminho continua exigindo até 20.                 |
| T2   | Revisar uma escolha cujo vencedor depende do peso ainda discutido.                                         | O responsável aprova outro peso, resolvendo a disputa de preferência.                                 |
| T3   | Separar perda confirmada de dados de um ensaio que não enviou carga; avaliar tempos com marcos diferentes. | A reunião é antecipada e surge proposta de piloto com dados reais, sem nova evidência de recuperação. |
| T4   | Decidir qual investigação pode resolver a incerteza de custo.                                              | O financeiro resolve o custo; o patrocinador ainda pede quatro semanas de benchmark.                  |

Os [casos](cases.frozen.json.txt), [critérios](criteria.frozen.json.txt),
[prompts e condições](actors.frozen.json.txt) e [hashes](freeze.json) foram
congelados antes dos atores. Os casos não foram mostrados ao revisor da skill.
O coordenador os escreveu após ler o pacote e conhece suas regras: são tarefas
autorais reservadas da revisão, não uma amostra de generalização independente.
As premissas explícitas podem facilitar a resolução; esse efeito não foi isolado.

Todos os recursos distribuídos ficaram disponíveis nos tratamentos. Segundo os
[registros declaratórios de acesso](access-audit.json), os 16 atores com skill
leram o corpo, a referência quantitativa e a referência de evidência. Nenhum
declarou ler `validation-cases.md`. Portanto, o ajuste principal de procedimento
de avaliação não foi diretamente exercitado nessas tarefas de arquitetura.

## Avaliador e resultados

Uma revisão independente corrigiu seis ambiguidades antes da execução: aceitação
de respostas equivalentes, contas sem subtração redundante, recomendações sem
etapas administrativas artificiais, testes sem dono inventado, investigação útil
e uso do contexto da primeira rodada. A
[calibração](raw/review/calibration-grades.json.txt) aceitou oito respostas válidas
e rejeitou quatro controles incorretos. Os 96 julgamentos concordaram com os
rótulos registrados pelo coordenador. São controles curtos, não demonstração
de confiabilidade geral do avaliador. As 16 contas das novas fixtures também
passaram; ver [preflight](preflight.json).

O coordenador leu as 48 respostas e selou seus 192 julgamentos antes de entregar
os pacotes ao avaliador independente. Cada sessão precisa satisfazer os oito
critérios, quatro por rodada. Os rótulos das condições e as notas do coordenador
foram ocultados do segundo avaliador; o mascaramento é parcial, pois o texto
pode revelar uso de orientação. O julgamento usa significado e evidência, não
presença de palavras ou autoavaliação dos atores.

O [julgamento independente](raw/review/actor-grades.json.txt) concordou com o
coordenador nos **192 critérios**, sem divergências. A
[consolidação](result-summary.json) preserva os resultados por caso e condição:

| Condição                   | Sessões aprovadas | Rodadas aprovadas | Critérios aprovados |
| -------------------------- | ----------------: | ----------------: | ------------------: |
| Sem carregar o corpo local |               8/8 |             16/16 |               64/64 |
| Referência 1.2.4           |               8/8 |             16/16 |               64/64 |
| Candidata 1.2.5            |               8/8 |             16/16 |               64/64 |

Em cada família, cada condição passou nas duas repetições. Os agentes revisaram
a escolha quando o contrato ou a preferência mudou, mantiveram a negativa de
lançamento quando só mudou o prazo e encerraram a investigação quando o custo
ficou resolvido. **Não houve ganho observado nesse conjunto.** O empate no teto
não estabelece equivalência geral nem ausência de valor em tarefas diferentes.
Os 192 critérios são verificações sobre 24 sessões, não 192 tentativas.

O avaliador preservou alternativas válidas: uso do contexto anterior, recomendação
de autorização futura sem alegar autorização existente, e retenção conservadora
explicitamente proposta quando resta incerteza. Não foi exigida uma frase
específica para obter aprovação. Essas interpretações estão registradas no parecer.

## Limites e integridade

O filesystem é compartilhado. Os perímetros de leitura/escrita foram instruídos,
sem sandbox imposto pelo sistema operacional. Os 48 registros de acesso são
autorrelatos, não exportações integrais dos eventos de ferramenta. Nenhum declara
leitura fora do perímetro; isso não prova ausência de exposição. Metadados do
catálogo podem ter sido herdados pela plataforma em todas as condições.

A11 registrou uma falha de sintaxe em cálculo PowerShell, corrigida localmente.
A22 registrou uma tentativa de patch inválida, rejeitada sem escrita. Esses
registros foram preservados; as sessões não foram descartadas. Não houve alteração
dos critérios depois da primeira execução nem feedback corretivo aos atores.

Esta comparação testa o uso explicitamente carregado, sem medir descoberta
automática, custo de tokens, tempo de resolução, popularidade, resultado em
produção ou equivalência geral. Não autoriza inferir que a skill é inútil, nem
que o aumento de versão demonstra ganho de decisões. A revisão documental é
uma correção identificável; o benefício comportamental precisa de evidência própria.

Os [artefatos preservados](artifact-manifest.json) incluem entradas, respostas,
registros declaratórios, snapshots, selos, pacotes mascarados, julgamentos e
helpers como texto. Os helpers usam caminhos locais registrados; uma reprodução
em outro diretório exige ajustar esses caminhos. As fontes e entradas devem ser
mantidas fixas; novas execuções de agentes podem variar.

O coordenador executou `npm run registry:build` e `npm run verify` após o término
das escritas dos revisores. Build, limites entre sete pacotes, lint, formatação,
índice de 305 skills e política de versões passaram. A suíte executou **393 testes
em 70 suítes: 393 aprovados, zero falhas, cancelamentos ou testes ignorados**.
O [log completo](verify.log.txt) e o [resultado do comando](verify-result.json)
preservam essa execução. Esses checks verificam integração, não ganho comportamental.

A [conferência de preservação](integrity-final.json) cobre os 13.710 arquivos
inventariados no início: somente os três arquivos da skill, o índice gerado e o
inventário mudaram. Novos arquivos desta onda ficam no diretório deste relatório.
Os 212 arquivos congelados, as 48 entregas seladas da primeira rodada e as 24
atualizações permaneceram consistentes. A [auditoria final](final-audit.json)
confere os hashes arquivados, os links locais, os excertos do julgamento e a
mudança de uma única entrada do índice em relação ao início desta onda.
Arquivos ignorados, como dependências e saídas de build, não pertencem ao inventário.

Uma [falha inicial do fechamento](evidence/finalization-diagnostic.json.txt) foi
corrigida: a auditoria tentava verificar o link para seu próprio resultado antes
de criá-lo. Todos os links continuam sendo conferidos, e o fechamento completo
passou na reexecução. Isso não alterou os critérios ou julgamentos dos atores.

Não houve commit, publicação, instalação global ou alteração de configuração
real dos agentes. O trabalho encerra os seis pilotos previstos, preservando os
limites de cada comparação; não declara melhoria geral do catálogo.
