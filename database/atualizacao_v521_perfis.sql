-- v5.2.1: dois perfis. Execute depois de atualizacao_v52_usuarios.sql.
-- Mantem o modelo antigo de RLS admin-only; docentes acessam SOMENTE a RPC de suas aulas.
create table if not exists public.acessos_docentes (
 usuario_id uuid primary key references auth.users(id) on delete cascade,
 professor_id uuid not null references public.professores(id),
 ativo boolean not null default true,
 criado_em timestamptz not null default now()
);
create index if not exists idx_acessos_docentes_prof on public.acessos_docentes(professor_id);
alter table public.acessos_docentes enable row level security;
-- Nenhuma politica SELECT publica. Consultas de perfil sao efetuadas somente pelas RPCs.
revoke all on public.acessos_docentes from anon, authenticated;

create or replace function public.meu_perfil_web()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := auth.uid(); v_prof record;
begin
 if v_id is null then return jsonb_build_object('perfil','nenhum'); end if;
 if public.eh_administrador() then return jsonb_build_object('perfil','administrador'); end if;
 select p.id,p.nome into v_prof from public.acessos_docentes d
 join public.professores p on p.id=d.professor_id
 where d.usuario_id=v_id and d.ativo and p.ativo;
 if found then return jsonb_build_object('perfil','acesso','professor_id',v_prof.id,'professor',v_prof.nome); end if;
 return jsonb_build_object('perfil','nenhum');
end; $$;

create or replace function public.listar_acessos_web()
returns table (usuario_id uuid,email text,perfil text,professor_id uuid,professor text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.eh_administrador() then raise exception 'Somente administradores'; end if;
 return query
 select u.id,u.email::text,
 case when a.usuario_id is not null then 'administrador' else 'acesso' end::text,
 d.professor_id,p.nome::text
 from auth.users u
 left join public.administradores a on a.usuario_id=u.id
 left join public.acessos_docentes d on d.usuario_id=u.id and d.ativo
 left join public.professores p on p.id=d.professor_id
 where a.usuario_id is not null or d.usuario_id is not null
 order by u.email;
end; $$;

create or replace function public.configurar_acesso_web(p_email text,p_perfil text,p_professor uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_total int;
begin
 if not public.eh_administrador() then raise exception 'Somente administradores'; end if;
 if p_perfil not in ('administrador','acesso') then raise exception 'Perfil invalido'; end if;
 select id into v_uid from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
 if v_uid is null then raise exception 'Conta ainda nao existe no Auth. Convide o usuario primeiro.'; end if;
 if p_perfil='acesso' then
   if p_professor is null or not exists(select 1 from public.professores where id=p_professor and ativo) then
     raise exception 'Selecione um professor ativo para o perfil Acesso'; end if;
   if v_uid=auth.uid() and exists(select 1 from public.administradores where usuario_id=v_uid) then
     raise exception 'Voce nao pode remover seu proprio acesso administrativo'; end if;
   lock table public.administradores in share row exclusive mode;
   if exists(select 1 from public.administradores where usuario_id=v_uid) then
     select count(*) into v_total from public.administradores;
     if v_total<=1 then raise exception 'Nao e permitido remover o ultimo administrador'; end if;
   end if;
   delete from public.administradores where usuario_id=v_uid;
   insert into public.acessos_docentes(usuario_id,professor_id,ativo)
     values(v_uid,p_professor,true)
     on conflict(usuario_id) do update set professor_id=excluded.professor_id,ativo=true;
 else
   delete from public.acessos_docentes where usuario_id=v_uid;
   insert into public.administradores(usuario_id) values(v_uid) on conflict do nothing;
 end if;
end; $$;

create or replace function public.revogar_acesso_web(p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
 if not public.eh_administrador() then raise exception 'Somente administradores'; end if;
 if p_usuario=auth.uid() then raise exception 'Voce nao pode remover seu proprio acesso'; end if;
 lock table public.administradores in share row exclusive mode;
 if exists(select 1 from public.administradores where usuario_id=p_usuario) then
   select count(*) into v_count from public.administradores;
   if v_count<=1 then raise exception 'Nao e permitido remover o ultimo administrador'; end if;
 end if;
 delete from public.acessos_docentes where usuario_id=p_usuario;
 delete from public.administradores where usuario_id=p_usuario;
end; $$;

-- Esta RPC tem escopo estrito: o usuario logado NUNCA informa o professor_id.
create or replace function public.minhas_aulas_web(p_periodo uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_prof uuid; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Login necessario'; end if;
 select professor_id into v_prof from public.acessos_docentes
 where usuario_id=auth.uid() and ativo;
 if v_prof is null or not exists(select 1 from public.professores where id=v_prof and ativo) then
   raise exception 'Conta sem professor vinculado'; end if;
 select coalesce(jsonb_agg(x.obj order by x.sort_date,x.sort_day,x.sort_slot), '[]'::jsonb)
 into v_result from (
   select jsonb_build_object('tipo','graduacao','curso',c.nome,'disciplina',cd.nome,
     'turma',t.identificacao,'dia_semana',b.dia_semana,'aula_inicio',b.aula_inicio,
     'quantidade_aulas',b.quantidade_aulas) obj,
     '0001-01-01'::date sort_date,b.dia_semana sort_day,b.aula_inicio sort_slot
   from public.blocos_grade b
   join public.alocacoes a on a.id=b.alocacao_id
   join public.turmas t on t.id=a.turma_id
   join public.matrizes_curriculares m on m.id=t.matriz_id
   join public.cursos c on c.id=m.curso_id
   join public.componentes_disciplina cd on cd.id=a.componente_id
   where t.periodo_id=p_periodo and
   (exists(select 1 from public.bloco_professores bp where bp.bloco_id=b.id and bp.professor_id=v_prof)
     or (a.professor_id=v_prof and not exists(select 1 from public.bloco_professores bp2 where bp2.bloco_id=b.id)))
   union all
   select jsonb_build_object('tipo','pos','curso',c.nome,'disciplina',cd.nome,
     'turma',t.identificacao,'data_aula',e.data_aula,'quantidade_aulas',e.quantidade_aulas) obj,
     e.data_aula sort_date,extract(isodow from e.data_aula)::int sort_day,0 sort_slot
   from public.encontros_pos e
   join public.alocacoes a on a.id=e.alocacao_id
   join public.turmas t on t.id=a.turma_id
   join public.matrizes_curriculares m on m.id=t.matriz_id
   join public.cursos c on c.id=m.curso_id
   join public.componentes_disciplina cd on cd.id=a.componente_id
   where t.periodo_id=p_periodo and a.professor_id=v_prof
 ) x;
 return v_result;
end; $$;

-- Periodos sem expor tabelas do restante do sistema.
create or replace function public.meus_periodos_web()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_prof uuid; v_result jsonb;
begin
 select professor_id into v_prof from public.acessos_docentes d
 join public.professores p on p.id=d.professor_id and p.ativo
 where d.usuario_id=auth.uid() and d.ativo;
 if v_prof is null then raise exception 'Conta nao vinculada a professor'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',pl.id,'nome',pl.ano::text||'/'||pl.semestre::text,'inicio',pl.data_inicio,'fim',pl.data_fim)
 order by pl.ano desc,pl.semestre desc),'[]'::jsonb) into v_result
 from public.periodos_letivos pl;
 return v_result;
end; $$;

revoke all on function public.meu_perfil_web() from public,anon;
revoke all on function public.listar_acessos_web() from public,anon;
revoke all on function public.configurar_acesso_web(text,text,uuid) from public,anon;
revoke all on function public.revogar_acesso_web(uuid) from public,anon;
revoke all on function public.minhas_aulas_web(uuid) from public,anon;
revoke all on function public.meus_periodos_web() from public,anon;
grant execute on function public.meu_perfil_web() to authenticated;
grant execute on function public.listar_acessos_web() to authenticated;
grant execute on function public.configurar_acesso_web(text,text,uuid) to authenticated;
grant execute on function public.revogar_acesso_web(uuid) to authenticated;
grant execute on function public.minhas_aulas_web(uuid) to authenticated;
grant execute on function public.meus_periodos_web() to authenticated;

-- ATENCAO: verificar politicas RLS antigas. Elas precisam continuar restritas a admin.
-- Nao conceder SELECT para professores nas tabelas de professor, NIF, blocos, alocacoes.
