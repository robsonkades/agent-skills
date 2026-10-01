# Revisão das skills pendentes e vínculos do catálogo — 30/09/2026

Este relatório registra a primeira etapa. A continuação solicitada para sugestões
está na [auditoria de suggests](suggests-review-2026-09-30.md), com o estado final
do catálogo e a análise da opção de instalação.

A revisão técnica cobriu as **20 skills com alterações não commitadas no início deste
pedido**. Foram aplicadas correções em 18; `java-ddd-value-objects` e
`service-data-ownership` permaneceram idênticas ao estado recebido. A segunda etapa
auditou os vínculos das **305 skills**, corrigindo 26 manifestos. As duas etapas
alteraram 41 pacotes distintos.

O [registro do catálogo](catalog-links-2026-09-30.json) contém os 305 resultados de
resolução, contagens de vínculos, versões, arquivos alterados e cada vínculo adicionado
ou removido. O [registro dos exercícios](uncommitted-skills-2026-09-30-evaluation.json)
separa entradas, critérios e decisões observadas em nove casos.

## Melhorias comuns aplicadas conforme o contexto

- **Contratos antes de mecanismos:** distinguir retorno, commit confirmado, rollback,
  resultado desconhecido e falha após commit; explicitar quem pode alterar ou observar
  estado e quem responde por efeitos externos.
- **Referência concreta e compatibilidade:** preservar versões, nomes, pacotes e contratos
  do projeto onde a skill será aplicada. Separar convenções observadas de melhorias
  propostas e da versão usada para validar um exemplo.
- **Verificação que distingue alternativas:** testar o caso que separa duas interpretações
  plausíveis, como salvar explicitamente versus Unit of Work, retorno interno versus
  rollback externo, ou identidade de usuário versus cliente.
- **Evidência proporcional:** informar o que foi inspecionado, compilado, executado ou
  apenas proposto. Evitar impor novos agregados, hierarquias, frameworks ou baterias de
  testes quando a mudança local não os exige.

Esses critérios orientaram a revisão; não foram copiados como um bloco genérico em
todas as skills. O projeto de referência permaneceu
`C:\Users\robso\Downloads\ddd-example-master\ddd-example-master`, somente para leitura.
Seus exemplos históricos Boot 2.7.7 continuam distintos das fixtures Boot 4.1.1.

## Resultado das 20 revisões de conteúdo

Cada pacote teve um revisor exclusivo. A tabela registra alterações desta revisão,
em relação ao snapshot recebido, e não atribui a ela a criação anterior dos pacotes.

| Skill                              | Versão final | Correção ou resultado                                                                                                                              |
| ---------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| api-gateway-and-bff                | 1.0.0        | Distingue cache privado, ausência de armazenamento, revalidação e respostas degradadas; inclui isolamento e recuperação.                           |
| bounded-context-design             | 1.0.0        | Diferencia snapshot histórico de modelos distintos; qualifica regras de módulos e pacotes do Spring Modulith.                                      |
| cross-service-query-design         | 1.0.0        | Evita perda de resultados em cursores e avanço de checkpoint sobre trabalho anterior ainda incompleto.                                             |
| java-ddd                           | 1.0.0        | Torna cancelamento e novas verificações condicionais ao contrato; instala os sete especialistas táticos e orienta leitura seletiva.                |
| java-ddd-aggregates                | 1.0.0        | Separa mutação observada no exemplo de atomicidade recomendada; preserva namespace e distingue encadeamento fluente de comando indivisível.        |
| java-ddd-domain-events             | 1.0.0        | Distingue visão imutável de snapshot; evita remover ocorrências novas por igualdade; trata commit desconhecido.                                    |
| java-ddd-domain-services           | 1.0.0        | Liga políticas aos fatos que as sustentam; distingue oferta vinculante de recálculo e trata resultado desconhecido de reserva.                     |
| java-ddd-repositories              | 1.0.0        | Qualifica persist/merge e IDs atribuídos; exige evidência real para versão coerente, recarga e conflitos.                                          |
| java-ddd-testing                   | 1.0.0        | Acrescenta rejeição retornada com estado gerenciado e o par salvar explicitamente/Unit of Work; preserva baseline do projeto.                      |
| java-ddd-use-cases                 | 1.0.0        | Distingue retorno provisório, rollback, commit desconhecido e erro posterior ao commit; evita repetição insegura.                                  |
| java-ddd-value-objects             | 1.0.0        | Sem alteração necessária; fixture existente recompilada, 55 checks aprovados.                                                                      |
| microservices-architecture         | 1.0.0        | Exige intenção durável ou trabalho reconstruível antes de efeitos externos obrigatórios; integra seis especialistas adicionais.                    |
| mvc-and-request-handling           | 1.3.5        | Protege estado por requisição; preserva Transaction Script/Table Module quando adequados e remove afirmação temporal sem evidência.                |
| progressive-service-delivery       | 1.0.0        | Inclui tempo de detecção/contenção, trabalho em andamento e limites de exposição; corrige interpretação de testes estatísticos repetidos.          |
| service-data-ownership             | 1.0.0        | Sem alteração necessária; contratos de autoridade, permissões e migração foram preservados.                                                        |
| service-discovery                  | 1.0.0        | Diferencia retenção DNS Java do exemplo didático e explica o ciclo entre descoberta de pares e readiness.                                          |
| service-identity-and-trust         | 1.0.0        | Distingue principal usuário/cliente, inclusive com issuer/sub iguais; preserva a distinção em autorização e cache.                                 |
| spring-boot                        | 1.2.1        | Corrige responsabilidade por recursos em inicialização malsucedida, proxies/readiness e wiring de núcleo independente; declara seis especialistas. |
| spring-boot-clean-architecture     | 1.0.1        | Qualifica imutabilidade de records e ownership de coleções; acrescenta rollback externo após retorno interno bem-sucedido.                         |
| spring-boot-hexagonal-architecture | 1.0.1        | Acrescenta rollback externo e assertions compartilhadas entre fake e JDBC; corrige documentação de conclusão transacional.                         |

Todas passaram na validação local estrita, referências locais e formatação aplicável.
As alterações foram inspecionadas contra o snapshot, incluindo as fontes dos testes.
Nenhum teste existente foi removido ou enfraquecido.

## Critério para dependencies, optionalDependencies e suggests

A classificação segue [o contrato do repositório](../skill-format.md#what-a-dependency-means):

- `dependencies`: disciplina assumida ou especialista prometido como parte do conjunto
  instalado, inclusive proprietários explícitos de tabelas de roteamento.
- `optionalDependencies`: também instala o pacote quando resolvível; não é um substituto
  de sugestão e não elimina ciclos. As duas declarações existentes foram preservadas.
- `suggests`: consulta condicional, continuidade de outra tarefa ou retorno para a skill
  principal quando uma dependência inversa fecharia um ciclo.

O conteúdo ser compreensível sozinho não justifica remover uma dependência conceitual.
Da mesma forma, mencionar um tema não exige instalar uma skill. Todas as declarações
foram verificadas contra nomes e versões existentes.

### Dependências adicionadas ou promovidas

| Skill                        | Justificativa                                                                                                             | Pacotes na resolução, incluindo a própria skill |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| java-ddd                     | Sete especialistas táticos que compõem a entrega de uma fatia DDD.                                                        | 1 → 8                                           |
| spring-boot                  | Web, JPA, segurança, transações/eventos, testes e observabilidade.                                                        | 1 → 7                                           |
| microservices-architecture   | Contratos RPC, evolução de schema, sagas, idempotência, testes distribuídos e SLOs. Rotas Spring permanecem condicionais. | 8 → 31                                          |
| clean-delivery-workflow      | Todos os proprietários já prometidos por suas tabelas; inclui nomes em texto comum e linhas com mais de um especialista.  | 3 → 172                                         |
| code-review                  | Proprietários de regras de arquitetura e nullness na tabela de automação.                                                 | 2 → 19                                          |
| java-object-construction     | Especialista de fluent APIs explicitamente responsável pelos mecanismos de builder.                                       | 1 → 2                                           |
| refactoring-automation       | A disciplina de refatoração é pré-condição explícita antes de escolher ferramentas.                                       | 1 → 12                                          |
| timeouts-and-deadlines       | Estatística de latência sustenta a seleção dos budgets e percentis.                                                       | 2 → 4                                           |
| architecture-and-performance | O fluxo principal delega desenho experimental à metodologia de performance.                                               | 1 → 22                                          |

**Impacto relevante:** `clean-delivery-workflow` passa a declarar 66 dependências diretas.
Isso também amplia resoluções de quem já depende dela:
`feature-engineering` passa de 39 para 189 pacotes, e
`collaborative-feature-definition`, de 40 para 190. São contagens calculadas pelo
resolver, não instalações executadas. A orientação de carregar somente as skills
necessárias à decisão atual continua preservada.

Nas demais correções, foram declarados encaminhamentos opcionais nas famílias de
features, Java, performance, concorrência e qualidade. Foram eliminadas duas
duplicidades, mantendo a dependência já justificada:
`jvm-bytecode → jvm-class-loading` e
`queueing-models → universal-scalability-law`.
O JSON vinculado apresenta os 26 pacotes e todos os destinos, inclusive versões anteriores.

### Cobertura e resultados da auditoria

| Verificação                                               | Resultado     |
| --------------------------------------------------------- | ------------- |
| Manifestos carregados e raízes resolvidas individualmente | 305 de 305    |
| Dependências obrigatórias                                 | 664 → 753     |
| Dependências opcionais                                    | 2 → 2         |
| Sugestões                                                 | 2.256 → 2.306 |
| Ciclos, conflitos de ranges ou falhas de resolução        | 0             |
| Destinos duplicados entre campos                          | 2 → 0         |
| Encaminhamentos confirmados ainda sem declaração          | 0             |
| Entradas do índice alteradas nesta revisão                | 41            |
| Entradas do índice preservadas integralmente              | 264           |

A varredura combinou arquivos distribuídos, nomes exatos, contexto da referência e
revisão suplementar de 1.029 arquivos Markdown, incluindo maiúsculas/minúsculas,
blocos de texto e nomes sem hífen. Foram inspecionados ainda sete possíveis pontos de
entrada com dependências vazias.

Três ocorrências restantes do scanner foram classificadas como falsos positivos:
uma menção ao fenômeno coordinated omission em JMH e duas ao objetivo Maven
`spring-boot:build-image`. Tabelas de exemplos de avaliação ou comparação de checks
não foram confundidas com tabelas que prometem proprietários de roteamento.

O resolver real do repositório recebeu um catálogo em memória com a versão atual de
cada pacote e resolveu cada nome separadamente, percorrendo dependências obrigatórias
e opcionais disponíveis. Nenhuma instalação ou detecção de configuração real foi usada.
A checagem de todas as raízes complementa o gerador do índice, cuja validação isolada
não prova ausência de todo ciclo possível.

Esta foi uma auditoria de relacionamentos em todo o catálogo e uma revisão técnica
completa das 20 skills selecionadas. Não constitui revisão técnica completa dos outros
285 pacotes nem prova de que todo pré-requisito conceitual não nomeado já está declarado.

## Evidências executadas

| Evidência                                                          | Resultado                                                                                           | Limite                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Validadores estritos e adapters Codex/Claude nos pacotes revisados | Sem problemas locais                                                                                | Estrutura, metadados e projeção; não qualidade de todas as decisões.                     |
| Testes focados do gerenciador: manifestos, resolver e índice       | 72 aprovados                                                                                        | Contratos exercitados por esses testes.                                                  |
| Fixture de VOs                                                     | 55 checks aprovados                                                                                 | Compilada com `--release 17`, executada em Temurin 25.0.3.                               |
| Fixture de service discovery                                       | 28 checks aprovados                                                                                 | Compilada com `--release 21`, executada em Temurin 25.0.3; sem DNS/Kubernetes real.      |
| Experimento de ownership de eventos                                | 4 checks aprovados                                                                                  | Snapshot, visão viva e limpeza por igualdade/identidade; sem banco ou broker.            |
| Aritmética de exposição                                            | 7 checks aprovados                                                                                  | Limites sintéticos sob hipóteses explícitas.                                             |
| Fixture Spring clean architecture                                  | 12 testes, sem falhas, erros ou skips                                                               | Boot 4.1.1, Framework 7.0.9, Java 25.0.3, H2; não prova semântica de MySQL/PostgreSQL.   |
| Fixture Spring hexagonal                                           | 16 testes, sem falhas, erros ou skips; cinco mutações detectadas                                    | Contratos locais de persistência, transação e arquitetura; não autenticação de produção. |
| Três atores independentes usando as skills revisadas               | Nove casos atenderam aos critérios, por avaliação do coordenador                                    | Respostas de revisão; sem comparação com versão original ou execução sem skill.          |
| `npm run registry:build`                                           | 305 skills; diferenças do índice correspondem exatamente aos 41 pacotes alterados                   | Executado após encerrar escritas dos revisores.                                          |
| `npm run verify`                                                   | Aprovado: build, sete boundaries, lint, formato, índice, versões e 355 testes; zero falhas ou skips | Verificação global do gerenciador e catálogo.                                            |

Os testes novos das fixtures verificam o resultado observável após completar a transação
externa. Na fixture hexagonal, aceitar silenciosamente uma duplicata idêntica no fake e
trocar `REQUIRED` por `REQUIRES_NEW` produziram as falhas esperadas, além das três
mutações já existentes. Os arquivos distribuídos correspondem aos executados nas
cópias temporárias. Os READMEs das
[fixtures clean](../../skills/spring-boot-clean-architecture/assets/boundary-fixture/README.md)
e [hexagonal](../../skills/spring-boot-hexagonal-architecture/assets/contract-fixture/README.md)
documentam os comandos de reprodução.

Os nove exercícios com agentes cobriram salvar explicitamente/Unit of Work/rejeição
retornada, usuário/cliente/evidência ausente e dois limites de exposição/testes repetidos.
Critérios foram definidos antes das execuções e não foram fornecidos aos atores.
São casos conhecidos, não um conjunto reservado para avaliação; nenhuma melhoria
percentual, superioridade ou eficácia em produção foi inferida deles.

## Versões e preservação

As 23 skills anteriormente commitadas que receberam correções adicionais de vínculo
tiveram incremento de patch. As alterações recebidas de `spring-boot` (1.2.1 sobre
1.2.0) e MVC (1.3.5 sobre 1.3.4) já tinham incremento suficiente e foram preservadas.
Pacotes ainda não publicados mantiveram suas versões iniciais ou o incremento já
atribuído. O registro JSON mostra versão commitada, recebida e final de cada pacote.

Relatórios anteriores, documentos de planejamento e alterações não relacionadas foram
preservados. O índice foi regenerado pelo comando oficial e comparado com a cópia
recebida. Não houve commit, publicação, instalação global ou alteração de configuração
real de agentes.
