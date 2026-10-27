# ChatGPT Companion

**A free, open-source Chrome extension for organizing ChatGPT conversations.** Create folders and tags, search indexed messages, archive or restore chats, manage bookmarks, and export your data from a local panel on ChatGPT.

**Status: preview release (0.5.0).** ChatGPT account actions depend on undocumented endpoints and may fail when ChatGPT changes its interface. Permanent deletion is irreversible; do not treat Companion as a backup.

The extension runs on `chatgpt.com`. It has no Companion server, analytics, or cloud sync. ChatGPT conversation content indexed for search is kept in your browser profile. Read the [privacy details](PRIVACY.md) before enabling full-text indexing.

## Why install it?

- Manage folders, tags, bookmarks, prompts, and chat actions in the same place you use ChatGPT.
- Search message text locally after you choose to index it, without uploading that index to a Companion service.
- Keep portable conversation exports and a separate backup of Companion's organization data.
- Use and inspect a free MIT-licensed project without an extra Companion account or subscription.

This is a practical organizer, not a security product. Public source code helps people inspect what they install, but it is not an independent security audit.

ChatGPT Companion is an independent project. It is not affiliated with, endorsed by, or sponsored by OpenAI or AI Toolbox.

Project page: [English](https://ersagun.com.tr/en/lab/chatgpt-companion/) · [Türkçe](https://ersagun.com.tr/tr/lab/chatgpt-companion/)

## Features

- **Conversation management:** page through the active and archived conversation catalogs available to your signed-in ChatGPT session; filter, sort, pin, select, archive, restore, or delete chats.
- **Folders and tags:** nested, colored folders, shortcuts in the ChatGPT sidebar, manual tags, and keyword-based tag rules.
- **Full-text search:** index conversation messages locally, then search by phrase, speaker, date, included/excluded terms, and chat. Open matching messages and apply supported bulk actions.
- **Exports and backup:** download one conversation as TXT, Markdown, or JSON; export selected conversations as ZIP; back up and restore Companion settings and organization data.
- **Prompt library:** save reusable prompts, use variable templates, and create up to ten-step prompt chains.
- **Bookmarks and message tools:** bookmark messages, add notes and labels, collapse long messages, estimate visible text size, read answers with a browser voice, and download attached audio when available.
- **Media gallery:** find image links in indexed conversations, favorite them, and download accessible images as a ZIP.
- **Usage summary:** show messages and activity observed while Companion is enabled in this browser.
- **Companion controls:** command palette (`Ctrl+K` / `⌘K`), dark/light/ocean themes, and compact layouts.

The extension does not promise access to chats that ChatGPT does not expose to your current session. ChatGPT can change its private interface endpoints, which may temporarily disable history loading or actions. Companion reports failed actions instead of marking them complete. Deleting a chat from ChatGPT is permanent and cannot be undone.

## Install in Chrome

1. Download the ZIP attached to the [latest GitHub release](https://github.com/ersagun13/chatgpt-companion/releases/latest) and extract it.
2. Open `chrome://extensions` in Chrome and switch on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder that contains `manifest.json`.
4. Open or refresh [chatgpt.com](https://chatgpt.com/), sign in, then open Companion from the extension toolbar or its **CC** button.

To update, download and extract the newer release, select the new folder in `chrome://extensions`, and press the extension card’s reload button. The GitHub release is free. A Chrome Web Store listing is not available yet.

## First-time setup

1. Open **Manage chats → Load all history** to collect the active and archived catalog visible to your account.
2. Open **Search chats → Scan all chats** to read conversation messages into this browser’s local search index.
3. Create folders, tags, or backups from the relevant panel.

History catalog loading and message indexing are separate. Loading the catalog does not download every conversation’s text. Full-text search requires the second step and can store sensitive conversation content in the browser profile.

## Privacy

- Companion stores settings, folders, tags, prompts, bookmarks, usage summaries, and chat metadata in Chrome’s local extension storage. Full-text conversation records are stored in local IndexedDB.
- Companion does not add application-level encryption to local storage. Anyone with access to the Windows account or Chrome profile on this device may be able to read the indexed conversation data. Avoid full-text indexing on shared or untrusted devices.
- Companion does not operate a server and does not send your conversations to its maintainers, GitHub, an analytics provider, or a cloud-sync service.
- To load history, read conversations, or perform account actions, Companion makes requests to ChatGPT using your existing signed-in session. It does not save the session token in Companion storage.
- When the media gallery displays image previews or you download media/audio, your browser requests the original URLs contained in ChatGPT messages. Cross-origin media requests omit credentials and referrer information; the remote media host can still receive the request and your network address.
- Companion’s JSON backup excludes the full-text message index. Clear the index or all extension data in **Settings**. Clearing Companion data does not delete chats from ChatGPT.

See [PRIVACY.md](PRIVACY.md) for the full disclosure.

## Known limits

- History access and archive/delete actions depend on ChatGPT’s undocumented, same-origin interface endpoints and can change without notice.
- Only conversations available to the signed-in ChatGPT session can be listed or indexed; complete account-history access is not guaranteed.
- Conversation exports include text, timestamps, and links. Attachments are not embedded automatically. The media gallery can download accessible image links separately.
- Speech playback uses voices installed in the browser. It does not generate downloadable MP3 files or provide a fixed set of voice packs.
- Usage summaries count activity observed by Companion; they are not ChatGPT account quotas or official usage limits.
- There is no cloud sync or PDF export.

## License

Released under the [MIT License](LICENSE), free to use and modify. ChatGPT and OpenAI names and marks belong to their respective owners.

---

## Türkçe

**ChatGPT sohbetlerini düzenlemek için ücretsiz ve açık kaynaklı Chrome eklentisi.** Klasör ve etiket oluşturun, dizine alınmış mesajlarda arama yapın, sohbetleri arşivleyin veya geri çıkarın, yer imlerini yönetin ve sohbetleri dışa aktarın.

Eklenti yalnızca `chatgpt.com` üzerinde çalışır. Companion sunucusu, analitik sistemi veya bulut eşitlemesi yoktur. Arama için dizine alınan sohbet metinleri Chrome profilinizde yerel IndexedDB alanında tutulur. Tam metin dizinini açmadan önce [gizlilik açıklamasını](PRIVACY.md) okuyun.

### Öne çıkanlar

- **Sohbet yönetimi:** Oturumunuzda erişilebilen etkin ve arşivlenmiş sohbet kataloglarını sayfa sayfa yükleme, filtreleme, sıralama, sabitleme, seçme, arşivleme, arşivden çıkarma ve silme.
- **Klasör ve etiketler:** İç içe ve renkli klasörler, kenar çubuğu kısayolları, elle etiketleme ve anahtar sözcüğe göre etiket kuralları.
- **Tam metin arama:** Mesajları yerel olarak dizine alma; ifade, konuşmacı, tarih ve zorunlu/istenmeyen sözcüklerle arama.
- **Dışa aktarma ve yedek:** Tek sohbeti TXT, Markdown veya JSON; seçili sohbetleri ZIP indirme. Companion ayarlarını ve düzenleme bilgilerini yedekleyip geri yükleme.
- **İstem kütüphanesi:** Değişkenli istem şablonları ve on adıma kadar istem zincirleri.
- **Mesaj araçları:** Yer imleri, notlar, etiketler, uzun iletileri daraltma, tarayıcı sesiyle okutma ve varsa ekli sesi indirme.
- **Medya galerisi:** Dizine alınmış sohbetlerde görsel bağlantılarını bulma ve erişilebilenleri ZIP olarak indirme.
- **Kullanım özeti ve arayüz:** Eklenti açıkken gözlemlenen etkinlik özeti, `Ctrl+K` / `⌘K` komut paleti, üç tema ve dar ekran düzeni.

### Chrome'a kurulum

1. [En son GitHub sürümündeki ZIP dosyasını](https://github.com/ersagun13/chatgpt-companion/releases/latest) indirin ve ayıklayın.
2. Chrome'da `chrome://extensions` adresini açıp **Geliştirici modu**nu etkinleştirin.
3. **Paketlenmemiş öğe yükle** düğmesine basıp ayıklanan ZIP içindeki `manifest.json` dosyasını barındıran klasörü seçin.
4. [chatgpt.com](https://chatgpt.com/) sayfasını açın veya yenileyin; oturum açtıktan sonra eklenti simgesine ya da **CC** düğmesine basın.

İlk kurulumda **Sohbetleri yönet → Tüm geçmişi yükle**, ardından mesajlarda arama için **Sohbet ara → Tüm sohbetleri tara** adımlarını kullanın. Katalog yükleme ve sohbet metinlerini dizine alma ayrı işlemlerdir. ChatGPT'nin oturumunuzdan erişilemeyen sohbetleri listelenemez; tam geçmişe erişim garantisi yoktur.

### Neden indirmeli?

- Sohbetleri ayrı bir uygulamaya kopyalamadan ChatGPT'nin içinde düzenleyin.
- İsteğe bağlı yerel aramayla uzun konuşmaları ve belirli mesajları bulun.
- Klasör, etiket, yer imi, istem, arşivleme ve dışa aktarma araçlarını tek panelde kullanın.
- Ücretsiz MIT lisanslı kodu inceleyin; Companion hesabı, abonelik veya geliştirici sunucusu gerekmez.

Companion, OpenAI veya AI Toolbox tarafından hazırlanmış ya da desteklenmiş değildir. ChatGPT'nin özel arayüz uç noktaları değişirse sohbet yükleme ve hesap işlemleri etkilenebilir. Başarısız işlemler tamamlandı gibi gösterilmez. ChatGPT'den silinen bir sohbet kalıcı olarak silinir. Eklenti ücretsizdir; MIT lisanslıdır. Chrome Web Store'da henüz listelenmiyor.

**Güvenlik özeti:** Companion sunucusu yoktur ve sohbet dizini dışarı yüklenmez; buna karşılık tam metin arama açıldığında cihazda şifrelenmemiş yerel sohbet kopyası oluşur. Yalnızca güvendiğiniz kişisel bilgisayarda kullanın. Açık kaynak kod güvenlik denetimi yerine geçmez.

**Durum: önizleme sürümü (0.5.0).** ChatGPT hesap işlemleri belgelenmemiş uç noktalara bağlıdır ve ChatGPT değişikliklerinden etkilenebilir. Kalıcı silme geri alınamaz; Companion'ı yedek olarak görmeyin.
