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
            this.showError('网络错误: ' + error.message);
        }
    }

    showLoading() {
        this.submitBtn.disabled = true;
        this.submitBtn.textContent = '处理中...';
        this.resultSection.style.display = 'block';
        this.resultContent.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <span>正在处理您的请求...</span>
            </div>
        `;
    }

    showResult(result) {
        this.submitBtn.disabled = false;
        this.submitBtn.textContent = '分析内容';
        
        this.resultContent.innerHTML = `
            <div class="result-header">
                <h3>分析结果</h3>
                <span class="status-complete">完成</span>
            </div>
            <div class="result-text">${result.answer}</div>
            <div class="result-meta">
                <strong>URL:</strong> ${result.url}<br>
                <strong>处理时间:</strong> ${new Date(result.timestamp).toLocaleString()}
            </div>
        `;
    }

    showError(message) {
        this.submitBtn.disabled = false;
        this.submitBtn.textContent = '分析内容';
        this.resultSection.style.display = 'block';
        
        this.resultContent.innerHTML = `
            <div class="result-header">
                <h3>错误</h3>
                <span class="status-error">失败</span>
            </div>
            <div class="result-text error">${message}</div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MCPFetchClient();
});