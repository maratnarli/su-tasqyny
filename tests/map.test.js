// Мысал картаның дұрыстығын тексереді. Бұл тесттер қазір де өтеді.
const test = require('node:test');
const assert = require('node:assert/strict');
const village = require('../data/village.json');
const MapUtil = require('../src/map.js');

test('карта өлшемі width × height-ке сай', () => {
  assert.equal(village.grid.length, village.height);
  for (const row of village.grid) assert.equal(row.length, village.width);
});

test('картада тек белгілі белгілер бар', () => {
  const allowed = new Set(Object.keys(village.legend));
  for (const row of village.grid) for (const ch of row) assert.ok(allowed.has(ch), `белгісіз белгі: ${ch}`);
});

test('әр отбасының үйі картада H белгісімен тұр', () => {
  for (const f of village.families) assert.equal(village.grid[f.house.y][f.house.x], 'H', f.id);
});

test('әр пункт картада S белгісімен тұр', () => {
  for (const s of village.shelters) assert.equal(village.grid[s.y][s.x], 'S', s.id);
});

test('жалпы орын саны адам санынан көп', () => {
  const people = village.families.reduce((a, f) => a + f.size, 0);
  const places = village.shelters.reduce((a, s) => a + s.capacity, 0);
  assert.ok(places >= people, `${people} адам, ${places} орын`);
});

test('cellAt картадан тыс координатқа түсінікті қате шығарады', () => {
  assert.throws(() => MapUtil.cellAt(village, 56, 42), /картадан тыс/);
});
test('neighbors қабырға мен суды қайтармайды', () => {
  for (let y = 0; y < village.height; y++) {
    for (let x = 0; x < village.width; x++) {
      for (const n of MapUtil.neighbors(village, x, y)) {
        const ch = MapUtil.cellAt(village, n.x, n.y);
        assert.notEqual(ch, '#');
        assert.notEqual(ch, '~');
      }
    }
  }
});
