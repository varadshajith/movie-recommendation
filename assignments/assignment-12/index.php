<?php
// Practical 12: form handling, validation, string manipulation and sessions.
// Reel "Quick Review" page — no database; everything lives in $_SESSION.
// Validation + CSRF + escaping are the same as reel-php/login.php and db.php.
session_start();

function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function csrfToken(): string { return $_SESSION['csrf'] ??= bin2hex(random_bytes(16)); }

// ---------- session: who is this + visit counter ----------
$_SESSION['visits'] = ($_SESSION['visits'] ?? 0) + 1;
$_SESSION['reviews'] ??= [];

$errors = [];
$old = ['name' => $_SESSION['name'] ?? '', 'title' => '', 'rating' => '', 'review' => ''];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
        http_response_code(400);
        exit('Invalid form token. Go back and try again.');
    }

    if (($_POST['action'] ?? '') === 'clear') {
        session_unset();
        session_destroy();
        header('Location: index.php'); exit;
    }

    // ---------- form handling + validation ----------
    $old = [
        'name'   => trim($_POST['name'] ?? ''),
        'title'  => trim($_POST['title'] ?? ''),
        'rating' => trim($_POST['rating'] ?? ''),
        'review' => trim($_POST['review'] ?? ''),
    ];
    if (!preg_match('/^[A-Za-z0-9_ ]{3,20}$/', $old['name']))   $errors[] = 'Name must be 3–20 letters, numbers, spaces or underscores.';
    if ($old['title'] === '' || mb_strlen($old['title']) > 120) $errors[] = 'Title is required (max 120 characters).';
    if (filter_var($old['rating'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10]]) === false)
        $errors[] = 'Rating must be a whole number from 1 to 10.';
    if (str_word_count($old['review']) < 3)                      $errors[] = 'Review must be at least 3 words.';
    if (mb_strlen($old['review']) > 500)                         $errors[] = 'Review is too long (max 500 characters).';

    if (!$errors) {
        $_SESSION['name'] = $old['name'];
        array_unshift($_SESSION['reviews'], [
            'title'  => $old['title'],
            'rating' => (int) $old['rating'],
            'review' => $old['review'],
            'time'   => date('d M Y, H:i'),
        ]);
        header('Location: index.php'); exit;   // Post/Redirect/Get: refresh will not resubmit
    }
}

// ---------- string manipulation on the newest review ----------
$latest = $_SESSION['reviews'][0] ?? null;
$stats = null;
if ($latest) {
    $text = $latest['review'];
    $stats = [
        'Title in UPPER case'        => strtoupper($latest['title']),
        'Title in Title Case'        => ucwords(strtolower($latest['title'])),
        'Slug (URL-friendly)'        => trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($latest['title'])), '-'),
        'Characters'                 => mb_strlen($text),
        'Words'                      => str_word_count($text),
        'Reversed title'             => strrev($latest['title']),
        'First 40 chars'             => mb_strlen($text) > 40 ? substr($text, 0, 40) . '…' : $text,
        'Contains "love"?'           => stripos($text, 'love') !== false ? 'Yes' : 'No',
        'Censored ("bad" → "b*d")'   => str_ireplace('bad', 'b*d', $text),
        'Stars'                      => str_repeat('★', $latest['rating']) . str_repeat('☆', 10 - $latest['rating']),
        'Padded rating'              => str_pad((string) $latest['rating'], 2, '0', STR_PAD_LEFT) . '/10',
        'Most used word'             => (function (string $t) {
                                            $words = array_count_values(str_word_count(strtolower($t), 1));
                                            arsort($words);
                                            return array_key_first($words);
                                        })($text),
    ];
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reel — Quick Review</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="bar">
  <h1>Reel <em>Reviews</em></h1>
  <span>
    <?= ($_SESSION['name'] ?? '') ? 'Hi, ' . e($_SESSION['name']) . ' · ' : '' ?>
    visit #<?= (int) $_SESSION['visits'] ?> this session
  </span>
</header>

<main class="wrap">
  <section class="card">
    <h2>Write a review</h2>
    <?php foreach ($errors as $err): ?><div class="error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= e(csrfToken()) ?>">
      <label>Your name <input name="name" value="<?= e($old['name']) ?>" required></label>
      <label>Movie / show title <input name="title" value="<?= e($old['title']) ?>" required maxlength="120"></label>
      <label>Rating (1–10) <input name="rating" type="number" min="1" max="10" value="<?= e($old['rating']) ?>" required></label>
      <label>Review <textarea name="review" rows="3" maxlength="500" required><?= e($old['review']) ?></textarea></label>
      <button>Save review</button>
    </form>
  </section>

  <?php if ($stats): ?>
  <section class="card">
    <h2>String functions on your latest review</h2>
    <table>
      <?php foreach ($stats as $label => $value): ?>
        <tr><th><?= e($label) ?></th><td><?= e((string) $value) ?></td></tr>
      <?php endforeach; ?>
    </table>
  </section>
  <?php endif; ?>

  <section class="card">
    <h2>Reviews saved in this session (<?= count($_SESSION['reviews']) ?>)</h2>
    <?php if (!$_SESSION['reviews']): ?><p class="sub">None yet.</p><?php endif; ?>
    <ul class="list">
      <?php foreach ($_SESSION['reviews'] as $r): ?>
        <li>
          <strong><?= e($r['title']) ?></strong> <span class="tag">★ <?= (int) $r['rating'] ?>/10</span>
          <p><?= nl2br(e($r['review'])) ?></p>
          <small class="sub"><?= e($r['time']) ?></small>
        </li>
      <?php endforeach; ?>
    </ul>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= e(csrfToken()) ?>">
      <input type="hidden" name="action" value="clear">
      <button class="danger">End session (clear everything)</button>
    </form>
  </section>
</main>
</body>
</html>
