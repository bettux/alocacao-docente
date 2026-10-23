# Sistema de Alocação Docente — v6.0.3

## Instalação e atualização
1. Faça backup da versão instalada e do banco Supabase.
2. Publique os arquivos HTML, CSS e JS na raiz do repositório do GitHub Pages. Preserve o `config.js` do seu projeto (somente URL e chave pública).
3. No Supabase, crie uma Edge Function **gerenciar-usuarios** (nome exato) e cole `supabase/functions/gerenciar-usuarios/index.ts`, depois clique em **Deploy**.
4. A função usa as variáveis internas `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A chave administrativa NUNCA deve ser publicada no GitHub.
5. A conta administradora deve estar habilitada e as RPCs da versão 5.2.1 (`meu_perfil_web`, `configurar_acesso_web`, `listar_acessos_web`) devem existir.
6. Em **Usuários e Acessos**, escolha professor, e-mail e perfil. Clique **Criar usuário** e copie a senha provisória exibida uma vez. Entregue-a por canal seguro.
7. O docente faz login em `index.html`, é encaminhado para `primeiro-acesso.html`, define outra senha e entra novamente.
8. Para uma conta já criada, use **Atualizar perfil** ou **Redefinir senha** na lista de usuários.

## Segurança e limites
- A Edge Function valida o JWT e o perfil administrador antes de criar/redefinir contas, e não envia e-mails.
- O novo fluxo usa `app_metadata.troca_senha_pendente`. A primeira troca é efetuada na Edge Function junto com a remoção dessa marcação; o professor não pode alterar a própria marcação pelo navegador.
- A interface direciona contas pendentes para `primeiro-acesso.html`. Para garantia de bloqueio **no banco** para todas as operações administrativas, revise as políticas RLS existentes antes de usar em produção: elas podem ter sido criadas antes desta versão. Não confie apenas em redirecionamento da interface.
- `email_confirm: true` marca contas criadas administrativamente como confirmadas, dispensando o link de confirmação; use somente para usuários cuja identidade você verificou.
- A senha provisória só é mostrada após o cadastro e não é persistida na aplicação; evite compartilhá-la por canais públicos.
- Manter `config.js`, arquivos SQL e histórico técnico fora do repositório público se contiverem informações sensíveis. Nunca publique service_role.

## Organização
- HTML na raiz; CSS em `css/`; JavaScript em `js/`; Edge Functions em `supabase/functions/`; histórico SQL em `database/`.
- Módulos de grade, pós, carga docente e relatórios permanecem sem mudanças de negócio.
