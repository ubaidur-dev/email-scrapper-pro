

const BLACKLIST = ["youremail", "ubaid.dev@gmail.com", "ubaidur.dev@gmail.com"];


document.addEventListener('DOMContentLoaded', () => {
    syncCounter();
});


document.getElementById('scanBtn').addEventListener('click', async () => {
    const btn = document.getElementById('scanBtn');
    const status = document.getElementById('status');
    const countBox = document.getElementById('total');
    const label = document.getElementById('label');


    btn.disabled = true;
    btn.innerText = "Working...";
    status.style.display = "block";
    countBox.style.display = "none";
    label.innerText = "Processing Sites";


    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const extraction = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
            const allLinks = Array.from(document.querySelectorAll('a')).map(a => a.href);
            return [...new Set(allLinks)].filter(link => {
                try {
                    const u = new URL(link);
                    return u.protocol.startsWith('http') && !u.hostname.includes('google.com');
                } catch { return false; }
            });
        }
    });

    const targetList = extraction[0].result;

    if (!targetList.length) {
        alert("No links found on this page.");
        resetUI(btn, status, countBox, label);
        return;
    }

    for (const url of targetList) {
        try {
            // Open background tab
            const hiddenTab = await chrome.tabs.create({ url: url, active: false });

            
            await new Promise(res => setTimeout(res, 5000));

            
            const siteContent = await chrome.scripting.executeScript({
                target: { tabId: hiddenTab.id },
                func: () => {
                    const body = document.body.innerText + " " + document.body.innerHTML;
                    const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
                    return body.match(regex);
                }
            });

            const foundMails = siteContent[0].result;
            if (foundMails) {
                await filterAndStore(foundMails);
            }

           
            await chrome.tabs.remove(hiddenTab.id);

        } catch (e) {
            console.log("Skipped a site...");
        }
    }

    resetUI(btn, status, countBox, label);
    alert("Scraping Complete!");
});


async function filterAndStore(newList) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['savedEmails'], (data) => {
            const current = data.savedEmails || [];
            
            const cleanList = newList.filter(email => {
                const e = email.toLowerCase().trim();
                const isBad = BLACKLIST.some(word => e.includes(word));
                const isAsset = e.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i);
                return !isBad && !isAsset && e.includes('.') && e.length > 8;
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

function resetUI(btn, status, count, label) {
    btn.disabled = false;
    btn.innerText = "Start Scrapping Now";
    status.style.display = "none";
    count.style.display = "block";
    label.innerText = "Leads Collected";
}


document.getElementById('downloadBtn').addEventListener('click', () => {
    chrome.storage.local.get(['savedEmails'], (res) => {
        const emails = res.savedEmails || [];
        if (!emails.length) return alert("Nothing to download.");

        const text = "COLLECTED BUSINESS EMAILS\n\n" + emails.map((e, i) => `${i + 1}. ${e}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `leads_export.txt`;
        link.click();
    });
});

document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm("Permanently delete all data?")) {
        chrome.storage.local.set({ 'savedEmails': [] }, () => syncCounter());
    }
});