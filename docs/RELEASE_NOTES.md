## Cadê Doutor 0.2.0 · prévia técnica

O Assistente IA agora pesquisa todo o catálogo TST Saúde sem exigir seleção em Explorar. Faça uma pergunta e refine na mesma conversa: “Quero ortodontia para adolescentes”, depois “Agora somente no Guará”.

### Novidades

- Ferramentas de busca em todas as 690 unidades, com filtros por especialidade, região, tipo e paginação.
- Conversa em streaming com histórico temporário, indicação das consultas e cancelamento.
- Respostas com tabelas, links e listas formatadas; fichas e favoritos diretamente nos cartões.
- Seleção de prestadores permanece como escopo opcional; busca web continua opt-in.
- Histórico limpo ao recarregar, iniciar nova conversa ou trocar de conta. Favoritos e autorização permanecem preservados.

### Atualizar pelo código

Encerre o serviço com Ctrl+C e execute `git pull --ff-only`, `npm ci`, `npm run build` e `npm start`. Recarregue a página com Ctrl+Shift+R e informe o novo código local em Conexão. Na extensão, use Recarregar em `chrome://extensions` e conecte novamente.

### Pacotes prontos

Baixe os ZIPs `local` e `chrome`. Inicie `node start.mjs` na pasta do aplicativo local; carregue a pasta Chrome em modo de desenvolvedor. Veja `docs/INSTALACAO.md`. Node.js 22+ é necessário. O pacote MCP continua disponível para hosts locais compatíveis.

### Validação e limites

Testes automatizados verificam paginação, contexto, ferramentas, isolamento de conta, segurança de Markdown e fluxo da interface com respostas simuladas. A nova busca por ferramentas ainda precisa de validação com a conta real. Pesquisa web depende do modelo e da conta; mapas e avaliações Google requerem chaves próprias. Não há avaliações ou distâncias inventadas, agenda automática, sincronização pessoal em nuvem nem publicação nas lojas.
