/* Navegação visual compartilhada. Não modifica lógica acadêmica nem autorização. */
(() => {
  'use strict';
  const groups = [
    {title:'Dashboard',url:'dashboard.html'},
    {title:'Professores',items:[['Cadastro de professores','professores.html'],['Disponibilidade','disponibilidade.html'],['Agenda docente','agenda-docente.html']]},
    {title:'Graduação',items:[['Grade semanal','graduacao.html'],['Carga docente','carga-docente.html'],['Atividades complementares','atividades.html'],['Relatórios de aulas','exportacao.html']]},
    {title:'Pós-Graduação',items:[['Planejamento de aulas','pos-graduacao.html']]},
    {title:'Gestão Acadêmica',items:[['Gestão de turmas','turmas-ofertas.html'],['Configurações acadêmicas','configuracoes.html']]},
    {title:'Auditoria',url:'auditoria.html'},
    {title:'Usuários e acessos',url:'usuarios.html'}
  ];
  const here=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const escapeHTML=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function build(nav){
    if(nav.dataset.shellAttached)return;
    nav.dataset.shellAttached='1';
    const aside=document.createElement('aside');
    aside.className='app-sidebar';
    aside.setAttribute('aria-label','Navegação principal');
    const wrapper=document.createElement('div');wrapper.className='app-sidebar-inner';
    const title=document.createElement('div');title.className='app-sidebar-label';title.textContent='MENU PRINCIPAL';wrapper.append(title);
    groups.forEach(g=>{
      if(g.url){const a=document.createElement('a');a.className='app-nav-link'+(here===g.url?' is-current':'');a.href='./'+g.url;a.textContent=g.title;wrapper.append(a);return;}
      const section=document.createElement('details');section.className='app-nav-group';
      const active=g.items.some(x=>x[1]===here);if(active)section.open=true;
      const summary=document.createElement('summary');summary.textContent=g.title;section.append(summary);
      const list=document.createElement('div');list.className='app-nav-subitems';
      g.items.forEach(([name,url])=>{const a=document.createElement('a');a.href='./'+url;a.className='app-nav-sublink'+(here===url?' is-current':'');a.textContent=name;list.append(a);});
      section.append(list);wrapper.append(section);
    });
    aside.append(wrapper);nav.after(aside);
    nav.classList.add('app-original-nav');
    const shellParent=nav.parentElement;
    function updateVisible(){
      let el=shellParent,visible=true;
      while(el&&el!==document.body){if(el.classList.contains('hidden')||el.hidden){visible=false;break;}el=el.parentElement;}
      document.body.classList.toggle('app-shell-visible',visible);
    }
    new MutationObserver(updateVisible).observe(document.body,{attributes:true,attributeFilter:['class','hidden'],subtree:true});
    updateVisible();
  }
  function init(){
    const nav=document.querySelector('nav.tabs');if(nav)build(nav);
    const heading=document.querySelector('body > header b,body > header strong');
    if(heading)heading.textContent='Sistema de alocação de aula Graduação e Pós Graduação - Vila Mariana';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
