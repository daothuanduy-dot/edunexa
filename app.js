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
      if(choice.type==='platform'){view('app');refresh();return;}
      $('schoolName').textContent=choice.school.ten_truong;
      $('schoolInfo').textContent=choice.school.ma_truong+' · '+choice.school.trang_thai;
      view('school');
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
  $('logout').onclick=async()=>{await sb.auth.signOut();msg('Đã đăng xuất');await show()};
  $('refresh').onclick=refresh;
  $('createForm').onsubmit=async e=>{e.preventDefault();try{await call('tao_truong',{ma_truong:$('code').value,ten_truong:$('name').value,cap_hoc:$('level').value});msg('Đã tạo trường ở trạng thái bản nháp');e.target.reset();await refresh()}catch(err){msg(err.message,true)}};
  initialize().catch(e=>msg(e.message,true));
})();
