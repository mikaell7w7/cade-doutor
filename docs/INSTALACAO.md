# Instalação da prévia 0.2.1

## Pacotes prontos

Em [Releases](https://github.com/mikaell7w7/cade-doutor/releases), baixe `cade-doutor-local-0.2.1.zip` e `cade-doutor-chrome-0.2.1.zip`. Confira os arquivos com `SHA256SUMS`. No Linux: `sha256sum --check SHA256SUMS`. Coloque todos os arquivos da release na mesma pasta antes da conferência.

1. Instale Node.js 22 ou superior. O serviço local é previsto para Linux e macOS; Windows ainda requer homologação da proteção de credenciais.
2. Extraia o ZIP local em uma pasta e execute `node start.mjs` nessa pasta. Não é necessário instalar dependências npm no pacote pronto.
3. Abra `http://127.0.0.1:43119`. Em **Conexão**, informe o código do terminal, válido por 15 minutos.
4. Clique em **Continue with ChatGPT**. A senha é digitada somente na página oficial da OpenAI. Autorize o uso do plano, retorne ao aplicativo e clique em **Atualizar conexão**.
5. Extraia o ZIP Chrome em outra pasta. Em `chrome://extensions`, habilite **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione essa pasta.
6. Abra o painel da extensão e conecte-o com o mesmo código do serviço local. A extensão e o aplicativo mantêm sessões locais separadas; reiniciar o serviço exige nova conexão.

O botão no portal TST Saúde abre o painel. A categoria da página é usada como filtro quando reconhecida. Nenhum login do plano, cookie ou prontuário é coletado.

Para encerrar, use Ctrl+C no terminal. Não exponha a porta na rede nem use proxy público. Se um encerramento abrupto deixar `runtime.lock`, confirme que não há serviço em execução antes de remover somente esse arquivo do diretório de dados.

## Pesquisar sem selecionar prestadores

1. Abra **Assistente IA** e mantenha **Todo o catálogo** no campo de escopo.
2. Escolha o modelo da sua conta e escreva o que precisa. Exemplo: “Quero clínicas com ortodontia para adolescentes em Brasília”.
3. Acompanhe as consultas ao catálogo e os resultados. Abra uma ficha ou marque favoritos diretamente nos cartões.
4. Continue no mesmo campo: “Agora somente no Guará” ou “Quais também têm odontopediatria?”. A conversa mantém os critérios anteriores.
5. Para consultar fontes externas, habilite **Pesquisar na web**, quando disponível para o modelo e a conta. A busca no catálogo funciona sem essa opção.

**Nova conversa** limpa o histórico da página. Ele não persiste após recarregar ou trocar de conta. As mensagens completas são reenviadas à OpenAI nas próximas perguntas; favoritos e notas não entram automaticamente. O limite por conversa é de 20 trocas completas ou 120 mil caracteres, o que ocorrer primeiro. Consultas extensas podem atingir o limite de etapas por mensagem; a resposta deve informar o que ficou pendente.

## Atualizar uma instalação pelo código

Encerre o serviço com Ctrl+C. Na pasta onde clonou o projeto:

```sh
git pull --ff-only
npm ci
npm run build
npm start
```

Abra `http://127.0.0.1:43119` e use Ctrl+Shift+R. Em **Conexão**, informe o novo código do terminal e clique em **Atualizar conexão** se necessário. A autorização ChatGPT e os favoritos ficam no diretório de dados e são preservados. Não é necessário refazer o login se a conta continuar autorizada.

Na extensão, abra `chrome://extensions`, clique em **Recarregar** no Cadê Doutor, reabra o painel e conecte com o novo código. A pasta carregada deve continuar sendo `dist/chrome-extension` dentro do projeto.

## Uso pessoal

Sem conexão, favoritos ficam no navegador. Ao conectar, abre-se a coleção do perfil local. Ao selecionar uma conta ChatGPT, abre-se uma coleção separada por registro de conta. A mudança de perfil não copia favoritos automaticamente: use **Exportar backup pessoal** e **Importar backup** para transferi-los.

Os backups pessoais contêm favoritos e anotações, sem credenciais. Guarde-os em local privado. Se optar por versioná-los, use repositório privado próprio e revise o conteúdo. A sincronização GitHub automática não está implementada nesta versão.

## Mapa, CEP e avaliações

Configure um projeto próprio no Google Cloud com faturamento e as APIs Maps JavaScript, Places API (New), Geocoding e Routes habilitadas. Use duas chaves com restrições compatíveis: uma para o navegador, outra para as APIs chamadas pelo serviço local. Não comite chaves. As chamadas podem ter custo; configure limites e acompanhe a cobrança no Google.

No Linux/macOS, antes de iniciar o serviço:

```sh
read -r -s -p 'Chave Google servidor: ' GOOGLE_MAPS_SERVER_KEY; echo
export GOOGLE_MAPS_SERVER_KEY
read -r -s -p 'Chave Google navegador: ' GOOGLE_MAPS_BROWSER_KEY; echo
export GOOGLE_MAPS_BROWSER_KEY
node start.mjs
```

A chave de navegador é necessariamente entregue ao Google Maps JavaScript; não é um segredo de servidor. Restrinja-a a Maps JavaScript API e aos referenciadores locais exigidos pelo Google. A chave de servidor permanece no processo local e deve ser restrita às APIs utilizadas, com restrição por IP quando viável. Não reutilize uma chave de produção sem limites.

No mapa, escolha uma origem por CEP/endereço ou autorize a localização do navegador. Um CEP pode retornar o centro aproximado da região. Pesquise a região de preferência independentemente da origem. Para cada unidade, **Localizar e conferir no Google** apresenta candidatos: confirme nome, endereço e telefone. Somente unidades confirmadas entram no mapa e na ordenação. A proximidade inicial é em linha reta; **Calcular rota de carro** consulta distância e tempo de deslocamento.

Esta prévia não geocodifica automaticamente todas as 690 unidades e não afirma que a primeira unidade localizada seja a mais próxima de todo o catálogo. Não mantém cache persistente de avaliações. Sem chaves, continuam disponíveis pesquisa, favoritos e links para pesquisa externa no Google Maps.

## Plugin MCP local

O pacote `cade-doutor-plugin-0.2.1.zip` contém uma pasta `cade-doutor` com `plugin.json`, `mcp.json`, servidor e catálogo. Instale em um host de plugins locais compatível. `${PLUGIN_ROOT}` é resolvido por esse host.

Em clientes MCP que exigem configuração manual, registre o servidor stdio com comando `node` e argumento absoluto `/caminho/cade-doutor/server/mcp.mjs`. Use o mesmo usuário do sistema e, se personalizado, o mesmo `CADE_DOUTOR_HOME` do aplicativo local. O plugin não necessita do serviço HTTP em execução para ler o catálogo e os favoritos.

A chamada `list_favorites` entrega anotações ao assistente solicitante. As ferramentas são somente leitura e não retornam tokens. O plugin não fica acessível ao ChatGPT web por simplesmente iniciar um processo local.

## Dados e restauração

Padrão: `~/.config/cade-doutor/`. É possível mudar com `CADE_DOUTOR_HOME`. Credenciais e registros locais usam diretório 0700 e arquivos 0600 nos sistemas Unix. Não são criptografados em repouso pelo aplicativo. Use a proteção de conta e disco do sistema operacional.

Um único serviço por diretório é permitido. O catálogo aceito fica separado do catálogo incluído no pacote. A importação exige coleta completa e contagens consistentes, incluindo duplicações. Categoria anterior ausente bloqueia atualização e exige revisão da fonte. Favoritos ausentes são preservados com aviso; ausência não confirma descredenciamento.
