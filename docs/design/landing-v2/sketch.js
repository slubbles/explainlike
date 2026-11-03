// tiny rough-style sketch helpers for placeholder thumbnails
function rng(seed){return function(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646;}}
function line(r,x1,y1,x2,y2,j=3.2){const mx=(x1+x2)/2+(r()-.5)*j*2,my=(y1+y2)/2+(r()-.5)*j*2;
 return `M${x1+(r()-.5)*j} ${y1+(r()-.5)*j} Q${mx} ${my} ${x2+(r()-.5)*j} ${y2+(r()-.5)*j}`}
function rect(r,x,y,w,h){let d='';for(let k=0;k<2;k++){d+=line(r,x,y,x+w,y)+line(r,x+w,y,x+w,y+h)+line(r,x+w,y+h,x,y+h)+line(r,x,y+h,x,y)}return d}
function ell(r,cx,cy,rx,ry){let d='';for(let k=0;k<2;k++){const o=(r()-.5)*3;d+=`M${cx-rx+o} ${cy} a${rx} ${ry+o/2} 0 1 0 ${rx*2} 0 a${rx} ${ry} 0 1 0 ${-rx*2+o} 2`}return d}
function arrow(r,x1,y1,x2,y2){const a=Math.atan2(y2-y1,x2-x1),L=9;return line(r,x1,y1,x2,y2)+line(r,x2,y2,x2-L*Math.cos(a-.5),y2-L*Math.sin(a-.5),1.4)+line(r,x2,y2,x2-L*Math.cos(a+.5),y2-L*Math.sin(a+.5),1.4)}
const layouts=[
 r=>({w:rect(r,30,40,80,46)+rect(r,150,40,80,46)+rect(r,270,40,80,46)+arrow(r,112,63,146,63)+arrow(r,232,63,266,63)+rect(r,150,128,80,40),b:arrow(r,190,88,190,124)+ell(r,310,148,34,22)}),
 r=>({w:rect(r,40,36,120,130)+rect(r,52,52,96,20)+rect(r,52,82,96,20)+rect(r,52,112,60,20)+rect(r,220,60,110,60),b:arrow(r,162,90,216,90)}),
 r=>({w:ell(r,190,104,46,46)+ell(r,70,60,22,22)+ell(r,310,60,22,22)+ell(r,70,150,22,22)+ell(r,310,150,22,22)+line(r,92,64,148,90)+line(r,288,64,232,90)+line(r,92,146,148,120),b:line(r,288,146,232,118)}),
 r=>({w:rect(r,30,70,70,50)+rect(r,150,70,70,50)+rect(r,270,70,80,50)+arrow(r,102,95,146,95)+arrow(r,222,95,266,95),b:line(r,40,150,340,150)+line(r,60,145,60,155)+line(r,190,145,190,155)+line(r,320,145,320,155)}),
 r=>({w:rect(r,40,50,90,60)+rect(r,250,50,90,60)+arrow(r,132,70,246,70)+arrow(r,246,96,132,96),b:rect(r,150,128,80,36)+arrow(r,190,126,190,112)}),
 r=>({w:rect(r,140,30,100,44)+rect(r,30,120,90,44)+rect(r,145,120,90,44)+rect(r,260,120,90,44)+arrow(r,170,76,85,116)+arrow(r,190,76,190,116),b:arrow(r,212,76,300,116)+ell(r,305,142,58,32)}),
];
document.querySelectorAll('svg.thumb').forEach((s,i)=>{const r=rng(i*97+13);const L=layouts[i%layouts.length](r);
 s.innerHTML=`<path d="${L.w}" fill="none" stroke="#e7e7ea" stroke-width="1.6" stroke-linecap="round" opacity=".88"/><path d="${L.b}" fill="none" stroke="#5b9bff" stroke-width="2" stroke-linecap="round"/>`});
document.querySelectorAll('svg.board').forEach(s=>{const r=rng(7);
 const W=rect(r,60,70,170,64)+rect(r,330,70,170,64)+rect(r,600,70,170,64)+rect(r,870,70,170,64)
 +arrow(r,232,102,326,102)+arrow(r,502,102,596,102)+arrow(r,772,102,866,102)
 +rect(r,330,230,170,64)+rect(r,600,230,170,64)+arrow(r,415,136,415,226)+arrow(r,685,136,685,226)+arrow(r,955,136,955,300)+rect(r,870,304,170,64);
 const B=ell(r,955,336,118,58)+arrow(r,1080,260,1012,300);
 s.querySelector('.w').setAttribute('d',W);s.querySelector('.b').setAttribute('d',B);});
