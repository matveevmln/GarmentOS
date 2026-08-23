/* Мини-роутер прототипа. */

const ROUTES = {
  dashboard:   { title: "Главная",          crumbs: ["Главная"],                      nav: "dashboard", render: scrDashboard },
  batches:     { title: "Партии",           crumbs: ["Партии"],                       nav: "batches",   render: scrBatches },
  passport:    { title: "Партия #158",      crumbs: ["Партии", "Партия #158"],        nav: "batches",   render: scrPassport, back: "batches" },
  "p-economics":{ title: "Экономика",       crumbs: ["Партии", "#158", "Экономика"],  nav: "batches",   render: scrPEconomics, back: "passport" },
  "p-variants": { title: "Размеры и цвета", crumbs: ["Партии", "#158", "Размеры"],    nav: "batches",   render: scrPVariants,  back: "passport" },
  "p-materials":{ title: "Материалы",       crumbs: ["Партии", "#158", "Материалы"],  nav: "batches",   render: scrPMaterials, back: "passport" },
  "p-documents":{ title: "Документы",       crumbs: ["Партии", "#158", "Документы"],  nav: "batches",   render: scrPDocuments, back: "passport" },
  "p-contract": { title: "Договор",         crumbs: ["Партии", "#158", "Договор"],    nav: "batches",   render: scrPContract,  back: "passport" },
  "p-history":  { title: "История",         crumbs: ["Партии", "#158", "История"],    nav: "batches",   render: scrPHistory,   back: "passport" },
  models:      { title: "Модели",           crumbs: ["Модели"],       nav: "models",     render: scrModels },
  workshops:   { title: "Цеха",             crumbs: ["Цеха"],         nav: "workshops",  render: scrWorkshops },
  materials:   { title: "Материалы",        crumbs: ["Материалы"],    nav: "materials",  render: scrMaterials },
  purchases:   { title: "Закупки",          crumbs: ["Закупки"],      nav: "purchases",  render: scrPurchases },
  warehouses:  { title: "Склады",           crumbs: ["Склады"],       nav: "warehouses", render: scrWarehouses },
  suppliers:   { title: "Поставщики",       crumbs: ["Поставщики"],   nav: "suppliers",  render: scrSuppliers },
  documents:   { title: "Документы",        crumbs: ["Документы"],    nav: "documents",  render: scrDocuments },
  finance:     { title: "Финансы",          crumbs: ["Финансы"],      nav: "finance",    render: scrFinance },
  pilot:       { title: "Pilot v1",         crumbs: ["Pilot v1"],     nav: "pilot",      render: scrPilot },
  more:        { title: "Ещё",              crumbs: ["Ещё"],          nav: "more",       render: scrMore },
  create:      { title: "Создать",          crumbs: ["Создать"],      nav: "create",     render: scrCreate, back: "dashboard" },
  states:      { title: "Состояния",        crumbs: ["Состояния"],    nav: "",           render: scrStates },
};

function go(name) {
  const r = ROUTES[name] || ROUTES.dashboard;
  document.getElementById("page").innerHTML = r.render();
  document.getElementById("mtitle").textContent = r.title;
  document.getElementById("crumbs").innerHTML = r.crumbs
    .map((c, i) => (i === r.crumbs.length - 1 ? `<b>${c}</b>` : c))
    .join('<span class="sep">/</span>');

  document.querySelectorAll(".nav-item, .bottomnav a").forEach((el) => {
    el.classList.toggle("active", el.dataset.go === r.nav);
  });
  const back = document.querySelector("[data-back]");
  back.style.visibility = r.back ? "visible" : "hidden";
  back.dataset.target = r.back || "";

  window.scrollTo(0, 0);
  location.hash = name;
  document.documentElement.dataset.screen = name;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-back]");
  if (b && b.dataset.target) { go(b.dataset.target); return; }
  const t = e.target.closest("[data-go]");
  if (t) { e.preventDefault(); go(t.dataset.go); }
});

window.go = go;
go(location.hash.slice(1) || "dashboard");
