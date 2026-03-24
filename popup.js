const DEFAULT_URL = "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm";

const input = document.getElementById("urlInput");
const savedEl = document.getElementById("saved");

chrome.storage.sync.get("bookReaderUrl", (data) => {
  input.value = data.bookReaderUrl || DEFAULT_URL;
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const url = input.value.trim();
  if (url) {
    chrome.storage.sync.set({ bookReaderUrl: url }, () => {
      savedEl.style.display = "block";
      setTimeout(() => savedEl.style.display = "none", 2000);
    });
  }
});
