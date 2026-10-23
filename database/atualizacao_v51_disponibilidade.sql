-- Versão 5.1: Disponibilidade docente por período letivo.
create table if not exists public.disponibilidades_docentes (
  periodo_id uuid not null references public.periodos_letivos(id) on delete cascade,
  professor_id uuid not null references public.professores(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  constraint horario_valido check (hora_inicio < hora_fim),
  primary key (periodo_id, professor_id, dia_semana)
);
create index if not exists idx_disp_prof_periodo on public.disponibilidades_docentes(professor_id,periodo_id);
alter table public.disponibilidades_docentes enable row level security;
drop policy if exists acesso_administrador on public.disponibilidades_docentes;
create policy acesso_administrador on public.disponibilidades_docentes for all to authenticated
using (public.eh_administrador()) with check (public.eh_administrador());
grant select,insert,update,delete on public.disponibilidades_docentes to authenticated;

-- Transação única: evita perder cadastro anterior se alguma validação falhar.
create or replace function public.salvar_disponibilidade_docente(
  p_periodo uuid,p_professor uuid,p_dias jsonb
) returns void language plpgsql security invoker set search_path = public,pg_temp as $$
declare item jsonb; dayno smallint; inicio time; fim time; dias_vistos smallint[] := array[]::smallint[];
begin
  if not public.eh_administrador() then raise exception 'Acesso não autorizado'; end if;
  if p_periodo is null or p_professor is null or p_dias is null or jsonb_typeof(p_dias)<>'array' then
    raise exception 'Dados inválidos'; end if;
  if not exists(select 1 from public.periodos_letivos where id=p_periodo) then raise exception 'Período inválido'; end if;
  if not exists(select 1 from public.professores where id=p_professor) then raise exception 'Professor inválido'; end if;
  for item in select * from jsonb_array_elements(p_dias) loop
    dayno:=(item->>'dia_semana')::smallint;
    inicio:=(item->>'hora_inicio')::time;
    fim:=(item->>'hora_fim')::time;
    if dayno is null or dayno not between 1 and 6 or inicio is null or fim is null or inicio>=fim or dayno=any(dias_vistos) then
      raise exception 'Dia ou horário inválido ou duplicado'; end if;
    dias_vistos:=array_append(dias_vistos,dayno);
  end loop;
  delete from public.disponibilidades_docentes where periodo_id=p_periodo and professor_id=p_professor;
  for item in select * from jsonb_array_elements(p_dias) loop
    insert into public.disponibilidades_docentes(periodo_id,professor_id,dia_semana,hora_inicio,hora_fim)
    values(p_periodo,p_professor,(item->>'dia_semana')::smallint,(item->>'hora_inicio')::time,(item->>'hora_fim')::time);
  end loop;
end $$;
revoke all on function public.salvar_disponibilidade_docente(uuid,uuid,jsonb) from public;
grant execute on function public.salvar_disponibilidade_docente(uuid,uuid,jsonb) to authenticated;
