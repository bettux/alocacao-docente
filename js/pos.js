// ---------- v3.9: Planejamento dos encontros de pós ----------
let pMatrizes=[],pComponentes=[],pTurma=null,pAlocacao=null,pDraft=[],pLoaded=false,pAlterado=false,pOffDays=[],pRegularDays=new Set();
const pMsg=(message,kind='error')=>{for(const id of ['p-feedback','p-main-feedback']){const el=$(id);if(!el)continue;el.textContent=message;el.className='notice '+kind;}if(kind==='error')console.error('[Pós-graduação]',message);};
const pClear=()=>{for(const id of ['p-feedback','p-main-feedback']){const el=$(id);if(el)el.classList.add('hidden');}};

function initPosSelectors(){
 const periodo=$('p-periodo'),prev=periodo.value;
 periodo.replaceChildren(...gPeriods.map(p=>new Option(`${p.ano}/${p.semestre}`,p.id)));
 if(gPeriods.some(p=>p.id===prev))periodo.value=prev;
 else if($('g-periodo').value)periodo.value=$('g-periodo').value;
 if(periodo.value)pLoadOffDays();
 db.from('matrizes_curriculares').select('id,nome,cursos(nome,nivel)').then(({data,error})=>{
  if(error)return fail(error);
  pMatrizes=(data||[]).filter(m=>m.cursos?.nivel==='pos_graduacao'||m.cursos?.nivel==='pos');
  // fallback: no banco podem existir diferentes descrições de nível
  if(!pMatrizes.length)pMatrizes=(data||[]).filter(m=>/p[oó]s|mba|especializa/i.test(m.cursos?.nome||''));
  const old=$('p-matriz').value;
  selFill($('p-matriz'),pMatrizes,m=>m.cursos.nome+' — '+m.nome,'Selecione a pós');
  if(pMatrizes.some(m=>m.id===old))$('p-matriz').value=old;
  loadPosDisciplinas();
 });
 $('p-professor').replaceChildren(...teachers.filter(p=>p.ativo).map(p=>new Option(p.nome,p.id)));
}
async function loadPosDisciplinas(){
 const matriz=$('p-matriz').value;
 $('p-disciplina').replaceChildren();pComponentes=[];
 if(!matriz)return;
 const {data:md,error}=await db.from('matriz_disciplinas').select('id').eq('matriz_id',matriz);
 if(error)return pMsg(error.message);
 if(!md.length)return;
 const r=await db.from('componentes_disciplina').select('id,nome,modalidade,carga_aulas,matriz_disciplina_id').in('matriz_disciplina_id',md.map(x=>x.id)).eq('modalidade','pos').order('nome');
 if(r.error)return pMsg(r.error.message);
 pComponentes=r.data||[];
 $('p-disciplina').replaceChildren(...pComponentes.map(c=>new Option(`${c.nome} (${c.carga_aulas} h)`,c.id)));
 pLoaded=false;pDraft=[];pRenderSubjects();pRender();if(typeof v4DrawCalendar==='function')v4DrawCalendar();
}
$('p-matriz').onchange=loadPosDisciplinas;
const pContext=()=>({periodo:$('p-periodo').value,matriz:$('p-matriz').value,componente:$('p-disciplina').value,professor:$('p-professor').value});
let pSelectedDay=1;
function pRenderSubjects(){
 const el=$('p-subject-list');el.replaceChildren();
 if(!pComponentes.length){el.append(makeNode('p','Nenhuma unidade curricular encontrada.','muted'));return;}
 for(const c of pComponentes){
  const tile=makeNode('button',undefined,'p-subject-tile'+(c.id===$('p-disciplina').value?' selected':''));
  tile.type='button';tile.append(makeNode('strong',c.nome),makeNode('small',`${c.carga_aulas||30} horas por módulo`));
  tile.onclick=()=>{if(pAlterado&&!confirm('Descartar alterações não salvas da matéria anterior?'))return;
    $('p-disciplina').value=c.id;pLoaded=false;pAlterado=false;pDraft=[];pRenderSubjects();pRender();$('p-state').textContent='Matéria selecionada';};
  el.append(tile);
 }
}
function pFirstWeekday(day){
 const period=gPeriods.find(p=>p.id===$('p-periodo').value);if(!period?.data_inicio)return '';
 const d=new Date(period.data_inicio+'T12:00:00');
 for(let i=0;i<7;i++){if((d.getDay()||7)===day)break;d.setDate(d.getDate()+1);}
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
async function pOpenDialog(day){
 if(!$('p-disciplina').value)return pMsg('Selecione primeiro uma matéria na coluna esquerda.');
 pSelectedDay=day;$('p-modal').classList.remove('hidden');pClear();
 const comp=pComponentes.find(c=>c.id===$('p-disciplina').value);
 $('p-modal-subject').textContent=`${comp?.nome||''} • ${['','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][day]}`;
 $('p-start').value=pFirstWeekday(day);
 $('p-auto-total').value=String(comp?.carga_aulas||30);
 if(!$('p-professor').value){pMsg('Cadastre um professor ativo antes de planejar a pós.');return;}
 await pOpen();
}
$('p-modal-close').onclick=()=>{$('p-modal').classList.add('hidden');};
$('p-modal-done').onclick=()=>{$('p-modal').classList.add('hidden');};
$('p-professor').onchange=()=>{if(!$('p-modal').classList.contains('hidden'))pOpen();};
$('p-periodo').onchange=()=>{pLoaded=false;pDraft=[];pRender();pLoadOffDays();};

async function pOpen(){
 if(pAlterado&&!confirm('Descartar encontros não salvos?'))return;
 pClear();const {periodo,matriz,componente,professor}=pContext();
 if(!periodo||!matriz||!componente||!professor)return pMsg('Selecione período, pós-graduação, disciplina e professor.');
 $('p-state').textContent='Carregando...';
 try{
  const {data:ts,error:te}=await db.from('turmas').select('id').eq('periodo_id',periodo).eq('matriz_id',matriz).eq('semestre_curricular',1).eq('identificacao','Pos - turma principal');
  if(te)throw te;
  if(ts.length)pTurma=ts[0];
  else {const r=await db.from('turmas').insert({periodo_id:periodo,matriz_id:matriz,semestre_curricular:1,identificacao:'Pos - turma principal'}).select('id').single();if(r.error)throw r.error;pTurma=r.data;}
  const {data:al,error:ae}=await db.from('alocacoes').select('id,encontros_pos(id,data_aula,quantidade_aulas)').eq('turma_id',pTurma.id).eq('componente_id',componente).eq('professor_id',professor).eq('observacao','POS_WEB_V1');
  if(ae)throw ae;
  pAlocacao=al[0]?.id||null;
  pDraft=(al[0]?.encontros_pos||[]).map(e=>({data:e.data_aula,qtd:e.quantidade_aulas})).sort((a,b)=>a.data.localeCompare(b.data));
  // Consulta toda a graduacao do periodo: inclui docentes vinculados por bloco.
  const {data:grTurmas,error:grErr}=await db.from('turmas').select('id').eq('periodo_id',periodo);
  if(grErr)throw grErr;
  pRegularDays=new Set();
  const ids=(grTurmas||[]).map(t=>t.id);
  if(ids.length){
   const {data:allocs,error:regErr}=await db.from('alocacoes')
     .select('professor_id,blocos_grade(dia_semana,bloco_professores(professor_id))')
     .in('turma_id',ids);
   if(regErr)throw regErr;
   for(const a of allocs||[])for(const b of a.blocos_grade||[]){
     if(a.professor_id===professor||(b.bloco_professores||[]).some(x=>x.professor_id===professor))
      pRegularDays.add(Number(b.dia_semana));
   }
  }
  pLoaded=true;pAlterado=false;await pLoadOffDays();pRender();$('p-state').textContent=`${pDraft.length} encontro(s) carregados do Supabase`;
 }catch(e){pMsg(e.message);$('p-state').textContent='Falha ao abrir';}
}
// Ao remover um encontro, preserva a carga deslocando as aulas para uma semana futura.
// O calendário não é salvo automaticamente: é preciso confirmar em “Salvar encontros”.
function pReporEncontro(index){
 const removido=pDraft[index];if(!removido)return;
 const periodo=gPeriods.find(p=>p.id===$('p-periodo').value);
 if(!periodo)return pMsg('Período letivo não encontrado.');
 const atual=pDraft.filter((_,i)=>i!==index);
 const usadas=new Set(atual.map(e=>e.data));
 const bloqueadas=new Set(pOffDays.map(e=>e.data_aula));
 // Usa o mesmo dia da semana do encontro removido, após o último encontro do módulo.
 const ultimo=atual.length?atual[atual.length-1].data:removido.data;
 let data=localDayISO(ultimo);let nova=null;
 for(let i=0;i<60&&data<=periodo.data_fim;i++,data=localDayISO(data)){
   if(!usadas.has(data)&&!bloqueadas.has(data)&&data!==removido.data&&!pRegularDays.has(new Date(data+'T12:00:00').getDay()||7)){nova=data;break;}
 }
 if(!nova){pMsg(`Não foi possível remover ${formataDataPos(removido.data)}: nenhuma semana futura letiva disponível até ${formataDataPos(periodo.data_fim)}. Nenhuma alteração foi feita.`);return;}
 pDraft=[...atual,{data:nova,qtd:removido.qtd}].sort((a,b)=>a.data.localeCompare(b.data));
 pAlterado=true;pRender();pMsg(`Encontro de ${formataDataPos(removido.data)} transferido para ${formataDataPos(nova)} (${removido.qtd} aula(s)). Clique em Salvar encontros para confirmar.`);
}
function formataDataPos(iso){return iso?iso.split('-').reverse().join('/'): '—';}
function pRender(){
 const list=$('p-list');list.replaceChildren();const total=pDraft.reduce((sum,e)=>sum+Number(e.qtd),0);
 const sorted=[...pDraft].sort((a,b)=>a.data.localeCompare(b.data));
 const nome=$('p-disciplina').selectedOptions[0]?.textContent||'Disciplina';
 const professor=$('p-professor').selectedOptions[0]?.textContent||'Professor';
 $('p-mod-info').textContent=`${nome} • ${professor}`;
 $('p-list-context').textContent=`${nome} — ${professor}. A exclusão remaneja o encontro para a próxima data letiva semanal disponível.`;
 $('p-count').textContent=`${total}/30 horas`;
 $('p-first').textContent=formataDataPos(sorted[0]?.data);
 $('p-last').textContent=formataDataPos(sorted[sorted.length-1]?.data);
 $('p-nights').textContent=String(sorted.length);
 $('p-summary-count').textContent=`(${sorted.length})`;
 // Quadro semelhante a grade regular: linhas de aulas e dias da semana.
 // Os horarios da pos ainda nao sao armazenados; posicoes sao ilustrativas,
 // especialmente aos sabados quando dois modulos podem dividir o dia.
 const board=$('p-week-board');board.replaceChildren();
 const table=makeNode('table',undefined,'week-grid p-pos-grid');
 const header=makeNode('tr');header.append(makeNode('th','Aula'));
 ['Seg','Ter','Qua','Qui','Sex','Sab'].forEach((d,i)=>{const th=makeNode('th',d+' ▾');th.className='p-day-head';th.onclick=()=>pOpenDialog(i+1);header.append(th);});table.append(header);
 const maxByDay=new Map();const counts=new Map();
 for(const e of sorted){
  const day=new Date(e.data+'T12:00:00').getDay()||7;
  maxByDay.set(day,Math.max(maxByDay.get(day)||0,Number(e.qtd)));
  counts.set(day,(counts.get(day)||0)+1);
 }
 const cor=teachers.find(t=>t.id===$('p-professor').value)?.cor_hex||'#2563eb';
 for(let slot=1;slot<=8;slot++){
  const row=makeNode('tr');row.append(makeNode('th',slot+'ª'));
  for(let day=1;day<=6;day++){
   const td=makeNode('td');td.className='p-pos-cell';td.title='Clique para planejar encontros neste dia';td.onclick=()=>pOpenDialog(day);
   const active=slot<=Math.min(maxByDay.get(day)||0,4);
   if(day!==6&&slot>4){td.classList.add('grade-unavailable');}
   else if(active){
    const block=makeNode('div',undefined,'lesson lesson-segment p-pos-lesson');
    block.style.borderLeftColor=cor;
    if(slot===1){block.append(makeNode('b',nome),makeNode('small',professor));}
    else block.append(makeNode('small','Continuação'));
    td.append(block);
   } else if(day===6&&slot>4){
    td.append(makeNode('span','Outro módulo / livre','muted p-slot-hint'));
   }
   row.append(td);
  }
  table.append(row);
 }
 board.append(table);
 const breakdown=[...counts.entries()].map(([d,n])=>`${days[d]}: ${n} encontro(s)`).join(' · ');
 $('p-grid-context').textContent=(breakdown||'Nenhum encontro planejado')+
 ' • posições ilustrativas; datas reais em “Ver encontros”.';
 if(!sorted.length)list.append(makeNode('p','Nenhum encontro cadastrado.','muted'));
 sorted.forEach(e=>{
  const row=makeNode('div',undefined,'p-compact-row');
  const info=makeNode('div',undefined,'person-info');info.append(makeNode('strong',formataDataPos(e.data)),makeNode('small',`${e.qtd} aula(s) de 60 min • ${professor} • ${nome}`));
  const btn=makeNode('button','Excluir e repor','btn danger');btn.type='button';btn.onclick=()=>{
   const i=pDraft.findIndex(x=>x.data===e.data);if(i>=0)pReporEncontro(i);
  };
  row.append(info,btn);list.append(row);
 });
 const eq=Math.ceil(total*60/50);
 $('p-math').textContent=`${total} hora(s) de pós planejadas (${eq} aulas equivalentes de 50 min no módulo). A carga SEMANAL e os 20% são calculados na aba Carga docente, conforme a semana selecionada.`;
 $('p-save').disabled=!pLoaded||!pAlterado||total>30;
}
$('p-load').onclick=pOpen;$('p-reload').onclick=pOpen;
$('p-add').onclick=()=>{
 pClear();if(!pLoaded)return pMsg('Clique em “Abrir planejamento” antes de inserir encontros.');
 const data=$('p-data').value,qtd=Number($('p-qty').value),periodo=gPeriods.find(p=>p.id===$('p-periodo').value);
 if(!data)return pMsg('Informe a data do encontro.');
 if(periodo&&(data<periodo.data_inicio||data>periodo.data_fim))return pMsg('Data fora do período letivo.');
 if(pOffDays.some(x=>x.data_aula===data))return pMsg('Data registrada como feriado ou dia não letivo.');
 if(pRegularDays.has(new Date(data+'T12:00:00').getDay()||7))return pMsg('Conflito: esse professor ja possui aula semanal na graduacao nesse dia da semana. Escolha outro dia ou outro professor.');
 if(pDraft.some(x=>x.data===data))return pMsg('Já existe um encontro nessa data para esta disciplina e professor.');
 if(qtd<1||qtd>((new Date(data+'T12:00:00').getDay()===6)?8:4))return pMsg('Dias úteis permitem até 4 aulas; sábados permitem até 8.');
 if(pDraft.reduce((s,x)=>s+x.qtd,0)+qtd>30)return pMsg('Essa disciplina não pode ultrapassar 30 horas.');
 pDraft.push({data,qtd});pDraft.sort((a,b)=>a.data.localeCompare(b.data));pAlterado=true;pRender();
};
async function pSalvarEncontros(){
 pClear();
 if(!pLoaded){pMsg('Abra o planejamento antes de salvar.');return false;}
 if(!pAlterado){pMsg('Nenhuma alteração pendente. Os encontros já salvos podem ser conferidos na lista.','ok');return true;}
 const ctx=pContext();
 const component=pComponentes.find(c=>c.id===ctx.componente);
 if(!component||!ctx.professor||!ctx.periodo){pMsg('Selecione uma disciplina, professor e período válidos.');return false;}
 const desejados=pDraft.map(e=>({data:e.data,quantidade:Number(e.qtd)}));
 const btn=$('p-save'),gerar=$('p-generate');
 btn.disabled=true;gerar.disabled=true;
 $('p-state').textContent='Salvando no Supabase...';
 try{
  const {data,error}=await db.rpc('salvar_encontros_pos_web',{
   p_periodo:ctx.periodo,p_matriz:ctx.matriz,p_componente:ctx.componente,
   p_professor:ctx.professor,p_encontros:desejados
  });
  if(error)throw error;
  if(!data?.ok)throw new Error('O banco não confirmou o salvamento.');
  // Confirma no próprio banco, com um SELECT novo; não trata o rascunho como salvo.
  const {data:turmas,error:terr}=await db.from('turmas').select('id')
    .eq('periodo_id',ctx.periodo).eq('matriz_id',ctx.matriz)
    .eq('semestre_curricular',1).eq('identificacao','Pos - turma principal');
  if(terr)throw terr;
  const ids=(turmas||[]).map(t=>t.id);
  if(!ids.length)throw new Error('Nenhuma turma da pós foi encontrada após o salvamento.');
  const {data:aloc,error:aerr}=await db.from('alocacoes')
    .select('id,encontros_pos(data_aula,quantidade_aulas)')
    .in('turma_id',ids).eq('componente_id',ctx.componente)
    .eq('professor_id',ctx.professor).eq('observacao','POS_WEB_V1');
  if(aerr)throw aerr;
  const encontrados=(aloc||[]).flatMap(a=>a.encontros_pos||[])
   .map(e=>({data:e.data_aula,quantidade:Number(e.quantidade_aulas)}))
   .sort((a,b)=>a.data.localeCompare(b.data));
  const esperado=[...desejados].sort((a,b)=>a.data.localeCompare(b.data));
  if(JSON.stringify(encontrados)!==JSON.stringify(esperado)){
   throw new Error(`O Supabase respondeu, mas a conferência encontrou ${encontrados.length} encontros em vez dos ${esperado.length} esperados. Atualize e verifique a situação antes de tentar novamente.`);
  }
  pDraft=encontrados.map(e=>({data:e.data,qtd:e.quantidade}));
  pAlocacao=aloc?.[0]?.id||null;
  pAlterado=false;pLoaded=true;
  pRender();
  $('p-state').textContent=`${encontrados.length} encontro(s) salvos e conferidos`;
  pMsg(`${encontrados.length} encontro(s) gravados e conferidos no Supabase. As datas permanecem após recarregar.`, 'ok');
  if(encontrados[0])$('c-semana').value=encontrados[0].data;
  if($('c-periodo').value===ctx.periodo)await loadCarga();
  return true;
 }catch(e){
  $('p-state').textContent='Não salvo — verifique o erro';
  pMsg('O planejamento NÃO foi salvo: '+(e.message||String(e)));
  return false;
 }finally{gerar.disabled=false;pRender();}
}
$('p-save').onclick=()=>pSalvarEncontros();
// Feriados e dias não letivos: calendário por período, protegido por RLS.
async function pLoadOffDays(){
 const periodo=$('p-periodo').value;
 const {data,error}=await db.from('dias_nao_letivos').select('id,data_aula,motivo').eq('periodo_id',periodo).order('data_aula');
 if(error){pMsg('Não foi possível consultar os dias não letivos: '+error.message);return;}
 pOffDays=data||[];pRenderOffDays();
}
function pRenderOffDays(){
 const target=$('p-off-list');target.replaceChildren();
 for(const off of pOffDays){
  const line=makeNode('div',undefined,'person');
  const info=makeNode('div',undefined,'person-info');info.append(makeNode('strong',off.data_aula.split('-').reverse().join('/')),makeNode('small',off.motivo));
  const rm=makeNode('button','Excluir','btn danger');rm.onclick=async()=>{
   if(!confirm('Excluir este dia não letivo?'))return;
   const {error}=await db.from('dias_nao_letivos').delete().eq('id',off.id);
   if(error)return pMsg(error.message);await pLoadOffDays();
  };line.append(info,rm);target.append(line);
 }
 if(!pOffDays.length)target.append(makeNode('p','Nenhum dia não letivo cadastrado neste período.','muted'));
}
$('p-off-add').onclick=async()=>{
 pClear();const periodo=$('p-periodo').value,data=$('p-off-date').value,motivo=$('p-off-reason').value.trim();
 if(!periodo||!data||!motivo)return pMsg('Escolha o período, a data e o motivo.');
 const {error}=await db.from('dias_nao_letivos').insert({periodo_id:periodo,data_aula:data,motivo});
 if(error)return pMsg('Não foi possível registrar o dia não letivo: '+error.message);
 await pLoadOffDays();pMsg('Dia não letivo registrado. Refaça a geração automática se necessário.');
};
function localDayISO(value){const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+7);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
$('p-generate').onclick=async()=>{
 pClear();if(!pLoaded)return pMsg('Abra o planejamento antes de gerar encontros.');
 const inicio=$('p-start').value,porDia=Number($('p-auto-qtd').value),meta=Number($('p-auto-total').value),periodo=gPeriods.find(x=>x.id===$('p-periodo').value);
 if(!inicio||!periodo)return pMsg('Informe a data inicial e selecione o período letivo.');
 if(inicio<periodo.data_inicio||inicio>periodo.data_fim)return pMsg('Início fora do período letivo.');
 if(!Number.isInteger(meta)||meta<1||meta>30)return pMsg('Informe um total entre 1 e 30 aulas.');
 if(!Number.isInteger(porDia)||porDia<1||porDia>((new Date(inicio+'T12:00:00').getDay()===6)?8:4))return pMsg('Informe entre 1 e 4 aulas nos dias úteis ou até 8 aos sábados.');
 if(pDraft.length&&!confirm('Substituir os encontros ainda não salvos pelo planejamento automático?'))return;
 const bloqueadas=new Set(pOffDays.map(d=>d.data_aula));
 const novas=[];let cursor=inicio,saldo=meta;
 for(let passos=0;passos<60&&saldo>0&&cursor<=periodo.data_fim;passos++,cursor=localDayISO(cursor)){
  if(bloqueadas.has(cursor))continue;
  if(pRegularDays.has(new Date(cursor+'T12:00:00').getDay()||7))return pMsg('Nao e possivel gerar encontros: o professor ja ministra graduacao nesse dia da semana. Escolha outro dia ou docente.');
  const qtd=Math.min(porDia,saldo);novas.push({data:cursor,qtd});saldo-=qtd;
 }
 if(saldo>0)return pMsg(`Não há semanas letivas suficientes até ${periodo.data_fim}. Restam ${saldo} aulas sem data. Nenhuma alteração aplicada.`);
 pDraft=novas;pAlterado=true;pRender();
 pMsg(`Planejados ${novas.length} encontros (${meta} aulas). Salvando no Supabase...`,'ok');
 const confirmado=await pSalvarEncontros();
 if(confirmado)$('p-modal').classList.add('hidden');
};
// Exibe a contribuição semanal da pós sem misturar o total do semestre com a grade recorrente.
function cSemanaInicio(){const str=$('c-semana').value;if(!str)return null;const dt=new Date(str+'T12:00:00');dt.setDate(dt.getDate()-((dt.getDay()+6)%7));return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;}
function naSemanaCarga(iso){const inicio=cSemanaInicio();if(!inicio)return false;const d=new Date(iso+'T12:00:00');const start=new Date(inicio+'T12:00:00');const end=new Date(start);end.setDate(end.getDate()+7);return d>=start&&d<end;}
function posEquivalentesSemana(r){const inicio=cSemanaInicio();if(!inicio)return 0;const start=new Date(inicio+'T12:00:00');const end=new Date(start);end.setDate(end.getDate()+7);const minutos=r.posLessons.filter(e=>{const d=new Date(e.date+'T12:00:00');return d>=start&&d<end}).reduce((s,e)=>s+Number(e.quantidade)*60,0);return Math.ceil(minutos/50);}
{const d=new Date();$('c-semana').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
$('c-semana').onchange=()=>{if(cRows.length)renderCarga();};
