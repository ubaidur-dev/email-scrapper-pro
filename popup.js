const BLACKLIST = ["youremail", "ubaid.dev@gmail.com", "ubaidur.dev@gmail.com"];

document.addEventListener('DOMContentLoaded', async () => {
    await scanCurrentPage();
});

async function scanCurrentPage() {
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const extraction = await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
                let allText = "";
                const elements = document.body.getElementsByTagName('*');
                
                for (let i = 0; i < elements.length; i++) {
                    const el = elements[i];
                    if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
                        if (el.innerText) {
                            allText += " " + el.innerText;
                        }
                        if (el.innerHTML) {
                            allText += " " + el.innerHTML;
                        }
                    }
                }
                const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
                return allText.match(regex) || [];
            }
        });

        const rawMails = extraction[0]?.result || [];
        await filterAndStore(rawMails);
    } catch (e) {
        console.error("Scan Error:", e);
    }
}

async function filterAndStore(newList) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['savedEmails'], (data) => {
            const current = data.savedEmails || [];

            const cleanList = newList.filter(email => {
                const e = email.toLowerCase().trim();

                if (!e.includes('@') || !e.includes('.')) return false;

                const isBad = BLACKLIST.some(word => e.includes(word));
                const junkPatterns = ["2x", "thumbnail", "featured", "icon", "logo", "btn", "button", "half-cut", "responsive", "png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js"];
                const hasJunk = junkPatterns.some(word => e.includes(word));
                const isFile = e.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico|pdf|xml|json|mp4|woff|ttf)$/i);
                
                const isDummy = e.match(/(example|test|domain|yourdomain|lipsum|noreply|admin|gravatar|w3\.org)/i);
                const isSentryTracker = /^[a-f0-9]{32}@/i.test(e) || e.includes("sentry");

                const domainPart = e.split('@')[1] || '';
                const domainIsFile = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(domainPart);

                
                return !isBad && !hasJunk && !isFile && !isDummy && !isSentryTracker && !domainIsFile && e.length > 8;
            }).map(e => e.toLowerCase());

            const merged = [...new Set([...current, ...cleanList])];
            
            chrome.storage.local.set({ 'savedEmails': merged }, () => {
                syncCounter();
                resolve();
            });
        });
    });
}

function syncCounter() {
    chrome.storage.local.get(['savedEmails'], (res) => {
        document.getElementById('total').innerText = (res.savedEmails || []).length;
    });
}

document.getElementById('downloadBtn').addEventListener('click', () => {
    chrome.storage.local.get(['savedEmails'], (res) => {
        const emails = res.savedEmails || [];
        if (!emails.length) return alert("Nothing found.");
        
        const text = emails.join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `leads_export.txt`;
        link.click();
    });
});

document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm("Delete all leads?")) {
        chrome.storage.local.set({ 'savedEmails': [] }, () => {
            document.getElementById('total').innerText = "0";
        });
    }
});
