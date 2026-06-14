async function fetchStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        document.getElementById('robot-state').innerText = data.status || 'OFFLINE';
        document.getElementById('robot-mode').innerText = data.mode || 'NONE';
        document.getElementById('robot-queue').innerText = data.queue_len || '0';
        
        const statusTextEl = document.getElementById('robot-status-text');
        if (statusTextEl && data.status_text) {
            statusTextEl.innerText = data.status_text;
        }
        
        // Update connection indicator based on status response
        const dot = document.querySelector('#connection-status .dot');
        const text = document.querySelector('#connection-status span:last-child');
        
        // Arduino status
        const ardDot = document.querySelector('#arduino-status .dot');
        const ardText = document.querySelector('#arduino-status span:last-child');
        
        if (data.arduino_connected) {
            ardDot.style.backgroundColor = '#10b981'; // Green
            ardText.innerText = 'Arduino: Connected';
            ardText.style.color = '#10b981';
            document.getElementById('arduino-status').style.border = '1px solid rgba(16, 185, 129, 0.2)';
            document.getElementById('arduino-status').style.background = 'rgba(16, 185, 129, 0.1)';
        } else {
            ardDot.style.backgroundColor = '#f59e0b'; // Yellow/Warning
            ardText.innerText = 'Arduino: SIM Mode';
            ardText.style.color = '#f59e0b';
            document.getElementById('arduino-status').style.border = '1px solid rgba(245, 158, 11, 0.2)';
            document.getElementById('arduino-status').style.background = 'rgba(245, 158, 11, 0.1)';
        }
        
        if (data.status === 'Offline') {
            dot.style.backgroundColor = '#ef4444';
            dot.style.boxShadow = 'none';
            dot.classList.remove('pulse');
            text.innerText = 'System Offline';
            text.style.color = '#ef4444';
        } else {
            dot.style.backgroundColor = '#10b981';
            dot.classList.add('pulse');
            text.innerText = 'System Online';
            text.style.color = '#10b981';
            
            // Bulletproof way to hide the 'Waiting for camera feed...' overlay 
            // once the backend is confirmed to be online and serving requests.
            const overlay = document.getElementById('video-overlay');
            if (overlay && overlay.style.display !== 'none') {
                overlay.style.display = 'none';
            }
        }
        
        // Highlight snapshot button if ready
        const snapBtn = document.getElementById('btn-snapshot');
        if (data.status === 'IDLE' && data.mode !== null && data.detections > 0) {
            snapBtn.style.opacity = '1';
            snapBtn.style.pointerEvents = 'auto';
        } else {
            snapBtn.style.opacity = '0.5';
            snapBtn.style.pointerEvents = 'none';
        }

    } catch (err) {
        console.error('Error fetching status:', err);
    }
}

async function setMode(mode) {
    try {
        await fetch('/api/mode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({mode: mode})
        });
        fetchStatus();
    } catch (err) {
        console.error('Error setting mode:', err);
    }
}

async function lockSnapshot() {
    try {
        await fetch('/api/snapshot', { method: 'POST' });
        fetchStatus();
    } catch (err) {
        console.error('Error locking snapshot:', err);
    }
}

async function resetMode() {
    try {
        await fetch('/api/reset', { method: 'POST' });
        fetchStatus();
    } catch (err) {
        console.error('Error resetting mode:', err);
    }
}

let calibrationMode = false;
let calibrationPoints = [];

function toggleCalibrationMode() {
    calibrationMode = !calibrationMode;
    const overlay = document.getElementById('cal-overlay');
    const btn = document.getElementById('btn-calibrate');
    const sidebar = document.getElementById('cal-sidebar');
    
    if (calibrationMode) {
        overlay.style.display = 'block';
        sidebar.style.display = 'block';
        btn.style.backgroundColor = '#dc2828';
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Hide Calibration UI';
        updateCalibrationOverlay();
        renderSidebarInputs();
    } else {
        overlay.style.display = 'none';
        sidebar.style.display = 'none';
        document.getElementById('btn-save-cal').style.display = 'none';
        btn.style.backgroundColor = '#f39c12';
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> Start Web Calibration';
    }
}

function handleVideoClick(event) {
    if (!calibrationMode) return;
    
    const img = document.getElementById('video-stream');
    const rect = img.getBoundingClientRect();
    
    // Calculate aspect ratio scaling
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    
    calibrationPoints.push({
        px: px, py: py,
        rx: 0, ry: 0,
        displayX: event.clientX - rect.left,
        displayY: event.clientY - rect.top
    });
    
    updateCalibrationOverlay();
    renderSidebarInputs();
    
    if (calibrationPoints.length >= 4) {
        document.getElementById('btn-save-cal').style.display = 'flex';
    }
}

function updateCalibrationOverlay() {
    const overlay = document.getElementById('cal-overlay');
    overlay.innerHTML = ''; // Clear
    
    calibrationPoints.forEach((p, idx) => {
        overlay.innerHTML += `
            <circle cx="${p.displayX}" cy="${p.displayY}" r="6" fill="red" stroke="white" stroke-width="2" />
            <text x="${p.displayX + 10}" y="${p.displayY - 10}" fill="red" font-family="Arial" font-size="12" font-weight="bold">Point ${idx + 1}</text>
        `;
    });
}

function renderSidebarInputs() {
    const list = document.getElementById('cal-points-list');
    list.innerHTML = '';
    
    calibrationPoints.forEach((p, idx) => {
        list.innerHTML += `
            <div style="display: flex; gap: 0.5rem; align-items: center; background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 8px;">
                <span style="font-weight: bold; color: #ef4444; width: 60px;">Pt ${idx + 1}</span>
                <input type="number" id="rx-${idx}" value="${p.rx}" placeholder="X (cm)" style="width: 70px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 0.4rem; border-radius: 4px;">
                <input type="number" id="ry-${idx}" value="${p.ry}" placeholder="Y (cm)" style="width: 70px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 0.4rem; border-radius: 4px;">
                <button onclick="removePoint(${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem;">✖</button>
            </div>
        `;
    });
    
    document.getElementById('btn-save-cal').style.display = calibrationPoints.length >= 4 ? 'flex' : 'none';
}

function removePoint(index) {
    calibrationPoints.splice(index, 1);
    updateCalibrationOverlay();
    renderSidebarInputs();
}

async function saveCalibration() {
    const btn = document.getElementById('btn-save-cal');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    // Read the values from the inputs
    for (let i = 0; i < calibrationPoints.length; i++) {
        const rxVal = parseFloat(document.getElementById(`rx-${i}`).value);
        const ryVal = parseFloat(document.getElementById(`ry-${i}`).value);
        if (isNaN(rxVal) || isNaN(ryVal)) {
            alert(`Please enter valid numbers for Point ${i + 1}`);
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        calibrationPoints[i].rx = rxVal;
        calibrationPoints[i].ry = ryVal;
    }

    try {
        const response = await fetch('/api/calibrate_save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({points: calibrationPoints})
        });
        const res = await response.json();
        
        if (res.success) {
            btn.innerHTML = 'Saved Successfully!';
            btn.style.backgroundColor = '#10b981';
            
            // Instantly hide the calibration UI
            toggleCalibrationMode(); 
            
            // Show the massive sort-modal pop-up!
            document.getElementById('sort-modal').style.display = 'flex';
            
        } else {
            alert('Error: ' + res.error);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error('Error saving calibration:', err);
        alert('Network error saving calibration.');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Start polling status
setInterval(fetchStatus, 500);
fetchStatus();

// Image load handling for multipart streams
const videoStream = document.getElementById('video-stream');
const overlay = document.getElementById('video-overlay');

const checkVideoInterval = setInterval(() => {
    if (videoStream.naturalHeight !== 0) {
        overlay.style.display = 'none';
        clearInterval(checkVideoInterval);
    }
}, 500);

// Add keyboard shortcuts matching the original OpenCV script
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 's') {
        // If already in shape mode, 's' was used to lock snapshot in the original
        if (document.getElementById('robot-mode').innerText === 'SHAPE') {
            lockSnapshot();
        } else {
            setMode('SHAPE');
        }
    } else if (key === 'c') {
        setMode('COLOUR');
    } else if (key === 'r') {
        resetMode();
    }
});
