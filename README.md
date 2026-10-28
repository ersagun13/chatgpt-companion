# ChatGPT Companion

**A free, open-source Chrome extension for organizing ChatGPT conversations.** Create folders and tags, search indexed messages, archive or restore chats, manage bookmarks, and export your data from a local panel on ChatGPT.

**Status: preview release (0.7.0).** ChatGPT account actions depend on undocumented endpoints and may fail when ChatGPT changes its interface. Permanent deletion is irreversible; do not treat Companion as a backup.

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

- **Conversation management:** collect active and archived catalogs available to your signed-in session, save page checkpoints, and resume long scans. Filter by title, folder, or tag; sort, rename, pin, select, archive, restore, or delete chats.
- **Folders and tags:** create nested, colored folders, reorder or nest them by dragging, use ChatGPT sidebar shortcuts, tag chats manually, apply keyword rules or local smart categories, and export a folder tree as ZIP.
- **Full-text search:** index conversation messages locally, then search by phrase, speaker, date, included/excluded terms, or chat. Highlight matches, open a matching message, apply supported bulk actions, and export selected matching passages as Markdown. Search the open chat directly with `Alt+Shift+F`.
- **Exports and backup:** download one conversation as TXT, Markdown, JSON, or CSV; export selected conversations as ZIP in those formats; keep a metadata-only JSON backup or create a password-protected AES-GCM full backup of the local message index and organization data.
- **Prompt library and handoff:** save reusable prompts, mark favorites, filter and search them, use variable templates, and create up to ten-step prompt chains. For long chats, ask ChatGPT in the current conversation to prepare a structured handoff covering response preferences, decisions, constraints, completed work, open issues, and next steps. Review its answer and transfer it to a new chat as an unsent draft. A separate raw-transfer option copies only recent messages.
- **Bookmarks and message tools:** bookmark messages with notes and colors; add searchable, colored message labels with notes; collapse long messages; estimate visible text size; read answers with a browser voice; and download attached audio when available.
- **Media gallery:** find image, video, audio, and explicit file links found in indexed conversations; favorite, hide locally, preview supported items, select items, and download accessible media as a ZIP.
- **Usage summary:** show observed messages and activity by year, recent days, and local hour while Companion is enabled in this browser.
- **In-chat tools:** a configurable five-item quick-action menu, command palette (`Ctrl+K` / `⌘K`), configurable panel size, accent color, text size and density, live word/character/sentence/reading-time counts, an approximate context meter, and configurable background completion alerts.

The extension does not promise access to chats that ChatGPT does not expose to your current session. ChatGPT can change its private interface endpoints, which may temporarily disable history loading or actions. Companion reports failed actions instead of marking them complete. Deleting a chat from ChatGPT is permanent and cannot be undone.

### Keeping continuity between chats

For preferences that should apply across many conversations, use ChatGPT Memory or Custom Instructions. For ongoing work, a ChatGPT Project can keep related chats, files, and project instructions together; project memory and cross-chat references depend on your account settings and plan. Memory is a high-level aid and may omit details, so use Companion's handoff summary for the exact decisions and next steps from a particular long chat. See OpenAI's official guides to [Memory](https://help.openai.com/en/articles/8590148-memory-in-chatgpt) and [Projects](https://help.openai.com/en/articles/10169521-projects).

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

History catalog loading and message indexing are separate. Loading the catalog does not download every conversation’s text. Full-text search requires the second step and can store sensitive conversation content in the browser profile. After updating to 0.7.0, run the scan again to refresh older local index entries and discover newly supported media links.

## Privacy

- Companion stores settings, folders, tags, prompts, bookmarks, usage summaries, and chat metadata in Chrome’s local extension storage. Full-text conversation records are stored in local IndexedDB.
- Companion does not add application-level encryption to local storage. Anyone with access to the Windows account or Chrome profile on this device may be able to read the indexed conversation data. Avoid full-text indexing on shared or untrusted devices.
- The optional `.ccbackup` full backup is encrypted locally with AES-GCM and a password-derived key; Companion does not store the password. Keep the password safe. The unencrypted JSON backup contains organization metadata only and excludes indexed message text.
- Companion does not operate a server and does not send your conversations to its maintainers, GitHub, an analytics provider, or a cloud-sync service.
- To load history, read conversations, rename or perform other account actions, Companion makes requests to ChatGPT using your existing signed-in session. It does not save the session token in Companion storage.
- When the media gallery displays image previews or you download media/audio, your browser requests the original URLs contained in ChatGPT messages. Cross-origin media requests omit credentials and referrer information; the remote media host can still receive the request and your network address.
- Companion’s JSON backup excludes the full-text message index. The separate encrypted full backup is limited to a 60 MB file and 100 MB after decompression. Clear the index or all extension data in **Settings**. Clearing Companion data does not delete chats from ChatGPT.

See [PRIVACY.md](PRIVACY.md) for the full disclosure.

## Known limits

- History access and archive/delete actions depend on ChatGPT’s undocumented, same-origin interface endpoints and can change without notice.
- Only conversations available to the signed-in ChatGPT session can be listed or indexed; complete account-history access is not guaranteed.
- Conversation exports include text, timestamps, and links. Attachments are not embedded automatically. The media gallery can download accessible media links separately; ChatGPT may not expose every generated or uploaded file as a downloadable URL.
- Speech playback uses voices installed in the browser. It does not generate downloadable MP3 files or provide a fixed set of voice packs.
- Usage summaries count activity observed by Companion; they are not ChatGPT account quotas or official usage limits.
- There is no cloud sync, PDF export, separate team service, or support for Claude, Gemini, or Grok. The context meter is a character-based estimate against a user-selected target, not the model's verified context limit. AI Toolbox features that rely on a paid account, cross-provider access, or its team/cloud service are outside this ChatGPT-only local extension.

## License

Released under the [MIT License](LICENSE), free to use and modify. ChatGPT and OpenAI names and marks belong to their respective owners.

---

## Türkçe

**ChatGPT sohbetlerini düzenlemek için ücretsiz ve açık kaynaklı Chrome eklentisi.** Klasör ve etiket oluşturun, dizine alınmış mesajlarda arama yapın, sohbetleri arşivleyin veya geri çıkarın, yer imlerini yönetin ve sohbetleri dışa aktarın.

Eklenti yalnızca `chatgpt.com` üzerinde çalışır. Companion sunucusu, analitik sistemi veya bulut eşitlemesi yoktur. Arama için dizine alınan sohbet metinleri Chrome profilinizde yerel IndexedDB alanında tutulur. Tam metin dizinini açmadan önce [gizlilik açıklamasını](PRIVACY.md) okuyun.

### Öne çıkanlar

- **Sohbet yönetimi:** Oturumunuzda erişilebilen etkin ve arşivlenmiş sohbet kataloglarını sayfa sayfa yükleme, tarama konumunu kaydetme ve devam ettirme; başlık, klasör veya etikete göre filtreleme; sıralama, yeniden adlandırma, sabitleme, arşivleme, arşivden çıkarma ve silme.
- **Klasör ve etiketler:** İç içe, renkli ve sürükleyerek sıralanabilen klasörler, kenar çubuğu kısayolları, elle etiketleme, anahtar sözcük kuralları, yerel akıllı konu etiketleri ve klasör ağacını koruyan ZIP dışa aktarma.
- **Tam metin arama:** Mesajları yerel olarak dizine alma; ifade, konuşmacı, tarih ve zorunlu/istenmeyen sözcüklerle arama; eşleşmeleri vurgulama, ilgili mesaja gitme ve seçili eşleşmeleri Markdown olarak indirme. `Alt+Shift+F` açık sohbette arama panelini açar.
- **Dışa aktarma ve yedek:** Tek sohbeti TXT, Markdown, JSON veya CSV; seçili sohbetleri bu biçimlerde ZIP indirme. Düzenleme bilgileri için JSON veya arama dizini dâhil tam yerel içerik için AES-GCM parola şifrelemeli yedek.
- **İstem kütüphanesi ve devir:** Değişkenli istem şablonları, favoriler, arama/filtre ve on adıma kadar istem zincirleri. Uzun sohbet için ChatGPT’den tercihleri, kararları, kısıtları, tamamlanan işleri, açık konuları ve sonraki adımı içeren yapılandırılmış özet isteyin; yanıtı gözden geçirip yeni sohbete gönderilmemiş taslak olarak taşıyın. İsterseniz yalnızca son iletileri ham biçimde aktarma seçeneği de vardır.
- **Mesaj araçları:** Renkli notlu yer imleri ve aratılabilir renkli mesaj etiketleri, uzun iletileri daraltma, tarayıcı sesiyle okutma ve varsa ekli sesi indirme.
- **Medya galerisi:** Dizine alınmış sohbetlerdeki görsel, video, ses ve açık dosya bağlantılarını bulma, favorileme, yerel gizleme, seçme ve erişilebilenleri ZIP indirme.
- **Sohbet içi araçlar:** Hızlı işlem menüsü, `Ctrl+K` / `⌘K` komut paleti, panel boyutu, vurgu rengi, yazı boyutu ve liste yoğunluğu ayarları; canlı sözcük/karakter/cümle/okuma süresi sayacı, yaklaşık bağlam ölçeri ve arka plan yanıt uyarıları.
- **Kullanım özeti:** Eklenti açıkken bu tarayıcıda gözlemlenen etkinlik.

Kullanım özeti yalnızca eklenti açıkken gözlemlenen etkinliği sayar. Bağlam ölçeri karakter sayısından yaklaşık sonuç verir ve seçtiğiniz hedefle karşılaştırır; modelin gerçek sınırını göstermez. Eklenti MP3 sesi üretmez, PDF indirmez, Claude/Gemini/Grok'u desteklemez ve ücretli ekip/bulut servisleri sunmaz. Şifreli tam yedek en fazla 60 MB dosya ve açıldıktan sonra 100 MB veri kabul eder.

Birçok sohbette geçerli olmasını istediğiniz çalışma tercihlerini ChatGPT Memory veya Custom Instructions alanına; projeye özel kuralları ChatGPT Project talimatlarına ekleyin. Projects ilgili sohbetleri, dosyaları ve talimatları bir arada tutabilir; bellek ve sohbetler arası erişim hesap ayarlarına ve plana bağlıdır. Memory özeti her ayrıntıyı kapsamayabileceğinden, belirli bir sohbetin karar ve sonraki adımlarını Companion devir özetiyle taşıyın. Resmî bilgiler: [Memory](https://help.openai.com/en/articles/8590148-memory-in-chatgpt) ve [Projects](https://help.openai.com/en/articles/10169521-projects).

### Chrome'a kurulum

1. [En son GitHub sürümündeki ZIP dosyasını](https://github.com/ersagun13/chatgpt-companion/releases/latest) indirin ve ayıklayın.
2. Chrome'da `chrome://extensions` adresini açıp **Geliştirici modu**nu etkinleştirin.
3. **Paketlenmemiş öğe yükle** düğmesine basıp ayıklanan ZIP içindeki `manifest.json` dosyasını barındıran klasörü seçin.
4. [chatgpt.com](https://chatgpt.com/) sayfasını açın veya yenileyin; oturum açtıktan sonra eklenti simgesine ya da **CC** düğmesine basın.

İlk kurulumda **Sohbetleri yönet → Tüm geçmişi yükle**, ardından mesajlarda arama için **Sohbet ara → Tüm sohbetleri tara** adımlarını kullanın. Katalog yükleme ve sohbet metinlerini dizine alma ayrı işlemlerdir. 0.7.0 sürümüne geçince önceki yerel kayıtları ve yeni medya bağlantılarını güncellemek için dizin taramasını yeniden başlatın. ChatGPT'nin oturumunuzdan erişilemeyen sohbetleri listelenemez; tam geçmişe erişim garantisi yoktur.

### Neden indirmeli?

- Sohbetleri ayrı bir uygulamaya kopyalamadan ChatGPT'nin içinde düzenleyin.
- İsteğe bağlı yerel aramayla uzun konuşmaları ve belirli mesajları bulun.
- Klasör, etiket, yer imi, istem, arşivleme ve dışa aktarma araçlarını tek panelde kullanın.
- Ücretsiz MIT lisanslı kodu inceleyin; Companion hesabı, abonelik veya geliştirici sunucusu gerekmez.

Companion, OpenAI veya AI Toolbox tarafından hazırlanmış ya da desteklenmiş değildir. ChatGPT'nin özel arayüz uç noktaları değişirse sohbet yükleme ve hesap işlemleri etkilenebilir. Başarısız işlemler tamamlandı gibi gösterilmez. ChatGPT'den silinen bir sohbet kalıcı olarak silinir. Eklenti ücretsizdir; MIT lisanslıdır. Chrome Web Store'da henüz listelenmiyor.

**Güvenlik özeti:** Companion sunucusu yoktur ve sohbet dizini dışarı yüklenmez; buna karşılık tam metin arama açıldığında cihazda şifrelenmemiş yerel sohbet kopyası oluşur. Yalnızca güvendiğiniz kişisel bilgisayarda kullanın. Açık kaynak kod güvenlik denetimi yerine geçmez.

**Durum: önizleme sürümü (0.7.0).** ChatGPT hesap işlemleri belgelenmemiş uç noktalara bağlıdır ve ChatGPT değişikliklerinden etkilenebilir. Kalıcı silme geri alınamaz; Companion'ı yedek olarak görmeyin.
