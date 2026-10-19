'use strict';
// GS1 GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) check-digit validation.

function gtinCheckDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function isValidGtin(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.slice(-1));
}

// Build a valid UPC-A/EAN from a body, used by the sample data.
function withCheckDigit(body) {
  return body + gtinCheckDigit(body);
}

module.exports = { isValidGtin, gtinCheckDigit, withCheckDigit };
