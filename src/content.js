(() => {
  const CC = globalThis.ChatCompanion;
  if (!CC || !CC.adapter.isSupportedPage()) return;

  let initPromise;
  let lastRoute = `${location.pathname}${location.search}${location.hash}`;
  let resumeTimer;

  async function focusPendingSearchTarget() {
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem("cc-companion-search-target") || "null"); } catch { return; }
    if (!pending?.messageId || pending.conversationId !== CC.adapter.getCurrentConversationId()) return;
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) { sessionStorage.removeItem("cc-companion-search-target"); return; }
    const target = await CC.waitFor("[data-message-id]", { timeout: 12000 });
    if (!target) return;
    const message = [...document.querySelectorAll("[data-message-id]")].find((node) => node.getAttribute("data-message-id") === pending.messageId);
    if (!message) return;
    sessionStorage.removeItem("cc-companion-search-target");
    message.scrollIntoView({ behavior: "smooth", block: "center" });
    message.classList.add("cc-search-match");
    setTimeout(() => message.classList.remove("cc-search-match"), 2600);
  }

  async function resumePendingJob() {
    const job = await CC.repository.getJob();
    if (!job) return;
    CC.ui.open("manage");
    if (job.type === "action") await CC.organization.continueJob();
    if (job.type === "export") await CC.exporter.continueExportJob();
  }

  function routeChanged() {
    const route = `${location.pathname}${location.search}${location.hash}`;
    if (route === lastRoute) return;
    lastRoute = route;
    CC.state.route = location.pathname;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumePendingJob().catch((error) => CC.ui.toast(error.message || "İşlem sürdürülemedi.", "error"));
      focusPendingSearchTarget().catch(() => {});
    }, 900);
  }

  async function initialize() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const settings = await CC.repository.getSettings();
      CC.state.locale = settings.locale === "en" ? "en" : "tr";
      CC.ui.setTheme(settings.theme || "midnight");
      CC.ui.mount();
      CC.pageTools.init();
      await resumePendingJob();
      focusPendingSearchTarget().catch(() => {});
      const observer = new MutationObserver(routeChanged);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("popstate", routeChanged);
      window.addEventListener("hashchange", routeChanged);
      setInterval(routeChanged, 650);
    })().catch((error) => {
      initPromise = null;
      console.error("[ChatGPT Companion] initialization failed", error);
    });
    return initPromise;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
