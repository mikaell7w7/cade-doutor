# Política de privacidade

Versão de 17 de novembro de 2026. Aplicável à prévia local do Cadê Doutor.

O Cadê Doutor é um projeto independente de código aberto. Não opera servidor próprio de coleta de dados, telemetria, publicidade ou venda de dados nesta versão.

## Dados no seu dispositivo

O aplicativo guarda catálogo, favoritos, listas, anotações e registros de contas localmente. Sem conexão ao aplicativo, favoritos ficam no armazenamento do navegador. O serviço local mantém tokens OpenAI em arquivos protegidos; a extensão guarda somente sua própria sessão de conexão, sem tokens OpenAI. A localização solicitada pelo navegador e os resultados Google permanecem em memória da página do mapa.

## Compartilhamento por ação

- **Continue with ChatGPT:** o navegador acessa a OpenAI, e o aplicativo recebe tokens e dados de identidade autorizados. O tratamento da OpenAI segue sua [política de privacidade](https://openai.com/policies/privacy-policy/).
- **Assistente IA:** envia à OpenAI a pergunta digitada, as mensagens completas anteriores desta conversa, os metadados do catálogo e os registros públicos retornados pelas buscas. Por padrão, a IA pode pesquisar todo o catálogo; selecionar prestadores é opcional. O histórico permanece em memória na página e é limpo ao recarregar, iniciar nova conversa ou trocar de conta. Anotações e favoritos não são enviados automaticamente. A pesquisa web, quando habilitada, também utiliza serviços de busca disponibilizados pela OpenAI. `store:false` é uma configuração da API, não uma promessa de ausência absoluta de processamento ou retenção pelo provedor.
- **Mapa e rotas:** carregar o mapa conecta ao Google; consultar endereço, unidade ou rota envia os dados necessários ao Google. O uso segue os [Termos Google Maps](https://maps.google.com/help/terms_maps/) e a [Política de Privacidade Google](https://policies.google.com/privacy).
- **Atualizar catálogo:** consulta arquivos públicos do GitHub, sujeito à [política do GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- **Plugin MCP:** o assistente recebe os dados das ferramentas que chamar. `list_favorites` inclui listas e anotações pessoais. Não use essa ferramenta em um host em que não confie.
- **Exportar backup:** grava arquivo que pode conter anotações pessoais. O destino e o compartilhamento ficam sob seu controle.

## Exclusão e controle

É possível remover favoritos, sair da conta e desconectar o aplicativo nas configurações da OpenAI. Sair da conta remove credenciais locais, mas preserva o vínculo de registro e a coleção pessoal. Para apagar todos os dados locais, encerre o aplicativo e remova o diretório de dados, além do armazenamento da extensão/navegador. Backups exportados precisam ser excluídos separadamente.

Questões de privacidade podem ser registradas em [Issues](https://github.com/mikaell7w7/cade-doutor/issues), sem publicar dados pessoais. Para vulnerabilidades, siga [SECURITY.md](../SECURITY.md).
