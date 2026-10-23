(()=>{'use strict';
const $=id=>document.getElementById(id), byId=new Map();let db,periods=[],profs=[];
const D=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const node=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);if(cls)n.className=cls;return n;};
const parseDate=s=>new Date(String(s).slice(0,10)+'T12:00:00');
const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const startWeek=s=>{const d=parseDate(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);};
const addDays=(s,n)=>{const d=parseDate(s);d.setDate(d.getDate()+n);return iso(d);};
const format=s=>String(s).split('-').reverse().join('/');
function info(t,kind=''){$('au-status').textContent=t;$('au-status').className='notice '+kind;}
async function all(table,fields,filter){let records=[];for(let from=0;from<=100000;from+=500){let q=db.from(table).select(fields).range(from,from+499);if(filter)q=filter(q);let {data,error}=await q;if(error)throw error;records.push(...(data||[]));if(!data||data.length<500)return records;}throw Error('Limite de consulta excedido.');}
async function session(){const {data,error}=await db.auth.getUser();if(error||!data.user){$('au-login').classList.remove('hidden');$('au-app').classList.add('hidden');info('Entre para acessar a auditoria.');return;}
const adm=await db.from('administradores').select('usuario_id').eq('usuario_id',data.user.id).maybeSingle();if(adm.error||!adm.data){$('au-login').classList.remove('hidden');$('au-app').classList.add('hidden');info('Usuário sem autorização.','error');return;}
$('au-login').classList.add('hidden');$('au-app').classList.remove('hidden');$('au-logout').classList.remove('hidden');const [p,t]=await Promise.all([all('periodos_letivos','id,ano,semestre,data_inicio,data_fim'),all('professores','id,nome,cor_hex')]);periods=p.sort((a,b)=>b.ano-a.ano||b.semestre-a.semestre);profs=t;for(const x of t)byId.set(x.id,x.nome);$('au-period').replaceChildren(...periods.map(x=>new Option(`${x.ano}/${x.semestre}`,x.id)));info('Pronto para executar a auditoria.','ok');}
function issue(type,title,detail,who='',day='',severity='error'){return {type,title,detail,who,day,severity};}
function stat(label,value){const d=node('div',undefined,'card au-stat');d.append(node('span',label,'muted'),node('strong',value));return d;}
function render(issues){const f=$('au-type').value;let shown=issues.filter(x=>f==='all'||x.type===f);$('au-results').replaceChildren(...shown.map(x=>{const c=node('div',undefined,'au-item '+(x.severity==='error'?'error':''));c.append(node('strong',x.title),node('div',x.detail),node('small',[x.who,x.day].filter(Boolean).join(' • ')));return c;}));if(!shown.length)$('au-results').append(node('div','Nenhuma ocorrência encontrada para o filtro selecionado.','au-empty'));$('au-note').textContent=`${shown.length} ocorrência(s) exibida(s). Auditoria de consulta, sem alterações no banco.`;}
let last=[];
async function run(){const pid=$('au-period').value,p=periods.find(x=>x.id===pid);if(!p)return;info('Conferindo alocações…');$('au-run').disabled=true;try{
 const [turmas,extra]=await Promise.all([all('turmas','id,matriz_id,semestre_curricular,identificacao,matrizes_curriculares(nome,cursos(nome,nivel))',q=>q.eq('periodo_id',pid)),all('atividades_complementares','professor_id,aulas_equivalentes,frequencia',q=>q.eq('periodo_id',pid))]);
 const records=[];for(const t of turmas){const rows=await all('alocacoes','id,turma_id,professor_id,componente_id,componentes_disciplina(nome,modalidade),blocos_grade(id,dia_semana,aula_inicio,quantidade_aulas,bloco_professores(professor_id),bloco_subturmas(subturma_id)),encontros_pos(id,data_aula,quantidade_aulas)',q=>q.eq('turma_id',t.id));for(const a of rows)records.push({t,a});}
 const issues=[],grad=[],pos=[],uniqueBlocks=new Set(),uniquePos=new Set(),complement=new Map();
 for(const e of extra)if(e.frequencia==='semanal')complement.set(e.professor_id,(complement.get(e.professor_id)||0)+Number(e.aulas_equivalentes||0));
 for(const {t,a} of records){const course=t.matrizes_curriculares?.cursos?.nome||'Curso';const name=a.componentes_disciplina?.nome||'Disciplina';
 for(const b of a.blocos_grade||[]){if(uniqueBlocks.has(b.id))continue;uniqueBlocks.add(b.id);const ids=[...new Set((b.bloco_professores||[]).map(x=>x.professor_id).filter(Boolean))];if(!ids.length&&a.professor_id)ids.push(a.professor_id);const subs=(b.bloco_subturmas||[]).map(x=>x.subturma_id);for(const id of ids)grad.push({id:b.id,teacher:id,day:Number(b.dia_semana),start:Number(b.aula_inicio),qty:Number(b.quantidade_aulas),name,course,subs});}
 for(const e of a.encontros_pos||[]){if(uniquePos.has(e.id))continue;uniquePos.add(e.id);if(a.professor_id)pos.push({id:e.id,teacher:a.professor_id,date:e.data_aula,qty:Number(e.quantidade_aulas),name,course});}
 }
 // Graduação: professor duplicado no mesmo horário. Um bloco compartilhado é uma única ocorrência.
 const slots=new Map();for(const g of grad)for(let slot=g.start;slot<g.start+g.qty;slot++){const key=`${g.teacher}|${g.day}|${slot}`;let arr=slots.get(key)||[];arr.push(g);slots.set(key,arr);}
 for(const [key,arr] of slots){if(arr.length>1){const [id,day,slot]=key.split('|');issues.push(issue('conflict','Aulas de graduação sobrepostas',arr.map(x=>`${x.course} — ${x.name}`).join(' / '),byId.get(id)||id,`${D[Number(day)]}, ${slot}ª aula`));}}
 // Pós + graduação no mesmo dia recorrente.
 const gradDays=new Set(grad.map(x=>`${x.teacher}|${x.day}`));for(const e of pos){const day=parseDate(e.date).getDay();if(gradDays.has(`${e.teacher}|${day}`))issues.push(issue('conflict','Pós e graduação no mesmo dia',`${e.course} — ${e.name}; existe aula de graduação recorrente neste dia.`,byId.get(e.teacher)||e.teacher,format(e.date)));}
 // Pós: no sábado até 8 aulas, durante a semana até 4. Não tratar dois módulos de sábado como sobreposição se turnos não estiverem cadastrados.
 const posDays=new Map();for(const e of pos){const k=`${e.teacher}|${e.date}`;let a=posDays.get(k)||[];a.push(e);posDays.set(k,a);}
 for(const [key,es] of posDays){const [teacher,date]=key.split('|'),qty=es.reduce((s,x)=>s+x.qty,0),isSat=parseDate(date).getDay()===6,limit=isSat?8:4;if(qty>limit)issues.push(issue('conflict','Excesso de aulas de pós no dia',`${qty} aulas de 60 min, limite configurado de ${limit}.`,byId.get(teacher)||teacher,format(date)));}
 // Distribuição de graduação e pós no período: checar carga de cada semana civil, sem somar todas as 30h do módulo na semana.
 const end=p.data_fim||`${p.ano}-${p.semestre===1?'06-30':'12-31'}`,begin=p.data_inicio||`${p.ano}-${p.semestre===1?'01-01':'07-01'}`;
 const weekStarts=[];for(let w=startWeek(begin),i=0;i<60&&w<=end;w=addDays(w,7),i++)weekStarts.push(w);
 const ids=new Set([...grad.map(x=>x.teacher),...pos.map(x=>x.teacher),...complement.keys()]);
 for(const id of ids){const regular=grad.filter(x=>x.teacher===id).reduce((s,x)=>s+x.qty,0),extras=complement.get(id)||0;
 for(const w of weekStarts){const until=addDays(w,6),post=pos.filter(x=>x.teacher===id&&x.date>=w&&x.date<=until).reduce((s,x)=>s+x.qty,0);const eq=Math.ceil(post*60/50),total=Math.ceil((regular+eq)*1.2)+extras;if(total>40)issues.push(issue('workload','Carga semanal acima de 40',`${regular} aulas graduação + ${eq} pós equivalentes + preparação de 20% + ${extras} complementares = ${total} aulas equivalentes.`,byId.get(id)||id,`Semana ${format(w)} a ${format(until)}`));}
 }
 // Aviso de cobertura: não indicar como erro o fato de uma mesma disciplina estar em subturmas diferentes.
 const gradeByTurma=new Map();for(const g of grad)for(const sub of g.subs){const k=sub;gradeByTurma.set(k,(gradeByTurma.get(k)||0)+g.qty);} // Informação de cobertura será exibida em revisão futura, após cotejar carga esperada por componente.
 last=issues;$('au-stats').replaceChildren(stat('Blocos de graduação',uniqueBlocks.size),stat('Encontros de pós',uniquePos.size),stat('Conflitos',issues.filter(x=>x.type==='conflict').length),stat('Semanas acima de 40',issues.filter(x=>x.type==='workload').length));render(issues);info('Auditoria concluída.','ok');
 }catch(e){console.error(e);info('Não foi possível concluir: '+e.message,'error');$('au-results').replaceChildren(node('p',e.message,'notice error'));}finally{$('au-run').disabled=false;}}
$('au-form').onsubmit=async event=>{event.preventDefault();const {error}=await db.auth.signInWithPassword({email:$('au-email').value.trim(),password:$('au-password').value});if(error)return info(error.message,'error');$('au-password').value='';await session();};$('au-run').onclick=run;$('au-type').onchange=()=>render(last);$('au-logout').onclick=async()=>{await db.auth.signOut();await session();};
(async()=>{try{if(!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY)throw Error('Configure o config.js');if(!window.supabase?.createClient)throw Error('Biblioteca do Supabase indisponível');db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);await session();}catch(e){console.error(e);info('Falha ao iniciar: '+e.message,'error');}})();
})();