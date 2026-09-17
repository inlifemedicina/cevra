# CEVRA — Decisão de Integração 3: Claude / Claude Code

**Data da decisão:** 2026-09-17.
**Status:** APROVADA PELO PRODUCT OWNER.
**Prioridade:** B — segundo provider/caminho estratégico, importante para validar neutralidade do protocolo CEVRA ↔ agente e oferecer alternativas de custo/uso.
**Implementação:** NÃO AUTORIZADA por este registro.
**Relação com Decisão 1:** especializa os caminhos Anthropic/Claude sem alterar o `CEVRA Agent Protocol` provider-neutral.
**Relação com Decisão 2:** OpenAI/Codex permanece o primeiro provider previsto para o primeiro PoC obrigatório; Claude é o segundo caminho estratégico e deverá convergir para o mesmo protocolo CEVRA.
**Gate atual:** nenhuma alteração do gate coordenado do Media Runtime. Nenhum download, conta, API, cobrança, bridge, channel, MCP, skill, serviço cloud ou código é autorizado por este documento.

---

## 1. Objetivo da decisão

Definir como CEVRA Vids poderá se comunicar com Claude/Claude Code preservando:

- baixo custo para o usuário sempre que existir um caminho oficialmente permitido;
- UX adequada a usuário leigo;
- independência de provider;
- nenhuma mutação audiovisual direta pelo modelo;
- nenhuma dependência obrigatória de API paga para o funcionamento básico do app;
- compatibilidade com o `CEVRA Agent Protocol` aprovado;
- segurança, privacidade, stale-state, idempotência e validação antes da aplicação;
- conformidade com regras de autenticação/billing da Anthropic;
- possibilidade de evolução sem reescrever Project IR, ProjectHistory ou Media Runtime.

A decisão não assume que assinatura Claude e Claude API são equivalentes.

---

## 2. Contrato semântico permanece único

Qualquer caminho Claude deverá produzir/consumir a mesma semântica aprovada na Decisão 1:

```text
CEVRA
→ AgentTaskRequest
→ Claude/Claude Code

Claude/Claude Code
→ EvidenceRequest
ou
→ EditorialPlanCandidate

CEVRA
→ valida schema/revisão/digests/capabilities/permissões
→ Change Set
→ compilação determinística
→ comandos tipados CEVRA
→ ProjectHistory / Project IR
```

Não haverá um “protocolo Claude” paralelo.

Claude não recebe autoridade para:

- escrever Project IR diretamente;
- chamar Media Runtime diretamente;
- gerar raw FFmpeg/filtergraphs para execução;
- usar shell/Python/TSX como escape para mutação audiovisual;
- substituir o compilador determinístico CEVRA;
- interpretar permissões de forma implícita;
- aplicar uma resposta stale ou duplicada.

---

## 3. Princípio de produto aprovado

O CEVRA é voltado a usuários que desejam edição simples e assistida, inclusive usuários leigos. Portanto a experiência padrão não deve exigir que o usuário compreenda Console, tokens, API keys, billing técnico ou configuração de SDK se existir uma alternativa oficial mais simples.

Ao mesmo tempo, BYOK continua sendo opção válida para usuários avançados e profissionais.

A ordem aprovada de prioridade Claude é:

```text
A. Claude Code + Channels oficial + Skill/MCP
   SE/QUANDO Channels estiver adequado para uso público/comercial do CEVRA

B. Claude Code oficial + CEVRA Skill + MCP
   usando um fluxo oficialmente permitido no ambiente Claude Code

C. buscar autorização formal da Anthropic
   para integração mais direta do entitlement/login Claude

D. BYOK Claude API
   opção real e implementável, com cobrança separada Anthropic

E. CEVRA-managed Claude API
   arquitetura prevista, mas implementação diferida e fora da V1 inicial
```

Caminhos A/B/C têm prioridade estratégica por poderem reduzir ou evitar custo de API explícito para o usuário e simplificar a experiência, **mas somente quando oficialmente permitidos**.

BYOK vem antes de infraestrutura própria CEVRA porque é muito mais simples de implementar e operar.

---

# 4. Caminho A — Claude Code + Channels + Skill/MCP

## 4.1 Por que é o caminho preferencial futuro

Channels é a função oficial do Claude Code criada para permitir que sistemas externos enviem eventos para uma sessão Claude Code já aberta. A documentação oficial de 2026-09-17 descreve Channels como:

- um servidor MCP capaz de **push** para a sessão;
- mecanismo bidirecional;
- capaz de receber mensagem externa e permitir resposta pelo mesmo canal;
- apropriado a cenários de “chat bridge”;
- utilizável com autenticação Anthropic via `claude.ai` ou Console API key;
- disponível a usuários Pro/Max sem controles organizacionais adicionais, com opt-in por sessão;
- sujeito a controles adicionais em Team/Enterprise.

O desenho-alvo CEVRA é:

```text
CEVRA Desktop
    ↓ mensagem/AgentTaskRequest
CEVRA Channel
    ↓
Claude Code oficial já autenticado
    ↓
CEVRA Skill orienta processo/protocolo
    ↓
CEVRA MCP fornece somente ferramentas/evidências permitidas
    ↓
Claude produz EvidenceRequest / EditorialPlanCandidate
    ↓
CEVRA Channel / CEVRA MCP submit_plan
    ↓
CEVRA validator
    ↓
Change Set
```

## 4.2 Papéis separados

### Channels
Responsável prioritariamente por **transporte bidirecional / início da conversa / retorno**.

### CEVRA Skill
Responsável por ensinar ao Claude Code:

- o `CEVRA Agent Protocol`;
- regras editoriais;
- estrutura dos outputs;
- quando pedir evidência;
- proibições de bypass;
- semântica de intents CEVRA.

A Skill é instrução/procedimento, não autenticação nem transporte.

### CEVRA MCP
Responsável por oferecer interfaces estreitas como, conceitualmente:

```text
get_context(...)
get_evidence(...)
get_capabilities(...)
submit_editorial_plan(...)
```

O MCP não deve oferecer filesystem genérico, shell genérico, raw engine access ou escrita direta de Project IR.

## 4.3 Por que Channels é melhor que MCP isolado

MCP padrão funciona principalmente no sentido:

```text
Claude já está executando uma tarefa
→ Claude consulta sistema externo
```

Channels cobre a lacuna:

```text
sistema externo
→ empurra evento/mensagem para Claude Code já aberto
```

Portanto, se amadurecer e for oficialmente liberado para o caso CEVRA, Channels é mais adequado para a experiência:

```text
usuário inicia no CEVRA
→ CEVRA aciona Claude
→ Claude devolve resultado ao CEVRA
```

## 4.4 Bloqueio atual

Em 2026-09-17 Channels continua **Research Preview**.

A documentação alerta que:

- disponibilidade ainda está em rollout;
- sintaxe `--channels` pode mudar;
- contrato do protocolo pode mudar;
- durante preview, `--channels` aceita somente plugins no allowlist efetivo Anthropic/organização;
- plugins customizados em desenvolvimento usam `--dangerously-load-development-channels`;
- custom CEVRA Channel não deve ser tratado como produção enquanto depender desse modo de desenvolvimento.

Portanto:

> **Projetar para Channels; não implementar dependência de produção agora.**

Antes da implementação Claude real, o status deve ser rechecado oficialmente.

## 4.5 Gate de promoção para prioridade máxima

Channels só vira caminho Claude principal de produção se, no marco de implementação:

1. deixar de depender de mecanismo explicitamente experimental para custom plugin CEVRA, **ou** existir processo oficial de distribuição/allowlist apropriado ao CEVRA;
2. a Anthropic permitir claramente esse padrão para produto terceiro;
3. autenticação/billing do usuário estiver clara;
4. a sessão puder ser iniciada/mantida de forma aceitável para usuário leigo;
5. o retorno estruturado puder ser validado pelo CEVRA;
6. o CEVRA Channel puder operar sem abrir superfície de rede desnecessária;
7. pairing/auth/allowlist protegerem origem das mensagens;
8. nenhum workaround for usado para desviar cobrança ou identidade do cliente.

Se qualquer ponto material continuar incerto, retornar ao product owner antes de adoção.

---

# 5. Caminho B — Claude Code oficial + CEVRA Skill + MCP

Este é o fallback oficial preferido caso Channels ainda não esteja pronto.

Fluxo-base:

```text
usuário entra no Claude Code oficial
→ CEVRA Skill é invocada
→ Claude acessa CEVRA MCP autorizado
→ obtém contexto/evidência
→ produz plano
→ chama submit_editorial_plan
→ CEVRA valida
```

## 5.1 Vantagens

- Claude Code é ambiente oficial da Anthropic;
- Pro/Max podem autenticar Claude Code com a própria assinatura;
- Team/Enterprise também têm caminhos oficiais conforme o plano;
- Skills são mecanismo oficial;
- MCP local `stdio`, remote HTTP/SSE/WebSocket são oficialmente suportados;
- CEVRA pode expor ferramentas pequenas e autorizadas;
- evita dar ao modelo controle direto da arquitetura CEVRA;
- pode reutilizar o futuro produto CEVRA Skill.

## 5.2 Limitação de UX

Este caminho tende a exigir que o usuário:

- tenha Claude Code instalado/autenticado;
- esteja em sessão adequada;
- inicie ou participe do fluxo pelo Claude Code.

Isso é inferior ao fluxo “clicar dentro do CEVRA e receber o resultado” para o usuário leigo.

Por isso o caminho B é fallback da família Claude Code, não o alvo ideal de UX.

## 5.3 Requisitos

- instalação da Skill somente com autorização explícita do usuário;
- manifest/hash/proveniência/rollback da Skill;
- MCP com least privilege;
- nenhum servidor MCP ganha mutação audiovisual direta;
- `submit_editorial_plan` recebe somente protocolo CEVRA validável;
- nenhuma configuração do usuário, skill alheia ou credencial pode ser sobrescrita;
- CEVRA continua funcional sem Claude Code.

---

# 6. Caminho C — autorização formal da Anthropic para integração mais direta da assinatura

CEVRA manterá explicitamente aberta a possibilidade de solicitar à Anthropic autorização para uma integração mais direta baseada em conta/entitlement Claude.

Objetivo possível:

```text
CEVRA
→ login/autorização Claude oficialmente aprovado
→ Claude
→ protocolo CEVRA
```

Isso poderia eliminar a necessidade de o usuário entender API e talvez eliminar a dependência operacional de uma sessão Claude Code aberta.

## 6.1 Estado atual

A documentação oficial de autenticação da Anthropic em 2026-09-17 diz que:

- uso incluído em planos de assinatura é desenhado principalmente para aplicações nativas Anthropic e Claude Code;
- para desenvolvedores construindo produto/aplicação/ferramenta para outros usuários, a orientação oficial é usar autenticação por API key/Claude Console ou cloud provider suportado;
- ferramentas de terceiros podem, a critério da Anthropic, ser permitidas com contas pagas/usage credits;
- Anthropic pode cobrar o uso de ferramentas de terceiros dos usage credits, em vez dos limites inclusos da assinatura;
- apps que se identificam falsamente ou tentam rotear tráfego terceiro contra limites de assinatura são proibidos.

Também há documentação oficial recente indicando que a Anthropic está ajustando o modelo de uso de `Claude Agent SDK`, `claude -p` e apps terceiros com assinaturas; em 2026-06-15 uma mudança planejada foi pausada, e a página atual registra que, enquanto pausada, Agent SDK / `claude -p` / third-party app usage ainda consomem limites da assinatura, mas a própria Anthropic afirma estar trabalhando em um modelo atualizado.

Portanto esta área está em evolução e **não deve ser congelada hoje como impossível nem tratada como direito garantido**.

## 6.2 Decisão

- manter caminho aberto;
- buscar autorização/clareza formal no momento apropriado;
- não fazer V1 depender de resposta positiva;
- não implementar workaround enquanto não houver permissão oficial suficiente;
- revalidar termos e documentação imediatamente antes de qualquer release que use esse modo.

---

# 7. Caminho D — BYOK Claude API

BYOK é opção aprovada e deve ser considerada um fallback real, não apenas solução de laboratório.

Fluxo:

```text
usuário avançado
→ fornece sua própria Anthropic API key
→ CEVRA Claude Adapter
→ Claude Messages API
→ structured output
→ CEVRA validator
```

## 7.1 UX e transparência obrigatórias

A interface deve deixar explícito que:

- cobrança da Anthropic é separada da assinatura CEVRA;
- consumo/cobrança são responsabilidade da conta Anthropic do usuário;
- assinatura Claude Pro/Max não equivale automaticamente a créditos da API;
- CEVRA não ativa billing/auto-recharge silenciosamente;
- chave é armazenada em secure storage do SO, nunca no Project IR, preset, log comum ou arquivo do projeto;
- o usuário pode desconectar/remover credencial;
- falha de crédito/billing não degrada para outro modo pago silenciosamente.

## 7.2 Por que BYOK vem antes da API gerenciada pelo CEVRA

BYOK evita, inicialmente:

- backend de billing do CEVRA;
- proxy central de inferência;
- segredo Anthropic central;
- controle de abuso/fraude;
- quota por usuário;
- reconciliação financeira de tokens;
- capital/risco operacional de pagar API em nome de terceiros.

É mais complexo para o usuário leigo, mas muito mais simples para a empresa e atende usuários avançados.

## 7.3 API direta como tecnologia

Claude API é adequada ao protocolo CEVRA porque suporta structured outputs/JSON Schema e streaming. A resposta permanece proposta não confiável até validação CEVRA.

---

# 8. Caminho E — CEVRA-managed Claude API

Arquitetura **aprovada como opção futura**, porém explicitamente **fora da V1 inicial**.

Objetivo de UX:

```text
usuário
→ CEVRA account
→ usar IA
→ CEVRA gerencia provider/cobrança
```

sem exigir Anthropic Console/API key.

## 8.1 Por que é útil no futuro

- melhor UX para leigos;
- permite plano CEVRA com créditos/franquia;
- CEVRA controla escolha de modelo/roteamento/fallback autorizado;
- pode centralizar otimização de cache e custo;
- evita configuração técnica individual.

## 8.2 Por que não fazer agora

Exigiria infraestrutura significativa:

```text
CEVRA Desktop
→ autenticação CEVRA
→ CEVRA Cloud Gateway
→ quota/rate limits
→ metering
→ billing/entitlements
→ fraude/abuso
→ observabilidade
→ Anthropic API
```

Além de:

- segurança de segredo central;
- proteção contra uso abusivo;
- conciliação de custos;
- política de retenção/logs;
- disponibilidade/SLA;
- compliance/privacidade;
- suporte e estornos;
- limites por usuário/plano;
- risco de custo imprevisível.

Para uma opção secundária da V1, o custo de engenharia/operação é desproporcional.

## 8.3 Decisão de fase

- registrar arquitetura;
- não implementar agora;
- revisitar quando uso real, pricing e modelo comercial justificarem;
- BYOK deve estar disponível antes desta opção se Claude API entrar na V1.

---

# 9. Custos estimados da Claude API e implicações

A análise anterior estimou que, usando o desenho CEVRA de contexto compacto — transcrição local, poucas evidências visuais, 1–3 rodadas e plano estruturado — uma edição típica pode custar apenas centavos de dólar, dependendo de modelo/contexto/tamanho da resposta.

Essa estimativa **não é SLA nem benchmark real**.

O PoC deve medir por vídeo representativo:

- input tokens;
- output tokens;
- cache writes/hits se usados;
- quantidade de EvidenceRequests;
- quantidade/resolução de frames;
- latência;
- custo do modelo exato;
- custo de retries/falhas;
- custo por minuto de vídeo e por projeto;
- p50/p95 do custo.

Mesmo que custo unitário seja baixo, isso não altera a decisão de adiar o caminho gerenciado: a complexidade operacional é o problema principal neste estágio.

---

# 10. `claude -p` / Agent SDK / headless

Tecnicamente, Claude Code possui uso programático/headless, formatos JSON/stream-json, sessões e opções estruturadas suficientes para criar bridges.

Há projetos open source demonstrando bridges, UIs, daemons e acesso remoto ao Claude Code.

Entretanto, **possibilidade técnica não equivale a permissão comercial**.

## 10.1 Regra aprovada

`claude -p`, Agent SDK ou outra interface programática só poderá virar backend CEVRA usando autenticação por assinatura quando:

- a documentação/termos permitirem claramente o caso do CEVRA; ou
- houver autorização formal suficiente da Anthropic.

Não será usado para imitar cliente oficial, mascarar identidade ou forçar consumo contra limites da assinatura.

---

# 11. Caminhos explicitamente proibidos

CEVRA não adotará:

- captura/reuso de cookies ou tokens privados de claude.ai fora de mecanismos oficialmente suportados;
- automação oculta da UI web para fingir integração;
- reverse engineering de protocolo privado para usar entitlement;
- PTY/tmux/harness desenhado especificamente para parecer sessão humana e contornar billing/política;
- falsificação de user-agent/identidade do cliente;
- uso silencioso de API quando usuário acredita estar usando assinatura;
- uso silencioso de usage credits adicionais;
- armazenamento de API key no projeto ou em logs comuns;
- Claude com acesso direto ao Media Runtime/Project IR;
- shell/filesystem irrestrito como condição para inteligência editorial.

Essas proibições permanecem mesmo que um projeto open source demonstre que o workaround “funciona”.

---

# 12. Evidence loop em Claude

Todos os caminhos devem preservar:

```text
AgentTaskRequest
→ Claude
→ EvidenceRequest
→ CEVRA valida/autoriza
→ EvidenceResponse
→ Claude
→ EditorialPlanCandidate
```

No caminho Skill/MCP, Claude pode chamar ferramentas estreitas de evidência.

No caminho API, CEVRA conduz os turns explicitamente.

No caminho Channels, o canal deve transportar a solicitação/resultado, enquanto Skill/MCP continua cuidando da semântica e das evidências.

Nenhum caminho concede browse arbitrário no computador por padrão.

---

# 13. Sessões e estado

Claude session IDs / Code session IDs / channel IDs / MCP tool-call IDs são metadados de adapter/sessão.

Eles não são Project IR.

CEVRA continua dono de:

- project identity;
- projectRevision;
- evidence digests;
- requestId;
- planId;
- changeSetId;
- status de aplicação.

Perder uma sessão Claude não pode perder nem corromper o estado audiovisual canônico.

---

# 14. Privacidade

Aplicam-se as regras da Decisão 1:

- enviar somente contexto/evidência necessária;
- vídeo integral não é enviado por padrão;
- frames/clips devem ser mínimos e justificáveis;
- segredos e paths locais desnecessários não saem;
- provider/modo de uso deve ser compreensível ao usuário;
- política de retenção/training da Anthropic deve ser revalidada por modo de autenticação/plano no release gate;
- logs CEVRA não devem persistir payload sensível indiscriminadamente.

---

# 15. UX prevista

A UX futura poderá oferecer, conforme disponibilidade real:

```text
Claude

[ Usar Claude Code / minha assinatura ]
    → somente se mecanismo oficial compatível estiver disponível

[ Usar minha API Anthropic ]
    → BYOK
    → aviso de cobrança separada

[ Usar Claude pelo CEVRA ]
    → futuro; somente quando CEVRA-managed API existir
```

Não mostrar opção que o ambiente atual não suporta.

O CEVRA deve detectar capabilities reais, não apresentar um botão impossível.

---

# 16. Gates antes de implementar Claude

Antes de qualquer implementação dependente, revalidar oficialmente:

1. status de Channels;
2. possibilidade de custom CEVRA Channel em produção;
3. regras de Pro/Max/Team/Enterprise;
4. regras para third-party tools/apps;
5. efeito de usage credits/bundles;
6. Agent SDK / `claude -p` policy vigente;
7. API pricing/model availability;
8. commercial/consumer terms;
9. licença das bibliotecas distribuídas;
10. armazenamento/retorno de sessões;
11. segurança de MCP/Channel;
12. structured output do modelo escolhido.

Mudança material volta ao product owner antes da implementação.

---

# 17. PoCs futuros

## PoC Claude A — Channel, somente quando elegível

Provar:

```text
CEVRA
→ custom CEVRA Channel oficial
→ Claude Code autenticado
→ CEVRA Skill/MCP
→ EvidenceRequest
→ EvidenceResponse
→ EditorialPlanCandidate
→ CEVRA
```

Medir:

- onboarding;
- necessidade de sessão aberta/background;
- autenticação;
- billing/usage bucket real;
- latency;
- disconnect/reconnect;
- late response;
- pairing/security;
- structured-plan reliability;
- facilidade para usuário não técnico.

## PoC Claude B — Skill/MCP

Provar fluxo iniciado no Claude Code e submissão de plano ao CEVRA sem acesso arbitrário.

## PoC Claude C — BYOK API

Provar mesmo schema da Decisão 1 via Claude API e comparar com Codex:

- schema compliance;
- evidence loop;
- tokens;
- custo;
- latency;
- qualidade editorial;
- stale/duplicate/cancel behavior.

---

# 18. Critérios de aceite

A integração Claude só é considerada fechada quando o modo escolhido demonstrar:

1. mecanismo oficialmente permitido para o produto CEVRA;
2. autenticação transparente;
3. billing transparente;
4. nenhum desvio oculto da assinatura para API/credits;
5. mesmo `CEVRA Agent Protocol` do Codex;
6. `EditorialPlanCandidate` estruturado;
7. evidence loop delimitado;
8. stale-state protegido;
9. idempotência protegida;
10. cancelamento/late-response protegido;
11. nenhum acesso direto ao audiovisual canônico;
12. segurança de credenciais;
13. funcionamento sem Claude permanece válido;
14. custo e latência medidos em projetos reais;
15. UX aceitável para o perfil de usuário do CEVRA.

---

# 19. Classificação atual

| Caminho | Técnica | Produto/comercial | Situação |
|---|---|---|---|
| Channels + Skill/MCP | VERDE como capacidade oficial | AMARELO enquanto custom Channels estiver Research Preview/allowlist restrito | Preferencial futuro |
| Skill + MCP dentro do Claude Code oficial | VERDE | AMARELO favorável; UX/fluxo e termos exatos a provar | Fallback de assinatura |
| Autorização Anthropic para integração direta | NÃO COMPROVADO | depende de aprovação externa | manter aberta |
| BYOK Claude API | VERDE | VERDE com cobrança separada/transparente | fallback implementável |
| CEVRA-managed API | VERDE conceitualmente | AMARELO por custo/infra/ops | futuro, fora da V1 inicial |
| `claude -p`/Agent SDK com assinatura em produto terceiro | VERDE técnico | AMARELO/condicionado à política vigente | não adotar sem clareza formal |
| PTY/tmux/reverse engineering para contornar billing | possível tecnicamente | VERMELHO estratégico | proibido |

---

# 20. Decisão consolidada aprovada

> O CEVRA manterá Claude como segundo provider estratégico sob o mesmo protocolo provider-neutral da Decisão 1. A prioridade futura será usar Claude Code por um mecanismo oficial de comunicação bidirecional baseado em **Channels + CEVRA Skill + MCP** se, no marco de implementação, Channels estiver suficientemente estável e oficialmente disponível para um custom CEVRA Channel em produção. Enquanto Channels não atingir esse gate, o fallback preferencial será **Claude Code oficial + CEVRA Skill + MCP**, com fluxo compatível com as políticas da Anthropic. O CEVRA manterá aberta e poderá buscar formalmente autorização da Anthropic para uma integração mais direta baseada em conta/entitlement Claude, mas a V1 não dependerá dessa autorização. **BYOK Claude API** será uma opção real e virá antes de infraestrutura própria: a interface deverá informar claramente que API é cobrada separadamente pela Anthropic e é responsabilidade do usuário. Uma futura **CEVRA-managed Claude API** continuará prevista para melhorar a experiência de usuários leigos, mas sua implementação fica explicitamente diferida para depois da V1 inicial por exigir backend, billing, quotas, fraude/abuso, segurança e operação cloud desproporcionais ao estágio atual. Nenhum caminho poderá falsificar identidade, reutilizar credenciais privadas, automatizar interfaces privadas ou usar PTY/tmux/reverse engineering para contornar limites, billing ou termos. Todas as variantes Claude devem convergir para `EvidenceRequest`/`EditorialPlanCandidate`, ser validadas pelo CEVRA e jamais executar diretamente Project IR, Media Runtime, FFmpeg ou código arbitrário.

---

# 21. Fontes oficiais verificadas em 2026-09-17

- Claude Code Channels: `https://code.claude.com/docs/en/channels`
- Claude Code MCP: `https://code.claude.com/docs/en/mcp`
- Claude Code Skills: `https://code.claude.com/docs/pt/skills`
- Programmatic/headless Claude Code: `https://code.claude.com/docs/en/headless`
- Claude Code CLI reference: `https://code.claude.com/docs/en/cli-reference`
- Claude account / third-party authentication guidance: `https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account`
- Claude Agent SDK + Claude plan policy update: `https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan`
- Pro/Max Claude Code authentication: `https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan`
- Usage credits: `https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans`
- Usage bundles / third-party products: `https://support.claude.com/en/articles/14246112-buy-usage-bundles`

These URLs document current provider behavior only. Provider policy is time-sensitive and must be rechecked at implementation/release gates.

---

# 22. Impacto no planejamento atual

- Nenhuma mudança imediata do Media Runtime.
- Nenhuma implementação Claude agora.
- Nenhuma conta/API/billing criada agora.
- Nenhum CEVRA Cloud Gateway entra na V1 inicial por causa desta decisão.
- Channels deve ser acompanhado e reavaliado antes da implementação Claude.
- BYOK permanece o caminho API de menor complexidade operacional.
- OpenAI/Codex continua primeiro PoC real do protocolo; Claude será a segunda prova importante de que o contrato é realmente provider-neutral.
