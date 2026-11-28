// Curated destination names keep matching predictable; PageImages supplies the visual at runtime.
// A city can still be any free-form name—only recognised aliases receive an automatic image.
const china=[
 ['Beijing','北京'],['Shanghai','上海'],['Guangzhou','广州'],['Shenzhen','深圳'],['Chengdu','成都'],['Xi’an','西安',['Xian',"Xi'an"]],['Chongqing','重庆'],['Hangzhou','杭州'],['Suzhou','苏州'],['Nanjing','南京'],
 ['Wuhan','武汉'],['Changsha','长沙'],['Guilin','桂林'],['Kunming','昆明'],['Dali','大理',['Dali City']],['Lijiang','丽江'],['Xiamen','厦门'],['Fuzhou','福州'],['Xiapu','霞浦',['Xiapu County']],['Quanzhou','泉州'],
 ['Sanya','三亚'],['Haikou','海口'],['Qingdao','青岛',['Tsingtao']],['Jinan','济南'],['Tianjin','天津'],['Harbin','哈尔滨'],['Shenyang','沈阳'],['Dalian','大连'],['Luoyang','洛阳'],['Zhengzhou','郑州'],
 ['Kaifeng','开封'],['Datong','大同'],['Taiyuan','太原'],['Pingyao','平遥',['Pingyao County']],['Zhangjiajie','张家界'],['Huangshan','黄山',['Huangshan City']],['Hefei','合肥'],['Wuyuan','婺源',['Wuyuan County, Jiangxi']],['Nanchang','南昌'],['Lhasa','拉萨'],
 ['Ürümqi','乌鲁木齐',['Urumqi']],['Kashgar','喀什'],['Dunhuang','敦煌'],['Lanzhou','兰州'],['Xining','西宁'],['Yinchuan','银川'],['Hohhot','呼和浩特'],['Ningbo','宁波'],['Wuxi','无锡'],['Zhuhai','珠海'],
 ['Macau','澳门',['Macao']],['Hong Kong','香港']
];
const japan=[
 ['Tokyo','東京'],['Kyoto','京都'],['Osaka','大阪'],['Nara','奈良'],['Yokohama','横浜'],['Kamakura','鎌倉'],['Hakone','箱根'],['Nikko','日光',['Nikkō']],['Kanazawa','金沢'],['Takayama','高山',['Hida Takayama'],'Takayama, Gifu'],
 ['Shirakawa-go','白川郷',['Shirakawago']],['Nagoya','名古屋'],['Hiroshima','広島'],['Miyajima','宮島',['Itsukushima'],'Itsukushima'],['Fukuoka','福岡'],['Sapporo','札幌'],['Otaru','小樽'],['Hakodate','函館'],['Furano','富良野',[],'Furano, Hokkaido'],['Biei','美瑛',[],'Biei, Hokkaido'],
 ['Asahikawa','旭川'],['Sendai','仙台'],['Matsushima','松島',[],'Matsushima, Miyagi'],['Aomori','青森'],['Hirosaki','弘前'],['Morioka','盛岡'],['Akita','秋田'],['Yamagata','山形'],['Niigata','新潟'],['Nagano','長野'],
 ['Matsumoto','松本'],['Karuizawa','軽井沢'],['Kusatsu','草津',[],'Kusatsu, Gunma'],['Kawagoe','川越'],['Chiba','千葉'],['Narita','成田'],['Izu','伊豆',[],'Izu, Shizuoka'],['Atami','熱海'],['Shizuoka','静岡'],['Hamamatsu','浜松'],
 ['Kobe','神戸'],['Himeji','姫路'],['Okayama','岡山'],['Kurashiki','倉敷'],['Naoshima','直島',[],'Naoshima, Kagawa'],['Takamatsu','高松'],['Matsuyama','松山'],['Kochi','高知',['Kōchi'],'Kōchi (city)'],['Nagasaki','長崎'],['Kumamoto','熊本'],
 ['Beppu','別府'],['Yufuin','由布院',['Yufu'],'Yufuin'],['Kagoshima','鹿児島'],['Yakushima','屋久島'],['Naha','那覇'],['Ishigaki','石垣',[],'Ishigaki, Okinawa']
];
const localFiles={Chengdu:'chengdu.jpg','Xi’an':'xian.jpg',Guangzhou:'guangzhou.jpg',Xiapu:'xiapu.jpg',Fuzhou:'fuzhou.jpg',Shanghai:'shanghai.jpg',Kyoto:'kyoto.jpg',Tokyo:'tokyo.jpg'};
const localImageNames={Chengdu:'Anshun Bridge','Xi’an':'Giant Wild Goose Pagoda',Guangzhou:'Canton Tower',Xiapu:'Xiapu coast',Fuzhou:'Three Lanes and Seven Alleys',Shanghai:'Pudong skyline',Kyoto:'Yasaka Pagoda',Tokyo:'Tokyo Tower'};
const normalise=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’'`·.\-\s]/g,'');
const rows=[...china.map(x=>['China',...x]),...japan.map(x=>['Japan',...x])];
export const cityCatalogue=rows.map(([country,name,local,aliases=[],wikiTitle])=>({country,name,local,aliases,wikiTitle:wikiTitle||aliases.find(x=>/County|City|Jiangxi/.test(x))||name,localFile:localFiles[name],imageName:localImageNames[name]}));
const lookup=new Map();for(const city of cityCatalogue)for(const key of [city.name,city.local,...city.aliases])lookup.set(normalise(key),city);
export const findCity=value=>lookup.get(normalise(value))||null;
export const cityNames=country=>cityCatalogue.filter(x=>x.country===country).map(x=>x.name);
export const cityLocalNames=Object.fromEntries(cityCatalogue.map(x=>[x.name,x.local]));
export const cityDisplayName=value=>{const c=findCity(value);return c?`${c.name} · ${c.local}`:String(value||'')};

const cache=new Map();
const safeThumbnail=src=>/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^\s"'<>]+$/.test(src||'');
export async function cityPhoto(value){
 const city=findCity(value);if(!city)return null;
 if(city.localFile)return {src:`assets/${city.localFile}`,alt:city.imageName,article:`https://en.wikipedia.org/wiki/${encodeURIComponent(city.wikiTitle.replace(/ /g,'_'))}`,provider:'Curated Wikimedia Commons photo'};
 if(cache.has(city.name))return cache.get(city.name);
 const promise=(async()=>{try{
  const q=new URLSearchParams({origin:'*',action:'query',format:'json',redirects:'1',prop:'pageimages',piprop:'thumbnail|name',pithumbsize:'900',pilicense:'free',titles:city.wikiTitle});
  const response=await fetch(`https://en.wikipedia.org/w/api.php?${q}`);if(!response.ok)return null;
  const page=Object.values((await response.json()).query?.pages||{})[0],src=page?.thumbnail?.source;
  return safeThumbnail(src)?{src,alt:`Representative view of ${city.name}`,article:`https://en.wikipedia.org/wiki/${encodeURIComponent((page.title||city.wikiTitle).replace(/ /g,'_'))}`,provider:'Wikipedia PageImages'}:null;
 }catch{return null}})();cache.set(city.name,promise);return promise;
}

export function hydrateCityPhotos(root=document){
 for(const img of root.querySelectorAll('img[data-city-photo]')){if(img.dataset.loading)return;img.dataset.loading='1';cityPhoto(img.dataset.cityPhoto).then(photo=>{if(photo){img.src=photo.src;img.alt=photo.alt;img.hidden=false}else img.remove()})}
}
