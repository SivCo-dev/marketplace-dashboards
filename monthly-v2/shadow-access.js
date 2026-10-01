// Fragment key decrypts only a bounded export; it grants no API/database access.
export async function openReview() {
 const keyText=new URLSearchParams(location.hash.slice(1)).get("review");
 if(!keyText)return null;
 if(!/^[A-Za-z0-9_-]{43}$/.test(keyText))throw new Error("Ссылка ревью неполная. Откройте исходную приватную ссылку.");
 const decode=text=>Uint8Array.from(atob(text.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));
 const response=await fetch("./review.enc.json",{cache:"no-store",referrerPolicy:"no-referrer"});
 if(!response.ok)throw new Error("Срез ревью временно недоступен.");
 const envelope=await response.json();
 try {
 const key=await crypto.subtle.importKey("raw",decode(keyText),"AES-GCM",false,["decrypt"]);
 const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(envelope.iv)},key,decode(envelope.ciphertext));
 return JSON.parse(new TextDecoder().decode(clear));
 }catch{throw new Error("Не удалось открыть срез. Используйте актуальную приватную ссылку ревью.");}
}
