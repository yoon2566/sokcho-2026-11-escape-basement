/* Escape basement · 오예준 · actual 3D, offline, fixed-camera action prototype. */
(async function () {
'use strict';
const {THREE,cloneSkinned,loadEmbeddedGLB}=Game3D;
const $=id=>document.getElementById(id), canvas=$('gameCanvas');
const ui={}; ['hearts','coins','keys','damage','rate','objective','roomLabel','timer','toast','bossHud','bossName','bossFill','bossHealth','overlay','overlayTag','overlayTitle','overlayText','overlayStats','startButton','secondaryButton','loading','errorBanner','prompt','muteButton','pauseButton'].forEach(id=>ui[id]=$(id));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), length=(x,z)=>Math.hypot(x,z), norm=(x,z)=>{let l=length(x,z)||1;return {x:x/l,z:z/l};};
const rnd=(a,b)=>a+Math.random()*(b-a), TAU=Math.PI*2;
let renderer;
try {renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});}
catch(e){ui.errorBanner.hidden=false;ui.errorBanner.textContent='3D 화면을 열 수 없습니다. WebGL을 사용할 수 있는 Chrome/Edge에서 다시 열어 주세요.';throw e;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#151311');
const camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,70);camera.position.set(0,18,11);camera.lookAt(0,0,0);
scene.add(new THREE.HemisphereLight('#fbe2bb','#332619',2.1));
const sun=new THREE.DirectionalLight('#ffe2bb',3.1);sun.position.set(-4,9,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-8,right:8,top:7,bottom:-7,near:.1,far:30});sun.shadow.bias=-.001;scene.add(sun);
const fill=new THREE.DirectionalLight('#a1b6ca',1);fill.position.set(4,6,-4);scene.add(fill);
const world=new THREE.Group();scene.add(world);
const raycaster=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const input={keys:new Set(),mouseDown:false,mouseActive:false,mouse:{x:0,y:0},lastArrow:'ArrowUp'};
const journal=[];const playedClips=new Set();let ready=false,muted=false,audioContext, lastT=0,run,roomModel,player,boss,gate,exitGlow,frameCounter=0;
let actors=[],tears=[],bullets=[],pickups=[],effects=[],telegraphs=[],interactables=[],decors=[],transitionLock=0,toastTime=0,shake=0;
const templates={}; const roomNames=['먼지의 방','잠깐의 숨','문지기의 방'];
const stats={damage:2,rate:2.2,speed:2.5,maxHp:6};
function log(type,data){journal.push({t:run?+run.time.toFixed(3):0,type,...data});if(journal.length>2500)journal.shift();}
function tone(freq=440,duration=.08,kind='sine',volume=.03){
 if(muted||!audioContext)return;const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=kind;o.frequency.setValueAtTime(freq,audioContext.currentTime);g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);
}
function sound(name){if(name==='shot')tone(500,.045,'sine',.012);else if(name==='hit')tone(115,.10,'triangle',.045);else if(name==='pickup'){tone(680,.10,'sine',.035);setTimeout(()=>tone(980,.14,'sine',.025),75);}else if(name==='death')tone(65,.5,'sawtooth',.035);else if(name==='gate'){tone(130,.25,'triangle',.02);setTimeout(()=>tone(260,.2,'sine',.02),120);}else tone(190,.16,'triangle',.015);}
function toast(text,duration=3){ui.toast.textContent=text;ui.toast.classList.add('show');toastTime=duration;}
function material(color,emissive){return new THREE.MeshStandardMaterial({color,roughness:.82,emissive:emissive||'#000000',emissiveIntensity:emissive?.35:0});}
function mesh(geometry,mat,parent=world){const m=new THREE.Mesh(geometry,mat);parent.add(m);m.castShadow=true;m.receiveShadow=true;return m;}
function ring(radius,color,opacity=.75){const m=new THREE.Mesh(new THREE.RingGeometry(radius-.035,radius,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.y=.035;world.add(m);return m;}
function remove(obj){if(obj&&obj.parent)obj.parent.remove(obj);}
function clearLists(){[actors,tears,bullets,pickups,effects,telegraphs,interactables,decors].forEach(list=>list.forEach(o=>remove(o.object||o.group||o)));actors=[];tears=[];bullets=[];pickups=[];effects=[];telegraphs=[];interactables=[];decors=[];boss=null;}
function setOverlay(tag,title,text,button,showStats=false){
 ui.overlay.hidden=false;ui.overlayTag.textContent=tag;ui.overlayTitle.textContent=title;ui.overlayText.textContent=text;ui.startButton.textContent=button;ui.startButton.disabled=false;
 ui.overlayStats.textContent=showStats?'시간 '+formatTime(run.time)+'  ·  처치 '+run.kills+'  ·  피격 '+run.hits+'회':'';
 ui.secondaryButton.hidden=true;input.keys.clear();input.mouseDown=false;
}
function formatTime(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
function resize(){
 const w=canvas.clientWidth||window.innerWidth,h=canvas.clientHeight||window.innerHeight;renderer.setSize(w,h,false);
 const aspect=w/h,vertical=Math.max(10.4,14.2/aspect);camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();

function makeActor(kind,x,z,scale){
 const root=new THREE.Group(),model=cloneSkinned(templates[kind].scene);root.add(model);root.position.set(x,0,z);model.scale.setScalar(scale);world.add(root);
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});
 const mixer=new THREE.AnimationMixer(model), actions={};
 for(const clip of templates[kind].animations){actions[clip.name]=mixer.clipAction(clip);}
 const actor={kind,object:root,model,mixer,actions,current:'',animUntil:0,aim:model.getObjectByName('Aim'),x,z,hp:kind==='boss'?480:24,maxHp:kind==='boss'?480:24,radius:kind==='boss'?1.0:.3,cooldown:rnd(1.2,2.2),flash:0,dead:false,deathTime:0,walkingAngle:0,mode:'idle',phaseTime:0,cycle:0,attackRemaining:0};
 actor.aimRest=actor.aim?actor.aim.quaternion.clone():null;
 actors.push(actor);play(actor,'Idle');return actor;
}
function play(a,name,lock=0){
 if(!a.actions[name])return;if(a.current===name&&lock===0)return;
 const next=a.actions[name];if(a.current&&a.actions[a.current])a.actions[a.current].fadeOut(.10);
 next.reset().setEffectiveWeight(1).fadeIn(.10);
 const loop=['Idle','Move','MoveAim'].includes(name);next.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);next.clampWhenFinished=!loop;next.play();a.current=name;a.animUntil=lock;
 playedClips.add(a.kind+'/'+name);
}
function updateActor(a,dt){
 a.animUntil=Math.max(0,a.animUntil-dt);a.mixer.update(dt);
 if(a.flash>0){a.flash-=dt;a.model.traverse(o=>{if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){m.emissive.setHex(a.flash>0?0x8c2d24:0);m.emissiveIntensity=a.flash>0?.85:0;}}});}
 a.object.position.x=a.x;a.object.position.z=a.z;
 if(a.dead){a.deathTime+=dt;return;}
}
function prop(name,x,z,scale=1,y=.06){
 const found=templates.props.scene.getObjectByName(name);if(!found)throw new Error('Missing prop '+name);
 const root=found.clone(true);root.position.set(x,y,z);root.scale.setScalar(scale);root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});world.add(root);return root;
}
function burst(x,z,color='hit'){
 const obj=prop('HitBurst',x,z,color==='hit'?1.5:2.2,.3);effects.push({object:obj,time:.22,total:.22});
}
function addPickup(type,x,z,value=1){
 const names={coin:'CoinPickup',key:'KeyPickup',heart:'HeartPickup'};
 const object=prop(names[type],x,z,type==='heart'?1.35:1.4,.10);
 pickups.push({type,x,z,value,object,base:.1,age:0});return object;
}
function jewel(x,z,color='#60cadd'){
 const group=new THREE.Group();world.add(group);group.position.set(x,0,z);
 const base=mesh(new THREE.CylinderGeometry(.34,.40,.18,8),material('#493327'),group);base.position.y=.12;
 const gem=mesh(new THREE.OctahedronGeometry(.28),material(color,color),group);gem.position.y=.60;gem.rotation.y=.4;
 return {object:group,gem,x,z};
}
function chest(x,z){
 const o=new THREE.Group();world.add(o);o.position.set(x,0,z);
 const body=mesh(new THREE.BoxGeometry(.65,.42,.45),material('#704222'),o);body.position.y=.26;
 const lid=mesh(new THREE.BoxGeometry(.7,.12,.49),material('#a36e32'),o);lid.position.set(0,.52,0);
 for(const px of [-.24,.24]){const band=mesh(new THREE.BoxGeometry(.06,.5,.48),material('#d7b669'),o);band.position.set(px,.28,0);}
 const lock=prop('KeyPickup',x,z+.25,.7,.37);lock.rotation.x=-Math.PI/2;decors.push(lock);
 return {kind:'chest',object:o,x,z,lid,lock,used:false};
}
function doors(open){
 run.doorOpen=open;gate.userData.targetY=open?1.9:0;if(open){sound('gate');log('gate_open',{room:run.room});}
 exitGlow.visible=open;ui.objective.textContent=objective();
}
function objective(){
 if(!run)return'지하실에서 살아남기';
 if(run.phase==='dead')return'다시 도전할 수 있습니다';
 if(run.phase==='won')return'지하실 탈출 완료';
 if(run.room===0)return run.doorOpen?'북쪽 문으로 · 보상을 찾기':'적을 처치하기 · '+run.wave+'/3 무리';
 if(run.room===1)return run.item?'북쪽 문으로 · 문지기를 찾아가기':'열쇠를 찾아 보상함 열기';
 return run.bossDefeated?'열린 북쪽 문으로 직접 탈출':'문지기를 쓰러뜨리기';
}
function enterRoom(index){
 clearLists();run.room=index;run.doorOpen=false;run.roomTime=0;run.wave=0;run.waveWait=0;run.bossDefeated=false;transitionLock=.9;
 if(roomModel)remove(roomModel);roomModel=templates.basement.scene.clone(true);
 roomModel.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=false;}});world.add(roomModel);
 gate=roomModel.getObjectByName('Basement_Gate_North_Proposed');gate.userData.originalY=gate.position.y;gate.userData.targetY=0;
 exitGlow=ring(.8,'#6adbc5',.8);exitGlow.position.set(0,.04,-3.65);exitGlow.visible=false;decors.push(exitGlow);
 player=makeActor('hero',0,2.5,.53);player.hp=run.hp;player.radius=.22;player.shotTimer=0;player.invulnerable=.8;player.aimDir={x:0,z:-1};player.walkingAngle=Math.PI;
 player.object.rotation.y=Math.PI;
 if(index===0){spawnWave();toast('WASD로 피하면서 방향키로 눈물을 쏘세요',4);}
 if(index===1){
   addPickup('key',-3,.45,1);[-3.1,-2.55,-2,-1.45].forEach(x=>addPickup('coin',x,1.8,1));addPickup('heart',3,1.2,2);
   interactables.push(chest(-2,-1.1));const upgrade=jewel(2,-1.1,'#82dccd');interactables.push({...upgrade,kind:'rate',used:run.rateUpgrade});
   toast('열쇠는 보상함 · 코인은 연사 강화 · 하트는 즉시 회복',5);
 }
 if(index===2){
   boss=makeActor('boss',0,-1.2,.82);boss.object.rotation.y=0;boss.phaseTime=2.2;boss.mode='rest';ui.bossHud.hidden=false;
   toast('황금 점선은 예고, 붉은 탄만 피해를 줍니다',4);
 }else ui.bossHud.hidden=true;
 ui.roomLabel.textContent=roomNames[index];document.querySelectorAll('[data-room]').forEach(o=>o.classList.toggle('active',Number(o.dataset.room)===index));
 log('enter_room',{room:index});updateHUD();
}
function spawnWave(){
 run.wave++;const positions=[[[-3,-1.2],[3,-1.5],[0,-2.8]],[[-2.8,-2.2],[2.8,1.4],[2.8,-2.2]],[[-3,1],[2.8,-2],[0,-2.8]]][run.wave-1];
 for(const p of positions){if(player&&length(player.x-p[0],player.z-p[1])<1.5){p[0]=-p[0]||3;p[1]=-p[1];}const e=makeActor('enemy',p[0],p[1],.75);e.hp=e.maxHp=24;e.style=run.wave%2;e.cooldown=1.7+Math.random();}
 log('spawn_wave',{wave:run.wave});toast('먼지의 방 · '+run.wave+'번째 무리',1.8);
}
function reset(){
 if(audioContext)audioContext.resume();
 run={phase:'playing',time:0,room:0,roomTime:0,hp:6,coins:0,keys:0,damage:2,rate:2.2,item:false,rateUpgrade:false,kills:0,hits:0,shots:0,bossDefeated:false,doorOpen:false,wave:0,waveWait:0};
 journal.length=0;playedClips.clear();input.keys.clear();input.mouseDown=false;input.mouseActive=false;ui.overlay.hidden=true;ui.pauseButton.textContent='일시정지';ui.prompt.hidden=true;enterRoom(0);log('run_start',{hp:6,damage:2,rate:2.2});
}
function shoot(){
 const d=player.aimDir,socketName=THREE.PropertyBinding.sanitizeNodeName(run.shots%2?'TearSocket.L':'TearSocket.R'),sock=player.model.getObjectByName(socketName);const v=new THREE.Vector3();
 player.object.updateMatrixWorld(true);if(sock)sock.getWorldPosition(v);else v.set(player.x,.65,player.z);
 // Flat-plane aiming determines trajectory independently of walk direction.
 const obj=prop('TearProjectile',v.x+d.x*.14,v.z+d.z*.14,.8,.62);obj.rotation.y=Math.atan2(d.x,d.z);
 tears.push({object:obj,x:obj.position.x,z:obj.position.z,dx:d.x,dz:d.z,life:1.65,damage:run.damage,speed:6.1});
 run.shots++;log('shot',{damage:run.damage,rate:run.rate,x:+player.x.toFixed(2),z:+player.z.toFixed(2),dx:d.x,dz:d.z,socket:sock?.name||null});sound('shot');
 if(!input.keys.has('KeyW')&&!input.keys.has('KeyA')&&!input.keys.has('KeyS')&&!input.keys.has('KeyD'))play(player,'TearFire',.20);
}
function enemyBullet(x,z,angle,speed,source){
 const dx=Math.sin(angle),dz=Math.cos(angle),obj=prop('HostileBullet',x+dx*.5,z+dz*.5,1.1,.36);
 bullets.push({object:obj,x:obj.position.x,z:obj.position.z,dx,dz,speed,life:7,radius:.105,source});
}
function takeDamage(cause){
 if(run.phase!=='playing'||player.dead||player.invulnerable>0)return;
 run.hp--;run.hits++;player.hp=run.hp;player.invulnerable=1.15;player.flash=.15;shake=.15;play(player,'Hit',.28);sound('hit');log('damage_player',{cause,hp:run.hp});
 if(run.hp<=0){run.phase='dying';player.dead=true;player.deathTime=0;play(player,'Death',1.2);input.keys.clear();input.mouseDown=false;sound('death');log('death',{cause});}
 updateHUD();
}
function hitEnemy(e,damage){
 if(e.dead)return;const previousHP=e.hp;e.hp=Math.max(0,e.hp-damage);e.flash=.10;burst(e.x,e.z);log('damage_enemy',{kind:e.kind,damage,before:previousHP,hp:e.hp});
 if(e.hp<=0){
   e.dead=true;e.deathTime=0;run.kills++;play(e,e.kind==='boss'?'Defeat':'Death',1.5);sound('death');
   if(e.kind==='boss'){
     run.bossDefeated=true;bullets.forEach(b=>remove(b.object));bullets=[];telegraphs.forEach(t=>remove(t.object));telegraphs=[];toast('문지기가 쓰러졌습니다. 열린 문까지 나가세요.',5);log('boss_defeated',{won:false});sound('gate');
   }else{addPickup('coin',e.x,e.z,1);if(run.wave===2&&!run.waveHeart){addPickup('heart',e.x+.4,e.z,2);run.waveHeart=true;}log('enemy_defeated',{wave:run.wave});}
 }else if(e.kind==='enemy'){play(e,'Hit',.18);}else if(e.mode==='rest'&&e.animUntil<=0){play(e,'Hit',.22);}
}
function collect(){
 for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];if(length(player.x-p.x,player.z-p.z)>.43)continue;
   if(p.type==='heart'&&run.hp>=stats.maxHp)continue;
   if(p.type==='coin'){run.coins+=p.value;toast('코인 +1 · 보상 공간에서 연사 강화',1.3);}
   if(p.type==='key'){run.keys+=p.value;toast('열쇠 +1 · 보상함을 열 수 있습니다',2);}
   if(p.type==='heart'){const old=run.hp;run.hp=Math.min(stats.maxHp,run.hp+p.value);player.hp=run.hp;toast('하트 · 체력 '+old+' → '+run.hp,2);log('heal',{before:old,after:run.hp});}
   log('pickup',{type:p.type,coins:run.coins,keys:run.keys,hp:run.hp});sound('pickup');remove(p.object);pickups.splice(i,1);
 }
}
function nearInteraction(){return interactables.find(i=>!i.used&&length(player.x-i.x,player.z-i.z)<.95);}
function interact(){
 if(!run||run.phase!=='playing')return;const it=nearInteraction();if(!it)return;
 if(it.kind==='chest'){
   if(run.keys<1){toast('열쇠 1개가 필요합니다',2);return;}
   run.keys--;run.item=true;run.damage=3.5;it.used=true;it.lid.rotation.x=-1.0;it.lid.position.z=-.15;remove(it.lock);
   const reward=jewel(it.x,it.z,'#4a86c7');decors.push(reward.object);reward.object.position.y=.35;
   toast('짙은 눈물 획득 · 공격력 2 → 3.5',4);log('upgrade_damage',{damage:run.damage,keys:run.keys});doors(true);sound('pickup');
 }else{
   if(run.coins<3){toast('코인 3개가 필요합니다',2);return;}
   run.coins-=3;run.rateUpgrade=true;run.rate=3.2;it.used=true;it.gem.material.color.set('#3d5855');
   toast('맑은 눈물 획득 · 초당 눈물 2.2 → 3.2',4);log('upgrade_rate',{rate:run.rate,coins:run.coins});sound('pickup');
 }
 updateHUD();
}
function telegraphBoss(){
 boss.mode='windup';boss.phaseTime=.95;boss.pattern=boss.cycle%2?'ring':'fan';boss.cycle++;
 boss.targetAngle=Math.atan2(player.x-boss.x,player.z-boss.z);play(boss,'Windup',.95);
 const g=new THREE.Group();world.add(g);g.position.set(boss.x,.045,boss.z);
 const count=boss.pattern==='fan'?9:20, spread=boss.pattern==='fan'?1.7:TAU;
 for(let i=0;i<count;i++){
   const a=boss.pattern==='fan'?boss.targetAngle-spread/2+i*spread/(count-1):i*TAU/count;
   if(boss.pattern==='ring'&&Math.abs(Math.atan2(Math.sin(a-boss.targetAngle),Math.cos(a-boss.targetAngle)))<.52)continue;
   for(let r=1.25;r<2.5;r+=.5){const dot=new THREE.Mesh(new THREE.CircleGeometry(.037,6),new THREE.MeshBasicMaterial({color:'#e2b670',transparent:true,opacity:.72,side:THREE.DoubleSide}));dot.rotation.x=-Math.PI/2;dot.position.set(Math.sin(a)*r,0,Math.cos(a)*r);g.add(dot);}
 }
 telegraphs.push({object:g,time:.95});toast(boss.pattern==='fan'?'전조 · 부채꼴의 옆으로':'전조 · 점선이 없는 틈을 찾으세요',1.3);
 log('boss_telegraph',{pattern:boss.pattern,damage:false});
}
function fireBoss(){
 const speed=boss.hp<boss.maxHp*.5?2.5:2.15;
 if(boss.pattern==='fan'){
   for(let i=0;i<9;i++)enemyBullet(boss.x,boss.z,boss.targetAngle-.85+i*1.7/8,speed,'boss_fan');
 }else{
   for(let i=0;i<20;i++){const a=i*TAU/20;if(Math.abs(Math.atan2(Math.sin(a-boss.targetAngle),Math.cos(a-boss.targetAngle)))<.52)continue;enemyBullet(boss.x,boss.z,a,speed*.88,'boss_ring');}
 }
 play(boss,'FanAttack',.667);boss.mode='attack';boss.phaseTime=.70;boss.attackRemaining=boss.pattern==='fan'?1:0;boss.secondTime=.38;sound('boss');log('boss_attack',{pattern:boss.pattern});
}
function updateBoss(dt){
 if(!boss||boss.dead)return;
 boss.object.rotation.y=Math.atan2(player.x-boss.x,player.z-boss.z);boss.phaseTime-=dt;
 if(boss.mode==='rest'){
   if(boss.animUntil<=0)play(boss,'Idle');
   const goalX=Math.sin(boss.cycle*1.7)*2.5,goalZ=-1.4;
   boss.x+=(goalX-boss.x)*dt*.45;boss.z+=(goalZ-boss.z)*dt*.45;
   if(boss.phaseTime<=0)telegraphBoss();
 }else if(boss.mode==='windup'&&boss.phaseTime<=0)fireBoss();
 else if(boss.mode==='attack'){
   boss.secondTime-=dt;
   if(boss.attackRemaining&&boss.secondTime<=0){for(let i=0;i<8;i++)enemyBullet(boss.x,boss.z,boss.targetAngle-.74+i*1.48/7,1.95,'boss_fan_second');boss.attackRemaining=0;}
   if(boss.phaseTime<=0){boss.mode='rest';boss.phaseTime=boss.hp<boss.maxHp*.5?1.45:1.9;}
 }
 if(length(player.x-boss.x,player.z-boss.z)<boss.radius+player.radius)takeDamage('boss_contact');
}
function updateEnemy(e,dt){
 if(e.dead)return;const d=norm(player.x-e.x,player.z-e.z),dist=length(player.x-e.x,player.z-e.z);
 let vx=0,vz=0;if(dist>2.3){vx=d.x*.53;vz=d.z*.53;}else if(dist<1.5){vx=-d.x*.28;vz=-d.z*.28;}
 vx+=Math.sin(run.time*1.5+e.x)*.12;
 e.x=clamp(e.x+vx*dt,-5,5);e.z=clamp(e.z+vz*dt,-2.85,2.85);e.object.rotation.y=Math.atan2(d.x,d.z);
 e.cooldown-=dt;
 if(e.cooldown<=.35&&e.cooldown>0&&e.animUntil<=0)play(e,'Attack',.35);
 if(e.cooldown<=0){const angle=Math.atan2(d.x,d.z);for(const a of [-.19,0,.19])enemyBullet(e.x,e.z,angle+a,1.7+run.wave*.10,'enemy');e.cooldown=2.0+rnd(0,.5);log('enemy_shot',{x:e.x,z:e.z});}
 if(e.animUntil<=0)play(e,length(vx,vz)>.2?'Move':'Idle');
 if(dist<e.radius+player.radius)takeDamage('enemy_contact');
}
function updatePlayer(dt){
 player.invulnerable=Math.max(0,player.invulnerable-dt);
 const moving=norm((input.keys.has('KeyD')?1:0)-(input.keys.has('KeyA')?1:0),(input.keys.has('KeyS')?1:0)-(input.keys.has('KeyW')?1:0));
 const speed=stats.speed;player.x=clamp(player.x+moving.x*dt*speed,-5.45,5.45);const northLimit=run.doorOpen&&Math.abs(player.x)<.7?-4.6:-3.45;player.z=clamp(player.z+moving.z*dt*speed,northLimit,3.3);
 const arrows=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].filter(k=>input.keys.has(k));
 let firing=arrows.length>0||input.mouseDown;
 if(arrows.length){const k=arrows.includes(input.lastArrow)?input.lastArrow:arrows[0];player.aimDir={ArrowUp:{x:0,z:-1},ArrowDown:{x:0,z:1},ArrowLeft:{x:-1,z:0},ArrowRight:{x:1,z:0}}[k];}
 else if(input.mouseActive){const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((input.mouse.x-rect.left)/rect.width*2-1,-(input.mouse.y-rect.top)/rect.height*2+1),camera);const v=new THREE.Vector3();if(raycaster.ray.intersectPlane(plane,v))player.aimDir=norm(v.x-player.x,v.z-player.z);}
 const isMoving=length(moving.x,moving.z)>.01;if(isMoving)player.walkingAngle=Math.atan2(moving.x,moving.z);
 player.object.rotation.y=player.walkingAngle;
 if(player.animUntil<=0)play(player,isMoving?(firing?'MoveAim':'Move'):'Idle');
 updateActor(player,dt);
 if(player.aim){
   // Remove authored demo yaw, then turn the head using world-up in its parent space.
   const rest=player.aimRest;
   if(rest)player.aim.quaternion.copy(rest);
   player.object.updateMatrixWorld(true);const current=player.aim.getWorldQuaternion(new THREE.Quaternion());
   const axis=new THREE.Vector3(0,1,0).applyQuaternion(current.clone().invert());
   const aimAngle=Math.atan2(player.aimDir.x,player.aimDir.z),delta=Math.atan2(Math.sin(aimAngle-player.walkingAngle),Math.cos(aimAngle-player.walkingAngle));
   player.aim.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,delta));player.object.updateMatrixWorld(true);
 }
 player.model.visible=player.invulnerable<=0||Math.floor(player.invulnerable*14)%2===0;
 player.shotTimer-=dt;
 if(firing&&player.shotTimer<=0){shoot();player.shotTimer=Math.max(-dt,player.shotTimer)+1/run.rate;}else if(!firing)player.shotTimer=Math.max(0,player.shotTimer);
 collect();
 const it=nearInteraction();
 ui.prompt.hidden=!it;
 if(it)ui.prompt.textContent=it.kind==='chest'?'E · 열쇠 1개로 보상함 열기':'E · 코인 3개로 초당 눈물 +1.0';
 if(run.doorOpen&&player.z<-4.1&&Math.abs(player.x)<.7&&transitionLock<=0){
   if(run.room<2)enterRoom(run.room+1);else win();
 }
}
function win(){
 if(!run.bossDefeated||run.hp<=0||run.room!==2)return;run.phase='won';log('exit_crossed',{bossDefeated:true,hp:run.hp});
 sound('pickup');setOverlay('ESCAPED','지하실 밖으로','문지기를 쓰러뜨리고, 마지막 문을 직접 통과했습니다.','다시 도전',true);updateHUD();
}
function updateHUD(){
 if(!run)return;
 ui.hearts.innerHTML=Array.from({length:stats.maxHp},(_,i)=>'<span class="heart '+(i<run.hp?'':'empty')+'">♥</span>').join('');
 ui.hearts.setAttribute('aria-label','체력 '+run.hp+' / '+stats.maxHp);
 ui.coins.textContent=String(run.coins).padStart(2,'0');ui.keys.textContent=String(run.keys).padStart(2,'0');ui.damage.textContent=run.damage.toFixed(1);ui.rate.textContent=run.rate.toFixed(1)+'/s';
 ui.objective.textContent=objective();ui.timer.textContent=formatTime(run.time);
 if(boss){ui.bossFill.style.width=(boss.hp/boss.maxHp*100)+'%';ui.bossHealth.textContent=Math.ceil(boss.hp)+' / '+boss.maxHp;ui.bossName.textContent='문지기';}
 document.body.dataset.phase=run.phase;document.body.dataset.room=String(run.room);
}
function update(dt){
 if(!run)return;
 if(run.phase==='dying'){
   updateActor(player,dt);if(player.deathTime>1.25){run.phase='dead';setOverlay('LOST IN THE BASEMENT','다시, 숨을 고르고','이동은 WASD, 사격은 방향키. 쏘는 방향을 유지한 채 옆으로 피할 수 있어요.','처음부터 다시',true);updateHUD();}
   return;
 }
 if(run.phase!=='playing')return;
 run.time+=dt;run.roomTime+=dt;transitionLock=Math.max(0,transitionLock-dt);
 updatePlayer(dt);if(run.phase!=='playing')return;
 for(const a of actors){if(a===player)continue;updateActor(a,dt);if(a.kind==='enemy')updateEnemy(a,dt);}
 updateBoss(dt);
 // Damage to the player is resolved before projectile hits; death wins same-frame ties.
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.x+=b.dx*b.speed*dt;b.z+=b.dz*b.speed*dt;b.life-=dt;b.object.position.set(b.x,.36,b.z);
   if(length(b.x-player.x,b.z-player.z)<player.radius+b.radius){takeDamage(b.source);remove(b.object);bullets.splice(i,1);continue;}
   if(b.life<=0||Math.abs(b.x)>5.8||Math.abs(b.z)>3.8){remove(b.object);bullets.splice(i,1);}
 }
 if(run.phase!=='playing')return;
 for(let i=tears.length-1;i>=0;i--){const t=tears[i];t.x+=t.dx*t.speed*dt;t.z+=t.dz*t.speed*dt;t.life-=dt;t.object.position.set(t.x,.62,t.z);
   let hit=false;for(const e of actors){if(e===player||e.dead)continue;if(length(t.x-e.x,t.z-e.z)<e.radius+.10){hitEnemy(e,t.damage);hit=true;break;}}
   if(hit||t.life<=0||Math.abs(t.x)>5.8||Math.abs(t.z)>3.8){remove(t.object);tears.splice(i,1);}
 }
 for(let i=actors.length-1;i>=0;i--){const a=actors[i];if(a===player||!a.dead)continue;if(a.kind==='boss'){if(a.deathTime>1.6&&!run.doorOpen)doors(true);}else if(a.deathTime>1.15){remove(a.object);actors.splice(i,1);}}
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.time-=dt;e.object.scale.multiplyScalar(1+dt*3);if(e.time<=0){remove(e.object);effects.splice(i,1);}}
 for(let i=telegraphs.length-1;i>=0;i--){telegraphs[i].time-=dt;if(telegraphs[i].time<=0){remove(telegraphs[i].object);telegraphs.splice(i,1);}}
 for(const p of pickups){p.age+=dt;p.object.position.y=p.base+Math.sin(p.age*3)*.04;}
 for(const it of interactables)if(it.gem&&!it.used)it.gem.rotation.y+=dt*.65;
 if(run.room===0&&!actors.some(a=>a.kind==='enemy'&&!a.dead)){
   run.waveWait+=dt;if(run.waveWait>1.6){if(run.wave<3){run.waveWait=0;spawnWave();}else if(!run.doorOpen){doors(true);toast('먼지의 방을 정리했습니다 · 북쪽 문으로',4);}}
 }
 if(gate)gate.position.y+=(gate.userData.originalY+gate.userData.targetY-gate.position.y)*Math.min(1,dt*3.5);
 exitGlow.material.opacity=.5+Math.sin(run.time*3)*.2;
 if(toastTime>0){toastTime-=dt;if(toastTime<=0){ui.toast.classList.remove('show');ui.toast.textContent='';}}
 updateHUD();
}
function pause(){
 if(!run||!['playing','paused'].includes(run.phase))return;
 if(run.phase==='playing'){run.phase='paused';setOverlay('PAUSED','숨을 고르는 중','WASD로 이동 · 방향키로 사격 · 마우스 조준도 가능합니다.','계속하기');ui.pauseButton.textContent='계속하기';}
 else{run.phase='playing';ui.overlay.hidden=true;ui.pauseButton.textContent='일시정지';}
 updateHUD();
}
window.addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape','KeyW','KeyA','KeyS','KeyD','KeyE'].includes(e.code))e.preventDefault();
 if(e.code==='Escape'&&!e.repeat){pause();return;}if(!run||run.phase!=='playing')return;
 input.keys.add(e.code);if(e.code.startsWith('Arrow')){input.lastArrow=e.code;input.mouseActive=false;}
 if(e.code==='KeyE'&&!e.repeat)interact();
});
window.addEventListener('keyup',e=>input.keys.delete(e.code));
window.addEventListener('blur',()=>{input.keys.clear();input.mouseDown=false;if(run?.phase==='playing')pause();});
canvas.addEventListener('pointermove',e=>{input.mouse={x:e.clientX,y:e.clientY};input.mouseActive=true;});
canvas.addEventListener('pointerdown',e=>{if(e.button===0){input.mouseDown=true;input.mouseActive=true;input.mouse={x:e.clientX,y:e.clientY};}});
window.addEventListener('pointerup',()=>input.mouseDown=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
ui.startButton.addEventListener('click',()=>{
 if(!ready)return;
 if(!audioContext){const AC=window.AudioContext||window.webkitAudioContext;if(AC)audioContext=new AC();}
 if(run?.phase==='paused')pause();else reset();
});
ui.pauseButton.addEventListener('click',pause);ui.muteButton.addEventListener('click',()=>{muted=!muted;ui.muteButton.textContent=muted?'소리 끔':'소리 켬';});
function screenPoint(x,z,y=0){const v=new THREE.Vector3(x,y,z).project(camera),r=canvas.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
window.gameDebug=Object.freeze({snapshot:()=>({ready,protocol:location.protocol,run:run?{...run}:null,player:player?{x:player.x,z:player.z,hp:player.hp,aim:{...player.aimDir},walkAngle:player.walkingAngle,clip:player.current,screen:screenPoint(player.x,player.z)}:null,enemies:actors.filter(a=>a!==player).map(a=>({kind:a.kind,x:a.x,z:a.z,hp:a.hp,dead:a.dead,clip:a.current,screen:screenPoint(a.x,a.z)})),pickups:pickups.map(p=>({type:p.type,x:p.x,z:p.z})),interactables:interactables.map(p=>({kind:p.kind,x:p.x,z:p.z,used:p.used})),bullets:bullets.map(b=>({x:b.x,z:b.z,dx:b.dx,dz:b.dz,source:b.source})),playedClips:[...playedClips],events:journal.slice(),frameCounter,gateOpen:run?.doorOpen,counts:{tears:tears.length,bullets:bullets.length}})});
function frame(t){
 const dt=Math.min((t-lastT)/1000,.05)||.016;lastT=t;frameCounter++;if(ready)update(dt);
 if(shake>0){shake-=dt;camera.position.x=Math.sin(t*.09)*.045;camera.lookAt(0,0,0);}else if(camera.position.x!==0){camera.position.x=0;camera.lookAt(0,0,0);}
 renderer.render(scene,camera);requestAnimationFrame(frame);
}
try{
 await Promise.all(['hero','enemy','boss','basement','props'].map(async id=>{templates[id]=await loadEmbeddedGLB(window.__ASSETS__,id);}));
 // Store the rest aim quaternion independently from animation samples.
 ready=true;ui.loading.hidden=true;ui.startButton.disabled=false;
 setOverlay('ESCAPE BASEMENT','지하실을 빠져나가세요','눈물을 쏘며 빈틈으로 피하세요. 획득한 힘으로 문지기를 쓰러뜨린 뒤, 마지막 문까지 직접 나아가세요.','지하실 들어가기');
 // Intro displays the actual room and hero, never a substituted poster.
 reset();run.phase='intro';setOverlay('ESCAPE BASEMENT','지하실을 빠져나가세요','눈물을 쏘며 빈틈으로 피하세요. 획득한 힘으로 문지기를 쓰러뜨린 뒤, 마지막 문까지 직접 나아가세요.','지하실 들어가기');updateHUD();
 requestAnimationFrame(frame);
}catch(error){console.error(error);ui.loading.hidden=true;ui.errorBanner.hidden=false;ui.errorBanner.textContent='자산을 불러오지 못했습니다: '+error.message;ui.startButton.disabled=true;}
})();
