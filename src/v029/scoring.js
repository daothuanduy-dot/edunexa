(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cfg = window.EDUNEXA_CONFIG;
  if (!cfg || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const state = { school: null, areas: [], criteria: [], members: [], assignments: [], records: [], targets: { student: [], class: [] }, filters: { grade: '', className: '', search: '' } };
  let tabButton = null;
  let panel = null;

  const make = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  async function request(action, data = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('ChÆ°a Ä‘Äƒng nháº­p');
    const response = await fetch(`${cfg.url}/functions/v1/quan-tri-truong`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ hanh_dong: action, ...data }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || 'KhÃ´ng xá»­ lÃ½ Ä‘Æ°á»£c yÃªu cáº§u');
    return result.du_lieu;
  }

  async function schoolApi(action, duLieu = {}) {
    if (!state.school?.id) await resolveSchool();
    return request(action, { truong_id: state.school.id, du_lieu: duLieu });
  }

  async function resolveSchool() {
    const context = await request('boi_canh');
    const code = $('schoolCode')?.textContent.trim();
    state.school = (context.schools || []).find(item => item.ma_truong === code);
    if (!state.school) throw Error('KhÃ´ng xÃ¡c Ä‘á»‹nh Ä‘Æ°á»£c trÆ°á»ng Ä‘ang chá»n');
  }

  function setNotice(message, isError = false) {
    const notice = $('v029ScoringNotice');
    if (notice) {
      notice.textContent = message;
      notice.className = isError ? 'error' : 'ok';
    }
  }

  function selectedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }

  function selectedCriterion() {
    return state.criteria.find(item => item.id === $('v029RecordCriterion')?.value);
  }

  function renderAreaOptions() {
    const selects = [$('v029AssignmentArea'), $('v029RecordArea')].filter(Boolean);
    for (const select of selects) {
      const previous = select.value;
      select.replaceChildren();
      for (const area of state.areas) select.append(make('option', { value: area.id, textContent: `${area.ma} Â· ${area.ten}` }));
      if (state.areas.some(area => area.id === previous)) select.value = previous;
    }
    fillCriteriaOptions();
  }

  function fillCriteriaOptions() {
    const select = $('v029RecordCriterion');
    if (!select) return;
    const areaId = $('v029RecordArea').value;
    const previous = select.value;
    select.replaceChildren();
    for (const criterion of state.criteria.filter(item => item.mang_id === areaId)) {
      const mode = criterion.che_do_diem === 'flexible'
        ? `linh hoáº¡t â‰¤ ${criterion.diem_gioi_han ?? criterion.diem}`
        : `cá»‘ Ä‘á»‹nh ${criterion.diem_co_dinh ?? criterion.diem}`;
      select.append(make('option', { value: criterion.id, textContent: `${criterion.ma} Â· ${criterion.ten} Â· ${mode}` }));
    }
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    syncCriterionHint();
    renderCriteriaActions();
  }

  function syncCriterionHint() {
    const criterion = selectedCriterion();
    const hint = $('v029CriterionHint');
    const valueInput = $('v029RecordValue');
    if (!criterion) {
      if (hint) hint.textContent = 'Máº£ng Ä‘ang chá»n chÆ°a cÃ³ tiÃªu chÃ­.';
      if (valueInput) valueInput.required = false;
      return;
    }
    const mode = criterion.che_do_diem === 'flexible'
      ? `Äiá»ƒm linh hoáº¡t, giá»›i háº¡n ${criterion.diem_gioi_han ?? criterion.diem}`
      : `Äiá»ƒm cá»‘ Ä‘á»‹nh ${criterion.diem_co_dinh ?? criterion.diem}`;
    if (hint) hint.textContent = `${mode}. Äá»‘i tÆ°á»£ng Ã¡p dá»¥ng: ${criterion.doi_tuong === 'student' ? 'cÃ¡ nhÃ¢n' : 'táº­p thá»ƒ/lá»›p'}.`;
    if (valueInput) {
      valueInput.required = criterion.che_do_diem === 'flexible';
      valueInput.disabled = criterion.che_do_diem !== 'flexible';
      if (criterion.che_do_diem !== 'flexible') valueInput.value = '';
    }
    const target = document.querySelector(`input[name="v029RecordTarget"][value="${criterion.doi_tuong}"]`);
    if (target) target.checked = true;
    void loadTargets();
  }

  async function loadTargets() {
    const areaId = $('v029RecordArea')?.value;
    const targetType = selectedValue('v029RecordTarget');
    const select = $('v029RecordTargetSelect');
    const manualLabel = $('v029RecordTargetManualLabel');
    const manual = $('v029RecordTargetManual');
    const hint = $('v029RecordTargetHint');
    if (!areaId || !targetType || !select || !manualLabel || !manual || !hint) return;
    try {
      const result = await schoolApi('ghi_nhan_targets', { mang_id: areaId, doi_tuong: targetType });
      const items = Array.isArray(result) ? result : (Array.isArray(result?.items) ? result.items : []);
      state.targets[targetType] = items;
      select.replaceChildren();
      for (const item of items) {
        const code = targetType === 'student' ? item.ma_dinh_danh : item.ma_lop;
        const label = targetType === 'student'
          ? `${item.ho_ten || code} Â· ${code}${item.lop ? ` Â· ${item.lop}` : ''}`
          : `${code} Â· ${item.so_hoc_sinh || 0} há»c sinh`;
        select.append(make('option', { value: code, textContent: label }));
      }
      const hasItems = items.length > 0;
      select.hidden = !hasItems;
      select.required = hasItems;
      manualLabel.hidden = hasItems;
      manual.required = !hasItems;
      hint.textContent = hasItems
        ? `ÄÃ£ táº£i ${items.length} ${targetType === 'student' ? 'há»c sinh' : 'lá»›p'} thuá»™c pháº¡m vi Ä‘Æ°á»£c phÃ©p ghi nháº­n.`
        : 'ChÆ°a cÃ³ Ä‘á»‘i tÆ°á»£ng phÃ¹ há»£p. HÃ£y nháº­p há»“ sÆ¡ há»c sinh trÆ°á»›c hoáº·c kiá»ƒm tra phÃ¢n cÃ´ng ghi nháº­n.';
      renderWorkflow();
    } catch (error) {
      select.replaceChildren();
      select.hidden = true;
      select.required = false;
      manualLabel.hidden = false;
      manual.required = true;
      hint.textContent = `KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch Ä‘á»‘i tÆ°á»£ng: ${error.message}`;
      renderWorkflow();
    }
  }

  function targetCode() {
    const select = $('v029RecordTargetSelect');
    const manual = $('v029RecordTargetManual');
    return select && !select.hidden ? select.value.trim() : (manual?.value || '').trim();
  }

  function stopQrScanner() {
    const video = $('v029QrVideo');
    if (video?.srcObject) video.srcObject.getTracks().forEach(track => track.stop());
    if (video) { video.pause(); video.srcObject = null; video.hidden = true; }
  }

  async function scanQrTarget() {
    const targetType = selectedValue('v029RecordTarget');
    if (targetType !== 'student') { setNotice('Quét QR chỉ áp dụng cho đối tượng cá nhân.', true); return; }
    const select = $('v029RecordTargetSelect');
    if (!select || select.hidden) { setNotice('Chưa có danh sách học sinh để đối chiếu mã QR.', true); return; }
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      const code = prompt('Nhập mã định danh trong QR học sinh:');
      if (code && [...select.options].some(option => option.value === code.trim())) { select.value = code.trim(); setNotice('Đã chọn học sinh từ mã QR.', false); }
      else if (code) setNotice('Mã QR không có trong danh sách học sinh đang lọc.', true);
      return;
    }
    const video = $('v029QrVideo');
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    try {
      video.hidden = false;
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      await video.play();
      const scan = async () => {
        if (video.hidden) return;
        try {
          const codes = await detector.detect(video);
          const code = codes[0]?.rawValue?.trim();
          if (code && [...select.options].some(option => option.value === code)) {
            select.value = code;
            stopQrScanner();
            setNotice('Đã chọn học sinh từ mã QR.', false);
            return;
          }
        } catch (error) { setNotice(`Không đọc được QR: ${error.message}`, true); stopQrScanner(); return; }
        requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    } catch (error) { stopQrScanner(); setNotice(`Không mở được camera: ${error.message}`, true); }
  }

  function gradeOf(className) {
    return String(className || '').match(/^\d{1,2}/)?.[0] || '';
  }

  function setRecordMode(targetType) {
    const radio = document.querySelector(`input[name="v029RecordTarget"][value="${targetType}"]`);
    if (!radio) return;
    radio.checked = true;
    state.filters.grade = '';
    state.filters.className = '';
    state.filters.search = '';
    if ($('v029ClassSearch')) $('v029ClassSearch').value = '';
    fillCriteriaOptions();
    renderWorkflow();
    void loadTargets();
  }

  function renderCriteriaActions() {
    const root = $('v029CriteriaActions');
    if (!root) return;
    root.replaceChildren();
    const targetType = selectedValue('v029RecordTarget');
    const areaId = $('v029RecordArea')?.value;
    const items = state.criteria.filter(item => item.mang_id === areaId && item.doi_tuong === targetType);
    for (const criterion of items) {
      const score = criterion.che_do_diem === 'flexible'
        ? `Â±${criterion.diem_gioi_han ?? criterion.diem ?? ''}`
        : `${criterion.diem_co_dinh ?? criterion.diem ?? ''}`;
      const button = make('button', { type: 'button', className: 'outline v029-action-button', textContent: `${criterion.ten} (${score})` });
      button.dataset.criterionId = criterion.id;
      button.onclick = () => {
        const select = $('v029RecordCriterion');
        select.value = criterion.id;
        syncCriterionHint();
        root.querySelectorAll('button').forEach(item => item.classList.toggle('selected', item === button));
      };
      root.append(button);
    }
    if (!items.length) root.append(make('small', { textContent: 'ChÆ°a cÃ³ tiÃªu chÃ­ phÃ¹ há»£p vá»›i Ä‘á»‘i tÆ°á»£ng Ä‘ang chá»n.' }));
    const selected = selectedCriterion();
    root.querySelectorAll('button').forEach(button => { button.classList.toggle('selected', button.dataset.criterionId === selected?.id); });
  }

  function renderWorkflow() {
    const gradeRoot = $('v029GradeButtons');
    const classRoot = $('v029ClassButtons');
    const targetSelect = $('v029RecordTargetSelect');
    const targetType = selectedValue('v029RecordTarget');
    $('v029ModeStudent')?.classList.toggle('selected', targetType === 'student');
    $('v029ModeClass')?.classList.toggle('selected', targetType === 'class');
    const items = state.targets[targetType] || [];
    const classes = targetType === 'student'
      ? [...new Set(items.map(item => item.lop).filter(Boolean))].sort()
      : items.map(item => item.ma_lop).filter(Boolean).sort();
    const grades = [...new Set(classes.map(gradeOf).filter(Boolean))];
    if (gradeRoot) {
      gradeRoot.replaceChildren();
      for (const grade of grades) {
        const button = make('button', { type: 'button', className: `outline v029-choice ${state.filters.grade === grade ? 'selected' : ''}`, textContent: `Khá»‘i ${grade}` });
        button.onclick = () => { state.filters.grade = grade; state.filters.className = ''; renderWorkflow(); };
        gradeRoot.append(button);
      }
      if (!grades.length) gradeRoot.append(make('small', { textContent: 'ChÆ°a cÃ³ dá»¯ liá»‡u khá»‘i tá»« há»“ sÆ¡ há»c sinh.' }));
    }
    const visibleClasses = classes.filter(className =>
      (!state.filters.grade || gradeOf(className) === state.filters.grade) &&
      (!state.filters.search || className.toLowerCase().includes(state.filters.search.toLowerCase()))
    );
    if (targetType === 'class' && !visibleClasses.includes(state.filters.className)) state.filters.className = visibleClasses[0] || '';
    if (classRoot) {
      classRoot.replaceChildren();
      for (const className of visibleClasses) {
        const button = make('button', { type: 'button', className: `outline v029-choice ${state.filters.className === className ? 'selected' : ''}`, textContent: className });
        button.onclick = () => { state.filters.className = className; renderWorkflow(); };
        classRoot.append(button);
      }
      if (!visibleClasses.length) classRoot.append(make('small', { textContent: 'ChÆ°a cÃ³ lá»›p trong khá»‘i Ä‘ang chá»n.' }));
    }
    if (targetSelect && targetType === 'student') {
      const previous = targetSelect.value;
      const visible = items.filter(item => !state.filters.className || item.lop === state.filters.className);
      targetSelect.replaceChildren();
      for (const item of visible) targetSelect.append(make('option', { value: item.ma_dinh_danh, textContent: `${item.ho_ten} Â· ${item.ma_dinh_danh}` }));
      if ([...targetSelect.options].some(option => option.value === previous)) targetSelect.value = previous;
      targetSelect.hidden = visible.length === 0;
      targetSelect.required = visible.length > 0;
      $('v029RecordTargetManualLabel')?.toggleAttribute('hidden', visible.length > 0);
      const manual = $('v029RecordTargetManual');
      if (manual) manual.required = visible.length === 0;
    }
    if (targetSelect && targetType === 'class') {
      const selectedClass = state.filters.className && visibleClasses.includes(state.filters.className)
        ? state.filters.className
        : visibleClasses[0] || '';
      targetSelect.value = selectedClass;
      state.filters.className = selectedClass;
    }
    renderCriteriaActions();
  }

  function renderMembers() {
    const select = $('v029AssignmentMember');
    if (!select) return;
    select.replaceChildren();
    if (!state.members.length) {
      select.append(make('option', { value: '', textContent: 'KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch thÃ nh viÃªn', disabled: true, selected: true }));
      return;
    }
    for (const member of state.members) {
      select.append(make('option', { value: member.thanh_vien_id, textContent: `${member.email || member.nguoi_dung_id} Â· ${(member.vai_tro || []).join(', ') || 'chÆ°a gÃ¡n vai trÃ²'}` }));
    }
  }

  function renderAssignments() {
    const root = $('v029AssignmentList');
    if (!root) return;
    root.replaceChildren();
    if (!state.assignments.length) {
      root.append(make('small', { textContent: 'ChÆ°a cÃ³ phÃ¢n cÃ´ng hoáº·c tÃ i khoáº£n hiá»‡n táº¡i khÃ´ng cÃ³ quyá»n xem.' }));
      return;
    }
    for (const assignment of state.assignments) {
      const area = `${assignment.ma_mang || ''} Â· ${assignment.ten_mang || ''}`;
      const scope = assignment.pham_vi_ma ? `pháº¡m vi ${assignment.pham_vi_ma}` : 'toÃ n máº£ng';
      const row = make('article', { className: 'v029-entry' }, [
        make('strong', { textContent: `${assignment.email || assignment.thanh_vien_id} Â· ${area}` }),
        make('small', { textContent: `${assignment.doi_tuong === 'student' ? 'CÃ¡ nhÃ¢n' : 'Táº­p thá»ƒ/lá»›p'} Â· ${scope} Â· ${assignment.tu_ngay || ''} â†’ ${assignment.den_ngay || 'chÆ°a káº¿t thÃºc'} Â· ${assignment.trang_thai}` }),
      ]);
      root.append(row);
    }
  }

  function renderRecords() {
    const root = $('v029RecordList');
    if (!root) return;
    root.replaceChildren();
    if (!state.records.length) {
      root.append(make('small', { textContent: 'ChÆ°a cÃ³ báº£n ghi ghi nháº­n.' }));
      return;
    }
    for (const record of state.records) {
      const score = record.gia_tri_thuc_te === null || record.gia_tri_thuc_te === undefined ? 'Ä‘iá»ƒm cá»‘ Ä‘á»‹nh' : `giÃ¡ trá»‹ thá»±c táº¿ ${record.gia_tri_thuc_te}`;
      const row = make('article', { className: 'v029-entry' }, [
        make('strong', { textContent: `${record.ma_tieu_chi || ''} Â· ${record.ten_tieu_chi || ''}` }),
        make('small', { textContent: `${record.ma_mang || ''} Â· ${record.doi_tuong === 'student' ? 'cÃ¡ nhÃ¢n' : 'táº­p thá»ƒ/lá»›p'} ${record.doi_tuong_ma} Â· ${record.chu_ky} Â· ${record.ngay_ghi_nhan} Â· ${score}` }),
        make('small', { textContent: `${record.noi_dung || 'KhÃ´ng cÃ³ ná»™i dung'} Â· tráº¡ng thÃ¡i ${record.trang_thai}` }),
      ]);
      if (record.trang_thai === 'recorded') {
        const actions = make('div', { className: 'v029-entry-actions' });
        const voidButton = make('button', { type: 'button', className: 'outline', textContent: 'â¸ Ngá»«ng hiá»‡u lá»±c' });
        voidButton.onclick = async () => {
          if (!confirm('Ngá»«ng hiá»‡u lá»±c báº£n ghi nÃ y? Dá»¯ liá»‡u sáº½ Ä‘Æ°á»£c giá»¯ láº¡i trong nháº­t kÃ½.')) return;
          voidButton.disabled = true;
          try {
            await schoolApi('ghi_nhan_void', { id: record.id, ly_do_huy: 'NgÆ°á»i dÃ¹ng ngá»«ng hiá»‡u lá»±c' });
            await loadRecords();
            setNotice('ÄÃ£ ngá»«ng hiá»‡u lá»±c báº£n ghi.');
          } catch (error) { setNotice(error.message, true); }
          finally { voidButton.disabled = false; }
        };
        actions.append(voidButton);
        row.append(actions);
      }
      root.append(row);
    }
  }

  async function loadRecords() {
    state.records = await schoolApi('ghi_nhan_list');
    renderRecords();
  }

  async function load() {
    try {
      setNotice('Äang táº£i dá»¯ liá»‡u ghi nháº­n...');
      await resolveSchool();
      const [areas, criteria, members, assignments, records] = await Promise.allSettled([
        schoolApi('mang_list'),
        schoolApi('tieuchi_list'),
        request('danh_sach_thanh_vien', { truong_id: state.school.id }),
        schoolApi('phan_cong_list'),
        schoolApi('ghi_nhan_list'),
      ]);
      state.areas = areas.status === 'fulfilled' ? areas.value : [];
      state.criteria = criteria.status === 'fulfilled' ? criteria.value : [];
      state.members = members.status === 'fulfilled' ? members.value : [];
      state.assignments = assignments.status === 'fulfilled' ? assignments.value : [];
      state.records = records.status === 'fulfilled' ? records.value : [];
      renderAreaOptions();
      renderMembers();
      renderAssignments();
      renderRecords();
      const failures = [areas, criteria, members, assignments, records].filter(item => item.status === 'rejected');
      setNotice(failures.length ? 'ÄÃ£ táº£i dá»¯ liá»‡u Ä‘Æ°á»£c phÃ©p xem. Má»™t sá»‘ pháº§n yÃªu cáº§u quyá»n quáº£n trá»‹ hoáº·c phÃ¢n cÃ´ng.' : 'ÄÃ£ táº£i dá»¯ liá»‡u ghi nháº­n. ChÆ°a tÃ­nh Ä‘iá»ƒm tá»•ng há»£p.', false);
    } catch (error) { setNotice(error.message, true); }
  }

  function showPanel() {
    document.querySelectorAll('.b43page').forEach(page => { page.hidden = true; });
    const v024Panel = $('v024Panel');
    if (v024Panel) v024Panel.hidden = true;
    panel.hidden = false;
    document.querySelectorAll('[data-b43-tab]').forEach(button => button.classList.toggle('selected', button === tabButton));
    $('v024Tab')?.classList.remove('selected');
    load();
  }

  function buildPanel() {
    if ($('b43-scoring')) return;
    const tabs = document.querySelector('.b43tabs');
    const host = $('b43');
    if (!tabs || !host) return;
    tabButton = make('button', { type: 'button', className: 'outline', textContent: 'Ghi nháº­n thi Ä‘ua' });
    tabButton.dataset.b43Tab = 'scoring';
    tabs.append(tabButton);
    const scoringCard = make('article', { className: 'v029-dashboard-card', tabIndex: 0, role: 'button' }, [
      make('strong', { textContent: '⭐ Ghi nhận thi đua' }),
      make('small', { textContent: 'Chọn khối, lớp, học sinh và lệnh ghi nhận' }),
      make('span', { textContent: 'Mở màn hình chấm điểm' }),
    ]);
    scoringCard.onclick = showPanel;
    scoringCard.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showPanel(); } };
    document.querySelector('.dashboard-modules')?.append(scoringCard);
    panel = make('section', { id: 'b43-scoring', className: 'b43page panel', hidden: true });
    panel.innerHTML = `<h2>Ghi nháº­n thi Ä‘ua V0.2.9</h2><p>Nháº­p dá»¯ liá»‡u vÃ  minh chá»©ng theo phÃ¢n cÃ´ng. MÃ n hÃ¬nh nÃ y chÆ°a tÃ­nh Ä‘iá»ƒm tá»•ng há»£p, chÆ°a cháº¡y cÃ´ng thá»©c vÃ  chÆ°a xáº¿p háº¡ng.</p><p id="v029ScoringNotice" role="status"></p><div class="v029-workflow"><section class="v029-step"><h3>1. Chọn khối</h3><div id="v029GradeButtons" class="v029-choice-grid"></div></section><section class="v029-step"><h3>2. Chọn lớp</h3><input id="v029ClassSearch" placeholder="Tìm nhanh lớp..." autocomplete="off"><div id="v029ClassButtons" class="v029-choice-grid"></div></section><section class="v029-step"><h3>3. Chọn hình thức chấm</h3><div class="v029-mode-grid"><button id="v029ModeStudent" type="button" class="outline v029-mode-button">Chấm điểm cá nhân</button><button id="v029ModeClass" type="button" class="outline v029-mode-button">Chấm điểm tập thể</button></div></section><section class="v029-step"><h3>4. Chọn lệnh ghi nhận</h3><div class="v029-scan-row"><button id="v029ScanQr" type="button" class="outline">⌁ Quét QR học sinh</button><video id="v029QrVideo" playsinline hidden></video></div><div id="v029CriteriaActions" class="v029-action-grid"></div></section></div><div class="v029-scoring-grid"><section class="v029-card"><h3>PhÃ¢n cÃ´ng ngÆ°á»i ghi nháº­n</h3><p class="v029-help">Chá»‰ quáº£n trá»‹ trÆ°á»ng Ä‘Æ°á»£c táº¡o phÃ¢n cÃ´ng. NgÆ°á»i ghi nháº­n chá»‰ nháº­p trong pháº¡m vi cÃ²n hiá»‡u lá»±c.</p><form id="v029AssignmentForm"><label>NgÆ°á»i ghi nháº­n<select id="v029AssignmentMember" required></select></label><label>Máº£ng thi Ä‘ua<select id="v029AssignmentArea" required></select></label><fieldset><legend>Äá»‘i tÆ°á»£ng</legend><label><input type="radio" name="v029AssignmentTarget" value="student" checked> CÃ¡ nhÃ¢n</label><label><input type="radio" name="v029AssignmentTarget" value="class"> Táº­p thá»ƒ / lá»›p</label></fieldset><label>Pháº¡m vi mÃ£ Ä‘á»‘i tÆ°á»£ng (tÃ¹y chá»n)<input id="v029AssignmentScope" maxlength="120" placeholder="VÃ­ dá»¥: 10C1 hoáº·c Ä‘á»ƒ trá»‘ng cho toÃ n máº£ng"></label><div class="v029-inline-fields"><label>Tá»« ngÃ y<input id="v029AssignmentFrom" type="date"></label><label>Äáº¿n ngÃ y<input id="v029AssignmentTo" type="date"></label></div><label>Ghi chÃº<textarea id="v029AssignmentNote" maxlength="1000" rows="2"></textarea></label><button type="submit">ï¼‹ Táº¡o phÃ¢n cÃ´ng</button></form><div id="v029AssignmentList" class="v029-scroll-list"></div></section><section class="v029-card"><h3>Táº¡o báº£n ghi ghi nháº­n</h3><form id="v029RecordForm"><label>Máº£ng thi Ä‘ua<select id="v029RecordArea" required></select></label><label>TiÃªu chÃ­<select id="v029RecordCriterion" required></select></label><p id="v029CriterionHint" class="v029-hint"></p><fieldset><legend>Äá»‘i tÆ°á»£ng Ä‘Æ°á»£c ghi nháº­n</legend><label><input type="radio" name="v029RecordTarget" value="student" checked> CÃ¡ nhÃ¢n</label><label><input type="radio" name="v029RecordTarget" value="class"> Táº­p thá»ƒ / lá»›p</label></fieldset><label>Äá»‘i tÆ°á»£ng Ä‘Æ°á»£c chá»n<select id="v029RecordTargetSelect" required></select></label><label id="v029RecordTargetManualLabel" hidden>Nháº­p mÃ£ Ä‘á»‘i tÆ°á»£ng<input id="v029RecordTargetManual" maxlength="120" placeholder="MÃ£ há»“ sÆ¡ há»c sinh hoáº·c mÃ£ lá»›p"></label><p id="v029RecordTargetHint" class="v029-hint"></p><div class="v029-inline-fields"><label>Chu ká»³<select id="v029RecordCycle" required><option value="week">Tuáº§n</option><option value="month">ThÃ¡ng</option><option value="semester">Há»c ká»³</option><option value="year">NÄƒm há»c</option></select></label><label>NgÃ y ghi nháº­n<input id="v029RecordDate" type="date" required></label></div><label>GiÃ¡ trá»‹ thá»±c táº¿ (chá»‰ dÃ¹ng cho Ä‘iá»ƒm linh hoáº¡t)<input id="v029RecordValue" type="number" step="0.01" placeholder="Äá»ƒ trá»‘ng náº¿u tiÃªu chÃ­ cá»‘ Ä‘á»‹nh"></label><label>Ná»™i dung ghi nháº­n<textarea id="v029RecordContent" maxlength="2000" rows="3"></textarea></label><label>Minh chá»©ng (má»—i dÃ²ng má»™t URL hoáº·c mÃ£ tÃ i liá»‡u)<textarea id="v029RecordEvidence" rows="2"></textarea></label><label>MÃ£ tham chiáº¿u (tÃ¹y chá»n)<input id="v029RecordReference" maxlength="120"></label><button type="submit">ï¼‹ LÆ°u báº£n ghi</button></form><div id="v029RecordList" class="v029-scroll-list"></div></section></div>`;
    host.append(panel);
    $('v029RecordDate').value = new Date().toISOString().slice(0, 10);
    $('v029AssignmentFrom').value = new Date().toISOString().slice(0, 10);
    tabButton.onclick = showPanel;
    document.querySelectorAll('[data-b43-tab]').forEach(button => button.addEventListener('click', () => { if (button !== tabButton) panel.hidden = true; }));
    $('v024Tab')?.addEventListener('click', () => { panel.hidden = true; });
    $('v029RecordArea').onchange = fillCriteriaOptions;
    $('v029RecordCriterion').onchange = syncCriterionHint;
    document.querySelectorAll('input[name="v029RecordTarget"]').forEach(input => { input.addEventListener('change', () => { state.filters.grade = ''; state.filters.className = ''; renderWorkflow(); void loadTargets(); }); });
    $('v029ModeStudent').onclick = () => setRecordMode('student');
    $('v029ModeClass').onclick = () => setRecordMode('class');
    $('v029ClassSearch').oninput = event => { state.filters.search = event.target.value.trim(); renderWorkflow(); };
    $('v029ScanQr').onclick = scanQrTarget;
    $('v029RecordTargetSelect').onchange = event => {
      if (selectedValue('v029RecordTarget') === 'class') state.filters.className = event.target.value;
      renderWorkflow();
    };
    $('v029AssignmentForm').onsubmit = async event => {
      event.preventDefault();
      try {
        await schoolApi('phan_cong_create', {
          thanh_vien_id: $('v029AssignmentMember').value,
          mang_id: $('v029AssignmentArea').value,
          doi_tuong: selectedValue('v029AssignmentTarget'),
          pham_vi_ma: $('v029AssignmentScope').value.trim(),
          tu_ngay: $('v029AssignmentFrom').value,
          den_ngay: $('v029AssignmentTo').value,
          ghi_chu: $('v029AssignmentNote').value.trim(),
        });
        event.target.reset();
        $('v029AssignmentFrom').value = new Date().toISOString().slice(0, 10);
        await load();
        setNotice('ÄÃ£ táº¡o phÃ¢n cÃ´ng.');
      } catch (error) { setNotice(error.message, true); }
    };
    $('v029RecordForm').onsubmit = async event => {
      event.preventDefault();
      const criterion = selectedCriterion();
      if (!criterion) { setNotice('HÃ£y chá»n tiÃªu chÃ­.', true); return; }
      const target = selectedValue('v029RecordTarget');
      if (criterion.doi_tuong !== target) { setNotice('Äá»‘i tÆ°á»£ng ghi nháº­n khÃ´ng khá»›p vá»›i tiÃªu chÃ­.', true); return; }
      const evidence = $('v029RecordEvidence').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(ref => ({ ref }));
      try {
        await schoolApi('ghi_nhan_create', {
          mang_id: $('v029RecordArea').value,
          tieu_chi_id: criterion.id,
          doi_tuong: target,
          doi_tuong_ma: targetCode(),
          chu_ky: $('v029RecordCycle').value,
          ngay_ghi_nhan: $('v029RecordDate').value,
          gia_tri_thuc_te: criterion.che_do_diem === 'flexible' ? $('v029RecordValue').value : '',
          noi_dung: $('v029RecordContent').value.trim(),
          minh_chung: evidence,
          ma_tham_chieu: $('v029RecordReference').value.trim(),
        });
        event.target.reset();
        $('v029RecordDate').value = new Date().toISOString().slice(0, 10);
        renderAreaOptions();
        await loadRecords();
        setNotice('ÄÃ£ lÆ°u báº£n ghi ghi nháº­n. ChÆ°a tÃ­nh Ä‘iá»ƒm tá»•ng há»£p.');
      } catch (error) { setNotice(error.message, true); }
    };
  }

  function init() {
    buildPanel();
    window.edunexaScoringOpen = showPanel;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();


