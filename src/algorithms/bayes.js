/**
 * 6-апта: Ықтималдық және Байес ережесі.
 * Хабарламалар бойынша әр жол ұяшығының P(су басты) ықтималдығын есептейді.
 * Жауапты: Жарқын Динара. Сипаттама: docs/SPEC.md, 3-бөлім.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Bayes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Ұяшықтың алғашқы P(F) мәні map.priors-тен:
   * көпір '=' → bridge, '~' ұяшығымен көрші → nearWater, әйтпесе → default.
   */
    function priorFor(map, x, y) {
    if (!map || !Array.isArray(map.grid) || !map.priors) {
      throw new Error('Карта немесе priors қате');
    }

    const grid = map.grid;

    if (
      !Number.isInteger(x) || !Number.isInteger(y) ||
      y < 0 || y >= grid.length ||
      !grid[y] || x < 0 || x >= grid[y].length
    ) {
      throw new Error('Координаттар картадан тыс');
    }

    let key = 'default';

    if (grid[y][x] === '=') {
      key = 'bridge';
    } else {
      const directions = [
        [0, -1], [0, 1], [-1, 0], [1, 0]
      ];

      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;

        if (
          ny >= 0 && ny < grid.length &&
          grid[ny] && nx >= 0 && nx < grid[ny].length &&
          grid[ny][nx] === '~'
        ) {
          key = 'nearWater';
          break;
        }
      }
    }

    const p = map.priors[key];

    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error('Алғашқы ықтималдық 0 мен 1 аралығында болуы керек');
    }

    return p;
  }
  
  /**
   * Бір хабардан кейінгі жаңа ықтималдық.
   * @param {number} p      алдыңғы P(F), 0..1
   * @param {string} says   'flooded' немесе 'dry'
   * @param {number} r      хабар сенімділігі, 0..1
   * @returns {number}      P(F | хабар)
   */
    function update(p, says, r) {
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error('Ықтималдық 0 мен 1 аралығында болуы керек');
    }

    if (!Number.isFinite(r) || r < 0 || r > 1) {
      throw new Error('Сенімділік 0 мен 1 аралығында болуы керек');
    }

    if (says !== 'flooded' && says !== 'dry') {
      throw new Error('Хабар flooded немесе dry болуы керек');
    }

    const likelihoodFlooded = says === 'flooded' ? r : 1 - r;
    const likelihoodDry = says === 'flooded' ? 1 - r : r;

    const numerator = likelihoodFlooded * p;
    const denominator = numerator + likelihoodDry * (1 - p);

    if (denominator === 0) {
      throw new Error('Бұл хабар үшін ықтималдықты есептеу мүмкін емес');
    }

    return numerator / denominator;
  }

  /**
   * Барлық хабарламаны ретімен қолдану.
   * @returns {{ probs: Map<string, number>, steps: Array }}
   *   probs — "x,y" → P(F) әр өтуге болатын ұяшық үшін;
   *   steps — әр хабардан кейінгі өзгеріс: { x, y, says, before, after }.
   */
    function applyReports(map, reports, r) {
    if (!map || !Array.isArray(map.grid) || !map.priors) {
      throw new Error('Карта немесе priors қате');
    }

    if (!Array.isArray(reports)) {
      throw new Error('Хабарламалар тізім болуы керек');
    }

    if (!Number.isFinite(r) || r < 0 || r > 1) {
      throw new Error('Сенімділік 0 мен 1 аралығында болуы керек');
    }

    const probs = new Map();
    const steps = [];
    const walkable = new Set(['.', '=', 'H', 'S']);

    // Әр өтуге болатын ұяшықтың алғашқы ықтималдығы.
    for (let y = 0; y < map.grid.length; y++) {
      const row = map.grid[y];

      if (typeof row !== 'string' && !Array.isArray(row)) {
        throw new Error('Карта жолы қате');
      }

      for (let x = 0; x < row.length; x++) {
        if (walkable.has(row[x])) {
          probs.set(`${x},${y}`, priorFor(map, x, y));
        }
      }
    }

    // Хабарламаларды ретімен қолдану.
    for (const report of reports) {
      if (
        !report ||
        !Number.isInteger(report.x) ||
        !Number.isInteger(report.y)
      ) {
        throw new Error('Хабар координаттары бүтін сан болуы керек');
      }

      const { x, y, says } = report;
      const key = `${x},${y}`;

      if (!probs.has(key)) {
        throw new Error('Хабар өтуге болатын ұяшыққа қатысты болуы керек');
      }

      const before = probs.get(key);
      const after = update(before, says, r);

      probs.set(key, after);
      steps.push({ x, y, says, before, after });
    }

    return { probs, steps };
  }
  
  return { priorFor, update, applyReports };
});
