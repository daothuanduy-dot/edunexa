// EduNexa V0.2.7 compatibility bootstrap. Existing app logic remains in src/legacy/app.js.
(function(){
 window.EDUNEXA_VERSION='V0.2.7';
 document.querySelectorAll('[data-edunexa-version]').forEach(function(node){node.textContent='EduNexa · '+window.EDUNEXA_VERSION;});
 var crudTitle=document.querySelector('#v024Panel h2');
 if(crudTitle)crudTitle.textContent='Quản lý dữ liệu '+window.EDUNEXA_VERSION;
 const script=document.createElement('script');
 script.src='src/legacy/app.js?v=0.2.7-fix1';
 script.onerror=()=>{const e=document.getElementById('message');if(e)e.textContent='Không tải được ứng dụng. Kiểm tra đường dẫn src/legacy/app.js';};
 document.head.appendChild(script);
})();

