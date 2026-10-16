# Comparação comportamental da onda 4

**Nenhum ganho incremental foi observado nesta amostra.** Sem skill, com a versão anterior e com a versão revisada, os agentes acertaram os dois casos de `component-and-release-boundaries`. A correção documental tem evidência própria, mas o acerto de todos os grupos não demonstra que ela melhorou o comportamento do agente.

## Desenho e resultado

Seis agentes novos, sem histórico herdado, receberam dois casos de desenvolvimento: uma aplicação que incorpora a biblioteca no bundle e uma que a seleciona externamente ao iniciar o processo. Cada caso foi executado uma vez sem skill, com a versão 1.2.4 e com a versão 1.2.5. O código, a proposta de atualização e o contrato de entrega eram iguais; a configuração efetiva de distribuição era a diferença decisiva entre os casos.

Os agentes deveriam avaliar a proposta de unificar versões e calendários, determinar o trabalho necessário para adotar a correção e verificar comportamento e recuperação. Os critérios foram congelados antes dos despachos: inspecionar a distribuição efetiva; distinguir publicação, compilação, empacotamento e adoção; verificar a correção e a recuperação; e não inferir uma entrega simultânea apenas do prazo de adoção.

| Condição        | Bundle | Dependência externa | Critérios satisfeitos |
| --------------- | ------ | ------------------- | --------------------- |
| Sem skill       | Acerto | Acerto              | 8/8                   |
| Anterior, 1.2.4 | Acerto | Acerto              | 8/8                   |
| Revisada, 1.2.5 | Acerto | Acerto              | 8/8                   |

Nos casos de bundle, os agentes produziram uma nova distribuição mantendo o bytecode do consumidor. Nos casos externos, preservaram o JAR da aplicação e selecionaram a nova biblioteca para novos processos. Os seis preservaram a separação dos responsáveis e reconheceram a janela de coexistência e os limites da recuperação. O [julgamento manual](behavior-results.json) contém a justificativa por critério e os caminhos das respostas completas.

## Verificação dos artefatos

O coordenador leu as seis respostas e executou 30 verificações adicionais sobre os artefatos efetivamente produzidos: comportamento antigo, falha esperada do antigo para o novo requisito, candidato corrigido, rejeição do resultado antigo pelo candidato e recuperação. Todas tiveram o resultado esperado, incluindo os controles negativos. Entradas e saídas foram preservadas por hash. [Comandos e saídas completos](behavior-technical-checks.json).

Houve uma chamada inicial inválida a `javap --version` no segundo agente, seguida da chamada correta. O primeiro leitor do coordenador assumiu um nome uniforme para o campo de comandos e falhou antes de executar Java; foi corrigido para aceitar os dois formatos. Esses episódios estão preservados nos registros, inclusive nas [falhas do coordenador](coordinator-failures.json). Nenhum critério, entrada, snapshot da skill ou resposta foi alterado em função dos resultados.

## Limites

- São dois casos conhecidos de desenvolvimento, sem holdout, e uma execução por condição e caso. Não há estimativa de variância nem conclusão de equivalência geral.
- O julgamento manual do coordenador não foi cego nem teve segundo avaliador independente. A rubrica comum foi fixada antes das execuções.
- Os agentes receberam os mesmos recursos e permissões, sem override explícito de modelo ou esforço. Identidade exata do modelo em runtime, custo e tokens não foram observáveis.
- Os limites de leitura foram instruídos, sem sandbox por caso. Metadados do catálogo podem continuar disponíveis no contexto. A [auditoria de exposição](behavior-exposure.json) distingue leituras registradas de confirmações posteriores dos agentes, sem nova leitura ou mudança de resposta.
- As fontes foram compiladas para Java 17 e executadas no Temurin 25.0.3; isso não testa uma JVM 17. Não houve Maven/Gradle, produção, rollout real, benchmark ou avaliação de descoberta automática da skill.
- Os registros históricos de comandos foram escritos pelos agentes. As 30 verificações do coordenador corroboram os artefatos atuais, sem provar todos os detalhes históricos de execução.

O resultado sustenta manter separadas duas conclusões: foram corrigidas orientações tecnicamente imprecisas; o ganho comportamental dessa correção ainda não foi demonstrado. A amostra não explica a popularidade de outras skills nem permite declarar superioridade do catálogo.

## Reprodução e rastreabilidade

O [manifesto congelado](behavior-manifest.frozen.json.txt), o [registro de congelamento](behavior-freeze.json) e os [despachos](behavior-dispatch.json) identificam entradas, critérios, versões e agentes. O [manifesto de artefatos](behavior-artifact-manifest.json) aponta para 461 cópias de entradas e saídas com hashes, inclusive pequenos JARs/classes do próprio projeto. O sufixo `.txt` foi acrescentado sem converter os bytes; remova-o para restaurar a extensão original. Não foram incorporadas dependências binárias de terceiros.
