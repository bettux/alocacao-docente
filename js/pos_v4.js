// v4.0: Grade semestral, independente da ficha de cada disciplina.
let v4CalendarNonce=0;
let v4PopupTimer=null;
function v4ISO(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function v4Monday(dateText){const d=new Date(dateText+'T12:00:00'); d.setDate(d.getDate()-((d.getDay()+6)%7));return d;}
function v4AddDay(d,n){const next=new Date(d);next.setDate(next.getDate()+n);return next;}
function v4Pop(message){
 let m=document.getElementById('v4-saved-popup');
 if(!m){m=document.createElement('div');m.id='v4-saved-popup';m.className='v4-save-popup hidden';document.body.append(m);}
 m.replaceChildren();const panel=makeNode('div',undefined,'card');panel.append(makeNode('h2','✅ Confirmado pelo Supabase'),makeNode('p',message));
 const close=makeNode('button','Fechar','btn primary');close.onclick=()=>m.classList.add('hidden');panel.append(close);m.append(panel);m.classList.remove('hidden');
}
async function v4DrawCalendar(){
 const nonce=++v4CalendarNonce;
 const first=$('p-board-first'),second=$('p-board-second');if(!first||!second)return;
 const period=gPeriods.find(p=>p.id===$('p-periodo').value),matrix=$('p-matriz').value;
 first.replaceChildren();second.replaceChildren();
 if(!period?.data_inicio||!matrix){first.append(makeNode('p','Escolha o período letivo e o curso de pós.','muted'));return;}
 try{
  // Busca as atribuições de TODAS as matérias da pós, não apenas da matéria selecionada.
  const {data:turmas,error:te}=await db.from('turmas').select('id').eq('periodo_id',period.id).eq('matriz_id',matrix);
  if(te)throw te;
  const ids=(turmas||[]).map(x=>x.id);let allocations=[];
  if(ids.length){const {data,error}=await db.from('alocacoes').select('id,professor_id,componente_id,encontros_pos(data_aula,quantidade_aulas)').in('turma_id',ids).eq('observacao','POS_WEB_V1');if(error)throw error;allocations=data||[];}
  if(nonce!==v4CalendarNonce)return;
  const monday=v4Monday(period.data_inicio);
  const slots=new Map();
  for(const a of allocations)for(const e of a.encontros_pos||[]){
   const date=e.data_aula;const d=new Date(date+'T12:00:00');const isoDay=d.getDay()||7;if(isoDay===7)continue;
   const week=Math.round((v4Monday(date)-monday)/(86400000*7));if(week<0||week>=20)continue;
   const key=week+':'+isoDay;const values=slots.get(key)||[];
   values.push({date,qtd:Number(e.quantidade_aulas),teacher:teachers.find(t=>t.id===a.professor_id),subject:pComponentes.find(c=>c.id===a.componente_id),comp:a.componente_id,prof:a.professor_id});slots.set(key,values);
  }
  const build=(el,start,end)=>{
   const title=makeNode('div',`Período ${start===0?'1':'2'} · semanas ${start+1} a ${end}`,'v4-period-title');el.append(title);
   const table=makeNode('table',undefined,'v4-week-table v4-compact-week');
   const head=makeNode('tr');head.append(makeNode('th','Dia'),makeNode('th','Disciplina(s) · professor(es) · datas'));table.append(head);
   for(let day=1;day<=6;day++){
    const tr=makeNode('tr');tr.append(makeNode('th',['','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][day]));
    const cell=makeNode('td');const all=[];
    for(let week=start;week<end;week++)all.push(...(slots.get(week+':'+day)||[]));
    const grouped=new Map();
    for(const v of all){const key=v.comp+':'+v.prof;let group=grouped.get(key);if(!group){group={...v,dates:[],sum:0};grouped.set(key,group);}group.dates.push(v.date);group.sum+=v.qtd;}
    const values=[...grouped.values()].sort((a,b)=>a.dates[0].localeCompare(b.dates[0]));
    if(day===6){const note=makeNode('div','Sábado: manhã / tarde — até duas disciplinas (ou um módulo integral). O turno é ilustrativo.','v4-saturday-note');cell.append(note);}
    if(!values.length)cell.append(makeNode('span','Nenhuma matéria alocada','muted'));
    values.forEach((v,i)=>{
      const block=makeNode('div',undefined,'v4-slot');block.style.setProperty('--teacher-color',v.teacher?.cor_hex||'#2563eb');
      const btn=makeNode('button');btn.type='button';
      const prefix=day===6?(values.length===1?(v.sum/v.dates.length>4?'Integral':'Módulo'):(i===0?'Manhã*':'Tarde*')):'Módulo';
      btn.append(makeNode('strong',prefix+' · '+(v.subject?.nome||'Disciplina')),makeNode('small',`${v.teacher?.nome||'Docente'} · ${v.dates.length} encontro(s), ${v.sum} aula(s) · ${formataDataPos(v.dates[0])} a ${formataDataPos(v.dates[v.dates.length-1])}`));
      btn.onclick=async()=>{$('p-disciplina').value=v.comp;$('p-professor').value=v.prof;pRenderSubjects();await pOpen();$('p-details').open=true;};
      block.append(btn);cell.append(block);
    });
    const add=makeNode('button','+ Alocar matéria neste período','v4-click');add.onclick=()=>pOpenDialog(day,start);cell.append(add);
    tr.append(cell);table.append(tr);
   }
   el.append(table);
  };
  build(first,0,10);build(second,10,20);
 }catch(e){if(nonce!==v4CalendarNonce)return;first.append(makeNode('p','Erro ao carregar semestre: '+e.message,'notice error'));}
}
let v4SelectedHalf=0;
function pV4Init(){
 // Inicializa depois que os componentes e o Supabase estiverem prontos.
 if($('p-remove-all'))$('p-remove-all').onclick=async()=>{
  if(!pLoaded)return pMsg('Primeiro abra o planejamento da disciplina e do professor.');
  const nome=$('p-disciplina').selectedOptions[0]?.textContent||'disciplina';
  const prof=$('p-professor').selectedOptions[0]?.textContent||'professor';
  if(!confirm(`REMOVER TUDO?\n\nSerão excluídos TODOS os encontros de ${nome} atribuídos a ${prof} neste período.\n\nAs demais matérias e professores permanecerão inalterados.`))return;
  const before=[...pDraft];pDraft=[];pAlterado=true;pRender();
  const ok=await pSalvarEncontros();if(!ok){pDraft=before;pAlterado=true;pRender();return;}
  v4Pop('Todos os encontros dessa alocação foram removidos.');await v4DrawCalendar();
 };
 // Recarrega visão geral após alterações de matriz/período, sem sobrescrever a ficha selecionada.
 $('p-periodo').addEventListener('change',()=>setTimeout(v4DrawCalendar,0));
 $('p-matriz').addEventListener('change',()=>setTimeout(v4DrawCalendar,150));
 // Intercepta sucesso do salvamento usando a própria função (o sucesso já foi confirmado com SELECT).
 // Choosing week half updates suggested initial date for new allocations.
 const openOriginal=pOpenDialog;
 pOpenDialog=async function(day,half=0){
   v4SelectedHalf=half;
   await openOriginal(day);
   const period=gPeriods.find(p=>p.id===$('p-periodo').value);
   if(period?.data_inicio && !$('p-modal').classList.contains('hidden')){
     const first=v4AddDay(v4Monday(period.data_inicio),half*7);
     const offset=day-1;
     const proposed=v4ISO(v4AddDay(first,offset));
     $('p-start').value=proposed<period.data_inicio?period.data_inicio:proposed;
   }
 };
 const original=pSalvarEncontros;
 pSalvarEncontros=async function(){const wasDirty=pAlterado;const ok=await original();if(ok&&wasDirty){v4Pop('Encontros gravados e conferidos.');await v4DrawCalendar();}return ok;};
 setTimeout(v4DrawCalendar,150);
}
