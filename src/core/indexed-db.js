(function defineTemporaryExportStore() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;

  function request(action, payload = {}, prefix = "cc:temp:") {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: `${prefix}${action}`, payload }, (response) => {
        const transportError = chrome.runtime.lastError;
        if (transportError) return reject(new Error(transportError.message));
        if (!response?.ok) return reject(new Error(response?.reason || "Geçici dışa aktarma işlemi başarısız oldu."));
        resolve(response.value);
      });
    });
  }

  CC.tempStore = {
    save(jobId, record) { return request("save", { jobId, record }); },
    list(jobId) { return request("list", { jobId }); },
    clear(jobId) { return request("clear", { jobId }); },
    clearAll() { return request("clearAll"); }
  };
  CC.messageIndex = {
    save(messages) { return request("save", { messages }, "cc:index:"); },
    mark(chat) { return request("mark", { chat }, "cc:index:"); },
    ids() { return request("ids", {}, "cc:index:"); },
    chats() { return request("indexed-chats", {}, "cc:index:"); },
    exportPage(afterKey = null, limit = 100) { return request("export-page", { afterKey, limit }, "cc:index:"); },
    exportChatPage(afterKey = null, limit = 200) { return request("export-chat-page", { afterKey, limit }, "cc:index:"); },
    restoreChatMarks(chats) { return request("restore-chat-marks", { chats }, "cc:index:"); },
    matchRule(rule) { return request("rule-matches", { rule }, "cc:index:"); },
    stats() { return request("stats", {}, "cc:index:"); },
    search(options) { return request("search", { options }, "cc:index:"); },
    conversation(id) { return request("conversation", { id }, "cc:index:"); },
    media() { return request("media", {}, "cc:index:"); },
    remove(id) { return request("remove", { id }, "cc:index:"); },
    clear() { return request("clear", {}, "cc:index:"); },
    catalog() { return request("catalog:get", {}, "cc:index:"); },
    catalogCount() { return request("catalog:count", {}, "cc:index:"); },
    saveCatalog(chats) { return request("catalog:save", { chats }, "cc:index:"); },
    removeCatalog(ids) { return request("catalog:remove", { ids }, "cc:index:"); },
    clearCatalog() { return request("catalog:clear", {}, "cc:index:"); },
    meta() { return request("meta:all", {}, "cc:index:"); },
    metaEntry(id) { return request("meta:get", { id }, "cc:index:"); },
    patchMeta(id, patch) { return request("meta:patch", { id, patch }, "cc:index:"); },
    saveMeta(entries) { return request("meta:save", { entries }, "cc:index:"); },
    removeMeta(ids) { return request("meta:remove", { ids }, "cc:index:"); },
    clearMeta() { return request("meta:clear", {}, "cc:index:"); }
  };
})();
