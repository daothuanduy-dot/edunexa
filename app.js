(() => {
  const $=id=>document.getElementById(id), cfg=window.EDUNEXA_CONFIG;
  const msg=(s,bad=false)=>{ $('message').textContent=s; $('message').className=bad?'error':'ok'; };
  if(!cfg||!/^https:\/\/.+\.supabase\.co$/.test(cfg.url)||!cfg.publishableKey){msg('Chưa cấu hình config.js.',true);return;}
  const sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const statuses={draft:'Bản nháp',pending_review:'Chờ duyệt',approved:'Đã duyệt',provisioning:'Đang khởi tạo',ready:'Sẵn sàng',active:'Đang hoạt động',suspended:'Tạm ngừng',rejected:'Từ chối'};
  const next={draft:['pending_review','chuyen_trang_thai'],pending_review:['approved','phe_duyet'],approved:['provisioning','bat_dau_khoi_tao'],provisioning:['ready','danh_dau_san_sang'],ready:['active','kich_hoat']};
  async function call(hanh_dong,fields={}){
    const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Vui lòng đăng nhập lại');
    const r=await fetch(`${cfg.url}/functions/v1/quan-tri-truong`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({hanh_dong,...fields})});
    const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.error||'Không thể xử lý yêu cầu');return result.du_lieu;
  }
  async function refresh(){try{const items=await call('danh_sach');const root=$('schools');root.replaceChildren();if(!items.length){root.textContent='Chưa có trường học.';return;}
    for(const s of items){const el=document.createElement('article');el.className='school';const title=document.createElement('strong');title.textContent=s.ten_truong;const info=document.createElement('small');info.textContent=`${s.ma_truong} · ${statuses[s.trang_thai]||s.trang_thai}`;el.append(title,info);
      if(next[s.trang_thai]){const b=document.createElement('button');b.className='outline';b.textContent=`Chuyển sang: ${statuses[next[s.trang_thai][0]] || next[s.trang_thai][0]}`;b.onclick=async()=>{if(!confirm(`Xác nhận thay đổi trạng thái của ${s.ten_truong}?`))return;try{await call(next[s.trang_thai][1],{id:s.id,trang_thai:next[s.trang_thai][0]});msg('Đã cập nhật trạng thái');await refresh()}catch(e){msg(e.message,true)}};el.append(b)}if(['approved','provisioning','ready','active'].includes(s.trang_thai)){const row=document.createElement('div');row.className='assign-row';const input=document.createElement('input');input.placeholder='UUID tài khoản quản trị trường';input.setAttribute('aria-label','UUID quản trị trường');const assign=document.createElement('button');assign.type='button';assign.className='outline';assign.textContent='Gán quản trị viên';assign.onclick=async()=>{if(!confirm('Gán vai trò school_admin cho UID đã nhập tại trường này?'))return;try{await call('gan_quan_tri',{id:s.id,nguoi_dung_id:input.value.trim()});msg('Đã gán quản trị viên trường');input.value=''}catch(e){msg(e.message,true)}};row.append(input,assign);el.append(row)}root.append(el)}
  }catch(e){msg(e.message,true)}}
  let dashboardRequestId=0;
  const resetDashboard=()=>{
    for(const id of ['countYears','countClasses','countMembers']) $(id).textContent='—';
    for(const id of ['hintYears','hintClasses','hintMembers']) $(id).textContent='Đang tải dữ liệu';
  };
  async function loadSchoolDashboard(school){
    const requestId=++dashboardRequestId;
    resetDashboard();
    $('schoolDataNotice').textContent='Đang tải thống kê theo quyền quản trị trường...';
    try{
      const result=await call('thong_ke_dashboard',{truong_id:school.id});
      if(requestId!==dashboardRequestId || $('school').hidden) return;
      if(result.truong_id!==school.id)throw Error('Dữ liệu trả về không đúng trường');
      for(const [count,hint,key] of [
        ['countYears','hintYears','so_nam_hoc'],
        ['countClasses','hintClasses','so_lop_hoc'],
        ['countMembers','hintMembers','so_nguoi_dung']]){
        if(!Number.isSafeInteger(result[key]) || result[key]<0)throw Error('Số liệu không hợp lệ');
        $(count).textContent=String(result[key]);
        $(hint).textContent='Dữ liệu thực từ Supabase';
      }
      $('schoolDataNotice').textContent='Đã đồng bộ số liệu trường. Chỉ số học sinh sẽ bổ sung khi xác định nguồn dữ liệu.';
    }catch(e){
      if(requestId!==dashboardRequestId || $('school').hidden)return;
      resetDashboard();
      for(const id of ['hintYears','hintClasses','hintMembers'])$(id).textContent='Không tải được dữ liệu';
      $('schoolDataNotice').textContent='Lỗi tải Dashboard: '+e.message;
    }
  }
  let recoveryMode=false;
  const panels=['login','recover','reset','app','school','choose'];
  function view(which){for(const id of panels)$(id).hidden=id!==which;$('logout').hidden=!['app','school','choose'].includes(which)}
  async function show(){
    if(recoveryMode){view('reset');return;}
    const {data:{session}}=await sb.auth.getSession();
    if(!session){view('login');return;}
    const ctx=await call('boi_canh');
    const choices=[];
    if(ctx.platform_admin)choices.push({label:'Quản trị nền tảng',type:'platform'});
    for(const school of ctx.schools||[])choices.push({label:school.ten_truong+' · '+school.ma_truong,type:'school',school});
    if(!choices.length){view('login');msg('Tài khoản chưa được cấp quyền quản trị EduNexa.',true);return;}
    const select=(choice)=>{
      ++dashboardRequestId;
      if(choice.type==='platform'){b43School=null;view('app');refresh();return;}
      $('schoolName').textContent=choice.school.ten_truong;
      $('schoolInfo').textContent='Mã trường: '+choice.school.ma_truong;
      $('schoolStatus').textContent=statuses[choice.school.trang_thai]||choice.school.trang_thai;
      $('schoolCode').textContent=choice.school.ma_truong;
      $('schoolRole').textContent='Quản trị trường';
      $('switchContext').hidden=choices.length<2;
      view('school');
      loadSchoolDashboard(choice.school);
      b43School=choice.school;b43Open('overview');b43Load();
    };
    if(choices.length===1){select(choices[0]);return;}
    const root=$('contexts');root.replaceChildren();
    for(const choice of choices){
      const button=document.createElement('button');button.type='button';
      button.className='outline';button.textContent=choice.label;
      button.onclick=()=>select(choice);root.append(button);
    }
    view('choose');
  }
  function isRecoveryUrl(){
    const q=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.slice(1));
    return q.get('type')==='recovery'||h.get('type')==='recovery'||q.has('token_hash')&&q.get('type')==='recovery';
  }
  async function initialize(){
    const q=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.slice(1));
    const error=q.get('error_description')||h.get('error_description');
    if(error){view('login');msg('Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.',true);history.replaceState({},'',location.pathname);return;}
    if(isRecoveryUrl()){
      const tokenHash=q.get('token_hash');
      if(tokenHash){
        const {error:verifyError}=await sb.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
        if(verifyError){view('login');msg('Liên kết khôi phục không hợp lệ hoặc đã hết hạn.',true);history.replaceState({},'',location.pathname);return;}
      }else if(h.has('access_token')){
        const {error:sessionError}=await sb.auth.setSession({access_token:h.get('access_token'),refresh_token:h.get('refresh_token')||''});
        if(sessionError){view('login');msg('Không xác thực được liên kết khôi phục.',true);history.replaceState({},'',location.pathname);return;}
      }
      const {data:{session}}=await sb.auth.getSession();
      if(session){recoveryMode=true;view('reset');history.replaceState({},'',location.pathname);return;}
    }
    await show();
  }
  sb.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY'){recoveryMode=true;view('reset');history.replaceState({},'',location.pathname)}
  });
  $('forgotLink').onclick=()=>{view('recover');$('recoverEmail').value=$('email').value;msg('')};
  $('backLogin').onclick=()=>{view('login');msg('')};
  $('recoverForm').onsubmit=async e=>{
    e.preventDefault();const button=e.submitter;button.disabled=true;
    try{
      const redirectTo=new URL('./',location.href).href;
      const {error}=await sb.auth.resetPasswordForEmail($('recoverEmail').value.trim(),{redirectTo});
      if(error)throw error;
      msg('Nếu email có tài khoản hợp lệ, bạn sẽ nhận được hướng dẫn khôi phục. Hãy kiểm tra cả thư mục Spam.');
    }catch(err){msg(err.message,true)}finally{button.disabled=false}
  };
  $('resetForm').onsubmit=async e=>{
    e.preventDefault();const password=$('newPassword').value;
    if(password.length<12){msg('Mật khẩu phải có ít nhất 12 ký tự.',true);return}
    if(password!==$('confirmPassword').value){msg('Hai mật khẩu không khớp.',true);return}
    const button=e.submitter;button.disabled=true;
    try{
      const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Phiên khôi phục đã hết hạn. Vui lòng yêu cầu liên kết mới.');
      const {error}=await sb.auth.updateUser({password});if(error)throw error;
      $('resetForm').reset();recoveryMode=false;
      await sb.auth.signOut();view('login');msg('Đã cập nhật mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.');
    }catch(err){msg(err.message,true)}finally{button.disabled=false}
  };
  $('loginForm').onsubmit=async e=>{e.preventDefault();try{const {error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)throw error;$('password').value='';msg('Đã đăng nhập');await show()}catch(err){msg(err.message,true)}};
  $('switchContext').onclick=()=>show().catch(e=>msg(e.message,true));
  $('logout').onclick=async()=>{b43School=null;++b43Serial;++dashboardRequestId;await sb.auth.signOut();msg('Đã đăng xuất');await show()};
  $('refresh').onclick=refresh;
  $('createForm').onsubmit=async e=>{e.preventDefault();try{await call('tao_truong',{ma_truong:$('code').value,ten_truong:$('name').value,cap_hoc:$('level').value});msg('Đã tạo trường ở trạng thái bản nháp');e.target.reset();await refresh()}catch(err){msg(err.message,true)}};
  // B4.3: school-scoped operations; B3/B4.1/B4.2.2 flows above remain unchanged.
  let b43School=null,b43Data=null,b43Serial=0;
  const b43notice=(s,bad=false)=>{const el=$('b43notice');el.textContent=s;el.className=bad?'error':'ok';};
  const b43api=(action,du_lieu={})=>call(action,{truong_id:b43School.id,du_lieu});
  const b43Node=(tag,text)=>{const e=document.createElement(tag);e.textContent=String(text??'');return e;};
  function b43Option(select,id,label){const opt=document.createElement('option');opt.value=id;opt.textContent=label;select.append(opt)}
  function b43Selects(){
    const year=$('b43ClassYear'),current=$('b43CurrentYear'),old=year.value;
    year.replaceChildren();current.replaceChildren();b43Option(current,'','Chưa chọn');
    for(const y of b43Data.nam_hoc){b43Option(year,y.id,y.ten_nam_hoc);b43Option(current,y.id,y.ten_nam_hoc)}
    if(b43Data.nam_hoc.some(y=>y.id===old))year.value=old;
    current.value=b43Data.cau_hinh.nam_hoc_hien_hanh_id||'';
  }
  function b43Render(){
    b43Selects();const yroot=$('b43YearList');yroot.replaceChildren();
    for(const y of b43Data.nam_hoc){const row=b43Node('div','');row.className='b43entry';const info=b43Node('div',y.ten_nam_hoc);info.append(b43Node('small',[y.ngay_bat_dau||'Chưa có ngày bắt đầu',y.ngay_ket_thuc||'Chưa có ngày kết thúc'].join(' → ')));const buttons=b43Node('div','');buttons.className='b43buttons';
      const edit=b43Node('button','Sửa');edit.type='button';edit.className='outline';edit.onclick=()=>{$('b43YearId').value=y.id;$('b43YearName').value=y.ten_nam_hoc;$('b43YearStart').value=y.ngay_bat_dau||'';$('b43YearEnd').value=y.ngay_ket_thuc||'';};
      const del=b43Node('button','Xóa');del.type='button';del.className='outline';del.onclick=()=>b43Mutate('xoa_nam_hoc',{id:y.id},`Xóa năm học ${y.ten_nam_hoc}?`);
      buttons.append(edit,del);row.append(info,buttons);yroot.append(row)}
    b43RenderClasses();$('b43DisplayName').value=b43Data.cau_hinh.ten_hien_thi||'';$('b43Notes').value=b43Data.cau_hinh.ghi_chu||'';
    const current=b43Data.nam_hoc.find(x=>x.id===b43Data.cau_hinh.nam_hoc_hien_hanh_id);
    $('b43CurrentLabel').textContent='Năm học hiện hành: '+(current?.ten_nam_hoc||'Chưa chọn');
    const stats=$('b43GradeStats');stats.replaceChildren();for(const x of b43Data.theo_khoi){const r=b43Node('div',`Khối ${x.khoi}: ${x.so_lop} lớp`);r.className='b43entry';stats.append(r)}
    if(!b43Data.theo_khoi.length)stats.textContent='Chưa có lớp học.';
  }
  function b43RenderClasses(){const root=$('b43ClassList');root.replaceChildren();const year=$('b43ClassYear').value;
    for(const l of b43Data.lop_hoc.filter(x=>x.nam_hoc_id===year)){const row=b43Node('div','');row.className='b43entry';row.append(b43Node('span',`${l.ten_lop} · Khối ${l.khoi||'—'}`));const buttons=b43Node('div','');buttons.className='b43buttons';const edit=b43Node('button','Sửa');edit.type='button';edit.className='outline';edit.onclick=()=>{$('b43ClassId').value=l.id;$('b43ClassName').value=l.ten_lop;$('b43ClassGrade').value=l.khoi||'10'};const del=b43Node('button','Xóa');del.type='button';del.className='outline';del.onclick=()=>b43Mutate('xoa_lop',{id:l.id},`Xóa lớp ${l.ten_lop}?`);buttons.append(edit,del);row.append(buttons);root.append(row)}
    if(!root.children.length)root.textContent='Chưa có lớp trong năm học này.';
  }
  async function b43Load(){if(!b43School)return;const serial=++b43Serial;b43notice('Đang tải dữ liệu...');try{const data=await b43api('tong_quan');if(serial!==b43Serial)return;b43Data=data;b43Render();b43notice('Dữ liệu đã đồng bộ');loadSchoolDashboard(b43School)}catch(e){if(serial===b43Serial)b43notice('Lỗi tải dữ liệu: '+e.message,true)}}
  async function b43Mutate(action,data,confirmation){if(confirmation&&!confirm(confirmation))return;try{b43notice('Đang lưu...');await b43api(action,data);await b43Load();b43notice('Đã lưu thành công');return true}catch(e){b43notice(e.message,true);return false}}
  async function b43Logs(){const root=$('b43LogList');root.textContent='Đang tải...';try{const logs=await b43api('nhat_ky');root.replaceChildren();for(const log of logs){const row=b43Node('div','');row.className='b43entry';const date=new Date(log.ngay_tao).toLocaleString('vi-VN');row.append(b43Node('span',`${date} · ${log.hanh_dong} · ${log.doi_tuong}`));root.append(row)}if(!logs.length)root.textContent='Chưa có nhật ký B4.3.'}catch(e){root.textContent=e.message}}
  function b43Open(tab){for(const x of ['years','classes','settings','logs','overview'])$('b43-'+x).hidden=x!==tab;for(const b of document.querySelectorAll('[data-b43-tab]'))b.classList.toggle('selected',b.dataset.b43Tab===tab);if(tab==='logs')b43Logs()}
  for(const b of document.querySelectorAll('[data-b43-tab]'))b.onclick=()=>b43Open(b.dataset.b43Tab);
  $('b43YearClear').onclick=()=>{$('b43YearForm').reset();$('b43YearId').value=''};
  $('b43ClassClear').onclick=()=>{$('b43ClassForm').reset();$('b43ClassId').value=''};
  $('b43ClassYear').onchange=()=>{$('b43ClassId').value='';b43RenderClasses()};
  $('b43YearForm').onsubmit=async e=>{e.preventDefault();const id=$('b43YearId').value;const success=await b43Mutate(id?'sua_nam_hoc':'them_nam_hoc',{...(id?{id}:{}),ten_nam_hoc:$('b43YearName').value.trim(),ngay_bat_dau:$('b43YearStart').value,ngay_ket_thuc:$('b43YearEnd').value});if(success)$('b43YearClear').click()};
  $('b43ClassForm').onsubmit=async e=>{e.preventDefault();const id=$('b43ClassId').value,nam_hoc_id=$('b43ClassYear').value;if(!nam_hoc_id){b43notice('Hãy tạo năm học trước',true);return}const success=await b43Mutate(id?'sua_lop':'them_lop',{...(id?{id}:{}),nam_hoc_id,ten_lop:$('b43ClassName').value.trim(),khoi:$('b43ClassGrade').value});if(success)$('b43ClassClear').click()};
  $('b43SettingsForm').onsubmit=async e=>{e.preventDefault();await b43Mutate('luu_cau_hinh',{nam_hoc_hien_hanh_id:$('b43CurrentYear').value,ten_hien_thi:$('b43DisplayName').value,ghi_chu:$('b43Notes').value})};
  $('b43ReloadLogs').onclick=b43Logs;
  $('b43BatchAdd').onclick=async()=>{const year=$('b43ClassYear').value;if(!year){b43notice('Hãy chọn năm học',true);return}const names=[...new Set($('b43Batch').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];if(!names.length||names.length>40){b43notice('Nhập từ 1 đến 40 lớp',true);return}if(!confirm(`Tạo ${names.length} lớp cho năm học đang chọn?`))return;let ok=0;const failed=[];for(const name of names){const grade=/^(10|11|12)/.exec(name)?.[1];if(!grade){failed.push(name+': không xác định khối');continue}try{await b43api('them_lop',{nam_hoc_id:year,ten_lop:name,khoi:grade});ok++}catch(e){failed.push(name+': '+e.message)}}await b43Load();b43notice(`Đã tạo ${ok}/${names.length} lớp.`+(failed.length?' Lỗi: '+failed.join('; '):''),!!failed.length)};

  initialize().catch(e=>msg(e.message,true));
})();
