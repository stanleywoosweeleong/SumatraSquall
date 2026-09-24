// Pulls the app's main script out of ../index.html into app.js, which the tests load.
const fs = require('fs');
const s = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const m = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop();
fs.writeFileSync(__dirname + '/app.js', m[1]);
console.log('app.js extracted (' + m[1].length + ' chars)');
