"""Arma el generador como un solo archivo HTML (todo incluido, funciona sin internet)."""
import base64, json, pathlib, re

ROOT = pathlib.Path(__file__).parent
A = ROOT / 'assets'
OUT = ROOT / 'dist' / 'Generador Video Menu Smashcar.html'

def data_uri(p):
    mime = {'.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf'}[p.suffix]
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()

assets = {p.stem: data_uri(p) for p in sorted(A.iterdir()) if p.suffix in ('.png', '.webp')}
fonts = (
    f"@font-face{{font-family:Anton;src:url({data_uri(A / 'Anton-Regular.ttf')}) format('truetype');font-display:block}}\n"
    f"@font-face{{font-family:'Bebas Neue';src:url({data_uri(A / 'BebasNeue-Regular.ttf')}) format('truetype');font-display:block}}\n"
    f"@font-face{{font-family:Roboto;src:url({data_uri(A / 'Roboto-VF.ttf')}) format('truetype');font-weight:100 900;font-display:block}}\n"
)
html = (ROOT / 'src' / 'index.html').read_text(encoding='utf-8')
parts = {
    '/*FONTS*/': fonts,
    '/*ASSETS*/': 'window.SMASH_ASSETS = ' + json.dumps(assets) + ';',
    '/*MUXER*/': (ROOT / 'node_modules/mp4-muxer/build/mp4-muxer.js').read_text(encoding='utf-8'),
    '/*ENGINE*/': (ROOT / 'src/engine.js').read_text(encoding='utf-8'),
    '/*EXPORTER*/': (ROOT / 'src/exporter.js').read_text(encoding='utf-8'),
    '/*APP*/': (ROOT / 'src/app.js').read_text(encoding='utf-8'),
}
for k, v in parts.items():
    assert k in html, k
    html = html.replace(k, v.replace('</script', '<\\/script'))
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding='utf-8')
print(OUT, round(OUT.stat().st_size / 2**20, 2), 'MB')
