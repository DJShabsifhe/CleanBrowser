const keywordInput = document.getElementById('keyword');
const addKeywordBtn = document.getElementById('addKeyword');
const removeElementsBtn = document.getElementById('removeElements');
const restoreElementsBtn = document.getElementById('restoreElements');
const keywordsList = document.getElementById('keywordsList');
const status = document.getElementById('status');
let keywords = [];

document.addEventListener('DOMContentLoaded', function() {
    loadKeywords();
    updateKeywordsList();
});

function loadKeywords() {
    chrome.storage.sync.get(['keywords'], function(result) {
        keywords = result.keywords || [];
        updateKeywordsList();
    });
}

function saveKeywords() {
    chrome.storage.sync.set({keywords: keywords});
}

function updateKeywordsList() {
    keywordsList.innerHTML = '';
    if (keywords.length === 0) {
        keywordsList.innerHTML = '<div style="color: #999; font-size: 12px;">暂无关键词</div>';
        return;
    }
    
    keywords.forEach((keyword, index) => {
        const item = document.createElement('div');
        item.className = 'keyword-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        
        const text = document.createElement('span');
        text.textContent = keyword;
        
        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = '×';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.color = 'red';
        deleteBtn.style.marginLeft = '5px';
        deleteBtn.style.fontWeight = 'bold';
        deleteBtn.addEventListener('click', () => removeKeyword(index));
        
        item.appendChild(text);
        item.appendChild(deleteBtn);
        keywordsList.appendChild(item);
    });
}

function removeKeyword(index) {
    keywords.splice(index, 1);
    saveKeywords();
    updateKeywordsList();
    showStatus('关键词已删除', 'success');
}

function showStatus(message, type = 'success') {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 2000);
}

addKeywordBtn.addEventListener('click', function() {
    const keyword = keywordInput.value.trim();
    if (keyword && !keywords.includes(keyword)) {
        keywords.push(keyword);
        saveKeywords();
        updateKeywordsList();
        keywordInput.value = '';
        showStatus('关键词已添加', 'success');
    } else if (keywords.includes(keyword)) {
        showStatus('关键词已存在', 'error');
    } else {
        showStatus('请输入有效关键词', 'error');
    }
});

keywordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addKeywordBtn.click();
    }
});

removeElementsBtn.addEventListener('click', function() {
    if (keywords.length === 0) {
        showStatus('请先添加关键词', 'error');
        return;
    }
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
            action: 'removeElements',
            keywords: keywords
        }, function(response) {
            if (response && response.success) {
                showStatus(`已移除 ${response.count} 个元素，已启用自动移除`, 'success');
            } else {
                showStatus('移除失败，请刷新页面重试', 'error');
            }
        });
    });
});

restoreElementsBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
            action: 'restoreElements'
        }, function(response) {
            if (response && response.success) {
                showStatus('页面已恢复', 'success');
            } else {
                showStatus('恢复失败，请刷新页面', 'error');
            }
        });
    });
}); 