/* ============================================================
   RodDarcy POS — IndexedDB Database Module
   Stores products and transactions locally on the device
   ============================================================ */

const DB_NAME = 'RodDarcyPOS';
const DB_VERSION = 1;

class ProductDB {
  constructor() {
    this.db = null;
  }

  // ========================
  // Initialization
  // ========================
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Products store — keyed by barcode
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'barcode' });
          productStore.createIndex('category', 'category', { unique: false });
          productStore.createIndex('name', 'name', { unique: false });
        }

        // Transactions store — auto-increment ID
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', {
            keyPath: 'id',
            autoIncrement: true
          });
          txStore.createIndex('timestamp', 'timestamp', { unique: false });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('receiptNumber', 'receiptNumber', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
    });
  }

  _getStore(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }


  // ========================
  // Products CRUD
  // ========================

  async addProduct(product) {
    const store = this._getStore('products', 'readwrite');
    const record = {
      barcode: product.barcode,
      name: product.name,
      price: Number(product.price),
      category: product.category || 'Other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this._promisify(store.put(record));
  }

  async getProduct(barcode) {
    const store = this._getStore('products');
    return this._promisify(store.get(barcode));
  }

  async getAllProducts() {
    const store = this._getStore('products');
    return this._promisify(store.getAll());
  }

  async getProductsByCategory(category) {
    const store = this._getStore('products');
    const index = store.index('category');
    return this._promisify(index.getAll(category));
  }

  async updateProduct(barcode, updates) {
    const existing = await this.getProduct(barcode);
    if (!existing) throw new Error('Product not found: ' + barcode);

    const store = this._getStore('products', 'readwrite');
    const updated = {
      ...existing,
      ...updates,
      barcode: barcode, // Preserve key
      updatedAt: new Date().toISOString()
    };
    return this._promisify(store.put(updated));
  }

  async deleteProduct(barcode) {
    const store = this._getStore('products', 'readwrite');
    return this._promisify(store.delete(barcode));
  }

  async importProducts(products) {
    const tx = this.db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');

    let imported = 0;
    for (const product of products) {
      if (product.barcode && product.name && product.price) {
        store.put({
          barcode: String(product.barcode).trim(),
          name: String(product.name).trim(),
          price: Number(product.price),
          category: product.category || 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        imported++;
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(imported);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getProductCount() {
    const store = this._getStore('products');
    return this._promisify(store.count());
  }

  async searchProducts(query) {
    const all = await this.getAllProducts();
    const q = query.toLowerCase();
    return all.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }

  async seedDefaultProducts() {
    // No-op: products start empty as requested
    return false;
  }



  // ========================
  // Transactions CRUD
  // ========================

  async addTransaction(transaction) {
    const store = this._getStore('transactions', 'readwrite');
    const now = new Date();
    const record = {
      items: transaction.items, // [{barcode, name, price, quantity}]
      itemCount: transaction.items.reduce((sum, i) => sum + i.quantity, 0),
      total: Number(transaction.total),
      timestamp: now.toISOString(),
      date: formatDateISO(now),
      receiptNumber: transaction.receiptNumber || generateReceiptNumber()
    };
    return this._promisify(store.add(record));
  }

  async getTransaction(id) {
    const store = this._getStore('transactions');
    return this._promisify(store.get(id));
  }

  async getAllTransactions() {
    const store = this._getStore('transactions');
    const all = await this._promisify(store.getAll());
    return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async getTransactionsByDateRange(startDate, endDate) {
    const all = await this.getAllTransactions();
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return all.filter(tx => {
      const ts = new Date(tx.timestamp).getTime();
      return ts >= start && ts <= end;
    });
  }

  async getTransactionsByDate(date) {
    const start = getStartOfDay(date);
    const end = getEndOfDay(date);
    return this.getTransactionsByDateRange(start, end);
  }

  async deleteTransaction(id) {
    const store = this._getStore('transactions', 'readwrite');
    return this._promisify(store.delete(id));
  }

  async clearTransactions() {
    const store = this._getStore('transactions', 'readwrite');
    return this._promisify(store.clear());
  }

  async getTransactionCount() {
    const store = this._getStore('transactions');
    return this._promisify(store.count());
  }


  // ========================
  // Sales Summaries
  // ========================

  async getDailySummary(date) {
    const transactions = await this.getTransactionsByDate(date);
    return this._buildSummary(transactions, date);
  }

  async getWeeklySummary(startDate) {
    const start = getStartOfWeek(startDate || new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const transactions = await this.getTransactionsByDateRange(start, end);

    // Build daily breakdown
    const dailyBreakdown = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const dayTxns = transactions.filter(tx =>
        formatDateISO(tx.timestamp) === formatDateISO(day)
      );
      dailyBreakdown.push({
        date: new Date(day),
        ...this._buildSummary(dayTxns, day)
      });
    }

    return {
      startDate: start,
      endDate: end,
      ...this._buildSummary(transactions),
      dailyBreakdown
    };
  }

  async getRecentTransactions(limit = 20) {
    const all = await this.getAllTransactions();
    return all.slice(0, limit);
  }

  _buildSummary(transactions, date) {
    const totalSales = transactions.reduce((sum, tx) => sum + tx.total, 0);
    const totalItems = transactions.reduce((sum, tx) => sum + (tx.itemCount || 0), 0);
    const transactionCount = transactions.length;
    const averageTransaction = transactionCount > 0 ? totalSales / transactionCount : 0;

    // Top products
    const productMap = {};
    transactions.forEach(tx => {
      (tx.items || []).forEach(item => {
        if (!productMap[item.barcode]) {
          productMap[item.barcode] = {
            barcode: item.barcode,
            name: item.name,
            totalQty: 0,
            totalRevenue: 0
          };
        }
        productMap[item.barcode].totalQty += item.quantity;
        productMap[item.barcode].totalRevenue += item.price * item.quantity;
      });
    });

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    return {
      date,
      totalSales,
      totalItems,
      transactionCount,
      averageTransaction,
      topProducts,
      transactions
    };
  }


  // ========================
  // Export
  // ========================

  async exportProductsCSV() {
    const products = await this.getAllProducts();
    const headers = ['barcode', 'name', 'price', 'category'];
    const rows = products.map(p => [
      p.barcode,
      '"' + p.name.replace(/"/g, '""') + '"',
      p.price,
      p.category
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async exportTransactionsCSV(startDate, endDate) {
    let transactions;
    if (startDate && endDate) {
      transactions = await this.getTransactionsByDateRange(startDate, endDate);
    } else {
      transactions = await this.getAllTransactions();
    }

    const headers = ['receipt_number', 'date', 'time', 'items', 'item_count', 'total'];
    const rows = transactions.map(tx => {
      const d = new Date(tx.timestamp);
      const itemsSummary = (tx.items || [])
        .map(i => `${i.name} x${i.quantity}`)
        .join('; ');
      return [
        tx.receiptNumber || '',
        formatDateISO(d),
        formatTime(d),
        '"' + itemsSummary.replace(/"/g, '""') + '"',
        tx.itemCount || 0,
        tx.total
      ];
    });

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

// Singleton instance
const db = new ProductDB();
