importScripts('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.0/stockfish.js');
var stockfish = STOCKFISH();
stockfish.onmessage = function(e) { postMessage(e); };
onmessage = function(e) { stockfish.postMessage(e.data); };
