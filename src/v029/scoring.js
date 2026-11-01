(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cfg = window.EDUNEXA_CONFIG;
  if (!cfg || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const state = { school: null, areas: [], criteria: [], members: [], assignments: [], records: [], targets: { student: [], class: [] } };
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
    for (const criterion of state.criteria.filter(item => item.mang_id === areaId)) {
      const mode = criterion.che_do_diem === 'flexible'
        ? `linh hoạt ≤ ${criterion.diem_gioi_han ?? criterion.diem}`
        : `cố định ${criterion.diem_co_dinh ?? criterion.diem}`;
      select.append(make('option', { value: criterion.id, textContent: `${criterion.ma} · ${criterion.ten} · ${mode}` }));
    }
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    syncCriterionHint();
  }

  function syncCriterionHint() {
    const criterion = selectedCriterion();
    const hint = $('v029CriterionHint');
    const valueInput = $('v029RecordValue');
    if (!criterion) {
      if (hint) hint.textContent = 'Mảng đang chọn chưa có tiêu chí.';
      if (valueInput) valueInput.required = false;
      return;
    }
    const mode = criterion.che_do_diem === 'flexible'
      ? `Điểm linh hoạt, giới hạn ${criterion.diem_gioi_han ?? criterion.diem}`
      : `Điểm cố định ${criterion.diem_co_dinh ?? criterion.diem}`;
    if (hint) hint.textContent = `${mode}. Đối tượng áp dụng: ${criterion.doi_tuong === 'student' ? 'cá nhân' : 'tập thể/lớp'}.`;
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
    } catch (error) {
      select.replaceChildren();
      select.hidden = true;
      select.required = false;
      manualLabel.hidden = false;
      manual.required = true;
      hint.textContent = `Không tải được danh sách đối tượng: ${error.message}`;
    }
  }

  function targetCode() {
    const select = $('v029RecordTargetSelect');
    const manual = $('v029RecordTargetManual');
    return select && !select.hidden ? select.value.trim() : (manual?.value || '').trim();
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
    panel = make('section', { id: 'b43-scoring', className: 'b43page panel', hidden: true });
    panel.innerHTML = `<h2>Ghi nhận thi đua V0.2.9</h2><p>Nhập dữ liệu và minh chứng theo phân công. Màn hình này chưa tính điểm tổng hợp, chưa chạy công thức và chưa xếp hạng.</p><p id="v029ScoringNotice" role="status"></p><div class="v029-scoring-grid"><section class="v029-card"><h3>Phân công người ghi nhận</h3><p class="v029-help">Chỉ quản trị trường được tạo phân công. Người ghi nhận chỉ nhập trong phạm vi còn hiệu lực.</p><form id="v029AssignmentForm"><label>Người ghi nhận<select id="v029AssignmentMember" required></select></label><label>Mảng thi đua<select id="v029AssignmentArea" required></select></label><fieldset><legend>Đối tượng</legend><label><input type="radio" name="v029AssignmentTarget" value="student" checked> Cá nhân</label><label><input type="radio" name="v029AssignmentTarget" value="class"> Tập thể / lớp</label></fieldset><label>Phạm vi mã đối tượng (tùy chọn)<input id="v029AssignmentScope" maxlength="120" placeholder="Ví dụ: 10C1 hoặc để trống cho toàn mảng"></label><div class="v029-inline-fields"><label>Từ ngày<input id="v029AssignmentFrom" type="date"></label><label>Đến ngày<input id="v029AssignmentTo" type="date"></label></div><label>Ghi chú<textarea id="v029AssignmentNote" maxlength="1000" rows="2"></textarea></label><button type="submit">＋ Tạo phân công</button></form><div id="v029AssignmentList" class="v029-scroll-list"></div></section><section class="v029-card"><h3>Tạo bản ghi ghi nhận</h3><form id="v029RecordForm"><label>Mảng thi đua<select id="v029RecordArea" required></select></label><label>Tiêu chí<select id="v029RecordCriterion" required></select></label><p id="v029CriterionHint" class="v029-hint"></p><fieldset><legend>Đối tượng được ghi nhận</legend><label><input type="radio" name="v029RecordTarget" value="student" checked> Cá nhân</label><label><input type="radio" name="v029RecordTarget" value="class"> Tập thể / lớp</label></fieldset><label>Đối tượng được chọn<select id="v029RecordTargetSelect" required></select></label><label id="v029RecordTargetManualLabel" hidden>Nhập mã đối tượng<input id="v029RecordTargetManual" maxlength="120" placeholder="Mã hồ sơ học sinh hoặc mã lớp"></label><p id="v029RecordTargetHint" class="v029-hint"></p><div class="v029-inline-fields"><label>Chu kỳ<select id="v029RecordCycle" required><option value="week">Tuần</option><option value="month">Tháng</option><option value="semester">Học kỳ</option><option value="year">Năm học</option></select></label><label>Ngày ghi nhận<input id="v029RecordDate" type="date" required></label></div><label>Giá trị thực tế (chỉ dùng cho điểm linh hoạt)<input id="v029RecordValue" type="number" step="0.01" placeholder="Để trống nếu tiêu chí cố định"></label><label>Nội dung ghi nhận<textarea id="v029RecordContent" maxlength="2000" rows="3"></textarea></label><label>Minh chứng (mỗi dòng một URL hoặc mã tài liệu)<textarea id="v029RecordEvidence" rows="2"></textarea></label><label>Mã tham chiếu (tùy chọn)<input id="v029RecordReference" maxlength="120"></label><button type="submit">＋ Lưu bản ghi</button></form><div id="v029RecordList" class="v029-scroll-list"></div></section></div>`;
    host.append(panel);
    $('v029RecordDate').value = new Date().toISOString().slice(0, 10);
    $('v029AssignmentFrom').value = new Date().toISOString().slice(0, 10);
    tabButton.onclick = showPanel;
    document.querySelectorAll('[data-b43-tab]').forEach(button => button.addEventListener('click', () => { if (button !== tabButton) panel.hidden = true; }));
    $('v024Tab')?.addEventListener('click', () => { panel.hidden = true; });
    $('v029RecordArea').onchange = fillCriteriaOptions;
    $('v029RecordCriterion').onchange = syncCriterionHint;
    document.querySelectorAll('input[name="v029RecordTarget"]').forEach(input => { input.addEventListener('change', loadTargets); });
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
