# yop-crop

[Play the live game](https://ericminio.github.io/yop-crop)

A flying farm: a donut-shaped platform lifted by hot air balloons, carrying enough
growing area to feed a family of three for a year. It moves to follow the weather
its crops need.

`index.html` renders the platform.

## Historical replay

Open **Replay…** under the mission clock, choose a UTC date and time, and select
**Start new mission**. Replay starts paused at the current location; choose 1×,
60×, 360× or 1440× to play. At 1440×, one real minute represents one game day
including while weather loads. Choose **Paused** to stop, or **Return to live** inside
Replay to start a new live mission at the current location. Starting either mode
clears sowing dates and the route. The date is kept in the URL; reloading starts
that replay again, paused.

For example, `?replay=2022-01-01T12:00&lat=48.85&lon=2.35` starts over Paris.
Dates range from January 1, 2022 to the present. When the clock catches up with
the present, it automatically continues in real time without resetting the
mission, sowing dates or route. The URL also returns to live mode. Mission days, drift, weather, sunlight and crop timing all use
the replay clock. Returning from a suspended tab advances at most one real
second's worth of simulation instead of catching up the entire absence.

This is a **hindsight forecast**: archived GFS weather fills the same 16-day
window used by the live forecast, including later historical conditions. It is
modeled historical weather, not the forecast a player could actually have seen
at that time, and not direct observations at every point. The
[Historical Forecast API](https://open-meteo.com/en/docs/historical-forecast-api)
provides the existing surface and pressure-level fields. Current and past missing
conditions are explicitly estimated while data loads.
Missing future outlooks remain unavailable.

Within five days of the present, replay uses the live forecast endpoint and its
recent history so archive publication delays cannot block the handoff. Its
forecast outlook then follows the live forecast window; the label changes to
**Catching up**.

Replay weather is requested on a 0.25° coordinate grid to reuse nearby weather
while moving quickly. Cache entries are separated by game date, and archived
values do not expire every 15 real minutes; recent live forecasts still do.
Requests include up to 92 prior days,
as in live mode. Network retries still use real time; archive requests time out
after 45 seconds. The clock keeps its selected speed during outages.
**Estimated** labels the
provisional weather and position; **Correcting route** indicates recovery.

## Weather adapters

Open-Meteo forecasts are the default, so the flight level selector is enabled
without a URL parameter. Open `index.html?weather=simulated` to use generated
weather, including wind; flight level selection is disabled in simulated mode.
Open-Meteo uses simulated crop conditions as the fallback when surface forecast
coverage is unavailable.
During an outage, drift and heading use cached or last known wind at the selected
level, marked as estimated. Before any wind has loaded for that level, generated
wind keeps the game moving. API-only wind validation remains strict for route
reconstruction.
The Open-Meteo weather adapter returns crop conditions only. Surface and
pressure-level flight wind use the same reader and validation; the selected
level determines the forecast fields, and pressure levels also require altitude.

In live mode, cached forecasts refresh after 15 minutes, even when the platform is stationary.
Cached conditions remain visible during refresh. Wind older than 15 real minutes
can drive the estimated position but cannot advance the confirmed route.
Failed requests retry
after one minute. These checks run when animation frames run, so returning to a
suspended tab also triggers any overdue refresh.

When current crop weather or wind is unavailable, the header status becomes a
“weather unavailable · retry” button. Clicking it fetches the current location
immediately, bypassing the cache age and retry delay while retaining location,
flight level, sowing dates and the flight trail. It shows “retrying weather…”
and is disabled during the request. Requests time out after 15 seconds, including
response loading, then allow another manual attempt or an automatic retry after
one minute. Recovery does not require reloading the page.

Surface wind (10 m) remains the default drift approximation. In Open-Meteo mode,
the Flight level selector also offers the 19 discrete pressure levels from
1000 to 30 hPa. Drift and arrival estimates use the selected level's wind speed;
heading is opposite the meteorological wind direction (the bearing wind comes
from). Wind is never blended between levels. Simulated wind preserves the
existing variation with mission time; pressure selection requires Open-Meteo.

The altitude display uses the selected level's forecast geopotential height in
metres above sea level (ASL), which varies with place and time. Changing levels
finishes elapsed movement at the previous level, then switches wind without
changing horizontal position. Missing or invalid selected-level wind or height
leaves the confirmed route at
its last verified checkpoint. The displayed position continues using estimates;
it is separate from the checkpoint and never becomes confirmed merely because
time has passed. The dotted amber trail and **estimated position** readout make
that distinction visible.

Background recovery reconstructs the missing interval using fresh weather for
each location, historical hour and selected flight level along the route. Each
frame processes at most 240 one-minute steps. Missing hourly coverage stops only
this background reconstruction. Automatic retries use real time and the retry
button prioritizes the confirmed checkpoint. Manual relocation clears both the
confirmed and estimated route, pending corrections and remembered weather.

Once reconstruction catches the game clock, the displayed position eases toward
the corrected position over five real seconds, including when replay is paused.
The correction takes the short direction across the date line. Further outages
continue from the currently displayed position. Estimated trail points are
replaced by the reconstructed route; no estimated point is promoted to verified
history. Position remains uncertain until the correction completes.

Crop conditions during outages use the last complete conditions at the selected
level, adjusted by the generated model's change in season and time of day. With
no sample, the generated model supplies initial values. Its altitude approximation
uses a standard-atmosphere pressure height and a 6.5 °C/km temperature lapse;
this is a gameplay fallback, not validated atmospheric weather. Current and past
crop calculations can use these labeled estimates; missing future forecasts stay
unavailable. On recovery the current weather readout blends to actual API values
over five real seconds, and crop tracks recalculate from available history.

Positions remain weather-model estimates, not observed fixes. If historical wind
cannot be retrieved, the confirmed checkpoint remains unresolved while the game
continues in estimated mode. Completed confirmed intervals are not retroactively
revised by later forecasts. Archive recovery remains available after replay has
caught up to live time.

Crop temperature, humidity and cloud cover also come from the selected level.
VPD is derived from its temperature and relative humidity. Daily temperature
extremes require all 24 hourly samples of that UTC day; these extremes drive
thermal growth and crop needs. Switching levels recalculates crop tracks and
candidate outlooks at that level. Tracks are scenarios for the currently selected
level, not a persisted history of previously flown levels.

Missing pressure-level forecast inputs remain unavailable in the API adapter.
The current/past gameplay fallback is labeled estimated; future crop projections
end at the first missing day without reporting a thermal stall. Radiation at altitude is estimated hourly from surface radiation:

`radiation aloft = surface radiation × (1 − 0.75 × cloud overhead) / (1 − 0.75 × surface cloud)`

Cloud fractions run from 0 to 1. Overhead cloud is the maximum across the selected
pressure level and every supplied level above it; clouds below are excluded.
The 0.75 blocking strength is an uncalibrated assumption: an overcast layer still
transmits 25%. The resulting ratio stays between 0.25 and 4. Each hourly estimate
is capped at incoming extraterrestrial sunlight on a horizontal plane, evaluated
at the interval midpoint, and set to zero at night. The cap is a simple bound,
not a clear-sky atmospheric model. The 24 hourly estimates are integrated to
MJ/m²/day, respecting Open-Meteo's preceding-hour radiation timestamps.

This model assumes overlapping cloud layers and does not know cloud opacity,
thickness, scattering or reflection. Surface total cloud and pressure-level
cloud estimates may disagree. Complete hourly coverage and valid daytime cloud
and radiation data are required; missing data remains unavailable. Estimated
radiation supplies crop DLI and suitability scores; header DLI is prefixed `~`.
Day length still uses solar geometry.

### Estimated water demand at altitude

Reference evaporation uses a daily FAO-56-style calculation adapted to zero
relative wind: `ET = max(0, 0.408 × Δ × Rn / (Δ + γ))`, in mm/day.
Temperature sets the saturation-pressure slope Δ; γ uses the selected pressure
in kPa. Net radiation Rn is absorbed shortwave radiation (albedo 0.23) minus
estimated outgoing longwave radiation. Longwave uses daily temperature extremes,
mean actual vapour pressure from hourly temperature/RH pairs, and the ratio of
estimated radiation to a clear-sky estimate at the mean forecast altitude.
That ratio is clamped to 0.3–1; the clear-sky transmission is capped at 1.

Relative wind is exactly zero for the drifting platform: the aerodynamic VPD
term vanishes, with no minimum wind or substitution of drift speed. Humidity
still affects the longwave estimate. Daily heat storage is assumed zero and
negative net evaporation is clipped to zero (no condensation estimate).
Complete daily temperature, humidity, height and radiation inputs are required.
This adaptation is uncalibrated for a flying deck, especially at extreme
altitudes, and does not model leaf temperature, natural convection, soil-water
stress or irrigation efficiency. Equations are based on
[FAO-56 reference evaporation](https://www.fao.org/4/X0490E/x0490e06.htm) and
[net radiation](https://www.fao.org/4/X0490E/x0490e07.htm).

Deck water demand sums `ET × crop-stage coefficient × planted area`.
One mm over one m² is one litre; the panel converts litres to tonnes of water.
Reference ET, deck draw and days to dry carry `~` when estimated at altitude.
Empty beds and turnaround have no crop demand; an unknown planted crop phase
leaves demand unavailable. Days to dry uses current water divided by current
daily draw, with no depletion at zero draw. It is a constant-demand projection,
not a water-budget simulation; it does not deduct rain/cloud capture or update
the stored water over time.
There is no model of ascent/descent, terrain clearance or route feasibility.
The pressure levels and variables are documented in the
[Open-Meteo forecast API](https://open-meteo.com/en/docs#pressure-level-variables).

In live mode, position advances in real time with the selected adapter's wind, starting from
the initial position. Each page load starts a new mission on day 1. Selecting a
new position restarts the mission on day 1, clears sowing dates and the timeline
selection, and resets the movement clock there. Wind drift does not restart the
mission. Mission days advance every 24 elapsed hours; calendar dates and weather
continue to use the current real time.
The map and coordinates follow the drift; scrubbing the crop timeline does not
move the platform. An amber trail in the Position panel follows the route from
the session's starting position to FF1, retaining a point each minute plus its
live position. Clicking to relocate clears the trail and starts it there.
After a suspended tab resumes, elapsed time is integrated in
steps using weather along the route. Open-Meteo reconstruction retains elapsed
time for unavailable wind while the displayed position continues provisionally. Reloading starts a new session;
the flight path and selected level are not persisted.

Run the weather and movement checks with `node --test __tests__/*.test.cjs`.
The `Tests` GitHub Actions check runs both suites on every pull request and on
pushes to `dev`, using Node.js 22.

## Duplication detection

Run `node scripts/check-duplication.cjs index.html` to find repeated code within
and across JavaScript files and inline HTML scripts. This custom detector uses
only Node.js built-ins; there is nothing to install. Pass multiple files to
compare them, or add `--json` for structured output with source line ranges.

The detector compares contiguous token sequences throughout the source, including
calculations, loops, drawing code, arrow functions and methods. It has no rules
for particular application fields, wind data or validation functions.
Whitespace and comments are ignored. The default `--mode normalized` treats
variable and function identifiers as interchangeable, while preserving property
names, all literal values, keywords and operators. Dot/optional-access properties,
object keys, shorthand properties and method names are recognized from nearby
tokens. For example, `by - 4` and `by - 5`, or `'click'` and `'wheel'`, remain
different. Regular-expression patterns and flags are preserved too.
`--mode exact` retains all token names and
values too. Matches are extended to their maximal non-overlapping lengths.

Defaults are `--min-tokens 50 --min-lines 5`. Both copies must meet both thresholds.
Matches must also contain at least four identifier/keyword tokens comprising at
least 10% of the matched tokens, to avoid flooding the report with literal-data
lists. Lower thresholds find smaller fragments but produce more review noise.

This is a general-purpose code-clone detector, not a proof of equivalent behavior.
It cannot equate rewritten algorithms, dot access with computed access, or
positive checks with inverted rejection branches. Normalized matches can also
represent intentional similarities. Review findings before refactoring.
The lightweight JavaScript tokenizer treats string, template and common regex
literals as opaque tokens; it does not analyze template interpolation or validate
JavaScript syntax. HTML markup, CSS and non-JavaScript script blocks are excluded.

Exit status is `0` for no clones, `1` for clones, and `2` for input or tokenization
errors. Script regression tests run with `node --test scripts/__tests__/*.test.cjs`.

### Local pre-push check

Enable the local hook with `git config --local core.hooksPath .githooks` and
`git config --local duplication.baseRef refs/remotes/origin/dev`.
The hook requires Node.js on PATH. It runs locally only; there is no duplication
gate in CI. Hook and detector files must be present in this checkout.

For each branch update, it compares the exact commit Git is about to push against
its common ancestor with the configured base. If no base is configured, it uses
the destination remote's local HEAD reference. It reads source files directly
from Git objects, so uncommitted edits do not affect the result and no temporary
checkout is needed. It does not fetch: refresh the base reference before pushing
when a newer comparison point is needed.

Both snapshots use the same locally installed detector with normalized mode,
50 tokens and 5 lines. Tracked JavaScript and inline HTML scripts are included;
test/spec files and test, __tests__, e2e, fixture, dependency, vendor, build, distribution
and coverage directories are excluded. Branch deletions and tag updates are
skipped. Other branch updates in the same push are checked independently.

The hook compares normalized 50-token windows within reported clones and their
occurrence counts. It blocks newly duplicated windows or additional copies of
existing ones, without relying on filenames or line numbers to identify them.
Moving an existing duplicate is allowed. Removing unrelated duplication does
not offset a new duplicate. A scan, configuration or Git error blocks the push
with an error message instead of being treated as zero duplication.

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
