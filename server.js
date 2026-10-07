const express=require("express"),http=require("http"),path=require("path"),fs=require("fs"),cors=require("cors");
const bcrypt=require("bcryptjs"),jwt=require("jsonwebtoken"),Database=require("better-sqlite3"),{WebSocketServer}=require("ws"),crypto=require("crypto");
const PORT=+process.env.PORT||3000, SECRET=process.env.JWT_SECRET||"dev-change-me";
const ADMIN_EMAIL=process.env.ADMIN_EMAIL||"admin@example.com", ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"ChangeThisImmediately";
const dbDir=path.join(__dirname,"data");fs.mkdirSync(dbDir,{recursive:true});
const db=new Database(path.join(dbDir,"emergencylink.db"));db.pragma("journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,incident_type TEXT NOT NULL,location TEXT NOT NULL,emergency_number TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,status TEXT NOT NULL,received_via TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);`);
const now=()=>new Date().toISOString(), id=()=>crypto.randomUUID();
const token=u=>jwt.sign({sub:u.id,email:u.email,role:u.role},SECRET,{expiresIn:"7d"});
const existing=db.prepare("SELECT id FROM users WHERE email=?").get(ADMIN_EMAIL);
if(!existing)db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(id(),ADMIN_EMAIL,bcrypt.hashSync(ADMIN_PASSWORD,12),"admin",now());

const app=express();app.use(cors({origin:process.env.CORS_ORIGIN||true}));app.use(express.json({limit:"100kb"}));
app.use(express.static(path.join(__dirname,"public")));
function auth(req,res,next){try{const h=req.headers.authorization||"";req.user=jwt.verify(h.startsWith("Bearer ")?h.slice(7):"",SECRET);next()}catch{res.status(401).json({error:"Authentication required"})}}
function admin(req,res,next){if(req.user?.role!=="admin")return res.status(403).json({error:"Admin access required"});next()}

app.get("/api/health",(q,s)=>s.json({ok:true,time:now()}));
app.post("/api/auth/register",(q,s)=>{const {email,password}=q.body||{};if(!email||!password||password.length<8)return s.status(400).json({error:"Email and 8+ character password required"});try{const u={id:id(),email:email.toLowerCase(),role:"user"};db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(u.id,u.email,bcrypt.hashSync(password,12),u.role,now());s.status(201).json({token:token(u)})}catch{s.status(409).json({error:"Email already registered"})}});
app.post("/api/auth/login",(q,s)=>{const {email,password}=q.body||{},u=db.prepare("SELECT * FROM users WHERE email=?").get(String(email||"").toLowerCase());if(!u||!bcrypt.compareSync(password||"",u.password_hash))return s.status(401).json({error:"Invalid credentials"});s.json({token:token(u),user:{id:u.id,email:u.email,role:u.role}})});

function saveIncident(b,userId,via){const t=b.createdAt||now();return db.prepare(`INSERT OR IGNORE INTO incidents VALUES(?,?,?,?,?,?,?,?,?,?)`).run(b.id,userId,b.incidentType,b.location,b.emergencyNumber,b.description,t,now(),"received",via)}
app.post("/api/incidents",auth,(q,s)=>{const b=q.body||{};if(["incidentType","location","emergencyNumber","description"].some(k=>!String(b[k]||"").trim()))return s.status(400).json({error:"All emergency fields are required"});const iid=b.id||id();saveIncident({...b,id:iid},q.user.sub,"internet");s.status(201).json({id:iid,status:"received"})});
app.post("/api/incidents/sync",auth,(q,s)=>{const list=Array.isArray(q.body?.incidents)?q.body.incidents:[],tx=db.transaction(a=>a.reduce((n,b)=>{if(!b.id||!b.incidentType||!b.location||!b.emergencyNumber||!b.description)return n;return n+saveIncident(b,q.user.sub,"offline-sync").changes},0));s.json({accepted:tx(list)})});
app.get("/api/incidents",auth,(q,s)=>{const rows=q.user.role==="admin"?db.prepare("SELECT * FROM incidents ORDER BY created_at DESC LIMIT 500").all():db.prepare("SELECT * FROM incidents WHERE user_id=? ORDER BY created_at DESC LIMIT 100").all(q.user.sub);s.json(rows)});
app.patch("/api/incidents/:id/status",auth,admin,(q,s)=>{const allowed=["received","verified","dispatched","resolved"];if(!allowed.includes(q.body?.status))return s.status(400).json({error:"Invalid status"});db.prepare("UPDATE incidents SET status=?,updated_at=? WHERE id=?").run(q.body.status,now(),q.params.id);s.json({ok:true})});

const server=http.createServer(app),wss=new WebSocketServer({server,path:"/signal"}),peers=new Map();
wss.on("connection",ws=>{let pid=null;ws.on("message",raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(m.type==="hello"){pid=String(m.peerId||id());peers.set(pid,ws);ws.send(JSON.stringify({type:"peers",peers:[...peers.keys()].filter(x=>x!==pid)}));return}if(m.to&&peers.has(m.to))peers.get(m.to).send(JSON.stringify({...m,from:pid}))});ws.on("close",()=>pid&&peers.delete(pid))});
server.listen(PORT,()=>console.log(`EmergencyLink: http://localhost:${PORT}`));
