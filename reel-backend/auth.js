// Login system: register / login / logout + the middleware that protects the API.
// Passwords are salted + hashed with scrypt (Node's built-in crypto). A login
// returns a random session token; the browser sends it back as
// `Authorization: Bearer <token>` on every request.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 100;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), candidate);
}

// Max 10 register/login attempts per IP per minute (slows down password guessing).
// ponytail: in-memory map, resets on restart. Use a real store if you ever run >1 server.
const attempts = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  let a = attempts.get(req.ip);
  if (!a || a.resetAt < now) a = { count: 0, resetAt: now + 60_000 };
  attempts.set(req.ip, a);
  if (++a.count > 10) return res.status(429).json({ error: 'Too many attempts — wait a minute.' });
  next();
}

function startSession(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  db.createSession(token, user.id);
  res.json({ token, username: user.username });
}

// Validates the form body; returns an error message or null.
function credentialError(username, password) {
  if (!USERNAME_RE.test(username)) return 'Username must be 3–20 letters, numbers or underscores.';
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters.`;
  }
  return null;
}

const router = express.Router();

router.post('/register', rateLimit, (req, res) => {
  const username = String(req.body.username ?? '').trim();
  const password = String(req.body.password ?? '');
  const error = credentialError(username, password);
  if (error) return res.status(400).json({ error });
  let id;
  try {
    id = db.createUser(username, hashPassword(password));
  } catch {
    return res.status(409).json({ error: 'That username is already taken.' }); // UNIQUE constraint
  }
  startSession(res, { id, username });
});

router.post('/login', rateLimit, (req, res) => {
  const username = String(req.body.username ?? '').trim();
  const password = String(req.body.password ?? '');
  const user = db.findUser(username);
  if (!user || !passwordMatches(password, user.pass_hash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  startSession(res, user);
});

// Express middleware: attaches req.user, or answers 401.
function requireLogin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const user = token ? db.userForToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  req.user = user;
  req.token = token;
  next();
}

router.post('/logout', requireLogin, (req, res) => {
  db.deleteSession(req.token);
  res.json({ ok: true });
});

module.exports = { router, requireLogin, hashPassword, passwordMatches };
