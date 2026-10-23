(()=>{'use strict';
const $=id=>document.getElementById(id);let db,myId;
function msg(t,cls=''){const e=$('u-status');e.textContent=t;e.className='notice '+cls;}
function td(s){const e=document.createElement('td');e.textContent=s??'';return e;}
function visible(v){$('u-app').classList.toggle('hidden',!v);$('u-login').classList.toggle('hidden',v);$('u-logout').classList.toggle('hidden',!v);}
async function update(){const r=await db.rpc('listar_acessos_web');if(r.error)throw r.error;const body=$('u-rows');body.replaceChildren();for(const item of r.data||[]){const tr=document.createElement('tr');tr.append(td(item.email),td(item.perfil==='acesso'?'Acesso':'Administrador'),td(item.professor||'—'));
const actions=td('');const b=document.createElement('button');b.className='btn';b.textContent='Revogar';b.disabled=item.usuario_id===myId;b.onclick=async()=>{if(!confirm('Revogar acesso de '+item.email+'?'))return;try{const x=await db.rpc('revogar_acesso_web',{p_usuario:item.usuario_id});if(x.error)throw x.error;await update();msg('Acesso revogado.','ok');}catch(e){msg(e.message,'error');}};actions.append(b);tr.append(actions);body.append(tr);}
if(!(r.data||[]).length){const tr=document.createElement('tr'),c=td('Nenhum usuário cadastrado');c.colSpan=4;tr.append(c);body.append(tr);}}
async function check(){const a=await db.auth.getUser();myId=a.data?.user?.id;if(!myId){visible(false);msg('Entre com uma conta administrativa.');return;}const r=await db.rpc('meu_perfil_web');if(r.error||r.data?.perfil!=='administrador'){visible(false);msg('Somente administradores podem gerenciar usuários.','error');return;}visible(true);const t=await db.from('professores').select('id,nome,ativo').eq('ativo',true).order('nome');if(t.error)throw t.error;$('u-teacher').replaceChildren(new Option('Selecione o professor',''),...(t.data||[]).map(x=>new Option(x.nome,x.id)));await update();msg('Usuários carregados.','ok');}
$('u-role').onchange=()=>{$('u-teacher-field').classList.toggle('hidden',$('u-role').value==='administrador');};
$('u-login-form').onsubmit=async e=>{e.preventDefault();try{const r=await db.auth.signInWithPassword({email:$('u-email').value.trim(),password:$('u-password').value});if(r.error)throw r.error;$('u-password').value='';await check();}catch(err){msg(err.message,'error');}};
$('u-logout').onclick=async()=>{await db.auth.signOut();await check();};$('u-refresh').onclick=async()=>{try{await update();msg('Lista atualizada.','ok');}catch(e){msg(e.message,'error');}};
$('u-form').onsubmit=async e=>{e.preventDefault();const email=$('u-new-email').value.trim(),perfil=$('u-role').value,prof=$('u-teacher').value;if(perfil==='acesso'&&!prof)return msg('Selecione o professor vinculado.','error');$('u-add').disabled=true;try{const r=await db.rpc('configurar_acesso_web',{p_email:email,p_perfil:perfil,p_professor:perfil==='acesso'?prof:null});if(r.error)throw r.error;await update();msg('Perfil salvo com sucesso.','ok');}catch(err){msg(err.message,'error');}finally{$('u-add').disabled=false;}};
// O convite requer uma Edge Function publicada; erros de rede/CORS não possuem corpo HTTP.
$('u-invite').onclick=async()=>{
  const email=$('u-new-email').value.trim();
  if(!email)return msg('Informe o e-mail do usuário.','error');
  $('u-invite').disabled=true;
  try{
    const sessionResult=await db.auth.getSession();
    if(sessionResult.error)throw sessionResult.error;
    const token=sessionResult.data.session?.access_token;
    if(!token)throw Error('Sua sessão expirou. Faça login novamente.');
    const endpoint=new URL('/functions/v1/convidar-usuario',window.SUPABASE_URL).href;
    let response;
    try{
      response=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':window.SUPABASE_PUBLISHABLE_KEY,'Authorization':`Bearer ${token}`},
        body:JSON.stringify({email,redirectTo:new URL('./definir-senha.html',location.href).href}),
      });
    }catch(networkError){
      console.error('Falha de rede/CORS ao acessar Edge Function:',endpoint,networkError);
      throw Error('Não foi possível conectar à função de convites. Verifique se “convidar-usuario” foi publicada no Supabase (Edge Functions), se aceita requisições OPTIONS/CORS e se a rede permite acesso. Consulte o Console (F12) para o erro detalhado.');
    }
    const raw=await response.text();
    let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch{payload={error:raw.slice(0,300)};}
    if(!response.ok){
      const details=payload.error||payload.message||`Erro HTTP ${response.status}`;
      if(response.status===404)throw Error('Função “convidar-usuario” não encontrada (HTTP 404). Publique a Edge Function no projeto correto.');
      if(response.status===401)throw Error(`Acesso negado pelo Supabase (HTTP 401). Verifique a autenticação da função e a validade da sessão. ${details}`);
      if(response.status===403)throw Error(`Sem permissão para enviar convite (HTTP 403). ${details}`);
      throw Error(`Convite não enviado (HTTP ${response.status}): ${details}`);
    }
    msg('Convite enviado. Agora clique em Salvar perfil.','ok');
  }catch(err){msg(err.message||String(err),'error');}
  finally{$('u-invite').disabled=false;}
};
(async()=>{try{if(!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY)throw Error('Configure config.js');db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);await check();}catch(err){msg(err.message,'error');}})();
})();