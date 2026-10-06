/* ============================================================
   RodDarcy POS — Shared Utilities & Constants
   ============================================================ */

// ========================
// Categories (Explicitly attached to window)
// ========================
window.CATEGORIES = [
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
const CATEGORIES = window.CATEGORIES;

// ========================
// Default Product Catalog (Kept empty for custom store setup)
// ========================
window.DEFAULT_PRODUCTS = [];
const DEFAULT_PRODUCTS = window.DEFAULT_PRODUCTS;


// ========================
// Currency Formatting
// ========================
function formatCurrency(amount) {
  return '₱' + Number(amount || 0).toFixed(2);
}

function formatCurrencyCompact(amount) {
  const num = Number(amount) || 0;
  if (num >= 1000) {
    return '₱' + (num / 1000).toFixed(1) + 'k';
  }
  return formatCurrency(num);
}


// ========================
// Wholesale Pricing Calculation
// ========================
function getEffectiveUnitPrice(product, quantity) {
  const qty = Number(quantity) || 1;
  const retailPrice = Number(product.price) || 0;
  const wholesalePrice = Number(product.wholesalePrice);
  const wholesaleMinQty = Number(product.wholesaleMinQty);

  if (!isNaN(wholesalePrice) && wholesalePrice > 0 && !isNaN(wholesaleMinQty) && wholesaleMinQty > 0) {
    if (qty >= wholesaleMinQty) {
      return {
        unitPrice: wholesalePrice,
        isWholesale: true,
        retailPrice: retailPrice,
        savings: (retailPrice - wholesalePrice) * qty
      };
    }
  }
  return {
    unitPrice: retailPrice,
    isWholesale: false,
    retailPrice: retailPrice,
    savings: 0
  };
}


// ========================
// Date & Time Formatting
// ========================
function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) + ' ' + d.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function generateReceiptNumber() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `WS-${year}${month}${day}-${random}`;
}


// ========================
// Audio Feedback (Beep)
// ========================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playBeep(freq = 800, duration = 0.1, volume = 0.2) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio context not allowed without user gesture
  }
}

function playScanBeep() {
  playBeep(1200, 0.08, 0.2);
}

function playErrorBeep() {
  playBeep(300, 0.25, 0.15);
}

function playSuccessSound() {
  playBeep(800, 0.08, 0.1);
  setTimeout(() => playBeep(1200, 0.08, 0.1), 100);
  setTimeout(() => playBeep(1600, 0.12, 0.1), 200);
}


// ========================
// Haptic Feedback
// ========================
function vibrate(pattern = [50]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}


// ========================
// Toast Notifications
// ========================
function ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'info', duration = 3500) {
  const container = ensureToastContainer();

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


// ========================
// Store Settings
// ========================
const DEFAULT_SETTINGS = {
  storeName: 'Wholesale Store',
  storeAddress: 'Cebu City, Philippines',
  storePhone: '',
  storeTagline: 'Quality Wholesale & Retail',
  receiptFooter: 'Thank you for your business!',
  currency: '₱'
};

function getStoreSettings() {
  try {
    const saved = localStorage.getItem('pos_store_settings');
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    // Ignore localStorage error
  }
  return DEFAULT_SETTINGS;
}

function saveStoreSettings(settings) {
  try {
    localStorage.setItem('pos_store_settings', JSON.stringify(settings));
    return true;
  } catch (e) {
    return false;
  }
}


// ========================
// Debounce Helper
// ========================
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}


// ========================
// Share / Download Receipt
// ========================
async function captureReceiptImage(receiptElement) {
  if (typeof html2canvas === 'undefined') {
    showToast('Image capture library not loaded', 'error');
    return null;
  }
  try {
    const canvas = await html2canvas(receiptElement, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas;
  } catch (e) {
    showToast('Failed to capture receipt', 'error');
    return null;
  }
}

async function downloadReceiptImage(receiptElement, filename) {
  const canvas = await captureReceiptImage(receiptElement);
  if (!canvas) return;

  const link = document.createElement('a');
  link.download = filename || `receipt-${generateReceiptNumber()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Receipt image saved!', 'success');
}

async function shareReceiptImage(receiptElement, title) {
  const canvas = await captureReceiptImage(receiptElement);
  if (!canvas) return;

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], `receipt-${generateReceiptNumber()}.png`, { type: 'image/png' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: title || 'Receipt',
          files: [file]
        });
        showToast('Receipt shared!', 'success');
      } catch (e) {
        if (e.name !== 'AbortError') {
          downloadReceiptImage(receiptElement);
        }
      }
    } else {
      downloadReceiptImage(receiptElement);
    }
  }, 'image/png');
}

// ========================
// Register Service Worker
// ========================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
}
