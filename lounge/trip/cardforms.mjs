// Extra editor fields for Stay (hotel) and Flight cards, kept out of inspector.mjs.
import {$,esc,fmt} from './util.mjs';
import {safeImageSrc,safeLink} from './model.mjs';
import {airports,airportNames} from './data.mjs';
import {airlineFor,parseFlightNo,lookupFlight,gridSpan,hhmm,minutesText} from './flight.mjs';
import {findPhotos,resizeImage} from './media.mjs';
import {hotelBrands} from './hotels.mjs';

const CURRENCIES=['AUD','CNY','JPY','USD','SGD','EUR','GBP'];
const text=(f,k)=>String(f.get(k)??'').trim();
const num=(f,k)=>{const v=text(f,k);return v===''?undefined:Number(v)};

// ------------------------------------------------------------------- Stay

function photoPreview(img){
  if(!img||!safeImageSrc(img.src))return '<div class="photo-empty">No photo yet</div>';
  const link=img.link&&safeLink(img.link)?` · <a href="${esc(img.link)}" target="_blank" rel="noopener">Source</a>`:'';
  return `<img src="${esc(img.src)}" alt=""><span>${esc(img.credit||'')}${link}</span>`;
}

export const hotelFields=x=>`<label class="full">BRAND / CHAIN<input name="brand" list="hotel-brands" maxlength="60" value="${esc(x.brand||'')}" placeholder="e.g. Park Hyatt, Hoshinoya, Atour"></label>
<datalist id="hotel-brands">${hotelBrands.flatMap(b=>[`<option value="${esc(b.name)}"></option>`,...b.aliases.map(a=>`<option value="${esc(a)}">${esc(b.name)}</option>`)]).join('')}</datalist>
<p class="connection-hint">The property name and every stay detail are editable. Recognised hotel brands add a logo badge automatically.</p>
<label>ROOM TYPE<input name="roomType" maxlength="60" value="${esc(x.roomType||'')}" placeholder="King, twin…"></label>
<label>GUESTS<input name="guests" type="number" min="1" max="12" step="1" value="${esc(x.guests??2)}"></label>
<label>PRICE PER NIGHT<input name="price" type="number" min="0" max="10000000" step="1" value="${esc(x.price??'')}" placeholder="Optional"></label>
<label>CURRENCY<select name="currency">${CURRENCIES.map(c=>`<option ${c===(x.currency||'AUD')?'selected':''}>${c}</option>`).join('')}</select></label>
<label class="full">CONFIRMATION NUMBER<input name="confirmation" maxlength="40" value="${esc(x.confirmation||'')}" autocomplete="off"></label>
<label class="full">BOOKING LINK<input name="bookingUrl" type="url" maxlength="500" value="${esc(x.bookingUrl||'')}" placeholder="https://…"></label>
<label class="full check"><input type="checkbox" name="booked" ${x.booked?'checked':''}>Booked and confirmed</label>
<div class="full photo-field"><span class="field-label">PHOTO</span><div class="photo-box" id="photo-box"></div>
<div class="photo-actions"><button type="button" id="photo-find">Find a photo</button><label class="file-button">Upload photo<input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><button type="button" id="photo-clear">Remove</button></div>
<div class="photo-candidates" id="photo-candidates" role="status" aria-live="polite"></div></div>`;

/** Wire the photo controls. Returns a getter: undefined = unchanged, null = removed, object = new photo. */
export function wireHotel(x){
  let draft;const box=$('#photo-box'),out=$('#photo-candidates');
  const show=img=>{box.innerHTML=photoPreview(img)};show(x.image);
  $('#photo-find').onclick=async()=>{
    const f=new FormData($('#edit-form')),name=text(f,'title'),query=[text(f,'brand'),/^hotel$/i.test(name)?'':name].join(' ').trim();
    if(query.length<2){out.textContent='Type a brand or hotel name first.';return}
    out.textContent='Searching…';
    const r=await findPhotos(query);
    if(r.error){out.textContent=r.error;return}
    if(!r.candidates.length){out.textContent=`No free-licensed photo found for “${query}”. Upload your own instead.`;return}
    out.replaceChildren(...r.candidates.map(c=>{
      const b=document.createElement('button'),im=document.createElement('img'),label=document.createElement('span');
      b.type='button';b.className='candidate';b.title=`${c.title} · ${c.license} · ${c.artist}`;im.src=c.src;im.alt='';label.textContent=c.title;b.append(im,label);
      b.onclick=()=>{draft={src:c.src,credit:`${c.artist} · ${c.license}`,...(c.page?{link:c.page}:{})};show(draft);out.textContent='Photo chosen. Press Apply changes to keep it.'};
      return b;
    }));
  };
  $('#photo-upload').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10e6){out.textContent='Choose a JPG, PNG or WebP photo under 10 MB.';return}
    try{const src=await resizeImage(file);draft={src,credit:'Your photo'};show(draft);out.textContent='Photo added. Press Apply changes to keep it.'}
    catch(error){out.textContent=error.message}
  };
  $('#photo-clear').onclick=()=>{draft=null;show(null);out.textContent='Photo removed. Press Apply changes to confirm.'};
  return ()=>draft;
}

export function hotelPatch(f,draft){
  const patch={brand:text(f,'brand')||undefined,roomType:text(f,'roomType')||undefined,guests:num(f,'guests'),price:num(f,'price'),currency:text(f,'currency')||undefined,confirmation:text(f,'confirmation')||undefined,bookingUrl:text(f,'bookingUrl')||undefined,booked:!!f.get('booked')};
  if(draft!==undefined)patch.image=draft??undefined;
  return patch;
}

// ----------------------------------------------------------------- Flight

export const flightFields=x=>`<div class="full flight-box"><span class="field-label">FLIGHT NUMBER</span>
<div class="flight-row"><input name="flightNo" aria-label="Flight number" maxlength="8" value="${esc(x.flightNo||'')}" placeholder="e.g. SQ246" autocomplete="off" spellcheck="false"><button type="button" id="flight-lookup">Look up</button></div>
<div class="flight-status" id="flight-status" role="status" aria-live="polite">Looks up airline, airports and times for the card’s date, or fill them in by hand.</div>
<div class="editor-grid">
<label>FROM AIRPORT<input name="depAirport" list="airport-list" maxlength="3" value="${esc(x.depAirport||'')}" placeholder="${esc(airports[x.departure]?.[0]||'BNE')}"></label>
<label>TO AIRPORT<input name="arrAirport" list="airport-list" maxlength="3" value="${esc(x.arrAirport||'')}" placeholder="${esc(airports[x.arrival]?.[0]||'SIN')}"></label>
<label class="full">DEPARTS · LOCAL TIME<input name="depLocal" type="datetime-local" value="${esc(x.depLocal||'')}"></label>
<label class="full">ARRIVES · LOCAL TIME<input name="arrLocal" type="datetime-local" value="${esc(x.arrLocal||'')}"></label>
<label class="full">AIRLINE<input name="airlineName" maxlength="60" value="${esc(x.airlineName||airlineFor(x.flightNo)?.name||'')}" placeholder="Filled in from the flight number" data-auto="${x.airlineName?'':'1'}"></label></div>
<p class="connection-hint">The card spans the half-hours the flight covers; exact local times show on the card. Airport times are in each airport’s own time zone.</p>
<datalist id="airport-list">${Object.entries(airportNames).map(([code,name])=>`<option value="${code}">${esc(name)}</option>`).join('')}</datalist></div>`;

export function wireFlight(){
  const form=$('#edit-form'),status=$('#flight-status'),button=$('#flight-lookup'),field=n=>form.elements[n];
  field('flightNo').oninput=()=>{
    const airline=airlineFor(field('flightNo').value),box=field('airlineName');
    if(airline?.name&&(!box.value||box.dataset.auto==='1')){box.value=airline.name;box.dataset.auto='1'}
  };
  field('airlineName').oninput=()=>{field('airlineName').dataset.auto=''};
  const apply=flight=>{
    field('flightNo').value=flight.flightNo||field('flightNo').value;
    field('airlineName').value=flight.airline?.name||field('airlineName').value;field('airlineName').dataset.auto='';
    field('depAirport').value=flight.from.iata;field('arrAirport').value=flight.to.iata;
    field('depLocal').value=flight.departLocal;field('arrLocal').value=flight.arriveLocal;
    const span=gridSpan(flight.departLocal,flight.durationMin);
    if(span){field('date').value=span.date;field('hours').value=span.hours;const centred=field('centered');if(centred)centred.checked=false}
    return `${flight.airline?.name||'Flight'} ${flight.flightNo}: ${flight.from.iata} ${hhmm(flight.departLocal)} → ${flight.to.iata} ${hhmm(flight.arriveLocal)}${flight.durationMin?` · ${minutesText(flight.durationMin)}`:' · duration unknown, set the hours by hand'}.`;
  };
  button.onclick=async()=>{
    const parsed=parseFlightNo(field('flightNo').value);
    if(!parsed){status.textContent='Enter a flight number like SQ246.';return}
    const date=String(field('date').value).slice(0,10);
    button.disabled=true;status.textContent=`Looking up ${parsed.text} on ${fmt(date)}…`;
    const r=await lookupFlight(parsed.text,date);
    button.disabled=false;
    const left=r.remaining?` ${r.remaining.today} lookup${r.remaining.today===1?'':'s'} left today.`:'';
    if(r.error){status.textContent=r.error+(r.remaining?left:'');return}
    if(!r.flights.length){status.textContent=`No flight ${parsed.text} found on ${fmt(date)}. Check the number and date, or fill it in by hand.${left}`;return}
    if(r.flights.length===1){status.textContent=`${apply(r.flights[0])} Press Apply changes to update the card.${left}`;return}
    status.replaceChildren(document.createTextNode(`${r.flights.length} legs found. Choose one:`),...r.flights.map(fl=>{
      const b=document.createElement('button');b.type='button';b.className='candidate-leg';b.textContent=`${fl.from.iata} ${hhmm(fl.departLocal)} → ${fl.to.iata} ${hhmm(fl.arriveLocal)}`;
      b.onclick=()=>{status.textContent=`${apply(fl)} Press Apply changes to update the card.${left}`};return b;
    }));
  };
}

export function flightPatch(f){
  const raw=text(f,'flightNo'),parsed=parseFlightNo(raw);
  if(raw&&!parsed)throw Error('Flight numbers look like SQ246 or CZ 306.');
  const airport=k=>{const v=text(f,k).toUpperCase();if(v&&!/^[A-Z]{3}$/.test(v))throw Error('Airport codes have three letters, like BNE.');return v||undefined};
  return {flightNo:parsed?.text,airlineName:text(f,'airlineName')||undefined,depAirport:airport('depAirport'),arrAirport:airport('arrAirport'),depLocal:text(f,'depLocal')||undefined,arrLocal:text(f,'arrLocal')||undefined};
}
