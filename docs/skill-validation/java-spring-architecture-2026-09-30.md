# Skills Java/Spring de arquitetura — implementação e validação

Data: 30/09/2026. **Duas novas skills e um complemento MVC implementados e validados.**
O índice passou de 295 para 297 skills. Os exemplos Java somam 24 testes aprovados;
`npm run verify` aprovou os 355 testes do repositório, sem falhas ou skips.

O [cronograma](../java-spring-architecture-skills-plan.md) definiu duas novas especialistas
e o reaproveitamento da trilha MVC. O pedido posterior autorizou a implementação como um
lote; as semanas eram uma estimativa de organização, não uma exigência de espera entre
etapas. O conteúdo distribuído pelas skills permanece em inglês.

## Escopo e atribuição

| Pacote                               | Responsabilidade do lote                                                                      | Responsável                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `spring-boot-hexagonal-architecture` | Nova especialista de portas, adaptadores e contratos da aplicação em Spring Boot.             | Autor exclusivo do pacote; fixture delegada em subdiretório exclusivo. |
| `spring-boot-clean-architecture`     | Nova especialista de políticas, casos de uso e direção de dependências em Spring Boot.        | Autor exclusivo do pacote.                                             |
| `mvc-and-request-handling`           | Complementos localizados de descoberta, composição arquitetural e conclusão da implementação. | Um `skill-reviewer`, seguindo o procedimento completo.                 |

`spring-boot-web` e os demais especialistas existentes são reutilizados. Nenhuma terceira
skill MVC ou roteador geral foi criado. Há ownership por pacote; o coordenador responde
por este relatório, avaliação comportamental, atualização do plano e índice gerado.

O estado recebido já incluía as oito skills de microserviços, seus documentos, alterações
em `registry/skills.yaml`, o cronograma desta trilha e o plano de otimização do harness.
Um snapshot SHA-256 de 1.583 arquivos e uma cópia do índice inicial foram guardados no
diretório temporário da sessão, antes das edições dos pacotes. Atribuir mudanças desta
entrega contra esse estado, não somente contra HEAD.

A conferência final também observou alterações, durante o trabalho, nos dois registros
`microservices-architecture-2026-09-30.md` e `microservices-architecture-2026-09-30-evaluation.json`.
Eles estão fora da propriedade deste lote e não foram editados por seus agentes. Essas
alterações concorrentes foram preservadas e registradas separadamente; os pacotes de
microserviços e suas entradas no índice permaneceram iguais ao snapshot inicial.

## Evidência e critérios

Os [casos e critérios comportamentais](java-spring-architecture-2026-09-30-evaluation.json)
foram registrados antes de executar os atores. O registro distingue a estrutura dos
pacotes, testes Java e decisões dos agentes. Atores recebem a skill explicitamente;
seleção automática não é avaliada. Sem baseline comparativo não há alegação de melhoria
causada pela skill.

As execuções dos atores produzem propostas de revisão/desenho, não mudanças em uma
aplicação. A separação de leitura é procedural em filesystem compartilhado, sem isolamento
imposto. Casos no mesmo contexto podem influenciar-se; categorias já constam do plano,
portanto não são apresentadas como benchmark cego.

## Conteúdo entregue e versões

| Skill                                                                 | Versão recebida → final | Resultado                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Hexagonal](../../skills/spring-boot-hexagonal-architecture/SKILL.md) | Nova → 1.0.0            | Portas com semântica de ausência, conflito, falha e conclusão; duas entradas, adaptadores, composição Spring e migração incremental.  |
| [Limpa](../../skills/spring-boot-clean-architecture/SKILL.md)         | Nova → 1.0.0            | Políticas de domínio e aplicação, dependências para dentro, resultado simples versus presenter, composição e preservação dos efeitos. |
| [MVC](../../skills/mvc-and-request-handling/SKILL.md)                 | 1.3.4 → 1.3.5           | Relação entre MVC e arquitetura da aplicação, descoberta de evidências e conclusão de uma mudança de responsabilidade.                |

Cada nova skill possui `SKILL.md`, manifesto, referências condicionais e fixture Java
executável. Os manifestos enumeram somente fontes/README/POM da fixture; outputs Maven
não são distribuídos. MVC preserva os exemplos e suas duas referências, com alterações
somente no `SKILL.md` e manifesto. A cobertura HTTP detalhada continua em `spring-boot-web`;
o encaminhamento novo explicita seu limite Boot 4.x.

As novas especialistas usam Java 25/Spring Boot 4.x como baseline de autoria, com fixtures
fixadas em Boot 4.1.1. A skill MVC existente conserva seu escopo genérico e os limites
dos exemplos Servlet/Framework 6+. Nenhuma aplicação alvo foi migrada para o baseline.

## Matriz dos oito pilares

Os locais abaixo são relativos ao respectivo pacote. Conteúdo preexistente de MVC é
identificado como preservado; o lote não atribui a si toda a especialização anterior.

| Pilar                   | Hexagonal                                                                                                                         | Limpa                                                                                                                            | MVC                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Escopo preciso          | `SKILL.md`, Responsibility and activation: fronteira já escolhida, portas e adaptadores; encaminhamentos opcionais.               | `SKILL.md`, abertura: alocação de políticas dentro de uma direção escolhida; estilo e mecanismos possuem outros responsáveis.    | Vocabulary e fechamento: responsabilidades web dentro do desenho escolhido, com handoff Boot 4 explícito.             |
| Discovery               | Establish the actual boundary: atores, entradas, recursos, garantias, versões e acoplamento permitido.                            | Establish the policy and the environment: regras, casos de uso, autoridade, atomicidade e ambiente efetivo.                      | Workflow, passo 1: build/toolchain, ADRs, contratos, chamadores, imports e caminho executado.                         |
| Profundidade técnica    | `references/port-contracts.md` e `spring-composition-and-migration.md`: contratos, lifetime, falhas e propagação.                 | `references/policies-and-boundaries.md` e `composition-and-migration.md`: políticas, tipos, composição e commit efetivo.         | Cadeia de requisição, navegação, binding e limites de segurança preservados nas referências.                          |
| Critérios de decisão    | Decide the smallest useful intervention: manter estrutura adequada, escolher uma porta ou deslocar mecanismo conforme o contrato. | `references/results-and-presentation.md`: retorno simples, representações externas ou protocolo de saída conforme a necessidade. | Decision rules e Rules preservam leituras simples e branches HTTP; extração depende de responsabilidade real.         |
| Qualidade da solução    | Implement the conversation: regras e autorização em todas as entradas, falhas precisas e propriedade dos recursos.                | Decide and implement one complete slice: contratos internos, identidade confiável e custos explícitos de modelos/interfaces.     | Complete the selected boundary change: preservar acesso, invariantes, representação e transação ao mover política.    |
| Execução                | Fatia com aplicação pura, HTTP, entrada direta, JDBC e wiring externo; sequência para substituir caminhos existentes.             | Fatia com domínio, caso de uso, contrato interno, adaptador JDBC, fronteira transacional e duas representações.                  | Conectar handler, proprietário da regra e chamadores não HTTP existentes; concluir conforme revisão ou implementação. |
| Validação               | `references/verification.md`, fixture e casos H: evidências separadas para núcleo, adaptador, transação e dependências.           | `references/verification.md`, fixture e casos C: regras puras, comportamento do bean e violações compiladas.                     | Fechamento e casos M: regra sem controller, contrato HTTP e transação real como afirmações diferentes.                |
| Limites de conhecimento | Validar a afirmação: fake, H2, principal simulado, timeout e fonte oficial não provam toda a aplicação.                           | Baseline versus alvo, transação `REQUIRED` compartilhada, confiança do ator e limites de testes estáticos.                       | Não certificar segurança/transação a partir de nomes, diagramas ou configuração ausente.                              |

## Exemplos Java executados

As duas fixtures foram compiladas e executadas em cópias temporárias com **Temurin
25.0.3 e Maven 3.9.15**. Seus POMs e todos os arquivos Java foram comparados byte a byte
com o pacote entregue. O registro estruturado contém hashes, relatórios Surefire,
versões e limites de cada execução.

| Fixture   | Execução                                                     | Evidência                                                                                                     |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Hexagonal | `mvn -B clean test dependency:tree` na cópia temporária      | 13 testes, zero falhas/erros/skips: quatro de aplicação pura, sete Boot/MockMvc/JDBC/H2, dois de arquitetura. |
| Limpa     | `mvn -B test` e `mvn -B dependency:tree` na cópia temporária | 11 testes, zero falhas/erros/skips: três de política, quatro de wiring e quatro de fronteiras.                |

Dependências resolvidas: Boot 4.1.1, Framework 7.0.9, H2 2.4.240 e JUnit 6.0.3 em ambas;
ArchUnit 1.5.0 na hexagonal e 1.4.1 na limpa. São as versões executadas, não uma garantia
de compatibilidade com qualquer patch dessas famílias.

Na fixture hexagonal, três mutações isoladas produziram falhas nas asserções esperadas:
dependência HTTP adicionada ao núcleo, remoção da fronteira transacional e seleção de
pacote inexistente. As fontes foram restauradas e os 13 testes passaram novamente.
Na limpa, a suíte compila violações de tipos Spring e de dependência para a camada externa,
rejeita seleção vazia e mostra o efeito parcial de uma chamada sem wrapper transacional.
Falhas de compilação não são contadas como detecção arquitetural.

Os exemplos verificam a semântica **H2 local** e autorização de aplicação com identidade
fornecida pelo teste. MockMvc não valida credenciais reais; a fixture limpa nem possui
servidor HTTP. Não há alegação de segurança ponta a ponta, equivalência com outro banco,
correção de todas as intercalações concorrentes, performance ou entrega distribuída.
MVC não teve exemplos alterados, portanto nenhuma nova execução Java é atribuída a ela.

## Integração do catálogo

- Revisão independente de cada nova skill pelo papel `skill-reviewer`: todos os 17
  arquivos de cada pacote inspecionados, sem defeito material que exigisse edição adicional.
  O complemento MVC também seguiu o procedimento integral, com propriedade exclusiva.
- Validação estrita dos três pacotes: 38 arquivos distribuídos, zero issues; 13 links
  Markdown locais resolvidos. Projeções puras Codex/Claude verificadas, sem instalação.
- `npm run registry:build`: 297 skills. Comparação semântica contra o índice recebido:
  duas adições, somente MVC alterada, nenhuma remoção. As outras 294 entradas foram
  preservadas, inclusive as oito skills de microserviços preexistentes.
- `npm run verify`: build, boundaries, lint, formatação, integridade/freshness do catálogo,
  versões e **355 testes em 67 suites**, todos aprovados, zero falhas e zero skips.
- Os registros finais e a atualização de status do cronograma foram concluídos após
  `verify`, com checagem própria de formatação, links e diff. Os pacotes permaneceram
  idênticos aos snapshots validados e avaliados.

Nenhum commit, publicação, instalação global ou alteração da configuração real de
agentes foi realizado. Os outputs Maven e os experimentos hostis ficaram em diretórios
temporários; os pacotes contêm somente seus recursos autorais.

## Avaliação comportamental executada

Três atores com contexto novo receberam explicitamente uma skill e tarefas de revisão.
O coordenador leu suas respostas completas, preservadas no registro estruturado, e não
observou violação dos critérios de falha definidos antes das execuções.

| Ator/casos    | Decisões observadas                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H — Hexagonal | Identidade do CSV não estabelece autoridade; ambas as entradas chegam à mesma operação e transação; ausência difere de falha; degradação informativa precisa de resultado explícito; correção de header e alvo Boot 3 permanecem no escopo. |
| C — Limpa     | Imports e tipos determinam dependências; dois canais não exigem callbacks; autochamada é hipótese a verificar no runtime; modelos/módulos adicionais dependem de restrição ou custo demonstrado.                                            |
| M — MVC       | Negociação HTTP pode permanecer no controller; regra de overdraft protege também batch; leitura adequada dispensa serviço de repasse; naming/context startup não certificam acesso ou transação.                                            |

As respostas são evidência de decisões nesses cenários, não de implementação em uma
aplicação alvo. Não houve grupo sem skill, repetição estatística, teste de seleção
automática ou demonstração de ganho causal. Os atores reportaram leitura apenas de
`AGENTS.md`, da skill atribuída e de suas referências condicionais; os dois atores das
novas skills também consultaram fontes oficiais. O isolamento de leitura foi procedural.
