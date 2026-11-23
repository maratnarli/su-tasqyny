// Байес модулінің тесттері. Жауапты: Жарқын Динара.
const test = require('node:test');
const assert = require('node:assert/strict');
const Bayes = require('../src/algorithms/bayes.js');

test('P = 0.6, r = 0.8, «су басты» → ≈ 0.857', () => {
  const result = Bayes.update(0.6, 'flooded', 0.8);

  assert.ok(
    Math.abs(result - 6 / 7) < 1e-10,
    `Күтілгені ≈ 0.857142857, алынғаны: ${result}`
  );
});

test('«су басты», сосын «құрғақ» → P бастапқы мәнге қайтады', () => {
  const initial = 0.6;

  const afterFlooded = Bayes.update(initial, 'flooded', 0.8);
  const afterDry = Bayes.update(afterFlooded, 'dry', 0.8);

  assert.ok(
    Math.abs(afterDry - initial) < 1e-10,
    `Күтілгені: ${initial}, алынғаны: ${afterDry}`
  );
});

test('r = 0.5 болса, хабар P-ні өзгертпейді', () => {
  const initial = 0.6;

  for (const says of ['flooded', 'dry']) {
    const result = Bayes.update(initial, says, 0.5);

    assert.ok(
      Math.abs(result - initial) < 1e-10,
      `${says}: күтілгені ${initial}, алынғаны ${result}`
    );
  }
});

test('бірдей бес хабар → P 1-ге жақындайды, бірақ 1-ден аспайды', () => {
  let p = 0.6;

  for (let i = 0; i < 5; i++) {
    const before = p;
    p = Bayes.update(p, 'flooded', 0.8);

    assert.ok(p > before, 'Ықтималдық өсуі керек');
    assert.ok(p <= 1, 'Ықтималдық 1-ден аспауы керек');
  }

  assert.ok(p > 0.99, `Күтілгені > 0.99, алынғаны: ${p}`);
});

test('r = 1.5 немесе says = "abc" → түсінікті қате', () => {
  assert.throws(
    () => Bayes.update(0.6, 'flooded', 1.5),
    /Сенімділік 0 мен 1 аралығында болуы керек/
  );

  assert.throws(
    () => Bayes.update(0.6, 'abc', 0.8),
    /Хабар flooded немесе dry болуы керек/
  );
});
