(function definePageTools() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  let observer, scanTimer, activeTimer, baseline = new Set(), initialized = false, suspendCountUntil = 0, toolSettings = {}, generationStateKnown = false, wasGenerating = false, nativeFolderRoot = null, lastInteractionAt = Date.now(), titleRestoreTimer = null;
  const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

  function messageNode(authorNode) { return authorNode.closest("[data-message-id]") || authorNode; }
  function messageText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll(".cc-companion-actions,.cc-message-label,.cc-message-collapse").forEach((item) => item.remove());
    return (copy.innerText || copy.textContent || "").replace(/\s+/g, " ").trim();
  }
  function messageBodyText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll(".cc-companion-actions,.cc-message-label,.cc-message-collapse").forEach((item) => item.remove());
    return (copy.innerText || copy.textContent || "").replace(/\r/g, "").replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
      const tones = { soft: [523], chime: [660, 880], bell: [880, 1175, 880] }[toolSettings.soundPattern] || [660, 880];
      const level = Math.max(0.005, Math.min(0.18, Number(toolSettings.soundVolume ?? 35) / 100 * 0.18));
      const startAt = context.currentTime + 0.015;
      tones.forEach((frequency, index) => {
        const oscillator = context.createOscillator(), volume = context.createGain();
        const begins = startAt + index * 0.14;
        oscillator.type = "sine"; oscillator.frequency.setValueAtTime(frequency, begins);
        volume.gain.setValueAtTime(0.0001, begins);
        volume.gain.exponentialRampToValueAtTime(level, begins + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.0001, begins + 0.18);
        oscillator.connect(volume); volume.connect(context.destination);
        oscillator.start(begins); oscillator.stop(begins + 0.2);
      });
      setTimeout(() => context.close().catch(() => {}), tones.length * 160 + 350);
    } catch {}
  }
  function markTabTitle() {
    if (!document.hidden || toolSettings.tabTitleAlert === false) return;
    const title = document.title.replace(/^🔔\s*/, "");
    document.title = `🔔 ${title}`;
    clearTimeout(titleRestoreTimer);
    titleRestoreTimer = setTimeout(() => { document.title = document.title.replace(/^🔔\s*/, ""); }, 12000);
  }
  function updateComposerCount(value, form) {
    const counter = form?.querySelector(".cc-live-counter");
    if (!counter) return;
    const text = String(value || "");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = text.split(/[.!?。！？]+/).filter((part) => part.trim()).length;
    const readingMinutes = words ? Math.max(1, Math.ceil(words / 220)) : 0;
    counter.textContent = `${words} sözcük · ${text.length} karakter · ${sentences} cümle · ~${readingMinutes} dk okuma`;
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
    const folders = (await CC.repository.getFolders().catch(() => [])).sort((left, right) => Number(right.pinned) - Number(left.pinned) || String(left.parentId || "").localeCompare(String(right.parentId || "")) || (Number(left.position) || 0) - (Number(right.position) || 0) || CC.normalize(left.name).localeCompare(CC.normalize(right.name), "tr"));
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
    if (role === "assistant" && CC.prompts?.handoffRequestedForCurrentConversation?.()) {
      addActionButton(actions, "Yeni sohbete taslak olarak taşı", "Bu devir yanıtını gözden geçirip yeni sohbet mesaj alanına taslak olarak aktar", () => {
        if (isGenerating()) return CC.ui.toast("Yanıt hâlâ hazırlanıyor. Tamamlanmasını bekleyip yeniden deneyin.", "error");
        CC.prompts.carryAnswerToNewConversation(messageBodyText(wrapper), CC.adapter.getCurrentConversationTitle?.() || "Önceki sohbet");
      }, "Devir yanıtını taşı");
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
        const pill = document.createElement("span"); pill.className = "cc-message-label"; pill.textContent = existing.text; pill.style.setProperty("--message-label-color", existing.color || "#c6a0f6");
        if (existing.note) pill.title = existing.note;
        wrapper.prepend(pill);
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
      const meter = document.createElement("div"); meter.className = "cc-context-meter";
      const track = document.createElement("span"); track.className = "cc-context-track";
      const fill = document.createElement("i"); fill.className = "cc-context-fill"; track.append(fill);
      const caption = document.createElement("span"); caption.className = "cc-context-caption"; caption.textContent = "Bağlam tahmini yükleniyor…";
      meter.append(track, caption); meter.title = "Yaklaşık karakter tabanlı hesap; ChatGPT'nin gizli talimatları ve gerçek token sayısı görülmez.";
      form.append(meter);
    }
    if (toolSettings.contextEstimate === false) form.querySelector(".cc-context-meter")?.remove();
    if (!form.querySelector(":scope > .cc-handoff-row")) {
      const row = document.createElement("div"); row.className = "cc-handoff-row";
      const button = document.createElement("button"); button.type = "button"; button.className = "cc-handoff-shortcut"; button.textContent = "Devir özeti";
      button.title = "Eski sohbetten yapılandırılmış bir devir özeti istemi hazırlar; mesajı otomatik göndermez.";
      button.addEventListener("click", () => CC.prompts.prepareHandoffSummary());
      row.append(button); form.append(row);
    }
    const handoffButton = form.querySelector(".cc-handoff-shortcut");
    if (handoffButton && handoffButton.hidden !== !CC.adapter.getCurrentConversationId()) handoffButton.hidden = !CC.adapter.getCurrentConversationId();
    if (toolSettings.wordCounter !== false && !form.querySelector(":scope > .cc-live-counter")) {
      const counter = document.createElement("div"); counter.className = "cc-live-counter"; counter.textContent = "0 sözcük · 0 karakter";
      form.append(counter);
    }
    if (toolSettings.wordCounter === false) form.querySelector(".cc-live-counter")?.remove();
    updateComposerCount(CC.prompts.readComposer(), form);
  }

  async function updateContextMeter() {
    const settings = await CC.repository.getSettings();
    const form = CC.prompts?.composer?.()?.closest("form");
    const handoffButton = form?.querySelector(".cc-handoff-shortcut");
    const hasConversation = Boolean(CC.adapter.getCurrentConversationId());
    if (handoffButton && handoffButton.hidden !== !hasConversation) handoffButton.hidden = !hasConversation;
    if (settings.contextEstimate === false) {
      if (handoffButton && handoffButton.textContent !== "Devir özeti") handoffButton.textContent = "Devir özeti";
      if (handoffButton) delete handoffButton.dataset.recommended;
      return;
    }
    const meter = form?.querySelector(".cc-context-meter");
    if (!meter) return;
    const text = [...document.querySelectorAll('[data-message-author-role]')].map(messageText).join(" ");
    const tokens = Math.ceil(text.length / 4);
    const target = Math.max(1000, Number(settings.contextTarget) || 128000);
    const percent = Math.min(100, Math.round(tokens / target * 100));
    const fill = meter.querySelector(".cc-context-fill"), caption = meter.querySelector(".cc-context-caption");
    if (fill && fill.style.width !== `${percent}%`) fill.style.width = `${percent}%`;
    const messageCount = document.querySelectorAll('[data-message-author-role]').length;
    const captionText = `Bağlam tahmini: ~${tokens.toLocaleString("tr-TR")} / ${target.toLocaleString("tr-TR")} token · yaklaşık %${percent} · ${messageCount} görünür ileti`;
    if (caption && caption.textContent !== captionText) caption.textContent = captionText;
    if (handoffButton) {
      const recommended = percent >= 70;
      const label = recommended ? "Devir özeti önerilir" : "Devir özeti";
      if (handoffButton.textContent !== label) handoffButton.textContent = label;
      if (handoffButton.dataset.recommended !== String(recommended)) handoffButton.dataset.recommended = String(recommended);
    }
  }

  function handleComposerInput(event) {
    const input = event.target;
    if (!input.matches?.('textarea,[contenteditable="true"],[role="textbox"]')) return;
    const value = input.isContentEditable ? input.innerText || "" : input.value || "";
    const form = input.closest("form") || input.parentElement;
    updateComposerCount(value, form);
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
    previewSound() { playCompletionSound(); },
    init() {
      if (initialized) return;
      initialized = true;
      baseline = new Set([...document.querySelectorAll('[data-message-author-role]')].map((node) => messageKey(messageNode(node))));
      const scan = () => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
          const generating = isGenerating();
          if (generationStateKnown && wasGenerating && !generating) {
            if (toolSettings.soundAlert && (toolSettings.alertOnlyBackground === false || document.hidden)) playCompletionSound();
            markTabTitle();
          }
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
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && document.title.startsWith("🔔 ")) {
          clearTimeout(titleRestoreTimer); document.title = document.title.replace(/^🔔\s*/, "");
        }
      });
      for (const eventName of ["pointerdown", "keydown", "scroll"]) document.addEventListener(eventName, () => { lastInteractionAt = Date.now(); }, { passive: true, capture: true });
      document.addEventListener("cc:settings-changed", (event) => { toolSettings = { ...toolSettings, ...(event.detail || {}) }; scan(); });
      window.addEventListener("popstate", () => { baselineCurrentMessages(); });
      scan(); baselineCurrentMessages();
      activeTimer = setInterval(async () => {
        if (document.visibilityState !== "visible" || Date.now() - lastInteractionAt > 60000) return;
        const usage = await CC.repository.getUsage();
        usage.days ||= {}; usage.days[today()] ||= { messages: 0, activeMinutes: 0 };
        usage.days[today()].activeMinutes++;
        usage.days[today()].activeHours ||= {};
        const hour = String(new Date().getHours());
        usage.days[today()].activeHours[hour] = (usage.days[today()].activeHours[hour] || 0) + 1;
        await CC.repository.saveUsage(usage);
      }, 60000);
    }
  };
})();
