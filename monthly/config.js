export const TENANTS = Object.freeze({W: {label:"W"}, CPR: {label:"CPR"}, ORANGE: {label:"Orange"}});
const nowMoscow=new Date(new Date().toLocaleString("en-US",{timeZone:"Europe/Moscow"}));
const availableMonths=[];
for(let y=nowMoscow.getFullYear(),m=nowMoscow.getMonth()+1;y>2026||(y===2026&&m>=7);){availableMonths.push(y+"-"+String(m).padStart(2,"0"));if(--m===0){m=12;y--}}
export const MONTHS = Object.freeze(availableMonths);
export const MARKETPLACES = Object.freeze([{id:"ALL",label:"Все площадки"},{id:"OZON",label:"Ozon"},{id:"WB",label:"WB"},{id:"YANDEX",label:"Яндекс Маркет"}]);
export const GROUPS = Object.freeze([["commission","Комиссия"],["logistics","Логистика"],["storage","Хранение"],["promotion","Продвижение"],["other","Прочие"]]);
