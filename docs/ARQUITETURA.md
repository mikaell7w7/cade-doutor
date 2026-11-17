# Arquitetura

O navegador mantém a interface e a seleção de prestadores. A extensão Manifest V3 possui apenas `storage`, `sidePanel`, acesso ao serviço loopback e à origem de atualização do catálogo. O content script é limitado ao portal TST Saúde.

O aplicativo Node atende exclusivamente em `127.0.0.1:43119`. Valida Host e Origin; exige código temporário para criar uma sessão vinculada à origem. Páginas locais usam o contexto same-origin do navegador. Cada chamada da API privada exige a sessão. O callback OAuth usa state e PKCE, sem depender da sessão de interface.

O OAuth usa o cliente dinâmico somente no primeiro registro. O callback fornece o cliente emitido. O aplicativo valida assinatura, emissor, público, validade e nonce do ID token e usa cliente emitido mais subject como identidade do perfil. O host UUID persiste entre sessões. Falha de troca mantém o cliente emitido para novo fluxo. A permissão de uso do plano é verificada separadamente da identidade. Renovações simultâneas são serializadas por registro.

Tokens ficam em arquivos locais protegidos e nunca são retornados à extensão. O logout tenta revogar remotamente, limpa credenciais locais e preserva o registro para reautorização. Caso a revogação remota falhe, a interface informa que não houve confirmação.

A Responses API é chamada com `store:false` e `stream:true`. Somente `response.completed` confirma sucesso. Texto parcial seguido por erro permanece visível acompanhado de aviso. As consultas enviam pergunta e dados públicos selecionados; notas não são adicionadas automaticamente. O catálogo dos modelos é consultado para a conta ativa.

O catálogo público é independente dos perfis pessoais. O identificador inicial deriva de nome e endereço. Alteração de endereço gera possível correspondência para revisão; nunca funde filiais automaticamente. Os campos `declared`, `extracted`, `uniqueExtracted` e `duplicateOccurrences` permitem conferir a coleta por categoria.

As gravações pessoais incluem revisão e identificador do perfil. O servidor recusa gravação se outra janela alterou os dados ou se houve troca de conta, evitando sobrescrita silenciosa. Arquivos usam troca atômica. A gravação do histórico e do catálogo são duas operações separadas; em uma interrupção entre ambas, o histórico pode registrar uma tentativa ainda não aplicada.

O mapa é uma página do serviço local. O código remoto do Google Maps não executa na extensão. Dados Google ficam em memória durante a sessão e não são exportados. As correspondências exigem confirmação humana e as rotas são consultadas sob demanda.

O MCP usa stdio, com servidor e dependências empacotados. Expõe apenas ferramentas de leitura. Nenhuma ferramenta executa shell, faz agendamento ou exporta credenciais. O host MCP é responsável por solicitar confirmação quando uma ferramenta acessar dados pessoais.

## Pontos de expansão

Adaptadores por operadora; IDs nativos quando disponíveis; sincronização privada opt-in; instalação desktop assinada; mapa progressivo com correspondências revisadas; integração remota independente, respeitando as condições do fluxo de autenticação aplicável.
