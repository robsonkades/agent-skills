# Família de skills DDD com Java

Oito skills complementam a cobertura de arquitetura e Java do catálogo. A família usa
DDD para descobrir e implementar regras de negócio, preservando a organização escolhida
para o projeto: domínio, aplicação e infraestrutura com dependências para dentro.
As instruções distribuídas permanecem em inglês, como as demais skills do repositório.

| Skill                                                                   | Responsabilidade                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [java-ddd](../skills/java-ddd/SKILL.md)                                 | Descoberta, escolha proporcional dos padrões e implementação de uma fatia completa |
| [java-ddd-aggregates](../skills/java-ddd-aggregates/SKILL.md)           | Entidades, identidade, agregados, invariantes, reconstrução e concorrência         |
| [java-ddd-value-objects](../skills/java-ddd-value-objects/SKILL.md)     | Igualdade por valor, imutabilidade, normalização, dinheiro e representações        |
| [java-ddd-use-cases](../skills/java-ddd-use-cases/SKILL.md)             | Contratos, comandos/resultados, orquestração, autorização e transação              |
| [java-ddd-domain-services](../skills/java-ddd-domain-services/SKILL.md) | Políticas, serviços de domínio, factories e especificações                         |
| [java-ddd-repositories](../skills/java-ddd-repositories/SKILL.md)       | Persistência de agregados por gateways, mapeamento, conflitos e reconstrução       |
| [java-ddd-domain-events](../skills/java-ddd-domain-events/SKILL.md)     | Fatos de domínio, buffer de eventos e contratos de integração                      |
| [java-ddd-testing](../skills/java-ddd-testing/SKILL.md)                 | Testes que distinguem falhas de invariantes, efeitos, persistência e isolamento    |

A estratégia de bounded contexts continua em
[bounded-context-design](../skills/bounded-context-design/SKILL.md). As fronteiras e a
composição Spring continuam nas especialistas de
[arquitetura limpa](../skills/spring-boot-clean-architecture/SKILL.md) e
[hexagonal](../skills/spring-boot-hexagonal-architecture/SKILL.md).
As sugestões entre pacotes são opcionais: a família não instala automaticamente
outras dezenas de skills nem depende de skills presentes apenas nesta máquina.

## Referência de organização

O caminho confirmado pelo usuário foi
`C:\Users\robso\Downloads\ddd-example-master\ddd-example-master`. O caminho informado
inicialmente, `C:\git\ddd`, contém outro projeto, de experimentação SOAP/XML/WebFlux.
Nenhum dos dois projetos foi modificado. O caminho local é evidência de autoria,
não pré-requisito para aplicar ou distribuir uma skill.

Na referência correta, o namespace é `com.robsonkades.admin.catalogo`; os módulos Gradle
são `domain`, `application` e `infrastructure`. O pacote `category` identifica uma família
de objetos/casos de uso dentro do exemplo, não prova sozinho um bounded context.

```text
domain.category
  Category, CategoryID, CategoryGateway, CategoryValidator
application.category.create
  CreateCategoryUseCase, DefaultCreateCategoryUseCase
  CreateCategoryCommand, CreateCategoryOutput
infrastructure.api / infrastructure.api.controllers
  CategoryAPI, CategoryController
infrastructure.category
  CategoryMySQLGateway
  persistence.CategoryJpaEntity, persistence.CategoryRepository
  models.CreateCategoryRequest, models.CategoryResponse
  presenters.CategoryApiPresenter
infrastructure.configuration.usecases
  CategoryUseCaseConfig
```

As convenções das skills instaladas `java-ddd-service-foundation` e `invoice-*` também
foram examinadas. Elas usam algumas variantes, como `CommandOutput`, `GatewayImpl` e
`gateway.persistence`. O código de destino decide qual variante preservar. O exemplo
usa contratos abstratos simples para categoria e sealed/non-sealed em outra família;
não cabe normalizar todas as classes a partir de um único trecho.

Java 17 está declarado para o `buildSrc` da referência; os subprojetos não fixam
explicitamente toolchain/release. Spring Boot 2.7.7 e Gradle 7.6 são versões históricas
observadas. Exemplos novos da família usam Java 17 como baseline de fonte, sem autorizar
upgrade do projeto atendido. As fixtures Spring existentes conservam seu baseline
autoral Java 25/Boot 4.x.

## Decisões de conteúdo

Os oito pilares já empregados no catálogo são aplicados a cada especialista: escopo
preciso, discovery, profundidade técnica, critérios de decisão, qualidade da solução,
execução, validação e limites de conhecimento. A rastreabilidade e a evidência executada
ficam no [relatório de validação](skill-validation/java-ddd-2026-09-30.md).

As fontes primárias consultadas incluem Evans, Fowler, Vernon, Millett, Tune e Khononov;
o [guia de decisões](../skills/java-ddd/references/modeling-decisions.md) liga cada fonte
ao tipo de decisão que fundamenta. A família não atribui aos autores aprovação deste
catálogo nem depende de conteúdo de livros não consultado.

O exemplo orienta nomes e responsabilidades, mas suas limitações não viram regras:

- `ValueObject` vazio e `record` não garantem igualdade correta ou imutabilidade profunda.
- Validação após mutação exige caracterização; não comprova que rejeições preservam estado.
- Publicar no Rabbit dentro do método transacional JPA não torna os dois commits atômicos.
- Ausência de `@Version` e teste com H2 não demonstram segurança contra atualizações concorrentes.
- Testes existentes com Mockito são fatos da referência; usar fake em memória é uma
  escolha de contrato, com seus próprios riscos de aliasing e de semântica divergente.

O alinhamento Spring acrescenta mapas da referência às duas skills de arquitetura,
preserva suas fixtures independentes e qualifica o uso de `@Service` na skill Spring
Boot: use cases independentes continuam plain Java, registrados por configuração externa.
