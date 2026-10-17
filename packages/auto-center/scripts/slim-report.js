'use strict';
// Rebuilds the Cucumber HTML report from the message stream without the embedded screenshots, so the
// published copy is small. The screenshots are shown in the guide itself.
const fs = require('node:fs'), path = require('node:path');
const { CucumberHtmlStream } = require('@cucumber/html-formatter');
const [input, output] = process.argv.slice(2);
const dist = path.join(path.dirname(require.resolve('@cucumber/html-formatter/package.json')), 'dist');
const stream = new CucumberHtmlStream(path.join(dist, 'main.css'), path.join(dist, 'main.js')), file = fs.createWriteStream(output);
stream.pipe(file); file.on('finish', () => console.log('Slim report:', fs.statSync(output).size, 'bytes'));
for (const line of fs.readFileSync(input, 'utf8').split('\n')) { if (!line) continue; const env = JSON.parse(line); if (!env.attachment) stream.write(env); }
stream.end();
