let removedElements = [];
let currentKeywords = [];
let observer = null;
let intervalId = null;

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'removeElements') {
        currentKeywords = request.keywords;
        const count = removeElementsByKeywords(request.keywords);
        startDynamicMonitoring();
        sendResponse({success: true, count: count});
    } else if (request.action === 'restoreElements') {
        stopDynamicMonitoring();
        currentKeywords = [];
        const success = restoreElements();
        sendResponse({success: success});
    }
    return true;
});

function startDynamicMonitoring() {
    stopDynamicMonitoring();
    
    observer = new MutationObserver(function(mutations) {
        let shouldRecheck = false;
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldRecheck = true;
            }
        });
        
        if (shouldRecheck && currentKeywords.length > 0) {
            setTimeout(() => {
                removeElementsByKeywords(currentKeywords);
            }, 100);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    intervalId = setInterval(() => {
        if (currentKeywords.length > 0) {
            removeElementsByKeywords(currentKeywords);
        }
    }, 2000);
}

function stopDynamicMonitoring() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

// 根据关键词移除元素
function removeElementsByKeywords(keywords) {
    let removedCount = 0;
    const processedElements = new Set();
    
    keywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        const matchingElements = findElementsContainingKeyword(keywordLower);
        
        matchingElements.forEach(element => {
            if (processedElements.has(element) || 
                element.style.display === 'none' ||
                element.getAttribute('data-element-remover-hidden') === 'true') {
                return;
            }
            
            if (isImportantContainerElement(element)) {
                return;
            }
            
            const elementInfo = {
                element: element,
                parent: element.parentNode,
                nextSibling: element.nextSibling,
                originalDisplay: element.style.display || '',
                matchedKeyword: keyword
            };
            
            removedElements.push(elementInfo);
            element.style.display = 'none';
            element.setAttribute('data-element-remover-hidden', 'true');
            
            markElementAndAncestorsAsProcessed(element, processedElements);
            removedCount++;
        });
    });
    
    return removedCount;
}

function findElementsContainingKeyword(keyword) {
    const matchingElements = new Set();
    const processedElements = new Set();
    
    const allElements = Array.from(document.querySelectorAll('*'));
    allElements.forEach(element => {
        if (containsKeywordInAttributes(element, keyword)) {
            matchingElements.add(element);
            processedElements.add(element);
        }
    });
    
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
        if (!textNode.textContent.toLowerCase().includes(keyword)) {
            continue;
        }
        
        let targetElement = findBestTargetElement(textNode, keyword);
        if (targetElement && !processedElements.has(targetElement)) {
            matchingElements.add(targetElement);
            markElementTreeAsProcessed(targetElement, processedElements);
        }
    }
    
    return Array.from(matchingElements);
}

function findBestTargetElement(textNode, keyword) {
    let element = textNode.parentElement;
    let candidates = [];
    
    while (element && element !== document.body) {
        if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(element.tagName)) {
            break;
        }
        
        if (element.style.display === 'none' || element.getAttribute('data-element-remover-hidden') === 'true') {
            break;
        }
        
        if (isFormElementOrContainer(element)) {
            element = element.parentElement;
            continue;
        }
        
        candidates.push(element);
        element = element.parentElement;
    }
    
    if (candidates.length === 0) {
        return null;
    }
    
    for (let candidate of candidates) {
        if (isLeafOrNearLeaf(candidate)) {
            return candidate;
        }
    }
    
    for (let candidate of candidates) {
        if (isSmallContainer(candidate, keyword)) {
            return candidate;
        }
    }
    
    for (let candidate of candidates) {
        if (isTargetableElement(candidate)) {
            return candidate;
        }
    }
    
    return candidates[0] || null;
}

function isFormElementOrContainer(element) {
    const formTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'FORM', 'LABEL'];
    if (formTags.includes(element.tagName)) {
        return true;
    }
    
    if (element.parentElement && formTags.includes(element.parentElement.tagName)) {
        return true;
    }
    
    const searchRelatedClasses = ['search', 'input', 'form'];
    const className = (element.className || '').toLowerCase();
    if (searchRelatedClasses.some(cls => className.includes(cls))) {
        if (element.querySelector('input, textarea, select')) {
            return true;
        }
    }
    
    return false;
}

function isLeafOrNearLeaf(element) {
    const childElements = Array.from(element.children);
    
    if (childElements.length === 0) {
        return true;
    }
    
    if (childElements.length <= 2) {
        return childElements.every(child => 
            ['SPAN', 'EM', 'STRONG', 'B', 'I', 'SMALL'].includes(child.tagName) ||
            child.children.length === 0
        );
    }
    
    return false;
}

function isSmallContainer(element, keyword) {
    if (element.children.length > 5) {
        return false;
    }
    
    const totalText = element.textContent || '';
    const keywordMatches = (totalText.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
    const textLength = totalText.trim().length;
    
    if (textLength > 0 && keywordMatches * keyword.length / textLength > 0.1) {
        return true;
    }
    
    return false;
}

function isTargetableElement(element) {
    const targetableTags = ['A', 'BUTTON', 'LI', 'TD', 'TH', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
    return targetableTags.includes(element.tagName) && element.children.length <= 8;
}

function markElementTreeAsProcessed(element, processedSet) {
    processedSet.add(element);
    Array.from(element.querySelectorAll('*')).forEach(child => {
        processedSet.add(child);
    });
}

function isSmallElement(element) {
    return element.children.length <= 8 && 
           !isImportantContainerElement(element) &&
           element.tagName !== 'BODY';
}

function findSmallestContainingChild(element, keyword) {
    for (let child of element.children) {
        if (child.textContent.toLowerCase().includes(keyword)) {
            if (isSmallElement(child)) {
                return child;
            } else {
                const smallerChild = findSmallestContainingChild(child, keyword);
                if (smallerChild) {
                    return smallerChild;
                }
            }
        }
    }
    return null;
}

function isLeafElement(element) {
    return element.children.length === 0 || 
           (element.children.length === 1 && element.children[0].tagName === 'SPAN');
}

function isSuitableTargetElement(element) {
    const suitableTags = ['DIV', 'SPAN', 'P', 'A', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
    return suitableTags.includes(element.tagName) && element.children.length <= 5;
}

function containsKeywordInAttributes(element, keyword) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
        const attributes = ['class', 'id'];
        for (let attr of attributes) {
            const value = element.getAttribute(attr);
            if (value && value.toLowerCase().includes(keyword)) {
                return true;
            }
        }
        return false;
    }
    
    const attributes = ['class', 'id', 'alt', 'title', 'aria-label'];
    
    for (let attr of attributes) {
        const value = element.getAttribute(attr);
        if (value && value.toLowerCase().includes(keyword)) {
            return true;
        }
    }
    
    for (let attr of element.attributes) {
        if (attr.name.startsWith('data-') && 
            attr.value.toLowerCase().includes(keyword)) {
            return true;
        }
    }
    
    return false;
}

function getElementDepth(element) {
    let depth = 0;
    let current = element;
    while (current.parentElement) {
        depth++;
        current = current.parentElement;
    }
    return depth;
}

function markElementAndAncestorsAsProcessed(element, processedSet) {
    let current = element;
    while (current && current !== document.body) {
        processedSet.add(current);
        current = current.parentElement;
    }
}

function isImportantContainerElement(element) {
    const importantTags = ['MAIN', 'ARTICLE', 'SECTION', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 'TABLE', 'TBODY', 'THEAD'];
    if (importantTags.includes(element.tagName)) {
        return true;
    }
    
    if (element.children.length > 20) {
        return true;
    }
    
    const importantClasses = ['container', 'content', 'main', 'wrapper', 'page', 'article', 'layout', 'sidebar', 'navigation'];
    const className = (element.className || '').toLowerCase();
    if (importantClasses.some(cls => className.includes(cls)) && element.children.length > 10) {
        return true;
    }
    
    if (element.querySelector('form, input, button, select, textarea') && element.children.length > 5) {
        return true;
    }
    
    if (element === document.body || element.parentElement === document.body) {
        return true;
    }
    
    return false;
}

function containsKeywordDirectly(element, keyword) {
    const directTextContent = getDirectTextContent(element);
    if (directTextContent.toLowerCase().includes(keyword)) {
        return true;
    }
    
    if (element.className && 
        element.className.toString().toLowerCase().includes(keyword)) {
        return true;
    }
    
    if (element.id && element.id.toLowerCase().includes(keyword)) {
        return true;
    }
    
    const attributes = ['alt', 'title', 'placeholder', 'aria-label', 'data-type'];
    for (let attr of attributes) {
        const attrValue = element.getAttribute(attr);
        if (attrValue && attrValue.toLowerCase().includes(keyword)) {
            return true;
        }
    }
    
    for (let attr of element.attributes) {
        if (attr.name.startsWith('data-') && 
            attr.value.toLowerCase().includes(keyword)) {
            return true;
        }
    }
    
    return false;
}

function getDirectTextContent(element) {
    let directText = '';
    
    for (let node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            directText += node.textContent;
        }
    }
    
    return directText.trim();
}

function containsKeyword(element, keyword) {
    const textContent = element.textContent || '';
    if (textContent.toLowerCase().includes(keyword)) {
        return true;
    }
    
    const attributes = ['class', 'id', 'alt', 'title', 'placeholder', 'data-*'];
    for (let attr of attributes) {
        const attrValue = element.getAttribute(attr);
        if (attrValue && attrValue.toLowerCase().includes(keyword)) {
            return true;
        }
    }
    
    for (let attr of element.attributes) {
        if (attr.name.startsWith('data-') && 
            attr.value.toLowerCase().includes(keyword)) {
            return true;
        }
    }
    
    if (element.className && 
        element.className.toString().toLowerCase().includes(keyword)) {
        return true;
    }
    
    return false;
}

function restoreElements() {
    try {
        removedElements.forEach(elementInfo => {
            if (elementInfo.element && elementInfo.element.parentNode) {
                elementInfo.element.style.display = elementInfo.originalDisplay;
                elementInfo.element.removeAttribute('data-element-remover-hidden');
            }
        });
        
        const hiddenElements = document.querySelectorAll('[data-element-remover-hidden="true"]');
        hiddenElements.forEach(element => {
            element.style.display = '';
            element.removeAttribute('data-element-remover-hidden');
        });
        
        removedElements = [];
        
        console.log('元素移除器: 页面已恢复');
        return true;
    } catch (error) {
        console.error('元素移除器: 恢复失败', error);
        return false;
    }
}

function initAutoRemoval() {
    chrome.storage.sync.get(['keywords'], function(result) {
        const keywords = result.keywords || [];
        if (keywords.length > 0) {
            currentKeywords = keywords;
            removeElementsByKeywords(keywords);
            setTimeout(() => {
                removeElementsByKeywords(keywords);
                startDynamicMonitoring();
            }, 100);
        }
    });
}

let currentUrl = location.href;
function detectUrlChange() {
    if (currentUrl !== location.href) {
        currentUrl = location.href;
        initAutoRemoval();
        setTimeout(() => {
            initAutoRemoval();
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', initAutoRemoval);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoRemoval);
} else {
    initAutoRemoval();
}

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
    originalPushState.apply(history, args);
    initAutoRemoval();
    setTimeout(initAutoRemoval, 500);
};

history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    initAutoRemoval();
    setTimeout(initAutoRemoval, 500);
};

window.addEventListener('popstate', function() {
    initAutoRemoval();
    setTimeout(initAutoRemoval, 500);
});

setInterval(detectUrlChange, 2000); 