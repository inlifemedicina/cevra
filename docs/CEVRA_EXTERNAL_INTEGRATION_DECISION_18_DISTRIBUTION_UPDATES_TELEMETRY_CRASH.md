# CEVRA — Decisão de Integração 18: distribuição, updater, telemetry e crash reporting

**Data:** 2026-09-18.
**Status:** APROVADA PELO PRODUCT OWNER; PROVIDERS E CUSTOS DEVEM SER REVALIDADOS PRÓXIMO AO LANÇAMENTO.
**Implementação:** NÃO AUTORIZADA por este registro.
**Princípio:** distribuir um desktop confiável, completo e atualizável sem criar infraestrutura desnecessária nem coletar conteúdo do usuário.

---

## 1. Objetivos

A V1 comercial precisa resolver:
- instalador confiável e simples;
- code signing/notarização;
- app funcional após instalação;
- updates assinados e rollbackáveis;
- canais stable/beta/dev;
- hospedagem barata e escalável de artefatos;
- separação entre core e packs opcionais;
- crash diagnostics com privacidade;
- suporte técnico sem enviar projeto/mídia;
- ausência de behavioral telemetry obrigatória.

Esta decisão complementa UPDATE_STRATEGY.md; não cria um segundo updater.

## 2. Distribuição V1

### macOS
Distribuição direta por website:
~~~text
cevra.com/download
→ DMG
→ app bundle assinado
→ notarização Apple
~~~
- Developer ID/certificado adequado;
- notarização e stapling conforme pipeline aplicável;
- artefato por arquitetura/target oficialmente suportado;
- App Store fica pós-V1.

### Windows
Distribuição direta por website:
~~~text
cevra.com/download
→ NSIS setup.exe
→ instalação per-user
~~~
Default per-user para evitar privilégios administrativos desnecessários.
Assinar instalador/executáveis com mecanismo/certificado Windows adequado antes do lançamento.
MSI/per-machine fica disponível para Enterprise/futuro.

### Stores
Mac App Store e Microsoft Store não são requisito V1. Podem ser avaliadas depois para aquisição/distribuição.

## 3. Installer Core Closure — requisito obrigatório

O instalador comercial deve ser core-complete.
Uma instalação stable não pode dizer que o CEVRA está pronto se faltar qualquer componente necessário às capacidades V1 prometidas.

### Core Runtime Closure
A release manifest deve declarar tudo que é obrigatório, conforme o baseline final, incluindo quando aplicável:
- app/Tauri shell;
- Project IR/application code;
- Media Runtime;
- FFmpeg/ffprobe build aprovado;
- managed CPython e environments necessários;
- Composition Engine/runtime selecionado para V1;
- transcription/alignment runtime;
- modelo(s) mínimo(s) de produção necessários ao baseline local prometido;
- fontes/typography/assets obrigatórios;
- caption/style resources;
- codecs/native libs redistribuídas;
- notices/licenças;
- updater bootstrap/public key;
- configurações e schemas necessários;
- healthcheck metadata.

Regra:
~~~text
missing mandatory component
→ installer/release FAIL
~~~

Não permitir:
- instalou, mas precisa descobrir manualmente Python;
- instalou, mas FFmpeg não veio;
- instalou, mas a função básica depende de baixar algo não informado;
- download silencioso de componente obrigatório após primeiro uso.

Se um componente essencial ficar grande demais, qualquer mudança para mandatory first-run download precisa de:
1. benchmark real de tamanho/custo;
2. instalação assinada e verificável;
3. aprovação explícita do Product Owner;
4. app não se declarar ready antes de concluir/verificar o bootstrap.

Default atual: bundle do core obrigatório dentro da distribuição comercial.

### Packs opcionais
Podem ficar separados:
- Vision AI Pack;
- Advanced Restoration;
- heavy local AI;
- advanced TTS voices/models;
- advanced matting/3D models;
- outros modelos pesados que não sejam necessários ao baseline V1 prometido.

Falta de pack opcional desabilita somente aquela capability e é informada claramente.

## 4. Release Closure Check

CI/release engineering deve produzir release-manifest e executar smoke test em instalação limpa.
O release não promove para stable se falhar:
- existência/hash de mandatory artifacts;
- load/health dos engines obrigatórios;
- runtime Python privado;
- probe/import;
- capacidades locais mínimas anunciadas;
- preview/render/export smoke conforme scope final;
- updater verification;
- license/NOTICE presence;
- ausência de Dev Entitlement/bypass;
- ausência de secrets.

## 5. Hospedagem de artefatos

Cloudflare R2 é o primeiro candidato para produção por object storage simples, compatibilidade S3, custo baixo e ausência de egress direto cobrado na política atual.
Revalidar preço/termos antes do lançamento.

Estrutura conceitual:
~~~text
downloads.cevra.com/
├── stable/
│   ├── latest.json
│   ├── macos-*/
│   └── windows-*/
├── beta/
└── dev/
~~~

GitHub Releases/artifacts podem continuar no desenvolvimento/CI.
O app instalado não depende de R2 para funcionar localmente.

## 6. Updater V1

Usar Tauri 2 official updater.
V1 usa manifestos estáticos por canal:
- stable/latest.json;
- beta/latest.json;
- dev/latest.json.

Não construir API dinâmica de update sem necessidade real.
Update artifacts são assinados, verificados, staged antes de promoção e rejeitados se assinatura/integridade não corresponder.

## 7. Chaves de assinatura

Separar OS code signing de Tauri updater signing.
OS: Apple signing/notarization e Windows code signing.
Updater: private signing key no secret store/CI; public verification key no app.

Obrigatório:
- backup offline seguro da chave privada;
- acesso mínimo;
- rotação com plano de compatibilidade;
- nunca commitar private key;
- dev/staging keys separadas das production keys quando aplicável.

Perda da updater key é risco operacional crítico e deve constar do release runbook.

## 8. Canais

stable = comercial/default verificado.
beta = opt-in/early validation.
dev = desenvolvimento/teste e nunca alimenta instalação stable.
Manifests, signing/environment e entitlement não podem cruzar canais silenciosamente.

## 9. Comportamento do update

Check é leve, não bloqueia abertura e não depende de telemetry.
Download pode ocorrer em background se apropriado, respeitando rede/espaço e sem interferir em operação crítica.
Instalação/restart só em ponto seguro; nunca durante render/save/processamento.

## 10. Forced updates

Forced update não é política normal.
Stable antigo não será desativado apenas para acelerar adoção.
Bloqueio obrigatório só pode existir em situação excepcional/documentada, como vulnerabilidade crítica explorável, risco comprovado de corrupção ou protocolo remoto unsafe/impossível de manter.

Mesmo nesse caso:
- preservar projetos;
- preservar Recovery Mode;
- preferir bloquear capability afetada em vez do editor inteiro;
- nenhuma remote kill switch genérica na V1.

## 11. Rollback

Runtime/model/component: rollback automático quando tecnicamente seguro.
App: preservar previous-known-good artifact e metadados de compatibilidade; rollback assistido/manual pode ser aceitável inicialmente, especialmente quando schema migration impedir downgrade seguro.

## 12. Artifact retention

Manter current stable, previous-known-good, versões necessárias a rollback/support, symbols/source maps, manifests/signatures e provenance/notices.
Não reter artefatos gigantes indefinidamente sem justificativa.

## 13. App download público

O installer principal pode ser público. Entitlement controla uso comercial, não o arquivo.
Packs premium/privados podem usar entitlement + signed URLs futuramente.

## 14. Product analytics / telemetry V1

Não coletar behavioral analytics obrigatório na V1.
Criar TelemetryAdapter com NoOpTelemetry como implementação default V1.

Não coletar automaticamente:
- projetos;
- prompts;
- transcript;
- captions;
- mídia;
- thumbnails/frames;
- nomes de arquivo;
- caminhos;
- assunto/conteúdo do vídeo;
- user-generated text;
- session replay;
- tela.

Qualquer analytics pós-V1 exige nova decisão com schema allow-listed, finalidade, minimização, consentimento/retention quando aplicável.

## 15. Crash reporting

Crash reporting é separado de analytics.
Criar CrashReporterAdapter com NoOpCrashReporter e providers substituíveis.
Sentry é primeiro candidato, não dependência de domínio.

V1 pode integrar crash/error diagnostics se:
- consentimento opt-in;
- SDK/versão/licença auditados;
- payload allow-listed;
- redaction testada;
- nenhum project/media content;
- sem session replay.

WebView/React e Rust/Tauri podem usar SDKs adequados por camada; não depender obrigatoriamente de plugin community.

## 16. Consentimento

Default V1:
- crash reporting OFF;
- behavioral telemetry OFF;
- session replay inexistente.

Settings fornece opção clara de envio de relatórios técnicos.
Em erro recuperável pode oferecer Enviar relatório deste problema? com descrição do conteúdo técnico.

## 17. Crash payload allowlist

Permitido quando necessário:
- CEVRA version/build;
- OS/version;
- architecture;
- release channel;
- engine/runtime versions;
- GPU model/class;
- RAM bucket;
- operation category;
- error code;
- sanitized stack trace;
- timestamp;
- anonymized install/session diagnostic ID quando necessário.

Não permitido:
- project title;
- transcript;
- prompt;
- caption text;
- raw provider payload;
- account email;
- auth token;
- API key;
- full filesystem path;
- media frame;
- thumbnail;
- video/audio;
- user document/content.

Paths/environment strings devem ser redacted antes do envio.

## 18. Native minidumps

Minidumps são úteis, mas não requisito de lançamento.
Somente incorporar após auditoria da biblioteca exata, sanitização, cross-platform e custo/manutenção.
Sem isso, V1 começa com Rust panic/error capture, JS/WebView exception capture e local diagnostics.

## 19. Session Replay

PROIBIDO na V1.
Nenhum SDK deve habilitar screen/session replay.
Ativação futura exige nova aprovação explícita e revisão de privacidade.

## 20. Logs locais

Logs locais por padrão, com rotação, limite de tamanho, retenção curta e redaction.
Não logar transcript/prompt completo, media bytes, tokens/secrets, provider payload bruto ou full project snapshot sem necessidade.

## 21. Diagnostics Bundle

Help → Report a Problem → Create Diagnostics Bundle.
Bundle é produzido localmente e pode conter versão/build/channel, OS/hardware summary, healthchecks, engine/runtime versions, logs sanitizados, crash/error IDs, adapter capabilities/status, updater status e disk/runtime diagnostics.

Não contém por default mídia, transcript, prompt, project content ou account secrets.
Usuário pode inspecionar lista/conteúdo antes de envio. Envio é explícito.

## 22. Debug symbols/source maps

Release pipeline preserva/upload symbols/source maps correspondentes à build para simbolicação.
Eles não são user content e não devem expor secrets.

## 23. Provider outage

Se R2/update host/crash backend estiver indisponível:
- app local continua;
- projeto abre;
- edição local continua conforme entitlement;
- crash report pode ficar local/não enviado;
- update check falha de forma discreta;
- nenhum retry agressivo.

Infra de distribuição não pode virar single point of failure do editor instalado.

## 24. Custos

V1 evita servidor dinâmico de update, analytics vendor, session replay e cloud logs contínuos.
Custos ficam principalmente em code signing/developer programs, object storage/requests, crash reporting se habilitado e distribuição de packs.
R2/Sentry são candidatos e devem ser reavaliados por custo/termos antes do go-live.

## 25. Relação com D17

Development pode usar GitHub artifacts/dev channel e não precisa R2/Sentry/Paddle.
Staging testa signing/update channels e pode usar staging bucket/crash project.
Live usa production signing, production artifact host, stable channel e crash reporter somente conforme consentimento.
Dev secrets/keys nunca entram em stable e vice-versa.

## 26. Classificação

| Item | Estado |
|---|---|
| direct download V1 | GREEN |
| macOS signed/notarized DMG | GREEN |
| Windows signed NSIS per-user | GREEN |
| app stores | pós-V1 |
| Core Runtime Closure | OBRIGATÓRIO |
| Cloudflare R2 | primeiro candidato |
| Tauri official updater | GREEN |
| static update manifests | GREEN V1 |
| stable/beta/dev | GREEN |
| required core hidden download | RED sem nova aprovação |
| optional model packs | GREEN |
| behavioral analytics V1 | NÃO |
| TelemetryAdapter NoOp | GREEN |
| opt-in crash diagnostics | GREEN |
| Sentry | primeiro candidato / audit required |
| session replay | RED |
| content/media in crash report | RED |
| local Diagnostics Bundle | GREEN |
| forced update normal | RED |
| generic remote kill switch | RED |

## 27. Decisão final

CEVRA V1 será distribuído diretamente por instaladores assinados, com macOS DMG notarizado e Windows NSIS per-user assinado nos targets oficialmente suportados.

A instalação stable será core-complete: nenhuma capability V1 obrigatória poderá depender de componente ausente ou download oculto. Packs separados existirão apenas para capacidades opcionais/avançadas, salvo futura exceção explicitamente aprovada após benchmark de tamanho/custo.

O Tauri official updater usará manifests estáticos assinados por canais stable/beta/dev; R2 é o primeiro host candidato.

Behavioral telemetry fica desligado na V1. Crash diagnostics é opt-in, sanitizado e provider-neutral; Sentry é primeiro candidato. Session replay e envio de conteúdo de projeto/mídia são proibidos.

O app instalado continua funcionando localmente se serviços de distribuição/crash estiverem fora do ar.