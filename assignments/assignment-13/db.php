<?php
// Shared setup: MySQL connection (PDO), session, small helpers.
// Change the 4 settings below (or set the environment variables) to match your MySQL.
$host = getenv('DB_HOST') ?: '127.0.0.1';
$name = getenv('DB_NAME') ?: 'reel_diary';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$name;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    exit('Database connection failed. Did you run schema.sql and set DB_USER / DB_PASS?');
}

session_start();

// escape text before printing it into HTML (prevents XSS)
function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

// CSRF: every form carries a secret token that only our session knows
function csrfToken(): string {
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(16));
}
function checkCsrf(): void {
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
        http_response_code(400);
        exit('Invalid form token. Go back and try again.');
    }
}

function requireLogin(): int {
    if (empty($_SESSION['uid'])) { header('Location: login.php'); exit; }
    return (int) $_SESSION['uid'];
}
