// Form validation for the Reel register form.
// Username/password rules are the same ones the Reel server enforces (reel-backend/auth.js).
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

const $ = (id) => document.getElementById(id);

// Each rule returns an error message, or '' when the value is fine.
const rules = {
  username: () => (USERNAME_RE.test($('username').value.trim()) ? '' : 'Username must be 3–20 letters, numbers or underscores.'),
  email: () => (EMAIL_RE.test($('email').value.trim()) ? '' : 'Enter a valid email address.'),
  password: () => {
    const p = $('password').value;
    if (p.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
    if (!/\d/.test(p)) return 'Password must contain a number.';
    return '';
  },
  confirm: () => ($('confirm').value === $('password').value && $('confirm').value ? '' : 'Passwords do not match.'),
  genre: () => (document.querySelectorAll('input[name="genre"]:checked').length >= 2 ? '' : 'Pick at least 2 genres.'),
  terms: () => ($('terms').checked ? '' : 'You must accept the terms.'),
};

// Show/hide the message under a field and colour the input.
function check(name) {
  const msg = rules[name]();
  $(name + 'Err').textContent = msg;
  const input = $(name);
  if (input) input.classList.toggle('invalid', !!msg);
  return !msg;
}

// Live validation: check a field as soon as the user leaves it.
['username', 'email', 'password', 'confirm'].forEach((name) => {
  $(name).addEventListener('blur', () => check(name));
  $(name).addEventListener('input', () => { if ($(name).classList.contains('invalid')) check(name); });
});

// Password strength meter (0–4 points).
$('password').addEventListener('input', () => {
  const p = $('password').value;
  const score = [p.length >= 6, p.length >= 10, /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
  $('meterBar').style.width = score * 25 + '%';
  $('meterBar').style.background = ['#ef4444', '#ef4444', '#f59e0b', '#84cc16', '#22c55e'][score];
});

$('togglePw').addEventListener('click', (e) => {
  const show = $('password').type === 'password';
  $('password').type = $('confirm').type = show ? 'text' : 'password';
  e.target.textContent = show ? 'Hide passwords' : 'Show passwords';
});

$('register').addEventListener('submit', (e) => {
  e.preventDefault();                                     // stop the page from reloading
  const ok = Object.keys(rules).map(check).every(Boolean); // run ALL rules so every error shows
  if (!ok) return;

  const genres = [...document.querySelectorAll('input[name="genre"]:checked')].map((c) => c.value);
  $('register').hidden = true;
  $('success').hidden = false;
  $('success').textContent = `Welcome, ${$('username').value.trim()}! We'll start you off with ${genres.join(' & ')}.`;
});
