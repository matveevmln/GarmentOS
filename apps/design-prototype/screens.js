/* Экраны прототипа. Один markup — CSS перестраивает композицию по ширине. */

const badge = (map, key) => `<span class="badge ${map[key].cls}">${map[key].label}</span>`;
const icon = (id, size = 18) => `<svg class="ico" width="${size}" height="${size}"><use href="#i-${id}"/></svg>`;

const emptyState = (ico, title, msg, action) => `
  <div class="state">
    <span class="ico-box">${icon(ico, 22)}</span>
    <div class="t">${title}</div>
    <div class="m">${msg}</div>
    ${action || ""}
  </div>`;

/* ---------- Следующее действие: вычисляется ТОЛЬКО из реальных признаков ---------- */
function nextActions(b) {
  const out = [];
  const unpaid = b.invoices.find((i) => i.status === "issued" || i.status === "overdue");
  if (b.daysOverdue) {
    out.push({ tone: "danger", ico: "clock", title: `Просрочка ${b.daysOverdue} дн.`, sub: `Срок сдачи цехом был ${b.dueDate}` });
  }
  if (unpaid) {
    out.push({ tone: "warning", ico: "cash", title: "Неоплаченный счёт", sub: `${money0(unpaid.amount)} · срок до ${unpaid.dueDate}` });
  }
  if (!b.documents.some((d) => d.isCurrentVersion && d.docType === "specification")) {
    out.push({ tone: "warning", ico: "doc", title: "Нет актуальной спецификации", sub: "Сформируйте спецификацию для цеха" });
  }
  return out;
}

const actionRow = (a) => `
  <button class="action-row">
    <span class="ico-box" style="background:var(--${a.tone}-tint);color:var(--${a.tone})">${icon(a.ico, 17)}</span>
    <span class="body"><b>${a.title}</b><span>${a.sub}</span></span>
    ${icon("chevron", 16)}
  </button>`;

/* ---------- Stepper на РЕАЛЬНЫХ статусах ---------- */
function stepper(status) {
  if (status === "cancelled") {
    return `<div class="alert alert-danger">${icon("alert", 18)}<div class="body"><b>Заказ отменён</b></div></div>`;
  }
  const cur = STATUS_FLOW.indexOf(status);
  return `<div class="stepper">` + STATUS_FLOW.map((s, i) => {
    const cls = i < cur ? "done" : i === cur ? "current" : "";
    const mark = i < cur ? icon("check", 13) : i + 1;
    return `<div class="step ${cls}">
      <div class="track"><span class="knob">${mark}</span><span class="line"></span></div>
      <div><div class="cap"><span class="cap-full">${STATUS[s].label}</span><span class="cap-short">${STATUS[s].short}</span></div></div>
    </div>`;
  }).join("") + `</div>`;
}

/* ================= DASHBOARD ================= */
function scrDashboard() {
  const inWork = BATCHES.filter((b) => ["placed", "in_progress", "ready_for_pickup"].includes(b.status));
  const overdue = BATCHES.filter((b) => b.overdue);
  return `
  <div class="pagehead"><div class="pagehead-row"><div>
    <h1>Что требует внимания</h1>
    <div class="sub">23 августа 2026</div>
  </div></div></div>

  <div class="metrics" style="margin-bottom:var(--s-4)">
    <div class="metric"><span class="label">Партий в работе</span><span class="value num">${inWork.length}</span></div>
    <div class="metric"><span class="label">Просрочено</span><span class="value num" style="color:var(--danger)">${overdue.length}</span></div>
    <div class="metric"><span class="label">Неоплаченных счетов</span><span class="value num" style="color:var(--warning)">1</span></div>
    <div class="metric"><span class="label">Партий всего</span><span class="value num">${BATCHES.length}</span></div>
  </div>

  <div class="grid cols-2">
    <div class="stack-4">
      ${overdue.length ? `
      <div class="card"><div class="card-head"><h3>Требует действия</h3></div>
        <div class="card-body stack">
          ${overdue.map((b) => `<button class="action-row">
            <span class="ico-box" style="background:var(--danger-tint);color:var(--danger)">${icon("clock", 17)}</span>
            <span class="body"><b>Партия #${b.id} — ${b.product}</b><span>Просрочка ${b.overdue} дн. · цех ${b.workshop}</span></span>
            ${icon("chevron", 16)}</button>`).join("")}
          <button class="action-row">
            <span class="ico-box" style="background:var(--warning-tint);color:var(--warning)">${icon("cash", 17)}</span>
            <span class="body"><b>Счёт по партии #158</b><span>${money0(864000)} · срок до 28.08.2026</span></span>
            ${icon("chevron", 16)}</button>
        </div></div>` : ""}

      <div class="card"><div class="card-head"><h3>Партии в работе</h3>
        <button class="btn btn-ghost btn-sm" data-go="batches">Все ${icon("chevron", 14)}</button></div>
        <div class="card-body tight list">
          ${inWork.map((b) => `<button class="listcard" data-go="passport">
            <span class="thumb">#${b.id}</span>
            <span class="body"><span class="title">${b.product}</span>
              <span class="meta"><span>${b.workshop}</span><span class="num">${qty(b.qty)} шт</span><span>до ${b.due}</span></span></span>
            <span class="right">${badge(STATUS, b.status)}</span></button>`).join("")}
        </div></div>
    </div>

    <div class="stack-4">
      <div class="card"><div class="card-head"><h3>Последние документы</h3></div>
        <div class="card-body tight">
          ${ALL_DOCS.slice(0, 4).map((d) => `<div class="docrow">
            <span class="ico-box">${icon("doc", 17)}</span>
            <span class="body"><span class="title">${d.title} ${d.current ? '<span class="ver current">актуальная</span>' : `<span class="ver">v${d.ver}</span>`}</span>
              <span class="meta">${d.batch} · ${d.date}</span></span>
            <span class="acts"><button class="iconbtn">${icon("download", 16)}</button></span></div>`).join("")}
        </div></div>

      <div class="card"><div class="card-head"><h3>Последние события</h3></div>
        <div class="card-body">
          <div class="timeline">
            ${BATCH.timeline.slice().reverse().slice(0, 4).map((t, i) => `<div class="tl-item">
              <div class="tl-rail"><span class="tl-dot ${i === 0 ? "current" : "done"}"></span><span class="tl-line"></span></div>
              <div class="tl-body"><div class="t">${t.label}</div><div class="m">${t.occurredAt} · ${t.who}</div></div>
            </div>`).join("")}
          </div>
        </div></div>
    </div>
  </div>`;
}

/* ================= СПИСОК ПАРТИЙ ================= */
function scrBatches() {
  return `
  <div class="pagehead"><div class="pagehead-row">
    <div><h1>Партии</h1><div class="sub">Все производственные партии</div></div>
    <div class="pagehead-actions hide-mobile"><button class="btn btn-primary">${icon("plus", 16)} Создать партию</button></div>
  </div></div>

  <div class="filterbar">
    <div class="searchbox">${icon("search", 16)} Поиск по партиям, моделям, цехам…</div>
    <div class="chips">
      <button class="chip active">Все</button>
      <button class="chip">В производстве</button>
      <button class="chip">Размещены</button>
      <button class="chip">Готовы</button>
      <button class="chip">Принято</button>
    </div>
  </div>

  <!-- Desktop: таблица -->
  <div class="card hide-mobile"><div class="card-body flush"><div class="table-wrap">
    <table class="data"><thead><tr>
      <th>№</th><th>Модель</th><th>Цех</th><th class="r">Кол-во</th><th>Статус</th><th class="r">Сумма партии</th><th>Срок</th><th></th>
    </tr></thead><tbody>
      ${BATCHES.map((b) => `<tr>
        <td><b class="num">#${b.id}</b></td>
        <td>${b.product}</td>
        <td class="muted">${b.workshop}</td>
        <td class="r num">${qty(b.qty)}</td>
        <td>${badge(STATUS, b.status)}</td>
        <td class="r num">${b.total ? money0(b.total) : '<span class="muted-3">—</span>'}</td>
        <td class="num ${b.overdue ? "" : "muted"}" ${b.overdue ? 'style="color:var(--danger)"' : ""}>${b.due || "—"}${b.overdue ? ` (+${b.overdue})` : ""}</td>
        <td class="r"><button class="iconbtn" data-go="passport">${icon("chevron", 16)}</button></td>
      </tr>`).join("")}
    </tbody></table></div></div></div>

  <!-- Mobile: карточки -->
  <div class="list only-mobile">
    ${BATCHES.map((b) => `<button class="listcard" data-go="passport">
      <span class="thumb">#${b.id}</span>
      <span class="body"><span class="title">${b.product}</span>
        <span class="meta"><span>${b.workshop}</span><span class="num">${qty(b.qty)} шт</span>
        ${b.total ? `<span class="num">${money0(b.total)}</span>` : ""}
        ${b.overdue ? `<span style="color:var(--danger)">просрочка ${b.overdue} дн.</span>` : b.due ? `<span>до ${b.due}</span>` : ""}</span></span>
      <span class="right">${badge(STATUS, b.status)}</span></button>`).join("")}
  </div>

  <div class="sticky-action only-mobile">
    <button class="btn btn-primary btn-block">${icon("plus", 16)} Создать партию</button>
  </div>`;
}

/* ================= ПАСПОРТ ПАРТИИ ================= */
function scrPassport() {
  const b = BATCH, cs = b.costSnapshot;
  const acts = nextActions(b);
  const paidPct = Math.round((b.paid / b.total) * 100);
  const diff = cs.actualCostPerUnit - cs.specificationPricePerUnit;

  const metrics = `
  <div class="metrics">
    <div class="metric">
      <span class="label">Фактическая себестоимость</span>
      <span class="value num">${money(cs.actualCostPerUnit)}<span class="unit">/ шт</span></span>
      <span class="hint">Спецификация: <b class="num">${money(cs.specificationPricePerUnit)}</b>
        <span style="color:var(--${diff > 0 ? "warning" : "success"})">${diff > 0 ? "+" : ""}${diff.toFixed(2)} ₽</span></span>
    </div>
    <div class="metric">
      <span class="label">Сумма партии</span>
      <span class="value num">${money0(b.total)}</span>
      <span class="hint num">${qty(b.plannedQuantity)} шт × ${money(cs.specificationPricePerUnit)}</span>
    </div>
    <div class="metric">
      <span class="label">Оплачено</span>
      <span class="value num" style="color:var(--success)">${money0(b.paid)}</span>
      <span class="bar"><i class="ok" style="width:${paidPct}%"></i></span>
      <span class="hint num">${paidPct}% от суммы партии</span>
    </div>
    <div class="metric">
      <span class="label">Остаток к оплате</span>
      <span class="value num">${money0(b.due)}</span>
      <span class="bar"><i class="warn" style="width:${100 - paidPct}%"></i></span>
      <span class="hint num">${100 - paidPct}% · срок до ${b.invoices[1].dueDate}</span>
    </div>
  </div>`;

  const production = `
  <div class="card"><div class="card-head"><h3>Прогресс производства</h3>
    <span class="muted-3" style="font-size:var(--t-meta)">статус от цеха</span></div>
    <div class="card-body">${stepper(b.status)}</div></div>`;

  const economics = `
  <div class="card"><div class="card-head"><h3>Экономика партии</h3>
    <span class="muted-3" style="font-size:var(--t-meta)">Snapshot ${cs.capturedAt}</span></div>
    <div class="card-body flush"><div class="table-wrap">
      <table class="data"><thead><tr><th>Статья</th><th class="r">Себестоимость / шт</th><th class="r">Сумма</th><th class="r">Доля</th></tr></thead>
      <tbody>${COST_ROWS.map((r) => {
        const share = Math.round((r.per / cs.actualCostPerUnit) * 100);
        return `<tr><td>${r.name}</td><td class="r num">${money(r.per)}</td>
        <td class="r num">${money0(r.per * b.plannedQuantity)}</td>
        <td class="r"><span class="row" style="justify-content:flex-end;gap:var(--s-2)">
          <span class="num muted">${share}%</span>
          <span class="bar" style="width:44px"><i style="width:${share}%;background:${r.color}"></i></span></span></td></tr>`;
      }).join("")}</tbody>
      <tfoot><tr><td>Итого себестоимость</td><td class="r num">${money(cs.actualCostPerUnit)}</td>
        <td class="r num">${money0(cs.actualCostPerUnit * b.plannedQuantity)}</td><td class="r num">100%</td></tr></tfoot>
      </table></div></div></div>`;

  const documents = `
  <div class="card"><div class="card-head"><h3>Документы</h3>
    <button class="btn btn-ghost btn-sm">Все</button></div>
    <div class="card-body tight">
      ${b.documents.map((d) => `<div class="docrow">
        <span class="ico-box">${icon("doc", 17)}</span>
        <span class="body"><span class="title">${d.title}
          ${d.isCurrentVersion ? '<span class="ver current">актуальная</span>' : `<span class="ver">v${d.version}</span>`}</span>
          <span class="meta">PDF · ${d.issuedAt}</span></span>
        <span class="acts"><button class="iconbtn">${icon("eye", 16)}</button>
          <button class="iconbtn">${icon("download", 16)}</button></span></div>`).join("")}
    </div></div>`;

  const nextAction = acts.length ? `
  <div class="card"><div class="card-head"><h3>Требует внимания</h3></div>
    <div class="card-body stack">${acts.map(actionRow).join("")}</div></div>` : "";

  const variants = `
  <div class="card"><div class="card-head"><h3>Размеры и цвета</h3>
    <span class="muted-3" style="font-size:var(--t-meta)">${qty(b.plannedQuantity)} шт</span></div>
    <div class="card-body flush"><div class="table-wrap">
      <table class="data"><thead><tr><th>Цвет</th><th>Размер</th><th class="r">Количество</th></tr></thead>
      <tbody>${b.variants.map((v) => `<tr><td>${v.color}</td><td class="num">${v.size}</td>
        <td class="r num">${qty(v.quantity)}</td></tr>`).join("")}</tbody></table></div></div></div>`;

  const history = `
  <div class="card"><div class="card-head"><h3>История</h3></div>
    <div class="card-body"><div class="timeline">
      ${b.timeline.map((t) => `<div class="tl-item">
        <div class="tl-rail"><span class="tl-dot ${t.state}"></span><span class="tl-line"></span></div>
        <div class="tl-body"><div class="t">${t.label}</div><div class="m">${t.occurredAt} · ${t.who}</div></div>
      </div>`).join("")}
    </div></div></div>`;

  const contract = `
  <div class="card"><div class="card-head"><h3>Договор и условия</h3></div>
    <div class="card-body"><div class="kv">
      <div class="kv-row"><span class="k">Договор</span><span class="v">№${cs.contractNumber} от ${cs.contractDate}</span></div>
      <div class="kv-row"><span class="k">Заказчик</span><span class="v">${cs.customerName}</span></div>
      <div class="kv-row"><span class="k">Исполнитель</span><span class="v">${cs.contractorName}</span></div>
      <div class="kv-row"><span class="k">Доставка</span><span class="v">${cs.deliveryMethod}</span></div>
    </div>
    <div style="margin-top:var(--s-3);font-size:var(--t-meta);color:var(--text-2);line-height:1.5">${cs.paymentTerms}</div>
    </div></div>`;

  const materialsEmpty = `
  <div class="card"><div class="card-head"><h3>Материалы партии</h3></div>
    ${emptyState("layers", "Чек-лист материалов пока недоступен",
      "Появится, когда будет подключён механизм резервирования материалов под конкретную партию. Сейчас нормы расхода хранятся в BOM модели, но связь «партия ↔ фактически переданный материал» ещё не реализована.")}
  </div>`;

  return `
  <div class="pagehead"><div class="pagehead-row">
    <div>
      <div class="row wrap" style="gap:var(--s-3)">
        <h1>Партия #${b.id}</h1>${badge(STATUS, b.status)}
      </div>
      <div class="sub">${b.product.name} · ${b.workshop.name} · <span class="num">${qty(b.plannedQuantity)} изделий</span></div>
    </div>
    <div class="pagehead-actions hide-mobile">
      <button class="btn btn-secondary">Действия</button>
      <button class="btn btn-primary">${icon("download", 16)} Спецификация</button>
    </div>
  </div></div>

  ${metrics}

  <!-- ===== DESKTOP: рабочее пространство ===== -->
  <div class="hide-mobile" style="margin-top:var(--s-4)">
    <div class="stack-4">
      ${production}
      <div class="split">
        <div class="stack-4">${economics}${variants}${materialsEmpty}</div>
        <div class="stack-4">${nextAction}${documents}${contract}${history}</div>
      </div>
    </div>
  </div>

  <!-- ===== MOBILE: сводка + разделы ===== -->
  <div class="only-mobile stack-4" style="margin-top:var(--s-4)">
    ${production}
    ${nextAction}
    <div>
      <div class="caption" style="margin-bottom:var(--s-2)">Разделы</div>
      <div class="section-list">
        <button class="section-link" data-go="p-economics"><span class="ico-box" style="color:var(--success)">${icon("cash", 16)}</span><span class="label">Экономика</span><span class="count num">${money(cs.actualCostPerUnit)}</span>${icon("chevron", 15)}</button>
        <button class="section-link" data-go="p-variants"><span class="ico-box" style="color:var(--info)">${icon("grid", 16)}</span><span class="label">Размеры и цвета</span><span class="count num">${b.variants.length}</span>${icon("chevron", 15)}</button>
        <button class="section-link" data-go="p-materials"><span class="ico-box" style="color:var(--warning)">${icon("layers", 16)}</span><span class="label">Материалы</span><span class="count">нет данных</span>${icon("chevron", 15)}</button>
        <button class="section-link" data-go="p-documents"><span class="ico-box" style="color:var(--primary)">${icon("doc", 16)}</span><span class="label">Документы</span><span class="count num">${b.documents.length}</span>${icon("chevron", 15)}</button>
        <button class="section-link" data-go="p-contract"><span class="ico-box">${icon("shield", 16)}</span><span class="label">Договор и условия</span>${icon("chevron", 15)}</button>
        <button class="section-link" data-go="p-history"><span class="ico-box">${icon("clock", 16)}</span><span class="label">История</span><span class="count num">${b.timeline.length}</span>${icon("chevron", 15)}</button>
      </div>
    </div>
    <div class="sticky-action">
      <button class="btn btn-primary btn-block">${icon("download", 16)} Скачать спецификацию</button>
    </div>
  </div>`;
}

/* ---- Подэкраны паспорта (mobile) ---- */
function subScreen(title, inner) { return `<div class="stack-4">${inner}</div>`; }

function scrPEconomics() {
  const b = BATCH, cs = b.costSnapshot;
  return subScreen("Экономика", `
    <div class="metrics" style="grid-template-columns:repeat(2,1fr)">
      <div class="metric"><span class="label">Себестоимость</span><span class="value num">${money(cs.actualCostPerUnit)}</span><span class="hint">/ шт</span></div>
      <div class="metric"><span class="label">Спецификация</span><span class="value num">${money(cs.specificationPricePerUnit)}</span><span class="hint">/ шт</span></div>
    </div>
    <div class="card"><div class="card-head"><h3>Структура себестоимости</h3></div>
      <div class="card-body"><div class="kv">
      ${COST_ROWS.map((r) => `<div class="kv-row">
        <span class="k row" style="gap:var(--s-2)"><i style="width:8px;height:8px;border-radius:2px;background:${r.color};display:block"></i>${r.name}</span>
        <span class="v num">${money(r.per)} <span class="muted-3">· ${Math.round((r.per / cs.actualCostPerUnit) * 100)}%</span></span></div>`).join("")}
      </div></div></div>
    <div class="card"><div class="card-head"><h3>Оплата</h3></div><div class="card-body"><div class="kv">
      <div class="kv-row"><span class="k">Сумма партии</span><span class="v num">${money0(b.total)}</span></div>
      <div class="kv-row"><span class="k">Оплачено</span><span class="v num" style="color:var(--success)">${money0(b.paid)}</span></div>
      <div class="kv-row"><span class="k">Остаток</span><span class="v num" style="color:var(--warning)">${money0(b.due)}</span></div>
    </div>
    <div style="margin-top:var(--s-3)" class="stack">
      ${b.invoices.map((i) => `<div class="row-between" style="padding:var(--s-2) 0">
        <span>${badge(INVOICE_STATUS, i.status)}<span class="muted" style="margin-left:var(--s-2);font-size:var(--t-meta)">до ${i.dueDate}</span></span>
        <b class="num">${money0(i.amount)}</b></div>`).join("")}
    </div></div></div>
    <div class="card"><div class="card-body"><div class="caption" style="margin-bottom:var(--s-2)">Snapshot</div>
      <div class="muted" style="font-size:var(--t-meta);line-height:1.5">Зафиксирован ${cs.capturedAt} при подтверждении заказа и не пересчитывается — даже если цены материалов изменились после.</div>
    </div></div>`);
}

function scrPVariants() {
  return `<div class="card"><div class="card-body flush"><div class="table-wrap">
    <table class="data"><thead><tr><th>Цвет</th><th>Размер</th><th class="r">Кол-во</th></tr></thead>
    <tbody>${BATCH.variants.map((v) => `<tr><td>${v.color}</td><td class="num">${v.size}</td><td class="r num">${qty(v.quantity)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="2">Итого</td><td class="r num">${qty(BATCH.plannedQuantity)}</td></tr></tfoot>
    </table></div></div></div>`;
}

function scrPMaterials() {
  return `<div class="card">${emptyState("layers", "Чек-лист материалов пока недоступен",
    "Появится, когда будет подключён механизм резервирования материалов под конкретную партию. Нормы расхода уже хранятся в BOM модели — не хватает связи «партия ↔ фактически переданный материал».",
    `<button class="btn btn-secondary btn-sm">Открыть BOM модели</button>`)}</div>`;
}

function scrPDocuments() {
  return `<div class="card"><div class="card-body tight">
    ${BATCH.documents.map((d) => `<div class="docrow">
      <span class="ico-box">${icon("doc", 17)}</span>
      <span class="body"><span class="title">${d.title}
        ${d.isCurrentVersion ? '<span class="ver current">актуальная</span>' : `<span class="ver">v${d.version}</span>`}</span>
        <span class="meta">PDF · ${d.issuedAt}</span></span>
      <span class="acts"><button class="iconbtn">${icon("download", 16)}</button></span></div>`).join("")}
  </div></div>`;
}

function scrPContract() {
  const cs = BATCH.costSnapshot;
  return `<div class="card"><div class="card-body"><div class="kv">
    <div class="kv-row"><span class="k">Договор</span><span class="v">№${cs.contractNumber}</span></div>
    <div class="kv-row"><span class="k">Дата</span><span class="v num">${cs.contractDate}</span></div>
    <div class="kv-row"><span class="k">Заказчик</span><span class="v">${cs.customerName}</span></div>
    <div class="kv-row"><span class="k">Исполнитель</span><span class="v">${cs.contractorName}</span></div>
    <div class="kv-row"><span class="k">Доставка</span><span class="v">${cs.deliveryMethod}</span></div>
  </div>
  <div class="caption" style="margin:var(--s-4) 0 var(--s-2)">Условия оплаты</div>
  <div class="muted" style="font-size:var(--t-body);line-height:1.55">${cs.paymentTerms}</div>
  </div></div>`;
}

function scrPHistory() {
  return `<div class="card"><div class="card-body"><div class="timeline">
    ${BATCH.timeline.map((t) => `<div class="tl-item">
      <div class="tl-rail"><span class="tl-dot ${t.state}"></span><span class="tl-line"></span></div>
      <div class="tl-body"><div class="t">${t.label}</div><div class="m">${t.occurredAt} · ${t.who}</div></div>
    </div>`).join("")}
  </div></div></div>`;
}

/* ================= МОДЕЛИ ================= */
function scrModels() {
  return `
  <div class="pagehead"><div class="pagehead-row">
    <div><h1>Модели</h1><div class="sub">Каталог моделей и SKU</div></div>
    <div class="pagehead-actions hide-mobile"><button class="btn btn-primary">${icon("plus", 16)} Создать модель</button></div>
  </div></div>
  <div class="filterbar"><div class="searchbox">${icon("search", 16)} Поиск по моделям…</div></div>
  <div class="grid cols-3" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
    ${MODELS.map((m) => `<button class="card" style="text-align:left">
      <div style="aspect-ratio:4/3;background:var(--surface-2);display:grid;place-items:center;color:var(--text-3);border-bottom:1px solid var(--border)">
        <div style="text-align:center"><div style="font-size:22px;font-weight:700;opacity:0.5">${m.code.split("-")[1]?.slice(0, 2) || "??"}</div>
        <div style="font-size:10px;margin-top:4px">нет фото</div></div>
      </div>
      <div class="card-body tight">
        <div style="font-weight:650">${m.name}</div>
        <div class="muted" style="font-size:var(--t-meta);margin-top:2px">${m.code} · ${m.variants} SKU</div>
        <div style="margin-top:var(--s-2)">
          <span class="badge ${m.bom === "утверждён" ? "s-ready" : "s-draft"}">BOM ${m.bom}</span>
        </div>
      </div></button>`).join("")}
  </div>`;
}

/* ================= МАТЕРИАЛЫ ================= */
function scrMaterials() {
  return `
  <div class="pagehead"><div class="pagehead-row">
    <div><h1>Материалы</h1><div class="sub">Справочник тканей, фурнитуры и упаковки</div></div>
    <div class="pagehead-actions hide-mobile"><button class="btn btn-primary">${icon("plus", 16)} Добавить</button></div>
  </div></div>
  <div class="filterbar">
    <div class="searchbox">${icon("search", 16)} Поиск по материалам…</div>
    <div class="chips"><button class="chip active">Все</button><button class="chip">Ткани</button><button class="chip">Фурнитура</button><button class="chip">Упаковка</button></div>
  </div>

  <div class="alert alert-warning" style="margin-bottom:var(--s-4)">${icon("alert", 17)}
    <div class="body"><b>Остатки пока не отображаются</b><span>Таблица остатков материалов существует в БД, но GET-эндпоинт ещё не реализован (см. UI-requirement R-3).</span></div></div>

  <div class="card hide-mobile"><div class="card-body flush"><div class="table-wrap">
    <table class="data"><thead><tr><th>Материал</th><th>Артикул</th><th>Тип</th><th>Ед.</th><th>Поставщик</th></tr></thead>
    <tbody>${MATERIALS.map((m) => `<tr><td><b>${m.name}</b></td><td class="muted num">${m.code}</td>
      <td>${MATERIAL_TYPE[m.type]}</td><td class="muted">${m.unit}</td><td class="muted">${m.supplier}</td></tr>`).join("")}
    </tbody></table></div></div></div>

  <div class="list only-mobile">
    ${MATERIALS.map((m) => `<button class="listcard"><span class="thumb">${icon("layers", 17)}</span>
      <span class="body"><span class="title">${m.name}</span>
        <span class="meta"><span class="num">${m.code}</span><span>${MATERIAL_TYPE[m.type]}</span><span>${m.supplier}</span></span></span>
      ${icon("chevron", 15)}</button>`).join("")}
  </div>`;
}

/* ================= ЗАКУПКИ ================= */
function scrPurchases() {
  return `
  <div class="pagehead"><div class="pagehead-row">
    <div><h1>Закупки</h1><div class="sub">Заказы материалов у поставщиков</div></div>
    <div class="pagehead-actions hide-mobile"><button class="btn btn-primary">${icon("plus", 16)} Создать закупку</button></div>
  </div></div>
  <div class="filterbar"><div class="searchbox">${icon("search", 16)} Поиск по закупкам…</div>
    <div class="chips"><button class="chip active">Все</button><button class="chip">Черновики</button><button class="chip">Отправлены</button><button class="chip">Получены</button></div></div>

  <div class="card hide-mobile"><div class="card-body flush"><div class="table-wrap">
    <table class="data"><thead><tr><th>№</th><th>Поставщик</th><th class="r">Позиций</th><th class="r">Сумма</th><th>Статус</th><th>Ожидается</th></tr></thead>
    <tbody>${PURCHASES.map((p) => `<tr><td><b class="num">${p.id}</b></td><td>${p.supplier}</td>
      <td class="r num">${p.positions}</td><td class="r num">${money0(p.sum)}</td>
      <td>${badge(PO_STATUS, p.status)}</td><td class="muted num">${p.expected || "—"}</td></tr>`).join("")}
    </tbody></table></div></div></div>

  <div class="list only-mobile">
    ${PURCHASES.map((p) => `<button class="listcard"><span class="thumb">${icon("cart", 17)}</span>
      <span class="body"><span class="title">${p.supplier}</span>
        <span class="meta"><span class="num">${p.id}</span><span class="num">${money0(p.sum)}</span>${p.expected ? `<span>до ${p.expected}</span>` : ""}</span></span>
      <span class="right">${badge(PO_STATUS, p.status)}</span></button>`).join("")}
  </div>`;
}

/* ================= СКЛАДЫ / ПОСТАВЩИКИ / ЦЕХА ================= */
function scrWarehouses() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Склады</h1><div class="sub">Места хранения</div></div>
    <div class="pagehead-actions hide-mobile"><button class="btn btn-primary">${icon("plus", 16)} Добавить склад</button></div></div></div>
  <div class="alert alert-warning" style="margin-bottom:var(--s-4)">${icon("alert", 17)}
    <div class="body"><b>Остатки на складах пока не отображаются</b><span>Нужен GET-эндпоинт остатков (UI-requirement R-3). Сейчас доступен только список складов.</span></div></div>
  <div class="list">${WAREHOUSES.map((w) => `<button class="listcard">
    <span class="thumb">${icon("store", 17)}</span>
    <span class="body"><span class="title">${w.name}</span><span class="meta"><span>${w.type}</span><span>${w.location}</span></span></span>
    ${icon("chevron", 15)}</button>`).join("")}</div>`;
}

function scrSuppliers() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Поставщики</h1><div class="sub">Контрагенты по материалам</div></div>
    <div class="pagehead-actions hide-mobile"><button class="btn btn-primary">${icon("plus", 16)} Добавить</button></div></div></div>
  <div class="list">${SUPPLIERS.map((s) => `<button class="listcard">
    <span class="thumb">${icon("users", 17)}</span>
    <span class="body"><span class="title">${s.name}</span><span class="meta"><span>${s.type}</span></span></span>
    <span class="right"><span class="badge s-ready">${s.status}</span></span></button>`).join("")}</div>`;
}

function scrWorkshops() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Цеха</h1><div class="sub">Подрядные швейные производства</div></div>
    <div class="pagehead-actions hide-mobile"><button class="btn btn-primary">${icon("plus", 16)} Добавить цех</button></div></div></div>
  <div class="list">${WORKSHOPS.map((w) => `<button class="listcard">
    <span class="thumb">${icon("factory", 17)}</span>
    <span class="body"><span class="title">${w.name}</span>
      <span class="meta"><span>Договор №${w.contract}</span><span class="num">спецификаций: ${w.spec}</span></span></span>
    <span class="right">${w.telegram ? '<span class="badge s-ready">Telegram</span>' : '<span class="badge s-draft">Нет чата</span>'}</span></button>`).join("")}</div>`;
}

/* ================= ДОКУМЕНТЫ ================= */
function scrDocuments() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Документы</h1><div class="sub">Все документы компании</div></div></div></div>
  <div class="filterbar"><div class="searchbox">${icon("search", 16)} Поиск по документам…</div>
    <div class="chips"><button class="chip active">Все</button><button class="chip">Спецификации</button><button class="chip">Актуальные</button></div></div>
  <div class="card"><div class="card-body tight">
    ${ALL_DOCS.map((d) => `<div class="docrow">
      <span class="ico-box">${icon("doc", 17)}</span>
      <span class="body"><span class="title">${d.title}
        ${d.current ? '<span class="ver current">актуальная</span>' : `<span class="ver">версия ${d.ver}</span>`}</span>
        <span class="meta">${d.type} · ${d.batch} · ${d.date}</span></span>
      <span class="acts"><button class="iconbtn">${icon("eye", 16)}</button><button class="iconbtn">${icon("download", 16)}</button></span>
    </div>`).join("")}
  </div></div>`;
}

/* ================= ФИНАНСЫ — честный empty ================= */
function scrFinance() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Финансы</h1><div class="sub">Счета, платежи, себестоимость</div></div></div></div>
  <div class="card">${emptyState("lock", "Раздел пока недоступен для просмотра",
    "Счета, транзакции и записи себестоимости уже создаются системой и хранятся в базе — но эндпоинтов для их чтения ещё нет, поэтому показывать здесь нечего. Выдуманные цифры в этом разделе были бы опаснее пустоты: на них принимают денежные решения.",
    `<div class="muted-3" style="font-size:var(--t-meta)">UI-requirement R-1 · docs/UI_UX_REDESIGN_PLAN.md §13</div>`)}</div>
  <div class="card" style="margin-top:var(--s-3)"><div class="card-head"><h3>Что уже доступно</h3></div>
    <div class="card-body"><div class="kv">
      <div class="kv-row"><span class="k">Счета по партии</span><span class="v">видны в паспорте партии</span></div>
      <div class="kv-row"><span class="k">Себестоимость партии</span><span class="v">видна в Snapshot партии</span></div>
      <div class="kv-row"><span class="k">Просроченные счета</span><span class="v">видны на Главной</span></div>
    </div></div></div>`;
}

/* ================= PILOT ================= */
function scrPilot() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Pilot v1</h1><div class="sub">Состояние системы · 23 августа 2026</div></div></div></div>
  <div class="metrics" style="margin-bottom:var(--s-4)">
    <div class="metric"><span class="label">Партий сегодня</span><span class="value num">0</span></div>
    <div class="metric"><span class="label">В работе</span><span class="value num">3</span></div>
    <div class="metric"><span class="label">Просрочено</span><span class="value num" style="color:var(--danger)">1</span></div>
    <div class="metric"><span class="label">Ошибок</span><span class="value">—</span><span class="hint">мониторинг не подключён</span></div>
  </div>
  <div class="card"><div class="card-head"><h3>Состояние системы</h3></div><div class="card-body"><div class="kv">
    <div class="kv-row"><span class="k">Последняя спецификация</span><span class="v num">№12 · 10.06.2026 11:22</span></div>
    <div class="kv-row"><span class="k">Последний Snapshot партии</span><span class="v num">10.06.2026 11:20</span></div>
    <div class="kv-row"><span class="k">Последний бэкап</span><span class="v muted-3">не отслеживается автоматически</span></div>
    <div class="kv-row"><span class="k">Последний деплой</span><span class="v num">commit 204f973</span></div>
  </div></div></div>`;
}

/* ================= MOBILE: ЕЩЁ ================= */
function scrMore() {
  const items = [
    ["models", "i-model", "Модели"], ["workshops", "i-factory", "Цеха"],
    ["materials", "i-layers", "Материалы"], ["purchases", "i-cart", "Закупки"],
    ["warehouses", "i-store", "Склады"], ["suppliers", "i-users", "Поставщики"],
    ["finance", "i-cash", "Финансы"], ["pilot", "i-shield", "Pilot v1"],
  ];
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Ещё</h1></div></div></div>
  <div class="section-list">${items.map(([go, ico, label]) => `
    <button class="section-link" data-go="${go}"><span class="ico-box"><svg class="ico" width="16" height="16"><use href="#${ico}"/></svg></span>
    <span class="label">${label}</span>${icon("chevron", 15)}</button>`).join("")}</div>
  <div class="card" style="margin-top:var(--s-4)"><div class="card-body">
    <div class="row-between"><span class="row" style="gap:var(--s-3)"><span class="avatar">БМ</span>
      <span><span style="display:block;font-weight:600">Богдан М.</span><span class="muted-3" style="font-size:var(--t-meta)">Владелец</span></span></span>
    <button class="btn btn-ghost btn-sm">Выйти</button></div>
  </div></div>`;
}

/* ================= MOBILE: СОЗДАТЬ ================= */
function scrCreate() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Создать</h1>
    <div class="sub">Доступные действия</div></div></div></div>
  <div class="section-list">
    <button class="section-link"><span class="ico-box" style="color:var(--primary)">${icon("batch", 16)}</span><span class="label">Заказ пошива</span>${icon("chevron", 15)}</button>
    <button class="section-link"><span class="ico-box" style="color:var(--info)">${icon("cart", 16)}</span><span class="label">Закупку материалов</span>${icon("chevron", 15)}</button>
    <button class="section-link"><span class="ico-box" style="color:var(--success)">${icon("model", 16)}</span><span class="label">Модель</span>${icon("chevron", 15)}</button>
    <button class="section-link"><span class="ico-box" style="color:var(--warning)">${icon("layers", 16)}</span><span class="label">Материал</span>${icon("chevron", 15)}</button>
  </div>`;
}

/* ================= СОСТОЯНИЯ (демо) ================= */
function scrStates() {
  return `
  <div class="pagehead"><div class="pagehead-row"><div><h1>Состояния</h1>
    <div class="sub">Loading · Empty · Error · No access</div></div></div></div>
  <div class="grid cols-2">
    <div class="card"><div class="card-head"><h3>Loading</h3></div><div class="card-body stack">
      ${[70, 45, 60].map((w) => `<div class="row" style="gap:var(--s-3)">
        <span class="skel" style="width:42px;height:42px;border-radius:var(--r-sm)"></span>
        <span style="flex:1"><span class="skel" style="display:block;height:11px;width:${w}%"></span>
        <span class="skel" style="display:block;height:9px;width:${w - 25}%;margin-top:7px"></span></span></div>`).join("")}
    </div></div>
    <div class="card"><div class="card-head"><h3>Empty</h3></div>
      ${emptyState("batch", "Партий пока нет", "Создайте первую производственную партию, чтобы начать работу.",
        `<button class="btn btn-primary btn-sm">${icon("plus", 15)} Создать партию</button>`)}</div>
    <div class="card"><div class="card-head"><h3>Error</h3></div>
      <div class="state err"><span class="ico-box">${icon("alert", 22)}</span>
      <div class="t">Не удалось загрузить данные</div>
      <div class="m">Проверьте подключение и попробуйте ещё раз.</div>
      <button class="btn btn-secondary btn-sm">Повторить</button></div></div>
    <div class="card"><div class="card-head"><h3>No access</h3></div>
      ${emptyState("lock", "Недостаточно прав", "Раздел доступен ролям «Владелец» и «Финансист». Обратитесь к администратору компании.")}</div>
  </div>`;
}
