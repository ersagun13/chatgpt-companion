(function defineSettingsView() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);

  CC.features.register({ id: "settings", titleKey: "settings", async render(container) {
    container.append(el("h2", { text: "Ayarlar ve yedek" }));
    container.append(el("p", { class: "cc-note", text: "Klasörler, istemler ve yerel arama dizini bu cihazda kalır. Standart JSON yedeği yalnızca düzenleme bilgilerini taşır; ileti metinlerini içeren tam yedek parola ile şifrelenir." }));

    const [folders, tags, metadata, historyCatalog, prompts, promptFavorites, bookmarks, rules, favorites, hiddenMedia, indexStats] = await Promise.all([
      CC.repository.getFolders(), CC.repository.getTags(), CC.repository.getChatMeta(), CC.repository.getHistoryCatalog(),
      CC.repository.getPrompts(), CC.repository.getPromptFavorites(), CC.repository.getBookmarks(), CC.repository.getTagRules(),
      CC.repository.getMediaFavorites(), CC.repository.getHiddenMedia(), CC.messageIndex.stats().catch(() => ({ chats: 0, messages: 0 }))
    ]);
    const metaCount = Object.keys(metadata).length;
    container.append(el("p", { class: "cc-muted", text: `${historyCatalog.length.toLocaleString("tr-TR")} sohbet başlığı · ${indexStats.chats.toLocaleString("tr-TR")} dizinlenmiş sohbet · ${indexStats.messages.toLocaleString("tr-TR")} yerel ileti · ${folders.length} klasör · ${tags.length} etiket · ${metaCount} yerel sohbet kaydı · ${prompts.length} özel istem (${promptFavorites.length} favori) · ${bookmarks.length} yer imi · ${rules.length} akıllı kural · ${favorites.length} medya favorisi · ${hiddenMedia.length} gizli medya` }));

    container.append(el("h3", { text: "Arayüz ve araçlar" }));
    const currentSettings = await CC.repository.getSettings();
    const persistSetting = async (key, value) => {
      currentSettings[key] = value;
      await CC.repository.saveSettings(currentSettings);
      CC.ui.setTheme(currentSettings.theme);
      CC.ui.applyPreferences(currentSettings);
      document.dispatchEvent(new CustomEvent("cc:settings-changed", { detail: { ...currentSettings } }));
    };
    function addSelect(label, key, options) {
      const select = el("select", { class: "cc-select", "aria-label": label });
      for (const [value, text] of options) select.append(el("option", { value, text, selected: String(currentSettings[key]) === String(value) }));
      select.addEventListener("change", () => persistSetting(key, select.value));
      container.append(el("label", { class: "cc-field-label", text: label }), select);
      return select;
    }
    const theme = el("select", { class: "cc-select", "aria-label": "Renk teması" });
    for (const [value, label] of [["midnight", "Gece moru"], ["paper", "Açık"], ["ocean", "Okyanus"]]) theme.append(el("option", { value, text: label, selected: currentSettings.theme === value }));
    theme.addEventListener("change", () => persistSetting("theme", theme.value));
    container.append(el("label", { class: "cc-field-label", text: "Renk teması" }), theme);
    addSelect("Vurgu rengi", "accent", [["violet", "Menekşe"], ["blue", "Mavi"], ["mint", "Nane"], ["amber", "Kehribar"]]);
    addSelect("Panel genişliği", "panelSize", [["compact", "Dar"], ["medium", "Orta"], ["wide", "Geniş"]]);
    addSelect("Yazı boyutu", "textScale", [["small", "Küçük"], ["normal", "Normal"], ["large", "Büyük"]]);
    addSelect("Liste yoğunluğu", "density", [["comfortable", "Rahat"], ["compact", "Sıkı"]]);
    addSelect("Bağlam ölçer hedefi (yaklaşık)", "contextTarget", [[32000, "32 bin token"], [64000, "64 bin token"], [128000, "128 bin token"], [256000, "256 bin token"]]);
    if (typeof speechSynthesis !== "undefined") {
      const voiceSelect = el("select", { class: "cc-select", "aria-label": "Yanıtları seslendirme sesi" });
      function fillVoices() {
        const selected = currentSettings.speechVoice || "";
        voiceSelect.replaceChildren(el("option", { value: "", text: "Tarayıcının varsayılan sesi" }));
        for (const voice of speechSynthesis.getVoices()) voiceSelect.append(el("option", { value: voice.name, text: `${voice.name} · ${voice.lang}` }));
        voiceSelect.value = selected;
      }
      fillVoices(); speechSynthesis.addEventListener?.("voiceschanged", fillVoices);
      voiceSelect.addEventListener("change", () => persistSetting("speechVoice", voiceSelect.value));
      container.append(el("label", { class: "cc-field-label", text: "Yanıtları seslendirme sesi" }), voiceSelect);
    }
    for (const [key, label] of [["contextEstimate", "Yaklaşık bağlam ölçer"], ["wordCounter", "Sözcük, karakter, cümle ve okuma süresi sayacı"], ["collapsibleMessages", "Uzun iletileri daraltma düğmesi"], ["soundAlert", "ChatGPT yanıtı bitince sesli uyarı"], ["alertOnlyBackground", "Ses yalnızca sekme arka plandayken çalsın"], ["tabTitleAlert", "Arka plan sekmesinin başlığına uyarı işareti koy"], ["nativeFolderShortcuts", "Klasör kısayollarını ChatGPT kenar çubuğunda göster"]]) {
      const checkbox = el("input", { type: "checkbox", checked: currentSettings[key] !== false });
      checkbox.addEventListener("change", () => persistSetting(key, checkbox.checked));
      container.append(el("label", { class: "cc-checkline" }, [checkbox, document.createTextNode(` ${label}`)]));
    }
    container.append(el("h3", { text: "Akıllı etiketler" }), el("p", { class: "cc-muted", text: "Sohbet başlıkları ve yerel olarak dizine alınmış metin üzerinden konu etiketi önerir. Değişiklikler sonraki taramada uygulanır." }));
    const categoryOptions = [["coding", "Kodlama"], ["writing", "Yazı"], ["research", "Araştırma"], ["science", "Matematik ve bilim"], ["business", "İş"]];
    currentSettings.smartCategories ||= {};
    for (const [key, label] of categoryOptions) {
      const checkbox = el("input", { type: "checkbox", checked: currentSettings.smartCategories[key] !== false });
      checkbox.addEventListener("change", () => persistSetting("smartCategories", { ...currentSettings.smartCategories, [key]: checkbox.checked }));
      container.append(el("label", { class: "cc-checkline" }, [checkbox, document.createTextNode(` ${label} etiketini otomatik uygula`)]));
    }
    addSelect("Etiket için gereken farklı eşleşme sayısı", "smartTagThreshold", [[1, "1 · daha duyarlı"], [2, "2 · dengeli"], [3, "3 · daha seçici"], [4, "4 · çok seçici"]]);
    container.append(el("h3", { text: "Özelleştirilebilir hızlı araçlar" }), el("p", { class: "cc-muted", text: "＋ düğmesinde görünen beş kısayolu seçin. Aynı aracı iki slota koyamazsınız." }));
    const quickCatalog = [["search", "Tüm sohbetlerde ara"], ["searchCurrent", "Açık sohbette ara"], ["manage", "Sohbetler"], ["organize", "Klasörler"], ["prompts", "İstemler"], ["bookmarks", "Yer imleri"], ["labels", "Mesaj etiketleri"], ["media", "Medya galerisi"], ["insights", "Kullanım özeti"], ["export", "Dışa aktar"]];
    const slots = [...(currentSettings.quickActionSlots || CC.models.defaultSettings.quickActionSlots)];
    for (let index = 0; index < 5; index++) {
      const select = el("select", { class: "cc-select", "aria-label": `${index + 1}. hızlı araç` });
      for (const [value, label] of quickCatalog) select.append(el("option", { value, text: `${index + 1}. ${label}`, selected: slots[index] === value }));
      select.addEventListener("change", async () => {
        const previous = slots[index];
        const duplicate = slots.indexOf(select.value);
        slots[index] = select.value;
        if (duplicate >= 0 && duplicate !== index) slots[duplicate] = previous;
        currentSettings.quickActionSlots = [...slots];
        await persistSetting("quickActionSlots", [...slots]);
        await CC.ui.render("settings");
      });
      container.append(select);
    }
    addSelect("Uyarı sesi", "soundPattern", [["soft", "Yumuşak"], ["chime", "Çift zil"], ["bell", "Üç ton"]]);
    const volume = el("input", { class: "cc-input cc-range", type: "range", min: "5", max: "100", value: String(currentSettings.soundVolume ?? 35), "aria-label": "Uyarı ses düzeyi" });
    const volumeLabel = el("label", { class: "cc-field-label", text: `Uyarı ses düzeyi · ${volume.value}%` });
    volume.addEventListener("input", () => { volumeLabel.textContent = `Uyarı ses düzeyi · ${volume.value}%`; });
    volume.addEventListener("change", () => persistSetting("soundVolume", Number(volume.value)));
    container.append(volumeLabel, volume);
    container.append(el("button", { class: "cc-button cc-small", text: "Uyarı sesini dene", onclick: () => CC.pageTools?.previewSound?.() }));
    container.append(el("p", { class: "cc-muted", text: "Bağlam göstergesi yaklaşık karakter/token hesabıdır. Seçtiğiniz hedef modele ait gerçek token sınırını veya ChatGPT hesabınızın kalan kotasını göstermez." }));

    const backupButton = el("button", { class: "cc-button cc-primary", text: "Düzenleme bilgilerini JSON olarak yedekle" });
    backupButton.addEventListener("click", async () => {
      await CC.backup.export();
      CC.ui.toast("Yedek dosyası indirildi.");
    });
    container.append(backupButton);

    container.append(el("h3", { text: "Şifreli tam yedek" }));
    container.append(el("p", { class: "cc-muted", text: "Dizine eklediğiniz sohbet iletileri ve eklenti düzenlemeleri bu cihazda sıkıştırılıp AES-GCM ile şifrelenir. Parola en az 12 karakter olmalı; unutulursa yedek açılamaz. Dosya boyutu en fazla 60 MB, açılmış içerik en fazla 100 MB olabilir." }));
    const fullBackup = el("button", { class: "cc-button cc-primary", text: "Şifreli tam yedek oluştur" });
    fullBackup.addEventListener("click", async () => {
      fullBackup.disabled = true; fullBackup.textContent = "Şifreli yedek hazırlanıyor…";
      try {
        const result = await CC.backup.exportFull();
        if (result) CC.ui.toast(`${result.messages.toLocaleString("tr-TR")} dizinlenmiş ileti ve ${result.chats.toLocaleString("tr-TR")} sohbet için şifreli yedek indirildi.`);
      } catch (error) { CC.ui.toast(error.message || "Şifreli yedek oluşturulamadı.", "error"); }
      finally { fullBackup.disabled = false; fullBackup.textContent = "Şifreli tam yedek oluştur"; }
    });
    const fullFile = el("input", { class: "cc-input", type: "file", accept: ".ccbackup,application/octet-stream", "aria-label": "Şifreli tam yedek dosyası seçin" });
    const fullPreview = el("div", { class: "cc-card", hidden: true });
    container.append(fullBackup, fullFile, fullPreview);
    fullFile.addEventListener("change", async () => {
      fullPreview.replaceChildren(); fullPreview.hidden = true;
      const file = fullFile.files?.[0];
      if (!file) return;
      try {
        const password = await CC.ui.password("Şifreli yedeği aç", "Parola yalnızca bu sekmede kullanılır ve eklentide saklanmaz.");
        if (password === null) return;
        const record = await CC.backup.decodeFull(file, password);
        fullPreview.hidden = false;
        fullPreview.append(el("strong", { text: "Tam yedek içeriği" }), el("p", { class: "cc-item-meta", text: `${record.messages.length.toLocaleString("tr-TR")} ileti · ${record.indexedChats.length.toLocaleString("tr-TR")} sohbet dizini · ${(record.metadata.historyCatalog || []).length.toLocaleString("tr-TR")} sohbet başlığı` }));
        const merge = el("button", { class: "cc-button cc-primary", text: "Mevcut verilerle birleştir" });
        const replace = el("button", { class: "cc-button cc-danger", text: "Yerel verileri bu yedekle değiştir" });
        const row = el("div", { class: "cc-row wrap" }, [merge, replace]); fullPreview.append(row);
        const restoreFull = async (isMerge) => {
          const verb = isMerge ? "mevcut yerel verilerle birleştirilsin" : "bu cihazdaki yerel arama dizini ve düzenleme bilgileri değiştirilsin";
          if (!(await CC.ui.confirm("Şifreli tam yedeği geri yükle", `${record.messages.length.toLocaleString("tr-TR")} ileti ${verb} mi? ChatGPT hesabınızdaki sohbetler değişmez.`, { confirmText: isMerge ? "Birleştir" : "Yerel verileri değiştir", danger: !isMerge }))) return;
          try {
            const counts = await CC.backup.restoreFull(record, isMerge);
            CC.ui.toast(`Geri yüklendi: ${counts.indexedMessages.toLocaleString("tr-TR")} ileti, ${counts.indexedChats.toLocaleString("tr-TR")} sohbet dizini.`);
            await CC.ui.render("settings");
          } catch (error) { CC.ui.toast(error.message || "Şifreli tam yedek geri yüklenemedi.", "error"); }
        };
        merge.addEventListener("click", () => restoreFull(true));
        replace.addEventListener("click", () => restoreFull(false));
      } catch (error) { CC.ui.toast(error.message || "Şifreli yedek okunamadı.", "error"); }
      finally { fullFile.value = ""; }
    });

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
