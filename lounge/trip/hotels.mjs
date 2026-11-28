// Well-known hotel groups and brands commonly encountered in China and Japan.
// Matching is local and deterministic; Wikimedia PageImages is used only for an optional mark.
const rows=[
 ['Park Hyatt',['柏悦','パークハイアット'],'Park Hyatt'],['Grand Hyatt',['君悦','グランドハイアット'],'Grand Hyatt'],['Hyatt Regency',['凯悦','ハイアットリージェンシー'],'Hyatt Regency'],['Andaz',['安达仕','アンダーズ'],'Andaz'],
 ['Hilton',['希尔顿','ヒルトン'],'Hilton Hotels & Resorts'],['Conrad',['康莱德','コンラッド'],'Conrad Hotels'],['DoubleTree',['逸林','ダブルツリー'],'DoubleTree by Hilton'],['Waldorf Astoria',['华尔道夫','ウォルドーフ・アストリア'],'Waldorf Astoria Hotels & Resorts'],
 ['Marriott',['万豪','マリオット'],'Marriott Hotels & Resorts'],['JW Marriott',['JW万豪','JWマリオット'],'JW Marriott Hotels'],['The Ritz-Carlton',['丽思卡尔顿','ザ・リッツ・カールトン'],'The Ritz-Carlton Hotel Company'],['Sheraton',['喜来登','シェラトン'],'Sheraton Hotels and Resorts'],['Westin',['威斯汀','ウェスティン'],'Westin Hotels & Resorts'],['St. Regis',['瑞吉','セントレジス'],'St. Regis Hotels & Resorts'],
 ['InterContinental',['洲际','インターコンチネンタル'],'InterContinental'],['Holiday Inn',['假日酒店','ホリデイ・イン'],'Holiday Inn'],['Crowne Plaza',['皇冠假日','クラウンプラザ'],'Crowne Plaza'],
 ['Shangri-La',['香格里拉','シャングリ・ラ'],'Shangri-La Hotels and Resorts'],['Mandarin Oriental',['文华东方','マンダリン オリエンタル'],'Mandarin Oriental Hotel Group'],['Four Seasons',['四季酒店','フォーシーズンズ'],'Four Seasons Hotels and Resorts'],['Kempinski',['凯宾斯基','ケンピンスキー'],'Kempinski'],['Accor',['雅高','アコー'],'Accor'],['Sofitel',['索菲特','ソフィテル'],'Sofitel'],['Novotel',['诺富特','ノボテル'],'Novotel'],['Ibis',['宜必思','イビス'],'Ibis (hotel)'],
 ['Jin Jiang',['锦江','ジンジャン'],'Jin Jiang International'],['H World',['华住','Hワールド'],'H World Group'],['JI Hotel',['全季酒店'],'H World Group'],['Atour',['亚朵'],'Atour'],['Vienna Hotel',['维也纳酒店'],'Vienna Hotel Group'],['Home Inn',['如家酒店'],'Home Inn'],
 ['Hoshinoya',['星のや','虹夕诺雅'],'Hoshino Resorts'],['Hoshino Resorts',['星野リゾート','星野集团'],'Hoshino Resorts'],['APA Hotel',['アパホテル'],'APA Group (Japan)'],['Toyoko Inn',['東横INN','东横INN'],'Toyoko Inn'],['Dormy Inn',['ドーミーイン'],'Kyoritsu Maintenance'],['Mitsui Garden Hotels',['三井ガーデンホテルズ','三井花园酒店'],'Mitsui Fudosan'],['Prince Hotels',['プリンスホテル','王子酒店'],'Prince Hotels'],['Hotel Okura',['ホテルオークラ','大仓饭店'],'Hotel Okura'],['Imperial Hotel',['帝国ホテル','帝国饭店'],'Imperial Hotel, Tokyo'],['Tokyu Hotels',['東急ホテルズ','东急酒店'],'Tokyu Hotels'],['Hotel New Otani',['ホテルニューオータニ','新大谷饭店'],'Hotel New Otani Tokyo'],['Nikko Hotels',['ニッコー・ホテルズ','日航酒店'],'Hotel JAL City'],['Daiwa Roynet',['ダイワロイネットホテルズ'],'Daiwa House'],['Sotetsu Fresa Inn',['相鉄フレッサイン'],'Sotetsu Holdings'],['Route Inn',['ホテルルートイン'],'Route Inn Japan']
];
const normalise=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’'`·.&・\-\s]/g,'');
export const hotelBrands=rows.map(([name,aliases=[],wikiTitle=name])=>({name,aliases,wikiTitle,initials:name.split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase()}));
const keys=hotelBrands.flatMap(brand=>[brand.name,...brand.aliases].map(alias=>({key:normalise(alias),brand}))).sort((a,b)=>b.key.length-a.key.length);
export function findHotelBrand(value){const text=normalise(value);if(!text)return null;return keys.find(x=>x.key&&text.includes(x.key))?.brand||null}

const cache=new Map();
const safeThumbnail=src=>/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^\s"'<>]+$/.test(src||'');
export function hotelLogo(value){
 const brand=findHotelBrand(value);if(!brand)return Promise.resolve(null);if(cache.has(brand.name))return cache.get(brand.name);
 const promise=(async()=>{try{
  const q=new URLSearchParams({origin:'*',action:'query',format:'json',redirects:'1',prop:'pageimages',piprop:'thumbnail|name',pithumbsize:'240',pilicense:'free',titles:brand.wikiTitle});
  const response=await fetch(`https://en.wikipedia.org/w/api.php?${q}`);if(!response.ok)return null;
  const page=Object.values((await response.json()).query?.pages||{})[0],src=page?.thumbnail?.source;
  return safeThumbnail(src)?{src,alt:`${brand.name} mark`,brand}:null;
 }catch{return null}})();cache.set(brand.name,promise);return promise;
}
export function hydrateHotelLogos(root=document){
 for(const card of root.querySelectorAll('.card.hotel')){let badge=card.querySelector('[data-hotel-logo]');if(!badge){const brand=findHotelBrand(`${card.querySelector('.card-kind')?.textContent||''} ${card.querySelector('strong')?.textContent||''}`);if(!brand)continue;badge=document.createElement('span');badge.className='hotel-brand-badge';badge.dataset.hotelLogo=brand.name;badge.title=brand.name;const fallback=document.createElement('span');fallback.textContent=brand.initials;badge.append(fallback);card.prepend(badge)}if(badge.dataset.loading)continue;badge.dataset.loading='1';hotelLogo(badge.dataset.hotelLogo).then(logo=>{if(!logo)return;const img=document.createElement('img');img.src=logo.src;img.alt=logo.alt;img.draggable=false;badge.prepend(img);badge.classList.add('has-logo')})}
}
