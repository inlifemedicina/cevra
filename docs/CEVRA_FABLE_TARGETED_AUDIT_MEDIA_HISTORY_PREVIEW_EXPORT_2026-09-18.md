# CEVRA — Fable targeted technical audit: history, runtime, preview e export

**Data:** 2026-09-18.
**Status:** EVIDÊNCIA TÉCNICA REVISADA; K1–K5 APROVADAS COMO DIREÇÃO; IMPLEMENTAÇÃO PENDENTE.

## 1. Blocker de correção: ProjectHistory

O audit mediu um projeto realista com três fontes de 30 minutos, transcrições word-level, snapshots integrais do Project IR por commit e serialização/clonagem do archive. A falha ocorreu por volta de 367 commits com:

```text
RangeError: Invalid string length
```

Isto é um blocker de correção/escalabilidade antes de alto volume de comandos de edição, não apenas otimização. A remediação deve:

- evitar duplicar o payload de transcript em cada snapshot ou adotar estratégia bounded equivalente;
- preservar journal, undo/redo, recovery, identity/version e compatibilidade de projetos;
- medir heap, CPU, serialização, I/O e checkpoints em cenários realistas;
- não criar segundo sistema de history.

Primeiro candidato documentado, não preaprovado: armazenamento de transcript content-addressed/referenciado pelo digest canônico existente. Snapshots periódicos, journal replay e checkpoints incrementais permanecem candidatos se ainda necessários. O formato/layout interno final exige revisão técnica.

## 2. Outros achados confirmados

- Paths privados de Python usam suposições POSIX incompatíveis com o layout Windows `python.exe`.
- O release atual não fecha H.264 Windows/fallback.
- J-cut exige placement/mix temporal por stream; concat atual pode gerar recodificação evitável.
- Worker expõe metadados de orientação/cor/frame rate que contratos TypeScript não preservam integralmente.
- Persistência amplifica custo ao serializar/deserializar e regravar o archive completo.
- Contrato de composição precisa de boundary de plano resolvido antes do benchmark, sem o engine reinterpretar Project IR.
- Tone mapping HDR→SDR validado não existe no caminho fechado atual.
- Render de produção precisa de timeout/watchdog bounded compatível com cancelamento/recovery.
- Ownership/quota/cleanup de proxy, thumbnail/evidence frame, PCM, composition cache e render staging permanece incompleto.

## 3. K1 — H.264 Windows

**APROVADA COMO DIREÇÃO.** Primeiro caminho oficial candidato: `h264_mf` / Microsoft Media Foundation, após validação Windows real e smoke de capability. Hardware acceleration pode ser usada quando validada. NVENC/QSV/AMF não são requisitos V1 separados. Não adicionar OpenH264 agora e não substituir silenciosamente H.264 por AV1/VP9. Se Media Foundation falhar materialmente, reabrir fallback com análise de licença/patente/compatibilidade.

## 4. K2 — HDR→SDR

**APROVADA COMO DIREÇÃO.** Mídia HDR comum deve funcionar no fluxo V1 normal. Para output SDR, executar conversão HDR→SDR automática e validada; primeiro candidato: FFmpeg `zscale`/zimg + tone mapping + BT.709. Versão/build/licença/qualidade/performance/bundle precisam de auditoria/benchmark.

Reconhecer rotação/orientação, primaries, transfer, matrix/range, pixel format/bit depth e VFR. Aceitar HLG/HDR10 e iPhone HDR/Dolby Vision quando FFmpeg decodificar o vídeo subjacente. Preservação HDR/Dolby Vision avançada não é requisito V1. Fail-closed é último recurso; saída silenciosamente washed-out/mistagged é proibida.

## 5. K3 — ownership de render V1

**APROVADA COMO DIREÇÃO.** Usar o caminho mais simples viável:

```text
Project IR
→ aplicação coordena
   ├─ Composition Engine → vídeo visual final sem áudio final
   └─ Media Runtime → áudio final
→ Media Runtime faz mux por stream-copy quando válido
→ arquivo final
```

Não criar grande Render Orchestrator antecipadamente. O vídeo visual é renderizado uma vez; attaching audio não justifica recodificação com perda. Aplicação mantém timing/decisões/IR. O transporte interno pode evoluir por benchmark sem alterar semântica.

## 6. K4 — benchmark de composição

**APROVADA.** Manter a matriz completa CEVRA/EDVID e acrescentar:

1. compatibilidade prática com live preview no WebView/caminho compartilhado;
2. caminho de originais e impacto de intermediários/gerações desnecessárias.

Proxy/aproximação é aceitável no preview se export volta ao original/melhor fonte e preserva semântica. Candidato sem preview viável ou que force perda evitável não é selecionado.

## 7. K5 — plataformas V1

**APROVADA.** Targets oficiais:

- macOS Apple Silicon / arm64;
- Windows x64.

macOS Intel, Linux e Windows ARM ficam fora da promessa V1. Preservar portabilidade no domínio/aplicação. Ambos targets primários exigem clean-machine closure para ingest/edit/preview/audio/captions/render/export, HDR→SDR e update antes do release.

## 8. Sequenciamento

ProjectHistory remediation precede alto volume de edição. Pequenas correções de runtime/plataforma e evidência K1–K5 alimentam o gate coordenado Media Runtime. Transcript Cache V1 é reconciliado/fechado depois desses gates, com revalidação explícita de sua relação com armazenamento/history; não assumir uma implementação compartilhada.
