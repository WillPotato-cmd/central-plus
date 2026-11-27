-- =====================================================================
-- Central+ · ponte com o Avalia Potato
-- =====================================================================
-- Guarda, em cada loja do Central+, qual é a loja correspondente no
-- Avalia Potato. A Diretoria faz a ligação na aba "Lojas".
-- Pode rodar de novo sem problema.
-- =====================================================================

alter table public.lojas add column if not exists avalia_loja_id uuid;

-- Uma loja do Avalia só pode estar ligada a uma loja do Central+
create unique index if not exists lojas_avalia_loja_id_unico
  on public.lojas (avalia_loja_id)
  where avalia_loja_id is not null;
