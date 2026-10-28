const LOCAL_DB_NAME = "chatgpt-companion-local";
let localDbPromise;

function openLocalDb() {
  if (localDbPromise) return localDbPromise;
  localDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, 4);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "key" });
      if (!db.objectStoreNames.contains("messages")) {
        const messages = db.createObjectStore("messages", { keyPath: "key" });
        messages.createIndex("conversationId", "conversationId", { unique: false });
      }
      if (!db.objectStoreNames.contains("indexedChats")) db.createObjectStore("indexedChats", { keyPath: "id" });
      if (!db.objectStoreNames.contains("historyCatalog")) db.createObjectStore("historyCatalog", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chatMeta")) db.createObjectStore("chatMeta", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Yerel sohbet veritabanı açılamadı."));
    request.onblocked = () => reject(new Error("Yerel veritabanı başka bir işlem tarafından kullanılıyor."));
  }).catch((error) => { localDbPromise = null; throw error; });
  return localDbPromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Geçici kayıt işlemi başarısız oldu."));
    transaction.onabort = () => reject(transaction.error || new Error("Geçici kayıt işlemi iptal edildi."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Geçici kayıt okunamadı."));
  });
}

async function tempStoreAction(action, payload = {}) {
  const db = await openLocalDb();
  if (action === "save") {
    const transaction = db.transaction("records", "readwrite");
    transaction.objectStore("records").put({ key: `${payload.jobId}:${payload.record.id}`, jobId: payload.jobId, record: payload.record });
    await transactionDone(transaction);
    return true;
  }
  if (action === "list") {
    const store = db.transaction("records", "readonly").objectStore("records");
    const all = await requestValue(store.getAll());
    return all.filter((item) => item.jobId === payload.jobId).map((item) => item.record);
  }
  if (action === "clear" || action === "clearAll") {
    const transaction = db.transaction("records", "readwrite");
    const store = transaction.objectStore("records");
    if (action === "clearAll") store.clear();
    else {
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (cursor.value.jobId === payload.jobId) cursor.delete();
        cursor.continue();
      };
    }
    await transactionDone(transaction);
    return true;
  }
  throw new Error("Geçici kayıt işlemi tanınmadı.");
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function includesTerms(text, terms, mode = "all") {
  const normalized = normalize(text);
  const words = terms.map(normalize).filter(Boolean);
  if (!words.length) return true;
  return mode === "any" ? words.some((word) => normalized.includes(word)) : words.every((word) => normalized.includes(word));
}

async function indexAction(action, payload = {}) {
  const db = await openLocalDb();
  if (action === "save") {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    for (const message of messages) store.put({ ...message, key: `${message.conversationId}:${message.id}`, normalized: normalize(message.text) });
    await transactionDone(tx);
    return messages.length;
  }
  if (action === "mark") {
    const tx = db.transaction("indexedChats", "readwrite");
    tx.objectStore("indexedChats").put(payload.chat);
    await transactionDone(tx);
    return true;
  }
  if (action === "indexed-chats") {
    return requestValue(db.transaction("indexedChats", "readonly").objectStore("indexedChats").getAll());
  }
  if (action === "export-page" || action === "export-chat-page") {
    const isChatPage = action === "export-chat-page";
    const storeName = isChatPage ? "indexedChats" : "messages";
    const limit = Math.max(1, Math.min(isChatPage ? 500 : 100, Number(payload.limit) || (isChatPage ? 200 : 100)));
    const afterKey = typeof payload.afterKey === "string" && payload.afterKey ? payload.afterKey : null;
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const range = afterKey ? IDBKeyRange.lowerBound(afterKey, true) : undefined;
    const items = [];
    let nextKey = null, done = false;
    await new Promise((resolve, reject) => {
      const request = store.openCursor(range);
      request.onerror = () => reject(request.error || new Error("Yedek verisi okunamadı."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { done = true; resolve(); return; }
        const { key, normalized, ...record } = cursor.value;
        items.push(record);
        nextKey = String(cursor.primaryKey);
        if (items.length >= limit) { resolve(); return; }
        cursor.continue();
      };
    });
    const byteLength = new TextEncoder().encode(JSON.stringify(items)).byteLength;
    if (byteLength > 12 * 1024 * 1024) throw new Error("Tek yedek sayfası 12 MB sınırını aşıyor; yedek işlemi güvenli biçimde durduruldu.");
    return { items, nextKey, done };
  }
  if (action === "restore-chat-marks") {
    const chats = Array.isArray(payload.chats) ? payload.chats : [];
    const tx = db.transaction("indexedChats", "readwrite");
    const store = tx.objectStore("indexedChats");
    for (const chat of chats) if (chat && typeof chat.id === "string") store.put(chat);
    await transactionDone(tx);
    return chats.length;
  }
  if (action === "rule-matches") {
    const terms = (payload.rule?.keywords || []).map(normalize).filter(Boolean);
    if (!terms.length) return [];
    const request = db.transaction("messages", "readonly").objectStore("messages").openCursor();
    const conversations = new Set();
    await new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error || new Error("Etiket kuralı taranamadı."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        const item = cursor.value;
        const text = `${item.normalized || normalize(item.text)} ${normalize(item.title)}`;
        if (terms.some((term) => text.includes(term))) conversations.add(item.conversationId);
        cursor.continue();
      };
    });
    return [...conversations];
  }
  if (action === "catalog:get") {
    return requestValue(db.transaction("historyCatalog", "readonly").objectStore("historyCatalog").getAll());
  }
  if (action === "catalog:count") {
    return requestValue(db.transaction("historyCatalog", "readonly").objectStore("historyCatalog").count());
  }
  if (action === "catalog:save") {
    const chats = Array.isArray(payload.chats) ? payload.chats : [];
    const tx = db.transaction("historyCatalog", "readwrite");
    const store = tx.objectStore("historyCatalog");
    for (const chat of chats) {
      const request = store.get(chat.id);
      request.onsuccess = () => {
        const previous = request.result || {};
        store.put({
          ...previous, ...chat,
          createdAt: chat.createdAt ?? previous.createdAt ?? null,
          updatedAt: chat.updatedAt ?? previous.updatedAt ?? null,
          archived: chat.archived ?? previous.archived ?? null
        });
      };
    }
    await transactionDone(tx);
    return chats.length;
  }
  if (action === "catalog:remove") {
    const ids = Array.isArray(payload.ids) ? payload.ids : [];
    const tx = db.transaction("historyCatalog", "readwrite");
    const store = tx.objectStore("historyCatalog");
    for (const id of ids) store.delete(id);
    await transactionDone(tx);
    return ids.length;
  }
  if (action === "catalog:clear") {
    const tx = db.transaction("historyCatalog", "readwrite");
    tx.objectStore("historyCatalog").clear();
    await transactionDone(tx);
    return true;
  }
  if (action === "meta:all") {
    const items = await requestValue(db.transaction("chatMeta", "readonly").objectStore("chatMeta").getAll());
    return Object.fromEntries(items.map(({ id, ...meta }) => [id, meta]));
  }
  if (action === "meta:get") {
    const item = await requestValue(db.transaction("chatMeta", "readonly").objectStore("chatMeta").get(payload.id));
    if (!item) return null;
    const { id, ...meta } = item;
    return meta;
  }
  if (action === "meta:patch") {
    const tx = db.transaction("chatMeta", "readwrite");
    const store = tx.objectStore("chatMeta");
    const request = store.get(payload.id);
    let result;
    request.onsuccess = () => {
      const previous = request.result || { id: payload.id };
      result = { ...previous, ...(payload.patch || {}), id: payload.id, updatedAt: Date.now() };
      store.put(result);
    };
    await transactionDone(tx);
    if (result) { const { id, ...meta } = result; return meta; }
    return null;
  }
  if (action === "meta:save") {
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const tx = db.transaction("chatMeta", "readwrite");
    const store = tx.objectStore("chatMeta");
    for (const [id, meta] of entries) store.put({ ...(meta || {}), id });
    await transactionDone(tx);
    return entries.length;
  }
  if (action === "meta:remove") {
    const ids = Array.isArray(payload.ids) ? payload.ids : [];
    const tx = db.transaction("chatMeta", "readwrite");
    const store = tx.objectStore("chatMeta");
    for (const id of ids) store.delete(id);
    await transactionDone(tx);
    return ids.length;
  }
  if (action === "meta:clear") {
    const tx = db.transaction("chatMeta", "readwrite");
    tx.objectStore("chatMeta").clear();
    await transactionDone(tx);
    return true;
  }
  if (action === "ids") {
    return requestValue(db.transaction("indexedChats", "readonly").objectStore("indexedChats").getAll()).then((items) => items.map((item) => item.id));
  }
  if (action === "stats") {
    const tx = db.transaction(["messages", "indexedChats"], "readonly");
    const [messages, chats] = await Promise.all([
      requestValue(tx.objectStore("messages").count()),
      requestValue(tx.objectStore("indexedChats").count())
    ]);
    return { messages, chats };
  }
  if (action === "search") {
    const options = payload.options || {};
    const tx = db.transaction("messages", "readonly");
    const request = tx.objectStore("messages").openCursor();
    const results = [];
    const term = normalize(options.query);
    await new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error || new Error("Arama dizini okunamadı."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || results.length >= (options.limit || 300)) { resolve(); return; }
        const item = cursor.value;
        const haystack = options.titleOnly ? normalize(item.title) : `${item.normalized || normalize(item.text)} ${normalize(item.title)}`;
        const hit = options.exact ? haystack.includes(term) : term.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
        const roleOk = !options.role || options.role === "all" || item.role === options.role;
        const date = item.timestamp ? Date.parse(item.timestamp) : 0;
        const afterOk = !options.from || date >= Date.parse(options.from);
        const beforeOk = !options.to || date <= (Date.parse(options.to) + 86400000 - 1);
        const includeOk = includesTerms(`${item.title} ${item.text}`, options.include || [], options.includeMode);
        const excludeWords = (options.exclude || []).map(normalize).filter(Boolean);
        const excludeOk = options.excludeMode === "any"
          ? !excludeWords.some((word) => normalize(`${item.title} ${item.text}`).includes(word))
          : !excludeWords.every((word) => normalize(`${item.title} ${item.text}`).includes(word));
        const conversationOk = !options.conversationId || item.conversationId === options.conversationId;
        if (term && hit && roleOk && afterOk && beforeOk && includeOk && excludeOk && conversationOk) {
          results.push({ id: item.id, conversationId: item.conversationId, title: item.title, role: item.role, timestamp: item.timestamp, text: item.text, images: item.images || [] });
        }
        cursor.continue();
      };
    });
    return results;
  }
  if (action === "conversation") {
    const store = db.transaction("messages", "readonly").objectStore("messages").index("conversationId");
    const items = await requestValue(store.getAll(IDBKeyRange.only(payload.id)));
    return items.sort((left, right) => (Date.parse(left.timestamp || "") || 0) - (Date.parse(right.timestamp || "") || 0));
  }
  if (action === "media") {
    const all = await requestValue(db.transaction("messages", "readonly").objectStore("messages").getAll());
    const media = [];
    for (const item of all) {
      const entries = Array.isArray(item.media) && item.media.length ? item.media : (item.images || []).map((url) => ({ url, kind: "image" }));
      for (const entry of entries) if (entry && /^https?:\/\//i.test(entry.url || "")) media.push({ url: entry.url, kind: ["image", "video", "audio", "file"].includes(entry.kind) ? entry.kind : "file", conversationId: item.conversationId, title: item.title, prompt: item.text || "", messageId: item.id, timestamp: item.timestamp });
    }
    return media;
  }
  if (action === "remove") {
    const tx = db.transaction(["messages", "indexedChats"], "readwrite");
    const messageStore = tx.objectStore("messages");
    const request = messageStore.index("conversationId").openCursor(IDBKeyRange.only(payload.id));
    request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    tx.objectStore("indexedChats").delete(payload.id);
    await transactionDone(tx);
    return true;
  }
  if (action === "clear") {
    const tx = db.transaction(["messages", "indexedChats"], "readwrite");
    tx.objectStore("messages").clear();
    tx.objectStore("indexedChats").clear();
    await transactionDone(tx);
    return true;
  }
  throw new Error("Dizin işlemi tanınmadı.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message?.type !== "string" || (!message.type.startsWith("cc:temp:") && !message.type.startsWith("cc:index:"))) return false;
  if (sender.id !== chrome.runtime.id) return false;
  const isIndex = message.type.startsWith("cc:index:");
  (isIndex ? indexAction(message.type.slice("cc:index:".length), message.payload) : tempStoreAction(message.type.slice("cc:temp:".length), message.payload))
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, reason: error.message || "Geçici kayıt işlemi başarısız oldu." }));
  return true;
});
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://chatgpt.com/")) return;
    const view = command === "open-chat-manager" ? "search" : "home";
    await chrome.tabs.sendMessage(tab.id, { type: "cc:open", view });
  } catch {
    // The active page may not be ChatGPT or the content script may not be ready.
  }
});
