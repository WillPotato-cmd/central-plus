-- =====================================================================
-- AVALIA POTATO · avisar os líderes quando entra uma avaliação ruim
-- =====================================================================
-- Rode no SQL Editor do projeto do AVALIA (não do Central+).
-- Quando um feedback com nota 1 ou 2 é cadastrado, o Avalia chama a
-- Edge Function "notificar" do Central+, que avisa os líderes da loja.
-- Pode rodar de novo.
-- =====================================================================

begin;

create extension if not exists pg_net;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.config (
  chave text primary key,
  valor text not null
);

create or replace function privado.feedback_ruim_notificar()
returns trigger language plpgsql security definer set search_path = public, privado as $$
declare
  v_url     text;
  v_segredo text;
begin
  if new.nota > 2 or new.loja_id is null then
    return null;
  end if;

  select valor into v_url from privado.config where chave = 'notificar_url';
  select valor into v_segredo from privado.config where chave = 'notificar_segredo';
  if v_url is null or v_segredo is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'tipo', 'avaliacao_ruim',
      'avalia_loja_id', new.loja_id,
      'nota', new.nota,
      'texto', left(coalesce(new.texto, ''), 300),
      'cliente', new.cliente,
      'origem', new.origem,
      'data', new.data
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-central-segredo', v_segredo),
    timeout_milliseconds := 8000
  );
  return null;
exception when others then
  raise warning 'Avalia: não foi possível avisar o Central+: %', sqlerrm;
  return null;
end $$;

drop trigger if exists trg_feedback_ruim_notificar on public.feedbacks;
create trigger trg_feedback_ruim_notificar
  after insert on public.feedbacks
  for each row execute function privado.feedback_ruim_notificar();

commit;

-- =====================================================================
-- CONFIGURAÇÃO (rode uma vez). Use o MESMO segredo do Central+.
-- =====================================================================
--   insert into privado.config (chave, valor) values
--     ('notificar_url', 'https://wkxwiwnzpdvzdatrupdu.supabase.co/functions/v1/notificar'),
--     ('notificar_segredo', 'COLE-AQUI-O-SEGREDO')
--   on conflict (chave) do update set valor = excluded.valor;
-- =====================================================================
