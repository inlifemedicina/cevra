# CEVRA — Decisões de composição e inserções

**Data:** 2026-09-16.
**Versão:** 2.
**Status:** DIREÇÃO DE PRODUTO APROVADA; IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.
**Decisões aprovadas neste documento:** 19 e 20, com os limites de execução e viabilidade abaixo. Não há aprovação implícita de decisão 21 ou posterior.

## 0. Autoridade e continuidade

Este documento registra o bloco de composição/inserções da rodada antecipada. Contém os detalhes das decisões 19–20, não uma cópia das decisões anteriores nem outro Master Context. As decisões 1–13 permanecem em [CEVRA_EDITORIAL_DECISIONS.md](CEVRA_EDITORIAL_DECISIONS.md), versão 4, e as decisões 14–18 em [CEVRA_VISUAL_DECISIONS.md](CEVRA_VISUAL_DECISIONS.md), versão 5; a aprovação condicionada da 18 e as demais ressalvas continuam válidas. Ler também `docs/CEVRA_MASTER_CONTEXT.md`, `AGENTS.md`, `docs/ARCHITECTURE_V1.md`, `docs/CEVRA_DIRECTOR_DECISIONS.md`, `docs/EDVID_PARITY.md` e ADRs pertinentes na revisão efetivamente aplicável.

Consulta remota anterior à criação da versão 1 (histórico): `main` em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`; PR #26 aberto/draft, não mesclado, branch `docs/editorial-decisions-1-8`, head `f0aada1d265e33f0a9a312b586ef3b83926facac`. Este registro documental não altera main nem a branch de implementação. Não declara cache ou ajustes coordenados concluídos. O registro Director do PR #25 também deve ser recuperado explicitamente enquanto não incorporado.

Na atualização para a versão 2, main foi consultado novamente em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae` e o PR #26 permanecia aberto/draft, não mesclado, no head `04163f0ce2efc9768159a2c1e9ba2cb5a7481d59`, com este arquivo no blob `0afa723e7c82373e47f33bc26b08025707cab0e9`. A decisão 20 foi aprovada com atenção expressa à execução no CEVRA como aplicativo independente, em contraste com o EDVID conduzido por skill em um agente. A atualização preserva a decisão 19 e registra comportamento, viabilidade, dependências e explicação da fronteira de execução. O registro Director foi relido na branch `docs/cevra-director-decisions`, blob `38bcaa6dfc857553bdccb8e7f628026dc74f18bf`, especialmente seções 2–9. Nenhum novo motor, provedor, transporte ou prazo de entrega é escolhido por esta atualização.

A separação temática não cria duas autoridades para uma aprovação: detalhes das decisões 19–20 ficam aqui; detalhes da 14–18 continuam no registro visual, sem duplicação. Até a reconciliação documental, a indicação histórica de próximo número 19 no registro visual deve ser lida junto deste documento mais recente. A próxima proposta será 21, salvo aprovação posterior efetivamente registrada.

Permanece a sequência: concluir o processo real do CEVRA 3; reconciliar registros e apresentar plano delimitado; implementar/revisar/validar os ajustes coordenados acordados; depois retomar avanço funcional dependente. Manter **PAUSA DE AVANÇO — ajustes coordenados do Media Runtime antes da próxima etapa.** O inventário único é a seção 16.2 editorial (MR-A01–MR-A06, MR-V01–MR-V02, MR-Q01). Discussão antecipada não libera código, merge, gasto, modelo, fornecedor ou integração externa. Adiamento material exige aprovação expressa com impacto.

PRESERVE → EXTEND → VERIFY → MIGRATE ONLY IF NECESSARY. Project IR/ProjectHistory continuam como única autoridade audiovisual editável. Nada de segunda timeline, JSON do EDVID como estado concorrente, runtime duplicado, execução arbitrária ou migração especulativa. Original preservado e exportação a partir dos originais/ativos conforme ADR 0013.

## 1. Decisão 19 — Tela dividida: quando usar e como inserir imagem ou vídeo

**APROVADA** pelo product owner com a resposta “Aprovado. Proximo” à proposta detalhada. Essa aprovação é de comportamento, não prova de implementação, esforço pequeno ou resultado de teste.

### 1.1 Referência EDVID verificada

Revisão exclusiva: `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`, não `edvid-lt` nem upstream flutuante.

Referências inspecionadas na proposta: [SKILL.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/SKILL.md), [references/shortform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/shortform.md), [assets/shortform/README.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/README.md), [CustomGraphics.tsx](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/assets/shortform/src/CustomGraphics.tsx). Considerar também [references/longform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/longform.md): esta decisão não reduz toda a composição EDVID ao menu shortform.

- **Instrução/catalogação:** Limpa é o padrão; tela dividida é uma escolha. Duas variantes: mídia em cima/apresentador embaixo e apresentador em cima/mídia embaixo. Aplicação em intervalos, não obrigação de cobrir o vídeo inteiro.
- **Instrução de edição:** entrada/saída nos cortes existentes, corte seco sem dissolvência. Inserções consecutivas mantêm a divisão sem lacunas que causem piscadas. Essas regras instrucionais não são automaticamente impostas por toda API do componente.
- **Código inspecionado:** `SplitInsert`, `SplitScreen` e `SplitFrame` recebem intervalos e variante `top`/`bottom`; aceitam imagem ou vídeo, `cover`/`contain`, altura de faixa. O vídeo ilustrativo usa relógio local, fica mudo e pode repetir; a gravação principal usa seu deslocamento temporal correspondente para continuar no ponto correto.
- **Enquadramento:** referências explicam que zoom/foco dos dois layouts não são intercambiáveis e devem ser conferidos contra a gravação. Título e legenda precisam acompanhar a variante. Não transformar coordenadas de exemplo em solução universal.
- **Limites de portabilidade:** não copiar cegamente `VIDEO_LAG=1`, resolução fixa ou compensações específicas do decoder; preservar o comportamento sincronizado e validar o caminho CEVRA. Não inferir que a política de copiar `cut.mp4` do EDVID substitua a política CEVRA de originais e composição editável.

Nenhum novo render, benchmark ou teste de equivalência foi executado para esta aprovação. Prosa, código e teste realizado são evidências distintas.

### 1.2 Comportamento aprovado

1. **Preservar as duas variantes.** Usar as opções EDVID aprovadas, sem acrescentar novos tipos de layout por esta decisão. O catálogo não autoriza um editor genérico de composição.
2. **Escolher o estilo define a apresentação, não a quantidade.** Selecionar tela dividida determina como apresentar as inserções pertinentes; não obriga a preencher todo o vídeo. O Director pode distribuir intervalos dentro do escopo autorizado; o usuário também pode indicar um trecho específico. Fora deles permanece a composição principal. Limpa não autoriza divisões por preferência estética do Director.
3. **Não modificar a fala.** Inserir, trocar ou retirar a mídia ilustrativa não recorta o áudio, muda sua velocidade, reorganiza takes nem repete fala sem autorização. A montagem aprovada permanece protegida.
4. **Encaixe preferencial nos cortes existentes.** Usar cortes de imagem como encaixes naturais. Se o encaixe afastar a ilustração do assunto ou contrariar intervalo explicitamente solicitado, permitir entrada/saída localizada justificada sem criar corte artificial na gravação. A exceção não autoriza transições arbitrárias nem alterações no conteúdo.
5. **Continuidade de inserções.** Preservar a divisão entre imagens consecutivas quando essa for a intenção, sem flashes de tela cheia. Corte seco é a referência, não dissolvência que revele a gravação por trás.
6. **Troca restrita de mídia.** Substituir imagem/vídeo preserva intervalo e layout, salvo ajuste necessário e visível. Vídeo ilustrativo não ganha áudio automaticamente. Seu início e eventual repetição devem funcionar sem congelamento, mantendo a gravação principal no tempo correto. Repetição é capacidade disponível, não obrigação de repetir toda mídia sem critério.
7. **Enquadramento e textos coordenados.** Título e legenda acompanham a composição, reutilizando a decisão 17. Não esticar a imagem para caber; não presumir que coordenadas fixas preservem todo rosto/produto. Não há garantia de detecção visual universal. Ajustes explícitos e revisões permanecem vinculados ao Project IR/ProjectHistory e à versão assistida.

**Exemplo aprovado:** uma imagem aparece na faixa superior enquanto o apresentador continua falando embaixo; a imagem muda mantendo a divisão estável; encerrada a passagem ilustrada, volta a tela cheia sem cortar ou repetir a fala.

**Fora desta decisão:** seleção/busca de ativos, política detalhada de B-roll, fornecedores, geração, novos layouts, identidade visual, novos modelos de visão/rastreamento e música/SFX. A aprovação não elimina capacidades EDVID fora do split; elas conservam seus marcos próprios.

### 1.3 Viabilidade apresentada e componentes afetados

Baseline inspecionado: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`. Referências CEVRA: [types.ts](../packages/project-ir/src/types.ts), [commands.ts](../packages/project-ir/src/commands.ts), [composition.ts](../packages/contracts/src/composition.ts), [engines/composition/README.md](../engines/composition/README.md), [EDVID_PARITY.md](EDVID_PARITY.md), ADRs 0010, 0012 e 0013. Revalidar a base antes do prompt dependente.

| Classificação | Situação e necessidade |
|---|---|
| Primitivas existentes | Tipos de fontes, imagens/vídeos gráficos, intervalos, regiões/layouts, comandos e histórico. Tipos não comprovam ingestão ou render de todos os formatos. |
| Ponta a ponta | Ainda não demonstrada a tela dividida com planejamento, enquadramento, controles, preview e exportação integrados. O módulo `engines/composition` consultado contém apenas README de direção. |
| Extensões internas | Representar/aplicar inserções e layouts pelo caminho canônico; completar comandos validados que faltarem; resolver tempos e enquadramentos; compilar para o motor de composição; integrar aplicação/host/UI e verificação. Não contornar comandos gravando diretamente arrays gráficos. |
| Externo/não verificado | Motor de composição depende de seleção/integração e benchmark do ADR 0012. Busca de mídia, geração e identificação automática de objetos são dependências separadas, não capacidades já provadas. Nenhum fornecedor ou biblioteca foi escolhido. |

**Verificação adicional ao registrar a aprovação, não fechamento nem ampliação automática:** [LocalSourceIngestService](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/application/src/local-source-ingest.ts) restringe `LocalSourceKind` a áudio/vídeo e reserva ingestão de imagens para capacidade futura com identificação confiável. Portanto, o tipo `image` do Project IR não significa que importar uma imagem já funcione. Essa dependência concreta foi sinalizada ao product owner na continuação e deve ser delimitada na fatia de ingestão de ativos antes das inserções. Preservar a V1; avaliar identificação, metadados/decodificação e integração mínimas antes de implementar. Não acrescentar silenciosamente operação de runtime ou biblioteca ao inventário coordenado. Se a solução exigir mudança material, apresentar impacto/alternativas para aprovação.

### 1.4 Benefício, alternativas, execução local e custos

**Benefício esperado:** entregar a função útil do EDVID com controle, continuidade da fala e integração reversível. **Contrapartida:** composição, enquadramento, estados editáveis e testes reais; não se resume a um botão.

Alternativas: fixar a divisão durante todo o vídeo reduz controle e ignora os intervalos EDVID; copiar todos os limites de referência como obrigatórios pode afastar a ilustração do assunto; criar editor genérico de layouts aumenta escopo. Preferir as duas variantes e intervalos editáveis com exceções justificadas.

Resolver posições/tempos e executar um layout conhecido pode ser local, sem consulta de IA por frame. Decidir criativamente qual ativo usar e em que passagem depende das instruções, evidências e capacidade disponível do Director; cálculo geométrico não oferece compreensão semântica equivalente. Aplicam-se a transparência e os limites descritos no registro Director e na seção 6.6 visual. Ausência de IA externa não cria automaticamente um modelo local geral.

Dois vídeos podem exigir mais decodificação, CPU/GPU, RAM e espera de render do que vídeo com imagem estática. Ativos/previews têm custo de armazenamento. Evitar cópias integrais desnecessárias e reprocessamento da fala para simples troca visual. Consumo, qualidade e esforço ainda não foram medidos; não prometer trabalho pequeno, hardware mínimo ou superioridade. Separar o custo necessário de integração EDVID do extra de melhorias. Recursos/dependências concretos exigem versão/proveniência/licença/termos/privacidade e compatibilidade comercial verificadas, sem promessa de risco zero.

### 1.5 Momento correto e validação

**IMPLEMENTAR NA ETAPA DE COMPOSIÇÃO/LAYOUTS, depois dos ajustes coordenados do Media Runtime**, usando a base temporal e o caminho editável aprovados. Ingestão confiável dos ativos é pré-requisito a completar na sua fatia. Não implementar toda a composição para fechar o MR.

Na proposta não foi identificada nova operação obrigatória para acrescentar agora ao inventário MR. Isso não declara suficiência de todas as interfaces; a delimitação do plano executável deverá conferir necessidades reais e retornar qualquer conflito material antes do código.

Validar: as duas variantes; entrada/saída em corte e exceção localizada; troca entre imagens; intervalos contíguos; vídeos curtos em repetição e sua ausência de congelamento; início local da mídia sem reinício da fala; áudio ilustrativo mudo por padrão; texto/legenda atravessando mudança de layout; enquadramento e proporções; retorno à tela cheia; persistência, desfazer/refazer e proteção das correções. Comparar preview/exportação e a referência EDVID no caminho real de render; não substituir ensaio por compensações fixas do exemplo upstream. Medir recursos e confirmar preservação dos originais/qualidade.

**DIVERGÊNCIA EDVID aprovada como direção, validação pendente:** encaixe nos cortes passa a preferência, com exceção localizada justificada, em vez de obrigação instrucional universal. Benefício esperado: respeitar assunto/trecho solicitado sem criar corte na gravação. Comparar resultado, continuidade e controle; não declarar melhoria sem teste. Outras diferenças materiais encontradas depois precisam de registro e aprovação, não estão cobertas genericamente.

### 1.6 Redação objetiva aprovada

> O CEVRA preservará as duas variantes de tela dividida do EDVID, com imagens ou vídeos aplicados em intervalos editáveis. As inserções não alterarão a fala nem a montagem sem autorização; aproveitarão os cortes existentes, admitindo exceções localizadas justificadas. Trocas de mídia preservarão continuidade, enquadramento e textos associados. A implementação ocorrerá na etapa de composição, sem criar novos layouts ou ampliar agora o Media Runtime.

## 2. Decisão 20 — Como escolher as imagens e os vídeos de apoio

**APROVADA COMO DIREÇÃO DE PRODUTO.** O product owner respondeu: “Sim. Aprovado, com pensamento em como executar isso da melhor forma pois temos o edvid como base, mas ele roda dentro da ia como skill e nos rodaremos fora inicialmente.” A aprovação incorpora a preocupação de manter a capacidade editorial ao separar aplicação e agente; não comprova que o funcionamento independente, a seleção automática ou a integração de IA já existam.

### 2.1 Referência EDVID verificada

Revisão fixa: `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`. A comparação utiliza SKILL.md, referências shortform/longform e helpers, não marketing, `edvid-lt` ou revisão mais recente.

- [references/shortform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/shortform.md) orienta sincronizar inserções com o assunto/fala, usar imagens para objetos concretos e gráficos animados quando pertinentes ao conceito. Isso é orientação editorial ao agente, não prova de seleção semântica autônoma por cada helper.
- [references/longform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/longform.md) prevê B-roll com imagem/vídeo sobre a narração, títulos de capítulos, identificação e destaques pontuais, preservando a diferença de densidade entre longform e shortform.
- [helpers/pexels_search.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/pexels_search.py) executa busca de fotos por consulta textual, download e emissão de créditos. Não implementa, sozinho, avaliação contextual que garanta adequação à passagem. A referência a esse helper não escolhe o fornecedor para CEVRA nem declara suas condições comerciais atuais verificadas.
- [SKILL.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/SKILL.md) conduz o agente por fases, consulta evidências e produção de dados/execução. A inteligência editorial vem do agente que interpreta essas instruções; copiar a skill para um aplicativo sem modelo não reproduz essa compreensão.

Evidências desta proposta: instruções e implementação inspecionadas. Não houve novo teste de renderização, busca de ativos, download, teste semântico ou benchmark.

### 2.2 Comportamento aprovado e limites

1. **Pertinência à passagem.** Inserir algo porque ajuda a passagem e combina com o estilo autorizado; não porque um substantivo foi detectado. Não impor uma inserção a cada intervalo fixo nem ilustrar mecanicamente todas as palavras.
2. **Material adequado já disponível tem preferência.** Quando o usuário fornecer a imagem/gravação exata do que explica, preferi-la a ilustração genérica se tiver qualidade suficiente e for pertinente. A prioridade não obriga a utilizar todo arquivo importado nem a usar mídia inadequada somente por ser local.
3. **Demonstração real não é ilustração genérica.** Não apresentar tela, produto, pessoa ou situação apenas parecidos como se demonstrassem o objeto específico da fala. Uma imagem genérica pode ilustrar um conceito, mas não servir de falsa evidência. Preservar momentos em que o apresentador ou a gravação já mostram o que interessa.
4. **Quantidade, duração e forma pelo conteúdo/pedido.** Respeitar o estilo e os componentes disponíveis ao escolher tela dividida, cartão ou cobertura em tela cheia. Não trocar silenciosamente o estilo; preservar os limites da decisão 19 e da montagem aprovada. Referir B-roll/cartões não significa que seus componentes já estejam entregues nem autoriza layouts inéditos.
5. **Não preencher por obrigação.** Dispensar inserção opcional inadequada. Se faltar material necessário ao pedido, informar a falta e solicitar o material ou a alternativa pertinente. Falta de ativo não autoriza gerar mídia, contratar serviço ou baixar indiscriminadamente.
6. **Seleção contextual depende de capacidade real.** Reutilizar instruções, transcrições e evidências já obtidas, solicitando análise adicional apenas quando necessária. Não exigir nova chamada de IA por imagem/corte/frame. Sem capacidade de interpretação adequada, informar a limitação e usar apenas escolhas explícitas, planos válidos já obtidos e automações suportadas, sem alegar avaliação editorial equivalente.
7. **Execução editável e rastreável.** Aplicar inserções pelo caminho validado de comandos/Project IR/ProjectHistory; preservar ajustes manuais válidos, identidade da fonte, ocorrência da passagem e versão relevante. Uma decisão de ativo não permite reescrever a fala ou alterar a montagem fora da autorização.

**Exemplo aprovado:** ao explicar uma função de aplicativo, preferir a gravação daquela função a uma pessoa genérica diante de computador. Se ela faltar, não fingir que uma tela semelhante demonstra o mesmo procedimento.

### 2.3 Viabilidade e acréscimo mínimo

Baseline da proposta e rechecagem de main no registro: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`. Evidências: [LocalSourceIngestService](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/application/src/local-source-ingest.ts), [Project IR types](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/project-ir/src/types.ts), contrato de composição, `engines/composition/README.md`, ADRs 0010/0012/0013, registro do Director e seção 6.6 visual. Revalidar as capacidades antes dos prompts de implementação.

| Classificação | Situação e acréscimo necessário |
|---|---|
| Primitivas existentes | Transcrições, referências de fontes, intervalos, representação de elementos visuais, ProjectHistory e importação local de áudio/vídeo. |
| Integração/extensões internas | Plano de inserções ligado às passagens, seleção/validação dos ativos, comandos que faltarem, aplicação canônica, controles, compilação, verificação e ligação aplicação/host/UI. |
| Lacuna de ingestão | O serviço V1 não importa imagens confiavelmente; aceita áudio/vídeo e rejeita codecs de imagem nesse caminho. Delimitar a ingestão de imagens antes das inserções, preservando V1. Tipos `image` não bastam. |
| Ponta a ponta | Seleção contextual e apresentação de ativos não estão demonstradas integradas; composição possui contrato/direção, não execução completa. A conexão e o retorno de planos do Director também não estão comprovados disponíveis. |
| Externo/não verificado | Raciocínio editorial pode requerer agente/modelo capaz; motor de composição depende do benchmark. Busca externa, mídia, geração e reconhecimento visual mantêm seleção/auditoria próprias. Nenhum novo fornecedor, modelo ou biblioteca foi escolhido. |

### 2.4 Aplicativo independente versus skill — esclarecimento de execução

Aplicar a divisão já aprovada em [CEVRA_DIRECTOR_DECISIONS.md](CEVRA_DIRECTOR_DECISIONS.md), especialmente seções 3, 4, 6, 7, 8 e 9. Não abrir outra arquitetura de automação para este tema.

- **CEVRA prepara:** disponibiliza pedido, trechos pertinentes, fontes/ativos e amostras visuais necessárias, de forma compacta e com referências à versão do projeto. Preparação local não elimina inferência posterior nem equivale a enviar vídeo inteiro ao provedor.
- **Modelo/agente propõe:** quando houver uma integração autorizada e capaz, a skill/playbook CEVRA preserva o método editorial útil do EDVID e orienta qual ativo usar, a finalidade e a passagem correspondente. O agente retorna proposta estruturada; as decisões criativas não são substituídas por regras simplistas apenas porque o produto roda fora do agente.
- **Director valida e coordena:** confere projeto/versão, referências, capacidades, limites, permissões e aprovação ou autonomia previamente delimitada. O plano retornado é proposta não confiável até validação, não uma segunda timeline.
- **CEVRA executa:** resolve tempos/layout, aplica comandos ao ProjectHistory/Project IR, renderiza e permite revisão local. O agente não recebe acesso arbitrário a shell, arquivos ou argumentos do motor para reproduzir o método EDVID.

O caminho de agente externo com skill própria já é candidato aprovado no Director; não confundir esse reaproveitamento com decisão de fornecedor ou mecanismo final. Skill contém instruções, não cria autenticação, conexão nem retorno automático. O adapter oficial e a elegibilidade técnica/comercial precisam ser validados; enquanto não houver retorno automático comprovado, o handoff/importação de plano, quando implementado, deve ser transparente e não simular integração. Nenhuma dessas capacidades futuras está disponível só pela existência deste registro.

**Sem IA externa:** presets, escolhas indicadas pelo usuário e funções locais suportadas continuam possíveis. Ausência de conexão não ativa um modelo local de raciocínio geral; os motores de fala não garantem seleção semântica de B-roll. Informar o que não foi analisado, sem trocar provedor, cobrar API ou enviar dados silenciosamente. Uma IA externa conectada também não precisa ser consultada para cálculos locais mecânicos.

### 2.5 Benefício, alternativas, recursos e custo-benefício

**Benefício esperado:** mídia mais pertinente, preservação de demonstrações importantes e menos substituições manuais. **Contrapartida:** reunir evidências e selecionar contexto pode consumir inferência; busca/download consomem rede e armazenamento; imagens/vídeos/composição têm custo de decodificação, RAM e renderização. Processos do adapter/agente também têm custo, mesmo com inferência remota.

Alternativas: ilustrar palavras por correspondência fixa é simples, mas pode inserir irrelevâncias ou falsa demonstração; entregar toda a pesquisa e execução a um agente com acesso irrestrito reproduz encargos e riscos incompatíveis com o CEVRA; criar indexação visual ampla/local para substituir imediatamente o agente amplia modelo, hardware e manutenção. Preferir poucos candidatos pertinentes, reuso de evidências e separação entre julgamento editorial e execução determinística. Não impor uma única chamada quando isso prejudicar qualidade; não impor cascata de modelos.

Não construir agora um sistema amplo de indexação visual, novas famílias de legendas/layouts ou um novo modelo local para resolver esta decisão. Separar esforço para paridade/integrar corretamente EDVID do adicional de melhoria. Tempo/CPU/GPU/RAM/armazenamento/espera/custo de IA/manutenção ainda precisam ser medidos, sem promessa de ganho, hardware mínimo ou implementação pequena.

Busca externa e direitos serão tratados nas respectivas fatias. Qualquer dependência, biblioteca, modelo/peso, mídia ou serviço efetivamente incorporado exige investigação da versão exata, licença/proveniência, termos, privacidade e distribuição comercial. Uma mídia fornecida pelo usuário não elimina automaticamente direitos de terceiros. A aprovação não autoriza gasto, download indiscriminado, geração nem uso comercial de ativos não verificados.

### 2.6 Momento correto, validação e divergência

**PLANEJAMENTO NO DIRECTOR / EXECUÇÃO APÓS INGESTÃO DE ATIVOS E COMPOSIÇÃO.** Primeiro preservar o fechamento do trabalho atual, reconciliação e ajustes coordenados MR. Nos contratos/contexto/plano pertinentes, representar a intenção e as referências de inserção sem implementar um catálogo universal. Delimitar a importação de imagens antes do uso. Integrar a execução nas fatias de ativos/composição e a comunicação na fatia Director/adapter/UI.

Nenhuma nova operação MR está aprovada por esta decisão. Se a ingestão de imagem ou outra dependência revelar lacuna real do runtime, apresentar o mínimo adicional e impacto antes de incluir no inventário ou liberar execução dependente. Não adiar silenciosamente uma necessidade demonstrada da frente atual nem transformar todas as funções futuras em bloqueadores do MR.

A pergunta sobre execução “essa semana” não estabelece prazo de entrega, agendamento automático nem autorização para antecipar código. O trabalho desta rodada é decisão/documentação; a implementação depende dos marcos e autorizações, não do calendário ou da recuperação presumida de créditos.

Validar com materiais reais: correspondência da inserção à passagem; preservação de demonstração real; ausência de falsa equivalência; respeito ao estilo/quantidade/duração; ausência de mudança indevida na fala; falta de ativo opcional versus necessário; escolhas explícitas sem IA; aviso sobre capacidade ausente; propostas com referências/versão válidas, rejeição de planos inválidos ou obsoletos; execução e undo/redo pelo caminho canônico; preview/export coerentes. Provar o retorno real do agente quando integrado e medir consumo completo, incluindo evidências, inferência/rede e render.

A proposta é principalmente preservação e explicitação da lógica editorial EDVID. Registrar como **DIVERGÊNCIA EDVID** diferenças materiais efetivamente introduzidas, com validação proporcional; não atribuir toda a lógica ao CEVRA nem declarar superioridade antes dos testes. Alterações materiais de arquitetura, custo ou dependência voltam ao product owner antes do código.

### 2.7 Redação objetiva aprovada

> O CEVRA escolherá imagens e vídeos de apoio conforme sua pertinência à passagem e ao estilo autorizado, aproveitando material adequado já disponível. Não ilustrará palavras mecanicamente nem apresentará mídia genérica como demonstração de algo específico. Inserções opcionais inadequadas poderão ser dispensadas; a falta de material necessário será informada. A seleção contextual dependerá das capacidades reais do Director, e a execução usará o caminho local e editável de composição, sem autorizar automaticamente geração ou serviços externos.

A ressalva expressa do product owner está na seção 2 e sua explicação operacional na seção 2.4: preservar o método EDVID na orientação ao agente e separar a execução local, sem presumir que aplicativo independente significa ausência de IA editorial ou integração pronta.

## 3. Handoff e índice para reconciliação

Este registro fica no PR #26 / `docs/editorial-decisions-1-8` até integração autorizada. Ao preparar prompts no CEVRA 3, recuperar main real, PRs e esta sequência de registros: editorial v4 (1–13 e inventário MR); visual v5 (14–18, incluindo restrições); este documento v2 (19–20); Director no PR #25/revisão aplicável. Não assumir que main já os contém.

No fechamento documental autorizado, incluir link/resumo no Master Context e reconciliar o índice/AGENTS e o handoff visual, sem reescrever aprovações ou mover a base congelada de trabalho em andamento. A atualização deste documento não realiza essa integração nem entrega mensagem automática a outro chat.

Resumo a integrar: **Decisão 19 aprovada — duas variantes EDVID de tela dividida por intervalos, continuidade da fala, troca de mídia restrita, textos/enquadramento coordenados e exceção localizada ao encaixe em cortes. Implementar na composição após gate MR e ingestão de ativos; nenhuma nova operação MR aprovada. Ingestão de imagem ainda ausente no serviço V1, a delimitar antes de uso. Paridade, esforço e consumo pendentes.**

Resumo a integrar: **Decisão 20 aprovada — escolher mídia de apoio pela passagem e estilo, priorizar material exato adequado, não fabricar demonstração com mídia genérica, dispensar inserção opcional ruim e informar falta necessária. Separar agente/skill editorial do CEVRA independente que prepara evidências, valida planos e executa localmente. Sem IA capaz, manter escolhas/presets suportados e limites explícitos. Planejar no Director; executar após ingestão/composição; provar adapter/retorno antes de alegar automação externa. Sem fornecedor, modelo, gasto, operação MR nova ou prazo semanal aprovado. Detalhes e testes pendentes nesta versão 2.**

Próximos temas de composição/ativos continuam candidatos, não aprovações. Continuar a partir da decisão 21 apenas quando houver novo comportamento material a decidir. Não iniciar busca paga, download/modelo, integração externa ou geração sob o pretexto de aprovação de layout ou escolha editorial. Ao encerrar a rodada, consolidar dependências, pendências e ordem de implementação com localização e estado de integração reais.
