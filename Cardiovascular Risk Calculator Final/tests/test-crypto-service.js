/**
 * @fileoverview Unit tests for the CryptoService module.
 *
 * Tests cover:
 *   1. Encrypt/decrypt round-trip
 *   2. isEncrypted detection
 *   3. Wrong password handling
 *   4. Invalid format detection
 *
 * Run with: node tests/test-crypto-service.js
 */

'use strict';

// ─── Bootstrap: Load modules in Node.js ─────────────────────────────
const { webcrypto } = require('crypto');

// Setup globals before loading modules
global.window = global;
global.document = { getElementById: () => null };
Object.defineProperty(global, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true
});

// Load modules in dependency order
require('../js/config.js');
require('../js/crypto-service.js');

const { encrypt, decrypt, isEncrypted } = DRC.CryptoService;

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

function assertEqual(actual, expected, name) {
    if (actual === expected) {
        passed++;
        results.push(`  ✓ ${name}`);
    } else {
        failed++;
        results.push(`  ✗ FAIL: ${name} (got ${actual}, expected ${expected})`);
    }
}

async function runTests() {
    console.log('Running CryptoService tests...\n');

    // Test 1: Encrypt/decrypt round-trip
    const originalData = new TextEncoder().encode('Hello, Diabetes Risk Calculator!');
    const password = 'test-password-123';

    try {
        const encrypted = await encrypt(originalData, password);
        assert(encrypted instanceof Uint8Array, 'encrypt returns Uint8Array');
        assert(encrypted.length > 0, 'encrypted data is not empty');

        const decrypted = await decrypt(encrypted, password);
        assert(decrypted instanceof Uint8Array, 'decrypt returns Uint8Array');

        const decryptedText = new TextDecoder().decode(decrypted);
        const originalText = new TextDecoder().decode(originalData);
        assertEqual(decryptedText, originalText, 'decrypted data matches original');
    } catch (e) {
        failed++;
        results.push(`  ✗ FAIL: Encrypt/decrypt round-trip threw: ${e.message}`);
    }

    // Test 2: isEncrypted detection
    try {
        const encrypted = await encrypt(originalData, password);
        assert(isEncrypted(encrypted) === true, 'isEncrypted returns true for encrypted data');

        const randomData = new Uint8Array([1, 2, 3, 4, 5]);
        assert(isEncrypted(randomData) === false, 'isEncrypted returns false for random data');

        const emptyData = new Uint8Array(0);
        assert(isEncrypted(emptyData) === false, 'isEncrypted returns false for empty data');
    } catch (e) {
        failed++;
        results.push(`  ✗ FAIL: isEncrypted detection threw: ${e.message}`);
    }

    // Test 3: Wrong password handling
    try {
        const encrypted = await encrypt(originalData, password);
        let wrongPasswordCaught = false;
        try {
            await decrypt(encrypted, 'wrong-password');
        } catch (e) {
            wrongPasswordCaught = e.message.includes('Decryption failed');
        }
        assert(wrongPasswordCaught, 'wrong password throws decryption error');
    } catch (e) {
        failed++;
        results.push(`  ✗ FAIL: Wrong password handling threw: ${e.message}`);
    }

    // Test 4: Invalid format detection
    try {
        const invalidData = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]);
        let invalidFormatCaught = false;
        try {
            await decrypt(invalidData, password);
        } catch (e) {
            invalidFormatCaught = e.message.includes('Invalid encrypted file format');
        }
        assert(invalidFormatCaught, 'invalid format throws format error');
    } catch (e) {
        failed++;
        results.push(`  ✗ FAIL: Invalid format detection threw: ${e.message}`);
    }

    // Test 5: Binary data encryption
    try {
        const binaryData = new Uint8Array([0x00, 0xFF, 0x42, 0x13, 0x37, 0xAB, 0xCD, 0xEF]);
        const encrypted = await encrypt(binaryData, password);
        const decrypted = await decrypt(encrypted, password);

        let binaryMatch = true;
        for (let i = 0; i < binaryData.length; i++) {
            if (binaryData[i] !== decrypted[i]) {
                binaryMatch = false;
                break;
            }
        }
        assert(binaryMatch, 'binary data encrypt/decrypt round-trip works');
    } catch (e) {
        failed++;
        results.push(`  ✗ FAIL: Binary data encryption threw: ${e.message}`);
    }

    // ─── Report results ───────────────────────────────────────────────
    console.log(results.join('\n'));
    console.log(`\n────────────────────────────────────────`);
    console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
