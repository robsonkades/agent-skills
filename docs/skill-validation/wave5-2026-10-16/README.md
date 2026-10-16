# Onda 5 — revisão da Base e do Piloto

Data: 16/10/2026. Sete skills revisadas individualmente: **duas corrigidas e cinco preservadas**. Esta onda cobre os sete nomes marcados como Base/Piloto que não constavam nas filas das ondas 1–4. Com isso, a cobertura de revisão individual alcança **305/305** nomes do inventário. Isso não significa que o programa experimental, o piloto completo ou a validação de eficácia do catálogo estejam concluídos.

## Escopo e resultado

| Skill                           | Versão inicial → final | Resultado da revisão                                                                                          |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| architecture-trade-off-analysis | 1.2.4 → 1.2.4          | Preservada: restrições obrigatórias, escalas, pesos, sensibilidade, transição e recuperação já diferenciados. |
| debugging                       | 1.1.4 → 1.1.4          | Preservada: contrato, causa refutável, estado efetivo, reprodução e limites de produção já cobertos.          |
| java-memory-model               | 1.3.5 → 1.3.6          | Qualificada a garantia de inicialização de estado alcançado por um campo `final`.                             |
| retries-and-backoff             | 1.1.4 → 1.1.4          | Preservada: replay seguro, resultado desconhecido, prazo, interrupção e orçamento já diferenciados.           |
| spring-transactions-and-events  | 1.1.0 → 1.1.0          | Preservada: proxy/manager efetivos, fase, rollback, intent durável e recuperação já tratados.                 |
| sql-query-performance           | 1.2.3 → 1.2.3          | Preservada: planos, execução parcial, NULL, multiplicidade e tenant já tratados.                              |
| skill-engineering               | 1.0.3 → 1.0.4          | Acrescentados controles do avaliador e interpretação de tarefas, tentativas, checks e empates no teto.        |

Em `java-memory-model`, a frase anterior generalizava a ausência de garantia para campos não finais. A correção distingue campos não finais sem essa relação, estado de objetos/arrays alcançado pelo campo `final`, mutações posteriores e um alias ordinário. A garantia depende das regras de freeze e dereference; uma execução sem falha não prova correção de uma corrida. Fundamentação: [JLS 25, §17.5.1](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.5.1).

Em `skill-engineering`, a referência passa a exigir, proporcionalmente à consequência do critério, conferir o avaliador com uma falha conhecida e uma alternativa válida. Também separa tarefas, repetições e asserções; preserva resultados por caso; limita a interpretação de um empate e mantém critérios de regressão mesmo quando ambos os tratamentos passam. As fontes são a [orientação de avaliação do Agent Skills](https://agentskills.io/skill-creation/evaluating-skills#grading-principles) e a [discussão de avaliações da Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). Essas fontes e o controle sintético sustentam a orientação; não demonstram um ganho comportamental desta revisão.

Os quatro arquivos de skills alterados são as duas referências e seus respectivos manifests. Nenhuma edição foi feita no código do gerenciador. Os cinco pacotes preservados não receberam bump. Os [diffs incrementais](diffs/) comparam o início desta onda ao resultado, sem incorporar alterações anteriores.

## Evidência técnica local

| Skill                           | Executado                                                                                                                                                       | Limite relevante                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| architecture-trade-off-analysis | Aritmética dos exemplos, controle negativo, duas fixtures com diferença contratual, parser/links/formatação.                                                    | Nenhuma decisão arquitetural real ou ator nesses casos do revisor.                    |
| debugging                       | Três replays Java; controle de reinício que oculta o erro de cache.                                                                                             | Controle autoral local; avaliação reservada separada abaixo.                          |
| java-memory-model               | Compilação, bytecode e controles de inicialização/escape/mutação.                                                                                               | Sem jcstress e sem observação de resultado racy; execução não substitui a JLS.        |
| retries-and-backoff             | Helper: 12 casos e 7.000 amostras de limites; sketch: 13 cenários, incluindo interrupção; mutação negativa rejeitada.                                           | Amostras não são benchmark nem prova de distribuição; sem rede/store/framework reais. |
| spring-transactions-and-events  | 18 asserções em sete caminhos relacionados, Spring 7.0.9/DataSourceTransactionManager e H2 2.4.240.                                                             | Não cobre integração Boot/JPA, produção, recuperação durável nem execução assíncrona. |
| sql-query-performance           | 43 asserções semânticas em SQLite 3.51.2; controles de NULL, duplicação e tenant.                                                                               | Não foi executado PostgreSQL nem medido desempenho de planos.                         |
| skill-engineering               | Fixture determinística mostra um avaliador narrativo aceitando resultado incorreto e rejeitando uma alternativa válida; avaliador de contrato discrimina ambos. | Arquivo de resultados explicitamente sintético; nenhum ator executado nessa fixture.  |

Os checks locais de pacote, recursos, formatação e integridade passaram nas sete revisões. Os handoffs registram comandos, versões, fontes, tentativas malsucedidas e limitações. Compilações Java com `--release 17/21` foram executadas no JDK 25.0.3; isso não equivale a testar runtimes 17/21. Cada revisor entregou dois casos com critérios separados; esses 14 casos são material de desenvolvimento conhecido pelo autor.

## Comparação comportamental reservada

Foram executadas **seis tentativas reais de agentes em três casos de `debugging`**, uma por caso e condição: sem a skill e com a versão atual. A baseline e a candidata dessa skill eram byte a byte iguais, portanto não se criou um terceiro tratamento duplicado.

| Caso                                         | Sem skill     | Com debugging 1.1.4 | Resultado confirmado                                                               |
| -------------------------------------------- | ------------- | ------------------- | ---------------------------------------------------------------------------------- |
| H1 — relatório deve ser snapshot             | 4/4 critérios | 4/4 critérios       | Cópia defensiva e regressão que rejeita o código original.                         |
| H2 — relatório deve ser visão viva           | 4/4 critérios | 4/4 critérios       | Comportamento existente preservado e verificado.                                   |
| H3 — exportação carrega implementação antiga | 4/4 critérios | 4/4 critérios       | Classpath efetivo corrigido, biblioteca preservada, regressão pelo comando aceito. |

**Nenhuma diferença de resultado foi observada nestes casos e critérios.** São três casos, seis tentativas e 24 verificações da rubrica; as 24 verificações não são 24 tentativas independentes. H1/H2 formam um par relacionado. O coordenador inspecionou os artefatos e executou 28 comandos em cópias temporárias, incluindo controles com código/configuração originais. Todos tiveram os resultados esperados.

Os casos e critérios foram congelados antes das execuções e ficaram fora do material dos revisores. A avaliação do coordenador não foi cega; a separação de arquivos foi uma restrição por instrução, sem isolamento imposto pelo sistema operacional. O corpo da skill foi efetivamente lido nos três tratamentos com skill; `method.md` também foi lido em H3. Metadados globais podem permanecer no contexto da plataforma. Não houve medição comparável de tokens, custo ou duração total dos atores.

Este resultado no teto não estabelece equivalência nem ausência geral de valor. Também não mede o efeito das duas skills alteradas. Não houve avaliação de seleção automática, memória persistente, matriz de clientes ou produção. Próximos experimentos devem partir de lacunas de cobertura reais, com critérios definidos antecipadamente, mantendo os controles de regressão válidos. Detalhes em [resultados por critério](behavior-results.json), [exposição efetiva](behavior-exposure.json) e [comandos de conferência](behavior-technical-checks.json).

## Coordenação, preservação e validação global

As seis revisões de domínio ocorreram com a referência `skill-engineering` estável. Somente após encerrarem as escritas, um revisor trabalhou isoladamente nessa referência. Todos os sete handoffs foram inspecionados pelo coordenador antes da regeneração do índice.

O registro de cobertura usa os nomes efetivos: onda 1 (29), onda 2 (138), onda 3 (63), onda 4 (68) e Base/Piloto nesta onda (7). A soma é 305 sem sobreposição entre esses lotes. [coverage.json](coverage.json) guarda as entradas e hashes dos registros usados. As versões do inventário continuam sendo o snapshot histórico de planejamento.

O baseline registra 8.945 arquivos anteriores, incluindo o trabalho não commitado das ondas anteriores. A auditoria compara esse estado, o diff revisado, os handoffs brutos e as entradas do índice. Nenhum commit, publicação, instalação global ou alteração da configuração real de agentes foi realizado.

- `npm run registry:build`: passou; índice com 305 skills.
- `npm run verify`: passou; 393 testes, 393 passaram, 0 falhas, 0 skips. Build, boundaries, lint, formatação, índice e versões também passaram.
- Auditoria de preservação: passou; nenhuma alteração fora do escopo desta onda. Apenas as entradas de `java-memory-model` e `skill-engineering` mudaram no índice em relação ao baseline da onda. Evidências e hashes em [evidence-manifest.json](evidence-manifest.json) e [behavior-artifact-manifest.json](behavior-artifact-manifest.json); integridade final em [integrity-final.json](integrity-final.json).

Os [handoffs](handoffs/) são cópias legíveis; os [originais brutos](handoffs-raw/) preservam os bytes recebidos. A fila e a propriedade estão em [tasks.md](tasks.md) e [queue.json](queue.json). Os arquivos `.txt` de evidência são cópias de preservação e não scripts destinados a execução direta.
