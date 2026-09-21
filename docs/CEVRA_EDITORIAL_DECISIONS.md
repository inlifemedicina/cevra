# CEVRA — decisões editoriais aprovadas

**Aprovações originais:** 2026-09-16.
**Reconciliação canônica:** 2026-09-21.
**Status:** DIREÇÃO DE PRODUTO APROVADA / IMPLEMENTAÇÃO PENDENTE.

Este registro contém as decisões editoriais 1–13. Não declara recursos entregues, não seleciona modelo/provider e não autoriza implementação. O Director coordena; aplicação e engines executam; Project IR/ProjectHistory permanecem canônicos.

## D1 — Importar não inicia edição

Importação cadastra e valida tecnicamente a mídia: validade, duração, resolução/orientação e presença de áudio. Preparação editorial pesada e inferência começam somente quando o usuário pede edição ou inicia workflow pertinente. Presets determinísticos não ganham análise semântica desnecessária.

## D2 — Compreensão progressiva e baseada em evidência

Usar fala como eixo quando o conteúdo é verbal e evidência visual quando ela carrega informação necessária. Conteúdo visual não espera transcrição inútil. A projeção compacta preserva referências ao material exato; não é resumo substituto.

CEVRA prepara localmente inventário, transcrição/alinhamento, medições e amostras pertinentes. O modelo/agente interpreta significado e intenção. Enviar ao externo somente o necessário e autorizado; vídeo integral não sai por padrão. Preferir bom resultado sem API paga obrigatória, mas não impor modelo local inadequado ou cascata de providers.

## D3 — Qualidade de take é evidência, não exclusão

Pausas, volume, falsos inícios, repetições e possíveis palavras cortadas são indícios. Heurística não apaga conteúdo nem conclui função semântica. Dúvida material pede evidência adicional proporcional.

## D4 — Melhor take por função narrativa

Distinguir alternativas equivalentes, complementos e contradições. Recomendar o take adequado ao objetivo por sentido, clareza, naturalidade, expressividade e evidência audiovisual disponível, com justificativa verificável. Não usar regra fixa “último”, “mais curto” ou “sem hesitação”; alternativas permanecem disponíveis.

## D5 — Reorganizar sem fabricar discurso

Reordenar e combinar fontes/trechos dentro da estratégia autorizada, preservando perguntas/respostas, referências, condições, ressalvas, demonstrações, entonação e ações visuais. Uma emenda tecnicamente limpa não autoriza retirar condição essencial ou criar afirmação não sustentada.

## D6 — Duração e condensação

Distinguir alvo aproximado, máximo e exato. Limpeza de gravação não concede autorização automática para resumir. Calcular duração pela montagem real, inclusive sobreposições. Primeiro escolher take conciso ou remover redundância dispensável dentro do escopo; não retirar conteúdo obrigatório nem acelerar fala sem autorização. Conflito entra no plano antes de execução.

## D7 — Ritmo fluido e seletivo

Ritmo varia por objetivo, preset, material e passagem. Pausa pode ser preservada, encurtada ou removida; silêncio isolado não decide. Preferir passagem contínua ou take alternativo quando um ganho pequeno exige fragmentação perceptível. QA numérico não prova naturalidade.

## D8 — Junções por trecho

Corte direto e J-cut são recursos possíveis, escolhidos por trecho. Não impor avanço fixo. Preservar palavras, sincronismo, pausas, ações e margens; não sobrepor falas involuntariamente. Planejar uma junção candidata antes de render e corrigir somente por causa identificada. Medir muitas junções sem fades, normalização ou recodificação cumulativa indevida.

Uma implementação interna tipada pode usar grafo coordenado multi-input se provar as garantias EDVID; raw filtergraph de agente continua proibido.

## D9 — Estratégia principal e perguntas proporcionais

Apresentar uma proposta principal compreensível e ajustável usando pedido, material, constraints e preset já disponíveis. Perguntar apenas pela lacuna ou conflito que muda materialmente a edição. Aprovação/autonomia não inclui novo upload, gasto ou ação fora das permissões.

## D10 — Cor: interpretação, correção e estilo

Separar interpretação técnica, correção de problema e estilo. Não aplicar grade forte por padrão nem inferir perfil incerto pela aparência. Transformações precisam ser compatíveis com fonte/projeto/saída e manter preview/export coerentes. Espaço final, LUT, bit depth, algoritmo e dependências são decisões técnicas posteriores.

## D11 — Áudio convencional

Objetivo: voz compreensível, consistente e natural, preservando timbre, dinâmica e sons relevantes. Reutilizar operações existentes e acrescentar somente capacidades tipadas comprovadamente ausentes: áudio isolado, medições, ganho localizado, tratamentos convencionais proporcionais, junções/mix/normalização e integração editável. Não aplicar cadeia universal, IA por trecho ou restauração avançada como requisito básico.

As lacunas Media Runtime identificadas (MR-A01–MR-A06, MR-V01–MR-V02 e MR-Q01) são inventário de planejamento, não contratos preaprovados nem permissão para um PR monolítico. Revalidar contra o baseline e o Fable audit antes de especificar.

## D12 — QA e correções delimitadas

Verificar plano antes da execução e a saída real depois. Distinguir falha comprovada, indício contextual e questão editorial. Usar PASS/WARN/FAIL/UNKNOWN; não executado ou inconclusivo nunca é PASS.

Correção automática exige causa identificada e escopo autorizado. Agrupar correções compatíveis, repetir somente com mudança concreta e parar sem progresso, em resultado repetido, ao atingir limite ou quando a próxima ação mudar escopo. Preservar a última versão válida e nunca apresentar arquivo inválido como concluído.

## D13 — Revisão ligada à versão assistida

Feedback geral ou localizado referencia a versão realmente assistida, não apenas segundos soltos. Permitir agrupar observações. Mudança direta definida não exige IA; pedido ambíguo pode. Aplicar pelo caminho canônico, preservar ajustes manuais válidos e reavaliar somente dependências afetadas.

A aprovação identifica aquela montagem e permite avançar dentro das permissões; não congela o projeto. Mudança material invalida a aprovação anterior para a nova versão e atualiza captions/inserções dependentes.

## Diretrizes transversais

- `PRESERVE → EXTEND → VERIFY → MIGRATE ONLY IF NECESSARY`.
- Validar viabilidade real antes de pedir adoção: disponível, integração, extensão interna, dependência externa/não verificada.
- Avaliar qualidade, processamento, memória, armazenamento, latência, IA, infraestrutura, manutenção, suporte e elegibilidade comercial.
- Verificar licença/proveniência/termos da versão e caminho exatos; “grátis”, open-source, open-weight ou assinatura consumer não bastam.
- Não inventar ganho, custo, capacidade, superioridade ou implementação concluída sem evidência.
