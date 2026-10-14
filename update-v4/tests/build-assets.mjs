import {createRequire} from 'node:module';
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
let esbuild;
try { esbuild=require('esbuild'); }
catch (error) { if(error.code!=='MODULE_NOT_FOUND')throw error;esbuild=require('../../.tools/build/node_modules/esbuild'); }
const base=fileURLToPath(new URL('..',import.meta.url));
const source=path.join(base,'site'),destination=path.join(base,'release-assets');
mkdirSync(destination,{recursive:true});
for(const name of readdirSync(source).sort()){
  const extension=path.extname(name);if(!['.js','.css'].includes(extension))continue;
  const raw=readFileSync(path.join(source,name),'utf8');
  const result=await esbuild.transform(raw,{loader:extension==='.css'?'css':'js',charset:'utf8',minifyWhitespace:true,
    minifySyntax:true,minifyIdentifiers:false,legalComments:'none',target:extension==='.css'?['chrome90','safari15']:'es2018'});
  writeFileSync(path.join(destination,name),result.code);
  console.log(name+': '+Buffer.byteLength(raw)+' -> '+Buffer.byteLength(result.code)+' bytes');
}
