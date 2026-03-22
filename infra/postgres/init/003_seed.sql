INSERT INTO config (config_key, config_value, description)
VALUES
  ('system_schedule_start', '"08:00:00"'::jsonb, 'Hora de inicio del sistema'),
  ('system_schedule_end', '"22:00:00"'::jsonb, 'Hora de fin del sistema'),
  ('default_reservation_minutes', '120'::jsonb, 'Duracion por defecto de la reserva'),
  ('cleaning_buffer_minutes', '15'::jsonb, 'Minutos de limpieza entre reservas'),
  ('extension_reference_amount', '900.00'::jsonb, 'Monto de referencia para extensiones'),
  ('special_reservation_daily_amount', '900.00'::jsonb, 'Monto por dia habil para reservas especiales')
ON CONFLICT (config_key) DO NOTHING;
