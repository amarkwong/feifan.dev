import test from 'node:test';import assert from 'node:assert/strict';
import {hotelBrands,findHotelBrand} from '../lounge/trip/hotels.mjs';
test('popular China and Japan hotel brands are available',()=>{assert.ok(hotelBrands.length>=40);assert.equal(findHotelBrand('北京柏悦酒店').name,'Park Hyatt');assert.equal(findHotelBrand('星のや京都').name,'Hoshinoya');assert.equal(findHotelBrand('Tokyo APA Hotel').name,'APA Hotel')});
test('unknown independent stays remain editable without a forced brand',()=>{assert.equal(findHotelBrand('My family guesthouse'),null);assert.ok(hotelBrands.every(x=>x.name&&x.wikiTitle&&x.initials))});
