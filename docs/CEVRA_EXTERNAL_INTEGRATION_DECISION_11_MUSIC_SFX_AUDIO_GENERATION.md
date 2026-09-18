# CEVRA — Decisão de Integração 11: música, SFX e áudio generativo

**Data da decisão:** 2026-09-17.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** usar o caminho mais simples, barato e comercialmente seguro. SFX comuns não devem depender de IA; música gerada por IA é opcional e deve priorizar custo zero ou baixo, sem inflar o instalador básico do CEVRA.

---

## 1. Separação de responsabilidades

CEVRA tratará três categorias distintas:

1. **SFX simples e recorrentes** — preferencialmente locais/determinísticos.
2. **Música fornecida pelo usuário** — importada como áudio normal.
3. **Música gerada por IA** — capability opcional atrás de adapter próprio.

Não misturar essas categorias numa única dependência externa.

---

## 2. SFX nativos — GREEN

O CEVRA terá um pequeno pacote nativo de efeitos comuns, suficiente para os usos mais frequentes de edição:

- click;
- pop;
- whoosh;
- impact leve;
- riser curto;
- beep;
- ticking;
- page turn;
- camera/shutter;
- typing/keyboard;
- transições simples;
- outros efeitos pequenos de alta recorrência que possam ser produzidos/licenciados com segurança.

Ordem de preferência:

1. efeitos sintetizados/produzidos pelo próprio CEVRA;
2. efeitos CC0 ou equivalentes com proveniência/licença individual auditada;
3. assets de terceiros apenas quando a licença permitir claramente redistribuição dentro de produto comercial.

Não incorporar automaticamente efeitos "famosos" apenas porque são gratuitos para uso em vídeos. Direito de uso em produção não equivale a direito de redistribuir o arquivo bruto dentro do instalador.

O EDVID é referência útil: sintetiza localmente efeitos básicos como whoosh, pop e click sem depender de API externa.

---

## 3. Banco externo de SFX

Busca/download de SFX online poderá existir futuramente como capability separada.

Providers/catálogos públicos podem ser avaliados no marco correto, mas a V1 não depende disso.

Critérios obrigatórios antes de integrar:
- API/termos comerciais;
- direito de download e uso;
- direito de caching;
- attribution;
- redistribuição;
- rate limits;
- estabilidade;
- proveniência por asset.

A existência de catálogo gratuito não autoriza embutir sua biblioteca dentro do CEVRA.

---

## 4. Música fornecida pelo usuário

Arquivo musical escolhido pelo usuário entra pelo caminho normal:

```text
arquivo local
→ ingest
→ SourceAsset kind=audio
→ Project IR
→ composição/mix
```

CEVRA não presume automaticamente que o usuário possui todos os direitos de terceiros, mas preserva a origem e pode apresentar avisos apropriados no futuro.

---

## 5. Música gerada por IA

CEVRA terá um `MusicGenerationAdapter` provider-neutral.

Fluxo:

```text
MusicGenerationIntent
→ MusicGenerationAdapter
→ local/provider
→ arquivo gerado
→ validação/hash/provenance
→ managed asset
→ SourceAsset audio
→ Project IR
```

Nenhum provider/modelo vira parte do Project IR ou do mixer.

---

## 6. Preferência de custo

Ordem preferencial:

1. **geração local sem custo por chamada**, quando qualidade/hardware/licença forem adequados;
2. **caminho oficial incluído em conta/assinatura do usuário**, se programaticamente/comercialmente permitido;
3. **BYOK/API paga opcional**;
4. **CEVRA-managed API/credits** somente futuramente se houver justificativa comercial.

Não assumir que interface consumer com geração musical equivale a API ou transporte oficial para terceiros.

Nenhum gasto automático sem autorização.

---

## 7. ACE-Step como primeiro candidato de benchmark local

ACE-Step 1.5 é o primeiro candidato a benchmark para `LocalMusicAdapter`, por combinar:
- execução local;
- geração instrumental;
- controle de duração/BPM/tonalidade e outros parâmetros relevantes;
- ausência de custo por geração depois de instalado;
- licença preliminarmente permissiva no código/modelo consultado.

**Não está selecionado definitivamente.**

Antes de distribuição:
- fixar versão;
- auditar licença do código;
- auditar licença/proveniência dos pesos;
- medir qualidade;
- medir RAM/VRAM;
- medir tempo;
- testar Windows/macOS e hardware-alvo;
- confirmar empacotamento comercial.

---

## 8. AI Music Pack opcional — não embutir no instalador básico

O modelo musical pesado não ficará no instalador padrão.

Arquitetura de produto:

```text
CEVRA base
├── SFX Pack nativo pequeno
├── música do usuário
└── AI Music Pack opcional
    └── modelo local selecionado após benchmark
```

Fluxo:

```text
Configurações / Recursos opcionais
→ Música IA Local
→ verificar hardware/espaço
→ mostrar tamanho/requisitos
→ usuário autoriza download
→ instalar pack separadamente
```

O pacote pode ocupar vários GB; portanto deve:
- mostrar tamanho antes do download;
- verificar espaço livre;
- permitir cancelamento;
- suportar atualização/rollback apropriados;
- não quebrar o CEVRA se removido;
- nunca ser baixado silenciosamente.

Isso preserva instalador básico pequeno e evita penalizar usuários que não querem geração musical.

---

## 9. Providers cloud

Providers cloud como Treblo/Lyria/outros podem existir como adapters opcionais.

Treblo é referência funcional do EDVID, mas não será dependência padrão do CEVRA.

APIs gratuitas temporárias/créditos promocionais não serão tratados como "gratuito para sempre".

No marco da integração, comparar:
- custo real;
- free tier;
- direitos comerciais;
- qualidade;
- latência;
- API stability;
- duração;
- download;
- retenção/provenance;
- BYOK versus gateway.

---

## 10. Preferência do usuário para trilha

CEVRA deverá oferecer intenção de preferência semelhante a:

- **Nenhuma trilha**
- **Usar minha música**
- **Gerar automaticamente quando apropriado**
- **Perguntar antes de gerar**

Presets podem carregar uma preferência compatível.

Regras:
- `Nenhuma` é negativa explícita: Director não adiciona música.
- geração automática só pode ocorrer dentro da política de custo/autorização vigente;
- opção sem custo não significa que todo vídeo deve receber música;
- contexto editorial e estilo continuam importando.

---

## 11. Mixagem é determinística

Depois que a música/SFX existe, não usar IA para tarefas mecânicas que o CEVRA já pode resolver deterministicamente.

Mixagem deve usar operações tipadas para:
- ganho;
- fade-in/fade-out;
- ducking;
- normalização;
- loop/corte;
- alinhamento;
- mix com voz;
- mix com SFX.

Isso se integra às decisões do Media Runtime/Composition já aprovadas.

Não gastar tokens/API para calcular volume ou timing determinístico.

---

## 12. SFX e música não devem degradar a fala

A voz/conteúdo principal continua prioritário.

Validação deve cobrir:
- inteligibilidade;
- clipping;
- ducking;
- volume de SFX;
- transições;
- loudness final.

Não adicionar música/SFX para mascarar cortes ruins ou problemas editoriais não resolvidos.

---

## 13. Proveniência de música gerada

Música gerada por IA deve preservar:

- `origin = generated-ai`;
- providerId/modelId;
- versão/revision quando disponível;
- prompt;
- duração;
- BPM/key quando disponíveis;
- generationId;
- createdAt;
- uso/custo quando disponível;
- checksum;
- provenance/Content Credentials quando existirem.

Aplicam-se as mesmas políticas de disclosure das Decisões 9–10.

---

## 14. Voz sintética, clonagem e imitação ficam fora deste escopo

Esta decisão NÃO aprova:
- clonagem de voz;
- voice conversion;
- imitação de artista;
- cover de voz;
- vocal sintético imitando pessoa;
- reconstrução/síntese de fala.

Esses temas ampliam consentimento, direitos e risco comercial e deverão voltar ao Product Owner se surgir necessidade real.

---

## 15. Relação com EDVID

Preservar o valor comprovado:
- música IA opcional;
- SFX simples;
- mix final com loudness coerente.

Melhorias CEVRA:
- SFX nativos sem API;
- provider-neutral;
- local-first para música;
- AI Music Pack opcional em vez de inflar instalador;
- proveniência;
- política explícita de custo;
- preferências persistentes.

Não declarar superioridade até teste real.

---

## 16. Momento de implementação

### SFX Pack
Pode entrar na fatia de composição/audio quando houver caminho de assets/composição suficiente.

### AI Music Pack
Somente depois de:
1. benchmark de modelo;
2. auditoria licença/pesos;
3. hardware detection;
4. instalador/download opcional;
5. integração canônica de assets;
6. mix/Composition funcional.

Não bloquear V1 básica por geração musical.

---

## 17. Classificação

| Item | Estado |
|---|---|
| SFX nativos simples | GREEN |
| sintetizar SFX básicos localmente | GREEN |
| copiar bancos terceiros inteiros | RED sem licença explícita de redistribuição |
| busca online de SFX | DEFER |
| música do usuário | GREEN |
| MusicGenerationAdapter | GREEN arquitetural |
| geração local | GREEN/YELLOW, benchmark |
| ACE-Step | candidato prioritário, UNPROVEN até benchmark/auditoria |
| AI Music Pack opcional | GREEN |
| modelo pesado no instalador base | RED |
| Treblo/Lyria/cloud | opcional |
| geração paga automática | RED |
| mix determinístico | GREEN |
| voice cloning/imitação | FORA DE ESCOPO |

---

## 18. Decisão final

CEVRA terá pequeno pacote nativo de SFX, priorizando sons próprios/sintetizados e assets com redistribuição comercial clara. Não há necessidade de depender de banco externo para os efeitos básicos da V1.

Música poderá vir do usuário ou ser gerada opcionalmente. A geração musical será provider-neutral e local-first para reduzir custo. ACE-Step 1.5 entra como primeiro candidato de benchmark, não como seleção definitiva.

Modelos musicais pesados serão distribuídos como **AI Music Pack opcional**, baixado somente por escolha do usuário, e não aumentarão o instalador base em vários GB.

APIs cloud permanecem opcionais e nenhuma geração paga ocorrerá sem autorização. Mixagem, ducking, fades e normalização continuam determinísticos. Música gerada preservará provenance/disclosure. Voz/clonagem/imitação não são aprovadas por esta decisão.
