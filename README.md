# Cadê Doutor

Pesquisa pessoal da rede credenciada, favoritos e conversa com pesquisa de prestadores com seu plano do ChatGPT. Código aberto, licença MIT. Prévia técnica **0.2.0**.

[Baixar versões](https://github.com/mikaell7w7/cade-doutor/releases) · [Instalação](docs/INSTALACAO.md) · [Privacidade](docs/PRIVACIDADE.md) · [Roadmap](docs/ROADMAP.md)

## O que já funciona

- Catálogo TST Saúde com 690 unidades e 131 categorias, coletado em 17/11/2026. Pesquisa por nome, especialidade, região e tipo de atendimento.
- Extensão Chrome Manifest V3 com painel lateral e botão no portal TST Saúde.
- Favoritos, listas, anotações e backup JSON pessoal. Atualizações preservam unidades favoritas ausentes da nova coleta.
- Aplicativo local com fluxo oficial **Continue with ChatGPT**: OAuth, PKCE, seleção de conta, modelos da conta, renovação e revogação. Tokens permanecem no computador.
- Assistente conversacional que pesquisa todo o catálogo sem seleção em Explorar, preserva o contexto dos refinamentos e exibe consultas, tabelas, fichas e favoritos na resposta. Comparar uma seleção de até 30 unidades continua opcional. Pesquisa web opt-in e tratamento de interrupções e limites do plano.
- Mapa Google com origem por CEP, endereço ou geolocalização; confirmação da unidade, notas e quantidade de avaliações; ordenação por proximidade, nota ou volume; rota de carro sob demanda.
- Plugin MCP local com quatro ferramentas de leitura: pesquisar prestadores, consultar unidade, listar favoritos e conferir atualização.

**Limites da prévia:** o login real depende da autorização da sua conta e da disponibilidade do fluxo OpenAI. Testes automatizados usam credenciais fictícias e não comprovam elegibilidade de uma conta. Mapas e avaliações exigem chaves Google Maps e podem gerar cobrança. Esta versão não sincroniza dados pessoais na nuvem, não agenda consultas e não foi publicada na Chrome Web Store.

## Começar pelo código

Requisitos: Node.js 22 ou superior, npm e Python 3 para empacotar. Linux e macOS são os ambientes previstos para o serviço OAuth, com arquivos protegidos por permissões Unix. A homologação de proteção de credenciais no Windows está pendente.

```sh
git clone https://github.com/mikaell7w7/cade-doutor.git
cd cade-doutor
npm ci
npm run build
npm start
```

Abra `http://127.0.0.1:43119`, entre em **Conexão**, informe o código exibido no terminal e escolha **Continue with ChatGPT**. Após autorizar na OpenAI, volte e clique em **Atualizar conexão**.

Para a extensão, abra `chrome://extensions`, habilite **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione `dist/chrome-extension`. O painel usa o mesmo serviço local. A pesquisa e os favoritos básicos também funcionam sem ele, apenas no navegador.

## Pesquisar e continuar a conversa

A tela inicial é **Assistente IA**, com escopo **Todo o catálogo**. Digite, por exemplo: “Quero clínicas com ortodontia para meus filhos de 13 e 15 anos”. A IA consulta a rede, informa os resultados e permite continuar com “Agora somente no Guará” ou “Compare essas opções”. Não é preciso selecionar prestadores em Explorar.

A resposta mostra tabelas formatadas e cartões dos prestadores consultados, com ficha, favoritos e pesquisa no Google Maps. Os cartões representam registros consultados, não uma recomendação clínica. A opção de pesquisa na web precisa ser habilitada para consultar fontes externas, quando permitida pelo modelo e pela conta. Distâncias e avaliações não são presumidas.

O histórico fica em memória nesta página e é reenviado à OpenAI nas perguntas seguintes. Recarregar, trocar de conta ou clicar em **Nova conversa** limpa o histórico da interface. Favoritos e anotações continuam separados. Perguntas incompletas ou interrompidas não entram no contexto seguinte.

Para atualizar uma instalação pelo código, encerre o serviço com Ctrl+C e execute na pasta do projeto:

```sh
git pull --ff-only
npm ci
npm run build
npm start
```

Recarregue a página com Ctrl+Shift+R e informe o novo código em **Conexão**. A conta autorizada e os favoritos são preservados. Na extensão, clique em **Recarregar** em `chrome://extensions` e conecte novamente ao serviço.

## Por que existe um aplicativo local

O fluxo aberto da OpenAI requer callback HTTP em `127.0.0.1` e credenciais em arquivo local protegido. A extensão cuida da interface; o aplicativo local cuida do OAuth e das chamadas de IA. O código de conexão entre os dois não é um token OpenAI.

O plugin MCP também executa localmente em um host compatível. Ele não transforma o ChatGPT web em um cliente de processos locais. Uma integração remota no ChatGPT web depende de outra arquitetura e está no roadmap.

## Desenvolvimento e versões

```sh
npm run check
npm run build
npm test
npm run package
```

O GitHub Actions confere o catálogo, executa testes em Node 22 e 24, verifica dependências e gera ZIPs da extensão, do aplicativo local e do plugin, com SHA-256 e procedência de build. Novas versões em `main` geram pré-lançamentos quando ainda não existe a tag correspondente. Releases existentes nunca são sobrescritas. [Publicação e processo de release](docs/PUBLICACAO.md).

Catálogo público fica em `data/`. Favoritos, localização e credenciais nunca devem ser enviados ao repositório. Cada pessoa pode manter backup próprio, mas um repositório pessoal não é obrigatório nem é criado automaticamente.

## Fontes técnicas

- [OpenAI: Sign in with ChatGPT para ferramentas abertas](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [OpenAI: modelos e inferência](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Chrome: Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Google: regras de Places](https://developers.google.com/maps/documentation/places/web-service/policies)

Confirme cobertura, endereço e agenda diretamente com a unidade. Nota de pacientes não equivale à qualificação clínica. [Origem e atribuição dos dados](NOTICE.md).
