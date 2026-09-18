# CEVRA — Decisões visuais e de produção: continuidade a partir da decisão 14

**Data:** 2026-09-16, aprovação do product owner nesta rodada de continuidade.
**Versão deste registro:** 6.
**Status:** DIREÇÃO DE PRODUTO APROVADA / IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.
**Decisões aprovadas neste documento:** 14–17. A decisão 18 permanece registrada como direção histórica, mas sua avaliação/implementação adicional foi explicitamente adiada para pós‑V1 em 2026-09-18. Não há aprovação implícita de uma decisão 19 ou posterior.

## 0. Autoridade, localização e continuidade

Este é o registro detalhado da rodada visual, não outro Master Context nem uma segunda fonte de estado audiovisual. Ler com `docs/CEVRA_MASTER_CONTEXT.md`, `AGENTS.md`, `docs/ARCHITECTURE_V1.md`, os ADRs aceitos, `docs/CEVRA_EDITORIAL_DECISIONS.md` e `docs/CEVRA_DIRECTOR_DECISIONS.md` na revisão aplicável.

As decisões editoriais 1–13 permanecem aprovadas e detalhadas exclusivamente em `docs/CEVRA_EDITORIAL_DECISIONS.md`, versão 4, consolidada no commit `1b7c783724424739a131e598ac014a3fc7e4960b`. Não são reescritas, reabertas nem substituídas por esta rodada. A divisão em documentos evita misturar o fechamento comportamental da Fase 1 com a discussão visual posterior; não divide o Project IR ou o planejamento em autoridades concorrentes.

Estado remoto conferido antes da criação da versão 1 (histórico):

- `main`: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`.
- PR #26: aberto/draft, branch `docs/editorial-decisions-1-8`, head anterior a esta adição `1b7c783724424739a131e598ac014a3fc7e4960b`.
- A comparação desse head com main confirmou sete commits adiante, zero atrás e somente `AGENTS.md` e o registro editorial como alterações anteriores desta branch.
- O registro do Director consultado está no PR #25, revisão `fe4c58b6d2100b95f636c4e2b07c7cf03bc95be6`; esta adição não declara novo status desse PR ou do Transcript Cache/PR #24.

Este arquivo é acrescentado à branch documental existente. Não é mudança no main, implementação, merge, gasto, integração externa ou autorização para alterar a branch de trabalho do cache. Antes de emissão de prompt dependente, recuperar explicitamente o PR #26 e este arquivo até sua integração. O Master Context continua pendente de resumo/link e reconciliação pelo processo normal, sem mover uma base congelada somente para integrar documentação.

Na atualização para a versão 2, `refs/heads/main` foi novamente consultado e permanecia em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`; o PR #26 estava aberto/draft, não mesclado, em `b33bd3ba0869731472c03056344ba6cc29c8f89d`, commit de criação deste registro. A atualização acrescenta a aprovação da decisão 15 com sua ressalva de esforço/escopo, preserva a decisão 14 e atualiza o handoff. Não declara novo closeout do cache ou dos ajustes coordenados.

Na atualização para a versão 3, `refs/heads/main` foi conferido novamente em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae` e o PR #26 permanecia aberto/draft, não mesclado, com head `428e615002ed30a82c87383f6409c98273d80a96`. O product owner aprovou a decisão 16; este registro acrescenta seus detalhes, preserva as decisões 14–15 e atualiza o handoff. Não fecha o gate de implementação nem declara a decisão 17 aprovada.

Na atualização para a versão 4, `refs/heads/main` foi novamente confirmado em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae` e o PR #26 estava aberto/draft, não mesclado, em `89e77c02a1e52a019cf6bf20b7f65235136affe8`. O product owner aprovou a decisão 17 e perguntou sobre execução local versus uso de IA. Esta atualização preserva as decisões 14–16, acrescenta o posicionamento de legendas com seus limites e atualiza o handoff. Não declara conclusão do Media Runtime, não altera sua programação e não aprova a decisão 18. A versão 5 corrige a referência anterior abreviada à resposta “certo.”, sem mudar o comportamento aprovado.

Na atualização para a versão 5, o main foi novamente confirmado em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`; o PR #26 estava aberto/draft, não mesclado, com head `6f16dd5792a24903741c5a0dc3ef8f9f467301c7` e este arquivo com blob `fb6bbebfd7b3b0ceed19d6f566f4209bb6da7347`. O product owner aprovou condicionalmente a personalização, limitando-a ao catálogo EDVID e a melhorias que não exijam grande trabalho adicional para benefício pequeno. Perguntou também como o Director informará a ausência de IA externa. A seção 6 registra a decisão 18 e esclarece as políticas já existentes de execução/capacidades; não cria uma decisão 19, novo modelo ou integração. Só este documento é atualizado; nenhum código, runtime, main ou outra branch recebe alteração.

Na atualização para a versão 6, em 2026-09-18, o product owner aprovou o refinamento da decisão 17 com um **Caption Placement Planner local e progressivo**, safe-zones por intervalo, análise proporcional do sujeito, luminância/legibilidade, preview amostrado e Caption QA. A decisão 15 permanece intacta. A personalização adicional da decisão 18 foi adiada para pós-V1, sem retirar os seis estilos EDVID do piso V1. HeroEmphasis/behind-subject passa a ser capability visual independente, vinculada à decisão 23 e condicionada ao matting adequado. Nenhum código, modelo, download ou mudança do Media Runtime é autorizado por este registro.

## 1. Regra desta rodada antecipada

O product owner autorizou adiantar decisões de produto enquanto a implementação aguarda disponibilidade de Codex. Isso não equivale a concluir os ajustes coordenados do Media Runtime nem a autorizar código antecipado.

Permanece a sequência: concluir o processo real do chat CEVRA 3; reconciliar os registros e apresentar o plano delimitado; implementar, revisar e validar os ajustes coordenados aprovados; somente depois retomar o avanço funcional dependente. Na passagem pertinente, manter o alerta **PAUSA DE AVANÇO — ajustes coordenados do Media Runtime antes da próxima etapa.** Adiamento material requer aprovação expressa com escopo e impacto.

O inventário único continua na seção 16.2 do registro editorial: MR-A01–MR-A06, MR-V01–MR-V02 e MR-Q01. Não o duplicar nem incluir novas operações silenciosamente. Restauração avançada, modelos não selecionados e todo o editor de QA/revisão não se tornam bloqueadores adicionais.

Para cada decisão desta rodada, registrar: comportamento realmente encontrado no EDVID; redação e limites aprovados; alternativas/benefício/contrapartida; baseline, primitivas e lacunas; componentes/dependências; custo e incertezas; validação pendente; momento correto de implementação e impacto nos marcos anteriores. Distinguir direção aprovada, código implementado, teste executado, capacidade empacotada e função disponível no aplicativo.

Classificações de momento:

- **AGORA NO MR:** necessidade concreta que deve ser avaliada para os ajustes coordenados, sem inclusão automática no escopo.
- **PREPARAR NOS CONTRATOS / IMPLEMENTAR DEPOIS:** preservar a compatibilidade no marco de contratos pertinente e executar a função na sua fatia natural; não significa editar contratos durante esta discussão.
- **DECIDIR AGORA / NÃO INTERFERE AGORA:** comportamento antecipado sem necessidade demonstrada de alterar a frente atual.

PRESERVE → EXTEND → VERIFY → MIGRATE ONLY IF NECESSARY permanece obrigatório. Project IR/ProjectHistory são a autoridade audiovisual editável; não criar timelines, estado de execução audiovisual ou motores concorrentes. Aprovação de comportamento não autoriza código, merge, gasto ou serviço externo.

## 2. Decisão 14 — Como escolher, combinar e reutilizar o estilo do vídeo

**APROVADA pelo product owner**, incluindo a proposta detalhada abaixo. A mensagem de aprovação também solicitou guardar os detalhes para implementação nos momentos corretos, não apenas o título ou uma frase resumida.

### 2.1 Referência EDVID verificada

Referência exclusiva desta comparação: `fillrochaa/edvid`, commit `d8e6389db02e8de0b46ee680105c09d4250d4703`. Não substituir por `edvid-lt` ou upstream flutuante.

Arquivos consultados para esta decisão:

- [SKILL.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/SKILL.md).
- [references/shortform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/shortform.md) e [references/longform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/longform.md).
- [assets/preview/app.js](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/preview/app.js), especialmente `STYLE_CATALOG`, seletor de cor, `renderSetup` e restauração das escolhas.
- [helpers/preview_server.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/preview_server.py), inclusive salvamento de `preview_style.json`.
- [assets/shortform/src/Main.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/Main.tsx) e [assets/longform/src/Main.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/longform/src/Main.tsx).

**Catálogo shortform encontrado no código da interface:**

| Grupo | Opções |
|---|---|
| Composição principal | Limpa (`limpa`), Tela dividida (`split`) e Tela dividida 2 (`split2`). |
| Título inicial / headline | Contorno (`outline`), Cartão (`card`), Realce (`realce`), Misto (`misto`) ou Nenhum. |
| Legendas | Karaokê, Empilhado, Disperso, Simples, Serifada, Clássica ou Nenhum. |
| Cor de destaque | Seletor de cor e hexadecimal; indicação de quando os estilos escolhidos não utilizam essa cor. |
| Elementos independentes | Tracking, aproximação gradual (`zoomAuto`), zoom nos cortes (`zoomCuts`), flash de transição e trilha com IA. |

A referência shortform trata uma opção desmarcada como um não explícito e admite instrução textual de ajuste. Os templates contêm seleção dos seis estilos de legenda e dos quatro tratamentos de título. A existência de uma opção no catálogo não prova, isoladamente, a execução completa de toda a sua dependência.

**Fluxo instruído pela skill:** aprovar montagem → escolher estilo → agente interpretar escolhas → preparar composição. **Implementação inspecionada:** a interface salva `preview_style.json`; o servidor não executa sozinho toda a edição. A aba permite retorno e alteração de estilo após a Fase 2. Código inspecionado não equivale a teste de renderização realizado nesta consulta.

**Longform:** a skill declara que a aba Estilo não tem vocabulário longform próprio nessa revisão e orienta perguntas na conversa. O template possui B-roll, identificação de pessoa/cargo, cartões de capítulos e destaques pontuais; a referência prevê SRT separado. Copiar apenas o menu shortform deixaria essas capacidades de fora. A experiência coordenada proposta para CEVRA não deve impor densidade ou tratamento de Reel ao vídeo longo.

**Limitação encontrada:** embora a interface aceite cor personalizada, `HookInner` no template shortform consultado usa laranja fixo `#ff5200` para Realce/Misto. A ligação escolha → configuração → resultado não foi demonstrada integralmente nessa superfície; não declarar que só a presença do seletor resolve a paridade. O aceite CEVRA deve verificar o resultado efetivo. Nenhum patch upstream ou teste de render foi executado nesta discussão.

### 2.2 Comportamento aprovado e limites

**Recomendação aprovada:** preservar escolhas independentes do EDVID e usar presets como atalhos ajustáveis, não pacotes fechados que removem controles.

1. **Entrada rápida com ajuste por componente.** O usuário pode partir de um preset pronto, preset próprio ou orientação ao Director. Apresentar uma combinação compreensível de composição, título, legenda, cores e elementos ativados. Os controles individuais permanecem acessíveis.
2. **Alteração restrita ao solicitado.** Exemplo aprovado: “mantenha a legenda, retire o título e desligue o zoom nos cortes” altera esses componentes, não toda a identidade visual e não a montagem. Reavaliar apenas dependências realmente afetadas, preservando a decisão 13; isso não promete renderização parcial universal.
3. **Presets preenchem escolhas, não retiram liberdade.** Manter as alternativas úteis do EDVID, inclusive Nenhum e elementos desligados. O Director não reativa uma opção desativada apenas por preferência estética.
4. **Reaproveitar preferências válidas.** Após a aprovação da montagem, mostrar o resumo vigente e permitir ajustes; não impor nova seleção quando a escolha já foi informada. Perguntar apenas por conflito, informação material ausente ou capacidade indisponível. Preservar aprovação por padrão e autonomia previamente delimitada, sem criar nova autorização de upload/gasto.
5. **Salvar combinação própria.** Salvar configurações reutilizáveis, sem transportar automaticamente falas, takes e tempos específicos do vídeo usado como exemplo. Alterar o projeto não modifica silenciosamente o preset salvo; atualizar o preset também não altera retroativamente projetos anteriores. A intenção não exige um motor de execução de workflows completo nesta mesma fatia.
6. **Exemplos visuais honestos.** Usar amostras representativas por componente que correspondam ao resultado executável. Não pré-renderizar todas as combinações. O preview real da montagem continua sendo a referência para avaliar o conjunto.
7. **Preservar classes já aceitas.** Preset visual trata aparência; Workflow / Production Preset orquestra produção; perfil de exportação trata entrega. Trocar aparência não autoriza modificar conteúdo, contratar geração ou alterar entrega. ADR 0010 não é reaberto.
8. **Capacidades explícitas.** Uma opção oferecida como executável deve possuir caminho validado. Não apresentar recurso futuro como disponível nem substituir silenciosamente opção obrigatória indisponível. Preservar as políticas existentes para componentes opcionais e alternativas autorizadas.

Esta aprovação define escolha, combinação e reutilização. Não fixa ainda a especificação detalhada de cada estilo de legenda, cada layout, movimento, inserção, música/SFX ou geração. Não esgota todos os aspectos funcionais do EDVID: eles devem ser examinados nos respectivos temas, inclusive capacidades fora do menu Estilo. Não copia identidade visual, marca ou trade dress.

### 2.3 DIVERGÊNCIA EDVID

**DIVERGÊNCIA EDVID aprovada como direção, validação pendente:** reaproveitar escolhas válidas anteriores sem forçar novamente a tela de seleção e oferecer experiência coordenada para shortform e longform, preservando particularidades de ambos.

Preservar os controles úteis e verificar redução de interação sem perda de qualidade, rastreabilidade ou capacidade. Não declarar superioridade por elegância arquitetural ou apenas porque a interface tem menos passos. Registrar a divergência na matriz aplicável quando incorporada; não inventar ID de paridade ou marcar teste não realizado como aprovado.

### 2.4 Baseline CEVRA e viabilidade apresentada antes da aprovação

Baseline: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`.

Referências verificadas: [WORKFLOW_PRESETS.md](WORKFLOW_PRESETS.md), [ADR 0010](adr/0010-workflow-production-presets.md), [ADR 0012](adr/0012-composition-engine-benchmark.md), [tipos Project IR](../packages/project-ir/src/types.ts), [comandos Project IR](../packages/project-ir/src/commands.ts), [App.tsx](../apps/desktop/src/App.tsx), [DirectorPanel.tsx](../apps/desktop/src/components/DirectorPanel.tsx), [contrato de composição](../packages/contracts/src/composition.ts). Revalidar o baseline e os contratos antes da implementação; os links relativos mostram a revisão de onde este documento for consultado.

| Classificação | Situação e mínimo adicional |
|---|---|
| Ponta a ponta disponível | Não há o fluxo completo escolher → aplicar → revisar → salvar presets. O seletor atual é de apresentação e a escolha fica no estado local da UI. |
| Primitivas existentes | `StyleState`, campos de estilo/cor, referências de layouts, `CaptionCue`/`GraphicItem` e `style.patch` implementado; Project IR e histórico existentes são a autoridade a reutilizar. Isso não prova um renderizador de estilos. |
| Extensão interna mínima | Catálogo validado; resolução das escolhas; biblioteca local de presets; registro de versão e parâmetros resolvidos; integração aplicação–Desktop Host–UI; ligação aos compiladores de legenda/composição. Avaliar o que os campos/comandos existentes representam corretamente a necessidade; ampliar somente lacunas demonstradas, sem migração especulativa ou objetos não validados em `extensions`. |
| Dependências posteriores | Execução dos componentes visuais e seleção/integração validada do Composition Engine. Tracking, mídia externa e geração conservam suas dependências próprias; não são pré-requisitos para selecionar ou salvar um preset. |

Director impact: extensão comportamental compatível com o reaproveitamento de preferências, o contexto compacto, a aprovação delimitada e a execução por comandos. Não é prova de integração do Director. Presets declarativos ficam na aplicação; estado audiovisual aplicado permanece no Project IR/ProjectHistory, sem segunda timeline ou estado paralelo baseado nos JSONs do EDVID.

### 2.5 Benefício, alternativas e custo-benefício

**Benefício principal:** produção rápida sem perder os controles independentes do EDVID. **Contrapartida:** manutenção de versões, compatibilidade entre componentes, integração e validação visual.

Alternativas confrontadas na recomendação: pacotes fechados simplificam o menu, mas retiram controles úteis; configurar todos os componentes novamente preserva controle, mas repete trabalho. Presets ajustáveis conciliam atalho e refinamento. Não antecipar biblioteca/plataforma genérica de plugins ou scripting para resolver este comportamento.

Seleção e salvamento podem ser locais e determinísticos, sem IA por alteração. Pedidos criativos ambíguos ao Director podem exigir interpretação; não prometer raciocínio semântico equivalente por regra mecânica. O processamento pesado depende de renderização e elementos ativados, não do simples ato de escolher o preset. Carregar somente amostras/recursos necessários e não produzir render para cada combinação ou interação.

CPU/RAM, armazenamento de configurações/amostras, espera de preview/render e manutenção têm custo real; não foram medidos nesta discussão. Não há promessa de custo desprezível, tempo fixo, hardware mínimo ou redução quantitativa. Separar o custo de configuração do custo dos efeitos/ativos habilitados.

Nenhum modelo, serviço, biblioteca, fonte, LUT, mídia ou motor novo foi selecionado/incorporado. A função de catálogo não introduz API paga obrigatória. Dependências de render/ativos posteriormente escolhidas exigem auditoria de versão exata, licença/proveniência, termos, privacidade e distribuição comercial; assinatura pessoal ou gratuidade nominal não são autorização. HyperFrames/Remotion continuam candidatos sujeitos ao ADR 0012, não motores aprovados por esta decisão.

### 2.6 Momento correto de implementação

**PREPARAR NOS CONTRATOS / IMPLEMENTAR NAS FATIAS DE PRESETS, LEGENDAS E COMPOSIÇÃO.**

- **Frente atual do Media Runtime:** nenhuma nova operação obrigatória foi identificada por esta decisão. Cor e áudio permanecem no inventário único existente. Não ampliar agora o MR para antecipar biblioteca de presets.
- **Após o fechamento dos ajustes, no marco de contexto/plano:** comportar referências de estilo e escolhas resolvidas, capacidades e restrições. Fazer a menor extensão compatível antes que consumidores posteriores dependam do contrato. Não implementar todo o catálogo nem todos os componentes para aprovar esse contrato.
- **Fatias de presets/legendas/composição:** integrar progressivamente catálogo executável, biblioteca local e controles quando cada capacidade tiver sido entregue; registrar versões/parâmetros e preservar o caminho canônico. Os exemplos visuais e o render dependem dos componentes e do benchmark pertinente.
- **Serviços opcionais, tracking, geração e outras capacidades:** discutir, verificar dependências/licenças e integrar em seus marcos próprios. Nenhuma seleção feita aqui autoriza chamar serviço, baixar modelo ou gastar.

Preparar essas referências no momento técnico correto reduz retrabalho dos consumidores. Construir todos os efeitos agora bloquearia a base por escopo prematuro. Uma nova lacuna material, especialmente a que deva entrar no MR antes de seu fechamento, deve voltar ao product owner com motivo, alternativas, impacto e custo agora/depois, não entrar silenciosamente.

### 2.7 Validação pendente — não executada nesta aprovação

Critérios derivados do comportamento aprovado, a detalhar nas fatias técnicas:

- demonstrar escolha → parâmetros resolvidos → resultado para cada componente entregue, inclusive cor personalizada e opções Nenhum/desligadas;
- confrontar referências EDVID equivalentes, incluindo shortform e longform, sem reduzir a paridade ao menu visível;
- demonstrar que amostras representam o render, sem declarar paridade visual antes da comparação;
- reaproveitar escolhas sem nova seleção obrigatória e manter aprovação/escopo quando pertinente;
- aplicar mudança restrita sem perder ajustes válidos e verificar histórico/undo/redo, persistência e referências da revisão assistida;
- salvar/reutilizar combinação sem copiar conteúdo/tempos particulares e sem atualização retroativa de projetos ou presets;
- informar capacidades indisponíveis e manter chamadas de IA/serviços ausentes em ações puramente determinísticas;
- medir custo de carregamento das amostras, troca/aplicação e render em operações representativas, separando preparação de processamento pesado.

Nenhum benchmark, teste de mídia, build ou CI de implementação é reivindicado por este registro. Testes de implementação não equivalem à funcionalidade distribuída no aplicativo.

### 2.8 Redação objetiva aprovada — preservada

> O CEVRA permitirá escolher, combinar, ajustar e reutilizar a direção visual por presets e controles independentes, preservando as capacidades úteis do EDVID. Preferências válidas já informadas serão reaproveitadas, sem nova seleção obrigatória. Combinações poderão ser salvas como presets próprios, sem transportar conteúdo específico nem alterar retroativamente projetos. Toda opção deverá corresponder a uma capacidade executável, e os exemplos visuais deverão representar seu resultado. A implementação seguirá as dependências de contratos, legendas e composição, sem ampliar agora o escopo do Media Runtime.

## 3. Decisão 15 — Origem, fidelidade e sincronização das legendas

**APROVADA COMO DIREÇÃO DE PRODUTO, COM ESCOPO E ESFORÇO DE IMPLEMENTAÇÃO A VALIDAR.** O product owner respondeu: “Aprovo. Achei complexo o meu entendimento do que você me explicou, mas se você acha que a mudança ela é pequena e válida, a gente aprova e passa para o próximo passo.”

Essa ressalva não é evidência de que o esforço já foi medido ou de que se trata apenas de ativar uma opção. A direção é aproveitar transcrições corretas e verificar o que mudou, sem reescrever motores. O baseline ainda requer compilação, referências temporais e integração. Aplicar o gate de viabilidade antes do prompt dependente; se o caminho exigir reforma relevante, nova dependência, custo desproporcional ou expansão material, retornar ao product owner com alternativa delimitada antes de implementar. Não tratar a aprovação como autorização irrestrita de otimização. Nas próximas discussões, explicar o efeito no uso e o acréscimo concreto sem exigir que o product owner domine a arquitetura.

### 3.1 Referência EDVID verificada

Mesma referência fixada: `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`, não `edvid-lt`.

- A skill e [references/shortform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/shortform.md) orientam transcrever `cut.mp4` e gerar legendas depois do gate da montagem. [references/longform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/longform.md) orienta o mesmo para o SRT.
- [helpers/captions_for_remotion.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/captions_for_remotion.py) implementa o modo preferido `--transcript`: lê palavras já temporizadas sobre a montagem e produz entradas por palavra para o renderizador. O outro modo mapeia palavras das fontes por intervalos da EDL, somando durações. Esse fallback não utiliza `jcut_timeline`; não copiá-lo como se comprovasse sincronismo com J-cuts.
- [helpers/captions_srt.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/captions_srt.py) agrupa palavras por pontuação, pausas, comprimento e duração, com quebra em linhas para SRT. As intenções/limites do helper não são garantias universais medidas nesta consulta.
- [helpers/caption_style.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/caption_style.py) prepara agrupamentos e marcas para o Empilhado, com tratamento de palavras breves. Temporização de palavras e apresentação têm responsabilidades distintas; a preparação inspecionada usa regras, não comprova compreensão semântica universal.

Essas são orientações e implementações inspecionadas. Não foi executado novo teste de transcrição/renderização ou benchmark de paridade por esta aprovação.

### 3.2 Comportamento aprovado

**Recomendação:** reaproveitar transcrição/alinhamento quando válidos, sem economizar às custas de texto incorreto ou dessincronizado.

1. **Fala efetivamente ouvida.** Derivar texto e sequência dos trechos realmente presentes na montagem. A legenda acompanha o tempo do áudio, inclusive em J-cuts; não apenas cortes da imagem nem soma aproximada de durações.
2. **Fidelidade por padrão.** Legenda da fala não é resumo automático. Pontuação, apresentação e correções de transcrição devem ser sustentadas pela gravação, sem trocar afirmações, eliminar negações, mudar números ou inventar palavras. Resumos, títulos e destaques editoriais não substituem silenciosamente a legenda da fala.
3. **Correção editável e rastreável.** Corrigir uma legenda não altera o áudio nem substitui silenciosamente a transcrição canônica da fonte. Aplicação pelo caminho validado de Project IR/ProjectHistory. Mudanças da montagem atualizam os trechos afetados e preservam correções manuais ainda válidas; não conservar correção em contexto que mudou sem verificar sua validade.
4. **Reuso condicionado, não obrigatório.** Não retranscrever a cada edição. Reutilizar evidências e tempos válidos; investigar dúvida concreta de texto, borda ou sincronismo, recorrendo a alinhamento/transcrição adicional quando necessário. Transcrever a montagem inteira continua permitido quando justificado; o caminho preferido do EDVID não é proibido.
5. **Trabalho proporcional.** Mudar cor não exige reconhecer a fala novamente. Reorganizar takes exige remapear tempos. Palavra duvidosa numa emenda pode exigir ouvir/analisar o trecho. A decisão não declara que o suporte a análise seletiva já está integrado nem promete renderização parcial universal.
6. **Base compartilhada, apresentações diferentes.** Palavras e tempos válidos podem alimentar os estilos visuais e SRT, com agrupamentos próprios. Não impor o mesmo número de palavras, quebras ou layout a todos os estilos. Preservar o catálogo e Nenhum conforme a decisão 14.

Esta decisão não escolhe tipografia, animações, posicionamento, limites finais de legibilidade, idioma adicional, tradução, novo modelo ou biblioteca. Não esgota a discussão de legendas.

### 3.3 Viabilidade informada antes da aprovação

Baseline verificado na discussão e mantido na consulta de registro: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`.

Referências: [tipos Project IR](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/project-ir/src/types.ts), [comandos](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/project-ir/src/commands.ts), [testes Project IR](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/project-ir/test/project-ir.test.mjs), Master Context e ADRs aceitos de transcrição/alinhamento, qualidade não destrutiva e composição.

| Classificação | Evidência / acréscimo necessário |
|---|---|
| Primitivas existentes | Transcrições por fonte, palavras/tempos/IDs, identificação de alinhamento, digests, intervalos dos clips, `CaptionCue`, `caption.upsert` e `caption.remove`; motores locais e histórico são bases a preservar. |
| Integração e extensão interna | Compilador ligado ao mapeamento temporal efetivo; referências à fonte, ocorrência do trecho e versão; representação validada dos tempos por palavra; proteção de correções; ligação aplicação/histórico/host/UI. Reutilizar primeiro os tipos e comandos que representarem corretamente a necessidade. |
| Ponta a ponta | A geração sincronizada, editável e ligada à montagem proposta não está demonstrada disponível. `CaptionCue` tem texto e limites do bloco, não toda a granularidade/ligação proposta. Testes de transcrições e identidade não são testes dessa geração sobre a montagem renderizada. |
| Externo / não verificado | Nenhum novo modelo ou API paga foi identificado como obrigatório para este núcleo. Isso não elimina a integração de análise adicional nem os gates de empacotamento/capacidade. Render dos estilos depende da composição e do benchmark; nenhuma dependência comercial foi escolhida. |

Director impact: o Director pode coordenar pedidos de correção e evidência; aritmética temporal e geração mecânica não exigem raciocínio de IA. Uma alteração de legenda não autoriza reescrever a fonte, mudar sentido ou substituir o plano. Preservar versão assistida, digests e o único estado audiovisual canônico. Nenhum novo banco, timeline ou runtime é aprovado.

### 3.4 Alternativas, benefício, contrapartida e custos

Transcrever sempre a montagem pronta simplifica a obtenção dos tempos dessa saída, mas repete processamento e precisa preservar correções. Reaproveitar sempre sem conferir validade pode errar texto ou sincronismo. Foi recomendado reuso condicionado à validade, com análise adicional quando necessária.

**Benefício esperado:** evitar reconhecimento repetido de fala já processada e manter ligação verificável entre fonte, montagem e legenda. **Contrapartida:** implementar e testar corretamente o mapeamento temporal, inclusive quando um trecho aparece mais de uma vez ou o áudio não acompanha os cortes de imagem.

O mapeamento trabalha com dados textuais/temporais; alinhamento e transcrição adicional têm custo de modelo, processamento, memória e espera. Referências/correções têm custo de persistência e manutenção. Nenhuma redução de tempo/RAM, esforço pequeno, latência, orçamento ou hardware mínimo foi medido. Não propor cache audiovisual novo, cópias integrais desnecessárias ou pré-renderizações extras apenas para esta decisão.

A função básica não introduz API paga obrigatória nem autorização de upload. Qualquer futura dependência, modelo, peso, fonte ou serviço precisa de auditoria de versão/proveniência/licença/termos/privacidade/distribuição comercial e autorização pertinente. Gratuidade nominal não equivale a custo total zero.

### 3.5 Momento de implementação e impacto no Media Runtime

**PREPARAR A COMPATIBILIDADE TEMPORAL / IMPLEMENTAR NA FATIA DE LEGENDAS.**

- Considerar a necessidade de mapeamento efetivo de áudio/junções em **MR-A05** e a precisão temporal em **MR-V01**, ambos já no inventário. Isso não cria item ou operação nova nem transfere agrupamento de legendas ao worker.
- Depois do fechamento dos ajustes e no marco técnico pertinente, assegurar que os contratos/mapeamentos que serão consumidos preservem fonte, ocorrência, versão e tempos de áudio corretos. Não ampliar contratos por antecipação sem necessidade demonstrada.
- Implementar compilador, representação validada e proteção de correções na fatia de legendas, antes da integração dos estilos ao renderizador. Integração desktop e SRT pertencem às respectivas fatias de aplicação/entrega.
- Não reabrir motores de transcrição/alinhamento encerrados para otimização especulativa. Caso a análise adicional exija capacidade ainda não disponível, apresentar o mínimo adicional e os custos antes do prompt dependente.

Foi informado que nenhuma nova operação obrigatória de Media Runtime foi identificada nesta proposta. A ausência de nova operação MR não comprova que o desenvolvimento total seja pequeno. O limite de esforço/escopo ressaltado pelo product owner exige confrontar o plano executável com alternativas e voltar para decisão se houver expansão material.

### 3.6 DIVERGÊNCIA EDVID e validação pendente

**DIVERGÊNCIA EDVID aprovada como direção, validação pendente:** preferir reaproveitamento validado em vez de tornar a transcrição da montagem pronta o caminho habitual obrigatório. Preservar a possibilidade de transcrever a montagem completa quando essa for a solução justificada. Não declarar superioridade sem teste.

Validar com material equivalente e comparação com o caminho EDVID: várias fontes/takes, J-cuts, trechos repetidos, reordenação, palavras nas emendas, correções manuais e alterações posteriores. Conferir texto realmente ouvido, sincronismo ao longo da saída, ausência de perda/duplicação de palavras, ligação à ocorrência correta, preservação de correções válidas e sincronização de estilos/SRT. Medir erros, revisão necessária e consumo total, separando remapeamento, verificação, análise adicional e render.

Os limites numéricos e a representação técnica final serão especificados e testados na fatia correspondente. A aprovação não é teste executado, migração autorizada, código pronto ou liberação do gate do MR.

### 3.7 Redação objetiva aprovada — preservada com a ressalva da seção 3

> As legendas do CEVRA representarão fielmente a fala efetivamente presente na montagem e acompanharão seu tempo de áudio. O sistema reutilizará transcrições e alinhamentos válidos, com referências verificáveis, sem retranscrição obrigatória a cada alteração. Dúvidas ou falhas concretas poderão exigir análise adicional, inclusive da montagem completa quando justificado. Correções permanecerão editáveis, rastreáveis e protegidas contra sobrescrita indevida. A implementação ocorrerá na fatia de legendas, apoiada no mapeamento temporal e nas capacidades de mídia previamente validados.

## 4. Decisão 16 — Como dividir a fala em legendas fáceis de ler

**APROVADA COMO DIREÇÃO DE PRODUTO em 2026-09-16.** O product owner respondeu “Aprovado. Proximo” à proposta detalhada de agrupamento e legibilidade. A aprovação não comprova esforço pequeno, limites numéricos finais ou disponibilidade; não autoriza código, merge, gasto nem seleção de nova dependência.

### 4.1 Referência EDVID e evidência

Referência fixada: `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`. Manter SKILL.md e as referências shortform/longform em conjunto com os helpers e componentes, distinguindo instrução, código inspecionado e validação real.

- [Main.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/Main.tsx), `buildLines`, `Word` e `Karaoke`: pequenos grupos por quantidade e pontuação, entrada progressiva de palavras, medição do texto e redução de escala para caber na largura configurada. Não inferir que essa política seja idêntica em todos os estilos.
- [caption_style.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/caption_style.py): preparação própria do Empilhado, incluindo agrupamento e tentativa de juntar palavras isoladas breves demais a blocos vizinhos. Regras locais não equivalem a interpretação semântica universal.
- [captions_srt.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/captions_srt.py): agrupamento por pontuação, pausas, comprimento/duração e quebra em linhas. As constantes da referência não são limites universais aprovados para CEVRA.
- Conferência complementar ao registrar esta aprovação: [SimpleCaptions.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/SimpleCaptions.tsx) já agrupa por largura medida, limita palavras, considera pontuação/pausas e penaliza algumas quebras depois de palavras funcionais. Preservar esse comportamento útil; não atribuir a CEVRA a invenção de toda proteção de leitura.

O EDVID já adapta o agrupamento à apresentação. A proposta não é substituir isso por um novo sistema uniforme. Nenhum teste de renderização ou benchmark foi executado nesta aprovação.

### 4.2 Comportamento aprovado e exemplo

**Preservar os comportamentos úteis do EDVID e acrescentar proteções simples de leitura, sem transformar todos os estilos na mesma legenda.**

1. **Quebras naturais e proporcionais.** Considerar pontuação, pausas e espaço disponível. Evitar separar desnecessariamente expressões como “30 segundos” ou “não é obrigatório”. Isso não impede entrada/destaque por palavra; não promete uma regra determinística capaz de compreender toda expressão.
2. **Fazer caber sem texto minúsculo.** Quando um grupo for longo demais, buscar divisão melhor antes de reduzir excessivamente a fonte. Adicionar outra linha somente se o estilo permitir. Não converter silenciosamente karaokê de uma linha em Empilhado nem retirar o controle do usuário.
3. **Evitar palavras que apenas piscam.** Preservar palavra isolada como recurso de ênfase, desde que haja tempo de percebê-la. Ajustar agrupamento quando necessário, sem apagar palavras, mudar a gravação ou deixar indevidamente texto preso durante uma pausa.
4. **Sem IA por quebra.** Usar processamento local de texto/tempos e regras próprias de cada estilo. Dificuldade isolada não autoriza automaticamente adicionar um modelo ou uma cascata de inferência.
5. **Fidelidade e compatibilidade.** Preservar texto, sincronismo e correções válidas conforme decisão 15, além do catálogo e escolhas da decisão 14. Não impor uma contagem ou número de linhas único a todos os estilos. Preservar ajustes editáveis no caminho canônico.

Exemplo apresentado: em “O vídeo precisa de 30 segundos”, tentar manter “30 segundos” no mesmo grupo quando couber, em vez de separá-los apenas por alcançar uma contagem fixa. É orientação de agrupamento, não autorização para alterar a frase ou atrasar a fala.

Esta aprovação não escolhe fontes, animações, posicionamento, tradução ou valores exatos de tamanho mínimo, duração e número de palavras. Esses parâmetros dependem do estilo e de validação na fatia técnica.

### 4.3 Viabilidade, componentes e custos

Baseline da proposta: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`, mantido pela nova consulta ao main antes do registro. Referências CEVRA: tipos e comandos de `packages/project-ir/src/`, `packages/application/src/index.ts`, contrato `packages/contracts/src/composition.ts` e ADRs 0010/0012/0013. Revalidar antes da implementação dependente.

| Classificação | Situação |
|---|---|
| Primitivas existentes | Palavras com tempos, blocos `CaptionCue`, comandos de alteração de legendas e ProjectHistory. Isso não entrega por si só agrupamento legível ou medição visual. |
| Integração/extensão interna | Formar grupos, medir texto com a fonte efetivamente utilizada, verificar tempo de exibição, representar os parâmetros que faltarem de forma validada e ligar o compilador ao renderizador, à aplicação e à UI. Reutilizar primeiro o que for correto; nenhuma migração especulativa ou segunda timeline. |
| Ponta a ponta | As proteções de agrupamento, medição e apresentação propostas não estão demonstradas integradas no aplicativo. Testes dos tipos/histórico não provam legibilidade no render. |
| Externo/não verificado | Nenhum novo modelo ou API paga identificado como obrigatório para o núcleo. A medição visual depende da solução de composição; não foi selecionada biblioteca ou fonte. Qualquer incorporação futura requer versão exata, proveniência, licença/termos e compatibilidade comercial. |

**Benefício esperado:** reduzir quebras inadequadas, texto excessivamente pequeno e palavras rápidas demais para leitura. **Contrapartida:** manter e testar regras por estilo. Contagem rígida seria simples, mas ignora largura/duração; redução indiscriminada pode prejudicar leitura; análise semântica por quebra adicionaria custo e complexidade não justificados. Recomenda-se a extensão local proporcional dos comportamentos úteis.

Processamento e armazenamento adicionais concentram-se em texto, tempos, medições e parâmetros; renderização tem custo separado. Tempo/RAM/armazenamento/espera e esforço não foram medidos. Não prometer custo desprezível, hardware mínimo ou qualidade superior. Evitar nova transcrição por alteração de agrupamento puramente visual, cópias integrais e pré-render de todas as combinações. A necessidade real de análise de fala continua regida pela decisão 15.

Director impact: agrupamento mecânico e medição não dependem de nova chamada editorial; intenção/ênfase ambígua pode permanecer no planejamento autorizado. Não alterar significado ou ultrapassar permissões para resolver um problema de layout. Expansão material de arquitetura, dependência ou custo deve voltar ao product owner antes do código.

### 4.4 Momento de implementação, divergência e validação

**IMPLEMENTAR NA FATIA DE LEGENDAS, após a base temporal da decisão 15 e junto da integração visual.** Nenhuma nova operação obrigatória de Media Runtime foi identificada. O gate atual continua aberto; não colocar agrupamento tipográfico no worker ou reabrir motores fechados por causa desta decisão.

Conferir com o EDVID, nos mesmos tipos de material: fala rápida, pausas, palavras longas, números e unidades, negações, palavras isoladas de ênfase, estilos de uma e duas linhas e variantes animadas/estáticas. Verificar legibilidade, preservação de todas as palavras e da ordem, sincronismo, duração útil, largura real da fonte, ausência de texto residual indevido em pausas e preservação da identidade de cada estilo. Medir consumo por operação representativa e manter controles/correções editáveis.

Registrar como **DIVERGÊNCIA EDVID** a mudança concreta de comportamento que efetivamente ocorrer, com evidência proporcional de paridade/melhoria; não registrar como novidade aquilo que o EDVID já faz nem declarar a comparação aprovada antes do teste. Os limiares finais serão escolhidos e validados na fatia executável. Falha de qualidade ou custo desproporcional exige solução mais simples/revisão antes de ampliar escopo.

### 4.5 Redação objetiva aprovada

> O CEVRA organizará as palavras em grupos legíveis conforme o estilo escolhido, respeitando a fala, os tempos e o espaço disponível. Evitará quebras inadequadas, redução excessiva do texto e palavras exibidas rápido demais, sem resumir a fala nem trocar silenciosamente o estilo. Reutilizará os comportamentos úteis do EDVID, com processamento local e validação por estilo.

## 5. Decisão 17 — Caption Placement Planner, safe-zones e QA de legendas

**APROVADA originalmente em 2026-09-16 e REFINADA em 2026-09-18.** Este refinamento preserva a decisão de posicionamento estável/adaptativo e acrescenta uma estratégia local progressiva inspirada nas capacidades úteis observadas no HyperFrames `embedded-captions`, sem importar seu catálogo de 35 estilos, seu U2Net ou sua arquitetura de legendas como nova fonte de verdade.

A decisão 15 — fidelidade, origem e sincronização — **não é reaberta**. Texto e timing continuam vindo da base temporal canônica já aprovada. Esta decisão trata de **onde e como a legenda é apresentada e validada visualmente**.

### 5.1 O que foi reaproveitado da investigação HyperFrames

A revisão do `embedded-captions` mostrou capacidades técnicas úteis:

- safe-zones calculadas a partir da silhueta real, e não apenas de bounding box;
- zonas por intervalo temporal, considerando movimento do sujeito;
- áreas limpas à esquerda/direita/topo;
- regiões próximas à silhueta quando esteticamente útil;
- medição de luminância/risco de washout;
- preview rápido de frames compostos antes do render completo;
- QA de oclusão/overflow/legibilidade;
- possibilidade de texto hero atrás do sujeito.

O CEVRA adotará **os princípios que melhoram qualidade e eficiência**, não o pipeline inteiro.

Não adotar automaticamente:
- os 35 estilos/identidades do HyperFrames;
- U2Net como motor obrigatório;
- transcrição própria do workflow HyperFrames;
- regras de paleta que substituam Brand Kit/preset;
- blur/óptica/iluminação avançados na V1;
- qualquer segunda timeline/estado audiovisual.

### 5.2 Caption Placement Planner

O CEVRA terá um planejador local de posicionamento que combine, conforme disponibilidade:

```text
Caption style/layout defaults
+ delivery safe areas
+ title/headline
+ split/B-roll/known overlays
+ explicit user position
+ face/person evidence
+ sampled subject mask when justified
+ luminance/legibility
→ Caption Placement Plan por intervalo
```

O resultado é determinístico/derivado. Não exige IA externa para cálculos geométricos ou avaliação básica de ocupação.

O usuário pode:
- manter posição automática;
- fixar posição geral;
- fixar posição apenas em um trecho.

Posição explicitamente fixada tem prioridade e não é sobrescrita silenciosamente. Conflito real deve ser informado.

### 5.3 Escalonamento progressivo em quatro níveis

Não executar análise pesada por padrão. O Planner sobe de nível somente quando a informação disponível é insuficiente para uma decisão segura/útil.

#### Nível 1 — layout e geometria conhecidas

Usa:
- aspecto/formato;
- platform safe areas;
- posição característica do estilo;
- título/headline;
- split-screen;
- B-roll/overlays conhecidos;
- posições explicitamente configuradas.

É o default.

**Permanece em N1** quando a região calculada é válida e não existe risco relevante conhecido de conflito com sujeito/conteúdo.

#### Nível 2 — evidência leve de face/pessoa

Ativa quando:
- a região preferida pode colidir com o apresentador;
- há tracking/face/person evidence já disponível;
- composição muda e a posição do sujeito importa;
- confiança geométrica do N1 não é suficiente.

Usa tracking leve/região aproximada, evitando matting completo.

**Encerra em N2** quando a região livre fica suficientemente clara.

#### Nível 3 — máscara amostrada / occupancy map

Ativa quando:
- bounding/face region é insuficiente;
- sujeito ocupa geometria irregular;
- posição muda ao longo do intervalo;
- há risco material de cobrir rosto/produto/demonstração;
- decisão entre zonas candidatas continua ambígua.

Usa somente frames representativos/necessários e um `SubjectMaskProvider` abstrato para produzir occupancy/safe zones.

Não exige máscara de todos os frames.

#### Nível 4 — matting temporal completo

Ativa somente quando o efeito necessita oclusão frame a frame, por exemplo:
- HeroEmphasis atrás do sujeito;
- texto/elemento realmente passando por trás da pessoa;
- composição behind-the-subject.

N4 **não é necessário para legenda comum**.

### 5.4 Critério de escalada

A escolha do nível não é uma decisão criativa arbitrária do agente.

O Planner avalia sinais objetivos, por exemplo:
- interseção com safe areas proibidas;
- interseção com overlays conhecidos;
- região estimada do sujeito;
- baixa confiança/alta variabilidade da ocupação;
- mudança de layout no intervalo;
- luminância/contraste inadequados;
- pedido explícito de behind-subject.

Os thresholds numéricos finais de confiança, interseção e variabilidade **não são fixados por esta decisão**. Devem ser calibrados em fixtures reais durante implementação/benchmark e permanecer versionados/testáveis.

Princípio:

```text
usar o menor nível que resolve o problema
→ escalar somente por necessidade concreta
```

### 5.5 Safe-zones por intervalo

Safe zones podem variar ao longo do vídeo.

Exemplo:

```text
00:00–00:08  lower-third padrão
00:08–00:14  split entra → legenda reposiciona
00:14–00:24  volta à posição anterior
00:24–00:30  sujeito ocupa a região → ajuste localizado
```

Não movimentar a caixa continuamente sem necessidade. Mudanças devem ocorrer em pontos compreensíveis, estáveis e coerentes com a composição.

Ao encerrar um layout temporário, remover seu override e retornar à posição apropriada anterior; não carregar janela obsoleta.

### 5.6 SubjectMaskProvider

Safe-zone/matting não deve depender de um modelo específico.

Contrato conceitual:

```text
SubjectMaskProvider
→ mask/occupancy evidence
→ Caption Placement Planner / Behind-subject compositor
```

O provider concreto será decidido no marco de matting/segmentation já aprovado.

Isso permite usar futuramente PP-Matting/PP-MattingV2 ou outro candidato validado sem acoplar legendas ao U2Net do HyperFrames.

Para N3, provider pode ser chamado apenas em amostras.  
Para N4, precisa fornecer sequência temporal adequada.

### 5.7 Luminância e legibilidade

Após escolher uma região, o CEVRA pode medir luminância/contraste local para validar leitura.

Hierarquia visual:

```text
Brand Kit
→ preset/estilo
→ preferência explícita do usuário
→ fallback automático de legibilidade
```

A cena **não redefine automaticamente a identidade da marca**.

Ações permitidas, somente quando suportadas pelo estilo:
- variante clara/escura;
- sombra/contorno/fundo já previstos;
- mudança para outra zona;
- aviso de conflito.

Não criar novas famílias de legenda para resolver contraste.

### 5.8 Paleta, óptica e iluminação

**V1:** não usar análise de paleta da cena para substituir Brand Kit/preset.

Paleta automática pode ser fallback posterior quando nenhuma identidade foi definida.

Análise avançada de:
- profundidade/blur;
- integração óptica;
- direção de iluminação;
- sombras “fisicamente” coerentes;

fica **pós‑V1**, para discussão no bloco Advanced Embedded/3D Effects, quando matting e 3D básicos já estiverem validados.

### 5.9 Preview rápido por snapshots

Antes de render completo, CEVRA poderá gerar snapshots compostos em tempos representativos.

A seleção deve priorizar:
- início/final de intervalos;
- mudança de layout;
- captions visualmente densas;
- HeroEmphasis;
- splits;
- regiões sinalizadas pelo QA;
- amostras distribuídas quando necessário.

Objetivo:
- verificar qualidade com custo muito menor que render completo;
- alimentar QA automático/Codex;
- gerar material pronto quando julgamento humano for realmente necessário.

Isso não cria nova fonte audiovisual; snapshots são derivados descartáveis.

### 5.10 Caption QA

Adicionar QA local/determinístico, conforme capacidades entregues, para detectar:

- texto fora do frame;
- violação de delivery/platform safe area;
- overflow/clipping;
- grupos simultâneos indevidos;
- conflito com headline;
- conflito com split/B-roll/overlay conhecido;
- sobreposição relevante com sujeito quando houver evidência;
- contraste/legibilidade inadequados;
- override de layout que não retornou ao fim do intervalo;
- posição fixa do usuário sobrescrita;
- divergência material preview/export.

QA gera PASS/WARN/FAIL/UNKNOWN conforme evidência; não ganha autoridade para alterar silenciosamente o projeto.

### 5.11 HeroEmphasis

`HeroEmphasis` é uma capability visual independente, **não um sétimo estilo de legenda**.

Exemplo:

```text
estilo de legenda = Empilhado
+
palavra-chave seletiva = HeroEmphasis behind-subject
```

O efeito pode:
- usar uma palavra/frase curta de alto impacto;
- aparecer grande;
- ficar parcialmente atrás do sujeito;
- coexistir com o estilo EDVID normal.

Requer N4/temporal matting para behind-subject verdadeiro.

A decisão de **quando sugerir/ativar HeroEmphasis** será feita no momento imediatamente anterior à implementação dessa capability, depois de Caption Placement/QA estarem fechados. Essa decisão deverá considerar:
- importância semântica;
- viabilidade visual;
- preset/Brand Kit;
- autonomia autorizada do Director;
- escassez/densidade máxima;
- opção do usuário para forçar/desligar.

Não banalizar o efeito.

### 5.12 Relação com os seis estilos EDVID

Os seis estilos EDVID permanecem o catálogo V1:

- Karaokê;
- Empilhado;
- Disperso;
- Simples;
- Serifada;
- Clássica;
- Nenhum.

Placement, safe-zones, QA e HeroEmphasis são capacidades auxiliares, não novas famílias.

### 5.13 Custo/viabilidade

Benefício:
- menos sobreposições;
- menos renders desperdiçados;
- posicionamento mais robusto;
- melhor legibilidade;
- reaproveitamento do mesmo matting/segmentation planejado para outras funções.

Controle de custo:
- N1 por padrão;
- reutilizar tracking/masks já válidos;
- N2/N3 somente quando necessário;
- N4 somente para efeito que realmente exija matte temporal;
- snapshots seletivos, não render de todas as combinações.

Nenhuma API paga é necessária para o núcleo. Nenhum novo modelo é escolhido aqui.

### 5.14 Momento de implementação

**IMPLEMENTAR NA FATIA DE LEGENDAS + COMPOSIÇÃO.**

Dependências:
- base temporal D15;
- estilos/caption compiler;
- layout/composition state;
- Composition Engine;
- tracking/matting somente nos níveis que deles dependem.

Nenhuma nova operação obrigatória do Media Runtime foi identificada por esta decisão.

Caption Placement/QA não deve bloquear o gate coordenado do MR. Se, durante a especificação executável, surgir necessidade real de nova primitive MR, ela deve ser apresentada antes da rodada coordenada, não inserida silenciosamente.

### 5.15 Validação

Testar:
- 9:16 e 16:9;
- full-screen/split;
- headline + caption;
- rosto central/lateral;
- sujeito se movendo;
- mãos/objetos;
- fundo claro/escuro;
- mudanças de layout;
- posição fixa pelo usuário;
- N1→N2→N3 escalation;
- N4/behind-subject quando disponível;
- preview vs export;
- custo/latência de cada nível;
- ausência de análise pesada desnecessária.

### 5.16 Redação consolidada

> O CEVRA utilizará um Caption Placement Planner local e progressivo. O posicionamento começa por layout, estilo e safe areas conhecidos e só escala para tracking, máscaras amostradas ou matting temporal quando a evidência disponível não for suficiente ou o efeito realmente exigir oclusão. Safe-zones serão calculadas por intervalos quando necessário; Brand Kit/preset terão prioridade sobre sugestões de cor da cena; luminância servirá à legibilidade. Preview amostrado e Caption QA verificarão conflitos antes do render completo. HeroEmphasis será uma capability independente, condicionada a matting adequado e a decisão posterior de uso editorial.

---

## 6. Decisão 18 — Personalização limitada dos estilos existentes — PÓS‑V1

**APROVADA CONDICIONALMENTE em 2026-09-16 e ADIADA PARA REAVALIAÇÃO PÓS‑V1 em 2026-09-18.** O product owner determinou: “Não vamos criar novas possibilidades de legendas neste momento. Vamos usar o que o EdVideo entrega” e condicionou as melhorias propostas à ausência de grande trabalho adicional para obter apenas pequenas edições. Nesta conversa, EdVideo refere-se ao EDVID de revisão fixada, não a outro produto.

### 6.0 Refinamento de prioridade em 2026-09-18

O Product Owner decidiu não gastar escopo V1 com personalização adicional dos estilos. Portanto:

- **os seis estilos EDVID + Nenhum continuam V1** por paridade e pertencem às decisões 14/17;
- controles extras de cor, tamanho, fonte, contorno, sombra, fundo e outras personalizações da decisão 18 ficam para **pós‑V1**;
- não implementar essas personalizações apenas porque algum componente upstream já expõe parâmetros;
- Brand Kit V1 pode escolher preset/identidade já suportada e parâmetros estritamente necessários para capacidades V1, mas não reabre o editor tipográfico da D18;
- após a V1, reavaliar benefício, demanda, manutenção e compatibilidade com Brand Kit antes de escolher quais controles entram.

A decisão permanece registrada para não perder pesquisa anterior, mas **não é requisito de implementação/homologação da V1**.

Esta redação delimitada prevalece sobre uma leitura irrestrita da proposta de personalização anterior. Não transformar a aprovação em obrigação de construir um editor tipográfico completo, catálogo novo ou motor de animação genérico. Não afirmar que o esforço é pequeno antes da avaliação executável.

### 6.1 Referência EDVID inspecionada

Mesma referência: `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`, SKILL.md e referências shortform/longform já lidas.

- [StackedCaptions.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/StackedCaptions.tsx) contém escala e deslocamento configuráveis (`fontScale`, `stackedOffsetY`), composição tipográfica por funções, cores e outros detalhes fixos, além de configuração própria de SFX. A existência de parâmetros no componente não significa controle uniforme na UI nem autorização de música/SFX nesta decisão.
- [ScatterCaptions.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/ScatterCaptions.tsx) lê tamanho, largura e posição (`scatterFontSize`, `scatterSafeWidth`, `scatterOffsetY`), preservando uma estrutura de animação e tipografia própria.
- [SimpleCaptions.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/SimpleCaptions.tsx) define variantes estáticas com configurações próprias no código. [Main.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/Main.tsx) e o catálogo da interface complementam as escolhas descritas na decisão 14.

A personalização não é uniforme entre componentes e interface. Esses fatos resultam de inspeção do código na discussão, não de novo teste de renderização. Não presumir que trocar um literal de cor entrega, sozinho, controle validado, persistência, undo/redo e equivalência preview/export.

### 6.2 Escopo aprovado e limite de esforço

1. **Catálogo existente como piso e limite atual.** Manter os seis estilos EDVID já identificados (Karaokê, Empilhado, Disperso, Simples, Serifada e Clássica), Nenhum e as capacidades de legendagem pertinentes, inclusive o caminho SRT já previsto. Não acrescentar novas famílias de legenda/animação por esta aprovação; não reduzir o piso de paridade para economizar trabalho.
2. **Melhorias incrementais, condicionadas ao custo.** Preferir expor parâmetros que os componentes já oferecem. Tamanho, cor do texto/destaque e fontes compatíveis foram propostos, mas só entram quando o acréscimo total for proporcional. Não assumir autorização para biblioteca extensa de fontes, importação arbitrária, sistema genérico de estilos ou combinação irrestrita de efeitos. Contorno, sombra ou fundo só aparecem como controles se forem compatíveis com o estilo e com capacidade real implementada dentro desse limite.
3. **Identidade preservada.** Alterar cor/tamanho não deve alterar automaticamente texto, sincronismo ou animação. Em estilos que misturam fontes, preservar suas funções, salvo pedido explícito e suportado. Mudança de fonte/tamanho pode recalcular agrupamento e ocupação conforme decisões 16–17; isso não autoriza modificar a fala. Não criar novas animações em resposta a uma simples personalização.
4. **Restauração delimitada.** Voltar à aparência padrão do estilo sem apagar correções de texto nem refazer a montagem. Reutilizar o salvamento de combinação como preset próprio já aprovado na decisão 14, sem construir outro sistema de presets.
5. **Controles honestos.** Não expor botões sem efeito ou opções futuras como executáveis. Preservar validação, comandos/ProjectHistory, persistência e capacidade real de renderização.
6. **Regra de parada.** Antes do prompt dependente, separar trabalho necessário para portar/integrar corretamente o EDVID do trabalho extra de cada melhoria. Se uma personalização exigir reforma relevante, dependência nova ou grande custo para benefício pequeno, não implementá-la sob esta aprovação: manter a capacidade EDVID, explicar a alternativa mais simples e voltar ao product owner para decidir simplificação/adiamento. A condição não é dispensa de qualidade, segurança ou integração canônica e não revoga silenciosamente decisões 14–17.

Exemplo discutido: escolher Empilhado e trocar o destaque laranja pelo azul da marca, diminuindo um pouco a legenda, sem reconstruir a organização/animação. O exemplo é alvo de melhoria condicionada, não prova de que todos os estilos já aceitam esses ajustes ou de que fazê-los é trivial.

### 6.3 Viabilidade, alternativas e custo-benefício

Baseline revalidado: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`. Referências CEVRA inspecionadas nesta rodada: [types.ts](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/project-ir/src/types.ts), [commands.ts](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/project-ir/src/commands.ts), [Inspector.tsx](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/apps/desktop/src/components/Inspector.tsx), contrato de composição e ADRs 0010/0012/0013. Os mesmos arquivos permanecem no baseline consultado; revalidar antes do código.

| Classificação | Situação / mínimo adicional |
|---|---|
| Primitivas | `StyleState`, identificação de estilo, cor de destaque, referências por legenda, `style.patch`, comandos de legenda e histórico. |
| Ponta a ponta | Personalização proposta ainda não integrada. Fonte/tamanho/posição no inspetor consultado são campos de apresentação/somente leitura; isso não prova aplicação real. |
| Extensões/integração | Parâmetros fechados por estilo, validação, ligação aos componentes de composição, controles funcionais, persistência/undo/redo e restauração do padrão. Reutilizar os contratos que representarem corretamente o necessário; não migrar o IR por antecipação. |
| Externo / não verificado | Nenhum novo modelo ou API paga obrigatório identificado para configurar esses parâmetros. Render depende da composição e do benchmark. Nenhuma fonte, biblioteca, peso, LUT ou serviço selecionado/incorporado. |

**Benefício:** personalizar identidade visual mantendo os modelos prontos. **Contrapartida:** mais combinações para testar e manter. Foram comparados estilos totalmente fechados, controles limitados e editor irrestrito; preferir controles limitados de baixo acréscimo, mantendo o padrão EDVID quando o extra não compensar.

O custo incremental não é só adicionar um seletor: inclui representação, compilação, UI, histórico/persistência, compatibilidade e teste visual. Configuração determinística não requer retranscrição nem IA por alteração. Fontes, medições, amostras e render têm consumo próprio de CPU/RAM/armazenamento/espera; carregar apenas o necessário e não todas as combinações. Nenhum número de esforço, economia ou hardware mínimo foi medido nesta discussão.

Qualquer fonte ou dependência efetivamente incorporada exige versão exata, licença/proveniência, redistribuição comercial, termos e privacidade investigados. A licença do repositório EDVID não comprova automaticamente a elegibilidade de cada ativo/dependência. Nenhuma auditoria jurídica concluída ou risco zero é alegado.

### 6.4 Momento e validação

**PÓS‑V1 — REAVALIAR ANTES DE IMPLEMENTAR.** Se aprovada novamente após a V1, implementar de forma proporcional com os componentes visuais de legendas, apoiados nas decisões 15–17 e no sistema de presets da 14. Definir parâmetros realmente suportados antes dos controles; testar junto do componente para evitar uma UI desconectada. Não postergar indevidamente o piso EDVID para terminar personalizações opcionais.

Nenhuma nova operação obrigatória do Media Runtime foi identificada por esta decisão. A frente coordenada atual e sua sequência não se alteram. Não reabrir os motores existentes nem antecipar editor genérico de animações.

Validar aparência padrão e personalizada, fontes efetivamente usadas, legibilidade, cores aplicadas, agrupamento, ocupação, sincronismo, restauração sem perda de correções, persistência e undo/redo. Comparar resultado, amostra e exportação com EDVID. Registrar como **DIVERGÊNCIA EDVID** a personalização que efetivamente ampliar comportamento, sem declarar ganho antes da comparação. A validação inclui se o benefício justifica o acréscimo de implementação/manutenção; nenhuma renderização/benchmark foi executado por este registro.

### 6.5 Redação consolidada da aprovação condicionada

> O CEVRA usará o catálogo e os comportamentos de legenda existentes no EDVID, sem criar novas famílias neste momento. As melhorias de aparência propostas serão adotadas somente quando puderem ser integradas com acréscimo proporcional, preservando a identidade do estilo, texto, sincronismo, correções e controles reais. Não haverá grande reforma para obter apenas pequenas personalizações; se esse custo aparecer, manter o recurso EDVID e retornar a alternativa delimitada para decisão antes de implementar. A execução ocorrerá nas fatias de legendas/composição, sem ampliar agora o Media Runtime.

### 6.6 Esclarecimento solicitado — modo local, IA e transparência do Director

O product owner perguntou se o usuário saberá quando o Director não tiver IA externa para consulta. Este esclarecimento aplica o [registro já aprovado do Director](https://github.com/inlifemedicina/cevra/blob/fe4c58b6d2100b95f636c4e2b07c7cf03bc95be6/docs/CEVRA_DIRECTOR_DECISIONS.md), especialmente seções 6, 8, 10, 11 e 12, relidas nesta atualização. Não é aprovação de uma decisão 19 nem escolha de provedor, modelo ou design final de interface.

- **Informar capacidade e uso real.** Distinguir execução local por regras/preset, inferência local efetivamente disponível para a tarefa e consulta externa autorizada. IA externa conectada não significa IA externa consultada em toda operação; um render local pode utilizar um plano obtido externamente antes. Não rotular o fluxo inteiro como sem IA ou sem envio de dados só porque a etapa atual é local.
- **Sem equivalência fictícia.** Ausência de IA externa não ativa automaticamente uma IA local de raciocínio geral. Transcrição/alinhamento locais não demonstram interpretação de qualquer pedido criativo ou compreensão visual universal. Nenhum modelo local geral foi escolhido nesta rodada.
- **Limitação compreensível.** O usuário deve saber o que pode ser executado com recursos disponíveis e qual parte do pedido depende de capacidade ausente. Presets e ações determinísticas suportadas continuam úteis; pedido sem interpretação confiável não deve ser convertido silenciosamente em outra edição nem apresentado como atendido integralmente.
- **Falha durante a operação.** Limite, erro ou desconexão exigem informar o impedimento confirmado, preservar estado e pausar a parte dependente. Continuar somente trabalho independente seguro e autorizado; não trocar provedor, cobrar API, enviar mais dados ou reduzir silenciosamente o resultado para simular sucesso. Se a causa/ quota não estiver disponível por mecanismo oficial, marcar desconhecido em vez de inventar motivo ou saldo.
- **Exemplos de comunicação, não strings finais aprovadas:** “Execução local por preset; nenhuma consulta externa nesta etapa”; “IA local — modelo disponível para esta tarefa”; “IA externa — provedor/modelo utilizado”; “Interpretação solicitada indisponível; os ajustes locais continuam disponíveis”. Preferir informação proporcional ao impacto, sem exigir alerta modal a cada ajuste simples.

Implementação pertence ao Director/aplicação, ao adapter de conexão e à UI/host: propagar capacidades/estado de conexão/resultado reais, identificar a etapa e mostrar limites. Usar metadados/eventos oficiais, não consultar o modelo para descobrir o plano do usuário nem raspar a interface de contas. Seguir atualização de capabilities por conexão, mudança, expiração justificada ou falha pertinente, sem polling pesado obrigatório.

O `DirectorPanel.tsx` consultado já mostra disponibilidade geral de execução por capability, mas não demonstra esse acompanhamento completo por provedor/etapa. Logo, transparência é direção existente a integrar, não função pronta anunciada. Esforço e consumo da integração dependem do adapter real; não exigem por si um segundo motor de mídia ou novo modelo. Provar ausência de substituição silenciosa, mensagens coerentes em falha/limite e preservação do trabalho na fatia do Director. Não ampliar o inventário MR por este esclarecimento.

## 7. Handoff e integração documental

Antes de qualquer prompt dependente no CEVRA 3, recuperar o estado real do main e dos PRs. Até a integração, ler explicitamente PR #26 / `docs/editorial-decisions-1-8`: registro editorial v4 para decisões 1–13 e inventário MR; este documento v5 para decisões 14–18, sendo a 18 condicionada; e o registro do Director no PR #25/revisão aplicável. A seção 6.6 esclarece políticas já existentes e não equivale a nova decisão numerada.

No fechamento documental autorizado, acrescentar ao Master Context um resumo curto e links para ambos os registros, o estado real dos marcos/branches e a prioridade do MR; reconciliar AGENTS sem duplicar detalhes ou apagar políticas concorrentes. Esta rodada não deve impedir o fechamento das aprovações já existentes nem ser confundida com autorização para mesclar uma feature.

Resumos para o índice global, a integrar no momento correto:

> 2026-09-16 — Decisão 14 aprovada: direção visual por presets ajustáveis e controles independentes; reaproveitamento de preferências, combinações próprias sem conteúdo específico, proteção de versões/projetos e amostras representativas do render. Preservar o piso EDVID shortform/longform. Catálogo/presets ainda não estão disponíveis de ponta a ponta; preparar referências nos contratos depois dos ajustes coordenados e integrar nas fatias de presets/legendas/composição. Nenhuma nova operação MR obrigatória identificada. Detalhes e validações pendentes em `docs/CEVRA_VISUAL_DECISIONS.md`. Apenas direção de produto, sem código/merge/gasto autorizado.

> 2026-09-16 — Decisão 15 aprovada com escopo/esforço a validar: legenda fiel à fala e ao tempo real do áudio; reaproveitamento condicionado de transcrição/alinhamento, análise adicional quando necessária, correções editáveis e preservadas se ainda válidas. Integração temporal considera MR-A05/MR-V01 já previstos; compilador/referências na fatia de legendas. Nenhuma nova operação MR ou API paga obrigatória identificada. Não foi demonstrado esforço pequeno; expansão material volta ao product owner antes da implementação. Detalhes, divergência EDVID e validações em `docs/CEVRA_VISUAL_DECISIONS.md`, versão 2.

> 2026-09-16 — Decisão 16 aprovada: agrupamento legível por estilo, com pausas/pontuação/largura/tempos, evitando quebras inadequadas, texto minúsculo e palavras que apenas piscam; sem resumir a fala, trocar silenciosamente estilo ou exigir IA por quebra. Reutilizar comportamentos EDVID existentes. Implementar na fatia de legendas após a base temporal da decisão 15 e junto da integração visual. Nenhuma nova operação MR obrigatória identificada; parâmetros, consumo e paridade continuam pendentes. Detalhes em `docs/CEVRA_VISUAL_DECISIONS.md`, versão 3.

> 2026-09-16 — Decisão 17 aprovada: posição de legenda própria do estilo/layout, estabilidade da caixa, adaptação às inserções e margens, ajustes gerais ou por trecho sem sobrescrever posições explícitas. Evitar sobreposição conforme evidência disponível, sem rastreamento contínuo obrigatório nem promessa de detectar todo objeto. Implementar com legendas/composição depois das bases 15–16; nenhuma nova operação MR obrigatória identificada. SRT não recebe promessa de layout idêntico. Detalhes, viabilidade e validação pendente em `docs/CEVRA_VISUAL_DECISIONS.md`, versão 4.

> 2026-09-16 — Decisão 18 aprovada condicionalmente: manter catálogo EDVID, sem novas famílias de legenda, e adotar personalizações apenas se o acréscimo de implementação/manutenção for proporcional. Não realizar grande reforma para pequenas edições; custo material volta para decisão. Implementar com componentes visuais de legendas/composição; nenhuma operação MR adicional identificada. A seção 6.6 esclarece o dever já previsto do Director de distinguir regras locais, IA local realmente capaz e consulta externa, informar indisponibilidade e não degradar silenciosamente o pedido. Detalhes em `docs/CEVRA_VISUAL_DECISIONS.md`, versão 5.

Próximos temas são candidatos à discussão, não aprovações: composição/layouts e inserções; B-roll/ativos; música/SFX e geração conforme dependências. Não abrir novas famílias de legendas ou personalização ampla nesta rodada sob a aprovação condicionada. Continuar a numeração real a partir de 19 quando houver nova decisão material necessária. Não transformar esclarecimentos, escolhas técnicas rotineiras ou o mapa em novas aprovações automáticas.

Aprovações posteriores devem ser registradas com seus detalhes e limites, e revisões materiais precisam de aprovação e marcação explícita de substituição/refinamento. Ao final da rodada, consolidar decisões, dependências, pendências e ordem de implementação em handoff autossuficiente, com localização e situação de integração. Não alegar envio automático de mensagem para outro chat.
