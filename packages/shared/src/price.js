// Algerian conventions (verified against existing CRM data):
// - "X مليون" (centimes) -> X * 1_000_000 centimes = X * 10_000 DA
// - "N للمتر": small N (< 100) means N thousands DA/m2 (e.g. "24 للمتر" -> 24_000 DA/m2);
//   large N (>= 100) is literal DA/m2 (e.g. "2700 لمتر" -> 2_700, "23000" -> 23_000)
export function computePriceDzd(ai) {
  if (ai.price_in_million != null) return ai.price_in_million * 10000;
  if (ai.price_per_meter != null && ai.area_m2 != null) {
    const perMeter = ai.price_per_meter < 100 ? ai.price_per_meter * 1000 : ai.price_per_meter;
    return perMeter * ai.area_m2;
  }
  return null;
}
