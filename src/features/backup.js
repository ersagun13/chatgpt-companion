(function defineBackupTools() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  function downloadJson(record, filename) {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.style.display = "none";
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function parse(file) {
    if (!file || file.size > 10 * 1024 * 1024) throw new Error("Yedek dosyası bulunamadı veya 10 MB sınırını aşıyor.");
    let record;
    try { record = JSON.parse(await file.text()); }
    catch { throw new Error("Dosya geçerli bir JSON yedeği değil."); }
    if (!record || record.schemaVersion !== 1 || !Array.isArray(record.folders) || !Array.isArray(record.tags) || !record.chatMeta || typeof record.chatMeta !== "object" || Array.isArray(record.chatMeta) || (record.historyCatalog !== undefined && !Array.isArray(record.historyCatalog))) {
      throw new Error("Bu yedek dosyası desteklenmiyor veya bozuk.");
    }
    return record;
  }
  CC.backup = {
    async export() {
      const record = await CC.repository.exportMetadata();
      downloadJson(record, `chatgpt-companion-backup-${new Date().toISOString().slice(0, 10)}.json`);
      return record;
    },
    parse,
    async restore(file, merge = false) { return CC.repository.restoreMetadata(await parse(file), merge); }
  };
})();
