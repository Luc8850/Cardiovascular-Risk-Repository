/**
 * OCR UI Controller - UI-Interaktion fuer OCR Laborbericht Feature
 *
 * Verwaltet Modal, Upload-Workflow, Ergebnis-Anzeige und Import
 *
 * @module DRC.OCRUIController
 */

(function() {
    'use strict';

    window.DRC = window.DRC || {};

    // DOM Element References
    let elements = {};

    // State
    let currentResult = null;
    let _focusTrap = null;
    let _previousFocusElement = null;
    let currentResults = [];  // For multiple files
    let isProcessing = false;
    let currentFileIndex = 0;
    let totalFilesToProcess = 0;

    /**
     * Cache DOM-Elemente
     */
    function cacheElements() {
        // Modal
        elements.modal = document.getElementById('ocrModal');
        elements.modalClose = document.getElementById('ocrModalClose');
        elements.modalTitle = document.getElementById('ocrModalTitle');

        // Steps
        elements.stepUpload = document.getElementById('ocrStepUpload');
        elements.stepProcessing = document.getElementById('ocrStepProcessing');
        elements.stepReview = document.getElementById('ocrStepReview');
        elements.stepError = document.getElementById('ocrStepError');

        // Upload
        elements.dropzone = document.getElementById('ocrDropzone');
        elements.cameraBtn = document.getElementById('ocrCameraBtn');
        elements.fileInput = document.getElementById('ocrFileInput');
        elements.cameraInput = document.getElementById('ocrCameraInput');

        // Progress
        elements.progressCircle = document.getElementById('ocrProgressCircle');
        elements.progressPercentage = document.getElementById('ocrProgressPercentage');
        elements.stepStatusUpload = document.getElementById('ocrStepStatusUpload');
        elements.stepStatusAnalyze = document.getElementById('ocrStepStatusAnalyze');
        elements.stepStatusExtract = document.getElementById('ocrStepStatusExtract');
        elements.stepStatusValidate = document.getElementById('ocrStepStatusValidate');
        elements.cancelBtn = document.getElementById('ocrCancelBtn');

        // Review
        elements.resultsGrid = document.getElementById('ocrResultsGrid');
        elements.summary = document.getElementById('ocrSummary');
        elements.statDetected = document.getElementById('ocrStatDetected');
        elements.statReview = document.getElementById('ocrStatReview');
        elements.statNotFound = document.getElementById('ocrStatNotFound');
        elements.backBtn = document.getElementById('ocrBackBtn');
        elements.importBtn = document.getElementById('ocrImportBtn');

        // Error
        elements.errorMessage = document.getElementById('ocrErrorMessage');
        elements.manualBtn = document.getElementById('ocrManualBtn');
        elements.retryBtn = document.getElementById('ocrRetryBtn');

        // Patient Drawer Button
        elements.pdOCRBtn = document.getElementById('pdOCRBtn');
        elements.pdImportFile = document.getElementById('ocrFileInput');
    }

    /**
     * Zeigt das Modal an
     */
    function showModal() {
        if (!elements.modal) cacheElements();
        if (elements.modal) {
            elements.modal.style.display = 'flex';
            // Force reflow
            void elements.modal.offsetHeight;
            elements.modal.classList.add('open');
            elements.modal.setAttribute('aria-hidden', 'false');

            // Hide step indicator in main app
            document.body.classList.add('ocr-modal-open');

            // Focus trap: store previous focus and activate
            _previousFocusElement = document.activeElement;
            _focusTrap = DRC.Utils.createFocusTrap(elements.modal);
            _focusTrap.activate();
        }
        showStep('upload');
    }

    /**
     * Versteckt das Modal
     */
    function hideModal() {
        if (!elements.modal) return;
        elements.modal.classList.remove('open');
        elements.modal.setAttribute('aria-hidden', 'true');

        // Focus trap: deactivate and restore focus
        if (_focusTrap) { _focusTrap.deactivate(); _focusTrap = null; }
        if (_previousFocusElement) { _previousFocusElement.focus(); _previousFocusElement = null; }

        // Show step indicator again
        document.body.classList.remove('ocr-modal-open');

        // Wait for transition to finish before hiding
        setTimeout(() => {
            if (!elements.modal.classList.contains('open')) {
                elements.modal.style.display = 'none';
            }
        }, 300);
        resetState();
    }

    /**
     * Zeigt einen bestimmten Schritt an
     */
    function showStep(stepName) {
        ['upload', 'processing', 'review', 'error'].forEach(step => {
            const el = elements['step' + step.charAt(0).toUpperCase() + step.slice(1)];
            if (el) el.style.display = step === stepName ? 'block' : 'none';
        });

        // Update step titles
        const titles = {
            upload: 'Scan Laboratory Report',
            processing: 'Processing...',
            review: 'Review Values',
            error: 'Processing Error'
        };
        if (elements.modalTitle) {
            // Clear existing content safely
            elements.modalTitle.textContent = '';
            // Create icon element safely
            const iconName = stepName === 'error' ? 'alert-circle' : 'scan-line';
            const iconEl = document.createElement('i');
            iconEl.setAttribute('data-lucide', iconName);
            iconEl.className = 'lucide-icon';
            elements.modalTitle.appendChild(iconEl);
            // Add text safely
            elements.modalTitle.appendChild(document.createTextNode(' ' + titles[stepName]));
            DRC.UIHelpers.refreshIcons();
        }
    }

    /**
     * Reset state
     */
    function resetState() {
        currentResult = null;
        isProcessing = false;
        if (elements.resultsGrid) elements.resultsGrid.textContent = '';
        updateProgress(0);
    }

    /**
     * Aktualisiert den Fortschrittsbalken
     */
    function updateProgress(percent) {
        if (!elements.progressCircle) return;
        // Clamp percent to 0-100 range
        percent = Math.max(0, Math.min(100, Math.round(percent)));
        const circumference = 2 * Math.PI * 45;
        const offset = circumference - (percent / 100) * circumference;
        elements.progressCircle.style.strokeDashoffset = offset;
        elements.progressPercentage.textContent = percent + '%';
        elements.progressCircle.parentElement.setAttribute('aria-valuenow', percent);
    }

    /**
     * Aktualisiert den Status-Step
     */
    function updateStepStatus(stepId, status) {
        const step = document.getElementById('ocrStepStatus' + stepId);
        if (!step) return;

        step.classList.remove('active', 'complete');
        if (status === 'active') step.classList.add('active');
        if (status === 'complete') step.classList.add('complete');
    }

    /**
     * Validate file for OCR processing.
     * @param {File} file - The file to validate.
     * @returns {File|null} The file if valid, null otherwise.
     */
    function validateFile(file) {
        // Check file exists
        if (!file) return null;

        // Max file size: 10MB for images, 20MB for PDFs
        const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
        const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB
        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const maxSize = isPDF ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;

        if (file.size > maxSize) {
            const sizeMB = Math.round(file.size / (1024 * 1024));
            const maxMB = Math.round(maxSize / (1024 * 1024));
            showError(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is ${maxMB}MB.`);
            return null;
        }

        // Validate file type
        const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff'];
        const isValidType = isPDF || allowedImageTypes.includes(file.type);

        if (!isValidType) {
            showError(`File "${file.name}" has unsupported type (${file.type || 'unknown'}). Please upload an image (JPG, PNG, GIF, BMP, WebP, TIFF) or PDF.`);
            return null;
        }

        return file;
    }

    /**
     * Verarbeitet eine Datei
     */
    async function processFile(file) {
        if (!file || isProcessing) return;

        isProcessing = true;
        showStep('processing');
        updateProgress(0);
        updateStepStatus('Upload', 'complete');
        updateStepStatus('Analyze', 'active');

        try {
            const result = await DRC.OCRService.processFile(file, (status) => {
                if (status.status === 'loading_ocr') {
                    updateProgress(40);
                } else if (status.status === 'recognizing text') {
                    updateProgress(40 + Math.round(status.progress * 0.5));
                    updateStepStatus('Extract', 'active');
                }
            });

            updateStepStatus('Analyze', 'complete');
            updateStepStatus('Extract', 'complete');
            updateStepStatus('Validate', 'complete');
            updateProgress(100);

            currentResult = result;
            showReview(result);

        } catch (error) {
            console.error('OCR processing error:', error);
            showError(error.message);
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Verarbeitet mehrere Dateien
     */
    async function processFiles(files) {
        if (!files || files.length === 0 || isProcessing) return;

        isProcessing = true;
        currentFileIndex = 0;
        totalFilesToProcess = files.length;
        currentResults = [];
        showStep('processing');
        updateProgress(0);
        updateStepStatus('Upload', 'complete');
        updateStepStatus('Analyze', 'active');

        try {
            await DRC.OCRService.processFiles(files, (progress) => {
                // Update progress based on overall progress
                updateProgress(progress.overallProgress);

                // Update step labels to show current file
                if (totalFilesToProcess > 1) {
                    updateStepLabel('Analyze', `Analyzing file ${progress.currentFile}/${progress.totalFiles}...`);
                }

                if (progress.status === 'recognizing text') {
                    updateStepStatus('Extract', 'active');
                    if (totalFilesToProcess > 1) {
                        updateStepLabel('Extract', `Extracting values from file ${progress.currentFile}/${progress.totalFiles}...`);
                    }
                }
            }, (fileIndex, result, error) => {
                // File complete callback
                if (result) {
                    currentResults.push(result);
                }
            });

            // After all files processed, show combined results
            updateStepStatus('Analyze', 'complete');
            updateStepStatus('Extract', 'complete');
            updateStepStatus('Validate', 'complete');
            updateProgress(100);

            // Merge results from all files
            const mergedResult = mergeResults(currentResults);
            currentResult = mergedResult;
            showReview(mergedResult);

        } catch (error) {
            console.error('OCR processing error:', error);
            showError(error.message);
        } finally {
            isProcessing = false;
            currentFileIndex = 0;
            totalFilesToProcess = 0;
            // Reset step labels
            resetStepLabels();
        }
    }

    // Helper function to update step labels dynamically
    function updateStepLabel(stepId, label) {
        const step = document.getElementById('ocrStepStatus' + stepId);
        if (step) {
            const labelSpan = step.querySelector('.ocr-step-label');
            if (labelSpan) {
                labelSpan.textContent = label;
            }
        }
    }

    // Helper function to reset step labels to defaults
    function resetStepLabels() {
        const defaultLabels = {
            'Upload': 'Upload complete',
            'Analyze': 'Analyzing image...',
            'Extract': 'Extracting values...',
            'Validate': 'Validating...'
        };

        Object.entries(defaultLabels).forEach(([stepId, label]) => {
            updateStepLabel(stepId, label);
        });
    }

    // Merge results from multiple files - prioritize higher confidence values
    function mergeResults(results) {
        if (results.length === 0) return null;
        if (results.length === 1) return results[0];

        const merged = {
            text: results.map(r => r.text).join('\n---\n'),
            ocrConfidence: results.reduce((sum, r) => sum + r.ocrConfidence, 0) / results.length,
            extracted: { values: {}, confidence: {}, units: {} },
            preview: results[0].preview // Use first file's preview
        };

        // For each field, take the value with highest confidence across all files
        const allFields = ['glucose', 'sbp', 'waist', 'hdl', 'triglycerides', 'age', 'sex', 'patientName'];

        allFields.forEach(field => {
            let bestValue = undefined;
            let bestConfidence = 0;
            let bestUnit = undefined;

            results.forEach(r => {
                const fieldConfidence = r.extracted.confidence[field] || 0;
                if (fieldConfidence > bestConfidence && r.extracted.values[field] !== undefined) {
                    bestConfidence = fieldConfidence;
                    bestValue = r.extracted.values[field];
                    bestUnit = r.extracted.units[field];
                }
            });

            if (bestValue !== undefined) {
                merged.extracted.values[field] = bestValue;
                merged.extracted.confidence[field] = bestConfidence;
                merged.extracted.units[field] = bestUnit;
            }
        });

        return merged;
    }

    /**
     * Zeigt die Ergebnisse an
     */
    function showReview(result) {
        if (!elements.resultsGrid) return;

        const extracted = result.extracted;
        const values = extracted.values;
        const confidence = extracted.confidence;
        const units = extracted.units;

        // Definiere alle moeglichen Felder (patientName ist separat)
        const allFields = ['glucose', 'sbp', 'waist', 'hdl', 'triglycerides', 'age', 'sex'];
        const isMetric = DRC.App?.isMetric?.() ?? false;

        let detected = 0;
        let needsReview = 0;
        let notFound = 0;

        // Clear grid safely before building DOM nodes
        elements.resultsGrid.textContent = '';

        // --- Patient name section (separate, at the top) ---
        const patientName = values.patientName;
        const profileName = patientName || 'Unknown Profile';
        const patientConfidenceClass = patientName ? 'high' : 'none';

        const patientItem = document.createElement('div');
        patientItem.className = 'ocr-result-item ' + patientConfidenceClass;
        patientItem.dataset.field = 'patientName';

        // Header row
        const patientHeader = document.createElement('div');
        patientHeader.className = 'ocr-result-header';

        const patientFieldName = document.createElement('span');
        patientFieldName.className = 'ocr-result-field-name';
        patientFieldName.textContent = 'Profile Name';

        const patientConfBadge = document.createElement('span');
        patientConfBadge.className = 'ocr-result-confidence ' + patientConfidenceClass;
        const patientIcon = document.createElement('i');
        patientIcon.setAttribute('data-lucide', 'user');
        patientIcon.className = 'lucide-icon';
        patientConfBadge.appendChild(patientIcon);

        patientHeader.appendChild(patientFieldName);
        patientHeader.appendChild(patientConfBadge);

        // Value row
        const patientValueRow = document.createElement('div');
        patientValueRow.className = 'ocr-result-value-row';

        const patientValueBox = document.createElement('div');
        patientValueBox.className = 'ocr-result-value-box';

        const profileInput = document.createElement('input');
        profileInput.type = 'text';
        profileInput.className = 'ocr-result-input ' + patientConfidenceClass;
        profileInput.value = profileName;  // .value is safe — no escaping needed
        profileInput.dataset.field = 'patientName';
        profileInput.id = 'ocrProfileNameInput';
        profileInput.setAttribute('aria-label', 'Profile Name');
        profileInput.placeholder = 'Profile name';

        patientValueBox.appendChild(profileInput);

        const patientIncludeLabel = document.createElement('label');
        patientIncludeLabel.className = 'ocr-result-include';
        const patientIncludeCheckbox = document.createElement('input');
        patientIncludeCheckbox.type = 'checkbox';
        patientIncludeCheckbox.checked = true;
        patientIncludeCheckbox.disabled = true;
        patientIncludeCheckbox.setAttribute('aria-label', 'Profile will be created automatically');
        const patientIncludeSpan = document.createElement('span');
        patientIncludeSpan.textContent = 'Auto-create profile';
        patientIncludeLabel.appendChild(patientIncludeCheckbox);
        patientIncludeLabel.appendChild(patientIncludeSpan);

        patientValueRow.appendChild(patientValueBox);
        patientValueRow.appendChild(patientIncludeLabel);

        patientItem.appendChild(patientHeader);
        patientItem.appendChild(patientValueRow);
        elements.resultsGrid.appendChild(patientItem);

        // --- Per-field result items ---
        allFields.forEach(field => {
            const value = values[field];
            const conf = confidence[field] || 0;
            const unit = units[field];

            if (value !== undefined && value !== null) {
                if (conf >= 70) detected++;
                else needsReview++;
            } else {
                notFound++;
            }

            const confidenceClass = conf >= 90 ? 'high' : conf >= 70 ? 'medium' : conf >= 50 ? 'low' : 'none';
            const confidenceLabel = conf >= 90 ? 'High confidence' : conf >= 70 ? 'Good confidence' : conf >= 50 ? 'Low confidence - please verify' : 'Not detected';
            const confidenceIcon = conf >= 70 ? 'check-circle' : conf >= 50 ? 'alert-triangle' : 'x-circle';

            const displayUnit = field === 'sex' ? '' : (unit || DRC.LabReportParser.getFieldUnit(field, isMetric));
            const fieldLabel = DRC.LabReportParser.getFieldLabel(field);

            // Build result item container
            const item = document.createElement('div');
            item.className = 'ocr-result-item ' + confidenceClass;
            item.dataset.field = field;

            // Header row
            const header = document.createElement('div');
            header.className = 'ocr-result-header';

            const fieldNameSpan = document.createElement('span');
            fieldNameSpan.className = 'ocr-result-field-name';
            fieldNameSpan.textContent = fieldLabel;  // textContent is safe

            const confSpan = document.createElement('span');
            confSpan.className = 'ocr-result-confidence ' + confidenceClass;
            confSpan.title = confidenceLabel;

            const confIcon = document.createElement('i');
            confIcon.setAttribute('data-lucide', confidenceIcon);
            confIcon.className = 'lucide-icon';
            confSpan.appendChild(confIcon);
            confSpan.appendChild(document.createTextNode(conf > 0 ? conf + '%' : 'N/A'));

            header.appendChild(fieldNameSpan);
            header.appendChild(confSpan);

            // Value row
            const valueRow = document.createElement('div');
            valueRow.className = 'ocr-result-value-row';

            const valueBox = document.createElement('div');
            valueBox.className = 'ocr-result-value-box';

            // Build input element — special handling for sex field
            if (field === 'sex') {
                if (value === undefined) {
                    // Not detected: show dropdown with placeholder
                    const select = document.createElement('select');
                    select.className = 'ocr-result-input ' + confidenceClass;
                    select.dataset.field = field;
                    select.setAttribute('aria-label', fieldLabel + ' value');

                    const placeholderOpt = document.createElement('option');
                    placeholderOpt.value = '';
                    placeholderOpt.textContent = '-';
                    const femaleOpt = document.createElement('option');
                    femaleOpt.value = '0';
                    femaleOpt.textContent = 'Female';
                    const maleOpt = document.createElement('option');
                    maleOpt.value = '1';
                    maleOpt.textContent = 'Male';

                    select.appendChild(placeholderOpt);
                    select.appendChild(femaleOpt);
                    select.appendChild(maleOpt);
                    valueBox.appendChild(select);
                } else {
                    // Detected: show read-only input with detected value
                    const displayValue = value === 1 ? 'Male' : value === 0 ? 'Female' : '';
                    const sexInput = document.createElement('input');
                    sexInput.type = 'text';
                    sexInput.className = 'ocr-result-input ' + confidenceClass;
                    sexInput.value = displayValue;  // .value is safe
                    sexInput.dataset.field = field;
                    sexInput.setAttribute('aria-label', fieldLabel + ' value');
                    sexInput.readOnly = true;
                    valueBox.appendChild(sexInput);
                }
            } else {
                // Standard input for other fields
                const input = document.createElement('input');
                input.type = field === 'patientName' ? 'text' : 'number';
                input.className = 'ocr-result-input ' + confidenceClass;
                input.value = value !== undefined ? String(value) : '';  // .value is safe — no escaping needed
                input.dataset.field = field;
                input.setAttribute('aria-label', fieldLabel + ' value');
                if (field !== 'patientName') {
                    input.step = '0.1';
                }
                if (field === 'patientName') {
                    input.readOnly = true;
                }
                if (value === undefined) {
                    input.placeholder = 'Enter value';
                }
                valueBox.appendChild(input);
            }

            // Unit span
            const unitSpan = document.createElement('span');
            unitSpan.className = 'ocr-result-unit';
            unitSpan.textContent = displayUnit;  // textContent is safe
            valueBox.appendChild(unitSpan);

            // Include checkbox
            const includeLabel = document.createElement('label');
            includeLabel.className = 'ocr-result-include';

            const includeCheckbox = document.createElement('input');
            includeCheckbox.type = 'checkbox';
            includeCheckbox.checked = value !== undefined;
            includeCheckbox.dataset.field = field;
            includeCheckbox.setAttribute('aria-label', 'Include ' + fieldLabel);

            const includeSpan = document.createElement('span');
            includeSpan.textContent = 'Include';

            includeLabel.appendChild(includeCheckbox);
            includeLabel.appendChild(includeSpan);

            valueRow.appendChild(valueBox);
            valueRow.appendChild(includeLabel);

            item.appendChild(header);
            item.appendChild(valueRow);
            elements.resultsGrid.appendChild(item);
        });

        // Update stats
        if (elements.statDetected) elements.statDetected.textContent = detected;
        if (elements.statReview) elements.statReview.textContent = needsReview;
        if (elements.statNotFound) elements.statNotFound.textContent = notFound;
        if (elements.summary) elements.summary.style.display = 'flex';

        // Re-init icons
        DRC.UIHelpers.refreshIcons();

        showStep('review');
    }

    /**
     * Zeigt einen Fehler an
     */
    function showError(message) {
        if (elements.errorMessage) {
            elements.errorMessage.textContent = message || 'Could not process image. Please try again.';
        }
        showStep('error');
    }

    /**
     * Importiert die ausgewaehlten Werte in das Formular
     */
    function importValues() {
        if (!elements.resultsGrid) return;

        const inputs = elements.resultsGrid.querySelectorAll('.ocr-result-input');
        const checkboxes = elements.resultsGrid.querySelectorAll('.ocr-result-include input[type="checkbox"]');

        const valuesToImport = {};

        inputs.forEach((input, index) => {
            const checkbox = checkboxes[index];
            if (checkbox && checkbox.checked) {
                const field = input.dataset.field;
                if (field === 'patientName') {
                    // Skip patientName in values import
                    return;
                }
                if (field === 'sex') {
                    // Parse sex from select or input value
                    let sexValue;
                    if (input.tagName === 'SELECT') {
                        // Dropdown: value is already "0" or "1" or ""
                        sexValue = input.value ? parseInt(input.value, 10) : undefined;
                    } else {
                        // Read-only input: parse display value
                        const valueLower = input.value.trim().toLowerCase();
                        sexValue = valueLower === 'male' ? 1 : valueLower === 'female' ? 0 : undefined;
                    }
                    if (sexValue !== undefined) {
                        valuesToImport[field] = sexValue;
                    }
                } else {
                    const value = parseFloat(input.value);
                    if (!isNaN(value)) {
                        valuesToImport[field] = value;
                    }
                }
            }
        });

        // Werte in Formular uebernehmen
        applyValuesToForm(valuesToImport);

        // Create patient profile automatically (always create on import)
        const profileNameInput = document.getElementById('ocrProfileNameInput');
        const profileName = profileNameInput?.value?.trim() || 'Unknown Profile';

        if (DRC.PatientManager && DRC.PatientManager.addPatient) {
            DRC.PatientManager.addPatient(profileName);
        }

        // Modal schliessen
        hideModal();

        // Notify other modules that import is complete
        window.dispatchEvent(new CustomEvent('drc:import:completed'));
    }

    /**
     * Wendet Werte auf das Formular an
     */
    function applyValuesToForm(values) {
        const fieldMapping = {
            age: 'age-value',
            sex: 'sex-toggle',
            glucose: 'fastGlu-value',
            sbp: 'sbp-value',
            waist: 'waist-value',
            hdl: 'cholHDL-value',
            triglycerides: 'cholTri-value'
        };

        Object.entries(values).forEach(([field, value]) => {
            const inputId = fieldMapping[field];
            if (!inputId) return;

            const input = document.getElementById(inputId);
            if (input) {
                if (field === 'sex') {
                    // Sex ist ein Toggle
                    input.checked = value === 1;
                    input.setAttribute('aria-checked', String(value === 1));
                } else {
                    input.value = value;
                }

                // Event ausloesen fuer UI-Update
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Visuelles Feedback
                input.classList.add('ocr-populated');
                setTimeout(() => input.classList.remove('ocr-populated'), 2000);
            }
        });

        // Risiko neu berechnen (multimodel-adapted)
        if (DRC.App?.calculate) {
            DRC.App.calculate();
        }
    }

    /**
     * Event Handler Setup
     */
    function bindEvents() {
        if (!elements.modal) cacheElements();

        // Modal schliessen
        if (elements.modalClose) {
            elements.modalClose.addEventListener('click', hideModal);
        }

        // Click auf Overlay schliesst Modal
        if (elements.modal) {
            elements.modal.addEventListener('click', (e) => {
                if (e.target === elements.modal) hideModal();
            });
        }

        // Dropzone
        if (elements.dropzone) {
            elements.dropzone.addEventListener('click', () => {
                if (elements.fileInput) elements.fileInput.click();
            });

            elements.dropzone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (elements.fileInput) elements.fileInput.click();
                }
            });

            // Drag & Drop
            elements.dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                elements.dropzone.classList.add('drag-over');
            });

            elements.dropzone.addEventListener('dragleave', () => {
                elements.dropzone.classList.remove('drag-over');
            });

            elements.dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                elements.dropzone.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files)
                    .map(validateFile)
                    .filter(f => f !== null);
                if (files.length > 0) {
                    if (files.length === 1) {
                        processFile(files[0]);
                    } else {
                        processFiles(files);
                    }
                }
            });
        }

        // File Input (for file upload)
        if (elements.fileInput) {
            elements.fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files)
                    .map(validateFile)
                    .filter(f => f !== null);
                if (files.length > 0) {
                    if (files.length === 1) {
                        processFile(files[0]);
                    } else {
                        processFiles(files);
                    }
                }
                // Reset input so same files can be selected again
                e.target.value = '';
            });
        }

        // Camera Input (for camera capture)
        if (elements.cameraInput) {
            elements.cameraInput.addEventListener('change', (e) => {
                const file = validateFile(e.target.files[0]);
                if (file) processFile(file);
                // Reset input so same photo can be taken again
                e.target.value = '';
            });
        }

        // Camera Button
        if (elements.cameraBtn) {
            elements.cameraBtn.addEventListener('click', () => {
                // Use dedicated camera input (ocrCameraInput) which has accept="image/*" capture="environment"
                // This ensures the camera opens instead of file picker (PDF in accept breaks capture)
                if (elements.cameraInput) {
                    elements.cameraInput.click();
                }
            });
        }

        // Cancel Button
        if (elements.cancelBtn) {
            elements.cancelBtn.addEventListener('click', () => {
                isProcessing = false;
                hideModal();
            });
        }

        // Back Button
        if (elements.backBtn) {
            elements.backBtn.addEventListener('click', () => {
                showStep('upload');
            });
        }

        // Import Button
        if (elements.importBtn) {
            elements.importBtn.addEventListener('click', importValues);
        }

        // Error Buttons
        if (elements.manualBtn) {
            elements.manualBtn.addEventListener('click', () => {
                hideModal();
            });
        }

        if (elements.retryBtn) {
            elements.retryBtn.addEventListener('click', () => {
                showStep('upload');
            });
        }

        // Patient Drawer OCR Button
        if (elements.pdOCRBtn) {
            elements.pdOCRBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Patient Drawer schliessen falls noetig
                if (DRC.PatientManager?.toggleDrawer) {
                    DRC.PatientManager.toggleDrawer(false);
                } else {
                    const drawer = document.getElementById('patientDrawer');
                    const overlay = document.getElementById('patientOverlay');
                    const btn = document.getElementById('patientMenuBtn');
                    if (drawer) drawer.classList.remove('open');
                    if (overlay) overlay.classList.remove('open');
                    if (btn) btn.classList.remove('open');
                }

                showModal();
            });
        }

        // ESC-Taste schliesst Modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && elements.modal && elements.modal.classList.contains('open')) {
                hideModal();
            }
        });
    }

    /**
     * Initialisiert den Controller
     */
    function init() {
        cacheElements();

        // Initial modal verstecken
        if (elements.modal) {
            elements.modal.style.display = 'none';
        }

        bindEvents();

        // Pruefe Unterstuetzung
        if (!DRC.OCRService || !DRC.OCRService.isSupported()) {
            if (elements.pdOCRBtn) {
                elements.pdOCRBtn.style.display = 'none';
            }
            // OCR not supported on this device
        }
    }

    // Public API
    DRC.OCRUIController = {
        init: init,
        showModal: showModal,
        hideModal: hideModal,
        processFile: processFile,
        processFiles: processFiles
    };

    // Auto-initialisieren wenn DOM bereit
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
