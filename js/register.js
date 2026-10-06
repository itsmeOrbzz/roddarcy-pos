let pm;
let cart = []; // Array of { product, quantity }
let currentReceiptNumber = '';

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DB and settings
    await db.init();

    
    // Initialize UI
    initUI();
    
    // Initialize PeerManager
    pm = new PeerManager('register');
    
    pm.onStatusChange((status) => {
        updateConnectionStatus(status);
        if (status === 'connected') {
            document.getElementById('pairing-screen').style.display = 'none';
            document.getElementById('register-layout').style.display = 'grid'; // Assuming grid from styles.css
            playSuccessSound();
        } else if (status === 'disconnected' || status === 'error') {
            document.getElementById('pairing-screen').style.display = 'block';
            document.getElementById('register-layout').style.display = 'none';
        }
    });

    pm.onData(async (data) => {
        if (data.type === 'scan') {
            await handleScan(data.barcode);
        } else if (data.type === 'product_added' && data.product) {
            await db.addProduct(data.product);
            showToast(`New product added: ${data.product.name}`, 'success');
        }
    });

    const peerId = await pm.init();
    document.getElementById('pairing-code-text').textContent = peerId;
    pm.generateQRCode('qr-container');
    
    currentReceiptNumber = generateReceiptNumber();
    renderReceipt();
});

function initUI() {
    // Cart Actions
    document.getElementById('btn-clear-cart').addEventListener('click', clearCart);
    document.getElementById('btn-complete-sale').addEventListener('click', completeSale);
    
    // Receipt Actions
    document.getElementById('btn-share-receipt').addEventListener('click', () => {
        shareReceiptImage(document.getElementById('receipt-content'), 'Receipt');
    });
    document.getElementById('btn-save-receipt').addEventListener('click', () => {
        downloadReceiptImage(document.getElementById('receipt-content'), `Receipt-${currentReceiptNumber}`);
    });
    document.getElementById('btn-print-receipt').addEventListener('click', () => {
        window.print();
    });

    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('btn-settings').addEventListener('click', () => {
        const settings = getStoreSettings();
        document.getElementById('store-name').value = settings.storeName || '';
        document.getElementById('store-address').value = settings.storeAddress || '';
        document.getElementById('store-phone').value = settings.storePhone || '';
        settingsModal.style.display = 'flex';
    });
    document.getElementById('btn-cancel-settings').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        saveStoreSettings({
            ...getStoreSettings(),
            storeName: document.getElementById('store-name').value,
            storeAddress: document.getElementById('store-address').value,
            storePhone: document.getElementById('store-phone').value
        });
        settingsModal.style.display = 'none';
        renderReceipt();
        showToast('Settings saved', 'success', 2000);
    });
}

function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    statusEl.className = 'connection-status';
    
    if (status === 'connected') {
        statusEl.classList.add('connected');
        statusEl.textContent = 'Scanner Connected';
    } else if (status === 'connecting') {
        statusEl.classList.add('connecting');
        statusEl.textContent = 'Connecting...';
    } else {
        statusEl.classList.add('disconnected');
        statusEl.textContent = 'Disconnected';
    }
}

async function handleScan(barcode) {
    const product = await db.getProduct(barcode);
    if (product) {
        addToCart(product);
        playScanBeep();
        pm.sendAck(barcode, product.name);
    } else {
        playErrorBeep();
        pm.sendNotFound(barcode);
        showToast('Product not found: ' + barcode, 'error', 3000);
    }
}

function addToCart(product) {
    const existing = cart.find(item => item.product.barcode === product.barcode);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ product, quantity: 1 });
    }
    updateCartUI();
}

function updateQuantity(barcode, delta) {
    const item = cart.find(i => i.product.barcode === barcode);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.product.barcode !== barcode);
        }
        updateCartUI();
    }
}

function removeFromCart(barcode) {
    cart = cart.filter(i => i.product.barcode !== barcode);
    updateCartUI();
}

function clearCart() {
    cart = [];
    updateCartUI();
}

function updateCartUI() {
    const listEl = document.getElementById('cart-list');
    const emptyState = document.getElementById('cart-empty-state');
    
    // Clear list (except empty state)
    Array.from(listEl.children).forEach(child => {
        if (child.id !== 'cart-empty-state') child.remove();
    });

    if (cart.length === 0) {
        emptyState.style.display = 'flex';
        document.getElementById('btn-clear-cart').disabled = true;
        document.getElementById('btn-complete-sale').disabled = true;
        document.getElementById('cart-item-count').textContent = '0';
        document.getElementById('cart-total-value').textContent = formatCurrency(0);
        renderReceipt();
        return;
    }

    emptyState.style.display = 'none';
    document.getElementById('btn-clear-cart').disabled = false;
    document.getElementById('btn-complete-sale').disabled = false;

    let totalItems = 0;
    let totalValue = 0;

    cart.forEach(item => {
        totalItems += item.quantity;
        const subtotal = item.quantity * item.product.price;
        totalValue += subtotal;

        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item card';
        itemEl.innerHTML = `
            <div class="cart-item-details" style="flex: 1;">
                <div class="cart-item-name">${item.product.name}</div>
                <div class="cart-item-price">${formatCurrency(item.product.price)}</div>
            </div>
            <div class="qty-stepper" style="display: flex; align-items: center; gap: 0.5rem;">
                <button class="btn btn-sm btn-secondary btn-minus" data-barcode="${item.product.barcode}">-</button>
                <span class="qty-val">${item.quantity}</span>
                <button class="btn btn-sm btn-secondary btn-plus" data-barcode="${item.product.barcode}">+</button>
            </div>
            <div class="cart-item-subtotal" style="width: 80px; text-align: right; font-weight: bold;">${formatCurrency(subtotal)}</div>
            <button class="btn btn-icon btn-danger cart-item-remove" data-barcode="${item.product.barcode}">✕</button>
        `;
        listEl.appendChild(itemEl);
    });

    document.getElementById('cart-item-count').textContent = totalItems;
    document.getElementById('cart-total-value').textContent = formatCurrency(totalValue);

    // Bind events
    document.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', (e) => updateQuantity(e.target.dataset.barcode, -1));
    });
    document.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', (e) => updateQuantity(e.target.dataset.barcode, 1));
    });
    document.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => removeFromCart(e.target.dataset.barcode));
    });

    renderReceipt();
}

function renderReceipt() {
    const settings = getStoreSettings();
    const receiptEl = document.getElementById('receipt-content');
    
    let total = 0;
    const itemsHtml = cart.map(item => {
        const subtotal = item.quantity * item.product.price;
        total += subtotal;
        return `
            <div class="receipt-item" style="margin-bottom: 0.5rem;">
                <div class="receipt-item-name">${item.product.name}</div>
                <div class="receipt-item-row" style="display: flex; justify-content: space-between;">
                    <span>${item.quantity} x ${formatCurrency(item.product.price)}</span>
                    <span>${formatCurrency(subtotal)}</span>
                </div>
            </div>
        `;
    }).join('');

    receiptEl.innerHTML = `
        <div class="receipt-header" style="text-align: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">${settings.storeName || 'RodDarcy POS'}</h3>
            <p style="margin: 0; font-size: 0.8rem;">${settings.storeAddress || ''}</p>
            ${settings.storePhone ? `<p style="margin: 0; font-size: 0.8rem;">${settings.storePhone}</p>` : ''}
            <div class="receipt-divider" style="border-bottom: 1px dashed #ccc; margin: 0.5rem 0;"></div>
            <p style="margin: 0; font-size: 0.8rem;">Date: ${formatDateTime(new Date())}</p>
            <p style="margin: 0; font-size: 0.8rem;">Receipt #: ${currentReceiptNumber}</p>
            <div class="receipt-divider" style="border-bottom: 1px dashed #ccc; margin: 0.5rem 0;"></div>
        </div>
        <div class="receipt-items">
            ${itemsHtml}
        </div>
        <div class="receipt-divider" style="border-bottom: 1px dashed #ccc; margin: 0.5rem 0;"></div>
        <div class="receipt-total" style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2rem;">
            <span>Total</span>
            <span>${formatCurrency(total)}</span>
        </div>
        <div class="receipt-divider" style="border-bottom: 1px dashed #ccc; margin: 0.5rem 0;"></div>
        <div class="receipt-footer" style="text-align: center; font-size: 0.8rem;">
            <p>${settings.receiptFooter || 'Thank you for your purchase!'}</p>
        </div>
    `;
}

async function completeSale() {
    if (cart.length === 0) return;

    let total = 0;
    const items = cart.map(i => {
        const subtotal = i.quantity * i.product.price;
        total += subtotal;
        return {
            barcode: i.product.barcode,
            name: i.product.name,
            price: i.product.price,
            quantity: i.quantity,
            subtotal: subtotal
        };
    });

    await db.addTransaction({
        items: items,
        total: total,
        receiptNumber: currentReceiptNumber
    });

    playSuccessSound();
    
    // Show modal
    const modal = document.getElementById('complete-modal');
    modal.style.display = 'flex';
    
    setTimeout(() => {
        modal.style.display = 'none';
        clearCart();
        currentReceiptNumber = generateReceiptNumber();
        renderReceipt();
    }, 2000);
}
