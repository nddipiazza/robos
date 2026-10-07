'use strict';
const path=require('node:path');
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'renderer/changes-entry.js')],bundle:true,platform:'browser',format:'iife',minify:true,outfile:path.join(__dirname,'renderer/vendor/changes.js'),legalComments:'linked'});
