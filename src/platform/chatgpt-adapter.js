(function defineChatGPTAdapter() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  let stopHistoryScanRequested = false;
  const conversationIdFrom = (href) => {
    try { return new URL(href, location.origin).pathname.match(/\/c\/([^/]+)/)?.[1] || null; }
    catch { return null; }
  };
  const supportedActions = new Set(["archive", "unarchive", "delete"]);
  const archiveDialogWords = ["archived chats", "archived chat", "archived conversations", "view archived chats", "arşivlenmiş sohbetler", "arsivlenmis sohbetler"];
  const visibleNodes = (selector, root = document) => [...root.querySelectorAll(selector)].filter((node) => node.getClientRects().length > 0);
  const archiveDialog = () => visibleNodes('[role="dialog"]').find((node) => archiveDialogWords.some((word) => CC.normalize(`${node.getAttribute("aria-label") || ""} ${node.innerText}`).includes(CC.normalize(word)))) || null;
  const historyRoot = () => {
    const archived = archiveDialog();
    if (archived) return archived;
    const flyouts = visibleNodes('[role="dialog"], [role="listbox"], [data-testid*="history"]')
      .filter((node) => node.querySelector('a[href*="/c/"]'));
    if (flyouts.length) return flyouts.sort((left, right) => right.querySelectorAll('a[href*="/c/"]').length - left.querySelectorAll('a[href*="/c/"]').length)[0];
    const navs = visibleNodes('aside nav, nav[aria-label], aside').filter((node) => node.querySelector('a[href*="/c/"]'));
    const namedHistory = navs.find((node) => /history|chat history|sohbet gecmisi/.test(CC.normalize(node.getAttribute("aria-label") || "")));
    if (namedHistory) return namedHistory;
    return navs.sort((left, right) => right.querySelectorAll('a[href*="/c/"]').length - left.querySelectorAll('a[href*="/c/"]').length)[0] || null;
  };
  function labelIsMoreHistory(node) {
    const labels = [node.getAttribute("aria-label"), node.getAttribute("title"), node.textContent]
      .map((value) => CC.normalize(value || ""));
    const phrases = ["show more", "show more chats", "show more conversations", "see more", "see more chats", "see more conversations", "see all", "see all conversations", "show all", "show all conversations", "view all", "view all chats", "view all conversations", "all conversations", "all chats", "load more", "load more chats", "daha fazla göster", "daha fazla sohbet", "daha fazla sohbet göster", "tüm sohbetler", "tüm sohbetleri göster", "tüm geçmişi göster"].map((phrase) => CC.normalize(phrase));
    return labels.some((label) => phrases.includes(label));
  }
  function isAllHistoryControl(node) {
    const labels = [node.getAttribute("aria-label"), node.getAttribute("title"), node.textContent]
      .map((value) => CC.normalize(value || ""));
    const phrases = ["see all", "see all conversations", "show all", "show all conversations", "view all", "view all chats", "view all conversations", "all conversations", "all chats", "tüm sohbetler", "tüm sohbetleri göster", "tüm geçmişi göster"].map((phrase) => CC.normalize(phrase));
    return labels.some((label) => phrases.includes(label));
  }
  function findMoreHistoryButton(root = document) {
    return visibleNodes('button, [role="button"], a', root).find(labelIsMoreHistory) || null;
  }
  function clickableLabel(node) { return clean(`${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""} ${node.textContent || ""}`).toLocaleLowerCase(); }
  function findHistoryRetryButton(root = document) {
    const retryLabels = ["try again", "retry", "reload history", "yeniden dene", "tekrar dene", "gecmisi yeniden yukle", "gecmisi tekrar yukle"];
    return visibleNodes('button, [role="button"]', root).find((node) => {
      const labels = [node.getAttribute("aria-label"), node.getAttribute("title"), node.textContent].map((value) => CC.normalize(value || ""));
      return labels.some((label) => retryLabels.includes(label));
    }) || null;
  }
  function findChatAnchor(id) {
    return visibleNodes('a[href*="/c/"]').find((anchor) => conversationIdFrom(anchor.href) === id) || null;
  }
  function conversationScrollBox() {
    const main = document.querySelector("main");
    const candidates = main ? [...main.querySelectorAll("*")].filter((node) =>
      node.scrollHeight > node.clientHeight + 100 && node.querySelector('[data-message-author-role]')) : [];
    candidates.sort((left, right) => left.clientHeight - right.clientHeight);
    if (candidates[0]) return candidates[0];
    if (main?.scrollHeight > main.clientHeight + 100) return main;
    const page = document.scrollingElement;
    return page?.scrollHeight > page?.clientHeight + 100 ? page : null;
  }
  function waitUntil(predicate, timeout = 5000, interval = 120) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        let value = null;
        try { value = predicate(); } catch {}
        if (value || Date.now() - started >= timeout) { clearInterval(timer); resolve(value || null); }
      }, interval);
    });
  }
  function historyTimestamp(value) {
    if (value === undefined || value === null || value === "") return null;
    const numeric = typeof value === "number" ? value : Number(value);
    const date = Number.isFinite(numeric) && numeric > 0
      ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric)
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  function historyPageItems(payload) {
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.conversations)) return payload.conversations;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    throw new Error("ChatGPT geçmiş yanıtı tanınmadı.");
  }
  function normalizeHistoryItem(item, archivedFallback) {
    const id = typeof item?.id === "string" ? item.id : typeof item?.conversation_id === "string" ? item.conversation_id : null;
    if (!id || !/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
    const title = clean(item.title || item.name || "Başlıksız sohbet").slice(0, 240) || "Başlıksız sohbet";
    const archivedValue = item.is_archived ?? item.archived;
    return {
      id,
      title,
      url: `/c/${encodeURIComponent(id)}`,
      createdAt: historyTimestamp(item.create_time ?? item.created_at ?? item.createdAt),
      updatedAt: historyTimestamp(item.update_time ?? item.updated_at ?? item.updatedAt),
      archived: archivedValue === true || archivedValue === 1 ? true : archivedValue === false || archivedValue === 0 ? false : archivedFallback,
      pinned: Boolean(item.is_starred ?? item.is_pinned ?? item.pinned)
    };
  }
  async function readAccountAccessToken() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL("/api/auth/session", location.origin).href, {
        method: "GET", credentials: "include", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal
      });
      if (!response.ok) return null;
      const session = await response.json();
      const token = session?.accessToken || session?.access_token;
      return typeof token === "string" && token.length > 20 ? token : null;
    } catch { return null; }
    finally { clearTimeout(timeout); }
  }
  async function requestChatAction(id, action) {
    if (!/^[A-Za-z0-9_-]{6,}$/.test(id || "")) return { ok: false, reason: "Sohbet kimliği geçersiz." };
    const endpoint = new URL(`/backend-api/conversation/${encodeURIComponent(id)}`, location.origin);
    const body = action === "delete" ? { is_visible: false }
      : action === "archive" ? { is_archived: true }
      : { is_archived: false };
    if (action === "delete") {
      endpoint.searchParams.set("content_action", "delete");
      endpoint.searchParams.set("s", "true");
    }

    let accessToken = await readAccountAccessToken();
    let refreshedToken = false;
    let rateLimitRetries = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const headers = {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Extension-Request": "1"
        };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const response = await fetch(endpoint.href, {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (response.ok) return { ok: true };
        if (response.status === 401 && !refreshedToken) {
          refreshedToken = true;
          accessToken = await readAccountAccessToken();
          continue;
        }
        if (response.status === 429 || response.status >= 500) {
          if (rateLimitRetries >= 2) return { ok: false, reason: `ChatGPT işlemi geçici olarak reddetti (${response.status}).` };
          const retryAfter = Number(response.headers.get("retry-after")) * 1000;
          const fallbackDelay = response.status === 429 ? 1800 : [700, 1500][rateLimitRetries];
          rateLimitRetries++;
          await CC.sleep(Math.min(Math.max(retryAfter || fallbackDelay, 500), 15000));
          continue;
        }
        if (response.status === 404) return { ok: false, reason: "ChatGPT bu sohbeti bulamadı (404). Listeyi yenileyip tekrar deneyin." };
        return { ok: false, reason: `ChatGPT işlemi tamamlayamadı (${response.status}).` };
      } catch (error) {
        if (attempt >= 3) return { ok: false, reason: error?.name === "AbortError" ? "ChatGPT yanıt vermedi; işlem tamamlanmadı." : "ChatGPT’ye bağlanılamadı; işlem tamamlanmadı." };
        await CC.sleep([700, 1500, 2500][Math.min(attempt, 2)]);
      } finally { clearTimeout(timeout); }
    }
    return { ok: false, reason: "ChatGPT işlemi tamamlanamadı." };
  }
  function collectText(value, output = []) {
    if (typeof value === "string") { output.push(value); return output; }
    if (Array.isArray(value)) { for (const item of value) collectText(item, output); return output; }
    if (value && typeof value === "object") {
      if (typeof value.text === "string") output.push(value.text);
      else if (Array.isArray(value.parts)) collectText(value.parts, output);
    }
    return output;
  }
  function collectImageUrls(value, output = new Set()) {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value) && /\.(png|jpe?g|gif|webp|avif)(\?|$)|image|files\/|assets\//i.test(value)) output.add(value);
      return output;
    }
    if (Array.isArray(value)) { for (const item of value) collectImageUrls(item, output); return output; }
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) if (/url|image|asset|download/i.test(key)) collectImageUrls(item, output);
    }
    return output;
  }
  async function fetchConversationForIndex(id) {
    if (!/^[A-Za-z0-9_-]{6,}$/.test(id || "")) throw new Error("Sohbet kimliği geçersiz.");
    const url = new URL(`/backend-api/conversation/${encodeURIComponent(id)}?s=true`, location.origin);
    let accessToken = await readAccountAccessToken();
    let refreshedToken = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const headers = { Accept: "application/json", "X-Extension-Request": "1" };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const response = await fetch(url.href, { credentials: "include", cache: "no-store", headers, signal: controller.signal });
        if (response.status === 401 && !refreshedToken) { refreshedToken = true; accessToken = await readAccountAccessToken(); continue; }
        if (response.status === 429 || response.status >= 500) {
          if (attempt >= 3) throw new Error(`ChatGPT sohbeti yükleyemedi (${response.status}).`);
          const retryAfter = Number(response.headers.get("retry-after")) * 1000;
          await CC.sleep(Math.min(Math.max(retryAfter || (800 * (attempt + 1)), 600), 15000));
          continue;
        }
        if (!response.ok) { const error = new Error(`ChatGPT sohbeti yükleyemedi (${response.status}).`); error.status = response.status; throw error; }
        const payload = await response.json();
        const mapping = payload?.mapping && typeof payload.mapping === "object" ? Object.values(payload.mapping) : [];
        const messages = mapping.map((node) => node?.message).filter((message) => message && ["user", "assistant"].includes(message.author?.role))
          .map((message) => {
            const parts = message.content?.parts ?? message.content;
            return {
              id: String(message.id || `${id}-${message.create_time || Math.random()}`),
              conversationId: id,
              title: clean(payload.title || "Başlıksız sohbet").slice(0, 240),
              role: message.author.role,
              text: collectText(parts).join("\n").trim(),
              images: [...collectImageUrls(message.content)],
              timestamp: historyTimestamp(message.create_time)
            };
          }).filter((message) => message.text || message.images.length)
          .sort((left, right) => (Date.parse(left.timestamp || "") || 0) - (Date.parse(right.timestamp || "") || 0));
        return { id, title: clean(payload.title || "Başlıksız sohbet").slice(0, 240), messages };
      } catch (error) {
        if (error?.status || attempt >= 3) throw error;
        await CC.sleep([700, 1400, 2500][attempt]);
      } finally { clearTimeout(timeout); }
    }
    throw new Error("Sohbet içeriği alınamadı.");
  }
  async function requestHistoryPage(offset, limit, archived, accessToken) {
    const url = new URL("/backend-api/conversations", location.origin);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("order", "updated");
    url.searchParams.set("is_archived", String(archived));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = { Accept: "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const response = await fetch(url.href, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers,
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`ChatGPT geçmişi alınamadı (${response.status}).`);
        error.status = response.status;
        error.retryAfter = Number(response.headers.get("retry-after")) || 0;
        throw error;
      }
      const payload = await response.json();
      const total = payload?.total === null || payload?.total === undefined ? null : Number(payload.total);
      return { items: historyPageItems(payload), total: Number.isFinite(total) ? total : null, hasMore: typeof payload?.has_more === "boolean" ? payload.has_more : null };
    } finally { clearTimeout(timeout); }
  }
  async function collectHistoryFromAccount(max, onProgress, shouldStop) {
    const limit = 28;
    const maxPages = Math.ceil(max / limit) + 2;
    const records = new Map();
    let pages = 0;
    let reachedEnd = true;
    let stopped = false;
    let accessToken = await readAccountAccessToken();
    try {
      for (const archived of [false, true]) {
        if (shouldStop?.()) { stopped = true; reachedEnd = false; break; }
        let offset = 0;
        let archivePages = 0;
        while (records.size < max && archivePages < maxPages) {
          if (shouldStop?.()) { stopped = true; reachedEnd = false; break; }
          let page;
          let lastError;
          let refreshedToken = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              page = await requestHistoryPage(offset, limit, archived, accessToken);
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              if (error.status === 401 && !refreshedToken) {
                refreshedToken = true;
                accessToken = await readAccountAccessToken();
                if (accessToken) { attempt--; continue; }
              }
              if (![429, 500, 502, 503, 504].includes(error.status) || attempt === 2) break;
              const retryDelay = Math.max(error.retryAfter * 1000, [700, 1600, 3200][attempt]);
              await CC.sleep(Math.min(retryDelay, 8000));
            }
          }
          if (lastError) throw lastError;
          const items = page.items;
          const previousCount = records.size;
          for (const item of items) {
            const record = normalizeHistoryItem(item, archived);
            if (record) records.set(record.id, record);
          }
          pages++;
          archivePages++;
          onProgress?.({ count: records.size, step: pages, maxScrolls: maxPages, expanded: true, retrying: false, source: "account" });
          if (!items.length || page.hasMore === false || (page.total !== null && offset + items.length >= page.total) || (page.total === null && items.length < limit)) break;
          if (records.size === previousCount) { reachedEnd = false; break; }
          offset += items.length;
          if (archivePages === maxPages) reachedEnd = false;
          await CC.sleep(120);
        }
        if (stopped) break;
        if (records.size >= max || archivePages >= maxPages) reachedEnd = false;
      }
    } catch (error) {
      error.partialRecords = [...records.values()];
      error.partialPages = pages;
      accessToken = null;
      throw error;
    }
    accessToken = null;
    return { records: [...records.values()].slice(0, max), pages, reachedEnd, stalled: false, stopped };
  }
  CC.adapter = {
    isSupportedPage() { return location.hostname === "chatgpt.com"; },
    getCurrentConversationId() { return location.pathname.match(/\/c\/([^/]+)/)?.[1] || null; },
    getCurrentConversationTitle() {
      const id = this.getCurrentConversationId();
      if (!id) return null;
      const titleNode = document.querySelector("main h1") || document.querySelector("header h1");
      const anchor = findChatAnchor(id);
      return (clean(titleNode?.textContent || anchor?.textContent || document.title.replace(/\s*[-|].*$/, "")) || "ChatGPT conversation").slice(0, 240);
    },
    listVisibleChats() {
      const archived = archiveDialog();
      const archivedView = Boolean(archived);
      const scope = archived || historyRoot() || document;
      const found = new Map();
      for (const anchor of visibleNodes('a[href*="/c/"]', scope)) {
        const id = conversationIdFrom(anchor.href);
        const title = clean(anchor.innerText || anchor.textContent);
        if (!id || !title || title === "ChatGPT") continue;
        found.set(id, { id, title: title.slice(0, 240), url: new URL(anchor.href, location.origin).pathname, updatedAt: undefined, archived: archivedView });
      }
      return [...found.values()];
    },
    async collectVisibleChats({ max = 50000, maxScrolls = 500, onProgress, shouldStop } = {}) {
      stopHistoryScanRequested = false;
      const isStopped = () => stopHistoryScanRequested || Boolean(shouldStop?.());
      let apiError = null;
      let apiPartialRecords = [];
      try {
        const accountHistory = await collectHistoryFromAccount(max, onProgress, isStopped);
        const merged = new Map(accountHistory.records.map((item) => [item.id, item]));
        for (const item of this.listVisibleChats()) {
          const previous = merged.get(item.id);
          merged.set(item.id, { ...previous, ...item, createdAt: item.createdAt ?? previous?.createdAt, updatedAt: item.updatedAt ?? previous?.updatedAt });
        }
        this.lastHistoryLoad = { count: merged.size, expanded: true, reachedEnd: accountHistory.reachedEnd, stalled: accountHistory.stalled, retrying: false, source: "account", pages: accountHistory.pages, stopped: accountHistory.stopped };
        return [...merged.values()].slice(0, max);
      } catch (error) {
        apiError = error;
        apiPartialRecords = Array.isArray(error.partialRecords) ? error.partialRecords : [];
      }
      if (isStopped()) {
        const chats = [...new Map([...apiPartialRecords, ...this.listVisibleChats()].map((item) => [item.id, item])).values()];
        this.lastHistoryLoad = { count: chats.length, expanded: false, reachedEnd: false, stalled: false, stopped: true, retrying: false, source: "account", apiError: apiError?.message };
        return chats;
      }
      let expanded = false;
      let root = historyRoot();
      const controlScope = () => {
        root = historyRoot() || root;
        return root?.closest("aside") || root?.parentElement || root || document;
      };
      const expander = findMoreHistoryButton(controlScope());
      if (expander && isAllHistoryControl(expander)) {
        expander.click(); expanded = true;
        await CC.sleep(400);
        root = historyRoot() || root;
      }
      if (!root) {
        const chats = [...new Map([...apiPartialRecords, ...this.listVisibleChats()].map((item) => [item.id, item])).values()];
        this.lastHistoryLoad = { count: chats.length, expanded, reachedEnd: false, stalled: true, retrying: false, source: "ui", apiError: apiError?.message };
        return chats;
      }
      const candidates = [root, ...root.querySelectorAll("*")].filter((node) => node.scrollHeight > node.clientHeight + 80 && node.querySelector('a[href*="/c/"]'));
      candidates.sort((left, right) => left.clientHeight - right.clientHeight);
      const scrollBox = candidates[0] || root;
      const originalTop = scrollBox.scrollTop || 0;
      const chats = new Map(this.listVisibleChats().map((item) => [item.id, item]));
      for (const item of apiPartialRecords) chats.set(item.id, { ...chats.get(item.id), ...item });
      let step = 0, pageRetries = 0, reachedEnd = false, stalled = false, retrying = false, stopped = false;
      const addVisible = () => {
        for (const item of this.listVisibleChats()) chats.set(item.id, { ...chats.get(item.id), ...item });
      };
      const waitForPage = async (previousCount) => waitUntil(() => {
        if (isStopped()) return { kind: "stopped" };
        const controls = controlScope();
        addVisible();
        if (chats.size > previousCount) return { kind: "loaded" };
        const retry = findHistoryRetryButton(controls);
        if (retry) return { kind: "retry", button: retry };
        return null;
      }, 12000, 200).then((result) => {
        const controls = controlScope();
        if (result) return result;
        addVisible();
        const loading = root.querySelector('[aria-busy="true"]') || /loading|yukleniyor|gecmis yukleniyor/.test(CC.normalize(root.innerText || ""));
        return !findMoreHistoryButton(controls) && !findHistoryRetryButton(controls) && !loading ? { kind: "end" } : null;
      });
      try {
        scrollBox.scrollTop = 0;
        await CC.sleep(200);
        addVisible();
        onProgress?.({ count: chats.size, step, maxScrolls, expanded, retrying });
        for (; step < maxScrolls && chats.size < max; step++) {
          if (isStopped()) { stopped = true; break; }
          const controls = controlScope();
          addVisible();
          const retryButton = findHistoryRetryButton(controls);
          if (retryButton) {
            if (pageRetries >= 3) { stalled = true; break; }
            retrying = true;
            const beforeCount = chats.size;
            retryButton.click();
            await CC.sleep([700, 1400, 2800][pageRetries]);
            pageRetries++;
            const result = await waitForPage(beforeCount);
            addVisible();
            onProgress?.({ count: chats.size, step: step + 1, maxScrolls, expanded, retrying });
            if (result?.kind === "stopped") { stopped = true; break; }
            if (chats.size > beforeCount) { pageRetries = 0; retrying = false; continue; }
            if (result?.kind === "end") { reachedEnd = true; retrying = false; break; }
            continue;
          }
          retrying = false;
          const atBottom = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 4;
          const more = atBottom ? findMoreHistoryButton(controlScope()) : null;
          if (more) {
            const beforeCount = chats.size;
            more.click(); expanded = true;
            const result = await waitForPage(beforeCount);
            addVisible();
            onProgress?.({ count: chats.size, step: step + 1, maxScrolls, expanded, retrying });
            if (result?.kind === "stopped") { stopped = true; break; }
            if (chats.size > beforeCount) { pageRetries = 0; continue; }
            if (result?.kind === "retry") { pageRetries = 0; continue; }
            if (result?.kind === "end") { reachedEnd = true; break; }
            if (++pageRetries >= 3) { stalled = true; break; }
            await CC.sleep([700, 1400, 2800][Math.min(pageRetries - 1, 2)]);
            continue;
          }
          if (atBottom) { reachedEnd = true; break; }
          const beforeTop = scrollBox.scrollTop;
          scrollBox.scrollTop = Math.min(scrollBox.scrollHeight, beforeTop + Math.max(260, Math.floor(scrollBox.clientHeight * 0.75)));
          await CC.sleep(250);
          addVisible();
          if (scrollBox.scrollTop === beforeTop && chats.size === 0) { stalled = true; break; }
          if (step % 5 === 0) onProgress?.({ count: chats.size, step: step + 1, maxScrolls, expanded, retrying });
        }
      } finally { scrollBox.scrollTop = originalTop; }
      this.lastHistoryLoad = { count: chats.size, expanded, reachedEnd, stalled, stopped, retrying, source: "ui", apiError: apiError?.message };
      return [...chats.values()].slice(0, max);
    },
    async readCurrentConversation() {
      const id = this.getCurrentConversationId();
      if (!id) return null;
      const nodes = await waitUntil(() => {
        const found = [...document.querySelectorAll('[data-message-author-role]')];
        return found.length ? found : null;
      }, 10000, 150) || [];
      const title = this.getCurrentConversationTitle();
      const messagesByKey = new Map();
      function collectMessages(messageNodes) {
        let grew = false;
        for (const node of messageNodes) {
          const roleValue = node.getAttribute("data-message-author-role") || "assistant";
          const role = ["user", "assistant", "system"].includes(roleValue) ? roleValue : "assistant";
          const messageNode = node.closest("[data-message-id]") || node;
          const text = (node.innerText || node.textContent || "").trim();
          const images = [...node.querySelectorAll("img")].map((img) => img.currentSrc || img.src).filter((url) => /^https?:/i.test(url));
          const links = [...node.querySelectorAll("a[href]")].map((link) => ({ text: clean(link.innerText || link.getAttribute("aria-label")), url: link.href }))
            .filter((link) => /^https?:/i.test(link.url));
          if (!text && !images.length && !links.length) continue;
          const timeNode = messageNode.querySelector("time[datetime], time");
          const timestamp = clean(timeNode?.getAttribute("datetime") || timeNode?.innerText || "") || undefined;
          const sourceId = messageNode.getAttribute("data-message-id");
          const signature = `${role}\u0000${timestamp || ""}\u0000${text}\u0000${images.join("\u0001")}\u0000${links.map((link) => link.url).join("\u0001")}`;
          const key = sourceId || signature;
          if (messagesByKey.has(key)) continue;
          messagesByKey.set(key, { id: sourceId || `${id}:visible:${messagesByKey.size}`, role, text, images, links, timestamp });
          grew = true;
        }
        return grew;
      }

      const scrollBox = conversationScrollBox();
      const originalTop = scrollBox?.scrollTop || 0;
      try {
        if (scrollBox) {
          scrollBox.scrollTop = 0;
          await CC.sleep(180);
        }
        collectMessages([...document.querySelectorAll('[data-message-author-role]')]);
        if (scrollBox) {
          let stableRounds = 0;
          for (let index = 0; index < 220; index++) {
            const grew = collectMessages([...document.querySelectorAll('[data-message-author-role]')]);
            stableRounds = grew ? 0 : stableRounds + 1;
            const atBottom = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 4;
            if (atBottom && stableRounds >= 2) break;
            const before = scrollBox.scrollTop;
            scrollBox.scrollTop = Math.min(scrollBox.scrollHeight, before + Math.max(280, Math.floor(scrollBox.clientHeight * 0.8)));
            await CC.sleep(100);
            if (scrollBox.scrollTop === before && !grew) stableRounds++;
          }
          collectMessages([...document.querySelectorAll('[data-message-author-role]')]);
        }
      } finally {
        if (scrollBox) scrollBox.scrollTop = originalTop;
      }
      const messages = [...messagesByKey.values()];
      if (!messages.length) return null;
      return { id, title: title.slice(0, 240), messages, url: location.pathname };
    },
    async fetchConversationForIndex(id) { return fetchConversationForIndex(id); },
    async openConversation(id) {
      if (!id) return false;
      if (this.getCurrentConversationId() === id) return true;
      const anchor = findChatAnchor(id);
      if (anchor) {
        anchor.click();
        if (await waitUntil(() => this.getCurrentConversationId() === id, 2400, 100)) return true;
      }
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return false;
      location.assign(`${location.origin}/c/${encodeURIComponent(id)}`);
      return true;
    },
    async openSearchResult(conversationId, messageId) {
      try { sessionStorage.setItem("cc-companion-search-target", JSON.stringify({ conversationId, messageId, createdAt: Date.now() })); } catch {}
      if (this.getCurrentConversationId() === conversationId) {
        const target = [...document.querySelectorAll("[data-message-id]")].find((node) => node.getAttribute("data-message-id") === messageId);
        if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.classList.add("cc-search-match"); setTimeout(() => target.classList.remove("cc-search-match"), 2600); return true; }
      }
      const opened = await this.openConversation(conversationId);
      if (!opened) { try { sessionStorage.removeItem("cc-companion-search-target"); } catch {} }
      return opened;
    },
    async performChatAction(id, action) {
      if (!supportedActions.has(action)) return { ok: false, reason: "Bilinmeyen sohbet işlemi." };
      return requestChatAction(id, action);
    },
    stopHistoryScan() { stopHistoryScanRequested = true; },
    async openArchiveManager() {
      if (archiveDialog()) return { ok: true };
      let dataControls = visibleNodes('button, [role="button"], [role="menuitem"], a')
        .find((node) => /data controls|veri denetimleri/i.test(clickableLabel(node)));
      if (!dataControls) {
        let settings = visibleNodes('button, [role="button"], [role="menuitem"], a')
          .find((node) => /settings|ayarlar/i.test(clickableLabel(node)));
        if (!settings) {
          const profile = visibleNodes('[data-testid="accounts-profile-button"], [data-testid*="profile"], button[aria-label*="profile" i], button[aria-label*="account" i], button[aria-label*="hesap" i]')[0];
          profile?.click();
          settings = await waitUntil(() => visibleNodes('button, [role="button"], [role="menuitem"], a')
            .find((node) => /settings|ayarlar/i.test(clickableLabel(node))), 3500);
        }
        if (!settings) return { ok: false, reason: "ChatGPT ayarlar menüsü bulunamadı." };
        settings.click();
        dataControls = await waitUntil(() => visibleNodes('button, [role="button"], [role="menuitem"], a')
          .find((node) => /data controls|veri denetimleri/i.test(clickableLabel(node))), 5000);
      }
      if (!dataControls) return { ok: false, reason: "Ayarlar içindeki Veri Denetimleri bulunamadı." };
      dataControls.click();
      const archived = await waitUntil(() => visibleNodes('button, [role="button"], a')
        .find((node) => archiveDialogWords.some((word) => CC.normalize(clickableLabel(node)).includes(CC.normalize(word)))), 6000);
      if (!archived) return { ok: false, reason: "Arşivlenmiş sohbetler bölümü bulunamadı." };
      archived.click();
      const dialog = await waitUntil(() => archiveDialog(), 5000);
      if (!dialog) return { ok: false, reason: "Arşiv listesi açılmadı veya ChatGPT arayüzü değişti." };
      return { ok: true };
    },
    async closeArchiveManager() {
      const dialog = archiveDialog();
      if (!dialog) return true;
      const close = [...dialog.querySelectorAll('button, [role="button"]')].find((node) => /close|kapat/i.test(clickableLabel(node)));
      if (close) close.click();
      else dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await CC.sleep(250);
      return !archiveDialog();
    }
  };
})();
