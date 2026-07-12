(function(){
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${greet}, Ramesh 👋`;
  document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
})();

/* ===== Sales chart ===== */
const chartData = {
  '7d': {
    labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    values:[2100,1800,2900,2400,3200,4100,3840]
  },
  '30d': {
    labels:['Jul 1','Jul 5','Jul 9','Jul 13','Jul 17','Jul 21','Jul 25','Jul 29','Today'],
    values:[4200,5800,4900,7200,6100,8400,7800,9100,10200]
  },
  '90d': {
    labels:['May','Early Jun','Mid Jun','Late Jun','Early Jul','Mid Jul','Today'],
    values:[18000,22000,19500,26000,24000,30000,35000]
  }
};

let currentPeriod = '30d';
const canvas = document.getElementById('salesChart');
const ctx = canvas.getContext('2d');

function drawChart(period){
  const data = chartData[period];
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth - 44;
  const h = 220;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const padL=40, padR=16, padT=16, padB=40;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const max = Math.max(...data.values) * 1.15;
  const pts = data.values.map((v,i)=>({
    x: padL + (i/(data.values.length-1))*chartW,
    y: padT + chartH - (v/max)*chartH
  }));

  ctx.clearRect(0,0,w,h);

  // grid lines
  const ticks = 4;
  ctx.strokeStyle = '#E1DED2';
  ctx.lineWidth = 1;
  for(let i=0;i<=ticks;i++){
    const y = padT + (i/ticks)*chartH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+chartW,y); ctx.stroke();
    const val = Math.round(max*(1-i/ticks));
    ctx.fillStyle = '#9A9587';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('₹'+(val>=1000?(val/1000).toFixed(1)+'k':val), padL-6, y+4);
  }

  // gradient fill
  const grad = ctx.createLinearGradient(0,padT,0,padT+chartH);
  grad.addColorStop(0,'rgba(44,74,110,.18)');
  grad.addColorStop(1,'rgba(44,74,110,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT+chartH);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x, padT+chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++){
    const cp1x = (pts[i-1].x+pts[i].x)/2;
    ctx.bezierCurveTo(cp1x,pts[i-1].y,cp1x,pts[i].y,pts[i].x,pts[i].y);
  }
  ctx.strokeStyle = '#2C4A6E';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // dots
  pts.forEach((p,i)=>{
    ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2);
    ctx.fillStyle = '#2C4A6E'; ctx.fill();
    ctx.fillStyle = '#FFFFFB'; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill();
  });

  // x labels
  ctx.fillStyle = '#9A9587';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(data.labels.length/7));
  data.labels.forEach((l,i)=>{
    if(i % step === 0 || i === data.labels.length-1)
      ctx.fillText(l, pts[i].x, padT+chartH+16);
  });
}

function switchChart(period, btn){
  currentPeriod = period;
  document.querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  drawChart(period);
}

window.addEventListener('resize', ()=>drawChart(currentPeriod));
setTimeout(()=>drawChart(currentPeriod), 50);

/* ===== Recent orders ===== */
const orders = [
  { id:'ORD-5821', name:'Priya Sharma', items:'Tata Salt, Moong Dal, Atta', amount:412, status:'new', time:'10 min ago' },
  { id:'ORD-5820', name:'Suresh Kumar', items:'Amul Ghee, Red Label Tea', amount:544, status:'processing', time:'38 min ago' },
  { id:'ORD-5819', name:'Meena Reddy', items:'Coca-Cola ×12, Lay\'s ×6', amount:720, status:'delivered', time:'1 hr ago' },
  { id:'ORD-5818', name:'Vijay Nair', items:'Colgate, Dettol Soap, Oil', amount:378, status:'delivered', time:'2 hr ago' },
  { id:'ORD-5817', name:'Anita Joshi', items:'Basmati Rice 5 kg', amount:549, status:'cancelled', time:'3 hr ago' },
  { id:'ORD-5816', name:'Ravi Iyer', items:'Toor Dal, Madhur Sugar', amount:217, status:'delivered', time:'4 hr ago' },
];

const statusLabels = { new:'New', processing:'Processing', delivered:'Delivered', cancelled:'Cancelled' };
const tbody = document.getElementById('ordersBody');
tbody.innerHTML = orders.map(o=>`
  <tr>
    <td><span class="order-id">${o.id}</span></td>
    <td>
      <div class="order-name">${o.name}</div>
      <div class="order-items">${o.items}</div>
    </td>
    <td><span class="order-price">₹${o.amount}</span></td>
    <td><span class="status-pill ${o.status}"><span class="status-dot"></span>${statusLabels[o.status]}</span></td>
    <td style="font-size:12px;color:var(--muted);">${o.time}</td>
  </tr>`).join('');

/* ===== Top products ===== */
const topProducts = [
  { emoji:'🌾', name:'Aashirvaad Atta', sub:'Grocery & Staples', sold:142, revenue:35358 },
  { emoji:'🧴', name:'Fortune Sunflower Oil', sub:'Edible Oils & Ghee', sold:118, revenue:16756 },
  { emoji:'🫙', name:'Amul Ghee', sub:'Edible Oils & Ghee', sold:97, revenue:29003 },
  { emoji:'🍵', name:'Red Label Tea', sub:'Beverages', sold:84, revenue:20580 },
  { emoji:'🧂', name:'Tata Salt', sub:'Sugar & Salt', sold:76, revenue:2128 },
];
const maxSold = topProducts[0].sold;
document.getElementById('topProducts').innerHTML = topProducts.map((p,i)=>`
  <div class="product-row">
    <span class="prod-rank">${i+1}</span>
    <div class="prod-icon">${p.emoji}</div>
    <div class="prod-info">
      <div class="prod-name">${p.name}</div>
      <div class="prod-sub">${p.sub}</div>
    </div>
    <div style="flex:1;min-width:60px;padding:0 10px;">
      <div class="prod-bar-track"><div class="prod-bar-fill" style="width:${Math.round(p.sold/maxSold*100)}%"></div></div>
    </div>
    <div style="text-align:right;">
      <div class="prod-revenue">₹${p.revenue.toLocaleString('en-IN')}</div>
      <div class="prod-sold">${p.sold} sold</div>
    </div>
  </div>`).join('');

/* ===== Stock alerts ===== */
const stockAlerts = [
  { name:'Good Knight Refill', cat:'Household', stock:3, out:false },
  { name:'Moong Dal', cat:'Pulses & Dal', stock:9, out:false },
  { name:'Maida (Refined Flour)', cat:'Atta & Flour', stock:0, out:true },
  { name:'Everest Garam Masala', cat:'Blended Masalas', stock:5, out:false },
  { name:'Fortune Sunflower Oil', cat:'Edible Oils & Ghee', stock:14, out:false },
  { name:'Real Mixed Fruit Juice', cat:'Juices', stock:0, out:true },
];
document.getElementById('stockAlerts').innerHTML = stockAlerts.map(s=>`
  <div class="stock-item">
    <div>
      <div class="stock-name">${s.name}</div>
      <div class="stock-cat">${s.cat}</div>
    </div>
    <span class="stock-count ${s.out?'out':'low'}">${s.out?'Out of stock':`${s.stock} left`}</span>
  </div>`).join('');

/* ===== Activity feed ===== */
const activity = [
  { color:'var(--green)', msg:'<strong>ORD-5821</strong> placed by Priya Sharma — ₹412', time:'10 min ago' },
  { color:'var(--amber)', msg:'<strong>Moong Dal</strong> is running low — 9 units left', time:'25 min ago' },
  { color:'var(--blue)', msg:'Stock updated: <strong>Aashirvaad Atta</strong> restocked to 50 bags', time:'1 hr ago' },
  { color:'var(--danger)', msg:'<strong>ORD-5817</strong> cancelled by Anita Joshi', time:'3 hr ago' },
  { color:'var(--green)', msg:'Payout of <strong>₹24,300</strong> processed successfully', time:'Yesterday' },
  { color:'var(--amber)', msg:'<strong>Maida</strong> is out of stock — update your inventory', time:'Yesterday' },
  { color:'var(--blue)', msg:'New offer created: <strong>10% off Beverages</strong> this weekend', time:'2 days ago' },
];
document.getElementById('activityFeed').innerHTML = activity.map(a=>`
  <div class="feed-item">
    <div class="feed-dot" style="background:${a.color};"></div>
    <div>
      <div class="feed-msg">${a.msg}</div>
      <div class="feed-time">${a.time}</div>
    </div>
  </div>`).join('');

lucide.createIcons();