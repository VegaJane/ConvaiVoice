import crypto from 'node:crypto';
import fs from 'node:fs';
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
export function installSnapshots(app){
 const images=new Map();
 const clean=()=>{for(const [id,x] of images)if(Date.now()-x.created>1800000)images.delete(id);};
 const timer=setInterval(clean,60000);timer.unref();
 app.get('/snapshots',(_req,res)=>res.type('html').send(fs.readFileSync(new URL('./snapshots.html',import.meta.url),'utf8')));
 app.post('/snapshots/send',async(req,res)=>{
  const token=process.env.SNAPSHOT_TOKEN;
  if(!token||token.length<16)return res.status(503).json({error:'Snapshot uploads are not configured.'});
  if(!equal(req.get('Authorization')||'',`Bearer ${token}`))return res.status(401).json({error:'Incorrect upload code.'});
  clean();
  const {name,question,image}=req.body||{};
  if(typeof name!=='string'||!name.trim()||name.length>80||/[\r\n\[\]]/.test(name)||typeof question!=='string'||question.length>700||typeof image!=='string'||image.length>4000000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))return res.status(400).json({error:'Supply a name, a short question, and a PNG or JPEG under 3 MB.'});
  const bytes=Buffer.from(image.split(',')[1],'base64');
  if(!(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(0,3).equals(Buffer.from([255,216,255]))))return res.status(400).json({error:'Invalid image.'});
  if(images.size>=20)return res.status(429).json({error:'Picture queue full. Try again shortly.'});
  const id=crypto.randomUUID();images.set(id,{image,created:Date.now()});
  try{
   const r=await fetch(`http://127.0.0.1:${process.env.PORT||3000}/sage/jobs`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.SAGE_HUD_TOKEN||''}`},body:JSON.stringify({id,text:`[SNAPSHOT:${id}]\n[Speaker: ${name.trim()} (self-reported upload name)]\n${question.trim()||'What do you think of this picture?'}`}),signal:AbortSignal.timeout(10000)});
   if(!r.ok){images.delete(id);return res.status(503).json({error:'Could not queue picture. Try again.'});}
   res.status(202).json({message:'Picture queued. Riley will reply in Second Life when her Bridge is online.'});
  }catch{images.delete(id);res.status(503).json({error:'Could not queue picture. Try again.'});}
 });
 app.get('/snapshots/image/:id',(req,res)=>{
  const token=process.env.SAGE_WORKER_TOKEN;
  if(!token||!equal(req.get('Authorization')||'',`Bearer ${token}`))return res.status(401).end();
  clean();const x=images.get(req.params.id);if(!x)return res.status(404).json({error:'Picture expired. Please upload again.'});
  res.set('Cache-Control','no-store').json({image:x.image});
 });
}
