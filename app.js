// --- Supabase Config ---
const SUPABASE_URL = 'https://iarewcumdwtdpfcycsmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcmV3Y3VtZHd0ZHBmY3ljc21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5ODA5MTksImV4cCI6MjEwMTU1NjkxOX0.lQLujptp8Pe3yv2H__gXRmfbsOznHH97J7tQ5-D7cgs';

let supabaseClient = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let currentUserRole = 'viewer';

// --- Global Variables ---
let timeOffset = 0;
function getNow() {
    return Date.now() + timeOffset;
}
let bosses = [];
let isInvasionMode = false;
let countdownInterval = null;
let searchQuery = '';
let lastAutoPeriodState = false;
let deadDateFP = null;
let resetActualFP = null;

let isSoundEnabled = localStorage.getItem('isSoundEnabled') !== 'false';
let alerted1MinBosses = new Set();
let lastSoundPlayTime = 0;

function checkAutoInvasionSchedule() {
    const now = getNow();
    const thaiDate = new Date(now + (7 * 3600 * 1000));
    const day = thaiDate.getUTCDay(); // 1=Mon, 3=Wed, 5=Fri
    const hour = thaiDate.getUTCHours();

    const isTargetDay = (day === 1 || day === 3 || day === 5);
    const isTargetTime = (hour >= 8);

    return isTargetDay && isTargetTime;
}

window.toggleInvasionMode = function () {
    isInvasionMode = !isInvasionMode;
    const body = document.body;
    const homeContainer = document.getElementById('home-table-container');
    const invContainer = document.getElementById('inv-table-container');
    const homeTitle = document.getElementById('home-title');
    const invBtn = document.getElementById('invasion-btn');

    if (isInvasionMode) {
        body.classList.add('invasion-active');
        if (invContainer) invContainer.style.display = 'block';
        if (homeTitle) homeTitle.style.display = 'block';
        if (invBtn) {
            invBtn.style.background = '#ef4444';
            invBtn.style.color = '#fff';
        }
    } else {
        body.classList.remove('invasion-active');
        if (invContainer) invContainer.style.display = 'none';
        if (homeTitle) homeTitle.style.display = 'none';
        if (invBtn) {
            invBtn.style.background = 'transparent';
            invBtn.style.color = '#ef4444';
        }
    }
    renderBosses();
}

// --- DOM Elements ---
const swalDark = Swal.mixin({
    background: 'rgba(18, 22, 35, 0.95)',
    color: '#f8fafc',
    backdrop: 'rgba(0,0,0,0.8)',
    customClass: {
        confirmButton: 'btn secondary',
        cancelButton: 'btn btn-cancel'
    },
    buttonsStyling: false,
    reverseButtons: true
});

const bossTableBody = document.getElementById('boss-table-body');
const addBossBtn = document.getElementById('add-boss-btn');
const searchInput = document.getElementById('search-input');

// --- Auto Format Time Inputs ---
function setupTimeAutoFormat(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('input', function (e) {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 4) val = val.slice(0, 4);

        if (val.length >= 3) {
            let hh = val.slice(0, 2);
            let mm = val.slice(2);
            if (parseInt(hh, 10) > 23) hh = '23';
            if (parseInt(mm, 10) > 59) mm = '59';
            e.target.value = `${hh}:${mm}`;
        } else if (val.length === 2) {
            if (parseInt(val, 10) > 23) val = '23';
            e.target.value = `${val}:`;
        } else {
            e.target.value = val;
        }
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && e.target.value.endsWith(':')) {
            e.preventDefault();
            e.target.value = e.target.value.slice(0, -2);
        }
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    fetch('https://worldtimeapi.org/api/timezone/Asia/Bangkok')
        .then(res => res.json())
        .then(data => {
            if (data && data.utc_datetime) {
                timeOffset = new Date(data.utc_datetime).getTime() - Date.now();
            }
        })
        .catch(e => console.error('Time sync error:', e));

    lastAutoPeriodState = checkAutoInvasionSchedule();
    if (lastAutoPeriodState && !isInvasionMode) {
        window.toggleInvasionMode();
    }

    setupTimeAutoFormat('dead-time');
    setupTimeAutoFormat('schedule-time');

    if (addBossBtn) {
        addBossBtn.addEventListener('click', () => {
            document.getElementById('boss-form').reset();
            document.getElementById('boss-id').value = '';
            document.getElementById('modal-title').textContent = 'Add Boss';
            const bothLabel = document.getElementById('label-boss-server-both');
            if (bothLabel) bothLabel.style.display = 'flex';
            const delBtn = document.getElementById('btn-delete-boss');
            if (delBtn) delBtn.style.display = 'none';
            openModal('boss-modal');
        });
    }

    const deadDateEl = document.getElementById('dead-date');
    if (deadDateEl) {
        deadDateFP = flatpickr(deadDateEl, {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            disableMobile: "true",
            onChange: function () {
                updateSpawnPreview();
            }
        });
    }

    const resetActualEl = document.getElementById('reset-actual-time');

    if (resetActualEl) {
        resetActualFP = flatpickr(resetActualEl, {
            enableTime: true,
            dateFormat: "Y-m-d H:i",
            altInput: true,
            altFormat: "d/m/Y H:i",
            disableMobile: "true",
            time_24hr: true
        });
    }

    const resetBossBtn = document.getElementById('reset-boss-btn');
    if (resetBossBtn) {
        resetBossBtn.addEventListener('click', () => {
            const cb = document.getElementById('reset-clear-all-cb');
            if (cb) cb.checked = false;
            openModal('reset-modal-step1');
        });
    }

    const cbResetClearAll = document.getElementById('reset-clear-all-cb');
    if (cbResetClearAll) {
        cbResetClearAll.addEventListener('change', (e) => {
            if (e.target.checked) {
                swalDark.fire('คำเตือน', 'เวลาตายล่าสุด และ เวลาเกิดรอบถัดไป ของบอสทุกตัวจะถูกรีเซตเป็นค่าว่างทั้งหมด!', 'warning');
            }
        });
    }

    const resetStep1Form = document.getElementById('reset-step1-form');
    if (resetStep1Form) {
        resetStep1Form.addEventListener('submit', handleConfirmStep1);
    }

    const resetStep2Form = document.getElementById('reset-step2-form');
    if (resetStep2Form) {
        resetStep2Form.addEventListener('submit', handleConfirmStep2);
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

async function addLog(actionType, bossName, details, serverContext = 'home') {
    if (!supabaseClient) return;
    const editorName = localStorage.getItem('editor_name') || 'Unknown User';
    const payload = {
        action_type: actionType,
        boss_name: bossName,
        details: details,
        editor_name: editorName,
        server_context: serverContext
    };
    const { error } = await supabaseClient.from('boss_logs').insert([payload]);
    if (error) console.error("Error saving log:", error);
}

let realtimeInitialized = false;
function initRealtime() {
    if (realtimeInitialized || !supabaseClient) return;
    realtimeInitialized = true;

    supabaseClient
        .channel('public:bosses')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bosses' }, payload => {
            fetchBosses();
        })
        .subscribe();

    supabaseClient
        .channel('public:schedule_events')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_events' }, payload => {
            if (typeof fetchScheduleEvents === 'function') {
                fetchScheduleEvents();
            }
        })
        .subscribe();
}

async function logUserAccess() {
    if (!supabaseClient) return;
    if (sessionStorage.getItem('access_logged') === 'true') return;

    let ip = 'Unknown';
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        if (res.ok) {
            const data = await res.json();
            ip = data.ip || 'Unknown';
        }
    } catch (e) {
        console.warn('Could not fetch IP, might be blocked by adblocker:', e);
    }

    try {
        let editorName = localStorage.getItem('editor_name');
        if (!editorName || currentUserRole !== 'admin') {
            editorName = 'Viewer';
        }

        const { error } = await supabaseClient.from('user_access_logs').insert([{
            username: editorName,
            role: currentUserRole || 'unknown',
            ip_address: ip
        }]);

        if (error) {
            console.error('Error inserting access log:', error);
        } else {
            sessionStorage.setItem('access_logged', 'true');
        }
    } catch (e) {
        console.error('Error in logUserAccess:', e);
    }
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
    updateSoundBtnUI();
    initRealtime(); // เริ่มต้นระบบ Realtime
    logUserAccess(); // บันทึกประวัติการเข้าใช้งานและ IP
}

function applyRoleUI() {
    const addBtn = document.getElementById('add-boss-btn');
    const logBtn = document.getElementById('log-btn');
    const resetBtn = document.getElementById('reset-boss-btn');
    const addScheduleBtn = document.getElementById('add-schedule-btn');
    const accessLogBtn = document.getElementById('access-log-btn');

    if (currentUserRole === 'viewer') {
        if (addBtn) addBtn.style.display = 'none';
        if (logBtn) logBtn.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
        if (addScheduleBtn) addScheduleBtn.style.display = 'none';
        if (accessLogBtn) accessLogBtn.style.display = 'none';

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
        if (resetBtn) resetBtn.style.display = 'inline-block';
        if (accessLogBtn) accessLogBtn.style.display = 'inline-flex';

        let styleEl = document.getElementById('viewer-style');
        if (styleEl) styleEl.remove();
    }
}

window.logout = async function () {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    localStorage.removeItem('editor_name');
    sessionStorage.removeItem('access_logged');
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
    const bossTableBody = document.getElementById('boss-table-body');
    const invBossTableBody = document.getElementById('inv-boss-table-body');
    if (!bossTableBody) return;
    bossTableBody.innerHTML = '';
    if (invBossTableBody) invBossTableBody.innerHTML = '';

    // Search Filtering
    let filteredBosses = bosses.filter(b => b.is_active);
    if (searchQuery) {
        filteredBosses = filteredBosses.filter(b =>
            (b.name && b.name.toLowerCase().includes(searchQuery))
        );
    }

    // Sort Ascending by next_spawn_time (earliest first, nulls at bottom)
    filteredBosses.sort((a, b) => {
        const timeA = a.next_spawn_time ? new Date(a.next_spawn_time).getTime() : Infinity;
        const timeB = b.next_spawn_time ? new Date(b.next_spawn_time).getTime() : Infinity;
        return timeA - timeB;
    });

    let homeBosses = filteredBosses.filter(b => b.server_type !== 'invasion');
    let invBosses = filteredBosses.filter(b => b.server_type === 'invasion');

    let homeRowIndex = 1;
    homeBosses.forEach(boss => {
        bossTableBody.appendChild(createBossRow(boss, homeRowIndex++));
    });

    if (homeBosses.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="8" style="text-align:center;padding:2rem;color:#94a3b8;">ไม่พบข้อมูลบอส (กดปุ่ม + Add Boss เพื่อเพิ่มบอส)</td>`;
        bossTableBody.appendChild(emptyRow);
    }

    if (isInvasionMode && invBossTableBody) {
        let invRowIndex = 1;
        invBosses.forEach(boss => {
            invBossTableBody.appendChild(createBossRow(boss, invRowIndex++));
        });

        if (invBosses.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="8" style="text-align:center;padding:2rem;color:#94a3b8;">ไม่พบข้อมูลบอสศัตรู</td>`;
            invBossTableBody.appendChild(emptyRow);
        }
    }

    updateCountdowns();
}

function createBossRow(boss, index) {
    const tr = document.createElement('tr');
    tr.dataset.id = boss.id;

    const nextSpawnTime = boss.next_spawn_time ? new Date(boss.next_spawn_time).getTime() : 0;

    // Check if spawning in current hour
    const now = getNow();
    const startOfHour = new Date(now);
    startOfHour.setMinutes(0, 0, 0);
    const startOfNextHour = new Date(startOfHour);
    startOfNextHour.setHours(startOfNextHour.getHours() + 1);

    const isInHour = nextSpawnTime >= startOfHour.getTime() && nextSpawnTime < startOfNextHour.getTime();
    tr.className = `boss-row${isInHour ? ' in-hour-highlight' : ''}`;

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

    if (nextSpawnTime > 0 && nextSpawnTime <= now) {
        spawnPillHTML = `<span class="spawn-pill spawned-pill" id="countdown-${boss.id}" style="font-size: 0.95rem; padding: 4px 10px; font-weight: bold;">⚡ SPAWNED</span>`;
    } else {
        spawnPillHTML = `<span class="spawn-pill blue-pill" id="countdown-${boss.id}" style="font-size: 1rem; padding: 4px 10px; font-weight: bold; font-family: monospace;">⏱️ ${formatHHmm(boss.next_spawn_time)}</span>`;
    }

    tr.innerHTML = `
        <td class="col-num-cell">${index}</td>
        <td>
            <div class="boss-name-wrapper">
                <span class="boss-title-th">${nameThai}</span>
                ${nameEn ? `<span class="boss-title-en">${nameEn}</span>` : ''}
            </div>
        </td>
        <td style="text-align:center;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px 0;">
                ${spawnPillHTML}
                <div class="boss-progress-bar-track" title="ความคืบหน้านับถอยหลัง">
                    <div class="boss-progress-bar-fill" id="progress-bar-${boss.id}"></div>
                </div>
                <span style="font-size: 0.75rem; color: #94a3b8;">ตายล่าสุด: ${lastDeathTimeStr}</span>
            </div>
        </td>
        <td style="text-align:center;"><span class="cd-badge">${respawnHours}</span></td>
        <td style="text-align:center;">
            <div class="action-cell">
                <button class="btn action-dead" onclick="openDeadModal('${boss.id}')">ตาย</button>
                <button class="btn action-skip" onclick="skipSpawn('${boss.id}')">ไม่เกิด</button>
                <button class="btn action-edit" onclick="editBoss('${boss.id}')">แก้ไข</button>
            </div>
        </td>
    `;
    return tr;
}

window.toggleSoundNotification = function () {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem('isSoundEnabled', isSoundEnabled);
    updateSoundBtnUI();
};

function updateSoundBtnUI() {
    const btn = document.getElementById('sound-toggle-btn');
    if (!btn) return;
    if (isSoundEnabled) {
        btn.textContent = '🔔 เสียง: เปิด';
        btn.style.background = 'rgba(16, 185, 129, 0.15)';
        btn.style.color = '#10b981';
        btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
        btn.textContent = '🔕 เสียง: ปิด';
        btn.style.background = 'rgba(148, 163, 184, 0.15)';
        btn.style.color = '#94a3b8';
        btn.style.borderColor = 'rgba(148, 163, 184, 0.4)';
    }
}

function playBossSpawnSound() {
    if (!isSoundEnabled) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;

        // Chime Note 1 (E5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Chime Note 2 (B5)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(987.77, now + 0.15);
        gain2.gain.setValueAtTime(0.3, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.6);

        // Chime Note 3 (E6)
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1318.51, now + 0.3);
        gain3.gain.setValueAtTime(0.4, now + 0.3);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.3);
        osc3.stop(now + 0.8);
    } catch (e) {
        console.error("Web Audio error:", e);
    }
}

function updateCountdowns() {
    if (typeof updateScheduleHighlights === 'function') {
        updateScheduleHighlights();
    }
    if (typeof checkScheduleNotifications === 'function') {
        checkScheduleNotifications();
    }

    const now = getNow();

    const currentPeriodState = checkAutoInvasionSchedule();
    if (currentPeriodState !== lastAutoPeriodState) {
        lastAutoPeriodState = currentPeriodState;
        if (currentPeriodState && !isInvasionMode) {
            window.toggleInvasionMode();
        } else if (!currentPeriodState && isInvasionMode) {
            window.toggleInvasionMode();
        }
    }

    const clockEl = document.getElementById('live-thai-clock');
    if (clockEl) {
        const thaiDate = new Date(now + (7 * 3600 * 1000));
        const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
        const mm = String(thaiDate.getUTCMinutes()).padStart(2, '0');
        const ss = String(thaiDate.getUTCSeconds()).padStart(2, '0');
        clockEl.textContent = `🕒 ${hh}:${mm}:${ss}`;
    }

    let hasNew1MinWarning = false;

    const startOfHour = new Date(now);
    startOfHour.setMinutes(0, 0, 0);
    const startOfNextHour = new Date(startOfHour);
    startOfNextHour.setHours(startOfNextHour.getHours() + 1);

    bosses.forEach(boss => {
        if (!boss.is_active) return;

        const el = document.getElementById(`countdown-${boss.id}`);
        if (!el) return;

        if (!boss.next_spawn_time) {
            el.textContent = "--:--";
            return;
        }

        const nextSpawn = new Date(boss.next_spawn_time).getTime();
        const warning1MinTime = nextSpawn - (1 * 60 * 1000); // 1 นาที ก่อนเกิด

        // Toggle in-hour-highlight on row element dynamically
        const trRow = el.closest('tr');
        if (trRow) {
            const isInHour = nextSpawn >= startOfHour.getTime() && nextSpawn < startOfNextHour.getTime();
            if (isInHour) {
                trRow.classList.add('in-hour-highlight');
            } else {
                trRow.classList.remove('in-hour-highlight');
            }
        }

        // Update Progress Bar Fill
        const progressEl = document.getElementById(`progress-bar-${boss.id}`);
        if (progressEl) {
            const respawnMins = boss.regular_respawn_mins || 60;
            const totalDurationMs = respawnMins * 60 * 1000;
            const cycleStart = nextSpawn - totalDurationMs;
            const elapsed = now - cycleStart;
            let percent = Math.min(100, Math.max(0, (elapsed / totalDurationMs) * 100));

            if (nextSpawn <= now) {
                progressEl.className = "boss-progress-bar-fill spawned";
            } else {
                progressEl.style.width = `${percent.toFixed(1)}%`;
                const remainingMs = nextSpawn - now;
                if (remainingMs <= 60 * 60 * 1000) { // < 1 ชั่วโมง เปลี่ยนเป็นสีเหลือง-ส้ม
                    progressEl.className = "boss-progress-bar-fill warning";
                } else {
                    progressEl.className = "boss-progress-bar-fill";
                }
            }
        }

        if (nextSpawn <= now) {
            el.className = "spawn-pill spawned-pill";
            el.textContent = "⚡ SPAWNED";
        }

        // เช็กการเตือนล่วงหน้า 1 นาที
        if (now >= warning1MinTime && now < nextSpawn) {
            const alertKey = `1m-${boss.id}-${boss.next_spawn_time}`;
            if (!alerted1MinBosses.has(alertKey)) {
                alerted1MinBosses.add(alertKey);
                hasNew1MinWarning = true;
            }
        }
    });

    // หากมีบอสเพิ่งเข้าสู่ช่วง 1 นาทีก่อนเกิด
    if (hasNew1MinWarning) {
        const COOLDOWN_MS = 90 * 1000; // Cooldown 90 วินาที ป้องกันเสียงดังซ้ำถี่เกินไปกรณีบอสเกิดติดๆ กัน
        if (now - lastSoundPlayTime >= COOLDOWN_MS) {
            playBossSpawnSound();
            lastSoundPlayTime = now;
        }
    }
}

// --- Date Helper Formats ---
function getThaiDateFromUTC(dateInput) {
    const d = new Date(dateInput);
    return new Date(d.getTime() + (7 * 3600 * 1000));
}

function formatHHmm(dateInput) {
    if (!dateInput) return '--:--';
    const thaiDate = getThaiDateFromUTC(dateInput);
    const nowThaiDate = getThaiDateFromUTC(getNow());

    const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
    const min = String(thaiDate.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${min}`;

    if (thaiDate.getUTCFullYear() === nowThaiDate.getUTCFullYear() &&
        thaiDate.getUTCMonth() === nowThaiDate.getUTCMonth() &&
        thaiDate.getUTCDate() === nowThaiDate.getUTCDate()) {
        return timeStr;
    } else {
        const dd = String(thaiDate.getUTCDate()).padStart(2, '0');
        const mm = String(thaiDate.getUTCMonth() + 1).padStart(2, '0');
        return `${dd}/${mm} ${timeStr}`;
    }
}

function formatDate(dateInput) {
    if (!dateInput) return '-';
    const thaiDate = getThaiDateFromUTC(dateInput);

    const dd = String(thaiDate.getUTCDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[thaiDate.getUTCMonth()];
    const yr = String(thaiDate.getUTCFullYear()).slice(-2);

    const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
    const min = String(thaiDate.getUTCMinutes()).padStart(2, '0');

    return `${dd}/${month}/${yr} ${hh}:${min}`;
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

        // Check if boss is Invasion & next spawn is past midnight of death date
        const bossId = document.getElementById('dead-boss-id').value;
        const currentBoss = bosses.find(b => b.id === bossId);
        const noTimeBtn = document.getElementById('btn-no-time-dead');

        const deathDateEndMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - (7 * 3600 * 1000);
        const isPastMidnight = nextSpawnMs > deathDateEndMs;

        if (currentBoss && currentBoss.server_type === 'invasion' && isPastMidnight) {
            if (noTimeBtn) noTimeBtn.style.display = 'inline-block';
        } else {
            if (noTimeBtn) noTimeBtn.style.display = 'none';
        }
    } else {
        previewEl.textContent = '';
        const noTimeBtn = document.getElementById('btn-no-time-dead');
        if (noTimeBtn) noTimeBtn.style.display = 'none';
    }
}

window.handleNoTimeDeath = async function () {
    if (!supabaseClient) return;
    const id = document.getElementById('dead-boss-id').value;
    const boss = bosses.find(b => b.id === id);
    if (!boss) return;

    const payload = {
        last_death_time: null,
        next_spawn_time: null,
        use_first_spawn: false
    };

    const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
    if (error) {
        swalDark.fire('Error', "Error resetting time: " + error.message, 'error');
    } else {
        addLog("ClearTimer", boss.name, "ตั้งค่าไม่ระบุเวลา (--:--) (ข้ามเที่ยงคืน)", boss.server_type);
        closeModal('dead-modal');
        fetchBosses();
    }
};

// Add event listener once
const deadTimeInput = document.getElementById('dead-time');
const deadDateInput = document.getElementById('dead-date');
if (deadTimeInput) deadTimeInput.addEventListener('input', updateSpawnPreview);
if (deadDateInput) deadDateInput.addEventListener('input', updateSpawnPreview);

window.openDeadModal = async function (id) {
    const boss = bosses.find(b => b.id === id);
    if (!boss) return;

    const nameParts = (boss.name || '').split('/');
    const nameThai = nameParts[0] ? nameParts[0].trim() : boss.name;

    if (boss.next_spawn_time) {
        const nextTime = new Date(boss.next_spawn_time).getTime();
        if (nextTime > getNow()) {
            const result = await swalDark.fire({
                title: 'บอสยังไม่เกิด!',
                text: 'เวลายังไม่ถึงกำหนดเกิด คุณแน่ใจหรือไม่ว่าบอสตายแล้ว (เกิดก่อนเวลา)?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'ดำเนินการต่อ',
                cancelButtonText: 'ยกเลิก'
            });
            if (!result.isConfirmed) return;
        }
    }

    currentDeadBossCooldown = boss.use_first_spawn ? (boss.first_spawn_mins || 0) : (boss.regular_respawn_mins || 0);

    document.getElementById('dead-boss-id').value = id;
    document.getElementById('dead-boss-name').textContent = nameThai;

    const lastSpawnEl = document.getElementById('dead-last-spawn');
    if (lastSpawnEl) {
        if (boss.next_spawn_time) {
            const nextTime = new Date(boss.next_spawn_time).getTime();
            if (nextTime <= getNow()) {
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
    const nowUTC = new Date(getNow());
    const thaiTimeMs = nowUTC.getTime() + (7 * 3600 * 1000);
    const thaiDate = new Date(thaiTimeMs);
    const yyyy = thaiDate.getUTCFullYear();
    const mm = String(thaiDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(thaiDate.getUTCDate()).padStart(2, '0');
    const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
    const min = String(thaiDate.getUTCMinutes()).padStart(2, '0');

    if (deadDateFP) {
        deadDateFP.setDate(`${yyyy}-${mm}-${dd}`);
    } else {
        document.getElementById('dead-date').value = `${yyyy}-${mm}-${dd}`;
    }
    document.getElementById('dead-time').value = `${hh}:${min}`;

    updateSpawnPreview();

    openModal('dead-modal');
}

window.editBoss = function (id) {
    const boss = bosses.find(b => b.id === id);
    if (!boss) return;

    document.getElementById('boss-id').value = boss.id;
    document.getElementById('boss-name').value = boss.name;

    document.getElementById('boss-first-h').value = Math.floor((boss.first_spawn_mins || 0) / 60);
    document.getElementById('boss-first-m').value = (boss.first_spawn_mins || 0) % 60;

    document.getElementById('boss-reg-h').value = Math.floor((boss.regular_respawn_mins || 0) / 60);
    document.getElementById('boss-reg-m').value = (boss.regular_respawn_mins || 0) % 60;

    document.getElementById('boss-use-first').checked = boss.use_first_spawn;
    document.getElementById('boss-active').checked = boss.is_active;
    document.getElementById('boss-spawn-rate').value = boss.spawn_rate_percent ?? 100;

    if (boss.server_type === 'invasion') {
        document.getElementById('boss-server-inv').checked = true;
    } else {
        document.getElementById('boss-server-home').checked = true;
    }
    const bothLabel = document.getElementById('label-boss-server-both');
    if (bothLabel) bothLabel.style.display = 'none';

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

    const serverType = document.querySelector('input[name="server_type"]:checked').value;

    const basePayload = {
        name: document.getElementById('boss-name').value,
        first_spawn_mins: (firstH * 60) + firstM,
        regular_respawn_mins: (regH * 60) + regM,
        use_first_spawn: document.getElementById('boss-use-first').checked,
        is_active: document.getElementById('boss-active').checked,
        spawn_rate_percent: parseInt(document.getElementById('boss-spawn-rate').value) || 100
    };

    if (id) {
        const payload = { ...basePayload, server_type: serverType };
        const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
        if (error) {
            swalDark.fire('Error', "Error updating: " + error.message, 'error');
        } else {
            addLog("Edit", payload.name, "แก้ไขข้อมูลบอส", serverType);
        }
    } else {
        if (serverType === 'both') {
            const payloadHome = { ...basePayload, server_type: 'home' };
            const payloadInv = { ...basePayload, server_type: 'invasion' };
            const { error } = await supabaseClient.from('bosses').insert([payloadHome, payloadInv]);
            if (error) {
                swalDark.fire('Error', "Error creating: " + error.message, 'error');
            } else {
                addLog("Add", basePayload.name, "เพิ่มบอสใหม่ (ทั้ง 2 เซิร์ฟเวอร์)", 'home');
            }
        } else {
            const payload = { ...basePayload, server_type: serverType };
            const { error } = await supabaseClient.from('bosses').insert([payload]);
            if (error) {
                swalDark.fire('Error', "Error creating: " + error.message, 'error');
            } else {
                addLog("Add", payload.name, "เพิ่มบอสใหม่", serverType);
            }
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
        next_spawn_time: nextSpawnDate.toISOString(),
        use_first_spawn: false
    };

    const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
    if (error) {
        swalDark.fire('Error', "Error saving death time: " + error.message, 'error');
    } else {
        const mmFormat = String(m).padStart(2, '0');
        const ddFormat = String(d).padStart(2, '0');
        const hhFormat = String(inputHours).padStart(2, '0');
        const minFormat = String(inputMins).padStart(2, '0');
        
        let oldDeadStr = "ยังไม่ระบุ";
        if (boss.last_death_time) {
            const oldD = new Date(boss.last_death_time);
            const oldThaiMs = oldD.getTime() + (7 * 3600 * 1000);
            const oldT = new Date(oldThaiMs);
            const oDD = String(oldT.getUTCDate()).padStart(2, '0');
            const oMM = String(oldT.getUTCMonth() + 1).padStart(2, '0');
            const oHH = String(oldT.getUTCHours()).padStart(2, '0');
            const oMin = String(oldT.getUTCMinutes()).padStart(2, '0');
            oldDeadStr = `${oDD}/${oMM} ${oHH}:${oMin}`;
        }
        const newDeadStr = `${ddFormat}/${mmFormat} ${hhFormat}:${minFormat}`;
        
        addLog("Dead", boss.name, `บันทึกเวลาตาย (เปลี่ยนจาก ${oldDeadStr} เป็น ${newDeadStr})`, boss.server_type);
    }

    closeModal('dead-modal');
    fetchBosses();
}

window.skipSpawn = async function (id) {
    if (!supabaseClient) return;

    const boss = bosses.find(b => b.id === id);
    if (!boss) return;

    let baseTimeMs;
    let isMissingTime = false;
    let currentNext = null;

    if (!boss.next_spawn_time) {
        baseTimeMs = getNow();
        isMissingTime = true;
        currentNext = new Date(baseTimeMs);
    } else {
        baseTimeMs = new Date(boss.next_spawn_time).getTime();
        currentNext = new Date(boss.next_spawn_time);
    }

    const isEarly = !isMissingTime && (baseTimeMs > getNow());
    const minsToAdd = boss.regular_respawn_mins || 0;
    const nextSpawnDate = new Date(baseTimeMs + (minsToAdd * 60000));

    // Format DD/MM HH:mm
    const thaiNextDate = getThaiDateFromUTC(nextSpawnDate);
    const nDD = String(thaiNextDate.getUTCDate()).padStart(2, '0');
    const nMM = String(thaiNextDate.getUTCMonth() + 1).padStart(2, '0');
    const nh = String(thaiNextDate.getUTCHours()).padStart(2, '0');
    const nm = String(thaiNextDate.getUTCMinutes()).padStart(2, '0');
    const displayFormatted = `${nDD}/${nMM} ${nh}:${nm}`;

    let htmlContent = `ต้องการบวกเวลาเกิด (Skip) ของ <span style="color: #facc15;">${boss.name}</span> ไปรอบถัดไปใช่หรือไม่?<br><br>
    <div style="background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3); color: #00f2fe; padding: 8px 14px; border-radius: 8px; display: inline-block; font-size: 0.95rem;">
        ⚡ เกิดรอบถัดไป: <strong>${displayFormatted}</strong>
    </div>`;

    if (isMissingTime) {
        htmlContent = `<p style="color: #00f2fe; margin-bottom: 12px; font-weight: bold; font-size: 0.9rem;">ℹ️ บอสยังไม่มีเวลาเกิด ระบบจะใช้ <span style="text-decoration: underline;">เวลาปัจจุบัน</span> เป็นฐานในการคำนวณ!</p>` + htmlContent;
    } else if (isEarly) {
        htmlContent = `<p style="color: #f59e0b; margin-bottom: 12px; font-weight: bold;">⚠️ บอสยังไม่ถึงเวลาเกิด!</p>` + htmlContent;
    }

    // Check if Invasion boss and nextSpawnDate passes midnight (Thai time) of currentNext
    const thaiCurrentNext = getThaiDateFromUTC(currentNext);
    const endOfThaiDayMs = Date.UTC(thaiCurrentNext.getUTCFullYear(), thaiCurrentNext.getUTCMonth(), thaiCurrentNext.getUTCDate(), 23, 59, 59, 999) - (7 * 3600 * 1000);
    const isPastMidnight = nextSpawnDate.getTime() > endOfThaiDayMs;
    const showNoTimeBtn = (boss.server_type === 'invasion') && isPastMidnight;

    const swalOptions = {
        title: 'ยืนยันบอสไม่เกิด?',
        html: htmlContent,
        icon: isEarly ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน (ไม่เกิด)',
        cancelButtonText: 'ยกเลิก'
    };

    if (showNoTimeBtn) {
        swalOptions.showDenyButton = true;
        swalOptions.denyButtonText = '🚫 ไม่ระบุเวลา (--:--)';
    }

    const result = await swalDark.fire(swalOptions);

    if (result.isDenied) {
        const payload = {
            last_death_time: null,
            next_spawn_time: null,
            use_first_spawn: false
        };
        const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
        if (error) {
            swalDark.fire('Error', "Error resetting time: " + error.message, 'error');
        } else {
            addLog("ClearTimer", boss.name, "ตั้งค่าไม่ระบุเวลา (--:--) (ข้ามเที่ยงคืน)", boss.server_type);
            fetchBosses();
        }
        return;
    }

    if (!result.isConfirmed) return;

    const payload = {
        last_death_time: currentNext.toISOString(),
        next_spawn_time: nextSpawnDate.toISOString(),
        use_first_spawn: false
    };

    const { error } = await supabaseClient.from('bosses').update(payload).eq('id', id);
    if (error) {
        swalDark.fire('Error', "Error skipping spawn: " + error.message, 'error');
    } else {
        let oldDeadStr = "ยังไม่ระบุ";
        if (boss.last_death_time) {
            const oldD = new Date(boss.last_death_time);
            const oldThaiMs = oldD.getTime() + (7 * 3600 * 1000);
            const oldT = new Date(oldThaiMs);
            const oDD = String(oldT.getUTCDate()).padStart(2, '0');
            const oMM = String(oldT.getUTCMonth() + 1).padStart(2, '0');
            const oHH = String(oldT.getUTCHours()).padStart(2, '0');
            const oMin = String(oldT.getUTCMinutes()).padStart(2, '0');
            oldDeadStr = `${oDD}/${oMM} ${oHH}:${oMin}`;
        }
        const newThaiMs = currentNext.getTime() + (7 * 3600 * 1000);
        const newT = new Date(newThaiMs);
        const nDD_dead = String(newT.getUTCDate()).padStart(2, '0');
        const nMM_dead = String(newT.getUTCMonth() + 1).padStart(2, '0');
        const nHH_dead = String(newT.getUTCHours()).padStart(2, '0');
        const nMin_dead = String(newT.getUTCMinutes()).padStart(2, '0');
        const newDeadStr = `${nDD_dead}/${nMM_dead} ${nHH_dead}:${nMin_dead}`;

        addLog("Skip", boss.name, `บอสไม่เกิด 1 รอบ (เปลี่ยนเวลาตายจาก ${oldDeadStr} เป็น ${newDeadStr})`, boss.server_type);
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
        customClass: { confirmButton: 'btn action-dead', cancelButton: 'btn btn-cancel' }
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

window.openLogModal = async function () {
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
        if (actionLabel === 'Skip') { actionLabel = 'ไม่เกิด'; actionColor = '#00f2fe'; }
        if (actionLabel === 'Add') { actionLabel = 'เพิ่ม'; actionColor = '#22c55e'; }
        if (actionLabel === 'Edit') { actionLabel = 'แก้ไข'; actionColor = '#eab308'; }
        if (actionLabel === 'Delete') { actionLabel = 'ลบ'; actionColor = '#ef4444'; }

        let serverBadge = '';
        if (log.server_context === 'invasion') {
            serverBadge = `<span style="font-size: 0.65rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.3); margin-right: 6px; white-space: nowrap;">⚔️ ศัตรู</span>`;
        } else {
            serverBadge = `<span style="font-size: 0.65rem; background: rgba(0, 242, 254, 0.1); color: #00f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0, 242, 254, 0.3); margin-right: 6px; white-space: nowrap;">🛡️ เรา</span>`;
        }

        html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 8px; font-size: 0.8rem; color: #94a3b8;">${formattedTime}</td>
                <td style="padding: 8px; font-weight: 500;">${log.boss_name}</td>
                <td style="padding: 8px; color: #a78bfa;">${log.editor_name}</td>
                <td style="padding: 8px;">
                    ${serverBadge}
                    <span style="color: ${actionColor}; font-size:0.75rem; border: 1px solid ${actionColor}; padding: 2px 6px; border-radius: 4px; margin-right: 6px; white-space: nowrap;">${actionLabel}</span>
                    <span style="font-size:0.85rem; color:#e2e8f0; word-break: break-word;">${log.details || ''}</span>
                </td>
            </tr>
        `;
    });
    document.getElementById('log-table-body').innerHTML = html;
}

// --- New Time Reset System ---

window.handleConfirmStep1 = async function (e) {
    e.preventDefault();
    if (!supabaseClient) return;

    const cb = document.getElementById('reset-clear-all-cb');
    const isChecked = cb && cb.checked;

    if (isChecked) {
        // Clear all boss times
        const result = await swalDark.fire({
            title: 'ยืนยันการล้างเวลาบอสทั้งหมด?',
            text: 'ข้อมูลเวลาตายล่าสุดและเวลาเกิดครั้งต่อไปจะหายไปทั้งหมด',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ใช่, ล้างข้อมูล',
            cancelButtonText: 'ยกเลิก',
            customClass: { confirmButton: 'btn action-dead', cancelButton: 'btn btn-cancel' }
        });

        if (!result.isConfirmed) return;

        swalDark.fire({
            title: '⏳ กำลังล้างเวลาบอส...',
            allowOutsideClick: false,
            didOpen: () => swalDark.showLoading()
        });

        try {
            const { error } = await supabaseClient
                .from('bosses')
                .update({ last_death_time: null, next_spawn_time: null, use_first_spawn: false })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all active bosses trick

            if (error) throw error;

            await addLog('ResetServer', 'ล้างเวลาทั้งหมด', 'ล้างเวลาเกิดและตายของบอสทั้งหมดเป็นค่าว่าง', 'home');
            await fetchBosses();
            closeModal('reset-modal-step1');

            swalDark.fire({
                icon: 'success',
                title: 'สำเร็จ!',
                text: 'ล้างเวลาบอสทั้งหมดเรียบร้อยแล้ว',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (err) {
            console.error("Clear boss times error:", err);
            swalDark.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถล้างเวลาได้', 'error');
        }
    } else {
        // Go to step 2
        closeModal('reset-modal-step1');
        const now = new Date(getNow());
        if (resetActualFP) resetActualFP.setDate(now);
        openModal('reset-modal-step2');
    }
};

window.handleConfirmStep2 = async function (e) {
    e.preventDefault();
    if (!supabaseClient) return;

    const actualDate = resetActualFP ? resetActualFP.selectedDates[0] : null;
    if (!actualDate) {
        swalDark.fire('กรุณาเลือกเวลา', 'กรุณาระบุเวลาเปิดเซิฟจริง', 'warning');
        return;
    }

    const actualTimeMs = actualDate.getTime();
    const actualStr = formatHHmm(actualDate);
    const scope = document.getElementById('reset-scope-step2') ? document.getElementById('reset-scope-step2').value : 'all';

    // Filter bosses with empty last_death_time
    let targetBosses = bosses.filter(b => b.is_active && !b.last_death_time);
    
    if (scope === 'home') {
        targetBosses = targetBosses.filter(b => b.server_type !== 'invasion');
    }
    
    if (targetBosses.length === 0) {
        swalDark.fire('ไม่พบบอสที่ต้องอัปเดต', 'ไม่มีบอสที่เวลาตายล่าสุดเป็นค่าว่าง', 'info');
        return;
    }

    // Calculate computed times
    let computedSpawns = [];
    
    for (const boss of targetBosses) {
        const hasFirstSpawn = (boss.first_spawn_mins && boss.first_spawn_mins > 0);
        let minsToAdd = 0;
        let useFirst = false;

        if (hasFirstSpawn) {
            minsToAdd = boss.first_spawn_mins;
            useFirst = true;
        } else {
            minsToAdd = boss.regular_respawn_mins || 0;
            useFirst = false;
        }

        const nextSpawnMs = actualTimeMs + (minsToAdd * 60 * 1000);
        const nextSpawnDate = new Date(nextSpawnMs);

        // Format for display
        const thaiDate = new Date(nextSpawnMs + (7 * 3600 * 1000));
        const nDD = String(thaiDate.getUTCDate()).padStart(2, '0');
        const nMM = String(thaiDate.getUTCMonth() + 1).padStart(2, '0');
        const nHH = String(thaiDate.getUTCHours()).padStart(2, '0');
        const nMin = String(thaiDate.getUTCMinutes()).padStart(2, '0');
        const displayTime = `${nDD}/${nMM} ${nHH}:${nMin}`;

        computedSpawns.push({
            id: boss.id,
            name: boss.name,
            server_type: boss.server_type,
            nextSpawnDate: nextSpawnDate,
            nextSpawnISO: nextSpawnDate.toISOString(),
            useFirstSpawn: useFirst,
            displayTime: displayTime
        });
    }

    // Sort for display
    computedSpawns.sort((a, b) => a.nextSpawnDate.getTime() - b.nextSpawnDate.getTime());

    // Generate HTML for Popup 3
    const homeSpawns = computedSpawns.filter(s => s.server_type !== 'invasion');
    const invSpawns = computedSpawns.filter(s => s.server_type === 'invasion');

    let htmlContent = `<div style="max-height: 300px; overflow-y: auto; text-align: left; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 0.9rem;">`;

    if (homeSpawns.length > 0) {
        htmlContent += `<div style="margin-bottom: 10px;">
            <div style="color: #00f2fe; font-weight: bold; border-bottom: 1px solid rgba(0, 242, 254, 0.3); padding-bottom: 4px; margin-bottom: 4px;">🛡️ เซิร์ฟเวอร์เรา (Home)</div>
            <table style="width: 100%; border-collapse: collapse;">
                <tbody>`;
        homeSpawns.forEach(item => {
            htmlContent += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 4px; color: #fff;">${item.name}</td>
                    <td style="padding: 4px; text-align: right; color: #00f2fe;">${item.displayTime}</td>
                </tr>`;
        });
        htmlContent += `</tbody></table></div>`;
    }

    if (invSpawns.length > 0) {
        htmlContent += `<div style="margin-bottom: 10px;">
            <div style="color: #fca5a5; font-weight: bold; border-bottom: 1px solid rgba(239, 68, 68, 0.3); padding-bottom: 4px; margin-bottom: 4px; margin-top: 10px;">⚔️ เซิร์ฟศัตรู (Invasion)</div>
            <table style="width: 100%; border-collapse: collapse;">
                <tbody>`;
        invSpawns.forEach(item => {
            htmlContent += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 4px; color: #fff;">${item.name}</td>
                    <td style="padding: 4px; text-align: right; color: #fca5a5;">${item.displayTime}</td>
                </tr>`;
        });
        htmlContent += `</tbody></table></div>`;
    }
    
    htmlContent += `</div>`;

    closeModal('reset-modal-step2');

    // Show Popup 3
    const confirmResult = await swalDark.fire({
        title: 'ตรวจสอบเวลาเกิดบอส',
        html: htmlContent,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '✅ ยืนยันการรีเซต',
        cancelButtonText: '❌ ยกเลิก',
        customClass: { confirmButton: 'btn secondary', cancelButton: 'btn btn-cancel' },
        width: '600px'
    });

    if (confirmResult.isConfirmed) {
        handleConfirmFinalReset(computedSpawns, actualStr);
    }
};

window.handleConfirmFinalReset = async function(computedSpawns, actualStr) {
    swalDark.fire({
        title: '⏳ กำลังบันทึกเวลาบอส...',
        allowOutsideClick: false,
        didOpen: () => swalDark.showLoading()
    });

    try {
        let updateCount = 0;
        
        for (const item of computedSpawns) {
            await supabaseClient
                .from('bosses')
                .update({
                    next_spawn_time: item.nextSpawnISO,
                    use_first_spawn: item.useFirstSpawn,
                    last_death_time: null
                })
                .eq('id', item.id);
            updateCount++;
        }

        await addLog('ResetServer', 'คำนวณเวลาหลังเปิดเซิฟ', `เปิดจริง: ${actualStr} (อัปเดต ${updateCount} ตัว)`, 'home');

        await fetchBosses();

        swalDark.fire({
            icon: 'success',
            title: '🔄 อัปเดตเวลาสำเร็จ!',
            text: `รีเซ็ตเวลาบอสเรียบร้อยแล้ว (${updateCount} ตัว)`,
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error("Final reset error:", err);
        swalDark.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถอัปเดตเวลาได้', 'error');
    }
};

// --- End New Time Reset System ---

// --- Disable DevTools & Right Click Protection ---
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
    }
    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (Inspect/Console/Elements)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (
        e.key === 'I' || e.key === 'i' ||
        e.key === 'J' || e.key === 'j' ||
        e.key === 'C' || e.key === 'c' ||
        e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67
    )) {
        e.preventDefault();
        return false;
    }
    // Ctrl+U (View Source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
        e.preventDefault();
        return false;
    }
});

window.openAccessLogModal = async function () {
    if (currentUserRole === 'viewer') return;

    const { value: pin } = await swalDark.fire({
        title: '🔒 ยืนยันสิทธิ์',
        text: 'กรุณากรอกรหัสผ่านเพื่อดู IP Address',
        input: 'password',
        inputPlaceholder: 'รหัสผ่าน',
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก',
        preConfirm: (pin) => {
            if (pin !== 'nomercy') {
                Swal.showValidationMessage('รหัสผ่านไม่ถูกต้อง');
            }
            return pin;
        }
    });

    if (!pin) return;

    openModal('access-log-modal');
    const tbody = document.getElementById('access-log-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">กำลังโหลดข้อมูล...</td></tr>';

    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('user_access_logs')
        .select('*')
        .order('login_time', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error fetching access logs:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ef4444;">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        return;
    }

    if (tbody) {
        tbody.innerHTML = '';
        if (data && data.length > 0) {
            // Group by IP and Username
            const groupedLogs = {};
            data.forEach(log => {
                const key = `${log.ip_address || '-'}_${log.username}`;
                if (!groupedLogs[key]) {
                    groupedLogs[key] = {
                        ip: log.ip_address || '-',
                        username: log.username,
                        role: log.role,
                        times: []
                    };
                }
                const logTime = new Date(log.login_time);
                const formatTime = `${logTime.toLocaleDateString('th-TH')} ${logTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
                groupedLogs[key].times.push(formatTime);
            });

            Object.values(groupedLogs).forEach(group => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

                let roleHtml = '';
                if (group.role === 'admin') {
                    roleHtml = '<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4);">Admin</span>';
                } else {
                    roleHtml = '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4);">Viewer</span>';
                }

                let timesDisplay = group.times.slice(0, 3).join('<br>');
                if (group.times.length > 3) {
                    timesDisplay += `<br><span style="color: #64748b; font-size: 0.75rem;">และอีก ${group.times.length - 3} ครั้ง...</span>`;
                }

                tr.innerHTML = `
                    <td style="padding: 12px 10px; vertical-align: top; font-family: monospace; font-size: 0.85rem; line-height: 1.5;">${timesDisplay}</td>
                    <td style="padding: 12px 10px; vertical-align: top; color: #facc15; font-weight: 500;">${group.username}</td>
                    <td style="padding: 12px 10px; vertical-align: top;">${roleHtml}</td>
                    <td style="padding: 12px 10px; vertical-align: top; font-family: monospace; color: #94a3b8;">${group.ip}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">ยังไม่มีประวัติการเข้าใช้งาน</td></tr>';
        }
    }
}

// --- Schedule Logic ---
let isScheduleView = false;
window.toggleScheduleView = function () {
    isScheduleView = !isScheduleView;
    const mainContent = document.getElementById('main-content');
    const scheduleContent = document.getElementById('schedule-main-content');
    const toggleBtn = document.getElementById('toggle-schedule-btn');
    const invasionBtn = document.getElementById('invasion-btn');
    const searchBox = document.querySelector('.search-box');

    if (isScheduleView) {
        mainContent.style.display = 'none';
        scheduleContent.style.display = 'block';
        toggleBtn.textContent = '🛡️ กลับหน้าบอส';
        toggleBtn.style.background = 'linear-gradient(135deg, #0ea5e9, #2563eb)';
        if (invasionBtn) invasionBtn.style.display = 'none';
        if (searchBox) searchBox.style.display = 'none';

        const addBossBtn = document.getElementById('add-boss-btn');
        const resetBossBtn = document.getElementById('reset-boss-btn');
        if (addBossBtn) addBossBtn.style.display = 'none';
        if (resetBossBtn) resetBossBtn.style.display = 'none';

        renderSchedule();
        if (typeof checkScheduleNotifications === 'function') checkScheduleNotifications();
    } else {
        mainContent.style.display = 'block';
        scheduleContent.style.display = 'none';
        toggleBtn.textContent = '📅 ตารางกิจกรรม';
        toggleBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
        if (invasionBtn) invasionBtn.style.display = 'inline-flex';
        if (searchBox) searchBox.style.display = 'flex';

        applyRoleUI();
    }
}

let scheduleEvents = [];

window.fetchScheduleEvents = async function () {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('schedule_events')
        .select('*')
        .order('time', { ascending: true });

    if (error) {
        console.error('Error fetching schedule events:', error);
        return;
    }

    // Map DB column names to JS object names
    scheduleEvents = (data || []).map(row => ({
        id: row.id,
        day: row.day,
        time: row.time,
        title: row.title,
        isVisible: row.is_visible
    }));

    renderSchedule();
}

window.renderSchedule = function () {
    const grid = document.getElementById('schedule-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const days = [
        { id: '1', name: 'จันทร์' },
        { id: '2', name: 'อังคาร' },
        { id: '3', name: 'พุธ' },
        { id: '4', name: 'พฤหัสบดี' },
        { id: '5', name: 'ศุกร์' },
        { id: '6', name: 'เสาร์' },
        { id: '0', name: 'อาทิตย์' }
    ];

    days.forEach(day => {
        const col = document.createElement('div');
        col.className = 'schedule-day-column';
        col.id = `schedule-day-col-${day.id}`;
        col.innerHTML = `<div class="schedule-day-header">${day.name}</div>`;

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'schedule-events-container';

        const dayEvents = scheduleEvents.filter(e => e.day === day.id);
        // Ensure sorted by time
        dayEvents.sort((a, b) => a.time.localeCompare(b.time));

        dayEvents.forEach(ev => {
            const card = document.createElement('div');
            card.className = 'schedule-event-card' + (ev.isVisible ? '' : ' hidden-event');
            card.id = `schedule-event-card-${ev.id}`;
            card.dataset.time = ev.time;
            card.onclick = () => openScheduleModal(ev.id);

            const visibilityIcon = ev.isVisible ? '' : '<span class="event-visibility-icon" title="ซ่อนอยู่">👁️‍🗨️</span>';

            card.innerHTML = `
                ${visibilityIcon}
                <div class="event-time">${ev.time}</div>
                <div class="event-title">${ev.title}</div>
            `;
            eventsContainer.appendChild(card);
        });

        col.appendChild(eventsContainer);
        grid.appendChild(col);
    });

    if (typeof updateScheduleHighlights === 'function') {
        updateScheduleHighlights();
    }
}

window.updateScheduleHighlights = function () {
    if (!isScheduleView) return;

    const now = getNow();
    const thaiDate = new Date(now + (7 * 3600 * 1000));
    const currentDay = String(thaiDate.getUTCDay());
    const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
    const mm = String(thaiDate.getUTCMinutes()).padStart(2, '0');
    const currentTimeStr = `${hh}:${mm}`;

    // Remove all highlights first
    document.querySelectorAll('.schedule-day-column').forEach(el => el.classList.remove('current-day-highlight'));
    document.querySelectorAll('.schedule-event-card').forEach(el => {
        el.classList.remove('current-event-highlight', 'next-event-highlight');
    });

    // Highlight current day column
    const currentDayCol = document.getElementById(`schedule-day-col-${currentDay}`);
    if (currentDayCol) {
        currentDayCol.classList.add('current-day-highlight');
    }

    // Find current and next events for today
    const todayEvents = scheduleEvents.filter(e => e.day === currentDay && e.isVisible).sort((a, b) => a.time.localeCompare(b.time));
    
    let currentEventId = null;
    let nextEventId = null;

    for (let i = 0; i < todayEvents.length; i++) {
        if (todayEvents[i].time === currentTimeStr) {
            currentEventId = todayEvents[i].id;
        } else if (todayEvents[i].time > currentTimeStr && !nextEventId) {
            nextEventId = todayEvents[i].id;
        }
    }

    if (currentEventId) {
        const el = document.getElementById(`schedule-event-card-${currentEventId}`);
        if (el) el.classList.add('current-event-highlight');
    }
    if (nextEventId) {
        const el = document.getElementById(`schedule-event-card-${nextEventId}`);
        if (el) el.classList.add('next-event-highlight');
    }
}

window.checkScheduleNotifications = function() {
    if (!scheduleEvents || scheduleEvents.length === 0) return;

    const now = getNow();
    const thaiDate = new Date(now + (7 * 3600 * 1000));
    const currentDay = String(thaiDate.getUTCDay());
    const hh = String(thaiDate.getUTCHours()).padStart(2, '0');
    const mm = String(thaiDate.getUTCMinutes()).padStart(2, '0');
    const currentTimeStr = `${hh}:${mm}`;
    const todayDateStr = `${thaiDate.getUTCFullYear()}-${thaiDate.getUTCMonth()}-${thaiDate.getUTCDate()}`;

    // Find current event for today
    const todayEvents = scheduleEvents.filter(e => e.day === currentDay && e.isVisible).sort((a, b) => a.time.localeCompare(b.time));
    
    let currentEventId = null;
    for (let i = 0; i < todayEvents.length; i++) {
        if (todayEvents[i].time === currentTimeStr) {
            currentEventId = todayEvents[i].id;
        }
    }

    const dotEl = document.getElementById('schedule-notification-dot');
    if (!dotEl) return;

    if (currentEventId) {
        // We have an active event
        const trackingKey = `${currentEventId}_${todayDateStr}`;
        const acknowledgedKey = localStorage.getItem('acknowledged_schedule_event');

        if (acknowledgedKey !== trackingKey) {
            // Not acknowledged yet, show dot if not in schedule view
            if (!isScheduleView) {
                dotEl.style.display = 'block';
            }
            
            // If they are currently looking at the schedule view, auto-acknowledge
            if (isScheduleView) {
                localStorage.setItem('acknowledged_schedule_event', trackingKey);
                dotEl.style.display = 'none';
            }
        } else {
            // Already acknowledged
            dotEl.style.display = 'none';
        }
    } else {
        // No active event
        dotEl.style.display = 'none';
    }
}

window.openScheduleModal = function (id = null) {
    if (currentUserRole === 'viewer') return; // Prevent viewers from opening the modal

    const form = document.getElementById('schedule-form');
    if (!form) return;
    form.reset();

    const delBtn = document.getElementById('btn-delete-schedule');
    const modalTitle = document.getElementById('schedule-modal-title');

    if (id) {
        const ev = scheduleEvents.find(e => e.id === id);
        if (ev) {
            document.getElementById('schedule-id').value = ev.id;
            document.getElementById('schedule-day').value = ev.day;
            document.getElementById('schedule-time').value = ev.time;
            document.getElementById('schedule-title').value = ev.title;
            document.getElementById('schedule-is-visible').checked = ev.isVisible;
            if (delBtn) delBtn.style.display = 'inline-block';
            if (modalTitle) modalTitle.textContent = 'แก้ไขกิจกรรม';
        }
    } else {
        document.getElementById('schedule-id').value = '';
        if (delBtn) delBtn.style.display = 'none';
        if (modalTitle) modalTitle.textContent = 'เพิ่มกิจกรรม';
    }

    openModal('schedule-modal');
}

document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchScheduleEvents();

    const sForm = document.getElementById('schedule-form');
    if (sForm) {
        sForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (currentUserRole === 'viewer') return;

            const id = document.getElementById('schedule-id').value;
            const day = document.getElementById('schedule-day').value;
            const time = document.getElementById('schedule-time').value;
            const title = document.getElementById('schedule-title').value;
            const isVisible = document.getElementById('schedule-is-visible').checked;

            const payload = {
                day: day,
                time: time,
                title: title,
                is_visible: isVisible
            };

            if (id) {
                // Update existing event
                const { error } = await supabaseClient.from('schedule_events').update(payload).eq('id', id);
                if (error) {
                    console.error('Error updating event:', error);
                    swalDark.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
                }
            } else {
                // Insert new event
                const { error } = await supabaseClient.from('schedule_events').insert([payload]);
                if (error) {
                    console.error('Error inserting event:', error);
                    swalDark.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเพิ่มข้อมูลได้', 'error');
                }
            }

            closeModal('schedule-modal');
            fetchScheduleEvents();
        });
    }
});

window.deleteScheduleEvent = async function () {
    if (currentUserRole === 'viewer') return;
    const id = document.getElementById('schedule-id').value;
    if (!id) return;

    const result = await swalDark.fire({
        title: 'ยืนยันการลบกิจกรรม',
        text: 'ต้องการลบกิจกรรมนี้ออกจากตารางหรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก',
        customClass: { confirmButton: 'btn action-dead', cancelButton: 'btn btn-cancel' }
    });

    if (result.isConfirmed) {
        const { error } = await supabaseClient.from('schedule_events').delete().eq('id', id);
        if (error) {
            console.error('Error deleting event:', error);
            swalDark.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error');
        } else {
            closeModal('schedule-modal');
            fetchScheduleEvents();
        }
    }
}
