# CEVRA — Decisão de Integração 10: geração de vídeo por IA

**Data da decisão:** 2026-09-17.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** geração de vídeo por IA é capacidade opcional, provider-neutral e não bloqueadora da V1. O CEVRA deve permanecer plenamente funcional sem geração de vídeo.

---

## 1. Objetivo

CEVRA poderá gerar vídeo por IA para:
- B-roll inexistente ou difícil de obter;
- cenas conceituais;
- transições/visuais criativos;
- assets para composição;
- image-to-video;
- text-to-video;
- outros usos explicitamente autorizados.

A geração não substitui automaticamente mídia real/licenciada adequada, especialmente para referências factuais de pessoas, produtos, lugares, eventos, documentos, interfaces ou demonstrações reais.

---

## 2. Relação com EDVID

No baseline EDVID fixado `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`, não foi identificada pipeline central de text-to-video/image-to-video equivalente a Sora/Veo/Runway como requisito de paridade.

Logo, geração de vídeo é expansão opcional do CEVRA, não requisito para reproduzir o piso funcional EDVID.

A adoção deve justificar ganho real de produto/comercialização em relação a:
- mídia fornecida pelo usuário;
- Pexels/Wikimedia/Openverse;
- imagens;
- motion graphics;
- composição tradicional.

---

## 3. Arquitetura provider-neutral

Fluxo conceitual:

```text
VideoGenerationIntent
→ VideoGenerationAdapter
→ provider/modelo
→ arquivo gerado
→ validação/hash/provenance
→ managed asset
→ SourceAsset kind=video
→ Project IR
```

O Composition Engine não deve conhecer schema nativo do provider.

O Project IR permanece provider-neutral.

---

## 4. Ordem de preferência por custo e fricção

Diretriz aprovada:

1. **Integração oficial incluída na conta/assinatura do usuário**, se o provedor permitir uso programático/comercial por terceiros.
2. **Modelo local/open-source/open-weight**, quando qualidade, hardware, licença, redistribuição e UX forem adequados.
3. **BYOK/API paga do usuário**, opcional.
4. **CEVRA-managed API/credits**, somente futuramente se houver justificativa comercial.

Não assumir que acesso do usuário a geração em uma interface de consumidor implica direito ou transporte oficial para o CEVRA utilizar essa quota.

Nada de automação de UI, cookies, sessão ou workaround destinado a consumir assinatura fora do caminho oficial.

---

## 5. Regra de custo

Se a geração implicar custo adicional não previamente autorizado:

- não executar automaticamente;
- mostrar custo/consumo quando essa informação for oficialmente disponível;
- solicitar confirmação antes da chamada paga.

Pedido explícito do usuário autoriza a **intenção de gerar**, não uma cobrança desconhecida.

Sugestão do Director nunca autoriza gasto por si só.

Quando houver caminho oficialmente permitido sem custo adicional, a geração poderá seguir permissões/presets já definidos pelo usuário.

---

## 6. Geração solicitada versus sugerida

### Solicitada pelo usuário
Pode executar quando houver provider/capacidade disponíveis e autorização adequada.

### Sugerida pelo Director
Pode propor geração quando houver benefício claro, mas:
- não gera automaticamente se houver custo não autorizado;
- não substitui mídia real adequada por preferência estética do modelo;
- preserva review/Change Set conforme o fluxo aprovado.

---

## 7. Provider/modelo não selecionado agora

Nenhum provider/modelo é congelado nesta decisão.

Motivos:
- mercado muda rapidamente;
- custo muda;
- disponibilidade e APIs mudam;
- termos comerciais mudam;
- capacidades locais evoluem;
- hardware exigido varia muito.

No marco da feature, benchmarkar opções atuais por:
- qualidade;
- fidelidade ao prompt;
- image-to-video;
- temporal consistency;
- resolução;
- duração;
- áudio;
- latência;
- custo;
- hardware;
- API stability;
- termos/licença;
- redistribuição/comercialização;
- provenance.

---

## 8. Caminho local

Modelos locais são candidatos prioritários para reduzir custo recorrente, mas não são requisito da V1.

Avaliar:
- tamanho de download;
- RAM/VRAM;
- GPU;
- velocidade;
- qualidade temporal;
- resolução;
- empacotamento;
- atualização;
- licença de código;
- licença dos pesos;
- redistribuição comercial.

Não selecionar modelo local sem benchmark CEVRA-specific.

---

## 9. Áudio de vídeos gerados

Aplicar a Decisão 22:

- vídeo gerado usado como B-roll entra **mudo por padrão**;
- áudio gerado não substitui fala principal automaticamente;
- se o usuário pedir cena completa com som ou o plano explicitamente autorizar uso do áudio, o áudio pode ser preservado conforme regras próprias.

Geração de vídeo e geração/uso de áudio são autorizações distintas quando houver impacto editorial/custo.

---

## 10. Proveniência obrigatória e disclosure

Todo vídeo gerado deve preservar:

- `origin = generated-ai`;
- providerId;
- modelId;
- modelVersion/revision quando disponível;
- generationId;
- prompt;
- negativePrompt/seed quando aplicáveis;
- referência a imagens/fontes de entrada;
- createdAt;
- dimensões/aspect ratio;
- duração;
- parâmetros relevantes;
- usage/cost quando disponível;
- checksum;
- Content Credentials/provenance do provider quando houver.

O usuário deve conseguir identificar no CEVRA que o vídeo foi gerado por IA.

Para publicação/exportação, CEVRA deve disponibilizar disclosure adequado conforme regras atuais da plataforma, sem exigir watermark visual em toda mídia quando não necessário.

---

## 11. Provider provenance

Quando o provider entregar SynthID, C2PA ou mecanismo equivalente:
- preservar quando tecnicamente possível;
- não remover intencionalmente sem necessidade;
- registrar sua existência quando detectável.

O registro interno do CEVRA continua obrigatório mesmo quando houver provenance externo.

---

## 12. Não bloqueia V1

Geração de vídeo não é requisito para:
- edição local;
- ingest;
- busca externa;
- B-roll real;
- split/full-screen;
- motion graphics;
- Composition Engine;
- export básico.

Se geração de vídeo estiver indisponível, o app continua funcionando e oferece as alternativas existentes.

---

## 13. Momento de implementação

Implementar somente após:
1. ingest/ciclo de vida de assets estáveis;
2. Composition Engine funcional;
3. busca/B-roll básicos funcionais;
4. benchmark técnico/comercial do provider/modelo;
5. integração oficial/autorizada validada;
6. política de custo/disclosure pronta.

---

## 14. Classificação

| Item | Estado |
|---|---|
| VideoGenerationAdapter provider-neutral | GREEN |
| geração como capability opcional | GREEN |
| geração como requisito V1 | RED / não adotar |
| caminho oficial incluído em assinatura | YELLOW / depende do provider |
| modelo local | YELLOW / benchmark |
| BYOK pago | GREEN opcional |
| CEVRA-managed video generation | DEFER |
| geração paga automática sem autorização | RED |
| provenance `generated-ai` | GREEN obrigatório |
| disclosure IA | GREEN obrigatório |
| áudio gerado em B-roll | mudo por padrão |
| provider/modelo final | UNPROVEN |

---

## 15. Testes futuros obrigatórios

Adicionar ao catálogo cumulativo:
- geração solicitada sem custo adicional;
- geração paga sem autorização deve parar antes da cobrança;
- Director sugere geração paga e não executa automaticamente;
- vídeo gerado entra como SourceAsset local estável;
- provenance generated-ai;
- disclosure;
- provider provenance preservada quando disponível;
- áudio de B-roll gerado permanece mudo por padrão;
- reopen offline;
- app funciona sem qualquer provider de geração;
- troca de provider sem alterar Project IR;
- benchmark de qualidade/custo/hardware/licença.

---

## 16. Decisão final

CEVRA terá geração de vídeo por IA como capacidade opcional e provider-neutral. A preferência é minimizar ou eliminar custo adicional: primeiro caminhos oficiais incluídos na conta do usuário quando permitidos; depois opções locais/open-source adequadas; APIs pagas permanecem opcionais.

Nenhuma geração paga será feita automaticamente sem autorização. O Director pode sugerir, mas não gastar. Vídeos gerados serão permanentemente identificados como IA na proveniência e o CEVRA oferecerá disclosure apropriado.

Quando usados como B-roll, vídeos gerados entram sem áudio por padrão. A feature não bloqueia a V1 e nenhum provider/modelo/serviço é selecionado ou ativado por este registro.
