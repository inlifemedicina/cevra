# CEVRA — Decisão de Integração 19: export independente, publishing/analytics pós-V1 e arquitetura de Skills

**Data:** 2026-09-18.
**Status:** APROVADA PELO PRODUCT OWNER.
**Implementação:** NÃO AUTORIZADA por este registro.
**Princípio:** export local é obrigatório e independente; publishing/performance analytics ficam pós-V1; CEVRA terá Bridge Skill e Creator Skill como superfícies distintas.

---

## 1. Export é sempre independente

O CEVRA Vids deve sempre conseguir gerar arquivo final local sem depender de publishing, rede social, Content Intelligence, cloud, analytics ou Creator Skill.

Fluxo:
```text
Project IR
→ render/export
→ arquivo final local utilizável
```

Falha, ausência ou não aprovação de API social nunca pode impedir export local.

## 2. Publishing — pós-V1

Publishing direto para Instagram, TikTok, YouTube e futuros providers fica pós-V1.
Na V1, apenas reservar interfaces/boundaries quando isso não gerar implementação material ou acoplamento.

Futuro fluxo:
```text
ExportArtifact
→ PublishProviderAdapter
→ social provider
```

Regras reservadas:
- provider-neutral;
- tokens fora do Project IR e fora das Skills;
- preflight específico por plataforma;
- confirmação humana explícita antes de publicação pública, salvo futura decisão diferente;
- retry de publish nunca cego;
- publishing nunca altera timeline silenciosamente;
- qualquer temporary relay de mídia deve ser efêmero, explícito e apagado após uso/prazo.

Nenhuma aprovação de rede social pode bloquear CEVRA Vids 1.0.

## 3. Performance analytics — pós-V1

Performance analytics de conteúdo publicado também fica pós-V1.

Separação:
```text
Product telemetry = uso/saúde do software
Performance analytics = resultado do conteúdo publicado
```

Performance observations pertencem ao Content Intelligence/futura camada analítica, nunca ao Project IR.
Métricas provider-native não são consideradas equivalentes entre plataformas sem normalização/definição explícita.

## 4. Dois tipos de CEVRA Skill

CEVRA terá duas superfícies diferentes:
```text
CEVRA Skills
├── CEVRA Bridge Skill
└── CEVRA Creator Skill
    ├── Lite profile
    └── Full profile
```

Eles compartilham conhecimento/regras CEVRA, mas possuem papel e execução diferentes.

## 5. CEVRA Bridge Skill

A Bridge Skill existe para dar suporte ao CEVRA Vids quando o aplicativo usa uma IA externa para interpretar pedidos/comandos do usuário.

Fluxo:
```text
usuário no CEVRA Vids
→ CEVRA envia contexto/pedido autorizado
→ Codex / Claude / future agent
→ CEVRA Bridge Skill
→ IA entende capabilities/protocolo/regras
→ EvidenceRequest / ChangeSet / typed CEVRA requests
→ Agent Gateway
→ validação
→ CEVRA Vids executa
→ Project IR / ProjectHistory
```

A Bridge Skill:
- depende do CEVRA Vids/Agent Gateway para executar edição;
- não é editor standalone;
- não possui segunda timeline;
- não substitui Media Runtime/Composition Engine;
- não muta Project IR diretamente;
- não usa shell/filesystem/raw engine access como atalho;
- ensina ao host como operar a superfície tipada do aplicativo;
- conhece capabilities, limites, evidências, status, cancelamento, render/export e diagnostics.

Instalação preferencial: gerenciada pelo próprio CEVRA Vids, com autorização explícita.
Wrappers de host podem existir para Codex, Claude e futuros hosts, mas a lógica canônica da Bridge deve ser única.

## 6. CEVRA Creator Skill

A Creator Skill é um editor/criador agent-native standalone, inspirado na praticidade operacional do EDVID e baseado na arquitetura/capacidades CEVRA.

Fluxo alvo:
```text
usuário dentro do Codex/Claude/future host
→ CEVRA Creator Skill
→ ingest/análise
→ edição
→ interface de revisão/edição
→ ajustes
→ composição
→ QA
→ render
→ arquivo final
```

**CEVRA Desktop não é necessário para produzir o vídeo final.**

## 7. Creator Workspace — interface própria

A Creator Skill não deve ser apenas chat invisível que devolve um MP4.
Ela terá interface visual própria, conceitualmente chamada CEVRA Creator Workspace.

A implementação exata da superfície será decidida tecnicamente depois, podendo ser browser local, host-native surface ou outra abordagem suportada.

Capacidades desejadas:
- preview/player;
- montagem/scenes/cuts;
- transcript;
- captions;
- B-roll/assets;
- headline;
- estilo/presets;
- audio/music/SFX;
- composition;
- render/export;
- review/approval;
- pedidos de alteração em linguagem natural.

## 8. Creator Full

O Full é o profile principal de máxima capacidade agent-native.

Target:
- layered timeline;
- tracks;
- inspector;
- controles de captions/B-roll/audio/composição;
- visual review;
- ajustes manuais práticos;
- máximo possível das capacidades do CEVRA Vids dentro do host.

Requisito central:
```text
source media
→ Creator Full
→ complete edit
→ Creator Workspace
→ QA
→ final render/export
```

Sem CEVRA Desktop, sem Bridge Skill e sem remote execution oculto.
O Desktop pode ser usado opcionalmente depois para refinamento/handoff.

## 9. Creator Lite

Lite é um profile da mesma família, não outro cérebro.

Prioridades:
- instalação/dependency footprint menores;
- workflows principais;
- preview;
- transcript;
- scenes/cuts;
- captions;
- estilos/assets essenciais;
- render/export;
- entrega de vídeo final standalone dentro do subset prometido.

Lite e Full compartilham core, regras e Workspace foundation sempre que possível.

## 10. Um único cérebro editorial

Não criar inteligência editorial divergente para Desktop e Creator.

Base canônica compartilhável:
```text
CEVRA Knowledge / Editorial Core
├── editorial rules
├── Creative Playbooks
├── workflow definitions
├── QA policies
├── capability vocabulary
├── style/composition intentions
└── provider-neutral planning rules
```

Consumidores:
- CEVRA Vids;
- CEVRA Bridge Skill;
- Creator Lite;
- Creator Full.

Executores podem variar; semântica/intenção não deve divergir silenciosamente.

## 11. Reuso máximo do CEVRA no Creator

Objetivo: trazer ao Creator Full o máximo possível do CEVRA Vids dentro do tecnicamente e comercialmente viável.

Candidatos a compartilhamento:
- Project IR/domain packages;
- editorial rules/playbooks;
- workflow definitions;
- caption/style schemas;
- composition registry/components;
- Media Runtime primitives ou equivalentes empacotáveis;
- transcription/alignment adapters;
- QA;
- asset/provider planners;
- UI components/design tokens;
- export profiles;
- fixtures/tests.

Não duplicar código apenas para ser uma Skill quando um package CEVRA reutilizável resolver.

## 12. Project model e interoperabilidade

Target preferido: Creator Workspace reutiliza o mesmo Project IR/domain core quando o ambiente permitir.

Se o host não permitir reuso integral, usar um Creator Project Profile:
- versionado;
- semanticamente compatível;
- subconjunto explícito do Project IR;
- mesmos IDs/conceitos quando aplicável;
- conversão testada;
- sem segunda semântica audiovisual concorrente.

## 13. Handoff opcional Creator → CEVRA Vids

Mesmo sendo standalone, Creator deve ser preparado para:
```text
Creator Skill / Workspace
→ Open in CEVRA Vids
→ continuar edição no Desktop
```

Handoff é opcional; nunca requisito para o Full entregar vídeo final.

Preservar progressivamente, conforme suportado:
- source refs/assets;
- transcript;
- cuts;
- captions;
- B-roll;
- overlays;
- audio decisions;
- composition refs;
- edit metadata;
- provenance.

Quando algo não puder ser reconstruído no Desktop: converter quando equivalente, bake seletivo quando apropriado e informar limites; nunca descartar silenciosamente.

## 14. Shared UI

Quando tecnicamente útil, compartilhar design tokens e componentes como player, caption controls, style controls, asset browser, inspector patterns, review UI, preset selector e timeline components.
Creator Workspace e Desktop não precisam ter a mesma shell, mas devem manter consistência e evitar manutenção duplicada.

## 15. Distribuição das Skills

### Bridge
Preferência:
```text
CEVRA Vids
→ Settings / AI Integrations
→ Install/Update Bridge Skill
```

Usar owner manifest, versão, hash, compatibilidade e rollback.

### Creator
Distribuição independente via site CEVRA e/ou diretório/plugin/marketplace oficial do host quando apropriado.
O Creator não exige CEVRA Vids instalado.

## 16. Licensing das Skills

Bridge pode ser pública/gratuita; execução útil depende do CEVRA Vids e de seu entitlement/capabilities.

Modelo comercial do Creator ainda não está decidido.
Possibilidades futuras incluem gratuita, Lite gratuita + Full paga, incluída no CEVRA, assinatura própria ou freemium.

## 17. Segurança

Bridge:
- apenas Agent Protocol;
- typed/schema-validated operations;
- sem secrets do app;
- sem social/provider tokens;
- sem direct Project IR mutation;
- sem raw engine control.

Creator:
- tools/runtimes CEVRA-owned/auditados;
- sem arbitrary shell/code de untrusted prompt;
- capability allowlist/sandbox;
- provenance/licensing;
- temp/output cleanup;
- Workspace não expõe host machine genericamente.

Ser Skill não reduz requisitos de segurança.

## 18. Relação com mobile/remote

Bridge Skill pode servir ao cenário futuro de CEVRA Companion/remote agent:
```text
phone/client
→ request
→ agent
→ Bridge Skill / Agent Protocol
→ paired CEVRA Desktop
→ render/export
```

Creator Skill é outra superfície e não precisa do desktop pareado.

## 19. Momento de implementação

### Vids V1
Obrigatório:
- export local independente;
- preservar direção Agent Gateway/Bridge.

Não obrigatório para Vids 1.0:
- social publishing;
- social analytics;
- Creator Lite/Full como produto concluído.

Creator pode ser desenvolvido em fase própria ou em paralelo quando não atrasar o core Vids.

### Pós-V1
- publishing providers;
- analytics sync/intelligence;
- scheduling;
- Creator commercialization;
- richer Creator↔Desktop handoff;
- additional host wrappers.

## 20. Test strategy

Bridge:
- mesma intenção em hosts suportados produz requests CEVRA semanticamente equivalentes;
- nunca muta Project IR diretamente;
- capability absence é informada;
- skill version mismatch é detectado.

Creator:
- funciona sem Desktop instalado/rodando;
- Lite entrega vídeo final no subset prometido;
- Full entrega vídeo final standalone;
- Full Workspace permite revisar/editar antes do render;
- regras editoriais compartilhadas não divergem silenciosamente do CEVRA Vids;
- capability ausente degrada honestamente;
- handoff opcional preserva editabilidade suportada;
- UI não vira segunda fonte de verdade;
- cleanup/security/license tests.

## 21. Decisão final

1. Export local do CEVRA Vids é obrigatório, independente e sempre funcional sem publishing.
2. Publishing e performance analytics ficam pós-V1.
3. CEVRA Bridge Skill dá suporte à IA externa usada pelo CEVRA Vids e depende do app para execução.
4. CEVRA Creator Skill é editor/criador agent-native standalone, prático como EDVID e sem dependência do Desktop.
5. Creator possui profiles Lite e Full sobre a mesma base.
6. Creator Full tem interface própria e deve concluir edição, QA, render e entregar vídeo final sem CEVRA Desktop.
7. Creator Workspace busca reuso máximo de Project IR, runtimes, composition, QA e UI do CEVRA; não será um segundo CEVRA divergente.
8. Handoff para CEVRA Vids é opcional e preparado desde a arquitetura, nunca requisito para o Full funcionar.