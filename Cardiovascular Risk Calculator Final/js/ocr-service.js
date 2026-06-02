/**
 * OCR Service - Tesseract.js Wrapper
 *
 * Verwaltet OCR-Engine, PDF-Verarbeitung und Text-Extraktion
 * Lazy Loading fuer Tesseract.js um initiale Ladezeit zu minimieren
 *
 * @module DRC.OCRService
 */

(function() {
    'use strict';

    window.DRC = window.DRC || {};

    // Private state
    let tesseractLoaded = false;
    let tesseractWorker = null;
    let pdfjsLoaded = false;

    // CDN URLs fuer externe Bibliotheken (jsdelivr.net - CSP whitelistet)
    const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    const TESSERACT_LANG_DATA = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';

    /**
     * Laedt Tesseract.js dynamisch nach
     */
    async function loadTesseract() {
        if (tesseractLoaded && window.Tesseract) {
            return window.Tesseract;
        }

        // Pruefe ob bereits geladen
        if (window.Tesseract) {
            tesseractLoaded = true;
            return window.Tesseract;
        }

        // Dynamisch laden
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = TESSERACT_CDN;
            script.async = true;
            script.integrity = 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';
            script.crossOrigin = 'anonymous';

            script.addEventListener('load', () => {
                tesseractLoaded = true;
                resolve(window.Tesseract);
            });

            script.addEventListener('error', (e) => {
                reject(new Error('Failed to load Tesseract.js: ' + e.message));
            });

            document.head.appendChild(script);
        });
    }

    /**
     * Laedt PDF.js dynamisch nach
     */
    async function loadPDFJS() {
        if (pdfjsLoaded && window.pdfjsLib) {
            return window.pdfjsLib;
        }

        if (window.pdfjsLib) {
            pdfjsLoaded = true;
            return window.pdfjsLib;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = PDFJS_CDN;
            script.async = true;
            script.integrity = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
            script.crossOrigin = 'anonymous';

            script.addEventListener('load', () => {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN.replace('pdf.min.js', 'pdf.worker.min.js');
                }
                pdfjsLoaded = true;
                resolve(window.pdfjsLib);
            });

            script.addEventListener('error', (e) => {
                reject(new Error('Failed to load PDF.js: ' + e.message));
            });

            document.head.appendChild(script);
        });
    }

    /**
     * Erstellt einen Tesseract Worker
     */
    async function createWorker(onProgress) {
        const Tesseract = await loadTesseract();

        const logger = (m) => {
            if (onProgress) {
                const progress = m.status === 'recognizing text' ? Math.round(m.progress * 100) : 0;
                onProgress({ status: m.status, progress: progress });
            }
        };

        // Worker erstellen mit deutscher und englischer Sprache
        tesseractWorker = await Tesseract.createWorker('eng+deu', 1, { logger });

        // Performance-Optimierungen
        await tesseractWorker.setParameters({
            tessedit_ocr_engine_mode: 'FAST',
            tessedit_pageseg_mode: '6', // Assume a single uniform block of text
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: '0123456789.,abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöüßÄÖÜ%/|- '
        });

        return tesseractWorker;
    }

    /**
     * Verarbeitet ein Bild mit OCR
     */
    async function recognizeImage(imageSource, onProgress) {
        if (!tesseractWorker) {
            tesseractWorker = await createWorker(onProgress);
        }

        try {
            const result = await tesseractWorker.recognize(imageSource);
            return {
                text: result.data.text,
                confidence: result.data.confidence,
                words: result.data.words
            };
        } catch (error) {
            // Bei Fehler Worker zuruecksetzen
            tesseractWorker = null;
            throw error;
        }
    }

    /**
     * Konvertiert PDF zu Canvas-Bild
     */
    async function pdfToImage(pdfFile, onProgress) {
        const pdfjsLib = await loadPDFJS();

        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (onProgress) onProgress({ status: 'loading_pdf', progress: 30 });

        // Nur erste Seite
        const page = await pdf.getPage(1);

        // Scale fuer bessere OCR-Qualitaet
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (onProgress) onProgress({ status: 'rendering_page', progress: 60 });

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        if (onProgress) onProgress({ status: 'pdf_complete', progress: 100 });

        const dataUrl = canvas.toDataURL('image/png');

        // Cleanup: Canvas explizit bereinigen um Speicherlecks zu vermeiden
        canvas.width = 0;
        canvas.height = 0;

        return dataUrl;
    }

    /**
     * Komprimiert ein Bild fuer schnellere OCR
     */
    async function compressImage(file, maxWidth = 2000, maxHeight = 2000) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let { width, height } = img;

                // Skalieren wenn noetig
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    }

    /**
     * Hauptfunktion: Verarbeitet eine Datei (Bild oder PDF)
     */
    async function processFile(file, onProgress) {
        if (!file) {
            throw new Error('No file provided');
        }

        if (file.size > 10 * 1024 * 1024) {
            throw new Error('File too large (max 10MB)');
        }

        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!ALLOWED_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
            throw new Error('Unsupported file type. Please upload JPEG, PNG, WebP, or PDF.');
        }

        let imageSource;
        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        if (isPDF) {
            if (onProgress) onProgress({ status: 'pdf_to_image', progress: 10 });
            imageSource = await pdfToImage(file, onProgress);
        } else {
            if (onProgress) onProgress({ status: 'compressing', progress: 10 });
            imageSource = await compressImage(file);
        }

        if (onProgress) onProgress({ status: 'loading_ocr', progress: 40 });

        const ocrResult = await recognizeImage(imageSource, onProgress);

        // Extrahiere Laborwerte
        const extracted = DRC.LabReportParser.extractValues(ocrResult.text);

        return {
            text: ocrResult.text,
            ocrConfidence: ocrResult.confidence,
            extracted: extracted,
            preview: imageSource
        };
    }

    /**
     * Processes multiple files sequentially
     * @param {FileList} files - Files to process
     * @param {Function} onProgress - Callback({ currentFile, totalFiles, fileProgress, overallProgress })
     * @param {Function} onFileComplete - Callback(fileIndex, result)
     * @returns {Promise<Array>} Results for all files
     */
    async function processFiles(files, onProgress, onFileComplete) {
        if (!files || files.length === 0) {
            throw new Error('No files provided');
        }

        const results = [];
        const totalFiles = files.length;

        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];

            // Calculate overall progress: previous files + current file progress
            const calculateOverallProgress = (fileProgress) => {
                const previousFilesProgress = (i / totalFiles) * 100;
                const currentFileContribution = (fileProgress / 100) * (100 / totalFiles);
                return Math.round(previousFilesProgress + currentFileContribution);
            };

            const fileProgressCallback = (status) => {
                if (onProgress) {
                    onProgress({
                        currentFile: i + 1,
                        totalFiles: totalFiles,
                        fileName: file.name,
                        fileProgress: status.progress,
                        overallProgress: calculateOverallProgress(status.progress),
                        status: status.status
                    });
                }
            };

            try {
                const result = await processFile(file, fileProgressCallback);
                results.push({ success: true, file: file.name, result: result });
                if (onFileComplete) {
                    onFileComplete(i, result);
                }
            } catch (error) {
                results.push({ success: false, file: file.name, error: error.message });
                if (onFileComplete) {
                    onFileComplete(i, null, error);
                }
                // Continue with next file instead of failing completely
            }
        }

        return results;
    }

    /**
     * Bricht OCR-Verarbeitung ab
     */
    async function terminate() {
        if (tesseractWorker) {
            await tesseractWorker.terminate();
            tesseractWorker = null;
        }
    }

    /**
     * Prueft ob OCR unterstuetzt wird
     */
    function isSupported() {
        return !!(
            window.FileReader &&
            window.Blob &&
            typeof Uint8Array !== 'undefined' &&
            typeof WebAssembly !== 'undefined'
        );
    }

    // Public API
    DRC.OCRService = {
        processFile: processFile,
        processFiles: processFiles,
        terminate: terminate,
        isSupported: isSupported,
        // Exposed fuer Testing
        _loadTesseract: loadTesseract,
        _pdfToImage: pdfToImage,
        _compressImage: compressImage
    };
})();
