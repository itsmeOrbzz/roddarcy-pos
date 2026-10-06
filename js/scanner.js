document.addEventListener('DOMContentLoaded', async () => {
    const pairingView = document.getElementById('pairing-view');
    const scannerView = document.getElementById('scanner-view');
    const manualPeerIdInput = document.getElementById('manual-peer-id');
    const btnConnectManual = document.getElementById('btn-connect-manual');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const manualBarcodeInput = document.getElementById('manual-barcode');
    const btnSubmitBarcode = document.getElementById('btn-submit-barcode');
    const scanStatus = document.getElementById('scan-status');
    const scanFlash = document.getElementById('scan-flash');
    const reticle = document.getElementById('reticle');

    let pm = null;
    let html5QrcodeScanner = null;
    let lastScanTime = 0;
    const SCAN_COOLDOWN = 1500;

    // Initialize Phase 1 (QR Scanner)
    async function initQRScanner() {
        if (html5QrcodeScanner) {
            await stopScanner();
        }
        
        pairingView.classList.add('active-view');
        scannerView.classList.remove('active-view');
        reticle.style.display = 'none';

        try {
            html5QrcodeScanner = new Html5Qrcode("qr-reader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            
            await html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                onQRScanned,
                (errorMessage) => { /* Ignore noisy frame errors */ }
            );
        } catch (err) {
            console.error("QR Scanner Init Error:", err);
            showToast("Camera access denied or unavailable. Please use manual entry.", "error");
        }
    }

    async function stopScanner() {
        if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
            await html5QrcodeScanner.stop();
            html5QrcodeScanner.clear();
        }
        html5QrcodeScanner = null;
    }

    async function onQRScanned(decodedText, decodedResult) {
        if (pm && pm.isConnected) return;
        
        showToast("QR Scanned! Connecting...", "success");
        await connectToRegister(decodedText);
    }

    async function connectToRegister(peerId) {
        await stopScanner();
        
        pm = new PeerManager('scanner');
        
        pm.onConnect(() => {
            showToast("Connected to register!", "success");
            startBarcodeScanner();
        });
        
        pm.onDisconnect(() => {
            showToast("Disconnected from register", "warning");
            if (pm) pm.destroy();
            pm = null;
            initQRScanner();
        });
        
        pm.onData((data) => {
            if (data.type === 'ACK') {
                scanStatus.textContent = `✅ ${data.name || data.barcode}`;
                scanStatus.style.color = '#10b981';
            } else if (data.type === 'NOT_FOUND') {
                showToast("Product not found", "error");
                scanStatus.textContent = `❌ Unknown: ${data.barcode}`;
                scanStatus.style.color = '#ef4444';
                triggerFlash(true);
                playErrorBeep();
            }
        });

        await pm.init();
        const success = await pm.connectToPeer(peerId);
        if (!success) {
            showToast("Failed to connect. Make sure register is open.", "error");
            if (pm) pm.destroy();
            pm = null;
            initQRScanner();
        }
    }

    // Phase 2: Barcode Scanner
    async function startBarcodeScanner() {
        pairingView.classList.remove('active-view');
        scannerView.classList.add('active-view');
        reticle.style.display = 'block';
        scanStatus.textContent = "Ready to scan...";
        scanStatus.style.color = '#f8fafc';

        try {
            html5QrcodeScanner = new Html5Qrcode("barcode-reader");
            const config = { 
                fps: 10, 
                qrbox: { width: 300, height: 150 },
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
                (errorMessage) => { /* Ignore */ }
            );
        } catch (err) {
            console.error("Barcode Scanner Init Error:", err);
            showToast("Failed to start barcode scanner", "error");
        }
    }

    function onBarcodeScanned(decodedText, decodedResult) {
        const now = Date.now();
        if (now - lastScanTime < SCAN_COOLDOWN) return;
        
        lastScanTime = now;
        processBarcode(decodedText);
    }
    
    function processBarcode(barcode) {
        if (!pm || !pm.isConnected) {
            showToast("Not connected to register", "error");
            return;
        }
        
        triggerFlash();
        if (typeof vibrate === 'function') vibrate([100]);
        if (typeof playScanBeep === 'function') playScanBeep();
        
        scanStatus.textContent = `Scanning ${barcode}...`;
        scanStatus.style.color = '#f8fafc';
        
        pm.sendBarcode(barcode);
    }

    function triggerFlash(isError = false) {
        if (isError) scanFlash.classList.add('flash-red');
        else scanFlash.classList.remove('flash-red');
        
        scanFlash.classList.add('active');
        setTimeout(() => {
            scanFlash.classList.remove('active');
        }, 200);
    }

    btnConnectManual.addEventListener('click', () => {
        const id = manualPeerIdInput.value.trim();
        if (id) connectToRegister(id);
    });

    btnDisconnect.addEventListener('click', () => {
        if (pm) pm.disconnect();
    });

    btnSubmitBarcode.addEventListener('click', () => {
        const barcode = manualBarcodeInput.value.trim();
        if (barcode) {
            processBarcode(barcode);
            manualBarcodeInput.value = '';
        }
    });

    manualBarcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnSubmitBarcode.click();
        }
    });

    // Start Phase 1
    initQRScanner();
});
