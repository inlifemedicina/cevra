# CEVRA — Decisão de Integração 7: busca externa de imagens e vídeos

**Data da decisão:** 2026-09-17.
**Status:** APROVADA PELO PRODUCT OWNER.
**Implementação:** NÃO AUTORIZADA por este registro.
**Relação com Decisão 6:** a busca externa produz candidatos transitórios; somente o ativo selecionado e validado entra no ingest canônico e no Project IR.
**Relação com Decisão 8:** download, localização, checksum, proveniência persistida e reabertura offline serão detalhados na decisão seguinte.
**Gate atual:** nenhuma alteração do gate coordenado do Media Runtime, nenhuma conta externa, segredo, backend, gateway, API key, download de ativo ou provider é criado/ativado por este documento.

---

## 1. Objetivo

Definir a arquitetura de pesquisa externa de imagens e vídeos para o CEVRA Vids com foco explícito em:

- UX adequada a usuário leigo;
- ausência de cadastro técnico obrigatório em providers para uso comum;
- segurança de credenciais;
- menor risco de retrabalho;
- possibilidade de pesquisar múltiplas fontes;
- proveniência/licenciamento claros;
- provider-neutralidade;
- nenhum estado audiovisual paralelo ao Project IR;
- funcionamento do projeto após o ativo ter sido incorporado, independentemente do provider;
- custo e complexidade proporcionais ao ganho real do produto;
- comparação obrigatória com EDVID antes de introduzir complexidade adicional.

Regra de avaliação reafirmada pelo product owner: toda mudança/inovação proposta nesta área deverá ser justificada contra (a) comportamento real do EDVID fixado, (b) melhoria concreta do aplicativo, (c) ganho de comercialização/UX e (d) custo de implementação, manutenção e risco. Não adicionar arquitetura por elegância abstrata.

---

## 2. Referência EDVID e divergências deliberadas

No commit de referência EDVID `d8e6389db02e8de0b46ee680105c09d4250d4703` foram observados helpers separados para Pexels, Wikimedia Commons e Google Custom Search.

O CEVRA não copiará literalmente essa arquitetura porque:

1. CEVRA é um aplicativo comercial persistente, não apenas uma skill/script pipeline;
2. precisa proteger segredos distribuídos;
3. precisa preservar Project IR/ProjectHistory como fonte de verdade;
4. precisa manter ativos estáveis após a busca;
5. precisa suportar evolução de provider sem reescrever o núcleo;
6. deve reduzir a burocracia para o usuário comum;
7. Google Custom Search deixou de ser um caminho adequado para nova integração e não será adotado como dependência do CEVRA;
8. o EDVID fixado usa Pexels apenas para fotos, enquanto o CEVRA quer pesquisar imagens e vídeos quando o provider permitir.

A melhoria proposta é aceita porque traz ganho real de segurança, UX e comercialização, não apenas abstração adicional.

---

## 3. Contrato único de busca

O CEVRA terá uma fronteira provider-neutral, conceitualmente:

```text
ExternalAssetSearchService
  -> ExternalAssetSearchAdapter(provider)
  -> ExternalAssetCandidate[]
```

Entrada conceitual:

```text
query
mediaType: image | video
orientation/aspect intent
locale
minimumQuality
licensePolicy
providerPolicy
```

Saída normalizada conceitual:

```text
providerId
providerAssetId
mediaType
preview/reference
width/height
duration quando aplicável
author/creator
sourcePage
license/licensing metadata
attribution requirements
download renditions/candidates
provider metadata estritamente necessário
```

Resultados são transitórios e NÃO entram no Project IR por aparecerem na busca.

Somente após seleção + download + validação + ingest canônico ocorre `source.add`.

---

## 4. Busca federada

O CEVRA poderá consultar múltiplos providers em uma única busca.

Fluxo conceitual:

```text
CEVRA Search Query
  -> Pexels
  -> Wikimedia Commons
  -> Openverse
  -> futuros providers aprovados

resultados
  -> normalização
  -> deduplicação quando possível
  -> ranking
  -> informação de origem/licença
  -> UI/Director
```

Providers podem ser consultados em paralelo, com timeouts/falhas independentes. Um provider lento não deve impedir resultados já válidos de outros providers.

A UI para usuário comum deverá oferecer uma única ação de "Buscar mídia", sem exigir que ele compreenda APIs/providers, mantendo contudo origem, licença e atribuição acessíveis.

---

## 5. Provider policy

O contrato deverá permitir pelo menos a seguinte política conceitual:

```text
AUTO
ALL
PEXELS
WIKIMEDIA
OPENVERSE
[futuros providers]
```

`AUTO` será o padrão de produto para usuários comuns.

O roteamento poderá usar regras determinísticas e/ou intenção estruturada do Director, sem dar ao modelo acesso irrestrito à internet.

Exemplos:

- stock genérico/cinematográfico/B-roll -> Pexels tende a ser primeira fonte;
- pessoa histórica/local/lugar/evento factual -> Wikimedia/Openverse podem ser priorizados;
- busca manual exploratória -> múltiplos providers podem ser consultados em paralelo;
- busca automática de B-roll -> pode haver busca escalonada para preservar quota quando um provider já entrega material suficiente.

A política poderá evoluir sem alterar Project IR, Composition Engine ou o contrato semântico de ativos.

---

## 6. A IA não ganha browser genérico

Uma IA externa/local pode propor algo como:

```text
AssetSearchIntent {
  query,
  mediaType,
  orientation,
  purpose
}
```

O CEVRA valida e executa via providers aprovados.

Não será concedido ao agente, para este fluxo:

- browser arbitrário;
- wget/curl genérico;
- filesystem irrestrito;
- pesquisa web sem proveniência;
- download direto fora do pipeline autorizado.

CEVRA controla provider, política de licença, resultado, download e ingest.

---

## 7. Provider inicial: Wikimedia Commons

Wikimedia Commons é aprovado como provider prioritário sem segredo compartilhado, especialmente útil para:

- pessoas;
- locais;
- eventos;
- conteúdo factual;
- imagens e vídeos quando disponíveis.

A integração deve capturar metadados de autor/licença e identificar adequadamente o cliente conforme as regras vigentes no momento da implementação.

Wikimedia não precisa passar pelo CEVRA Gateway enquanto puder ser consumido diretamente de forma segura, comercialmente apropriada e sem segredo CEVRA.

---

## 8. Provider inicial: Openverse

Openverse é aprovado como provider aberto complementar, principalmente para mídia reutilizável/licenciada.

A informação de licença fornecida pelo agregador não deverá ser tratada como garantia jurídica absoluta; quando aplicável, a origem upstream deve poder ser preservada/verificada.

Openverse não precisa passar pelo Gateway enquanto o uso direto continuar seguro, adequado aos termos e sem segredo CEVRA obrigatório.

---

## 9. Provider stock preferencial: Pexels

Pexels é aprovado como provider stock preferencial para CEVRA quando a feature for implementada, com suporte a imagens e vídeos conforme a API vigente.

Motivos:

- forte adequação a B-roll e conteúdo editorial comum;
- filtros úteis de orientação/tamanho;
- suporte linguístico adequado;
- experiência stock compatível com edição vertical/horizontal;
- integração como função nativa do CEVRA pode reduzir fortemente a fricção do usuário.

O usuário comum NÃO deverá precisar:

- criar conta developer Pexels;
- gerar API key;
- colar segredo em configurações;
- compreender quota/API.

---

## 10. Pexels via CEVRA Search Gateway

A arquitetura comercial normal aprovada para Pexels é:

```text
CEVRA Desktop
  -> CEVRA Search Gateway
  -> Pexels Search API
  -> metadata de resultados
  -> CEVRA Desktop
```

A API key do Pexels permanece exclusivamente em segredo server-side CEVRA.

NÃO embutir a chave Pexels dentro do aplicativo distribuído.

O Search Gateway deve ser estreito, allow-listed e não se transformar em proxy genérico de internet.

Responsabilidades mínimas:

- autenticar/identificar cliente CEVRA conforme arquitetura comercial futura;
- validar query e parâmetros permitidos;
- manter segredo do provider;
- aplicar rate limit/antiabuso;
- cache quando apropriado;
- encaminhar somente operações Pexels permitidas;
- devolver metadata normalizada/necessária;
- observabilidade mínima sem registrar conteúdo desnecessário.

---

## 11. Mídia pesada fora do Gateway

Regra aprovada: o gateway NÃO deve transportar mídia pesada quando o provider puder fornecer download direto seguro ao cliente.

Caminho preferencial:

```text
CEVRA Desktop
  -> Gateway (busca)
  -> Pexels API

Gateway
  -> metadata + download candidate

CEVRA Desktop
  -> download direto do provider
  -> validação
  -> ingest canônico
```

Evitar:

```text
provider -> CEVRA server -> usuário
```

para arquivos grandes sem necessidade real.

Benefícios:

- menor custo de banda;
- menor storage;
- menor superfície de privacidade;
- menor infraestrutura;
- menor ponto único de falha.

Se termos/segurança de um provider exigirem proxy de mídia no futuro, isso retorna como decisão material antes de implementação.

---

## 12. Regra geral: o que passa pelo CEVRA Gateway

NEM toda integração externa passa pelo Gateway.

Critério aprovado:

```text
external integration
  -> precisa proteger segredo/credencial CEVRA?
  -> precisa controlar billing/quota/abuso centralmente?
  -> precisa ocultar credencial compartilhada?
  -> existe necessidade concreta de intermediação?

SIM -> CEVRA Gateway
NÃO -> integração direta do cliente quando segura e permitida
```

Exemplos esperados:

### Via Gateway
- Pexels com chave CEVRA;
- Pixabay se adotado com chave CEVRA;
- futuras APIs de IA pagas/geridas pelo próprio CEVRA;
- serviços com billing/quota centralizados;
- integrações em que segredo da empresa não possa ser distribuído.

### Direto do desktop quando apropriado
- Wikimedia Commons;
- Openverse enquanto não exigir segredo CEVRA;
- downloads públicos aprovados;
- providers BYOK quando o usuário fornece a própria chave e o uso direto for permitido;
- engines locais.

---

## 13. BYOK e Gateway

BYOK não é automaticamente roteado pelo Gateway.

Quando o usuário fornecer uma chave própria e o provider permitir integração direta:

```text
CEVRA Desktop
  -> secure storage do SO
  -> provider
```

O CEVRA Gateway só deverá intermediar BYOK se houver uma razão concreta futura de segurança, termos, transporte ou produto. Não introduzir intermediação sem benefício comprovado.

---

## 14. Gateway modular, não monolítico

Conceito futuro:

```text
CEVRA Cloud Gateway
  ├── Search Gateway
  │   ├── Pexels
  │   └── providers protegidos futuros
  ├── AI Gateway [futuro, somente se CEVRA-managed APIs forem adotadas]
  ├── Account/Entitlement [futuro]
  └── Billing/Usage [futuro]
```

A existência conceitual dessas áreas NÃO autoriza implementá-las agora.

A implementação inicial do Search Gateway poderá ser extremamente pequena, orientada apenas ao primeiro provider que realmente precise de segredo compartilhado.

---

## 15. Pixabay

Pixabay fica aprovado como candidato stock secundário, não como dependência inicial obrigatória.

Somente adicionar se benchmark real de cobertura/qualidade mostrar ganho material em relação a Pexels + Wikimedia + Openverse.

Se integrado com credencial CEVRA, deverá usar Gateway pelo mesmo princípio de proteção de segredo.

---

## 16. Unsplash

Unsplash fica diferido.

Motivos atuais incluem maior fricção e regras de uso que podem conflitar com a preferência CEVRA por localizar ativos selecionados de forma estável.

Não é proibido permanentemente; reavaliar somente se houver ganho concreto não coberto pelos providers prioritários.

---

## 17. Google Custom Search

Não adotar como nova integração CEVRA.

A existência de helper equivalente no EDVID não é razão suficiente para copiá-lo. O caminho foi considerado inadequado para nova dependência e adicionaria risco de continuidade/licença/copyright sem ganho proporcional.

---

## 18. Licença e proveniência visíveis

Resultados de providers diferentes não devem perder origem ao serem agregados.

Mesmo numa busca única, CEVRA deve preservar pelo menos:

- provider;
- autor quando disponível;
- source page;
- licença/termos disponíveis;
- attribution requirements;
- provider asset ID;
- download rendition selecionável.

O usuário não precisa operar detalhes técnicos, mas o CEVRA precisa manter os dados necessários à conformidade e auditoria.

---

## 19. Segurança

O Search Gateway deve:

- guardar segredos somente server-side;
- nunca aceitar URL arbitrária como destino de proxy;
- não expor segredo em logs/respostas;
- limitar parâmetros/rotas;
- possuir rate limit;
- permitir rotação/revogação de chave;
- distinguir falha provider de falha CEVRA;
- evitar logging de dados pessoais/conteúdo desnecessário;
- não transportar mídia pesada sem necessidade;
- ser atualizável independentemente do Project IR.

O desktop deve:

- validar todo arquivo baixado antes do ingest;
- não confiar em extensão/MIME isoladamente;
- não considerar resultado de busca como SourceAsset antes da validação completa.

---

## 20. Disponibilidade/falhas

Busca federada deve tolerar falha parcial:

```text
Pexels indisponível
Wikimedia responde
Openverse responde
-> resultados válidos continuam utilizáveis
```

Não criar dependência total da feature em um único provider.

Falha do Gateway não deve impedir edição local do CEVRA nem uso de providers diretos que permaneçam disponíveis.

---

## 21. Momento de implementação

NÃO construir o Search Gateway agora apenas para registrar a arquitetura.

A ordem aprovada continua:

1. image ingest local confiável;
2. benchmark/seleção do Composition Engine no marco correto;
3. prova de composição/render de imagens/B-roll;
4. implementar external asset search;
5. implementar o mínimo de Gateway necessário ao provider protegido selecionado;
6. PoC de External Asset Round-Trip;
7. só então escalar automação de B-roll/busca.

Isso evita construir infraestrutura cloud antes de provar a utilidade do caminho local/canônico.

---

## 22. Critérios de aceitação futuros

Quando a implementação chegar, pelo menos os seguintes cenários deverão ser provados:

1. busca manual simples sem cadastro Pexels pelo usuário comum;
2. busca federada com pelo menos dois providers;
3. falha de um provider sem invalidar os demais;
4. resultado identifica origem/licença;
5. Pexels key nunca aparece no desktop/pacote/log;
6. Gateway não aceita proxy/URL arbitrária;
7. rate limit e erro de quota tratados;
8. download de mídia Pexels pode ocorrer diretamente provider -> dispositivo quando permitido;
9. arquivo baixado é validado pelo ingest antes de virar SourceAsset;
10. agente consegue emitir `AssetSearchIntent` sem browser genérico;
11. nenhuma busca adiciona automaticamente dezenas de candidatos ao Project IR;
12. provider pode ser trocado sem alterar Project IR;
13. busca automática consegue operar em modo AUTO;
14. busca manual pode usar múltiplos providers em paralelo;
15. ausência de Gateway não torna o editor local inutilizável.

---

## 23. Classificação aprovada

| Item | Estado |
|---|---|
| busca provider-neutral | GREEN arquitetural |
| pesquisa federada/paralela | GREEN arquitetural |
| policy AUTO | GREEN arquitetural |
| Wikimedia Commons | GREEN, revalidar termos/rate limits na implementação |
| Openverse | GREEN/YELLOW, preservar/verificar licença upstream |
| Pexels como stock preferencial | GREEN funcional / Gateway necessário para segredo CEVRA |
| Pexels key embutida no desktop | RED / não adotar |
| Pexels BYOK como experiência normal | não adotar para usuário comum |
| Search Gateway estreito | GREEN arquitetural, implementação diferida |
| mídia pesada atravessando Gateway sem necessidade | não adotar |
| Pixabay | candidato secundário, somente se benchmark justificar |
| Unsplash | DEFER |
| Google CSE | não adotar como nova dependência |
| gateway universal para toda internet | RED / não adotar |

---

## 24. Decisão final

CEVRA terá busca externa federada e provider-neutral para imagens e vídeos. Providers públicos/sem segredo poderão ser acessados diretamente do desktop quando isso for seguro e comercialmente adequado. Providers que exijam segredo compartilhado do CEVRA, controle central de quota/billing/abuso ou outra necessidade concreta deverão usar um CEVRA Gateway estreito e allow-listed.

Pexels é o provider stock preferencial e deverá usar CEVRA Search Gateway na experiência comercial normal, sem exigir API key/cadastro developer do usuário. A chave Pexels não será distribuída no aplicativo. O Gateway trafega preferencialmente apenas consulta/metadata; mídia pesada baixa diretamente do provider ao dispositivo quando permitido.

Wikimedia Commons e Openverse são providers abertos prioritários sem necessidade automática de Gateway. Pixabay permanece candidato secundário condicionado a ganho real. Unsplash fica diferido. Google Custom Search não será adotado.

Busca manual poderá pesquisar múltiplos providers em paralelo. Busca automática poderá usar `AUTO` e roteamento/escalonamento para equilibrar qualidade e quota. O agente somente propõe intenção estruturada de busca; CEVRA mantém controle de provider, licença, resultados, download e ingest.

Nenhum código, serviço, segredo, conta, billing ou provider é ativado por esta decisão.
