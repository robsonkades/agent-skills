# Comparação comportamental da onda 3

As três condições acertaram os dois casos: sem skill, `ambassador-pattern` 1.3.4
e revisão 1.3.5. **Não foi demonstrado ganho incremental nesta amostra**, nem pela
presença da skill nem pela revisão. Isso também não estabelece equivalência geral.

| Caso de desenvolvimento                                                          | Sem skill | Anterior | Revisada |
| -------------------------------------------------------------------------------- | --------- | -------- | -------- |
| Servidor envia a primeira mensagem; conexão upstream depende de bytes do cliente | Passou    | Passou   | Passou   |
| Cliente envia a primeira mensagem; conexão adiada já satisfaz o contrato         | Passou    | Passou   | Passou   |

Foram seis agentes em sessões novas, um por condição/caso, com o mesmo modelo e
esforço herdados, sem override. O identificador exato de runtime do modelo não
está disponível. No primeiro caso, todos mudaram somente `connect_start` para
`immediate`; no segundo, todos preservaram o arquivo de política byte a byte.
Todos corrigiram a conclusão que confundia aceitação TCP com handshake completo
e rejeitaram aumentar um timeout sem evidência de que isso resolveria a causa.

O protocolo foi a única diferença entre os dois conjuntos de artefatos comuns.
Os pacotes completos foram fornecidos nas condições com skill. Tarefa, entradas,
versões e critérios foram congelados antes do despacho; os hashes dos critérios
e do manifesto bruto foram conferidos após a execução. A cópia `.json` pode
receber formatação; seu conteúdo deve continuar idêntico ao snapshot `.txt`.
O coordenador julgou os
artefatos pelos cinco critérios previamente definidos para cada caso, inspecionou
os scripts e executou uma cópia de cada verificador em diretório separado.
As seis reexecuções terminaram com exit 0, preservando as saídas originais.

Os controles locais usaram Node 25.6.1, sockets de loopback, os módulos de cliente
e servidor fornecidos e modelos pequenos do contrato do adapter. No caso em que
o servidor fala primeiro, todos mantiveram o controle que aceita TCP mas não
abre upstream e o controle que conclui `HELLO/PING/PONG`. Os verificadores da
condição revisada executaram quatro combinações de protocolo/modo, enquanto os
demais executaram de uma a três. Essa amplitude não era uma dimensão de pontuação
predefinida e não foi contabilizada como ganho.

São dois casos de desenvolvimento conhecidos pelo revisor, de uma única skill,
sem holdout ou repetições para estimar variabilidade. As 30 decisões de critérios
pertencem a seis execuções em dois casos; não são 30 avaliações independentes.
O julgamento foi feito pelo coordenador, sem cegamento. Não foram medidos tokens,
custo, seleção automática de skills ou qualidade do restante do catálogo.

O isolamento foi por diretórios e instruções. Os agentes declararam não ter
acessado critérios, outras execuções ou conteúdo externo proibido, mas não houve
isolamento imposto pelo filesystem nem registro independente completo de leituras.
O uso efetivo das referências também variou: agentes com a revisão leram a
referência já existente de casos de validação; os agentes com a versão anterior
não a leram. Não houve teste de Envoy, MySQL, TLS ou implantação real. Os tempos
locais não são benchmark de latência ou evidência de confiabilidade operacional.

Evidências reproduzíveis: [manifesto congelado](behavior-manifest.frozen.json.txt),
[hashes anteriores ao despacho](behavior-freeze.json),
[julgamento por critério](behavior-results.json),
[reexecuções técnicas](behavior-technical-checks.json) e
[inventário das entradas e saídas arquivadas](behavior-artifact-manifest.json).
As cópias brutas têm sufixo `.txt` para preservar os bytes; o inventário registra
o nome original e SHA-256 de cada arquivo.
