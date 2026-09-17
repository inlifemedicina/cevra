# CEVRA — Decisão de Integração 2: OpenAI / Codex

**Data da decisão:** 2026-09-17.
**Status:** DIREÇÃO DE INTEGRAÇÃO APROVADA PELO PRODUCT OWNER; IMPLEMENTAÇÃO E PROOF OF CONCEPT AINDA NÃO AUTORIZADOS POR ESTE REGISTRO.
**Prioridade:** A — CRÍTICO PARA A V1, como primeiro caminho de prova real do protocolo CEVRA ↔ agente.
**Relação com a Decisão 1:** este documento especializa o provider OpenAI/Codex sem alterar o protocolo provider-neutral aprovado em `docs/CEVRA_EXTERNAL_INTEGRATION_DECISIONS.md`.
**Gate atual:** o gate coordenado do Media Runtime permanece inalterado. Nenhuma operação MR, modelo, conta, download, cobrança, autenticação ou execução é autorizada por esta decisão documental.

---

## 1. Decisão consolidada

O primeiro provider a ser usado na futura prova obrigatória de ida e volta do CEVRA será **OpenAI Codex**, tendo como caminho preferencial o **Codex App Server oficial** executado localmente e controlado pelo CEVRA, com transporte local por `stdio`/JSON-RPC e autenticação preferencial pelo **login ChatGPT do próprio usuário** quando o plano/workspace efetivamente conceder acesso ao Codex.

A hierarquia aprovada é:

```text
1. Codex App Server + login ChatGPT / entitlement do usuário
   → caminho preferencial

2. Codex App Server + API key do usuário
   → BYOK opcional, com cobrança separada da API

3. mecanismos corporativos oficiais compatíveis
   → futuros/opcionais conforme workspace e política

4. ausência de OpenAI/Codex
   → CEVRA continua funcional nas capacidades locais/manuais/presets suportadas
```

O login ChatGPT é preferido porque o objetivo econômico do produto é evitar tornar uma API paga por chamada obrigatória para a inteligência editorial quando existir um mecanismo oficial adequado coberto pelo acesso do usuário. Isso não significa que todo plano ChatGPT, workspace, país, modelo ou capacidade possuirá o mesmo entitlement, nem que o CEVRA prometerá acesso universal.

API key permanece suportável como **opção BYOK**, não como requisito da V1 e não como fallback silencioso. O usuário nunca será migrado automaticamente de consumo incluído na assinatura para cobrança de API.

---

## 2. Evidência oficial revalidada em 2026-09-17

A decisão foi revalidada contra documentação oficial atual da OpenAI, não apenas contra conversas anteriores.

### 2.1 App Server é mecanismo oficial para produto próprio

A documentação oficial descreve o Codex App Server como mecanismo para **embutir Codex em um produto** e construir clientes personalizados que tratam autenticação, histórico de conversa, approvals e eventos de agente em streaming.

Referência oficial:

- `https://developers.openai.com/codex/app-server`
- redirecionamento atual consultado: `https://learn.chatgpt.com/docs/app-server`

### 2.2 Formas oficiais de autenticação

A documentação oficial distingue explicitamente:

- **Sign in with ChatGPT** para acesso por assinatura;
- **API key** para acesso usage-based.

Com API key, o consumo segue o billing da OpenAI Platform e preços de API; isso é separado do acesso incluído em planos ChatGPT. O App Server expõe fluxos `account/login/start` para `chatgpt`, `chatgptDeviceCode` e `apiKey`, além de eventos de conclusão/atualização de conta.

Referência oficial:

- `https://developers.openai.com/codex/auth`
- redirecionamento atual consultado: `https://learn.chatgpt.com/docs/auth`

### 2.3 Estrutura, threads, eventos e cancelamento

O App Server possui oficialmente:

- `thread/start`;
- `thread/resume`;
- histórico/thread state;
- turns;
- eventos em streaming;
- `turn/interrupt` para cancelamento;
- `outputSchema` em turn para resposta estruturada;
- leitura de rate limits ChatGPT por `account/rateLimits/read` quando disponível;
- identificação de auth mode e `planType` quando fornecidos pelo mecanismo.

Dynamic tools e algumas superfícies adicionais permanecem experimentais e não entram como requisito desta decisão.

### 2.4 SDK

O Codex SDK também existe oficialmente, mas a documentação recomenda o App Server para **custom clients** que precisam de autenticação, histórico, approvals e eventos. O SDK permanece elegível para automações/jobs e pode ser reavaliado se oferecer vantagem concreta, mas não é o caminho principal aprovado para o CEVRA Vids nesta fase.

Referência oficial:

- `https://developers.openai.com/codex/sdk`
- redirecionamento atual consultado: `https://learn.chatgpt.com/docs/codex-sdk`

### 2.5 Licença do código aberto

Na consulta de 2026-09-17, o repositório oficial `openai/codex` e o workspace Rust que contém `codex-app-server` declaram licença **Apache-2.0**.

Referência:

- `https://github.com/openai/codex`
- `https://github.com/openai/codex/blob/main/LICENSE`

Isso é evidência favorável para eventual uso/redistribuição de código/binário sujeito às obrigações da licença, mas **não congela a versão futura escolhida, não audita dependências transitivas e não equivale aos termos do serviço OpenAI**. A versão exata incorporada deverá ter provenance, license/NOTICE e dependências auditadas no marco de packaging/release.

---

## 3. Objetivo da integração

Permitir que CEVRA Vids use Codex como **agente/modelo editorial externo oficialmente conectado** para tarefas de raciocínio sem conceder ao Codex autoridade direta sobre o estado audiovisual, motores ou computador do usuário.

O Codex poderá:

- receber `AgentTaskRequest` e contexto/evidências CEVRA delimitados;
- interpretar conteúdo e intenção dentro do escopo autorizado;
- pedir evidência adicional pelo protocolo CEVRA;
- devolver `EditorialPlanCandidate` aderente ao schema CEVRA;
- manter continuidade da conversa por thread enquanto válida;
- fornecer metadados de provider/usage suportados pelo mecanismo oficial.

O Codex não será autoridade para:

- escrever Project IR diretamente;
- aplicar ProjectHistory diretamente;
- decidir que um plano foi validado;
- executar FFmpeg/Media Runtime/Composition Engine diretamente;
- enviar shell/Python/TSX/filtergraph como mutação;
- acessar mídia/arquivos fora do que o CEVRA autorizou;
- iniciar pagamento, compra, publicação ou upload fora do escopo concedido.

---

## 4. Direção da comunicação

A integração é **bidirecional**, porém controlada pelo CEVRA.

```text
CEVRA
→ inicia/continua uma solicitação autorizada
→ envia contexto/evidência
→ Codex App Server
→ serviço OpenAI

Codex
→ retorna evento/proposta estruturada
OU
→ solicita evidência adicional no CEVRA Agent Protocol

CEVRA
→ valida a solicitação de evidência
→ prepara somente o permitido
→ envia EvidenceResponse em novo turn da mesma sessão/thread

Codex
→ EditorialPlanCandidate
→ CEVRA Validator
→ Change Set
→ aprovação/autonomia permitida
→ compilador determinístico
→ comandos CEVRA
→ ProjectHistory / Project IR
```

A bidirecionalidade de evidência não significa que Codex recebe uma ferramenta genérica para explorar a máquina. Inicialmente, o loop é dirigido pelo protocolo e pelos turns; CEVRA escolhe e entrega cada evidência aprovada.

---

## 5. Transporte aprovado como candidato principal

### 5.1 Local entre CEVRA e App Server

**Preferência aprovada:** transporte local por `stdio` com protocolo JSON-RPC/JSONL do App Server.

Razões:

- evita introduzir listener TCP/HTTP/WebSocket de entrada no CEVRA apenas para esta integração;
- combina com a filosofia de processos privados supervisionados já adotada no Desktop Host;
- reduz superfície de rede local;
- permite lifecycle explícito do processo;
- permite que o adapter CEVRA traduza eventos do provider para o protocolo CEVRA.

O App Server é infraestrutura do provider. Ele **não vira segundo Desktop Host, segundo Media Runtime ou fonte de estado audiovisual**.

### 5.2 Internet

A comunicação do App Server com a OpenAI usa internet e autenticação OpenAI. Essa saída precisa ser tratada como integração remota real: estado online/offline, timeouts, dados enviados, políticas do workspace e falhas precisam ser expostos de forma honesta.

---

## 6. Autenticação e ownership das credenciais

### 6.1 Caminho preferencial — ChatGPT

O usuário inicia o login por fluxo oficial do App Server. O CEVRA pode apresentar/abrir o fluxo oficial de autenticação e acompanhar os eventos de conclusão.

O CEVRA **não captura senha**, não automatiza `chatgpt.com`, não extrai cookies e não imita login de navegador.

Credenciais/tokens gerenciados pelo Codex/OpenAI não entram em:

- Project IR;
- ProjectHistory;
- presets;
- arquivos de projeto;
- logs normais;
- prompts enviados ao modelo.

Se o mecanismo exigir armazenamento local, usar o mecanismo oficial/seguro compatível com a versão e a política do sistema; detalhes finais pertencem à implementação e auditoria de segurança.

### 6.2 API key BYOK

É opcional. Se habilitada:

- o usuário fornece sua própria chave por UI/fluxo seguro;
- CEVRA informa claramente que é cobrança de API separada;
- chave não entra no projeto ou repositório;
- nunca ocorre troca automática de ChatGPT entitlement para API key;
- falha de quota/entitlement do ChatGPT não autoriza cobrar API sem consentimento explícito.

### 6.3 Workspaces gerenciados

Business/Enterprise/Edu podem possuir permissões, RBAC, retenção, residência, políticas locais, access tokens e restrições administradas próprias. O adapter deve respeitar o que o mecanismo oficial reportar e falhar fechadamente quando o workspace não permitir o uso.

Não hardcode uma matriz eterna de planos. Capability/entitlement são verificados no momento adequado através de mecanismos oficiais.

---

## 7. Quem paga

### 7.1 Login ChatGPT

O objetivo é usar o **acesso Codex concedido pelo plano/workspace do próprio usuário**, sujeito a disponibilidade, limites e termos aplicáveis.

CEVRA não promete chamadas ilimitadas nem converte essa disponibilidade em obrigação contratual da OpenAI.

### 7.2 API key

O usuário paga diretamente à OpenAI Platform pelo uso da chave própria segundo os preços e limites vigentes. CEVRA não absorve nem oculta esse consumo por padrão.

### 7.3 Política obrigatória

Nunca:

- mudar método de billing silenciosamente;
- gastar API porque o entitlement ChatGPT acabou;
- comprar créditos;
- selecionar outro provider pago para “terminar” uma operação sem autorização.

---

## 8. Dados que saem do computador

O princípio é **mínimo necessário**.

Podem sair, conforme tarefa e autorização:

- brief/pedido;
- contexto editorial compacto;
- transcrição ou trechos relevantes;
- referências CEVRA abstratas/IDs não sensíveis;
- frames selecionados;
- imagens/evidências visuais necessárias;
- medições acústicas/visuais relevantes;
- pequenos trechos de mídia se um futuro caminho comprovado exigir e houver autorização específica.

Não saem por padrão:

- vídeo inteiro;
- todos os frames;
- todo o Project IR;
- snapshots/history completos;
- caminhos locais desnecessários;
- credenciais/tokens;
- arquivos não relacionados;
- qualquer conteúdo simplesmente porque está acessível no filesystem.

Se futuramente uma tarefa precisar do vídeo inteiro, isso será uma decisão/permission boundary própria, não extensão implícita desta aprovação.

---

## 9. O que volta e como volta

O retorno executável esperado é **CEVRA Agent Protocol**, não prosa livre.

O App Server suporta `outputSchema`, e o CEVRA deverá utilizá-lo quando tecnicamente adequado para exigir uma das formas permitidas, por exemplo:

```text
EvidenceRequest
OU
EditorialPlanCandidate
```

Isso complementa, mas não substitui, validação própria do CEVRA.

Uma resposta que passe pelo schema do provider ainda é **untrusted candidate**. O CEVRA valida novamente:

- versão do protocolo;
- tipo;
- campos;
- referências;
- digests;
- stale-state;
- permissões;
- capabilities;
- limites;
- compilabilidade determinística.

`rationale`/texto explicativo permanece não executável.

---

## 10. Evidence loop

### 10.1 V1 preferida

Não tornar MCP obrigatório para o primeiro caminho.

Usar turns estruturados na thread:

```text
Turn N:
CEVRA → contexto
Codex → EvidenceRequest

Turn N+1:
CEVRA → EvidenceResponse
Codex → EditorialPlanCandidate
```

Benefícios:

- reduz privilégio;
- preserva auditoria;
- CEVRA controla o que sai;
- não exige filesystem genérico;
- não acopla a V1 a dynamic tools experimentais;
- facilita reproduzir o mesmo protocolo em Claude/local/futuros providers.

### 10.2 MCP/tools futuros

MCP e tool calling podem ser avaliados depois quando trouxerem benefício concreto. Qualquer ferramenta deverá ser estreita, tipada, capability-gated e sem bypass do protocolo/commands. Dynamic tools experimentais não são fundação da V1.

---

## 11. Continuidade de sessão

O App Server possui thread lifecycle oficial (`thread/start`, `thread/resume` e operações relacionadas). A integração pode mapear:

```text
CEVRA Agent Session
↔ providerSessionMetadata
   ↔ Codex threadId
```

`threadId` e demais IDs OpenAI:

- ficam no adapter/session/audit boundary;
- não entram como identidade canônica do projeto;
- não viram campo necessário do Project IR;
- podem ser descartados/recriados conforme política sem comprometer o projeto.

Se uma thread não puder ser retomada, o CEVRA deve poder iniciar outra usando seu próprio contexto canônico; continuidade OpenAI não pode ser a única memória do projeto.

---

## 12. Streaming e eventos

Streaming é permitido para:

- status;
- progresso;
- mensagens de provider;
- rationale seguro;
- atualização de UI.

Streaming **não autoriza aplicação audiovisual incremental**.

Somente um `EvidenceRequest` completo ou `EditorialPlanCandidate` completo, validado pelo CEVRA, pode avançar para etapas posteriores, salvo futura decisão explícita sobre planos incrementais atômicos.

---

## 13. Cancelamento e timeout

O App Server oferece `turn/interrupt`; isso será o mecanismo candidato para interromper inferência em andamento.

CEVRA ainda precisa manter seu próprio estado:

- `requested`;
- `in_progress`;
- `cancel_requested`;
- `interrupted`;
- `completed`;
- `failed`;
- `timed_out`;
- `stale`;
- `outcome_unknown`, quando aplicável.

Uma resposta que chegue depois de cancelamento/timeout nunca aplica mutação automaticamente.

Cancelar a inferência OpenAI é diferente de cancelar execução local CEVRA. O segundo só existe depois de um Change Set autorizado entrar na aplicação.

---

## 14. Retry, duplicação e resposta atrasada

Retry pertence ao adapter/Director, preservando a Decisão 1.

Regras:

- não repetir automaticamente operação que possa ter cobrança/outcome remoto incerto sem reconciliar quando possível;
- uma resposta duplicada com mesmo request/plan identity não gera Change Set duplicado;
- `threadId` não substitui `requestId`, `planId` e identidades CEVRA;
- late response passa novamente por stale-state/digest checks;
- reconexão não implica replay automático;
- falha do provider não corrompe Project IR, porque nenhuma resposta externa é mutação canônica.

---

## 15. Limits, quotas e capability discovery

O App Server atual expõe `account/rateLimits/read` para sessões ChatGPT e eventos de atualização quando suportados. O adapter pode aproveitar essa informação como capability/usage evidence oficial.

O CEVRA não pergunta ao modelo qual plano/quota o usuário possui e não faz scraping de interface.

Quando uma informação não for retornada pelo mecanismo oficial, ela permanece `unknown`.

Os limites concretos de:

- rounds;
- tokens/contexto;
- tamanho de resposta;
- frames/bytes;
- timeout;
- concorrência;
- retry;
- orçamento API opcional

serão definidos por medição/PoC e configuração de produto, não inventados nesta decisão.

---

## 16. Segurança local — requisito crítico

Codex foi desenhado como agente capaz de usar ferramentas locais; essa capacidade **não é necessária para o papel editorial que estamos dando a ele no CEVRA**.

Portanto o perfil CEVRA deve ser mais restritivo que o uso típico de coding agent.

### 16.1 Direção aprovada

- não expor `command/exec` do App Server através do adapter CEVRA;
- não usar `process/*` experimental;
- não conceder `danger-full-access`;
- não depender de aprovação em prompt como barreira de segurança;
- preferir configuração em que `features.shell_tool = false` quando suportado pela versão selecionada;
- desabilitar network para comandos locais quando não necessário;
- não habilitar browser/computer-use/apps/MCP locais por padrão para a função editorial;
- usar filesystem mínimo/isolado ou nenhum conteúdo de projeto diretamente acessível pelo agente além da evidência explicitamente preparada;
- não usar o diretório real do projeto audiovisual como workspace livre do Codex.

### 16.2 Situação atual

A documentação oficial atual mostra:

- `features.shell_tool` configurável;
- perfis `:read-only`, `:workspace`, `:danger-full-access` e perfis customizados;
- controle de filesystem e network;
- `command/exec` e `process/*` como APIs separadas;
- `process/*` experimental e fora do sandbox.

Isso torna a contenção **plausível e oficialmente configurável**, mas ainda não é prova de que a versão exata empacotada pelo CEVRA, nas plataformas suportadas, satisfaça nossa exigência sem regressões/escape.

### 16.3 Gate obrigatório do PoC

Antes de classificar o caminho de execução como VERDE para release, provar que no perfil CEVRA:

1. o agente não possui shell tool utilizável;
2. o adapter não chama `command/exec`;
3. `process/*` não está habilitado;
4. filesystem fora do workspace/evidência autorizada não é acessível;
5. escrita arbitrária não é possível;
6. network de comandos locais não oferece acesso aberto;
7. navegador/computer use/MCP/apps não aparecem como escape implícito;
8. nenhum prompt consegue ampliar essas permissões;
9. a política continua válida após restart/resume de thread;
10. macOS/Windows suportados mantêm a propriedade relevante.

Falha em qualquer ponto retorna para decisão antes de integração de produção.

---

## 17. Privacidade e políticas de dados

A autenticação escolhida influencia as políticas aplicáveis. A documentação oficial indica que login ChatGPT segue permissões/políticas do workspace ChatGPT, enquanto API key segue organização/configuração da API.

CEVRA deverá mostrar de forma proporcional:

- provider em uso;
- auth mode relevante;
- se houve envio externo;
- categoria de evidência enviada quando material.

Retenção, treinamento, data residency e requisitos empresariais são provider/workspace-specific e devem ser verificados no release/onboarding correspondente. Não congelar suposições genéricas dentro do Project IR.

---

## 18. Licença, redistribuição e termos comerciais

### 18.1 Código/binário Codex

**VERDE PRELIMINAR.** O repositório oficial atualmente declara Apache-2.0, licença em princípio compatível com distribuição proprietária desde que suas obrigações sejam cumpridas.

Antes de redistribuir:

- fixar versão/commit ou release exata;
- auditar `LICENSE`, `NOTICE` e dependências transitivas;
- registrar provenance em THIRD_PARTY/NOTICE do CEVRA;
- verificar binários/assets incluídos no release;
- revisar atualização/rollback e integridade de download;
- repetir auditoria em upgrades relevantes.

### 18.2 Serviço OpenAI / entitlement ChatGPT

**AMARELO ATÉ RELEASE GATE.** A existência de um App Server oficial para custom clients é forte evidência técnica e de produto, mas a licença Apache do código não substitui os termos do serviço hospedado, regras de plano, workspace e comercialização vigentes.

Antes de anunciar/distribuir comercialmente a integração:

- revisar termos OpenAI vigentes;
- confirmar elegibilidade do fluxo de login em aplicativo de terceiro na versão selecionada;
- verificar requisitos de branding/attribution quando aplicáveis;
- revisar requisitos para workspaces corporativos;
- registrar limitações geográficas/planos se oficialmente necessárias;
- não prometer entitlement que a OpenAI não garante.

Uma mudança material de termos pode alterar a classificação e deve voltar ao product owner.

---

## 19. Custos e consumo

### ChatGPT entitlement

Custo marginal por chamada para o usuário pode estar coberto pelos limites de seu plano, mas isso **não significa uso ilimitado nem custo operacional zero**. Há limites de uso, latência, processamento local do adapter, preparação de contexto e possíveis créditos/add-ons conforme produto/plano vigente.

### API BYOK

Custo variável pago pelo usuário à OpenAI Platform. O CEVRA deve permitir limite/orçamento quando aplicável e nunca iniciar cobrança oculta.

### Consumo ainda desconhecido

Ainda precisamos medir no PoC:

- tokens por projeto/tarefa;
- impacto da transcrição compactada;
- custo de frames/imagens;
- número normal de evidence loops;
- latência cold/warm;
- memória/CPU do App Server;
- comportamento de reconnect/resume;
- frequência de rate limit;
- qualidade editorial por quantidade de contexto.

Nenhum número é inventado nesta decisão.

---

## 20. Fallbacks

Ordem de fallback não é uma cascata silenciosa.

Se Codex ChatGPT não estiver disponível:

1. informar capacidade ausente/limite real quando conhecido;
2. manter funções determinísticas, locais, manuais e presets suportados;
3. oferecer API BYOK somente se configurada/selecionada pelo usuário;
4. permitir outro provider quando futuramente conectado e autorizado;
5. não fingir raciocínio editorial equivalente por heurística simples.

Ausência de Codex não inutiliza o CEVRA.

---

## 21. O que fica rejeitado nesta decisão

Não usar como caminho principal:

- automação de `chatgpt.com` por browser;
- captura de cookies/senha;
- scraping de quota/plano;
- API OpenAI obrigatória para V1;
- fallback automático para API paga;
- App Server com acesso irrestrito ao computador;
- Codex escrevendo diretamente Project IR;
- Codex chamando Media Runtime/FFmpeg/Composition Engine;
- shell/raw commands como protocolo audiovisual;
- MCP ou dynamic tools experimentais como requisito da primeira prova;
- thread OpenAI como única memória do projeto.

---

## 22. Classificação final por componente

| Componente | Classificação desta decisão |
|---|---|
| App Server como mecanismo oficial de custom client | **VERDE documental** |
| `stdio`/JSON-RPC entre CEVRA e App Server | **VERDE documental** |
| login ChatGPT oficial | **VERDE documental** |
| API key BYOK oficial | **VERDE documental**, opcional e cobrada separadamente |
| `outputSchema` para estruturar resposta | **VERDE documental** |
| threads/start/resume | **VERDE documental** |
| streaming/eventos | **VERDE documental** |
| `turn/interrupt` | **VERDE documental** |
| leitura oficial de rate limits quando disponível | **VERDE documental** |
| evidence loop por múltiplos turns CEVRA | **VERDE arquitetural**, precisa PoC |
| uso do entitlement ChatGPT como caminho preferencial | **VERDE como direção**, condicionado à elegibilidade real da conta/workspace |
| contenção rigorosa do processo Codex para papel editorial | **AMARELO / NÃO COMPROVADO END-TO-END** até PoC de segurança |
| MCP como requisito V1 | **NÃO ADOTADO** |
| dynamic tools experimentais | **AMARELO / ADIADO** |
| redistribuição da versão exata do código/binário | **AMARELO até auditoria da versão/dependências**, apesar da licença Apache-2.0 atual |
| uso comercial do serviço/entitlement no produto distribuído | **AMARELO até revisão de termos no release gate** |

Nenhum item é marcado VERDE de produção apenas porque a documentação descreve o mecanismo; onde a execução real importa, PoC/teste permanece obrigatório.

---

## 23. Proof of Concept OpenAI/Codex — conteúdo obrigatório futuro

Quando autorizado no marco técnico, a primeira prova real deve validar:

### Autenticação

- login ChatGPT browser flow;
- device-code se necessário como alternativa;
- logout/relogin;
- conta sem entitlement;
- workspace restrito;
- API BYOK opcional separadamente.

### Transporte/lifecycle

- spawn supervisionado do App Server;
- handshake/init;
- stdio framing;
- shutdown;
- crash;
- restart;
- thread start/resume;
- ausência de listener desnecessário.

### Protocolo CEVRA

- `AgentTaskRequest`;
- `EvidenceRequest`;
- `EvidenceResponse`;
- `EditorialPlanCandidate` via schema;
- malformed response;
- campo extra proibido;
- operação não suportada;
- repair/retry controlado;
- nenhuma interpretação executável de rationale.

### Consistência

- stale project revision;
- digest divergente;
- source/reference removida;
- duplicate plan;
- duplicate response;
- resposta após alteração manual;
- thread retomada com projeto incompatível.

### Cancelamento/falha

- `turn/interrupt`;
- timeout;
- resposta tardia;
- queda de internet;
- rate limit;
- processo morto;
- outcome incerto;
- ausência de replay mutante.

### Segurança

- `shell_tool=false` efetivo;
- nenhuma execução shell pelo agente;
- `command/exec` ausente do adapter;
- `process/*` não utilizado;
- filesystem restrito;
- network local restrita;
- nenhuma expansão de permissão por prompt;
- nenhuma credencial em payload/log/project;
- nenhum bypass para Project IR/engines.

### Privacidade/consumo

- registrar exatamente o que foi enviado;
- confirmar que vídeo integral não é necessário para o caso representativo;
- medir tokens/contexto;
- medir frames/bytes enviados;
- medir latência;
- observar uso/rate limit retornado;
- medir CPU/RAM/processos auxiliares;
- verificar comportamento de retenção/política aplicável ao auth mode selecionado no release gate.

### Aceite do PoC

O caminho só pode ser promovido de **candidato aprovado** para **integração comprovada** se o round-trip real funcionar sem violar a Decisão 1 e sem ampliar silenciosamente permissões, custo ou dados enviados.

---

## 24. Momento de implementação

**Decidir agora; implementar depois do gate atual e das pré-condições mínimas do Agent Protocol/Context/Plan.**

Sequência pretendida:

```text
gate atual do Media Runtime
→ contexto/projeções mínimas
→ schemas mínimos da Decisão 1
→ validator/Change Set mínimo
→ OpenAI Adapter + Codex App Server PoC
→ revisar evidência real
→ estabilizar contrato
→ somente então ampliar funções editoriais dependentes
```

Não esperar o editor inteiro ficar pronto para testar integração; também não antecipar implementação dentro do gate MR atual.

---

## 25. Impacto no gate atual

**Nenhuma mudança imediata foi identificada.**

Esta decisão:

- não altera Media Runtime;
- não cria nova timeline;
- não muda Project IR;
- não autoriza download do Codex;
- não cria conta;
- não usa assinatura/API;
- não gera cobrança;
- não abre listener;
- não implementa Agent Gateway;
- não interfere na prioridade coordenada já aprovada.

Ela reduz risco futuro ao escolher um primeiro caminho oficial de prova sem acoplar o domínio audiovisual ao provider.

---

## 26. Handoff para decisões seguintes

A próxima decisão de integração deve avaliar **Claude / Claude Code** sob exatamente a mesma régua, sem tentar copiar automaticamente a arquitetura OpenAI:

- mecanismo oficial real;
- embedded versus external-agent;
- assinatura versus API;
- autenticação;
- transporte;
- structured return;
- bidirecionalidade;
- sessão;
- evidence loop;
- segurança;
- custo;
- termos/licença;
- possibilidade de convergir para o mesmo CEVRA Agent Protocol.

O resultado pode ser diferente do OpenAI Adapter; o protocolo CEVRA permanece comum.
