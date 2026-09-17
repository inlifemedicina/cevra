# CEVRA — Decisão 21: busca e incorporação de mídia externa

**Data:** 2026-09-17.
**Status:** DIREÇÃO DE PRODUTO APROVADA; MECANISMO CONCRETO DE INTEGRAÇÃO PENDENTE PARA O MARCO ADEQUADO; IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.

## Decisão aprovada

O CEVRA permitirá busca externa de imagens e vídeos dentro de autorização delimitada, incorporando os arquivos escolhidos ao projeto como ativos locais estáveis, com qualidade adequada e procedência registrada. O projeto não deverá refazer a busca nem substituir silenciosamente um ativo a cada renderização. Falhas, limitações e condições de uso desconhecidas devem permanecer visíveis. Busca, download, geração, compra ou envio de dados não são implicitamente autorizados fora do escopo dado pelo usuário.

A escolha editorial do material segue a decisão 20: pertinência à passagem e ao estilo, preferência por material exato adequado, sem ilustrar palavras mecanicamente nem apresentar mídia genérica como demonstração de algo específico.

## Integração reavaliada no marco correto

O product owner confirmou que o comportamento acima está aprovado, mas que a forma concreta de comunicação para busca de imagens/vídeos será reavaliada mais à frente. Portanto, esta decisão NÃO escolhe agora fornecedor, agente, modelo, API, transporte, autenticação, cobrança, mecanismo de retorno, instalador ou UI final de busca.

Antes da implementação dependente, a integração real deve ser confrontada com o Director e com o caminho de ativos do aplicativo: contexto/evidência necessários → agente/provedor autorizado quando aplicável → candidatos/proposta estruturada → validação CEVRA → incorporação canônica do ativo → composição/revisão. Preservar a prova antecipada de ida e volta já prevista no registro do Director; não esperar o editor inteiro estar pronto para descobrir incompatibilidades materiais.

Se a solução futura exigir mudança de contratos, ingestão, permissões, armazenamento ou arquitetura, aplicar o gate fix-now versus defer: mostrar conflito, alternativas, impacto agora/depois e obter aprovação antes de mudança material. Decisões aprovadas podem ser refinadas ou marcadas SUPERSEDED de forma explícita; não se presume que qualquer integração futura será simples.

## Dependências e momento

A ingestão confiável de imagens ainda precisa ser delimitada antes de uso end-to-end; o serviço de ingestão local V1 atualmente cobre áudio/vídeo. A busca externa entra depois como provider/adaptador e não deve criar estado audiovisual paralelo ao Project IR/ProjectHistory. Nenhuma nova operação do Media Runtime é aprovada por esta decisão.

Implementar somente depois dos gates já aprovados e no marco de ativos/integrations/composição, revalidando baseline, termos/licenças, privacidade, procedência, consumo e compatibilidade comercial do provedor efetivamente escolhido.

## Continuidade

Esta decisão complementa `docs/CEVRA_COMPOSITION_DECISIONS.md` (decisões 19–20). Até a reconciliação documental, ler ambos. A próxima decisão funcional é a 22 — política de B-roll/cobertura em tela cheia versus manutenção do apresentador/tela dividida. Nenhuma aprovação da decisão 22 é implícita.
