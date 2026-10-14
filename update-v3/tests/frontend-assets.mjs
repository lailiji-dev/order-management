import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Inline a deployable page's local assets for isolated DOM tests. Deferred scripts
// retain their original order and execute after the complete document is parsed.
export function inlineAssets(pageUrl,{siteRoot}={}){
  const pagePath=fileURLToPath(pageUrl),root=path.resolve(siteRoot||path.dirname(pagePath)),scripts=[];
  const pageLocation=new URL(path.relative(root,pagePath).split(path.sep).join('/'),'https://local-assets.invalid/');
  function readAsset(reference){
    const location=new URL(reference,pageLocation);
    if(location.origin!==pageLocation.origin)throw new Error('External test asset is not supported: '+reference);
    const localPath=path.resolve(root,'.'+decodeURIComponent(location.pathname));
    if(!localPath.startsWith(root+path.sep))throw new Error('Asset escapes the local site: '+reference);
    return readFileSync(localPath,'utf8');
  }
  function attribute(tag,name){const match=tag.match(new RegExp('\\b'+name+'\\s*=\\s*(["\\\'])(.*?)\\1','i'));return match?match[2]:null;}
  let html=readFileSync(pagePath,'utf8');
  html=html.replace(/<script\b[^>]*>\s*<\/script>/gi,tag=>{
    const source=attribute(tag,'src');if(!source)return tag;
    const code=readAsset(source).replace(/<\/script/gi,'<\\/script');
    if(/\bdefer\b/i.test(tag)){scripts.push(code);return '';}
    return '<script>'+code+'</script>';
  });
  html=html.replace(/<link\b[^>]*>/gi,tag=>{
    const href=attribute(tag,'href');if(attribute(tag,'rel')!=='stylesheet'||!href)return tag;
    return '<style>'+readAsset(href).replace(/<\/style/gi,'<\\/style')+'</style>';
  });
  return html.replace('</body>',scripts.map(source=>'<script>'+source+'</script>').join('\n')+'</body>');
}
