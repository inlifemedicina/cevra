# CEVRA Update Strategy v2

**Refinamento aprovado pelo Product Owner:** 2026-09-18.  
**Status:** direção arquitetural aprovada; implementação incremental conforme roadmap.  
**Objetivo:** manter CEVRA, engines, runtimes, modelos, skills, components e providers atualizáveis sem transformar o computador do usuário em um ambiente de desenvolvimento, sem upgrades cegos e sem quebrar projetos antigos.

---

## 1. Princípio central

O usuário atualiza **CEVRA**, não uma coleção manual de Python, npm, FFmpeg, HyperFrames, modelos e CLIs.

A política é:

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
→ produção do usuário automaticamente
```

Dependências externas podem evoluir rapidamente; o CEVRA absorve essa mudança atrás de contratos/adapters e só promove uma versão depois de compatibilidade suficiente.

---

## 2. Uma arquitetura de update, várias classes de componente

Não criar um updater independente para cada engine.

O **CEVRA Update Controller** é a autoridade de instalação/atualização dos artefatos gerenciados pelo produto e coordena compatibilidade dos externos.

Classes:

### A. Aplicativo CEVRA
- Tauri shell;
- UI;
- application services;
- Project IR;
- adapters;
- built-in components.

Entrega: atualização assinada do aplicativo.

### B. Managed Runtime
- CPython privado;
- pacotes Python;
- bibliotecas nativas associadas;
- ferramentas gerenciadas pelo runtime.

Entrega inicial recomendada: bundle versionado junto/compatível com a release CEVRA.  
Nunca usar `pip install --upgrade` no Python do usuário.

### C. Engines e bibliotecas incorporadas
Exemplos:
- FFmpeg/ffprobe;
- HyperFrames se selecionado;
- runtimes JS necessários;
- tracking/matting/restoration libraries incorporadas.

Cada versão é pinned e auditada.

### D. Model Packs locais
Exemplos:
- transcription models;
- Local AI Pack;
- Vision AI Pack;
- matting;
- futuro TTS local;
- restoration.

Podem ser opcionais e grandes. Devem ter manifest, hash, proveniência, licença, requisitos de hardware e compatibilidade.

### E. Packs first-party declarativos
Exemplos:
- Agent Playbooks;
- Creative Playbooks;
- presets;
- style packs;
- Brand Kits/presets first-party;
- model/provider capability metadata;
- regras/configurações não executáveis.

Podem evoluir mais rápido que o app quando houver mecanismo seguro de pacote assinado.

### F. Componentes first-party executáveis
Exemplos:
- componentes de composição internos com GSAP/Three.js/Lottie;
- adapters executáveis.

Na V1, preferir distribuí-los **com o app/release**. Atualização independente de código executável só deve existir depois que o package system assinado, capability-limited e rollbackável estiver realmente implementado.

### G. Software externo do usuário
Exemplos:
- Codex;
- Claude Code;
- Premiere;
- Resolve;
- Figma/connector.

CEVRA **não atualiza esses produtos**. O adapter faz:
- version query quando disponível;
- healthcheck;
- capability discovery;
- compatibility check;
- graceful degradation.

### H. APIs e modelos remotos
Exemplos:
- OpenAI;
- Anthropic;
- HeyGen;
- search/generative providers.

Não há binário local para atualizar. O CEVRA atualiza:
- adapter quando protocolo muda;
- compatibility metadata/model catalog quando permitido;
- capabilities;
- deprecation rules;
- fallback policy.

---

## 3. Simplificação obrigatória para V1

Não construir um marketplace/updater modular completo antes de precisar.

### V1
- app + adapters + first-party executable components: atualizados pelo app assinado;
- managed runtime: bundle pinned compatível com a release;
- FFmpeg/Composition Engine selecionado: pinned;
- model packs grandes: opcionais e gerenciados separadamente apenas se tamanho justificar;
- playbooks/presets: podem ser bundled inicialmente;
- software de terceiros: apenas detectado/validado, nunca atualizado pelo CEVRA.

### Depois
Quando o package runtime existir:
- packs first-party podem atualizar independentemente;
- componentes executáveis podem usar package update somente se assinatura, sandbox/capability boundary, compatibilidade e rollback estiverem provados.

Evitar complexidade precoce.

---

## 4. Manifesto mínimo de componente gerenciado

Todo componente atualizável deve possuir, conforme aplicável:

- `id`;
- `version` semântica;
- tipo/classe;
- platform/arch;
- CEVRA min/max compatibility;
- dependencies;
- capabilities;
- permissions;
- artifact hashes;
- signature metadata;
- provenance/source revision;
- license/notices;
- size;
- hardware requirements;
- migration requirement;
- rollback compatibility;
- healthcheck contract;
- release channel.

Model packs também registram:
- model family/revision;
- quantization;
- weight hashes;
- tokenizer/config hashes quando pertinente.

---

## 5. Detecção de atualização upstream

No desenvolvimento/CI, automatizar descoberta quando possível:
- dependency update PRs;
- releases/tags;
- security advisories;
- provider deprecations;
- model lifecycle changes;
- skill/component upstream changes.

Detecção **não equivale a adoção**.

Fluxo:

```text
nova versão upstream
→ issue/PR de atualização
→ changelog/diff/licença
→ compatibility tests
→ benchmark regressions
→ aprovação/review
→ release CEVRA
```

Major versions e mudanças de licença/termos exigem revisão manual.

---

## 6. Compatibility Matrix

Manter uma matriz gerada/versionada por release, por exemplo:

```text
CEVRA 1.4.x
├─ MediaEngineAdapter: ffmpeg build X
├─ CompositionEngineAdapter: HyperFrames Y
├─ Transcription: faster-whisper Z
├─ Agent OpenAI Adapter: protocol range A-B
├─ Claude Adapter: capability range C-D
└─ Local AI Pack: revisions permitidas [...]
```

Não exigir que o usuário veja essa matriz no uso normal; ela serve a release engineering, diagnostics e support.

---

## 7. Capability negotiation

Versão isolada não basta.

Cada adapter deve reportar, quando aplicável:
- versão;
- health;
- capabilities;
- optional features;
- protocol/schema level.

Se um software externo atualizar e remover uma capability:
- desabilitar apenas a função afetada;
- informar de forma clara;
- preservar edição/export independente;
- nunca tentar caminhos privados/reverse-engineered para “recuperar” a função.

---

## 8. App/runtime update flow

Para artefato gerenciado:

1. baixar/stage fora da instalação ativa;
2. validar assinatura;
3. validar hash/manifest;
4. validar plataforma/compatibilidade;
5. preservar previous-known-good quando tecnicamente aplicável;
6. instalar atomicamente;
7. executar healthcheck mínimo;
8. promover;
9. se falhar, rollback automático/assistido;
10. registrar diagnóstico sem conteúdo do usuário.

Não substituir a instalação ativa por arquivo parcialmente baixado.

---

## 9. Model Pack update flow

Modelos grandes não devem ser baixados silenciosamente.

UI mostra:
- tamanho;
- função;
- hardware necessário;
- origem/licença relevante;
- espaço disponível;
- opção atualizar/agora/depois.

Atualização:
- baixa nova revisão paralelamente;
- verifica hashes;
- executa smoke test;
- só então troca active revision;
- mantém/rebaixa previous revision quando custo de armazenamento for razoável ou até confirmação de saúde;
- limpa versões antigas com política explícita.

Não reinterpretar projetos antigos com modelo novo silenciosamente quando o resultado derivado precise permanecer reproduzível; registrar revision usada nas operações relevantes.

---

## 10. Componentes de composição e projetos antigos

Componentes first-party têm `componentId + version/schema`.

Regra:
- novo projeto pode usar versão atual;
- projeto antigo não muda aparência silenciosamente porque um componente foi atualizado.

Estratégias permitidas:
1. compatibilidade da nova implementação com versão antiga;
2. manter implementation compatibility layer;
3. migração explícita/testada;
4. preservar versão anterior enquanto suportada.

Engine-native state continua derivado; o Project IR guarda intenção/referências/params necessários para reconstrução.

---

## 11. Skills e Playbooks

CEVRA-owned skills/playbooks usam:
- owner manifest;
- version;
- hashes;
- compatibility;
- provenance;
- rollback.

Se instalados em Codex/Claude externos:
- modificar somente arquivos CEVRA-owned;
- não apagar configuração do usuário;
- não sobrescrever checkout/symlink perigoso;
- atualização requer caminho suportado e autorização de acordo com UX definida.

Embedded agent pode consumir versão interna sem instalação global.

Playbook atualizado não pode ganhar privilégios extras; privilégios vêm do Agent Protocol/capabilities.

---

## 12. Provider/model remote lifecycle

Providers externos mudam fora do ciclo do aplicativo.

CEVRA deve separar:

### Mudança só de catálogo/configuração
Ex.: modelo ativo/deprecated, alias recomendado, capability flag.

Pode futuramente ser entregue por **metadata first-party assinada** se não contiver código executável.

### Mudança de protocolo/SDK
Exige adapter update e testes; normalmente release do app na V1.

### Provider outage/retirement
- healthcheck falha;
- capability fica unavailable;
- informar usuário;
- usar fallback apenas se previamente autorizado/seguro;
- nunca iniciar API paga silenciosamente.

---

## 13. Compatibility advisory remoto

Futuro serviço pode distribuir **advisories assinados** para proteger integrações externas, por exemplo:
- “provider X endpoint Y está incompatível”;
- “modelo Z foi retirado”.

Advisory pode desabilitar/alertar uma capability externa quebrada, mas **não deve desativar o editor local básico nem executar código remoto**.

O app precisa continuar funcional offline para funções locais já instaladas.

---

## 14. Project schema migrations

Projetos são separados dos updates de engine.

Ao abrir schema antigo:
- detectar versão;
- criar backup antes de migração destrutiva/one-way;
- executar migração determinística;
- validar;
- registrar versão;
- falha não sobrescreve original.

Downgrade do app não é prometido para projeto já migrado além da compatibilidade da versão anterior. Rollback de runtime/app deve verificar schema compatibility antes de abrir projeto.

---

## 15. Release channels

Reservados:
- `stable`;
- `beta`;
- `dev`.

Stable:
- default comercial;
- versões verificadas.

Beta:
- early validation;
- opt-in.

Dev:
- desenvolvimento/teste.

Não misturar model/component pack de canal dev em instalação stable sem compatibilidade explícita.

---

## 16. Testes mínimos por update

Conforme a classe afetada:

### App
- install/update/relaunch;
- project open/save;
- migrations;
- undo/redo;
- preview/export;
- crash recovery.

### Media Runtime
- adapter contract;
- cancellation;
- health;
- representative media fixtures;
- performance/regression.

### Composition Engine/components
- deterministic/seek-safe;
- preview/export;
- visual regression/diff;
- representative EDVID/CEVRA fixtures;
- 9:16/16:9;
- old component versions/projects.

### Model
- load;
- hardware fallback;
- representative accuracy/quality benchmark;
- memory/latency;
- license/provenance.

### Agent/provider
- auth;
- protocol;
- capability discovery;
- structured output;
- evidence requests;
- cancellation/timeouts;
- no silent paid fallback.

Major upgrade may require Product Owner visual/editorial homologation quando resultado perceptível puder mudar.

---

## 17. Rollback

Rollback é por classe:

- app/runtime: previous-known-good quando compatível;
- component/pack: versão anterior do pack;
- model: active revision anterior;
- provider metadata: previous signed metadata;
- project schema: backup anterior à migração, não “desmigração” improvisada.

Nunca prometer rollback impossível após migração de dados sem backup.

---

## 18. Segurança e supply chain

Obrigatório:
- TLS no download;
- assinatura do publisher CEVRA para artefatos gerenciados;
- hashes;
- source/provenance;
- exact version;
- licença/NOTICE;
- sem secrets no pacote;
- sem pós-instalação arbitrária fora da superfície autorizada;
- package permissions/capabilities explícitas;
- código terceiro não é confiável só porque está no GitHub.

---

## 19. Custo e banda

Atualizações podem gerar custo real:
- runtime;
- modelos multi-GB;
- CDN;
- storage;
- retries.

Políticas:
- delta update quando viável;
- não redownload de modelo intacto;
- cache/resume;
- mostrar tamanho para packs grandes;
- não baixar modelos opcionais automaticamente;
- limpar versão antiga somente após estabilidade/space policy.

Não depender de cloud GPU para atualizar componentes locais.

---

## 20. UX

Usuário normal deve ver principalmente:
- “Atualização do CEVRA disponível”;
- “Atualização de IA local disponível — X GB”;
- eventual incompatibilidade de provider.

Não expor manutenção de Python/npm/FFmpeg ao usuário.

Diagnostics/About podem exibir versões para suporte.

---

## 21. Relação com telemetry

Update checking não depende de telemetry analytics.

A definição futura de telemetry/crash reporting deve ser separada, com privacidade/consentimento apropriados. A ausência de telemetry não impede updates.

---

## 22. Responsabilidade por upstream quebrado

Uma atualização externa não autoriza migrar imediatamente.

Se nova versão:
- piora qualidade;
- muda licença;
- remove capability;
- aumenta custo;
- quebra plataforma;

CEVRA pode continuar na versão pinned anterior enquanto segura/suportável e avaliar alternativa.

---

## 23. Decisão de implementação

Esta estratégia **não cria agora um package marketplace/updater complexo**.

Prioridade:
1. updater assinado do app;
2. managed runtime pinned;
3. compatibility/health por adapter;
4. model packs opcionais quando necessários;
5. só depois update independente de packs/components, quando a infraestrutura de packages justificar.

A futura decisão de distribuição/telemetry/crash deve usar este documento como baseline e não reabrir princípios já aprovados sem evidência nova.
