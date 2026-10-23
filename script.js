const DICE_LABELS = {
  4: "Daño ligero",
  6: "El clásico",
  8: "Daño medio",
  10: "Percentil",
  12: "Golpe brutal",
  20: "Destino",
};

const DICE_GEOMETRY = {
  4: {
    body: "M110 8 204 180 16 180Z",
    highlight: "M110 8 110 112 16 180Z",
    lines: '<path d="M110 8v104M16 180l94-68 94 68M16 180h188" />',
  },
  6: {
    body: "M48 28 158 14 194 55 174 168 62 184 24 141Z",
    highlight: "M48 28 158 14 194 55 83 72Z",
    lines: '<path d="M48 28 83 72l111-17M83 72 62 184M83 72l91 96M24 141l38 43M24 141l24-113" />',
  },
  8: {
    body: "M110 5 202 99 110 195 18 99Z",
    highlight: "M110 5 202 99 110 75 18 99Z",
    lines: '<path d="M110 5v70M18 99l92-24 92 24M18 99l92 96 92-96" />',
  },
  10: {
    body: "M110 5 199 68 172 164 110 195 47 164 21 68Z",
    highlight: "M110 5 199 68 110 75 21 68Z",
    lines: '<path d="M110 5v70M21 68l89 7 89-7M47 164l63-89 62 89M47 164l63 31 62-31M21 68l26 96M199 68l-27 96" />',
  },
  12: {
    body: "M110 5 185 31 207 105 169 177 91 195 27 150 14 72 70 16Z",
    highlight: "M110 5 185 31 149 65 70 62Z",
    lines: '<path d="M110 5 70 62l40 45 39-42-39-60M70 62 14 72l46 59 50-24 57 27 40-29M149 65l36-34M60 131l31 64M167 134l2 43M60 131l-33 19M110 107v88" />',
  },
  20: {
    body: "M110 7 202 58 184 160 110 195 34 160 18 58Z",
    highlight: "M110 7 202 58 110 75 18 58Z",
    lines: '<path d="M110 7v68M18 58l92 17 92-17M34 160l76-85 74 85M34 160h150M18 58l92 137 92-137" /><path d="m18 58 16 102 76 35 74-35 18-102" opacity=".65" />',
  },
};

const state = {
  sides: 20,
  quantity: 1,
  modifier: 0,
  rolling: false,
  sound: false,
  history: loadHistory(),
};

const elements = {
  diceGrid: document.querySelector("#diceGrid"),
  quantity: document.querySelector("#quantity"),
  modifier: document.querySelector("#modifier"),
  heroDie: document.querySelector("#heroDie"),
  dieValue: document.querySelector("#dieValue"),
  resultLabel: document.querySelector("#resultLabel"),
  resultTotal: document.querySelector("#resultTotal"),
  resultBreakdown: document.querySelector("#resultBreakdown"),
  rollResult: document.querySelector(".roll-result"),
  rollButton: document.querySelector("#rollButton"),
  historyList: document.querySelector("#historyList"),
  clearHistory: document.querySelector("#clearHistory"),
  rollCount: document.querySelector("#rollCount"),
  bestRoll: document.querySelector("#bestRoll"),
  soundToggle: document.querySelector("#soundToggle"),
  dieBody: document.querySelector("#dieBody"),
  dieHighlight: document.querySelector("#dieHighlight"),
  dieLines: document.querySelector("#dieLines"),
};

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem("vp-dice-history"));
    return Array.isArray(saved) ? saved.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem("vp-dice-history", JSON.stringify(state.history));
}

function randomDie(sides) {
  const range = 0x100000000;
  const limit = range - (range % sides);
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return (values[0] % sides) + 1;
}

function signed(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function setSides(sides) {
  state.sides = sides;
  document.querySelectorAll(".die-option").forEach((button) => {
    const isActive = Number(button.dataset.sides) === sides;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  elements.heroDie.className = `hero-die d${sides}`;
  elements.dieBody.setAttribute("d", DICE_GEOMETRY[sides].body);
  elements.dieHighlight.setAttribute("d", DICE_GEOMETRY[sides].highlight);
  elements.dieLines.innerHTML = DICE_GEOMETRY[sides].lines;
  elements.dieValue.textContent = sides;
  elements.resultLabel.textContent = DICE_LABELS[sides];
  elements.resultTotal.textContent = `${state.quantity > 1 ? `${state.quantity}×` : ""}D${sides}`;
  elements.resultBreakdown.textContent = "Pulsa el botón o la barra espaciadora";
  elements.rollResult.className = "roll-result";
}

function updateControls() {
  elements.quantity.textContent = state.quantity;
  elements.modifier.textContent = signed(state.modifier);
  elements.resultTotal.textContent = `${state.quantity > 1 ? `${state.quantity}×` : ""}D${state.sides}`;
}

function stepControl(type, delta) {
  if (type === "quantity") state.quantity = Math.max(1, Math.min(10, state.quantity + delta));
  if (type === "modifier") state.modifier = Math.max(-20, Math.min(20, state.modifier + delta));
  updateControls();
}

function playRollSound() {
  if (!state.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  [0, .08, .16, .24].forEach((delay, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 120 + index * 35 + Math.random() * 30;
    gain.gain.setValueAtTime(.045, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + delay + .09);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + .1);
  });
  setTimeout(() => context.close(), 700);
}

function roll() {
  if (state.rolling) return;
  state.rolling = true;
  elements.rollButton.disabled = true;
  elements.heroDie.classList.add("rolling");
  elements.resultLabel.textContent = "Los dados están rodando…";
  elements.resultBreakdown.textContent = "El destino se está decidiendo";
  playRollSound();

  let flickerCount = 0;
  const flicker = setInterval(() => {
    elements.dieValue.textContent = randomDie(state.sides);
    flickerCount += 1;
    if (flickerCount > 8) clearInterval(flicker);
  }, 75);

  setTimeout(() => {
    clearInterval(flicker);
    const rolls = Array.from({ length: state.quantity }, () => randomDie(state.sides));
    const subtotal = rolls.reduce((sum, value) => sum + value, 0);
    const total = subtotal + state.modifier;
    const natural = state.quantity === 1 ? rolls[0] : null;

    elements.dieValue.textContent = natural ?? total;
    elements.resultLabel.textContent = natural === state.sides ? "¡Crítico!" : natural === 1 ? "Pifia…" : "Resultado de la tirada";
    elements.resultTotal.textContent = total;
    const rollText = rolls.join(" + ");
    elements.resultBreakdown.textContent = state.modifier ? `${rollText} ${signed(state.modifier)} = ${total}` : `${rollText} = ${total}`;
    elements.rollResult.className = `roll-result${natural === state.sides ? " critical" : natural === 1 ? " fumble" : ""}`;
    elements.heroDie.classList.remove("rolling");
    elements.rollButton.disabled = false;
    state.rolling = false;

    state.history.unshift({
      id: Date.now(),
      sides: state.sides,
      quantity: state.quantity,
      modifier: state.modifier,
      rolls,
      total,
      timestamp: new Date().toISOString(),
    });
    state.history = state.history.slice(0, 12);
    saveHistory();
    renderHistory();
  }, 860);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function isToday(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function renderHistory() {
  if (!state.history.length) {
    elements.historyList.innerHTML = `
      <div class="empty-history">
        <span class="empty-die" aria-hidden="true">?</span>
        <strong>Aún no hay tiradas</strong>
        <p>Tu aventura comienza con el primer lanzamiento.</p>
      </div>`;
  } else {
    elements.historyList.innerHTML = state.history.map((item) => {
      const formula = `${item.quantity > 1 ? `${item.quantity}×` : ""}D${item.sides}${item.modifier ? signed(item.modifier) : ""}`;
      const breakdown = `${item.rolls.join(" + ")}${item.modifier ? ` ${signed(item.modifier)}` : ""}`;
      return `
        <article class="history-item">
          <span class="history-die" aria-hidden="true">D${item.sides}</span>
          <div class="history-detail">
            <strong>${formula}</strong>
            <span>${breakdown}</span>
          </div>
          <div class="history-total">
            <strong>${item.total}</strong>
            <time datetime="${item.timestamp}">${formatTime(item.timestamp)}</time>
          </div>
        </article>`;
    }).join("");
  }

  const today = state.history.filter((item) => isToday(item.timestamp));
  elements.rollCount.textContent = today.length;
  elements.bestRoll.textContent = today.length ? Math.max(...today.map((item) => item.total)) : "—";
}

elements.diceGrid.addEventListener("click", (event) => {
  const option = event.target.closest(".die-option");
  if (option) setSides(Number(option.dataset.sides));
});

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => stepControl(button.dataset.step, Number(button.dataset.delta)));
});

elements.rollButton.addEventListener("click", roll);

elements.clearHistory.addEventListener("click", () => {
  state.history = [];
  saveHistory();
  renderHistory();
});

elements.soundToggle.addEventListener("click", () => {
  state.sound = !state.sound;
  elements.soundToggle.setAttribute("aria-pressed", String(state.sound));
  elements.soundToggle.setAttribute("aria-label", state.sound ? "Desactivar sonido" : "Activar sonido");
});

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && !["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    roll();
  }
});

renderHistory();
