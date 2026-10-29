import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { memory } from './services/store.js';
import { sampleCase } from './data/sampleCase.js';
import { scoreCase } from './services/scoring.js';
import { toPublicCase } from './services/serializer.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const app = express();
app.use(helmet()); app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true })); app.use(express.json({ limit: '32kb' })); app.use(cookieParser());
app.use((req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-Id',req.requestId);next();});
app.use('/api',rateLimit({windowMs:15*60_000,limit:100,standardHeaders:true,legacyHeaders:false}));
app.get('/health',(req,res)=>res.json({ok:true}));
const userSchema=z.object({email:z.string().email().transform(x=>x.toLowerCase()),password:z.string().min(8).max(100),displayName:z.string().min(2).max(40).optional()}).strict();
const caseSchema=z.object({seed:z.string().min(10).max(600),difficulty:z.enum(['easy','medium','hard']).default('medium'),tone:z.enum(['realistic','dramatic','lighthearted']).default('realistic')}).strict();
function publicUser(u){return {id:u.id,email:u.email,displayName:u.displayName};}
function tokenFor(user){return jwt.sign({sub:user.id},env.JWT_SECRET,{expiresIn:'7d'});}
function auth(req,res,next){try{const token=req.cookies.aicourt||req.headers.authorization?.replace(/^Bearer /,'');if(!token)throw new Error();const payload=jwt.verify(token,env.JWT_SECRET);const user=memory.users.get(payload.sub);if(!user)throw new Error();req.user=user;next();}catch{return res.status(401).json({error:{code:'UNAUTHORIZED',message:'Please sign in to continue.'}});}}
function setAuth(res,user){res.cookie('aicourt',tokenFor(user),{httpOnly:true,sameSite:env.NODE_ENV==='production'?'none':'lax',secure:env.NODE_ENV==='production'||env.COOKIE_SECURE==='true',maxAge:7*86400_000,path:'/'});}
function fail(res,status,code,message){return res.status(status).json({error:{code,message}});}
async function generateCase(doc){doc.status='generating';doc.stage='Writing the story';doc.progress=10;for(const [progress,stage] of [[25,'Creating suspects'],[45,'Forging evidence'],[75,'Rendering images'],[95,'Final checks']]){await new Promise(r=>setTimeout(r,180));doc.progress=progress;doc.stage=stage;}doc.status='ready';doc.stage='Finalize';doc.progress=100;doc.readyAt=Date.now();}
app.post('/api/auth/register',rateLimit({windowMs:900_000,limit:20}),async(req,res)=>{const parsed=userSchema.safeParse(req.body);if(!parsed.success)return fail(res,400,'VALIDATION_ERROR',parsed.error.issues[0].message);const {email,password,displayName}=parsed.data;if([...memory.users.values()].some(u=>u.email===email))return fail(res,409,'EMAIL_EXISTS','An account with this email already exists.');const user={id:randomUUID(),email,passwordHash:await bcrypt.hash(password,12),displayName:displayName||email.split('@')[0],createdAt:new Date().toISOString()};memory.users.set(user.id,user);setAuth(res,user);res.status(201).json({user:publicUser(user)});});
app.post('/api/auth/login',rateLimit({windowMs:900_000,limit:20}),async(req,res)=>{const parsed=userSchema.omit({displayName:true}).safeParse(req.body);if(!parsed.success)return fail(res,400,'VALIDATION_ERROR','Enter a valid email and password.');const user=[...memory.users.values()].find(u=>u.email===parsed.data.email);if(!user||!await bcrypt.compare(parsed.data.password,user.passwordHash))return fail(res,401,'INVALID_CREDENTIALS','Email or password is incorrect.');setAuth(res,user);res.json({user:publicUser(user)});});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('aicourt',{path:'/'});res.status(204).end();});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.post('/api/cases',auth,async(req,res)=>{const parsed=caseSchema.safeParse(req.body);if(!parsed.success)return fail(res,400,'VALIDATION_ERROR',parsed.error.issues[0].message);const recent=[...memory.cases.values()].filter(c=>c.userId===req.user.id&&Date.now()-Date.parse(c.createdAt)<3600_000);if(recent.length>=env.CASES_PER_HOUR)return fail(res,429,'QUOTA_EXCEEDED','You have reached the hourly case limit.');const id=randomUUID();const pending={...structuredClone(sampleCase),id,userId:req.user.id,seed:parsed.data.seed,difficulty:parsed.data.difficulty,tone:parsed.data.tone,status:'queued',stage:'Queued',progress:0,error:null,hintsAvailable:sampleCase.hints.length,hintsUsed:0,createdAt:new Date().toISOString(),readyAt:null,accusation:null,result:null};memory.cases.set(id,pending);generateCase(pending);res.status(202).json({caseId:id});});
function owned(req,res){const item=memory.cases.get(req.params.id);if(!item||item.userId!==req.user.id)return null;return item;}
app.get('/api/cases/:id/status',auth,(req,res)=>{const c=owned(req,res);if(!c)return fail(res,404,'CASE_NOT_FOUND','Case file not found.');res.json({status:c.status,stage:c.stage,progress:c.progress,error:c.error});});
app.get('/api/cases',auth,(req,res)=>{const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(50,Math.max(1,Number(req.query.limit)||10));const cases=[...memory.cases.values()].filter(c=>c.userId===req.user.id).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));res.json({cases:cases.slice((page-1)*limit,page*limit).map(c=>({id:c.id,title:c.title,status:c.status,difficulty:c.difficulty,result:c.result?{correct:c.result.correct}:undefined,createdAt:c.createdAt})),page,limit,total:cases.length});});
app.get('/api/cases/:id',auth,(req,res)=>{const c=owned(req,res);if(!c)return fail(res,404,'CASE_NOT_FOUND','Case file not found.');if(!['ready','solved'].includes(c.status))return fail(res,409,'CASE_NOT_READY','The case is still being prepared.');res.json(toPublicCase(c));});
app.post('/api/cases/:id/hint',auth,(req,res)=>{const c=owned(req,res);if(!c)return fail(res,404,'CASE_NOT_FOUND','Case file not found.');if(c.status!=='ready')return fail(res,409,'CASE_NOT_READY','Hints are available once the case is ready.');if(c.hintsUsed>=c.hintsAvailable)return fail(res,403,'NO_HINTS_LEFT','You have used all available hints.');const hint=c.hints[c.hintsUsed++];res.json({level:hint.level,text:hint.text,hintsRemaining:c.hintsAvailable-c.hintsUsed});});
app.post('/api/cases/:id/accuse',auth,(req,res)=>{const c=owned(req,res);if(!c)return fail(res,404,'CASE_NOT_FOUND','Case file not found.');if(c.status==='solved')return fail(res,409,'ALREADY_SOLVED','This case has already been solved.');if(c.status!=='ready')return fail(res,409,'CASE_NOT_READY','The case is still being prepared.');const schema=z.object({suspectId:z.string().min(1),reasoning:z.string().max(500).optional().default('')}).strict();const parsed=schema.safeParse(req.body);if(!parsed.success)return fail(res,400,'VALIDATION_ERROR',parsed.error.issues[0].message);if(!c.suspects.some(s=>s.id===parsed.data.suspectId))return fail(res,400,'INVALID_SUSPECT','Select a suspect from this case.');c.accusation={suspectId:parsed.data.suspectId,reasoning:parsed.data.reasoning,submittedAt:new Date().toISOString()};c.result=scoreCase(parsed.data.suspectId===c.solution.culpritId,c.hintsUsed,Date.now()-c.readyAt);c.status='solved';res.json(toPublicCase(c));});
app.post('/api/cases/:id/retry',auth,(req,res)=>{const c=owned(req,res);if(!c)return fail(res,404,'CASE_NOT_FOUND','Case file not found.');if(c.status!=='failed')return fail(res,409,'NOT_FAILED','Only failed cases can be retried.');c.status='queued';c.progress=0;res.status(202).json({caseId:c.id});});
app.delete('/api/cases/:id',auth,(req,res)=>{const c=owned(req,res);if(!c)return fail(res,404,'CASE_NOT_FOUND','Case file not found.');memory.cases.delete(c.id);res.status(204).end();});
app.use((err,req,res,next)=>{console.error(JSON.stringify({requestId:req.requestId,code:err.code||'INTERNAL_ERROR'}));res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please try again.'}});});

// The production service serves the built SPA and API from one origin.
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') return next();
  res.sendFile(resolve(clientDist, 'index.html'), (error) => {
    if (error) next();
  });
});
