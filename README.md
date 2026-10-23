# Sistema de Alocação de Aula — Vila Mariana

## Versão 6.0 — interface modernizada

Aplicação HTML/CSS/JavaScript com Supabase para planejar aulas da graduação e da pós-graduação, gerenciar docentes, turmas, disponibilidades, atividades complementares e relatórios.

### Começar
1. Mantenha a configuração do seu projeto em `config.js`, baseada em `config.exemplo.js`.
2. Sirva a pasta usando Live Server ou hospede-a em um servidor HTTPS (por exemplo, GitHub Pages).
3. Acesse `index.html` e faça login com sua conta autorizada.
4. Para utilizar as funcionalidades de usuários/perfis, configure previamente a autenticação, as funções administrativas e as políticas RLS no Supabase.

**Importante:** não coloque a `service_role` ou outras chaves secretas no front-end. O sistema requer um Supabase já configurado; os scripts históricos de atualização ficam em `database/` para referência. Não execute toda a pasta de migrações indiscriminadamente sobre um banco em produção.

### Estrutura
- `*.html` — páginas funcionais.
- `css/estilos.css` — estilos preexistentes das grades e formulários.
- `css/layout.css` — tema e navegação compartilhada da v6.0.
- `css/*.css` — estilos específicos de cada módulo.
- `js/layout.js` — menu lateral expansível, título e layout global.
- `js/*.js` — lógica de negócio de cada página; preservar as dependências de `js/boot.js` e `js/views.js`.
- `database/` — scripts SQL históricos, mantidos para manutenção.
- `config.exemplo.js` — modelo de configuração pública do Supabase.

### Observações
- A v6.0 é uma reorganização visual e de entrega, **não** altera as regras de carga docente, os cadastros nem o esquema do Supabase.
- Os relatórios em PDF utilizam impressão do navegador.
- O acesso de professores depende das políticas RLS e da configuração de perfis; valide com um usuário de teste antes de abrir o acesso externo.
- Faça backup do banco e do código antes de substituir a versão anterior.

### Convites por e-mail — diagnóstico
O botão **Enviar convite por e-mail** depende de uma **Edge Function implantada** no projeto Supabase; copiar os arquivos HTML/JS não publica essa função.

1. No painel Supabase, entre em **Edge Functions** e confirme que existe uma função publicada chamada exatamente `convidar-usuario`. Se não existir, crie/implante usando `supabase/functions/convidar-usuario/index.ts`.
2. Configure a variável **APP_ORIGIN** nas Secrets da função com a origem HTTPS do site (ex.: `https://sua-organizacao.github.io`; no Live Server, a origem inclui endereço e porta, como `http://127.0.0.1:5500`). A origem deve coincidir com o endereço usado para abrir o sistema.
3. Em **Authentication > URL Configuration**, permita o endereço completo da página `definir-senha.html`, que será o destino do convite.
4. Confira o e-mail de saída em **Authentication > SMTP Settings** (para produção, use SMTP próprio e remetente autorizado).
5. A função exige usuário logado como administrador no sistema. Não coloque chaves secretas nem `service_role` no navegador; a função usa variáveis do ambiente do Supabase.
6. Se ainda falhar, abra **F12 > Network**, clique novamente em Enviar convite e confira a requisição `functions/v1/convidar-usuario`, especialmente `OPTIONS` e `POST`; no Supabase consulte **Edge Functions > convidar-usuario > Logs/Invocations**.

Se aparecer **Failed to fetch** ou erro de CORS, a chamada não conseguiu receber uma resposta HTTP válida: a causa pode ser função não implantada, bloqueio CORS, URL incorreta ou conectividade. A versão 6.0.1 melhora a mensagem e indica erros HTTP quando o servidor responde, mas **não substitui a implantação da função**.
