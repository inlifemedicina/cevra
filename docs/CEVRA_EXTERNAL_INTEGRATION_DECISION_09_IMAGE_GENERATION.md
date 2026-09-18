# CEVRA — Decisão de Integração 9: geração de imagens por IA

**Data da decisão:** 2026-09-17.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** geração de imagem por IA é capacidade opcional e complementar. CEVRA deve continuar plenamente funcional sem ela.

---

## 1. Objetivo

CEVRA poderá gerar imagens por IA quando houver benefício criativo ou quando não houver mídia real/licenciada adequada, sem transformar geração em requisito para edição básica.

Casos-alvo incluem:
- ilustrações conceituais;
- fundos;
- thumbnails;
- elementos gráficos;
- assets para motion graphics;
- imagens estilizadas;
- material solicitado explicitamente pelo usuário.

Para referências factuais de pessoa, produto, local, evento, interface ou documento reais, priorizar mídia real/adequada quando disponível. Não substituir silenciosamente uma referência factual por uma imagem inventada.

---

## 2. Arquitetura provider-neutral

A geração deverá ficar atrás de um contrato estável, conceitualmente:

```text
ImageGenerationIntent
→ ImageGenerationAdapter
→ provider/modelo
→ arquivo gerado
→ ingest/validação canônicos
→ managed asset
→ SourceAsset kind=image
→ Project IR
```

O Composition Engine não deve depender do provider de geração.

O provider/modelo não será congelado agora porque o mercado, APIs, modelos, preços e termos mudam rapidamente.

---

## 3. Ordem de preferência por custo e fricção

Diretriz aprovada:

1. **Caminho oficial incluído na conta/assinatura do usuário**, quando o provedor oferecer transporte/programação oficialmente permitidos para integração de terceiros.
2. **Modelo local/open-source/open-weight**, quando qualidade, hardware, licença, redistribuição e UX forem adequados.
3. **BYOK/API paga do usuário**, opcional e explicitamente configurada.
4. **API gerenciada pelo CEVRA**, somente se houver justificativa comercial posterior.

Não assumir que o fato de um usuário conseguir gerar imagens numa interface de consumidor (ex.: ChatGPT) significa que a assinatura pode ser usada programaticamente pelo CEVRA. Assinatura/entitlement, API e integração de terceiros são caminhos distintos e devem ser validados no marco de implementação.

Nenhum workaround de UI, cookie, sessão, automação não autorizada ou mecanismo destinado a consumir quota de assinatura fora dos termos será aceito.

---

## 4. Regra de custo

Se a geração tiver custo monetário adicional não previamente autorizado:

- CEVRA NÃO gera automaticamente;
- CEVRA informa o custo/consumo disponível de forma proporcional quando essa informação puder ser obtida;
- CEVRA pede autorização antes de executar.

Pedido explícito do usuário para gerar uma imagem autoriza a **intenção de geração**, mas não autoriza automaticamente uma cobrança desconhecida.

Quando existir caminho sem custo adicional e oficialmente permitido, a geração poderá seguir a política de autorização já definida pelo usuário/preset, sem transformar qualquer edição em geração automática por padrão.

O Director não poderá decidir sozinho usar geração paga apenas porque acredita que o resultado ficará melhor.

---

## 5. Geração automática versus geração solicitada

### Solicitada pelo usuário
Exemplo:
```text
"gere uma ilustração anatômica da tireoide"
```

CEVRA pode iniciar o fluxo de geração conforme provider e permissões disponíveis. Se houver custo adicional não autorizado, interrompe antes da cobrança e solicita confirmação.

### Sugerida pelo Director
Exemplo:
```text
"seria útil uma ilustração gerada neste trecho"
```

O Director pode propor a geração, mas:
- não gera automaticamente se isso provocar custo adicional não autorizado;
- respeita preferência do usuário;
- não substitui mídia real já adequada apenas por preferência estética do modelo;
- preserva review/Change Set quando aplicável.

---

## 6. Proveniência obrigatória: generated-ai

Todo asset gerado deverá conservar origem de IA de forma permanente.

Metadata mínima quando disponível:
- `origin = generated-ai`;
- providerId;
- modelId;
- modelVersion/revision;
- generationId;
- prompt;
- negativePrompt quando houver;
- seed quando houver;
- createdAt;
- aspect ratio/dimensões;
- assets de referência;
- parâmetros relevantes;
- usage/cost metadata quando disponível;
- checksum;
- mecanismos de provenance/content credentials do provider quando existirem.

O resultado passa pelo mesmo ciclo de vida canônico da Decisão 8 e vira `SourceAsset`.

---

## 7. Transparência: sempre informar que foi gerado por IA

O CEVRA nunca deve perder ou ocultar a informação de que um asset foi gerado por IA.

Na UI, o usuário deve conseguir identificar a origem.

No output/publicação, CEVRA deverá fornecer formas adequadas de disclosure, por exemplo:
- metadata/provenance;
- indicador no projeto;
- texto pronto para legenda/descrição;
- marca/rodapé/end-card quando necessário ou solicitado.

Não queimar obrigatoriamente "Gerado por IA" dentro de toda imagem/vídeo se a plataforma/licença não exigir e o usuário não quiser. A obrigação é preservar a informação e facilitar o disclosure apropriado.

As regras concretas de disclosure das plataformas devem ser revalidadas no marco de publishing/export, pois podem mudar.

---

## 8. Content Credentials / provenance do provider

Quando o provider incorporar C2PA, SynthID ou mecanismo equivalente:
- preservar quando tecnicamente possível;
- não remover intencionalmente sem necessidade;
- registrar a existência no provenance CEVRA quando puder ser detectada.

Isso complementa, mas não substitui, o registro interno do CEVRA.

---

## 9. Candidatos e seleção

Geração manual pode produzir múltiplos candidatos quando isso trouxer ganho proporcional.

O número de candidatos não será fixado agora porque depende de:
- custo;
- latência;
- provider;
- qualidade;
- UX.

Para geração automatizada autorizada, o Director poderá selecionar entre candidatos segundo critérios do plano, mantendo review quando necessário.

---

## 10. Caminho local

Modelos locais permanecem candidatos importantes por:
- ausência de custo por chamada;
- privacidade;
- possibilidade offline.

Mas não são requisito da V1 porque podem exigir:
- download grande;
- GPU/RAM;
- setup/empacotamento;
- auditoria de pesos/licença;
- manutenção;
- qualidade desigual.

A seleção local será feita por benchmark no marco da feature, não por antecipação.

---

## 11. Relação com EDVID

No baseline EDVID fixado, Phase 2 usa prioritariamente imagens pesquisadas, material fornecido e motion graphics; não foi identificada pipeline de geração de imagem por IA equivalente como requisito central.

Portanto, geração de imagens é melhoria opcional do CEVRA, não requisito de paridade básica.

A adoção só se justifica se trouxer ganho real de produto/comercialização sem criar custo, burocracia ou dependência desproporcionais.

---

## 12. Momento de implementação

Geração de imagem NÃO bloqueia:
- V1 básica;
- ingestão local;
- busca externa;
- Composition Engine;
- edição manual/local.

Implementar somente depois que:
1. ingestão de imagens estiver estável;
2. ciclo de vida/provenance estiver funcionando;
3. Composition Engine estiver selecionado/operacional;
4. integração do provider escolhido estiver tecnicamente e comercialmente validada.

---

## 13. Classificação

| Item | Estado |
|---|---|
| arquitetura provider-neutral | GREEN |
| geração como capability opcional | GREEN |
| uso de assinatura comum via transporte oficial futuro | YELLOW / depende do provedor |
| assumir assinatura consumidor = API | RED |
| modelo local | YELLOW / benchmark futuro |
| BYOK | GREEN opcional |
| CEVRA-managed generation API | DEFER |
| geração paga automática sem autorização | RED |
| provenance `generated-ai` | GREEN obrigatório |
| disclosure de IA | GREEN obrigatório |
| provider/modelo final | UNPROVEN / decidir no marco |

---

## 14. Testes futuros obrigatórios

Adicionar ao catálogo cumulativo:
- geração solicitada por usuário com caminho sem custo adicional;
- geração solicitada com API paga sem autorização prévia deve parar antes da cobrança;
- Director sugere geração paga e CEVRA não executa automaticamente;
- asset gerado entra como SourceAsset válido;
- provenance registra `generated-ai`;
- UI identifica origem por IA;
- geração preserva Content Credentials/provenance quando disponível;
- reabrir projeto offline mantém o asset gerado;
- troca de provider não exige mudança de Project IR;
- CEVRA básico funciona com todos os providers de geração desabilitados.

---

## 15. O que não está decidido agora

Não foi escolhido:
- OpenAI versus Google versus Stability/BFL/FLUX/outro;
- modelo exato;
- preço;
- pacote local;
- infraestrutura cloud;
- número padrão de candidatos;
- interface final;
- regra final de disclosure por plataforma.

Esses pontos retornam no marco técnico/comercial correspondente com comparação de custo, qualidade, UX, licença e termos.

---

## 16. Decisão final

CEVRA suportará geração de imagens por IA de modo provider-neutral e opcional. A prioridade é minimizar ou eliminar custo adicional: primeiro integrações oficiais que aproveitem capacidades incluídas na conta do usuário quando isso for programaticamente/comercialmente permitido; depois caminhos locais/open-source adequados; APIs pagas permanecem opcionais.

Nenhuma cobrança será iniciada automaticamente sem autorização apropriada. Pedido explícito do usuário autoriza a intenção de gerar, mas não uma cobrança desconhecida. Sugestão automática do Director nunca autoriza gasto por si só.

Todo conteúdo gerado será marcado permanentemente como `generated-ai` em sua proveniência, com provider/modelo e demais metadata disponíveis, e o CEVRA oferecerá disclosure adequado para plataformas/publicação sem obrigar watermark visual quando não necessário.

Nenhum provider, modelo, conta, API, gasto ou código é ativado por esta decisão.
