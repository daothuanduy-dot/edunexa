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

  const request = async (hanh_dong, fields = {}) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw Error('Chưa đăng nhập');
    const response = await fetch(`${cfg.url}/functions/v1/quan-tri-truong`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ hanh_dong, ...fields }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || 'Không xử lý được yêu cầu');
    return result.du_lieu;
  };

  const currentSchool = async () => {
    if (school) return school;
    const context = await request('boi_canh');
    const code = $('schoolCode').textContent.trim();
    school = (context.schools || []).find(item => item.ma_truong === code);
    if (!school) throw Error('Không xác định được trường');
    return school;
  };

  const schoolRequest = async (action, data = {}) => {
    const selected = await currentSchool();
    return request(action, { truong_id: selected.id, du_lieu: data });
  };

  const loadXlsx = async () => {
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
  };

  const aliases = {
    ma_mang: ['ma_mang', 'mang', 'ma_linh_vuc'],
    ten_mang: ['ten_mang', 'ten_linh_vuc'],
    ma_tieu_chi: ['ma_tieu_chi', 'ma_tieu_chi_thi_dua', 'ma_criteria'],
    ten: ['ten', 'ten_tieu_chi', 'tieu_chi'],
    doi_tuong: ['doi_tuong', 'ap_dung'],
    diem: ['diem', 'diem_thuong_tru'],
    chu_ky: ['chu_ky', 'chu_ky_danh_gia', 'ky_danh_gia'],
  };

  function mapHeaders(headerRow) {
    const normalized = headerRow.map(normalize);
    const result = {};
    for (const [key, options] of Object.entries(aliases)) {
      const index = normalized.findIndex(item => options.includes(item));
      if (index >= 0) result[key] = index;
    }
    return result;
  }

  function parseRows(rows) {
    if (rows.length < 2) throw Error('Tệp Excel chưa có dữ liệu');
    const columns = mapHeaders(rows[0]);
    const required = ['ma_mang', 'ten_mang', 'ma_tieu_chi', 'ten', 'doi_tuong', 'diem', 'chu_ky'];
    const missing = required.filter(key => columns[key] === undefined);
    if (missing.length) throw Error(`Thiếu cột: ${missing.join(', ')}`);

    const seen = new Set();
    return rows.slice(1, 101).map((source, index) => {
      const value = key => String(source[columns[key]] ?? '').trim();
      const target = normalize(value('doi_tuong'));
      const item = {
        row: index + 2,
        ma_mang: value('ma_mang'),
        ten_mang: value('ten_mang'),
        ma: value('ma_tieu_chi'),
        ten: value('ten'),
        doi_tuong: ['class', 'lop', 'tap_the'].includes(target) ? 'class' : ['student', 'ca_nhan', 'canhan'].includes(target) ? 'student' : '',
        diem: Number(value('diem').replace(',', '.')),
        chu_ky: value('chu_ky').split(/[,;|\s]+/).map(normalize).filter(Boolean),
        loi: [],
      };
      if (!item.ma_mang || !item.ten_mang) item.loi.push('Thiếu mã/tên mảng');
      if (!item.ma || !item.ten) item.loi.push('Thiếu mã/tên tiêu chí');
      if (!item.doi_tuong) item.loi.push('Đối tượng phải là student hoặc class');
      if (!Number.isFinite(item.diem) || item.diem < -100000 || item.diem > 100000) item.loi.push('Điểm không hợp lệ');
      if (!item.chu_ky.length || item.chu_ky.some(cycle => !['week', 'month', 'semester', 'year'].includes(cycle))) item.loi.push('Chu kỳ không hợp lệ');
      const duplicateKey = `${item.ma_mang}:${item.ma}`.toLowerCase();
      if (seen.has(duplicateKey)) item.loi.push('Trùng trong tệp');
      seen.add(duplicateKey);
      return item;
    });
  }

  function renderPreview() {
    const root = $('v025PreviewRows');
    root.replaceChildren();
    for (const item of preview) {
      const row = document.createElement('div');
      row.className = 'school';
      row.append(
        Object.assign(document.createElement('strong'), { textContent: `Dòng ${item.row}: ${item.ma} · ${item.ten}` }),
        Object.assign(document.createElement('small'), { textContent: item.loi.length ? item.loi.join('; ') : `${item.ma_mang} · ${item.doi_tuong} · ${item.diem} · ${item.chu_ky.join(', ')}` }),
      );
      root.append(row);
    }
    const valid = preview.filter(item => !item.loi.length).length;
    $('v025Import').hidden = !valid;
    $('v025ImportNotice').textContent = `Đã đọc ${preview.length} dòng; hợp lệ ${valid}, lỗi ${preview.length - valid}.`;
  }

  async function previewFile() {
    const file = $('v025Excel').files[0];
    if (!file) {
      $('v025ImportNotice').textContent = 'Chọn tệp Excel trước.';
      return;
    }
    if (!/\.xlsx?$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      $('v025ImportNotice').textContent = 'Chỉ nhận XLS/XLSX tối đa 5 MB.';
      return;
    }
    try {
      const XLSX = await loadXlsx();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      preview = parseRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }));
      renderPreview();
    } catch (error) {
      preview = [];
      $('v025Import').hidden = true;
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
          if (criterionByCode.has(item.ma.toLowerCase())) {
            skipped += 1;
            continue;
          }
          await schoolRequest('tieuchi_create', {
            mang_id: area.id,
            ma: item.ma,
            ten: item.ten,
            doi_tuong: item.doi_tuong,
            diem: item.diem,
            chu_ky: item.chu_ky,
          });
          criterionByCode.add(item.ma.toLowerCase());
          created += 1;
        } catch (error) {
          errors.push(`Dòng ${item.row}: ${error.message}`);
        }
      }
      $('v025ImportNotice').textContent = `Đã thêm ${created}, bỏ qua ${skipped}, lỗi ${errors.length}. ${errors.slice(0, 3).join(' | ')}`;
      if (created) $('v024Refresh').click();
    } catch (error) {
      $('v025ImportNotice').textContent = error.message;
    } finally {
      $('v025Import').disabled = false;
    }
  }

  const box = document.createElement('fieldset');
  box.id = 'v025ImportBox';
  box.hidden = $('v024Kind').value !== 'tieuchi';
  box.innerHTML = '<legend>Nhập tiêu chí từ Excel</legend><p>Mẫu cột: ma_mang, ten_mang, ma_tieu_chi, ten, doi_tuong, diem, chu_ky. Có thể nhập nhiều chu kỳ bằng dấu phẩy.</p><input id="v025Excel" type="file" accept=".xlsx,.xls"><button id="v025Preview" type="button" class="outline">Xem trước Excel</button><button id="v025Import" type="button" hidden>Ghi các dòng hợp lệ</button><p id="v025ImportNotice" role="status"></p><div id="v025PreviewRows" class="b43list"></div>';
  $('v024Form').after(box);
  $('v025Preview').innerHTML = '<span aria-hidden="true">⌕</span><span>Xem trước Excel</span>';
  $('v025Preview').classList.add('v024-action');
  $('v025Import').innerHTML = '<span aria-hidden="true">✓</span><span>Ghi các dòng hợp lệ</span>';
  $('v025Import').classList.add('v024-action');
  $('v024Kind').addEventListener('change', () => {
    box.hidden = $('v024Kind').value !== 'tieuchi';
  });
  $('v025Preview').onclick = previewFile;
  $('v025Import').onclick = importRows;
})();
