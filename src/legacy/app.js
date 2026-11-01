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
    let ctx={};
    let contextError=null;
    try{ctx=await call('boi_canh')}catch(e){contextError=e}
    let recorderSchools=[];
    try{recorderSchools=await call('scoring_recorder_context')||[]}catch(e){if(!contextError)console.warn('Recorder context is unavailable',e.message)}
    if(contextError&&!recorderSchools.length)throw contextError;
    const choices=[];
    if(ctx.platform_admin)choices.push({label:'Quản trị nền tảng',type:'platform'});
    for(const school of ctx.schools||[])choices.push({label:school.ten_truong+' · '+school.ma_truong,type:'school',school});
    for(const school of recorderSchools){
      if(!(ctx.schools||[]).some(item=>item.id===school.id))choices.push({label:school.ten_truong+' · '+school.ma_truong+' · Ghi nhận thi đua',type:'recorder',school});
    }
    if(!choices.length){view('login');msg('Tài khoản chưa được cấp quyền quản trị EduNexa.',true);return;}
    const select=(choice)=>{
      ++b44Request;++dashboardRequestId;
      if(choice.type==='platform'){b43School=null;view('app');refresh();return;}
      const recorderOnly=choice.type==='recorder';
      $('schoolName').textContent=choice.school.ten_truong;
      $('schoolInfo').textContent='Mã trường: '+choice.school.ma_truong;
      $('schoolStatus').textContent=statuses[choice.school.trang_thai]||choice.school.trang_thai;
      $('schoolCode').textContent=choice.school.ma_truong;
      $('schoolRole').textContent=recorderOnly?'Người ghi nhận thi đua':'Quản trị trường';
      $('switchContext').hidden=choices.length<2;
      $('school').querySelector('.dashboard-stats').hidden=recorderOnly;
      $('school').querySelector('.dashboard-notice').hidden=recorderOnly;
      $('school').querySelector('.dashboard-modules').hidden=recorderOnly;
      document.querySelectorAll('#school > h2, #b43 > .b43tabs, #b43 > #b43notice').forEach(element=>{element.hidden=recorderOnly});
      view('school');
      b43School=choice.school;
      if(recorderOnly){
        const openScoring=()=>window.edunexaScoringOpen?.();
        if(window.edunexaScoringOpen)openScoring();
        else document.addEventListener('DOMContentLoaded',openScoring,{once:true});
        return;
      }
      loadSchoolDashboard(choice.school);
      b43Open('overview');b43Load();
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
  let v023Mode=()=>{};
  const profileBox = document.querySelector('.v023box');
  const profileButton = $('b43OpenProfiles');
  if (profileBox) {
    const profilesPage = document.createElement('section');
    profilesPage.id = 'b43-profiles';
    profilesPage.className = 'b43page panel';
    profilesPage.hidden = true;
    const profileTools = document.createElement('div');
    profileTools.className = 'b43tabs v023-profile-tabs';
    const manageProfiles = b43Node('button', '👩‍🎓 Quản lý học sinh');
    manageProfiles.type = 'button';
    const importProfiles = b43Node('button', '📥 Nhập Excel');
    importProfiles.type = 'button';
    importProfiles.className = 'outline';
    profileTools.append(manageProfiles, importProfiles);
    profilesPage.append(b43Node('h2', 'Quản lý học sinh'), b43Node('p', 'Thêm hồ sơ từng học sinh hoặc nhập danh sách Excel để dùng trong ghi nhận thi đua.'), profileTools, profileBox);
    $('b43').append(profilesPage);
    const showProfileMode = mode => {
      $('v023ManualSection').hidden = mode !== 'manual';
      $('v023ImportSection').hidden = mode !== 'import';
      manageProfiles.classList.toggle('selected', mode === 'manual');
      importProfiles.classList.toggle('selected', mode === 'import');
    };
    v023Mode=showProfileMode;
    manageProfiles.onclick = () => { showProfileMode('manual'); $('v023Code')?.focus(); };
    importProfiles.onclick = () => { showProfileMode('import'); $('v023Excel')?.focus(); };
    showProfileMode('manual');
    profileBox.hidden = false;
    profileButton?.remove();
    const profileTab = document.createElement('button');
    profileTab.type = 'button';
    profileTab.className = 'outline';
    profileTab.dataset.b43Tab = 'profiles';
    profileTab.textContent = '👩‍🎓 Quản lý học sinh';
    document.querySelector('.b43tabs')?.append(profileTab);
    const profileCard = document.createElement('article');
    profileCard.dataset.openTab = 'profiles';
    profileCard.tabIndex = 0;
    profileCard.setAttribute('role', 'button');
    profileCard.append(b43Node('strong', 'Quản lý học sinh'), b43Node('small', 'Nhập hồ sơ và danh sách Excel'), b43Node('span', 'Mở danh sách'));
    document.querySelector('.dashboard-modules')?.append(profileCard);
  }
  function b43Open(tab){for(const x of ['years','classes','settings','logs','overview','members','profiles'])$('b43-'+x).hidden=x!==tab;const scoring=$('b43-scoring');if(scoring)scoring.hidden=true;for(const b of document.querySelectorAll('[data-b43-tab]'))b.classList.toggle('selected',b.dataset.b43Tab===tab);if(tab==='logs')b43Logs();if(tab==='members')b44Members();if(tab==='profiles')v023Load()}
  // B4.4: read-only, school-scoped membership listing. No new auth client or write path.
  let b44Request=0;
  async function b44Members(){
    const serial=++b44Request,root=$('b44MemberList');root.replaceChildren();
    $('b44Notice').textContent='Đang tải thành viên...';
    try{
      if(!b43School)throw Error('Chưa chọn trường');
      const schoolId=b43School.id;
      const [members,permissions]=await Promise.all([
        call('danh_sach_thanh_vien',{truong_id:schoolId}),
        call('scoring_permissions_list',{truong_id:schoolId})
      ]);
      if(serial!==b44Request||!b43School||b43School.id!==schoolId)return;
      if(!Array.isArray(members)||!Array.isArray(permissions))throw Error('Phản hồi không hợp lệ');
      const permissionByMember=new Map(permissions.map(item=>[item.thanh_vien_id,item]));
      for(const m of members){
        const row=b43Node('div','');row.className='b43entry';
        const detail=b43Node('div',m.email||m.nguoi_dung_id);
        detail.append(b43Node('small',`Trạng thái: ${m.trang_thai} · Vai trò: ${(m.vai_tro||[]).join(', ')||'Chưa cấp'}`));
        const permission=permissionByMember.get(m.thanh_vien_id);
        if(!permission)throw Error('Thiếu trạng thái quyền ghi nhận cho thành viên');
        const toggle=document.createElement('button');
        toggle.type='button';
        toggle.className=permission.co_quyen_ghi_nhan?'outline':'';
        toggle.textContent=permission.co_quyen_ghi_nhan?'Gỡ quyền ghi nhận':'Cấp quyền ghi nhận';
        toggle.disabled=m.trang_thai!=='active'&&!permission.co_quyen_ghi_nhan;
        toggle.onclick=async()=>{
          const action=permission.co_quyen_ghi_nhan?'scoring_permission_revoke':'scoring_permission_grant';
          const verb=permission.co_quyen_ghi_nhan?'gỡ':'cấp';
          if(!confirm(`Xác nhận ${verb} quyền ghi nhận cho ${m.email||m.nguoi_dung_id}?`))return;
          toggle.disabled=true;
          try{
            await call(action,{truong_id:schoolId,du_lieu:{thanh_vien_id:m.thanh_vien_id}});
            await b44Members();
            $('b44Notice').textContent=`Đã ${verb} quyền ghi nhận cho ${m.email||m.nguoi_dung_id}.`;
          }catch(e){if(serial===b44Request)$('b44Notice').textContent='Không cập nhật được quyền ghi nhận: '+e.message}
          finally{toggle.disabled=false}
        };
        row.append(detail,toggle);root.append(row);
      }
      $('b44Notice').textContent=`Đã tải ${members.length} thành viên (tối đa 500).`;
      if(!members.length)root.textContent='Trường chưa có thành viên.';
    }catch(e){if(serial===b44Request)$('b44Notice').textContent='Không tải được: '+e.message;}
  }
  $('b44Reload').onclick=b44Members;
  for(const b of document.querySelectorAll('[data-b43-tab]'))if(b.dataset.b43Tab!=='scoring')b.onclick=()=>b43Open(b.dataset.b43Tab);
  // Dashboard cards are shortcuts to the existing B4.3/B4.4 tab handlers.
  for(const card of document.querySelectorAll('[data-open-tab]')){
    const open=()=>{if(!b43School)return;const tab=card.dataset.openTab;b43Open(tab);card.closest('#school')?.querySelector('#b43')?.scrollIntoView({block:'start',behavior:'smooth'});};
    card.addEventListener('click',open);
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  }
  $('b43YearClear').onclick=()=>{$('b43YearForm').reset();$('b43YearId').value=''};
  $('b43ClassClear').onclick=()=>{$('b43ClassForm').reset();$('b43ClassId').value=''};
  $('b43ClassYear').onchange=()=>{$('b43ClassId').value='';b43RenderClasses()};
  $('b43YearForm').onsubmit=async e=>{e.preventDefault();const id=$('b43YearId').value;const success=await b43Mutate(id?'sua_nam_hoc':'them_nam_hoc',{...(id?{id}:{}),ten_nam_hoc:$('b43YearName').value.trim(),ngay_bat_dau:$('b43YearStart').value,ngay_ket_thuc:$('b43YearEnd').value});if(success)$('b43YearClear').click()};
  $('b43ClassForm').onsubmit=async e=>{e.preventDefault();const id=$('b43ClassId').value,nam_hoc_id=$('b43ClassYear').value;if(!nam_hoc_id){b43notice('Hãy tạo năm học trước',true);return}const success=await b43Mutate(id?'sua_lop':'them_lop',{...(id?{id}:{}),nam_hoc_id,ten_lop:$('b43ClassName').value.trim(),khoi:$('b43ClassGrade').value});if(success)$('b43ClassClear').click()};
  $('b43SettingsForm').onsubmit=async e=>{e.preventDefault();await b43Mutate('luu_cau_hinh',{nam_hoc_hien_hanh_id:$('b43CurrentYear').value,ten_hien_thi:$('b43DisplayName').value,ghi_chu:$('b43Notes').value})};
  $('b43ReloadLogs').onclick=b43Logs;
  $('b43BatchAdd').onclick=async()=>{const year=$('b43ClassYear').value;if(!year){b43notice('Hãy chọn năm học',true);return}const names=[...new Set($('b43Batch').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];if(!names.length||names.length>40){b43notice('Nhập từ 1 đến 40 lớp',true);return}if(!confirm(`Tạo ${names.length} lớp cho năm học đang chọn?`))return;let ok=0;const failed=[];for(const name of names){const grade=/^(10|11|12)/.exec(name)?.[1];if(!grade){failed.push(name+': không xác định khối');continue}try{await b43api('them_lop',{nam_hoc_id:year,ten_lop:name,khoi:grade});ok++}catch(e){failed.push(name+': '+e.message)}}await b43Load();b43notice(`Đã tạo ${ok}/${names.length} lớp.`+(failed.length?' Lỗi: '+failed.join('; '):''),!!failed.length)};

  // V0.2.3 - additive profile staging. Auth membership/roles remain unchanged.
  let v023Pending=[];
  const v023Status=(s,bad=false)=>{ $('v023Notice').textContent=s; $('v023Notice').style.color=bad?'#b91c1c':''; };
  const v023School=()=>{if(!b43School?.id)throw Error('Chưa chọn trường');return b43School.id};
  const v023Save=async rows=>{
    let total=0;
    for(let i=0;i<rows.length;){
      // Keep each request under the existing 8192-byte Edge Function limit.
      const batch=[];let bytes=0;
      while(i<rows.length && batch.length<30){const row=rows[i];const size=new TextEncoder().encode(JSON.stringify(row)).length;
        if(size>1900)throw Error('Một hồ sơ quá dài');
        if(batch.length && bytes+size>5300)break;
        batch.push(row);bytes+=size;i++;
      }
      const result=await call('nhap_ho_so',{truong_id:v023School(),du_lieu:{ho_so:batch}});
      total+=result.so_luong||0;
      v023Status(`Đã ghi ${total}/${rows.length} hồ sơ. Không đóng trang trong khi nhập.`);
    }
    return total;
  };
  let v023Rows=[];
  function v023ResetEdit(){ $('v023Form').reset();$('v023Id').value='';$('v023Updated').value='';$('v023Code').readOnly=false;$('v023Type').disabled=false;$('v023Submit').textContent='＋ Lưu hồ sơ';$('v023CancelEdit').hidden=true; }
  $('v023CancelEdit').onclick=v023ResetEdit;
  $('v023Form').onsubmit=async e=>{e.preventDefault();
    const item={loai:$('v023Type').value,ma_dinh_danh:$('v023Code').value.trim(),ho_ten:$('v023Name').value.trim(),ngay_sinh:$('v023Dob').value,lop:$('v023Class').value.trim(),email:$('v023Email').value.trim(),thong_tin:{}};
    const button=$('v023Submit');button.disabled=true;
    try{
      if($('v023Id').value)await call('hoso_update',{truong_id:v023School(),du_lieu:{id:$('v023Id').value,ngay_cap_nhat:$('v023Updated').value,ho_ten:item.ho_ten,ngay_sinh:item.ngay_sinh,lop:item.lop,email:item.email}});
      else await v023Save([item]);
      v023ResetEdit();await v023Load();v023Status('Đã lưu hồ sơ học sinh vào CSDL.');
    }catch(err){v023Status('Không lưu được hồ sơ: '+err.message,true)}finally{button.disabled=false}
  };
  function v023Render(){
    const query=$('v023Search').value.trim().toLocaleLowerCase('vi');
    const rows=v023Rows.filter(p=>[p.ho_ten,p.ma_dinh_danh,p.lop].some(value=>String(value||'').toLocaleLowerCase('vi').includes(query)));
    const root=$('v023List');root.replaceChildren();
    for(const p of rows){const row=document.createElement('article');row.className='v023-student-row';
      const info=document.createElement('div');const title=document.createElement('strong');title.textContent=p.ho_ten;const small=document.createElement('small');small.textContent=`${p.loai==='student'?'Học sinh':'Giáo viên'} · ${p.ma_dinh_danh}${p.lop?' · '+p.lop:''}`;info.append(title,small);
      const actions=document.createElement('div');actions.className='v023-row-actions';
      const edit=document.createElement('button');edit.type='button';edit.className='outline';edit.textContent='✎ Sửa';edit.onclick=()=>{v023Mode('manual');$('v023Id').value=p.id;$('v023Updated').value=p.ngay_cap_nhat;$('v023Type').value=p.loai;$('v023Type').disabled=true;$('v023Code').value=p.ma_dinh_danh;$('v023Code').readOnly=true;$('v023Name').value=p.ho_ten;$('v023Dob').value=p.ngay_sinh||'';$('v023Class').value=p.lop||'';$('v023Email').value=p.email||'';$('v023Submit').textContent='💾 Lưu thay đổi';$('v023CancelEdit').hidden=false;$('v023ManualSection').scrollIntoView({behavior:'smooth',block:'start'});};
      const archive=document.createElement('button');archive.type='button';archive.className='outline';archive.textContent='Ngừng hiệu lực';archive.onclick=async()=>{if(!confirm(`Ngừng hiệu lực hồ sơ ${p.ho_ten}?`))return;try{await call('hoso_archive',{truong_id:v023School(),du_lieu:{id:p.id,ngay_cap_nhat:p.ngay_cap_nhat}});await v023Load();v023Status('Đã ngừng hiệu lực hồ sơ.')}catch(err){v023Status(err.message,true)}};
      actions.append(edit,archive);row.append(info,actions);root.append(row);
    }
    if(!rows.length)root.textContent=query?'Không tìm thấy học sinh phù hợp.':'Chưa có hồ sơ học sinh.';
  }
  $('v023Search').oninput=v023Render;
  async function v023Load(){try{const data=await call('hoso_list',{truong_id:v023School()});v023Rows=Array.isArray(data)?data:[];v023Render();v023Status(`Đã tải ${v023Rows.filter(p=>p.loai==='student').length} học sinh; ${v023Rows.length} hồ sơ đang hoạt động.`);}
    catch(err){v023Status('Không tải được danh sách: '+err.message,true)}}
  $('v023Reload').onclick=v023Load;
  const v023Date=v=>{
    if(!v)return '';
    if(typeof v==='number'){const d=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000);return d.toISOString().slice(0,10)}
    const s=String(v).trim();const m=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(s);
    if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
  };
  async function v023LoadXLSX(){if(window.XLSX)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload=resolve;s.onerror=()=>reject(Error('Không tải được thư viện Excel'));document.head.append(s)});
    if(!window.XLSX)throw Error('Không đọc được thư viện Excel');
  }
  $('v023Preview').onclick=async()=>{v023Pending=[];$('v023Import').hidden=true;
    const file=$('v023Excel').files?.[0];if(!file){$('v023PreviewInfo').textContent='Hãy chọn tệp Excel.';return}
    if(!/\.xlsx?$/i.test(file.name)||file.size>5*1024*1024){$('v023PreviewInfo').textContent='Chỉ nhận XLS/XLSX tối đa 5 MB.';return}
    try{await v023LoadXLSX();const book=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true});const kind=$('v023ImportType').value;
      const preview=[];let invalid=0;const seen=new Set();
      for(const sheetName of book.SheetNames){const rows=XLSX.utils.sheet_to_json(book.Sheets[sheetName],{header:1,defval:'',raw:true});
        const header=rows.findIndex(r=>r.some(v=>String(v).trim()==='Mã định danh Bộ GD&ĐT')&&r.some(v=>String(v).trim()==='Họ tên'));
        if(header<0)continue;
        const keys=rows[header].map(x=>String(x).trim());const col=k=>keys.indexOf(k);
        const classText=rows.slice(0,header).flat().map(String).find(x=>/DANH SÁCH HỌC SINH LỚP\s+/i.test(x))||'';
        const className=/DANH SÁCH HỌC SINH LỚP\s+([^\s]+)/i.exec(classText)?.[1]||'';
        for(const row of rows.slice(header+1)){
          const code=String(row[col('Mã định danh Bộ GD&ĐT')]??'').trim();
          const name=String(row[col('Họ tên')]??'').trim();if(!code&&!name)continue;
          if(!code||!name||code.length>64||name.length>200){invalid++;continue}
          const key=kind+':'+code;if(seen.has(key)){invalid++;continue}seen.add(key);
          const dob=v023Date(row[col('Ngày sinh')]);
          const info={gioi_tinh:String(row[col('Giới tính')]??'').slice(0,50),dan_toc:String(row[col('Dân tộc')]??'').slice(0,80)};
          preview.push({loai:kind,ma_dinh_danh:code,ho_ten:name,ngay_sinh:dob,lop:kind==='student'?className:'',email:'',thong_tin:info});
        }
      }
      v023Pending=preview;const root=$('v023PreviewRows');root.replaceChildren();
      for(const p of preview.slice(0,12)){const div=document.createElement('div');div.textContent=`${p.ma_dinh_danh} · ${p.ho_ten}${p.lop?' · '+p.lop:''}`;root.append(div)}
      $('v023PreviewInfo').textContent=`${preview.length} hồ sơ hợp lệ; ${invalid} dòng bỏ qua. Xem trước 12 dòng. Chưa ghi dữ liệu.`;
      $('v023Import').textContent=`💾 Ghi ${preview.length} hồ sơ hợp lệ vào CSDL`;
      $('v023Import').hidden=!preview.length;
    }catch(err){$('v023PreviewInfo').textContent='Không đọc được Excel: '+err.message}
  };
  $('v023Import').onclick=async()=>{if(!v023Pending.length)return;
    if(!confirm(`Nhập/cập nhật ${v023Pending.length} hồ sơ tại trường hiện tại? Không tạo tài khoản Auth.`))return;
    $('v023Import').disabled=true;try{const n=await v023Save(v023Pending);v023Pending=[];$('v023Import').hidden=true;$('v023Excel').value='';$('v023PreviewRows').replaceChildren();$('v023PreviewInfo').textContent=`Đã ghi ${n} hồ sơ vào CSDL.`;await v023Load();v023Status(`Đã lưu ${n} hồ sơ. Có thể chọn học sinh trong tab Chấm thi đua.`)}
    catch(err){v023Status('Nhập chưa hoàn tất: '+err.message,true)}finally{$('v023Import').disabled=false}
  };
  initialize().catch(e=>msg(e.message,true));
})();
