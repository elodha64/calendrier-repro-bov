const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='reproBovineV1';
const DEFAULTS={heatWatchStart:18,heatWatchEnd:24,presumedPregnant:25,pregCheck:35,preCalving:285,term:295,postpartumStart:30,postpartumWarn:45,postpartumLate:60};
const NOTIF_DEFAULTS={enabled:false,time:'07:00',heatReturn:true,pregCheck:true,precalving:true,term:true,postpartum:true};
const HERD_DEFAULTS={minFemaleAgeMonths:12};
let state=loadState();
let calMode='week', calDate=today(), cowFilter='all';

// --- Repro Bovine v1.4.2 : Supabase cloud / multi-utilisateurs + password recovery ---
const SUPABASE_URL='https://uuyiazyofyuxwiolizr.supabase.co';
const SUPABASE_KEY='sb_publishable_FtQAhsVfoPbyG1hD3lT1VQ_LhgiW8Hl';
const HOUSEHOLD_ID='5826e26b-eb84-460f-bb8e-7a2194e905b2';
const CLOUD_SESSION_KEY='reproBovineSupabaseSession';
const CLOUD_SHADOW_KEY='reproBovineCloudShadowV14';
let cloudSession=null, cloudSyncTimer=null, cloudSyncing=false, cloudReady=false;

function cloudSetStatus(text,kind=''){
 const h=$('#cloudBadge'); if(h){h.textContent=text;h.className='cloud-badge '+kind}
 const s=$('#cloudStatusText'); if(s)s.textContent=text;
}
function getStoredCloudSession(){try{return JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)||'null')}catch(_){return null}}
function storeCloudSession(s){cloudSession=s||null;if(s)localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(CLOUD_SESSION_KEY);updateCloudUI()}
function sessionExpired(s){if(!s?.expires_at)return false;return Date.now()/1000>s.expires_at-60}
async function sbAuthFetch(path,opts={}){
 const headers={'apikey':SUPABASE_KEY,'Content-Type':'application/json',...(opts.headers||{})};
 return fetch(SUPABASE_URL+path,{...opts,headers});
}
async function refreshCloudSession(){
 if(!cloudSession?.refresh_token)return false;
 try{const r=await sbAuthFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:cloudSession.refresh_token})});if(!r.ok)throw Error();const s=await r.json();s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeCloudSession(s);return true}catch(_){return false}
}
async function ensureCloudSession(){if(!cloudSession)return false;if(sessionExpired(cloudSession)){if(!navigator.onLine)return true;return refreshCloudSession()}return true}
async function cloudFetch(path,opts={},retry=true){
 if(!await ensureCloudSession())throw new Error('SESSION_EXPIRED');
 const headers={'apikey':SUPABASE_KEY,'Authorization':'Bearer '+cloudSession.access_token,'Content-Type':'application/json',...(opts.headers||{})};
 const r=await fetch(SUPABASE_URL+path,{...opts,headers});
 if(r.status===401&&retry&&await refreshCloudSession())return cloudFetch(path,opts,false);
 if(!r.ok){let msg='';try{msg=(await r.json()).message||''}catch(_){msg=await r.text()}throw new Error(msg||`Supabase ${r.status}`)}
 if(r.status===204)return null;const t=await r.text();return t?JSON.parse(t):null;
}
async function cloudLogin(email,password){
 const r=await sbAuthFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
 if(!r.ok){let j={};try{j=await r.json()}catch(_){};throw new Error(j.error_description||j.msg||j.message||'Identifiants incorrects')}
 const s=await r.json();s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeCloudSession(s);return s;
}
async function cloudLogout(){try{if(cloudSession?.access_token)await cloudFetch('/auth/v1/logout',{method:'POST'})}catch(_){}storeCloudSession(null);cloudReady=false;showAuthDialog()}
async function cloudRecover(email){const redirect=location.origin+location.pathname;const r=await sbAuthFetch('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:JSON.stringify({email})});if(!r.ok){let j={};try{j=await r.json()}catch(_){};throw new Error(j.msg||j.message||'Envoi impossible')}return true}
function cloudUserEmail(){return cloudSession?.user?.email||''}
function updateCloudUI(){
 const email=cloudUserEmail();const e=$('#cloudUserEmail');if(e)e.textContent=email||'Non connecté';
 const out=$('#cloudLogoutBtn');if(out)out.classList.toggle('hidden',!cloudSession);
}
function showAuthDialog(){const d=$('#authDialog');if(d&&!d.open)d.showModal()}
function hideAuthDialog(){const d=$('#authDialog');if(d?.open)d.close()}
function showPasswordResetDialog(){hideAuthDialog();const d=$('#passwordResetDialog');if(d&&!d.open)d.showModal()}
function hidePasswordResetDialog(){const d=$('#passwordResetDialog');if(d?.open)d.close()}
async function hydrateCloudUser(){
 if(!cloudSession?.access_token)return;
 try{const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+cloudSession.access_token}});if(r.ok){cloudSession.user=await r.json();storeCloudSession(cloudSession)}}catch(_){}
}
function recoveryParams(){
 const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
 const search=new URLSearchParams(location.search||'');
 const get=k=>hash.get(k)||search.get(k);
 return {
   type:get('type'),
   access_token:get('access_token'),
   refresh_token:get('refresh_token'),
   expires_in:Number(get('expires_in')||3600),
   error:get('error_description')||get('error'),
   error_code:get('error_code'),
   code:get('code')
 };
}
async function handlePasswordRecoveryRedirect(){
 const p=recoveryParams();
 if(p.error){$('#authError').textContent=decodeURIComponent(p.error);showAuthDialog();return false}
 if(p.type==='recovery' && !p.access_token){
   $('#authError').textContent='Le lien de récupération est incomplet ou a expiré. Demande un nouveau lien.';
   showAuthDialog();
   return false;
 }
 if(p.type!=='recovery' || !p.access_token)return false;
 const s={access_token:p.access_token,refresh_token:p.refresh_token||'',expires_in:p.expires_in,expires_at:Math.floor(Date.now()/1000)+p.expires_in,token_type:'bearer'};
 storeCloudSession(s);
 await hydrateCloudUser();
 // Retire les jetons de l'URL dès qu'ils sont stockés.
 history.replaceState(null,document.title,location.pathname);
 showPasswordResetDialog();
 cloudSetStatus('🔐 Nouveau mot de passe à définir','warn');
 return true;
}
async function updateRecoveredPassword(password){
 if(!cloudSession?.access_token)throw new Error('Le lien de récupération a expiré. Demande un nouveau lien.');
 const r=await fetch(SUPABASE_URL+'/auth/v1/user',{method:'PUT',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+cloudSession.access_token,'Content-Type':'application/json'},body:JSON.stringify({password})});
 if(!r.ok){let j={};try{j=await r.json()}catch(_){};throw new Error(j.msg||j.message||j.error_description||'Impossible de modifier le mot de passe')}
 cloudSession.user=await r.json();storeCloudSession(cloudSession);return true;
}

function cowNational(c){return c.id&&!String(c.id).startsWith('manual-')&&!String(c.id).startsWith('cloud-')?String(c.id):null}
function cowPayload(c){return {id:c.cloudId||undefined,household_id:HOUSEHOLD_ID,work_number:c.workNumber||null,national_number:cowNational(c),name:c.name||null,birth_date:c.birthDate||null,sex:'F',breed:c.breed||null,last_calving_date:c.lastCalving||null,calving_rank:Number(c.calvingCount)||0,active:c.active!==false,exit_date:c.exitDate||null,exit_reason:c.exitReason||null,repro_override:c.reproOverride||null,manual_created:c.source==='manual',source_updated_at:new Date().toISOString()}}
function bullPayload(b){return {id:b.cloudId||undefined,household_id:HOUSEHOLD_ID,name:b.name||b.workNumber||'Sans nom',number:b.workNumber||null,breed:b.breed||null,bull_type:'natural',active:!!b.activeBreeder,notes:b.notes||null,manual_modified:!!b.manualEdit}}
function eventPayload(c,e){let bullId=null;if(e.mode==='natural'&&e.bull){const b=state.males.find(x=>x.cloudId&&(x.name===e.bull||x.workNumber===e.bull));bullId=b?.cloudId||null}return {id:e.cloudId||undefined,household_id:HOUSEHOLD_ID,cow_id:c.cloudId,event_type:e.type,event_date:e.date,breeding_type:e.type==='service'?(e.mode||'natural'):null,bull_id:bullId,bull_name:e.type==='service'?(e.bull||null):null,notes:e.note||null,created_by:cloudSession?.user?.id||null}}
function localCowFromRow(r,old){return {...(old||{}),cloudId:r.id,id:r.national_number||(old?.id)||('cloud-'+r.id),workNumber:r.work_number||'',name:r.name||'',birthDate:r.birth_date||'',breed:r.breed||'',lastCalving:r.last_calving_date||'',calvingCount:Number(r.calving_rank)||0,active:r.active!==false,exitDate:r.exit_date||'',exitReason:r.exit_reason||'',exitOrigin:r.active===false?'cloud':'',reproOverride:r.repro_override||'',source:r.manual_created?'manual':'csv',events:old?.events||[]}}
function localBullFromRow(r,old){return {...(old||{}),cloudId:r.id,id:old?.id||('cloud-'+r.id),workNumber:r.number||'',name:r.name||'',birthDate:old?.birthDate||'',breed:r.breed||'',activeBreeder:r.active!==false,manualEdit:!!r.manual_modified}}
function localEventFromRow(r,old){return {...(old||{}),cloudId:r.id,id:old?.id||('cloud-'+r.id),type:r.event_type,date:r.event_date,mode:r.breeding_type||undefined,bull:r.bull_name||'',note:r.notes||''}}
function canonicalCow(c){const p=cowPayload(c);delete p.id;delete p.source_updated_at;return p}
function canonicalBull(b){const p=bullPayload(b);delete p.id;return p}
function canonicalEvent(c,e){const p=eventPayload(c,e);delete p.id;delete p.created_by;return p}
function currentCloudShadow(){
 const cows={},bulls={},events={};state.cows.forEach(c=>{const k=c.cloudId||'local:'+c.id;cows[k]=canonicalCow(c);(c.events||[]).forEach(e=>{const ek=e.cloudId||'local:'+e.id;if(c.cloudId)events[ek]=canonicalEvent(c,e)})});state.males.forEach(b=>{const k=b.cloudId||'local:'+b.id;bulls[k]=canonicalBull(b)});
 return {cows,bulls,events,settings:cloudSettingsPayload()}
}
function loadCloudShadow(){try{return JSON.parse(localStorage.getItem(CLOUD_SHADOW_KEY)||'null')}catch(_){return null}}
function saveCloudShadow(){localStorage.setItem(CLOUD_SHADOW_KEY,JSON.stringify(currentCloudShadow()))}
function sameJSON(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function cloudSettingsPayload(){return {household_id:HOUSEHOLD_ID,min_female_age_months:Number(state.herdSettings?.minFemaleAgeMonths)||0,heat_return_days:Number(state.settings?.heatWatchEnd)||24,presumed_pregnant_days:Number(state.settings?.presumedPregnant)||25,pregnancy_check_days:Number(state.settings?.pregCheck)||35,precalving_days:Number(state.settings?.preCalving)||285,term_days:Number(state.settings?.term)||295,postpartum_watch_days:Number(state.settings?.postpartumStart)||30,notification_time:(state.notifications?.time||'07:00')+':00',notif_heat_return:state.notifications?.heatReturn!==false,notif_preg_check:state.notifications?.pregCheck!==false,notif_precalving:state.notifications?.precalving!==false,notif_term:state.notifications?.term!==false,notif_postpartum:state.notifications?.postpartum!==false}}
function applyCloudSettings(r){if(!r)return;state.herdSettings={...state.herdSettings,minFemaleAgeMonths:Number(r.min_female_age_months??state.herdSettings.minFemaleAgeMonths)};state.settings={...state.settings,heatWatchEnd:Number(r.heat_return_days??state.settings.heatWatchEnd),presumedPregnant:Number(r.presumed_pregnant_days??state.settings.presumedPregnant),pregCheck:Number(r.pregnancy_check_days??state.settings.pregCheck),preCalving:Number(r.precalving_days??state.settings.preCalving),term:Number(r.term_days??state.settings.term),postpartumStart:Number(r.postpartum_watch_days??state.settings.postpartumStart)};state.notifications={...state.notifications,time:String(r.notification_time||state.notifications.time||'07:00').slice(0,5),heatReturn:r.notif_heat_return!==false,pregCheck:r.notif_preg_check!==false,precalving:r.notif_precalving!==false,term:r.notif_term!==false,postpartum:r.notif_postpartum!==false}}

async function insertNewCows(list){if(!list.length)return;const payload=list.map(c=>{const p=cowPayload(c);delete p.id;return p});const rows=await cloudFetch('/rest/v1/cows',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});for(const c of list){const nat=cowNational(c);const r=rows.find(x=>(nat&&x.national_number===nat)||(!nat&&x.work_number===c.workNumber&&String(x.birth_date||'')===String(c.birthDate||'')))||rows.shift();if(r)c.cloudId=r.id}}
async function upsertCows(list){if(!list.length)return;await cloudFetch('/rest/v1/cows?on_conflict=id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(list.map(c=>cowPayload(c)))})}
async function insertNewBulls(list){if(!list.length)return;const payload=list.map(b=>{const p=bullPayload(b);delete p.id;return p});const rows=await cloudFetch('/rest/v1/bulls',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});list.forEach((b,i)=>{const r=rows.find(x=>x.number===b.workNumber&&x.name===b.name)||rows[i];if(r)b.cloudId=r.id})}
async function upsertBulls(list){if(!list.length)return;await cloudFetch('/rest/v1/bulls?on_conflict=id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(list.map(b=>bullPayload(b)))})}
async function insertNewEvents(items){if(!items.length)return;const payload=items.filter(x=>x.c.cloudId).map(x=>eventPayload(x.c,x.e));payload.forEach(p=>delete p.id);if(!payload.length)return;const rows=await cloudFetch('/rest/v1/repro_events',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});let i=0;for(const x of items.filter(x=>x.c.cloudId)){const r=rows[i++];if(r)x.e.cloudId=r.id}}
async function upsertEvents(items){if(!items.length)return;await cloudFetch('/rest/v1/repro_events?on_conflict=id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(items.map(x=>eventPayload(x.c,x.e)))})}
async function upsertCloudSettings(){await cloudFetch('/rest/v1/app_settings?on_conflict=household_id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(cloudSettingsPayload())})}

async function cloudIsEmpty(){const rows=await cloudFetch(`/rest/v1/cows?select=id&household_id=eq.${HOUSEHOLD_ID}&limit=1`);return !rows?.length}
async function uploadAllLocalToCloud(){
 cloudSetStatus('☁️ Envoi initial…','sync');
 await insertNewCows(state.cows.filter(c=>!c.cloudId));await upsertCows(state.cows.filter(c=>c.cloudId));
 await insertNewBulls(state.males.filter(b=>!b.cloudId));await upsertBulls(state.males.filter(b=>b.cloudId));
 const ev=[];state.cows.forEach(c=>(c.events||[]).forEach(e=>ev.push({c,e})));await insertNewEvents(ev.filter(x=>!x.e.cloudId));await upsertEvents(ev.filter(x=>x.e.cloudId));
 await upsertCloudSettings();localStorage.setItem(STORE,JSON.stringify(state));saveCloudShadow();
}
async function pullCloud({preserveLocalUnlinked=false}={}){
 const preEvents=preserveLocalUnlinked?state.cows.flatMap(c=>(c.events||[]).filter(e=>!e.cloudId).map(e=>({cow:c,event:{...e}}))):[];
 const preBulls=preserveLocalUnlinked?state.males.filter(b=>!b.cloudId).map(b=>({...b})):[];
 const [cr,er,br,sr]=await Promise.all([
  cloudFetch(`/rest/v1/cows?select=*&household_id=eq.${HOUSEHOLD_ID}&order=work_number.asc`),
  cloudFetch(`/rest/v1/repro_events?select=*&household_id=eq.${HOUSEHOLD_ID}&order=event_date.asc`),
  cloudFetch(`/rest/v1/bulls?select=*&household_id=eq.${HOUSEHOLD_ID}&bull_type=eq.natural&order=name.asc`),
  cloudFetch(`/rest/v1/app_settings?select=*&household_id=eq.${HOUSEHOLD_ID}&limit=1`)
 ]);
 const localByCloud=new Map(state.cows.filter(c=>c.cloudId).map(c=>[c.cloudId,c]));
 const next=[];for(const r of cr||[]){let old=localByCloud.get(r.id)||state.cows.find(c=>(r.national_number&&cowNational(c)===r.national_number)||(!r.national_number&&c.workNumber===r.work_number&&String(c.birthDate||'')===String(r.birth_date||'')));next.push(localCowFromRow(r,old))}
 // Conserver seulement les fiches locales pas encore migrées vers le cloud.
 const remoteNationals=new Set((cr||[]).map(r=>r.national_number).filter(Boolean));const remoteWorks=new Set((cr||[]).map(r=>r.work_number));for(const c of state.cows){if(!c.cloudId&&!remoteNationals.has(cowNational(c))&&!remoteWorks.has(c.workNumber))next.push(c)}state.cows=next;
 const cowsByCloud=new Map(state.cows.filter(c=>c.cloudId).map(c=>[c.cloudId,c]));state.cows.forEach(c=>c.events=[]);
 for(const r of er||[]){const c=cowsByCloud.get(r.cow_id);if(c)c.events.push(localEventFromRow(r,null))}
 if(preserveLocalUnlinked){for(const x of preEvents){const c=state.cows.find(z=>(x.cow.cloudId&&z.cloudId===x.cow.cloudId)||z.id===x.cow.id||z.workNumber===x.cow.workNumber);if(!c)continue;const sig=e=>[e.type,e.date,e.mode||'',e.bull||'',e.note||''].join('|');if(!(c.events||[]).some(e=>sig(e)===sig(x.event))){c.events=c.events||[];c.events.push(x.event)}}}
 const oldBByCloud=new Map(state.males.filter(b=>b.cloudId).map(b=>[b.cloudId,b]));state.males=(br||[]).map(r=>localBullFromRow(r,oldBByCloud.get(r.id)||state.males.find(b=>b.workNumber===r.number&&b.name===r.name)));if(preserveLocalUnlinked){for(const b of preBulls){if(!state.males.some(x=>x.workNumber===b.workNumber&&x.name===b.name))state.males.push(b)}}
 state.aiBulls=[...new Set((er||[]).filter(r=>r.breeding_type==='ai'&&r.bull_name).map(r=>r.bull_name))];applyCloudSettings(sr?.[0]);state.meta={...(state.meta||{}),cloud:true,lastCloudSync:new Date().toISOString()};localStorage.setItem(STORE,JSON.stringify(state));renderAll();
}
async function pushDirtyLocal(){
 const sh=loadCloudShadow();if(!sh)return;
 const newC=state.cows.filter(c=>!c.cloudId);if(newC.length)await insertNewCows(newC);
 const dirtyC=state.cows.filter(c=>c.cloudId&&!sameJSON(canonicalCow(c),sh.cows?.[c.cloudId]));if(dirtyC.length)await upsertCows(dirtyC);
 const newB=state.males.filter(b=>!b.cloudId);if(newB.length)await insertNewBulls(newB);
 const dirtyB=state.males.filter(b=>b.cloudId&&!sameJSON(canonicalBull(b),sh.bulls?.[b.cloudId]));if(dirtyB.length)await upsertBulls(dirtyB);
 const items=[];state.cows.forEach(c=>(c.events||[]).forEach(e=>items.push({c,e})));const newE=items.filter(x=>x.c.cloudId&&!x.e.cloudId);if(newE.length)await insertNewEvents(newE);const dirtyE=items.filter(x=>x.e.cloudId&&!sameJSON(canonicalEvent(x.c,x.e),sh.events?.[x.e.cloudId]));if(dirtyE.length)await upsertEvents(dirtyE);
 if(!sameJSON(cloudSettingsPayload(),sh.settings))await upsertCloudSettings();localStorage.setItem(STORE,JSON.stringify(state));
}
async function syncCloud({silent=false}={}){
 if(cloudSyncing||!cloudSession||!navigator.onLine)return false;cloudSyncing=true;if(!silent)cloudSetStatus('☁️ Synchronisation…','sync');
 try{
  if(!loadCloudShadow()){
   if(await cloudIsEmpty())await uploadAllLocalToCloud();else {await pullCloud({preserveLocalUnlinked:true});await uploadAllLocalToCloud()}
  }else{await pushDirtyLocal();await pullCloud();saveCloudShadow()}
  cloudReady=true;cloudSetStatus('☁️ Cloud à jour','ok');updateCloudUI();return true;
 }catch(e){console.error('Cloud sync',e);cloudSetStatus('☁️ Hors ligne / synchro en attente','warn');return false}finally{cloudSyncing=false}
}
function scheduleCloudSync(){if(!cloudSession)return;clearTimeout(cloudSyncTimer);cloudSyncTimer=setTimeout(()=>syncCloud({silent:true}),900)}
async function initCloudAuth(){
 if(await handlePasswordRecoveryRedirect())return;
 cloudSession=getStoredCloudSession();updateCloudUI();
 if(!cloudSession){cloudSetStatus('☁️ Connexion requise','warn');showAuthDialog();return}
 hideAuthDialog();cloudSetStatus(navigator.onLine?'☁️ Connexion…':'☁️ Mode hors ligne',navigator.onLine?'sync':'warn');
 if(navigator.onLine){if(!await ensureCloudSession()){storeCloudSession(null);showAuthDialog();return}await hydrateCloudUser();await syncCloud()}
 else {cloudReady=true;renderAll()}
}


function normalizeState(x){
  x=x||{};
  x.cows=(x.cows||[]).map(c=>({...c,active:c.active!==false,source:c.source||'csv',events:c.events||[],reproOverride:c.reproOverride||''})); x.males=x.males||[]; x.aiBulls=x.aiBulls||[];
  x.settings={...DEFAULTS,...(x.settings||{})};
  x.notifications={...NOTIF_DEFAULTS,...(x.notifications||{})};
  x.herdSettings={...HERD_DEFAULTS,...(x.herdSettings||{})};
  x.meta=x.meta||{source:window.INITIAL_HERD.source,importedAt:window.INITIAL_HERD.importedAt};
  return x;
}
function loadState(){
  const raw=localStorage.getItem(STORE);
  if(raw){try{return normalizeState(JSON.parse(raw))}catch(e){}}
  return normalizeState({cows:window.INITIAL_HERD.cows||[],males:window.INITIAL_HERD.males||[],aiBulls:[],settings:{...DEFAULTS},notifications:{...NOTIF_DEFAULTS},herdSettings:{...HERD_DEFAULTS},meta:{source:window.INITIAL_HERD.source,importedAt:window.INITIAL_HERD.importedAt}});
}
function save(){localStorage.setItem(STORE,JSON.stringify(state)); renderAll(); scheduleCloudSync()}
function today(){const d=new Date(); d.setHours(12,0,0,0); return d}
function dateISO(d){return d.toISOString().slice(0,10)}
function parseDate(s){if(!s)return null; const d=new Date(s+'T12:00:00'); return isNaN(d)?null:d}
function addDays(s,n){const d=typeof s==='string'?parseDate(s):new Date(s); d.setDate(d.getDate()+Number(n)); return d}
function diffDays(a,b){return Math.floor((parseDate(a)-parseDate(b))/86400000)}
function frDate(s,opts={day:'2-digit',month:'2-digit',year:'numeric'}){const d=typeof s==='string'?parseDate(s):s; return d?d.toLocaleDateString('fr-FR',opts):'—'}
function ageText(b){const d=parseDate(b); if(!d)return 'âge inconnu'; let m=(today().getFullYear()-d.getFullYear())*12+today().getMonth()-d.getMonth(); if(today().getDate()<d.getDate())m--; return m<24?`${m} mois`:`${Math.floor(m/12)} ans ${m%12?m%12+' mois':''}`.trim()}
function ageMonths(b){const d=parseDate(b);if(!d)return null;let m=(today().getFullYear()-d.getFullYear())*12+today().getMonth()-d.getMonth();if(today().getDate()<d.getDate())m--;return Math.max(0,m)}
function isReproEligible(c){if(c.active===false)return false;if(c.reproOverride==='include')return true;if(c.reproOverride==='exclude')return false;const m=ageMonths(c.birthDate);return m===null?true:m>=Number(state.herdSettings?.minFemaleAgeMonths??HERD_DEFAULTS.minFemaleAgeMonths)}
function isUnderAge(c){if(c.active===false)return false;const m=ageMonths(c.birthDate);return m!==null&&m<Number(state.herdSettings?.minFemaleAgeMonths??HERD_DEFAULTS.minFemaleAgeMonths)}
function norm(s){return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function esc(s){return (s??'').toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function events(c){return (c.events||[]).slice().sort((a,b)=>a.date.localeCompare(b.date))}
function latest(c,type){return events(c).filter(e=>!type||e.type===type).at(-1)||null}
function latestAfter(c,type,date){return events(c).filter(e=>e.type===type&&e.date>date).at(-1)||null}
function lastCalving(c){const e=latest(c,'calving'); return e?.date||c.lastCalving||''}
function lastService(c){return latest(c,'service')}

function reproductiveStatus(c){
  const ev=events(c), last=ev.at(-1); const svc=lastService(c); const calv=lastCalving(c);
  if(last?.type==='pregnant' && (!svc||last.date>=svc.date)){
    const base=svc?.date||last.date, days=Math.max(0,diffDays(dateISO(today()),base));
    return {key:'pregnant',label:`Pleine confirmée • ${days} j`,days,base,cls:'ok'};
  }
  if(svc){
    const later=ev.filter(e=>e.date>svc.date);
    if(later.some(e=>['heat','not_pregnant','calving'].includes(e.type))){
      // a later heat/negative/calving closes this service
    } else {
      const days=Math.max(0,diffDays(dateISO(today()),svc.date));
      if(days>=state.settings.presumedPregnant)return {key:'presumed',label:`Supposée pleine • ${days} j`,days,base:svc.date,cls:'warn'};
      return {key:'watch',label:`Après ${svc.mode==='ai'?'IA':'saillie'} • J+${days}`,days,base:svc.date,cls:'neutral'};
    }
  }
  if(calv){
    const days=Math.max(0,diffDays(dateISO(today()),calv));
    return {key:'postpartum',label:`Post-vêlage • J+${days}`,days,base:calv,cls:days>=state.settings.postpartumLate?'danger':days>=state.settings.postpartumStart?'warn':'neutral'};
  }
  return {key:'open',label:'À suivre',days:null,base:null,cls:'neutral'};
}

function buildAlerts(){
  const out=[], S=state.settings, now=dateISO(today());
  for(const c of state.cows.filter(isReproEligible)){
    const ev=events(c), svc=lastService(c), calv=lastCalving(c);
    if(svc){
      const later=ev.filter(e=>e.date>svc.date);
      const closed=later.some(e=>['heat','not_pregnant','calving'].includes(e.type));
      const confirmed=later.some(e=>e.type==='pregnant');
      if(!closed){
        if(!confirmed){
          const start=dateISO(addDays(svc.date,S.heatWatchStart)), end=dateISO(addDays(svc.date,S.heatWatchEnd));
          out.push({cow:c,type:'heat_return',date:start,endDate:end,icon:'🔁',title:'Surveiller retour en chaleur',meta:`${svc.mode==='ai'?'IA':'Saillie'} du ${frDate(svc.date)} • fenêtre J+${S.heatWatchStart} à J+${S.heatWatchEnd}`});
          const pc=dateISO(addDays(svc.date,S.pregCheck));
          out.push({cow:c,type:'preg_check',date:pc,icon:'🩺',title:'Diagnostic de gestation à envisager',meta:`J+${S.pregCheck} après ${svc.mode==='ai'?'IA':'saillie'}`});
        }
        const pre=dateISO(addDays(svc.date,S.preCalving)), term=dateISO(addDays(svc.date,S.term));
        out.push({cow:c,type:'precalving',date:pre,icon:'🍼',title:'Vêlage sous ~10 jours',meta:`Terme théorique ${frDate(term)} • J+${S.preCalving}`});
        out.push({cow:c,type:'term',date:term,icon:'⚠️',title:'Terme théorique atteint',meta:`${svc.mode==='ai'?'IA':'Saillie'} du ${frDate(svc.date)} • J+${S.term}`});
      }
    }
    if(calv){
      const after=ev.filter(e=>e.date>calv), restarted=after.some(e=>['heat','service'].includes(e.type));
      if(!restarted){
        const d1=dateISO(addDays(calv,S.postpartumStart)), d2=dateISO(addDays(calv,S.postpartumWarn)), d3=dateISO(addDays(calv,S.postpartumLate));
        out.push({cow:c,type:'post_start',date:d1,icon:'👀',title:'Commencer surveillance des chaleurs',meta:`J+${S.postpartumStart} après vêlage`});
        out.push({cow:c,type:'post_warn',date:d2,icon:'🔎',title:'Retour en cyclicité à surveiller',meta:`Aucune chaleur enregistrée • J+${S.postpartumWarn}`});
        out.push({cow:c,type:'post_late',date:d3,ongoing:true,icon:'🚩',title:'Pas de chaleur enregistrée post-vêlage',meta:`Depuis le vêlage du ${frDate(calv)} • J+${Math.max(0,diffDays(now,calv))}`});
      }
    }
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.cow.workNumber.localeCompare(b.cow.workNumber));
}
function activeOn(alert,day){
  if(alert.endDate)return day>=alert.date&&day<=alert.endDate;
  if(alert.ongoing)return day>=alert.date;
  return day===alert.date;
}
function alertsForDay(day){return buildAlerts().filter(a=>activeOn(a,day))}
function alertsBetween(start,end){return buildAlerts().filter(a=>{
  if(a.ongoing)return a.date<=end;
  const ae=a.endDate||a.date; return ae>=start&&a.date<=end;
})}

function renderHome(){
  const now=dateISO(today()), weekEnd=dateISO(addDays(today(),7));
  const td=alertsForDay(now), wk=alertsBetween(dateISO(addDays(today(),1)),weekEnd);
  $('#countToday').textContent=td.length; $('#countWeek').textContent=wk.length;
  $('#countPregnant').textContent=state.cows.filter(c=>isReproEligible(c)&&['pregnant','presumed'].includes(reproductiveStatus(c).key)).length;
  $('#todayAlerts').innerHTML=td.length?td.map(alertHTML).join(''):`<div class="empty">✅ Rien de particulier à surveiller aujourd’hui.</div>`;
  $('#weekAlerts').innerHTML=wk.length?wk.slice(0,20).map(alertHTML).join(''):`<div class="empty">Aucune échéance dans les 7 prochains jours.</div>`;
  bindCowOpen();
}
function alertHTML(a){return `<button class="card alert-card open-cow" data-id="${esc(a.cow.id)}"><span class="alert-icon">${a.icon}</span><span><span class="alert-title">${esc(a.cow.name||'Sans nom')} · ${esc(a.cow.workNumber)}</span><span class="alert-meta">${esc(a.title)} — ${esc(a.meta)}</span></span><span>›</span></button>`}

function renderCows(){
  const q=norm($('#cowSearch')?.value||'');
  let list=state.cows.filter(c=>!q||norm(c.name).includes(q)||norm(c.workNumber).includes(q)||norm(c.id).includes(q));
  if(cowFilter==='inactive')list=list.filter(c=>c.active===false);
  else if(cowFilter==='underage')list=list.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include');
  else if(cowFilter==='excluded')list=list.filter(c=>c.active!==false&&c.reproOverride==='exclude');
  else list=list.filter(c=>isReproEligible(c));
  if(cowFilter==='pregnant')list=list.filter(c=>['pregnant','presumed'].includes(reproductiveStatus(c).key));
  if(cowFilter==='watch')list=list.filter(c=>['watch'].includes(reproductiveStatus(c).key)||alertsForDay(dateISO(today())).some(a=>a.cow.id===c.id));
  if(cowFilter==='postpartum')list=list.filter(c=>reproductiveStatus(c).key==='postpartum');
  list.sort((a,b)=>(a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true}));
  $('#cowList').innerHTML=list.length?list.map(c=>{const s=reproductiveStatus(c), lc=lastCalving(c); const under=isUnderAge(c)&&c.reproOverride!=='include'; const excluded=c.reproOverride==='exclude'; const badge=c.active===false?'Sortie':under?'Hors âge':excluded?'Exclue du suivi':s.label; const cls=c.active===false||under||excluded?'neutral':s.cls; return `<button class="card cow-card open-cow ${c.active===false?'inactive-card':''}" data-id="${esc(c.id)}"><span><span class="cow-name">${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</span><span class="cow-sub">${ageText(c.birthDate)}${lc?` • dernier vêlage ${frDate(lc)}`:''}${c.calvingCount?` • rang ${c.calvingCount}`:''}${c.reproOverride==='include'?' • inclusion forcée':''}</span></span><span class="badge ${cls}">${esc(badge)}</span></button>`}).join(''):`<div class="empty">Aucune vache trouvée.</div>`;
  bindCowOpen();
}
function bindCowOpen(){ $$('.open-cow').forEach(b=>b.onclick=()=>openCow(b.dataset.id)) }
function openCow(id){
  const c=state.cows.find(x=>x.id===id); if(!c)return; const s=reproductiveStatus(c), ev=events(c).slice().reverse(); const svc=lastService(c);
  let calc=''; if(c.active!==false&&['pregnant','presumed','watch'].includes(s.key)&&svc){const term=dateISO(addDays(svc.date,state.settings.term)), remain=diffDays(term,dateISO(today())); calc=`<div class="card"><strong>${s.key==='pregnant'?'Pleine':'Supposée pleine / suivie'} depuis ${s.days} jours</strong><div class="cow-sub">Terme théorique : ${frDate(term)} • ${remain>=0?remain+' jours restants':Math.abs(remain)+' jours après terme'}</div></div>`}
  $('#cowDetail').innerHTML=`<div class="dialog-head"><div><h2>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</h2><div class="muted">${esc(c.id)} • ${ageText(c.birthDate)}${c.source==='manual'?' • ajout manuel':''}</div></div><button class="iconbtn" id="closeCow">✕</button></div>
  <p><span class="badge ${c.active===false||!isReproEligible(c)?'neutral':s.cls}">${c.active===false?'Sortie du troupeau':!isReproEligible(c)?(isUnderAge(c)?'Hors âge':'Exclue du suivi repro'):esc(s.label)}</span></p>${isReproEligible(c)?calc:''}
  <div class="card"><strong>Repères</strong><div class="cow-sub">Dernier vêlage : ${frDate(lastCalving(c))} • Rang retrouvé : ${c.calvingCount||'—'}${c.exitDate?' • sortie '+frDate(c.exitDate):''}${c.exitReason?' • '+esc(c.exitReason):''}</div></div>
  ${c.active!==false&&!isReproEligible(c)?`<div class="card eligibility-card"><strong>Hors suivi reproduction</strong><div class="cow-sub">${isUnderAge(c)?`Âge inférieur au seuil de ${state.herdSettings.minFemaleAgeMonths} mois.`:'Exclusion manuelle du suivi.'}</div><button class="primary compact" id="forceIncludeCow">✓ Inclure dans le suivi repro</button></div>`:c.active!==false&&c.reproOverride==='include'?`<div class="card eligibility-card"><strong>Inclusion forcée</strong><div class="cow-sub">Cette femelle est suivie même si elle est hors du critère d’âge.</div><button class="ghost compact" id="removeIncludeOverride">Revenir au critère d’âge</button></div>`:c.active!==false?`<div class="card eligibility-card"><strong>Suivi reproduction actif</strong><div class="cow-sub">Cette femelle respecte le critère d’âge actuel.</div><button class="ghost compact" id="excludeCowRepro">Exclure du suivi repro</button></div>`:''}
  <div class="cow-actions"><button class="ghost" id="editCow">✏️ Modifier la fiche</button>${c.active===false?'<button class="primary" id="reactivateCow">↩️ Réintégrer au troupeau</button>':'<button class="danger-outline" id="exitCow">Sortir du troupeau</button>'}</div>
  ${isReproEligible(c)?'<button class="primary wide" id="addForCow">＋ Ajouter un événement</button>':''}
  <h3>Historique</h3><div class="timeline">${ev.length?ev.map(e=>`<div class="timeline-item event-history-row"><div><strong>${eventLabel(e)}</strong><div class="cow-sub">${frDate(e.date)}${e.bull?` • ${esc(e.bull)}`:''}${e.note?` • ${esc(e.note)}`:''}</div></div><button type="button" class="ghost compact edit-event" data-event-id="${esc(e.id)}">✏️ Modifier</button></div>`).join(''):`<div class="muted">Aucun événement saisi dans l’application.</div>`}</div>`;
  $('#closeCow').onclick=()=>$('#cowDialog').close();
  $('#editCow').onclick=()=>{ $('#cowDialog').close(); openCowForm(c.id) };
  if($('#forceIncludeCow'))$('#forceIncludeCow').onclick=()=>{c.reproOverride='include';save();openCow(c.id)};
  if($('#removeIncludeOverride'))$('#removeIncludeOverride').onclick=()=>{c.reproOverride='';save();openCow(c.id)};
  if($('#excludeCowRepro'))$('#excludeCowRepro').onclick=()=>{c.reproOverride='exclude';save();openCow(c.id)};
  if(c.active!==false){ if($('#addForCow'))$('#addForCow').onclick=()=>{ $('#cowDialog').close(); openEvent(c.id)}; $('#exitCow').onclick=()=>exitCow(c.id) }
  else $('#reactivateCow').onclick=()=>{c.active=true;c.exitDate='';c.exitReason='';c.exitOrigin='';save();$('#cowDialog').close();};
  $$('.edit-event').forEach(b=>b.onclick=()=>{const eventId=b.dataset.eventId; $('#cowDialog').close(); openEvent(c.id,eventId)});
  $('#cowDialog').showModal();
}
function openCowForm(id=''){
 const c=id?state.cows.find(x=>x.id===id):null; $('#cowForm').reset(); $('#cowEditId').value=c?.id||''; $('#cowFormTitle').textContent=c?'Modifier la vache':'Ajouter une vache';
 $('#cowWorkNumber').value=c?.workNumber||''; $('#cowName').value=c?.name||''; $('#cowNationalId').value=c?.id?.startsWith('manual-')?'':(c?.id||''); $('#cowBirthDate').value=c?.birthDate||''; $('#cowBreed').value=c?.breed||''; $('#cowLastCalving').value=c?.lastCalving||''; $('#cowCalvingCount').value=c?.calvingCount||''; $('#cowForceRepro').checked=c?.reproOverride==='include'; $('#cowFormDialog').showModal();
}
function saveCowForm(e){e.preventDefault(); const editId=$('#cowEditId').value, national=$('#cowNationalId').value.trim(), work=$('#cowWorkNumber').value.trim(); if(!work){alert('Le numéro de travail est obligatoire.');return}
 let c=editId?state.cows.find(x=>x.id===editId):null; const newId=national||c?.id||('manual-'+uid());
 if(!c && state.cows.some(x=>x.active!==false&&(x.id===newId||x.workNumber===work))){alert('Une vache active avec cet identifiant ou ce numéro de travail existe déjà.');return}
 if(c && newId!==c.id && state.cows.some(x=>x!==c&&x.id===newId)){alert('Cet identifiant existe déjà.');return}
 const data={id:newId,workNumber:work,name:$('#cowName').value.trim(),birthDate:$('#cowBirthDate').value,breed:$('#cowBreed').value.trim(),lastCalving:$('#cowLastCalving').value,calvingCount:Math.max(0,Number($('#cowCalvingCount').value)||0),reproOverride:$('#cowForceRepro').checked?'include':(c?.reproOverride==='exclude'?'exclude':'')};
 if(c){Object.assign(c,data)} else state.cows.push({...data,active:true,source:'manual',events:[]}); save(); $('#cowFormDialog').close();
}
function exitCow(id){const c=state.cows.find(x=>x.id===id);if(!c)return; const reason=prompt('Motif de sortie (facultatif) : vendue, réforme, morte, autre…',''); if(reason===null)return; const d=prompt('Date de sortie (AAAA-MM-JJ) :',dateISO(today())); if(d===null)return; c.active=false;c.exitDate=/^\d{4}-\d{2}-\d{2}$/.test(d)?d:dateISO(today());c.exitReason=reason.trim();c.exitOrigin='manual';save();$('#cowDialog').close();}
function eventLabel(e){return ({heat:'Chaleur observée',service:e.mode==='ai'?'Insémination artificielle':'Saillie naturelle',pregnant:'Gestation confirmée',not_pregnant:'Diagnostic négatif',calving:'Vêlage'})[e.type]||e.type}

function renderBulls(){
  $('#bullList').innerHTML=state.males.length?state.males.map((b,i)=>`<div class="card bull-card-edit"><div class="bull-toggle"><div><strong>${esc(b.name||'Sans nom')} · ${esc(b.workNumber||'—')}</strong><div class="cow-sub">${esc(b.id||'')} ${b.birthDate?'• '+ageText(b.birthDate):''}</div></div><button type="button" class="switch ${b.activeBreeder?'on':''}" data-bull-toggle="${i}" aria-label="Activer comme reproducteur"></button></div><button type="button" class="ghost compact edit-bull" data-bull-edit="${i}">✏️ Modifier la fiche</button></div>`).join(''):`<div class="empty">Aucun mâle dans la base.</div>`;
  $$('[data-bull-toggle]').forEach(b=>b.onclick=()=>{state.males[+b.dataset.bullToggle].activeBreeder=!state.males[+b.dataset.bullToggle].activeBreeder; save()});
  $$('[data-bull-edit]').forEach(b=>b.onclick=()=>openBullForm(+b.dataset.bullEdit));
  $('#aiBullList').innerHTML=state.aiBulls.length?state.aiBulls.map(x=>`<span class="tag">${esc(x)}</span>`).join(''):`<span class="muted">Ils apparaîtront ici après les premières IA.</span>`;
  populateNaturalBulls();
}
function openBullForm(index=null){
  $('#bullForm').reset(); const editing=index!==null&&index!==undefined; const b=editing?state.males[index]:null;
  $('#bullEditId').value=editing?String(index):''; $('#bullDialogTitle').textContent=editing?'Modifier le taureau':'Ajouter un taureau'; $('#saveBullBtn').textContent=editing?'Enregistrer':'Ajouter';
  $('#bullName').value=b?.name||''; $('#bullNumber').value=b?.workNumber||''; $('#bullDialog').showModal();
}
function saveBullForm(e){e.preventDefault(); const raw=$('#bullEditId').value, editing=raw!==''; const name=$('#bullName').value.trim(), workNumber=$('#bullNumber').value.trim(); if(!name){alert('Le nom du taureau est obligatoire.');return}
  if(editing){const b=state.males[Number(raw)]; if(!b)return; b.name=name;b.workNumber=workNumber;b.manualEdit=true;}
  else state.males.push({id:'manual-'+uid(),name,workNumber,birthDate:'',activeBreeder:true,manualEdit:true});
  save();$('#bullDialog').close();$('#bullForm').reset();
}
function populateNaturalBulls(){const sel=$('#naturalBull'); if(!sel)return; const a=state.males.filter(b=>b.activeBreeder); sel.innerHTML=a.length?a.map(b=>`<option value="${esc(b.name||b.workNumber)}">${esc((b.name||'')+' · '+(b.workNumber||''))}</option>`).join(''):`<option value="">Aucun taureau actif — à régler dans Taureaux</option>`}

function renderSettings(){
 const defs=[['heatWatchStart','Début surveillance retour chaleur','J+ après IA/saillie'],['heatWatchEnd','Fin surveillance retour chaleur','J+ après IA/saillie'],['presumedPregnant','Supposée pleine à partir de','J+ sans retour enregistré'],['pregCheck','Rappel diagnostic de gestation','J+ après IA/saillie'],['preCalving','Alerte pré-vêlage','J+ après IA/saillie'],['term','Terme théorique','J+ après IA/saillie'],['postpartumStart','Début surveillance post-vêlage','J+ après vêlage'],['postpartumWarn','Alerte post-vêlage renforcée','J+ après vêlage'],['postpartumLate','Alerte absence de chaleur','J+ après vêlage']];
 $('#settingsForm').innerHTML=defs.map(([k,l,d])=>`<div class="setting"><label for="set-${k}">${l}</label><p>${d}</p><input id="set-${k}" type="number" min="0" value="${state.settings[k]}"></div>`).join('');
 const n=state.notifications||NOTIF_DEFAULTS;
 const minAge=Number(state.herdSettings?.minFemaleAgeMonths??HERD_DEFAULTS.minFemaleAgeMonths);
 $('#herdSettings').innerHTML=`<div class="notification-panel"><div class="setting-row"><div><strong>Âge minimum des femelles suivies</strong><p>Les femelles plus jeunes restent dans la base mais ne génèrent pas d’alertes, sauf inclusion manuelle.</p></div><div class="age-setting"><input id="minFemaleAgeMonths" type="number" min="0" max="120" step="1" value="${minAge}"><span>mois</span></div></div><div class="cow-sub">${state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length} femelle(s) actuellement hors critère d’âge.</div></div>`;
 $('#notificationSettings').innerHTML=`
   <div class="notification-panel">
    <div class="setting-row"><div><strong>Récap quotidien</strong><p>Une seule notification regroupée pour éviter les alertes en rafale.</p></div><label class="toggleline"><input id="notif-enabled" type="checkbox" ${n.enabled?'checked':''}> Actif</label></div>
    <div class="setting-row"><div><strong>Heure souhaitée</strong><p>Utilisée lorsque l’application est active ou reprise. Le push serveur sera nécessaire pour une heure garantie en arrière-plan.</p></div><input id="notif-time" type="time" value="${esc(n.time||'07:00')}"></div>
    <div class="notif-types">
      <label><input id="notif-heatReturn" type="checkbox" ${n.heatReturn?'checked':''}> 🔁 Retours en chaleur</label>
      <label><input id="notif-pregCheck" type="checkbox" ${n.pregCheck?'checked':''}> 🩺 Diagnostics de gestation</label>
      <label><input id="notif-precalving" type="checkbox" ${n.precalving?'checked':''}> 🍼 Pré-vêlage</label>
      <label><input id="notif-term" type="checkbox" ${n.term?'checked':''}> ⚠️ Termes atteints</label>
      <label><input id="notif-postpartum" type="checkbox" ${n.postpartum?'checked':''}> 👀 Suivi post-vêlage</label>
    </div>
    <div class="notif-actions"><button type="button" id="enableNotifBtn" class="primary compact">🔔 Autoriser</button><button type="button" id="testNotifBtn" class="ghost compact">Envoyer un test</button></div>
    <p id="notifStatus" class="muted small"></p>
   </div>`;
 updateNotifStatus();
 $('#enableNotifBtn').onclick=requestNotifications;
 $('#testNotifBtn').onclick=()=>sendDailyNotification(true);
 $('#dataInfo').textContent=`Base actuelle : ${state.cows.filter(c=>c.active!==false).length} femelles présentes • ${state.cows.filter(isReproEligible).length} suivies repro • ${state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length} hors âge • ${state.cows.filter(c=>c.active===false).length} sorties • ${state.males.length} mâles • source ${state.meta?.source||'locale'}`;
 const cemail=$('#cloudUserEmail'); if(cemail)cemail.textContent=cloudUserEmail()||'Non connecté';
}

function renderCalendar(){
 const start=new Date(calDate), end=new Date(calDate); let days=[];
 if(calMode==='day'){days=[new Date(calDate)]; $('#calTitle').textContent=frDate(calDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
 if(calMode==='week'){const wd=(calDate.getDay()+6)%7; start.setDate(calDate.getDate()-wd); end.setTime(start.getTime()); end.setDate(start.getDate()+6); for(let i=0;i<7;i++)days.push(addDays(start,i)); $('#calTitle').textContent=`${frDate(start,{day:'numeric',month:'short'})} – ${frDate(end,{day:'numeric',month:'short',year:'numeric'})}`}
 if(calMode==='month'){
   start.setDate(1); $('#calTitle').textContent=frDate(start,{month:'long',year:'numeric'}); const y=start.getFullYear(),m=start.getMonth(), first=(start.getDay()+6)%7, count=new Date(y,m+1,0).getDate(); let html='<div class="month-grid">'+['L','M','M','J','V','S','D'].map(x=>`<div class="muted">${x}</div>`).join(''); for(let i=0;i<first;i++)html+='<div></div>'; for(let d=1;d<=count;d++){const dt=new Date(y,m,d,12), iso=dateISO(dt), al=alertsForDay(iso); html+=`<div class="month-cell"><div class="n">${d}</div>${al.slice(0,3).map(a=>`<div><span class="dot"></span><span class="event-text">${esc(a.cow.workNumber)}</span></div>`).join('')}${al.length>3?`<small>+${al.length-3}</small>`:''}</div>`} html+='</div>'; $('#calendarContent').innerHTML=html; return;
 }
 $('#calendarContent').innerHTML=days.map(d=>{const iso=dateISO(d), a=alertsForDay(iso); return `<div class="day-block"><div class="day-title">${frDate(d,{weekday:'long',day:'numeric',month:'long'})}</div>${a.length?a.map(alertHTML).join(''):`<div class="empty">Rien à surveiller</div>`}</div>`}).join(''); bindCowOpen();
}

function findEventOwner(eventId){for(const c of state.cows){const ev=(c.events||[]).find(e=>e.id===eventId);if(ev)return {cow:c,event:ev}}return null}
function openEvent(cowId,eventId=''){
 $('#eventForm').reset(); $('#eventEditId').value=eventId||''; $('#eventDialogTitle').textContent=eventId?'Modifier l’événement':'Ajouter un événement'; $('#eventType').value='service'; $('#eventDate').value=dateISO(today()); $('#eventCowId').value=''; $('#selectedCow').classList.add('hidden'); $('#eventCowMatches').innerHTML=''; $('#eventCowSearch').value=''; populateNaturalBulls();
 if(eventId){const found=findEventOwner(eventId); if(found){const ev=found.event; selectEventCow(found.cow); $('#eventType').value=ev.type||'service'; $('#eventDate').value=ev.date||dateISO(today()); $('#eventNote').value=ev.note||''; if(ev.type==='service'){ $('#serviceMode').value=ev.mode||'natural'; updateServiceFields(); if(ev.mode==='ai')$('#aiBull').value=ev.bull||''; else {const sel=$('#naturalBull'); const value=ev.bull||''; if(value&&![...sel.options].some(o=>o.value===value)){const opt=document.createElement('option');opt.value=value;opt.textContent=value+' (ancien)';sel.appendChild(opt)} sel.value=value;} } }}
 else if(cowId){selectEventCow(state.cows.find(c=>c.id===cowId))}
 updateServiceFields(); $('#eventDialog').showModal();
}
function selectEventCow(c){if(!c)return; $('#eventCowId').value=c.id; $('#eventCowSearch').value=''; $('#eventCowMatches').innerHTML=''; $('#selectedCow').textContent=`${c.name||'Sans nom'} · ${c.workNumber}`; $('#selectedCow').classList.remove('hidden')}
function updateServiceFields(){const svc=$('#eventType').value==='service'; $('#serviceFields').classList.toggle('hidden',!svc); const ai=$('#serviceMode').value==='ai'; $('#naturalBullWrap').classList.toggle('hidden',ai); $('#aiBullWrap').classList.toggle('hidden',!ai)}
function closeEventDialog(){if($('#eventDialog').open)$('#eventDialog').close(); $('#eventForm').reset(); $('#eventCowMatches').innerHTML=''}

function addEventFromForm(e){e.preventDefault(); const c=state.cows.find(x=>x.id===$('#eventCowId').value); if(!c){alert('Choisis une vache dans la liste.');return}
 const type=$('#eventType').value, date=$('#eventDate').value; if(!date){alert('Indique la date de l’événement.');return} const editId=$('#eventEditId').value;
 const ev={id:editId||uid(),type,date,note:$('#eventNote').value.trim()};
 if(type==='service'){ev.mode=$('#serviceMode').value; ev.bull=ev.mode==='ai'?$('#aiBull').value.trim():$('#naturalBull').value; if(ev.mode==='ai'&&ev.bull&&!state.aiBulls.includes(ev.bull))state.aiBulls.push(ev.bull)}
 if(editId){const found=findEventOwner(editId); if(found){const oldWasCalving=found.event.type==='calving'; const newIsCalving=type==='calving'; found.cow.events=(found.cow.events||[]).filter(x=>x.id!==editId); if(oldWasCalving&&!newIsCalving)found.cow.calvingCount=Math.max(0,(found.cow.calvingCount||0)-1); if(found.cow!==c&&oldWasCalving)found.cow.calvingCount=Math.max(0,(found.cow.calvingCount||0)-1); if(newIsCalving&&(!oldWasCalving||found.cow!==c))c.calvingCount=(c.calvingCount||0)+1; }}
 else if(type==='calving')c.calvingCount=(c.calvingCount||0)+1;
 c.events=c.events||[]; c.events.push(ev); if(type==='calving')c.lastCalving=date;
 save(); closeEventDialog();
}

function parseCSV(text){
 const rows=[]; let row=[],cell='',q=false; for(let i=0;i<text.length;i++){const ch=text[i],n=text[i+1]; if(ch==='"'){if(q&&n==='"'){cell+='"';i++}else q=!q}else if(ch===';'&&!q){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&n==='\n')i++; row.push(cell);cell=''; if(row.some(x=>x!==''))rows.push(row);row=[]}else cell+=ch} if(cell||row.length){row.push(cell);rows.push(row)} return rows;
}
function csvClean(x){x=(x||'').trim(); const m=x.match(/^="(.*)"$/s); return m?m[1]:x}
function dmyToIso(s){const m=(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:''}
function importHerdCSV(text,name){
 const rows=parseCSV(text); if(rows.length<2)throw Error('CSV vide'); const head=rows[0].map(csvClean); const idx=n=>head.indexOf(n); const need=['Identifiant bovin','Numéro travail','Date naissance','Sexe','Nom','Numéro mère','Date sortie']; if(need.some(n=>idx(n)<0))throw Error('Colonnes GDS attendues non trouvées');
 const records=rows.slice(1).map(r=>Object.fromEntries(head.map((h,i)=>[h,csvClean(r[i]||'')]))); const births={}; records.forEach(r=>{if(r['Numéro mère']&&r['Date naissance']){(births[r['Numéro mère']]??=[]).push(dmyToIso(r['Date naissance']))}}); Object.values(births).forEach(a=>a.sort());
 let added=0,updated=0,exited=0,manualKept=state.cows.filter(c=>c.source==='manual').length;
 const byId=new Map(state.cows.map(c=>[c.id,c]));
 for(const r of records.filter(r=>r.Sexe==='F')){
   const rid=r['Identifiant bovin'], work=r['Numéro travail'], birth=dmyToIso(r['Date naissance']), csvExit=dmyToIso(r['Date sortie']);
   let c=byId.get(rid);
   if(!c){ c=state.cows.find(x=>x.source==='manual'&&x.workNumber===work&&(!x.birthDate||!birth||x.birthDate===birth)); if(c){byId.delete(c.id); c.id=rid; c.source='csv'; byId.set(rid,c);} }
   const b=(births[rid]||[]).filter(Boolean), histLast=b.at(-1)||'';
   if(c){ c.workNumber=work||c.workNumber;c.name=r.Nom||c.name;c.birthDate=birth||c.birthDate;c.breed=r['Type racial']||c.breed||'';c.lastCalving=[c.lastCalving,histLast].filter(Boolean).sort().at(-1)||'';c.calvingCount=Math.max(c.calvingCount||0,b.length);c.source='csv'; if(csvExit){if(c.active!==false)exited++;c.active=false;c.exitDate=csvExit;c.exitReason=c.exitReason||'Sortie indiquée dans le CSV';c.exitOrigin='csv'} else if(c.exitOrigin!=='manual'){c.active=true;c.exitDate='';c.exitReason='';c.exitOrigin=''}; updated++;
   } else {state.cows.push({id:rid,workNumber:work,name:r.Nom,birthDate:birth,breed:r['Type racial']||'',lastCalving:histLast,calvingCount:b.length,events:[],active:!csvExit,exitDate:csvExit,exitReason:csvExit?'Sortie indiquée dans le CSV':'',exitOrigin:csvExit?'csv':'',source:'csv',reproOverride:''});added++;}
 }
 const oldM=new Map(state.males.map(b=>[b.id,b])); const csvMales=records.filter(r=>r.Sexe==='M'&&!r['Date sortie']).map(r=>{const old=oldM.get(r['Identifiant bovin']);return {id:r['Identifiant bovin'],workNumber:old?.manualEdit?(old.workNumber||r['Numéro travail']):r['Numéro travail'],name:old?.manualEdit?(old.name||r.Nom):r.Nom,birthDate:dmyToIso(r['Date naissance']),activeBreeder:old?.activeBreeder||false,manualEdit:old?.manualEdit||false}}); const csvIds=new Set(csvMales.map(b=>b.id)); const manualMales=state.males.filter(b=>b.id?.startsWith('manual-')&&!csvIds.has(b.id)); state.males=[...csvMales,...manualMales];
 const underAge=state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length; state.meta={source:name,importedAt:dateISO(today()),lastImport:{added,updated,exited,manualKept,underAge}};save(); return {added,updated,exited,manualKept,underAge};
}

function exportBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`repro-bovine-sauvegarde-${dateISO(today())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function notificationTypeEnabled(a){
 const n=state.notifications||NOTIF_DEFAULTS;
 if(a.type==='heat_return')return n.heatReturn;
 if(a.type==='preg_check')return n.pregCheck;
 if(a.type==='precalving')return n.precalving;
 if(a.type==='term')return n.term;
 if(['post_start','post_warn','post_late'].includes(a.type))return n.postpartum;
 return true;
}
function notificationAlerts(day=dateISO(today())){return alertsForDay(day).filter(notificationTypeEnabled)}
function notificationSummary(day=dateISO(today())){
 const a=notificationAlerts(day), groups={heat_return:0,preg_check:0,precalving:0,term:0,post:0};
 a.forEach(x=>{if(['post_start','post_warn','post_late'].includes(x.type))groups.post++;else if(groups[x.type]!==undefined)groups[x.type]++});
 const parts=[]; if(groups.heat_return)parts.push(`${groups.heat_return} retour(s) chaleur`); if(groups.preg_check)parts.push(`${groups.preg_check} diagnostic(s)`); if(groups.precalving)parts.push(`${groups.precalving} pré-vêlage`); if(groups.term)parts.push(`${groups.term} terme(s)`); if(groups.post)parts.push(`${groups.post} post-vêlage`);
 const names=[...new Set(a.map(x=>(x.cow.name||x.cow.workNumber)+' · '+x.cow.workNumber))].slice(0,3);
 return {count:a.length,body:a.length?`${parts.join(' • ')}${names.length?' — '+names.join(', ')+(a.length>3?'…':''):''}`:'Aucune surveillance particulière aujourd’hui.'};
}
async function showNotification(title,body,tag='repro-bovine-daily'){
 if(!('Notification' in window)||Notification.permission!=='granted')return false;
 try{
  if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.ready; await reg.showNotification(title,{body,icon:'icon-192.png',badge:'icon-192.png',tag,renotify:true,data:{url:'./'}});return true}
  new Notification(title,{body,icon:'icon-192.png',tag}); return true;
 }catch(e){try{new Notification(title,{body,icon:'icon-192.png'});return true}catch(_){return false}}
}
function updateNotifStatus(){
 const el=$('#notifStatus'); if(!el)return;
 if(!('Notification'in window)){el.textContent='Notifications non prises en charge par ce navigateur.';return}
 const p=Notification.permission; el.textContent=p==='granted'?'✅ Notifications autorisées sur cet appareil.':p==='denied'?'⛔ Notifications refusées dans les réglages du navigateur/appareil.':'🔔 Autorisation non encore accordée.';
}
async function requestNotifications(){
 if(!('Notification'in window)){alert('Les notifications ne sont pas disponibles dans ce navigateur. Les alertes restent visibles dans l’application.');return}
 const p=await Notification.requestPermission();
 if(p==='granted'){state.notifications.enabled=true;save(); await showNotification('Repro Bovine','Notifications activées. Les alertes du jour seront regroupées dans un récap.','repro-bovine-setup')}
 else updateNotifStatus();
}
async function sendDailyNotification(force=false){
 const prefs=state.notifications||NOTIF_DEFAULTS;
 if(!force&&!prefs.enabled)return;
 if(!('Notification'in window)||Notification.permission!=='granted'){if(force)await requestNotifications();return}
 const day=dateISO(today()), key='reproNotifV12-'+day; if(!force&&localStorage.getItem(key))return;
 const summary=notificationSummary(day); await showNotification(force?'Test Repro Bovine':'Repro Bovine • Aujourd’hui',summary.body,force?'repro-bovine-test':'repro-bovine-daily');
 if(!force)localStorage.setItem(key,'1');
}
function maybeDailyNotification(){
 const prefs=state.notifications||NOTIF_DEFAULTS; if(!prefs.enabled)return;
 const now=new Date(), hhmm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 if(hhmm>=(prefs.time||'07:00'))sendDailyNotification(false);
}

function renderAll(){renderHome();renderCows();renderBulls();renderSettings();renderCalendar()}
function switchView(v){$$('.view').forEach(x=>x.classList.remove('active')); $(`#view-${v}`).classList.add('active'); $$('.bottomnav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v)); if(v==='cows')renderCows(); if(v==='calendar')renderCalendar()}

document.addEventListener('DOMContentLoaded',()=>{
 $('#todayLabel').textContent=today().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 $('#authForm').onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),pw=$('#authPassword').value;$('#authError').textContent='Connexion…';try{await cloudLogin(email,pw);$('#authError').textContent='';hideAuthDialog();await syncCloud()}catch(err){$('#authError').textContent=err.message||'Connexion impossible'}};
 $('#recoverBtn').onclick=async()=>{const email=$('#authEmail').value.trim();if(!email){$('#authError').textContent='Indique ton adresse email.';return}try{await cloudRecover(email);$('#authError').textContent='Email de réinitialisation envoyé.'}catch(err){$('#authError').textContent=err.message||'Envoi impossible'}};
 $('#passwordResetForm').onsubmit=async e=>{e.preventDefault();const p1=$('#newPassword').value,p2=$('#newPasswordConfirm').value,err=$('#passwordResetError');err.textContent='';if(p1.length<6){err.textContent='Choisis un mot de passe d’au moins 6 caractères.';return}if(p1!==p2){err.textContent='Les deux mots de passe ne sont pas identiques.';return}err.textContent='Enregistrement…';try{await updateRecoveredPassword(p1);err.textContent='';hidePasswordResetDialog();cloudSetStatus('☁️ Connexion…','sync');await syncCloud();alert('Mot de passe modifié. Tu es maintenant connectée à Repro Bovine.')}catch(ex){err.textContent=ex.message||'Modification impossible'}};
 $('#cloudLogoutBtn').onclick=cloudLogout; $('#cloudSyncBtn').onclick=()=>syncCloud();
 $$('.bottomnav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view)); $('#quickAddBtn').onclick=()=>openEvent();
 $('#cowSearch').oninput=renderCows; $('#addCowBtn').onclick=()=>openCowForm(); $('#cowForm').onsubmit=saveCowForm; $$('.chip').forEach(b=>b.onclick=()=>{$$('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');cowFilter=b.dataset.cowFilter;renderCows()});
 $('#eventCowSearch').oninput=()=>{const q=norm($('#eventCowSearch').value); if(q.length<1){$('#eventCowMatches').innerHTML='';return} const list=state.cows.filter(c=>isReproEligible(c)&&(norm(c.name).includes(q)||norm(c.workNumber).includes(q))).slice(0,8); $('#eventCowMatches').innerHTML=list.map(c=>`<button type="button" class="match" data-pick="${esc(c.id)}"><strong>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</strong><div class="cow-sub">${ageText(c.birthDate)}</div></button>`).join(''); $$('[data-pick]').forEach(b=>b.onclick=()=>selectEventCow(state.cows.find(c=>c.id===b.dataset.pick)))};
 $('#eventType').onchange=updateServiceFields; $('#serviceMode').onchange=updateServiceFields; $('#eventForm').onsubmit=addEventFromForm; $('#cancelEventTop').onclick=closeEventDialog; $('#cancelEventBottom').onclick=closeEventDialog;
 $('#addBullBtn').onclick=()=>openBullForm(); $('#bullForm').onsubmit=saveBullForm; $('#cancelBullTop').onclick=()=>$('#bullDialog').close(); $('#cancelBullBottom').onclick=()=>$('#bullDialog').close();
 $('#saveSettingsBtn').onclick=()=>{Object.keys(DEFAULTS).forEach(k=>state.settings[k]=Math.max(0,Number($(`#set-${k}`).value)||0)); state.herdSettings={...HERD_DEFAULTS,...state.herdSettings,minFemaleAgeMonths:Math.max(0,Number($('#minFemaleAgeMonths')?.value)||0)}; state.notifications={...NOTIF_DEFAULTS,...state.notifications,enabled:$('#notif-enabled')?.checked??false,time:$('#notif-time')?.value||'07:00',heatReturn:$('#notif-heatReturn')?.checked??true,pregCheck:$('#notif-pregCheck')?.checked??true,precalving:$('#notif-precalving')?.checked??true,term:$('#notif-term')?.checked??true,postpartum:$('#notif-postpartum')?.checked??true}; save();alert('Réglages enregistrés. Le suivi repro a été recalculé avec le nouvel âge minimum.');}; $('#resetSettingsBtn').onclick=()=>{state.settings={...DEFAULTS};state.herdSettings={...HERD_DEFAULTS};state.notifications={...NOTIF_DEFAULTS};save()};
 $('#csvInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const r=importHerdCSV(await f.text(),f.name);alert(`Fusion CSV terminée.\n\n${r.added} nouvelle(s) vache(s)\n${r.updated} fiche(s) reconnue(s) et mise(s) à jour\n${r.exited} sortie(s) détectée(s)\n${r.manualKept} vache(s) ajoutée(s) manuellement conservée(s)\n${r.underAge} femelle(s) hors critère d’âge\n\nLes événements repro saisis dans l’application ont été conservés.`)}catch(err){alert('Import impossible : '+err.message)}e.target.value=''};
 $('#exportBtn').onclick=exportBackup; $('#restoreInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!x.cows||!x.settings)throw Error('format incorrect');state=normalizeState(x);save();alert('Sauvegarde restaurée.')}catch(err){alert('Restauration impossible : '+err.message)}e.target.value=''};
 $('#notifyBtn').onclick=requestNotifications;
 $$('#calendarMode button').forEach(b=>b.onclick=()=>{$$('#calendarMode button').forEach(x=>x.classList.remove('active'));b.classList.add('active');calMode=b.dataset.mode;renderCalendar()});
 $('#calPrev').onclick=()=>{calDate=addDays(calDate,calMode==='day'?-1:calMode==='week'?-7:-30);renderCalendar()}; $('#calNext').onclick=()=>{calDate=addDays(calDate,calMode==='day'?1:calMode==='week'?7:30);renderCalendar()};
 renderAll(); initCloudAuth();
 if('serviceWorker'in navigator){
   navigator.serviceWorker.register('./sw.js?v=142').then(async reg=>{
     try{await reg.update()}catch(_){}
     maybeDailyNotification();
   }).catch(()=>{maybeDailyNotification()});
 } else maybeDailyNotification();
 setInterval(maybeDailyNotification,60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')maybeDailyNotification()});
 window.addEventListener('focus',()=>{maybeDailyNotification();syncCloud({silent:true})});
 window.addEventListener('online',()=>syncCloud());
});
