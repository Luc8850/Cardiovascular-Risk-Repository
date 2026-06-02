/**
 * Lab Report Parser - Pattern Matching fuer Laborwert-Erkennung
 *
 * Extrahiert Laborwerte aus OCR-Text mit robustem Pattern-Matching
 * fuer verschiedene Laborbericht-Formate (deutsch/englisch)
 *
 * @module DRC.LabReportParser
 */

(function() {
    'use strict';

    // Namespace initialisieren
    window.DRC = window.DRC || {};

    // Pattern-Definitionen fuer Laborwerte
    const VALUE_PATTERNS = {
        glucose: {
            patterns: [
                { regex: /(?:gluc(?:os|k)e|blutzucker|zucker)[^\n]{0,80}?nuechtern[^\n]{0,80}?(\d+[.,]?\d*)\s*(mg\/d?l|mg%|mmol\/l)?/i, priority: 10 },
                { regex: /(?:gluc(?:os|k)e|blutzucker|zucker)[^\n]*?(\d+[.,]?\d*)\s*(mg\/d?l|mg%|mmol\/l)?/i, priority: 8 },
                { regex: /(?:glucose|fasting)[^\n]*?(\d+[.,]?\d*)\s*(mg\/d?l|mg%|mmol\/l)?/i, priority: 8 },
                { regex: /\b(glucose|glukose|blutzucker)\b[^\n]*?(\d+[.,]?\d*)/i, priority: 5, group: 2 },
                { regex: /\bglucose\s*\|\s*(\d+[.,]?\d*)/i, priority: 7 }
            ],
            exclude: /urin|harn|urin.*zucker|urine/i,
            expectedRange: { min: 50, max: 500 }
        },

        hdl: {
            patterns: [
                { regex: /hdl[^a-z0-9]*(?:cholesterol|chol)[^\n]*?(\d+[.,]?\d*)\s*(mg\/d?l|mmol\/l)?/i, priority: 10 },
                { regex: /hdl-c[^\n]*?(\d+[.,]?\d*)/i, priority: 9 },
                { regex: /hdl[^\n]*?(\d+[.,]?\d*)\s*(mg\/d?l|mmol\/l)?/i, priority: 7 },
                { regex: /"gutes"[^\n]{0,80}?cholesterol[^\n]{0,80}?(\d+[.,]?\d*)/i, priority: 6 },
                { regex: /hdl[\s\|]+(\d+[.,]?\d*)/i, priority: 7 }
            ],
            exclude: /ldl|vldl|non-hdl|gesamt|total/i,
            expectedRange: { min: 10, max: 150 }
        },

        triglycerides: {
            patterns: [
                { regex: /(?:triglycerides?|triglyzeride|triacylglycerol)[^\n]*?(\d+[.,]?\d*)\s*(mg\/d?l|mmol\/l)?/i, priority: 10 },
                { regex: /\btg\b[^\n]*?(\d+[.,]?\d*)\s*(?!\s*\d{1,2}[\/:])\s*(mg\/d?l)?/i, priority: 8 },
                { regex: /triglyceride?[\s\|]+(\d+[.,]?\d*)/i, priority: 7 }
            ],
            expectedRange: { min: 30, max: 1000 }
        },

        sbp: {
            patterns: [
                { regex: /(?:rr|blutdruck|bd|bp|blood pressure)[^\n]*?(\d{2,3})\s*\/\s*\d{2,3}/i, priority: 10, group: 1 },
                { regex: /(?:systolisch|systolic)[^\n]*?(\d{2,3})/i, priority: 9 },
                { regex: /(\d{2,3})\s*\/\s*\d{2,3}\s*mmhg/i, priority: 8, group: 1 },
                { regex: /rr\s*sys[^\n]*?(\d{2,3})/i, priority: 7 }
            ],
            expectedRange: { min: 80, max: 220 }
        },

        waist: {
            patterns: [
                { regex: /(?:taillenumfang|taille|waist|waist circumference)[^\n]*?(\d{1,3})\s*(cm|in)?/i, priority: 10 },
                { regex: /(?:bauchumfang|bauch)[^\n]*?(\d{1,3})\s*(cm|in)?/i, priority: 8 },
                { regex: /waist[\s\|]+(\d{1,3})/i, priority: 7 }
            ],
            expectedRange: { min: 26, max: 200 }
        },

        age: {
            patterns: [
                { regex: /(?:alter|age)[^\n]*?(\d{1,3})/i, priority: 8 },
                { regex: /(?:geb\.|geburt|born)[^\n]*?(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i, priority: 6, isDOB: true }
            ],
            expectedRange: { min: 20, max: 80 }
        },

        sex: {
            patterns: [
                { regex: /(?:geschlecht|sex)[^\n]*?(m[äa]nnlich|male|weiblich|female)/i, priority: 10, mapping: { 'male': 1, 'männlich': 1, 'maennlich': 1, 'm': 1, 'female': 0, 'weiblich': 0, 'f': 0, 'w': 0 } },
                { regex: /\b(m[äa]nnlich|male)\b/i, priority: 7, mapping: { 'male': 1, 'männlich': 1, 'maennlich': 1, 'm': 1 } },
                { regex: /\b(weiblich|female)\b/i, priority: 7, mapping: { 'female': 0, 'weiblich': 0, 'f': 0 } }
            ],
            isDiscrete: true
        },

        patientName: {
            patterns: [
                // Priority 10: "Name: Mustermann, Max" format (Last, First)
                { regex: /(?:^|[\n])[^:\n]*?\bname\s*[:][\s]*([a-zäöüß]+[\s]*,[\s]*[a-zäöüß]+)/i, priority: 10, format: 'lastFirst' },
                // Priority 9: "Patient: Max Mustermann" or "Patientenname: Max Mustermann" - capture only two words
                { regex: /(?:patient(?:en)?(?:name)?)[\s:)-]+([a-zäöüß]+[\s]+[a-zäöüß]+)(?:\s|$|\n)/i, priority: 9 },
                // Priority 8: "Name: Mustermann" (single name/last name only)
                { regex: /(?:^|[\n])[^:\n]*?\bname\s*[:][\s]*([a-zäöüß]{2,20})(?:\s|$|\n)/i, priority: 8 },
                // Priority 6: Fallback "Name: Max Mustermann" (First Last) - capture only two words
                { regex: /(?:^|[\n])[^:\n]*?\bname\s*[:][\s]*([a-zäöüß]+[\s]+[a-zäöüß]+)(?:\s|$|\n)/i, priority: 6 }
            ],
            isString: true
        }
    };

    // Einheiten-Erkennung
    const UNIT_PATTERNS = {
        glucose: {
            'mg/dL': [/mg\/d?l/i, /mg%/i, /milligramm/i],
            'mmol/L': [/mmol\/l/i, /mmol/i]
        },
        hdl: {
            'mg/dL': [/mg\/d?l/i, /mg%/i],
            'mmol/L': [/mmol\/l/i, /mmol/i]
        },
        triglycerides: {
            'mg/dL': [/mg\/d?l/i, /mg%/i],
            'mmol/L': [/mmol\/l/i, /mmol/i]
        },
        waist: {
            'in': [/in/i, /inch/i, /zoll/i],
            'cm': [/cm/i, /centimeter/i, /zentimeter/i]
        }
    };

    // Konvertierungsfaktoren
    const CONVERSION_FACTORS = {
        glucose: { 'mmol/L': 18.018 },
        hdl: { 'mmol/L': 38.67 },
        triglycerides: { 'mmol/L': 88.57 }
    };

    /**
     * Parst eine Zahl aus einem String (mit deutschem/englischem Dezimaltrennzeichen)
     */
    function parseNumber(str) {
        if (!str) return null;
        const normalized = str
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^\d.]/g, '');
        const value = parseFloat(normalized);
        return isNaN(value) ? null : value;
    }

    /**
     * Erkennt die Einheit aus dem Text
     */
    function detectUnit(text, field) {
        const patterns = UNIT_PATTERNS[field];
        if (!patterns) return null;

        for (const [unit, unitPatterns] of Object.entries(patterns)) {
            for (const pattern of unitPatterns) {
                if (pattern.test(text)) {
                    return unit;
                }
            }
        }
        return null;
    }

    /**
     * Konvertiert einen Wert in die Basis-Einheit
     */
    function convertToBase(value, fromUnit, field) {
        if (!value || !fromUnit) return value;
        const factors = CONVERSION_FACTORS[field];
        if (!factors || !factors[fromUnit]) return value;
        return value * factors[fromUnit];
    }

    /**
     * Berechnet das Alter aus einem Geburtsdatum
     */
    function calculateAgeFromDOB(day, month, year) {
        const fullYear = year.length === 2 ? 1900 + parseInt(year) : parseInt(year);
        const dob = new Date(fullYear, parseInt(month) - 1, parseInt(day));
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    }

    /**
     * Normalizes patient name to "First Last" format
     */
    function normalizePatientName(rawName, format) {
        if (!rawName) return null;

        // Clean up whitespace and common artifacts
        let name = rawName
            .replace(/\s+/g, ' ')
            .replace(/[.,;]+$/, '')
            .trim();

        // Handle "Last, First" format
        if (format === 'lastFirst' || name.includes(',')) {
            const parts = name.split(',').map(p => p.trim());
            if (parts.length === 2) {
                return `${parts[1]} ${parts[0]}`;
            }
        }

        return name;
    }

    /**
     * Berechnet Konfidenz-Score fuer eine Extraktion
     */
    function calculateConfidence(field, match, pattern, rawText) {
        let score = pattern.priority * 10;
        if (pattern.priority >= 9) score += 10;

        // Skip unit detection for string fields
        if (!VALUE_PATTERNS[field]?.isString) {
            if (detectUnit(rawText.substring(match.index, match.index + 100), field)) {
                score += 10;
            }
        }

        const context = rawText.substring(Math.max(0, match.index - 50), match.index + 100);
        if (/labor|untersuchung|befund|laboratory|test|parameter|reference|norm/i.test(context)) {
            score += 5;
        }

        // Bonus for name-specific context
        if (field === 'patientName' && /patient|name|person/i.test(context)) {
            score += 5;
        }

        if (/[^\w\s\d.,\/\-()%|äöüßÄÖÜ]/i.test(context)) {
            score -= 5;
        }
        return Math.min(100, Math.max(0, score));
    }

    /**
     * Hauptfunktion: Extrahiert Laborwerte aus OCR-Text
     */
    function extractValues(ocrText) {
        if (!ocrText || typeof ocrText !== 'string') {
            return { values: {}, confidence: {}, units: {}, rawText: '' };
        }

        const results = {};
        const confidence = {};
        const units = {};

        const normalizedText = ocrText
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+/g, ' ');

        for (const [field, config] of Object.entries(VALUE_PATTERNS)) {
            let bestMatch = null;
            let bestConfidence = 0;
            let matchedValue = null;
            let matchedUnit = null;
            let matchedFormat = null;

            for (const pattern of config.patterns) {
                const regex = new RegExp(pattern.regex.source, 'gi');
                let match;

                while ((match = regex.exec(normalizedText)) !== null) {
                    if (config.exclude) {
                        const context = normalizedText.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30);
                        if (config.exclude.test(context)) continue;
                    }

                    let value;
                    if (pattern.isDOB) {
                        value = calculateAgeFromDOB(match[1], match[2], match[3]);
                    } else if (pattern.mapping) {
                        const key = (match[1] || match[0]).toLowerCase().trim();
                        value = pattern.mapping[key];
                    } else if (config.isString) {
                        // Handle string extraction (names)
                        const group = pattern.group || 1;
                        value = match[group]?.trim();
                        matchedFormat = pattern.format;
                    } else {
                        const group = pattern.group || 1;
                        value = parseNumber(match[group]);
                    }

                    // For non-string fields, skip if value is invalid
                    if (!config.isString && (value === null || value === undefined || isNaN(value))) continue;
                    // For string fields, skip if empty
                    if (config.isString && !value) continue;

                    if (config.expectedRange) {
                        const inRange = value >= config.expectedRange.min && value <= config.expectedRange.max;
                        if (!inRange && bestMatch === null) continue;
                    }

                    const conf = calculateConfidence(field, match, pattern, normalizedText);

                    if (!matchedUnit && !config.isString) {
                        matchedUnit = detectUnit(match[0] + ' ' + normalizedText.substring(match.index + match[0].length, match.index + match[0].length + 20), field);
                    }

                    if (conf > bestConfidence) {
                        bestConfidence = conf;
                        bestMatch = match;
                        matchedValue = value;
                    }
                }
            }

            if (matchedValue !== null && matchedValue !== undefined) {
                if (field === 'patientName') {
                    // Normalize patient name
                    const normalizedName = normalizePatientName(matchedValue, matchedFormat);
                    if (normalizedName) {
                        results[field] = normalizedName;
                        confidence[field] = bestConfidence;
                        units[field] = null;
                    }
                } else {
                    const finalValue = convertToBase(matchedValue, matchedUnit, field);
                    results[field] = finalValue;
                    confidence[field] = bestConfidence;
                    units[field] = matchedUnit || null;
                }
            }
        }

        return { values: results, confidence: confidence, units: units, rawText: normalizedText };
    }

    /**
     * Gibt eine menschenlesbare Beschreibung fuer ein Feld zurueck
     */
    function getFieldLabel(field) {
        const labels = {
            age: 'Age',
            sex: 'Sex',
            glucose: 'Fasting Glucose',
            sbp: 'Blood Pressure (Systolic)',
            waist: 'Waist Circumference',
            hdl: 'HDL Cholesterol',
            triglycerides: 'Triglycerides',
            patientName: 'Patient Name'
        };
        return labels[field] || field;
    }

    /**
     * Gibt die Einheit fuer ein Feld zurueck
     */
    function getFieldUnit(field, isMetric) {
        const units = {
            age: 'years', sex: '',
            glucose: isMetric ? 'mmol/L' : 'mg/dL',
            sbp: 'mmHg',
            waist: isMetric ? 'cm' : 'in',
            hdl: isMetric ? 'mmol/L' : 'mg/dL',
            triglycerides: isMetric ? 'mmol/L' : 'mg/dL',
            patientName: ''
        };
        return units[field] || '';
    }

    // Public API
    DRC.LabReportParser = {
        extractValues: extractValues,
        getFieldLabel: getFieldLabel,
        getFieldUnit: getFieldUnit,
        _parseNumber: parseNumber,
        _detectUnit: detectUnit,
        _convertToBase: convertToBase,
        _normalizePatientName: normalizePatientName
    };
})();
