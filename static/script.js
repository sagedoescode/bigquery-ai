
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

        // Add tables
        if (content.tables && content.tables.length > 0) {
            content.tables.forEach(tableData => {
                const tableContainer = createTableHTML(tableData);
                contentDiv.appendChild(tableContainer);
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

    const table = document.createElement('table');

    // Create header
    if (tableData.headers && tableData.headers.length > 0) {
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        tableData.headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);
    }

    // Create body
    if (tableData.rows && tableData.rows.length > 0) {
        const tbody = document.createElement('tbody');

        tableData.rows.forEach(row => {
            const tr = document.createElement('tr');

            row.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell;
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
    }

    tableContainer.appendChild(table);
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

        if (data.success) {
            addMessage(data.response);

            // Update conversation history
            conversationHistory.push({
                user_message: { text: message }
            });

            if (data.response.text) {
                conversationHistory.push({
                    system_message: { text_message: { text: data.response.text } }
                });
            }
        } else {
            addMessage(`Error: ${data.error}`);
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
        }
    } catch (error) {
        console.warn('Agent initialization error:', error);
        addMessage('Welcome! Im ready to help with your sales data questions.');
    } finally {
        showLoading(false);
    }
});
