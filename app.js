(() => {
  const $=id=>document.getElementById(id), cfg=window.EDUNEXA_CONFIG;
  const msg=(s,bad=false)=>{ $('message').textContent=s; $('message').className=bad?'error':'ok'; };
  if(!cfg||!/^https:\/\/.+\.supabase\.co$/.test(cfg.url)||!cfg.publishableKey){msg('Chưa cấu hình config.js.',true);return;}
  const sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const statuses={draft:'Bản nháp',pending_review:'Chờ duyệt',approved:'Đã duyệt',provisioning:'Đang khởi tạo',ready:'Sẵn sàng',active:'Đang hoạt động',suspended:'Tạm ngừng',rejected:'Từ chối'};
  const next={draft:'pending_review'};
  async function call(hanh_dong,fields={}){
    const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Vui lòng đăng nhập lại');
    const r=await fetch(`${cfg.url}/functions/v1/quan-tri-truong`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({hanh_dong,...fields})});
    const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.error||'Không thể xử lý yêu cầu');return result.du_lieu;
  }
  async function refresh(){try{const items=await call('danh_sach');const root=$('schools');root.replaceChildren();if(!items.length){root.textContent='Chưa có trường học.';return;}
    for(const s of items){const el=document.createElement('article');el.className='school';const title=document.createElement('strong');title.textContent=s.ten_truong;const info=document.createElement('small');info.textContent=`${s.ma_truong} · ${statuses[s.trang_thai]||s.trang_thai}`;el.append(title,info);
      if(next[s.trang_thai]){const b=document.createElement('button');b.className='outline';b.textContent=`Chuyển sang: ${statuses[next[s.trang_thai]]}`;b.onclick=async()=>{if(!confirm(`Xác nhận thay đổi trạng thái của ${s.ten_truong}?`))return;try{await call('chuyen_trang_thai',{id:s.id,trang_thai:next[s.trang_thai]});msg('Đã cập nhật trạng thái');await refresh()}catch(e){msg(e.message,true)}};el.append(b)}root.append(el)}
  }catch(e){msg(e.message,true)}}
  async function show(){const {data:{session}}=await sb.auth.getSession();$('login').hidden=!!session;$('app').hidden=!session;$('logout').hidden=!session;if(session)await refresh()}
  $('loginForm').onsubmit=async e=>{e.preventDefault();try{const {error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)throw error;$('password').value='';msg('Đã đăng nhập');await show()}catch(err){msg(err.message,true)}};
  $('logout').onclick=async()=>{await sb.auth.signOut();msg('Đã đăng xuất');await show()};
  $('refresh').onclick=refresh;
  $('createForm').onsubmit=async e=>{e.preventDefault();try{await call('tao_truong',{ma_truong:$('code').value,ten_truong:$('name').value,cap_hoc:$('level').value});msg('Đã tạo trường ở trạng thái bản nháp');e.target.reset();await refresh()}catch(err){msg(err.message,true)}};
  show().catch(e=>msg(e.message,true));
})();
