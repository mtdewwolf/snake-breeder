'use strict';
// Copies the game's static files into www/, the folder Capacitor packages into the Android app.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
['index.html', 'css', 'js'].forEach((p) => fs.cpSync(path.join(root, p), path.join(out, p), { recursive: true }));
console.log('Web build copied to www/');
