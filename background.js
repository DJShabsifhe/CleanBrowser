chrome.runtime.onInstalled.addListener(function(details) {
    console.log('元素移除器插件已安装');
    
    chrome.storage.sync.set({
        keywords: [],
        isEnabled: true
    });
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'getKeywords') {
        chrome.storage.sync.get(['keywords'], function(result) {
            sendResponse({keywords: result.keywords || []});
        });
        return true;
    }
    
    if (request.action === 'saveKeywords') {
        chrome.storage.sync.set({keywords: request.keywords}, function() {
            sendResponse({success: true});
        });
        return true;
    }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('页面加载完成:', tab.url);
    }
});

chrome.action.onClicked.addListener(function(tab) {
}); 