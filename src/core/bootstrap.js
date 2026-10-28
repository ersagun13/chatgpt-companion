(function initChatCompanion() {
  if (globalThis.ChatCompanion) return;
  const CC = {
    version: "0.6.0",
    state: { locale: "tr", root: null, shadow: null, currentView: "home", route: location.pathname },
    locales: globalThis.CC_LOCALES || {},
    features: { items: new Map(), register(item) { this.items.set(item.id, item); } },
    log: (...args) => console.debug("[ChatGPT Companion]", ...args),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    id: () => globalThis.crypto?.randomUUID?.() || `cc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    text: (value) => String(value ?? "").replace(/\s+/g, " ").trim(),
    normalize: (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(),
    tr(key, fallback = key) {
      const locale = this.locales?.[this.state.locale] || this.locales?.tr || {};
      return locale[key] || fallback;
    },
    make(tag, options = {}, children = []) {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(options)) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "htmlFor") node.htmlFor = value;
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value !== undefined && value !== null) {
          const property = key in node && ["checked", "disabled", "hidden", "selected", "multiple", "value"].includes(key);
          if (property) node[key] = value;
          else node.setAttribute(key, String(value));
        }
      }
      for (const child of Array.isArray(children) ? children : [children]) {
        if (child instanceof Node) node.append(child);
        else if (child !== undefined && child !== null) node.append(document.createTextNode(String(child)));
      }
      return node;
    },
    async waitFor(selector, { root = document, timeout = 5000 } = {}) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const node = root.querySelector(selector);
        if (node) return node;
        await this.sleep(100);
      }
      return null;
    }
  };
  globalThis.ChatCompanion = CC;
})();
