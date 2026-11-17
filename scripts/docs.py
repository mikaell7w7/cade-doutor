"""Generate static, escaped documentation without external dependencies."""
import html,pathlib
out=pathlib.Path('dist/site');out.mkdir(parents=True,exist_ok=True)
links=[('README.md','index.html'),('docs/PRIVACIDADE.md','privacidade.html'),('docs/TERMOS.md','termos.html'),('docs/INSTALACAO.md','instalacao.html')]
nav='<nav><a href="index.html">Cadê Doutor</a> · <a href="instalacao.html">Instalação</a> · <a href="privacidade.html">Privacidade</a> · <a href="termos.html">Termos</a> · <a href="https://github.com/mikaell7w7/cade-doutor/releases">Downloads</a></nav>'
for source,target in links:
    content=html.escape(pathlib.Path(source).read_text())
    title=html.escape(pathlib.Path(source).read_text().splitlines()[0].lstrip('# '))
    (out/target).write_text('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>body{font:17px/1.7 system-ui;max-width:900px;margin:40px auto;padding:0 24px;color:#163b32;background:#f8faf7}a{color:#216a57}pre{white-space:pre-wrap;font:inherit}nav{padding-bottom:24px;border-bottom:1px solid #ccd9d1}</style>'+nav+'<main><pre>'+content+'</pre></main></html>')
