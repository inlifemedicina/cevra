# CEVRA — Decisão 23: motion graphics e behind-the-subject

**Data:** 2026-09-17.
**Status:** DIREÇÃO DE PRODUTO APROVADA; MOTOR DE MATTING/SEGMENTAÇÃO E DETALHES DE BIBLIOTECA A VALIDAR; IMPLEMENTAÇÃO NÃO AUTORIZADA POR ESTE REGISTRO.

## Decisão aprovada

O CEVRA preservará os motion graphics e o efeito behind-the-subject úteis do EDVID, mas os executará por componentes e operações tipadas, sem permitir que um agente escreva ou execute código arbitrário por vídeo dentro do aplicativo. A biblioteca inicial será pequena e extensível, formada apenas por componentes reutilizáveis de alto valor; não será um editor genérico de motion design nem exigirá uma grande biblioteca antes da V1.

Para behind-the-subject, o CEVRA manterá a função planejada, mas a escolha do motor será feita por benchmark local e auditoria de licença/proveniência antes da incorporação. O EDVID usa Robust Video Matting (RVM) via `helpers/person_matte.py`; a inteligência editorial decide quando usar o efeito, enquanto a separação da pessoa é executada localmente pelo modelo/ferramenta. Portanto, a função não existe por o EDVID rodar “dentro da IA”.

## Motion graphics

- Começar com catálogo pequeno de componentes parametrizáveis (ex.: card, seta/destaque, contador/número, gráfico simples, timeline, texto digitado, formas/callouts), adicionando novos componentes somente quando necessidades reais justificarem.
- Director/agente pode escolher e parametrizar componentes já validados, mas não injetar TSX, Python, shell, filtergraphs ou código arbitrário no projeto.
- Pedido não coberto por componente existente pode usar alternativa segura (imagem/B-roll/gráfico existente) ou aguardar expansão posterior; não criar automaticamente um sistema universal de animação.
- Toda alteração audiovisual durável segue Project IR/ProjectHistory e comandos tipados, preservando undo/redo, persistência e revisão.

## Behind-the-subject e matting

A referência EDVID `fillrochaa/edvid@d8e6389db02e8de0b46ee680105c09d4250d4703` utiliza `person_matte.py`, que carrega Robust Video Matting por PyTorch, produz alpha temporalmente estável e depois compõe o elemento entre fundo e pessoa. Essa capacidade exige processamento local adicional; a IA não realiza o recorte frame a frame.

O RVM permanece referência de qualidade, mas o repositório oficial atual é GPL-3.0. Isso não impede uso privado/testes, porém sua incorporação/distribuição em um produto proprietário comercial requer análise jurídica/arquitetural específica para evitar conflito de copyleft, além de auditoria separada dos pesos/modelos. Não assumir que o modo de uso do EDVID é automaticamente adequado para distribuição no CEVRA proprietário.

Antes da escolha final, comparar alternativas locais com licenças mais permissivas quando disponíveis, priorizando qualidade temporal e compatibilidade comercial. A avaliação deve incluir pelo menos uma opção permissiva adequada para portrait/video matting e usar RVM como referência comparativa. Considerar também alternativas mais leves de segmentação quando fizer sentido, sem confundir segmentação simples com matting fino de cabelo/bordas.

Critérios mínimos do benchmark: cabelo/bordas finas, mãos, movimento rápido, fundos complexos, flicker temporal, resolução de saída, CPU/GPU/RAM, tempo de processamento, tamanho/pesos, empacotamento, dependências, licença/proveniência e redistribuição comercial.

Se uma alternativa permissiva atingir qualidade adequada, preferi-la. Se nenhuma atingir o piso, retornar ao product owner antes de incorporar RVM ou outra dependência de licença restritiva. Behind-the-subject não deve bloquear a V1 básica caso o motor seguro/adequado ainda não esteja resolvido.

## Viabilidade e momento

O Project IR já representa `GraphicItem` de texto, imagem, vídeo, shape e Lottie e possui layouts/intervalos, mas isso não prova motor de motion graphics integrado. Precisaremos de componentes parametrizados, comandos/representação validados quando faltarem, compilação para o Composition Engine, UI, preview/export e testes.

Gráficos comuns pertencem à fatia de composição e não adicionam por si só nova operação obrigatória ao inventário coordenado do Media Runtime. Matting/segmentação é uma dependência própria que deve ser avaliada na fatia behind-the-subject; não entra silenciosamente no gate MR atual.

Implementar após os gates existentes, junto da composição, sem bloquear a V1 por recursos avançados. Antes de dependência externa/modelo/peso efetivo, auditar versão exata, licença, proveniência, termos, privacidade, empacotamento e compatibilidade comercial.

## Validação futura

Validar componentes gráficos comuns com preview/export equivalentes, parâmetros editáveis, persistência, undo/redo e ausência de execução arbitrária. Para behind-the-subject, comparar fixtures representativas contra a referência EDVID/RVM, inspecionando bordas, cabelo, movimento, flicker e custo total. Não declarar paridade/superioridade ou segurança jurídica sem evidência.

## Continuidade

Esta decisão complementa as decisões 19–22. O próximo planejamento funcional de composição não deve supor que um motor de matting já foi escolhido. A escolha concreta volta no marco técnico correspondente com benchmark e auditoria. Nenhuma seleção de modelo, download, gasto, integração ou código é autorizada por este registro.