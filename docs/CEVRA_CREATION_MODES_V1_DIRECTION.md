# CEVRA Vids — Direção aprovada de Creation Modes V1

**Data:** 2026-09-18.  
**Status:** DIREÇÃO DE PRODUTO APROVADA; IMPLEMENTAÇÃO E PROVIDERS A DETALHAR.  
**Objetivo:** além de editar vídeo gravado, permitir criar conteúdo útil quando o usuário não tem ou não quer gravar um talking-head.

## 1. Faceless Explainer — incluir na direção V1

Entrada típica:
- tema;
- texto/notas;
- objetivo;
- duração;
- Brand Kit/preset opcional.

Fluxo alvo:

```text
tema/brief
→ roteiro por IA ou roteiro do usuário
→ aprovação/ajuste conforme modo
→ storyboard
→ narração TTS ou áudio do usuário
→ assets reais/stock/gerados conforme política
→ motion graphics/texto/B-roll
→ música/SFX quando apropriado
→ composição
→ QA
→ export
```

### TTS

TTS passa a ser uma capability V1 necessária para o caminho Faceless totalmente automático.

Regras:
- provider-neutral;
- local quando adequado é desejável;
- entitlement oficial quando permitido pode ser usado;
- BYOK opcional;
- provider gerenciado futuro;
- nenhum provider pago obrigatório para o editor básico;
- custo explícito antes de uso pago não autorizado;
- output TTS vira asset normal/provenance quando persistido;
- **TTS genérico não autoriza voice clone/Digital Twin**.

Voice cloning, Digital Twin, photo avatar e identity synthesis permanecem para decisão própria posterior.

TTS não é “o único trabalho” do Faceless, mas é a principal capability de geração ainda não coberta pelas decisões anteriores; roteiro, assets, composition, music e Director reutilizam fundações já planejadas.

## 2. Slideshow — incluir na direção V1

Entrada:
- fotos/vídeos;
- texto opcional;
- música opcional;
- Brand Kit/preset.

Objetivo:
- montagem rápida;
- ritmo;
- transições;
- títulos/callouts;
- música;
- export em formatos alvo.

Reutilizar SourceAssets, Project IR, Composition Engine, presets e audio. Não criar timeline paralela.

## 3. Music-to-video — incluir condicionalmente na V1

Valor:
- Reels estéticos;
- viagem;
- treino;
- moda;
- portfólio;
- fotos/clipes sincronizados a música.

Dependência identificada:
- CEVRA baseline atual não demonstrou capability tipada de beat/BPM/onset/energy/section analysis.

Antes da rodada coordenada de Media Runtime, fazer avaliação curta e específica para decidir o menor caminho:
1. verificar se Media Runtime atual/bundle pode fornecer evidência suficiente de forma segura;
2. comparar com analyzer local permissivo pequeno;
3. não criar novo engine grande se um analyzer isolado resolver;
4. medir necessidade de BPM, beats, onsets, energy, sections e silences;
5. registrar licença, CPU/RAM/latência e cross-platform.

Somente se houver necessidade concreta que pertença ao Media Runtime, acrescentá-la ao inventário coordenado antes do prompt de ajustes. Não inserir silenciosamente.

## 4. Product Launch Video

Pós-V1. Não bloquear ou expandir V1 por este workflow.

## 5. Brand Kit

Brand Kit é relevante para V1, especialmente profissionais autônomos.

Deve ser provider-neutral e suportar configuração/importação comum:
- logo;
- fontes;
- cores;
- estilo de cards/lower thirds;
- preferências visuais;
- presets relacionados.

Figma é um **importador opcional** do Brand Kit, não a base obrigatória. Pode ser adicionado quando esforço/termos/integração forem proporcionais.

## 6. WebGPU/TypeGPU

Pós-V1. A arquitetura de Composition Engine não deve impedir futura adoção, mas V1 não depende disso.

## 7. Princípio comum

Creation Modes são workflows sobre as mesmas fundações:

```text
Workflow/Director
→ typed application operations
→ Project IR/ProjectHistory
→ assets/providers
→ Composition Engine
→ export
```

Não criar um produto/timeline/runtime separado por workflow.
