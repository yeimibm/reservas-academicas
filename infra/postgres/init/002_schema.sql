DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_type_enum') THEN
    CREATE TYPE user_type_enum AS ENUM ('STUDENT', 'TEACHER', 'DIRECTION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_enum') THEN
    CREATE TYPE user_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'space_status_enum') THEN
    CREATE TYPE space_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_type_enum') THEN
    CREATE TYPE reservation_type_enum AS ENUM ('NORMAL', 'SERIES_INSTANCE', 'SPECIAL_APPROVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status_enum') THEN
    CREATE TYPE reservation_status_enum AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'extension_status_enum') THEN
    CREATE TYPE extension_status_enum AS ENUM ('PENDING_REVIEW', 'PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'APPROVED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receipt_status_enum') THEN
    CREATE TYPE receipt_status_enum AS ENUM ('SUBIDO', 'PROCESADO_IA', 'POR_REVISAR', 'APROBADO', 'RECHAZADO', 'ERROR_PROCESAMIENTO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'series_frequency_enum') THEN
    CREATE TYPE series_frequency_enum AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'series_status_enum') THEN
    CREATE TYPE series_status_enum AS ENUM ('ACTIVE', 'CANCELLED', 'FINISHED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'series_instance_status_enum') THEN
    CREATE TYPE series_instance_status_enum AS ENUM ('CONFIRMED', 'CANCELLED', 'CONFLICTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_status_enum') THEN
    CREATE TYPE outbox_status_enum AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_type_enum') THEN
    CREATE TYPE block_type_enum AS ENUM ('CLEANING', 'MAINTENANCE', 'TEMPORARY_CLOSURE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_status_enum') THEN
    CREATE TYPE block_status_enum AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'special_request_status_enum') THEN
    CREATE TYPE special_request_status_enum AS ENUM ('PENDING_REVIEW', 'PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS faculties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  user_type user_type_enum NOT NULL,
  status user_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  student_code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  faculty_id UUID NULL REFERENCES faculties(id),
  teacher_code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  building VARCHAR(100) NOT NULL,
  floor VARCHAR(20) NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  status space_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  space_id UUID NOT NULL REFERENCES spaces(id),
  event_name VARCHAR(200) NOT NULL,
  event_description TEXT,
  reservation_type reservation_type_enum NOT NULL DEFAULT 'NORMAL',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  cleaning_buffer_minutes INTEGER NOT NULL DEFAULT 15 CHECK (cleaning_buffer_minutes >= 0),
  effective_end_at TIMESTAMPTZ NOT NULL,
  status reservation_status_enum NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ NULL,
  editable_after_at TIMESTAMPTZ NOT NULL,
  CHECK (end_at > start_at),
  CHECK (effective_end_at >= end_at)
);

CREATE TABLE IF NOT EXISTS reservation_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id),
  requested_by_user_id UUID NOT NULL REFERENCES users(id),
  current_end_at TIMESTAMPTZ NOT NULL,
  requested_new_end_at TIMESTAMPTZ NOT NULL,
  extra_minutes INTEGER NOT NULL CHECK (extra_minutes > 0),
  amount_to_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
  status extension_status_enum NOT NULL DEFAULT 'PENDING_REVIEW',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NULL,
  comments TEXT NULL,
  CHECK (requested_new_end_at > current_end_at)
);

CREATE TABLE IF NOT EXISTS special_reservation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  space_id UUID NOT NULL REFERENCES spaces(id),
  event_name VARCHAR(200) NOT NULL,
  event_description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  amount_to_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
  status special_request_status_enum NOT NULL DEFAULT 'PENDING_REVIEW',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NULL,
  comments TEXT NULL,
  CHECK (end_date >= start_date),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS special_reservation_request_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES special_reservation_requests(id) ON DELETE CASCADE,
  specific_date DATE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  effective_end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, specific_date)
);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NULL REFERENCES reservation_extensions(id),
  special_request_id UUID NULL REFERENCES special_reservation_requests(id),
  reservation_id UUID NULL REFERENCES reservations(id),
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  file_url TEXT NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  converted_image_url TEXT NULL,
  ai_extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_confidence NUMERIC(5,2) NULL,
  processing_status receipt_status_enum NOT NULL DEFAULT 'SUBIDO',
  payer_name VARCHAR(200) NULL,
  receiver_name VARCHAR(200) NULL,
  bank_name VARCHAR(150) NULL,
  payment_date DATE NULL,
  amount NUMERIC(10,2) NULL,
  reviewed_by UUID NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NULL,
  locked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (extension_id IS NOT NULL)::int +
    (special_request_id IS NOT NULL)::int <= 1
  )
);

CREATE TABLE IF NOT EXISTS reservation_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  base_space_id UUID NOT NULL REFERENCES spaces(id),
  event_name VARCHAR(200) NOT NULL,
  event_description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  frequency series_frequency_enum NOT NULL,
  day_of_week SMALLINT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  status series_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS reservation_series_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES reservation_series(id) ON DELETE CASCADE,
  reservation_id UUID NULL REFERENCES reservations(id),
  specific_date DATE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  space_id UUID NOT NULL REFERENCES spaces(id),
  is_exception BOOLEAN NOT NULL DEFAULT false,
  status series_instance_status_enum NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, specific_date)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NULL REFERENCES users(id),
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  old_data_json JSONB NULL,
  new_data_json JSONB NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS technical_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level VARCHAR(20) NOT NULL,
  source VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(150) NOT NULL,
  payload_json JSONB NOT NULL,
  status outbox_status_enum NOT NULL DEFAULT 'PENDING',
  idempotency_key VARCHAR(200) NOT NULL UNIQUE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  description TEXT NULL,
  updated_by UUID NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operational_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id),
  block_type block_type_enum NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status block_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_from_reservation_id UUID NULL REFERENCES reservations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_space_id ON reservations(space_id);
CREATE INDEX IF NOT EXISTS idx_reservations_start_at ON reservations(start_at);
CREATE INDEX IF NOT EXISTS idx_reservations_effective_end_at ON reservations(effective_end_at);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_outbox_status_created_at ON outbox_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_operational_blocks_space_id ON operational_blocks(space_id);
CREATE INDEX IF NOT EXISTS idx_operational_blocks_status ON operational_blocks(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_technical_logs_level_created_at ON technical_logs(level, created_at);

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    space_id WITH =,
    tstzrange(start_at, effective_end_at, '[)') WITH &&
  )
  WHERE (status = 'CONFIRMED');

ALTER TABLE operational_blocks
  ADD CONSTRAINT operational_blocks_no_overlap
  EXCLUDE USING gist (
    space_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status = 'ACTIVE');
