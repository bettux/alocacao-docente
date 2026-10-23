-- VERSAO 5.0 - Gestão de turmas e ofertas
-- Execute UMA vez no Supabase > SQL Editor. Não apaga planejamentos.
-- Turmas já existem na tabela public.turmas.
create table if not exists public.ofertas_disciplinas (
 turma_id uuid not null references public.turmas(id) on delete cascade,
 matriz_disciplina_id uuid not null references public.matriz_disciplinas(id),
 primary key (turma_id, matriz_disciplina_id)
);
create index if not exists idx_ofertas_md on public.ofertas_disciplinas(matriz_disciplina_id);
alter table public.ofertas_disciplinas enable row level security;
drop policy if exists acesso_administrador on public.ofertas_disciplinas;
create policy acesso_administrador on public.ofertas_disciplinas
 for all to authenticated
 using (public.eh_administrador()) with check (public.eh_administrador());
grant select, insert, update, delete on public.ofertas_disciplinas to authenticated;

create or replace function public.validar_oferta_turma()
returns trigger language plpgsql set search_path = '' as $$
declare v_matriz uuid; v_sem integer; v_nivel text;
begin
 select t.matriz_id,t.semestre_curricular,c.nivel into v_matriz,v_sem,v_nivel
 from public.turmas t
 join public.matrizes_curriculares m on m.id=t.matriz_id
 join public.cursos c on c.id=m.curso_id where t.id=new.turma_id;
 if not exists(select 1 from public.matriz_disciplinas md
    where md.id=new.matriz_disciplina_id and md.matriz_id=v_matriz
    and (v_nivel='pos' or md.semestre=v_sem)) then
   raise exception 'Disciplina nao pertence a matriz/semestre da turma';
 end if;
 return new;
end $$;
drop trigger if exists trg_validar_oferta_turma on public.ofertas_disciplinas;
create trigger trg_validar_oferta_turma before insert or update on public.ofertas_disciplinas
for each row execute function public.validar_oferta_turma();

-- Não permite retirar da oferta uma disciplina que já foi alocada.
create or replace function public.proteger_oferta_alocada()
returns trigger language plpgsql set search_path = '' as $$
begin
 if exists(select 1 from public.alocacoes a
   where a.turma_id=old.turma_id and a.matriz_disciplina_id=old.matriz_disciplina_id) then
   raise exception 'Disciplina possui aulas alocadas; remova as aulas antes de retirar a oferta';
 end if;
 return old;
end $$;
drop trigger if exists trg_proteger_oferta_alocada on public.ofertas_disciplinas;
create trigger trg_proteger_oferta_alocada before delete on public.ofertas_disciplinas
for each row execute function public.proteger_oferta_alocada();
