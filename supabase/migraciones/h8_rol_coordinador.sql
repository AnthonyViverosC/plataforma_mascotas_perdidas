-- =====================================================================
-- ChipPet · Sprint 2 · HU-07 — nuevo perfil "Coordinador de fundación"
-- Aplicar UNA SOLA VEZ y ANTES que h9. Es idempotente (if not exists).
--
--   npm run db:migrar -- supabase/migraciones/h8_rol_coordinador.sql
--
-- Va en su propio archivo a propósito: un valor nuevo de un enum no se puede
-- usar hasta que la transacción que lo crea termina. h9 ya lo usa.
-- =====================================================================

begin;

alter type public.rol_usuario add value if not exists 'COORDINADOR';

commit;
