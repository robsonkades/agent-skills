# Onda 6 — piloto de eficácia de java-memory-model

Data: 16/10/2026. **Onda concluída no escopo delimitado abaixo.** A comparação terminou: **36 tentativas, com empate entre ausência da skill, versão 1.3.5 e versão 1.3.6**. Não houve ganho comportamental observado nos critérios definidos. Uma qualificação técnica de DCL foi aplicada separadamente na versão 1.3.7; essa revisão posterior não foi uma condição do experimento.

Após a cobertura de revisão individual das 305 skills nas ondas anteriores, esta onda aprofunda a evidência de uso de uma skill do piloto. Não conclui o desenho de 12 tarefas/108 execuções proposto no roadmap nem permite extrapolar eficácia para o catálogo.

## Resultado e alcance

Cada tentativa recebeu quatro avaliações: decisão adequada; caminho do código e garantia normativa; proporcionalidade da evidência; preservação do contrato. A aprovação exige as quatro. As respostas foram lidas semanticamente: termos ou classificações equivalentes não foram rejeitados por diferença de vocabulário.

| Condição             | Versão | Tentativas aprovadas | Casos conhecidos | Projetos novos reservados da autoria de 1.3.6 |
| -------------------- | ------ | -------------------- | ---------------- | --------------------------------------------- |
| Sem carregar a skill | —      | 12/12                | 4/4              | 8/8                                           |
| Snapshot anterior    | 1.3.5  | 12/12                | 4/4              | 8/8                                           |
| Snapshot da onda 5   | 1.3.6  | 12/12                | 4/4              | 8/8                                           |

As 144 notas correspondem a quatro critérios sobre 36 tentativas; não são 144 execuções independentes. O coordenador congelou sua avaliação antes de ler as notas independentes. O revisor, sem o mapa de condições e repetições, concordou nas 144 notas, sem falha material identificada. O mascaramento foi parcial: o próprio texto podia revelar leitura da skill. A avaliação independente cobriu a prova e as alegações textuais; o coordenador conferiu separadamente hashes e registros de execução. [Resultados por tentativa](results.json), [notas congeladas](coordinator-grades.frozen.json.txt), [reconciliação e escopo](reconciliation.json).

O resultado não demonstra equivalência, inutilidade ou eficácia geral. Uma hipótese compatível com o empate é que conhecimento prévio, acesso à documentação e contratos detalhados já bastaram para esses casos; esse mecanismo não foi isolado. Não se mediram custo, qualidade de ativação automática ou benefício em uma tarefa de produção. Mais texto correto na skill não foi tratado como prova de ganho.

## Desenho congelado

Foram seis tarefas, três condições e duas repetições, em sessões novas, sem histórico da coordenação. A ordem foi rotacionada antes dos resultados. Os snapshots 1.3.5 e 1.3.6 permaneceram imutáveis. Os dois têm o mesmo `SKILL.md`; a mudança avaliada estava no parágrafo de uma referência e no manifesto.

| Caso | Decisão examinada e expectativa                                                                                                                | Exposição anterior                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| D1   | Memo opcional: acesso por final protege o estado inicial alcançado; misses indefinidos são aceitos. Contrato sustentado.                       | Fixture de desenvolvimento da onda 5.        |
| D2   | Mesmo memo, mas a fábrica seleciona o alias comum sem a garantia necessária. Contrato violado; smoke sequencial não reproduz a corrida.        | Fixture de desenvolvimento da onda 5.        |
| H1   | DCL com local capturado, recheck no mesmo monitor, estado observado coberto por final e ciclo único delimitado. Contrato sustentado.           | Projeto novo, reservado da autoria de 1.3.6. |
| H2   | `join` temporizado seguido de `DONE` incondicional, com worker ainda vivo. Contrato violado; manter espera limitada e detectar término.        | Projeto novo.                                |
| H3   | Relay volatile com handoff upstream ausente do contrato. Garantia de produção não resolvida; pedir evidência discriminante.                    | Projeto novo.                                |
| H4   | Campo final retém array que o produtor pode reciclar após a construção. Captura contratada violada; separar o estado retido do buffer externo. | Projeto novo.                                |

D1/D2 formam um par, com apenas o arquivo da fábrica diferente; não são problemas independentes. H1 também examina inicialização. Seis tarefas não representam todo o domínio. H2 foi julgado no ciclo normal congelado, sem impor um redesenho de cancelamento. H3 admite uma resposta que rejeite a garantia genérica e mantenha desconhecida a integração ausente, independentemente do rótulo escolhido.

O revisor examinou expectativas e fixtures antes do congelamento. Ajustes de interpretação ficaram registrados antes de qualquer ator: distinção entre garantia genérica e produção em H3, aceitação de artefatos de compilação e remédios equivalentes em H4. Seis respostas de calibração escritas pelo coordenador incluíram três controles aceitáveis e três com falhas deliberadas; o revisor distinguiu os seis. Esses controles não entram nas 36 tentativas. [Critérios](criteria.json), [bytes congelados](criteria.frozen.json.txt), [congelamento](freeze.json), [revisão prévia](review/criteria-review.json.txt), [calibração](calibration-result.json), [alocação dos atores](actors.json).

## Execução e preservação

Os seis projetos compilaram para Java SE25 no Temurin 25.0.3, sem preview ou dependências externas. D1, D2, H1 e H3 têm smokes sequenciais que passam. H2 registra `DONE:0` enquanto o worker continua vivo; H4 registra checksum 30 virar 300 após reciclagem. Os dois demonstradores terminam normalmente: exit 0 não significa contrato satisfeito. [Preflight](case-preflight.json).

Todas as 36 tentativas entregaram revisão, decisão estruturada e registro de execução, sem timeout de tentativa. Nas 24 tentativas com skill, os atores declararam leitura integral do corpo e das duas referências; nas 12 sem skill, não declararam essa leitura. Os hashes dos inputs e dos arquivos originais nas cópias de trabalho foram preservados. A extração de comandos respeita os formatos diferentes dos registros; um campo de resumo vazio não substitui o log bruto. [Progresso final](progress.json), [auditoria de execução](execution-audit.json), [registros de leitura e comandos](journal-audit.json).

Os registros são produzidos pelos próprios atores, não uma exportação completa e independente dos eventos das ferramentas. Hashes atestam identidade e preservação dos arquivos, não atenção do modelo ou isolamento de leitura imposto pelo sistema operacional. A separação de sessões e diretórios foi procedural; metadados globais da plataforma podem permanecer. O tratamento foi carregado explicitamente, sem testar seleção automática, memória persistente, composição com skills vizinhas ou diferentes clientes.

Eventos preservados, sem convertê-los em falhas semânticas:

- `run-20`: comparação auxiliar de hashes falhou inicialmente por separadores de caminho; a correção e a repetição foram registradas.
- `run-22`, `run-32` e `run-36`: consultas complementares à web não retornaram conteúdo útil; havia seções primárias utilizáveis obtidas nas demais consultas.
- `run-17`, `run-35` e `run-36`: controles adicionais de H4 rejeitaram o comportamento original com exit 1 esperado. Candidatos isolados foram exercitados em `run-17` e `run-36`; `run-35` não executou correção. Os arquivos originais do projeto permaneceram intactos.

As tentativas herdaram modelo e esforço da sessão, sem override. Identificador exato do modelo e cobrança de tokens não estavam expostos; não há alegação de economia ou velocidade. Os horários de despacho são limites observados pelo coordenador, não timestamps exatos de início de cada ator. O teto foi 18 atores simultâneos, oito minutos por tentativa e 30 segundos por subprocesso. O segundo lote começou antes de terminar o último ator do primeiro, sem ultrapassar o teto. [Despachos](dispatch.json).

## Correção técnica posterior: 1.3.7

A frase que tornava `volatile` universalmente obrigatório em DCL era mais forte que a garantia demonstrada pelo exemplo. A revisão preserva o exemplo volatile como padrão e exige prova separada para a exceção: holder e lock compartilhados com segurança; construção concluída sem escape; estado efetivamente lido coberto por finals ou suas cadeias de desreferência; local capturado; recheck pelo mesmo monitor; ciclo único sem reset ou invalidação e sem mutação posterior. A regra é sustentada pela [JLS SE25 §17.5.1](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.5.1), com corroboração pelo [exemplo imutável de CERT LCK10-J](https://cmu-sei.github.io/secure-coding-standards/sei-cert-oracle-coding-standard-for-java/rules/locking-lck/lck10-j/#compliant-solution-immutable).

A alteração pertence a `references/happens-before.md`, acompanhada do bump 1.3.6 → 1.3.7. O corpo da skill, o checklist e a correção da onda 5 foram preservados. Não foi estabelecida necessidade de uma reescrita mais ampla. O relatório de pesquisa anterior conserva seu status histórico de fase sem autorização de escrita; o handoff de implementação posterior registra o encerramento dessa fase. [Pesquisa](review/research-handoff.md.txt), [implementação e checks locais](review/implementation-handoff.json.txt).

**1.3.7 não foi avaliada nas 36 tentativas.** H1 passou a ser material conhecido de desenvolvimento dessa qualificação e não pode ser apresentado como novo holdout para medi-la.

## Validação de encerramento

Após o encerramento das escritas de todos os atores e do revisor, o coordenador executou:

- `npm run registry:build`: passou, com 305 skills. A comparação com o índice capturado no início encontrou somente `java-memory-model` alterada para 1.3.7. [Registro](registry-build-result.json).
- `npm run verify`: passou na primeira execução. Build, limites arquiteturais dos sete pacotes, lint, formatação, registry e versões passaram; **393 testes em 70 suítes, 393 aprovados, zero falhas, cancelamentos ou testes ignorados**. [Resultado](verify-result.json), [log completo](verify.log.txt).
- Auditoria de preservação: dos 9.560 arquivos existentes no início, 9.556 permaneceram byte a byte iguais. Os quatro alterados foram a referência de DCL, seu manifesto, o índice gerado e o ponteiro no inventário. Novos arquivos ficaram restritos a este dossiê. [Preservação](preservation-final.json).
- Auditoria de integridade: 648 arquivos protegidos dos atores, snapshots, critérios e notas congeladas conferidos; cópias brutas e resultados reconciliados mantiveram identidade. A alteração final do pacote corresponde aos hashes do handoff e preserva a correção da onda 5. [Auditoria final](integrity-final.json).

Os checks locais do revisor incluíram validação estrita da skill com diretórios de configuração isolados, Prettier dos quatro arquivos, links e atribuição do diff. Não houve instalação na configuração real dos agentes, publicação ou commit. O código do gerenciador não foi modificado nesta onda.

O [manifesto dos artefatos](artifact-manifest.json) registra hashes e caminhos dos textos autorais preservados. Binários de compilação e documentos completos de terceiros ficam apenas referenciados por hash, sem cópia no repositório. Os arquivos `.txt` preservam bytes originais; os JSON canônicos podem ter apenas formatação normalizada, conferida contra a cópia congelada.
