/**
 * @fileoverview Unit tests for Event System (on/off/trigger).
 * Run with: node tests/test-event-system.js
 */

'use strict';

global.window = global;
global.document = { getElementById: () => null };

// Store original console methods
const originalLog = console.log;
const originalError = console.error;
console._errors = [];
console.error = (...args) => {
    console._errors.push(args.join(' '));
};

require('../js/config.js');
require('../js/risk-model.js');
require('../js/ui-helpers.js');
require('../js/utils.js');
require('../js/ui-controller.js');
require('../js/app.js');

const App = DRC.App;

let passed = 0, failed = 0;
function assert(condition, name) {
    if (condition) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

console.log('\n═══ Event System: Basic Functionality ═══');

// Test 1: Basic event registration and triggering
let callCount = 0;
const testHandler1 = () => { callCount++; };
const unsubscribe1 = App.on('test:event', testHandler1);
App.trigger('test:event');
assert(callCount === 1, 'Event handler called once after trigger');

// Test 2: Multiple triggers
App.trigger('test:event');
App.trigger('test:event');
assert(callCount === 3, 'Event handler called multiple times');

// Test 3: Multiple handlers
let handler2Called = false;
const testHandler2 = () => { handler2Called = true; };
App.on('test:event', testHandler2);
App.trigger('test:event');
assert(handler2Called, 'Multiple handlers can be registered');

console.log('\n═══ Event System: Unsubscribe (off) ═══');

// Test 4: Unsubscribe function returned by on()
const unsubscribe3 = App.on('test:unsub', () => { callCount++; });
assert(typeof unsubscribe3 === 'function', 'on() returns unsubscribe function');

// Test 5: Unsubscribe works
let unsubCalled = 0;
const unsubHandler = () => { unsubCalled++; };
const unsub = App.on('test:unsub2', unsubHandler);
App.trigger('test:unsub2');
assert(unsubCalled === 1, 'Handler called before unsubscribe');
unsub();
App.trigger('test:unsub2');
assert(unsubCalled === 1, 'Handler NOT called after unsubscribe');

// Test 6: App.off() method
let offCalled = 0;
const offHandler = () => { offCalled++; };
App.on('test:off', offHandler);
App.trigger('test:off');
assert(offCalled === 1, 'Handler works before off()');
App.off('test:off', offHandler);
App.trigger('test:off');
assert(offCalled === 1, 'Handler NOT called after off()');

console.log('\n═══ Event System: Error Handling ═══');

// Test 7: Error in one handler doesn't stop others
let otherHandlerCalled = false;
const errorHandler = () => { throw new Error('Test error'); };
const otherHandler = () => { otherHandlerCalled = true; };
App.on('test:error', errorHandler);
App.on('test:error', otherHandler);
console._errors = []; // Clear errors
App.trigger('test:error');
assert(otherHandlerCalled, 'Other handlers still called when one throws');
assert(console._errors.length > 0, 'Error is logged to console');

console.log('\n═══ Event System: Security (Prototype Pollution) ═══');

// Test 8: Prototype pollution keys are rejected
console._errors = [];
const protoHandler = () => {};
App.on('__proto__', protoHandler);
assert(console._errors.length > 0, '__proto__ event name rejected');

console._errors = [];
App.on('constructor', protoHandler);
assert(console._errors.length > 0, 'constructor event name rejected');

console.log('\n═══ Event System: Data Passing ═══');

// Test 9: Data is passed to handlers
let receivedData = null;
const dataHandler = (data) => { receivedData = data; };
App.on('test:data', dataHandler);
App.trigger('test:data', { test: 'value', num: 42 });
assert(receivedData && receivedData.test === 'value', 'Data passed to handler');
assert(receivedData && receivedData.num === 42, 'Number data passed correctly');

// Test 10: Multiple events are isolated
let event1Called = false, event2Called = false;
App.on('test:isolated1', () => { event1Called = true; });
App.on('test:isolated2', () => { event2Called = true; });
App.trigger('test:isolated1');
assert(event1Called && !event2Called, 'Events are isolated (trigger only affects correct event)');

console.log('\n═══ Event System: Edge Cases ═══');

// Test 11: Triggering non-existent event doesn't error
let noError = true;
try {
    App.trigger('test:nonexistent');
} catch (e) {
    noError = false;
}
assert(noError, 'Triggering non-existent event does not throw');

// Test 12: Non-function callback is rejected
console._errors = [];
App.on('test:badcallback', 'not a function');
assert(console._errors.length > 0, 'Non-function callback rejected');

// Test 13: off() on non-existent event doesn't error
let offNoError = true;
try {
    App.off('test:neverexisted', () => {});
} catch (e) {
    offNoError = false;
}
assert(offNoError, 'off() on non-existent event does not throw');

// Test 14: Event listeners can be chained/unsubscribed independently
let chainCount = 0;
const chainHandler1 = () => { chainCount += 1; };
const chainHandler2 = () => { chainCount += 10; };
const unsub1 = App.on('test:chain', chainHandler1);
const unsub2 = App.on('test:chain', chainHandler2);
App.trigger('test:chain');
assert(chainCount === 11, 'Both handlers called');
unsub1();
App.trigger('test:chain');
assert(chainCount === 21, 'Only second handler called after first unsubscribed');
unsub2();
App.trigger('test:chain');
assert(chainCount === 21, 'No handlers called after both unsubscribed');

console.log(`\n  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
