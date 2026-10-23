// Membangun Fengari khusus browser: `process` didefinisikan undefined sehingga seluruh cabang khusus Node
// (io.*, os.execute, fs, child_process, tmp, readline-sync) terbuang saat bundling. Hasilnya dipakai bundler Next
// lewat alias (next.config.ts); tes Node tetap memakai paket `fengari` asli.
import { build } from 'esbuild';
await build({
  stdin: { contents: "import f from 'fengari'; export const { lua, lauxlib, lualib, to_luastring, to_jsstring } = f;", resolveDir: process.cwd(), loader: 'js' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true,
  define: { process: 'undefined', 'process.env.FENGARICONF': 'undefined' },
  external: ['fs', 'child_process', 'tmp', 'readline-sync', 'path', 'os'],
  outfile: 'lib/lualab/vendor/fengari.browser.js',
  legalComments: 'none', logLevel: 'info',
});
