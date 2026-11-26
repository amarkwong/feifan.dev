export const DAY=86400000;
export const stamp=s=>Date.parse(s+'T00:00:00Z');
export const iso=t=>new Date(t).toISOString().slice(0,10);
export const addDays=(s,n)=>iso(stamp(s)+n*DAY);
export const diff=(a,b)=>Math.round((stamp(b)-stamp(a))/DAY);
export const count=s=>diff(s.start,s.end)+1;
export const overlap=(a,b)=>a.start<b.start+b.days&&b.start<a.start+a.days;
export function descendants(items,id){const found=[];for(const item of items.filter(x=>x.parent===id)){found.push(item,...descendants(items,item.id))}return found}
export function validate(s){
 if(!s||s.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(s.start)||!/^\d{4}-\d{2}-\d{2}$/.test(s.end)||!Number.isFinite(count(s))||count(s)<1||count(s)>90)throw Error('Choose a trip between 1 and 90 days.');
 if(!Array.isArray(s.items)||s.items.length>180)throw Error('This prototype supports up to 180 cards.');
 const ids=new Set();
 for(const x of s.items){if(typeof x.id!=='string'||ids.has(x.id))throw Error('Invalid or duplicate card ID.');ids.add(x.id);if(!['country','city','activity','logistics'].includes(x.type)||typeof x.title!=='string'||x.title.length>120||!Number.isInteger(x.start)||!Number.isInteger(x.days)||x.start<0||x.days<1||x.start+x.days>count(s)||!Number.isFinite(x.width)||x.width<110||x.width>320)throw Error('Cards must fit the trip, with a minimum of one day.');}
 for(const x of s.items){const p=s.items.find(y=>y.id===x.parent);if(x.type==='country'&&x.parent)throw Error('Countries attach to the timeline.');if(x.type==='city'&&(!p||p.type!=='country'||x.country!==p.title))throw Error('Attach this city to its country first.');if(x.type==='activity'&&(!p||p.type!=='city'||(x.city&&x.city!==p.title)))throw Error('Attach this activity to its city first.');if(x.type==='logistics'&&p&&!['country','city'].includes(p.type))throw Error('Transport and stays attach to the timeline, a country or a city.');if(x.parent&&!p)throw Error('Parent card is missing.');if(p&&(x.start<p.start||x.start+x.days>p.start+p.days))throw Error('Keep attached cards inside their parent dates.');if(['country','city'].includes(x.type)&&s.items.some(y=>y.id!==x.id&&y.type===x.type&&y.parent===x.parent&&overlap(x,y)))throw Error('Country and city stays cannot overlap. Choose a free day.');}
 return s;
}
export function change(s,id,patch){const next=structuredClone(s),x=next.items.find(x=>x.id===id);if(!x)throw Error('Card not found.');const delta=patch.start===undefined?0:patch.start-x.start;for(const c of descendants(next.items,id))c.start+=delta;Object.assign(x,patch);return validate(next)}
export function insert(s,item){const next=structuredClone(s);next.items.push(item);return validate(next)}
export function remove(s,id){const next=structuredClone(s);const ids=new Set([id,...descendants(next.items,id).map(x=>x.id)]);next.items=next.items.filter(x=>!ids.has(x.id));return next}
export function blank(){return {version:1,start:'2026-12-26',end:'2027-01-15',items:[]}}
export function starter(){const s=blank();s.items=[{id:'china',type:'country',title:'China',start:0,days:12,width:130,parent:null},{id:'japan',type:'country',title:'Japan',start:12,days:7,width:130,parent:null}];for(const [id,title,parent,start,days]of[['chengdu','Chengdu','china',0,4],['xian','Xi’an','china',4,3],['xiapu','Xiapu','china',7,4],['fuzhou','Fuzhou','china',11,1],['kyoto','Kyoto','japan',12,3],['tokyo','Tokyo','japan',15,4]])s.items.push({id,type:'city',title,parent,start,days,width:160,country:parent==='china'?'China':'Japan'});s.items.push({id:'homeflight',type:'logistics',title:'Flight home · SQ / CZ',start:19,days:1,width:190,parent:null,kind:'Flight',notes:'Tokyo → Brisbane via Singapore or Guangzhou. Exact flights not selected.'});return validate(s)}
