-- Versão 5.2: gerenciamento seguro da lista de administradores.
-- EXECUTE no SQL Editor do Supabase com conta proprietária do projeto.
-- Pressupostos existentes: public.administradores(usuario_id uuid) e public.eh_administrador().
-- Não cria contas no Auth e não modifica políticas de dados de cursos/professores.

create or replace function public.listar_administradores_web()
returns table (usuario_id uuid, email text)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.eh_administrador() then
    raise exception 'Acesso administrativo necessário';
  end if;
  return query
    select a.usuario_id, u.email::text
    from public.administradores a
    left join auth.users u on u.id = a.usuario_id
    order by u.email nulls last, a.usuario_id;
end;
$$;

create or replace function public.conceder_administrador_web(p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_n integer;
begin
  if auth.uid() is null or not public.eh_administrador() then
    raise exception 'Acesso administrativo necessário';
  end if;
  if p_email is null or length(btrim(p_email)) < 3 or length(p_email) > 320 then
    raise exception 'Informe um e-mail válido';
  end if;
  select u.id into v_id from auth.users u
    where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_id is null then
    raise exception 'Usuário não encontrado no Supabase Authentication. Cadastre a conta primeiro.';
  end if;
  select count(*) into v_n from public.administradores a where a.usuario_id = v_id;
  if v_n > 0 then raise exception 'Este usuário já é administrador'; end if;
  insert into public.administradores (usuario_id) values (v_id);
end;
$$;

create or replace function public.revogar_administrador_web(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  if auth.uid() is null or not public.eh_administrador() then
    raise exception 'Acesso administrativo necessário';
  end if;
  if p_usuario_id is null then raise exception 'Usuário inválido'; end if;
  if p_usuario_id = auth.uid() then raise exception 'Você não pode revogar seu próprio acesso'; end if;
  -- Serializa alterações na tabela para reduzir condições de corrida.
  lock table public.administradores in share row exclusive mode;
  select count(*) into v_n from public.administradores;
  if v_n <= 1 then raise exception 'Não é permitido remover o último administrador'; end if;
  delete from public.administradores where usuario_id = p_usuario_id;
end;
$$;

revoke all on function public.listar_administradores_web() from public, anon;
revoke all on function public.conceder_administrador_web(text) from public, anon;
revoke all on function public.revogar_administrador_web(uuid) from public, anon;
grant execute on function public.listar_administradores_web() to authenticated;
grant execute on function public.conceder_administrador_web(text) to authenticated;
grant execute on function public.revogar_administrador_web(uuid) to authenticated;
