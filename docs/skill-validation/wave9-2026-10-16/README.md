# Onda 9 — retries-and-backoff

Data: 16/10/2026. **Concluída: correção técnica confirmada; nenhum ganho marginal
observado nas 24 sessões.**

Esta onda segue o piloto de `retries-and-backoff` do
[roadmap](../../skills-evolution-roadmap.md). O pacote passa de **1.1.4 para
1.1.5**, com uma correção localizada no exemplo Java. O `SKILL.md` principal
permanece byte a byte igual; o gerenciador de pacotes não foi alterado.

## Correção e evidência técnica

O exemplo anterior não representava ao mesmo tempo um efeito desconhecido e
um atraso recomendado pelo servidor: `Ambiguous` não carregava `advisedDelay`.
Reclassificar esse resultado como `Transient` podia perder a informação de que
uma tentativa anterior ainda poderia ter aplicado o efeito. A candidata mantém
as duas informações no resultado ambíguo e usa o atraso na admissão da próxima
tentativa. `Transient` fica reservado à evidência confiável de não aplicação
da tentativa atual. A referência de modos de falha inclui essa combinação.

O [handoff técnico](review/research-handoff.json) registra fontes primárias,
limites, hashes e mudanças. O texto de
[Retry-After no RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3)
fundamenta o conselho de espera; o modelo `Outcome` e a política local são escolhas
do exemplo. A
[AWS Builders' Library](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
explica por que timeout/falha não estabelece ausência de efeito.

O teste do trecho extraído reproduziu **9/11 casos passando na referência e
11/11 na candidata**. As duas falhas eram perda do conselho após resultado
ambíguo com replay seguro e tentativa admitida quando esse conselho não cabia
no prazo. O helper de jitter passou 16.000 amostras de limites/saturação e quatro
políticas inválidas em ambas as versões. Esses números são controles técnicos
do exemplo, não avaliações de agentes nem evidência de desempenho em produção.

O compilador e a VM disponíveis eram Temurin **25.0.3+9**. O helper foi compilado
com `--release 17`, e o laço conceitual com `--release 21`. Isso verifica a
compatibilidade de fonte/API declarada, sem estabelecer execução numa VM 17 ou 21. O harness usa relógio, orçamento, espera e adaptador simulados; não demonstra
durabilidade, cancelamento físico, garantia de um provedor ou controle de frota.

## Desenho congelado

São quatro tarefas autorais, três condições e duas repetições: **24 sessões
novas** com a mesma configuração herdada de modelo e esforço, sem overrides.
As condições são:

- dependências comuns: `idempotency` 1.2.5 e `timeouts-and-deadlines` 1.1.5;
- as mesmas dependências e `retries-and-backoff` 1.1.4;
- as mesmas dependências e `retries-and-backoff` 1.1.5.

Isso mede a contribuição marginal da skill sobre suas dependências declaradas.
A primeira condição não é uma condição sem skills. Não mede descoberta
automática, o efeito do catálogo completo, custo, tokens ou tempo de resolução.
A ordem das condições foi alternada entre casos e repetições; não foi uma
amostragem aleatória de tarefas reais. A fila tem até oito atores simultâneos.

| Caso | Trabalho solicitado                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| R1   | Reparar o executor quando o contrato não permite replay de efeito desconhecido.                            |
| R2   | O mesmo componente com replay seguro, preservando incerteza anterior e conselho do servidor.               |
| R3   | Reparar um planejador de retry com tempo monotônico, saturação, jitter e reserva.                          |
| R4   | Revisar máximos entre camadas, contadores, orçamento e a interpretação de timeout em um incidente autoral. |

R1/R2 pertencem à mesma família de implementação. Os casos são conhecidos,
criados para esta avaliação; R2 cobre também a combinação usada ao desenvolver
a correção. **Não constituem um conjunto de generalização mantido em segredo.**
Os contratos detalhados tornam o controle informado e podem limitar a capacidade
de distinguir benefício da skill; essa causa não foi isolada experimentalmente.

Os [critérios](criteria.frozen.json.txt),
[entradas e condições](actors.frozen.json.txt) e [hashes](freeze.json) foram
congelados antes dos atores. Os testes Java exigem `--release 17` e usam a VM
25.0.3. Todos os atores recebem o mesmo projeto e pedidos de entregáveis dentro
do caso. Os limites de leitura/escrita são procedimentais; não houve sandbox
de filesystem imposto pelo sistema operacional.

## Validação do avaliador

O [preflight final](preflight-sealed.json) aceitou oito controles corretos e
rejeitou vinte incorretos após compilação bem-sucedida, com falhas por asserção.
O [preflight de diagnóstico](preflight-diagnostic-reviewed.json) aceitou dois
formatos válidos e rejeitou três resultados incorretos. A revisão prospectiva
independente está em [criteria-review.json](review/criteria-review.json).

Antes de congelar, a preparação corrigiu um caso ausente de wrap assinado,
explicitou escolhas de política nos contratos, acrescentou retomada de estado
desconhecido e precisão acima de 2^53, e retirou restrições indevidas sobre
formato JSON, divisão da espera, ordem token/tempo e sinal de interrupção.
As variantes válidas incluem expressão modular equivalente, espera fracionada
e encerramento normal com o flag de interrupção preservado. As versões e
falhas anteriores dos preflights permanecem no registro. Nenhum resultado
de ator orientou esses ajustes.

O primeiro revisor concluiu o pacote e quatro julgamentos de calibração; sua
sessão terminou por limite de uso antes do parecer final sobre o avaliador.
Um segundo revisor concluiu essa revisão. As quatro decisões da calibração
coincidiram com os rótulos previamente separados. São controles autorais de
raciocínio, sem prova de execução ou de generalização.

## Resultados dos atores

O coordenador leu implementação, regressão, parecer, resultado e declarações
dos journals e [reexecutou os artefatos](rechecks.json) em cópias isoladas. Seus
[julgamentos](root-grades.frozen.json.txt) foram
[selados](root-grades-seal.json) antes da revisão textual independente.

| Caso                           | Dependências | + referência 1.1.4 | + candidata 1.1.5 |
| ------------------------------ | -----------: | -----------------: | ----------------: |
| R1 — replay inseguro           |          2/2 |                2/2 |               2/2 |
| R2 — replay seguro e incerteza |          2/2 |                2/2 |               2/2 |
| R3 — aritmética do planejador  |          2/2 |                2/2 |               2/2 |
| R4 — revisão do incidente      |          2/2 |                2/2 |               2/2 |
| **Total**                      |      **8/8** |            **8/8** |           **8/8** |

As **18 implementações Java** passaram nos probes congelados e nas regressões
entregues. Substituir apenas cada implementação pelo original defeituoso,
mantendo sua regressão final, produziu uma falha de asserção após compilação
bem-sucedida em **18/18**. Isso demonstra sensibilidade a esse original; não
afirma que cada regressão detecta todos os defeitos individualmente. Os probes
executaram 26 cenários por entrega R1/R2 e 532 por entrega R3. As seis entregas
R4 passaram nas cinco métricas numéricas e distinguiram previsão, observação,
incerteza e verificação futura. Nenhuma delas executou o experimento futuro
proposto. As contagens internas de cenários e asserções não aumentam o número
de sessões independentes.

O empate **não demonstra ganho marginal** da skill nesses exercícios. Também
não prova equivalência em tarefas reais nem ausência de utilidade. O controle
já recebeu duas skills relevantes, contratos explícitos e pedidos de regressão;
todos os grupos atingiram o teto deste instrumento. Não isolamos qual fator
explica esse resultado. A correção 1.1.5 se justifica pelo defeito reproduzido
no próprio exemplo, independentemente da comparação comportamental.

O segundo revisor acertou os quatro controles de calibração antes de receber
os pacotes dos atores. A revisão independente recebe implementação, parecer e
resultado com IDs substituídos e ordem permutada, sem condição, notas do
coordenador, logs, journals ou `Verification.java`. O texto pode revelar quais
skills foram carregadas: **o mascaramento é parcial**. Esse julgamento cobre
C2 e os aspectos textuais de C3/C4; não constitui outra reexecução de C1 nem
verificação independente da sensibilidade dos testes. O
[parecer independente](review/actor-grades.json) aceitou os 24 pacotes nos três
aspectos textuais. A [comparação dos julgamentos](grading-comparison.json)
registrou 72 concordâncias e nenhuma divergência nesse recorte. Isso não cria
72 experimentos: continuam sendo 24 sessões, com três critérios textuais cada.
As menções de contexto percebidas estão registradas por pacote. O revisor já
conhecia os contratos e havia participado da revisão do avaliador; não se trata
de uma avaliação externa sem contexto prévio. Os totais estão em
[result-summary.json](result-summary.json).

## Registro e reprodução

As pastas `actor-inputs/` e `actor-outputs/` preservam os arquivos de cada
sessão; `frozen/` contém os snapshots e critérios. O sufixo adicional `.txt`
protege os bytes originais de formatação automática. Para reproduzir uma
entrega, restaure os nomes sem esse último sufixo numa pasta temporária, com
`input/` e `output/` na disposição registrada em `actors.frozen.json.txt`.
Nos casos Java, execute `node run.mjs Verification` em `output/` com o JDK
disponível; as reexecuções registram separadamente compilação, stdout, stderr,
status e diretório. Os fontes dos probes e wrappers técnicos também foram
arquivados. Os helpers registram caminhos absolutos desta execução; ajuste
suas constantes de diretório ao restaurar os artefatos.

Notas de leitura iniciais de A01/A02 ainda mencionam uma reexecução pendente
naquele momento. Os campos C1/C3 e seus registros de reexecução contêm o
resultado posterior; o texto original selado foi preservado.

## Integração

O [índice foi regenerado](registry-build-result.json) com 305 skills depois de
todos os agentes encerrarem as escritas. O [npm run verify](verify-result.json)
passou: build, limites arquiteturais dos sete pacotes, lint, formatação, índice,
versões e **393 testes em 70 suítes**, sem falhas, cancelamentos ou skips. O
[log completo](verify.log.txt) registra os comandos e resultados. As 84 versões
comparadas ao índice commitado incluem as alterações anteriores do checkout;
esta onda incrementou somente `retries-and-backoff`.

A [conferência de preservação](preservation-final.json) comparou os **12.836
arquivos** rastreados ou não ignorados presentes no início. As únicas mudanças
nesses arquivos foram as duas referências e o manifest do pacote, o índice
gerado e o inventário. Os arquivos novos ficaram nesta pasta de relatório.
Nenhuma alteração preexistente fora desse escopo foi modificada; produtos de
build ignorados não integram essa comparação.

A [conferência de integridade](integrity-final.json) verifica **436 entradas
protegidas**, 46 snapshots congelados, os 24 pacotes mascarados, as saídas
arquivadas e o selo das notas do coordenador. O
[manifest de artefatos](artifact-manifest.json) registra os hashes dos arquivos
brutos, incluindo os logs. A formatação dos documentos de encerramento foi
conferida após consolidar os resultados. A falha inicial de importação ESM no
helper de formatação, corrigida antes de ele escrever arquivos, está nas
[notas operacionais](operational-notes.json); ela não afetou a skill, os critérios
congelados ou o resultado do `verify`.
