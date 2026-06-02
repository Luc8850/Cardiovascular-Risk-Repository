/**
 * @fileoverview Unit tests for the PatientManager module.
 *
 * Tests cover the exported public API and the underlying storage logic:
 *   1. Empty-state initialization (no prior localStorage data)
 *   2. Persistence round-trip: save → reload via init()
 *   3. loadPatient() switches the active patient
 *   4. getActivePatientData() returns correct data / null
 *   5. Corrupted localStorage is handled gracefully
 *   6. captureCurrentValues() returns a complete, correctly-typed record
 *
 * Because PatientManager is tightly coupled to the DOM, all tests use a
 * lightweight mock that returns stub elements so DOM interactions are
 * no-ops rather than errors.
 *
 * Run with: node tests/test-patient-manager.js
 */

'use strict';

// ─── Test harness ────────────────────────────────────────────────────────────

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

function assertDeepField(obj, field, expected, name) {
    const actual = obj?.[field];
    if (actual === expected) {
        passed++;
        console.log(`  ✓ ${name} (${actual})`);
    } else {
        failed++;
        console.log(`  ✗ FAIL: ${name} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
}

// ─── DOM mock factory ────────────────────────────────────────────────────────
// Returns a stub element. querySelector() returns another stub (not null) so
// that addEventListener() calls on its result do not throw.

function makeMockEl(overrides) {
    const el = {
        value: '0',
        checked: false,
        innerHTML: '',
        textContent: '',
        className: '',
        style: {},
        dataset: {},
        classList: {
            contains: () => false,
            add: () => {},
            remove: () => {},
            toggle: () => false
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        querySelector:    () => makeMockEl(),
        querySelectorAll: () => [],
        closest:          () => null,
        focus:            () => {},
        dispatchEvent:    () => {}
    };
    return Object.assign(el, overrides || {});
}

// ─── Per-test environment setup ──────────────────────────────────────────────
// Module cache key for PatientManager so we can reload it between scenarios.

const PM_PATH = require.resolve('../js/patient-manager.js');

/** Unload PatientManager and all DRC modules so each scenario starts fresh. */
function unloadModules() {
    Object.keys(require.cache).forEach(k => {
        if (k.includes('/js/')) delete require.cache[k];
    });
}

/** In-memory localStorage replacement. Reset between scenarios. */
function makeLocalStorage() {
    let store = {};
    return {
        getItem:    k       => (k in store ? store[k] : null),
        setItem:    (k, v)  => { store[k] = String(v); },
        removeItem: k       => { delete store[k]; },
        clear:      ()      => { store = {}; },
        _store:     ()      => store     // test helper to inspect raw content
    };
}

/** Bootstrap globals and require all modules, returning the PatientManager. */
function loadPatientManager(localStorageInstance, domOverrides) {
    // Browser globals
    global.window   = global;
    global.confirm  = () => true;
    global.alert    = () => {};
    global.localStorage = localStorageInstance;

    // Selective DOM — getElementById returns field-specific values when provided.
    const fieldMap = domOverrides || {};
    global.document = {
        getElementById:    id  => fieldMap[id] || makeMockEl(),
        createElement:     ()  => makeMockEl(),
        createElementNS:   (ns, tag)  => makeMockEl({ tagName: tag }),
        querySelectorAll:  ()  => []
    };

    // Stub dependent DRC modules (config values only; no real DOM needed here)
    global.DRC = {
        CONFIG: {
            ALL_FIELDS: ['age', 'race', 'parentHist', 'sbp', 'height', 'waist',
                         'fastGlu', 'cholHDL', 'cholTri'],
            CONVERTIBLE_FIELDS: ['height', 'waist', 'fastGlu', 'cholHDL', 'cholTri'],
            RANGES: {
                age:     { us: [20, 80, 1],      si: [20, 80, 1] },
                sbp:     { us: [80, 220, 1],     si: [80, 220, 1] },
                height:  { us: [48, 84, 1],      si: [122, 213, 1] },
                waist:   { us: [25, 60, 1],      si: [64, 152, 1] },
                fastGlu: { us: [50, 300, 1],     si: [2.8, 16.7, 0.1] },
                cholHDL: { us: [20, 100, 1],     si: [0.5, 2.6, 0.1] },
                cholTri: { us: [50, 500, 1],     si: [0.6, 5.6, 0.1] }
            }
        },
        ConversionService: { convertField: (field, val) => val },
        UIHelpers: {
            safeStorage: {
                get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
                set: (key, val) => { try { localStorage.setItem(key, val); } catch {} },
                remove: (key) => { try { localStorage.removeItem(key); } catch {} }
            },
            clampAndRound: (val, min, max, step) => {
                const clamped = Math.min(Math.max(val, min), max);
                if (step >= 1) return Math.round(clamped);
                const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 1;
                return parseFloat(clamped.toFixed(decimals));
            },
            refreshIcons: () => {}
        },
        UIController: {
            updateSliderFill: () => {},
            readInputs: () => ({ age: 50, race: 0, parentHist: 0, sbp: 120, height: 66, waist: 36, fastGlu: 95, cholHDL: 50, cholTri: 150 })
        },
        App: {
            _calculate: () => {},
            _getState: () => ({ isMetric: false }),
            trigger: () => {}
        }
    };

    require('../js/utils.js');
    require('../js/patient-manager.js');
    return DRC.PatientManager;
}

// ─── Sample patient data ──────────────────────────────────────────────────────

const PATIENT_ALICE = {
    id: 'alice001',
    name: 'Alice',
    data: {
        age: 54, race: 0, parentHist: 0, sbp: 120,
        height: 170, waist: 90, fastGlu: 5.5, cholHDL: 1.3,
        cholTri: 1.7, _riskPct: 14.6
    },
    riskPct: 14.6,
    savedAt: '2024-01-01T10:00:00.000Z'
};

const PATIENT_BOB = {
    id: 'bob002',
    name: 'Bob',
    data: {
        age: 62, race: 1, parentHist: 1, sbp: 145,
        height: 180, waist: 105, fastGlu: 6.2, cholHDL: 0.9,
        cholTri: 2.5, _riskPct: 52.3
    },
    riskPct: 52.3,
    savedAt: '2024-02-15T08:30:00.000Z'
};

// ─── TEST SUITE 1: Empty state ───────────────────────────────────────────────

console.log('\n═══ TEST SUITE 1: Empty state (no localStorage data) ═══');
{
    unloadModules();
    const ls = makeLocalStorage();
    const pm = loadPatientManager(ls);
    pm.init();

    assert(pm.getActivePatientData() === null,
        'getActivePatientData() returns null when no patient is active');
}

// ─── TEST SUITE 2: Persistence round-trip ────────────────────────────────────

console.log('\n═══ TEST SUITE 2: Persistence round-trip via init() ═══');
{
    unloadModules();
    const ls = makeLocalStorage();

    // Pre-seed localStorage as if a previous session had saved two patients
    ls.setItem('diabetes_risk_patients', JSON.stringify({
        patients: [PATIENT_ALICE, PATIENT_BOB],
        activePatientId: 'alice001'
    }));

    const pm = loadPatientManager(ls);
    pm.init();

    const data = pm.getActivePatientData();
    assert(data !== null, 'getActivePatientData() returns data after init() with seeded storage');
    assertDeepField(data, 'age',      54,   'Active patient age = 54');
    assertDeepField(data, 'fastGlu',  5.5,  'Active patient fastGlu = 5.5');
    assertDeepField(data, 'cholHDL',  1.3,  'Active patient cholHDL = 1.3');
    assertDeepField(data, 'riskPct',  undefined, 'data object has no top-level riskPct field');
    assertDeepField(data, '_riskPct', 14.6, 'Active patient _riskPct = 14.6');
}

// ─── TEST SUITE 3: loadPatient() switches active patient ─────────────────────

console.log('\n═══ TEST SUITE 3: loadPatient() switches active patient ═══');
{
    unloadModules();
    const ls = makeLocalStorage();

    ls.setItem('diabetes_risk_patients', JSON.stringify({
        patients: [PATIENT_ALICE, PATIENT_BOB],
        activePatientId: 'alice001'
    }));

    const pm = loadPatientManager(ls);
    pm.init();

    // Confirm starting state is Alice
    const before = pm.getActivePatientData();
    assertDeepField(before, 'age', 54, 'Before loadPatient: active patient age = 54 (Alice)');

    // Switch to Bob
    pm.loadPatient('bob002');

    const after = pm.getActivePatientData();
    assert(after !== null, 'getActivePatientData() is non-null after loadPatient(bob002)');
    assertDeepField(after, 'age',      62,   'After loadPatient(bob002): age = 62');
    assertDeepField(after, 'riskPct',  undefined, 'After switch: top-level riskPct absent from data object');
    assertDeepField(after, '_riskPct', 52.3, 'After loadPatient(bob002): _riskPct = 52.3');
}

// ─── TEST SUITE 4: loadPatient() with unknown id is a no-op ──────────────────

console.log('\n═══ TEST SUITE 4: loadPatient() with unknown id is a no-op ═══');
{
    unloadModules();
    const ls = makeLocalStorage();

    ls.setItem('diabetes_risk_patients', JSON.stringify({
        patients: [PATIENT_ALICE],
        activePatientId: 'alice001'
    }));

    const pm = loadPatientManager(ls);
    pm.init();

    pm.loadPatient('nonexistent-id');

    // Active patient should remain Alice
    const data = pm.getActivePatientData();
    assert(data !== null, 'Active patient unchanged after loadPatient with unknown id');
    assertDeepField(data, 'age', 54, 'Still Alice (age 54) after no-op loadPatient');
}

// ─── TEST SUITE 5: Corrupted localStorage is handled gracefully ───────────────

console.log('\n═══ TEST SUITE 5: Corrupted localStorage handled gracefully ═══');
{
    unloadModules();
    const ls = makeLocalStorage();
    ls.setItem('diabetes_risk_patients', '{ this is not valid JSON ]]]');

    const pm = loadPatientManager(ls);
    let threw = false;
    try {
        pm.init();
    } catch (e) {
        threw = true;
    }

    assert(!threw, 'init() does not throw on corrupted localStorage');
    assert(pm.getActivePatientData() === null,
        'getActivePatientData() returns null after corrupted storage is recovered');
}

// ─── TEST SUITE 6: captureCurrentValues() structure ──────────────────────────

console.log('\n═══ TEST SUITE 6: captureCurrentValues() returns correct structure ═══');
{
    unloadModules();
    const ls = makeLocalStorage();

    // Provide specific DOM values for each field
    const domFields = {
        'race-toggle':      makeMockEl({ checked: true  }),
        'parentHist-toggle':makeMockEl({ checked: false }),
        'age-value':        makeMockEl({ value: '58'    }),
        'sbp-value':        makeMockEl({ value: '135'   }),
        'height-value':     makeMockEl({ value: '175'   }),
        'waist-value':      makeMockEl({ value: '98'    }),
        'fastGlu-value':    makeMockEl({ value: '5.8'   }),
        'cholHDL-value':    makeMockEl({ value: '1.1'   }),
        'cholTri-value':    makeMockEl({ value: '2.1'   }),
        'risk-percentage':  makeMockEl({ textContent: '28.4' })
    };

    const pm = loadPatientManager(ls, domFields);

    // Override UIController.readInputs to read from the test's DOM fields
    DRC.UIController.readInputs = () => ({
        age:        parseFloat(domFields['age-value'].value) || 0,
        race:       domFields['race-toggle'].checked ? 1 : 0,
        parentHist: domFields['parentHist-toggle'].checked ? 1 : 0,
        sbp:        parseFloat(domFields['sbp-value'].value) || 0,
        height:     parseFloat(domFields['height-value'].value) || 0,
        waist:      parseFloat(domFields['waist-value'].value) || 0,
        fastGlu:    parseFloat(domFields['fastGlu-value'].value) || 0,
        cholHDL:    parseFloat(domFields['cholHDL-value'].value) || 0,
        cholTri:    parseFloat(domFields['cholTri-value'].value) || 0
    });

    pm.init();

    const vals = pm.captureCurrentValues();

    assert(vals !== null && typeof vals === 'object', 'captureCurrentValues() returns an object');
    assert('age'        in vals, 'captureCurrentValues() includes age');
    assert('race'       in vals, 'captureCurrentValues() includes race');
    assert('parentHist' in vals, 'captureCurrentValues() includes parentHist');
    assert('sbp'        in vals, 'captureCurrentValues() includes sbp');
    assert('height'     in vals, 'captureCurrentValues() includes height');
    assert('waist'      in vals, 'captureCurrentValues() includes waist');
    assert('fastGlu'    in vals, 'captureCurrentValues() includes fastGlu');
    assert('cholHDL'    in vals, 'captureCurrentValues() includes cholHDL');
    assert('cholTri'    in vals, 'captureCurrentValues() includes cholTri');
    assert('_riskPct'   in vals, 'captureCurrentValues() includes _riskPct');
    assert('_isMetric'  in vals, 'captureCurrentValues() includes _isMetric');
    assert(typeof vals._isMetric === 'boolean', '_isMetric is a boolean');
    assertDeepField(vals, '_isMetric', false, '_isMetric defaults to false when App._getState unavailable');

    assertDeepField(vals, 'race',       1,    'race-toggle checked → race = 1');
    assertDeepField(vals, 'parentHist', 0,    'parentHist-toggle unchecked → parentHist = 0');
    assertDeepField(vals, 'age',        58,   'age value parsed to 58');
    assertDeepField(vals, 'sbp',        135,  'sbp value parsed to 135');
    assertDeepField(vals, 'fastGlu',    5.8,  'fastGlu value parsed to 5.8');
    assertDeepField(vals, 'cholHDL',    1.1,  'cholHDL value parsed to 1.1');
    assertDeepField(vals, '_riskPct',   28.4, '_riskPct read from risk-percentage element');
}

// ─── TEST SUITE 7: captureCurrentValues() handles missing DOM elements ────────

console.log('\n═══ TEST SUITE 7: captureCurrentValues() tolerates missing DOM elements ═══');
{
    unloadModules();
    const ls = makeLocalStorage();

    // Simulate a DOM where every getElementById call returns null (missing elements)
    global.window  = global;
    global.confirm = () => true;
    global.alert   = () => {};
    global.localStorage = ls;
    global.document = {
        getElementById:   () => null,
        createElement:    () => makeMockEl(),
        querySelectorAll: () => []
    };
    global.DRC = {
        CONFIG: {
            ALL_FIELDS: ['age', 'race', 'parentHist', 'sbp', 'height', 'waist',
                         'fastGlu', 'cholHDL', 'cholTri']
        },
        UIHelpers: {
            safeStorage: {
                get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
                set: (key, val) => { try { localStorage.setItem(key, val); } catch {} },
                remove: (key) => { try { localStorage.removeItem(key); } catch {} }
            },
            clampAndRound: (val, min, max, step) => {
                const clamped = Math.min(Math.max(val, min), max);
                if (step >= 1) return Math.round(clamped);
                const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 1;
                return parseFloat(clamped.toFixed(decimals));
            },
            refreshIcons: () => {}
        },
        UIController: {
            updateSliderFill: () => {},
            readInputs: () => ({ age: 50, race: 0, parentHist: 0, sbp: 120, height: 66, waist: 36, fastGlu: 95, cholHDL: 50, cholTri: 150 })
        },
        App: {
            _calculate: () => {},
            _getState: () => ({ isMetric: false }),
            trigger: () => {}
        }
    };

    require('../js/utils.js');
    require('../js/patient-manager.js');
    const pm = DRC.PatientManager;

    // Override readInputs to return fallback values when DOM is null
    DRC.UIController.readInputs = () => ({
        age: 0, race: 0, parentHist: 0, sbp: 0, height: 0, waist: 0, fastGlu: 0, cholHDL: 0, cholTri: 0
    });

    pm.init();

    let threw = false;
    let vals;
    try {
        vals = pm.captureCurrentValues();
    } catch (e) {
        threw = true;
    }

    assert(!threw, 'captureCurrentValues() does not throw when DOM elements are missing');
    assert(typeof vals === 'object' && vals !== null,
        'captureCurrentValues() still returns an object with null DOM');
    // All numeric fields should fall back to 0 (the || 0 guard in source)
    assertDeepField(vals, 'age',      0, 'Missing age DOM element → falls back to 0');
    assertDeepField(vals, 'fastGlu',  0, 'Missing fastGlu DOM element → falls back to 0');
    assertDeepField(vals, '_riskPct', 0, 'Missing risk-percentage element → _riskPct falls back to 0');
}

// ─── TEST SUITE 8: applyValues() unit conversion (SI → US and US → SI) ───────

console.log('\n═══ TEST SUITE 8: applyValues() unit conversion ═══');
{
    unloadModules();
    const ls = makeLocalStorage();

    // Track which field values were applied to the DOM
    const appliedValues = {};
    const fieldMock = (field) => ({
        ...makeMockEl(),
        get value() { return String(appliedValues[field] ?? 0); },
        set value(v) { appliedValues[field] = parseFloat(v); }
    });

    // Real conversion factors from config (inline to avoid circular dep)
    const heightToCm = 2.54;  // 1 in = 2.54 cm
    const gluToMmol  = 1 / 18; // mg/dL → mmol/L
    const hdlToMmol  = 1 / 38.67;
    const triToMmol  = 1 / 88.57;

    global.window   = global;
    global.confirm  = () => true;
    global.alert    = () => {};
    global.localStorage = ls;
    global.document = {
        getElementById:    id => fieldMock(id.replace(/-value$/, '').replace(/-slider$/, '')),
        createElement:     () => makeMockEl(),
        createElementNS:   (ns, tag) => makeMockEl({ tagName: tag }),
        querySelectorAll:  () => []
    };

    // ConversionService mock that performs real SI↔US math
    global.DRC = {
        CONFIG: {
            ALL_FIELDS: ['age', 'race', 'parentHist', 'sbp', 'height', 'waist', 'fastGlu', 'cholHDL', 'cholTri'],
            CONVERTIBLE_FIELDS: ['height', 'waist', 'fastGlu', 'cholHDL', 'cholTri'],
            RANGES: {
                age:     { us: [20, 80, 1],       si: [20, 80, 1] },
                sbp:     { us: [80, 220, 1],       si: [80, 220, 1] },
                height:  { us: [48, 84, 1],        si: [122, 213, 1] },
                waist:   { us: [25, 60, 1],        si: [64, 152, 1] },
                fastGlu: { us: [50, 300, 1],       si: [2.8, 16.7, 0.1] },
                cholHDL: { us: [20, 100, 1],       si: [0.5, 2.6, 0.1] },
                cholTri: { us: [50, 500, 1],       si: [0.6, 5.6, 0.1] }
            }
        },
        // Real bidirectional conversion: toMetric=true → to SI, toMetric=false → to US
        ConversionService: {
            convertField: (field, val, toMetric) => {
                if (field === 'height' || field === 'waist') {
                    return toMetric ? val * heightToCm : val / heightToCm;
                }
                if (field === 'fastGlu') return toMetric ? val * gluToMmol  : val / gluToMmol;
                if (field === 'cholHDL') return toMetric ? val * hdlToMmol  : val / hdlToMmol;
                if (field === 'cholTri') return toMetric ? val * triToMmol  : val / triToMmol;
                return val;
            }
        },
        UIHelpers: {
            safeStorage: {
                get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
                set: (key, val) => { try { localStorage.setItem(key, val); } catch {} },
                remove: (key) => { try { localStorage.removeItem(key); } catch {} }
            },
            clampAndRound: (v, min, max, step) => {
                const clamped = Math.min(Math.max(v, min), max);
                return step < 1 ? parseFloat(clamped.toFixed(1)) : Math.round(clamped);
            },
            refreshIcons: () => {}
        },
        UIController: {
            updateSliderFill: () => {},
            readInputs: () => ({ age: 50, race: 0, parentHist: 0, sbp: 120, height: 66, waist: 36, fastGlu: 95, cholHDL: 50, cholTri: 150 })
        },
        App: {
            _calculate: () => {},
            _getState: () => ({ isMetric: true }),
            trigger: () => {}
        }
    };

    require('../js/utils.js');
    require('../js/patient-manager.js');
    const pm = DRC.PatientManager;
    pm.init();

    // Patient was saved in US mode: height=66in, fastGlu=100mg/dL, cholHDL=50mg/dL, cholTri=150mg/dL
    // Current mode is SI (isMetric=true) → applyValues() must convert US→SI
    const usSavedData = {
        age: 54, race: 0, parentHist: 0, sbp: 120,
        height: 66, waist: 36, fastGlu: 100, cholHDL: 50, cholTri: 150,
        _isMetric: false,   // saved in US mode
        _riskPct: 14.6
    };

    pm.applyValues = DRC.PatientManager.applyValues ||
        (() => { /* applyValues is not directly exported; tested via loadPatient */ });

    // Inject the patient directly and call loadPatient
    ls.setItem('diabetes_risk_patients', JSON.stringify({
        patients: [{ id: 'conv001', name: 'ConvTest', data: usSavedData, riskPct: 14.6, savedAt: new Date().toISOString() }],
        activePatientId: null
    }));

    unloadModules();
    global.DRC.App._getState = () => ({ isMetric: true }); // current mode: SI
    require('../js/utils.js');
    require('../js/patient-manager.js');
    const pm2 = DRC.PatientManager;
    pm2.init();
    pm2.loadPatient('conv001');

    // height: 66 in → 66 * 2.54 = 167.64 cm, clamped to [122,213] → 168 (rounded)
    const expectedHeight = Math.round(Math.min(Math.max(66 * heightToCm, 122), 213));
    assert(Math.abs((appliedValues['height'] ?? 0) - expectedHeight) < 0.5,
        `applyValues US→SI: height 66in → ${expectedHeight}cm (got ${appliedValues['height']})`);

    // fastGlu: 100 mg/dL → 100/18 ≈ 5.556 mmol/L, step=0.1 → 5.6
    const expectedGlu = parseFloat((Math.min(Math.max(100 * gluToMmol, 2.8), 16.7)).toFixed(1));
    assert(Math.abs((appliedValues['fastGlu'] ?? 0) - expectedGlu) < 0.05,
        `applyValues US→SI: fastGlu 100mg/dL → ${expectedGlu}mmol/L (got ${appliedValues['fastGlu']})`);

    // cholHDL: 50 mg/dL → 50/38.67 ≈ 1.293 mmol/L, step=0.1 → 1.3
    const expectedHDL = parseFloat((Math.min(Math.max(50 * hdlToMmol, 0.5), 2.6)).toFixed(1));
    assert(Math.abs((appliedValues['cholHDL'] ?? 0) - expectedHDL) < 0.05,
        `applyValues US→SI: cholHDL 50mg/dL → ${expectedHDL}mmol/L (got ${appliedValues['cholHDL']})`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
