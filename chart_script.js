// --- START OF FILE chart_script.js ---

// --- Configuration & Constants ---
const DATA_FILE = 'battery_data.json';
const METADATA_FILE = 'metric_metadata.json';
const MOBILE_BREAKPOINT = 768;
const initialVisibleMetricKeys = ['performance', 'lifespan', 'safety', 'powerDensity', 'energyDensity', 'cost'];
// prettier-ignore
const levels = {'Very Low':5,'Low':4,'Medium':3,'High':2,'Very High':1,'Poor':1,'Fair':2,'Moderate':3,'Good':3.5,'Very Good':4.5,'Excellent':5,'Narrow':2,'Wide':4,'Very Wide':5,'Slow':1,'Fast':4,'Very Fast':5,'None':5,'Minor':3,'Significant':1,'Emerging':1,'Developing':2.5,'Mature':4,'Very Mature':5};
// --- NEW: Metrics to show in the comparison view ---
const comparisonMetrics = [
    'cost',
    'energyDensity',
    'powerDensity',
    'specificEnergy', // Volumetric energy density
    'lifespan',
    'safety',
    'roundTripEfficiency',
    'fastCharge',
    'operatingTemp',
    'selfDischarge',
    'materialConcerns',
    'technologyMaturity'
];


// --- Global Variables ---
let batteryChart = null;
let loadedBatteryData = [];
let metricMetadata = null;
let allMetricKeys = [];
let normalizationStats = {};
let allPreNormalizedData = [];
let toggleSwitch = null;
const bodyElement = document.body;
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
let categoryTooltipElement = null;

// --- Globals for Details Section ---
let batterySelectorListElement = null;
let batteryDetailsContentElement = null;
let selectedBatteryIndices = []; // <-- NEW: Track selected indices (0, 1, or 2)
// ------------------------------------


// --- Helper Functions --- (getComparableValue, showError, getChartOptions remain the same)
// prettier-ignore
//function getComparableValue(value){if(typeof value==='number'&&isFinite(value))return value;if(typeof value!=='string')return null;if(levels[value]!==undefined)return levels[value];value=value.replace(/,/g,'').trim();const r=value.match(/^(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/);const p=value.match(/^(\d+(\.\d+)?)\+/);const s=value.match(/^(\d+(\.\d+)?)$/);let n=null;if(r)n=(parseFloat(r[1])+parseFloat(r[3]))/2;else if(p)n=parseFloat(p[1]);else if(s)n=parseFloat(s[1]);return(typeof n==='number'&&isFinite(n))?n:null;}
function getComparableValue(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    // --- START NEW TEMP RANGE HANDLING ---
    // Regex to match "MIN to MAX" format, allowing optional decimals and negative MIN/MAX
    const tempRangeRegex = /^(-?\d+(?:\.\d+)?)\s*to\s*(-?\d+(?:\.\d+)?)$/i; // Using "to"
    const tempMatch = value.match(tempRangeRegex);

    if (tempMatch) {
        const minTemp = parseFloat(tempMatch[1]);
        const maxTemp = parseFloat(tempMatch[2]);
        if (!isNaN(minTemp) && !isNaN(maxTemp) && maxTemp >= minTemp) {
            // Return the WIDTH of the range - OR return the raw string for display?
            // For comparison, maybe the raw string is better. Let's keep parsing for normalization only.
            // Let's return the string itself if it's a range, but parse for *other* metrics
             // return value; // Keep original string for display
             // Let's keep parsing it to a comparable value *for now* for normalization consistency
             return maxTemp - minTemp; // Return range width for normalization
        }
    }
    // --- END NEW TEMP RANGE HANDLING ---


    // Existing levels lookup (will no longer match "Moderate", etc. for temp)
    if (levels[value] !== undefined) return levels[value];

    // Existing numeric/range parsing (keep for other metrics)
    //value = value.replace(/,/g, '').trim();
    // Clean up the string: remove commas, percent signs, and trim whitespace
    value = value.replace(/,/g, '').replace(/%/g, '').trim();
    const r = value.match(/^(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/); // Original range regex (doesn't handle negatives well)
    const p = value.match(/^(\d+(\.\d+)?)\+/);
    const s = value.match(/^(\d+(\.\d+)?)$/);
    let n = null;
    if (r) n = (parseFloat(r[1]) + parseFloat(r[3])) / 2;
    else if (p) n = parseFloat(p[1]);
    else if (s) n = parseFloat(s[1]);

    return (typeof n === 'number' && isFinite(n)) ? n : null;
}

// Helper to safely get data, returning 'N/A' if missing
function getBatteryValue(battery, key) {
    return battery && battery.hasOwnProperty(key) ? battery[key] : 'N/A';
}


function showError(message){const e=document.getElementById('error-message');if(e){e.textContent=message;e.style.display='block';}const cc=document.getElementById('chart-container');if(cc)cc.style.display='none';const cs=document.getElementById('category-selector');if(cs)cs.style.display='none';}
function getChartOptions(isMobile, theme = 'light') { /* ... (keep existing code) ... */
    const isDark = theme === 'dark';
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
                 callbacks:{label:function(c){try{
                     if (!metricMetadata || !allMetricKeys.length) return 'Loading...';
                     const d=c?.chart?.data?.datasets?.[c.datasetIndex];const i=c?.dataIndex;if(d===undefined||i===undefined)return'N/A';const visLbls=c.chart.data.labels||[]; const metricKey=allMetricKeys.find(k=>metricMetadata[k]?.label===visLbls[i]);const originalValIndex=metricKey?allMetricKeys.indexOf(metricKey):-1;const original=originalValIndex!==-1?d?.originalValues?.[originalValIndex]:'N/A';const normalized=c?.parsed?.r;const unit=metricKey?metricMetadata[metricKey]?.unit:null;const chemName=loadedBatteryData[c.datasetIndex]?.name;let l=`${chemName||'?'}: `;if(typeof normalized==='number'){l+=`${normalized.toFixed(1)}\u2605`;if(original!=='N/A'&&unit!=='Rating')l+=` (${original||'?'} ${unit||''})`;else if(original!=='N/A')l+=` (${original||'?'})`;}else l+='N/A';return l;}catch(e){console.error("Tooltip error:",e);return'Error';}}}
             },
             legend: {
                 position:'bottom', labels:{font:{size:isMobile?9:10},usePointStyle:true,boxWidth:isMobile?12:15,padding:isMobile?8:10, color: labelColor}
             }
         },
         elements: {
             line: {
                 borderWidth: 1.5
             },
             point: {
                 radius: isMobile ? 4 : 3,
                 hoverRadius: isMobile ? 7 : 5,
                 hitRadius: isMobile ? 20 : 5
             }
         }
     };
}


// --- preCalculateNormalization, createChartDatasetsFromPreNormalized, getSelectedCategories, applyTheme (no changes needed) ---
function preCalculateNormalization(batterySourceData) { /* ... (keep existing code) ... */ console.log("Pre-calculating normalization...");if (!metricMetadata || !allMetricKeys.length || !batterySourceData || batterySourceData.length === 0) { console.error("Cannot pre-calculate normalization: Metadata or battery data missing."); return []; } normalizationStats = {}; allMetricKeys.forEach(key => { if (metricMetadata[key] && metricMetadata[key].unit !== 'Rating') { let m = Infinity, x = -Infinity, f = false; batterySourceData.forEach(c => { if (typeof c === 'object' && c !== null && c.hasOwnProperty(key)) { const v = getComparableValue(c[key]); if (v !== null) { m = Math.min(m, v); x = Math.max(x, v); f = true; } } }); if (f && isFinite(m) && isFinite(x)) { normalizationStats[key] = { min: m, max: x, range: x - m }; } else { normalizationStats[key] = { min: 0, max: 0, range: 0 }; } } }); return batterySourceData.map((chem) => { if (typeof chem !== 'object' || chem === null) return null; return allMetricKeys.map(key => { const r = chem.hasOwnProperty(key) ? chem[key] : undefined; const c = getComparableValue(r); let n = null; if (c !== null) { const meta = metricMetadata[key]; if (meta?.unit === 'Rating') n = c; else { const s = normalizationStats[key]; if (s && typeof s.min === 'number' && typeof s.range === 'number' && s.range > 0) { const sc = (c - s.min) / s.range; const hB = typeof meta?.higherIsBetter === 'boolean' ? meta.higherIsBetter : true; n = 1 + 4 * (hB ? sc : (1 - sc)); } else if (s && s.min === c && s.range === 0) n = 3; } } return (typeof n === 'number' && isFinite(n)) ? Math.max(1, Math.min(5, n)) : null; }); }).filter(data => data !== null); }
function createChartDatasetsFromPreNormalized(visibleKeys, preNormalizedSource) { /* ... (keep existing code) ... */ console.log("Creating datasets. Visible keys:",visibleKeys);if (!metricMetadata || !allMetricKeys.length || !preNormalizedSource || preNormalizedSource.length === 0 || !visibleKeys || visibleKeys.length === 0){console.warn("Create datasets: Missing data/keys/metadata.");return[];}const visibleIndices=visibleKeys.map(key=>allMetricKeys.indexOf(key)).filter(index=>index!==-1);return preNormalizedSource.map((allPoints,index)=>{if(!allPoints||typeof loadedBatteryData[index]!=='object')return null;const visibleDataPoints=visibleIndices.map(idx=>allPoints[idx]);const chem=loadedBatteryData[index];const hue=(index*(360/loadedBatteryData.length))%360;const color=`hsl(${hue}, 70%, 55%)`;const datasetLabel=`${chem.name||'Unk'} (${chem.fullName||''})`;const originalValues=allMetricKeys.map(key=>chem.hasOwnProperty(key)?String(chem[key]):'N/A');return{label:datasetLabel,data:visibleDataPoints,borderColor:color,backgroundColor:`hsla(${hue},70%,60%,0.2)`,pointBackgroundColor:color,pointBorderColor:'#fff',pointHoverBackgroundColor:'#fff',pointHoverBorderColor:color,originalValues:originalValues};}).filter(ds=>ds!==null);}
function getSelectedCategories(){const c=document.querySelectorAll('#category-selector input[name="category"]:checked');const s=Array.from(c).map(cb=>cb.value);return allMetricKeys.filter(k=>s.includes(k));}
function applyTheme(theme) { /* ... (keep existing code) ... */ console.log(`Applying theme: ${theme}`); bodyElement.classList.toggle('dark-mode', theme === 'dark'); if (toggleSwitch) toggleSwitch.checked = (theme === 'dark'); if (batteryChart) { console.log(`Updating chart for ${theme} theme.`); const isMobile = window.innerWidth < MOBILE_BREAKPOINT; batteryChart.options = getChartOptions(isMobile, theme); batteryChart.update(); } }


// --- Main Setup Function (Async) ---
async function initializeChart() {
     toggleSwitch = document.getElementById('dark-mode-toggle');
     categoryTooltipElement = document.getElementById('category-tooltip');

     batterySelectorListElement = document.getElementById('battery-selector-list');
     batteryDetailsContentElement = document.getElementById('battery-details-content');

    // --- Set initial placeholder message ---
    if (batteryDetailsContentElement) {
        batteryDetailsContentElement.innerHTML = '<p class="placeholder">Select one or two batteries from the list above to see details or a comparison.</p>';
        batteryDetailsContentElement.style.display = 'grid'; // Ensure it's visible initially
    }
    // ---------------------------------------

    try {
         // ... (Theme initialization remains the same) ...
         let initialTheme = 'light';
         try { const sT=localStorage.getItem('theme'); if(sT==='dark'||sT==='light')initialTheme=sT;else if(systemPrefersDark.matches)initialTheme='dark'; }
         catch(e){ console.error("LS Error:",e); if(systemPrefersDark.matches)initialTheme='dark'; }
         bodyElement.classList.toggle('dark-mode', initialTheme === 'dark');
         if(toggleSwitch)toggleSwitch.checked=(initialTheme==='dark');
         console.log(`Initial theme: ${initialTheme}`);


        console.log("Fetching data and metadata...");
         // ... (Data and Metadata fetching remains the same) ...
         const [dataResponse, metadataResponse] = await Promise.all([
             fetch(DATA_FILE), fetch(METADATA_FILE)
         ]);

        if (!dataResponse.ok) throw new Error(`HTTP error loading battery data: ${dataResponse.status}`);
        try { loadedBatteryData = await dataResponse.json(); } catch (e) { throw new Error(`Parse Err loading battery data: ${e}`); }
        if (!Array.isArray(loadedBatteryData) || !loadedBatteryData.length) throw new Error(`Battery data invalid`);

        if (!metadataResponse.ok) throw new Error(`HTTP error loading metadata: ${metadataResponse.status}`);
        try { metricMetadata = await metadataResponse.json(); } catch (e) { throw new Error(`Parse Err loading metadata: ${e}`); }
        if (typeof metricMetadata !== 'object' || metricMetadata === null || Object.keys(metricMetadata).length === 0) throw new Error(`Metric metadata invalid`);

        allMetricKeys = Object.keys(metricMetadata);
        console.log("Metadata loaded, keys:", allMetricKeys);


        console.log("Populating battery selector..."); // Moved up slightly
        populateBatterySelectorList(); // Populate before normalization (doesn't depend on it)


        console.log("Pre-calculating normalization...");
        allPreNormalizedData = preCalculateNormalization(loadedBatteryData);
        if (!allPreNormalizedData || allPreNormalizedData.length !== loadedBatteryData.length) throw new Error("Normalization failed.");

        console.log("Populating categories...");
        // ... (Category population remains the same) ...
        const optionsContainer = document.querySelector('#category-selector .category-options');
        if (!optionsContainer) throw new Error("Category container missing");
        optionsContainer.innerHTML = '';
        allMetricKeys.forEach(key => {
            const mi = metricMetadata[key];
            if (!mi) return;
            const iC = initialVisibleMetricKeys.includes(key);
            const cI = `check-${key}`;
            const l = document.createElement('label');
            l.htmlFor = cI;
            //l.title = mi.description || `${mi.label} (${mi.unit || 'Rating'})`;
            const ip = document.createElement('input');
            ip.type = 'checkbox';
            ip.id = cI;
            ip.name = 'category';
            ip.value = key;
            ip.checked = iC;
            l.dataset.metricKey = key;
            l.appendChild(ip);
            l.appendChild(document.createTextNode(` ${mi.label}`));
            optionsContainer.appendChild(l);
        });

        setupCategoryTooltips(optionsContainer);
        document.getElementById('category-selector')?.addEventListener('change', handleCategoryChange);


        console.log("Getting initial categories...");
         // ... (Initial category selection remains the same) ...
         let currentVisibleKeys = getSelectedCategories();
         if (currentVisibleKeys.length < 3) { currentVisibleKeys = initialVisibleMetricKeys; currentVisibleKeys.forEach(k => { const c = document.getElementById(`check-${k}`); if (c) c.checked = true; }); }
         let currentVisibleLabels = currentVisibleKeys.map(key => metricMetadata[key]?.label || key);


        console.log("Creating initial datasets...");
         // ... (Initial dataset creation remains the same) ...
         let currentDatasets = createChartDatasetsFromPreNormalized(currentVisibleKeys, allPreNormalizedData);
         if (!currentDatasets || !currentDatasets.length) { throw new Error("Dataset creation failed."); }


        console.log("Configuring chart...");
        // ... (Chart configuration and rendering remains the same) ...
        const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
        const chartConfig = { type: 'radar', data: { labels: currentVisibleLabels, datasets: currentDatasets }, options: getChartOptions(isMobile, initialTheme) };

        console.log("Rendering chart...");
         const ctx = document.getElementById('batteryStarChart')?.getContext('2d');
         if (!ctx) throw new Error("Canvas context failed.");
         if (batteryChart) batteryChart.destroy();
         batteryChart = new Chart(ctx, chartConfig);
         console.log("Chart rendered.");


    } catch (error) {
        console.error("Initialization Error:", error);
        showError(`Initialization failed: ${error.message || 'Unknown error'}`);
    }
}

// --- Handle Category Change (no changes needed) ---
function handleCategoryChange(event) { /* ... (keep existing code) ... */ if (!batteryChart || !allPreNormalizedData?.length || !loadedBatteryData?.length || !metricMetadata || !allMetricKeys.length) { console.warn("Chart/Data/Metadata not ready for category change."); return; } const newVisibleKeys = getSelectedCategories(); if (newVisibleKeys.length < 3) { if (event?.target instanceof HTMLInputElement && !event.target.checked) { event.target.checked = true; } alert("Please select at least 3 categories to compare."); return; } console.log("Category changed. New visible keys:", newVisibleKeys); const newVisibleLabels = newVisibleKeys.map(key => metricMetadata[key]?.label || key); const visibleIndices = newVisibleKeys.map(key => allMetricKeys.indexOf(key)).filter(index => index !== -1); let updateError = false; try { if (batteryChart.data.datasets.length !== allPreNormalizedData.length) { throw new Error("Mismatch between chart datasets and pre-normalized data length."); } batteryChart.data.datasets.forEach((dataset, index) => { const fullDataRow = allPreNormalizedData[index]; if (!fullDataRow) { console.warn(`No pre-normalized data found for dataset index ${index}`); return; } const newVisibleDataPoints = visibleIndices.map(idx => fullDataRow[idx]); dataset.data = newVisibleDataPoints; }); } catch (error) { console.error("Error updating dataset data:", error); showError("Error updating chart with new categories."); updateError = true; } if (updateError) return; batteryChart.data.labels = newVisibleLabels; console.log("Updating chart with new category data..."); batteryChart.update(); console.log("Chart update complete."); }


// --- MODIFIED Functions for Battery Details Section ---

function populateBatterySelectorList() {
    if (!batterySelectorListElement || !loadedBatteryData?.length) {
        console.warn("Battery selector list element or data not ready.");
        if(batterySelectorListElement) batterySelectorListElement.innerHTML = '<span class="placeholder">No battery data found.</span>';
        return;
    }

    batterySelectorListElement.innerHTML = ''; // Clear placeholder/previous items

    loadedBatteryData.forEach((battery, index) => {
        const item = document.createElement('span'); // Use span or div
        item.classList.add('battery-select-item');
        item.textContent = battery.name || 'Unknown';
        item.dataset.batteryIndex = index; // Store index to retrieve data on click
        batterySelectorListElement.appendChild(item);
    });

    // Add click listener using event delegation
    batterySelectorListElement.removeEventListener('click', handleBatterySelection); // Remove previous if any
    batterySelectorListElement.addEventListener('click', handleBatterySelection);
}

function handleBatterySelection(event) {
    const target = event.target;
    if (!target.classList.contains('battery-select-item')) return; // Clicked outside an item

    const clickedIndex = parseInt(target.dataset.batteryIndex, 10);
    if (isNaN(clickedIndex)) return;

    const currentlySelectedIndex = selectedBatteryIndices.indexOf(clickedIndex);

    if (currentlySelectedIndex > -1) {
        // Clicked an already selected item - DESELECT it
        selectedBatteryIndices.splice(currentlySelectedIndex, 1);
    } else {
        // Clicked a new item - SELECT it
        if (selectedBatteryIndices.length >= 2) {
            // Already have two selected, remove the FIRST one added (FIFO)
            selectedBatteryIndices.shift();
        }
        selectedBatteryIndices.push(clickedIndex);
    }

    // Update visual selection state for ALL items
    const allItems = batterySelectorListElement.querySelectorAll('.battery-select-item');
    allItems.forEach(item => {
        const itemIndex = parseInt(item.dataset.batteryIndex, 10);
        if (selectedBatteryIndices.includes(itemIndex)) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    // Update the details content area based on the new selection state
    updateDetailsDisplay();
}

// NEW function to decide what to display (placeholder, single view, comparison view)
function updateDetailsDisplay() {
    if (!batteryDetailsContentElement || !loadedBatteryData || !metricMetadata) return;

    const selectedCount = selectedBatteryIndices.length;

    // Reset class FIRST
    batteryDetailsContentElement.className = 'details-content';

    switch (selectedCount) {
        case 0:
            batteryDetailsContentElement.innerHTML = '<p class="placeholder">Select one or two batteries from the list above to see details or a comparison.</p>';
            break;
        case 1:
            const battery1 = loadedBatteryData[selectedBatteryIndices[0]];
            batteryDetailsContentElement.innerHTML = generateSingleBatteryHTML(battery1);
            break;
        case 2:
            const batteryA = loadedBatteryData[selectedBatteryIndices[0]];
            const batteryB = loadedBatteryData[selectedBatteryIndices[1]];
            batteryDetailsContentElement.innerHTML = generateComparisonHTML(batteryA, batteryB);
            // === RESTORE THIS LINE ===
            // Apply the comparison view class to trigger the grid CSS
            batteryDetailsContentElement.classList.add('comparison-view');
            // === END RESTORED LINE ===
            break;
        default:
             batteryDetailsContentElement.innerHTML = '<p class="placeholder">An error occurred.</p>';
    }

    //batteryDetailsContentElement.style.display = 'block';
}

// REVISED: Generates HTML for a SINGLE battery (extracted from old display function)
function generateSingleBatteryHTML(battery) {
    if (!battery) return '<p>Battery data not found.</p>';

    let useCasesHTML = 'Not specified';
    if (Array.isArray(battery.useCases) && battery.useCases.length > 0) {
        useCasesHTML = `<ul>${battery.useCases.map(use => `<li>${use}</li>`).join('')}</ul>`;
    } else if (battery.useCases) { // Handle case where it might be a string
        useCasesHTML = `<p>${getBatteryValue(battery, 'useCases')}</p>`;
    }

    return `
        <h4>Full Name</h4>
        <p>${getBatteryValue(battery, 'fullName')}</p>
        <h4>Description</h4>
        <p>${getBatteryValue(battery, 'description')}</p>
        <h4>Common Use Cases</h4>
        ${useCasesHTML}
        <h4>Operating Range</h4>
        <p>Temperature: ${getBatteryValue(battery, 'operatingTemp')}°C.<br>
        ${getBatteryValue(battery, 'temperatureDetails')}</p>
    `;
}

// NEW: Generates HTML for the side-by-side comparison
/*function generateComparisonHTML(battery1, battery2) {
    if (!battery1 || !battery2 || !metricMetadata) {
        return '<p>Error generating comparison data.</p>';
    }

    let comparisonHTML = '';

    // Add Headers
    comparisonHTML += `<div class="comparison-header">Metric</div>`;
    comparisonHTML += `<div class="comparison-header">${getBatteryValue(battery1, 'name')}</div>`;
    comparisonHTML += `<div class="comparison-header">${getBatteryValue(battery2, 'name')}</div>`;

    // Add Rows for each metric
    comparisonMetrics.forEach(key => {
        const meta = metricMetadata[key];
        if (!meta) return; // Skip if metadata not found for this key

        const value1 = getBatteryValue(battery1, key);
        const value2 = getBatteryValue(battery2, key);
        const unit = meta.unit && meta.unit !== 'Rating' ? ` (${meta.unit})` : '';

        comparisonHTML += `<div class="comparison-metric-label">${meta.label}${unit}</div>`;
        comparisonHTML += `<div class="comparison-metric-value">${value1}</div>`;
        comparisonHTML += `<div class="comparison-metric-value">${value2}</div>`;
    });

    return comparisonHTML;
}*/

function generateComparisonHTML(battery1, battery2) {
    if (!battery1 || !battery2 || !metricMetadata) {
        return '<p>Error generating comparison data.</p>';
    }

    let comparisonHTML = '';

    // Add Headers for the Grid Columns
    comparisonHTML += `<div class="comparison-header">Metric</div>`; // Column 1 Header
    comparisonHTML += `<div class="comparison-header">${getBatteryValue(battery1, 'name')}</div>`; // Column 2 Header
    comparisonHTML += `<div class="comparison-header">${getBatteryValue(battery2, 'name')}</div>`; // Column 3 Header

    // Add Rows for each metric (3 grid items per metric)
    comparisonMetrics.forEach(key => {
        const meta = metricMetadata[key];
        if (!meta) return; // Skip if metadata not found for this key

        const value1 = getBatteryValue(battery1, key);
        const value2 = getBatteryValue(battery2, key);
        const unit = meta.unit && meta.unit !== 'Rating' ? ` (${meta.unit})` : '';

        // Grid Item 1: Metric Label
        comparisonHTML += `<div class="comparison-metric-label">${meta.label}${unit}</div>`;
        // Grid Item 2: Value for Battery 1
        comparisonHTML += `<div class="comparison-metric-value">${value1}</div>`;
        // Grid Item 3: Value for Battery 2
        comparisonHTML += `<div class="comparison-metric-value">${value2}</div>`;
    });

    return comparisonHTML;
}


// --- OLD function, now replaced by updateDetailsDisplay, generateSingleBatteryHTML, generateComparisonHTML ---
// function displayBatteryDetails(battery) { ... } // DELETE or COMMENT OUT this old function


// --- Run Initialization on Load ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Ready. Initializing chart...");
    initializeChart(); // This now also gets the tooltip element and calls setupCategoryTooltips
});

// --- Theme Event Listeners --- (No changes needed here)
document.addEventListener('DOMContentLoaded', () => { /* ... (keep existing code) ... */
    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) {
         toggle.addEventListener('change', () => {
             const newTheme = toggle.checked ? 'dark' : 'light';
             applyTheme(newTheme);
             try { localStorage.setItem('theme', newTheme); }
             catch (e) { console.error("LS Error saving theme:", e); }
         });
     } else { console.warn("Dark mode toggle not found after DOM load."); }

    try {
         systemPrefersDark.addEventListener('change', (event) => {
            console.log("System theme pref changed."); try { if (!localStorage.getItem('theme')) { const newTheme = event.matches ? 'dark' : 'light'; applyTheme(newTheme); } } catch (e) { console.error("LS Error reading theme:", e); } });
    } catch (e) { console.warn("Error adding system theme listener:", e); }
});


// --- Category Tooltip Functions --- (No changes needed here)
function setupCategoryTooltips(container) { /* ... (keep existing code) ... */ if (!container || !categoryTooltipElement) { console.warn("Category tooltip container or element not found."); return; } container.addEventListener('mouseover', handleCategoryMouseOver); container.addEventListener('mouseout', handleCategoryMouseOut); container.addEventListener('mousemove', handleCategoryMouseMove); }
function handleCategoryMouseOver(event) { /* ... (keep existing code) ... */ const label = event.target.closest('label'); if (!label || !metricMetadata || !categoryTooltipElement) { return; } const metricKey = label.dataset.metricKey; if (!metricKey) return; const description = metricMetadata[metricKey]?.description; if (description) { categoryTooltipElement.textContent = description; categoryTooltipElement.classList.add('visible'); updateTooltipPosition(event); } else { handleCategoryMouseOut(); } }
function handleCategoryMouseOut() { /* ... (keep existing code) ... */ if (categoryTooltipElement) { categoryTooltipElement.classList.remove('visible'); } }
function handleCategoryMouseMove(event) { /* ... (keep existing code) ... */ if (categoryTooltipElement && categoryTooltipElement.classList.contains('visible')) { updateTooltipPosition(event); } }
function updateTooltipPosition(event) { /* ... (keep existing code) ... */ if (!categoryTooltipElement) return; const tooltip = categoryTooltipElement; const PADDING = 10; let x = event.clientX + PADDING; let y = event.clientY + PADDING; const viewportWidth = window.innerWidth; const viewportHeight = window.innerHeight; tooltip.style.display = 'block'; const tooltipWidth = tooltip.offsetWidth; const tooltipHeight = tooltip.offsetHeight; if (!tooltip.classList.contains('visible')) { tooltip.style.display = 'none'; } if (x + tooltipWidth > viewportWidth - PADDING) { x = event.clientX - tooltipWidth - PADDING; if (x < PADDING) { x = PADDING; } } if (y + tooltipHeight > viewportHeight - PADDING) { y = event.clientY - tooltipHeight - PADDING; if (y < PADDING) { y = PADDING; } } tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`; }


// --- Resize Handler --- (No changes needed here)
let resizeTimeout;
window.addEventListener('resize', () => { /* ... (keep existing code) ... */ clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => { if (batteryChart) { try { console.log("Resize handler triggered."); if (!metricMetadata) { console.warn("Resize handler: Metadata not ready yet."); return; } const currentTheme = bodyElement.classList.contains('dark-mode') ? 'dark' : 'light'; const isMobile = window.innerWidth < MOBILE_BREAKPOINT; const newOptions = getChartOptions(isMobile, currentTheme); let optionsChanged = false; if (batteryChart.options.aspectRatio !== newOptions.aspectRatio) { batteryChart.options.aspectRatio = newOptions.aspectRatio; optionsChanged = true; } if (batteryChart.options.scales?.r?.ticks?.color !== newOptions.scales?.r?.ticks?.color) { batteryChart.options.scales.r.ticks.color = newOptions.scales.r.ticks.color; optionsChanged = true; } if (batteryChart.options.scales?.r?.pointLabels?.color !== newOptions.scales?.r?.pointLabels?.color) { batteryChart.options.scales.r.pointLabels.color = newOptions.scales.r.pointLabels.color; optionsChanged = true; } if (batteryChart.options.scales?.r?.grid?.color !== newOptions.scales?.r?.grid?.color) { batteryChart.options.scales.r.grid.color = newOptions.scales.r.grid.color; optionsChanged = true; } if (batteryChart.options.scales?.r?.angleLines?.color !== newOptions.scales?.r?.angleLines?.color) { batteryChart.options.scales.r.angleLines.color = newOptions.scales.r.angleLines.color; optionsChanged = true; } if (batteryChart.options.plugins?.legend?.labels?.color !== newOptions.plugins?.legend?.labels?.color) { batteryChart.options.plugins.legend.labels.color = newOptions.plugins.legend.labels.color; optionsChanged = true; } if (batteryChart.options.plugins?.tooltip?.backgroundColor !== newOptions.plugins?.tooltip?.backgroundColor) { batteryChart.options.plugins.tooltip.backgroundColor = newOptions.plugins.tooltip.backgroundColor; optionsChanged = true; } if (batteryChart.options.plugins?.tooltip?.titleColor !== newOptions.plugins?.tooltip?.titleColor) { batteryChart.options.plugins.tooltip.titleColor = newOptions.plugins.tooltip.titleColor; optionsChanged = true; } if (batteryChart.options.plugins?.tooltip?.bodyColor !== newOptions.plugins?.tooltip?.bodyColor) { batteryChart.options.plugins.tooltip.bodyColor = newOptions.plugins.tooltip.bodyColor; optionsChanged = true; } if (batteryChart.options.scales?.r?.ticks?.font?.size !== newOptions.scales?.r?.ticks?.font?.size) { batteryChart.options.scales.r.ticks.font.size = newOptions.scales.r.ticks.font.size; optionsChanged = true; } if (batteryChart.options.scales?.r?.pointLabels?.font?.size !== newOptions.scales?.r?.pointLabels?.font?.size) { batteryChart.options.scales.r.pointLabels.font.size = newOptions.scales.r.pointLabels.font.size; optionsChanged = true; } if (batteryChart.options.plugins?.legend?.labels?.font?.size !== newOptions.plugins?.legend?.labels?.font?.size) { batteryChart.options.plugins.legend.labels.font.size = newOptions.plugins.legend.labels.font.size; optionsChanged = true; } if (batteryChart.options.plugins?.legend?.labels?.boxWidth !== newOptions.plugins?.legend?.labels?.boxWidth) { batteryChart.options.plugins.legend.labels.boxWidth = newOptions.plugins.legend.labels.boxWidth; optionsChanged = true; } if (batteryChart.options.plugins?.legend?.labels?.padding !== newOptions.plugins?.legend?.labels?.padding) { batteryChart.options.plugins.legend.labels.padding = newOptions.plugins.legend.labels.padding; optionsChanged = true; } if (batteryChart.options.elements?.point?.radius !== newOptions.elements?.point?.radius) { batteryChart.options.elements.point.radius = newOptions.elements.point.radius; optionsChanged = true; } if (batteryChart.options.elements?.point?.hoverRadius !== newOptions.elements?.point?.hoverRadius) { batteryChart.options.elements.point.hoverRadius = newOptions.elements.point.hoverRadius; optionsChanged = true; } if (batteryChart.options.elements?.point?.hitRadius !== newOptions.elements?.point?.hitRadius) { batteryChart.options.elements.point.hitRadius = newOptions.elements.point.hitRadius; optionsChanged = true; } console.log("Calling chart.resize()"); batteryChart.resize(); } catch (e) { console.error("Error during resize handler:", e); } } else { console.log("Resize handler: Chart not ready."); } }, 250); });
// --- END OF FILE chart_script.js ---
