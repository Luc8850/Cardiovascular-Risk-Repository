/**
 * @fileoverview Unit tests for DRC.Utils module.
 *
 * Covers: createTranslator, debounce, escapeHtml, createElementCache, createFocusTrap
 *
 * Run with: node tests/test-utils.js
 */

'use strict';

global.window = global;
global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
};

// Bootstrap I18n stub (createTranslator depends on it)
global.DRC = {};
DRC.I18n = {
    t: (key, fallback) => fallback || key
};

require('../js/utils.js');

const Utils = DRC.Utils;

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) { passed++; console.log(`  ✓ ${name}`); }
    else           { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

// ─── TEST SUITE 1: createTranslator ──────────────────────────────────────────

console.log('\n═══ TEST SUITE 1: createTranslator ═══');
{
    const t = Utils.createTranslator();

    // With fallback
    assert(t('units.years', 'years') === 'years', 'createTranslator returns fallback for unknown key');

    // Without fallback
    const result = t('nonexistent.key');
    assert(typeof result === 'string', 'createTranslator returns string for unknown key without fallback');
}

// ─── TEST SUITE 2: escapeHtml ────────────────────────────────────────────────

console.log('\n═══ TEST SUITE 2: escapeHtml ═══');
{
    assert(Utils.escapeHtml('<script>') === '&lt;script&gt;', 'escapeHtml escapes < and >');
    assert(Utils.escapeHtml('a & b') === 'a &amp; b', 'escapeHtml escapes ampersand');
    assert(Utils.escapeHtml('"hello"') === '&quot;hello&quot;', 'escapeHtml escapes double quotes');
    assert(Utils.escapeHtml("it's") === 'it&#039;s', 'escapeHtml escapes single quotes');
    assert(Utils.escapeHtml('plain text') === 'plain text', 'escapeHtml leaves plain text unchanged');
    assert(Utils.escapeHtml('') === '', 'escapeHtml handles empty string');
    assert(Utils.escapeHtml(42) === '42', 'escapeHtml converts numbers to string');
    assert(Utils.escapeHtml(null) === '', 'escapeHtml handles null (returns empty)');
    assert(Utils.escapeHtml(undefined) === '', 'escapeHtml handles undefined (returns empty)');
}

// ─── TEST SUITE 3: debounce ───────────────────────────────────────────────────

console.log('\n═══ TEST SUITE 3: debounce ═══');
{
    let callCount = 0;
    const fn = () => { callCount++; };
    const debounced = Utils.debounce(fn, 10);

    // Call multiple times rapidly
    debounced();
    debounced();
    debounced();

    // Before timeout, callCount should still be 0
    assert(callCount === 0, 'debounce: no immediate call');

    // Wait for timeout (use setTimeout in test)
    setTimeout(() => {
        assert(callCount === 1, 'debounce: only one call after delay');

        // ─── TEST SUITE 4: createElementCache ──────────────────────────────────

        console.log('\n═══ TEST SUITE 4: createElementCache ═══');
        {
            let idCounter = 0;
            global.document = {
                getElementById: (id) => {
                    idCounter++;
                    return { id, textContent: `Element ${id}` };
                },
                addEventListener: () => {},
                removeEventListener: () => {},
                querySelector: () => null,
                querySelectorAll: () => []
            };

            const cache = Utils.createElementCache();

            // First call should query DOM
            const el1 = cache.get('test-id');
            assert(el1 !== null, 'createElementCache returns element on first call');
            assert(el1.id === 'test-id', 'createElementCache returns correct element');
            const firstCounter = idCounter;

            // Second call should use cache (no new DOM query)
            const el2 = cache.get('test-id');
            assert(el2 === el1, 'createElementCache returns same element on second call');
            assert(idCounter === firstCounter, 'createElementCache does not query DOM on cache hit');

            // Clear cache
            cache.clear();
            const el3 = cache.get('test-id');
            assert(el3 !== null, 'createElementCache returns element after clear');

            // Different ID should query DOM
            const el4 = cache.get('other-id');
            assert(el4.id === 'other-id', 'createElementCache returns different element for different ID');
        }

        // ─── TEST SUITE 5: createFocusTrap ─────────────────────────────────────

        console.log('\n═══ TEST SUITE 5: createFocusTrap ═══');
        {
            // Create mock container with focusable elements
            const focusableElements = [
                { focus: () => {}, offsetParent: true },
                { focus: () => {}, offsetParent: true }
            ];
            const mockContainer = {
                addEventListener: () => {},
                removeEventListener: () => {},
                querySelector: (sel) => focusableElements[0],
                querySelectorAll: (sel) => focusableElements
            };

            const trap = Utils.createFocusTrap(mockContainer);

            assert(typeof trap.activate === 'function', 'createFocusTrap returns object with activate method');
            assert(typeof trap.deactivate === 'function', 'createFocusTrap returns object with deactivate method');

            // Activate should not throw
            let threw = false;
            try { trap.activate(); } catch (e) { threw = true; }
            assert(!threw, 'createFocusTrap activate does not throw');

            // Deactivate should not throw
            threw = false;
            try { trap.deactivate(); } catch (e) { threw = true; }
            assert(!threw, 'createFocusTrap deactivate does not throw');
        }

        // ─── Summary ─────────────────────────────────────────────────────────

        console.log('\n═══════════════════════════════════════════');
        console.log(`  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed`);
        console.log('═══════════════════════════════════════════\n');
        process.exit(failed > 0 ? 1 : 0);
    }, 50);
}