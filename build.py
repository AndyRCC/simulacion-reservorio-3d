"""Empaqueta la simulación en un único HTML autónomo (doble clic, sin servidor).

- Three.js y addons (vendor/jsm/**) -> data-URIs en el importmap; los imports
  relativos entre addons se reescriben a 'three/addons/...'
- Módulos propios (js/*.js)          -> 'sim/x.js' mapeados a data-URIs
- HDRI, texturas y glTF              -> data-URIs en window.__ASSETS (el glTF con
  sus .bin y texturas también embebidos)

Uso:  py build.py      (genera dist/simulacion_fase1_3d.html)
"""
import base64, json, re, pathlib, posixpath

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'dist' / 'simulacion_fase1_3d.html'
MIME = {'.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream',
        '.bin': 'application/octet-stream', '.gltf': 'model/gltf+json'}


def b64(raw: bytes, suffix: str) -> str:
    return f'data:{MIME[suffix]};base64,' + base64.b64encode(raw).decode('ascii')


def gltf_inline(path: pathlib.Path) -> str:
    g = json.loads(path.read_text(encoding='utf-8'))
    for coll in ('buffers', 'images'):
        for item in g.get(coll, []):
            uri = item.get('uri')
            if uri and not uri.startswith('data:'):
                f = path.parent / uri
                item['uri'] = b64(f.read_bytes(), f.suffix.lower())
    return b64(json.dumps(g).encode('utf-8'), '.gltf')


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    imports = {'three': b64((ROOT / 'vendor/three.module.min.js').read_bytes(), '.js')}
    jsm = ROOT / 'vendor' / 'jsm'
    for f in sorted(jsm.rglob('*.js')):
        rel = f.relative_to(jsm).as_posix()
        src = f.read_text(encoding='utf-8')
        def fix(m):
            target = posixpath.normpath(posixpath.join(posixpath.dirname(rel), m.group(2)))
            return f"{m.group(1)}'three/addons/{target}'"
        src = re.sub(r"(from\s*)'(\.{1,2}/[^']+)'", fix, src)
        imports[f'three/addons/{rel}'] = b64(src.encode('utf-8'), '.js')

    assets_src = (ROOT / 'js/assets.js').read_text(encoding='utf-8')
    assets = {}
    for k, v in re.findall(r"(\w+):\s*'\./([^']+)'", assets_src):
        p = ROOT / v
        assets[k] = gltf_inline(p) if p.suffix == '.gltf' else b64(p.read_bytes(), p.suffix.lower())

    for mod in sorted((ROOT / 'js').glob('*.js')):
        src = mod.read_text(encoding='utf-8')
        src = re.sub(r"from '\./([\w-]+\.js)'", r"from 'sim/\1'", src)
        if mod.name == 'assets.js':
            src = 'export const ASSETS = window.__ASSETS;\n'
        imports[f'sim/{mod.name}'] = b64(src.encode('utf-8'), '.js')

    importmap = '<script type="importmap">\n' + json.dumps({'imports': imports}) + '\n</script>'
    html = re.sub(r'<script type="importmap">.*?</script>', lambda _: importmap, html, flags=re.S)
    html = html.replace(importmap, '<script>window.__ASSETS = ' + json.dumps(assets) + ';</script>\n' + importmap)
    html = html.replace('<script type="module" src="./js/main.js"></script>',
                        '<script type="module">import \'sim/main.js\';</script>')
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print(f'OK  {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
