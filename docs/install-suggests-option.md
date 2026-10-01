# Instalação opcional de sugestões

`--with-suggests` inclui somente sugestões diretas das skills solicitadas, conforme
o alcance escolhido para esta implementação. A revisão de metadados está em
[Auditoria de suggests](skill-validation/suggests-review-2026-09-30.md).

## Uso e alcance

A flag está disponível em `install` e em `update` com nomes explícitos. Sem a flag,
as sugestões continuam informativas.

Exemplos:

```sh
agent-skills install java-ddd --with-suggests --project --dry-run
agent-skills install java-ddd --with-suggests --project
agent-skills update java-ddd --with-suggests --project --dry-run
agent-skills update java-ddd --with-suggests --project
```

`install A --with-suggests` inclui A, as sugestões declaradas pela versão selecionada
de A e as dependências obrigatórias/opcionais disponíveis desse conjunto. Não percorre
as sugestões dos pacotes incluídos, nem as sugestões das dependências de A.

Se A sugere B e B sugere C, entram A e B, além de suas dependências. C só entra se for
também solicitado, sugestão direta de outra raiz solicitada ou dependência real.
Se B depende de A, isso não transforma o vínculo A sugere B em ciclo de dependências.

Para vários nomes, a seleção é a união das sugestões diretas de cada nome originalmente
solicitado. Duplicatas são resolvidas uma vez, preservando todas as origens relevantes.
Uma skill solicitada explicitamente mantém essa classificação mesmo quando também
aparece como sugestão de outra.

### Update e persistência

`update A --with-suggests` usa as sugestões da **versão de A escolhida para atualização**,
e pode acrescentar pacotes mesmo quando a versão de A não muda.

**Nomes são obrigatórios com a flag no update.** `update --with-suggests`, sem nomes,
retorna erro de uso (exit code 2) com exemplo
`agent-skills update <skill> --with-suggests`. A combinação
`install A --with-suggests --no-deps` também retorna erro de uso: incluir sugestões
inclui seus pré-requisitos.

A implementação atual considera todos os pacotes gerenciados como alvos de um update
sem nomes. Isso inclui dependências e sugestões previamente instaladas. Expandir as
sugestões desses alvos em execuções sucessivas acabaria percorrendo o catálogo por
etapas, contrariando o alcance direto escolhido. O lockfile e os receipts atuais não
registram quais pacotes foram pedidos originalmente pelo usuário.

A opção vale para a invocação, sem preferência persistida:

- As sugestões instaladas tornam-se pacotes gerenciados e participam do `update`
  normal, sem nomes, como os demais.
- Um `update A` sem a flag não descobre novas sugestões de A nem atualiza B só
  porque A o sugere.
- Remover A não remove automaticamente seus antigos sugeridos. Dependências
  reais e proteções existentes continuam valendo.
- Notificações interativas continuam atualizando apenas o conjunto aprovado; não
  ligam a flag implicitamente.

Persistir a preferência para cada raiz seria outra funcionalidade: exigiria identidade
durável de raízes, origem de sugestões, política de esquecimento e migração entre
receipts globais, lockfiles de projeto, atualizações e remoções. Não é necessário
para esta opção.

## Integração no código existente

A implementação segue [ARCHITECTURE.md](../ARCHITECTURE.md) e
[DESIGN.md](../DESIGN.md), compartilhando o fluxo existente de instalação.

| Local                                                                                                   | Responsabilidade                                                                                   |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [CLI](../packages/cli/src/cli.ts)                                                                       | Declarar `--with-suggests` nos dois comandos.                                                      |
| [Comando install](../packages/cli/src/commands/install.ts)                                              | Passar a opção e mostrar origem sugerida sem tratá-la como dependência.                            |
| [Comandos de ciclo de vida](../packages/cli/src/commands/lifecycle.ts)                                  | Passar a opção no update e mostrar adições no texto e JSON.                                        |
| [InstallSkills](../packages/core/src/application/install-skills.ts)                                     | Expandir sugestões na preparação da resolução e produzir proveniência para apresentação.           |
| [UpdateSkills](../packages/core/src/application/update-skills.ts)                                       | Validar nomes explícitos, preservar política de versões e informar pacotes novos.                  |
| [Resolver](../packages/core/src/domain/resolver.ts)                                                     | Reutilizar a resolução de múltiplas raízes; manter apenas dependências reais como arestas.         |
| [Lockfile](../packages/core/src/domain/lockfile.ts) e [receipt](../packages/core/src/domain/receipt.ts) | Gravar pacotes pelas estruturas existentes; não fabricar dependências nem persistir a preferência. |

As opções de aplicação e comando recebem `withSuggests?: boolean`. A política comum
de expansão fica em [resolve-suggestions.ts](../packages/core/src/application/resolve-suggestions.ts)
e é compartilhada pelos dois comandos. O resolver
continua responsável pelas dependências; os adapters continuam responsáveis pelo
layout de cada agente.

O fluxo:

1. Validar as opções antes de qualquer instalação, rejeitando update sem nomes e
   a combinação `--with-suggests --no-deps`.
2. Resolver as referências originais com ranges, registries e pins de versão
   aplicáveis, usando o fluxo existente.
3. Ler `manifest.suggests` somente das raízes originais efetivamente selecionadas.
   Manter o conjunto de nomes originais separado de `ResolvedSkill.direct`.
4. Deduplicar e resolver os companheiros junto com as raízes originais, fixando
   **versão e registry selecionados dessas raízes** durante essa expansão.
   Assim, uma dependência adicionada não troca a versão da raiz e deixa para trás
   sugestões de um manifesto que já não corresponde ao pacote escolhido.
5. Resolver o conjunto inteiro antes de começar a instalação. Não converter
   `suggests` em `dependencies` ou `optionalDependencies`.
6. Entregar o plano ao mesmo pipeline de fetch, integridade, validação, compatibilidade,
   projeção e `AtomicInstaller`. Escopo, agentes e proteções de arquivos modificados
   continuam nas implementações existentes.

Fixar as raízes implica reportar um conflito introduzido pelo conjunto sugerido,
em vez de procurar automaticamente outra versão da raiz. É compatível com a ausência
de backtracking do resolver atual. O erro inclui o contexto das sugestões e suas origens.

### Versões e registries

Como `suggests` contém nomes sem ranges, um novo sugerido usa a seleção normal do
registry configurado. Pins de versão de projeto continuam sendo respeitados para
nomes sem versão explícita.

No update, sugeridos já instalados recebem a mesma política de major dos
outros alvos: `^versão-instalada`, ou `latest` quando `--major` for explícito.
Essa informação vem do mapa de instalações coletado por `UpdateSkills`. Em múltiplos
agentes, permanece a política de seleção do update.

Uma raiz `company:A` não qualifica automaticamente seus sugeridos para o registry
company; esses nomes seguem a federação ou `--registry` conforme o contrato atual.

**Limite existente identificado:** o lockfile armazena registry, mas
`pinsFrom` em [workspace.ts](../packages/core/src/application/workspace.ts) transmite
somente versões à resolução comum. A expansão não altera essa limitação de install/update:
armazenar a origem não significa que a resolução comum já a aplique integralmente.
Corrigir esse contrato exige uma decisão e teste próprios.
Fixar a origem escolhida na expansão desta invocação é uma garantia distinta.

### Ausência, erros e apresentação

Ao usar a flag, o usuário pede a inclusão dos nomes sugeridos. Um nome inexistente
ou uma restrição incompatível falha na resolução, com contexto da sugestão no erro,
antes de escrever instalações. Erros de registry, integridade e validação continuam
sendo erros; não são convertidos em sucesso parcial silencioso.

Dependências opcionais continuam com a semântica existente. Os sugeridos selecionados
não são representados como `optionalDependencies`.

O plano distingue solicitados, sugeridos e dependências. O campo aditivo
`suggestedBy` no relatório apresenta a origem sem alterar
`requiredBy`, `receipt.dependencyOf` ou `lockfile.dependencies`, que representam
vínculos reais de dependência. `direct` identifica os nomes explicitamente solicitados.

O relatório do update representa adições explicitamente, incluindo nome, versão,
origem, destinos e resultado, tanto no texto quanto no JSON. Uma atualização que
somente acrescente sugestões mostra essas adições, mesmo sem mudança de versão
das skills solicitadas. Adições também incluem novos destinos de uma skill já
gerenciada por outro agente. Um pacote incompatível ou sem destino para o agente
aparece como ignorado, sem ser apresentado como instalado. As mudanças de versão
no JSON incluem origem, destinos e indicação de omissão, preservando seus campos anteriores.

`--dry-run` mostra o mesmo conjunto e os mesmos motivos da execução real, sem
gravar instalações, receipts ou lockfile. Cache/staging seguem as garantias atuais.
O instalador oferece atomicidade por pacote, não uma transação única de todo o comando;
pacotes já concluídos não são revertidos em conjunto se um pacote posterior falhar.

## Simulação anterior à implementação

A [simulação por skill](skill-validation/suggests-installation-2026-09-30.json) usa o
resolver real com manifestos em memória. Foi realizada durante a análise do catálogo
de 2026-09-30, antes da implementação da flag. Não executa comandos da flag nem
instala em configurações reais; os números abaixo são esse registro histórico.

| Skill solicitada               | Sem sugestões | Com sugestões diretas e suas dependências |
| ------------------------------ | ------------- | ----------------------------------------- |
| java-ddd                       | 8             | 38                                        |
| java-ddd-aggregates            | 1             | 5                                         |
| java-ddd-value-objects         | 1             | 7                                         |
| spring-boot                    | 7             | 46                                        |
| spring-boot-clean-architecture | 1             | 57                                        |
| microservices-architecture     | 31            | 127                                       |
| clean-delivery-workflow        | 172           | 173                                       |
| java-performance               | 127           | 169                                       |

As 305 expansões diretas foram resolvidas sem conflitos no catálogo analisado, que expunha
uma versão por pacote. Isso não prova todos os cenários com múltiplas versões,
registries externos ou locks antigos.

Foram encontradas 299 sugestões cujo destino já tinha um caminho de dependência de volta à origem.
Elas são válidas como sugestões, mas mostram por que convertê-las em arestas do
grafo obrigatório seria incorreto. Uma travessia indiscriminada de todos os vínculos
a partir de `java-ddd` alcançaria 293 pacotes, reforçando o alcance direto escolhido.

## Contrato de validação

Os cenários abaixo definem a cobertura necessária. A simulação histórica acima não
substitui os testes de aplicação e CLI, e este documento não registra uma execução
da suíte:

- Sem flag, preservar o comportamento existente; com flag, incluir apenas sugestões
  das raízes originais, suas dependências e deduplicar nomes.
- A sugere B e B sugere A; B depende de A; pacote sugerido compartilhado entre raízes;
  ciclo real de dependências continua falhando.
- Escolher sugestões da versão efetivamente selecionada; congelar as raízes na
  expansão; reportar conflito ou sugerido inexistente antes de instalar.
- Preservar ranges e registries explícitos, pins de versão de projeto e a política
  de major do update para companheiros já instalados.
- Rejeitar update com flag sem nomes e a combinação com `--no-deps`, com erro de uso
  e orientação concreta.
- Mostrar adições em updates sem mudança de versão principal, no texto, no JSON e
  no dry-run; não afirmar instalação quando houve skip de compatibilidade/destino.
- Garantir que update normal posterior não descubra sugestões novas implicitamente;
  notificações continuam respeitando o conjunto aprovado.
- Exercitar payload sugerido hostil e arquivo instalado modificado pelo usuário no
  pipeline existente, preservando proteção, escopo e seleção de agentes.
- Reutilizar [o helper hermético do CLI](../packages/cli/test/cli.test.ts) e os
  fakes do core; isolar HOME, USERPROFILE e diretórios dos agentes. Nenhum teste pode
  escrever na configuração real.

A implementação mantém o schema atual de manifestos, lockfiles e receipts e os
contratos públicos de erro. O JSON recebe campos aditivos para explicar sugestões
e adições. A verificação de entrega usa os testes focados e `npm run verify`.
