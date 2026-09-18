# CEVRA — Decisão de Integração 15: fluxo Mobile → Desktop → Mobile e transferência P2P

**Data da decisão:** 2026-09-18.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Princípio:** o mobile começa como companion do CEVRA Desktop. O desktop permanece nó principal de processamento. A transferência direta P2P é o caminho prioritário para minimizar custo recorrente e evitar cloud/storage obrigatório.

---

## 1. Objetivo inicial do mobile

A primeira experiência mobile não tentará reproduzir o editor desktop completo.

Escopo inicial desejado:

- parear celular e desktop;
- escolher/enviar vídeo;
- escolher preset;
- enviar instrução textual;
- iniciar job;
- acompanhar status;
- cancelar quando seguro;
- receber resultado pronto.

O desktop:
- recebe;
- valida;
- faz ingest canônico;
- executa CEVRA completo;
- renderiza;
- devolve resultado.

Project IR, engines pesados e render permanecem no desktop.

---

## 2. Caminho prioritário: P2P direto

Arquitetura prioritária:

```text
Mobile
  ↕ conexão P2P criptografada
Desktop CEVRA
```

Aplicável:
- mesma rede;
- redes diferentes quando NAT/roteamento permitirem conexão direta.

Objetivo:
- bytes do vídeo não atravessarem infraestrutura CEVRA;
- custo de banda do CEVRA próximo de zero;
- menor retenção externa;
- menor responsabilidade de storage.

A conexão P2P deverá usar protocolos/mecanismos adequados a NAT traversal e criptografia, sem abrir porta pública genérica no computador.

---

## 3. Requisito inicial: ambos os dispositivos online

Na primeira implementação P2P:

- mobile precisa estar online;
- desktop precisa estar ligado;
- CEVRA Desktop precisa estar disponível;
- conexão direta precisa conseguir ser estabelecida.

Se o desktop estiver offline:
- job não é enviado;
- mobile informa claramente que o desktop está indisponível;
- usuário mantém o arquivo localmente e pode tentar novamente quando o desktop voltar.

Essa limitação é aceita para a primeira etapa porque elimina necessidade imediata de storage/banda cloud.

---

## 4. Ambos online não garante P2P

Registrar explicitamente:

> Dois dispositivos online não garantem conexão P2P direta em todas as redes.

Possíveis bloqueios:
- CGNAT;
- NAT restritivo;
- firewall corporativo;
- rede móvel;
- políticas Wi-Fi;
- restrições do sistema operacional.

Portanto a UX precisa distinguir:
- desktop offline;
- desktop online mas conexão direta impossível;
- transferência em andamento;
- falha/retry.

Não declarar "zero falhas" ou mascarar erro de NAT como problema de arquivo.

---

## 5. Signaling/controle mínimo

Mesmo P2P direto pode exigir infraestrutura pequena para:

- descoberta;
- pareamento;
- troca de informações de conexão;
- presença/status;
- autenticação do dispositivo;
- revogação.

Esse tráfego é pequeno e não transporta o vídeo quando o P2P funciona.

A arquitetura deve manter separados:

```text
CONTROL PLANE
→ signaling/status/auth

DATA PLANE
→ P2P direto
```

O custo principal de mídia permanece fora do CEVRA Cloud.

---

## 6. Pareamento e identidade

Fluxo desejado:

```text
Desktop mostra QR
→ mobile lê
→ troca/estabelecimento de identidade criptográfica
→ dispositivos tornam-se pareados
```

Requisitos:
- identidade por dispositivo;
- revogação;
- sem senha do SO;
- sem desktop remoto genérico;
- mobile controla o CEVRA, não o computador inteiro;
- autenticação por job/conexão;
- criptografia ponta a ponta no transporte.

---

## 7. Transferência do arquivo

Entrada:

```text
mobile
→ P2P
→ staging local seguro no desktop
→ hash/validação
→ ingest canônico
→ SourceAsset
```

Saída:

```text
render final
→ P2P
→ mobile
→ hash/validação
→ salvar/compartilhar
```

Nenhuma timeline ou formato de projeto paralelo é criado para mobile.

---

## 8. Retomada e integridade

A implementação deverá avaliar suporte a:
- chunking;
- hash/digest;
- retry;
- retomada de transferência interrompida;
- cancelamento;
- mudança Wi-Fi ↔ rede móvel;
- app em background;
- perda temporária de conexão.

Não considerar o arquivo recebido até confirmar integridade.

Não criar SourceAsset parcial por transferência incompleta.

---

## 9. Fallback B — storage temporário criptografado

Arquitetura completa já deve prever um fallback futuro:

```text
mobile
→ criptografa localmente
→ storage temporário CEVRA
→ desktop baixa/decriptografa
→ processa
→ resultado criptografado temporário
→ mobile baixa
→ delete
```

Objetivos:
- funcionar quando desktop estiver offline no momento do envio;
- funcionar quando P2P direto não puder ser estabelecido;
- aumentar confiabilidade sem cloud render.

**Este fallback não é prioridade inicial.**

Não construir storage/cloud pesado antes de provar a experiência P2P.

---

## 10. Retenção do fallback — somente durante o job

Quando o fallback temporário for implementado, arquivos devem existir no cloud apenas enquanto necessários.

Fluxo de entrada:
1. upload do original;
2. desktop confirma download íntegro;
3. original temporário pode ser removido.

Fluxo de saída:
1. desktop envia resultado;
2. mobile confirma download íntegro;
3. resultado temporário pode ser removido.

TTL serve apenas como rede de segurança para:
- dispositivo offline;
- falha;
- confirmação ausente;
- retry.

Não guardar vídeos por dias sem necessidade e não criar biblioteca cloud permanente.

---

## 11. P2P como prioridade de custo

Quando a conexão é direta:

```text
mobile ↔ desktop
```

a mídia não consome banda/storage CEVRA.

Portanto o custo marginal de transferência para o produto tende a ser próximo de zero, fora:
- signaling;
- autenticação;
- presença;
- infraestrutura pequena de controle.

Essa é a principal razão para priorizar P2P.

---

## 12. TURN/relay

TURN/relay é uma opção futura para redes em que P2P direto não funciona.

Não é prioridade inicial porque:
- passa os bytes por infraestrutura intermediária;
- adiciona custo de banda;
- adiciona operação;
- não resolve desktop offline.

Pode ser avaliado junto ou depois do fallback de storage temporário, conforme dados reais de falha P2P e UX.

---

## 13. Cloud render não faz parte desta decisão

CEVRA Cloud não renderiza o vídeo nessa arquitetura.

```text
Cloud possível:
- signaling
- auth
- status
- fallback temporário futuro

Desktop:
- ingest
- IA/local engines
- edição
- composição
- render
```

Isso evita custo de GPU/cloud media processing.

---

## 14. Fases de implementação

### Fase 1 — prioridade
- companion mobile básico;
- pareamento;
- presença do desktop;
- P2P direto;
- envio de vídeo;
- preset/instrução;
- status;
- retorno P2P;
- ambos online como requisito.

### Fase 2 — somente se necessidade real
- melhoria de NAT traversal;
- TURN/relay;
- storage temporário criptografado;
- desktop offline / fila;
- push notifications;
- retomada mais sofisticada.

A ordem pode ser refinada por dados reais de falha/conectividade.

---

## 15. Segurança

Obrigatório:
- conexão autenticada;
- criptografia;
- dispositivo pareado;
- revogação;
- sem porta pública genérica;
- sem shell/desktop remoto;
- job IDs;
- hash;
- limites de tamanho;
- staging;
- logs sem conteúdo sensível desnecessário.

Fallback storage futuro:
- criptografia client-side quando aplicável;
- bucket privado;
- URLs assinadas;
- TTL curto;
- delete após confirmação;
- chave de conteúdo não tratada como objeto público.

---

## 16. Relação com custo e comercialização

A estratégia prioriza:
- baixo custo operacional;
- experiência mobile útil antes de editor mobile completo;
- uso do hardware do usuário;
- ausência de assinatura cloud obrigatória apenas para transferência;
- expansão futura sem invalidar o P2P inicial.

Não prometer custo absolutamente zero do serviço inteiro: signaling/auth/presença podem exigir infraestrutura mínima. A mídia P2P direta, porém, não deve consumir banda CEVRA.

---

## 17. Decisão final

CEVRA Mobile começará como companion do Desktop.

P2P direto será o caminho prioritário de transferência, inclusive entre redes diferentes quando tecnicamente possível. Na primeira etapa, mobile e desktop precisam estar online simultaneamente, e o desktop deve estar disponível.

A arquitetura já preservará um fallback futuro por storage temporário criptografado para desktop offline ou falha P2P, mas esse fallback não será prioridade inicial. TURN/relay também fica para avaliação posterior.

O objetivo é obter experiência remota útil com custo operacional de mídia próximo de zero, sem cloud render e sem armazenamento permanente de projetos.
