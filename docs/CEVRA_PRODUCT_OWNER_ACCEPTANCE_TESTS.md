# CEVRA — catálogo de homologação do Product Owner

**Reconciliação:** 2026-09-21.
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
