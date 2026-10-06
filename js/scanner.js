document.addEventListener('DOMContentLoaded', async () => {
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

    let pm = null;
    let html5QrcodeScanner = null;
    let lastScanTime = 0;
    const SCAN_COOLDOWN = 1500;

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
        await stopScanner();
        
        if (pairingPhase) pairingPhase.classList.remove('hidden');
        if (scanningPhase) scanningPhase.classList.add('hidden');
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
            console.warn("QR Scanner Init Note:", err);
            // Camera permission denied or not available; user can type pairing code manually
        }
    }

    async function stopScanner() {
        if (html5QrcodeScanner) {
            try {
                await html5QrcodeScanner.stop();
                html5QrcodeScanner.clear();
            } catch (e) {
                // Ignore stop errors if already stopped
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

        // Create PeerManager for scanner
        pm = new PeerManager('scanner');

        pm.onStatusChange((status) => {
            if (status === 'connected') {
                updateStatusUI('connected', 'Connected to Register');
                showToast("Connected to register!", "success");
                switchToScanningPhase();
            } else if (status === 'disconnected' || status === 'error') {
                updateStatusUI('disconnected', 'Disconnected');
            }
        });

        pm.onData((data) => {
            if (data.type === 'ACK') {
                if (lastScannedStatus) {
                    lastScannedStatus.textContent = `✅ ${data.name || data.barcode}`;
                    lastScannedStatus.style.color = '#10b981';
                }
                showToast(`Added: ${data.name || data.barcode}`, "success");
            } else if (data.type === 'NOT_FOUND') {
                if (lastScannedStatus) {
                    lastScannedStatus.textContent = `❌ Product not found: ${data.barcode}`;
                    lastScannedStatus.style.color = '#ef4444';
                }
                showToast(`Product not found (${data.barcode})`, "error");
                triggerFlash(true);
                playErrorBeep();
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
        if (pairingPhase) pairingPhase.classList.add('hidden');
        if (scanningPhase) scanningPhase.classList.remove('hidden');
        if (lastScannedStatus) {
            lastScannedStatus.textContent = "Ready to scan product barcodes...";
            lastScannedStatus.style.color = '#f8fafc';
        }

        try {
            html5QrcodeScanner = new Html5Qrcode("barcode-reader");
            const config = { 
                fps: 10, 
                qrbox: { width: 280, height: 140 },
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39
                ]
            };
            
            await html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                onBarcodeScanned,
                (errorMessage) => { /* Frame decode failure - normal */ }
            );
        } catch (err) {
            console.warn("Barcode camera reader notice:", err);
        }
    }

    function onBarcodeScanned(decodedText) {
        const now = Date.now();
        if (now - lastScanTime < SCAN_COOLDOWN) return;
        lastScanTime = now;
        sendBarcodeToRegister(decodedText);
    }
    
    function sendBarcodeToRegister(barcode) {
        if (!pm || !pm.isConnected) {
            showToast("Not connected to register", "error");
            return;
        }
        
        triggerFlash();
        if (typeof vibrate === 'function') vibrate([100]);
        if (typeof playScanBeep === 'function') playScanBeep();
        
        if (lastScannedStatus) {
            lastScannedStatus.textContent = `Sending barcode ${barcode}...`;
            lastScannedStatus.style.color = '#f8fafc';
        }
        
        pm.sendBarcode(barcode);
    }

    function triggerFlash(isError = false) {
        if (!scanFlash) return;
        if (isError) scanFlash.classList.add('flash-red');
        else scanFlash.classList.remove('flash-red');
        
        scanFlash.classList.add('active');
        setTimeout(() => {
            scanFlash.classList.remove('active');
        }, 200);
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
            if (manualBarcodeModal) manualBarcodeModal.classList.remove('hidden');
            if (manualBarcodeInput) manualBarcodeInput.focus();
        });
    }

    if (btnCloseManualModal) {
        btnCloseManualModal.addEventListener('click', () => {
            if (manualBarcodeModal) manualBarcodeModal.classList.add('hidden');
        });
    }

    if (btnSendManualBarcode && manualBarcodeInput) {
        const sendManual = () => {
            const barcode = manualBarcodeInput.value.trim();
            if (barcode) {
                sendBarcodeToRegister(barcode);
                manualBarcodeInput.value = '';
                if (manualBarcodeModal) manualBarcodeModal.classList.add('hidden');
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
