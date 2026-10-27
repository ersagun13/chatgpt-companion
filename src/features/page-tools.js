(function definePageTools() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  let observer, scanTimer, activeTimer, baseline = new Set(), initialized = false, suspendCountUntil = 0, toolSettings = {}, generationStateKnown = false, wasGenerating = false, nativeFolderRoot = null, lastInteractionAt = Date.now();
  const today = () => new Date().toISOString().slice(0, 10);

  function messageNode(authorNode) { return authorNode.closest("[data-message-id]") || authorNode; }
  function messageText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll(".cc-companion-actions,.cc-message-label,.cc-message-collapse").forEach((item) => item.remove());
    return (copy.innerText || copy.textContent || "").replace(/\s+/g, " ").trim();
  }
  function messageKey(node) { return node.getAttribute("data-message-id") || `${CC.adapter.getCurrentConversationId()}:${messageText(node).slice(0, 80)}`; }
  function addActionButton(parent, text, title, action, label) {
    const button = document.createElement("button");
    button.className = "cc-page-action"; button.type = "button"; button.textContent = text; button.title = title; button.setAttribute("aria-label", title);
    button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); action(); });
    parent.append(button); return button;
  }
  function isGenerating() {
    return [...document.querySelectorAll("button")].some((button) => /stop|durdur/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-testid") || ""} ${button.title || ""}`));
  }
  function playCompletionSound() {
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      const context = new AudioContextType();
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(740, context.currentTime);
      volume.gain.setValueAtTime(0.0001, context.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.025);
      volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
      oscillator.connect(volume); volume.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.3);
      setTimeout(() => context.close().catch(() => {}), 450);
    } catch {}
  }
  function findChatSidebar() {
    return [...document.querySelectorAll("aside,[role='complementary'],nav")]
      .filter((node) => node.querySelector('a[href*="/c/"]') && node.getClientRects().length)
      .sort((left, right) => right.querySelectorAll('a[href*="/c/"]').length - left.querySelectorAll('a[href*="/c/"]').length)[0] || null;
  }
  async function renderNativeFolderTree(force = false) {
    if (toolSettings.nativeFolderShortcuts === false) { nativeFolderRoot?.remove(); nativeFolderRoot = null; return; }
    const sidebar = findChatSidebar();
    if (!sidebar) return;
    if (!force && nativeFolderRoot?.isConnected && nativeFolderRoot.parentElement === sidebar) return;
    nativeFolderRoot?.remove();
    const folders = (await CC.repository.getFolders().catch(() => [])).sort((left, right) => Number(right.pinned) - Number(left.pinned) || CC.normalize(left.name).localeCompare(CC.normalize(right.name), "tr"));
    const root = document.createElement("section"); root.className = "cc-native-folder-root"; root.setAttribute("data-cc-ui", "true");
    const heading = document.createElement("div"); heading.className = "cc-native-folder-heading"; heading.textContent = "Klasörler"; root.append(heading);
    for (const folder of folders.slice(0, 12)) {
      const button = document.createElement("button"); button.type = "button"; button.className = `cc-native-folder${CC.state.folderFilterId === folder.id ? " active" : ""}`;
      button.title = folder.name;
      const dot = document.createElement("i"); dot.className = "cc-native-folder-dot"; dot.style.backgroundColor = folder.color || "#a78bfa";
      const name = document.createElement("span"); name.className = "cc-native-folder-name"; name.textContent = `${folder.pinned ? "★ " : ""}${folder.parentId ? "↳ " : ""}${folder.name}`;
      button.append(dot, name);
      button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); CC.state.folderFilterId = folder.id; CC.ui.open("manage"); CC.ui.refreshFolderShortcuts?.(); });
      root.append(button);
    }
    const action = document.createElement("button"); action.type = "button"; action.className = "cc-native-folder-manage"; action.textContent = folders.length ? "Tüm klasörleri düzenle" : "İlk klasörü oluştur";
    action.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); CC.ui.open("organize"); });
    root.append(action); sidebar.append(root); nativeFolderRoot = root;
  }
  async function downloadAttachedAudio(audio, index) {
    const source = audio.currentSrc || audio.src;
    if (!source) return CC.ui.toast("Bu iletide indirilebilir ses bağlantısı yok.", "error");
    try {
      const response = await fetch(source, { credentials: new URL(source, location.href).origin === location.origin ? "include" : "omit" });
      if (!response.ok) throw new Error(`Ses dosyası alınamadı (${response.status}).`);
      const blob = await response.blob();
      const type = blob.type.toLowerCase();
      const extension = type.includes("mpeg") ? "mp3" : type.includes("wav") ? "wav" : type.includes("ogg") ? "ogg" : type.includes("mp4") || type.includes("m4a") ? "m4a" : "audio";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `chatgpt-ses-${index + 1}.${extension}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) { CC.ui.toast(error.message || "Ses dosyası indirilemedi.", "error"); }
  }

  async function trackUserMessage(node) {
    const key = messageKey(node);
    if (!key || Date.now() < suspendCountUntil || baseline.has(key)) return;
    baseline.add(key);
    const usage = await CC.repository.getUsage();
    const seen = new Set(usage.seenIds || []);
    if (seen.has(key)) return;
    seen.add(key); usage.seenIds = [...seen].slice(-3000);
    usage.days ||= {};
    const date = today();
    usage.days[date] ||= { messages: 0, activeMinutes: 0 };
    usage.days[date].messages++;
    usage.lastActivityAt = Date.now();
    await CC.repository.saveUsage(usage);
  }

  function addMessageTools(authorNode) {
    const node = messageNode(authorNode);
    if (node.querySelector(":scope > .cc-companion-actions")) return;
    const role = authorNode.getAttribute("data-message-author-role") || "assistant";
    const actions = document.createElement("div"); actions.className = "cc-companion-actions"; actions.setAttribute("data-cc-ui", "true");
    const wrapper = node;
    const bookmark = addActionButton(actions, "☆", "Yer imlerine ekle veya kaldır", () => CC.bookmarks.toggle(wrapper), "Yer imi");
    const label = addActionButton(actions, "Etiket", "Mesaja kısa etiket ekle veya kaldır", () => CC.bookmarks.label(wrapper), "Mesaj etiketi");
    if (role === "assistant" && typeof speechSynthesis !== "undefined") {
      addActionButton(actions, "Oku", "Yanıtı cihazın konuşma sesiyle oku", () => {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(messageText(wrapper).slice(0, 12000));
        utterance.lang = document.documentElement.lang || "tr-TR";
        utterance.voice = speechSynthesis.getVoices().find((voice) => voice.name === toolSettings.speechVoice) || null;
        speechSynthesis.speak(utterance);
      }, "Yanıtı seslendir");
    }
    for (const [index, audio] of [...wrapper.querySelectorAll("audio")].entries()) {
      addActionButton(actions, "Sesi indir", "Bu iletideki mevcut ses dosyasını indir", () => downloadAttachedAudio(audio, index), "Sesi indir");
    }
    node.append(actions);
    if (toolSettings.collapsibleMessages !== false && messageText(node).length > 1800 && !node.querySelector(":scope > .cc-message-collapse")) {
      const collapse = document.createElement("button"); collapse.type = "button"; collapse.className = "cc-message-collapse"; collapse.textContent = "İletiyi daralt";
      collapse.addEventListener("click", () => { const collapsed = node.classList.toggle("cc-message-collapsed"); collapse.textContent = collapsed ? "Tümünü göster" : "İletiyi daralt"; });
      node.append(collapse);
    }
    const existingLabelPromise = CC.repository.getMessageLabels();
    existingLabelPromise.then((labels) => {
      const id = wrapper.getAttribute("data-message-id");
      const existing = labels.find((item) => item.conversationId === CC.adapter.getCurrentConversationId() && item.messageId === id);
      if (existing && !wrapper.querySelector(":scope > .cc-message-label")) {
        const pill = document.createElement("span"); pill.className = "cc-message-label"; pill.textContent = existing.text; wrapper.prepend(pill);
      }
      if (labels.some((item) => item.conversationId === CC.adapter.getCurrentConversationId() && item.messageId === id)) label.textContent = "Etiket ✓";
    }).catch(() => {});
    CC.repository.getBookmarks().then((items) => {
      const id = wrapper.getAttribute("data-message-id");
      if (items.some((item) => item.conversationId === CC.adapter.getCurrentConversationId() && item.messageId === id)) bookmark.textContent = "★";
    }).catch(() => {});
    if (role === "user") trackUserMessage(wrapper).catch(() => {});
  }

  function attachComposerTools() {
    const input = CC.prompts?.composer?.();
    if (!input) return;
    const form = input.closest("form") || input.parentElement;
    if (!form) return;
    if (toolSettings.contextEstimate !== false && !form.querySelector(":scope > .cc-context-meter")) {
      const meter = document.createElement("div"); meter.className = "cc-context-meter"; meter.textContent = "Bağlam: yaklaşık 0 token";
      form.append(meter);
    }
    if (toolSettings.contextEstimate === false) form.querySelector(".cc-context-meter")?.remove();
    if (toolSettings.wordCounter !== false && !form.querySelector(":scope > .cc-live-counter")) {
      const counter = document.createElement("div"); counter.className = "cc-live-counter"; counter.textContent = "0 sözcük · 0 karakter";
      form.append(counter);
    }
    if (toolSettings.wordCounter === false) form.querySelector(".cc-live-counter")?.remove();
    const current = CC.prompts.readComposer();
    const words = current.trim() ? current.trim().split(/\s+/).length : 0;
    const counter = toolSettings.wordCounter === false ? null : form.querySelector(".cc-live-counter");
    if (counter) counter.textContent = `${words} sözcük · ${current.length} karakter`;
  }

  async function updateContextMeter() {
    const settings = await CC.repository.getSettings();
    if (settings.contextEstimate === false) return;
    const form = CC.prompts?.composer?.()?.closest("form");
    const meter = form?.querySelector(".cc-context-meter");
    if (!meter) return;
    const text = [...document.querySelectorAll('[data-message-author-role]')].map((node) => node.innerText || "").join(" ");
    const tokens = Math.ceil(text.length / 4);
    const nextText = `Bağlam tahmini: ~${tokens.toLocaleString("tr-TR")} token · görünen iletiler`;
    if (meter.textContent !== nextText) meter.textContent = nextText;
  }

  function handleComposerInput(event) {
    const input = event.target;
    if (!input.matches?.('textarea,[contenteditable="true"],[role="textbox"]')) return;
    const value = input.isContentEditable ? input.innerText || "" : input.value || "";
    const form = input.closest("form") || input.parentElement;
    const counter = form?.querySelector(".cc-live-counter");
    if (counter) counter.textContent = `${value.trim() ? value.trim().split(/\s+/).length : 0} sözcük · ${value.length} karakter`;
    if (value.endsWith("//")) {
      CC.prompts.writeComposer(value.slice(0, -2)); CC.prompts.openPicker();
    } else if (value.endsWith("@@")) {
      CC.prompts.writeComposer(value.slice(0, -2)); CC.prompts.openContextPicker();
    }
  }

  async function baselineCurrentMessages() {
    suspendCountUntil = Date.now() + 1600;
    await CC.sleep(1300);
    baseline = new Set([...document.querySelectorAll('[data-message-author-role]')].map((node) => messageKey(messageNode(node))));
    suspendCountUntil = 0;
  }

  CC.pageTools = {
    refreshFolders() { return renderNativeFolderTree(true); },
    init() {
      if (initialized) return;
      initialized = true;
      baseline = new Set([...document.querySelectorAll('[data-message-author-role]')].map((node) => messageKey(messageNode(node))));
      const scan = () => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
          const generating = isGenerating();
          if (generationStateKnown && wasGenerating && !generating && toolSettings.soundAlert) playCompletionSound();
          generationStateKnown = true; wasGenerating = generating;
          for (const node of document.querySelectorAll('[data-message-author-role]')) addMessageTools(node);
          attachComposerTools(); updateContextMeter().catch(() => {});
          renderNativeFolderTree().catch(() => {});
        }, 250);
      };
      CC.repository.getSettings().then((settings) => { toolSettings = settings; scan(); }).catch(() => {});
      observer = new MutationObserver(scan);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener("input", handleComposerInput, true);
      for (const eventName of ["pointerdown", "keydown", "scroll"]) document.addEventListener(eventName, () => { lastInteractionAt = Date.now(); }, { passive: true, capture: true });
      document.addEventListener("cc:settings-changed", (event) => { toolSettings = { ...toolSettings, ...(event.detail || {}) }; scan(); });
      window.addEventListener("popstate", () => { baselineCurrentMessages(); });
      scan(); baselineCurrentMessages();
      activeTimer = setInterval(async () => {
        if (document.visibilityState !== "visible" || Date.now() - lastInteractionAt > 60000) return;
        const usage = await CC.repository.getUsage();
        usage.days ||= {}; usage.days[today()] ||= { messages: 0, activeMinutes: 0 };
        usage.days[today()].activeMinutes++;
        await CC.repository.saveUsage(usage);
      }, 60000);
    }
  };
})();
