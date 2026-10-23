(() => {
  'use strict';

  const db = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY,
    { auth: { detectSessionInUrl: true, persistSession: true } }
  );

  const status = document.getElementById('pw-status');
  const form = document.getElementById('pw-set');
  const password = document.getElementById('pw-password');
  const submit = form.querySelector('button[type="submit"],button');
  const reset = document.getElementById('pw-reset');
  const email = document.getElementById('pw-email');

  let ready = false;
  let initializing = true;

  function message(text, error = false) {
    status.textContent = text;
    status.className = 'notice ' + (error ? 'error' : 'ok');
  }

  function allowPasswordChange(allow) {
    ready = allow;
    password.disabled = !allow;
    submit.disabled = !allow;
  }

  allowPasswordChange(false);
  message('Validando o link de convite ou recuperação de senha...');

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      allowPasswordChange(false);
      if (!initializing) message('Sessão encerrada. Solicite um novo link de recuperação.', true);
    }
    if (!initializing && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
      allowPasswordChange(true);
      message('Link validado. Digite sua nova senha.');
    }
  });

  async function initialize() {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const error = query.get('error_description') || fragment.get('error_description');
    if (error) {
      initializing = false;
      message('O convite não pôde ser validado: ' + error.replace(/\+/g, ' ') + '. Solicite um novo link.', true);
      return;
    }

    try {
      // getSession aguarda a inicialização do SDK, inclusive tokens recebidos no fragmento da URL.
      let result = await db.auth.getSession();
      if (result.error) throw result.error;

      // Suporte a links de convite customizados contendo token_hash.
      if (!result.data.session && query.has('token_hash')) {
        const type = query.get('type');
        if (type !== 'invite' && type !== 'recovery') {
          throw new Error('Tipo de link de autenticação inválido');
        }
        const verified = await db.auth.verifyOtp({
          token_hash: query.get('token_hash'),
          type,
        });
        if (verified.error) throw verified.error;
        result = await db.auth.getSession();
      }

      // Links PKCE podem conter ?code=...; normalmente o SDK troca esse código automaticamente.
      if (!result.data.session && query.has('code')) {
        const exchanged = await db.auth.exchangeCodeForSession(query.get('code'));
        if (exchanged.error) throw exchanged.error;
        result = await db.auth.getSession();
      }

      initializing = false;
      if (!result.data.session) {
        allowPasswordChange(false);
        message('Não há uma sessão válida nesta página. Abra o link de confirmação recebido no e-mail ou solicite um novo link abaixo.', true);
        return;
      }

      allowPasswordChange(true);
      message('Sessão validada. Digite sua nova senha.');
    } catch (err) {
      initializing = false;
      allowPasswordChange(false);
      message('Não foi possível validar o link: ' + (err.message || String(err)) + '. Solicite um novo link abaixo.', true);
    }
  }

  reset.addEventListener('submit', async (event) => {
    event.preventDefault();
    const address = email.value.trim();
    const button = reset.querySelector('button');
    button.disabled = true;
    try {
      const result = await db.auth.resetPasswordForEmail(address, {
        redirectTo: new URL('definir-senha.html', location.href).href,
      });
      if (result.error) throw result.error;
      message('Se a conta existir, você receberá um e-mail para redefinir a senha. Abra o link recebido antes de tentar alterá-la.');
    } catch (err) {
      message(err.message || String(err), true);
    } finally {
      button.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ready) {
      message('Primeiro abra o link de confirmação recebido no e-mail.', true);
      return;
    }
    submit.disabled = true;
    try {
      const session = await db.auth.getSession();
      if (session.error || !session.data.session) {
        throw new Error('A sessão expirou. Solicite um novo link de recuperação.');
      }
      const result = await db.auth.updateUser({ password: password.value });
      if (result.error) throw result.error;
      password.value = '';
      message('Senha definida com sucesso! Você já pode entrar no sistema.');
    } catch (err) {
      message(err.message || String(err), true);
    } finally {
      submit.disabled = !ready;
    }
  });

  initialize();
})();
