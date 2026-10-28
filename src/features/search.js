(function defineHistorySearch() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);
  const categories = [
    { key: "coding", name: "Kodlama", color: "#8bd5ca", keywords: ["code", "coding", "javascript", "typescript", "python", "sql", "api", "bug", "regex", "kod", "program", "script", "hata"] },
    { key: "writing", name: "Yazı", color: "#f5a97f", keywords: ["write", "writing", "draft", "email", "story", "rewrite", "essay", "metin", "yazı", "yazi", "mail", "hikaye", "özet", "ozet"] },
    { key: "research", name: "Araştırma", color: "#8aadf4", keywords: ["research", "source", "citation", "study", "paper", "analyze", "araştır", "arastir", "kaynak", "makale", "incele"] },
    { key: "science", name: "Matematik ve bilim", color: "#c6a0f6", keywords: ["math", "equation", "physics", "science", "calculate", "statistics", "matematik", "denklem", "fizik", "hesapla", "istatistik"] },
    { key: "business", name: "İş", color: "#eed49f", keywords: ["business", "marketing", "sales", "customer", "proposal", "strategy", "iş planı", "is plani", "satış", "satis", "müşteri", "musteri", "teklif"] }
  ];
  const words = (value) => String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const formatDate = (value) => value ? new Date(value).toLocaleDateString("tr-TR", { year: "numeric", month: "short", day: "numeric" }) : "Tarih bilinmiyor";

  CC.search = {
    filterTitles(chats, query) {
      const term = CC.normalize(query);
      if (!term) return chats;
      return chats.filter((chat) => CC.normalize(chat.title).includes(term));
    }
  };

  let stopIndexing = false;
  async function ensureBuiltInTags() {
    const tags = await CC.repository.getTags();
    const byName = new Map(tags.map((tag) => [CC.normalize(tag.name), tag]));
    for (const category of categories) {
      if (!byName.has(CC.normalize(category.name))) {
        const tag = { id: CC.id(), name: category.name, color: category.color, builtIn: true, createdAt: Date.now() };
        await CC.repository.saveTag(tag); byName.set(CC.normalize(tag.name), tag);
      }
    }
    return [...byName.values()];
  }

  async function indexChat(chat, tags, rules, providedRecord = null) {
    const record = providedRecord || await CC.adapter.fetchConversationForIndex(chat.id);
    const messages = record.messages.map((message) => ({ ...message, title: record.title || chat.title }));
    for (let offset = 0; offset < messages.length; offset += 400) await CC.messageIndex.save(messages.slice(offset, offset + 400));
    const searchable = `${record.title || chat.title} ${messages.map((message) => message.text).join(" ")}`;
    const normalizedSearchable = CC.normalize(searchable);
    const settings = await CC.repository.getSettings();
    const threshold = Math.max(1, Math.min(4, Number(settings.smartTagThreshold) || 2));
    const activeCategories = categories.filter((category) => settings.smartCategories?.[category.key] !== false);
    const matched = activeCategories.filter((category) => category.keywords.filter((keyword) => normalizedSearchable.includes(CC.normalize(keyword))).length >= threshold);
    const ids = matched.map((category) => tags.find((tag) => CC.normalize(tag.name) === CC.normalize(category.name))?.id).filter(Boolean);
    for (const rule of rules) {
      const terms = (rule.keywords || []).map(CC.normalize).filter(Boolean);
      if (terms.length && terms.some((term) => normalizedSearchable.includes(term))) {
        let tag = tags.find((item) => CC.normalize(item.name) === CC.normalize(rule.name));
        if (!tag) { tag = { id: CC.id(), name: rule.name, color: rule.color, createdAt: Date.now() }; await CC.repository.saveTag(tag); tags.push(tag); }
        ids.push(tag.id);
      }
    }
    const meta = await CC.repository.getChatMetaEntry(chat.id) || {};
    const builtInIds = new Set(tags.filter((tag) => tag.builtIn).map((tag) => tag.id));
    const manualIds = (meta.tagIds || []).filter((id) => !builtInIds.has(id));
    await CC.repository.saveChatMeta(chat.id, { tagIds: [...new Set([...manualIds, ...ids])] });
    await CC.messageIndex.mark({ id: chat.id, title: record.title || chat.title, indexedAt: Date.now(), rulesAppliedAt: Date.now(), smartTagConfig: JSON.stringify({ categories: settings.smartCategories || {}, threshold }), messageSchemaVersion: 2, messageCount: messages.length });
    return messages.length;
  }

  CC.indexer = {
    get running() { return !stopIndexing; },
    stop() { stopIndexing = true; },
    async indexConversation(chat, record = null) {
      const tags = await ensureBuiltInTags();
      const rules = await CC.repository.getTagRules();
      return indexChat(chat, tags, rules, record);
    },
    async run(onProgress) {
      if (this.active) return;
      this.active = true; stopIndexing = false;
      try {
        onProgress?.({ phase: "history", done: 0, total: 0, failures: 0, messageCount: 0 });
        const loaded = await CC.adapter.collectVisibleChats({
          max: 250000, maxScrolls: 800, shouldStop: () => stopIndexing,
          onProgress: (state) => onProgress?.({ phase: "history", ...state, done: 0, total: 0, failures: 0, messageCount: 0 })
        });
        if (loaded.length) await CC.repository.saveHistoryCatalog(loaded);
        const chats = await CC.repository.getHistoryCatalog();
        if (stopIndexing) return { done: 0, total: 0, failures: 0, messageCount: 0, stopped: true };
        const indexed = await CC.messageIndex.chats();
        const indexedById = new Map(indexed.map((chat) => [chat.id, chat]));
        const tags = await ensureBuiltInTags();
        const rules = await CC.repository.getTagRules();
        const settings = await CC.repository.getSettings();
        const smartTagConfig = JSON.stringify({ categories: settings.smartCategories || {}, threshold: Math.max(1, Math.min(4, Number(settings.smartTagThreshold) || 2)) });
        const latestRuleUpdate = rules.reduce((latest, rule) => Math.max(latest, Number(rule.updatedAt || rule.createdAt) || 0), 0);
        const pending = chats.filter((chat) => {
          const state = indexedById.get(chat.id);
          return !state || (latestRuleUpdate && latestRuleUpdate > (Number(state.rulesAppliedAt) || 0)) || state.smartTagConfig !== smartTagConfig || state.messageSchemaVersion !== 2;
        });
        let done = 0, failures = 0, messageCount = 0;
        onProgress?.({ phase: "index", done, total: pending.length, failures, messageCount });
        for (const chat of pending) {
          if (stopIndexing) break;
          try { messageCount += await indexChat(chat, tags, rules); }
          catch (error) {
            failures++;
            console.warn("[ChatGPT Companion] Local indexing skipped a chat", chat.id, error?.message || "request failed");
          }
          done++;
          onProgress?.({ phase: "index", done, total: pending.length, failures, messageCount, title: chat.title });
          await CC.sleep(550);
        }
        return { done, total: pending.length, failures, messageCount, stopped: stopIndexing };
      } finally { this.active = false; }
    }
  };

  CC.features.register({ id: "search", titleKey: "search", async render(container) {
    container.append(el("div", { class: "cc-view-heading" }, [
      el("div", {}, [el("span", { class: "cc-eyebrow", text: "YEREL ARAMA" }), el("h2", { text: "Sohbetlerinde bul" }), el("p", { class: "cc-muted", text: "İletilerin içeriğinde ara; eşleşen cevaba doğrudan git." })]),
      el("span", { class: "cc-view-icon", text: "⌕", "aria-hidden": "true" })
    ]));
    const stats = await CC.messageIndex.stats();
    const status = el("div", { class: "cc-index-status" });
    const statusMain = el("strong", { text: `${stats.chats} sohbet dizinde` });
    const statusSub = el("span", { class: "cc-muted", text: `${stats.messages.toLocaleString("tr-TR")} ileti bu cihazda aranabilir.` });
    const progress = el("div", { class: "cc-progress", hidden: true }, [el("i", { style: "width:0%" })]);
    const progressText = el("span", { class: "cc-muted", text: "" });
    const indexButton = el("button", { class: "cc-button cc-primary", text: "Tüm sohbetleri tara" });
    const indexCurrentButton = el("button", { class: "cc-button", text: "Açık sohbeti tara", disabled: !CC.adapter.getCurrentConversationId(), title: "Yalnızca şu an açık olan sohbetin mesajlarını yerel arama dizinine ekler." });
    const clearButton = el("button", { class: "cc-button cc-quiet", text: "Dizini temizle", disabled: !stats.messages });
    const indexActions = el("div", { class: "cc-row wrap" }); indexActions.append(indexButton, indexCurrentButton, clearButton);
    status.append(el("div", { class: "cc-index-status-copy" }, [statusMain, statusSub]), progress, progressText, indexActions);
    const privacyNotice = el("aside", { class: "cc-privacy-notice", "aria-label": CC.tr("privacy", "Privacy & local data") }, [
      el("strong", { text: CC.tr("indexPrivacyTitle", "Full-text scans save private content on this device") }),
      el("p", { text: CC.tr("indexPrivacyNotice", "Conversation messages are stored in this browser profile's local search index. Companion does not encrypt or upload this data.") })
    ]);
    container.append(privacyNotice, status);
    const query = el("input", { class: "cc-input cc-search-main", type: "search", placeholder: "Bir kelime, cümle veya yanıt ara…", "aria-label": "Sohbet içeriklerinde ara" });
    const runButton = el("button", { class: "cc-button cc-primary", text: "Ara" });
    const searchForm = el("div", { class: "cc-search-form" }); searchForm.append(query, runButton); container.append(searchForm);
    if (currentOnly.checked) setTimeout(() => query.focus(), 0);
    const advancedToggle = el("button", { class: "cc-text-button", text: "Gelişmiş filtreler +" });
    const advanced = el("div", { class: "cc-filter-panel", hidden: true });
    const role = el("select", { class: "cc-select", "aria-label": "Konuşmacı" });
    role.append(el("option", { value: "all", text: "Tüm konuşmacılar" }), el("option", { value: "user", text: "Benim mesajlarım" }), el("option", { value: "assistant", text: "ChatGPT yanıtları" }));
    const from = el("input", { class: "cc-input", type: "date", "aria-label": "Başlangıç tarihi" });
    const to = el("input", { class: "cc-input", type: "date", "aria-label": "Bitiş tarihi" });
    const exact = el("input", { type: "checkbox" }), titleOnly = el("input", { type: "checkbox" }), currentOnly = el("input", { type: "checkbox", checked: Boolean(CC.state.searchCurrentOnly && CC.adapter.getCurrentConversationId()) });
    CC.state.searchCurrentOnly = false;
    const include = el("input", { class: "cc-input", placeholder: "Zorunlu sözcükler; virgülle ayırın" });
    const exclude = el("input", { class: "cc-input", placeholder: "Hariç tutulan sözcükler; virgülle ayırın" });
    const includeMode = el("select", { class: "cc-select", "aria-label": "Zorunlu sözcük eşleşmesi" });
    includeMode.append(el("option", { value: "all", text: "Zorunluların tümü" }), el("option", { value: "any", text: "Zorunlulardan herhangi biri" }));
    const excludeMode = el("select", { class: "cc-select", "aria-label": "Hariç tutma eşleşmesi" });
    excludeMode.append(el("option", { value: "any", text: "Hariç tutulanlardan herhangi biri" }), el("option", { value: "all", text: "Hariç tutulanların tümü" }));
    advanced.append(
      el("div", { class: "cc-filter-grid" }, [role, from, to]),
      el("label", { class: "cc-checkline" }, [exact, document.createTextNode(" Tam cümle eşleşmesi")]),
      el("label", { class: "cc-checkline" }, [titleOnly, document.createTextNode(" Yalnızca başlıklarda ara")]),
      el("label", { class: "cc-checkline" }, [currentOnly, document.createTextNode(" Yalnızca açık sohbette ara")]),
      el("div", { class: "cc-filter-grid" }, [include, includeMode, exclude, excludeMode])
    );
    container.append(advancedToggle, advanced);
    if (currentOnly.checked) container.append(el("p", { class: "cc-note", text: "Bu arama yalnızca şu anda açık olan sohbeti kapsar. İlk aramada Companion mesajları bu cihazda yerel olarak dizine ekler." }));
    advancedToggle.addEventListener("click", () => { advanced.hidden = !advanced.hidden; advancedToggle.textContent = advanced.hidden ? "Gelişmiş filtreler +" : "Gelişmiş filtreler −"; });
    const history = el("div", { class: "cc-recent-searches" });
    const recent = await CC.repository.getSearchHistory();
    if (recent.length) {
      history.append(el("span", { class: "cc-eyebrow", text: "SON ARAMALAR" }));
      for (const term of recent) history.append(el("button", { class: "cc-chip", text: term, onclick: () => { query.value = term; search(); } }));
      container.append(history);
    }
    const resultHeader = el("div", { class: "cc-results-heading" });
    const resultCount = el("strong", { text: "Arama sonuçları" });
    const resultList = el("div", { class: "cc-list cc-results" });
    resultHeader.append(resultCount); container.append(resultHeader, resultList);
    const selection = new Set();
    const selectedPassages = new Map();
    const selectedActions = el("div", { class: "cc-row wrap cc-selection-bar", hidden: true });
    const archiveSelected = el("button", { class: "cc-button cc-small", text: "Seçilenleri arşivle" });
    const deleteSelected = el("button", { class: "cc-button cc-danger cc-small", text: "Seçilenleri sil" });
    const exportSelectedPassages = el("button", { class: "cc-button cc-small", text: "Eşleşen iletileri Markdown indir" });
    selectedActions.append(archiveSelected, deleteSelected, exportSelectedPassages); container.insertBefore(selectedActions, resultList);
    const getOptions = () => ({ query: query.value.trim(), role: role.value, from: from.value, to: to.value, exact: exact.checked, titleOnly: titleOnly.checked, conversationId: currentOnly.checked ? CC.adapter.getCurrentConversationId() : null, include: words(include.value), includeMode: includeMode.value, exclude: words(exclude.value), excludeMode: excludeMode.value, limit: 300 });

    function addHighlightedText(parent, text, term) {
      const terms = [...new Set(String(term || "").trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
      if (!terms.length) { parent.textContent = text; return; }
      const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expression = new RegExp(terms.map(escape).join("|"), "gi");
      let cursor = 0, match;
      while ((match = expression.exec(text))) {
        if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
        parent.append(el("mark", { class: "cc-highlight", text: match[0] }));
        cursor = expression.lastIndex;
      }
      if (!cursor) { parent.textContent = text; return; }
      if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
    }
    function snippet(text, term) {
      const at = CC.normalize(text).indexOf(CC.normalize(term));
      if (at < 0 || text.length < 360) return text.slice(0, 360);
      return `${at > 100 ? "…" : ""}${text.slice(Math.max(0, at - 100), Math.min(text.length, at + 260))}${at + 260 < text.length ? "…" : ""}`;
    }
    async function search() {
      if (!query.value.trim()) { resultList.replaceChildren(el("p", { class: "cc-empty", text: "Aramak için bir sözcük veya cümle yaz." })); return; }
      runButton.disabled = true; runButton.textContent = "Aranıyor…"; resultCount.textContent = "Sonuçlar aranıyor…";
      selection.clear(); selectedPassages.clear(); selectedActions.hidden = true;
      try {
        const options = getOptions();
        if (currentOnly.checked && !options.conversationId) throw new Error("Açık sohbette aramak için önce bir ChatGPT sohbeti açın.");
        if (currentOnly.checked) {
          const indexed = await CC.messageIndex.chats();
          if (!indexed.some((chat) => chat.id === options.conversationId)) {
            progress.hidden = false; progressText.textContent = "Açık sohbet ilk kez yerel dizine ekleniyor…";
            const record = await CC.adapter.fetchConversationForIndex(options.conversationId);
            await CC.indexer.indexConversation({ id: options.conversationId, title: record.title, url: `/c/${encodeURIComponent(options.conversationId)}`, archived: false }, record);
            await CC.repository.saveHistoryCatalog([{ id: options.conversationId, title: record.title, url: `/c/${encodeURIComponent(options.conversationId)}`, updatedAt: new Date().toISOString() }]);
            const latest = await CC.messageIndex.stats();
            statusMain.textContent = `${latest.chats} sohbet dizinde`; statusSub.textContent = `${latest.messages.toLocaleString("tr-TR")} ileti bu cihazda aranabilir.`;
            clearButton.disabled = !latest.messages;
          }
        }
        const results = await CC.messageIndex.search(options);
        await CC.repository.saveSearchTerm(options.query);
        resultList.replaceChildren();
        resultCount.textContent = `${results.length}${results.length === options.limit ? "+" : ""} eşleşen ileti`;
        for (const result of results) {
          const row = el("article", { class: "cc-result" });
          const check = el("input", { type: "checkbox", "aria-label": `${result.title} seç` });
          check.addEventListener("change", () => {
            const key = `${result.conversationId}:${result.id}`;
            check.checked ? selectedPassages.set(key, result) : selectedPassages.delete(key);
            const ids = new Set([...selectedPassages.values()].map((item) => item.conversationId));
            selection.clear(); for (const id of ids) selection.add(id);
            selectedActions.hidden = !selectedPassages.size; archiveSelected.textContent = `${selection.size} sohbeti arşivle`;
            deleteSelected.textContent = `${selection.size} sohbeti sil`; exportSelectedPassages.textContent = `${selectedPassages.size} eşleşen iletiyi Markdown indir`;
          });
          const main = el("div", { class: "cc-result-body" });
          const title = el("button", { class: "cc-link-button cc-result-title", text: result.title, onclick: () => CC.adapter.openSearchResult(result.conversationId, result.id) });
          const meta = el("span", { class: "cc-item-meta", text: `${result.role === "user" ? "SEN" : "CHATGPT"} · ${formatDate(result.timestamp)}` });
          const text = el("div", { class: "cc-result-snippet" }); addHighlightedText(text, snippet(result.text, options.query), options.query);
          main.append(title, meta, text); row.append(check, main); resultList.append(row);
        }
        if (!results.length) resultList.append(el("p", { class: "cc-empty", text: "Eşleşme bulunamadı. İndeks güncel değilse sohbetleri tekrar tarayın." }));
      } catch (error) { resultCount.textContent = "Arama başarısız"; resultList.replaceChildren(el("p", { class: "cc-error", text: error.message || "Yerel dizin okunamadı." })); }
      finally { runButton.disabled = false; runButton.textContent = "Ara"; }
    }
    runButton.addEventListener("click", search);
    query.addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });
    archiveSelected.addEventListener("click", () => CC.organization.manageSelectedChats([...selection], "archive"));
    deleteSelected.addEventListener("click", () => CC.organization.manageSelectedChats([...selection], "delete"));
    exportSelectedPassages.addEventListener("click", () => CC.exporter.exportPassages([...selectedPassages.values()], query.value.trim()));
    if (!stats.messages) resultList.append(el("p", { class: "cc-empty", text: "Önce sohbetlerini bu cihazda tara. Dizin konuşma metinlerini yerelde tutar ve istediğinde temizlenebilir." }));

    indexCurrentButton.addEventListener("click", async () => {
      const id = CC.adapter.getCurrentConversationId();
      if (!id) return CC.ui.toast("Önce aramak istediğiniz sohbeti açın.", "error");
      indexCurrentButton.disabled = true; indexCurrentButton.textContent = "Açık sohbet taranıyor…";
      progress.hidden = false; progressText.textContent = "Yalnızca açık sohbet yerel dizine ekleniyor…";
      try {
        const record = await CC.adapter.fetchConversationForIndex(id);
        await CC.indexer.indexConversation({ id, title: record.title, url: `/c/${encodeURIComponent(id)}`, archived: false }, record);
        await CC.repository.saveHistoryCatalog([{ id, title: record.title, url: `/c/${encodeURIComponent(id)}`, updatedAt: new Date().toISOString() }]);
        const latest = await CC.messageIndex.stats();
        statusMain.textContent = `${latest.chats} sohbet dizinde`; statusSub.textContent = `${latest.messages.toLocaleString("tr-TR")} ileti bu cihazda aranabilir.`;
        clearButton.disabled = !latest.messages; progressText.textContent = `Açık sohbet eklendi · ${record.messages.length} ileti dizine alındı.`;
        CC.ui.toast("Açık sohbet yerel arama dizinine eklendi.");
      } catch (error) { progressText.textContent = error.message || "Açık sohbet taranamadı."; CC.ui.toast(progressText.textContent, "error"); }
      finally { indexCurrentButton.disabled = !CC.adapter.getCurrentConversationId(); indexCurrentButton.textContent = "Açık sohbeti tara"; }
    });

    indexButton.addEventListener("click", async () => {
      if (CC.indexer.active) { CC.indexer.stop(); indexButton.disabled = true; indexButton.textContent = "Durduruluyor…"; return; }
      indexButton.textContent = "Durdur"; progress.hidden = false; progressText.textContent = "Sohbetler sırayla inceleniyor…";
      try {
        const result = await CC.indexer.run((state) => {
          if (state.phase === "history") {
            statusMain.textContent = "ChatGPT geçmişi yenileniyor";
            statusSub.textContent = `${(state.count || 0).toLocaleString("tr-TR")} sohbet listelendi · ${state.step || 0} sayfa`;
            progress.firstChild.style.width = "0%";
            progressText.textContent = "Etkin ve arşivlenmiş sohbetlerin tam listesi alınıyor…";
            return;
          }
          statusMain.textContent = `${state.done} / ${state.total} sohbet tarandı`;
          statusSub.textContent = `${state.messageCount.toLocaleString("tr-TR")} ileti dizinde · ${state.failures} atlandı`;
          progress.firstChild.style.width = `${state.total ? Math.round(state.done / state.total * 100) : 100}%`;
          progressText.textContent = state.title ? `Şu an: ${state.title}` : "Arşivlenmiş sohbetler de dahil ediliyor.";
        });
        const latest = await CC.messageIndex.stats();
        statusMain.textContent = `${latest.chats} sohbet dizinde`; statusSub.textContent = `${latest.messages.toLocaleString("tr-TR")} ileti bu cihazda aranabilir.`;
        progressText.textContent = result.stopped ? "Tarama durduruldu; tekrar başlatınca kalan sohbetlerden sürer." : `Tarama tamamlandı · ${result.failures} sohbet atlandı.`;
        clearButton.disabled = !latest.messages;
      } catch (error) { progressText.textContent = error.message || "Tarama tamamlanamadı."; CC.ui.toast(progressText.textContent, "error"); }
      finally { indexButton.disabled = false; indexButton.textContent = "Kalan sohbetleri tara"; }
    });
    clearButton.addEventListener("click", async () => {
      if (!(await CC.ui.confirm("Yerel arama dizinini temizle", "Bu cihazdaki sohbet ileti dizini ve mesaj metinleri silinecek. ChatGPT sohbetleri etkilenmez.", { confirmText: "Dizini temizle", danger: true }))) return;
      await CC.messageIndex.clear();
      const latest = await CC.messageIndex.stats();
      statusMain.textContent = "0 sohbet dizinde"; statusSub.textContent = `${latest.messages} ileti bu cihazda aranabilir.`;
      clearButton.disabled = true; resultList.replaceChildren(el("p", { class: "cc-empty", text: "Yerel arama dizini temizlendi." }));
    });
  }});
})();
