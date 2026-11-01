(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EDUNEXA_CONFIG;
  if (!cfg || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const state = { school: null, areas: [], criteria: [], records: [], targets: [], area: '', mode: 'student', grade: '', className: '', student: '', criterion: '', seq: 0, stream: null };
  const el = (tag, label, className = '') => { const item = document.createElement(tag); item.textContent = label; item.className = className; return item; };
  const grades = () => [...new Set(classes().map(name => name.match(/^\d{1,2}/)?.[0]).filter(Boolean))];
  const classes = () => [...new Set(state.targets.map(item => state.mode === 'student' ? item.lop : item.ma_lop).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const students = () => state.targets.filter(item => item.lop === state.className);
  const chosenCriterion = () => state.criteria.find(item => item.id === state.criterion);
  function status(message, bad = false) { $('scoringStatus').textContent = message; $('scoringStatus').className = bad ? 'v029-alert error' : 'v029-alert ok'; }
  async function api(action, payload = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('Phiên đăng nhập đã hết hạn.');
    const response = await fetch(`${cfg.url}/functions/v1/quan-tri-truong`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.publishableKey, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ hanh_dong: action, truong_id: state.school?.id, du_lieu: payload }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || 'Yêu cầu không thực hiện được.');
    return result.du_lieu;
  }
  function choices(id, values, active, label, select) {
    const root = $(id); root.replaceChildren();
    for (const value of values) {
      const button = el('button', label(value), `v029-choice ${value === active ? 'selected' : ''}`);
      button.type = 'button'; button.setAttribute('aria-pressed', value === active ? 'true' : 'false'); button.onclick = () => select(value); root.append(button);
    }
    if (!values.length) root.append(el('small', 'Chưa có dữ liệu để lựa chọn.', 'v029-muted'));
  }
  function render() {
    const area = $('scoringArea'); area.replaceChildren();
    for (const item of state.areas) area.append(new Option(`${item.ma} · ${item.ten}`, item.id));
    area.value = state.area;
    choices('scoringGrades', grades(), state.grade, value => `Khối ${value}`, value => { state.grade = value; state.className = ''; state.student = ''; render(); });
    const search = $('scoringClassSearch').value.trim().toLocaleLowerCase('vi');
    const visibleClasses = classes().filter(value => (!state.grade || value.startsWith(state.grade)) && (!search || value.toLocaleLowerCase('vi').includes(search)));
    choices('scoringClasses', visibleClasses, state.className, value => value, value => { state.className = value; state.student = ''; render(); });
    $('scoringStudentMode').classList.toggle('selected', state.mode === 'student');
    $('scoringClassMode').classList.toggle('selected', state.mode === 'class');
    $('scoringStudentBox').hidden = state.mode !== 'student';
    const studentSelect = $('scoringStudent'); studentSelect.replaceChildren(); studentSelect.append(new Option('— Chọn học sinh —', ''));
    for (const item of students()) studentSelect.append(new Option(`${item.ho_ten} · ${item.ma_dinh_danh}`, item.ma_dinh_danh));
    studentSelect.value = state.student;
    $('scoringStudentCount').textContent = state.className ? `${students().length} học sinh trong ${state.className}` : 'Chọn lớp để xem danh sách học sinh';
    const actions = $('scoringActions'); actions.replaceChildren();
    const list = state.criteria.filter(item => item.mang_id === state.area && item.doi_tuong === state.mode);
    for (const item of list) {
      const score = item.che_do_diem === 'flexible' ? `đến ${item.diem_gioi_han ?? item.diem} điểm` : `${item.diem_co_dinh ?? item.diem} điểm`;
      const button = el('button', `${item.ten} · ${score}`, `v029-action ${state.criterion === item.id ? 'selected' : ''}`);
      button.type = 'button'; button.setAttribute('aria-pressed', state.criterion === item.id ? 'true' : 'false');
      button.onclick = () => { state.criterion = item.id; render(); }; actions.append(button);
    }
    if (!list.length) actions.append(el('small', 'Không có tiêu chí phù hợp trong mảng và hình thức chấm này.', 'v029-muted'));
    const item = chosenCriterion();
    $('scoringScoreLabel').hidden = item?.che_do_diem !== 'flexible'; $('scoringScore').required = item?.che_do_diem === 'flexible';
    $('scoringSave').disabled = !item || !state.className || (state.mode === 'student' && !state.student);
    const student = students().find(row => row.ma_dinh_danh === state.student);
    $('scoringSummary').textContent = item ? `${state.mode === 'student' ? student?.ho_ten || 'Chưa chọn học sinh' : state.className || 'Chưa chọn lớp'} · ${item.ten}` : 'Chọn một lệnh ghi nhận ở trên.';
    const recent = $('scoringRecent'); recent.replaceChildren();
    const records = state.records.filter(row => !state.className || row.doi_tuong_ma === state.className || students().some(s => s.ma_dinh_danh === row.doi_tuong_ma));
    for (const row of records.slice(0, 20)) recent.append(el('div', `${row.ngay_ghi_nhan} · ${row.ten_tieu_chi || row.ma_tieu_chi} · ${row.doi_tuong_ma} · ${row.trang_thai === 'void' ? 'Ngừng hiệu lực' : 'Đã ghi'}`, 'v029-recent-row'));
    if (!records.length) recent.append(el('small', 'Chưa có ghi nhận trong phạm vi đang xem.', 'v029-muted'));
  }
  async function loadTargets() {
    const seq = ++state.seq;
    state.targets = []; state.grade = ''; state.className = ''; state.student = ''; $('scoringClassSearch').value = ''; render();
    if (!state.area) return;
    try {
      const data = await api('ghi_nhan_targets', { mang_id: state.area, doi_tuong: state.mode });
      if (seq !== state.seq) return;
      state.targets = Array.isArray(data?.items) ? data.items : [];
      render(); status(state.targets.length ? `Đã tải ${state.targets.length} ${state.mode === 'student' ? 'học sinh' : 'lớp'}.` : 'Chưa có học sinh/lớp. Hãy nhập hồ sơ và kiểm tra phân công.');
    } catch (error) { if (seq === state.seq) status(`Không tải được danh sách: ${error.message}`, true); }
  }
  async function load() {
    try {
      status('Đang tải dữ liệu thi đua...');
      const context = await api('boi_canh');
      state.school = (context.schools || []).find(item => item.ma_truong === $('schoolCode')?.textContent.trim());
      if (!state.school) throw Error('Không xác định được trường đang chọn.');
      const [areas, criteria, records] = await Promise.all([api('mang_list'), api('tieuchi_list'), api('ghi_nhan_list')]);
      state.areas = Array.isArray(areas) ? areas : []; state.criteria = Array.isArray(criteria) ? criteria : []; state.records = Array.isArray(records) ? records : [];
      if (!state.areas.some(item => item.id === state.area)) state.area = state.areas[0]?.id || '';
      state.criterion = ''; await loadTargets();
    } catch (error) { status(`Không tải được màn hình: ${error.message}`, true); }
  }
  function stopCamera() { if (state.stream) state.stream.getTracks().forEach(track => track.stop()); state.stream = null; const video = $('scoringVideo'); video.pause(); video.srcObject = null; video.hidden = true; }
  async function scanQr() {
    if (!state.className) { status('Chọn lớp trước khi quét QR.', true); return; }
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { status('Trình duyệt chưa hỗ trợ quét QR. Hãy chọn học sinh trong danh sách.', true); return; }
    const video = $('scoringVideo');
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = state.stream; video.hidden = false; await video.play();
      const detect = async () => {
        if (!state.stream) return;
        try {
          const codes = await detector.detect(video); const code = codes[0]?.rawValue?.trim();
          if (code) { const student = students().find(item => item.ma_dinh_danh === code); stopCamera(); if (!student) status('QR không thuộc danh sách học sinh lớp đã chọn.', true); else { state.student = code; render(); status(`Đã chọn ${student.ho_ten} từ QR.`); } return; }
        } catch (error) { stopCamera(); status(`Không đọc được QR: ${error.message}`, true); return; }
        requestAnimationFrame(detect);
      }; requestAnimationFrame(detect);
    } catch (error) { stopCamera(); status(`Không mở được camera: ${error.message}`, true); }
  }
  async function save(event) {
    event.preventDefault(); const item = chosenCriterion();
    if (!item || !state.className || (state.mode === 'student' && !state.student)) { status('Hãy chọn lớp, học sinh và lệnh ghi nhận.', true); return; }
    if (!item.chu_ky?.includes($('scoringCycle').value)) { status('Chu kỳ này không áp dụng cho tiêu chí đã chọn.', true); return; }
    $('scoringSave').disabled = true;
    try {
      await api('ghi_nhan_create', { mang_id: state.area, tieu_chi_id: item.id, doi_tuong: state.mode, doi_tuong_ma: state.mode === 'student' ? state.student : state.className, chu_ky: $('scoringCycle').value, ngay_ghi_nhan: $('scoringDate').value, gia_tri_thuc_te: item.che_do_diem === 'flexible' ? $('scoringScore').value : '', noi_dung: $('scoringContent').value.trim(), minh_chung: $('scoringEvidence').value.trim() ? [{ ref: $('scoringEvidence').value.trim() }] : [] });
      state.records = await api('ghi_nhan_list'); $('scoringContent').value = ''; $('scoringEvidence').value = ''; $('scoringScore').value = ''; render(); status('Đã ghi nhận thi đua vào CSDL.');
    } catch (error) { render(); status(`Không lưu được: ${error.message}`, true); }
  }
  function open() {
    document.querySelectorAll('.b43page').forEach(page => { page.hidden = true; }); $('v024Panel').hidden = true; $('b43-scoring').hidden = false;
    document.querySelectorAll('[data-b43-tab]').forEach(button => button.classList.toggle('selected', button.id === 'scoringTab')); $('v024Tab')?.classList.remove('selected');
    $('b43-scoring').scrollIntoView({ behavior: 'smooth', block: 'start' }); void load();
  }
  function init() {
    const tabs = document.querySelector('.b43tabs'), host = $('b43'); if (!tabs || !host || $('b43-scoring')) return;
    const tab = el('button', '⭐ Chấm thi đua', 'outline'); tab.id = 'scoringTab'; tab.type = 'button'; tab.dataset.b43Tab = 'scoring'; tab.onclick = open; tabs.append(tab);
    const card = el('article', '', 'v029-dashboard-card'); card.tabIndex = 0; card.setAttribute('role', 'button'); card.append(el('strong', '⭐ Chấm thi đua'), el('small', 'Chọn khối, lớp, học sinh và nội dung'), el('span', 'Mở màn hình ghi nhận')); card.onclick = open; card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }; document.querySelector('.dashboard-modules')?.append(card);
    const panel = document.createElement('section'); panel.id = 'b43-scoring'; panel.className = 'b43page v029-panel'; panel.hidden = true;
    panel.innerHTML = `<div class="v029-hero"><div class="v029-hero-icon">⭐</div><div><small>THI ĐUA HỌC SINH</small><h2>Chấm điểm thi đua</h2><p>Chọn khối, lớp, học sinh và nội dung thực tế.</p></div></div><p id="scoringStatus" role="status" aria-live="polite"></p><div class="v029-step-track"><span>1 Chọn khối</span><span>2 Chọn lớp</span><span>3 Hình thức chấm</span><span>4 Ghi nhận</span></div><div class="v029-top-grid"><section class="v029-tile"><h3><b>1</b> Chọn khối</h3><div id="scoringGrades" class="v029-choices"></div></section><section class="v029-tile"><h3><b>2</b> Chọn lớp</h3><input id="scoringClassSearch" type="search" placeholder="Tìm lớp…" aria-label="Tìm lớp"><div id="scoringClasses" class="v029-choices v029-classes"></div></section></div><section class="v029-tile"><h3><b>3</b> Chọn hình thức chấm</h3><div class="v029-mode-grid"><button id="scoringStudentMode" type="button" class="v029-mode selected">👤 Cá nhân<small>Ghi nhận cho từng học sinh</small></button><button id="scoringClassMode" type="button" class="v029-mode">👥 Tập thể<small>Ghi nhận cho lớp</small></button></div></section><section class="v029-tile"><h3><b>4</b> Thực hiện chấm điểm</h3><label class="v029-area-label">Mảng thi đua<select id="scoringArea"></select></label><div id="scoringStudentBox"><label>Chọn học sinh <small id="scoringStudentCount"></small><select id="scoringStudent"></select></label><button id="scoringScan" type="button" class="outline">▦ Quét QR học sinh</button><video id="scoringVideo" playsinline hidden></video></div><h4>Chọn nội dung ghi nhận</h4><div id="scoringActions" class="v029-actions"></div><form id="scoringForm"><p id="scoringSummary" class="v029-summary"></p><div class="v029-form-grid"><label>Chu kỳ<select id="scoringCycle"><option value="week">Tuần</option><option value="month">Tháng</option><option value="semester">Học kỳ</option><option value="year">Năm học</option></select></label><label>Ngày ghi nhận<input id="scoringDate" type="date" required></label><label id="scoringScoreLabel" hidden>Điểm thực tế<input id="scoringScore" type="number" step="0.01"></label></div><label>Nội dung chi tiết<textarea id="scoringContent" rows="2" maxlength="2000" placeholder="Ví dụ: đi muộn 10 phút"></textarea></label><label>Minh chứng (URL hoặc mã tài liệu)<input id="scoringEvidence" maxlength="500"></label><button id="scoringSave" type="submit" disabled>💾 Ghi nhận vào CSDL</button></form></section><section class="v029-tile"><h3>Ghi nhận gần đây</h3><div id="scoringRecent" class="v029-recent"></div></section>`;
    host.append(panel); $('scoringDate').value = new Date().toLocaleDateString('en-CA');
    $('scoringClassSearch').oninput = render; $('scoringArea').onchange = event => { state.area = event.target.value; state.criterion = ''; void loadTargets(); };
    $('scoringStudentMode').onclick = () => { state.mode = 'student'; state.criterion = ''; void loadTargets(); }; $('scoringClassMode').onclick = () => { state.mode = 'class'; state.criterion = ''; void loadTargets(); };
    $('scoringStudent').onchange = event => { state.student = event.target.value; render(); }; $('scoringScan').onclick = scanQr; $('scoringForm').onsubmit = save;
    document.querySelectorAll('[data-b43-tab]:not(#scoringTab), #v024Tab').forEach(button => button.addEventListener('click', stopCamera)); window.edunexaScoringOpen = open;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
