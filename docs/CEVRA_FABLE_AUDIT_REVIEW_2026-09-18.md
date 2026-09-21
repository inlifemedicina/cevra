# CEVRA — revisão do Fable adversarial audit — 2026-09-18

**Status:** EVIDÊNCIA TÉCNICA REVISADA / NÃO É APROVAÇÃO AUTOMÁTICA DE ARQUITETURA.

O Product Owner forneceu uma revisão adversarial independente. Os achados aceitos mudam prioridade e critérios de validação; candidatos sugeridos não viram dependência, contrato ou engine sem benchmark, auditoria e aprovação aplicável.

## Achados aceitos

1. Composition Engine é crítico para a V1 e continua sujeito ao ADR 0012.
2. Tamanho/closure dos runtimes é risco real; medir instalação limpa antes de escolher bundle, pack ou bootstrap obrigatório.
3. ONNX, modelo de alinhamento menor e outras otimizações são candidatos de benchmark, não seleção.
4. Export comercial precisa de compatibilidade ampla e não pode depender silenciosamente de hardware/driver adequado.
5. ProjectHistory com snapshots integrais e persistência do archive precisa de medição e correção delimitada antes de alto volume de comandos.
6. Caminhos comerciais/oficiais de agentes seguem não comprovados até PoC real.
7. Switches de desenvolvimento não podem virar bypass de stable/release.
8. Documentação e catálogo de aceitação acumulados tinham duplicação/drift e exigiam esta reconciliação.
9. Preview/playback, render/export/mux, HDR/VFR, fontes, disco/cache/temp e Windows precisam de fechamento explícito.
10. Aplicação decide editorialmente; Media Runtime executa mídia deterministicamente; Composition Engine produz camadas visuais.

## Candidatos, não decisões

- ONNX/safetensors/modelo menor para alinhamento;
- bootstrap obrigatório de modelo;
- encoder software específico;
- nomes/contratos de operações como `execute-cut-plan`;
- FFmpeg/libass como substituto integral do benchmark de composição;
- reuse do host headless no Creator como desenho final.

## Decisões preservadas

- D1–D23 não são apagadas porque a implementação é futura.
- Recovery Mode continua sem nova saída audiovisual utilizável.
- Creator Full continua standalone; não vira Bridge ou shell remoto do Desktop.
- Um Project Profile conversível continua possível se constraints de host exigirem.
- Remotion não é aceito/rejeitado sem evidência atual.
- Search Gateway/provider aprovado como direção não vira implementação automática nem é removido sem revisão.
- A ordem canônica do organograma prevalece sobre sequências hipotéticas do auditor.

## Refinamentos aprovados

- Preview V1 permanece engine-neutral: original quando decodificável, proxy derivado quando necessário, componentes/parâmetros compartilhados com composição quando prático, snapshots/renders limitados para efeitos pesados e equivalência preview/export testada.
- O Project IR delta futuro classifica estado durável, derivado, UI/transiente e provider/engine-specific; `extensions` não vira segunda timeline.
- HEIC/HEIF e AVIF continuam metas V1, com o menor decoder/adapter comprovadamente necessário.
- Font pack V1: Poppins, Playfair Display, Lora, Libre Baskerville e Inter, com pin/licença/glyph/metric validation.
- EDVID hard rule 2 preserva garantias, não topologia do agente: grafo interno tipado pode substituir extração por segmento se provar palavras, sync, overlap, fades, qualidade e custo.
- SFX pack V1 prioriza áudio first-party/commissioned; qualquer terceiro é auditado individualmente.
- Stable/release deve excluir ou travar bypasses de desenvolvimento e provar isso no gate de release.

## Ordem decorrente

```text
reconciliação documental
→ ProjectHistory blocker + validações de fundação
→ correções pequenas cross-platform/runtime
→ gate coordenado do Media Runtime
→ Transcript Cache V1 reconciliation/closeout
→ preview/render/composição e vertical editável
→ Agent Protocol PoC
→ release closure
```

O organograma é a referência compacta e o Master Context registra o estado corrente.
