<?php
// The diary: Create, Read, Update, Delete rows in MySQL (practical 13).
require 'db.php';
$uid = requireLogin();

$errors = [];
$editing = null;   // row being edited, if any

// ---------- CREATE / UPDATE / DELETE (all POST, all CSRF-checked) ----------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();
    $action = $_POST['action'] ?? '';
    $id = (int) ($_POST['id'] ?? 0);

    if ($action === 'delete') {
        $pdo->prepare('DELETE FROM diary WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        header('Location: index.php'); exit;
    }

    if ($action === 'save') {
        $title  = trim($_POST['title'] ?? '');
        $kind   = in_array($_POST['kind'] ?? '', ['movie', 'tv'], true) ? $_POST['kind'] : 'movie';
        $status = in_array($_POST['status'] ?? '', ['want', 'watched'], true) ? $_POST['status'] : 'want';
        $note   = trim($_POST['note'] ?? '');
        $rating = $status === 'watched' && $_POST['rating'] !== '' ? (int) $_POST['rating'] : null;

        if ($title === '' || mb_strlen($title) > 120) $errors[] = 'Title is required (max 120 characters).';
        if (mb_strlen($note) > 500) $errors[] = 'Note is too long (max 500 characters).';
        if ($rating !== null && ($rating < 1 || $rating > 10)) $errors[] = 'Rating must be 1–10.';

        if (!$errors) {
            if ($id) {   // UPDATE (the user_id check stops editing someone else's row)
                $pdo->prepare('UPDATE diary SET title=?, kind=?, status=?, rating=?, note=? WHERE id=? AND user_id=?')
                    ->execute([$title, $kind, $status, $rating, $note, $id, $uid]);
            } else {     // CREATE
                $pdo->prepare('INSERT INTO diary (user_id, title, kind, status, rating, note) VALUES (?,?,?,?,?,?)')
                    ->execute([$uid, $title, $kind, $status, $rating, $note]);
            }
            header('Location: index.php'); exit;
        }
        $editing = ['id' => $id, 'title' => $title, 'kind' => $kind, 'status' => $status, 'rating' => $rating, 'note' => $note];
    }
}

// ---------- READ ----------
if (isset($_GET['edit']) && !$editing) {
    $stmt = $pdo->prepare('SELECT * FROM diary WHERE id = ? AND user_id = ?');
    $stmt->execute([(int) $_GET['edit'], $uid]);
    $editing = $stmt->fetch() ?: null;
}

$filter = in_array($_GET['status'] ?? '', ['want', 'watched'], true) ? $_GET['status'] : '';
$sql = 'SELECT * FROM diary WHERE user_id = ?' . ($filter ? ' AND status = ?' : '') . ' ORDER BY created_at DESC, id DESC';
$stmt = $pdo->prepare($sql);
$stmt->execute($filter ? [$uid, $filter] : [$uid]);
$rows = $stmt->fetchAll();

$f = $editing ?? ['id' => 0, 'title' => '', 'kind' => 'movie', 'status' => 'want', 'rating' => null, 'note' => ''];
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reel Diary</title>
<link rel="stylesheet" href="diary.css">
</head>
<body>
<header class="bar">
  <h1>Reel <em>Diary</em></h1>
  <span>Hi, <?= e($_SESSION['username']) ?> · <a href="logout.php">Log out</a></span>
</header>

<main class="wrap">
  <section class="card">
    <h2><?= $f['id'] ? 'Edit entry' : 'Add a title' ?></h2>
    <?php foreach ($errors as $err): ?><div class="error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= e(csrfToken()) ?>">
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" value="<?= (int) $f['id'] ?>">
      <label>Title <input name="title" value="<?= e($f['title']) ?>" required maxlength="120"></label>
      <div class="row">
        <label>Type
          <select name="kind">
            <option value="movie" <?= $f['kind'] === 'movie' ? 'selected' : '' ?>>Movie</option>
            <option value="tv" <?= $f['kind'] === 'tv' ? 'selected' : '' ?>>TV show</option>
          </select>
        </label>
        <label>Status
          <select name="status">
            <option value="want" <?= $f['status'] === 'want' ? 'selected' : '' ?>>Want to watch</option>
            <option value="watched" <?= $f['status'] === 'watched' ? 'selected' : '' ?>>Watched</option>
          </select>
        </label>
        <label>Rating (1–10)
          <input name="rating" type="number" min="1" max="10" value="<?= e((string) ($f['rating'] ?? '')) ?>">
        </label>
      </div>
      <label>Note <textarea name="note" rows="2" maxlength="500"><?= e($f['note']) ?></textarea></label>
      <div class="row">
        <button><?= $f['id'] ? 'Update' : 'Add to diary' ?></button>
        <?php if ($f['id']): ?><a class="btn-link" href="index.php">Cancel</a><?php endif; ?>
      </div>
    </form>
  </section>

  <section class="card">
    <h2>My diary (<?= count($rows) ?>)</h2>
    <nav class="filters">
      <a href="index.php" class="<?= $filter === '' ? 'on' : '' ?>">All</a>
      <a href="index.php?status=want" class="<?= $filter === 'want' ? 'on' : '' ?>">Want to watch</a>
      <a href="index.php?status=watched" class="<?= $filter === 'watched' ? 'on' : '' ?>">Watched</a>
    </nav>
    <?php if (!$rows): ?><p class="sub">Nothing here yet.</p><?php endif; ?>
    <ul class="list">
      <?php foreach ($rows as $r): ?>
      <li>
        <div>
          <strong><?= e($r['title']) ?></strong>
          <span class="tag"><?= $r['kind'] === 'tv' ? 'TV' : 'Movie' ?></span>
          <span class="tag <?= $r['status'] ?>"><?= $r['status'] === 'watched' ? 'Watched' : 'Want' ?></span>
          <?php if ($r['rating']): ?><span class="tag">★ <?= (int) $r['rating'] ?>/10</span><?php endif; ?>
          <?php if ($r['note'] !== ''): ?><p><?= nl2br(e($r['note'])) ?></p><?php endif; ?>
        </div>
        <div class="actions">
          <a href="index.php?edit=<?= (int) $r['id'] ?>">Edit</a>
          <form method="post" onsubmit="return confirm('Delete this entry?')">
            <input type="hidden" name="csrf" value="<?= e(csrfToken()) ?>">
            <input type="hidden" name="action" value="delete">
            <input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
            <button class="danger">Delete</button>
          </form>
        </div>
      </li>
      <?php endforeach; ?>
    </ul>
  </section>
</main>
</body>
</html>
