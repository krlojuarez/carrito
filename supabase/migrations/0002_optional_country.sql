-- ============================================================================
-- Carrito 0002 — make members.country_code optional
-- Run this in the Supabase SQL Editor AFTER 0001_init.sql.
-- Enables adding estimation-only members (and auto-created ADO assignees)
-- whose country isn't known. Members without a country simply get no public
-- holidays applied (weekends + PTO still count). Idempotent.
-- ============================================================================
alter table public.members alter column country_code drop not null;
