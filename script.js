class SimpleBrowser {
    constructor() {
        this.webview = document.getElementById('webview');
        this.urlInput = document.getElementById('url-input');
        this.backBtn = document.getElementById('back-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.goBtn = document.getElementById('go-btn');

        this.history = [];
        this.currentIndex = -1;

        this.init();
    }

    init() {
        // 绑定事件
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.refreshBtn.addEventListener('click', () => this.refresh());
        this.goBtn.addEventListener('click', () => this.navigate());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.navigate();
        });

        // 监听iframe加载完成
        this.webview.addEventListener('load', () => this.onPageLoad());

        // 初始化状态
        this.updateButtons();
    }

    navigate(url) {
        const targetUrl = url || this.urlInput.value.trim();
        if (!targetUrl) return;

        // 处理URL
        let finalUrl = targetUrl;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            // 如果不是URL，当作搜索
            if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
                finalUrl = 'https://' + targetUrl;
            } else {
                finalUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(targetUrl)}`;
            }
        }

        this.loadUrl(finalUrl);
    }

    loadUrl(url) {
        try {
            this.webview.src = url;
            this.urlInput.value = url;
        } catch (error) {
            console.error('加载URL失败:', error);
        }
    }

    goBack() {
        if (this.webview.contentWindow.history.length > 1) {
            this.webview.contentWindow.history.back();
        }
    }

    goForward() {
        this.webview.contentWindow.history.forward();
    }

    refresh() {
        this.webview.contentWindow.location.reload();
    }

    onPageLoad() {
        const currentUrl = this.webview.contentWindow.location.href;
        if (currentUrl !== 'about:blank') {
            this.urlInput.value = currentUrl;
        }
        this.updateButtons();
    }

    updateButtons() {
        // 这里可以根据历史状态更新按钮状态
        // 暂时保持简单
    }
}

// 初始化浏览器
document.addEventListener('DOMContentLoaded', () => {
    new SimpleBrowser();
});