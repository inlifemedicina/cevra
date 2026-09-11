# Auditoria da baseline Media Runtime — 2026-09-11

## Resultado

Integração de main concluída por merge; baseline de execução **reprovada**.
Nenhuma implementação foi reiniciada ou substituída. A auditoria encontrou um ponto de decisão sobre concorrência, cancelamento e ciclo de vida do worker. Conforme o item 10 da solicitação, as alterações de implementação foram interrompidas nesse ponto; os testes e o registro das evidências foram concluídos. Os bugs listados abaixo permanecem abertos, incluindo a falha de compilação.

Este relatório é um registro de auditoria, não uma nova decisão arquitetural. `docs/ARCHITECTURE_V1.md` e as ADRs aceitas continuam autoritativas.

## Git e escopo

- Diretório inicial: `/Users/mauriciodallorto/Documents/GitHub/cevra`, branch `main`, limpo. Não havia worktree isolado da feature.
- Worktree criado: `/private/tmp/cevra-media-engine-v1`, branch `feature/media-engine-v1`, rastreando `origin/feature/media-engine-v1`.
- `git fetch origin` foi tentado com autorização de escrita em Git, mas falhou por ausência de autenticação HTTPS: `could not read Username for 'https://github.com': Device not configured`.
- Verificação alternativa, somente leitura, pelo conector GitHub: os heads remotos atuais eram exatamente os objetos já presentes localmente: main `003d831a383dbed5c0bcd06fd3e9c7d3df078775`; feature `5cde6bbf17ff3e7e7911ab78be23bc12b2de4388`. Isso confirma a atualidade dos dois heads usados; não significa que o comando fetch passou nem que todas as outras referências foram atualizadas.
- Antes do merge: 56 commits exclusivos da feature e 5 exclusivos de main.
- `git merge --no-ff --no-edit origin/main`: commit `0404621`, pais `5cde6bb` e `003d831`, sem conflitos.
- Arquitetura e ADR 0007 após o merge são idênticas às versões de origin/main. A ADR 0003 e a estratégia mobile da feature foram preservadas.
- Nenhum merge ou push para main. Nenhum push da feature.

Leitura integral de AGENTS.md, arquitetura, ADRs 0001–0007, documentos de segurança, licenciamento, atualização, Project IR, integrações, produto, UX, mobile, Media Runtime, NOTICE e THIRD_PARTY_LICENSES. Foram inspecionados os 28 arquivos do delta da feature, os scripts de build/teste, os contratos consumidos e o upstream efetivamente preparado pelo build pinado.

## Builds e testes

Ferramentas da auditoria: Node 24.19.0, npm 10.8.2 temporário e CPython 3.12.14 do runtime de ferramentas do Codex. Esse CPython serviu como interpretador explícito de desenvolvimento; não constitui um artefato de distribuição CEVRA aprovado. Nenhuma instalação global de Python ou pacote Python foi feita.

Dependências existentes instaladas com `npm install --ignore-scripts --no-package-lock --no-audit --no-fund`; TypeScript permaneceu em 5.8.3. Nenhuma dependência estrutural ou versão do projeto foi alterada. O repositório não possui lockfile rastreado.

| Execução | Resultado |
|---|---|
| `npm run build`, inicial e final | FAIL, exit 2. Project IR, contracts e project-store compilam; media-ffmpeg falha com TS2412 em persistent-worker.ts:54 e :68. |
| `npm test`, inicial e final | FAIL, exit 2. Passam 8 testes de Project IR, 4 de contracts e 2 de project-store. O build de media-ffmpeg impede a execução de seus testes nesse comando. |
| `node --test packages/*/test/*.test.mjs engines/*/test/*.test.mjs`, inicial e final | 26 testes passam, 0 falhas, 0 ignorados. Usou JavaScript emitido pelo tsc apesar dos erros; não substitui a aprovação do build. |
| `build_worker.py OUTPUT --python PYTHON_3_12_14` | PASS. Checkout do commit pinado, validação de versão, patch, staging e `--info` concluídos. |
| Parse AST de todos os fontes Python do media-ffmpeg | PASS, 10 arquivos; não comprova renderização. |
| Duas requisições JSON-RPC `ping` no mesmo processo Python | PASS; o processo responde às duas requisições. |
| Ferramenta upstream `cut --help` com criação de subprocessos bloqueada no teste | PASS; o caminho foi executado dentro do processo. Também reproduz a aceitação indevida de `argv` bruto. Não é um teste de renderização. |
| `prepare_ffmpeg_source.py` | BLOCKED: falta `gpg`, exigido pelo script para verificar assinatura. O build nativo de FFmpeg depende dessa fonte verificada e não pôde ser executado. |
| `generate_manifest.py` sobre o staging | FAIL esperado por bundle incompleto: componente `bin/ffmpeg` ausente. |
| Worker `--health` em modo release | `ok: false`, FFmpeg e ffprobe ausentes; ffmpeg-skill PASS. O comando termina com exit 0 mesmo quando o conteúdo de saúde informa falha. |
| `npm run doctor` | Exit 0; Node/npm/Python/Git disponíveis com PATH de auditoria. Rust, Cargo, FFmpeg e ffprobe ausentes. |
| `git diff --check` | PASS para o merge. |

Não há suite Python rastreada nem workflow CI neste snapshot. Não há build de aplicativo desktop/mobile configurado. Smoke tests reais de codecs, GPU, HDR, muxing e cancelamento durante render não foram executados: falta o FFmpeg de release e a integração concreta do transporte.

## Validação solicitada

| Área | Evidência e conclusão |
|---|---|
| Python privado gerenciado | ADR 0007 preservada, pin 3.12.14 e staging com interpretador explícito funcionam. Porém o build aceita qualquer interpretador com a versão exigida e herda o ambiente; `-s` não ignora PYTHONPATH. Não há launcher desktop, instalador, artefato CPython exato com hash/proveniência ou verificação do bundle inteiro. Não é possível certificar independência do Python global em produção. |
| Worker persistente | Loop Python e cliente lazy-start existem; duas requisições no mesmo processo passaram. Transporte concreto, recuperação após crash e coordenação entre close/start/requisições permanecem incompletos. |
| Python no processo do worker | Importação e execução de `module.main()` confirmadas no caminho auditado. O worker não utiliza `upstream.call_tool`, que criaria outro Python. Não foi validado cada caminho de render das 42 ferramentas upstream. |
| ffmpeg-skill 1.4.2 | Checkout efetivo do commit `58f64f9d9e6a0ced4a4cd6a198d7476dede50d1a`, package.json e patch/provenance verificados pelo staging. LICENSE MIT conferida contra o texto rastreado. |
| Sem fallback implícito x264/x265 | Candidatos normais excluem os dois e wrappers falham sem encoder. Porém `CEVRA_ALLOW_GPL_DEV_ENCODERS=1` também é aceito em modo release, reproduzido sem executar FFmpeg. |
| FFmpeg LGPL-only | Script bloqueia GPL/nonfree/x264/x265 e desabilita autodetect. Fonte/binário pinados em 9.0.1. Sem binário compilado e materiais de release, a classificação do artefato final não está comprovada. |
| Manifest e provenance | Schema, hashes do worker/vendor/Python executável/FFmpeg/ffprobe e flags existem. Não há consumidor/verificador de assinatura do manifest. `--info` fornece constantes upstream, não valida o vendor; generate_manifest exige os arquivos de provenance, mas não lê seus conteúdos. Não valida notices nem o bundle CPython completo; fonte FFmpeg é preenchida a partir do pin, sem conferir provenance do build recebido. |
| Encoder capability e smoke | Worker possui smoke real de 8 frames e cache. TypeScript volta ao primeiro candidato mesmo se todos os benchmarks falharem; reproduzido. Cache Python usa somente nome do encoder, sem fingerprint de runtime/GPU/driver. |
| Hardware acceleration | Políticas de hardware e decode separado existem. Seleção de decode usa lista de recursos compilados, sem teste funcional do dispositivo. VAAPI consta na direção documentada para encode Linux, mas não nos candidatos implementados. Build Linux não habilita backends externos. HDR usa smoke SDR; comportamento real não validado. |
| Cancelamento | Apenas pré-abort e encaminhamento de signal no TypeScript. Sem transporte concreto, mensagem de cancelamento, controle de processo ativo ou limpeza transacional no worker. Bloqueio descrito abaixo. |
| Codec/container | Validações parciais no adapter. Container inferido por extensão passa sem validação, codecs omitidos podem virar H.264/AAC em WebM, containers de áudio não removem vídeo no worker, stream copy não verifica codecs do arquivo de entrada. Reproduzido despacho de H.264/AAC para `.webm` sem container explícito. |
| Shell/filtergraph/args arbitrários | Superfície MediaOperation bloqueia alguns nomes proibidos e o adapter monta argumentos. Porém tools/list publica as 42 ferramentas upstream com `argv`; tools/call aceita esse campo. Custom schemas usam additionalProperties=true. Não foi encontrado shell=True no código CEVRA. Isso não comprova o requisito de operações estritamente tipadas no RPC. |
| Mobile | Contratos e Project IR não importam Python; apps/mobile contém somente README. Fronteira documental preservada, sem validação de funcionalidade mobile executável. |

## Bugs e lacunas ainda abertos

1. **Build quebrado:** `src/persistent-worker.ts:18` declara `startPromise?: Promise<void>`, mas :54 e :68 atribuem undefined com exactOptionalPropertyTypes. Correção localizada possível: união explícita `Promise<void> | undefined`; não requer mudança arquitetural. Não aplicada após a interrupção da implementação.
2. **Release ainda pode executar FFmpeg externo:** worker `_tool()` bloqueia PATH em release, mas o `_common.require_tool()` vendorizado usa shutil.which. O patch não substitui essa função e `_call_tool_in_process()` não exige health válido antes de executar. Reproduzido por substituição controlada de shutil.which, sem executar binário externo.
3. **Bypass de política na fronteira RPC:** `argv` bruto e ferramentas fora do subconjunto MediaOperation são publicados e aceitos. A exposição final ao usuário depende do Agent Bridge ainda não implementado; não há evidência de exposição pública remota.
4. **Override GPL em release:** wrapper considera somente CEVRA_ALLOW_GPL_DEV_ENCODERS, sem checar o modo release.
5. **Encoder malsucedido selecionado:** `src/runtime.ts:101` usa candidates[0] quando não há benchmark bem-sucedido. Reproduzido com h264_nvenc e success=false.
6. **Contratos incompletos:** `extract-audio.audioCodec` não é encaminhado; `mux-audio.replaceExisting=false` não altera o comportamento de substituição. Validação por `String(value)` aceita array como codec; reproduzido com `['h264']`. Numeric validators Python aceitam Infinity/NaN; limites e tipos inteiros diferem entre contratos, argparse e ferramentas customizadas.
7. **Sucesso e capabilities pouco confiáveis:** payload sem structuredContent válido vira `{}` e operações de arquivo podem retornar o URI esperado sem evidência de saída. Health customizado exige FFmpeg/ffprobe, mas não reflete todas as dependências de vendor/encoder/container; status disponível não garante operação executável.
8. **Matriz de entrega incompleta:** validação explícita somente no adapter, defaults incompatíveis e áudio/vídeo do input não considerados em todos os containers. `copy` com resize/fps só é rejeitado no worker.
9. **Isolamento e integridade de release incompletos:** modo default é desenvolvimento; symlinks e overrides de diretórios/ambiente não são uma fronteira de confiança. Falta verificação da instalação privada, notices, pacote CPython completo e manifest assinado antes da execução.
10. **i18n:** erros, checks, capabilities e mensagens de instalação upstream retornam texto inglês. Catálogos PT-BR/EN-US têm paridade de 16 chaves básicas, mas não cobrem o Media Runtime.
11. **Journal e recuperação:** engine produz arquivos, mas não há integração de application service ligando essas execuções ao journal/snapshot e à recuperação de arquivos parciais. Project IR e history existentes não foram modificados.

Busca por TODO/FIXME/HACK/XXX/stub/placeholder/NotImplemented/not implemented não encontrou marcadores nos arquivos rastreados CEVRA. Isso não elimina as lacunas acima. Permanecem caminhos legados de frozen/PyInstaller (`sys.frozen`, `_MEIPASS`) sem uso pelo build atual, parâmetro `_mode` sem efeito, documentação de FFmpeg ainda “to be pinned” apesar do pin em versions.json e ausência de lockfile. Não foram removidos caminhos apenas por parecerem mortos.

## Ponto que exige aprovação antes de implementação

**Problema:** o loop atual lê uma requisição, executa sincronamente e só volta a ler stdin depois do término. Durante a ferramenta, sys.argv, stdout/stderr e estado upstream são alterados globalmente. Não há transporte desktop concreto nem referência cancelável ao subprocesso FFmpeg ativo. Encaminhar AbortSignal não cancela trabalho real; matar o worker por operação descaracteriza a persistência e deixa recuperação indefinida.

**Proposta para revisão do product owner:** manter um único worker com CPython privado e ferramentas no mesmo processo, com leitura contínua de mensagens de controle, execução serial das ferramentas e registro explícito do job/subprocesso FFmpeg ativo. O transporte desktop implementaria a interface existente, identificaria requisições e sinalizaria cancelamento; o worker encerraria somente o subprocesso da operação e trataria a saída parcial antes de aceitar o próximo job. Definir protocolo, estados e garantias de cancel/close/crash em ADR antes de implementar esse padrão.

**Benefício:** cancelamento efetivo e verificável mantendo persistência e execução in-process.

**Risco:** corrida entre cancelamento e conclusão, captura global de stdout, diferenças de processo em Windows/macOS, subprocessos auxiliares e preservação de arquivos já existentes. Exige testes de integração com FFmpeg real e falhas injetadas.

**Impacto:** transporte, dispatch do worker, wrapper de execução e testes de integração. Project IR, engine principal, frameworks, persistência e dependências estruturais permanecem os aprovados. A escolha do padrão de concorrência e ciclo de vida exige aprovação pelas regras 3 e 14 de AGENTS.md e pelo item 10 da solicitação. Nenhuma ADR nova foi marcada como aceita.

## Alterações e evidências

Arquivos integrados pelo merge: `docs/ARCHITECTURE_V1.md`, `docs/LICENSING.md`, `docs/UPDATE_STRATEGY.md`, `docs/adr/0007-managed-python-runtime.md`. Arquivo novo desta auditoria: `docs/MEDIA_RUNTIME_AUDIT_2026-09-11.md`. Nenhum fonte, teste, schema ou dependência recebeu correção nesta etapa interrompida. Resolvida apenas a defasagem da feature em relação ao main confirmado.

Logs locais temporários: `/private/tmp/cevra-audit-build-final.log`, `/private/tmp/cevra-audit-tests-final.log`, `/private/tmp/cevra-audit-all-tests-final.log`, `/private/tmp/cevra-audit-python-final.log`, `/private/tmp/cevra-audit-doctor-final.log`, `/private/tmp/cevra-audit-health.json`. Probe Python: `/private/tmp/cevra-audit-tools/probe_runtime.py`. Bundle de staging: `/private/tmp/cevra-audit-staged-runtime`. Arquivos temporários não fazem parte do produto e podem ser removidos pelo sistema.
