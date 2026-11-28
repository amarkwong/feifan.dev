import {$,fmt} from './util.mjs';
import {timeAt,validate,starter} from './model.mjs';
export const KEY='homeward-studio-v1';
// Shared mutable app state. Modules read/write S.* instead of file-level variables.
export const S={state:starter(),history:[],selected:null,tab:'country',filter:'',zoom:0,scale:24,drag:null,ghost:null,toastTimer:null,saveError:false,geometry:new Map(),pending:null,confirmAction:null};
// app.js registers the real render(); modules call hooks.render() to avoid import cycles.
// sync.mjs sets hooks.persisted to push local edits to the shared plan.
export const hooks={render(){},persisted(){}};
export function ask(message,action){$('#confirm-message').textContent=message;S.confirmAction=action;$('#confirm-dialog').showModal()}
export function undo(){if(!S.history.length)return;S.state=S.history.pop();persist();hooks.render();notify('Last change undone.')}
export const when=n=>{const t=timeAt(S.state.start,n);return `${fmt(t.slice(0,10))} ${t.slice(11)}`};
export function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(S.toastTimer);S.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200)}
export function persist(remote=false){try{localStorage.setItem(KEY,JSON.stringify(S.state));$('#saved').textContent='Saved on this device'}catch{$('#saved').textContent='Storage unavailable · export to save';notify('Browser storage unavailable. Export to keep your plan.')}if(!remote)hooks.persisted()}
export function commit(next,message){try{validate(next);S.history.push(structuredClone(S.state));if(S.history.length>50)S.history.shift();S.state=next;persist();hooks.render();if(message)notify(message);return true}catch(e){notify(e.message);return false}}
export function get(id=S.selected){return S.state.items.find(x=>x.id===id)}
export function ancestors(x){const arr=[];while(x){arr.unshift(x);x=get(x.parent)}return arr}
export function context(type){const chain=ancestors(get());return chain.find(x=>x.type===type)||null}
export function color(x){return x.type==='country'?x.title:(x.country||ancestors(x).find(y=>y.type==='country')?.title||'')}
export function select(id,auto=true){S.selected=id;const x=get();if(auto&&x){if(x.type==='country')S.tab='city';if(x.type==='city')S.tab='activity';if(x.type==='activity')S.tab='activity';if(x.type==='logistics')S.tab=x.kind==='Hotel'?'hotel':'logistics';S.filter='';$('#search').value=''}hooks.render()}
