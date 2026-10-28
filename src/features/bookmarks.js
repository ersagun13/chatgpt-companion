(function defineMessageBookmarks() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);
  const colors = ["#ed8796", "#f5a97f", "#eed49f", "#a6da95", "#8bd5ca", "#c6a0f6"];
  const colorNames = ["mercan", "turuncu", "sarı", "yeşil", "turkuaz", "mor"];
  const colorForName = (name) => { const index = colorNames.findIndex((item) => CC.normalize(item) === CC.normalize(name)); return index >= 0 ? colors[index] : null; };
  const colorNameFor = (color) => colorNames[Math.max(0, colors.indexOf(color))];
  const getMessageText = (node) => {
    const copy = node?.cloneNode(true);
    copy?.querySelectorAll(".cc-companion-actions,.cc-message-label,.cc-message-collapse").forEach((item) => item.remove());
    return (copy?.innerText || copy?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 16000);
  };

  CC.bookmarks = {
    colors,
    async toggle(messageNode) {
      const conversationId = CC.adapter.getCurrentConversationId();
      if (!conversationId || !messageNode) return CC.ui.toast("Önce açık bir ChatGPT iletisini seçin.", "error");
      const messageId = messageNode.getAttribute("data-message-id") || `visible-${CC.id()}`;
      const existing = (await CC.repository.getBookmarks()).find((item) => item.conversationId === conversationId && item.messageId === messageId);
      if (existing) {
        await CC.repository.deleteBookmark(existing.id);
        CC.ui.toast("Yer imi kaldırıldı.");
        return;
      }
      const note = await CC.ui.prompt("Mesajı yer imlerine ekle", "İsteğe bağlı kısa bir not ekleyin. Boş bırakabilirsiniz.");
      if (note === null) return;
      const colorName = await CC.ui.prompt("Yer imi rengi", "Altı renkten birini yazın: mercan, turuncu, sarı, yeşil, turkuaz veya mor.", "mor");
      if (colorName === null) return;
      const colorIndex = ["mercan", "turuncu", "sarı", "yeşil", "turkuaz", "mor"].findIndex((name) => CC.normalize(name) === CC.normalize(colorName));
      const title = CC.adapter.getCurrentConversationTitle() || "ChatGPT sohbeti";
      const time = messageNode.querySelector("time[datetime]")?.getAttribute("datetime") || "";
      await CC.repository.saveBookmark({ id: CC.id(), conversationId, messageId, title, role: messageNode.getAttribute("data-message-author-role") || messageNode.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role") || "assistant", text: getMessageText(messageNode), note: (note || "").slice(0, 200), color: colors[colorIndex >= 0 ? colorIndex : 5], timestamp: time || new Date().toISOString(), createdAt: Date.now() });
      CC.ui.toast("Mesaj yer imlerine kaydedildi.");
    },
    async label(messageNode) {
      const conversationId = CC.adapter.getCurrentConversationId();
      if (!conversationId || !messageNode) return;
      const messageId = messageNode.getAttribute("data-message-id") || `visible-${CC.id()}`;
      const labels = await CC.repository.getMessageLabels();
      const existing = labels.find((item) => item.conversationId === conversationId && item.messageId === messageId);
      const text = await CC.ui.prompt("Mesaj etiketi", "Mesajın üzerinde gösterilecek kısa başlık. Boş bırakarak mevcut etiketi kaldırabilirsiniz.", existing?.text || "");
      if (text === null) return;
      if (!text.trim()) {
        if (!existing || !(await CC.ui.confirm("Mesaj etiketini kaldır", `“${existing.text}” etiketi kaldırılacak.`))) return;
        await CC.repository.deleteMessageLabel(existing.id);
        CC.ui.toast("Mesaj etiketi kaldırıldı."); return;
      }
      const colorName = await CC.ui.prompt("Etiket rengi", "Renklerden birini yazın: mercan, turuncu, sarı, yeşil, turkuaz veya mor.", colorNameFor(existing?.color));
      if (colorName === null) return;
      const color = colorForName(colorName);
      if (!color) return CC.ui.toast("Listelenen renklerden birini yazın.", "error");
      const note = await CC.ui.prompt("Etiket notu", "İsteğe bağlı kısa not. Boş bırakabilirsiniz.", existing?.note || "");
      if (note === null) return;
      const title = CC.adapter.getCurrentConversationTitle() || "ChatGPT sohbeti";
      await CC.repository.saveMessageLabel({ ...(existing || {}), id: existing?.id || CC.id(), conversationId, messageId, title, role: messageNode.getAttribute("data-message-author-role") || messageNode.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role") || "assistant", messageText: getMessageText(messageNode), text: text.trim().slice(0, 80), note: note.trim().slice(0, 200), color, updatedAt: Date.now(), createdAt: existing?.createdAt || Date.now() });
      CC.ui.toast(existing ? "Mesaj etiketi güncellendi." : "Mesaj etiketi eklendi.");
    },
    async open(bookmark) { return CC.adapter.openSearchResult(bookmark.conversationId, bookmark.messageId); }
  };

  CC.features.register({ id: "bookmarks", titleKey: "bookmarks", async render(container) {
    container.append(el("div", { class: "cc-view-heading" }, [el("div", {}, [el("span", { class: "cc-eyebrow", text: "KAYDEDİLENLER" }), el("h2", { text: "Mesaj yer imleri" }), el("p", { class: "cc-muted", text: "Önemli yanıtlarını not ve renklerle sakla; tek tıkla kaynağına dön." })]), el("span", { class: "cc-view-icon", text: "☆" })]));
    const query = el("input", { class: "cc-input", type: "search", placeholder: "Kaydedilen mesajlarda ara…" });
    const list = el("div", { class: "cc-list" }); container.append(query, list);
    const all = await CC.repository.getBookmarks();
    function draw() {
      list.replaceChildren();
      const term = CC.normalize(query.value);
      const found = all.filter((item) => !term || CC.normalize(`${item.title} ${item.text} ${item.note}`).includes(term)).sort((a, b) => b.createdAt - a.createdAt);
      if (!found.length) list.append(el("p", { class: "cc-empty", text: all.length ? "Eşleşen yer imi yok." : "Bir mesajın yanındaki ☆ düğmesiyle önemli yanıtları buraya kaydedin." }));
      for (const item of found) {
        const card = el("article", { class: "cc-bookmark-card" });
        card.style.setProperty("--bookmark-color", item.color || colors[5]);
        card.append(el("div", { class: "cc-bookmark-heading" }, [el("strong", { text: item.title }), el("span", { class: "cc-badge", text: item.role === "user" ? "Ben" : "ChatGPT" })]));
        card.append(el("p", { class: "cc-bookmark-quote", text: item.text.slice(0, 700) }));
        if (item.note) card.append(el("p", { class: "cc-bookmark-note", text: `Not: ${item.note}` }));
        card.append(el("span", { class: "cc-item-meta", text: item.timestamp ? new Date(item.timestamp).toLocaleString("tr-TR") : "" }));
        const actions = el("div", { class: "cc-row wrap" });
        actions.append(el("button", { class: "cc-button cc-small cc-primary", text: "Sohbette aç", onclick: () => CC.bookmarks.open(item) }));
        actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Notu düzenle", onclick: async () => { const note = await CC.ui.prompt("Yer imi notu", "200 karaktere kadar not ekleyin.", item.note || ""); if (note === null) return; await CC.repository.saveBookmark({ ...item, note: note.slice(0, 200) }); await CC.ui.render("bookmarks"); } }));
        actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Sil", onclick: async () => { await CC.repository.deleteBookmark(item.id); await CC.ui.render("bookmarks"); } }));
        card.append(actions); list.append(card);
      }
    }
    query.addEventListener("input", draw); draw();
  }});

  CC.features.register({ id: "labels", titleKey: "labels", async render(container) {
    container.append(el("div", { class: "cc-view-heading" }, [el("div", {}, [el("span", { class: "cc-eyebrow", text: "MESAJLARINIZ" }), el("h2", { text: "Mesaj etiketleri" }), el("p", { class: "cc-muted", text: "Cevapları renkli etiket ve notlarla düzenleyin; arayın ve kaynağına dönün." })]), el("span", { class: "cc-view-icon", text: "◉" })]));
    const query = el("input", { class: "cc-input", type: "search", placeholder: "Etiketli mesajlarda ara…", "aria-label": "Mesaj etiketlerinde ara" });
    const list = el("div", { class: "cc-list" }); container.append(query, list);
    const all = await CC.repository.getMessageLabels();
    function draw() {
      list.replaceChildren();
      const term = CC.normalize(query.value);
      const found = all.filter((item) => !term || CC.normalize(`${item.title} ${item.text} ${item.note || ""} ${item.messageText || ""}`).includes(term)).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      if (!found.length) list.append(el("p", { class: "cc-empty", text: all.length ? "Eşleşen etiket bulunamadı." : "Bir ChatGPT mesajının yanındaki Etiket düğmesiyle başlayın." }));
      for (const item of found) {
        const card = el("article", { class: "cc-bookmark-card cc-label-card" });
        card.style.setProperty("--bookmark-color", item.color || colors[5]);
        card.append(el("div", { class: "cc-bookmark-heading" }, [el("strong", { text: item.text }), el("span", { class: "cc-badge", text: item.role === "user" ? "Ben" : "ChatGPT" })]));
        card.append(el("span", { class: "cc-item-meta", text: item.title }));
        if (item.messageText) card.append(el("p", { class: "cc-bookmark-quote", text: item.messageText.slice(0, 700) }));
        if (item.note) card.append(el("p", { class: "cc-bookmark-note", text: `Not: ${item.note}` }));
        const actions = el("div", { class: "cc-row wrap" });
        actions.append(el("button", { class: "cc-button cc-small cc-primary", text: "Sohbette aç", onclick: () => CC.bookmarks.open(item) }));
        actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Düzenle", onclick: async () => {
          const text = await CC.ui.prompt("Mesaj etiketi", "Kısa başlık", item.text);
          if (text === null || !text.trim()) return;
          const colorName = await CC.ui.prompt("Etiket rengi", "mercan, turuncu, sarı, yeşil, turkuaz veya mor", colorNameFor(item.color));
          if (colorName === null) return;
          const color = colorForName(colorName);
          if (!color) return CC.ui.toast("Listelenen renklerden birini yazın.", "error");
          const note = await CC.ui.prompt("Etiket notu", "İsteğe bağlı kısa not", item.note || "");
          if (note === null) return;
          await CC.repository.saveMessageLabel({ ...item, text: text.trim().slice(0, 80), color, note: note.trim().slice(0, 200), updatedAt: Date.now() });
          await CC.ui.render("labels");
        } }));
        actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Sil", onclick: async () => {
          if (!(await CC.ui.confirm("Mesaj etiketini sil", `“${item.text}” etiketi kaldırılacak.`))) return;
          await CC.repository.deleteMessageLabel(item.id); await CC.ui.render("labels");
        } }));
        card.append(actions); list.append(card);
      }
    }
    query.addEventListener("input", draw); draw();
  }});
})();
