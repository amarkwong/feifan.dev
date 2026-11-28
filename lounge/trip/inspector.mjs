import {$,esc,fmt,placeName,isTravel,icon} from './util.mjs';
import {S,when,ask,notify,commit,get,ancestors} from './store.mjs';
import {STEP,snap,slots,timeAt,offsetAt,addDays,count,descendants,change,remove} from './model.mjs';
import {cities,activities} from './data.mjs';
import {photos as landmarks} from './photos.mjs';
import {hotelFields,wireHotel,hotelPatch,flightFields,wireFlight,flightPatch} from './cardforms.mjs';
export function activityInfo(x){return activities.find(a=>a.id===x.activityId)}
export function eventWarning(x){const a=activityInfo(x);if(!a?.from)return '';const start=addDays(S.state.start,x.start),end=addDays(S.state.start,x.start+x.days-STEP);return end<a.from||start>a.to?`Outside the published/annual window (${fmt(a.from)}–${fmt(a.to)}). Move this block or reconfirm the event.`:''}
export function renderInspector(){
 const x=get();if(!x){$('#inspector').innerHTML='<div class="no-selection"><span>↖</span><h3>Select a card to shape your stay.</h3><p>Drag either edge in 30-minute steps, or enter exact times here.</p></div>';return}
 const a=activityInfo(x),warning=eventWarning(x),photo=x.type==='city'?landmarks[x.title]:null,travel=isTravel(x),linked=!!(x.fromCityId&&x.toCityId);
 const stayOptions=chosen=>'<option value="">Choose a stay…</option>'+S.state.items.filter(c=>c.type==='city').sort((a,b)=>a.start-b.start).map(c=>`<option value="${esc(c.id)}" ${c.id===chosen?'selected':''}>${esc(placeName(c.title))} · ${when(c.start)}</option>`).join('');
 $('#inspector').innerHTML=`<div class="editor-heading"><div><small>${esc(ancestors(x).map(y=>y.title).join(' / '))}</small><h3>${esc(placeName(x.title))}</h3></div><span>${icon(x)}</span></div>
 <form id="edit-form"><div class="editor-grid">
 ${['activity','logistics'].includes(x.type)?`<label class="full">${x.kind==='Hotel'?'PROPERTY NAME':'CARD NAME'}<input name="title" value="${esc(x.title)}" maxlength="120" required></label>`:''}
 <label class="full">${x.kind==='Hotel'?'CHECK-IN':'START DATE & TIME'}<input name="date" type="datetime-local" step="1800" value="${timeAt(S.state.start,x.start)}" min="${S.state.start}T00:00" max="${S.state.end}T23:30" required></label>
 ${x.kind==='Hotel'?`<label class="full">CHECK-OUT<input name="checkout" type="datetime-local" step="1800" value="${timeAt(S.state.start,x.start+x.days)}" min="${timeAt(S.state.start,x.start+STEP)}" max="${timeAt(S.state.start,count(S.state))}" required></label><label class="full">HOTEL ADDRESS<input name="address" maxlength="300" value="${esc(x.address||'')}" placeholder="Add later"></label>`:`<label>DURATION · HOURS<input name="hours" type="number" min="0.5" step="0.5" max="${count(S.state)*24}" value="${slots(x.days)/2}" required></label>`}
 ${travel?`<label class="full check"><input name="centered" type="checkbox" checked>Resize duration around its centre</label><p class="connection-hint">Changing duration gives time back to both sides. Drag a top or bottom edge to adjust only that side.</p><label>DEPARTURE CITY<input name="departure" list="route-cities" value="${esc(x.departure||'')}" maxlength="80" required></label><label>ARRIVAL CITY<input name="arrival" list="route-cities" value="${esc(x.arrival||'')}" maxlength="80" required></label><datalist id="route-cities">${[...new Set(['Brisbane','Singapore',...Object.values(cities).flat()])].map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist><label class="full check"><input type="checkbox" name="connect" ${linked?'checked':''}>Automatically adjust adjacent city stays</label><label class="full">DEPARTURE STAY<select name="fromCityId">${stayOptions(x.fromCityId)}</select></label><label class="full">ARRIVAL STAY<select name="toCityId">${stayOptions(x.toCityId)}</select></label><p class="connection-hint">Linked stay names take precedence over the city text above. Only neighbouring stays can be connected.</p>`:''}
 ${x.kind==='Hotel'?hotelFields(x):''}${x.kind==='Flight'?flightFields(x):''}
 <label class="full">CARD WIDTH · VISUAL ONLY<input name="width" type="range" min="110" max="320" step="1" value="${x.width}"></label><label class="full">NOTES<textarea name="notes" maxlength="1000" placeholder="Plans, hotel placeholder, transport details…">${esc(x.notes||'')}</textarea></label>
 </div>${warning?`<p class="date-warning">${esc(warning)}</p>`:''}<div class="editor-actions"><button class="primary" type="submit">Apply changes</button><button type="button" class="delete" id="delete">Remove</button></div></form>
 <p class="editor-note">${travel&&linked?'Connected city edges follow this travel card. Removing it restores their original boundary.':x.type==='city'&&x.baseStay?'This stay is linked to travel. Adjust the travel edge to change the shared boundary.':'Moving carries attached cards; resizing scales their times proportionally.'} Delete removes the selection; Undo restores it.</p>
 ${photo?`<p class="photo-credit">Photo: ${esc(photo.name)} · ${esc(photo.artist)} · <a href="${esc(photo.source)}" target="_blank" rel="noopener">Source</a> · <a href="${esc(photo.licenseUrl)}" target="_blank" rel="noopener">${esc(photo.license)}</a>. Cropped for display.</p>`:''}
 ${a?`<p class="editor-note">${esc(a.detail)}</p>${a.source?`<a class="source-link" href="${esc(a.source)}" target="_blank" rel="noopener">Read source · checked 26 Nov 2026 ↗</a>`:''}`:''}`;
 const photoDraft=x.kind==='Hotel'?wireHotel(x):null;if(x.kind==='Flight')wireFlight();
 $('#edit-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);try{
  let start=offsetAt(S.state.start,f.get('date'));
  const days=x.kind==='Hotel'?snap(offsetAt(S.state.start,f.get('checkout'))-start):Number(f.get('hours'))/24;
  if(travel&&f.get('centered')&&slots(start)===slots(x.start)&&slots(days)!==slots(x.days))start=(slots(x.start)+Math.floor((slots(x.days)-slots(days))/2))/48;
  const patch={start,days,width:Number(f.get('width')),notes:f.get('notes'),title:f.get('title')||x.title};
  if(x.kind==='Hotel'){patch.address=f.get('address');Object.assign(patch,hotelPatch(f,photoDraft()))}
  if(x.kind==='Flight')Object.assign(patch,flightPatch(f));
  if(travel){Object.assign(patch,{departure:f.get('departure'),arrival:f.get('arrival'),fromCityId:f.get('connect')?f.get('fromCityId'):null,toCityId:f.get('connect')?f.get('toCityId'):null});if(f.get('connect')&&(!patch.fromCityId||!patch.toCityId))throw Error('Choose both departure and arrival stays to enable automatic adjustment.');}
  commit(change(S.state,x.id,patch),'Card updated.');
 }catch(e){notify(e.message)}};
 $('#delete').onclick=deleteSelected;
}
export function deleteSelected(){const x=get();if(!x)return;const n=descendants(S.state.items,x.id).length;const action=()=>{try{const next=remove(S.state,x.id);S.selected=x.parent;commit(next,'Card removed. Undo is available.')}catch(e){notify(e.message)}};if(n)ask(`Remove ${x.title} and its ${n} attached cards? You can undo this.`,action);else action()}
