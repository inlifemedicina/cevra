# CEVRA — Decisão de Integração 8: download, localização, proveniência, créditos, retenção e ciclo de vida de ativos externos

**Data da decisão:** 2026-09-17.  
**Status:** APROVADA PELO PRODUCT OWNER.  
**Implementação:** NÃO AUTORIZADA por este registro.  
**Relação com Decisões 6 e 7:** especializa o caminho após a seleção de um ativo externo e preserva o `SourceAsset`/Project IR como fonte canônica.  
**Princípio:** ativo externo selecionado deve virar um arquivo local estável do projeto, com integridade e proveniência preservadas, sem reconsulta obrigatória ao provider para reabrir, renderizar ou recuperar o projeto.

---

## 1. Armazenamento gerenciado por projeto na V1

A V1 usará armazenamento gerenciado **por projeto**, não uma biblioteca global compartilhada.

Fluxo canônico:

```text
resultado externo selecionado
→ download temporário
→ validação do conteúdo
→ hash
→ snapshot de proveniência/licença
→ move atômico para managed assets do projeto
→ source.add
→ ProjectHistory / Project IR
```

Conceitualmente:

```text
<project>/
  project state / journal / checkpoints
  managed-assets/
    originals/
    derived/
```

Os nomes físicos exatos das pastas são detalhe de implementação futura.

### Motivo
- reduz risco de projeto quebrar porque URL externa expirou;
- facilita backup, portabilidade futura, exclusão e recuperação;
- evita relações cross-project prematuras;
- mantém comportamento simples semelhante ao EDVID (arquivo incorporado ao projeto), mas com integridade/proveniência formais;
- evita complexidade de uma biblioteca global sem ganho comercial proporcional na V1.

Uma biblioteca/cache global poderá ser avaliada futuramente somente se economia de disco/desempenho justificar a complexidade.

---

## 2. Fontes locais e ativos adquiridos externamente permanecem distintos

### Arquivo local do usuário
Pode continuar referenciado em seu local original, conforme Decisão 6.

```text
arquivo local do usuário
→ SourceAsset aponta para o original
```

### Ativo externo adquirido
Deve ser materializado em armazenamento gerenciado do projeto.

```text
Pexels / Wikimedia / Openverse / provider futuro
→ download
→ managed asset local
→ SourceAsset
```

Uma URL remota nunca será a única fonte audiovisual durável do projeto.

---

## 3. Download seguro e transacional

O CEVRA não grava um candidato remoto diretamente como ativo canônico.

Pipeline mínimo:

1. receber somente um candidato originado de adapter/provider autorizado;
2. baixar para workspace temporário;
3. aplicar limites de tamanho, timeout e recursos;
4. validar o conteúdo real;
5. confirmar tipo de mídia e metadata compatível;
6. calcular SHA-256;
7. capturar proveniência/licença/crédito disponível;
8. mover atomicamente para armazenamento gerenciado;
9. só então executar `source.add`.

Falha/cancelamento antes do passo 9 não pode criar `SourceAsset` parcial.

Downloads externos não serão aceitos a partir de URL arbitrária emitida por modelo/agent. O CEVRA controla allow-list/provider e o adapter de origem.

---

## 4. Data path: mídia pesada fora do CEVRA Gateway sempre que possível

A Decisão 7 permanece válida:

```text
CEVRA Desktop
→ CEVRA Search Gateway
→ metadata/candidatos

CEVRA Desktop
→ CDN/provider autorizado
→ download direto da mídia
```

O gateway não deve virar proxy de arquivos grandes sem necessidade concreta.

Isso reduz:
- banda CEVRA;
- storage;
- custo;
- latência;
- responsabilidade operacional.

---

## 5. Identidade: sourceId + SHA-256

`sourceId` continua sendo a identidade lógica dentro do CEVRA.

`SHA-256` será a identidade/integridade do conteúdo físico adquirido.

Usos previstos:
- detectar corrupção;
- detectar download incompleto;
- deduplicar dentro do projeto;
- verificar reopen/recovery;
- impedir substituição silenciosa;
- preparar eventual cache global futuro sem redesenhar o Project IR.

---

## 6. Deduplicação dentro do projeto

Se o mesmo conteúdo for adquirido novamente e o SHA-256 for idêntico, o CEVRA poderá reutilizar a representação física existente.

A deduplicação da V1 é **project-local**.

Não criar dependência cross-project nem library global apenas para deduplicação.

---

## 7. Proveniência e snapshot de licença

Para cada ativo externo, preservar no momento da aquisição, quando disponível:

- `origin = external-acquired`;
- providerId;
- providerAssetId;
- página-fonte;
- data/hora de aquisição;
- autor/criador;
- licença;
- referência/URL da licença;
- requisito de atribuição;
- referência de download adequada;
- MIME/tipo original;
- width/height;
- duration quando vídeo;
- checksum SHA-256;
- demais metadata estritamente útil.

Metadata específica do provider permanece em `extensions`/provenance; não cria modelo canônico paralelo.

O objetivo é registrar **o que foi apresentado no momento da aquisição**, não prometer que o provider nunca mudará seus termos ou metadata.

---

## 8. Sem reconsulta obrigatória e sem reconfirmação repetitiva

Regra aprovada para reduzir retrabalho:

> Uma vez adquirido, validado e incorporado, o ativo é estável. Reabrir projeto, renderizar, desfazer/refazer ou exportar não deve exigir nova busca, novo download, nova seleção ou reconfirmação da decisão editorial original.

O CEVRA **não fará revalidação online rotineira** do provider/licença a cada reopen/export.

Na exportação, o sistema usa deterministicamente o snapshot de proveniência/atribuição já salvo.

Se metadata obrigatória estiver ausente/inconsistente, o CEVRA deve sinalizar o problema de forma objetiva. Não deve silenciosamente re-pesquisar e substituir o ativo.

Substituição/atualização de um ativo já incorporado será operação explícita futura.

---

## 9. Créditos e atribuição — requisito de produto

Quando existirem créditos/atribuição relevantes, o CEVRA deve preservá-los desde a aquisição e disponibilizar formas adequadas de entrega.

Canais previstos:

1. **Crédito dentro do vídeo/imagem**, por exemplo rodapé discreto ou end-card, quando:
   - a licença/provider exigir;
   - o usuário solicitar;
   - o preset de publicação determinar.

2. **Crédito fora da mídia**, gerado como texto utilizável em:
   - descrição/caption do post;
   - arquivo de créditos;
   - campo copiável na UI;
   - metadata/export companion quando aplicável.

3. **Resumo de créditos utilizados no projeto/export**, derivado apenas dos ativos efetivamente presentes no output final.

Princípio de UX:
- não degradar visualmente o vídeo com créditos queimados quando isso não for necessário;
- não omitir atribuição quando necessária;
- disponibilizar ao usuário o texto pronto para postagem quando crédito externo for a forma adequada.

A regra jurídica exata de cada provider/licença deve ser revalidada no marco de implementação daquele provider.

---

## 10. Original preservado + derivados/proxies

O ativo original adquirido deve ser preservado.

Se o Composition Engine não suportar diretamente determinado formato ou se houver necessidade de otimização:

```text
original
→ derivado/proxy CEVRA
→ Composition Engine
```

Exemplos possíveis:
- HEIC/HEIF → proxy compatível;
- AVIF → proxy;
- imagem excessivamente grande → derivado otimizado;
- codec específico de vídeo → proxy adequado.

O derivado nunca substitui silenciosamente o original.

---

## 11. Imutabilidade e ausência de substituição silenciosa

Depois do ingest:

```text
providerAssetId X
→ bytes A
→ SHA-256 A
```

é a versão usada naquele projeto.

Se o provider futuramente entregar bytes B para o mesmo asset ID, o CEVRA não substitui A automaticamente.

Qualquer atualização futura:
- deve ser explícita;
- deve produzir nova provenance/hash;
- deve preservar histórico coerente.

Isso evita reconferência/retrabalho de decisões já aprovadas.

---

## 12. Reopen offline obrigatório

External Asset Round-Trip terá teste obrigatório:

1. buscar ativo;
2. selecionar;
3. baixar;
4. validar;
5. ingerir;
6. salvar;
7. fechar CEVRA;
8. desconectar internet/provider;
9. reabrir;
10. confirmar mídia disponível;
11. confirmar preview/composição;
12. confirmar render/export quando o Composition Engine estiver integrado.

Falha em qualquer item significa que o round-trip não está aprovado.

---

## 13. Catálogo permanente de testes futuros

O CEVRA deverá manter, durante o desenvolvimento, uma lista explícita de testes manuais/aceitação para o Product Owner executar quando existir uma versão testável.

Para esta decisão, registrar desde já:

### Ingest/integridade
- download válido de imagem;
- download válido de vídeo;
- arquivo com extensão enganosa;
- conteúdo inválido/HTML no lugar de imagem;
- download interrompido;
- cancelamento;
- timeout;
- hash divergente/corrupção;
- deduplicação do mesmo ativo;
- provider fora do ar.

### Persistência
- fechar/reabrir online;
- fechar/reabrir offline;
- mover/reabrir projeto conforme regras suportadas;
- reiniciar app após crash entre download e commit;
- garantir ausência de SourceAsset parcial.

### Proveniência/crédito
- autor/licença presentes;
- attributionRequired;
- geração de texto de créditos;
- crédito visual quando requerido;
- ausência de créditos para ativos não usados no export;
- metadata incompleta deve gerar aviso controlado, não re-pesquisa automática.

### Histórico
- remover source;
- undo;
- redo;
- reiniciar após undo/redo;
- ativo físico continua disponível enquanto recuperável.

### Exclusão/lixeira
- excluir projeto;
- restaurar antes de 30 dias;
- confirmar managed assets intactos;
- apagar definitivamente;
- expirar após 30 dias;
- confirmar que originais externos ao projeto não foram apagados.

### Fluidez/UX
- busca → seleção → download → uso sem passos técnicos;
- progresso de download;
- cancelamento responsivo;
- mensagens compreensíveis;
- nenhum pedido de API key para fluxo normal aprovado;
- tempo e número de cliques aceitáveis.

Essa lista deverá ser expandida por decisões futuras e apresentada ao Product Owner no marco de teste do produto.

O catálogo cumulativo canônico de ações de teste, resultado esperado e resposta do Product Owner está em `docs/CEVRA_PRODUCT_OWNER_ACCEPTANCE_TESTS.md`. A partir desta decisão, novas aprovações devem atualizar esse catálogo e também revisar testes anteriores quando mudarem parâmetros ou expectativas já registradas. A lista resumida desta seção permanece como contexto da decisão; o catálogo cumulativo é a referência operacional para homologação.

---

## 14. Retenção de ativos órfãos, Undo/Redo e Recovery

Erro a evitar:

```text
source.remove
→ apaga arquivo físico
→ usuário faz Undo
→ source volta, arquivo desapareceu
```

Política aprovada:

### V1
- `source.remove` remove a referência canônica, **não apaga imediatamente o arquivo físico gerenciado**;
- arquivos potencialmente necessários por undo/redo, journal, checkpoint ou recovery ficam protegidos;
- nenhum garbage collection agressivo automático será feito sem prova de que o ativo não é mais recuperável;
- limpeza de ativos não utilizados será uma operação segura e explícita futura, com estimativa de espaço a liberar.

Conceitualmente, ativos poderão ter estados internos como:

```text
active
orphaned-but-recoverable
eligible-for-cleanup
```

A definição de `eligible-for-cleanup` deverá considerar:
- estado atual;
- undo/redo recuperável;
- checkpoints;
- recovery;
- operações em andamento;
- referências em derivados necessários.

O CEVRA deve preferir ocupar um pouco mais de disco a causar perda/retrabalho do usuário.

---

## 15. Lixeira de projetos por 30 dias

Ao excluir um projeto, o CEVRA **não deve destruí-lo imediatamente**.

Fluxo aprovado:

```text
Excluir projeto
→ mover/marcar projeto para Lixeira CEVRA
→ preservar projeto completo + managed assets
→ retenção por 30 dias
```

Na Lixeira:
- mostrar projetos excluídos;
- mostrar data da exclusão;
- mostrar data prevista de remoção definitiva;
- botão **Restaurar**;
- botão **Apagar agora** / exclusão definitiva.

Após 30 dias, o CEVRA poderá remover definitivamente o projeto e seus managed assets.

Não é necessário daemon em background apenas para isso: manutenção pode ocorrer na inicialização/abertura do app e em outros pontos seguros.

### Efeito sobre arquivos
- ativos externos baixados especificamente para aquele projeto são apagados quando a exclusão torna-se definitiva;
- não permanecem como biblioteca global;
- proxies/derivados daquele projeto também são removidos;
- arquivos originais do usuário que ficam fora do projeto **nunca** são apagados;
- se o projeto tiver cópias consolidadas de fontes locais, apenas as cópias gerenciadas são apagadas; os originais externos permanecem.

A lixeira inteira deve ser restaurável sem depender de internet/provider.

---

## 16. Consolidação de projeto

Capacidade futura prevista:

```text
Projeto referenciando arquivos locais externos
→ Consolidar projeto
→ copiar fontes necessárias para armazenamento gerenciado
→ projeto passa a ser mais portátil/autossuficiente
```

Pode existir em dois modos:

### Manual
Usuário escolhe **Consolidar projeto**.

Útil antes de:
- mover projeto;
- backup;
- enviar para outro computador;
- arquivar;
- trabalhar remotamente.

### Automático/assistido futuro
CEVRA poderá sugerir ou executar consolidação em fluxos que realmente necessitem, por exemplo:
- exportar pacote portátil;
- transferência para outro dispositivo;
- workflow remoto;
- backup/sync futuro.

Não haverá consolidação automática silenciosa de grandes fontes sem política clara de espaço, progresso, cancelamento e autorização apropriada.

### Preferência do usuário — aprovada
A UI deverá permitir uma preferência persistente, com pelo menos estas intenções:

- **Referenciar arquivos originais** — padrão conservador: mantém fontes locais no lugar de origem e consolida somente quando solicitado/necessário.
- **Sempre consolidar novos projetos** — copia para armazenamento gerenciado as fontes elegíveis importadas, com progresso, espaço necessário, cancelamento e tratamento de falha.
- **Perguntar conforme necessário** — CEVRA solicita decisão quando a consolidação tiver benefício material para portabilidade, backup, transferência ou outro workflow.

A preferência não autoriza apagar o arquivo original, copiar silenciosamente volume desproporcional sem feedback, nem transformar ativos externos já gerenciados em duplicatas. Mudanças da preferência afetam operações futuras; não reescrevem retroativamente projetos existentes sem ação explícita.

---

## 17. Relação com EDVID e critério de melhoria

EDVID guarda assets dentro do diretório da edição e isso será preservado conceitualmente porque é simples e portátil.

CEVRA adiciona somente melhorias com valor concreto:
- SourceAsset canônico;
- SHA-256;
- provenance estruturada;
- snapshot de licença;
- créditos;
- ingest transacional;
- reopen offline como requisito;
- retenção compatível com Undo/Recovery;
- lixeira de 30 dias;
- futura consolidação.

Regra geral aprovada pelo Product Owner para este chat:

> Toda proposta adicional deverá ser comparada com o que o EDVID já faz e justificar ganho real de produto, segurança, experiência ou comercialização frente ao custo/complexidade/retrabalho criado.

Não adicionar infraestrutura apenas por elegância arquitetural.

---

## 18. O que não é autorizado agora

Esta decisão NÃO autoriza:
- implementação;
- library global;
- cloud storage;
- sync;
- upload de projetos;
- garbage collector;
- alteração imediata do Media Runtime;
- mudança de Project IR sem necessidade comprovada;
- download de mídia real;
- gateway novo;
- mudança do Composition Engine.

---

## 19. Critério de conclusão futura

A implementação correspondente só poderá ser considerada pronta quando demonstrar:

```text
search/select
→ download
→ validate/hash/provenance
→ managed asset
→ source.add
→ save
→ close
→ offline reopen
→ preview/render
→ remove
→ undo/redo/recovery
→ project trash
→ restore
→ permanent delete
```

sem perda silenciosa de dados, reconsulta obrigatória ao provider ou passos técnicos desnecessários ao usuário.
