'use strict';
const inventory = require('../robos-inventory');
module.exports = { ...require('./lib/orders'), ...inventory };
