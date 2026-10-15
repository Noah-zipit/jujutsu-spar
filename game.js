'use strict';
/* JUJUTSU SPAR — stick sorcerer 1v1. Engine bones after the classic canvas
   fighter pattern (fighter state machine, frame-based hitboxes, rounds),
   fighters drawn procedurally — no sprite sheets. */
const CVS = document.getElementById('game');
const CTX = CVS.getContext('2d');
const W = 960, H = 540, GROUND = 466;

const CHARS = [
  { name:'VOID', title:'THE LIMITLESS', body:'#eef4ff', dark:'#0c1526', accent:'#22c9f0', glow:'rgba(34,201,240,',
    speed:5.4, power:1.0, techName:'Cursed Technique: Infinity Palm', domainName:'DOMAIN: BOUNDLESS VOID',
    techDesc:'A crushing palm of compressed space fired as a wave.',
    palette:{sky1:'#2b0a52', sky2:'#0a1c5e', ground:'#160b33', accent:'#7dd7ff'} },
  { name:'SHRINE', title:'THE DISMANTLER', body:'#1c0d12', dark:'#000000', accent:'#ff2e4d', glow:'rgba(255,46,77,',
    speed:5.0, power:1.08, techName:'Cursed Technique: Dismantle', domainName:'DOMAIN: CRIMSON SHRINE',
    techDesc:'Three invisible slashes that arrive before they are seen.',
    palette:{sky1:'#40060f', sky2:'#12030a', ground:'#1c040a', accent:'#ff5d7a'} },
  { name:'UMBRA', title:'THE SHADOW CALLER', body:'#0e1a1e', dark:'#000000', accent:'#2ee6a8', glow:'rgba(46,230,168,',
    speed:5.2, power:1.02, techName:'Cursed Technique: Shadow Hound', domainName:'DOMAIN: GARDEN OF SHADOWS',
    techDesc:'A hound of living shadow that runs down its prey.',
    palette:{sky1:'#06302a', sky2:'#04141f', ground:'#071a16', accent:'#5ff2c0'} },
  { name:'BRUTE', title:'THE DIVERGENT FIST', body:'#e8b06a', dark:'#33190a', accent:'#ff8a2a', glow:'rgba(255,138,42,',
    speed:4.7, power:1.18, techName:'Cursed Technique: Divergent Slam', domainName:'DOMAIN: IMPACT CRUCIBLE',
    techDesc:'One punch, two impacts. The second arrives late — and heavier.',
    palette:{sky1:'#4a1503', sky2:'#170802', ground:'#241005', accent:'#ffb35c'} },
];

/* ---------------- audio (tiny synth, no assets) ---------------- */
let AC = null;
function audio(){ if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(AC && AC.state==='suspended') AC.resume(); }
function tone(f, d, type, g, slide){ if(!AC) return; const o=AC.createOscillator(), gn=AC.createGain(); o.type=type||'square'; o.frequency.value=f; if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide), AC.currentTime+d); gn.gain.value=g||0.05; gn.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime+d); o.connect(gn); gn.connect(AC.destination); o.start(); o.stop(AC.currentTime+d); }
function noiseBurst(d, g){ if(!AC) return; const len=AC.sampleRate*d, buf=AC.createBuffer(1,len,AC.sampleRate), ch=buf.getChannelData(0); for(let i=0;i<len;i++) ch[i]=(Math.random()*2-1)*(1-i/len); const s=AC.createBufferSource(); s.buffer=buf; const gn=AC.createGain(); gn.gain.value=g; const fl=AC.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=1800; s.connect(fl); fl.connect(gn); gn.connect(AC.destination); s.start(); }
const SFX = {
  light(){ noiseBurst(0.06, 0.12); }, heavy(){ noiseBurst(0.12, 0.2); tone(90,0.12,'sawtooth',0.08,-40); },
  block(){ tone(300,0.05,'square',0.05); }, whiff(){ noiseBurst(0.05,0.03); },
  cast(){ tone(220,0.25,'sine',0.07,440); }, flash(){ tone(1200,0.3,'sawtooth',0.06,-900); noiseBurst(0.2,0.16); },
  domain(){ tone(55,0.9,'sine',0.22,-15); tone(110,0.7,'triangle',0.12,60); noiseBurst(0.5,0.1); },
  ko(){ tone(160,0.5,'sawtooth',0.12,-120); }, round(){ tone(520,0.12,'square',0.07); setTimeout(()=>tone(780,0.16,'square',0.07),110); }
};

/* ---------------- input ---------------- */
const keys = {};
const GAMEKEYS = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyA','KeyD','KeyW','KeyS','KeyJ','KeyK','KeyL','KeyU','Digit0','Digit1','Digit2','Digit3','Digit4'];
addEventListener('keydown', e=>{ if(GAMEKEYS.includes(e.code)) e.preventDefault(); keys[e.code]=true; audio(); onKeyMenu(e.code); });
addEventListener('keyup', e=>{ keys[e.code]=false; });
function p1Keys(){ return { left:!!keys.KeyA, right:!!keys.KeyD, jump:!!keys.KeyW, block:!!keys.KeyS, light:!!keys.KeyJ, heavy:!!keys.KeyK, tech:!!keys.KeyL, domain:!!keys.KeyU }; }
function p2Keys(){ return { left:!!keys.ArrowLeft, right:!!keys.ArrowRight, jump:!!keys.ArrowUp, block:!!keys.ArrowDown, light:!!keys.Digit1, heavy:!!keys.Digit2, tech:!!keys.Digit3, domain:!!keys.Digit0 }; }
const touchIn = { left:false, right:false, jump:false, block:false, light:false, heavy:false, tech:false, domain:false };
document.querySelectorAll('.tbtn').forEach(b=>{
  const k = b.dataset.k;
  const on = e=>{ e.preventDefault(); audio(); touchIn[k]=true; };
  const off = e=>{ e.preventDefault(); touchIn[k]=false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
function p1Merged(){ const k = p1Keys(); for(const n in touchIn) if(touchIn[n]) k[n]=true; return k; }

/* ---------------- game state ---------------- */
let phase = 'title';
let mode = 'cpu';
let p1 = null, p2 = null, domain = null;
let projectiles = [], particles = [], bolts = [], popups = [], scheduled = [];
let hitstop = 0, shake = 0, timeScale = 1, slowT = 0, frame = 0;
let roundNum = 1, wins = [0,0], timer = 99*60, introT = 0, endT = 0, domainCutT = 0, domainCutName = '';
let ambient = [];
for(let i=0;i<40;i++) ambient.push({x:Math.random()*W, y:Math.random()*H, s:Math.random()*2+0.6, v:Math.random()*0.4+0.15, ph:Math.random()*6.28});

function makeFighter(ci, side, cpu){
  const c = CHARS[ci];
  return { ci, c, side, cpu, x: side===0? 250:710, y:GROUND, vx:0, vy:0, facing: side===0?1:-1,
    hp:1000, ce:0, state:'idle', stateT:0, atkType:null, atkHitDone:false, combo:0, comboT:0,
    runPh:0, idlePh:Math.random()*6.28, blocking:false, onGround:true, aiT:0, aiIn:null, aiHold:0,
    input:{}, prevIn:{}, castDone:false, dead:false };
}
function resetRound(keepWins){
  const a = p1.ci, b = p2.ci, ca = p1.cpu, cb = p2.cpu;
  p1 = makeFighter(a, 0, ca); p2 = makeFighter(b, 1, cb);
  projectiles = []; particles = []; bolts = []; popups = []; scheduled = []; domain = null;
  hitstop = 0; shake = 0; timer = 99*60; phase = 'intro'; introT = 0; timeScale = 1; slowT = 0; domainCutT = 0;
  if(!keepWins){ wins = [0,0]; roundNum = 1; }
}

/* ---------------- combat ---------------- */
const ATK = {
  light:{ su:6, ac:4, rc:10, dmg:34, range:88, kb:3.2, stun:10 },
  heavy:{ su:13, ac:5, rc:21, dmg:68, range:96, kb:7, stun:16 },
};
function edge(f, name){ const now = !!(f.input && f.input[name]); const was = !!(f.prevIn && f.prevIn[name]); return now && !was; }
function spawnParticles(x, y, n, color, spd, size, grav){
  for(let i=0;i<n;i++){ const a=Math.random()*6.28, s=(Math.random()*0.7+0.3)*(spd||3);
    particles.push({x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s-0.5, life:22+Math.random()*16, max:38, color, size:(size||3)*(Math.random()*0.7+0.6), grav:grav||0.06}); }
}
function popup(x, y, text, color, size){ popups.push({x, y, text, color, size:size||22, t:0}); }
function lightning(x, y){
  for(let b=0;b<3;b++){ const pts=[[x,y]]; let cx=x, cy=y;
    for(let i=0;i<6;i++){ cx += (Math.random()*70-35); cy += (Math.random()*50-14); pts.push([cx,cy]); }
    bolts.push({pts, life:9, color: b===1? '#111':'#ff2233'}); }
}
function applyHit(att, def, dmg, kb, opts){
  opts = opts || {};
  dmg = Math.round(dmg * att.c.power * (domain && domain.owner===att ? 1.3 : 1));
  const blocked = def.blocking && def.onGround && !opts.unblockable && def.state!=='hit';
  if(blocked){
    dmg = Math.max(1, Math.round(dmg*0.1));
    def.hp -= dmg; def.state='blockstun'; def.stateT=6; def.vx = kb*0.35*att.facing;
    spawnParticles(def.x - def.facing*20, def.y-78, 6, '#cfe8ff', 2.4, 2.4, 0.02); SFX.block();
  } else {
    def.hp -= dmg; def.state='hit'; def.stateT = opts.stun || 12; def.vx = kb*att.facing; def.atkType=null;
    spawnParticles(def.x, def.y-80, opts.crit? 22:10, opts.crit? '#ff3348' : att.c.accent, opts.crit?5:3.2, 3, 0.07);
    if(opts.crit){ lightning(def.x, def.y-80); popup(def.x, def.y-160, 'BLACK FLASH!', '#ff2233', 30); hitstop = Math.max(hitstop, 9); shake = Math.max(shake, 9); SFX.flash(); }
    else { hitstop = Math.max(hitstop, dmg>60?5:3); shake = Math.max(shake, dmg>60?5:2.4); }
    if(opts.heavy) SFX.heavy(); else SFX.light();
    att.combo++; att.comboT = 55;
    if(att.combo>=2) popup(def.x, def.y-138, att.combo+' HITS', '#ffd94d', 19);
  }
  att.ce = Math.min(100, att.ce + dmg*0.09);
  def.ce = Math.min(100, def.ce + dmg*0.13);
  if(def.hp <= 0){ def.hp = 0; def.dead = true; def.state='ko'; def.stateT=0; def.vy = -5.5; def.vx = kb*1.6*att.facing; SFX.ko(); slowT = 55; timeScale = 0.32; }
}
function startAttack(f, type){ f.state='attack'; f.stateT=0; f.atkType=type; f.atkHitDone=false; SFX.whiff(); }
function castTechnique(f, foe){ f.state='casting'; f.stateT=0; f.castDone=false; f.ce -= 35; SFX.cast(); }
function fireTechnique(f, foe){
  const c = f.c, dir = f.facing, x = f.x + dir*44, gy = GROUND;
  if(c.name==='VOID'){ projectiles.push({owner:f, x, y:gy-84, vx:dir*9.5, dmg:88, r:20, type:'orb', color:c.accent, glow:c.glow, life:90}); spawnParticles(x, gy-84, 10, c.accent, 2.6, 3, 0); }
  else if(c.name==='SHRINE'){ for(let i=0;i<3;i++) scheduled.push({t:i*9, fn:()=>{ projectiles.push({owner:f, x:f.x + f.facing*40, y:gy-88+((i%2)*22-8), vx:f.facing*13.5, dmg:31, r:13, type:'slash', color:c.accent, glow:c.glow, life:70}); }}); }
  else if(c.name==='UMBRA'){ projectiles.push({owner:f, x, y:gy-16, vx:dir*7.6, dmg:76, r:22, type:'wolf', color:c.accent, glow:c.glow, life:130}); }
  else if(c.name==='BRUTE'){ f.state='dashStrike'; f.stateT=0; f.vx = dir*15.5; f.atkHitDone=false; }
}
function startDomain(f, foe){
  f.ce = 0; f.state='domainCast'; f.stateT=0; domainCutT = 52; domainCutName = f.c.domainName; SFX.domain();
  scheduled.push({t:26, fn:()=>{
    domain = { owner:f, t: 9*60 };
    shake = 10; spawnParticles(foe.x, foe.y-80, 26, f.c.accent, 5, 3.4, 0.03);
    const gy = GROUND;
    if(f.c.name==='VOID'){ for(let i=0;i<5;i++) scheduled.push({t:i*8, fn:()=>{ projectiles.push({owner:f, x:foe.x+(Math.random()*90-45), y:60, vx:0, vy:8.5, dmg:26, r:15, type:'orb', color:f.c.accent, glow:f.c.glow, life:80, unblockable:true}); }}); }
    else if(f.c.name==='SHRINE'){ for(let i=0;i<6;i++) scheduled.push({t:i*7, fn:()=>{ const s = i%2? 1:-1; projectiles.push({owner:f, x:foe.x - s*330, y:gy-96+(i%3)*16, vx:s*12.5, dmg:21, r:13, type:'slash', color:f.c.accent, glow:f.c.glow, life:60, unblockable:true}); }}); }
    else if(f.c.name==='UMBRA'){ for(let i=0;i<3;i++) scheduled.push({t:i*16, fn:()=>{ projectiles.push({owner:f, x:f.x + f.facing*30, y:gy-16, vx:f.facing*8.4, dmg:38, r:22, type:'wolf', color:f.c.accent, glow:f.c.glow, life:130, unblockable:true}); }}); }
    else if(f.c.name==='BRUTE'){ scheduled.push({t:4, fn:()=>{ projectiles.push({owner:f, x:foe.x, y:40, vx:0, vy:11, dmg:125, r:30, type:'meteor', color:f.c.accent, glow:f.c.glow, life:70, unblockable:true}); }}); }
  }});
}
function updateScheduled(){ for(let i=scheduled.length-1;i>=0;i--){ scheduled[i].t--; if(scheduled[i].t<=0){ const fn=scheduled[i].fn; scheduled.splice(i,1); fn(); } } }

/* ---------------- AI ---------------- */
function aiInput(f, foe){
  if(!f.aiIn) f.aiIn = {left:false,right:false,jump:false,block:false,light:false,heavy:false,tech:false,domain:false};
  const inp = f.aiIn;
  if(f.aiHold>0){ f.aiHold--; return inp; }
  for(const k in inp) inp[k]=false;
  f.aiT--;
  const dist = Math.abs(foe.x - f.x), toward = foe.x > f.x ? 'right':'left', away = foe.x > f.x ? 'left':'right';
  if(foe.state==='attack' && dist<150 && Math.random()<0.4){ inp.block = true; f.aiHold = 12; return inp; }
  if(f.ce>=100 && Math.random()<0.5){ inp.domain = true; f.aiHold = 6; return inp; }
  if(f.aiT<=0){
    f.aiT = 9 + Math.floor(Math.random()*8);
    const r = Math.random();
    if(dist > 200){ inp[toward]=true; if(r<0.16) inp.jump=true; if(r<0.3 && f.ce>=35) inp.tech=true; f.aiHold = 8; }
    else if(dist > 95){ inp[toward]=true; if(r<0.3) inp.jump=true; if(r>=0.3 && r<0.48 && f.ce>=35) inp.tech=true; f.aiHold = 6; }
    else { if(r<0.42) inp.light=true; else if(r<0.62) inp.heavy=true; else if(r<0.74) inp.block=true; else if(r<0.86) inp[away]=true; else if(f.ce>=35) inp.tech=true; f.aiHold = 5; }
  }
  return inp;
}

/* ---------------- fighter update ---------------- */
function updateFighter(f, foe){
  f.stateT++;
  if(f.comboT>0){ f.comboT--; if(f.comboT===0) f.combo=0; }
  if(domain && domain.owner===f) f.ce = Math.min(100, f.ce + 0.14);
  f.blocking = false;
  const busy = ['attack','hit','blockstun','casting','domainCast','ko','dashStrike'].includes(f.state);
  if(!busy && phase==='fight' && domainCutT<=0){
    if(f.input.left){ f.vx = -f.c.speed * (domain&&domain.owner===f?1.1:1); f.runPh += 0.32; }
    else if(f.input.right){ f.vx = f.c.speed * (domain&&domain.owner===f?1.1:1); f.runPh += 0.32; }
    else f.vx *= 0.6;
    if(f.input.block && f.onGround){ f.blocking = true; f.vx = 0; }
    if(edge(f,'jump') && f.onGround){ f.vy = -13.4; f.onGround=false; }
    if(edge(f,'light')) startAttack(f,'light');
    else if(edge(f,'heavy')) startAttack(f,'heavy');
    else if(edge(f,'tech') && f.ce>=35) castTechnique(f, foe);
    else if(edge(f,'domain') && f.ce>=100) startDomain(f, foe);
  } else if(!busy){ f.vx *= 0.6; }
  if(busy){
    if(f.state==='attack'){
      const a = ATK[f.atkType];
      if(f.stateT>=a.su && f.stateT<=a.su+a.ac && !f.atkHitDone){
        const hx = f.x + f.facing*(a.range*0.62), hw = a.range*0.62;
        if(Math.abs(foe.x-hx) < hw+24 && Math.abs(foe.y-f.y) < 96 && !foe.dead){
          let dmg = a.dmg, crit=false;
          if(f.atkType==='heavy' && Math.random()<0.14){ crit=true; dmg*=2; }
          f.atkHitDone = true;
          applyHit(f, foe, dmg, a.kb, {stun:a.stun, crit, heavy:f.atkType==='heavy'});
        }
      }
      if(f.stateT>=a.su+a.ac+a.rc){ f.state='idle'; f.stateT=0; }
      f.vx *= 0.8;
    }
    else if(f.state==='casting'){ f.vx*=0.5; if(f.stateT===13 && !f.castDone){ f.castDone=true; fireTechnique(f, foe); } if(f.stateT>=26){ f.state='idle'; f.stateT=0; } }
    else if(f.state==='dashStrike'){
      if(!f.atkHitDone && Math.abs(foe.x-f.x)<64 && !foe.dead){ f.atkHitDone=true; applyHit(f, foe, 56, 5, {stun:13, heavy:true});
        const tgt = foe; scheduled.push({t:21, fn:()=>{ if(!tgt.dead){ applyHit(f, tgt, 66, 8, {stun:15, heavy:true}); popup(tgt.x, tgt.y-170, 'SECOND IMPACT', '#ffb35c', 18); } }});
      }
      if(f.stateT>=13){ f.state='idle'; f.stateT=0; f.vx*=0.4; }
    }
    else if(f.state==='hit' || f.state==='blockstun'){ if(f.stateT>=(f.state==='hit'?13:6) && !f.dead){ f.state='idle'; f.stateT=0; } }
    else if(f.state==='domainCast'){ f.vx*=0.4; if(f.stateT>=54){ f.state='idle'; f.stateT=0; } }
    else if(f.state==='ko'){ f.vx *= 0.94; }
  }
  f.vy += 0.72; f.x += f.vx; f.y += f.vy;
  if(f.y >= GROUND){ f.y = GROUND; f.vy = 0; f.onGround = true; } else f.onGround = false;
  f.x = Math.max(46, Math.min(W-46, f.x));
  if(!f.dead && phase==='fight'){ f.facing = foe.x >= f.x ? 1 : -1; }
  f.idlePh += 0.06;
  f.prevIn = Object.assign({}, f.input);
}
function updateProjectiles(){
  for(let i=projectiles.length-1;i>=0;i--){ const pr = projectiles[i];
    pr.x += pr.vx||0; pr.y += pr.vy||0; pr.life--;
    const foe = pr.owner===p1? p2:p1;
    let dead = pr.life<=0 || pr.x<-60 || pr.x>W+60 || pr.y>H+40;
    if(!dead && !foe.dead){
      const dx = Math.abs(foe.x-pr.x), dy = Math.abs((foe.y-62)-pr.y);
      const hit = pr.type==='wolf' ? (dx<44 && foe.y===GROUND) : (dx < pr.r+22 && dy < pr.r+52);
      if(hit){ applyHit(pr.owner, foe, pr.dmg, pr.type==='meteor'?9:3.4, {stun:13, heavy:pr.dmg>70, unblockable:!!pr.unblockable}); if(pr.type==='meteor'){ shake=12; spawnParticles(pr.x, GROUND-8, 30, pr.color, 5.4, 3.6, 0.12); } dead = true; }
    }
    if(dead) projectiles.splice(i,1);
  }
}

/* ---------------- drawing ---------------- */
function drawTorii(x, y, s, color, alpha){
  CTX.save(); CTX.globalAlpha = alpha; CTX.fillStyle = color;
  CTX.fillRect(x-52*s, y, 110*s, 9*s); CTX.fillRect(x-38*s, y+13*s, 84*s, 7*s);
  CTX.fillRect(x-42*s, y, 9*s, 66*s); CTX.fillRect(x+33*s, y, 9*s, 66*s); CTX.fillRect(x-3*s, y+9*s, 6*s, 30*s);
  CTX.restore();
}
function drawBG(){
  let pal, domainMode = !!domain;
  if(domain){ const o = domain.owner.c; pal = o.palette; }
  else pal = { sky1:'#1c0f3d', sky2:'#070818', ground:'#0d0a20', accent:'#8be9ff' };
  const g = CTX.createLinearGradient(0,0,0,H); g.addColorStop(0, pal.sky1); g.addColorStop(0.72, pal.sky2); g.addColorStop(0.721, pal.ground); g.addColorStop(1, '#05030c');
  CTX.fillStyle = g; CTX.fillRect(0,0,W,H);
  // moon / core
  CTX.save();
  const mx = domain && domain.owner.c.name==='UMBRA' ? 700 : 480, my = 108;
  const mg = CTX.createRadialGradient(mx,my,8, mx,my,120); mg.addColorStop(0,'rgba(255,255,255,0.9)'); mg.addColorStop(0.25, pal.accent+'55'); mg.addColorStop(1,'rgba(0,0,0,0)');
  CTX.fillStyle = mg; CTX.beginPath(); CTX.arc(mx,my,120,0,6.29); CTX.fill();
  CTX.fillStyle = 'rgba(245,248,255,0.92)'; CTX.beginPath(); CTX.arc(mx,my,34,0,6.29); CTX.fill();
  CTX.restore();
  if(domain && domain.owner.c.name==='VOID'){ for(let i=0;i<26;i++){ const sx=(i*173)%W, sy=(i*97)%300; CTX.fillStyle='rgba(255,255,255,'+(0.25+((i*7)%10)/14)+')'; CTX.fillRect(sx, sy, 2.4, 2.4); } }
  // torii silhouettes
  drawTorii(150, 300, 1.15, '#0a0618', 0.85); drawTorii(810, 288, 1.35, '#0a0618', 0.9);
  drawTorii(480, 318, 0.8, '#0a0618', 0.6);
  if(domain && domain.owner.c.name==='SHRINE') drawTorii(480, 210, 2.5, '#0d0207', 0.95);
  if(domain && domain.owner.c.name==='UMBRA'){ // beast silhouettes
    CTX.fillStyle='rgba(2,10,8,0.8)';
    [[120,428],[760,436],[300,442]].forEach(([x,y],i)=>{ const s=i===1?1.25:0.95; CTX.beginPath(); CTX.ellipse(x,y,34*s,13*s,0,0,6.29); CTX.fill(); CTX.beginPath(); CTX.arc(x+34*s,y-8*s,11*s,0,6.29); CTX.fill(); CTX.beginPath(); CTX.moveTo(x+26*s,y-16*s); CTX.lineTo(x+30*s,y-26*s); CTX.lineTo(x+36*s,y-17*s); CTX.fill(); CTX.fillRect(x-40*s,y-4*s,16*s,5*s); });
  }
  if(domain && domain.owner.c.name==='BRUTE'){ CTX.strokeStyle='rgba(255,150,60,0.5)'; CTX.lineWidth=2; for(let i=0;i<7;i++){ CTX.beginPath(); const x0=(i*149)%W; CTX.moveTo(x0, GROUND+14); CTX.lineTo(x0+36, GROUND+40+((i*23)%30)); CTX.lineTo(x0+18, GROUND+66); CTX.stroke(); } }
  // ground
  CTX.fillStyle = 'rgba(0,0,0,0.35)'; CTX.fillRect(0, GROUND+2, W, 3);
  CTX.fillStyle = pal.accent+'2e'; CTX.fillRect(0, GROUND+5, W, 2);
  // ambient drift
  for(const a of ambient){ a.y -= a.v; a.x += Math.sin(frame*0.01+a.ph)*0.2; if(a.y<-4){ a.y=H+4; a.x=Math.random()*W; }
    CTX.fillStyle = domain? domain.owner.c.glow+'0.5)' : 'rgba(160,140,255,0.35)'; CTX.beginPath(); CTX.arc(a.x, a.y, a.s, 0, 6.29); CTX.fill(); }
}
function limb(x1,y1,x2,y2,x3,y3,w,color){ CTX.strokeStyle=color; CTX.lineWidth=w; CTX.beginPath(); CTX.moveTo(x1,y1); CTX.lineTo(x2,y2); CTX.lineTo(x3,y3); CTX.stroke(); }
function drawFighterTo(c, f, scale){
  const t = f.idlePh, bob = f.state==='idle' ? Math.sin(t*2.2)*2.2 : 0;
  c.save(); c.translate(f.x, f.y); c.scale(f.facing*(scale||1), scale||1);
  c.lineCap='round'; c.lineJoin='round';
  const col = f.c.body, acc = f.c.accent;
  if(f.state==='ko'){ // lying flat
    c.translate(0,-6); c.rotate(0);
    limb(-44,0, -16,-4, 6,-4, 7, col); // legs along ground
    limb(6,-4, 30,-6, 52,-4, 7, col);
    c.strokeStyle=col; c.lineWidth=7.5; c.beginPath(); c.moveTo(-38,-5); c.lineTo(-4,-6); c.stroke(); // torso
    limb(-34,-6, -48,-14, -58,-8, 6.5, col); // arm limp
    c.fillStyle=col; c.beginPath(); c.arc(-48,-8,12,0,6.29); c.fill(); // head
    c.restore(); return;
  }
  let lean = 0, crouch = 0;
  if(!f.onGround) crouch = -2;
  else if(f.state==='hit') lean = -11;
  else if(f.blocking) { lean = 3; crouch = 3; }
  else if(f.state==='casting') lean = 4;
  else if(f.state==='attack'){ const a=ATK[f.atkType]; const p=f.stateT/(a.su+a.ac+a.rc); lean = p<0.4? -4 : 9; }
  else if(Math.abs(f.vx)>0.6 && f.onGround) lean = 9;
  const hipY = -52+bob+crouch, chX = lean, chY = -94+bob+crouch, hdX = lean*1.35, hdY = -113+bob+crouch;
  // shadow
  c.save(); c.globalAlpha=0.3; c.fillStyle='#000'; c.beginPath(); c.ellipse(0, 4, 30, 6, 0, 0, 6.29); c.fill(); c.restore();
  // aura
  if(f.ce>=100 || (domain && domain.owner===f)){ c.save(); c.globalAlpha = 0.35+Math.sin(frame*0.3)*0.12; c.strokeStyle=acc; c.lineWidth=3; c.beginPath(); c.ellipse(0, 2, 40+Math.sin(frame*0.24)*4, 10, 0, 0, 6.29); c.stroke(); c.restore(); }
  // legs
  let fFx=16, fFy=0, bFx=-14, bFy=0;
  if(!f.onGround){ fFx=10; fFy=-16; bFx=-10; bFy=-24; }
  else if(Math.abs(f.vx)>0.6){ const s=Math.sin(f.runPh); fFx=s*24; fFy=-Math.abs(Math.cos(f.runPh))*9; bFx=-s*24; bFy=-Math.abs(Math.sin(f.runPh))*9; }
  if(f.state==='attack' && f.atkType==='heavy'){ const a=ATK.heavy; if(f.stateT>=a.su && f.stateT<=a.su+a.ac+3){ fFx=62; fFy=-64; } }
  // cloak for SHRINE
  if(f.c.name==='SHRINE'){ c.fillStyle='rgba(10,4,8,0.9)'; c.beginPath(); c.moveTo(chX-4,chY+2); c.lineTo(-26,hipY+16); c.lineTo(-14,hipY+34); c.lineTo(-4,hipY+18); c.lineTo(2,hipY+36); c.lineTo(10,hipY+14); c.lineTo(chX+8,chY+2); c.closePath(); c.fill(); }
  limb(0,hipY, (fFx)/2+2, hipY+26-Math.max(0,-fFy)*0.3, fFx, fFy, 7, col);
  limb(0,hipY, (bFx)/2-2, hipY+26-Math.max(0,-bFy)*0.3, bFx, bFy, 7, col);
  // torso
  c.strokeStyle=col; c.lineWidth=7.5; c.beginPath(); c.moveTo(0,hipY); c.lineTo(chX,chY); c.stroke();
  // arms by pose
  let fh=[20,-100+bob], bh=[4,-92+bob]; // guard hands
  const a = f.atkType? ATK[f.atkType] : null;
  if(f.state==='attack' && a){
    if(f.atkType==='light'){ if(f.stateT>=a.su && f.stateT<=a.su+a.ac+2) fh=[64,-100+bob]; else if(f.stateT<a.su) fh=[-2,-98+bob]; }
    else { bh=[16,-88+bob]; }
  }
  else if(f.blocking){ fh=[24,-100+bob]; bh=[24,-86+bob]; }
  else if(f.state==='casting'){ fh=[38,-96+bob]; bh=[30,-86+bob]; }
  else if(f.state==='domainCast'){ fh=[26,-136+bob]; bh=[-22,-134+bob]; }
  else if(f.state==='hit'){ fh=[-14,-124+bob]; bh=[-24,-96+bob]; }
  else if(f.state==='dashStrike'){ fh=[52,-96+bob]; bh=[-16,-84+bob]; }
  const armW = f.c.name==='BRUTE'? 8.5 : 6.5;
  limb(chX,chY, (bh[0]+chX)/2-4, (bh[1]+chY)/2+12, bh[0], bh[1], armW, col);
  limb(chX,chY, (fh[0]+chX)/2+4, (fh[1]+chY)/2+12, fh[0], fh[1], armW, col);
  // casting orb
  if(f.state==='casting'){ c.save(); c.shadowColor=acc; c.shadowBlur=18; c.fillStyle=acc; c.beginPath(); c.arc(44,-92+bob, 5+f.stateT*0.55, 0, 6.29); c.fill(); c.restore(); }
  // attack smears
  if(f.state==='attack' && a && f.stateT>=a.su && f.stateT<=a.su+a.ac+1){
    c.save(); c.globalAlpha=0.55; c.strokeStyle=acc; c.lineWidth=5;
    if(f.atkType==='light'){ c.beginPath(); c.arc(30,-100+bob, 36, -0.7, 0.7); c.stroke(); }
    else { c.beginPath(); c.arc(10,-60, 62, -1.2, 0.2); c.stroke(); }
    c.restore();
  }
  // head
  c.fillStyle=col; c.beginPath(); c.arc(hdX, hdY, 12.5, 0, 6.29); c.fill();
  c.strokeStyle=acc; c.lineWidth=2; c.globalAlpha=0.85; c.beginPath(); c.arc(hdX,hdY,12.5,0,6.29); c.stroke(); c.globalAlpha=1;
  // accessories
  if(f.c.name==='VOID'){ c.fillStyle=f.c.dark; c.fillRect(hdX-12, hdY-5, 24, 7);
    c.strokeStyle=acc; c.lineWidth=4; c.beginPath(); c.moveTo(hdX-8,hdY+8); c.quadraticCurveTo(-16+Math.sin(t*3)*3, hdY+30, -26+Math.sin(t*3+1)*4, hdY+20); c.stroke(); }
  else if(f.c.name==='SHRINE'){ c.fillStyle='#0a0408'; c.beginPath(); c.arc(hdX, hdY-1, 13.5, Math.PI*0.95, Math.PI*2.05); c.lineTo(hdX+10, hdY+4); c.lineTo(hdX-10, hdY+4); c.closePath(); c.fill();
    c.fillStyle='#ff2e4d'; c.beginPath(); c.arc(hdX+4, hdY, 2.2, 0, 6.29); c.fill(); }
  else if(f.c.name==='UMBRA'){ c.fillStyle='#08130f'; c.beginPath(); c.arc(hdX, hdY-1, 13.5, Math.PI*0.9, Math.PI*2.1); c.lineTo(hdX+10, hdY+4); c.lineTo(hdX-10, hdY+4); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(hdX-10,hdY-9); c.lineTo(hdX-7,hdY-19); c.lineTo(hdX-3,hdY-10); c.fill(); c.beginPath(); c.moveTo(hdX+3,hdY-10); c.lineTo(hdX+7,hdY-19); c.lineTo(hdX+10,hdY-9); c.fill();
    c.fillStyle='#2ee6a8'; c.beginPath(); c.arc(hdX+4, hdY, 2.2, 0, 6.29); c.fill(); }
  else if(f.c.name==='BRUTE'){ c.fillStyle='#c22e2e'; c.fillRect(hdX-12, hdY-8, 24, 6);
    c.strokeStyle='#c22e2e'; c.lineWidth=3.4; c.beginPath(); c.moveTo(hdX-10,hdY-4); c.quadraticCurveTo(-14, hdY+12, -20+Math.sin(t*3.4)*3, hdY+22); c.stroke(); c.beginPath(); c.moveTo(hdX-12,hdY-3); c.quadraticCurveTo(-18, hdY+10, -26+Math.sin(t*3.4+2)*3, hdY+16); c.stroke(); }
  // block shield
  if(f.state==='blockstun'){ c.save(); c.globalAlpha=0.6; c.strokeStyle='#bfe6ff'; c.lineWidth=3.4; c.beginPath(); c.arc(30,-84, 38, -1.2, 1.2); c.stroke(); c.restore(); }
  c.restore();
}
function drawProjectile(pr){
  CTX.save(); CTX.translate(pr.x, pr.y); CTX.shadowColor = pr.color; CTX.shadowBlur = 16;
  if(pr.type==='orb'){ CTX.fillStyle=pr.color; CTX.beginPath(); CTX.arc(0,0,pr.r*0.62,0,6.29); CTX.fill(); CTX.fillStyle='rgba(255,255,255,0.85)'; CTX.beginPath(); CTX.arc(0,0,pr.r*0.26,0,6.29); CTX.fill(); }
  else if(pr.type==='slash'){ CTX.scale(pr.vx>0?1:-1, 1); CTX.strokeStyle=pr.color; CTX.lineWidth=4; for(let i=0;i<3;i++){ CTX.globalAlpha=0.85-i*0.25; CTX.beginPath(); CTX.moveTo(-16+i*7, -12+i*9); CTX.lineTo(16-i*5, 12-i*6); CTX.stroke(); } }
  else if(pr.type==='wolf'){ const d = pr.vx>0?1:-1; CTX.scale(d,1); CTX.fillStyle='#0a1512'; CTX.beginPath(); CTX.ellipse(0,0,30,12,0,0,6.29); CTX.fill(); CTX.beginPath(); CTX.arc(30,-7,10.5,0,6.29); CTX.fill();
    CTX.beginPath(); CTX.moveTo(22,-14); CTX.lineTo(26,-23); CTX.lineTo(31,-14); CTX.fill(); CTX.beginPath(); CTX.moveTo(31,-14); CTX.lineTo(35,-23); CTX.lineTo(39,-13); CTX.fill();
    CTX.fillStyle=pr.color; CTX.beginPath(); CTX.arc(33,-8,2.4,0,6.29); CTX.fill();
    CTX.strokeStyle='#0a1512'; CTX.lineWidth=5; const lp = Math.sin(frame*0.6)*8; CTX.beginPath(); CTX.moveTo(14,8); CTX.lineTo(14+lp,20); CTX.moveTo(-14,8); CTX.lineTo(-14-lp,20); CTX.stroke();
    CTX.strokeStyle=pr.color; CTX.lineWidth=3; CTX.beginPath(); CTX.moveTo(-28,-2); CTX.quadraticCurveTo(-42,-8,-48,-2+Math.sin(frame*0.4)*4); CTX.stroke(); }
  else if(pr.type==='meteor'){ CTX.fillStyle=pr.color; CTX.beginPath(); CTX.arc(0,0,pr.r*0.7,0,6.29); CTX.fill(); CTX.fillStyle='rgba(255,240,210,0.9)'; CTX.beginPath(); CTX.arc(0,0,pr.r*0.34,0,6.29); CTX.fill();
    CTX.globalAlpha=0.5; CTX.fillStyle=pr.color; CTX.beginPath(); CTX.moveTo(-8,-pr.r); CTX.lineTo(0,-pr.r-44); CTX.lineTo(8,-pr.r); CTX.fill(); }
  CTX.restore();
}
function bar(x, y, w, h, frac, color, flip){
  CTX.save(); CTX.beginPath();
  if(!flip){ CTX.moveTo(x+10,y); CTX.lineTo(x+w,y); CTX.lineTo(x+w-10,y+h); CTX.lineTo(x,y+h); }
  else { CTX.moveTo(x,y); CTX.lineTo(x+w-10,y); CTX.lineTo(x+w,y+h); CTX.lineTo(x+10,y+h); }
  CTX.closePath(); CTX.fillStyle='rgba(8,4,18,0.82)'; CTX.fill(); CTX.clip();
  const fw = w*Math.max(0,frac);
  CTX.fillStyle = color; if(!flip) CTX.fillRect(x, y, fw, h); else CTX.fillRect(x+w-fw, y, fw, h);
  CTX.fillStyle='rgba(255,255,255,0.22)'; CTX.fillRect(x, y, w, h*0.4);
  CTX.restore();
  CTX.save(); CTX.strokeStyle='rgba(200,220,255,0.5)'; CTX.lineWidth=1.6; CTX.beginPath();
  if(!flip){ CTX.moveTo(x+10,y); CTX.lineTo(x+w,y); CTX.lineTo(x+w-10,y+h); CTX.lineTo(x,y+h); } else { CTX.moveTo(x,y); CTX.lineTo(x+w-10,y); CTX.lineTo(x+w,y+h); CTX.lineTo(x+10,y+h); }
  CTX.closePath(); CTX.stroke(); CTX.restore();
}
function drawHUD(){
  const L = p1, R = p2;
  // portraits + names
  [ [L,26,0], [R,W-26-58,1] ].forEach(([f,px,flip])=>{
    CTX.save(); CTX.fillStyle='rgba(10,6,26,0.9)'; CTX.strokeStyle=f.c.accent; CTX.lineWidth=2;
    CTX.beginPath(); CTX.moveTo(px+8,14); CTX.lineTo(px+50,14); CTX.lineTo(px+58,34); CTX.lineTo(px+50,56); CTX.lineTo(px+8,56); CTX.lineTo(px,34); CTX.closePath(); CTX.fill(); CTX.stroke();
    CTX.fillStyle=f.c.body; CTX.beginPath(); CTX.arc(px+29,32,11,0,6.29); CTX.fill();
    if(f.c.name==='VOID'){ CTX.fillStyle='#0c1526'; CTX.fillRect(px+18,29,22,6); }
    if(f.c.name==='SHRINE'||f.c.name==='UMBRA'){ CTX.fillStyle=f.c.accent; CTX.beginPath(); CTX.arc(px+33,32,2.2,0,6.29); CTX.fill(); }
    if(f.c.name==='BRUTE'){ CTX.fillStyle='#c22e2e'; CTX.fillRect(px+18,25,22,5); }
    CTX.restore();
  });
  CTX.save(); CTX.font='900 italic 25px "Segoe UI",sans-serif'; CTX.fillStyle=L.c.accent; CTX.textAlign='left'; CTX.fillText(L.c.name, 96, 36);
  CTX.fillStyle=R.c.accent; CTX.textAlign='right'; CTX.fillText(R.c.name, W-96, 36);
  CTX.font='700 10.5px "Segoe UI"'; CTX.fillStyle='#aebaff'; CTX.textAlign='left'; CTX.fillText('SORCERER', 97, 52); CTX.textAlign='right'; CTX.fillText('SORCERER', W-97, 52);
  // HP bars
  bar(96, 58, 330, 15, L.hp/1000, L.c.accent, false);
  bar(W-96-330, 58, 330, 15, R.hp/1000, R.c.accent, true);
  CTX.font='800 12px "Segoe UI"'; CTX.fillStyle='#fff'; CTX.textAlign='left'; CTX.fillText(Math.ceil(L.hp/10)+'%', 100, 48+42);
  CTX.textAlign='right'; CTX.fillText(Math.ceil(R.hp/10)+'%', W-100, 48+42);
  // round pips
  for(let i=0;i<2;i++){ CTX.fillStyle = wins[0]>i? L.c.accent : 'rgba(255,255,255,0.18)'; CTX.beginPath(); CTX.arc(108+i*17, 86, 5, 0, 6.29); CTX.fill();
    CTX.fillStyle = wins[1]>i? R.c.accent : 'rgba(255,255,255,0.18)'; CTX.beginPath(); CTX.arc(W-108-i*17, 86, 5, 0, 6.29); CTX.fill(); }
  // timer
  CTX.save(); CTX.fillStyle='rgba(10,6,26,0.92)'; CTX.strokeStyle='rgba(160,190,255,0.6)'; CTX.lineWidth=2;
  CTX.beginPath(); CTX.moveTo(W/2-34,12); CTX.lineTo(W/2+34,12); CTX.lineTo(W/2+44,38); CTX.lineTo(W/2+34,64); CTX.lineTo(W/2-34,64); CTX.lineTo(W/2-44,38); CTX.closePath(); CTX.fill(); CTX.stroke();
  CTX.fillStyle='#cfe9ff'; CTX.font='900 30px "Segoe UI"'; CTX.textAlign='center'; CTX.fillText(String(Math.max(0,Math.ceil(timer/60))), W/2, 50);
  CTX.font='700 9px "Segoe UI"'; CTX.fillStyle='#8fa3d9'; CTX.fillText('TIME', W/2, 23); CTX.restore();
  // CE bars
  bar(26, H-38, 300, 13, L.ce/100, L.c.accent, false);
  bar(W-326, H-38, 300, 13, R.ce/100, R.c.accent, true);
  CTX.font='800 11.5px "Segoe UI"'; CTX.textAlign='left'; CTX.fillStyle=L.ce>=100 && (frame%40<24)? '#ffd94d':'#aee9ff'; CTX.fillText(L.ce>=100? 'CURSED ENERGY — DOMAIN READY (U)' : 'CURSED ENERGY '+Math.floor(L.ce)+'%', 26, H-46);
  CTX.textAlign='right'; CTX.fillStyle=R.ce>=100 && (frame%40<24)? '#ffd94d':'#ffb3c2'; CTX.fillText(R.ce>=100? 'DOMAIN READY (0) — CURSED ENERGY' : Math.floor(R.ce)+'% CURSED ENERGY', W-26, H-46);
  // combo
  [[L,R],[R,L]].forEach(([f,foe],idx)=>{ if(f.combo>=2 && f.comboT>0){ CTX.save(); CTX.font='900 italic 34px "Segoe UI"'; CTX.fillStyle='#ffd94d'; CTX.strokeStyle='rgba(0,0,0,0.6)'; CTX.lineWidth=4;
      const x = idx===0? W-120 : 120, al = idx===0? 'right':'left'; CTX.textAlign=al; CTX.strokeText(f.combo+' HITS', x, 170); CTX.fillText(f.combo+' HITS', x, 170); CTX.restore(); } });
  if(domain){ CTX.save(); CTX.font='800 13px "Segoe UI"'; CTX.fillStyle=domain.owner.c.accent; CTX.textAlign='center'; CTX.fillText(domain.owner.c.domainName+' — '+Math.ceil(domain.t/60)+'s', W/2, 92); CTX.restore(); }
}
function bigText(text, sub, color){
  CTX.save(); CTX.textAlign='center';
  CTX.font='900 italic 74px "Segoe UI"'; CTX.fillStyle=color||'#fff'; CTX.strokeStyle='rgba(0,0,0,0.65)'; CTX.lineWidth=8;
  CTX.strokeText(text, W/2, H/2-30); CTX.fillText(text, W/2, H/2-30);
  if(sub){ CTX.font='800 20px "Segoe UI"'; CTX.fillStyle='#cfe0ff'; CTX.strokeText(sub, W/2, H/2+8); CTX.fillText(sub, W/2, H/2+8); }
  CTX.restore();
}
function render(){
  CTX.save();
  if(shake>0){ CTX.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake); shake*=0.88; if(shake<0.3) shake=0; }
  drawBG();
  if(p1 && p2){
    const order = [p1,p2].sort((a,b)=>a.x-b.x);
    drawFighterTo(CTX, order[0].side===0?p1:p2, 1); drawFighterTo(CTX, order[0].side===0?p2:p1, 1);
  }
  for(const pr of projectiles) drawProjectile(pr);
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=p.grav; p.life--; if(p.life<=0){ particles.splice(i,1); continue; }
    CTX.save(); CTX.globalAlpha=Math.max(0,p.life/p.max); CTX.fillStyle=p.color; CTX.beginPath(); CTX.arc(p.x,p.y,p.size,0,6.29); CTX.fill(); CTX.restore(); }
  for(let i=bolts.length-1;i>=0;i--){ const b=bolts[i]; b.life--; if(b.life<=0){ bolts.splice(i,1); continue; }
    CTX.save(); CTX.strokeStyle=b.color; CTX.lineWidth=b.color==='#111'?5:2.6; CTX.beginPath(); CTX.moveTo(b.pts[0][0], b.pts[0][1]); for(const pt of b.pts) CTX.lineTo(pt[0],pt[1]); CTX.stroke(); CTX.restore(); }
  for(let i=popups.length-1;i>=0;i--){ const p=popups[i]; p.t++; p.y-=0.7; if(p.t>52){ popups.splice(i,1); continue; }
    CTX.save(); CTX.globalAlpha = p.t>40? (52-p.t)/12 : 1; CTX.font='900 italic '+p.size+'px "Segoe UI"'; CTX.textAlign='center'; CTX.fillStyle=p.color; CTX.strokeStyle='rgba(0,0,0,0.6)'; CTX.lineWidth=4; CTX.strokeText(p.text, p.x, p.y); CTX.fillText(p.text, p.x, p.y); CTX.restore(); }
  CTX.restore();
  if(p1 && p2 && phase!=='select' && phase!=='title') drawHUD();
  if(domainCutT>0){ const hgt = Math.min(56, (52-domainCutT)*4, domainCutT*4);
    CTX.fillStyle='#000'; CTX.fillRect(0,0,W,Math.max(0,hgt)); CTX.fillRect(0,H-Math.max(0,hgt),W,Math.max(0,hgt));
    if(domainCutT<44 && domainCutT>8){ CTX.save(); CTX.textAlign='center'; CTX.font='900 italic 40px "Segoe UI"'; const ch = CHARS.find(c=>c.domainName===domainCutName); CTX.fillStyle = ch? ch.accent : '#fff'; CTX.strokeStyle='rgba(0,0,0,0.7)'; CTX.lineWidth=6; CTX.strokeText(domainCutName, W/2, H/2); CTX.fillText(domainCutName, W/2, H/2); CTX.restore(); } }
  if(phase==='intro'){ if(introT<62) bigText('ROUND '+roundNum, 'BEST OF 3', '#fff'); else bigText('FIGHT!', '', '#ffd94d'); }
  if(phase==='roundEnd') bigText('K.O.', '', '#ff2e4d');
}

/* ---------------- flow ---------------- */
function roundWinnerByHp(){ if(p1.hp===p2.hp) return -1; return p1.hp>p2.hp? 0:1; }
function endRound(winnerSide){
  phase='roundEnd'; endT=0;
  if(winnerSide>=0){ wins[winnerSide]++; const w = winnerSide===0? p1:p2, l = winnerSide===0? p2:p1;
    if(!l.dead){ l.dead=true; l.hp=0; l.state='ko'; l.stateT=0; } }
}
function loop(){
  requestAnimationFrame(loop); frame++;
  if(phase==='intro'){ introT++; if(introT===70) SFX.round(); if(introT>105){ phase='fight'; } }
  if(phase==='fight'){
    if(domainCutT>0){ domainCutT--; updateScheduled(); }
    else if(hitstop>0){ hitstop--; }
    else {
      const skip = slowT>0 && frame%2===0; if(slowT>0) slowT--; if(slowT===0) timeScale=1;
      if(!skip){
        p1.input = p1.cpu? aiInput(p1,p2) : p1Merged();
        p2.input = p2.cpu? aiInput(p2,p1) : p2Keys();
        updateFighter(p1,p2); updateFighter(p2,p1);
        updateProjectiles(); updateScheduled();
        if(domain){ domain.t--; if(domain.t<=0) domain=null; }
        timer--; if(timer<=0){ endRound(roundWinnerByHp()); }
        else if(p1.dead || p2.dead){ endRound(p1.dead? 1:0); }
      }
    }
  }
  if(phase==='roundEnd'){ endT++;
    p1.input = {}; p2.input = {}; updateFighter(p1,p2); updateFighter(p2,p1); updateProjectiles();
    if(endT>125){ if(wins[0]>=2 || wins[1]>=2){ phase='matchEnd'; showResult(); } else { roundNum++; resetRound(true); } }
  }
  render();
  if(phase==='select') drawCards();
}
requestAnimationFrame(loop);

/* ---------------- menus ---------------- */
const $ = id=>document.getElementById(id);
function showOnly(id){ ['titleScreen','selectScreen','resultScreen'].forEach(s=>$(s).classList.toggle('hidden', s!==id)); if(!id) ['titleScreen','selectScreen','resultScreen'].forEach(s=>$(s).classList.add('hidden')); }
$('btnHow').onclick = ()=>{ audio(); $('howPanel').classList.toggle('hidden'); };
$('btnCpu').onclick = ()=>{ audio(); mode='cpu'; openSelect(); };
$('btn2p').onclick = ()=>{ audio(); mode='2p'; openSelect(); };
let pickStage = 0, pickA = -1, cardCtxs = [], cardFighters = [];
function openSelect(){ phase='select'; pickStage=0; pickA=-1; showOnly('selectScreen'); buildCards(); $('pickTurn').textContent='PLAYER 1 — CHOOSE'; $('pickTurn').className='pick-turn p1'; }
function buildCards(){
  const grid = $('cardGrid'); grid.innerHTML=''; cardCtxs=[]; cardFighters=[];
  CHARS.forEach((c,i)=>{
    const d = document.createElement('div'); d.className='card'; d.style.borderTop='4px solid '+c.accent;
    d.innerHTML = '<canvas width="180" height="148"></canvas><h3 style="color:'+c.accent+'">'+c.name+'</h3>'+
      '<div style="font-size:10px;letter-spacing:.22em;color:#8fa3d9">'+c.title+'</div>'+
      '<div class="tech">'+c.techDesc+'</div><div class="dom">'+c.domainName+'</div>'+
      statRow('SPD', c.speed/6*100, c.accent)+statRow('PWR', c.power/1.25*100, c.accent);
    d.onclick = ()=>{ audio(); chooseCard(i, d); };
    grid.appendChild(d);
    cardCtxs.push(d.querySelector('canvas').getContext('2d'));
    const f = makeFighter(i, 0, false); f.x=90; f.y=140; cardFighters.push(f);
  });
}
function statRow(label, pct, color){ return '<div class="stat"><span>'+label+'</span><div class="bar"><div class="fill" style="width:'+Math.round(pct)+'%;background:'+color+'"></div></div></div>'; }
function drawCards(){
  cardCtxs.forEach((c,i)=>{ const f = cardFighters[i]; f.idlePh += 0.07; c.clearRect(0,0,180,148);
    c.save(); c.fillStyle='rgba(120,140,255,0.06)'; c.fillRect(0,0,180,148); c.restore();
    c.fillStyle='rgba(0,0,0,0.35)'; c.fillRect(0,140,180,2);
    drawFighterTo(c, f, 0.92); });
}
function chooseCard(i, el){
  const cards = document.querySelectorAll('.card');
  if(pickStage===0){ pickA = i; cards.forEach((c2,j)=>c2.classList.toggle('picked1', j===i));
    if(mode==='cpu'){ pickStage=2; $('pickTurn').textContent='CPU IS CHOOSING…'; $('pickTurn').className='pick-turn p2';
      setTimeout(()=>{ let b = Math.floor(Math.random()*CHARS.length); startMatch(pickA, b); }, 650); }
    else { pickStage=1; $('pickTurn').textContent='PLAYER 2 — CHOOSE'; $('pickTurn').className='pick-turn p2'; }
  } else if(pickStage===1){ cards.forEach((c2,j)=>c2.classList.toggle('picked2', j===i)); startMatch(pickA, i); }
}
function startMatch(a, b){
  p1 = makeFighter(a, 0, false); p2 = makeFighter(b, 1, mode==='cpu');
  wins=[0,0]; roundNum=1; projectiles=[]; particles=[]; bolts=[]; popups=[]; scheduled=[]; domain=null;
  timer=99*60; phase='intro'; introT=0; showOnly(null);
  $('touch').classList.toggle('hidden', !('ontouchstart' in window));
}
function showResult(){
  const w = wins[0]>=2? p1 : p2;
  $('winnerText').textContent = w.c.name+' WINS';
  $('winnerText').style.color = w.c.accent;
  showOnly('resultScreen'); $('touch').classList.add('hidden');
}
$('btnBackTitle').onclick = ()=>{ audio(); phase='title'; showOnly('titleScreen'); };
$('btnRematch').onclick = ()=>{ audio(); showOnly(null); resetRound(false); $('touch').classList.toggle('hidden', !('ontouchstart' in window)); };
$('btnChange').onclick = ()=>{ audio(); showOnly(null); openSelect(); };
$('btnTitle2').onclick = ()=>{ audio(); phase='title'; showOnly('titleScreen'); };
function onKeyMenu(code){
  if(phase==='select' && ['Digit1','Digit2','Digit3','Digit4'].includes(code)){
    const i = Number(code.slice(-1))-1; const cards = document.querySelectorAll('.card'); if(cards[i]) chooseCard(i, cards[i]);
  }
  if(phase==='matchEnd' && code==='Enter') $('btnRematch').click();
}
document.addEventListener('pointerdown', audio, { once:false });

/* ---------------- QA / attract hooks (?qa=select | ?qa=fight) ---------------- */
(function(){
  const q = new URLSearchParams(location.search).get('qa');
  if(q==='select'){ setTimeout(()=>{ if(phase==='title') openSelect(); }, 400); }
  if(q==='fight'){ setTimeout(()=>{ $('btnCpu').click();
    setTimeout(()=>{ const cards=document.querySelectorAll('.card'); if(cards[0]) chooseCard(0, cards[0]);
      setTimeout(()=>{ if(p1&&p2){ p1.ce=100; p2.ce=55; p1.x=370; p2.x=590; if(phase==='fight') startDomain(p1,p2); } }, 2700);
    }, 350);
  }, 350); }
})();
