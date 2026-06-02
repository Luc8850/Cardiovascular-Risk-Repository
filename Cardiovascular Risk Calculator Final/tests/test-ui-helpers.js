/**
 * @fileoverview Unit tests for UIHelpers utility functions.
 * Run with: node tests/test-ui-helpers.js
 */

'use strict';

global.window = global;
global.document = { getElementById: () => null };

require('../js/config.js');
require('../js/utils.js');
require('../js/ui-helpers.js');

const { clampAndRound, formatAxisValue, escapeHtml, formatPercent, formatDeltaPercent } = DRC.UIHelpers;

let passed = 0, failed = 0;
function assert(condition, name) {
    if (condition) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

console.log('\n═══ UIHelpers: clampAndRound ═══');
assert(clampAndRound(5, 0, 10, 1) === 5, 'Within range: 5 in [0,10] = 5');
assert(clampAndRound(-5, 0, 10, 1) === 0, 'Below min: -5 clamped to 0');
assert(clampAndRound(15, 0, 10, 1) === 10, 'Above max: 15 clamped to 10');
assert(clampAndRound(5.67, 0, 10, 0.1) === 5.7, 'Float step: 5.67 → 5.7');
assert(clampAndRound(5.34, 0, 10, 0.1) === 5.3, 'Float step: 5.34 → 5.3');
assert(clampAndRound(5.5, 0, 10, 1) === 6, 'Integer step: 5.5 → 6');

console.log('\n═══ UIHelpers: clampAndRound with scientific notation ═══');
assert(clampAndRound(5.1234567, 0, 10, 1e-7) === 5.1234567, 'Scientific notation 1e-7: preserves 7 decimals');
assert(clampAndRound(5.123, 0, 10, 0.0000001) === 5.123, 'Scientific notation 0.0000001: preserves 7 decimals');

console.log('\n═══ UIHelpers: escapeHtml (XSS Prevention) ═══');
assert(escapeHtml('<script>alert("xss")</script>') === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'XSS: script tags escaped');
assert(escapeHtml('Tom & Jerry') === 'Tom &amp; Jerry', 'Ampersand escaped');
assert(escapeHtml('<div>content</div>') === '&lt;div&gt;content&lt;/div&gt;', 'HTML tags escaped');
assert(escapeHtml('"quoted"') === '&quot;quoted&quot;', 'Double quotes escaped');
assert(escapeHtml("'single'") === '&#039;single&#039;', 'Single quotes escaped');
assert(escapeHtml('normal text') === 'normal text', 'Normal text unchanged');
assert(escapeHtml('') === '', 'Empty string handled');
assert(escapeHtml(123) === '123', 'Numbers converted to string');

console.log('\n═══ UIHelpers: formatAxisValue ═══');
assert(formatAxisValue(5, false) === '5', 'Integer: 5 → "5"');
assert(formatAxisValue(5.0, true) === '5.0', 'Float: 5.0 → "5.0"');
assert(formatAxisValue(3.14, true) === '3.1', 'Float: 3.14 → "3.1"');

console.log('\n═══ UIHelpers: formatPercent ═══');
assert(formatPercent(50) === '50.0%', 'formatPercent(50) = "50.0%"');
assert(formatPercent(0) === '0.0%', 'formatPercent(0) = "0.0%"');
assert(formatPercent(33.333) === '33.3%', 'formatPercent(33.333) = "33.3%"');
assert(formatPercent(99.999) === '100.0%', 'formatPercent(99.999) rounds to "100.0%"');
assert(formatPercent(100) === '100.0%', 'formatPercent(100) = "100.0%"');
assert(formatPercent(0.5) === '0.5%', 'formatPercent(0.5) = "0.5%"');
assert(formatPercent(12.5) === '12.5%', 'formatPercent(12.5) = "12.5%"');
// Edge cases
assert(formatPercent(Infinity) === '0%', 'formatPercent(Infinity) returns "0%"');
assert(formatPercent(-5) === '-5.0%', 'formatPercent(-5) = "-5.0%"');
assert(formatPercent(-5, 0) === '-5%', 'formatPercent(-5, 0) = "-5%"');

console.log('\n═══ UIHelpers: formatDeltaPercent ═══');
assert(formatDeltaPercent(5) === '+5.00%', 'formatDeltaPercent(5) = "+5.00%"');
assert(formatDeltaPercent(-3) === '-3.00%', 'formatDeltaPercent(-3) = "-3.00%"');
assert(formatDeltaPercent(0) === '0.00%', 'formatDeltaPercent(0) = "0.00%" (no sign for zero)');
assert(formatDeltaPercent(2.5) === '+2.50%', 'formatDeltaPercent(2.5) = "+2.50%"');
assert(formatDeltaPercent(-0.5) === '-0.50%', 'formatDeltaPercent(-0.5) = "-0.50%"');
assert(formatDeltaPercent(10.123) === '+10.12%', 'formatDeltaPercent(10.123) = "+10.12%"');
// Edge cases: non-finite values return '0%'
assert(formatDeltaPercent(Infinity) === '0%', 'formatDeltaPercent(Infinity) returns "0%"');
assert(formatDeltaPercent(NaN) === '0%', 'formatDeltaPercent(NaN) returns "0%"');

console.log(`\n  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
