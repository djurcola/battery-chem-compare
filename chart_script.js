// --- Configuration & Constants ---
const DATA_FILE = 'battery_data.json';
const MOBILE_BREAKPOINT = 768;
const initialVisibleMetricKeys = ['performance', 'lifespan', 'safety', 'powerDensity', 'energyDensity', 'cost'];
const levels = {'Very Low':5,'Low':4,'Medium':3,'High':2,'Very High':1,'Poor':1,'Fair':2,'Moderate':3,'Good':3.5,'Very Good':4.5,'Excellent':5,'Narrow':2,'Wide':4,'Very Wide':5,'Slow':1,'Fast':4,'Very Fast':5,'None':5,'Minor':3,'Significant':1,'Emerging':1,'Developing':2.5,'Mature':4,'Very Mature':5};
const metricMetadata = {cost:{label:'Cost',unit:'$/kWh',higherIsBetter:false},energyDensity:{label:'Energy (Wt)',unit:'Wh/kg',higherIsBetter:true},powerDensity:{label:'Power (Wt)',unit:'W/kg',higherIsBetter:true},safety:{label:'Safety',unit:'Rating',higherIsBetter:true},lifespan:{label:'Lifespan',unit:'Cycles',higherIsBetter:true},performance:{label:'Performance',unit:'Rating',higherIsBetter:true},specificEnergy:{label:'Energy (Vol)',unit:'Wh/L',higherIsBetter:true},roundTripEfficiency:{label:'Efficiency',unit:'%',higherIsBetter:true},operatingTemp:{label:'Temp Range',unit:'Rating',higherIsBetter:true},fastCharge:{label:'Fast Charge',unit:'Rating',higherIsBetter:true},selfDischarge:{label:'Self-Disch.',unit:'%/mo',higherIsBetter:false},materialConcerns:{label:'Material Risk',unit:'Rating',higherIsBetter:false},recyclability:{label:'Recyclability',unit:'Rating',higherIsBetter:true},technologyMaturity:{label:'Maturity',unit:'Rating',higherIsBetter:true},memoryEffect:{label:'Memory Effect',unit:'Rating',higherIsBetter:true}};
const allMetricKeys = Object.keys(metricMetadata);

// --- Global Variables ---
let batteryChart = null;
let loadedBatteryData = [];
let normalizationStats = {};
let allPreNormalizedData = [];
let toggleSwitch = null;
const bodyElement = document.body;
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// --- Helper Functions ---
function getComparableValue(value){if(typeof value==='number'&&isFinite(value))return value;if(typeof value!=='string')return null;if(levels[value]!==undefined)return levels[value];value=value.replace(/,/g,'').trim();const r=value.match(/^(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/);const p=value.match(/^(\d+(\.\d+)?)\+/);const s=value.match(/^(\d+(\.\d+)?)$/);let n=null;if(r)n=(parseFloat(r[1])+parseFloat(r[3]))/2;else if(p)n=parseFloat(p[1]);else if(s)n=parseFloat(s[1]);return(typeof n==='number'&&isFinite(n))?n:null;}
function showError(message){const e=document.getElementById('error-message');if(e){e.textContent=message;e.style.display='block';}const cc=document.getElementById('chart-container');if(cc)cc.style.display='none';const cs=document.getElementById('category-selector');if(cs)cs.style.display='none';}

// --- MODIFIED: getChartOptions accepts theme AND adjusts points for mobile ---
        function getChartOptions(isMobile, theme = 'light') {
            const isDark = theme === 'dark';
            // Read from CSS variables with fallbacks
            const gridColor = bodyElement ? getComputedStyle(bodyElement).getPropertyValue('--chart-grid-color').trim() : (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)');
            const labelColor = bodyElement ? getComputedStyle(bodyElement).getPropertyValue('--chart-label-color').trim() : (isDark ? '#bbb' : '#555');
            const tickColor = bodyElement ? getComputedStyle(bodyElement).getPropertyValue('--chart-tick-color').trim() : (isDark ? '#aaa' : '#666');
            const tooltipBg = bodyElement ? getComputedStyle(bodyElement).getPropertyValue('--chart-tooltip-bg').trim() : (isDark ? 'rgba(240, 240, 240, 0.85)' : 'rgba(0, 0, 0, 0.8)');
            const tooltipColor = bodyElement ? getComputedStyle(bodyElement).getPropertyValue('--chart-tooltip-text').trim() : (isDark ? '#1a1a1a' : 'white');

            return {
                 responsive: true, maintainAspectRatio: true,
                 aspectRatio: isMobile ? 1.0 : 1.8,
                 scales: {
                     r: {
                         min: 0, max: 5, beginAtZero: true,
                         ticks: { stepSize: 1, backdropColor: 'rgba(0,0,0,0)', font: { size: isMobile ? 8 : 9 }, color: tickColor },
                         pointLabels: { font: { size: isMobile ? 8.5 : 10 }, color: labelColor },
                         grid: { color: gridColor }, angleLines: { color: gridColor }
                     }
                 },
                 plugins: {
                     tooltip: {
                         backgroundColor: tooltipBg, titleColor: tooltipColor, bodyColor: tooltipColor,
                         callbacks:{label:function(c){try{const d=c?.chart?.data?.datasets?.[c.datasetIndex];const i=c?.dataIndex;if(d===undefined||i===undefined)return'N/A';const visLbls=c.chart.data.labels||[]; const metricKey=allMetricKeys.find(k=>metricMetadata[k]?.label===visLbls[i]);const originalValIndex=metricKey?allMetricKeys.indexOf(metricKey):-1;const original=originalValIndex!==-1?d?.originalValues?.[originalValIndex]:'N/A';const normalized=c?.parsed?.r;const unit=metricKey?metricMetadata[metricKey]?.unit:null;const chemName=loadedBatteryData[c.datasetIndex]?.name;let l=`${chemName||'?'}: `;if(typeof normalized==='number'){l+=`${normalized.toFixed(1)}\u2605`;if(original!=='N/A'&&unit!=='Rating')l+=` (${original||'?'} ${unit||''})`;else if(original!=='N/A')l+=` (${original||'?'})`;}else l+='N/A';return l;}catch(e){console.error("Tooltip error:",e);return'Error';}}}
                     },
                     legend: {
                         position:'bottom', labels:{font:{size:isMobile?9:10},usePointStyle:true,boxWidth:isMobile?12:15,padding:isMobile?8:10, color: labelColor}
                     }
                 },
                 // --- MODIFIED elements.point section ---
                 elements: {
                     line: {
                         borderWidth: 1.5
                     },
                     point: {
                         radius: isMobile ? 4 : 3,           // Slightly larger points on mobile
                         hoverRadius: isMobile ? 7 : 5,       // Larger hover effect on mobile
                         hitRadius: isMobile ? 20 : 5         // MUCH larger hit radius for touch on mobile
                     }
                 }
                 // --------------------------------------
             };
        }
        // ---------------------------------------------

// --- Function to Pre-calculate ALL Normalized Data ---
function preCalculateNormalization(batterySourceData) { console.log("Pre-calculating normalization...");if(!batterySourceData||batterySourceData.length===0)return[];normalizationStats={};allMetricKeys.forEach(key=>{if(metricMetadata[key]&&metricMetadata[key].unit!=='Rating'){let m=Infinity,x=-Infinity,f=false;batterySourceData.forEach(c=>{if(typeof c==='object'&&c!==null&&c.hasOwnProperty(key)){const v=getComparableValue(c[key]);if(v!==null){m=Math.min(m,v);x=Math.max(x,v);f=true;}}});if(f&&isFinite(m)&&isFinite(x)){normalizationStats[key]={min:m,max:x,range:x-m};}else{normalizationStats[key]={min:0,max:0,range:0};}}});return batterySourceData.map((chem)=>{if(typeof chem!=='object'||chem===null)return null;return allMetricKeys.map(key=>{const r=chem.hasOwnProperty(key)?chem[key]:undefined;const c=getComparableValue(r);let n=null;if(c!==null){const meta=metricMetadata[key];if(meta?.unit==='Rating')n=c;else{const s=normalizationStats[key];if(s&&typeof s.min==='number'&&typeof s.range==='number'&&s.range>0){const sc=(c-s.min)/s.range;const hB=typeof meta?.higherIsBetter==='boolean'?meta.higherIsBetter:true;n=1+4*(hB?sc:(1-sc));}else if(s&&s.min===c&&s.range===0)n=3;}}return(typeof n==='number'&&isFinite(n))?Math.max(1,Math.min(5,n)):null;});}).filter(data=>data!==null);}

// --- Function to create Chart Datasets from PRE-NORMALIZED data ---
function createChartDatasetsFromPreNormalized(visibleKeys, preNormalizedSource) { console.log("Creating datasets. Visible keys:",visibleKeys);if(!preNormalizedSource||preNormalizedSource.length===0||!visibleKeys||visibleKeys.length===0){console.warn("Create datasets: Missing data/keys.");return[];}const visibleIndices=visibleKeys.map(key=>allMetricKeys.indexOf(key)).filter(index=>index!==-1);return preNormalizedSource.map((allPoints,index)=>{if(!allPoints||typeof loadedBatteryData[index]!=='object')return null;const visibleDataPoints=visibleIndices.map(idx=>allPoints[idx]);const chem=loadedBatteryData[index];const hue=(index*(360/loadedBatteryData.length))%360;const color=`hsl(${hue}, 70%, 55%)`;const datasetLabel=`${chem.name||'Unk'} (${chem.fullName||''})`;const originalValues=allMetricKeys.map(key=>chem.hasOwnProperty(key)?String(chem[key]):'N/A');return{label:datasetLabel,data:visibleDataPoints,borderColor:color,backgroundColor:`hsla(${hue},70%,60%,0.2)`,pointBackgroundColor:color,pointBorderColor:'#fff',pointHoverBackgroundColor:'#fff',pointHoverBorderColor:color,originalValues:originalValues};}).filter(ds=>ds!==null);}

// --- Get Selected Categories ---
function getSelectedCategories(){const c=document.querySelectorAll('#category-selector input[name="category"]:checked');const s=Array.from(c).map(cb=>cb.value);return allMetricKeys.filter(k=>s.includes(k));}

// --- Apply Theme ---
function applyTheme(theme) {
     console.log(`Applying theme: ${theme}`);
     bodyElement.classList.toggle('dark-mode', theme === 'dark');
     if (toggleSwitch) toggleSwitch.checked = (theme === 'dark');
     if (batteryChart) {
         console.log(`Updating chart for ${theme} theme.`);
         const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
         // --- CRITICAL: Assign the *entire* new options object ---
         batteryChart.options = getChartOptions(isMobile, theme);
         // --- Then call update ---
         batteryChart.update();
     }
 }

// --- Main Setup Function (Async) ---
async function initializeChart() {
     toggleSwitch = document.getElementById('dark-mode-toggle');
    try {
         let initialTheme = 'light';
         try { const sT=localStorage.getItem('theme'); if(sT==='dark'||sT==='light')initialTheme=sT;else if(systemPrefersDark.matches)initialTheme='dark'; }
         catch(e){ console.error("LS Error:",e); if(systemPrefersDark.matches)initialTheme='dark'; }
         bodyElement.classList.toggle('dark-mode', initialTheme === 'dark');
         if(toggleSwitch)toggleSwitch.checked=(initialTheme==='dark');
         console.log(`Initial theme: ${initialTheme}`);

        console.log("Fetching data...");
         const response = await fetch(DATA_FILE); if(!response.ok)throw new Error(`HTTP ${response.status}`); try{loadedBatteryData=await response.json();}catch(e){throw new Error(`Parse Err: ${e}`);} if(!Array.isArray(loadedBatteryData)||!loadedBatteryData.length)throw new Error(`Data invalid`);

        console.log("Pre-calculating normalization...");
         allPreNormalizedData = preCalculateNormalization(loadedBatteryData); if(!allPreNormalizedData||allPreNormalizedData.length!==loadedBatteryData.length)throw new Error("Norm failed.");

        console.log("Populating categories...");
         const optionsContainer = document.querySelector('#category-selector .category-options'); if(!optionsContainer)throw new Error("Cat cont missing"); optionsContainer.innerHTML=''; allMetricKeys.forEach(key=>{const mi=metricMetadata[key];if(!mi)return;const iC=initialVisibleMetricKeys.includes(key);const cI=`check-${key}`;const l=document.createElement('label');l.htmlFor=cI;l.title=`${mi.label}(${mi.unit||'Rat'})`;const ip=document.createElement('input');ip.type='checkbox';ip.id=cI;ip.name='category';ip.value=key;ip.checked=iC;l.appendChild(ip);l.appendChild(document.createTextNode(` ${mi.label}`));optionsContainer.appendChild(l);});
         document.getElementById('category-selector')?.addEventListener('change', handleCategoryChange);

        console.log("Getting initial categories...");
         let currentVisibleKeys = getSelectedCategories(); if(currentVisibleKeys.length<3){currentVisibleKeys=initialVisibleMetricKeys;currentVisibleKeys.forEach(k=>{const c=document.getElementById(`check-${k}`);if(c)c.checked=true;});} let currentVisibleLabels = currentVisibleKeys.map(key => metricMetadata[key]?.label || key);

        console.log("Creating initial datasets...");
         let currentDatasets = createChartDatasetsFromPreNormalized(currentVisibleKeys, allPreNormalizedData); if(!currentDatasets||!currentDatasets.length){throw new Error("Dataset creation failed.");}

        console.log("Configuring chart...");
        const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
        const chartConfig = { type: 'radar', data: { labels: currentVisibleLabels, datasets: currentDatasets }, options: getChartOptions(isMobile, initialTheme) };

        console.log("Rendering chart...");
         const ctx = document.getElementById('batteryStarChart')?.getContext('2d'); if(!ctx)throw new Error("Canvas ctx failed."); if(batteryChart)batteryChart.destroy(); batteryChart = new Chart(ctx, chartConfig); console.log("Chart rendered.");

    } catch (error) { console.error("Init Error:", error); showError(`Init failed: ${error.message||'Unknown'}`); }
}

// --- Handle Category Change ---
function handleCategoryChange(event){if(!batteryChart||!allPreNormalizedData?.length){console.warn("Chart/Data not ready.");return;}const newVisibleKeys=getSelectedCategories();if(newVisibleKeys.length<3){if(event?.target instanceof HTMLInputElement){event.target.checked=true;}alert("Need >= 3 cats.");return;}console.log("Category changed. Keys:",newVisibleKeys);const newVisibleLabels=newVisibleKeys.map(key=>metricMetadata[key]?.label||key);const newDatasets=createChartDatasetsFromPreNormalized(newVisibleKeys,allPreNormalizedData);if(!newDatasets||newDatasets.length!==loadedBatteryData.length||newDatasets.some(ds=>ds.data.length!==newVisibleKeys.length)){console.error("Dataset regen failed.");showError("Err updating cats.");return;}batteryChart.data.labels=newVisibleLabels;batteryChart.data.datasets=newDatasets;console.log("Updating chart...");batteryChart.update();console.log("Chart update complete.");}

// --- Run Initialization on Load ---
document.addEventListener('DOMContentLoaded', () => { console.log("DOM Ready. Initializing chart..."); initializeChart(); });

// --- Theme Event Listeners (AFTER DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    toggleSwitch = document.getElementById('dark-mode-toggle'); // Assign toggleSwitch reliably here
    if (toggleSwitch) {
         toggleSwitch.addEventListener('change', () => {
             const newTheme = toggleSwitch.checked ? 'dark' : 'light';
             applyTheme(newTheme); // Apply visual changes
             try { localStorage.setItem('theme', newTheme); }
             catch (e) { console.error("LS Error saving theme:", e); }
         });
     } else { console.warn("Dark mode toggle not found after DOM load."); }

    try {
         systemPrefersDark.addEventListener('change', (event) => {
            console.log("System theme pref changed."); try { if (!localStorage.getItem('theme')) { const newTheme = event.matches ? 'dark' : 'light'; applyTheme(newTheme); } } catch (e) { console.error("LS Error reading theme:", e); } });
    } catch (e) { console.warn("Error adding system theme listener:", e); }
});

        // --- Resize Handler (Revised Logic) ---
        let resizeTimeout;
        window.addEventListener('resize', () => {
             clearTimeout(resizeTimeout);
             resizeTimeout = setTimeout(() => {
                 if (batteryChart) {
                     try {
                         console.log("Resize handler triggered.");
                         const currentTheme = bodyElement.classList.contains('dark-mode') ? 'dark' : 'light';
                         const isMobile = window.innerWidth < MOBILE_BREAKPOINT;

                         // Get the *potentially* new options based on current state
                         const newOptions = getChartOptions(isMobile, currentTheme);

                         // --- Update ONLY the necessary options properties ---
                         let optionsChanged = false;

                         // 1. Update Aspect Ratio if needed
                         if (batteryChart.options.aspectRatio !== newOptions.aspectRatio) {
                              console.log(`Updating aspectRatio to ${newOptions.aspectRatio}`);
                              batteryChart.options.aspectRatio = newOptions.aspectRatio;
                              optionsChanged = true;
                         }

                         // 2. Update Color-related options (Check if they actually changed - might be overkill but safer)
                         // Example for ticks color:
                         if (batteryChart.options.scales.r.ticks.color !== newOptions.scales.r.ticks.color) {
                              console.log("Updating ticks color");
                              batteryChart.options.scales.r.ticks.color = newOptions.scales.r.ticks.color;
                              optionsChanged = true;
                         }
                         // You would ideally update all other theme-dependent colors similarly:
                         batteryChart.options.scales.r.pointLabels.color = newOptions.scales.r.pointLabels.color;
                         batteryChart.options.scales.r.grid.color = newOptions.scales.r.grid.color;
                         batteryChart.options.scales.r.angleLines.color = newOptions.scales.r.angleLines.color;
                         batteryChart.options.plugins.legend.labels.color = newOptions.plugins.legend.labels.color;
                         batteryChart.options.plugins.tooltip.backgroundColor = newOptions.plugins.tooltip.backgroundColor;
                         batteryChart.options.plugins.tooltip.titleColor = newOptions.plugins.tooltip.titleColor;
                         batteryChart.options.plugins.tooltip.bodyColor = newOptions.plugins.tooltip.bodyColor;

                        // 3. Update Font sizes / Point sizes if they differ based on 'isMobile'
                        if (batteryChart.options.scales.r.ticks.font.size !== newOptions.scales.r.ticks.font.size) {
                             batteryChart.options.scales.r.ticks.font.size = newOptions.scales.r.ticks.font.size;
                             optionsChanged = true;
                        }
                        // ... update other size-dependent fonts/points similarly ...
                         batteryChart.options.scales.r.pointLabels.font.size = newOptions.scales.r.pointLabels.font.size;
                         batteryChart.options.plugins.legend.labels.font.size = newOptions.plugins.legend.labels.font.size;
                         batteryChart.options.plugins.legend.labels.boxWidth = newOptions.plugins.legend.labels.boxWidth;
                         batteryChart.options.plugins.legend.labels.padding = newOptions.plugins.legend.labels.padding;
                         batteryChart.options.elements.point.radius = newOptions.elements.point.radius;
                         batteryChart.options.elements.point.hoverRadius = newOptions.elements.point.hoverRadius;
                        // --- End updating options ---


                         // --- Call resize() ---
                         // resize() should pick up the changes made directly to batteryChart.options
                         console.log("Calling chart.resize()");
                         batteryChart.resize();

                         // Optional: Force an update *after* resize if direct option changes aren't picked up by resize alone
                         // if (optionsChanged) {
                         //     console.log("Forcing update after resize");
                         //     batteryChart.update('none');
                         // }


                     } catch (e) { console.error("Error during resize handler:", e); }
                 } else {
                     console.log("Resize handler: Chart not ready.");
                 }
             }, 250); // Debounce
         });
        // ------------------------------------------------------
