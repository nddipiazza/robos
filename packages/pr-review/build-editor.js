'use strict';
require('esbuild').buildSync({entryPoints:[require('node:path').join(__dirname,'renderer/editor-entry.js')],bundle:true,platform:'browser',format:'iife',minify:true,outfile:require('node:path').join(__dirname,'renderer/vendor/markdown-editor.js'),legalComments:'linked'});
