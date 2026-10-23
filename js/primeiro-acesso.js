(()=>{'use strict';
const db=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
const status=document.getElementById('first-status'),form=document.getElementById('first-form');
const message=(m,error=false)=>{status.textContent=m;status.className='notice '+(error?'error':'ok')};
async function request(data){
 const current=await db.auth.getSession();const token=current.data.session?.access_token;
 if(!token)throw Error('Faça login com sua senha provisória para continuar.');
 let res;try{res=await fetch(new URL('/functions/v1/gerenciar-usuarios',window.SUPABASE_URL).href,{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+token},body:JSON.stringify(data)});}catch{throw Error('Não foi possível acessar a função gerenciar-usuarios.');}
 const text=await res.text();let body={};try{body=JSON.parse(text)}catch{}if(!res.ok)throw Error(body.error||'Erro HTTP '+res.status);return body;
}
(async()=>{try{const r=await db.auth.getUser();if(!r.data?.user){message('Faça login com a senha provisória antes de acessar esta página.',true);return;}if(!r.data.user.app_metadata?.troca_senha_pendente){location.replace('./index.html');return;}form.classList.remove('hidden');message('Informe uma nova senha pessoal.');}catch(e){message(e.message,true)}})();
form.onsubmit=async ev=>{ev.preventDefault();const pwd=document.getElementById('first-password').value,confirmation=document.getElementById('first-confirm').value;if(pwd!==confirmation)return message('As senhas são diferentes.',true);if(pwd.length<12)return message('A senha precisa de pelo menos 12 caracteres.',true);
 const button=form.querySelector('button');button.disabled=true;
 try{await request({acao:'trocar',nova_senha:pwd});await db.auth.signOut();form.classList.add('hidden');message('Senha atualizada. Faça login novamente com a nova senha.');}catch(e){message(e.message||String(e),true)}finally{button.disabled=false;}
};
})();