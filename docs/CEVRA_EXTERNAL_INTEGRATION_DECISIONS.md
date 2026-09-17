# CEVRA — integrações externas e viabilidade

**Data de início do registro:** 2026-09-17.
**Status geral:** decisões de arquitetura de comunicação aprovadas pelo product owner; implementação somente nos marcos autorizados.
**Escopo:** registrar decisões deste bloco exclusivo de integrações externas sem substituir `CEVRA_MASTER_CONTEXT.md`, `ARCHITECTURE_V1.md`, `INTEGRATIONS.md`, ADRs ou os registros detalhados do Director.

## 0. Autoridade, continuidade e limites

Ler este documento em conjunto com `docs/CEVRA_MASTER_CONTEXT.md`, `AGENTS.md`, `docs/ARCHITECTURE_V1.md`, `docs/INTEGRATIONS.md`, `docs/CEVRA_DIRECTOR_DECISIONS.md`, `docs/CEVRA_SKILL_PRODUCT_DECISION.md`, os registros editorial/visual/composição e os ADRs aplicáveis na revisão efetivamente vigente.

A referência funcional EDVID permanece fixada em `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`. Não usar `edvid-lt` nem upstream flutuante como referência canônica.

Permanecem obrigatórios:

`PRESERVE → EXTEND → VERIFY → MIGRATE ONLY IF NECESSARY`

- Project IR / ProjectHistory são a única autoridade audiovisual editável.
- Nenhum provedor externo vira modelo de domínio principal.
- Nenhum agente bypassa comandos tipados, histórico, validações ou capability checks.
- Nada de arbitrary shell, raw FFmpeg/filtergraph, Python/TSX arbitrário ou comandos nativos do motor enviados pela IA para execução.
- O aplicativo continua útil sem agente externo e sem API paga obrigatória.
- Assinatura de chat, skill, plugin, SDK e API são mecanismos distintos até comprovação oficial.
- Código, pesos/modelos, ativos e serviços têm auditorias de licença/comercialização próprias.

Este registro não autoriza código, download de modelo, criação de conta, serviço pago, cobrança, mudança do Media Runtime, merge ou publicação. O gate coordenado atual do Media Runtime permanece inalterado.

---

# Decisão de Integração 1 — protocolo CEVRA ↔ agentes

**Status:** APROVADA PELO PRODUCT OWNER.
**Classificação arquitetural:** VERDE — o contrato provider-neutral é compatível com as fundações atuais e não exige fornecedor específico.
**Prioridade:** A — CRÍTICO PARA A V1.
**Implementação:** NÃO AUTORIZADA POR ESTE REGISTRO.
**Dependência de prova futura:** SIM — pelo menos um round-trip real com provedor/agente autorizado deve ser demonstrado antes de ampliar funcionalidades fortemente dependentes dessa comunicação.

## 1. Problema que esta decisão resolve

CEVRA Vids precisa usar agentes/modelos capazes de raciocínio editorial sem permitir que cada fornecedor conheça e controle diretamente os detalhes internos do editor. Uma integração mal delimitada poderia produzir ruído semântico, comandos incompatíveis entre provedores, mutações inseguras, dependência de uma IA específica e acoplamento do produto à implementação atual dos motores.

Há dois extremos rejeitados:

1. **Texto livre retornado pela IA e reinterpretado semanticamente pelo CEVRA para descobrir o que executar.** Isso criaria uma segunda etapa ambígua de raciocínio e poderia modificar o sentido da proposta do agente.
2. **Comandos internos ou de motor enviados diretamente pela IA.** Isso acoplaria a IA ao Project IR, comandos internos, Media Runtime, FFmpeg, Composition Engine ou outras implementações e aumentaria risco, dependência e incompatibilidade entre provedores.

A solução aprovada é uma camada intermediária CEVRA, estruturada, fechada, versionada e provider-neutral.

## 2. Regra central aprovada

O fluxo canônico será conceitualmente:

```text
CEVRA
→ pedido + contexto/evidências delimitados
→ agente/modelo editorial

agente/modelo
↔ pedidos estruturados de evidência adicional, quando necessários

agente/modelo
→ proposta estruturada no protocolo CEVRA
→ CEVRA valida
→ CEVRA produz Change Set revisável
→ aprovação ou autonomia previamente autorizada
→ compilação determinística
→ comandos tipados da aplicação
→ ProjectHistory / Project IR
→ engines aprovados
```

A IA externa realiza o raciocínio editorial. O CEVRA **não deve executar uma segunda interpretação semântica de texto livre para inferir mutações**. Ele valida uma proposta estruturada e a compila de modo determinístico para suas operações internas.

Se a proposta não puder ser mapeada de forma inequívoca e validada para operações suportadas, o sistema falha de forma explícita, pede correção/esclarecimento ou mantém a proposta apenas para revisão humana. Não existe fallback autorizado que transforme prosa livre em comando executável silenciosamente.

## 3. Separação obrigatória: intenção estruturada versus comando executável

O agente retorna **intenção estruturada CEVRA**, não comandos do motor.

Exemplo conceitual aceitável:

```text
operation: join
sourceA: <reference>
sourceB: <reference>
transition.audio: j_cut
transition.video: hard_cut
audioLeadMs: 180
supportingEvidence: [...]
```

Esse objeto ainda é uma proposta não confiável. O CEVRA verifica referências, revisão, digests, capacidades, permissões e limites; somente então seu compilador resolve a intenção em comandos internos tipados.

Exemplos proibidos como interface normal de agente:

```text
ffmpeg ...
```

```text
raw filtergraph
```

```text
ProjectIR.tracks[...].clips.push(...)
```

```text
executePython(...)
```

```text
custom TSX / shell / engine-native arguments
```

O protocolo também não deve expor desnecessariamente a forma concreta usada internamente hoje para obter o resultado. Se a implementação do J-cut, do tratamento de áudio, da composição ou de outro recurso mudar no futuro, o contrato editorial com o agente deve permanecer estável sempre que o significado da operação continuar o mesmo.

## 4. Por que o agente não deve enviar o comando interno final

### 4.1 Desacoplamento de fornecedor

Codex, Claude, um modelo local ou qualquer agente futuro devem convergir para o mesmo protocolo CEVRA. O que muda entre provedores pertence ao adapter: autenticação, transporte, streaming, tool calling, sessão, eventos, limites e billing.

Não haverá um vocabulário audiovisual diferente para cada IA.

```text
Codex ─────┐
Claude ────┤
Local ─────┤
Future ────┘
      ↓
CEVRA Agent Protocol
      ↓
validação + compilador CEVRA
      ↓
comandos tipados internos
```

### 4.2 Desacoplamento dos motores

O agente não precisa conhecer versão de FFmpeg, nome de filtro, estrutura atual do Media Runtime, composição escolhida, detalhes de Project IR ou mudanças futuras na implementação. Esses detalhes permanecem sob responsabilidade do CEVRA.

### 4.3 Segurança e auditabilidade

Uma intenção validável permite conferir estado, permissões, capability, limites e evidência antes de qualquer mutação. A execução continua passando por ProjectHistory e pelas mesmas garantias de undo/redo/recovery.

### 4.4 Evolução

Mudanças internas normalmente exigem atualização apenas do compilador/adapters internos, não de todos os prompts, skills e provedores externos. O protocolo só muda quando muda a semântica necessária, e então usa versionamento explícito.

## 5. Objetos conceituais do protocolo

Os nomes finais e schemas exatos serão definidos na fatia técnica, mas o protocolo deve preservar estes papéis sem fundi-los:

### 5.1 `AgentTaskRequest`

Representa o pedido enviado pelo CEVRA ao agente.

Deve comportar pelo menos:

- `protocolVersion`;
- `requestId` / correlation identity;
- identidade estável do projeto sem expor caminhos desnecessários;
- `projectRevision` atual;
- tarefa/brief;
- constraints obrigatórias;
- permissões/autonomia concedidas;
- capability snapshot pertinente;
- budgets/limites pertinentes;
- contexto editorial compacto;
- referências de evidência e seus digests.

Não deve carregar segredos, credenciais, paths internos irrelevantes, estado completo duplicado do projeto ou vídeo integral por padrão.

### 5.2 `EvidenceRequest`

Permite ao agente pedir evidência adicional sem ganhar acesso genérico ao computador.

Deve indicar:

- `evidenceRequestId`;
- tipos/intervalos/referências solicitados;
- finalidade/rationale quando útil;
- vínculo com o request/plano vigente.

O agente não recebe filesystem arbitrário. O CEVRA decide se a evidência é válida, necessária, autorizada e compatível com privacidade/budget antes de devolvê-la.

### 5.3 `EvidenceResponse`

Entrega somente a evidência autorizada e identificável, por exemplo texto, transcript projection, frames, pequenos trechos ou medições pertinentes.

Cada evidência deve poder ser vinculada à fonte/versão correspondente e possuir identidade/digest suficiente para detectar substituição ou obsolescência quando material.

### 5.4 `EditorialPlanCandidate`

É a proposta estruturada produzida pelo agente.

Deve comportar:

- `planId`;
- `basedOnProjectRevision`;
- digests/evidências relevantes utilizados;
- operações/intents estruturados em vocabulário CEVRA fechado;
- referências às fontes/intervalos pertinentes;
- constraints satisfeitas ou conflitantes;
- questões/limitações ainda não resolvidas;
- rationale/justificativa como informação não executável.

`rationale`, comentários e texto explicativo nunca ganham autoridade de comando.

### 5.5 `PlanValidationResult`

É produzido pelo CEVRA, não pelo agente como autoridade final. Distingue proposta estruturalmente válida, referências válidas, capability/permission, stale-state, conflitos, operações não suportadas e outras condições necessárias à aplicação.

### 5.6 `ChangeSet`

É o resultado CEVRA após validação/compilação da proposta. É revisável e representa exatamente o que poderá ser aplicado. Não é uma segunda timeline nem estado audiovisual concorrente.

### 5.7 `ExecutionResult`

Registra o resultado real das operações autorizadas: aplicado, parcial quando explicitamente suportado, cancelado, falhou, obsoleto, não aplicado etc. A resposta do agente não equivale a sucesso de execução.

## 6. Vocabulário de intenção

O protocolo terá um **closed typed vocabulary** de operações de alto nível. Ele deve crescer incrementalmente conforme capacidades reais do CEVRA, e não tentar antecipar todo o editor.

Categorias futuras podem incluir, quando implementadas e autorizadas:

- seleção/organização de takes;
- trim/cut/assembly intent;
- junções e pacing;
- captions/style/layout intent;
- composição e posicionamento de ativos;
- tratamento de áudio/cor através de parâmetros CEVRA suportados;
- pedidos de B-roll/ativos;
- pedidos de evidência adicional;
- QA/revisão/refinamento.

Cada intenção deve possuir schema fechado e validado. Um campo genérico como `command`, `script`, `code`, `ffmpegArgs`, `filtergraph`, `python`, `tsx` ou equivalente não é permitido como escape.

Se uma intenção necessária ainda não tiver representação segura, ela permanece não executável até que a capacidade seja desenhada/implementada no marco correto.

## 7. Validação antes da compilação

Uma proposta somente pode avançar quando passar, conforme aplicável, por:

1. validação da versão do protocolo;
2. validação estrutural/schema;
3. identidade do projeto;
4. `projectRevision` / stale-state;
5. transcript/evidence/source digests relevantes;
6. existência e validade das referências;
7. capability realmente disponível;
8. permissões/autonomia concedidas;
9. constraints do usuário/projeto;
10. limites de duração/recursos/budget pertinentes;
11. conflitos com trabalho manual ou mudanças posteriores;
12. política de segurança e comercialização pertinente à operação;
13. compilabilidade determinística para operações internas suportadas.

Schema válido não prova qualidade editorial. Revisão, QA e aprovação/autonomia continuam etapas próprias.

## 8. Regra de compilação determinística

Após validação, o compilador CEVRA traduz a intenção estruturada para comandos tipados da aplicação.

Regras:

- a mesma intenção válida, no mesmo estado e com os mesmos parâmetros relevantes, deve resolver de forma previsível;
- o compilador não inventa objetivos ausentes;
- não tenta adivinhar prosa livre para completar campos executáveis;
- parâmetros ausentes obrigatórios geram rejeição/pedido de correção, não default criativo silencioso;
- operações internas continuam sob os contratos normais de Project IR/ProjectHistory/engines;
- alterações na implementação interna não obrigam mudança do protocolo quando o significado externo permanece estável.

O compilador é uma fronteira de segurança e compatibilidade, não um segundo agente editorial.

## 9. Estado obsoleto e respostas atrasadas

Toda proposta aplicável deve estar vinculada à revisão/identidade em que foi produzida. Uma resposta que chega depois de mudança relevante do projeto não pode sobrescrever silenciosamente o trabalho novo.

No mínimo:

- comparar `basedOnProjectRevision`;
- verificar digests relevantes;
- detectar referências removidas/substituídas;
- marcar resposta como stale quando necessário;
- permitir nova validação/replanejamento quando apropriado;
- nunca aplicar automaticamente resposta atrasada contra estado incompatível.

A revisão global é necessária para detectar mudança, mas digests/referências específicas evitam tratar qualquer alteração irrelevante como semanticamente equivalente sem análise definida na implementação.

## 10. Idempotência e duplicação

Retries, reconexões ou entrega repetida não podem aplicar a mesma edição duas vezes.

O protocolo deve possuir identidades estáveis, como:

- `requestId`;
- `evidenceRequestId`;
- `planId`;
- IDs das operações propostas;
- `changeSetId` gerado/validado pelo CEVRA quando aplicável.

Receber novamente o mesmo resultado deve ser detectável. Se o estado de aplicação estiver incerto, o CEVRA reconcilia o resultado antes de qualquer replay. Não repetir automaticamente operação com efeito ou cobrança potencialmente já realizada quando o outcome for desconhecido.

## 11. Streaming e resultados parciais

Streaming do provedor pode melhorar UX, mas **eventos/parciais de streaming não autorizam mutação audiovisual**.

O CEVRA pode exibir progresso/rationale quando seguro, porém somente uma unidade de proposta completa dentro do contrato aceito pode entrar na validação de aplicação. Se futuramente houver planos incrementalmente aplicáveis, isso exigirá contrato explícito com atomicidade/ordenação/recovery; não é presumido por esta decisão.

## 12. Cancelamento, timeout e resposta tardia

Cancelamento do pedido ao agente e cancelamento da aplicação local são estados distintos.

- cancelar inferência deve impedir novas aplicações derivadas daquela solicitação quando possível;
- uma resposta que chegue após cancelamento não é aplicada silenciosamente;
- timeout não prova que o provedor não concluiu uma operação externa;
- se houver estado remoto desconhecido, reconciliar quando o mecanismo permitir;
- Project IR permanece intacto até a etapa CEVRA autorizada de aplicação;
- cancelamento/falha de transporte nunca exige rollback de uma edição que não chegou a ser aplicada.

## 13. Evidence loop e controle de consumo

O protocolo permite múltiplas rodadas de evidência quando isso melhora a decisão, mas com limites explícitos.

O Director deve poder limitar:

- quantidade de rodadas;
- volume de contexto;
- frames/clips/bytes enviados;
- tamanho da resposta;
- tempo decorrido;
- concorrência;
- tokens/uso quando oficialmente mensurável;
- custo pago quando aplicável e autorizado.

Ultrapassar limites pausa/falha de forma compreensível. Não trocar de provedor, cobrar API, enviar vídeo inteiro ou degradar silenciosamente a qualidade apenas para completar a operação.

## 14. Privacidade e minimização de dados

Transcrição local não significa que todo fluxo é local. Para agentes externos:

- enviar apenas contexto/evidência pertinente;
- vídeo integral não sai do computador por padrão;
- texto, frames ou pequenos trechos podem ser enviados quando necessários e autorizados;
- caminhos locais, credenciais, tokens e dados desnecessários não entram no payload;
- o usuário deve poder compreender provedor e escopo de dados enviados quando material;
- políticas específicas de retenção/training do fornecedor serão avaliadas no adapter/provedor correspondente, não presumidas pelo protocolo.

## 15. Metadados específicos do provedor

IDs nativos de thread/session/run, tool-call IDs, billing IDs, nomes de endpoints e detalhes semelhantes pertencem ao adapter/session/audit boundary.

Eles **não entram como campos obrigatórios do Project IR nem definem o protocolo editorial canônico**.

O CEVRA pode manter metadados de proveniência/auditoria necessários fora do estado audiovisual canônico, com minimização e política de retenção apropriadas. ProjectHistory registra as mutações CEVRA efetivamente aplicadas e sua proveniência pertinente, não uma cópia irrestrita de toda conversa externa.

## 16. Falhas e princípio fail-closed

Condições como estas não autorizam execução aproximada silenciosa:

- resposta apenas em prosa quando era esperado plano executável;
- JSON/schema inválido;
- versão de protocolo incompatível;
- operação/intenção desconhecida;
- referência inexistente;
- stale-state;
- digest divergente;
- capability ausente;
- permissão insuficiente;
- parâmetro obrigatório ausente;
- operação não compilável deterministicamente;
- resultado remoto/cobrança de outcome incerto.

O sistema pode solicitar reparo da resposta, replanejamento ou revisão humana, mas não deve converter automaticamente uma falha estrutural em comando por heurística textual.

## 17. Relação com CEVRA Skill e múltiplos provedores

O mesmo protocolo conceitual deve servir tanto ao aplicativo Vids integrado com agentes quanto, quando retomado após a V1 básica, ao produto CEVRA Skill nos ambientes oficialmente compatíveis.

A skill ensina procedimento e contrato; não cria autenticação nem transporte. Um host externo poderá usar ferramentas/skills para produzir/submeter o mesmo tipo de proposta CEVRA, enquanto um caminho embedded/direct poderá trocar as mesmas semânticas por outro transporte.

Isso permite reutilizar o núcleo sem transformar o CEVRA Skill em segunda arquitetura de edição.

## 18. O que já existe e o que falta

### Já existente / reutilizável

- Project IR e ProjectHistory canônicos;
- comandos tipados e validações existentes;
- transcripts por fonte, IDs, revisões e digests;
- Desktop Host com fronteira de confiança estreita;
- política de providers/adapters;
- direção do Agent Gateway;
- Change Set/review como conceito de produto;
- princípios do Director para contexto compacto, stale-state, idempotência, capabilities e budgets.

### Ainda falta implementar/definir no marco técnico

- schemas exatos e versionamento do protocolo;
- vocabulário inicial de intents;
- contexto/projeções editoriais mínimas;
- EvidenceRequest/EvidenceResponse executáveis;
- validator do plano;
- compilador de plano/intents para comandos CEVRA;
- armazenamento/auditoria transitória apropriada das sessões;
- adapters reais de provedor;
- UX de conexão, estado, aprovação e falha;
- métricas e limites medidos;
- testes reais de integração.

Nenhuma dessas lacunas autoriza bypass das fundações existentes.

## 19. Proof of Concept obrigatório antes de ampliar dependências

Depois do gate atual e quando o contexto/plano mínimo existir, provar com um agente/provedor real e oficialmente autorizado:

```text
CEVRA context/evidence
→ agente real
→ EvidenceRequest opcional
→ EvidenceResponse
→ EditorialPlanCandidate estruturado
→ validação CEVRA
→ Change Set/revisão
```

A primeira prova pode parar antes de renderização ou mutação irrestrita. Deve medir/validar pelo menos:

- autenticação real;
- transporte real;
- retorno estruturado;
- round-trip bidirecional de evidência;
- latência;
- tokens/contexto/uso disponível;
- custo quando aplicável;
- dados efetivamente enviados;
- malformed response;
- operação não suportada;
- stale response;
- duplicate/retry;
- cancelamento;
- timeout/resposta tardia;
- falha/reconexão;
- segurança/escopo de permissão;
- ausência de mutação direta fora do caminho CEVRA.

A escolha do primeiro provedor e mecanismo não é feita nesta decisão. Ela será objeto dos blocos específicos de OpenAI/Codex, Claude e alternativas locais.

## 20. Critérios de aceite da futura implementação desta decisão

A implementação desta decisão só poderá ser considerada fechada quando houver evidência de que:

1. dois adapters diferentes podem convergir para o mesmo contrato sem modificar Project IR;
2. a proposta externa não contém engine-native execution como requisito;
3. texto/rationale não é interpretado como comando;
4. intents válidos compilam para comandos CEVRA tipados;
5. intents inválidos/não suportados falham fechados;
6. stale-state impede aplicação indevida;
7. retries/duplicates não duplicam mutações;
8. cancelamento e late responses preservam estado;
9. permissões/capabilities são verificadas antes da aplicação;
10. ProjectHistory/undo/redo/recovery permanecem válidos;
11. o aplicativo continua funcional sem agente externo;
12. o comportamento relevante é testado por fixtures determinísticas e pelo menos um round-trip real.

## 21. Decisão consolidada

> O CEVRA adotará um protocolo provider-neutral, fechado e versionado para comunicação com agentes. O agente realizará o raciocínio editorial e devolverá intenção estruturada CEVRA vinculada ao projeto, revisão e evidências utilizados. O CEVRA não fará uma segunda interpretação semântica de texto livre para descobrir mutações e não aceitará comandos diretos do Project IR, Media Runtime, FFmpeg, Composition Engine, shell ou código arbitrário vindos da IA. O aplicativo validará a proposta, produzirá um Change Set revisável e a compilará deterministicamente para comandos tipados internos. Transporte, autenticação, sessão, streaming e metadados específicos de cada fornecedor permanecerão isolados em adapters. O protocolo suportará evidence requests, stale-state, idempotência, cancelamento, limites, falhas e privacidade sem criar estado audiovisual paralelo. Quando uma proposta não puder ser validada e compilada inequivocamente, ela não será executada silenciosamente.

## 22. Impacto no gate atual

**Nenhuma alteração imediata do gate coordenado do Media Runtime foi identificada por esta decisão.**

Esta decisão define a fronteira futura de comunicação e evita acoplamento precoce. Não acrescenta operação MR, não escolhe modelo/provedor e não autoriza implementação do Director. A prova real de integração continua programada para o marco já aprovado: após as pré-condições mínimas de contexto/plano e antes de ampliar construção dependente de agentes externos.
