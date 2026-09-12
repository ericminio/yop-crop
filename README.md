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

### Growing and flight cost

| Crop | days | viable | optimum | root | ET | flown kg/m² | m² |
|---|---|---|---|---|---|---|---|
| potato | 100 | 7–25 °C | **15–20 °C** | 45 cm | 5.5 mm/d | 308 | 146 |
| sunflower | 100 | 10–35 °C | **18–30 °C** | 60 cm | 7.0 | 409 | 40 |
| tomato | 110 | 13–32 °C | **18–27 °C** | 45 cm | 6.0 | 312 | 11 |
| kale | 55 | 4–28 °C | **12–24 °C** | 25 cm | 4.0 | 178 | 6 |
| carrot | 70 | 7–28 °C | **16–21 °C** | 35 cm | 4.0 | 238 | 4 |
| onion | 100 | 8–30 °C | **13–24 °C** | 25 cm | 4.5 | 182 | 2 |

All six optima overlap at **18–20 °C**, capped by potato at the top and sunflower
at the bottom. One climate target, so no greenhouse and no seasonal split.

### Yield and light

Yield is ultimately set by intercepted radiation, not by temperature or by how
many cycles you fit in a year. The ceiling below is what each crop can make from
22 MJ/m²/day of clear-sky radiation at its own radiation-use efficiency, canopy
interception, harvest index and dry-matter fraction.

| Crop | planned kg/m²/yr | **full sun ceiling** | headroom | **in balloon shade** | shaded as % of plan |
|---|---|---|---|---|---|
| potato | 10.5 | **15.4** | +46% | **0.83** | 8% |
| sunflower | 0.90 | **1.2** | +29% | **0.06** | 7% |
| tomato | 21.8 | **38.5** | +77% | **2.07** | 10% |
| kale | 9.0 | **21.1** | +134% | **1.13** | 13% |
| carrot | 12.0 | **16.3** | +36% | **0.88** | 7% |
| onion | 12.0 | **13.0** | +8% | **0.70** | 6% |

Annual output off the 209 m² deck:

| | planned | at the ceiling | in balloon shade |
|---|---|---|---|
| total fresh weight | 1,935 kg | 2,930 kg | **158 kg** |

**Shaded output is 8% of plan — the deck would need 12× the area.** This is why
the envelopes stand off 40 m instead of sitting overhead: their combined frontal
area is 8–14× the deck footprint, so overhead they eclipse it outright.

Note the shade figure is far worse than the light that reaches the deck. An
envelope transmits roughly **12%** of full sun, but a closed canopy only breaks
even at about **7%** of full sun — below that, respiration exceeds
photosynthesis. Only the surplus above break-even builds anything, so the usable
fraction is **5.4%, not 12%**.

Night is already inside every number above: radiation-use efficiency is measured
over whole days, net of overnight respiration. Shade is a loss *on top* of night,
and it takes the productive half of the cycle. Night is also not wasted time —
photoperiod is what triggers onion bulbing, potato tuberisation and tomato
flowering, starch moves out of the leaves after dark, and tomato is physically
damaged by continuous light.

Two things worth watching in the table. **Onion sits within 8% of its ceiling**,
because its upright leaves never close a canopy — extra light does almost
nothing for it. And **sunflower is the one crop the plan does not cover at
planned yields**: 40 m² makes 36 kg of seed against a 46 kg requirement, and
only reaches it at the full-sun ceiling. It needs either more area or the
assumption that FF1 really does hold clear skies.

## Phases

Each bed runs establish → vegetative → bulking → mature, then a 10-day
turnaround. Water and light demand are not flat across those phases, and they
peak together.

### Water — FAO-56 crop coefficients

Multipliers on reference ET. At 18–20 °C under clear skies reference ET is about
4.5 mm/day.

| Crop | establish | vegetative | bulking | mature | peak ÷ establish |
|---|---|---|---|---|---|
| potato | 0.50 | 0.83 | **1.15** | 0.75 | 2.3× |
| sunflower | 0.35 | 0.68 | **1.10** | 0.35 | **3.1×** |
| tomato | 0.60 | 0.88 | **1.15** | 0.80 | 1.9× |
| kale | 0.70 | 0.88 | **1.05** | 0.95 | 1.5× |
| carrot | 0.70 | 0.88 | **1.05** | 0.95 | 1.5× |
| onion | 0.70 | 0.88 | **1.05** | 0.75 | 1.5× |

A bed in bulking drinks two to three times what the same bed drank while
establishing. Sunflower swings hardest — 1.6 mm/day to 5.0 mm/day and back.

### Light — what the canopy can intercept

| Phase | interception |
|---|---|
| establish | 12% |
| vegetative | 50% |
| bulking | **88%** |
| mature | 65% |
| turnaround | 0% — bare bed, no demand for light or water at all |

Shade costs yield in proportion to interception, so **an hour lost in bulking
costs about seven times what the same hour costs during establish**. Phase is
therefore a weighting on any relocation decision, not just a status label.

### What this means for the deck

Staggering the sowing dates keeps total demand from spiking:

| | mean | peak | peak ÷ mean |
|---|---|---|---|
| as planned, staggered | 0.73 t/day | **0.98 t/day** | 1.34 |
| if everything were sown together | — | 1.07 t/day | 1.48 |

The deck carries **8.4 t** of water held in the medium (seven days at each
crop's peak ET) plus **1.5 t** of separate reserve — about **10 days** of cover
at peak draw, since the crops never all peak at once.

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
