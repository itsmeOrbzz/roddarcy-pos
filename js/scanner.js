document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DB on phone scanner
    if (window.db) {
        await db.init();
    }

    // DOM elements
    const pairingPhase = document.getElementById('pairing-phase');
    const scanningPhase = document.getElementById('scanning-phase');
    const manualCodeInput = document.getElementById('manual-code-input');
    const btnManualConnect = document.getElementById('btn-manual-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const connectionStatus = document.getElementById('connection-status');
    const lastScannedStatus = document.getElementById('last-scanned-status');
    const scanFlash = document.getElementById('scan-flash');
    
    // Manual Barcode Modal elements
    const btnToggleManual = document.getElementById('btn-toggle-manual');
    const manualBarcodeModal = document.getElementById('manual-barcode-modal');
    const manualBarcodeInput = document.getElementById('manual-barcode-input');
    const btnCloseManualModal = document.getElementById('btn-close-manual-modal');
    const btnSendManualBarcode = document.getElementById('btn-send-manual-barcode');

    // Phone Add Product Modal elements
    const phoneAddModal = document.getElementById('phone-add-product-modal');
    const phoneAddForm = document.getElementById('phone-add-product-form');
    const phoneBarcodeDisplay = document.getElementById('phone-scanned-barcode-display');
    const phoneNameInp = document.getElementById('phone-product-name');
    const phonePriceInp = document.getElementById('phone-product-price');
    const phoneWholesalePriceInp = document.getElementById('phone-wholesale-price');
    const phoneWholesaleQtyInp = document.getElementById('phone-wholesale-qty');
    const phoneCategorySel = document.getElementById('phone-product-category');
    const btnClosePhoneAdd = document.getElementById('btn-close-phone-add-modal');
    const btnCancelPhoneAdd = document.getElementById('btn-cancel-phone-add');

    let pm = null;
    let html5QrcodeScanner = null;
    let isScanningPhaseActive = false;
    let lastScanTime = 0;
    const SCAN_COOLDOWN = 1500;
    let currentScannedBarcode = '';
    let lastScannedBarcode = '';

    // Helper Modal functions
    function openModal(el) {
        if (!el) return;
        el.classList.remove('hidden');
        el.classList.add('active');
        el.style.display = 'flex';
    }

    function closeModal(el) {
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('active');
        el.style.display = 'none';
    }

    function isModalOpen() {
        return (manualBarcodeModal && manualBarcodeModal.classList.contains('active')) ||
               (phoneAddModal && phoneAddModal.classList.contains('active'));
    }

    // Update Header Status Indicator
    function updateStatusUI(status, message) {
        if (!connectionStatus) return;
        connectionStatus.className = 'connection-status ' + status;
        connectionStatus.textContent = message || (status === 'connected' ? 'Connected' : 'Disconnected');
        
        if (status === 'connected') {
            if (btnDisconnect) btnDisconnect.classList.remove('hidden');
        } else {
            if (btnDisconnect) btnDisconnect.classList.add('hidden');
        }
    }

    // Phase 1: Initialize QR Code Scanner
    async function initQRScanner() {
        isScanningPhaseActive = false;
        await stopScanner();
        
        if (pairingPhase) {
            pairingPhase.classList.remove('hidden');
            pairingPhase.style.display = 'block';
        }
        if (scanningPhase) {
            scanningPhase.classList.add('hidden');
            scanningPhase.style.display = 'none';
        }
        updateStatusUI('disconnected', 'Disconnected');

        try {
            html5QrcodeScanner = new Html5Qrcode("qr-reader");
            const config = { fps: 10, qrbox: { width: 220, height: 220 } };
            
            await html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                onQRScanned,
                (errorMessage) => { /* Silent frame errors */ }
            );
        } catch (err) {
            console.warn("QR Scanner camera note:", err);
        }
    }

    async function stopScanner() {
        if (html5QrcodeScanner) {
            try {
                if (html5QrcodeScanner.isScanning) {
                    await html5QrcodeScanner.stop();
                }
                html5QrcodeScanner.clear();
            } catch (e) {
                // Ignore stop errors
            }
            html5QrcodeScanner = null;
        }
    }

    async function onQRScanned(decodedText) {
        if (pm && pm.isConnected) return;
        showToast("QR Scanned! Connecting...", "success");
        await connectToRegister(decodedText);
    }

    // Connect to iPad Register
    async function connectToRegister(peerId) {
        if (!peerId) {
            showToast("Please enter a valid pairing code", "error");
            return;
        }

        const formattedId = peerId.trim();
        updateStatusUI('connecting', 'Connecting...');
        showToast("Connecting to register...", "info", 3000);
        
        await stopScanner();

        pm = new PeerManager('scanner');

        pm.onStatusChange((status) => {
            if (status === 'connected') {
                updateStatusUI('connected', 'Connected to Register');
                if (!isScanningPhaseActive) {
                    isScanningPhaseActive = true;
                    showToast("Connected to register!", "success");
                    switchToScanningPhase();
                }
            } else if (status === 'disconnected' || status === 'error') {
                isScanningPhaseActive = false;
                updateStatusUI('disconnected', 'Disconnected');
            }
        });

        pm.onData(async (data) => {
            if (data.type === 'sync_products' && Array.isArray(data.products)) {
                if (window.db) {
                    await db.importProducts(data.products);
                    showToast(`Synced ${data.products.length} master products from register`, "info", 2000);
                }
            } else if (data.type === 'product_found' && data.product) {
                if (window.db) {
                    await db.addProduct(data.product);
                }
                pm.sendBarcode(data.product.barcode);
            } else if (data.type === 'ACK') {
                triggerFlash(false);
                if (typeof vibrate === 'function') vibrate([100]);
                if (typeof playScanBeep === 'function') playScanBeep();
                if (lastScannedStatus) {
                    lastScannedStatus.textContent = `✅ ${data.name || data.barcode}`;
                    lastScannedStatus.style.color = '#10b981';
                }
                showToast(`Added: ${data.name || data.barcode}`, "success");
            } else if (data.type === 'NOT_FOUND') {
                const existing = window.db ? await db.getProduct(data.barcode) : null;
                if (existing) {
                    if (pm && pm.isConnected) {
                        pm.send({ type: 'product_added', product: existing });
                        setTimeout(() => pm.sendBarcode(data.barcode), 250);
                    }
                } else {
                    triggerFlash(true);
                    promptAddNewProduct(data.barcode);
                }
            }
        });

        pm.onError((errMsg) => {
            showToast(errMsg || "Connection error", "error");
            updateStatusUI('disconnected', 'Connection Failed');
        });

        try {
            await pm.init();
            pm.connectToPeer(formattedId);
        } catch (err) {
            console.error("Peer connect error:", err);
            showToast("Failed to initialize scanner connection", "error");
            updateStatusUI('disconnected', 'Failed');
        }
    }

    // Phase 2: Barcode Scanning View
    async function switchToScanningPhase() {
        if (pairingPhase) {
            pairingPhase.classList.add('hidden');
            pairingPhase.style.display = 'none';
        }
        if (scanningPhase) {
            scanningPhase.classList.remove('hidden');
            scanningPhase.style.display = 'block';
        }
        if (lastScannedStatus) {
            lastScannedStatus.textContent = "Ready to scan product barcodes...";
            lastScannedStatus.style.color = '#f8fafc';
        }

        // Wait brief delay to allow previous QR camera stream to release completely
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            if (!html5QrcodeScanner) {
                html5QrcodeScanner = new Html5Qrcode("barcode-reader");
            }

            if (html5QrcodeScanner.isScanning) return;

            const config = { 
                fps: 10, 
                qrbox: { width: 280, height: 140 }
            };
            
            await html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                onBarcodeScanned,
                (errorMessage) => { /* Frame decode failure - normal */ }
            );
        } catch (err) {
            console.warn("Barcode camera reader notice:", err);
            showToast("Camera busy. Tap 'Enter Barcode Manually' below if camera doesn't start.", "warning");
        }
    }

    function onBarcodeScanned(decodedText) {
        if (isModalOpen()) return;

        const now = Date.now();
        if (decodedText === lastScannedBarcode && now - lastScanTime < 3000) {
            return;
        }
        if (now - lastScanTime < SCAN_COOLDOWN) {
            return;
        }

        lastScanTime = now;
        lastScannedBarcode = decodedText;
        processBarcode(decodedText);
    }
    
    async function processBarcode(barcode) {
        // 1. Check local phone database first
        let product = null;
        if (window.db) {
            product = await db.getProduct(barcode);
        }

        if (product) {
            // Product exists locally! Send to register cart as usual
            triggerFlash(false);
            if (typeof vibrate === 'function') vibrate([100]);
            if (typeof playScanBeep === 'function') playScanBeep();

            if (lastScannedStatus) {
                lastScannedStatus.textContent = `Scanned ${product.name} (${formatCurrency(product.price)})`;
                lastScannedStatus.style.color = '#10b981';
            }
            if (pm && pm.isConnected) {
                pm.sendBarcode(barcode);
            } else {
                showToast(`Scanned: ${product.name} - ${formatCurrency(product.price)}`, "success");
            }
        } else if (pm && pm.isConnected) {
            // 2. Not found in phone's local cache -> query iPad register master DB!
            pm.send({ type: 'query_product', barcode: barcode });
        } else {
            // 3. Not found & not connected -> prompt to add new product
            triggerFlash(true);
            promptAddNewProduct(barcode);
        }
    }

    function promptAddNewProduct(barcode) {
        if (!barcode) return;
        // Don't re-open if modal is already open for this barcode
        if (phoneAddModal && phoneAddModal.classList.contains('active') && currentScannedBarcode === barcode) {
            return;
        }

        currentScannedBarcode = barcode;
        if (phoneBarcodeDisplay) phoneBarcodeDisplay.textContent = barcode;
        if (phoneNameInp) phoneNameInp.value = '';
        if (phonePriceInp) phonePriceInp.value = '';
        if (phoneWholesalePriceInp) phoneWholesalePriceInp.value = '';
        if (phoneWholesaleQtyInp) phoneWholesaleQtyInp.value = '';

        openModal(phoneAddModal);
        if (lastScannedStatus) {
            lastScannedStatus.textContent = `✨ New Barcode ${barcode}! Set name & price below.`;
            lastScannedStatus.style.color = '#f59e0b';
        }
    }

    // Save New Product from Phone Form
    if (phoneAddForm) {
        phoneAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const barcode = currentScannedBarcode || (phoneBarcodeDisplay ? phoneBarcodeDisplay.textContent.trim() : '');
            const name = phoneNameInp ? phoneNameInp.value.trim() : '';
            const price = phonePriceInp ? parseFloat(phonePriceInp.value) : NaN;
            const wholesalePriceVal = phoneWholesalePriceInp && phoneWholesalePriceInp.value !== '' ? parseFloat(phoneWholesalePriceInp.value) : null;
            const wholesaleMinQtyVal = phoneWholesaleQtyInp && phoneWholesaleQtyInp.value !== '' ? parseInt(phoneWholesaleQtyInp.value) : null;
            const category = phoneCategorySel ? phoneCategorySel.value : 'General Wholesale';

            if (!barcode || !name || isNaN(price)) {
                showToast("Please enter product name and selling price", "error");
                return;
            }

            const newProduct = { 
                barcode, 
                name, 
                price, 
                wholesalePrice: wholesalePriceVal,
                wholesaleMinQty: wholesaleMinQtyVal,
                category 
            };

            try {
                if (window.db) {
                    await db.addProduct(newProduct);
                }

                showToast(`Saved "${name}" (₱${price.toFixed(2)}) to store inventory!`, "success");
                closeModal(phoneAddModal);
                lastScannedBarcode = ''; // Reset so barcode can be scanned again immediately

                // Send to connected register
                if (pm && pm.isConnected) {
                    pm.send({
                        type: 'product_added',
                        product: newProduct
                    });
                    // Small delay to let register save product to its IndexedDB before adding to cart
                    setTimeout(() => {
                        pm.sendBarcode(barcode);
                    }, 300);
                }

                if (lastScannedStatus) {
                    lastScannedStatus.textContent = `✅ Saved ${name} (₱${price.toFixed(2)})`;
                    lastScannedStatus.style.color = '#10b981';
                }
            } catch (err) {
                console.error("Error saving product on phone:", err);
                showToast("Failed to save product: " + err.message, "error");
            }
        });
    }

    if (btnClosePhoneAdd) btnClosePhoneAdd.addEventListener('click', () => closeModal(phoneAddModal));
    if (btnCancelPhoneAdd) btnCancelPhoneAdd.addEventListener('click', () => closeModal(phoneAddModal));

    function triggerFlash(isError = false) {
        if (!scanFlash) return;
        scanFlash.className = 'scan-flash' + (isError ? ' flash-red active' : ' active');
        setTimeout(() => {
            scanFlash.className = 'scan-flash';
        }, 300);
    }

    // Manual Connection Listeners
    if (btnManualConnect && manualCodeInput) {
        btnManualConnect.addEventListener('click', () => {
            const code = manualCodeInput.value.trim();
            if (code) connectToRegister(code);
        });

        manualCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const code = manualCodeInput.value.trim();
                if (code) connectToRegister(code);
            }
        });
    }

    if (btnDisconnect) {
        btnDisconnect.addEventListener('click', () => {
            if (pm) {
                pm.disconnect();
                pm = null;
            }
            initQRScanner();
        });
    }

    // Manual Barcode Modal Handlers
    if (btnToggleManual) {
        btnToggleManual.addEventListener('click', () => {
            openModal(manualBarcodeModal);
            if (manualBarcodeInput) manualBarcodeInput.focus();
        });
    }

    if (btnCloseManualModal) {
        btnCloseManualModal.addEventListener('click', () => {
            closeModal(manualBarcodeModal);
        });
    }

    if (btnSendManualBarcode && manualBarcodeInput) {
        const sendManual = () => {
            const barcode = manualBarcodeInput.value.trim();
            if (barcode) {
                processBarcode(barcode);
                manualBarcodeInput.value = '';
                closeModal(manualBarcodeModal);
            }
        };

        btnSendManualBarcode.addEventListener('click', sendManual);
        manualBarcodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendManual();
        });
    }

    // Start Phase 1
    initQRScanner();
});
