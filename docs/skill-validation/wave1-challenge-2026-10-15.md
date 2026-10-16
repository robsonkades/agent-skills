# Onda 1 — auditoria independente e comparação entre versões

Data local: 15/10/2026. Continuação da [execução da onda 1](wave1-2026-10-15.md).

**A comparação terminou empatada: 12 de 12 casos passaram em cada condição.**
Este lote não demonstrou ganho adicional das versões revisadas sobre as anteriores
ou sobre o modelo sem carregamento da skill. Também não revelou regressão nos casos
exercitados. Isso não estabelece equivalência geral, confiabilidade estatística ou
superioridade sobre outros catálogos.

## O que foi feito

Seis novos revisores `skill-reviewer`, um por skill, auditaram os pacotes congelados
sem acesso aos novos casos. Leram o procedimento completo, os pacotes e os diffs;
verificaram afirmações relevantes em fontes primárias e executaram checks locais.
Todos retornaram `NO_CHANGES_NEEDED`: não encontraram defeito material adicional que
justificasse outra alteração. Isso é uma conclusão limitada dessas auditorias,
não uma garantia de ausência de defeitos. Os revisores usam o mesmo modelo herdado
e podem compartilhar pontos cegos. [Registros, responsáveis e fontes](wave1-challenge-2026-10-15/audits.json).

Um autor separado preparou dois casos novos por skill depois do congelamento das
candidatas. Consultou os pacotes e os casos anteriores para evitar reutilizar exemplos
de ensino como testes novos. Os critérios foram definidos antes das respostas. O
coordenador conferiu os contratos e esclareceu, antes das execuções, que bloquear
somente o despacho não exige inventar tarefas independentes.

Cada caso teve três execuções em sessões novas: sem pacote atribuído, com a versão
anterior à onda e com a versão final revisada. Foram **36 atores distintos**, com até
12 ativos simultaneamente, sem sobrescrever modelo ou esforço. Todos terminaram;
não houve falha de execução do experimento, nova tentativa ou seleção da melhor resposta.
O [log](wave1-challenge-2026-10-15/runner-log.json) preserva as mensagens exatas,
identidades e horários de despacho.

Dois avaliadores separados receberam as respostas com rótulos de condição e caminhos
de leitura removidos, em ordem misturada por caso. Aplicaram os 48 critérios congelados
às três condições: **144 julgamentos PASS**, sem FAIL ou UNSCORABLE. O coordenador leu
as 36 respostas completas, concordou com os julgamentos e verificou que os 144 trechos
citados existem nas respectivas respostas. Não houve alteração de nota. Essa revisão
continua sendo feita por modelos; não substitui adjudicação humana independente.

## Resultados comparáveis

Os números abaixo são casos aprovados sobre casos executados, não porcentagens de
melhoria nem estimativas de confiabilidade em produção.

| Skill                        | Condição decisiva nos casos                        | Sem skill | Anterior  | Revisada  |
| ---------------------------- | -------------------------------------------------- | --------- | --------- | --------- |
| code-review                  | Sessão emprestada ou com propriedade transferida   | 2/2       | 2/2       | 2/2       |
| estimation-under-uncertainty | Uma ou duas pessoas e janelas de entrega           | 2/2       | 2/2       | 2/2       |
| feature-risk-analysis        | Contenção antes ou depois do despacho irreversível | 2/2       | 2/2       | 2/2       |
| feature-readiness-review     | Mudança de escopo aceita ou ainda proposta         | 2/2       | 2/2       | 2/2       |
| java-test-design             | Ordem obrigatória ou não especificada no resultado | 2/2       | 2/2       | 2/2       |
| quality-gates                | Exceção aplicável ou vinculada a outra candidata   | 2/2       | 2/2       | 2/2       |
| **Total**                    | **12 casos, três condições por caso**              | **12/12** | **12/12** | **12/12** |

[Comparação por caso e condição](wave1-challenge-2026-10-15/comparison.json).
Os julgamentos e suas justificativas estão em
[grading-a](wave1-challenge-2026-10-15/grading-a.json) e
[grading-b](wave1-challenge-2026-10-15/grading-b.json).

O modelo sem pacote também resolveu os casos. Portanto, estes resultados servem como
regressão inicial, mas têm pouca capacidade de distinguir melhorias adicionais neste
modelo. Manter correções tecnicamente fundamentadas não exige inventar um benefício
comportamental que esta amostra não mostrou. Nenhuma skill recebeu novas instruções
ou outro bump nesta continuação; as 29 revisões da onda anterior foram preservadas.

## Integridade e verificações

- Entradas, critérios, protocolos e tratamentos permaneceram iguais aos hashes
  congelados; as 36 mensagens enviadas correspondem ao manifesto.
- Os 46 arquivos dos tratamentos estão arquivados integralmente em UTF-8, com hashes.
  Os snapshots temporários e os 23 arquivos das seis candidatas conferem com o arquivo
  preservado. Os 1.506 arquivos do catálogo conferem com o estado final da onda 1.
- Sete verificações determinísticas confirmaram os cálculos de referência de prazo,
  contenção e seleção de IDs. São checks do experimento, não execução dos sistemas
  simulados nem compilação dos testes Java propostos.
- Nenhuma leitura fora dos caminhos permitidos foi declarada. Os atores `trial11` e
  `trial25` registraram a presença das instruções comuns do repositório/ambiente e,
  no segundo caso, dos metadados do catálogo instalado. As declarações foram mantidas.
- As respostas tiveram de 237 a 281 palavras por contagem de espaços. `trial22` ficou
  uma palavra acima da faixa sugerida de 180–280; concisão era um diagnóstico separado,
  não critério de domínio, conforme o desenho anterior às execuções.
- `npm run registry:build` passou com 305 entradas; o índice permaneceu idêntico.
- `npm run verify` passou: build, fronteiras, lint, formatação, índice, versões e
  **393 testes em 70 suites**, sem falhas, cancelamentos ou skips.
  [Log completo](wave1-challenge-2026-10-15/verify.log).

[Auditoria de exposição e respostas](wave1-challenge-2026-10-15/exposure-audit.json),
[cálculos de referência](wave1-challenge-2026-10-15/reference-calculations.json) e
[verificação de integridade](wave1-challenge-2026-10-15/integrity-checks.json).

## O que ainda não está demonstrado

Os casos são novos após o congelamento, mas foram elaborados com conhecimento dos
pacotes; não são um benchmark externo reservado. Houve uma execução por combinação,
sem repetições para estimar variabilidade. Os membros de cada par são relacionados.
Seis skills não representam todas as 29 revisadas ou as 305 do catálogo.

O experimento avalia respostas com fatos fornecidos e carregamento explícito. Não mede
descoberta automática, investigação de um repositório real, execução de ferramentas
do domínio, alterações de código, composição com skills vizinhas, outro runtime ou
resultados de produção. Os pacotes vizinhos não estavam disponíveis neste tratamento.
Os cálculos independentes não removem essas limitações.

As sessões foram novas, mas o filesystem era compartilhado. A separação foi procedural,
com inventário de leituras declarado pelos atores; não houve isolamento imposto pelo
sistema nem auditoria independente da trajetória completa de ferramentas. Os rótulos
foram ocultados dos avaliadores, mas características do texto podem revelar a condição.
O identificador exato do modelo, seed, tokens e custo não foram expostos pelo mecanismo.
“Sem skill” significa sem leitura explícita do pacote, preservando conhecimento prévio
do modelo e instruções comuns do ambiente.

Não foi implementada ou avaliada memória persistente entre sessões. O ciclo demonstrado
é revisão, correção e avaliação conduzidas pelo mantenedor. O próximo ganho de evidência
no [roadmap](../skills-evolution-roadmap.md) depende de tarefas com execução real,
verificadores apropriados, repetições e validação temporal da memória. Este diagnóstico
não substitui o piloto formal previsto ali.

## Reprodução e decisão

O [desenho anterior às execuções](wave1-challenge-2026-10-15/design.md),
o [manifesto](wave1-challenge-2026-10-15/run-manifest.json),
os [tratamentos arquivados](wave1-challenge-2026-10-15/treatments.json) e
os [critérios](wave1-challenge-2026-10-15/criteria.json) preservam a configuração.
Entradas estão em `wave1-challenge-2026-10-15/inputs/`; respostas integrais, em
`outputs/`; conjuntos com rótulos ocultados, em `masked-a.json` e `masked-b.json`.
Os mapas separados permitem conferir a atribuição de condição após o julgamento.
É possível reconstruir os tratamentos a partir do conteúdo arquivado se os diretórios
temporários deixarem de existir; uma nova execução pode produzir respostas diferentes.

A distinção entre caso, tentativa, avaliação e resultado segue a
[referência local](../../skills/skill-engineering/references/evaluation.md) e a
[orientação de avaliação de agentes da Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
Uma suíte saturada pode proteger contra regressões sem distinguir avanços adicionais.

Decisão: preservar as correções fundamentadas da onda 1 e este empate, sem ganho
adicional demonstrado. Não ampliar as skills ou procurar novos
casos apenas para obter uma pontuação favorável. A afirmação sustentada é que a onda
passou pelas verificações descritas; “melhor possível” permanece sem comprovação.
