"""Create a self-contained ZIP, including local study data but no credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT/'releases'/'shixu-study-portable.zip')
args = parser.parse_args()
output = args.output.resolve()
files = ['package.json','README.md','AGENTS.md','server.mjs','portable-store.mjs','credential-vault.mjs',
         'launcher.mjs','model-proxy.mjs','build_content.py','启动学习台.cmd','start.sh']
directories = ['dist','sources','tests','scripts']
selected = [ROOT/f for f in files]
for directory in directories:
    selected.extend(p for p in (ROOT/directory).rglob('*') if p.is_file() and not set(p.relative_to(ROOT).parts).intersection({'__pycache__','.local-secrets','.git','.openai','.qa','node_modules'}) and not p.name.startswith('.env'))
for name in ['README.md','study.json','study.previous.json']:
    if (ROOT/'data'/name).exists():
        selected.append(ROOT/'data'/name)
if not all(p.is_file() for p in selected):
    raise SystemExit('Required project files are missing; packaging stopped.')
if output in selected:
    raise SystemExit('Output ZIP must not overwrite a project source file.')
output.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(output,'w',ZIP_DEFLATED,compresslevel=8) as archive:
    for source in sorted(set(selected)):
        archive.write(source,'shixu-study/'+source.relative_to(ROOT).as_posix())
print(f'Portable ZIP: {output}')
print(f'{len(set(selected))} files; {output.stat().st_size:,} bytes')
print('Includes existing data/study*.json when present; excludes .git, .openai, .qa, .env and API credentials.')
