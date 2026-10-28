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
  const BACKUP_MAGIC = "CCBACK1!";
  const BACKUP_ITERATIONS = 310000;
  const MAX_FULL_BACKUP = 60 * 1024 * 1024;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  function joinBytes(...parts) {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
    return output;
  }
  async function deriveKey(password, salt) {
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: BACKUP_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function gzip(bytes) {
    if (!globalThis.CompressionStream) throw new Error("Bu Chrome sürümü yerel yedek sıkıştırmasını desteklemiyor.");
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  }
  async function gunzip(bytes) {
    if (!globalThis.DecompressionStream) throw new Error("Bu Chrome sürümü şifreli yedek açmayı desteklemiyor.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader();
    const parts = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 100 * 1024 * 1024) { await reader.cancel(); throw new Error("Açılmış yedek 100 MB sınırını aşıyor."); }
      parts.push(value);
    }
    return joinBytes(...parts);
  }
  function validateFullRecord(record) {
    const metadata = record?.metadata;
    if (!record || record.format !== "cc-full-local-backup" || record.schemaVersion !== 1 || !Array.isArray(record.messages) || !Array.isArray(record.indexedChats) || !metadata || typeof metadata !== "object" || metadata.schemaVersion !== 1 || !Array.isArray(metadata.folders) || !Array.isArray(metadata.tags) || !metadata.chatMeta || typeof metadata.chatMeta !== "object" || Array.isArray(metadata.chatMeta) || !Array.isArray(metadata.historyCatalog)) throw new Error("Şifreli yedek yapısı desteklenmiyor veya bozuk.");
    if (record.messages.some((message) => !message || typeof message.id !== "string" || typeof message.conversationId !== "string" || !["user", "assistant"].includes(message.role) || typeof message.text !== "string") || record.indexedChats.some((chat) => !chat || typeof chat.id !== "string")) throw new Error("Yedek içindeki ileti veya sohbet dizini geçersiz.");
    return record;
  }
  async function collectIndexPages(fetchPage, pageSize) {
    const items = [];
    let afterKey = null, estimatedBytes = 0;
    while (true) {
      const page = await fetchPage(afterKey, pageSize);
      if (!page || !Array.isArray(page.items) || typeof page.done !== "boolean") throw new Error("Yerel yedek sayfasının biçimi tanınmadı.");
      if (!page.items.length && !page.done) throw new Error("Yerel yedek taraması ilerlemedi; işlem güvenli biçimde durduruldu.");
      estimatedBytes += encoder.encode(JSON.stringify(page.items)).byteLength;
      if (estimatedBytes > 100 * 1024 * 1024) throw new Error("Tam yedek içeriği 100 MB sınırını aşıyor.");
      items.push(...page.items);
      if (page.done) return items;
      if (typeof page.nextKey !== "string" || !page.nextKey || page.nextKey === afterKey) throw new Error("Yerel yedek taraması sonraki sayfaya geçemedi.");
      afterKey = page.nextKey;
    }
  }
  async function decodeFull(file, password) {
    if (!file || file.size < 56 || file.size > MAX_FULL_BACKUP) throw new Error("Şifreli yedek dosyası 60 MB sınırında olmalı.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (decoder.decode(bytes.subarray(0, 8)) !== BACKUP_MAGIC) throw new Error("Bu dosya Companion şifreli tam yedeği değil.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const iterations = view.getUint32(8, true);
    if (iterations !== BACKUP_ITERATIONS) throw new Error("Yedek şifreleme parametreleri tanınmadı.");
    const salt = bytes.slice(12, 28), iv = bytes.slice(28, 40), ciphertext = bytes.slice(40);
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await deriveKey(password, salt), ciphertext); }
    catch { throw new Error("Parola yanlış veya yedek dosyası zarar görmüş."); }
    let record;
    try { record = JSON.parse(decoder.decode(await gunzip(new Uint8Array(plain)))); }
    catch (error) { if (error?.message?.includes("sınırını")) throw error; throw new Error("Şifreli yedek içeriği okunamadı."); }
    return validateFullRecord(record);
  }
  async function encryptFull(record, password) {
    const plain = encoder.encode(JSON.stringify(record));
    if (plain.byteLength > 100 * 1024 * 1024) throw new Error("Tam yedek içeriği 100 MB sınırını aşıyor.");
    const compressed = await gzip(plain);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(password, salt), compressed));
    const header = new Uint8Array(40);
    header.set(encoder.encode(BACKUP_MAGIC), 0);
    new DataView(header.buffer).setUint32(8, BACKUP_ITERATIONS, true);
    header.set(salt, 12); header.set(iv, 28);
    const blob = new Blob([header, ciphertext], { type: "application/octet-stream" });
    if (blob.size > MAX_FULL_BACKUP) throw new Error("Sıkıştırılmış şifreli yedek 60 MB sınırını aşıyor.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `chatgpt-companion-tam-yedek-${new Date().toISOString().slice(0, 10)}.ccbackup`; link.click();
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
    async restore(file, merge = false) { return CC.repository.restoreMetadata(await parse(file), merge); },
    async exportFull() {
      const password = await CC.ui.password("Şifreli tam yedek", "Yedek yalnızca bu cihazda hazırlanır. Parola eklentide saklanmaz; kaybederseniz yedeği açamazsınız.", true);
      if (password === null) return false;
      const metadata = await CC.repository.exportMetadata();
      const messages = await collectIndexPages((afterKey, limit) => CC.messageIndex.exportPage(afterKey, limit), 100);
      const indexedChats = await collectIndexPages((afterKey, limit) => CC.messageIndex.exportChatPage(afterKey, limit), 200);
      const record = { format: "cc-full-local-backup", schemaVersion: 1, createdAt: Date.now(), metadata, indexedChats, messages };
      await encryptFull(record, password);
      return { messages: messages.length, chats: indexedChats.length };
    },
    async decodeFull(file, password) { return decodeFull(file, password); },
    async restoreFull(record, merge = false) {
      validateFullRecord(record);
      if (!merge) await CC.messageIndex.clear();
      const counts = await CC.repository.restoreMetadata(record.metadata, merge);
      for (let offset = 0; offset < record.messages.length; offset += 250) await CC.messageIndex.save(record.messages.slice(offset, offset + 250));
      await CC.messageIndex.restoreChatMarks(record.indexedChats);
      return { ...counts, indexedMessages: record.messages.length, indexedChats: record.indexedChats.length };
    }
  };
})();
