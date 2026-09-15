# yop-crop

A flying farm: a donut-shaped platform lifted by hot air balloons, carrying enough
growing area to feed a family of three for a year. It moves to follow the weather
its crops need.

`index.html` renders the platform.

## Weather adapters

The default simulated adapter generates weather, including wind. Open
`index.html?weather=open-meteo` to use Open-Meteo forecasts, with simulated
conditions as the fallback when forecast coverage is unavailable. Missing wind
samples also fall back to simulated wind.

Both adapters expose 10 m wind speed in km/h and wind direction in degrees
(the bearing the wind comes from). The platform uses that speed for drift and
arrival estimates, and the opposite bearing for heading. This uses surface wind
as a drift approximation; it does not model winds at flight altitude or route
feasibility. Simulated wind preserves the existing variation with mission time.

Position advances in real time with the selected adapter's wind, starting from
the initial position. Selecting a new position resets the movement clock there.
The map and coordinates follow the drift; scrubbing the crop timeline does not
move the platform. After a suspended tab resumes, elapsed time is integrated in
steps using weather along the route (simulated fallback where forecasts are not
cached). Reloading starts a new session; the flight path is not persisted.

Run the weather and movement checks with `node --test tests/*.test.cjs`.

## Design premise

The platform has no fixed season. It flies to stay in the air temperature its crops
want, so beds run back-to-back all year instead of once a summer — worth roughly 3x
the ground area of a fixed farm.

All three crops in plan share a single optimum band of **18–20 °C**, capped by
potato at the top — tubers stall above 20. One climate target for the whole
mission, so no greenhouse and no seasonal split.

Nobody lives aboard and nobody walks on it: drones service it, so there are no
paths and the whole deck is bed.

**Current plan: 209 m² of deck, 64.3 t of soil and water, three crops.**

Dropping sunflower removed the only 60 cm bed, and the saving cascaded: 3 t off
the deck shrank the envelopes, smaller envelopes pack closer so the standoff
came in, and a nearer standoff pulls the tethers more vertical, which takes off
more lift again.

| | six crops | **three crops** |
|---|---|---|
| deepest bed | 60 cm (sunflower) | **45 cm** |
| beds | 67.3 t | **64.3 t** |
| all-up mass | 69.5 t | **66.5 t** |
| envelopes | 5 × 60,000 m³, r 24.3 m | **5 × 49,500 m³, r 22.8 m** |
| standoff | 40.0 m | **38.8 m** |
| tether off vertical | 26.3° | **25.4°** |
| gross lift | 77.5 t | **73.5 t** |
| rim hoop tension | 66 kN | **49 kN** |

The ring itself is unchanged at **10.32 m outer, 6.32 m inner, 4 m wide**, because
the deck area did not change. What changed is that the deck is now effectively
flat: potato and tomato are both 45 cm and together are 99% of it, leaving one
2 m² onion sliver at 25 cm. The stepped-bed design still holds, it just has
almost nothing left to step.

## In plan

### Growing and flight cost

| Crop | days | viable | optimum | root | ET | flown kg/m² | m² |
|---|---|---|---|---|---|---|---|
| potato | 100 | 7–25 °C | **15–20 °C** | 45 cm | 5.5 mm/d | 308 | 196 |
| tomato | 110 | 13–32 °C | **18–27 °C** | 45 cm | 6.0 | 312 | 11 |
| onion | 100 | 8–30 °C | **13–24 °C** | 25 cm | 4.5 | 182 | 2 |

### Yield and light

Yield is set by intercepted radiation, not by temperature or by how many cycles
fit in a year. The ceiling is what each crop can make from 22 MJ/m²/day of
clear-sky radiation at its own radiation-use efficiency, canopy interception,
harvest index and dry-matter fraction.

| Crop | planned kg/m²/yr | **full sun ceiling** | headroom | **in balloon shade** |
|---|---|---|---|---|
| potato | 10.5 | **15.4** | +46% | **0.83** |
| tomato | 21.8 | **38.5** | +77% | **2.07** |
| onion | 12.0 | **13.0** | +8% | **0.70** |

Annual output off the 209 m² deck:

| | planned | at the ceiling | in balloon shade |
|---|---|---|---|
| fresh weight | 2,322 kg | 3,468 kg | **187 kg** |
| calories | 1.64 M | 2.41 M | — |
| share of the family's energy | **75%** | **110%** | 9% |

Shaded output is 8% of plan. This is why the envelopes stand off rather than
hanging overhead: their combined frontal area is 8–14× the deck footprint, so
overhead they eclipse it outright. An envelope transmits roughly **12%** of full
sun, but a closed canopy only breaks even near **7%** — below that respiration
exceeds photosynthesis — so the usable fraction is **5.4%, not 12%**.

Night is already inside every number above: radiation-use efficiency is measured
over whole days, net of overnight respiration. Shade is a loss *on top* of night,
and it takes the productive half of the cycle. Night is also not wasted —
photoperiod triggers onion bulbing and potato tuberisation, starch moves out of
the leaves after dark, and tomato is physically damaged by continuous light.

### What FF1 does not grow

**There is no fat crop.** The three crops yield about **2.6 kg of fat a year
against a 9 kg essential-fatty-acid floor** — 29%. Nor is there meaningful
protein or calcium.

FF1 is therefore a **staple farm**: it grows the calories, and the household
sources fat, protein and micronutrients elsewhere. That holds together only
because nobody lives aboard — the produce is offloaded to a kitchen that has a
shop. It would not hold for a self-sufficient platform.

Sunflower was the only candidate that closed the gap, and it was dropped on
weight and palatability. Nothing edible is lighter per kg of fat: rapeseed 1.1×
and inedible as a seed, hemp 1.8×, soy 1.8× and an allergen and too warm for the
band, walnut 2.2× and a tree, oats 3.0× at only 7% fat, pumpkin seed 3.0×.
Sunflower's weight was 88% root depth, and a 40 cm bed with a dwarf variety would
have cut it 29% while *improving* mass per kg of fat — that option remains open.

## Considered and cut

Kept so any of them can be re-opened.

| Crop | days | viable | optimum | root | ET | kg/m²/cycle | why cut |
|---|---|---|---|---|---|---|---|
| sunflower | 100 | 10–35 °C | 18–30 °C | 60 cm | 7.0 mm/d | 0.30 | too heavy (60 cm taproot), and not wanted as food |
| kale | 55 | 4–28 °C | 12–24 °C | 25 cm | 4.0 | 3.00 | simplification |
| carrot | 70 | 7–28 °C | 16–21 °C | 35 cm | 4.0 | 4.00 | simplification |
| spinach | 45 | 2–24 °C | 10–20 °C | 25 cm | 4.0 | 2.50 | simplification |
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
thrive in it, and both fail on edibility rather than agronomy.

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
