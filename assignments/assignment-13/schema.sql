-- Reel Watch Diary (PHP + MySQL).  Run once:  mysql -u root -p < schema.sql
CREATE DATABASE IF NOT EXISTS reel_diary CHARACTER SET utf8mb4;
USE reel_diary;

CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(20)  NOT NULL UNIQUE,
  pass_hash  VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS diary (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  title      VARCHAR(120) NOT NULL,
  kind       ENUM('movie','tv') NOT NULL DEFAULT 'movie',
  status     ENUM('want','watched') NOT NULL DEFAULT 'want',
  rating     TINYINT NULL,            -- 1..10, only when watched
  note       VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
