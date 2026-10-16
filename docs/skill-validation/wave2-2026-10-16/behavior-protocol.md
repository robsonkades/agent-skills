# Comparação comportamental da onda 2

Protocolo preparado antes das execuções. Resultados ainda pendentes.

## Pergunta e limites

Comparar decisões e alterações reais de artefatos em seis casos de desenvolvimento,
com três condições: sem skill, pacote original do início da onda e pacote revisado.
Os casos cobrem `concurrency-testing`, `consistent-hashing` e `capacity-planning`,
com uma mudança de condição relevante em cada par. Não constituem amostra
representativa das 138 skills. Não avaliam seleção automática, popularidade,
produção, custo total de tokens ou memória entre sessões.

Os autores conhecem esses casos e seus mecanismos também aparecem nas referências.
São verificações de regressão e comparações em exemplos conhecidos, não holdouts.
As expectativas serão preservadas fora dos diretórios fornecidos aos atores antes
de iniciar qualquer execução. Não serão ajustadas para acomodar as respostas.

## Condições de execução

- Uma conversa nova por caso e condição, com o mesmo modelo e esforço herdados.
- Mesmo pedido, artefatos, versões, ferramentas e autorização nos três tratamentos.
- Original obtido de `baseline.json`; revisado copiado depois da revisão do diff.
  Cada tratamento com skill recebe o pacote completo, incluindo referências.
- Diretório temporário próprio por ator; nenhum resultado anterior fornecido.
- Sem instalações, alterações de configuração real, publicação ou acesso a produção.
- Os atores podem ler os arquivos do caso, os recursos fornecidos, o toolchain e
  bibliotecas locais declarados; fontes públicas primárias permanecem disponíveis.
- A separação de diretórios é procedimental, não um sandbox de leitura. Registrar
  qualquer exposição observada a outro tratamento, rubrica ou resultado. Essa
  limitação impede alegar isolamento tecnicamente imposto.
- Executar e inspecionar as alterações, não apenas avaliar a resposta final.
  Preservar comandos, saídas e artefatos; distinguir declaração do ator de
  verificação independente do coordenador.

## Casos e decisões observáveis

| Caso | Artefato solicitado                                                  | Condição decisiva                                                                   |
| ---- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| C1   | Melhorar testes de uma conta concorrente                             | Recusa permitida apenas por saldo insuficiente                                      |
| C2   | Mesmo objetivo de testes                                             | Recusa por contenção também é permitida; sucesso sem contenção continua obrigatório |
| C3   | Verificar compatibilidade do roteador e atualizar parecer de rollout | Prefixo de chave mudou no cliente selecionado                                       |
| C4   | Mesmo objetivo de compatibilidade                                    | Prefixo efetivo permanece compatível                                                |
| C5   | Corrigir parecer de capacidade usando evidência incompleta           | SLO de 99% de eventos bons                                                          |
| C6   | Mesmo parecer, mesma evidência                                       | SLO de 98% de eventos bons                                                          |

Para C1/C2, verificar compilação e execução em Temurin 25.0.3 com target Java 21
e JUnit 5.11.4 já disponível. Conferir que a implementação conforme passa e que
um controle que sempre recusa falha pelo contrato pertinente. Examinar também
se as asserções respeitam a política de contenção, os resultados dos workers e
o encerramento limitado. Um teste finito não prova ausência de corridas.

Para C3/C4, executar a verificação do roteador real com Guava 33.5.0 já disponível
e target Java 16. Preservar vetores aceitos e o algoritmo. Concordância dos pontos
do anel ou monotonicidade isolada não substitui a decisão sobre o caminho chamado.
Um vetor que passa não comprova todas as chaves nem uma migração segura.

Para C5/C6, confrontar o parecer produzido com a população contratual e os dados
fornecidos: 10.000 operações elegíveis, 9.800 boas conhecidas, 200 sem resultado
observado. A faixa realizável é 98%–100%; ela não é intervalo de confiança nem
previsão de capacidade. Manter as demais evidências já aceitas no parecer.

## Avaliação e relato

Aplicar critérios binários vinculados a arquivos, execução e conclusões observáveis.
Não pontuar vocabulário nem exigir uma redação exata. Registrar falhas de ambiente,
exposição ou fixture separadamente de falhas do ator ou da skill. Preservar a
primeira execução e qualquer reteste com sua justificativa.

Se todas as condições passarem, relatar saturação nesses casos e ausência de ganho
demonstrado. Se houver diferença, limitá-la aos casos e execuções observados; uma
execução por condição não estima variabilidade nem superioridade geral.
