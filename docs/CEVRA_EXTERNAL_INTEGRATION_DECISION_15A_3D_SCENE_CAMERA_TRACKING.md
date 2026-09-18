# CEVRA — Decisão de Integração 15A: 3D Scene, Camera Tracking e composição espacial

**Data:** 2026-09-18.  
**Status:** DIREÇÃO APROVADA PELO PRODUCT OWNER; SOLVER FINAL DE CÂMERA PENDENTE DE BENCHMARK.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Relação:** complementa D13 Composition Engine, D23 motion graphics/behind-subject e D17 Caption Placement; não altera a numeração principal 14–19.

---

## 1. Objetivo

Adicionar ao CEVRA efeitos espaciais semelhantes aos demonstrados em editores mobile avançados, sem depender de Motion Ninja ou de outro aplicativo proprietário e sem introduzir um segundo Composition Engine.

O objetivo é suportar progressivamente:

- perspectiva/2.5D;
- elementos em profundidade;
- câmera virtual;
- objetos/textos presos ao espaço da filmagem;
- camera tracking;
- oclusão real por pessoa/foreground quando justificada;
- composição 3D determinística e editável.

---

## 2. Princípio arquitetural

O 3D pertence à composição CEVRA:

```text
Project IR / ProjectHistory
→ intenção/operação validada
→ componente 3D registrado + parâmetros
→ Composition Compiler
→ CompositionEngineAdapter
→ HyperFrames/engine selecionado
→ Three.js/WebGL/GSAP ou mecanismo interno aprovado
```

Não criar:
- segundo Project IR;
- timeline 3D paralela;
- engine 3D concorrente apenas para essa feature;
- código Three.js escrito livremente por agente.

O componente interno first-party pode usar código 3D auditado, conforme refinamento D13/D23.

---

## 3. Três tiers de capacidade

### Tier A — 2.5D/3D authored, sem resolver câmera real

Casos:
- cards em perspectiva;
- imagens inclinadas;
- texto em profundidade;
- parallax;
- rotação X/Y/Z;
- câmera virtual criada pelo próprio CEVRA;
- push/pan/zoom espacial;
- cenas 3D sem necessidade de aderir ao ambiente real.

Não executar camera solver apenas por existir profundidade.

Esse tier deve cobrir grande parte dos efeitos visuais com menor custo.

### Tier B — tracked 3D

Usar quando um elemento precisa parecer fixo no ambiente filmado.

Fluxo:

```text
video
→ CameraSolve3D
→ camera trajectory / intrinsics / quality evidence
→ CameraTrack3D derivado
→ anchors
→ registered 3D components
→ Composition Engine
```

Casos:
- texto “preso” a parede/mesa/espaço;
- HUD espacial;
- imagem/plano que acompanha perspectiva;
- objeto 3D ancorado à cena.

### Tier C — occlusion-aware tracked 3D

Tier B + foreground/person masking/depth evidence.

Casos:
- texto espacial atrás da pessoa;
- objetos 3D parcialmente ocultados por foreground;
- integração com HeroEmphasis/behind-subject quando espacial.

Reutiliza `SubjectMaskProvider` quando apropriado.

---

## 4. Seleção do tier

A escolha deve ser pela necessidade visual, não pela capacidade máxima disponível.

```text
precisa apenas perspectiva/profundidade authored?
→ Tier A

precisa permanecer preso à câmera/ambiente real?
→ Tier B

precisa também passar atrás/à frente de foreground real?
→ Tier C
```

Um agente pode sugerir o efeito, mas CEVRA valida capability, custo/hardware e parâmetros.

---

## 5. HyperFrames como caminho de composição 3D

A investigação atual do HyperFrames mostra suporte explícito a:
- GSAP;
- Three.js/WebGL;
- câmera e objetos 3D;
- keyframes X/Y/Z e rotation X/Y/Z;
- shader uniforms;
- seek determinístico;
- múltiplos runtimes sincronizados.

Isso reforça HyperFrames como candidato, mas não substitui o benchmark D13.

Não expor APIs Three.js ao agente. O CEVRA expõe componentes/capabilities registrados.

Exemplos conceituais de componentes internos:
- spatial-text;
- spatial-card;
- tracked-plane;
- tracked-callout;
- camera3d-scene;
- model3d;
- particle3d futuro.

Os nomes finais não são fixados aqui.

---

## 6. CameraSolve3D como capability separada

O Composition Engine **renderiza** a câmera/scene 3D; ele não precisa ser responsável por descobrir a trajetória da câmera da filmagem.

Criar boundary conceitual:

```text
CameraSolve3DAdapter
input: authorized video/frames + calibration hints
output:
- camera poses/trajectory
- intrinsics quando estimáveis
- confidence/quality metrics
- valid interval
- provenance/version
```

Output é evidência/derivação; não substitui Project IR.

Não persistir bancos/cache nativos do solver como verdade canônica.

---

## 7. Shortlist de solver

### COLMAP / PyCOLMAP — primeiro candidato geral

Razões para testar primeiro:
- projeto maduro de Structure-from-Motion/Multi-View Stereo;
- bindings PyCOLMAP;
- código identificado upstream com SPDX BSD-3-Clause;
- potencial de execução local;
- não exige que o CEVRA adote um modelo neural pesado apenas para obter poses.

Ressalva:
- o próprio projeto alerta que dependências third-party têm licenças próprias;
- empacotamento exato precisa auditoria;
- maturidade de SfM não garante que seja o melhor solver para clips curtos/handheld.

### DPVO — candidato avançado/GPU

Razões:
- licença MIT verificada no repositório;
- visual odometry neural voltada a trajetória;
- candidato quando hardware compatível justificar melhor qualidade/robustez.

Riscos:
- stack GPU/CUDA/model weights/dependências;
- cross-platform e empacotamento precisam ser medidos;
- não tornar requisito da V1 comum.

### DROID-SLAM — referência/depriorizado

Licença BSD-3-Clause verificada, mas fica como referência técnica e não como primeiro candidato devido a maior complexidade/stack GPU em comparação ao objetivo de solução proporcional.

---

## 8. Processo de seleção do solver

Não benchmarkar uma coleção grande.

Ordem:

1. usar benchmarks/documentação pública para eliminar opções claramente inadequadas;
2. testar COLMAP/PyCOLMAP em fixtures CEVRA;
3. testar DPVO apenas se houver lacuna material ou ganho plausível;
4. DROID-SLAM/outros somente se os dois anteriores falharem materialmente.

Fixtures:
- smartphone handheld;
- pan/tilt;
- avanço/recuo;
- movimento lateral;
- indoor;
- pouca textura;
- reflexos;
- motion blur;
- pessoa em foreground;
- vertical 9:16;
- horizontal 16:9.

Medir:
- estabilidade do anchor;
- drift;
- solve success/failure;
- reprojection/quality evidence quando disponível;
- tempo;
- CPU/GPU/RAM/VRAM;
- tamanho/dependências;
- cross-platform;
- licença/proveniência;
- cancelamento e cleanup.

Product Owner recebe comparativos visuais apenas quando julgamento humano for relevante.

---

## 9. Falha e fallback

Se camera solve falhar:
- não inventar trajetória;
- não aplicar tracked 3D como se fosse confiável;
- oferecer Tier A/manual authored 3D quando adequado;
- permitir retry com outro solver somente se capability/política autorizarem;
- informar que tracking espacial não ficou disponível.

Nenhuma falha de 3D bloqueia edição convencional.

---

## 10. Anchors e editabilidade

O usuário/agente trabalha com anchors lógicos, não coordenadas nativas do solver.

Exemplo conceitual:

```text
TrackedAnchor
- source interval
- spatial transform
- solveRef/digest
- confidence/status
```

Um componente referenciado pelo anchor permanece editável:
- início/fim;
- posição relativa;
- escala;
- rotação;
- texto/asset;
- visibilidade.

Se o source interval mudar materialmente, derivação pode ficar stale e exigir re-solve.

---

## 11. Occlusion e SubjectMaskProvider

Tier C reutiliza a abstração aprovada:

```text
SubjectMaskProvider
→ foreground/subject mask
→ compositor 3D
```

Não escolher motor nesta decisão.

A mesma máscara pode apoiar:
- Caption Placement N3/N4;
- HeroEmphasis;
- behind-the-subject;
- 3D foreground occlusion.

Reutilizar evidência válida em vez de recalcular sem necessidade.

---

## 12. Mobile capture futuro

No futuro, quando gravação for feita dentro de uma experiência CEVRA Mobile compatível, avaliar captura simultânea de metadata espacial fornecida pelas APIs da plataforma, como pose/intrinsics/depth quando oficialmente disponíveis.

Objetivo:
- evitar camera solve posterior quando metadata confiável já vier da captura;
- melhorar anchors;
- reduzir processamento.

Isso é futuro; não é dependência da V1 desktop nem do P2P companion.

---

## 13. HyperFrames skills/capabilities aproveitadas

### Usar como referência/desenvolvimento agora

- `hyperframes-animation`: GSAP, Three.js, Lottie, shaders e runtime seek-safe.
- `hyperframes-keyframes`: câmera, x/y/z, rotations, masks, paths, depth.
- HyperFrames Registry: pesquisar antes de recriar; incorporar somente após auditoria/adaptação.
- `remotion-to-hyperframes`: acelerar paridade/migração de referências EDVID Remotion.

### Referências técnicas, não workflows copiados integralmente

- embedded-captions;
- talking-head-recut;
- motion-graphics;
- audio/media-use.

### Pós-V1

- WebGPU/TypeGPU advanced VFX;
- optics/lighting avançados;
- particle/compute effects que realmente precisem WebGPU.

---

## 14. Segurança

Agente externo pode dizer, conceitualmente:

```text
use component: tracked-spatial-text
anchor: A3
interval: 04.2–08.5
params: {...}
```

Não pode enviar:
- Three.js arbitrário;
- shader arbitrário;
- JS/TSX;
- shell;
- Python;
- solver CLI/raw args.

O compiler/adapters internos resolvem implementação.

---

## 15. Relação com atualização

Solver, Composition Engine e componentes 3D seguem `UPDATE_STRATEGY.md`:
- version pinned;
- manifest/provenance;
- compatibility;
- visual regression;
- benchmark;
- projetos antigos não mudam silenciosamente;
- modelo/solver novo não substitui o anterior só por upstream update.

---

## 16. Momento de implementação

Não é motivo para interromper o gate coordenado do Media Runtime.

Sequência:
1. Composition Engine benchmark/seleção;
2. Tier A em componentes registered 3D;
3. CameraSolve3D benchmark pequeno;
4. Tier B tracked 3D;
5. SubjectMaskProvider/matting validado;
6. Tier C/occlusion;
7. advanced VFX/WebGPU pós-V1.

Se alguma necessidade concreta exigir alteração de Media Runtime, apresentar antes de inserir no escopo; hoje nenhum novo MR item é automaticamente aprovado por esta decisão.

---

## 17. Classificação

| Item | Estado |
|---|---|
| 2.5D/3D authored | GREEN / capability planejada |
| HyperFrames Three.js | capability upstream verificada; seleção final depende D13 |
| CameraSolve3DAdapter | GREEN como boundary, implementação pendente |
| COLMAP/PyCOLMAP | primeiro candidato |
| DPVO | candidato avançado/GPU |
| DROID-SLAM | referência/depriorizado |
| arbitrary 3D code from agent | RED |
| SubjectMaskProvider | boundary aprovada; motor pendente |
| occlusion-aware 3D | após matting |
| platform spatial capture | futuro |
| WebGPU/TypeGPU | pós-V1 |

---

## 18. Decisão final

CEVRA suportará progressivamente 3D authored, tracked 3D e occlusion-aware 3D dentro do mesmo Composition Engine/Project IR.

HyperFrames/Three.js é o caminho preferencial a provar para renderização espacial. Camera solving fica atrás de adapter próprio e terá COLMAP/PyCOLMAP como primeiro candidato de benchmark, DPVO como candidato avançado e DROID-SLAM apenas como referência inicial.

A fronteira externa permanece tipada; componentes first-party internos podem usar implementação 3D rica e auditada. Nenhum solver/modelo é incorporado por este documento.
