# CEVRA Skill — segundo produto após o aplicativo V1

**Data da decisão:** 2026-09-17.
**Versão do registro:** 1.
**Status:** DIREÇÃO DE PRODUTO E SEQUÊNCIA APROVADAS; IMPLEMENTAÇÃO FUTURA, NÃO AUTORIZADA POR ESTE REGISTRO.

## 1. Decisão do product owner

O product owner definiu que haverá dois produtos: o aplicativo CEVRA, já em construção, e o CEVRA Skill, opcional para quem preferir trabalhar dentro de um ambiente de IA compatível. O segundo será montado sobre o que existir no aplicativo depois que sua primeira versão básica estiver pronta.

**Ordem aprovada: CEVRA Vids aplicativo V1 básica → avaliar e construir CEVRA Skill como segundo produto, reaproveitando a base efetivamente entregue.**

- CEVRA Vids permanece o primeiro produto e a prioridade atual do CEVRA Orbit. O aplicativo não será abandonado, suspenso ou substituído por uma skill.
- CEVRA Skill será um segundo produto, não uma conversão integral do projeto atual, uma obrigação para usar o aplicativo ou um trabalho paralelo autorizado agora.
- A intenção de uso em Claude/GPT conserva a necessidade de identificar os ambientes, contas, versões e mecanismos oficiais realmente compatíveis. Não se promete instalação universal em qualquer chat, execução local automática a partir de qualquer conversa ou elegibilidade de assinatura não verificada.
- A V1 básica do aplicativo é o marco de retomada: não é necessário terminar todo o roadmap do editor, todo o ecossistema Orbit ou todas as funcionalidades futuras antes de avaliar o segundo produto. O conteúdo e os critérios de aceite da V1 continuam sendo os aprovados para o aplicativo; esta decisão não inventa uma nova definição de V1.
- Não há data de entrega, preço, assinatura, forma de licenciamento ou distribuição definidos para CEVRA Skill. Uma prioridade futura não autoriza automaticamente iniciar implementação ao atingir uma data ou condição.

A sugestão anterior de “skill primeiro, em vez do aplicativo” não é o caminho adotado. A decisão presente esclarece a estratégia de portfólio, sem revogar o planejamento funcional já aprovado.

## 2. Continuidade e autoridades

Ler junto de [CEVRA_MASTER_CONTEXT.md](CEVRA_MASTER_CONTEXT.md), [AGENTS.md](../AGENTS.md), [ARCHITECTURE_V1.md](ARCHITECTURE_V1.md), [CEVRA_DIRECTOR_DECISIONS.md](CEVRA_DIRECTOR_DECISIONS.md), [INTEGRATIONS.md](INTEGRATIONS.md) e dos ADRs pertinentes nas revisões aplicáveis. O Master Context permanece o índice global; este arquivo é somente o registro detalhado desta decisão de portfólio e sequência.

Referências já estabelecidas: identidade e hierarquia do Master Context, seções 1–2; responsabilidades, contexto/skill e conexão do Director, seções 3–9; prova antecipada de integração e controle de mudanças, seções 13–16; regras de execução canônica e independência do aplicativo. A referência funcional EDVID continua `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`, não edvid-lt nem revisão flutuante.

PRESERVE → EXTEND → VERIFY → MIGRATE ONLY IF NECESSARY permanece obrigatório. Não descartar código, bifurcar o estado audiovisual, criar um segundo Media Runtime, ampliar privilégios de execução ou realizar migrações especulativas para preparar esse produto futuro.

## 3. Reaproveitamento e limites da decisão

A orientação é aproveitar, quando estiverem implementados e adequados, o método editorial, presets, comandos, modelos/motores locais, composição, validações, Project IR/ProjectHistory, persistência e recuperação do aplicativo. O escopo executável do Skill deverá partir das capacidades efetivamente demonstradas na V1, distinguindo funções prontas de aprovações ainda não implementadas.

A skill pode orientar o agente e dar acesso controlado a ferramentas; instruções sozinhas não executam cortes, renderização, persistência ou desfazer/refazer. A distribuição do núcleo local necessário, a necessidade ou não de instalar o aplicativo completo e a experiência de preview/revisão serão avaliadas no marco do segundo produto. Não há promessa de que um único arquivo de instruções preserve todas as características do aplicativo ou dispense instalação, processamento e manutenção.

Preservar as fronteiras existentes favorece reuso. Isso não autoriza extrair agora um framework, criar uma API genérica, duplicar o código de edição ou paralisar a V1 para tornar todas as funções consumíveis por skill. Qualquer compartilhamento que exija mudança material será delimitado com impacto, alternativas, custo agora/depois e aprovação antes de implementação.

## 4. Não confundir o segundo produto com a integração de IA do aplicativo

**O adiamento do CEVRA Skill como produto não adia a integração necessária do aplicativo com IA.**

O registro do Director já prevê mecanismos oficiais de conexão, incluindo possíveis skills técnicas de integração com agentes externos. Esses componentes auxiliares, se necessários e autorizados na fatia do aplicativo, não equivalem ao lançamento de CEVRA Skill como segundo produto.

Permanece a prova antecipada de ida e volta no marco correto do aplicativo:

`contexto CEVRA → agente/provedor real e autorizado → proposta estruturada → validação e revisão CEVRA`

Essa prova ocorre antes da construção dependente, conforme o plano do Director e o gate coordenado do Media Runtime; não é empurrada para depois da V1 apenas porque o produto Skill virá depois. Não escolher aqui o agente/provedor, transporte, cobrança ou instalador dessa integração.

## 5. Prioridade atual e gatilho de retomada

A frente atual não muda: concluir o trabalho real em andamento no CEVRA 3; reconciliar registros; apresentar o plano delimitado; implementar, revisar e validar os ajustes coordenados do Media Runtime; então continuar o aplicativo por dependências. O inventário único permanece na seção 16.2 de [CEVRA_EDITORIAL_DECISIONS.md](CEVRA_EDITORIAL_DECISIONS.md), com MR-A01–MR-A06, MR-V01–MR-V02 e MR-Q01. Este registro não fecha o gate, não amplia o inventário e não reabre marcos encerrados.

**Retomar o segundo produto quando a V1 básica do aplicativo tiver sido montada e validada no seu escopo aprovado.** Nesse momento:

1. Inventariar o que a V1 entrega e quais operações podem ser reaproveitadas por agentes sem depender da interface completa.
2. Delimitar o mínimo de skill, ferramentas locais, instalação, preview e controles necessários, preservando estado e histórico canônicos.
3. Verificar oficialmente os ambientes de IA pretendidos, permissões, acesso, retorno de resultados, limites, consumo, privacidade, versões/licenças e compatibilidade comercial. Não assumir que assinaturas de chat equivalem a APIs ou execução irrestrita.
4. Propor uma primeira fatia representativa e validá-la antes de ampliar a distribuição. Definir então escopo do produto, diferenças em relação ao aplicativo, suporte e modelo comercial mediante aprovação pertinente.

Esse roteiro é preparação para a retomada aprovada, não autorização presente de código, instalação em contas/agentes, download de modelos, integração, publicação, merge ou gasto. Não há estimativa comprovada de esforço, economia, paridade entre agentes ou hardware necessário.

## 6. Registro remoto e handoff

Antes deste registro, a integração GitHub confirmou `main` em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae` e o PR #26 aberto/draft, não mesclado, na branch `docs/editorial-decisions-1-8`, head `6a601cc72d86c666b872bb010907f16fbd85d40e`. Esses SHAs são observações desta consulta, não bases permanentes para implementação. Não houve nova verificação do closeout do cache nem dos ajustes por esta decisão.

Este arquivo é adicionado à branch documental, sem escrita no main ou alteração na branch de implementação. Até a reconciliação, recuperar explicitamente este documento no PR #26, os registros editorial/visual/composição e o Director do PR #25 na revisão aplicável. A inclusão do resumo e link no Master Context permanece para o fechamento documental coordenado; esta adição não declara aquela integração concluída.

Resumo a integrar ao índice global:

> 2026-09-17 — CEVRA Vids aplicativo permanece o primeiro produto e prioridade até a V1 básica. CEVRA Skill será um segundo produto opcional, desenvolvido depois com base nas capacidades efetivamente entregues, não uma substituição do aplicativo nem uma frente paralela imediata. Preservar reuso do núcleo e histórico, sem duplicação ou reforma antecipada. A prova de integração IA do aplicativo continua no seu marco próprio; não depende do lançamento do produto Skill. Ambientes compatíveis, empacotamento e comercialização serão verificados na retomada. Detalhes em `docs/CEVRA_SKILL_PRODUCT_DECISION.md`.

Esta é uma decisão de portfólio, não a aprovação da decisão funcional 21 sobre busca/incorporação externa de mídia. A proposta 21 permanece pendente; decisões 1–20 e suas condições permanecem preservadas. Não criar numeração funcional adicional para este esclarecimento estratégico. Nenhum envio automático a outro chat é alegado.
