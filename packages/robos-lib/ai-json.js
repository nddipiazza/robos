'use strict';

/**
 * Shared AI JSON utilities for RobOS.
 *
 * Include JSON_RULES_PROMPT in any AI prompt that expects JSON output.
 * Use parseAIJson() to robustly parse AI-generated JSON responses.
 */

let jsonrepair = null;
try { jsonrepair = require('jsonrepair').jsonrepair; } catch {}

/**
 * Critical JSON formatting rules to append to any AI prompt that expects
 * JSON output. Prevents the most common AI mistakes (literal newlines in
 * strings, smart quotes, control characters).
 */
const JSON_RULES_PROMPT = `
CRITICAL JSON RULES — you MUST follow these exactly:
- All string values must be on a single line. Do NOT include literal newlines, tabs, or other control characters inside string values.
- Use \\n (escaped backslash-n) if you need a newline within a string, never a real newline character.
- Do not use smart quotes (\u201c\u201d\u2018\u2019) — use only straight ASCII double quotes.
- The entire response must be parseable by JSON.parse() with no modification.`.trim();

/**
 * Strip ANSI escape codes and markdown code fences from AI output.
 */
function stripAIWrapper(text) {
  // eslint-disable-next-line no-control-regex
  return (text || '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b[()][0-9A-Z]/g, '')
    .replace(/^```[\w]*\r?\n?/gm, '')
    .replace(/^```\r?$/gm, '')
    .trim();
}

/**
 * Sanitize a raw string by escaping control characters inside JSON string
 * values. Used as last-resort repair when jsonrepair can't fix the output.
 */
function sanitizeControlChars(str) {
  return str.replace(/"(?:[^"\\]|\\.)*"/g, m =>
    m
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  );
}

/**
 * Parse JSON from an AI response using a 3-tier strategy:
 *   1. JSON.parse on stripped text
 *   2. jsonrepair library
 *   3. Manual control-character sanitizer
 *
 * Also attempts to extract a JSON array or object from surrounding prose.
 *
 * @param {string} text - Raw AI response text
 * @returns {{ ok: true, data: any } | { ok: false, error: string, raw: string }}
 */
function parseAIJson(text) {
  const clean = stripAIWrapper(text);

  function tryParse(str) {
    try { return JSON.parse(str); } catch {}
    if (jsonrepair) {
      try { return JSON.parse(jsonrepair(str)); } catch {}
    }
    try { return JSON.parse(sanitizeControlChars(str)); } catch {}
    return null;
  }

  let parsed = tryParse(clean);
  if (parsed !== null) return { ok: true, data: parsed };

  // Try extracting a JSON array or object from surrounding prose
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    parsed = tryParse(arrMatch[0]);
    if (parsed !== null) return { ok: true, data: parsed };
  }

  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    parsed = tryParse(objMatch[0]);
    if (parsed !== null) return { ok: true, data: parsed };
  }

  return { ok: false, error: 'No valid JSON in response.', raw: text.slice(0, 400) };
}

module.exports = { JSON_RULES_PROMPT, parseAIJson, stripAIWrapper };
