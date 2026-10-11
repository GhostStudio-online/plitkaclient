"use strict";

// Тека із завданнями. Список файлів береться з exercises/index.json
const EXERCISES_DIR = "exercises/";
const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

const $ = (id) => document.getElementById(id);
const screens = {
  list: $("list-screen"),
  quiz: $("quiz-screen"),
  result: $("result-screen"),
};

let current = null; // поточний набір завдань
let index = 0;      // номер поточного питання
let score = 0;      // кількість правильних відповідей
let mistakes = [];  // номери питань з помилками

/* ---------- Допоміжне ---------- */

function show(name) {
  for (const [key, node] of Object.entries(screens)) node.hidden = key !== name;
  window.scrollTo(0, 0);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function pluralQuestions(n) {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} питань`;
  if (last === 1) return `${n} питання`;
  if (last >= 2 && last <= 4) return `${n} питання`;
  return `${n} питань`;
}

/* ---------- Перевірка JSON-файлів ---------- */

function letterIndex(letter, q, where) {
  const i = LETTERS.indexOf(String(letter).trim().toUpperCase());
  if (i < 0 || i >= q.options.length) {
    throw new Error(
      `${where}: невірна літера "${letter}". Допустимі (українські): ${LETTERS.slice(0, q.options.length).join(", ")}`
    );
  }
  return i;
}

function validate(data, file) {
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error(`${file}: немає списку "questions"`);
  }
  data.questions.forEach((q, i) => {
    const where = `${file}, питання ${i + 1}`;
    if (!q.question) throw new Error(`${where}: немає поля "question"`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > LETTERS.length) {
      throw new Error(`${where}: "options" має містити від 2 до ${LETTERS.length} варіантів`);
    }
    q.type = q.type || "single";
    if (q.type === "single") {
      q._correct = letterIndex(q.correct, q, where);
    } else if (q.type === "matching") {
      if (!Array.isArray(q.items) || q.items.length === 0) {
        throw new Error(`${where}: для "matching" потрібен список "items"`);
      }
      if (!Array.isArray(q.correct) || q.correct.length !== q.items.length) {
        throw new Error(`${where}: "correct" має містити стільки літер, скільки є "items"`);
      }
      q._correct = q.correct.map((l) => letterIndex(l, q, where));
    } else {
      throw new Error(`${where}: невідомий тип "${q.type}" (є "single" і "matching")`);
    }
  });
  data.title = data.title || file.replace(/\.json$/, "");
  return data;
}

/* ---------- Список завдань ---------- */

async function loadList() {
  const box = $("tasks");
  box.textContent = "Завантаження…";
  try {
    const manifest = await fetchJson(EXERCISES_DIR + "index.json");
    if (!Array.isArray(manifest)) throw new Error("index.json має бути списком назв файлів");

    const tasks = [];
    for (const file of manifest) {
      try {
        tasks.push({ file, data: validate(await fetchJson(EXERCISES_DIR + file), file) });
      } catch (e) {
        tasks.push({ file, error: e.message });
      }
    }
    renderList(tasks);
  } catch (e) {
    box.textContent = "";
    let message = "Не вдалося завантажити список завдань. " + e.message;
    if (location.protocol === "file:") {
      message += " Сайт треба відкривати через сервер (див. README), а не подвійним кліком по index.html.";
    }
    box.append(el("p", "error", message));
  }
}

function renderList(tasks) {
  const box = $("tasks");
  box.textContent = "";
  if (tasks.length === 0) {
    box.append(el("p", "muted", "У теці exercises ще немає завдань. Додай файл і впиши його в index.json."));
    return;
  }
  for (const task of tasks) {
    const card = el("button", "task");
    card.type = "button";
    if (task.error) {
      card.classList.add("task-error");
      card.append(el("span", "task-title", task.file), el("span", "task-meta", task.error));
      card.disabled = true;
    } else {
      card.append(
        el("span", "task-title", task.data.title),
        el("span", "task-meta", pluralQuestions(task.data.questions.length))
      );
      card.addEventListener("click", () => start(task.data));
    }
    box.append(card);
  }
}

/* ---------- Проходження ---------- */

function start(data) {
  current = data;
  index = 0;
  score = 0;
  mistakes = [];
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = current.questions[index];
  const total = current.questions.length;

  $("progress-text").textContent = `Питання ${index + 1} з ${total}`;
  $("progress-bar").style.width = `${(index / total) * 100}%`;
  $("question-text").textContent = q.question;

  const body = $("question-body");
  body.textContent = "";
  const feedback = $("feedback");
  feedback.hidden = true;
  feedback.textContent = "";
  feedback.className = "feedback";
  $("check-btn").hidden = true;
  $("check-btn").disabled = true;
  $("next-btn").hidden = true;

  if (q.type === "matching") renderMatching(q, body);
  else renderSingle(q, body);
}

function renderSingle(q, body) {
  q.options.forEach((text, i) => {
    const btn = el("button", "option");
    btn.type = "button";
    btn.append(el("span", "letter", LETTERS[i]), el("span", "option-text", text));
    btn.addEventListener("click", () => {
      const ok = i === q._correct;
      [...body.children].forEach((b, j) => {
        b.disabled = true;
        if (j === q._correct) b.classList.add("correct");
      });
      if (!ok) btn.classList.add("wrong");
      finish(q, ok, ok ? "Правильно!" : `Неправильно. Правильна відповідь: ${LETTERS[q._correct]}.`);
    });
    body.append(btn);
  });
}

function renderMatching(q, body) {
  const rows = el("div", "match-items");
  const selects = [];

  q.items.forEach((text, i) => {
    const row = el("div", "match-row");
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Відповідь до пункту ${i + 1}`);
    select.append(new Option("—", ""));
    q.options.forEach((_, j) => select.append(new Option(LETTERS[j], String(j))));
    select.addEventListener("change", () => {
      $("check-btn").disabled = selects.some((s) => s.value === "");
    });
    selects.push(select);
    row.append(el("span", "match-num", String(i + 1)), el("span", "match-text", text), select);
    rows.append(row);
  });

  const options = el("div", "match-options");
  q.options.forEach((text, j) => {
    const line = el("div", "match-option");
    line.append(el("span", "letter", LETTERS[j]), el("span", "option-text", text));
    options.append(line);
  });

  body.append(rows, el("p", "match-options-title", "Варіанти відповідей:"), options);

  const checkBtn = $("check-btn");
  checkBtn.hidden = false;
  checkBtn.disabled = true;
  checkBtn.onclick = () => {
    let allOk = true;
    selects.forEach((select, i) => {
      const row = rows.children[i];
      select.disabled = true;
      if (Number(select.value) === q._correct[i]) {
        row.classList.add("correct");
      } else {
        allOk = false;
        row.classList.add("wrong");
        row.append(el("span", "match-fix", `Правильно: ${LETTERS[q._correct[i]]}`));
      }
    });
    checkBtn.hidden = true;
    const key = q._correct.map((c, i) => `${i + 1}-${LETTERS[c]}`).join(", ");
    finish(q, allOk, allOk ? "Правильно!" : `Є помилки. Правильні відповіді: ${key}.`);
  };
}

function finish(q, ok, message) {
  if (ok) score++;
  else mistakes.push(index + 1);

  const feedback = $("feedback");
  feedback.className = ok ? "feedback" : "feedback bad";
  feedback.textContent = "";
  feedback.append(el("strong", "", message));
  if (q.explanation) feedback.append(el("span", "", q.explanation));
  feedback.hidden = false;

  const isLast = index === current.questions.length - 1;
  const next = $("next-btn");
  next.textContent = isLast ? "Показати результат" : "Далі";
  next.hidden = false;
  next.focus();
}

function showResult() {
  const total = current.questions.length;
  const percent = Math.round((score / total) * 100);
  $("progress-bar").style.width = "100%";
  $("result-title").textContent = current.title;
  $("result-score").textContent = `${score} з ${total}`;
  $("result-text").textContent =
    mistakes.length === 0
      ? "Без жодної помилки. Чудово!"
      : `Правильно: ${percent}%. Варто повторити питання: ${mistakes.join(", ")}.`;
  show("result");
}

/* ---------- Кнопки ---------- */

$("next-btn").addEventListener("click", () => {
  if (index < current.questions.length - 1) {
    index++;
    renderQuestion();
    window.scrollTo(0, 0);
  } else {
    showResult();
  }
});

$("back-btn").addEventListener("click", () => show("list"));
$("menu-btn").addEventListener("click", () => show("list"));
$("retry-btn").addEventListener("click", () => start(current));

loadList();
