CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file   TEXT NOT NULL,
  placemark_idx INT  NOT NULL DEFAULT 0,
  name          TEXT,
  area_m2       NUMERIC,
  description   TEXT,
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  alt           DOUBLE PRECISION,
  -- AI-extracted fields (stage 2)
  property_type TEXT,
  status        TEXT,
  location      TEXT,
  price         NUMERIC,
  price_note    TEXT,
  owner_name    TEXT,
  seller        TEXT,
  owner_phone   TEXT,
  notes         TEXT,
  ai_raw        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_file, placemark_idx)
);

CREATE INDEX IF NOT EXISTS idx_properties_name ON properties (name);
CREATE INDEX IF NOT EXISTS idx_properties_latlon ON properties (lat, lon);

-- Generic record store (Database OUTPUT adapter, v0.6): any workflow can write
-- canonical records here without a workflow-specific table.
CREATE TABLE IF NOT EXISTS records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type TEXT NOT NULL,
  source_file   TEXT NOT NULL,
  source_row    INT  NOT NULL DEFAULT 0,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_type, source_file, source_row)
);

CREATE INDEX IF NOT EXISTS idx_records_workflow ON records (workflow_type);
