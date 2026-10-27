(function definePromptTools() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);
  const library = [
    ["Yazma", "Metni iyileştir", "Aşağıdaki metni anlamını koruyarak açık, doğal ve tutarlı hale getir. Gereksiz tekrarları çıkar.\n\n{{metin}}"],
    ["Kodlama", "Kodu incele", "Bu kodu hata, güvenlik, performans ve okunabilirlik açısından incele. Bulguları önem sırasıyla, dosya ve satır referansıyla açıkla.\n\n{{kod}}"],
    ["Araştırma", "Kaynaklı araştırma", "{{konu}} hakkında güncel ve güvenilir kaynaklara dayalı kısa bir araştırma hazırla. Bilinenleri, belirsiz noktaları ve kaynakları ayrı göster."],
    ["İş", "Toplantı özeti", "Aşağıdaki notları kararlar, sorumlular, tarihler ve açık konular halinde düzenle.\n\n{{notlar}}"],
    ["Eğitim", "Adım adım öğret", "{{konu}} konusunu önce sade bir örnekle anlat, sonra bir alıştırma ver. Yanıtımı görmeden çözümü açıklama."],
    ["Matematik", "Çözümü doğrula", "{{problem}} sorusunu adım adım çöz. Varsayımları ve birim dönüşümlerini belirt, sonucu bağımsız olarak kontrol et."],
    ["Tasarım", "Arayüz değerlendirmesi", "Bu arayüzü anlaşılabilirlik, erişilebilirlik ve görev tamamlama açısından değerlendir. En önemli üç sorunu ve uygulanabilir düzeltmelerini yaz."],
    ["Analiz", "Karşılaştırma tablosu", "{{seçenekler}} seçeneklerini {{ölçütler}} ölçütlerine göre karşılaştır. Kanıtı olmayan bilgileri tahmin etme; bilinmeyenleri işaretle."],
    ["Çeviri", "Doğal çeviri", "Aşağıdaki metni {{hedef_dil}} diline çevir. Tonu ve teknik terimleri koru; ek açıklama ekleme.\n\n{{metin}}"],
    ["Planlama", "Uygulanabilir plan", "{{hedef}} için adımları, bağımlılıkları, tahmini süreleri ve riskleri içeren uygulanabilir bir plan hazırla."],
    ["Yaratıcılık", "Fikir üret", "{{amaç}} için birbirinden belirgin biçimde farklı 10 fikir üret. Her birine tek cümlelik gerekçe ekle."],
    ["İletişim", "Kısa profesyonel yanıt", "{{alıcı}} için {{amaç}} hakkında kısa, doğal ve profesyonel bir mesaj taslağı yaz. Verilmeyen bilgileri uydurma."]
  ].map(([category, title, body], index) => ({ id: `builtin-${index + 1}`, category, title, body, builtIn: true }));

  function composer() {
    return document.querySelector('#prompt-textarea, textarea[placeholder], [contenteditable="true"][data-placeholder], [contenteditable="true"][role="textbox"]');
  }
  function readComposer(node) { return node?.isContentEditable ? (node.innerText || "") : (node?.value || ""); }
  function writeComposer(node, value) {
    if (!node) return false;
    node.focus();
    if (node.isContentEditable) {
      node.replaceChildren(document.createTextNode(value));
    } else {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "value")?.set;
      if (setter) setter.call(node, value); else node.value = value;
    }
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  async function fillTemplate(body) {
    const template = String(body || "");
    const variablePattern = /{{\s*([^}]+?)\s*}}/g;
    const variables = [...new Set([...template.matchAll(variablePattern)].map((match) => match[1].trim()))];
    const values = new Map();
    for (const name of variables) {
      const value = await CC.ui.prompt(`“${name}” değerini girin`, "Bu istemdeki değişkeni doldurun.");
      if (value === null) return null;
      values.set(name, value);
    }
    return template.replace(variablePattern, (match, rawName) => values.get(rawName.trim()) ?? match);
  }

  CC.prompts = {
    library,
    composer,
    readComposer() { return readComposer(composer()); },
    writeComposer(value) { return writeComposer(composer(), value); },
    async insert(prompt) {
      const text = await fillTemplate(prompt.body || "");
      if (text === null) return false;
      const target = composer();
      if (!target) { CC.ui.toast("ChatGPT mesaj alanı bulunamadı. Önce yeni bir sohbet açın.", "error"); return false; }
      writeComposer(target, text);
      CC.ui.toast(`“${prompt.title}” mesaj alanına eklendi.`);
      return true;
    },
    async openPicker() {
      const saved = await CC.repository.getPrompts();
      const entries = [...saved, ...library];
      const term = await CC.ui.prompt("İstem seç", `${entries.slice(0, 8).map((item) => `${item.title} · ${item.category}`).join("\n")}\n\nİstem adını yazın.`);
      if (!term) return;
      const found = entries.find((item) => CC.normalize(item.title) === CC.normalize(term)) || entries.find((item) => CC.normalize(item.title).includes(CC.normalize(term)));
      if (!found) return CC.ui.toast("İstem bulunamadı. İstemler bölümünden kaydedin.", "error");
      await this.insert(found);
    },
    async openContextPicker() {
      const catalog = await CC.repository.getHistoryCatalog();
      const list = [...catalog].sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0)).slice(0, 300);
      const title = await CC.ui.prompt("Önceki sohbetten bağlam ekle", `İlk sohbetler:\n${list.slice(0, 7).map((chat) => chat.title).join("\n")}\n\nSohbet başlığını yazın.`);
      if (!title) return;
      const chat = list.find((item) => CC.normalize(item.title) === CC.normalize(title)) || list.find((item) => CC.normalize(item.title).includes(CC.normalize(title)));
      if (!chat) return CC.ui.toast("Bu başlığa uygun sohbet bulunamadı. Önce geçmişi yükleyin.", "error");
      let messages = await CC.messageIndex.conversation(chat.id).catch(() => []);
      if (!messages.length) {
        try { messages = (await CC.adapter.fetchConversationForIndex(chat.id)).messages; }
        catch (error) { return CC.ui.toast(error.message || "Sohbet içeriği alınamadı.", "error"); }
      }
      let context = messages.slice(-16).map((message) => `${message.role === "user" ? "Kullanıcı" : "ChatGPT"}: ${message.text}`).join("\n\n");
      if (context.length > 14000) context = `${context.slice(0, 14000)}\n[Önceki sohbetin devamı kısaltıldı]`;
      const target = composer();
      if (!target) return CC.ui.toast("ChatGPT mesaj alanı bulunamadı.", "error");
      const existing = readComposer(target).replace(/@@\s*$/, "").trim();
      writeComposer(target, `${existing}${existing ? "\n\n" : ""}<Önceki sohbet: ${chat.title}>\n${context}\n</Önceki sohbet>\n\nLütfen bu bağlamı dikkate alarak devam et.`);
    },
    async runChain(chain) {
      const saved = await CC.repository.getPrompts();
      const byId = new Map([...saved, ...library].map((prompt) => [prompt.id, prompt]));
      const steps = (chain.steps || []).map((id) => byId.get(id)).filter(Boolean);
      if (!steps.length) return CC.ui.toast("Bu zincirde çalıştırılabilir istem yok.", "error");
      if (!(await CC.ui.confirm("İstem zincirini çalıştır", `${steps.length} adım sırayla mesaj alanına eklenecek ve ChatGPT’ye gönderilecek.`, { confirmText: `${steps.length} adımı başlat` }))) return;
      for (let index = 0; index < steps.length; index++) {
        const filled = await fillTemplate(steps[index].body);
        if (filled === null) { CC.ui.toast("Zincir kullanıcı tarafından durduruldu."); return; }
        const target = composer();
        if (!target) return CC.ui.toast("Mesaj alanı bulunamadı; zincir durduruldu.", "error");
        writeComposer(target, filled);
        const send = [...document.querySelectorAll("button")].find((button) => !button.disabled && /send|gönder/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-testid") || ""}`));
        if (!send) return CC.ui.toast("Gönder düğmesi tanınmadı; kalan zincir adımları gönderilmedi.", "error");
        send.click();
        CC.ui.toast(`Zincir ${index + 1}/${steps.length}: ${steps[index].title}`);
        if (index < steps.length - 1) {
          const startedAt = Date.now();
          let sawStop = false;
          while (Date.now() - startedAt < 180000) {
            const generating = [...document.querySelectorAll("button")].some((button) => /stop|durdur/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-testid") || ""}`));
            if (generating) sawStop = true;
            if (sawStop && !generating) break;
            await CC.sleep(600);
          }
          if (!sawStop) return CC.ui.toast("ChatGPT yanıtı algılanmadı; zincir devam ettirilmedi.", "error");
        }
      }
      CC.ui.toast("İstem zinciri tamamlandı.");
    }
  };

  CC.features.register({ id: "prompts", titleKey: "prompts", async render(container) {
    container.append(el("div", { class: "cc-view-heading" }, [el("div", {}, [el("span", { class: "cc-eyebrow", text: "PROMPT STÜDYOSU" }), el("h2", { text: "İstem kütüphanesi" }), el("p", { class: "cc-muted", text: "Şablonlarını değişkenlerle kaydet, tek tıkla kullan veya sıraya koy." })]), el("span", { class: "cc-view-icon", text: "✦" })]));
    const form = el("div", { class: "cc-card cc-prompt-form" });
    const title = el("input", { class: "cc-input", placeholder: "İstem adı" });
    const category = el("select", { class: "cc-select" });
    for (const item of [...new Set(library.map((prompt) => prompt.category))]) category.append(el("option", { value: item, text: item }));
    const body = el("textarea", { class: "cc-textarea", placeholder: "İstemini yaz. Değişken için {{konu}} biçimini kullan." });
    const save = el("button", { class: "cc-button cc-primary", text: "İstemi kaydet" });
    form.append(title, category, body, save); container.append(form);
    const search = el("input", { class: "cc-input", type: "search", placeholder: "İstemlerde ara…" });
    const filter = el("select", { class: "cc-select" }); filter.append(el("option", { value: "all", text: "Tüm kategoriler" }));
    for (const item of [...new Set(library.map((prompt) => prompt.category))]) filter.append(el("option", { value: item, text: item }));
    container.append(el("div", { class: "cc-filter-grid" }, [search, filter]));
    const saved = await CC.repository.getPrompts();
    const list = el("div", { class: "cc-list" }); container.append(el("h3", { text: "Hazır ve kaydedilmiş istemler" }), list);
    const chains = await CC.repository.getChains();
    const chainTitle = el("input", { class: "cc-input", placeholder: "Yeni zincirin adı" });
    const chainList = el("div", { class: "cc-list" });
    const createChain = el("button", { class: "cc-button", text: "Seçili istemlerden zincir oluştur" });
    container.append(el("h3", { text: "İstem zincirleri" }), el("p", { class: "cc-muted", text: "En fazla 10 adım seçin. Çalıştırınca adımlar sırayla ChatGPT’ye gönderilir." }), chainTitle, createChain, chainList);
    function drawChains() {
      chainList.replaceChildren();
      for (const chain of chains) {
        const row = el("div", { class: "cc-item" });
        row.append(el("span", { class: "cc-item-main" }, [el("strong", { text: chain.name }), el("span", { class: "cc-item-meta", text: `${chain.steps.length} adım` })]));
        row.append(el("button", { class: "cc-button cc-small cc-primary", text: "Çalıştır", onclick: () => CC.prompts.runChain(chain) }));
        row.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Sil", onclick: async () => { await CC.repository.deleteChain(chain.id); await CC.ui.render("prompts"); } }));
        chainList.append(row);
      }
    }
    function drawPrompts() {
      list.replaceChildren();
      const query = CC.normalize(search.value);
      const items = [...saved, ...library].filter((item) => (filter.value === "all" || item.category === filter.value) && (!query || CC.normalize(`${item.title} ${item.category} ${item.body}`).includes(query)));
      for (const prompt of items) {
        const row = el("article", { class: "cc-item cc-prompt-card" });
        const check = el("input", { type: "checkbox", "data-prompt-id": prompt.id, "aria-label": `${prompt.title} zincire ekle` });
        const main = el("div", { class: "cc-item-main" }, [el("strong", { class: "cc-item-title", text: prompt.title }), el("span", { class: "cc-item-meta", text: prompt.category }), el("p", { class: "cc-prompt-preview", text: prompt.body.slice(0, 220) })]);
        const actions = el("div", { class: "cc-row wrap" });
        actions.append(el("button", { class: "cc-button cc-small cc-primary", text: "Kullan", onclick: () => CC.prompts.insert(prompt) }));
        if (!prompt.builtIn) {
          actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Düzenle", onclick: () => { title.value = prompt.title; category.value = prompt.category; body.value = prompt.body; save.dataset.editId = prompt.id; form.scrollIntoView({ behavior: "smooth" }); } }));
          actions.append(el("button", { class: "cc-button cc-small cc-quiet", text: "Sil", onclick: async () => { await CC.repository.deletePrompt(prompt.id); await CC.ui.render("prompts"); } }));
        }
        row.append(check, main, actions); list.append(row);
      }
    }
    save.addEventListener("click", async () => {
      if (!title.value.trim() || !body.value.trim()) return CC.ui.toast("İstem adı ve metni gerekli.", "error");
      const id = save.dataset.editId || CC.id();
      await CC.repository.savePrompt({ id, title: title.value.trim(), category: category.value, body: body.value.trim(), updatedAt: Date.now() });
      title.value = ""; body.value = ""; delete save.dataset.editId; CC.ui.toast("İstem kaydedildi."); await CC.ui.render("prompts");
    });
    search.addEventListener("input", drawPrompts); filter.addEventListener("change", drawPrompts);
    createChain.addEventListener("click", async () => {
      const steps = [...list.querySelectorAll("input[data-prompt-id]:checked")].map((input) => input.dataset.promptId).slice(0, 10);
      if (!chainTitle.value.trim() || steps.length < 2) return CC.ui.toast("Zincir için ad ve en az iki istem seçin.", "error");
      await CC.repository.saveChain({ id: CC.id(), name: chainTitle.value.trim(), steps, createdAt: Date.now() });
      chainTitle.value = ""; CC.ui.toast("İstem zinciri kaydedildi."); await CC.ui.render("prompts");
    });
    drawPrompts(); drawChains();
  }});
})();
