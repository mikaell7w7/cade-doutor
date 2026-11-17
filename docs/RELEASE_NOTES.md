## Cadê Doutor 0.3.0 · conversas e acompanhamento pessoal

- Lista lateral de conversas salvas, com busca por nome, tags e prestador vinculado.
- Renomeação, cores e tags pelo botão Organizar; retomada após recarregar ou reiniciar o serviço.
- Respostas em área rolável própria e campo de mensagem separado, sem cobrir o conteúdo.
- Ficha e contatos: registre data, atendente, canal, situação e anotações; vincule e retome uma conversa pela ficha.
- Favoritos preservados e backup separado de conversas e contatos em Conexão.
- Dados locais separados por perfil; registros pessoais não são enviados automaticamente à IA. A continuação usa até 20 trocas completas recentes, preservando o histórico integral para leitura.

### Atualização

Pare o serviço com Ctrl+C. Execute `git pull --ff-only`, `npm ci`, `npm run build` e `npm start`. Recarregue com Ctrl+Shift+R e informe o novo código em Conexão. Na extensão, use Recarregar em `chrome://extensions`.

Antes de atualizar, copie respostas antigas que queira guardar: versões anteriores não persistiam conversas e não permitem recuperação automática. Conta autorizada e favoritos são preservados.

### Validação e limites

Testes automatizados verificam persistência, isolamento por conta, conflitos entre janelas, contexto da IA e importação. O fluxo do Chromium usa conta e respostas simuladas para verificar retomada, organização, contatos, favoritos e posicionamento em desktop/celular. O serviço salva localmente, sem nuvem ou envio de mensagens aos prestadores. Faça backups dos dados pessoais.
