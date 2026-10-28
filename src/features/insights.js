(function defineUsageInsights() {
  const CC = globalThis.ChatCompanion;
  if (!CC) return;
  const el = (...args) => CC.make(...args);
  const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  function streak(days) {
    let total = 0, cursor = new Date();
    if (!days[dayKey(cursor)]?.messages) cursor.setDate(cursor.getDate() - 1);
    while (days[dayKey(cursor)]?.messages) { total++; cursor.setDate(cursor.getDate() - 1); }
    return total;
  }
  function longestStreak(days) {
    const active = Object.entries(days).filter(([, item]) => item?.messages || item?.activeMinutes)
      .map(([date]) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000)).filter(Number.isFinite).sort((a, b) => a - b);
    let longest = 0, current = 0, previous = null;
    for (const day of active) {
      current = previous !== null && day === previous + 1 ? current + 1 : 1;
      longest = Math.max(longest, current); previous = day;
    }
    return longest;
  }
  async function downloadWrapped(summary) {
    const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1350;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, "#181526"); gradient.addColorStop(1, "#24344a"); context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#c5a7ff"; context.font = "700 34px system-ui"; context.fillText("CHATGPT COMPANION · YIL ÖZETİ", 72, 110);
    context.fillStyle = "#ffffff"; context.font = "800 76px system-ui"; context.fillText(String(summary.year), 72, 230);
    context.fillStyle = "#d8d5e4"; context.font = "400 32px system-ui"; context.fillText("Bu tarayıcıda takip edilen kullanım", 72, 292);
    const rows = [[summary.messages, "ileti"], [summary.activeDays, "aktif gün"], [summary.minutes, "aktif dakika"], [summary.longest, "en uzun günlük seri"]];
    rows.forEach(([value, label], index) => {
      const y = 420 + index * 190;
      context.fillStyle = "#ffffff"; context.font = "800 68px system-ui"; context.fillText(String(value), 76, y);
      context.fillStyle = "#b7a0ff"; context.font = "600 28px system-ui"; context.fillText(label, 76, y + 48);
      context.strokeStyle = "#ffffff22"; context.beginPath(); context.moveTo(72, y + 82); context.lineTo(1008, y + 82); context.stroke();
    });
    context.fillStyle = "#aab4c4"; context.font = "400 20px system-ui"; context.fillText("Yalnızca yerel Companion ölçümü · paylaşmadan önce gözden geçirin", 72, 1280);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return CC.ui.toast("Özet kartı oluşturulamadı.", "error");
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `chatgpt-yil-ozeti-${summary.year}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  CC.features.register({ id: "insights", titleKey: "insights", async render(container) {
    container.append(el("div", { class: "cc-view-heading" }, [el("div", {}, [el("span", { class: "cc-eyebrow", text: "KİŞİSEL ANALİTİK" }), el("h2", { text: "Kullanım özeti" }), el("p", { class: "cc-muted", text: "Yalnızca bu tarayıcıda gözlemlenen etkinliği gösterir; ChatGPT hesap kotasını tahmin etmez." })]), el("span", { class: "cc-view-icon", text: "◷" })]));
    const usage = await CC.repository.getUsage();
    const currentYear = new Date().getFullYear();
    const availableYears = [...new Set([currentYear, ...Object.keys(usage.days || {}).map((date) => Number(date.slice(0, 4))).filter(Number.isFinite)])].sort((a, b) => b - a);
    const preferredYear = Number(CC.state.insightsYear);
    const year = availableYears.includes(preferredYear) ? preferredYear : currentYear;
    const yearControl = el("select", { class: "cc-select", "aria-label": "Yıllık kullanım özeti yılı" });
    for (const availableYear of availableYears) yearControl.append(el("option", { value: String(availableYear), text: String(availableYear), selected: availableYear === year }));
    yearControl.addEventListener("change", () => { CC.state.insightsYear = Number(yearControl.value); CC.ui.render("insights"); });
    container.append(el("label", { class: "cc-field-label", text: "Yıllık özeti görüntüle" }), yearControl);
    const days = Object.entries(usage.days || {}).filter(([date]) => date.startsWith(`${year}-`));
    const messages = days.reduce((sum, [, item]) => sum + (item.messages || 0), 0);
    const minutes = days.reduce((sum, [, item]) => sum + (item.activeMinutes || 0), 0);
    const activeDays = days.filter(([, item]) => item.messages || item.activeMinutes).length;
    const currentStreak = streak(usage.days || {});
    const yearlyDays = Object.fromEntries(days);
    const yearLongestStreak = longestStreak(yearlyDays);
    const metrics = el("div", { class: "cc-metric-grid" });
    for (const [value, label, icon] of [[messages, "ileti sayıldı", "✉"], [activeDays, "aktif gün", "◷"], [minutes, "aktif dakika", "⌁"], [currentStreak, "mevcut günlük seri", "✦"]]) {
      metrics.append(el("div", { class: "cc-metric-card" }, [el("span", { class: "cc-metric-icon", text: icon }), el("strong", { text: value.toLocaleString("tr-TR") }), el("span", { class: "cc-item-meta", text: label })]));
    }
    container.append(metrics);
    container.append(el("h3", { text: "Son 30 gün" }));
    const chart = el("div", { class: "cc-usage-chart", role: "img", "aria-label": "Son 30 gündeki yerel mesaj sayısı" });
    const lastDays = [];
    for (let offset = 29; offset >= 0; offset--) { const date = new Date(); date.setDate(date.getDate() - offset); const key = dayKey(date); lastDays.push({ key, value: usage.days?.[key]?.messages || 0 }); }
    const max = Math.max(1, ...lastDays.map((item) => item.value));
    for (const item of lastDays) {
      const bar = el("div", { class: "cc-usage-bar-wrap", title: `${item.key}: ${item.value} ileti` });
      bar.append(el("i", { class: "cc-usage-bar", style: `height:${Math.max(4, Math.round(item.value / max * 100))}%` })); chart.append(bar);
    }
    container.append(chart, el("p", { class: "cc-muted", text: "Sayaç yalnızca eklenti açıkken görülen yeni mesajları ve son etkileşimi olan görünür sekme dakikalarını sayar; geçmiş kullanım verisi yoktur." }));
    const hourTotals = Array(24).fill(0);
    for (const [, item] of days) for (const [hour, minutesAtHour] of Object.entries(item.activeHours || {})) if (Number(hour) >= 0 && Number(hour) < 24) hourTotals[Number(hour)] += Number(minutesAtHour) || 0;
    const hourMax = Math.max(1, ...hourTotals);
    const hourChart = el("div", { class: "cc-hour-chart", role: "img", "aria-label": `${year} yılı için yerel saatlere göre etkin kullanım dakikaları` });
    for (const [hour, total] of hourTotals.entries()) {
      const column = el("div", { class: "cc-hour-column", title: `${String(hour).padStart(2, "0")}:00 civarı · ${total} dakika` });
      column.append(el("i", { class: "cc-usage-bar", style: `height:${Math.max(total ? 5 : 0, Math.round(total / hourMax * 100))}%` }));
      if (hour % 4 === 0) column.append(el("span", { text: String(hour).padStart(2, "0") }));
      hourChart.append(column);
    }
    container.append(el("h3", { text: `${year} · Yerel saatlere göre etkin kullanım` }), hourChart, el("p", { class: "cc-muted", text: "Saat dağılımı yalnızca eklenti açık ve sekmeyle yakın zamanda etkileşim varken sayılan dakikalara dayanır." }));
    const wrapped = el("button", { class: "cc-button cc-primary", text: `${year} özet kartını indir`, onclick: () => downloadWrapped({ year, messages, activeDays, minutes, longest: yearLongestStreak }) });
    const reset = el("button", { class: "cc-button cc-quiet", text: "Yerel kullanım verilerini temizle", onclick: async () => {
      if (!(await CC.ui.confirm("Kullanım verilerini sil", "Bu cihazda tutulan günlük sayaçlar ve etkinlik süreleri silinecek."))) return;
      await CC.repository.saveUsage({ days: {}, seenIds: [] }); await CC.ui.render("insights");
    } });
    container.append(el("div", { class: "cc-row wrap" }, [wrapped, reset]));
    const limitText = [...document.querySelectorAll('[role="alert"], [data-testid*="toast"], [data-testid*="banner"]')].map((node) => node.innerText || "").find((text) => /limit|try again later|daha sonra tekrar|sınırına ulaştınız/i.test(text));
    const limit = el("div", { class: `cc-limit-card${limitText ? " cc-limit-active" : ""}` }, [el("span", { class: "cc-limit-dot" }), el("span", { text: limitText ? `ChatGPT uyarısı: ${limitText.slice(0, 180)}` : "ChatGPT sayfasında görünür bir kota uyarısı yok." })]);
    container.append(el("h3", { text: "Görünür kota durumu" }), limit);
  }});
})();
