CREATE TABLE IF NOT EXISTS users (
  id      TEXT PRIMARY KEY,  -- Google sub
  email   TEXT NOT NULL,
  name    TEXT,
  picture TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name   TEXT,
  weight_kg      REAL,
  height_cm      REAL,
  age            INTEGER,
  gender         TEXT,
  activity_level TEXT DEFAULT 'moderate',
  daily_goal     INTEGER DEFAULT 2000,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS food_logs (
  id           TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_name    TEXT NOT NULL,
  calories     REAL NOT NULL,
  protein      REAL NOT NULL,
  carbs        REAL NOT NULL,
  fat          REAL NOT NULL,
  weight_grams REAL,
  meal_type    TEXT NOT NULL DEFAULT 'other',
  image_url    TEXT,
  ingredients  TEXT,  -- JSON array
  logged_at    TEXT NOT NULL,
  date         TEXT NOT NULL,
  deleted_at   TEXT,
  PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS food_logs_user_date ON food_logs(user_id, date);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Micronutrient columns (added after initial schema)
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS fiber_g        REAL;
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS cholesterol_mg REAL;
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS sodium_mg      REAL;
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS vitamin_c_mg   REAL;
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS vitamin_d_mcg  REAL;
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS calcium_mg     REAL;
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS iron_mg        REAL;

CREATE TABLE IF NOT EXISTS training_state (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  today_log   TEXT,    -- JSON: DailyLog | null
  weekly_load TEXT,    -- JSON: WeeklyLoad
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
