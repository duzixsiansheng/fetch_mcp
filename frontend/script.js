class MCPFetchClient {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3001/api';
        this.form = document.getElementById('fetchForm');
        this.resultSection = document.getElementById('resultSection');
        this.resultContent = document.getElementById('resultContent');
        this.submitBtn = document.getElementById('submitBtn');
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const url = document.getElementById('url').value;
        const question = document.getElementById('question').value;

        this.showLoading();
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/ask`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url, question })
            });

            const result = await response.json();

            if (result.success) {
                this.showResult(result.data);
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError('error: ' + error.message);
        }
    }

    showLoading() {
        this.submitBtn.disabled = true;
        this.submitBtn.textContent = 'processing...';
        this.resultSection.style.display = 'block';
        this.resultContent.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <span>processing...</span>
            </div>
        `;
    }

    showResult(result) {
        this.submitBtn.disabled = false;
        this.submitBtn.textContent = 'content';
        
        this.resultContent.innerHTML = `
            <div class="result-header">
                <h3>result</h3>
                <span class="status-complete">done</span>
            </div>
            <div class="result-text">${result.answer}</div>
            <div class="result-meta">
                <strong>URL:</strong> ${result.url}<br>
                <strong>time:</strong> ${new Date(result.timestamp).toLocaleString()}
            </div>
        `;
    }

    showError(message) {
        this.submitBtn.disabled = false;
        this.submitBtn.textContent = 'content';
        this.resultSection.style.display = 'block';
        
        this.resultContent.innerHTML = `
            <div class="result-header">
                <h3>error</h3>
                <span class="status-error">fail</span>
            </div>
            <div class="result-text error">${message}</div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MCPFetchClient();
});
