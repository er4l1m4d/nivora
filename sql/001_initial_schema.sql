CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE quiz_status AS ENUM (
    'DRAFT','PUBLISHED','OPEN','LIVE','ENDED','VALIDATING','FINALIZED','SETTLED',
    'CANCELLED','REFUNDING','REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE participant_status AS ENUM (
    'PENDING','JOINED','ACTIVE','COMPLETED','TIMED_OUT','FORFEITED','DISQUALIFIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_status AS ENUM ('DRAFT','ACTIVE','FLAGGED','INVALID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  status quiz_status NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL CHECK (currency IN ('NIM','USDT_POLYGON')),
  entry_amount NUMERIC(30,12) NOT NULL CHECK (entry_amount >= 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  min_participants INTEGER NOT NULL DEFAULT 3 CHECK (min_participants > 0),
  starts_at TIMESTAMPTZ,
  join_deadline TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  result_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_settings (
  quiz_id UUID PRIMARY KEY REFERENCES quizzes(id) ON DELETE CASCADE,
  max_participants INTEGER CHECK (max_participants IS NULL OR max_participants > 0),
  material_visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (material_visibility IN ('PRIVATE','PARTICIPANTS','PUBLIC')),
  reconnect_limit INTEGER NOT NULL DEFAULT 3 CHECK (reconnect_limit >= 0),
  reconnect_window_seconds INTEGER NOT NULL DEFAULT 60 CHECK (reconnect_window_seconds > 0),
  dispute_window_seconds INTEGER NOT NULL DEFAULT 300 CHECK (dispute_window_seconds >= 0),
  flag_window_seconds INTEGER NOT NULL DEFAULT 300 CHECK (flag_window_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','PARTICIPANTS','PUBLIC')),
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation TEXT,
  status question_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, position)
);

CREATE TABLE IF NOT EXISTS question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, version)
);

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  status participant_status NOT NULL DEFAULT 'JOINED',
  memo_code TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  disconnect_count INTEGER NOT NULL DEFAULT 0 CHECK (disconnect_count >= 0),
  last_seen_at TIMESTAMPTZ,
  correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  valid_questions INTEGER,
  score_percentage NUMERIC(8,5),
  rank INTEGER,
  UNIQUE (quiz_id, user_id),
  UNIQUE (quiz_id, memo_code)
);

CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id),
  question_version_id UUID REFERENCES question_versions(id),
  selected_option CHAR(1) NOT NULL CHECK (selected_option IN ('A','B','C','D')),
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_time_ms INTEGER CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  UNIQUE (participant_id, question_id)
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  connected_at TIMESTAMPTZ NOT NULL,
  disconnected_at TIMESTAMPTZ,
  reconnected_at TIMESTAMPTZ,
  disconnect_number INTEGER,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS question_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('ENTRY_COMMITMENT','CREATOR_COMMITMENT','REFUND','PAYOUT')),
  currency TEXT NOT NULL CHECK (currency IN ('NIM','USDT_POLYGON')),
  amount NUMERIC(30,12) NOT NULL CHECK (amount >= 0),
  wallet_address TEXT,
  blockchain_tx_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL UNIQUE REFERENCES quizzes(id) ON DELETE CASCADE,
  prize_pool NUMERIC(30,12) NOT NULL CHECK (prize_pool >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('NIM','USDT_POLYGON')),
  result_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_plan_id UUID NOT NULL REFERENCES payout_plans(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id),
  rank INTEGER NOT NULL CHECK (rank > 0),
  amount NUMERIC(30,12) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('NIM','USDT_POLYGON')),
  status TEXT NOT NULL DEFAULT 'PENDING',
  transaction_id UUID REFERENCES transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE (payout_plan_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_status_starts_at ON quizzes(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_participants_quiz ON participants(quiz_id);
CREATE INDEX IF NOT EXISTS idx_answers_participant ON answers(participant_id);
CREATE INDEX IF NOT EXISTS idx_events_quiz_time ON quiz_events(quiz_id, event_timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_quiz ON transactions(quiz_id);
