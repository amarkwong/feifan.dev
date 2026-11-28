import test from 'node:test';import assert from 'node:assert/strict';
import {cityCatalogue,findCity,cityDisplayName,cityNames} from '../lounge/trip/cities.mjs';
test('catalogue contains roughly fifty Chinese destinations',()=>{assert.ok(cityNames('China').length>=50);assert.ok(cityNames('China').length<=60)});
test('catalogue also contains roughly fifty Japanese destinations',()=>{assert.ok(cityNames('Japan').length>=50);assert.ok(cityNames('Japan').length<=60);assert.equal(findCity('日光').name,'Nikko');assert.equal(findCity('Nikkō').name,'Nikko')});
test('English, punctuation variants and local names resolve to one city',()=>{assert.equal(findCity('Xi’an').name,'Xi’an');assert.equal(findCity("xi'an").name,'Xi’an');assert.equal(findCity('Xian').name,'Xi’an');assert.equal(findCity('西安').name,'Xi’an');assert.equal(cityDisplayName('西安'),'Xi’an · 西安')});
test('free-form city names stay free-form',()=>{assert.equal(findCity('My favourite village'),null);assert.equal(cityDisplayName('My favourite village'),'My favourite village');assert.ok(cityCatalogue.every(x=>x.name&&x.local&&x.wikiTitle))});
