(function defineSettingsView() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);

  CC.features.register({ id: "settings", titleKey: "settings", async render(container) {
    container.append(el("h2", { text: "Ayarlar ve yedek" }));
    container.append(el("p", { class: "cc-note", text: "Klasörler, istemler, yer imleri ve sohbet dizini bu cihazda saklanır. Tam metin araması için hazırlanan ileti dizini yedek dosyasına alınmaz." }));

    const [folders, tags, metadata, historyCatalog, prompts, bookmarks, rules, favorites] = await Promise.all([
      CC.repository.getFolders(), CC.repository.getTags(), CC.repository.getChatMeta(), CC.repository.getHistoryCatalog(),
      CC.repository.getPrompts(), CC.repository.getBookmarks(), CC.repository.getTagRules(), CC.repository.getMediaFavorites()
    ]);
    const metaCount = Object.keys(metadata).length;
    container.append(el("p", { class: "cc-muted", text: `${historyCatalog.length} bulunan sohbet · ${folders.length} klasör · ${tags.length} etiket · ${metaCount} sohbet için yerel bilgi · ${prompts.length} özel istem · ${bookmarks.length} yer imi · ${rules.length} akıllı kural · ${favorites.length} medya favorisi` }));

    container.append(el("h3", { text: "Arayüz ve araçlar" }));
    const currentSettings = await CC.repository.getSettings();
    const theme = el("select", { class: "cc-select", "aria-label": "Renk teması" });
    for (const [value, label] of [["midnight", "Gece moru"], ["paper", "Açık"], ["ocean", "Okyanus"]]) theme.append(el("option", { value, text: label, selected: currentSettings.theme === value }));
    theme.addEventListener("change", async () => { await CC.repository.saveSettings({ ...currentSettings, theme: theme.value }); CC.ui.setTheme(theme.value); document.dispatchEvent(new CustomEvent("cc:settings-changed", { detail: currentSettings })); });
    container.append(theme);
    if (typeof speechSynthesis !== "undefined") {
      const voiceSelect = el("select", { class: "cc-select", "aria-label": "Yanıtları seslendirme sesi" });
      function fillVoices() {
        const selected = currentSettings.speechVoice || "";
        voiceSelect.replaceChildren(el("option", { value: "", text: "Tarayıcının varsayılan sesi" }));
        for (const voice of speechSynthesis.getVoices()) voiceSelect.append(el("option", { value: voice.name, text: `${voice.name} · ${voice.lang}` }));
        voiceSelect.value = selected;
      }
      fillVoices(); speechSynthesis.addEventListener?.("voiceschanged", fillVoices);
      voiceSelect.addEventListener("change", async () => { currentSettings.speechVoice = voiceSelect.value; await CC.repository.saveSettings(currentSettings); document.dispatchEvent(new CustomEvent("cc:settings-changed", { detail: currentSettings })); });
      container.append(el("label", { class: "cc-field-label", text: "Yanıtları seslendirme sesi" }), voiceSelect);
    }
    for (const [key, label] of [["contextEstimate", "Yaklaşık bağlam ölçer"], ["wordCounter", "Canlı sözcük ve karakter sayacı"], ["collapsibleMessages", "Uzun iletileri daraltma düğmesi"], ["soundAlert", "ChatGPT yanıtı bitince sesli uyarı"], ["nativeFolderShortcuts", "Klasör kısayollarını ChatGPT kenar çubuğunda göster"]]) {
      const checkbox = el("input", { type: "checkbox", checked: currentSettings[key] !== false });
      checkbox.addEventListener("change", async () => { currentSettings[key] = checkbox.checked; await CC.repository.saveSettings(currentSettings); document.dispatchEvent(new CustomEvent("cc:settings-changed", { detail: currentSettings })); });
      container.append(el("label", { class: "cc-checkline" }, [checkbox, document.createTextNode(` ${label}`)]));
    }
    container.append(el("p", { class: "cc-muted", text: "Bağlam ölçeri yalnızca yaklaşık hesap yapar; ChatGPT'nin gerçek token kotasını veya kalan kullanım hakkını göstermez." }));

    const backupButton = el("button", { class: "cc-button cc-primary", text: "Yerel bilgileri JSON olarak yedekle" });
    backupButton.addEventListener("click", async () => {
      await CC.backup.export();
      CC.ui.toast("Yedek dosyası indirildi.");
    });
    container.append(backupButton);

    container.append(el("h3", { text: "Yedekten geri yükle" }));
    container.append(el("p", { class: "cc-muted", text: "Birleştir mevcut bilgilerinizin yanına yedekteki kayıtları ekler. Değiştir, eklentideki yerel bilgileri yedektekilerle değiştirir." }));
    const fileInput = el("input", { class: "cc-input", type: "file", accept: ".json,application/json", "aria-label": "JSON yedek dosyası seçin" });
    const preview = el("div", { class: "cc-card", hidden: true });
    container.append(fileInput, preview);

    fileInput.addEventListener("change", async () => {
      preview.replaceChildren();
      preview.hidden = true;
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const record = await CC.backup.parse(file);
        const counts = { folders: record.folders.length, tags: record.tags.length, chats: Object.keys(record.chatMeta).length, history: (record.historyCatalog || []).length, prompts: (record.prompts || []).length, bookmarks: (record.bookmarks || []).length, rules: (record.tagRules || []).length };
        preview.hidden = false;
        preview.append(el("strong", { text: "Yedek içeriği" }), el("p", { class: "cc-item-meta", text: `${counts.folders} klasör · ${counts.tags} etiket · ${counts.chats} sohbet için yerel bilgi · ${counts.history} sohbet başlığı · ${counts.prompts} istem · ${counts.bookmarks} yer imi · ${counts.rules} akıllı kural` }));
        const merge = el("button", { class: "cc-button cc-primary", text: "Birleştir" });
        const replace = el("button", { class: "cc-button cc-danger", text: "Mevcut yerel bilgileri değiştir" });
        const row = el("div", { class: "cc-row wrap" });
        row.append(merge, replace); preview.append(row);
        merge.addEventListener("click", () => restore(record, true));
        replace.addEventListener("click", () => restore(record, false));
      } catch (error) {
        CC.ui.toast(error.message || "Yedek dosyası okunamadı.", "error");
      }
    });

    async function restore(record, merge) {
      const action = merge ? "mevcut bilgilerle birleştirilsin" : "eklenti içindeki yerel bilgiler değiştirilsin";
      if (!(await CC.ui.confirm("Yedekten geri yükle", `Yedekteki kayıtlar ${action} mi? ChatGPT sohbetlerinin kendisi değişmez.`, { confirmText: merge ? "Birleştir" : "Değiştir", danger: !merge }))) return;
      try {
        const counts = await CC.repository.restoreMetadata(record, merge);
        CC.ui.toast(`Geri yüklendi: ${counts.folders} klasör, ${counts.tags} etiket, ${counts.history} sohbet başlığı.`);
        await CC.ui.render("settings");
      } catch (error) { CC.ui.toast(error.message || "Yedek geri yüklenemedi.", "error"); }
    }

    container.append(el("h3", { text: "Yerel eklenti verileri" }));
    const clear = el("button", { class: "cc-button cc-danger", text: "Tüm yerel verileri temizle" });
    clear.addEventListener("click", async () => {
      const accepted = await CC.ui.confirm("Yerel bilgileri temizle", "Klasörler, etiketler, istemler, yer imleri, kullanım sayaçları, arama dizini, sohbet listesi ve eklenti ayarları silinir. ChatGPT sohbetleri etkilenmez.", { confirmText: "Yerel verileri temizle", danger: true });
      if (!accepted) return;
      try {
        await CC.repository.clearAllLocalData();
        CC.ui.toast("Eklentinin yerel verileri temizlendi.");
        await CC.ui.render("settings");
      } catch (error) { CC.ui.toast(error.message || "Yerel veriler temizlenemedi.", "error"); }
    });
    container.append(clear);
    container.append(el("p", { class: "cc-muted", text: "Sohbet silme ChatGPT hesabınızda kalıcıdır ve geri alınamaz. Eklentinin yerel verilerini temizlemek ChatGPT sohbetlerini silmez." }));
  }});

})();
