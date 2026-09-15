const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const when = Date.UTC(2026, 8, 14, 12);

function app(provider = 'simulated', fetch = async () => { throw Error('offline'); }) {
  const context = vm.createContext({
    URLSearchParams, location: { search: '?weather=' + provider }, fetch,
    Date: class extends Date { static now() { return when; } }
  });
  vm.runInContext(script.slice(script.indexOf("  'use strict';"),
    script.indexOf('  function dayMs(')), context);
  return expression => vm.runInContext(expression, context);
}

function forecast(run, speed = 24, direction = 270) {
  run(`
    const hourly = { time: [${when / 1000}, ${when / 1000 + 3600}] };
    for (const field of openMeteoWeather.hourly) hourly[field] = [10, 10];
    hourly.wind_speed_10m = [${speed}, 32];
    hourly.wind_direction_10m = [${direction}, 90];
    const daily = { time: [${when / 1000 - 43200}] };
    for (const field of openMeteoWeather.daily) daily[field] = [20];
    openMeteoWeather.cache.set('0.00,0.00', { hourly, daily });
  `);
}

module.exports = { app, forecast, script, when };
