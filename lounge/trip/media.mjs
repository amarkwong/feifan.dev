// Hotel photos: search free-licensed candidates through the Worker, or shrink an uploaded photo.

/** Never throws; returns {candidates} or {error}. */
export async function findPhotos(query){
  try{
    const res=await fetch(`/api/trip/hotel-photos?q=${encodeURIComponent(query)}`,{credentials:'same-origin'});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok||!Array.isArray(data.candidates))return {error:data.error||'Photo search is not available here. You can upload your own photo.'};
    return data;
  }catch{return {error:'Photo search could not be reached. You can upload your own photo.'}}
}

/** Resize to at most `maxWidth` px wide as a JPEG data URL small enough to store in the shared plan. */
export async function resizeImage(file,{maxWidth=480,maxChars=60000}={}){
  let bitmap;
  try{bitmap=await createImageBitmap(file)}catch{throw Error('That photo could not be read. Try a JPG, PNG or WebP file.')}
  const ratio=Math.min(1,maxWidth/bitmap.width),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  let quality=.78,url;
  do{url=canvas.toDataURL('image/jpeg',quality);quality-=.1}while(url.length>maxChars&&quality>.25);
  if(url.length>maxChars)throw Error('That photo is too detailed to store. Try a smaller one.');
  return url;
}
