chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_URL") {
    fetch(message.url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    })
      .then(res => res.text())
      .then(html => sendResponse({ success: true, html }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});
