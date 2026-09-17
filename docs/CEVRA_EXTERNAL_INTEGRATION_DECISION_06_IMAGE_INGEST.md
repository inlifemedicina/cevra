# CEVRA — Decisão de Integração 6: ingestão de imagens e ativos adquiridos externamente

**Data da decisão:** 2026-09-17.
**Status:** APROVADA PELO PRODUCT OWNER.
**Prioridade:** A/B — necessária antes de composição visual e busca externa escalável, mas sem alterar o gate atual do Media Runtime sem evidência concreta.
**Implementação:** NÃO AUTORIZADA por este registro.
**Relação com decisões anteriores:** preserva Project IR / ProjectHistory como autoridade canônica, complementa a Decisão 21 de composição sobre busca/incorporação de mídia externa e prepara as futuras Decisões 7–8 de busca, download, localização e proveniência.

---

## 1. Regra de avaliação obrigatória para propostas deste chat

A partir desta decisão, qualquer proposta de mudança neste bloco de integrações deverá ser avaliada explicitamente em três eixos antes de ser recomendada:

1. **comparação com o EDVID fixado** em `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703` — o que ele faz, por que funciona e quais fragilidades/trocas ele aceita;
2. **ganho real para o aplicativo CEVRA** — segurança, confiabilidade, qualidade editorial, UX, manutenção, desempenho ou interoperabilidade;
3. **impacto de produto/comercialização** — facilidade para usuário leigo, redução/aumento de suporte, dependências, licenças, custo operacional, tamanho do produto e risco de retrabalho.

Não propor arquitetura adicional apenas por elegância técnica. Uma melhoria só deve ser adotada quando trouxer benefício material frente ao custo/complexidade. Quando o EDVID já resolver adequadamente um problema e o CEVRA não ganhar valor suficiente com uma solução mais complexa, preferir a abordagem mais simples compatível com os invariantes CEVRA.

---

## 2. Estado real do CEVRA antes desta decisão

O modelo canônico já suporta imagens:

- `SourceKind = "video" | "audio" | "image"`;
- `GraphicKind` inclui `image`;
- `GraphicItem` pode referenciar `sourceId`;
- layouts canônicos já incluem `fullscreen`, `split-horizontal`, `split-vertical`, `picture-in-picture` e `custom`.

Portanto, **não é necessária uma nova biblioteca audiovisual, segundo banco de ativos ou segundo modelo de estado** para adicionar imagens.

O gap real está no ingest end-to-end:

- `LocalSourceIngestService` V1 suporta apenas `video | audio`;
- still images são deliberadamente rejeitadas para evitar persistir PNG/JPEG/WebP etc. como falso vídeo;
- o picker desktop atual não oferece extensões de imagem;
- `source.add` e ProjectHistory já conseguem persistir um `SourceAsset` do tipo `image` quando fornecido de forma válida.

Conclusão: **o gap é localizado na identificação/validação/ingestão da imagem**, não no Project IR.

---

## 3. Referência EDVID e por que CEVRA não deve copiá-la cegamente

No EDVID fixado, imagens de Phase 2 são essencialmente arquivos colocados no projeto Remotion e usados por `staticFile(...)`/`<Img>`. O helper de Pexels baixa bytes para `public/pexels` e os grava como `.jpg`; o helper de Google Images também baixa bytes e grava como `.jpg`, sem possuir uma camada equivalente ao SourceAsset canônico, verificação robusta de tipo por conteúdo, checksum obrigatório ou round-trip de reabertura independente do provider.

Essa solução é adequada ao EDVID como skill/scripts orientados por agente, mas é frágil para um produto desktop comercial que precisa de:

- importação por usuário leigo sem troubleshooting manual;
- persistência/recovery;
- segurança contra arquivos malformados ou tipo falso;
- proveniência e licenciamento;
- ProjectHistory/undo/redo;
- interoperabilidade com diferentes composition engines.

A decisão CEVRA é **preservar a simplicidade de uso do EDVID, mas adicionar validação invisível ao usuário**. Não haverá formulários ou perguntas para cada arquivo válido.

---

## 4. Fluxo aprovado para imagem local

Fluxo conceitual:

```text
usuário seleciona/arrasta arquivo
        ↓
validação barata de conteúdo/assinatura quando aplicável
        ↓
probe existente do Media Runtime
        ↓
classificação determinística
video | audio | image
        ↓
metadados mínimos + checksum/proveniência pertinente
        ↓
source.add
        ↓
ProjectHistory / Project IR
```

Regras:

- extensão de arquivo sozinha nunca define o tipo;
- MIME declarado sozinho nunca define o tipo;
- o usuário não precisa escolher manualmente "isto é JPEG/PNG/HEIC";
- o CEVRA deve rejeitar de forma compreensível arquivo que não possa ser identificado/decodificado com segurança;
- arquivo válido entra sem burocracia.

A identificação deve preferir **evidência do conteúdo real**: assinatura/magic bytes quando útil + probe/decode real + dimensões/limites plausíveis. O detalhe exato de bibliotecas auxiliares pode ser definido na implementação; a arquitetura não exige um novo serviço antes de testar o caminho atual.

---

## 5. Probe atual é a primeira opção; ImageProbeAdapter separado somente se necessário

A direção aprovada é aplicar `PRESERVE → EXTEND → VERIFY`:

1. reutilizar primeiro o `probe` atual do Media Runtime;
2. estender a lógica de classificação do Application/Local Source Ingest para reconhecer still image de forma explícita;
3. provar com fixtures reais os formatos-alvo;
4. criar um `ImageProbeAdapter` dedicado **somente se** testes mostrarem uma lacuna concreta de segurança, formato, metadata ou packaging que o probe atual não resolva adequadamente.

Não criar outro adapter apenas por separação conceitual.

### Impacto no Media Runtime

Com a evidência atual, **não há justificativa para adicionar uma nova operação ao Media Runtime ou expandir o gate coordenado atual**.

O contrato `probe` existente já expõe dimensões, streams/codecs e demais metadados suficientes para reconhecer muitos still images, e o `LocalSourceIngestService` já contém lógica explícita para separar codecs de imagem de vídeo temporal.

Portanto, a hipótese prioritária é:

```text
Media Runtime existente
→ probe existente
→ Application classifica audio | video | image
```

Se a implementação provar que metadata adicional ou decode separado é realmente necessário, o conflito deverá voltar ao product owner antes de alterar Media Runtime. Não inferir necessidade apenas porque "imagem é outro tipo de mídia".

---

## 6. Imagem nunca será persistida como vídeo de um frame

Regra forte:

```text
PNG/JPEG/WebP/HEIC/etc.
→ source.kind = image
```

Nunca:

```text
still image
→ source.kind = video
→ duração/frameRate artificial
```

A duração editorial da imagem pertence ao uso/composição (`GraphicItem.startMs/endMs` ou equivalente futuro), não ao arquivo-fonte.

Isso mantém semântica correta e evita que engines e agentes dependam de um falso vídeo temporal.

---

## 7. Formatos-alvo para V1

A V1 deverá mirar, como requisitos principais de usuário comum:

- JPEG/JPG;
- PNG;
- WebP;
- HEIC/HEIF — prioridade alta por relevância para ecossistema iPhone;
- AVIF.

Também aceitar TIFF e BMP **se** a stack efetivamente escolhida os suportar com baixo custo de implementação/packaging/manutenção.

A lista é alvo de produto; suporte real deve ser provado com fixtures e a matriz final da versão distribuída.

### Animated GIF / animated WebP / outros animados

Não achatar silenciosamente para primeiro frame.

Ao detectar animação:

- suportar por capability própria somente se o custo for pequeno e o composition engine tratar corretamente; ou
- rejeitar/adiar com mensagem clara na V1.

### SVG

SVG bruto não entra no ingest raster comum da V1 inicial.

Se houver demanda futura:

```text
SVG
→ validação/sanitização
→ rasterização segura ou pipeline explicitamente aprovado
→ SourceAsset image
```

Motivo: SVG pode possuir referências externas/conteúdo ativo e amplia superfície de segurança sem benefício obrigatório na V1.

---

## 8. Segurança de ingestão sem aumentar a burocracia de UX

O usuário deve perceber apenas "selecionar arquivo". A validação fica automática.

O ingest deve proteger, conforme aplicável, contra:

- spoof de extensão/MIME;
- arquivo malformado;
- decompression/pixel bomb;
- dimensões absurdas;
- tamanho excessivo;
- decode que excede limites razoáveis;
- crash de parser/decoder;
- animação inesperada;
- metadata excessiva;
- SVG/conteúdo ativo não autorizado.

Limites exatos de bytes/pixels/dimensões/tempo são definidos no marco técnico após testes, não inventados neste documento.

A política é **fail-closed sem UX burocrática**: arquivo compatível funciona normalmente; arquivo incompatível falha explicitamente.

---

## 9. Original versus derivado/proxy

Se o arquivo original for válido para ingestão, mas o composition engine selecionado não conseguir consumi-lo diretamente — exemplo possível: HEIC — o CEVRA pode preservar o original e gerar um derivado interno compatível, por exemplo PNG/WebP.

```text
original.heic
    ↓
SourceAsset/proveniência preservam original
    ↓
derivado/proxy gerenciado
    ↓
Composition Engine usa representação compatível
```

Esse comportamento deverá ser não destrutivo e transparente ao núcleo. Não converter antecipadamente todos os formatos sem necessidade; apenas quando o engine/preview/render realmente exigir.

A forma exata de relacionar original e derivado é decisão técnica posterior, preservando uma única autoridade audiovisual e sem criar outro banco de projeto.

---

## 10. Local-user e external-acquired possuem políticas de armazenamento diferentes

### Arquivo local escolhido pelo usuário

Preservar, em princípio, a estratégia atual de source local:

```text
SourceAsset
→ referência estável ao arquivo local original
```

Não copiar obrigatoriamente cada foto do usuário para dentro do projeto, salvo se algum requisito posterior de portabilidade/packing explicitamente aprovado exigir isso.

### Ativo adquirido da internet

Obrigatoriamente:

```text
resultado remoto
→ download controlado
→ validação
→ checksum
→ armazenamento local gerenciado pelo CEVRA
→ SourceAsset
```

A URL do provider nunca será a única fonte necessária para reabrir/renderizar o projeto.

---

## 11. Busca externa e ingestão são estágios distintos

```text
search provider
→ candidatos transitórios
→ seleção pelo usuário/Director dentro da autorização
→ download
→ validação/ingest
→ SourceAsset canônico
```

Resultados de busca não entram todos no Project IR.

Apenas o ativo efetivamente escolhido/adquirido torna-se source. Isso evita poluir o estado canônico com thumbnails/resultados temporários.

---

## 12. Proveniência de ativo externo

Para ativo adquirido externamente, o CEVRA deverá conseguir registrar metadata suficiente, de forma provider-neutral, por exemplo:

- origin (`external-search`, `local-user`, `generated`, etc.);
- providerId;
- provider asset ID quando existir;
- retrievedAt;
- source/reference URL pertinente;
- checksum do conteúdo realmente baixado;
- licença/usage information disponíveis;
- obrigação de attribution/credit quando aplicável;
- MIME/formato detectado;
- informações necessárias à auditoria/reprodução da decisão.

Metadata específica de provider fica em provenance/extensions/boundary apropriado, não redefine `SourceAsset` nem cria modelo de domínio específico de Pexels/Wikimedia/etc.

EXIF completo não deve ser despejado automaticamente no Project IR. GPS e dados do dispositivo são minimizados e não são enviados a agentes apenas porque existem no arquivo.

---

## 13. External Asset Round-Trip será PoC posterior obrigatório

Este PoC permanece planejado, mas ocorre somente após image ingest local e caminho de composição estarem comprovados.

Sequência:

```text
1. importar imagem local
2. validar/persistir SourceAsset
3. fechar/reabrir projeto
4. usar a imagem na composição
5. provar preview/render
6. integrar provider de busca real
7. buscar/selecionar
8. baixar/validar/hash/proveniência
9. persistir como SourceAsset local
10. fechar projeto
11. remover provider/rede quando o teste permitir
12. reabrir e renderizar a mesma imagem sem reconsultar provider
```

O PoC deve provar que o resultado remoto virou ativo local estável e não uma dependência oculta de URL/API.

---

## 14. Composition Engine — estado e sequencing aprovados

O Composition Engine concreto **não está selecionado nem implementado**.

Existe `CompositionEngineAdapter` e ADR 0012, com HyperFrames como candidato preferencial somente se benchmark demonstrar paridade/superioridade frente ao comportamento Remotion do EDVID; Remotion ou outro engine continuam possíveis após análise de licença/comercialização.

O benchmark obrigatório inclui:

- captions;
- headlines/cards;
- split-screen;
- image/B-roll placement;
- dynamic camera;
- tracking;
- motion graphics/templates;
- SFX/transitions;
- timing;
- vertical/horizontal.

Sequenciamento:

```text
closeout corrente
↓
gate aprovado de ajustes coordenados do Media Runtime
↓
Composition Engine benchmark + seleção
↓
integração real de composição
↓
expansão de Phase 2: captions, images, layouts, B-roll, motion graphics
```

Não implementar busca externa de imagens, behind-the-subject ou composição visual em escala para só então escolher o engine. Isso cria retrabalho e risco comercial desnecessário.

---

## 15. Relação com EDVID no momento do Composition Engine

EDVID continua sendo a referência funcional/visual de comportamento, principalmente sua Phase 2 Remotion data-driven.

CEVRA poderá melhorar robustez, segurança e comercialização, mas não aceitará uma arquitetura mais "limpa" que reduza:

- qualidade visual;
- automação;
- timing;
- repertório de layouts;
- facilidade de uso.

Toda diferença relevante deverá justificar ganho real comparado ao EDVID.

---

## 16. Cancelamento, atomicidade e recovery

`source.add` só ocorre após o arquivo ter sido validado e, quando externo, baixado por completo para destino estável.

Se houver cancelamento/falha antes do commit:

```text
nenhum SourceAsset canônico parcial
```

Downloads temporários/derivados incompletos são descartados ou reconciliados fora do Project IR.

O padrão probe-before-commit existente deve ser preservado sempre que aplicável.

---

## 17. Classificação final

- Project IR com `image`: **VERDE — já existe**.
- `GraphicItem.kind=image`: **VERDE — já existe**.
- Local image ingest: **AMARELO — gap implementável e delimitado**.
- Reusar probe atual: **VERDE como primeira estratégia / ainda requer prova end-to-end**.
- Novo ImageProbeAdapter: **NÃO NECESSÁRIO AGORA; somente mediante falha comprovada**.
- Mudança imediata do Media Runtime: **NÃO JUSTIFICADA**.
- JPEG/PNG/WebP/HEIC-HEIF/AVIF como metas V1: **APROVADO**.
- TIFF/BMP: **aceitar se baixo custo real**.
- Animated image: **capability própria ou erro explícito; nunca flatten silencioso**.
- SVG bruto: **fora da V1 inicial**.
- external result → local stable asset: **VERDE arquitetural e obrigatório**.
- Project reopening sem provider: **critério obrigatório do futuro PoC**.
- Composition Engine concreto: **NÃO COMPROVADO / benchmark obrigatório antes de Phase 2 em escala**.

---

## 18. Decisão consolidada

> CEVRA estenderá o caminho canônico de fontes para suportar imagens sem criar segunda biblioteca ou segundo estado audiovisual. O Project IR já possui `SourceAsset.kind=image`; a implementação futura deverá primeiro reutilizar o probe existente e classificar deterministicamente o conteúdo real como áudio, vídeo ou imagem, acrescentando apenas validação de segurança necessária. Um `ImageProbeAdapter` separado ou mudança no Media Runtime somente será introduzido se testes provarem lacuna concreta. A UX deve permanecer simples como no EDVID — selecionar/arrastar e usar — mas o CEVRA fará automaticamente verificações que o EDVID não possui para oferecer segurança e confiabilidade adequadas a um produto comercial. A V1 deverá mirar JPEG, PNG, WebP, HEIC/HEIF e AVIF, com TIFF/BMP quando de baixo custo; animações serão tratadas explicitamente e SVG bruto será diferido. Ativos locais podem referenciar o arquivo original; ativos adquiridos externamente devem ser baixados, validados, armazenados localmente, hasheados e receber proveniência antes de `source.add`. O Composition Engine concreto será escolhido por benchmark após o gate atual do Media Runtime e antes de ampliar Phase 2; o External Asset Round-Trip será provado depois de ingestão local + composição, garantindo que um ativo externo continue utilizável sem reconsultar o provider. Toda melhoria proposta deverá justificar seu valor frente ao EDVID, à UX/comercialização e ao custo/complexidade adicionados.

## 19. Impacto no gate atual

**Nenhuma alteração imediata do gate coordenado do Media Runtime é autorizada ou necessária pela evidência atual.**

A Decisão 6 identifica uma capacidade futura no Application/ingest e define seu caminho preferencial, mas não acrescenta silenciosamente operações ao Media Runtime nem inicia o benchmark do Composition Engine.