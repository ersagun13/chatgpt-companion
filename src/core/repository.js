(function defineRepository() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const KEY = CC.models.keys;
  let writeQueue = Promise.resolve();
  let historyMigration;
  let metaMigration;
  let metaReady = false;
  function enqueue(task) {
    const result = writeQueue.catch(() => {}).then(task);
    writeQueue = result.catch(() => {});
    return result;
  }
  async function read(key, fallback) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? fallback;
  }
  function set(key, value) {
    return enqueue(async () => { await chrome.storage.local.set({ [key]: value }); return value; });
  }
  function updateList(key, updater) {
    return enqueue(async () => {
      const current = (await chrome.storage.local.get(key))[key];
      const next = updater(Array.isArray(current) ? current : []);
      await chrome.storage.local.set({ [key]: next });
      return next;
    });
  }
  const upsertById = (items, item) => [...items.filter((entry) => entry.id !== item.id), item];
  const mergeById = (left, right) => [...new Map([...left, ...right].map((item) => [item.id, item])).values()];
  function normalizeHistoryCatalog(records) {
    return records.filter((item) => item && typeof item.id === "string" && /^[A-Za-z0-9_-]{6,}$/.test(item.id) && typeof item.title === "string")
      .map((item) => ({
        id: item.id,
        title: item.title.slice(0, 240) || "Başlıksız sohbet",
        url: `/c/${encodeURIComponent(item.id)}`,
        createdAt: item.createdAt ?? null,
        updatedAt: item.updatedAt ?? null,
        archived: typeof item.archived === "boolean" ? item.archived : null,
        source: "chatgpt-account"
      }));
  }
  async function ensureMetaMigrated() {
    if (metaReady) return;
    if (!metaMigration) {
      metaMigration = (async () => {
        const current = await CC.messageIndex.meta();
        const legacy = await read(KEY.chatMeta, {});
        const entries = Object.entries(legacy || {}).filter(([id, meta]) => /^[A-Za-z0-9_-]{6,}$/.test(id) && !Object.prototype.hasOwnProperty.call(current, id) && meta && typeof meta === "object" && !Array.isArray(meta));
        for (let offset = 0; offset < entries.length; offset += 500) await CC.messageIndex.saveMeta(entries.slice(offset, offset + 500));
        if (Object.keys(legacy || {}).length) await chrome.storage.local.remove(KEY.chatMeta);
        metaReady = true;
      })().catch((error) => { metaMigration = null; throw error; });
    }
    return metaMigration;
  }
  async function replaceMeta(metadata) {
    const entries = Object.entries(metadata || {}).filter(([id, meta]) => /^[A-Za-z0-9_-]{6,}$/.test(id) && meta && typeof meta === "object" && !Array.isArray(meta));
    await CC.messageIndex.clearMeta();
    for (let offset = 0; offset < entries.length; offset += 500) await CC.messageIndex.saveMeta(entries.slice(offset, offset + 500));
    metaReady = true;
  }

  CC.repository = {
    async getSettings() { return { ...CC.models.defaultSettings, ...(await read(KEY.settings, {})) }; },
    async saveSettings(settings) { return set(KEY.settings, { ...CC.models.defaultSettings, ...settings }); },
    getFolders() { return read(KEY.folders, []); },
    saveFolder(folder) { return updateList(KEY.folders, (items) => upsertById(items, folder)); },
    deleteFolder(id) { return updateList(KEY.folders, (items) => items.filter((item) => item.id !== id)); },
    getTags() { return read(KEY.tags, []); },
    saveTag(tag) { return updateList(KEY.tags, (items) => upsertById(items, tag)); },
    deleteTag(id) { return updateList(KEY.tags, (items) => items.filter((item) => item.id !== id)); },
    getPrompts() { return read(KEY.prompts, []); },
    savePrompt(prompt) { return updateList(KEY.prompts, (items) => upsertById(items, prompt)); },
    deletePrompt(id) { return updateList(KEY.prompts, (items) => items.filter((item) => item.id !== id)); },
    getChains() { return read(KEY.chains, []); },
    saveChain(chain) { return updateList(KEY.chains, (items) => upsertById(items, chain)); },
    deleteChain(id) { return updateList(KEY.chains, (items) => items.filter((item) => item.id !== id)); },
    getBookmarks() { return read(KEY.bookmarks, []); },
    saveBookmark(bookmark) { return updateList(KEY.bookmarks, (items) => upsertById(items, bookmark)); },
    deleteBookmark(id) { return updateList(KEY.bookmarks, (items) => items.filter((item) => item.id !== id)); },
    getMessageLabels() { return read(KEY.labels, []); },
    saveMessageLabel(label) { return updateList(KEY.labels, (items) => upsertById(items, label)); },
    deleteMessageLabel(id) { return updateList(KEY.labels, (items) => items.filter((item) => item.id !== id)); },
    getTagRules() { return read(KEY.tagRules, []); },
    saveTagRule(rule) { return updateList(KEY.tagRules, (items) => upsertById(items, rule)); },
    deleteTagRule(id) { return updateList(KEY.tagRules, (items) => items.filter((item) => item.id !== id)); },
    getMediaFavorites() { return read(KEY.mediaFavorites, []); },
    saveMediaFavorites(items) { return set(KEY.mediaFavorites, items); },
    getSearchHistory() { return read(KEY.searchHistory, []); },
    async saveSearchTerm(term) {
      const value = String(term || "").trim().slice(0, 120);
      if (!value) return read(KEY.searchHistory, []);
      return updateList(KEY.searchHistory, (items) => [value, ...items.filter((item) => item !== value)].slice(0, 8));
    },
    getUsage() { return read(KEY.usage, {}); },
    saveUsage(usage) { return set(KEY.usage, usage); },
    async getChatMeta() { await ensureMetaMigrated(); return CC.messageIndex.meta(); },
    async getChatMetaEntry(id) { await ensureMetaMigrated(); return CC.messageIndex.metaEntry(id); },
    async saveChatMeta(id, patch) {
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id || "")) throw new Error("Sohbet kimliği geçersiz.");
      await ensureMetaMigrated();
      return CC.messageIndex.patchMeta(id, patch || {});
    },
    async getHistoryCatalog() {
      const catalog = await CC.messageIndex.catalog();
      const legacy = await read(KEY.historyCatalog, []);
      if (!Array.isArray(legacy) || !legacy.length) return catalog;
      if (!historyMigration) {
        historyMigration = (async () => {
          const current = await CC.messageIndex.catalog();
          const known = new Set(current.map((item) => item.id));
          const normalized = normalizeHistoryCatalog(legacy).filter((item) => !known.has(item.id));
          for (let offset = 0; offset < normalized.length; offset += 500) await CC.messageIndex.saveCatalog(normalized.slice(offset, offset + 500));
          await chrome.storage.local.remove(KEY.historyCatalog);
          return CC.messageIndex.catalog();
        })().finally(() => { historyMigration = null; });
      }
      return historyMigration;
    },
    async saveHistoryCatalog(records) {
      if (!Array.isArray(records)) throw new Error("Geçmiş kayıt listesi geçersiz.");
      await this.getHistoryCatalog();
      const normalized = normalizeHistoryCatalog(records);
      for (let offset = 0; offset < normalized.length; offset += 500) await CC.messageIndex.saveCatalog(normalized.slice(offset, offset + 500));
      await chrome.storage.local.remove(KEY.historyCatalog).catch(() => {});
      return { imported: normalized.length, total: await CC.messageIndex.catalogCount() };
    },
    getHistoryScanState() { return read(KEY.historyScan, null); },
    saveHistoryScanState(state) { return set(KEY.historyScan, state); },
    clearHistoryScanState() { return enqueue(() => chrome.storage.local.remove(KEY.historyScan)); },
    getPromptFavorites() { return read(KEY.promptFavorites, []); },
    savePromptFavorites(items) { return set(KEY.promptFavorites, [...new Set((items || []).filter((item) => typeof item === "string"))]); },
    getHiddenMedia() { return read(KEY.hiddenMedia, []); },
    saveHiddenMedia(items) { return set(KEY.hiddenMedia, [...new Set((items || []).filter((item) => typeof item === "string"))]); },
    async removeChats(ids) {
      const removedIds = new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string"));
      if (!removedIds.size) return { history: 0, metadata: 0 };
      await Promise.all([this.getHistoryCatalog(), ensureMetaMigrated()]);
      return enqueue(async () => {
        const metadata = await CC.messageIndex.removeMeta([...removedIds]);
        await CC.messageIndex.removeCatalog([...removedIds]);
        await Promise.all([...removedIds].map((id) => CC.messageIndex.remove(id).catch(() => {})));
        return { history: await CC.messageIndex.catalogCount(), metadata };
      });
    },
    getJob() { return read(KEY.job, null); },
    saveJob(job) { return set(KEY.job, job); },
    clearJob() { return enqueue(() => chrome.storage.local.remove(KEY.job)); },
    async exportMetadata() {
      const [data, [historyCatalog, chatMeta]] = await Promise.all([
        chrome.storage.local.get([KEY.settings, KEY.folders, KEY.tags, KEY.prompts, KEY.promptFavorites, KEY.chains, KEY.bookmarks, KEY.labels, KEY.tagRules, KEY.mediaFavorites, KEY.hiddenMedia, KEY.searchHistory, KEY.usage]),
        Promise.all([this.getHistoryCatalog(), this.getChatMeta()])
      ]);
      return {
        schemaVersion: 1, createdAt: Date.now(),
        settings: data[KEY.settings] || CC.models.defaultSettings,
        folders: data[KEY.folders] || [], tags: data[KEY.tags] || [], chatMeta,
        historyCatalog, prompts: data[KEY.prompts] || [], chains: data[KEY.chains] || [],
        bookmarks: data[KEY.bookmarks] || [], labels: data[KEY.labels] || [], tagRules: data[KEY.tagRules] || [],
        promptFavorites: data[KEY.promptFavorites] || [], mediaFavorites: data[KEY.mediaFavorites] || [], hiddenMedia: data[KEY.hiddenMedia] || [], searchHistory: data[KEY.searchHistory] || [], usage: data[KEY.usage] || { days: {}, seenIds: [] }
      };
    },
    async restoreMetadata(record, merge = false) {
      if (!record || record.schemaVersion !== 1 || !Array.isArray(record.folders) || !Array.isArray(record.tags) || !record.chatMeta || typeof record.chatMeta !== "object" || Array.isArray(record.chatMeta) || (record.historyCatalog !== undefined && !Array.isArray(record.historyCatalog)) || ["prompts", "promptFavorites", "chains", "bookmarks", "labels", "tagRules", "mediaFavorites", "hiddenMedia", "searchHistory"].some((key) => record[key] !== undefined && !Array.isArray(record[key])) || (record.usage !== undefined && (!record.usage || typeof record.usage !== "object" || Array.isArray(record.usage)))) {
        throw new Error("Bu yedek dosyası desteklenmiyor veya bozuk.");
      }
      const [data, currentCatalog, currentMeta] = await Promise.all([
        chrome.storage.local.get([KEY.settings, KEY.folders, KEY.tags, KEY.prompts, KEY.promptFavorites, KEY.chains, KEY.bookmarks, KEY.labels, KEY.tagRules, KEY.mediaFavorites, KEY.hiddenMedia, KEY.searchHistory, KEY.usage]),
        merge ? this.getHistoryCatalog() : Promise.resolve([]),
        merge ? this.getChatMeta() : Promise.resolve({})
      ]);
      return enqueue(async () => {
        const current = {
          settings: data[KEY.settings] || CC.models.defaultSettings,
          folders: data[KEY.folders] || [], tags: data[KEY.tags] || [], chatMeta: currentMeta,
          historyCatalog: currentCatalog, prompts: data[KEY.prompts] || [], chains: data[KEY.chains] || [],
          bookmarks: data[KEY.bookmarks] || [], labels: data[KEY.labels] || [], tagRules: data[KEY.tagRules] || [],
          promptFavorites: data[KEY.promptFavorites] || [], mediaFavorites: data[KEY.mediaFavorites] || [], hiddenMedia: data[KEY.hiddenMedia] || [], searchHistory: data[KEY.searchHistory] || [], usage: data[KEY.usage] || { days: {}, seenIds: [] }
        };
        const chatMeta = merge ? { ...current.chatMeta, ...record.chatMeta } : record.chatMeta;
        const savedHistory = normalizeHistoryCatalog(record.historyCatalog || []);
        const historyCatalog = merge
          ? [...new Map([...current.historyCatalog, ...savedHistory].map((item) => [item.id, item])).values()]
          : savedHistory;
        const mergeRecords = (name) => merge ? mergeById(current[name], record[name] || []) : (record[name] || []);
        const usage = merge ? {
          days: Object.fromEntries([...new Set([...Object.keys(current.usage.days || {}), ...Object.keys(record.usage?.days || {})])].map((day) => [day, {
            messages: Math.max(current.usage.days?.[day]?.messages || 0, record.usage?.days?.[day]?.messages || 0),
            activeMinutes: Math.max(current.usage.days?.[day]?.activeMinutes || 0, record.usage?.days?.[day]?.activeMinutes || 0),
            activeHours: Object.fromEntries([...new Set([...Object.keys(current.usage.days?.[day]?.activeHours || {}), ...Object.keys(record.usage?.days?.[day]?.activeHours || {})])].map((hour) => [hour, Math.max(current.usage.days?.[day]?.activeHours?.[hour] || 0, record.usage?.days?.[day]?.activeHours?.[hour] || 0)]))
          }])),
          seenIds: [...new Set([...(current.usage.seenIds || []), ...(record.usage?.seenIds || [])])].slice(-10000)
        } : (record.usage || { days: {}, seenIds: [] });
        const next = {
          [KEY.settings]: { ...(merge ? current.settings : {}), ...(record.settings || {}) },
          [KEY.folders]: merge ? mergeById(current.folders, record.folders) : record.folders,
          [KEY.tags]: merge ? mergeById(current.tags, record.tags) : record.tags,
          [KEY.prompts]: mergeRecords("prompts"), [KEY.promptFavorites]: merge ? [...new Set([...current.promptFavorites, ...(record.promptFavorites || [])])] : (record.promptFavorites || []), [KEY.chains]: mergeRecords("chains"),
          [KEY.bookmarks]: mergeRecords("bookmarks"), [KEY.labels]: mergeRecords("labels"), [KEY.tagRules]: mergeRecords("tagRules"),
          [KEY.mediaFavorites]: merge ? [...new Set([...current.mediaFavorites, ...(record.mediaFavorites || [])])] : (record.mediaFavorites || []),
          [KEY.hiddenMedia]: merge ? [...new Set([...current.hiddenMedia, ...(record.hiddenMedia || [])])] : (record.hiddenMedia || []),
          [KEY.searchHistory]: merge ? [...new Set([...(record.searchHistory || []), ...current.searchHistory])].slice(0, 8) : (record.searchHistory || []),
          [KEY.usage]: usage
        };
        await chrome.storage.local.set(next);
        await replaceMeta(chatMeta);
        await CC.messageIndex.clearCatalog();
        for (let offset = 0; offset < historyCatalog.length; offset += 500) await CC.messageIndex.saveCatalog(historyCatalog.slice(offset, offset + 500));
        await chrome.storage.local.remove([KEY.historyCatalog, KEY.chatMeta]).catch(() => {});
        return { folders: next[KEY.folders].length, tags: next[KEY.tags].length, chats: Object.keys(chatMeta).length, history: historyCatalog.length };
      });
    },
    async clearAllLocalData() {
      return enqueue(async () => {
        await CC.tempStore.clearAll();
        await CC.messageIndex.clear();
        await CC.messageIndex.clearCatalog();
        await CC.messageIndex.clearMeta();
        metaReady = true;
        await chrome.storage.local.clear();
      });
    }
  };
})();
