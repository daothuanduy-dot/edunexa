// EduNexa V0.2.2 compatibility bootstrap. Existing app logic remains byte-identical in src/legacy/app.js.
(function(){
 const script=document.createElement('script');
 script.src='src/legacy/app.js?v=0.2.4';
 script.onerror=()=>{const e=document.getElementById('message');if(e)e.textContent='Không tải được ứng dụng. Kiểm tra đường dẫn src/legacy/app.js';};
 document.head.appendChild(script);
})();
