CREATE TABLE IF NOT EXISTS users (
  id      TEXT PRIMARY KEY,  -- Google sub
  email   TEXT NOT NULL,
  name    TEXT,
  picture TEXT,
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
  strava_access_token  TEXT,
  strava_refresh_token TEXT,
  strava_expires_at    INTEGER,
  strava_athlete_name  TEXT,
  strava_athlete_pic   TEXT,
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
  fiber_g        REAL,
  cholesterol_mg REAL,
  sodium_mg      REAL,
  vitamin_c_mg   REAL,
  vitamin_d_mcg  REAL,
  calcium_mg     REAL,
  iron_mg        REAL,
  PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS food_logs_user_date ON food_logs(user_id, date);

CREATE TABLE IF NOT EXISTS training_state (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  today_log   TEXT,    -- JSON: DailyLog | null
  weekly_load TEXT,    -- JSON: WeeklyLoad
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id         TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg  REAL NOT NULL,
  date       TEXT NOT NULL,
  logged_at  TEXT NOT NULL,
  PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS weight_logs_user_date ON weight_logs(user_id, date);

CREATE TABLE IF NOT EXISTS supplements (
  id       TEXT NOT NULL,          -- UUID from client
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  dose     TEXT NOT NULL DEFAULT '',
  unit     TEXT NOT NULL DEFAULT '',
  timing   TEXT NOT NULL DEFAULT 'anytime',
  active   INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS supplement_logs (
  id             TEXT NOT NULL,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplement_id  TEXT NOT NULL,
  date           TEXT NOT NULL,
  taken          INTEGER NOT NULL DEFAULT 1,
  logged_at      TEXT NOT NULL,
  PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS supplement_logs_user_date ON supplement_logs(user_id, date);
