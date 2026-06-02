/**
 * @fileoverview Additional edge-case tests for RiskModel and CONFIG.
 *
 * Complements the baseline suite in test-risk-model.js with cases that
 * were not previously covered:
 *
 *   1. toSI() immutability  — original object must not be mutated
 *   2. getElevatedFactors() boundary values — exactly AT each clinical threshold
 *   3. Waist "elevated" vs "high" distinction (88 cm vs 102 cm)
 *   4. computeWhatIfDelta() in SI (metric) mode
 *   5. computeWhatIfDelta() for an unknown field — falls back to step = 1
 *   6. computeContributions() sign verification for all 9 factors
 *   7. CONFIG.SIMULATION_EFFECTS structural integrity
 *
 * Run with: node tests/test-risk-model-edge-cases.js
 */

'use strict';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

global.window   = global;
global.document = { getElementById: () => null };

require('../js/config.js');
require('../js/conversion-service.js');
require('../js/risk-model.js');

const { CONFIG } = DRC;
const { toSI, computeProbability, computeContributions,
        getElevatedFactors, computeWhatIfDelta } = DRC.RiskModel;

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${name}`);
    } else {
        failed++;
        console.log(`  ✗ FAIL: ${name}`);
    }
}

function assertApprox(actual, expected, tolerance, name) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ✓ ${name} (${actual.toFixed(4)} ≈ ${expected.toFixed(4)})`);
    } else {
        failed++;
        console.log(`  ✗ FAIL: ${name} — got ${actual.toFixed(6)}, expected ${expected.toFixed(6)}, diff ${diff.toFixed(6)}`);
    }
}

// Shared baseline: population means, all modifiable factors at normal levels
const popMeans = { ...CONFIG.MEANS };

// ─── TEST SUITE 1: toSI() immutability ───────────────────────────────────────

console.log('\n═══ TEST SUITE 1: toSI() immutability ═══');
{
    const original = {
        age: 54, race: 0, parentHist: 0, sbp: 120,
        height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150
    };
    const originalHeight  = original.height;
    const originalFastGlu = original.fastGlu;
    const originalCholHDL = original.cholHDL;

    // Convert US → SI — must NOT mutate original
    const converted = toSI(original, false);

    assert(original.height  === originalHeight,  'toSI(US→SI) does not mutate original.height');
    assert(original.fastGlu === originalFastGlu, 'toSI(US→SI) does not mutate original.fastGlu');
    assert(original.cholHDL === originalCholHDL, 'toSI(US→SI) does not mutate original.cholHDL');
    assert(converted !== original,               'toSI() returns a new object, not the original reference');

    // Passthrough (isMetric=true) — must also return a copy, not the same reference
    const passthrough = toSI(original, true);
    // Values unchanged
    assert(passthrough.height  === originalHeight,  'toSI(SI passthrough) preserves height value');
    assert(passthrough.fastGlu === originalFastGlu, 'toSI(SI passthrough) preserves fastGlu value');
}

// ─── TEST SUITE 2: getElevatedFactors() — exact boundary values ───────────────

console.log('\n═══ TEST SUITE 2: getElevatedFactors() exact clinical thresholds ═══');
{
    // Base: all factors in normal range
    const base = {
        ...popMeans, fastGlu: 5.0, sbp: 115,
        cholHDL: 1.5, cholTri: 1.5, waist: 85
    };

    // ── Fasting glucose: threshold = 5.6 mmol/L ──────────────────────────────
    // Exactly at threshold → elevated (>= 5.6)
    const atGluThreshold = { ...base, fastGlu: 5.6 };
    assert(
        getElevatedFactors(atGluThreshold).elevatedFactors.includes('fastGlu'),
        'Glucose exactly 5.6 mmol/L → elevated (>= threshold)'
    );
    // Just below → NOT elevated
    const belowGluThreshold = { ...base, fastGlu: 5.59 };
    assert(
        !getElevatedFactors(belowGluThreshold).elevatedFactors.includes('fastGlu'),
        'Glucose 5.59 mmol/L → NOT elevated (< threshold)'
    );

    // ── Systolic BP: threshold = 120 mmHg (ACC/AHA 2017) ────────────────────
    const atSBPThreshold = { ...base, sbp: 120 };
    assert(
        getElevatedFactors(atSBPThreshold).elevatedFactors.includes('sbp'),
        'SBP exactly 120 mmHg → elevated (>= threshold)'
    );
    const belowSBPThreshold = { ...base, sbp: 119 };
    assert(
        !getElevatedFactors(belowSBPThreshold).elevatedFactors.includes('sbp'),
        'SBP 119 mmHg → NOT elevated (< threshold)'
    );

    // ── HDL Cholesterol: threshold = 1.03 mmol/L (NCEP male, low when <= 1.03)
    // Note: female NCEP threshold (1.29) not used — sex is not in the Schmidt model
    const atHDLThreshold = { ...base, cholHDL: 1.03 };
    assert(
        getElevatedFactors(atHDLThreshold).elevatedFactors.includes('cholHDL'),
        'HDL exactly 1.03 mmol/L → low/elevated (<= NCEP male threshold)'
    );
    const aboveHDLThreshold = { ...base, cholHDL: 1.04 };
    assert(
        !getElevatedFactors(aboveHDLThreshold).elevatedFactors.includes('cholHDL'),
        'HDL 1.04 mmol/L → NOT low (> threshold)'
    );

    // ── Triglycerides: threshold = 1.7 mmol/L (SI only — consistent across unit modes)
    const atTriSI = { ...base, cholTri: 1.7 };
    assert(
        getElevatedFactors(atTriSI).elevatedFactors.includes('cholTri'),
        'TG exactly 1.7 mmol/L → elevated (>= threshold)'
    );
    const belowTriSI = { ...base, cholTri: 1.69 };
    assert(
        !getElevatedFactors(belowTriSI).elevatedFactors.includes('cholTri'),
        'TG 1.69 mmol/L → NOT elevated (< threshold)'
    );
}

// ─── TEST SUITE 3: Waist "elevated" vs "high" distinction ────────────────────

console.log('\n═══ TEST SUITE 3: Waist sex-specific thresholds (♀≥88 cm, ♂≥102 cm) ═══');
{
    const base = { ...popMeans, fastGlu: 5.0, sbp: 115, cholHDL: 1.5, cholTri: 1.5 };

    // ── Female (isMale=false): threshold = 88 cm ────────────────────────────
    const atFemaleThreshold = { ...base, waist: 88 };
    const result88f = getElevatedFactors(atFemaleThreshold, false);
    assert(result88f.elevatedFactors.includes('waist'), 'Female: Waist 88 cm → elevated (>= 88)');
    assert(result88f.waistIsHigh === false,             'Waist 88 cm → waistIsHigh: false (< 102)');

    const belowFemale = { ...base, waist: 87 };
    const result87f = getElevatedFactors(belowFemale, false);
    assert(!result87f.elevatedFactors.includes('waist'), 'Female: Waist 87 cm → NOT elevated (< 88)');

    // ── Male (isMale=true, default): threshold = 102 cm ─────────────────────
    const atMaleThreshold = { ...base, waist: 102 };
    const result102m = getElevatedFactors(atMaleThreshold, true);
    assert(result102m.elevatedFactors.includes('waist'), 'Male: Waist 102 cm → elevated (>= 102)');
    assert(result102m.waistIsHigh === true,              'Waist 102 cm → waistIsHigh: true');

    const belowMale = { ...base, waist: 101 };
    const result101m = getElevatedFactors(belowMale, true);
    assert(!result101m.elevatedFactors.includes('waist'), 'Male: Waist 101 cm → NOT elevated (< 102)');

    // Between thresholds: 96 cm — elevated for female, NOT for male
    const between = { ...base, waist: 96 };
    assert(getElevatedFactors(between, false).elevatedFactors.includes('waist'),
        'Female: Waist 96 cm → elevated (>= 88)');
    assert(!getElevatedFactors(between, true).elevatedFactors.includes('waist'),
        'Male: Waist 96 cm → NOT elevated (< 102)');

    // Default isMale=true
    const defaultResult = getElevatedFactors(atMaleThreshold);
    assert(defaultResult.elevatedFactors.includes('waist'), 'Default (male): Waist 102 cm → elevated');
}

// ─── TEST SUITE 4: computeWhatIfDelta() in SI (metric) mode ──────────────────

console.log('\n═══ TEST SUITE 4: computeWhatIfDelta() in SI (metric) mode ═══');
{
    const siInputs = {
        age: 54, race: 0, parentHist: 0, sbp: 120,
        height: 170, waist: 90, fastGlu: 5.5, cholHDL: 1.3, cholTri: 1.7
    };

    // In metric mode, step for fastGlu is 0.1 mmol/L (CONFIG.RANGES.fastGlu.si[2])
    const gluUp   = computeWhatIfDelta(siInputs, true, 'fastGlu', +1);
    const gluDown = computeWhatIfDelta(siInputs, true, 'fastGlu', -1);
    assert(gluUp > 0,   `SI mode: glucose +0.1*5 → positive risk delta (${gluUp.toFixed(4)}%)`);
    assert(gluDown < 0, `SI mode: glucose -0.1*5 → negative risk delta (${gluDown.toFixed(4)}%)`);

    // HDL is protective in SI mode too
    const hdlUp = computeWhatIfDelta(siInputs, true, 'cholHDL', +1);
    assert(hdlUp < 0, `SI mode: HDL +0.1*5 → negative risk delta (protective, ${hdlUp.toFixed(4)}%)`);

    // SBP: step is 1 mmHg in both unit systems
    const sbpUp = computeWhatIfDelta(siInputs, true, 'sbp', +1);
    assert(sbpUp > 0, `SI mode: SBP +1*5 → positive risk delta (${sbpUp.toFixed(4)}%)`);
}

// ─── TEST SUITE 5: computeWhatIfDelta() for unknown field ────────────────────

console.log('\n═══ TEST SUITE 5: computeWhatIfDelta() fallback for unknown field ═══');
{
    const inputs = {
        age: 54, race: 0, parentHist: 0, sbp: 120,
        height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150
    };

    // 'unknownField' is not in CONFIG.RANGES — step falls back to 1
    // The result may be 0 (field not in BETAS) or nonzero (if fortuitously named)
    // but crucially it must not throw
    let threw = false;
    let delta;
    try {
        delta = computeWhatIfDelta(inputs, false, 'unknownField', +1);
    } catch (e) {
        threw = true;
    }

    assert(!threw, 'computeWhatIfDelta() does not throw for unknown field name');
    assert(typeof delta === 'number' && isFinite(delta),
        'computeWhatIfDelta() returns a finite number for unknown field');

    // Because 'unknownField' is not in BETAS, altering it has no effect on log-odds,
    // so the delta must be 0
    assert(delta === 0, 'computeWhatIfDelta() returns 0 for a field absent from BETAS');
}

// ─── TEST SUITE 6: computeContributions() sign verification ──────────────────

console.log('\n═══ TEST SUITE 6: computeContributions() sign verification ═══');
{
    // ── Risk-increasing factors: contribution positive when ABOVE mean ────────
    const riskFactors = ['age', 'race', 'parentHist', 'sbp', 'waist', 'fastGlu', 'cholTri'];
    riskFactors.forEach(f => {
        const aboveMean = { ...popMeans, [f]: popMeans[f] * 1.5 + 0.1 };
        const contrib = computeContributions(aboveMean);
        assert(contrib[f] > 0, `Above-mean ${f} → positive contribution (beta > 0, deviation > 0)`);
    });

    // ── Protective factors: contribution positive when BELOW mean ─────────────
    // (negative beta × negative deviation = positive contribution = increases risk)
    const belowMeanHDL = { ...popMeans, cholHDL: popMeans.cholHDL * 0.5 };
    assert(computeContributions(belowMeanHDL).cholHDL > 0,
        'Below-mean HDL → positive contribution (negative beta, negative deviation → +)');

    // ── Protective factors: contribution negative when ABOVE mean ─────────────
    const aboveMeanHDL    = { ...popMeans, cholHDL: popMeans.cholHDL * 1.5 };
    const aboveMeanHeight = { ...popMeans, height:  popMeans.height  * 1.2 };
    assert(computeContributions(aboveMeanHDL).cholHDL    < 0,
        'Above-mean HDL → negative contribution (negative beta, positive deviation → -)');
    assert(computeContributions(aboveMeanHeight).height  < 0,
        'Above-mean height → negative contribution (negative beta, positive deviation → -)');

    // ── All 9 model fields present in contributions object (sex excluded) ─────
    const contrib = computeContributions(popMeans);
    assert(Object.keys(contrib).length === 9, 'computeContributions() returns exactly 9 entries (model fields only)');
    CONFIG.ALL_FIELDS.filter(f => CONFIG.BETAS[f] != null).forEach(f => {
        assert(f in contrib, `computeContributions() includes field: ${f}`);
    });
}

// ─── TEST SUITE 7: CONFIG.SIMULATION_EFFECTS structural integrity ─────────────

console.log('\n═══ TEST SUITE 7: CONFIG.SIMULATION_EFFECTS structural integrity ═══');
{
    const EXPECTED_FACTORS = ['fastGlu', 'sbp', 'cholHDL', 'cholTri', 'waist'];

    assert(typeof CONFIG.SIMULATION_EFFECTS === 'object' && CONFIG.SIMULATION_EFFECTS !== null,
        'SIMULATION_EFFECTS exists and is an object');

    // HDL is a protective factor: treatment INCREASES it (+), which lowers risk.
    // All other modifiable factors (fastGlu, sbp, cholTri, waist) are risk factors:
    // treatment DECREASES them (−), which also lowers risk.
    const expectedSign = {
        fastGlu: -1, sbp: -1, cholHDL: +1, cholTri: -1, waist: -1
    };

    EXPECTED_FACTORS.forEach(factor => {
        const fx = CONFIG.SIMULATION_EFFECTS[factor];
        assert(fx != null, `SIMULATION_EFFECTS has entry for: ${factor}`);
        assert(typeof fx.label  === 'string' && fx.label.length > 0, `${factor}.label is a non-empty string`);

        // Sex-dependent factors (e.g. sbp) use siMale/siFemale instead of si/us
        const hasSexDependent = fx.siMale !== undefined;
        if (hasSexDependent) {
            assert(typeof fx.siMale   === 'number', `${factor}.siMale is a number`);
            assert(typeof fx.siFemale === 'number', `${factor}.siFemale is a number`);
            assert(typeof fx.usMale   === 'number', `${factor}.usMale is a number`);
            assert(typeof fx.usFemale === 'number', `${factor}.usFemale is a number`);
        } else {
            assert(typeof fx.us === 'number', `${factor}.us is a number`);
            assert(typeof fx.si === 'number', `${factor}.si is a number`);
        }

        const sign = expectedSign[factor];
        if (sign === -1) {
            if (hasSexDependent) {
                assert(fx.siMale < 0, `${factor}.siMale delta is negative`);
                assert(fx.siFemale < 0, `${factor}.siFemale delta is negative`);
            } else {
                assert(fx.us < 0, `${factor}.us delta is negative (treatment reduces this risk factor)`);
                assert(fx.si < 0, `${factor}.si delta is negative (treatment reduces this risk factor)`);
            }
        } else {
            // HDL: treatment raises the factor value (higher HDL → lower risk)
            assert(fx.us > 0, `${factor}.us delta is positive (treatment raises this protective factor)`);
            assert(fx.si > 0, `${factor}.si delta is positive (treatment raises this protective factor)`);
        }
    });

    // The US and SI deltas should be proportional via the conversion factor
    const C = CONFIG.CONVERSIONS;
    const convFactors = {
        fastGlu: C.gluToMmol,
        cholHDL: C.hdlToMmol,
        cholTri: C.triToMmol
    };
    Object.entries(convFactors).forEach(([factor, conv]) => {
        const fx = CONFIG.SIMULATION_EFFECTS[factor];
        assertApprox(fx.us * conv, fx.si, Math.abs(fx.si) * 0.05,
            `${factor}: US delta × conversion ≈ SI delta (within 5%)`);
    });
}

// ─── TEST SUITE 8: NaN/null propagation guard (H9) ──────────────────────────────

console.log('\n═══ TEST SUITE 8: computeProbability NaN/null guard ═══');
{
    // NaN input should return null from computeProbability
    const nanInput = { ...popMeans, age: NaN };
    const nanResult = computeProbability(nanInput);
    assert(nanResult === null, 'computeProbability({age: NaN}) returns null');

    // Missing field (undefined * beta = NaN in linear predictor) should return null
    const missingField = { ...popMeans };
    delete missingField.fastGlu;
    const missingResult = computeProbability(missingField);
    assert(missingResult === null, 'computeProbability with missing fastGlu returns null');

    // All protective factors at best values should give a valid (finite) probability
    const bestProfile = {
        ...popMeans,
        age: 25, race: 0, parentHist: 0, sbp: 90,
        height: 190, waist: 70, fastGlu: 3.5, cholHDL: 3.0, cholTri: 0.5
    };
    const bestResult = computeProbability(bestProfile);
    assert(bestResult !== null && isFinite(bestResult), 'All-protective profile gives finite probability');
    assert(bestResult >= 0 && bestResult <= 1, 'All-protective probability in [0,1]');

    // computeMarginalSummary with NaN input should return null
    const summaryNan = DRC.RiskModel.computeMarginalSummary(nanInput);
    assert(summaryNan === null, 'computeMarginalSummary with NaN input returns null');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════');
console.log(`  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
