# Skills de arquitetura de microserviços — implementação e validação

Data local: 30/09/2026. Oito skills novas, todas em **1.0.0**, com **31 arquivos
autorais**. O índice passou de **287 para 295 skills**; as 287 entradas anteriores
permaneceram iguais. Verificação global aprovada.

O [plano](../microservices-architecture-skills-plan.md) orientou fronteiras e dependências.
Após o pedido de implementação, o trabalho foi realizado como um lote paralelo, com um
`skill-reviewer` por pacote e integração pelo coordenador. As semanas do plano eram uma
previsão inicial, não uma exigência de espera entre entregas.

## Pacotes entregues

| Skill                                                                              | Decisão especializada e contribuição                                                                                   | Recursos                                                                    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [microservices-architecture](../../skills/microservices-architecture/SKILL.md)     | Coordenar decisões, autoridades, conflitos e evidências; entregar uma primeira fatia verificável.                      | Manifesto e referência de integração; depende das sete novas especialistas. |
| [bounded-context-design](../../skills/bounded-context-design/SKILL.md)             | Distinguir linguagem divergente de sinônimos; delimitar modelos e contratos de tradução sem impor processos separados. | Manifesto e referências de context mapping e implementação Java/Spring.     |
| [service-data-ownership](../../skills/service-data-ownership/SKILL.md)             | Transformar autoridade em contratos de acesso verificáveis, incluindo jobs, grants, credenciais e exceções.            | Manifesto e referências de contrato, enforcement e testes hostis.           |
| [cross-service-query-design](../../skills/cross-service-query-design/SKILL.md)     | Escolher composição ou projeção pelo contrato de frescor, completude, autorização, paginação e recuperação.            | Manifesto e referências de consultas e lifecycle de projeções.              |
| [api-gateway-and-bff](../../skills/api-gateway-and-bff/SKILL.md)                   | Definir responsabilidades da borda, adaptação aos clientes, confiança e falha parcial com limites de recursos.         | Manifesto e referências de composição/confiança e integração Spring.        |
| [service-discovery](../../skills/service-discovery/SKILL.md)                       | Definir autoridade, atualização, expiração, bootstrap e tratamento de informação obsoleta ou ausente.                  | Manifesto, duas referências e exemplo Java executável.                      |
| [service-identity-and-trust](../../skills/service-identity-and-trust/SKILL.md)     | Separar workload, usuário, tenant e delegação; definir autorização, rotação, revogação e falhas.                       | Manifesto e referência de protocolos/lifecycle.                             |
| [progressive-service-delivery](../../skills/progressive-service-delivery/SKILL.md) | Escolher coortes, evidência e ações de promoção, pausa ou aborto; recuperar com compatibilidade dos efeitos.           | Manifesto e referências de evidência por coorte e restrições Java/Spring.   |

Todas preservam soluções existentes adequadas, diferenças entre projeto/revisão e
implementação, e compatibilidade do projeto atendido. As especialistas não dependem do
pacote de entrada. Encaminhamentos opcionais usam `suggests`; as sete dependências do
pacote de entrada são explícitas e foram resolvidas pelo resolver do produto.

Os esqueletos iniciais foram criados pelo coordenador para atender ao contrato do papel
de revisor, que trabalha sobre diretórios existentes. Cada revisor assumiu somente seu
pacote, leu o procedimento completo e pesquisou fontes primárias. Conteúdo das skills
está em inglês; documentos de planejamento e evidência estão em português.

## Oito pilares

O [registro estruturado](microservices-architecture-2026-09-30-evaluation.json) contém
`pillarMap` para cada uma das oito skills, com localização concreta de cada pilar, além
dos critérios, respostas completas, evidência da avaliação e hashes dos arquivos.

| Pilar                   | Como aparece na entrega                                                                          | Evidência e limite                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escopo preciso          | Ativação, exclusões e encaminhamentos com proprietário.                                          | Casos BC3/MA3 mantiveram tarefas locais; revisão cruzada corrigiu três encaminhamentos entre pares. Seleção automática não foi avaliada.                             |
| Discovery               | Contratos, código, versões, configuração efetiva, consumidores, escritores e operação.           | DO2 incluiu ETL e privilégios; SD1 distinguiu duração do timeout de idade da evidência. Não houve investigação de produção.                                          |
| Profundidade técnica    | Invariantes, tradução, privilégios, consulta global, lifecycle e semântica de falhas.            | Fontes primárias verificadas pelos autores; exemplo Java e contraexemplos aritméticos executados. Integrações externas permanecem fora da evidência.                 |
| Critérios de decisão    | Alternativas e pares que alteram uma restrição material.                                         | BC1/BC2, CQ1/CQ2, GW1/GW2, SD1/SD2, IT1/IT2, PD1/PD2 e MA1/MA2 produziram decisões distintas justificadas.                                                           |
| Qualidade da solução    | Encapsulamento, autoridade, contratos públicos, recursos limitados e mecanismos existentes.      | Respostas mantiveram invariantes e evitaram plataformas/atualizações compulsórias. A qualidade de código de uma aplicação consumidora não foi medida.                |
| Execução                | Fluxo completo quando implementação é solicitada; resultado proporcional para projeto e revisão. | Instruções exigem consumidores, configuração, documentação e recuperação pertinentes. Os atores receberam tarefas de proposta/revisão; não implementaram aplicações. |
| Validação               | Checks de pacote, exemplos, comportamento e aceitação apropriados à afirmação.                   | Oito pacotes validados, 28 checks Java e 24 casos finais com outputs reais; nenhuma equivalência com testes de produção é afirmada.                                  |
| Limites de conhecimento | Fatos, hipóteses, baseline, cobertura e execução separados.                                      | Respostas declararam testes não executados e lacunas relevantes; evidência incompleta não virou garantia de disponibilidade ou segurança.                            |

## Correções da integração

A leitura cruzada encontrou e corrigiu:

- Encaminhamentos de gateway/BFF para os proprietários de consulta e identidade.
- Encaminhamento de consulta para contratos de dados ainda sem autoridade ou acesso aprovado.
- Afirmação absoluta sobre coortes por tenant: agora depende de atribuição e revisão
  efetiva consistentes nos caminhos relevantes, incluindo propagação de flags.

Gateway e consultas receberam novas execuções com contexto novo após os ajustes. As
seis respostas anteriores foram preservadas como execuções substituídas, sem contá-las
novamente como resultados finais. A correção de coortes ocorreu antes de sua avaliação.

## Verificações executadas

- Carregamento estrito e validação dos oito pacotes pelos componentes reais do core:
  **zero issues**. Os dois adapters produziram projeções em memória com identidade,
  descrição e arquivos coerentes; nenhuma instalação foi realizada pelo coordenador.
- **31 arquivos**, **16 links internos** e snapshots finais conferidos por conteúdo e
  SHA-256. Fontes e exemplos condicionais possuem rotas de leitura nas skills.
- `npm run registry:build`: **295 skills**. Comparação estrutural com o índice em HEAD
  confirmou somente as oito adições e nenhuma alteração nas entradas antigas.
- Resolução real por `LocalRegistry`, `RegistryFederation`, `FederationResolutionSource`
  e `Resolver`: o pacote de entrada trouxe as sete especialistas, sem warnings ou ciclos.
- Exemplo de descoberta: `javac --release 21 -d .validation assets/SnapshotResolverExample.java`
  e `java -cp .validation SnapshotResolverExample`, executados pelo revisor com Temurin
  **25.0.3**: **28 checks passaram**. Os artefatos de compilação foram removidos. O check
  cobre estado local, concorrência, expiração, remoção autoritativa, cópias defensivas,
  outra autoridade e destinos indevidos. Não prova comportamento do Java 21 em execução,
  DNS, Spring, Kubernetes ou transportes reais.
- Consultas: o revisor executou um contraexemplo de filtro após paginação, obtendo zero
  resultados na composição ingênua contra vinte elegíveis, e o contraste de enriquecimento.
- Entrega progressiva: o revisor verificou cinco taxas sintéticas e o contraste entre
  agregado saudável e coorte degradada. Isso valida a aritmética, não um método estatístico
  nem a segurança de um rollout real.
- `npm run verify`: aprovado — build, boundaries, lint, formatação, freshness do índice,
  versões e **355 testes em 67 suites, zero falhas e zero skips**. `git diff --check`
  passou. A atualização final dos registros após essa execução recebeu checks próprios
  de JSON, links e formatação; os pacotes avaliados permaneceram inalterados.

## Avaliação comportamental

O coordenador fixou **24 casos e critérios antes das execuções**. Cada skill recebeu três
casos em uma sessão principal com contexto novo e snapshots dos recursos autorais. Os
atores acessaram somente entradas e recursos atribuídos segundo suas declarações; o
pacote de entrada também tinha suas sete dependências novas disponíveis. Expectativas e
resultados prévios não foram fornecidos aos atores.

O coordenador leu as respostas completas e não observou violação dos critérios de falha
predefinidos nos 24 resultados finais. Os casos cobriram decisão pertinente, mudança de
restrição, evidência ausente, fronteiras, comportamento inseguro e compatibilidade conforme
o domínio. DO3, GW3 e IT1/IT3 incluem entradas hostis ou propostas inseguras; são avaliações
da decisão do agente, não provas de enforcement em banco ou rede.

Há **11 sessões principais de avaliação**: oito finais, uma de controle sem skill e duas
substituídas após integração. O ator do pacote de entrada usou ainda dois auxiliares para
MA1 e MA3; essa delegação está registrada. Foram preservadas 33 respostas: 24 finais,
três do controle e seis substituídas.

O controle sem skill também satisfez os critérios dos três casos de composição. Portanto,
**não foi demonstrado ganho comparativo geral**. Há uma execução por condição; o tratamento
consultou dependências e usou auxiliares, enquanto o controle não delegou. A disponibilidade
de ferramentas era comparável, mas o esforço efetivo diferiu.

As restrições de acesso eram procedurais em filesystem compartilhado; os caminhos lidos
foram declarados pelos atores e conferidos, sem isolamento imposto pelo harness. Três
casos na mesma sessão podem influenciar respostas posteriores. Os casos vêm dos riscos do
plano, não constituem benchmark cego ou prova universal. Carregamento explícito não testa
a seleção automática das novas skills pelo cliente.

## Escopo e limites restantes

Não foi criada uma aplicação demonstrativa nem executado rollout, ataque, rotação de
credenciais ou recuperação distribuída em ambiente real. Os exemplos Java/Spring restantes
são trechos parciais ou pseudocódigo identificados; não foram reportados como compilados.
PostgreSQL real não foi exercitado; o revisor não dispunha de `psql` nem de uma instância
isolada estabelecida. Casos hostis de banco, gateway, tokens e rede possuem critérios
reproduzíveis e continuam dependendo do ambiente de aplicação.

A consulta de fontes detectou uma diferença consequente no contrato de `resourceVersion`
entre Kubernetes 1.34 e versões a partir de 1.35; o recurso de descoberta delimita ambos,
e o caso SD3 fixa 1.34. Java/Spring e produtos de plataforma também têm condições de versão
explícitas; a trilha não autoriza upgrades de projetos consumidores.

Mudanças desta entrega: oito diretórios novos, índice gerado, atualização do plano e estes
dois registros de evidência. `docs/agent-harness-optimization-plan.md` foi preservado.
`docs/java-spring-architecture-skills-plan.md` apareceu por trabalho externo durante a
execução e também foi preservado. Após a verificação global, apareceram alterações
paralelas em `skills/mvc-and-request-handling/SKILL.md` e seu manifesto. Foram preservadas
e não fazem parte desta entrega nem da verificação global registrada acima. Nenhuma
skill anterior, pacote do gerenciador ou teste foi alterado por esta implementação.
Não houve commit, publicação ou instalação global.
