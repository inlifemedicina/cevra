# CEVRA Update Strategy v3

**Direção aprovada pelo Product Owner:** 2026-09-18.
**Reconciliação canônica:** 2026-09-21.
**Status:** DIREÇÃO APROVADA / IMPLEMENTAÇÃO INCREMENTAL CONFORME ROADMAP.

Este documento é a autoridade dedicada para atualização, compatibilidade e rollback de aplicativo, runtimes, engines, modelos, componentes, skills e metadata de providers. As decisões de distribuição, conta, telemetria e crash reporting continuam resumidas em `CEVRA_INTEGRATION_DECISIONS.md`; este documento não afirma que updater, packs, marketplace ou providers estejam implementados.

## 1. Princípio e autoridade central

O usuário atualiza **CEVRA**, não uma coleção manual de Python, npm, FFmpeg, engines, modelos e CLIs.

```text
DETECT
→ REVIEW
→ PIN
→ TEST
→ SIGN
→ STAGE
→ HEALTHCHECK
→ PROMOTE
→ ROLLBACK IF NEEDED
```

Nunca:

```text
upstream latest
→ produção automaticamente
```

Um **CEVRA Update Controller** coordena instalação e atualização dos artefatos gerenciados. Não existe um updater independente e incompatível por engine. Dependências externas permanecem atrás de contratos/adapters e só são promovidas após revisão e evidência de compatibilidade.

## 2. Classes de componente e responsabilidades

### A. Aplicativo CEVRA

Tauri shell, UI, application services, Project IR, adapters e componentes built-in. A entrega é uma atualização assinada do aplicativo.

### B. Managed Runtime

CPython privado, pacotes, bibliotecas nativas e ferramentas gerenciadas. O runtime permanece pinned e compatível com a release. Nunca executar `pip install --upgrade` no Python do usuário.

### C. Engines e bibliotecas incorporadas

FFmpeg/ffprobe, Composition Engine selecionado, runtimes JS e bibliotecas incorporadas de tracking, matting ou restauração. Cada versão é pinned, auditada e testada.

### D. Local Model Packs

Modelos de transcription/alignment, Local/Vision AI, matting, futuro TTS e restauração. Podem ser opcionais e grandes; exigem identidade, hash, proveniência, licença, requisitos de hardware e compatibilidade.

### E. Packs first-party declarativos

Agent/Creative Playbooks, presets, style packs, Brand Kits e metadata/configuração não executável. Podem evoluir separadamente somente quando houver pacote assinado, compatível e rollbackável.

### F. Componentes first-party executáveis

Componentes de composição e adapters executáveis. Na V1, viajam com a release assinada do aplicativo. Atualização independente exige package infrastructure assinada, capability-limited e rollbackável já comprovada.

### G. Software externo do usuário

Codex, Claude Code, Premiere, Resolve, Figma e produtos equivalentes não são atualizados pelo CEVRA. O adapter pode consultar versão, health, capabilities e compatibilidade e deve degradar honestamente.

### H. APIs e modelos remotos

Não há binário local a atualizar. Mudanças podem exigir adapter, catálogo/metadata compatível, regras de depreciação e fallback autorizado. Schema nativo do provider e código remoto nunca viram autoridade de domínio.

## 3. Simplificação obrigatória para V1

- app, adapters e componentes first-party executáveis são atualizados pela release assinada do aplicativo;
- managed runtime permanece pinned e release-compatible;
- FFmpeg e o Composition Engine selecionado permanecem pinned;
- model packs grandes podem ser gerenciados separadamente somente quando tamanho/custo justificarem;
- playbooks e presets podem inicialmente viajar bundled;
- software externo é detectado e validado, nunca atualizado pelo CEVRA.

Não construir marketplace ou updater modular completo antes de necessidade e infraestrutura comprovadas.

Prioridade:

1. updater assinado do aplicativo;
2. managed runtime pinned;
3. compatibility/health reporting;
4. model packs opcionais conforme necessidade;
5. atualização independente de componentes/packs somente depois de infraestrutura segura justificada.

## 4. Manifesto de componente gerenciado

Todo componente atualizável registra, quando aplicável:

- `id`;
- `version` semântica;
- classe/tipo;
- plataforma e arquitetura;
- compatibilidade mínima/máxima com CEVRA;
- dependências;
- capabilities;
- permissions;
- hashes dos artefatos;
- metadata de assinatura;
- proveniência/source revision;
- licença e notices;
- tamanho;
- requisitos de hardware;
- requisitos de migração;
- compatibilidade de rollback;
- contrato de healthcheck;
- release channel.

Model packs também registram família/revisão do modelo, quantization, hashes dos weights e hashes de tokenizer/config quando pertinentes.

## 5. Detecção e adoção upstream

Desenvolvimento/CI pode detectar:

- dependency updates;
- releases/tags;
- security advisories;
- provider deprecations;
- model lifecycle changes;
- mudanças upstream em skills/componentes first-party.

Detecção não equivale a adoção. A mudança abre issue/PR, passa por changelog/diff/licença, testes de compatibilidade, benchmarks de regressão, review/aprovação e somente então release CEVRA. Major versions e mudanças de licença/termos exigem revisão manual.

Se uma nova versão reduzir qualidade, mudar licença, remover capability, elevar materialmente custo ou quebrar plataforma suportada, CEVRA pode permanecer na versão pinned anterior enquanto ela for segura/suportável e avaliar alternativas. Latest não é automaticamente melhor.

## 6. Compatibility Matrix e capability negotiation

Cada release mantém uma matriz gerada/versionada, útil para release engineering, diagnostics e suporte, relacionando quando aplicável:

- Media Runtime/FFmpeg;
- Composition Engine e componentes;
- transcription/alignment;
- modelos locais e packs opcionais;
- adapters de agentes/providers;
- níveis de protocolo/schema.

Usuário normal não precisa administrar essa matriz.

Adapters reportam, quando aplicável, versão, health, capabilities, optional features e protocol/schema level. Se software externo perder uma capability, desabilitar/degradar apenas a função afetada, explicar claramente e preservar edição/export local independente. Nunca recorrer a caminhos privados ou reverse-engineered para recuperar uma função.

## 7. Transação de update gerenciado

Para artefato gerenciado:

1. baixar/stage fora da instalação ativa;
2. validar assinatura;
3. validar hash e manifest;
4. validar plataforma e compatibilidade;
5. preservar previous-known-good quando aplicável;
6. instalar/promover atomicamente;
7. executar healthcheck;
8. confirmar promoção;
9. efetuar rollback automático/assistido na falha;
10. registrar diagnóstico sem vazar conteúdo do usuário.

Um download parcial nunca substitui a instalação ativa. Update/restart normal não ocorre durante save, render ou outra operação crítica.

## 8. Model Pack lifecycle

Modelos grandes não são baixados silenciosamente. A UX informa, quando material, tamanho, função, hardware necessário, origem/licença, espaço disponível e escolha de momento.

Uma nova revisão:

- baixa em paralelo à ativa;
- verifica hashes;
- executa smoke test;
- só então vira active revision;
- mantém a revisão anterior quando armazenamento/risco justificarem;
- remove versões antigas somente por política explícita e após promoção segura.

Não reinterpretar silenciosamente projeto antigo com outro modelo quando a reprodutibilidade do resultado derivado exigir a revisão anterior. Registrar a revisão usada nas operações relevantes.

## 9. Componentes e projetos antigos

Componentes first-party de composição usam `componentId + version/schema`. Atualização não pode mudar silenciosamente a aparência de projeto antigo.

Estratégias permitidas:

1. implementação nova backward-compatible;
2. compatibility layer;
3. migração explícita e testada;
4. retenção da implementação/versão anterior quando necessária.

Project IR guarda intenção, referência e parâmetros de domínio necessários à reconstrução; código/timeline/state engine-native continua derivado e não canônico.

## 10. Skills e Playbooks

Skills/playbooks CEVRA-owned mantêm owner manifest, version, hashes, compatibility, provenance e rollback.

Quando instalados em ambientes externos Codex/Claude:

- modificar somente arquivos CEVRA-owned;
- preservar configuração e secrets do usuário;
- rejeitar symlink destrutivo ou overwrite de checkout inseguro;
- seguir UX de atualização autorizada.

Playbook atualizado não ganha privilégio por si só. Privilégios continuam definidos pelo Agent Protocol tipado e suas capabilities.

## 11. Providers, modelos remotos e advisories

Separar:

- **catalog/config-only:** pode futuramente usar metadata first-party assinada, nunca código executável;
- **protocol/SDK change:** requer adapter update e testes;
- **outage/retirement:** health/capability indisponível, usuário informado e fallback somente quando autorizado, sem fallback pago silencioso.

Um futuro compatibility advisory assinado pode alertar ou desabilitar uma capability externa comprovadamente quebrada. Ele não executa código remoto, não desabilita edição local básica sem necessidade e não torna funcionalidade instalada dependente de telemetry.

## 12. Project migrations

Ao abrir schema antigo:

1. detectar versão;
2. criar backup antes de migração destrutiva/one-way;
3. executar migração determinística e testada;
4. validar e registrar versão;
5. preservar o original se falhar.

Rollback de app/runtime considera compatibilidade do schema. Não prometer downgrade impossível após migração irreversível; para project schema, rollback é o backup anterior, não reverse migration improvisada.

## 13. Release channels

- `stable`: default comercial verificado;
- `beta`: validação antecipada opt-in;
- `dev`: desenvolvimento/teste.

Manifests, signing environment, entitlements, component packs e model packs não atravessam canais silenciosamente. Stable não aceita material dev sem compatibilidade explícita.

## 14. Validação por classe

### Aplicativo

Install/update/relaunch, project open/save, migrations, undo/redo, preview/export e crash recovery.

### Media Runtime

Adapter contract, cancellation, health, fixtures representativas, performance e regressão.

### Composition Engine/componentes

Determinismo/seek safety, preview/export, visual regression, fixtures EDVID/CEVRA, 9:16/16:9 e projetos/versões anteriores.

### Modelos

Load, hardware fallback, qualidade representativa, memória/latência, licença e proveniência.

### Agentes/providers

Auth, protocolo, capability discovery, structured output, evidence requests, cancellation/timeouts e ausência de fallback pago silencioso.

Upgrade que possa alterar resultado visível/editorial pode exigir homologação visual/editorial do Product Owner.

## 15. Rollback por classe

- app/runtime → previous-known-good quando compatível;
- component/pack → versão anterior;
- model → active revision anterior;
- provider metadata → metadata assinada anterior;
- project schema → backup pré-migração.

## 16. Supply chain

Obrigatório para artefatos gerenciados, conforme aplicável:

- TLS;
- assinatura do publisher CEVRA;
- hashes;
- proveniência/source revision;
- versão exata;
- licença/NOTICE;
- ausência de secrets;
- ausência de post-install scripts fora da superfície controlada;
- permissions/capabilities explícitas.

Presença no GitHub não implica confiança.

## 17. Banda e armazenamento

- delta update quando justificado;
- downloads resumable/cache-aware quando apropriado;
- não baixar novamente modelo intacto e idêntico;
- mostrar tamanho para packs grandes;
- não baixar modelo opcional automaticamente;
- limpar versão antiga somente após promoção segura e conforme space policy;
- não depender de cloud GPU para atualizar componente local.

## 18. UX

Usuário normal vê conceitos simples:

- “Atualização do CEVRA disponível”;
- “Atualização de IA/modelo local disponível — tamanho”;
- “Provider incompatível/indisponível”.

Não expor manutenção de Python, npm ou FFmpeg. About/Diagnostics pode mostrar versões detalhadas para suporte.

## 19. Core Runtime Closure

Release stable é core-complete. Todo artefato obrigatório às capacidades anunciadas deve constar do release manifest, estar presente e ser verificado. Ausência de runtime, engine, asset, fonte, licença, schema, configuração ou modelo mínimo obrigatório faz o release gate falhar.

Packs genuinamente opcionais/pesados podem ficar separados e sua ausência desabilita somente a capability correspondente. Transformar componente obrigatório em first-run download exige benchmark de tamanho/custo, bootstrap assinado/verificável e aprovação explícita do Product Owner; o app não se declara pronto antes da conclusão.

## 20. Distribuição e updater V1

- download direto pelo site CEVRA;
- macOS por DMG assinado/notarizado;
- Windows por instalador NSIS per-user assinado;
- App Stores ficam pós-V1;
- Tauri 2 official updater é a direção V1;
- manifests/artifacts por canal são assinados e verificados;
- chaves de code signing e updater signing são separadas quando aplicável;
- private signing key fica em secret storage/CI, com acesso mínimo, rotação compatível e backup offline seguro;
- public verification key fica no app;
- perda/rotação de chave faz parte do release runbook.

Artifact host permanece substituível e deve ser revalidado próximo ao lançamento; GitHub artifacts/releases podem servir dev/CI. O instalador principal pode ser público. Falha de update host não bloqueia o aplicativo instalado.

Forced update não é política normal. Bloqueio obrigatório exige risco crítico documentado e deve preferir bloquear somente a capability afetada. Não há generic remote kill switch na V1.

## 21. Telemetry, crash e diagnostics

Update checking é independente de analytics telemetry:

- `TelemetryAdapter` usa NoOp na V1 por default;
- behavioral telemetry não é obrigatória;
- crash reporting é separado, opt-in, provider-neutral e allow-listed;
- paths, conteúdo, prompts, transcripts, mídia e secrets são redacted/excluídos;
- session/screen replay é proibido na V1;
- diagnostics bundle é criado localmente, pode ser inspecionado e só é enviado explicitamente;
- updater continua funcional sem analytics ou crash backend.

Detalhes de domínio permanecem em `CEVRA_INTEGRATION_DECISIONS.md`. Provider, SDK, versão, licença, custo e política são revalidados na implementação/release.

## 22. Resiliência

Falha de artifact host, update backend, crash backend ou provider externo degrada somente a função correspondente. Aplicativo já instalado continua abrindo projetos e executando edição/export local quando os componentes locais necessários e o entitlement aplicável estiverem válidos. Retry não é agressivo e não cria dependência de telemetry.

## 23. Limites desta decisão

Esta estratégia não implementa updater, package runtime, marketplace, provider, model manager ou migração. Não altera Project IR, ProjectHistory, Media Runtime, Transcript Cache V1 nem o roadmap atual. Mudança material de mecanismo ou fronteira arquitetural continua sujeita a ADR e aprovação conforme `AGENTS.md`.
