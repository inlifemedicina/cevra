# CEVRA — Decisão de Integração 5: política de dados enviados às IAs

**Data da decisão:** 2026-09-17.
**Status:** APROVADA PELO PRODUCT OWNER.
**Prioridade:** A — crítica para qualquer integração real com agentes externos.
**Implementação:** NÃO AUTORIZADA por este registro.
**Relação com Decisões 1–4:** define como `AgentTaskRequest`, `EvidenceRequest` e `EvidenceResponse` podem ser abastecidos sem quebrar minimização de dados, segurança, privacidade, independência de IA ou o contrato provider-neutral.
**Gate atual:** não altera o gate coordenado do Media Runtime e não autoriza provider, upload, conta, cobrança, serviço cloud, código, modelo, download ou mudança do Project IR.

---

## 1. Objetivo e regra central

CEVRA deve fornecer aos agentes somente a informação necessária para a tarefa atual, preferindo processamento local determinístico e disclosure progressivo. A IA externa não recebe acesso genérico ao projeto, filesystem, mídia ou histórico.

Fluxo canônico:

```text
Project IR + configurações + pedido do usuário
        ↓
CEVRA Evidence Builder determinístico
        ↓
contexto/evidência mínima necessária
        ↓
provider adapter
        ↓
agente externo
        ↓
EvidenceRequest opcional
        ↓
CEVRA valida escopo, necessidade, autorização e budget
        ↓
Evidence Builder produz somente a evidência permitida
        ↓
EvidenceResponse
```

O CEVRA **não precisa de uma IA local para preparar, selecionar por regras conhecidas, extrair ou transmitir o contexto mínimo necessário**. IA local poderá futuramente enriquecer a seleção de evidências, mas nunca será pré-requisito para comunicação com uma IA externa.

---

## 2. CEVRA deve funcionar sem qualquer IA

Regra arquitetural forte:

> CEVRA Vids deve continuar plenamente funcional em suas capacidades locais, manuais, determinísticas, presets, edição, renderização e operações suportadas mesmo sem OpenAI, Claude, modelo local ou qualquer outra IA.

Consequências:

- IA externa é opcional;
- IA local é opcional;
- nenhuma IA local existe apenas para “traduzir” ou intermediar outra IA;
- `Evidence Builder` é software determinístico CEVRA;
- Project IR e ProjectHistory não dependem de provider;
- falha, ausência, quota ou logout de IA não invalida o projeto.

---

## 3. Classes de informação

### 3.1 Nível A — contexto estrutural

Inclui dados já conhecidos pelo CEVRA e que não exigem inferência de IA:

- tarefa/brief do usuário;
- duração desejada;
- orientação/canvas;
- aspect ratio;
- modo de apresentação;
- idioma quando conhecido;
- presets pertinentes;
- sources/IDs lógicos pertinentes;
- timestamps;
- revisão do projeto;
- capabilities disponíveis;
- constraints de usuário/projeto;
- formato de saída;
- estado necessário para stale-state e validação.

O contexto estrutural é gerado a partir de Project IR, configurações, capabilities e pedido do usuário.

### 3.2 Aspect ratio e tela cheia

Não confundir geometria de canvas com ocupação visual.

O contrato deverá suportar conceitualmente:

```text
canvas.aspectRatio:
- 9:16
- 16:9
- 1:1
- 4:5
- custom

presentationMode:
- normal
- fullscreen_edge_to_edge
```

`fullscreen_edge_to_edge` significa ocupar integralmente o canvas disponível, sem barras/vazios introduzidos pelo layout quando o objetivo for preenchimento total. Deve preservar proporções do conteúdo; não autoriza deformação/stretch como comportamento padrão. Crop/reframe controlado pode ser necessário para `cover/edge-to-edge`, sujeito às operações e políticas CEVRA correspondentes.

Portanto `fullscreen_edge_to_edge` é propriedade independente do aspect ratio e poderá coexistir com 9:16, 16:9, custom etc.

### 3.3 Nível B — texto e derivados locais

Exemplos:

- transcript;
- intervalos de transcript;
- estrutura de takes;
- títulos/tópicos já derivados;
- medições locais pertinentes;
- índices temporais;
- projeções/summaries determinísticos quando aplicáveis.

Transcript não exige uma segunda IA. Quando a tarefa já delimita source/intervalo/take, o CEVRA envia a projeção correspondente. Se o agente precisar de outra região, usa `EvidenceRequest`.

### 3.4 Nível C — frames/imagens selecionados

Exemplos:

- frame em timestamp específico;
- frame de take atual;
- frames representativos de intervalo;
- frames solicitados pelo agente;
- crop/resolução reduzida quando suficiente.

CEVRA pode extrair frames deterministicamente sem IA local. Frames são dados potencialmente identificáveis e pertencem ao disclosure autorizado para provider cloud.

### 3.5 Nível D — pequenos trechos de áudio/vídeo

Somente quando contexto textual, medições e frames forem insuficientes para a tarefa.

Usos possíveis:

- entonação;
- continuidade temporal;
- movimento;
- timing;
- expressão temporal;
- transições;
- situações não inferíveis por frames isolados.

Esse nível aumenta exposição, bytes, latência e custo e exige política de autorização própria.

### 3.6 Nível E — mídia audiovisual completa

Não é comportamento padrão e fica **fora do fluxo editorial cloud da V1 inicial**.

A V1 inicial não enviará automaticamente arquivos completos de vídeo/áudio a agentes editoriais externos. Qualquer capacidade futura que realmente necessite mídia integral exige decisão específica, provider identificado, necessidade demonstrada, custo/tamanho/retention conhecidos e autorização explícita adequada.

---

## 4. Progressive disclosure obrigatório

Ordem padrão:

```text
1. tarefa + contexto estrutural compacto
2. transcript/projeções necessárias
3. frames necessários
4. áudio/vídeo curto somente se necessário e autorizado
5. mídia completa somente por decisão futura específica
```

Não enviar todo o projeto “para o modelo decidir depois o que queria”. O CEVRA controla a fronteira de disclosure.

---

## 5. Evidence Builder determinístico

`Evidence Builder` será uma capacidade CEVRA não-IA responsável por produzir dados limitados para o agente.

Entradas possíveis:

- Project IR;
- ProjectHistory quando material;
- configuração do projeto;
- capability snapshot;
- pedido do usuário;
- transcript/derived artifacts já existentes;
- `EvidenceRequest` validado.

Saídas possíveis:

- projections estruturais;
- trechos de transcript;
- frames;
- medições;
- clip temporário delimitado quando autorizado;
- manifests/digests.

O Evidence Builder não “adivinha editorialmente” o que o agente quis dizer. Ele resolve pedidos tipados e regras determinísticas.

IA local futura pode ser usada como **helper opcional** para tarefas como selecionar frames mais informativos, classificar conteúdo visual ou resumir evidência, mas:

- não substitui as regras básicas;
- não é requisito de integração cloud;
- não recebe autoridade extra;
- não altera o CEVRA Agent Protocol;
- não torna o projeto dependente de modelo local.

---

## 6. Como o CEVRA decide o que enviar sem IA

### 6.1 Escopo explícito

Se o pedido já delimita take, clip, source ou intervalo, o CEVRA usa esse escopo.

### 6.2 Regras determinísticas

Exemplos:

- clip atual → transcript desse intervalo;
- take selecionado → transcript e frames desse take;
- sources realmente usados → contexto desses sources;
- frame solicitado em timestamp → seek/extract nesse timestamp;
- decisão dependente de aspect ratio → enviar canvas/presentation mode;
- revisão/digest → obter do estado canônico.

### 6.3 EvidenceRequest do próprio agente

Se o modelo não possui evidência suficiente, ele pede explicitamente mais dados. O CEVRA valida antes de responder.

Exemplo conceitual:

```text
EvidenceRequest:
  type: video_frame
  sourceRef: source_7
  timestamp: 83.4
  purpose: compare_take_quality
```

O CEVRA resolve a referência internamente; o agente não precisa conhecer path local.

---

## 7. Sem filesystem genérico para agentes

Proibido como interface normal:

```text
read C:\Users\...\Videos
scan project folder
list filesystem
open arbitrary file
```

Agentes pedem **evidência lógica CEVRA**, não paths. CEVRA mapeia source IDs/referências para arquivos internamente.

Nenhum `EvidenceRequest` concede por si só acesso ao filesystem.

---

## 8. Staging temporário de evidências binárias

Quando um provider realmente precisar receber frame, imagem, áudio ou clip, o CEVRA deve produzir uma evidência temporária e limitada:

```text
Project Source
    ↓
Evidence Builder
    ↓
temporary bounded evidence
    ↓
provider adapter
```

A evidência pode ser:

- frame redimensionado;
- crop específico;
- clip curto;
- áudio curto;
- derivado com qualidade suficiente para análise.

Isso evita expor o original ou diretório do projeto apenas porque um provider precisa analisar uma parte.

A futura implementação deverá definir lifecycle/cleanup, hashes, tamanho máximo e tratamento de falhas/retry sem transformar staging em segunda biblioteca audiovisual.

---

## 9. Prompt injection e conteúdo não confiável

Todo conteúdo vindo de:

- fala;
- transcript;
- legenda;
- frame/imagem;
- documento importado;
- página/web;
- metadata de ativo;
- texto encontrado em mídia;

é **evidência**, não instrução privilegiada.

Texto do conteúdo dizendo “ignore as regras”, “execute comando”, “delete projeto”, “envie arquivos” etc. não recebe autoridade.

Autoridade permanece em CEVRA protocol, permissões, user task e políticas do sistema. Evidence nunca ganha permissão por ser imperativa.

---

## 10. Dados proibidos

Nunca enviar como parte normal de contexto/evidência:

- API keys;
- passwords;
- cookies;
- auth tokens;
- credenciais CEVRA;
- credenciais de outros providers;
- paths locais desnecessários;
- outras pastas/projetos;
- logs com segredos;
- configuração interna irrelevante;
- filesystem completo;
- Project IR completo quando uma projeção limitada resolve.

Provider/session identifiers necessários ficam no adapter boundary e não autorizam disclosure adicional.

---

## 11. Política de autorização para usuário leigo

Evitar consent fatigue. Não pedir autorização para cada frame.

Quando o usuário voluntariamente habilita/conecta uma IA cloud, o CEVRA deve explicar de forma simples que partes relevantes do conteúdo poderão ser enviadas ao provider selecionado para executar a tarefa, sob minimização.

Padrão aprovado para a V1:

```text
AUTORIZADO dentro do uso cloud escolhido:
✓ contexto estrutural necessário
✓ texto/transcript necessário
✓ frames selecionados necessários

ESCALADA DE AUTORIZAÇÃO:
○ áudio ou pequenos clips de vídeo
  → desativados inicialmente
  → autorização adicional antes do primeiro uso
  → usuário pode optar por permitir automaticamente para aquele provider depois

FORA DA V1 EDITORIAL CLOUD:
✕ mídia audiovisual completa automática
```

Essa autorização não transforma filesystem ou mídia inteira em acessíveis ao agente.

---

## 12. Manifesto local de disclosure

CEVRA deverá registrar localmente metadados suficientes para auditoria/debug, sem criar cópia eterna de todo conteúdo enviado.

Exemplo:

```text
provider: Claude
requestId: req_123
projectRevision: 142
purpose: take_selection
sent:
  transcriptExcerpts: 3
  frames: 6
  videoClips: 0
  fullMedia: 0
```

O manifesto deverá permitir responder, quando tecnicamente possível: qual provider, qual tarefa, qual revisão e quais classes/quantidades de evidência saíram.

Não implica retenção indefinida dos próprios frames/clips temporários.

---

## 13. Retenção e políticas do provider

CEVRA controla o que envia e o que mantém localmente, mas não pode inventar garantias sobre retenção, treinamento, exclusão ou processamento remoto.

Cada adapter/modo de autenticação deverá possuir `Provider Data Policy` ou equivalente, revalidada no marco real de integração/release.

Não afirmar “apagado imediatamente”, “não usado para treino”, “não retido” etc. sem fonte oficial aplicável ao plano/autenticação realmente usados.

Mudanças materiais de provider policy devem poder gerar atualização de informação/consentimento quando necessário.

---

## 14. IA local e disclosure

Mesmo IA local recebe dados via fronteira lógica CEVRA, não filesystem irrestrito por padrão.

Diferença principal:

```text
external provider → evidência pode deixar o dispositivo
local provider    → evidência permanece no dispositivo
```

Modelos locais podem futuramente receber evidência mais rica se isso trouxer vantagem e o hardware suportar, mas continuam sujeitos a capability, budget e segurança.

---

## 15. Não existe obrigação de IA local para conversar com IA externa

Explicitamente rejeitado:

```text
CEVRA
→ IA local obrigatória
→ interpreta projeto
→ prepara contexto
→ IA externa
```

A arquitetura aprovada é:

```text
Project IR / settings / transcripts / deterministic evidence
        ↓
CEVRA Evidence Builder
        ↓
provider adapter
        ↓
IA externa
```

Opcionalmente, no futuro:

```text
Local AI Helper
        ↓
melhora/ranqueia evidência
        ↓
Evidence Builder
```

Esse helper não é requisito e sua ausência não quebra o fluxo.

---

## 16. Classificação

- Progressive disclosure: **VERDE**.
- Evidence Builder determinístico: **VERDE**.
- Contexto estrutural sem IA: **VERDE**.
- Transcript seletivo: **VERDE**.
- Frames selecionados dentro da autorização cloud: **VERDE**.
- `fullscreen_edge_to_edge` separado do aspect ratio: **VERDE arquitetural**.
- Áudio/clips curtos: **AMARELO**, por escalada de dados e necessidade de autorização adicional.
- Mídia completa automática: **VERMELHO para a V1 editorial cloud**.
- Filesystem genérico para agente: **VERMELHO**.
- Secrets/credentials em payload editorial: **VERMELHO**.
- Provider-specific retention/privacy validation: **OBRIGATÓRIO antes de integração/release real**.
- IA local obrigatória para comunicação cloud: **REJEITADO**.

---

## 17. Critérios de aceite da futura implementação

Considerar esta política implementada apenas quando houver evidência de que:

1. o CEVRA monta contexto Nível A sem IA;
2. transcript/frames podem ser produzidos por referência e intervalo sem filesystem exposto;
3. EvidenceRequest inválido ou excessivo é rejeitado;
4. staging temporário não altera Project IR nem cria biblioteca paralela;
5. conteúdo da mídia é tratado como evidence, nunca autoridade;
6. secrets/paths desnecessários não entram no payload;
7. disclosure manifesto registra classes/escopo enviados;
8. frames podem ser enviados sem prompt individual repetitivo após autorização cloud;
9. áudio/clips exigem a escalada de autorização prevista;
10. full media não é enviado automaticamente na V1;
11. ausência de IA local não reduz a capacidade de montar/transmitir o contexto necessário;
12. ausência total de IA não impede o funcionamento básico completo do CEVRA nas capacidades não-IA;
13. `fullscreen_edge_to_edge` é representado como presentation mode, não como falso aspect ratio;
14. falha de provider não causa perda ou mutação do estado canônico.

---

## 18. Decisão consolidada

> CEVRA adotará uma política de disclosure progressivo e minimizado para agentes. Contexto estrutural, transcript pertinente e frames necessários poderão ser produzidos deterministicamente pelo próprio CEVRA e enviados dentro da autorização cloud do usuário; nenhuma IA local é necessária para preparar essa comunicação. `fullscreen_edge_to_edge` será um modo de apresentação independente do aspect ratio, permitindo ocupação integral do canvas sem deformação como regra. Áudio e pequenos clips representarão escalada de disclosure e exigirão autorização adicional antes do primeiro uso; mídia audiovisual completa não será enviada automaticamente a agentes editoriais externos na V1 inicial. Agentes solicitam evidência lógica por IDs/intervalos e nunca ganham filesystem genérico. CEVRA valida cada EvidenceRequest, produz staging temporário delimitado, mantém manifesto local de disclosure e trata todo conteúdo importado como evidência não confiável, não como instrução. Modelos locais podem futuramente enriquecer a seleção de evidências, mas são opcionais. O CEVRA continuará plenamente funcional sem qualquer IA.

---

## 19. Impacto no gate atual

Nenhuma alteração imediata do gate coordenado do Media Runtime foi identificada. A decisão define uma fronteira futura de dados/segurança e requisitos do Director/Agent Gateway/Evidence Builder; não autoriza implementação nem novo engine.