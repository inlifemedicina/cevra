# CEVRA — Decisão de Integração 14: transferência externa de arquivos, evidence staging e playbook de agentes

**Data da decisão:** 2026-09-17.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** transportar apenas a evidência necessária, pelo caminho oficial mais direto e barato, sem servidor CEVRA obrigatório e sem transformar agentes externos em clientes com acesso ao projeto inteiro.

---

## 1. Servidor CEVRA não é requisito do desktop

A comunicação normal entre CEVRA Desktop e agentes externos oficialmente suportados deverá preferir caminhos locais/oficiais:

```text
CEVRA Desktop
→ Agent Gateway / adapter
→ Codex App Server / Claude Code / outro cliente oficial
→ conta/entitlement do usuário
→ modelo externo
```

Não construir um servidor CEVRA apenas para intermediar transcript, contexto, screenshots ou clipes quando o adapter oficial local puder fazer isso diretamente.

Servidor/gateway CEVRA só entra quando houver necessidade concreta, como:
- Search Gateway com segredo CEVRA;
- futuro mobile/remote;
- serviço gerenciado CEVRA;
- staging temporário quando o provider realmente exigir URL externa.

---

## 2. Ordem de evidência enviada

Aplicar a política de disclosure progressivo já aprovada:

1. contexto estrutural;
2. transcript/projeções textuais;
3. frames/screenshots;
4. clipes curtos;
5. arquivo audiovisual completo apenas em situação excepcional futura e autorizada.

O fato de usar IA externa não significa upload automático do vídeo inteiro.

---

## 3. Como a IA entende o tema sem ver o vídeo inteiro

CEVRA não precisa saber semanticamente o tema antes da IA.

Fluxo normal:

```text
vídeo
→ transcrição local + timestamps + metadados
→ Evidence Builder
→ IA externa/local capaz
→ inferência de tema/subtemas/estrutura
```

Se o usuário já informar o tema, essa informação é enviada como contexto explícito.

Se não informar:
- transcript compacto e estrutura objetiva são suficientes para a IA inferir o tema na maioria dos casos;
- CEVRA determinístico não inventa tema;
- sem IA capaz, o tema permanece desconhecido quando não puder ser obtido por regra objetiva.

---

## 4. EvidenceRequest para aprofundamento sob demanda

A IA recebe visão global suficiente para perceber lacunas:

- transcript/projeção compacta;
- estrutura de takes;
- timestamps;
- repetições/candidatos;
- objetivo;
- duração;
- estilo;
- restrições;
- evidências técnicas relevantes.

Se precisar ver mais:

```text
EvidenceRequest
sourceRef
interval
evidenceType
purpose
```

Exemplo:
- comparar expressão de dois takes;
- conferir demonstração visual;
- verificar continuidade;
- avaliar gesto/reação.

CEVRA valida:
- referência;
- autorização;
- budget;
- necessidade;
- limites de dados.

Depois extrai somente o frame/clip solicitado.

---

## 5. Transferência binária não exige necessariamente API paga

Há quatro categorias:

1. **IA local** — nenhum upload externo.
2. **Agente oficial conectado à conta/assinatura** — pode operar sem API key separada quando o provider suportar oficialmente esse caminho.
3. **BYOK API** — opcional.
4. **API gerenciada pelo CEVRA** — futura/opcional.

Screenshot, transcript ou clip não implicam automaticamente API paga; dependem do transporte oficial disponível no adapter.

Não assumir que assinatura de consumidor equivale a API.

---

## 6. Evidence staging local

Quando agente local/oficial no mesmo computador precisar de artifact:

```text
Project
→ Evidence Builder
→ staging temporário CEVRA
→ somente artifact autorizado
→ adapter
```

Exemplos:
- frame JPEG/WebP;
- clip MP4 curto;
- JSON/contexto;
- transcript excerpt.

O agente não recebe acesso genérico ao filesystem, pasta inteira do projeto ou credenciais.

Staging é:
- temporário;
- bounded;
- derivado de fontes autorizadas;
- não-canônico;
- descartável.

---

## 7. Upload direto ao provider quando necessário

Se um provider de API exigir arquivo:
- preferir seu transporte oficial direto do dispositivo;
- usar file/upload IDs apenas como metadata de sessão/adapter;
- nunca transformar provider file ID em identidade audiovisual do projeto.

Evitar:
```text
CEVRA Desktop → servidor CEVRA → provider
```

quando:
```text
CEVRA Desktop → provider oficial
```

for seguro e suficiente.

---

## 8. Storage CEVRA temporário apenas quando necessário

Se houver caso que realmente exija storage intermediário CEVRA:

- bucket/objeto privado;
- URL assinada;
- TTL curto;
- escopo por operação;
- validação de tamanho/tipo;
- nenhum listing público;
- delete/expiração;
- sem biblioteca permanente de projetos.

Nunca expor arquivo por URL pública permanente.

---

## 9. Arquivos retornados por provider

Qualquer arquivo externo de retorno segue:

```text
provider
→ download temporário
→ validar conteúdo real
→ hash
→ metadata/provenance
→ ingest canônico
→ managed asset / SourceAsset
```

URL remota nunca vira diretamente a fonte durável do Project IR.

---

## 10. Reuso de uploads válidos

Quando seguro e suportado:
- reutilizar upload/file ID ainda válido para evitar reenviar o mesmo clip em vários turnos;
- vincular ao digest do artifact;
- invalidar em mudança relevante/expiração;
- não persistir provider ID como autoridade canônica.

---

## 11. CEVRA Agent Playbook interno

Foi aprovada a criação em paralelo de um **CEVRA Agent Playbook** versionado para agentes externos utilizados pelo aplicativo.

Objetivo:
- ensinar método editorial CEVRA;
- preservar princípios EDVID aprovados;
- orientar quando pedir mais evidência;
- explicar Agent Protocol;
- explicar capabilities;
- explicar limites;
- orientar retorno em `EditorialPlanCandidate`;
- evitar invenção e ações fora da autorização.

O Playbook melhora consistência e qualidade, mas **não é dependência estrutural**.

O Agent Protocol continua sendo a camada obrigatória.

Quando provider não tiver mecanismo formal de “Skill”, o adapter pode fornecer as instruções equivalentes por system/contexto permitido.

---

## 12. Distinção da futura CEVRA Skill pós-V1

O Agent Playbook desta decisão NÃO é o produto futuro “CEVRA Skill”.

### Agent Playbook
- interno ao próprio CEVRA Vids;
- serve para orientar os agentes que auxiliam o aplicativo;
- faz parte da integração editorial;
- não é produto independente.

### CEVRA Skill futura
- produto/interface posterior à V1;
- permitirá operar o CEVRA a partir de Codex/Claude;
- reutilizará capacidades efetivamente entregues;
- tem distribuição/UX/ciclo de produto próprios.

Não confundir ou fundir os dois.

---

## 13. Micro-raciocínio editorial local leve

Refinamento aprovado da Decisão 4:

CEVRA deve investigar um modelo local suficientemente leve para pequenos pensamentos editoriais internos, sem transformar isso em dependência estrutural.

Tarefas candidatas:
- inferir tema;
- inferir subtemas;
- classificar tipo de conteúdo;
- identificar blocos temáticos;
- detectar ideias potencialmente repetidas;
- sugerir takes equivalentes para comparação;
- resumir contexto para agente externo;
- priorizar trechos/frames que provavelmente serão úteis;
- ajudar a decidir quando pedir EvidenceRequest adicional;
- gerar tags/contexto editorial simples.

Benefícios esperados:
- melhor contexto enviado ao agente externo;
- menos tokens;
- menos uploads;
- menos latência;
- maior assertividade;
- mais processamento privado/local.

Limites:
- opcional;
- CEVRA funciona sem ele;
- resultado é derivado, não canônico;
- não faz mutações destrutivas sozinho;
- não substitui IA externa quando tarefa exceder sua qualidade;
- não cria cascata obrigatória local→externo;
- nunca deve piorar UX em hardware incompatível.

Esse perfil de micro-raciocínio entra como critério específico no benchmark de Local Agent Adapter.

---

## 14. Momento de implementação

### Agora
Registrar contratos/políticas e manter compatibilidade.

### Depois do gate MR e protocolo mínimo
- implementar Evidence Builder;
- staging local seguro;
- primeiro Agent Round-Trip real;
- CEVRA Agent Playbook;
- benchmark local de micro-raciocínio.

### Storage/gateway CEVRA
Somente diante de necessidade comprovada.

---

## 15. Decisão final

CEVRA não dependerá de servidor cloud próprio para sua comunicação editorial normal com agentes externos. O desktop enviará preferencialmente contexto compacto e evidence sob demanda por adapters oficiais, usando staging local e transporte direto ao provider quando necessário.

CEVRA terá um Agent Playbook interno versionado, distinto da futura CEVRA Skill produto, para aumentar a compreensão e consistência de Codex/Claude/outros agentes, sem transformá-lo em dependência estrutural.

A IA recebe primeiro uma visão global textual/estrutural. Ela pede frames/clipes adicionais por `EvidenceRequest` quando precisar avaliar expressão, continuidade ou outros sinais visuais.

CEVRA também investigará um Local Agent Adapter leve para micro-raciocínio editorial, incluindo inferência de tema/subtemas e seleção inicial de evidências. Essa capacidade será opcional, local e não-canônica.
