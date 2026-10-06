document.addEventListener('DOMContentLoaded', async () => {
    if (window.db) {
        await db.init();
    }

    const dateSelector = document.getElementById('dateSelector');
    const btnToday = document.getElementById('btnToday');
    const btnThisWeek = document.getElementById('btnThisWeek');
    const reportTitle = document.getElementById('reportTitle');
    
    // Stats
    const statSales = document.getElementById('statSales');
    const statTxCount = document.getElementById('statTxCount');
    const statItems = document.getElementById('statItems');
    const statAvg = document.getElementById('statAvg');
    
    // Lists & Chart
    const topProductsList = document.getElementById('topProductsList');
    const transactionsList = document.getElementById('transactionsList');
    const emptyTransactions = document.getElementById('emptyTransactions');
    const salesChart = document.getElementById('salesChart');
    const chartTitle = document.getElementById('chartTitle');

    // Init Date
    const today = new Date();
    dateSelector.value = formatDateISO(today);
    
    let currentMode = 'day'; // 'day' or 'week'

    async function loadSummary() {
        const selectedDate = new Date(dateSelector.value);
        if (isNaN(selectedDate.getTime())) return;
        
        let summary;
        if (currentMode === 'day') {
            reportTitle.textContent = `Summary for ${formatDate(selectedDate)}`;
            summary = await db.getDailySummary(selectedDate);
            chartTitle.textContent = 'Daily view (Switch to week for chart)'; 
            renderChart([]); // Clear chart for daily for now
        } else {
            const startOfWeek = getStartOfWeek(selectedDate);
            reportTitle.textContent = `Weekly Summary (Week of ${formatDate(startOfWeek)})`;
            summary = await db.getWeeklySummary(startOfWeek);
            chartTitle.textContent = 'Daily Sales';
            renderChart(summary.dailyBreakdown || []);
        }

        // Render Stats
        statSales.textContent = formatCurrency(summary.totalSales);
        statTxCount.textContent = summary.transactionCount;
        statItems.textContent = summary.totalItems;
        statAvg.textContent = formatCurrency(summary.averageTransaction);

        // Render Top Products
        renderTopProducts(summary.topProducts);

        // Render Transactions
        renderTransactions(summary.transactions);
    }

    function renderTopProducts(products) {
        topProductsList.innerHTML = '';
        if (!products || products.length === 0) {
            topProductsList.innerHTML = '<p class="text-text-muted text-sm italic">No data</p>';
            return;
        }

        products.forEach(p => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center bg-surface-light p-2 rounded';
            div.innerHTML = `
                <div class="flex flex-col">
                    <span class="font-bold text-sm">${p.name}</span>
                    <span class="text-xs text-text-muted">${p.quantity} sold</span>
                </div>
                <div class="font-bold text-primary">${formatCurrency(p.revenue)}</div>
            `;
            topProductsList.appendChild(div);
        });
    }

    function renderChart(dailyData) {
        salesChart.innerHTML = '';
        if (!dailyData || dailyData.length === 0) {
            salesChart.innerHTML = '<div class="w-full text-center text-text-muted self-center">Chart data only available in weekly view</div>';
            return;
        }

        const maxSales = Math.max(...dailyData.map(d => d.totalSales), 1);
        
        dailyData.forEach(day => {
            const heightPercent = (day.totalSales / maxSales) * 100;
            const barWrapper = document.createElement('div');
            barWrapper.className = 'bar-wrapper';
            barWrapper.innerHTML = `
                <div class="bar-value">${formatCurrencyCompact(day.totalSales)}</div>
                <div class="bar" style="height: ${Math.max(heightPercent, 2)}%;"></div>
                <div class="bar-label">${day.dayName.substring(0,3)}</div>
            `;
            salesChart.appendChild(barWrapper);
        });
    }

    function renderTransactions(transactions) {
        Array.from(transactionsList.children).forEach(child => {
            if (child.id !== 'emptyTransactions') {
                child.remove();
            }
        });

        if (!transactions || transactions.length === 0) {
            emptyTransactions.classList.remove('hidden');
            return;
        }

        emptyTransactions.classList.add('hidden');
        
        transactions.sort((a, b) => b.timestamp - a.timestamp); // newest first

        transactions.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'transaction-card';
            
            const date = new Date(tx.timestamp);
            const timeStr = formatTime(date);
            
            let itemsHtml = tx.items.map(item => `
                <div class="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                    <div>
                        <span>${item.name}</span>
                        <span class="text-text-muted ml-2">${item.quantity}x @ ${formatCurrency(item.price)}</span>
                    </div>
                    <span>${formatCurrency(item.subtotal)}</span>
                </div>
            `).join('');

            card.innerHTML = `
                <div class="transaction-header">
                    <div>
                        <div class="font-bold">#${tx.receiptNumber}</div>
                        <div class="text-xs text-text-muted">${formatDate(date)} ${timeStr}</div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-right">
                            <div class="font-bold text-primary">${formatCurrency(tx.total)}</div>
                            <div class="text-xs text-text-muted">${tx.items.reduce((sum, item) => sum + item.quantity, 0)} items</div>
                        </div>
                        <span class="text-xl toggle-icon transition-transform duration-200">▼</span>
                    </div>
                </div>
                <div class="transaction-details">
                    <div class="bg-body p-3 rounded mb-2">
                        ${itemsHtml}
                    </div>
                </div>
            `;

            const header = card.querySelector('.transaction-header');
            const details = card.querySelector('.transaction-details');
            const icon = card.querySelector('.toggle-icon');
            
            header.addEventListener('click', () => {
                details.classList.toggle('expanded');
                icon.style.transform = details.classList.contains('expanded') ? 'rotate(180deg)' : '';
            });

            transactionsList.appendChild(card);
        });
    }

    // Event Listeners
    dateSelector.addEventListener('change', () => {
        currentMode = 'day';
        loadSummary();
    });

    btnToday.addEventListener('click', () => {
        currentMode = 'day';
        dateSelector.value = formatDateISO(new Date());
        loadSummary();
    });

    btnThisWeek.addEventListener('click', () => {
        currentMode = 'week';
        loadSummary();
    });

    document.getElementById('btnExportTransactions').addEventListener('click', async () => {
        // Attempt to export all transactions since DB usually handles this without params
        try {
            const csv = await db.exportTransactionsCSV();
            if (csv) {
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transactions_${formatDateISO(new Date())}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            showToast('Error exporting data', 'error');
        }
    });

    document.getElementById('btnClearHistory').addEventListener('click', async () => {
        if (confirm('WARNING: This will permanently delete ALL transaction history. Are you sure?')) {
            if (confirm('Please confirm again. This action CANNOT be undone.')) {
                await db.clearTransactions();
                showToast('History cleared', 'success');
                loadSummary();
            }
        }
    });

    // Init
    loadSummary();
});
