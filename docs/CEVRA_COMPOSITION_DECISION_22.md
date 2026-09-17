# CEVRA — Decisão 22: B-roll em tela cheia versus manutenção do apresentador

**Data:** 2026-09-17.
**Status:** DIREÇÃO DE PRODUTO APROVADA; IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.

## Decisão aprovada

O CEVRA usará B-roll em tela cheia quando a informação visual precisar de mais espaço ou for mais relevante do que manter o apresentador visível, preservando integralmente a fala principal. Tela dividida será preferida quando a presença do apresentador continuar útil. O sistema evitará cobertura visual excessiva, respeitará escolhas explícitas do usuário e manterá o áudio de mídias de apoio desativado por padrão.

## Referência EDVID

A referência fixa continua `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703`. No longform, o EDVID usa `broll[]` para imagem em tela cheia com Ken Burns ou vídeo mudo sobre a narração e orienta que gráficos pontuem em vez de saturarem. No shortform, as inserções e gráficos ficam em zonas definidas, com imagens e motion graphics sincronizados ao conteúdo falado; o estilo e a composição determinam quando manter o apresentador visível. Código e referências inspecionados não equivalem a novo teste de renderização.

## Comportamento e limites

1. **Substituição visual, não editorial da fala.** B-roll cobre a imagem principal por um intervalo, sem cortar, reorganizar, acelerar ou substituir o áudio principal salvo instrução separada e autorizada.
2. **Tela cheia quando o detalhe precisa de área.** Demonstrações de interface, produto, documento, imagem ou cena podem ocupar o quadro inteiro quando a leitura/entendimento se beneficia de maior espaço.
3. **Split quando a presença do apresentador agrega.** Preservar tela dividida quando rosto, expressão, gesto ou continuidade pessoal ainda forem relevantes. Não converter automaticamente toda inserção em full-frame.
4. **Sem cobertura por ritmo artificial.** Não usar B-roll apenas para esconder o apresentador em cadência fixa ou para preencher segundos. A densidade varia conforme formato, conteúdo e estilo; longform não herda automaticamente densidade de Reel.
5. **Preferências explícitas vencem o automático.** Pedidos como “não cubra meu rosto aqui” ou “mostre isso em tela cheia” devem ser respeitados dentro do escopo válido e persistidos pelo caminho canônico.
6. **Áudio de apoio mudo por padrão.** Imagens não têm áudio; vídeos de apoio entram sem áudio salvo decisão posterior explícita. Música/SFX permanecem em decisões próprias.
7. **Entradas e saídas intencionais.** Aproveitar cortes ou pontos naturais quando conveniente, sem obrigar alteração da montagem aprovada apenas para encaixar o B-roll. Exceções seguem a lógica já aprovada nas decisões 19–20.
8. **Material adequado e verdadeiro.** Aplicam-se decisões 20–21: priorizar material pertinente/exato, não apresentar mídia genérica como demonstração específica, preservar procedência e não gerar/buscar/comprar automaticamente fora da autorização.

## Viabilidade CEVRA

Baseline de referência: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`, a revalidar antes da implementação.

- Project IR já possui fontes de imagem/vídeo, clips, overlays, `GraphicItem` e layouts; isso é infraestrutura, não B-roll end-to-end.
- O caminho executável de composição ainda depende do `CompositionEngineAdapter` e do benchmark/seleção previstos no ADR 0012.
- A ingestão local V1 cobre áudio/vídeo e a ingestão confiável de imagens segue como lacuna concreta a delimitar antes de inserir imagens.
- Aplicação/host/UI precisam representar, aplicar, persistir e revisar intervalos de cobertura pelo Project IR/ProjectHistory, com undo/redo e preview/export coerentes.
- Nenhum novo modelo de IA é necessário para executar um intervalo já decidido. A escolha criativa do momento/ativo depende do Director/agente ou de indicação explícita conforme capacidades reais.

## Custo e momento

B-roll com imagem adiciona composição e armazenamento; vídeo adiciona também decodificação e pode elevar CPU/GPU/RAM/tempo de renderização. Não há número de custo/latência medido nem promessa de impacto desprezível. Reaproveitar ativos e evidências válidos, evitar reprocessar fala por uma mudança puramente visual e medir operações representativas na implementação.

**Implementar na fatia de composição/B-roll**, depois do gate coordenado do Media Runtime e com ingestão de ativos/composição em estado suficiente. Nenhuma nova operação obrigatória do Media Runtime é aprovada por esta decisão.

## Validação futura

Validar pelo menos: imagem e vídeo em tela cheia; áudio de apoio realmente mudo; entrada/saída sem alterar a fala; alternância full-frame ↔ split ↔ apresentador; preferências explícitas; demonstrações que exigem leitura; ausência de cobertura excessiva; shortform e longform com densidade adequada; persistência/undo/redo; preview versus export; consumo de render e preservação de originais.

Registrar `DIVERGÊNCIA EDVID` apenas quando o comportamento implementado diferir materialmente e após comparação proporcional. Não alegar superioridade por esta aprovação.

## Continuidade

Esta decisão complementa `docs/CEVRA_COMPOSITION_DECISIONS.md` (19–20) e `docs/CEVRA_COMPOSITION_DECISION_21.md`. A próxima decisão funcional é a 23 — inserções gráficas/motion graphics e elementos atrás do apresentador. Nenhuma aprovação da decisão 23 é implícita.