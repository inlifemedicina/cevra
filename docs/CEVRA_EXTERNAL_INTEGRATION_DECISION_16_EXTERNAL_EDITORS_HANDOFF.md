# CEVRA — Decisão de Integração 16: handoff para Premiere, DaVinci Resolve e editores externos

**Data:** 2026-09-18.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Critério de aprovação:** adotar o caminho que melhor equilibre compatibilidade, tamanho de pacote, custo operacional, complexidade e preservação visual.  
**Princípio:** interoperabilidade profissional sem transformar CEVRA em dependência de Premiere/Resolve e sem criar sincronização bidirecional complexa na V1.

---

## 1. Objetivo

Permitir que um projeto CEVRA continue em editores profissionais quando o usuário desejar:

```text
CEVRA
→ handoff
→ DaVinci Resolve / Adobe Premiere / futuro editor
```

O handoff deve preservar o máximo possível de:

- cortes;
- ordem;
- tracks;
- timing;
- referências de mídia;
- áudio;
- markers/metadata quando suportados;
- captions quando houver representação compatível;
- overlays/graphics por equivalência nativa ou bake seletivo.

O CEVRA continua totalmente funcional sem editor externo.

---

## 2. Regra de custo/tamanho

O padrão deve ser o menor pacote confiável.

### Default — Linked / metadata-first handoff

```text
timeline metadata
+ referências de mídia
+ handoff report
```

Sem copiar mídia desnecessariamente.

Benefícios:
- arquivo pequeno;
- criação rápida;
- quase nenhum custo adicional de armazenamento;
- adequado quando editor externo roda no mesmo computador ou consegue relinkar a mídia.

### Portable / Consolidated handoff — opcional

Usar quando:
- projeto vai para outro computador;
- caminhos não estarão acessíveis;
- usuário quer pacote autocontido.

Reutilizar a política de consolidação da Decisão 8. Não criar um segundo sistema de mídia apenas para interchange.

### Full bundle

Formatos que incorporam toda a mídia, como `.otioz` do Resolve, **não serão default**. Podem ficar muito grandes porque podem carregar os arquivos completos.

Só usar quando o usuário pedir portabilidade/autocontenção ou quando benchmark mostrar vantagem concreta para um cenário específico.

---

## 3. ExternalEditorHandoffCompiler

Criar uma fronteira application-level:

```text
Project IR / ProjectHistory
        ↓
ExternalEditorHandoffCompiler
        ↓
  ├─ ResolveHandoffAdapter
  ├─ PremiereHandoffAdapter
  └─ future adapters
```

Não persistir timeline nativa de editor externo como fonte canônica.

O Handoff Compiler traduz uma revisão do projeto para um pacote de saída.

---

## 4. DaVinci Resolve — caminho V1

### Default

```text
Project IR
→ OTIO metadata-only (.otio)
→ Resolve
```

Motivos:
- Resolve suporta import/export OpenTimelineIO;
- OTIO é application-neutral;
- `.otio` contém timeline metadata e referências externas, portanto é pequeno;
- reduz necessidade de inventar formato proprietário CEVRA;
- encaixa com a reserva arquitetural já existente de OpenTimelineIO.

### Portable

```text
.otio + consolidated media
```

Preferível ao `.otioz` quando quisermos controlar melhor organização e tamanho do pacote.

### `.otioz`

Disponível como opção somente quando fizer sentido. Não é default porque Resolve documenta que o bundle pode incluir os arquivos completos de mídia e ficar muito grande.

### Fallback

Se um recurso necessário não for representável adequadamente em OTIO:
- bake seletivo do elemento;
- XML/AAF apenas se benchmark justificar para o caso;
- reportar a degradação.

---

## 5. Adobe Premiere — caminho V1

Premiere não será tratado como OTIO-native enquanto não houver suporte oficial adequado.

### Primeiro candidato

```text
Project IR
→ PremiereHandoffAdapter
→ Final Cut Pro XML compatível
→ Premiere
```

Razões:
- formato textual/metadata pequeno;
- Premiere reconhece/importa XML compatível;
- adequado para cuts, tracks, clip/timing e parte da estrutura;
- não duplica mídia por padrão.

### Segundo candidato

AAF entra como opção de benchmark para:
- áudio;
- workflows profissionais específicos;
- casos em que preserve melhor tracks/metadata relevantes.

Não assumir AAF como universal: o próprio ecossistema Adobe documenta limites de interoperabilidade e suporte variável.

### EDL

Pode existir como fallback mínimo para cuts simples, não como caminho principal.

### Critério final

Antes de implementar o Premiere adapter definitivo, Codex/automação deverá comparar XML vs AAF no subconjunto real CEVRA:
- cuts;
- source time;
- tracks;
- audio tracks;
- captions/markers;
- nested/compound constructs quando aplicável;
- relink;
- orientation/frame rate;
- unsupported effects.

Selecionar o menor formato que preserve melhor nosso caso comum. Pode haver mais de um profile, mas não expor complexidade desnecessária ao usuário.

---

## 6. Classificação de cada elemento

O Handoff Compiler classifica cada feature:

### NATIVE

Existe representação equivalente segura no destino.

Exemplos prováveis:
- cuts;
- clip timing;
- media refs;
- tracks;
- algumas fades/transitions simples;
- markers quando suportados.

### BAKED

Não existe equivalente confiável, mas aparência pode ser preservada por render de somente aquele elemento/faixa.

Exemplos:
- HeroEmphasis;
- motion graphic complexo;
- 3D tracked;
- shader/effect CEVRA;
- composição behind-subject específica.

Preferir alpha/overlay ou sub-render necessário, **não renderizar a timeline inteira** apenas por um efeito não-portável.

### APPROXIMATED

Existe equivalente próximo, mas não idêntico. Só usar quando diferença for aceitável e relatada.

### UNSUPPORTED

Não há representação segura e bake não é viável/adequado.

Nunca descartar silenciosamente.

---

## 7. Handoff Report obrigatório

Todo handoff gera relatório legível e machine-readable, por exemplo:

```text
NATIVE
✓ cuts
✓ clip timing
✓ media references
✓ markers

BAKED
⚠ HeroEmphasis → alpha overlay
⚠ tracked 3D → overlay

APPROXIMATED
⚠ transition X → dissolve Y

UNSUPPORTED
✗ feature Z
```

Registrar:
- project revision;
- target editor/profile;
- adapter version;
- export time;
- media strategy: linked/consolidated/bundle;
- translated features;
- baked features;
- unsupported/approximated;
- expected relink requirements.

Isso reduz surpresa ao abrir em outro editor.

---

## 8. Captions

Hierarquia preferida:

1. representação nativa/interchange quando preserva corretamente;
2. SRT/sidecar quando a apresentação visual não precisa viajar;
3. overlay baked quando aparência exata é necessária.

Os seis estilos EDVID não precisam ser recriados dentro de Premiere/Resolve para o handoff básico.

Se um caption style CEVRA não tiver equivalente visual:
- texto/timing pode continuar editável via sidecar/native captions;
- usuário pode escolher preservar aparência via overlay.

Evitar duplicar simultaneamente duas legendas visíveis por default.

---

## 9. Áudio

Preservar:
- source timing;
- tracks;
- fades/levels quando o formato representar com confiança.

Tratamento de áudio CEVRA complexo pode:
- ser traduzido quando existe equivalente seguro;
- ser entregue como stem/render derivado quando necessário;
- ser relatado.

Não bakear áudio inteiro sem necessidade se tracks editáveis puderem ser preservadas.

---

## 10. Consolidation e mídia

Reusar D8.

Perfis conceituais:

### Linked
- metadata/timeline;
- mídia fica onde está;
- menor tamanho.

### Consolidated
- package com a mídia necessária conforme política aprovada;
- maior portabilidade;
- maior tamanho.

### Full bundle
- quando o formato de destino empacota a mídia;
- maior conveniência;
- potencialmente muito grande.

A UI pode mostrar estimativa de tamanho antes de criar pacote portátil quando possível.

---

## 11. Bridges pós-V1

### Premiere Bridge

Usar a superfície oficial UXP quando um bridge profundo justificar o esforço.

Capacidades futuras possíveis:
- criar sequência;
- importar mídia;
- criar/atualizar tracks;
- markers;
- ações CEVRA no Premiere;
- handoff mais direto.

Não implementar como requisito da V1.

### Resolve Bridge

Pode usar APIs oficiais de scripting/workflow integration quando houver caso real.

Não depender do bridge para o handoff básico.

---

## 12. Import Changes — futuro

Não fazer live bidirectional sync na V1.

Futuro fluxo aceitável:

```text
timeline externa
→ parse
→ compare com revisão CEVRA
→ SupportedExternalChangeSet
→ review/validation
→ ProjectHistory
```

Nunca:

```text
Premiere/Resolve
→ sobrescreve Project IR diretamente
```

Mudanças não suportadas permanecem externas ou exigem import como mídia/render.

---

## 13. Por que não live sync na V1

Live sync adicionaria:
- duas timelines potencialmente divergentes;
- conflitos de autoria;
- watchers/processos contínuos;
- versionamento bidirecional;
- comportamento específico por editor;
- suporte elevado;
- testes combinatórios.

Benefício V1 não justifica o custo/risco.

Handoff explícito resolve o caso comercial importante com muito menos complexidade.

---

## 14. Segurança

External editor adapter:
- não recebe acesso genérico ao Project IR;
- não executa scripts arbitrários vindos do projeto;
- não expõe shell;
- usa arquivos/formatos permitidos;
- bridges futuros recebem permissões mínimas.

Arquivos externos reimportados são validados antes de alterar projeto.

---

## 15. Compatibilidade e updates

Adapters seguem `UPDATE_STRATEGY.md`.

Se Premiere/Resolve mudar formato/API:
- health/compatibility tests;
- adapter update;
- fixtures de regressão;
- versão anterior do projeto continua válida;
- não alterar Project IR para acompanhar schema nativo do editor.

---

## 16. Validação

### Resolve
Testar:
- cuts;
- multi-track;
- audio;
- media relink;
- markers;
- transitions representáveis;
- 9:16 e 16:9;
- frame rates;
- linked vs consolidated;
- `.otio` vs `.otioz` size/behavior onde útil.

### Premiere
Benchmark XML vs AAF:
- fidelidade;
- relink;
- tracks;
- audio;
- markers/captions;
- timecode;
- unsupported effects;
- file size;
- import warnings.

### Efeitos baked
- alpha;
- timing;
- color;
- resolution;
- visual parity.

---

## 17. Classificação

| Item | Estado |
|---|---|
| Resolve OTIO metadata-first | GREEN / prioridade V1 |
| Resolve OTIOZ | GREEN opcional, não default por tamanho |
| Resolve consolidated package | GREEN, reutiliza D8 |
| Premiere XML | GREEN/YELLOW — primeiro candidato |
| Premiere AAF | YELLOW — benchmark secundário |
| EDL | fallback mínimo |
| selective baked overlays | GREEN |
| Handoff Report | obrigatório |
| Premiere UXP Bridge | pós-V1 |
| Resolve scripting bridge | pós-V1 |
| Import Changes controlado | pós-V1 |
| live bidirectional sync | RED para V1 |

---

## 18. Decisão final

CEVRA V1 adotará **handoff explícito e metadata-first** como estratégia de compatibilidade com editores externos.

Para Resolve, OTIO `.otio` será o caminho prioritário; mídia consolidada ou `.otioz` será opcional quando portabilidade justificar o tamanho.

Para Premiere, Final Cut Pro XML será o primeiro candidato de handoff leve, com AAF avaliado como opção secundária no benchmark do subconjunto CEVRA.

Recursos não traduzíveis serão preservados preferencialmente por **bake seletivo**, nunca por descarte silencioso e sem obrigar render completo da timeline.

Bridges oficiais e importação de alterações ficam pós-V1. Live sync bidirecional não entra na V1.
