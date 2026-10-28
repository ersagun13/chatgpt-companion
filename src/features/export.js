(function defineExporter() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const encoder = new TextEncoder();
  const el = (...args) => CC.make(...args);
  function safeName(value) { return String(value || "chat").normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "chat"; }
  function roleName(role) { return role === "user" ? "You" : role === "assistant" ? "ChatGPT" : role; }
  function linksText(message) { return [...new Set((message.links || []).map((item) => item.url).filter(Boolean))]; }
  function toText(record) {
    return `${record.title}\n${"=".repeat(Math.min(80, Math.max(8, record.title.length)))}\n\n${record.messages.map((message) => `${message.timestamp ? `[${message.timestamp}] ` : ""}${roleName(message.role)}:\n${message.text || (message.images?.length || message.links?.length ? "[Görsel veya ek bağlantısı aşağıda]" : "")}${(message.images || []).map((url) => `\n[Medya bağlantısı] ${url}`).join("")}${linksText(message).map((url) => `\n[Bağlantı] ${url}`).join("")}`).join("\n\n---\n\n")}`;
  }
  function toMarkdown(record) {
    const yaml = (value) => JSON.stringify(value == null ? "" : String(value));
    const conversationPath = record.url || (record.id ? `/c/${encodeURIComponent(record.id)}` : location.pathname);
    const conversationUrl = new URL(conversationPath, location.origin).href;
    const date = record.updatedAt || [...(record.messages || [])].reverse().find((message) => message.timestamp)?.timestamp || "";
    return `---\ntitle: ${yaml(record.title)}\ndate: ${yaml(date)}\nmodel: ${yaml(record.model)}\nurl: ${yaml(conversationUrl)}\nsource: ChatGPT\n---\n\n# ${record.title}\n\n${record.messages.map((message) => `## ${roleName(message.role)}${message.timestamp ? ` · ${message.timestamp}` : ""}\n\n${message.text || (message.images?.length || message.links?.length ? "[Görsel veya ek bağlantısı aşağıda]" : "")}${(message.images || []).map((url) => `\n\n[Medya bağlantısı](${url})`).join("")}${(message.links || []).map((item) => `\n\n[${item.text || item.url}](${item.url})`).join("")}`).join("\n\n---\n\n")}`;
  }
  function toCsv(record) {
    const cell = (value) => {
      let text = String(value ?? "");
      if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [["conversation_title", "conversation_id", "role", "timestamp", "message", "media_urls", "links"]];
    for (const message of record.messages || []) rows.push([
      record.title, record.id, roleName(message.role), message.timestamp || "", message.text || "",
      (message.images || []).join(" | "), (message.links || []).map((item) => item.url).filter(Boolean).join(" | ")
    ]);
    return `\ufeff${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`;
  }
  function extensionFor(format) { return format === "json" ? "json" : format === "csv" ? "csv" : format === "markdown" || format === "md" ? "md" : "txt"; }
  function mimeFor(format) { return format === "json" ? "application/json;charset=utf-8" : format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8"; }
  function contentFor(record, format) {
    if (format === "json") return JSON.stringify(record, null, 2);
    if (format === "csv") return toCsv(record);
    if (format === "markdown" || format === "md") return toMarkdown(record);
    return toText(record);
  }
  function crc32(bytes) {
    if (!crc32.table) {
      crc32.table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc32.table[n] = c >>> 0; }
    }
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crc32.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipStore(files) {
    const locals = [], central = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
      local.set(name, 30); local.set(data, 30 + name.length); locals.push(local);
      const entry = new Uint8Array(46 + name.length);
      const cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
      entry.set(name, 46); central.push(entry); offset += local.length;
    }
    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
    return new Blob([...locals, ...central, end], { type: "application/zip" });
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.style.display = "none";
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { ok: true, filename };
  }

  async function exportConversation(record, format = "text") {
    if (!record?.messages) return { ok: false, reason: "Sohbet içeriği okunamadı." };
    return download(new Blob([contentFor(record, format)], { type: mimeFor(format) }), `${safeName(record.title)}.${extensionFor(format)}`);
  }

  async function exportCurrent(format = "markdown") {
    const record = await CC.adapter.readCurrentConversation();
    if (!record) return { ok: false, reason: "Açık sohbette dışa aktarılacak içerik bulunamadı." };
    const extension = extensionFor(format);
    const blob = new Blob([contentFor(record, format)], { type: mimeFor(format) });
    CC.state.pendingDownload = { blob, filename: `${safeName(record.title)}.${extension}`, initialUrl: `${location.pathname}${location.search}${location.hash}` };
    CC.ui.open("export");
    CC.ui.toast("Dosya hazır. Kaydetmek için İndir düğmesine tıklayın.");
    return { ok: true, filename: CC.state.pendingDownload.filename };
  }

  async function exportSelection(ids, format = "zip") {
    const selected = [...new Set(ids)].filter(Boolean);
    if (!selected.length) return { ok: false, reason: "Dışa aktarılacak sohbet seçilmedi." };
    const jobId = CC.id();
    await CC.tempStore.clear(jobId);
    const job = { id: jobId, type: "export", format, ids: selected, cursor: 0, completed: 0, initialUrl: `${location.pathname}${location.search}${location.hash}`, startedAt: Date.now() };
    await CC.repository.saveJob(job);
    CC.ui.open("manage");
    await continueExportJob();
    return { ok: true, filename: undefined };
  }

  async function finishExport(job) {
    const all = await CC.tempStore.list(job.id);
    const byId = new Map(all.map((record) => [record.id, record]));
    const records = job.ids.map((id) => byId.get(id)).filter(Boolean);
    if (!records.length) throw new Error("Seçilen sohbetlerden okunabilir içerik alınamadı.");
    let result;
    if (["text", "markdown", "json", "csv"].includes(job.format)) {
      if (records.length !== 1) throw new Error("Tekil dışa aktarma biçimi için tek sohbet seçin; çoklu seçim ZIP olarak kaydedilir.");
      const extension = extensionFor(job.format);
      result = {
        ok: true,
        filename: `${safeName(records[0].title)}.${extension}`,
        blob: new Blob([contentFor(records[0], job.format)], { type: mimeFor(job.format) })
      };
    } else {
      const format = job.format === "zip" ? "markdown" : job.format.replace(/^zip-/, "");
      const extension = extensionFor(format);
      const files = records.map((record, index) => ({ name: `${String(index + 1).padStart(3, "0")}-${safeName(record.title)}.${extension}`, data: contentFor(record, format) }));
      result = { ok: true, blob: zipStore(files), filename: `chatgpt-sohbetleri-${new Date().toISOString().slice(0, 10)}.zip` };
    }
    if (!result.ok) throw new Error(result.reason || "Dosya oluşturulamadı.");
    return result;
  }

  async function continueExportJob() {
    if (CC.state.exportRunning) return;
    CC.state.exportRunning = true;
    try {
      let job = await CC.repository.getJob();
      if (!job || job.type !== "export") return;
      if (job.cursor >= job.ids.length) {
        const result = await finishExport(job);
        await CC.tempStore.clear(job.id); await CC.repository.clearJob();
        CC.state.pendingDownload = { blob: result.blob, filename: result.filename, initialUrl: job.initialUrl };
        CC.ui.open("manage");
        CC.ui.toast("Dışa aktarma hazır. Dosyayı kaydetmek için yönetim ekranındaki İndir düğmesine tıklayın.");
        return;
      }
      const expected = job.ids[job.cursor];
      if (CC.adapter.getCurrentConversationId() !== expected) {
        const opened = await CC.adapter.openConversation(expected);
        if (!opened) throw new Error("Seçilen sohbet ChatGPT arayüzünde açılamadı.");
        CC.ui.open("manage");
        setTimeout(() => continueExportJob(), 1200);
        return;
      }
      const record = await CC.adapter.readCurrentConversation();
      if (!record?.messages?.length) throw new Error("Bir sohbetin görünür mesajları okunamadı; işlem durduruldu.");
      await CC.tempStore.save(job.id, record);
      job = { ...job, cursor: job.cursor + 1, completed: job.completed + 1 };
      await CC.repository.saveJob(job);
      if (job.cursor < job.ids.length) {
        const opened = await CC.adapter.openConversation(job.ids[job.cursor]);
        if (!opened) throw new Error("Sonraki sohbet açılamadı.");
        CC.ui.open("manage");
        setTimeout(() => continueExportJob(), 1200);
      } else setTimeout(() => continueExportJob(), 200);
    } catch (error) {
      const job = await CC.repository.getJob();
      if (job?.id) await CC.tempStore.clear(job.id).catch(() => {});
      await CC.repository.clearJob();
      CC.ui.toast(`${error.message || "Dışa aktarma başarısız."} ${job?.completed || 0}/${job?.ids?.length || 0} sohbet işlendi.`, "error");
      if (job?.initialUrl && `${location.pathname}${location.search}${location.hash}` !== job.initialUrl) location.assign(`${location.origin}${job.initialUrl}`);
    } finally { CC.state.exportRunning = false; }
  }

  async function cancelExport() {
    const job = await CC.repository.getJob();
    if (!job || job.type !== "export") return;
    await CC.tempStore.clear(job.id); await CC.repository.clearJob();
    CC.ui.toast("Dışa aktarma durduruldu.");
    if (job.initialUrl && `${location.pathname}${location.search}${location.hash}` !== job.initialUrl) location.assign(`${location.origin}${job.initialUrl}`);
  }

  function downloadPending() {
    const pending = CC.state.pendingDownload;
    if (!pending) return false;
    download(pending.blob, pending.filename);
    CC.state.pendingDownload = null;
    CC.ui.toast(`${pending.filename} indirildi.`);
    const route = `${location.pathname}${location.search}${location.hash}`;
    if (pending.initialUrl && route !== pending.initialUrl) setTimeout(() => location.assign(`${location.origin}${pending.initialUrl}`), 500);
    return true;
  }

  async function downloadZipFiles(files, filename) {
    if (!Array.isArray(files) || !files.length) return { ok: false, reason: "ZIP için dosya bulunamadı." };
    return download(zipStore(files), filename || `chatgpt-export-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  CC.exporter = { exportConversation, exportCurrent, exportSelection, continueExportJob, cancelExport, downloadPending, contentFor, downloadZipFiles };
  CC.features.register({ id: "export", titleKey: "export", async render(container) {
    container.append(el("h2", { text: "Dışa aktar" }));
    container.append(el("p", { class: "cc-note", text: "TXT, Markdown, JSON veya elektronik tablo için CSV olarak dışa aktarın. Seçilen sohbetleri ZIP olarak kaydetmek için Sohbetleri yönet bölümünü kullanın." }));
    if (CC.state.pendingDownload) {
      const ready = el("div", { class: "cc-card" });
      ready.append(el("strong", { text: "Dosya hazır" }), el("p", { class: "cc-item-meta", text: CC.state.pendingDownload.filename }));
      ready.append(el("button", { class: "cc-button cc-primary", text: "Dosyayı indir", onclick: () => CC.exporter.downloadPending() }));
      container.append(ready);
    }
    const title = CC.adapter.getCurrentConversationTitle();
    if (!title) { container.append(el("p", { class: "cc-muted", text: "Önce dışa aktarmak istediğiniz sohbeti ChatGPT’de açın." })); return; }
    container.append(el("h3", { text: title }));
    const buttons = el("div", { class: "cc-row wrap" });
    for (const [format, label] of [["text", "TXT"], ["markdown", "Markdown"], ["json", "JSON"], ["csv", "CSV"]]) {
      buttons.append(el("button", { class: "cc-button cc-primary", text: label, onclick: async () => {
        const result = await exportCurrent(format);
        if (!result.ok) CC.ui.toast(result.reason, "error");
      } }));
    }
    container.append(buttons);
  }});
})();
