# yop-crop

A flying farm: a donut-shaped platform lifted by hot air balloons, carrying enough
growing area to feed a family of three for a year. It moves to follow the weather
its crops need.

`index.html` renders the platform.

## Design premise

The platform has no fixed season. It flies to stay in the air temperature its crops
want, so beds run back-to-back all year instead of once a summer — worth roughly 3x
the ground area of a fixed farm.

All six crops in plan share a single optimum band of **18–20 °C**, set by potato at
the top (tubers stall above 20) and sunflower at the bottom. One climate target for
the whole mission, so no greenhouse and no seasonal split.

**Current plan: 209 m² of deck, 67.3 t of soil and water, six crops.**

## In plan

| Crop | days | viable | optimum | root | ET | kg/m²/cycle | flown kg/m² | m² |
|---|---|---|---|---|---|---|---|---|
| potato | 100 | 7–25 °C | **15–20 °C** | 45 cm | 5.5 mm/d | 3.50 | 308 | 146 |
| sunflower | 100 | 10–35 °C | **18–30 °C** | 60 cm | 7.0 | 0.30 | 409 | 40 |
| tomato | 110 | 13–32 °C | **18–27 °C** | 45 cm | 6.0 | 8.00 | 312 | 11 |
| kale | 55 | 4–28 °C | **12–24 °C** | 25 cm | 4.0 | 3.00 | 178 | 6 |
| carrot | 70 | 7–28 °C | **16–21 °C** | 35 cm | 4.0 | 4.00 | 238 | 4 |
| onion | 100 | 8–30 °C | **13–24 °C** | 25 cm | 4.5 | 4.00 | 182 | 2 |

Potato is the calorie backbone. Sunflower is the only fat source that is both edible
as a seed and cheap enough to fly; without it the diet falls below the essential
fatty acid floor and the carotene in the carrots goes unabsorbed. Kale carries the
vitamins and the best protein per m². Tomato, carrot and onion are flavour and
micronutrients.

## Considered and cut

Kept so any of them can be re-opened.

| Crop | days | viable | optimum | root | ET | kg/m²/cycle | why cut |
|---|---|---|---|---|---|---|---|
| spinach | 45 | 2–24 °C | 10–20 °C | 25 cm | 4.0 mm/d | 2.50 | simplification |
| chard | 55 | 7–30 °C | 15–24 °C | 30 cm | 4.5 | 4.00 | simplification |
| purslane | 50 | 15–40 °C | 25–35 °C | 15 cm | 3.0 | 3.00 | unfamiliar; too hot for the band |
| soybean | 110 | 15–35 °C | 25–30 °C | 40 cm | 5.5 | 0.30 | allergen; too hot for the band |
| hulless pumpkin | 110 | 15–35 °C | 20–30 °C | 45 cm | 6.0 | 3.00 | simplification |
| dry bean | 95 | 12–32 °C | 18–27 °C | 40 cm | 5.0 | 0.30 | simplification |
| maize | 110 | 12–35 °C | 21–30 °C | 45 cm | 5.5 | 0.80 | too hot for the band |
| peanut | 130 | 18–35 °C | 25–30 °C | 50 cm | 6.0 | 0.35 | allergen — 5.6% of households of three |
| flax | 100 | 8–28 °C | 15–22 °C | 35 cm | 4.5 | 0.22 | unpalatable |
| rapeseed | 120 | 5–27 °C | 12–20 °C | 40 cm | 4.5 | 0.25 | seed is not edible, only pressable |

The 18–20 °C band, not preference, is what excludes soybean, maize and purslane —
their optima start at 21–25 °C. Rapeseed and flax are the only cut crops that would
thrive in it.

## Notes on the columns

- **days** — sowing to harvest, one cycle.
- **viable / optimum** — air temperature. Outside optimum a crop still grows, slower
  and with lower yield; outside viable it fails.
- **root** — bed depth the crop needs. This sets soil mass, which is most of what
  the balloons lift.
- **ET** — peak evapotranspiration, the irrigation reserve that has to fly along.
- **flown** — kg per m² that must be lifted: soil at 600 kg/m³ over the root depth,
  plus seven days of water. Bed depth is stepped per crop; a uniform deck at the
  deepest crop would nearly double the mass.
