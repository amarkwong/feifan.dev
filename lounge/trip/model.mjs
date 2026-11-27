export const DAY=86400000;
export const STEP=1/48;
export const snap=n=>Math.round(n*48)/48;
export const slots=n=>Math.round(n*48);
export const timeAt=(date,day)=>new Date(stamp(date)+slots(day)*1800000).toISOString().slice(0,16);
export const offsetAt=(date,value)=>(Date.parse(value+'Z')-stamp(date))/DAY;
const onGrid=n=>Number.isFinite(n)&&Math.abs(n*48-Math.round(n*48))<1e-7;
export const stamp=s=>Date.parse(s+'T00:00:00Z');
export const iso=t=>new Date(t).toISOString().slice(0,10);
export const addDays=(s,n)=>iso(stamp(s)+n*DAY);
export const diff=(a,b)=>Math.round((stamp(b)-stamp(a))/DAY);
export const count=s=>diff(s.start,s.end)+1;
export const overlap=(a,b)=>slots(a.start)<slots(b.start)+slots(b.days)&&slots(b.start)<slots(a.start)+slots(a.days);
export function descendants(items,id){const found=[];for(const item of items.filter(x=>x.parent===id)){found.push(item,...descendants(items,item.id))}return found}
export function validate(s){
 if(!s||s.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(s.start)||!/^\d{4}-\d{2}-\d{2}$/.test(s.end)||!Number.isFinite(count(s))||count(s)<1||count(s)>90)throw Error('Choose a trip between 1 and 90 days.');
 if(!Array.isArray(s.items)||s.items.length>180)throw Error('This prototype supports up to 180 cards.');
 const ids=new Set();
 for(const x of s.items){if(typeof x.id!=='string'||ids.has(x.id))throw Error('Invalid or duplicate card ID.');ids.add(x.id);if(!['country','city','activity','logistics'].includes(x.type)||typeof x.title!=='string'||x.title.length>120||!onGrid(x.start)||!onGrid(x.days)||x.start<0||x.days<STEP||slots(x.start)+slots(x.days)>count(s)*48||!Number.isFinite(x.width)||x.width<110||x.width>320)throw Error('Cards must fit the trip, with a minimum of 30 minutes.');}
 for(const x of s.items){const p=s.items.find(y=>y.id===x.parent);if(x.type==='country'&&x.parent)throw Error('Countries attach to the timeline.');if(x.type==='city'&&(!p||p.type!=='country'||x.country!==p.title))throw Error('Attach this city to its country first.');if(x.type==='activity'&&(!p||p.type!=='city'||(x.city&&x.city!==p.title)))throw Error('Attach this activity to its city first.');if(x.type==='logistics'&&p&&!['country','city'].includes(p.type))throw Error('Transport and stays attach to the timeline, a country or a city.');if(x.parent&&!p)throw Error('Parent card is missing.');if(p&&(slots(x.start)<slots(p.start)||slots(x.start)+slots(x.days)>slots(p.start)+slots(p.days)))throw Error('Keep attached cards inside their parent dates.');if(['country','city'].includes(x.type)&&s.items.some(y=>y.id!==x.id&&y.type===x.type&&y.parent===x.parent&&overlap(x,y)))throw Error('Country and city stays cannot overlap. Choose a free day.');}
 return s;
}
export const isTravel=x=>x.type==='logistics'&&['Flight','Railway','Transfer'].includes(x.kind);
const end=x=>slots(x.start)+slots(x.days);
const base=x=>x.baseStay||{start:x.start,days:x.days};

// Shared edges are rounded once so adjacent children never overlap after scaling.
function scaleChildren(items,owner,newStart,newDays){
 const oldStart=slots(owner.start),oldLength=slots(owner.days),newLength=slots(newDays),start=slots(newStart);
 const children=descendants(items,owner.id);
 const inside=new Set(children.map(c=>c.id));
 if(owner.type==='country')for(const t of items.filter(isTravel))if(inside.has(t.fromCityId)&&inside.has(t.toCityId))children.push(t);
 if(!children.length)return;
 if(oldLength===newLength){for(const c of children){c.start=(slots(c.start)+start-oldStart)/48;if(c.baseStay)c.baseStay.start=snap(c.baseStay.start+(start-oldStart)/48)}return;}
 const edges=[...new Set([0,oldLength,...children.flatMap(c=>[slots(c.start)-oldStart,end(c)-oldStart])])].sort((a,b)=>a-b);
 if(newLength<edges.length-1)throw Error('Not enough room: each attached interval needs at least 30 minutes.');
 const mapped=new Map();let previous=-1;
 edges.forEach((edge,i)=>{const at=Math.max(previous+1,Math.min(newLength-(edges.length-1-i),Math.round(edge/oldLength*newLength)));mapped.set(edge,at);previous=at});
 for(const c of children){const a=mapped.get(slots(c.start)-oldStart),b=mapped.get(end(c)-oldStart);c.start=(start+a)/48;c.days=(b-a)/48;if(c.baseStay){const bs=slots(c.baseStay.start)-oldStart,be=bs+slots(c.baseStay.days);const ns=start+Math.round(bs/oldLength*newLength),ne=start+Math.round(be/oldLength*newLength);c.baseStay={start:ns/48,days:(ne-ns)/48}}}
}

export function connectionAt(s,day,preferredId=null){
 const list=s.items.filter(x=>x.type==='city').sort((a,b)=>base(a).start-base(b).start);
 let index=preferredId?list.findIndex(x=>x.id===preferredId):-1;
 if(preferredId&&index===list.length-1)return null;
 if(index<0||index>=list.length-1){let distance=Infinity;for(let i=0;i<list.length-1;i++){const boundary=(base(list[i]).start+base(list[i]).days+base(list[i+1]).start)/2;const d=Math.abs(day-boundary);if(d<distance){distance=d;index=i}}}
 if(index<0||index>=list.length-1)return null;
 const from=list[index],to=list[index+1];return {fromCityId:from.id,toCityId:to.id,departure:from.title,arrival:to.title,boundary:(base(from).start+base(from).days+base(to).start)/2};
}

export function reconcileConnections(s){
 const incoming=new Map(),outgoing=new Map();
 for(const t of s.items.filter(isTravel)){
  if(!t.fromCityId&&!t.toCityId)continue;
  const from=s.items.find(c=>c.id===t.fromCityId&&c.type==='city'),to=s.items.find(c=>c.id===t.toCityId&&c.type==='city');
  if(!from||!to||from===to)throw Error('Choose two different city stays for this connection.');
  if(base(from).start>=base(to).start)throw Error('Connect city stays in itinerary order.');
  const between=s.items.some(c=>c.type==='city'&&base(c).start>base(from).start&&base(c).start<base(to).start);
  if(between)throw Error('Connect neighbouring city stays, or remove the intervening stay first.');
  if(outgoing.has(from.id)||incoming.has(to.id))throw Error('These cities already have a travel connection. Edit the existing connection.');
  outgoing.set(from.id,t);incoming.set(to.id,t);t.departure=from.title;t.arrival=to.title;t.parent=null;
  for(const c of [from,to])c.baseStay ||= {start:c.start,days:c.days};
 }
 for(const c of s.items.filter(x=>x.type==='city')){
  if(!c.baseStay)continue;
  const inTrip=incoming.get(c.id),outTrip=outgoing.get(c.id),a=inTrip?end(inTrip):slots(c.baseStay.start),b=outTrip?slots(outTrip.start):slots(c.baseStay.start)+slots(c.baseStay.days);
  if(b-a<1)throw Error(`${c.title} needs at least 30 minutes after travel. Shorten or move the connection.`);
  if(a!==slots(c.start)||b!==end(c)){scaleChildren(s.items,c,a/48,(b-a)/48);c.start=a/48;c.days=(b-a)/48;}
  if(!inTrip&&!outTrip)delete c.baseStay;
 }
 return s;
}

export function change(s,id,patch){
 const next=structuredClone(s),x=next.items.find(x=>x.id===id);if(!x)throw Error('Card not found.');
 const a=patch.start??x.start,d=patch.days??x.days;
 if(!onGrid(a)||!onGrid(d)||d<STEP)throw Error('Use 30-minute increments, with a minimum of 30 minutes.');
 if(x.type==='city'&&x.baseStay&&(patch.start!==undefined||patch.days!==undefined)){
  const incoming=next.items.find(t=>t.toCityId===id),outgoing=next.items.find(t=>t.fromCityId===id);
  if(incoming&&slots(a)!==slots(x.start))throw Error('Adjust the incoming travel end to move this city’s start.');
  if(outgoing&&slots(a)+slots(d)!==end(x))throw Error('Adjust the outgoing travel start to move this city’s end.');
  const originalEnd=snap(x.baseStay.start+x.baseStay.days);
  if(!incoming)x.baseStay.start=a;
  x.baseStay.days=snap((outgoing?originalEnd:a+d)-x.baseStay.start);
 }
 scaleChildren(next.items,x,a,d);
 if(x.type==='country'&&patch.width!==undefined)for(const c of descendants(next.items,id).filter(c=>c.type==='city'))c.width=Math.max(110,Math.min(320,Math.round(c.width*patch.width/x.width)));
 Object.assign(x,patch);return validate(reconcileConnections(next));
}
export function insert(s,item){const next=structuredClone(s);next.items.push(structuredClone(item));return validate(reconcileConnections(next))}
export function remove(s,id){
 const next=structuredClone(s),ids=new Set([id,...descendants(next.items,id).map(x=>x.id)]);
 // Removing a city also removes its connections; the surviving neighbour is restored.
 for(const t of next.items.filter(isTravel))if(ids.has(t.fromCityId)||ids.has(t.toCityId))ids.add(t.id);
 next.items=next.items.filter(x=>!ids.has(x.id));return validate(reconcileConnections(next));
}
export function blank(){return {version:1,start:'2026-12-26',end:'2027-01-15',items:[]}}
export function starter(){const s=blank();s.items=[{id:'china',type:'country',title:'China',start:0,days:12,width:130,parent:null},{id:'japan',type:'country',title:'Japan',start:12,days:7,width:130,parent:null}];for(const [id,title,parent,start,days]of[['chengdu','Chengdu','china',0,4],['xian','Xi’an','china',4,3],['xiapu','Xiapu','china',7,4],['fuzhou','Fuzhou','china',11,1],['kyoto','Kyoto','japan',12,3],['tokyo','Tokyo','japan',15,4]])s.items.push({id,type:'city',title,parent,start,days,width:160,country:parent==='china'?'China':'Japan'});s.items.push({id:'homeflight',type:'logistics',title:'Flight home · SQ / CZ',start:19,days:1,width:190,parent:null,kind:'Flight',departure:'Tokyo',arrival:'Brisbane',notes:'Tokyo → Brisbane via Singapore or Guangzhou. Exact flights not selected.'});return validate(s)}

// Content columns: country, city, activity, hotel. Outside all country stays,
// international travel can align with the country column; otherwise use city left.
export function travelLeft(s,travel,countryX=112,cityX=266){return s.items.some(x=>x.type==='country'&&overlap(x,travel))?cityX:countryX;}
