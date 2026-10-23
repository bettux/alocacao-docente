import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
serve(async req => {
 if(req.method==='OPTIONS') return new Response('',{headers:cors});
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method!=='POST')return json({error:'Método não permitido'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!jwt)return json({error:'Não autenticado'},401);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}}});
  const auth=await userClient.auth.getUser(jwt);if(auth.error||!auth.data.user)return json({error:'Token inválido'},401);
  const role=await userClient.rpc('meu_perfil_web');if(role.error||role.data?.perfil!=='administrador')return json({error:'Apenas administradores'},403);
  const {email,redirectTo}=await req.json();if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>320)return json({error:'E-mail inválido'},400);
  const allowedOrigin=Deno.env.get('APP_ORIGIN');
  if(!allowedOrigin)return json({error:'Configure APP_ORIGIN na Edge Function'},500);
  const callback=new URL(redirectTo);if(callback.origin!==new URL(allowedOrigin).origin || !callback.pathname.endsWith('/definir-senha.html'))return json({error:'URL de retorno não autorizada'},400);
  const admin=createClient(url,service);
  const result=await admin.auth.admin.inviteUserByEmail(email.trim(),{redirectTo:callback.href});
  if(result.error)return json({error:result.error.message},400);
  return json({ok:true});
 }catch(err){return json({error:err instanceof Error?err.message:'Erro interno'},500);}
});