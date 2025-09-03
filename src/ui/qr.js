// /src/ui/qr.js
// Fully inline QR client. No CDN, no external requests.
// Usage in your HTML builders:
//   import { qrClientInline } from "./qr.js";
//   html += qrClientInline(); // injects the QR lib + window.QR helpers
//
// Then in page JS: window.QR.drawCanvas(canvasEl, "TEXT", cellSize?, margin?)

export function qrClientInline() {
  return `
<script>
/* ==== BEGIN: Inlined QR library (minified) ==== 
   Paste a minified QR encoder below (e.g. qrcode-generator v1.4.4 or davidshimjs QRCode).
   It must attach a global you can call. This module expects a function factory like:
     var qrcode = function(typeNumber, errorCorrectLevel) { ... }
   with methods: addData(text), make(), getModuleCount(), isDark(r,c)
   -----------------------------------------------
*/
(function(){ 
  /*__INLINE_QR_LIB_MINIFIED__*/ 
})();
/* ==== END: Inlined QR library ==== */
</script>

<script>
// Minimal helpers that use the inlined lib and expose window.QR
(function(){
  function hasLib(){ return typeof qrcode === 'function'; }

  function drawCanvas(canvas, text, cellSize, margin, ecLevel){
    if (!hasLib()) return false;
    var cell = Number.isFinite(cellSize) ? cellSize : 4;
    var m = Number.isFinite(margin) ? margin : 10;
    var ec = (ecLevel||'M'); // L,M,Q,H
    var qr = qrcode(0, ec);
    qr.addData(String(text||""));
    qr.make();
    var count = qr.getModuleCount();
    var size = count * cell + 2 * m;
    var ctx = canvas.getContext('2d');
    canvas.width = size; canvas.height = size;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle = '#000';
    for (var r=0;r<count;r++){
      for (var c=0;c<count;c++){
        if (qr.isDark(r,c)) ctx.fillRect(m + c*cell, m + r*cell, cell, cell);
      }
    }
    return true;
  }

  function makeSVG(text, cellSize, margin, ecLevel){
    if (!hasLib()) return null;
    var cell = Number.isFinite(cellSize) ? cellSize : 4;
    var m = Number.isFinite(margin) ? margin : 10;
    var ec = (ecLevel||'M');
    var qr = qrcode(0, ec);
    qr.addData(String(text||""));
    qr.make();
    var count = qr.getModuleCount();
    var size = count * cell + 2 * m;
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'];
    out.push('<rect width="100%" height="100%" fill="#fff"/>');
    for (var r=0;r<count;r++){
      for (var c=0;c<count;c++){
        if (qr.isDark(r,c)){
          var x = m + c*cell, y = m + r*cell;
          out.push('<rect x="'+x+'" y="'+y+'" width="'+cell+'" height="'+cell+'" fill="#000"/>');
        }
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  window.QR = { drawCanvas, makeSVG };
})();
</script>`;
}
