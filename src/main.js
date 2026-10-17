'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');const run=promisify(execFile);
const DISCORD='https://discord.gg/yWCBDZXwW7';
const base=()=>path.join(process.env.LOCALAPPDATA||'','Roblox','Versions');
const backupDir=()=>path.join(app.getPath('userData'),'roblox-backups');
const manifestPath=()=>path.join(backupDir(),'manifest.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function exists(p){return fs.stat(p).then(x=>x.isFile()).catch(()=>false)}
async function versions(){const dirs=await fs.readdir(base(),{withFileTypes:true}).catch(()=>[]);const out=[];for(const d of dirs){if(!d.isDirectory()||!d.name.startsWith('version-'))continue;const root=path.join(base(),d.name);if(await exists(path.join(root,'RobloxPlayerBeta.exe'))){const st=await fs.stat(path.join(root,'RobloxPlayerBeta.exe'));out.push({root,name:d.name,mtime:st.mtimeMs})}}return out.sort((a,b)=>b.mtime-a.mtime)}
// A instalação só é confirmada pelo caminho do processo RobloxPlayerBeta.exe.
// Nunca selecionamos outra instalação por data e a tratamos como ativa.
let observedRoot=null;
async function runningPlayer(){
 if(process.platform!=='win32')return null;
 try{
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',
   "Get-CimInstance Win32_Process -Filter \"name = 'RobloxPlayerBeta.exe'\" | Select-Object -ExpandProperty ExecutablePath"],
   {windowsHide:true,timeout:9000,maxBuffer:65536});
  const paths=stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const allowed=await versions();
  for(const exe of paths){const root=path.dirname(exe);if(allowed.some(v=>v.root.toLowerCase()===root.toLowerCase()))return root}
 }catch(e){}return null;
}
// Consulta apenas processos Roblox oficiais localizados em Roblox/Versions.
async function playerProcesses(){
 if(process.platform!=='win32')return [];
 try{
  const script="$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"name = 'RobloxPlayerBeta.exe'\" | Select-Object ProcessId,ExecutablePath) | ConvertTo-Json -Compress";
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:9000,maxBuffer:65536});
  const parsed=JSON.parse(stdout.trim()||'[]');const entries=Array.isArray(parsed)?parsed:parsed?[parsed]:[];
  const vv=await versions();
  return entries.filter(e=>Number.isInteger(e.ProcessId)&&typeof e.ExecutablePath==='string'&&vv.some(v=>path.join(v.root,'RobloxPlayerBeta.exe').toLowerCase()===path.normalize(e.ExecutablePath).toLowerCase())).map(e=>({pid:e.ProcessId,version:path.basename(path.dirname(e.ExecutablePath))}));
 }catch(e){throw Error('Não foi possível verificar os processos do Roblox. Tente novamente antes de modificar arquivos.');}
}
async function processStatus(){const processes=await playerProcesses();return {running:processes.length>0,processes};}
async function closePlayers(){
 const processes=await playerProcesses();if(!processes.length)return {closed:0,remaining:0};
 // Somente após confirmação explícita na interface. Sem /T para não encerrar outros aplicativos.
 const failed=[];
 for(const proc of processes){try{await run('taskkill.exe',['/PID',String(proc.pid),'/F'],{windowsHide:true,timeout:8000})}catch(e){failed.push(proc.pid)}}
 await new Promise(resolve=>setTimeout(resolve,650));
 const remaining=(await playerProcesses()).length;
 return {closed:processes.length-remaining,remaining,failed};
}
async function active(){
 const root=await runningPlayer();if(root)observedRoot=root;
 const vv=await versions();
 const v=vv.find(v=>v.root.toLowerCase()===(root||observedRoot||'').toLowerCase());
 return v||null;
}
async function requireTarget(){const v=await active();if(!v)throw Error('Abra o Roblox oficial e clique em Detectar instalação. Depois feche o jogo para aplicar.');if((await processStatus()).running)throw Error('O Roblox ainda está em execução. Use o botão Encerrar Roblox na página inicial e tente novamente.');return v}
const resources=[
 {id:'cursor-arrow',category:'cursor',name:'Seta do mouse',description:'Cursor padrão utilizado pelo mouse.',rel:'content/textures/Cursors/KeyboardMouse/ArrowCursor.png'},
 {id:'cursor-text',category:'cursor',name:'Cursor de texto',description:'Cursor exibido em campos de texto.',rel:'content/textures/Cursors/KeyboardMouse/IBeamCursor.png'},
 {id:'cursor-cross',category:'cursor',name:'Cursor de mira',description:'Cursor em cruz, usado em algumas situações.',rel:'content/textures/Cursors/CrossMouseIcon.png'}
];
async function load(){await fs.mkdir(backupDir(),{recursive:true});try{const m=JSON.parse(await fs.readFile(manifestPath(),'utf8'));return m&&typeof m==='object'&&!Array.isArray(m)?m:{}}catch(e){if(e.code==='ENOENT')return {};throw Error('Não foi possível ler o registro de backups. Nenhum arquivo foi alterado.')}}
async function save(m){await fs.mkdir(backupDir(),{recursive:true});const tmp=manifestPath()+'.tmp';await fs.writeFile(tmp,JSON.stringify(m,null,2));await fs.rename(tmp,manifestPath())}
async function targetFor(item,root){const p=path.join(root,...item.rel.split('/'));const real=await fs.realpath(p).catch(()=>null);if(!real||path.normalize(real).toLowerCase()!==path.normalize(p).toLowerCase())throw Error('Arquivo original não encontrado nesta versão do Roblox.');return p}
async function fontResources(v){
 const folder=path.join(v.root,'content','fonts');const out=[];
 // Famílias usuais da interface. Outros arquivos são preservados.
 const allowed=/^(BuilderSans-(Regular|Medium|Bold|ExtraBold)\.otf|SourceSansPro-(Regular|Light|Semibold|Bold|It)\.ttf)$/i;
 for(const entry of await fs.readdir(folder,{withFileTypes:true}).catch(()=>[])){
  if(!entry.isFile()||!allowed.test(entry.name))continue;
  out.push({id:'font:'+entry.name,category:'font',name:entry.name,description:'Fonte de interface (teste).',rel:'content/fonts/'+entry.name});
 }return out;
}
async function allResources(v){return [...resources,...(v?await fontResources(v):[])];}
async function listing(){const v=await active();const m=await load();const items=[];if(v)for(const item of await allResources(v)){const p=path.join(v.root,...item.rel.split('/'));if(await exists(p))items.push({...item,filename:path.basename(p),extension:path.extname(p),modified:!!m[sha(Buffer.from(p.toLowerCase()))]})}return {version:v?.name||null,items:items.filter(x=>x.category==='cursor'),fontCount:v?(await fontResources(v)).length:0,backupCount:Object.keys(m).length}}
async function apply(id){const v=await requireTarget();const item=(await allResources(v)).find(x=>x.id===id);if(!item)throw Error('Opção desconhecida.');const target=await targetFor(item,v.root);const ext=path.extname(target).toLowerCase();const picked=await dialog.showOpenDialog({title:'Escolher '+item.name,properties:['openFile'],filters:[{name:ext.toUpperCase()+' — mesmo formato do original',extensions:[ext.slice(1)]}]});if(picked.canceled||!picked.filePaths.length)return {cancelled:true};const source=picked.filePaths[0];if(path.extname(source).toLowerCase()!==ext)throw Error('Escolha um arquivo '+ext+' para esta opção.');const buf=await fs.readFile(source);if(!buf.length||buf.length>10*1024*1024)throw Error('Arquivo vazio ou maior que 10 MB.');if((ext==='.ttf'||ext==='.otf')&&!(ext==='.ttf'&&buf.subarray(0,4).equals(Buffer.from([0,1,0,0]))||ext==='.otf'&&buf.subarray(0,4).toString()==='OTTO'))throw Error('Arquivo de fonte inválido: use uma fonte '+ext+' verdadeira.');if(ext==='.png'&&!buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Este arquivo não é um PNG válido.');if(ext==='.ogg'&&buf.subarray(0,4).toString()!=='OggS')throw Error('Este arquivo não é um OGG válido.');if(ext==='.mp3'&&!(buf.subarray(0,3).toString()==='ID3'||(buf[0]===255&&(buf[1]&224)===224)))throw Error('Este arquivo não parece ser um MP3 válido.');
 const m=await load();const key=sha(Buffer.from(target.toLowerCase()));const backup=path.join(backupDir(),key+'.bak');const before=await fs.readFile(target);if(!m[key]){await fs.mkdir(backupDir(),{recursive:true});try{await fs.writeFile(backup,before,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e;const existing=await fs.readFile(backup);if(!existing.equals(before))throw Error('Já existe um backup diferente. Não foi feita nenhuma alteração.')}m[key]={target,backup,originalHash:sha(before),modifiedHash:null};await save(m)}else{if(m[key].target!==target)throw Error('O caminho mudou.');const current=sha(before);if(current!==m[key].modifiedHash&&current!==m[key].originalHash)throw Error('O Roblox alterou este arquivo. Não vamos sobrescrevê-lo.')}
 try{await fs.writeFile(target,buf);m[key].modifiedHash=sha(buf);await save(m)}catch(e){throw Error('Falha ao aplicar. O backup foi preservado. '+e.message)}return {ok:true}}

// Compatibilidade experimental: preservamos os bytes TTF/OTF originais, mesmo em
// destinos com extensão diferente. Isto NÃO é conversão real de formato.
// Fontes de ícones, emojis e famílias não selecionadas permanecem intactas.
async function applyFontAll(){
 const v=await requireTarget();
 const fonts=await fontResources(v);
 if(!fonts.length)throw Error('Nenhuma fonte compatível encontrada nesta versão.');
 const picked=await dialog.showOpenDialog({title:'Escolher uma única fonte para aplicar',properties:['openFile'],filters:[{name:'Fontes TTF ou OTF',extensions:['ttf','otf']}]});
 if(picked.canceled||!picked.filePaths.length)return {cancelled:true};
 const source=picked.filePaths[0],ext=path.extname(source).toLowerCase();
 if(!['.ttf','.otf'].includes(ext))throw Error('Escolha uma fonte .ttf ou .otf.');
 const buf=await fs.readFile(source);
 if(buf.length<12||buf.length>10*1024*1024)throw Error('Fonte vazia ou maior que 10 MB.');
 if(!(ext==='.ttf'&&buf.subarray(0,4).equals(Buffer.from([0,1,0,0]))||ext==='.otf'&&buf.subarray(0,4).toString()==='OTTO'))throw Error('O arquivo não corresponde ao formato de fonte escolhido.');
 const targets=fonts;
 const m=await load(),changes=[],skipped=0;
 // Validar TODOS os alvos antes de escrever qualquer um.
 for(const item of targets){
  const target=await targetFor(item,v.root),key=sha(Buffer.from(target.toLowerCase()));
  const current=await fs.readFile(target),entry=m[key];
  if(entry&&sha(current)!==entry.originalHash&&sha(current)!==entry.modifiedHash)throw Error('Arquivo modificado externamente ou aplicação anterior interrompida: '+item.name+'. Restaure o backup antes de tentar novamente.');
  changes.push({target,key,current,entry,backup:path.join(backupDir(),key+'.bak')});
 }
 // Persistir backups antes de começar a alteração; falhas abortam sem modificar fontes.
 for(const c of changes){
  if(!c.entry){try{await fs.writeFile(c.backup,c.current,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e;const b=await fs.readFile(c.backup);if(!b.equals(c.current))throw Error('Backup conflitante para '+path.basename(c.target));}
   m[c.key]={target:c.target,backup:c.backup,originalHash:sha(c.current),modifiedHash:null};
  }
 }
 await save(m);
 const written=[];
 try{
  for(const c of changes){
   await fs.writeFile(c.target,buf);
   written.push(c);
   if(sha(await fs.readFile(c.target))!==sha(buf))throw Error('Falha na verificação da fonte: '+path.basename(c.target));
   m[c.key].modifiedHash=sha(buf);
   // Registra cada alteração para permitir restauração mesmo após fechamento inesperado.
   await save(m);
  }
 }catch(e){
  const failures=[];
  for(const c of written.reverse()){
   try{await fs.writeFile(c.target,c.current);m[c.key].modifiedHash=sha(c.current)}
   catch(rollbackError){failures.push(path.basename(c.target))}
  }
  await save(m);
  throw Error('Falha na alteração. Tentativa de reversão realizada.'+(failures.length?' Verifique manualmente: '+failures.join(', '):'')+' '+e.message);
 }
 return {ok:true,changed:changes.length,skipped,extension:ext,version:v.name,files:changes.map(c=>path.basename(c.target)),warning:'Modo experimental: a fonte original foi copiada para os arquivos BuilderSans (.otf) e SourceSansPro (.ttf), sem conversão real. O Roblox pode ignorar ou rejeitar arquivos cujo conteúdo não corresponde à extensão. Restaure as fontes se houver problemas.'};
}

async function restoreKey(key){const m=await load(),e=m[key];if(!e)throw Error('Backup não encontrado.');const data=await fs.readFile(e.backup);if(sha(data)!==e.originalHash)throw Error('Backup não passou na verificação de integridade.');const current=await fs.readFile(e.target).catch(()=>null);if(!current)throw Error('O arquivo original não existe mais. Backup mantido.');if(sha(current)!==e.modifiedHash&&sha(current)!==e.originalHash)throw Error('O Roblox atualizou este arquivo. Backup mantido para evitar sobrescrever a atualização.');await fs.writeFile(e.target,data);delete m[key];await save(m);return true}
async function restore(id){const v=await requireTarget();if(!v)throw Error('Recurso indisponível.');const item=(await allResources(v)).find(x=>x.id===id);if(!item)throw Error('Recurso indisponível.');const target=await targetFor(item,v.root);return restoreKey(sha(Buffer.from(target.toLowerCase())))}
async function restoreFonts(){
 const v=await requireTarget();const m=await load();let restored=0;const failed=[];
 const prefix=path.join(v.root,'content','fonts')+path.sep;
 for(const [key,entry] of Object.entries(m)){
  if(!path.normalize(entry.target).toLowerCase().startsWith(path.normalize(prefix).toLowerCase()))continue;
  try{await restoreKey(key);restored++}catch(e){failed.push({file:path.basename(entry.target),reason:e.message})}
 }
 return {restored,failed};
}
async function restoreAll(){if((await processStatus()).running)throw Error('O Roblox ainda está em execução. Encerre-o antes de restaurar.');const m=await load();let ok=0;const failed=[];const v=await active();for(const [key,e] of Object.entries(m)){if(!v||!path.normalize(e.target).toLowerCase().startsWith(path.normalize(v.root+path.sep).toLowerCase())){failed.push({file:path.basename(e.target),reason:'Backup de outra versão; preservado.'});continue}try{await restoreKey(key);ok++}catch(err){failed.push({file:path.basename(e.target),reason:err.message})}}return {restored:ok,failed}}
async function status(){const v=await active();return {installed:!!v,version:v?.name||null,versions:[],detail:v?'Instalação identificada pelo processo Roblox Player nesta sessão':'Abra o Roblox e clique em Detectar instalação para identificar a versão correta',processes:await processStatus()}}
function window(){const w=new BrowserWindow({width:1120,height:760,minWidth:870,minHeight:590,backgroundColor:'#fff',icon:path.join(__dirname,'../assets/catbox.ico'),webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});w.setMenuBarVisibility(false);w.loadFile(path.join(__dirname,'index.html'));w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault())}
app.whenReady().then(()=>{ipcMain.handle('status',status);ipcMain.handle('close-roblox',closePlayers);ipcMain.handle('font-all',applyFontAll);ipcMain.handle('launch',()=>shell.openExternal('roblox://'));ipcMain.handle('list',listing);ipcMain.handle('apply',(_e,id)=>apply(id));ipcMain.handle('restore',(_e,id)=>restore(id));ipcMain.handle('restore-all',restoreAll);ipcMain.handle('restore-fonts',restoreFonts);ipcMain.handle('backup-folder',async()=>{await fs.mkdir(backupDir(),{recursive:true});return shell.openPath(backupDir())});ipcMain.handle('discord',()=>shell.openExternal(DISCORD));window();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)window()})});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
