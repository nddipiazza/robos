'use strict';
// Turns whatever a scanner produced (a UPC off a laser gun, a QR code from a webcam, a GS1 Data Matrix) into the
// catalog codes it could stand for. Hardware scanners that type into a text box and camera scans go through the same path.
const { isValidGtin, gtinCheckDigit } = require('./gtin');

// UPC-E (8 digits, zero-suppressed) -> UPC-A (12 digits).
function expandUpcE(code) {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [n, a, b, c, d, e, f] = code.slice(0, 7);
  const last = Number(f);
  let body;
  if (last <= 2) body = `${n}${a}${b}${f}0000${c}${d}${e}`;
  else if (last === 3) body = `${n}${a}${b}${c}00000${d}${e}`;
  else if (last === 4) body = `${n}${a}${b}${c}${d}00000${e}`;
  else body = `${n}${a}${b}${c}${d}${e}0000${f}`;
  return body + code[7];
}

// The same product can be printed as GTIN-8/12/13/14 with leading zeros. Return every form it could be stored as.
function gtinForms(digits) {
  const padded = digits.padStart(14, '0');
  const forms = new Set([padded]);
  for (const len of [13, 12, 8]) if (/^0*$/.test(padded.slice(0, 14 - len))) forms.add(padded.slice(14 - len));
  return [...forms];
}

// Pull a GTIN out of a GS1 Digital Link URL, a GS1 element string, or a plain numeric code.
function extractGtin(text) {
  const t = text.replace(/^\][A-Za-z]\d/, ''); // symbology identifier such as ]d2 (Data Matrix) or ]Q3 (QR)
  try {
    const url = new URL(t);
    const parts = url.pathname.split('/').filter(Boolean);
    const at = parts.indexOf('01');
    if (at >= 0 && /^\d{8,14}$/.test(parts[at + 1] || '')) return parts[at + 1];
  } catch { /* not a URL */ }
  const bracket = t.match(/^\(01\)(\d{14})/);
  if (bracket) return bracket[1];
  const bare = t.match(/^01(\d{14})/); // AI 01 + GTIN-14, alone or followed by more application identifiers; the check digit guards against look-alikes
  if (bare && isValidGtin(bare[1])) return bare[1];
  return null;
}

function candidates(raw) {
  const text = String(raw || '').trim().replace(/^\][A-Za-z]\d/, '');
  if (!text) return [];
  const out = new Set([text]);
  const addNumeric = digits => { for (const f of gtinForms(digits)) out.add(f); };
  const gtin = extractGtin(text);
  if (gtin) addNumeric(gtin);
  if (/^\d{8,14}$/.test(text)) {
    addNumeric(text);
    const upca = expandUpcE(text);
    if (upca) addNumeric(upca);
  }
  return [...out];
}

// Does a stored catalog code match any of the scanned candidates?
function matches(stored, candidateSet) {
  if (!stored) return false;
  if (candidateSet.has(stored)) return true;
  if (/^\d{8,14}$/.test(stored)) return gtinForms(stored).some(f => candidateSet.has(f));
  return false;
}

// What to store when someone scans a code into the barcode field: the plain GTIN if there is one, else the text as scanned.
function canonicalBarcode(raw) {
  const text = String(raw || '').trim();
  const gtin = extractGtin(text) || (/^\d{8,14}$/.test(text) && isValidGtin(text) ? text : null);
  if (!gtin) return text;
  const padded = gtin.padStart(14, '0');
  if (/^0{6}/.test(padded)) return padded.slice(6);
  if (/^00/.test(padded)) return padded.slice(2);
  if (/^0/.test(padded)) return padded.slice(1);
  return padded;
}

module.exports = { candidates, matches, expandUpcE, extractGtin, gtinForms, canonicalBarcode, gtinCheckDigit };
