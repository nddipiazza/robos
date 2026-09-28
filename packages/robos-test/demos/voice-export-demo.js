'use strict';
// Isolated Electron + real native Save As dialog. Requires xdotool and an X display.
// Seeded speech messages are test data, not a recorded conversation.
const { _electron: electron } = require('playwright-core');
const fs = require('fs');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const config = fs.mkdtempSync(path.join(require('os').tmpdir(), 'voice-export-'));
const output = process.env.ROBOS_PROOF_DIR || config;
fs.mkdirSync(output, { recursive: true });
(async () => {
const app = await electron.launch({executablePath: root+'/packages/voice-prompt/node_modules/electron/dist/electron', args: [root+'/packages/voice-prompt','--no-sandbox', '--disable-gpu', '--user-data-dir='+config+'/electron'], env:{...process.env, ROBOS_CONFIG_DIR:config, ROBOS_VOICE_PORT:'19289'}, recordVideo:{dir:output}});
try {
 const page=await app.firstWindow();
 const match = await page.evaluate(() => window.robosVoiceHud.matchVoiceCommand('Open E-learning.'));
 assert.equal(match.command.targetId, 'robos-elearning');
 await page.locator('#btn-save-as').waitFor();
 await page.click('#btn-save-as');
 await page.waitForFunction(()=>document.querySelector('#export-status').textContent.includes('no messages'));
 // Real IPC speech events, deliberately non-command text to avoid opening apps.
 await app.evaluate(({BrowserWindow}) => {
  const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='RobOS Voice');
  w.webContents.send('vp-hud-stream-text',{text:'First exported voice message.',isFinal:true});
  w.webContents.send('vp-hud-stream-text',{text:'Second separate message with café and 日本語.',isFinal:true});
 });
 await page.waitForFunction(()=>document.querySelectorAll('.dictation-bubble').length===2);
 await page.click('#btn-save-as');
 await page.waitForTimeout(1500);
 // Drive the real GTK Save As dialog on the isolated X display.
 const windows=execFileSync('xdotool',['search','--name','Save voice chat history'],{encoding:'utf8'}).trim().split('\n');
 const id=windows.at(-1);
 execFileSync('xdotool',['windowfocus',id]);
 execFileSync('xdotool',['key','--window',id,'ctrl+a']);
 const out=config+'/history.txt';
 execFileSync('xdotool',['type','--window',id,'--clearmodifiers',out]);
 execFileSync('xdotool',['key','--window',id,'Return']);
 await page.waitForFunction(()=>document.querySelector('#export-status').textContent.startsWith('Saved to'));
 const text=fs.readFileSync(out,'utf8');
 assert(text.includes('First exported voice message.'));assert(text.includes('Second separate message with café and 日本語.'));
 await page.screenshot({path:output+'/export.png'});
 await page.click('#btn-save-as');
 await page.waitForTimeout(1000);
 execFileSync('xdotool',['key','Escape']);
 await page.waitForFunction(()=>document.querySelector('#export-status').textContent==='Save canceled.');
 console.log('PASS real native Save As, UTF-8 full history and cancel:',config);
} finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
