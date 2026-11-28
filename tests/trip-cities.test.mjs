import test from 'node:test';import assert from 'node:assert/strict';
import {cityCatalogue,findCity,cityDisplayName,cityNames} from '../lounge/trip/cities.mjs';
test('catalogue contains roughly fifty Chinese destinations',()=>{assert.ok(cityNames('China').length>=50);assert.ok(cityNames('China').length<=60)});
test('English, punctuation variants and local names resolve to one city',()=>{assert.equal(findCity('Xi’an').name,'Xi’an');assert.equal(findCity("xi'an").name,'Xi’an');assert.equal(findCity('Xian').name,'Xi’an');assert.equal(findCity('西安').name,'Xi’an');assert.equal(cityDisplayName('西安'),'Xi’an · 西安')});
test('free-form city names stay free-form',()=>{assert.equal(findCity('My favourite village'),null);assert.equal(cityDisplayName('My favourite village'),'My favourite village');assert.ok(cityCatalogue.every(x=>x.name&&x.local&&x.wikiTitle))});
