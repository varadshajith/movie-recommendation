<?php
// Login + register (form handling, validation, string functions, sessions).
require 'db.php';

$mode = ($_GET['mode'] ?? 'login') === 'register' ? 'register' : 'login';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $username)) {
        $error = 'Username must be 3–20 letters, numbers or underscores.';
    } elseif (strlen($password) < 6) {
        $error = 'Password must be at least 6 characters.';
    } elseif ($mode === 'register') {
        $exists = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
        $exists->execute([$username]);
        if ($exists->fetch()) {
            $error = 'That username is already taken.';
        } else {
            $pdo->prepare('INSERT INTO users (username, pass_hash) VALUES (?, ?)')
                ->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
            session_regenerate_id(true);
            $_SESSION['uid'] = (int) $pdo->lastInsertId();
            $_SESSION['username'] = $username;
            header('Location: index.php'); exit;
        }
    } else {
        $stmt = $pdo->prepare('SELECT id, pass_hash FROM users WHERE username = ?');
        $stmt->execute([$username]);
        $row = $stmt->fetch();
        if ($row && password_verify($password, $row['pass_hash'])) {
            session_regenerate_id(true);
            $_SESSION['uid'] = (int) $row['id'];
            $_SESSION['username'] = $username;
            header('Location: index.php'); exit;
        }
        $error = 'Wrong username or password.';
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reel Diary — <?= $mode === 'register' ? 'Register' : 'Log in' ?></title>
<link rel="stylesheet" href="diary.css">
</head>
<body>
<main class="card">
  <h1>Reel <em>Diary</em></h1>
  <p class="sub"><?= $mode === 'register' ? 'Create an account' : 'Log in to your diary' ?></p>
  <?php if ($error): ?><div class="error" role="alert"><?= e($error) ?></div><?php endif; ?>
  <form method="post">
    <input type="hidden" name="csrf" value="<?= e(csrfToken()) ?>">
    <label>Username <input name="username" value="<?= e($_POST['username'] ?? '') ?>" required autocomplete="username"></label>
    <label>Password <input name="password" type="password" required autocomplete="<?= $mode === 'register' ? 'new-password' : 'current-password' ?>"></label>
    <button><?= $mode === 'register' ? 'Create account' : 'Log in' ?></button>
  </form>
  <p class="alt">
    <?php if ($mode === 'register'): ?><a href="login.php">Already registered? Log in</a>
    <?php else: ?><a href="login.php?mode=register">New here? Create an account</a><?php endif; ?>
  </p>
</main>
</body>
</html>
