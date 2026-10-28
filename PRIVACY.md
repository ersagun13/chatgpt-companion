# Privacy

Last updated: 2026-10-27

ChatGPT Companion is a local Chrome extension. It does not use a Companion-operated server, analytics service, advertising service, or cloud synchronization.

## Information the extension handles

- Conversation titles, IDs, dates, archive state, and your folder/tag metadata are kept in Chrome local extension storage.
- If you start a full-history scan, conversation messages and related search records are saved in IndexedDB in the current browser profile. This can include sensitive personal or work information from your chats.
- Companion does not add application-level encryption to these local records. A person or process that can access your Windows account or Chrome profile may be able to read them. Do not index sensitive chats on a shared or untrusted device.
- Prompts, chains, bookmarks, notes, preferences, observed activity summaries, and media favorites are kept in Chrome local extension storage.
- Temporary work data used during ZIP exports is held in the extension's local IndexedDB and cleared after the operation completes.

## Network requests

- To collect the history catalog, read a conversation, rename it, or archive, restore, or delete a chat, the extension requests data from `chatgpt.com` using the browser's current signed-in session. It does not store your session token in Companion storage.
- When you open the media gallery or choose to download audio or images, the browser requests the original media URLs found in ChatGPT messages. Cross-origin image previews and downloads omit credentials and referrer information; the destination host can still receive the request and your network address.
- The extension does not send chat content to its maintainers, GitHub, or a separate Companion backend. GitHub is used only when you visit the public source/release pages yourself.

## Your choices and deletion

- Loading the chat catalog does not index message contents. Full-text search starts only when you choose to scan chats.
- Companion JSON backups include settings and organization metadata, but exclude the full-text message index. Conversation exports that you request are saved to your device as files.
- Use **Search chats → Clear index** to erase indexed messages, or **Settings → Clear all extension data** to erase Companion's local data. Removing local data does not delete conversations from ChatGPT.
- Deleting a chat through Companion requests a permanent deletion from your ChatGPT account. Review the confirmation carefully; it cannot be undone.
- Browser-profile backups, device backups, and Chrome's own storage behavior are outside Companion's control.

For current behavior of Chrome's extension storage, see the official [Chrome Storage API documentation](https://developer.chrome.com/docs/extensions/reference/api/storage). Chrome documents `storage.local` as local extension storage that is cleared when the extension is removed. This describes Chrome's storage API, not an independent security audit of Companion.

## Permissions and limitations

The extension requests Chrome's `storage` permission and is restricted to `chatgpt.com` pages. ChatGPT history and account actions use private, undocumented interface endpoints. OpenAI may change them, and the extension may stop working until updated. The extension cannot read chats that ChatGPT does not make available to your signed-in session.

## Türkçe açıklama

ChatGPT Companion yerel çalışan bir Chrome eklentisidir. Companion tarafından işletilen bir sunucu, analitik/reklam hizmeti veya bulut eşitlemesi kullanmaz.

- Sohbet başlıkları, kimlikleri, tarihleri ve klasör/etiket bilgileri Chrome'un yerel eklenti depolamasında tutulur.
- **Tüm sohbetleri tara** işlemini başlatırsanız, sohbet mesajları ve arama kayıtları mevcut Chrome profilindeki IndexedDB alanına kaydedilir. Bu içerik hassas kişisel veya iş verileri içerebilir.
- Companion bu yerel kayıtları uygulama düzeyinde şifrelemez. Windows hesabınıza veya Chrome profilinize erişebilen kişiler ya da işlemler bu verileri okuyabilir. Paylaşılan veya güvenilmeyen cihazda hassas sohbetleri dizine almayın.
- Sohbet kataloğunu okumak, sohbet içeriğine erişmek, sohbet adını değiştirmek ve arşivleme, arşivden çıkarma veya silme işlemleri için istekler mevcut oturumunuzla `chatgpt.com` adresine gönderilir. Oturum belirteci Companion depolamasına yazılmaz.
- Medya galerisini açtığınızda veya ses/görsel indirmeyi seçtiğinizde tarayıcı ChatGPT mesajlarındaki özgün medya adreslerine istek gönderir. Çapraz site görsel ve indirme isteklerinde kimlik bilgileri ve yönlendiren sayfa bilgisi gönderilmez; hedef sunucu isteği ve ağ adresinizi yine görebilir.
- Eklenti sohbet içeriğini geliştiricilere, GitHub'a veya ayrı bir Companion sunucusuna göndermez.
- JSON yedeği tam metin arama dizinini içermez. **Sohbet ara → Dizini temizle** veya **Ayarlar → Tüm eklenti verilerini temizle** seçenekleri Companion'ın yerel verilerini siler; ChatGPT sohbetlerini silmez.
- Companion üzerinden sohbet silme, ChatGPT hesabınızda kalıcı silme isteği gönderir ve geri alınamaz.

ChatGPT'nin geçmiş ve hesap işlemleri özel arayüz uç noktalarına bağlıdır. Bu uç noktalar değişebilir. Eklenti oturumunuzda ChatGPT'nin erişime açmadığı sohbetleri okuyamaz.

Chrome eklenti depolamasının güncel davranışı için [Chrome Storage API belgelerine](https://developer.chrome.com/docs/extensions/reference/api/storage) bakın. Chrome, `storage.local` verisinin yerel tutulduğunu ve eklenti kaldırıldığında temizlendiğini belirtir. Bu bilgi Companion için bağımsız bir güvenlik denetimi anlamına gelmez.
