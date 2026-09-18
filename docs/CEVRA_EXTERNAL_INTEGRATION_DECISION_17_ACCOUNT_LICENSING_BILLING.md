# CEVRA — Decisão de Integração 17: conta, licenciamento, entitlement e cobrança

**Data:** 2026-09-18.  
**Status:** DIREÇÃO DE PRODUTO APROVADA; PARÂMETROS COMERCIAIS FINAIS E PROVEDOR LIVE DEVEM SER REVALIDADOS ANTES DO LANÇAMENTO.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** separar identidade CEVRA, entitlement do produto e cobrança. Desenvolvimento do app não depende de Paddle, backend live ou pagamento real.

---

## 1. Objetivo

Permitir comercializar CEVRA Vids com:
- conta própria CEVRA;
- assinatura mensal/anual;
- ativação por dispositivo;
- funcionamento offline por período controlado;
- cobrança por provedor externo;
- bloqueio de uso produtivo quando entitlement expirar;
- preservação dos projetos e fontes do usuário;
- arquitetura reutilizável por futuros produtos Orbit.

Nenhum dado de projeto/mídia precisa ser enviado ao backend de conta/licença.

---

## 2. Separação obrigatória de responsabilidades

```text
CEVRA Account
→ identidade

CEVRA Entitlement Service
→ o que essa identidade pode usar?

Billing Provider
→ pagamento/assinatura/fatura
```

Billing provider não é a autoridade de domínio do CEVRA.

Project IR nunca armazena:
- senha;
- token de cobrança;
- subscription object nativo;
- cartão;
- webhook secret;
- entitlement server secret.

---

## 3. Conta CEVRA

A conta CEVRA é uma identidade própria do ecossistema Orbit.

V1 deve preferir autenticação **passwordless**:
- e-mail;
- magic link ou código de uso único;
- sessão/token após verificação.

Motivos:
- reduz superfície de senha;
- evita necessidade de UX de senha/reset complexa no início;
- continua permitindo identidade estável para desktop, mobile, entitlement, devices e futuros produtos.

Uma futura autenticação por senha é possível, mas exigiria backend/autenticação apropriada, armazenamento seguro de hashes, reset, rate limiting, proteção contra credential stuffing e outras responsabilidades. Portanto não é requisito V1.

Login CEVRA não implica:
- cloud storage;
- upload automático de projeto;
- sync;
- backup de mídia.

---

## 4. Billing Provider

Paddle é o **primeiro candidato** para cobrança V1 por funcionar como Merchant of Record e reduzir trabalho de tributação/billing internacional. O provedor live deve ser revalidado perto do lançamento quanto a:
- disponibilidade para a empresa CEVRA;
- taxas;
- payouts;
- BRL/métodos de pagamento;
- impostos;
- chargebacks/fraude;
- termos;
- webhook/API;
- portal do cliente.

Lemon Squeezy permanece fallback real.

CEVRA deve usar um contrato:

```text
BillingProviderAdapter
├─ Paddle
├─ Lemon/futuro
├─ Stripe/futuro
└─ Enterprise/manual invoice futuro
```

Nenhum schema do provider entra como modelo central.

---

## 5. Entitlement Service

CEVRA mantém entitlement próprio, mesmo que billing seja terceirizado.

Registro conceitual mínimo:

```text
User
- cevraUserId
- verifiedEmail

Entitlement
- productId
- planId
- status
- startsAt
- paidThrough / expiresAt
- capabilities
- devicePolicy
- entitlementVersion

Device
- deviceId
- userId
- activatedAt
- lastValidatedAt
- revokedAt

BillingReference
- provider
- externalCustomerId
- externalSubscriptionId
```

O backend não precisa armazenar projetos/vídeos.

---

## 6. Signed entitlement

O desktop recebe um entitlement assinado pelo CEVRA.

Conceito:

```text
cevraUserId
product = cevra-vids
plan
capabilities
devicePolicy
issuedAt
validUntil
entitlementVersion
signature
```

Servidor:
- private signing key.

App:
- public verification key.

A private key nunca entra no desktop/repositório.

O entitlement local fica em OS secure storage quando aplicável.

---

## 7. Funcionamento offline

CEVRA não exige internet em toda inicialização.

Fluxo:

```text
ativação/validação online
→ entitlement assinado local
→ uso offline dentro da política
```

Quando internet estiver disponível:
- refresh silencioso proporcional;
- atualização de status/device policy;
- nenhuma mídia do projeto é necessária.

Quando refresh não puder ocorrer:
1. entitlement ainda dentro de validade → uso normal;
2. passa para grace period;
3. grace termina → Recovery Mode.

Os números exatos de refresh/grace não são congelados agora; serão parâmetros comerciais/versionados e testados antes do lançamento.

---

## 8. Recovery Mode

Recovery Mode existe para preservar acesso aos **dados do usuário**, não para manter uso produtivo gratuito.

Permitido:
- abrir projeto;
- visualizar projeto/timeline em modo de recuperação;
- localizar/acessar fontes originais;
- verificar caminhos/proveniência;
- copiar/salvar o arquivo de projeto;
- consolidar/copiar os **arquivos-fonte e assets já existentes** para recuperação/portabilidade quando seguro;
- acessar conta/renovação/licença.

Não permitido:
- executar novas edições produtivas;
- aplicar novos efeitos;
- iniciar novos trabalhos de IA;
- gerar novo render final;
- exportar MP4/MOV/WebM ou outro vídeo final utilizável;
- salvar/renderizar uma nova versão audiovisual derivada do projeto para uso;
- contornar expiração por “preview” que seja equivalente a export final.

Recovery Mode pode mostrar preview necessário para o usuário identificar/recuperar seu projeto, mas esse preview:
- não é exportável como produto final;
- pode ser limitado em qualidade/duração conforme UX futura;
- não deve se tornar substituto do render licenciado.

**Expiração nunca apaga projetos ou originais.**

---

## 9. Device activation

Arquitetura suporta device policy configurável por plano.

Primeiro default comercial proposto:
- individual: 2 computadores ativos.

Esse número não é hardcoded no app.

Servidor/plan metadata pode alterar futuramente:
- número de devices;
- seats;
- team policy;
- enterprise rules.

Device revocation deve existir para troca de computador.

Não usar fingerprint invasivo desnecessário; gerar identidade de instalação/dispositivo estável com abordagem proporcional e compatível com privacidade.

---

## 10. Modelo comercial

Direção inicial:
- assinatura mensal;
- assinatura anual;
- trial/promo possíveis;
- perpetual/lifetime não é oferta principal V1.

Motivo:
CEVRA terá custo contínuo de manutenção/compatibilidade de runtimes, engines, providers, modelos e sistemas operacionais.

Arquitetura de entitlement pode suportar tipos futuros sem reescrever Project IR.

---

## 11. Processamento local não vira crédito por uso

Licença normal libera processamento local permitido pelo plano.

Não cobrar por:
- quantidade de renders locais;
- minutos locais processados;
- uso de CPU/GPU do próprio usuário.

Créditos/allowances só fazem sentido quando houver custo variável real pago pelo CEVRA, por exemplo:
- geração cloud;
- API gerenciada;
- cloud render;
- provider pago por chamada.

Mesmo nesses casos:
- custo/allowance deve ser explícito;
- nunca converter uso local em metering artificial.

---

## 12. Checkout

Pagamento ocorre fora do app:

```text
CEVRA Desktop
→ Assinar
→ browser / hosted checkout
→ Billing Provider
→ webhook
→ Entitlement Service
→ entitlement atualizado
```

Benefícios:
- reduz escopo PCI;
- não armazena cartão no app;
- provider cuida de checkout/fatura/portal.

CEVRA Settings pode abrir:
- Manage subscription;
- Billing portal;
- Upgrade/renew.

---

## 13. Cancelamento

Cancelamento voluntário:
- não revoga imediatamente período já pago;
- entitlement permanece até `paidThrough`;
- depois expira e entra Recovery Mode.

Chargeback/fraude/revogação administrativa pode ter política distinta, a definir antes do lançamento.

---

## 14. Fases de desenvolvimento

### Fase A — AGORA / Development

Objetivo: desenvolver e testar CEVRA sem infraestrutura comercial.

```text
Dev build
→ Development Entitlement local
→ app completo para desenvolvimento
→ sem Paddle
→ sem pagamento
→ sem backend live obrigatório
```

Regras:
- somente builds/dev environment autorizados;
- release/stable **não pode aceitar Dev Entitlement**;
- CI/release build deve falhar se bypass/dev-license estiver habilitado;
- nenhum segredo de produção no dev entitlement;
- não simular que billing foi testado quando só houve bypass local.

Isso permite continuar construindo o produto hoje sem conta/Paddle.

### Fase B — Pré-lançamento / Staging

```text
CEVRA staging
→ conta/auth staging
→ Entitlement Service staging
→ billing sandbox
→ webhooks de teste
→ device activation
→ expiry/grace/recovery tests
```

Sem dinheiro real.

Objetivo:
- validar onboarding;
- login;
- assinatura;
- activation;
- cancelamento;
- renew;
- devices;
- offline;
- Recovery Mode;
- falhas de webhook.

### Fase C — Comercial / Live

```text
CEVRA production
→ conta real
→ Entitlement Service production
→ Billing Provider live
→ assinatura real
```

Ativação comercial exige endpoint live saudável.

---

## 15. Não exigir Paddle para abrir/testar o app agora

Paddle não é:
- login do CEVRA;
- requisito do ambiente de desenvolvimento;
- servidor do app;
- host de Project IR;
- backend de edição.

Antes da comercialização, CEVRA pode funcionar integralmente em dev com entitlement local controlado.

Somente na fase de staging/live entram:
- auth remoto;
- entitlement service remoto;
- billing sandbox/live.

---

## 16. Backend mínimo

V1 comercial precisa apenas de pequeno control plane:

- account/auth;
- entitlement records;
- device activation/revocation;
- signed entitlement issuance/refresh;
- billing webhook consumer;
- billing references;
- customer portal/checkout links;
- audit/diagnostics mínimos.

Não precisa de:
- upload de vídeo;
- render cloud;
- project sync;
- marketplace;
- storage de projeto;
- billing engine próprio;
- invoice engine próprio;
- card vault.

---

## 17. Segurança

Nunca no desktop:
- billing provider secret;
- webhook signing secret;
- CEVRA entitlement private signing key;
- admin credentials.

Backend:
- verify webhook signature;
- idempotency;
- event ordering/reconciliation;
- least privilege;
- audit events sem conteúdo do projeto.

Desktop:
- verify signed entitlement;
- secure storage;
- fail closed para assinatura inválida/tampered;
- clock-skew/tamper policy proporcional e sem destruir dados.

---

## 18. Billing webhook não é verdade única instantânea

Webhooks podem:
- atrasar;
- repetir;
- chegar fora de ordem.

Entitlement Service deve:
- processar idempotentemente;
- reconciliar status com provider quando necessário;
- não revogar acesso por evento ambíguo sem regra segura.

Billing provider é fonte financeira; CEVRA entitlement é a projeção de acesso do produto.

---

## 19. Relação com Update Controller

Update Controller consulta entitlement somente para:
- packs/features/releases que realmente dependam de plano.

Patches críticos de segurança/compatibilidade de uma versão já autorizada não devem ser bloqueados indevidamente por entitlement expirado quando necessários para manter instalação segura/recuperável.

Expiração não torna projeto ilegível.

---

## 20. Relação com mobile e Orbit

CEVRA Account/Entitlement é Orbit-level shared platform service.

Pode futuramente atender:
- Vids desktop;
- Companion mobile;
- Marketplace;
- outros produtos CEVRA;
- team/enterprise.

Não mover Project IR para Orbit por causa disso.

---

## 21. UX

Estados claros:
- Dev (somente build dev);
- Signed in / active;
- Offline valid;
- Grace period;
- Recovery Mode;
- Subscription expired;
- Device limit reached;
- Billing issue.

Não mostrar detalhes internos de Paddle ao usuário salvo quando necessário para billing/support.

---

## 22. Testes essenciais

- dev build abre sem backend;
- stable build rejeita Dev Entitlement;
- signup/passwordless;
- entitlement signature valid/invalid;
- offline valid;
- grace expiry;
- Recovery Mode;
- Recovery Mode não exporta vídeo utilizável;
- projeto/originais continuam acessíveis;
- 2-device/default policy configurável;
- revoke device;
- webhook duplicated/out-of-order;
- cancellation at period end;
- billing provider outage;
- entitlement service outage;
- staging ↔ live separation;
- secret absence from desktop;
- update entitlement interaction.

---

## 23. Decisão final

CEVRA terá conta própria passwordless, Entitlement Service próprio e provider de billing separado.

Paddle é primeiro candidato comercial e Lemon Squeezy permanece fallback, mas nenhum deles é necessário para desenvolvimento do app.

Antes de comercializar, integraremos staging/sandbox e depois live.

Development Entitlement local permite desenvolvimento completo hoje, mas é proibido em release/stable.

Recovery Mode preserva projetos e fontes, porém **não permite gerar, exportar ou salvar uma nova saída de vídeo utilizável**.

Nenhum projeto ou vídeo é armazenado no backend apenas por existir conta/licença.
