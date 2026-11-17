# Contribuir

Use Node.js 22 ou superior. Execute `npm ci`, `npm run check`, `npm run build` e `npm test`. Alterações de catálogo precisam informar origem, data, método e contagens por categoria. Não envie dados de pacientes ou avaliações de terceiros sem base de redistribuição.

Abra uma issue com o problema e exemplo reproduzível sem dados pessoais. Em pull requests, descreva comportamento antes/depois, testes e limitações. Mudanças de autenticação precisam de testes de falha e não podem mover tokens OpenAI para o navegador. Alterações do coletor não podem interpretar falha de coleta como descredenciamento.

Mantenha as dependências e Actions fixadas pelo lockfile e SHA. Para publicar uma nova prévia, siga `docs/PUBLICACAO.md`.
