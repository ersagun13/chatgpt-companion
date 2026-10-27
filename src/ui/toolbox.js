(function registerToolbox() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const nav = ["home", "search", "manage", "organize", "prompts", "bookmarks", "media", "insights", "export", "settings"];
  const names = { home: "home", search: "search", manage: "manage", organize: "organize", prompts: "prompts", bookmarks: "bookmarks", media: "media", insights: "insights", export: "export", settings: "settings" };
  const icons = { home: "⌂", search: "⌕", manage: "▤", organize: "▦", prompts: "✦", bookmarks: "☆", media: "▧", insights: "◷", export: "⇧", settings: "⚙" };

  function ensure() {
    if (CC.state.host?.isConnected) return;
    const host = document.createElement("div");
    host.id = "chatgpt-companion-host";
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = chrome.runtime.getURL("src/ui/toolbox.css");
    shadow.append(css);
    const layer = CC.make("div", { class: "cc-root" });
    const button = CC.make("button", { class: "cc-fab", type: "button", text: "CC", "aria-label": "Open ChatGPT Companion", title: "ChatGPT Companion", onclick: () => CC.ui.toggle() });
    const panel = CC.make("section", { class: "cc-panel", "aria-label": "ChatGPT Companion", hidden: true });
    const head = CC.make("header", { class: "cc-head" });
    const brand = CC.make("div", { class: "cc-brand" }, [CC.make("span", { class: "cc-brand-mark", text: "CC" }), CC.make("strong", { text: "ChatGPT Companion" })]);
    const close = CC.make("button", { class: "cc-icon-button", type: "button", text: "×", "aria-label": CC.tr("close"), onclick: () => CC.ui.close() });
    const command = CC.make("button", { class: "cc-command-key", type: "button", text: "Ctrl K", "aria-label": "Komut paletini aç", onclick: () => CC.ui.openCommandPalette() });
    head.append(brand, command, close);
    const navNode = CC.make("nav", { class: "cc-nav", "aria-label": "Companion tools" });
    for (const id of nav) {
      const item = CC.features.items.get(id);
      const title = item ? CC.tr(item.titleKey || names[id], item.title || id) : CC.tr(names[id]);
      const icon = CC.make("span", { class: "cc-nav-icon", text: icons[id], "aria-hidden": "true" });
      const label = CC.make("span", { class: "cc-nav-label", text: title });
      navNode.append(CC.make("button", { class: "cc-nav-button", type: "button", "data-view": id, title, onclick: () => CC.ui.open(id) }, [icon, label]));
    }
    const folderShortcuts = CC.make("div", { class: "cc-folder-shortcuts" });
    folderShortcuts.append(CC.make("span", { class: "cc-sidebar-section-label", text: "KLASÖRLER" }));
    navNode.append(folderShortcuts);
    const content = CC.make("main", { class: "cc-content", tabindex: "-1" });
    const body = CC.make("div", { class: "cc-workspace" }, [navNode, content]);
    panel.append(head, body);
    layer.append(button, panel);
    shadow.append(layer);
    CC.state.host = host;
    CC.state.shadow = shadow;
    CC.state.layer = layer;
    CC.state.panel = panel;
    CC.state.content = content;
    CC.state.fab = button;
    CC.state.nav = navNode;
    CC.state.folderShortcuts = folderShortcuts;
    CC.state.body = body;
    CC.state.layer.dataset.theme = CC.state.theme || "midnight";
    CC.ui.render(CC.state.currentView);
    CC.ui.refreshFolderShortcuts();
  }

  CC.ui.mount = ensure;
  CC.ui.toggle = () => { ensure(); CC.state.panel.hidden = !CC.state.panel.hidden; if (!CC.state.panel.hidden) CC.ui.render(CC.state.currentView); };
  CC.ui.open = (view = "home") => { ensure(); CC.state.currentView = view; CC.state.panel.hidden = false; CC.ui.render(view); };
  CC.ui.close = () => { if (CC.state.panel) CC.state.panel.hidden = true; };
  CC.ui.getContent = () => CC.state.content;
  CC.ui.setTheme = (theme) => { CC.state.theme = theme || "midnight"; if (CC.state.layer) CC.state.layer.dataset.theme = CC.state.theme; };
  CC.ui.refreshFolderShortcuts = async () => {
    const shortcuts = CC.state.folderShortcuts;
    if (!shortcuts) return;
    const folders = (await CC.repository.getFolders().catch(() => [])).sort((a, b) => Number(b.pinned) - Number(a.pinned) || CC.normalize(a.name).localeCompare(CC.normalize(b.name), "tr"));
    if (CC.state.folderFilterId && !folders.some((folder) => folder.id === CC.state.folderFilterId)) CC.state.folderFilterId = "";
    shortcuts.replaceChildren(CC.make("span", { class: "cc-sidebar-section-label", text: "KLASÖRLER" }));
    for (const folder of folders.slice(0, 12)) {
      const button = CC.make("button", { class: `cc-folder-shortcut${CC.state.folderFilterId === folder.id ? " active" : ""}`, type: "button", title: folder.name });
      const dot = CC.make("i", { class: "cc-folder-dot" }); dot.style.setProperty("--folder-color", folder.color || "#a78bfa");
      button.append(dot, CC.make("span", { class: "cc-folder-shortcut-name", text: `${folder.parentId ? "↳ " : ""}${folder.name}` }));
      button.addEventListener("click", () => { CC.state.folderFilterId = folder.id; CC.ui.open("manage"); CC.ui.refreshFolderShortcuts(); });
      shortcuts.append(button);
    }
    if (!folders.length) shortcuts.append(CC.make("button", { class: "cc-folder-empty", type: "button", text: "Klasör oluştur", onclick: () => CC.ui.open("organize") }));
    else if (folders.length > 12) shortcuts.append(CC.make("button", { class: "cc-folder-empty", type: "button", text: `+${folders.length - 12} klasör daha`, onclick: () => CC.ui.open("organize") }));
  };
  CC.ui.toast = (message, kind = "info") => {
    if (!CC.state.shadow) return;
    const toast = CC.make("div", { class: `cc-toast cc-${kind}`, role: "status", text: message });
    CC.state.shadow.append(toast);
    setTimeout(() => toast.remove(), 3500);
  };
  CC.ui.render = async (view) => {
    if (!CC.state.content) return;
    CC.state.currentView = view;
    for (const button of CC.state.nav.querySelectorAll("[data-view]")) button.classList.toggle("active", button.dataset.view === view);
    CC.state.content.replaceChildren();
    const item = CC.features.items.get(view);
    if (!item) {
      CC.state.content.append(CC.make("h2", { text: CC.tr("home") }), CC.make("p", { class: "cc-muted", text: "Araçlar yükleniyor. Sayfayı yenileyip tekrar deneyin." }));
      return;
    }
    const viewContainer = CC.make("div", { class: "cc-view" });
    CC.state.content.append(viewContainer);
    try {
      await item.render(viewContainer);
      if (view === "organize" || view === "manage") {
        CC.ui.refreshFolderShortcuts();
        CC.pageTools?.refreshFolders?.().catch(() => {});
      }
    }
    catch (error) {
      console.error("[ChatGPT Companion] view failed", view, error);
      viewContainer.replaceChildren(CC.make("p", { class: "cc-error", text: "Bu bölüm yüklenemedi. Sayfayı yenileyip tekrar deneyin." }));
    }
  };

  CC.ui.openCommandPalette = async () => {
    ensure();
    CC.state.shadow.querySelector(".cc-command-backdrop")?.remove();
    const overlay = CC.make("div", { class: "cc-command-backdrop", role: "presentation" });
    const dialog = CC.make("section", { class: "cc-command-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Komut paleti" });
    const input = CC.make("input", { class: "cc-input cc-command-search", type: "search", placeholder: "Araç, sohbet, klasör veya istem ara…", "aria-label": "Komutları ara" });
    const items = CC.make("div", { class: "cc-command-items", role: "listbox" });
    dialog.append(input, items); overlay.append(dialog); CC.state.shadow.append(overlay);
    const entries = nav.map((id) => ({ title: CC.tr(names[id]), group: "Araçlar", run: () => CC.ui.open(id) }));
    const [prompts, folders, chats] = await Promise.all([
      CC.repository.getPrompts().catch(() => []), CC.repository.getFolders().catch(() => []), CC.repository.getHistoryCatalog().catch(() => [])
    ]);
    for (const prompt of prompts) entries.push({ title: prompt.title, group: "İstemler", run: () => { overlay.remove(); CC.ui.open("prompts"); CC.prompts?.insert(prompt); } });
    for (const folder of folders) entries.push({ title: folder.name, group: "Klasörler", run: () => { CC.state.folderFilterId = folder.id; CC.ui.open("manage"); CC.ui.refreshFolderShortcuts(); } });
    for (const chat of chats.slice(0, 100)) entries.push({ title: chat.title, group: "Sohbetler", run: () => { overlay.remove(); CC.adapter.openConversation(chat.id); } });
    let current = 0, shown = [];
    function draw() {
      const query = CC.normalize(input.value);
      shown = entries.filter((entry) => !query || CC.normalize(`${entry.title} ${entry.group}`).includes(query)).slice(0, 12);
      current = Math.min(current, Math.max(0, shown.length - 1));
      items.replaceChildren();
      for (const [index, entry] of shown.entries()) {
        const button = CC.make("button", { class: `cc-command-item${index === current ? " selected" : ""}`, type: "button", role: "option", "aria-selected": String(index === current) });
        button.append(CC.make("span", { class: "cc-command-item-title", text: entry.title }), CC.make("span", { class: "cc-command-item-group", text: entry.group }));
        button.addEventListener("click", () => { overlay.remove(); entry.run(); }); items.append(button);
      }
      if (!shown.length) items.append(CC.make("p", { class: "cc-empty", text: "Komut bulunamadı." }));
    }
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); current = Math.min(shown.length - 1, current + 1); draw(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); current = Math.max(0, current - 1); draw(); }
      else if (event.key === "Enter") { event.preventDefault(); shown[current]?.run(); overlay.remove(); }
      else if (event.key === "Escape") overlay.remove();
    });
    overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
    draw(); input.focus();
  };

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); CC.ui.openCommandPalette();
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "cc:open") { CC.ui.open(message.view || "home"); return false; }
    if (message?.type === "cc:clear-data") {
      CC.repository.clearAllLocalData().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, reason: error.message }));
      return true;
    }
    return false;
  });
})();
