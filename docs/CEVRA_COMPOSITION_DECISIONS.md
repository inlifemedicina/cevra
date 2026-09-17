# CEVRA — Decisões de composição e inserções

**Data:** 2026-09-16.
**Versão:** 1.
**Status:** DIREÇÃO DE PRODUTO APROVADA; IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.
**Decisões aprovadas neste documento:** 19. Não há aprovação implícita de decisão 20 ou posterior.

## 0. Autoridade e continuidade

Este documento inicia o bloco de composição/inserções da rodada antecipada. É o registro detalhado da decisão 19, não uma cópia das decisões anteriores nem outro Master Context. As decisões 1–13 permanecem em [CEVRA_EDITORIAL_DECISIONS.md](CEVRA_EDITORIAL_DECISIONS.md), versão 4, e as decisões 14–18 em [CEVRA_VISUAL_DECISIONS.md](CEVRA_VISUAL_DECISIONS.md), versão 5; a aprovação condicionada da 18 e as demais ressalvas continuam válidas. Ler também `docs/CEVRA_MASTER_CONTEXT.md`, `AGENTS.md`, `docs/ARCHITECTURE_V1.md`, `docs/CEVRA_DIRECTOR_DECISIONS.md`, `docs/EDVID_PARITY.md` e ADRs pertinentes na revisão efetivamente aplicável.

Consulta remota anterior a este registro: `main` em `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`; PR #26 aberto/draft, não mesclado, branch `docs/editorial-decisions-1-8`, head `f0aada1d265e33f0a9a312b586ef3b83926facac`. Este registro documental não altera main nem a branch de implementação. Não declara cache ou ajustes coordenados concluídos. O registro Director do PR #25 também deve ser recuperado explicitamente enquanto não incorporado.

A separação temática não cria duas autoridades para uma aprovação: detalhes da 19 ficam aqui; detalhes da 14–18 continuam no registro visual, sem duplicação. Até a reconciliação documental, a indicação histórica de próximo número 19 no registro visual deve ser lida junto deste documento mais recente. A próxima proposta será 20, salvo aprovação posterior efetivamente registrada.

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

## 2. Handoff e índice para reconciliação

Este registro fica no PR #26 / `docs/editorial-decisions-1-8` até integração autorizada. Ao preparar prompts no CEVRA 3, recuperar main real, PRs e esta sequência de registros: editorial v4 (1–13 e inventário MR); visual v5 (14–18, incluindo restrições); este documento v1 (19); Director no PR #25/revisão aplicável. Não assumir que main já os contém.

No fechamento documental autorizado, incluir link/resumo no Master Context e reconciliar o índice/AGENTS e o handoff visual, sem reescrever aprovações ou mover a base congelada de trabalho em andamento. A criação deste documento não realiza essa integração nem entrega mensagem automática a outro chat.

Resumo a integrar: **Decisão 19 aprovada — duas variantes EDVID de tela dividida por intervalos, continuidade da fala, troca de mídia restrita, textos/enquadramento coordenados e exceção localizada ao encaixe em cortes. Implementar na composição após gate MR e ingestão de ativos; nenhuma nova operação MR aprovada. Ingestão de imagem ainda ausente no serviço V1, a delimitar antes de uso. Paridade, esforço e consumo pendentes.**

Próximo tema candidato: decisão 20, seleção contextual de imagens/vídeos de apoio. Ainda não aprovado nem implementado. Não iniciar busca paga, download/modelo, integração externa ou geração sob o pretexto de aprovação de layout. Ao encerrar a rodada, consolidar dependências, pendências e ordem de implementação com localização e estado de integração reais.
