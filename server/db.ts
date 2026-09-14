import mysql from 'mysql2/promise'

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1'
const DB_PORT = Number(process.env.DB_PORT ?? 3306)
const DB_USER = process.env.DB_USER ?? 'root'
const DB_PASSWORD = process.env.DB_PASSWORD ?? ''
export const DB_DATABASE = process.env.DB_DATABASE ?? 'rehearsal'

export let pool: mysql.Pool | null = null

/** 스키마가 없으면 만들고, 테이블을 준비한다. 실패하면 null을 남기고 기능을 끈다. */
export async function initDb(): Promise<boolean> {
  try {
    const admin = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD })
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_DATABASE}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await admin.end()

    pool = mysql.createPool({
      host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_DATABASE,
      waitForConnections: true, connectionLimit: 5, timezone: 'Z', charset: 'utf8mb4',
    })

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_key    VARCHAR(64) PRIMARY KEY,
        nickname    VARCHAR(50) NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id            BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_key      VARCHAR(64) NOT NULL,
        domain        VARCHAR(30) NOT NULL DEFAULT 'interview',
        title         VARCHAR(200) NOT NULL,
        setup         JSON NOT NULL,
        scenario      JSON NOT NULL,
        turns         JSON NOT NULL,
        events        JSON NOT NULL,
        overall       JSON NOT NULL,
        duration_ms   INT NOT NULL,
        eye_contact   TINYINT UNSIGNED NOT NULL,
        score         TINYINT UNSIGNED NULL,
        report        JSON NULL,
        report_model  VARCHAR(60) NULL,
        report_status ENUM('pending','done','failed') NOT NULL DEFAULT 'done',
        client_id     VARCHAR(64) NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_created (user_key, created_at),
        UNIQUE KEY uq_client (client_id)
      )`)
    // 이미 만들어진 테이블에 컬럼이 없으면 추가 (MySQL은 ADD COLUMN IF NOT EXISTS 미지원)
    const [cols] = await pool.query<any[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'report_status'`,
      [DB_DATABASE],
    )
    if (cols.length === 0) {
      await pool.query(`ALTER TABLE sessions ADD COLUMN report_status ENUM('pending','done','failed') NOT NULL DEFAULT 'done' AFTER report_model`)
    }
    const [cols2] = await pool.query<any[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'client_id'`,
      [DB_DATABASE],
    )
    if (cols2.length === 0) {
      await pool.query(`ALTER TABLE sessions ADD COLUMN client_id VARCHAR(64) NULL AFTER report_status, ADD UNIQUE KEY uq_client (client_id)`)
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id            BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_key      VARCHAR(64) NOT NULL,
        scheduled_at  DATETIME NOT NULL,
        source_session_id BIGINT NULL,
        fulfilled_session_id BIGINT NULL,
        fulfilled_at  DATETIME NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_sched (user_key, scheduled_at)
      )`)
    return true
  } catch (e) {
    console.warn('[db] 사용 불가, 기록 기능 꺼짐:', (e as Error).message)
    pool = null
    return false
  }
}
