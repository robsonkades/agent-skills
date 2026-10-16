# Onda 1 — aplicação da pesquisa comparativa

Data: 2026-10-16. Escopo: 29 skills. Esta rodada modifica as instruções, referências
e um exemplo executável das skills. O código do gerenciador não foi alterado.

As 29 revisões foram implementadas e inspecionadas pelo coordenador, com 67 arquivos
das skills alterados nesta rodada. `npm run verify` passou: 393 testes, 70 suites,
nenhuma falha e nenhum teste ignorado. O avaliador independente aprovou os dez
resultados nos 32 critérios congelados; ambas as condições passaram nos cinco casos,
sem vantagem comportamental demonstrada nesta amostra.

## O que foi aplicado

A [pesquisa comparativa](../skills-comparative-research-2026-10-16.md) não demonstrou
que popularidade, tamanho ou quantidade de agentes causam qualidade. Seus mecanismos
úteis foram aplicados conforme a responsabilidade de cada skill:

- Descobrir a informação nos artefatos do projeto e seguir o caminho realmente usado
  pelo chamador ou consumidor, com um limite explícito quando a investigação para.
- Transformar critérios abstratos em decisões: qual evidência muda a ação, qual
  alternativa pode refutar a conclusão e o que permanece desconhecido.
- Produzir e atualizar o artefato pedido. Respostas do usuário devem alterar regras,
  critérios e perguntas afetadas, preservando condições, autoridade e revisões aceitas.
- Verificar o resultado efetivamente executado ou entregue. Uma interface, um teste
  com nome adequado, um registro PASS ou um job configurado não comprova o caminho,
  a asserção ou a proteção pretendida.
- Manter procedimentos proporcionais: detalhes condicionais em referências, uso de
  ferramentas existentes e nenhum requisito geral de criar glossários, relatórios,
  agentes adicionais ou novos frameworks.

O benefício comportamental dessas instruções continua sendo uma hipótese a medir.
A evidência mais direta desta rodada é uma lacuna concreta corrigida no verificador
Java descrito abaixo.

## Alterações por skill

Cada revisor teve propriedade exclusiva de uma skill por vez; 20 revisores atenderam
as 29 em uma fila limitada. Todos encerraram suas escritas antes da integração.
O coordenador inspecionou o diff incremental de cada pacote. Todos os revisores
reportaram verificações locais de pacote/metadata, links, formatação e diff aprovadas.

As versões abaixo comparam o índice em HEAD com o resultado final. Os 29 aumentos
de patch já existiam, ainda não publicados, no início desta rodada e foram mantidos.
Não houve aumento adicional por edição. A lista exata de arquivos e hashes de cada
skill está em [integration.json](integration.json), campo `skillResults`.

| Skill                                                                                           | Versão em HEAD → final | Revisor   | Correção aplicada                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [clean-delivery-workflow](../../../skills/clean-delivery-workflow/SKILL.md)                     | 1.1.5 → 1.1.6          | quality01 | Seguir entrada, configuração e chamador até o resultado; selecionar a verificação do caminho real antes da edição.                                       |
| [code-review](../../../skills/code-review/SKILL.md)                                             | 1.0.5 → 1.0.6          | quality02 | Procurar a refutação mais forte de um achado, confirmar a ligação entre componentes e delimitar cobertura e pendências.                                  |
| [coding-agent-discipline](../../../skills/coding-agent-discipline/SKILL.md)                     | 1.0.4 → 1.0.5          | quality03 | Relacionar comando, fonte, build e artefato consumido; decidir quando evidência anterior ainda vale após mudanças.                                       |
| [collaborative-feature-definition](../../../skills/collaborative-feature-definition/SKILL.md)   | 1.1.4 → 1.1.5          | quality04 | Atualizar o documento de trabalho após respostas; resolver termos que mudam comportamento e reconciliar regras, critérios e perguntas.                   |
| [engineering-communication](../../../skills/engineering-communication/SKILL.md)                 | 1.1.4 → 1.1.5          | quality05 | Consultar a fonte e revisar todas as partes afetadas de uma mensagem; preservar limites decisivos ao resumir ou mudar o tom.                             |
| [estimation-under-uncertainty](../../../skills/estimation-under-uncertainty/SKILL.md)           | 1.1.4 → 1.1.5          | quality06 | Extrair eventos e unidades comparáveis; distinguir PR, entrega e disponibilidade ao usuário, incluindo casos incompletos e excluídos.                    |
| [feature-architecture-analysis](../../../skills/feature-architecture-analysis/SKILL.md)         | 1.1.4 → 1.1.5          | quality07 | Descobrir impactos a partir de implementações e consumidores reais; reconciliar mapa, diff, escopo e fronteiras não verificadas.                         |
| [feature-context-analysis](../../../skills/feature-context-analysis/SKILL.md)                   | 1.1.4 → 1.1.5          | quality08 | Investigar a pergunta pelo fluxo e seleção em execução; distinguir busca sem correspondência, busca parcial e erro da ferramenta.                        |
| [feature-contract-definition](../../../skills/feature-contract-definition/SKILL.md)             | 1.0.5 → 1.0.6          | quality09 | Derivar cláusulas da relação produtor/consumidor; explicitar versões, ponto de observação e limite da evidência disponível.                              |
| [feature-decision-analysis](../../../skills/feature-decision-analysis/SKILL.md)                 | 1.2.5 → 1.2.6          | quality10 | Preservar fonte recuperável, quantificadores, exclusões e premissas aplicáveis ao resumir e retomar decisões.                                            |
| [feature-decomposition](../../../skills/feature-decomposition/SKILL.md)                         | 1.1.4 → 1.1.5          | quality11 | Conferir critérios aceitos independentemente da lista de recursos; separar dependências de implementação, integração, liberação e escrita compartilhada. |
| [feature-discovery](../../../skills/feature-discovery/SKILL.md)                                 | 1.1.4 → 1.1.5          | quality12 | Ler os artefatos citados, incorporar fatos já disponíveis e encaminhar perguntas capazes de distinguir explicações concorrentes.                         |
| [feature-engineering](../../../skills/feature-engineering/SKILL.md)                             | 1.1.6 → 1.1.7          | quality13 | Retomar pelo resultado realmente ausente, carregar fases sob demanda e integrar descobertas aos registros existentes sem repetir toda a análise.         |
| [feature-execution](../../../skills/feature-execution/SKILL.md)                                 | 1.1.4 → 1.1.5          | quality14 | Reconciliar plano desatualizado com o código conectado; distinguir sucesso de um componente da aceitação do caminho completo.                            |
| [feature-feasibility-experiment](../../../skills/feature-feasibility-experiment/SKILL.md)       | 1.0.4 → 1.0.5          | quality15 | Observar artefatos e resultados reais, controlar condições comparadas e impedir que um empate saturado seja descrito como equivalência.                  |
| [feature-implementation-plan](../../../skills/feature-implementation-plan/SKILL.md)             | 1.1.5 → 1.1.6          | quality16 | Diferenciar fonte de saída gerada, conferir comandos e seletores reais e entregar um próximo recurso executável com entradas identificadas.              |
| [feature-progress-tracking](../../../skills/feature-progress-tracking/SKILL.md)                 | 1.2.5 → 1.2.6          | quality17 | Reconciliar registros atuais, históricos e conflitantes por afirmação; reabrir somente o que perdeu suporte e indicar a próxima ação concreta.           |
| [feature-readiness-review](../../../skills/feature-readiness-review/SKILL.md)                   | 1.2.4 → 1.2.5          | quality18 | Abrir a evidência por trás de PASS/DONE, conferir obrigações aceitas e procurar um contraexemplo antes de declarar conclusão.                            |
| [feature-requirement-clarification](../../../skills/feature-requirement-clarification/SKILL.md) | 1.1.4 → 1.1.5          | quality19 | Perguntar conforme pré-requisitos resolvidos, recalcular a próxima rodada e aplicar respostas às cláusulas e critérios afetados.                         |
| [feature-risk-analysis](../../../skills/feature-risk-analysis/SKILL.md)                         | 1.2.4 → 1.2.5          | quality20 | Descobrir caminhos e testar o alcance de controles diante de chamadores alternativos; preservar probabilidade UNKNOWN quando falta evidência.            |
| [feature-scope-analysis](../../../skills/feature-scope-analysis/SKILL.md)                       | 1.1.4 → 1.1.5          | quality02 | Conferir compromissos aceitos contra a solução proposta e exigir evidência aplicável ao consumidor para capacidades reutilizadas.                        |
| [feature-solution-analysis](../../../skills/feature-solution-analysis/SKILL.md)                 | 1.1.4 → 1.1.5          | quality03 | Derivar opções dos pontos de extensão existentes e desafiar a premissa que sustenta a vantagem de cada mecanismo.                                        |
| [java-legacy-code-testing](../../../skills/java-legacy-code-testing/SKILL.md)                   | 1.1.4 → 1.1.5          | quality01 | Verificar também o construtor usado pelos chamadores originais; acrescentar um controle que rejeita sua substituição silenciosa por um stub.             |
| [java-test-design](../../../skills/java-test-design/SKILL.md)                                   | 1.0.4 → 1.0.5          | quality05 | Localizar o teste efetivamente executado e diagnosticar uma mutação sobrevivente pela seleção, fixture e oráculo antes de criar mais testes.             |
| [java-test-doubles](../../../skills/java-test-doubles/SKILL.md)                                 | 1.0.5 → 1.0.6          | quality08 | Escolher a substituição sem remover o comportamento alegado; comparar fake e implementação real com estado equivalente e contrato independente.          |
| [java-testing-strategy](../../../skills/java-testing-strategy/SKILL.md)                         | 1.0.5 → 1.0.6          | quality06 | Seguir o risco até as asserções e tarefas selecionadas; distinguir ordem de execução, inclusão de suite e resultado reutilizado do Gradle.               |
| [quality-gates](../../../skills/quality-gates/SKILL.md)                                         | 1.0.6 → 1.0.7          | quality09 | Seguir detector, execução e política efetiva da decisão protegida; separar detecção de defeito, propagação de falha e bloqueio real.                     |
| [requirements-and-acceptance](../../../skills/requirements-and-acceptance/SKILL.md)             | 1.1.5 → 1.1.6          | quality15 | Preservar condições da fonte e definir onde o consumidor observa o resultado; distinguir prazo descumprido de observação indisponível.                   |
| [tdd](../../../skills/tdd/SKILL.md)                                                             | 1.0.3 → 1.0.4          | quality04 | Ligar contrato, chamador e teste; distinguir falhas de compilação, descoberta, preparação e comportamento e verificar o mesmo cenário no green.          |

Foram preservados os contratos comuns dos artefatos, compatibilidade Java,
fronteiras entre skills, testes existentes e a possibilidade de reutilizar evidência
válida. A revisão não autorizou atualizar ferramentas ou dependências dos projetos
nos quais as skills serão usadas.

## Correção demonstrada no exemplo executável

O exemplo de `java-legacy-code-testing` verificava o caminho com dependência injetada,
mas permitia que o construtor original deixasse de adquirir `RateGateway` e usasse
um stub. O revisor executou a mesma alteração controlada nos estados inicial e revisado:

```java
// Alteração indevida usada como controle:
this(new RateGateway(), Clock.systemDefaultZone());
// substituída por:
this(id -> 1.0, Clock.systemDefaultZone());
```

| Verificação                                | Estado inicial desta rodada             | Estado revisado                                                                                                                        |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Variante que desvia o construtor original  | Exit 0; a alteração escapava            | Exit 1; `AssertionError: default constructor bypassed RateGateway`                                                                     |
| Exemplo correto e controles do `verify.sh` | Comparação acima executada pelo revisor | Coordenador executou o script final: exemplo correto, ID de apólice indevido e desvio do construtor produziram os resultados esperados |

Isso comprova uma melhora específica do verificador fornecido pela skill. Não
comprova superioridade geral do agente. Compilação com `--release 21`, execução em
Temurin 25.0.3; o caso é sintético, observa a falha de aquisição e não acessa banco real.

O revisor de `java-test-design` também executou os seis blocos existentes como uma
suite temporária: 8/8 passaram. Substituir a janela configurável por sete dias deixou
4/4 casos do seletor restrito verdes, mas fez o teste já existente de janela zero
falhar na suite completa (7/8). Após restaurar, 8/8 passaram. Esse resultado sustenta
a orientação sobre seleção de testes, sem representar ganho comportamental medido.
Foi usado `--release 17`, runtime 25.0.3 e dependências já disponíveis em cache.

Resultados e atribuição das verificações estão em
[coordinator-checks.json](coordinator-checks.json). Os checks Java relatados pelos
revisores não são apresentados como logs brutos retidos pelo coordenador.

## Execuções independentes de tarefas

Foram executados cinco casos em duas condições, uma execução por caso/condição:
dez atores novos, separados dos autores das mudanças. `assignment` contém a versão
que existia no início desta rodada, já com trabalho anterior; `candidate` contém a
revisão desta rodada. Não existe condição sem skill neste experimento.

Ambas receberam o catálogo completo em snapshots separados e a indicação explícita
da skill principal. As tarefas forneciam projetos, documentos e evidência comum de
trabalho; a rubrica ficou fora do diretório do ator. Cada ator podia ler arquivos,
editar quando solicitado e executar verificações. A restrição de acesso foi
procedimental, sem sandbox de filesystem. Modelo e configuração foram herdados;
o identificador exato do modelo e consumo de tokens não foram expostos.

Os casos vieram dos revisores após suas edições e foram congelados antes da
execução. São casos de desenvolvimento, não holdouts. Um avaliador separado recebeu
os artefatos e critérios, sem os rótulos de condição, para conferir o resultado.
Isso reduz dependência do autor da mudança, mas não elimina vazamento ou vieses do
processo. O coordenador também inspecionou os documentos, comparou hashes e executou
os testes e limites do pacote nos dois resultados de alteração de código.

| Caso                                                                     | Resultado observado na versão inicial                                                              | Resultado observado na revisada                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Autorização removida; exportação agendada usa armazenamento sem proteção | Localizou a exposição entre tenants e preservou o diagnóstico correto do caminho interativo        | Localizou a mesma exposição e preservou o diagnóstico do caminho interativo                                           |
| Mesma remoção, mas ambos os caminhos usam armazenamento protegido        | Não inventou defeito; confirmou os dois caminhos                                                   | Não inventou defeito; confirmou os dois caminhos                                                                      |
| Fonte alterada depois de um build aprovado                               | Recompilou, observou a falha, corrigiu o limite exclusivo e preservou alterações alheias           | Recompilou, observou a falha, corrigiu o limite e preservou alterações alheias; acrescentou teste do início inclusivo |
| Definição de expiração e resposta posterior do responsável               | Atualizou o documento, regras e critérios para escopo por Membership; manteve a falta de aprovação | Atualizou os mesmos elementos de forma coerente; manteve a falta de aprovação                                         |
| Registro DONE com teste de reinício ignorado                             | Manteve conclusão pendente e distinguiu falta de evidência de defeito comprovado                   | Manteve a mesma distinção e conclusão pendente                                                                        |

Avaliação independente concluída: os dez resultados satisfizeram todos os 32 critérios
congelados, cinco casos aprovados em cada condição. A justificativa por critério está
em [grading.json](grading.json). Estes resultados não mostram uma vantagem da revisão
nos desfechos selecionados. Uma repetição por condição em cinco
casos, com resultados já adequados no ponto inicial, não estabelece equivalência,
ausência de efeito ou ganho geral. Também não mede seleção automática de skills,
custo, latência, popularidade ou eficácia das outras 25 skills como entrada principal.

A comparação de definição exercitou também skills auxiliares; ela compara o conjunto
disponível em cada condição, sem isolar a contribuição de cada instrução. Os dois
atores produziram documentos extensos; não há evidência aqui de redução de burocracia
ou de tamanho de saída. Quantidade maior de checks não foi usada como nota de qualidade.

## Integração e preservação

O snapshot inicial registra HEAD, estado de trabalho e hashes anteriores. O diff
incremental separa esta rodada do trabalho já existente. Antes de gerar o índice,
nenhum arquivo anterior fora das 29 skills havia mudado, e nenhum havia sido removido.

A primeira execução de `npm run registry:build` encontrou uma referência nova de
`feature-requirement-clarification` a `collaborative-feature-definition` sem declaração.
O coordenador acrescentou `suggests` no manifesto; a segunda execução passou e gerou
305 entradas. Exatamente 29 entradas mudaram; as outras 276 ficaram iguais e nenhuma
foi removida. O manifesto foi corrigido depois dos snapshots de execução; o texto
de instruções testado permaneceu igual. Seleção e instalação desse encaminhamento
não foram avaliadas comportamentalmente.

Verificação final do repositório: `npm run verify`, exit 0. Passaram build, limites
de dependência dos sete pacotes, lint, formatação, consistência do índice, versões
e testes: 393 passes em 70 suites, zero falhas, cancelamentos, skips ou TODOs.
O [log completo](verify.log.txt) foi preservado. O verificador de versões comparou
as 276 versões mantidas com o índice em HEAD; as 29 selecionadas têm os aumentos
de patch registrados na tabela. Checks de empacotamento e CI não medem eficácia
comportamental das skills.

A auditoria após esses checks confirmou que todos os arquivos anteriores fora do
escopo foram preservados, sem remoções ou novas alterações inesperadas. Não houve
commit, publicação, instalação global no ambiente real do usuário ou alteração
da configuração real de agentes.

## Evidência preservada e limitações do procedimento

- [baseline.json](baseline.json): estado anterior, hashes e conteúdo inicial das 29 skills.
- [review-brief.md](review-brief.md): escopo e critérios comuns enviados aos revisores.
- [incremental.diff](incremental.diff): alterações desta rodada em relação à atribuição.
- [integration.json](integration.json): arquivos, hashes, versões, correção de integração e comparação do índice.
- [evaluation-cases.json](evaluation-cases.json): tarefas, fixtures, resposta controlada e critérios congelados.
- [prepare-evaluation.mjs](prepare-evaluation.mjs): preparação específica deste estudo; recusa sobrescrever condições existentes.
- [execution-manifest.json](execution-manifest.json): preparação executada, snapshots, condições e atores.
- [execution-artifacts.json](execution-artifacts.json): conteúdo textual exato dos resultados, traces e projetos finais; bytecode gerado tem apenas hash.
- [grading-input.json](grading-input.json): entrada do avaliador sem os rótulos de condição.
- [grading.json](grading.json): julgamento por critério, verificações independentes e limites da evidência.
- [coordinator-checks.json](coordinator-checks.json): inspeção, checks executados pelo coordenador e checks atribuídos aos revisores.

A preparação inicial do caso de prontidão esperava `SKIP` no reporter padrão do Node
e falhou nessa expectativa, embora o processo de testes tivesse exit 0. Foi corrigida
para TAP e executada novamente, com dois passes e um skip. Os primeiros diretórios
preparados foram preservados; os hashes de entrada foram reconstruídos dos fixtures
congelados e da evidência de preparação retida. O incidente está no manifesto.

No caso interativo inicial, a mesma resposta de produto foi repetida para retomar
um ator que havia encerrado sua primeira rodada; não foi acrescentada informação.
O conteúdo bruto dos traces é uma declaração de execução do respectivo ator;
checks próprios do coordenador e inspeções do avaliador são registrados separadamente.
O avaliador recebeu também um resumo dos checks do coordenador e manteve sua própria
inspeção. Confirmou hashes iguais antes/depois de suas verificações nos 236 arquivos
dos projetos e saídas. A execução Java usou bytecode já produzido pelos atores;
sem recompilação independente, sua correspondência ao fonte e os flags históricos
continuam limitados à evidência dos atores. O fonte foi inspecionado separadamente.
Os comandos históricos e falhas anteriores às correções não foram auditados por uma
gravação completa das ferramentas; os resultados atuais foram verificados novamente.

As fontes técnicas consultadas pelos revisores estão nas referências das skills,
com condições de versão quando relevantes. A revisão dos 29 pacotes e os testes de
integração não substituem uma avaliação comportamental individual de todo o catálogo.
