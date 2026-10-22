// Integration test against an installed native suite, including the real Electron IPC/preloads.
const fs = require('node:fs');
const path = require('node:path');
async function smoke(root) {
  const { _electron } = require(path.join(root, 'packages/robos-test/node_modules/playwright-core'));
  const results = [];
  fs.mkdirSync(path.resolve('run/windows-install'), { recursive: true });
  for (const id of ['', 'point-of-sale', 'auto-center', 'household', 'robos-graph', 'audio-player', 'task-planner']) {
    let instance;
    try {
      instance = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
        args: ['--no-sandbox', '--disable-gpu', path.join(root, 'windows'), ...(id ? [`--app=${id}`] : [])], timeout: 30000,
        env: Object.fromEntries(Object.entries({ ...process.env, HOME: process.env.USERPROFILE }).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
      const page = await instance.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(() => document.body.innerText.trim().length > 100, { timeout: 15000 });
      if (!id) {
        await page.locator('#search').fill('Point of Sale');
        await page.getByRole('button', { name: /Point of Sale/ }).waitFor();
      }
      await page.screenshot({ path: path.resolve(`run/windows-install/${id || 'launcher'}.png`) });
      results.push({ app: id || 'launcher', ok: true, title: await page.title() });
    } catch (error) { results.push({ app: id || 'launcher', ok: false, error: error.message }); }
    finally { await instance?.close().catch(() => {}); }
    console.log(JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync('run/windows-install/results.json', JSON.stringify(results, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
smoke(path.resolve(process.argv[2])).catch(error => { console.error(error); process.exitCode = 1; });
