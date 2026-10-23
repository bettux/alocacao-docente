// ---------- Grade semanal: rascunho local e salvamento atomico no Supabase ----------
let gPeriods=[],gMatrices=[],gTurma=null,gSubs=[],gComponents=[],gBlocks=[],gDirty=false,gChosen=null,gEditing=-1;
const days=['','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const timeSlots=['','18:25–19:15','19:15–20:05','20:20–21:10','21:10–22:00','22:00–22:50'];
const saturdaySlots=['','09:00–09:50','09:50–10:40','10:55–11:45','13:00–13:50','13:50–14:40','14:40–15:30','15:45–16:35','16:35–17:25'];
const isEad=c=>c && ['ead_sincrona','ead_assincrona'].includes(c.modalidade);
const maxSlot=day=>day===6?8:5;
function slotLabel(day,slot){return (day===6?saturdaySlots:timeSlots)[slot]||'';}
function validDayForComponent(c,day){return isEad(c)?day===6:day>=1&&day<=5;}
function gradeMsg(text,kind=''){flash(text,kind);}
function blockMessage(text){
 const el=$('b-feedback');
 el.textContent=text;
 el.className='notice error';
 el.classList.remove('hidden');
 el.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function clearBlockMessage(){
 const el=$('b-feedback');
 el.textContent='';
 el.className='notice error hidden';
}
function setTab(tab){$('prof-view').classList.toggle('hidden',tab!=='prof');$('grade-view').classList.toggle('hidden',tab!=='grade');$('carga-view').classList.toggle('hidden',tab!=='carga');$('ativ-view').classList.toggle('hidden',tab!=='ativ');$('pos-view').classList.toggle('hidden',tab!=='pos');$('tab-prof')?.classList.toggle('active',tab==='prof');$('tab-grade')?.classList.toggle('active',tab==='grade');$('tab-carga')?.classList.toggle('active',tab==='carga');$('tab-ativ')?.classList.toggle('active',tab==='ativ');$('tab-pos')?.classList.toggle('active',tab==='pos');if(tab==='carga'){initCargaSelectors(); if($('c-periodo').value)loadCarga();}if(tab==='ativ'){initActivitiesSelectors();if($('a-periodo').value)loadActivities();}if(tab==='pos')initPosSelectors();}
if($('tab-prof'))$('tab-prof').onclick=()=>setTab('prof');if($('tab-grade'))$('tab-grade').onclick=()=>setTab('grade');if($('tab-carga'))$('tab-carga').onclick=()=>setTab('carga');if($('tab-ativ'))$('tab-ativ').onclick=()=>setTab('ativ');if($('tab-pos'))$('tab-pos').onclick=()=>setTab('pos');
function selFill(el,arr,fn,empty='Selecione'){el.replaceChildren();el.add(new Option(empty,''));arr.forEach(x=>el.add(new Option(fn(x),x.id)));}
async function loadGradeSelectors(){let [p,m]=await Promise.all([db.from('periodos_letivos').select('*').order('ano',{ascending:false}),db.from('matrizes_curriculares').select('id,nome,cursos(nome,nivel)').order('nome')]);if(p.error||m.error)return fail(p.error||m.error);gPeriods=p.data||[];gMatrices=(m.data||[]).filter(x=>x.cursos?.nivel==='graduacao');selFill($('g-periodo'),gPeriods,x=>x.ano+'/'+x.semestre);selFill($('g-matriz'),gMatrices,x=>x.cursos.nome+' — '+x.nome);if(gPeriods.length)$('g-periodo').value=gPeriods[0].id;if(gMatrices.length)$('g-matriz').value=gMatrices.find(x=>x.cursos.nome.toLowerCase().includes('desenvolvimento de sistemas'))?.id||gMatrices[0].id;updateSemester();await loadTurmasGrade();}
function updateSemester(){const m=gMatrices.find(x=>x.id===$('g-matriz').value);const ss=[...new Set(subjects.filter(s=>s.matrizes_curriculares?.cursos?.nome===m?.cursos?.nome&&s.matrizes_curriculares?.nome===m?.nome&&s.semestre>0).map(s=>s.semestre))].sort((a,b)=>a-b);$('g-semestre').replaceChildren(...(ss.length?ss:[1,2,3,4,5,6]).map(x=>new Option(x+'º semestre',x)));}
async function loadTurmasGrade(){const sel=$('g-turma');if(!sel)return;const previous=sel.value;sel.replaceChildren(new Option('Turma principal (padrão)',''));const p=$('g-periodo').value,m=$('g-matriz').value,sem=Number($('g-semestre').value);if(!p||!m||!sem)return;const r=await db.from('turmas').select('id,identificacao').eq('periodo_id',p).eq('matriz_id',m).eq('semestre_curricular',sem).order('identificacao');if(r.error)return gradeMsg('Erro ao listar turmas: '+r.error.message,'error');for(const t of r.data||[])sel.add(new Option(t.identificacao,t.id));if([...sel.options].some(o=>o.value===previous))sel.value=previous;}
$('g-periodo').addEventListener('change',loadTurmasGrade);$('g-semestre').addEventListener('change',loadTurmasGrade);
$('g-matriz').onchange=()=>{updateSemester();loadTurmasGrade();};
$('g-create-period').onclick=async()=>{const ano=Number($('g-ano').value),semestre=Number($('g-sem').value),data_inicio=$('g-inicio').value,data_fim=$('g-fim').value;if(!data_inicio||!data_fim)return gradeMsg('Informe o início e o fim do período.','error');const {error}=await db.from('periodos_letivos').upsert({ano,semestre,data_inicio,data_fim},{onConflict:'ano,semestre'});if(error)return fail(error);await loadGradeSelectors();initCargaSelectors();initPosSelectors();gradeMsg('Período letivo cadastrado.','ok');};
async function openGrade(){if(gDirty&&!confirm('Descartar alterações não salvas?'))return;const periodo_id=$('g-periodo').value,matriz_id=$('g-matriz').value,semestre_curricular=Number($('g-semestre').value);if(!periodo_id||!matriz_id)return gradeMsg('Selecione período e matriz.','error');const turmaEscolhida=$('g-turma')?.value;let {data:ts,error:te}=await db.from('turmas').select('*').eq('periodo_id',periodo_id).eq('matriz_id',matriz_id).eq('semestre_curricular',semestre_curricular).eq('identificacao','Turma principal');if(turmaEscolhida){const escolhido=await db.from('turmas').select('*').eq('id',turmaEscolhida).eq('periodo_id',periodo_id).eq('matriz_id',matriz_id).eq('semestre_curricular',semestre_curricular).single();if(escolhido.error)return fail(escolhido.error);ts=[escolhido.data];te=null;}if(te)return fail(te);if(!ts.length){let r=await db.from('turmas').insert({periodo_id,matriz_id,semestre_curricular,identificacao:'Turma principal'}).select().single();if(r.error)return fail(r.error);gTurma=r.data;}else gTurma=ts[0];
 const {data:sub,error:se}=await db.from('subturmas').select('*').eq('turma_id',gTurma.id).order('nome');if(se)return fail(se);gSubs=sub||[];if(!gSubs.length){const r=await db.from('subturmas').insert({turma_id:gTurma.id,nome:'T1'}).select();if(r.error)return fail(r.error);gSubs=r.data;}
 const mdids=subjects.filter(s=>s.semestre===semestre_curricular&&gMatrices.find(m=>m.id===matriz_id)?.nome===s.matrizes_curriculares?.nome&&gMatrices.find(m=>m.id===matriz_id)?.cursos?.nome===s.matrizes_curriculares?.cursos?.nome).map(x=>x.id);
 if(!mdids.length)return gradeMsg('Não há disciplinas nesse semestre curricular.','error');const [cs,as]=await Promise.all([db.from('componentes_disciplina').select('id,nome,modalidade,carga_aulas,matriz_disciplina_id').in('matriz_disciplina_id',mdids),db.from('professor_disciplinas').select('professor_id,matriz_disciplina_id')]);if(cs.error||as.error)return fail(cs.error||as.error);gComponents=(cs.data||[]).filter(x=>['presencial','ead_sincrona','ead_assincrona'].includes(x.modalidade)).map(x=>({...x,professores:(as.data||[]).filter(a=>a.matriz_disciplina_id===x.matriz_disciplina_id).map(a=>a.professor_id)})).sort((a,b)=>a.nome.localeCompare(b.nome));
 const {data:alloc,error:ae}=await db.from('alocacoes').select('id,componente_id,blocos_grade(id,dia_semana,aula_inicio,quantidade_aulas,bloco_subturmas(subturma_id),bloco_professores(professor_id))').eq('turma_id',gTurma.id).eq('observacao','GRADE_WEB_V2');if(ae)return fail(ae);gBlocks=(alloc||[]).flatMap(a=>(a.blocos_grade||[]).map(b=>({componente_id:a.componente_id,dia:b.dia_semana,inicio:b.aula_inicio,quantidade:b.quantidade_aulas,subturmas:(b.bloco_subturmas||[]).map(x=>x.subturma_id),professores:(b.bloco_professores||[]).map(x=>x.professor_id)})));gDirty=false;$('g-editor').classList.remove('hidden');renderGrade();}
$('g-load').onclick=openGrade;$('g-reload').onclick=openGrade;
function comp(id){return gComponents.find(x=>x.id===id)}
function markDirty(){gDirty=true;$('grade-state').textContent='Alterações não salvas';}
function target(c){if(/projeto integrador|extens[aã]o/i.test(c.nome))return 2;return c.carga_aulas?Math.ceil(c.carga_aulas/20):0;}
function allocatedBySub(componentId,subId,excluding=-1){return gBlocks.reduce((sum,b,i)=>sum+(i!==excluding&&b.componente_id===componentId&&b.subturmas.includes(subId)?b.quantidade:0),0);}
function gradeLimitError(block,excluding=-1){const c=comp(block.componente_id);if(!c)return 'Disciplina inválida.';const limit=target(c);for(const subId of block.subturmas){const used=allocatedBySub(block.componente_id,subId,excluding);if(used+block.quantidade>limit){const sub=gSubs.find(s=>s.id===subId);return `${c.nome} — ${sub?.nome||'subturma'}: máximo de ${limit} aula(s) por semana. Já alocadas: ${used}; tentativa: +${block.quantidade}.`;}}return ''; }
function validateAllGradeLimits(){for(const c of gComponents){for(const sub of gSubs){const used=allocatedBySub(c.id,sub.id);if(used>target(c))return `${c.nome} — ${sub.nome}: ${used} aulas alocadas; máximo ${target(c)}.`;}}return ''; }
function renderGrade(){
 const pal=$('g-palette');pal.replaceChildren();let pending=0;
 for(const c of gComponents){
  const total=gSubs.reduce((sum,s)=>sum+allocatedBySub(c.id,s.id),0),required=target(c)*gSubs.length;
  const remaining=Math.max(0,required-total);if(remaining)pending++;
  const bySub=gSubs.map(s=>`${s.nome}: ${allocatedBySub(c.id,s.id)}/${target(c)}`).join(' · ');
  const item=makeNode('div',undefined,'palette-item');item.draggable=true;
  item.ondragstart=e=>{e.dataTransfer.setData('text/plain',c.id);gChosen=c.id;};
  item.onclick=()=>{gChosen=c.id;renderGrade();};
  if(gChosen===c.id)item.style.border='2px solid #186ac6';
  item.append(makeNode('strong',c.nome+(isEad(c)?' · EAD':'')),makeNode('small',`${c.carga_aulas??'?'} aulas semestrais · alvo ${target(c)}/semana por subturma`),makeNode('small',`${remaining?remaining+' pendentes':'Completo'} · ${bySub}`));pal.append(item);
 }
 $('g-pending').textContent=pending+' pendentes';const body=$('g-tables');body.replaceChildren();
 for(const sub of gSubs){
  const card=makeNode('section',undefined,'card section-turma');
  const headSub=makeNode('div',undefined,'subturma-head');headSub.append(makeNode('h2',sub.nome));
  if(sub.nome!=='T1' && gSubs.length>1){
   const remove=makeNode('button','Remover subturma','btn danger');remove.type='button';
   remove.title='Remove apenas a subturma sem aulas alocadas';
   remove.onclick=()=>removeSubturma(sub);
   headSub.append(remove);
  }
  card.append(headSub);
  const wrap=makeNode('div',undefined,'grid-overflow');const table=makeNode('table',undefined,'week-grid');
  const head=document.createElement('tr');head.append(makeNode('th','Aula'));
  for(let d=1;d<=6;d++)head.append(makeNode('th',days[d]));table.append(head);
  // Linhas independentes: cada aula do bloco recebe sua faixa visual, não só a primeira.
  for(let slot=1;slot<=8;slot++){
   const tr=document.createElement('tr');tr.append(makeNode('th',String(slot)+'ª'));
   for(let day=1;day<=6;day++){
    const td=document.createElement('td');
    if(slot>maxSlot(day)){td.className='grade-unavailable';tr.append(td);continue;}
    td.title=days[day]+' · '+slotLabel(day,slot);
    td.ondragover=e=>e.preventDefault();
    td.ondrop=e=>{e.preventDefault();openBlock(day,slot,sub.id,e.dataTransfer.getData('text/plain'));};
    td.onclick=()=>openBlock(day,slot,sub.id,gChosen);
    const rowLabel=makeNode('span',slotLabel(day,slot),'cell-time');td.append(rowLabel);
    for(const [i,b] of gBlocks.entries()){
     if(b.dia!==day||!b.subturmas.includes(sub.id)||slot<b.inicio||slot>=b.inicio+b.quantidade)continue;
     const c=comp(b.componente_id),doc=b.professores.map(id=>teachers.find(t=>t.id===id)).filter(Boolean);
     const el=makeNode('div',undefined,'lesson lesson-segment');
     const bgcolor=doc[0]?.cor_hex|| (isEad(c)?'#8a7ea8':'#186ac6');el.style.borderLeftColor=bgcolor;
     if(slot===b.inicio){
      el.classList.add('lesson-start');el.append(makeNode('b',c?.nome||'Disciplina'));
      el.append(makeNode('small',`${b.quantidade} aula(s) • ${doc.length?doc.map(t=>t.nome).join(' + '):'Sem professor'}`));
      if(b.subturmas.length>1)el.append(makeNode('span','Conjunta: '+b.subturmas.map(id=>gSubs.find(s=>s.id===id)?.nome).join('/'),'tag'));
     } else {el.classList.add('lesson-follow');el.append(makeNode('small',`↳ ${slot-b.inicio+1}ª de ${b.quantidade} aulas · ${c?.nome||''}`));}
     el.onclick=e=>{e.stopPropagation();openBlock(day,slot,sub.id,b.componente_id,i)};
     td.append(el);td.classList.add('grade-occupied');
    }
    tr.append(td);
   }
   table.append(tr);
  }
  wrap.append(table);card.append(wrap);body.append(card);
 }
 $('grade-state').textContent=gDirty?'Alterações não salvas':'Salvo / sem alterações';
}
async function removeSubturma(sub){
 if(!gTurma)return;
 if(sub.nome==='T1'||gSubs.length<=1){gradeMsg('A turma precisa manter a subturma T1.','error');return;}
 if(gDirty){gradeMsg('Salve ou recarregue as alterações pendentes antes de remover uma subturma.','error');return;}
 if(gBlocks.some(b=>b.subturmas.includes(sub.id))){
  gradeMsg(`A subturma ${sub.nome} possui aulas. Remova os blocos dessa subturma e salve a grade antes de excluí-la.`, 'error');return;
 }
 if(!confirm(`Remover a subturma ${sub.nome}? Esta ação não pode ser desfeita.`))return;
 const {data,error}=await db.from('subturmas').delete().eq('id',sub.id).eq('turma_id',gTurma.id).select('id');
 if(error)return gradeMsg('Não foi possível remover a subturma: '+error.message,'error');
 if(!data?.length)return gradeMsg('A subturma não foi removida. Verifique as permissões ou os vínculos existentes.','error');
 gSubs=gSubs.filter(s=>s.id!==sub.id);renderGrade();gradeMsg(`Subturma ${sub.nome} removida.`, 'ok');
}
$('g-add-sub').onclick=async()=>{if(!gTurma)return;const numero=1+Math.max(0,...gSubs.map(s=>Number(s.nome.match(/^T(\d+)$/)?.[1]||0)));const nome=prompt('Nome da nova subturma:',`T${numero}`)?.trim();if(!nome)return;const {data,error}=await db.from('subturmas').insert({turma_id:gTurma.id,nome}).select().single();if(error)return fail(error);gSubs.push(data);renderGrade();gradeMsg('Subturma criada. Ela será incluída na próxima gravação de blocos.','ok');};
function refreshBlockSlots(){
 const day=Number($('b-dia').value)||1,oldStart=$('b-inicio').value,oldQty=$('b-qty').value;
 $('b-inicio').replaceChildren(...Array.from({length:maxSlot(day)},(_,i)=>new Option(`${i+1}ª — ${slotLabel(day,i+1)}`,i+1)));
 $('b-inicio').value=oldStart&&Number(oldStart)<=maxSlot(day)?oldStart:'1';
 $('b-qty').replaceChildren(...Array.from({length:maxSlot(day)},(_,i)=>new Option(`${i+1} aula(s)`,i+1)));
 $('b-qty').value=oldQty&&Number(oldQty)<=maxSlot(day)?oldQty:'1';
}
function openBlock(dia,inicio,subId,componentId,edit=-1){
 clearBlockMessage();$('b-prof-search').value='';gEditing=edit;
 const b=edit>=0?gBlocks[edit]:null;
 selFill($('b-component'),gComponents,x=>x.nome+(isEad(x)?' [EAD]':''));
 $('b-component').value=b?.componente_id||componentId||gComponents[0]?.id||'';
 $('b-dia').replaceChildren(...days.slice(1).map((d,i)=>new Option(d,i+1)));
 const c=comp($('b-component').value);
 $('b-dia').value=b?.dia||(c&&isEad(c)?6:dia);
 refreshBlockSlots();
 $('b-inicio').value=b?.inicio||Math.min(inicio,maxSlot(Number($('b-dia').value)));
 $('b-qty').value=b?.quantidade||1;
 $('b-delete').classList.toggle('hidden',edit<0);
 fillChecks(b?.subturmas||[subId],b?.professores||[]);
 $('g-modal').classList.remove('hidden');
}
function fillChecks(subSelected,profSelected){
 const subs=$('b-subs');subs.replaceChildren();
 for(const sub of gSubs){const label=makeNode('label');const cb=makeNode('input');cb.type='checkbox';cb.value=sub.id;cb.checked=subSelected.includes(sub.id);label.append(cb,document.createTextNode(' '+sub.nome));subs.append(label);}
 // Escolha livre de docentes ativos, mesmo sem associação prévia à disciplina.
 const area=$('b-profs');area.replaceChildren();
 window.__selectedGradeTeachers = new Set(profSelected);
 const filter=$('b-prof-search').value.trim().toLocaleLowerCase('pt-BR');
 const active=teachers.filter(t=>t.ativo).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
 const eligible=new Set(comp($('b-component').value)?.professores||[]);
 const shown=active.filter(t=>t.nome.toLocaleLowerCase('pt-BR').includes(filter)||profSelected.includes(t.id));
 for(const t of shown){
   const label=makeNode('label');label.style.cssText='display:flex;gap:7px;align-items:center;border:1px solid #d5dfed;border-radius:7px;padding:7px 9px;background:#fff';
   const cb=makeNode('input');cb.type='checkbox';cb.value=t.id;cb.checked=profSelected.includes(t.id);cb.onchange=()=>{if(cb.checked)window.__selectedGradeTeachers.add(t.id);else window.__selectedGradeTeachers.delete(t.id);};
   const dot=makeNode('span','●');dot.style.color=t.cor_hex;dot.style.fontSize='17px';
   const desc=makeNode('span',t.nome+(eligible.has(t.id)?' · já associado':''));
   label.append(cb,dot,desc);area.append(label);
 }
 if(!active.length)area.append(makeNode('span','Nenhum professor ativo cadastrado. Cadastre um na aba Professores.','pending'));
 else if(!shown.length)area.append(makeNode('span','Nenhum professor encontrado.','muted'));
}
function selectedBlockTeachers(){return [...(window.__selectedGradeTeachers||new Set())]}
$('b-component').onchange=()=>{if(isEad(comp($('b-component').value))){$('b-dia').value='6';}else if($('b-dia').value==='6')$('b-dia').value='1';refreshBlockSlots();fillChecks([...$('b-subs').querySelectorAll('input:checked')].map(x=>x.value),selectedBlockTeachers());};
$('b-dia').onchange=refreshBlockSlots;
$('b-prof-search').oninput=()=>fillChecks([...$('b-subs').querySelectorAll('input:checked')].map(x=>x.value),selectedBlockTeachers());
$('g-block-form').addEventListener('change',clearBlockMessage);
$('b-cancel').onclick=()=>{$('g-modal').classList.add('hidden');clearBlockMessage();};$('b-delete').onclick=()=>{gBlocks.splice(gEditing,1);markDirty();$('g-modal').classList.add('hidden');renderGrade();};
$('g-block-form').onsubmit=e=>{e.preventDefault();const obj={componente_id:$('b-component').value,dia:Number($('b-dia').value),inicio:Number($('b-inicio').value),quantidade:Number($('b-qty').value),subturmas:[...$('b-subs').querySelectorAll('input:checked')].map(x=>x.value),professores:selectedBlockTeachers()};if(!obj.subturmas.length)return blockMessage('Selecione pelo menos uma subturma.');if(!isEad(comp(obj.componente_id))&&!obj.professores.length)return blockMessage('Selecione pelo menos um professor para a aula presencial.');if(!validDayForComponent(comp(obj.componente_id),obj.dia))return blockMessage('Disciplinas EAD devem ficar no sábado; presenciais, de segunda a sexta.');if(obj.inicio+obj.quantidade>maxSlot(obj.dia)+1)return blockMessage(`O bloco ultrapassa a ${maxSlot(obj.dia)}ª aula de ${days[obj.dia]}.`);const limitError=gradeLimitError(obj,gEditing);if(limitError)return blockMessage(limitError);if(gBlocks.some((b,i)=>i!==gEditing&&b.dia===obj.dia&&b.inicio<obj.inicio+obj.quantidade&&obj.inicio<b.inicio+b.quantidade&&(b.subturmas.some(x=>obj.subturmas.includes(x))||b.professores.some(x=>obj.professores.includes(x)))))return blockMessage('Conflito na grade: horário ocupado pela subturma ou professor.');if(gEditing<0)gBlocks.push(obj);else gBlocks[gEditing]=obj;markDirty();$('g-modal').classList.add('hidden');renderGrade();};
$('g-save').onclick=async()=>{if(!gTurma)return;const limitError=validateAllGradeLimits();if(limitError)return gradeMsg(limitError,'error');const btn=$('g-save');btn.disabled=true;const {data,error}=await db.rpc('salvar_grade_web',{p_turma:gTurma.id,p_blocos:gBlocks});btn.disabled=false;if(error)return fail(error);gDirty=false;renderGrade();gradeMsg(`${data} blocos salvos no Supabase.`,`ok`);};
window.addEventListener('beforeunload',e=>{if(gDirty){e.preventDefault();e.returnValue='';}});

