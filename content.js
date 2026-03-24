const DEFAULT_URL = "https://books.google.com/";

let isOpen = false;
let currentUrl = DEFAULT_URL;
// simple in‑memory cache to avoid refetching the same page repeatedly
const cache = {
  url: null,
  text: null
};

function createWidget(bookUrl) {
  currentUrl = bookUrl;

  const container = document.createElement("div");
  container.id = "book-reader-widget";

  const btn = document.createElement("button");
  btn.id = "book-reader-btn";
  btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;

  const panel = document.createElement("div");
  panel.id = "book-reader-panel";

  const header = document.createElement("div");
  header.id = "book-reader-header";
  header.innerHTML = `<span>📖 Book Reader</span><div id="book-reader-actions"><button id="book-reader-save" title="Save current page">🔖</button><button id="book-reader-reload" title="Reload">↺</button><button id="book-reader-close" title="Close">✕</button></div>`;

  const content = document.createElement("div");
  content.id = "book-reader-content";
  content.innerHTML = `<div id="book-reader-loading">Loading...</div>`;

  // delegate clicks on links so we always load them inside the panel. this
  // covers the nav buttons (`a.btn-chapter-nav`) which were sometimes
  // opening in the external browser because the individual listeners weren’t
  // being attached reliably.
  content.addEventListener("click", e => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    // ignore anchors/mailto
    if (href.startsWith("#") || href.startsWith("mailto:")) return;
    e.preventDefault();
    currentUrl = a.href;
    loadContent(a.href);
  });

  panel.appendChild(header);
  panel.appendChild(content);
  container.appendChild(panel);
  container.appendChild(btn);
  document.body.appendChild(container);

  btn.addEventListener("click", togglePanel);
  document.getElementById("book-reader-close").addEventListener("click", closePanel);
  document.getElementById("book-reader-reload").addEventListener("click", () => loadContent(currentUrl));
  document.getElementById("book-reader-save").addEventListener("click", () => {
    chrome.storage.sync.set({ bookReaderUrl: currentUrl }, () => {
      const btn = document.getElementById("book-reader-save");
      btn.textContent = "✓";
      setTimeout(() => btn.textContent = "🔖", 1500);
    });
  });

  // do not fetch automatically when widget is created – wait until user opens the panel
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.bookReaderUrl) {
      currentUrl = changes.bookReaderUrl.newValue;
      // only reload if panel is already open (user is looking at content)
      if (isOpen) {
        loadContent(currentUrl);
      }
    }
  });
}

function extractReadableContent(doc) {
  const navButtons = doc.querySelectorAll('a.btn-chapter-nav');
  const navHTML = Array.from(navButtons).map(el => el.outerHTML).join('');

  // Remove all junk elements first
  const removeSelectors = [
    "script","style","noscript","img","picture","video","audio",
    "iframe","canvas","form","input","select","textarea",
    "nav","header","footer","aside","menu","menuitem",
    "[class*='nav']","[class*='menu']","[class*='header']","[class*='footer']",
    "[class*='sidebar']","[class*='widget']","[class*='ad']","[class*='banner']",
    "[class*='popup']","[class*='modal']","[class*='cookie']","[class*='share']",
    "[class*='social']","[class*='comment']","[class*='related']",
    "[id*='nav']","[id*='menu']","[id*='header']","[id*='footer']",
    "[id*='sidebar']","[id*='ad']","[id*='banner']","[id*='comment']"
  ];

  removeSelectors.forEach(sel => {
    try {
      doc.querySelectorAll(sel).forEach(el => el.remove());
    } catch(e) {}
  });

  // Try to find the main content block
  const candidates = [
    "article", "main", "[role='main']",
    ".post-content", ".entry-content", ".article-content", ".article-body",
    ".content-body", ".story-body", ".post-body", ".chapter-content",
    "#content", "#main", "#article", "#post"
  ];

  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length > 200) {
      return navHTML + el.innerHTML + navHTML;
    }
  }

  // Fallback: find the div with most text
  let best = doc.body;
  let bestLen = 0;

  doc.querySelectorAll("div, section").forEach(el => {
    const len = (el.innerText || el.textContent || "").trim().length;
    if (len > bestLen) { bestLen = len; best = el; }
  });

  return navHTML + (best ? best.innerHTML : doc.body.innerHTML) + navHTML;
}

function loadContent(url, force = false) {
  const content = document.getElementById("book-reader-content");

  // if we already fetched this url and the caller didn't force a reload, use cache
  if (!force && cache.url === url && cache.text) {
    content.innerHTML = `<div id="book-reader-body">${cache.text}</div>`;
    // scroll to top just in case panel was closed/reopened
    content.scrollTop = 0;
    return;
  }

  content.innerHTML = `<div id="book-reader-loading">Loading...</div>`;

  chrome.runtime.sendMessage({ type: "FETCH_URL", url }, (response) => {
    if (!response || !response.success) {
      content.innerHTML = `<div id="book-reader-loading">❌ Cannot load page.<br><small>${response?.error || "Unknown error"}</small></div>`;
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(response.html, "text/html");
    const text = extractReadableContent(doc);

    // update cache
    cache.url = url;
    cache.text = text;

    content.innerHTML = `<div id="book-reader-body">${text}</div>`;

    // Fix relative links
    const base = new URL(url);
    content.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      if (href && !href.startsWith("http") && !href.startsWith("#") && !href.startsWith("mailto")) {
        try { a.href = new URL(href, base).href; } catch(e) {}
      }
    });

    content.scrollTop = 0;
  });
}

function togglePanel() {
  if (isOpen) {
    closePanel();
  } else {
    openPanel();
    // when user clicks the book icon, load content if not already cached
    if (cache.url !== currentUrl) {
      loadContent(currentUrl);
    }
  }
}

function openPanel() {
  isOpen = true;
  document.getElementById("book-reader-panel").classList.add("open");
  document.getElementById("book-reader-btn").classList.add("active");
}

function closePanel() {
  isOpen = false;
  document.getElementById("book-reader-panel").classList.remove("open");
  document.getElementById("book-reader-btn").classList.remove("active");
}

function init() {
  chrome.storage.sync.get("bookReaderUrl", (data) => {
    createWidget(data.bookReaderUrl || DEFAULT_URL);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
