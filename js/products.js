document.addEventListener('DOMContentLoaded', async () => {
    if (window.db) {
        await db.init();
    }
    
    // UI elements
    const tbody = document.getElementById('productsTableBody');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const statTotalProducts = document.getElementById('statTotalProducts');
    const statCategories = document.getElementById('statCategories');
    
    // Product Modal
    const productModal = document.getElementById('productModal');
    const productForm = document.getElementById('productForm');
    const productBarcodeInp = document.getElementById('productBarcode');
    const productNameInp = document.getElementById('productName');
    const productPriceInp = document.getElementById('productPrice');
    const productWholesalePriceInp = document.getElementById('productWholesalePrice');
    const productWholesaleMinQtyInp = document.getElementById('productWholesaleMinQty');
    const productCategoryInp = document.getElementById('productCategory');
    const modalTitle = document.getElementById('modalTitle');
    
    // Scanner Modal
    const scannerModal = document.getElementById('scannerModal');
    const btnScanBarcode = document.getElementById('btnScanBarcode');
    const btnCloseScannerModal = document.getElementById('btnCloseScannerModal');
    let html5QrcodeScanner = null;
    
    // State
    let products = [];
    let isEditing = false;
    let originalBarcode = '';

    // Modal Helpers
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
    
    // Populate categories reliably
    const catList = window.CATEGORIES || [
        'Beverages & Soft Drinks',
        'Snacks & Biscuits',
        'Canned & Packaged Goods',
        'Noodles & Instant Meals',
        'Rice & Bulk Grains',
        'Cooking & Condiments',
        'Personal Care & Toiletries',
        'Household & Cleaning',
        'Paper & Packaging Materials',
        'General Wholesale'
    ];

    if (productCategoryInp && categoryFilter) {
        productCategoryInp.innerHTML = '';
        categoryFilter.innerHTML = '<option value="">All Categories</option>';

        catList.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            productCategoryInp.appendChild(opt);
            
            const filterOpt = document.createElement('option');
            filterOpt.value = cat;
            filterOpt.textContent = cat;
            categoryFilter.appendChild(filterOpt);
        });
    }

    async function loadProducts() {
        products = await db.getAllProducts();
        updateStats();
        renderTable();
    }

    function updateStats() {
        statTotalProducts.textContent = products.length;
        const cats = new Set(products.map(p => p.category));
        statCategories.textContent = cats.size;
    }

    function renderTable() {
        const query = searchInput.value.toLowerCase().trim();
        const category = categoryFilter.value;
        
        const filtered = products.filter(p => {
            const matchesQuery = p.name.toLowerCase().includes(query) || p.barcode.toLowerCase().includes(query);
            const matchesCat = category ? p.category === category : true;
            return matchesQuery && matchesCat;
        });
        
        tbody.innerHTML = '';
        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            emptyState.style.display = 'block';
        } else {
            emptyState.classList.add('hidden');
            emptyState.style.display = 'none';
            filtered.forEach(p => {
                const tr = document.createElement('tr');
                
                let wholesaleTierDisplay = '<span class="text-muted" style="color: var(--color-text-muted); font-size: 0.8rem;">None</span>';
                if (p.wholesalePrice && p.wholesaleMinQty) {
                    wholesaleTierDisplay = `<span style="font-weight: 600; color: var(--color-success, #00e676);">${formatCurrency(p.wholesalePrice)}</span> <span style="font-size: 0.75rem; color: var(--color-text-secondary);">(≥ ${p.wholesaleMinQty} pcs)</span>`;
                }

                tr.innerHTML = `
                    <td style="font-family: var(--font-mono, monospace); font-weight: 600;">${p.barcode}</td>
                    <td style="font-weight: 500;">${p.name}</td>
                    <td><span class="badge badge-outline">${p.category || 'General'}</span></td>
                    <td class="text-right" style="font-weight: 700; color: var(--color-primary, #00d4aa);">${formatCurrency(p.price)}</td>
                    <td class="text-right">${wholesaleTierDisplay}</td>
                    <td class="text-right">
                        <button class="btn btn-icon btn-sm edit-btn" data-barcode="${p.barcode}">✏️ Edit</button>
                        <button class="btn btn-icon btn-sm btn-danger delete-btn" data-barcode="${p.barcode}">🗑️ Del</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    // Search and Filter Listeners
    if (window.debounce) {
        searchInput.addEventListener('input', debounce(() => renderTable(), 250));
    } else {
        searchInput.addEventListener('input', () => renderTable());
    }

    categoryFilter.addEventListener('change', renderTable);
    
    // Table Action Handlers (Edit / Delete)
    tbody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        
        if (editBtn) {
            const barcode = editBtn.dataset.barcode;
            const product = products.find(p => p.barcode === barcode);
            if (product) {
                isEditing = true;
                originalBarcode = barcode;
                modalTitle.textContent = 'Edit Wholesale Product';
                productBarcodeInp.value = product.barcode;
                productNameInp.value = product.name;
                productPriceInp.value = product.price;
                productWholesalePriceInp.value = product.wholesalePrice !== null && product.wholesalePrice !== undefined ? product.wholesalePrice : '';
                productWholesaleMinQtyInp.value = product.wholesaleMinQty !== null && product.wholesaleMinQty !== undefined ? product.wholesaleMinQty : '';
                productCategoryInp.value = product.category || catList[0];
                openModal(productModal);
            }
        } else if (deleteBtn) {
            const barcode = deleteBtn.dataset.barcode;
            const product = products.find(p => p.barcode === barcode);
            const pName = product ? product.name : barcode;
            if (confirm(`Are you sure you want to delete "${pName}" from inventory?`)) {
                await db.deleteProduct(barcode);
                showToast(`Product "${pName}" deleted`, 'success');
                await loadProducts();
            }
        }
    });

    // Open Add Product Modal
    document.getElementById('btnAddProduct').addEventListener('click', () => {
        isEditing = false;
        originalBarcode = '';
        modalTitle.textContent = 'Add Wholesale Product';
        productForm.reset();
        openModal(productModal);
    });

    // Cancel Product Modal
    document.getElementById('btnCancelProduct').addEventListener('click', () => {
        closeModal(productModal);
        stopScanner();
    });

    // Save Product Form Handler
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const barcode = productBarcodeInp.value.trim();
        const name = productNameInp.value.trim();
        const price = parseFloat(productPriceInp.value);
        const wholesalePriceVal = productWholesalePriceInp.value !== '' ? parseFloat(productWholesalePriceInp.value) : null;
        const wholesaleMinQtyVal = productWholesaleMinQtyInp.value !== '' ? parseInt(productWholesaleMinQtyInp.value) : null;
        const category = productCategoryInp.value;
        
        if (!barcode || !name || isNaN(price)) {
            showToast('Please fill in barcode, name, and retail price.', 'error');
            return;
        }

        const product = { 
            barcode, 
            name, 
            price, 
            wholesalePrice: wholesalePriceVal,
            wholesaleMinQty: wholesaleMinQtyVal,
            category 
        };
        
        try {
            if (isEditing && originalBarcode && originalBarcode !== barcode) {
                await db.deleteProduct(originalBarcode);
            }
            await db.addProduct(product);
            showToast(isEditing ? `Updated "${name}"` : `Added "${name}" to wholesale inventory`, 'success');
            closeModal(productModal);
            await loadProducts();
        } catch (err) {
            console.error('Error saving product:', err);
            showToast('Failed to save product: ' + err.message, 'error');
        }
    });

    // Backdrop click close
    productModal.addEventListener('click', (e) => {
        if (e.target === productModal) {
            closeModal(productModal);
            stopScanner();
        }
    });

    scannerModal.addEventListener('click', (e) => {
        if (e.target === scannerModal) {
            stopScanner();
        }
    });

    // Camera Barcode Scanner for Add Product Modal
    btnScanBarcode.addEventListener('click', () => {
        startScanner();
    });

    btnCloseScannerModal.addEventListener('click', () => {
        stopScanner();
    });

    function startScanner() {
        if (typeof Html5Qrcode === 'undefined') {
            showToast('Camera scanner library not available', 'error');
            return;
        }

        openModal(scannerModal);

        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5Qrcode('modalReader');
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        };

        html5QrcodeScanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText) => {
                if (typeof playScanBeep === 'function') playScanBeep();
                productBarcodeInp.value = decodedText;
                showToast(`Scanned barcode: ${decodedText}`, 'success');
                stopScanner();
                setTimeout(() => productNameInp.focus(), 300);
            },
            (errorMessage) => { /* Ignore frame error */ }
        ).catch(err => {
            console.error('Camera access error:', err);
            showToast('Could not access camera. Please enter barcode manually.', 'error');
            stopScanner();
        });
    }

    function stopScanner() {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.stop().then(() => {
                html5QrcodeScanner.clear();
            }).catch(err => {
                console.warn('Scanner stop warning:', err);
            });
            html5QrcodeScanner = null;
        }
        closeModal(scannerModal);
    }

    // Initial load
    await loadProducts();
});
