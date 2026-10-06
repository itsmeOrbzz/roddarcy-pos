/* ============================================================
   RodDarcy POS — Shared Utilities & Constants
   ============================================================ */

// ========================
// Categories
// ========================
const CATEGORIES = [
  'Snacks',
  'Beverages',
  'Canned Goods',
  'Noodles',
  'Personal Care',
  'Household',
  'Condiments',
  'Other'
];

// ========================
// Default Product Catalog (Kept empty for custom store setup)
// ========================
const DEFAULT_PRODUCTS = [];



// ========================
// Currency Formatting
// ========================
function formatCurrency(amount) {
  return '₱' + Number(amount).toFixed(2);
}

function formatCurrencyCompact(amount) {
  if (amount >= 1000) {
    return '₱' + (amount / 1000).toFixed(1) + 'k';
  }
  return formatCurrency(amount);
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

function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDateTime(date) {
  return formatDate(date) + ' ' + formatTime(date);
}

function formatDateISO(date) {
  const d = new Date(date);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function getStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}


// ========================
// ID Generation
// ========================
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function generateReceiptNumber() {
  const now = new Date();
  const dateStr = String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return dateStr + '-' + seq;
}


// ========================
// Audio Feedback
// ========================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep(frequency = 1200, duration = 0.12, volume = 0.15) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio not available — fail silently
  }
}

function playScanBeep() {
  playBeep(1200, 0.1, 0.12);
  setTimeout(() => playBeep(1600, 0.08, 0.1), 80);
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
  storeName: 'Your Store Name',
  storeAddress: '123 Main St, Cebu City',
  storePhone: '',
  storeTagline: 'Thank you for your purchase!',
  receiptFooter: 'Please come again!',
  currency: '₱'
};

function getStoreSettings() {
  try {
    const saved = localStorage.getItem('pos_store_settings');
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) { /* use defaults */ }
  return { ...DEFAULT_SETTINGS };
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
// Vibration Feedback
// ========================
function vibrate(pattern = [50]) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}


// ========================
// Debounce Utility
// ========================
function debounce(fn, delay = 300) {
  let timer;
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
          // Fallback to download
          downloadReceiptImage(receiptElement);
        }
      }
    } else {
      // Fallback to download
      downloadReceiptImage(receiptElement);
    }
  }, 'image/png');
}

// ========================
// Register Service Worker
// ========================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
}

