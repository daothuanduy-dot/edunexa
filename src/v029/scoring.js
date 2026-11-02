(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cfg = window.EDUNEXA_CONFIG;
  if (!cfg || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const state = { school: null, areas: [], criteria: [], records: [], areaLoadError: '', criteriaLoadError: '', targets: { student: [], class: [] }, filters: { grade: '', className: '', search: '', student: '', criterion: '', direction: 'positive' } };
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
    let context = { schools: [] };
    try { context = await request('boi_canh'); }
    catch (error) {
      if (!/quyền|quyen/i.test(error.message)) throw error;
    }
    const code = $('schoolCode')?.textContent.trim();
    state.school = (context.schools || []).find(item => item.ma_truong === code);
    if (!state.school) {
      const recorderSchools = await request('scoring_recorder_context');
      state.school = (recorderSchools || []).find(item => item.ma_truong === code);
    }
    if (!state.school && window.edunexaTeacherPermissions) {
      state.school = window.edunexaTeacherPermissions;
    }
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

  function teacherCanRecord() {
    return !window.edunexaTeacherPermissions || window.edunexaTeacherPermissions.scoring_record === true;
  }

  function teacherCanViewHistory() {
    return !window.edunexaTeacherPermissions || window.edunexaTeacherPermissions.scoring_history === true;
  }

  function selectedCriterion() {
    return state.criteria.find(item => item.id === $('v029RecordCriterion')?.value);
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi')
      .trim();
  }

  function matchesStudentSearch(student, query) {
    if (!query) return true;
    const name = normalizeSearchText(student.ho_ten);
    const normalizedQuery = normalizeSearchText(query);
    const initials = name.split(/\s+/).filter(Boolean).map(word => word[0]).join('');
    const initialsQuery = normalizedQuery.replace(/\s+/g, '');
    const code = normalizeSearchText(student.ma_dinh_danh);
    return name.includes(normalizedQuery) ||
      initials.startsWith(initialsQuery) ||
      code.includes(normalizedQuery);
  }

  function criterionScore(criterion) {
    const raw = criterion.che_do_diem === 'flexible'
      ? criterion.diem_gioi_han ?? criterion.diem
      : criterion.diem_co_dinh ?? criterion.diem;
    if (raw === null || raw === undefined || raw === '') return null;
    const score = Number(raw);
    return Number.isFinite(score) ? score : null;
  }

  function cycleName(cycle) {
    return ({ week: 'Tuần', month: 'Tháng', semester: 'Học kỳ', year: 'Năm học' })[cycle] || cycle;
  }

  function renderAreaOptions() {
    const select = $('v029RecordArea');
    const previous = select.value;
    select.replaceChildren(make('option', { value: '', textContent: 'Chọn mảng thi đua...', disabled: true, selected: true }));
    for (const area of state.areas) select.append(make('option', { value: area.id, textContent: `${area.ma} · ${area.ten}` }));
    if (state.areas.some(area => area.id === previous)) select.value = previous;
    fillCriteriaOptions();
  }

  function fillCriteriaOptions() {
    const select = $('v029RecordCriterion');
    if (!select) return;
    const areaId = $('v029RecordArea').value;
    const previous = select.value;
    select.replaceChildren();
    select.append(make('option', { value: '', textContent: 'Chọn hình thức ghi nhận...', disabled: true, selected: true }));
    const targetType = selectedValue('v029RecordTarget');
    for (const criterion of state.criteria.filter(item =>
      String(item.mang_id || '').toLocaleLowerCase() === String(areaId || '').toLocaleLowerCase() &&
      item.doi_tuong === targetType)) {
      const score = criterionScore(criterion);
      const mode = criterion.che_do_diem === 'flexible'
        ? `linh hoạt · giới hạn ${score ?? 'chưa cấu hình'}`
        : `cố định ${score ?? 'chưa cấu hình'}`;
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
      if ($('v029RecordForm')) $('v029RecordForm').hidden = true;
      return;
    }
    const cycles = Array.isArray(criterion.chu_ky) ? criterion.chu_ky : [];
    const cycleSelect = $('v029RecordCycle');
    const cycleLabel = cycleSelect?.closest('label');
    if (cycleSelect) {
      const previousCycle = cycleSelect.value;
      cycleSelect.replaceChildren(...cycles.map(cycle => make('option', { value: cycle, textContent: cycleName(cycle) })));
      cycleSelect.value = cycles.includes(previousCycle) ? previousCycle : (cycles[0] || '');
      cycleSelect.required = cycles.length > 0;
      if (cycleLabel) cycleLabel.hidden = cycles.length <= 1;
    }
    const score = criterionScore(criterion);
    const mode = criterion.che_do_diem === 'flexible'
      ? `Điểm linh hoạt, giới hạn ${score ?? 'chưa cấu hình'}`
      : `Điểm cố định ${score ?? 'chưa cấu hình'}`;
    if (hint) hint.textContent = `${mode}. ${cycles.length ? `Chu kỳ: ${cycles.map(cycleName).join(', ')}.` : 'Chưa cấu hình chu kỳ.'}`;
    if (valueInput) {
      const isFlexible = criterion.che_do_diem === 'flexible';
      valueInput.required = isFlexible;
      valueInput.disabled = !isFlexible;
      valueInput.closest('label').hidden = !isFlexible;
      const score = criterionScore(criterion);
      valueInput.min = score !== null && score > 0 ? '0.01' : '';
      valueInput.max = score !== null && score > 0 ? String(score) : '';
      valueInput.max = score !== null && score < 0 ? '-0.01' : valueInput.max;
      valueInput.min = score !== null && score < 0 ? String(score) : valueInput.min;
      valueInput.placeholder = score !== null && score > 0
        ? `Điểm cộng tối đa ${score}`
        : score !== null && score < 0 ? `Điểm trừ tối thiểu ${score}` : 'Nhập điểm thực tế';
      if (!isFlexible) valueInput.value = '';
    }
    if ($('v029RecordForm')) $('v029RecordForm').hidden = !cycles.length;
  }

  async function loadTargets() {
    if (!teacherCanRecord()) return;
    const areaId = $('v029RecordArea')?.value;
    const targetType = selectedValue('v029RecordTarget');
    const select = $('v029RecordTargetSelect');
    const hint = $('v029RecordTargetHint');
    if (!areaId || !targetType || !select || !hint) return;
    try {
      const result = await schoolApi('ghi_nhan_targets', { mang_id: areaId, doi_tuong: targetType });
      const items = Array.isArray(result) ? result : (Array.isArray(result?.items) ? result.items : []);
      state.targets[targetType] = items;
      select.replaceChildren();
      select.append(make('option', {
        value: '',
        textContent: targetType === 'student' ? 'Chọn học sinh...' : 'Chọn lớp...',
          disabled: true,
          selected: true,
      }));
      for (const item of items) {
        const code = targetType === 'student' ? item.ma_dinh_danh : item.ma_lop;
        const label = targetType === 'student'
          ? `${item.ho_ten || code} · ${code}${item.lop ? ` · ${item.lop}` : ''}`
          : `${code} · ${item.so_hoc_sinh || 0} học sinh`;
        select.append(make('option', { value: code, textContent: label }));
      }
      hint.textContent = items.length
        ? `Đã tải ${items.length} ${targetType === 'student' ? 'học sinh' : 'lớp'} được phép ghi nhận.`
        : 'Chưa có đối tượng phù hợp. Hãy kiểm tra hồ sơ học sinh/lớp hoặc liên hệ quản trị trường.';
      renderWorkflow();
    } catch (error) {
      select.replaceChildren();
      state.targets[targetType] = [];
      select.hidden = false;
      select.required = false;
      hint.textContent = `Không tải được danh sách đối tượng: ${error.message}`;
      renderWorkflow();
    }
  }

  function targetCode() {
    return ($('v029RecordTargetSelect')?.value || '').trim();
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
      if (code && [...select.options].some(option => option.value === code.trim())) { select.value = code.trim(); setNotice('Đã chọn học sinh từ mã QR.', false); renderWorkflow(); }
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
            renderWorkflow();
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
    $('v029RecordCriterion').value = '';
    $('v029RecordValue').value = '';
    $('v029RecordContent').value = '';
    state.targets[targetType] = [];
    $('v029RecordTargetSelect')?.replaceChildren();
    fillCriteriaOptions();
    renderWorkflow();
    void loadTargets();
  }

  function renderCriteriaActions() {
    const root = $('v029CriteriaActions');
    if (!root) return;
    root.replaceChildren();
    const count = $('v029CriterionCount');
    if (state.areaLoadError || state.criteriaLoadError) {
      if (count) count.textContent = 'Chưa tải được danh mục';
      root.append(make('small', { textContent: 'Không thể xác định tiêu chí phù hợp vì danh mục chưa tải thành công. Hãy xem thông báo lỗi tải dữ liệu phía trên.' }));
      return;
    }
    const targetType = selectedValue('v029RecordTarget');
    const areaId = $('v029RecordArea')?.value;
    const areaItems = state.criteria.filter(item =>
      String(item.mang_id || '').toLocaleLowerCase() === String(areaId || '').toLocaleLowerCase());
    const targetItems = areaItems.filter(item => item.doi_tuong === targetType);
    const directionalItems = targetItems.filter(item => {
      const score = criterionScore(item);
      return score !== null && (state.filters.direction === 'positive' ? score > 0 : score < 0);
    });
    const allItems = directionalItems;
    const query = state.filters.criterion.trim().toLocaleLowerCase('vi');
    const items = allItems.filter(item => !query ||
      `${item.ma || ''} ${item.ten || ''}`.toLocaleLowerCase('vi').includes(query));
    if (count) count.textContent = query ? `${items.length}/${allItems.length} tiêu chí` : `${allItems.length} tiêu chí`;
    const select = $('v029RecordCriterion');
    if (select?.value && !allItems.some(item => item.id === select.value)) {
      select.value = '';
      syncCriterionHint();
    }
    for (const criterion of items) {
      const score = criterionScore(criterion);
      const scoreLabel = score === null ? 'chưa cấu hình điểm' : `${score > 0 ? '+' : ''}${score} điểm`;
      const button = make('button', { type: 'button', className: 'outline v029-action-button' }, [
        make('strong', { textContent: criterion.ten }),
        make('small', { textContent: `${criterion.ma || 'Tiêu chí'} · ${criterion.che_do_diem === 'flexible' ? 'Linh hoạt' : 'Cố định'} · ${scoreLabel}` }),
      ]);
      button.dataset.criterionId = criterion.id;
      button.onclick = () => {
        const select = $('v029RecordCriterion');
        select.value = criterion.id;
        state.filters.criterion = '';
        $('v029CriterionSearch').value = '';
        syncCriterionHint();
        renderCriteriaActions();
        renderWorkflow();
      };
      root.append(button);
    }
    if (!areaItems.length) root.append(make('small', { textContent: 'Mảng này chưa có tiêu chí nào được gắn. Hãy thêm tiêu chí trong Quản lý thi đua và chọn đúng mảng.' }));
    else if (!targetItems.length) root.append(make('small', { textContent: `Mảng này có ${areaItems.length} tiêu chí nhưng chưa có tiêu chí dành cho ${targetType === 'student' ? 'cá nhân' : 'tập thể/lớp'}.` }));
    else if (!allItems.length) {
      const directionLabel = state.filters.direction === 'positive' ? 'điểm cộng' : 'điểm trừ';
      const missingScores = targetItems.filter(item => criterionScore(item) === null).length;
      const otherDirection = targetItems.filter(item => {
        const score = criterionScore(item);
        return score !== null && (state.filters.direction === 'positive' ? score < 0 : score > 0);
      }).length;
      const message = missingScores === targetItems.length
        ? `${targetItems.length} tiêu chí đúng mảng và đối tượng nhưng chưa cấu hình điểm.`
        : otherDirection
          ? `Không có ${directionLabel} cho đối tượng này; ${otherDirection} tiêu chí thuộc chiều điểm ngược lại${missingScores ? ` và ${missingScores} tiêu chí chưa cấu hình điểm` : ''}.`
          : `Không có tiêu chí ${directionLabel} có điểm khác 0 cho đối tượng này${missingScores ? `; ${missingScores} tiêu chí chưa cấu hình điểm` : ''}.`;
      root.append(make('small', { textContent: message }));
    }
    else if (!items.length) root.append(make('small', { textContent: 'Không tìm thấy tiêu chí. Hãy thử từ khóa khác.' }));
    const selected = selectedCriterion();
    root.querySelectorAll('button').forEach(button => { button.classList.toggle('selected', button.dataset.criterionId === selected?.id); });
  }

  function renderWorkflow() {
    const gradeRoot = $('v029GradeButtons');
    const classRoot = $('v029ClassButtons');
    const targetSelect = $('v029RecordTargetSelect');
    const targetType = selectedValue('v029RecordTarget');
    const areaSelected = Boolean($('v029RecordArea')?.value);
    $('v029RecordModeStep').hidden = !areaSelected;
    $('v029GradeStep').hidden = !areaSelected || !targetType;
    $('v029ClassStep').hidden = !areaSelected || !targetType;
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
    if (targetType === 'class' && state.filters.className && !visibleClasses.includes(state.filters.className)) {
      state.filters.className = '';
    }
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
      const query = state.filters.student;
      const available = items.filter(item =>
        (!state.filters.grade || gradeOf(item.lop) === state.filters.grade) &&
        (!state.filters.className || item.lop === state.filters.className));
      const visible = available.filter(item => matchesStudentSearch(item, query));
      targetSelect.replaceChildren();
      if (available.length) {
        targetSelect.append(make('option', { value: '', textContent: 'Chọn học sinh...', disabled: true, selected: true }));
      }
      for (const item of visible) targetSelect.append(make('option', { value: item.ma_dinh_danh, textContent: `${item.ho_ten} · ${item.ma_dinh_danh}` }));
      if (!visible.length && available.length) {
        targetSelect.append(make('option', { value: '', textContent: 'Không tìm thấy học sinh phù hợp', disabled: true, selected: true }));
      }
      if ([...targetSelect.options].some(option => option.value === previous)) targetSelect.value = previous;
      targetSelect.hidden = false;
      targetSelect.required = available.length > 0;
      $('v029StudentCount').textContent = query ? `${visible.length} kết quả` : `${visible.length} học sinh`;
      $('v029StudentSearchLabel').hidden = available.length === 0;
    }
    if (targetSelect && targetType === 'class') {
      const selectedClass = state.filters.className && visibleClasses.includes(state.filters.className)
        ? state.filters.className
        : '';
      targetSelect.value = selectedClass;
      state.filters.className = selectedClass;
      targetSelect.hidden = false;
      targetSelect.required = visibleClasses.length > 0;
      $('v029StudentCount').textContent = `${visibleClasses.length} lớp`;
    }
    const targetCodeValue = targetCode();
    const hasTarget = Boolean(targetCodeValue);
    const targetStep = $('v029TargetStep');
    const criteriaStep = $('v029CriteriaStep');
    if (targetStep) targetStep.hidden = !areaSelected || !targetType;
    if (criteriaStep) criteriaStep.hidden = !areaSelected || !hasTarget;
    renderCriteriaActions();
    $('v029RecordForm').hidden = !areaSelected || !hasTarget || !selectedCriterion();
  }

  function resetRecordInputs(clearArea = true) {
    if (clearArea) {
      $('v029RecordArea').value = '';
      document.querySelectorAll('input[name="v029RecordTarget"]').forEach(input => { input.checked = false; });
      state.targets = { student: [], class: [] };
    }
    state.filters.grade = '';
    state.filters.className = '';
    state.filters.search = '';
    state.filters.student = '';
    state.filters.criterion = '';
    state.filters.direction = 'positive';
    $('v029ClassSearch').value = '';
    $('v029StudentSearch').value = '';
    $('v029CriterionSearch').value = '';
    $('v029RecordTargetSelect').replaceChildren();
    $('v029RecordTargetSelect').value = '';
    $('v029RecordCriterion').value = '';
    $('v029RecordCycle').value = '';
    $('v029RecordValue').value = '';
    $('v029RecordContent').value = '';
    $('v029RecordTargetHint').textContent = '';
    for (const [id, direction] of [['v029PositivePoints', 'positive'], ['v029NegativePoints', 'negative']]) {
      const selected = direction === state.filters.direction;
      $(id).classList.toggle('selected', selected);
      $(id).setAttribute('aria-pressed', String(selected));
    }
    fillCriteriaOptions();
    renderWorkflow();
    if (!clearArea && $('v029RecordArea').value) void loadTargets();
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
      const scoreValue = record.diem_tai_thoi_diem ?? record.gia_tri_thuc_te;
      const score = scoreValue === null || scoreValue === undefined ? 'điểm chưa lưu' : `${Number(scoreValue) > 0 ? '+' : ''}${scoreValue} điểm`;
      const recordedAt = record.ngay_tao
        ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(record.ngay_tao))
        : 'Không có thời điểm';
      const row = make('article', { className: 'v029-entry' }, [
        make('strong', { textContent: `${record.ma_tieu_chi_tai_thoi_diem || record.ma_tieu_chi || ''} · ${record.ten_tieu_chi_tai_thoi_diem || record.ten_tieu_chi || ''} · ${score}` }),
        make('small', { textContent: `${record.ma_mang_tai_thoi_diem || record.ma_mang || ''} · ${record.doi_tuong === 'student' ? 'cá nhân' : 'tập thể/lớp'} ${record.doi_tuong_ma} · ghi nhận lúc ${recordedAt}` }),
        make('small', { textContent: `Tài khoản: ${record.nguoi_ghi_nhan_email || record.nguoi_ghi_nhan_id || 'không xác định'} · ${record.noi_dung || 'Không có ghi chú'} · trạng thái ${record.trang_thai}` }),
      ]);
      if (record.trang_thai === 'recorded' && teacherCanRecord()) {
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
      const [areas, criteria, records] = await Promise.allSettled([
        schoolApi('mang_list'),
        schoolApi('tieuchi_list'),
        teacherCanViewHistory() ? schoolApi('ghi_nhan_list') : Promise.resolve([]),
      ]);
      const failures = [];
      const unwrapList = (result, label) => {
        if (result.status === 'rejected') {
          failures.push(`${label}: ${result.reason?.message || 'không tải được'}`);
          return [];
        }
        if (!Array.isArray(result.value)) {
          failures.push(`${label}: dữ liệu trả về không hợp lệ`);
          return [];
        }
        return result.value;
      };
      state.areaLoadError = areas.status === 'rejected'
        ? areas.reason?.message || 'không tải được'
        : Array.isArray(areas.value) ? '' : 'dữ liệu trả về không hợp lệ';
      state.criteriaLoadError = criteria.status === 'rejected'
        ? criteria.reason?.message || 'không tải được'
        : Array.isArray(criteria.value) ? '' : 'dữ liệu trả về không hợp lệ';
      state.areas = unwrapList(areas, 'Mảng thi đua');
      state.criteria = unwrapList(criteria, 'Tiêu chí thi đua');
      state.records = unwrapList(records, 'Lịch sử ghi nhận');
      renderAreaOptions();
      renderWorkflow();
      if (teacherCanRecord()) void loadTargets();
      renderRecords();
      const workflow = panel.querySelector('.v029-workflow');
      if (workflow) workflow.hidden = !teacherCanRecord();
      const historyCard = $('v029RecordList')?.closest('.v029-card');
      if (historyCard) historyCard.hidden = !teacherCanViewHistory();
      setNotice(failures.length
        ? `Một số dữ liệu chưa tải được: ${failures.join(' · ')}`
        : 'Đã tải dữ liệu ghi nhận. Chưa tính điểm tổng hợp.', failures.length > 0);
    } catch (error) { setNotice(error.message, true); }
  }

  function showPanel() {
    document.querySelectorAll('.b43page').forEach(page => { page.hidden = true; });
    const v024Panel = $('v024Panel');
    if (v024Panel) v024Panel.hidden = true;
    panel.hidden = false;
    const workflow = panel.querySelector('.v029-workflow');
    if (workflow) workflow.hidden = !teacherCanRecord();
    const historyCard = $('v029RecordList')?.closest('.v029-card');
    if (historyCard) historyCard.hidden = !teacherCanViewHistory();
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
      make('small', { textContent: 'Chọn cá nhân hoặc tập thể, tìm đối tượng và ghi nhận tiêu chí' }),
      make('span', { textContent: 'Mở màn hình chấm điểm' }),
    ]);
    scoringCard.onclick = showPanel;
    scoringCard.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showPanel(); } };
    document.querySelector('.dashboard-modules')?.append(scoringCard);
    panel = make('section', { id: 'b43-scoring', className: 'b43page panel', hidden: true });
    panel.innerHTML = `
      <h2>Ghi nhận thi đua V0.2.9</h2>
      <p>Chọn mảng, đối tượng và tiêu chí phù hợp. Mỗi lần lưu được ghi lịch sử cùng thời điểm và tài khoản thực hiện.</p>
      <p id="v029ScoringNotice" role="status"></p>
      <div class="v029-workflow">
        <section class="v029-step"><h3>1. Chọn khối</h3><div id="v029GradeButtons" class="v029-choice-grid"></div></section>
        <section class="v029-step"><h3>2. Chọn lớp</h3><input id="v029ClassSearch" placeholder="Tìm nhanh lớp..." autocomplete="off"><div id="v029ClassButtons" class="v029-choice-grid"></div></section>
        <section class="v029-step"><h3>3. Chọn hình thức</h3><div class="v029-mode-grid"><button id="v029ModeStudent" type="button" class="outline v029-mode-button">Cá nhân</button><button id="v029ModeClass" type="button" class="outline v029-mode-button">Tập thể / lớp</button></div></section>
        <section class="v029-step"><h3>4. Chọn tiêu chí</h3><div class="v029-scan-row"><button id="v029ScanQr" type="button" class="outline">Quét QR học sinh</button><video id="v029QrVideo" playsinline hidden></video></div><div id="v029CriteriaActions" class="v029-action-grid"></div></section>
      </div>
      <div class="v029-scoring-grid">
        <section class="v029-card"><h3>Lịch sử ghi nhận</h3><div id="v029RecordList" class="v029-scroll-list"></div></section>
        <section class="v029-card">
          <h3>Ghi nhận được chọn</h3>
          <form id="v029RecordForm">
            <label>Mảng thi đua<select id="v029RecordArea" required></select></label>
            <label>Tiêu chí<select id="v029RecordCriterion" required></select></label>
            <p id="v029CriterionHint" class="v029-hint"></p>
            <fieldset><legend>Đối tượng được ghi nhận</legend><label><input type="radio" name="v029RecordTarget" value="student" checked> Cá nhân</label><label><input type="radio" name="v029RecordTarget" value="class"> Tập thể / lớp</label></fieldset>
            <label>Đối tượng được chọn<select id="v029RecordTargetSelect" required></select></label>
            <p id="v029RecordTargetHint" class="v029-hint"></p>
            <div class="v029-inline-fields">
              <label>Chu kỳ<select id="v029RecordCycle" required><option value="week">Tuần</option><option value="month">Tháng</option><option value="semester">Học kỳ</option><option value="year">Năm học</option></select></label>
              <label>Ngày ghi nhận<input id="v029RecordDate" type="date" required></label>
            </div>
            <label>Giá trị thực tế (chỉ dùng cho điểm linh hoạt)<input id="v029RecordValue" type="number" step="0.01" placeholder="Để trống nếu tiêu chí cố định"></label>
            <label>Nội dung ghi nhận<textarea id="v029RecordContent" maxlength="2000" rows="3"></textarea></label>
            <label>Minh chứng<textarea id="v029RecordEvidence" rows="2"></textarea></label>
            <label>Mã tham chiếu<input id="v029RecordReference" maxlength="120"></label>
            <button type="submit">Lưu ghi nhận</button>
          </form>
        </section>
      </div>`;
    host.append(panel);
    panel.querySelector('h2').classList.add('v029-page-title');
    const workflowSteps = panel.querySelectorAll('.v029-workflow .v029-step');
    const modeStep = workflowSteps[2];
    const gradeStep = workflowSteps[0];
    const classStep = workflowSteps[1];
    const criteriaStep = workflowSteps[3];
    modeStep.id = 'v029RecordModeStep';
    gradeStep.id = 'v029GradeStep';
    classStep.id = 'v029ClassStep';
    const areaStep = make('section', { id: 'v029AreaStep', className: 'v029-step v029-area-step' });
    areaStep.append(make('h3', { textContent: '1. Chọn mảng thi đua' }));
    const targetStep = make('section', { id: 'v029TargetStep', className: 'v029-step' });
    targetStep.append(make('h3', { textContent: '5. Chọn học sinh hoặc lớp' }));
    const targetMode = $('v029RecordForm').querySelector('fieldset');
    targetMode.hidden = true;
    modeStep.append(targetMode);
    const targetSearch = make('input', { id: 'v029StudentSearch', type: 'search', placeholder: 'Nhập tên, chữ cái đầu (ví dụ: ttm) hoặc mã định danh...', autocomplete: 'off' });
    const studentSearchLabel = make('label', { id: 'v029StudentSearchLabel', className: 'v029-search-label', textContent: 'Tìm học sinh' }, [targetSearch]);
    targetStep.append(make('p', { className: 'v029-step-help', textContent: 'Có thể tìm theo tên đầy đủ, chữ cái đầu của họ tên (ví dụ: Trần Tuấn Minh → ttm) hoặc mã định danh.' }));
    targetStep.append(studentSearchLabel);
    const targetSelectLabel = $('v029RecordTargetSelect').closest('label');
    targetSelectLabel.querySelector('select').setAttribute('aria-label', 'Chọn đối tượng');
    targetStep.append(targetSelectLabel);
    targetSelectLabel.append(make('small', { id: 'v029StudentCount', className: 'v029-muted' }));
    targetStep.append($('v029RecordTargetHint'));
    const targetScanRow = criteriaStep.querySelector('.v029-scan-row');
    targetStep.append(targetScanRow);
    modeStep.querySelector('h3').textContent = '2. Chọn cá nhân hoặc tập thể';
    gradeStep.querySelector('h3').textContent = '3. Chọn khối';
    classStep.querySelector('h3').textContent = '4. Chọn lớp';
    criteriaStep.id = 'v029CriteriaStep';
    criteriaStep.querySelector('h3').textContent = '6. Chọn điểm cộng hoặc điểm trừ';
    panel.querySelector('.v029-workflow').replaceChildren(areaStep, modeStep, gradeStep, classStep, targetStep, criteriaStep);
    criteriaStep.hidden = true;
    $('v029RecordForm').hidden = true;
    const areaLabel = $('v029RecordArea').closest('label');
    const criterionLabel = $('v029RecordCriterion').closest('label');
    areaStep.append(areaLabel);
    areaLabel.classList.add('v029-area-select');
    criterionLabel.hidden = true;
    $('v029RecordCriterion').required = false;
    const directionButtons = make('div', { className: 'v029-direction-buttons', role: 'group', 'aria-label': 'Lọc loại điểm' }, [
      make('button', { id: 'v029PositivePoints', type: 'button', className: 'outline v029-direction-button selected', textContent: '＋ Điểm cộng', 'aria-pressed': 'true' }),
      make('button', { id: 'v029NegativePoints', type: 'button', className: 'outline v029-direction-button', textContent: '− Điểm trừ', 'aria-pressed': 'false' }),
    ]);
    criteriaStep.insertBefore(directionButtons, criteriaStep.querySelector('.v029-scan-row'));
    const criterionSearch = make('input', { id: 'v029CriterionSearch', type: 'search', placeholder: 'Tìm tiêu chí theo tên hoặc mã...', autocomplete: 'off', 'aria-label': 'Tìm tiêu chí' });
    const criterionToolbar = make('div', { className: 'v029-filter-toolbar' }, [
      criterionSearch,
      make('small', { id: 'v029CriterionCount', className: 'v029-muted' }),
    ]);
    criteriaStep.insertBefore(criterionToolbar, criteriaStep.querySelector('.v029-scan-row'));
    studentSearchLabel.hidden = true;
    const recordForm = $('v029RecordForm');
    const captureCard = recordForm.closest('.v029-card');
    const cycleLabel = $('v029RecordCycle').closest('label');
    const valueLabel = $('v029RecordValue').closest('label');
    const noteLabel = $('v029RecordContent').closest('label');
    const criterionHint = $('v029CriterionHint');
    criteriaStep.append(criterionLabel);
    noteLabel.firstChild.textContent = 'Ghi chú (không bắt buộc)';
    $('v029RecordDate').closest('label').remove();
    $('v029RecordEvidence').closest('label').remove();
    $('v029RecordReference').closest('label').remove();
    const submitButton = recordForm.querySelector('button[type="submit"]');
    submitButton.textContent = 'Lưu ghi nhận';
    submitButton.classList.add('v029-wide-field');
    const cancelButton = make('button', { id: 'v029RecordCancel', type: 'button', className: 'outline v029-wide-field', textContent: 'Hủy' });
    criterionHint.classList.add('v029-wide-field');
    recordForm.replaceChildren(cycleLabel, valueLabel, noteLabel, criterionHint, submitButton, cancelButton);
    criteriaStep.append(recordForm);
    const scoringGrid = panel.querySelector('.v029-scoring-grid');
    const recordCard = $('v029RecordList').closest('.v029-card');
    const recordList = $('v029RecordList');
    recordCard.querySelector('h3').textContent = 'Lịch sử ghi nhận';
    recordCard.append(recordList);
    captureCard.remove();
    tabButton.onclick = showPanel;
    document.querySelectorAll('[data-b43-tab]').forEach(button => button.addEventListener('click', () => { if (button !== tabButton) panel.hidden = true; }));
    $('v024Tab')?.addEventListener('click', () => { panel.hidden = true; });
    $('v029RecordArea').onchange = () => {
      state.filters.grade = '';
      state.filters.className = '';
      state.filters.search = '';
      state.filters.student = '';
      state.filters.criterion = '';
      $('v029StudentSearch').value = '';
      $('v029ClassSearch').value = '';
      $('v029CriterionSearch').value = '';
      $('v029RecordTargetSelect').replaceChildren();
      state.targets = { student: [], class: [] };
      $('v029RecordCriterion').value = '';
      $('v029RecordValue').value = '';
      $('v029RecordContent').value = '';
      fillCriteriaOptions();
      renderWorkflow();
      void loadTargets();
    };
    $('v029RecordCriterion').onchange = syncCriterionHint;
    $('v029CriterionSearch').oninput = event => { state.filters.criterion = event.target.value; renderCriteriaActions(); };
    const setPointDirection = direction => {
      state.filters.direction = direction;
      $('v029RecordCriterion').value = '';
      $('v029CriterionSearch').value = '';
      state.filters.criterion = '';
      for (const [id, value] of [['v029PositivePoints', 'positive'], ['v029NegativePoints', 'negative']]) {
        const selected = value === direction;
        $(id).classList.toggle('selected', selected);
        $(id).setAttribute('aria-pressed', String(selected));
      }
      syncCriterionHint();
      renderCriteriaActions();
      renderWorkflow();
    };
    $('v029PositivePoints').onclick = () => setPointDirection('positive');
    $('v029NegativePoints').onclick = () => setPointDirection('negative');
    $('v029StudentSearch').oninput = event => { state.filters.student = event.target.value; $('v029RecordTargetSelect').value = ''; renderWorkflow(); };
    document.querySelectorAll('input[name="v029RecordTarget"]').forEach(input => { input.addEventListener('change', () => {
      const targetType = selectedValue('v029RecordTarget');
      state.filters.grade = '';
      state.filters.className = '';
      state.filters.search = '';
      state.filters.student = '';
      state.filters.criterion = '';
      $('v029StudentSearch').value = '';
      $('v029ClassSearch').value = '';
      $('v029CriterionSearch').value = '';
      $('v029RecordTargetSelect').replaceChildren();
      $('v029RecordCriterion').value = '';
      $('v029RecordValue').value = '';
      $('v029RecordContent').value = '';
      state.targets[targetType] = [];
      renderWorkflow();
      void loadTargets();
    }); });
    $('v029ModeStudent').onclick = () => setRecordMode('student');
    $('v029ModeClass').onclick = () => setRecordMode('class');
    $('v029ClassSearch').oninput = event => { state.filters.search = event.target.value.trim(); if (selectedValue('v029RecordTarget') === 'student') $('v029RecordTargetSelect').value = ''; renderWorkflow(); };
    $('v029ScanQr').onclick = scanQrTarget;
    $('v029RecordTargetSelect').onchange = event => {
      if (selectedValue('v029RecordTarget') === 'class') state.filters.className = event.target.value;
      renderWorkflow();
    };
    $('v029RecordCancel').onclick = () => {
      stopQrScanner();
      resetRecordInputs(true);
      setNotice('Đã hủy thao tác. Không có dữ liệu nào được lưu.');
    };
    $('v029RecordForm').onsubmit = async event => {
      event.preventDefault();
      if (!$('v029RecordArea').value) { setNotice('Hãy chọn mảng thi đua.', true); return; }
      if (!targetCode()) { setNotice('Hãy chọn học sinh hoặc lớp trong danh sách.', true); return; }
      const criterion = selectedCriterion();
      if (!criterion) { setNotice('Hãy chọn tiêu chí.', true); return; }
      const target = selectedValue('v029RecordTarget');
      if (criterion.doi_tuong !== target) { setNotice('Đối tượng ghi nhận không khớp với tiêu chí.', true); return; }
      const score = criterionScore(criterion);
      const actualScore = criterion.che_do_diem === 'flexible' ? Number($('v029RecordValue').value) : score;
      if (actualScore === null || !Number.isFinite(actualScore) ||
          (state.filters.direction === 'positive' && actualScore <= 0) ||
          (state.filters.direction === 'negative' && actualScore >= 0)) {
        setNotice('Điểm ghi nhận không phù hợp với mục cộng/trừ đang chọn.', true);
        return;
      }
      const submitButton = $('v029RecordForm').querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        await schoolApi('ghi_nhan_create', {
          mang_id: $('v029RecordArea').value,
          tieu_chi_id: criterion.id,
          doi_tuong: target,
          doi_tuong_ma: targetCode(),
          chu_ky: $('v029RecordCycle').value,
          gia_tri_thuc_te: criterion.che_do_diem === 'flexible' ? $('v029RecordValue').value : '',
          noi_dung: $('v029RecordContent').value.trim(),
        });
        resetRecordInputs(false);
        if (teacherCanViewHistory()) await loadRecords();
        setNotice(teacherCanViewHistory()
          ? 'Đã lưu ghi nhận. Điểm và thông tin tại thời điểm lưu đã được đưa vào lịch sử.'
          : 'Đã lưu ghi nhận thành công.');
      } catch (error) { setNotice(error.message, true); }
      finally { submitButton.disabled = false; }
    };
  }

  function init() {
    buildPanel();
    window.edunexaScoringOpen = showPanel;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
