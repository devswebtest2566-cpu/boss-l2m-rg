// --- Supabase Config ---
const SUPABASE_URL = 'https://iarewcumdwtdpfcycsmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcmV3Y3VtZHd0ZHBmY3ljc21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5ODA5MTksImV4cCI6MjEwMTU1NjkxOX0.lQLujptp8Pe3yv2H__gXRmfbsOznHH97J7tQ5-D7cgs';

let supabaseClient = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let currentUserRole = 'viewer';

// --- Global Variables ---
let bosses = [];
let countdownInterval = null;
let searchQuery = '';

// --- DOM Elements ---
const swalDark = Swal.mixin({
    background: 'rgba(18, 22, 35, 0.95)',
    color: '#f8fafc',
    backdrop: 'rgba(0,0,0,0.8)',
    customClass: {
        confirmButton: 'btn primary',
        cancelButton: 'btn secondary'
    },
    buttonsStyling: false
});

const bossTableBody = document.getElementById('boss-table-body');
const addBossBtn = document.getElementById('add-boss-btn');
const searchInput = document.getElementById('search-input');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (addBossBtn) {
        addBossBtn.addEventListener('click', () => {
            document.getElementById('boss-form').reset();
            document.getElementById('boss-id').value = '';
            document.getElementById('modal-title').textContent = 'Add Boss';
            const delBtn = document.getElementById('btn-delete-boss');
            if (delBtn) delBtn.style.display = 'none';
            openModal('boss-modal');
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderBosses();
        });
    }

    document.getElementById('boss-form').addEventListener('submit', handleSaveBoss);
    document.getElementById('dead-form').addEventListener('submit', handleConfirmDeath);

    // Start countdown timer
    countdownInterval = setInterval(updateCountdowns, 1000);

    // Initial Auth Check
    checkAuth();
});

// --- Authentication ---
async function checkAuth() {
    if (!supabaseClient) return;
    
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error("Auth session error:", error);
            promptForPin();
            return;
        }

        if (session) {
            currentUserRole = (session.user.email === 'clan@revengers.com') ? 'admin' : 'viewer';
            applyRoleUI();
            
            if (currentUserRole === 'admin') {
                let savedName = localStorage.getItem('editor_name');
                if (!savedName) {
                    promptForName();
                } else {
                    showDashboard();
                }
            } else {
                showDashboard();
            }
        } else {
            promptForPin();
        }
    } catch (err) {
        console.error("Auth check error:", err);
        promptForPin();
    }
}

function promptForPin() {
    swalDark.fire({
        title: '🔒 กรุณาใส่รหัสผ่านแคลน (PIN)',
        input: 'password',
        inputAttributes: {
            autocapitalize: 'off',
            autocorrect: 'off'
        },
        backdrop: 'rgba(0,0,0,0.98)',
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'เข้าสู่ระบบ',
        showLoaderOnConfirm: true,
        preConfirm: async (pin) => {
            if (!pin) {
                Swal.showValidationMessage('กรุณากรอกรหัสผ่าน');
                return false;
            }
            try {
                let { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: 'clan@revengers.com',
                    password: pin
                });
                
                if (error) {
                    // Try Viewer role if Admin fails
                    const viewerAttempt = await supabaseClient.auth.signInWithPassword({
                        email: 'viewer@revengers.com',
                        password: pin
                    });
                    
                    if (viewerAttempt.error) {
                        Swal.showValidationMessage(`รหัสไม่ถูกต้อง (Admin: ${error.message}, Viewer: ${viewerAttempt.error.message})`);
                        return false;
                    }
                    data = viewerAttempt.data;
                }
                
                return data;
            } catch (error) {
                Swal.showValidationMessage(`เกิดข้อผิดพลาด: ${error}`);
                return false;
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const userEmail = result.value.user?.email;
            currentUserRole = (userEmail === 'clan@revengers.com') ? 'admin' : 'viewer';
            applyRoleUI();
            
            swalDark.fire({
                icon: 'success',
                title: 'เข้าสู่ระบบสำเร็จ!',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                if (currentUserRole === 'admin') {
                    promptForName();
                } else {
                    showDashboard();
                }
            });
        }
    });
}

function promptForName() {
    let savedName = localStorage.getItem('editor_name');
    if (savedName) {
        showDashboard();
        return;
    }
    
    swalDark.fire({
        title: '👤 ใส่ชื่อในเกมของคุณ',
        text: 'ชื่อนี้จะถูกใช้เพื่อบันทึกประวัติว่าใครเป็นคนแก้บอส',
        input: 'text',
        backdrop: 'rgba(0,0,0,0.98)',
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'ตกลง',
        preConfirm: (name) => {
            if (!name || name.trim() === '') {
                Swal.showValidationMessage('กรุณากรอกชื่อด้วยครับ');
                return false;
            }
            return name.trim();
        }
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.setItem('editor_name', result.value);
            showDashboard();
        }
    });
}

async function addLog(actionType, bossName, details) {
    if (!supabaseClient) return;
    const editorName = localStorage.getItem('editor_name') || 'Unknown User';
    const payload = {
        action_type: actionType,
        boss_name: bossName,
        details: details,
        editor_name: editorName
    };
    const { error } = await supabaseClient.from('boss_logs').insert([payload]);
    if (error) console.error("Error saving log:", error);
}

function showDashboard() {
    const dashboard = document.getElementById('dashboard-screen');
    if (dashboard) {
        dashboard.style.display = 'block';
        setTimeout(() => {
            dashboard.style.opacity = '1';
        }, 50);
    }
    fetchBosses();
}

function applyRoleUI() {
    const addBtn = document.getElementById('add-boss-btn');
    const logBtn = document.getElementById('log-btn');
    
    if (currentUserRole === 'viewer') {
        if (addBtn) addBtn.style.display = 'none';
        if (logBtn) logBtn.style.display = 'none';
        
        let styleEl = document.getElementById('viewer-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'viewer-style';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = '.col-action, .action-cell { display: none !important; }';
    } else {
        if (addBtn) addBtn.style.display = 'inline-block';
        if (logBtn) logBtn.style.display = 'inline-block';
        
        let styleEl = document.getElementById('viewer-style');
        if (styleEl) styleEl.remove();
    }
}

window.logout = async function() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    localStorage.removeItem('editor_name'); // Clear name on logout
    const dashboard = document.getElementById('dashboard-screen');
    if (dashboard) {
        dashboard.style.opacity = '0';
        setTimeout(() => {
            dashboard.style.display = 'none';
        }, 500);
    }
    promptForPin();
}

// --- Data Fetching ---
async function fetchBosses() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient.from('bosses').select('*');
        if (error) throw error;
        bosses = data || [];
        renderBosses();
    } catch (err) {
        console.error("Error fetching bosses:", err);
    }
}

// --- Smart Sort & Render (Grouped Table View) ---
function renderBosses() {
    if (!bossTableBody) return;
    bossTableBody.innerHTML = '';

    // Search Filtering
    let filteredBosses = bosses.filter(b => b.is_active);
    if (searchQuery) {
        filteredBosses = filteredBosses.filter(b => 
            (b.name && b.name.toLowerCase().includes(searchQuery)) ||
            (b.location && b.location.toLowerCase().includes(searchQuery))
        );
    }

    // Sort Ascending by next_spawn_time (earliest first, nulls at bottom)
    filteredBosses.sort((a, b) => {
        const timeA = a.next_spawn_time ? new Date(a.next_spawn_time).getTime() : Infinity;
        const timeB = b.next_spawn_time ? new Date(b.next_spawn_time).getTime() : Infinity;
        return timeA - timeB;
    });

    let rowIndex = 1;

    filteredBosses.forEach(boss => {
        bossTableBody.appendChild(createBossRow(boss, rowIndex++));
    });

    if (filteredBosses.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="8" style="text-align:center;padding:2rem;color:#94a3b8;">ไม่พบข้อมูลบอส (กดปุ่ม + Add Boss เพื่อเพิ่มบอส)</td>`;
        bossTableBody.appendChild(emptyRow);
    }

    updateCountdowns();
}

function createBossRow(boss, index) {
    const tr = document.createElement('tr');
    tr.className = `boss-row`;
    tr.dataset.id = boss.id;

    const nextSpawnTime = boss.next_spawn_time ? new Date(boss.next_spawn_time).getTime() : 0;
    const lastDeathTimeStr = boss.last_death_time ? formatHHmm(boss.last_death_time) : '--:--';
    const updatedDateStr = boss.last_death_time ? formatDate(boss.last_death_time) : '-';

    // Parse Name (Thai / English)
    const nameParts = (boss.name || '').split('/');
    const nameThai = nameParts[0] ? nameParts[0].trim() : boss.name;
    const nameEn = nameParts[1] ? nameParts[1].trim() : '';

    // Calculate Cooldown in Hours
    const respawnMins = boss.regular_respawn_mins || 0;
    const respawnHours = respawnMins > 0 ? `${(respawnMins / 60).toFixed(0)} ชม.` : '-';

    // Fixed Spawn Chance Percentage
    const spawnRate = (boss.spawn_rate_percent !== undefined && boss.spawn_rate_percent !== null) ? boss.spawn_rate_percent + '%' : '100%';

    // Spawn Pill Format
    let spawnPillHTML = '';
    const now = Date.now();

    if (nextSpawnTime > 0 && nextSpawnTime <= now) {
        spawnPillHTML = `<span class="spawn-pill spawned-pill" id="countdown-${boss.id}">⚔️ SPAWNED</span>`;
    } else {
        spawnPillHTML = `<span class="spawn-pill blue-pill" id="countdown-${boss.id}">⏱️ ${formatHHmm(boss.next_spawn_time)}</span>`;
    }

    tr.innerHTML = `
        <td class="col-num-cell">${index}</td>
        <td>
            <div class="boss-name-wrapper">
                <span class="boss-title-th">${nameThai}</span>
                ${nameEn ? `<span class="boss-title-en">${nameEn}</span>` : ''}
            </div>
        </td>
        <td style="text-align:center;">${spawnPillHTML}</td>
        <td style="text-align:center;">
            <span class="death-pill">💀 ${lastDeathTimeStr}</span>
        </td>
        <td class="rate-badge">${spawnRate}</td>
        <td style="text-align:center;"><span class="cd-badge">${respawnHours}</span></td>
        <td>
            <div class="location-wrapper">
                <span class="location-pill">🗺️ ${boss.location || '-'}</span>
            </div>
        </td>
        <td style="text-align:center;">
            <div class="action-cell">
                <button class="btn action-dead" onclick="openDeadModal('${boss.id}', '${nameThai}')">ตาย</button>
                <button class="btn action-skip" onclick="skipSpawn('${boss.id}')">ข้าม</button>
                <button class="btn action-edit" onclick="editBoss('${boss.id}')">แก้ไข</button>
            </div>
        </td>
    `;
    return tr;
}

function updateCountdowns() {
    const now = Date.now();
    const clockEl = document.getElementById('live-thai-clock');
    if (clockEl) {
        const thaiDate = new Date(now + (7 * 3600 * 1000));
        const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
        const mm = String(thaiDate.getUTCMinutes()).padStart(2, '0');
        const ss = String(thaiDate.getUTCSeconds()).padStart(2, '0');
        clockEl.textContent = `🕒 ${hh}:${mm}:${ss}`;
    }

    bosses.forEach(boss => {
        if (!boss.is_active) return;

        const el = document.getElementById(`countdown-${boss.id}`);
        if (!el) return;

        if (!boss.next_spawn_time) {
            el.textContent = "--:--";
            return;
        }

        const nextSpawn = new Date(boss.next_spawn_time).getTime();
        if (nextSpawn <= now) {
            el.className = "spawn-pill spawned-pill";
            el.textContent = "⚡ SPAWNED";
        }
    });
}

// --- Date Helper Formats ---
function formatHHmm(dateInput) {
    if (!dateInput) return '--:--';
    const d = new Date(dateInput);
    const timeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    
    const now = new Date();
    const dThaiDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const nowThaiDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    
    if (dThaiDate.toDateString() === nowThaiDate.toDateString()) {
        return timeStr;
    } else {
        const dd = String(dThaiDate.getDate()).padStart(2, '0');
        const mm = String(dThaiDate.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm} ${timeStr}`;
    }
}

function formatDate(dateInput) {
    if (!dateInput) return '-';
    const d = new Date(dateInput);
    const day = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit' });
    const month = d.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', month: 'short' });
    const yr = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', year: '2-digit' });
    const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    return `${day}/${month}/${yr} ${time}`;
}

// --- Modals Logic ---
function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

let currentDeadBossCooldown = 0;

function updateSpawnPreview() {
    const dateVal = document.getElementById('dead-date').value;
    const timeVal = document.getElementById('dead-time').value;
    const previewEl = document.getElementById('dead-spawn-preview');
    if (!previewEl) return;
    
    if (dateVal && timeVal && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeVal)) {
        const [y, m, d] = dateVal.split('-').map(Number);
        const [inputHours, inputMins] = timeVal.split(':').map(Number);
        
        const deathThaiMs = Date.UTC(y, m - 1, d, inputHours, inputMins, 0);
        const trueUTCDeathMs = deathThaiMs - (7 * 3600 * 1000);
        const nextSpawnMs = trueUTCDeathMs + (currentDeadBossCooldown * 60000);
        
        const nextThaiMs = nextSpawnMs + (7 * 3600 * 1000);
        const nextThaiDate = new Date(nextThaiMs);
        
        const nDD = String(nextThaiDate.getUTCDate()).padStart(2, '0');
        const nMM = String(nextThaiDate.getUTCMonth() + 1).padStart(2, '0');
        const nh = String(nextThaiDate.getUTCHours()).padStart(2, '0');
        const nm = String(nextThaiDate.getUTCMinutes()).padStart(2, '0');
        
        previewEl.textContent = `⚡ เกิดรอบถัดไป: ${nDD}/${nMM} ${nh}:${nm}`;
    } else {
        previewEl.textContent = '';
    }
}

// Add event listener once
const deadTimeInput = document.getElementById('dead-time');
const deadDateInput = document.getElementById('dead-date');
if (deadTimeInput) deadTimeInput.addEventListener('input', updateSpawnPreview);
if (deadDateInput) deadDateInput.addEventListener('input', updateSpawnPreview);

window.openDeadModal = async function (id, name) {
    const boss = bosses.find(b => b.id === id);
    if (!boss) return;
    
    if (boss.next_spawn_time) {
        const nextTime = new Date(boss.next_spawn_time).getTime();
        if (nextTime > Date.now()) {
            const result = await swalDark.fire({
                title: 'บอสยังไม่เกิด!',
                text: 'เวลายังไม่ถึงกำหนดเกิด คุณแน่ใจหรือไม่ว่าบอสตายแล้ว (เกิดก่อนเวลา)?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'ดำเนินการต่อ',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#f59e0b'
            });
            if (!result.isConfirmed) return;
        }
    }

    currentDeadBossCooldown = boss.use_first_spawn ? (boss.first_spawn_mins || 0) : (boss.regular_respawn_mins || 0);

    document.getElementById('dead-boss-id').value = id;
    document.getElementById('dead-boss-name').textContent = name;
    
    const lastSpawnEl = document.getElementById('dead-last-spawn');
    if (lastSpawnEl) {
        if (boss.next_spawn_time) {
            const nextTime = new Date(boss.next_spawn_time).getTime();
            if (nextTime <= Date.now()) {
                const d = new Date(boss.next_spawn_time);
                const thaiMs = d.getTime() + (7 * 3600 * 1000);
                const tDate = new Date(thaiMs);
                const dd = String(tDate.getUTCDate()).padStart(2, '0');
                const mm = String(tDate.getUTCMonth() + 1).padStart(2, '0');
                const hh = String(tDate.getUTCHours()).padStart(2, '0');
                const min = String(tDate.getUTCMinutes()).padStart(2, '0');
                lastSpawnEl.innerHTML = `⏱️ รอบนี้บอสเกิดเมื่อ: <span style="color:#facc15;">${dd}/${mm} ${hh}:${min}</span>`;
            } else {
                lastSpawnEl.innerHTML = `⚠️ <span style="color:#f59e0b;">บอสยังไม่ถึงเวลาเกิด</span>`;
            }
        } else {
            lastSpawnEl.textContent = ``;
        }
    }

    let defaultTimeStr = '';
    const nowUTC = new Date();
    const thaiTimeMs = nowUTC.getTime() + (7 * 3600 * 1000);
    const thaiDate = new Date(thaiTimeMs);
    const yyyy = thaiDate.getUTCFullYear();
    const mm = String(thaiDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(thaiDate.getUTCDate()).padStart(2, '0');
    const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
    const min = String(thaiDate.getUTCMinutes()).padStart(2, '0');
    
    document.getElementById('dead-date').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('dead-time').value = `${hh}:${min}`;
    
    updateSpawnPreview();

    openModal('dead-modal');
}

window.editBoss = function (id) {
    const boss = bosses.find(b => b.id === id);
    if (!boss) return;

    document.getElementById('boss-id').value = boss.id;
    document.getElementById('boss-name').value = boss.name;
    document.getElementById('boss-location').value = boss.location || '';

    document.getElementById('boss-first-h').value = Math.floor((boss.first_spawn_mins || 0) / 60);
    document.getElementById('boss-first-m').value = (boss.first_spawn_mins || 0) % 60;

    document.getElementById('boss-reg-h').value = Math.floor((boss.regular_respawn_mins || 0) / 60);
    document.getElementById('boss-reg-m').value = (boss.regular_respawn_mins || 0) % 60;

    document.getElementById('boss-use-first').checked = boss.use_first_spawn;
    document.getElementById('boss-active').checked = boss.is_active;
    document.getElementById('boss-spawn-rate').value = boss.spawn_rate_percent ?? 100;

    document.getElementById('modal-title').textContent = 'Edit Boss';
    const delBtn = document.getElementById('btn-delete-boss');
    if (delBtn) delBtn.style.display = 'inline-block';
    openModal('boss-modal');
}

window.closeModal = closeModal;

async function handleSaveBoss(e) {
    e.preventDefault();
    if (!supabaseClient) {
        closeModal('boss-modal');
        return;
    }

    const id = document.getElementById('boss-id').value;

    const firstH = parseInt(document.getElementById('boss-first-h').value) || 0;
    const firstM = parseInt(document.getElementById('boss-first-m').value) || 0;
    const regH = parseInt(document.getElementById('boss-reg-h').value) || 0;
    const regM = parseInt(document.getElementById('boss-reg-m').value) || 0;

    const payload = {
        name: document.getElementById('boss-name').value,
        location: document.getElementById('boss-location').value,
        first_spawn_mins: (firstH * 60) + firstM,
        regular_respawn_mins: (regH * 60) + regM,
        use_first_spawn: document.getElementById('boss-use-first').checked,
        is_active: document.getElementById('boss-active').checked,
        spawn_rate_percent: parseInt(document.getElementById('boss-spawn-rate').value) || 100
    };

    if (id) {
        const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
        if (error) {
            swalDark.fire('Error', "Error updating: " + error.message, 'error');
        } else {
            addLog("Edit", payload.name, "แก้ไขข้อมูลบอส");
        }
    } else {
        const { error } = await supabaseClient.from('bosses').insert([payload]);
        if (error) {
            swalDark.fire('Error', "Error creating: " + error.message, 'error');
        } else {
            addLog("Add", payload.name, "เพิ่มบอสใหม่");
        }
    }

    closeModal('boss-modal');
    fetchBosses();
}

async function handleConfirmDeath(e) {
    e.preventDefault();
    if (!supabaseClient) {
        closeModal('dead-modal');
        return;
    }

    const id = document.getElementById('dead-boss-id').value;
    const dateStr = document.getElementById('dead-date').value;
    const timeStr = document.getElementById('dead-time').value;
    const boss = bosses.find(b => b.id === id);
    if (!boss || !dateStr || !timeStr) return;

    const [y, m, d] = dateStr.split('-').map(Number);
    const [inputHours, inputMins] = timeStr.split(':').map(Number);
    
    const deathThaiMs = Date.UTC(y, m - 1, d, inputHours, inputMins, 0);
    const trueUTCDeathMs = deathThaiMs - (7 * 3600 * 1000);
    const trueDeathDate = new Date(trueUTCDeathMs);

    const minsToAdd = boss.use_first_spawn ? (boss.first_spawn_mins || 0) : (boss.regular_respawn_mins || 0);
    const nextSpawnDate = new Date(trueDeathDate.getTime() + (minsToAdd * 60000));

    const payload = {
        last_death_time: trueDeathDate.toISOString(),
        next_spawn_time: nextSpawnDate.toISOString()
    };

    const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
    if (error) {
        swalDark.fire('Error', "Error saving death time: " + error.message, 'error');
    } else {
        const mmFormat = String(m).padStart(2, '0');
        const ddFormat = String(d).padStart(2, '0');
        const hhFormat = String(inputHours).padStart(2, '0');
        const minFormat = String(inputMins).padStart(2, '0');
        addLog("Dead", boss.name, `บันทึกเวลาตายเป็น ${ddFormat}/${mmFormat} ${hhFormat}:${minFormat}`);
    }

    closeModal('dead-modal');
    fetchBosses();
}

window.skipSpawn = async function (id) {
    if (!supabaseClient) return;

    const boss = bosses.find(b => b.id === id);
    if (!boss || !boss.next_spawn_time) {
        swalDark.fire('เกิดข้อผิดพลาด', 'ไม่สามารถข้ามได้ (ยังไม่ทราบเวลาเกิดรอบถัดไป)', 'error');
        return;
    }

    const nextTime = new Date(boss.next_spawn_time).getTime();
    const isEarly = nextTime > Date.now();
    
    let htmlContent = `ต้องการบวกเวลาเกิด (Skip) ของ ${boss.name} ไปรอบถัดไปใช่หรือไม่?`;
    if (isEarly) {
        htmlContent = `<p style="color: #f59e0b; margin-bottom: 10px;">⚠️ บอสยังไม่ถึงเวลาเกิด!</p>` + htmlContent;
    }

    const result = await swalDark.fire({
        title: 'ยืนยันการข้ามเวลา?',
        html: htmlContent,
        icon: isEarly ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันการข้าม',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: isEarly ? '#f59e0b' : '#2563eb'
    });
    if (!result.isConfirmed) return;

    const currentNext = new Date(boss.next_spawn_time);
    
    // ใช้ "เวลาปกติที่จะเกิด" เสมอในการกดข้ามรอบ (ตามที่แจ้งมา)
    const minsToAdd = boss.regular_respawn_mins || 0;

    const nextSpawnDate = new Date(currentNext.getTime() + (minsToAdd * 60000));

    const payload = {
        next_spawn_time: nextSpawnDate.toISOString()
    };

    const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
    if (error) {
        swalDark.fire('Error', "Error skipping spawn: " + error.message, 'error');
    } else {
        addLog("Skip", boss.name, "ข้ามเวลาเกิด 1 รอบ");
        fetchBosses();
    }
}

window.deleteBoss = async function () {
    if (!supabaseClient) return;
    
    const id = document.getElementById('boss-id').value;
    if (!id) return;
    
    const boss = bosses.find(b => b.id === id);
    if (!boss) return;

    const result = await swalDark.fire({
        title: 'ยืนยันการลบ',
        text: `ยืนยันการลบข้อมูลของ ${boss.name} อย่างถาวรหรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ลบข้อมูล',
        cancelButtonText: 'ยกเลิก',
        customClass: { confirmButton: 'btn action-dead', cancelButton: 'btn secondary' }
    });
    if (!result.isConfirmed) return;

    const { error } = await supabaseClient.from('bosses').delete().eq('id', id);
    if (error) {
        swalDark.fire('Error', "Error deleting boss: " + error.message, 'error');
    } else {
        addLog("Delete", boss.name, "ลบข้อมูลบอส");
        closeModal('boss-modal');
        fetchBosses();
    }
}

window.openLogModal = async function() {
    openModal('log-modal');
    document.getElementById('log-table-body').innerHTML = '<tr><td colspan="4" style="text-align:center;">กำลังโหลดข้อมูล...</td></tr>';
    
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('boss_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
        
    if (error) {
        document.getElementById('log-table-body').innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444;">${error.message}</td></tr>`;
        return;
    }
    
    if (!data || data.length === 0) {
        document.getElementById('log-table-body').innerHTML = '<tr><td colspan="4" style="text-align:center;">ไม่มีประวัติการแก้ไข</td></tr>';
        return;
    }
    
    let html = '';
    data.forEach(log => {
        const d = new Date(log.created_at);
        const logThaiDate = new Date(d.getTime() + (7 * 3600 * 1000));
        
        const day = String(logThaiDate.getUTCDate()).padStart(2, '0');
        const month = String(logThaiDate.getUTCMonth() + 1).padStart(2, '0');
        const hours = String(logThaiDate.getUTCHours()).padStart(2, '0');
        const mins = String(logThaiDate.getUTCMinutes()).padStart(2, '0');
        const formattedTime = `${day}/${month} ${hours}:${mins}`;
        
        let actionLabel = log.action_type;
        let actionColor = '#fff';
        if (actionLabel === 'Dead') { actionLabel = 'ตาย'; actionColor = '#f43f5e'; }
        if (actionLabel === 'Skip') { actionLabel = 'ข้าม'; actionColor = '#00f2fe'; }
        if (actionLabel === 'Add') { actionLabel = 'เพิ่ม'; actionColor = '#22c55e'; }
        if (actionLabel === 'Edit') { actionLabel = 'แก้ไข'; actionColor = '#eab308'; }
        if (actionLabel === 'Delete') { actionLabel = 'ลบ'; actionColor = '#ef4444'; }
        
        html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 8px; font-size: 0.8rem; color: #94a3b8;">${formattedTime}</td>
                <td style="padding: 8px; font-weight: 500;">${log.boss_name}</td>
                <td style="padding: 8px; color: #a78bfa;">${log.editor_name}</td>
                <td style="padding: 8px;">
                    <span style="color: ${actionColor}; font-size:0.75rem; border: 1px solid ${actionColor}; padding: 2px 6px; border-radius: 4px; margin-right: 6px;">${actionLabel}</span>
                    <span style="font-size:0.85rem; color:#e2e8f0;">${log.details || ''}</span>
                </td>
            </tr>
        `;
    });
    document.getElementById('log-table-body').innerHTML = html;
}
