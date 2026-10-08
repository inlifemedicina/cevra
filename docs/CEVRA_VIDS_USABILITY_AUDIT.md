# Vids — auditoria de campos, atalhos e latência de edição

**Data:** 2026-10-07 UTC. **Base examinada:** `2382dae09f1a9d4761b83fee21afc680c489c473`, Draft #89.
**Estado:** investigação offline concluída; correções de UI publicáveis para revisão independente.
**Delta de código:** `10a66830e56a31e17a22ed6ad10efc7f5814f9fe`, branch
`feat/vids-usability-keyboard-audit`, separada e empilhada sobre o head de #89.
Build Desktop e regressões Desktop **183/183**, i18n **2/2**, PASS offline.
CI do novo head e revisão proporcional serão registrados no Draft/receipt;
os 11/11 jobs de `2382dae` e o bundle anterior não validam automaticamente este delta.

## P2 da conversão legada — proposta vinculada ao snapshot revisado

Revisão independente de `900da2a` confirmou os dois P2 anteriores resolvidos,
mas encontrou conformação legada com payload revisado rebindado após trim:
proposta OUT1,000s→30frames; digitar OUT0,900s e confirmar enviava trim900ms,
depois os antigos30frames com o novo snapshot. Isso podia restaurar1s sem revisão.
Código `f530b1d1b3db86e10f52f85259d8d6d335f35ebb` fixa esse vínculo: `conform`
conserva o snapshot da proposta e o App rejeita o comando capturado antes do
backend se o settlement mudou o head. Não atualiza o token de um payload revisado.
O trim900ms permanece canônico; é obrigatório ler a proposta nova27frames antes
de confirmar. Uma confirmação posterior válida gera seu próprio Undo, separado
do trim. Não há conversão nem replay automático após invalidar a revisão.

A leitura também passa pelo mesmo gate, recebendo o IR realmente confirmado.
A proposta, os drafts de frames e a confirmação só aparecem no snapshot ao qual
pertencem, sem depender de um efeito posterior para apagar a UI. Respostas
assíncronas pertencem a uma geração/leitura imutável; uma leitura nova/cancelamento
aposenta a resposta antiga. O resultado pode chegar antes de React renderizar
o novo IR, mas nunca autoriza display/confirmação em head diferente. Leitura
assíncrona não prende a edição manual; mudar o head retira a proposta anterior.
Cancelar revisão usa o gate e não executa conversão.

Desktop **236/236**, build, i18n **2/2** e diff check PASS offline. Cinco novos
casos App/backend/Application/History: confirmação click/Enter/Space com trim
pendente; leitura aguarda trim e pede o head retornado; resposta antiga chegando
depois da nova proposta. Caracterização válida em900da2a: **4 RED/1 já PASS**.
Os três casos de confirmação provam ausência de conform no backend, preservação
de900ms, nova proposta27frames, conversão no snapshot revisado e dois Undo exatos.
O caso legado existente mantém conversão/collapsed-range/reopen sem perda.
CI de900da2a terminou10/10 PASS, monorepo1.476/UI231, mas não cobre este delta.
**Novo-head CI e revisão independente PENDENTES no checkpoint de publicação.**
#90 Draft/#89 preservado, sem cache/GUI/merge/IA. Director compatível no mesmo
IR/History; progresso55%, F-A021/1, G1 integral não aceito e checklist único mantidos.

**Histórico — primeira correção P2, SUPERSEDED pela reavaliação abaixo:** a revisão de #90 encontrou OUT30→29 seguido de
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

**Fundação do settlement — código `ba8d5a6b7b5a71d2eb90f76249e88e19117a1b6a`, complementada pelo fechamento abaixo:**
a reavaliação de `5f9266c` confirmou que a prioridade genérica de botões perdia
OUT29 ao selecionar/duplicar e confundia Tab/foco com ativação. Essa solução está
**SUPERSEDED**. O estado explícito do draft é clean → editing → committing →
clean/failed, vinculado ao selecionado. Enter e todo blur válido compartilham a
mesma Promise de trim; não há exceção por relatedTarget ou intenção pointer.
A transição no App captura a ação seguinte e aguarda confirmação real do backend.
Só então troca seleção ou envia duplicate/append/insert/reorder/split/remove no
snapshot devolvido. Não presume um head futuro nem reexecuta uma ação após falha.
Durante settlement, o valor/owner permanece visível e os botões de ação continuam
recebendo a primeira ativação; após capturá-la, a transação bloqueia repetição.
Falha mantém o draft e cancela a intenção seguinte; um novo gesto é retry explícito.

OUT30→29 + selecionar outro clip confirma o antigo antes de mostrar OUT60;
Duplicar confirma trim e duplica OUT29; Adicionar/Inserir confirmam o trim e criam
o range digitado. **São dois comandos/Undo quando há trim + ação**: o primeiro
Undo retira a ação, o segundo restaura OUT30. Undo logo após sair do campo desfaz
o trim confirmado antes de atingir History mais antigo. Esc continua cancelando
o draft; marcar ranges de Original/outra fonte continua usando criação explícita.
Não houve escolha nova de produto: a correção restabelece o contrato aprovado
Enter/blur confirma, Esc cancela, preservando a ação seguinte e o valor.

Build Desktop, **UI207/207**, i18n **2/2**, diff check PASS offline. **13 novas
regressões App/backend/Application/ProjectHistory** incluem seleção por pointer e
teclado, duplicate/append/insert por click/Enter/Space, Enter pendente seguido de
duplicate, Cmd+D nativo, Tab em Adicionar sem ativação seguido de edição no Director,
pointer abandonado e falha/retry. Nove caracterizações foram RED no head `5f9266c`
antes da implementação; o log permanece externo ao repo. As regressões anteriores
foram atualizadas para preservar os dois estados/Undo, não para suprimir o trim.
Nesse checkpoint, CI e revisão independente exata estavam PENDENTES; os 10/10 e 1.439 testes
do head `5f9266c` são históricos. DOM/offline não certifica WKWebView, percepção
nativa, picker, layout mínimo ou persistência humana. #90 segue Draft; #89/app
humano/Take preservados. Cache não aprovado/não implementado; sem chamada real IA.
Director compatível na mesma fronteira typed IR/History, progresso55%, F-A021/1 e
G1 integral não aceito permanecem. Reutilizar o mesmo checklist I4-T1/X-T1/T7/X-T6.

## Fechamento dos dois P2 restantes — 2026-10-07

Código `63c89c026e4a18b216c69e0dbc2871d632239163`. A revisão de `57511e1`
encontrou duas lacunas concretas: press em Duplicar → blur/trim → HOST_TIMEOUT
antes de release permitia retry e duplicate no mesmo gesto; Importar ainda
contornava o settlement e era desabilitado antes do click. O protocolo de draft
permanece; a correção completa o roteamento comum no App e registra a época da
ativação em capture. Falhar um range consome o pointer/tecla/drag já iniciado.
Release, click e Drop desse gesto não repetem trim nem ação. Um novo press/tecla
é retry explícito. Registrar press nunca executa comando; Tab/foco não ativa.

Importar usa a mesma espera por confirmação, por botão e Cmd+I. Exportar pelo
TopBar/Cmd+E/Inspector recebe o snapshot realmente confirmado antes de chamar
o picker/backend. Cancellation, receipt e publicação já journaled continuam sem
replay. Intenção de modo Original/Montagem e repetição pertence ao App, para
sobreviver ao remount existente por snapshot. Campos do range e trabalho real
de mídia mantêm seus guards; não se enfileiram closures de decoder obsoleto.

### Inventário completo de entradas e limites

| Entrada | Roteamento e limite verificado |
| --- | --- |
| IN/OUT: Enter, blur, Esc | Uma Promise de settlement por owner; falha conserva valor/owner, Esc cancela. Sem comando em press ou mero foco. |
| Append/Insert/Duplicate/Split/Remove/Reorder, botões e atalhos | `editSequenceAfterRange`; mesma transição, atual IR/head retornado e um Undo por mutação typed. |
| Conversão legada: ler, revisar frames, confirmar, cancelar | Leitura usa gate + IR confirmado. Proposta/drafts/confirm ficam vinculados ao snapshot revisado; `conform` nunca recebe token posterior. Trim que muda head invalida a confirmação capturada antes do backend e exige nova leitura/revisão. Geração e identidade aposentam resposta assíncrona stale. |
| Criação a partir do Original | Append também passa por `editSequenceAfterRange`; readiness e range admitido do preview continuam obrigatórios. |
| Seleção de fonte/clip/caption/graphic, grupo, Select All/Clear, teclado | `afterRangeDraft` antes de substituir seleção/owner. Seleção durante uma ação já enviada continua permitida quando não espera o draft. |
| Fonte no controle de range | `onRangeAction` confirma o owner antigo antes de trocar os campos para outra fonte. |
| Importar: botão e Cmd+I | `requestAction(importMedia)`; primeira intenção continua disponível enquanto o blur confirma; capability e busy de importação continuam obrigatórios. |
| Exportar: TopBar/Cmd+E e Escolher destino no Inspector | Transição comum e `confirmActionSnapshot`; export usa head confirmado. Operação começa somente após confirmação; cleanup distingue snapshot da operação. |
| Undo/Redo: botão e aceleradores | Mesma transição antes de History. Undo após blur primeiro desfaz trim; não presume snapshot futuro. |
| Tentar salvar | Mesma transição; checkpoint/token lidos do estado canônico confirmado, sem retry de token capturado antigo. |
| Editorial: atualizar, salvar notas, mover bloco, selecionar fonte, descartar notas | Refresh/revise/source e discard compartilham o gate. Revisão editorial mantém sua validação de revision; texto digitado permanece draft local. |
| Transcrição | Capability + transição comum antes de iniciar; cancelar operação permanece imediato. Nenhum provedor foi executado nesta correção. |
| Workspace, ToolRail, mídia/sidebar, idioma; tabs/modo interno do sidebar | Mesma transição por click/teclado antes de navegação que pode substituir a superfície. |
| Filtros de mídia e retry de thumbnail | Gate comum; busca digitada é UI local. Thumbnail continua vinculado ao snapshot/busy reais. |
| Original/Montagem e repetição | Gate comum e intenção no App após confirmação; novo snapshot invalida a mídia antiga antes de aplicá-la. |
| Drag/drop e trim por alça | Comandos typed e guard de ativação. Falha durante drag consome Drop; mudança canônica continua aposentando geometria/snapshot capturados. Não se reaproveita drag antigo após trim confirmado. |
| Play/Pause, frames, marcar IN/OUT, slider/scrub, retry do decoder | Continuam vinculados à mídia admitida, busy/readiness e lifecycle. Um decoder anterior nunca é usado como confirmação do novo snapshot. Não há fila de comandos de transporte capturados antes da invalidação. |
| Zoom/Fit/régua, resize de timeline/sidebar, scroll; texto/preset do Director | Estado local/gesto de layout, sem mutação do IR. Guards existentes de cancelamento/geometria permanecem; editar texto/preset não executa Director. |
| Ajuda/disclosures, browser/sistema, campos, IME/VoiceOver | Divulgação/foco local e proteções existentes de atalhos; sem execução por Tab, composição ou acelerador do browser. Compatibilidade nativa ainda requer a regressão agrupada. |

UI **231/231**, i18n **2/2**, Desktop build e diff check PASS offline. São **24
casos novos** sobre UI207: nove press/fail/release (com retry por gesto novo),
12 caminhos de sucesso/click/atalhos, Space/failure/release, troca de fonte e
Drop após falha. Na primeira caracterização de 12 casos, dez foram RED e dois
já PASS; esse log permanece externo, sem declarar os 24 inicialmente RED.
Fixtures App/backend/Application/History usam picker/export fake cancelado,
sem GUI ou provider. Dois testes antigos de export agora aguardam busy/Undo pela
UI real; preservam as mesmas provas de receipt/publicação/restauração sem replay.
O caso de range inválido cancela com Esc antes de trocar fonte.

O primeiro CI desse delta em `f70c874` passou Monorepo no PR, UI231, mas o push
falhou no teste antigo de revisão editorial temporária: encontrava o campo sem
esperar edição habilitada e verificava chamada antes da UI concluir busy. O teste
agora aguarda ambos os estados da UI e verifica também o título efetivamente
guardado. Não muda código de produção nem expectativa de comando/boundary;
o log falho permanece preservado e o próximo head exige CI próprio.

CI exato de `57511e185f990849071b3491f34e49d00954d0e5` terminou **10/10 PASS**:
[push](https://github.com/inlifemedicina/cevra/actions/runs/37560690054) e
[PR, attempt2](https://github.com/inlifemedicina/cevra/actions/runs/37560694033).
O attempt1 de alignment falhou em download pip antes dos testes. Pediu-se somente
retry do job `112597029416` após terminal; o GitHub apresentou cinco jobs no
attempt2, todos PASS. Monorepo daquele head: **1.452/1.452**, UI207. Receipt terminal
externo SHA256 `eda2ce887a09aed0330de2d397fc886fedc5a38ac470b99250b2ae9a8e5cb37a`.
Esses gates são históricos: **novo head ainda requer CI e revisão independente**.
#90 segue Draft e #89 permanece `2382dae`. Sem cache, merge, pacote/GUI nativo,
mídia humana, Take, Xcode/iPhone ou chamada real IA. Director compatível no mesmo
IR/History; progresso55%, F-A021/1, G1 integral não aceito e o único checklist
I4-T1/X-T1/T7/X-T6 permanecem. DOM/offline não comprova aceite WKWebView/humano.

O primeiro CI do delta `ba90d4d` encontrou uma corrida nos testes antigos Enter/blur:
eles liam o History interno antes de a UI liberar Undo e clicavam o botão ainda
desabilitado. Os dois testes agora usam foco/click reais e aguardam Undo habilitado,
mantendo a comparação completa de restauração e a contagem de um único comando.
Build/UI194 PASS novamente; não houve mudança adicional no código de produção.
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

**Estado histórico da proposta:** preparada, **não implementada naquele checkpoint**.
O novo aceite de atalhos/IN/OUT não aprova automaticamente esta integração.
Se a exigência for atualização efetivamente imediata também após edição inédita,
o cache é uma etapa mensurável, não uma garantia; a reprodução incremental exige
viabilidade e decisão própria.

**Decisão e implementação aprovada — 07/10/2026:** o Owner aprovou o delta
separado sobre `278627e` / Draft #90, registrado em [ADR0035](adr/0035-preview-segment-memory-reuse.md).
O cache de produção compartilha32MiB/64 entradas entre objetos/pending, dentro
de512MiB RSS; restaurar reserva bytes dentro de2GiB antes de escrever. Comparação
integral de frames/PCM e cancelamento/restart PASS no runtime selado. Host real
reorder2.148s, trim2.794s, remoção1.747s; bytes reais entregues à UI levaram123–166ms
até React/Blob/PNG DOM. Isso não comprova frame nativo pronto nem percepção.
[Registro canônico](CEVRA_PREVIEW_SEGMENT_REUSE_V1.md) separa cold/Host warm,
limites e falhas preservadas. CI exato/revisão independente seguem obrigatórios
antes de um pacote e da rodada única; G1/percepção permanecem sem aceite.

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

## Consolidated basic editing — 2026-10-08

Pacote aprovado pelo Owner após a rodada agrupada: branch
`feat/vids-basic-editing-consolidated`, base exata
`e84424ccb65eb57b15747effe64518b17e6e9cdf` / Draft #91,
[ADR0036](adr/0036-consolidated-basic-manual-editing.md). Esta decisão substitui
a exclusão anterior de duplicação em lote no inventário de 07/10 somente para
a operação aprovada agora; split em lote e renomeação editável continuam fora.

| Área | Implementação e limite |
| --- | --- |
| Finder drop / import | Rust captura caminhos nativos absolutos, máximo32 arquivos/120s e consumo único; WebView envia somente receiptId/locale. Query de metadados constante e duas permissões de comandos da aplicação, sem core:event/fs/shell/dialog. Extensões iguais às do picker existente; ingest/checkpoint/recovery compartilhados. Lote misto informa imported/reused/failed, interrompendo mutações restantes em incerteza de storage/session. Snapshot final recupera Host encerrado sem replay. |
| Importação repetida | Mesmo URI registrado reutilizado somente após verificar identidade/conteúdo atuais. Não aloca fonte, número ou journal/checkpoint. Fonte alterada/offline, abort e conflito de histórico falham sem publicação. Mesmo conteúdo em outro locator conserva a rota anterior de import. |
| Reorder | Pointer capturado com container estável, foco explícito no botão e destino visível; clip não selecionado funciona no primeiro gesto. Midpoints canônicos, incluindo trechos1/2/5frames, não dependem do retângulo mínimo visual. Commit somente ao soltar; Escape/blur/cancel/captureloss, busy/snapshot/zoom/viewport antigos cancelam. Click pointer após drag não duplica ação nem consome ativação nova pelo teclado. |
| Duplicação coletiva | Delta fechado V1/V2 duplicate-many valida IDs únicos/existentes, lê ordem canônica e insere bloco após a última seleção. Novos IDs preservam fonte, ranges e propriedades, verificando todas as fontes antes da mutação atômica. Um Undo remove o bloco; archive/reopen/Redo conservam a proveniência. |
| Rótulos | Numeração estável das fontes continua no Host. Trecho/Cópia descreve posição atual da ocorrência; fonte/filename ficam distintos. A extensão versionada cevra.manualClipCopy.v1 é só proveniência de apresentação; efeito desconhecido/malformado continua fail-closed. Sem registro paralelo ou renomeação. |
| Régua / escala / cursor | Ticks adaptativos frame-aligned e limitados à área visível. Pixels/tempo manuais conservados ao mudar duração; Ajustar à janela explícito. Slack visual nunca altera IR, prévia ou export. Cursor CFR30 mostra tempo/frame exatos; legado mostra milissegundos sem inventar frames CFR30. |
| Export / campos / atalhos | Exportar MP4 identifica MP4/H.264/AAC existente. Foco/texto/IME/Escape e Undo/Redo, seleção/grupo, IN/OUT, drag cancelado e eventos de mídia/seek atrasados permanecem protegidos pelos handlers tipados existentes. PT-BR/EN-US têm paridade. |

Gates técnicos locais e falhas preservadas no recibo externo/PR: build final
PASS; Rust53/53, Python151/11/11 e866 testes Node dos dez demais workspaces PASS,
incluindo Host185 e domínio325. UI final258/258 PASS com configuração/comando e
prazos padrão, incluindo cinco regressões da revisão final. O cenário
explicitamente gated passou separadamente1/1 com cinco payloads reais do Host.
Na execução conjunta anterior, nove workers da UI atingiram
timeout de inicialização antes dos testes; essa execução não é declarada PASS.
UI isolada253 passou antes das últimas correções; UI258 e Desktop build passaram
após elas. As demais suítes não tiveram mudança posterior. A tabela do Draft/
receipt registra CI/review terminais, sem promover checks incompletos.

O catálogo Media selado PASS inclui a nova montagem de sete ocorrências após
duplicate-many, proveniência aceita pelo plano e export dos originais:187frames,
299200 amostras PCM por canal, Undo/Redo integral. Conferiu cada quadro por oracle
independente, relógio/endpoint MP4/PCM, originais intactos, CFR24/B-frames,
NTSC/VFR, um frame/repetição, 44.1kHz/offset/estéreo e60s preview/final.
Runtime tree SHA256 `fa6eec4820f2399dbca360bb96c9786ea99f163f2625f63bea3c0c33d19cc6f6`,
manifest SHA256 `f082a22c45ec299125918ddb9c4a7d926039a6c530689551a966a66d6333ebfd`.
É cópia isolada verificada dos recursos estáticos selados da baseline; o app e
projeto humano não foram alterados nem usados como fixture.

Host filho real PASS: URI repetido reutilizado sem mutação; arquivo inválido
recusado sem fonte/checkpoint; source hashes intactos e comparação integral
decoded-picture/PCM para cold/warm/reorder/trim/removal. Montagem60s/1800frames,
trim1799 e remoção1499. Entrega JSON/PNG pelo Host mediu cold7,035s,
warm completo67,5ms, reorder1,940s, trim2,340s e remoção1,732s. Warm usa cache
completo já existente; não é render incremental. São medições individuais,
sem SLA de resposta imediata ou prova WKWebView decode/paint. Cache12hits no
reorder,11hits/1miss no trim e10hits na remoção; cancelamento de job confirmado
e restart limparam retenção.

Handoff dos cinco payloads reais pelo React/Blob/PNG DOM PASS1/1; reorder167ms,
trim176ms e remoção132ms nesta execução. Snapshot atual/descartar resposta stale
passaram, mas Play continuou desabilitado sem decoder. Não prova decode/paint
WKWebView nem percepção humana ou continuidade/áudio nativos.

O primeiro build não compilou porque o npm privado antigo estava incompleto;
Node22.23.2 foi restaurado em pasta própria. Python de teste sem stdlib/antigo3.9
e cache Cargo vazio causaram falhas de fixture antes de validação; pin3.12.14,
dependências locked e recursos Node próprios restauraram o ambiente. A expectativa
ACL foi atualizada só para os dois comandos autorizados. Observação RSS impedida
pelo sandbox passou com execução headless autorizada dos processos próprios.
O primeiro catálogo de cópias falhou por contar entrada após truncamento legítimo
de redo; um projeto de fixture separado conserva a asserção de uma entrada.
Nenhuma dessas falhas é escondida ou promovida a PASS incompleto.

Claude-PoC é inteiramente inerte/mock: duas execuções do comando normal tiveram
390/391 e SEMANTIC_ANALYSIS_TIMEOUT no intervalo final sub100ms; isolado e serial
391/391 passaram, mas não resolveram o comando normal. A fixture misturava clock
controlado na admissão/transport e timer real no serviço de análise. Só a fixture
foi corrigida: timers positivos seguem o mesmo clock controlado, yields0ms
continuam reais. Sucesso em29999ms e rejeição TIMEOUT em30000ms verificam o
deadline original, slot utilizado e timers retirados. Nenhum prazo/produção ou
asserção original foi relaxado. Focused2/2 e comando normal392/392 PASS; falhas
anteriores permanecem no recibo. CI deve passar no head final. Nenhum binário
Claude, conta/modelo/credencial foi acessado.

A revisão independente inicial encontrou seis P1/P2: recovery do snapshot final
do lote, foco de gesto, ativação de teclado após cancel, mínimo visual de clips,
custo quadrático de rótulos e frames fictícios em timeline legada. Todos foram
corrigidos. A revisão final encontrou mais dois P2: trim conservando geometria
antiga após Fit100/resize e continuação de reorder sobrescrevendo seleção nova.
Chave completa de geometria cancela trim; a época de seleção existente do App
protege a continuação, inclusive se o Owner reaplicar a mesma seleção. Quatro
regressões inicialmente RED e uma fixture de fonte com selector ambíguo foram
corrigidas; cinco GREEN, UI258 e Desktop build PASS. Revisão final da árvore
identificada e CI exato ainda precedem o handoff Draft.
RSS/disk são amostrados, não teto físico instantâneo. Automação não aprova
picker/drop/paint/percepção nativos ou qualidade subjetiva. O Owner passou
edição individual, Undo/Redo, miniaturas, reprodução contínua e export português
na variante anterior; close/reopen e latência medida60s seguem NÃO TESTADOS.
O [mesmo roteiro agrupado](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#single-grouped-g1-script)
reúne somente o delta futuro, sem nova janela/microtestes neste preparo.
Director: extensão compatível, autoridade em IR/History e comandos tipados.
Full G1 unaccepted, progresso55% e F-A02 esgotado1/1 permanecem; sem merge,
issue88 body, Take/Xcode/iPhone, provider ou chamada real de IA.
