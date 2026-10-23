(async()=>{
  const route=location.pathname.split('/').pop();
  const pages=[['prof','professores.html'],['grade','graduacao.html'],['pos','pos-graduacao.html'],['carga','carga-docente.html'],['ativ','atividades.html']];
  try {
    // Os fragmentos são distribuídos em js/views.js para funcionar até com file://.
    const fragments=pages.map(([id])=>{
      const content=window.ALOCACAO_VIEWS?.[id];
      if(typeof content!=='string')throw Error(`Tela ${id} indisponível: verifique js/views.js`);
      return content;
    });
    document.getElementById('v4-page-root').innerHTML=fragments.join('');
    const active=pages.find(x=>x[1]===route)?.[0]||'prof';
    document.querySelectorAll('.v4-nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='./'+route));
    const libs=['core.js','graduacao.js','carga.js','atividades.js','pos.js','pos_v4.js'];
    for(const file of libs){const tag=document.createElement('script');tag.src='./js/'+file;await new Promise((resolve,reject)=>{tag.onload=resolve;tag.onerror=()=>reject(Error('Não foi possível carregar '+file));document.body.append(tag);});}
    await init();
    if(!db)return;
    setTab(active);
    if(active==='pos' && typeof pV4Init==='function')pV4Init();
  }catch(e){$('session-loading')?.classList.add('hidden');document.getElementById('msg').textContent='Falha ao iniciar: '+e.message;console.error(e);}
})();