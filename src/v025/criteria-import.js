(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cfg = window.EDUNEXA_CONFIG;
  if (!cfg || !window.supabase || !$('v024Panel')) return;

  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  let school = null;
  let preview = [];

  const normalize = value => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  async function request(action, fields = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('Chưa đăng nhập');
    const response = await fetch(`${cfg.url}/functions/v1/quan-tri-truong`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.publishableKey, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ hanh_dong: action, ...fields }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || 'Không xử lý được yêu cầu');
    return result.du_lieu;
  }

  async function schoolRequest(action, data = {}) {
    if (!school) {
      const context = await request('boi_canh');
      const code = $('schoolCode').textContent.trim();
      school = (context.schools || []).find(item => item.ma_truong === code);
      if (!school) throw Error('Không xác định được trường');
    }
    return request(action, { truong_id: school.id, du_lieu: data });
  }

  async function loadXlsx() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload = resolve;
      script.onerror = () => reject(Error('Không tải được thư viện Excel'));
      document.head.append(script);
    });
    if (!window.XLSX) throw Error('Không đọc được thư viện Excel');
    return window.XLSX;
  }

  const aliases = {
    ma_mang: ['ma_mang', 'mang', 'ma_linh_vuc'],
    ten_mang: ['ten_mang', 'ten_linh_vuc'],
    ma_tieu_chi: ['ma_tieu_chi', 'ma_tieu_chi_thi_dua', 'ma_criteria'],
    ten: ['ten', 'ten_tieu_chi', 'tieu_chi'],
    doi_tuong: ['doi_tuong', 'ap_dung'],
    che_do_diem: ['che_do_diem', 'che_do', 'kieu_diem', 'score_mode'],
    diem_co_dinh: ['diem_co_dinh', 'diem'],
    diem_gioi_han: ['diem_gioi_han', 'gioi_han_diem', 'diem_toi_da'],
    chu_ky: ['chu_ky', 'chu_ky_danh_gia', 'ky_danh_gia'],
  };

  function parseRows(rows) {
    if (rows.length < 2) throw Error('Tệp Excel chưa có dữ liệu');
    const normalized = rows[0].map(normalize);
    const columns = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, normalized.findIndex(item => values.includes(item))]));
    const required = ['ma_mang', 'ten_mang', 'ma_tieu_chi', 'ten', 'doi_tuong', 'chu_ky'];
    const missing = required.filter(key => columns[key] < 0);
    if (missing.length) throw Error(`Thiếu cột: ${missing.join(', ')}`);

    const seen = new Set();
    return rows.slice(1, 101).map((source, index) => {
      const value = key => String(source[columns[key]] ?? '').trim();
      const target = normalize(value('doi_tuong'));
      const modeValue = normalize(value('che_do_diem'));
      const mode = ['flexible', 'linh_hoat', 'dynamic', 'thuc_te'].includes(modeValue) ? 'flexible' : 'fixed';
      const fixedRaw = value('diem_co_dinh');
      const limitRaw = value('diem_gioi_han');
      const item = {
        row: index + 2,
        ma_mang: value('ma_mang'),
        ten_mang: value('ten_mang'),
        ma: value('ma_tieu_chi'),
        ten: value('ten'),
        doi_tuong: ['class', 'lop', 'tap_the'].includes(target) ? 'class' : ['student', 'ca_nhan', 'canhan'].includes(target) ? 'student' : '',
        che_do_diem: mode,
        diem_co_dinh: Number((fixedRaw || (mode === 'fixed' ? limitRaw : '')).replace(',', '.')),
        diem_gioi_han: Number((limitRaw || (mode === 'fixed' ? fixedRaw : '')).replace(',', '.')),
        chu_ky: value('chu_ky').split(/[,;|\s]+/).map(normalize).filter(Boolean),
        loi: [],
      };
      if (!item.ma_mang || !item.ten_mang) item.loi.push('Thiếu mã hoặc tên mảng');
      if (!item.ma || !item.ten) item.loi.push('Thiếu mã hoặc tên tiêu chí');
      if (!item.doi_tuong) item.loi.push('Đối tượng phải là student hoặc class');
      const score = mode === 'fixed' ? item.diem_co_dinh : item.diem_gioi_han;
      if (!Number.isFinite(score) || score === 0 || score < -100000 || score > 100000) item.loi.push('Diem khong hop le cho che do da chon');
      if (!item.chu_ky.length || item.chu_ky.some(cycle => !['week', 'month', 'semester', 'year'].includes(cycle))) item.loi.push('Chu kỳ không hợp lệ');
      const duplicateKey = `${item.ma_mang}:${item.ma}`.toLowerCase();
      if (seen.has(duplicateKey)) item.loi.push('Trùng trong tệp');
      seen.add(duplicateKey);
      return item;
    });
  }

  function renderPreview() {
    const root = $('v025PreviewRows');
    const invalidRoot = $('v025InvalidRows');
    const invalidBox = $('v025InvalidBox');
    root.replaceChildren();
    invalidRoot.replaceChildren();
    const invalid = preview.filter(item => item.loi.length);
    invalidBox.hidden = !invalid.length;
    for (const item of invalid) {
      const row = document.createElement('article');
      row.className = 'v025-invalid-row';
      row.append(
        Object.assign(document.createElement('strong'), { textContent: `Dòng ${item.row}: ${item.ma || '(chưa có mã)'} · ${item.ten || '(chưa có tên)'}` }),
        Object.assign(document.createElement('small'), { textContent: item.loi.join('; ') }),
      );
      invalidRoot.append(row);
    }
    for (const item of preview) {
      const row = document.createElement('div');
      row.className = item.loi.length ? 'school v025-preview-invalid' : 'school';
      row.append(
        Object.assign(document.createElement('strong'), { textContent: `Dòng ${item.row}: ${item.ma} · ${item.ten}` }),
        Object.assign(document.createElement('small'), { textContent: item.loi.length ? item.loi.join('; ') : `${item.ma_mang} · ${item.doi_tuong} · giới hạn ${item.diem_gioi_han} · ${item.chu_ky.join(', ')}` }),
      );
      root.append(row);
    }
    const valid = preview.filter(item => !item.loi.length).length;
    $('v025Import').hidden = !valid;
    $('v025ImportNotice').textContent = `Đã đọc ${preview.length} dòng; hợp lệ ${valid}, lỗi ${invalid.length}.`;
  }

  function downloadInvalidReport() {
    const invalid = preview.filter(item => item.loi.length);
    if (!invalid.length) return;
    const headers = ['dong', 'ma_mang', 'ten_mang', 'ma_tieu_chi', 'ten', 'doi_tuong', 'che_do_diem', 'diem_co_dinh', 'diem_gioi_han', 'chu_ky', 'loi'];
    const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...invalid.map(item => [item.row, item.ma_mang, item.ten_mang, item.ma, item.ten, item.doi_tuong, item.che_do_diem, item.diem_co_dinh, item.diem_gioi_han, item.chu_ky.join(','), item.loi.join('; ')])]
      .map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bao_cao_dong_tieu_chi_khong_hop_le.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTemplate() {
    try {
      const XLSX = await loadXlsx();
      const headers = ['ma_mang', 'ten_mang', 'ma_tieu_chi', 'ten', 'doi_tuong', 'che_do_diem', 'diem_co_dinh', 'diem_gioi_han', 'chu_ky'];
      const sample = { ma_mang: 'NN', ten_mang: 'Nề nếp', ma_tieu_chi: 'NN-01', ten: 'Đi học đúng giờ', doi_tuong: 'student', che_do_diem: 'fixed', diem_co_dinh: 1, diem_gioi_han: 1, chu_ky: 'week,month' };
      const sheet = XLSX.utils.json_to_sheet([sample], { header: headers });
      const guide = XLSX.utils.aoa_to_sheet([['Cot', 'Quy tac'], ['ma_mang', 'Ma mang thi dua, bat buoc'], ['ten_mang', 'Ten mang thi dua, bat buoc'], ['ma_tieu_chi', 'Ma tieu chi, bat buoc'], ['ten', 'Ten tieu chi, bat buoc'], ['doi_tuong', 'student hoac class'], ['che_do_diem', 'fixed hoac flexible'], ['diem_co_dinh', 'Bat buoc khi che_do_diem=fixed'], ['diem_gioi_han', 'Bat buoc khi che_do_diem=flexible; dinh muc cao nhat'], ['chu_ky', 'week, month, semester hoac year']]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'TieuChi');
      XLSX.utils.book_append_sheet(workbook, guide, 'HuongDan');
      XLSX.writeFile(workbook, 'mau_nhap_tieu_chi_thi_dua_v0.2.8.xlsx');
      $('v025ImportNotice').textContent = 'Đã tải file mẫu Excel.';
    } catch (error) { $('v025ImportNotice').textContent = error.message; }
  }

  async function previewFile() {
    const file = $('v025Excel').files[0];
    if (!file) { $('v025ImportNotice').textContent = 'Chọn tệp Excel trước.'; return; }
    if (!/\.xlsx?$/i.test(file.name) || file.size > 5 * 1024 * 1024) { $('v025ImportNotice').textContent = 'Chỉ nhận XLS/XLSX tối đa 5 MB.'; return; }
    try {
      const XLSX = await loadXlsx();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      preview = parseRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }));
      renderPreview();
    } catch (error) {
      preview = [];
      $('v025Import').hidden = true;
      $('v025InvalidBox').hidden = true;
      $('v025InvalidRows').replaceChildren();
      $('v025PreviewRows').replaceChildren();
      $('v025ImportNotice').textContent = error.message;
    }
  }

  async function importRows() {
    const valid = preview.filter(item => !item.loi.length);
    if (!valid.length) return;
    $('v025Import').disabled = true;
    let created = 0;
    let skipped = 0;
    const errors = [];
    const skippedRows = [];
    try {
      const areas = await schoolRequest('mang_list');
      const criteria = await schoolRequest('tieuchi_list');
      const areaByCode = new Map(areas.map(area => [String(area.ma).toLowerCase(), area]));
      const criterionByCode = new Set(criteria.map(item => String(item.ma).toLowerCase()));
      for (const item of valid) {
        try {
          let area = areaByCode.get(item.ma_mang.toLowerCase());
          if (!area) {
            area = await schoolRequest('mang_create', { ma: item.ma_mang, ten: item.ten_mang, mo_ta: '' });
            areaByCode.set(item.ma_mang.toLowerCase(), area);
          }
          if (criterionByCode.has(item.ma.toLowerCase())) { skipped += 1; skippedRows.push(`Dòng ${item.row}: mã tiêu chí ${item.ma} đã tồn tại, không ghi trùng.`); continue; }
          await schoolRequest('tieuchi_create', { mang_id: area.id, ma: item.ma, ten: item.ten, doi_tuong: item.doi_tuong, che_do_diem: item.che_do_diem, diem_co_dinh: item.diem_co_dinh, diem_gioi_han: item.diem_gioi_han, diem: item.che_do_diem === 'fixed' ? item.diem_co_dinh : item.diem_gioi_han, chu_ky: item.chu_ky });
          criterionByCode.add(item.ma.toLowerCase());
          created += 1;
        } catch (error) { errors.push(`Dòng ${item.row}: ${error.message}`); }
      }
      $('v025ImportNotice').textContent = `Đã thêm ${created}, bỏ qua ${skipped}, lỗi ${errors.length}.`;
      if (errors.length || skippedRows.length) {
        $('v025InvalidBox').hidden = false;
        const invalidRoot = $('v025InvalidRows');
        for (const message of errors) invalidRoot.append(Object.assign(document.createElement('div'), { className: 'v025-invalid-row', textContent: message }));
        for (const message of skippedRows) invalidRoot.append(Object.assign(document.createElement('div'), { className: 'v025-invalid-row v025-skipped-row', textContent: message }));
      }
      if (created) $('v024Refresh').click();
    } catch (error) { $('v025ImportNotice').textContent = error.message; }
    finally { $('v025Import').disabled = false; }
  }

  const box = document.createElement('fieldset');
  box.id = 'v025ImportBox';
  box.hidden = $('v024Kind').value !== 'tieuchi';
  box.innerHTML = '<legend>Nhập tiêu chí từ Excel</legend><p>Mẫu cột: ma_mang, ten_mang, ma_tieu_chi, ten, doi_tuong, che_do_diem, diem_co_dinh, diem_gioi_han, chu_ky. Với fixed dùng điểm cố định; với flexible dùng định mức cao nhất.</p><input id="v025Excel" type="file" accept=".xlsx,.xls"><button id="v025Template" type="button" class="outline">Tải file mẫu Excel</button><button id="v025Preview" type="button" class="outline">Xem trước Excel</button><button id="v025Import" type="button" hidden>Ghi các dòng hợp lệ</button><p id="v025ImportNotice" role="status"></p><div id="v025InvalidBox" class="v025-invalid-box" hidden><strong>Dòng không hợp lệ</strong><button id="v025InvalidDownload" type="button" class="outline">Tải báo cáo lỗi CSV</button><div id="v025InvalidRows" class="v025-invalid-list"></div></div><div id="v025PreviewRows" class="b43list"></div>';
  $('v024Form').after(box);
  $('v025Template').onclick = downloadTemplate;
  $('v025Preview').onclick = previewFile;
  $('v025Import').onclick = importRows;
  $('v025InvalidDownload').onclick = downloadInvalidReport;
  window.edunexaSyncV025Import = kind => { box.hidden = kind !== 'tieuchi'; };
  $('v024Kind').addEventListener('change', () => window.edunexaSyncV025Import($('v024Kind').value));
  window.edunexaSyncV025Import($('v024Kind').value);
})();
