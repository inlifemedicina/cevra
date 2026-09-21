# CEVRA — decisões de composição e ativos

**Aprovações originais:** 2026-09-16 a 2026-09-18.
**Reconciliação canônica:** 2026-09-21.
**Status:** D19–D23 APROVADAS / IMPLEMENTAÇÃO PENDENTE.

As decisões abaixo preservam Project IR/ProjectHistory como autoridade, mantêm `CompositionEngineAdapter` e dependem do benchmark do ADR 0012. Nada aqui seleciona HyperFrames, Remotion, provider, matting ou formato final de schema.

## D19 — Tela dividida

Preservar as duas variantes EDVID: mídia acima/apresentador abaixo e apresentador acima/mídia abaixo, aplicadas em intervalos editáveis. Escolher split define apresentação, não quantidade; fora dos intervalos permanece a composição principal.

- Inserção não modifica fala ou montagem sem autorização.
- Preferir entrada/saída em cortes existentes, admitindo exceção localizada quando o assunto ou intervalo explícito exigir.
- Inserções consecutivas mantêm continuidade sem flash de tela cheia.
- Troca de mídia preserva intervalo/layout; vídeo ilustrativo fica mudo por padrão e não reinicia a fala.
- Enquadramento, título e legenda acompanham o layout; não esticar mídia nem presumir detecção visual universal.

Ingestão confiável de imagens e Composition Engine executável são dependências ainda pendentes.

## D20 — Escolha de mídia de apoio

Escolher pela pertinência à passagem e ao estilo, não por substantivo detectado ou cadência fixa. Material exato adequado fornecido pelo usuário tem preferência. Não apresentar mídia genérica como demonstração do objeto específico. Inserção opcional ruim pode ser omitida; falta de ativo necessário deve ser informada.

O CEVRA prepara contexto/evidência, o agente capaz propõe, o Director valida e a aplicação executa localmente pelo caminho canônico. Sem IA capaz, escolhas do usuário e presets continuam disponíveis; não simular compreensão nem geração.

## D21 — Busca e incorporação externa

Busca externa ocorre dentro de autorização delimitada. O ativo escolhido é baixado, validado, hasheado, recebe proveniência e vira ativo local estável; projeto não reconsulta nem substitui silenciosamente em cada render. A forma concreta de provider, API, transporte, autenticação, billing e UI será revalidada no marco de implementação.

## D22 — B-roll em tela cheia

Usar tela cheia quando informação visual precisa de área; preferir split quando a presença do apresentador ainda agrega. B-roll substitui a imagem no intervalo, não a fala. Evitar cobertura excessiva/ritmo artificial, respeitar pedido explícito, manter vídeo de apoio mudo por padrão e usar entrada/saída intencional sem alterar a montagem só para encaixar o ativo.

## D23 — Componentes registrados e motion graphics

Princípio: **tipagem rígida na fronteira; liberdade controlada dentro do CEVRA**.

```text
agente / preset / UI / pacote
→ capability/componente permitido + parâmetros validados
→ Composition Compiler
→ componente first-party registrado e auditado
→ CompositionEngineAdapter
```

Agentes e superfícies não confiáveis nunca fornecem HTML, JS/TSX, Python, shader ou código arbitrário. Internamente, componente first-party auditado pode usar GSAP, Three.js, Lottie, HTML/CSS, WebGL/shader ou mecanismo aprovado sem exigir um novo tipo de domínio por efeito.

O registro de componentes deve versionar ID, schema/defaults/limites, capabilities, engine/runtime, constraints, assets/dependências, licença/proveniência, compatibilidade, seek/determinismo, preview/export e fixtures. O projeto guarda referência estável e parâmetros, não código engine-specific como autoridade.

Começar com catálogo pequeno baseado em evidência: card/callout, seta/destaque, contador/stat, gráfico simples, timeline, kinetic/typewriter, shape/overlay e lower third. Registry upstream é fonte de pesquisa: auditar, adaptar, congelar e versionar; nunca baixar/executar ao vivo por pedido.

## Behind-the-subject e 3D

Behind-the-subject depende de matting temporal validado e não bloqueia edição básica. RVM é referência EDVID, não seleção; PP-Matting/PP-MattingV2 permanece candidato comercial a validar.

3D evolui dentro do mesmo Composition Engine: Tier A authored 2.5D/3D, Tier B com camera solve e Tier C com oclusão. `CameraSolve3DAdapter` permanece fronteira; COLMAP/PyCOLMAP é primeiro candidato de benchmark, DPVO candidato avançado e DROID-SLAM referência depriorizada. Nenhum solver é incorporado por este registro.

## Benchmark e validação

O benchmark mantém a matriz CEVRA/EDVID: captions, headlines, split, B-roll/imagens, câmera, tracking, motion, alpha, música/SFX, timing, 9:16/16:9, cancelamento/recovery e performance. Inclui obrigatoriamente:

- compatibilidade com live preview/WebView ou caminho compartilhado suficientemente equivalente;
- acesso a originais/melhores fontes sem geração intermediária com perda desnecessária.

Comparar preview/export, persistência, undo/redo, enquadramento, áudio mudo, continuidade da fala, custo de decode/render e preservação dos originais. Diferença material do EDVID requer `DIVERGÊNCIA EDVID` e evidência.
