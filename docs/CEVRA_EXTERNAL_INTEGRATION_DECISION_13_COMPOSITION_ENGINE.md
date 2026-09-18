# CEVRA — Decisão de Integração 13: Composition Engine, compiler e dependências

**Data original:** 2026-09-17.  
**Refinamento aprovado:** 2026-09-18.  
**Status:** APROVADA PELO PRODUCT OWNER; FRONTEIRA DE COMPONENTES REFINADA.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** HyperFrames é o candidato prioritário ao Composition Engine; Remotion/EDVID permanece referência funcional. A superfície não confiável é tipada/validada, enquanto componentes internos CEVRA podem usar implementações auditadas mais ricas atrás do compiler.

---

## 1. Referência e contexto

ADR 0012 permanece aceito e **não precisa ser reaberto** por este refinamento. Ele já exige:
- `CompositionEngineAdapter`;
- HyperFrames como candidato preferencial, não obrigatório;
- Remotion/EDVID como referência;
- benchmark antes da seleção;
- Project IR engine-neutral.

Esta decisão refina o caminho entre Project IR e engine.

---

## 2. HyperFrames como candidato prioritário

HyperFrames continua sendo o primeiro motor a provar, pelas razões já registradas:
- licença/compatibilidade comercial da revisão consultada sujeita a auditoria exata;
- execução local;
- render determinístico/seekable;
- HTML/CSS/mídia;
- GSAP e runtimes de animação;
- suporte a Three.js/WebGL e outras capacidades relevantes;
- possibilidade de reduzir dependência/custo operacional de alternativas.

A descoberta de novas skills/capacidades do HyperFrames aumenta o potencial do candidato, mas **não substitui o benchmark**.

---

## 3. Remotion como referência EDVID

Remotion continua:
- referência visual/funcional do EDVID;
- comparação para captions, layouts, B-roll, motion, timing e efeitos;
- fallback apenas diante de falha material comprovada do candidato principal.

Qualquer incorporação comercial depende da versão/termos/licença/custo vigentes no momento da decisão.

---

## 4. Ferramentas de desenvolvimento aprovadas

### HyperFrames Registry

Pode ser pesquisado pelo time/Codex para evitar recriar efeitos existentes. Resultado upstream só entra no produto depois de:
- auditoria;
- licença/proveniência;
- análise de dependências;
- adaptação;
- congelamento/versionamento;
- testes CEVRA.

Não há execução dinâmica de código arbitrário do registry no produto.

### Remotion → HyperFrames

A skill oficial `remotion-to-hyperframes` pode ser usada como **ferramenta de desenvolvimento** para acelerar a tradução de composições EDVID/Remotion.

Fluxo esperado:

```text
referência Remotion/EDVID
→ tradução assistida
→ render comparativo
→ diff/SSIM quando aplicável
→ correção
→ incorporação CEVRA auditada
```

A saída não vira automaticamente estado canônico nem código de produção sem revisão.

---

## 5. Fronteira correta de segurança

A regra anterior “componentes/ops tipados” é refinada.

### Superfície não confiável

Agentes, presets, pacotes e solicitações externas só podem emitir:
- intents/comandos tipados;
- referência a capability/componente permitido;
- parâmetros validados.

Não podem emitir HTML/JS/TSX/Python/shader/filtergraph executável diretamente.

### Interior confiável do CEVRA

Um componente first-party registrado e auditado pode implementar sua função com os mecanismos suportados do Composition Engine, incluindo código interno necessário, desde que:
- esteja versionado;
- tenha schema/manifesto;
- seja reprodutível;
- seja testado;
- não tenha privilégios não declarados;
- não se torne nova fonte de verdade.

Não criar um novo tipo rígido de domínio para cada efeito se uma representação genérica segura for suficiente.

---

## 6. Caminho aprovado

```text
Project IR / ProjectHistory
→ operação/intenção CEVRA validada
→ VisualComponentInstance / referência genérica equivalente
→ component registry CEVRA
→ Composition Compiler
→ implementação interna first-party
→ CompositionEngineAdapter
→ HyperFrames / engine selecionado
```

O nome/tipo exato `VisualComponentInstance` é conceitual neste registro; a implementação deve primeiro tentar reutilizar as representações existentes e introduzir apenas a menor extensão comprovadamente necessária.

---

## 7. Escopo do benchmark

Benchmark com recursos aprovados, incluindo:
- seis estilos de legenda EDVID;
- headlines;
- split/split2;
- imagens/B-roll/full-screen;
- camera dynamic;
- hard zoom;
- slow push-in;
- face tracking;
- componentes de motion graphics registrados;
- behind-the-subject/alpha;
- SFX/música;
- timing;
- 9:16/16:9;
- preview vs export;
- cancelamento/recovery;
- performance.

A descoberta posterior de 3D/Three.js deve ser coberta pelo benchmark específico da capability 3D quando a decisão correspondente for consolidada; não é razão para inflar o benchmark base indiscriminadamente.

---

## 8. Processo do benchmark

### Codex/automação
- fixtures;
- renders equivalentes;
- métricas CPU/GPU/RAM/tempo;
- cancelamento/recovery;
- integridade/timing;
- diff/SSIM quando útil;
- versão/licença/dependências;
- teste de registry/compiler;
- material lado a lado.

### Product Owner
Somente julgamento humano necessário:
- aparência;
- legibilidade;
- fluidez;
- timing percebido;
- naturalidade;
- equivalência/superioridade visual.

---

## 9. Critério de seleção

HyperFrames será selecionado se demonstrar paridade/superioridade suficiente nos recursos aprovados com:
- timing confiável;
- preview/export coerentes;
- estabilidade/performance aceitáveis;
- lifecycle/cancelamento;
- empacotamento comercial viável;
- compiler/registry internos sem regressão de segurança.

Falha material volta ao Product Owner antes de trocar engine ou ampliar drasticamente a integração.

---

## 10. Independência do Project IR

Nenhum schema HyperFrames/Remotion é canônico.

Persistir:
- intenção audiovisual;
- referência estável do componente/capability;
- parâmetros editáveis;
- versões necessárias para reproduzir/migrar.

Não persistir como autoridade:
- HTML/JS/TSX gerado;
- timeline nativa do engine;
- provider-specific graph.

Representações de engine são derivadas/reconstruíveis.

---

## 11. Atualizações de componentes e engine

O engine e os componentes first-party devem ser versionados/pinned de acordo com `UPDATE_STRATEGY.md`.

Uma atualização de HyperFrames ou de componente:
- não altera silenciosamente projetos existentes;
- passa por compatibilidade/benchmark;
- usa migração explícita quando necessário;
- preserva rollback da infraestrutura quando seguro;
- mantém projeto canônico engine-neutral.

---

## 12. Relação com decisões anteriores

Esta decisão habilita composição, mas não substitui:
- ingest;
- Media Runtime;
- matting;
- asset lifecycle;
- Director;
- Agent Protocol;
- segurança de packages;
- update lifecycle.

Workflow Presets continuam tipados/declarativos porque são uma superfície de orquestração, não implementação interna do componente.

---

## 13. Momento

Após o gate coordenado do Media Runtime e antes da expansão visual pesada dependente do engine:

1. fixtures;
2. HyperFrames isolado;
3. casos EDVID;
4. uso experimental de remotion-to-hyperframes onde economizar trabalho;
5. medir;
6. homologar;
7. selecionar;
8. integrar `CompositionEngineAdapter`;
9. construir registry/compiler CEVRA mínimo;
10. expandir capabilities.

---

## 14. Classificação

| Item | Estado |
|---|---|
| HyperFrames | candidato prioritário |
| Remotion | referência/fallback possível |
| HyperFrames Registry | ferramenta de desenvolvimento; incorporação auditada |
| remotion-to-hyperframes | ferramenta de desenvolvimento aprovada |
| Project IR engine-neutral | obrigatório |
| código arbitrário vindo de agente/preset | RED |
| código interno first-party registrado/auditado | GREEN |
| schema de params na fronteira | GREEN |
| um tipo rígido novo por componente | NÃO obrigatório |
| live download/exec de registry upstream | RED |
| seleção final do engine | pendente de benchmark |

---

## 15. Decisão final refinada

HyperFrames continua primeiro candidato e Remotion/EDVID continua referência.

A segurança do CEVRA será obtida por **fronteira externa tipada e validada**, não por engessar cada implementação interna. Componentes first-party podem usar recursos ricos do engine atrás de registro, manifesto/schema, compiler, versionamento e testes.

Nenhum agente, preset ou pacote não confiável pode enviar código executável arbitrário ao engine. O Project IR permanece independente do engine e não precisa ganhar um tipo específico para cada novo efeito.
