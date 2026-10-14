import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let packageName='jsdom',loaded;
try { loaded=require(packageName); }
catch(error) {
  // Re-throw broken installed packages; fall back only when jsdom is absent.
  if(error.code!=='MODULE_NOT_FOUND'||!error.message.includes("'jsdom'"))throw error;
  packageName='../../.tools/ui/node_modules/jsdom';
  loaded=require(packageName);
}

export const {JSDOM,VirtualConsole}=loaded;
export const jsdomVersion=require(packageName+'/package.json').version;
export const jsdomSource=packageName;

// jsdom 26 uses ResourceLoader; jsdom 29 uses request interceptors. Keep local
// filesystem resources behind one adapter, with no network requests in tests.
export function localResources(readAsset){
  if(typeof loaded.requestInterceptor==='function')return {
    interceptors:[loaded.requestInterceptor(request=>{
      const contents=readAsset(request.url);
      return new Response(contents,{headers:{'Content-Type':new URL(request.url).pathname.endsWith('.css')?'text/css':'application/javascript'}});
    })]
  };
  if(typeof loaded.ResourceLoader==='function')return new class extends loaded.ResourceLoader {
    fetch(url){return Promise.resolve(readAsset(url));}
  }();
  throw new Error('Unsupported jsdom resource API: '+jsdomVersion);
}
