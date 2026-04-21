-- Crosshair F - Community Backend Setup
-- Run this in your Supabase SQL Editor (Project → SQL Editor → New query)

-- 1. Crosshairs table
CREATE TABLE IF NOT EXISTS crosshairs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  author      TEXT NOT NULL CHECK (char_length(author) BETWEEN 2 AND 20),
  game        TEXT DEFAULT 'any',
  tags        TEXT DEFAULT '',
  description TEXT DEFAULT '',
  preset      JSONB NOT NULL,
  verified    BOOLEAN DEFAULT FALSE,
  downloads   INTEGER DEFAULT 0,
  rating      NUMERIC DEFAULT 0,
  reports     INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  ip_hash     TEXT
);

CREATE INDEX IF NOT EXISTS idx_crosshairs_verified ON crosshairs(verified);
CREATE INDEX IF NOT EXISTS idx_crosshairs_game ON crosshairs(game);
CREATE INDEX IF NOT EXISTS idx_crosshairs_downloads ON crosshairs(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_crosshairs_created ON crosshairs(created_at DESC);

-- 2. Reports table for moderation
CREATE TABLE IF NOT EXISTS reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crosshair_id  UUID REFERENCES crosshairs(id) ON DELETE CASCADE,
  reason        TEXT,
  reported_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Auto-bump report count
CREATE OR REPLACE FUNCTION bump_report_count() RETURNS TRIGGER AS $$
BEGIN
  UPDATE crosshairs SET reports = reports + 1 WHERE id = NEW.crosshair_id;
  -- Auto-unverify if 5+ reports
  UPDATE crosshairs SET verified = FALSE
    WHERE id = NEW.crosshair_id AND reports >= 5;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_report ON reports;
CREATE TRIGGER trg_bump_report AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION bump_report_count();

-- 4. Row Level Security
ALTER TABLE crosshairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Anyone can read verified crosshairs
DROP POLICY IF EXISTS "Public read verified" ON crosshairs;
CREATE POLICY "Public read verified" ON crosshairs
  FOR SELECT USING (verified = TRUE);

-- Anyone can insert (anon key can post). Server cron job verifies after scan.
DROP POLICY IF EXISTS "Anyone can submit" ON crosshairs;
CREATE POLICY "Anyone can submit" ON crosshairs
  FOR INSERT WITH CHECK (
    char_length(name) BETWEEN 2 AND 40
    AND char_length(author) BETWEEN 2 AND 20
    AND verified = FALSE
  );

-- Allow incrementing downloads on verified items only
DROP POLICY IF EXISTS "Increment downloads" ON crosshairs;
CREATE POLICY "Increment downloads" ON crosshairs
  FOR UPDATE USING (verified = TRUE)
  WITH CHECK (verified = TRUE);

-- Anyone can submit reports
DROP POLICY IF EXISTS "Anyone can report" ON reports;
CREATE POLICY "Anyone can report" ON reports
  FOR INSERT WITH CHECK (char_length(reason) <= 200);

-- 5. Auto-verify cron (run from a Supabase Edge Function or external worker)
-- Crosshair presets are pure JSON shape data, so they have no virus risk.
-- This auto-verifies presets that pass schema validation and have no reports.
CREATE OR REPLACE FUNCTION auto_verify_safe_presets() RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE crosshairs
    SET verified = TRUE
    WHERE verified = FALSE
      AND reports = 0
      AND created_at < NOW() - INTERVAL '30 seconds'
      AND preset ? 'shape'
      AND (preset->>'shape') IN ('cross','dot','t','circle','hybrid','scope','sniper')
      AND NOT (preset ? 'customImage')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule this to run every minute via pg_cron (Supabase Database → Extensions → pg_cron)
-- SELECT cron.schedule('auto-verify-presets', '* * * * *', 'SELECT auto_verify_safe_presets();');
