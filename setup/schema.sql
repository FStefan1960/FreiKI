-- FreiKI Grundschema: Benutzer-Tabelle + die zwei Demo-Wissensbereiche (StVO, SGB IX)
-- Ausführen mit: docker exec -i PostgreSQL psql -U <POSTGRES_USER> -d <POSTGRES_DB> < setup/schema.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- embedding-Dimension (1024) muss feststehen, sonst schlägt der HNSW-Index direkt beim
-- Anlegen fehl ("column does not have dimensions") - 1024 passt zum aktuell genutzten
-- BGE-M3-Embedding-Modell (siehe embedding/-Service).
CREATE TABLE IF NOT EXISTS kb_stvo (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "pageContent" text,
  metadata jsonb,
  embedding vector(1024)
);
CREATE INDEX IF NOT EXISTS kb_stvo_embedding_hnsw ON kb_stvo USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS kb_sgb9 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "pageContent" text,
  metadata jsonb,
  embedding vector(1024)
);
CREATE INDEX IF NOT EXISTS kb_sgb9_embedding_hnsw ON kb_sgb9 USING hnsw (embedding vector_cosine_ops);
