# Proposta: otimização de agentes e skills

Registrado em 24/09/2026 para retomar em 25/09/2026.
Status: proposta discutida; implementação ainda não iniciada.

## Objetivo

Evoluir o `agent-skills` para também avaliar e otimizar configurações de agentes,
com foco em desenvolvimento de software e na construção e revisão de skills.
Preservar o gerenciador atual como base de distribuição, resolução, integridade,
versionamento e instalação.

## Dois focos conectados

1. **Desenvolvimento:** descobrir quais combinações de agente, modelo, skills,
   contexto e fluxo de trabalho resolvem melhor tarefas de implementação,
   debugging, refatoração e revisão de código.
2. **Construção e revisão de skills:** criar candidatas, verificar conteúdo e
   comportamento, comparar versões e entregar mudanças acompanhadas de evidências.

O ciclo proposto é criar ou revisar uma skill, avaliar seu comportamento, publicar
uma versão e usar evidências das tarefas de desenvolvimento para orientar revisões
futuras. Publicação e commits continuam dependendo de solicitação explícita.

## Primeiro MVP sugerido

Começar pela revisão de **uma skill existente**:

1. Selecionar a skill e definir o comportamento que precisa melhorar.
2. Ler o processo existente em `docs/skill-review-prompt.md` e, quando aplicável,
   `docs/parallel-skill-reviews.md`.
3. Preparar tarefas positivas, negativas e adversariais com critérios verificáveis.
4. Produzir uma versão candidata sem substituir a versão de referência.
5. Comparar o agente sem a skill, com a versão atual e com a candidata.
6. Repetir execuções e avaliar qualidade, custo, tempo e regressões.
7. Entregar diff e relatório; eventualmente preparar um PR com as evidências.

A skill piloto, o agente, o modelo, o orçamento e a suíte ainda serão escolhidos.
Não há autorização registrada para executar experimentos pagos ou alterar a
configuração real dos agentes.

## Dimensões de avaliação

| Dimensão   | Pergunta                                                          |
| ---------- | ----------------------------------------------------------------- |
| Conteúdo   | As instruções são corretas, claras, atualizadas e executáveis?    |
| Ativação   | A skill é selecionada quando necessária e evitada fora do escopo? |
| Eficácia   | Seu uso melhora o resultado verificável da tarefa?                |
| Eficiência | O ganho justifica tempo, tokens, custo e intervenções?            |

Disponibilidade da skill não comprova uso. Registrar evidência observável de
ativação quando o runtime a fornecer; marcar lacunas de observabilidade.

Usar testes e critérios independentes sempre que possível. O agente que reescreve
a skill não deve ser a única autoridade sobre a melhoria. Reservar tarefas fora
do conjunto usado para otimização, repetir execuções e controlar condições do
ambiente. Uma nota de outro modelo, isoladamente, não comprova ganho.

## Possíveis alvos de otimização

- Descrição e critérios de ativação.
- Clareza e ordem das instruções.
- Quantidade de contexto carregado inicialmente.
- Divisão entre instruções principais e referências.
- Exemplos e procedimentos de verificação.
- Sobreposição e interação entre skills.

Cada alteração deve representar uma hipótese mensurável, como reduzir ativações
indevidas ou aumentar a proporção de correções válidas.

## Evolução arquitetural proposta

Ler `ARCHITECTURE.md` e `DESIGN.md` antes de mudanças estruturais. A distribuição
abaixo é uma proposta, não uma decisão de implementação já validada:

- Manter `AgentAdapter` responsável por descrição, projeção e validação de pacotes.
- Introduzir uma porta separada de execução, como `AgentRuntime`, com capacidades
  explicitamente suportadas por cada agente.
- Acrescentar ao `core` conceitos de perfil, tarefa, suíte, execução e experimento,
  além dos serviços de coordenação e portas necessárias.
- Manter processos, streams, persistência e integração de isolamento em `node`.
- Manter convenções de cada agente em `adapter-*`.
- Reutilizar registry, resolver e `AtomicInstaller` na preparação das skills.
- Expor execução e comparação pela CLI; nomes de comandos ainda serão definidos.

Cada execução precisa registrar revisão do repositório, perfil, versões e hashes
das skills, versão do agente, identificação disponível do modelo e condições do
ambiente. `skills.lock` sozinho não descreve o experimento completo.

Executar em ambientes isolados, sem tocar na configuração real do usuário, com
limites de duração e custo e controle de processos, credenciais e acesso à rede.

## Expansão para desenvolvimento

Após validar o MVP, aplicar o mesmo mecanismo a tarefas reais do repositório:

```text
Issue + repositório → critérios de aceitação → perfil e skills
  → execução isolada → verificação → mudança pronta para revisão
```

Uma suíte inicial possível é correção de bugs históricos Java, usando o estado
anterior à correção e testes independentes sem revelar a solução ao agente.

Métricas principais: sucesso validado, regressões, custo por tarefa resolvida
(incluindo falhas), tempo até resultado válido e intervenções humanas.
Tratar qualidade como requisito e custo/tempo como objetivos de otimização.

## Retomada

1. Escolher uma skill piloto e uma limitação concreta a investigar.
2. Inspecionar os artefatos de revisão existentes e identificar o que reutilizar.
3. Definir suíte, critérios, runtime e orçamento do primeiro experimento.
4. Delimitar a menor implementação que permite comparar referência e candidata.
5. Somente depois de obter medições confiáveis, acrescentar geração automática
   de variantes e seleção de perfis por tarefa.

Referência discutida: [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
