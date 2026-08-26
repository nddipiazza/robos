const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpFile = path.join(os.tmpdir(), `test-onboarding-${Date.now()}.json`);
process.env.ROBOS_ONBOARDING_FILE = tmpFile;

const onboardingState = require('./onboarding-state');

console.log('Testing onboarding-state module...');

// Initial state should be uncompleted
let state = onboardingState.getOnboardingState();
assert.strictEqual(state.completed, false, 'Initial state should be false');
assert.strictEqual(onboardingState.isOnboardingCompleted(), false, 'isOnboardingCompleted should be false initially');

// Set completed
const setRes = onboardingState.setOnboardingCompleted({ defaultModel: 'gemini-3.6-flash' });
assert.strictEqual(setRes.ok, true, 'setOnboardingCompleted should return ok');
assert.strictEqual(onboardingState.isOnboardingCompleted(), true, 'isOnboardingCompleted should return true');

state = onboardingState.getOnboardingState();
assert.strictEqual(state.completed, true);
assert.strictEqual(state.config.defaultModel, 'gemini-3.6-flash');

// Reset state
const resetRes = onboardingState.resetOnboardingState();
assert.strictEqual(resetRes.ok, true);
assert.strictEqual(onboardingState.isOnboardingCompleted(), false);

// Clean up
try { fs.unlinkSync(tmpFile); } catch {}

console.log('✓ All onboarding-state tests passed successfully!');
