class ElectionAdmin {
    constructor() {
        this.currentSection = 'dashboard';
        this.charts = {};
        this.initializeEventListeners();
        this.initializeFinalWinnersFilter();
        this.showSection('dashboard');
        
        // Load dashboard data when initialized
        this.loadDashboardData();
    }

    // Render Final Winners as a data table into the winners-grid, preserving the header and filters
    // ...removed custom renderFinalWinnersTable; use renderTable for all tables...

    initializeFinalWinnersFilter() {
        // Store original data for filtering
        if (!this.winnersData) {
            this.winnersData = [];
        }
        
        // Mark that we've initialized to prevent duplicate setup
        if (this.filtersInitialized) {
            console.log('⚠️ Filters already initialized, skipping...');
            return;
        }
        
        console.log('=== Initializing Final Winners Filter ===');
        
        // Search input filter
        const searchInput = document.getElementById('winnerSearchInput');
        const positionFilter = document.getElementById('finalWinnersPositionFilter');
        const clearBtn = document.getElementById('clearFilters');
        
        console.log('Elements found:', {
            searchInput: !!searchInput,
            positionFilter: !!positionFilter,
            clearBtn: !!clearBtn,
            winnersDataCount: this.winnersData.length
        });
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                console.log('🔍 Search input changed:', e.target.value);
                this.filterWinners();
            });
            console.log('✓ Search input listener attached');
        }
        
        if (positionFilter) {
            positionFilter.addEventListener('change', (e) => {
                console.log('📊 Position filter changed to:', e.target.value);
                console.log('📊 Selected option text:', e.target.options[e.target.selectedIndex].text);
                this.filterWinners();
            });
            console.log('✓ Position filter listener attached');
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                console.log('🧹 Clear filters clicked');
                const searchInputCurrent = document.getElementById('winnerSearchInput');
                const positionFilterCurrent = document.getElementById('finalWinnersPositionFilter');
                if (searchInputCurrent) searchInputCurrent.value = '';
                if (positionFilterCurrent) positionFilterCurrent.value = '';
                
                // Show all data
                const section = document.querySelector('#final-winners .winners-grid');
                if (section && this.winnersData && this.winnersData.length > 0) {
                    this.renderTable(this.winnersData, section);
                } else {
                    this.filterWinners();
                }
            });
            console.log('✓ Clear button listener attached');
        }
        
        // Save Winners button
        const saveWinnersBtn = document.getElementById('saveWinnersBtn');
        if (saveWinnersBtn) {
            saveWinnersBtn.addEventListener('click', async (e) => {
                console.log('💾 Save winners button clicked');
                
                // Confirm action
                if (!confirm('This will calculate winners from the Vote table and save them to the FinalWinners table. This will replace any existing winners. Continue?')) {
                    return;
                }
                
                // Disable button and show loading
                saveWinnersBtn.disabled = true;
                saveWinnersBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
                
                try {
                    const response = await fetch('/api/tables/final-winners/calculate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        alert(`✅ Success!\n\nSaved ${result.data.saved} winners to the database.\n\nDetails:\n- Total Winners: ${result.data.total}\n- Saved: ${result.data.saved}\n- Skipped: ${result.data.skipped}`);
                        
                        // Reload the winners table
                        this.loadTable('final-winners');
                    } else {
                        alert(`❌ Error: ${result.message || result.error}`);
                    }
                } catch (error) {
                    console.error('Error saving winners:', error);
                    alert(`❌ Failed to save winners: ${error.message}`);
                } finally {
                    // Re-enable button
                    saveWinnersBtn.disabled = false;
                    saveWinnersBtn.innerHTML = '<i class="fas fa-save"></i> Calculate & Save Winners';
                }
            });
            console.log('✓ Save winners button listener attached');
        }
        
        this.filtersInitialized = true;
        console.log('=== Filter initialization complete ===');
    }
    
    filterWinners() {
        const searchInput = document.getElementById('winnerSearchInput');
        const positionFilter = document.getElementById('finalWinnersPositionFilter');
        
        // Save current filter values BEFORE reading them
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const position = positionFilter ? positionFilter.value.trim() : '';
        
        // Save for restoration after render
        this.savedSearchValue = searchInput ? searchInput.value : '';
        this.savedPositionValue = positionFilter ? positionFilter.value : '';
        
        console.log('🔄 ===== FILTER WINNERS CALLED =====');
        console.log('🔄 Search term:', searchTerm);
        console.log('🔄 Position value:', position);
        console.log('🔄 Saved for restoration:', { search: this.savedSearchValue, position: this.savedPositionValue });
        
        // Check if winnersData is initialized
        if (!this.winnersData || !Array.isArray(this.winnersData)) {
            console.error('Winners data not initialized');
            return;
        }
        
        if (this.winnersData.length === 0) {
            console.warn('Winners data is empty');
            const section = document.querySelector('#final-winners .winners-grid');
            if (section) {
                section.innerHTML = `
                    <div class="no-data" style="padding: 2rem; text-align: center; background: #f8fafc; border-radius: 8px; margin: 1rem 0;">
                        <i class="fas fa-inbox" style="font-size: 2rem; color: #94a3b8; margin-bottom: 1rem;"></i>
                        <p style="font-size: 1.1rem; color: #64748b; margin: 0.5rem 0;">No winners data available</p>
                        <p style="font-size: 0.9rem; color: #94a3b8; margin: 0;">Please load the data first</p>
                    </div>
                `;
            }
            return;
        }
        
        console.log('Winners data available:', this.winnersData.length, 'records');
        
        // Start with all data
        let filtered = [...this.winnersData];
        
        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(row => {
                return Object.values(row).some(val => {
                    if (val === null || val === undefined) return false;
                    return String(val).toLowerCase().includes(searchTerm);
                });
            });
            console.log('✅ After search filter:', filtered.length, 'records');
        }
        
        // Apply position filter (only if a specific position is selected)
        if (position && position !== '' && position.toUpperCase() !== 'ALL') {
            filtered = filtered.filter(row => {
                // Check multiple possible column names
                const posCol = row.PositionID || row.positionid || row.Position || row.position || 
                              row.POSITIONID || row.PositionId || '';
                const posValue = String(posCol).trim().toUpperCase();
                const filterValue = position.toUpperCase();
                const match = posValue === filterValue || posValue.includes(filterValue);
                
                return match;
            });
            console.log('✅ After position filter:', filtered.length, 'records');
        } else {
            console.log('⚠️ No position filter applied (showing all positions)');
        }
        
        console.log(`✅ Filtering complete: ${this.winnersData.length} total → ${filtered.length} filtered`);
        
        // Re-render the table with filtered data
        const section = document.querySelector('#final-winners .winners-grid');
        if (section) {
            this.renderTable(filtered, section);
            
            // Restore filter values after render (they get reset by innerHTML)
            setTimeout(() => {
                const searchInputAfter = document.getElementById('winnerSearchInput');
                const positionFilterAfter = document.getElementById('finalWinnersPositionFilter');
                
                if (searchInputAfter && this.savedSearchValue !== undefined) {
                    searchInputAfter.value = this.savedSearchValue;
                }
                if (positionFilterAfter && this.savedPositionValue !== undefined) {
                    positionFilterAfter.value = this.savedPositionValue;
                }
                
                console.log('🔄 Restored filter values:', { search: this.savedSearchValue, position: this.savedPositionValue });
            }, 10);
        }
    }

    initializeEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.showSection(section);
            });
        });

        const chartFilter = document.getElementById('chartTypeFilter');
        if (chartFilter) {
            chartFilter.addEventListener('change', (e) => {
                this.loadCharts(e.target.value);
            });
        }

        const downloadBtn = document.getElementById('downloadReport');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.downloadReport('csv');
            });
        }

        const viewReportBtn = document.getElementById('viewReport');
        if (viewReportBtn) {
            viewReportBtn.addEventListener('click', () => {
                this.viewReport('summary');
            });
        }

        const refreshBtn = document.getElementById('refreshData');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshCurrentSection();
            });
        }

        // Add click handler for dashboard refresh action card
        document.addEventListener('click', (e) => {
            if (e.target.closest('.action-card[data-action="refresh"]')) {
                this.loadDashboardData();
            }
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.location.href = '/login.html';
            });
        }

        // Political parties dashboard loader
        const loadPartiesBtn = document.getElementById('loadPoliticalParties');
        if (loadPartiesBtn) {
            loadPartiesBtn.addEventListener('click', () => this.loadPoliticalPartiesDashboard());
        }

        // System status refresh button
        const refreshStatusBtn = document.getElementById('refreshStatus');
        if (refreshStatusBtn) {
            refreshStatusBtn.addEventListener('click', () => this.loadSystemStatus());
        }
    }

    showSection(sectionName) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
        });

        const targetSection = document.getElementById(sectionName);
        if (targetSection) {
            targetSection.style.display = 'block';
        }

        const navItem = document.querySelector(`[data-section="${sectionName}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        this.currentSection = sectionName;

        // Map section names to API endpoints
        const sectionToEndpoint = {
            'voters': 'voters',
            'candidates': 'candidates', 
            'parties': 'parties',
            'political-parties': 'parties',
            'districts': 'districts',
            'constituencies': 'constituencies',
            'wards': 'wards',
            'polling-stations': 'polling-stations',
            'elections': 'elections',
            'votes': 'votes',
            'final-winners': 'final-winners',
            'eligible-citizens': 'eligible-citizens',
            'positions': 'positions',
            'running-mates': 'running-mates',
            'election-officials': 'election-officials',
            'party-agents': 'party-agents',
            'ballots': 'ballots',
            'logistics': 'logistics',
            'incidents': 'incidents'
        };

        switch (sectionName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'status':
                this.loadSystemStatus();
                break;
            case 'political-parties':
                this.loadPoliticalPartiesDashboard();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
            case 'results':
                this.loadResults();
                break;
            case 'charts':
                this.loadCharts();
                break;
            case 'winners':
                this.loadTable('final-winners');
                break;
            case 'final-winners':
                this.loadTable('final-winners');
                break;
            case 'summary':
                this.loadSummary();
                break;
            default:
                if (sectionToEndpoint[sectionName]) {
                    this.loadTable(sectionToEndpoint[sectionName]);
                }
                break;
        }
    }

    async loadSystemStatus() {
        const loadingEl = document.getElementById('statusLoading');
        const contentEl = document.getElementById('statusContent');
        
        try {
            if (loadingEl) loadingEl.style.display = 'block';
            if (contentEl) contentEl.style.display = 'none';

            const response = await fetch('/api/system/status?detail=full', {
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Failed to fetch system status`);
            }

            const result = await response.json();
            const data = result.data || {};
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) {
                contentEl.classList.remove('hide'); // Remove the hide class!
                contentEl.style.display = 'block';
                this.renderSystemStatus(data);
            }
        } catch (error) {
            console.error('Error loading system status:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) {
                contentEl.classList.remove('hide'); // Remove the hide class!
                contentEl.style.display = 'block';
                contentEl.innerHTML = `
                    <div class="error-state">
                        <h3>Error Loading System Status</h3>
                        <p>${error.message}</p>
                        <button class="btn" onclick="admin.loadSystemStatus()">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>`;
            }
        }
    }

    renderSystemStatus(data) {
        const contentEl = document.getElementById('statusContent');
        if (!contentEl) return;

        const isHealthy = data.database && data.database.healthy;
        const statusClass = isHealthy ? 'healthy' : 'unhealthy';
        const statusIcon = isHealthy ? 'fa-check-circle' : 'fa-exclamation-triangle';
        const statusText = isHealthy ? 'Healthy' : 'Issues Detected';
        
        const html = `
            <div class="status-overview ${statusClass}">
                <div class="status-indicator">
                    <i class="fas ${statusIcon}"></i>
                    <h2>System Status: ${statusText}</h2>
                </div>
            </div>
            
            <div class="status-grid">
                <div class="status-card ${data.database?.healthy ? 'status-ok' : 'status-error'}">
                    <h3><i class="fas fa-database"></i> Database</h3>
                    <p class="status-value">${data.database?.healthy ? 'Connected' : 'Disconnected'}</p>
                    ${data.database?.error ? `<p class="status-error-msg">${data.database.error}</p>` : ''}
                    ${data.database?.responseTimeMs ? `<p class="status-detail">Response: ${data.database.responseTimeMs}ms</p>` : ''}
                </div>
                
                <div class="status-card status-ok">
                    <h3><i class="fas fa-server"></i> Server</h3>
                    <p class="status-value">Running</p>
                    <p class="status-detail">Uptime: ${this.formatUptime(data.server?.uptimeSeconds || 0)}</p>
                </div>
                
                <div class="status-card status-ok">
                    <h3><i class="fas fa-memory"></i> Memory</h3>
                    <p class="status-value">${this.formatBytes(process.memoryUsage?.() ? process.memoryUsage().heapUsed : 0)}</p>
                    <p class="status-detail">Heap Used</p>
                </div>
                
                <div class="status-card status-ok">
                    <h3><i class="fas fa-clock"></i> DB Response</h3>
                    <p class="status-value">${data.database?.responseTimeMs || 'N/A'}${data.database?.responseTimeMs ? 'ms' : ''}</p>
                    <p class="status-detail">Query Time</p>
                </div>
            </div>
            
            <div class="status-details">
                <h3>System Information</h3>
                <table class="data-table">
                    <tbody>
                        <tr>
                            <td><strong>Node Version:</strong></td>
                            <td>${process.version || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td><strong>Platform:</strong></td>
                            <td>${process.platform || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td><strong>DB Connections:</strong></td>
                            <td>${data.database?.threadsConnected || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td><strong>Last Check:</strong></td>
                            <td>${data.server?.time ? new Date(data.server.time).toLocaleString() : new Date().toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        
        contentEl.innerHTML = html;
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    async loadPoliticalPartiesDashboard(filters = {}) {
        const loadingEl = document.getElementById('politicalPartiesLoading');
        const contentEl = document.getElementById('politicalPartiesContent');
        
        try {
            // Show loading state
            if (loadingEl) loadingEl.style.display = 'block';
            if (contentEl) {
                contentEl.style.display = 'none';
                contentEl.innerHTML = '';
            }
            
            const params = new URLSearchParams();
            params.append('limit', 'all');
            if (filters.search) params.append('search', filters.search);
            
            const url = '/api/tables/parties?' + params.toString();
            console.log('Fetching parties from:', url);
            
            const resp = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
            if (!resp.ok) throw new Error(`Failed (${resp.status}) to load parties`);
            
            const json = await resp.json();
            console.log('Parties response:', json);
            console.log('Parties success:', json.success);
            console.log('Parties data:', json.data);
            console.log('Number of parties:', json.data ? json.data.length : 0);
            
            if (!json.success) throw new Error(json.error || json.warning || 'Unknown party error');
            
            const parties = json.data || [];
            console.log('About to render', parties.length, 'parties');
            
            // Hide loading, show content
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) {
                contentEl.classList.remove('hide'); // Remove the hide class!
                contentEl.style.display = 'block';
            }
            
            this.renderPartiesTable(parties, contentEl);
            console.log('Render complete');
        } catch (err) {
            console.error('Party load error:', err);
            
            // Hide loading on error
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (contentEl) {
                contentEl.classList.remove('hide'); // Remove the hide class!
                contentEl.innerHTML = `<div class="error-state"><h3>Party Load Error</h3><p>${err.message}</p><button class="btn" onclick="admin.loadPoliticalPartiesDashboard()"><i class="fas fa-redo"></i> Retry</button></div>`;
                contentEl.style.display = 'block';
            }
        }
    }

    renderPartiesTable(parties, container) {
        console.log('renderPartiesTable called with:', parties.length, 'parties');
        console.log('Container element:', container);
        
        if (!container) {
            console.error('No container element provided!');
            return;
        }
        container.style.display = 'block';
        
        if (!parties || parties.length === 0) {
            console.log('No parties data, showing empty message');
            container.innerHTML = '<div class="no-data"><p>No political parties found in the database.</p></div>';
            return;
        }
        
        console.log('Rendering', parties.length, 'parties. First party:', parties[0]);
        
        const header = `
            <div class="summary-bar">
                <span><strong>Total Parties:</strong> ${parties.length}</span>
            </div>`;
            
        let table = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Party Name</th>
                            <th>Symbol</th>
                        </tr>
                    </thead>
                    <tbody>`;
                    
        table += parties.map((party, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${party.PartyName || 'N/A'}</strong></td>
                <td>${party.Symbol || 'N/A'}</td>
            </tr>`).join('');
            
        table += '</tbody></table></div>';
        container.innerHTML = header + table;
    }

    renderPartyDashboard(rows, totals, container) {
        if (!container) return;
        container.style.display = 'block';
        if (!rows || rows.length === 0) {
            container.innerHTML = '<div class="no-data"><p>No party performance data available.</p></div>';
            return;
        }
        const header = `
            <div class="summary-bar">
                <span><strong>Total Parties:</strong> ${rows.length}</span>
                <span><strong>All Party Votes:</strong> ${(totals.totalVotesAll||0).toLocaleString()}</span>
                <span><strong>Total Winners:</strong> ${(totals.totalWinnersAll||0).toLocaleString()}</span>
            </div>`;
        let table = `
            <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Party</th>
                        <th>Symbol</th>
                        <th>Candidates</th>
                        <th>Total Votes</th>
                        <th>Avg Votes/Candidate</th>
                        <th>Winners</th>
                        <th>Vote Share %</th>
                        <th>Seat Share %</th>
                    </tr>
                </thead>
                <tbody>`;
        table += rows.map(r => `
            <tr>
                <td>${r.partyName || ''}</td>
                <td>${r.symbol || ''}</td>
                <td>${r.totalCandidates}</td>
                <td>${(r.totalVotes||0).toLocaleString()}</td>
                <td>${r.averageVotesPerCandidate}</td>
                <td>${r.winners}</td>
                <td>${r.voteSharePercent}%</td>
                <td>${r.seatSharePercent}%</td>
            </tr>`).join('');
        table += '</tbody></table></div>';
        container.innerHTML = header + table;
    }

    async loadDashboard() {
        try {
            const statsResponse = await fetch('/api/results/summary');
            const statsData = await statsResponse.json();
            
            if (statsData.success) {
                this.updateDashboardStats(statsData.data);
                this.loadCharts();
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    async loadResults() {
        const section = document.getElementById('results');
        if (!section) return;

        // Add filters to results section
        section.innerHTML = `
            <div class="results-filter" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; gap: 15px; align-items: center; justify-content: center; flex-wrap: wrap;">
                    <div>
                        <label for="resultsPositionFilter" style="margin-right: 5px; font-weight: bold;">Position:</label>
                        <select id="resultsPositionFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Positions</option>
                            <option value="PRES">President</option>
                            <option value="MP">Member of Parliament</option>
                            <option value="COUNC">Ward Councillor</option>
                        </select>
                    </div>
                    <div id="resultsConstituencyFilterDiv" style="display: none;">
                        <label for="resultsConstituencyFilter" style="margin-right: 5px; font-weight: bold;">Constituency:</label>
                        <select id="resultsConstituencyFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Constituencies</option>
                        </select>
                    </div>
                    <div id="resultsWardFilterDiv" style="display: none;">
                        <label for="resultsWardFilter" style="margin-right: 5px; font-weight: bold;">Ward:</label>
                        <select id="resultsWardFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Wards</option>
                        </select>
                    </div>
                    <button id="applyResultsFilter" style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Apply Filter</button>
                </div>
            </div>
            <div id="resultsContent">
                <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading live results...</div>
            </div>
        `;

        // Setup filter event listeners
        this.setupResultsFilters();
        
        // Load initial data
        this.loadResultsData();
    }

    setupResultsFilters() {
        setTimeout(() => {
            const positionFilter = document.getElementById('resultsPositionFilter');
            const constituencyFilterDiv = document.getElementById('resultsConstituencyFilterDiv');
            const wardFilterDiv = document.getElementById('resultsWardFilterDiv');
            const applyFilterBtn = document.getElementById('applyResultsFilter');

            // Load filter options
            this.loadConstituenciesForResults();
            this.loadWardsForResults();

            // Show/hide filters based on position
            if (positionFilter) {
                positionFilter.addEventListener('change', () => {
                    const position = positionFilter.value;
                    constituencyFilterDiv.style.display = (position === 'MP') ? 'block' : 'none';
                    wardFilterDiv.style.display = (position === 'COUNC') ? 'block' : 'none';
                });
            }

            if (applyFilterBtn) {
                applyFilterBtn.addEventListener('click', () => {
                    this.loadResultsData();
                });
            }
        }, 100);
    }

    async loadConstituenciesForResults() {
        try {
            const response = await fetch('/api/tables/constituencies');
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('resultsConstituencyFilter');
                if (select) {
                    data.data.forEach(constituency => {
                        const option = document.createElement('option');
                        option.value = constituency.ConstituencyID;
                        option.textContent = constituency.ConstituencyName;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading constituencies for results:', error);
        }
    }

    async loadWardsForResults() {
        try {
            const response = await fetch('/api/tables/wards');
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('resultsWardFilter');
                if (select) {
                    data.data.forEach(ward => {
                        const option = document.createElement('option');
                        option.value = ward.WardID;
                        option.textContent = ward.WardName;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading wards for results:', error);
        }
    }

    async loadResultsData() {
        const resultsContent = document.getElementById('resultsContent');
        if (!resultsContent) return;

        resultsContent.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading results...</div>';

        try {
            let url = '/api/results/live';
            const position = document.getElementById('resultsPositionFilter')?.value || 'all';
            const constituency = document.getElementById('resultsConstituencyFilter')?.value || 'all';
            const ward = document.getElementById('resultsWardFilter')?.value || 'all';

            const params = new URLSearchParams();
            if (position !== 'all') params.append('position', position);
            if (constituency !== 'all' && position === 'MP') params.append('constituency', constituency);
            if (ward !== 'all' && position === 'COUNC') params.append('ward', ward);

            if (params.toString()) {
                url += '?' + params.toString();
            }

            console.log('Loading results with URL:', url);
            const response = await fetch(url);
            const data = await response.json();

            if (data.success && data.data) {
                console.log('Results data loaded:', data.data.length, 'records');
                this.renderResults(data.data, resultsContent);
            } else {
                console.error('Results API error:', data);
                resultsContent.innerHTML = '<div class="error-message">Failed to load results</div>';
            }
        } catch (error) {
            console.error('Error loading results:', error);
            resultsContent.innerHTML = '<div class="error-message">Error loading results</div>';
        }
    }

    renderResults(data, section) {
        if (!data || data.length === 0) {
            section.innerHTML = '<div class="no-data"><p>No results available</p></div>';
            return;
        }

        let html = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Position</th>
                            <th>Candidate Name</th>
                            <th>Party</th>
                            <th>Vote Count</th>
                            <th>Ward</th>
                            <th>Constituency</th>
                            <th>District</th>
                            <th>Region</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach(result => {
            html += `
                <tr>
                    <td>${result.PositionTitle || ''}</td>
                    <td>${result.CandidateName || ''}</td>
                    <td>${result.PartyName || ''}</td>
                    <td>${result.VoteCount || 0}</td>
                    <td>${result.WardName || ''}</td>
                    <td>${result.ConstituencyName || ''}</td>
                    <td>${result.DistrictName || ''}</td>
                    <td>${result.Region || ''}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        section.innerHTML = html;
    }

    async loadCharts() {
        const section = document.getElementById('charts');
        if (!section) return;

        section.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading charts...</div>';

        try {
            // Load initial top candidates data instead of charts endpoint
            const response = await fetch('/api/results/top-candidates?limit=5');
            const data = await response.json();
            
            if (data.success) {
                this.renderCharts(data.data, section);
            } else {
                section.innerHTML = '<div class="error-message">Failed to load chart data</div>';
            }
        } catch (error) {
            console.error('Error loading charts:', error);
            section.innerHTML = '<div class="error-message">Error loading charts</div>';
        }
    }

    renderCharts(data, section) {
        if (typeof Chart === 'undefined') {
            section.innerHTML = '<div class="error-message">Chart.js not loaded</div>';
            return;
        }

        // Create charts container with enhanced filters
        let html = `
            <div class="charts-filter" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; gap: 15px; align-items: center; justify-content: center; flex-wrap: wrap;">
                    <div>
                        <label for="positionFilter" style="margin-right: 5px; font-weight: bold;">Position:</label>
                        <select id="positionFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Positions</option>
                            <option value="PRES">President</option>
                            <option value="MP">Member of Parliament</option>
                            <option value="COUNC">Ward Councillor</option>
                        </select>
                    </div>
                    <div id="constituencyFilterDiv" style="display: none;">
                        <label for="constituencyFilter" style="margin-right: 5px; font-weight: bold;">Constituency:</label>
                        <select id="constituencyFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Constituencies</option>
                        </select>
                    </div>
                    <div id="wardFilterDiv" style="display: none;">
                        <label for="wardFilter" style="margin-right: 5px; font-weight: bold;">Ward:</label>
                        <select id="wardFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Wards</option>
                        </select>
                    </div>
                    <button id="applyFilter" style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Apply Filter</button>
                </div>
            </div>
            <div class="charts-container" style="display: flex; gap: 20px; justify-content: space-around;">
                <div class="chart-section" style="flex: 1; max-width: 500px;">
                    <h3>Top 5 Candidates by Position</h3>
                    <canvas id="candidateChart" width="500" height="300"></canvas>
                </div>
                <div class="chart-section" style="flex: 1; max-width: 400px;">
                    <h3>Vote Distribution</h3>
                    <div style="width: 300px; height: 300px; margin: 0 auto;">
                        <canvas id="voteChart" width="300" height="300"></canvas>
                    </div>
                </div>
            </div>
        `;
        
        section.innerHTML = html;

        // Destroy existing charts first
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};

        // Render initial charts with data
        this.renderTopCandidatesCharts(data, section);

        // Add filter event listeners
        setTimeout(() => {
            const positionFilter = document.getElementById('positionFilter');
            const constituencyFilterDiv = document.getElementById('constituencyFilterDiv');
            const wardFilterDiv = document.getElementById('wardFilterDiv');
            const applyFilterBtn = document.getElementById('applyFilter');

            // Load constituencies and wards
            this.loadConstituencies();
            this.loadWards();

            // Show/hide filters based on position
            if (positionFilter) {
                positionFilter.addEventListener('change', () => {
                    const position = positionFilter.value;
                    if (constituencyFilterDiv) {
                        constituencyFilterDiv.style.display = (position === 'MP') ? 'block' : 'none';
                    }
                    if (wardFilterDiv) {
                        wardFilterDiv.style.display = (position === 'COUNC') ? 'block' : 'none';
                    }
                });
            }

            if (applyFilterBtn) {
                applyFilterBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const position = document.getElementById('positionFilter')?.value || 'all';
                    const constituency = document.getElementById('constituencyFilter')?.value || 'all';
                    const ward = document.getElementById('wardFilter')?.value || 'all';
                    console.log('Charts filter applied:', { position, constituency, ward });
                    this.loadChartsWithFilter(position, constituency, ward);
                });
            }
        }, 150);
    }

    async loadChartsWithFilter(position = 'all', constituency = 'all', ward = 'all') {
        const section = document.getElementById('charts');
        if (!section) return;

        try {
            let url = '/api/results/top-candidates?limit=5';
            if (position !== 'all') url += `&position=${position}`;
            if (constituency !== 'all') url += `&constituency=${constituency}`;
            if (ward !== 'all') url += `&ward=${ward}`;

            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                this.renderTopCandidatesCharts(data.data, section);
            }
        } catch (error) {
            console.error('Error loading filtered charts:', error);
        }
    }

    async loadConstituencies() {
        try {
            const response = await fetch('/api/tables/constituencies?limit=1000');
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('constituencyFilter');
                if (select) {
                    // Clear existing options except the first one
                    while (select.children.length > 1) {
                        select.removeChild(select.lastChild);
                    }
                    
                    data.data.forEach(constituency => {
                        const option = document.createElement('option');
                        option.value = constituency.ConstituencyID;
                        option.textContent = constituency.ConstituencyName;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading constituencies:', error);
        }
    }

    async loadWards() {
        try {
            const response = await fetch('/api/tables/wards?limit=1000');
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('wardFilter');
                if (select) {
                    // Clear existing options except the first one
                    while (select.children.length > 1) {
                        select.removeChild(select.lastChild);
                    }
                    
                    data.data.forEach(ward => {
                        const option = document.createElement('option');
                        option.value = ward.WardID;
                        option.textContent = ward.WardName;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading wards:', error);
        }
    }

    renderTopCandidatesCharts(data, section) {
        if (!data || data.length === 0) {
            section.querySelector('.charts-container').innerHTML = '<div class="no-data">No candidate data available</div>';
            return;
        }

        // Group by position and get top 5
        const groupedData = data.reduce((acc, candidate) => {
            if (!acc[candidate.PositionID]) {
                acc[candidate.PositionID] = [];
            }
            if (acc[candidate.PositionID].length < 5) {
                acc[candidate.PositionID].push(candidate);
            }
            return acc;
        }, {});

        // Destroy existing charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};

        setTimeout(() => {
            // Create bar chart for top candidates
            const candidateCtx = document.getElementById('candidateChart');
            if (candidateCtx && Object.keys(groupedData).length > 0) {
                const position = Object.keys(groupedData)[0];
                const candidates = groupedData[position];
                
                this.charts.candidates = new Chart(candidateCtx, {
                    type: 'bar',
                    data: {
                        labels: candidates.map(c => c.CandidateName || 'Unknown'),
                        datasets: [{
                            label: 'Vote Count',
                            data: candidates.map(c => c.TotalVotes || 0),
                            backgroundColor: [
                                '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: `Top 5 Candidates - ${candidates[0]?.PositionTitle || position}`
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            }

            // Create pie chart for vote distribution
            const voteCtx = document.getElementById('voteChart');
            if (voteCtx && Object.keys(groupedData).length > 0) {
                const position = Object.keys(groupedData)[0];
                const candidates = groupedData[position];
                
                this.charts.votes = new Chart(voteCtx, {
                    type: 'doughnut',
                    data: {
                        labels: candidates.map(c => c.CandidateName || 'Unknown'),
                        datasets: [{
                            data: candidates.map(c => c.TotalVotes || 0),
                            backgroundColor: [
                                '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                });
            }
        }, 100);
    }

    async loadWinners() {
        const section = document.getElementById('winners');
        if (!section) return;

        // Add filters to winners section
        section.innerHTML = `
            <div class="winners-filter" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; gap: 15px; align-items: center; justify-content: center; flex-wrap: wrap;">
                    <div>
                        <label for="winnersPositionFilter" style="margin-right: 5px; font-weight: bold;">Position:</label>
                        <select id="winnersPositionFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="ALL">All Positions</option>
                            <option value="PRES">President</option>
                            <option value="MP">Member of Parliament</option>
                            <option value="COUNC">Ward Councillor</option>
                        </select>
                    </div>
                    <div id="winnersConstituencyFilterDiv" style="display: none;">
                        <label for="winnersConstituencyFilter" style="margin-right: 5px; font-weight: bold;">Constituency:</label>
                        <select id="winnersConstituencyFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Constituencies</option>
                        </select>
                    </div>
                    <div id="winnersWardFilterDiv" style="display: none;">
                        <label for="winnersWardFilter" style="margin-right: 5px; font-weight: bold;">Ward:</label>
                        <select id="winnersWardFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Wards</option>
                        </select>
                    </div>
                    <button id="applyWinnersFilter" style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Apply Filter</button>
                </div>
            </div>
            <div id="winnersContent">
                <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading winners...</div>
            </div>
        `;

        // Setup filter event listeners
        this.setupWinnersFilters();
        
        // Load initial data
        this.loadWinnersData();
    }

    setupWinnersFilters() {
        setTimeout(() => {
            const positionFilter = document.getElementById('winnersPositionFilter');
            const constituencyFilterDiv = document.getElementById('winnersConstituencyFilterDiv');
            const wardFilterDiv = document.getElementById('winnersWardFilterDiv');
            const applyFilterBtn = document.getElementById('applyWinnersFilter');

            // Load filter options
            this.loadConstituenciesForWinners();
            this.loadWardsForWinners();

            // Show/hide filters based on position
            if (positionFilter) {
                positionFilter.addEventListener('change', () => {
                    const position = positionFilter.value;
                    constituencyFilterDiv.style.display = (position === 'MP') ? 'block' : 'none';
                    wardFilterDiv.style.display = (position === 'COUNC') ? 'block' : 'none';
                });
            }

            if (applyFilterBtn) {
                applyFilterBtn.addEventListener('click', () => {
                    this.loadWinnersData();
                });
            }
        }, 100);
    }

    async loadConstituenciesForWinners() {
        try {
            const response = await fetch('/api/tables/constituencies');
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('winnersConstituencyFilter');
                if (select) {
                    data.data.forEach(constituency => {
                        const option = document.createElement('option');
                        option.value = constituency.ConstituencyID;
                        option.textContent = constituency.ConstituencyName;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading constituencies for winners:', error);
        }
    }

    async loadWardsForWinners() {
        try {
            const response = await fetch('/api/tables/wards');
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('winnersWardFilter');
                if (select) {
                    data.data.forEach(ward => {
                        const option = document.createElement('option');
                        option.value = ward.WardID;
                        option.textContent = ward.WardName;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading wards for winners:', error);
        }
    }

    async loadWinnersData() {
        const winnersContent = document.getElementById('winnersContent');
        if (!winnersContent) return;

        winnersContent.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading winners...</div>';

        try {
            let url = '/api/results/winners';
            const position = document.getElementById('winnersPositionFilter')?.value || 'ALL';
            const constituency = document.getElementById('winnersConstituencyFilter')?.value || 'all';
            const ward = document.getElementById('winnersWardFilter')?.value || 'all';

            const params = new URLSearchParams();
            if (position !== 'ALL') params.append('position', position);
            if (constituency !== 'all' && position === 'MP') params.append('constituency', constituency);
            if (ward !== 'all' && position === 'COUNC') params.append('ward', ward);

            if (params.toString()) {
                url += '?' + params.toString();
            }

            console.log('Loading winners with URL:', url);
            const response = await fetch(url);
            const data = await response.json();

            if (data.success && data.data) {
                console.log('Winners data loaded:', data.data.length, 'records');
                this.renderWinners(data.data, winnersContent);
            } else {
                console.error('Winners API error:', data);
                winnersContent.innerHTML = '<div class="error-message">Failed to load winners</div>';
            }
        } catch (error) {
            console.error('Error loading winners:', error);
            winnersContent.innerHTML = '<div class="error-message">Error loading winners</div>';
        }
    }

    renderWinners(data, section) {
        if (!data || data.length === 0) {
            section.innerHTML = '<div class="no-data"><p>No winners available</p></div>';
            return;
        }

        let html = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Position</th>
                            <th>Winner Name</th>
                            <th>Party</th>
                            <th>Total Votes</th>
                            <th>Constituency</th>
                            <th>District</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach(winner => {
            html += `
                <tr>
                    <td>${winner.PositionTitle || ''}</td>
                    <td>${winner.WinnerName || ''}</td>
                    <td>${winner.PartyName || ''}</td>
                    <td>${winner.TotalVotes || 0}</td>
                    <td>${winner.ConstituencyName || ''}</td>
                    <td>${winner.DistrictName || ''}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        section.innerHTML = html;
    }

    async loadSummary() {
        const section = document.getElementById('summary');
        if (!section) return;

        section.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading summary...</div>';

        try {
            const response = await fetch('/api/results/summary');
            const data = await response.json();

            if (data.success && data.data) {
                this.renderSummaryTable(data.data, section);
            } else {
                section.innerHTML = '<div class="error-message">Failed to load summary</div>';
            }
        } catch (error) {
            console.error('Error loading summary:', error);
            section.innerHTML = '<div class="error-message">Error loading summary</div>';
        }
    }

    async loadAnalytics() {
        const section = document.getElementById('analytics');
        if (!section) return;

        section.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading analytics...</div>';

        try {
            const response = await fetch('/api/analytics/overview');
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to load analytics');
            this.renderAnalytics(data.data, section);
        } catch (error) {
            section.innerHTML = '<div class="error-message">Error loading analytics</div>';
        }
    }

    renderAnalytics(metrics, section) {
        const genderRows = (metrics.unregisteredByGender || []).map(r => `
            <tr>
                <td>${r.gender || ''}</td>
                <td>${(r.totalEligible || 0).toLocaleString()}</td>
                <td>${(r.unregistered || 0).toLocaleString()}</td>
                <td>${r.percentUnregistered || 0}%</td>
            </tr>
        `).join('');

        const candidateStat = metrics.candidatesUnregistered || { totalCandidates: 0, unregisteredCandidates: 0, percentUnregistered: 0 };

        const nullVoidRows = (metrics.nullVoidByWard || []).map(r => `
            <tr>
                <td>${r.wardId || ''}</td>
                <td>${r.wardName || ''}</td>
                <td>${(r.nullVoidVotes || 0).toLocaleString()}</td>
                <td>${(r.totalVotes || 0).toLocaleString()}</td>
                <td>${r.percentNullVoid || 0}%</td>
            </tr>
        `).join('');

        const sameGenderRows = (metrics.voterCandidateSameGender || []).map(r => `
            <tr>
                <td>${r.voterGender || ''}</td>
                <td>${(r.totalVotesByVoterGender || 0).toLocaleString()}</td>
                <td>${(r.sameGenderVotes || 0).toLocaleString()}</td>
                <td>${r.percentSameGender || 0}%</td>
            </tr>
        `).join('');

        const html = `
            <div class="data-section">
                <div class="section-header">
                    <h3 class="section-title">
                        <i class="fas fa-chart-line"></i>
                        Analytics Overview
                    </h3>
                </div>
                <div style="display:grid; gap:20px; grid-template-columns: 1fr;">
                    <div class="analytics-section">
                        <h4 style="margin: 10px 0;">Unregistered by Gender</h4>
                        <div class="table-container">
                            <table class="data-table analytics-overview">
                                <thead>
                                    <tr>
                                        <th>Gender</th>
                                        <th>Total Eligible</th>
                                        <th>Unregistered</th>
                                        <th>% Unregistered</th>
                                    </tr>
                                </thead>
                                <tbody>${genderRows}</tbody>
                            </table>
                        </div>
                    </div>

                    <div class="analytics-section">
                        <h4 style="margin: 10px 0;">Candidates Not Registered</h4>
                        <div class="table-container" style="padding:16px;">
                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px;">
                                <div><strong>Total Candidates:</strong> ${candidateStat.totalCandidates.toLocaleString()}</div>
                                <div><strong>Unregistered Candidates:</strong> ${candidateStat.unregisteredCandidates.toLocaleString()}</div>
                                <div><strong>% Unregistered:</strong> ${candidateStat.percentUnregistered}%</div>
                            </div>
                        </div>
                    </div>

                    <div class="analytics-section">
                        <h4 style="margin: 10px 0;">Null & Void Votes by Ward (> 0%)</h4>
                        <div class="table-container">
                            <table class="data-table analytics-overview">
                                <thead>
                                    <tr>
                                        <th>Ward ID</th>
                                        <th>Ward Name</th>
                                        <th>Null/Void Votes</th>
                                        <th>Total Votes</th>
                                        <th>% Null/Void</th>
                                    </tr>
                                </thead>
                                <tbody>${nullVoidRows}</tbody>
                            </table>
                        </div>
                    </div>

                    <div class="analytics-section">
                        <h4 style="margin: 10px 0;">Same-Gender Voting</h4>
                        <div class="table-container">
                            <table class="data-table analytics-overview">
                                <thead>
                                    <tr>
                                        <th>Voter Gender</th>
                                        <th>Total Votes</th>
                                        <th>Same-Gender Votes</th>
                                        <th>% Same-Gender</th>
                                    </tr>
                                </thead>
                                <tbody>${sameGenderRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        section.innerHTML = html;
    }

    renderSummaryTable(data, section) {
        if (!data || data.length === 0) {
            section.innerHTML = '<div class="no-data"><p>No summary data available</p></div>';
            return;
        }

        let html = `
            <div class="table-container">
                            <table class="data-table analytics-overview">
                    <thead>
                        <tr>
                            <th>Position</th>
                            <th>Position Title</th>
                            <th>Total Candidates</th>
                            <th>Total Votes</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach(item => {
            html += `
                <tr>
                    <td>${item.PositionID || ''}</td>
                    <td>${item.PositionTitle || ''}</td>
                    <td>${item.CandidateCount || 0}</td>
                    <td>${item.TotalVotes || 0}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        section.innerHTML = html;
    }

    updateDashboardStats(data) {
        const totalVotes = data.reduce((sum, item) => sum + (item.TotalVotes || 0), 0);
        const totalCandidates = data.reduce((sum, item) => sum + (item.CandidateCount || 0), 0);
        
        const totalVotesEl = document.getElementById('totalVotes');
        const totalCandidatesEl = document.getElementById('totalCandidates');
        
        if (totalVotesEl) totalVotesEl.textContent = totalVotes.toLocaleString();
        if (totalCandidatesEl) totalCandidatesEl.textContent = totalCandidates.toLocaleString();
    }

    updateDashboardCandidates(candidates) {
        const candidatesContainer = document.querySelector('.candidates-table-container');
        if (candidatesContainer) {
            candidatesContainer.remove();
        }
    }

    updateDashboardWinners(winners) {
        const winnersContainer = document.querySelector('.winners-table-container');
        if (winnersContainer) {
            winnersContainer.remove();
        }
    }

    async loadSystemStatus() {
        const section = document.getElementById('status');
        if (!section) return;
        try {
            section.innerHTML = '<div class="status-container"><h3>System Status</h3><div>Loading...</div></div>';
            const resp = await fetch('/api/system/status?detail=basic');
            if (!resp.ok) throw new Error('Failed to load system status');
            const json = await resp.json();
            const d = json.data || {};
            const dbHealthy = d.database?.healthy;
            const dbClass = dbHealthy ? 'online' : 'offline';
            const counts = d.counts || {};
            const countBadges = Object.entries(counts).map(([k,v]) => `<span class="status-metric"><strong>${k}:</strong> ${v}</span>`).join(' ');
            section.innerHTML = `
                <div class="status-container">
                    <h3>System Status</h3>
                    <div class="status-item">
                        <span class="status-label">Database:</span>
                        <span class="status-value ${dbClass}">${dbHealthy ? 'Online' : 'Offline'}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Uptime:</span>
                        <span class="status-value">${d.server?.uptimeSeconds ?? 0}s</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Last Check:</span>
                        <span class="status-value">${d.database?.lastCheck ? new Date(d.database.lastCheck).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div class="status-metrics">${countBadges}</div>
                </div>`;
        } catch (error) {
            console.error('Error loading system status:', error);
            section.innerHTML = '<div class="status-container"><h3>System Status</h3><div class="error">Failed to load status</div></div>';
        }
    }

    async loadTable(tableName, filter = null) {
        // Find section by ID or data-section attribute
        let section = document.getElementById(tableName);
        if (!section) {
            section = document.querySelector(`[data-section="${tableName}"]`);
        }
        if (!section) {
            // Try to find section with similar name
            const possibleSections = ['voters', 'candidates', 'parties', 'districts', 'constituencies', 'wards', 'polling-stations', 'elections', 'votes', 'final-winners', 'eligible-citizens', 'positions', 'running-mates', 'election-officials', 'party-agents', 'ballots', 'logistics', 'incidents'];
            for (const sectionName of possibleSections) {
                section = document.getElementById(sectionName);
                if (section && (sectionName === tableName || sectionName.includes(tableName) || tableName.includes(sectionName))) {
                    break;
                }
            }
        }
        
        if (!section) {
            console.error(`Section not found: ${tableName}`);
            return;
        }

        // Show loading state (special handling for final-winners to preserve header and filter buttons)
        if (tableName === 'final-winners') {
            const loadingEl = document.getElementById('finalWinnersLoading');
            const contentEl = document.getElementById('finalWinnersContent');
            if (loadingEl) loadingEl.style.display = 'block';
            if (contentEl) contentEl.style.display = 'none';
        } else {
            section.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><span>Loading data...</span></div>';
        }
        
        try {
            let endpoint = this.getTableEndpoint(tableName);
            
            // Add position filter for final-winners
            if (tableName === 'final-winners') {
                // if filter not provided, read from dropdown
                const dd = document.getElementById('finalWinnersFilter');
                const selected = (typeof filter === 'string' && filter.length) ? filter : (dd ? dd.value : 'ALL');
                if (selected && selected !== 'ALL') {
                    endpoint = `/api/tables/final-winners-filtered?position=${selected}`;
                } else {
                    endpoint = '/api/tables/final-winners-filtered';
                }
            }

            // Ensure table endpoints request full data where supported
            if (endpoint.startsWith('/api/tables')) {
                endpoint += endpoint.includes('?') ? '&limit=all' : '?limit=all';
            }
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            console.log(`Loading table: ${endpoint} for section: ${tableName}`);

            const response = await fetch(endpoint, {
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`Table ${tableName} response:`, data);

            if (tableName === 'final-winners') {
                const loadingEl = document.getElementById('finalWinnersLoading');
                const contentEl = document.getElementById('finalWinnersContent');
                if (loadingEl) loadingEl.style.display = 'none';
                if (contentEl) contentEl.style.display = 'block';
                
                // Store data for filtering
                this.winnersData = data && data.data ? data.data : [];
                console.log('📦 Stored winners data for filtering:', this.winnersData.length, 'records');
                
                this.renderTable(this.winnersData, document.querySelector('#final-winners .winners-grid'));
                
                // Reset filter initialization flag and initialize filters after data is loaded and rendered
                this.filtersInitialized = false;
                setTimeout(() => {
                    console.log('⏱️ Initializing filters after data load...');
                    this.initializeFinalWinnersFilter();
                }, 150);
                
                return;
            }

            if (data.success && data.data) {
                if (data.data.length > 0) {
                    this.renderTable(data.data, section);
                } else {
                    section.innerHTML = `
                        <div class="no-data">
                            <h3>No Records Found</h3>
                            <p>The ${tableName} table is empty or no records match your criteria.</p>
                            <button onclick="admin.loadTable('${tableName}')" class="btn btn-primary">
                                <i class="fas fa-redo"></i> Refresh
                            </button>
                        </div>
                    `;
                }
            } else {
                section.innerHTML = `
                    <div class="error-state">
                        <h3>No Data Available</h3>
                        <p>${data.message || data.error || 'Unable to load table data'}</p>
                        <button onclick="admin.loadTable('${tableName}')" class="btn btn-primary">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            console.error(`Error loading ${tableName}:`, error);
            section.innerHTML = `
                <div class="error-state">
                    <h3>Error Loading Data</h3>
                    <p>${error.name === 'AbortError' ? 'Request timed out' : error.message || 'Failed to load data'}</p>
                    <button onclick="admin.loadTable('${tableName}')" class="btn btn-primary">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    renderTable(data, section) {
        if (!data || data.length === 0) {
            section.innerHTML = `
                <div class="no-data" style="padding: 2rem; text-align: center; background: #f8fafc; border-radius: 8px; margin: 1rem 0;">
                    <i class="fas fa-filter" style="font-size: 2rem; color: #94a3b8; margin-bottom: 1rem;"></i>
                    <p style="font-size: 1.1rem; color: #64748b; margin: 0.5rem 0;">No matching results found</p>
                    <p style="font-size: 0.9rem; color: #94a3b8; margin: 0;">Try adjusting your filters or search terms</p>
                </div>
            `;
            return;
        }

        const allHeaders = Object.keys(data[0]);
        // Filter out winnerID and candidateID columns from display
        const filteredHeaders = allHeaders.filter(header => 
            !header.toLowerCase().includes('winnerid') && 
            !header.toLowerCase().includes('candidateid')
        );
        
        // Reorder headers to put winner name first
        const winnerNameHeaders = filteredHeaders.filter(header => 
            header.toLowerCase().includes('winner') && 
            (header.toLowerCase().includes('name') || header.toLowerCase().includes('winner'))
        );
        const otherHeaders = filteredHeaders.filter(header => 
            !(header.toLowerCase().includes('winner') && 
              (header.toLowerCase().includes('name') || header.toLowerCase().includes('winner')))
        );
        
        // Put winner name columns first, then other columns
        const headers = [...winnerNameHeaders, ...otherHeaders];
        
        let html = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            ${headers.map(header => `<th>${this.formatHeader(header)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach(row => {
            html += '<tr>';
            headers.forEach(header => {
                const value = row[header];
                let displayValue = '';
                
                if (value !== null && value !== undefined && value !== '' && value !== 'undefined' && value !== 'null') {
                    displayValue = String(value).trim();
                }
                // Apply remark badge styling if header name indicates a pass/fail style column
                if (/remark|status/i.test(header) && displayValue) {
                    const lower = displayValue.toLowerCase();
                    const cls = lower.includes('pass') || lower.includes('active') ? 'remark-badge remark-pass' :
                                (lower.includes('fail') || lower.includes('inactive')) ? 'remark-badge remark-fail' : 'remark-badge';
                    html += `<td><span class="${cls}">${displayValue}</span></td>`;
                } else {
                    html += `<td>${displayValue}</td>`;
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        section.innerHTML = html;
    }

    formatHeader(header) {
        return header
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    refreshCurrentSection() {
        if (this.currentSection === 'dashboard') {
            this.loadDashboardData();
        } else {
            this.showSection(this.currentSection);
        }
    }

    async downloadReport(format) {
        try {
            const response = await fetch('/api/results/summary');
            const data = await response.json();
            
            if (data.success) {
                const csvContent = this.convertToCSV(data.data);
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `election-report-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
                this.showNotification('Report downloaded successfully', 'success');
            }
        } catch (error) {
            this.showNotification('Error downloading report', 'error');
        }
    }

    async viewReport(type) {
        const reportContent = document.getElementById('reportContent');
        try {
            const response = await fetch('/api/results/summary');
            const data = await response.json();
            
            if (data.success && reportContent) {
                let html = `
                    <div class="report-summary">
                        <h4>Election Summary Report</h4>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Position</th>
                                    <th>Total Candidates</th>
                                    <th>Total Votes</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                data.data.forEach(item => {
                    html += `
                        <tr>
                            <td>${item.PositionTitle || item.PositionID}</td>
                            <td>${item.CandidateCount || 0}</td>
                            <td>${item.TotalVotes?.toLocaleString() || 0}</td>
                        </tr>
                    `;
                });
                
                html += '</tbody></table></div>';
                reportContent.innerHTML = html;
            }
        } catch (error) {
            if (reportContent) {
                reportContent.innerHTML = '<p>Error loading report data</p>';
            }
        }
    }

    convertToCSV(data) {
        const headers = ['Position', 'Total Candidates', 'Total Votes'];
        const rows = data.map(item => [
            item.PositionTitle || item.PositionID,
            item.CandidateCount || 0,
            item.TotalVotes || 0
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
        
        return csvContent;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }

    updateDashboardCandidates(candidates) {
        const candidatesContainer = document.querySelector('.candidates-table-container');
        if (candidatesContainer) {
            candidatesContainer.remove();
        }
    }

    updateDashboardWinners(winners) {
        const winnersContainer = document.querySelector('.winners-table-container');
        if (winnersContainer) {
            winnersContainer.remove();
        }
    }

    getTableEndpoint(tableName) {
        const endpoints = {
            'voters': '/api/tables/voters',
            'candidates': '/api/tables/candidates',
            'parties': '/api/tables/parties',
            'districts': '/api/tables/districts',
            'constituencies': '/api/tables/constituencies',
            'wards': '/api/tables/wards',
            'polling-stations': '/api/tables/polling-stations',
            'elections': '/api/tables/elections',
            'positions': '/api/tables/positions',
            'running-mates': '/api/tables/running-mates',
            'election-officials': '/api/tables/election-officials',
            'party-agents': '/api/tables/party-agents',
            'ballots': '/api/tables/ballots',
            'votes': '/api/tables/votes',
            'final-winners': '/api/tables/final-winners'
        };
        return endpoints[tableName] || `/api/tables/${tableName}`;
    }

    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvHeaders = headers.join(',');
        const csvRows = data.map(row => 
            headers.map(header => `"${row[header] || ''}"`).join(',')
        );
        
        return [csvHeaders, ...csvRows].join('\n');
    }

    // Dashboard data loading functionality
    async loadDashboardData(detail = 'basic') {
        try {
            const response = await fetch(`/api/dashboard?detail=${encodeURIComponent(detail)}`);
            const payload = await response.json();
            if (!payload.success) {
                console.error('Failed to load dashboard data:', payload.error);
                return;
            }
            this.updateDashboardCards(payload.data);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    updateDashboardCards(raw) {
        if (!raw) return;
        // Backend returns keys: voters, candidates, votes, districts (and optionally parties, elections)
        const mapped = {
            totalVoters: raw.voters ?? raw.totalVoters ?? 0,
            totalCandidates: raw.candidates ?? raw.totalCandidates ?? 0,
            totalVotes: raw.votes ?? raw.totalVotes ?? 0,
            totalDistricts: raw.districts ?? raw.totalDistricts ?? 0
        };
        this.updateCardById('totalVoters', mapped.totalVoters);
        this.updateCardById('totalCandidates', mapped.totalCandidates);
        this.updateCardById('totalVotes', mapped.totalVotes);
        this.updateCardById('totalDistricts', mapped.totalDistricts);
    }

    updateCardById(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value.toLocaleString();
        } else {
            // Fallback: try to find by card structure
            this.updateCardByLabel(elementId, value);
        }
    }

    updateCardByLabel(type, value) {
        const cardValues = document.querySelectorAll('.card-value');
        cardValues.forEach(card => {
            const label = card.parentElement.querySelector('.card-label');
            if (label) {
                const labelText = label.textContent.toLowerCase();
                if ((type === 'totalVoters' && labelText.includes('voter')) ||
                    (type === 'totalCandidates' && labelText.includes('candidate')) ||
                    (type === 'totalVotes' && labelText.includes('vote')) ||
                    (type === 'totalDistricts' && labelText.includes('district'))) {
                    card.textContent = value.toLocaleString();
                }
            }
        });
    }
}

// Initialize the admin interface
const admin = new ElectionAdmin();
