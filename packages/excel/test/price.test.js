import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, locationDisplay, priceMils } from '../src/price.js';
import { computePriceDzd } from '@terraflow/shared';

function ai(priceNote, extra = {}) {
  return { price_note: priceNote, ...extra };
}

test('formatPrice: million', () => {
  assert.equal(formatPrice(ai('طالب 900 مليون')), '900M');
  assert.equal(formatPrice(ai('700 مليون الى 750 مليون')), '700M - 750M');
  assert.equal(formatPrice(ai('350 مليون')), '350M');
});

test('formatPrice: billion', () => {
  assert.equal(formatPrice(ai('4 ملاير و 400 مليون')), '4.4B');
  assert.equal(formatPrice(ai('مليار او 200')), '1B / 200M');
});

test('formatPrice: per meter', () => {
  assert.equal(formatPrice(ai('24 للمتر')), '24000');
  assert.equal(formatPrice(ai('2700 لمتر')), '2700');
  assert.equal(formatPrice(ai('سعر 24 للمتر')), '24000');
});

test('formatPrice: verbatim phrases', () => {
  assert.equal(formatPrice(ai('حسب الكور')), 'حسب الكور');
  assert.equal(formatPrice(ai('على باب الله')), 'على باب الله');
  assert.equal(formatPrice(ai('مزال')), 'مزال');
});

test('formatPrice: bare number via per_meter fallback', () => {
  assert.equal(formatPrice(ai('23000', { price_per_meter: 23000 })), '23000');
  assert.equal(formatPrice(ai('24', { price_per_meter: 24 })), '24000');
});

test('formatPrice: empty -> null', () => {
  assert.equal(formatPrice(ai('')), null);
  assert.equal(formatPrice(ai(null)), null);
});

test('priceMils: template ROUND(F/1M) scheme', () => {
  assert.equal(priceMils('900M'), 900);
  assert.equal(priceMils('4.4B'), 4400);
  assert.equal(priceMils('700M - 750M'), 700);
  assert.equal(priceMils('24000'), 0);
  assert.equal(priceMils(''), 0);
  assert.equal(priceMils(null), 0);
});

test('locationDisplay: location preferred, coords fallback', () => {
  assert.equal(locationDisplay({ location: 'صالوحة' }, {}), 'صالوحة');
  assert.equal(locationDisplay({ location: null }, { lat: 32.49713, lon: 3.64057 }), '32.4971, 3.6406');
  assert.equal(locationDisplay({ location: '' }, { lat: 32.49713, lon: 3.64057 }), '32.4971, 3.6406');
});

test('computePriceDzd: million and per-meter', () => {
  assert.equal(computePriceDzd({ price_in_million: 900 }), 9000000);
  assert.equal(computePriceDzd({ price_per_meter: 24, area_m2: 400 }), 9600000);
  assert.equal(computePriceDzd({ price_per_meter: 23000, area_m2: 400 }), 9200000);
  assert.equal(computePriceDzd({}), null);
});
