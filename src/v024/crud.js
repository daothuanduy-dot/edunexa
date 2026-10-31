(()=>{'use strict';const $=id=>document.getElementById(id),cfg=window.EDUNEXA_CONFIG;
if(!cfg||!window.supabase)return;const sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
let rows=[],areas=[],school=null;const note=(s)=>{$('v024Notice').textContent=s};
async function api(action,data={}){const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Chưa đăng nhập');
if(!school){const ctx=await request('boi_canh',{});const code=$('schoolCode').textContent.trim();school=(ctx.schools||[]).find(x=>x.ma_truong===code);if(!school)throw Error('Không xác định được trường');}
return request(action,{truong_id:school.id,du_lieu:data});}
async function request(hanh_dong,fields){const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Chưa đăng nhập');
const r=await fetch(cfg.url+'/functions/v1/quan-tri-truong',{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token},body:JSON.stringify({hanh_dong,...fields})});const d=await r.json();if(!r.ok)throw Error(d.error||'Lỗi');return d.du_lieu;}
const el=(tag,props={})=>Object.assign(document.createElement(tag),props);
const fields={hoso:[['ho_ten','Họ tên'],['ngay_sinh','Ngày sinh'],['lop','Lớp'],['email','Email']],mang:[['ma','Mã mảng'],['ten','Tên mảng'],['mo_ta','Mô tả']],tieuchi:[['ma','Mã tiêu chí'],['ten','Tên tiêu chí'],['diem','Điểm (+/-)']]};
function renderForm(r={}){const kind=$('v024Kind').value;$('v024Id').value=r.id||'';$('v024Updated').value=r.ngay_cap_nhat||'';const root=$('v024Fields');root.replaceChildren();
if(kind==='hoso'&&!r.id){root.textContent='Để thêm hồ sơ, sử dụng biểu mẫu nhập hồ sơ V0.2.3 ở tab Người dùng và vai trò.';$('v024Form').querySelector('button[type=submit]').disabled=true;return;}
$('v024Form').querySelector('button[type=submit]').disabled=false;
for(const [key,title] of fields[kind]){const label=el('label',{textContent:title});const input=el('input',{id:'v024_'+key,value:r[key]??'',required:key==='ho_ten'||key==='ma'||key==='ten'});if(key==='ngay_sinh')input.type='date';if(key==='diem')input.type='number',input.step='0.01';label.append(input);root.append(label)}
if(kind==='tieuchi'){
const l=el('label',{textContent:'Mảng thi đua'}),sel=el('select',{id:'v024_mang_id'});for(const a of areas){const opt=el('option',{value:a.id,textContent:a.ten});sel.append(opt)}sel.value=r.mang_id||areas[0]?.id||'';l.append(sel);root.append(l);
const ll=el('label',{textContent:'Đối tượng'}),s=el('select',{id:'v024_doi_tuong'});for(const [v,t] of [['student','Cá nhân'],['class','Lớp']])s.append(el('option',{value:v,textContent:t}));s.value=r.doi_tuong||'student';ll.append(s);root.append(ll);
const group=el('fieldset'),legend=el('legend',{textContent:'Chu kỳ (chọn nhiều)'});group.append(legend);for(const [v,t] of [['week','Tuần'],['month','Tháng'],['semester','Học kỳ'],['year','Năm học']]){const label=el('label',{textContent:t}),box=el('input',{type:'checkbox',value:v,checked:(r.chu_ky||['week']).includes(v)});box.name='v024_cycle';label.prepend(box);group.append(label)}root.append(group);
}}
async function load(){try{const kind=$('v024Kind').value;if(kind==='tieuchi')areas=await api('mang_list');rows=await api(kind+'_list');renderForm();const root=$('v024Rows');root.replaceChildren();for(const r of rows){const div=el('div',{className:'school'});div.append(el('strong',{textContent:r.ho_ten||r.ten}),el('small',{textContent:[r.ma_dinh_danh||r.ma,r.lop,r.diem].filter(x=>x!==undefined&&x!==null).join(' · ')}));
const edit=el('button',{type:'button',className:'outline',textContent:'Sửa'});edit.onclick=()=>{renderForm(r);$('v024Form').scrollIntoView({behavior:'smooth'})};const del=el('button',{type:'button',className:'outline',textContent:'Ngừng hiệu lực'});del.onclick=async()=>{if(!confirm('Xác nhận ngừng hiệu lực bản ghi?'))return;try{await api(kind+'_archive',{id:r.id,ngay_cap_nhat:r.ngay_cap_nhat});await load();note('Đã ngừng hiệu lực')}catch(e){note(e.message)}};div.append(edit,del);root.append(div)}note('Đã tải '+rows.length+' bản ghi.')}catch(e){note(e.message)}}
$('v024Tab').onclick=()=>{document.querySelectorAll('.b43page').forEach(x=>x.hidden=true);$('v024Panel').hidden=false;school=null;load()};
document.querySelectorAll('[data-b43-tab]').forEach(b=>b.addEventListener('click',()=>{$('v024Panel').hidden=true}));
$('v024Kind').onchange=load;$('v024Refresh').onclick=load;$('v024Clear').onclick=()=>renderForm();
$('v024Form').onsubmit=async e=>{e.preventDefault();const kind=$('v024Kind').value,id=$('v024Id').value;const d={};for(const [key] of fields[kind])d[key]=$('v024_'+key).value;
if(kind==='tieuchi'){d.mang_id=$('v024_mang_id').value;d.doi_tuong=$('v024_doi_tuong').value;d.chu_ky=[...document.querySelectorAll('[name=v024_cycle]:checked')].map(x=>x.value);if(!d.chu_ky.length){note('Chọn ít nhất một chu kỳ');return}}
if(id){d.id=id;d.ngay_cap_nhat=$('v024Updated').value}try{await api(kind+'_'+(id?'update':'create'),d);await load();note('Đã lưu thành công')}catch(err){note(err.message)}};
})();