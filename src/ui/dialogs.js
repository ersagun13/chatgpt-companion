(function registerDialogs() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  CC.ui = CC.ui || {};
  CC.ui.confirm = (title, message, { confirmText, danger = false } = {}) => new Promise((resolve) => {
    if (!CC.state.shadow) { resolve(false); return; }
    const overlay = CC.make("div", { class: "cc-modal-backdrop", role: "presentation" });
    const card = CC.make("section", { class: "cc-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    card.append(CC.make("h2", { text: title }), CC.make("p", { text: message }));
    const actions = CC.make("div", { class: "cc-modal-actions" });
    const cancel = CC.make("button", { class: "cc-button cc-secondary", text: CC.tr("cancel"), onclick: () => finish(false) });
    const proceed = CC.make("button", { class: `cc-button ${danger ? "cc-danger" : "cc-primary"}`, text: confirmText || CC.tr("confirm"), onclick: () => finish(true) });
    actions.append(cancel, proceed);
    card.append(actions);
    overlay.append(card);
    CC.state.shadow.append(overlay);
    function finish(value) { overlay.remove(); resolve(value); }
    overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(false); });
    cancel.focus();
  });

  CC.ui.prompt = (title, message, initial = "") => new Promise((resolve) => {
    if (!CC.state.shadow) { resolve(null); return; }
    const overlay = CC.make("div", { class: "cc-modal-backdrop", role: "presentation" });
    const card = CC.make("section", { class: "cc-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    const input = CC.make("input", { class: "cc-input", value: initial, "aria-label": title });
    const actions = CC.make("div", { class: "cc-modal-actions" });
    const cancel = CC.make("button", { class: "cc-button cc-secondary", text: CC.tr("cancel"), onclick: () => finish(null) });
    const save = CC.make("button", { class: "cc-button cc-primary", text: CC.tr("save"), onclick: () => finish(input.value.trim()) });
    actions.append(cancel, save);
    card.append(CC.make("h2", { text: title }), CC.make("p", { text: message }), input, actions);
    overlay.append(card);
    CC.state.shadow.append(overlay);
    function finish(value) { overlay.remove(); resolve(value); }
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") finish(input.value.trim()); if (event.key === "Escape") finish(null); });
    input.focus();
  });

  CC.ui.password = (title, message, confirmAgain = false) => new Promise((resolve) => {
    if (!CC.state.shadow) { resolve(null); return; }
    const overlay = CC.make("div", { class: "cc-modal-backdrop", role: "presentation" });
    const card = CC.make("section", { class: "cc-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    const first = CC.make("input", { class: "cc-input", type: "password", autocomplete: confirmAgain ? "new-password" : "current-password", placeholder: confirmAgain ? "Yeni yedek parolası" : "Yedek parolası", "aria-label": "Yedek parolası" });
    const second = confirmAgain ? CC.make("input", { class: "cc-input", type: "password", autocomplete: "new-password", placeholder: "Parolayı tekrar yazın", "aria-label": "Yedek parolası tekrarı" }) : null;
    const feedback = CC.make("p", { class: "cc-muted", hidden: true });
    const actions = CC.make("div", { class: "cc-modal-actions" });
    const cancel = CC.make("button", { class: "cc-button cc-secondary", text: CC.tr("cancel"), onclick: () => finish(null) });
    const submit = CC.make("button", { class: "cc-button cc-primary", text: confirmAgain ? "Şifreli yedeği oluştur" : "Yedeği aç", onclick: complete });
    actions.append(cancel, submit);
    card.append(CC.make("h2", { text: title }), CC.make("p", { text: message }), first);
    if (second) card.append(second);
    card.append(feedback, actions); overlay.append(card); CC.state.shadow.append(overlay);
    function finish(value) { overlay.remove(); resolve(value); }
    function complete() {
      if (first.value.length < 12) { feedback.textContent = "Yedek parolası en az 12 karakter olmalı."; feedback.hidden = false; first.focus(); return; }
      if (second && first.value !== second.value) { feedback.textContent = "Parolalar eşleşmiyor."; feedback.hidden = false; second.focus(); return; }
      finish(first.value);
    }
    for (const input of [first, second].filter(Boolean)) input.addEventListener("keydown", (event) => { if (event.key === "Enter") complete(); if (event.key === "Escape") finish(null); });
    overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(null); });
    first.focus();
  });
})();
