
const DUMMY_PATTERNS = [
    "example", "test", "domain", "your.email", "youremail", "any-name", 
    "not-a-real-email", "noreply", "sentry", "u003e", "&gt;", "placeholder"
];

let USER_EMAIL = "";

chrome.identity.getProfileUserInfo((userInfo) => {
    if (userInfo.email) USER_EMAIL = userInfo.email.toLowerCase();
});

document.addEventListener('DOMContentLoaded', async () => {
    syncCounter();
    setTimeout(async () => {
        await startDeepScan();
    }, 500);
});

async function startDeepScan() {
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!currentTab || !currentTab.id || currentTab.url.startsWith('chrome://')) return;

        const currentDomain = new URL(currentTab.url).hostname;
        const currentBaseUrl = new URL(currentTab.url).origin;

        updateSiteCounter(currentDomain);

        const immediateEmails = await executeScanOnTab(currentTab.id);
        await filterAndStore(immediateEmails);

        chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: (baseUrl) => {
                const links = Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(href => href.includes(baseUrl) && 
                        (href.toLowerCase().includes('contact') || 
                         href.toLowerCase().includes('about') || 
                         href.toLowerCase().includes('reach')));
                return [...new Set(links)];
            },
            args: [currentBaseUrl]
        }, async (results) => {
            const deepLinks = results[0]?.result || [];
            for (const link of deepLinks) {
                try {
                    const response = await fetch(link);
                    const html = await response.text();
                    const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,20}/g;
                    const found = html.match(regex) || [];
                    if (found.length > 0) await filterAndStore(found);
                } catch (err) { console.error("Deep Scan Error:", err); }
            }
        });

    } catch (e) { console.error("Infratel Engine Error:", e); }
}

async function executeScanOnTab(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
            const source = document.documentElement.outerHTML || "";
            const visible = document.body ? document.body.innerText : "";
            const combined = source + " " + visible;
            
            const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,20}/g;
            let found = combined.match(regex) || [];
            
            const mailtos = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
                                 .map(a => a.href.replace('mailto:', '').split('?')[0]);
            
            return [...new Set([...found, ...mailtos])];
        }
    });
    return results[0]?.result || [];
}

async function filterAndStore(newList) {
    chrome.storage.local.get(['savedEmails'], (data) => {
        const currentEmails = data.savedEmails || [];
        
        const cleanList = newList.map(email => {
            return email.toLowerCase().replace(/^u003e|^&gt;|^gt;/, '').trim();
        }).filter(e => {
            if (!e.includes('@') || e.length < 8) return false;
            
            const isDummy = DUMMY_PATTERNS.some(p => e.includes(p));
            if (isDummy) return false;

            if (USER_EMAIL && e === USER_EMAIL) return false;

            const junkExts = ["png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js"];
            const isFile = junkExts.some(ext => e.endsWith(ext));
            if (isFile) return false;

            
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
        });

        const mergedEmails = [...new Set([...currentEmails, ...cleanList])];
        chrome.storage.local.set({ 'savedEmails': mergedEmails }, () => syncCounter());
    });
}

function updateSiteCounter(domain) {
    chrome.storage.local.get(['scannedSites'], (data) => {
        let currentSites = data.scannedSites || [];
        if (!currentSites.includes(domain)) {
            currentSites.push(domain);
            chrome.storage.local.set({ 'scannedSites': currentSites }, () => syncCounter());
        }
    });
}

function syncCounter() {
    chrome.storage.local.get(['savedEmails', 'scannedSites'], (res) => {
        const leads = document.getElementById('total');
        const sites = document.getElementById('siteCount');
        if (leads) leads.innerText = (res.savedEmails || []).length;
        if (sites) sites.innerText = (res.scannedSites || []).length;
    });
}


document.getElementById('downloadBtn').onclick = () => {
    chrome.storage.local.get(['savedEmails'], (res) => {
        const emails = res.savedEmails || [];
        if (!emails.length) return alert("Let's get the leads first!");
        const blob = new Blob([emails.join('\n')], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `LeadLoom_Business_Leads_${new Date().toISOString().split('T')[0]}.txt`;
        link.click();
    });
};

document.getElementById('clearBtn').onclick = () => {
    if (confirm("Reset all data?")) {
        chrome.storage.local.set({ 'savedEmails': [], 'scannedSites': [] }, () => syncCounter());
    }
};
