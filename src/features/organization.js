(function defineOrganizationTools() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);

  async function visibleChats(mode = "active", collected = []) {
    const [local, imported] = await Promise.all([CC.repository.getChatMeta(), CC.repository.getHistoryCatalog()]);
    const combined = new Map(imported.map((chat) => [chat.id, { ...chat, catalogued: true }]));
    for (const chat of [...collected, ...CC.adapter.listVisibleChats()]) {
      const existing = combined.get(chat.id) || {};
      combined.set(chat.id, {
        ...existing, ...chat,
        createdAt: chat.createdAt ?? existing.createdAt,
        updatedAt: chat.updatedAt ?? existing.updatedAt,
        archived: typeof chat.archived === "boolean" ? chat.archived : existing.archived,
        catalogued: Boolean(existing.catalogued)
      });
    }
    const list = [...combined.values()].map((chat) => {
      const metadata = local[chat.id] || {};
      const archived = typeof metadata.archived === "boolean" ? metadata.archived : chat.archived;
      const folderIds = [...new Set((Array.isArray(metadata.folderIds) ? metadata.folderIds : (metadata.folderId ? [metadata.folderId] : [])).filter(Boolean))];
      return { ...chat, ...metadata, folderIds, folderId: folderIds[0] || null, createdAt: chat.createdAt, updatedAt: chat.updatedAt, archived };
    });
    const filtered = mode === "archived" ? list.filter((chat) => chat.archived === true)
      : mode === "active" ? list.filter((chat) => chat.archived !== true)
      : list;
    return filtered.sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "") || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "") || 0;
      return rightTime - leftTime;
    });
  }
  async function loadChats(mode = "active", onProgress) {
    if (mode === "archived") {
      const opened = await CC.adapter.openArchiveManager();
      if (!opened.ok) throw new Error(opened.reason || "Arşiv listesi açılamadı.");
    } else await CC.adapter.closeArchiveManager();
    const collected = await CC.adapter.collectVisibleChats({ max: 50000, maxScrolls: 500, onProgress });
    await CC.repository.saveHistoryCatalog(collected);
    return visibleChats(mode, collected);
  }

  async function renameChat(chat) {
    const title = await CC.ui.prompt("Sohbet adını değiştir", "Yeni ad ChatGPT hesabınızdaki sohbet başlığına uygulanır.", chat.title || "");
    if (title === null || !title.trim() || title.trim() === chat.title) return;
    const result = await CC.adapter.renameConversation(chat.id, title.trim());
    if (!result.ok) return CC.ui.toast(result.reason || "Sohbet adı değiştirilemedi.", "error");
    const catalog = await CC.repository.getHistoryCatalog();
    const saved = catalog.find((item) => item.id === chat.id) || { id: chat.id, url: chat.url || `/c/${encodeURIComponent(chat.id)}` };
    await CC.repository.saveHistoryCatalog([{ ...saved, title: result.title, updatedAt: new Date().toISOString() }]);
    CC.ui.toast("Sohbet adı değiştirildi.");
    await CC.ui.render("manage");
  }

  async function manageSelectedChats(ids, action, archiveStates = {}) {
    if (!ids.length) { CC.ui.toast("Önce en az bir sohbet seçin.", "error"); return; }
    if (action === "delete") {
      const accepted = await CC.ui.confirm("Sohbetler kalıcı olarak silinecek", `${ids.length} sohbet ChatGPT hesabınızdan kalıcı olarak silinecek ve geri getirilemeyecek. Devam edilsin mi?`, { confirmText: `Kalıcı sil (${ids.length})`, danger: true });
      if (!accepted) return;
    }
    await CC.repository.saveJob({ id: CC.id(), type: "action", action, archiveStates, ids: [...new Set(ids)], cursor: 0, completed: 0, startedAt: Date.now() });
    await continueJob();
  }

  async function continueJob() {
    if (CC.state.jobRunning) return;
    CC.state.jobRunning = true;
    try {
      const job = await CC.repository.getJob();
      if (!job || job.type !== "action") return;
      if (job.cursor >= job.ids.length) {
        await CC.repository.clearJob();
        CC.ui.toast(`${job.completed} sohbet için işlem tamamlandı.`);
        if (CC.state.panel && !CC.state.panel.hidden) await CC.ui.render("manage");
        return;
      }
      const id = job.ids[job.cursor];
      CC.ui.open("manage");
      const result = await CC.adapter.performChatAction(id, job.action, { archived: job.archiveStates?.[id] ?? null });
      if (!result.ok) return stopJob(result.reason || "ChatGPT işlemi doğrulanamadı.");
      if (job.action === "archive") await CC.repository.saveChatMeta(id, { archived: true });
      if (job.action === "unarchive") await CC.repository.saveChatMeta(id, { archived: false });
      if (job.action === "delete") await CC.repository.removeChats([id]);
      await CC.repository.saveJob({ ...job, cursor: job.cursor + 1, completed: job.completed + 1 });
      setTimeout(() => continueJob(), 250);
    } catch (error) {
      await stopJob(error?.message || "Toplu işlem durduruldu.");
    } finally { CC.state.jobRunning = false; }
  }

  async function stopJob(reason = "İşlem durduruldu.") {
    const job = await CC.repository.getJob();
    if (!job) return;
    await CC.repository.clearJob();
    if (job.id) await CC.tempStore.clear(job.id).catch(() => {});
    CC.ui.toast(`${reason} ${job.completed || 0}/${job.ids?.length || 0} tamamlandı.`, "error");
    if (CC.state.panel && !CC.state.panel.hidden) await CC.ui.render("manage");
  }

  CC.organization = { visibleChats, loadChats, manageSelectedChats, continueJob, stopJob, renameChat };

  CC.features.register({ id: "home", titleKey: "home", render(container) {
    container.append(el("h2", { text: "ChatGPT sohbetlerinizi yönetin" }));
    container.append(el("p", { class: "cc-note", text: "Sohbetleri klasörleyin, seçerek arşivleyin veya dışa aktarın. Silme kalıcıdır; önce arşivlemeyi tercih edebilirsiniz." }));
    for (const [view, title, description] of [
      ["manage", "Sohbetleri yönet", "Etkin ve erişilebilir arşivlenmiş sohbetleri seçin."],
      ["organize", "Klasörler ve etiketler", "Kişisel klasörler oluşturup sohbetlere atayın."],
      ["export", "Dışa aktar", "Açık sohbeti TXT, Markdown, JSON veya CSV olarak kaydedin."]
    ]) {
      const card = el("button", { class: "cc-card", type: "button", onclick: () => CC.ui.open(view) });
      card.append(el("strong", { text: title }), el("div", { class: "cc-item-meta", text: description }));
      container.append(card);
    }
    container.append(el("p", { class: "cc-muted", text: "Klasörler ve etiketler bu tarayıcıda tutulur. Dışa aktarma yalnızca sizin seçtiğiniz sohbetleri okur." }));
  }});

  CC.features.register({ id: "manage", titleKey: "manage", async render(container) {
    container.append(el("h2", { text: "Sohbetleri yönet" }));
    if (CC.state.pendingDownload) {
      const ready = el("div", { class: "cc-card" });
      ready.append(el("strong", { text: "Dışa aktarma hazır" }), el("p", { class: "cc-item-meta", text: CC.state.pendingDownload.filename }));
      ready.append(el("button", { class: "cc-button cc-primary", text: "Dosyayı indir", onclick: () => CC.exporter.downloadPending() }));
      container.append(ready);
    }
    container.append(el("p", { class: "cc-note", text: "Eklenti sohbet listesini ChatGPT hesabınızdan sayfa sayfa alır, bulduğu sohbetleri bu tarayıcıda saklar. Sohbet metinleri bu işlemde okunmaz." }));
    const tabs = el("div", { class: "cc-row wrap" });
    const activeTab = el("button", { class: "cc-button cc-primary", text: "Etkin sohbetler" });
    const archivedTab = el("button", { class: "cc-button", text: "Arşivlenmiş sohbetler" });
    const allTab = el("button", { class: "cc-button", text: "Tüm geçmiş" });
    const loadButton = el("button", { class: "cc-button", text: "Tüm geçmişi yükle" });
    const stopHistoryButton = el("button", { class: "cc-button cc-danger cc-small", text: "Yüklemeyi durdur", hidden: true });
    tabs.append(activeTab, archivedTab, allTab, loadButton, stopHistoryButton);
    const query = el("input", { class: "cc-input", type: "search", placeholder: "Başlığa göre filtrele…", "aria-label": "Sohbetleri ada göre filtrele" });
    const folderFilter = el("select", { class: "cc-select", "aria-label": "Klasöre göre filtrele" });
    folderFilter.append(el("option", { value: "", text: "Tüm klasörler" }), el("option", { value: "__folderless__", text: "Klasörsüz" }));
    const sortOrder = el("select", { class: "cc-select", "aria-label": "Sohbetleri tarihe göre sırala" });
    sortOrder.append(el("option", { value: "newest", text: "Yeniler önce" }), el("option", { value: "oldest", text: "Eskiler önce" }), el("option", { value: "title", text: "Başlığa göre" }));
    const count = el("p", { class: "cc-muted", text: "ChatGPT listesini yükleyin." });
    const historyStatus = el("p", { class: "cc-muted", text: "" });
    const progress = el("p", { class: "cc-note", hidden: true, text: "" });
    const jobProgress = el("div", { class: "cc-progress", hidden: true }, [el("i", { style: "width:0%" })]);
    const list = el("div", { class: "cc-list" });
    const actions = el("div", { class: "cc-row wrap" });
    const selectVisible = el("button", { class: "cc-button cc-small", text: "Bu sayfadakileri seç" });
    const selectFiltered = el("button", { class: "cc-button cc-small", text: "Filtrelenenlerin tümünü seç" });
    const clearSelection = el("button", { class: "cc-button cc-quiet cc-small", text: "Seçimi temizle" });
    const archive = el("button", { class: "cc-button cc-small", text: "Arşivle" });
    const unarchive = el("button", { class: "cc-button cc-small", text: "Arşivden çıkar" });
    const remove = el("button", { class: "cc-button cc-danger cc-small", text: "Sil" });
    const zipFormat = el("select", { class: "cc-select cc-zip-format", "aria-label": "ZIP dosya biçimi" });
    zipFormat.append(el("option", { value: "zip", text: "ZIP · Markdown" }), el("option", { value: "zip-text", text: "ZIP · TXT" }), el("option", { value: "zip-json", text: "ZIP · JSON" }), el("option", { value: "zip-csv", text: "ZIP · CSV" }));
    const exportZip = el("button", { class: "cc-button cc-small", text: "ZIP dışa aktar" });
    const pinSelected = el("button", { class: "cc-button cc-small", text: "Sabitle / kaldır" });
    const folderSelect = el("select", { class: "cc-select", "aria-label": "Seçili sohbetleri klasöre taşı" });
    const assignFolder = el("button", { class: "cc-button cc-small", text: "Taşı" });
    const addFolder = el("button", { class: "cc-button cc-small", text: "Klasöre ekle" });
    const removeFolder = el("button", { class: "cc-button cc-small", text: "Klasörden çıkar" });
    const tagButton = el("button", { class: "cc-button cc-small", text: "Etiket ekle / kaldır" });
    actions.append(selectVisible, selectFiltered, clearSelection, archive, unarchive, remove, zipFormat, exportZip, pinSelected, folderSelect, assignFolder, addFolder, removeFolder, tagButton);
    const pageControls = el("div", { class: "cc-row between" });
    const previousPage = el("button", { class: "cc-button cc-small", text: "Önceki" });
    const pageLabel = el("span", { class: "cc-muted", text: "" });
    const nextPage = el("button", { class: "cc-button cc-small", text: "Sonraki" });
    pageControls.append(previousPage, pageLabel, nextPage);
    container.append(tabs, query, folderFilter, sortOrder, count, historyStatus, progress, jobProgress, actions, list, pageControls);

    const historyCatalog = await CC.repository.getHistoryCatalog();
    let historyCatalogCount = historyCatalog.length;
    let mode = historyCatalog.length ? "all" : "active";
    let page = 0;
    let scanning = false;
    const pageSize = 100;
    let currentPageChats = [];
    let filteredChats = [];
    activeTab.classList.toggle("cc-primary", mode === "active");
    allTab.classList.toggle("cc-primary", mode === "all");
    archive.disabled = mode === "archived";
    unarchive.disabled = mode === "active";
    let chats = await visibleChats(mode);
    historyStatus.textContent = historyCatalog.length
      ? `Eklentinin önceki taramalarından ${historyCatalog.length} sohbet kayıtlı.`
      : "İlk günden itibaren erişilebilir sohbetleri yüklemek için “Tüm geçmişi yükle” düğmesine basın.";
    const selected = new Set();
    const job = await CC.repository.getJob();
    if (job) {
      progress.hidden = false;
      jobProgress.hidden = false;
      const total = job.ids?.length || 0;
      const completed = job.completed || 0;
      jobProgress.firstChild.style.width = `${total ? Math.min(100, Math.round(completed / total * 100)) : 0}%`;
      progress.textContent = `${job.type === "export" ? "Dışa aktarma" : "Toplu işlem"} sürüyor: ${completed}/${total}.`;
      const stop = el("button", { class: "cc-button cc-danger cc-small", text: "Durdur", onclick: () => CC.organization.stopJob("Kullanıcı işlemi durdurdu.") });
      progress.append(" ", stop);
    }

    async function refresh({ scroll = false } = {}) {
      if (scroll && scanning) return;
      if (scroll) {
        scanning = true;
        loadButton.disabled = true;
        loadButton.textContent = "Yükleniyor…";
        stopHistoryButton.hidden = false;
        activeTab.disabled = true;
        archivedTab.disabled = true;
        allTab.disabled = true;
        historyStatus.textContent = "ChatGPT sohbet listesi yükleniyor…";
      }
      try {
        page = 0;
        chats = scroll ? await loadChats(mode, ({ count: found, step, retrying }) => {
          historyStatus.textContent = `ChatGPT geçmişi yükleniyor: ${found} sohbet bulundu · ${step} sayfa${retrying ? " · yeniden deneniyor" : ""}`;
        }) : await visibleChats(mode);
        if (scroll) {
          const scan = CC.adapter.lastHistoryLoad;
          historyCatalogCount = (await CC.repository.getHistoryCatalog()).length;
          const result = scan?.source === "account"
            ? scan.stopped ? "Yükleme durduruldu. Bulunan sohbetler saklandı; yeniden yükleyebilirsiniz." : scan.reachedEnd ? "ChatGPT hesabınızdaki erişilebilir geçmiş yüklendi." : scan.apiError ? "ChatGPT bazı sayfaları yüklemedi. Bulunan sohbetler saklandı; yeniden deneyebilirsiniz." : "Geçmiş uzun olduğu için tarama sınırına ulaştı. Yeniden deneyebilirsiniz."
            : scan?.stopped ? "Yükleme durduruldu. Bulunan sohbetler saklandı; yeniden yükleyebilirsiniz." : scan?.stalled ? "ChatGPT daha eski sohbetleri yüklemedi. Yeniden deneyebilirsiniz." : "ChatGPT arayüzünde görünen sohbetler alındı. Daha eski kayıtlar için yeniden deneyebilirsiniz.";
          historyStatus.textContent = `${scan?.count ?? chats.length} sohbet bulundu. ${result}`;
          loadButton.textContent = scan?.source === "account" && scan.reachedEnd ? "Geçmişi güncelle" : "Yeniden dene";
        }
        count.textContent = `${chats.length} sohbet · ${selected.size} seçili`;
        draw();
      } catch (error) {
        count.textContent = error.message || "Sohbet listesi alınamadı.";
        if (scroll) { historyStatus.textContent = "ChatGPT geçmişi alınamadı. Yeniden deneyebilirsiniz."; loadButton.textContent = "Yeniden dene"; }
      } finally {
        if (scroll) {
          scanning = false;
          loadButton.disabled = false;
          stopHistoryButton.hidden = true;
          stopHistoryButton.disabled = false;
          stopHistoryButton.textContent = "Yüklemeyi durdur";
          activeTab.disabled = false;
          archivedTab.disabled = false;
          allTab.disabled = false;
        }
      }
    }
    function draw() {
      list.replaceChildren();
      const previousFolder = folderFilter.value;
      folderFilter.replaceChildren(el("option", { value: "", text: "Tüm klasörler" }), el("option", { value: "__folderless__", text: "Klasörsüz" }));
      for (const folder of CC.organization.folderCache || []) folderFilter.append(el("option", { value: folder.id, text: `${folder.pinned ? "★ " : ""}${folder.name}` }));
      const desiredFolder = previousFolder || CC.state.folderFilterId || "";
      if ([...folderFilter.options].some((option) => option.value === desiredFolder)) folderFilter.value = desiredFolder;
      CC.state.folderFilterId = folderFilter.value;
      folderSelect.replaceChildren(el("option", { value: "", text: "Klasör seçin…" }), el("option", { value: "__none__", text: "Tüm klasör atamalarını kaldır" }));
      for (const folder of CC.organization.folderCache || []) folderSelect.append(el("option", { value: folder.id, text: folder.name }));
      const folderId = folderFilter.value;
      const matches = CC.search.filterTitles(chats, query.value).filter((chat) => {
        const ids = chat.folderIds || (chat.folderId ? [chat.folderId] : []);
        return !folderId || (folderId === "__folderless__" ? ids.length === 0 : ids.includes(folderId));
      }).sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
        if (sortOrder.value === "title") return CC.normalize(left.title).localeCompare(CC.normalize(right.title), "tr");
        const dateFor = (item) => Date.parse(sortOrder.value === "oldest" ? item.createdAt || item.updatedAt || "" : item.updatedAt || item.createdAt || "") || null;
        const leftTime = dateFor(left), rightTime = dateFor(right);
        if (leftTime === null) return rightTime === null ? 0 : 1;
        if (rightTime === null) return -1;
        return sortOrder.value === "oldest" ? leftTime - rightTime : rightTime - leftTime;
      });
      filteredChats = matches;
      const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
      page = Math.min(page, totalPages - 1);
      currentPageChats = matches.slice(page * pageSize, (page + 1) * pageSize);
      count.textContent = `${matches.length} sohbet · ${selected.size} seçili${mode === "all" && historyCatalogCount ? ` · ${historyCatalogCount} kayıtlı` : ""}`;
      pageLabel.textContent = `${page + 1} / ${totalPages}`;
      previousPage.disabled = page === 0;
      nextPage.disabled = page >= totalPages - 1;
      if (!matches.length) {
        list.append(el("p", { class: "cc-muted", text: "Henüz sohbet bulunmadı. “Tüm geçmişi yükle” düğmesine basın." }));
        return;
      }
      for (const chat of currentPageChats) {
        const row = el("article", { class: "cc-item" });
        const check = el("input", { type: "checkbox", checked: selected.has(chat.id), "aria-label": `${chat.title} seç` });
        check.addEventListener("change", () => { check.checked ? selected.add(chat.id) : selected.delete(chat.id); draw(); });
        const main = el("span", { class: "cc-item-main" });
        const title = el("button", { class: "cc-item-title cc-link-button", type: "button", text: `${chat.pinned ? "★ " : ""}${chat.title}`, onclick: () => CC.adapter.openConversation(chat.id) });
        const folderNames = (chat.folderIds || (chat.folderId ? [chat.folderId] : [])).map((id) => (CC.organization.folderCache || []).find((item) => item.id === id)).filter(Boolean);
        const tags = (CC.organization.tagCache || []).filter((tag) => (chat.tagIds || []).includes(tag.id)).map((tag) => `#${tag.name}`);
        const archiveLabel = chat.archived === true ? "Arşivlenmiş" : chat.archived === false ? "Etkin" : "Durumu bilinmiyor";
        const lastDate = chat.updatedAt || chat.createdAt;
        const ageDays = lastDate ? Math.max(0, Math.floor((Date.now() - Date.parse(lastDate)) / 86400000)) : null;
        const age = ageDays === null || !Number.isFinite(ageDays) ? "Tarihsiz" : ageDays === 0 ? "Bugün" : ageDays === 1 ? "Dün" : `${ageDays.toLocaleString("tr-TR")} gün önce`;
        const ageBadge = el("span", { class: `cc-age-badge${ageDays !== null && ageDays > 365 ? " old" : ageDays !== null && ageDays <= 7 ? " recent" : ""}`, text: age });
        const folderBadges = folderNames.map((folder) => {
          const badge = el("span", { class: "cc-folder-badge", text: folder.name });
          if (folder.color) badge.style.setProperty("--folder-color", folder.color);
          return badge;
        });
        main.append(title, el("span", { class: "cc-folder-badges" }, [...(folderBadges.length ? folderBadges : [el("span", { class: "cc-item-meta", text: "Klasörsüz" })]), ageBadge]), el("span", { class: "cc-item-meta", text: [...tags, archiveLabel, chat.catalogued ? "Eklentide kayıtlı" : ""].filter(Boolean).join(" · ") }));
        const rename = el("button", { class: "cc-button cc-small cc-quiet cc-chat-rename", type: "button", text: "Adını değiştir", "aria-label": `${chat.title} sohbetinin adını değiştir`, onclick: () => renameChat(chat) });
        row.append(check, main, rename);
        list.append(row);
      }
    }
    async function setMode(next) {
      if (scanning) return;
      mode = next; selected.clear();
      activeTab.classList.toggle("cc-primary", mode === "active");
      archivedTab.classList.toggle("cc-primary", mode === "archived");
      allTab.classList.toggle("cc-primary", mode === "all");
      archive.disabled = mode === "archived";
      unarchive.disabled = mode === "active";
      page = 0;
      if (mode !== "archived") await CC.adapter.closeArchiveManager();
      await refresh({ scroll: true });
    }
    activeTab.addEventListener("click", () => setMode("active"));
    archivedTab.addEventListener("click", () => setMode("archived"));
    allTab.addEventListener("click", () => setMode("all"));
    loadButton.addEventListener("click", () => refresh({ scroll: true }));
    stopHistoryButton.addEventListener("click", () => {
      stopHistoryButton.disabled = true;
      stopHistoryButton.textContent = "Durduruluyor…";
      CC.adapter.stopHistoryScan?.();
    });
    query.addEventListener("input", () => { page = 0; draw(); });
    folderFilter.addEventListener("change", () => { CC.state.folderFilterId = folderFilter.value; page = 0; draw(); CC.ui.refreshFolderShortcuts(); });
    sortOrder.addEventListener("change", () => { page = 0; draw(); });
    previousPage.addEventListener("click", () => { page = Math.max(0, page - 1); draw(); });
    nextPage.addEventListener("click", () => { page++; draw(); });
    selectVisible.addEventListener("click", () => { for (const chat of currentPageChats) selected.add(chat.id); draw(); });
    selectFiltered.addEventListener("click", () => { for (const chat of filteredChats) selected.add(chat.id); draw(); });
    clearSelection.addEventListener("click", () => { selected.clear(); draw(); });
    const selectedArchiveStates = () => Object.fromEntries(chats.filter((chat) => selected.has(chat.id)).map((chat) => [chat.id, chat.archived]));
    archive.addEventListener("click", () => manageSelectedChats([...selected], "archive", selectedArchiveStates()));
    unarchive.addEventListener("click", () => manageSelectedChats([...selected], "unarchive", selectedArchiveStates()));
    remove.addEventListener("click", () => manageSelectedChats([...selected], "delete", selectedArchiveStates()));
    exportZip.addEventListener("click", async () => {
      if (!selected.size) return CC.ui.toast("Önce sohbet seçin.", "error");
      await CC.exporter.exportSelection([...selected], zipFormat.value);
    });
    assignFolder.addEventListener("click", async () => {
      if (!selected.size || !folderSelect.value) return CC.ui.toast("Sohbet ve klasör seçin.", "error");
      const folderId = folderSelect.value === "__none__" ? null : folderSelect.value;
      for (const id of selected) await CC.repository.saveChatMeta(id, { folderId, folderIds: folderId ? [folderId] : [] });
      CC.ui.toast(folderId ? `${selected.size} sohbet taşındı.` : `${selected.size} sohbet klasörlerden çıkarıldı.`); await refresh();
    });
    addFolder.addEventListener("click", async () => {
      if (!selected.size || !folderSelect.value || folderSelect.value === "__none__") return CC.ui.toast("Sohbet ve klasör seçin.", "error");
      const folderId = folderSelect.value;
      const metadata = await CC.repository.getChatMeta();
      for (const id of selected) {
        const current = metadata[id] || {};
        const folderIds = [...new Set([...(current.folderIds || (current.folderId ? [current.folderId] : [])), folderId])];
        await CC.repository.saveChatMeta(id, { folderIds, folderId: folderIds[0] || null });
      }
      CC.ui.toast(`${selected.size} sohbet seçilen klasöre eklendi.`); await refresh();
    });
    removeFolder.addEventListener("click", async () => {
      if (!selected.size || !folderSelect.value || folderSelect.value === "__none__") return CC.ui.toast("Sohbet ve çıkarılacak klasörü seçin.", "error");
      const folderId = folderSelect.value;
      const metadata = await CC.repository.getChatMeta();
      for (const id of selected) {
        const current = metadata[id] || {};
        const folderIds = (current.folderIds || (current.folderId ? [current.folderId] : [])).filter((item) => item !== folderId);
        await CC.repository.saveChatMeta(id, { folderIds, folderId: folderIds[0] || null });
      }
      CC.ui.toast(`${selected.size} sohbet seçilen klasörden çıkarıldı.`); await refresh();
    });
    tagButton.addEventListener("click", async () => {
      if (!selected.size) return CC.ui.toast("Önce sohbet seçin.", "error");
      const name = await CC.ui.prompt("Etiket ekle veya kaldır", "Etiket adını girin. Seçilen sohbetlerin tümünde varsa kaldırılır; değilse hepsine eklenir.");
      if (!name) return;
      let tag = (await CC.repository.getTags()).find((item) => CC.normalize(item.name) === CC.normalize(name));
      if (!tag) { tag = { id: CC.id(), name, createdAt: Date.now() }; await CC.repository.saveTag(tag); }
      const currentMetadata = await CC.repository.getChatMeta();
      const removeTag = [...selected].every((id) => (currentMetadata[id]?.tagIds || []).includes(tag.id));
      for (const id of selected) {
        const meta = currentMetadata[id] || {};
        const tagIds = (meta.tagIds || []).filter((item) => item !== tag.id);
        await CC.repository.saveChatMeta(id, { tagIds: removeTag ? tagIds : [...new Set([...tagIds, tag.id])] });
      }
      CC.ui.toast(removeTag ? `“${name}” etiketi kaldırıldı.` : `“${name}” etiketi eklendi.`); await refresh();
    });
    pinSelected.addEventListener("click", async () => {
      if (!selected.size) return CC.ui.toast("Önce sohbet seçin.", "error");
      const metadata = await CC.repository.getChatMeta();
      for (const id of selected) await CC.repository.saveChatMeta(id, { pinned: !metadata[id]?.pinned });
      CC.ui.toast(`${selected.size} sohbet için sabitleme durumu değiştirildi.`);
      await refresh();
    });
    CC.organization.folderCache = (await CC.repository.getFolders()).sort((left, right) => Number(right.pinned) - Number(left.pinned) || CC.normalize(left.name).localeCompare(CC.normalize(right.name), "tr"));
    CC.organization.tagCache = await CC.repository.getTags();
    draw();
  }});

  CC.features.register({ id: "organize", titleKey: "organize", async render(container) {
    container.append(el("h2", { text: "Klasörler ve etiketler" }));
    container.append(el("p", { class: "cc-note", text: "Klasörleme bu eklenti içinde yereldir; ChatGPT’deki sohbetlerin kendisi taşınmaz." }));
    const [folders, allMeta] = await Promise.all([CC.repository.getFolders(), CC.repository.getChatMeta()]);
    const parent = el("select", { class: "cc-select", "aria-label": "Üst klasör" });
    parent.append(el("option", { value: "", text: "Üst klasör yok" }));
    for (const folder of folders) parent.append(el("option", { value: folder.id, text: folder.name }));
    const folderName = el("input", { class: "cc-input", placeholder: "Yeni klasör adı…", "aria-label": "Yeni klasör adı" });
    const folderColor = el("input", { class: "cc-color-input", type: "color", value: "#a78bfa", title: "Klasör rengi", "aria-label": "Klasör rengi" });
    const create = el("button", { class: "cc-button cc-primary", text: "Klasör oluştur" });
    create.addEventListener("click", async () => {
      const name = folderName.value.trim();
      if (!name) return;
      if (folders.some((item) => item.parentId === parent.value && CC.normalize(item.name) === CC.normalize(name))) return CC.ui.toast("Bu klasör adı zaten kullanılıyor.", "error");
      await CC.repository.saveFolder({ id: CC.id(), name, color: folderColor.value, parentId: parent.value || null, pinned: false, createdAt: Date.now() });
      await CC.ui.render("organize");
    });
    container.append(el("div", { class: "cc-inline-form" }, [folderName, folderColor, create]), parent);
    const list = el("div", { class: "cc-list" });
    const byId = new Map(folders.map((item) => [item.id, item]));
    const folderCounts = new Map();
    for (const item of Object.values(allMeta)) for (const id of (item.folderIds || (item.folderId ? [item.folderId] : []))) folderCounts.set(id, (folderCounts.get(id) || 0) + 1);
    for (const folder of folders) {
      const row = el("div", { class: "cc-item cc-folder-row" });
      const main = el("span", { class: "cc-item-main" });
      const parentName = byId.get(folder.parentId)?.name;
      const title = el("span", { class: "cc-item-title", text: `${folder.pinned ? "★ " : ""}${folder.name}` });
      const dot = el("i", { class: "cc-folder-dot" }); dot.style.setProperty("--folder-color", folder.color || "#a78bfa");
      main.append(el("div", { class: "cc-folder-title-row" }, [dot, title]), el("span", { class: "cc-item-meta", text: `${parentName ? `↳ ${parentName} · ` : "Üst seviye · "}${folderCounts.get(folder.id) || 0} sohbet` }));
      const rename = el("button", { class: "cc-button cc-small", text: "Adını değiştir" });
      rename.addEventListener("click", async () => {
        const name = await CC.ui.prompt("Klasör adını değiştir", "Yeni klasör adını girin.", folder.name);
        if (!name?.trim()) return;
        await CC.repository.saveFolder({ ...folder, name: name.trim() }); await CC.ui.render("organize");
      });
      const color = el("input", { class: "cc-color-input cc-color-small", type: "color", value: folder.color || "#a78bfa", title: "Rengi değiştir", "aria-label": `${folder.name} klasör rengi` });
      color.addEventListener("change", async () => { await CC.repository.saveFolder({ ...folder, color: color.value }); await CC.ui.render("organize"); });
      const pin = el("button", { class: "cc-button cc-small", text: folder.pinned ? "Sabitlemeyi kaldır" : "Sabitle" });
      pin.addEventListener("click", async () => { await CC.repository.saveFolder({ ...folder, pinned: !folder.pinned }); await CC.ui.render("organize"); });
      const remove = el("button", { class: "cc-button cc-small", text: "Sil" });
      remove.addEventListener("click", async () => {
        if (!(await CC.ui.confirm("Klasörü sil", `“${folder.name}” klasörü silinir. ChatGPT sohbetleri etkilenmez.`))) return;
        await CC.repository.deleteFolder(folder.id);
        for (const [id, value] of Object.entries(allMeta)) {
          const folderIds = (value.folderIds || (value.folderId ? [value.folderId] : [])).filter((item) => item !== folder.id);
          if (folderIds.length !== (value.folderIds || (value.folderId ? [value.folderId] : [])).length) await CC.repository.saveChatMeta(id, { folderIds, folderId: folderIds[0] || null });
        }
        for (const child of folders.filter((item) => item.parentId === folder.id)) await CC.repository.saveFolder({ ...child, parentId: folder.parentId || null });
        await CC.ui.render("organize");
      });
      row.append(main, rename, color, pin, remove); list.append(row);
    }
    if (!folders.length) list.append(el("p", { class: "cc-muted", text: "Henüz klasör yok." }));
    container.append(list, el("h3", { text: "Etiketler" }));
    const tags = await CC.repository.getTags();
    const addTag = el("button", { class: "cc-button", text: "Etiket oluştur" });
    addTag.addEventListener("click", async () => {
      const name = await CC.ui.prompt("Yeni etiket", "Etiket adını girin.");
      if (!name) return;
      if (tags.some((tag) => CC.normalize(tag.name) === CC.normalize(name))) return CC.ui.toast("Bu etiket zaten var.", "error");
      await CC.repository.saveTag({ id: CC.id(), name, createdAt: Date.now() }); await CC.ui.render("organize");
    });
    container.append(addTag);
    for (const tag of tags) {
      const row = el("div", { class: "cc-row between cc-card" });
      row.append(el("span", { text: `#${tag.name}` }));
      row.append(el("button", { class: "cc-button cc-small", text: "Sil", onclick: async () => {
        if (!(await CC.ui.confirm("Etiketi sil", `“${tag.name}” etiketi ve sohbetlere atanmış işaretleri kaldırılacak. ChatGPT sohbetleri etkilenmez.`))) return;
        await CC.repository.deleteTag(tag.id);
        const meta = await CC.repository.getChatMeta();
        for (const [id, value] of Object.entries(meta)) if ((value.tagIds || []).includes(tag.id)) await CC.repository.saveChatMeta(id, { tagIds: value.tagIds.filter((item) => item !== tag.id) });
        await CC.ui.render("organize");
      } }));
      container.append(row);
    }
    container.append(el("h3", { text: "Akıllı etiket kuralları" }), el("p", { class: "cc-muted", text: "Anahtar sözcüklerle sohbetleri otomatik etiketleyin. Kuralı kaydettikten sonra arama bölümünde kalan sohbetleri tarayın." }));
    const ruleName = el("input", { class: "cc-input", placeholder: "Etiket adı…", "aria-label": "Akıllı etiket adı" });
    const ruleKeywords = el("input", { class: "cc-input", placeholder: "Anahtar sözcükler; virgülle ayırın", "aria-label": "Kural anahtar sözcükleri" });
    const ruleColor = el("input", { class: "cc-color-input", type: "color", value: "#7dc4e4", title: "Etiket rengi", "aria-label": "Akıllı etiket rengi" });
    const saveRule = el("button", { class: "cc-button cc-primary", text: "Kural oluştur" });
    const ruleList = el("div", { class: "cc-list" });
    async function drawRules() {
      ruleList.replaceChildren();
      for (const rule of await CC.repository.getTagRules()) {
        const row = el("div", { class: "cc-item" });
        const main = el("span", { class: "cc-item-main" });
        const tag = el("span", { class: "cc-tag-badge", text: `#${rule.name}` });
        if (rule.color) tag.style.setProperty("--tag-color", rule.color);
        main.append(tag, el("span", { class: "cc-item-meta", text: (rule.keywords || []).join(" · ") }));
        row.append(main, el("button", { class: "cc-button cc-small", text: "Kuralı sil", onclick: async () => {
          if (!(await CC.ui.confirm("Akıllı etiketi sil", `“${rule.name}” otomatik kuralı silinecek. Mevcut sohbetlerdeki etiketler korunur.`))) return;
          await CC.repository.deleteTagRule(rule.id); await drawRules();
        } }));
        ruleList.append(row);
      }
      if (!ruleList.childElementCount) ruleList.append(el("p", { class: "cc-muted", text: "Henüz özel otomatik etiket kuralı yok." }));
    }
    saveRule.addEventListener("click", async () => {
      const name = ruleName.value.trim();
      const keywords = ruleKeywords.value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
      if (!name || !keywords.length) return CC.ui.toast("Etiket adı ve en az bir anahtar sözcük girin.", "error");
      const rule = { id: CC.id(), name, keywords, color: ruleColor.value, createdAt: Date.now(), updatedAt: Date.now() };
      const matchingTag = (await CC.repository.getTags()).find((item) => CC.normalize(item.name) === CC.normalize(name));
      if (!matchingTag) await CC.repository.saveTag({ id: CC.id(), name, color: rule.color, createdAt: Date.now() });
      await CC.repository.saveTagRule(rule);
      ruleName.value = ""; ruleKeywords.value = "";
      await drawRules();
      CC.ui.toast("Akıllı etiket kuralı kaydedildi. Yeniden taramada uygulanacak.");
    });
    container.append(el("div", { class: "cc-inline-form cc-rule-form" }, [ruleName, ruleKeywords, ruleColor, saveRule]), ruleList);
    await drawRules();
  }});
})();
