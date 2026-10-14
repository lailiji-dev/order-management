import {transform} from 'esbuild';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'frontend');
const destination = path.join(root, 'dist', '.assets');
mkdirSync(destination, {recursive: true});
for (const name of JSON.parse(process.argv[2])) {
  const extension = path.extname(name);
  if (!['.js', '.css'].includes(extension)) continue;
  const result = await transform(readFileSync(path.join(source, name), 'utf8'), {
    loader: extension === '.css' ? 'css' : 'js',
    charset: 'utf8', minifyWhitespace: true, minifySyntax: true,
    minifyIdentifiers: false, legalComments: 'none',
    target: extension === '.css' ? ['chrome90', 'safari15'] : 'es2018'
  });
  writeFileSync(path.join(destination, name), result.code);
}
