let conversationHistory = [];
let isLoading = false;

function addMessage(content, isUser = false, hasTable = false) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

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

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory
            })
        });

        const data = await response.json();

        if (data.success && data.response) {
            // Pass the entire response object to addMessage
            addMessage(data.response);

            // Update conversation history
            conversationHistory.push({
                role: 'user',
                content: message
            });

            if (data.response.text) {
                conversationHistory.push({
                    role: 'assistant',
                    content: data.response.text
                });
            }
        } else {
            const errorMsg = data.error || 'An unknown error occurred';
            addMessage(`Error: ${errorMsg}`);
        }

    } catch (error) {
        console.error('Error:', error);
        addMessage('Sorry, there was an error processing your request. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Event listeners
document.getElementById('chat-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
// Add these functions to script.js

let currentConfig = {
    project_id: 'gen-lang-client-0691935742',
    location: 'global',
    dataset_id: 'accountstable',
    table_id: 'salestable',
    data_dictionary: 'net_value: Final net revenue amount - use for all revenue calculations\nconversion_value: Initial conversion value - may differ from net_value\nconversion_date: Primary date field for time-based analysis'
};
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
    document.getElementById('data-dictionary').value = currentConfig.data_dictionary || '';
}

function saveConfiguration() {
    const projectId = document.getElementById('project-id').value.trim();
    const location = document.getElementById('location').value;
    const datasetId = document.getElementById('dataset-id').value.trim();
    const tableId = document.getElementById('table-id').value.trim();

    if (!projectId || !datasetId) {
        showConfigStatus('Project ID and Dataset ID are required!', 'error');
        return;
    }

    const newConfig = {
        project_id: projectId,
        location: location,
        dataset_id: datasetId,
        table_id: tableId,
        data_dictionary: document.getElementById('data-dictionary').value.trim()
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
        table_id: 'salestable',
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

    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

// Modify the existing sendMessage function to include config
async function sendMessage() {
    if (isLoading) return;

    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message) return;

    addMessage(message, true);
    chatInput.value = '';
    showLoading(true);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory,
                config: currentConfig // Add current config
            })
        });

        // Rest of the function remains the same...
        const data = await response.json();

        if (data.success && data.response) {
            addMessage(data.response);
            conversationHistory.push({
                role: 'user',
                content: message
            });

            if (data.response.text) {
                conversationHistory.push({
                    role: 'assistant',
                    content: data.response.text
                });
            }
        } else {
            const errorMsg = data.error || 'An unknown error occurred';
            addMessage(`Error: ${errorMsg}`);
        }

    } catch (error) {
        console.error('Error:', error);
        addMessage('Sorry, there was an error processing your request. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Update the window load event listener
window.addEventListener('load', async function() {
    initializeConfigPanel(); // Initialize config panel first

    try {
        showLoading(true);
        const response = await fetch('/api/initialize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ config: currentConfig }) // Send config to backend
        });

        const data = await response.json();
        if (!data.success) {
            console.warn('Agent initialization failed:', data.error);
            addMessage('Note: Some advanced features may not be available. You can still ask basic questions.');
        } else {
            console.log('Data agent initialized successfully');
        }
    } catch (error) {
        console.warn('Agent initialization error:', error);
        addMessage('Welcome! I\'m ready to help with your data questions.');
    } finally {
        showLoading(false);
    }
});
// Initialize the data agent on page load
window.addEventListener('load', async function() {
    try {
        showLoading(true);
        const response = await fetch('/api/initialize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();
        if (!data.success) {
            console.warn('Agent initialization failed:', data.error);
            addMessage('Note: Some advanced features may not be available. You can still ask basic questions.');
        } else {
            console.log('Data agent initialized successfully');
        }
    } catch (error) {
        console.warn('Agent initialization error:', error);
        addMessage('Welcome! Im ready to help with your data questions.');
    } finally {
        showLoading(false);
    }
});