/**
 * Маршрут интерфейсі: үйді басқанда A* жолын салу және «Қалай ойлады?» режимі.
 * Жауапты: Марат Нәрлі. Сипаттама: docs/SPEC.md, 6-бөлім.
 *
 * Бұл файл интерфейстің тек маршрут бөлігі. app.js оны былай қолданады:
 *   RouteUI.compute(map, cell, probs)          → маршрутты есептеу (A* және салыстыру үшін BFS)
 *   RouteUI.drawOverlay(ctx, view, cellSize)   → draw() соңында: зерттелген ұяшықтар мен жолды салу
 *   RouteUI.renderPanel(el, view)              → «Маршрут» панелі
 *   RouteUI.renderExplain(el, view, redraw)    → «Қалай ойлады?» панелі (анимация, BFS-пен салыстыру)
 * Сайттың қалған бөлігі (карта, түстер, дизайн) — Шұғыланың app.js-і.
 */
(function (root) {
  'use strict';

  const COLORS = {
    exploredA: 'rgba(255, 159, 28, 0.45)', // A* зерттеген ұяшықтар — қызғылт сары
    exploredB: 'rgba(120, 120, 140, 0.35)', // BFS зерттеген ұяшықтар — сұр
    path: '#e63946',                        // жол — қызыл
    start: '#e63946',
  };

  /** Ұяшыққа сәйкес отбасын табу (үй болса). */
  function familyAt(map, cell) {
    return map.families.find((f) => f.house.x === cell.x && f.house.y === cell.y) || null;
  }

  /**
   * Маршрутты есептеу: таңдалған ұяшықтан ең жақын қауіпсіз пунктке.
   * @param map    data/village.json
   * @param cell   {x, y} — басылған ұяшық (әдетте үй)
   * @param probs  Байес нәтижесі: Map "x,y" → P(F), жоқ болса null
   * @returns view — сурет пен панельдерге керек барлық дерек
   */
  function compute(map, cell, probs) {
    const goals = map.shelters.map((s) => ({ x: s.x, y: s.y }));
    const options = probs ? { floodProb: probs } : {};
    const astar = root.Search.aStar(map, cell, goals, options);
    const bfs = root.Search.bfs(map, cell, goals, options);
    const shelter = astar.found
      ? map.shelters.find((s) => s.x === astar.goal.x && s.y === astar.goal.y)
      : null;
    return {
      start: cell,
      family: familyAt(map, cell),
      shelter,
      astar,
      bfs,
      step: astar.order.length, // анимация қадамы: әдепкіде бәрі көрінеді
      showBfs: false,           // BFS-тің зерттегенін көрсету ме
      playing: false,
    };
  }

  /** Бір ұяшықты бояу. */
  function fillCell(ctx, cell, cellSize, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
  }

  /**
   * draw() соңында шақырылады: зерттелген ұяшықтар, жол, бастапқы нүкте.
   * view null болса, ештеңе салмайды.
   */
  function drawOverlay(ctx, view, cellSize) {
    if (!view) return;
    const half = cellSize / 2;

    // 1. BFS зерттеген ұяшықтар (салыстыру режимінде)
    if (view.showBfs) {
      for (const c of view.bfs.order) fillCell(ctx, c, cellSize, COLORS.exploredB);
    }

    // 2. A* зерттеген ұяшықтар: view.step-ке дейін (анимация осылай жүреді)
    const shown = view.astar.order.slice(0, view.step);
    shown.forEach((c, i) => {
      fillCell(ctx, c, cellSize, COLORS.exploredA);
      if (cellSize >= 22) {
        ctx.fillStyle = 'rgba(60, 30, 0, 0.8)';
        ctx.font = `${Math.floor(cellSize * 0.32)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), c.x * cellSize + half, c.y * cellSize + half);
      }
    });

    // 3. Жол: анимация аяқталғанда ғана
    const done = view.step >= view.astar.order.length;
    if (done && view.astar.found) {
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = Math.max(3, cellSize * 0.18);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Анимация: жол біртіндеп сызылады (view.pathStep).
      const visible = view.pathStep == null
        ? view.astar.path
        : view.astar.path.slice(0, view.pathStep);
      visible.forEach((c, i) => {
        const px = c.x * cellSize + half;
        const py = c.y * cellSize + half;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Жолдың басы (жылжып бара жатқан нүкте)
      const head = visible[visible.length - 1];
      if (head && view.pathStep != null && view.pathStep < view.astar.path.length) {
        ctx.fillStyle = COLORS.path;
        ctx.beginPath();
        ctx.arc(head.x * cellSize + half, head.y * cellSize + half, cellSize * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Бастапқы нүкте
    ctx.strokeStyle = COLORS.start;
    ctx.lineWidth = 3;
    ctx.strokeRect(view.start.x * cellSize + 1.5, view.start.y * cellSize + 1.5, cellSize - 3, cellSize - 3);
  }

  /** Санды әдемі шығару: 35 немесе 41.5 */
  function num(x) {
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  /** «Маршрут» панелі. */
  function renderPanel(el, view) {
    if (!el) return;
    if (!view) {
      el.innerHTML = '<p class="hint">Маршрут көру үшін картадағы үйді басыңыз.</p>';
      return;
    }
    const who = view.family
      ? `<b>${view.family.name}</b> (${view.family.size} адам${view.family.needsMedical ? ', медициналық көмек керек' : ''})`
      : `ұяшық (${view.start.x}, ${view.start.y})`;
    if (!view.astar.found) {
      el.innerHTML = `
        <p>${who}</p>
        <p class="route-none">Қауіпсіз жол табылмады: барлық жол су басқан немесе жабық.</p>
        <p class="hint">Жүйе өзі шешім қабылдамайды. Құтқарушыларға хабарласыңыз: <b>112</b>.</p>`;
      return;
    }
    const steps = view.astar.path.length - 1;
    const risky = view.astar.cost > steps;
    el.innerHTML = `
      <p>${who}</p>
      <p>Ең жақын қауіпсіз пункт: <b>${view.shelter.name}</b>${view.shelter.hasMedical ? ' (медпункт бар)' : ''}</p>
      <p>Жол: <b>${steps}</b> қадам${risky ? `, қауіп ескерілген құны: <b>${num(view.astar.cost)}</b>` : ''}</p>
      ${risky ? '<p class="hint">Жолдың бір бөлігінде су басу қаупі бар, сондықтан құны қадам санынан жоғары.</p>' : ''}`;
  }

  /** «Қадамдап көрсету» анимациясы: view.step-ті 0-ден бастап арттырып, әр кадрда redraw() шақырады. */
  function play(view, redraw, onEnd) {
    if (view.playing) return;
    view.playing = true;
    view.step = 0;
    const total = view.astar.order.length;
    const delay = Math.max(25, Math.min(120, 2500 / Math.max(total, 1)));
    const timer = setInterval(() => {
      view.step += 1;
      redraw();
      if (view.step >= total) {
        clearInterval(timer);
        view.playing = false;
        if (onEnd) onEnd();
      }
    }, delay);
  }

  /** «Қалай ойлады?» панелі: түсіндірме, анимация, BFS-пен салыстыру. */
  function renderExplain(el, view, redraw) {
    if (!el) return;
    if (!view) {
      el.innerHTML = '<p class="hint">Үйді басқаннан кейін A* қалай іздегенін осы жерден көре аласыз.</p>';
      return;
    }
    const a = view.astar.expanded;
    const b = view.bfs.expanded;
    const ratio = a > 0 ? (b / a).toFixed(1) : '—';
    el.innerHTML = `
      <h3>A* қалай ойлады?</h3>
      <p>A* әр ұяшыққа <b>f = g + h</b> санын береді:
        <b>g</b> — осы ұяшыққа дейін жұмсалған құн, <b>h</b> — пунктке дейінгі болжам (Манхэттен қашықтығы).
        Әр қадамда f ең кіші ұяшықты тексереді, сондықтан пунктке қарай бағыттап іздейді.</p>
      <p>Су басу қаупі бар ұяшықтың құны: <b>1 + 10 · P</b>. P > 0,7 болса, ұяшық жабық.</p>
      <table class="compare">
        <tr><th></th><th>A*</th><th>BFS</th></tr>
        <tr><td>Зерттелген ұяшық</td><td>${a}</td><td>${b}</td></tr>
        <tr><td>Жол ұзындығы</td><td>${view.astar.found ? view.astar.path.length - 1 : '—'}</td><td>${view.bfs.found ? view.bfs.path.length - 1 : '—'}</td></tr>
      </table>
      <p>A* BFS-тен <b>${ratio}</b> есе аз ұяшық тексерді.</p>
      <div class="explain-buttons">
        <button type="button" data-act="play">▶ Қадамдап көрсету</button>
        <button type="button" data-act="bfs">${view.showBfs ? 'BFS-ті жасыру' : 'BFS-пен салыстыру'}</button>
      </div>
      <p class="hint">Қызғылт сары — A* тексерген ұяшықтар (сандары — тексеру реті)${view.showBfs ? ', сұр — BFS тексерген ұяшықтар' : ''}, қызыл сызық — табылған жол.</p>`;

    el.querySelector('[data-act="play"]').addEventListener('click', () => play(view, redraw));
    el.querySelector('[data-act="bfs"]').addEventListener('click', () => {
      view.showBfs = !view.showBfs;
      redraw();
      renderExplain(el, view, redraw);
    });
  }

  root.RouteUI = { compute, drawOverlay, renderPanel, renderExplain, play, familyAt };
})(typeof self !== 'undefined' ? self : this);
