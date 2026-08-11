const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='reproBovineV1';
const DEFAULTS={heatWatchStart:18,heatWatchEnd:24,presumedPregnant:25,pregCheck:35,preCalving:285,term:295,postpartumStart:30,postpartumWarn:45,postpartumLate:60};
const NOTIF_DEFAULTS={enabled:false,time:'07:00',heatReturn:true,pregCheck:true,precalving:true,term:true,postpartum:true};
const HERD_DEFAULTS={minFemaleAgeMonths:12};
const LOCATION_DEFAULTS={season:new Date().getFullYear(),lastEstiveImport:'',lastEstiveSource:''};
let state=loadState();
let calMode='week', calDate=today(), cowFilter='all';
let calendarFilters=(()=>{try{return {...{heat:true,gestation:true,postpartum:false},...JSON.parse(localStorage.getItem('repro-calendar-filters')||'{}')}}catch(e){return {heat:true,gestation:true,postpartum:false}}})();
let homeFilters=(()=>{try{return {...{heat:true,gestation:true,postpartum:false},...JSON.parse(localStorage.getItem('repro-home-filters')||'{}')}}catch(e){return {heat:true,gestation:true,postpartum:false}}})();

// --- Repro Bovine v1.6.0 : Supabase + priorité chronologique + filtres calendrier ---
const SUPABASE_URL='https://uuyiazyofyyuxwiolizr.supabase.co';
const SUPABASE_KEY='sb_publishable_FtQAhsVfoPbyG1hD3lT1VQ_LhgiW8Hl';
const HOUSEHOLD_ID='5826e26b-eb84-460f-bb8e-7a2194e905b2';
const CLOUD_SESSION_KEY='reproBovineSupabaseSession';
const CLOUD_SHADOW_KEY='reproBovineCloudShadowV14';
let cloudSession=null, cloudSyncTimer=null, cloudSyncing=false, cloudReady=false;
let supabaseClient=null;
function getSupabaseClient(){
 if(supabaseClient)return supabaseClient;
 if(!window.supabase || typeof window.supabase.createClient!=='function'){
   throw new Error('Bibliothèque Supabase JS non chargée. Vérifie que le navigateur peut accéder à cdn.jsdelivr.net ou unpkg.com.');
 }
 supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'repro-bovine-auth-v146'}
 });
 return supabaseClient;
}
function sdkSessionToCloud(session){
 if(!session)return null;
 return {...session,expires_at:session.expires_at||Math.floor(Date.now()/1000)+(session.expires_in||3600)};
}

function cloudSetStatus(text,kind=''){
 const h=$('#cloudBadge'); if(h){h.textContent=text;h.className='cloud-badge '+kind}
 const s=$('#cloudStatusText'); if(s)s.textContent=text;
}
function getStoredCloudSession(){try{return JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)||'null')}catch(_){return null}}
function storeCloudSession(s){cloudSession=s||null;if(s)localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(CLOUD_SESSION_KEY);updateCloudUI()}
function sessionExpired(s){if(!s?.expires_at)return false;return Date.now()/1000>s.expires_at-60}
async function sbAuthFetch(path,opts={}){
 const headers={'apikey':SUPABASE_KEY,'Content-Type':'application/json','Accept':'application/json',...(opts.headers||{})};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
   return await fetch(SUPABASE_URL+path,{...opts,headers,mode:'cors',credentials:'omit',cache:'no-store',redirect:'follow',signal:controller.signal});
 }finally{clearTimeout(timer)}
}
async function refreshCloudSession(){
 try{
   const client=getSupabaseClient();
   const {data,error}=await client.auth.refreshSession();
   if(error||!data?.session)return false;
   storeCloudSession(sdkSessionToCloud(data.session));
   return true;
 }catch(_){return false}
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
 try{
   const client=getSupabaseClient();
   const {data,error}=await client.auth.signInWithPassword({email,password});
   if(error)throw error;
   if(!data?.session)throw new Error('Supabase n’a pas renvoyé de session de connexion.');
   const sess=sdkSessionToCloud(data.session);
   storeCloudSession(sess);
   return sess;
 }catch(err){
   const msg=err?.message||String(err)||'Connexion impossible';
   if(/invalid login credentials/i.test(msg))throw new Error('Email ou mot de passe incorrect.');
   throw new Error('Connexion Supabase : '+msg);
 }
}
async function testSupabaseNetwork(){
 const steps=[];
 try{
   steps.push('Bibliothèque Supabase JS : OK');
   const client=getSupabaseClient();
   const {data,error,status,statusText}=await client.from('households').select('id').limit(1);
   if(error){
     return {ok:false,status:status||0,text:`Bibliothèque chargée, mais appel projet en erreur : ${error.message}${error.code?' ['+error.code+']':''}${status?' (HTTP '+status+')':''}`};
   }
   steps.push('Projet Supabase : joignable');
   return {ok:true,status:status||200,text:steps.join(' • '),rows:Array.isArray(data)?data.length:0};
 }catch(err){
   return {ok:false,status:0,text:err?.message||String(err)||'Erreur inconnue'};
 }
}
async function clearLegacyPwaCaches(){
 try{
   if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()))}
   if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('repro-bovine')).map(k=>caches.delete(k)))}
 }catch(_){}
}

async function cloudLogout(){try{await getSupabaseClient().auth.signOut()}catch(_){}storeCloudSession(null);cloudReady=false;showAuthDialog()}
async function cloudRecover(email){const redirect=location.origin+location.pathname;const {error}=await getSupabaseClient().auth.resetPasswordForEmail(email,{redirectTo:redirect});if(error)throw error;return true}
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
 try{
   const client=getSupabaseClient();
   const {data,error}=await client.auth.getUser();
   if(!error&&data?.user&&cloudSession){cloudSession.user=data.user;storeCloudSession(cloudSession)}
 }catch(_){}
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
 const client=getSupabaseClient();
 const {data,error}=await client.auth.updateUser({password});
 if(error)throw error;
 if(data?.user&&cloudSession){cloudSession.user=data.user;storeCloudSession(cloudSession)}
 return true;
}

async function updateAccountPassword(password){
 const client=getSupabaseClient();
 const {data:{session},error:sessionError}=await client.auth.getSession();
 if(sessionError||!session)throw new Error('Ta session a expiré. Reconnecte-toi puis réessaie.');
 const {data,error}=await client.auth.updateUser({password});
 if(error)throw error;
 if(data?.user&&cloudSession){cloudSession.user=data.user;storeCloudSession(cloudSession)}
 return true;
}
function showChangePasswordDialog(){
 if(!cloudSession){alert('Connecte-toi d’abord à Repro Bovine.');showAuthDialog();return}
 const d=$('#changePasswordDialog');
 if(d&&!d.open){$('#accountNewPassword').value='';$('#accountNewPasswordConfirm').value='';$('#changePasswordError').textContent='';d.showModal()}
}
function hideChangePasswordDialog(){const d=$('#changePasswordDialog');if(d?.open)d.close()}

function cowNational(c){return c.id&&!String(c.id).startsWith('manual-')&&!String(c.id).startsWith('cloud-')?String(c.id):null}
function cowPayload(c){return {id:c.cloudId||undefined,household_id:HOUSEHOLD_ID,work_number:c.workNumber||null,national_number:cowNational(c),name:c.name||null,birth_date:c.birthDate||null,sex:'F',breed:c.breed||null,last_calving_date:c.lastCalving||null,calving_rank:Number(c.calvingCount)||0,active:c.active!==false,exit_date:c.exitDate||null,exit_reason:c.exitReason||null,repro_override:c.reproOverride||null,manual_created:c.source==='manual',current_location_id:c.currentLocationCloudId||locationById(c.currentLocationId)?.cloudId||null,current_location_name:c.currentLocationName||null,estive_active:!!c.estiveActive,estive_season:c.estiveSeason||null,source_updated_at:new Date().toISOString()}}
function bullPayload(b){return {id:b.cloudId||undefined,household_id:HOUSEHOLD_ID,name:b.name||b.workNumber||'Sans nom',number:b.workNumber||null,breed:b.breed||null,bull_type:'natural',active:!!b.activeBreeder,notes:b.notes||null,manual_modified:!!b.manualEdit}}
const EVENT_META_MARK='[[REPRO_META_V1]]';
function eventMeta(e){const m={};if(Number(e.dateUncertaintyDays)>0)m.dateUncertaintyDays=Number(e.dateUncertaintyDays);if(Number(e.gestAgeMinDays)>0)m.gestAgeMinDays=Number(e.gestAgeMinDays);if(Number(e.gestAgeMaxDays)>0)m.gestAgeMaxDays=Number(e.gestAgeMaxDays);if(e.estive)m.estive=true;return m}
function serializeEventNotes(e){const note=(e.note||'').trim(),m=eventMeta(e);return Object.keys(m).length?`${note}${note?'\n':''}${EVENT_META_MARK}${JSON.stringify(m)}`:note||null}
function parseEventNotes(raw){const txt=String(raw||''),i=txt.lastIndexOf(EVENT_META_MARK);if(i<0)return {note:txt};let meta={};try{meta=JSON.parse(txt.slice(i+EVENT_META_MARK.length))||{}}catch(_){}return {note:txt.slice(0,i).trim(),...meta}}
function eventPayload(c,e){let bullId=null;if(e.mode==='natural'&&e.bull){const b=state.males.find(x=>x.cloudId&&(x.name===e.bull||x.workNumber===e.bull));bullId=b?.cloudId||null}return {id:e.cloudId||undefined,household_id:HOUSEHOLD_ID,cow_id:c.cloudId,event_type:e.type,event_date:e.date,breeding_type:e.type==='service'?(e.mode||'natural'):null,bull_id:bullId,bull_name:e.type==='service'?(e.bull||null):null,notes:serializeEventNotes(e),created_by:cloudSession?.user?.id||null}}
function localCowFromRow(r,old){return {...(old||{}),cloudId:r.id,id:r.national_number||(old?.id)||('cloud-'+r.id),workNumber:r.work_number||'',name:r.name||'',birthDate:r.birth_date||'',breed:r.breed||'',lastCalving:r.last_calving_date||'',calvingCount:Number(r.calving_rank)||0,active:r.active!==false,exitDate:r.exit_date||'',exitReason:r.exit_reason||'',exitOrigin:r.active===false?'cloud':'',reproOverride:r.repro_override||'',currentLocationCloudId:r.current_location_id||'',currentLocationName:r.current_location_name||'',estiveActive:r.estive_active===true,estiveSeason:r.estive_season||'',source:r.manual_created?'manual':'csv',events:old?.events||[]}}
function localBullFromRow(r,old){return {...(old||{}),cloudId:r.id,id:old?.id||('cloud-'+r.id),workNumber:r.number||'',name:r.name||'',birthDate:old?.birthDate||'',breed:r.breed||'',activeBreeder:r.active!==false,manualEdit:!!r.manual_modified}}
function localEventFromRow(r,old){const extra=parseEventNotes(r.notes);return {...(old||{}),cloudId:r.id,id:old?.id||('cloud-'+r.id),type:r.event_type,date:r.event_date,mode:r.breeding_type||undefined,bull:r.bull_name||'',...extra}}
function canonicalCow(c){const p=cowPayload(c);delete p.id;delete p.source_updated_at;return p}
function canonicalBull(b){const p=bullPayload(b);delete p.id;return p}
function canonicalEvent(c,e){const p=eventPayload(c,e);delete p.id;delete p.created_by;return p}
function currentCloudShadow(){
 const cows={},bulls={},events={};state.cows.forEach(c=>{const k=c.cloudId||'local:'+c.id;cows[k]=canonicalCow(c);(c.events||[]).forEach(e=>{const ek=e.cloudId||'local:'+e.id;if(c.cloudId)events[ek]=canonicalEvent(c,e)})});state.males.forEach(b=>{const k=b.cloudId||'local:'+b.id;bulls[k]=canonicalBull(b)});
 return {cows,bulls,events,settings:cloudSettingsPayload(),locations:(state.locations||[]).map(locationPayload),locationMoves:(state.locationMoves||[]).map(movePayload)}
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


function locationPayload(l){return {id:l.cloudId||undefined,household_id:HOUSEHOLD_ID,name:l.name,kind:l.kind||'parcelle',active:l.active!==false}}
function localLocationFromRow(r,old){return {...(old||{}),id:(old?.id)||('loc-'+r.id),cloudId:r.id,name:r.name||'',kind:r.kind||'parcelle',active:r.active!==false}}
function movePayload(m){const c=state.cows.find(x=>x.id===m.cowId),l=state.locations.find(x=>x.id===m.locationId);return {id:m.cloudId||undefined,household_id:HOUSEHOLD_ID,cow_id:c?.cloudId||null,location_id:l?.cloudId||null,location_name:m.locationName||l?.name||null,moved_at:m.date,reason:m.reason||null}}
async function insertNewLocations(list){if(!list.length)return;const payload=list.map(l=>{const p=locationPayload(l);delete p.id;return p});const rows=await cloudFetch('/rest/v1/locations',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});list.forEach((l,i)=>{const r=rows.find(x=>x.name===l.name)||rows[i];if(r)l.cloudId=r.id})}
async function upsertLocations(list){if(!list.length)return;await cloudFetch('/rest/v1/locations?on_conflict=id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(list.map(locationPayload))})}
async function insertNewLocationMoves(list){const ready=list.filter(m=>{const c=state.cows.find(x=>x.id===m.cowId);return c?.cloudId});if(!ready.length)return;const payload=ready.map(m=>{const p=movePayload(m);delete p.id;return p});const rows=await cloudFetch('/rest/v1/cow_locations',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(payload)});ready.forEach((m,i)=>{if(rows[i])m.cloudId=rows[i].id})}
function applyCloudLocationRows(lr,mr){const oldByCloud=new Map((state.locations||[]).filter(l=>l.cloudId).map(l=>[l.cloudId,l]));state.locations=(lr||[]).map(r=>localLocationFromRow(r,oldByCloud.get(r.id)||state.locations.find(l=>l.name===r.name)));const cByCloud=new Map(state.cows.filter(c=>c.cloudId).map(c=>[c.cloudId,c]));const lByCloud=new Map(state.locations.filter(l=>l.cloudId).map(l=>[l.cloudId,l]));state.cows.forEach(c=>{if(c.currentLocationCloudId){const l=lByCloud.get(c.currentLocationCloudId);if(l){c.currentLocationId=l.id;c.currentLocationName=l.name}}});state.locationMoves=(mr||[]).map(r=>{const c=cByCloud.get(r.cow_id),l=lByCloud.get(r.location_id);return {id:'move-'+r.id,cloudId:r.id,cowId:c?.id||'',locationId:l?.id||'',locationName:r.location_name||l?.name||'',date:r.moved_at,reason:r.reason||''}}).filter(m=>m.cowId)}

async function cloudIsEmpty(){const rows=await cloudFetch(`/rest/v1/cows?select=id&household_id=eq.${HOUSEHOLD_ID}&limit=1`);return !rows?.length}
async function uploadAllLocalToCloud(){
 cloudSetStatus('☁️ Envoi initial…','sync');
 await insertNewLocations((state.locations||[]).filter(l=>!l.cloudId));await upsertLocations((state.locations||[]).filter(l=>l.cloudId));
 await insertNewCows(state.cows.filter(c=>!c.cloudId));await upsertCows(state.cows.filter(c=>c.cloudId));
 await insertNewBulls(state.males.filter(b=>!b.cloudId));await upsertBulls(state.males.filter(b=>b.cloudId));
 const ev=[];state.cows.forEach(c=>(c.events||[]).forEach(e=>ev.push({c,e})));await insertNewEvents(ev.filter(x=>!x.e.cloudId));await upsertEvents(ev.filter(x=>x.e.cloudId));
 await insertNewLocationMoves((state.locationMoves||[]).filter(m=>!m.cloudId));
 await upsertCloudSettings();localStorage.setItem(STORE,JSON.stringify(state));saveCloudShadow();
}
async function pullCloud({preserveLocalUnlinked=false}={}){
 const preEvents=preserveLocalUnlinked?state.cows.flatMap(c=>(c.events||[]).filter(e=>!e.cloudId).map(e=>({cow:c,event:{...e}}))):[];
 const preBulls=preserveLocalUnlinked?state.males.filter(b=>!b.cloudId).map(b=>({...b})):[];
 const [cr,er,br,sr,lr,mr]=await Promise.all([
  cloudFetch(`/rest/v1/cows?select=*&household_id=eq.${HOUSEHOLD_ID}&order=work_number.asc`),
  cloudFetch(`/rest/v1/repro_events?select=*&household_id=eq.${HOUSEHOLD_ID}&order=event_date.asc`),
  cloudFetch(`/rest/v1/bulls?select=*&household_id=eq.${HOUSEHOLD_ID}&bull_type=eq.natural&order=name.asc`),
  cloudFetch(`/rest/v1/app_settings?select=*&household_id=eq.${HOUSEHOLD_ID}&limit=1`),
  cloudFetch(`/rest/v1/locations?select=*&household_id=eq.${HOUSEHOLD_ID}&order=name.asc`),
  cloudFetch(`/rest/v1/cow_locations?select=*&household_id=eq.${HOUSEHOLD_ID}&order=moved_at.desc`)
 ]);
 const localByCloud=new Map(state.cows.filter(c=>c.cloudId).map(c=>[c.cloudId,c]));
 const next=[];for(const r of cr||[]){let old=localByCloud.get(r.id)||state.cows.find(c=>(r.national_number&&cowNational(c)===r.national_number)||(!r.national_number&&c.workNumber===r.work_number&&String(c.birthDate||'')===String(r.birth_date||'')));next.push(localCowFromRow(r,old))}
 // Conserver seulement les fiches locales pas encore migrées vers le cloud.
 const remoteNationals=new Set((cr||[]).map(r=>r.national_number).filter(Boolean));const remoteWorks=new Set((cr||[]).map(r=>r.work_number));for(const c of state.cows){if(!c.cloudId&&!remoteNationals.has(cowNational(c))&&!remoteWorks.has(c.workNumber))next.push(c)}state.cows=next;
 const cowsByCloud=new Map(state.cows.filter(c=>c.cloudId).map(c=>[c.cloudId,c]));state.cows.forEach(c=>c.events=[]);
 for(const r of er||[]){const c=cowsByCloud.get(r.cow_id);if(c)c.events.push(localEventFromRow(r,null))}
 if(preserveLocalUnlinked){for(const x of preEvents){const c=state.cows.find(z=>(x.cow.cloudId&&z.cloudId===x.cow.cloudId)||z.id===x.cow.id||z.workNumber===x.cow.workNumber);if(!c)continue;const sig=e=>[e.type,e.date,e.mode||'',e.bull||'',e.note||''].join('|');if(!(c.events||[]).some(e=>sig(e)===sig(x.event))){c.events=c.events||[];c.events.push(x.event)}}}
 const oldBByCloud=new Map(state.males.filter(b=>b.cloudId).map(b=>[b.cloudId,b]));state.males=(br||[]).map(r=>localBullFromRow(r,oldBByCloud.get(r.id)||state.males.find(b=>b.workNumber===r.number&&b.name===r.name)));if(preserveLocalUnlinked){for(const b of preBulls){if(!state.males.some(x=>x.workNumber===b.workNumber&&x.name===b.name))state.males.push(b)}}
 state.aiBulls=[...new Set((er||[]).filter(r=>r.breeding_type==='ai'&&r.bull_name).map(r=>r.bull_name))];applyCloudLocationRows(lr,mr);applyCloudSettings(sr?.[0]);state.meta={...(state.meta||{}),cloud:true,lastCloudSync:new Date().toISOString()};localStorage.setItem(STORE,JSON.stringify(state));renderAll();
}
async function pushDirtyLocal(){
 const sh=loadCloudShadow();if(!sh)return;
 const newL=(state.locations||[]).filter(l=>!l.cloudId);if(newL.length)await insertNewLocations(newL);
 const cloudL=(state.locations||[]).filter(l=>l.cloudId);if(cloudL.length)await upsertLocations(cloudL);
 const newMoves=(state.locationMoves||[]).filter(m=>!m.cloudId);if(newMoves.length)await insertNewLocationMoves(newMoves);
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
 try{
   const client=getSupabaseClient();
   const {data:{session}}=await client.auth.getSession();
   if(session)storeCloudSession(sdkSessionToCloud(session));
   client.auth.onAuthStateChange(async(event,sessionNow)=>{
     if(sessionNow)storeCloudSession(sdkSessionToCloud(sessionNow));
     if(event==='PASSWORD_RECOVERY')showPasswordResetDialog();
   });
 }catch(err){
   console.warn('Supabase SDK init',err);
 }
 if(await handlePasswordRecoveryRedirect())return;
 cloudSession=cloudSession||getStoredCloudSession();updateCloudUI();
 if(!cloudSession){cloudSetStatus('☁️ Connexion requise','warn');showAuthDialog();return}
 hideAuthDialog();cloudSetStatus(navigator.onLine?'☁️ Connexion…':'☁️ Mode hors ligne',navigator.onLine?'sync':'warn');
 if(navigator.onLine){if(!await ensureCloudSession()){storeCloudSession(null);showAuthDialog();return}await hydrateCloudUser();await syncCloud()}
 else {cloudReady=true;renderAll()}
}



function normalizeState(x){
  x=x||{};
  x.cows=(x.cows||[]).map(c=>({...c,active:c.active!==false,source:c.source||'csv',events:c.events||[],reproOverride:c.reproOverride||'',estiveActive:!!c.estiveActive,estiveSeason:c.estiveSeason||'',currentLocationId:c.currentLocationId||'',currentLocationName:c.currentLocationName||''})); x.males=x.males||[]; x.aiBulls=x.aiBulls||[]; x.locations=(x.locations||[]).map(l=>({...l,active:l.active!==false,kind:l.kind||'parcelle'})); x.locationMoves=x.locationMoves||[]; x.locationSettings={...LOCATION_DEFAULTS,...(x.locationSettings||{})};
  x.settings={...DEFAULTS,...(x.settings||{})};
  x.notifications={...NOTIF_DEFAULTS,...(x.notifications||{})};
  x.herdSettings={...HERD_DEFAULTS,...(x.herdSettings||{})};
  x.meta=x.meta||{source:window.INITIAL_HERD.source,importedAt:window.INITIAL_HERD.importedAt};
  return x;
}
function loadState(){
  const raw=localStorage.getItem(STORE);
  if(raw){try{return normalizeState(JSON.parse(raw))}catch(e){}}
  return normalizeState({cows:window.INITIAL_HERD.cows||[],males:window.INITIAL_HERD.males||[],aiBulls:[],locations:[],locationMoves:[],locationSettings:{...LOCATION_DEFAULTS},settings:{...DEFAULTS},notifications:{...NOTIF_DEFAULTS},herdSettings:{...HERD_DEFAULTS},meta:{source:window.INITIAL_HERD.source,importedAt:window.INITIAL_HERD.importedAt}});
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
function daysFromEstimate(value,unit){const n=Number(value);if(!Number.isFinite(n)||n<=0)return 0;return unit==='months'?Math.round(n*30.44):Math.round(n)}
function pregnancyBasis(c){
  const ev=events(c), closers=new Set(['heat','not_pregnant','calving']);
  const svc=[...ev].reverse().find(e=>e.type==='service'&&!ev.some(x=>x.date>e.date&&closers.has(x.type)));
  const preg=[...ev].reverse().find(e=>e.type==='pregnant'&&!ev.some(x=>x.date>e.date&&closers.has(x.type)));
  if(svc){
    const confirmed=!!preg&&preg.date>=svc.date;
    return {conception:svc.date,uncertaintyDays:Math.max(0,Number(svc.dateUncertaintyDays)||0),confirmed,source:'service',sourceEvent:svc,confirmation:confirmed?preg:null,estive:!!(c.estiveActive||svc.estive||preg?.estive)};
  }
  if(preg){
    const min=Number(preg.gestAgeMinDays)||0,max=Number(preg.gestAgeMaxDays)||0;
    if(min>0||max>0){const lo=Math.min(min||max,max||min),hi=Math.max(min||max,max||min),mid=(lo+hi)/2,unc=Math.ceil((hi-lo)/2);return {conception:dateISO(addDays(preg.date,-Math.round(mid))),uncertaintyDays:unc,confirmed:true,source:'scan',sourceEvent:preg,confirmation:preg,gestAgeMinDays:lo,gestAgeMaxDays:hi,estive:!!(c.estiveActive||preg.estive)}}
    return {conception:'',uncertaintyDays:0,confirmed:true,source:'confirmation_only',sourceEvent:preg,confirmation:preg,estive:!!(c.estiveActive||preg.estive)};
  }
  return null;
}
function nextCalvingDate(c){const b=pregnancyBasis(c);return b?.conception?dateISO(addDays(b.conception,state.settings.term)):''}
function pregnancyWindow(b){if(!b?.conception)return null;const term=dateISO(addDays(b.conception,state.settings.term)),u=Math.max(0,Number(b.uncertaintyDays)||0);return {term,earliest:dateISO(addDays(term,-u)),latest:dateISO(addDays(term,u)),uncertainty:u}}
function pregnancyReason(b){const parts=[];if(b?.source==='scan')parts.push('date reconstruite à partir du diagnostic de gestation');if(b?.uncertaintyDays)parts.push(`incertitude ±${b.uncertaintyDays} j`);if(b?.estive)parts.push('estive : surveillance avancée de 23 j');return parts.join(' • ')}

function reproductiveStatus(c){
  const b=pregnancyBasis(c),calv=lastCalving(c);
  if(b?.confirmed){
    if(b.conception){const days=Math.max(0,diffDays(dateISO(today()),b.conception));return {key:'pregnant',label:`Pleine confirmée • ${b.uncertaintyDays?'~':''}${days} j`,days,base:b.conception,cls:'ok'}}
    return {key:'pregnant',label:'Pleine confirmée',days:null,base:null,cls:'ok'};
  }
  if(b?.source==='service'&&b.conception){const days=Math.max(0,diffDays(dateISO(today()),b.conception));if(days>=state.settings.presumedPregnant)return {key:'presumed',label:`Supposée pleine • ${b.uncertaintyDays?'~':''}${days} j`,days,base:b.conception,cls:'warn'};return {key:'watch',label:`Après ${b.sourceEvent.mode==='ai'?'IA':'saillie'} • J+${days}`,days,base:b.conception,cls:'neutral'}}
  if(calv){const days=Math.max(0,diffDays(dateISO(today()),calv));return {key:'postpartum',label:`Post-vêlage • J+${days}`,days,base:calv,cls:days>=state.settings.postpartumLate?'danger':days>=state.settings.postpartumStart?'warn':'neutral'};}
  return {key:'open',label:'À suivre',days:null,base:null,cls:'neutral'};
}

function buildAlerts(){
  const out=[],S=state.settings,now=dateISO(today());
  for(const c of state.cows.filter(isReproEligible)){
    const ev=events(c),b=pregnancyBasis(c),calv=lastCalving(c);
    if(b?.source==='service'&&b.conception&&!b.confirmed){
      const svc=b.sourceEvent,start=dateISO(addDays(b.conception,S.heatWatchStart)),end=dateISO(addDays(b.conception,S.heatWatchEnd));
      out.push({cow:c,type:'heat_return',date:start,endDate:end,icon:'🔁',title:'Surveiller retour en chaleur',meta:`${svc.mode==='ai'?'IA':'Saillie'} du ${frDate(svc.date)}${b.uncertaintyDays?` ±${b.uncertaintyDays} j`:''} • fenêtre J+${S.heatWatchStart} à J+${S.heatWatchEnd}`});
      const pc=dateISO(addDays(b.conception,S.pregCheck));out.push({cow:c,type:'preg_check',date:pc,icon:'🩺',title:'Diagnostic de gestation à envisager',meta:`J+${S.pregCheck} après ${svc.mode==='ai'?'IA':'saillie'}`});
    }
    if(b?.conception){
      const w=pregnancyWindow(b),centralPre=dateISO(addDays(b.conception,S.preCalving));
      const earlyExtra=(b.uncertaintyDays||0)+(b.estive?23:0);
      if(earlyExtra>0){const early=dateISO(addDays(centralPre,-earlyExtra)),reasons=[];if(b.uncertaintyDays)reasons.push(`date incertaine ±${b.uncertaintyDays} j`);if(b.estive)reasons.push('estive +23 j');out.push({cow:c,type:'precalving_early',date:early,icon:'⏰',title:'Surveillance vêlage anticipée',meta:`${reasons.join(' • ')} • repère standard ${frDate(centralPre)} • terme central ${frDate(w.term)}${w.uncertainty?` (fenêtre ${frDate(w.earliest)} → ${frDate(w.latest)})`:''}`})}
      out.push({cow:c,type:'precalving',date:centralPre,icon:'🍼',title:'Vêlage sous ~10 jours',meta:`Terme théorique ${frDate(w.term)}${w.uncertainty?` • fenêtre probable ${frDate(w.earliest)} → ${frDate(w.latest)}`:''}${b.estive?' • vache en estive':''}`});
      out.push({cow:c,type:'term',date:w.term,icon:'⚠️',title:'Terme théorique atteint',meta:`Terme central${w.uncertainty?` • fenêtre probable ${frDate(w.earliest)} → ${frDate(w.latest)}`:''}${b.source==='scan'?' • calculé depuis l’échographie':''}`});
    }
    if(calv){const after=ev.filter(e=>e.date>calv),restarted=after.some(e=>['heat','service'].includes(e.type));if(!restarted){const d1=dateISO(addDays(calv,S.postpartumStart)),d2=dateISO(addDays(calv,S.postpartumWarn)),d3=dateISO(addDays(calv,S.postpartumLate));out.push({cow:c,type:'post_start',date:d1,icon:'👀',title:'Commencer surveillance des chaleurs',meta:`J+${S.postpartumStart} après vêlage`});out.push({cow:c,type:'post_warn',date:d2,icon:'🔎',title:'Retour en cyclicité à surveiller',meta:`Aucune chaleur enregistrée • J+${S.postpartumWarn}`});out.push({cow:c,type:'post_late',date:d3,ongoing:true,icon:'🚩',title:'Pas de chaleur enregistrée post-vêlage',meta:`Depuis le vêlage du ${frDate(calv)} • J+${Math.max(0,diffDays(now,calv))}`});}}
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
function calendarAlertGroup(a){
  if(['post_start','post_warn','post_late'].includes(a.type))return 'postpartum';
  if(['precalving','precalving_early','term','preg_check'].includes(a.type))return 'gestation';
  return 'heat';
}
function calendarAlertsForDay(day){return alertsForDay(day).filter(a=>calendarFilters[calendarAlertGroup(a)]!==false)}
function homeAlertsForDay(day){return alertsForDay(day).filter(a=>homeFilters[calendarAlertGroup(a)]!==false)}
function homeAlertsBetween(start,end){return alertsBetween(start,end).filter(a=>homeFilters[calendarAlertGroup(a)]!==false)}


function locationById(id){return (state.locations||[]).find(l=>l.id===id)||null}
function activeLocations(){return (state.locations||[]).filter(l=>l.active!==false).sort((a,b)=>(a.name||'').localeCompare(b.name||'','fr',{sensitivity:'base'}))}
function ensureEstiveLocation(){let l=activeLocations().find(x=>x.kind==='estive');if(!l){l={id:'loc-'+uid(),name:'Estive',kind:'estive',active:true};state.locations.push(l)}return l}
function cowLocationText(c){return c.currentLocationName||locationById(c.currentLocationId)?.name||''}
function setCowLocation(c,loc,date=dateISO(today()),reason='Déplacement'){if(!c)return;const old=cowLocationText(c), l=loc?locationById(loc):null;c.currentLocationId=l?.id||'';c.currentLocationCloudId=l?.cloudId||'';c.currentLocationName=l?.name||'';state.locationMoves=state.locationMoves||[];state.locationMoves.push({id:'move-'+uid(),cowId:c.id,locationId:l?.id||'',locationName:l?.name||'Sans lieu',date,reason:old&&old!==l?.name?`${reason} (depuis ${old})`:reason})}
function parseGenericCsv(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(!lines.length)return[];const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';const parse=line=>{const a=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===sep&&!q){a.push(cur);cur=''}else cur+=ch}a.push(cur);return a};const h=parse(lines[0]).map(x=>x.trim());return lines.slice(1).map(line=>{const v=parse(line),o={};h.forEach((k,i)=>o[k]=String(v[i]??'').trim());return o})}
function cleanCsvValue(v){let s=String(v??'').trim();/* Les exports Excel GDS peuvent arriver comme ="FR ...". Le parseur CSV retire parfois déjà les guillemets et laisse =FR ... */if(s.startsWith('="')&&s.endsWith('"'))s=s.slice(2,-1);s=s.replace(/^"|"$/g,'').trim();if(s.startsWith('='))s=s.slice(1).trim();return s}
function normalizeAnimalId(v){return cleanCsvValue(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function normalizeWorkNumber(v){return cleanCsvValue(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function normalizeAnimalName(v){return cleanCsvValue(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function importEstiveCSV(text,name,season,locationId){
 const rows=parseGenericCsv(text);if(!rows.length)throw new Error('CSV vide');
 const active=state.cows.filter(c=>c.active!==false);
 const byNational=new Map(),byWork=new Map(),byNameWork=new Map();
 active.forEach(c=>{const n=normalizeAnimalId(cowNational(c)||c.id||'');const w=normalizeWorkNumber(c.workNumber||'');const nm=normalizeAnimalName(c.name||'');if(n)byNational.set(n,c);if(w&&!byWork.has(w))byWork.set(w,c);if(nm&&w)byNameWork.set(`${nm}|${w}`,c)});
 const wanted=new Set(),unrecognized=[];let recognized=0,byNationalCount=0,byWorkCount=0,byNameWorkCount=0;
 for(const r of rows){
   const nat=normalizeAnimalId(r['Identifiant bovin']||r['Identifiant']||r['N° national']||r['Numero national']||'');
   const work=normalizeWorkNumber(r['Numéro travail']||r['Numero travail']||r['N° travail']||'');
   const nm=normalizeAnimalName(r['Nom']||'');
   let c=null,method='';
   if(nat&&(c=byNational.get(nat)))method='national';
   else if(work&&(c=byWork.get(work)))method='work';
   else if(nm&&work&&(c=byNameWork.get(`${nm}|${work}`)))method='namework';
   if(c){wanted.add(c.id);recognized++;if(method==='national')byNationalCount++;else if(method==='work')byWorkCount++;else byNameWorkCount++;}
   else unrecognized.push({national:cleanCsvValue(r['Identifiant bovin']||r['Identifiant']||''),work:cleanCsvValue(r['Numéro travail']||r['Numero travail']||''),name:cleanCsvValue(r['Nom']||'')});
 }
 const loc=locationById(locationId)||ensureEstiveLocation();
 for(const c of active){if(c.estiveActive&&String(c.estiveSeason)===String(season)&&!wanted.has(c.id)){c.estiveActive=false;if(c.currentLocationId===loc.id)setCowLocation(c,null,dateISO(today()),'Retrait de la liste d’estive')}}
 for(const id of wanted){const c=state.cows.find(x=>x.id===id);c.estiveActive=true;c.estiveSeason=String(season);if(c.currentLocationId!==loc.id)setCowLocation(c,loc.id,dateISO(today()),`Import estive ${season}`)}
 state.locationSettings={...LOCATION_DEFAULTS,...state.locationSettings,season:Number(season),lastEstiveImport:new Date().toISOString(),lastEstiveSource:name};save();
 return {recognized,unknown:unrecognized.length,total:rows.length,unrecognized,byNationalCount,byWorkCount,byNameWorkCount}
}
function closeCurrentEstive(){const season=String(state.locationSettings?.season||new Date().getFullYear());let n=0;for(const c of state.cows){if(c.estiveActive&&String(c.estiveSeason)===season){c.estiveActive=false;const l=locationById(c.currentLocationId);if(l?.kind==='estive')setCowLocation(c,null,dateISO(today()),`Fin estive ${season}`);n++}}save();return n}
function renderLocationOptions(select,includeEmpty=true,selected=''){if(!select)return;const opts=activeLocations().map(l=>`<option value="${esc(l.id)}" ${selected===l.id?'selected':''}>${esc(l.name)} — ${esc(l.kind)}</option>`).join('');select.innerHTML=(includeEmpty?'<option value="">Sans lieu</option>':'')+opts}
function renderLocations(){if(!$('#locationList'))return;const locs=activeLocations(),activeCows=state.cows.filter(c=>c.active!==false);$('#countEstive').textContent=activeCows.filter(c=>c.estiveActive).length;$('#countLocated').textContent=activeCows.filter(c=>cowLocationText(c)).length;$('#countUnlocated').textContent=activeCows.filter(c=>!cowLocationText(c)).length;const season=$('#estiveSeason');if(season)season.value=state.locationSettings?.season||new Date().getFullYear();renderLocationOptions($('#estiveLocationSelect'),false);const eloc=locs.find(l=>l.kind==='estive');if(eloc&&$('#estiveLocationSelect'))$('#estiveLocationSelect').value=eloc.id;const inf=$('#estiveInfo');if(inf)inf.textContent=state.locationSettings?.lastEstiveImport?`Dernier import : ${frDate(state.locationSettings.lastEstiveImport.slice(0,10))} • ${state.locationSettings.lastEstiveSource||''}`:'Aucune liste d’estive importée pour le moment.';$('#locationList').innerHTML=locs.length?locs.map(l=>{const n=activeCows.filter(c=>c.currentLocationId===l.id||(!c.currentLocationId&&c.currentLocationName===l.name)).length;return `<div class="card location-card"><div><strong>${esc(l.name)}</strong> <span class="location-kind">${esc(l.kind)}</span><div class="cow-sub">${n} vache(s) actuellement</div></div><div class="location-actions"><button type="button" class="ghost compact location-show" data-loc="${esc(l.id)}">Voir les vaches</button><button type="button" class="ghost compact location-edit" data-loc="${esc(l.id)}">✏️</button></div></div>`}).join(''):'<div class="empty">Aucun lieu créé. Ajoute une parcelle, une estive ou un bâtiment.</div>';const hist=(state.locationMoves||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);$('#locationHistory').innerHTML=hist.length?hist.map(m=>{const c=state.cows.find(x=>x.id===m.cowId);return `<button class="card location-history-row open-cow" data-id="${esc(m.cowId)}"><span><strong>${esc(c?.name||'Sans nom')} · ${esc(c?.workNumber||'')}</strong><span class="cow-sub">📍 ${esc(m.locationName||'Sans lieu')} • ${frDate(m.date)}${m.reason?' • '+esc(m.reason):''}</span></span><span>›</span></button>`}).join(''):'<div class="empty">Aucun déplacement enregistré.</div>';$$('.location-edit').forEach(b=>b.onclick=()=>openLocationForm(b.dataset.loc));$$('.location-show').forEach(b=>b.onclick=()=>{cowFilter='all';switchView('cows');$('#cowSearch').value='';renderCowsForLocation(b.dataset.loc)});bindCowOpen()}
function renderCowsForLocation(locId){const l=locationById(locId);if(!l)return;const list=state.cows.filter(c=>c.active!==false&&(c.currentLocationId===locId||(!c.currentLocationId&&c.currentLocationName===l.name)));$('#cowList').innerHTML=`<div class="card"><strong>📍 ${esc(l.name)}</strong><div class="cow-sub">${list.length} vache(s)</div></div>`+(list.length?list.map(c=>{const s=reproductiveStatus(c);return `<button class="card cow-card open-cow" data-id="${esc(c.id)}"><span><span class="cow-name">${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</span><span class="cow-sub">${ageText(c.birthDate)}${c.estiveActive?' • ⛰️ estive':''}</span></span><span class="badge ${s.cls}">${esc(s.label)}</span></button>`}).join(''):'<div class="empty">Aucune vache.</div>');bindCowOpen()}
function openLocationForm(id=''){const l=locationById(id);$('#locationEditId').value=id;$('#locationName').value=l?.name||'';$('#locationKind').value=l?.kind||'parcelle';$('#locationDialogTitle').textContent=l?'Modifier le lieu':'Ajouter un lieu';$('#locationDialog').showModal()}
function saveLocationForm(e){e.preventDefault();const id=$('#locationEditId').value,name=$('#locationName').value.trim(),kind=$('#locationKind').value;if(!name)return;if(id){const l=locationById(id);if(l){const old=l.name;l.name=name;l.kind=kind;state.cows.filter(c=>c.currentLocationId===id).forEach(c=>c.currentLocationName=name);(state.locationMoves||[]).filter(m=>m.locationId===id&&m.locationName===old).forEach(m=>m.locationName=name)}}else state.locations.push({id:'loc-'+uid(),name,kind,active:true});save();$('#locationDialog').close()}
function openBatchMove(locId=''){renderLocationOptions($('#batchLocation'),false,locId);$('#batchMoveDate').value=dateISO(today());$('#batchCowSearch').value='';renderBatchCowList();$('#batchMoveDialog').showModal()}
function renderBatchCowList(){const q=norm($('#batchCowSearch')?.value||'');const list=state.cows.filter(c=>c.active!==false&&(!q||norm(c.name).includes(q)||norm(c.workNumber).includes(q)));$('#batchCowList').innerHTML=list.map(c=>`<label class="batch-cow-item"><input type="checkbox" value="${esc(c.id)}"><span><strong>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</strong><span class="cow-sub">${cowLocationText(c)?'📍 '+esc(cowLocationText(c)):'Sans lieu'}${c.estiveActive?' • ⛰️ estive':''}</span></span></label>`).join('')}
function saveBatchMove(e){e.preventDefault();const loc=$('#batchLocation').value,date=$('#batchMoveDate').value||dateISO(today()),ids=$$('#batchCowList input:checked').map(x=>x.value);ids.forEach(id=>setCowLocation(state.cows.find(c=>c.id===id),loc,date,'Déplacement groupé'));save();$('#batchMoveDialog').close();alert(`${ids.length} vache(s) affectée(s).`)}

function renderHome(){
  const now=dateISO(today()), weekEnd=dateISO(addDays(today(),7));
  const td=homeAlertsForDay(now), wk=homeAlertsBetween(dateISO(addDays(today(),1)),weekEnd);
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
  const sortMode=$('#cowSort')?.value||'priority';
  const allAlerts=buildAlerts(), now=dateISO(today());
  const priorityFor=c=>{
    const aa=allAlerts.filter(a=>a.cow.id===c.id);
    const active=aa.filter(a=>activeOn(a,now)).sort((x,y)=>x.date.localeCompare(y.date));
    if(active.length)return {group:0,date:active[0].date,label:active[0].title};
    const future=aa.filter(a=>(a.endDate||a.date)>=now && a.date>now).sort((x,y)=>x.date.localeCompare(y.date));
    if(future.length)return {group:1,date:future[0].date,label:future[0].title};
    const nc=nextCalvingDate(c);
    if(nc)return {group:2,date:nc,label:'Mise bas présumée'};
    const lc=lastCalving(c);
    if(lc)return {group:3,date:lc,label:'Dernier vêlage'};
    return {group:4,date:'9999-12-31',label:'Sans échéance'};
  };
  const prio=new Map(list.map(c=>[c.id,priorityFor(c)]));
  list.sort((a,b)=>{
    if(sortMode==='name')return (a.name||'').localeCompare(b.name||'','fr',{sensitivity:'base'})||(a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true});
    if(sortMode==='work')return (a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true});
    if(sortMode==='lastcalving'){
      const da=lastCalving(a), db=lastCalving(b);
      if(da&&db)return da.localeCompare(db)||(a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true});
      if(da)return -1; if(db)return 1;
      return (a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true});
    }
    if(sortMode==='calving'){
      const da=nextCalvingDate(a), db=nextCalvingDate(b);
      if(da&&db)return da.localeCompare(db)||(a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true});
      if(da)return -1; if(db)return 1;
      return (a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true});
    }
    const pa=prio.get(a.id), pb=prio.get(b.id);
    if(pa.group!==pb.group)return pa.group-pb.group;
    if(pa.group===3){ // post-vêlage / dernier vêlage : les plus anciennes d'abord
      const la=lastCalving(a)||'9999-12-31', lb=lastCalving(b)||'9999-12-31';
      if(la!==lb)return la.localeCompare(lb);
    }
    if(pa.date!==pb.date)return pa.date.localeCompare(pb.date);
    return (a.workNumber||'').localeCompare(b.workNumber||'',undefined,{numeric:true});
  });
  $('#cowList').innerHTML=list.length?list.map(c=>{const s=reproductiveStatus(c), lc=lastCalving(c), nc=nextCalvingDate(c), p=prio.get(c.id); const under=isUnderAge(c)&&c.reproOverride!=='include'; const excluded=c.reproOverride==='exclude'; const badge=c.active===false?'Sortie':under?'Hors âge':excluded?'Exclue du suivi':s.label; const cls=c.active===false||under||excluded?'neutral':s.cls; const prioTxt=sortMode==='priority'&&p&&p.group<3?`⏱ ${esc(p.label)} ${frDate(p.date)} • `:''; return `<button class="card cow-card open-cow ${c.active===false?'inactive-card':''}" data-id="${esc(c.id)}"><span><span class="cow-name">${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</span><span class="cow-sub">${prioTxt}${nc?`🍼 mise bas présumée ${frDate(nc)} • `:''}${ageText(c.birthDate)}${lc?` • dernier vêlage ${frDate(lc)}`:''}${c.calvingCount?` • rang ${c.calvingCount}`:''}${c.reproOverride==='include'?' • inclusion forcée':''}${cowLocationText(c)?` • 📍 ${esc(cowLocationText(c))}`:''}${c.estiveActive?' • ⛰️ estive':''}</span></span><span class="badge ${cls}">${esc(badge)}</span></button>`}).join(''):`<div class="empty">Aucune vache trouvée.</div>`;
  bindCowOpen();
}
function bindCowOpen(){ $$('.open-cow').forEach(b=>b.onclick=()=>openCow(b.dataset.id)) }
function openCow(id){
  const c=state.cows.find(x=>x.id===id); if(!c)return; const s=reproductiveStatus(c), ev=events(c).slice().reverse(); const svc=lastService(c);
  let calc=''; const pb=pregnancyBasis(c); if(c.active!==false&&['pregnant','presumed','watch'].includes(s.key)&&pb){if(pb.conception){const w=pregnancyWindow(pb),remain=diffDays(w.term,dateISO(today())),earlyExtra=(pb.uncertaintyDays||0)+(pb.estive?23:0),standardPre=dateISO(addDays(pb.conception,state.settings.preCalving)),earlyPre=dateISO(addDays(standardPre,-earlyExtra));calc=`<div class="card"><strong>${s.key==='pregnant'?'Pleine confirmée':s.key==='presumed'?'Supposée pleine':'Gestation suivie'}${s.days!==null?` depuis ${pb.uncertaintyDays?'~':''}${s.days} jours`:''}</strong><div class="cow-sub">Terme théorique : ${frDate(w.term)}${w.uncertainty?` • fenêtre probable ${frDate(w.earliest)} → ${frDate(w.latest)}`:''} • ${remain>=0?remain+' jours restants':Math.abs(remain)+' jours après terme'}</div>${earlyExtra?`<div class="gestation-info"><strong>⏰ Surveillance anticipée : ${frDate(earlyPre)}</strong><div class="cow-sub">Repère standard : ${frDate(standardPre)} • ${esc(pregnancyReason(pb))}</div></div>`:''}${pb.source==='scan'?`<div class="gestation-info"><strong>🩺 Gestation estimée par diagnostic</strong><div class="cow-sub">Fécondation estimée autour du ${frDate(pb.conception)}${pb.uncertaintyDays?` ±${pb.uncertaintyDays} j`:''}.</div></div>`:''}</div>`}else calc='<div class="card"><strong>Pleine confirmée</strong><div class="cow-sub">Aucune date de saillie ni durée de gestation n’est renseignée : le terme ne peut pas encore être estimé.</div></div>'}
  $('#cowDetail').innerHTML=`<div class="dialog-head"><div><h2>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</h2><div class="muted">${esc(c.id)} • ${ageText(c.birthDate)}${c.source==='manual'?' • ajout manuel':''}</div></div><button class="iconbtn" id="closeCow">✕</button></div>
  <p><span class="badge ${c.active===false||!isReproEligible(c)?'neutral':s.cls}">${c.active===false?'Sortie du troupeau':!isReproEligible(c)?(isUnderAge(c)?'Hors âge':'Exclue du suivi repro'):esc(s.label)}</span></p>${isReproEligible(c)?calc:''}
  <div class="card"><strong>Repères</strong><div class="cow-sub">Dernier vêlage : ${frDate(lastCalving(c))} • Rang retrouvé : ${c.calvingCount||'—'}${c.exitDate?' • sortie '+frDate(c.exitDate):''}${c.exitReason?' • '+esc(c.exitReason):''}</div></div>
  <div class="card cow-location-box"><strong>📍 Localisation</strong><div class="cow-sub">${cowLocationText(c)?esc(cowLocationText(c)):'Lieu non renseigné'}${c.estiveActive?` • ⛰️ Estive ${esc(c.estiveSeason||'')}`:''}</div><div class="cow-location-actions"><label>Changer de lieu<select id="cowQuickLocation"></select></label><button type="button" class="primary compact" id="saveCowLocation">Déplacer</button></div></div>
  ${c.active!==false&&!isReproEligible(c)?`<div class="card eligibility-card"><strong>Hors suivi reproduction</strong><div class="cow-sub">${isUnderAge(c)?`Âge inférieur au seuil de ${state.herdSettings.minFemaleAgeMonths} mois.`:'Exclusion manuelle du suivi.'}</div><button class="primary compact" id="forceIncludeCow">✓ Inclure dans le suivi repro</button></div>`:c.active!==false&&c.reproOverride==='include'?`<div class="card eligibility-card"><strong>Inclusion forcée</strong><div class="cow-sub">Cette femelle est suivie même si elle est hors du critère d’âge.</div><button class="ghost compact" id="removeIncludeOverride">Revenir au critère d’âge</button></div>`:c.active!==false?`<div class="card eligibility-card"><strong>Suivi reproduction actif</strong><div class="cow-sub">Cette femelle respecte le critère d’âge actuel.</div><button class="ghost compact" id="excludeCowRepro">Exclure du suivi repro</button></div>`:''}
  <div class="cow-actions"><button class="ghost" id="editCow">✏️ Modifier la fiche</button>${c.active===false?'<button class="primary" id="reactivateCow">↩️ Réintégrer au troupeau</button>':'<button class="danger-outline" id="exitCow">Sortir du troupeau</button>'}</div>
  ${isReproEligible(c)?'<button class="primary wide" id="addForCow">＋ Ajouter un événement</button>':''}
  <h3>Historique</h3><div class="timeline">${ev.length?ev.map(e=>`<div class="timeline-item event-history-row"><div><strong>${eventLabel(e)}</strong><div class="cow-sub">${frDate(e.date)}${e.bull?` • ${esc(e.bull)}`:''}${eventExtraText(e)}${e.note?` • ${esc(e.note)}`:''}</div></div><button type="button" class="ghost compact edit-event" data-event-id="${esc(e.id)}">✏️ Modifier</button></div>`).join(''):`<div class="muted">Aucun événement saisi dans l’application.</div>`}</div>`;
  $('#closeCow').onclick=()=>$('#cowDialog').close();
  $('#editCow').onclick=()=>{ $('#cowDialog').close(); openCowForm(c.id) };
  renderLocationOptions($('#cowQuickLocation'),true,c.currentLocationId||''); if($('#saveCowLocation'))$('#saveCowLocation').onclick=()=>{setCowLocation(c,$('#cowQuickLocation').value,dateISO(today()),'Déplacement depuis fiche vache');save();openCow(c.id)};
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
 $('#cowWorkNumber').value=c?.workNumber||''; $('#cowName').value=c?.name||''; $('#cowNationalId').value=c?.id?.startsWith('manual-')?'':(c?.id||''); $('#cowBirthDate').value=c?.birthDate||''; $('#cowBreed').value=c?.breed||'';renderLocationOptions($('#cowLocation'),true,c?.currentLocationId||''); $('#cowLastCalving').value=c?.lastCalving||''; $('#cowCalvingCount').value=c?.calvingCount||''; $('#cowForceRepro').checked=c?.reproOverride==='include'; $('#cowFormDialog').showModal();
}
function saveCowForm(e){e.preventDefault(); const editId=$('#cowEditId').value, national=$('#cowNationalId').value.trim(), work=$('#cowWorkNumber').value.trim(); if(!work){alert('Le numéro de travail est obligatoire.');return}
 let c=editId?state.cows.find(x=>x.id===editId):null; const newId=national||c?.id||('manual-'+uid());
 if(!c && state.cows.some(x=>x.active!==false&&(x.id===newId||x.workNumber===work))){alert('Une vache active avec cet identifiant ou ce numéro de travail existe déjà.');return}
 if(c && newId!==c.id && state.cows.some(x=>x!==c&&x.id===newId)){alert('Cet identifiant existe déjà.');return}
 const data={id:newId,workNumber:work,name:$('#cowName').value.trim(),birthDate:$('#cowBirthDate').value,breed:$('#cowBreed').value.trim(),lastCalving:$('#cowLastCalving').value,calvingCount:Math.max(0,Number($('#cowCalvingCount').value)||0),reproOverride:$('#cowForceRepro').checked?'include':(c?.reproOverride==='exclude'?'exclude':'')};
 const requestedLoc=$('#cowLocation')?.value||'';
 if(c){const oldLoc=c.currentLocationId||'';Object.assign(c,data);if(oldLoc!==requestedLoc)setCowLocation(c,requestedLoc,dateISO(today()),'Modification fiche vache')} else {c={...data,active:true,source:'manual',events:[],estiveActive:false,estiveSeason:'',currentLocationId:'',currentLocationName:''};state.cows.push(c);if(requestedLoc)setCowLocation(c,requestedLoc,dateISO(today()),'Ajout manuel')}; save(); $('#cowFormDialog').close();
}
function exitCow(id){const c=state.cows.find(x=>x.id===id);if(!c)return; const reason=prompt('Motif de sortie (facultatif) : vendue, réforme, morte, autre…',''); if(reason===null)return; const d=prompt('Date de sortie (AAAA-MM-JJ) :',dateISO(today())); if(d===null)return; c.active=false;c.exitDate=/^\d{4}-\d{2}-\d{2}$/.test(d)?d:dateISO(today());c.exitReason=reason.trim();c.exitOrigin='manual';save();$('#cowDialog').close();}
function eventLabel(e){return ({heat:'Chaleur observée',service:e.mode==='ai'?'Insémination artificielle':'Saillie naturelle',pregnant:'Gestation confirmée',not_pregnant:'Diagnostic négatif',calving:'Vêlage'})[e.type]||e.type}
function eventExtraText(e){const x=[];if(e.type==='service'&&e.dateUncertaintyDays)x.push(`date ±${e.dateUncertaintyDays} j`);if(e.type==='pregnant'&&e.gestAgeMinDays){x.push(e.gestAgeMinDays===e.gestAgeMaxDays?`gestation estimée ${e.gestAgeMinDays} j`:`gestation estimée ${e.gestAgeMinDays}–${e.gestAgeMaxDays} j`)}if(e.estive)x.push('estive');return x.length?' • '+x.join(' • '):''}

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
 $('#dataInfo').textContent=`Base actuelle : ${state.cows.filter(c=>c.active!==false).length} femelles présentes • ${state.cows.filter(isReproEligible).length} suivies repro • ${state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length} hors âge • ${state.cows.filter(c=>c.active===false).length} sorties • ${state.males.length} mâles • ${state.cows.filter(c=>c.estiveActive).length} en estive • ${state.locations.length} lieu(x) • source ${state.meta?.source||'locale'}`;
 const cemail=$('#cloudUserEmail'); if(cemail)cemail.textContent=cloudUserEmail()||'Non connecté';
}

function openCalendarDay(day){
  const alerts=calendarAlertsForDay(day);
  const d=new Date(day+'T12:00:00');
  const box=$('#calendarDayDetail');
  if(!box)return;
  box.innerHTML=`<div class="dialog-head"><div><h2>${frDate(d,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</h2><div class="muted small">${alerts.length} alerte${alerts.length>1?'s':''} avec les filtres actuels</div></div><button type="button" id="closeCalendarDay" class="iconbtn">✕</button></div><div class="cards calendar-day-alerts">${alerts.length?alerts.map(alertHTML).join(''):'<div class="empty">Aucune alerte affichée pour cette journée.</div>'}</div>`;
  $('#closeCalendarDay').onclick=()=>$('#calendarDayDialog').close();
  box.querySelectorAll('.open-cow').forEach(b=>b.onclick=()=>{const id=b.dataset.id;$('#calendarDayDialog').close();openCow(id)});
  $('#calendarDayDialog').showModal();
}
function bindCalendarDayOpen(){ $$('.calendar-day-open').forEach(b=>b.onclick=()=>openCalendarDay(b.dataset.date)) }

function renderCalendar(){
 const start=new Date(calDate), end=new Date(calDate); let days=[];
 if(calMode==='day'){days=[new Date(calDate)]; $('#calTitle').textContent=frDate(calDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
 if(calMode==='week'){const wd=(calDate.getDay()+6)%7; start.setDate(calDate.getDate()-wd); end.setTime(start.getTime()); end.setDate(start.getDate()+6); for(let i=0;i<7;i++)days.push(addDays(start,i)); $('#calTitle').textContent=`${frDate(start,{day:'numeric',month:'short'})} – ${frDate(end,{day:'numeric',month:'short',year:'numeric'})}`}
 if(calMode==='month'){
   start.setDate(1); $('#calTitle').textContent=frDate(start,{month:'long',year:'numeric'}); const y=start.getFullYear(),m=start.getMonth(), first=(start.getDay()+6)%7, count=new Date(y,m+1,0).getDate(); let html='<div class="month-grid">'+['L','M','M','J','V','S','D'].map(x=>`<div class="muted">${x}</div>`).join(''); for(let i=0;i<first;i++)html+='<div></div>'; for(let d=1;d<=count;d++){const dt=new Date(y,m,d,12), iso=dateISO(dt), al=calendarAlertsForDay(iso); html+=`<button type="button" class="month-cell calendar-day-open" data-date="${iso}" aria-label="Voir les alertes du ${d}"><div class="n">${d}</div>${al.slice(0,3).map(a=>`<div><span class="dot"></span><span class="event-text">${esc(a.cow.workNumber)}</span></div>`).join('')}${al.length>3?`<small>+${al.length-3}</small>`:''}</button>`} html+='</div>'; $('#calendarContent').innerHTML=html; bindCalendarDayOpen(); return;
 }
 $('#calendarContent').innerHTML=days.map(d=>{const iso=dateISO(d), a=calendarAlertsForDay(iso); return `<div class="day-block"><button type="button" class="day-title calendar-day-open" data-date="${iso}">${frDate(d,{weekday:'long',day:'numeric',month:'long'})} <span class="day-open-hint">Voir le détail ›</span></button>${a.length?a.map(alertHTML).join(''):`<div class="empty">Rien à surveiller</div>`}</div>`}).join(''); bindCowOpen(); bindCalendarDayOpen();
}

function findEventOwner(eventId){for(const c of state.cows){const ev=(c.events||[]).find(e=>e.id===eventId);if(ev)return {cow:c,event:ev}}return null}
function openEvent(cowId,eventId=''){
 $('#eventForm').reset(); $('#eventEditId').value=eventId||''; $('#eventDialogTitle').textContent=eventId?'Modifier l’événement':'Ajouter un événement'; $('#eventType').value='service'; $('#eventDate').value=dateISO(today()); $('#eventCowId').value=''; $('#selectedCow').classList.add('hidden'); $('#eventCowMatches').innerHTML=''; $('#eventCowSearch').value=''; populateNaturalBulls();
 if(eventId){const found=findEventOwner(eventId); if(found){const ev=found.event; selectEventCow(found.cow); $('#eventType').value=ev.type||'service'; $('#eventDate').value=ev.date||dateISO(today()); $('#eventNote').value=ev.note||''; $('#eventEstive').checked=!!ev.estive; if(ev.type==='service'){ $('#serviceMode').value=ev.mode||'natural'; $('#serviceApprox').checked=Number(ev.dateUncertaintyDays)>0; $('#serviceApproxDays').value=Number(ev.dateUncertaintyDays)||7; updateServiceFields(); if(ev.mode==='ai')$('#aiBull').value=ev.bull||''; else {const sel=$('#naturalBull'); const value=ev.bull||''; if(value&&![...sel.options].some(o=>o.value===value)){const opt=document.createElement('option');opt.value=value;opt.textContent=value+' (ancien)';sel.appendChild(opt)} sel.value=value;} } if(ev.type==='pregnant'&&Number(ev.gestAgeMinDays)>0){const min=Number(ev.gestAgeMinDays),max=Number(ev.gestAgeMaxDays)||min;$('#pregEstimateUnit').value='days';if(min===max){$('#pregEstimateType').value='exact';$('#pregExactValue').value=min}else{$('#pregEstimateType').value='range';$('#pregMinValue').value=min;$('#pregMaxValue').value=max}} }}
 else if(cowId){selectEventCow(state.cows.find(c=>c.id===cowId))}
 updateServiceFields(); $('#eventDialog').showModal();
}
function selectEventCow(c){if(!c)return; $('#eventCowId').value=c.id; $('#eventCowSearch').value=''; $('#eventCowMatches').innerHTML=''; $('#selectedCow').textContent=`${c.name||'Sans nom'} · ${c.workNumber}`; $('#selectedCow').classList.remove('hidden'); if($('#eventEstive')&&!$('#eventEditId').value)$('#eventEstive').checked=!!c.estiveActive}
function updatePregEstimateFields(){const t=$('#pregEstimateType')?.value||'none';$('#pregExactWrap')?.classList.toggle('hidden',t!=='exact');$('#pregRangeWrap')?.classList.toggle('hidden',t!=='range')}
function updateServiceFields(){const type=$('#eventType').value,svc=type==='service',preg=type==='pregnant'; $('#serviceFields').classList.toggle('hidden',!svc); $('#pregnancyFields').classList.toggle('hidden',!preg); $('#pregnancyContextFields').classList.toggle('hidden',!(svc||preg)); const ai=$('#serviceMode').value==='ai'; $('#naturalBullWrap').classList.toggle('hidden',!svc||ai); $('#aiBullWrap').classList.toggle('hidden',!svc||!ai); $('#serviceApproxWrap').classList.toggle('hidden',!svc||!$('#serviceApprox').checked); updatePregEstimateFields()}
function closeEventDialog(){if($('#eventDialog').open)$('#eventDialog').close(); $('#eventForm').reset(); $('#eventCowMatches').innerHTML=''}

function addEventFromForm(e){e.preventDefault(); const c=state.cows.find(x=>x.id===$('#eventCowId').value); if(!c){alert('Choisis une vache dans la liste.');return}
 const type=$('#eventType').value,date=$('#eventDate').value;if(!date){alert('Indique la date de l’événement.');return}const editId=$('#eventEditId').value;
 const ev={id:editId||uid(),type,date,note:$('#eventNote').value.trim()};
 if(type==='service'){ev.mode=$('#serviceMode').value;ev.bull=ev.mode==='ai'?$('#aiBull').value.trim():$('#naturalBull').value;if($('#serviceApprox').checked)ev.dateUncertaintyDays=Math.max(1,Number($('#serviceApproxDays').value)||7);if(ev.mode==='ai'&&ev.bull&&!state.aiBulls.includes(ev.bull))state.aiBulls.push(ev.bull)}
 if(type==='pregnant'){const t=$('#pregEstimateType').value,unit=$('#pregEstimateUnit').value;if(t==='exact'){const d=daysFromEstimate($('#pregExactValue').value,unit);if(!d){alert('Indique la durée de gestation estimée.');return}ev.gestAgeMinDays=d;ev.gestAgeMaxDays=d}else if(t==='range'){let a=daysFromEstimate($('#pregMinValue').value,unit),b=daysFromEstimate($('#pregMaxValue').value,unit);if(!a||!b){alert('Indique le minimum et le maximum de la durée estimée.');return}if(a>b)[a,b]=[b,a];ev.gestAgeMinDays=a;ev.gestAgeMaxDays=b}}
 if((type==='service'||type==='pregnant')&&$('#eventEstive').checked)ev.estive=true;
 if(editId){const found=findEventOwner(editId);if(found){const oldWasCalving=found.event.type==='calving',newIsCalving=type==='calving';found.cow.events=(found.cow.events||[]).filter(x=>x.id!==editId);if(oldWasCalving&&!newIsCalving)found.cow.calvingCount=Math.max(0,(found.cow.calvingCount||0)-1);if(found.cow!==c&&oldWasCalving)found.cow.calvingCount=Math.max(0,(found.cow.calvingCount||0)-1);if(newIsCalving&&(!oldWasCalving||found.cow!==c))c.calvingCount=(c.calvingCount||0)+1;}}
 else if(type==='calving')c.calvingCount=(c.calvingCount||0)+1;
 c.events=c.events||[];c.events.push(ev);if(type==='calving')c.lastCalving=date;save();closeEventDialog();
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
   } else {state.cows.push({id:rid,workNumber:work,name:r.Nom,birthDate:birth,breed:r['Type racial']||'',lastCalving:histLast,calvingCount:b.length,events:[],active:!csvExit,exitDate:csvExit,exitReason:csvExit?'Sortie indiquée dans le CSV':'',exitOrigin:csvExit?'csv':'',source:'csv',reproOverride:'',estiveActive:false,estiveSeason:'',currentLocationId:'',currentLocationName:''});added++;}
 }
 const oldM=new Map(state.males.map(b=>[b.id,b])); const csvMales=records.filter(r=>r.Sexe==='M'&&!r['Date sortie']).map(r=>{const old=oldM.get(r['Identifiant bovin']);return {id:r['Identifiant bovin'],workNumber:old?.manualEdit?(old.workNumber||r['Numéro travail']):r['Numéro travail'],name:old?.manualEdit?(old.name||r.Nom):r.Nom,birthDate:dmyToIso(r['Date naissance']),activeBreeder:old?.activeBreeder||false,manualEdit:old?.manualEdit||false}}); const csvIds=new Set(csvMales.map(b=>b.id)); const manualMales=state.males.filter(b=>b.id?.startsWith('manual-')&&!csvIds.has(b.id)); state.males=[...csvMales,...manualMales];
 const underAge=state.cows.filter(c=>c.active!==false&&isUnderAge(c)&&c.reproOverride!=='include').length; state.meta={source:name,importedAt:dateISO(today()),lastImport:{added,updated,exited,manualKept,underAge}};save(); return {added,updated,exited,manualKept,underAge};
}

function exportBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`repro-bovine-sauvegarde-${dateISO(today())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function notificationTypeEnabled(a){
 const n=state.notifications||NOTIF_DEFAULTS;
 if(a.type==='heat_return')return n.heatReturn;
 if(a.type==='preg_check')return n.pregCheck;
 if(a.type==='precalving'||a.type==='precalving_early')return n.precalving;
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

function renderAll(){renderHome();renderCows();renderLocations();renderBulls();renderSettings();renderCalendar()}
function switchView(v){$$('.view').forEach(x=>x.classList.remove('active')); $(`#view-${v}`).classList.add('active'); $$('.bottomnav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v)); if(v==='cows')renderCows(); if(v==='calendar')renderCalendar(); if(v==='locations')renderLocations()}

document.addEventListener('DOMContentLoaded',()=>{
 $('#todayLabel').textContent=today().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 $('#authForm').onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),pw=$('#authPassword').value;$('#authError').textContent='Connexion…';try{await cloudLogin(email,pw);$('#authError').textContent='';hideAuthDialog();await syncCloud()}catch(err){$('#authError').textContent=err.message||'Connexion impossible'}};
 $('#recoverBtn').onclick=async()=>{const email=$('#authEmail').value.trim();if(!email){$('#authError').textContent='Indique ton adresse email.';return}try{await cloudRecover(email);$('#authError').textContent='Email de réinitialisation envoyé.'}catch(err){$('#authError').textContent=err.message||'Envoi impossible'}};
 $('#testSupabaseBtn').onclick=async()=>{
 const out=$('#supabaseTestResult');
 if(out){out.textContent='⏳ Test en cours…';out.style.color=''}
 const r=await testSupabaseNetwork();
 if(r.ok){
   if(out){out.textContent='✅ '+(r.text||'Supabase joignable')+' (HTTP '+r.status+'). Tu peux maintenant essayer de te connecter.';out.style.color='#267344'}
 }else{
   if(out){out.textContent='❌ Supabase inaccessible : '+(r.text||('HTTP '+r.status))+'. Ne touche pas au mot de passe.';out.style.color='#b3263b'}
 }
};
 $('#passwordResetForm').onsubmit=async e=>{e.preventDefault();const p1=$('#newPassword').value,p2=$('#newPasswordConfirm').value,err=$('#passwordResetError');err.textContent='';if(p1.length<6){err.textContent='Choisis un mot de passe d’au moins 6 caractères.';return}if(p1!==p2){err.textContent='Les deux mots de passe ne sont pas identiques.';return}err.textContent='Enregistrement…';try{await updateRecoveredPassword(p1);err.textContent='';hidePasswordResetDialog();cloudSetStatus('☁️ Connexion…','sync');await syncCloud();alert('Mot de passe modifié. Tu es maintenant connectée à Repro Bovine.')}catch(ex){err.textContent=ex.message||'Modification impossible'}};
 $('#cloudLogoutBtn').onclick=cloudLogout; $('#cloudSyncBtn').onclick=()=>syncCloud();
 $('#changePasswordBtn').onclick=showChangePasswordDialog;
 $('#closeChangePasswordBtn').onclick=hideChangePasswordDialog;
 $('#cancelChangePasswordBtn').onclick=hideChangePasswordDialog;
 $('#changePasswordForm').onsubmit=async e=>{e.preventDefault();const p1=$('#accountNewPassword').value,p2=$('#accountNewPasswordConfirm').value,err=$('#changePasswordError');err.textContent='';if(p1.length<6){err.textContent='Choisis un mot de passe d’au moins 6 caractères.';return}if(p1!==p2){err.textContent='Les deux mots de passe ne sont pas identiques.';return}err.textContent='Enregistrement…';try{await updateAccountPassword(p1);err.textContent='';hideChangePasswordDialog();alert('Mot de passe modifié avec succès. Aucun email de récupération n’a été envoyé.')}catch(ex){err.textContent=ex.message||'Modification impossible'}};
 $$('.bottomnav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view)); $('#quickAddBtn').onclick=()=>openEvent();
 $('#cowSearch').oninput=renderCows; $('#addCowBtn').onclick=()=>openCowForm(); $('#cowForm').onsubmit=saveCowForm; $$('[data-cow-filter]').forEach(b=>b.onclick=()=>{$$('[data-cow-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');cowFilter=b.dataset.cowFilter;renderCows()});
 $('#eventCowSearch').oninput=()=>{const q=norm($('#eventCowSearch').value); if(q.length<1){$('#eventCowMatches').innerHTML='';return} const list=state.cows.filter(c=>isReproEligible(c)&&(norm(c.name).includes(q)||norm(c.workNumber).includes(q))).slice(0,8); $('#eventCowMatches').innerHTML=list.map(c=>`<button type="button" class="match" data-pick="${esc(c.id)}"><strong>${esc(c.name||'Sans nom')} · ${esc(c.workNumber)}</strong><div class="cow-sub">${ageText(c.birthDate)}</div></button>`).join(''); $$('[data-pick]').forEach(b=>b.onclick=()=>selectEventCow(state.cows.find(c=>c.id===b.dataset.pick)))};
 $('#eventType').onchange=updateServiceFields; $('#serviceMode').onchange=updateServiceFields; $('#serviceApprox').onchange=updateServiceFields; $('#pregEstimateType').onchange=updatePregEstimateFields; $('#eventForm').onsubmit=addEventFromForm; $('#cancelEventTop').onclick=closeEventDialog; $('#cancelEventBottom').onclick=closeEventDialog;
 $('#addLocationBtn').onclick=()=>openLocationForm();$('#locationForm').onsubmit=saveLocationForm;$('#closeLocationDialog').onclick=$('#cancelLocationDialog').onclick=()=>$('#locationDialog').close();$('#batchMoveBtn').onclick=()=>openBatchMove();$('#batchMoveForm').onsubmit=saveBatchMove;$('#closeBatchMove').onclick=()=>$('#batchMoveDialog').close();$('#batchCowSearch').oninput=renderBatchCowList;$('#batchSelectAll').onclick=()=>$$('#batchCowList input').forEach(x=>x.checked=true);$('#batchSelectNone').onclick=()=>$$('#batchCowList input').forEach(x=>x.checked=false);
 $('#estiveCsvInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{let loc=$('#estiveLocationSelect').value;if(!loc){const l=ensureEstiveLocation();loc=l.id}const season=Number($('#estiveSeason').value)||new Date().getFullYear();const r=importEstiveCSV(await f.text(),f.name,season,loc);const detail=r.unknown?`\n\nNon reconnus :\n${r.unrecognized.slice(0,12).map(x=>`• ${x.name||'Sans nom'} · ${x.work||'?'} · ${x.national||'?'}`).join('\n')}${r.unknown>12?`\n… et ${r.unknown-12} autre(s)`:''}`:'';alert(`Liste d’estive importée.\n\n${r.recognized} animal(aux) reconnu(s) et marqué(s) en estive\n${r.unknown} ligne(s) non reconnue(s)${detail}\n\nL’alerte vêlage estive de 23 jours s’applique automatiquement.`)}catch(err){alert('Import estive impossible : '+err.message)}e.target.value=''};
 $('#closeEstiveBtn').onclick=()=>{if(confirm('Clôturer l’estive en cours ? Les vaches ne seront plus marquées en estive, mais leur historique de localisation restera conservé.')){const n=closeCurrentEstive();alert(`${n} vache(s) retirée(s) du statut estive.`)}};
 $('#addBullBtn').onclick=()=>openBullForm(); $('#bullForm').onsubmit=saveBullForm; $('#cancelBullTop').onclick=()=>$('#bullDialog').close(); $('#cancelBullBottom').onclick=()=>$('#bullDialog').close();
 $('#saveSettingsBtn').onclick=()=>{Object.keys(DEFAULTS).forEach(k=>state.settings[k]=Math.max(0,Number($(`#set-${k}`).value)||0)); state.herdSettings={...HERD_DEFAULTS,...state.herdSettings,minFemaleAgeMonths:Math.max(0,Number($('#minFemaleAgeMonths')?.value)||0)}; state.notifications={...NOTIF_DEFAULTS,...state.notifications,enabled:$('#notif-enabled')?.checked??false,time:$('#notif-time')?.value||'07:00',heatReturn:$('#notif-heatReturn')?.checked??true,pregCheck:$('#notif-pregCheck')?.checked??true,precalving:$('#notif-precalving')?.checked??true,term:$('#notif-term')?.checked??true,postpartum:$('#notif-postpartum')?.checked??true}; save();alert('Réglages enregistrés. Le suivi repro a été recalculé avec le nouvel âge minimum.');}; $('#resetSettingsBtn').onclick=()=>{state.settings={...DEFAULTS};state.herdSettings={...HERD_DEFAULTS};state.notifications={...NOTIF_DEFAULTS};save()};
 $('#csvInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const r=importHerdCSV(await f.text(),f.name);alert(`Fusion CSV terminée.\n\n${r.added} nouvelle(s) vache(s)\n${r.updated} fiche(s) reconnue(s) et mise(s) à jour\n${r.exited} sortie(s) détectée(s)\n${r.manualKept} vache(s) ajoutée(s) manuellement conservée(s)\n${r.underAge} femelle(s) hors critère d’âge\n\nLes événements repro saisis dans l’application ont été conservés.`)}catch(err){alert('Import impossible : '+err.message)}e.target.value=''};
 $('#exportBtn').onclick=exportBackup; $('#restoreInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!x.cows||!x.settings)throw Error('format incorrect');state=normalizeState(x);save();alert('Sauvegarde restaurée.')}catch(err){alert('Restauration impossible : '+err.message)}e.target.value=''};
 $('#notifyBtn').onclick=requestNotifications;
 $$('#calendarMode button').forEach(b=>b.onclick=()=>{$$('#calendarMode button').forEach(x=>x.classList.remove('active'));b.classList.add('active');calMode=b.dataset.mode;renderCalendar()});
 $$('.calendar-filter-chips [data-cal-filter]').forEach(b=>b.onclick=()=>{const k=b.dataset.calFilter;calendarFilters[k]=!calendarFilters[k];b.classList.toggle('active',calendarFilters[k]);localStorage.setItem('repro-calendar-filters',JSON.stringify(calendarFilters));renderCalendar()});
 $$('.home-filter-chips [data-home-filter]').forEach(b=>b.onclick=()=>{const k=b.dataset.homeFilter;homeFilters[k]=!homeFilters[k];b.classList.toggle('active',homeFilters[k]);localStorage.setItem('repro-home-filters',JSON.stringify(homeFilters));renderHome()});
 $('#cowSort').onchange=renderCows;
 $('#calPrev').onclick=()=>{calDate=addDays(calDate,calMode==='day'?-1:calMode==='week'?-7:-30);renderCalendar()}; $('#calNext').onclick=()=>{calDate=addDays(calDate,calMode==='day'?1:calMode==='week'?7:30);renderCalendar()};
 $$('.calendar-filter-chips [data-cal-filter]').forEach(b=>b.classList.toggle('active',calendarFilters[b.dataset.calFilter]!==false));
 $$('.home-filter-chips [data-home-filter]').forEach(b=>b.classList.toggle('active',homeFilters[b.dataset.homeFilter]!==false));
 renderAll(); initCloudAuth();
 // v1.6.0: service worker remains disabled while Supabase authentication is stabilized.
 maybeDailyNotification();
 setInterval(maybeDailyNotification,60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')maybeDailyNotification()});
 window.addEventListener('focus',()=>{maybeDailyNotification();syncCloud({silent:true})});
 window.addEventListener('online',()=>syncCloud());
});

// v1.6.0: purge legacy PWA workers/caches once, before next auth attempt.
if(!sessionStorage.getItem('reproV146Purge')){sessionStorage.setItem('reproV146Purge','1');clearLegacyPwaCaches();}
