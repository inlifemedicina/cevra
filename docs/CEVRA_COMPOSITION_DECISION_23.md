# CEVRA — Decisão 23: motion graphics, componentes internos registrados e behind-the-subject

**Data original:** 2026-09-17.  
**Refinamento aprovado:** 2026-09-18.  
**Status:** DIREÇÃO DE PRODUTO APROVADA; FRONTEIRA DE COMPONENTES REFINADA; MOTOR DE MATTING/SEGMENTAÇÃO E REPRESENTAÇÃO GENÉRICA FINAL A VALIDAR; IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.

## 1. Refinamento desta decisão

A formulação original dizia que motion graphics seriam executados por “componentes e operações tipadas”. Isso continua correto na fronteira de agentes, presets e qualquer entrada não confiável, mas poderia ser interpretado de forma excessivamente rígida como exigência de criar um novo tipo/command no Project IR para cada efeito interno.

Essa interpretação é substituída pela seguinte regra:

> **Tipagem rígida na fronteira; liberdade controlada dentro do CEVRA.**

Agentes externos, presets, pacotes e superfícies do usuário nunca enviam código executável arbitrário. Eles selecionam capacidades/componentes permitidos e fornecem parâmetros que passam por schema/validação. Depois dessa fronteira, um componente interno first-party, auditado e registrado pode usar a implementação necessária — GSAP, Three.js, Lottie, HTML/CSS, shaders ou outros mecanismos aprovados do Composition Engine — sem transformar cada implementação em novo tipo de domínio.

Isso é um refinamento de segurança/ergonomia interna. Não altera Project IR como fonte de verdade, ProjectHistory, CompositionEngineAdapter, Agent Protocol, undo/redo ou a proibição de execução arbitrária por agentes.

## 2. Caminho canônico

```text
Agente / preset / UI / pacote
        ↓
intent/operação tipada e validada
        ↓
referência a componente registrado + parâmetros validados
        ↓
Composition Compiler
        ↓
implementação interna confiável do componente
        ↓
CompositionEngineAdapter
        ↓
HyperFrames / engine selecionado
```

Proibido:

```text
Agente
→ HTML/JS/TSX/Python/shader arbitrário
→ execução direta
```

Permitido internamente:

```text
componente first-party registrado e auditado
→ implementação própria aprovada
→ GSAP / Three.js / Lottie / WebGL / outros mecanismos suportados
```

A diferença é **quem controla o código e onde ele entra no sistema**.

## 3. Registro interno de componentes

Em vez de criar um novo tipo rígido por efeito, o CEVRA deverá manter um registro interno versionado de componentes. O desenho exato será validado na fatia de composição, mas o manifesto conceitual deve poder declarar, quando aplicável:

- `componentId` estável;
- versão;
- schema dos parâmetros;
- defaults/limites;
- capabilities requeridas;
- engine/runtime compatível;
- aspect ratios/constraints relevantes;
- assets/dependências;
- provenance/licença;
- compatibilidade mínima/máxima CEVRA;
- comportamento determinístico/seek-safe quando necessário;
- política de preview/export;
- fixtures/testes associados.

Uma instância do projeto referencia um componente estável e os parâmetros resolvidos. Ela **não persiste código engine-specific como autoridade canônica**.

Antes de criar novo objeto no Project IR, verificar se `GraphicItem`, layouts, intervalos e referências existentes representam corretamente a necessidade. Só ampliar o schema quando houver lacuna comprovada; não fazer migração especulativa.

## 4. Catálogo inicial e expansão

Começar com poucos componentes de alto valor, por exemplo:

- card/callout;
- seta/destaque;
- contador/stat;
- gráfico simples;
- timeline;
- kinetic/typewriter;
- formas/overlays;
- lower third;
- componentes de motion aprovados posteriormente.

Novos componentes podem ser adicionados sem exigir automaticamente nova versão do schema do Project IR, desde que caibam na representação genérica aprovada e no manifesto.

Pedido não coberto por componente disponível:
- pode usar alternativa segura;
- pode ser registrado como lacuna;
- pode justificar novo componente first-party;
- não autoriza o agente a inventar/executar código arbitrário em runtime.

## 5. HyperFrames Registry

O HyperFrames Registry pode ser usado **como fonte de pesquisa/desenvolvimento**, conforme decisão posterior aprovada.

Fluxo:

```text
Registry upstream
→ pesquisa pelo time/Codex
→ auditoria de código, licença, dependências e comportamento
→ adaptação/congelamento
→ componente CEVRA registrado/versionado
```

Não adotar:

```text
pedido do usuário
→ baixar componente/código upstream ao vivo
→ executar diretamente no projeto
```

A incorporação deve ser reprodutível, auditada e compatível com a distribuição comercial.

## 6. Motion graphics

- Director/agente pode escolher um componente registrado e parametrizá-lo dentro do schema permitido.
- A implementação interna do componente não precisa ser artificialmente reduzida ao mesmo vocabulário do agente.
- Toda mutação audiovisual durável continua passando por comandos/aplicação, Project IR/ProjectHistory e journal.
- Componentes internos não criam segunda timeline nem fonte de verdade.
- Preview e export devem usar a mesma intenção/params e produzir resultado coerente.
- Versionamento deve impedir que uma atualização de componente altere silenciosamente projetos antigos.

## 7. Behind-the-subject e matting

A referência EDVID `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703` utiliza `person_matte.py`, que carrega Robust Video Matting por PyTorch, produz alpha temporalmente estável e compõe o elemento entre fundo e pessoa. A inteligência editorial decide quando usar; o recorte frame a frame é executado localmente.

RVM permanece referência de qualidade, não seleção automática para distribuição. Sua licença/requisitos e os pesos devem ser auditados separadamente. O benchmark aprovado posteriormente para motores locais deverá priorizar uma alternativa permissiva adequada e usar RVM apenas como referência quando necessário.

Critérios mínimos:
- cabelo/bordas finas;
- mãos;
- movimento rápido;
- fundo complexo;
- flicker temporal;
- resolução;
- CPU/GPU/RAM;
- tempo;
- peso/empacotamento;
- licença/proveniência/redistribuição.

Behind-the-subject não deve bloquear a edição básica se o motor adequado ainda não estiver selecionado.

## 8. Relação com Embedded Captions

A descoberta posterior do workflow `embedded-captions` do HyperFrames justifica uma **revisão técnica limitada** do nosso pipeline de legendas/oclusão, não a substituição automática desta decisão nem dos estilos EDVID.

Podem ser avaliados, em decisão própria:
- safe zones;
- matte/oclusão;
- QA de overflow;
- QA de legibilidade/oclusão;
- preview rápido;
- promoção seletiva de palavra/hero atrás da pessoa.

A escolha final será registrada na revisão de legendas antes da implementação dependente.

## 9. Viabilidade e momento

O Project IR já possui `GraphicItem` para texto, imagem, vídeo, shape e Lottie, além de layouts/intervalos. Isso é uma base, não prova de motion graphics ponta a ponta.

Ainda são necessários:
- registro/manifesto de componentes;
- validação de parâmetros;
- representação genérica mínima se a base existente não bastar;
- Composition Compiler;
- integração com engine;
- UI/preview/export;
- testes.

Gráficos comuns pertencem à fatia de composição. Matting/segmentação é dependência própria e não entra silenciosamente no gate atual do Media Runtime.

## 10. Validação futura

Validar:

1. componente novo compatível pode ser adicionado sem migração de Project IR por componente;
2. parâmetros inválidos são rejeitados;
3. agente não consegue fornecer código executável;
4. implementação interna sofisticada continua permitida quando first-party/auditada;
5. projeto antigo permanece visualmente estável ou passa por migração explícita quando componente evolui;
6. preview/export equivalentes;
7. persistência/undo/redo;
8. registry upstream nunca é executado diretamente sem incorporação auditada;
9. behind-subject satisfaz benchmark visual/licença antes de distribuição.

## 11. Impacto sobre decisões anteriores

Este refinamento **não reabre**:
- Project IR;
- ProjectHistory;
- Agent Protocol;
- Workflow Presets;
- CompositionEngineAdapter;
- proibição de shell/FFmpeg/filtergraph/código arbitrário vindos de agente;
- engine-neutralidade.

Ele substitui apenas a leitura rígida de “um tipo/operação específica para cada componente interno”.

## 12. Continuidade

A próxima implementação de composição deve tratar componentes first-party como módulos registrados/versionados atrás de uma fronteira validada. A representação final deve ser a menor que preserve editabilidade, compatibilidade e segurança.

Nenhum código, download, modelo, gasto, integração ou seleção final de engine/matting é autorizado por este registro.
