(function defineMediaGallery() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);
  function filenameFor(item, index, type = "jpg") {
    const name = String(item.title || "gorsel").normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, "-").slice(0, 55) || "gorsel";
    return `${String(index + 1).padStart(3, "0")}-${name}.${type}`;
  }
  function requestCredentials(url) {
    try { return new URL(url, location.href).origin === location.origin ? "include" : "omit"; }
    catch { return "omit"; }
  }
  async function refreshMediaUrl(item) {
    const record = await CC.adapter.fetchConversationForIndex(item.conversationId);
    const message = record.messages.find((entry) => entry.id === item.messageId);
    const media = message?.media?.find((candidate) => candidate.kind === item.kind && candidate.url !== item.url) || (item.kind === "image" ? message?.images?.filter((url) => url !== item.url).map((url) => ({ url, kind: "image" }))[0] : null);
    if (!media) return null;
    await CC.messageIndex.save([{ ...message, title: record.title || item.title }]);
    return { ...item, ...media, prompt: message.text || item.prompt, title: record.title || item.title };
  }

  CC.media = {
    async downloadItems(items) {
      if (items.length > 50) return CC.ui.toast("Her ZIP için en fazla 50 medya öğesi seçin. Listeyi daraltıp kalanları ayrı bir indirmede alın.", "error");
      const files = [];
      let failed = 0;
      for (const [index, item] of items.entries()) {
        try {
          let target = item;
          let response = await fetch(target.url, { credentials: requestCredentials(target.url), cache: "no-store", referrerPolicy: "no-referrer" });
          if (!response.ok) {
            const refreshed = await refreshMediaUrl(item).catch(() => null);
            if (refreshed) { target = refreshed; response = await fetch(target.url, { credentials: requestCredentials(target.url), cache: "no-store", referrerPolicy: "no-referrer" }); }
          }
          if (!response.ok) { failed++; continue; }
          const blob = await response.blob();
          const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || ({ image: "jpg", video: "mp4", audio: "m4a", file: "bin" }[target.kind] || "bin");
          files.push({ name: filenameFor(target, index, ext), data: new Uint8Array(await blob.arrayBuffer()) });
        } catch { failed++; }
      }
      if (!files.length) return CC.ui.toast("İndirilebilir medya bulunamadı. Bazı ChatGPT bağlantıları süresi dolmuş olabilir.", "error");
      await CC.exporter.downloadZipFiles(files, `chatgpt-medya-${new Date().toISOString().slice(0, 10)}.zip`);
      if (failed) CC.ui.toast(`${files.length} medya indirildi; ${failed} öğe bağlantısı kullanılamadı.`, "error");
    }
  };

  CC.features.register({ id: "media", titleKey: "media", async render(container) {
    container.append(el("div", { class: "cc-view-heading" }, [el("div", {}, [el("span", { class: "cc-eyebrow", text: "YEREL MEDYA ARŞİVİ" }), el("h2", { text: "Medya galerisi" }), el("p", { class: "cc-muted", text: "Dizine eklenmiş sohbetlerdeki görsel, video, ses ve dosya bağlantılarını bul, seç ve indir." })]), el("span", { class: "cc-view-icon", text: "▧" })]));
    container.append(el("aside", { class: "cc-note", text: "Önizleme ve indirme özgün medya adresinden yapılır. Siteler arası isteklerde oturum bilgisi ve yönlendiren sayfa adresi gönderilmez; medya sunucusu yine de ağ adresinizi görebilir. Gizleme yalnız bu cihazdaki galeriyi etkiler." }));
    const [all, savedFavorites, savedHidden] = await Promise.all([CC.messageIndex.media(), CC.repository.getMediaFavorites(), CC.repository.getHiddenMedia()]);
    const unique = [...new Map(all.filter((item) => /^https?:\/\//i.test(item.url)).map((item) => [item.url, item])).values()];
    const favorites = new Set(savedFavorites), hidden = new Set(savedHidden), selected = new Set();
    const query = el("input", { class: "cc-input", type: "search", placeholder: "Sohbet, açıklama veya bağlantı ara…" });
    const favoriteOnly = el("label", { class: "cc-checkline" });
    const favoriteCheck = el("input", { type: "checkbox" }); favoriteOnly.append(favoriteCheck, document.createTextNode(" Yalnızca favoriler"));
    const hiddenOnly = el("label", { class: "cc-checkline" });
    const hiddenCheck = el("input", { type: "checkbox" }); hiddenOnly.append(hiddenCheck, document.createTextNode(" Gizlenenleri de göster"));
    const selectVisible = el("button", { class: "cc-button cc-small", text: "Görünenleri seç" });
    const download = el("button", { class: "cc-button cc-primary", text: "Seçilileri ZIP indir" });
    const status = el("p", { class: "cc-muted" });
    const grid = el("div", { class: "cc-media-grid" });
    container.append(query, favoriteOnly, hiddenOnly, el("div", { class: "cc-row wrap" }, [selectVisible, download]), status, grid);
    function draw() {
      grid.replaceChildren();
      const term = CC.normalize(query.value);
      const items = unique.filter((item) => (hiddenCheck.checked || !hidden.has(item.url)) && (!favoriteCheck.checked || favorites.has(item.url)) && (!term || CC.normalize(`${item.title} ${item.prompt || ""} ${item.url}`).includes(term)));
      status.textContent = `${items.length} öğe · ${favorites.size} favori · ${hidden.size} gizli · ${selected.size} seçili`;
      if (!items.length) { grid.append(el("p", { class: "cc-empty", text: all.length ? "Filtreye uygun medya bulunamadı." : "Önce arama bölümünden sohbetleri dizine ekleyin. ChatGPT'den alınabilen medya bağlantıları burada görünür." })); return; }
      for (const [index, item] of items.entries()) {
        const card = el("article", { class: "cc-media-card" });
        const type = ["image", "video", "audio", "file"].includes(item.kind) ? item.kind : "image";
        let preview;
        if (type === "video" || type === "audio") {
          preview = el(type, { controls: true, preload: "none", "aria-label": `${item.title} sohbetindeki ${type === "video" ? "video" : "ses"}` });
          preview.src = item.url; preview.crossOrigin = "anonymous"; preview.referrerPolicy = "no-referrer";
        } else if (type === "file") {
          preview = el("a", { class: "cc-media-file-link", text: "Dosyayı yeni sekmede aç ↗", href: item.url, target: "_blank", rel: "noopener noreferrer" });
        } else {
          preview = el("img", { loading: "lazy", alt: `${item.title} sohbetindeki görsel` });
          preview.referrerPolicy = "no-referrer"; preview.crossOrigin = "anonymous"; preview.src = item.url;
          preview.addEventListener("error", async () => {
            preview.hidden = true; card.classList.add("cc-media-expired");
            const refreshed = await refreshMediaUrl(item).catch(() => null);
            if (!refreshed) return;
            const previousUrl = item.url;
            const wasSelected = selected.has(previousUrl);
            Object.assign(item, refreshed);
            if (favorites.delete(previousUrl)) favorites.add(item.url);
            if (hidden.delete(previousUrl)) hidden.add(item.url);
            if (wasSelected) { selected.delete(previousUrl); selected.add(item.url); }
            await Promise.all([CC.repository.saveMediaFavorites([...favorites]), CC.repository.saveHiddenMedia([...hidden])]);
            card.classList.remove("cc-media-expired"); preview.hidden = false; preview.src = item.url;
          }, { once: true });
        }
        const caption = el("span", { class: "cc-media-caption", text: item.title });
        const choose = el("label", { class: "cc-checkline" });
        const check = el("input", { type: "checkbox", checked: selected.has(item.url), "aria-label": `${item.title} medyasını seç` });
        check.addEventListener("change", () => { check.checked ? selected.add(item.url) : selected.delete(item.url); status.textContent = `${items.length} öğe · ${favorites.size} favori · ${hidden.size} gizli · ${selected.size} seçili`; });
        choose.append(check, document.createTextNode(` ${type.toLocaleUpperCase("tr-TR")}`));
        const actions = el("div", { class: "cc-row wrap" });
        actions.append(el("button", { class: "cc-button cc-small", text: favorites.has(item.url) ? "★ Favori" : "☆ Favori", onclick: async () => {
          favorites.has(item.url) ? favorites.delete(item.url) : favorites.add(item.url);
          await CC.repository.saveMediaFavorites([...favorites]); draw();
        } }));
        actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Sohbeti aç", onclick: () => CC.adapter.openSearchResult(item.conversationId, item.messageId) }));
        actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: hidden.has(item.url) ? "Galeride göster" : "Galeride gizle", onclick: async () => {
          hidden.has(item.url) ? hidden.delete(item.url) : hidden.add(item.url);
          await CC.repository.saveHiddenMedia([...hidden]); draw();
        } }));
        card.append(preview, caption, choose, actions); grid.append(card);
      }
    }
    query.addEventListener("input", draw); favoriteCheck.addEventListener("change", draw); hiddenCheck.addEventListener("change", draw);
    selectVisible.addEventListener("click", () => {
      const term = CC.normalize(query.value);
      const visible = unique.filter((item) => (hiddenCheck.checked || !hidden.has(item.url)) && (!favoriteCheck.checked || favorites.has(item.url)) && (!term || CC.normalize(`${item.title} ${item.prompt || ""} ${item.url}`).includes(term)));
      if (visible.length && visible.every((item) => selected.has(item.url))) visible.forEach((item) => selected.delete(item.url));
      else visible.forEach((item) => selected.add(item.url));
      draw();
    });
    download.addEventListener("click", () => {
      const items = unique.filter((item) => selected.has(item.url) && visibleUrlForDownload(item, hidden, hiddenCheck.checked));
      if (!items.length) return CC.ui.toast("Önce galerideki medya öğelerini seçin.", "error");
      CC.media.downloadItems(items);
    });
    draw();
  }});
  function visibleUrlForDownload(item, hidden, includeHidden) { return includeHidden || !hidden.has(item.url); }
})();
