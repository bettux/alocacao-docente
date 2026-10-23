(()=>{'use strict';
const $=id=>document.getElementById(id);let db,myId;
function msg(t,cls=''){const e=$('u-status');e.textContent=t;e.className='notice '+cls;}
function td(s){const e=document.createElement('td');e.textContent=s??'';return e;}
function visible(v){$('u-app').classList.toggle('hidden',!v);$('u-login').classList.toggle('hidden',v);$('u-logout').classList.toggle('hidden',!v);}
async function update(){const r=await db.rpc('listar_acessos_web');if(r.error)throw r.error;const body=$('u-rows');body.replaceChildren();for(const item of r.data||[]){const tr=document.createElement('tr');tr.append(td(item.email),td(item.perfil==='acesso'?'Acesso':'Administrador'),td(item.professor||'—'));
const actions=td('');const reset=document.createElement('button');reset.className='btn';reset.type='button';reset.textContent='Redefinir senha';reset.onclick=async()=>{if(!confirm('Gerar uma nova senha provisória para '+item.email+'? A senha anterior deixará de funcionar.'))return;try{const result=await functionCall({acao:'redefinir',usuario_id:item.usuario_id});showTemp(result.senha_provisoria);msg('Nova senha provisória gerada. Entregue por canal seguro.','ok');}catch(e){msg(e.message,'error');}};actions.append(reset);const b=document.createElement('button');b.className='btn';b.textContent='Revogar';b.disabled=item.usuario_id===myId;b.onclick=async()=>{if(!confirm('Revogar acesso de '+item.email+'?'))return;try{const x=await db.rpc('revogar_acesso_web',{p_usuario:item.usuario_id});if(x.error)throw x.error;await update();msg('Acesso revogado.','ok');}catch(e){msg(e.message,'error');}};actions.append(b);tr.append(actions);body.append(tr);}
if(!(r.data||[]).length){const tr=document.createElement('tr'),c=td('Nenhum usuário cadastrado');c.colSpan=4;tr.append(c);body.append(tr);}}
async function check(){const a=await db.auth.getUser();myId=a.data?.user?.id;if(a.data?.user?.app_metadata?.troca_senha_pendente){location.replace('./primeiro-acesso.html');return;}if(!myId){visible(false);msg('Entre com uma conta administrativa.');return;}const r=await db.rpc('meu_perfil_web');if(r.error||r.data?.perfil!=='administrador'){visible(false);msg('Somente administradores podem gerenciar usuários.','error');return;}visible(true);const t=await db.from('professores').select('id,nome,ativo').eq('ativo',true).order('nome');if(t.error)throw t.error;$('u-teacher').replaceChildren(new Option('Selecione o professor',''),...(t.data||[]).map(x=>new Option(x.nome,x.id)));await update();msg('Usuários carregados.','ok');}
$('u-role').onchange=()=>{$('u-teacher-field').classList.toggle('hidden',$('u-role').value==='administrador');};
$('u-login-form').onsubmit=async e=>{e.preventDefault();try{const r=await db.auth.signInWithPassword({email:$('u-email').value.trim(),password:$('u-password').value});if(r.error)throw r.error;$('u-password').value='';await check();}catch(err){msg(err.message,'error');}};
$('u-logout').onclick=async()=>{await db.auth.signOut();await check();};$('u-refresh').onclick=async()=>{try{await update();msg('Lista atualizada.','ok');}catch(e){msg(e.message,'error');}};
$('u-form').onsubmit=async e=>{e.preventDefault();const email=$('u-new-email').value.trim(),perfil=$('u-role').value,prof=$('u-teacher').value;if(perfil==='acesso'&&!prof)return msg('Selecione o professor vinculado.','error');$('u-add').disabled=true;try{const r=await db.rpc('configurar_acesso_web',{p_email:email,p_perfil:perfil,p_professor:perfil==='acesso'?prof:null});if(r.error)throw r.error;await update();msg('Perfil salvo com sucesso.','ok');}catch(err){msg(err.message,'error');}finally{$('u-add').disabled=false;}};
// Cadastro seguro: a service_role permanece exclusivamente na Edge Function.
async function functionCall(data){
  const session=await db.auth.getSession();
  if(session.error)throw session.error;
  const token=session.data.session?.access_token;
  if(!token)throw Error('Sessão expirada. Entre novamente.');
  let response;
  try{
    response=await fetch(new URL('/functions/v1/gerenciar-usuarios',window.SUPABASE_URL).href,{
      method:'POST',headers:{'Content-Type':'application/json','apikey':window.SUPABASE_PUBLISHABLE_KEY,'Authorization':`Bearer ${token}`},body:JSON.stringify(data)
    });
  }catch{throw Error('Não foi possível conectar à função gerenciar-usuarios. Confira o Deploy e CORS no Supabase.');}
  const raw=await response.text();let payload={};try{payload=JSON.parse(raw)}catch{payload={error:raw.slice(0,250)}}
  if(!response.ok)throw Error(payload.error||'Falha HTTP '+response.status);
  return payload;
}
function showTemp(value){
  $('u-temp-password').value=value||'';
  $('u-temp-panel').classList.remove('hidden');$('u-temp-placeholder').classList.add('hidden');
}
function hideTemp(){
  $('u-temp-password').value='';$('u-temp-panel').classList.add('hidden');$('u-temp-placeholder').classList.remove('hidden');
}
$('u-copy-password').onclick=async()=>{const value=$('u-temp-password').value;if(!value)return;try{await navigator.clipboard.writeText(value);msg('Senha copiada. Entregue por canal seguro.','ok')}catch{ $('u-temp-password').select();msg('Copie a senha selecionada.','ok');}};
$('u-close-password').onclick=hideTemp;
$('u-create').onclick=async()=>{
  const email=$('u-new-email').value.trim(),perfil=$('u-role').value,prof=$('u-teacher').value;
  if(!email)return msg('Informe o e-mail.','error');
  if(perfil==='acesso'&&!prof)return msg('Selecione o professor.','error');
  $('u-create').disabled=true;hideTemp();
  try{
    const result=await functionCall({acao:'criar',email,perfil,professor_id:perfil==='acesso'?prof:null});
    showTemp(result.senha_provisoria);await update();msg('Conta criada e perfil vinculado. Entregue a senha provisória com segurança.','ok');
  }catch(e){msg(e.message,'error')}finally{$('u-create').disabled=false;}
};
(async()=>{try{if(!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY)throw Error('Configure config.js');db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);await check();}catch(err){msg(err.message,'error');}})();
})();