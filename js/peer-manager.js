/* ============================================================
   RodDarcy POS — PeerJS Connection Manager
   Handles WebRTC peer-to-peer communication between
   the Scanner (phone) and Register (iPad)
   ============================================================ */

class PeerManager {
  constructor(role) {
    this.role = role; // 'register' or 'scanner'
    this.peer = null;
    this.connection = null;
    this.peerId = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;

    // Event callbacks
    this._onConnect = null;
    this._onDisconnect = null;
    this._onData = null;
    this._onError = null;
    this._onStatusChange = null;
  }


  // ========================
  // Initialization
  // ========================
  async init() {
    return new Promise((resolve, reject) => {
      // Generate a session ID with a prefix for readability
      const prefix = this.role === 'register' ? 'REG' : 'SCN';
      const randomId = prefix + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      this.peer = new Peer(randomId, {
        debug: 0, // Minimal logging
      });

      this.peer.on('open', (id) => {
        this.peerId = id;
        this._setStatus('waiting');
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this._handleConnection(conn);
      });

      this.peer.on('disconnected', () => {
        this._setStatus('disconnected');
        this._attemptReconnect();
      });

      this.peer.on('error', (err) => {
        console.error('[PeerManager] Error:', err.type, err.message);

        if (err.type === 'peer-unavailable') {
          if (this._onError) this._onError('Peer not found. Check the pairing code.');
        } else if (err.type === 'browser-incompatible') {
          if (this._onError) this._onError('Browser does not support WebRTC.');
        } else if (err.type === 'network') {
          this._setStatus('disconnected');
          this._attemptReconnect();
        } else {
          if (this._onError) this._onError(err.message || 'Connection error');
        }
      });

      // Timeout after 15s
      setTimeout(() => {
        if (!this.peerId) {
          reject(new Error('Failed to connect to signaling server'));
        }
      }, 15000);
    });
  }


  // ========================
  // Connection
  // ========================
  connectToPeer(remotePeerId) {
    if (!this.peer) {
      if (this._onError) this._onError('Peer not initialized');
      return;
    }

    this._setStatus('connecting');

    const conn = this.peer.connect(remotePeerId, {
      reliable: true,
      serialization: 'json'
    });

    this._handleConnection(conn);
  }

  _handleConnection(conn) {
    this.connection = conn;

    conn.on('open', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this._setStatus('connected');

      if (this._onConnect) {
        this._onConnect({
          peerId: conn.peer,
          label: conn.label
        });
      }

      // Send a hello message
      this.send({
        type: 'hello',
        role: this.role,
        timestamp: Date.now()
      });
    });

    conn.on('data', (data) => {
      if (this._onData) {
        this._onData(data);
      }
    });

    conn.on('close', () => {
      this.isConnected = false;
      this.connection = null;
      this._setStatus('disconnected');
      if (this._onDisconnect) this._onDisconnect();
    });

    conn.on('error', (err) => {
      console.error('[PeerManager] Connection error:', err);
      if (this._onError) this._onError(err.message);
    });
  }


  // ========================
  // Send Data
  // ========================
  send(data) {
    if (this.connection && this.connection.open) {
      this.connection.send(data);
      return true;
    }
    return false;
  }

  sendBarcode(barcode) {
    return this.send({
      type: 'barcode',
      barcode: barcode,
      timestamp: Date.now()
    });
  }

  sendAck(barcode, productName) {
    return this.send({
      type: 'ack',
      barcode: barcode,
      productName: productName,
      timestamp: Date.now()
    });
  }

  sendNotFound(barcode) {
    return this.send({
      type: 'not_found',
      barcode: barcode,
      timestamp: Date.now()
    });
  }


  // ========================
  // QR Code Generation
  // ========================
  async generateQRCode(containerId) {
    if (!this.peerId) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
      // Use qrcode.js library
      new QRCode(container, {
        text: this.peerId,
        width: 200,
        height: 200,
        colorDark: '#111111',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // Fallback — display the code as text
      container.innerHTML = `<div class="pairing-code">${this.peerId}</div>`;
    }
  }


  // ========================
  // Reconnection
  // ========================
  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._setStatus('failed');
      if (this._onError) this._onError('Unable to reconnect after multiple attempts');
      return;
    }

    this.reconnectAttempts++;
    this._setStatus('reconnecting');

    setTimeout(() => {
      if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
        this.peer.reconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }


  // ========================
  // Status Management
  // ========================
  _setStatus(status) {
    this.status = status;
    if (this._onStatusChange) this._onStatusChange(status);
  }

  getStatus() {
    return this.status || 'initializing';
  }


  // ========================
  // Event Registration
  // ========================
  onConnect(callback) { this._onConnect = callback; }
  onDisconnect(callback) { this._onDisconnect = callback; }
  onData(callback) { this._onData = callback; }
  onError(callback) { this._onError = callback; }
  onStatusChange(callback) { this._onStatusChange = callback; }


  // ========================
  // Cleanup
  // ========================
  disconnect() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.isConnected = false;
    this._setStatus('disconnected');
  }

  destroy() {
    this.disconnect();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.peerId = null;
  }
}
