# CEVRA — catálogo de homologação do Product Owner

**Reconciliação:** 2026-09-21.
**Roteiro essencial reconciliado:** 2026-10-02; casos A–E e suas expectativas preservados.
**Status:** DOCUMENTO VIVO / CENÁRIOS FUTUROS E NÃO IMPLEMENTADOS DEVEM FICAR `BLOCKED`.

Este catálogo deduplica o acumulado do PR #26. IDs preservados continuam estáveis; variantes repetidas foram consolidadas no mesmo caso. Ele não afirma que as funções existem.

## Regras

- Resultado objetivo: `PASS`, `PARTIAL: motivo`, `FAIL: motivo`, `BLOCKED: função ausente`.
- Julgamento editorial/visual: `APROVADO` ou `REPROVADO: motivo`.
- Automação/equipe técnica prepara fixtures, executa medições e entrega comparativos prontos.
- Product Owner avalia somente qualidade editorial, visual, naturalidade, legibilidade, fluidez e UX quando julgamento humano agrega valor.
- CI/unit tests são necessários, mas não substituem homologação perceptiva.
- Antes de uma build de homologação, derivar somente os casos executáveis, listar fixtures e marcar os demais `BLOCKED`.

Classificações: `[V1]`, `[INT]` integração/provider, `[BENCH]` benchmark, `[ADV]` pós-V1.

## A. Editorial D1–D13

| ID | Classe | Cenário e expectativa |
|---|---|---|
| D1-T1 | V1 | Importar cadastra/valida, sem cortar ou iniciar análise editorial pesada. |
| D1-T2 | V1 | Pedido de edição inicia preparação e reutiliza dados técnicos válidos. |
| D2-T1 | V1 | Talking-head usa texto como eixo e visual sob demanda, sem scan integral obrigatório. |
| D2-T2 | V1 | Conteúdo visual/sem fala avança sem transcrição inútil. |
| D2-T3 | V1 | “Olha isso” pede evidência visual; não inventa o que aparece. |
| D3-T1 | V1 | Hesitação expressiva não é removida como erro automático. |
| D3-T2 | V1 | Repetição útil e falso início não recebem a mesma exclusão mecânica. |
| D4-T1 | V1 | Entre takes equivalentes, recomenda com justificativa; não usa “último/mais curto”. |
| D4-T2 | V1 | Complemento não vira duplicata e contradição não é resolvida silenciosamente. |
| D5-T1 | V1 | Ressalva/condição essencial permanece na montagem. |
| D5-T2 | V1 | Pergunta/resposta e referência anterior permanecem coerentes. |
| D6-T1 | V1 | Alvo aproximado admite variação justificada sem retirar conteúdo essencial. |
| D6-T2 | V1 | Teto rígido não é violado sem decisão; conflito gera alternativa. |
| D6-T3 | V1 | Duração exata usa montagem real e não acelera/remove sentido sem autorização. |
| D7-T1 | V1 | Pausa expressiva não é removida por alerta numérico. |
| D7-T2 | V1 | Shortform e longform não recebem densidade idêntica por default. |
| D8-T1 | V1 | Corte direto/J-cut variam por trecho, sem avanço universal. |
| D8-T2 | V1 | Junção preserva palavra, sync e ausência de sobreposição de fala. |
| D8-T3 | BENCH | Muitas junções não acumulam recode, fade/normalização, RAM/I/O ou instabilidade indevidos. |
| D9-T1 | V1 | Pedido completo gera estratégia principal sem questionário repetido. |
| D9-T2 | V1 | Pergunta ocorre somente por lacuna material e traz recomendação concreta. |
| D10-T1 | V1 | Vídeo normal não recebe grade/correção forte automática. |
| D10-T2 | V1 | Perfil LOG/HDR incerto permanece incerto; metadata sustentada é respeitada. |
| D10-T3 | V1 | Antes/depois, preview e export usam interpretação técnica coerente. |
| D11-T1 | V1 | Passagem baixa recebe ganho localizado sem elevar take inteiro. |
| D11-T2 | V1 | EQ/compressão/de-ess/denoise somente quando justificados. |
| D11-T3 | V1 | Mix final preserva sync, evita clipping e processamento cumulativo. |
| D11-T4 | ADV | Áudio severamente degradado não gera promessa de restauração perfeita/provider automático. |
| D12-T1 | V1 | Inconclusivo é `UNKNOWN`, nunca `PASS`. |
| D12-T2 | V1 | Pausa/tela preta intencional e acidental não recebem a mesma correção. |
| D12-T3 | V1 | Loop para sem progresso/limite e preserva última versão válida. |
| D13-T1 | V1 | Correção localizada permanece ligada à versão assistida e ao trecho correto. |
| D13-T2 | V1 | Feedback agrupado não reanalisa/renderiza após cada marcação. |
| D13-T3 | V1 | Mudança material após aprovação invalida status anterior e atualiza dependências. |

## B. Visual/composição D14–D23

| ID | Classe | Cenário e expectativa |
|---|---|---|
| D14-T1 | V1 | Preset aplicado corresponde a capacidades executáveis. |
| D14-T2 | V1 | Alterar título/zoom não muda montagem ou escolhas não solicitadas. |
| D14-T3 | V1 | Preset salvo não copia falas/tempos e não muda retroativamente. |
| D14-T4 | V1 | Karaokê, Empilhado, Disperso, Simples, Serifada, Clássica e Nenhum funcionam. |
| D15-T1 | V1 | Legenda acompanha áudio real, inclusive J-cut. |
| D15-T2 | V1 | Correção textual permanece editável e não é sobrescrita indevidamente. |
| D15-T3 | V1 | Mudança de corte remapeia tempo e preserva correções válidas. |
| D16-T1 | V1 | Agrupamento considera largura/estilo, não contagem fixa. |
| D16-T2 | V1 | Pontuação/pausas orientam quebra sem mudar fala. |
| D16-T3 | V1 | Cue excessivamente breve é ajustado quando o estilo permitir. |
| D17-T1 | V1 | N1 resolve layout conhecido sem tracking/matting desnecessário. |
| D17-T2 | V1 | N2 usa face/pessoa leve quando necessário. |
| D17-T3 | V1 | N3 usa amostras/occupancy, não matte completo sem necessidade. |
| D17-T4 | ADV | N4 behind-the-subject preserva oclusão temporal quando capability existir. |
| D17-T5 | V1 | Caption atravessa full/split e retorna sem override obsoleto. |
| D17-T7 | V1 | Posição fixada pelo usuário não é sobrescrita silenciosamente. |
| D17-T9 | V1/AUTO | QA detecta clipping/overflow/safe-area e não corrige por conta própria. |
| D17-T10 | V1/AUTO | Ausência de evidência de sujeito não vira falso `PASS`. |
| D17-T11 | V1/AUTO+MANUAL | Snapshot amostrado representa o composite final. |
| D17-T12 | BENCH/AUTO | Níveis pesados não rodam sem necessidade e têm custo medido. |
| D18-T1 | ADV | Pós-V1 reavalia demanda antes de adicionar personalização. |
| D19-T1 | V1 | Duas variantes split preservam fala, intervalos, continuidade e mídia muda. |
| D19-T2 | V1 | Troca de ativo mantém layout/enquadramento/textos e volta a full corretamente. |
| D20-T1 | V1 | Ativo é pertinente à passagem; material genérico não finge demonstração específica. |
| D20-T2 | V1 | Sem IA capaz, escolha explícita/preset funciona e limitação é informada. |
| D21-T1 | INT | Asset externo vira local, com hash/proveniência, e reabre offline. |
| D22-T1 | V1 | Full-frame vs split segue conteúdo/pedido; B-roll não altera fala. |
| D23-T1 | V1/AUTO | Agente não injeta código; parâmetros fora do schema são rejeitados. |
| D23-T2 | V1/AUTO | Componente first-party versionado mantém preview/export e projeto antigo. |
| D23-T9 | ADV | HeroEmphasis é capability separada e não estilo de legenda obrigatório. |
| D23-T10 | INT/AUTO | SubjectMaskProvider permanece desacoplado do modelo concreto. |

## C. Integrações I1–I19 e Creation Modes

| ID | Classe | Cenário e expectativa |
|---|---|---|
| I1-T1 | INT | Round-trip real produz plano estruturado e Change Set validado. |
| I1-T2 | INT | Prosa/intent desconhecido falha fechado e não vira comando. |
| I1-T3 | INT | Plano stale não sobrescreve estado novo. |
| I1-T4 | INT | Retry/cancel/late response não duplica mutação. |
| I1-T5 | INT | EvidenceRequest é scoped, autorizado e sem filesystem. |
| I1-T6 | INT | Dois adapters convergem ao mesmo contrato sem alterar Project IR. |
| I2-T1 | INT | Caminho Codex usa mecanismo oficial e capability/entitlement real. |
| I2-T2 | INT | Sem entitlement/quota, informa limitação e não ativa API paga. |
| I2-T4 | INT | Codex editorial fica contido e não executa shell/engine direto. |
| I3-T1 | INT | Claude usa mecanismo oficial production-ready na data do teste. |
| I3-T3 | INT | BYOK Claude é explícito e cobrado separadamente. |
| I3-T4 | INT | Não contorna assinatura por PTY/scraping/cookie. |
| I4-T1 | V1 | App abre/edita/exporta funções core sem qualquer IA. |
| I4-T2 | INT | Local AI Pack é opcional, hasheado, versionado e removível. |
| I4-T4 | BENCH | Modelo local mede qualidade PT-BR, schema, RAM/VRAM/latência/licença. |
| I5-T1 | INT | Payload contém somente disclosure mínimo e manifesto local. |
| I5-T2 | INT | Áudio/clip curto exige escalada de autorização. |
| I5-T3 | INT | Mídia completa não é enviada automaticamente. |
| I5-T5 | INT | Prompt injection em conteúdo não ganha autoridade. |
| I6-T1 | V1 | JPEG/PNG/WebP/HEIC/HEIF/AVIF fazem ingest real nos targets. |
| I6-T2 | V1 | Extensão/MIME enganoso falha fechado. |
| I6-T4 | V1 | Imagem animada não é flatten silencioso. |
| I7-T3 | INT | Busca federada preserva provider/licença e tolera falha parcial. |
| I7-T6 | INT | Gateway não aceita proxy/URL arbitrário. |
| I8-T1 | V1 | Download é transacional; parcial nunca vira SourceAsset. |
| I8-T3 | V1 | Ativo externo reabre/renderiza offline sem provider. |
| I8-T6 | V1 | Remove→undo→redo não perde arquivo recuperável. |
| I8-T7 | V1 | Lixeira de 30 dias restaura projeto offline. |
| I8-T11 | V1 | Consolidação respeita espaço, progresso, cancelamento e original. |
| I9-T2 | INT | Geração paga para antes da cobrança sem autorização. |
| I9-T5 | V1 | Imagem gerada preserva `generated-ai` e provenance. |
| I10-T5 | V1 | B-roll gerado entra mudo por padrão. |
| I10-T9 | V1 | App funciona sem provider de vídeo generativo. |
| I11-T1 | V1 | SFX nativo funciona offline. |
| I11-T2 | V1 | Cada SFX tem direitos/proveniência/checksum/NOTICE aplicáveis. |
| I11-T11 | V1 | Mix é determinístico e preserva inteligibilidade. |
| I12-T2 | BENCH/AUTO+MANUAL | Matting mede bordas, mãos, movimento, flicker, custo e licença. |
| I12-T4 | V1 | Ausência de matting não bloqueia edição básica. |
| I13-T1 | BENCH/AUTO+MANUAL | Composition benchmark cobre matriz EDVID/CEVRA. |
| I13-T3 | BENCH/AUTO | Preview e export são semanticamente/visualmente coerentes. |
| I13-T7 | V1 | Project IR permanece engine-neutral. |
| I13-T8 | V1 | Código arbitrário de agente/preset é bloqueado. |
| I14-T1 | INT/AUTO | Fluxo editorial normal não exige servidor CEVRA. |
| I14-T6 | INT/AUTO | Arquivo retornado passa por validação/hash/proveniência/ingest. |
| I14-T8 | INT | Agent Playbook orienta sem substituir protocolo. |
| I15-T1 | INT/MANUAL | Pareamento P2P autenticado e revogável. |
| I15-T3 | INT/AUTO+MANUAL | Redes diferentes usam P2P quando possível e falham honestamente. |
| I15-T7 | INT/AUTO | Transferência retoma/verifica hash sem arquivo parcial canônico. |
| I15A-T2 | BENCH/AUTO | CameraSolve3D benchmarka candidato sem acoplar Project IR. |
| I16-T1 | V1/AUTO | Resolve OTIO linked preserva timeline/media refs. |
| I16-T4 | BENCH/AUTO | Premiere XML vs AAF seleciona pelo subset real. |
| I16-T6 | V1/AUTO | Handoff Report lista NATIVE/BAKED/APPROXIMATED/UNSUPPORTED. |
| I17-T1 | DEV/AUTO | Dev funciona sem backend live. |
| I17-T2 | V1/AUTO | Stable rejeita Development Entitlement. |
| I17-T8 | V1/AUTO+MANUAL | Recovery Mode não produz nova saída utilizável. |
| I17-T9 | V1 | Recovery preserva projetos/fontes. |
| I18-T1 | V1/AUTO | Core Runtime Closure detecta artifact obrigatório ausente. |
| I18-T5 | V1/AUTO | DMG é assinado/notarizado no target macOS. |
| I18-T6 | V1/AUTO | NSIS per-user é assinado no target Windows. |
| I18-T13 | V1/AUTO | Behavioral telemetry permanece NoOp. |
| I18-T14 | V1/AUTO | Crash payload respeita allowlist e exclui conteúdo. |
| I18-T16 | V1/AUTO | Session replay não existe. |
| I19-T1 | V1 | Export local funciona sem publishing/analytics/Skill. |
| I19-T3 | INT | Bridge usa protocolo tipado e depende de Vids para execução. |
| I19-T7 | ADV | Creator Full entrega vídeo final standalone. |
| I19-T9 | INT/AUTO | Lite/Full compartilham núcleo editorial sem drift silencioso. |
| CM-T1 | V1 | Faceless produz roteiro/storyboard/narração/composição no mesmo projeto. |
| CM-T2 | V1/INT | TTS é provider-neutral e não implica voice clone. |
| CM-T4 | V1 | Slideshow usa Project IR/composição, sem timeline paralela. |
| CM-T5 | BENCH | Rhythm analyzer mede menor capability proporcional antes de Music-to-video. |

## D. Fable K1–K5

| ID | Classe | Cenário e expectativa |
|---|---|---|
| K1-T1 | V1/AUTO+MANUAL | Windows x64 valida `h264_mf`, capability smoke, compatibilidade e ausência de AV1/VP9 silencioso. |
| K1-T2 | BENCH | Falha material de Media Foundation reabre fallback; não instala OpenH264 automaticamente. |
| K2-T1 | V1/AUTO+MANUAL | iPhone HDR/Dolby Vision decodificável → SDR BT.709 sem washout. |
| K2-T2 | V1/AUTO+MANUAL | HLG/HDR10 → SDR preserva cor/contraste aceitáveis. |
| K2-T3 | V1/AUTO | Ingest preserva orientação, primaries, transfer, matrix/range, bit depth e VFR. |
| K2-T4 | V1 | Source não convertível falha explicitamente; nunca exporta cor incorreta silenciosa. |
| K3-T1 | V1/AUTO | Composition gera vídeo visual uma vez e mux final usa stream-copy quando válido. |
| K3-T2 | V1/AUTO | Áudio final, sync e duration vêm do plano canônico sem segunda fonte de verdade. |
| K4-T1 | BENCH/AUTO+MANUAL | Cada engine candidato demonstra live-preview/caminho compartilhado viável. |
| K4-T2 | BENCH/AUTO | Export usa original/melhor fonte sem intermediário com perda evitável. |
| K5-T1 | V1/AUTO+MANUAL | macOS arm64 passa clean-machine core/import/edit/preview/export/HDR/update. |
| K5-T2 | V1/AUTO+MANUAL | Windows x64 passa a mesma closure. |
| K5-T3 | V1/AUTO | Release não promete plataforma não homologada. |

## E. Transversais

| ID | Expectativa |
|---|---|
| X-T1 | Undo/redo preserva estado e ativos recuperáveis. |
| X-T2 | Save/reopen mantém estado e resultado. |
| X-T3 | Cancelamento não promove parcial/corrompido. |
| X-T4 | Crash/recovery restaura último estado válido. |
| X-T5 | Original permanece imutável. |
| X-T6 | Preview e export preservam semântica/visual conforme tolerância declarada. |
| X-T7 | Funções core continuam sem IA. |
| X-T8 | Provider, custo e disclosure de dados são honestos. |
| X-T9 | UI permanece responsiva e custo completo é medido. |
| X-T10 | Paridade EDVID ou `DIVERGÊNCIA EDVID` tem evidência. |

## F. Roteiro essencial para a build de homologação

**Bloco aprovado em 2026-10-05:** fundação + G1 (montagem contínua manual,
preview da sequência e export simples) seguem o [plano G1](CEVRA_MANUAL_SEQUENCE_G1.md),
com G5/G6 acompanhando e automação antes da rodada humana agrupada. Reutilizar
os IDs abaixo por variante; nenhum novo catálogo, G1 PASS ou microteste humano
foi criado. Contratos/consumers/perfil pendentes ficam BLOCKED. Aceites limitados
anteriores permanecem históricos; aprovação do plano não promove seus IDs completos.

Preparação técnica do consumer de sequência: UNIT/FAKE 134/134 UI e 149/149 Host
passaram, reutilizando I4-T1, X-T1/T7 e a variante de preview X-T6. Cobertura:
transições, seek nas junções, repetição explícita, seleção Original, edição durante
preparação, redo preservado e eventos tardios. O app usa previews Take admitidos
por clip e pode esperar na junção; APP/OWNER, reprodução nativa/gapless, sync e
G1/G5/G6 completos continuam NÃO EXECUTADO/BLOCKED conforme a variante.
O perfil de bordas do export permanece pendente; a prova H.264 B-frames/7 ms é
RUNTIME sintético, não aceite do export pelo app. Nenhum teste humano foi feito.

### Single grouped G1 script

Roteiro único preparado para uma build futura coordenada e identificada por
SHA/runtime. Usar somente projeto descartável e duas fixtures locais admitidas,
com hashes registrados; preservar o projeto humano e a rodada Take existentes.
Não instalar/abrir agora nem repetir aceites históricos. Registrar por ID e
variante os resultados técnicos e o julgamento perceptual separado.

1. **I4-T1, X-T1/T7:** abrir a build coordenada sem IA; alternar PT/EN e coluna
   aberta/compacta. Conferir timeline, seleção e acesso aos controles por scroll.
2. **D1-T1, X-T5:** importar as duas fixtures admitidas; marcar quatro trechos,
   incluindo repetição de uma fonte e um trecho da segunda. Conferir conteúdo,
   ordem, numeração e hashes dos originais.
3. **D14-T2, X-T1/T2:** percorrer append/insert/duplicate/split/trim/reorder/remove
   em uma montagem contínua. Undo/Redo deve desfazer/refazer uma ação por vez;
   salvar/reabrir preserva sequência, cursor e fontes.
4. **X-T6/T9, I8-T3/T6:** ouvir/ver Sequência, buscar nas junções e no OUT, repetir
   explicitamente e voltar a Original para novas marcas. Registrar continuidade,
   voz/imagem, conteúdo e tempo percebido; a junção pode aguardar preparação.
   Nenhum resultado fake substitui esse julgamento nativo/perceptual.
5. **X-T3/T5/T7:** escolher um destino novo em “Preparar destino”; cancelar pelo
   seletor e durante preparo; editar/Undo enquanto prepara; tentar uma saída já
   existente. Deve haver estado/erro honesto, nenhuma saída/história criada pelo
   preparo e nenhum original/arquivo anterior alterado. O Export final segue
   indisponível nesta preparação.
6. **I17-T8/T9, X-T2/T4:** usar uma falha de save preparada pela equipe técnica,
   Retry e novo Close; conferir preservação do projeto/Undo/Redo/reabertura.
   Timeout/retirement desconhecido mantém o projeto aberto; não forçar descarte.
7. **D8-T2, I19-T1, X-T3/T5/T6/T9:** export final e oráculos de ordem/IN/OUT/
   duração/áudio/cor/qualidade/recursos ficam **BLOCKED** até decisão temporal,
   pipeline/runtime/envelope e provas de publicação/limites concluídos. Depois,
   executar essa variante na mesma rodada agrupada; não alegar PASS antecipado.

Estado deste roteiro: **NÃO EXECUTADO / preparação documental**. Não promove G1,
G5/G6, native/owner, progresso ou F-A02. A política temporal continua OPEN.

Este roteiro agrega os IDs de A–E; não substitui nem duplica os casos canônicos. Preencher um registro por ID/variante/target, inclusive quando vários IDs forem percorridos no mesmo fluxo. Nenhum cenário foi executado nesta reconciliação.

**Execução** começa como `NÃO EXECUTADO`; isso não é resultado. Depois do teste, registrar o resultado objetivo das Regras e, quando necessário, o julgamento humano separado. Marcar `BLOCKED` com a dependência concreta antes de tentar uma função ausente. Uma fundação implementada ou um PASS de CI/fake não equivale a PASS do fluxo no app. A build deve declarar as capabilities realmente disponíveis.

Preparação comum: build/commit identificados, macOS arm64 e Windows x64 avaliados separadamente, PT-BR e EN-US, projeto descartável e mídias de fixture locais com licença/proveniência e hashes. Incluir fala com falso início, repetição útil, ressalva essencial, múltiplos takes, áudio baixo, pausa intencional, imagem estática, mídia inválida e HDR/VFR quando suportados. A equipe técnica prepara passos/medições/comparativos; o Owner julga apenas o que exige percepção editorial, visual ou de UX. Não usar mídia/conta pessoal como evidência pública.

| Fluxo / IDs existentes | Passos essenciais | Resultado esperado e evidência | Estado inicial / gate atual |
|---|---|---|---|
| Instalar, abrir e trabalhar sem IA — K5-T1/T2/T3, I18-T1/T5/T6, I4-T1, X-T7 | Instalar em máquina limpa; abrir sem provider conectado; trocar PT-BR/EN-US; percorrer funções core disponíveis. | Build correta, capabilities honestas e core sem dependência de IA; registrar versão/SHA/OS e telas. | NÃO EXECUTADO; BLOCKED para closure/distribuição ou fluxo core ainda ausente. Uma build de desenvolvimento não prova release homologada. |
| Importar com segurança — D1-T1, I6-T1/T2/T4, K2-T3/T4, X-T5 | Importar vídeo, áudio e imagens suportadas; conferir orientação/metadados; tentar MIME enganoso/arquivo inválido; cancelar. | Ativo validado sem análise/corte automático, original intacto e nenhuma promoção de parcial; hashes e inventário por variante. | NÃO EXECUTADO; ingest nativo de vídeo/áudio é fundamento existente. Ingest de imagem não integra o V1 fechado; imagens e qualquer formato/target sem capability ficam BLOCKED. |
| Editar manualmente no Normal — I4-T1, D14-T2, D8-T2, X-T1/T7/T10 | Aparar, dividir, mover e remover trechos disponíveis; ajustar item contextual; desfazer/refazer; combinar com pedido de refinamento quando disponível. | Mesma timeline/Project IR/History, alterações reversíveis e resultado direto no preview; projeto antes/depois e comparação. | Variante inicial manual IN/OUT: UNIT PASS; APP/OWNER funcional PASS na [rodada macOS de 2026-10-04](#manual-inout-macos-2026-10-04), com ressalva visual de disponibilidade do botão. Um undo remove o clip; track preparada permanece vazia. Aparar/dividir/mover, multi-clip e refinamento por IA continuam BLOCKED nas variantes ausentes. |
| Salvar e reabrir — X-T1/T2/T5, I8-T3/T6, I17-T9 | Salvar após alterações; fechar/reabrir offline; desfazer/refazer; conferir ativos, numeração estável de fontes e original. | Estado e ativos preservados, sem segunda fonte de verdade; snapshots e hashes. | APP/OWNER: NÃO EXECUTADO. O follow-up de PR #78 verifica por UNIT fixtures o contrato limitado de numeração/reservas, remoção/undo/redo/restore, save/reopen e compatibilidade V1/V2 ([ADR 0031](adr/0031-stable-source-numbering-v1.md)); isso não prova o fluxo completo de edição. Ativos externos exigem sua capability própria. |
| Preview e sync — X-T6/T9, I13-T3, K3-T2, K4-T1 | Play/pause/seek e amostrar junções, layouts e legendas; comparar com export quando disponível. | Semântica, sync e composite coerentes dentro da tolerância previamente declarada; timestamps/capturas/medição. | Variante inicial de original/trecho simples: UNIT guards de media clock/seek/OUT/metadata e snapshot PASS; decodificação real e reprodução limitada ao trecho APP/OWNER PASS na [rodada macOS de 2026-10-04](#manual-inout-macos-2026-10-04). O cap de 8 MiB é do teste inicial. Sync medido, junções, layouts, legendas, composição e comparação com export continuam BLOCKED nas variantes ausentes. |
| Transcrever, corrigir e alinhar — D2-T1/T2, D15-T2/T3, X-T1/T2 | Transcrever fixtures PT-BR/EN-US em runtime configurado; corrigir texto; alinhar quando disponível; undo/redo e reabrir. | Texto/tempos e correções editáveis ligados à source, sem inventar fala nem sobrescrever correção válida; transcript/projeto e comparação. | NÃO EXECUTADO; exigir runtime/modelos disponíveis. Ausência de packaging/capability, edição textual no app ou integração de caption bloqueia a variante correspondente. |
| Consentimento e análise por IA — I1-T1/T2/T3/T4/T5, I5-T1/T2/T3/T5, X-T8 | Primeiro executar negativos sem provider; somente em futura sessão especificamente autorizada executar o caso live; testar negação/cancelamento/stale/disclosure. | Sem authority por arquivo/ledger/conteúdo; nenhum envio/cobrança/mutação não autorizados; resultado real validado com evidência redigida. | BLOCKED para prova real: round-trip NOT DEMONSTRATED. Testes fake do harness não homologam IA nem o app; análise textual aceita, quando existir, não completa por si só I1-T1/plano/Change Set. |
| Estratégia e montagem de múltiplos takes — D2-T3, D3-T1/T2, D4-T1/T2, D5-T1/T2, D6-T1/T2/T3, D9-T1/T2 | Pedir edição com objetivo e duração; comparar takes; manter condição essencial; revisar justificativa e versão final. | Sentido preservado, duração respeitada ou conflito explicitado; projeto/render e julgamento editorial. | BLOCKED até análise/estratégia/comandos e montagem integrados; não simular aceitação com analyzer scripted. |
| Legendas e layouts — D14-T4, D15-T1/T2/T3, D16-T1/T2/T3, D17-T1/T5/T7/T9/T10/T11 | Aplicar estilos previstos; corrigir texto; mudar corte/full/split; testar safe-area e posição fixada. | Timing, legibilidade, correções e overrides preservados; composite final/QA e avaliação visual. | BLOCKED por capability/Composition/preview ausente; testar cada estilo/target implementado sem declarar os demais PASS. |
| Áudio, junções e SFX — D8-T1/T2, D11-T1/T2/T3, I11-T1/T2/T11, K3-T2 | Montar junções; corrigir passagem baixa; acrescentar SFX permitido; medir mix/sync/clipping e ouvir o final. | Inteligibilidade, sync e ausência de processamento cumulativo; medições e julgamento auditivo com ativos licenciados. | BLOCKED para fluxo integrado ausente; primitive/FFmpeg PASS não é homologação do mix no app. |
| Títulos, imagens e B-roll — D14-T1/T2, D19-T1/T2, D20-T1/T2, D22-T1, D21-T1 | Inserir ativo local pertinente; alterar título/zoom/layout; remover/undo; reabrir offline. | Asset editável com proveniência, fala intacta e nenhuma mudança editorial não pedida; projeto e comparação visual. | BLOCKED onde asset/layout/compiler integrado não existir. Provider opcional não pode bloquear alternativa manual. |
| Exportar o resultado — I19-T1, K1-T1, K2-T1/T2/T4, K3-T1/T2, K4-T2, X-T5/T6 | Exportar projeto aprovado; comparar preview/final; usar original; testar target SDR/HDR suportado; cancelar e tentar falha/disco insuficiente. | Saída válida, sync/cor/duração coerentes e nenhuma promoção de parcial; arquivo, hash, probe e comparativo perceptivo. | BLOCKED até export/Composition/closure do target estarem disponíveis; runtime determinístico isolado não prova export pelo app. |
| Cancelamento e recuperação — X-T3/T4, I17-T8/T9, I8-T11, D12-T3 | Cancelar ingest/transcrição/export disponíveis; interromper em fixture descartável; reabrir e recuperar; simular artefato inválido/armazenamento insuficiente. | Último estado válido recuperável, sem repetição de operação ou saída falsa; checkpoints/evidência de falha, sem apagar originais. | NÃO EXECUTADO; bloquear a variante sem fluxo ou fixture segura. Recovery existente é fundamento, não PASS perceptivo. |
| Privacidade e providers opcionais — I2-T2, I3-T3/T4, I5-T1/T2/T3/T5, I9-T2, I18-T13/T14/T16, X-T7/T8 | Revisar disclosures/capabilities; negar provider/cobrança; operar core offline; conferir diagnósticos redigidos; live só com decisão específica. | Sem API paga, upload integral, credential/grant ou conteúdo pessoal implícitos; controles honestos e evidência sem dados privados. | NÃO EXECUTADO; testes que exigem integração/live continuam BLOCKED até existir capability e autorização específicas. |

<a id="manual-inout-macos-2026-10-04"></a>

### Rodada manual IN/OUT — macOS, 2026-10-04 UTC

- **APP/BUILD REAL / Owner:** macOS arm64, PT-BR, demo isolada de PR #80 em `1855c445687eb22102bfb870773f74fca7d315e3`. Projeto descartável com uma fonte admitida, sem clips iniciais e sem provider conectado.
- **Fixture:** `manual-original.mp4`, sintética gerada para o teste, sem mídia pessoal ou de terceiros; H.264/AAC, 480 × 270, 30 fps, 6 s, 436.527 bytes. SHA-256 `90741e2ebebc4a7bfee427a5a6b72e5a9857a3a5a259cfbbb5e30438a00a2058`.
- **PASS funcional da variante:** o Owner confirmou reprodução, marcação IN/OUT, criação de um clip visível, reprodução limitada ao trecho e desfazer/refazer. Evidência humana: “Tudo funcionou ok”, com a ressalva de que o botão de criar clip não pareceu ativado após OUT, mas funcionou ao clicar. O resultado vale para esses passos de I4-T1, X-T1/T7 e a parte original/trecho de X-T6; não promove os IDs completos a PASS.
- **Ressalva visual:** a classe reaproveitada de Importar forçava opacidade reduzida em ambos os estados. A correção usa estilo exclusivo: azul sólido quando habilitado; cinza com opacidade reduzida quando desabilitado. A validação de intervalo, seek, busy e a operação tipada continuam iguais. UNIT: 54 testes pertinentes PASS, incluindo IN sem OUT, OUT válido, seek, busy, criação e undo/redo. BROWSER/OFFSCREEN: cores distintas, opacidade 1 versus 0,48 e contraste do texto habilitado 5,87:1 PASS. Essa evidência é técnica, não um novo aceite visual do Owner na build atualizada; a rodada funcional permanece válida, sem solicitar sua repetição completa.
- **Limites:** salvar/reabrir no app, Windows, EN-US no app, distribuição/instalação em máquina limpa, sync medido, composição/export e cenários ausentes continuam não executados ou BLOCKED conforme a variante. Nenhuma chamada de IA foi feita. A correção fica em PR #80 sem merge, com atualização nativa separada da sessão aberta do Owner.

### Registro de execução e conclusão

Para cada ID e variante registrar: data/responsável, versão + commit da build, OS/arquitetura/locale, fixture + hash/proveniência, precondições/capabilities, passos realizados, esperado versus observado, resultado objetivo, julgamento humano quando aplicável e link da evidência/issue. Evidência técnica automatizada deve ficar rotulada `CI/UNIT/FAKE/RUNTIME`; homologação deve identificar `APP/BUILD REAL`.

Não promover um fluxo a PASS se só parte foi executada. Registrar PARTIAL com os IDs/variantes faltantes; BLOCKED conserva o teste planejado e a dependência concreta. Publicar somente artefatos sintéticos/redigidos, com licença e sem mídia/conta pessoal. Não adicionar dumps, exports pesados ou logs temporários ao repositório. Esta lista prepara a homologação futura; não autoriza provider, gasto, nova feature, engine ou mudança de escopo.

### Direct timeline trim — additional bounded round, 2026-10-04

I4-T1, X-T1/T7 and simple-clip X-T6 are reused for the owner-approved follow-up.
UNIT/RUNTIME: pointer/keyboard range adjustment, one `clip.trim` per confirmed
edit, cancellation/no-op, descriptor/snapshot/busy guards, checkpoint/reopen and
preview/undo/redo PASS in the bounded fixture. APP/OWNER: NOT EXECUTED for this
new block. One prepared isolated demo reuses the earlier synthetic original,
with an initial 1.500–4.500 s clip, without replacing or activating existing
windows. [The scoped record](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#one-additional-owner-round)
contains the consolidated steps and evidence limits. PR #80's earlier functional
acceptance remains valid; #80 is now integrated and its CI 5/5 plus Exact Runtime
1/1 passed after merge. No full catalog ID, composition/export, native Windows,
release or new provider acceptance follows from these bounded results.


#### Owner feedback for direct trim — 2026-10-04

On native PR #82 head `1f9389d3fadd3d3b86da4b89f1a86baac99cba2d`, cancellation,
100/10 ms keyboard adjustments and undo/redo were accepted for this bounded
variant. Pointer editing worked functionally; IN visual feedback was rejected
because OUT appeared to move. Source/clip counter interpretation was questioned
for IN 2.000 / OUT 3.990 s, so perceptual playback acceptance stays pending.
The scoped correction preserves those passes and rechecks only IN visual drag
and clarified playback clocks. UNIT/browser measurement complements that recheck;
it does not promote full catalog IDs or native/frame-accurate decoding to PASS.
[Diagnosis, limits and presentation contract](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#owner-feedback-and-bounded-correction--2026-10-04).

The complete headless callback record contains 4.000/4.033333 s after OUT3.990,
followed by corrective seek. Final `currentTime`3.990 alone is not a bounded-
playback PASS. That historical build left the case OPEN. The owner subsequently
approved the bounded derivative: six decoded frame/audio cases, host integration
and separate real-file Chrome EOF checks PASS with explicit frame/AAC
quantization. The separate runtime-bearing native demo is prepared unopened;
native perceptual acceptance remains PENDING. Recheck only visual IN drag and
new excerpt playback together, preserving accepted cancellation, keyboard and
undo/redo. This does not promote full I4-T1, X-T1/T7, X-T6, composition/export,
release or provider gates. [Current implemented profile and evidence](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-bounded-derived-preview--2026-10-04).


### Take preview expansion — 2026-10-04

Reuse X-T6/T9, I13-T3 and K3-T2; this is another bounded variant of the same
preview/sync rows. AUTO PASS: measured CFR/VFR frame-content/PTS, Full HD portrait,
quarter-turn orientation negative control, source >8 MiB/payload ≤8 MiB, aligned
PCM offset/edge silence/interior-gap rejection, ≤60 s, original identity and
production-host close/reopen. Legacy v1 evidence remains PASS.

APP/OWNER real Take footage: BLOCKED until the authorized transferred Mac file
is designated. Reserve one consolidated round for only the new points:

1. Import the designated recording; confirm correct upright picture and voice
   sync in Original's explicitly labelled lightweight local preview.
2. Create/review an excerpt; confirm orientation, voice sync and intended content.
3. Save, close and reopen the isolated review session; confirm the same project,
   source numbering, clip and regenerated playback.

Do not repeat accepted keyboard/cancel/undo or IN drag checks. Synthetic fixtures
are technical control evidence, never human acceptance. HDR/composition/export
and broader release gates stay BLOCKED. [Profile and limits](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-take-local-preview-expansion--2026-10-04).


#### Real Take technical follow-up — 2026-10-04

Same X-T6/T9, I13-T3 and K3-T2 bounded variant: designated recording local
preflight/import/Original proxy/5–10 s clip/host close/reopen AUTO PASS. Original
hash, canonical project, numbering and undo unchanged. Decoded pixels confirm
orientation against an unrotated control; PCM correlation shows zero measured
sample lag. QuickTime time-base/matrix/edit-list regression and negatives PASS.
No recording/derived media is committed or transferred externally.

The earlier file-designation BLOCKED state is resolved. APP/OWNER native
orientation/voice sync, excerpt perception and save/close/reopen remain PENDING,
using only the same three new consolidated steps above. Technical automation is
not human acceptance; preserve already accepted keyboard/cancel/undo/IN results.
[Real evidence and limits](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#real-take-technical-validation--2026-10-04).

#### Real Take owner round and first-frame follow-up — 2026-10-05

At PR #84 head `b57c64926b64c470adaaecd76acb0f290eeac70d`, the owner reported
all requested steps working: native Original/excerpt orientation and voice
synchronization, excerpt content, and save/close/reopen. These scoped APP/OWNER
steps are PASS; the complete catalog IDs remain governed by their broader gates.
Selecting the original or the V1 excerpt initially left the preview blank until
Play. This distinct first-frame defect is FAIL at that head. Prior acceptance
remains valid. Recheck only selection of Original and the simple V1 excerpt
before Play after the correction; do not request another full round.

Technical correction: load frame data eagerly while remaining paused, and
unlock preview controls only after validated metadata and current-frame data.
Focused UNIT cases cover Original/excerpt, buffered data and stale selection
events. Native WKWebView synthetic evidence distinguishes metadata-only blank
output from visible initial-frame output at zero time with no play events.
This evidence does not replace the pending point-specific owner check.

#### Editing column and paused-frame owner check — 2026-10-05

Reuse the Normal manual-editing variant (I4-T1, D14-T2, X-T1/T7/T10) and the
point-specific Original/simple V1 preview check above. The owner approved the
full-height right column with Director/editorial draft above context, adjustable
height/width and independent scroll. After testing Draft #85 `f4ea20f`, the owner
explicitly replaced whole-column collapse with a 286 px upper-only compact
column, Director/Controls tabs and a full-width timeline below. Open retains
its full-height adjustable layout. The follow-up package combines this layout
with a bounded V1 paused-frame correction; prepare it closed while Take testing
continues. It is not a release or merged build.

1. After normally quitting the previous review app, open the designated new
   package when the owner authorizes that session transition, select the existing
   V1 excerpt before Play. Confirm its initial frame appears paused, with the
   central IN/OUT and excerpt intact. Original's initial-frame PASS at `f4ea20f`
   is preserved; do not repeat it without a new regression.
2. Read the Director/editorial draft and contextual controls; resize the width
   and divider and scroll the two areas independently. Enter a temporary title,
   note or instruction, switch to compact, use Director/Controls tabs and return
   to open. Confirm the compact column occupies only the upper editing area,
   the timeline spans the full lower width, and text, independent scroll,
   selection and playhead survive. Assess legibility in both modes and PT/EN;
   window/source aspect changes must not switch modes automatically.

Status: UNIT PASS (Desktop 105/105, including seven sidebar regressions and
bounded excerpt-image lifecycle cases; i18n 2/2). Earlier whole-collapse native
geometry/state/initial-frame PASS applies only to `f4ea20f` technical fixtures.
At that head APP/OWNER Original initial frame is PASS and V1 initial frame is
FAIL; the revised compact layout is newly approved and PENDING. Native technical
verification of the correction remains in progress and cannot promote owner
acceptance. The isolated derived fixture has not reproduced the human V1
failure; the follow-up displays its decoded paused frame as an ephemeral image
until Play/seek, without storing or transmitting it. The follow-up at `ce53f81`
then exposed premature black canvas pixels in WKWebView before a rendering turn;
current code defers capture and cancels stale tasks, with a red-before regression.
The display is asleep/inactive and suspends native rendering callbacks. Thus
awake native painting/scroll and the point-specific owner check remain PENDING;
the environment was not awakened or replaced to manufacture a native PASS.
Preserve the earlier real Take orientation/voice/excerpt/save/reopen PASS at
`b57c649`; no repeated full round or promotion of broader catalog IDs. Final
exact review, CI and package identity are reported in the dependent Draft and
local technical receipt. No private project-store inspection/copy or media
publication is part of this check.


#### Preview fluency and first-frame-only recheck — 2026-10-05

Reuse I4-T1, D14-T2, X-T1/T7/T10 and the bounded simple-clip X-T6/T9,
I13-T3 and K3-T2 variant. The owner accepted the R2 compact/tabs/fields/scroll
round at 12:34 UTC; the earlier numbered layout step is now PASS for that bounded
variant and must not be repeated. Preserve Original first-frame PASS and the
real Take orientation/voice/content/save/reopen PASS. The V1 first-frame
APP/OWNER FAIL at R2 remains historical evidence; technical controls alone
cannot supersede it.

After a safe owner-directed normal transition to the designated reviewed
package, select the existing V1 excerpt before Play. Confirm its intended first
frame appears while paused, with the existing IN/OUT and excerpt intact. This
was the only new human recheck. On the owner-directed R3 transition at reviewed
commit `7d4e66776fbfc112429d333e5d8883221c2851fb` (tree
`e303129639b24a5187ae81baaf12a949528c8af2`), the owner reported: “NO ORIGINAL
APARECEU. NO V1 APARECEU NA PRIMEIRA APOS 2SEG E APOS IR E VOLTAR FICOU
IMEDIATO.” This establishes APP/OWNER PASS for the corrected paused V1 first
frame and the observed Original↔V1 switching in this bounded fixture. The
approximately two-second first selection and subsequent immediate switches
are human observations, not a measured latency guarantee. No full repeated
round or promotion of composition/export/release/catalog-wide acceptance follows.

The same report asks where the IN/OUT buttons went. This is a separate
discoverability question, not an IN/OUT acceptance. Read-only inspection found
the existing selected V1's two enabled timeline handles inside the visible
window in open mode, with canonical IN 5.037 s and OUT 9.928 s. “Marcar IN/OUT”
creation buttons render only while the timeline is empty; that condition also
exists in the pre-R3 base. No control was moved to the sidebar, and this check
performed no trim, selection, scroll, Play or focus action. Keep the previously
accepted trim behavior without promoting this unanswered UX observation to PASS.

AUTO/UNIT: exact-range cache identity/eviction/undo/redo/cancellation/close,
admitted PNG publication and stale UI decoding, plus verified independent
inspection reuse pass. Complete local CI (Desktop 110), Python 101, Rust 28 and
ten sealed-runtime functional cases PASS. Native complete-IPC technical control PASS (current PNG, paused zero, Play-ready,
undo/redo and superseded cancellation), with separate budget/eviction/close PASS.
Exact final CI and package identity belong in the technical receipt and Draft #85;
failed harness attempts remain failed evidence. No automatic Play or product
brightness gate, no original change, private human-store read/copy, media
publication or actual AI. [Current bounds and evidence](CEVRA_MANUAL_TIMELINE_TRIM_V1.md#approved-preview-fluency-and-admitted-png--2026-10-05).
