(()=>{'use strict';
const $=id=>document.getElementById(id),DAYS=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const WEEKDAY=['','18:25–19:15','19:15–20:05','20:20–21:10','21:10–22:00','22:00–22:50'];
const SATURDAY=['','09:00–09:50','09:50–10:40','10:55–11:45','13:00–13:50','13:50–14:40','14:40–15:30','15:45–16:35','16:35–17:25'];
let db,periods=[],teachers=[],turmas=[],allocations=[],extras=[],loadedPeriod='',ready=false;
const num=x=>Number(x||0),pt=x=>num(x).toLocaleString('pt-BR',{maximumFractionDigits:2});
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const dateOf=s=>new Date(String(s).slice(0,10)+'T12:00:00');
const monday=s=>{const d=dateOf(s);if(!Number.isFinite(d.getTime()))throw Error('Data de consulta inválida');d.setDate(d.getDate()-(d.getDay()+6)%7);return d;};
const fmt=s=>String(s||'').slice(0,10).split('-').reverse().join('/');
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cls)x.className=cls;return x;};
function status(msg,cls=''){$('ex-status').textContent=msg;$('ex-status').className='notice '+cls;}
async function all(table,columns,filter){let out=[];for(let offset=0;offset<=100000;offset+=500){let q=db.from(table).select(columns).range(offset,offset+499);if(filter)q=filter(q);const r=await q;if(r.error)throw r.error;out.push(...r.data||[]);if((r.data||[]).length<500)return out;}throw Error('Quantidade de registros acima do limite da consulta');}
function syncTypes(){const isTeacher=$('ex-type').value==='professor';$('ex-prof-field').classList.toggle('hidden',!isTeacher);$('ex-turma-field').classList.toggle('hidden',isTeacher);$('ex-print').classList.add('hidden');$('ex-pdf').disabled=true;}
function updateTurmas(){const items=turmas.slice().sort((a,b)=>labelTurma(a).localeCompare(labelTurma(b),'pt-BR'));$('ex-turma').replaceChildren(new Option('Selecione a turma',''),...items.map(t=>new Option(labelTurma(t),t.id)));}
function labelTurma(t){const c=t.matrizes_curriculares?.cursos?.nome||'Curso';return `${c} — ${t.semestre_curricular||'?'}º sem. — ${t.identificacao||'Turma principal'}`;}
async function selectPeriod(){const pid=$('ex-period').value;if(!pid)return;ready=false;$('ex-print').classList.add('hidden');$('ex-pdf').disabled=true;status('Carregando turmas e aulas…');try{
 turmas=await all('turmas','id,identificacao,semestre_curricular,matriz_id,matrizes_curriculares(nome,cursos(nome,nivel))',q=>q.eq('periodo_id',pid));
 extras=await all('atividades_complementares','professor_id,aulas_equivalentes,frequencia',q=>q.eq('periodo_id',pid));
 allocations=[];
 for(const t of turmas){const rows=await all('alocacoes','id,turma_id,professor_id,componente_id,componentes_disciplina(nome,modalidade),blocos_grade(id,dia_semana,aula_inicio,quantidade_aulas,bloco_professores(professor_id),bloco_subturmas(subturma_id,subturmas(nome))),encontros_pos(id,data_aula,quantidade_aulas)',q=>q.eq('turma_id',t.id));allocations.push(...rows);}
 const period=periods.find(p=>p.id===pid);if(period?.data_inicio)$('ex-week').value=period.data_inicio;
 loadedPeriod=pid;ready=true;updateTurmas();status('Dados disponíveis. Escolha o professor ou turma e gere o relatório.','ok');
 }catch(e){console.error(e);status('Erro ao consultar aulas: '+e.message,'error');}}
function slotTime(b){const start=num(b.aula_inicio),end=start+num(b.quantidade_aulas)-1,lookup=num(b.dia_semana)===6?SATURDAY:WEEKDAY;const begin=lookup[start]?.split('–')[0],finish=lookup[end]?.split('–')[1];return begin&&finish?`${begin}–${finish}`:`${start}ª aula • ${num(b.quantidade_aulas)} aulas`;}
function weeksData(week){const first=monday(week),dates=Array.from({length:6},(_,i)=>{const x=new Date(first);x.setDate(x.getDate()+i);return iso(x)});return {dates,start:dates[0],end:dates[5]};}
function build(week){const tmap=new Map(turmas.map(t=>[t.id,t])),teachersMap=new Map(teachers.map(t=>[t.id,t]));
 const grad=[],pos=[],gradeSeen=new Set(),posSeen=new Set();
 for(const a of allocations){const turma=tmap.get(a.turma_id);if(!turma)continue;const discipline=a.componentes_disciplina?.nome||'Disciplina';
  for(const b of a.blocos_grade||[]){if(gradeSeen.has(b.id))continue;gradeSeen.add(b.id);const profids=[...new Set((b.bloco_professores||[]).map(p=>p.professor_id).filter(Boolean))];if(!profids.length&&a.professor_id)profids.push(a.professor_id);
   grad.push({id:b.id,turma,disciplina:discipline,day:num(b.dia_semana),start:num(b.aula_inicio),qty:num(b.quantidade_aulas),profids,teachers:profids.map(id=>teachersMap.get(id)?.nome||'Professor não encontrado'),time:slotTime(b),subs:[...new Set((b.bloco_subturmas||[]).map(s=>s.subturmas?.nome).filter(Boolean))].join(' + ')});}
  for(const e of a.encontros_pos||[]){if(posSeen.has(e.id))continue;posSeen.add(e.id);const dt=String(e.data_aula||'').slice(0,10);if(!dt)continue;pos.push({id:e.id,turma,disciplina:discipline,profid:a.professor_id,date:dt,day:dateOf(dt).getDay(),qty:num(e.quantidade_aulas)});}
 }
 return {grad,pos,teachersMap};}
function summaryFor(teacherId,data,week){const grad=data.grad.filter(g=>g.profids.includes(teacherId)).reduce((sum,g)=>sum+g.qty,0);
 const {start,end}=weeksData(week);const weeklyPos=data.pos.filter(e=>e.profid===teacherId&&e.date>=start&&e.date<=end).reduce((sum,e)=>sum+e.qty,0);
 const pos=Math.ceil(weeklyPos*60/50),prep=(grad+pos)*.2;
 const complementary=extras.filter(e=>e.professor_id===teacherId&&e.frequencia==='semanal').reduce((s,e)=>s+num(e.aulas_equivalentes),0);
 const total=Math.ceil((grad+pos)*1.2)+complementary;
 return {teacher:data.teachersMap.get(teacherId),grad,pos,prep,complementary,total};}
function makeCalendar(events,dates){const parent=$('ex-calendar');parent.replaceChildren();for(let i=0;i<6;i++){
 const cell=el('section',undefined,'ex-day'),head=el('div',undefined,'ex-day-title');head.append(el('span',DAYS[i]),el('span',fmt(dates[i]),'ex-day-date'));cell.append(head);
 const items=events.filter(e=>e.day===i+1).sort((a,b)=>a.order-b.order);for(const e of items){const card=el('article',undefined,'ex-event'+(e.pos?' pos':''));card.append(el('strong',e.title),el('small',e.details));cell.append(card);}if(!items.length)cell.append(el('div','Sem aulas','ex-empty'));parent.append(cell);
 }}
function addSummary(ids,data,week){const body=$('ex-summary-body');body.replaceChildren();const list=ids.map(id=>summaryFor(id,data,week)).filter(s=>s.teacher).sort((a,b)=>a.teacher.nome.localeCompare(b.teacher.nome,'pt-BR'));
 for(const s of list){const row=el('tr');const cell=el('td');cell.append(el('strong',s.teacher.nome),el('div',`NIF: ${s.teacher.nif||'Não informado'}`,'ex-note'));row.append(cell);for(const v of [s.grad,s.pos,pt(s.prep),s.complementary,s.total])row.append(el('td',v));if(s.total>40)row.lastChild.classList.add('ex-over');body.append(row);}
 if(!list.length){const r=el('tr'),c=el('td','Nenhum professor alocado nesta seleção.');c.colSpan=6;r.append(c);body.append(r);}
 const totals=list.reduce((x,s)=>x+s.total,0);$('ex-extra-note').textContent= list.length===1?`Total semanal: ${list[0].total} aulas equivalentes, correspondentes a ${pt(list[0].total*50/60)} horas de 60 minutos (incluindo preparação e complementares).`:`${list.length} professor(es) relacionado(s). As cargas são individuais e abrangem todas as aulas desses docentes na semana. Soma das cargas: ${pt(totals)} aulas equivalentes. Não representa a carga exclusiva desta turma.`;
}
function generate(){if(!ready||loadedPeriod!==$('ex-period').value)return status('Carregue primeiro os dados do período.','error');try{const week=$('ex-week').value;if(!week)throw Error('Informe a semana de consulta');const {dates,start,end}=weeksData(week),dataset=build(week),pid=$('ex-period').value,period=periods.find(p=>p.id===pid),pname=`${period?.ano||''}/${period?.semestre||''}`,teacherMode=$('ex-type').value==='professor';let events=[],ids=[];
 if(teacherMode){const id=$('ex-prof').value,teacher=teachers.find(t=>t.id===id);if(!teacher)throw Error('Selecione um professor');ids=[id];$('ex-title').textContent=`Grade de aulas — ${teacher.nome}`;$('ex-meta').textContent=`NIF: ${teacher.nif||'Não informado'} • Período: ${pname} • Semana: ${fmt(start)} a ${fmt(end)}`;
 for(const g of dataset.grad.filter(x=>x.profids.includes(id)))events.push({day:g.day,order:g.start,title:g.disciplina,details:`${labelTurma(g.turma)}${g.subs?' • '+g.subs:''} • ${g.time}`});
 for(const e of dataset.pos.filter(x=>x.profid===id&&x.date>=start&&x.date<=end))events.push({day:e.day,order:10,title:e.disciplina,details:`Pós • ${labelTurma(e.turma)} • ${e.qty} aula(s) de 60 min • ${fmt(e.date)}`,pos:true});
 }else{const id=$('ex-turma').value,t=turmas.find(x=>x.id===id);if(!t)throw Error('Selecione uma turma');$('ex-title').textContent=`Grade de aulas — ${labelTurma(t)}`;$('ex-meta').textContent=`Período: ${pname} • Semana: ${fmt(start)} a ${fmt(end)}`;
 const grade=dataset.grad.filter(x=>x.turma.id===id),post=dataset.pos.filter(x=>x.turma.id===id&&x.date>=start&&x.date<=end);
 for(const g of grade)events.push({day:g.day,order:g.start,title:g.disciplina,details:`${g.time} • ${g.teachers.join(', ')||'Sem professor (EAD)'}${g.subs?' • '+g.subs:''}`});
 for(const e of post)events.push({day:e.day,order:10,title:e.disciplina,details:`Pós • ${e.qty} aula(s) de 60 min • ${dataset.teachersMap.get(e.profid)?.nome||'Professor não identificado'}`,pos:true});
 ids=[...new Set([...grade.flatMap(g=>g.profids),...dataset.pos.filter(e=>e.turma.id===id).map(e=>e.profid)].filter(Boolean))];
 }
 makeCalendar(events,dates);addSummary(ids,dataset,week);$('ex-calendar-note').textContent='Grade da graduação: aulas recorrentes. Pós-graduação: somente encontros na semana de consulta, com a data real. Os encontros de pós não possuem horário inicial/final cadastrado; exibimos sua quantidade de aulas de 60 minutos.';$('ex-summary-heading').textContent=teacherMode?'Resumo semanal do professor':'Resumo semanal dos professores desta turma (carga geral por docente)';$('ex-print').classList.remove('hidden');$('ex-pdf').disabled=false;status('Relatório gerado. Para PDF, clique em “Salvar como PDF / Imprimir”.','ok');
 }catch(e){console.error(e);status(e.message,'error');$('ex-print').classList.add('hidden');$('ex-pdf').disabled=true;}}
async function check(){const {data,error}=await db.auth.getUser();if(error||!data?.user){$('ex-app').classList.add('hidden');$('ex-login').classList.remove('hidden');$('ex-logout').classList.add('hidden');status('Entre para acessar os relatórios.');return;}
 const adm=await db.from('administradores').select('usuario_id').eq('usuario_id',data.user.id).maybeSingle();if(adm.error||!adm.data){$('ex-app').classList.add('hidden');$('ex-login').classList.remove('hidden');status('Apenas administradores podem emitir relatórios gerais.','error');return;}
 $('ex-login').classList.add('hidden');$('ex-app').classList.remove('hidden');$('ex-logout').classList.remove('hidden');
 [periods,teachers]=await Promise.all([all('periodos_letivos','id,ano,semestre,data_inicio,data_fim'),all('professores','id,nome,nif')]);periods.sort((a,b)=>b.ano-a.ano||b.semestre-a.semestre);teachers.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
 $('ex-period').replaceChildren(...periods.map(p=>new Option(`${p.ano}/${p.semestre}`,p.id)));$('ex-prof').replaceChildren(new Option('Selecione o professor',''),...teachers.map(t=>new Option(t.nome,t.id)));syncTypes();await selectPeriod();}
$('ex-login-form').onsubmit=async e=>{e.preventDefault();try{const r=await db.auth.signInWithPassword({email:$('ex-email').value.trim(),password:$('ex-password').value});if(r.error)throw r.error;$('ex-password').value='';await check();}catch(e){status(e.message,'error');}};
$('ex-logout').onclick=async()=>{await db.auth.signOut();await check();};$('ex-type').onchange=syncTypes;$('ex-period').onchange=selectPeriod;$('ex-load').onclick=generate;$('ex-pdf').onclick=()=>window.print();
(async()=>{try{if(!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY)throw Error('Configure config.js');if(!window.supabase?.createClient)throw Error('Biblioteca Supabase indisponível');db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);await check();}catch(e){console.error(e);status('Falha: '+e.message,'error');}})();
})();
