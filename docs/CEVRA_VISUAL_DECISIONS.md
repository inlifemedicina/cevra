# CEVRA — decisões visuais aprovadas

**Aprovações originais:** 2026-09-16 a 2026-09-18.
**Reconciliação canônica:** 2026-09-21.
**Status:** D14–D17 APROVADAS / IMPLEMENTAÇÃO PENDENTE. D18 PÓS-V1.

Este documento preserva o comportamento visual aprovado sem declarar seleção de Composition Engine ou recursos entregues.

## D14 — Presets visuais ajustáveis

Preservar escolhas independentes úteis do EDVID e usar presets como atalhos ajustáveis, não pacotes fechados. O usuário pode combinar composição, título, legenda, cor e elementos, desligar opções e alterar somente o componente pedido sem mudar montagem ou identidade inteira.

Reaproveitar preferências válidas; não exigir nova escolha quando já informada. Combinações próprias não carregam falas/timestamps do projeto e não são alteradas retroativamente. Amostras devem representar capacidade realmente executável; preview real é a referência do conjunto. Preset visual, Workflow Preset e perfil de exportação permanecem responsabilidades distintas.

## D15 — Fidelidade e timing das legendas

Legenda representa a fala efetivamente ouvida e acompanha o tempo do áudio, inclusive J-cuts. Reutilizar transcrição/alinhamento válidos, sem retranscrição obrigatória; investigar dúvida concreta e permitir análise adicional quando justificada.

Correção de legenda não altera áudio nem substitui silenciosamente a transcrição canônica. Mudanças de montagem remapeiam tempos e preservam correções ainda válidas. Palavras/tempos podem alimentar estilos e SRT com agrupamentos próprios. O compilador temporal e a ligação à ocorrência/versão ainda precisam ser implementados e validados.

## D16 — Agrupamento legível

Quebrar por estilo considerando pontuação, pausas, tempo e largura real. Procurar divisão melhor antes de reduzir texto excessivamente. Evitar palavras que apenas piscam quando o estilo permitir, sem apagar ou reescrever fala. Não impor o mesmo número de palavras/linhas a todos os estilos e não usar IA por quebra mecânica.

## D17 — Caption Placement Planner, safe-zones e QA

Planejamento local, determinístico e progressivo por intervalo:

1. layout, aspecto, safe areas, headline, split/B-roll/overlays e posição explícita;
2. evidência leve de face/pessoa quando houver risco;
3. máscara amostrada/occupancy quando região aproximada for insuficiente;
4. matting temporal apenas para oclusão real, como behind-the-subject.

Usar o menor nível suficiente. Posição fixada pelo usuário não é sobrescrita silenciosamente. Mudanças de layout geram ajustes estáveis por intervalo e retorno correto ao final.

Brand Kit/preset e escolha explícita precedem fallback de legibilidade. Luminância pode escolher variante já suportada, outra zona ou aviso; não cria nova família de legenda. Snapshots derivados e seletivos podem validar mudanças de layout e trechos sinalizados antes de render completo.

Caption QA detecta clipping/overflow, safe-area, conflito de headline/layout/sujeito quando houver evidência, legibilidade, override obsoleto, posição explícita sobrescrita e divergência preview/export. Emite PASS/WARN/FAIL/UNKNOWN e não corrige sozinho.

`SubjectMaskProvider` é fronteira abstrata; não seleciona U2Net, PP-Matting, RVM ou outro motor. HeroEmphasis é capability visual separada, não novo estilo de legenda, e exige decisão editorial e matting adequado antes da implementação.

## Catálogo V1 de legendas

Preservar o piso EDVID: Karaokê, Empilhado, Disperso, Simples, Serifada, Clássica e Nenhum. Placement, safe-zones, QA e HeroEmphasis são capacidades auxiliares.

O pequeno font pack V1 aprovado usa Poppins, Playfair Display, Lora, Libre Baskerville e Inter, com arquivos/pesos/revisões fixos, OFL/NOTICE, cobertura PT-BR e métricas idênticas em preview/export. A incorporação ainda exige auditoria e empacotamento; não usar fallback de sistema que altere layout silenciosamente.

## D18 — Personalização adicional pós-V1

Controles extras de fonte, tamanho, cor, contorno, sombra, fundo e tipografia ficam para reavaliação pós-V1. Os seis estilos + Nenhum continuam V1. Não construir editor tipográfico amplo nem reforma grande para pequenas personalizações. Brand Kit V1 pode selecionar identidade/preset já suportado sem reabrir D18.

## Estado de implementação

Caption compiler, placement, QA, font packaging, snapshots, engine visual e matting não são declarados prontos por este documento. Implementar depois das bases temporais, do Preview V1 e do benchmark/seleção do Composition Engine, seguindo o roadmap canônico.
