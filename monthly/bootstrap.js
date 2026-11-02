const cacheKey=Date.now().toString(36);
const stylesheet=document.querySelector('link[href*="styles.css"]');
if(stylesheet)stylesheet.href='./styles.css?v='+cacheKey;
try{
 await import('./app.js?v='+cacheKey);
}catch(error){
 console.error('Monthly bootstrap failed',error);
 const note=document.querySelector('#reviewNote');
 if(note){note.classList.add('error');note.textContent='Не удалось загрузить свежую версию дашборда. Обновите страницу.';}
}
