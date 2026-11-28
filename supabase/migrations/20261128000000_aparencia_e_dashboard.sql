-- =====================================================================
-- Central+ · aparência (cores por grupo, modo escuro) e dados do dashboard
-- =====================================================================
-- Rode no SQL Editor do CENTRAL+. Pode rodar de novo. Ele:
--   1. adiciona o grupo (Potato ou Kanpek) em cada loja;
--   2. garante que um Líder só tenha lojas de um grupo;
--   3. guarda a aparência escolhida por cada pessoa (tema e modo);
--   4. registra a data em que cada solicitação foi concluída.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Grupo da loja
-- ---------------------------------------------------------------------

alter table public.lojas add column if not exists grupo text;

-- Preenche as lojas existentes pelo nome: "Kanpek..." = kanpek, o resto = potato
update public.lojas
   set grupo = case when nome ilike 'kanpek%' then 'kanpek' else 'potato' end
 where grupo is null;

alter table public.lojas alter column grupo set default 'potato';
alter table public.lojas alter column grupo set not null;

do $$ begin
  alter table public.lojas add constraint lojas_grupo_valido check (grupo in ('potato', 'kanpek'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Líder com lojas de um grupo só
-- ---------------------------------------------------------------------

create or replace function public.usuarios_conferir_grupo_lider()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_grupos int;
begin
  if new.tag = 'Líder' and coalesce(array_length(new.lojas_acesso, 1), 0) > 1 then
    select count(distinct grupo) into v_grupos
      from lojas where nome = any(new.lojas_acesso);
    if v_grupos > 1 then
      raise exception 'Um líder só pode ter lojas de um grupo (Potato ou Kanpek).'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_usuarios_conferir_grupo_lider on public.usuarios;
create trigger trg_usuarios_conferir_grupo_lider
  before insert or update of tag, lojas_acesso on public.usuarios
  for each row execute function public.usuarios_conferir_grupo_lider();

-- Trocar o grupo de uma loja também não pode deixar um líder com os dois grupos
create or replace function public.lojas_conferir_grupo_lider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.grupo is distinct from old.grupo and exists (
    select 1
      from usuarios u
     where u.tag = 'Líder'
       and new.nome = any(u.lojas_acesso)
       and exists (
         select 1 from lojas l
          where l.nome = any(u.lojas_acesso) and l.nome <> new.nome and l.grupo <> new.grupo
       )
  ) then
    raise exception 'Algum líder ficaria com lojas dos dois grupos. Ajuste as lojas dele antes.'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_lojas_conferir_grupo_lider on public.lojas;
create trigger trg_lojas_conferir_grupo_lider
  before update of grupo on public.lojas
  for each row execute function public.lojas_conferir_grupo_lider();

-- ---------------------------------------------------------------------
-- 3. Aparência de cada pessoa
-- ---------------------------------------------------------------------
-- tema: 'centralplus' | 'potato' | 'kanpek' | null (padrão)
--       Para Líder o tema é sempre o do grupo das lojas dele.
-- modo: 'auto' (segue o aparelho) | 'claro' | 'escuro'

alter table public.usuarios add column if not exists tema text;
alter table public.usuarios add column if not exists modo text not null default 'auto';

do $$ begin
  alter table public.usuarios add constraint usuarios_tema_valido
    check (tema is null or tema in ('centralplus', 'potato', 'kanpek'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.usuarios add constraint usuarios_modo_valido
    check (modo in ('auto', 'claro', 'escuro'));
exception when duplicate_object then null; end $$;

create or replace function public.atualizar_minha_aparencia(p_tema text, p_modo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_modo not in ('auto', 'claro', 'escuro') then
    raise exception 'Modo inválido.' using errcode = '22023';
  end if;
  if p_tema is not null and p_tema not in ('centralplus', 'potato', 'kanpek') then
    raise exception 'Tema inválido.' using errcode = '22023';
  end if;
  update usuarios
     set tema = case when tag = 'Líder' then tema else p_tema end, -- Líder não escolhe tema
         modo = p_modo
   where id = auth.uid() and coalesce(ativo, true);
end $$;

revoke execute on function public.atualizar_minha_aparencia(text, text) from public, anon;
grant execute on function public.atualizar_minha_aparencia(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Data de conclusão (para o tempo médio de resolução)
-- ---------------------------------------------------------------------
-- Só vale daqui para frente: as já concluídas ficam sem data.

alter table public.solicitacoes add column if not exists concluido_em timestamptz;

create or replace function public.solicitacoes_marcar_conclusao()
returns trigger language plpgsql as $$
begin
  if new.status = 'concluido' and (tg_op = 'INSERT' or old.status is distinct from 'concluido') then
    new.concluido_em := now();
  elsif new.status <> 'concluido' then
    new.concluido_em := null; -- reaberta
  end if;
  return new;
end $$;

drop trigger if exists trg_solicitacoes_marcar_conclusao on public.solicitacoes;
create trigger trg_solicitacoes_marcar_conclusao
  before insert or update of status on public.solicitacoes
  for each row execute function public.solicitacoes_marcar_conclusao();

commit;
