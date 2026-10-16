(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.HomeBaseGrowth = api; document.addEventListener('DOMContentLoaded', api.boot); }
})(typeof window === 'undefined' ? globalThis : window, function() {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  function canSync(owner, userId) { return !!userId && owner === userId; }
  function insideRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
    }
    return inside;
  }
  function areaAt(features, lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    for (const f of features.filter(f => f.properties?.areaType === 'neighborhood').concat(features.filter(f => f.properties?.areaType !== 'neighborhood'))) {
      const polygons = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      if (polygons.some(p => insideRing(lon,lat,p[0]) && !p.slice(1).some(h => insideRing(lon,lat,h)))) return f.properties?.areaName || null;
    }
    return null;
  }
  function forecastRecords({area, apps, rates, states = [], now = Date.now(), uuid}) {
    if (!area) return [];
    return apps.flatMap((app,i) => ['Uber','Lyft','Empower'].includes(app.name) && Number.isFinite(rates[i]) && rates[i]>0
      ? [15,30,60].map(h => ({prediction_id:uuid(),model_version:'homebase-opportunity-v111',area,
        platform:app.name,horizon_minutes:h,forecast_for:new Date(now+h*60000).toISOString(),
        gross_hourly_estimate:rates[i],input_status:states[i]?.includes('HISTORY')?'history_estimate':'modeled'})) : []);
  }
  function boot() {
    if (!window.HomeBaseCloud || !window.HomeBaseConfig) return;
    const backend = HomeBaseCloud.connectHomeBase(HomeBaseConfig);
    const content = document.getElementById('workspaceContent');
    let me = null, version = null, busy = false, privacy = {}, message = '', recovery = false;
    let areas = [], sponsors = [], lastPrediction = 0, lastObservation = 0, fingerprint = '', autosave = false;
    const readOwner = () => localStorage.getItem('homeBaseCloudOwner');
    const emptyPrefs = () => ({usage_analytics:false,model_improvement:false,benchmark_sharing:false});
    const redirect = 'https://home-base-drivers.github.io/Home-base-app/';
    let needsConfirm = null, identityRevision = 0, authEmail = '', codeEmail = '';
    // Account onboarding: link this device once per account, then offer an optional saved password.
    let linkChoice = null, autoLinkedFor = '', offerPassword = false;
    // Supabase returns terse auth errors; show drivers what to do next instead.
    const authHints = [
      [/email not confirmed/i,'That email has not been confirmed yet. Check your inbox and spam folder, or use Resend confirmation email below.'],
      [/invalid login credentials/i,'That email and password were not accepted. You can use Email me a sign-in code without changing your password.'],
      [/token has expired|otp_expired|invalid.*otp|invalid.*token/i,'That code is invalid or expired. Use the newest sign-in code, or request another.'],
      [/email rate limit|over_email_send_rate_limit|only request this after/i,'Too many email requests. Wait before requesting another link, and check your inbox and spam folder for the latest message.']
    ];
    const authMessage = error => authHints.find(([pattern])=>pattern.test(String(error?.message||'')))?.[1] || null;
    const authHint = (error,email) => {
      if(/email not confirmed/i.test(String(error?.message||'')))needsConfirm=email;
      return authMessage(error);
    };
    const deviceKeys = [...HomeBaseCloud.progressKeys,'homeBaseLedger','homeBaseEarningsProfile','homeBaseTripRows','homeBaseActiveShift','homeBaseDispatchState','homeBaseDispatchLog','homeBaseDriverEvidence','homeBasePrivateDestination'];
    // In-progress shifts are intentionally excluded from the existing backup format.
    const localBackup = () => Object.fromEntries(deviceKeys.filter(k=>!['homeBaseActiveShift','homeBasePrivateDestination'].includes(k)).map(k => [k,read(k)]).filter(([,v])=>v!==null));
    const download = (name,data) => { const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
    const K=HomeBaseCloud.SYNC_KEYS;
    // Record what actually happened, so no screen can claim a save that did not finish.
    const markSynced = () => { try{localStorage.setItem(K.syncedAt,String(Date.now()));localStorage.removeItem(K.failedAt);localStorage.removeItem(K.failure);}catch{} };
    const markFailed = kind => { try{localStorage.setItem(K.failedAt,String(Date.now()));localStorage.setItem(K.failure,kind);}catch{} };
    const publishSession = () => { globalThis.HomeBaseCloudState={signedIn:!!me,busy,email:me?.email||''}; };
    const syncState = () => HomeBaseCloud.syncStatus(localStorage,{signedIn:!!me,busy:busy&&!!me&&!recovery});
    const status = text => { message=text; const node=document.getElementById('cloudStatus');if(node)node.textContent=text; };
    const fail = error => {const conflict=error?.name==='CloudConflictError';if(conflict){autosave=false;localStorage.setItem('homeBaseAutoCloud','false');}markFailed(conflict?'conflict':'error');publishSession();
      status(error?.name==='CloudConflictError' ? 'Another device has newer settings. Automatic saving paused. Download a device backup, then choose Restore cloud copy. No settings were overwritten.' : (authMessage(error) || error?.message || 'Cloud request failed. Your device data was kept.'));};
    const action = async fn => { if(busy)return;busy=true;publishSession();try{await fn();}catch(error){fail(error);}finally{busy=false;publishSession();if(document.getElementById('workspaceTitle').textContent==='Profile')renderProfile();} };
    async function refreshIdentity() {
      const revision=++identityRevision;
      let user;
      try{user=await backend.getUser();}
      catch(error){
        if(revision!==identityRevision)return;
        // A connection failure does not prove that an existing account signed out.
        if(error?.name==='AuthSessionMissingError'||/auth session missing|sign in.*first/i.test(error?.message||''))user=null;
        else throw error;
      }
      if(revision!==identityRevision)return;
      me=user;privacy=emptyPrefs();version=null;autosave=false;fingerprint='';
      // Account identity is independent of optional cloud settings loading.
      publishSession();
      if(document.getElementById('workspaceTitle').textContent==='Profile')renderProfile();
      if(!me)return;
      const userId=me.id;
      await backend.ensureProfile();
      const [prefs,cloud]=await Promise.all([backend.privacy(),backend.getProgress()]);
      if(revision!==identityRevision||me?.id!==userId)return;
      privacy=prefs;
      const remembered=Number(localStorage.getItem('homeBaseCloudVersion'));
      version=canSync(readOwner(),userId)&&localStorage.getItem('homeBaseCloudVersion')!==null?remembered:cloud.version;
      autosave=canSync(readOwner(),userId) && localStorage.getItem('homeBaseCloudVersion')!==null && localStorage.getItem('homeBaseAutoCloud')==='true';
      publishSession();
      if(autoLinkedFor!==userId){autoLinkedFor=userId;try{await autoLink(userId);}catch(error){fail(error);}}
      if(document.getElementById('workspaceTitle').textContent==='Profile')renderProfile();
    }
    // First sign-in on a device: bring the account's data here, and offer to keep this phone's data.
    async function autoLink(userId) {
      if(!me||me.id!==userId||canSync(readOwner(),userId))return;
      const owner=readOwner();
      if(owner&&owner!==userId){status('This phone holds another Home Base account’s data. Download a device backup, then choose Restore cloud copy to switch accounts.');return;}
      if(HomeBaseCloud.deviceHasDriverData(localStorage)){linkChoice='ask';return;}
      await linkDevice(true);
    }
    // Combine (or replace) this device's data with the signed-in account, then keep both in sync.
    async function linkDevice(includeDevice) {
      if(!me)throw Error('Sign in first.');
      const [cloud,cloudRows,cloudTrips,dispatchState,dispatchLog]=await Promise.all([backend.getProgress(),listAllEarnings(),backend.listDispatchTrips(),backend.getDispatchState(),backend.listDispatchRecommendations()]);
      const cloudState=cloud.state||{},deviceState=HomeBaseCloud.progressSnapshot(localStorage);
      const deviceLedger=includeDevice?(read('homeBaseLedger')||[]):[];
      const deviceTrips=includeDevice?(read('homeBaseTripRows')||[]).filter(r=>r&&r.record_id):[];
      const merged=includeDevice?HomeBaseCloud.mergeProgress(cloudState,deviceState):cloudState;
      let nextVersion=cloud.version||0;
      if(includeDevice){
        const ledgerUploads=deviceLedger.filter(r=>r&&r.source!=='provider');
        if(ledgerUploads.length)await backend.saveEarnings(ledgerUploads,{source:'csv'});
        const tripUploads=deviceTrips.filter(r=>['manual','csv','screenshot'].includes(r.source));
        if(tripUploads.length)await backend.saveDispatchTrips(tripUploads);
        if(!cloud.version||JSON.stringify(merged)!==JSON.stringify(cloudState)){const saved=await backend.saveProgress(merged,cloud.version||0);nextVersion=saved.version;}
      }
      const rows=includeDevice?await listAllEarnings():cloudRows,trips=includeDevice?await backend.listDispatchTrips():cloudTrips;
      const union=(list,key)=>{const m=new Map();for(const r of list)m.set(String(r?.[key]??JSON.stringify(r)),r);return[...m.values()];};
      const ledger=union([...deviceLedger,...rows],'id'),tripRows=union([...deviceTrips,...trips],'record_id');
      const privateBase=includeDevice?read('homeBasePrivateDestination'):null;
      if(!includeDevice)deviceKeys.filter(k=>k!=='homeBaseActiveShift').forEach(k=>localStorage.removeItem(k));
      for(const [key,value] of Object.entries(merged))if(HomeBaseCloud.progressKeys.includes(key))write(key,value);
      write('homeBaseLedger',ledger);write('homeBaseTripRows',tripRows);
      if(dispatchState&&read('homeBaseDispatchState')===null)write('homeBaseDispatchState',dispatchState.settings);
      if(Array.isArray(dispatchLog)&&dispatchLog.length&&read('homeBaseDispatchLog')===null)write('homeBaseDispatchLog',dispatchLog);
      if(privateBase)write('homeBasePrivateDestination',privateBase);
      const summary=HomeBasePlanner.summarize(ledger,'Account history');write('homeBaseEarningsProfile',summary);earningsProfile=summary;
      localStorage.setItem('homeBaseCloudOwner',me.id);localStorage.setItem('homeBaseAutoCloud','true');autosave=true;
      version=nextVersion;localStorage.setItem('homeBaseCloudVersion',String(version));
      markSynced();linkChoice=null;
      fingerprint=JSON.stringify([HomeBaseCloud.progressSnapshot(localStorage),read('homeBaseLedger')||[]]);
      document.dispatchEvent(new Event('homebase:device-data-changed'));applyProductPrefs();updateEarnings();
      status(includeDevice?'Your account is ready on this phone. Profile, earnings and trips are synced, and new changes save automatically.':'This phone now shows your account’s data. New changes save automatically.');
    }
    async function listAllEarnings() {
      const rows=[];for(let offset=0;;offset+=500){const page=await backend.listEarnings({offset});rows.push(...page);if(page.length<500)break;}
      return rows;
    }
    async function uploadDevice(explicit=false) {
      if(!me)throw Error('Sign in first.');
      const owner=readOwner();
      if(owner && owner!==me.id)throw Error('This device contains another account’s history. Export its backup, then restore this account’s cloud copy before saving.');
      if(!owner && !explicit)return;
      if(!owner && !confirm('Save this device’s earnings and settings to '+me.email+'? Only confirm if all records belong to you.'))return;
      if(!owner){const cloud=await backend.getProgress();const records=await backend.listEarnings({limit:1});
        if(cloud.version || records.length)throw Error('This account already has cloud history. Restore it first; device history was not merged.');version=0;}
      const state=HomeBaseCloud.progressSnapshot(localStorage),ledger=read('homeBaseLedger')||[];
      const imported=ledger.filter(r=>r.source!=='provider');
      const saved=await backend.saveProgress(state,version);
      version=saved.version;localStorage.setItem('homeBaseCloudVersion',String(version));
      localStorage.setItem('homeBaseCloudOwner',me.id);
      await backend.saveEarnings(imported,{source:'csv'});
      markSynced();
      localStorage.setItem('homeBaseCloudOwner',me.id);localStorage.setItem('homeBaseAutoCloud','true');autosave=true;
      fingerprint=JSON.stringify([state,ledger]);status('Cloud saved · '+new Date().toLocaleTimeString()+'. New changes will save automatically while online.');
    }
    async function restoreCloud() {
      if(!me)throw Error('Sign in first.');
      if(!confirm('Replace this device’s Home Base settings and earnings with the cloud copy for '+me.email+'? Download a device backup first if needed.'))return;
      const [cloud,rows,dispatchTrips,dispatchState,dispatchLog]=await Promise.all([backend.getProgress(),listAllEarnings(),backend.listDispatchTrips(),backend.getDispatchState(),backend.listDispatchRecommendations()]);
      if(!cloud.version && !rows.length && !dispatchTrips.length && !dispatchState && deviceKeys.some(k=>read(k)!==null))throw Error('Cloud copy is empty. Export and clear device data first if you want to switch accounts.');
      // Everything has been fetched before touching the device. No implicit merge.
      const privateBase=readOwner()===me.id?read('homeBasePrivateDestination'):null;
      deviceKeys.forEach(k=>localStorage.removeItem(k));
      for(const [key,value] of Object.entries(cloud.state||{}))if(HomeBaseCloud.progressKeys.includes(key))write(key,value);
      write('homeBaseTripRows',dispatchTrips);if(dispatchState)write('homeBaseDispatchState',dispatchState.settings);write('homeBaseDispatchLog',dispatchLog);if(privateBase)write('homeBasePrivateDestination',privateBase);
      write('homeBaseLedger',rows);const summary=HomeBasePlanner.summarize(rows,'Cloud history');write('homeBaseEarningsProfile',summary);earningsProfile=summary;
      localStorage.setItem('homeBaseCloudOwner',me.id);localStorage.setItem('homeBaseAutoCloud','true');autosave=true;version=cloud.version;
      localStorage.setItem('homeBaseCloudVersion',String(version));document.dispatchEvent(new Event('homebase:device-data-changed'));
      markSynced();
      fingerprint=JSON.stringify([HomeBaseCloud.progressSnapshot(localStorage),rows]);
      applyProductPrefs();updateEarnings();status('Cloud copy restored. Refresh the map to apply saved map preferences.');renderProfile();
    }
    function accountSection() {
      const section=document.createElement('section');section.className='workspace-section growth-account';section.id='growthAccount';
      section.innerHTML='<h3>HOME BASE ACCOUNT</h3>'+(me?
        '<p>Signed in as <b>'+esc(me.email)+'</b></p>'+
        (linkChoice==='ask'?'<div class="growth-link" id="cloudLinkCard"><p><b>Add this phone’s driver data to your account?</b></p><p>Your profile, earnings and trips on this phone will be combined with your account, so they follow you to any device.</p><div class="growth-actions"><button id="cloudLinkYes" class="primary-action">Yes, add it</button><button id="cloudLinkNo" class="secondary-action">Not mine — use my account only</button></div></div>':'')+
        (offerPassword?'<form id="cloudSetPassword" class="growth-password"><p><b>Save a password for faster sign-in</b></p><p>Optional. Your iPhone can keep it in Passwords so next time is one tap.</p><label>Email<input name="username" type="email" autocomplete="username" value="'+esc(me.email)+'" readonly></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><div class="growth-actions"><button class="primary-action">Save password</button><button type="button" id="cloudSkipPassword" class="secondary-action">Not now</button></div></form>':'')+
        '<p>'+ (canSync(readOwner(),me.id)?'This device is linked to your cloud account.':'Device history is not linked. Nothing is uploaded automatically.')+'</p><div class="growth-actions"><button id="cloudSave" class="primary-action">Save device to cloud</button><button id="cloudRestore" class="secondary-action">Restore cloud copy</button><button id="cloudExport" class="secondary-action">Export cloud data</button><button id="cloudSignOut" class="secondary-action">Sign out</button></div><label><input type="checkbox" id="cloudAuto" '+(autosave?'checked':'')+'> Automatically save changes after linking this device</label>':
        '<p>Sign in to keep your profile, earnings and trips on every device. The map stays free without an account.</p><form id="cloudAuth"><label>Email<input name="email" type="email" autocomplete="username" value="'+esc(authEmail)+'" required></label><div class="growth-actions"><button type="button" id="cloudEmailLink" class="primary-action">Email me a sign-in code</button></div><p class="growth-note">New to Home Base? The same code creates your account. No password needed.</p><details id="cloudPasswordBox"><summary>Sign in with a password instead</summary><label>Password<input name="password" type="password" autocomplete="current-password" minlength="8"></label><div class="growth-actions"><button class="primary-action" name="mode" value="signin">Sign in</button><button type="button" id="cloudReset" class="secondary-action">Forgot password</button></div></details></form>')+
        (!me&&codeEmail?'<form id="cloudCode"><p>Enter the code sent to '+esc(codeEmail)+'. Stay in this app to sign in here.</p><label>Sign-in code<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required></label><button class="primary-action">Verify code and sign in</button></form>':'')+
        (recovery?'<form id="cloudRecovery"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><button class="primary-action">Update password</button></form>':'')+
        (!me&&needsConfirm?'<div class="growth-actions"><button id="cloudResend" class="secondary-action">Resend confirmation email</button></div>':'')+'<p class="growth-sync growth-sync-'+syncState().state+'" role="status">'+esc(syncState().detail)+'</p>'+'<p class="growth-note">No Uber/Lyft passwords are collected here.</p><div class="growth-actions"><button id="deviceBackup" class="secondary-action">Download device backup</button></div><p id="cloudStatus" role="status">'+esc(message)+'</p>';
      section.querySelector('#deviceBackup').onclick=()=>download('home-base-device-backup.json',{format:'home-base-backup',version:1,state:localBackup()});
      section.querySelector('#cloudAuth')?.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.target),mode=event.submitter?.value;
        action(async()=>{const email=String(data.get('email')).trim(),password=String(data.get('password')||'');authEmail=email;
          if(mode!=='signup'&&!password){status('Enter your password, or use Email me a sign-in code.');return;}
          if(mode==='signup'){const result=await backend.signUp(email,password,redirect);status(result.session?'Account created.':'Account created. Check your email to confirm your address.');}
          else {
            try{await backend.signIn(email,password);}
            catch(error){
              // Re-read identity: a rejected password is not proof of the earlier session's state.
              const wasSignedIn=!!me;await refreshIdentity();const hint=authHint(error,email);if(!hint)throw error;status(hint+(wasSignedIn&&!me?' You were signed out on this phone, so sign in again to use Home Base AI and cloud saving.':''));renderProfile();return;}
            needsConfirm=null;await refreshIdentity();if(linkChoice==='ask')status('Signed in. One more step: choose what to do with this phone’s data above.');else if(!/synced|ready|shows your account/i.test(message))status('Signed in on this device.');renderProfile();
          }});});
      section.querySelector('#cloudEmailLink')?.addEventListener('click',()=>{
        const input=section.querySelector('[name=email]');input.value=input.value.trim();
        if(!input.reportValidity())return;
        authEmail=input.value;
        const email=authEmail;
        action(async()=>{await backend.sendSignInLink(email,redirect,{createAccount:true});codeEmail=email;status('Check your email: a sign-in code is on its way. Enter it below in this app. Do not open the email link.');});
      });
      section.querySelector('#cloudCode')?.addEventListener('submit',event=>{
        event.preventDefault();const code=String(new FormData(event.target).get('code')||'');
        action(async()=>{await backend.verifyEmailCode(codeEmail,code);codeEmail='';needsConfirm=null;offerPassword=true;await refreshIdentity();if(linkChoice==='ask')status('Signed in. One more step: choose what to do with this phone’s data above.');else if(!/synced|ready|shows your account/i.test(message))status('Signed in on this device.');});
      });
      section.querySelector('#cloudReset')?.addEventListener('click',()=>action(async()=>{const email=section.querySelector('[name=email]').value.trim();if(!email)throw Error('Enter your email first.');await backend.resetPassword(email,redirect);status('If an account exists for that email, a recovery link is on its way. Check your inbox and spam folder.');}));
      section.querySelector('#cloudResend')?.addEventListener('click',()=>action(async()=>{await backend.resendConfirmation(needsConfirm,redirect);status('Confirmation email sent again to '+needsConfirm+'. Check your inbox and spam folder.');}));
      section.querySelector('#cloudRecovery')?.addEventListener('submit',event=>{event.preventDefault();action(async()=>{await backend.updatePassword(new FormData(event.target).get('password'));recovery=false;status('Password updated.');renderProfile();});});
      section.querySelector('#cloudLinkYes')?.addEventListener('click',()=>action(()=>linkDevice(true)));
      section.querySelector('#cloudLinkNo')?.addEventListener('click',()=>{if(!confirm('Replace the Home Base data on this phone with your account’s data? Download a device backup first if you might need it.'))return;action(()=>linkDevice(false));});
      section.querySelector('#cloudSetPassword')?.addEventListener('submit',event=>{event.preventDefault();const password=String(new FormData(event.target).get('password')||'');
        action(async()=>{await backend.updatePassword(password);offerPassword=false;status('Password saved. If your iPhone offers to save it, tap Save Password so sign-in is one tap next time.');});});
      section.querySelector('#cloudSkipPassword')?.addEventListener('click',()=>{offerPassword=false;renderProfile();});
      // An unlinked device combines with the account instead of being refused when the account already has data.
      section.querySelector('#cloudSave')?.addEventListener('click',()=>action(()=>canSync(readOwner(),me.id)?uploadDevice(true):linkDevice(true)));
      section.querySelector('#cloudRestore')?.addEventListener('click',()=>action(restoreCloud));
      section.querySelector('#cloudAuto')?.addEventListener('change',event=>{if(event.target.checked&&!canSync(readOwner(),me.id)){event.target.checked=false;return status('Save or restore once to link this device first.');}autosave=event.target.checked;localStorage.setItem('homeBaseAutoCloud',String(autosave));});
      section.querySelector('#cloudExport')?.addEventListener('click',()=>action(async()=>download('home-base-cloud-data.json',{exportedAt:new Date().toISOString(),earnings:await listAllEarnings(),progress:await backend.getProgress(),...(await backend.dataInventory())})));
      section.querySelector('#cloudSignOut')?.addEventListener('click',()=>action(async()=>{await backend.signOut();me=null;privacy=emptyPrefs();autosave=false;status('Signed out. Device history remains private on this device; clear it before lending the device.');renderProfile();}));
      return section;
    }
    function privacySection() {
      const section=document.createElement('section');section.className='workspace-section growth-account';
      section.innerHTML='<h3>DATA & PRIVACY</h3><p>Optional contributions help improve Home Base. Declining does not remove free access.</p>'+[
        ['usage_analytics','Share app-usage measurements','Sends feature names and server timestamps, not earnings amounts, passwords, or exact GPS.'],
        ['model_improvement','Help evaluate the forecast model','Saves displayed estimates, neighborhood model scores and nearby event timing counts only during an explicitly started, foreground shift. No exact GPS or continuous background tracking. Scores are not actual ride counts.'],
        ['benchmark_sharing','Contribute to community earnings benchmarks','Uses eligible gross earnings and online hours for grouped comparisons.']
      ].map(([key,label,description])=>'<label><input type="checkbox" data-privacy="'+key+'" '+(privacy[key]?'checked':'')+' '+(!me?'disabled':'')+'> '+label+'<small>'+description+'</small></label>').join('')+
        '<button class="primary-action" id="privacySave" '+(!me?'disabled':'')+'>Save privacy choices</button><p>Third-party data sales and personalized ads are not active. Commercial releases require a separate rights and privacy review. Optional usage and neighborhood records have a 90-day retention target; prediction records have a 180-day target.</p><details><summary>Delete data</summary><p>Export first. Clearing cloud records is different from deleting your login account. Device records are separate.</p><div class="growth-actions"><button id="cloudClear" class="secondary-action" '+(!me?'disabled':'')+'>Clear cloud records</button><button id="accountDelete" class="secondary-action" '+(!me?'disabled':'')+'>Delete account</button><button id="deviceClear" class="secondary-action">Clear device records</button></div></details>';
      section.querySelector('#privacySave').onclick=()=>action(async()=>{const choices=Object.fromEntries([...section.querySelectorAll('[data-privacy]')].map(e=>[e.dataset.privacy,e.checked]));privacy=await backend.savePrivacy(choices);status('Privacy choices saved. Turning off optional learning removes its stored cloud history.');});
      section.querySelector('#cloudClear').onclick=()=>action(async()=>{if(!confirm('Clear your Home Base cloud records? Your login account and device data remain.'))return;await backend.clearCloudData();autosave=false;localStorage.setItem('homeBaseAutoCloud','false');localStorage.removeItem('homeBaseCloudOwner');await refreshIdentity();status('Cloud records cleared. Automatic saving is off.');renderProfile();});
      section.querySelector('#accountDelete').onclick=()=>action(async()=>{if(prompt('Type DELETE to permanently remove your login and cloud records. Export first.')!=='DELETE')return;await backend.deleteAccount();await backend.signOut().catch(()=>{});me=null;privacy=emptyPrefs();autosave=false;localStorage.removeItem('homeBaseCloudOwner');localStorage.removeItem('homeBaseAutoCloud');status('Account and cloud records deleted. Device records remain until you clear them.');renderProfile();});
      section.querySelector('#deviceClear').onclick=()=>{if(!confirm('Clear device earnings and settings? Download a backup first. Cloud records remain.'))return;deviceKeys.forEach(k=>localStorage.removeItem(k));document.dispatchEvent(new Event('homebase:device-data-changed'));localStorage.removeItem('homeBaseCloudOwner');localStorage.removeItem('homeBaseAutoCloud');autosave=false;earningsProfile=null;updateEarnings();status('Device records cleared. Cloud data was not deleted.');renderProfile();};
      return section;
    }
    const originalProfile=renderProfile;
    renderProfile=function(...args){originalProfile(...args);content.prepend(accountSection());content.append(privacySection());
      const plans=document.createElement('details');plans.className='workspace-section';plans.innerHTML='<summary>Free access, Plus & sponsorships</summary><p>Free: current map, recorded earnings and supported imports. Planned Plus: ad-free experience, personalized shift plans and deeper reports.</p><p>Subscriptions, paid ads and business analytics are not selling yet. No payment details are collected. Sponsorship must never change demand scores or routes, and ads remain hidden in driving view.</p><a href="https://github.com/Home-base-drivers/Home-base-app/blob/main/GROWTH_READINESS.md" target="_blank" rel="noopener">Activation and readiness checklist</a>';content.append(plans);};
    const oldTrack=hbTrack;
    hbTrack=function(event,details={}){if(readProductPrefs().localAnalytics)oldTrack(event,details);
      if(me&&privacy.usage_analytics){const mapped=event==='navigation'?'view_'+String(details.tab):event;
        backend.usage(mapped,['map','earnings','profile','support','alerts'].includes(details.tab)?details.tab:'app').catch(()=>{});}};
    document.addEventListener('click',event=>{if(event.target.closest('#plannerNavigate,#mapsBtn')){
      if(me&&privacy.usage_analytics)backend.usage('navigation_started','map').catch(()=>{});
    }});
    async function collectLearning() {
      if(!me||!privacy.model_improvement||document.visibilityState!=='visible')return;
      const active=read('homeBaseActiveShift');if(!active)return;
      const now=Date.now();
      if(now-lastPrediction<=15*60000&&now-lastObservation<=5*60000)return;
      if(!navigator.geolocation)return;
      const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{maximumAge:60000,timeout:10000}));
      if(document.visibilityState!=='visible'||!read('homeBaseActiveShift')||!me||!privacy.model_improvement)return;
      if(now-position.timestamp>5*60000||position.coords.accuracy>1000)return;
      // Precise coordinates are used only in memory to identify the district.
      const area=areaAt(areas,position.coords.latitude,position.coords.longitude);if(!area)return;
      if(now-lastPrediction>15*60000&&Math.abs(selectedForecastTime-now)<30*60000){lastPrediction=now;
        const rates=currentApps.map((_,i)=>HomeBasePlanner.num(document.getElementById('app'+i+'Earn').textContent.split('/')[0]));
        const states=currentApps.map((_,i)=>document.getElementById('app'+i+'State').textContent);
        // These are snapshots of the current displayed estimate at future horizons,
        // not a claim that separate horizon-specific models have been trained.
        for(const prediction of forecastRecords({area,apps:currentApps,rates,states,now,uuid:()=>crypto.randomUUID()}))await backend.recordPrediction(prediction);
      }
      if(now-lastObservation>5*60000){lastObservation=now;if(!active.observationShiftId){active.observationShiftId=crypto.randomUUID();write('homeBaseActiveShift',active);}
        const district=typeof demandAreas!=='undefined'?demandAreas.find(a=>a.name===area):null;
        const context=district&&window.HomeBaseDemandHistory?HomeBaseDemandHistory.context(district):{};
        await backend.observeShift({observation_id:crypto.randomUUID(),shift_id:active.observationShiftId,area,observed_at:new Date().toISOString(),source:'foreground_neighborhood',...context});}
    }
    async function tick() {
      if(!navigator.onLine||busy||!me)return;
      if(autosave&&canSync(readOwner(),me.id)){
        const next=JSON.stringify([HomeBaseCloud.progressSnapshot(localStorage),read('homeBaseLedger')||[]]);
        if(next!==fingerprint)await action(()=>uploadDevice());
      }
      try{await collectLearning();}catch(error){fail(error);}
    }
    backend.onAuthChange((event)=>{if(event==='PASSWORD_RECOVERY'){
      recovery=true;message='Choose a new password below and tap Update password to finish the reset.';
      // Email links open the map first; make the final reset step visible immediately.
      setTimeout(()=>document.getElementById('navProfile')?.click(),0);
    }
      if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event))setTimeout(()=>window.dispatchEvent(new Event('homebase-calendar-identity')),0);
      if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','PASSWORD_RECOVERY'].includes(event))setTimeout(()=>refreshIdentity().catch(fail),0);});
    fetch('baltimore-demand-areas.geojson').then(r=>r.json()).then(data=>{areas=data.features||[];}).catch(()=>{});
    backend.sponsors().then(rows=>{sponsors=rows;}).catch(()=>{});
    function renderSponsors(){
      if(document.querySelector('.app').classList.contains('planner-drive')||!sponsors.length||content.querySelector('#growthSponsors'))return;
      const section=document.createElement('section');section.id='growthSponsors';section.className='workspace-section';
      section.innerHTML='<h3>SPONSORED DRIVER OFFERS</h3>'+sponsors.map(s=>'<article><small>Paid placement · '+esc(s.advertiser)+'</small><h4>'+esc(s.headline)+'</h4><p>'+esc(s.description)+'</p><a href="'+esc(s.destination_url)+'" target="_blank" rel="noopener sponsored" data-sponsor="'+esc(s.campaign_id)+'">View offer</a></article>').join('');
      section.querySelectorAll('[data-sponsor]').forEach(link=>link.onclick=()=>{if(me&&privacy.usage_analytics)backend.usage('sponsor_clicked','sponsor').catch(()=>{});});content.append(section);
    }
    const oldEarnings=renderEarningsPanel;renderEarningsPanel=function(...args){oldEarnings(...args);renderSponsors();};
    const oldSupport=renderSupport;renderSupport=function(...args){oldSupport(...args);renderSponsors();};
    refreshIdentity().catch(fail);setInterval(tick,30000);window.addEventListener('online',tick);
    const button=document.createElement('button');button.className='growth-account-shortcut';button.textContent='Account';button.onclick=()=>{document.getElementById('navProfile').click();};document.querySelector('.planner-toolbar')?.append(button);
    window.HomeBaseAccounts={backend,refreshIdentity,learningEnabled:()=>!!me&&!!privacy.model_improvement};
  }
  return {canSync,insideRing,areaAt,forecastRecords,boot};
});
