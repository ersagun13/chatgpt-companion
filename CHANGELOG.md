# Changelog

## 0.7.0 Preview — 2026-10-28

- Added resumable account history scans that save page checkpoints and continue after interruptions.
- Improved bulk chat action reporting so per-chat failures remain visible while other selected chats continue.
- Added tag filtering, folder nesting/reordering, per-folder ZIP export, and Markdown export for selected search matches.
- Added configurable smart topic tags and quick-action slots.
- Added prompt favorites and structured long-chat handoff: ask ChatGPT to summarize preferences, decisions, constraints, completed work, and next steps, then carry its reviewed answer to a new chat as a draft. The handoff is never auto-sent; recent-message transfer remains available as a fallback.
- Added paginated local-index reads for encrypted full backups to avoid oversized extension message transfers.
- Expanded the indexed media gallery to supported image, video, audio, and explicit file links, with selection, favorites, local hiding, and ZIP download.
- Added year selection and local-hour activity summaries; these remain estimates of activity observed while Companion is open.
- Updated privacy and installation disclosures for the encrypted full backup and media requests.

## 0.6.0 Preview — 2026-10-28

- Added ChatGPT conversation renaming from the local conversation manager.
- Added CSV export for a single conversation and ZIP exports of selected conversations.
- Added a searchable message-label dashboard with colored labels and notes.
- Added direct indexing and search for the open conversation (`Alt+Shift+F`).
- Added floating quick actions, panel appearance controls, expanded live writing counts, an approximate adjustable context meter, and configurable background completion alerts.
- Updated privacy and feature-scope documentation. The extension still stores data locally and uses no Companion server or cloud sync.

## 0.5.0 Preview — 2026-10-27

- Initial public release of the ChatGPT Companion Chrome extension.
- Local conversation catalog, folders, tags, full-text search, prompt library, bookmarks, exports, media gallery, usage summaries, and backup tools.
- English and Turkish interface strings.
- Local-first privacy disclosure and MIT license.
- Cross-origin media previews and downloads omit credentials and referrer information.

This release depends on ChatGPT interface endpoints that are not public extension APIs. Some features may require updates if ChatGPT changes its website.
