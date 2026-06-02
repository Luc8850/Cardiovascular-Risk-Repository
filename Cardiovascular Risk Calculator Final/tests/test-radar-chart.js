/**
 * @fileoverview Unit tests for the RadarChart module — DEPRECATED
 *
 * RadarChart is now a no-op module kept for backwards compatibility.
 * These tests verify that the module exports the expected interface
 * and that calling its functions does not throw errors.
 *
 * Run with: node tests/test-radar-chart.js
 */

'use strict';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

global.window = global;
global.DRC    = {};

require('../js/config.js');

// ─── DOM mock (minimal) ───────────────────────────────────────────────────────

global.document = {
    getElementById: () => null,
    createElementNS: () => ({
        setAttribute: () => {},
        textContent: '',
        appendChild: () => {}
    })
};

require('../js/radar-chart.js');
const RC = DRC.RadarChart;

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) { passed++; console.log(`  ✓ ${name}`); }
    else           { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

// ─── TEST SUITE: Deprecated module sanity checks ──────────────────────────────

console.log('\n═══ TEST SUITE: RadarChart (DEPRECATED) ═══');

assert(typeof RC === 'object', 'RadarChart module exports an object');
assert(typeof RC.init === 'function', 'RadarChart exports init() function');
assert(typeof RC.render === 'function', 'RadarChart exports render() function');
assert(Array.isArray(RC.AXES), 'RadarChart exports AXES as array');
assert(RC.AXES.length === 0, 'AXES is empty array (feature removed)');

// No-op behavior — calling these should not throw
let threw = false;
try { RC.init(); } catch (e) { threw = true; }
assert(!threw, 'init() does not throw');

threw = false;
try { RC.render({}); } catch (e) { threw = true; }
assert(!threw, 'render() does not throw');

threw = false;
try { RC.render({}, []); } catch (e) { threw = true; }
assert(!threw, 'render() with arguments does not throw');

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
console.log('  Note: RadarChart feature has been removed. Module kept for backwards compatibility.\n');
process.exit(failed > 0 ? 1 : 0);
