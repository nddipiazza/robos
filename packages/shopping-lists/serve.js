#!/usr/bin/env node
'use strict';

const { createStore } = require('./lib/store');
const { createMobileServer } = require('./lib/mobile-server');

async function main() {
  const port = Number(process.env.SHOPPING_LISTS_WEB_PORT || process.env.PORT || 19225);
  const host = process.env.HOST || '0.0.0.0';
  const store = createStore();
  const mobile = createMobileServer({ store });
  const info = await mobile.listen(port, host);
  console.log(`RobOS Household Shopping Lists mobile form server: ${info.localUrl} (LAN: ${info.lanUrl})`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
