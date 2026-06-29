-- Frank-KI Grundschema
-- Ausführen mit: docker exec -i PostgreSQL psql -U <POSTGRES_USER> -d <POSTGRES_DB> < setup/schema.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Benutzertabelle (identische Struktur zu FreiKI/KorKI)
CREATE TABLE IF NOT EXISTS korki_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'default',
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  funktion TEXT DEFAULT '',
  email TEXT DEFAULT '',
  use_areas TEXT[] DEFAULT '{}',
  manage_areas TEXT[] DEFAULT '{}',
  suspended BOOLEAN DEFAULT false,
  legacy_bio TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Hilfe-Wissensbereich (App-interne Dokumentation)
CREATE TABLE IF NOT EXISTS kb_hilfe (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "pageContent" text,
  metadata jsonb,
  embedding vector
);

-- Weitere Wissensbereiche nach Bedarf ergänzen:
-- CREATE TABLE IF NOT EXISTS kb_<bereich> (
--   id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
--   "pageContent" text,
--   metadata jsonb,
--   embedding vector
-- );
