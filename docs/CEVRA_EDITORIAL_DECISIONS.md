# CEVRA — Decisões de análise editorial e montagem

**Data das aprovações:** 2026-09-16, conversa do product owner.
**Versão do registro:** 2.
**Status:** DIREÇÃO DE PRODUTO / IMPLEMENTAÇÃO NÃO AUTORIZADA NESTA DISCUSSÃO. Ver o status específico de cada seção.
**Escopo:** decisões 1–10 aprovadas, refinamentos finais, diretrizes transversais e levantamento condicionado da decisão 11 na conversa “CEVRA — Análise editorial e montagem”.

## 0. Autoridade, continuidade e situação da integração

Este é o registro detalhado das decisões desta discussão, não um segundo Master Context. Ler em conjunto com `docs/CEVRA_MASTER_CONTEXT.md`, `AGENTS.md`, Architecture Canon e ADRs aceitos. Project IR / ProjectHistory continuam sendo a única autoridade audiovisual editável. Evidências, projeções, propostas e resultados de provedores não substituem o estado canônico.

A redação refinada e aprovada abaixo prevalece sobre sugestões anteriores desta conversa. Aprovação de direção não comprova desempenho, superioridade editorial ou disponibilidade de uma integração. Não foram escolhidos modelos, fornecedores, limites numéricos finais ou uma nova arquitetura.

Estado consultado na criação deste registro (histórico, não atualização dos PRs):

- `main`: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`.
- PR #24, Transcript Cache V1: aberto e draft, head `5131d9f8e372a37ae7e8749d6e000e6e88553da2`; não declarar merge/closeout a partir desta discussão.
- PR #25, Director e política de discussões: aberto e draft, head `fe4c58b6d2100b95f636c4e2b07c7cf03bc95be6`. Suas decisões aprovadas foram consideradas, mas ainda não integram `main` nesse estado.
- Este registro nasce na branch documental independente `docs/editorial-decisions-1-8`, sem modificar `main`, PR #24 ou PR #25.

Referência do Director enquanto o PR #25 não estiver integrado: [CEVRA_DIRECTOR_DECISIONS.md na revisão consultada](https://github.com/inlifemedicina/cevra/blob/fe4c58b6d2100b95f636c4e2b07c7cf03bc95be6/docs/CEVRA_DIRECTOR_DECISIONS.md) e [política de discussões no AGENTS.md dessa revisão](https://github.com/inlifemedicina/cevra/blob/fe4c58b6d2100b95f636c4e2b07c7cf03bc95be6/AGENTS.md).

Até a integração documental, recuperar explicitamente esta branch/PR ao depender destas decisões. Antes de um prompt de implementação dependente, reconciliar os registros com o estado real do cache e do Director, adicionar resumo curto/link ao Master Context e seguir aprovação/revisão/CI normais. Não mover `main` apenas para registrar decisões enquanto outro trabalho depender de uma base congelada. Esta autorização de registro não autoriza merge, código, novas dependências, gastos ou publicação do produto.

## 1. Referência EDVID e método de comparação

Baseline: `fillrochaa/edvid`, revisão `d8e6389db02e8de0b46ee680105c09d4250d4703`, não `edvid-lt` nem o upstream flutuante.

Arquivos verificados durante a discussão:

- [SKILL.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/SKILL.md): inventário, leitura compacta, evidências sob demanda, pré-scan, estratégia, aprovação, seleção de takes e junções.
- [helpers/pack_transcripts.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/pack_transcripts.py): agrupamento de palavras por pausa ou mudança de falante quando disponível, preservando fonte/texto/localização.
- [references/longform.md](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/references/longform.md): intenção de ritmo diferente da compressão shortform.
- [helpers/render.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/render.py): J-cut padrão com avanço global de cinco frames e aparo final de até dois frames limitado por silêncio medido.
- [helpers/verify_cut.py](https://github.com/fillrochaa/edvid/blob/d8e6389db02e8de0b46ee680105c09d4250d4703/helpers/verify_cut.py): verificações numéricas; ausência de alertas técnicos não demonstra qualidade semântica ou naturalidade.

EDVID continua sendo o piso funcional/editorial. Estudar seu comportamento antes de propor adaptações; preservar o que funciona, adaptar às garantias do CEVRA e testar paridade. O EDVID já prevê evidência visual sob demanda e preservação de pausas expressivas: não descrevê-lo como simples removedor de silêncio ou exclusivamente textual.

## 2. Decisão 1 — Entrada editorial

**APROVADA, com esclarecimento final incorporado.**

Importar cadastra a mídia e permite as verificações básicas necessárias: validade, duração, resolução/orientação e presença de áudio. Não aciona automaticamente toda a preparação editorial pesada ou interpretação externa.

O pedido de edição ou início de um workflow/preset pertinente aciona a preparação e compreensão necessárias, reutilizando trabalho válido. Nenhum corte é decidido apenas pela importação ou pelo pré-processamento. Presets e ações explicitamente determinísticas não passam a exigir análise semântica desnecessária.

O primeiro contato editorial demonstra entendimento do material e solicita somente o que ainda for relevante para orientar a edição. Não fixa takes, exclui conteúdo ou aplica a montagem antes do escopo de autorização já estabelecido.

## 3. Decisão 2 — Leitura progressiva conforme o conteúdo

**APROVADA, incluindo 2A, 2B e os esclarecimentos finais.**

### 3.1 Modalidade dominante

Manter a leitura compacta e progressiva do EDVID, usando fala como eixo em conteúdo predominantemente verbal e evidência visual como eixo ou complemento quando a imagem carregar informação editorial necessária.

A projeção textual compacta não é uma reescrita/resumo que substitui as falas: preserva texto e referências verificáveis de fonte, trecho e evidência. Material sem fala ou predominantemente visual não depende de transcrição para avançar. Não há inspeção integral de todos os frames ou pacote de todas as análises obrigatório em todo projeto.

Referências de fala, como “olha isso”, podem motivar busca de evidência visual; não provar o que aparece. Entonação, expressões, gestos e continuidade visual não devem ser inventados a partir de transcrição. Ausência de evidência permanece uma limitação explícita.

### 3.2 Decisão 2A — Preparação local e raciocínio editorial

CEVRA prepara localmente as medições e evidências objetivas necessárias, usando os motores e operações suportados: inventário técnico, transcrição/alinhamento quando pertinentes, evidência acústica e seleção de evidência visual quando útil. Modelos locais de transcrição também são IA; preparação local não significa ausência de IA.

O modelo/agente editorial interpreta significado, alternativas e intenção. O Director coordena e valida; não se torna, por isso, um modelo local obrigatório ou editor heurístico autossuficiente.

Fluxo de direção aprovado: fontes -> preparação local pertinente -> contexto compacto verificável -> modelo editorial -> evidência adicional se necessária -> entendimento/estratégia -> aplicação somente pelo caminho autorizado.

Não enviar vídeo integral a provedor externo por padrão. Texto, frames ou pequenos trechos adicionais dependem da necessidade e do escopo autorizado. Processamento em servidor do CEVRA também não é processamento no dispositivo; sua transferência de dados deve ser transparente.

### 3.3 Decisão 2B — Melhor resultado possível sem API paga obrigatória

O objetivo é o aplicativo mais econômico possível para obter bons resultados, preferencialmente sem API paga de IA. Isso não define preço de venda, assinatura ou gratuidade comercial do próprio CEVRA.

A preferência discutida é: processamento determinístico/local para tarefas que ele resolve -> modelos locais suficientemente bons -> modelos open-weight self-hosted quando vantajosos -> recursos cobertos por integrações/entitlements oficiais do usuário -> APIs pagas opcionais/BYOK. Esta orientação não modifica silenciosamente a política separada de preferência do asset planner para geração de mídia.

**Não implementar essa preferência como cascata obrigatória de modelos.** Selecionar um caminho adequado à tarefa, às capacidades e à autorização; reutilizar resultados válidos. Escalar somente diante de insuficiência concreta, sem mudança silenciosa de fornecedor, dados transmitidos ou cobrança.

Modelo sem cobrança por chamada não elimina custo de hardware, servidor, energia, operação ou manutenção. Não impor um modelo local que exija hardware desproporcional ou comprometa a qualidade, nem apresentar um fallback mecânico como julgamento semântico equivalente.

**Pesquisa/benchmark pendente:** modelos locais ou self-hosted multimodais/editoriais, incluindo famílias Qwen e Mistral mencionadas como candidatas e outras adequadas na data da implementação. Comparar PT-BR, compreensão audiovisual, seleção/montagem, latência, memória/VRAM, instalação/manutenção, privacidade, custo total e licença comercial da versão exata. Nenhum candidato está selecionado, licenciado para o produto ou comprovado superior por este registro. Não perpetuar alegações não verificadas da conversa sobre variantes, capacidades ou disponibilidade.

### 3.4 Mobile

A mesma estratégia deve orientar o mobile: preparar/selecionar evidências no dispositivo quando viável, ou com auxílio de desktop pareado autorizado, para enviar ao modelo somente o necessário. Não exigir no celular as mesmas cargas/modelos do desktop.

Reduzir o envio à IA não elimina a necessidade de disponibilizar a mídia original ao nó que efetivamente renderizar. Mobile, transporte, pareamento e segurança continuam sujeitos aos seus gates; esta direção não declara esses recursos implementados nem os torna bloqueadores do desktop.

## 4. Decisão 3 — Qualidade dos takes: evidências, não exclusão automática

**APROVADA como direção a validar em vídeos reais.**

A pré-análise aproveita transcrição alinhada e evidências acústicas e, quando necessárias, visuais. Pode sinalizar pausas, níveis baixos, tempos suspeitos, possíveis falsos inícios, repetições candidatas e possíveis palavras cortadas.

Essas marcações não autorizam apagar conteúdo. Uma hesitação pode ser expressiva; uma repetição pode ser útil. Medir pausas/volume é diferente de compreender sua função. Não afirmar que uma heurística local determinou um erro semântico.

A IA editorial interpreta os indícios no contexto; o plano autorizado determina a montagem. Se a dúvida puder mudar uma decisão relevante, investigar o intervalo correspondente em vez de adivinhar. A retranscrição isolada, quando necessária, é evidência adicional a confrontar com áudio e tempos, não permissão para substituir silenciosamente a transcrição canônica da fonte.

A análise deve ser proporcional ao pedido e às fontes pertinentes, sem inspeção exaustiva obrigatória. Esse refinamento não dispensa verificações necessárias à segurança/qualidade de um corte nem comprova paridade antes dos testes.

## 5. Decisão 4 — Melhor take por função narrativa

**APROVADA.**

Distinguir alternativas que transmitem essencialmente a mesma informação, passagens complementares e afirmações contraditórias. Não descartar complemento como duplicação; investigar contradições relevantes em vez de escolher silenciosamente a versão conveniente.

Entre alternativas reais, recomendar a mais adequada ao objetivo considerando sentido, clareza, naturalidade, expressividade e condições audiovisuais. Não impor pontuação rígida, “último take”, “mais curto” ou “sem hesitações” como vencedor automático. Aspectos não presentes nas evidências não recebem avaliações inventadas.

A escolha traz justificativa breve e referência verificável; outras opções continuam disponíveis. Isso não exige pré-renderizar todas as alternativas ou criar um novo sistema de armazenamento concorrente ao Project IR. A escolha integra o plano/revisão, sem aprovação obrigatória por take e sem aplicação antes da estratégia autorizada.

## 6. Decisão 5 — Reorganizar e combinar sem fabricar discurso

**APROVADA.**

Pode-se reordenar e combinar fontes/trechos dentro da estratégia autorizada. Os modos automático, ordem explícita e híbrido já aprovados no Director são preservados, não reabertos.

Priorizar passagens contínuas com sentido; cortes internos e combinações de tentativas são permitidos quando preservarem contexto, entonação e continuidade. Não fragmentar apenas porque existem limites de palavras disponíveis.

Preservar dependências como perguntas/respostas, referências anteriores, condições, ressalvas, demonstrações e ações visuais. Uma união tecnicamente limpa não autoriza retirar uma condição essencial ou fabricar uma afirmação que o material em contexto não sustenta.

Quando a compatibilidade não puder ser confirmada, buscar outra montagem ou sinalizar a limitação relevante em vez de forçar a emenda.

## 7. Decisão 6 — Duração, condensação e conflito de requisitos

**APROVADA com revisão futura conforme as opções reais de IA.**

Distinguir limpeza de gravação de resumo editorial: remover erros/redundâncias não concede automaticamente autorização para retirar explicações relevantes.

Distinguir duração aproximada, máxima e exata. Alvo aproximado permite propor desvio justificado; teto ou duração exata não podem ser descumpridos silenciosamente. Sem duração informada, propor duração coerente com o pedido/material dentro da estratégia, sem questionário obrigatório.

Primeiro buscar soluções compatíveis: take mais conciso, redundâncias dispensáveis ou conteúdo secundário quando o escopo autorizar. Não retirar conteúdo obrigatório, ressalvas essenciais ou acelerar a fala sem autorização apenas para cumprir o relógio.

Conflitos entram na proposta com alternativa concreta antes da execução. Uma sugestão de 75 segundos diante de teto de 60 segundos continua não conforme até autorização; a IA pode recomendar mudar o requisito, não alterá-lo sozinha.

CEVRA calcula duração a partir da montagem real planejada, incluindo sobreposições, e verifica o resultado. O modelo editorial avalia impacto semântico; o usuário decide quando necessário. Duração e obrigatoriedades entram no contexto inicial para evitar reanálises artificiais. Selecionar entre alternativas válidas já avaliadas e autorizadas não exige nova IA; questão semântica nova pode exigir contexto/evidência adicional.

Nenhum modelo ou local de inferência foi escolhido. Preferir julgamento local quando suficiente; sem modelo adequado, reportar o conflito e disponibilizar controles/revisão, sem fingir que uma regra compreendeu o significado.

## 8. Decisão 7 — Ritmo fluido e intervenção seletiva

**APROVADA na redação refinada; substitui a formulação genérica inicial desta conversa.**

O ritmo depende do objetivo, preset e material e pode variar por passagem. O padrão pretendido é edição fluida e seletiva: nem compressão máxima, nem preservação passiva dos defeitos. Vertical/horizontal ou curto/longo não impõem, por si sós, agressividade.

Cada pausa pode ser preservada, encurtada ou removida. Duração ou ausência de voz isoladamente não autorizam o corte. Uma pausa útil também pode conter excesso dispensável; não exigir escolha binária entre preservar tudo ou eliminar tudo.

Um corte deve justificar a descontinuidade introduzida. Preferir passagens contínuas ou take alternativo quando pequenos ganhos de tempo exigirem fragmentação perceptível. Não impor limite universal de cortes por minuto ou intervalos idênticos.

Avaliar os ajustes no conjunto da passagem, com o antes/depois e a ação audiovisual. Preservar sentido, compreensão, respirações úteis, reações, gestos e demonstrações. Dinamismo maior continua disponível quando autorizado, sem abolir essas proteções.

Execução e QA respeitam pausas/ações intencionalmente preservadas. Um alerta numérico de silêncio longo não ordena removê-lo. “Sem alertas técnicos” não prova naturalidade ou qualidade editorial. Verificação técnica local primeiro, avaliação audiovisual adicional proporcional à necessidade, sem segundo modelo obrigatório ou consulta por pausa.

Na ambiguidade relevante, obter evidência quando necessário; não iniciar loops indefinidos nem perguntar ao usuário sobre cada detalhe. Sem suporte para uma intervenção ambígua, preferir uma alternativa menos intrusiva que respeite o escopo.

## 9. Decisão 8 — Junções controladas por trecho

**APROVADA com escopo limitado e validação de custo/qualidade.**

Preservar corte direto e J-cut como recursos automáticos. Ajustar a junção ao intervalo e à continuidade previstos no plano, sem avanço fixo obrigatório em todas as emendas. J-cut não é sinônimo de perda de sincronismo nem autorização para sobrepor falas.

Considerar conjuntamente as margens de saída/entrada: não somar sobras técnicas em uma espera artificial, nem comprimir uma pausa protegida. Usar uma junção menos intrusiva quando já entregar o resultado; permitir antecipação de áudio quando houver evidência e margem compatíveis.

Preservar palavras, sincronismo, pausas e ações relevantes. Se a junção não funcionar, ajustar limites ou usar outra alternativa, em vez de forçar emenda, sobreposição involuntária de voz ou compensação automática por zoom/efeito/mídia gerada.

Limites de implementação aprovados:

- Reutilizar transcrição/alinhamento, medições e orientações válidas; nenhuma IA nova ou consulta obrigatória por junção.
- Planejar uma junção candidata antes de renderizar; não gerar/comparar várias renderizações de cada corte por padrão. Correções justificadas continuam possíveis.
- Corte direto bem posicionado é alternativa conservadora quando o J-cut não for sustentado; se também falhar, ajustar ou sinalizar o problema relevante.
- Reutilizar motores, comandos e compiladores existentes. Operação ausente exige justificativa delimitada e os gates do repositório, não criação automática de segundo runtime ou grande reforma.
- Medir preparação, exportação e pico de memória inclusive em vídeos com muitas junções; separar acréscimo desta política do custo já existente de transcrição/análise/render.

Não foi aprovado um custo “desprezível” ou um limite numérico final. Custo desproporcional exige revisão da solução, não expansão automática de complexidade. Preservar as garantias canônicas de bordas de palavras, margens e suavização de áudio enquanto seus detalhes não forem revisados expressamente.

## 10. Quatro esclarecimentos da revisão final — APROVADOS

1. **Importar apenas cadastra não proíbe verificações básicas.** A restrição é à preparação editorial pesada/inferência automática não solicitada, não ao conhecimento técnico mínimo do arquivo.
2. **Análise inicial não é um pacote obrigatório.** Obter evidência suficiente para a edição e aprofundar o relevante; conteúdo visual não espera uma transcrição inútil. Indício local não vira conclusão semântica.
3. **Preferência econômica não é cascata de modelos.** Evitar repetir o mesmo raciocínio em local, servidor e provedor sem insuficiência concreta e autorização; não mascarar custo de infraestrutura como gratuidade.
4. **Um planejamento coordenado.** Limpeza, ritmo e junções não são oito sistemas independentes. Reaproveitar medições e impedir redução repetida da mesma pausa em diferentes fases. Não dispensar refinamento iterativo legítimo; exigir que ele respeite o plano vigente. Aprovação continua por estratégia/plano, não por emenda.

## 11. Diretrizes transversais — APROVADAS

### 11.1 Comercialização e investigação jurídica

CEVRA será comercializado. Antes de incorporar ou anunciar modelo, pesos, runtime, biblioteca, dataset ou serviço, investigar a versão e o caminho exatos de uso: licença/proveniência, direitos de uso e redistribuição comercial, hospedagem/embedding, obrigações de atribuição ou disponibilização, termos de conta/entitlements, privacidade e condições de comercialização/registro do produto.

“Gratuito”, “open-source”, “open-weight” ou assinatura pessoal não bastam como autorização. Sem elegibilidade demonstrada, não tratar a integração como aprovada para distribuição. Dúvidas materiais exigem revisão jurídica qualificada; este registro não é auditoria nem garantia de risco jurídico zero. Não reutilizar marcas/trade dress nem prometer integração comercial ainda não verificada.

### 11.2 Melhorias em qualquer componente

A autorização para propor melhorias vale para Director e qualquer área do Orbit. Trabalho aprovado não é intocável, mas também não é reaberto sem motivo. Preservar -> estender -> verificar -> migrar somente se necessário.

Antes de alteração material, apresentar problema/evidência, benefício esperado, alternativas, impactos, custo de corrigir agora versus depois e recomendação delimitada. Obter aprovação; marcar a decisão anterior SUPERSEDED/refinada com data e substituição; reconciliar registros/ADRs/testes pertinentes. Não interpretar esta diretriz como autorização geral de implementação, migração ou merge.

### 11.3 Propostas refinadas e custo-benefício real

Antes de apresentar cada proposta, confrontar a solução inicial com alternativas e refiná-la para equilibrar qualidade entregue, processamento, memória, armazenamento, espera, consumo de IA, infraestrutura, complexidade, manutenção, suporte e compatibilidade comercial.

Recomendar a solução mais simples que satisfaça a qualidade necessária e preserve capacidades, sem empurrar custo maior para o futuro. A resposta ao product owner apresenta a conclusão, o benefício principal, a contrapartida relevante e por que preferi-la, não uma longa lista obrigatória de possibilidades.

Distinguir hipótese de evidência medida. Validação proporcional à importância; nenhum ganho exato de custo/desempenho ou superioridade editorial sem teste. Gratuidade nominal não vence automaticamente uma solução melhor no custo total, mas API paga permanece opcional, não requisito introduzido silenciosamente.

### 11.4 Viabilidade executável antes de pedir aprovação — acrescentada em 2026-09-16

Toda proposta deve ser confrontada com o que o CEVRA realmente executa no baseline consultado, antes de ser apresentada para adoção. Ler contratos, implementação e evidência de testes pertinentes; um nome de motor, uma interface ainda não integrada ou uma capacidade genérica do upstream não demonstram entrega ponta a ponta.

Explicitar de forma proporcional: o que já existe e pode ser reutilizado; o que só precisa de integração; o que exige extensão interna de contrato/adapter/worker/bundle/aplicação/Project IR/UI; o que depende de componente externo ou pesquisa. Marcar o desconhecido como não verificado, sem convertê-lo em recurso disponível ou dependência obrigatória.

Quando a proposta exceder as capacidades existentes, informar ao product owner a implementação adicional mínima, os componentes afetados, novas dependências, impacto esperado em qualidade/consumo/custo/complexidade/manutenção e elegibilidade comercial. Apresentar alternativa mais simples quando houver e comparação entre corrigir agora ou depois. Esses custos e lacunas podem levar a reduzir, adiar ou rejeitar a proposta, não são detalhes a descobrir somente após a aprovação.

Não iniciar implementação ou testes com efeitos externos sob autorização de discussão. Lacunas materiais descobertas posteriormente voltam para avaliação antes de ampliar escopo. Não atribuir toda integração nova ao Media Runtime: separar o que pertence ao motor do que pertence ao planejamento, aos comandos e à UI.

## 12. Validação e divergências EDVID

**Pendente, não executada por este registro.** Testar material real com os mesmos vídeos, objetivo e, quando possível, modelo editorial. Incluir fala já fluida, múltiplas tentativas, demonstração com pausas sem voz, pausas expressivas e muitas junções. Comparar excesso de cortes e lentidão residual, sentido, naturalidade, continuidade, correções manuais e consumo. Menor duração não é vitória automática.

Registrar adaptações intencionais na matriz aplicável como `DIVERGÊNCIA EDVID` quando efetivamente mudarem comportamento. Pontos a validar incluem acionamento editorial separado da importação, modalidade dominante e profundidade proporcional, ritmo não rigidamente vinculado ao formato e avanço de J-cut controlado por junção. Não declarar que orientações visuais/contextuais já existentes no EDVID são invenções do CEVRA.

Nenhuma divergência dispensa evidência de paridade/superioridade nem revoga silenciosamente hard rules preservadas. Os limiares acústicos, margens e parâmetros finais devem ser escolhidos nas respectivas fatias, sem copiar números de exemplo como garantias universais.

## 13. Retorno ao chat dos prompts e próximos gates

A discussão aprovou comportamentos, não uma implementação monolítica. O cache em andamento não recebe nova análise editorial por causa deste registro. Concluir seu processo real e reconciliar os PRs documentais antes de emissão de prompt dependente.

O próximo estágio do roadmap é contexto/transcrição editorial compacta e evidências, seguido por estratégia/plano/validação. As decisões registradas orientam seu escopo; não exigem que todos os modelos, técnicas de corte, mobile ou estilos estejam escolhidos antes de construir uma projeção básica.

**Atualização de 2026-09-16:** a discussão de conteúdo mínimo da estratégia, antes pendente na versão 1, foi resolvida pela decisão 9; cor/aparência foi aprovada na decisão 10. Ambas constam da seção 15. A decisão 11 tem levantamento e planejamento de extensões registrados na seção 16; não confundir isso com implementação ou autorização indiscriminada de restauração avançada.

Verificação/correções (decisão 12 candidata) e revisão da montagem/avanço de fase (decisão 13 candidata) continuam pendentes. Parâmetros exatos, QA/preview, composição e demais integrações permanecem nos respectivos gates. O mapa de discussões não exige bloqueio de trabalho seguro não dependente.

**Impacto no Director e demais componentes:** extensão comportamental compatível em intenção; futuros contratos precisam preservar contexto com evidências, restrições de duração/ritmo, autorização, referências/digests e plano único. Nenhuma auditoria de implementação ou garantia de ausência de conflito futuro é alegada. Conflito material descoberto deve voltar ao product owner antes de implementar.

## 14. Integração documental pendente

Antes de marcar pronto/mesclar, reconciliar com os resultados reais do PR #24 e PR #25; preservar alterações concorrentes e a política de discussão. Adicionar resumo/link deste registro e do Director ao Master Context, atualizar o estado real das branches e integrar a diretriz transversal ao AGENTS sem duplicar o texto detalhado. Este arquivo não fecha marcos nem muda o main canônico.

Resumo curto atualizado para o índice, sem copiar todo este registro:

> 2026-09-16 — DIREÇÃO APROVADA / IMPLEMENTAÇÃO PENDENTE: decisões 1–10 de entrada, leitura multimodal, evidências, takes, montagem, duração, ritmo, junções, estratégia e cor. Preparação compartilhada, sem cascata obrigatória de modelos ou compressão repetida de pausas. Priorizar bons resultados sem API paga obrigatória, evidência mínima no mobile, auditoria comercial e propostas refinadas por custo total e viabilidade executável. Decisão 11: lacunas de áudio e extensões do Media Runtime reunidas para planejamento futuro, não execução automática; restauração avançada ainda depende de investigação. Registro detalhado: `docs/CEVRA_EDITORIAL_DECISIONS.md`.

## 15. Continuidade — decisões 9 e 10

### 15.1 Decisão 9 — Estratégia principal clara e perguntas proporcionais

**APROVADA em 2026-09-16; resolve a pendência indicada na versão 1.**

Preservar a conversa contextual e a confirmação da estratégia do EDVID. Apresentar uma proposta principal compreensível e ajustável, reaproveitando pedido, material, restrições e preset. Não obrigar o usuário a preencher checklist fixo, escolher entre várias propostas ou repetir informação já disponível.

A proposta resume resultado, estrutura, duração e natureza da restrição, intensidade de limpeza, preservações e limitações relevantes. Perguntar apenas sobre lacuna ou conflito que mude materialmente a edição, preferencialmente oferecendo recomendação concreta. Escolhas rotineiras dentro do escopo não exigem confirmação por take/pausa/corte.

Aprovação padrão e autonomia previamente delimitada permanecem como decididas no Director. Aprovar estratégia não autoriza novos uploads, gastos ou ações fora das permissões. A apresentação aproveita o planejamento; não exige um segundo modelo nem renderizações alternativas por padrão.

### 15.2 Decisão 10 — Interpretação técnica, correção e estilo de cor

**APROVADA em 2026-09-16 como comportamento; funções e integração ainda devem passar pelo gate de viabilidade.**

Separar interpretação técnica da gravação, correção de problema identificado e estilo estético. Preservar imagens adequadas; não aumentar contraste/saturação indiscriminadamente. Perfil incerto não deve ser inferido como certeza apenas pela aparência lavada. Preservar diferenças intencionais de iluminação/ambiente.

Usar transformações compatíveis com o perfil, projeto e saída pretendida quando sustentadas por evidência. Correções discretas ficam no escopo autorizado; estilo decorre do pedido, preset ou proposta aprovada. Não foi escolhido aqui espaço de saída, profundidade de bits, LUT, motor adicional ou algoritmo novo.

Oferecer comparação acessível para mudanças perceptíveis/dúvidas relevantes, com interpretação técnica equivalente no antes/depois. Não exigir vários looks ou aprovação repetida por take quando a intenção já foi autorizada.

Priorizar metadados e amostras representativas, aprofundar mudanças relevantes, preservar originais/ajustes editáveis e evitar análise obrigatória por frame ou recálculo em cada emenda. Custo e qualidade ainda requerem teste.

## 16. Decisão 11 — Áudio: viabilidade e extensões a planejar

**REGISTRO DE LACUNAS E PLANEJAMENTO AGRUPADO APROVADOS em 2026-09-16. Escopo técnico final, consumo e implementação permanecem sujeitos a avaliação; não registrar a proposta inteira como entregue ou como autorização irrestrita de novos motores.**

Objetivo em discussão: áudio compreensível, consistente e natural, preservando timbre, dinâmica expressiva e sons relevantes; corrigir problemas proporcionalmente, sem voz de estúdio universal, tratamento cumulativo ou IA por trecho. Reutilizar o Media Runtime é a direção preferida para o núcleo convencional. O product owner determinou que o custo de implementar capacidades ausentes seja apresentado antes da adoção final do escopo.

### 16.1 Base e limites verificados

Baseline do levantamento: `099a88ceed9a274254d0ffc7e9fd457f7d63d5ae`, não promessa sobre futuras versões. Referências: [Media Runtime](MEDIA_RUNTIME.md), [contrato de mídia nessa revisão](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/packages/contracts/src/media.ts) e [adaptador nessa revisão](https://github.com/inlifemedicina/cevra/blob/099a88ceed9a274254d0ffc7e9fd457f7d63d5ae/engines/media-ffmpeg/src/adapter.ts). Revalidar o baseline real antes da implementação dependente.

O contrato admite `probe`, `extract-audio`, `detect-silence`, `volume`, `audio-fade`, `loudness-normalize` e `mux-audio`. Isso não prova um tratamento automático ponta a ponta na UI. `volume` recebe ganho único, não envelope temporal; os resultados tipados não contêm relatório completo de qualidade vocal. `resolveAudioMutationDelivery` rejeita saída em contêiner audio-only (WAV/M4A), embora extração/transcode de áudio tenham suas próprias regras. EQ, compressão, de-ess e redução de ruído não estão expostos como operações tipadas nesse contrato.

Não confundir disponibilidade genérica de filtro no FFmpeg com sua presença no bundle exato, exposição segura pelo CEVRA ou qualidade validada. Ampliar o Media Runtime significa primeiro contratos/adapter/worker/validação e integração; não implica automaticamente modificar o código-fonte do FFmpeg, trocar sua versão, adicionar um segundo runtime ou alterar uma fundação estável.

### 16.2 Lista inicial de necessidades para a frente coordenada de Media Runtime

Esta lista registra necessidades e candidatas, não uma especificação executável ou autorização para implementar todas. Manter aqui o levantamento enquanto esta discussão estiver aberta; um plano técnico futuro poderá detalhá-lo por referência, sem criar registros concorrentes.

| ID | Necessidade identificada | Tratamento a avaliar antes da execução |
|---|---|---|
| MR-A01 | Fluxo de tratamento de áudio isolado sem recodificação intermediária desnecessária. | Ampliar saídas/validação adequadas ao processamento, particularmente PCM quando pertinente, preservando compatibilidade e segurança de entrega. |
| MR-A02 | Evidências de nível por passagem, picos e ruído para justificar correções. | Relatório local tipado e medições reutilizáveis; não confundir detecção de silêncio ou transcrição correta com inteligibilidade comprovada. |
| MR-A03 | Ajustar região baixa sem elevar desnecessariamente todo o take. | Ganho temporal limitado e transições suaves, integrado ao plano editável; não criar cortes na imagem só para alterar volume. |
| MR-A04 | Tratamento convencional quando justificado: EQ, compressão, de-ess, limitação e redução de ruído. | Verificar filtros/capacidades do bundle, escolher apenas os necessários, expor operações fechadas e testar qualidade/consumo; não liberar filtergraph arbitrário. |
| MR-A05 | Junções, eventual mistura de faixas e normalização coerente da saída. | Conferir requisitos conjuntos com decisão 8, distinguir mux de mistura e projetar processamento coordenado a partir das fontes. Não pressupor que toda a proposta já cabe nas primitivas atuais. |
| MR-A06 | Entrega editável pelo aplicativo. | Mapear separadamente comandos/Project IR quando necessários, serviço de aplicação, compilação, Desktop Host e UI; não colocar lógica editorial ou novo estado canônico dentro do worker. |

Ganho, fades e normalização básicos não serão reimplementados sem necessidade. O incremento é o que falta para compô-los com segurança e completar as capacidades aprovadas. Novas necessidades de cor, junções, QA ou outros pontos que efetivamente afetem o Media Runtime devem entrar no mesmo levantamento com origem, evidência, dependência e status, não ser acrescentadas silenciosamente ao código.

### 16.3 Momento de implementação e agrupamento

Não modificar agora o Media Runtime já fechado. Reunir as extensões justificadas durante a revisão e apresentar um plano coordenado no ponto do roadmap em que forem necessárias, antes de implementar funções dependentes de capacidades ausentes. Comparar correção agora/depois, regressão, compatibilidade, consumo e retrabalho.

Agrupar planejamento e mudanças relacionadas evita remendos isolados; não obriga um único commit/PR gigantesco ou uma reescrita. Preservar fatias testáveis e revisão incremental conforme risco. Não esperar indefinidamente por todas as necessidades futuras do produto. Se adiar bloquear uma dependência imediata ou criar risco/custo material, avisar o product owner antes de prosseguir; só a parte afetada precisa pausar.

### 16.4 Restauração avançada e dependências externas

Restauração avançada não foi demonstrada como atendida pela superfície atual. Pode exigir funções adicionais e, conforme o problema e os testes, um modelo/motor especializado. Isso não comprova que todo caso de restauração necessita de outro motor, de serviço remoto ou de API paga.

Manter essa investigação separada do núcleo convencional. Não tornar separação de fontes, reconstrução de fala ou remoção forte de reverberação dependências obrigatórias da edição básica. Qualquer recurso externo exige necessidade demonstrada, comparação com a alternativa interna, qualidade/recursos medidos, licença/termos comerciais exatos e aprovação antes da incorporação. Não prometer recuperação perfeita nem sintetizar/substituir a fala original sob autorização de simples melhoria do áudio.

### 16.5 Fechamento desta atualização documental

Foram registradas as aprovações de estratégia/cor que ocorreram após a versão 1 e a nova exigência de viabilidade executável, com as lacunas de áudio para planejamento futuro. Nenhum código, bundle, comando, modelo, versão de FFmpeg ou fundação do runtime foi alterado; nenhum benchmark ou teste de áudio novo foi realizado por este registro. Integrar este resumo ao Master Context junto da reconciliação documental já exigida na seção 14.
