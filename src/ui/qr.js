// /src/ui/qr.js
// Shared QR client using CDN + SRI
// Usage: in your HTML builders do:
//   import { qrClientScripts } from "./qr.js";
//   html += qrClientScripts();

export function qrClientScripts() {
  const QR_LIB_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
  const QR_LIB_SRI = "sha384-5sxQmC8x5lQF6YfPsl3jQy2bRZkJ0n3KfXhF1gGQxqH1mH4s6wq2l/9lqYgH0w2J";

  return `
<script>
(function(){
  if (window.qrcode) { document.dispatchEvent(new Event('qr:ready')); return; }
  var s = document.createElement('script');
  s.src = ${JSON.stringify(QR_LIB_URL)};
  s.integrity = ${JSON.stringify(QR_LIB_SRI)};
  s.crossOrigin = "anonymous";
  s.onload = function(){ document.dispatchEvent(new Event('qr:ready')); };
  s.onerror = function(){ document.dispatchEvent(new Event('qr:error')); };
  document.head.appendChild(s);
})();
</script>

<script>
(function(){
  function ensure(){ return typeof qrcode === 'function'; }

  function drawCanvas(canvas, text, cellSize=4, margin=10, ecLevel='M'){
    if (!ensure()) return false;
    var qr = qrcode(0, ecLevel);
    qr.addData(String(text||""));
    qr.make();
    var count = qr.getModuleCount();
    var size = count * cellSize + 2 * margin;
    var ctx = canvas.getContext('2d');
    canvas.width = size; canvas.height = size;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
    ctx.fillStyle = '#000';
    for (var r=0;r<count;r++){
      for (var c=0;c<count;c++){
        if (qr.isDark(r,c)) ctx.fillRect(margin + c*cellSize, margin + r*cellSize, cellSize, cellSize);
      }
    }
    return true;
  }

  function makeSVG(text, cellSize=4, margin=10, ecLevel='M'){
    if (!ensure()) return null;
    var qr = qrcode(0, ecLevel);
    qr.addData(String(text||""));
    qr.make();
    var count = qr.getModuleCount();
    var size = count * cellSize + 2 * margin;
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'];
    out.push('<rect width="100%" height="100%" fill="#fff"/>');
    for (var r=0;r<count;r++){
      for (var c=0;c<count;c++){
        if (qr.isDark(r,c)){
          var x = margin + c*cellSize, y = margin + r*cellSize;
          out.push('<rect x="'+x+'" y="'+y+'" width="'+cellSize+'" height="'+cellSize+'" fill="#000"/>');
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
