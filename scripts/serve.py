"""Persistent, loopback-only same-origin development server; not a production proxy."""
import argparse
from http.server import SimpleHTTPRequestHandler
import importlib.util
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('order_api', str(ROOT / 'backend/app.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=43500)
    parser.add_argument('--data', default=str(ROOT / '.local/data/peiliao.sqlite3'))
    parser.add_argument('--release', action='store_true', help='Serve the built dist/site')
    args = parser.parse_args()
    static = ROOT / ('dist/site' if args.release else 'frontend')
    if not (static / 'index.html').is_file():
        raise SystemExit('Static site is missing; run npm run build before preview')
    with (ROOT / 'backend/seed.json').open(encoding='utf-8') as file:
        import json
        seed = json.load(file)
    store = api.Store(args.data, seed, os.environ.get('PEILIAO_ADMIN_PASSWORD'))

    class Handler(api.Handler, SimpleHTTPRequestHandler):
        def static_file(self):
            path = unquote(urlsplit(self.path).path)
            if path in ('/', '/peiliao.html'):
                path = '/index.html'
            target = (static / path.lstrip('/')).resolve()
            if static.resolve() not in target.parents or not target.is_file():
                return None
            return target

        def translate_path(self, path):
            return str(self.static_file())

        def do_GET(self):
            if urlsplit(self.path).path.startswith('/api/'):
                return api.Handler.do_GET(self)
            if self.static_file() is None:
                return self.send_error(404)
            return SimpleHTTPRequestHandler.do_GET(self)

        def do_HEAD(self):
            if self.static_file() is None:
                return self.send_error(404)
            return SimpleHTTPRequestHandler.do_HEAD(self)

    server = api.Server(('127.0.0.1', args.port), Handler)
    server.store = store
    server.origin = 'http://127.0.0.1:' + str(server.server_address[1])
    # HTTP cookie mode is restricted to this explicitly loopback-only dev server.
    server.secure_cookies = False
    print('Order management: ' + server.origin, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
