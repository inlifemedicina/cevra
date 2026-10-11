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
