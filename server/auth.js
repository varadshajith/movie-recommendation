// auth.js - register, log in, log out, and the check that protects the watchlist routes
// Passwords are never stored as plain text: we store a random salt + a scrypt hash.
// Logging in gives the browser a random token; it sends it back as "Authorization: Bearer <token>".
const crypto = require('node:crypto');
const db = require('./db');

// Turn a password into "salt:hash" for the database
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}

// Hash the typed password with the saved salt and compare with the saved hash
function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(password, salt, 64));
}

// Server-side validation (the browser checks too, but anyone can skip the browser)
function checkInput(username, password) {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return 'Username must be 3-20 letters, numbers or _';
  if (password.length < 6 || password.length > 100) return 'Password must be 6-100 characters';
  return null;
}

// Make a random token, remember it, and send it to the browser
function startSession(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  db.createSession(token, user.id);
  res.json({ token, username: user.username });
}

// POST /api/register - create an account, then log straight in
function register(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const error = checkInput(username, password);
  if (error) return res.status(400).json({ error });
  let id;
  try { id = db.createUser(username, hashPassword(password)); }
  catch (e) { return res.status(409).json({ error: 'That username is already taken' }); }
  startSession(res, { id, username });
}

// POST /api/login - check the password, then start a session
function login(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = db.findUser(username);
  if (!user || !passwordMatches(password, user.pass_hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  startSession(res, user);
}

// Middleware: find the user from the token, or answer 401
function requireLogin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = token ? db.userForToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Please log in' });
  req.user = user;
  req.token = token;
  next();
}

// POST /api/logout - forget this token
function logout(req, res) {
  db.deleteSession(req.token);
  res.json({ ok: true });
}

module.exports = { hashPassword, passwordMatches, checkInput, register, login, logout, requireLogin };
