import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlightNo, airlineFor, gridSpan, flightLine, hhmm, minutesText} from '../lounge/trip/flight.mjs';
import {starter, insert, change, safeImageSrc, safeLink, validate} from '../lounge/trip/model.mjs';

test('flight numbers are normalised and bad ones rejected', () => {
  assert.deepEqual(parseFlightNo(' sq 246 '), {code: 'SQ', number: '246', text: 'SQ246'});
  assert.equal(parseFlightNo('3U8888').text, '3U8888');
  assert.equal(parseFlightNo('CZ306A').text, 'CZ306A');
  for (const bad of ['', 'S', 'SQ', '246', 'SQ24600', 'SQ-246', 'SQ246; DROP', null, undefined]) assert.equal(parseFlightNo(bad), null, String(bad));
});

test('airline comes from the code, with a neutral badge for unknown carriers', () => {
  assert.deepEqual(airlineFor('SQ246'), {code: 'SQ', name: 'Singapore Airlines', color: '#1a2b5f'});
  assert.equal(airlineFor('ZZ12').name, null);
  assert.equal(airlineFor('nonsense'), null);
});

test('real departure times snap outward to the 30-minute grid', () => {
  assert.deepEqual(gridSpan('2026-12-26T09:35', 465), {date: '2026-12-26T09:30', hours: 8});
  assert.deepEqual(gridSpan('2026-12-26T09:30', 60), {date: '2026-12-26T09:30', hours: 1});
  assert.deepEqual(gridSpan('2026-12-26T23:50', 120), {date: '2026-12-26T23:30', hours: 2.5});
  assert.equal(gridSpan('2026-12-26T09:35', null), null);
  assert.equal(gridSpan('soon', 60), null);
});

test('card line shows airline badge, number and local times, escaped', () => {
  const html = flightLine({flightNo: 'SQ246', depAirport: 'BNE', arrAirport: 'SIN', depLocal: '2026-12-26T09:35', arrLocal: '2026-12-26T15:20'});
  assert.match(html, /SQ<\/b> SQ246 · BNE 09:35 → SIN 15:20/);
  assert.equal(flightLine({}), '');
  assert.ok(!flightLine({flightNo: 'SQ246', airlineName: '<img onerror=x>'}).includes('<img'));
  assert.equal(hhmm('2026-12-26T09:35'), '09:35');
  assert.equal(minutesText(465), '7h 45m');
  assert.equal(minutesText(45), '45m');
});

test('only small uploads and Commons thumbnails are accepted as photos', () => {
  assert.ok(safeImageSrc('data:image/jpeg;base64,/9j/4AAQ'));
  assert.ok(safeImageSrc('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Park_Hyatt.jpg/480px-Park_Hyatt.jpg'));
  for (const bad of ['https://example.com/a.jpg', 'http://upload.wikimedia.org/wikipedia/commons/a.jpg', 'https://upload.wikimedia.org/wikipedia/en/a.jpg', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'https://upload.wikimedia.org/wikipedia/commons/a.jpg" onerror="x', 'data:image/jpeg;base64,' + 'A'.repeat(120000), 42, null]) {
    assert.equal(safeImageSrc(bad), false, String(bad).slice(0, 60));
  }
  assert.ok(safeLink('https://commons.wikimedia.org/wiki/File:A.jpg'));
  for (const bad of ['http://x.test', 'javascript:alert(1)', 'https://x.test/a b', 'https://x.test/"onmouseover=', '']) assert.equal(safeLink(bad), false, bad);
});

const hotel = extra => ({id: 'h', type: 'logistics', kind: 'Hotel', title: 'Park Hyatt Tokyo', parent: 'tokyo', start: 15.5, days: 2, width: 190, ...extra});
test('stay details are validated when they are saved', () => {
  const ok = insert(starter(), hotel({brand: 'Park Hyatt', price: 650, currency: 'JPY', guests: 2, bookingUrl: 'https://hyatt.example/booking', booked: true, confirmation: 'AB12', image: {src: 'data:image/jpeg;base64,/9j/4AAQ', credit: 'Your photo'}}));
  assert.equal(validate(ok), ok);
  for (const [patch, message] of [[{bookingUrl: 'http://x.test'}, /https/], [{bookingUrl: 'javascript:alert(1)'}, /https/], [{price: -5}, /Price/], [{guests: 0}, /Guests/], [{guests: 2.5}, /Guests/], [{image: {src: 'https://evil.test/a.jpg'}}, /photo/], [{image: null}, /photo/], [{image: {src: 'data:image/jpeg;base64,AAAA', link: 'javascript:1'}}, /photo/], [{brand: 'x'.repeat(301)}, /too long/]]) {
    assert.throws(() => insert(starter(), hotel(patch)), message, JSON.stringify(patch).slice(0, 50));
  }
  const edited = change(ok, 'h', {brand: undefined, image: undefined});
  assert.equal(validate(edited), edited, 'clearing optional fields is allowed');
});

test('flight details are validated when they are saved', () => {
  const flight = extra => ({id: 'f', type: 'logistics', kind: 'Flight', title: 'Flight', parent: null, start: 19, days: 1, width: 190, departure: 'Tokyo', arrival: 'Brisbane', ...extra});
  const ok = insert(starter(), flight({id: 'f2', start: 20, flightNo: 'SQ12', depAirport: 'NRT', arrAirport: 'SIN', depLocal: '2027-01-14T10:00', arrLocal: '2027-01-14T16:00', airlineName: 'Singapore Airlines'}));
  assert.equal(validate(ok), ok);
  for (const patch of [{flightNo: 'sq12'}, {flightNo: 'SQ'}, {depAirport: 'NR'}, {arrAirport: 'sin'}, {depLocal: 'noon'}, {depLocal: '2027-01-14'}]) {
    assert.throws(() => insert(starter(), flight({id: 'f3', start: 20, ...patch})), /Flight|Airport|times/, JSON.stringify(patch));
  }
});

test('a bare number is not a flight number, in the model either', () => {
  assert.equal(parseFlightNo('246'), null);
  assert.equal(parseFlightNo('9C8888').code, '9C');
  const flight = flightNo => ({id: 'f9', type: 'logistics', kind: 'Flight', title: 'Flight', parent: null, start: 20, days: 1, width: 190, departure: 'Tokyo', arrival: 'Brisbane', flightNo});
  assert.throws(() => insert(starter(), flight('246')), /Flight numbers/);
  assert.equal(validate(insert(starter(), flight('9C8888'))).items.length, 10);
});
