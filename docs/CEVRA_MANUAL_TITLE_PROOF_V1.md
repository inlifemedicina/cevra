# CEVRA — prova offline de título manual V1

**Data:** 2026-10-10.

**Estado atual — 2026-10-11:** integração limitada de título manual implementada e em fechamento técnico para Draft/uma rodada agrupada no app. O aceite visual anterior continua restrito aos dois MP4 da prova offline; aceite humano da integração permanece pendente. Seleção de motor geral/default e ADR 0012/K4 permanecem abertas.

**Base inspecionada offline:** `48353df62901aed7f102fc7e186a7c64c92949e3`.

## Aceite delimitado

O Owner confirmou que conferiu os dois vídeos e que os títulos apareceram corretamente nos tempos e nas margens, respondendo **“Sim”** à pergunta de confirmação. Esse aceite fecha a rodada visual da prova offline horizontal e vertical. Não foi fornecido um novo teste dentro do aplicativo.

A aprovação abrange estes arquivos exatos:

| Arquivo | SHA256 |
|---|---|
| VIDS-titulo-horizontal-16x9.mp4 | `2334f41c94a1f1bcaefdf40f58801b350ecdac46191b6dcfb79d8909050d634f` |
| VIDS-titulo-vertical-9x16.mp4 | `1645035e730e842c21686f2be4798dd1845588ffb59321c0d238bb0cba23608f` |

O aceite não estabelece comandos de título, persistência/Undo, preview nativo com título, exportação integrada, outro motor, homologação Windows, conclusão da [ADR 0012](adr/0012-composition-engine-benchmark.md) ou aceite de todo G1. Progresso oficial permanece 55%; F-A02 permanece esgotado 1/1.

## Evidência técnica preservada

Pacote persistente externo ao Git: `vids-title-proof-2026-10-10`, com vídeos, fonte/licença, toolchains verificados, fontes da prova, tentativas e recibos. Cópias destinadas ao teste local estão na pasta `Documentos/CEVRA Vids - Teste de titulos`; originais e arquivos anteriores foram preservados.

- `evidence/title-proof-1791673001380.json` e `latest-proof.json`: quatro saídas PASS, 16:9/9:16 em preview e final.
- `latest-proof.json` SHA256: `ddc30bf2c09d6d21052e9a0ece0e6e9306b76be7b6a3ec063c7ae0ad603046e8`.
- `contract-tests-1791673001380.tap`: 13/13; `independent-review.md`: sem bloqueador para entregar os dois vídeos; fontes vinculados a `source-inventory.json`.
- 300 quadros / 30 fps / 10 s por saída; título “Ação, café e conexão” nos quadros 90–209 (3–7 s), atravessando o corte no quadro 150 (5 s). Ordinais, PTS, acentos, geometria e seeks conferidos.
- AAC integral preservado: parâmetros, base de tempo, duração, pacotes/timestamps e PCM decodificado iguais à entrada.
- MAE do título horizontal/vertical 0,7300/1,1170; PSNR 43,4004/39,3918 dB. Critérios prévios MAE≤3 e PSNR≥35 dB mantidos.
- Cancelamento durante codificação, prazo durante codificação, destino existente, alias do original, reserva insuficiente e prazo já expirado: PASS; processos próprios fechados e nenhum final publicado nos casos cancelados.
- Pico amostrado Node+produtor 434339840 bytes (414,22 MiB), orçamento 512 MiB; codificação 1,45–1,67 s. Decoder/ffprobe de validação fora dessa medição; reserva de arquivos lógica, sem quota física. Prazo de 750 ms fechou em 872,878 ms, incluindo encerramento.

CoreText e os binários FFmpeg 9.0.1 previamente aprovados foram usados somente na prova. O worker 0.3.4 do produto não foi executado por ela. Node 22.23.2/npm 10.9.4 foram recuperados por caminhos privados, sem configuração global. Inter está sem alteração, com revisão/hash e [SIL-OFL 1.1](https://github.com/google/fonts/blob/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/inter/OFL.txt) preservados em `font-provenance.json`/`licenses/Inter-OFL.txt`. Não houve IA real ou nova instalação do produto.

As falhas anteriores continuam como evidência, incluindo truncamento de áudio corrigido, observador de recursos, retenção de buffers do verificador e conversão RGB de medição. A Library permanece bloqueada no MCP do helper local; Python 3.12.15 existente foi confirmado, mas o helper não encontra ferramentas Library. Essa limitação de entrega não altera os hashes nem o aceite local.

## Viabilidade histórica na base real — antes da integração

| Camada | Disponível | Trabalho ainda necessário |
|---|---|---|
| Project IR | `GraphicItem`, gráficos no projeto, validação/serialização e History. | Comandos tipados de criação/alteração/remoção de título, limites e vínculo ao snapshot. |
| Interface | Timeline apresenta/seleciona gráficos; Inspector reconhece seleção. | Controles reais de texto e intervalo; o exemplo de demo não comprova edição ou render. |
| Preview/export manual | Fluxo CFR30 de clips. | Aplicação e UI rejeitam qualquer `graphics`; atualizar a capability/plano sem remover a proteção de tipos não suportados. |
| Composição | Contrato `CompositionEngineAdapter`; operação tipada Media `overlay-media`. | Adapter/compiler integrado, plano resolvido e assets com identidade. A primitiva isolada não demonstra preview/export de títulos. |

Referências verificadas: `packages/project-ir/src/types.ts`; `packages/application/src/manual-video-sequence.ts`, `manual-sequence-preview.ts`, `manual-sequence-export.ts`; `apps/desktop/src/components/ManualSequenceControls.tsx`, `Timeline.tsx`, `Inspector.tsx`; `packages/contracts/src/composition.ts` e `media.ts`.

A proposta segue [D14/D18](CEVRA_VISUAL_DECISIONS.md), [D23](CEVRA_COMPOSITION_DECISIONS.md), ADR 0012/0013 e o [plano coordenado K3/K4](CEVRA_FABLE_TARGETED_AUDIT_MEDIA_HISTORY_PREVIEW_EXPORT_2026-09-18.md). Não há implementação pronta a ativar por um botão.

## Proposta histórica — implementação limitada posteriormente autorizada

**Escopo:** uma fatia vertical de título manual no Normal: adicionar, editar texto/IN/OUT e remover um único lower third Inter de estilo fixo, visível na timeline e no preview, com a mesma semântica no export 16:9/9:16. Operações passam por Project IR/ProjectHistory e salvam/reabrem com Undo/Redo. Controles de tipografia ampla, animações, outras composições, legendas e IA ficam fora deste recorte.

**Dependências:** revalidar a base de integração; especificar os comandos fechados e parâmetros/versionamento do componente first-party; resolver o título no plano canônico; empacotar Inter/NOTICE; definir e revisar o caminho limitado de preview/export atrás do adapter usando apenas infraestrutura aprovada. A operação `overlay-media` é uma primitiva existente a avaliar, não autorização para encadear recodificações. Preview deve invalidar pelo snapshot; export deve voltar aos originais e produzir o vídeo visual uma vez, preservando áudio/mux conforme K3. O contrato de app/motor continua um gate separado: não escolher ou promover default por esta prova.

**Aceitação:** criar/editar/remover sem alterar montagem ou fala; um passo de Undo/Redo por edição; save/reopen compatível com projetos antigos; PT-BR/EN-US; rejeição de parâmetros inválidos/snapshot obsoleto; título igual em preview/export, com acentos, margens e intervalo inclusive-IN/exclusive-OUT; áudio/PTS/originais preservados; cancelamento, cleanup e recursos verificados no caminho integrado; projeto sem título mantém o comportamento anterior. Reutilizar D14-T2, D23-T1/T2, X-T1/T2/T7 e I17-T9; K4-T1/T2 continuam gates de benchmark. Automatizar primeiro e reservar uma rodada agrupada de app ao Owner para julgamento visual/UX.

**Director:** fechamento documental sem novo impacto. A futura integração será uma extensão compatível de operações tipadas compartilhadas por UI e Director, sujeita a revisão; não amplia provider, permissões, execução arbitrária ou quota de IA.

## Integração limitada autorizada — 2026-10-11

O Owner autorizou a preparação completa deste recorte: código, testes offline,
revisão independente, commit/push e PR em rascunho, sem chamada real de IA.
Base `48353df62901aed7f102fc7e186a7c64c92949e3`; branch `feat/manual-title-v1`.
Os recibos históricos acima e os arquivos aceitos foram preservados.

### Comportamento e contratos

- Um título Inter de estilo fixo no Normal, com texto, IN/OUT em quadros CFR30,
  aspecto 16:9/9:16, adicionar/aplicar/descartar/remover e indicação na timeline.
  PT-BR e EN-US cobrem os mesmos controles. IN é inclusivo; OUT é exclusivo.
- Comandos tipados `graphic.manualTitle.set/remove`, componente fechado
  `cevra.title.lower-third.inter.v1` e extensão `cevra.manual-title`. Limite de
  80 unidades UTF-16; texto não vazio, sem controles/quebras/surrogates inválidos.
  A largura disponível e os glyphs precisam caber no componente; overflow ou
  glyph ausente falham sem publicar preview/export.
- Uma ação de History por edição; no-op preserva Redo; snapshot obsoleto é
  rejeitado. Persistência e reopen usam Project IR/ProjectHistory existentes.
  Um novo draft requer Adicionar ou Descartar antes de navegação; drafts de
  alteração assentam antes da próxima intenção; IME não publica parcialmente.
- `FixedManualTitleCompositionAdapter` compila somente este componente fechado
  atrás de um contrato tipado e do Media Adapter existente. Não seleciona motor
  geral/default, não fecha o benchmark Composition nem amplia G1.
- Preview usa o canvas completo e export codifica cada ocorrência a partir do
  original uma vez. A identidade inclui intervalo local, aspecto, fonte/helper
  e snapshot no cache de composições. Repetir uma fonte não repete indevidamente
  o título. Áudio/mux existentes são preservados; fontes não são modificadas.
- Runtime 0.3.5, macOS somente, CoreText com Inter empacotada e sem fallback ou
  registro de fonte no sistema. Inter SHA256
  `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`,
  revisão Google Fonts `0b58fb370093f9a9f4ff785d94405710b79de67c`,
  SIL-OFL 1.1 preservada em assets/NOTICE/THIRD_PARTY_LICENSES.
- Com título, a fonte precisa declarar BT.709 em matrix/primaries/transfer e
  faixa TV. Perfil ausente/ambíguo/HDR é rejeitado; não há retag nem conversão de
  cor automática em produção. O caminho sem título conserva sua admissão anterior.
  Este bloco não implementa colorimetria nem MR-V02/K2.

### Evidência integrada e seus limites

Evidência externa ao Git no pacote `vids-title-proof-2026-10-10/evidence`:

| Recibo | Resultado e vínculo |
|---|---|
| `title-integration-ci-5.log` | build/CI PASS; 1.265 testes Node, 262 UI e um teste dependente do recibo real inicialmente skip. SHA256 `f6faa1ce5bdc0bc3d8fb976c35dbf7a852c136ea4a8820f6397fc6efc1664f8b`. |
| `title-ui-final-all.log` + `title-ui-actual-runtime-result.json` | 263/263 UI PASS com quatro pacotes reais Host/MP4/PNG; rejeição de respostas antigas em ambos os aspectos. DOM/Blob não prova decode/paint nativo nem latência percebida. |
| `title-native-tests-2.log` | 54/54 Rust PASS, incluindo payload nativo fechado e lifecycle. |
| testes Python | 155 Media + 11 transcription + 11 alignment PASS, sem inferência. |
| `title-no-title-runtime-regression.log` | caminho real sem título PASS com o runtime selado. |
| `title-integrated-runtime-9.log` | 13 renders / 21 jobs medidos PASS. SHA256 `d743355c5d9b6a6c72ac6b78ea9b1153dec5722327a98e29e7664001474a460c`. |

Manifest SHA256 do runtime integrado:
`4ddcae14a40f4c2348910d97c6c89611cedf20d7be835fd1f78a97a18e06f2d6`.
300 quadros / 30 fps / 10 s e 480.000 amostras estéreo por final; intervalo
90–210 atravessa o corte 150; teste A/A aplica título apenas à segunda ocorrência.
AAC comparado integralmente entre título/sem título **dentro do mesmo perfil**;
o perfil de preview e o final usam configurações próprias existentes.
MAE/PSNR horizontal 0,7812/46,4293 dB e vertical 2,8424/37,8894 dB;
limites prévios MAE≤3 / PSNR≥35 dB preservados.

As fontes sintéticas anteriores omitiram primaries/transfer. Preparação de teste
criou cópias separadas via stream-copy/declaração explícita do perfil conhecido,
sem encode. Todos os quadros completos decodificados YUV420p (`framemd5`) e AAC
continuaram iguais; SHA dos originais históricos permaneceu intacto. Pins das
cópias de entrada: horizontal `80ec600629839bbab74ad4215ab7b0d054dcb51c7487dca3415476997d86c356`;
vertical `7c7d0c586aa0a22b311d91c5120dc8c4fe7b90aa95a882e97d3ff4492849d435`.

Negativos exigem causas específicas: perfil desconhecido, `RasterError.glyph`
e `RasterError.overflow`. Cancelamento após observar produtor PNG terminou com
AbortError em 173,26 ms; deadline de 750 ms terminou com TimeoutError em
983,63 ms incluindo retirada do processo. Sem publicação e arquivos próprios
limpos. Isso não demonstra cancelamento após progresso do encoder de vídeo.
Pico RSS amostrado 196.952.064 bytes (~187,83 MiB), orçamento 512 MiB; arquivos
próprios lógicos até 5.168.162 bytes, orçamento 2 GiB. Watchdog amostrado não é
teto físico rígido; decoders de verificação ficam fora dessa medição.

Tentativas falhas permanecem externas e não foram promovidas a PASS. Incluem
payload Remove inicialmente aberto, fixture UI antiga, comparação de áudio
entre perfis distintos, oráculos inicialmente insuficientes, caminhos/cache de
toolchains e metadados FinderInfo da cópia local do app. As correções não
enfraquecem os contratos de admissão do produto.

### Entrega e aceitação

App de teste isolado `CEVRA Vids Manual Title.app`, versão 0.1.0, identificador
`com.cevra.vids.manualtitle.test`; runtime 0.3.5. Assinatura local ad hoc,
sem notarização/release. Sem lançamento GUI pelo agente. Binários, smoke da
cópia, fonte/helper e revisão final são vinculados por hashes no recibo externo
de entrega e no Draft. Nenhum projeto humano/credencial foi lido ou copiado.

Uma única rodada agrupada usa as duas entradas sintéticas na pasta de entrega;
o [catálogo de aceitação](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#integrated-manual-title-app-round--2026-10-11)
define ações e resultados. **APP/OWNER PENDING**, sem repetição da prova offline
aceita, sem homologação Windows, full G1 ou ADR 0012/K4. Progresso55%, F-A02
esgotado1/1 permanecem.

**Director:** extensão compatível no escopo verificado: comandos tipados e
History compartilhados. O opcode nativo adicional é fechado para editar este
título; não acrescenta shell/filtergraph arbitrário, provider, rede, credenciais
ou quota de IA. Autoridade editorial continua na Application/Project IR.


## UX e manipulação direta aprovadas — 2026-10-11

**IN DEVELOPMENT / NOT MERGED**, continuação do Draft #96 em
`feat/manual-title-v1`, base `cc48413`. O Owner aprovou dois escopos, nesta
ordem: organização/tempo/remoção e manipulação direta de títulos. Confirmou
`00:00:00`, Delete com Undo/aviso de impacto e “tirar midia do projeto.
podemos seguir”. A aprovação inclui implementação, testes offline, renders,
revisão independente, commit/push e Draft; não inclui merge ou IA real.
As mudanças locais preexistentes de App/Timeline e o teste de workflow foram
preservados antes das correções e incorporados, sem reset.

### Comportamento implementado

- Exportar MP4 existe uma vez no canto superior direito, fora do inspetor.
  Selecionar/aplicar um título não duplica seções. A timeline ganha altura
  ajustável por divisor, com limites responsivos e uma barra curta. Nomes de
  mídia não recebem o prefixo Fonte. Proxy/bordas ficam na ajuda recolhida;
  causas que impedem uma ação continuam visíveis e acionáveis.
- Tempos exibidos usam HH:MM:SS. A edição mantém um valor interno exato em
  quadros CFR30 ou milissegundos legados, independente da string mostrada.
  Focar/sair sem alterar não arredonda cortes. Setas permitem ajuste fino;
  valores fracionários digitados durante a edição são convertidos de forma
  validada, sem frações persistentes. A revisão de conversão sinaliza mudanças
  de precisão e expõe o delta exato na ajuda antes de confirmar.
- Delete/Backspace respeitam a seleção e a posse de texto/IME/modais. Título
  selecionado no preview ou timeline pode ser removido e desfeito. Mídia sai
  somente do projeto: dependências e ripple são revistos antes de remover;
  um comando `source.removeFromProject` registra fonte/trechos/transcrição e
  eventual limite de título em um único History, com Undo/reopen. Snapshots e
  dependências obsoletos são rejeitados. Arquivos originais não são apagados.
- No preview pausado, clicar seleciona o título, duplo clique/Enter edita seu
  texto, arrastar muda a posição e o canto ajusta o tamanho proporcional.
  Controles por teclado complementam o gesto. Letterboxing fica fora das
  coordenadas da imagem final. Escape/cancelamento/resize/blur retiram um gesto
  incompleto sem edição; a soltura válida publica uma operação tipada.
- O texto direto assenta antes de seleção, History, Export, cursor ou
  transporte. Falha conserva o rascunho e consome o gesto já iniciado, sem
  repetir automaticamente. A ação seguinte espera o snapshot canônico;
  leituras editoriais de fundo não cancelam Play. Pausar sincroniza o cursor
  do transporte com o quadro reproduzido antes de recarregar o preview.

### Extensão fechada e compatibilidade

`ManualTitle` aceita V1 histórico sem layout e V2 com layout V1 fechado:
`x/y/width/fontScale` finitos em coordenadas normalizadas, com limites de
posição, largura e escala. A abertura de V1 conserva exatamente o registro
anterior; um gesto explícito produz V2. Mudar de aspecto valida e limita a
posição ao novo canvas. TypeScript, payload Rust e worker Python validam os
mesmos limites e rejeitam campos extras. Não há migração implícita de projetos.

O mesmo componente `cevra.title.lower-third.inter.v1`, adapter, plano e
rasterizador CoreText recebem o layout validado; preview/export usam a mesma
semântica. Runtime 0.3.6, fonte Inter/OFL e pins anteriores mantidos. Nenhuma
nova dependência, engine, provider, privilégio, shell/filtergraph de usuário,
rede, configuração de segurança ou chamada de IA foi adicionada. Glyph,
overflow, perfil BT709/TV e demais limites de admissão anteriores permanecem.

**Director:** extensão compatível no escopo conferido, nos dois sentidos.
Director pode propor o mesmo `ManualTitle` V1/V2 e os comandos tipados de
remoção revisada; Application, Project IR e ProjectHistory continuam como
fronteiras de execução/estado. Não há expansão da autoridade de providers.

### Gates e entrega desta rodada

A base externa é `~/Documents/CEVRA/Vids/ux-titulos-2026-10-11`.
O catálogo canônico contém a única rodada agrupada; a prova offline fixa já
aceita não é repetida. **APP/OWNER PENDING** para desenho/interação percebida,
decode/paint nativo e comparação visual do app. Nenhum PASS global D23/K4/G1,
benchmark ADR 0012, Windows, notarização ou release é inferido destes gates.

| Evidência externa | Escopo verificado |
|---|---|
| `evidence/reported-bugs-baseline.log` | Reprodução dos bugs na base; regressões corrigidas na suíte integrada. |
| `evidence/all-tests-final.log` | 877 testes Node dos pacotes core/Host PASS, incluindo persistência física V2 e remoção/Undo, sem execução de IA. |
| `evidence/ui-delivery-final.log` + `real-ui-delivery.json` | UI299/299 PASS e entrega de seis pacotes reais Host/MP4/PNG, com snapshot antigo rejeitado. DOM/Blob não prova pintura nativa. |
| `evidence/rust-tests-1.log` + `python-tests-final-2.log` | 55 Rust e 157 Media Python PASS; contratos fechados e destino supervisionado do helper. |
| `evidence/real-renders.json` | 17 renders / 27 jobs medidos PASS: V1/V2, horizontal/vertical, intervalo exato, cache/Undo, áudio dentro do perfil, fontes intactas, negativos específicos e cancel/deadline sem publicação. |
| `evidence/independent-review-final.json` + inventários | Revisão independente somente leitura, achados corrigidos; inventários ligam a revisão ao código entregue. |
| `evidence/app-signature-final.json` + `host-bundle-smoke.json` | Assinatura ad hoc/deep/strict, runtime byte a byte igual ao renderizado, Node privado e store vazio próprio; title/import/export disponíveis. |

Manifest do runtime: `0188d734aeede541f4d453c749dcc1832a8a0fd31f21740d38f8b03357782960`.
Recibo de renders: `b8d1c15f43aabe594bf9ae6f1dbb4fc2faa8064f8cf0ea67dd4222094be74050`.
V2 horizontal MAE 0,9670 / PSNR 42,8456 dB; vertical 2,7154 / 38,4552 dB,
conservando os limites MAE≤3 e PSNR≥35 dB. Os 300 quadros e 480.000 amostras
por final, AAC por perfil e pins de originais/cópias declaradas permanecem.
O V2 usa IN91/OUT209: o oráculo percorre todos os quadros, inclusive bordas
não inteiras em segundos. Pico RSS amostrado 199.802.880 bytes (~190,55 MiB)
com orçamento 512 MiB; watchdog amostrado não garante teto rígido.

O File Provider alterou a identidade de arquivos de scratch dentro de
Documents durante duas tentativas, que permanecem FAIL preservadas. A rodada
PASS usou scratch efêmero do sistema; todos os 20 arquivos de entrega foram
copiados para a base CEVRA e conferidos por SHA256 em `render-transfer.json`.
As entradas `fixtures/revisao-horizontal.mp4` e `revisao-vertical.mp4` são as
cópias sintéticas BT709 explícitas já verificadas; os originais históricos
continuam preservados. Nenhuma regra de integridade foi relaxada.

O novo `CEVRA Vids UX.app`, identificador `com.cevra.vids.uxtitles.test`,
0.1.0/runtime0.3.6, tem atalho dentro dessa base. O pacote assinado permanece
em `~/Applications/CEVRA Vids UX 2026-10-11` para evitar atributos do File
Provider; a cópia anterior ao selo foi conferida byte a byte, e o runtime não
foi modificado pela assinatura. É teste local ad hoc, sem notarização. O app
anterior não foi encerrado/substituído, e o agente não abriu projetos humanos.
Obsoletos próprios ficam recuperáveis em `~/Documents/CEVRA/Apagar`.


## Isolated offline hardening — 2026-10-11

The Owner requested further overnight offline checks while preserving the exact
app and fixtures already delivered. This follow-up uses
`fix/vids-ux-hardening-2026-10-11`, based on delivered head `45131a9`, in
`~/Documents/CEVRA/Vids/ux-hardening-2026-10-11/checkout`. It does not replace the
app, update PR96 or open another human round. The original checkout stays clean.

Two concrete P2 cases were reproduced and fixed here: keyboard proportional
resize rejected valid titles when its next step crossed a size/canvas limit;
Escape after rejected text left a stale invalid-title alert. Pointer and
keyboard now use the same closed bounds, with strict numeric endpoint
normalization and no new command at an unchanged limit. Independent review
identified a one-ULP minimum-scale failure (`0.501169` →
`0.49999999999999994`), reproduced in both aspects and both input paths before
normalizing the products to the domain's existing bounds. Draft cancellation
clears its error while retaining the saved title. No domain, schema, engine,
provider, dependency or security change is introduced.

Additional coverage, distinct from the sealed delivery totals:

- 151 relevant UI tests PASS, including 12 new title boundary/rejection tests;
  existing text/IME, gesture cancellation, selection/Delete, precise time,
  source-removal review and export tests remain passing.
- 53 Application/Host tests PASS. One new deterministic test covers 48 varied
  CFR30 sequences, all source occurrences, survivor source intervals, three
  Undo/Redo cycles per source, archive-cursor restores, rejected stale/repeated
  requests and complete restoration. Physical Host checkpoint/reopen and
  export cancellation tests use exclusively owned synthetic stores.
- Final TypeScript/Vite build and diff whitespace check PASS. Existing
  BigInt target warnings remain outside this UI-only change.

**Initial supplemental real-render gate (at `2da579d`) BLOCKED:** the new canvas-edge/title/removal/
reopen harness reached the release worker, but its preview file failed the
existing identity guard (`preview file identity changed`) under Documents.
A separate `.nosync` directory within CEVRA failed with the same symptom.
No integrity guard was relaxed, no Filesystem/iCloud/security setting was
changed, and no PASS is claimed for those attempts. The previous sealed
17 renders / 27 jobs remain unchanged and are not rerun or added to this count.
The metadata cause remains an inference consistent with the earlier recorded
File Provider interference, not a new isolated causal proof.

External evidence is under the hardening base: `evidence/title-boundary-red.log`,
`title-rounding-red.log`, `title-manual-final.log`, `manual-history-host-tests.log`,
`desktop-build-final.log`, the two failed render receipts/stderr logs, and
`delivery-preservation-after.json`. Preservation checks matched all 1,024 app
files, both fixture pins, the shortcut target, original clean head and sealed
delivery receipt; deep/strict signature verification outside the restricted
executor also passed. No new app was packaged or signed.

Director impact: no new impact found within this delta in either direction.
It changes only UI draft arithmetic/error presentation and regression coverage;
typed operations, permissions, Project IR and ProjectHistory are unchanged.
The current [grouped acceptance round](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#integrated-manual-title-app-round--2026-10-11)
remains **APP/OWNER PENDING** on the frozen delivered package.

The canonical ordering in the Master Context is a gate, not implementation
authority for the next block: finish this grouped acceptance, then delimit
audiovisual finishing, then AI strategy/selection/cut planning. Audio-plan and
caption IR primitives do not establish an accepted finishing workflow.
MR-V02/K2 color/HDR gates and the bounded execution-feasibility/product decision
remain prerequisites for affected finishing work. F-A02 stays exhausted1/1;
no real AI or provider execution is authorized. No later feature was invented
or started to fill the waiting period.


## Supplemental render gate resolved — 2026-10-11

The Owner authorized diagnosis of the PR97 supplemental render failure,
verified new copies and stable same-host local paths, with the index/receipts
kept in CEVRA if Documents could not host the working files. The delivered
PR96 app, fixtures and receipt remain frozen; no engine, runtime, guard,
security setting or application code was changed for this follow-up.

An exception-only observer outside the pinned runtime tree captured the exact
release guard failure in `_hash_stable`: the newly sealed private
`source-0.mp4` changed only `st_ctime_ns` between `lstat` and `fstat`
(113,259,724 ns). Device, inode, size and mtime were identical. The worker's
`_seal` code closes its copy before that check and performs no intervening
write/chmod/utime. The strict guard rejected the changed identity as intended.
Observer setup failures are retained separately and are not product/render
results; the positive render proof uses the original worker without an observer.

A copy-only control using the same release seal function reproduced later
ctime-only changes in all three Documents copies and none of three copies in
local temporary storage. All six SHA256 values matched the immutable synthetic
input. `com.apple.provenance` existed in both locations; its presence does not
identify the writer. Path-specific macOS metadata interference is verified;
File Provider attribution remains an inference, not a process-level proof.
This is not evidence of changed fixture bytes or a PR97 layout/render defect.

The supplemental harness also had a distinct assertion error: it counted
future Redo entries before an export after Undo. ProjectHistory correctly
prunes that tail and appends one audited `export.add`. The external harness now
checks retained entries at the active revision plus one, revision/parent-entry
links, unchanged sources/timeline/title, and exact Undo/Redo of the export.
Production History/export code is unchanged.

New runtime, fixtures and baseline copies were verified byte for byte.
An exclusively owned `/private/tmp/cevra-pr97-evidence-*` directory on the
same Mac hosted the working files; this uses the same execution environment
and release verification, with no disabled guard or bypassed denial.
The normal derived-preview consumer already defaults to the system temporary
root. This choice closes the bounded supplemental proof, not general
Documents/File Provider destination compatibility. Native final export
currently creates its private workspace in the picked destination parent;
that route's exposure to volatile metadata remains a separate operational
constraint, with no storage-policy change or broad compatibility PASS here.

**PASS: four real renders / six measured jobs.** Both aspects preserve the
closed V2 picture edge (`x=.08`, `width=.92`, `fontScale=.92/.84`, bottom
edge), frames 91..209 across the frame 150 cut, 300 decoded CFR 30 frames and
480,000 decoded PCM samples per artifact. AAC payload matches the existing
baseline for each profile. Three media-removal/Undo/Redo cycles and two
physical reopens per aspect preserve the original-source pins, title and
exact ranges. Reference ROI remains MAE≤3 / PSNR≥35 dB: horizontal
0.959949 / 40.392894 dB, vertical 2.815941 / 37.858998 dB. Sampled peak
renderer RSS 195,739,648 bytes and owned logical files 5,090,330 bytes stay
within the existing budgets; sampled observations are not rigid guarantees.

External evidence in the hardening base:
`identity-diagnostic/hash-identity-exceptions.jsonl`,
`evidence/metadata-copy-comparison.json`, `stable-render-index.json`,
`real-edge-recovery-stable.json`, `supplemental-render-transfer.json` and
`supplemental-render-closeout.json`. All eight output/reference/archive files
were transferred into `renders-edge-validated` with matching SHA256. Their
portable evidence copies do not rewrite IR URIs or publication identities.
Prior failed attempts and the frozen delivery's 17/27 proof remain separate.

Director impact: no new impact in either direction within this evidence-only
follow-up; typed operations, permissions, Project IR and History are unchanged.
The app was not replaced or opened, no human project was inspected and no
new human round was added. **APP/OWNER PENDING** and later product gates remain.


### Final CI exposed an existing test race

The first fresh-head CI at `cd08f98` failed one existing overlay test: its
next double-click raced the async layout commit's pending state. A held
commit reproduced the identical missing-text-input failure locally. The
test now asserts that editing stays blocked while that commit is pending,
settles the controlled promise inside React `act`, and verifies a fresh
edit and invalid-text rejection afterward. All 23 overlay tests pass.
No implementation, runtime, identity policy or rendered input changed;
the four/six supplemental proof remains applicable. The first CI failure
and deterministic red/green logs are retained in the hardening evidence.
Final head checks must pass before closeout; this is a test synchronization
fix, not a retry used to conceal a defect or a new human acceptance round.


## Human-review regressions — 2026-10-11

Frozen PR96/97 and the running UX app are preserved. The Owner's reported
acceptance and the follow-up expectations live in the existing
[acceptance catalog](CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md#reported-owner-results-and-bounded-follow-up--2026-10-11),
without a second source of truth for scenario IDs. This isolated delta fixes
Original requested-clock response, covered arrow text-selector rendering,
vertical thumbnail/name layout and source-removal dialog spacing, plus the
approved compact/fine time, contextual help, top-only layout controls and
Exportar/Export action label. No new codec/container or project-manager flow.

External evidence resides in
`~/Documents/CEVRA/Vids/human-review-regressions-2026-10-11`.
The red baseline `evidence/original-scrub-before-fix.log` reproduces a zero
counter after requesting4321ms before Play. Its regression asserts immediate
requested-clock publication, no play, no sequence-clock overwrite and unchanged
History. Stored ranges are not converted on focus/blur; explicit edits and fine
navigation are validated, including rounded frame29 at maximum, fraction
removal, hour crossing and rejected values outside the CFR clock.

`evidence/font-coverage.json` verifies Inter's U+2B06 base glyph is present,
while direct U+FE0E glyph lookup returns zero and CoreText shaping resolves the
covered sequence in Inter. Runtime0.3.7 verifies the base and every shaped run;
text remains unchanged, no font is globally registered and no fallback is
introduced. Source helper tests compare byte-identical H/V PNGs for plain
arrow versus arrow+FE0E. Emoji/missing-base/leading-or-repeated-FE0E and FE0F
negative cases reject normally, without a published PNG or native crash.
The macOS runtime CI tests the packaged helper, not merely its source.

`evidence/layout-before.json` measured a vertical thumbnail scroll extent of
124px inside a61px box, covering the filename. `evidence/layout-after.json`
measures both thumb extents at61px, open sidebar body500px and compact464px
inside a500px sidebar. The corrected480×378 dialog has12px paragraph gaps and
fits the900×680 minimum-window probe. This is owned offscreen WK source/CSS
geometry, not a screenshot or a takeover of the user's app. The same probe
uses an admitted Blob MP4, seeks to4.321 seconds before Play and observes
seeking→timeupdate→seeked, readyState4, paused=true. No weaker readiness rule
was required. App-level perceived fluency remains for subjective acceptance.

The first complete Unicode H/V render attempt failed with
`preview file identity changed` inside Documents. Its retained log is
`evidence/unicode-real-renders-r1.log`; no render PASS is claimed from that
attempt. The strict identity guard is unchanged. A current-task stable local
scratch exception and verified SHA256 transfer are pending explicit approval.
Earlier PR97 renders establish their historical scope only. The candidate
signature and static independent review passed; new exact-head CI, the current
full render and the bounded human follow-up remain pending.

Director impact: compatible presentation/glyph extension; typed IR/History
operations and permissions stay unchanged in both directions. No full G1/K4,
ADR 0012, HDR/color or release acceptance is implied.


Current isolated verification: UI324 PASS/1 real runtime-packet case skipped;
Media Python159 PASS with pinned Python3.12.14; Node core692 PASS; Rust55 PASS.
Two of three initial Host failures were resolved by using that supported
interpreter in synthetic managed-runtime fixtures (33-case retest PASS); the
remaining private-copy identity case is blocked under Documents. The first
Python3.9 failure is retained and is not a product defect. CI748 and exact
Runtime107 passed on10202ba, including the packaged Inter selector test and
actual Host/UI packet test. The final UI-only formatting follow-up needs its
own exact-head CI confirmation; no older-head result is substituted.

The final candidate was rebuilt for source-owned trim/ARIA clock width and
clip-owned elapsed clock width, without changing cuts or History. It passed
ad-hoc deep/strict signature verification and the packaged Host three-RPC smoke
against an empty owned store, with no GUI, worker or provider execution. Its
runtime manifest SHA256 is4299ee1a5352ef08e93cb24a169401725f131915be9292d1d62e4eb281303bc6.
The original running app's1024-file inventory and signature were preserved.
Our superseded10202ba candidate is recoverable in CEVRA/Apagar. The final
candidate remains undelivered/unopened; the current Unicode H/V full-render
gate stays BLOCKED pending the explicitly requested stable-scratch exception.

PR98 is a distinct stacked draft over the frozen PR97; PR96/PR97 are unmerged
and unchanged. Read-only independent review approved the final time/ARIA delta
and found no remaining concrete defect within its static/component scope.
At the d3f755f checkpoint the approximately two-second title reload had not
arrived as executable scope. A subsequent delegation supplied the original
15:18:57 report and the later 15:50:24 continuation, confirming correction is
within the active approved scope. The bounded follow-up and its unresolved
latency/paint gates are recorded below. Director: compatible presentation
extension; no new impact from the earlier formatting delta.


### 2026-10-11 — Title-refresh continuity, with latency distinguished

**ACTIVE / NOT MERGED**, PR98. The clarified Owner report says the image
reloads and takes about two seconds after direct title changes/release. The
existing acquisition effect releases decoder/Blob, clears the PNG and resets
readiness on every snapshot before requesting the current composition. H/V
held-response tests reproduced that empty interval. The current segment cache
includes composition identity; bypassing it for a different title would be
incorrect. No cache key, engine, adapter, runtime or identity guard is changed.

FIX NOW: a bounded UI transition retains an inert picture from the last paused,
admitted view only when full sources/timeline, project, graphic ID and aspect
are compatible. The picture is capped at 720px per side, explicitly labelled
“Atualizando preview”/“Updating preview”, and cannot become IR, persistence,
preview input or export source. Frame zero copies the admitted PNG actually
visible; other frames copy the video only if the sampled center pixel is fully opaque.
Transparent/unavailable capture fails back to the existing loading behavior.
Viewer/direct editing were already disabled during load/seek; this guard also
prevents early enablement between new frame-zero readiness and the requested
seek. Ruler, Undo and mode changes retain canonical execution and the latest
target wins. Errors, incompatible changes and unmount clear the picture.
The current packet, PNG, decoder and latest requested frame must be admitted
before release. Typed History, Undo/Redo and render/export authority remain.

UI 331 PASS/1 real packet case skipped locally; the title workflow has 23 cases,
and TypeScript/Vite passes. Independent read-only review found no remaining
concrete finding in this bounded code. Native owned offscreen WK replay of
historical actual MP4/PNG packets retained matching non-black frame-zero
pixel hashes in H 720×404 and V 404×720. First retained visibility was 22/23 ms; with an
explicitly controlled 2000 ms packet delay, current admission took 2139/2518 ms.
No encoder ran in that experiment. At frame 151 the offscreen context returned
transparent video pixels; that failed attempt is retained, and the new guard
rejects it. There is no positive native retention proof away from frame zero
or subjective fluency acceptance from this experiment.

This fixes the reproduced empty transition when an admitted painted picture
is available; it does **not** establish that the approximately two-second
render latency is eliminated. Historical PR96 direct-preview Host calls were
1585 ms H and 1722 ms V, excluding decoder/UI time. Current real Unicode H/V render
and end-to-end latency measurement stay **BLOCKED** by file identity changes
under Documents pending the separately requested scratch exception. CI750 and
Runtime108 passed d3f755f; this new continuity delta needs its own exact-head
checks and rebuilt/signed candidate. The delivered app is not replaced and
no new human round is requested before the remaining gates.

A faster response would need a separately reviewed proposal, not a hidden
optimization here. Existing primitives are the title-free sequence derivative,
closed private-Inter PNG rasterizer and typed title component. A prospective
base-video plus current title-PNG preview would still need a typed/validated
artifact contract, atomic snapshot/frame admission, bounded lifetime/cancel,
and actual H/V pixel/timing/color and export-equivalence measurements. It is
not an existing end-to-end path or an approved implementation; no dependency,
license or provider change is proposed. The simpler current alternative is
the labelled inert-picture transition while the unchanged render completes.
Any new presentation/composition pattern requires separate Owner approval.
Director: compatible presentation extension within the current correction;
no new command, IR/History, permission or provider boundary. Broader G1/K4,
ADR 0012, release and subjective acceptance remain open.


### 2026-10-11 — General Unicode and approved stable scratch

**ACTIVE / NOT MERGED**, PR98. This checkpoint supersedes the FE0E-only
coverage policy and pending-scratch statements above. The Owner clarified
that the symbol report applies to arbitrary symbols, and explicitly approved
other temporary directories when required (Sentinel_7f3c1cb40b1c8191a74708f507dba1bf:
“sim. sempre que precisar pode usar outras pastas.”). The current exclusive
0700 root is `/private/tmp/cevra-pr98-render-20261011`; strict source identity,
publication, resource, deadline and private-process guards remain intact.
Results are copied with SHA256 into the CEVRA evidence directory. Complete
recoverable archival and archive verification must precede scratch cleanup.
The Documents File Provider identity incompatibility is not claimed fixed.

Runtime0.3.8 keeps the existing CoreText/private Inter implementation and
closed adapter. For display only, it removes text/emoji presentation selectors
and normalizes each grapheme to NFC. Covered glyphs remain monochrome Inter;
a grapheme not covered by the private font becomes one visible `□`. Compound
emoji, flags, keycaps and CJK examples therefore no longer fail the whole
preview/export merely because Inter lacks their glyphs. The original text,
including selectors and combining marks, remains exactly stored in IR and
History. Every final shaped run is still checked against Inter, with no system
font fallback, global font registration, new dependency or engine. The helper
reports substitutions; the application does not yet surface an automatic
per-title warning. PT/EN contextual Help explains this display limitation.
This is not universal font coverage or color-emoji support. Oversized text
still fails the closed fitting constraint and must be shortened or resized.

The private native helper tests pass 5 cases in H/V: covered symbols and
selector equivalence, NFC/NFD plus literal escapes, missing compound graphemes,
isolated/repeated selectors, and dimension/overflow rejection. Media Python
162 PASS, UI331 PASS/one real-packet test skipped locally, i18n2 PASS and
TypeScript/Vite PASS. The real runtime matrix passes 33 renders / 51 measured
jobs with 12 title-ROI measurements (MAE≤3, PSNR≥35). Uncertain color and
text-overflow cases fail without publication and clean owned intermediates;
cancellation/deadline retire the private group after the title producer is
observed. The initial functional attempt passed its positive matrix but
failed the test's Swift overflow-error spelling matcher; the corrected matcher
keeps the exact product error prefix. Both attempts remain recoverable.

A distinct real recovery test passes 4 renders / 6 measured jobs, with three
source-removal/Undo/Redo cycles and two physical reopens per aspect. It verifies
original Unicode text, immutable source SHA, typed History, half-open title
frames91..209, all300 CFR frames,480,000 stereo samples and AAC payload identity.
Title ROI: H MAE0.964/PSNR40.443; V MAE2.792/PSNR37.981. Cold Host preview wall
time is1742.393ms H and1859.718ms V, excluding decoder/UI. The raw recovery
receipt retains its harness's earlier FE0E scope label; its separate scope
metadata and actual project/packets record the generalized combining/emoji
text. Runtime manifest SHA256:
`8bc2726f3db9faa76b971b8f5fbfe90497bdddbbf2a50a06cbcf8f82bb9f8789`.

Evidence: `evidence/unicode-functional-runtime038-r2.json` (SHA256
`ab5bdd7ddb124c19cbfe556df40d9f724d2b1783d571288a4e69700cf76a3751`),
`evidence/unicode-recovery-general-runtime038-r2.json` (SHA256
`9146501be84acbab764c4a87b9ceacc57ae112c40c0577b3fbe57080a145326f`),
`evidence/unicode-recovery-general-scope.json`, and their logs. Read-only
independent review checked the runtime, font/source pins, matcher and those
receipts; no new product defect was found in the Unicode delta.

Intermediate-frame native continuity remains a separate open gate. Own passive
WK probes have not yet established matching held/current painted frames; ready
state, metadata, currentTime and seeked alone are not pixel proof. The AppKit
accessory attempt triggered the foreground guard and was terminated, without
claiming PASS. The owned prohibited-activation probe and its synthetic pixel
oracles are still being checked. No reduction/elimination of render latency or
subjective gesture fluency is inferred. The rebuilt0.3.8 candidate is not yet
signed/delivered and this delta needs fresh exact-head CI. The original running
app, project and frozen PR96/97 remain preserved; no human round starts before
technical gates close. Director: compatible display extension; command,
IR/History, permissions and provider boundaries are unchanged.
