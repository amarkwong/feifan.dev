// Flight cards: airline from the flight number, local-time display, grid snapping, and the lookup call.
import {esc} from './util.mjs';

// IATA code -> [name, badge colour]. Colours are approximate and used for a small text badge, not logos.
export const airlines={SQ:['Singapore Airlines','#1a2b5f'],TR:['Scoot','#8a6d00'],CZ:['China Southern Airlines','#1a6fb3'],MU:['China Eastern Airlines','#1f3f93'],CA:['Air China','#c4161c'],HU:['Hainan Airlines','#c8102e'],'3U':['Sichuan Airlines','#d6361f'],FM:['Shanghai Airlines','#7a1f5c'],MF:['Xiamen Airlines','#00508f'],ZH:['Shenzhen Airlines','#8a0f1d'],'9C':['Spring Airlines','#2a9d3a'],QF:['Qantas','#e0000d'],JQ:['Jetstar','#d4501a'],VA:['Virgin Australia','#e10a0a'],JL:['Japan Airlines','#c8102e'],NH:['All Nippon Airways','#13448f'],MM:['Peach','#a9007e'],GK:['Jetstar Japan','#d4501a'],CX:['Cathay Pacific','#005d63'],KE:['Korean Air','#00256c'],OZ:['Asiana Airlines','#c8102e'],AK:['AirAsia','#e2001a'],EK:['Emirates','#d71921'],QR:['Qatar Airways','#5c0632'],BR:['EVA Air','#007a53'],CI:['China Airlines','#c60c30']};

/** "sq 246" -> {code:'SQ', number:'246', text:'SQ246'}; null when it does not look like a flight number. */
export function parseFlightNo(value){
  const m=String(value??'').toUpperCase().replace(/\s+/g,'').match(/^([A-Z0-9]{2})(\d{1,4})([A-Z]?)$/);
  return m&&/[A-Z]/.test(m[1])?{code:m[1],number:m[2]+m[3],text:m[1]+m[2]+m[3]}:null;
}
export function airlineFor(flightNo){
  const p=parseFlightNo(flightNo);if(!p)return null;
  const known=airlines[p.code];
  return {code:p.code,name:known?known[0]:null,color:known?known[1]:'#5b6b64'};
}
export const hhmm=t=>typeof t==='string'&&t.length>=16?t.slice(11,16):'';
export const minutesText=m=>m>=60?`${Math.floor(m/60)}h${m%60?` ${m%60}m`:''}`:`${m}m`;

/**
 * The planner snaps cards to 30 minutes, but real flights leave at 09:35. Return the half-hour
 * window that covers the flight so the card spans it; exact local times are kept on the card.
 */
export function gridSpan(departLocal,durationMin){
  if(!durationMin||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(departLocal||''))return null;
  const H=1800000,start=Date.parse(departLocal+':00Z'),first=Math.floor(start/H)*H,last=Math.ceil((start+durationMin*60000)/H)*H;
  return {date:new Date(first).toISOString().slice(0,16),hours:(last-first)/3600000};
}

/** One-line HTML summary for the card face. All values are escaped. The badge colour is applied by
 *  paintAirlines() because the page's CSP forbids inline style attributes. */
export function flightLine(x){
  if(!x.flightNo)return '';
  const a=airlineFor(x.flightNo),route=x.depAirport&&x.arrAirport?` · ${esc(x.depAirport)} ${esc(hhmm(x.depLocal))} → ${esc(x.arrAirport)} ${esc(hhmm(x.arrLocal))}`:'';
  return `<span class="flight-line"><b class="airline" data-color="${a?.color||'#5b6b64'}" title="${esc(x.airlineName||a?.name||'')}">${esc(a?.code||'')}</b> ${esc(x.flightNo)}${route}</span>`;
}

/** Ask the Worker (which holds the API key). Never throws; returns {flights,remaining,source} or {error}. */
export async function lookupFlight(no,date){
  try{
    const res=await fetch(`/api/trip/flight?no=${encodeURIComponent(no)}&date=${encodeURIComponent(date)}`,{credentials:'same-origin',cache:'no-store'});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok)return {error:data.error||'Flight lookup is not available here. Enter the details by hand.',remaining:data.remaining};
    return Array.isArray(data.flights)?data:{error:'Flight lookup is not available here. Enter the details by hand.'};
  }catch{return {error:'Could not reach the lookup service. Enter the details by hand.'}}
}

/** Apply badge colours (CSSOM is allowed by the CSP; style="" attributes are not). */
export function paintAirlines(root){
  for(const badge of root.querySelectorAll('.airline[data-color]')){
    const c=badge.dataset.color;
    if(/^#[0-9a-f]{6}$/i.test(c))badge.style.setProperty('--airline',c);
  }
}
