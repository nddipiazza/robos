'use strict';

/**
 * Get a nested field value from an object using dot-notation.
 */
function getField(obj, fieldPath) {
  const parts = fieldPath.split('.');
  let value = obj;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

/**
 * Condition operators.
 * Each returns true if the condition is satisfied.
 */
const operators = {
  eq(actual, expected) {
    return actual === expected;
  },

  neq(actual, expected) {
    return actual !== expected;
  },

  contains(actual, expected) {
    if (typeof actual !== 'string') return false;
    return actual.includes(String(expected));
  },

  matches(actual, expected) {
    if (typeof actual !== 'string') return false;
    try {
      return new RegExp(expected).test(actual);
    } catch (_) {
      return false;
    }
  },

  gt(actual, expected) {
    return Number(actual) > Number(expected);
  },

  lt(actual, expected) {
    return Number(actual) < Number(expected);
  },

  exists(actual, _expected) {
    return actual !== undefined && actual !== null;
  },
};

/**
 * Evaluate a single condition against an event.
 */
function evaluateCondition(event, condition) {
  const actual = getField(event, condition.field);
  const op = operators[condition.op];
  if (!op) return false;
  return op(actual, condition.value);
}

/**
 * Evaluate all conditions (AND-combined) against an event.
 */
function evaluateConditions(event, conditions) {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(cond => evaluateCondition(event, cond));
}

module.exports = { getField, operators, evaluateCondition, evaluateConditions };
