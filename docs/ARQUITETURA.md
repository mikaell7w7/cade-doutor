# Arquitetura

O navegador mantém a interface e a seleção de prestadores. A extensão Manifest V3 possui apenas `storage`, `sidePanel`, acesso ao serviço loopback e à origem de atualização do catálogo. O content script é limitado ao portal TST Saúde.

O aplicativo Node atende exclusivamente em `127.0.0.1:43119`. Valida Host e Origin; exige código temporário para criar uma sessão vinculada à origem. Páginas locais usam o contexto same-origin do navegador. Cada chamada da API privada exige a sessão. O callback OAuth usa state e PKCE, sem depender da sessão de interface.

O OAuth usa o cliente dinâmico somente no primeiro registro. O callback fornece o cliente emitido. O aplicativo valida assinatura, emissor, público, validade e nonce do ID token e usa cliente emitido mais subject como identidade do perfil. O host UUID persiste entre sessões. Falha de troca mantém o cliente emitido para novo fluxo. A permissão de uso do plano é verificada separadamente da identidade. Renovações simultâneas são serializadas por registro.

Tokens ficam em arquivos locais protegidos e nunca são retornados à extensão. O logout tenta revogar remotamente, limpa credenciais locais e preserva o registro para reautorização. Caso a revogação remota falhe, a interface informa que não houve confirmação.

A Responses API é chamada com `store:false` e `stream:true`. O parser consolida itens, argumentos e texto durante todo o streaming, preservando dados anteriores quando o evento final omite itens ou contém `output` vazio. Somente `response.completed`, sem falha posterior, confirma a conclusão; uma resposta sem texto nem ferramenta continua sendo um erro explícito. Texto parcial seguido por erro permanece visível acompanhado de aviso. As consultas enviam pergunta, histórico textual completo desta conversa e metadados públicos do catálogo; as ferramentas retornam os registros públicos encontrados. Notas e favoritos não são adicionados automaticamente. O catálogo dos modelos é consultado para a conta ativa.

O assistente usa ferramentas de função no namespace `catalog`: `search_catalog` (filtros e paginação de até 50 unidades) e `get_providers` (IDs oficiais). O escopo padrão cobre todas as unidades; o escopo opcional de seleção é imposto no servidor. Cada mensagem começa por uma consulta ao catálogo. As respostas e itens de raciocínio retornados, inclusive conteúdo criptografado, são preservados na continuação stateless dentro da mensagem, acompanhados dos `function_call_output` correspondentes. Não há ferramenta de shell, gravação pessoal ou leitura de credenciais. A pesquisa web é opt-in e fica disponível depois da primeira consulta local.

Cada mensagem tem limite de nove rodadas de inferência, 24 chamadas de função e quatro minutos, além da consulta inicial de modelos. A última rodada solicita uma síntese com pendências explícitas. A busca não afirma completude quando faltam páginas. O servidor valida o histórico (20 trocas completas, 120 mil caracteres totais) e prende as chamadas à conta ativa. O navegador troca o histórico visível ao mudar de conta e exclui respostas interrompidas do próximo pedido. Conversas são persistidas no serviço local por perfil; somente o contexto recente é enviado à IA.

Markdown é interpretado como tokens e convertido em nós DOM por uma lista permitida, sem `innerHTML`. HTML bruto aparece como texto; links externos aceitam somente HTTP(S). Links de ficha usam IDs do catálogo atual, nunca HTML ou comandos da resposta. Cartões exibidos pelo streaming vêm das ferramentas locais; não são montados a partir de dados inventados pelo modelo.

O catálogo público é independente dos perfis pessoais. O identificador inicial deriva de nome e endereço. Alteração de endereço gera possível correspondência para revisão; nunca funde filiais automaticamente. Os campos `declared`, `extracted`, `uniqueExtracted` e `duplicateOccurrences` permitem conferir a coleta por categoria.

As gravações pessoais incluem revisão e identificador do perfil. O servidor recusa gravação se outra janela alterou os dados ou se houve troca de conta, evitando sobrescrita silenciosa. Arquivos usam troca atômica. A gravação do histórico e do catálogo são duas operações separadas; em uma interrupção entre ambas, o histórico pode registrar uma tentativa ainda não aplicada.

O mapa é uma página do serviço local. O código remoto do Google Maps não executa na extensão. Dados Google ficam em memória durante a sessão e não são exportados. As correspondências exigem confirmação humana e as rotas são consultadas sob demanda.

O MCP usa stdio, com servidor e dependências empacotados. Expõe apenas ferramentas de leitura. Nenhuma ferramenta executa shell, faz agendamento ou exporta credenciais. O host MCP é responsável por solicitar confirmação quando uma ferramenta acessar dados pessoais.

## Pontos de expansão

Adaptadores por operadora; IDs nativos quando disponíveis; sincronização privada opt-in; instalação desktop assinada; mapa progressivo com correspondências revisadas; integração remota independente, respeitando as condições do fluxo de autenticação aplicável.

## Conversas e contatos

`/api/workspace` lê e grava `workspace-{perfil}.json`, separado dos favoritos. Cada gravação valida estrutura e tamanho, perfil ativo e revisão, e usa transação serializada e troca atômica de arquivo. O cliente serializa autosaves e mudanças de metadados/contatos; conflito mantém uma cópia local exportável e exige recarga explícita, sem sobrescrever outro navegador silenciosamente.

Conversas guardam título, cor de uma lista permitida, tags, IDs de prestadores, rascunho e mensagens. Estados pendentes reabrem como interrompidos. Contatos guardam nome/endereço do prestador, data, atendente, canal, situação, anotação e vínculo opcional com uma conversa. Excluir conversa preserva os contatos e remove somente seu vínculo. Nenhuma dessas operações é uma ferramenta da IA.

O chat usa um painel com altura limitada pela viewport e rolagem própria. O compositor é uma região separada, sem posicionamento sobre o conteúdo. Rolagem automática acompanha a resposta somente perto do final; há botão para voltar à última mensagem. No celular, a lista de conversas alterna com a área da conversa.
