import {slots,stamp} from './model.mjs';
import {glyph,localNames} from './data.mjs';
import {cityDisplayName,findCity} from './cities.mjs';
export const $=s=>document.querySelector(s);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=s=>new Date(stamp(s)).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'UTC'});
export const placeName=title=>findCity(title)?cityDisplayName(title):localNames[title]?`${title} · ${localNames[title]}`:title;
export const isTravel=x=>x.type==='logistics'&&['Flight','Railway','Transfer'].includes(x.kind);
export const icon=x=>x.type==='country'?(x.title==='China'?'🇨🇳':'🇯🇵'):x.kind==='Flight'?'✈':x.kind==='Railway'?'🚆':x.kind==='Hotel'?'▣':glyph[x.type];
export const duration=n=>{const m=slots(n)*30;return m===30?'30m':m%1440===0?`${m/1440}d`:`${Math.floor(m/60)}h${m%60?' 30m':''}`};
export function id(){return crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2)}
