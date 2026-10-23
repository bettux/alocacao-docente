import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%_-";
function temporaryPassword() {
  const random = new Uint32Array(24);
  crypto.getRandomValues(random);
  return Array.from(random, n => alphabet[n % alphabet.length]).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return response({ error: "Método não permitido" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return response({ error: "Configuração Supabase incompleta" }, 500);
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return response({ error: "Não autenticado" }, 401);
    const userDb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const identity = await userDb.auth.getUser(jwt);
    if (identity.error || !identity.data.user) return response({ error: "Sessão inválida" }, 401);
    const current = identity.data.user;
    const adminDb = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const input = await req.json();
    if (!input || typeof input.acao !== "string") return response({ error: "Ação inválida" }, 400);

    if (input.acao === "trocar") {
      if (!current.app_metadata?.troca_senha_pendente) return response({ error: "Não existe troca obrigatória pendente" }, 400);
      if (typeof input.nova_senha !== "string" || input.nova_senha.length < 12 || input.nova_senha.length > 128) return response({ error: "A nova senha deve ter de 12 a 128 caracteres" }, 400);
      // Muda a senha e a marcação numa única operação administrativa.
      const result = await adminDb.auth.admin.updateUserById(current.id, {
        password: input.nova_senha,
        app_metadata: { ...current.app_metadata, troca_senha_pendente: false },
      });
      if (result.error) return response({ error: result.error.message }, 400);
      return response({ ok: true });
    }

    if (current.app_metadata?.troca_senha_pendente) return response({ error: "Altere sua senha provisória antes de usar o sistema" }, 403);
    const role = await userDb.rpc("meu_perfil_web");
    if (role.error || role.data?.perfil !== "administrador") return response({ error: "Somente administradores" }, 403);

    if (input.acao === "criar") {
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) return response({ error: "E-mail inválido" }, 400);
      if (!["acesso", "administrador"].includes(input.perfil)) return response({ error: "Perfil inválido" }, 400);
      const professor = input.perfil === "acesso" ? input.professor_id : null;
      if (input.perfil === "acesso" && !professor) return response({ error: "Selecione um professor" }, 400);
      const pwd = temporaryPassword();
      const created = await adminDb.auth.admin.createUser({
        email, password: pwd, email_confirm: true,
        app_metadata: { troca_senha_pendente: true },
      });
      if (created.error || !created.data.user) return response({ error: created.error?.message || "Não foi possível criar a conta" }, 400);
      // A RPC verifica se o chamador é administrador, e a turma/professor existem.
      const assigned = await userDb.rpc("configurar_acesso_web", {
        p_email: email, p_perfil: input.perfil, p_professor: professor,
      });
      if (assigned.error) {
        const cleanup = await adminDb.auth.admin.deleteUser(created.data.user.id);
        if (cleanup.error) console.error("Falha ao desfazer cadastro:", cleanup.error.message);
        return response({ error: "Não foi possível vincular o perfil: " + assigned.error.message + (cleanup.error ? ". Verifique a conta criada no Authentication." : "") }, 400);
      }
      return response({ ok: true, senha_provisoria: pwd });
    }

    if (input.acao === "redefinir") {
      if (typeof input.usuario_id !== "string") return response({ error: "Identificação inválida" }, 400);
      // Só permite redefinir contas que constam na lista de acessos administrados.
      const list = await userDb.rpc("listar_acessos_web");
      if (list.error || !(list.data || []).some((x: { usuario_id: string }) => x.usuario_id === input.usuario_id)) {
        return response({ error: "Conta não autorizada para redefinição" }, 403);
      }
      if (input.usuario_id === current.id) return response({ error: "Não redefina sua própria senha por este painel" }, 400);
      const old = await adminDb.auth.admin.getUserById(input.usuario_id);
      if (old.error || !old.data.user) return response({ error: "Conta não encontrada" }, 404);
      const pwd = temporaryPassword();
      const changed = await adminDb.auth.admin.updateUserById(input.usuario_id, {
        password: pwd,
        app_metadata: { ...old.data.user.app_metadata, troca_senha_pendente: true },
      });
      if (changed.error) return response({ error: changed.error.message }, 400);
      return response({ ok: true, senha_provisoria: pwd });
    }
    return response({ error: "Ação não reconhecida" }, 400);
  } catch (err) {
    console.error("gerenciar-usuarios:", err);
    return response({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
