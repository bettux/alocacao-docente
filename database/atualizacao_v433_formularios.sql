-- V4.3.3: oferece a MESMA unidade curricular em Semana e Sabado como duas ofertas distintas.
-- Execute apenas uma vez, no Supabase SQL Editor, ANTES de atualizar o HTML.
-- Preserva os encontros existentes; nao exclui professores, cursos nem disciplinas.
BEGIN;

-- Nao prosseguir se houver registros legados misturados (semana e sabado) na mesma oferta.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM public.alocacoes a JOIN public.encontros_pos e ON e.alocacao_id=a.id
  WHERE a.observacao='POS_WEB_V1'
  GROUP BY a.id HAVING count(DISTINCT (extract(isodow from e.data_aula)=6))>1
 ) THEN RAISE EXCEPTION 'Ha oferta antiga com encontros misturados em semana e sabado. Revise antes de migrar.'; END IF;
END $$;

UPDATE public.alocacoes a SET observacao=CASE
 WHEN EXISTS (SELECT 1 FROM public.encontros_pos e WHERE e.alocacao_id=a.id
     AND extract(isodow from e.data_aula)=6) THEN 'POS_WEB_SABADO'
 ELSE 'POS_WEB_SEMANA' END
WHERE a.observacao='POS_WEB_V1';

-- Funcao especifica para os dois formularios, evitando sobrescrever uma oferta com a outra.
CREATE OR REPLACE FUNCTION public.salvar_encontros_pos_web(
 p_periodo uuid,p_matriz uuid,p_componente uuid,p_professor uuid,p_encontros jsonb,p_modo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_turma uuid;v_aloc uuid;v_md uuid;v_qtd integer;v_data date;v_elem jsonb;
 v_inicio date;v_fim date;v_max integer;v_sem_inicio date;v_minutos integer;
 v_aulas numeric;v_extras numeric;v_equiv numeric;v_total numeric;
 v_tag text;
BEGIN
 IF p_modo NOT IN ('semana','sabado') OR p_modo IS NULL THEN RAISE EXCEPTION 'Formulario invalido (semana/sabado)'; END IF;
 v_tag:=CASE WHEN p_modo='sabado' THEN 'POS_WEB_SABADO' ELSE 'POS_WEB_SEMANA' END;
 IF NOT public.eh_administrador() THEN RAISE EXCEPTION 'Acesso administrativo necessario'; END IF;
 IF jsonb_typeof(p_encontros) <> 'array' OR jsonb_array_length(p_encontros)>30 THEN
  RAISE EXCEPTION 'Informe uma lista de encontros (ate 30 datas)'; END IF;
 SELECT data_inicio,data_fim INTO v_inicio,v_fim FROM public.periodos_letivos WHERE id=p_periodo;
 IF v_inicio IS NULL THEN RAISE EXCEPTION 'Periodo letivo inexistente'; END IF;
 PERFORM 1 FROM public.professores WHERE id=p_professor AND ativo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Professor inexistente ou inativo'; END IF;
 SELECT md.id,coalesce(cd.carga_aulas,0) INTO v_md,v_max
 FROM public.componentes_disciplina cd
 JOIN public.matriz_disciplinas md ON md.id=cd.matriz_disciplina_id
 JOIN public.matrizes_curriculares mc ON mc.id=md.matriz_id
 JOIN public.cursos c ON c.id=mc.curso_id
 WHERE cd.id=p_componente AND cd.modalidade='pos' AND cd.duracao_minutos=60
 AND mc.id=p_matriz AND c.nivel='pos';
 IF v_md IS NULL THEN RAISE EXCEPTION 'Disciplina de pos invalida para a matriz'; END IF;
 IF v_max<>30 THEN RAISE EXCEPTION 'Somente componentes de 30 horas sao tratados nesta tela'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_encontros) z WHERE
      NOT(z ? 'data') OR NOT(z ? 'quantidade')
      OR (z->>'quantidade') !~ '^[1-8]$'
      OR (z->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
  RAISE EXCEPTION 'Encontro invalido: data e quantidade (1 a 8) obrigatorias'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_encontros) z
 GROUP BY z->>'data' HAVING count(*)>1) THEN RAISE EXCEPTION 'Nao repita a mesma data na disciplina'; END IF;
 SELECT coalesce(sum((z->>'quantidade')::integer),0) INTO v_qtd FROM jsonb_array_elements(p_encontros) z;
 IF v_qtd>30 THEN RAISE EXCEPTION 'Carga da disciplina excede 30 horas'; END IF;
 FOR v_elem IN SELECT value FROM jsonb_array_elements(p_encontros) LOOP
  v_data := (v_elem->>'data')::date;
  IF v_data NOT BETWEEN v_inicio AND v_fim THEN RAISE EXCEPTION 'Encontro % fora do periodo letivo',v_data; END IF;
  IF ((p_modo='sabado' AND extract(isodow from v_data)<>6) OR (p_modo='semana' AND extract(isodow from v_data)=6)) THEN RAISE EXCEPTION 'Data incompativel com o formulario escolhido: %',v_data; END IF;
  IF extract(isodow from v_data)<>6 AND (v_elem->>'quantidade')::integer>4 THEN RAISE EXCEPTION 'Dia util admite no maximo 4 aulas de pos'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.blocos_grade b
    JOIN public.alocacoes a ON a.id=b.alocacao_id
    JOIN public.turmas t ON t.id=a.turma_id
    WHERE t.periodo_id=p_periodo AND b.dia_semana=extract(isodow from v_data)
      AND (a.professor_id=p_professor OR EXISTS
         (SELECT 1 FROM public.bloco_professores bp WHERE bp.bloco_id=b.id AND bp.professor_id=p_professor))
  ) THEN RAISE EXCEPTION 'Professor ja possui aula regular recorrente no dia %',v_data; END IF;
  IF EXISTS (SELECT 1 FROM public.dias_nao_letivos dn WHERE dn.periodo_id=p_periodo AND dn.data_aula=v_data)
  THEN RAISE EXCEPTION 'Data nao letiva: %',v_data; END IF;
  -- Domingo nao possui grade de pos.
  IF extract(isodow from v_data)=7 THEN RAISE EXCEPTION 'Domingo nao permitido'; END IF;
  -- Segunda a sexta: outra disciplina de pos no mesmo dia e proibida.
  -- Sabado: ate duas disciplinas e oito aulas por docente.
  IF extract(isodow from v_data)<>6 AND EXISTS(
   SELECT 1 FROM public.encontros_pos ep JOIN public.alocacoes a ON a.id=ep.alocacao_id
   JOIN public.turmas t ON t.id=a.turma_id
   WHERE t.periodo_id=p_periodo AND ep.data_aula=v_data AND a.professor_id=p_professor
    AND NOT (a.componente_id=p_componente AND t.matriz_id=p_matriz AND a.observacao=v_tag)
  ) THEN RAISE EXCEPTION 'Professor ja possui outra pos na data %',v_data; END IF;
  IF extract(isodow from v_data)=6 AND (
    (SELECT coalesce(sum(ep.quantidade_aulas),0) FROM public.encontros_pos ep
      JOIN public.alocacoes a ON a.id=ep.alocacao_id JOIN public.turmas t ON t.id=a.turma_id
      WHERE t.periodo_id=p_periodo AND a.professor_id=p_professor AND ep.data_aula=v_data
       AND NOT(a.componente_id=p_componente AND t.matriz_id=p_matriz AND a.observacao=v_tag))
       +(v_elem->>'quantidade')::integer > 8
    OR
    (SELECT count(DISTINCT a.componente_id) FROM public.encontros_pos ep
      JOIN public.alocacoes a ON a.id=ep.alocacao_id JOIN public.turmas t ON t.id=a.turma_id
      WHERE t.periodo_id=p_periodo AND a.professor_id=p_professor AND ep.data_aula=v_data
       AND NOT(a.componente_id=p_componente AND t.matriz_id=p_matriz AND a.observacao=v_tag)) >= 2
  ) THEN RAISE EXCEPTION 'Sabado excede limite de 8 aulas ou de 2 disciplinas para o professor: %',v_data; END IF;
 END LOOP;
 -- Calcula limite de 40 para cada semana atingida; minutos da pos sao somados ANTES da conversao.
 FOR v_sem_inicio IN SELECT DISTINCT (v_data2 - (extract(isodow from v_data2)::integer-1))::date
  FROM (SELECT (z->>'data')::date v_data2 FROM jsonb_array_elements(p_encontros) z) dd
 LOOP
  SELECT coalesce(sum(ep.quantidade_aulas)*60,0)::integer INTO v_minutos
  FROM public.encontros_pos ep JOIN public.alocacoes a ON a.id=ep.alocacao_id
  JOIN public.turmas t ON t.id=a.turma_id
  WHERE a.professor_id=p_professor AND t.periodo_id=p_periodo
   AND ep.data_aula>=v_sem_inicio AND ep.data_aula<v_sem_inicio+7
   AND NOT(a.componente_id=p_componente AND a.observacao=v_tag AND t.matriz_id=p_matriz);
  SELECT v_minutos + coalesce(sum((z->>'quantidade')::integer)*60,0) INTO v_minutos
  FROM jsonb_array_elements(p_encontros) z
  WHERE (z->>'data')::date>=v_sem_inicio AND (z->>'data')::date<v_sem_inicio+7;
  v_equiv:=ceil(v_minutos::numeric/50);
  v_aulas:=public.total_aulas_semanais_docente(p_professor,p_periodo);
  SELECT coalesce(sum(aulas_equivalentes),0) INTO v_extras FROM public.atividades_complementares
  WHERE periodo_id=p_periodo AND professor_id=p_professor AND frequencia='semanal';
  v_total:=ceil((v_aulas+v_equiv)*1.2)+v_extras;
  IF v_total>40 THEN RAISE EXCEPTION 'Carga semanal ultrapassa 40 na semana de %: total %',v_sem_inicio,v_total; END IF;
 END LOOP;
 -- Procura ou cria a turma, e substitui SOMENTE os encontros da disciplina/docente selecionados.
 SELECT id INTO v_turma FROM public.turmas
 WHERE periodo_id=p_periodo AND matriz_id=p_matriz AND semestre_curricular=1 AND identificacao='Pos - turma principal';
 IF v_turma IS NULL THEN
  INSERT INTO public.turmas(periodo_id,matriz_id,semestre_curricular,identificacao)
  VALUES(p_periodo,p_matriz,1,'Pos - turma principal') RETURNING id INTO v_turma;
 END IF;
 SELECT id INTO v_aloc FROM public.alocacoes
 WHERE turma_id=v_turma AND componente_id=p_componente AND professor_id=p_professor AND observacao=v_tag;
 IF v_aloc IS NULL THEN
  INSERT INTO public.alocacoes(turma_id,matriz_disciplina_id,componente_id,professor_id,observacao)
  VALUES(v_turma,v_md,p_componente,p_professor,v_tag) RETURNING id INTO v_aloc;
 END IF;
 DELETE FROM public.encontros_pos WHERE alocacao_id=v_aloc;
 FOR v_elem IN SELECT value FROM jsonb_array_elements(p_encontros) LOOP
  INSERT INTO public.encontros_pos(alocacao_id,data_aula,quantidade_aulas)
  VALUES(v_aloc,(v_elem->>'data')::date,(v_elem->>'quantidade')::integer);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'encontros',jsonb_array_length(p_encontros),'aulas_60min',v_qtd,'alocacao_id',v_aloc);
END $$;

REVOKE ALL ON FUNCTION public.salvar_encontros_pos_web(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_encontros_pos_web(uuid,uuid,uuid,uuid,jsonb,text) TO authenticated;
COMMIT;
