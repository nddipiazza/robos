require('esbuild').buildSync({
  absWorkingDir: __dirname,
  entryPoints: ['highlight.js/lib/common'], bundle: true, minify: true,
  platform: 'browser', format: 'iife', globalName: 'hljs', outfile: 'renderer/vendor/highlight.js',
});
