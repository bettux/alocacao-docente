"use strict";
const $=id=>document.getElementById(id);
const D={db:null,periodos:[],matrizes:[],materias:[],professores:[],feriados:[],itens:[],original:[],periodo2:false,selecionada:null,editando:null,ctx:null,dirty:false,regular:new Map()};
const nomes=['','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const dISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parsed=s=>new Date(s+'T12:00:00');
const addDays=(iso,n)=>{const d=parsed(iso);d.setDate(d.getDate()+n);return dISO(d)};
const weekday=iso=>{const n=parsed(iso).getDay();return n===0?7:n};
const getPeriod=()=>D.periodos.find(x=>x.id===$('periodo').value);
const msg=(str,type='error',id='feedback')=>{const x=$(id);x.textContent=str;x.className='notice '+type;x.classList.remove('hidden')};
const clear=(id='feedback')=>$(id).classList.add('hidden');
const option=(value,text)=>new Option(text,value);
const keyItem=x=>`${x.componente}|${x.professor}|${modoDia(x.day)}`;
function weekStart(iso){return addDays(iso,-(weekday(iso)-1))}
function halfFor(iso){const p=getPeriod();if(!p)return 1;const w0=weekStart(p.data_inicio);return (Math.floor((parsed(weekStart(iso))-parsed(w0))/86400000/7)<10)?1:2}
function startHalf(half,day){const p=getPeriod();if(!p)return '';let start=addDays(weekStart(p.data_inicio),(half-1)*70);return addDays(start,day-1)}
function activeCourse(){return $('matriz').value}
function countSubject(comp,half){return D.itens.filter(x=>x.componente===comp&&x.half===half).reduce((s,x)=>s+x.dates.reduce((t,e)=>t+e.quantidade,0),0)}
const teachersColor=id=>D.professores.find(p=>p.id===id)?.cor_hex||'#2563eb';
const teacherName=id=>D.professores.find(p=>p.id===id)?.nome||'Professor';
const subjectName=id=>D.materias.find(c=>c.id===id)?.nome||'Matéria';
function setDirty(v){D.dirty=v;$('save-state').textContent=v?'● Alterações não salvas':'✓ Sem alterações';$('save-state').style.color=v?'#b45309':''}
function renderSubjects(){
 const area=$('materias');area.replaceChildren();
 if(!D.materias.length)area.append(document.createTextNode('Nenhuma matéria encontrada.'));
 const mode=modoAtual();
 for(const m of D.materias){
  const b=document.createElement('button');
  b.className='v41-subject'+(m.id===D.selecionada?' selected':'');
  b.type='button';
  // Os contadores pertencem ao formulário selecionado, não ao curso inteiro.
  const locais=D.itens.filter(x=>x.componente===m.id&&modoDia(x.day)===mode);
  const total=locais.reduce((s,x)=>s+x.dates.reduce((n,e)=>n+e.quantidade,0),0);
  const count1=locais.filter(x=>x.half===1).reduce((s,x)=>s+x.dates.reduce((n,e)=>n+e.quantidade,0),0);
  const count2=locais.filter(x=>x.half===2).reduce((s,x)=>s+x.dates.reduce((n,e)=>n+e.quantidade,0),0);
  const outro=D.itens.find(x=>x.componente===m.id&&modoDia(x.day)!==mode);
  const descricao=`${total}/${m.carga_aulas||30} aulas • 1º período: ${count1} • 2º: ${count2}`;
  b.append(Object.assign(document.createElement('strong'),{textContent:m.nome}),Object.assign(document.createElement('small'),{textContent:descricao}));
  if(outro){
   const badge=document.createElement('small');badge.className='v432-other-mode';
   badge.textContent=`Outra oferta em ${modoDia(outro.day)==='sabado'?'Sábado':'Semana'} (planejamento independente)`;
   b.append(badge);
  }
  b.onclick=()=>{D.selecionada=m.id;renderSubjects()};area.append(b);
 }
}
function modoDia(day){return day===6?'sabado':'semana'}
function modoAtual(){return $('tipo').value}
function materiasDoModo(mode){return D.itens.filter(x=>modoDia(x.day)===mode)}
function renderModo(){
 const mode=modoAtual();
 $('modo-semana').classList.toggle('primary',mode==='semana');
 $('modo-sabado').classList.toggle('primary',mode==='sabado');
 $('modo-semana').setAttribute('aria-selected',String(mode==='semana'));
 $('modo-sabado').setAttribute('aria-selected',String(mode==='sabado'));
 $('modo-titulo').textContent=mode==='sabado'?'Grade de sábado':'Grade durante a semana';
 $('modo-descricao').textContent=mode==='sabado'?'Manhã, tarde ou dia inteiro. Cada matéria deve estar apenas em um dos dois planejamentos.':'Segunda a sexta. Outras matérias do mesmo curso podem ser planejadas aos sábados.';
 const n=materiasDoModo(mode).length;
 $('modo-resumo').textContent=n===0?'Nenhuma matéria nesta grade':`${n} matéria(s) nesta grade`;
 $('modo-alerta').className='notice hidden';
}
function selecionarModo(mode){
 if(modoAtual()===mode)return;
 $('tipo').value=mode;
 D.selecionada=D.materias.find(m=>!D.itens.some(x=>x.componente===m.id&&modoDia(x.day)===mode))?.id||D.materias[0]?.id||null;
 render();clear('status');
}
function render(){renderModo();renderSubjects();const area=$('grades');area.replaceChildren();const days=$('tipo').value==='sabado'?[6]:[1,2,3,4,5];
 for(let half=1;half<=(D.periodo2?2:1);half++){const card=document.createElement('section');card.className='card v41-period';const h=document.createElement('h2');h.textContent=half+'º período do semestre';card.append(h);
 const cap=document.createElement('p');cap.className='v41-period-caption';cap.textContent=`Semanas ${half===1?'1 a 10':'11 a 20'} • ${$('tipo').value==='sabado'?'Sábado, manhã e tarde':'Segunda a sexta'}`;card.append(cap);
 const wrap=document.createElement('div');wrap.className='v41-week';const table=document.createElement('table');table.className='v41-grid';const tr=document.createElement('tr');days.forEach(day=>{const th=document.createElement('th');th.textContent=nomes[day];tr.append(th)});table.append(tr);const row=document.createElement('tr');
 for(const day of days){const td=document.createElement('td');const inner=document.createElement('div');inner.className='v41-slot';const matches=D.itens.filter(x=>x.half===half&&x.day===day);
 const slots=day===6?['manha','tarde']:['noite'];for(const slot of slots){const container=document.createElement('div');container.className='v41-slot';if(day===6){const label=document.createElement('div');label.className='v41-group-label';label.textContent=slot==='manha'?'Antes do almoço':'Depois do almoço';container.append(label)}
 const slotItems=matches.filter(x=>x.turno===slot||x.turno==='integral');if(slotItems.length){for(const x of slotItems){const block=document.createElement('div');block.className='v41-block'+(x.saved?'':' v41-pending');block.style.borderLeftColor=teachersColor(x.professor);const title=document.createElement('strong');title.textContent=subjectName(x.componente);const small=document.createElement('small');small.textContent=`${teacherName(x.professor)} • ${x.dates.length} encontros`;block.append(title,small);block.onclick=e=>{e.stopPropagation();openModal(half,day,slot,x)};container.append(block)}}else{const hint=document.createElement('div');hint.className='v41-hint';hint.textContent='+ Alocar matéria';container.append(hint)}
 container.onclick=e=>{if(e.target.closest('.v41-block'))return;openModal(half,day,slot,null)};inner.append(container)}td.append(inner);row.append(td)}table.append(row);wrap.append(table);card.append(wrap);area.append(card)}
 renderEncounters();$('add-periodo').disabled=D.periodo2;$('add-periodo').textContent=D.periodo2?'2º período adicionado':'+ Adicionar 2º período';}
function ptDate(iso){return iso.split('-').reverse().join('/')}
function canReplace(item,candidate,quantidade){
 const p=getPeriod();if(candidate>p.data_fim||halfFor(candidate)!==item.half)return false;
 if(D.feriados.some(x=>x.data_aula===candidate))return false;
 if(D.regular.get(item.professor)?.has(item.day))return false;
 if(item.dates.some(x=>x.data===candidate))return false;
 const others=D.itens.filter(x=>x!==item);
 for(const x of others){
   const same=x.dates.find(d=>d.data===candidate);
   if(!same)continue;
   if(x.half===item.half&&x.day===item.day){
     if(item.day!==6||item.turno==='integral'||x.turno==='integral'||item.turno===x.turno)return false;
   }
   if(x.professor===item.professor){
     const splitSaturday=item.day===6&&x.day===6&&item.turno!=='integral'&&x.turno!=='integral'&&item.turno!==x.turno;
     if(!splitSaturday||quantidade+same.quantidade>8)return false;
   }
 }
 return true;
}
function removeEncounter(item,date){
 const encounter=item.dates.find(e=>e.data===date);
 if(!encounter)return;
 if(item.dates.length===1){msg('Para retirar o último encontro, utilize “Remover toda a matéria” na janela de alocação.');return;}
 if(!confirm(`Excluir ${ptDate(date)} de ${subjectName(item.componente)} e procurar uma data futura para reposição?`))return;
 const prev=item.dates;
 const latest=prev.reduce((max,e)=>e.data>max?e.data:max,date);
 const backup=item.dates;
 item.dates=prev.filter(e=>e.data!==date);
 let next=addDays(latest,7),replacement=null,tries=0;
 while(tries++<65&&next<=getPeriod().data_fim&&halfFor(next)===item.half){
   if(canReplace(item,next,encounter.quantidade)){replacement=next;break}
   next=addDays(next,7);
 }
 if(!replacement){item.dates=backup;msg('Não há data letiva futura disponível para reposição dentro deste período. Nenhum encontro foi removido.');return;}
 item.dates=[...item.dates,{data:replacement,quantidade:encounter.quantidade}].sort((a,b)=>a.data.localeCompare(b.data));
 item.saved=false;setDirty(true);render();
 const container=$('resumo-encontros');
 for(const detail of container.querySelectorAll('details'))if(detail.dataset.key===keyItem(item))detail.open=true;
 msg(`Encontro ${ptDate(date)} retirado do rascunho. Reposição prevista para ${ptDate(replacement)}. Clique em “Salvar planejamento” para confirmar no Supabase.`,'ok','status');
}
function renderEncounters(){
 const root=$('resumo-encontros');if(!root)return;
 const opened=new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.key));
 root.replaceChildren();
 const visiveis=materiasDoModo(modoAtual());if(!visiveis.length){const empty=document.createElement('p');empty.className='v42-empty';empty.textContent='Nenhuma matéria alocada neste planejamento.';root.append(empty);return}
 for(const item of visiveis){
  const detail=document.createElement('details');detail.className='v42-details';detail.dataset.key=keyItem(item);detail.open=opened.has(detail.dataset.key);
  const summary=document.createElement('summary');const title=document.createElement('strong');title.textContent=subjectName(item.componente);
  const description=document.createElement('small');const sorted=[...item.dates].sort((a,b)=>a.data.localeCompare(b.data));
  const total=sorted.reduce((sum,e)=>sum+e.quantidade,0);
  description.textContent=`${teacherName(item.professor)} • ${item.half}º período • ${total}/30 aulas • ${sorted.length} encontros • ${ptDate(sorted[0].data)} a ${ptDate(sorted[sorted.length-1].data)}`;
  summary.append(title,description);if(!item.saved){const tag=document.createElement('span');tag.className='v42-unsaved';tag.textContent=' • Pendente de salvar';summary.append(tag)}detail.append(summary);
  const dates=document.createElement('div');dates.className='v42-dates';
  for(const e of sorted){const row=document.createElement('div');row.className='v42-date-row';const label=document.createElement('span');label.textContent=`${ptDate(e.data)} — ${nomes[item.day]} — ${e.quantidade} aula(s)`;
   const remove=document.createElement('button');remove.type='button';remove.className='btn danger';remove.textContent='Excluir e repor';remove.onclick=()=>removeEncounter(item,e.data);row.append(label,remove);dates.append(row)}
  detail.append(dates);root.append(detail);
 }
}
function openModal(half,day,slot,item){clear('modal-error');D.ctx={half,day,slot};D.editando=item||null;
 if(!item&&!D.selecionada)return msg('Selecione primeiro uma matéria à esquerda.');
 const comp=item?.componente||D.selecionada;const m=D.materias.find(c=>c.id===comp);$('contexto').textContent=`${m?.nome} • ${half}º período • ${nomes[day]}${day===6?' • '+(slot==='manha'?'Antes do almoço':'Depois do almoço'):''}`;
 $('professor').replaceChildren(...D.professores.filter(t=>t.ativo).map(t=>option(t.id,t.nome)));
 if(item)$('professor').value=item.professor;
 $('inicio').value=item?.dates[0]?.data||startHalf(half,day);
 $('quantidade').value=String(item?.qtd|| (day===6?4:3));
 $('quantidade').replaceChildren(...(day===6?[3,4,8]:[3,4]).map(n=>option(n,`${n} aulas (${n*60} min)`)));
 $('quantidade').value=String(item?.qtd|| (day===6?4:3));
 $('turno-row').classList.toggle('hidden',day!==6);$('turno').value=item?.turno||slot;
 $('remove').classList.toggle('hidden',!item);$('modal').classList.remove('hidden');}
function generate(){clear('modal-error');const {half,day,slot}=D.ctx;const comp=D.editando?.componente||D.selecionada,prof=$('professor').value,start=$('inicio').value,qtd=Number($('quantidade').value),turno=day===6?$('turno').value:'noite';const period=getPeriod();
 if(!prof||!start||!period)return msg('Escolha professor e data inicial.','error','modal-error');
 if(weekday(start)!==day)return msg('A data inicial não corresponde ao dia da semana escolhido.','error','modal-error');
 if(halfFor(start)!==half)return msg(`Escolha uma data do ${half}º período do semestre.`,'error','modal-error');
 if(day===6&&turno!=='integral'&&qtd>4)return msg('Sábado parcial permite até 4 aulas. Para 8 aulas, escolha dia inteiro.','error','modal-error');
 if(day===6&&turno==='integral'&&qtd!==8)return msg('Para sábado integral selecione 8 aulas.','error','modal-error');
 let dates=[],cursor=start,left=30;const blocked=new Set(D.feriados.map(x=>x.data_aula));let tries=0;
 while(left>0&&tries++<80&&cursor<=period.data_fim){if(!blocked.has(cursor)){const quantidade=Math.min(qtd,left);dates.push({data:cursor,quantidade});left-=quantidade}cursor=addDays(cursor,7)}
 if(left>0)return msg(`Não cabem 30 horas neste período. Restam ${left} horas sem data. Escolha um início anterior, menos feriados ou outro período.`,'error','modal-error');
 const next={componente:comp,professor:prof,half,day,turno,qtd,dates,saved:false};
 const others=D.itens.filter(x=>x!==D.editando);
 if(others.some(x=>x.componente===comp&&modoDia(x.day)===modoDia(day)))return msg('Esta matéria já está alocada neste formulário. Para alterar, clique no bloco existente.','error','modal-error');
 // Não duplicar a mesma faixa, inclusive entre professores distintos.
 for(const x of others){if(x.half!==half||x.day!==day)continue;
 if(day===6&&(turno==='integral'||x.turno==='integral'||x.turno===turno))return msg('Este turno já está ocupado. Escolha o outro período do sábado ou remova a alocação existente.','error','modal-error');
 if(day!==6)return msg('Esse dia já tem um módulo neste período.','error','modal-error');}
 // Não permitir conflito com a grade de graduação carregada.
 if(D.regular.get(prof)?.has(day))return msg(`Este professor já tem graduação recorrente na ${nomes[day]}. Não pode receber pós nesse dia.`,'error','modal-error');
 for(const x of others.filter(v=>v.professor===prof)){for(const a of dates){const b=x.dates.find(d=>d.data===a.data);if(b&&!(day===6&&turno!==x.turno&&turno!=='integral'&&x.turno!=='integral'&&(a.quantidade+b.quantidade)<=8))return msg(`Professor ocupado em ${a.data}.`,'error','modal-error')}}
 D.itens=others.concat(next);setDirty(true);$('modal').classList.add('hidden');render();msg('Bloco aplicado à grade como rascunho. Clique em Salvar planejamento para gravar.','ok','status')}
async function loadData(){clear();const periodo=$('periodo').value,matriz=$('matriz').value;if(!periodo||!matriz)return;
 const [rmd,rprof,rnon,rtur]=await Promise.all([D.db.from('matriz_disciplinas').select('id').eq('matriz_id',matriz),D.db.from('professores').select('id,nome,cor_hex,ativo').order('nome'),D.db.from('dias_nao_letivos').select('id,data_aula,motivo').eq('periodo_id',periodo),D.db.from('turmas').select('id').eq('periodo_id',periodo)]);
 for(const r of [rmd,rprof,rnon,rtur])if(r.error)throw r.error;
 D.professores=rprof.data||[];D.feriados=rnon.data||[];renderFeriados();const ids=(rmd.data||[]).map(x=>x.id);
 const rc=ids.length?await D.db.from('componentes_disciplina').select('id,nome,carga_aulas,modalidade').in('matriz_disciplina_id',ids).eq('modalidade','pos').order('nome'):{data:[],error:null};if(rc.error)throw rc.error;D.materias=rc.data||[];D.selecionada=D.materias[0]?.id||null;
 D.regular=new Map();const turmaids=(rtur.data||[]).map(t=>t.id);
 if(turmaids.length){const gr=await D.db.from('alocacoes').select('professor_id,blocos_grade(dia_semana,bloco_professores(professor_id))').in('turma_id',turmaids);if(gr.error)throw gr.error;
 for(const a of gr.data||[])for(const b of a.blocos_grade||[])for(const id of [a.professor_id,...(b.bloco_professores||[]).map(x=>x.professor_id)].filter(Boolean)){if(!D.regular.has(id))D.regular.set(id,new Set());D.regular.get(id).add(Number(b.dia_semana))}}
 const rs=turmaids.length?await D.db.from('alocacoes').select('id,professor_id,componente_id,observacao,pos_turno,pos_metade,turmas!inner(periodo_id,matriz_id),encontros_pos(data_aula,quantidade_aulas)').in('turma_id',turmaids).in('observacao',['POS_WEB_V1','POS_WEB_SEMANA','POS_WEB_SABADO']).eq('turmas.matriz_id',matriz):{data:[],error:null};if(rs.error)throw rs.error;
 D.itens=[];for(const a of rs.data||[]){if(!a.encontros_pos?.length)continue;const dates=a.encontros_pos.map(e=>({data:e.data_aula,quantidade:Number(e.quantidade_aulas)})).sort((a,b)=>a.data.localeCompare(b.data));const day=weekday(dates[0].data),half=halfFor(dates[0].data),qtd=dates[0].quantidade;const turno=day===6?(a.pos_turno|| (qtd>4?'integral':'manha')):'noite';
 D.itens.push({componente:a.componente_id,professor:a.professor_id,half:a.pos_metade||half,day,turno,qtd,dates,saved:true})}
 // Rascunho inicia vazio, sem sobrescrever registros já salvos.
 $('tipo').value=modoAtual()==='sabado'?'sabado':'semana';
 D.original=structuredClone(D.itens);D.periodo2=D.itens.some(i=>i.half===2);setDirty(false);render()}
function renderFeriados(){const area=$('feriados');area.replaceChildren();for(const d of D.feriados){const div=document.createElement('div');div.className='v41-rowitem';const txt=document.createElement('span');txt.textContent=d.data_aula.split('-').reverse().join('/')+' — '+d.motivo;const btn=document.createElement('button');btn.className='btn danger';btn.textContent='×';btn.onclick=async()=>{if(!confirm('Excluir dia não letivo?'))return;const {error}=await D.db.from('dias_nao_letivos').delete().eq('id',d.id);if(error)return msg(error.message);await loadData()};div.append(txt,btn);area.append(div)} }
async function save(){clear();if(!D.dirty)return msg('Não há alterações pendentes.','ok','status');if(!confirm('Salvar as alocações da pós no Supabase?'))return;
 const btn=$('save');btn.disabled=true;msg('Salvando no Supabase...','ok','status');try{const old=new Map(D.original.map(x=>[keyItem(x),x])),now=new Map(D.itens.map(x=>[keyItem(x),x]));const requests=[];
 for(const [k,x] of old)if(!now.has(k))requests.push({x,dates:[]});
 for(const [k,x] of now){const before=old.get(k);if(!before||JSON.stringify(before.dates)!==JSON.stringify(x.dates))requests.push({x,dates:x.dates})}
 for(const {x,dates} of requests){const r=await D.db.rpc('salvar_encontros_pos_web',{p_periodo:$('periodo').value,p_matriz:$('matriz').value,p_componente:x.componente,p_professor:x.professor,p_encontros:dates,p_modo:modoDia(x.day)});if(r.error)throw r.error;if(!r.data?.ok)throw Error('Banco não confirmou a gravação de '+subjectName(x.componente));
 if(r.data.alocacao_id){const q=await D.db.from('alocacoes').update({pos_turno:x.turno,pos_metade:x.half}).eq('id',r.data.alocacao_id);if(q.error)throw q.error;}
 else{const tr=await D.db.from('turmas').select('id').eq('periodo_id',$('periodo').value).eq('matriz_id',$('matriz').value);if(tr.error)throw tr.error;const ids=(tr.data||[]).map(t=>t.id);if(ids.length){const a=await D.db.from('alocacoes').update({pos_turno:x.turno,pos_metade:x.half}).in('turma_id',ids).eq('componente_id',x.componente).eq('professor_id',x.professor).eq('observacao',modoDia(x.day)==='sabado'?'POS_WEB_SABADO':'POS_WEB_SEMANA');if(a.error)throw a.error;}}
 }
 await loadData();$('success-message').textContent=`${requests.length} alocação(ões) atualizada(s) e confirmada(s).`;$('success-modal').classList.remove('hidden');msg('Planejamento salvo no Supabase.','ok','status');
 }catch(e){msg('Erro ao salvar: '+e.message+'. Se alguma parte foi gravada, recarregue para reconciliar antes de tentar novamente.','error','status')}finally{btn.disabled=false}}
async function boot(){if(!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY||!window.supabase){msg('Configure config.js e verifique a conexão com a biblioteca Supabase.');return;}D.db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
 const {data:{user}}=await D.db.auth.getUser();if(!user){$('loading').classList.add('hidden');$('login').classList.remove('hidden');return;}const adm=await D.db.from('administradores').select('usuario_id').eq('usuario_id',user.id).maybeSingle();if(adm.error||!adm.data){$('loading').classList.add('hidden');$('login').classList.remove('hidden');return msg('Usuário sem autorização administrativa.')}
 $('loading').classList.add('hidden');$('app').classList.remove('hidden');$('logout').classList.remove('hidden');
 const [p,m]=await Promise.all([D.db.from('periodos_letivos').select('id,ano,semestre,data_inicio,data_fim').order('ano',{ascending:false}),D.db.from('matrizes_curriculares').select('id,nome,cursos(nome,nivel)')]);if(p.error||m.error)throw p.error||m.error;D.periodos=p.data||[];D.matrizes=(m.data||[]).filter(x=>x.cursos?.nivel==='pos'||x.cursos?.nivel==='pos_graduacao'||/MBA|p[oó]s|Especializa/i.test(x.cursos?.nome||''));
 $('periodo').replaceChildren(...D.periodos.map(x=>option(x.id,`${x.ano}/${x.semestre}`)));$('matriz').replaceChildren(...D.matrizes.map(x=>option(x.id,`${x.cursos?.nome} — ${x.nome}`)));
 if(!D.periodos.length||!D.matrizes.length)msg('Cadastre ao menos um período letivo e uma matriz de pós.');else await loadData();}
$('login-form').onsubmit=async e=>{e.preventDefault();const r=await D.db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(r.error)return msg(r.error.message);await boot()};
$('logout').onclick=async()=>{await D.db.auth.signOut();location.href='./index.html'};
$('periodo').onchange=()=>{if(D.dirty&&!confirm('Descartar alterações não salvas?'))return;loadData().catch(e=>msg(e.message))};
$('matriz').onchange=()=>{if(D.dirty&&!confirm('Descartar alterações não salvas?'))return;loadData().catch(e=>msg(e.message))};
$('tipo').onchange=render;$('modo-semana').onclick=()=>selecionarModo('semana');$('modo-sabado').onclick=()=>selecionarModo('sabado');$('add-periodo').onclick=()=>{D.periodo2=true;render()};$('close').onclick=$('cancel').onclick=()=>$('modal').classList.add('hidden');
$('apply').onclick=generate;$('remove').onclick=()=>{if(!D.editando)return;if(!confirm('Remover TODOS os encontros desta matéria? A exclusão será enviada ao banco somente ao salvar.'))return;D.itens=D.itens.filter(x=>x!==D.editando);D.editando=null;setDirty(true);$('modal').classList.add('hidden');render()};
$('save').onclick=save;$('reload').onclick=()=>{if(D.dirty&&!confirm('Descartar alterações não salvas?'))return;loadData().catch(e=>msg(e.message))};
$('success-close').onclick=()=>$('success-modal').classList.add('hidden');
$('feriado-add').onclick=async()=>{const data=$('feriado-data').value,motivo=$('feriado-motivo').value.trim();if(!data||!motivo)return msg('Informe data e motivo.');if(D.dirty)return msg('Salve ou descarte o rascunho antes de alterar feriados.');const r=await D.db.from('dias_nao_letivos').insert({periodo_id:$('periodo').value,data_aula:data,motivo});if(r.error)return msg(r.error.message);await loadData();msg('Dia não letivo registrado.','ok')};
boot().catch(e=>{$('loading').classList.add('hidden');msg('Falha ao iniciar: '+e.message)});
