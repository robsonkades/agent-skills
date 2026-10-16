# Inventário para o roadmap de evolução das skills

Data: 15/10/2026. Snapshot de **305 skills** com `skill.yaml` e `SKILL.md`,
extraído dos manifests no checkout cuja revisão base é
`bbb7d996a929e81baf735bbaab5b6e3fbf6e8503`.

Complementa o [roadmap](skills-evolution-roadmap.md). A classificação A–M aproveita
as 258 entradas de `SKILLS.md`; as outras 47 foram classificadas para este plano.
N e O são famílias propostas para Spring e DDD. Isso não altera o dicionário oficial.

Os relatórios e as capturas das avaliações concluídas permanecem no histórico do Git,
no commit `c769bd8663c3318e71017c21d0409a052807316b`. Os links dos registros abaixo
apontam para essa revisão; o roadmap e este inventário continuam na árvore de trabalho.

**Estado no snapshot: revisão individual neste programa ainda não iniciada.** A presença
na tabela não significa que a skill é deficiente ou que nunca foi revisada. Reutilizar
a evidência existente antes de criar novos casos; atualizar o estado com um registro
de revisão e validação quando a onda for executada.

Execução posterior: a cobertura de revisão individual alcançou os 305 nomes:
onda 1 (29), onda 2 (138), onda 3 (63), onda 4 (68) e onda 5 (7 nomes de Base/Piloto).
Estados, versões, evidências e limites estão nos registros das
[ondas 1](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave1-quality-2026-10-16/README.md),
[2](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave2-2026-10-16/README.md),
[3](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave3-2026-10-16/README.md),
[4](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave4-2026-10-16/README.md) e
[5](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave5-2026-10-16/README.md).
O [registro anterior da onda 1](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave1-2026-10-15.md) também permanece.
Essa cobertura não conclui o piloto experimental nem demonstra ganho geral de eficácia;
os relatórios distinguem revisão, controles técnicos e avaliações de agentes.
As versões da tabela abaixo preservam o snapshot de planejamento.

A [onda 6](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave6-2026-10-16/README.md) avaliou `java-memory-model`
em 36 tentativas: seis casos, três condições e duas repetições. Houve empate entre
ausência da skill, 1.3.5 e 1.3.6, sem ganho observado nesse conjunto. Uma qualificação
técnica posterior de DCL pertence à versão 1.3.7 e não foi medida nessa comparação.

A [onda 7](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave7-2026-10-16/README.md) avaliou
`spring-transactions-and-events` 1.1.0 em 16 tentativas: quatro casos, duas
condições e duas repetições, com compilação e reexecução independente dos reparos
e regressões. Houve empate de 8/8 com e sem carregar a skill, sem ganho observado
nesse recorte; o pacote permaneceu inalterado.

A [onda 8](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave8-2026-10-16/README.md) avaliou
`sql-query-performance` 1.2.3 em 16 tentativas: quatro casos, duas condições e
duas repetições. A reexecução semântica local e o julgamento textual independente
resultaram em empate de 8/8 com e sem a skill, sem ganho observado nesse conjunto.
As 12 regressões SQL detectaram variantes incorretas; a execução local usou
SQLite, sem validar planos ou desempenho do PostgreSQL. O pacote permaneceu
inalterado.

A [onda 9](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave9-2026-10-16/README.md) corrigiu o exemplo de
`retries-and-backoff` de 1.1.4 para 1.1.5: um efeito desconhecido agora conserva
o conselho de espera do servidor, inclusive quando o replay é permitido.
Em 24 sessões, houve empate de 8/8 entre dependências comuns, dependências com
a referência e dependências com a candidata, sem ganho marginal observado
nesses quatro casos autorais. As 18 regressões Java passaram nos reparos e
detectaram o original incorreto; os controles do trecho da skill passaram de
9/11 para 11/11. Compatibilidade de fonte/API foi verificada na VM 25, sem
demonstrar garantias de provedor, desempenho ou generalização.

A [onda 10](https://github.com/robsonkades/agent-skills/blob/c769bd8663c3318e71017c21d0409a052807316b/docs/skill-validation/wave10-2026-10-16/README.md) concluiu o sexto piloto,
`architecture-trade-off-analysis`, de 1.2.4 para 1.2.5. A correção distingue exemplos
distribuídos de critérios privados, execução de avaliação de isolamento imposto,
e evidência documental de ganho comportamental. Em 24 sessões novas, com quatro
famílias e duas rodadas sequenciais, houve empate de 8/8 sem carregar o corpo local,
com a referência e com a candidata. O julgamento independente concordou nos
192 critérios; eles não são 192 tentativas. Nenhum ganho foi observado nesse conjunto.
Os seis pilotos comparativos previstos estão executados, sem estabelecer melhoria
geral das 305 skills, descoberta automática, custo ou resultados em produção.

As fontes iniciais e os critérios de pesquisa de cada família estão na seção 4 do
roadmap. A revisão individual deverá acrescentar as fontes específicas das decisões
da skill. Este inventário garante cobertura de planejamento, não pesquisa técnica
completa de todos os arquivos.

## Ordem proposta

| Marcador | Trabalho                                                                   | Dependência                                      |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| Base     | `skill-engineering`, isoladamente.                                         | Baseline e critérios do programa.                |
| Piloto   | Seis skills para calibrar pesquisa, avaliação e custo.                     | Referência de revisão estável.                   |
| 1        | Processo e testes restantes.                                               | Método do piloto reproduzível.                   |
| 2        | Domínios com maior exposição a falhas operacionais e evidência executável. | Verificadores e fixtures apropriados ao lote.    |
| 3        | JVM, linguagem e plataforma restantes.                                     | Toolchains e documentação da versão disponíveis. |
| 4        | Padrões, arquitetura e domínio restantes.                                  | Rubricas e cenários de decisão calibrados.       |

Essa ordem é inicial. Um defeito demonstrado, uso frequente ou mudança de versão
pode antecipar qualquer skill. Não há dados de uso neste levantamento para afirmar
quais pacotes são mais utilizados. Dentro de um lote explicitamente selecionado,
aplicar a fila e a propriedade por skill do workflow paralelo existente.

## Cobertura por família

| Família                                        |  Skills | Onda padrão |
| ---------------------------------------------- | ------: | ----------: |
| A — Memória e garbage collection               |      19 |           2 |
| B — Execução e compilação JVM                  |      18 |           3 |
| C — Medição, profiling e observabilidade       |      33 |           2 |
| D — Concorrência e paralelismo                 |      23 |           2 |
| E — Plataforma, sistema operacional e hardware |      12 |           3 |
| F — Sistemas distribuídos e mensageria         |      45 |           2 |
| G — Linguagem e contratos Java                 |      33 |           3 |
| H — Padrões de projeto GoF                     |      28 |           4 |
| I — Arquitetura de aplicações                  |      21 |           4 |
| J — Governança e evolução arquitetural         |      11 |           4 |
| K — Testes                                     |       6 |           1 |
| L — Processo de engenharia e entrega           |      25 |           1 |
| M — Dados e performance                        |      12 |           2 |
| N — Spring                                     |      10 |           2 |
| O — Domain-driven design                       |       9 |           4 |
| **Total**                                      | **305** |             |

## A — Memória e garbage collection

| Skill                                                                                   | Versão no levantamento | Onda |
| --------------------------------------------------------------------------------------- | ---------------------- | ---- |
| [allocation-profiling](../skills/allocation-profiling/SKILL.md)                         | 2.1.4                  | 2    |
| [epsilon-and-shenandoah-internals](../skills/epsilon-and-shenandoah-internals/SKILL.md) | 2.1.4                  | 2    |
| [g1-concurrent-marking](../skills/g1-concurrent-marking/SKILL.md)                       | 1.3.4                  | 2    |
| [g1-internals](../skills/g1-internals/SKILL.md)                                         | 1.3.4                  | 2    |
| [g1-tuning-for-slo](../skills/g1-tuning-for-slo/SKILL.md)                               | 2.1.4                  | 2    |
| [gc-fundamentals](../skills/gc-fundamentals/SKILL.md)                                   | 1.4.4                  | 2    |
| [gc-log-analysis](../skills/gc-log-analysis/SKILL.md)                                   | 1.4.4                  | 2    |
| [heap-dump-analysis](../skills/heap-dump-analysis/SKILL.md)                             | 1.3.5                  | 2    |
| [java-reference-types-and-leaks](../skills/java-reference-types-and-leaks/SKILL.md)     | 1.3.4                  | 2    |
| [jhsdb-and-core-dumps](../skills/jhsdb-and-core-dumps/SKILL.md)                         | 1.3.4                  | 2    |
| [jvm-gc-tuning](../skills/jvm-gc-tuning/SKILL.md)                                       | 2.5.4                  | 2    |
| [jvm-memory-regions](../skills/jvm-memory-regions/SKILL.md)                             | 1.6.5                  | 2    |
| [metaspace-internals](../skills/metaspace-internals/SKILL.md)                           | 1.3.4                  | 2    |
| [object-layout-and-footprint](../skills/object-layout-and-footprint/SKILL.md)           | 1.4.4                  | 2    |
| [off-heap-memory](../skills/off-heap-memory/SKILL.md)                                   | 1.3.3                  | 2    |
| [pause-attribution](../skills/pause-attribution/SKILL.md)                               | 1.4.4                  | 2    |
| [safepoints](../skills/safepoints/SKILL.md)                                             | 1.3.4                  | 2    |
| [zgc-and-shenandoah](../skills/zgc-and-shenandoah/SKILL.md)                             | 1.3.3                  | 2    |
| [zgc-generational-internals](../skills/zgc-generational-internals/SKILL.md)             | 1.3.4                  | 2    |

## B — Execução e compilação JVM

| Skill                                                                                       | Versão no levantamento | Onda |
| ------------------------------------------------------------------------------------------- | ---------------------- | ---- |
| [c2-sea-of-nodes](../skills/c2-sea-of-nodes/SKILL.md)                                       | 1.4.5                  | 3    |
| [code-cache-segments](../skills/code-cache-segments/SKILL.md)                               | 2.1.4                  | 3    |
| [compilation-and-inlining-logs](../skills/compilation-and-inlining-logs/SKILL.md)           | 2.0.4                  | 3    |
| [deoptimization](../skills/deoptimization/SKILL.md)                                         | 2.1.4                  | 3    |
| [escape-analysis-internals](../skills/escape-analysis-internals/SKILL.md)                   | 2.0.4                  | 3    |
| [graalvm-jit](../skills/graalvm-jit/SKILL.md)                                               | 2.1.4                  | 3    |
| [graalvm-native-image](../skills/graalvm-native-image/SKILL.md)                             | 2.0.4                  | 3    |
| [java-reflection-and-method-handles](../skills/java-reflection-and-method-handles/SKILL.md) | 1.4.5                  | 3    |
| [jdk-upgrade-impact](../skills/jdk-upgrade-impact/SKILL.md)                                 | 1.2.5                  | 3    |
| [jit-compilation](../skills/jit-compilation/SKILL.md)                                       | 1.3.4                  | 3    |
| [jit-inlining-and-escape-analysis](../skills/jit-inlining-and-escape-analysis/SKILL.md)     | 2.1.3                  | 3    |
| [jni-and-ffm](../skills/jni-and-ffm/SKILL.md)                                               | 1.3.4                  | 3    |
| [jvm-bytecode](../skills/jvm-bytecode/SKILL.md)                                             | 2.1.5                  | 3    |
| [jvm-class-loading](../skills/jvm-class-loading/SKILL.md)                                   | 1.4.4                  | 3    |
| [project-valhalla](../skills/project-valhalla/SKILL.md)                                     | 1.0.4                  | 3    |
| [reading-jit-assembly](../skills/reading-jit-assembly/SKILL.md)                             | 1.2.4                  | 3    |
| [simd-and-vector-api](../skills/simd-and-vector-api/SKILL.md)                               | 1.2.5                  | 3    |
| [startup-cds-crac-leyden](../skills/startup-cds-crac-leyden/SKILL.md)                       | 2.1.4                  | 3    |

## C — Medição, profiling e observabilidade

| Skill                                                                                 | Versão no levantamento | Onda |
| ------------------------------------------------------------------------------------- | ---------------------- | ---- |
| [architecture-and-performance](../skills/architecture-and-performance/SKILL.md)       | 1.3.4                  | 2    |
| [async-profiler-advanced](../skills/async-profiler-advanced/SKILL.md)                 | 1.3.4                  | 2    |
| [capacity-planning](../skills/capacity-planning/SKILL.md)                             | 1.3.4                  | 2    |
| [continuous-profiling](../skills/continuous-profiling/SKILL.md)                       | 1.3.4                  | 2    |
| [coordinated-omission](../skills/coordinated-omission/SKILL.md)                       | 1.3.4                  | 2    |
| [distributed-tracing-design](../skills/distributed-tracing-design/SKILL.md)           | 1.3.4                  | 2    |
| [ebpf-for-jvm](../skills/ebpf-for-jvm/SKILL.md)                                       | 2.1.4                  | 2    |
| [flame-graph-analysis](../skills/flame-graph-analysis/SKILL.md)                       | 1.4.4                  | 2    |
| [incident-evidence-capture](../skills/incident-evidence-capture/SKILL.md)             | 1.3.4                  | 2    |
| [java-performance](../skills/java-performance/SKILL.md)                               | 2.6.5                  | 2    |
| [jfr-advanced](../skills/jfr-advanced/SKILL.md)                                       | 1.3.4                  | 2    |
| [jfr-and-async-profiler](../skills/jfr-and-async-profiler/SKILL.md)                   | 1.4.4                  | 2    |
| [jmh-advanced](../skills/jmh-advanced/SKILL.md)                                       | 1.2.4                  | 2    |
| [jmh-microbenchmarks](../skills/jmh-microbenchmarks/SKILL.md)                         | 1.4.3                  | 2    |
| [jvm-ml-inference](../skills/jvm-ml-inference/SKILL.md)                               | 1.0.4                  | 2    |
| [jvm-performance-review](../skills/jvm-performance-review/SKILL.md)                   | 1.3.3                  | 2    |
| [latency-statistics](../skills/latency-statistics/SKILL.md)                           | 1.4.5                  | 2    |
| [littles-law-and-queueing](../skills/littles-law-and-queueing/SKILL.md)               | 1.5.5                  | 2    |
| [load-testing](../skills/load-testing/SKILL.md)                                       | 1.4.3                  | 2    |
| [load-testing-advanced](../skills/load-testing-advanced/SKILL.md)                     | 1.3.3                  | 2    |
| [low-latency-jvm](../skills/low-latency-jvm/SKILL.md)                                 | 1.0.4                  | 2    |
| [metrics-and-cardinality](../skills/metrics-and-cardinality/SKILL.md)                 | 1.3.4                  | 2    |
| [opentelemetry-performance](../skills/opentelemetry-performance/SKILL.md)             | 1.2.4                  | 2    |
| [performance-engineering-program](../skills/performance-engineering-program/SKILL.md) | 1.0.3                  | 2    |
| [performance-incident-response](../skills/performance-incident-response/SKILL.md)     | 1.0.4                  | 2    |
| [performance-methodology](../skills/performance-methodology/SKILL.md)                 | 1.4.5                  | 2    |
| [performance-regression-ci](../skills/performance-regression-ci/SKILL.md)             | 1.1.4                  | 2    |
| [queueing-models](../skills/queueing-models/SKILL.md)                                 | 1.3.5                  | 2    |
| [slo-and-alerting](../skills/slo-and-alerting/SKILL.md)                               | 1.4.4                  | 2    |
| [structured-logging](../skills/structured-logging/SKILL.md)                           | 1.4.4                  | 2    |
| [tail-latency-analysis](../skills/tail-latency-analysis/SKILL.md)                     | 1.3.4                  | 2    |
| [unified-logging](../skills/unified-logging/SKILL.md)                                 | 1.2.3                  | 2    |
| [universal-scalability-law](../skills/universal-scalability-law/SKILL.md)             | 1.2.4                  | 2    |

## D — Concorrência e paralelismo

| Skill                                                                                                   | Versão no levantamento | Onda   |
| ------------------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| [blocking-and-nonblocking-io](../skills/blocking-and-nonblocking-io/SKILL.md)                           | 1.3.4                  | 2      |
| [cancellation-and-interruption](../skills/cancellation-and-interruption/SKILL.md)                       | 1.1.4                  | 2      |
| [completablefuture-composition](../skills/completablefuture-composition/SKILL.md)                       | 1.2.4                  | 2      |
| [concurrency-diagnostics](../skills/concurrency-diagnostics/SKILL.md)                                   | 1.3.4                  | 2      |
| [concurrency-limiting-and-bulkheads](../skills/concurrency-limiting-and-bulkheads/SKILL.md)             | 1.3.5                  | 2      |
| [concurrency-testing](../skills/concurrency-testing/SKILL.md)                                           | 1.1.4                  | 2      |
| [concurrent-collections-and-synchronizers](../skills/concurrent-collections-and-synchronizers/SKILL.md) | 1.2.5                  | 2      |
| [executors-and-task-lifecycle](../skills/executors-and-task-lifecycle/SKILL.md)                         | 1.3.4                  | 2      |
| [false-sharing-and-contended](../skills/false-sharing-and-contended/SKILL.md)                           | 1.1.4                  | 2      |
| [forkjoinpool-and-work-stealing](../skills/forkjoinpool-and-work-stealing/SKILL.md)                     | 1.1.4                  | 2      |
| [java-concurrency](../skills/java-concurrency/SKILL.md)                                                 | 1.2.5                  | 2      |
| [java-memory-model](../skills/java-memory-model/SKILL.md)                                               | 1.3.5                  | Piloto |
| [java-thread-safety-contracts](../skills/java-thread-safety-contracts/SKILL.md)                         | 1.2.4                  | 2      |
| [lock-free-patterns](../skills/lock-free-patterns/SKILL.md)                                             | 1.2.4                  | 2      |
| [lock-inflation](../skills/lock-inflation/SKILL.md)                                                     | 1.2.4                  | 2      |
| [reactive-and-virtual-thread-selection](../skills/reactive-and-virtual-thread-selection/SKILL.md)       | 1.3.5                  | 2      |
| [reactive-backpressure](../skills/reactive-backpressure/SKILL.md)                                       | 1.1.4                  | 2      |
| [scoped-values](../skills/scoped-values/SKILL.md)                                                       | 1.3.3                  | 2      |
| [structured-concurrency](../skills/structured-concurrency/SKILL.md)                                     | 1.3.5                  | 2      |
| [thread-sizing-and-virtual-threads](../skills/thread-sizing-and-virtual-threads/SKILL.md)               | 1.3.5                  | 2      |
| [varhandles-and-memory-ordering](../skills/varhandles-and-memory-ordering/SKILL.md)                     | 1.2.4                  | 2      |
| [virtual-thread-migration](../skills/virtual-thread-migration/SKILL.md)                                 | 1.3.4                  | 2      |
| [virtual-threads-internals](../skills/virtual-threads-internals/SKILL.md)                               | 1.1.3                  | 2      |

## E — Plataforma, sistema operacional e hardware

| Skill                                                                                         | Versão no levantamento | Onda |
| --------------------------------------------------------------------------------------------- | ---------------------- | ---- |
| [adapter-sidecar-pattern](../skills/adapter-sidecar-pattern/SKILL.md)                         | 2.3.3                  | 3    |
| [ambassador-pattern](../skills/ambassador-pattern/SKILL.md)                                   | 1.3.4                  | 3    |
| [container-awareness](../skills/container-awareness/SKILL.md)                                 | 1.2.4                  | 3    |
| [cpu-cache-and-numa](../skills/cpu-cache-and-numa/SKILL.md)                                   | 1.3.4                  | 3    |
| [grpc-http2-service-mesh-performance](../skills/grpc-http2-service-mesh-performance/SKILL.md) | 1.0.4                  | 3    |
| [io-uring-and-zero-copy](../skills/io-uring-and-zero-copy/SKILL.md)                           | 1.2.4                  | 3    |
| [kubernetes-service-lifecycle](../skills/kubernetes-service-lifecycle/SKILL.md)               | 1.3.4                  | 3    |
| [linux-for-jvm](../skills/linux-for-jvm/SKILL.md)                                             | 1.3.4                  | 3    |
| [numa-and-cpu-affinity](../skills/numa-and-cpu-affinity/SKILL.md)                             | 1.2.4                  | 3    |
| [serialization-performance](../skills/serialization-performance/SKILL.md)                     | 1.1.4                  | 3    |
| [sidecar-pattern](../skills/sidecar-pattern/SKILL.md)                                         | 1.3.5                  | 3    |
| [tcp-tuning](../skills/tcp-tuning/SKILL.md)                                                   | 1.2.4                  | 3    |

## F — Sistemas distribuídos e mensageria

| Skill                                                                                             | Versão no levantamento | Onda   |
| ------------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| [api-gateway-and-bff](../skills/api-gateway-and-bff/SKILL.md)                                     | 1.0.0                  | 2      |
| [cache-sharding-and-replication](../skills/cache-sharding-and-replication/SKILL.md)               | 1.3.5                  | 2      |
| [caching-strategies](../skills/caching-strategies/SKILL.md)                                       | 1.2.4                  | 2      |
| [cascading-failures](../skills/cascading-failures/SKILL.md)                                       | 1.3.4                  | 2      |
| [circuit-breakers](../skills/circuit-breakers/SKILL.md)                                           | 1.3.4                  | 2      |
| [consensus-and-quorums](../skills/consensus-and-quorums/SKILL.md)                                 | 1.2.5                  | 2      |
| [consistency-models](../skills/consistency-models/SKILL.md)                                       | 1.3.5                  | 2      |
| [consistent-hashing](../skills/consistent-hashing/SKILL.md)                                       | 1.2.4                  | 2      |
| [cross-service-query-design](../skills/cross-service-query-design/SKILL.md)                       | 1.0.0                  | 2      |
| [delivery-semantics](../skills/delivery-semantics/SKILL.md)                                       | 1.2.4                  | 2      |
| [distributed-aggregation-and-barriers](../skills/distributed-aggregation-and-barriers/SKILL.md)   | 1.3.5                  | 2      |
| [distributed-failure-catalogue](../skills/distributed-failure-catalogue/SKILL.md)                 | 1.3.4                  | 2      |
| [distributed-locks-and-leases](../skills/distributed-locks-and-leases/SKILL.md)                   | 1.3.4                  | 2      |
| [distributed-systems](../skills/distributed-systems/SKILL.md)                                     | 1.3.4                  | 2      |
| [distributed-systems-testing](../skills/distributed-systems-testing/SKILL.md)                     | 1.1.4                  | 2      |
| [distributed-transactions-and-sagas](../skills/distributed-transactions-and-sagas/SKILL.md)       | 1.3.5                  | 2      |
| [distribution-boundaries](../skills/distribution-boundaries/SKILL.md)                             | 1.2.4                  | 2      |
| [event-driven-architecture](../skills/event-driven-architecture/SKILL.md)                         | 1.3.4                  | 2      |
| [event-sourcing](../skills/event-sourcing/SKILL.md)                                               | 1.2.4                  | 2      |
| [failure-models](../skills/failure-models/SKILL.md)                                               | 1.3.5                  | 2      |
| [gof-patterns-and-distribution](../skills/gof-patterns-and-distribution/SKILL.md)                 | 1.3.4                  | 2      |
| [hot-partitions-and-rebalancing](../skills/hot-partitions-and-rebalancing/SKILL.md)               | 1.3.5                  | 2      |
| [idempotency](../skills/idempotency/SKILL.md)                                                     | 1.2.4                  | 2      |
| [kafka-consumers-in-java](../skills/kafka-consumers-in-java/SKILL.md)                             | 1.3.4                  | 2      |
| [leader-election](../skills/leader-election/SKILL.md)                                             | 1.3.4                  | 2      |
| [load-balancing-and-routing](../skills/load-balancing-and-routing/SKILL.md)                       | 1.2.4                  | 2      |
| [message-ordering-and-partitioning](../skills/message-ordering-and-partitioning/SKILL.md)         | 1.3.5                  | 2      |
| [microservices-architecture](../skills/microservices-architecture/SKILL.md)                       | 1.0.0                  | 2      |
| [poison-messages-and-dlq](../skills/poison-messages-and-dlq/SKILL.md)                             | 1.2.4                  | 2      |
| [progressive-service-delivery](../skills/progressive-service-delivery/SKILL.md)                   | 1.0.0                  | 2      |
| [rate-limiting-and-load-shedding](../skills/rate-limiting-and-load-shedding/SKILL.md)             | 1.3.4                  | 2      |
| [retries-and-backoff](../skills/retries-and-backoff/SKILL.md)                                     | 1.1.4                  | Piloto |
| [rpc-and-api-contracts](../skills/rpc-and-api-contracts/SKILL.md)                                 | 1.1.3                  | 2      |
| [scatter-gather](../skills/scatter-gather/SKILL.md)                                               | 1.3.4                  | 2      |
| [schema-evolution-and-compatibility](../skills/schema-evolution-and-compatibility/SKILL.md)       | 1.2.5                  | 2      |
| [service-data-ownership](../skills/service-data-ownership/SKILL.md)                               | 1.0.0                  | 2      |
| [service-discovery](../skills/service-discovery/SKILL.md)                                         | 1.0.0                  | 2      |
| [service-identity-and-trust](../skills/service-identity-and-trust/SKILL.md)                       | 1.0.0                  | 2      |
| [session-state-strategies](../skills/session-state-strategies/SKILL.md)                           | 1.1.4                  | 2      |
| [sharding-and-partitioning](../skills/sharding-and-partitioning/SKILL.md)                         | 1.3.4                  | 2      |
| [stateless-service-design](../skills/stateless-service-design/SKILL.md)                           | 1.2.4                  | 2      |
| [stream-processing-runtime-performance](../skills/stream-processing-runtime-performance/SKILL.md) | 1.0.4                  | 2      |
| [streaming-pipeline-topologies](../skills/streaming-pipeline-topologies/SKILL.md)                 | 1.3.4                  | 2      |
| [task-queues-and-competing-consumers](../skills/task-queues-and-competing-consumers/SKILL.md)     | 1.3.5                  | 2      |
| [timeouts-and-deadlines](../skills/timeouts-and-deadlines/SKILL.md)                               | 1.1.5                  | 2      |

## G — Linguagem e contratos Java

| Skill                                                                                               | Versão no levantamento | Onda |
| --------------------------------------------------------------------------------------------------- | ---------------------- | ---- |
| [java-annotations](../skills/java-annotations/SKILL.md)                                             | 1.2.4                  | 3    |
| [java-api-design](../skills/java-api-design/SKILL.md)                                               | 1.2.5                  | 3    |
| [java-application-security-basics](../skills/java-application-security-basics/SKILL.md)             | 1.3.5                  | 3    |
| [java-build-and-dependencies](../skills/java-build-and-dependencies/SKILL.md)                       | 1.0.1                  | 3    |
| [java-clean-code](../skills/java-clean-code/SKILL.md)                                               | 2.2.4                  | 3    |
| [java-code-smells](../skills/java-code-smells/SKILL.md)                                             | 1.4.4                  | 3    |
| [java-cohesion-coupling](../skills/java-cohesion-coupling/SKILL.md)                                 | 1.2.4                  | 3    |
| [java-composition-over-inheritance](../skills/java-composition-over-inheritance/SKILL.md)           | 1.2.5                  | 3    |
| [java-date-and-time](../skills/java-date-and-time/SKILL.md)                                         | 1.0.1                  | 3    |
| [java-defensive-programming](../skills/java-defensive-programming/SKILL.md)                         | 1.2.4                  | 3    |
| [java-dependency-inversion](../skills/java-dependency-inversion/SKILL.md)                           | 1.2.4                  | 3    |
| [java-design-by-contract](../skills/java-design-by-contract/SKILL.md)                               | 1.2.4                  | 3    |
| [java-dry-kiss-yagni](../skills/java-dry-kiss-yagni/SKILL.md)                                       | 1.2.3                  | 3    |
| [java-enums](../skills/java-enums/SKILL.md)                                                         | 1.2.4                  | 3    |
| [java-exception-design](../skills/java-exception-design/SKILL.md)                                   | 1.3.4                  | 3    |
| [java-fluent-apis](../skills/java-fluent-apis/SKILL.md)                                             | 1.2.5                  | 3    |
| [java-generics](../skills/java-generics/SKILL.md)                                                   | 1.2.4                  | 3    |
| [java-immutability](../skills/java-immutability/SKILL.md)                                           | 1.2.4                  | 3    |
| [java-lambdas-and-functional-interfaces](../skills/java-lambdas-and-functional-interfaces/SKILL.md) | 1.3.5                  | 3    |
| [java-law-of-demeter](../skills/java-law-of-demeter/SKILL.md)                                       | 1.2.4                  | 3    |
| [java-null-safety](../skills/java-null-safety/SKILL.md)                                             | 1.2.4                  | 3    |
| [java-numeric-types](../skills/java-numeric-types/SKILL.md)                                         | 1.2.4                  | 3    |
| [java-object-construction](../skills/java-object-construction/SKILL.md)                             | 1.3.5                  | 3    |
| [java-object-contracts](../skills/java-object-contracts/SKILL.md)                                   | 1.2.4                  | 3    |
| [java-optional](../skills/java-optional/SKILL.md)                                                   | 1.2.4                  | 3    |
| [java-refactoring](../skills/java-refactoring/SKILL.md)                                             | 1.4.4                  | 3    |
| [java-resource-management](../skills/java-resource-management/SKILL.md)                             | 1.2.4                  | 3    |
| [java-serialization-hardening](../skills/java-serialization-hardening/SKILL.md)                     | 1.2.4                  | 3    |
| [java-solid](../skills/java-solid/SKILL.md)                                                         | 1.2.4                  | 3    |
| [java-streams](../skills/java-streams/SKILL.md)                                                     | 1.2.4                  | 3    |
| [java-strings-and-text](../skills/java-strings-and-text/SKILL.md)                                   | 1.2.3                  | 3    |
| [java-tell-dont-ask](../skills/java-tell-dont-ask/SKILL.md)                                         | 1.2.4                  | 3    |
| [refactoring-automation](../skills/refactoring-automation/SKILL.md)                                 | 1.1.5                  | 3    |

## H — Padrões de projeto GoF

| Skill                                                                         | Versão no levantamento | Onda |
| ----------------------------------------------------------------------------- | ---------------------- | ---- |
| [gof-abstract-factory](../skills/gof-abstract-factory/SKILL.md)               | 1.2.4                  | 4    |
| [gof-adapter](../skills/gof-adapter/SKILL.md)                                 | 1.3.4                  | 4    |
| [gof-bridge](../skills/gof-bridge/SKILL.md)                                   | 1.2.4                  | 4    |
| [gof-builder](../skills/gof-builder/SKILL.md)                                 | 1.2.5                  | 4    |
| [gof-chain-of-responsibility](../skills/gof-chain-of-responsibility/SKILL.md) | 1.2.4                  | 4    |
| [gof-command](../skills/gof-command/SKILL.md)                                 | 1.2.4                  | 4    |
| [gof-composite](../skills/gof-composite/SKILL.md)                             | 1.2.4                  | 4    |
| [gof-decorator](../skills/gof-decorator/SKILL.md)                             | 1.2.4                  | 4    |
| [gof-facade](../skills/gof-facade/SKILL.md)                                   | 1.2.4                  | 4    |
| [gof-factory-method](../skills/gof-factory-method/SKILL.md)                   | 1.2.4                  | 4    |
| [gof-flyweight](../skills/gof-flyweight/SKILL.md)                             | 1.2.4                  | 4    |
| [gof-interpreter](../skills/gof-interpreter/SKILL.md)                         | 1.2.4                  | 4    |
| [gof-iterator](../skills/gof-iterator/SKILL.md)                               | 1.2.4                  | 4    |
| [gof-mediator](../skills/gof-mediator/SKILL.md)                               | 1.2.4                  | 4    |
| [gof-memento](../skills/gof-memento/SKILL.md)                                 | 1.2.4                  | 4    |
| [gof-observer](../skills/gof-observer/SKILL.md)                               | 1.2.4                  | 4    |
| [gof-pattern-antipatterns](../skills/gof-pattern-antipatterns/SKILL.md)       | 1.2.4                  | 4    |
| [gof-pattern-confusion](../skills/gof-pattern-confusion/SKILL.md)             | 1.2.4                  | 4    |
| [gof-pattern-selection](../skills/gof-pattern-selection/SKILL.md)             | 1.3.4                  | 4    |
| [gof-pattern-thinking](../skills/gof-pattern-thinking/SKILL.md)               | 1.3.4                  | 4    |
| [gof-patterns-in-modern-java](../skills/gof-patterns-in-modern-java/SKILL.md) | 1.3.4                  | 4    |
| [gof-prototype](../skills/gof-prototype/SKILL.md)                             | 1.2.3                  | 4    |
| [gof-proxy](../skills/gof-proxy/SKILL.md)                                     | 1.2.4                  | 4    |
| [gof-singleton](../skills/gof-singleton/SKILL.md)                             | 1.2.4                  | 4    |
| [gof-state](../skills/gof-state/SKILL.md)                                     | 1.2.4                  | 4    |
| [gof-strategy](../skills/gof-strategy/SKILL.md)                               | 1.2.4                  | 4    |
| [gof-template-method](../skills/gof-template-method/SKILL.md)                 | 1.2.4                  | 4    |
| [gof-visitor](../skills/gof-visitor/SKILL.md)                                 | 1.2.4                  | 4    |

## I — Arquitetura de aplicações

| Skill                                                                                         | Versão no levantamento | Onda |
| --------------------------------------------------------------------------------------------- | ---------------------- | ---- |
| [data-source-patterns](../skills/data-source-patterns/SKILL.md)                               | 1.3.4                  | 4    |
| [domain-logic-organization](../skills/domain-logic-organization/SKILL.md)                     | 1.3.5                  | 4    |
| [enterprise-application-architecture](../skills/enterprise-application-architecture/SKILL.md) | 1.2.6                  | 4    |
| [enterprise-architecture-smells](../skills/enterprise-architecture-smells/SKILL.md)           | 1.2.4                  | 4    |
| [enterprise-base-patterns](../skills/enterprise-base-patterns/SKILL.md)                       | 1.2.5                  | 4    |
| [enterprise-transactions](../skills/enterprise-transactions/SKILL.md)                         | 1.3.4                  | 4    |
| [humble-objects-and-functional-core](../skills/humble-objects-and-functional-core/SKILL.md)   | 1.2.4                  | 4    |
| [inheritance-mapping-strategies](../skills/inheritance-mapping-strategies/SKILL.md)           | 1.3.4                  | 4    |
| [layering-and-boundaries](../skills/layering-and-boundaries/SKILL.md)                         | 1.2.4                  | 4    |
| [metadata-mapping](../skills/metadata-mapping/SKILL.md)                                       | 1.3.4                  | 4    |
| [mvc-and-request-handling](../skills/mvc-and-request-handling/SKILL.md)                       | 1.3.5                  | 4    |
| [offline-concurrency-control](../skills/offline-concurrency-control/SKILL.md)                 | 1.2.4                  | 4    |
| [orm-behavioral-patterns](../skills/orm-behavioral-patterns/SKILL.md)                         | 1.3.4                  | 4    |
| [orm-structural-mapping](../skills/orm-structural-mapping/SKILL.md)                           | 1.3.4                  | 4    |
| [pattern-selection-and-composition](../skills/pattern-selection-and-composition/SKILL.md)     | 1.3.5                  | 4    |
| [patterns-and-modern-frameworks](../skills/patterns-and-modern-frameworks/SKILL.md)           | 1.2.4                  | 4    |
| [query-objects-and-specifications](../skills/query-objects-and-specifications/SKILL.md)       | 1.3.4                  | 4    |
| [remote-facade-and-dto](../skills/remote-facade-and-dto/SKILL.md)                             | 1.3.4                  | 4    |
| [repository-pattern](../skills/repository-pattern/SKILL.md)                                   | 1.3.4                  | 4    |
| [service-layer-design](../skills/service-layer-design/SKILL.md)                               | 1.2.4                  | 4    |
| [view-and-representation-patterns](../skills/view-and-representation-patterns/SKILL.md)       | 1.3.3                  | 4    |

## J — Governança e evolução arquitetural

| Skill                                                                                         | Versão no levantamento | Onda   |
| --------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| [architecture-characteristics](../skills/architecture-characteristics/SKILL.md)               | 1.2.3                  | 4      |
| [architecture-coupling-and-quanta](../skills/architecture-coupling-and-quanta/SKILL.md)       | 1.1.5                  | 4      |
| [architecture-decision-making](../skills/architecture-decision-making/SKILL.md)               | 2.1.4                  | 4      |
| [architecture-fitness-functions](../skills/architecture-fitness-functions/SKILL.md)           | 1.3.3                  | 4      |
| [architecture-refactoring-paths](../skills/architecture-refactoring-paths/SKILL.md)           | 1.4.3                  | 4      |
| [architecture-testing](../skills/architecture-testing/SKILL.md)                               | 1.3.4                  | 4      |
| [architecture-trade-off-analysis](../skills/architecture-trade-off-analysis/SKILL.md)         | 1.2.4                  | Piloto |
| [component-and-release-boundaries](../skills/component-and-release-boundaries/SKILL.md)       | 1.2.4                  | 4      |
| [framework-coupling-and-independence](../skills/framework-coupling-and-independence/SKILL.md) | 1.2.5                  | 4      |
| [legacy-enterprise-modernization](../skills/legacy-enterprise-modernization/SKILL.md)         | 1.2.3                  | 4      |
| [technical-debt-decisions](../skills/technical-debt-decisions/SKILL.md)                       | 1.1.4                  | 4      |

## K — Testes

| Skill                                                                   | Versão no levantamento | Onda |
| ----------------------------------------------------------------------- | ---------------------- | ---- |
| [java-legacy-code-testing](../skills/java-legacy-code-testing/SKILL.md) | 1.1.4                  | 1    |
| [java-test-design](../skills/java-test-design/SKILL.md)                 | 1.0.4                  | 1    |
| [java-test-doubles](../skills/java-test-doubles/SKILL.md)               | 1.0.5                  | 1    |
| [java-testing-strategy](../skills/java-testing-strategy/SKILL.md)       | 1.0.5                  | 1    |
| [quality-gates](../skills/quality-gates/SKILL.md)                       | 1.0.6                  | 1    |
| [tdd](../skills/tdd/SKILL.md)                                           | 1.0.3                  | 1    |

## L — Processo de engenharia e entrega

| Skill                                                                                     | Versão no levantamento | Onda   |
| ----------------------------------------------------------------------------------------- | ---------------------- | ------ |
| [clean-delivery-workflow](../skills/clean-delivery-workflow/SKILL.md)                     | 1.1.5                  | 1      |
| [code-review](../skills/code-review/SKILL.md)                                             | 1.0.5                  | 1      |
| [coding-agent-discipline](../skills/coding-agent-discipline/SKILL.md)                     | 1.0.4                  | 1      |
| [collaborative-feature-definition](../skills/collaborative-feature-definition/SKILL.md)   | 1.1.4                  | 1      |
| [debugging](../skills/debugging/SKILL.md)                                                 | 1.1.4                  | Piloto |
| [engineering-communication](../skills/engineering-communication/SKILL.md)                 | 1.1.4                  | 1      |
| [estimation-under-uncertainty](../skills/estimation-under-uncertainty/SKILL.md)           | 1.1.4                  | 1      |
| [feature-architecture-analysis](../skills/feature-architecture-analysis/SKILL.md)         | 1.1.4                  | 1      |
| [feature-context-analysis](../skills/feature-context-analysis/SKILL.md)                   | 1.1.4                  | 1      |
| [feature-contract-definition](../skills/feature-contract-definition/SKILL.md)             | 1.0.5                  | 1      |
| [feature-decision-analysis](../skills/feature-decision-analysis/SKILL.md)                 | 1.2.5                  | 1      |
| [feature-decomposition](../skills/feature-decomposition/SKILL.md)                         | 1.1.4                  | 1      |
| [feature-discovery](../skills/feature-discovery/SKILL.md)                                 | 1.1.4                  | 1      |
| [feature-engineering](../skills/feature-engineering/SKILL.md)                             | 1.1.6                  | 1      |
| [feature-execution](../skills/feature-execution/SKILL.md)                                 | 1.1.4                  | 1      |
| [feature-feasibility-experiment](../skills/feature-feasibility-experiment/SKILL.md)       | 1.0.4                  | 1      |
| [feature-implementation-plan](../skills/feature-implementation-plan/SKILL.md)             | 1.1.5                  | 1      |
| [feature-progress-tracking](../skills/feature-progress-tracking/SKILL.md)                 | 1.2.5                  | 1      |
| [feature-readiness-review](../skills/feature-readiness-review/SKILL.md)                   | 1.2.4                  | 1      |
| [feature-requirement-clarification](../skills/feature-requirement-clarification/SKILL.md) | 1.1.4                  | 1      |
| [feature-risk-analysis](../skills/feature-risk-analysis/SKILL.md)                         | 1.2.4                  | 1      |
| [feature-scope-analysis](../skills/feature-scope-analysis/SKILL.md)                       | 1.1.4                  | 1      |
| [feature-solution-analysis](../skills/feature-solution-analysis/SKILL.md)                 | 1.1.4                  | 1      |
| [requirements-and-acceptance](../skills/requirements-and-acceptance/SKILL.md)             | 1.1.5                  | 1      |
| [skill-engineering](../skills/skill-engineering/SKILL.md)                                 | 1.0.3                  | Base   |

## M — Dados e performance

| Skill                                                                                                 | Versão no levantamento | Onda   |
| ----------------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| [change-data-capture-operations](../skills/change-data-capture-operations/SKILL.md)                   | 1.0.1                  | 2      |
| [connection-pool-sizing](../skills/connection-pool-sizing/SKILL.md)                                   | 1.2.4                  | 2      |
| [database-bulk-loading](../skills/database-bulk-loading/SKILL.md)                                     | 1.0.5                  | 2      |
| [database-engine-selection-and-migration](../skills/database-engine-selection-and-migration/SKILL.md) | 1.0.4                  | 2      |
| [database-index-design](../skills/database-index-design/SKILL.md)                                     | 1.0.4                  | 2      |
| [database-performance](../skills/database-performance/SKILL.md)                                       | 1.0.5                  | 2      |
| [mysql-innodb-performance](../skills/mysql-innodb-performance/SKILL.md)                               | 1.0.4                  | 2      |
| [online-database-schema-migrations](../skills/online-database-schema-migrations/SKILL.md)             | 1.1.1                  | 2      |
| [orm-fetch-and-batching-performance](../skills/orm-fetch-and-batching-performance/SKILL.md)           | 1.2.3                  | 2      |
| [postgresql-performance](../skills/postgresql-performance/SKILL.md)                                   | 1.0.4                  | 2      |
| [sql-query-performance](../skills/sql-query-performance/SKILL.md)                                     | 1.2.3                  | Piloto |
| [sql-server-performance](../skills/sql-server-performance/SKILL.md)                                   | 1.0.4                  | 2      |

## N — Spring

| Skill                                                                                       | Versão no levantamento | Onda   |
| ------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| [spring-boot](../skills/spring-boot/SKILL.md)                                               | 1.2.1                  | 2      |
| [spring-boot-clean-architecture](../skills/spring-boot-clean-architecture/SKILL.md)         | 1.0.1                  | 2      |
| [spring-boot-hexagonal-architecture](../skills/spring-boot-hexagonal-architecture/SKILL.md) | 1.0.1                  | 2      |
| [spring-boot-jpa](../skills/spring-boot-jpa/SKILL.md)                                       | 1.2.0                  | 2      |
| [spring-boot-observability](../skills/spring-boot-observability/SKILL.md)                   | 1.1.0                  | 2      |
| [spring-boot-testing](../skills/spring-boot-testing/SKILL.md)                               | 1.1.0                  | 2      |
| [spring-boot-web](../skills/spring-boot-web/SKILL.md)                                       | 1.2.1                  | 2      |
| [spring-http-clients](../skills/spring-http-clients/SKILL.md)                               | 1.1.0                  | 2      |
| [spring-security-for-apis](../skills/spring-security-for-apis/SKILL.md)                     | 1.2.0                  | 2      |
| [spring-transactions-and-events](../skills/spring-transactions-and-events/SKILL.md)         | 1.1.0                  | Piloto |

## O — Domain-driven design

| Skill                                                                   | Versão no levantamento | Onda |
| ----------------------------------------------------------------------- | ---------------------- | ---- |
| [bounded-context-design](../skills/bounded-context-design/SKILL.md)     | 1.0.0                  | 4    |
| [java-ddd](../skills/java-ddd/SKILL.md)                                 | 1.0.0                  | 4    |
| [java-ddd-aggregates](../skills/java-ddd-aggregates/SKILL.md)           | 1.0.0                  | 4    |
| [java-ddd-domain-events](../skills/java-ddd-domain-events/SKILL.md)     | 1.0.0                  | 4    |
| [java-ddd-domain-services](../skills/java-ddd-domain-services/SKILL.md) | 1.0.0                  | 4    |
| [java-ddd-repositories](../skills/java-ddd-repositories/SKILL.md)       | 1.0.0                  | 4    |
| [java-ddd-testing](../skills/java-ddd-testing/SKILL.md)                 | 1.0.0                  | 4    |
| [java-ddd-use-cases](../skills/java-ddd-use-cases/SKILL.md)             | 1.0.0                  | 4    |
| [java-ddd-value-objects](../skills/java-ddd-value-objects/SKILL.md)     | 1.0.0                  | 4    |

## Atualização do inventário

Reenumerar `skills/*/skill.yaml` e os respectivos `SKILL.md` ao iniciar a execução.
Conferir nomes, versões, ausência de duplicatas e soma por família. Novas skills
recebem responsável e onda; remoções e renomeações preservam a ligação com a evidência
histórica. Uma revisão sem alterações também deve registrar a decisão e seus limites.
