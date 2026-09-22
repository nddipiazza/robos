'use strict';

const path = require('path');

// Guarantee launch with robos-crpg course pre-selected
if (!process.argv.some(a => a.startsWith('--course='))) {
  process.argv.push('--course=robos-crpg');
}

// Delegate to standard robos-elearning runtime
require('../robos-elearning/main');
