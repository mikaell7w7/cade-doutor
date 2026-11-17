## Cadê Doutor 0.2.1 · correção de streaming

Corrige uma falha que podia exibir “O modelo encerrou sem uma resposta” mesmo após receber uma chamada de ferramenta.

- Eventos finais com `output` vazio ou parcial preservam os itens já recebidos.
- Argumentos de ferramentas são consolidados pelos eventos de streaming.
- Texto recebido somente no evento final é exibido, sem duplicar trechos já apresentados.
- Falhas tardias continuam impedindo sucesso; respostas realmente vazias exibem um diagnóstico sem perguntas, credenciais ou conteúdo pessoal.
- Testes cobrem a busca “ortodontista na Asa Sul” com ferramenta transmitida antes de um evento final vazio.

### Atualizar

Encerre o serviço com Ctrl+C. Na pasta do projeto, execute `git pull --ff-only`, `npm ci`, `npm run build` e `npm start`. Recarregue o navegador com Ctrl+Shift+R e informe o novo código em Conexão. A conta autorizada e os favoritos são preservados. Na extensão, use Recarregar em `chrome://extensions`.

### Validação

A falha do parser foi reproduzida e corrigida em testes automatizados. A captura de tela identifica o sintoma, mas não contém os eventos brutos da OpenAI para confirmar a causa da ocorrência específica. A correção ainda precisa ser conferida com a conta real.
