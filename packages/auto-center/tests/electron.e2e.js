'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {_electron:electron}=require('../../robos-test/node_modules/playwright-core');
test('Auto Center searches collected data and persists owner-entered service records in Electron',{timeout:120000},async()=>{
 const privateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'robos-auto-e2e-'));
 const proof=path.join(os.homedir(),'.robos/development/walkthroughs/auto-center');fs.mkdirSync(proof,{recursive:true});
 const app=await electron.launch({executablePath:require('../node_modules/electron'),args:[path.resolve(__dirname,'../main.js'),'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],env:{...process.env,ROBOS_AUTO_PRIVATE:privateRoot}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>document.querySelector('#count').textContent.includes('graph entries'),{timeout:60000});
  await page.locator('[data-view="catalog"]').click();
  await page.locator('#results .result').first().waitFor({timeout:60000});
  await page.locator('#query').fill('2015 Toyota Camry');await page.locator('#type').selectOption('robos:VehicleConfiguration');await page.locator('#search-form button').click();
  await page.waitForFunction(()=>document.querySelector('#results .result')?.textContent.includes('2015 Toyota Camry'));assert.ok((await page.locator('#query').boundingBox()).width>=200);assert.match(await page.locator('#results').innerText(),/2015 Toyota Camry/);
  await page.locator('#results .result').first().click();await page.waitForFunction(()=>document.querySelector('#detail').textContent.includes('epaVehicleId'));assert.match(await page.locator('#detail').innerText(),/epaVehicleId/);
  await page.screenshot({path:path.join(proof,'catalog.png')});
  await page.locator('[data-view="garage"]').click();
  await page.locator('#vehicle-form [name="name"]').fill('Local test vehicle');await page.locator('#vehicle-form [name="year"]').fill('2015');await page.locator('#vehicle-form [name="make"]').fill('Toyota');await page.locator('#vehicle-form [name="model"]').fill('Camry');await page.locator('#vehicle-form button[type="submit"], #vehicle-form button:not([type])').click();
  await page.waitForFunction(()=>document.querySelector('#vehicles').options.length===1);
  await page.locator('#service-form [name="name"]').fill('Oil and filter change (test entry)');await page.locator('#service-form [name="date"]').fill('2026-10-15');await page.locator('#service-form [name="mileage"]').fill('72000');await page.locator('#service-form [name="notes"]').fill('Owner-entered test record; no work was performed.');await page.locator('#service-form button').click();
  await page.waitForFunction(()=>document.querySelectorAll('#records .card').length===2);
  await page.reload();await page.locator('[data-view="garage"]').click();await page.waitForFunction(()=>document.querySelectorAll('#records .card').length===2);
  assert.match(await page.locator('#records').innerText(),/Oil and filter change/);
  await page.screenshot({path:path.join(proof,'garage.png')});
  await page.locator('[data-view="sources"]').click();assert.match(await page.locator('#source-list').innerText(),/NHTSA|vPIC/);await page.screenshot({path:path.join(proof,'sources.png')});
  await page.locator('[data-view="schema"]').click();assert.ok(await page.locator('#schema-list .tag').count()>15);assert.match(await page.locator('#software').innerText(),/LubeLogger/);assert.deepEqual(errors,[]);
  console.log('Screenshots: '+proof);
 }finally{await app.close();}
});
