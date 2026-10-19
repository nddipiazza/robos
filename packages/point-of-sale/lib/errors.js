'use strict';

class PosError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PosError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { PosError };
