/**
 * @fileoverview Configuration for the Cardiovascular Risk Calculator.
 *
 * Uses the General CVD Risk Prediction equation from the provided
 * gencardio_lipids.xls workbook. Continuous predictors are entered in the
 * workbook ranges and lipids are converted to mg/dL internally for the model.
 */

'use strict';

window.DRC = window.DRC || {};

const GENCARDIO_MODEL = Object.freeze({
    male: {
        baselineSurvival: 0.88936,
        meanSum: 23.9802,
        coefficients: {
            age: 3.06117,
            sbpUntreated: 1.93303,
            sbpTreated: 1.99881,
            totalChol: 1.12370,
            cholHDL: -0.93263,
            smoking: 0.65451,
            diabetes: 0.57367
        }
    },
    female: {
        baselineSurvival: 0.95012,
        meanSum: 26.1931,
        coefficients: {
            age: 2.32888,
            sbpUntreated: 2.76157,
            sbpTreated: 2.82263,
            totalChol: 1.20904,
            cholHDL: -0.70833,
            smoking: 0.52873,
            diabetes: 0.69154
        }
    }
});

DRC.CONFIG = Object.freeze({
    BETAS: {},

    MEANS: {
        age: 30,
        sex: 1,
        sbp: 125,
        trtBp: 0,
        smoking: 0,
        diabetes: 0,
        cholHDL: 45,
        totalChol: 180
    },

    NORMAL_VALUES: {
        age: 30,
        sex: 1,
        sbp: 110,
        trtBp: 0,
        smoking: 0,
        diabetes: 0,
        cholHDL: 60,
        totalChol: 160
    },

    CONVERSIONS: {
        hdlToMmol: 1 / 38.67,
        totalCholToMmol: 1 / 38.67
    },

    RANGES: {
        age:       { us: [30, 74, 1],      si: [30, 74, 1] },
        sbp:       { us: [90, 200, 1],     si: [90, 200, 1] },
        cholHDL:   { us: [20, 100, 1],     si: [0.5, 2.6, 0.1] },
        totalChol: { us: [130, 320, 1],    si: [3.4, 8.3, 0.1] }
    },

    LABELS: {
        age: 'Age',
        sex: 'Sex',
        sbp: 'Systolic Blood Pressure',
        trtBp: 'Treatment for Hypertension',
        smoking: 'Smoking',
        diabetes: 'Diabetes',
        cholHDL: 'HDL Cholesterol',
        totalChol: 'Total Cholesterol'
    },

    RADAR_LABELS: {
        age: 'Age',
        sbp: 'SBP',
        cholHDL: 'HDL',
        totalChol: 'Total-C',
        smoking: 'Smoking',
        diabetes: 'Diabetes'
    },

    THRESHOLDS: {
        sbp:       { elevated: 120, high: 130 },
        cholHDL:   { low: 40 / 38.67, high: 60 / 38.67 },
        totalChol: { elevated: 200 / 38.67, high: 240 / 38.67 }
    },

    HIGH_RISK_CUTOFF: 0.20,

    TREATMENTS: {
        sbp: {
            id: 'treatment-sbp',
            icon: 'heart-pulse',
            title: 'Blood Pressure Control',
            therapies: [
                {
                    name: 'Antihypertensive therapy',
                    desc: 'Medication review or intensification can lower systolic blood pressure; randomized evidence shows fewer cardiovascular events per 5 mmHg SBP reduction.'
                },
                {
                    name: 'DASH-style lifestyle',
                    desc: 'DASH nutrition, sodium reduction, weight management, regular activity, and lower alcohol intake can move blood pressure toward the healthy range.'
                }
            ]
        },
        totalChol: {
            id: 'treatment-total-chol',
            icon: 'flask-conical',
            title: 'Total Cholesterol Reduction',
            therapies: [
                {
                    name: 'LDL-lowering medication',
                    desc: 'Statins are first-line for cardiovascular risk reduction; each 1 mmol/L LDL-C reduction lowers major vascular events by about 22%.'
                },
                {
                    name: 'Heart-healthy diet',
                    desc: 'Replacing saturated fat, increasing fiber, and improving overall dietary quality supports lower atherogenic cholesterol.'
                }
            ]
        },
        cholHDL: {
            id: 'treatment-hdl',
            icon: 'droplets',
            title: 'HDL Support',
            therapies: [
                {
                    name: 'Regular physical activity',
                    desc: 'Aerobic and combined training can modestly raise HDL and improves cardiovascular risk through several pathways.'
                },
                {
                    name: 'Treat the causes',
                    desc: 'Weight management, smoking cessation, and triglyceride/LDL management are preferred; medication solely to raise HDL has not reliably reduced events.'
                }
            ]
        },
        smoking: {
            id: 'treatment-smoking',
            icon: 'cigarette',
            title: 'Smoking Cessation',
            therapies: [
                {
                    name: 'Structured quit support',
                    desc: 'Behavioral counseling plus nicotine replacement, varenicline, or bupropion improves quit success and reduces cardiovascular risk.'
                },
                {
                    name: 'Long-term prevention',
                    desc: 'Avoiding relapse is important because cardiovascular risk falls within years after quitting but can remain elevated for a decade or more.'
                }
            ]
        }
    },
    SIMULATION_EFFECTS: {
        sbp: {
            label: 'Move systolic blood pressure into the green range',
            us: -10,
            si: -10,
            targetUs: 110,
            targetSi: 110
        },
        totalChol: {
            label: 'Move total cholesterol into the green range',
            us: -40,
            si: -1.0,
            targetUs: 160,
            targetSi: 4.1
        },
        cholHDL: {
            label: 'Move HDL cholesterol into the green range',
            us: 10,
            si: 0.3,
            targetUs: 60,
            targetSi: 1.6
        },
        smoking: {
            label: 'Switch smoking status to non-smoker',
            us: -1,
            si: -1,
            target: 0,
            binary: true
        }
    },
    CAUSALITY_CHAINS: {},

    DEFAULTS: {
        age: 50,
        sex: true,
        sbp: 120,
        trtBp: false,
        smoking: false,
        diabetes: false,
        cholHDL: { us: 50, si: 1.3 },
        totalChol: { us: 180, si: 4.7 }
    },

    ALL_FIELDS: ['age', 'sex', 'sbp', 'trtBp', 'smoking', 'diabetes', 'cholHDL', 'totalChol'],
    SLIDER_FIELDS: ['age', 'sbp', 'cholHDL', 'totalChol'],
    CONVERTIBLE_FIELDS: ['cholHDL', 'totalChol'],

    TREATMENT_COLORS: {},

    ANIMATION_DURATION: 1500,
    ANIMATION_STEPS: 30,
    ANIMATION_FLASH_MS: 1200,
    BADGE_TIMEOUT_MS: 2000,
    TOOLTIP_TIMEOUT_MS: 1200,
    MAX_SNAPSHOTS: 20,
    MIN_Y_AXIS: 25,

    DEFAULT_MODEL: 'gencardioLipids',

    MODELS: {
        gencardioLipids: {
            id: 'gencardioLipids',
            name: 'General CVD + Lipids',
            description: '10-year cardiovascular risk with lipids',
            accuracy: 'beste',
            accuracyLabel: 'Best',
            framingham: GENCARDIO_MODEL,
            fields: ['age', 'sex', 'sbp', 'trtBp', 'smoking', 'diabetes', 'cholHDL', 'totalChol'],
            sliderFields: ['age', 'sbp', 'cholHDL', 'totalChol'],
            treatmentFields: ['sbp', 'totalChol', 'cholHDL', 'smoking'],
            radarFields: ['age', 'sbp', 'totalChol', 'cholHDL', 'smoking', 'diabetes']
        }
    }
});
