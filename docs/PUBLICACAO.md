# Versões e publicação

## GitHub Releases

O workflow `CI e versões` executa checks, build e testes em Node 22 e 24. Somente após sucesso, um push em `main` pode publicar pré-release da versão do `package.json`, caso ela ainda não exista. Os pacotes têm checksums, manifesto do commit e atestação de procedência pelo GitHub. Actions de terceiros são fixadas por SHA; Dependabot propõe atualizações.

Para uma nova versão, altere conjuntamente `package.json`, lockfile, manifesto Chrome, versões do serviço/MCP, rótulo da interface e changelog. Execute os testes. O workflow nunca substitui uma release existente. A publicação estável exige homologação real do login e das integrações opcionais.

A coleção versionada é pública. Nunca inclua arquivos do diretório pessoal, tokens, favoritos, chaves Google ou backups nos pacotes. `scripts/package.py` recusa nomes de arquivos de credenciais/perfis.

## Chrome Web Store

O ZIP Chrome é instalável em modo de desenvolvedor. Publicação na loja ainda não foi realizada. São necessários cadastro e acesso ao painel de desenvolvedor, ícones e screenshots finais, página pública de privacidade, declarações de uso de dados e revisão da loja. Nenhuma credencial de publicação foi configurada. A instalação do aplicativo local e seu motivo precisam constar claramente da página do produto.

O mapa usa JavaScript remoto somente na página do serviço local; a extensão mantém scripts empacotados conforme Manifest V3. A extensão não captura cookies, credenciais do plano ou informações clínicas.

## Plugin

O pacote contém manifesto portátil e MCP stdio, destinado a hosts com execução local de plugins. Sua publicação em um diretório depende das exigências desse diretório e de validação pelo mantenedor. Disponibilizar o ZIP no GitHub não o instala automaticamente no ChatGPT web.

Uma integração remota requer serviço autenticado próprio, isolamento entre usuários, política operacional e mecanismo de conexão suportado pelo ChatGPT. É uma etapa independente.

## Documentação pública

README, instalação, privacidade e termos estão disponíveis em URLs públicas do repositório. O workflow de documentação pode publicar uma página estática no GitHub Pages quando o mantenedor habilitar Pages com fonte GitHub Actions nas configurações do repositório. A prévia não exige Pages para funcionar.
