# Pesquisa comparativa: utilidade, popularidade e avaliação de skills

Data da consulta: 16/10/2026. Pedido: investigar por que a comparação da onda 1
não mostrou ganho e o que diferencia `find-skills`, `security-audit-skill`,
`grill-with-docs` e `improve-codebase-architecture` do nosso catálogo.

Foram realizadas quatro pesquisas especializadas, uma por skill externa, seguindo
`AGENTS.md` e usando `skill-engineering` como referência. O coordenador examinou
o desenho, entradas, critérios, manifestos e respostas representativas da avaliação
local, os diffs da onda e estudos empíricos públicos. A pesquisa externa usou código,
documentação dos autores, histórico, issues, métricas das plataformas e artigos
originais. Nenhuma skill foi alterada ou instalada e nenhum código externo foi
executado. Esta pesquisa não é uma nova comparação comportamental.

O estado local examinado tem como base `bbb7d996a929e81baf735bbaab5b6e3fbf6e8503`
e inclui as 29 revisões ainda sem commit. Portanto, conteúdo do workspace não deve
ser confundido com conteúdo publicado, instalado ou efetivamente carregado.

## Conclusão sustentada

O resultado anterior foi **zero diferença observada na aprovação de 12 casos**.
Não estabeleceu ausência geral de benefício. O teste chegou ao máximo também sem
skill e avaliou respostas curtas com fatos fornecidos; não observou investigação,
alterações de código, interação real, retomada, custo ou seleção automática.

As quatro referências externas apresentam mecanismos concretos: descoberta apoiada
em um catálogo, coordenação de auditoria com estado e verificação, entrevista com
registro de vocabulário e descoberta de oportunidades arquiteturais com escolha
assistida. Há diferenças de distribuição e de experiência de uso verificáveis.
Não foi encontrada, nas fontes examinadas, uma comparação controlada que prove
superioridade dessas quatro skills sobre as nossas.

A comparação local também revelou capacidades já existentes: perguntas adaptativas,
revisão de premissas, evidência, preservação de decisões, retomada e critérios
específicos de Java. A lacuna observada varia por tarefa; não há suporte para
caracterizar todo o catálogo como conteúdo genérico ou afirmar que basta reduzir
texto, adicionar subagentes ou persistir arquivos para obter ganho.

## O que o nosso experimento realmente mediu

| Evidência local                                                                                                                                                                               | Consequência para a interpretação                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Comparação](wave1-challenge-2026-10-15/comparison.json): 12/12 nas três condições, 48 critérios aprovados por condição                                                                       | A métrica de aprovação está saturada nessa amostra. Não há espaço para mostrar aumento nessa pontuação.                                                                                |
| [Protocolo do ator](wave1-challenge-2026-10-15/actor-protocol.md): fatos fornecidos, sem navegação, execução ou alteração do cenário                                                          | O tratamento não pode demonstrar benefício de investigar código, obter evidência ou realizar uma correção.                                                                             |
| [Caso de review](wave1-challenge-2026-10-15/inputs/code-review-owned-session.json): fornece contrato de propriedade, chamador, consequência de fechar a sessão e regra de exceções suprimidas | Parte importante do trabalho que uma skill poderia orientar já está resolvida no enunciado.                                                                                            |
| [Caso de testes](wave1-challenge-2026-10-15/inputs/java-test-design-ordered-result.json): contrato, pseudocódigo, dados e teste inadequado são apresentados; solicita apenas plano            | Reconhecer uma asserção inadequada é diferente de encontrar o problema num projeto e demonstrar que um teste o detecta.                                                                |
| [Manifesto](wave1-challenge-2026-10-15/run-manifest.json): uma execução por combinação, seis skills, sem seleção automática                                                                   | Não mede variabilidade, seleção no catálogo ou resultado das 305 skills. Os membros de cada par também são relacionados.                                                               |
| [Desenho](wave1-challenge-2026-10-15/design.md): modelo herdado, identidade exata e tokens indisponíveis; recursos vizinhos indisponíveis                                                     | Não permite atribuir efeitos ao modelo, medir eficiência ou avaliar a composição normal completa dos pacotes.                                                                          |
| [Auditoria de exposição](wave1-challenge-2026-10-15/exposure-audit.json): instruções comuns e metadados do ambiente; isolamento procedural                                                    | O controle é o agente nesse ambiente sem carregar explicitamente o pacote. Não é um modelo sem orientações anteriores. Não há evidência suficiente para atribuir o empate a vazamento. |

A inspeção das respostas `trial01`, `trial02` e `trial03` confirmou que original,
controle e revisada identificaram a mesma falha de propriedade e a mesma correção
no caso de sessão emprestada. O controle já produziu a decisão esperada. Não há
motivo demonstrado para reclassificar esses acertos como falhas depois do resultado.

O teste continua útil como proteção contra regressões das regras exercitadas. A
limitação é usá-lo para responder à pergunta mais ampla sobre produtividade e
qualidade em desenvolvimento real. A distinção entre resposta, trajetória e estado
final do ambiente, assim como o limite de uma avaliação saturada, também aparece na
[orientação de avaliação da Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

Nos 102 arquivos alterados sob `skills/`, o diff atual contém 71 arquivos Markdown,
29 manifests, um exemplo Java e seu script shell. Essa contagem descreve a natureza
da onda, não sua qualidade: o trabalho concentrou-se em orientações e correções
documentais, com uma alteração executável de exemplo. O
[relatório da onda](wave1-2026-10-15.md) distingue essas verificações da avaliação
das respostas. A correção comprovada da contradição de risco continua válida mesmo
sem ganho comparativo demonstrado.

## Fontes e versões externas examinadas

| Objeto                                            | Versão fixada                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find-skills`                                     | [Arquivo em `773fb2c7bbf16781670a3520affc4abd0c6151ae`](https://github.com/vercel-labs/skills/blob/773fb2c7bbf16781670a3520affc4abd0c6151ae/skills/find-skills/SKILL.md), alteração de 10/07/2026 |
| CLI da Vercel                                     | [`13e4063a1cf913f5606d57d42ab83a86f5001e04`](https://github.com/vercel-labs/skills/tree/13e4063a1cf913f5606d57d42ab83a86f5001e04), de 09/10/2026                                                  |
| Skill de segurança da Cloudflare                  | [`c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`](https://github.com/cloudflare/security-audit-skill/tree/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8), de 14/09/2026                                     |
| As duas skills de Matt Pocock e suas dependências | [`49dd158d1076134a641b33efb035946536778336`](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336), de 09/10/2026                                                   |

As métricas e issues abaixo são observações datadas e podem mudar. O código fixado
é a referência de comportamento pretendido; documentação, instalação e execução
real podem divergir dele.

## Diferenças verificáveis por skill

**`find-skills`: descoberta ligada a uma ferramenta e a um canal de distribuição.**
Seu procedimento transforma uma necessidade em candidatos, links e comandos
instaláveis. O pacote contém um `SKILL.md`; a busca efetiva depende do CLI e de seu
catálogo. A seleção atual usa popularidade e reputação como heurísticas, sem exigir
teste dos candidatos. Assim, o procedimento concreto existe, mas as heurísticas
não equivalem a verificação técnica. [Skill](https://github.com/vercel-labs/skills/blob/773fb2c7bbf16781670a3520affc4abd0c6151ae/skills/find-skills/SKILL.md),
[implementação da busca](https://github.com/vercel-labs/skills/blob/13e4063a1cf913f5606d57d42ab83a86f5001e04/src/find.ts#L86).

Há um canal de aquisição comprovado: depois de instalar skills, o CLI pode oferecer
especificamente `find-skills`, em modo interativo e com confirmação. Isso está no
código `promptForFindSkills`. Não encontramos dados que quantifiquem quanto essa
exposição explica a adoção. [Implementação](https://github.com/vercel-labs/skills/blob/13e4063a1cf913f5606d57d42ab83a86f5001e04/src/add.ts#L2497).

Nós já temos [busca](../../packages/core/src/application/search-skills.ts),
[comandos de descoberta](../../packages/cli/src/commands/discovery.ts), instalação,
versões, lockfile e integridade. Não foi localizado nos caminhos examinados um
equivalente à promoção incorporada de uma skill de descoberta. Distribuição e
recomendação ao usuário são diferenças observáveis; inferioridade do nosso
gerenciador não decorre delas.

**Cloudflare: auditoria com cobertura explícita e contestação dos candidatos.**
A entrada define modalidades, orçamento, fases e resultados incompletos.
O reconhecimento produz um registro por superfície, fronteira, subsistema e classe
de ataque, preservando responsáveis, evidências e pendências. A investigação inclui
um crítico das lacunas de cobertura. [Entrada](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/SKILL.md),
[reconhecimento](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/RECONNAISSANCE.md),
[investigação](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/HUNTING.md).

A validação separa suspeita, confirmação e rejeição. Um novo agente procura refutar
o candidato; o relatório deriva de registros revisados. Isso converte parte da
orientação em contratos de trabalho e artefatos inspecionáveis. Nova sessão não
garante independência estatística entre julgamentos. [Validação e relatório](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/VALIDATION-AND-REPORTING.md).

Nosso [code-review](../../skills/code-review/SKILL.md) já exige evidência, cobertura
proporcional e revisão de achados; [segurança Java](../../skills/java-application-security-basics/SKILL.md)
inclui atacante, caminhos alcançáveis e testes adversariais. Nessas duas skills,
não encontramos o mesmo conjunto de ledger canônico, crítico de cobertura,
verificação por outro agente e validadores de artefatos. Seus escopos são menores
que uma auditoria completa; a diferença não é automaticamente um defeito.

**`grill-with-docs`: composição pequena para uma conversa com resultado visível.**
A entrada atual tem sete linhas e chama `grilling` e `domain-modeling`; exige
invocação explícita. O conteúdo carregado inclui essas dependências, portanto sete
linhas não medem seu custo total. [Entrada](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/grill-with-docs/SKILL.md).

`grilling` organiza perguntas conforme dependências, recomenda opções, espera as
respostas e recalcula a rodada. `domain-modeling` confronta termos com código e
glossário, registra termos resolvidos imediatamente e propõe ADRs seletivos.
O arquivo atual é `GLOSSARY.md`; `CONTEXT.md` é o nome anterior. Isso é persistência
documental, sem mecanismo demonstrado de aprendizado automático.
[Entrevista](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/productivity/grilling/SKILL.md),
[modelagem](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/domain-modeling/SKILL.md),
[mudança de nome](https://github.com/mattpocock/skills/commit/d80fa0f4ebe0c5714af0adf8670336065233ecc6).

Nós já temos integração de respostas em
[collaborative-feature-definition](../../skills/collaborative-feature-definition/SKILL.md),
rodadas em [feature-requirement-clarification](../../skills/feature-requirement-clarification/SKILL.md),
decisões em [feature-decision-analysis](../../skills/feature-decision-analysis/SKILL.md)
e retomada em [feature-progress-tracking](../../skills/feature-progress-tracking/SKILL.md).
O glossário ativo de termos canônicos é uma diferença encontrada nesse recorte,
não uma ausência provada em todo o catálogo. A diferença de escopo também importa:
a externa apresenta uma intervenção para uma sessão; nossa suite cobre um ciclo
mais amplo de entrega e preservação de evidências.

**`improve-codebase-architecture`: descoberta e escolha antes de planejar a mudança.**
Explora uma área indicada ou mudanças recentes, identifica candidatos, apresenta
um relatório e aprofunda o escolhido com o usuário. Seu resultado imediato é
análise e decisão; não executa por si só a refatoração. A apresentação inclui
arquivos, situação atual, proposta e comparações visuais.
[Entrada](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/improve-codebase-architecture/SKILL.md),
[relatório](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/improve-codebase-architecture/HTML-REPORT.md).

A composição pede alternativas de interface com objetivos diferentes, como reduzir
a interface, favorecer o chamador ou aumentar flexibilidade. É uma técnica concreta
de exploração; a diversidade e qualidade das propostas dependem da execução.
[Design de alternativas](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/codebase-design/DESIGN-IT-TWICE.md).

Nossa [architecture-refactoring-paths](../../skills/architecture-refactoring-paths/SKILL.md)
começa com uma mudança escolhida. Já temos investigação de acoplamento,
alternativas e preservação de contratos em
[java-cohesion-coupling](../../skills/java-cohesion-coupling/SKILL.md),
[java-composition-over-inheritance](../../skills/java-composition-over-inheritance/SKILL.md),
[architecture-coupling-and-quanta](../../skills/architecture-coupling-and-quanta/SKILL.md)
e [architecture-decision-making](../../skills/architecture-decision-making/SKILL.md).
Entre essas cinco, não encontramos a mesma entrada que reúna descoberta,
apresentação de candidatos e escolha. Isso sustenta uma hipótese de melhoria na
experiência de uso, não uma medição de superioridade arquitetural.

## Popularidade, feedback e limites das referências externas

| Objeto                                                                                             | Instalações exibidas pela skills.sh em 16/10/2026                                                                            | Estrelas obtidas na API GitHub                                                                          |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [find-skills](https://skills.sh/vercel-labs/skills/find-skills)                                    | 3,9 milhões; [API](https://skills.sh/api/search?q=find-skills&limit=20&owner=vercel-labs) retornou 3.876.240 às 11:04:07 UTC | 35.181 no [repositório do CLI](https://api.github.com/repos/vercel-labs/skills)                         |
| [security-audit](https://skills.sh/cloudflare/security-audit-skill/security-audit)                 | 34,6 mil, arredondado                                                                                                        | 30.015 no [repositório](https://api.github.com/repos/cloudflare/security-audit-skill)                   |
| [grill-with-docs](https://skills.sh/mattpocock/skills/grill-with-docs)                             | 1,2 milhão, arredondado                                                                                                      | 293.466 na coleção compartilhada                                                                        |
| [improve-codebase-architecture](https://skills.sh/mattpocock/skills/improve-codebase-architecture) | 1,1 milhão, arredondado                                                                                                      | As mesmas 293.466 da [coleção](https://api.github.com/repos/mattpocock/skills), não um segundo conjunto |

A plataforma define o ranking por telemetria agregada de instalações. Os números
não demonstram usuários únicos, retenção ou tarefas concluídas corretamente.
Não auditamos o servidor nem sua deduplicação. A leitura do cliente da Vercel
mostrou eventos de instalação, sem medida de resultado da tarefa.
[FAQ](https://skills.sh/docs/faq#how-is-the-leaderboard-ranked),
[telemetria](https://github.com/vercel-labs/skills/blob/13e4063a1cf913f5606d57d42ab83a86f5001e04/src/telemetry.ts).

Há canais de distribuição identificáveis e problemas fáceis de reconhecer nas
promessas dos pacotes. A hipótese de que isso facilita adoção é plausível, mas a
pesquisa não isolou seu efeito. Também não mediu a retenção ou utilidade de nossas
skills para usuários, logo não existe aqui uma comparação simétrica de sucesso.

A política atual do repositório de Matt Pocock exige falha observada numa sessão
real para manter uma proposta de mudança e desencoraja criar outra skill quando
o comportamento já pode ser composto. Isso documenta um processo de manutenção
orientado por uso. Seu efeito causal na qualidade e na popularidade continua
desconhecido. [SCOPE.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/SCOPE.md).

As fontes também contêm contraprovas a uma leitura de sucesso sem limites:

- **Cloudflare:** o validador de findings confere campos, estados e relações
  declaradas; não comprova explorabilidade. O validador de cobertura verifica o
  formato/propriedade do caminho, mas não a existência do artefato. Leitura
  estática, sem reprodução de execução. Há um [relato correspondente](https://github.com/cloudflare/security-audit-skill/issues/21).
  [Código de findings](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/validate-findings.cjs#L485),
  [código de cobertura](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/validate-coverage-ledger.cjs#L394).
- **Cloudflare e o sistema interno:** o artigo de lançamento relata que uma
  execução da skill inicial encontrava aproximadamente metade da união dos bugs
  encontrados em múltiplas execuções. Não é metade de todas as vulnerabilidades
  existentes. O texto descreve também um harness interno posterior; seus números
  não são um benchmark da skill pública atual nem uma comparação controlada com
  ausência da skill. [Relato original](https://blog.cloudflare.com/build-your-own-vulnerability-harness/).
- **grill-with-docs:** a própria documentação reconhece falha de carregamento de
  dependências, entrevista sem escrita em certos ambientes e perda de decisões
  que não cabem no glossário ou em ADRs. O documento não fornece frequências de
  falha. [Limites documentados](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/docs/engineering/grill-with-docs.md).
  A [issue 341](https://github.com/mattpocock/skills/issues/341) relata enfraquecimento
  de decisões no fluxo posterior; a [299](https://github.com/mattpocock/skills/issues/299)
  relata proposta registrada interpretada como estado implementado. Não reproduzimos esses casos.
- **Arquitetura:** a [issue 274](https://github.com/mattpocock/skills/issues/274)
  registra abandono por entrevista excessiva e ajuste posterior do fluxo; a
  [651](https://github.com/mattpocock/skills/issues/651) relata relatório que não
  renderiza sob restrições de scripts. São relatos de usuários e manutenção,
  sem uma taxa de falha medida ou comparação controlada.

Esses limites não anulam os mecanismos úteis. Impedem tratá-los como garantias e
mostram por que copiar o pacote inteiro não substitui avaliação no nosso ambiente.

## O que a pesquisa empírica acrescenta

Os estudos abaixo não avaliaram nosso catálogo e seus números não são previsões
para ele. Foram examinadas versões identificadas dos artigos, sem reprodução
independente de seus experimentos.

- **SkillsBench, v4 de 14/06/2026:** relata 87 tarefas, oito domínios e 18
  configurações, com média de 33,9% sem skills e 50,5% com skills curadas
  (+16,6 pontos percentuais). Há também 13 tarefas com diferença negativa.
  Os autores reconhecem limites de generalização e de atribuição aos componentes
  do pacote. As tabelas por tamanho agrupam tarefas distintas: não provam que
  encurtar uma skill específica melhora seu resultado.
  [Artigo, resultados e limitações](https://arxiv.org/html/2602.12670v4).
- **SWE-Skills-Bench, v1 de 16/03/2026:** relata 565 tarefas, 49 skills e uma
  configuração de agente/modelo. Encontrou diferença zero em 39 skills e ganho
  médio de 1,2 ponto percentual, partindo de 89,8% de aprovação. Tarefas e testes
  foram gerados por procedimento com modelos. Há descrição inconsistente do
  local de colocação da skill entre as seções 3.2 e 4.1; a leitura do artigo não
  resolve a exposição real em cada execução. É um resultado com alcance limitado.
  [Artigo](https://arxiv.org/html/2603.15401v1).
- **Skill Usage in Realistic Settings, v1 de 06/04/2026:** testa seleção e
  recuperação num conjunto de cerca de 34 mil skills, com três execuções por
  tarefa. Relata perda de parte do benefício quando o agente precisa encontrar
  e adaptar recursos, e resultados melhores em algumas condições de refinamento
  ligado à tarefa. Sua análise usa uma versão anterior do SkillsBench; não é
  uma auditoria da versão de junho. [Artigo](https://arxiv.org/html/2604.04323v1).

Essas evidências são compatíveis com efeito dependente da tarefa, do modelo, da
ferramenta e da seleção. Não sustentam nem benefício automático nem inutilidade
geral. A [orientação de autoria do Agent Skills](https://agentskills.io/skill-creation/best-practices)
também enfatiza capturar procedimentos, correções e contexto de trabalho real,
seguindo com inspeção das execuções. Essa orientação é uma prática recomendada,
não prova experimental sobre nossas revisões.

## Hipóteses que agora podemos testar

| Hipótese                                                                   | Situação da evidência                                                   | Experimento que a distingue                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| As regras revisadas são redundantes para os casos curtos anteriores        | Compatível com o controle já correto; não demonstrada fora desses casos | Tarefas representativas novas com investigação real, mantendo ferramentas e orçamento equivalentes          |
| Uma entrada orientada à tarefa melhora escolha e reduz trabalho do usuário | Diferença de fluxo observada; efeito não medido                         | Comparar nossa composição atual com uma entrada simplificada usando os mesmos especialistas                 |
| Cobertura persistente reduz omissões em trabalhos longos                   | Mecanismo observado na Cloudflare; não medido aqui                      | Acrescentar apenas o registro de cobertura e medir omissões e custo antes de adicionar verificadores extras |
| Outro verificador reduz falsos positivos                                   | Contrato operacional observado; efeito não medido                       | Comparar com e sem essa etapa, incluindo seu custo total e casos sem defeito                                |
| Memória documental evita repetir perguntas e perder decisões               | Há mecanismos externos e locais; também relatos de falha                | Segunda sessão com memória ausente, válida e depois desatualizada; verificar preservação e invalidação      |
| O texto da skill de descoberta agrega valor além de acesso à busca         | CLI e skill estão acoplados no uso comum                                | Mesma ferramenta e catálogo: instrução mínima versus skill completa, com candidatos populares inadequados   |

Uma próxima avaliação deve escolher uma tarefa que o usuário realmente repete,
com critério de resultado definido antes de comparar candidatas. Para o piloto de
`debugging` já proposto, a unidade útil seria um bug em código com reprodução e
verificador independente, sem entregar causa e correção no enunciado. Para comparar
diretamente arquitetura ou entrevista, o resultado e a avaliação devem respeitar
seus próprios escopos, sem exigir uma implementação que a skill não promete.

O desenho proposto é: controle com as ferramentas normais; skill atual; candidata
com uma hipótese concreta. Quando necessário, incluir instrução mínima de uso da
mesma ferramenta para separar acesso e procedimento. Fixar versões, permissões,
entrada e orçamento; separar desenvolvimento de casos reservados; repetir execuções;
registrar leituras, ações, custo total incluindo falhas, tempo e intervenções.
Verificadores determinísticos devem avaliar comportamento observável, e decisões
arquiteturais precisam também de avaliação humana com critérios prévios.

Medir sucesso e regressões junto com falsos positivos, perguntas evitáveis,
decisões preservadas e custo conforme a tarefa. Os casos fáceis continuam como
regressão; não devem ser apagados para fabricar ganho. Tampouco devemos selecionar
apenas casos que a candidata já resolveu. Um novo empate permanece um resultado
válido, e pode justificar manter a orientação atual ou dispensar uma etapa extra.

O critério de evolução precisa passar de quantidade de texto/revisões para uma
mudança observável no trabalho: uma falha evitada, uma decisão melhor sustentada,
menos intervenção ou menor custo sem regressão material. As correções técnicas
continuam necessárias independentemente de popularidade, e qualquer benefício
esperado permanece hipótese até a avaliação correspondente.

## Estado ao encerrar esta pesquisa

O único artefato novo do coordenador é este relatório. Os quatro pesquisadores
encerraram atividades sem alterações no workspace. Não houve nova onda de revisão,
benchmark comportamental, implementação de memória, publicação ou instalação.
Os resultados anteriores, incluindo falha inicial e empate, foram preservados.
A verificação do repositório nesta sessão é reportada na resposta final e não deve
ser interpretada como teste de eficácia das skills externas.
