# Segurança

Não publique tokens, backups pessoais ou detalhes de uma vulnerabilidade em uma issue pública. Se o recurso **Report a vulnerability** estiver habilitado na aba Security do GitHub, use-o para relato privado. Se não estiver, abra somente uma solicitação genérica de canal privado, sem detalhes exploráveis.

A prévia mantém credenciais em arquivos locais com permissões Unix 0600 e diretório 0700; não fornece criptografia própria em repouso. O serviço escuta apenas em loopback. Não exponha a porta por proxy, túnel ou interface de rede.

Toda entrada de catálogo e conteúdo web deve ser tratada como dado não confiável. Ferramentas MCP são somente leitura; o resultado de IA nunca executa ações automaticamente. Não reintroduza tokens no navegador nem registre respostas OAuth em logs.

Testes de segurança cobrem PKCE, callback, validação criptográfica do ID token, isolamento de perfis, renovação concorrente, proteção HTTP e preservação de dados em atualizações. Eles não constituem auditoria independente.
