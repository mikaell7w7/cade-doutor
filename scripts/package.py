"""Deterministic archives. Run after npm run build. No credentials are packaged."""
import hashlib,json,pathlib,zipfile,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
out=root/'artifacts';out.mkdir(exist_ok=True)
for old in out.glob('*'):
    if old.is_file():old.unlink()
names={'chrome-extension':'chrome','companion':'local','cade-doutor-plugin':'plugin'}
checks=[]
for source,name in names.items():
    path=out/f'cade-doutor-{name}-{version}.zip'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for file in sorted((root/'dist'/source).rglob('*')):
            if not file.is_file():continue
            if file.is_symlink():raise ValueError('No symlinks')
            if file.name in ['accounts.json','host.json','runtime.lock'] or file.name.startswith('personal-'):raise ValueError('Personal file in artifact')
            arcname=str(file.relative_to(root/'dist'/source))
            if name=='plugin':arcname='cade-doutor/'+arcname
            info=zipfile.ZipInfo(arcname,(2026,1,1,0,0,0));info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,file.read_bytes())
    checks.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}')
try:commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
except subprocess.CalledProcessError:commit='unknown'
manifest={'version':version,'commit':commit,'catalogSha256':hashlib.sha256((root/'data'/json.loads((root/'data/catalog-index.json').read_text())['current']).read_bytes()).hexdigest(),'artifacts':[line.split('  ')[1] for line in checks]}
(out/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
checks.append(f"{hashlib.sha256((out/'build-manifest.json').read_bytes()).hexdigest()}  build-manifest.json")
(out/'SHA256SUMS').write_text('\n'.join(checks)+'\n')
print('\n'.join(checks))
