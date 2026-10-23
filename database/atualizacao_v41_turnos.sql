-- Execute uma única vez no Supabase SQL Editor, após a migração da v4.0.
BEGIN;
ALTER TABLE public.alocacoes ADD COLUMN IF NOT EXISTS pos_turno text;
ALTER TABLE public.alocacoes ADD COLUMN IF NOT EXISTS pos_metade smallint;
ALTER TABLE public.alocacoes DROP CONSTRAINT IF EXISTS alocacoes_pos_turno_valido;
ALTER TABLE public.alocacoes ADD CONSTRAINT alocacoes_pos_turno_valido CHECK (pos_turno IS NULL OR pos_turno IN ('noite','manha','tarde','integral'));
ALTER TABLE public.alocacoes DROP CONSTRAINT IF EXISTS alocacoes_pos_metade_valida;
ALTER TABLE public.alocacoes ADD CONSTRAINT alocacoes_pos_metade_valida CHECK (pos_metade IS NULL OR pos_metade IN (1,2));
COMMIT;
