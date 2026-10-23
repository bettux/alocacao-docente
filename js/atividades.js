let aItems=[];
const LIMITE_CARGA_SEMANAL=40;
// Recalcula no Supabase, para nao depender de um relatorio que pode estar desatualizado.
async function consultarCargaParaAtividade(professorId, periodoId, atividadeEmEdicao=''){
 const [turmas,atividades]=await Promise.all([
  cAll('turmas','id',q=>q.eq('periodo_id',periodoId)),
  cAll('atividades_complementares','id,professor_id,aulas_equivalentes,frequencia',q=>q.eq('periodo_id',periodoId).eq('professor_id',professorId))
 ]);
 let aulas=0;
 for(const turma of turmas){
  const alocacoes=await cAll('alocacoes','id,professor_id,blocos_grade(id,quantidade_aulas,bloco_professores(professor_id))',q=>q.eq('turma_id',turma.id));
  for(const aloc of alocacoes){
   for(const bloco of (aloc.blocos_grade||[])){
    const participantes=(bloco.bloco_professores||[]).map(x=>x.professor_id);
    if(participantes.includes(professorId)||(!participantes.length&&aloc.professor_id===professorId)){
     aulas+=Number(bloco.quantidade_aulas||0);
    }
   }
  }
 }
 const complementares=atividades.filter(a=>a.frequencia==='semanal'&&a.id!==atividadeEmEdicao).reduce((s,a)=>s+Number(a.aulas_equivalentes||0),0);
 return {aulas,complementares,preparacaoArredondada:Math.ceil(aulas*1.2)};
}
function aMessage(message,kind='error'){
 const el=$('a-feedback');el.textContent=message;el.className='notice '+kind;
 if(!message)el.classList.add('hidden');
}
function initActivitiesSelectors(){
 const period=$('a-periodo'),keepPeriod=period.value;
 period.replaceChildren(...gPeriods.map(p=>new Option(`${p.ano}/${p.semestre}`,p.id)));
 if(gPeriods.some(p=>p.id===keepPeriod))period.value=keepPeriod;
 else if($('c-periodo').value&&gPeriods.some(p=>p.id===$('c-periodo').value))period.value=$('c-periodo').value;
 const prof=$('a-professor'),keepProf=prof.value;
 prof.replaceChildren(new Option('Selecione o professor',''),...teachers.map(t=>new Option(`${t.nome}${t.ativo?'':' (inativo)'}`,t.id)));
 if(teachers.some(t=>t.id===keepProf))prof.value=keepProf;
}
function clearActivityForm(){
 $('a-id').value='';$('a-professor').value='';$('a-desc').value='';$('a-freq').value='semanal';$('a-qty').value='';$('a-notes').value='';
 $('a-form-title').textContent='Nova atividade';$('a-save').textContent='Salvar atividade';aMessage('');
}
async function loadActivities(){
 const pid=$('a-periodo').value;
 if(!pid){aItems=[];renderActivities();return;}
 $('a-state').textContent='Consultando...';
 try{
   aItems=await cAll('atividades_complementares','id,professor_id,periodo_id,descricao,aulas_equivalentes,observacao,frequencia',q=>q.eq('periodo_id',pid).order('descricao'));
   renderActivities();$('a-state').textContent=`${aItems.length} atividade(s)`;
 }catch(e){aMessage(e.message);$('a-state').textContent='Erro';}
}
function renderActivities(){
 const body=$('a-rows');body.replaceChildren();
 const search=$('a-search').value.trim().toLocaleLowerCase('pt-BR');
 const rows=aItems.filter(a=>`${teachers.find(t=>t.id===a.professor_id)?.nome||''} ${a.descricao}`.toLocaleLowerCase('pt-BR').includes(search));
 for(const a of rows){
  const tr=makeNode('tr'),t=teachers.find(x=>x.id===a.professor_id);
  cCell(tr,t?.nome||'Professor não encontrado');cCell(tr,a.descricao);cCell(tr,cNum(a.aulas_equivalentes));cCell(tr,a.frequencia==='semanal'?'Semanal':'Total do semestre');
  const actions=makeNode('td'),edit=makeNode('button','Editar','btn'),del=makeNode('button','Excluir','btn danger');
  edit.type='button';del.type='button';
  edit.onclick=()=>{
   $('a-id').value=a.id;$('a-professor').value=a.professor_id;$('a-desc').value=a.descricao;
   $('a-freq').value=a.frequencia||'periodo';$('a-qty').value=a.aulas_equivalentes;
   $('a-notes').value=a.observacao||'';$('a-form-title').textContent='Editar atividade';$('a-save').textContent='Salvar alterações';
   aMessage('');$('a-form').scrollIntoView({behavior:'smooth',block:'start'});
  };
  del.onclick=async()=>{
   if(!window.confirm(`Excluir a atividade "${a.descricao}"?`))return;
   del.disabled=true;
   const {error}=await db.from('atividades_complementares').delete().eq('id',a.id).eq('periodo_id',$('a-periodo').value);
   del.disabled=false;
   if(error)return aMessage(error.message);
   if($('a-id').value===a.id)clearActivityForm();
   await loadActivities();aMessage('Atividade excluída.','ok');
  };
  actions.append(edit,document.createTextNode(' '),del);tr.append(actions);body.append(tr);
 }
 if(!rows.length){const tr=makeNode('tr'),td=makeNode('td','Nenhuma atividade encontrada.','muted');td.colSpan=5;tr.append(td);body.append(tr);}
}
$('a-form').onsubmit=async e=>{
 e.preventDefault();aMessage('');
 const periodo_id=$('a-periodo').value,professor_id=$('a-professor').value,descricao=$('a-desc').value.trim(),
 frequencia=$('a-freq').value,aulas_equivalentes=Number($('a-qty').value),observacao=$('a-notes').value.trim()||null;
 if(!periodo_id||!professor_id||!descricao||!['semanal','periodo'].includes(frequencia)||!Number.isFinite(aulas_equivalentes)||aulas_equivalentes<=0)return aMessage('Preencha os campos e informe uma quantidade maior que zero.');
 const payload={periodo_id,professor_id,descricao,frequencia,aulas_equivalentes,observacao},id=$('a-id').value;
 const button=$('a-save');button.disabled=true;
 try{
   const carga=await consultarCargaParaAtividade(professor_id,periodo_id,id);
   if(carga.aulas<=0)throw new Error('Cadastre primeiro pelo menos uma aula para este professor no período. Depois será possível adicionar atividades complementares.');
   if(frequencia==='semanal'){
    const total=carga.preparacaoArredondada+carga.complementares+aulas_equivalentes;
    const restante=Math.max(0,LIMITE_CARGA_SEMANAL-carga.preparacaoArredondada-carga.complementares);
    if(total>LIMITE_CARGA_SEMANAL+0.00001)throw new Error(`Limite de 40 excedido: ${carga.aulas} aula(s) + preparação = ${carga.preparacaoArredondada}; outras atividades = ${cNum(carga.complementares)}. Restam apenas ${cNum(restante)} aula(s) equivalente(s) por semana. Tentativa: ${cNum(aulas_equivalentes)}.`);
   }
   const result=id?await db.from('atividades_complementares').update(payload).eq('id',id).eq('periodo_id',periodo_id):await db.from('atividades_complementares').insert(payload);
   if(result.error)throw result.error;
   clearActivityForm();await loadActivities();aMessage(id?'Atividade atualizada.':'Atividade cadastrada.','ok');
 }catch(err){aMessage(err.message||String(err));}finally{button.disabled=false;}
};
$('a-clear').onclick=clearActivityForm;
$('a-periodo').onchange=()=>{clearActivityForm();loadActivities();};
$('a-refresh').onclick=loadActivities;
$('a-search').oninput=renderActivities;



