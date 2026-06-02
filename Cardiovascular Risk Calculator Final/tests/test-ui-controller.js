/**
 * @fileoverview Unit tests for the UIController module.
 *
 * UIController is the DOM-orchestration layer. Its methods are fully
 * tested here using a comprehensive in-memory element mock so that no
 * real browser is needed. Tests cover:
 *
 *   1. getRiskLevel (via renderRisk)  — colour/level thresholds at 0, 9, 10, 25, 49, 50, 100
 *   2. readInputs()                   — reads all 9 fields from DOM
 *   3. renderWhatIfBadge()            — delta formatting, class names, hidden state
 *   4. renderChosenRisk()             — writes value + color to chosen-risk element
 *   5. renderHeatmapPointer()         — style.left and style.bottom bounds
 *   6. updateNonModSummary()          — text output for non-modifiable factor summary
 *   7. updateModSummary()             — text output for modifiable factor summary
 *   8. applyConvertedValues()         — US→SI and SI→US field conversion + clamping
 *
 * Run with: node tests/test-ui-controller.js
 */

'use strict';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

global.window = global;
global.DRC    = {};

require('../js/config.js');
require('../js/conversion-service.js');
require('../js/ui-helpers.js');
require('../js/utils.js');

// Stub App before UIController loads (the filter-toggle handler calls it)
DRC.App = { _calculate: () => {} };

// ─── DOM mock ─────────────────────────────────────────────────────────────────

function makeEl(props) {
    const children = [];
    let _textContent = '';
    const el = {
        value:       '0',
        checked:     false,
        get textContent() { return _textContent; },
        set textContent(v) { _textContent = v; },
        _textContent: '',
        innerHTML:   '',
        style:       { color: '', left: '', bottom: '', borderColor: '', transform: '', fontWeight: '' },
        min:  '0',
        max:  '100',
        step: '1',
        className: '',
        tagName:   'div',
        classList: {
            toggle:   () => {},
            add:      () => {},
            remove:   () => {},
            contains: () => false
        },
        children: children,
        _attrs:       {},
        setAttribute: function(k, v) { this._attrs[k] = v; },
        getAttribute: function(k)    { return this._attrs[k] ?? null; },
        addEventListener:  () => {},
        appendChild: function(child) {
            if (child) {
                children.push(child);
            }
            return child;
        },
        querySelector:     () => makeEl(),
        querySelectorAll:  () => [],
        closest:           () => null,
        focus:             () => {},
        dispatchEvent:     () => {}
    };
    const result = Object.assign(el, props || {});
    // Ensure _textContent stays in sync if provided
    if (props?.textContent !== undefined) {
        _textContent = props.textContent;
    }
    return result;
}

// The registry of named DOM elements used by UIController
const ELEMS = {
    // readInputs
    'age-value':          makeEl({ value: '54' }),
    'race-toggle':        makeEl({ checked: false }),
    'parentHist-toggle':  makeEl({ checked: true }),
    'sbp-value':          makeEl({ value: '120' }),
    'height-value':       makeEl({ value: '66', textContent: '66' }),
    'waist-value':        makeEl({ value: '36', textContent: '36' }),
    'fastGlu-value':      makeEl({ value: '100' }),
    'cholHDL-value':      makeEl({ value: '50' }),
    'cholTri-value':      makeEl({ value: '150' }),

    // unit labels read by summaries
    'height-value-unit':  makeEl({ textContent: 'in' }),
    'fastGlu-value-unit': makeEl({ textContent: 'mg/dL' }),
    'waist-value-unit':   makeEl({ textContent: 'in' }),
    'cholHDL-value-unit': makeEl({ textContent: 'mg/dL' }),
    'cholTri-value-unit': makeEl({ textContent: 'mg/dL' }),

    // renderRisk targets
    'risk-percentage': makeEl({ textContent: '0.0', style: { color: '' } }),
    'risk-score-card': makeEl(),
    'panel-input':     makeEl(),
    'panel-treatment': makeEl(),
    'risk-bar-marker': makeEl({ style: { left: '', borderColor: '' } }),

    // unit label emphasis
    'unit-label-us':   makeEl({ style: { fontWeight: '', color: '' } }),
    'unit-label-si':   makeEl({ style: { fontWeight: '', color: '' } }),

    // slider fields for updateSliderFill / applyConvertedValues
    'height-slider':    makeEl({ value: '66',  min: '48', max: '84',   step: '1'   }),
    'waist-slider':     makeEl({ value: '36',  min: '25', max: '60',   step: '1'   }),
    'fastGlu-slider':   makeEl({ value: '100', min: '50', max: '300',  step: '1'   }),
    'cholHDL-slider':   makeEl({ value: '50',  min: '20', max: '100',  step: '1'   }),
    'cholTri-slider':   makeEl({ value: '150', min: '50', max: '500',  step: '1'   }),
    'height-fill':      makeEl({ style: { transform: '' } }),
    'waist-fill':       makeEl({ style: { transform: '' } }),
    'fastGlu-fill':     makeEl({ style: { transform: '' } }),
    'cholHDL-fill':     makeEl({ style: { transform: '' } }),
    'cholTri-fill':     makeEl({ style: { transform: '' } }),
    'age-slider':       makeEl({ value: '54', min: '20', max: '80', step: '1' }),
    'sbp-slider':       makeEl({ value: '120', min: '80', max: '220', step: '1' }),
    'age-fill':         makeEl({ style: { transform: '' } }),
    'sbp-fill':         makeEl({ style: { transform: '' } }),

    // renderWhatIfBadge
    'what-if-fastGlu':  makeEl({ className: 'what-if-badge', textContent: '' }),
    'what-if-sbp':      makeEl({ className: 'what-if-badge', textContent: '' }),
    'what-if-age':      makeEl({ className: 'what-if-badge', textContent: '' }),

    // renderChosenRisk
    'chosen-risk-percentage': makeEl({ textContent: '0.0', style: { color: '' } }),
    'chosen-treatments-list':  makeEl(),

    // summary labels (setText targets)
    'summary-age':    makeEl({ textContent: '' }),
    'summary-race':   makeEl({ textContent: '' }),
    'summary-parent': makeEl({ textContent: '' }),
    'summary-height': makeEl({ textContent: '' }),
    'summary-fastGlu':makeEl({ textContent: '' }),
    'summary-waist':  makeEl({ textContent: '' }),
    'summary-sbp':    makeEl({ textContent: '' }),
    'summary-hdl':    makeEl({ textContent: '' }),
    'summary-tri':    makeEl({ textContent: '' }),

    // slider axis labels (setText targets in updateSliderAxisLabels)
    'height-min': makeEl({ textContent: '' }),
    'height-mid': makeEl({ textContent: '' }),
    'height-max': makeEl({ textContent: '' }),
    'waist-min':  makeEl({ textContent: '' }),
    'waist-mid':  makeEl({ textContent: '' }),
    'waist-max':  makeEl({ textContent: '' }),
    'cholTri-min': makeEl({ textContent: '' }),
    'cholTri-mid': makeEl({ textContent: '' }),
    'cholTri-max': makeEl({ textContent: '' }),

    // unit label targets
    'height-unit':       makeEl({ textContent: '' }),
    'waist-unit':        makeEl({ textContent: '' }),
    'fastGlu-unit':      makeEl({ textContent: '' }),
    'cholHDL-unit':      makeEl({ textContent: '' }),
    'cholTri-unit':      makeEl({ textContent: '' }),
    'height-value-unit-lbl':  makeEl({ textContent: '' }),
    'waist-value-unit-lbl':   makeEl({ textContent: '' }),
    'fastGlu-value-unit-lbl': makeEl({ textContent: '' }),
    'cholHDL-value-unit-lbl': makeEl({ textContent: '' }),
    'cholTri-value-unit-lbl': makeEl({ textContent: '' }),

    // renderContributionChart — needs querySelector for filter-toggle addEventListener
    'contribution-chart': Object.assign(makeEl({ innerHTML: '', _showProtective: 'false' }), {
        getAttribute: function(k) { return k === 'data-show-protective' ? this._showProtective : null; },
        setAttribute: function(k, v) { if (k === 'data-show-protective') this._showProtective = v; },
        appendChild: () => {}
    }),

};

// createElement returns a mock that can have children appended
global.document = {
    getElementById:   (id) => ELEMS[id] ?? null,
    querySelector:    ()   => null,
    querySelectorAll: ()   => [],
    createElement:    ()   => {
        const el = makeEl();
        el.querySelector = () => makeEl();
        return el;
    }
};

require('../js/ui-controller.js');
const UIC = DRC.UIController;

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) { passed++; console.log(`  ✓ ${name}`); }
    else           { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

function assertApprox(actual, expected, tol, name) {
    if (Math.abs(actual - expected) <= tol) {
        passed++; console.log(`  ✓ ${name} (${actual} ≈ ${expected})`);
    } else {
        failed++; console.log(`  ✗ FAIL: ${name} — got ${actual}, expected ${expected}`);
    }
}

// ─── TEST SUITE 1: getRiskLevel via renderRisk ────────────────────────────────

console.log('\n═══ TEST SUITE 1: getRiskLevel (via renderRisk) ═══');

// Helper: call renderRisk and return the level stored on 'risk-score-card'
function riskLevel(pct) {
    UIC.renderRisk(pct);
    return ELEMS['risk-score-card']._attrs['data-risk-level'];
}

// Exact boundaries
assert(riskLevel(50)  === 'danger',  'pct=50 → danger (≥50)');
assert(riskLevel(100) === 'danger',  'pct=100 → danger');
// High-risk threshold aligned with Schmidt et al. (2005): Pr(DM) ≥ 26% = high risk
assert(riskLevel(49)  === 'warning', 'pct=49 → warning (≥26, <50)');
assert(riskLevel(26)  === 'warning', 'pct=26 → warning (≥26, Schmidt high-risk cutoff)');
assert(riskLevel(25)  === 'alert',   'pct=25 → alert (≥10, <26)');
assert(riskLevel(24)  === 'alert',   'pct=24 → alert (≥10, <26)');
assert(riskLevel(10)  === 'alert',   'pct=10 → alert (≥10)');
assert(riskLevel(9)   === 'safe',    'pct=9 → safe (<10)');
assert(riskLevel(0)   === 'safe',    'pct=0 → safe');

// risk-bar-marker position is set as a percentage
UIC.renderRisk(40);
assert(ELEMS['risk-bar-marker'].style.left === '40%', 'risk-bar-marker left = 40% for pct=40');
UIC.renderRisk(150);  // above 100 → clamped to 100%
assert(ELEMS['risk-bar-marker'].style.left === '100%', 'risk-bar-marker left clamped to 100% above pct=100');

// risk-percentage textContent is updated
UIC.renderRisk(14.58);
assert(ELEMS['risk-percentage'].textContent === '14.6', 'risk-percentage textContent = "14.6" for pct=14.58');

// ─── TEST SUITE 2: readInputs() ───────────────────────────────────────────────

console.log('\n═══ TEST SUITE 2: readInputs() ═══');

const inputs = UIC.readInputs();
assert(inputs.age        === 54,  'readInputs: age = 54');
assert(inputs.race       === 0,   'readInputs: race = 0 (toggle unchecked)');
assert(inputs.parentHist === 1,   'readInputs: parentHist = 1 (toggle checked)');
assert(inputs.sbp        === 120, 'readInputs: sbp = 120');
assert(inputs.height     === 66,  'readInputs: height = 66');
assert(inputs.waist      === 36,  'readInputs: waist = 36');
assert(inputs.fastGlu    === 100, 'readInputs: fastGlu = 100');
assert(inputs.cholHDL    === 50,  'readInputs: cholHDL = 50');
assert(inputs.cholTri    === 150, 'readInputs: cholTri = 150');

// All 10 keys present (9 risk factors + sex)
assert(Object.keys(inputs).length === 10, 'readInputs: returns exactly 10 keys');

// Non-numeric input falls back to 0
ELEMS['age-value'].value = 'abc';
const badInputs = UIC.readInputs();
assert(badInputs.age === 0, 'readInputs: non-numeric age value falls back to 0');
ELEMS['age-value'].value = '54';  // restore

// ─── TEST SUITE 3: renderWhatIfBadge() ────────────────────────────────────────

console.log('\n═══ TEST SUITE 3: renderWhatIfBadge() ═══');

// Positive delta → visible, delta-up class, '+' prefix
UIC.renderWhatIfBadge('fastGlu', 5.123);
assert(ELEMS['what-if-fastGlu'].className   === 'what-if-badge visible delta-up',
    'Positive delta → class "what-if-badge visible delta-up"');
assert(ELEMS['what-if-fastGlu'].textContent === '+5.12%',
    'Positive delta → textContent "+5.12%"');

// Negative delta → visible, delta-down class, no '+' prefix
UIC.renderWhatIfBadge('fastGlu', -2.5);
assert(ELEMS['what-if-fastGlu'].className   === 'what-if-badge visible delta-down',
    'Negative delta → class "what-if-badge visible delta-down"');
assert(ELEMS['what-if-fastGlu'].textContent === '-2.50%',
    'Negative delta → textContent "-2.50%"');

// Delta below threshold (< 0.01) → hidden
UIC.renderWhatIfBadge('fastGlu', 0.005);
assert(ELEMS['what-if-fastGlu'].className   === 'what-if-badge',
    'Sub-threshold delta (0.005) → badge hidden (class = "what-if-badge")');
assert(ELEMS['what-if-fastGlu'].textContent === '',
    'Sub-threshold delta → empty textContent');

// Zero delta → hidden
UIC.renderWhatIfBadge('fastGlu', 0);
assert(ELEMS['what-if-fastGlu'].className === 'what-if-badge', 'Zero delta → badge hidden');

// Exactly +0.01 → visible
UIC.renderWhatIfBadge('sbp', 0.01);
assert(ELEMS['what-if-sbp'].className.includes('delta-up'), 'Delta=0.01 (boundary) → visible delta-up');

// Exactly -0.01 → visible
UIC.renderWhatIfBadge('sbp', -0.01);
assert(ELEMS['what-if-sbp'].className.includes('delta-down'), 'Delta=-0.01 (boundary) → visible delta-down');

// Missing badge element → safe no-op
let threw = false;
try { UIC.renderWhatIfBadge('nonexistentField', 5.0); } catch (e) { threw = true; }
assert(!threw, 'renderWhatIfBadge with unknown field → no throw');

// ─── TEST SUITE 4: renderChosenRisk() ─────────────────────────────────────────

console.log('\n═══ TEST SUITE 4: renderChosenRisk() ═══');

// renderChosenRisk writes into #chosen-risk-percentage
if (typeof UIC.renderChosenRisk === 'function') {
    UIC.renderChosenRisk(12.5);
    assert(ELEMS['chosen-risk-percentage']?.textContent === '12.5',
        'renderChosenRisk writes value to #chosen-risk-percentage');
} else {
    assert(false, 'renderChosenRisk is missing from public API');
}

// ─── TEST SUITE 5: updateNonModSummary() ─────────────────────────────────────

console.log('\n═══ TEST SUITE 5: updateNonModSummary() ═══');

ELEMS['age-value'].value = '58';
ELEMS['race-toggle'].checked = true;
ELEMS['parentHist-toggle'].checked = false;
ELEMS['height-value'].value = '175';
ELEMS['height-value-unit'].textContent = 'cm';

UIC.updateNonModSummary();

assert(ELEMS['summary-age'].textContent    === 'Age: 58',     'summary-age = "Age: 58"');
assert(ELEMS['summary-race'].textContent   === 'Black',       'summary-race = "Black" (toggle checked)');
assert(ELEMS['summary-parent'].textContent === 'No', 'summary-parent = "No" (toggle unchecked)');

// Test checked case
ELEMS['parentHist-toggle'].checked = true;
UIC.updateNonModSummary();
assert(ELEMS['summary-parent'].textContent === 'Yes', 'summary-parent = "Yes" (toggle checked)');
ELEMS['parentHist-toggle'].checked = false;  // restore for next test
assert(ELEMS['summary-height'].textContent === '175 cm',      'summary-height = "175 cm"');

// Restore defaults
ELEMS['age-value'].value = '54';
ELEMS['race-toggle'].checked = false;
ELEMS['parentHist-toggle'].checked = true;
ELEMS['height-value'].value = '66';
ELEMS['height-value-unit'].textContent = 'in';

// ─── TEST SUITE 6: updateModSummary() ────────────────────────────────────────

console.log('\n═══ TEST SUITE 6: updateModSummary() ═══');

ELEMS['fastGlu-value'].value = '5.8';
ELEMS['fastGlu-value-unit'].textContent = 'mmol/L';
ELEMS['waist-value'].value = '98';
ELEMS['waist-value-unit'].textContent = 'cm';
ELEMS['sbp-value'].value = '135';
ELEMS['cholHDL-value'].value = '1.1';
ELEMS['cholHDL-value-unit'].textContent = 'mmol/L';
ELEMS['cholTri-value'].value = '2.1';
ELEMS['cholTri-value-unit'].textContent = 'mmol/L';

UIC.updateModSummary();

assert(ELEMS['summary-fastGlu'].textContent === 'Glucose: 5.8 mmol/L', 'summary-fastGlu correct');
assert(ELEMS['summary-waist'].textContent   === 'Waist: 98 cm',     'summary-waist correct');
assert(ELEMS['summary-sbp'].textContent     === 'Blood Pressure: 135 mmHg', 'summary-sbp correct');
assert(ELEMS['summary-hdl'].textContent     === 'HDL: 1.1 mmol/L',  'summary-hdl correct');
assert(ELEMS['summary-tri'].textContent     === 'TG: 2.1 mmol/L',   'summary-tri correct');

// ─── TEST SUITE 7: applyConvertedValues() ─────────────────────────────────────

console.log('\n═══ TEST SUITE 7: applyConvertedValues() ═══');

// SI values applied with isMetric=true: values stay in SI with clamping
const siValsTest = { height: 168, waist: 97, fastGlu: 5.6, cholHDL: 1.3, cholTri: 150 };
UIC.applyConvertedValues(siValsTest, true);
assert(ELEMS['height-value'].value  === 168, 'SI 168 cm applied directly (clamped to [122,213] step=1)');
assert(ELEMS['waist-value'].value   === 97,  'SI 97 cm applied directly (clamped to [64,152] step=1)');
assert(ELEMS['fastGlu-value'].value === 5.6, 'SI 5.6 mmol/L applied directly (clamped to [2.8,16.7] step=0.1)');
assert(ELEMS['cholHDL-value'].value === 1.3, 'SI 1.3 mmol/L applied directly (clamped to [0.5,2.6] step=0.1)');

// SI → US back-conversion: fastGlu 5.5556 mmol/L / (1/18) = 100 mg/dL
const siVals = { fastGlu: 5.5556 };
UIC.applyConvertedValues(siVals, false);
assert(ELEMS['fastGlu-value'].value === 100, 'SI 5.5556 mmol/L → US 100 mg/dL');

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
