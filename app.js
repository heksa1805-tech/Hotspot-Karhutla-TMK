const map = L.map("map");
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18, attribution: "&copy; OpenStreetMap"
}).addTo(map);

let pbphLayer, hotspotLayer, allFeatures = [], chart;
const $ = id => document.getElementById(id);
const safe = v => (v === null || v === undefined || v === "") ? "-" : String(v);
const norm = v => String(v ?? "").toLowerCase();

function confidenceClass(v) {
  const c = norm(v);
  if (c === "h" || c === "high") return "h";
  if (c === "n" || c === "nominal" || c === "medium") return "n";
  if (c === "l" || c === "low") return "l";
  return "";
}
function markerColor(v) {
  const c = confidenceClass(v);
  return c === "h" ? "#dc2626" : c === "n" ? "#f97316" : "#eab308";
}
function getFiltered() {
  const c = $("confidence").value;
  const s = $("sensor").value;
  const d = $("dateFilter").value;
  return allFeatures.filter(f => {
    const p = f.properties || {};
    return (!c || confidenceClass(p.confidence) === c) &&
      (!s || p.source === s) &&
      (!d || String(p.acq_date) === d);
  });
}
function render() {
  const features = getFiltered();
  if (hotspotLayer) map.removeLayer(hotspotLayer);
  hotspotLayer = L.geoJSON({type:"FeatureCollection",features}, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: 7, color: "#fff", weight: 1, fillColor: markerColor(f.properties?.confidence), fillOpacity: .92
    }),
    onEachFeature: (f, layer) => {
      const p = f.properties || {};
      const gmaps = `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
      layer.bindPopup(`<b>HOTSPOT KARHUTLA TMK</b><br>Tanggal: ${safe(p.acq_date)}<br>Jam: ${safe(p.acq_time)} UTC<br>Satelit: ${safe(p.satellite)}<br>Sumber: ${safe(p.source)}<br>Confidence: ${safe(p.confidence)}<br>FRP: ${safe(p.frp)} MW<br><a href="${gmaps}" target="_blank" rel="noopener">Buka Google Maps</a>`);
    }
  }).addTo(map);
  $("total").textContent = features.length;
  $("high").textContent = features.filter(f => confidenceClass(f.properties?.confidence) === "h").length;
  const cutoff = new Date(Date.now() - 24*60*60*1000);
  $("last24").textContent = features.filter(f => {
    const p=f.properties||{};
    const t=String(p.acq_time||"").padStart(4,"0");
    const dt=new Date(`${p.acq_date}T${t.slice(0,2)}:${t.slice(2,4)}:00Z`);
    return !isNaN(dt) && dt >= cutoff;
  }).length;
  $("sensors").textContent = new Set(features.map(f=>f.properties?.source).filter(Boolean)).size;
  $("tableInfo").textContent = `${features.length} titik ditampilkan`;
  $("rows").innerHTML = features.slice().sort((a,b)=>
    `${b.properties?.acq_date}${String(b.properties?.acq_time).padStart(4,"0")}`.localeCompare(
    `${a.properties?.acq_date}${String(a.properties?.acq_time).padStart(4,"0")}`)
  ).map(f => {
    const p=f.properties||{}, c=confidenceClass(p.confidence);
    const tag=c ? `<span class="tag tag-${c}">${safe(p.confidence)}</span>` : safe(p.confidence);
    const url=`https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
    return `<tr><td>${safe(p.acq_date)}</td><td>${safe(p.acq_time)}</td><td>${safe(p.latitude)}</td><td>${safe(p.longitude)}</td><td>${safe(p.satellite)}</td><td>${tag}</td><td>${safe(p.frp)}</td><td><a href="${url}" target="_blank" rel="noopener">Peta</a></td></tr>`;
  }).join("") || `<tr><td colspan="8">Tidak ada hotspot sesuai filter.</td></tr>`;
  updateChart(features);
}
function updateChart(features) {
  const counts={};
  features.forEach(f=>{const d=f.properties?.acq_date||"Tidak diketahui";counts[d]=(counts[d]||0)+1;});
  const labels=Object.keys(counts).sort();
  if(chart) chart.destroy();
  chart=new Chart($("trend"),{type:"bar",data:{labels,datasets:[{label:"Hotspot",data:labels.map(x=>counts[x]),backgroundColor:"#26734d",borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
}
async function load() {
  // Load PBPH boundary independently: a missing hotspot file must not hide the map.
  try {
    const pbphRes = await fetch("./data/pbph.geojson?t=" + Date.now());
    if (!pbphRes.ok) throw new Error(`PBPH GeoJSON HTTP ${pbphRes.status}`);
    const pbph = await pbphRes.json();
    if (pbphLayer) map.removeLayer(pbphLayer);
    pbphLayer = L.geoJSON(pbph, {
      style: { color: "#14532d", weight: 3, fillColor: "#86b99a", fillOpacity: .12 }
    }).addTo(map);
    if (pbphLayer.getBounds().isValid()) map.fitBounds(pbphLayer.getBounds(), { padding: [20, 20] });
  } catch (e) {
    console.error("Gagal memuat batas PBPH:", e);
    $("updated").textContent = "Batas PBPH gagal dimuat: " + e.message;
  }

  try {
    const hotRes = await fetch("./data/hotspot.geojson?t=" + Date.now());
    if (!hotRes.ok) throw new Error(`Hotspot GeoJSON HTTP ${hotRes.status}. Pastikan workflow NASA FIRMS sudah membuat file ini.`);
    const hot = await hotRes.json();
    if (hot.type !== "FeatureCollection" || !Array.isArray(hot.features)) {
      throw new Error("Format hotspot.geojson bukan FeatureCollection yang valid.");
    }
    allFeatures = hot.features;
    const sources = [...new Set(allFeatures.map(f => f.properties?.source).filter(Boolean))].sort();
    $("sensor").innerHTML = '<option value="">Semua satelit</option>';
    sources.forEach(s => {
      const o = document.createElement("option"); o.value = s; o.textContent = s; $("sensor").appendChild(o);
    });
    const dates = [...new Set(allFeatures.map(f => f.properties?.acq_date).filter(Boolean))].sort().reverse();
    $("dateFilter").innerHTML = '<option value="">Semua tanggal</option>';
    dates.forEach(d => {
      const o = document.createElement("option"); o.value = d; o.textContent = d; $("dateFilter").appendChild(o);
    });
    render();
    $("updated").textContent = "NASA FIRMS · " + allFeatures.length + " hotspot · Dimuat: " + new Date().toLocaleString("id-ID");
    if (!allFeatures.length) {
      $("tableInfo").textContent = "File tersedia, tetapi belum ada hotspot di dalam polygon PBPH TMK.";
    }
  } catch (e) {
    console.error("Gagal memuat hotspot:", e);
    allFeatures = [];
    render();
    $("tableInfo").textContent = "Data hotspot belum tersedia: " + e.message;
    $("updated").textContent = "Periksa GitHub Actions dan file data/hotspot.geojson.";
  }
}
["confidence","sensor","dateFilter"].forEach(id=>$(id).addEventListener("change",render));
$("reset").addEventListener("click",()=>{$("confidence").value="";$("sensor").value="";$("dateFilter").value="";render();});
$("download").addEventListener("click",()=>{
  const rows=getFiltered();
  if(!rows.length){alert("Tidak ada data untuk diunduh.");return;}
  const cols=[...new Set(rows.flatMap(f=>Object.keys(f.properties||{})))];
  const csv=[cols.join(","),...rows.map(f=>cols.map(k=>JSON.stringify(f.properties?.[k]??"")).join(","))].join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="hotspot_tmk.csv";a.click();URL.revokeObjectURL(a.href);
});
load();
