import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('public/models-runtime',{recursive:true});
await build({entryPoints:['src/workers/screen-worker.ts'],outfile:'public/screen-worker.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'eof'});
// ORT chooses a runtime variant for this browser/model. Keep every shipped WASM
// variant local rather than depending on a CDN or a guessed execution path.
for(const variant of ['', '.jsep', '.asyncify', '.jspi'])for(const suffix of ['mjs','wasm']){
  const file=`ort-wasm-simd-threaded${variant}.${suffix}`;
  await copyFile(`node_modules/onnxruntime-web/dist/${file}`,`public/models-runtime/${file}`);
}
console.log('Built local screening worker and self-hosted WASM runtime. Model weights download only on user request.');
