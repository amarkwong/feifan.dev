import {isTravel,slots,travelLeft} from './model.mjs';
export function boardLayout(state){
 const cw=Math.max(130,...state.items.filter(x=>x.type==='country').map(x=>x.width));
 const tw=Math.max(160,...state.items.filter(x=>x.type==='city').map(x=>x.width));
 const aw=Math.max(200,...state.items.filter(x=>x.type==='activity').map(x=>x.width));
 const hw=Math.max(200,...state.items.filter(x=>x.kind==='Hotel').map(x=>x.width));
 const xCountry=112,xCity=xCountry+cw+24,xActivity=xCity+tw+24,xHotel=xActivity+aw+24,right=xHotel+hw;
 const geometry=new Map();
 function lane(list,left,width){const clusters=[];for(const x of list.sort((a,b)=>a.start-b.start)){let c=clusters.at(-1);if(!c||slots(x.start)>=c.end){c={items:[],end:0};clusters.push(c)}c.items.push(x);c.end=Math.max(c.end,slots(x.start)+slots(x.days))}for(const c of clusters){const tracks=[];for(const x of c.items){let t=tracks.findIndex(end=>end<=slots(x.start));if(t<0)t=tracks.length;tracks[t]=slots(x.start)+slots(x.days);geometry.set(x.id,{track:t})}for(const x of c.items){const g=geometry.get(x.id);g.left=left+g.track*width/tracks.length;g.width=width/tracks.length-(g.track<tracks.length-1?4:0)}}}
 lane(state.items.filter(x=>x.type==='activity'),xActivity,aw);
 lane(state.items.filter(x=>x.type==='logistics'&&!isTravel(x)),xHotel,hw);
 for(const x of state.items){if(['country','city'].includes(x.type))geometry.set(x.id,{left:x.type==='country'?xCountry:xCity,width:x.width});if(isTravel(x)){const left=travelLeft(state,x,xCountry,xCity);geometry.set(x.id,{left,width:right-left})}}
 return {geometry,xCountry,xCity,xActivity,xHotel,right,width:right+30};
}
