// Fragment key decrypts only a bounded export; it grants no API/database access.
export async function openReview() {
 const keyText=new URLSearchParams(location.hash.slice(1)).get("review");
 if(!keyText)return null;
 const decode=text=>{const s=text.replaceAll("-","+").replaceAll("_","/");const p=s+"=".repeat((4-s.length%4)%4);return Uint8Array.from(atob(p),c=>c.charCodeAt(0));};
 const response=await fetch("./review.enc.json",{cache:"no-store",referrerPolicy:"no-referrer"});
 if(!response.ok)throw new Error("Срез ревью временно недоступен.");
 const envelope=await response.json();
 try {
  if(envelope.v===2){
   if(!/^[A-Za-z0-9_-]{86}$/.test(keyText))throw new Error("bad key");
   const material=decode(keyText);
   if(material.length!==64)throw new Error("bad key");
   const encKey=material.slice(0,32),macKey=material.slice(32);
   const iv=decode(envelope.iv),cipher=decode(envelope.ciphertext),expected=decode(envelope.mac);
   const macCryptoKey=await crypto.subtle.importKey("raw",macKey,{name:"HMAC",hash:"SHA-256"},false,["verify"]);
   const signed=new Uint8Array(iv.length+cipher.length);signed.set(iv);signed.set(cipher,iv.length);
   const ok=await crypto.subtle.verify("HMAC",macCryptoKey,expected,signed);
   if(!ok)throw new Error("bad mac");
   const key=await crypto.subtle.importKey("raw",encKey,"AES-CBC",false,["decrypt"]);
   const clear=await crypto.subtle.decrypt({name:"AES-CBC",iv},key,cipher);
   return JSON.parse(new TextDecoder().decode(clear));
  }
  if(!/^[A-Za-z0-9_-]{43}$/.test(keyText))throw new Error("bad key");
  const key=await crypto.subtle.importKey("raw",decode(keyText),"AES-GCM",false,["decrypt"]);
  const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(envelope.iv)},key,decode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(clear));
 }catch{throw new Error("Не удалось открыть срез. Используйте актуальную приватную ссылку ревью.");}
}
