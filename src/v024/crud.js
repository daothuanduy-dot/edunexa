(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cfg = window.EDUNEXA_CONFIG;
  if (!cfg || !window.supabase) return;

  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  let rows = [];
  let criteriaRows = [];
  let areas = [];
  let school = null;
  let profileFilter = 'all';
  let selectedAreaId = 'all';
  let areaFilterSelect = null;
  let areaFilterLabel = null;
  const selectedCriteriaIds = new Set();
  let selectionToolbar = null;
  let selectionCount = null;
  let selectAllButton = null;
  let clearSelectionButton = null;
  let archiveSelectedButton = null;

  const note = message => { $('v024Notice').textContent = message; };
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const fields = {
    hoso: [['ho_ten', 'Họ tên'], ['ngay_sinh', 'Ngày sinh'], ['lop', 'Lớp'], ['email', 'Email']],
    mang: [['ma', 'Mã mảng'], ['ten', 'Tên mảng'], ['mo_ta', 'Mô tả']],
    tieuchi: [['ma', 'Ma tieu chi'], ['ten', 'Ten tieu chi'], ['diem_gioi_han', 'Gioi han diem']],
  };

  function setTabActive(v024Active) {
    document.querySelectorAll('[data-b43-tab]').forEach(button => button.classList.remove('selected'));
    $('v024Tab').classList.toggle('selected', v024Active);
  }

  async function request(hanh_dong, fieldsData) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('Chưa đăng nhập');
    const response = await fetch(`${cfg.url}/functions/v1/quan-tri-truong`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ hanh_dong, ...fieldsData }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 400 && result.error === 'Thao tác không hợp lệ') {
        throw Error(hanh_dong === 'tieuchi_versions'
          ? 'Backend chưa triển khai tính năng tiêu chí V0.2.8. Hãy deploy Edge Function mới trước.'
          : 'Backend chưa triển khai action V0.2.4. Hãy deploy Edge Function V0.2.4 trước.');
      }
      throw Error(result.error || 'Lỗi xử lý yêu cầu');
    }
    return result.du_lieu;
  }

  async function api(action, data = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('Chưa đăng nhập');
    if (!school) {
      const context = await request('boi_canh', {});
      const code = $('schoolCode').textContent.trim();
      school = (context.schools || []).find(item => item.ma_truong === code);
      if (!school) throw Error('Không xác định được trường');
    }
    return request(action, { truong_id: school.id, du_lieu: data });
  }

  let formulaBox = null;
  let formulaAreaSelect = null;
  let formulaModeSelect = null;
  let formulaMinInput = null;
  let formulaMaxInput = null;
  let formulaNotice = null;

  function ensureFormulaBox() {
    if (formulaBox) return;
    formulaBox = el('section', { id: 'v028FormulaBox', className: 'v024-formula-panel', hidden: true });
    formulaBox.append(el('h3', { textContent: 'Cau hinh cong thuc thi dua cho mang' }));
    formulaBox.append(el('p', { textContent: 'Cong thuc thuoc mang thi dua va tong hop diem thuc te cua cac tieu chi con. Khong gan cong thuc vao tieu chi.' }));
    const areaLabel = el('label', { textContent: 'Mang thi dua' });
    formulaAreaSelect = el('select', { id: 'v028FormulaArea' });
    areaLabel.append(formulaAreaSelect);
    formulaBox.append(areaLabel);
    const modeLabel = el('label', { textContent: 'Kieu cong thuc' });
    formulaModeSelect = el('select', { id: 'v028FormulaMode' });
    formulaModeSelect.append(el('option', { value: 'sum_criteria', textContent: 'Tong diem cac tieu chi' }));
    formulaModeSelect.append(el('option', { value: 'clamp_sum', textContent: 'Tong diem co gioi han' }));
    modeLabel.append(formulaModeSelect);
    formulaBox.append(modeLabel);
    const range = el('div', { className: 'v028-formula-range' });
    const minLabel = el('label', { textContent: 'Diem san (tuy chon)' });
    formulaMinInput = el('input', { id: 'v028FormulaMin', type: 'number', step: '0.01', placeholder: 'De trong neu khong gioi han' });
    minLabel.append(formulaMinInput);
    const maxLabel = el('label', { textContent: 'Diem tran (tuy chon)' });
    formulaMaxInput = el('input', { id: 'v028FormulaMax', type: 'number', step: '0.01', placeholder: 'De trong neu khong gioi han' });
    maxLabel.append(formulaMaxInput);
    range.append(minLabel, maxLabel);
    formulaBox.append(range);
    const save = el('button', { type: 'button', className: 'outline', textContent: 'Luu cong thuc cho mang' });
    formulaNotice = el('p', { role: 'status' });
    formulaBox.append(save, formulaNotice);
    formulaAreaSelect.onchange = loadAreaFormula;
    formulaModeSelect.onchange = syncFormulaRange;
    save.onclick = async () => {
      const areaId = formulaAreaSelect.value;
      if (!areaId) { formulaNotice.textContent = 'Hay tao mang truoc khi cau hinh cong thuc.'; return; }
      const mode = formulaModeSelect.value;
      let ast = { op: 'sum_criteria' };
      if (mode === 'clamp_sum') {
        const min = Number(formulaMinInput.value);
        const max = Number(formulaMaxInput.value);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) { formulaNotice.textContent = 'Diem san/tran khong hop le.'; return; }
        ast = { op: 'clamp', min, max, expr: { op: 'sum_criteria' } };
      }
      save.disabled = true;
      try { const result = await api('mang_formula_save', { id: areaId, ast }); formulaNotice.textContent = `Da luu cong thuc phien ban ${result.phien_ban}.`; }
      catch (error) { formulaNotice.textContent = error.message; }
      finally { save.disabled = false; }
    };
    $('v024Form').after(formulaBox);
  }

  function syncFormulaRange() {
    const enabled = formulaModeSelect?.value === 'clamp_sum';
    if (formulaMinInput) formulaMinInput.disabled = !enabled;
    if (formulaMaxInput) formulaMaxInput.disabled = !enabled;
  }

  async function loadAreaFormula() {
    if (!formulaAreaSelect?.value) return;
    formulaNotice.textContent = 'Dang tai cong thuc...';
    try {
      const result = await api('mang_formula_get', { id: formulaAreaSelect.value });
      const ast = result?.ast || { op: 'sum_criteria' };
      if (ast.op === 'clamp' && ast.expr?.op === 'sum_criteria') {
        formulaModeSelect.value = 'clamp_sum';
        formulaMinInput.value = ast.min ?? '';
        formulaMaxInput.value = ast.max ?? '';
      } else {
        formulaModeSelect.value = 'sum_criteria';
        formulaMinInput.value = '';
        formulaMaxInput.value = '';
      }
      syncFormulaRange();
      formulaNotice.textContent = result?.phien_ban ? `Dang xem phien ban ${result.phien_ban}.` : 'Chua co cong thuc; mac dinh tong diem cac tieu chi.';
    } catch (error) { formulaNotice.textContent = error.message; }
  }

  function syncFormulaBox() {
    ensureFormulaBox();
    const visible = $('v024Kind').value === 'mang';
    formulaBox.hidden = !visible;
    if (!visible) return;
    const current = formulaAreaSelect.value;
    formulaAreaSelect.replaceChildren();
    for (const area of areas) formulaAreaSelect.append(el('option', { value: area.id, textContent: `${area.ma} - ${area.ten}` }));
    formulaAreaSelect.value = areas.some(area => area.id === current) ? current : (areas[0]?.id || '');
    loadAreaFormula();
  }

  function setupKindTabs() {
    const select = $('v024Kind');
    const originalLabel = select.closest('label');
    const tabs = el('div', { className: 'v024-kind-tabs', role: 'tablist', 'aria-label': 'Loại dữ liệu' });
    for (const option of select.options) {
      const tabLabel = option.value === 'mang'
        ? 'Mảng thi đua · cấp cha'
        : option.value === 'tieuchi'
          ? 'Tiêu chí thi đua · cấp con'
          : option.textContent;
      const button = el('button', {
        type: 'button',
        role: 'tab',
        className: 'outline',
        textContent: tabLabel,
        'aria-controls': 'v024Rows',
      });
      button.dataset.kind = option.value;
      button.onclick = () => {
        if (option.value === 'tieuchi' && select.value !== 'tieuchi') selectedAreaId = 'all';
        select.value = option.value;
        syncKindControls();
        load();
      };
      tabs.append(button);
    }
    originalLabel.hidden = true;
    originalLabel.before(tabs);

    const profileLabel = el('label', { className: 'v024-profile-filter', textContent: 'Đối tượng hồ sơ' });
    const profileSelect = el('select', { id: 'v024ProfileFilter' });
    for (const [value, text] of [['all', 'Tất cả hồ sơ'], ['student', 'Học sinh'], ['teacher', 'Giáo viên']]) {
      profileSelect.append(el('option', { value, textContent: text }));
    }
    profileSelect.onchange = () => { profileFilter = profileSelect.value; renderRows(); };
    profileLabel.append(profileSelect);
    $('v024Refresh').before(profileLabel);
    areaFilterLabel = el('label', { className: 'v024-area-filter', textContent: 'Lọc tiêu chí theo mảng' });
    areaFilterSelect = el('select', { id: 'v024AreaFilter' });
    areaFilterSelect.append(el('option', { value: 'all', textContent: 'Tất cả mảng thi đua' }));
    areaFilterSelect.onchange = () => {
      selectedAreaId = areaFilterSelect.value;
      const parentSelect = $('v024_mang_id');
      if (selectedAreaId !== 'all' && parentSelect && !$('v024Id').value) parentSelect.value = selectedAreaId;
      renderRows();
    };
    areaFilterLabel.append(areaFilterSelect);
    $('v024Refresh').before(areaFilterLabel);
    selectionToolbar = el('div', { id: 'v024CriteriaSelection', className: 'v024-selection-toolbar', hidden: true });
    selectionCount = el('span', { textContent: '0 tiêu chí được chọn' });
    selectAllButton = el('button', { type: 'button', className: 'outline', textContent: 'Chọn tất cả' });
    clearSelectionButton = el('button', { type: 'button', className: 'outline', textContent: 'Bỏ chọn' });
    archiveSelectedButton = el('button', { type: 'button', className: 'outline', textContent: 'Xóa tiêu chí đã chọn' });
    selectAllButton.onclick = () => {
      rows.forEach(row => selectedCriteriaIds.add(row.id));
      renderRows();
    };
    clearSelectionButton.onclick = () => {
      selectedCriteriaIds.clear();
      renderRows();
    };
    archiveSelectedButton.onclick = async () => {
      const ids = [...selectedCriteriaIds];
      if (!ids.length || !confirm(`Ngừng hiệu lực ${ids.length} tiêu chí đã chọn?`)) return;
      archiveSelectedButton.disabled = true;
      try {
        for (const id of ids) {
          const row = rows.find(item => item.id === id);
          if (row) await api('tieuchi_archive', { id: row.id, ngay_cap_nhat: row.ngay_cap_nhat });
        }
        selectedCriteriaIds.clear();
        await load();
      } catch (error) { note(error.message); }
      finally { archiveSelectedButton.disabled = false; }
    };
    selectionToolbar.append(selectionCount, selectAllButton, clearSelectionButton, archiveSelectedButton);
    $('v024Rows').before(selectionToolbar);
    const iconButton = (button, symbol) => {
      if (!button || button.dataset.iconReady) return;
      button.dataset.iconReady = 'true';
      const label = button.textContent;
      button.innerHTML = `<span aria-hidden="true">${symbol}</span><span>${label}</span>`;
      button.classList.add('v024-action');
    };
    iconButton($('v024Refresh'), '↻');
    iconButton($('v024Clear'), '＋');
    iconButton($('v024Form').querySelector('button[type=submit]'), '✓');

    function syncKindControls() {
      const kind = select.value;
      const kindName = kind === 'hoso' ? 'hồ sơ' : kind === 'mang' ? 'mảng thi đua' : 'tiêu chí thi đua';
      tabs.querySelectorAll('button').forEach(button => {
        const active = button.dataset.kind === kind;
        button.classList.toggle('selected', active);
        button.setAttribute('aria-selected', String(active));
      });
      profileLabel.hidden = kind !== 'hoso';
      areaFilterLabel.hidden = kind !== 'tieuchi';
      if (selectionToolbar) selectionToolbar.hidden = kind !== 'tieuchi';
      if (kind !== 'tieuchi') selectedCriteriaIds.clear();
      if (kind !== 'hoso') profileFilter = 'all';
      const refreshText = $('v024Refresh').querySelector('span:last-child');
      if (refreshText) refreshText.textContent = `Tải danh sách ${kindName}`;
      const clearText = $('v024Clear').querySelector('span:last-child');
      if (clearText) clearText.textContent = kind === 'hoso' ? 'Thêm hồ sơ ở tab Người dùng' : `Thêm ${kindName}`;
      window.edunexaSyncV025Import?.(kind);
    }
    window.edunexaSyncV024Kind = syncKindControls;
    ensureFormulaBox();
    syncKindControls();
  }

  function syncSelectionToolbar() {
    if (!selectionToolbar || !selectionCount) return;
    for (const id of [...selectedCriteriaIds]) if (!rows.some(row => row.id === id)) selectedCriteriaIds.delete(id);
    selectionCount.textContent = `${selectedCriteriaIds.size} tiêu chí được chọn`;
    selectAllButton.disabled = !rows.length || selectedCriteriaIds.size === rows.length;
    clearSelectionButton.disabled = !selectedCriteriaIds.size;
    archiveSelectedButton.disabled = !selectedCriteriaIds.size;
  }

  function syncAreaFilterOptions() {
    if (!areaFilterSelect) return;
    const current = selectedAreaId;
    areaFilterSelect.replaceChildren(el('option', { value: 'all', textContent: 'Tất cả mảng thi đua' }));
    for (const area of areas) {
      areaFilterSelect.append(el('option', {
        value: area.id,
        textContent: `${area.ma} · ${area.ten}`,
      }));
    }
    const stillExists = current === 'all' || areas.some(area => area.id === current);
    selectedAreaId = stillExists ? current : 'all';
    areaFilterSelect.value = selectedAreaId;
  }

  function areaName(id) {
    return areas.find(area => area.id === id)?.ten || 'Chưa xác định mảng cha';
  }

  function ensureHistoryDialog() {
    let dialog = $('v024HistoryDialog');
    if (dialog) return dialog;
    dialog = el('dialog', { id: 'v024HistoryDialog' });
    const heading = el('h3', { textContent: 'Lịch sử phiên bản tiêu chí' });
    const body = el('div', { className: 'v024-history-body' });
    body.dataset.historyBody = 'true';
    const close = el('button', { type: 'button', className: 'outline', textContent: 'Đóng' });
    close.onclick = () => { if (typeof dialog.close === 'function') dialog.close(); else dialog.open = false; };
    dialog.append(heading, body, close);
    $('v024Panel').append(dialog);
    return dialog;
  }

  async function showCriterionHistory(row) {
    const dialog = ensureHistoryDialog();
    const body = dialog.querySelector('[data-history-body]');
    body.replaceChildren(el('p', { textContent: 'Đang tải lịch sử...' }));
    dialog.querySelector('h3').textContent = `Lịch sử: ${row.ma} · ${row.ten}`;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.open = true;
    try {
      const versions = await api('tieuchi_versions', { id: row.id });
      body.replaceChildren();
      if (!versions.length) {
        body.append(el('p', { textContent: 'Chưa có snapshot phiên bản.' }));
        return;
      }
      for (const version of versions) {
        const item = el('article', { className: 'v024-history-item' });
        const title = el('strong', { textContent: `Phiên bản ${version.phien_ban} · ${version.ly_do}` });
        const details = el('small', { textContent: `${version.ten} · ${version.diem_gioi_han ?? version.diem} điểm · ${(version.chu_ky || []).join(', ')} · ${version.doi_tuong === 'student' ? 'Cá nhân' : 'Lớp'}` });
        const time = el('small', { textContent: version.ngay_tao ? new Date(version.ngay_tao).toLocaleString('vi-VN') : '' });
        item.append(title, details, time);
        body.append(item);
      }
    } catch (error) {
      body.replaceChildren(el('p', { className: 'error', textContent: error.message }));
    }
  }

  function openCriteriaForArea(area) {
    selectedAreaId = area.id;
    $('v024Kind').value = 'tieuchi';
    window.edunexaSyncV024Kind?.();
    load();
  }

  function renderForm(row = {}) {
    const kind = $('v024Kind').value;
    const submit = $('v024Form').querySelector('button[type=submit]');
    const actionLabel = kind === 'hoso' && !row.id
      ? 'Tạo hồ sơ ở tab Người dùng'
      : row.id
        ? `Cập nhật ${kind === 'mang' ? 'mảng thi đua' : kind === 'tieuchi' ? 'tiêu chí' : 'hồ sơ'}`
        : `Thêm ${kind === 'mang' ? 'mảng thi đua' : 'tiêu chí thi đua'}`;
    const submitText = submit.querySelector('span:last-child');
    if (submitText) submitText.textContent = actionLabel;
    else submit.textContent = actionLabel;
    $('v024Id').value = row.id || '';
    $('v024Updated').value = row.ngay_cap_nhat || '';
    const root = $('v024Fields');
    root.replaceChildren();

    if (kind === 'hoso' && !row.id) {
      root.textContent = 'Để thêm hồ sơ, sử dụng biểu mẫu nhập hồ sơ V0.2.3 ở tab Người dùng và vai trò.';
      submit.disabled = true;
      return;
    }
    submit.disabled = false;
    for (const [key, title] of fields[kind]) {
      const label = el('label', { textContent: title });
      const input = el('input', {
        id: `v024_${key}`,
        value: row[key] ?? (key === 'diem_gioi_han' ? row.diem : ''),
        required: key === 'ho_ten' || key === 'ma' || key === 'ten',
      });
      if (key === 'ngay_sinh') input.type = 'date';
      if (key === 'diem_gioi_han') { input.type = 'number'; input.step = '0.01'; input.min = '-100000'; input.max = '100000'; input.placeholder = 'Gioi han, khong phai diem cham co dinh'; }
      label.append(input);
      root.append(label);
    }
    if (kind === 'tieuchi') {
      const areaLabel = el('label', { textContent: 'Mảng thi đua (mảng cha)' });
      const areaSelect = el('select', { id: 'v024_mang_id' });
      for (const area of areas) areaSelect.append(el('option', { value: area.id, textContent: area.ten }));
      areaSelect.value = row.mang_id || (selectedAreaId !== 'all' ? selectedAreaId : areas[0]?.id || '');
      areaLabel.append(areaSelect);
      root.append(areaLabel);

      const targetLabel = el('label', { textContent: 'Đối tượng' });
      const targetSelect = el('select', { id: 'v024_doi_tuong' });
      for (const [value, text] of [['student', 'Cá nhân'], ['class', 'Lớp']]) targetSelect.append(el('option', { value, textContent: text }));
      targetSelect.value = row.doi_tuong || 'student';
      targetLabel.append(targetSelect);
      root.append(targetLabel);

      const group = el('fieldset');
      group.append(el('legend', { textContent: 'Chu kỳ (chọn nhiều)' }));
      for (const [value, text] of [['week', 'Tuần'], ['month', 'Tháng'], ['semester', 'Học kỳ'], ['year', 'Năm học']]) {
        const label = el('label', { textContent: text });
        const checkbox = el('input', { type: 'checkbox', value, checked: (row.chu_ky || ['week']).includes(value) });
        checkbox.name = 'v024_cycle';
        label.prepend(checkbox);
        group.append(label);
      }
      root.append(group);
      if (!areas.length) {
        root.prepend(el('p', { className: 'error', textContent: 'Chưa có mảng thi đua. Hãy tạo mảng trước khi thêm tiêu chí.' }));
        submit.disabled = true;
      }
    }
  }

  function renderRows() {
    const kind = $('v024Kind').value;
    syncSelectionToolbar();
    const visibleRows = kind === 'hoso' && profileFilter !== 'all'
      ? rows.filter(row => row.loai === profileFilter)
      : kind === 'tieuchi' && selectedAreaId !== 'all'
        ? rows.filter(row => row.mang_id === selectedAreaId)
        : rows;
    const root = $('v024Rows');
    root.replaceChildren();
    for (const row of visibleRows) {
      const item = el('article', { className: 'v024-row' });
      const detail = el('div', { className: 'v024-row-detail' });
      const title = row.ho_ten || row.ten || row.ma;
      const type = row.loai === 'student' ? 'Học sinh' : row.loai === 'teacher' ? 'Giáo viên' : '';
      const childCount = kind === 'mang' ? criteriaRows.filter(item => item.mang_id === row.id).length : 0;
      const summary = kind === 'hoso'
        ? [type, row.ma_dinh_danh, row.lop, row.email, row.ngay_sinh].filter(Boolean).join(' · ')
        : kind === 'mang'
          ? [row.ma, `Số tiêu chí: ${childCount}`, row.mo_ta].filter(Boolean).join(' · ')
          : [row.ma, row.doi_tuong === 'student' ? 'Cá nhân' : 'Lớp', `gi?i h?n ${row.diem_gioi_han ?? row.diem}`, (row.chu_ky || []).join(', ')].filter(value => value !== undefined && value !== '').join(' · ');
      detail.append(el('strong', { textContent: title }), el('small', { textContent: summary }));
      if (kind === 'tieuchi') {
        detail.append(el('span', { className: 'v024-row-parent', textContent: `Mảng cha: ${areaName(row.mang_id)}` }));
      }
      const actions = el('div', { className: 'v024-row-actions' });
      if (kind === 'tieuchi') {
        const checkbox = el('input', { type: 'checkbox', className: 'v024-row-check', checked: selectedCriteriaIds.has(row.id) });
        checkbox.setAttribute('aria-label', `Chọn tiêu chí ${row.ma}`);
        checkbox.onchange = () => {
          if (checkbox.checked) selectedCriteriaIds.add(row.id); else selectedCriteriaIds.delete(row.id);
          syncSelectionToolbar();
        };
        item.prepend(checkbox);
      }
      if (kind === 'mang') {
        const children = el('button', { type: 'button', className: 'outline v024-action', title: 'Xem các tiêu chí thuộc mảng này' });
        children.innerHTML = `<span aria-hidden="true">→</span><span>Tiêu chí (${childCount})</span>`;
        children.onclick = () => openCriteriaForArea(row);
        actions.append(children);
      }
      if (kind === 'tieuchi') {
        const history = el('button', { type: 'button', className: 'outline v024-action', title: 'Xem lịch sử phiên bản tiêu chí' });
        history.innerHTML = '<span aria-hidden="true">◷</span><span>Lịch sử</span>';
        history.onclick = () => showCriterionHistory(row);
        actions.append(history);
      }
      const edit = el('button', { type: 'button', className: 'outline v024-action', title: 'Sửa bản ghi' });
      edit.innerHTML = '<span aria-hidden="true">✎</span><span>Sửa</span>';
      edit.onclick = () => { renderForm(row); $('v024Form').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      const archive = el('button', { type: 'button', className: 'outline v024-action', title: 'Ngừng hiệu lực bản ghi' });
      archive.innerHTML = '<span aria-hidden="true">⏸</span><span>Xóa · ngừng hiệu lực</span>';
      archive.onclick = async () => {
        const itemName = kind === 'mang' ? 'mảng thi đua' : kind === 'tieuchi' ? 'tiêu chí thi đua' : 'hồ sơ';
        if (!confirm(`Xác nhận xóa mềm ${itemName} này? Bản ghi sẽ chuyển sang ngừng hiệu lực.`)) return;
        try {
          await api(`${kind}_archive`, { id: row.id, ngay_cap_nhat: row.ngay_cap_nhat });
          await load();
          note('Đã ngừng hiệu lực');
        } catch (error) { note(error.message); }
      };
      actions.append(edit, archive);
      item.append(detail, actions);
      root.append(item);
    }
    if (kind === 'tieuchi' && selectedAreaId !== 'all') {
      note(`Đã tải ${rows.length} tiêu chí; đang hiển thị ${visibleRows.length} tiêu chí thuộc mảng “${areaName(selectedAreaId)}”.`);
    } else {
      note(`Đã tải ${rows.length} ${kind === 'mang' ? 'mảng thi đua' : kind === 'tieuchi' ? 'tiêu chí' : 'hồ sơ'}; đang hiển thị ${visibleRows.length}.`);
    }
  }

  async function load() {
    try {
      const kind = $('v024Kind').value;
      if (kind === 'tieuchi') {
        areas = await api('mang_list');
        rows = await api('tieuchi_list');
        criteriaRows = rows;
      } else if (kind === 'mang') {
        rows = await api('mang_list');
        areas = rows;
        criteriaRows = await api('tieuchi_list');
      } else {
        rows = await api(`${kind}_list`);
      }
      syncAreaFilterOptions();
      renderForm();
      renderRows();
      syncFormulaBox();
    } catch (error) { note(error.message); }
  }

  setupKindTabs();
  $('v024Tab').onclick = () => {
    document.querySelectorAll('.b43page').forEach(page => { page.hidden = true; });
    $('v024Panel').hidden = false;
    setTabActive(true);
    school = null;
    load();
  };
  document.querySelectorAll('[data-b43-tab]').forEach(button => button.addEventListener('click', () => {
    $('v024Panel').hidden = true;
    $('v024Tab').classList.remove('selected');
  }));
  $('v024Kind').onchange = () => { if ($('v024Kind').value === 'tieuchi') selectedAreaId = 'all'; window.edunexaSyncV024Kind?.(); load(); };
  $('v024Refresh').onclick = load;
  $('v024Clear').onclick = () => renderForm();
  $('v024Form').onsubmit = async event => {
    event.preventDefault();
    const kind = $('v024Kind').value;
    const id = $('v024Id').value;
    const data = {};
    for (const [key] of fields[kind]) data[key] = $(`v024_${key}`).value;
    if (kind === 'tieuchi') data.diem = data.diem_gioi_han;
    if (kind === 'tieuchi') {
      data.mang_id = $('v024_mang_id').value;
      data.doi_tuong = $('v024_doi_tuong').value;
      data.chu_ky = [...document.querySelectorAll('[name=v024_cycle]:checked')].map(box => box.value);
      if (!data.chu_ky.length) { note('Chọn ít nhất một chu kỳ'); return; }
    }
    if (id) { data.id = id; data.ngay_cap_nhat = $('v024Updated').value; }
    try {
      await api(`${kind}_${id ? 'update' : 'create'}`, data);
      await load();
      note('Đã lưu thành công');
    } catch (error) { note(error.message); }
  };
})();
