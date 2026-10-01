# Cronograma de skills de arquitetura de microserviços

Data: 30/09/2026. Status: oito skills implementadas em 1.0.0; verificação global aprovada.
Resultados e limites estão no [registro de implementação](skill-validation/microservices-architecture-2026-09-30.md).

O horizonte inicial é de **seis semanas relativas ao início da execução**, supondo até
duas frentes de autoria e um coordenador para integração e revisão. É uma previsão de
organização, sem medição prévia de capacidade ou data de início acordada. Recalibrar a
duração após a primeira semana; avançar depende dos critérios de aceite, não do calendário.
Essa previsão foi preservada como histórico do planejamento. Após a autorização de
implementação, as fronteiras foram consolidadas e os oito pacotes executados em um lote
paralelo, com um revisor por skill e integração centralizada.

## Objetivo e padrão de qualidade

Ampliar o catálogo para orientar decisões de arquitetura de microserviços em sistemas
Java novos ou existentes: limites de domínio, autoridade dos dados, consultas entre
serviços, borda, descoberta, confiança e entrega independente. Cada skill deve ensinar
uma decisão especializada, uma falha a prevenir e um resultado verificável.

A referência explícita são os **oito pilares já aplicados às skills Spring** na
[revisão de 29/09/2026](skill-validation/spring-eight-pillars-2026-09-29.md).
O formato de planejamento segue o [plano das skills Spring](spring-skills-plan.md),
com os critérios de [skill-engineering](../skills/skill-engineering/SKILL.md) e do
[prompt completo de revisão](skill-review-prompt.md).

| Pilar                   | Aplicação na nova trilha                                                                                                               | Evidência de aceite por skill                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Escopo preciso          | Nomear situações de ativação, exclusões e proprietário de cada decisão vizinha.                                                        | Uma tarefa pertinente e uma tarefa de fronteira têm encaminhamentos distintos e justificáveis.                                |
| Discovery               | Inspecionar código, contratos, ADRs, consumidores, topologia, versões, operação e restrições que mudam a decisão.                      | Separar fatos encontrados, convenções e lacunas; perguntar somente pelo que não puder ser obtido e fizer diferença.           |
| Profundidade técnica    | Explicar mecanismos, invariantes, falhas parciais, compatibilidade e recuperação dentro do recorte.                                    | Uma recomendação relevante tem condições, fonte aplicável e caso que pode refutá-la.                                          |
| Critérios de decisão    | Comparar alternativas viáveis, incluindo preservar a solução atual; indicar quando reconsiderar.                                       | Um par de casos muda uma restrição decisiva e verifica se a recomendação muda de forma adequada.                              |
| Qualidade da solução    | Preservar contratos, coesão, encapsulamento, tipos de domínio, segurança e convenções adequadas; justificar dependências e abstrações. | A solução respeita os invariantes e resolve o problema sem introduzir mecanismos sem necessidade demonstrada.                 |
| Execução                | Entregar o resultado correspondente ao pedido: achados no diagnóstico/revisão, plano na decisão, mudanças integradas na implementação. | Quando implementação for solicitada, incluir configuração, consumidores, documentação operacional e recuperação pertinentes.  |
| Validação               | Verificar separadamente estrutura da skill, exemplos e comportamento do agente.                                                        | Registrar comandos, casos, resultados, falhas e cobertura; testes de contrato, concorrência ou falha conforme a afirmação.    |
| Limites de conhecimento | Distinguir observação, inferência e hipótese; delimitar versões, ambiente e evidência ausente.                                         | Nenhum caso apenas escrito é declarado executado; nenhuma configuração é apresentada como prova de comportamento em produção. |

Os pilares são critérios de conteúdo e comportamento. Sua aplicação deve ser adaptada
ao problema de cada skill; não exigir oito seções idênticas em todos os arquivos.

## Base existente que será reutilizada

O inventário considera os arquivos reais em `skills/`. Os grupos abaixo já possuem
responsáveis e entram na trilha por composição e encaminhamento.

| Tema                       | Skills existentes                                                                                                                                                                    | Papel na trilha                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Drivers e decisões         | `architecture-characteristics`, `architecture-trade-off-analysis`, `architecture-decision-making`                                                                                    | Definir resultado esperado, alternativas, restrições e condição de revisão.                         |
| Distribuição e acoplamento | `distribution-boundaries`, `architecture-coupling-and-quanta`, `component-and-release-boundaries`                                                                                    | Decidir fronteira de processo, mapear dependências e tratar componentes/bibliotecas compartilhados. |
| Contratos e comunicação    | `rpc-and-api-contracts`, `remote-facade-and-dto`, `event-driven-architecture`, `schema-evolution-and-compatibility`                                                                  | Definir interação, semântica, payloads e evolução de contratos.                                     |
| Consistência e entrega     | `consistency-models`, `distributed-transactions-and-sagas`, `delivery-semantics`, `idempotency`, `event-sourcing`                                                                    | Tratar invariantes, transações, compensação, publicação durável e repetição de efeitos.             |
| Resiliência                | `failure-models`, `cascading-failures`, `timeouts-and-deadlines`, `retries-and-backoff`, `circuit-breakers`, `concurrency-limiting-and-bulkheads`, `rate-limiting-and-load-shedding` | Escolher controles para a falha e capacidade observadas.                                            |
| Plataforma e tráfego       | `stateless-service-design`, `load-balancing-and-routing`, `kubernetes-service-lifecycle`, `sidecar-pattern`, `ambassador-pattern`, `grpc-http2-service-mesh-performance`             | Reutilizar decisões de réplicas, roteamento, lifecycle e custo dos transportes/proxies.             |
| Segurança                  | `java-application-security-basics`, `spring-security-for-apis`                                                                                                                       | Preservar autorização na operação e integração de segurança do framework.                           |
| Observabilidade            | `distributed-tracing-design`, `metrics-and-cardinality`, `structured-logging`, `slo-and-alerting`, `opentelemetry-performance`                                                       | Definir sinais e critérios operacionais que sustentam a decisão.                                    |
| Testes e governança        | `architecture-testing`, `distributed-systems-testing`, `architecture-fitness-functions`                                                                                              | Verificar fronteiras, contratos, falhas e regras arquiteturais.                                     |
| Migração                   | `legacy-enterprise-modernization`, `architecture-refactoring-paths`, `online-database-schema-migrations`, `change-data-capture-operations`                                           | Planejar coexistência, transferência de autoridade, evolução do banco e operação de CDC.            |
| Implementação Spring       | `spring-boot`, `spring-boot-web`, `spring-boot-jpa`, `spring-http-clients`, `spring-transactions-and-events`, `spring-boot-observability`, `spring-boot-testing`                     | Implementar e testar o wiring quando o projeto atendido usar o stack compatível.                    |

As skills citadas não entram automaticamente em revisão. Uma lacuna em um pacote
existente vira uma proposta localizada com proprietário e escopo próprios. Dependência
de aprendizagem ou encaminhamento também não implica dependência obrigatória no manifesto.

## Skills candidatas e fronteiras

Os nomes abaixo são propostas de pacote. Antes de criar cada uma, demonstrar uma
decisão e avaliação próprias; se o conteúdo couber melhor no proprietário existente,
registrar essa conclusão e substituir a criação por uma proposta de complemento.
A quantidade de pacotes não é um critério de sucesso.

| Skill proposta                 | Ativação e decisão central                                                                                            | Entregável mínimo                                                                                                                                     | Fronteira com o catálogo                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `microservices-architecture`   | Uma iniciativa exige compor decisões de domínio, dados, interação e operação entre serviços.                          | Mapa de decisões, restrições, especialistas pertinentes, lacunas e primeira fatia verificável.                                                        | Coordena um conjunto de decisões e evidências. `distributed-systems` e `enterprise-application-architecture` mantêm a triagem de projeto e integração; `distribution-boundaries`, a decisão de distribuir.    |
| `bounded-context-design`       | Linguagem, regras ou modelos de negócio entram em conflito; é necessário propor ou revisar contextos e suas relações. | Mapa de contextos, linguagem, invariantes, responsáveis e contratos de tradução.                                                                      | Modelagem estratégica; encaminhar fronteira de processo a `distribution-boundaries` e implementação interna a `domain-logic-organization`.                                                                    |
| `service-data-ownership`       | Há múltiplos escritores, leitura de tabelas privadas ou autoridade indefinida entre serviços.                         | Contrato verificável de autoridade e acesso: escritores, leitores, interfaces suportadas, controles como credenciais/grants e exceções com expiração. | Aprofundar autoridade após delimitar a fronteira. Sagas, ORM, DDL e transferência durante migração continuam com seus especialistas. Comprovar valor além do passo de ownership de `distribution-boundaries`. |
| `cross-service-query-design`   | Uma consulta depende de vários serviços e precisa de contrato de frescor, completude e autorização.                   | Escolha entre composição de APIs e modelo de leitura, com orçamento de consulta, atraso admissível e recuperação.                                     | Cuida do caminho de leitura; `scatter-gather` cuida do fan-out, `event-sourcing` da fonte de verdade por eventos e `change-data-capture-operations` da captura.                                               |
| `api-gateway-and-bff`          | Clientes precisam de uma borda ou representação específica e suas responsabilidades estão indefinidas.                | Contrato da borda, matriz de responsabilidades, identidade propagada e semântica de falhas/degradação.                                                | Composição e responsabilidade gateway/BFF. Balanceamento, contratos RPC, segurança Spring e retries mantêm seus proprietários.                                                                                |
| `service-discovery`            | Um chamador precisa descobrir endpoints e lidar com mudança de membros, cache ou indisponibilidade da descoberta.     | Fonte de endpoints, bootstrap, atualização, expiração e comportamento sob informação obsoleta ou ausente.                                             | Descoberta determina o conjunto conhecido de endpoints; `load-balancing-and-routing` trata elegibilidade/seleção e caminho até a réplica. Não absorver adoção ou performance de mesh.                         |
| `service-identity-and-trust`   | É necessário autenticar workloads e delimitar confiança, identidade delegada e autorização entre serviços.            | Mapa de confiança, identidades, emissores/audiências quando aplicáveis, políticas, rotação e falhas esperadas.                                        | Arquitetura da confiança entre workloads; a implementação de filtros/tokens Spring permanece em `spring-security-for-apis`, e a autorização de negócio no proprietário da operação.                           |
| `progressive-service-delivery` | Uma versão será liberada gradualmente, com consumidores e dados em versões distintas.                                 | Matriz de compatibilidade, coortes, sequência, critérios de promoção/aborto e recuperação compatível com os efeitos persistidos.                      | Rollout de versões e ativação. `component-and-release-boundaries` trata componentes; `architecture-refactoring-paths`, transformação arquitetural; `kubernetes-service-lifecycle`, lifecycle dos pods.        |

## Cronograma de execução

As semanas incluem pesquisa, autoria, revisão e validação local. Segurança, compatibilidade,
observabilidade e testes entram desde a primeira entrega; a semana especializada aprofunda
o respectivo assunto. A sexta semana verifica a composição da trilha.

| Semana relativa             | Entrega principal                                                                                                          | Dependências e paralelismo                                                                                                                   | Critério para avançar                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Recorte e domínio       | Fechar fronteiras dos oito candidatos; criar `bounded-context-design` e a primeira versão de `microservices-architecture`. | Fixar os contratos de encaminhamento antes da autoria paralela; usar especialistas existentes onde os novos ainda não estiverem disponíveis. | Distinguir modelo de domínio, módulo e serviço; preservar um monólito adequado; cada candidato justifica sua decisão própria. Recalibrar o cronograma com esforço e retrabalho observados.             |
| 2 — Dados e consultas       | Criar `service-data-ownership` e `cross-service-query-design`.                                                             | Reutilizar o mapa de contextos; autoria paralela após acordar autoridade, semântica da leitura e acesso.                                     | Identificar escritores e verificar acessos permitidos/negados; contrastar leitura informativa e leitura que autoriza um efeito; declarar como medir atraso e reconstruir a projeção.                   |
| 3 — Borda e descoberta      | Criar `api-gateway-and-bff` e `service-discovery`.                                                                         | Reutilizar contratos e ownership; duas frentes com responsabilidades distintas.                                                              | Distinguir gateway, BFF, discovery e balanceamento; casos de resposta parcial, acesso direto e endpoint obsoleto têm comportamento definido e validação pertinente.                                    |
| 4 — Identidade e confiança  | Criar `service-identity-and-trust`; conferir os encaminhamentos de segurança das entregas anteriores.                      | Requer mapa dos caminhos e autoridades. Autoria e preparação dos casos podem ocorrer em paralelo com propriedade separada dos arquivos.      | Casos hostis de identidade/audiência inadequada, delegação indevida, isolamento entre tenants e falha de rotação têm critérios explícitos; evidência operacional ausente permanece registrada.         |
| 5 — Entrega independente    | Criar `progressive-service-delivery`; consolidar o roteamento da skill de entrada.                                         | Requer contratos, dados e confiança definidos; coordenar qualquer alteração de skill já entregue com seu proprietário.                       | Avaliar promoção/pausa/aborto por coorte e suficiência dos sinais; respeitar versões coexistentes, consumidores antigos e efeitos persistidos; distinguir retorno de tráfego de recuperação dos dados. |
| 6 — Composição e fechamento | Exercitar cenários que atravessam as skills; ajustar apenas defeitos sustentados pela avaliação; consolidar evidências.    | Depende das entregas anteriores aceitas. Revisão cruzada de encaminhamentos, sem edições concorrentes no mesmo pacote.                       | Oito pilares rastreáveis por skill efetivamente criada, casos prioritários avaliados, limites explícitos e integração do catálogo aprovada.                                                            |

Em cada lote concluído, após os autores/revisores encerrarem as escritas, o coordenador
regenera o índice e executa a verificação global. A sexta semana não adia esses checks.
Se uma semana exceder a previsão, atualizar as seguintes; não remover casos relevantes
ou profundidade técnica para cumprir a data. Nenhuma etapa depende de publicar ou instalar
globalmente as skills.

## Decisões e casos que devem orientar a autoria

Os casos abaixo registram o **planejamento original**; as entradas e execuções concretas
estão no registro de implementação. Ao ampliar a avaliação, transformar cada caso em entrada,
contexto, comportamento esperado, características da saída e condições de falha antes
da avaliação. Selecionar os casos pertinentes a cada skill e acrescentar os que suas
recomendações de maior risco exigirem.

| Skill                          | Caso representativo e contraste                                                                                                                     | Falha que a avaliação deve detectar                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `microservices-architecture`   | Pedido amplo com drivers e restrições versus pedido local de ajustar timeout.                                                                       | Forçar uma decomposição ou uma trilha inteira para resolver uma alteração local; declarar ganho sem evidência.                                        |
| `bounded-context-design`       | O mesmo termo possui regras distintas em vendas e faturamento; contrastar com vocabulário diferente para o mesmo contrato.                          | Dividir por substantivo/tabela ou converter cada contexto em serviço automaticamente.                                                                 |
| `service-data-ownership`       | Há owner definido, mas um job usa credencial ampla; comparar interface de leitura suportada com acesso direto temporário e delimitado.              | Entregar somente uma matriz descritiva, sem verificar acessos permitidos/negados e expiração das exceções; ignorar escritores externos.               |
| `cross-service-query-design`   | Uma visão informativa tolera atraso; uma decisão de concessão exige dado autoritativo no momento do efeito.                                         | Reutilizar a mesma leitura atrasada para ambos sem proteger a decisão; impor CQRS/event sourcing sem necessidade.                                     |
| `api-gateway-and-bff`          | Clientes têm necessidades distintas versus representações e políticas já atendidas pela API existente.                                              | Introduzir BFF sem benefício, concentrar invariantes de negócio na borda ou confiar em headers sem verificar sua origem.                              |
| `service-discovery`            | Endpoints mudam com clientes ativos; comparar informação atualizada, cache obsoleto e indisponibilidade durante bootstrap.                          | Tratar resolução DNS bem-sucedida como prova de disponibilidade ou prometer convergência sem examinar caches/clientes reais.                          |
| `service-identity-and-trust`   | Workload autenticado tenta agir fora de sua permissão ou em nome de outro tenant; contrastar delegação válida.                                      | Tratar identidade de serviço como autorização irrestrita; expor credenciais ou aceitar bypass de confiança.                                           |
| `progressive-service-delivery` | Métricas globais parecem boas, mas a coorte do canário falha ou tem amostra insuficiente; acrescentar versões coexistentes com efeitos persistidos. | Promover com sinal agregado que esconde a coorte ou sem evidência suficiente; prometer rollback apenas trocando imagem/flag após efeito irreversível. |

Para a composição, usar cenários pequenos de pedidos, estoque e faturamento, sem construir
uma plataforma demonstrativa inteira. O primeiro deve admitir manter fronteiras locais;
o segundo deve justificar distribuição por uma restrição explícita. Reutilizar fixtures
quando suficientes; criar apenas as necessárias à afirmação testada, em ambiente isolado.

## Compatibilidade, recursos e fontes

O núcleo arquitetural é independente de framework. Não se presume uma versão Java,
Spring, broker, banco, Kubernetes, gateway ou mesh para toda a trilha. Cada exemplo
executável declara sua baseline, dependências e comandos; o agente que aplicar a skill
inspeciona o projeto atendido antes de recomendar APIs/configurações sensíveis à versão.

As fixtures Spring existentes podem ser reutilizadas dentro de seu contrato declarado.
Java 25 e Boot 4.x são o recorte daquela trilha, não autorização automática para atualizar
outros projetos. Fixar e registrar as versões efetivamente usadas ao validar um exemplo.
Snippets parciais e pseudocódigo devem ser identificados como tais.

Cada pacote criado terá `SKILL.md` e `skill.yaml` coerentes, com conteúdo em inglês.
Referências terão propósito e condição de leitura explícitos. Scripts e assets só entram
quando tornam a execução ou verificação reproduzível; quantidade de arquivos e extensão
do texto não demonstram qualidade. Evidências de desenvolvimento e critérios reservados
ao avaliador ficam em `docs/skill-validation/`, fora do conteúdo normalmente instalado.

Fontes primárias consultadas para delimitar a proposta em 30/09/2026; aprofundar e conferir
a versão aplicável durante a autoria:

- **Domínio:** [Bounded Context, Martin Fowler](https://martinfowler.com/bliki/BoundedContext.html)
  descreve limites de modelos e relações entre contextos;
  [decomposição por capacidade, Chris Richardson](https://microservices.io/patterns/decomposition/decompose-by-business-capability.html)
  oferece uma perspectiva para a decomposição funcional. Usar essas perspectivas para
  formular alternativas, sem transformar uma heurística em obrigação de extração.
- **Dados:** [Database per service](https://microservices.io/patterns/data/database-per-service.html)
  distingue dados privados de servidor exclusivo;
  [CQRS, Martin Fowler](https://martinfowler.com/bliki/CQRS.html) diferencia modelos de
  leitura/escrita e explicita o custo de complexidade. Esses textos apoiam os recortes,
  não determinam automaticamente a arquitetura de uma aplicação.
- **Borda:** [API Gateway / BFF](https://microservices.io/patterns/apigateway.html)
  fundamenta responsabilidades de entrada e adaptação aos clientes. Implementação de
  políticas dependerá do gateway e dos contratos realmente adotados.
- **Descoberta:** [DNS para Services e Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
  será referência condicional para Kubernetes. Verificar separadamente o resolver e o
  cache do cliente; a trilha não exige essa plataforma.
- **Identidade:** [SPIFFE Overview](https://spiffe.io/docs/latest/spiffe-about/overview/)
  oferece contratos de identidade de workloads e domínios de confiança. A skill deve
  comparar mecanismos existentes e requisitos, sem exigir adoção de SPIFFE/SPIRE.
- **Entrega:** [Argo Rollouts — análise](https://argoproj.github.io/argo-rollouts/features/analysis/)
  fornece um exemplo concreto de análise para promoção/aborto. Usar apenas se pertinente
  ao ambiente; o mecanismo não comprova compatibilidade dos dados nem impõe Argo.

## Processo de revisão e aceite

1. **Fechar o recorte:** nome, descrição por situações, exclusões, decisões centrais,
   vizinhos, entregável e evidência esperada. Resolver sobreposição antes de criar o pacote.
2. **Pesquisar e escrever casos:** verificar afirmações consequentes em fontes primárias,
   declarar baseline dos exemplos e fixar expectativas antes das execuções comportamentais.
3. **Produzir e revisar:** escrever instruções acionáveis, aprofundamento condicional e
   exemplos justificados. Para revisão de múltiplas skills, seguir o
   [workflow paralelo](parallel-skill-reviews.md): um `skill-reviewer` por skill, leitura
   integral do prompt e ownership exclusivo. O coordenador mantém skill, responsável,
   status e resultado; alterações em vizinhos precisam de atribuição explícita.
4. **Validar localmente:** checar metadados, referências, projeções dos agentes e exemplos
   modificados. Compilar código executável no baseline; para claims de segurança,
   concorrência, transação ou recuperação, usar verificações capazes de expor a falha.
5. **Avaliar comportamento:** executar casos prioritários com contexto novo e critérios
   separados dos recursos do ator. Registrar entrada, versões/hashes, ferramentas,
   recursos acessados e outputs. Distinguir seleção automática de carregamento explícito.
   Comparações de melhoria exigem condições comparáveis com/sem skill ou antes/depois;
   declarar limitações de isolamento e variabilidade. Casos didáticos conhecidos não
   contam como avaliação cega.
6. **Integrar o lote:** depois de todos encerrarem escritas, o coordenador verifica versões
   e descrições, executa `npm run registry:build` e depois `npm run verify`, inspecionando
   saída e diff. Novos pacotes declaram versão inicial; mudanças em publicados exigem bump
   conforme as regras do repositório. Preservar mudanças preexistentes.
7. **Entregar evidência:** matriz por skill com pilar, instrução concreta, comportamento
   esperado, resultado observado e limitação. Uma avaliação apenas planejada permanece
   pendente; um check indisponível não conta como aprovado. Encerrar a autoria não autoriza
   declarar comprovado o comportamento que dependia desse check.

O aceite de conteúdo exige os oito pilares verificáveis e nenhuma incerteza conhecida
que invalide a recomendação central. O aceite do lote exige a integração do catálogo
aprovada e o estado real das avaliações registrado. Publicação é uma ação posterior,
fora deste cronograma de criação e validação.

## Expansão após a trilha inicial

Avaliar novos pacotes somente se houver demanda e decisões próprias:

- `service-mesh-architecture`: adoção, responsabilidade por políticas e dependências dos
  planos de controle/dados; composição com as skills existentes de tráfego e performance.
- `cell-based-service-isolation`: particionar o sistema em células e verificar contenção
  de falhas, incluindo dependências que continuam compartilhadas.
- `multi-region-service-architecture`: topologia regional, autoridade de escrita,
  failover/failback e objetivos de recuperação; reutilizar consistência e quóruns.
- `service-ownership-and-platform-contracts`: responsabilidade de operação, capacidades
  fornecidas pela plataforma, exceções e custos da autonomia.

Esses itens não são dependências da primeira entrega e permanecem propostas futuras.
A trilha inicial foi implementada com avaliações comportamentais registradas; as
limitações de runtime e integrações distribuídas estão explícitas no relatório.
