(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cfg = window.EDUNEXA_CONFIG;
  if (!cfg || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const state = { school: null, areas: [], criteria: [], members: [], assignments: [], records: [], targets: { student: [], class: [] }, filters: { grade: '', className: '', search: '', student: '', criterion: '' } };
  let tabButton = null;
  let panel = null;

  const make = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  async function request(action, data = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('Chưa đăng nhập');
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
    if (!response.ok) throw Error(result.error || 'Không xử lý được yêu cầu');
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
    if (!state.school) throw Error('Không xác định được trường đang chọn');
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
      for (const area of state.areas) select.append(make('option', { value: area.id, textContent: `${area.ma} · ${area.ten}` }));
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
    const targetType = selectedValue('v029RecordTarget');
    for (const criterion of state.criteria.filter(item => item.mang_id === areaId && item.doi_tuong === targetType)) {
      const mode = criterion.che_do_diem === 'flexible'
        ? `linh hoạt ≤ ${criterion.diem_gioi_han ?? criterion.diem}`
        : `cố định ${criterion.diem_co_dinh ?? criterion.diem}`;
      select.append(make('option', { value: criterion.id, textContent: `${criterion.ma} · ${criterion.ten} · ${mode}` }));
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
      if (hint) hint.textContent = 'Mảng đang chọn chưa có tiêu chí.';
      if (valueInput) {
        valueInput.required = false;
        valueInput.closest('label').hidden = true;
      }
      return;
    }
    const mode = criterion.che_do_diem === 'flexible'
      ? `Điểm linh hoạt, giới hạn ${criterion.diem_gioi_han ?? criterion.diem}`
      : `Điểm cố định ${criterion.diem_co_dinh ?? criterion.diem}`;
    if (hint) hint.textContent = `${mode}. Đối tượng áp dụng: ${criterion.doi_tuong === 'student' ? 'cá nhân' : 'tập thể/lớp'}.`;
    if (valueInput) {
      const isFlexible = criterion.che_do_diem === 'flexible';
      valueInput.required = isFlexible;
      valueInput.disabled = !isFlexible;
      valueInput.closest('label').hidden = !isFlexible;
      if (!isFlexible) valueInput.value = '';
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
          ? `${item.ho_ten || code} · ${code}${item.lop ? ` · ${item.lop}` : ''}`
          : `${code} · ${item.so_hoc_sinh || 0} học sinh`;
        select.append(make('option', { value: code, textContent: label }));
      }
      const hasItems = items.length > 0;
      select.hidden = !hasItems;
      select.required = hasItems;
      manualLabel.hidden = hasItems;
      manual.required = !hasItems;
      hint.textContent = hasItems
        ? `Đã tải ${items.length} ${targetType === 'student' ? 'học sinh' : 'lớp'} thuộc phạm vi được phép ghi nhận.`
        : 'Chưa có đối tượng phù hợp. Hãy nhập hồ sơ học sinh trước hoặc kiểm tra phân công ghi nhận.';
      renderWorkflow();
    } catch (error) {
      select.replaceChildren();
      select.hidden = true;
      select.required = false;
      manualLabel.hidden = false;
      manual.required = true;
      hint.textContent = `Không tải được danh sách đối tượng: ${error.message}`;
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
    state.filters.student = '';
    state.filters.criterion = '';
    if ($('v029ClassSearch')) $('v029ClassSearch').value = '';
    if ($('v029StudentSearch')) $('v029StudentSearch').value = '';
    if ($('v029CriterionSearch')) $('v029CriterionSearch').value = '';
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
    const allItems = state.criteria.filter(item => item.mang_id === areaId && item.doi_tuong === targetType);
    const query = state.filters.criterion.trim().toLocaleLowerCase('vi');
    const items = allItems.filter(item => !query ||
      `${item.ma || ''} ${item.ten || ''}`.toLocaleLowerCase('vi').includes(query));
    const count = $('v029CriterionCount');
    if (count) count.textContent = query ? `${items.length}/${allItems.length} tiêu chí` : `${allItems.length} tiêu chí`;
    for (const criterion of items) {
      const score = criterion.che_do_diem === 'flexible'
        ? `±${criterion.diem_gioi_han ?? criterion.diem ?? ''}`
        : `${criterion.diem_co_dinh ?? criterion.diem ?? ''}`;
      const button = make('button', { type: 'button', className: 'outline v029-action-button' }, [
        make('strong', { textContent: criterion.ten }),
        make('small', { textContent: `${criterion.ma || 'Tiêu chí'} · ${criterion.che_do_diem === 'flexible' ? 'Linh hoạt' : 'Cố định'} · ${score} điểm` }),
      ]);
      button.dataset.criterionId = criterion.id;
      button.onclick = () => {
        const select = $('v029RecordCriterion');
        select.value = criterion.id;
        state.filters.criterion = '';
        $('v029CriterionSearch').value = '';
        syncCriterionHint();
        renderCriteriaActions();
      };
      root.append(button);
    }
    if (!allItems.length) root.append(make('small', { textContent: 'Chưa có tiêu chí phù hợp với đối tượng đang chọn.' }));
    else if (!items.length) root.append(make('small', { textContent: 'Không tìm thấy tiêu chí. Hãy thử từ khóa khác.' }));
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
    $('v029ModeStudent')?.setAttribute('aria-pressed', String(targetType === 'student'));
    $('v029ModeClass')?.setAttribute('aria-pressed', String(targetType === 'class'));
    $('v029ScanQr').hidden = targetType !== 'student';
    const items = state.targets[targetType] || [];
    $('v029StudentSearchLabel')?.toggleAttribute('hidden', targetType !== 'student' || !items.length);
    const classes = targetType === 'student'
      ? [...new Set(items.map(item => item.lop).filter(Boolean))].sort()
      : items.map(item => item.ma_lop).filter(Boolean).sort();
    const grades = [...new Set(classes.map(gradeOf).filter(Boolean))];
    if (gradeRoot) {
      gradeRoot.replaceChildren();
      for (const grade of grades) {
        const button = make('button', { type: 'button', className: `outline v029-choice ${state.filters.grade === grade ? 'selected' : ''}`, textContent: `Khối ${grade}` });
        button.onclick = () => { state.filters.grade = grade; state.filters.className = ''; if (targetType === 'student') targetSelect.value = ''; renderWorkflow(); };
        gradeRoot.append(button);
      }
      if (!grades.length) gradeRoot.append(make('small', { textContent: 'Chưa có dữ liệu khối từ hồ sơ học sinh.' }));
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
        button.onclick = () => { state.filters.className = className; if (targetType === 'student') targetSelect.value = ''; renderWorkflow(); };
        classRoot.append(button);
      }
      if (!visibleClasses.length) classRoot.append(make('small', { textContent: 'Chưa có lớp trong khối đang chọn.' }));
    }
    if (targetSelect && targetType === 'student') {
      const previous = targetSelect.value;
      const query = state.filters.student.trim().toLocaleLowerCase('vi');
      const available = items.filter(item => !state.filters.className || item.lop === state.filters.className);
      const visible = available.filter(item =>
        !query || `${item.ho_ten || ''} ${item.ma_dinh_danh || ''}`.toLocaleLowerCase('vi').includes(query));
      targetSelect.replaceChildren();
      if (available.length) {
        targetSelect.append(make('option', { value: '', textContent: 'Chọn học sinh...', disabled: true, selected: true }));
      }
      for (const item of visible) targetSelect.append(make('option', { value: item.ma_dinh_danh, textContent: `${item.ho_ten} · ${item.ma_dinh_danh}` }));
      if (!visible.length && available.length) {
        targetSelect.append(make('option', { value: '', textContent: 'Không tìm thấy học sinh phù hợp', disabled: true, selected: true }));
      }
      if ([...targetSelect.options].some(option => option.value === previous)) targetSelect.value = previous;
      targetSelect.hidden = available.length === 0;
      targetSelect.required = available.length > 0;
      $('v029RecordTargetManualLabel')?.toggleAttribute('hidden', available.length > 0);
      $('v029StudentCount').textContent = query ? `${visible.length} kết quả` : `${visible.length} học sinh`;
      $('v029StudentSearchLabel').hidden = available.length === 0;
      const manual = $('v029RecordTargetManual');
      if (manual) manual.required = available.length === 0;
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
      select.append(make('option', { value: '', textContent: 'Không tải được danh sách thành viên', disabled: true, selected: true }));
      return;
    }
    for (const member of state.members) {
      select.append(make('option', { value: member.thanh_vien_id, textContent: `${member.email || member.nguoi_dung_id} · ${(member.vai_tro || []).join(', ') || 'chưa gán vai trò'}` }));
    }
  }

  function renderAssignments() {
    const root = $('v029AssignmentList');
    if (!root) return;
    root.replaceChildren();
    if (!state.assignments.length) {
      root.append(make('small', { textContent: 'Chưa có phân công hoặc tài khoản hiện tại không có quyền xem.' }));
      return;
    }
    for (const assignment of state.assignments) {
      const area = `${assignment.ma_mang || ''} · ${assignment.ten_mang || ''}`;
      const scope = assignment.pham_vi_ma ? `phạm vi ${assignment.pham_vi_ma}` : 'toàn mảng';
      const row = make('article', { className: 'v029-entry' }, [
        make('strong', { textContent: `${assignment.email || assignment.thanh_vien_id} · ${area}` }),
        make('small', { textContent: `${assignment.doi_tuong === 'student' ? 'Cá nhân' : 'Tập thể/lớp'} · ${scope} · ${assignment.tu_ngay || ''} → ${assignment.den_ngay || 'chưa kết thúc'} · ${assignment.trang_thai}` }),
      ]);
      root.append(row);
    }
  }

  function renderRecords() {
    const root = $('v029RecordList');
    if (!root) return;
    root.replaceChildren();
    if (!state.records.length) {
      root.append(make('small', { textContent: 'Chưa có bản ghi ghi nhận.' }));
      return;
    }
    for (const record of state.records) {
      const score = record.gia_tri_thuc_te === null || record.gia_tri_thuc_te === undefined ? 'điểm cố định' : `giá trị thực tế ${record.gia_tri_thuc_te}`;
      const row = make('article', { className: 'v029-entry' }, [
        make('strong', { textContent: `${record.ma_tieu_chi || ''} · ${record.ten_tieu_chi || ''}` }),
        make('small', { textContent: `${record.ma_mang || ''} · ${record.doi_tuong === 'student' ? 'cá nhân' : 'tập thể/lớp'} ${record.doi_tuong_ma} · ${record.chu_ky} · ${record.ngay_ghi_nhan} · ${score}` }),
        make('small', { textContent: `${record.noi_dung || 'Không có nội dung'} · trạng thái ${record.trang_thai}` }),
      ]);
      if (record.trang_thai === 'recorded') {
        const actions = make('div', { className: 'v029-entry-actions' });
        const voidButton = make('button', { type: 'button', className: 'outline', textContent: '⏸ Ngừng hiệu lực' });
        voidButton.onclick = async () => {
          if (!confirm('Ngừng hiệu lực bản ghi này? Dữ liệu sẽ được giữ lại trong nhật ký.')) return;
          voidButton.disabled = true;
          try {
            await schoolApi('ghi_nhan_void', { id: record.id, ly_do_huy: 'Người dùng ngừng hiệu lực' });
            await loadRecords();
            setNotice('Đã ngừng hiệu lực bản ghi.');
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
      setNotice('Đang tải dữ liệu ghi nhận...');
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
      setNotice(failures.length ? 'Đã tải dữ liệu được phép xem. Một số phần yêu cầu quyền quản trị hoặc phân công.' : 'Đã tải dữ liệu ghi nhận. Chưa tính điểm tổng hợp.', false);
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
    tabButton = make('button', { type: 'button', className: 'outline', textContent: 'Ghi nhận thi đua' });
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
    panel.innerHTML = `<h2>Ghi nhận thi đua V0.2.9</h2><p>Nhập dữ liệu và minh chứng theo phân công. Màn hình này chưa tính điểm tổng hợp, chưa chạy công thức và chưa xếp hạng.</p><p id="v029ScoringNotice" role="status"></p><div class="v029-workflow"><section class="v029-step"><h3>1. Chọn khối</h3><div id="v029GradeButtons" class="v029-choice-grid"></div></section><section class="v029-step"><h3>2. Chọn lớp</h3><input id="v029ClassSearch" placeholder="Tìm nhanh lớp..." autocomplete="off"><div id="v029ClassButtons" class="v029-choice-grid"></div></section><section class="v029-step"><h3>3. Chọn hình thức chấm</h3><div class="v029-mode-grid"><button id="v029ModeStudent" type="button" class="outline v029-mode-button">Chấm điểm cá nhân</button><button id="v029ModeClass" type="button" class="outline v029-mode-button">Chấm điểm tập thể</button></div></section><section class="v029-step"><h3>4. Chọn lệnh ghi nhận</h3><div class="v029-scan-row"><button id="v029ScanQr" type="button" class="outline">⌁ Quét QR học sinh</button><video id="v029QrVideo" playsinline hidden></video></div><div id="v029CriteriaActions" class="v029-action-grid"></div></section></div><div class="v029-scoring-grid"><section class="v029-card"><h3>Phân công người ghi nhận</h3><p class="v029-help">Chỉ quản trị trường được tạo phân công. Người ghi nhận chỉ nhập trong phạm vi còn hiệu lực.</p><form id="v029AssignmentForm"><label>Người ghi nhận<select id="v029AssignmentMember" required></select></label><label>Mảng thi đua<select id="v029AssignmentArea" required></select></label><fieldset><legend>Đối tượng</legend><label><input type="radio" name="v029AssignmentTarget" value="student" checked> Cá nhân</label><label><input type="radio" name="v029AssignmentTarget" value="class"> Tập thể / lớp</label></fieldset><label>Phạm vi mã đối tượng (tùy chọn)<input id="v029AssignmentScope" maxlength="120" placeholder="Ví dụ: 10C1 hoặc để trống cho toàn mảng"></label><div class="v029-inline-fields"><label>Từ ngày<input id="v029AssignmentFrom" type="date"></label><label>Đến ngày<input id="v029AssignmentTo" type="date"></label></div><label>Ghi chú<textarea id="v029AssignmentNote" maxlength="1000" rows="2"></textarea></label><button type="submit">＋ Tạo phân công</button></form><div id="v029AssignmentList" class="v029-scroll-list"></div></section><section class="v029-card"><h3>Tạo bản ghi ghi nhận</h3><form id="v029RecordForm"><label>Mảng thi đua<select id="v029RecordArea" required></select></label><label>Tiêu chí<select id="v029RecordCriterion" required></select></label><p id="v029CriterionHint" class="v029-hint"></p><fieldset><legend>Đối tượng được ghi nhận</legend><label><input type="radio" name="v029RecordTarget" value="student" checked> Cá nhân</label><label><input type="radio" name="v029RecordTarget" value="class"> Tập thể / lớp</label></fieldset><label>Đối tượng được chọn<select id="v029RecordTargetSelect" required></select></label><label id="v029RecordTargetManualLabel" hidden>Nhập mã đối tượng<input id="v029RecordTargetManual" maxlength="120" placeholder="Mã hồ sơ học sinh hoặc mã lớp"></label><p id="v029RecordTargetHint" class="v029-hint"></p><div class="v029-inline-fields"><label>Chu kỳ<select id="v029RecordCycle" required><option value="week">Tuần</option><option value="month">Tháng</option><option value="semester">Học kỳ</option><option value="year">Năm học</option></select></label><label>Ngày ghi nhận<input id="v029RecordDate" type="date" required></label></div><label>Giá trị thực tế (chỉ dùng cho điểm linh hoạt)<input id="v029RecordValue" type="number" step="0.01" placeholder="Để trống nếu tiêu chí cố định"></label><label>Nội dung ghi nhận<textarea id="v029RecordContent" maxlength="2000" rows="3"></textarea></label><label>Minh chứng (mỗi dòng một URL hoặc mã tài liệu)<textarea id="v029RecordEvidence" rows="2"></textarea></label><label>Mã tham chiếu (tùy chọn)<input id="v029RecordReference" maxlength="120"></label><button type="submit">＋ Lưu bản ghi</button></form><div id="v029RecordList" class="v029-scroll-list"></div></section></div>`;
    host.append(panel);
    panel.querySelector('h2').classList.add('v029-page-title');
    const workflowSteps = panel.querySelectorAll('.v029-workflow .v029-step');
    const areaLabel = $('v029RecordArea').closest('label');
    const criterionLabel = $('v029RecordCriterion').closest('label');
    workflowSteps[3].querySelector('h3').textContent = '4. Chọn mảng và tiêu chí';
    workflowSteps[3].prepend(areaLabel);
    areaLabel.classList.add('v029-area-select');
    criterionLabel.hidden = true;
    $('v029RecordCriterion').required = false;
    $('v029RecordForm').querySelector('fieldset').hidden = true;
    const criterionSearch = make('input', { id: 'v029CriterionSearch', type: 'search', placeholder: 'Tìm tiêu chí theo tên hoặc mã...', autocomplete: 'off', 'aria-label': 'Tìm tiêu chí' });
    const criterionToolbar = make('div', { className: 'v029-filter-toolbar' }, [
      criterionSearch,
      make('small', { id: 'v029CriterionCount', className: 'v029-muted' }),
    ]);
    workflowSteps[3].insertBefore(criterionToolbar, workflowSteps[3].querySelector('.v029-scan-row'));
    const studentSearch = make('input', { id: 'v029StudentSearch', type: 'search', placeholder: 'Tìm theo tên hoặc mã học sinh...', autocomplete: 'off' });
    const studentSearchLabel = make('label', { id: 'v029StudentSearchLabel', className: 'v029-search-label', textContent: 'Tìm học sinh' }, [studentSearch]);
    studentSearchLabel.hidden = true;
    $('v029RecordTargetSelect').closest('label').before(studentSearchLabel);
    $('v029RecordTargetSelect').closest('label').append(make('small', { id: 'v029StudentCount', className: 'v029-muted' }));
    $('v029CriterionHint').classList.add('v029-wide-field');
    $('v029RecordTargetHint').classList.add('v029-wide-field');
    $('v029RecordContent').closest('label').classList.add('v029-wide-field');
    $('v029RecordEvidence').closest('label').classList.add('v029-wide-field');
    $('v029RecordForm').querySelector('button[type="submit"]').classList.add('v029-wide-field');
    const scoringGrid = panel.querySelector('.v029-scoring-grid');
    const assignmentCard = scoringGrid.children[0];
    const recordCard = scoringGrid.children[1];
    const assignmentHelp = assignmentCard.querySelector('.v029-help');
    const assignmentForm = $('v029AssignmentForm');
    const assignmentList = $('v029AssignmentList');
    const assignmentDetails = make('details', { className: 'v029-admin-details' });
    assignmentDetails.append(make('summary', { textContent: 'Quản lý phân công người ghi nhận' }));
    const assignmentContent = make('div', { className: 'v029-admin-content' }, [assignmentHelp, assignmentForm, assignmentList]);
    assignmentDetails.append(assignmentContent);
    assignmentCard.replaceChildren(assignmentDetails);
    const recordList = $('v029RecordList');
    const recordHistory = make('details', { className: 'v029-history-details' }, [
      make('summary', { textContent: 'Lịch sử ghi nhận' }),
      recordList,
    ]);
    recordCard.append(recordHistory);
    scoringGrid.append(recordCard, assignmentCard);
    $('v029RecordDate').value = new Date().toISOString().slice(0, 10);
    $('v029AssignmentFrom').value = new Date().toISOString().slice(0, 10);
    tabButton.onclick = showPanel;
    document.querySelectorAll('[data-b43-tab]').forEach(button => button.addEventListener('click', () => { if (button !== tabButton) panel.hidden = true; }));
    $('v024Tab')?.addEventListener('click', () => { panel.hidden = true; });
    $('v029RecordArea').onchange = fillCriteriaOptions;
    $('v029RecordCriterion').onchange = syncCriterionHint;
    $('v029CriterionSearch').oninput = event => { state.filters.criterion = event.target.value; renderCriteriaActions(); };
    $('v029StudentSearch').oninput = event => { state.filters.student = event.target.value; $('v029RecordTargetSelect').value = ''; renderWorkflow(); };
    document.querySelectorAll('input[name="v029RecordTarget"]').forEach(input => { input.addEventListener('change', () => { state.filters.grade = ''; state.filters.className = ''; state.filters.student = ''; $('v029StudentSearch').value = ''; renderWorkflow(); void loadTargets(); }); });
    $('v029ModeStudent').onclick = () => setRecordMode('student');
    $('v029ModeClass').onclick = () => setRecordMode('class');
    $('v029ClassSearch').oninput = event => { state.filters.search = event.target.value.trim(); if (selectedValue('v029RecordTarget') === 'student') $('v029RecordTargetSelect').value = ''; renderWorkflow(); };
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
        setNotice('Đã tạo phân công.');
      } catch (error) { setNotice(error.message, true); }
    };
    $('v029RecordForm').onsubmit = async event => {
      event.preventDefault();
      const criterion = selectedCriterion();
      if (!criterion) { setNotice('Hãy chọn tiêu chí.', true); return; }
      const target = selectedValue('v029RecordTarget');
      if (criterion.doi_tuong !== target) { setNotice('Đối tượng ghi nhận không khớp với tiêu chí.', true); return; }
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
        setNotice('Đã lưu bản ghi ghi nhận. Chưa tính điểm tổng hợp.');
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
