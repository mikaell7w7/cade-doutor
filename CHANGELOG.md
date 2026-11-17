# Changelog

## 0.4.0 - 2026-11-17

- Renomear, tags e cor acessíveis no cabeçalho; fixação, arquivamento, restauração e busca no conteúdo das conversas.
- Meus prestadores reúne favoritos, contatos e vínculos deliberados; filtros por situação e linha do tempo de tratativas.
- Contatos com profissional, próximo passo e data de retorno; acesso às conversas relacionadas pela ficha.
- Comparação guiada com seleção visível, tabela de catálogo e conversa exclusiva com escopo e seleção persistidos.
- Cores funcionais para tipos de atendimento, situações, seleção e mensagens; layout adaptado ao painel lateral.
- Backups anteriores continuam válidos. Metadados pessoais não são enviados automaticamente à IA.

## 0.3.1 - 2026-11-17

Título da conversa em linha própria no celular para preservar sua identificação. O teste Chromium verifica a largura útil do título e aguarda a conclusão da gravação dos metadados antes da captura.

## 0.3.0 - 2026-11-17

- Chat com rolagem própria, compositor separado e navegação por conversas em desktop e celular.
- Histórico persistente por perfil: retomada, renomeação, cores, tags, vínculos com prestadores e rascunhos.
- Registros pessoais de contatos por prestador, com data, atendente, canal, situação e conversa relacionada.
- Backup de conversas/contatos, validação de dados, revisão para conflitos entre janelas e preservação dos favoritos.
- Testes de persistência, isolamento e fluxo de interface no Chromium antes da publicação dos pacotes.

## 0.2.1 - 2026-11-17

Corrige a consolidação de respostas em streaming: um evento final com `output` vazio ou parcial não apaga as ferramentas recebidas anteriormente. Reconstrói argumentos de função, recupera texto final sem deltas e evita duplicação de texto e chamadas. Falhas tardias e respostas realmente vazias permanecem explícitas, com diagnóstico estrutural sem conteúdo pessoal ou credenciais. Inclui regressão de pesquisa de ortodontia na Asa Sul.

## 0.2.0 - 2026-11-17

- Assistente como tela inicial, com busca em todo o catálogo sem seleção prévia em Explorar.
- Ferramentas de catálogo com filtros e paginação, continuidade de contexto e pesquisa web opcional.
- Conversa em streaming, progresso das consultas, cancelamento e reutilização de perguntas interrompidas.
- Tabelas e links Markdown renderizados com segurança, fichas e favoritos nos resultados.
- Histórico temporário isolado por conta, limites de processamento e testes de paginação, ferramentas, HTTP e interface.

## 0.1.1 - 2026-11-17

Correção da política de referência da página de mapa para chaves Google com restrição de origem. Atualização do filtro do painel após abertura pelo portal, incluindo o caso em que a categoria chega depois da inicialização.

## 0.1.0 - 2026-11-17

Primeira prévia: catálogo TST Saúde; extensão Chrome; favoritos e backup; aplicativo local com OAuth OpenAI; IA por Responses API; mapa Google sob demanda; MCP local; testes, CI e pacotes verificáveis. Integrações reais dependem de autorização da conta e das chaves do usuário.
