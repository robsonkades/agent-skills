# Auditoria de suggests — 30/09/2026

Esta etapa dá continuidade à [revisão das skills pendentes e dependências](uncommitted-skills-and-links-2026-09-30.md).
Foram verificados os 2.306 vínculos `suggests` existentes em 303 das 305 skills.
A revisão contextual removeu **12 associações sem suporte suficiente, em 10 pacotes**,
resultando em **2.294 sugestões**.

O [registro detalhado](suggests-review-2026-09-30.json) contém decisões, versões e evidência
dos 180 vínculos que não tinham referência literal reconhecida pelo scanner. A
[simulação de instalação](suggests-installation-2026-09-30.json) registra o efeito da
opção direta para cada uma das 305 skills.

## Escopo e critério

Todos os vínculos tiveram destino, duplicidade, sobreposição entre campos e efeito
sobre a resolução verificados. Os 180 vínculos de 88 origens que precisavam de
evidência contextual foram examinados em suas fontes e no escopo da skill de destino.
Desses, 168 foram preservados e 12 removidos. Onze pacotes ambíguos receberam julgamento
individual de um `skill-reviewer`; dez mudaram e um permaneceu igual.

Ausência do nome literal não foi critério de remoção. Sinônimos, exemplos concretos,
mecanismos subordinados e retorno a uma skill principal podem justificar uma sugestão.
A remoção exigiu ausência de uma decisão concreta apoiada pelo destino ou uma associação
a responsabilidades que a skill de origem não exerce. O conteúdo técnico não foi
expandido apenas para justificar metadados existentes.

Esta é uma auditoria de relacionamentos em todo o catálogo, com revisão contextual
dirigida aos casos ambíguos. Não constitui uma nova revisão técnica integral do
conteúdo das 303 skills.

## Correções aplicadas

Todas as alterações desta etapa são exclusivas a `skill.yaml`, com incremento de patch.
Textos, exemplos e testes permaneceram idênticos ao snapshot anterior a esta etapa.

| Skill                              | Versão        | Sugestão removida                         | Motivo                                                                                                                                              |
| ---------------------------------- | ------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture-coupling-and-quanta   | 1.1.4 → 1.1.5 | layering-and-boundaries                   | Medição de unidades de release não estabelece uma tarefa de desenho de camadas; há proprietários específicos para pacotes, processos e bibliotecas. |
| consensus-and-quorums              | 1.2.4 → 1.2.5 | java-memory-model                         | Coerência de revisões e recuperação de protocolo não estabelece publicação entre threads Java.                                                      |
| database-bulk-loading              | 1.0.4 → 1.0.5 | schema-evolution-and-compatibility        | Mapeamento de um formato de entrada estável não estabelece evolução entre schemas de produtores/consumidores.                                       |
| enterprise-base-patterns           | 1.2.4 → 1.2.5 | metadata-mapping; orm-behavioral-patterns | Conversão entre subsistemas não estabelece decisões de metadata, Unit of Work, Identity Map ou Lazy Load.                                           |
| feature-decision-analysis          | 1.2.4 → 1.2.5 | technical-debt-decisions                  | Registrar incerteza e autoridade não é decidir sobre aceitar, conter ou pagar um atalho.                                                            |
| feature-engineering                | 1.1.5 → 1.1.6 | estimation-under-uncertainty              | O fluxo não consome previsão de prazo/esforço; o planejamento já mantém o encaminhamento condicional pertinente.                                    |
| humble-objects-and-functional-core | 1.2.3 → 1.2.4 | thread-sizing-and-virtual-threads         | Ownership de tarefas e compartilhamento de estado não estabelecem dimensionamento ou escolha de threads virtuais.                                   |
| java-concurrency                   | 1.2.4 → 1.2.5 | tail-latency-analysis                     | Classificação de esperas e mecanismos concorrentes não estabelece uma tarefa específica de decomposição da cauda.                                   |
| java-performance                   | 2.6.4 → 2.6.5 | forkjoinpool-and-work-stealing            | O mapa não apresenta a decisão específica de DAG, granularidade, common pool ou work stealing.                                                      |
| tail-latency-analysis              | 1.3.3 → 1.3.4 | cpu-cache-and-numa; numa-and-cpu-affinity | Cache/warmup/placement genéricos não estabelecem coerência de hardware, NUMA ou binding de CPU.                                                     |

Exemplo de preservação importante: `gc-fundamentals → safepoints` continua em
`suggests`, mesmo aparecendo como proprietário em uma tabela, porque `safepoints`
já depende de `gc-fundamentals`. Promover o retorno fecharia um ciclo. A inspeção
completa e validação local não justificaram alteração desse pacote.

Foram preservados também os vínculos por sinônimos no depth ladder de
`java-performance`, retornos entre fases e a skill principal de features,
e companheiros concretos de lifecycle, idempotência, medição, pool e persistência.

## Resultado final do catálogo

| Medida                                                                | Resultado                        |
| --------------------------------------------------------------------- | -------------------------------- |
| Skills no catálogo / skills com sugestões                             | 305 / 303                        |
| Sugestões antes / depois desta etapa                                  | 2.306 / 2.294                    |
| Dependências obrigatórias / opcionais                                 | 753 / 2, preservadas nesta etapa |
| Sugestões cujo destino já entra pela árvore de dependências           | 283                              |
| Sugestões com caminho obrigatório de volta à origem                   | 299                              |
| Resoluções normais / simulações com sugestões diretas aprovadas       | 305 / 305                        |
| Conflitos de ranges, ciclos obrigatórios ou duplicidades entre campos | 0                                |
| Entradas do índice alteradas / preservadas nesta etapa                | 10 / 295                         |
| Entradas alteradas / preservadas desde o pedido inicial               | 51 / 254                         |

Um vínculo sugerido já presente transitivamente pode continuar útil para explicar
um encaminhamento direto; isso não é duplicidade entre campos. Os 299 caminhos de
volta mostram que sugestões não podem ser convertidas indiscriminadamente em
dependências obrigatórias.

A simulação resolveu cada raiz com suas sugestões diretas como raízes adicionais,
incluindo apenas as dependências reais dessas raízes. Foram usados manifestos atuais
em memória, com uma versão indexada por skill. Não houve instalação em configuração
real e a flag proposta não foi executada.

## Proposta da flag

A [análise de implementação](../install-suggests-option.md) registra a preferência
do usuário: `--with-suggests` inclui somente sugestões diretas das skills solicitadas.

A proposta cobre install e update com nomes explícitos, dry-run, proveniência, versões,
registries, sugestões ausentes e efeitos sobre lockfiles. Recomenda impedir
`update --with-suggests` sem nomes na primeira versão, pois o estado atual não
preserva as raízes originais e execuções repetidas acabariam expandindo as sugestões.

O código do CLI **não foi alterado para implementar a flag** nesta análise. Os cenários
de aceitação do documento são propostas. As simulações executadas verificam apenas
o comportamento do resolver sobre o catálogo atual.

## Validação e preservação

Os dez manifestos alterados passaram na validação estrita, ranges e destinos locais,
formatação e comparação com o snapshot. Nenhum código Java, fixture, teste ou contrato
de aplicação foi modificado nesta etapa.

O índice foi regenerado oficialmente. A comparação exata de entradas confirmou apenas
os dez pacotes esperados em relação à etapa anterior. O resolver passou em todas as
raízes normais e expansões diretas; os mesmos três falsos positivos de nomes de tema/
objetivo Maven documentados na primeira auditoria foram excluídos.

`npm run verify` aprovado: build, boundaries dos sete pacotes, lint, formatação,
índice atualizado, incrementos de versão e **355 testes aprovados**, sem falhas,
cancelamentos ou skips. Os 24 links locais dos três relatórios em Markdown e os
387 caminhos de evidência do registro contextual também foram conferidos.

Não houve commit, publicação, instalação global ou alteração de configuração real.
