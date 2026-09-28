# Plano de skills: Spring Boot, Web e JPA

Data: 27/09/2026. Status: três pacotes criados e validados para Spring Boot 4.x e Java 25.
Este documento preserva os critérios de criação; a evidência executada e suas limitações
estão no [registro de validação](skill-validation/spring-skills-2026-09-27.md).
Inclui o aprofundamento solicitado sobre convenções de beans, capacidade Web, Hibernate
e o exemplo de configuração de um agendador com SQL Server fornecido na conversa.
Inclui também a comparação com as skills de `piomin/claude-ai-spring-boot`, com origem,
aproveitamento e adaptações registrados abaixo.
Documentação completa de controllers com springdoc/OpenAPI e Swagger UI é requisito
da trilha Web, incluindo campos opcionais e recursos avançados aplicáveis ao contrato.

## Objetivo e público

Criar três skills que ajudem agentes a implementar, diagnosticar e revisar aplicações
Java com Spring Boot 4.x, tomando decisões a partir do projeto real. O público são agentes
de desenvolvimento trabalhando em serviços novos ou existentes, com Maven ou Gradle.

O critério de qualidade é produzir configuração e comportamento verificáveis: descobrir
por que um bean não existe, implementar um contrato HTTP sem alterar sua segurança,
ou demonstrar que uma operação persistiu e respeitou a transação. Cada tópico deve
ensinar uma decisão, uma falha a evitar e uma forma de verificar o resultado.

A responsabilidade acompanha o pedido: diagnóstico entrega causa e evidência; revisão
entrega achados; implementação entrega mudanças e testes. Ativar uma skill não autoriza
migração de versão, alteração de schema ou reestruturação da aplicação.

## Pacotes iniciais e limites

| Skill proposta    | Responsabilidade principal                                                                                       | Fora do núcleo                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `spring-boot`     | Dependências gerenciadas, configuração, beans, auto-configuração, inicialização e integração operacional do Boot | Implementação de endpoints, consultas JPA e arquitetura de negócio                  |
| `spring-boot-web` | Implementar e diagnosticar aplicações HTTP com Boot e Spring MVC/Servlet                                         | WebFlux, provedor de identidade e desenho genérico de contratos HTTP                |
| `spring-boot-jpa` | Integrar Boot, Spring Data JPA e o provider efetivamente utilizado                                               | Introduzir ORM sem necessidade, otimização profunda do banco e persistência reativa |

Começar com esses três pacotes. Um tópico condicional pode ser uma referência dentro
da skill; só extrair outra skill quando houver um problema com ativação, decisões e
validação próprias. Quantidade de tópicos ou tamanho do texto, isoladamente, não justifica
fragmentação. Testes fazem parte de cada skill desde a primeira entrega.

Spring MVC, Spring Data JPA e Hibernate não são sinônimos de Spring Boot. Explicar o
comportamento no componente que o define e como o Boot o configura. Identificar o provider
JPA antes de recomendar propriedades ou APIs específicas do Hibernate.

## Base de versões e ambiente

Escopo confirmado pelo usuário: **somente Spring Boot 4.x**. Aplicações Boot 3.x e
migração entre majors ficam fora desta entrega. Ao encontrar um projeto fora do escopo,
identificar a incompatibilidade e encaminhar o trabalho, sem aplicar exemplos 4.x ou
migrar a aplicação automaticamente.

Ambiente proposto para os exemplos:

- Usar **Spring Boot 4.x e Java 25** como baseline das três skills, dos exemplos e dos
  testes, conforme a decisão explícita do usuário. Compilar com `--release 25` e validar
  em runtime Java 25; esse baseline não descreve o mínimo técnico exigido pelo Boot.
- Inspecionar toolchain, build tool e versões resolvidas do projeto atendido. Um projeto
  em outra versão Java exige explicitar a diferença de baseline, sem migração automática
  de um projeto externo à tarefa. Não misturar
  snippets de Framework, Security, Data, Hibernate, Jackson ou bibliotecas de teste
  de conjuntos incompatíveis.
- Usar Maven na primeira fixture; verificar também a configuração Gradle que for
  publicada. Incluir **SQL Server** para os casos solicitados de tipos JDBC, Unicode,
  sequences, locks e índices filtrados. Usar PostgreSQL nos casos de contraste de dialect,
  sem transformar nenhum dos bancos em requisito para aplicações consumidoras.
- Fixar patches e imagens de container ao criar as fixtures e registrar o ambiente
  executado. Não usar releases preview ou snapshots como padrão.

Na consulta de 27/09/2026, a documentação oficial apresentava Boot 4.1.1 como versão
estável; as fixtures usam essa versão com **Java 25**. Reconferir compatibilidade e patches
ao adaptar os exemplos. [Requisitos oficiais](https://docs.spring.io/spring-boot/system-requirements.html).

A compatibilidade deve distinguir as linhas 4.x efetivamente verificadas. Inspecionar
os módulos, starters, serialização e bibliotecas de teste gerenciados pela versão escolhida;
não copiar nomes de APIs e dependências de tutoriais de outra linha. Exemplos validados
em 4.1 não estabelecem automaticamente compatibilidade com toda a série 4.x.
[Build e starters do Boot](https://docs.spring.io/spring-boot/reference/using/build-systems.html).

## Descoberta comum às três skills

Antes de escolher uma técnica, obter apenas o contexto que pode mudar a decisão:

1. Pedido, comportamento esperado, erro observado e restrições de compatibilidade.
2. `pom.xml` ou arquivos Gradle, wrapper, toolchain e dependências efetivamente resolvidas.
3. Configuração, perfis, variáveis e configuração de implantação relevantes, sem revelar secrets.
4. Classes de configuração, componentes envolvidos, testes existentes e convenções consistentes.
5. Evidência específica: relatório de condições, resposta HTTP, cadeia de filtros,
   SQL e binds sanitizados, limites da transação ou estado observado no banco.

Distinguir requisito explícito, convenção consistente e hipótese. Perguntar somente por
informação relevante que não esteja no repositório; avançar em escolhas locais reversíveis.
Nunca inferir política organizacional a partir de uma classe ou aplicar uma estrutura DDD
apenas porque outras skills do catálogo a utilizam.

As boas práticas devem respeitar estrutura, nomes, organização de configurações, estilo
de registro de beans e convenções de teste já adotadas. Observar classes de responsabilidade
semelhante, distinguir padrão de ocorrência isolada e evitar padronização em massa durante
uma mudança local. Uma convenção que viola um contrato deve ser apontada com evidência,
sem reproduzir o defeito apenas por consistência.

## Trilha 1 — `spring-boot`

Ativar para configurar ou diagnosticar a composição de uma aplicação Boot, seus beans,
configuração externa, inicialização e recursos operacionais básicos.

| Item                              | Tópicos                                                                                                              | Decisão ou resultado verificável                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| B1. Bootstrap e build             | `SpringApplication`, `@SpringBootApplication`, estrutura de pacotes, starters, parent/BOM, plugins e grafo resolvido | Escolher dependências pelo recurso necessário; diagnosticar incompatibilidade antes de sobrescrever versões                         |
| B2. Auto-configuração             | Condições, classpath, beans customizados, backoff, relatório de condições e exclusões                                | Explicar por que uma configuração entrou ou saiu; justificar override ou exclusão com evidência                                     |
| B3. Beans e composição            | Injeção por construtor, `@Bean`, scan, qualifiers, ambiguidades, escopos, ciclos e proxies                           | Encontrar a composição efetiva; distinguir uma instância gerenciada de um objeto criado manualmente                                 |
| B4. Configuração externa          | Precedência, profiles, config imports, `@ConfigurationProperties`, `@Value`, binding, validação, duração e tamanho   | Localizar a fonte vencedora; escolher propriedades tipadas para grupos coesos; rejeitar configuração inválida sem expor credenciais |
| B5. Inicialização e encerramento  | Eventos de startup, runners, lifecycle, inicialização de recursos, falhas e graceful shutdown                        | Escolher o ponto de inicialização e demonstrar liberação de recursos; evitar trabalho ilimitado no startup                          |
| B6. Operação básica               | Actuator, exposição de endpoints, health, readiness/liveness, porta de management e integração de métricas           | Expor apenas o necessário e verificar a configuração real; encaminhar políticas de segurança e SLO aos responsáveis                 |
| B7. Testes de configuração        | Teste unitário, `ApplicationContextRunner`, contexto Boot, perfis de teste, doubles e beans condicionais             | Usar o menor contexto que verifica a hipótese; cobrir condição habilitada, desabilitada e bean customizado                          |
| B8. Diagnóstico e compatibilidade | Failure analysis, logs sanitizados, dependency tree, propriedades alteradas e notas de migração                      | Produzir hipótese discriminante e correção mínima; preservar uma configuração válida quando não houver defeito                      |

### Decisões de beans que precisam ficar explícitas

- **Registro e injeção são decisões diferentes.** Seguir a organização existente ao escolher
  `@Service` para serviços da aplicação, `@Component` para componentes sem estereótipo mais
  específico ou `@Bean` para factories, composição explícita e classes de terceiros.
  Uma mesma classe não deve ser registrada inadvertidamente por scan e por factory.
- **Novos códigos e exemplos sem `@Autowired`.** Usar dependências explícitas no construtor único,
  preferencialmente em campos `final`, ou parâmetros dos métodos `@Bean`. Não trocar field
  injection por outro mecanismo que esconda dependências. A restrição é uma escolha do
  conteúdo solicitado, não uma alegação de que a anotação foi removida do Spring.
  [Injeção e construtor único](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html).
- **`@Configuration(proxyBeanMethods = false)` quando os métodos forem factories
  independentes**, com dependências recebidas por parâmetros. Se houver chamadas diretas
  a métodos `@Bean` que dependam da interceptação para obter a instância gerenciada,
  preservar `true` ou refatorar essas chamadas e testar identidade, escopo e lifecycle.
  Não alterar o flag mecanicamente: em modo sem proxy, uma chamada Java direta não é
  interceptada. Esse flag não desabilita os proxies de transação ou de segurança dos
  beans produzidos. [Contrato de configuração](https://docs.spring.io/spring-framework/reference/core/beans/java/configuration-annotation.html).
- Não introduzir Lombok, service locator, `@Primary`, qualifiers ou lazy initialization
  apenas para esconder ambiguidade ou ciclo. Verificar a causa e preservar convenções
  adequadas do projeto; as alternativas devem resolver uma necessidade identificada.
- Quando houver estratégias selecionadas em runtime, comparar composição direta com
  registro de implementações recebidas por construtor. Distinguir nome do bean de chave
  de negócio; definir comportamento para chave desconhecida e duas implementações com
  a mesma chave. Não criar um registro dinâmico para uma única implementação estável.

Referência principal de B4: a ordem das fontes e as opções de binding são contratos
documentados; verificar a origem do valor antes de editar um arquivo que pode estar
sendo sobrescrito. [Configuração externa](https://docs.spring.io/spring-boot/reference/features/external-config.html).

### Logs estruturados e integração operacional

Detalhar em B6 a configuração nativa de logs estruturados do Boot, incluindo
`logging.structured.format.console`, formatos suportados e interação com configuração
customizada de Logback/Log4j2. Preservar um encoder existente que satisfaça o contrato;
não adicionar dependência ou trocar formato sem necessidade do consumidor dos logs.
[Logging do Boot](https://docs.spring.io/spring-boot/reference/features/logging.html).

Verificar uma amostra emitida: campos, timestamp, exceção, correlação e ausência de secrets.
Quando houver execução assíncrona, testar propagação e limpeza de contexto entre tarefas;
não presumir que MDC acompanha qualquer executor. Formato JSON, isoladamente, não demonstra
menor custo nem menor consumo de tokens. A skill configura a integração Boot e encaminha
schema, privacidade e custo para `structured-logging`; métricas e tracing seguem seus
especialistas quando a questão ultrapassar o wiring da aplicação.

Profundidade condicional: criação de starters/auto-configuração para bibliotecas,
`@Async`, scheduling, AOT/native image e otimização de startup. Não exigir esses recursos
para uma aplicação comum; só detalhar quando houver um caso que os justifique.

Eventos internos entram nessa profundidade condicional: comparar chamada direta,
`ApplicationEventPublisher`, listener transacional e execução assíncrona conforme acoplamento,
falhas e lifecycle. Verificar a fase e o comportamento sem transação de
`@TransactionalEventListener`; emissão em memória não estabelece entrega durável após falha
do processo. Se a entrega precisar sobreviver ao commit e ao reinício, encaminhar o requisito
de consistência, payload e recuperação ao especialista de eventos, sem tratá-lo como resolvido
pela anotação. [Eventos vinculados à transação](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html).

## Trilha 2 — `spring-boot-web`

Ativar para aplicações Boot com **Spring MVC/Servlet**, principalmente APIs HTTP.
Descobrir o stack real antes de usar exemplos; uso de `WebClient` por si só não define
a arquitetura do servidor. [Spring Web MVC](https://docs.spring.io/spring-framework/reference/web/webmvc.html).

| Item                        | Tópicos                                                                                              | Decisão ou resultado verificável                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| W1. Stack e configuração    | Servlet versus reativo, servidor embutido, starters e customização MVC                               | Preservar um stack adequado; identificar mudanças que substituem configuração automática e suas consequências          |
| W2. Entrada HTTP            | Controllers, mappings, parâmetros, headers, body, conversão e content negotiation                    | Implementar métodos, caminhos e media types do contrato; verificar entradas ausentes, malformadas e incompatíveis      |
| W3. DTOs e validação        | Bean Validation, validação de método, binding, campos permitidos e regras de negócio                 | Separar dados aceitos do estado interno; distinguir validação de transporte de invariantes usadas por outros canais    |
| W4. Serialização e resposta | Jackson conforme a versão, DTOs, datas, enumerações, campos ausentes/null, status e headers          | Preservar o contrato de leitura e escrita; evitar exposição acidental de campos ou entidades persistentes              |
| W5. Erros                   | `ProblemDetail`, exception handlers, `@ControllerAdvice`, erros do framework e fronteiras de filtros | Produzir respostas consistentes sem vazar internals; localizar erros que não passam pelo controller                    |
| W6. Consultas via API       | Paginação, ordenação, filtros, limites e representação da resposta                                   | Validar parâmetros e limites; manter a implementação da consulta e os detalhes de fetch na trilha JPA                  |
| W7. Extensões do pipeline   | Filters, interceptors, argument resolvers, converters, advice e dispatches                           | Escolher o ponto de extensão pelo momento e efeito; não usar interceptor como substituto de autenticação               |
| W8. Segurança integrada     | Composição com Spring Security, CORS, CSRF, 401/403 e endpoints de management                        | Encaminhar configuração de segurança à skill existente e verificar que a integração Web preserva a proteção            |
| W9. Testes HTTP             | `@WebMvcTest`, MockMvc, contexto completo e servidor em porta aleatória                              | Cobrir binding, serialização, validação e erros; usar servidor real quando a hipótese depende do container ou da rede  |
| W10. Recursos condicionais  | Multipart, uploads/downloads, async Servlet, streaming/SSE, timeout e desconexão                     | Limitar tamanho, duração e recursos; verificar cleanup e falhas apenas quando esses recursos fizerem parte do pedido   |
| W11. Documentação completa  | springdoc/OpenAPI, operações, schemas, exemplos, respostas, segurança, customização e Swagger UI     | Cobrir todos os contratos dos controllers no escopo e verificar o documento gerado, sua fidelidade e o consumo pela UI |

### Validação e experiência de consumo

Complemento solicitado durante a implementação: justificar a composição do tratamento de
erros, incluindo `ResponseEntityExceptionHandler`, validação de corpo e de parâmetros,
erros globais, falhas de retorno e preservação de status/headers. A forma do exemplo
`ApiErrors` deve ser confrontada com o comportamento real, sem captura genérica que
transforme falhas distintas no mesmo erro ou exponha valores rejeitados.
Centralizar erros comuns da aplicação, como 400/500 quando efetivamente produzidos,
em componentes reutilizáveis e customização global do OpenAPI. Aplicar aos documentos
padrão e agrupados, preservando respostas específicas e especializações das operações.
O tratamento HTTP global deve cumprir o contrato documentado; erros de filtros e do
container exigem verificação própria, sem inferir que o advice os cobre.

Documentar coleções com o contrato do array **e** dos itens: presença, nulidade, vazio,
`minItems`, `maxItems`, unicidade, ordenação, validação em cascata e exemplos completos.
Usar `@ArraySchema` quando apropriado; limites só podem declarar regras efetivas.
Para `violations`, preservar múltiplas violações do mesmo campo e não inventar um máximo
nem truncar erros para adequar a implementação a uma anotação.

- Distinguir validação de argumento e de método, incluindo os caminhos de
  `MethodArgumentNotValidException` e `HandlerMethodValidationException`. Verificar se
  `@Validated` na classe está escolhendo validação por AOP quando a intenção era usar
  a validação de método integrada ao MVC. Não adicionar ou remover a anotação por hábito.
  [Validação no MVC](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html).
- Testar múltiplas violações no mesmo campo. A representação de erros deve agregá-las
  ou selecionar uma por regra explícita, sem lançar exceção por chave duplicada no handler.
  Incluir erros globais e não devolver valores sensíveis rejeitados.
- Uma consulta prévia de unicidade pode melhorar a mensagem, mas não elimina a corrida
  entre duas gravações. Alinhar constraint no banco e tratamento do conflito conhecido
  com JPA; não converter indiscriminadamente toda falha de integridade em conflito do cliente.
- Exercitar uma criação seguida de leitura pelo consumidor: status, `Location`, campos
  públicos e paginação estável, inclusive atrás do proxy confiável. Preservar o contrato
  existente de versão e representação; não exigir `/v1` nem serialização direta de `Page`.

### Documentação completa com springdoc/OpenAPI

W11 é parte essencial de `spring-boot-web`. O pedido de **100% dos controllers documentados**
significa inventariar todas as operações HTTP no escopo e documentar integralmente seus
contratos: entradas, propriedades aninhadas, dados opcionais, respostas, erros, segurança
e condições de uso. Descrições devem explicar significado, unidades e comportamento;
repetir o nome Java de um atributo não satisfaz o critério.

A implementação deverá percorrer o catálogo de recursos das versões efetivamente usadas
de springdoc, Swagger Core, Swagger UI e OpenAPI. Para cada família abaixo, registrar
aplicação e verificação ou a condição concreta que a torna inaplicável. Recursos aplicáveis
não devem ser omitidos por não serem obrigatórios na especificação. Uma limitação de geração
ou renderização deve ser identificada e resolvida ou declarada; não pode desaparecer atrás
de uma alegação de cobertura total.

**Base técnica.** A documentação consultada em 27/09/2026 indica springdoc 3.x para Boot 4
e apresenta `springdoc-openapi-starter-webmvc-ui` para MVC com Swagger UI. Conferir a matriz,
o grafo resolvido e os patches antes de fixar o par; a tabela detalhada consultada relaciona
Boot 4.0.x a springdoc 3.0.x, sem comprovar todos os pares de minors posteriores.
Verificar também a versão da especificação gerada e a compatibilidade dos consumidores.
[Integração e matriz do springdoc, seção 13.80](https://springdoc.org/).

OpenAPI define o contrato, Swagger Core fornece modelos/anotações, springdoc integra a
geração ao Spring e Swagger UI oferece a interface de leitura e execução. Avaliar geração
e apresentação separadamente. A propriedade `springdoc.api-docs.version` permite selecionar
3.0 ou 3.1 na documentação consultada, cujo default é 3.1; conferir suporte antes de usar
keywords de outro dialeto. [Propriedades do springdoc](https://springdoc.org/properties.html).

| Família                 | Conteúdo e recursos a abordar                                                                                                                                                                                                                               | Resultado a verificar                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documento e controllers | `@OpenAPIDefinition`, `@Info`, título, versão da API, descrição, contato, licença, termos, `@Tag`, `@ExternalDocumentation`, servidores e variáveis de servidor conforme o projeto                                                                          | Consumidor identifica finalidade, ambientes, suporte e organização; metadados institucionais são reais, não inventados                                                                                |
| Operações               | `@Operation`, `summary`, `description`, `operationId` único e estável, tags, depreciação e orientação de migração; explicar pré-condições e efeitos relevantes                                                                                              | Cada combinação de caminho e método está representada; variantes por media type, headers ou parâmetros não se perdem na consolidação                                                                  |
| Parâmetros              | `@Parameter`, path/query/header/cookie, descrição, tipo, formato, obrigatoriedade, default efetivo, limites, enumerações, exemplos, `style`, `explode`, encoding e depreciação; paginação, filtros e ordenação, incluindo `@ParameterObject` quando cabível | Requisições montadas pela documentação correspondem ao binding do MVC; parâmetros opcionais também têm significado e exemplos                                                                         |
| Corpos de entrada       | `@RequestBody` do OpenAPI, `@Content`, media types, schema, exemplos, presença do body; form, multipart e `@Encoding` por parte quando existentes                                                                                                           | JSON, formulário, arquivo e metadados têm representação fiel; distinguir a anotação documental da `@RequestBody` de binding do Spring                                                                 |
| Tipos e schemas         | `@Schema`, `@ArraySchema`, tipos primitivos/objetos/coleções/maps, formatos, precisão, unidades, datas/fusos, IDs, enums e códigos, bounds, pattern, tamanho, itens, unicidade, defaults e propriedades adicionais                                          | Tipos e restrições refletem JSON e validação reais, incluindo campos opcionais e atributos aninhados; DTO genérico não vira um `object` sem contrato                                                  |
| Presença e composição   | `requiredMode`, null, ausência, `accessMode`, campos somente de leitura/escrita, `@JsonView`, nomes Jackson, modelos de create/update/PATCH; `oneOf`, `anyOf`, `allOf`, discriminator/mapping, referências e ciclos                                         | Obrigatoriedade e visibilidade são corretas por operação; cada variante polimórfica possui exemplo e schema coerente com sua serialização                                                             |
| Exemplos completos      | Exemplos de propriedade, parâmetro, request e response; `@ExampleObject` com nome, resumo, descrição, valor ou referência externa, e múltiplos cenários por media type                                                                                      | Oferecer exemplo mínimo válido e exemplo com opcionais, além de variantes relevantes e erros reais; conteúdos sintéticos válidos, legíveis e reproduzíveis                                            |
| Respostas e headers     | `@ApiResponse`/`@ApiResponses`, status de sucesso e falhas conhecidas, descrições, `@Content`, schemas, exemplos, `@Header`, links; `ProblemDetail`, validação, segurança e respostas sem body                                                              | Status, headers e payloads concordam com controllers, advice e filtros; documentar `Location`, cache, paginação, idempotência ou rate limit quando fizerem parte do contrato                          |
| Segurança               | `@SecurityScheme`, `@SecurityRequirement`, HTTP Basic/Bearer, API key, OAuth2/OpenID Connect, scopes, alternativas e combinações; mTLS se suportado pelo conjunto escolhido                                                                                 | Documento reproduz o acesso anônimo/autenticado e as exigências reais; autorização na UI funciona com o fluxo adotado e exemplos não contêm credenciais reais                                         |
| Reuso e customização    | `components` e `$ref` para schemas, parâmetros, bodies, respostas, headers, exemplos e segurança; configuração `OpenAPI`, customizadores, conversores de modelos e extensões `x-` quando necessários                                                        | Centralização preserva diferenças entre operações e grupos; referências resolvem e customizadores não sobrescrevem informação correta nem inventam comportamento                                      |
| Grupos e publicação     | `GroupedOpenApi`, seleção por paths/packages, grupos por público ou versão, JSON/YAML, URLs, profiles, contexto `/api`, proxy e porta de management quando utilizados                                                                                       | Cada público recebe as operações previstas; documentação interna e externa não se confundem e URLs geradas apontam para o ambiente correto                                                            |
| Swagger UI              | Ordenação de tags/operações, filtros, expansão, visualização de schemas/exemplos, deep links, duração, snippets, seleção de grupos/servidores, OAuth2/PKCE, persistência de autorização, controle de Try it out, layout e identidade visual                 | Consumidor encontra a operação, escolhe exemplos e monta a chamada correta; customizações funcionam na UI efetivamente distribuída                                                                    |
| Recursos especializados | Links entre operações, callbacks, webhooks, XML quando usado, binários, downloads, SSE/streaming, extensões e recursos de JSON Schema 3.1 suportados, como condições e dependências de propriedades                                                         | Aplicar quando o contrato usar o recurso, conferir suporte de geração/renderização e explicar comportamento que o formato não conseguir representar; não criar endpoints para demonstrar uma anotação |

Contratos e APIs para orientar os exemplos: [`@Operation`](https://docs.swagger.io/swagger-core/v2.2.48/apidocs/io/swagger/v3/oas/annotations/Operation.html),
[`@Parameter`](https://docs.swagger.io/swagger-core/v2.2.48/apidocs/io/swagger/v3/oas/annotations/Parameter.html),
[`@RequestBody`](https://docs.swagger.io/swagger-core/v2.2.48/apidocs/io/swagger/v3/oas/annotations/parameters/RequestBody.html),
[`@Schema`](https://docs.swagger.io/swagger-core/v2.2.48/apidocs/io/swagger/v3/oas/annotations/media/Schema.html),
[`@ArraySchema`](https://docs.swagger.io/swagger-core/v2.2.48/apidocs/io/swagger/v3/oas/annotations/media/ArraySchema.html),
[`@ExampleObject`](https://docs.swagger.io/swagger-core/v2.2.48/apidocs/io/swagger/v3/oas/annotations/media/ExampleObject.html)
e [`@ApiResponse`](https://docs.swagger.io/swagger-core/v2.2.48/apidocs/io/swagger/v3/oas/annotations/responses/ApiResponse.html).
Esses Javadocs são referências de contrato; sua versão não substitui a inspeção do artefato
resolvido nem autoriza sobrescrever dependências transitivas do projeto.

#### Decisões que os exemplos precisam ensinar

- **Obrigatoriedade tem três níveis:** parâmetro, presença do body e propriedade do objeto.
  Um campo opcional pode rejeitar null quando presente; um campo obrigatório pode aceitar
  null. Distinguir também string vazia e coleção vazia. Em OpenAPI 3.1, representar null
  conforme JSON Schema; não transportar mecanicamente `nullable` de 3.0. Conferir grupos
  de Bean Validation e semântica de PATCH antes de reutilizar o schema de criação.
- **Documentação e execução devem concordar.** `@Schema` não implementa validação nem
  oculta dados na serialização, e `@SecurityRequirement` não protege endpoints. Usar
  `requiredMode` no lugar do atributo `required` depreciado de `@Schema`; os atributos
  `required` de parâmetros e request bodies têm contratos próprios. Verificar ausência,
  null, limites e visibilidade com o MVC/Jackson/Validator reais.
- **Exemplos têm contexto.** Distinguir exemplos do schema, `example` e `examples` do
  media type/parâmetro; não preencher alternativas mutuamente exclusivas. Exemplos de
  requests válidos devem satisfazer o schema e as regras documentadas. Requests inválidos
  pertencem a cenários negativos explicados, acompanhados da resposta de erro correspondente,
  sem aparecer como exemplo normal válido. Default documentado deve existir em runtime.
- **Erros e respostas são específicos.** Descrever todas as falhas conhecidas aplicáveis,
  com payload e condição de ocorrência. Uma resposta `default` ou um bloco global copiado
  não substitui esse inventário. Não inventar body para 204, nem atribuir `ProblemDetail`
  a um erro de filtro que usa outro formato. Inspecionar respostas adicionadas pelo advice.
- **Segurança deve preservar a lógica.** Em OpenAPI, esquemas no mesmo objeto de requisito
  representam combinação; objetos alternativos representam alternativas. Verificar overrides
  de operações públicas e scopes; não documentar Bearer como parâmetro comum de header.
  Conferir o resultado gerado e a cadeia de segurança, inclusive o acesso à documentação.
  [Contratos da especificação OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.1.html).
- **Customização deve ter um responsável claro.** Escolher anotações, convenção existente
  de interfaces de controllers ou modelo programático conforme a manutenção do projeto.
  Não introduzir interfaces apenas para deslocar anotações. Diferenciar customização do
  documento padrão, de um grupo e global; `OpenApiCustomizer` e `GlobalOpenApiCustomizer`
  têm alcance distinto. [Customização springdoc, seção 13.28](https://springdoc.org/).
- **UI é um consumidor do contrato.** Conferir propriedades suportadas, plugins, interceptors
  e recursos estáticos antes de escolher o mecanismo; opções que exigem funções JavaScript
  precisam da integração correspondente. Testar customizações com a versão embarcada.
  Separar controles de Try it out da autorização real e decidir exposição, persistência
  de tokens e chamadas a validadores externos pelo ambiente. [Configuração da UI](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/)
  e [sistema de plugins](https://swagger.io/docs/open-source-tools/swagger-ui/customization/overview/).

#### Evidência e conclusão da documentação

1. Inventariar mappings dos controllers no escopo, incluindo interfaces/herança, múltiplos
   paths, métodos, media types e condições. Conciliar o inventário com o documento por
   caminho/método e variantes. Exclusões precisam de motivo de escopo; ocultar uma operação
   para elevar a cobertura é falha. Registrar explicitamente limites de representação.
2. Percorrer schemas de entrada e saída recursivamente, comparando propriedades com a
   serialização real, inclusive opcionais, aninhadas, views e tipos customizados. Conferir
   descrição, tipo, presença, restrições, visibilidade e exemplos em cada contrato.
3. Gerar JSON/YAML em fixture isolada com a configuração pertinente e validar sintaxe,
   referências, IDs e regras semânticas do dialeto. Preferir parser/linter existente;
   validação sintática sozinha não demonstra fidelidade nem documentação completa.
4. Validar exemplos e executar casos HTTP positivos e negativos para comparar status,
   headers e bodies com o contrato. Exercitar erro de segurança, body ausente, null,
   limites e múltiplas violações quando aplicáveis. Não chamar ambientes reais para
   testar exemplos mutantes.
5. Abrir a Swagger UI da fixture e conferir navegação, grupos, schemas, exemplos,
   autenticação e URLs atrás do contexto/proxy previsto. Quando houver Try it out,
   verificar a requisição e a resposta efetivas. Reportar separadamente falha de geração
   e limitação de renderização; um print da tela não substitui validação do contrato.
6. Automatizar geração e comparação semântica do contrato na CI, distinguindo mudança
   editorial de incompatibilidade de operação, tipo, obrigatoriedade, resposta ou segurança.
   Usar plugin Maven/Gradle apenas após verificar lifecycle, versões e requisitos; quando
   houver cliente gerado, incluir consumo representativo no conjunto de verificações.
7. Entregar documento gerado, configuração e fontes mantíveis, matriz de cobertura e
   evidência dos checks. Declarar 100% somente quando todas as operações e propriedades
   do inventário, inclusive opcionais, tiverem o conteúdo aplicável verificado. Recursos
   não aplicáveis e limitações permanecem explícitos; itens pendentes impedem essa declaração.

Na skill futura, manter a exigência de cobertura e os critérios essenciais no `SKILL.md`.
Prever `references/springdoc-openapi.md` para o procedimento completo, lido em toda tarefa
de documentação de controllers; recursos detalhados de schemas/exemplos e UI podem ter
referências próprias com condição de leitura explícita. Reutilizar a fixture Web para
testes do contrato e uma fixture especializada quando multipart/polimorfismo/callbacks
exigirem outro cenário. Estes são recursos planejados, ainda não criados.

### Capacidade do servidor e natureza da carga

Acrescentar um bloco essencial de configuração Web com os seguintes critérios:

| Decisão                            | Condições e evidência a exigir                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I/O bloqueante, CPU ou carga mista | Observar espera de banco/rede, CPU disponível inclusive limites de container, concorrência, throughput e p95/p99. Virtual threads podem ajudar a sustentar espera concorrente; não acrescentam capacidade de CPU. Isolar paralelismo de CPU quando necessário, com limite e fila justificados |
| Threads do Tomcat                  | Comparar executor tradicional e virtual na versão efetiva. Com virtual threads habilitadas, `server.tomcat.threads.max` e `min-spare` não limitam os workers virtuais; verificar o executor realmente configurado e customizações existentes                                                  |
| Admissão, conexões e filas         | Distinguir conexões TCP, requests ativos, fila do executor, backlog do connector, multiplexação HTTP/2 e concorrência no banco. `max-connections`/`accept-count` não substituem limites de operações em voo nem o pool JDBC                                                                   |
| Orçamento de timeout               | Separar timeout de leitura da requisição, keep-alive, execução assíncrona, aquisição JDBC, consulta, lock, chamada externa e deadline total. Verificar unidades e comportamento de cancelamento; timeout de conexão HTTP não é duração máxima de uma operação                                 |
| Recursos externos e overload       | Dimensionar admissão, pools HTTP/JDBC e tarefas assíncronas como recursos distintos. Muitas virtual threads esperando conexão ainda consomem memória e tempo; testar saturação e rejeição controlada                                                                                          |
| HTTP/2, compressão e proxy         | Verificar caminho cliente/proxy/servidor, custo de compressão para a CPU, tamanho das respostas e trust boundary de forwarded headers; medir antes de generalizar ganho                                                                                                                       |

Conferir propriedades por versão e considerar que executores customizados podem mudar a
auto-configuração. Não construir um pool de virtual threads para limitar concorrência;
usar o mecanismo de admissão apropriado ao recurso. Usar `spring.main.keep-alive` quando
o lifecycle exigir que o processo permaneça ativo apesar de trabalho em threads daemon.
[Propriedades do Boot](https://docs.spring.io/spring-boot/appendix/application-properties/index.html),
[execução de tarefas](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html)
e [motivação e limites de virtual threads](https://openjdk.org/jeps/444).

Na seleção dos testes, explicitar que um teste em contexto mock e um teste com servidor
real exercitam fronteiras diferentes. Incluir a armadilha de presumir que uma transação
do teste desfaz gravações efetuadas por uma requisição em outra thread.
[Testes de aplicações Boot](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html).

Os exemplos de teste devem usar APIs disponíveis no baseline 4.x. `@MockBean` e `@SpyBean`
foram removidos no Boot 4; considerar `@MockitoBean` e `@MockitoSpyBean` do Framework quando
for necessário substituir beans, ou doubles explícitos quando suficientes. Conferir também
imports e módulos dos slices. Identidade simulada em teste não verifica parsing e validação
de um token real. Cobertura percentual ajuda a localizar lacunas, mas não substitui casos
de falha nem justifica uma meta fixa para qualquer projeto.
[Mudanças de teste no Boot 4](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide).

Profundidade futura: clientes HTTP de saída, templates HTML e WebSocket. WebFlux terá
uma skill própria se houver demanda; não copiar mecanismos Servlet para um projeto reativo.

## Trilha 3 — `spring-boot-jpa`

Complemento solicitado durante a implementação: revisar **todos os atributos da entidade**,
incluindo os opcionais, com obrigatoriedade, tipo, comprimento/precisão, geração, propriedade
de escrita e relacionamentos definidos conforme o contrato real. Diferenciar
`@Column(nullable = false)`, `@Basic(optional = false)`, Bean Validation e a constraint do
schema aplicado; repetir defaults indiscriminadamente não demonstra completude.

Incluir a estratégia fornecida de `equals`/`hashCode` para IDs gerados: classe persistente
efetiva para proxies, igualdade somente com ID não nulo e hash estável por classe.
Verificar objetos transitórios, persistência após entrada em `HashSet`, instâncias em
contextos diferentes e proxies carregados ou destacados. Explicar alternativas de chave
natural imutável e identidade de referência, custos do hash por classe e limites de
inicialização de proxies; não aplicar a receita universalmente nem incluir associações
ou campos mutáveis na igualdade.

Ativar para implementação ou diagnóstico da integração Boot + Spring Data JPA + provider,
incluindo consistência e observação das operações no banco.

| Item                         | Tópicos                                                                                                      | Decisão ou resultado verificável                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| J1. Integração inicial       | Datasource, pool, descoberta de entidades/repositórios, provider e unidade de persistência                   | Demonstrar qual datasource e transaction manager atendem a operação; evitar configuração adicional sem necessidade          |
| J2. Mapeamento aplicado      | Identidade, geração de IDs, relações, lado proprietário, cascades, orphan removal, embeddables e conversores | Conferir SQL e integridade do caso concreto; reutilizar as skills de mapeamento para decisões estruturais profundas         |
| J3. Estado e persistência    | Entidade nova/gerenciada/destacada, `save`, `persist`, `merge`, dirty checking, flush e commit               | Preservar estado e intenção de atualização; não confundir chamada a `save` ou flush com commit concluído                    |
| J4. Repositórios e consultas | Métodos derivados, `@Query`, JPQL, SQL nativo, projeções, fragments e Specifications                         | Usar consulta simples quando suficiente; justificar composição dinâmica por requisitos reais                                |
| J5. Transações               | Fronteira de serviço, `@Transactional`, proxy, self-invocation, propagation, rollback, `readOnly` e manager  | Verificar a transação efetivamente aberta e seus participantes; testar rollback em uma falha representativa                 |
| J6. Fetch e fronteira HTTP   | Lazy loading, N+1, entity graphs, fetch joins, projeções e Open EntityManager in View                        | Escolher dados pelo caso de uso; observar SQL durante a operação completa e evitar mudar tudo para eager                    |
| J7. Paginação                | `Page`, `Slice`, ordenação estável, custo do count, coleções e scrolling conforme a versão                   | Preservar cardinalidade e limites da página; verificar SQL e resultados com dados representativos                           |
| J8. Concorrência             | `@Version`, locks pessimistas, constraints, conflito de atualização e tratamento de falhas                   | Demonstrar que atualizações concorrentes respeitam a regra; não aplicar retry cego à transação inválida                     |
| J9. Escritas especiais       | Bulk update/delete, `@Modifying`, estado do contexto, callbacks, auditoria e batching                        | Verificar efeitos no banco e no contexto de persistência; não presumir equivalência com alterações de entidades individuais |
| J10. Schema e inicialização  | Flyway/Liquibase conforme o projeto, DDL do provider, scripts SQL, ordem e compatibilidade                   | Identificar quem é responsável pelo schema; não usar atualização automática como plano de evolução de produção              |
| J11. Testes de persistência  | `@DataJpaTest`, banco substituto versus real, Testcontainers, flush/clear, commit e transações independentes | Observar persistência fora do estado gerenciado quando necessário; não inferir compatibilidade de banco a partir de mocks   |

O comportamento de `save` depende da identificação de uma entidade como nova e da
operação JPA escolhida. Usar esse contrato para construir exemplos de criação e atualização,
inclusive PATCH com campos ausentes. [Persistência de entidades](https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html).

A configuração transacional de métodos herdados, consultas declaradas e serviços precisa
ser distinguida. Não atribuir automaticamente o mesmo contrato a todos os métodos de um
repositório. [Transações em Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html).

Em J4/J6, verificar também a semântica do resultado ao otimizar: um join que exclui pais
sem filhos não é equivalente a uma consulta que os incluía. Comparar projeções fechadas,
DTOs e projeções com expressões pelo SQL e pelos dados materializados; o nome "projeção"
não comprova que só as colunas necessárias foram carregadas.

Profundidade condicional: múltiplos datasources, auditoria com contexto de usuário,
multitenancy, soft delete e consistência entre banco e eventos. Manter JDBC/SQL explícito,
Spring Data JDBC e outras abordagens como alternativas legítimas; não adotar JPA apenas
porque esta skill foi selecionada. R2DBC pertence a outro modelo de persistência.

Quando auditoria for necessária, incluir `@EnableJpaAuditing`, listeners,
`@CreatedDate`/`@LastModifiedDate`, `AuditorAware` e `DateTimeProvider` conforme o contrato.
Definir quem é o ator em HTTP autenticado, acesso anônimo e jobs sem request; não assumir
que todo principal é um usuário de domínio nem usar `isAuthenticated()` isoladamente para
classificar o ator. Datas apenas não exigem `AuditorAware`. Para testes determinísticos,
conectar o relógio controlado ao provider realmente usado e conferir valores após flush e
releitura. Distinguir esses metadados de um histórico completo de alterações e verificar
o caminho de bulk DML, que não deve ser presumido equivalente aos callbacks de entidades.
[Auditoria Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/auditing.html).

### Tipos, identificadores, referências e transações

Os tópicos de JPA devem incluir decisões específicas do Hibernate quando ele for o provider:

| Tema                         | Critério a ensinar e verificar                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo Java, JDBC e coluna SQL | Verificar os três, incluindo nullabilidade, domínio, conversão, precisão e faixa. Usar `@JdbcTypeCode(SqlTypes.TINYINT)` ou `INTEGER` quando o contrato exigir o mapeamento explícito, sem espalhar overrides redundantes. A anotação não migra schema existente       |
| Códigos e enums persistidos  | Definir representação estável e compatibilidade de evolução. Não mudar o tipo apenas para eliminar warning nem usar ordinal mutável como código de negócio sem avaliar migração                                                                                        |
| Texto                        | Escolher `VARCHAR`/`NVARCHAR`, `@Nationalized`, comprimento e collation conforme os dados e o banco. Validar parâmetros JDBC e round-trip com caracteres fora de ASCII; não presumir que `VARCHAR` sempre exclui Unicode                                               |
| Identidade                   | Comparar sequence, identity e IDs atribuídos/UUID conforme banco, batching, índices, múltiplos escritores e contrato. Detalhar `allocationSize`, optimizer e DDL; não confundir reserva de IDs, cache da sequence e tamanho do batch JDBC                              |
| Entity reference             | Comparar `findById` com `getReferenceById`/`EntityManager.getReference` ao associar uma FK por ID. Uma referência não comprova existência nem autorização; considerar exceção tardia, contexto aberto e constraints, sem prometer zero SELECT em todo provider/cenário |
| N+1                          | Medir SQL/binds e contagem de statements com dados representativos, incluindo serialização e paginação. Comparar projeção, entity graph, fetch join e batch fetching; `jdbc.fetch_size` não resolve N+1                                                                |
| Locks e hints                | Distinguir `@Lock(LockModeType.PESSIMISTIC_WRITE)`, hints JPA e hints SQL específicos. Verificar SQL gerado, transação ativa, isolamento, bloqueio, timeout e deadlock em duas sessões. Lock pessimista não é um hint genérico de desempenho                           |
| Escopo transacional          | Delimitar a unidade de consistência que acessa o banco, incluindo as decisões que precisam ser atômicas. Manter I/O remoto e computação longa fora quando possível; não fragmentar uma operação atômica em uma transação por chamada de repositório                    |
| Leitura                      | Considerar `@Transactional(readOnly = true)` para unidades de leitura; conferir participação em transações existentes e comportamento do provider/driver. O flag é uma indicação de intenção/otimização, não uma garantia universal de bloquear writes                 |
| Tempo                        | Verificar `Instant`, tipo JDBC, `datetime2`/`datetimeoffset`, precisão e conversão. Testar ida e volta em JVMs com fusos diferentes antes de atribuir um deslocamento apenas ao timezone da JVM                                                                        |

Fontes para os contratos de mapeamento e referência:
[`@JdbcTypeCode`](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/annotations/JdbcTypeCode.html),
[`getReferenceById`](https://docs.spring.io/spring-data/jpa/reference/api/java/org/springframework/data/jpa/repository/JpaRepository.html),
[locking Spring Data](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html)
e [transações e `readOnly`](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html).

No SQL Server, `TINYINT` aceita 0 a 255, faixa diferente de `byte` Java. Para texto,
`VARCHAR` com collation UTF-8 pode representar Unicode; verificar também as unidades de
comprimento e o comportamento do driver. Nenhuma dessas escolhas deve ser copiada para
PostgreSQL por analogia. [Tipos inteiros SQL Server](https://learn.microsoft.com/en-us/sql/t-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql),
[collation e Unicode](https://learn.microsoft.com/en-us/sql/relational-databases/collations/collation-and-unicode-support).

O exemplo solicitado de `@SequenceGenerator(name = "outbox_event_seq",
sequenceName = "outbox_event_seq", allocationSize = 50)` será um caso de avaliação,
com `@Id` e `@GeneratedValue` correspondentes e migration inspecionada. Ao usar `pooled-lo`,
alinhar o incremento físico da sequence com o tamanho de alocação utilizado pelo optimizer
e conferir os demais escritores. Testar múltiplas instâncias, reinício e rollback;
lacunas são compatíveis com esse mecanismo, e o ID não estabelece ordem de commit.
O valor 50 será uma hipótese a comparar, não uma constante universal.
[Contrato de `PooledLoOptimizer`](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/id/enhanced/PooledLoOptimizer.html).

### Pool JDBC e propriedades Hibernate

O dimensionamento deve considerar concorrência realmente ativa no banco, tempo de posse
da conexão, limites do banco, quantidade máxima de réplicas e outros consumidores.
Cobrir pico, idle seguido de rajada, lentidão do banco e transação que segura conexão.
Não igualar quantidade de conexões a threads HTTP ou virtuais.
Incluir o caso de transação externa que retém conexão enquanto uma `REQUIRES_NEW`
solicita outra: investigar o risco de esgotamento antes de aumentar o pool.
As heurísticas de sizing são ponto de partida para ensaios, não valores garantidos.
[Discussão de sizing e pool-locking do HikariCP](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing).

Para cada propriedade ensinada, registrar: problema que resolve, unidade, versão que a
suporta, pré-condição, efeito observável, trade-off e condição para manter o default.
Verificar a dependência efetiva antes de usar a documentação: o BOM varia dentro de Boot 4.x.
[Dependências gerenciadas](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html).

O núcleo deve tratar `maximum-pool-size`, `minimum-idle`, aquisição, lifecycle de conexões,
autocommit, schema, dialect, OSIV, batches, fetch size e logging/estatísticas. Investigações
aprofundadas de planos SQL e dimensionamento seguem os especialistas existentes.

## Caso de configuração: agendador, SQL Server e virtual threads

Usar o YAML fornecido na conversa como entrada de revisão. A tabela abaixo registra as
decisões a verificar, sem persistir senha, usuário administrativo ou uma URL pronta para
uso como configuração recomendada. Não houve conexão ao banco nem benchmark da aplicação.

| Configuração ou afirmação                                                           | Tratamento no plano                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hikari `connection-timeout: 250`                                                    | É espera para adquirir conexão do pool, não timeout de SQL. 250 ms é o piso aceito, não um ótimo universal. Derivar do deadline e testar aquisição em pico, conexão fria e banco lento                                         |
| `maximum-pool-size: 20`, `minimum-idle: 0`                                          | Comparar custo de manter conexões com latência para criá-las após idle. Multiplicar o orçamento por todas as réplicas e pools; escolher pelos limites e medidas do ambiente                                                    |
| `idle-timeout` e `max-lifetime: 600000`                                             | Distinguir remoção por ociosidade de idade da conexão. `maxLifetime` não interrompe uma conexão em uso e não é prazo de segurança nem timeout de transação; alinhar com limites da infraestrutura                              |
| Hikari `auto-commit: false` + `provider_disables_autocommit: true`                  | A segunda opção declara uma garantia do provider; não desliga autocommit por si. Confirmar o estado das conexões entregues e os consumidores JDBC diretos; testar rollback. Não prometer desempenho máximo por combinar flags  |
| `open-in-view: false`                                                               | Planejar DTO/fetch e limites do contexto antes da serialização. Verificar carregamento necessário dentro da unidade de trabalho; desativar OSIV isoladamente não elimina N+1                                                   |
| `ddl-auto: none` + `sql.init.mode: never`                                           | Identificar a ferramenta de migrations, seu responsável e a criação das sequences. Esses flags não executam nem validam o schema; decidir validação por ambiente                                                               |
| `hibernate.dialect` explícito                                                       | Conferir se a detecção pelo provider já atende e quando um override é necessário. Não congelar um dialect errado para o banco real                                                                                             |
| `batch_size: 50`, `order_updates`, `batch_versioned_data`                           | Medir batch efetivo, flush, quantidade de entidades e estratégia de IDs. Verificar existência e efeito de cada propriedade na versão resolvida; não perpetuar uma chave histórica porque o Boot aceitou o mapa de propriedades |
| `jdbc.fetch_size: 50`                                                               | Distinguir hint de fetch JDBC, limite/página da consulta, batch de DML e batch de carregamento de associações; conferir comportamento do driver                                                                                |
| `jdbc.time_zone: UTC`                                                               | Verificar binding e extração reais do atributo. Não assumir que todo `Instant` usa `datetime2` nem que essa opção governa todas as APIs temporais do driver                                                                    |
| `connection-init-sql: SET ARITHABORT ON`                                            | Conferir opções efetivas da sessão, compatibility level, outras opções SET, predicado, binds, estatísticas e plano. A elegibilidade do índice filtrado não garante que o otimizador escolha um seek                            |
| `sendStringParametersAsUnicode=false`                                               | Avaliar tipo da coluna, collation, tipo JDBC e métodos de binding. Evitar conversões prejudiciais no predicado sem perder caracteres; testar valores não ASCII e plano real                                                    |
| Driver duplicado, `encrypt` repetido e dois `applicationName`                       | Consolidar a fonte de configuração e verificar a propriedade efetiva. Uma mudança deve esclarecer o que o driver recebeu, sem depender de duplicatas conflitantes                                                              |
| Senha default, conta administrativa, banco `master` e `trustServerCertificate=true` | Separar fixture local de configuração implantada: secret externo, conta da aplicação, banco apropriado e validação de certificado. O último flag dispensa a validação do certificado TLS; não copiá-lo como padrão de produção |
| SQL logging e estatísticas                                                          | Separar `show-sql`, categorias do logger, formatação e instrumentação temporária. Não duplicar opções nem habilitar binds sensíveis como receita de diagnóstico                                                                |
| Virtual threads e `keep-alive`                                                      | Confirmar executores ativos, lifecycle e admissão. Threads virtuais não multiplicam as 20 conexões disponíveis                                                                                                                 |
| HTTP/2, compressão e forwarded headers                                              | Medir custo/benefício e verificar negociação, terminação TLS e proxy que saneia headers externos; não confiar em headers arbitrários do cliente                                                                                |
| Actuator `include: '*'`, `base-path: /` e context path `/api`                       | Inventariar caminhos efetivos e endpoints disponíveis; selecionar exposição e testar autenticação/autorização com as chains reais. O trecho sozinho não prova acesso público, mas também não comprova proteção                 |

Os contratos de timeout e lifecycle acima estão documentados pelo
[HikariCP](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby).
Para autocommit, dialect e tipos temporais, consultar os
[JdbcSettings do Hibernate](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/cfg/JdbcSettings.html);
para batching, confrontar o conjunto efetivo de
[BatchSettings](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/cfg/BatchSettings.html).

No caso de índice filtrado, a documentação SQL Server exige um conjunto de opções SET
e registra que `ANSI_WARNINGS ON` implica `ARITHABORT ON` a partir de compatibility level 90.
Portanto, atribuir um scan exclusivamente a `ARITHABORT OFF` do cliente exige evidência da
sessão e do plano; não adotar essa explicação apenas pelo comentário no YAML.
[Requisitos de índices filtrados](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql#filtered-indexes).

Validar também os contratos do driver para
[propriedades de conexão e Unicode](https://learn.microsoft.com/en-us/sql/connect/jdbc/setting-the-connection-properties)
e [TLS/certificados](https://learn.microsoft.com/en-us/sql/connect/jdbc/connecting-with-ssl-encryption).
Os textos explicativos do YAML são hipóteses ou intenções; não são resultados medidos.

## Composição com o catálogo existente

| Conhecimento já disponível  | Skills existentes                                                                                     | Acréscimo esperado das novas skills                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Build e desenho de serviços | `java-build-and-dependencies`, `service-layer-design`, `layering-and-boundaries`                      | Composição e diagnóstico efetivos do Boot                                                                       |
| Contratos e pipeline HTTP   | `rpc-and-api-contracts`, `remote-facade-and-dto`, `mvc-and-request-handling`                          | Implementação, configuração e testes específicos de Spring MVC                                                  |
| Segurança Servlet           | `spring-security-for-apis`                                                                            | Integração do endpoint com as proteções existentes, sem duplicar a política                                     |
| Mapeamento e estado ORM     | `orm-structural-mapping`, `orm-behavioral-patterns`, `inheritance-mapping-strategies`                 | Aplicação desses contratos ao provider e aos repositórios do projeto                                            |
| Consultas e desempenho      | `repository-pattern`, `query-objects-and-specifications`, `orm-fetch-and-batching-performance`        | APIs Spring Data, SQL observado e conexão com o caso de uso                                                     |
| Transações e schema         | `enterprise-transactions`, `online-database-schema-migrations`                                        | Wiring, interceptação, configuração e testes de commit/rollback                                                 |
| Testes e operação           | `java-testing-strategy`, `java-test-design`, `connection-pool-sizing`, `kubernetes-service-lifecycle` | Escolha de contextos Spring e configuração operacional específica do Boot                                       |
| Observabilidade             | `structured-logging`, `metrics-and-cardinality`, `distributed-tracing-design`                         | Configuração Boot e evidência de emissão/propagação, sem duplicar políticas de observabilidade                  |
| Padrões e eventos           | `gof-pattern-selection`, `gof-observer`, `event-driven-architecture`                                  | Composição de beans e listeners quando houver requisito concreto, com limites de transação e entrega explícitos |

Na implementação, cada encaminhamento deve informar quando usar a outra skill, contexto
a transferir, resultado esperado e alternativa se ela estiver indisponível. Declarar os
encaminhamentos opcionais em `suggests`; verificar as regras de dependências e tabelas de
roteamento em [skill-format](skill-format.md) antes de empacotar. Não criar ciclos ou
instalar todo o catálogo como pré-requisito das três skills.

## Referência externa: `piomin/claude-ai-spring-boot`

Consulta em 27/09/2026 ao commit
[`d87e7a38588a0a945ae2c11a251954897692330e`](https://github.com/piomin/claude-ai-spring-boot/tree/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills),
de 29/04/2026. Foram lidos os cinco `SKILL.md` existentes (`spring-boot`, `jpa-patterns`,
`logging-patterns`, `code-quality`, `design-patterns`), as cinco referências do primeiro
(`web`, `data`, `testing`, `security`, `cloud`) e o README da pasta. O README cita nomes que
não correspondem integralmente à árvore consultada; o inventário acima usa os arquivos reais.

A skill principal declara Boot 3.x. O material serve como entrada para comparação e casos
de uso, sem alterar o escopo 4.x nem as permissões deste trabalho. A licença do repositório
é Apache-2.0; não houve importação de código ou instalação de skills. Reutilização futura
de arquivos deve verificar os avisos aplicáveis. Há exemplos incompletos e recomendações
conflitantes entre arquivos, portanto os snippets não são fixtures verificadas.

| Conteúdo examinado                                                                                                                                                                                                                                                                                                  | Aproveitamento no plano                                                                                             | Adaptação ou limite                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Spring Boot](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/spring-boot/SKILL.md)                                                                                                                                                                    | Composição, propriedades tipadas, testes e referências por necessidade, já cobertos por B1–B8                       | Reescrever exemplos para versões efetivas 4.x; não impor pasta por camada, deploy ou confirmação antes de toda implementação                                    |
| [Web](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/spring-boot/references/web.md)                                                                                                                                                                   | Detalhar erros de validação, consumo de `Location`, DTOs e conflito de unicidade                                    | Cobrir violações repetidas por campo e concorrência; não copiar retries indiscriminados nem traduzir todo HTTP 4xx como recurso ausente                         |
| [JPA](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/jpa-patterns/SKILL.md) e [Data](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/spring-boot/references/data.md)                     | Acrescentar casos de auditoria, projeção e preservação de cardinalidade aos tópicos de fetch, mappings e transações | Não habilitar OSIV como correção automática de lazy loading; distinguir auditoria de histórico, consulta de existência de constraint e flush de commit          |
| [Logging](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/logging-patterns/SKILL.md)                                                                                                                                                                   | Incluir configuração estruturada nativa do Boot e teste de correlação em B6                                         | Preservar integração existente adequada; conferir dados emitidos e custo, sem prometer economia de tokens por usar JSON                                         |
| [Testing](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/spring-boot/references/testing.md)                                                                                                                                                           | Detalhar substituição de beans, relógio controlado, slices e infraestrutura real nas três skills                    | Substituir APIs removidas; comparar banco substituto e real conforme a hipótese, sem meta universal de 85% nem rollback presumido entre threads                 |
| [Design patterns](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/design-patterns/SKILL.md) e [Code quality](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/code-quality/SKILL.md)       | Composição Spring de estratégias/eventos e revisão orientada a defeito, impacto e correção                          | Reutilizar o catálogo de padrões; não introduzir builder por contagem de parâmetros nem impor versionamento de URL ou proibição universal de POST para consulta |
| [Security](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/spring-boot/references/security.md) e [Cloud](https://github.com/piomin/claude-ai-spring-boot/blob/d87e7a38588a0a945ae2c11a251954897692330e/.claude/skills/spring-boot/references/cloud.md) | Usar cenários de integração de segurança, health e observabilidade para conferir as fronteiras                      | Segurança pertence à skill existente; não adotar filtro JWT próprio sem necessidade. Config Server, Eureka e Gateway continuam fora desta entrega               |

As incorporações acima orientam tópicos e testes a criar; a leitura das referências não
comprova ganho de desempenho, correção dos exemplos ou melhoria de comportamento de agentes.

## Exemplos e critérios de avaliação previstos

Usar um serviço pequeno de **reservas de estoque** como exemplo integrador: configuração
tipada, criação e consulta HTTP, atualização concorrente e armazenamento relacional.
Cada skill também deve ter exemplos independentes; usar Web não deve exigir instalar JPA.
Acrescentar uma fixture pequena de persistência/claim de outbox em SQL Server para os
casos de tipos, IDs e locks pedidos. O protocolo distribuído de entrega e idempotência
não será implicitamente resolvido por um lock JPA; manter essa fronteira explícita.

Os casos abaixo são critérios planejados, ainda não executados. Preparar entradas e
expectativas antes de escrever as instruções; separar os critérios do avaliador dos
recursos fornecidos ao agente.

| Caso                                                                        | Comportamento esperado                                                               | Falha observável                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Criar um endpoint simples no projeto existente                              | Usar versões, stack e padrões já disponíveis; testar resposta e entrada inválida     | Recriar a aplicação ou adicionar abstrações sem necessidade                     |
| Propriedade correta localmente e incorreta na implantação                   | Encontrar a fonte vencedora e demonstrar o binding com valores sanitizados           | Editar YAML sem verificar precedência ou imprimir secrets                       |
| Bean padrão versus bean customizado equivalente                             | Reavaliar condições e backoff quando o bean customizado é introduzido                | Presumir que a auto-configuração e suas propriedades continuam controlando tudo |
| API Servlet com JPA versus requisito de streaming totalmente não bloqueante | Preservar MVC no primeiro; investigar o stack reativo e encaminhar o segundo         | Declarar JPA não bloqueante ou recomendar WebFlux apenas por popularidade       |
| Mesmo erro lançado pelo controller versus por filtro de segurança           | Identificar e testar o ponto apropriado de tratamento em cada caso                   | Prometer cobertura universal de `@ControllerAdvice`                             |
| Mesma consulta paginada com relação to-one versus coleção to-many           | Reavaliar fetch, cardinalidade, count e paginação; medir o comportamento necessário  | Aplicar fetch join universal e aceitar páginas incorretas                       |
| Alteração parcial de registro existente                                     | Preservar campos não enviados, validação e versão concorrente                        | Construir entidade incompleta e sobrescrever estado sem intenção                |
| Teste JPA passa, mas estado externo diverge                                 | Observar banco com flush/clear ou transação independente conforme o contrato         | Tratar o objeto gerenciado como prova de commit                                 |
| Duas reservas concorrentes violam a mesma regra                             | Escolher mecanismo pela invariância; provar conflito/constraint com teste apropriado | Perder atualização ou repetir operação sem considerar efeitos                   |
| Teste HTTP com servidor real e transação no teste                           | Isolar e limpar os dados realmente gravados pelo servidor                            | Supor rollback automático de gravações de outra thread                          |
| Banco real indisponível e comportamento dependente do dialect               | Validar o que for possível e registrar a verificação pendente                        | Declarar integração validada com base apenas em H2 ou mocks                     |
| Consulta SQL existente, simples e adequada                                  | Preservar a solução e encaminhar a análise relevante                                 | Introduzir JPA para encaixar o problema na skill                                |
| Pedido exclusivo de JWT, Kafka ou otimização de índice                      | Reconhecer a fronteira e encaminhar o contexto ao especialista                       | Expandir a skill Spring para resolver outro domínio sem evidência               |
| Pedido apenas de revisão                                                    | Entregar achados priorizados e verificáveis                                          | Alterar aplicação, dependências ou schema sem escopo de implementação           |

Casos adicionais derivados das decisões solicitadas:

| Caso                                                                            | Comportamento esperado                                                            | Falha observável                                                                       |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Factories independentes versus chamada direta entre métodos `@Bean`             | Decidir `proxyBeanMethods` pela forma de composição; testar instância e lifecycle | Desativar proxy e produzir instâncias fora do container sem perceber                   |
| Projeto usa factories explícitas versus scan por estereótipos                   | Preservar o estilo adequado e usar construtor/parâmetros para dependências        | Duplicar registro, introduzir field injection ou reorganizar toda a aplicação          |
| Mesma API com espera de I/O versus CPU saturada                                 | Reavaliar virtual threads, admissão e paralelismo pelos recursos medidos          | Aumentar concorrência como solução universal ou ajustar pool Tomcat que não está ativo |
| Mesmo pool após idle versus tráfego estável, com uma ou várias réplicas         | Medir aquisição e orçamento global de conexões antes de fixar tamanho/idle        | Repetir 20 conexões e 250 ms como resposta sem contexto                                |
| Mesma coluna com `TINYINT` versus valores fora de sua faixa                     | Conciliar tipo Java, binding e schema; testar limites                             | Truncar, rejeitar valores válidos do domínio ou trocar anotação sem migration          |
| Mesmo texto em `VARCHAR` com code page legada versus `NVARCHAR`/collation UTF-8 | Preservar caracteres e verificar binds e conversões                               | Desligar Unicode globalmente para melhorar um plano sem teste de integridade           |
| Sequence compatível versus incremento divergente com `allocationSize=50`        | Identificar optimizer e DDL; testar reinício e escritores concorrentes            | Confundir sequence cache ou batch JDBC com reserva de IDs                              |
| Associação por ID versus validação de existência/permissão                      | Usar referência somente quando satisfizer o contrato                              | Tratar proxy como prova de existência ou autorização                                   |
| Pool garante autocommit desligado versus custom datasource que não garante      | Manter ou rejeitar a declaração ao Hibernate conforme o estado real               | Aceitar a flag e executar writes fora da transação esperada                            |
| Consulta/decisão/write atômicos com chamada HTTP lenta na orquestração          | Delimitar unidade transacional e separar trabalho remoto sem perder a invariância | Segurar lock durante espera remota ou quebrar atomicidade para encurtar cada método    |
| Índice filtrado disponível, mas scan com bind inadequado                        | Investigar sessão, tipos, predicado e plano; registrar o que muda a hipótese      | Declarar que `ARITHABORT ON` garante seek                                              |

Casos adicionais derivados da comparação externa, ainda não executados:

| Caso                                                                                                       | Comportamento esperado                                                                                                             | Falha observável                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mesmo campo com uma versus duas violações; duas criações simultâneas com a mesma chave única               | Representar erros sem falha no handler; validar a corrida no banco e mapear apenas o conflito conhecido                            | Resposta 500 por chave duplicada no mapa de erros ou duplicidade aceita após dois `exists` retornarem falso |
| Lista inclui pais sem filhos; solução candidata introduz fetch join                                        | Preservar os resultados exigidos e verificar SQL/cardinalidade com associação vazia e não vazia                                    | Reduzir consultas eliminando registros válidos ou quebrando paginação                                       |
| Auditoria em request autenticado, anônimo e job; relógio fixado                                            | Aplicar política explícita de ator e tempo e reler valores persistidos                                                             | Herdar identidade da tarefa anterior, falhar em cast do principal ou ignorar o relógio de teste             |
| Logs de duas tarefas com contextos diferentes, incluindo falha                                             | Emitir o formato contratado, propagar/limpar contexto e omitir secrets                                                             | Correlacionar a segunda tarefa com a primeira ou presumir JSON correto sem inspecionar a saída              |
| Estratégia única versus várias com chave repetida; evento local versus obrigação de sobreviver ao reinício | Manter composição simples quando suficiente; rejeitar ambiguidade e reavaliar mecanismo quando durabilidade for requisito          | Escolher implementação arbitrária ou tratar listener em memória como entrega durável                        |
| Fixture Boot 4 com slice HTTP, substituição de bean e endpoint protegido                                   | Compilar com APIs disponíveis e explicitar o que a identidade simulada cobre; reservar validação real de token ao teste apropriado | Publicar exemplo com `@MockBean` removido ou afirmar que `@WithMockUser` valida JWT                         |

Casos de documentação springdoc/OpenAPI a preparar antes de implementar W11:

| Caso                                                                                              | Comportamento esperado                                                                                         | Falha observável                                                                                                |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Controller com mappings herdados, duas representações e DTO com campos opcionais/aninhados        | Conciliar todas as operações e media types com o inventário; descrever e exemplificar cada propriedade pública | Declarar 100% após adicionar `@Operation` apenas aos métodos visíveis ou documentar somente campos obrigatórios |
| Mesmo campo obrigatório no create e omitível no PATCH; null tem efeito diferente de ausência      | Escolher schemas e exemplos por contrato e verificar presença/null/default no HTTP real                        | Reutilizar `required` de criação no PATCH ou documentar default que o servidor não aplica                       |
| DTO com ID de saída e segredo de entrada; nome JSON diferente do nome Java                        | Refletir serialização, `accessMode`, nomes e visibilidade por direção                                          | Prometer ocultação em runtime apenas por anotar `@Schema` ou vazar o segredo em exemplo/resposta                |
| Criação com 201/Location, conflito conhecido, erro de validação, falha de segurança e remoção 204 | Documentar respostas aplicáveis com headers e payloads reais e validar exemplos                                | Swagger mostrar apenas 200 genérico, body em 204 ou formato de erro diferente do filtro                         |
| Corpo polimórfico ou multipart com JSON e arquivo                                                 | Verificar variantes, discriminator, exemplos, media type/encoding e requisição montada pela UI                 | Schema válido sintaticamente, mas incompatível com Jackson ou com o binding das partes                          |
| Mesma operação com Bearer OU API key versus exigência de ambos; operação pública no mesmo grupo   | Mudar a composição de `security` conforme a exigência e preservar o override público                           | Trocar alternativa por combinação, impor autenticação fictícia ou achar que a anotação protege o endpoint       |
| Customização funciona no documento padrão, mas há grupo separado e proxy com `/api`               | Verificar documento de cada grupo, alcance do customizador, URLs e navegação/Try it out na fixture             | Resposta/header comum desaparecer no grupo ou UI enviar chamada para caminho/servidor incorreto                 |
| Documento abre na UI, mas perdeu um endpoint, alterou obrigatoriedade ou usa exemplos inválidos   | Detectar por inventário, validação de exemplos, testes HTTP e diff semântico                                   | Usar renderização ou parser sem erro como prova de fidelidade e de cobertura completa                           |

Os casos acima continuam planejados. Na implementação, avaliar separadamente a geração
springdoc, a conformidade OpenAPI, o comportamento HTTP e a experiência na Swagger UI.
Quando a fixture não usar um recurso especializado, registrar o cenário condicional que
o exercita ou a limitação correspondente, sem atribuir a ele resultado de execução.

Os pares de beans, fronteiras de erro e cardinalidade devem mostrar se o agente muda
a recomendação quando muda uma condição decisiva. Incluir posteriormente um caso novo
por skill que não seja cópia dos exemplos publicados.

Separar três níveis de evidência: validação do pacote, execução dos exemplos e avaliação
do comportamento do agente. Para afirmar ganho causado pela skill, comparar sessões
equivalentes com e sem ela, manter ferramentas e tarefas comparáveis e registrar limitações
de isolamento e variabilidade. Um walkthrough não equivale a execução.

## Entregas e sequência

| Etapa                  | Trabalho                                                                                                               | Critério para avançar                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Fechar o recorte    | Confirmar baseline, transformar os itens essenciais em critérios e selecionar casos                                    | Cada skill tem ativação, exclusões, decisões centrais e evidência esperada                                                      |
| 2. Criar `spring-boot` | Instruções, referências condicionais e fixture de configuração/beans                                                   | Exemplos executam no baseline fixado e demonstram precedência e condições                                                       |
| 3. Criar Web e JPA     | Desenvolver os dois pacotes com ownership separado, contratos comuns e documentação springdoc completa dos controllers | Casos HTTP, persistência, transação e geração OpenAPI passam; limitações ficam explícitas                                       |
| 4. Integrar e avaliar  | Exercitar o pequeno serviço, os cenários negativos, o documento gerado e seu consumo pela Swagger UI                   | Contratos centrais preservados, cobertura documental confrontada com inventário e resultados executados separados dos pendentes |
| 5. Empacotar           | Validar metadados, referências, handoffs, versões e registro                                                           | Validação estrita dos pacotes, `registry:build` e `npm run verify` concluídos                                                   |

Cada pacote deve conter `SKILL.md` e `skill.yaml`, com nome e descrição coerentes, em
inglês conforme o catálogo. Referências entram por finalidade e condição de leitura;
fixtures/scripts só entram quando sustentam uma verificação reproduzível. Registrar
pré-requisitos, efeitos e comandos. Reutilizar `docs/skill-validation/` para evidência
de desenvolvimento que não precisa ser instalada com a skill.

O encerramento de cada skill exige exemplos verificados, decisões centrais acionáveis,
cenários prioritários avaliados no nível disponível e nenhuma incerteza técnica conhecida
que invalide a recomendação principal. Falta de runtime ou banco deve aparecer como
limitação concreta. Publicação será uma etapa posterior à implementação e à validação.

## Expansão condicionada a demanda

- Spring WebFlux: modelo reativo, cancelamento, backpressure, contexto e persistência compatível.
- Clientes HTTP Spring: seleção de cliente, conexão, timeout, serialização e integração com políticas de retry.
- Auto-configurações e starters próprios: contratos de extensão, condições, metadados e testes para consumidores.
- Atualizações dentro de Spring Boot 4.x: inventário de incompatibilidades e sequência verificável entre linhas.
- Testes Spring como especialidade: extrair apenas se aparecerem problemas próprios de context cache,
  isolamento e infraestrutura que não caibam adequadamente nas três skills.

Spring Cloud, Batch, Kafka, AI, GraphQL, Modulith e demais produtos do ecossistema ficam
fora desta primeira entrega. A inclusão futura depende de uso real e de uma fronteira
que acrescente decisões ao catálogo.
