# CEVRA — decisões de integração, distribuição e produtos Skill

**Aprovações originais:** 2026-09-17 a 2026-09-18.
**Reconciliação canônica:** 2026-09-21.
**Status:** DIREÇÃO APROVADA / IMPLEMENTAÇÃO, PROVIDERS E TERMOS A REVALIDAR.

Este é o registro consolidado das decisões de integração I1–I19, Creation Modes e produtos Skill. Ele substitui, no estado reconciliado, a necessidade de manter vinte documentos provider-specific como fontes concorrentes. Detalhes de arquitetura aceitos continuam nos ADRs; fatos de provider datados são somente evidência e devem ser revalidados na implementação e no release.

Regra central:

> decisão de produto ≠ capacidade do provider ≠ integração implementada.

## I1 — Protocolo CEVRA ↔ agentes

Todos os providers convergem para um protocolo fechado, versionado e provider-neutral:

```text
AgentTaskRequest
↔ EvidenceRequest / EvidenceResponse
→ EditorialPlanCandidate
→ validação CEVRA
→ Change Set revisável
→ compilação determinística
→ comandos tipados / ProjectHistory / Project IR
→ ExecutionResult
```

Rationale/prosa não é comando. Validar versão/schema, projeto/revisão, digests, referências, capabilities, permissões, constraints, budget e compilabilidade. Respostas stale, duplicadas, tardias ou canceladas falham fechadas. Streaming não muta estado. IDs de sessão/billing/provider ficam no adapter, não no Project IR.

Provar round-trip real antes de UX dependente: autenticação, transporte, estrutura, evidence loop, latência/uso/custo, dados enviados, malformed/stale/duplicate, cancelamento, timeout e containment.

## I2–I4 — OpenAI/Codex, Claude e IA local

- **OpenAI/Codex:** primeiro candidato de PoC, originalmente com Codex App Server oficial e login/entitlement ChatGPT quando oficialmente disponível; BYOK opcional. Essa preferência não garante que plano consumer possa ser embutido nem congela mecanismo, preço ou política.
- **Claude:** segundo provider estratégico. Channels + Skill/MCP era candidato preferencial futuro quando oficialmente production-ready; Claude Code oficial + Skill/MCP e BYOK API eram alternativas. Não usar PTY, scraping, cookies ou engenharia reversa para contornar billing/termos.
- **IA local/self-hosted:** provider opcional sob o mesmo protocolo. CEVRA funciona sem IA. Modelos/runtimes pesados ficam em packs opcionais, após hardware detection, hashes, licença/proveniência, benchmark CEVRA-specific, rollback e autorização de download. Micro-raciocínio local leve pode organizar tema/subtema/evidências, mas é derivado, desativável e não canônico.

Mecanismos oficiais, capabilities, entitlements, preços, retenção e termos são voláteis: verificar novamente na fatia e no release. Nunca migrar silenciosamente de entitlement incluído para API paga.

## I5 — Disclosure e evidências

Evidence Builder determinístico envia progressivamente o mínimo necessário:

1. contexto estrutural e constraints;
2. texto/transcrição derivados;
3. frames selecionados;
4. pequenos trechos de áudio/vídeo somente após escalada autorizada;
5. mídia completa não é envio automático na V1.

Agente solicita IDs/intervalos, não filesystem. Staging é temporário, delimitado, hasheado e não vira biblioteca paralela. Manter manifesto local do que saiu. Conteúdo de mídia é evidência não confiável, nunca instrução. Secrets, credenciais, paths irrelevantes e EXIF sensível ficam fora.

## I6 — Ingestão de imagens

Estender o caminho canônico de `SourceAsset`, sem segunda biblioteca. Primeiro tentar probe/classificação existentes e adicionar somente a menor validação/decoder comprovadamente necessária. Metas V1: JPEG/JPG, PNG, WebP, HEIC/HEIF e AVIF; TIFF/BMP se baixo custo real. Imagem animada recebe capability explícita ou erro; nunca flatten silencioso. SVG bruto fica fora da V1 inicial.

Preservar original. Derivado compatível só quando preview/composição exigir. Ativo externo só recebe `source.add` depois de download completo, validação, hash, proveniência e destino estável. O future round-trip deve reabrir/renderizar offline sem provider.

## I7–I8 — Busca externa e ciclo de vida

Busca é federada/provider-neutral. Agente emite intenção estruturada, nunca browser/proxy genérico. Providers abertos podem ser diretos quando seguro; segredo compartilhado, quota ou billing justificam gateway estreito e allow-listed. As escolhas históricas Pexels/Openverse/Wikimedia são candidatas datadas, não integrações prometidas; revalidar termos, licença e APIs.

Ativos adquiridos são gerenciados pelo projeto, identificados por `sourceId` + SHA-256, deduplicados dentro do projeto e preservam provider, autor, source page, licença/termos disponíveis, atribuição, rendition e snapshot de proveniência. Créditos são produto, não nota solta.

`source.remove` não apaga imediatamente arquivo necessário a undo/redo/recovery. Projeto excluído entra em lixeira recuperável por 30 dias; exclusão definitiva remove apenas dados gerenciados, nunca originais externos do usuário. Consolidação é explícita/assistida com preferência: referenciar originais, sempre consolidar novos projetos ou perguntar quando material. Mudança de preferência não reescreve projeto existente.

## I9–I11 — Geração e áudio

Imagem, vídeo e música generativa são capabilities opcionais/provider-neutral. Preferir caminho autorizado sem custo incremental, depois opção local adequada, depois BYOK; provider gerenciado é futuro. Nenhum pedido/sugestão autoriza cobrança desconhecida, troca de provider ou gasto silencioso.

Todo asset gerado vira `SourceAsset` local estável com `origin=generated-ai`, provider/model/revision/generation ID, prompt/parâmetros disponíveis, data, checksum, uso/custo e Content Credentials/C2PA/SynthID quando presentes. A UI mantém a origem e oferece disclosure adequado sem watermark obrigatório quando não exigido.

Vídeo usado como B-roll fica mudo por padrão. SFX V1 usa pacote pequeno first-party/commissioned preferencialmente, ou assets individualmente auditados; nunca copiar banco inteiro. Música do usuário é suportada; modelo musical pesado fica em pack opcional após benchmark. Mix, ducking, fade, ganho e normalização são determinísticos. Voice clone, imitação, voice conversion e Digital Twin não são aprovados aqui.

## I12–I13 — Motores especializados e Composition Engine

Tracking, matting, segmentação e restauração são capabilities separadas, não um “motor de visão” monolítico nem nova operação automática do Media Runtime. Face tracking deve ser leve/local. PP-Matting/PP-MattingV2 é candidato preferencial; RVM é referência EDVID. Segmentação avançada e restauração ficam opcionais/diferidas. Packs pesados são opcionais.

HyperFrames permanece primeiro candidato do Composition Engine e Remotion/EDVID referência/fallback possível. Seleção depende do ADR 0012 e benchmark integral. Código first-party registrado/auditado é permitido atrás da fronteira; código arbitrário de agente/preset, execução ao vivo de registry e engine-native state canônico são proibidos.

## I14 — Transferência, staging e Agent Playbook

Desktop não depende de servidor CEVRA próprio para comunicação editorial. Preferir contexto compacto, staging local e transporte oficial direto ao provider. Storage/gateway CEVRA temporário só quando necessidade comprovada. Arquivo retornado passa por download temporário → validação → hash → proveniência → ingest canônico.

O **Agent Playbook** interno orienta agentes usados pelo aplicativo; é versionado, mas não substitui o Agent Protocol. Ele não é o produto Creator/Skill pós-V1.

## I15 / I15A — Mobile P2P e 3D

Mobile começa como companion do Desktop: parear, enviar mídia/preset/instrução, acompanhar/cancelar e receber resultado. O Desktop mantém Project IR e engines. P2P autenticado e criptografado é prioritário; signaling mínimo pode existir. Fallback futuro por storage temporário criptografado/TTL e TURN/relay só após necessidade. Sem cloud render ou storage permanente implícito.

3D pertence ao Composition Engine existente, em tiers authored → camera-tracked → occlusion-aware. Não cria engine/timeline paralela. Solver e matting seguem benchmarks descritos nas decisões de composição.

## I16 — Handoff para editores externos

Handoff V1 é explícito, metadata-first e gera relatório de mapeamento NATIVE/BAKED/APPROXIMATED/UNSUPPORTED. Resolve: OTIO `.otio` prioritário, `.otioz`/consolidado opcionais. Premiere: XML primeiro candidato, AAF secundário, EDL fallback. Efeito não traduzível usa bake seletivo quando possível, nunca descarte silencioso. Bridges, import changes e live sync ficam pós-V1.

## I17–I18 — Conta, entitlement, distribuição e updates

Separar CEVRA Account, Entitlement Service e Billing Provider. Direção: conta passwordless, entitlement assinado, ativação configurável, operação offline limitada e Recovery Mode que preserva projeto/fontes, mas não gera/salva/exporta nova saída audiovisual utilizável. Development Entitlement só em dev e rejeitado em stable. Billing candidate, preço e regras comerciais são revalidados antes do lançamento; projeto/mídia não vai ao backend por existir conta.

V1 oficial: macOS Apple Silicon/arm64 e Windows x64. Distribuição direta por DMG assinado/notarizado e NSIS per-user assinado. Instalador stable é core-complete: capability básica anunciada não depende de artefato obrigatório ausente/download oculto. Packs pesados opcionais podem ser separados.

Updater assinado usa canais stable/beta/dev, staging atômico, hash/signature, healthcheck, previous-known-good e rollback compatível. Nunca adotar upstream latest cegamente. Telemetria comportamental é NoOp na V1; crash reporting é opt-in, allow-listed/sanitizado e não inclui projeto, mídia, prompt ou transcript. Session replay é proibido. Falha de artifact host/crash backend não bloqueia app instalado.

## I19 — Export, publishing e Skills

Export local é sempre independente. Publishing e performance analytics ficam pós-V1, atrás de adapters, com confirmação e sem alterar timeline. Dados de Content Intelligence/analytics ficam fora do Project IR.

**Bridge Skill** apoia CEVRA Vids com agente externo, usa Agent Protocol tipado e depende do app para execução. Não é segundo editor.

**Creator Skill** é superfície agent-native standalone. Lite e Full compartilham um único núcleo editorial/criativo/QA; Full possui workspace visual e entrega vídeo final sem Desktop. Reutilizar Project IR, runtimes, composição e UI quando prático; subset necessário é versionado/conversível, não semântica divergente. Handoff Creator→Vids é opcional.

## Creation Modes V1

Faceless Explainer e Slideshow são direção V1; Music-to-video é condicional a análise proporcional de ritmo/beat/onset/energy. Todos são workflows sobre as mesmas fundações, não novos produtos/timelines/runtimes. Faceless pode usar roteiro e TTS provider-neutral; TTS genérico não autoriza voice clone. Brand Kit V1 cobre logo, fontes, cores e componentes/presets; Figma é importador opcional. Product Launch Video e WebGPU/TypeGPU ficam pós-V1.

## Gate de implementação

Para cada provider/dependência, revalidar na data de implementação e release: mecanismo oficial, entitlement, autenticação, transporte, terms/privacy/retention, licença/proveniência, comercialização, custo, quota, plataforma, segurança, empacotamento e capability real. Ausência ou mudança nunca autoriza scraping, credencial consumer, API paga silenciosa ou promessa não comprovada.
