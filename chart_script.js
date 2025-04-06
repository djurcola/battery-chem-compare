// --- START OF FILE chart_script.js ---

// --- Configuration & Constants ---
const DATA_FILE = 'battery_data.json';
const METADATA_FILE = 'metric_metadata.json';
const MOBILE_BREAKPOINT = 768;
const initialVisibleMetricKeys = ['performance', 'lifespan', 'safety', 'powerDensity', 'energyDensity', 'cost'];
// prettier-ignore
const levels = {'Very Low':5,'Low':4,'Medium':3,'High':2,'Very High':1,'Poor':1,'Fair':2,'Moderate':3,'Good':3.5,'Very Good':4.5,'Excellent':5,'Narrow':2,'Wide':4,'Very Wide':5,'Slow':1,'Fast':4,'Very Fast':5,'None':5,'Minor':3,'Significant':1,'Emerging':1,'Developing':2.5,'Mature':4,'Very Mature':5};

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
let categoryTooltipElement = null; // <-- Add global variable for tooltip element

// --- Add Globals for Details Section ---
let batterySelectorListElement = null;
let batteryDetailsContentElement = null;
// ------------------------------------


// --- Helper Functions ---
// prettier-ignore
function getComparableValue(value){if(typeof value==='number'&&isFinite(value))return value;if(typeof value!=='string')return null;if(levels[value]!==undefined)return levels[value];value=value.replace(/,/g,'').trim();const r=value.match(/^(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)/);const p=value.match(/^(\d+(\.\d+)?)\+/);const s=value.match(/^(\d+(\.\d+)?)$/);let n=null;if(r)n=(parseFloat(r[1])+parseFloat(r[3]))/2;else if(p)n=parseFloat(p[1]);else if(s)n=parseFloat(s[1]);return(typeof n==='number'&&isFinite(n))?n:null;}
function showError(message){const e=document.getElementById('error-message');if(e){e.textContent=message;e.style.display='block';}const cc=document.getElementById('chart-container');if(cc)cc.style.display='none';const cs=document.getElementById('category-selector');if(cs)cs.style.display='none';}

// --- getChartOptions (no changes needed here for this feature) ---
function getChartOptions(isMobile, theme = 'light') {
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
function preCalculateNormalization(batterySourceData) { console.log("Pre-calculating normalization...");if (!metricMetadata || !allMetricKeys.length || !batterySourceData || batterySourceData.length === 0) { console.error("Cannot pre-calculate normalization: Metadata or battery data missing."); return []; } normalizationStats = {}; allMetricKeys.forEach(key => { if (metricMetadata[key] && metricMetadata[key].unit !== 'Rating') { let m = Infinity, x = -Infinity, f = false; batterySourceData.forEach(c => { if (typeof c === 'object' && c !== null && c.hasOwnProperty(key)) { const v = getComparableValue(c[key]); if (v !== null) { m = Math.min(m, v); x = Math.max(x, v); f = true; } } }); if (f && isFinite(m) && isFinite(x)) { normalizationStats[key] = { min: m, max: x, range: x - m }; } else { normalizationStats[key] = { min: 0, max: 0, range: 0 }; } } }); return batterySourceData.map((chem) => { if (typeof chem !== 'object' || chem === null) return null; return allMetricKeys.map(key => { const r = chem.hasOwnProperty(key) ? chem[key] : undefined; const c = getComparableValue(r); let n = null; if (c !== null) { const meta = metricMetadata[key]; if (meta?.unit === 'Rating') n = c; else { const s = normalizationStats[key]; if (s && typeof s.min === 'number' && typeof s.range === 'number' && s.range > 0) { const sc = (c - s.min) / s.range; const hB = typeof meta?.higherIsBetter === 'boolean' ? meta.higherIsBetter : true; n = 1 + 4 * (hB ? sc : (1 - sc)); } else if (s && s.min === c && s.range === 0) n = 3; } } return (typeof n === 'number' && isFinite(n)) ? Math.max(1, Math.min(5, n)) : null; }); }).filter(data => data !== null); }
function createChartDatasetsFromPreNormalized(visibleKeys, preNormalizedSource) { console.log("Creating datasets. Visible keys:",visibleKeys);if (!metricMetadata || !allMetricKeys.length || !preNormalizedSource || preNormalizedSource.length === 0 || !visibleKeys || visibleKeys.length === 0){console.warn("Create datasets: Missing data/keys/metadata.");return[];}const visibleIndices=visibleKeys.map(key=>allMetricKeys.indexOf(key)).filter(index=>index!==-1);return preNormalizedSource.map((allPoints,index)=>{if(!allPoints||typeof loadedBatteryData[index]!=='object')return null;const visibleDataPoints=visibleIndices.map(idx=>allPoints[idx]);const chem=loadedBatteryData[index];const hue=(index*(360/loadedBatteryData.length))%360;const color=`hsl(${hue}, 70%, 55%)`;const datasetLabel=`${chem.name||'Unk'} (${chem.fullName||''})`;const originalValues=allMetricKeys.map(key=>chem.hasOwnProperty(key)?String(chem[key]):'N/A');return{label:datasetLabel,data:visibleDataPoints,borderColor:color,backgroundColor:`hsla(${hue},70%,60%,0.2)`,pointBackgroundColor:color,pointBorderColor:'#fff',pointHoverBackgroundColor:'#fff',pointHoverBorderColor:color,originalValues:originalValues};}).filter(ds=>ds!==null);}
function getSelectedCategories(){const c=document.querySelectorAll('#category-selector input[name="category"]:checked');const s=Array.from(c).map(cb=>cb.value);return allMetricKeys.filter(k=>s.includes(k));}
function applyTheme(theme) { console.log(`Applying theme: ${theme}`); bodyElement.classList.toggle('dark-mode', theme === 'dark'); if (toggleSwitch) toggleSwitch.checked = (theme === 'dark'); if (batteryChart) { console.log(`Updating chart for ${theme} theme.`); const isMobile = window.innerWidth < MOBILE_BREAKPOINT; batteryChart.options = getChartOptions(isMobile, theme); batteryChart.update(); } }


// --- Main Setup Function (Async) ---
async function initializeChart() {
     toggleSwitch = document.getElementById('dark-mode-toggle');
     categoryTooltipElement = document.getElementById('category-tooltip'); // <-- Get tooltip element

     batterySelectorListElement = document.getElementById('battery-selector-list'); // Assign the list element
     batteryDetailsContentElement = document.getElementById('battery-details-content'); // Assign the content element

    try {
         let initialTheme = 'light';
         try { const sT=localStorage.getItem('theme'); if(sT==='dark'||sT==='light')initialTheme=sT;else if(systemPrefersDark.matches)initialTheme='dark'; }
         catch(e){ console.error("LS Error:",e); if(systemPrefersDark.matches)initialTheme='dark'; }
         bodyElement.classList.toggle('dark-mode', initialTheme === 'dark');
         if(toggleSwitch)toggleSwitch.checked=(initialTheme==='dark');
         console.log(`Initial theme: ${initialTheme}`);

        console.log("Fetching data and metadata...");
         const [dataResponse, metadataResponse] = await Promise.all([
             fetch(DATA_FILE), fetch(METADATA_FILE)
         ]);

        if (!dataResponse.ok) throw new Error(`HTTP error loading battery data: ${dataResponse.status}`);
        try { loadedBatteryData = await dataResponse.json(); } catch (e) { throw new Error(`Parse Err loading battery data: ${e}`); }
        if (!Array.isArray(loadedBatteryData) || !loadedBatteryData.length) throw new Error(`Battery data invalid`);

        populateBatterySelectorList();

        if (!metadataResponse.ok) throw new Error(`HTTP error loading metadata: ${metadataResponse.status}`);
        try { metricMetadata = await metadataResponse.json(); } catch (e) { throw new Error(`Parse Err loading metadata: ${e}`); }
        if (typeof metricMetadata !== 'object' || metricMetadata === null || Object.keys(metricMetadata).length === 0) throw new Error(`Metric metadata invalid`);

        allMetricKeys = Object.keys(metricMetadata);
        console.log("Metadata loaded, keys:", allMetricKeys);

        console.log("Pre-calculating normalization...");
        allPreNormalizedData = preCalculateNormalization(loadedBatteryData);
        if (!allPreNormalizedData || allPreNormalizedData.length !== loadedBatteryData.length) throw new Error("Normalization failed.");

        console.log("Populating categories...");
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
            // Add the description to the title attribute as a fallback/extra info
            //l.title = mi.description || `${mi.label} (${mi.unit || 'Rating'})`;
            const ip = document.createElement('input');
            ip.type = 'checkbox';
            ip.id = cI;
            ip.name = 'category';
            ip.value = key;
            ip.checked = iC;
            // --- Associate key with the label directly for easier access in hover ---
            l.dataset.metricKey = key; // <-- Store the key on the label
            // --------------------------------------------------------------------
            l.appendChild(ip);
            l.appendChild(document.createTextNode(` ${mi.label}`));
            optionsContainer.appendChild(l);
        });

        // --- Add Event Listeners for Category Tooltips ---
        setupCategoryTooltips(optionsContainer);
        // -------------------------------------------------

        document.getElementById('category-selector')?.addEventListener('change', handleCategoryChange);

        console.log("Getting initial categories...");
         let currentVisibleKeys = getSelectedCategories();
         if (currentVisibleKeys.length < 3) { currentVisibleKeys = initialVisibleMetricKeys; currentVisibleKeys.forEach(k => { const c = document.getElementById(`check-${k}`); if (c) c.checked = true; }); }
         let currentVisibleLabels = currentVisibleKeys.map(key => metricMetadata[key]?.label || key);

        console.log("Creating initial datasets...");
         let currentDatasets = createChartDatasetsFromPreNormalized(currentVisibleKeys, allPreNormalizedData);
         if (!currentDatasets || !currentDatasets.length) { throw new Error("Dataset creation failed."); }

        console.log("Configuring chart...");
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
function handleCategoryChange(event) {
    if (!batteryChart || !allPreNormalizedData?.length || !loadedBatteryData?.length || !metricMetadata || !allMetricKeys.length) { console.warn("Chart/Data/Metadata not ready for category change."); return; }
    const newVisibleKeys = getSelectedCategories();
    if (newVisibleKeys.length < 3) { if (event?.target instanceof HTMLInputElement && !event.target.checked) { event.target.checked = true; } alert("Please select at least 3 categories to compare."); return; }
    console.log("Category changed. New visible keys:", newVisibleKeys);
    const newVisibleLabels = newVisibleKeys.map(key => metricMetadata[key]?.label || key);
    const visibleIndices = newVisibleKeys.map(key => allMetricKeys.indexOf(key)).filter(index => index !== -1);
    let updateError = false;
    try {
        if (batteryChart.data.datasets.length !== allPreNormalizedData.length) { throw new Error("Mismatch between chart datasets and pre-normalized data length."); }
        batteryChart.data.datasets.forEach((dataset, index) => {
            const fullDataRow = allPreNormalizedData[index];
            if (!fullDataRow) { console.warn(`No pre-normalized data found for dataset index ${index}`); return; }
            const newVisibleDataPoints = visibleIndices.map(idx => fullDataRow[idx]);
            dataset.data = newVisibleDataPoints;
        });
    } catch (error) { console.error("Error updating dataset data:", error); showError("Error updating chart with new categories."); updateError = true; }
    if (updateError) return;
    batteryChart.data.labels = newVisibleLabels;
    console.log("Updating chart with new category data...");
    batteryChart.update();
    console.log("Chart update complete.");
}


// --- Add Functions for Battery Details Section ---

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
    batterySelectorListElement.addEventListener('click', handleBatterySelection);
}

function handleBatterySelection(event) {
    const target = event.target;
    // Check if a selectable item was clicked
    if (!target.classList.contains('battery-select-item')) {
        return; // Didn't click a valid item
    }

    const selectedIndex = parseInt(target.dataset.batteryIndex, 10);
    if (isNaN(selectedIndex) || !loadedBatteryData[selectedIndex]) {
        console.error("Invalid battery index selected:", target.dataset.batteryIndex);
        return;
    }

    const selectedBattery = loadedBatteryData[selectedIndex];

    // Update visual selection state
    // Remove 'selected' from any previously selected item
    const previouslySelected = batterySelectorListElement.querySelector('.selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('selected');
    }
    // Add 'selected' to the clicked item
    target.classList.add('selected');

    // Update the details content area
    displayBatteryDetails(selectedBattery);
}

function displayBatteryDetails(battery) {
    if (!batteryDetailsContentElement) return;

    let useCasesHTML = 'Not specified';
    if (Array.isArray(battery.useCases) && battery.useCases.length > 0) {
        useCasesHTML = `<ul>${battery.useCases.map(use => `<li>${use}</li>`).join('')}</ul>`;
    } else if (battery.useCases) { // Handle case where it might be a string
        useCasesHTML = `<p>${battery.useCases}</p>`;
    }

    batteryDetailsContentElement.innerHTML = `
        <h4>Full Name</h4>
        <p>${battery.fullName || 'Not specified'}</p> 
        <h4>Description</h4>
        <p>${battery.description || 'No description available.'}</p>
        <h4>Common Use Cases</h4>
        ${useCasesHTML}
    `;

    // Make the content area visible
    batteryDetailsContentElement.style.display = 'block';
}




// --- Run Initialization on Load ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Ready. Initializing chart...");
    initializeChart(); // This now also gets the tooltip element and calls setupCategoryTooltips
});

// --- Theme Event Listeners (AFTER DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    // Note: toggleSwitch is assigned in initializeChart now, but this listener setup is fine here
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


// --- Add Functions for Category Tooltip ---

function setupCategoryTooltips(container) {
    if (!container || !categoryTooltipElement) {
        console.warn("Category tooltip container or element not found.");
        return;
    }

    // Use event delegation on the container
    container.addEventListener('mouseover', handleCategoryMouseOver);
    container.addEventListener('mouseout', handleCategoryMouseOut);
    container.addEventListener('mousemove', handleCategoryMouseMove);
}

function handleCategoryMouseOver(event) {
    // Find the label element that was hovered (or whose child was hovered)
    const label = event.target.closest('label');
    if (!label || !metricMetadata || !categoryTooltipElement) {
        // If not hovering over a label, or metadata/tooltip element isn't ready, do nothing
        return;
    }

    const metricKey = label.dataset.metricKey; // Get the key stored earlier
    if (!metricKey) return;

    const description = metricMetadata[metricKey]?.description;

    if (description) {
        categoryTooltipElement.textContent = description;
        // Position and show (positioning handled by mousemove)
        categoryTooltipElement.classList.add('visible');
        // Initial position update in case mouse doesn't move immediately
        updateTooltipPosition(event);
    } else {
        // Hide if there's no description for some reason
        handleCategoryMouseOut();
    }
}

function handleCategoryMouseOut() {
    if (categoryTooltipElement) {
        categoryTooltipElement.classList.remove('visible');
    }
}

function handleCategoryMouseMove(event) {
    // Only update position if the tooltip is supposed to be visible
    if (categoryTooltipElement && categoryTooltipElement.classList.contains('visible')) {
       updateTooltipPosition(event);
    }
}

function updateTooltipPosition(event) {
     if (!categoryTooltipElement) return;

     const tooltip = categoryTooltipElement;
     const PADDING = 10; // Space from cursor

     // Calculate position based on mouse coordinates
     let x = event.clientX + PADDING;
     let y = event.clientY + PADDING;

     // Get viewport dimensions
     const viewportWidth = window.innerWidth;
     const viewportHeight = window.innerHeight;

     // Get tooltip dimensions (need to ensure it's not display:none)
     tooltip.style.display = 'block'; // Temporarily ensure it has dimensions
     const tooltipWidth = tooltip.offsetWidth;
     const tooltipHeight = tooltip.offsetHeight;
     if (!tooltip.classList.contains('visible')) {
         tooltip.style.display = 'none'; // Hide it again if it wasn't meant to be visible
     }


     // Prevent tooltip from going off the right edge
     if (x + tooltipWidth > viewportWidth - PADDING) {
         x = event.clientX - tooltipWidth - PADDING; // Position to the left of cursor
         // Optional: Prevent going off the left edge if positioned left
         if (x < PADDING) {
             x = PADDING;
         }
     }

     // Prevent tooltip from going off the bottom edge
     if (y + tooltipHeight > viewportHeight - PADDING) {
         y = event.clientY - tooltipHeight - PADDING; // Position above cursor
         // Optional: Prevent going off the top edge if positioned above
          if (y < PADDING) {
             y = PADDING;
         }
     }

     tooltip.style.left = `${x}px`;
     tooltip.style.top = `${y}px`;
}

// --- END - Add Functions for Category Tooltip ---


// --- Resize Handler (Revised Logic - check for metadata added) ---
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (batteryChart) {
            try {
                console.log("Resize handler triggered.");
                if (!metricMetadata) { console.warn("Resize handler: Metadata not ready yet."); return; } // Added check
                const currentTheme = bodyElement.classList.contains('dark-mode') ? 'dark' : 'light';
                const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
                const newOptions = getChartOptions(isMobile, currentTheme);

                let optionsChanged = false;
                if (batteryChart.options.aspectRatio !== newOptions.aspectRatio) { batteryChart.options.aspectRatio = newOptions.aspectRatio; optionsChanged = true; }
                if (batteryChart.options.scales?.r?.ticks?.color !== newOptions.scales?.r?.ticks?.color) { batteryChart.options.scales.r.ticks.color = newOptions.scales.r.ticks.color; optionsChanged = true; }
                if (batteryChart.options.scales?.r?.pointLabels?.color !== newOptions.scales?.r?.pointLabels?.color) { batteryChart.options.scales.r.pointLabels.color = newOptions.scales.r.pointLabels.color; optionsChanged = true; }
                if (batteryChart.options.scales?.r?.grid?.color !== newOptions.scales?.r?.grid?.color) { batteryChart.options.scales.r.grid.color = newOptions.scales.r.grid.color; optionsChanged = true; }
                if (batteryChart.options.scales?.r?.angleLines?.color !== newOptions.scales?.r?.angleLines?.color) { batteryChart.options.scales.r.angleLines.color = newOptions.scales.r.angleLines.color; optionsChanged = true; }
                if (batteryChart.options.plugins?.legend?.labels?.color !== newOptions.plugins?.legend?.labels?.color) { batteryChart.options.plugins.legend.labels.color = newOptions.plugins.legend.labels.color; optionsChanged = true; }
                if (batteryChart.options.plugins?.tooltip?.backgroundColor !== newOptions.plugins?.tooltip?.backgroundColor) { batteryChart.options.plugins.tooltip.backgroundColor = newOptions.plugins.tooltip.backgroundColor; optionsChanged = true; }
                if (batteryChart.options.plugins?.tooltip?.titleColor !== newOptions.plugins?.tooltip?.titleColor) { batteryChart.options.plugins.tooltip.titleColor = newOptions.plugins.tooltip.titleColor; optionsChanged = true; }
                if (batteryChart.options.plugins?.tooltip?.bodyColor !== newOptions.plugins?.tooltip?.bodyColor) { batteryChart.options.plugins.tooltip.bodyColor = newOptions.plugins.tooltip.bodyColor; optionsChanged = true; }
                if (batteryChart.options.scales?.r?.ticks?.font?.size !== newOptions.scales?.r?.ticks?.font?.size) { batteryChart.options.scales.r.ticks.font.size = newOptions.scales.r.ticks.font.size; optionsChanged = true; }
                if (batteryChart.options.scales?.r?.pointLabels?.font?.size !== newOptions.scales?.r?.pointLabels?.font?.size) { batteryChart.options.scales.r.pointLabels.font.size = newOptions.scales.r.pointLabels.font.size; optionsChanged = true; }
                if (batteryChart.options.plugins?.legend?.labels?.font?.size !== newOptions.plugins?.legend?.labels?.font?.size) { batteryChart.options.plugins.legend.labels.font.size = newOptions.plugins.legend.labels.font.size; optionsChanged = true; }
                if (batteryChart.options.plugins?.legend?.labels?.boxWidth !== newOptions.plugins?.legend?.labels?.boxWidth) { batteryChart.options.plugins.legend.labels.boxWidth = newOptions.plugins.legend.labels.boxWidth; optionsChanged = true; }
                if (batteryChart.options.plugins?.legend?.labels?.padding !== newOptions.plugins?.legend?.labels?.padding) { batteryChart.options.plugins.legend.labels.padding = newOptions.plugins.legend.labels.padding; optionsChanged = true; }
                if (batteryChart.options.elements?.point?.radius !== newOptions.elements?.point?.radius) { batteryChart.options.elements.point.radius = newOptions.elements.point.radius; optionsChanged = true; }
                if (batteryChart.options.elements?.point?.hoverRadius !== newOptions.elements?.point?.hoverRadius) { batteryChart.options.elements.point.hoverRadius = newOptions.elements.point.hoverRadius; optionsChanged = true; }
                if (batteryChart.options.elements?.point?.hitRadius !== newOptions.elements?.point?.hitRadius) { batteryChart.options.elements.point.hitRadius = newOptions.elements.point.hitRadius; optionsChanged = true; }

                console.log("Calling chart.resize()");
                batteryChart.resize();
                // Optional update if needed: if (optionsChanged) { batteryChart.update('none'); }

            } catch (e) { console.error("Error during resize handler:", e); }
        } else {
            console.log("Resize handler: Chart not ready.");
        }
    }, 250);
});
// --- END OF FILE chart_script.js ---
