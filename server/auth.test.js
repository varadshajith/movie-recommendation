// auth.test.js - checks the password and validation logic. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, passwordMatches, checkInput } = require('./auth');

test('right password matches, wrong one does not', () => {
  const stored = hashPassword('secret123');
  assert.ok(!stored.includes('secret123')); // never stored as plain text
  assert.ok(passwordMatches('secret123', stored));
  assert.ok(!passwordMatches('wrong-pass', stored));
});

test('same password gives a different hash each time (random salt)', () => {
  assert.notStrictEqual(hashPassword('secret123'), hashPassword('secret123'));
});

test('bad usernames and short passwords are rejected', () => {
  assert.strictEqual(checkInput('varad', 'secret123'), null);
  assert.ok(checkInput('ab', 'secret123'));          // too short
  assert.ok(checkInput('bad name!', 'secret123'));   // space and !
  assert.ok(checkInput('varad', '123'));             // password too short
});
