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
  async function refreshImageUrl(item) {
    const record = await CC.adapter.fetchConversationForIndex(item.conversationId);
    const message = record.messages.find((entry) => entry.id === item.messageId);
    const url = message?.images?.find((candidate) => candidate !== item.url);
    if (!url) return null;
    await CC.messageIndex.save([{ ...message, title: record.title || item.title }]);
    return { ...item, url, prompt: message.text || item.prompt, title: record.title || item.title };
  }

  CC.media = {
    async downloadItems(items) {
      const files = [];
      for (const [index, item] of items.entries()) {
        try {
          let target = item;
          let response = await fetch(target.url, { credentials: requestCredentials(target.url), cache: "no-store", referrerPolicy: "no-referrer" });
          if (!response.ok) {
            const refreshed = await refreshImageUrl(item).catch(() => null);
            if (refreshed) { target = refreshed; response = await fetch(target.url, { credentials: requestCredentials(target.url), cache: "no-store", referrerPolicy: "no-referrer" }); }
          }
          if (!response.ok) continue;
          const blob = await response.blob();
          const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
          files.push({ name: filenameFor(target, index, ext), data: new Uint8Array(await blob.arrayBuffer()) });
        } catch {}
      }
      if (!files.length) return CC.ui.toast("İndirilebilir görsel bulunamadı. Bazı ChatGPT bağlantıları süresi dolmuş olabilir.", "error");
      await CC.exporter.downloadZipFiles(files, `chatgpt-gorselleri-${new Date().toISOString().slice(0, 10)}.zip`);
    }
  };

  CC.features.register({ id: "media", titleKey: "media", async render(container) {
    container.append(el("div", { class: "cc-view-heading" }, [el("div", {}, [el("span", { class: "cc-eyebrow", text: "GÖRSEL ARŞİVİ" }), el("h2", { text: "Medya galerisi" }), el("p", { class: "cc-muted", text: "Dizine eklenmiş sohbetlerdeki bağlantılı görselleri bul ve toplu indir." })]), el("span", { class: "cc-view-icon", text: "▧" })]));
    container.append(el("aside", { class: "cc-note", text: CC.tr("mediaPrivacyNotice", "Opening this gallery loads image previews from their original URLs. Cross-site requests omit session credentials and referrer information; the media host can still see your network address.") }));
    const [all, favorites] = await Promise.all([CC.messageIndex.media(), CC.repository.getMediaFavorites()]);
    const unique = [...new Map(all.filter((item) => /^https?:\/\//i.test(item.url)).map((item) => [item.url, item])).values()];
    const query = el("input", { class: "cc-input", type: "search", placeholder: "Sohbet, görsel istemi veya bağlantı ara…" });
    const favoriteOnly = el("label", { class: "cc-checkline" });
    const favoriteCheck = el("input", { type: "checkbox" }); favoriteOnly.append(favoriteCheck, document.createTextNode(" Yalnızca favoriler"));
    const download = el("button", { class: "cc-button cc-primary", text: "Görselleri ZIP indir" });
    const status = el("p", { class: "cc-muted", text: `${unique.length} görsel bağlantısı · ${favorites.length} favori` });
    const grid = el("div", { class: "cc-media-grid" });
    container.append(query, favoriteOnly, download, status, grid);
    function draw() {
      grid.replaceChildren();
      const term = CC.normalize(query.value);
      const items = unique.filter((item) => (!favoriteCheck.checked || favorites.includes(item.url)) && (!term || CC.normalize(`${item.title} ${item.prompt || ""} ${item.url}`).includes(term)));
      status.textContent = `${items.length} görsel · ${favorites.length} favori`;
      if (!items.length) { grid.append(el("p", { class: "cc-empty", text: all.length ? "Filtreye uygun görsel bulunamadı." : "Önce arama bölümünden sohbetleri dizine ekleyin. ChatGPT görselleri bağlantı olarak veriyorsa burada görünür." })); return; }
      for (const [index, item] of items.entries()) {
        const card = el("article", { class: "cc-media-card" });
        const image = el("img", { loading: "lazy", alt: `${item.title} sohbetindeki görsel` });
        image.referrerPolicy = "no-referrer";
        image.crossOrigin = "anonymous";
        image.addEventListener("error", async () => {
          image.hidden = true; card.classList.add("cc-media-expired");
          const refreshed = await refreshImageUrl(item).catch(() => null);
          if (!refreshed) return;
          item.url = refreshed.url; item.prompt = refreshed.prompt; item.title = refreshed.title;
          const favoriteIndex = favorites.indexOf(image.dataset.originalUrl || "");
          if (favoriteIndex >= 0) { favorites[favoriteIndex] = refreshed.url; await CC.repository.saveMediaFavorites(favorites); }
          card.classList.remove("cc-media-expired"); image.hidden = false; image.src = refreshed.url;
        }, { once: true });
        image.dataset.originalUrl = item.url;
        image.src = item.url;
        const caption = el("span", { class: "cc-media-caption", text: item.title });
        const actions = el("div", { class: "cc-row wrap" });
        const favorited = favorites.includes(item.url);
        actions.append(el("button", { class: "cc-button cc-small", text: favorited ? "★ Favori" : "☆ Favori", onclick: async () => {
          const next = favorited ? favorites.filter((url) => url !== item.url) : [...favorites, item.url];
          await CC.repository.saveMediaFavorites(next); await CC.ui.render("media");
        } }));
        actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Sohbeti aç", onclick: () => CC.adapter.openSearchResult(item.conversationId, item.messageId) }));
        card.append(image, caption, actions); grid.append(card);
      }
    }
    query.addEventListener("input", draw); favoriteCheck.addEventListener("change", draw);
    download.addEventListener("click", () => CC.media.downloadItems(unique.filter((item) => !favoriteCheck.checked || favorites.includes(item.url))));
    draw();
  }});
})();
