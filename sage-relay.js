// Additive relay. Existing Convai routes are not changed.
import crypto from 'node:crypto';
export function installSageRelay(app) {
  const jobs = new Map();
  const ttl = 30 * 60 * 1000;
  const auth = role => (req, res, next) => {
    const expected = process.env[role === 'hud' ? 'SAGE_HUD_TOKEN' : 'SAGE_WORKER_TOKEN'];
    if (!expected || expected.length < 32) return res.status(503).json({error:'Sage relay tokens are not configured (minimum 32 characters).'});
    const got = req.get('Authorization') || '';
    const a = Buffer.from(got), b = Buffer.from(`Bearer ${expected}`);
    if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'Invalid relay token.'});
    next();
  };
  const clean = () => {for (const [id,j] of jobs) if (Date.now()-j.created > ttl) jobs.delete(id);};
  const timer = setInterval(clean,60000); timer.unref();
  app.post('/sage/jobs',auth('hud'),(req,res) => {
    clean();
    const {id,text} = req.body || {};
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || typeof text !== 'string' || !text.trim() || text.length>2000) return res.status(400).json({error:'Expected UUID id and 1–2000 character text.'});
    if(jobs.has(id)) return res.json({id,status:jobs.get(id).status});
    if(jobs.size>=100) return res.status(429).json({error:'Queue full. Wait and retry.'});
    jobs.set(id,{id,text:text.trim(),status:'queued',created:Date.now()});
    res.status(202).json({id,status:'queued'});
  });
  app.get('/sage/jobs/:id',auth('hud'),(req,res) => {
    const j=jobs.get(req.params.id);
    if(!j) return res.status(404).json({error:'Job not found; relay may have restarted.'});
    res.json({id:j.id,status:j.status,reply:j.reply || '',error:j.error || ''});
  });
  app.post('/sage/claim',auth('worker'),(req,res) => {
    clean();
    // Do not automatically replay jobs after a crashed worker: speech may already have played.
    for(const j of jobs.values()) if(j.status==='processing' && Date.now()-j.claimed>15*60*1000){j.status='error';j.error='Worker timed out. No automatic replay; submit a new message.';}
    const j=[...jobs.values()].find(x=>x.status==='queued');
    if(!j) return res.status(204).end();
    j.status='processing';j.claimed=Date.now();j.lease=crypto.randomUUID();
    res.json({id:j.id,text:j.text,lease:j.lease});
  });
  app.post('/sage/jobs/:id/result',auth('worker'),(req,res) => {
    const j=jobs.get(req.params.id), body=req.body || {};
    if(!j) return res.status(404).json({error:'Job expired or relay restarted.'});
    if(j.lease!==body.lease) return res.status(409).json({error:'Invalid lease.'});
    if(j.status==='done' || j.status==='error') return res.json({ok:true});
    if(typeof body.error==='string' && body.error){j.status='error';j.error=body.error.slice(0,500);}
    else if(typeof body.reply==='string' && body.reply.trim()){j.status='done';j.reply=body.reply.slice(0,1800);}
    else return res.status(400).json({error:'Missing reply or error.'});
    res.json({ok:true});
  });
}
