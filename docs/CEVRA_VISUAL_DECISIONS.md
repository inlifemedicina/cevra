# CEVRA — Decisões visuais e de produção: continuidade a partir da decisão 14

**Data:** 2026-09-16, aprovação do product owner nesta rodada de continuidade.
**Versão deste registro:** 2.
**Status:** DIREÇÃO DE PRODUTO APROVADA / IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.
**Decisões aprovadas neste documento:** 14 e 15, respeitadas as condições de viabilidade e escopo abaixo. Não há aprovação implícita de uma decisão 16 ou posterior.

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
| Extensão interna mínima | Catálogo validado; resolução das escolhas; biblioteca local de presets; registro de versão e parâmetros resolvidos; integração aplicação–Desktop Host–UI; ligação aos compiladores de legenda/composição. Avaliar o que os campos/comandos existentes representam corretamente; ampliar somente lacunas demonstradas, sem migração especulativa ou objetos não validados em `extensions`. |
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

## 4. Handoff e integração documental

Antes de qualquer prompt dependente no CEVRA 3, recuperar o estado real do main e dos PRs. Até a integração, ler explicitamente PR #26 / `docs/editorial-decisions-1-8`: registro editorial v4 para decisões 1–13 e inventário MR; este documento v2 para decisões 14–15; e o registro do Director no PR #25/revisão aplicável.

No fechamento documental autorizado, acrescentar ao Master Context um resumo curto e links para ambos os registros, o estado real dos marcos/branches e a prioridade do MR; reconciliar AGENTS sem duplicar detalhes ou apagar políticas concorrentes. Esta rodada não deve impedir o fechamento das aprovações já existentes nem ser confundida com autorização para mesclar uma feature.

Resumos para o índice global, a integrar no momento correto:

> 2026-09-16 — Decisão 14 aprovada: direção visual por presets ajustáveis e controles independentes; reaproveitamento de preferências, combinações próprias sem conteúdo específico, proteção de versões/projetos e amostras representativas do render. Preservar o piso EDVID shortform/longform. Catálogo/presets ainda não estão disponíveis de ponta a ponta; preparar referências nos contratos depois dos ajustes coordenados e integrar nas fatias de presets/legendas/composição. Nenhuma nova operação MR obrigatória identificada. Detalhes e validações pendentes em `docs/CEVRA_VISUAL_DECISIONS.md`. Apenas direção de produto, sem código/merge/gasto autorizado.

> 2026-09-16 — Decisão 15 aprovada com escopo/esforço a validar: legenda fiel à fala e ao tempo real do áudio; reaproveitamento condicionado de transcrição/alinhamento, análise adicional quando necessária, correções editáveis e preservadas se ainda válidas. Integração temporal considera MR-A05/MR-V01 já previstos; compilador/referências na fatia de legendas. Nenhuma nova operação MR ou API paga obrigatória identificada. Não foi demonstrado esforço pequeno; expansão material volta ao product owner antes da implementação. Detalhes, divergência EDVID e validações em `docs/CEVRA_VISUAL_DECISIONS.md`, versão 2.

Próximos temas são candidatos à discussão, não aprovações: agrupamento/legibilidade e demais detalhes de legendas; composição/layouts e inserções; B-roll/ativos; música/SFX e geração conforme dependências. Continuar a numeração real a partir de 16. Subdividir temas quando necessário para decidir um comportamento por resposta, sem inventar aprovações ou transformar o mapa em escopo automático.

Aprovações posteriores devem ser registradas com seus detalhes e limites, e revisões materiais precisam de aprovação e marcação explícita de substituição/refinamento. Ao final da rodada, consolidar decisões, dependências, pendências e ordem de implementação em handoff autossuficiente, com localização e situação de integração. Não alegar envio automático de mensagem para outro chat.
