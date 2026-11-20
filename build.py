"""Empaqueta la simulación en un único HTML autónomo (doble clic, sin servidor).

- Three.js y addons -> data-URIs en el importmap
- Módulos propios   -> especificadores 'sim/x.js' mapeados a data-URIs
- HDRI y texturas   -> data-URIs expuestos en window.__ASSETS

Uso:  py build.py      (genera dist/simulacion_fase1_3d.html)
"""
import base64, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'dist' / 'simulacion_fase1_3d.html'
MIME = {'.js': 'text/javascript', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream'}


def data_uri(path: pathlib.Path, text: str | None = None) -> str:
    raw = text.encode('utf-8') if text is not None else path.read_bytes()
    return f'data:{MIME[path.suffix]};base64,' + base64.b64encode(raw).decode('ascii')


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    imports = {
        'three': data_uri(ROOT / 'vendor/three.module.min.js'),
        'three/addons/controls/OrbitControls.js': data_uri(ROOT / 'vendor/OrbitControls.js'),
        'three/addons/loaders/RGBELoader.js': data_uri(ROOT / 'vendor/RGBELoader.js'),
        'three/addons/renderers/CSS2DRenderer.js': data_uri(ROOT / 'vendor/CSS2DRenderer.js'),
    }
    # assets -> window.__ASSETS
    assets_src = (ROOT / 'js/assets.js').read_text(encoding='utf-8')
    assets = {k: data_uri(ROOT / v) for k, v in re.findall(r"(\w+):\s*'\./([^']+)'", assets_src)}
    for mod in sorted((ROOT / 'js').glob('*.js')):
        src = mod.read_text(encoding='utf-8')
        src = re.sub(r"from '\./([\w-]+\.js)'", r"from 'sim/\1'", src)
        if mod.name == 'assets.js':
            src = 'export const ASSETS = window.__ASSETS;\n'
        imports[f'sim/{mod.name}'] = data_uri(mod, src)

    importmap = '<script type="importmap">\n' + json.dumps({'imports': imports}) + '\n</script>'
    html = re.sub(r'<script type="importmap">.*?</script>', lambda _: importmap, html, flags=re.S)
    assets_js = '<script>window.__ASSETS = ' + json.dumps(assets) + ';</script>'
    html = html.replace(importmap, assets_js + '\n' + importmap)
    html = html.replace('<script type="module" src="./js/main.js"></script>',
                        '<script type="module">import \'sim/main.js\';</script>')
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print(f'OK  {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
