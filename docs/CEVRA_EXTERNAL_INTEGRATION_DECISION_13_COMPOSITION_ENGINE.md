# CEVRA — Decisão de Integração 13: Composition Engine e dependências

**Data da decisão:** 2026-09-17.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** HyperFrames é o candidato prioritário ao Composition Engine do CEVRA; Remotion permanece referência funcional EDVID para benchmark. Só ampliar a busca se houver lacuna material comprovada.

---

## 1. Referência e contexto

O ADR 0012 já definiu:
- Composition Engine atrás de `CompositionEngineAdapter`;
- HyperFrames como candidato preferencial, não obrigatório;
- Remotion/EDVID como referência funcional;
- seleção final apenas após benchmark de paridade;
- Project IR independente do engine.

Esta decisão não reabre o ADR; refina a estratégia de benchmark e seleção.

---

## 2. HyperFrames como candidato prioritário

HyperFrames passa a ser o primeiro motor a provar.

Razões:
- licença Apache-2.0 na revisão consultada;
- compatibilidade comercial favorável para produto proprietário;
- execução local;
- render determinístico;
- integração com HTML/CSS/mídia e FFmpeg;
- atividade recente e correções relevantes para portrait, preview/render e lifecycle;
- possibilidade de evitar custo por render/licenciamento operacional associado a alternativas comerciais.

Isso NÃO significa seleção final antes do benchmark.

---

## 3. Remotion como referência EDVID

Remotion permanece:
- referência do comportamento visual do EDVID;
- fonte de comparação para captions, layouts, B-roll, motion graphics, timing e efeitos;
- fallback possível somente se HyperFrames falhar materialmente.

Remotion não é assumido como default.

Qualquer adoção comercial futura depende de:
- versão exata;
- termos/licença vigentes;
- custo;
- compatibilidade com distribuição/produto CEVRA.

---

## 4. Outros engines

Motion Canvas e outros engines permanecem candidatos secundários.

Não executar benchmark amplo de três ou mais engines sem necessidade.

Regra:
```text
HyperFrames
vs
Remotion/EDVID reference

se HyperFrames falhar materialmente:
→ avaliar fallback real
→ somente então abrir novo candidato
```

Evitar pesquisa/integração desnecessária.

---

## 5. Escopo do benchmark

Benchmark somente com recursos realmente aprovados pelo CEVRA:

- seis estilos de legenda EDVID;
- headlines;
- split e split2;
- imagens;
- vídeo/B-roll;
- full-screen;
- camera dynamic;
- hard zoom;
- slow push-in;
- face tracking;
- motion graphics tipados;
- behind-the-subject/alpha;
- SFX;
- música;
- timing;
- 9:16;
- 16:9;
- preview versus export;
- cancelamento;
- erro/recovery;
- consumo de CPU/GPU/RAM;
- tempo de render.

Não criar features novas apenas para o benchmark.

---

## 6. Processo de benchmark

### Codex/automação
Responsável por:
- preparar fixtures;
- produzir a mesma cena/estado nos engines;
- executar renders;
- medir tempo;
- medir RAM/CPU/GPU;
- verificar erros/cancelamento;
- gerar comparativos lado a lado;
- verificar integridade/timing;
- registrar versão/licença/dependências;
- organizar material para homologação.

### Product Owner
Recebe somente os comparativos que exigem julgamento humano:
- aparência;
- legibilidade;
- fluidez;
- timing percebido;
- qualidade de composição;
- naturalidade;
- equivalência com EDVID.

Resposta:
- APROVADO
- REPROVADO: motivo

---

## 7. Critério de seleção

HyperFrames será escolhido se demonstrar:
- paridade ou melhor resultado visual/funcional nos recursos aprovados;
- timing confiável;
- preview/export coerentes;
- performance/estabilidade adequadas;
- lifecycle/cancelamento aceitáveis;
- empacotamento comercial compatível;
- ausência de regressão material em relação ao EDVID.

Se falhar materialmente:
- não forçar adaptação extensa apenas para mantê-lo;
- apresentar falha;
- avaliar Remotion ou outro candidato;
- voltar ao Product Owner antes de escolha final alternativa.

---

## 8. Segurança e execução arbitrária

Mesmo que o engine suporte HTML/JS ou execução programática, isso não será exposto ao agente/end-user como superfície livre.

Proibido:
```text
IA
→ HTML/JS/TSX arbitrário
→ execução direta
```

Caminho aprovado:
```text
Project IR
→ componentes/ops tipados
→ Composition Compiler
→ CompositionEngineAdapter
→ HyperFrames/engine selecionado
```

O agente pode selecionar/parametrizar componentes permitidos, nunca fornecer código executável arbitrário.

---

## 9. Independência do Project IR

Nenhum schema do HyperFrames/Remotion vira estado canônico.

Project IR/ProjectHistory permanecem a fonte audiovisual.

Engine-specific representation é:
- derivada;
- compilada;
- descartável/reconstruível.

Trocar engine não pode exigir reescrever o modelo de projeto.

---

## 10. Relação com decisões anteriores

Esta decisão habilita tecnicamente:
- captions;
- split-screen;
- B-roll;
- full-screen;
- motion graphics;
- behind-the-subject;
- imagens;
- áudio/SFX;
- assets externos.

Não substitui:
- Image Ingest;
- Media Runtime;
- matting engine;
- asset lifecycle;
- Director;
- Agent Protocol.

---

## 11. Momento de implementação

Após o gate coordenado do Media Runtime e antes de expansão visual pesada dependente do Composition Engine.

Ordem:
1. preparar fixtures;
2. integrar/rodar HyperFrames de forma isolada;
3. reproduzir casos EDVID;
4. medir;
5. homologar visualmente;
6. selecionar motor;
7. integrar via CompositionEngineAdapter;
8. expandir capacidades dependentes.

---

## 12. Classificação

| Item | Estado |
|---|---|
| HyperFrames | candidato prioritário |
| Remotion | referência EDVID / fallback possível |
| Motion Canvas/outros | defer, só se necessário |
| benchmark amplo com muitos engines | não adotar |
| Project IR engine-neutral | obrigatório |
| arbitrary HTML/JS/TSX from agent | RED |
| typed composition compiler | GREEN |
| seleção final do engine | pendente do benchmark |

---

## 13. Decisão final

HyperFrames será o primeiro candidato ao Composition Engine do CEVRA. Remotion continuará como referência funcional EDVID para o benchmark.

O benchmark será pequeno, direcionado e automatizado pelo Codex, cobrindo somente os recursos já aprovados. O Product Owner receberá apenas os comparativos visuais que exigirem julgamento humano.

Se HyperFrames atingir paridade ou superioridade suficiente com estabilidade e custo adequados, será selecionado. Se falhar materialmente, a decisão volta antes de adotar Remotion ou outro engine.

Nenhum agente poderá executar código arbitrário no engine. Toda composição será produzida por componentes/operações CEVRA tipados e compilados a partir do Project IR.
