// Consolidate the initialization functions to avoid duplicate elements
let conversationHistory = [];
let isLoading = false;
let currentConfig = {
    project_id: 'gen-lang-client-0691935742',
    location: 'global',
    dataset_id: 'accountstable',
    table_id: '', // Will be replaced with actual selected table
    available_tables: [], // Will hold the dynamically discovered tables
    data_dictionary: 'net_value: Final net revenue amount - use for all revenue calculations\nconversion_value: Initial conversion value - may differ from net_value\nconversion_date: Primary date field for time-based analysis'
};

// Main initialization function that combines all initialization tasks
window.addEventListener('load', async function() {
    // First initialize the config panel
    initializeConfigPanel();

    // Then initialize the data agent
    try {
        showLoading(true);
        const response = await fetch('/api/initialize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ config: currentConfig })
        });

        const data = await response.json();
        if (!data.success) {
            console.warn('Agent initialization failed:', data.error);
            addMessage('Note: Some advanced features may not be available. You can still ask basic questions.');
        } else {
            console.log('Data agent initialized successfully');

            // Update available tables if returned from backend
            if (data.available_tables && Array.isArray(data.available_tables)) {
                currentConfig.available_tables = data.available_tables;

                // If no table is selected, select the first one
                if (!currentConfig.table_id && data.available_tables.length > 0) {
                    currentConfig.table_id = data.available_tables[0];
                }

                // Save updated config
                localStorage.setItem('bigquery_config', JSON.stringify(currentConfig));
                updateConfigInputs();
            }
        }
    } catch (error) {
        console.warn('Agent initialization error:', error);
        addMessage('Welcome! I\'m ready to help with your data questions.');
    } finally {
        showLoading(false);
    }
});

function addMessage(content, isUser = false, hasTable = false) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (!isUser && typeof content === 'string') {
        // Replace "chart" with "table" in AI messages
        content = content.replace(/chart/g, "table");
    } else if (!isUser && content.text) {
        // For complex responses that have a text property
        content.text = content.text.replace(/chart/g, "table");
    }
    if (typeof content === 'string') {
        contentDiv.innerHTML = content;
    } else {
        // Handle complex response with tables
        if (content.text) {
            const textP = document.createElement('p');
            textP.textContent = content.text;
            contentDiv.appendChild(textP);
        }

        // Add tables - Fixed to handle the actual data structure
        if (content.tables && content.tables.length > 0) {
            content.tables.forEach(tableData => {
                const tableContainer = createTableHTML(tableData);
                contentDiv.appendChild(tableContainer);
            });
        }

        // Add SQL queries if present
        if (content.sql_queries && content.sql_queries.length > 0) {
            content.sql_queries.forEach(sql => {
                const sqlDiv = document.createElement('div');
                sqlDiv.className = 'sql-query';
                sqlDiv.innerHTML = `<pre><code>${sql}</code></pre>`;
                contentDiv.appendChild(sqlDiv);
            });
        }

        // Add error message if no useful content
        if (!content.text && (!content.tables || content.tables.length === 0)) {
            const errorP = document.createElement('p');
            errorP.textContent = 'I received your question but couldnt generate a clear response. Could you try rephrasing your question?';
            errorP.className = 'error-message';
            contentDiv.appendChild(errorP);
        }
    }

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function createTableHTML(tableData) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'data-table';

    // Add table metadata if available
    if (tableData.metadata) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'table-metadata';
        metaDiv.innerHTML = `<small>Showing ${tableData.metadata.display_rows ? tableData.metadata.display_rows.length : tableData.rows.length} of ${tableData.metadata.total_rows} rows</small>`;
        tableContainer.appendChild(metaDiv);
    }

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'table-wrapper';
    tableWrapper.style.overflowX = 'auto';

    const table = document.createElement('table');

    // Create header using columns array
    if (tableData.columns && tableData.columns.length > 0) {
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        tableData.columns.forEach(column => {
            const th = document.createElement('th');
            th.textContent = column;

            // Add column type styling if metadata is available
            if (tableData.metadata && tableData.metadata.column_types && tableData.metadata.column_types[column]) {
                th.className = `column-${tableData.metadata.column_types[column]}`;
            }

            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);
    }

    // Create body using rows array (handle both display_rows and regular rows)
    const rowsToDisplay = (tableData.metadata && tableData.metadata.display_rows)
        ? tableData.metadata.display_rows
        : tableData.rows;

    if (rowsToDisplay && rowsToDisplay.length > 0) {
        const tbody = document.createElement('tbody');

        rowsToDisplay.forEach(row => {
            const tr = document.createElement('tr');

            // Handle row as object with column keys
            if (tableData.columns) {
                tableData.columns.forEach(column => {
                    const td = document.createElement('td');
                    const value = row[column];

                    // Format the value based on type
                    if (value === null || value === undefined) {
                        td.textContent = '';
                        td.className = 'null-value';
                    } else if (typeof value === 'number') {
                        // Format numbers with commas for readability
                        td.textContent = value.toLocaleString();
                        td.className = 'numeric-value';
                    } else if (typeof value === 'boolean') {
                        td.textContent = value ? 'Yes' : 'No';
                        td.className = 'boolean-value';
                    } else {
                        td.textContent = String(value);
                    }

                    tr.appendChild(td);
                });
            } else {
                // Fallback for array-style rows
                if (Array.isArray(row)) {
                    row.forEach(cell => {
                        const td = document.createElement('td');
                        td.textContent = cell !== null && cell !== undefined ? String(cell) : '';
                        tr.appendChild(td);
                    });
                }
            }

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
    }

    tableWrapper.appendChild(table);
    tableContainer.appendChild(tableWrapper);

    // Add truncation warning if applicable
    if (tableData.metadata && tableData.metadata.truncated) {
        const truncateDiv = document.createElement('div');
        truncateDiv.className = 'truncation-warning';
        truncateDiv.innerHTML = '<small><em>Table truncated to first 100 rows for performance</em></small>';
        tableContainer.appendChild(truncateDiv);
    }

    return tableContainer;
}

function showLoading(show = true) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const sendButton = document.getElementById('send-button');
    const chatInput = document.getElementById('chat-input');

    if (show) {
        loadingOverlay.classList.add('show');
        sendButton.disabled = true;
        chatInput.disabled = true;
        isLoading = true;
    } else {
        loadingOverlay.classList.remove('show');
        sendButton.disabled = false;
        chatInput.disabled = false;
        isLoading = false;
    }
}

function initializeConfigPanel() {
    const configToggle = document.getElementById('config-toggle');
    const configContent = document.getElementById('config-content');
    const saveBtn = document.getElementById('save-config');
    const resetBtn = document.getElementById('reset-config');

    // Toggle config panel
    configToggle.addEventListener('click', () => {
        configContent.classList.toggle('expanded');
        configToggle.classList.toggle('rotated');
    });

    // Save configuration
    saveBtn.addEventListener('click', saveConfiguration);

    // Reset configuration
    resetBtn.addEventListener('click', resetConfiguration);

    // Load saved config from localStorage (if available)
    loadSavedConfiguration();
}

function loadSavedConfiguration() {
    try {
        const saved = JSON.parse(localStorage.getItem('bigquery_config') || '{}');
        if (Object.keys(saved).length > 0) {
            currentConfig = { ...currentConfig, ...saved };
            updateConfigInputs();
        }
    } catch (e) {
        console.warn('Failed to load saved configuration:', e);
    }
}

function updateConfigInputs() {
    document.getElementById('project-id').value = currentConfig.project_id;
    document.getElementById('location').value = currentConfig.location;
    document.getElementById('dataset-id').value = currentConfig.dataset_id;
    document.getElementById('table-id').value = currentConfig.table_id || '';
    const tableSelect = document.getElementById('table-id');
    if (tableSelect && Array.isArray(currentConfig.available_tables)) {
        tableSelect.innerHTML = '';
        currentConfig.available_tables.forEach(table => {
            const option = document.createElement('option');
            option.value = table;
            option.textContent = table;
            if (currentConfig.table_id && currentConfig.table_id.split(',').includes(table)) {
                option.selected = true;
            }
            tableSelect.appendChild(option);
        });
    }
    // Update available tables list
    const availableTablesInput = document.getElementById('available-tables');
    if (availableTablesInput) {
        if (Array.isArray(currentConfig.available_tables)) {
            availableTablesInput.value = currentConfig.available_tables.join(', ');
        } else if (typeof currentConfig.available_tables === 'string') {
            availableTablesInput.value = currentConfig.available_tables;
        } else {
            availableTablesInput.value = '';
        }
    }

    const dataDictionary = document.getElementById('data-dictionary');
    if (dataDictionary) {
        dataDictionary.value = currentConfig.data_dictionary || '';
    }

    // Clear any previous table selector before creating a new one
    const existingSelector = document.querySelector('.table-selector');
    if (existingSelector) {
        existingSelector.remove();
    }

    // Create clickable table list if we have tables available
    renderTableSelector();
}

function renderTable(tableData) {
    // Important: Don't re-format numbers here if they're already formatted
    // in the Python backend

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Create header row
    const headerRow = document.createElement('tr');
    tableData.columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Create data rows
    tableData.rows.forEach(row => {
        const tr = document.createElement('tr');
        tableData.columns.forEach(column => {
            const td = document.createElement('td');
            // Don't modify the values here - use them directly as received
            td.textContent = row[column] !== null ? row[column] : '';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    return table;
}

function saveConfiguration() {
    const projectId = document.getElementById('project-id').value.trim();
    const location = document.getElementById('location').value;
    const datasetId = document.getElementById('dataset-id').value.trim();
    let tableId = '';
    const tableSelect = document.getElementById('table-id');
    if (tableSelect && tableSelect.selectedOptions.length > 0) {
        tableId = Array.from(tableSelect.selectedOptions).map(opt => opt.value).join(', ');
    }

    // Handle the case where the available-tables input might be missing
    let availableTables = [];
    const availableTablesInput = document.getElementById('available-tables');
    if (availableTablesInput) {
        availableTables = availableTablesInput.value.trim().split(/\s*,\s*/);
    } else if (Array.isArray(currentConfig.available_tables)) {
        availableTables = currentConfig.available_tables;
    } else if (typeof currentConfig.available_tables === 'string') {
        availableTables = currentConfig.available_tables.split(/\s*,\s*/);
    }

    if (!projectId || !datasetId) {
        showConfigStatus('Project ID and Dataset ID are required!', 'error');
        return;
    }

    if (!tableId) {
        showConfigStatus('Table ID is required! Please select a table.', 'error');
        return;
    }

    const dataDictionary = document.getElementById('data-dictionary');
    const newConfig = {
        project_id: projectId,
        location: location,
        dataset_id: datasetId,
        table_id: tableId,
        available_tables: availableTables,
        data_dictionary: dataDictionary ? dataDictionary.value.trim() : ''
    };

    // Save to localStorage
    try {
        localStorage.setItem('bigquery_config', JSON.stringify(newConfig));
        currentConfig = newConfig;
        showConfigStatus('Configuration saved successfully! Please refresh to apply changes.', 'success');

        // Clear conversation history since config changed
        conversationHistory = [];

    } catch (e) {
        showConfigStatus('Failed to save configuration: ' + e.message, 'error');
    }
}

function resetConfiguration() {
    const defaultConfig = {
        project_id: 'gen-lang-client-0691935742',
        location: 'global',
        dataset_id: 'accountstable',
        table_id: '', // Empty to enable auto-discovery
        available_tables: 'salestable, campaigns_table, accountstable, eur_currency_table, campaigns_stats_table',
        data_dictionary: 'net_value: Final net revenue amount - use for all revenue calculations\nconversion_value: Initial conversion value - may differ from net_value\nconversion_date: Primary date field for time-based analysis'
    };

    currentConfig = defaultConfig;
    updateConfigInputs();

    try {
        localStorage.removeItem('bigquery_config');
        showConfigStatus('Configuration reset to defaults!', 'success');
        conversationHistory = [];
    } catch (e) {
        showConfigStatus('Failed to reset configuration: ' + e.message, 'error');
    }
}

function showConfigStatus(message, type) {
    const statusEl = document.getElementById('config-status');
    statusEl.textContent = message;
    statusEl.className = `config-status ${type}`;
    statusEl.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

const MAX_RETRIES = 30;
const RETRY_DELAY = 1000; // 1 second

async function sendMessage() {
    if (isLoading) return;

    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message) return;

    // Add user message
    addMessage(message, true);
    chatInput.value = '';

    // Show loading
    showLoading(true);

    let retryCount = 0;
    let success = false;
    let lastError = null;
    let responseData = null;

    while (retryCount < MAX_RETRIES && !success) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    history: conversationHistory,
                    config: currentConfig
                })
            });

            if (response.status === 400 || response.status === 403 || response.status === 500) {
                // Silent retry for these specific errors
                retryCount++;
                console.warn(`Attempt ${retryCount}/${MAX_RETRIES} failed with status: ${response.status}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                continue;
            }

            responseData = await response.json();
            success = true;

            if (responseData.success && responseData.response) {
                // Update conversation history
                conversationHistory.push({
                    role: 'user',
                    content: message
                });

                if (responseData.response.text) {
                    conversationHistory.push({
                        role: 'assistant',
                        content: responseData.response.text
                    });
                }
            } else {
                lastError = responseData.error || 'An unknown error occurred';
                success = false;
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        } catch (error) {
            console.error('Error:', error);
            lastError = error.message || 'Network error';
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }

    // Only proceed if we've succeeded
    if (success && responseData?.success) {
        addMessage(responseData.response);
    } else {
        // If we've exhausted all retries, show an error
        console.error(`Failed after ${retryCount} attempts. Last error:`, lastError);
        addMessage('Sorry, I couldn\'t process your request. Please try again in a moment.');
    }

    showLoading(false);
}

// Additional event listeners and DOM content loaded handlers

// Check that the 'available-tables' input exists and is visible
window.addEventListener('DOMContentLoaded', function() {
    // Make sure all config groups are visible
    const configGroups = document.querySelectorAll('.config-group');
    configGroups.forEach(group => {
        group.style.display = 'block';
    });

    // Check for available-tables input
    const availableTablesInput = document.getElementById('available-tables');
    if (!availableTablesInput) {
        // Create it if it doesn't exist
        const configColumnsDiv = document.querySelector('.config-columns');
        if (configColumnsDiv) {
            const configColumn = document.querySelector('.config-column');
            if (configColumn) {
                const availableTablesGroup = document.createElement('div');
                availableTablesGroup.className = 'config-group';
                availableTablesGroup.innerHTML = `
                    <label for="available-tables">Available Tables:</label>
                    <input type="text" id="available-tables" placeholder="comma-separated table names">
                `;
                configColumn.appendChild(availableTablesGroup);
            }
        }
    } else {
        // Make sure parent is visible
        availableTablesInput.parentElement.style.display = 'block';
        // Add a border to make it more noticeable
        availableTablesInput.style.borderColor = '#2563eb';
        availableTablesInput.style.borderWidth = '2px';
    }
});

// Add event listener for chat input
document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});