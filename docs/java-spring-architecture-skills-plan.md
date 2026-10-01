# Cronograma de skills Java/Spring: MVC, hexagonal e arquitetura limpa

Data: 30/09/2026. Status: **implementado**, após a autorização de execução.
Foram criadas as duas especialistas e complementada a skill MVC existente. Os resultados
e limites estão no [relatório de validação](skill-validation/java-spring-architecture-2026-09-30.md).
Este documento preserva o cronograma e os critérios que orientaram o lote.

O plano organiza **três trilhas especialistas**, reaproveitando a cobertura MVC existente
e definindo **duas novas skills**: `spring-boot-hexagonal-architecture` e
`spring-boot-clean-architecture`. O horizonte inicial estimado era de **cinco semanas relativas ao
início da execução**, com até duas frentes de autoria e um coordenador de integração.
Essa estimativa não exigia espera entre etapas; a implementação autorizada ocorreu como
um lote. Os critérios de aceite, e não o transcurso das semanas, determinaram o avanço.

## Objetivo e distinções arquiteturais

Preparar especialistas capazes de projetar, implementar, revisar e evoluir funcionalidades
Java/Spring a partir dos contratos do projeto. Cada skill deve ensinar decisões,
consequências e formas de verificar o resultado. A entrega acompanha o pedido: achados
para uma revisão, alternativas para uma decisão e mudanças integradas para implementação.

A orientação conceitual usa Martin Fowler, Alistair Cockburn e Robert C. Martin como
fontes, sem transformar preferências de estilo em regras universais:

- **MVC** separa responsabilidades de interação e apresentação. `Controller`, `Service`
  e `Repository` não são os três elementos de MVC; essa sequência descreve outra divisão
  de responsabilidades. A skill deve distinguir domínio, modelo de apresentação e o
  `Model` do framework. [Fowler — Model View Controller](https://martinfowler.com/eaaCatalog/modelViewController.html).
- **Hexagonal** organiza a separação entre aplicação e mecanismos externos por portas
  e adaptadores. A aplicação pode ser acionada e testada sem sua interface ou banco reais;
  o desenho não exige seis portas nem define sozinho o modelo interno de negócio.
  [Cockburn — artigo original](https://alistair.cockburn.us/hexagonal-architecture).
- **Arquitetura limpa** distingue políticas de negócio, casos de uso e mecanismos externos,
  com dependências de código apontando para dentro. Fluxo de execução e dependência de
  compilação precisam ser analisados separadamente; os círculos não impõem uma quantidade
  fixa de módulos. MVC pode compor a região de apresentação/adaptadores de uma aplicação
  limpa. [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).

Essas distinções orientam a proposta: estudar composição e limites, evitando apresentar
MVC, hexagonal e limpa como três opções mutuamente exclusivas ou uma escala de maturidade.
Manter uma aplicação simples e adequada é um resultado válido. DDD, microsserviços,
CQRS, event sourcing e um projeto multimódulo exigem justificativas próprias.

## Oito pilares obrigatórios por skill

A referência é a [revisão dos oito pilares das skills Spring](skill-validation/spring-eight-pillars-2026-09-29.md),
complementada por [skill-engineering](../skills/skill-engineering/SKILL.md) e pelo
[prompt completo de revisão](skill-review-prompt.md). Aplicar os pilares ao problema de
cada especialista; não copiar oito seções genéricas para todos os arquivos.

| Pilar                   | Aplicação na trilha                                                                                                               | Evidência de aceite por skill criada ou alterada                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Escopo preciso          | Explicar ativação, exclusões, resultado e proprietário de decisões vizinhas.                                                      | Um caso pertinente e um caso de fronteira recebem tratamento distinto; o nome e a descrição representam essa promessa. |
| Discovery               | Inspecionar casos de uso, invariantes, atores, consumidores, código, ADRs, versões, dependências, transações e testes relevantes. | Separar requisito, convenção observada e lacuna; perguntar apenas pelo dado indisponível que muda a decisão.           |
| Profundidade técnica    | Explicar direção de dependências, contratos, semântica das portas, composição Spring e falhas nos limites afetados.               | Cada recomendação relevante tem mecanismo, condições, falha possível e fonte aplicável.                                |
| Critérios de decisão    | Comparar manter o desenho atual, ajustar uma fronteira e introduzir isolamento adicional.                                         | Um par de casos altera uma restrição decisiva e verifica se a escolha muda adequadamente.                              |
| Qualidade da solução    | Preservar invariantes, autorização, contratos públicos, coesão, tipos e ciclo de vida; justificar interfaces e mapeamentos.       | A mudança resolve o problema sem classes redundantes, perda de contrato ou regra de negócio restrita ao HTTP.          |
| Execução                | Entregar o trabalho solicitado dentro da fronteira, integrando seus consumidores e configuração quando houver implementação.      | Uma implementação percorre o caso de uso real; um diagnóstico não se apresenta como correção executada.                |
| Validação               | Separar estrutura do pacote, exemplos Java e decisões do agente.                                                                  | Registrar casos, comandos, resultados e cobertura; uma regra arquitetural detecta uma violação conhecida.              |
| Limites de conhecimento | Distinguir fato, inferência, hipótese, baseline autoral e ambiente atendido.                                                      | Declarar fontes ou execução ausentes; não converter um teste local em garantia de produção ou ganho de desempenho.     |

Para cada pacote efetivamente criado ou alterado, manter uma matriz em
`docs/skill-validation/` com: **pilar → arquivo/seção → comportamento esperado →
evidência executada ou pendência**. Essa matriz é evidência de autoria e revisão;
não precisa ser carregada pelo agente durante uma tarefa comum.

## Reaproveitamento e propriedade das decisões

O inventário considera os pacotes presentes em `skills/`, não apenas skills instaladas
na máquina. O [plano Spring](spring-skills-plan.md) registra o histórico; em caso de
divergência, usar o conteúdo atual das skills e suas revisões posteriores. Por exemplo,
a revisão de 29/09 removeu a exigência indiscriminada de springdoc/Swagger UI.

| Decisão                           | Especialistas existentes                                                                                                                      | Uso neste cronograma                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Orientação e escolha arquitetural | `enterprise-application-architecture`, `layering-and-boundaries`, `architecture-trade-off-analysis`, `architecture-decision-making`           | Identificar forças, comparar alternativas e registrar decisões; não criar outro roteador geral.                        |
| MVC e representação               | `mvc-and-request-handling`, `view-and-representation-patterns`, `remote-facade-and-dto`, `spring-boot-web`                                    | Reutilizar responsabilidades de apresentação e implementação HTTP; complementar somente lacunas verificadas.           |
| Domínio e aplicação               | `domain-logic-organization`, `service-layer-design`, `java-dependency-inversion`, `java-solid`                                                | Decidir invariantes e orquestração; aplicar princípios a contratos concretos, sem impor Domain Model a toda aplicação. |
| Dependências e composição         | `framework-coupling-and-independence`, `component-and-release-boundaries`, `spring-boot`                                                      | Avaliar custo do isolamento, organização dos módulos e registro de beans.                                              |
| Persistência e efeitos            | `repository-pattern`, `spring-boot-jpa`, `enterprise-transactions`, `spring-transactions-and-events`, `spring-http-clients`                   | Implementar mecanismos e verificar atomicidade, mapeamento e semântica das integrações.                                |
| Segurança e operação              | `spring-security-for-apis`, `spring-boot-observability`                                                                                       | Preservar acesso por ator/recurso e sinais operacionais nos caminhos afetados.                                         |
| Testes e evolução                 | `architecture-testing`, `architecture-fitness-functions`, `spring-boot-testing`, `architecture-refactoring-paths`, `java-legacy-code-testing` | Provar dependências e comportamento; migrar por fatias e preservar contratos.                                          |

Encaminhamento não implica dependência obrigatória no manifesto. Selecionar apenas os
especialistas pertinentes à tarefa e transferir as evidências já obtidas. As skills
existentes não entram automaticamente em revisão integral. Qualquer complemento previsto
na execução terá arquivo, problema e responsável definidos antes da escrita.

`java-ddd-service-foundation` está disponível na instalação local, mas não consta de
`skills/` neste repositório. Não usá-la como dependência publicada deste plano.

## Trilha 1 — MVC com Java e Spring Boot

**Estratégia:** reaproveitar `mvc-and-request-handling` e `spring-boot-web`, compondo
`service-layer-design` e `layering-and-boundaries`. A cobertura atual já inclui
responsabilidades, cadeia HTTP, contratos, validação, erros e testes. Uma terceira skill
MVC só se justifica se a primeira semana demonstrar uma decisão e avaliação próprias
que não caibam nesses proprietários; essa expansão exige replanejar o escopo e a duração.

**Ativação:** uma funcionalidade possui responsabilidade mal localizada, regras presas ao
controller, representação acoplada à persistência ou dúvida sobre o limite web/aplicação.
Um ajuste isolado de binding ou status HTTP segue diretamente para `spring-boot-web`.

**Profundidade e entregáveis previstos:**

- Traçar uma operação entre controller, aplicação, regra de negócio e persistência,
  identificando contratos e direção das dependências; considerar organização por
  funcionalidade quando ela apoiar o isolamento, sem impor nomes de pacotes.
- Separar validação de entrada, invariante de negócio, autorização e representação;
  manter a regra necessária também para job, importação ou outro chamador.
- Preservar uma leitura simples quando o contrato já estiver atendido; não criar um
  serviço que só encaminha chamadas para satisfazer um diagrama.
- Distinguir resposta serializada de renderização por view; selecionar documentação
  pela autoridade do contrato e consumidores, reaproveitando OpenAPI ou REST Docs.

**Aceite específico:** demonstrar uma operação de escrita com invariante fora do controller
e um caso de contraste de leitura simples. Os testes verificam o contrato HTTP e a regra
fora do transporte. A resposta não expõe campos internos ou provoca acesso persistente
inesperado. Uma revisão pode concluir que a cobertura existente é suficiente, sem edição.

## Trilha 2 — `spring-boot-hexagonal-architecture`

**Pacote implementado. Ativação:** implementar ou reparar uma fronteira hexagonal escolhida,
permitindo à aplicação operar por diferentes entradas ou isolar uma integração externa.
A escolha inicial do estilo permanece com `layering-and-boundaries`.

**Decisões e entregáveis previstos:**

- Definir portas pela conversa necessária à aplicação: operações, tipos, ausência,
  conflitos, falhas, autorização exigida e efeitos. Diferenciar adaptador que aciona a
  aplicação de adaptador acionado por ela; não criar uma porta por classe.
- Entregar um mapa de dependências e uma fatia funcional com entrada HTTP e uma entrada
  não HTTP controlada, como um teste de aplicação ou job existente; evitar adicionar broker
  ou scheduler apenas para demonstrar variedade.
- Manter protocolos externos nos adaptadores; decidir mapeamentos por semântica e contrato.
  Quando o projeto exigir núcleo independente, evitar expor `ResponseEntity`, tipos JPA
  ou classes de cliente externo nas portas internas.
- Compor implementações na configuração externa ao núcleo, explicitando beans e o ponto
  transacional efetivo. Reutilizar a configuração adequada já existente.
- Separar um fake útil para teste da prova de funcionamento do adaptador real. Uma porta
  estável não torna bancos diferentes semanticamente equivalentes.

**Fora do núcleo:** tutorial completo de Spring MVC, tuning JPA, resiliência distribuída,
escolha de agregados e exigência de DDD. Encaminhar esses mecanismos aos proprietários.

**Aceite específico:** o mesmo caso de uso mantém invariantes e autorização em duas
entradas; seus testes de aplicação rodam sem servidor web ou banco real. O adaptador real
tem verificação própria de contrato e falhas. Uma dependência proibida é detectada por
um check que seleciona classes de produção e falha diante de uma violação conhecida.

## Trilha 3 — `spring-boot-clean-architecture`

**Pacote implementado. Ativação:** implementar ou corrigir a separação entre políticas de
domínio, casos de uso e mecanismos externos sob uma decisão de arquitetura limpa.
A especialização é a alocação dessas políticas e a travessia de suas fronteiras;
a skill hexagonal aprofunda as conversas entre aplicação e adaptadores.

**Decisões e entregáveis previstos:**

- Diferenciar regras de domínio de orquestração de aplicação usando um caso de uso real;
  identificar quem possui entradas, resultados, falhas e interfaces de saída.
- Produzir dois mapas: dependências de código e sequência de execução. Demonstrar como
  uma implementação externa pode ser chamada sem inverter a dependência do núcleo.
- Escolher retorno simples ou porta de apresentação conforme o contrato. Não impor
  presenter, interface de entrada e múltiplos DTOs a toda operação; quando houver
  presenter, preservar a propriedade interna do contrato e a representação externa.
- Manter detalhes HTTP, serialização e persistência fora do núcleo que se declara
  independente. Avaliar explicitamente o custo de modelos separados; um compromisso
  de acoplamento aceito deve ser documentado, sem alegar independência estrita.
- Localizar wiring e mecanismos transacionais sem perder a atomicidade do caso de uso;
  uma reorganização de classes não pode mudar silenciosamente os efeitos observáveis.

**Fora do núcleo:** catálogo geral de SOLID, geração obrigatória de quatro módulos,
reescrita integral da aplicação e duplicação de todos os mecanismos Spring.

**Aceite específico:** regras e casos de uso são exercitados sem infraestrutura externa;
uma mudança de representação fica no adaptador previsto e preserva o contrato interno.
Os checks detectam vazamento de tipos externos e dependências invertidas. O teste de
integração verifica que a composição real preserva transação, autorização e resultado.

## Cronograma e dependências

Cada semana inclui pesquisa, autoria, revisão local e validação das mudanças nela feitas.
Testes, segurança e os oito pilares começam na primeira entrega; as semanas finais
aprofundam a composição e a avaliação independente.

| Semana relativa            | Entrega                                                                                                                                     | Dependências e responsáveis                                                                                                                                 | Critério para avançar                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Recorte e MVC          | Confirmar lacunas, contratos de ativação, baseline e cenários; consolidar a trilha MVC com complementos localizados somente se necessários. | Coordenador fixa propriedade dos arquivos; uma frente mapeia MVC e outra prepara contratos/casos das novas especialistas.                                   | Matriz de reaproveitamento aceita, limites sem duplicação, oito pilares rastreáveis no escopo MVC e decisões justificadas para leitura simples e escrita com invariantes. Reestimar o prazo com esforço observado. |
| 2 — Hexagonal              | Criar `spring-boot-hexagonal-architecture`, recursos condicionais e primeira fatia verificável.                                             | Autor exclusivo do pacote; contratos da semana 1. Segunda frente prepara os casos de políticas/apresentação da trilha limpa sem editar o pacote hexagonal.  | Portas têm semântica explícita, duas entradas preservam regras, núcleo testável e adaptador real verificado separadamente; validação local registrada.                                                             |
| 3 — Limpa                  | Criar `spring-boot-clean-architecture`, recursos e exemplo que exponha a diferença entre execução e dependência.                            | Autor exclusivo do pacote; reutilizar requisitos do cenário, com propriedade separada dos arquivos. Coordenador confere a distinção em relação à hexagonal. | Políticas têm responsáveis, núcleo e contratos respeitam a direção definida, presenter/mapeamentos têm justificativa e wiring real funciona.                                                                       |
| 4 — Integração e evolução  | Exercitar MVC dentro das duas arquiteturas e migração incremental de uma fatia existente; corrigir defeitos demonstrados.                   | Depende das três trilhas; responsáveis mantêm propriedade por pacote e o coordenador sequencia alterações compartilhadas.                                   | Contratos públicos preservados; rollback local, autorização por entrada, serialização e violações estruturais exercitados; caminho de reversão da mudança documentado quando pertinente.                           |
| 5 — Avaliação e fechamento | Revisão independente por pacote, casos comportamentais, matriz final dos pilares e integração do catálogo.                                  | Revisores recebem escopo exclusivo; coordenador integra depois que todos encerram as escritas.                                                              | Checks exigidos aprovados; resultados de estrutura, código e comportamento separados; limitações remanescentes explícitas, sem alegações de melhoria não medida.                                                   |

Ao final de **cada lote que alterar skills**, o coordenador regenera o índice e executa
`npm run verify`, depois de encerradas as escritas. A semana 5 não adia esses controles.
Se um critério falhar, corrigir a causa e replanejar; não reduzir cobertura relevante para
cumprir uma semana. Autoria pode ocorrer em paralelo após fechar contratos de fronteira;
a integração do índice é sempre sequencial.

## Casos de avaliação planejados

Os casos abaixo definem a matriz de planejamento; não equivalem, por si, a execução.
O relatório vinculado no início registra os casos efetivamente exercitados e seus limites.
Antes das avaliações, fixar entradas, contexto, comportamento esperado, saída e falhas.
Selecionar por risco de decisão, sem exigir uma quantidade artificial de casos por skill.

| Caso e alvo                 | Entrada ou contraste                                                                                               | Resultado esperado e falha a detectar                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVC — responsabilidade      | Controller decide desconto; contrastar com um `if` de negociação HTTP.                                             | Mover a regra compartilhada para seu proprietário; manter decisão de protocolo na borda. Falha: tratar qualquer condicional como defeito.                         |
| MVC — proporcionalidade     | Consulta simples já protegida versus operação que coordena duas gravações.                                         | Preservar o caminho adequado e introduzir orquestração apenas onde necessária. Falha: impor a mesma pilha de classes às duas operações.                           |
| Hexagonal — entradas        | Operação recebe uma entrada HTTP autenticada e outra entrada interna com contexto de acesso explícito.             | Preservar invariante e autorização nos dois caminhos. Falha: permitir bypass porque a segunda entrada não usa o controller.                                       |
| Hexagonal — portas          | Adapter real distingue ausência, conflito e indisponibilidade; fake trata tudo como sucesso.                       | Contrato e testes expõem a divergência. Falha: declarar substituibilidade apenas porque as classes implementam a mesma interface.                                 |
| Limpa — fronteiras          | Caso de uso retorna `ResponseEntity` e usa repositório Spring Data sob requisito de núcleo independente.           | Explicitar dependências e corrigi-las no limite apropriado. Falha: apenas renomear pacotes e declarar independência.                                              |
| Limpa — apresentação        | Resultado simples para um consumidor versus apresentação com formatos/regras próprios para consumidores distintos. | Justificar retorno direto ou presenter segundo a necessidade. Falha: impor ou rejeitar presenters sem examinar o contrato.                                        |
| Integração — transação      | Duas gravações, segunda falha; chamada real após reorganizar o wiring.                                             | Verificar estado durável pela entrada efetiva, sem transação externa do teste mascarando a aplicação. Falha: inferir rollback apenas pela anotação.               |
| Estrutura — sensibilidade   | Inserir dependência proibida em classe de produção de uma fixture isolada.                                         | O check arquitetural falha pela regra esperada; seleção vazia também é identificada. Falha: teste verde que não analisou as classes relevantes.                   |
| Fronteira — tarefa local    | Pedido de corrigir um binding, timeout ou consulta, sem problema de arquitetura.                                   | Encaminhar ao especialista pertinente e preservar o escopo. Falha: iniciar reestruturação geral.                                                                  |
| Evidência e compatibilidade | Projeto sem ADR ou com Java/Boot diferente do baseline autoral.                                                    | Inspecionar o que existe, limitar afirmações e esclarecer só o que muda a decisão. Falha: inventar requisito, aplicar API incompatível ou migrar sem autorização. |

Usar requisitos de um pequeno caso de pedidos, por exemplo criar e consultar um pedido,
com invariantes explicitamente fornecidas pela fixture. O mesmo contrato permite comparar
as escolhas entre trilhas; não obriga construir três aplicações completas ou introduzir
infraestrutura que o caso não pede. Casos de isolamento por tenant, concorrência ou falha
remota entram quando a skill ou exemplo fizer a correspondente afirmação.

## Compatibilidade, recursos e entrega dos pacotes

Adotar **Java 25 e Spring Boot 4.x como baseline de autoria**, alinhado às skills Spring
atuais. A documentação consultada em 30/09/2026 apresenta Boot 4.1.1; ela distingue seus
requisitos mínimos do baseline escolhido pelo catálogo. Fixar patches, ferramentas e
dependências efetivos ao criar cada exemplo, sem prometer compatibilidade com toda a
linha 4.x. [Requisitos oficiais do Spring Boot](https://docs.spring.io/spring-boot/system-requirements.html).

Inspecionar Maven/Gradle, toolchain, release de compilação, dependências resolvidas e CI
do projeto atendido. Reutilizar seu build e não migrar Java, Boot ou banco como efeito
implícito de aplicar uma skill. Exemplos novos compilam e rodam no Java 25; anotar diferenças
do ambiente atendido antes de recomendações sensíveis à versão. WebFlux, Boot 3 e migração
de major ficam fora do núcleo das novas especialistas.

Nos exemplos novos, seguir a convenção Spring do catálogo: injeção por construtor único
ou parâmetros de métodos `@Bean`, sem `@Autowired` desnecessário. Distinguir essa convenção
de uma restrição da API; verificar também como o bean e seus interceptadores são ativados.

Cada novo pacote deve conter:

- `SKILL.md` em inglês, com ativação, workflow proporcional, decisões, falhas, resultado,
  limites de conhecimento e rotas explícitas para recursos condicionais.
- `skill.yaml` conforme o schema do repositório: nome igual ao diretório, descrição
  idêntica à do frontmatter após normalizar espaços, versão inicial conforme a convenção (`1.0.0`), metadados,
  arquivos realmente distribuídos e sugestões pertinentes. `dependencies` somente se
  houver necessidade real; apresentação específica do agente fica em `agentOverrides`.
- Referências apenas quando trouxerem profundidade condicional. Para hexagonal, prever
  contratos de portas, composição Spring e verificação; para limpa, políticas/fronteiras,
  apresentação e verificação. Os nomes e a quantidade de arquivos são decisões de autoria.
- Assets executáveis somente quando necessários para demonstrar um contrato. Declarar
  pré-requisitos, comandos, versões, isolamento e o que o exemplo comprova. Scripts só
  quando automatizarem uma operação recorrente com benefício demonstrado.

Não criar diretórios vazios, templates genéricos ou um starter completo por obrigação.
Material exclusivo de avaliação fica em `docs/skill-validation/`, separado dos recursos
normais da skill. Exemplos didáticos podem ser distribuídos, mas não contam como casos
inéditos em uma avaliação.

Ao escrever os encaminhamentos nas skills, observar a regra do indexador para tabelas
de roteamento e dependências declaradas. Preferir prosa condicional com `suggests` para
colaboração opcional; não transformar toda a matriz de reaproveitamento deste plano em
dependências obrigatórias dos dois pacotes.

## Processo de validação e aceite final

1. **Autoria e revisão técnica:** conferir os oito pilares, fronteiras e fontes. Para
   revisão paralela de múltiplos pacotes, usar um `skill-reviewer` por skill, com propriedade
   exclusiva e leitura integral do [procedimento](parallel-skill-reviews.md) e do
   [prompt de revisão](skill-review-prompt.md). Encaminhar problemas vizinhos ao coordenador.
2. **Estrutura:** executar `npm run agent-skills -- validate skills/<nome> --strict`,
   conferir recursos e links, descrições, metadados e projeções dos adapters pertinentes.
   Formatar apenas arquivos alterados. Pacotes existentes alterados recebem incremento de
   versão segundo a política de versões imutáveis.
3. **Exemplos:** compilar e executar os exemplos alterados que sustentam recomendações.
   Separar teste de domínio, teste de contrato de porta, wiring Spring, adaptador real e
   teste de dependências. Persistência e transações exigem ambiente compatível com a
   afirmação; fake e banco alternativo não provam semântica do banco alvo.
4. **Comportamento:** executar casos prioritários em sessões novas com expectativas
   fixadas antes da execução. Registrar input, recursos, ambiente, output e limitações.
   Não fornecer gabaritos ao ator. Para alegar melhoria causada pela skill, comparar
   condições equivalentes com/sem skill ou antes/depois; sem comparação, relatar somente
   as decisões observadas. Invocação explícita não prova seleção automática.
5. **Integração:** depois de todos encerrarem as escritas, o coordenador executa
   `npm run registry:build` e `npm run verify`, sequencialmente, e inspeciona o diff.
   Preservar alterações preexistentes e distinguir falhas externas ao lote. Não editar
   `registry/skills.yaml` manualmente nem enfraquecer checks para obter aprovação.
6. **Aceite:** registrar por skill arquivos, versão, oito pilares, comandos/resultados,
   casos executados e pendências. Se faltar execução necessária à afirmação, delimitar
   a afirmação e manter a pendência; não classificar o lote como integralmente validado.

Verificações manuais e fixtures usam ambiente isolado; nenhuma etapa exige instalação
global, alteração da configuração real de agentes, commit ou publicação. Um teste verde
de empacotamento não prova que o Java funciona; um teste Java verde não prova que o agente
seleciona e aplica corretamente a skill.

## Fontes técnicas para a autoria

As fontes conceituais estão vinculadas às distinções iniciais. Fontes complementares
consultadas em 30/09/2026, cuja versão deve ser reconferida para cada exemplo:

| Decisão a fundamentar          | Fonte primária e uso                                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funcionamento de Spring MVC    | [Spring Web MVC](https://docs.spring.io/spring-framework/reference/web/webmvc.html): localizar o comportamento no framework Servlet e compor o especialista HTTP existente.                                                                    |
| Composição externa ao núcleo   | [Composing Java-based Configurations](https://docs.spring.io/spring-framework/reference/core/beans/java/composing-configuration-classes.html): fundamentar registro e composição de configurações/beans.                                       |
| Fronteira transacional efetiva | [Using `@Transactional`](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html): conferir configuração e interceptação; no modo proxy padrão, autochamada não recebe a interceptação externa. |
| Verificação de dependências    | [ArchUnit User Guide](https://www.archunit.org/userguide/html/000_Index.html): selecionar classes e formular regras executáveis; complementar com testes de comportamento para contratos em runtime.                                           |

Este documento preserva o escopo, a sequência e o aceite planejados. Consultas ao catálogo
e às fontes sustentam o planejamento; a evidência de implementação, testes Java e decisões
dos agentes está no relatório vinculado no início. Não foi alegada melhoria comportamental
comparativa medida.
