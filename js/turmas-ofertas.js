(()=>{'use strict';
const $=id=>document.getElementById(id);
const textNode=(tag,value)=>{const e=document.createElement(tag);e.textContent=value??'';return e;};
let db,periods=[],matrices=[],disciplines=[],turmas=[];
const status=(message,type='')=>{const e=$('to-status');e.textContent=message;e.className='notice '+type;};
function fill(select,rows,label){select.replaceChildren(...rows.map(row=>new Option(label(row),row.id)));}
function selectedMatrix(){return matrices.find(m=>m.id===$('to-matrix').value);}
function isPost(m){return m?.cursos?.nivel==='pos';}
function semesterOptions(){const m=selectedMatrix();const values=isPost(m)?[1]:[...new Set(disciplines.filter(d=>d.matriz_id===m?.id&&Number(d.semestre)>0).map(d=>Number(d.semestre)))].sort((a,b)=>a-b);
$('to-semester').replaceChildren(...(values.length?values:[1]).map(n=>new Option(n+'º semestre',n)));}
function countDisciplines(t){const m=matrices.find(x=>x.id===t.matriz_id);return disciplines.filter(d=>d.matriz_id===t.matriz_id&&(isPost(m)||Number(d.semestre)===Number(t.semestre_curricular))).length;}
async function loadData(){const oldPeriod=$('to-period').value;
const results=await Promise.all([
db.from('periodos_letivos').select('id,ano,semestre').order('ano',{ascending:false}).order('semestre',{ascending:false}),
db.from('matrizes_curriculares').select('id,nome,cursos(nome,nivel)').order('nome'),
db.from('matriz_disciplinas').select('id,matriz_id,semestre')
]);
for(const r of results)if(r.error)throw r.error;
periods=results[0].data||[];matrices=results[1].data||[];disciplines=results[2].data||[];
fill($('to-period'),periods,p=>`${p.ano}/${p.semestre}`);if(periods.some(p=>p.id===oldPeriod))$('to-period').value=oldPeriod;
fill($('to-matrix'),matrices,m=>`${m.cursos?.nome||'Curso'} — ${m.nome}`);semesterOptions();await loadTurmas();}
async function loadTurmas(){const p=$('to-period').value;if(!p){turmas=[];render();return;}
const r=await db.from('turmas').select('id,periodo_id,matriz_id,semestre_curricular,identificacao').eq('periodo_id',p).order('identificacao');if(r.error)throw r.error;
turmas=r.data||[];render();}
function render(){const tbody=$('to-list');tbody.replaceChildren();$('to-count').textContent=`${turmas.length} turma${turmas.length===1?'':'s'}`;
if(!turmas.length){const tr=textNode('tr'),td=textNode('td','Nenhuma turma cadastrada para este período.');td.colSpan=5;tr.append(td);tbody.append(tr);return;}
for(const t of turmas){const m=matrices.find(x=>x.id===t.matriz_id);const tr=textNode('tr');
for(const v of [t.identificacao,`${m?.cursos?.nome||'Curso'} — ${m?.nome||'Matriz'}`,`${t.semestre_curricular||1}º`,String(countDisciplines(t))])tr.append(textNode('td',v));
const action=textNode('td');if(!isPost(m)){const link=textNode('a','Abrir graduação');link.className='btn';link.href='./graduacao.html';link.title='Na graduação, selecione o período, a matriz, o semestre e esta turma.';action.append(link);}else{action.append(textNode('span','Planejamento na pós-graduação'));}
tr.append(action);tbody.append(tr);}}
$('to-matrix').addEventListener('change',semesterOptions);
$('to-period').addEventListener('change',()=>loadTurmas().catch(e=>status('Erro ao consultar turmas: '+e.message,'error')));
$('to-refresh').addEventListener('click',()=>loadData().then(()=>status('Dados atualizados.','ok')).catch(e=>status(e.message,'error')));
$('to-form').addEventListener('submit',async event=>{event.preventDefault();const periodo_id=$('to-period').value,matriz_id=$('to-matrix').value,semestre_curricular=Number($('to-semester').value),identificacao=$('to-name').value.trim();
if(!periodo_id||!matriz_id||!semestre_curricular||!identificacao)return status('Preencha todos os campos.','error');
if(turmas.some(t=>t.matriz_id===matriz_id&&Number(t.semestre_curricular)===semestre_curricular&&t.identificacao.toLocaleLowerCase('pt-BR')===identificacao.toLocaleLowerCase('pt-BR')))return status('Já existe uma turma com essa identificação para essa matriz e semestre.','error');
try{const r=await db.from('turmas').insert({periodo_id,matriz_id,semestre_curricular,identificacao}).select('id').single();if(r.error)throw r.error;await loadTurmas();$('to-name').value='';status('Turma cadastrada! As disciplinas da matriz estarão disponíveis automaticamente na graduação.','ok');}
catch(e){status('Não foi possível cadastrar: '+e.message,'error');}});
async function check(){const u=await db.auth.getUser();if(u.error||!u.data?.user){$('to-app').classList.add('hidden');$('to-login').classList.remove('hidden');status('Faça login para continuar.');return;}
const a=await db.from('administradores').select('usuario_id').eq('usuario_id',u.data.user.id).maybeSingle();if(a.error||!a.data){$('to-app').classList.add('hidden');$('to-login').classList.remove('hidden');status('Acesso restrito a administradores.','error');return;}
$('to-login').classList.add('hidden');$('to-app').classList.remove('hidden');$('to-logout').classList.remove('hidden');await loadData();status('Turmas carregadas.','ok');}
$('to-login-form').addEventListener('submit',async e=>{e.preventDefault();try{const r=await db.auth.signInWithPassword({email:$('to-email').value.trim(),password:$('to-password').value});if(r.error)throw r.error;$('to-password').value='';await check();}catch(e){status('Falha no login: '+e.message,'error');}});
$('to-logout').addEventListener('click',async()=>{await db.auth.signOut();await check();});
(async()=>{try{if(!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY)throw Error('Configure config.js');db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);await check();}catch(e){status('Falha ao iniciar: '+e.message,'error');}})();
})();
