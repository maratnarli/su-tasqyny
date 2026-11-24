/**
 * Интерфейс: карта, маршрут, Байес хабарламалары және CSP бөлу.
 * Дизайн / CSP: Шұғыла. Маршрут: Марат. Байес: Динара.
 */
(function () {
  'use strict';

  const state = {
    map: null,
    reports: [],
    reliability: 0.8,
    probs: null,
    route: null,
    assignment: null,
    routeView: null,
    cspResult: null,
    distances: null,
    steps: [],
    selectedCell: null,
    selectedHouse: null
  };

  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  const reliabilityInput = document.getElementById('reliability');
  const floodedButton = document.getElementById('report-flooded');
  const dryButton = document.getElementById('report-dry');
  const resetButton = document.getElementById('reset-reports');

  function showError(message) {
    const box = document.getElementById('error');
    box.textContent = message;
    box.hidden = false;
  }

  function clearError() {
    const box = document.getElementById('error');
    box.textContent = '';
    box.hidden = true;
  }

  function percent(p) {
    return `${(p * 100).toFixed(2)}%`;
  }

  async function loadMap() {
    const res = await fetch('data/village.json');
    if (!res.ok) throw new Error('Картаны жүктеу мүмкін болмады');
    return res.json();
  }

  const CELL_COLORS = {
    '#': '#9aa5b1',
    '.': '#f7f9fc',
    '~': '#4a90d9',
    '=': '#b07d4f',
    H: '#ffd166',
    S: '#2a9d8f'
  };

  function cellSize() {
    return canvas.width / state.map.width;
  }

  function draw() {
    if (!state.map) return;

    const size = cellSize();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const ch = state.map.grid[y][x];
        const p = state.probs ? (state.probs.get(`${x},${y}`) ?? 0) : 0;

        ctx.fillStyle = CELL_COLORS[ch] || '#fff';

        // Байес: жол мен көпір су басу қаупіне қарай көк түске боялады.
        if (ch === '.' || ch === '=') {
          ctx.fillStyle = `hsl(210, 75%, ${96 - 65 * p}%)`;
        }

        ctx.fillRect(x * size, y * size, size, size);

        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * size, y * size, size, size);

        if (ch === 'S' || ch === 'H' || ch === '=') {
          ctx.fillStyle = ch === '=' && p > 0.5 ? '#fff' : '#1b2433';
          ctx.font = `bold ${Math.floor(size * 0.45)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            ch === 'H' ? '⌂' : ch,
            x * size + size / 2,
            y * size + size / 2
          );
        }

        // Жабық ұяшықты қызыл жақтаумен белгілеу.
        if (
          state.probs &&
          state.probs.has(`${x},${y}`) &&
          p > Search.DEFAULTS.threshold
        ) {
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 3;
          ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
          ctx.lineWidth = 1;
        }
      }
    }

    // Әр үйді өз эвакуация пунктінің түсімен бояу.
    if (state.assignment) {
      const colors = {
        S1: '#ffd166',
        S2: '#90be6d',
        S3: '#cdb4db'
      };

      for (const family of state.map.families) {
        const shelterId = state.assignment[family.id];

        if (!shelterId) continue;

        const color = colors[shelterId] || '#90be6d';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(
          family.house.x * size + size / 2,
          family.house.y * size + size / 2,
          size * 0.35,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Мараттың маршрут модулі.
    RouteUI.drawOverlay(ctx, state.routeView, size);

    // Таңдалған ұяшық (Байес хабары үшін).
    if (state.selectedCell) {
      const { x, y } = state.selectedCell;
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 3;
      ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
    }

    ctx.lineWidth = 1;
  }

  function cellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();

    const x = Math.floor(
      ((event.clientX - rect.left) / rect.width) * state.map.width
    );

    const y = Math.floor(
      ((event.clientY - rect.top) / rect.height) * state.map.height
    );

    if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
      return null;
    }

    return { x, y };
  }

  // ─── Байес панелі ─────────────────────────────────────
  function renderBayesPanel() {
    const selected = document.getElementById('selected-cell');
    const cell = state.selectedCell;

    if (cell) {
      const p = state.probs.get(`${cell.x},${cell.y}`);
      const closed = p > Search.DEFAULTS.threshold;

      selected.textContent =
        `Ұяшық (${cell.x}, ${cell.y}): P = ${percent(p)}. ` +
        (closed ? 'Жол жабық.' : 'Өтуге болады.');
    } else {
      selected.textContent =
        'Картадан жолды немесе көпірді таңдаңыз.';
    }

    floodedButton.disabled = !cell;
    dryButton.disabled = !cell;
    resetButton.disabled = state.reports.length === 0;

    document.getElementById('report-count').textContent =
      `Хабар саны: ${state.reports.length}`;

    const explain = document.getElementById('bayes-explain');
    explain.replaceChildren();

    if (state.steps.length === 0) {
      explain.textContent = 'Әзірге хабарлама жоқ.';
      return;
    }

    const list = document.createElement('ol');

    for (const step of state.steps) {
      const item = document.createElement('li');
      const label = step.says === 'flooded'
        ? 'Су басты'
        : 'Құрғақ';

      item.textContent =
        `(${step.x}, ${step.y}) — «${label}»: ` +
        `${percent(step.before)} → ${percent(step.after)} ` +
        `(r = ${state.reliability}).`;

      list.appendChild(item);
    }

    explain.appendChild(list);
  }

  // ─── Маршрут панелі ───────────────────────────────────
  // ─── Маршрут анимациясы (тек көрініс) ─────────────
  let pathTimer = null;
  let lastAnimatedHouse = null;

  function animatePath(view) {
    if (pathTimer) { clearInterval(pathTimer); pathTimer = null; }
    if (!view || !view.astar || !view.astar.found) return;
    view.pathStep = 1;
    pathTimer = setInterval(() => {
      view.pathStep++;
      if (view.pathStep >= view.astar.path.length) {
        view.pathStep = null;
        clearInterval(pathTimer);
        pathTimer = null;
      }
      draw();
    }, 70);
  }

  // ─── Статистика жолағы ─────────────────────────────
  function renderStats() {
    const el = document.getElementById('stats');
    if (!el || !state.map) return;
    const m = state.map;
    const people = m.families.reduce((s, f) => s + f.size, 0);
    const capacity = m.shelters.reduce((s, sh) => s + sh.capacity, 0);
    const bridges = m.grid.reduce((s, row) => s + row.split('=').length - 1, 0);
    let closed = 0;
    if (state.probs) for (const p of state.probs.values()) if (p > 0.7) closed++;
    const items = [
      ['🏠', m.families.length, 'отбасы'],
      ['🧍', people, 'адам'],
      ['🏫', m.shelters.length, 'пункт'],
      ['🛏️', capacity, 'орын'],
      ['🌉', bridges, 'көпір'],
      ['📡', state.reports.length, 'хабар'],
      ['⛔', closed, 'жабық ұяшық']
    ];
    el.innerHTML = items.map(([i, n, t]) =>
      `<div class="stat"><span class="stat-icon">${i}</span><b>${n}</b><span>${t}</span></div>`
    ).join('');
  }

  function refreshRoute() {
    state.routeView = state.selectedHouse
      ? RouteUI.compute(
          state.map,
          state.selectedHouse,
          state.probs
        )
      : null;

    state.route = state.routeView
      ? state.routeView.astar
      : null;

    // Жаңа үй таңдалса — жолды анимациямен сызу.
    const houseKey = state.selectedHouse
      ? `${state.selectedHouse.x},${state.selectedHouse.y}` : null;
    if (houseKey && houseKey !== lastAnimatedHouse) {
      lastAnimatedHouse = houseKey;
      animatePath(state.routeView);
    }
    renderStats();

    RouteUI.renderPanel(
      document.getElementById('route-panel'),
      state.routeView
    );

    RouteUI.renderExplain(
      document.getElementById('explain-panel'),
      state.routeView,
      draw
    );

    renderCspExplain();
    draw();
  }

  function readReliability() {
    const value = reliabilityInput.value.trim();
    const r = Number(value);

    if (
      value === '' ||
      !Number.isFinite(r) ||
      r < 0 ||
      r > 1
    ) {
      throw new Error(
        'Сенімділік 0 мен 1 аралығында болуы керек'
      );
    }

    return r;
  }

  function applyReportState(reports, r) {
    // Есептеу қате болса, бұрынғы күй сақталады.
    const result = Bayes.applyReports(state.map, reports, r);

    state.reports = reports;
    state.reliability = r;
    state.probs = result.probs;
    state.steps = result.steps;

    renderBayesPanel();

    // CSP бұрын іске қосылған болса, жаңа ықтималдықпен қайта бөлеміз.
    if (state.cspResult) {
      runAssignment();
    }

    refreshRoute();
  }

  function submitReport(says) {
    if (!state.map || !state.selectedCell) return;

    try {
      clearError();

      const { x, y } = state.selectedCell;
      const reports = [
        ...state.reports,
        { x, y, says },
      ];

      applyReportState(reports, readReliability());
    } catch (err) {
      showError(err.message);
    }
  }

  // ─── Оқиғалар ─────────────────────────────────────────
  canvas.addEventListener('click', (event) => {
    if (!state.map) return;

    try {
      clearError();

      const cell = cellFromEvent(event);
      if (!cell) return;

      const ch = MapUtil.cellAt(state.map, cell.x, cell.y);

      if (!['.', '=', 'H', 'S'].includes(ch)) {
        state.selectedCell = null;
        renderBayesPanel();
        draw();
        return;
      }

      state.selectedCell = cell;

      if (ch === 'H') {
        state.selectedHouse = cell;
        refreshRoute();
      } else {
        draw();
      }

      renderBayesPanel();
    } catch (err) {
      showError(err.message);
    }
  });

  floodedButton.addEventListener('click', () => {
    submitReport('flooded');
  });

  dryButton.addEventListener('click', () => {
    submitReport('dry');
  });

  reliabilityInput.addEventListener('change', () => {
    if (!state.map) return;

    try {
      clearError();
      applyReportState(state.reports, readReliability());
    } catch (err) {
      reliabilityInput.value = String(state.reliability);
      showError(err.message);
    }
  });

  resetButton.addEventListener('click', () => {
    if (!state.map) return;

    try {
      clearError();
      applyReportState([], readReliability());
    } catch (err) {
      showError(err.message);
    }
  });


  // ─── CSP: қашықтықтарды есептеу ───────────────────

  function calculateDistances() {
    const distances = {};

    for (const family of state.map.families) {
      distances[family.id] = {};

      for (const shelter of state.map.shelters) {
        const result = Search.aStar(
          state.map,
          family.house,
          [{ x: shelter.x, y: shelter.y }],
          state.probs ? { floodProb: state.probs } : {}
        );

        distances[family.id][shelter.id] =
          result.found ? result.cost : Infinity;
      }
    }

    return distances;
  }

  // ─── CSP нәтижесін көрсету ────────────────────────

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function renderAssignment(result, distances) {
    const el = document.getElementById('assign-result');

    if (!result.ok) {
      el.innerHTML = `
        <div class="error">
          <b>Бөлу мүмкін болмады!</b>
          <p>${escapeHTML(result.reason)}</p>
          <p>Жүйе адамдарды өзі бөлмейді: шешімді штаб қабылдайды.</p>
        </div>
      `;
      return;
    }

    const rows = state.map.families.map(family => {
      const shelterId = result.assignment[family.id];

      const shelter = state.map.shelters.find(
        s => s.id === shelterId
      );

      const distance = distances[family.id][shelterId];

      return `
        <tr>
          <td>${escapeHTML(family.name)}</td>
          <td>${family.size}</td>
          <td>${family.needsMedical ? 'Иә' : 'Жоқ'}</td>
          <td>${escapeHTML(shelter.name)}</td>
          <td>${Number.isFinite(distance) ? (Number.isInteger(distance) ? distance : distance.toFixed(1)) : '—'}</td>
        </tr>
      `;
    }).join('');

    const shelterBars = state.map.shelters.map(shelter => {
      const used = result.load[shelter.id] || 0;

      const percent = shelter.capacity > 0
        ? Math.min(100, (used / shelter.capacity) * 100)
        : 0;

      return `
        <div class="capacity-item">
          <p>
            <b>${escapeHTML(shelter.id)} ${escapeHTML(shelter.name)}</b>:
            ${used} / ${shelter.capacity}
          </p>
          <div class="capacity-bar">
            <div class="capacity-fill" style="width:${percent}%"></div>
          </div>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="success">
        <b>Отбасылар бөлінді!</b>
      </div>

      <div class="table-wrapper">
        <table class="compare">
          <thead>
            <tr>
              <th>Отбасы</th>
              <th>Адам</th>
              <th title="Медициналық көмек керек пе">Мед.</th>
              <th>Пункт</th>
              <th title="Жол ұзындығы (қадам)">Жол</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <h4>Пункттердің толуы</h4>
      ${shelterBars}

      <p class="metrics">
        Backtracks: <b>${result.backtracks}</b> |
        Nodes: <b>${result.nodes}</b>
      </p>
    `;
  }

  // ─── CSP қалай ойлады? ───────────────────────────

  function renderCspExplain() {
    const el = document.getElementById('explain-panel');

    if (!state.cspResult) return;

    const steps = state.cspResult.steps.map(step => {
      let message = '';

      if (step.type === 'assign') {
        message = `${step.family} → ${step.shelter} орналастырдық`;
      }

      if (step.type === 'backtrack') {
        message = `${step.family} → ${step.shelter} тұйыққа апарды, артқа қайттық`;
      }

      if (step.type === 'prune') {
        message = `${step.family} үшін ${step.shelter} енді сыймайды`;
      }

      return `
        <li class="csp-step ${step.type}">
          ${escapeHTML(message)}
        </li>
      `;
    }).join('');

    const section = `
      <div class="csp-explain">
        <h3>CSP қалай ойлады?</h3>

        <p>
          Backtracking — шешім табылмаса, алдыңғы қадамға қайту.
          MRV — қолайлы пункттері аз отбасын бірінші таңдау.
          Forward checking — сыймайтын пункттерді алдын ала алып тастау.
        </p>

        <ol>${steps}</ol>

        <button type="button" id="compare-mrv">
          MRV-мен және MRV-сыз салыстыру
        </button>

        <div id="mrv-comparison"></div>
      </div>
    `;

    const oldSection = el.querySelector('.csp-explain');

    if (oldSection) {
      oldSection.remove();
    }

    el.insertAdjacentHTML('beforeend', section);

    document.getElementById('compare-mrv')
      .addEventListener('click', compareMRV);
  }

  // ─── MRV салыстыру ────────────────────────────────

  function compareMRV() {
    const distances = state.distances;

    const withMRV = CSP.solve(
      state.map.families,
      state.map.shelters,
      distances,
      {
        useMRV: true,
        useForwardChecking: true
      }
    );

    const withoutMRV = CSP.solve(
      state.map.families,
      state.map.shelters,
      distances,
      {
        useMRV: false,
        useForwardChecking: true
      }
    );

    const el = document.getElementById('mrv-comparison');

    el.innerHTML = `
      <h4>Алгоритмдерді салыстыру</h4>

      <table class="compare">
        <tr>
          <th>Метрика</th>
          <th>MRV бар</th>
          <th>MRV жоқ</th>
        </tr>

        <tr>
          <td>Backtracks</td>
          <td>${withMRV.backtracks}</td>
          <td>${withoutMRV.backtracks}</td>
        </tr>

        <tr>
          <td>Nodes</td>
          <td>${withMRV.nodes}</td>
          <td>${withoutMRV.nodes}</td>
        </tr>
      </table>
    `;
  }

  // ─── Барлық отбасын бөлу ──────────────────────────

  function onAssignClick() {
    try {
      clearError();
      runAssignment();
    } catch (err) {
      showError(err.message);
    }
  }

  function runAssignment() {
    if (!state.map) {
      throw new Error('Карта әлі жүктелген жоқ');
    }

    const useMRV = document.getElementById('use-mrv').checked;
    const useForwardChecking =
      document.getElementById('use-forward').checked;

    // Әр отбасы мен әр пункт арасындағы A* қашықтығын есептеу.
    state.distances = calculateDistances();

    // CSP алгоритмін іске қосу.
    const result = CSP.solve(
      state.map.families,
      state.map.shelters,
      state.distances,
      {
        useMRV,
        useForwardChecking
      }
    );

    state.cspResult = result;

    state.assignment = result.ok
      ? result.assignment
      : null;

    // Картаны жаңарту.
    draw();

    // Нәтижені шығару.
    renderAssignment(result, state.distances);

    // CSP қадамдарын түсіндіру.
    renderCspExplain();
  }

  document.getElementById('assign-button')
    .addEventListener('click', onAssignClick);

  // ─── Картаны жүктеу ───────────────────────────────

  loadMap()
    .then(map => {
      state.map = map;
      applyReportState([], state.reliability);
    })
    .catch(err => showError(err.message));

})();
