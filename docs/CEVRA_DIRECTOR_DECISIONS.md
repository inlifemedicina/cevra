# CEVRA Director — direção aprovada

**Aprovação original:** 2026-09-15.
**Reconciliação canônica:** 2026-09-21.
**Status:** DIREÇÃO DE PRODUTO APROVADA / IMPLEMENTAÇÃO PENDENTE.

Este documento é a autoridade detalhada para o comportamento do Director. `CEVRA_MASTER_CONTEXT.md` registra somente o estado e os links; Project IR, ProjectHistory, a arquitetura e os ADRs continuam sendo as autoridades técnicas aplicáveis.

## 1. Papel e fronteiras

O Director coordena pedido, contexto, evidências, modelo/agente, permissões, orçamento, validação do plano, aprovação e execução delimitada. Ele não é um modelo obrigatório, uma segunda timeline, um banco concorrente, um host privilegiado nem uma fonte de verdade audiovisual.

- O modelo/agente exerce julgamento editorial e pode pedir evidência adicional.
- O Director seleciona contexto, coordena capabilities/custos e valida o fluxo.
- A aplicação e os engines executam somente operações CEVRA tipadas e validadas.
- Project IR e ProjectHistory permanecem a única autoridade audiovisual editável e recuperável.

Nomes como Context Compiler, Router, Plan Validator e Capability/Budget descrevem responsabilidades; não exigem processos, serviços ou frameworks separados.

## 2. Fluxo canônico

```text
pedido do usuário ou agente autorizado
→ EditorialContext delimitado e ligado à revisão atual
→ modelo/agente editorial
↔ EvidenceRequest quando necessário
→ EditorialPlan candidato, estruturado e versionado
→ validação CEVRA
→ Change Set revisável
→ aprovação ou autonomia previamente delimitada
→ comandos tipados da aplicação
→ ProjectHistory / Project IR
→ execução / QA suportado
→ preview, revisão e refinamento delimitado
```

Plano, rationale e conteúdo retornado são não confiáveis até validação. Texto livre nunca vira mutação por interpretação silenciosa, e nenhum agente envia shell, FFmpeg/filtergraph, Python, TSX, código de engine ou escrita direta no Project IR.

## 3. Comportamento editorial

CEVRA deve aceitar múltiplos vídeos-fonte contribuindo para uma única edição final. As evidências e transcrições permanecem vinculadas à fonte. O Director pode organizar:

1. automaticamente para coerência;
2. pela ordem/estrutura explícita do usuário;
3. por restrições híbridas, como abertura e encerramento obrigatórios com liberdade no meio.

O modelo pode comparar temas, argumentos, takes equivalentes, complementos, repetições e contradições. Deve preservar ressalvas, significado, evidência e restrições obrigatórias; não fabricar falas nem declarar evidência ausente.

Preservar o método útil do EDVID: leitura compacta, evidência sob demanda, estratégia antes de montagem, escolha contextual de takes, fases de produção, QA proporcional e refinamento. Toda mudança material de comportamento é `DIVERGÊNCIA EDVID` até demonstrar paridade ou superioridade.

## 4. Contexto e uso eficiente de IA

Usar contexto compacto e progressivo: brief, constraints, frases e fontes relevantes, tempos, revisão/digests, preset e evidência acústica/visual somente quando útil. A projeção compacta não substitui a evidência exata nem vira uma segunda transcrição.

IA é usada para decisões semânticas, criativas ou ambíguas. Operações determinísticas conhecidas — aplicação de preset, cálculo, compilação, render, validação numérica e controles explícitos — não exigem nova inferência. Não impor uma chamada única, uma cascata local→cloud ou nova consulta por corte/frame quando isso não melhora o resultado.

Skills/playbooks preservam método editorial e contrato de ferramentas; não são wrappers vazios. Skill não cria autenticação, transporte, entitlement ou retorno automático.

## 5. Providers e retorno bidirecional

A arquitetura permanece provider-neutral. Codex, Claude, modelos locais e providers futuros convergem para a mesma semântica de contexto, evidência e plano. Autenticação, sessão, streaming, billing e IDs nativos ficam nos adapters.

Não presumir que assinatura consumer ChatGPT/Claude equivale a API, SDK, embedding ou entitlement programático. Verificar mecanismos oficiais, plano/workspace, região, transporte, cobrança, termos e comercialização no momento de implementar e antes de anunciar.

O retorno precisa ser real e comprovado. Um caminho externo pode usar handoff/importação transparente quando o host não oferece write-back; nunca simular integração. Provar cedo, no marco correto:

```text
contexto CEVRA
→ agente/provedor real e autorizado
→ proposta estruturada
→ validação e revisão CEVRA
```

## 6. Segurança, estado e autonomia

- Validar protocolo/schema, identidade e revisão do projeto, digests, referências, capability, permissão, constraints e compilabilidade.
- Resposta obsoleta não sobrescreve trabalho novo; retries não duplicam mutações.
- Streaming/parciais não autorizam edição.
- Cancelamento, timeout e resultado remoto incerto preservam o estado; não repetir automaticamente operação com possível efeito/cobrança.
- Conteúdo importado é evidência, nunca instrução privilegiada.
- Aprovação é o padrão. Automação só opera dentro de escopo previamente autorizado e não inclui upload, gasto, compra, publicação ou filesystem/rede irrestritos.

## 7. Privacidade, capability e recursos

Não enviar vídeo integral por padrão. Enviar apenas texto, frames ou pequenos trechos pertinentes dentro do escopo autorizado; segredos, cookies, credenciais e paths desnecessários nunca entram no Project IR, plano, log ou payload editorial.

Capabilities, quota e uso vêm de interfaces oficiais quando disponíveis. Valor desconhecido permanece desconhecido. Limitar contexto, evidência, concorrência, retries, tempo e gasto; ao atingir limite, pausar de forma compreensível sem trocar provider, billing ou qualidade silenciosamente.

Medir a operação completa, inclusive preparação, helper process, I/O, validação e UI. Inferência remota não significa custo local zero. Sem agente externo, edição manual, presets e funções locais suportadas continuam utilizáveis.

## 8. Impacto bidirecional e mudança de decisão

Antes e depois de cada fatia relevante, verificar:

- se a mudança atual restringe o Director futuro;
- se a direção aprovada do Director exige uma mudança no componente atual.

O closeout registra: nenhum impacto no escopo verificado, extensão compatível ou decisão do Product Owner necessária. Conflito material pausa somente o trabalho afetado e apresenta impacto, alternativas, custo agora/depois e recomendação.

Decisão aprovada pode ser refinada. Mudança material exige evidência, aprovação, marcação explícita `SUPERSEDED`/refinada e atualização coordenada dos registros, ADRs e testes aplicáveis.

## 9. Estado de implementação

Esta direção não declara implementados o Director, Agent Protocol, adapters, providers, conexão de conta, Evidence Builder, compilador de planos, QA ou UX de aprovação. Eles entram em fatias dependency-correct depois dos bloqueadores e gates registrados no Master Context e no organograma.
