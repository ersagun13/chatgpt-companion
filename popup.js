const status = document.getElementById("status");

async function activeChatGPTTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url?.startsWith("https://chatgpt.com/") ? tab : null;
}

document.getElementById("open").addEventListener("click", async () => {
  const tab = await activeChatGPTTab();
  if (!tab) {
    await chrome.tabs.create({ url: "https://chatgpt.com/" });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "cc:open", view: "home" });
    window.close();
  } catch {
    status.textContent = "ChatGPT sekmesini yenileyin, sonra tekrar deneyin.";
  }
});

document.getElementById("show-toolbox").addEventListener("click", async () => {
  const tab = await activeChatGPTTab();
  if (!tab) {
    status.textContent = "Önce chatgpt.com sayfasını açın.";
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "cc:open", view: "home" });
    window.close();
  } catch {
    status.textContent = "ChatGPT sekmesini yenileyin, sonra tekrar deneyin.";
  }
});

document.getElementById("clear-data").addEventListener("click", async () => {
  if (!confirm("Bu tarayıcıda kayıtlı klasör, etiket ve ayarlar silinsin mi? ChatGPT sohbetleri etkilenmez.")) return;
  const tab = await activeChatGPTTab();
  if (!tab) {
    status.textContent = "Temizlemek için ChatGPT sekmesini açın ve yenileyin.";
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "cc:clear-data" });
    if (!response?.ok) throw new Error(response?.reason || "İşlem tamamlanamadı.");
    status.textContent = "Eklenti verileri temizlendi.";
  } catch {
    status.textContent = "ChatGPT sekmesini yenileyin, sonra tekrar deneyin.";
  }
});
