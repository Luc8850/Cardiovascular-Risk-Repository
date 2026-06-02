/**
 * @fileoverview Unit tests for the 3-model multi-model switcher system.
 *
 * Tests cover:
 *   1. MODELS data structure validation
 *   2. Coefficients verification (Schmidt et al. 2005)
 *   3. Cross-model computation tests
 *   4. Model field membership
 *   5. Backward compatibility
 *   6. Edge cases
 *
 * Run with: node tests/test-multi-model.js
 */

'use strict';

// ─── Bootstrap: Load modules in Node.js ─────────────────────────────
global.window = global;
global.document = { getElementById: () => null };

require('../js/config.js');
require('../js/conversion-service.js');
require('../js/risk-model.js');

const { CONFIG } = DRC;
const { computeProbability, computeContributions, computeBaselineRisk, computeMarginalSummary, computeWhatIfDelta } = DRC.RiskModel;

// ─── Test harness ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, name) {
    if (condition) {
        passed++;
        results.push(`  ✓ ${name}`);
    } else {
        failed++;
        results.push(`  ✗ FAIL: ${name}`);
    }
}

function assertApprox(actual, expected, tolerance, name) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        results.push(`  ✓ ${name} (${actual.toFixed(4)} ≈ ${expected.toFixed(4)})`);
    } else {
        failed++;
        results.push(`  ✗ FAIL: ${name} — got ${actual.toFixed(6)}, expected ${expected.toFixed(6)}, diff ${diff.toFixed(6)}`);
    }
}

function assertEqual(actual, expected, name) {
    if (actual === expected) {
        passed++;
        results.push(`  ✓ ${name}`);
    } else {
        failed++;
        results.push(`  ✗ FAIL: ${name} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
}

// =====================================================================
// TEST SUITE 1: MODELS Data Structure Validation
// =====================================================================
console.log('\n═══ TEST SUITE 1: MODELS Data Structure Validation ═══');

assert(CONFIG.MODELS !== undefined && CONFIG.MODELS !== null, 'CONFIG.MODELS exists');
assertEqual(Object.keys(CONFIG.MODELS).length, 3, 'CONFIG.MODELS has exactly 3 keys');
assert('clinical' in CONFIG.MODELS, 'clinical model key exists');
assert('clinicalGlucose' in CONFIG.MODELS, 'clinicalGlucose model key exists');
assert('clinicalGlucoseLipids' in CONFIG.MODELS, 'clinicalGlucoseLipids model key exists');

const requiredFields = ['id', 'name', 'intercept', 'betas', 'fields', 'sliderFields', 'treatmentFields', 'radarFields'];
Object.entries(CONFIG.MODELS).forEach(([modelKey, model]) => {
    requiredFields.forEach(field => {
        assert(field in model, `Model '${modelKey}' has required field: ${field}`);
    });
});

assert(CONFIG.DEFAULT_MODEL !== undefined, 'DEFAULT_MODEL is defined');
assert(CONFIG.DEFAULT_MODEL in CONFIG.MODELS, 'DEFAULT_MODEL points to a valid model key');
assertEqual(CONFIG.DEFAULT_MODEL, 'clinicalGlucoseLipids', 'DEFAULT_MODEL is clinicalGlucoseLipids');

results.forEach(r => console.log(r));
results.length = 0;

// =====================================================================
// TEST SUITE 2: Coefficients Verification (Schmidt et al. 2005)
// =====================================================================
console.log('\n═══ TEST SUITE 2: Coefficients Verification (Schmidt et al. 2005) ═══');

const m1 = CONFIG.MODELS.clinical;
const m3 = CONFIG.MODELS.clinicalGlucose;
const m4 = CONFIG.MODELS.clinicalGlucoseLipids;

// Model 1 (clinical)
assertApprox(m1.intercept, -7.3359, 1e-9, 'clinical intercept = -7.3359');
assertApprox(m1.betas.age, 0.0271, 1e-9, 'clinical beta age = 0.0271');
assertApprox(m1.betas.race, 0.2295, 1e-9, 'clinical beta race = 0.2295');
assertApprox(m1.betas.parentHist, 0.5463, 1e-9, 'clinical beta parentHist = 0.5463');
assertApprox(m1.betas.sbp, 0.0161, 1e-9, 'clinical beta sbp = 0.0161');
assertApprox(m1.betas.waist, 0.0412, 1e-9, 'clinical beta waist = 0.0412');
assertApprox(m1.betas.height, -0.0115, 1e-9, 'clinical beta height = -0.0115');

// Model 3 (clinicalGlucose)
assertApprox(m3.intercept, -12.2555, 1e-9, 'clinicalGlucose intercept = -12.2555');
assertApprox(m3.betas.age, 0.0168, 1e-9, 'clinicalGlucose beta age = 0.0168');
assertApprox(m3.betas.race, 0.2631, 1e-9, 'clinicalGlucose beta race = 0.2631');
assertApprox(m3.betas.parentHist, 0.5088, 1e-9, 'clinicalGlucose beta parentHist = 0.5088');
assertApprox(m3.betas.sbp, 0.0120, 1e-9, 'clinicalGlucose beta sbp = 0.0120');
assertApprox(m3.betas.waist, 0.0328, 1e-9, 'clinicalGlucose beta waist = 0.0328');
assertApprox(m3.betas.height, -0.0261, 1e-9, 'clinicalGlucose beta height = -0.0261');
assertApprox(m3.betas.fastGlu, 1.6445, 1e-9, 'clinicalGlucose beta fastGlu = 1.6445');

// Model 4 (clinicalGlucoseLipids)
assertApprox(m4.intercept, -9.9808, 1e-9, 'clinicalGlucoseLipids intercept = -9.9808');
assertApprox(m4.betas.age, 0.0173, 1e-9, 'clinicalGlucoseLipids beta age = 0.0173');
assertApprox(m4.betas.race, 0.4433, 1e-9, 'clinicalGlucoseLipids beta race = 0.4433');
assertApprox(m4.betas.parentHist, 0.4981, 1e-9, 'clinicalGlucoseLipids beta parentHist = 0.4981');
assertApprox(m4.betas.sbp, 0.0111, 1e-9, 'clinicalGlucoseLipids beta sbp = 0.0111');
assertApprox(m4.betas.waist, 0.0273, 1e-9, 'clinicalGlucoseLipids beta waist = 0.0273');
assertApprox(m4.betas.height, -0.0326, 1e-9, 'clinicalGlucoseLipids beta height = -0.0326');
assertApprox(m4.betas.fastGlu, 1.5849, 1e-9, 'clinicalGlucoseLipids beta fastGlu = 1.5849');
assertApprox(m4.betas.cholHDL, -0.4718, 1e-9, 'clinicalGlucoseLipids beta cholHDL = -0.4718');
assertApprox(m4.betas.cholTri, 0.242, 1e-9, 'clinicalGlucoseLipids beta cholTri = 0.242');

results.forEach(r => console.log(r));
results.length = 0;

// =====================================================================
// TEST SUITE 3: Cross-model computation tests
// =====================================================================
console.log('\n═══ TEST SUITE 3: Cross-model computation tests ═══');

// Population means as input (CONFIG.MEANS has all 9 numeric fields)
const means = { ...CONFIG.MEANS };

const pClinical = computeProbability(means, m1);
const pClinicalGlucose = computeProbability(means, m3);
const pClinicalGlucoseLipids = computeProbability(means, m4);
const pDefault = computeProbability(means);

assert(typeof pClinical === 'number' && !isNaN(pClinical), 'clinical: computeProbability returns a number');
assert(typeof pClinicalGlucose === 'number' && !isNaN(pClinicalGlucose), 'clinicalGlucose: computeProbability returns a number');
assert(typeof pClinicalGlucoseLipids === 'number' && !isNaN(pClinicalGlucoseLipids), 'clinicalGlucoseLipids: computeProbability returns a number');

// All models should give different results at population means
assert(pClinical !== pClinicalGlucose, 'computeProbability: clinical ≠ clinicalGlucose results');
assert(pClinicalGlucose !== pClinicalGlucoseLipids, 'computeProbability: clinicalGlucose ≠ clinicalGlucoseLipids results');
assert(pClinical !== pClinicalGlucoseLipids, 'computeProbability: clinical ≠ clinicalGlucoseLipids results');

// Backward compatibility: explicit default model matches no-model call
assertApprox(pClinicalGlucoseLipids, pDefault, 1e-12,
    'computeProbability(means, clinicalGlucoseLipids) === computeProbability(means) [backward compat]');

// computeContributions: clinical model should NOT have lab fields
const contribClinical = computeContributions(means, m1);
assert(!('fastGlu' in contribClinical), 'clinical contributions: fastGlu NOT present');
assert(!('cholHDL' in contribClinical), 'clinical contributions: cholHDL NOT present');
assert(!('cholTri' in contribClinical), 'clinical contributions: cholTri NOT present');
assert('age' in contribClinical, 'clinical contributions: age IS present');
assert('sbp' in contribClinical, 'clinical contributions: sbp IS present');
assert('waist' in contribClinical, 'clinical contributions: waist IS present');

// computeContributions: clinicalGlucose should have fastGlu but not lipids
const contribGlucose = computeContributions(means, m3);
assert('fastGlu' in contribGlucose, 'clinicalGlucose contributions: fastGlu IS present');
assert(!('cholHDL' in contribGlucose), 'clinicalGlucose contributions: cholHDL NOT present');
assert(!('cholTri' in contribGlucose), 'clinicalGlucose contributions: cholTri NOT present');

// computeContributions: full model has all lab fields
const contribFull = computeContributions(means, m4);
assert('fastGlu' in contribFull, 'clinicalGlucoseLipids contributions: fastGlu IS present');
assert('cholHDL' in contribFull, 'clinicalGlucoseLipids contributions: cholHDL IS present');
assert('cholTri' in contribFull, 'clinicalGlucoseLipids contributions: cholTri IS present');

// computeBaselineRisk differs across models
const bClinical = computeBaselineRisk(m1);
const bGlucose = computeBaselineRisk(m3);
const bFull = computeBaselineRisk(m4);
assert(bClinical !== bGlucose, 'computeBaselineRisk: clinical ≠ clinicalGlucose');
assert(bGlucose !== bFull, 'computeBaselineRisk: clinicalGlucose ≠ clinicalGlucoseLipids');
assert(bClinical !== bFull, 'computeBaselineRisk: clinical ≠ clinicalGlucoseLipids');

results.forEach(r => console.log(r));
results.length = 0;

// =====================================================================
// TEST SUITE 4: Model field membership
// =====================================================================
console.log('\n═══ TEST SUITE 4: Model field membership ═══');

// Beta key counts
assertEqual(Object.keys(m1.betas).length, 6, 'clinical: exactly 6 beta keys');
assertEqual(Object.keys(m3.betas).length, 7, 'clinicalGlucose: exactly 7 beta keys');
assertEqual(Object.keys(m4.betas).length, 9, 'clinicalGlucoseLipids: exactly 9 beta keys');

// clinical model should not contain lab value keys in betas
assert(!('fastGlu' in m1.betas), 'clinical betas: no fastGlu');
assert(!('cholHDL' in m1.betas), 'clinical betas: no cholHDL');
assert(!('cholTri' in m1.betas), 'clinical betas: no cholTri');

// clinicalGlucose adds fastGlu only
assert('fastGlu' in m3.betas, 'clinicalGlucose betas: has fastGlu');
assert(!('cholHDL' in m3.betas), 'clinicalGlucose betas: no cholHDL');
assert(!('cholTri' in m3.betas), 'clinicalGlucose betas: no cholTri');

// clinicalGlucoseLipids has all three lab fields
assert('fastGlu' in m4.betas, 'clinicalGlucoseLipids betas: has fastGlu');
assert('cholHDL' in m4.betas, 'clinicalGlucoseLipids betas: has cholHDL');
assert('cholTri' in m4.betas, 'clinicalGlucoseLipids betas: has cholTri');

// treatmentFields
function arraysEqual(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}
assert(arraysEqual(m1.treatmentFields, ['sbp', 'waist']),
    'clinical treatmentFields = [sbp, waist]');
assert(arraysEqual(m3.treatmentFields, ['fastGlu', 'sbp', 'waist']),
    'clinicalGlucose treatmentFields = [fastGlu, sbp, waist]');
assert(arraysEqual(m4.treatmentFields, ['fastGlu', 'sbp', 'cholHDL', 'cholTri', 'waist']),
    'clinicalGlucoseLipids treatmentFields = [fastGlu, sbp, cholHDL, cholTri, waist]');

results.forEach(r => console.log(r));
results.length = 0;

// =====================================================================
// TEST SUITE 5: Backward compatibility
// =====================================================================
console.log('\n═══ TEST SUITE 5: Backward compatibility ═══');

// All CONFIG.BETAS values match clinicalGlucoseLipids betas
const B = CONFIG.BETAS;
Object.keys(m4.betas).forEach(key => {
    assertApprox(m4.betas[key], B[key], 1e-9,
        `clinicalGlucoseLipids.betas.${key} === CONFIG.BETAS.${key}`);
});

// CONFIG.BETAS.sigma matches clinicalGlucoseLipids intercept
assertApprox(B.sigma, m4.intercept, 1e-9,
    'CONFIG.BETAS.sigma === clinicalGlucoseLipids.intercept (-9.9808)');

// computeProbability without model param uses default model (clinicalGlucoseLipids)
assertApprox(computeProbability(means), computeProbability(means, m4), 1e-12,
    'computeProbability(means) === computeProbability(means, m4) [no-arg uses default]');

// computeBaselineRisk without model param equals full model baseline
assertApprox(computeBaselineRisk(), computeBaselineRisk(m4), 1e-12,
    'computeBaselineRisk() === computeBaselineRisk(m4)');

// computeMarginalSummary without model equals full model
const sumDefault = computeMarginalSummary(means);
const sumFull = computeMarginalSummary(means, m4);
assertApprox(sumDefault.pFull, sumFull.pFull, 1e-12,
    'computeMarginalSummary(means).pFull === computeMarginalSummary(means, m4).pFull');

results.forEach(r => console.log(r));
results.length = 0;

// =====================================================================
// TEST SUITE 6: Edge cases
// =====================================================================
console.log('\n═══ TEST SUITE 6: Edge cases ═══');

// Clinical model ignores fastGlu/cholHDL/cholTri even if present in input
const inputWithAllFields = { ...means, fastGlu: 99, cholHDL: 99, cholTri: 99 };
const pClinicalNoLab = computeProbability({ ...means }, m1);
const pClinicalWithExtraLab = computeProbability(inputWithAllFields, m1);
assertApprox(pClinicalNoLab, pClinicalWithExtraLab, 1e-9,
    'clinical model: result unchanged when fastGlu/cholHDL/cholTri present in input (ignored by betas)');

// Verify the ignoring works via contributions too
const contribNoLab = computeContributions({ ...means }, m1);
const contribWithExtraLab = computeContributions(inputWithAllFields, m1);
const sumNoLab = Object.values(contribNoLab).reduce((a, b) => a + b, 0);
const sumWithExtraLab = Object.values(contribWithExtraLab).reduce((a, b) => a + b, 0);
assertApprox(sumNoLab, sumWithExtraLab, 1e-9,
    'clinical contributions: sum unchanged when extra lab fields present in input');

// Model switching doesn't affect pure computation: same model + same input = same output
const pFirst = computeProbability(means, m1);
const pSecond = computeProbability(means, m1);
assertEqual(pFirst, pSecond,
    'Deterministic: same model + same input produces identical output (no side effects)');

const pGluFirst = computeProbability(means, m3);
const pGluSecond = computeProbability(means, m3);
assertEqual(pGluFirst, pGluSecond,
    'Deterministic: clinicalGlucose stable across repeated calls');

// radarFields are subsets of betas keys (age always in betas)
[m1, m3, m4].forEach(m => {
    const betaKeys = Object.keys(m.betas);
    const allRadarInBetas = m.radarFields.every(f => betaKeys.includes(f));
    assert(allRadarInBetas,
        `Model '${m.id}': all radarFields are in betas keys`);
    assert(betaKeys.includes('age'),
        `Model '${m.id}': age is always in betas`);
});

// computeWhatIfDelta respects model: clinical model with direction up on fastGlu
// should give different delta than full model (different betas)
const whatIfInputsUS = {
    age: 50, race: 0, parentHist: 0, sbp: 120,
    height: 66, waist: 36, fastGlu: 95, cholHDL: 50, cholTri: 150
};
const deltaFullGlu = computeWhatIfDelta(whatIfInputsUS, false, 'fastGlu', 1, m4);
const deltaGlucoseModel = computeWhatIfDelta(whatIfInputsUS, false, 'fastGlu', 1, m3);
assert(typeof deltaFullGlu === 'number' && !isNaN(deltaFullGlu),
    'computeWhatIfDelta with m4: returns a number for fastGlu');
assert(typeof deltaGlucoseModel === 'number' && !isNaN(deltaGlucoseModel),
    'computeWhatIfDelta with m3: returns a number for fastGlu');
assert(deltaFullGlu !== deltaGlucoseModel,
    'computeWhatIfDelta: different models produce different fastGlu deltas (different betas)');

results.forEach(r => console.log(r));
results.length = 0;

// =====================================================================
// SUMMARY
// =====================================================================
console.log('\n═══════════════════════════════════════════');
console.log(`  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
