// login.js - the login page: check the form, then log in or create an account

const form = document.getElementById('login-form');
const message = document.getElementById('message');

// Already logged in? Go straight to the app
if (localStorage.getItem('token')) location.replace('/');

// Validate the form, then send it to /api/login or /api/register
async function send(action) {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  // Client-side validation (the server checks the same rules again)
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    message.textContent = 'Username must be 3-20 letters, numbers or _';
    return;
  }
  if (password.length < 6) {
    message.textContent = 'Password must be at least 6 characters.';
    return;
  }

  try {
    const res = await fetch('/api/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { message.textContent = data.error; return; }
    // Remember who is logged in, then open the app
    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    location.replace('/');
  } catch (e) {
    message.textContent = 'Could not reach the server.';
  }
}

form.addEventListener('submit', event => {
  event.preventDefault(); // stop the page reloading
  send('login');
});
document.getElementById('register-btn').addEventListener('click', () => send('register'));
