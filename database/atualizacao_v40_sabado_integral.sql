-- V4.0: permite modulo integral no sabado (ate 8 aulas de 60 min).
-- Executar SOMENTE se desejar a opcao sabado integral.
BEGIN;
ALTER TABLE public.encontros_pos DROP CONSTRAINT IF EXISTS encontros_pos_qtd_v310;
ALTER TABLE public.encontros_pos ADD CONSTRAINT encontros_pos_qtd_v40 CHECK (quantidade_aulas BETWEEN 1 AND 8);
CREATE OR REPLACE FUNCTION public.validar_encontro_pos()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_prof uuid; v_periodo uuid; v_inicio date; v_fim date; v_tipo text;
 v_total integer; v_disciplinas integer;
BEGIN
 SELECT a.professor_id,t.periodo_id,p.data_inicio,p.data_fim,cd.modalidade
 INTO v_prof,v_periodo,v_inicio,v_fim,v_tipo
 FROM public.alocacoes a JOIN public.turmas t ON t.id=a.turma_id
 JOIN public.periodos_letivos p ON p.id=t.periodo_id
 JOIN public.componentes_disciplina cd ON cd.id=a.componente_id WHERE a.id=new.alocacao_id;
 IF v_tipo IS DISTINCT FROM 'pos' THEN RAISE EXCEPTION 'Componente nao e de pos'; END IF;
 IF new.data_aula NOT BETWEEN v_inicio AND v_fim THEN RAISE EXCEPTION 'Fora do periodo letivo'; END IF;
 IF EXISTS(SELECT 1 FROM public.dias_nao_letivos d WHERE d.periodo_id=v_periodo AND d.data_aula=new.data_aula)
 THEN RAISE EXCEPTION 'Dia nao letivo: %',new.data_aula; END IF;
 IF extract(isodow from new.data_aula)=7 THEN RAISE EXCEPTION 'Domingo nao permitido'; END IF;
 IF EXISTS(SELECT 1 FROM public.blocos_grade b JOIN public.alocacoes a ON a.id=b.alocacao_id
 JOIN public.turmas t ON t.id=a.turma_id
 WHERE t.periodo_id=v_periodo AND b.dia_semana=extract(isodow from new.data_aula)
 AND (a.professor_id=v_prof OR EXISTS(SELECT 1 FROM public.bloco_professores bp WHERE bp.bloco_id=b.id AND bp.professor_id=v_prof)))
 THEN RAISE EXCEPTION 'Conflito com grade regular em %',new.data_aula; END IF;
 SELECT coalesce(sum(e.quantidade_aulas),0),count(DISTINCT a.componente_id)
 INTO v_total,v_disciplinas FROM public.encontros_pos e
 JOIN public.alocacoes a ON a.id=e.alocacao_id JOIN public.turmas t ON t.id=a.turma_id
 WHERE t.periodo_id=v_periodo AND e.data_aula=new.data_aula AND a.professor_id=v_prof AND e.id IS DISTINCT FROM new.id;
 IF extract(isodow from new.data_aula)<>6 AND new.quantidade_aulas>4 THEN RAISE EXCEPTION 'Dia util admite no maximo 4 aulas'; END IF;
 IF extract(isodow from new.data_aula)=6 THEN
  IF v_total+new.quantidade_aulas>8 OR v_disciplinas>=2 THEN RAISE EXCEPTION 'Sabado permite ate 8 aulas e duas disciplinas de pos'; END IF;
 ELSE
  IF v_total>0 THEN RAISE EXCEPTION 'Outra disciplina de pos no mesmo dia'; END IF;
 END IF;
 RETURN new;
END $$;
CREATE OR REPLACE FUNCTION public.salvar_encontros_pos_web(
 p_periodo uuid,p_matriz uuid,p_componente uuid,p_professor uuid,p_encontros jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_turma uuid;v_aloc uuid;v_md uuid;v_qtd integer;v_data date;v_elem jsonb;
 v_inicio date;v_fim date;v_max integer;v_sem_inicio date;v_minutos integer;
 v_aulas numeric;v_extras numeric;v_equiv numeric;v_total numeric;
BEGIN
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
    AND NOT (a.componente_id=p_componente AND t.matriz_id=p_matriz AND a.observacao='POS_WEB_V1')
  ) THEN RAISE EXCEPTION 'Professor ja possui outra pos na data %',v_data; END IF;
  IF extract(isodow from v_data)=6 AND (
    (SELECT coalesce(sum(ep.quantidade_aulas),0) FROM public.encontros_pos ep
      JOIN public.alocacoes a ON a.id=ep.alocacao_id JOIN public.turmas t ON t.id=a.turma_id
      WHERE t.periodo_id=p_periodo AND a.professor_id=p_professor AND ep.data_aula=v_data
       AND NOT(a.componente_id=p_componente AND t.matriz_id=p_matriz AND a.observacao='POS_WEB_V1'))
       +(v_elem->>'quantidade')::integer > 8
    OR
    (SELECT count(DISTINCT a.componente_id) FROM public.encontros_pos ep
      JOIN public.alocacoes a ON a.id=ep.alocacao_id JOIN public.turmas t ON t.id=a.turma_id
      WHERE t.periodo_id=p_periodo AND a.professor_id=p_professor AND ep.data_aula=v_data
       AND NOT(a.componente_id=p_componente AND t.matriz_id=p_matriz AND a.observacao='POS_WEB_V1')) >= 2
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
   AND NOT(a.componente_id=p_componente AND a.observacao='POS_WEB_V1' AND t.matriz_id=p_matriz);
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
 WHERE turma_id=v_turma AND componente_id=p_componente AND professor_id=p_professor AND observacao='POS_WEB_V1';
 IF v_aloc IS NULL THEN
  INSERT INTO public.alocacoes(turma_id,matriz_disciplina_id,componente_id,professor_id,observacao)
  VALUES(v_turma,v_md,p_componente,p_professor,'POS_WEB_V1') RETURNING id INTO v_aloc;
 END IF;
 DELETE FROM public.encontros_pos WHERE alocacao_id=v_aloc;
 FOR v_elem IN SELECT value FROM jsonb_array_elements(p_encontros) LOOP
  INSERT INTO public.encontros_pos(alocacao_id,data_aula,quantidade_aulas)
  VALUES(v_aloc,(v_elem->>'data')::date,(v_elem->>'quantidade')::integer);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'encontros',jsonb_array_length(p_encontros),'aulas_60min',v_qtd);
END $$;
REVOKE ALL ON FUNCTION public.salvar_encontros_pos_web(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_encontros_pos_web(uuid,uuid,uuid,uuid,jsonb) TO authenticated;
COMMIT;
