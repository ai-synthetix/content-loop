import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "/Users/alex/Projects/content-system-study/content-system-strategy.pptx";
const PREVIEW_DIR = "/Users/alex/Projects/content-system-study/.deck-preview";

const C = {
  ink: "#0B0F14",
  muted: "#5C6570",
  panel: "#EEF1F4",
  rule: "#B8BEC6",
  blue: "#3D8DFF",
  cyan: "#6DCBF4",
  pale: "#EAF5FB",
  white: "#FFFFFF",
  red: "#B42318",
  green: "#157A55",
};

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function rect(slide, x, y, w, h, fill = C.panel, lineFill = "none", radius = false) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: lineFill, width: lineFill === "none" ? 0 : 1 },
  });
}

function line(slide, x, y, w, h = 0, color = C.rule, width = 1) {
  return slide.shapes.add({
    geometry: "straightConnector1",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function text(slide, value, x, y, w, h, size = 22, opts = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = value;
  s.text.style = {
    fontSize: size,
    typeface: "Helvetica Neue",
    color: opts.color ?? C.ink,
    bold: opts.bold ?? false,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "top",
    autoFit: opts.autoFit ?? "none",
    wrap: "square",
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return s;
}

function title(slide, value, num) {
  text(slide, value, 42, 34, 1135, 70, 48, { bold: true });
  text(slide, String(num).padStart(2, "0"), 1190, 662, 45, 20, 15, { color: C.muted, align: "right" });
}

function note(slide, sources = [], presenter = "") {
  const lines = [];
  if (presenter) lines.push(presenter, "");
  lines.push("[Sources]");
  for (const source of sources) lines.push(`- ${source}`);
  slide.speakerNotes.textFrame.setText(lines.join("\n"));
}

function label(slide, value, x, y, w, color = C.blue) {
  text(slide, value.toUpperCase(), x, y, w, 24, 15, { color, bold: true });
}

// 1 — cover, based on Codex Grid cover-image-field hierarchy.
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  rect(s, 760, 0, 520, 720, C.pale);
  line(s, 760, 0, 0, 720, C.cyan, 3);
  label(s, "Стратегия продукта", 52, 54, 400);
  text(s, "Content Loop", 52, 154, 650, 92, 76, { bold: true });
  text(s, "Система, которая помнит, публикует и учится", 52, 270, 620, 116, 36, { color: C.muted });
  text(s, "PattayaDom · SoulArchitecture.Space · AI.SoulArc.Space", 52, 612, 640, 35, 20, { color: C.muted });
  text(s, "Решение: отдельный content control plane с человеческим утверждением", 814, 188, 390, 210, 34, { bold: true });
  note(s, ["Internal analysis of /Users/alex/Projects/familyos, 2026-08-31"]);
}

// 2
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Строить стоит — при правильной границе", 2);
  text(s, "ДА", 42, 170, 240, 120, 92, { bold: true, color: C.blue });
  text(s, "если продукт управляет полным жизненным циклом контента", 305, 177, 835, 105, 38, { bold: true });
  line(s, 42, 332, 1196, 0, C.ink, 1);
  text(s, "НЕТ", 42, 382, 240, 100, 64, { bold: true, color: C.red });
  text(s, "если это генератор по расписанию, который не хранит версии, решения человека и фактический результат публикаций", 305, 389, 835, 160, 30, { color: C.muted });
  note(s, [], "Открывающий вывод: генерация сама по себе не является продуктом.");
}

// 3
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Ценность возникает после генерации", 3);
  const items = [
    ["01", "Память", "Что опубликовано, где, в какой версии"],
    ["02", "Контроль", "Claims, источники, правки, approval"],
    ["03", "Доставка", "Надёжные адаптеры и idempotency"],
    ["04", "Рефлексия", "Наблюдения → гипотеза → следующий тест"],
  ];
  items.forEach((it, i) => {
    const y = 145 + i * 122;
    text(s, it[0], 42, y, 70, 38, 24, { color: C.blue, bold: true });
    text(s, it[1], 135, y - 4, 260, 50, 34, { bold: true });
    text(s, it[2], 420, y + 2, 770, 60, 26, { color: C.muted });
    if (i < items.length - 1) line(s, 135, y + 77, 1055);
  });
  note(s, [], "Генератор заменяем. Память, аудит и адаптеры образуют накопительный актив.");
}

// 4
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Один контур — три редакционных продукта", 4);
  const x = [42, 426, 810];
  const data = [
    ["PattayaDom", "Визы\nНедвижимость\nПрактические статьи", "FamilyOS\nTelegram\nFacebook"],
    ["SoulArchitecture", "AI\nУправление\nАрхитектура", "FamilyOS\nTelegram"],
    ["AI.SoulArc", "Неличные AI-заметки\nТопы\nSEO / robot-readable", "FamilyOS"],
  ];
  data.forEach((d, i) => {
    label(s, `Проект ${i + 1}`, x[i], 142, 300);
    text(s, d[0], x[i], 182, 330, 50, 34, { bold: true });
    line(s, x[i], 246, 330, 0, C.ink, 2);
    text(s, "ГЕНЕРИРУЕТ", x[i], 280, 330, 28, 16, { color: C.muted, bold: true });
    text(s, d[1], x[i], 320, 330, 118, 24);
    text(s, "ПУБЛИКУЕТ", x[i], 468, 330, 28, 16, { color: C.muted, bold: true });
    text(s, d[2], x[i], 508, 330, 105, 24, { color: C.blue, bold: true });
  });
  note(s, ["/Users/alex/Projects/familyos/backend/internal/httpapi/router.go"]);
}

// 5 — simple process diagram.
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Контент работает как замкнутый цикл", 5);
  const steps = ["Тема", "Бриф", "Черновик", "Review", "Публикация", "Сигналы", "Рефлексия"];
  line(s, 92, 329, 1082, 0, C.rule, 3);
  steps.forEach((v, i) => {
    const x = 72 + i * 168;
    rect(s, x, 288, 84, 84, i === 3 ? C.blue : C.ink, "none", true);
    text(s, String(i + 1), x, 310, 84, 35, 26, { color: C.white, bold: true, align: "center" });
    text(s, v, x - 28, 399, 140, 55, 22, { bold: true, align: "center" });
  });
  text(s, "Следующий бриф обязан указывать, какие наблюдения он использовал", 155, 525, 970, 70, 31, { color: C.blue, bold: true, align: "center" });
  note(s, [], "Подчеркнуть: reflection без замыкания на следующий brief является отчётом, а не обучением.");
}

// 6
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Человек утверждает; машина исполняет", 6);
  label(s, "Машина", 42, 144, 520, C.muted);
  text(s, "предлагает темы\nсобирает evidence\nсоздаёт версии\nпроверяет schema\nпубликует утверждённое\nсобирает сигналы", 42, 186, 510, 340, 29);
  line(s, 622, 142, 0, 438, C.rule, 2);
  label(s, "Человек", 682, 144, 520, C.blue);
  text(s, "подтверждает claims\nправит тон и позицию\napprove / edit / reject\nзадаёт риск-политику\nрешает, что тестировать дальше", 682, 186, 510, 300, 29, { bold: true });
  rect(s, 682, 514, 510, 84, C.pale);
  text(s, "Визы, право, налоги, цены и инвестиционные тезисы — approval каждого материала", 706, 532, 465, 56, 21, { color: C.red, bold: true });
  note(s, [
    "https://docs.langchain.com/oss/python/langchain/human-in-the-loop",
    "https://docs.langchain.com/oss/python/langgraph/persistence",
  ]);
}

// 7 — simple architecture diagram.
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Ядро отделяется от каналов адаптерами", 7);
  rect(s, 42, 155, 450, 410, C.ink);
  label(s, "Content Loop", 76, 189, 360, C.cyan);
  text(s, "content items\nimmutable versions\napprovals\noutbox + audit\nmetric snapshots\nstructured reflections", 76, 244, 360, 260, 30, { color: C.white, bold: true });
  line(s, 492, 360, 145, 0, C.blue, 4);
  text(s, "versioned\nadapter API", 510, 286, 110, 65, 18, { color: C.blue, bold: true, align: "center" });
  const ys = [155, 300, 445];
  const channels = [
    ["Telegram", "publish + reactions + links"],
    ["FamilyOS", "three schema mappings"],
    ["Facebook Page", "publish + insights; later"],
  ];
  channels.forEach((c, i) => {
    rect(s, 637, ys[i], 555, 112, i === 1 ? C.pale : C.panel);
    text(s, c[0], 670, ys[i] + 22, 250, 36, 28, { bold: true });
    text(s, c[1], 670, ys[i] + 62, 470, 30, 20, { color: C.muted });
  });
  note(s, [
    "/Users/alex/Projects/familyos/backend/internal/httpapi/router.go",
    "https://core.telegram.org/bots/api",
    "https://www.postman.com/meta/facebook/folder/3nyjb4m/tokens",
  ]);
}

// 8 — comparison table, based on Codex Grid evidence-table hierarchy.
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Отдельный сервис даёт лучший баланс", 8);
  const cols = [42, 420, 598, 776, 954, 1190];
  const headers = ["Вариант", "Старт", "Контроль", "Reuse", "Вердикт"];
  headers.forEach((h, i) => text(s, h, cols[i] + 8, 142, cols[i + 1] - cols[i] - 16, 28, 16, { color: C.muted, bold: true }));
  line(s, 42, 181, 1148, 0, C.ink, 2);
  const rows = [
    ["Модуль FamilyOS", "быстро", "высокий", "низкий", "временный MVP"],
    ["Отдельный сервис", "средне", "высокий", "высокий", "РЕКОМЕНДАЦИЯ"],
    ["n8n как система", "быстро", "средний", "средний", "прототип"],
    ["LangGraph / Temporal", "средне", "высокий", "высокий", "после усложнения"],
    ["SaaS сразу", "медленно", "средний", "высокий", "не сейчас"],
  ];
  rows.forEach((r, ri) => {
    const y = 195 + ri * 82;
    if (ri === 1) rect(s, 42, y - 9, 1148, 71, C.pale);
    r.forEach((v, ci) => text(s, v, cols[ci] + 8, y, cols[ci + 1] - cols[ci] - 16, 48, ci === 0 ? 23 : 20, { bold: ri === 1 || ci === 0, color: ci === 4 && ri === 1 ? C.blue : C.ink }));
    line(s, 42, y + 62, 1148);
  });
  note(s, [
    "https://docs.n8n.io/",
    "https://docs.n8n.io/workflows/executions/all-executions/",
    "https://docs.langchain.com/oss/python/langgraph/overview",
    "https://docs.temporal.io/",
  ]);
}

// 9
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Рекомендация: отдельное ядро", 9);
  text(s, "Content Loop", 42, 158, 560, 62, 52, { bold: true });
  text(s, "Отдельный API + БД + workers рядом с FamilyOS в K3s", 42, 238, 560, 95, 30, { color: C.muted });
  line(s, 630, 150, 0, 420, C.rule, 2);
  const points = [
    ["FamilyOS", "первый нестандартный адаптер, не source of truth"],
    ["n8n", "расписания и временные интеграции, не ядро"],
    ["LangGraph", "когда появятся сложные interrupts и replay"],
    ["Open source", "ядро + adapter SDK после стабилизации"],
    ["SaaS", "после внешнего пилота и готовности платить"],
  ];
  points.forEach((p, i) => {
    const y = 154 + i * 88;
    text(s, p[0], 682, y, 190, 34, 24, { bold: true, color: C.blue });
    text(s, p[1], 878, y, 320, 60, 20, { color: C.muted });
  });
  note(s, [], "Разделение позволяет позже открыть ядро без раскрытия проектных профилей, источников и метрик.");
}

// 10
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "FamilyOS уже требует три разных mapping", 10);
  const rows = [
    ["PattayaDom", "/api/v1/articles", "title · category · excerpt · body"],
    ["SoulArchitecture", "/api/v1/soul/articles", "RU/EN fields · eyebrow · sort order"],
    ["AI.SoulArc", "/api/v1/soul/ai-notes", "title · excerpt · body · view count"],
  ];
  rows.forEach((r, i) => {
    const y = 154 + i * 142;
    label(s, r[0], 42, y, 275, i === 1 ? C.blue : C.muted);
    text(s, r[1], 318, y - 4, 440, 42, 27, { bold: true });
    text(s, r[2], 790, y, 400, 55, 21, { color: C.muted });
    line(s, 42, y + 86, 1148);
  });
  rect(s, 42, 582, 1148, 62, C.pale);
  text(s, "Безопасный паттерн: POST draft с is_published=false → review → PATCH publish", 70, 598, 1090, 35, 24, { color: C.blue, bold: true, align: "center" });
  note(s, [
    "/Users/alex/Projects/familyos/backend/internal/httpapi/router.go",
    "/Users/alex/Projects/familyos/backend/internal/thaiproperty/handler.go",
    "/Users/alex/Projects/familyos/backend/internal/asd/handler.go",
    "/Users/alex/Projects/familyos/backend/internal/asd/ainote.go",
  ]);
}

// 11
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Рефлексия хранит наблюдения, не память", 11);
  const cols = [42, 442, 842];
  const items = [
    ["Наблюдать", "канал · тема · формат\nвозраст публикации\nreactions · clicks\nручной edit distance"],
    ["Нормализовать", "против медианы канала\nпо формату и возрасту\nс confidence\nбез ложных сравнений"],
    ["Проверять", "possible causes\nnext test\ndo_not_conclude\nссылка на evidence"],
  ];
  items.forEach((it, i) => {
    text(s, `0${i + 1}`, cols[i], 148, 70, 40, 25, { color: C.blue, bold: true });
    text(s, it[0], cols[i], 206, 330, 48, 34, { bold: true });
    line(s, cols[i], 274, 330, 0, C.ink, 2);
    text(s, it[1], cols[i], 310, 330, 210, 25, { color: C.muted });
  });
  text(s, "Сигнал аудитории оптимизирует упаковку и выбор теста, но не определяет истинность утверждений", 104, 580, 1070, 60, 27, { bold: true, color: C.red, align: "center" });
  note(s, ["https://core.telegram.org/bots/api"], "Telegram reactions are available through explicit update subscriptions; analytics availability differs by channel.");
}

// 12 — timeline based on Codex Grid timeline hierarchy.
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Пилот доказывает полный цикл за 6–8 недель", 12);
  line(s, 78, 328, 1090, 0, C.ink, 2);
  const stages = [
    ["0", "Контракт", "baseline\nschemas\nrisk policy"],
    ["1–2", "Ядро", "state\nversions\napproval"],
    ["3–4", "Каналы", "FamilyOS\nTelegram\nidempotency"],
    ["5", "Рефлексия", "snapshots\nconfidence\nnext test"],
    ["6–8", "Пилот", "8–12 items\ndecision gate"],
  ];
  stages.forEach((st, i) => {
    const x = 64 + i * 235;
    rect(s, x, 316, 24, 24, i === 4 ? C.blue : C.ink, "none", true);
    text(s, `Нед. ${st[0]}`, x, 255, 150, 28, 18, { color: C.muted, bold: true });
    text(s, st[1], x, 374, 190, 42, 28, { bold: true });
    text(s, st[2], x, 428, 190, 112, 21, { color: C.muted });
  });
  note(s, [], "Facebook, SaaS, marketplace и autonomous publishing сознательно исключены из пилота.");
}

// 13
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Продолжать только при измеримом эффекте", 13);
  const good = [
    "100% публикаций связаны с approval",
    "0 дублей из-за retry",
    "≥70% черновиков доходят до публикации",
    "ручное время на материал −30%",
    "рефлексия изменила следующие briefs",
  ];
  const stop = [
    "edit distance стабильно >50%",
    "журнал публикаций неполный",
    "метрики не меняют решения",
    "source/claims не проверяются",
    "поддержка дороже ручного процесса",
  ];
  label(s, "Продолжать", 42, 148, 500, C.green);
  text(s, good.join("\n"), 42, 196, 520, 340, 27, { bold: true });
  line(s, 620, 145, 0, 425, C.rule, 2);
  label(s, "Остановить или упростить", 682, 148, 500, C.red);
  text(s, stop.join("\n"), 682, 196, 520, 340, 27, { color: C.muted });
  note(s, [], "Пороговые значения являются предложенными decision gates пилота, а не внешней статистикой.");
}

// 14
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  label(s, "Первое решение", 52, 58, 400, C.cyan);
  text(s, "Строить один вертикальный срез", 52, 148, 1130, 76, 54, { color: C.white, bold: true });
  text(s, "PattayaDom → FamilyOS draft → human approval → Telegram + FamilyOS publish → signals → reflection", 52, 282, 1060, 150, 36, { color: C.white });
  line(s, 52, 506, 1135, 0, C.cyan, 3);
  text(s, "Не начинать с Facebook, multi-agent swarm, open-source release или SaaS-биллинга", 52, 548, 1080, 70, 26, { color: C.cyan, bold: true });
  text(s, "14", 1190, 662, 45, 20, 15, { color: C.white, align: "right" });
  note(s, [], "Закрыть решением о границе пилота.");
}

async function main() {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  for (const [i, slide] of deck.slides.items.entries()) {
    const png = await deck.export({ slide, format: "png", scale: 1 });
    await fs.writeFile(`${PREVIEW_DIR}/slide-${String(i + 1).padStart(2, "0")}.png`, new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(`${PREVIEW_DIR}/slide-${String(i + 1).padStart(2, "0")}.layout.json`, await layout.text());
  }
  const montage = await deck.export({ format: "webp", montage: true, scale: 1 });
  await fs.writeFile(`${PREVIEW_DIR}/montage.webp`, new Uint8Array(await montage.arrayBuffer()));
  const pptx = await PresentationFile.exportPptx(deck);
  await pptx.save(OUT);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
