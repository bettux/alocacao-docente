(()=>{'use strict';
const $=id=>document.getElementById(id);
const days=['','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const times=['','18:25–19:15','19:15–20:05','20:20–21:10','21:10–22:00','22:00–22:50'];
const sats=['','09:00–09:50','09:50–10:40','10:55–11:45','13:00–13:50','13:50–14:40','14:40–15:30','15:45–16:35','16:35–17:25'];
let db,periods=[],professors=[];
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const fmt=iso=>String(iso).split('-').reverse().join('/');
const dObj=iso=>new Date(`${iso}T12:00:00`);
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const monday=str=>{const d=dObj(str);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;};
const num=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
function message(msg,kind=''){const n=$('ad-status');n.textContent=msg;n.className='notice '+kind;}
async function pages(table,columns,filter){let a=[],i=0;while(true){let q=db.from(table).select(columns).range(i,i+499);if(filter)q=filter(q);const r=await q;if(r.error)throw r.error;a.push(...r.data);if(r.data.length<500)return a;i+=500;if(i>100000)throw Error('Consulta muito extensa');}}
async function session(){const {data,error}=await db.auth.getUser();if(error||!data.user){$('ad-login').classList.remove('hidden');$('ad-app').classList.add('hidden');$('ad-logout').classList.add('hidden');message('Faça login para acessar a agenda.');return;}
const adm=await db.from('administradores').select('usuario_id').eq('usuario_id',data.user.id).maybeSingle();if(adm.error||!adm.data){$('ad-app').classList.add('hidden');$('ad-login').classList.remove('hidden');message('Usuário não autorizado a acessar a agenda.','error');return;}
$('ad-login').classList.add('hidden');$('ad-app').classList.remove('hidden');$('ad-logout').classList.remove('hidden');message('Agenda pronta. Selecione professor e semana.','ok');await selectors();}
async function selectors(){const [pp,tt]=await Promise.all([pages('periodos_letivos','id,ano,semestre,data_inicio,data_fim'),pages('professores','id,nome,cor_hex,ativo')]);periods=pp.sort((a,b)=>b.ano-a.ano||b.semestre-a.semestre);professors=tt.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
$('ad-period').replaceChildren(...periods.map(p=>new Option(`${p.ano}/${p.semestre}`,p.id)));$('ad-teacher').replaceChildren(new Option('Selecione um professor',''),...professors.map(p=>new Option(p.nome+(p.ativo?'':' (inativo)'),p.id)));if(periods[0]?.data_inicio)$('ad-week').value=periods[0].data_inicio;else $('ad-week').value=iso(new Date());}
function block(name,detail,teacherColor,pos=false){let n=el('div',undefined,'ad-block'+(pos?' ad-pos':''));n.style.borderLeftColor=pos?'#db8a20':teacherColor||'#386fbb';n.append(el('strong',name),el('small',detail));return n;}
function stat(name,val){const n=el('div',undefined,'card ad-stat');n.append(el('span',name,'muted'),el('strong',String(val)));return n;}
async function load(){const period=$('ad-period').value,teacher=$('ad-teacher').value,day=$('ad-week').value;if(!period||!teacher||!day)return message('Selecione período, professor e data.','error');$('ad-refresh').disabled=true;message('Consultando o Supabase…');try{
const mondayDate=monday(day),weekdates=Array.from({length:6},(_,i)=>{const d=new Date(mondayDate);d.setDate(d.getDate()+i);return iso(d)}),weekEnd=weekdates[5],who=professors.find(p=>p.id===teacher);
const turmas=await pages('turmas','id,matriz_id,semestre_curricular,identificacao,matrizes_curriculares(nome,cursos(nome,nivel))',q=>q.eq('periodo_id',period));
const turmasMap=new Map(turmas.map(t=>[t.id,t]));let rows=[];
for(const t of turmas)rows.push(...await pages('alocacoes','id,turma_id,professor_id,componente_id,observacao,componentes_disciplina(nome,modalidade),blocos_grade(id,dia_semana,aula_inicio,quantidade_aulas,bloco_professores(professor_id),bloco_subturmas(subturma_id,subturmas(nome))),encontros_pos(id,data_aula,quantidade_aulas)',q=>q.eq('turma_id',t.id)));
const grad=[],pos=[],seen=new Set();
for(const a of rows){const t=turmasMap.get(a.turma_id),course=t?.matrizes_curriculares?.cursos?.nome||'Curso',name=a.componentes_disciplina?.nome||'Disciplina';
for(const b of (a.blocos_grade||[])){if(seen.has(b.id))continue;seen.add(b.id);const linked=[...new Set((b.bloco_professores||[]).map(x=>x.professor_id))];if(!linked.length&&a.professor_id)linked.push(a.professor_id);if(!linked.includes(teacher))continue;
const subturmas=[...new Set((b.bloco_subturmas||[]).map(x=>x.subturmas?.nome).filter(Boolean))].join(' + ');grad.push({id:b.id,day:Number(b.dia_semana),start:Number(b.aula_inicio),qty:Number(b.quantidade_aulas),course,name,subturmas});}
for(const e of(a.encontros_pos||[])){if(a.professor_id!==teacher||e.data_aula<weekdates[0]||e.data_aula>weekEnd)continue;pos.push({id:e.id,date:e.data_aula,day:dObj(e.data_aula).getDay(),qty:Number(e.quantidade_aulas),name,course});}
}
const conflicts=[];for(const e of pos){if(grad.some(g=>g.day===e.day))conflicts.push(`${fmt(e.date)}: pós de ${e.name} em dia com graduação recorrente.`);}
const bydate=new Map();for(const e of pos){const arr=bydate.get(e.date)||[];arr.push(e);bydate.set(e.date,arr);}for(const [date,arr] of bydate){const qty=arr.reduce((s,x)=>s+x.qty,0);if(qty>(dObj(date).getDay()===6?8:4))conflicts.push(`${fmt(date)}: ${qty} aulas de pós ultrapassam o limite diário.`);}
// As atividades com frequência 'semanal' entram na carga da semana,
// mas NÃO recebem os 20% de preparação.
const extras=await pages('atividades_complementares',
  'id,aulas_equivalentes,frequencia',
  q=>q.eq('periodo_id',period).eq('professor_id',teacher).eq('frequencia','semanal'));
const complementares=extras.reduce((s,a)=>s+Number(a.aulas_equivalentes||0),0);
const sumGrad=grad.reduce((s,x)=>s+x.qty,0),sumPos=pos.reduce((s,x)=>s+x.qty,0),posEq=Math.ceil(sumPos*60/50);
const total=Math.ceil((sumGrad+posEq)*1.2)+complementares;
$('ad-stats').replaceChildren(
  stat('Aulas graduação / semana',sumGrad),
  stat('Atividades complementares / semana',num(complementares)),
  stat('Aulas pós equivalentes (50 min)',posEq),
  stat('Total semanal com preparação + atividades',num(total))
);
$('ad-week-label').textContent=`Semana de ${fmt(weekdates[0])} a ${fmt(weekEnd)} — ${who.nome}`;
$('ad-conflict-count').textContent=conflicts.length?`${conflicts.length} alerta(s)`:'Sem conflitos identificados';$('ad-conflict-count').classList.toggle('ad-warn',!!conflicts.length);
const head=el('tr');head.append(el('th','Horário'));for(let i=0;i<6;i++){const h=el('th',`${days[i+1]} ${fmt(weekdates[i])}`);head.append(h);}$('ad-head').replaceChildren(head);
const body=$('ad-body');body.replaceChildren();let tr=el('tr');tr.append(el('th','Pós por data'));for(let dayNumber=1;dayNumber<=6;dayNumber++){const td=el('td');const matched=pos.filter(x=>x.day===dayNumber);if(matched.length){for(const p of matched)td.append(block(p.name,`${p.course} • ${p.qty} aula(s) de 60 min • dia reservado`,who.cor_hex,true));if(grad.some(g=>g.day===dayNumber))td.classList.add('ad-collision');}else td.append(el('span','Sem pós nesta data','ad-empty'));tr.append(td);}body.append(tr);
for(let slot=1;slot<=8;slot++){tr=el('tr');tr.append(el('td',slot<=5?`${slot}ª • ${times[slot]}`:`${slot}ª • Sábado`));for(let dayNumber=1;dayNumber<=6;dayNumber++){const td=el('td');if(slot>(dayNumber===6?8:5)){td.textContent='—';tr.append(td);continue;}const matches=grad.filter(g=>g.day===dayNumber&&slot>=g.start&&slot<g.start+g.qty);for(const g of matches){const first=slot===g.start;td.append(block(first?g.name:`↳ ${g.name}`,`${g.course} ${g.subturmas?'• '+g.subturmas:''} ${first?'• '+g.qty+' aula(s)':''}`,who.cor_hex));}if(pos.some(p=>p.day===dayNumber)&&matches.length)td.classList.add('ad-collision');tr.append(td);}body.append(tr);}
const details=$('ad-details');details.replaceChildren();if(conflicts.length){const p=el('div',undefined,'notice error');p.append(el('strong','Conflitos encontrados'));for(const conflict of conflicts)p.append(el('div',conflict));details.append(p);}
const all=[...grad.map(g=>({day:g.day,t:`${days[g.day]} • ${g.start}ª aula • ${g.qty} aula(s) • ${g.course} — ${g.name}${g.subturmas?' • '+g.subturmas:''}`})),...pos.map(p=>({day:p.day,t:`${fmt(p.date)} • ${p.qty} aula(s) de 60 min • ${p.course} — ${p.name}`}))].sort((a,b)=>a.day-b.day);for(const item of all){const n=el('div',undefined,'ad-detail-card');n.append(el('span',item.t));details.append(n);}if(!all.length)details.append(el('p','Nenhuma alocação para este professor no período selecionado.','muted'));
message('Agenda atualizada. A graduação é recorrente e a pós corresponde às datas desta semana.','ok');
}catch(err){console.error(err);message('Não foi possível consultar a agenda: '+err.message,'error');}finally{$('ad-refresh').disabled=false;}}
$('ad-login-form').onsubmit=async e=>{e.preventDefault();const r=await db.auth.signInWithPassword({email:$('ad-email').value.trim(),password:$('ad-password').value});if(r.error)return message(r.error.message,'error');$('ad-password').value='';await session();};
$('ad-logout').onclick=async()=>{await db.auth.signOut();await session();};$('ad-refresh').onclick=load;$('ad-teacher').onchange=load;$('ad-week').onchange=load;$('ad-period').onchange=load;
(async()=>{try{if(!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY)throw Error('Configure o config.js');if(!window.supabase?.createClient)throw Error('Biblioteca do Supabase não carregada');db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);await session();}catch(err){message('Falha na inicialização: '+err.message,'error');}})();
})();