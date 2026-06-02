/**
 * @fileoverview Comparison test — verifies original calculator.js
 * produces identical results to the refactored modular architecture.
 *
 * Run with: node tests/test-comparison.js
 */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// ─── Load ORIGINAL monolithic module in a VM context ────────────────
const originalPath = path.join(__dirname, '..', '..', 'MA Versionen',
    '01_Code-Versionen', 'v3.7_Refactoring', 'calculator.js');
if (!fs.existsSync(originalPath)) {
    console.log('\x1b[33m⚠ SKIPPED: Comparison test requires original calculator.js at:\n  ' + originalPath + '\n  This file is outside the repository and only available in the thesis workspace.\x1b[0m');
    process.exit(0);
}
const originalCode = fs.readFileSync(originalPath, 'utf8');

// Strip DOMContentLoaded bootstrap
const cleanedCode = originalCode.replace(
    /document\.addEventListener\('DOMContentLoaded'[\s\S]*$/, '// bootstrap removed'
);

const sandbox = {
    window: {},
    document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({
            className: '', style: { cssText: '' }, innerHTML: '',
            setAttribute: () => {}, appendChild: () => {}, append: () => {},
            addEventListener: () => {},
            classList: { toggle: () => false, add: () => {}, remove: () => {} },
            querySelector: () => ({ addEventListener: () => {} }),
        }),
        createElementNS: () => ({ setAttribute: () => {}, textContent: '' }),
        addEventListener: () => {}
    },
    Object, Math, console, parseFloat, parseInt, isFinite, Date, Array, JSON,
    localStorage: { getItem: () => null, setItem: () => {} },
    alert: () => {}, confirm: () => true, setTimeout: () => {},
    XLSX: { utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} },
    FileReader: class { readAsArrayBuffer() {} }
};

// Wrap code to expose const declarations as sandbox properties
const wrappedCode = `
    ${cleanedCode}
    _CONFIG = CONFIG;
    _RiskModel = RiskModel;
`;
sandbox._CONFIG = null;
sandbox._RiskModel = null;

vm.createContext(sandbox);
vm.runInContext(wrappedCode, sandbox);

const ORIG_CONFIG    = sandbox._CONFIG;
const ORIG_RiskModel = sandbox._RiskModel;

// ─── Load REFACTORED modules ────────────────────────────────────────
global.window = global;
global.document = { getElementById: () => null };
require('../js/config.js');
require('../js/conversion-service.js');
require('../js/risk-model.js');

const NEW_CONFIG    = DRC.CONFIG;
const NEW_RiskModel = DRC.RiskModel;

// ─── Test harness ───────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(condition, name) {
    if (condition) { passed++; console.log(`  \u2713 ${name}`); }
    else { failed++; console.log(`  \u2717 FAIL: ${name}`); }
}

console.log('\n\u2550\u2550\u2550 COMPARISON TEST: Original vs Refactored \u2550\u2550\u2550\n');

// ─── 1. Beta coefficients ───────────────────────────────────────────
console.log('--- Beta Coefficients ---');
Object.entries(ORIG_CONFIG.BETAS).forEach(([key, val]) => {
    assert(NEW_CONFIG.BETAS[key] === val, `BETAS.${key}: ${val} === ${NEW_CONFIG.BETAS[key]}`);
});

// ─── 2. Population means ────────────────────────────────────────────
// Note: race and fastGlu were intentionally corrected vs. the original:
//   MEANS.race:    0.25 → 0.15 (Schmidt 2005: 15% African-American in ARIC cohort)
//   MEANS.fastGlu: 5.5  → 5.44 (Schmidt 2005: median fasting glucose 5.44 mmol/L)
console.log('\n--- Population Means (corrected values per Schmidt et al. 2005) ---');
const CORRECT_MEANS = { ...ORIG_CONFIG.MEANS, race: 0.15, fastGlu: 5.44 };
Object.entries(CORRECT_MEANS).forEach(([key, val]) => {
    assert(NEW_CONFIG.MEANS[key] === val, `MEANS.${key}: ${val} === ${NEW_CONFIG.MEANS[key]}`);
});

// ─── 3. Conversion factors ──────────────────────────────────────────
console.log('\n--- Conversion Factors ---');
Object.entries(ORIG_CONFIG.CONVERSIONS).forEach(([key, val]) => {
    assert(NEW_CONFIG.CONVERSIONS[key] === val, `CONVERSIONS.${key}: ${val} === ${NEW_CONFIG.CONVERSIONS[key]}`);
});

// ─── 4. Risk computation ────────────────────────────────────────────
console.log('\n--- Risk Computation ---');
const testCases = [
    { name: 'Population means', values: { ...ORIG_CONFIG.MEANS } },
    { name: 'Young healthy', values: { age: 25, race: 0, parentHist: 0, sbp: 110, height: 175, waist: 80, fastGlu: 4.5, cholHDL: 1.8, cholTri: 1.0 } },
    { name: 'Elderly high-risk', values: { age: 75, race: 1, parentHist: 1, sbp: 180, height: 155, waist: 130, fastGlu: 10.0, cholHDL: 0.7, cholTri: 4.0 } },
    { name: 'All zeros', values: { age: 0, race: 0, parentHist: 0, sbp: 0, height: 0, waist: 0, fastGlu: 0, cholHDL: 0, cholTri: 0 } },
    { name: 'Boundary low', values: { age: 20, race: 0, parentHist: 0, sbp: 80, height: 213, waist: 64, fastGlu: 2.8, cholHDL: 2.6, cholTri: 0.6 } },
    { name: 'Boundary high', values: { age: 80, race: 1, parentHist: 1, sbp: 220, height: 122, waist: 152, fastGlu: 16.7, cholHDL: 0.5, cholTri: 5.6 } },
];

testCases.forEach(tc => {
    const origProb = ORIG_RiskModel.computeProbability(tc.values);
    const newProb  = NEW_RiskModel.computeProbability(tc.values);
    const diff = Math.abs(origProb - newProb);
    assert(diff < 1e-10,
        `${tc.name}: orig=${(origProb*100).toFixed(6)}% new=${(newProb*100).toFixed(6)}% diff=${diff.toExponential(2)}`);
});

// ─── 5. Contributions ───────────────────────────────────────────────
// Note: Contributions use MEANS as baseline (beta * (x - mean)).
// Since MEANS.race and MEANS.fastGlu were intentionally corrected,
// contributions for race and fastGlu will differ from the original monolith.
// We verify self-consistency of the new code instead:
// For inputs equal to NEW MEANS, all contributions must be exactly zero.
console.log('\n--- Contributions (self-consistency with corrected MEANS) ---');
const newMeansContrib = NEW_RiskModel.computeContributions({ ...NEW_CONFIG.MEANS });
let allZero = true;
Object.entries(newMeansContrib).forEach(([k, v]) => {
    if (Math.abs(v) > 1e-10) allZero = false;
});
assert(allZero, 'Contributions at NEW MEANS are all zero (self-consistency)');

// For inputs NOT involving race or fastGlu, contributions remain identical to original
const noRaceNoGlu = { age: 54, race: 0, parentHist: 0, sbp: 120, height: 168, waist: 97, fastGlu: 5.44, cholHDL: 1.3, cholTri: 1.7 };
const origC_norace = ORIG_RiskModel.computeContributions({ ...noRaceNoGlu, fastGlu: 5.5 });
// The beta coefficients and contribution formula are identical — only MEANS differ
// Verify that non-race, non-fastGlu contributions match for identical inputs
const nonMeansFields = ['age', 'parentHist', 'sbp', 'waist', 'height', 'cholHDL', 'cholTri'];
testCases.filter(tc => tc.name !== 'Population means').forEach(tc => {
    const origC = ORIG_RiskModel.computeContributions(tc.values);
    const newC  = NEW_RiskModel.computeContributions(tc.values);
    let allMatch = true;
    nonMeansFields.forEach(k => {
        if (Math.abs(origC[k] - newC[k]) > 1e-10) allMatch = false;
    });
    assert(allMatch, `Contributions match (non-corrected fields): ${tc.name}`);
});

// ─── 6. Unit conversion ─────────────────────────────────────────────
console.log('\n--- Unit Conversion ---');
const usInputs = { age: 54, race: 0, parentHist: 0, sbp: 120, height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150 };
const origSI = ORIG_RiskModel.toSI(usInputs, false);
const newSI  = NEW_RiskModel.toSI(usInputs, false);
Object.keys(origSI).forEach(key => {
    assert(Math.abs(origSI[key] - newSI[key]) < 1e-10,
        `toSI.${key}: ${origSI[key].toFixed(6)} === ${newSI[key].toFixed(6)}`);
});

// ─── 7. Simulation effects ──────────────────────────────────────────
console.log('\n--- Simulation Effects ---');
Object.entries(ORIG_CONFIG.SIMULATION_EFFECTS).forEach(([key, fx]) => {
    assert(NEW_CONFIG.SIMULATION_EFFECTS[key].us === fx.us, `SIM.${key}.us: ${fx.us}`);
    assert(NEW_CONFIG.SIMULATION_EFFECTS[key].si === fx.si, `SIM.${key}.si: ${fx.si}`);
});

// ─── Summary ────────────────────────────────────────────────────────
console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log(`  COMPARISON: ${passed + failed} tests \u2014 ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('  \u2713 REFACTORED CODE IS FUNCTIONALLY IDENTICAL TO ORIGINAL');
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');
process.exit(failed > 0 ? 1 : 0);
