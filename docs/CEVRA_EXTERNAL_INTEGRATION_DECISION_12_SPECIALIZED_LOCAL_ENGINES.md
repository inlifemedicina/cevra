# CEVRA — Decisão de Integração 12: motores locais especializados de visão, tracking, matting, segmentação e restauração

**Data da decisão:** 2026-09-17.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** não criar um “supermotor de visão” único. Usar a ferramenta local mais simples, leve, comercialmente segura e suficientemente boa para cada capability. Reaproveitar benchmarks públicos confiáveis antes de gastar tempo reproduzindo comparações já estabelecidas.

---

## 1. Capabilities separadas

CEVRA tratará como capacidades independentes:

- FaceTracking / EyeLineTracking;
- PersonMatting;
- ObjectSegmentation;
- ObjectTracking;
- ImageRestoration;
- VideoRestoration.

Cada capability poderá ser atendida por motor diferente.

O Project IR deve guardar o resultado útil/editável, não o estado interno do modelo, pesos, sessão ou runtime.

Exemplos:

```text
FaceTracking
→ trajetória/targets derivados

PersonMatting
→ matte/alpha derivado

Restoration
→ asset derivado
```

Nenhum modelo se torna fonte de verdade audiovisual.

---

## 2. Face/eye tracking

### Referência EDVID

O EDVID fixado usa OpenCV Haar Cascade:
- detecta a maior face frontal por frame;
- estima eye-line aproximadamente dentro da face;
- preenche gaps;
- suaviza a trajetória;
- gera coordenadas normalizadas usadas pela câmera dinâmica.

É simples, local e sem API.

### Direção CEVRA

Comparar somente opções leves e maduras, inicialmente:

1. OpenCV/abordagem equivalente ao EDVID;
2. MediaPipe Face Landmarker ou alternativa permissiva comparável.

Escolher a solução mais simples que entregue:
- estabilidade;
- custo baixo;
- robustez suficiente em talking-head;
- empacotamento comercial aceitável.

Não usar modelo pesado de segmentação apenas para manter o rosto enquadrado.

---

## 3. Behind-the-subject / person matting

### Referência EDVID

O EDVID usa Robust Video Matting (RVM) para gerar foreground/alpha temporalmente estável e compor o elemento entre fundo e pessoa.

RVM permanece **referência funcional/visual**, não seleção automática para CEVRA.

### Restrição comercial

O RVM oficial permanece associado a licença copyleft restritiva para incorporação despreocupada em produto proprietário. Sua adoção/distribuição não está aprovada.

Código, pesos e dependências devem ser auditados separadamente.

---

## 4. Uso de benchmarks públicos para reduzir retrabalho

O Product Owner aprovou explicitamente a seguinte política:

> Se já houver benchmark público confiável e comparável entre motores, CEVRA deve reaproveitar essa evidência em vez de reproduzir um benchmark amplo do zero.

Durante a decisão foram encontrados benchmarks públicos que comparam PP-Matting, RVM e MODNet e apontam PP-Matting como candidato competitivo/superior em métricas reportadas de vídeo, enquanto outras comparações reforçam RVM acima de MODNet em vídeo real.

Consequência aprovada:

- **PP-Matting / PP-MattingV2 passa a candidato preferencial comercial para matting.**
- **RVM permanece referência de qualidade EDVID.**
- **MODNet deixa de ser prioridade inicial**, salvo nova evidência/necessidade técnica.

Esses benchmarks públicos reduzem o trabalho, mas não substituem uma validação curta do nosso caso específico.

Revalidar estudos/repositórios/licenças no marco de implementação.

Referências consultadas na decisão:
- estudo comparativo: https://www.mdpi.com/2076-3417/14/5/1942
- benchmark público de video matting: https://www.sota2.com/research/sota/video-matting-on-real-world-benchmark
- RVM: https://github.com/PeterL1n/RobustVideoMatting
- PaddleSeg / PP-Matting: https://github.com/PaddlePaddle/PaddleSeg

---

## 5. Validação CEVRA reduzida para matting

Não reproduzir benchmark acadêmico completo.

Depois de selecionar os finalistas por:
- evidência pública;
- licença;
- empacotamento;
- maturidade;
- hardware;

executar somente um **teste de aceitação CEVRA** com pequeno conjunto representativo de clipes curtos, alvo aproximado de 5–10 fixtures.

Casos mínimos:
- talking-head vertical;
- talking-head horizontal;
- cabelo/bordas finas;
- mãos/dedos;
- movimento rápido;
- fundo complexo;
- baixa luz;
- roupa/fundo semelhantes;
- objeto passando na frente;
- cenário real de consultório/casa;
- efeito behind-the-subject real.

Avaliar:
- halo/bordas;
- cabelo;
- mãos;
- flicker temporal;
- estabilidade;
- naturalidade do resultado final;
- resolução;
- tempo;
- CPU/GPU;
- RAM/VRAM;
- tamanho do modelo;
- empacotamento.

Se PP-Matting atingir qualidade suficientemente próxima ou superior à referência RVM no uso CEVRA, encerrar a escolha em favor da solução permissiva.

Se houver diferença visual material que comprometa o produto, voltar ao Product Owner antes de incorporar motor/licença mais restritivos ou ampliar a pesquisa.

Não recalcular métricas acadêmicas extensas quando estudos públicos confiáveis já responderem essa parte.

---

## 6. Responsabilidade dos testes — automação/Codex versus Product Owner

Política aprovada para esta decisão e para homologação futura em geral:

### Codex / automação / equipe técnica
Responsável por:
- instalar/configurar candidatos;
- baixar dependências autorizadas;
- preparar fixtures;
- executar os mesmos clipes em cada candidato;
- medir tempo;
- medir RAM/VRAM/CPU/GPU;
- medir tamanho de runtime/modelo;
- registrar falhas;
- gerar vídeos comparativos;
- montar lado a lado/contact sheets quando útil;
- checar integridade;
- executar testes automatizáveis;
- conferir licença/proveniência/empacotamento;
- produzir material pronto para homologação.

### Product Owner
Não deve precisar:
- instalar modelos;
- executar comandos;
- medir VRAM;
- preparar fixtures técnicos;
- comparar logs;
- montar vídeos lado a lado.

O Product Owner recebe somente o material em que julgamento humano agrega valor, por exemplo:
- naturalidade;
- bordas;
- cabelo;
- flicker;
- percepção profissional;
- fluidez/UX.

Resposta manual padronizada:
- **APROVADO**
- **REPROVADO: motivo curto**

Esse princípio também se aplica ao catálogo cumulativo de homologação: automatizar tudo que for objetivo e reservar ao Product Owner o que realmente exige decisão visual/editorial/UX.

---

## 7. Segmentação e tracking avançado de objetos

Não são obrigatórios para a V1 básica.

SAM 2 ou equivalente permissivo poderá ser avaliado posteriormente para capacidades como:
- acompanhar produto/objeto;
- colocar callout/seta acompanhando objeto;
- selecionar objeto em imagem/vídeo;
- segmentação temporal avançada.

Não usar motor pesado apenas para face tracking.

Nenhum motor de object segmentation/tracking é selecionado por esta decisão.

---

## 8. Restauração de imagem

Restauração/upscale é capability explícita e não automática.

Candidatos futuros podem incluir:
- Real-ESRGAN;
- GFPGAN;
- equivalentes atuais no marco de implementação.

Regras:
- ação explícita;
- preview antes/depois;
- original preservado;
- resultado vira derivado;
- não inventar detalhes silenciosamente;
- não tratar output restaurado como novo original.

Restauração facial merece cuidado especial porque modelos podem sintetizar detalhes não presentes na fonte.

---

## 9. Restauração de vídeo

Fica como recurso avançado.

Motivos:
- alto custo computacional;
- potencial de flicker;
- inconsistência temporal;
- tempo elevado;
- possíveis artefatos inventados.

Não bloquear V1, composição ou export básico por restauração de vídeo.

Benchmark próprio somente quando houver necessidade real.

---

## 10. Packs opcionais e tamanho do instalador

Estratégia:

```text
CEVRA base
├── tracking leve selecionado
└── Vision AI Pack opcional
    ├── matting avançado, se pesado
    ├── segmentação/tracking avançado
    └── restauração/upscale
```

Capacidade pequena e essencial poderá entrar no base se benchmark/empacotamento justificarem.

Modelos pesados:
- download opcional;
- tamanho mostrado antes;
- hardware/espaço verificados;
- cancelamento;
- update/rollback;
- app continua funcional sem pack.

---

## 11. Relação com Media Runtime

Esta decisão não cria automaticamente nova operação no Media Runtime coordenado.

Tracking/matting/segmentação/restauração são engines/capabilities especializadas e devem permanecer separadas do Media Runtime quando isso for arquiteturalmente mais coerente.

Se alguma integração realmente exigir extensão do MR:
- provar a lacuna;
- mostrar mínimo adicional;
- mostrar impacto;
- voltar ao gate antes de ampliar o escopo.

Não criar segundo Media Runtime.

---

## 12. Relação com EDVID e critério de melhoria

Preservar:
- tracking funcional;
- behind-the-subject;
- processamento local;
- qualidade visual útil.

Melhorar somente onde houver ganho concreto:
- licença comercial;
- estabilidade;
- qualidade;
- performance;
- empacotamento;
- UX;
- manutenção.

Não trocar EDVID por tecnologia mais sofisticada apenas por novidade.

---

## 13. Momento de implementação

### Face tracking
Pode entrar junto da Composition Engine/câmera dinâmica.

### Matting
Implementar quando behind-the-subject entrar na fatia correspondente, após validação curta dos finalistas.

### Segmentação avançada
Diferida até existir feature que realmente dependa dela.

### Restauração
Diferida; ação explícita e benchmark no marco correto.

---

## 14. Classificação

| Capability | Estado |
|---|---|
| face/eye tracking local | GREEN / V1 |
| OpenCV | baseline EDVID |
| MediaPipe | candidato de benchmark leve |
| behind-the-subject | aprovado como capability |
| RVM | referência, não selecionado |
| PP-Matting/PP-MattingV2 | candidato preferencial |
| MODNet | depriorizado |
| SAM 2/object segmentation | futuro/opcional |
| image restoration | opcional |
| video restoration | avançado/defer |
| Vision AI Pack opcional | GREEN arquitetural |
| benchmark amplo do zero | não necessário quando evidência pública confiável existe |
| validação CEVRA curta | obrigatória antes da seleção final |

---

## 15. Decisão final

CEVRA usará motores locais especializados por capability e não um motor único de visão.

Face tracking será leve/local. Matting terá PP-Matting/PP-MattingV2 como candidato preferencial comercial e RVM como referência de qualidade EDVID; MODNet não é prioridade inicial.

Benchmarks públicos confiáveis devem ser reutilizados para evitar retrabalho. CEVRA executará apenas uma validação curta e representativa dos finalistas no cenário real do produto.

A parte técnica dos testes será preparada/executada por Codex/automação. O Product Owner receberá somente comparações prontas que exijam julgamento visual/UX.

Segmentação avançada e restauração permanecem opcionais/diferidas. Modelos pesados deverão preferencialmente ser packs opcionais, preservando o instalador base e o funcionamento do CEVRA sem essas capacidades.
