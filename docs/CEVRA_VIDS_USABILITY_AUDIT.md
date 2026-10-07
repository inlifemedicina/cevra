# Vids — auditoria de campos, atalhos e latência de edição

**Data:** 2026-10-07 UTC. **Base examinada:** `2382dae09f1a9d4761b83fee21afc680c489c473`, Draft #89.
**Estado:** investigação offline concluída; correções de UI publicáveis para revisão independente.
**Delta de código:** `10a66830e56a31e17a22ed6ad10efc7f5814f9fe`, branch
`feat/vids-usability-keyboard-audit`, separada e empilhada sobre o head de #89.
Build Desktop e regressões Desktop **183/183**, i18n **2/2**, PASS offline.
CI do novo head e revisão proporcional serão registrados no Draft/receipt;
os 11/11 jobs de `2382dae` e o bundle anterior não validam automaticamente este delta.

**Correção da revisão P2:** a revisão de #90 encontrou OUT30→29 seguido de
Adicionar: blur enviava trim e desabilitava o botão antes do click. O delta de
código `3e4397d64a80fdc1687f0e42d10106a7c3f5f741` dá prioridade à ação do botão:
Adicionar/Inserir usam o draft; demais ações usam a seleção canônica. Não enfileira
um trim anterior nem usa um snapshot posterior presumido. Blur para fora das
ações ainda confirma range válido; Enter+blur permanece deduplicado e Esc restaura.
Foco/relatedTarget e intenção pointer cobrem também o botão que não recebe foco
do mouse, sem executar comandos no pointerdown. UI **194/194**, i18n **2/2** e build
PASS; 11 regressões novas usam campo realmente focado e `user.click`, incluindo
os sete botões de montagem, Undo, Enter/blur/Esc, invalidez e relatedTarget nulo.
Sete regressões falharam no head anterior e o log foi preservado. Revisão exata
e CI do novo head continuam requeridos; simulação DOM não é PASS WKWebView.
A espera de 6,85–8,05 s após editar **não atende ao pedido do Owner** e não é
critério de aceite. Nenhum protótipo abaixo altera o app ou o projeto humano.

Este documento registra o inventário e a proposta técnica; o catálogo de aceite
continua [único](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script).
[Issue #88](https://github.com/inlifemedicina/cevra/issues/88) coordena os achados.
Não solicitar uma rodada humana por campo ou por tecla.

## 1. Causa e prova mínima de processamento incremental

Em [`cevra_manual_sequence.run`](../engines/media-ffmpeg/worker/cevra_manual_sequence.py)
o dicionário `segments` reaproveita intervalos idênticos somente dentro de um job.
Os segmentos H.264 são apagados no `finally`. Um novo IN/OUT ou ordem muda a chave
do cache de programa em
[`DerivedVideoPreview`](../apps/desktop-host/src/derived-video-preview.ts):
todos os intervalos únicos voltam a passar por decodificação do original,
sampler CFR30, escala e codificação, cada um em um processo FFmpeg.
O concat de vídeo já faz **stream copy**; o PCM é montado e o AAC final codificado
uma vez para o programa. O custo principal medido é repetir o processamento de vídeo.

A separação prévia/export já existe: prévia 720×404/700 kb/s, export original-master
1920×1080/20 Mb/s, ambos com grid e endpoints próprios. O worker/processo persistente
também já é reutilizado. Propor essa separação ou reutilização como novidade não
resolveria o custo identificado. O player CFR30 já conserva um decoder durante as
junções do programa admitido; a invalidação da edição é o problema remanescente.

Duas provas externas ao código de produção chamaram o **mesmo renderer atual**
com hooks internos de investigação. Geraram dois arquivos Full HD em movimento,
8 s CFR24 e 6 s NTSC, estéreo 48 kHz, e 12 intervalos únicos de 5 s: programa de
1800 frames/60 s. São chamadas diretas ao worker, **sem Host/IPC/PNG/UI/decoder**.
Não confundir estes tempos com os anteriores de DesktopSession.

| Caso | Sem segmentos retidos | Segmentos retidos, revalidando cada grid | Bytes imutáveis + recibos de grid retidos |
|---|---:|---:|---:|
| Popular 12 segmentos, metadados já aquecidos | — | 6,710 s | 6,631 s |
| Reordenar os 12 | 6,705 / 6,755 s | 1,720 s, 12 hits | 1,249 s, 12 hits |
| Trim de um quadro | 6,701 / 6,629 s | 2,168 s, 11 hits/1 miss | 1,753 s, 11 hits/1 miss |
| Remover 3, manter 9 | não medido | 1,373 s, 9 hits | 1,016 s, 9 hits |

Cada coluna vem de uma execução por caso, no mesmo Mac e com caches do SO normais;
não há SLA, limite superior ou aceite perceptual. O primeiro caso sem metadados
aquecidos levou 7,488 / 7,316 s. O cache de inspeção independente já existente caiu
de cerca de 723 ms na primeira execução para 1 ms nas seguintes.

Na primeira prova, aproximadamente 5,0 s eram codificação dos 12 segmentos;
PCM ~60–73 ms e concat ~35–44 ms. Revalidar grids de todos os segmentos e do programa
custou ~1,08 s. A etapa de mux/admissão ~0,33–0,34 s **inclui** a validação final
de vídeo/áudio: esses tempos têm sobreposição e não devem ser somados.

As duas provas passaram comparação de **todos os hashes de frames decodificados**
e **todos os bytes de PCM decodificados** com as referências sem cache para cold,
reorder e trim. Mantiveram 30 fps, PTS contíguos, exatos 1600 samples/frame por canal,
AAC/endpoints, hashes dos originais e saída ≤8 MiB. A segunda prova só reutiliza
o recibo de um segmento depois de verificar bytes imutáveis/cópia e parâmetros;
continua validando o programa completo e os originais antes da publicação.
Nenhuma dessas provas instala esse cache no produto ou comprova o orçamento
operacional de uma integração de produção.

O cache observado terminou com 13 segmentos / 4.019.839 bytes de payload.
A primeira prova contou também 4.046.848 bytes alocados nas cópias de evidência.
A segunda retém os bytes em memória; suas cópias em disco são apenas evidência
da investigação. O cap experimental de 32 MiB não equivale a admissão de RSS.

Evidência local preservada fora do repositório, sem mídia humana/credenciais:

- Prova de segmentos/validação: receipt SHA-256
  `a4cdad5efaf1b79670f0bb49cf6c07aa183e4dfe50f9f6a6d89af1e83052f2c9`;
  script `889333491cfa33be356cdd9e11ba86d11a916c4922308c973c8f7384b464fd54`.
- Prova de bytes em memória/recibos: receipt
  `564b4c421ae482f29612974a76d59ea566b9222680aab9bf947b1da1b5bdd598`;
  script `443497e9b3b7374ecbf18b17af8323b1462afa81a65e1065619d567dfbbc291f`.
- Worker examinado SHA-256
  `c9fafbe96af089dc16cb0cc9d61c8a6251e02f9555f2a0c714a31212ec5961b3`;
  manifest do runtime `8403fad5b7ebb9d84e24c96373a13629eb0aad0418797acb93602a7a762d452f`.

## 2. Alternativas e proposta para aprovação

| Alternativa | Trabalho e benefício | Custo/risco | Estimativa de engenharia |
|---|---|---|---|
| **LRU de segmentos em memória no worker existente** | Reusar bytes H.264/recibo validados; renderizar só intervalos novos; reorder/delete fazem concat/mux. A prova acima demonstra o limite incremental. | Chave por hash do original, sampler/range/perfil/cor/encoder/runtime; promoção somente validada, cancelamento, eviction/shutdown, buffers contados no RSS. O programa completo ainda é validado/remuxado; persiste espera. | 2–3 dias de integração/testes e mais uma revisão; estimativa, não compromisso. |
| Cache persistente de segmentos em disco | Mesmo reaproveitamento entre jobs, possível sobrevivência ao worker. | Exige nova autoridade de diretório e contagem conjunta de cache/job/copias/overlap, limpeza/identidade/restart. Evita RAM mas amplia lifecycle. | 4–6 dias + revisão de ownership; benefício adicional não medido. |
| Proxy CFR30 por original | Amortiza decodificação/escala em intervalos novos, inclusive trims inéditos. | Proxy Take atual não é um grid CFR30 original-master. Cortes arbitrários não podem fazer stream copy de um GOP comum; all-intra cresce disco, reencode de segmento mantém custo e acrescenta geração de prévia. Exige oracle de PTS/cor/áudio e cache próprio. | 4–7 dias após prova adicional; nenhum ganho temporal afirmado. |
| Programa de preview consumindo segmentos sem reconstruir container | Poderia tornar alterações de ordem/range diretamente consumíveis. | O `<video src=MP4>` atual não tem montagem incremental integrada. Continuidade/áudio/seek/cancelamento nativos não estão provados; nova pipeline/API excede esta investigação autorizada. | Não há estimativa confiável antes de viabilidade específica. |
| Debounce/render somente ao Play | Menos jobs durante digitação. | Move/agrupa a espera; não atende sozinho ao pedido nem permite apresentar programa antigo como atual. | Mudança pequena, resolução insuficiente. |

**Proposta mínima:** aprovar somente a integração do LRU de segmentos/recibos
em memória, em delta técnico separado. Aproveitar os padrões do cache independente
já aceito ([ADR0032](adr/0032-bounded-preview-session-reuse.md)) e os orçamentos
existentes ([ADR0034](adr/0034-operational-manual-render-resources.md)); não criar
API de usuário, engine, provider, dependência, banco, diretório persistente ou IR.

Propor **32 MiB de payload / 64 entradas**, LRU local ao worker, sem retenção após
shutdown. Registrar a extensão aceita no ADR antes da implementação. Medir todo o worker/Host/process group
com cache cheio e o pico de restauração. Toda cópia restaurada passa pela reserva
lógica **antes** de escrever no workspace do job. Export continua original-master.
A chave de segmento independe do ID/ordem da ocorrência, mas inclui identidade
do original e política/perfil integral; os checks fresh de origem/snapshot/Journal
do Host continuam obrigatórios. Caches não são prova de estado atual.

Fechar a integração somente após misses/hits/eviction/cancel/retirement/shutdown,
corrupção/identidade, sources trocadas, frames únicos/repetidos, late CFR24/NTSC/VFR,
44.1-kHz/offset/estéreo, PCM/junções, memória cheia, Undo e export original-master.
Medir depois **edição→frame atual pronto no app**, em vez de aceitar apenas tempo
do worker. A espera de 1,0–1,8 s do protótipo também não é definida como aceite.
Um programa inválido/antigo permanece retirado e a preparação visível; nunca
disfarçar waiting nem rotular a versão anterior como corrente.

**Estado da decisão:** proposta preparada, **não implementada no produto**.
O novo aceite de atalhos/IN/OUT não aprova automaticamente esta integração.
Se a exigência for atualização efetivamente imediata também após edição inédita,
o cache é uma etapa mensurável, não uma garantia; a reprodução incremental exige
viabilidade e decisão própria.

## 3. Inventário de superfícies e campos existentes

A auditoria independente de `2382dae` relatou os achados abaixo por coordenação.
Este registro usa os fatos recebidos e inspeção do código; não inventa acesso ao
thread privado do reviewer. O pacote de correções ainda precisa de revisão exata.

| Superfície / controles | Comportamento verificado na base | Correção ou limite do delta de UI |
|---|---|---|
| Projeto/nome/menu/Settings | Nome do projeto canônico; menu e Settings não implementados. | Desabilitados com motivo de função indisponível; sem criar Save As/multi projeto. |
| Estado de gravação / retry | Autosave/checkpoint real no backend; retry só com token. | Status honesto; busy distinguido de indisponibilidade. Não mapear CmdS a uma gravação fictícia. |
| Undo/Redo | History canônico; bloqueios por operação/checkpoint/close. | CmdZ/ShiftCmdZ nativos acionam os botões habilitados; texto mantém seu Undo. |
| Importar | Picker nativo + ingest real, cancelamento. | CmdI nativo, inclusive biblioteca fechada; busy/capacidade com razões separadas. |
| Busca e filtros de mídia | Busca real por nome/número; filtros reais por kind. | Texto preservado; tabs roving/setas/Home/End; sem roubar CmdF do navegador. |
| Cards/número/filename | Seleção real e numeração estável; thumbnail assíncrono identity-bound. | Fallback legível e retry explícito pela rota existente; não seleciona/reproduz ao extrair. |
| Navegação de workspace | Tabs com mudança de área. | Setas/Tab existentes; IME/modifiers/modais guardados. |
| ToolRail | Apenas highlight, sem ação nas categorias. | Media reabre biblioteca; categorias sem consumer desabilitadas honestamente. |
| Director texto/preset/Executar/Ideias/Aplicar | Draft e preset visuais; execução/apply indisponíveis. | Preservar texto; sem atalhos que executem IA ou anunciar consumer novo. |
| Rascunho editorial / Atualizar | Erro transitório virava empty e desmontava texto. **P1**. | Conservar draft na falha, erro visível, retry; empty somente resposta canônica. |
| Títulos/notas/editorial/revisar | Erro de revisão virava stale indiscriminadamente. **P1**. | Distinguir stale confirmado; conservar texto e bloquear edição de draft stale; retry. |
| Editorial ordem / guardar / descartar | Reordenar já inclui os edits pendentes no request. | Aviso explícito de que também guarda notas; labels por bloco/limite, aria-invalid/describedby. Persistência editorial durável requer proposta. |
| Prévia Original / Sequência | Source clock e program clock distintos; readiness/cancelamento. | Foco por Tab, Espaço; botões/sliders mantêm suas teclas. Nada de JKL reverso. |
| Play/Pause / seek / step / início/fim | Ações existentes no player/régua. | Espaço e setas/Home/End no componente em foco, guards ready/busy; decoder/media antigos nunca atuais. |
| Marcas IN/OUT do Original | Draft de próxima criação; independente do trim numérico. | I/O somente no viewer focado e botão existente; rótulo explicita draft. Sem sincronização implícita. |
| Fonte + IN/OUT da montagem | Draft para append/insert ou trim selecionado, com validação de unidades. | **Aceite Owner 00:22:58 UTC:** Enter/blur aplica range válido no selecionado; Esc restaura; IME guardado; um Undo e dedup Enter+blur. Adicionar/Inserir continuam ações explícitas. |
| Append / Insert | Criação tipada de ocorrência no final/antes da seleção. | Tab/Enter/Espaço no botão; não inventar letra global conflitante ou autoappend ao digitar. |
| Duplicar / Split | Typed duplicate/split da seleção individual, boundary validado. | CmdD / CmdB na timeline do app nativo. Não introduzir duplicação/split em lote. |
| Seleção / limpar / grupo | Cmd/Ctrl clique, Shift intervalo, SelectAll, drag/reorder e remove-many. | CmdA/ShiftCmdA contextuais; mover grupo por Option↑/↓ usando mesma permutação canônica; Delete/Backspace e botão de grupo, um Undo. |
| Trim handles / ruler | Pointer + teclado; validação/History existente. | Preservar setas e passo Shift; proteger IME/modais/atalhos de sistema/VoiceOver. |
| Zoom / fit | Slider 70–180 e reset 100 existentes. | Cmd+/Cmd− nativos na timeline; ShiftZ com foco no painel; não roubar zoom/bookmark/abas do browser harness. |
| Altura timeline | Drag sem cancel/blur/teclado. **P2**. | Capture/retirement por pointer, Esc/blur/cancel restaura, setas/Home/End e limites 220–420; sem History. |
| Sidebar largura/divisor/modos/tabs/scroll | Controles já implementados, memória de drafts/scroll. | Manter comportamento; proteger IME/modifiers/modais nos handlers existentes. |
| Revisar conversão legado | Proposta + campos em frames + Confirmar, versão tipada. | Confirmação explícita preservada: converter timing policy não é um blur automático de trim. |
| Exportar / escolher / cancelar / destino | MP4/H264/AAC original-master + picker/progresso/status reais. | CmdE nativo pelo mesmo consumer; progresso indeterminado, sem %/ETA inventado; idioma efetivo do picker nativo segue pendente. |
| Inspector vídeo | Position/scale/rotation/opacity fixos pareciam reais. **P2**. | Opacity do clip canônico; valores desconhecidos indisponíveis. Crop/cor/stabilização continuam sem consumer. |
| Inspector captions/áudio | Font/size/position/gain/pan fixos pareciam reais. **P2**. | Indisponíveis quando sem dado canônico; sem inventar estilos/mixer/funções novas. |
| Transcrição / cancelar / segmentos | Transcrição local conforme capacidade; lista textual real. | Mantida; seleção textual não representa corte/seek novo. |
| Busca/follow da transcrição | Inputs aparentavam ação sem handler. **P2**. | Desabilitar/sinalizar função indisponível; não criar novo fluxo incidentalmente. |
| Composição / cards / assets | `sources.length > 0` habilitava fixtures fabricadas. **P1**. | Fixtures só no adapter de apresentação; produção informa indisponibilidade. |
| Áudio / canais / níveis | `sources.length > 0` habilitava canais/níveis inventados. **P1**. | Mesmo gate de demonstração; preservar áudio real do renderer/export. |
| Captions / cues / estilo | Seleção de cue canônico; estilo não conectado. | Manter seleção, marcar controles indisponíveis; novo editor de legendas precisa proposta. |
| Idioma / labels / ajuda | PT-BR/EN-US obrigatório. | Catálogo central/ajuda de atalhos e feedback com paridade; strings do picker são autoridade do OS. |

## 4. Convenções e escolhas CEVRA

[Final Cut Pro](https://support.apple.com/guide/final-cut-pro/keyboard-shortcuts-ver90ba5929/mac)
documenta Command-I, Command-B, seleção/ranges e transporte. A
[referência oficial do Premiere](https://helpx.adobe.com/ie/premiere/desktop/get-started/keyboard-shortcuts/default-keyboard-shortcuts.html)
mostra que split/import/export diferem entre produtos; não existe um único
mapa universal. CmdD duplicar, CmdE exportar e Option↑/↓ mover são escolhas CEVRA
para ações já existentes, explicitadas no catálogo e nos controles.

[Apple HIG](https://developer.apple.com/design/human-interface-guidelines/keyboards)
é referência para preservar teclado/plataforma. A
[WCAG 2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)
exige remapping/desligamento ou foco no componente para atalhos de caracteres.
Por isso I/O/ShiftZ/Espaço não são listeners globais: dependem do painel focado.
Campos/input/textarea/select/contenteditable, modais, IME/229/dead keys,
eventos consumidos e repetições destrutivas permanecem protegidos.
CmdQ/W/H/M/Tab/Space e CtrlOption do VoiceOver não são capturados.

O browser harness conserva CmdD (bookmark), Cmd1–9 (abas), Cmd+/− (zoom) e seus
atalhos de app/sistema. Os atalhos marcados nativos dependem da presença do shell
Tauri. Não há segundo menu Rust disparando a mesma ação. Não mapear save inexistente,
reverso JKL, ações de efeitos/mixer/composição/Director indisponíveis ou atalhos
de função nova apenas para preencher o teclado.

## 5. Checklist agrupado e limites de validação

A equipe cobre por automação: IN/OUT válido/invalid/Enter+blur/Esc/IME/retry/Undo,
foco/text Undo/modal/VoiceOver/modifiers/repeat/defaultPrevented, ações habilitadas,
grupo/reorder/delete/Undo, cards/retry/tabs, falha editorial→texto intacto→retry,
stale confirmado, fixtures proibidas em produção, propriedades honestas e resize
cancel/bounds/retirement. Registrar resultados exatos no PR/receipt, sem extrapolar.

Depois da revisão/CI e de uma variante coordenada, a futura rodada única reutiliza
I4-T1, X-T1/T7 e a variante X-T6: montagem/atalhos/grupo, texto e foco/feedback,
prévia/junções após editar, exportação e fechar/reabrir. Não reabrir checks humanos
já aceitos nem pedir microtestes de cada campo. A medição de latência atual,
percepção/áudio nativos, picker, layout de ajuda no mínimo e persistência humana
continuam pendentes; unit/fake não é certificação WKWebView ou APP/OWNER.

Director: extensão compatível de interação com os mesmos comandos/History/IR,
sem autoridade de provider/IA ou novo plano editorial. Creator=Lite, Studio=Full,
Vids=Desktop; progresso 55% e F-A02 esgotado 1/1 permanecem como registrados.
