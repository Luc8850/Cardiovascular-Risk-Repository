/**
 * @fileoverview Crypto Service — AES-256-GCM encryption for Excel exports.
 * @module CryptoService
 * @memberof DRC
 */
'use strict';

DRC.CryptoService = (() => {
    const MAGIC_HEADER = new Uint8Array([0x44, 0x52, 0x43, 0x45, 0x4E, 0x43, 0x31, 0x00]); // "DRCENC1\0"
    const VERSION = 1;
    const PBKDF2_ITERATIONS = 100000;
    const SALT_LENGTH = 16;
    const IV_LENGTH = 12;
    const TAG_LENGTH = 16;
    const KEY_LENGTH = 32;

    const deriveKey = async (password, salt) => {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        const baseKey = await crypto.subtle.importKey('raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
            baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
    };

    const encrypt = async (data, password) => {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const key = await deriveKey(password, salt);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
        const encryptedArray = new Uint8Array(encrypted);
        const ciphertext = encryptedArray.slice(0, -TAG_LENGTH);
        const tag = encryptedArray.slice(-TAG_LENGTH);
        const metadata = { version: VERSION, salt: Array.from(salt), iv: Array.from(iv), tag: Array.from(tag) };
        const metadataJson = JSON.stringify(metadata);
        const metadataBytes = new TextEncoder().encode(metadataJson);
        const metadataLength = new Uint8Array(4);
        new DataView(metadataLength.buffer).setUint32(0, metadataBytes.length, false);
        const output = new Uint8Array(MAGIC_HEADER.length + metadataLength.length + metadataBytes.length + ciphertext.length);
        let offset = 0;
        output.set(MAGIC_HEADER, offset); offset += MAGIC_HEADER.length;
        output.set(metadataLength, offset); offset += metadataLength.length;
        output.set(metadataBytes, offset); offset += metadataBytes.length;
        output.set(ciphertext, offset);
        return output;
    };

    const decrypt = async (encryptedPackage, password) => {
        const header = encryptedPackage.slice(0, MAGIC_HEADER.length);
        if (!header.every((b, i) => b === MAGIC_HEADER[i])) {
            throw new Error('Invalid encrypted file format');
        }
        const metadataLengthView = new DataView(encryptedPackage.buffer, MAGIC_HEADER.length, 4);
        const metadataLength = metadataLengthView.getUint32(0, false);
        if (metadataLength > 4096) {
            throw new Error('Invalid encrypted file format: metadata too large');
        }
        const metadataStart = MAGIC_HEADER.length + 4;
        const metadataBytes = encryptedPackage.slice(metadataStart, metadataStart + metadataLength);
        const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
        if (metadata.version !== VERSION) {
            throw new Error(`Unsupported encryption version: ${metadata.version}`);
        }
        if (!Array.isArray(metadata.salt) || metadata.salt.length !== SALT_LENGTH ||
            !Array.isArray(metadata.iv)   || metadata.iv.length   !== IV_LENGTH   ||
            !Array.isArray(metadata.tag)  || metadata.tag.length  !== TAG_LENGTH) {
            throw new Error('Invalid encrypted file format: malformed metadata');
        }
        const salt = new Uint8Array(metadata.salt);
        const iv = new Uint8Array(metadata.iv);
        const tag = new Uint8Array(metadata.tag);
        const ciphertext = encryptedPackage.slice(metadataStart + metadataLength);
        const fullCiphertext = new Uint8Array(ciphertext.length + tag.length);
        fullCiphertext.set(ciphertext, 0);
        fullCiphertext.set(tag, ciphertext.length);
        const key = await deriveKey(password, salt);
        try {
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, fullCiphertext);
            return new Uint8Array(decrypted);
        } catch (e) {
            throw new Error('Decryption failed: wrong password or corrupted file');
        }
    };

    const isEncrypted = (data) => {
        if (data.length < MAGIC_HEADER.length) return false;
        return data.slice(0, MAGIC_HEADER.length).every((b, i) => b === MAGIC_HEADER[i]);
    };

    return { encrypt, decrypt, isEncrypted };
})();
