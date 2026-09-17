# CEVRA — Decisão de Integração 4: IA local / self-hosted

**Data da decisão:** 2026-09-17.
**Status:** APROVADA PELO PRODUCT OWNER.
**Prioridade:** B/C — capacidade estratégica opcional, importante para custo zero por inferência, privacidade, offline e independência de fornecedor, mas não bloqueadora da V1 inicial.
**Implementação:** NÃO AUTORIZADA por este registro.
**Relação com Decisão 1:** qualquer IA local deverá usar exatamente o mesmo `CEVRA Agent Protocol` provider-neutral aplicado a OpenAI/Codex e Claude.
**Gate atual:** nenhuma alteração do gate coordenado do Media Runtime. Nenhum runtime local, modelo, peso, download, driver, pacote, benchmark, servidor ou código é autorizado por este documento.

---

## 1. Regra principal aprovada

CEVRA Vids deverá funcionar **plenamente independente de qualquer IA**, seja externa, local ou self-hosted.

IA é uma camada opcional de assistência, nunca requisito estrutural para abrir projetos, editar, executar presets, usar operações manuais suportadas, renderizar/exportar ou manter Project IR/ProjectHistory.

Se nenhum agente estiver configurado, autenticado, instalado ou disponível, o aplicativo não entra em estado inválido e não perde capacidades básicas já implementadas.

Nenhum modelo local específico será tratado como dependência arquitetural obrigatória.

A arquitetura deverá permitir avaliação futura de múltiplos runtimes/modelos locais sem alterar Project IR, ProjectHistory ou o protocolo semântico de agentes.

---

## 2. Papel da IA local no CEVRA

A IA local pode futuramente atender quatro objetivos principais:

1. reduzir ou eliminar custo variável de API por inferência;
2. manter dados sensíveis no dispositivo quando possível;
3. permitir funcionamento offline de capacidades assistidas;
4. reduzir dependência operacional de OpenAI, Anthropic ou outros serviços remotos.

Esses benefícios não justificam, por si só, impor downloads grandes, hardware específico, qualidade inferior ou complexidade desnecessária ao usuário comum.

A IA local deve ser oferecida apenas quando houver evidência de que o hardware e o modelo selecionado conseguem atender o caso de uso com qualidade aceitável.

---

## 3. Arquitetura provider-neutral obrigatória

O Agent Gateway deverá comportar um provider local da mesma forma conceitual que providers externos:

```text
Agent Gateway
├── OpenAI Adapter
├── Claude Adapter
└── Local Agent Adapter
```

Fluxo lógico:

```text
CEVRA
→ AgentTaskRequest
→ Local Agent Adapter
→ runtime/modelo local

modelo local
→ EvidenceRequest
ou
→ EditorialPlanCandidate

CEVRA
→ valida protocolo/schema
→ valida revisão/digests/referências
→ valida capabilities/permissões
→ gera Change Set
→ compilação determinística
→ comandos tipados CEVRA
→ ProjectHistory / Project IR
```

Não haverá um “modo local” com outro formato de plano ou operações audiovisuais paralelas.

O modelo local não recebe autoridade para escrever Project IR, chamar Media Runtime, gerar raw FFmpeg/filtergraphs executáveis, manipular shell/Python/TSX arbitrário ou acessar filesystem fora das evidências explicitamente permitidas.

---

## 4. Capabilities em vez de identidade de modelo

O CEVRA não deve codificar decisões editoriais em torno de nomes específicos como `Qwen`, `Phi`, `Mistral`, `Gemma`, `Llama` ou outros.

O adapter e o Director devem trabalhar com capabilities observáveis, por exemplo:

- `text_reasoning`;
- `structured_output`;
- `portuguese`;
- `vision_image`;
- `vision_multi_frame`;
- `audio_input`, se realmente necessário;
- `temporal_reasoning`, quando comprovado;
- `context_window`;
- `max_output`;
- `local_only`;
- `hardware_profile`;
- `runtime_version`;
- `model_revision`;
- `quantization`;
- `license_state`.

Essas capabilities devem refletir o que foi realmente testado/medido, não apenas o que a model card promete.

---

## 5. Runtime local: direção de benchmark, não seleção definitiva

No marco futuro de avaliação, `llama.cpp` ou alternativa equivalente permissiva será considerado candidato prioritário a benchmark por:

- maturidade do ecossistema local;
- suporte a múltiplas plataformas/backends;
- possibilidade de processo privado/local;
- licença permissiva;
- suporte crescente a multimodalidade;
- capacidade de utilizar modelos quantizados.

Isso **não** significa que llama.cpp foi selecionado como runtime final do CEVRA.

A versão exata, APIs multimodais, estabilidade, distribuição, dependências, backend GPU/CPU e comportamento em Windows/macOS deverão ser validados no momento de implementação.

Se outro runtime permissivo oferecer melhor qualidade, estabilidade, integração, packaging ou manutenção, ele deverá ser comparado antes da decisão final.

Preferência arquitetural: processo/biblioteca privada controlada pelo CEVRA, sem servidor HTTP/TCP local permanente quando isso puder ser evitado.

Um servidor local só deve ser introduzido se houver ganho real e com design explícito de autenticação, binding, lifecycle, least privilege e exposição de rede.

---

## 6. Ollama e outros runtimes externos

Ollama ou runtimes semelhantes poderão ser suportados como **providers locais externos opcionais**, sobretudo para usuários avançados que já os possuem.

Exemplo:

```text
usuário já possui runtime local compatível
→ CEVRA detecta/configura provider
→ capability discovery
→ uso através do Local Agent Adapter
```

Eles não devem se tornar dependência obrigatória nem definir o contrato interno do CEVRA.

A presença de um servidor/API local externo não autoriza o CEVRA a presumir segurança, compatibilidade, modelo ou disponibilidade. Healthcheck/capability discovery e autorização do usuário continuam necessários.

---

## 7. Modelos candidatos para benchmark futuro

Nenhum modelo foi selecionado definitivamente nesta decisão.

A shortlist inicial poderá incluir modelos permissivos/adequados disponíveis no marco real de benchmark. Os candidatos atuais de referência incluem, entre outros:

- Qwen3-VL em tamanhos compatíveis com hardware consumidor;
- Phi multimodal/compactos;
- Mistral multimodal/vision em tamanhos viáveis;
- outros modelos locais que, no momento do teste, apresentem melhor combinação de licença, PT-BR, visão, qualidade editorial e footprint.

Gemma ou outros modelos com termos próprios podem ser comparados, mas devem passar por auditoria de redistribuição/uso comercial específica.

A lista atual é apenas referência para pesquisa. Não deve congelar a arquitetura em modelos que podem estar superados quando a implementação começar.

---

## 8. Avaliação por modelo e ajustes específicos

Quando chegar o marco de IA local, cada candidato relevante deverá ser avaliado individualmente, incluindo eventuais ajustes necessários para torná-lo compatível com o CEVRA.

Para cada runtime/modelo, documentar pelo menos:

- arquitetura e versão exatas;
- licença do código;
- licença dos pesos;
- licença de tokenizer/processors/templates quando separada;
- permissibilidade de uso comercial e redistribuição;
- notices/atribuições obrigatórias;
- tamanho dos pesos;
- formatos disponíveis;
- quantizações testadas;
- RAM mínima/recomendada;
- VRAM/memória unificada mínima/recomendada;
- CPU/GPU/accelerator suportados;
- Windows/macOS e arquiteturas CPU relevantes;
- velocidade de cold start;
- tokens/s;
- tempo total por tarefa CEVRA;
- qualidade PT-BR;
- aderência a JSON/schema;
- capacidade de pedir evidência corretamente;
- qualidade de visão e multi-frame;
- qualidade editorial;
- tendência a hallucination;
- estabilidade com contexto longo;
- impacto da quantização na qualidade;
- comportamento sob memória insuficiente;
- cancelamento;
- recovery;
- packaging;
- atualização/rollback;
- tamanho final do download;
- dependências/driver requirements;
- vulnerabilidades/maintenance state.

Qualquer ajuste especial de prompt, tokenizer, vision processor, context template, quantização ou runtime deverá permanecer encapsulado no provider/model profile, sem contaminar o protocolo CEVRA.

---

## 9. Local AI Pack opcional

A distribuição padrão do CEVRA não deverá incluir automaticamente pesos grandes de LLM/VLM.

Direção aprovada:

```text
CEVRA base
→ sem modelo pesado obrigatório

usuário escolhe “Ativar IA local”
→ CEVRA avalia hardware
→ apresenta modelos/packs compatíveis
→ informa tamanho/licença/requisitos
→ usuário autoriza download
→ download verificado
→ hash/proveniência/manifesto
→ instalação opcional
```

Objetivos:

- evitar instalador inicial desnecessariamente grande;
- não penalizar usuários que não querem IA;
- permitir seleção adequada ao hardware;
- facilitar atualização e remoção;
- permitir vários perfis locais no futuro.

Nenhum pack será baixado silenciosamente.

---

## 10. Hardware detection e seleção segura

Antes de recomendar/ativar um modelo local, o CEVRA deverá conhecer, quando tecnicamente permitido:

- sistema operacional;
- arquitetura CPU;
- RAM disponível;
- GPU/backend disponível;
- VRAM ou memória unificada relevante;
- espaço livre em disco;
- runtime/backend compatível;
- capacidade observada em benchmark curto quando necessário.

O usuário não deve poder iniciar inadvertidamente um pack que torna o aplicativo inutilizável por falta evidente de recursos sem aviso adequado.

Perfis possíveis poderão incluir conceitos como `Local Lite`, `Local Quality`, `Local High`, mas nomes, thresholds e modelos somente serão definidos depois de benchmark real.

Quantidade de parâmetros isolada não será usada como proxy suficiente de qualidade ou requisitos.

---

## 11. Modelo/weights não fazem parte do Project IR

Project IR permanece fonte canônica audiovisual.

Não salvar como estado audiovisual:

- path absoluto dos pesos;
- runtime process state;
- arquivos de sessão do modelo;
- KV cache;
- credenciais;
- servidor local específico;
- detalhes transitórios de driver.

Pode ser registrada, fora do núcleo audiovisual e quando necessário à auditoria/reprodutibilidade, proveniência limitada como:

- provider = local;
- family/model/revision;
- quantization;
- runtime/version;
- capability snapshot;
- digest/manifest version pertinente.

Isso não transforma o modelo em parte do projeto.

---

## 12. Versionamento, hashes e rollback

Nenhum pack deverá depender de `latest` flutuante.

Manifestos devem fixar, conforme aplicável:

- model ID;
- exact revision;
- weight hash;
- arquivo(s) exatos;
- quantization;
- runtime compatibility;
- runtime version range;
- license identifier/link/provenance;
- notices;
- tamanho;
- capabilities comprovadas;
- hardware mínimo/recomendado;
- benchmark suite/version;
- data de validação.

Atualização de modelo é operação explícita.

Uma nova revisão não deve substituir silenciosamente uma versão conhecida como boa. O sistema deve comportar rollback ou retenção da versão anterior quando a estratégia de distribuição justificar.

---

## 13. Política de evidência para visão/vídeo local

Mesmo quando um modelo local aceitar vídeo ou longos conjuntos de imagens, a estratégia principal do CEVRA permanece evidence-first:

```text
vídeo fonte
→ análise/preparo local CEVRA
→ transcript + intervalos + frames + métricas relevantes
→ modelo local
```

Enviar o vídeo inteiro ao modelo local não será presumido como melhor solução.

Entrada temporal direta só deve ser utilizada se benchmark CEVRA-specific mostrar benefício editorial/visual material que compense memória, latência, complexidade e estabilidade.

O CEVRA controla quais evidências são apresentadas e mantém referências/digests como na Decisão 1.

---

## 14. Benchmark CEVRA-specific obrigatório

Modelos não serão selecionados por leaderboard genérico isolado.

Deverá existir benchmark próprio com projetos representativos, contendo combinações como:

- talking head;
- aulas/educacional;
- reels/short-form;
- português brasileiro formal/informal;
- retakes;
- pausas;
- erros/falsos inícios;
- múltiplos takes;
- B-roll;
- mudanças visuais;
- áudio imperfeito;
- frames ambíguos/semelhantes;
- projetos curtos e longos.

Todos os candidatos recebem o mesmo contrato e evidências equivalentes.

Avaliar pelo menos:

- qualidade editorial;
- preservação de significado;
- seleção de takes;
- aderência às constraints;
- qualidade de EvidenceRequest;
- visão;
- PT-BR;
- schema compliance;
- hallucination;
- consistency/repeatability;
- latência;
- throughput;
- RAM/VRAM;
- CPU/GPU;
- disco;
- estabilidade;
- qualidade após quantização;
- licença/distribuição;
- manutenção do runtime/modelo.

O benchmark deverá comparar também, quando fizer sentido, a qualidade local contra pelo menos um provider cloud de referência, sem pressupor equivalência.

---

## 15. Sem degradação silenciosa

Se o usuário selecionar um provider/modelo de maior qualidade e ele ficar indisponível, o CEVRA não deve trocar silenciosamente para uma IA local de qualidade diferente.

Exemplo de comportamento aceitável:

```text
Provider selecionado indisponível.

Opções:
- tentar novamente;
- usar outro provider configurado;
- usar IA local compatível;
- continuar sem IA.
```

Uma política automática de fallback só poderá existir quando explicitamente escolhida pelo usuário e dentro de capabilities/qualidade conhecidas.

O modo local nunca será rotulado como “equivalente” a Codex/Claude ou outro modelo cloud sem benchmark que sustente a afirmação.

---

## 16. Independência completa de IA

Regra de produto reforçada pelo owner:

> CEVRA deverá funcionar totalmente independente de qualquer IA.

Consequências obrigatórias:

- nenhum login de IA é exigido para usar o editor;
- nenhum modelo local é obrigatório para instalar/abrir o CEVRA;
- Project IR, ProjectHistory, timeline, comandos tipados, media runtime, presets determinísticos e exportação não dependem semanticamente de agente;
- ausência/falha de IA não corrompe o projeto;
- IA não se torna fonte de verdade;
- recursos assistidos por IA podem ficar indisponíveis sem impedir o restante do produto;
- decisões feitas por IA, quando aplicadas, tornam-se operações CEVRA normais e auditáveis;
- o app não deve depender de internet para suas funções locais não-IA.

Essa regra tem prioridade sobre conveniência de integração futura.

---

## 17. Classificação aprovada

- Arquitetura `Local Agent Adapter`: **VERDE**.
- Mesmo `CEVRA Agent Protocol` para local/cloud: **VERDE**.
- Modelo local como requisito estrutural: **REJEITADO**.
- IA como requisito para funcionamento do CEVRA: **REJEITADO**.
- Local AI Pack opcional: **VERDE como direção**.
- Seleção de runtime/modelo específico: **NÃO DECIDIDA / requer benchmark futuro**.
- `llama.cpp` ou equivalente permissivo como primeiro candidato de benchmark: **VERDE/AMARELO**, sujeito a versão real e estabilidade multimodal no marco.
- Modelos atuais citados como candidatos: **NÃO COMPROVADOS para qualidade CEVRA** até benchmark.
- Ollama/servidores locais de terceiros: **OPCIONAL**, não canônico.
- Vídeo inteiro como input padrão: **NÃO ADOTAR sem evidência**.
- Fallback silencioso de cloud para local: **PROIBIDO**.

---

## 18. Momento de execução

A decisão prepara arquitetura e pesquisa, mas **não cria trabalho obrigatório na V1 inicial**.

Quando chegar o marco adequado:

1. reavaliar o ecossistema atual de runtimes/modelos;
2. montar shortlist atualizada;
3. auditar licenças de código e pesos separadamente;
4. definir benchmark CEVRA-specific;
5. testar hardware tiers reais;
6. documentar ajustes necessários por candidato;
7. escolher somente depois dos resultados;
8. implementar como provider opcional, preservando o mesmo protocolo.

Se a qualidade local não atingir o piso necessário, a funcionalidade pode permanecer experimental/opcional sem bloquear V1.

---

## 19. Decisão consolidada

> CEVRA será plenamente funcional sem qualquer IA. O produto terá arquitetura provider-neutral preparada para IA local/self-hosted através de um `Local Agent Adapter` que utiliza exatamente o mesmo `CEVRA Agent Protocol` dos providers externos. Nenhum modelo ou runtime local será dependência arquitetural obrigatória. Modelos pesados não serão incluídos no instalador padrão; poderão futuramente ser oferecidos como `Local AI Packs` opcionais, versionados, com hardware detection, autorização explícita de download, hashes, proveniência, licença, requisitos e rollback. A seleção de runtime/modelo será feita somente no marco apropriado mediante benchmark CEVRA-specific de qualidade editorial em PT-BR, visão, schema, EvidenceRequests, hallucination, desempenho, RAM/VRAM, footprint, estabilidade, quantização e comercialização. Cada candidato terá seus ajustes específicos documentados sem contaminar o protocolo central. Não haverá degradação silenciosa entre providers e IA local não bloqueará a V1 inicial.

---

## 20. Impacto no gate atual

**Nenhuma alteração imediata do gate coordenado do Media Runtime.**

Esta decisão não autoriza download, runtime, pesos, benchmark ou código. Ela apenas fixa a independência estrutural do CEVRA e a forma futura correta de avaliar e integrar modelos locais quando isso se tornar prioritário.
