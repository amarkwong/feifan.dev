// Offline stand-ins for the services the trip Worker calls, so tests and the local dev
// server never use real quota. The flight shapes follow AeroDataBox's documented schema but
// are SYNTHETIC: replace with a recorded real response once an AeroDataBox key exists.
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const addDay = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const calls = {flight: 0, wikipedia: 0, commons: 0};

// number -> [from, to, local dep, utc offset hours, local arr, offset, airline]
const FLIGHTS = {
  SQ246: [['BNE', 'Brisbane', 'Australia/Brisbane'], ['SIN', 'Singapore Changi', 'Asia/Singapore'], '09:35', 10, '15:20', 8, ['Singapore Airlines', 'SQ']],
  CZ306: [['BNE', 'Brisbane', 'Australia/Brisbane'], ['CAN', 'Guangzhou Baiyun', 'Asia/Shanghai'], '11:00', 10, '18:30', 8, ['China Southern Airlines', 'CZ']],
};
const hm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function stamp(date, local, offset) { // -> {local: '2026-12-26 09:35+10:00', utc: '2026-12-25 23:35Z'}
  const minutes = hm(local) - offset * 60, shift = Math.floor(minutes / 1440), mm = ((minutes % 1440) + 1440) % 1440;
  const utcDay = addDay(date, shift), z = `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  const sign = offset < 0 ? '-' : '+', o = String(Math.abs(offset)).padStart(2, '0');
  return {local: `${date} ${local}${sign}${o}:00`, utc: `${utcDay} ${z}Z`};
}
export function flightBody(no, date) {
  const f = FLIGHTS[no];
  if (!f) return null;
  const [from, to, dep, depOff, arr, arrOff, [name, iata]] = f;
  const d = stamp(date, dep, depOff);
  // The arrival is on the same local date for these routes.
  const a = stamp(date, arr, arrOff);
  return [{
    number: `${iata} ${no.slice(2)}`, status: 'Expected', aircraft: {model: 'Airbus A350-900'}, airline: {name, iata},
    departure: {airport: {iata: from[0], name: from[1], municipalityName: from[1].split(' ')[0], timeZone: from[2]}, scheduledTime: {local: d.local, utc: d.utc}},
    arrival: {airport: {iata: to[0], name: to[1], municipalityName: to[1].split(' ')[0], timeZone: to[2]}, scheduledTime: {local: a.local, utc: a.utc}},
  }];
}

export async function fakeFetcher(input) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'prod.api.market' || url.hostname === 'aerodatabox.p.rapidapi.com') {
    calls.flight++;
    const m = url.pathname.match(/\/flights\/number\/([A-Z0-9]+)\/(\d{4}-\d{2}-\d{2})$/);
    const body = m && flightBody(m[1], m[2]);
    return body ? json(body) : new Response(null, {status: 204});
  }
  if (url.hostname === 'en.wikipedia.org') {
    calls.wikipedia++;
    const q = (url.searchParams.get('gsrsearch') || '').toLowerCase();
    const thumb = name => ({source: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/480px-${name}`, width: 480, height: 320});
    const pages = !q.includes('hyatt') ? [] : [
      {pageid: 1, title: 'Park Hyatt Tokyo', index: 1, thumbnail: thumb('Park_Hyatt_Tokyo.jpg'), pageimage: 'Park_Hyatt_Tokyo.jpg'},
      {pageid: 2, title: 'Hyatt', index: 2, thumbnail: thumb('Hyatt_logo.svg.png'), pageimage: 'Hyatt_logo.svg'}, // non-free on Wikipedia, absent from Commons
      {pageid: 3, title: 'Grand Hyatt', index: 3, thumbnail: {source: 'https://example.com/evil.jpg', width: 1, height: 1}, pageimage: 'Evil.jpg'}, // wrong host: dropped
    ];
    return json({query: {pages}});
  }
  if (url.hostname === 'commons.wikimedia.org') {
    calls.commons++;
    const titles = (url.searchParams.get('titles') || '').split('|');
    const pages = titles.map(title => title.includes('Park Hyatt')
      ? {title, imageinfo: [{descriptionurl: `https://commons.wikimedia.org/wiki/${title.replace(/ /g, '_')}`, extmetadata: {LicenseShortName: {value: 'CC BY-SA 4.0'}, Artist: {value: '<a href="//x">Jane <b>Doe</b></a> &amp; Co'}}}]}
      : {title, missing: true});
    return json({query: {pages}});
  }
  return new Response('Unexpected upstream in test: ' + url.hostname, {status: 599});
}
