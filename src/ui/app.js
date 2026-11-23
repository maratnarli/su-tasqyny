
/**
 * Интерфейс: картаны салу, батырмалар, «Қалай ойлады?» режимі.
 * Жауапты: Нұрдаулет Шұғыла (дизайн), бәрі бірге (модульдерді қосу).
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
    distances: null
  };

  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');

  function showError(message) {
    const box = document.getElementById('error');
    box.textContent = message;
    box.hidden = false;
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

        ctx.fillStyle = CELL_COLORS[ch] || '#fff';
        ctx.fillRect(x * size, y * size, size, size);

        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.strokeRect(x * size, y * size, size, size);

        if (ch === 'S' || ch === 'H') {
          ctx.fillStyle = '#1b2433';
          ctx.font = `bold ${Math.floor(size * 0.45)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            ch === 'S' ? 'S' : '⌂',
            x * size + size / 2,
            y * size + size / 2
          );
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

  // ─── Маршрут (Марат) ─────────────────────────────

  function onHouseClick(cell) {
    state.routeView = RouteUI.compute(
      state.map,
      cell,
      state.probs
    );

    state.route = state.routeView.astar;

    draw();

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
  }

  canvas.addEventListener('click', (event) => {
    if (!state.map) return;

    try {
      const cell = cellFromEvent(event);
      if (!cell) return;

      const ch = MapUtil.cellAt(state.map, cell.x, cell.y);

      if (ch === 'H') {
        onHouseClick(cell);
      }

      // TODO (Динара): жол ұяшығын басқанда хабарламаны көрсету.
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
          <td>${Number.isFinite(distance) ? distance.toFixed(1) : '—'}</td>
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
              <th>Медицина</th>
              <th>Пункт</th>
              <th>Жол ұзындығы</th>
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

    } catch (err) {
      showError(err.message);
    }
  }

  document.getElementById('assign-button')
    .addEventListener('click', onAssignClick);

  // ─── Картаны жүктеу ───────────────────────────────

  loadMap()
    .then(map => {
      state.map = map;

      draw();

      RouteUI.renderPanel(
        document.getElementById('route-panel'),
        null
      );

      RouteUI.renderExplain(
        document.getElementById('explain-panel'),
        null,
        draw
      );
    })
    .catch(err => showError(err.message));

})();
