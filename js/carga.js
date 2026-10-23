// ---------------- RELATORIO DE CARGA DOCENTE (v3.5) ----------------
// Uma aula compartilhada T1/T2 corresponde a um UNICO bloco_grade.
// Cada professor vinculado a esse bloco recebe sua quantidade de aulas uma vez.
// Pos e atividades complementares mantidas separadas por frequencia.
let cRows=[],cDetails=new Map(),cCurrentPeriod=null;
function initCargaSelectors(){
 const sel=$('c-periodo'),previous=sel.value;
 sel.replaceChildren(...gPeriods.map(p=>new Option(`${p.ano}/${p.semestre}`,p.id)));
 if(gPeriods.some(p=>p.id===previous))sel.value=previous;
 else if($('g-periodo').value&&gPeriods.some(p=>p.id===$('g-periodo').value))sel.value=$('g-periodo').value;
}
function cNum(n){return Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:2});}
function cState(text){$('c-state').textContent=text;}
async function cAll(table,columns,filter=null){
 // Busca em paginas para nao truncar silenciosamente relatorios maiores.
 const values=[];let from=0;const page=500;
 while(true){let q=db.from(table).select(columns).range(from,from+page-1);
 if(filter)q=filter(q);
 const {data,error}=await q;if(error)throw error;
 values.push(...(data||[]));if(!data||data.length<page)break;
 from+=page;if(from>100000)throw new Error('Relatório muito grande. Filtre o período.');
 }return values;
}
async function loadCarga(){
 const pid=$('c-periodo').value;if(!pid)return;
 cState('Consultando...');$('c-reload').disabled=true;
 try{
  const [turmas,extras]=await Promise.all([
   cAll('turmas','id,matriz_id,semestre_curricular,matrizes_curriculares(nome,cursos(nome,nivel))',q=>q.eq('periodo_id',pid)),
   cAll('atividades_complementares','id,professor_id,descricao,aulas_equivalentes,observacao,frequencia',q=>q.eq('periodo_id',pid))
  ]);
  const turmaById=new Map(turmas.map(t=>[t.id,t]));
  let alloc=[]; for(const t of turmas){
   alloc.push(...await cAll('alocacoes','id,turma_id,componente_id,professor_id,componentes_disciplina(nome,modalidade),blocos_grade(id,dia_semana,aula_inicio,quantidade_aulas,bloco_professores(professor_id),bloco_subturmas(subturma_id,subturmas(nome))),encontros_pos(id,data_aula,quantidade_aulas)',q=>q.eq('turma_id',t.id)));
  }
  const sums=new Map(teachers.map(t=>[t.id,{teacher:t,weekly:0,pos:0,extra:0,extraPeriodo:0,lessons:[],posLessons:[],activities:[]} ]));
  for(const a of alloc){
   const turma=turmaById.get(a.turma_id);const course=turma?.matrizes_curriculares?.cursos?.nome||'Curso não identificado';
   const nome=a.componentes_disciplina?.nome||'Disciplina';
   const modalidade=a.componentes_disciplina?.modalidade||'';
   for(const b of (a.blocos_grade||[])){
    const ids=[...new Set((b.bloco_professores||[]).map(p=>p.professor_id))];
    if(!ids.length&&a.professor_id)ids.push(a.professor_id); // compatibilidade com registros legados
    const subs=(b.bloco_subturmas||[]).map(x=>x.subturmas?.nome).filter(Boolean).join(' + ')||'Sem subturma';
    for(const profId of ids){const record=sums.get(profId);if(!record)continue;
     const qtd=Number(b.quantidade_aulas||0);record.weekly+=qtd;
     record.lessons.push({nome,course,modalidade,subs,dia:days[b.dia_semana]||String(b.dia_semana),inicio:b.aula_inicio,quantidade:qtd});
    }
   }
   for(const ep of(a.encontros_pos||[])){
    const rec=sums.get(a.professor_id);if(!rec)continue;
    const qtd=Number(ep.quantidade_aulas||0);rec.pos+=qtd;
    rec.posLessons.push({nome,course,date:ep.data_aula,quantidade:qtd});
   }
  }
  for(const a of extras){const rec=sums.get(a.professor_id);if(!rec)continue;if(a.frequencia==='semanal')rec.extra+=Number(a.aulas_equivalentes||0);else rec.extraPeriodo+=Number(a.aulas_equivalentes||0);rec.activities.push(a);}
  cRows=[...sums.values()].sort((a,b)=>a.teacher.nome.localeCompare(b.teacher.nome,'pt-BR'));
  cDetails=new Map(cRows.map(r=>[r.teacher.id,r]));cCurrentPeriod=pid;
  renderCarga();cState('Relatório atualizado');
 }catch(e){cState('Erro na consulta');fail(e);$('c-rows').replaceChildren(makeCargaError(e.message));}
 finally{$('c-reload').disabled=false;}
}
function makeCargaError(t){const tr=makeNode('tr');const td=makeNode('td',t||'Erro ao carregar','pending');td.colSpan=9;tr.append(td);return tr;}
function cCell(tr,text,klass=''){const td=makeNode('td',String(text),klass);tr.append(td);return td;}
function cModo(){return $('c-modo').value;}
// Cada semana tem seu proprio total de encontros da pos. NUNCA transformar
// a carga de TODO o semestre numa carga semanal.
function cSemanaChave(dataISO){
 const d=new Date(String(dataISO).slice(0,10)+'T12:00:00');
 if(Number.isNaN(d.getTime()))return null;
 const delta=(d.getDay()+6)%7;d.setDate(d.getDate()-delta);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function cMapaSemanasPos(r){
 const semanas=new Map();
 for(const e of r.posLessons){
  const chave=cSemanaChave(e.date);if(!chave)continue;
  semanas.set(chave,(semanas.get(chave)||0)+Number(e.quantidade||0));
 }
 return semanas;
}
function cPicoSemanalPos(r){
 const semanas=cMapaSemanasPos(r);
 let aulas=0,chave='';
 for(const [sem,qtd] of semanas)if(qtd>aulas){aulas=qtd;chave=sem;}
 return {aulas,equiv:Math.ceil(aulas*60/50),chave,semanas:semanas.size};
}
function cPeriodoPos(r){
 const aulas=r.posLessons.reduce((sum,x)=>sum+Number(x.quantidade||0),0);
 return {aulas,semanas:cMapaSemanasPos(r).size};
}
function cSemanaPos(r){
 const aulas=r.posLessons.filter(x=>naSemanaCarga(x.date)).reduce((sum,x)=>sum+Number(x.quantidade||0),0);
 return {aulas,equiv:Math.ceil(aulas*60/50)};
}
function cAtualizaModo(){
 const semanal=cModo()==='semana';
 $('c-semana-field').classList.toggle('hidden',!semanal);
 $('c-mode-help').textContent=semanal
 ? 'Semana específica: Aulas pós mostra somente as aulas de 50 minutos equivalentes naquela semana, sem preparação. Os 20% aparecem separadamente e entram no total semanal.'
 : 'Semestre completo: Aulas pós mostra a maior carga semanal equivalente de pós no semestre, sem os 20%. Veja a distribuição por semana em Ver detalhes.';
 if(cRows.length)renderCarga();
}
function renderCarga(){
 const semanal=cModo()==='semana';
 // Coluna única para a pós: carga já convertida para aulas de 50 minutos,
 // SEM acrescentar os 20% de preparação nesta coluna.
 const header=['Professor','Graduação/semana','Aulas pós','Preparação (20%)','Ativ. semanais','Total semanal','Detalhes'];
 const head=$('c-head');head.replaceChildren();const trh=makeNode('tr');header.forEach(h=>trh.append(makeNode('th',h)));head.append(trh);
 const query=$('c-search').value.trim().toLocaleLowerCase('pt-BR');
 const visible=cRows.filter(r=>r.teacher.nome.toLocaleLowerCase('pt-BR').includes(query));
 const tbody=$('c-rows');tbody.replaceChildren();
 let nActive=0,week=0,posCount=0;
 for(const r of visible){
  const sem=cPeriodoPos(r),wk=cSemanaPos(r),pico=cPicoSemanalPos(r);
  if(r.weekly||sem.aulas||r.extra||r.extraPeriodo)nActive++;
  week+=r.weekly;posCount+=sem.aulas;
  const tr=makeNode('tr');const td=cCell(tr,'');const dot=makeNode('span','●','c-dot');dot.style.color=r.teacher.cor_hex;
  td.append(dot,document.createTextNode(r.teacher.nome));
  const aulasPos=semanal?wk.equiv:pico.equiv;
  const base=r.weekly+aulasPos;
  const prep=base*.2;
  const total=Math.ceil(base*1.2)+r.extra;
  cCell(tr,cNum(r.weekly));
  cCell(tr,cNum(aulasPos),'c-emphasis');
  cCell(tr,cNum(prep));
  cCell(tr,cNum(r.extra));
  const totalTd=cCell(tr,cNum(total)+(total>40?' — Acima de 40':total===40?' — Limite':''),'c-emphasis');
  if(total>40)totalTd.classList.add('c-limit-over');else if(total===40)totalTd.classList.add('c-limit-full');
  const act=makeNode('td'),btn=makeNode('button','Ver detalhes','btn');btn.type='button';btn.onclick=()=>showCargaDetail(r.teacher.id);act.append(btn);tr.append(act);tbody.append(tr);
 }
 if(!visible.length){const tr=makeNode('tr'),td=makeNode('td','Nenhum professor encontrado.','muted');td.colSpan=header.length;tr.append(td);tbody.append(tr);}
 const summary=$('c-summary');summary.replaceChildren();
 for(const [label,value] of [['Professores exibidos',visible.length],['Com alocação/atividade',nActive],['Aulas regulares semanais',cNum(week)],['Encontros de pós no semestre (60 min, total)',cNum(posCount)]]){
  const card=makeNode('div',undefined,'card c-stat');card.append(makeNode('span',label,'muted'),makeNode('strong',String(value)));summary.append(card);
 }
 $('c-details').classList.add('hidden');
}
function cDetailTable(headers,rows){
 const wrap=makeNode('div',undefined,'grid-overflow');const table=makeNode('table',undefined,'c-table');const th=makeNode('tr');
 headers.forEach(h=>th.append(makeNode('th',h)));const thead=makeNode('thead');thead.append(th);table.append(thead);
 const tbody=makeNode('tbody');for(const row of rows){const tr=makeNode('tr');row.forEach(v=>cCell(tr,v));tbody.append(tr);}table.append(tbody);wrap.append(table);return wrap;
}
function showCargaDetail(id){
 const r=cDetails.get(id);if(!r)return;
 const sem=cPeriodoPos(r),wk=cSemanaPos(r),pico=cPicoSemanalPos(r),semanal=cModo()==='semana';
 $('c-detail-title').textContent=r.teacher.nome;
 $('c-detail-subtitle').textContent=semanal
 ? `${r.weekly} aulas de graduação + ${wk.aulas} aulas de pós (60 min) na semana: ${Math.ceil((r.weekly+wk.equiv)*1.2)+r.extra} equivalentes, incluindo preparação e atividades semanais.`
 : `${r.weekly} aulas regulares por semana • Pós: ${sem.aulas} aulas de 60 min distribuídas em ${sem.semanas} semanas; maior semana: ${pico.aulas} aulas de pós = ${pico.equiv} equivalentes de 50 min. Total na semana de pico (com 20% e atividades): ${Math.ceil((r.weekly+pico.equiv)*1.2)+r.extra}.`; 
 const body=$('c-detail-body');body.replaceChildren();
 body.append(makeNode('h3','Graduação — distribuição semanal'));
 body.append(r.lessons.length?cDetailTable(['Curso','Matéria','Dia','Início','Turmas participantes','Aulas'],r.lessons.sort((a,b)=>a.dia.localeCompare(b.dia)||a.inicio-b.inicio).map(x=>[x.course,x.nome,x.dia,x.inicio+'ª',x.subs,cNum(x.quantidade)])):makeNode('p','Nenhuma aula semanal atribuída.','muted'));
 const encontros=semanal?r.posLessons.filter(x=>naSemanaCarga(x.date)):r.posLessons;
 if(!semanal){
  body.append(makeNode('h3','Pós-graduação — distribuição por semana'));
  const todas=[...cMapaSemanasPos(r).entries()].sort(([a],[b])=>a.localeCompare(b));
  body.append(todas.length?cDetailTable(['Semana iniciada em','Aulas de 60 min','Aulas equivalentes de 50 min','Carga total semanal com preparação e atividades'],todas.map(([dia,qtd])=>[formataDataPos(dia),cNum(qtd),cNum(Math.ceil(qtd*60/50)),cNum(Math.ceil((r.weekly+Math.ceil(qtd*60/50))*1.2)+r.extra)])):makeNode('p','Nenhum encontro de pós no semestre.','muted'));
 }
 body.append(makeNode('h3',semanal?'Pós-graduação — encontros na semana':'Pós-graduação — todos os encontros do semestre'));
 body.append(encontros.length?cDetailTable(['Curso','Matéria','Data','Aulas de 60 min'],encontros.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(x=>[x.course,x.nome,formataDataPos(x.date),cNum(x.quantidade)])):makeNode('p','Nenhum encontro de pós-graduação neste intervalo.','muted'));
 body.append(makeNode('h3','Atividades complementares — sem preparação'));
 body.append(r.activities.length?cDetailTable(['Atividade','Aulas-equivalentes','Frequência','Observação'],r.activities.map(a=>[a.descricao,cNum(a.aulas_equivalentes),a.frequencia==='semanal'?'Semanal':'Total do semestre',a.observacao||'—'])):makeNode('p','Nenhuma atividade complementar cadastrada.','muted'));
 $('c-details').classList.remove('hidden');$('c-details').scrollIntoView({behavior:'smooth',block:'start'});
}
$('c-modo').onchange=cAtualizaModo;
$('c-semana').onchange=()=>{if(cRows.length&&cModo()==='semana')renderCarga();};
$('c-reload').onclick=loadCarga;
$('c-periodo').onchange=loadCarga;
$('c-search').oninput=()=>{if(cCurrentPeriod=== $('c-periodo').value)renderCarga();};
$('c-close').onclick=()=>$('c-details').classList.add('hidden');


// --------- ATIVIDADES COMPLEMENTARES (v3.6) ---------
