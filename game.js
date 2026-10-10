/* Escape basement · 오예준 · actual 3D, offline, fixed-camera action prototype. */
(async function () {
'use strict';
const {THREE,cloneSkinned,loadEmbeddedGLB}=Game3D;
const $=id=>document.getElementById(id), canvas=$('gameCanvas');
const ui={}; ['hearts','coins','keys','damage','rate','objective','roomLabel','map','bigMap','timer','toast','bossHud','bossName','bossFill','bossHealth','overlay','overlayTag','overlayTitle','overlayText','overlayStats','startButton','secondaryButton','loading','errorBanner','prompt','muteButton','pauseButton'].forEach(id=>ui[id]=$(id));
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
const journal=[];const playedClips=new Set();let ready=false,muted=false,audioContext, lastT=0,run,roomModel,player,boss,exitLight,frameCounter=0;
let actors=[],tears=[],bullets=[],pickups=[],effects=[],telegraphs=[],interactables=[],decors=[],transitionLock=0,toastTime=0,shake=0;
const templates={}; const roomNames={start:'지하실 입구',combat:'먼지의 방',shop:'상점',golden:'황금의 방',boss:'문지기의 방'};
const DIRS={N:{dx:0,dy:-1,opp:'S'},S:{dx:0,dy:1,opp:'N'},E:{dx:1,dy:0,opp:'W'},W:{dx:-1,dy:0,opp:'E'}};
const SPAWN_SLOTS=[[-3,-1.2],[3,-1.5],[0,-2.8],[-2.8,2.2],[2.8,2.2],[3.6,.2],[-3.6,-.2]];
const PASSIVES=[
 {id:'red',name:'붉은 눈물',desc:'공격력 +1.5',apply:()=>{run.damage=+(run.damage+1.5).toFixed(1);}},
 {id:'blue',name:'푸른 눈물',desc:'눈물/초 +1.0',apply:()=>{run.rate=+(run.rate+1.0).toFixed(1);}},
 {id:'king',name:'왕의 눈물',desc:'공격력 +0.8 · 눈물/초 +0.6',apply:()=>{run.damage=+(run.damage+.8).toFixed(1);run.rate=+(run.rate+.6).toFixed(1);}},
 {id:'swift',name:'타는 발걸음',desc:'이동속도 +0.6',apply:()=>{run.speed=+(run.speed+.6).toFixed(2);}},
 {id:'life',name:'생명의 눈물',desc:'최대 체력 +1 · 회복 +1',apply:()=>{stats.maxHp+=1;run.hp=Math.min(stats.maxHp,run.hp+1);if(player)player.hp=run.hp;}}
];
const SHOP_ITEMS=[
 {id:'key',name:'열쇠',desc:'열쇠 +1',price:3,color:'#e2b670',apply:()=>{run.keys+=1;}},
 {id:'heart',name:'하트',desc:'체력 2 회복',price:3,color:'#ff8f8a',apply:()=>{run.hp=Math.min(stats.maxHp,run.hp+2);player.hp=run.hp;}},
 {id:'damage',name:'붉은 눈물',desc:'공격력 +0.8',price:5,color:'#e04b3a',apply:()=>{run.damage=+(run.damage+.8).toFixed(1);}},
 {id:'rate',name:'푸른 눈물',desc:'눈물/초 +0.5',price:4,color:'#5fd3e8',apply:()=>{run.rate=+(run.rate+.5).toFixed(1);}}
];
const SHOP_POS=[[-3,0],[-1,0],[1,0],[3,0]];
function neighborRoom(R,side){const d=DIRS[side];return floor&&floor.rooms.get((R.gx+d.dx)+','+(R.gy+d.dy));}
function doorLocked(R,side){const n=neighborRoom(R,side);return !!(n&&(n.type==='golden'||n.type==='shop')&&!n.unlocked);}
function nearLockedDoor(R){if(!R||!player)return null;const pos={N:[0,-3.6],S:[0,3.6],E:[5.6,0],W:[-5.6,0]};for(const side of ['N','S','E','W']){if(!R.doors[side]||!doorLocked(R,side))continue;const p=pos[side];if(length(player.x-p[0],player.z-p[1])<1.35)return side;}return null;}
let floor=null,gates={},mapZoom=false;
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
 const actor={kind,object:root,model,mixer,actions,current:'',animUntil:0,aim:model.getObjectByName('Aim'),x,z, hp:kind==='boss'?480:24,maxHp:kind==='boss'?480:24,radius:kind==='boss'?1.0:.3, cooldown:rnd(1.2,2.2),flash:0,dead:false,deathTime:0,walkingAngle:0,mode:'idle',phaseTime:0,cycle:0,attackRemaining:0,burst:0,burstTimer:0,burstAngle:0,burstSpeed:2,attackStyle:'line',lastPattern:'',chargeX:0,chargeZ:0};
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
function lightExit(x,z){
 const group=new THREE.Group();world.add(group);group.position.set(x,0,z);
 const ringM=new THREE.Mesh(new THREE.CircleGeometry(.95,40),new THREE.MeshBasicMaterial({color:'#ffe9b0',transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));ringM.rotation.x=-Math.PI/2;ringM.position.set(0,.04,.55);ringM.scale.set(1,1.2,1);group.add(ringM);
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.85,.6,5.8,24,1,true),new THREE.MeshBasicMaterial({color:'#ffe6a8',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));shaft.position.y=2.9;group.add(shaft);
 const core=new THREE.Mesh(new THREE.CylinderGeometry(.34,.22,5.8,16,1,true),new THREE.MeshBasicMaterial({color:'#fff6d8',transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));core.position.y=2.9;group.add(core);
 const beam=new THREE.Mesh(new THREE.PlaneGeometry(1.9,3.6),new THREE.MeshBasicMaterial({color:'#ffe9b0',transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));beam.rotation.x=-Math.PI/2;beam.position.set(0,.03,1.75);group.add(beam);
 const spot=new THREE.SpotLight('#ffdf95',120,16,.6,.7,1);spot.position.set(0,5.6,-.4);spot.target.position.set(0,0,1.8);group.add(spot);group.add(spot.target);
 const light=new THREE.PointLight('#ffdf95',26,12,1);light.position.set(0,2.2,.3);group.add(light);
 return {object:group,ring:ringM,shaft,core,beam,light,spot};
}
function setDoors(open){
 const R=floor&&floor.rooms.get(run.roomKey);if(!R)return;
 run.doorOpen=open;
 for(const side in gates)gates[side].userData.targetY=(open&&(R.doors[side]||(R.type==='boss'&&side==='N'))&&!doorLocked(R,side))?1.9:0;
 if(open)sound('gate');
 updateHUD();
}
function objective(){
 if(!run)return'지하실에서 살아남기';
 if(run.phase==='dead')return'다시 도전할 수 있습니다';
 if(run.phase==='won')return'지하실 탈출 완료';
 const R=floor&&floor.rooms.get(run.roomKey);if(!R)return'지하실을 탐험하세요';
 if(R.type==='combat'&&!R.cleared){const n=actors.filter(a=>a.kind==='enemy'&&!a.dead).length;return n>0?'적을 모두 처치하기 · 남은 적 '+n:'적을 모두 처치하기';}
 if(R.type==='boss'){if(!R.cleared)return'문지기를 쓰러뜨리기';return run.portalReady?'북쪽 빛의 문으로 탈출':'문지기가 쓰러졌습니다';}
 if(R.type==='shop')return'코인으로 아이템을 구매하세요';
 if(R.type==='golden')return R.used?'문을 통해 다른 방으로':'황금 제단 · 패시브 아이템 획득';
 if(R.type==='start')return'문을 열고 방을 탐험하세요';
 return'문을 통해 다른 방으로';
}
function generateFloor(){
 const cells=[[0,0]],rooms=new Map(),key=(x,y)=>x+','+y;
 rooms.set('0,0',{key:'0,0',gx:0,gy:0,type:'start',visited:false,cleared:false,doors:{},depth:0,lootInit:false});
 const target=9;
 while(cells.length<target){
  const [cx,cy]=cells[Math.floor(Math.random()*cells.length)],sides=Object.keys(DIRS),d=DIRS[sides[Math.floor(Math.random()*sides.length)]],nx=cx+d.dx,ny=cy+d.dy;
  if(rooms.has(key(nx,ny))||Math.abs(nx)>3||Math.abs(ny)>3)continue;
  rooms.set(key(nx,ny),{key:key(nx,ny),gx:nx,gy:ny,type:'combat',visited:false,cleared:false,doors:{},depth:0,lootInit:false});
  cells.push([nx,ny]);
 }
 const seen=new Set(['0,0']),queue=[['0,0',0]];
 while(queue.length){const [k,d]=queue.shift(),r=rooms.get(k);r.depth=d;
  for(const s in DIRS){const nk=key(r.gx+DIRS[s].dx,r.gy+DIRS[s].dy);if(rooms.has(nk)&&!seen.has(nk)){seen.add(nk);queue.push([nk,d+1]);}}}
 let bossKey='0,0',bossDepth=-1;for(const r of rooms.values())if(r.key!=='0,0'&&r.depth>bossDepth){bossDepth=r.depth;bossKey=r.key;}
 rooms.get(bossKey).type='boss';
 let shop=null;
 for(const r of rooms.values()){if(r.key==='0,0'||r.key===bossKey||r.depth<2)continue;let deg=0;for(const s in DIRS)if(rooms.has(key(r.gx+DIRS[s].dx,r.gy+DIRS[s].dy)))deg++;
  if(deg===1&&(!shop||r.depth>shop.depth))shop=r;}
 if(!shop)for(const r of rooms.values())if(r.key!=='0,0'&&r.key!==bossKey&&(!shop||r.depth>shop.depth))shop=r;
 if(shop){shop.type='shop';shop.unlocked=false;}
 let golden=null;
 for(const r of rooms.values()){if(r.key==='0,0'||r.key===bossKey||r===shop||r.depth<2)continue;let deg=0;for(const s in DIRS)if(rooms.has(key(r.gx+DIRS[s].dx,r.gy+DIRS[s].dy)))deg++;
  if(deg===1&&(!golden||r.depth>golden.depth))golden=r;}
 if(!golden)for(const r of rooms.values())if(r.key!=='0,0'&&r.key!==bossKey&&r!==shop&&r.type==='combat'&&(!golden||r.depth>golden.depth))golden=r;
 if(golden){golden.type='golden';golden.unlocked=false;golden.used=false;golden.passive=PASSIVES[Math.floor(Math.random()*PASSIVES.length)].id;}
 for(const r of rooms.values())for(const s in DIRS)if(rooms.has(key(r.gx+DIRS[s].dx,r.gy+DIRS[s].dy)))r.doors[s]=true;
 let minX=0,maxX=0,minY=0,maxY=0;for(const r of rooms.values()){minX=Math.min(minX,r.gx);maxX=Math.max(maxX,r.gx);minY=Math.min(minY,r.gy);maxY=Math.max(maxY,r.gy);}
 return {rooms,startKey:'0,0',bossKey,minX,maxX,minY,maxY};
}
function spawnEnemies(R){
 const count=2+Math.min(2,Math.max(0,R.depth-1));
 const slots=SPAWN_SLOTS.slice().sort((a,b)=>length(player.x-b[0],player.z-b[1])-length(player.x-a[0],player.z-a[1])).slice(0,count);
 for(const p of slots){const e=makeActor('enemy',p[0],p[1],.75);e.hp=e.maxHp=24;e.style=R.depth%2;e.shotSpeed=1.7+Math.min(1.0,Math.max(0,R.depth-1)*.12);e.cooldown=1.5+Math.random()*.8;}
 log('spawn_room',{room:R.key,count:slots.length});toast('적이 나타났습니다 · 모두 처치하세요',2);
}
function fillMap(el,cw){
 if(!floor||!el)return;
 const cols=floor.maxX-floor.minX+1;el.style.gridTemplateColumns='repeat('+cols+','+cw+'px)';el.innerHTML='';
 const discovered=new Set();
 for(const r of floor.rooms.values()){if(!r.visited)continue;for(const s in DIRS){const nk=(r.gx+DIRS[s].dx)+','+(r.gy+DIRS[s].dy);if(floor.rooms.has(nk))discovered.add(nk);}}
 for(let y=floor.minY;y<=floor.maxY;y++)for(let x=floor.minX;x<=floor.maxX;x++){
  const r=floor.rooms.get(x+','+y),c=document.createElement('span');c.className='cell';
  const known=r&&(r.visited||discovered.has(r.key));
  if(!known){c.classList.add('void');}
  else{
   c.classList.add('known');if(r.type==='boss')c.classList.add('boss');if(r.type==='shop')c.classList.add('shop');if(r.type==='golden')c.classList.add('golden');
   if(r.cleared&&r.type!=='start')c.classList.add('cleared');
   if(r.key===run.roomKey)c.classList.add('active');
   if(r.visited||r.type!=='combat')c.textContent=r.type==='boss'?'왕':r.type==='shop'?'상':r.type==='golden'?'금':r.type==='start'?'출':'';
  }
  el.appendChild(c);
 }
}
function renderMap(){fillMap(ui.map,22);if(mapZoom)fillMap(ui.bigMap,46);}
function setMapZoom(on){
 mapZoom=!!on&&!!(run&&run.phase==='playing');
 ui.bigMap.hidden=!mapZoom;
 if(mapZoom)fillMap(ui.bigMap,46);
}
function saveRoomLoot(){
 if(!run||!run.roomKey||!floor)return;const R=floor.rooms.get(run.roomKey);if(!R)return;
 R.leftPickups=pickups.map(p=>({type:p.type,x:p.x,z:p.z,value:p.value}));
}
function enterRoom(key,entrySide){
 saveRoomLoot();
 clearLists();gates={};exitLight=null;
 run.roomKey=key;run.doorOpen=false;run.portalReady=false;run.clearWait=0;transitionLock=.8;
 const R=floor.rooms.get(key);R.visited=true;
 if(roomModel)remove(roomModel);roomModel=templates.basement.scene.clone(true);
 roomModel.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=false;}});world.add(roomModel);
 if(R.type==='golden'){
  const goldTint=new THREE.Color('#e8bb45');
  roomModel.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){if(m.color)m.color.lerp(goldTint,.5);if(m.emissive)m.emissive.setHex(0x33230a);if('emissiveIntensity' in m)m.emissiveIntensity=.5;}}});
  const glow=new THREE.PointLight('#ffd76a',30,14,1);glow.position.set(0,3.2,0);world.add(glow);decors.push(glow);
 }
 const gateNames={N:'Basement_Gate_North_Proposed',E:'Basement_Gate_East_Proposed',W:'Basement_Gate_West_Proposed'};
 for(const side in gateNames){const g=roomModel.getObjectByName(gateNames[side]);if(g){g.userData.originalY=g.position.y;g.userData.targetY=0;gates[side]=g;}}
 if(R.doors.S){const t=roomModel.getObjectByName('Basement_Threshold_North');if(t){const s=t.clone(true);s.position.set(0,t.position.y,3.94);s.rotation.y=Math.PI;roomModel.add(s);}}
 const spawnTable={S:{x:0,z:2.6,a:Math.PI},N:{x:0,z:-2.6,a:0},E:{x:4.6,z:0,a:-Math.PI/2},W:{x:-4.6,z:0,a:Math.PI/2}};
 const sp=(entrySide&&spawnTable[entrySide])||{x:0,z:2.5,a:Math.PI};
 player=makeActor('hero',sp.x,sp.z,.53);player.hp=run.hp;player.radius=.22;player.shotTimer=0;player.invulnerable=.8;player.aimDir={x:0,z:-1};player.walkingAngle=sp.a;
 player.object.rotation.y=sp.a;
 if(R.leftPickups){for(const p of R.leftPickups)addPickup(p.type,p.x,p.z,p.value);R.leftPickups=undefined;}
 if(R.type==='combat'&&!R.cleared)spawnEnemies(R);
 else if(R.type==='shop'){
  R.shopBought=R.shopBought||{};
  SHOP_ITEMS.forEach((item,i)=>{const pos=SHOP_POS[i]||[0,0],s=jewel(pos[0],pos[1],item.color);s.kind='shop';s.item=item.id;s.used=!!R.shopBought[item.id];if(s.used)s.gem.material.color.set('#3d5855');interactables.push(s);});
  toast('상점 · 코인으로 아이템을 구매하세요 (E)',4);
 }
 else if(R.type==='golden'){
  const g2=jewel(0,0,'#e2b670');g2.kind='passive';g2.passive=R.passive;g2.used=!!R.used;if(R.used)g2.gem.material.color.set('#6b5a3a');interactables.push(g2);
  if(!R.used)toast('황금의 방 · 제단의 아이템을 획득하세요',4);
 }
 else if(R.type==='boss'){
  exitLight=lightExit(0,-3.75);exitLight.object.visible=false;decors.push(exitLight.object);
  if(R.cleared){run.portalReady=true;exitLight.object.visible=true;}
  else{boss=makeActor('boss',-sp.x*.6,-sp.z*.6,.82);boss.object.rotation.y=Math.atan2(player.x-boss.x,player.z-boss.z);boss.phaseTime=2.2;boss.mode='rest';toast('황금 점선은 예고, 붉은 탄만 피해를 줍니다',4);}
 }
 ui.bossHud.hidden=R.type!=='boss'||R.cleared;
 ui.roomLabel.textContent=roomNames[R.type];
 setDoors(R.type==='start'||R.type==='shop'||R.type==='golden'||R.cleared);
 renderMap();log('enter_room',{room:key,type:R.type});updateHUD();
}
function reset(){
 if(audioContext)audioContext.resume();
 run={phase:'playing',time:0,roomKey:null,hp:6,coins:0,keys:0,damage:3,rate:2.2,speed:stats.speed,kills:0,hits:0,shots:0,bossDefeated:false,doorOpen:false,portalReady:false,clearWait:0};
 stats.maxHp=6;stats.speed=2.5;
 journal.length=0;playedClips.clear();input.keys.clear();input.mouseDown=false;input.mouseActive=false;ui.overlay.hidden=true;ui.pauseButton.textContent='일시정지';ui.prompt.hidden=true;floor=generateFloor();enterRoom(floor.startKey,null);log('run_start',{hp:6,damage:3,rate:2.2,rooms:floor.rooms.size});
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
   run.bossDefeated=true;if(floor)floor.rooms.get(run.roomKey).cleared=true;bullets.forEach(b=>remove(b.object));bullets=[];telegraphs.forEach(t=>remove(t.object));telegraphs=[];toast('문지기가 쓰러졌습니다 · 잠시 후 탈출구가 열립니다',5);log('boss_defeated',{room:run.roomKey});sound('gate');renderMap();
  }else{addPickup('coin',e.x,e.z,1);if(Math.random()<.6)addPickup('coin',e.x+.45,e.z,1);if(Math.random()<.18)addPickup('heart',e.x+.4,e.z,2);if(Math.random()<.3)addPickup('key',e.x-.4,e.z,1);log('enemy_defeated',{room:run.roomKey});}
 }else if(e.kind==='enemy'){play(e,'Hit',.18);}else if(e.mode==='rest'&&e.animUntil<=0){play(e,'Hit',.22);}
}
function collect(){
 for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];if(length(player.x-p.x,player.z-p.z)>.43)continue;
   if(p.type==='heart'&&run.hp>=stats.maxHp)continue;
   if(p.type==='coin'){run.coins+=p.value;toast('코인 +1',1.3);}
   if(p.type==='key'){run.keys+=p.value;toast('열쇠 +1 · 잠긴 문을 열 수 있습니다',2);}
   if(p.type==='heart'){const old=run.hp;run.hp=Math.min(stats.maxHp,run.hp+p.value);player.hp=run.hp;toast('하트 · 체력 '+old+' → '+run.hp,2);log('heal',{before:old,after:run.hp});}
   log('pickup',{type:p.type,coins:run.coins,keys:run.keys,hp:run.hp});sound('pickup');remove(p.object);pickups.splice(i,1);
 }
}
function nearInteraction(){return interactables.find(i=>!i.used&&length(player.x-i.x,player.z-i.z)<.95);}
function interact(){
 if(!run||run.phase!=='playing')return;
 const room=floor.rooms.get(run.roomKey),side=run.doorOpen?nearLockedDoor(room):null;
 if(side){
  const nb=neighborRoom(room,side),label=nb.type==='golden'?'황금의 문':'상점 문';
  if(run.keys<1){toast(label+' · 열쇠 1개가 필요합니다',2);return;}
  run.keys--;nb.unlocked=true;setDoors(run.doorOpen);renderMap();toast('열쇠를 사용해 '+label+'을 열었습니다',3);log('unlock',{room:room.key,side,type:nb.type});updateHUD();return;
 }
 const it=nearInteraction();if(!it)return;
 if(it.kind==='shop'){
  const si=SHOP_ITEMS.find(v=>v.id===it.item)||SHOP_ITEMS[0];
  if(run.coins<si.price){toast(si.name+' · 코인 '+si.price+'개 필요 ('+run.coins+'/'+si.price+')',2.2);return;}
  run.coins-=si.price;si.apply();it.used=true;room.shopBought=room.shopBought||{};room.shopBought[si.id]=true;it.gem.material.color.set('#3d5855');
  toast(si.name+' 구매 · '+si.desc+' (코인 -'+si.price+')',4);log('shop_buy',{id:si.id,price:si.price,coins:run.coins});sound('pickup');
 }else if(it.kind==='passive'){
  const p=PASSIVES.find(v=>v.id===it.passive)||PASSIVES[0];p.apply();it.used=true;room.used=true;remove(it.object);
  toast(p.name+' 획득 · '+p.desc,4);log('passive_get',{id:p.id,damage:run.damage,rate:run.rate});sound('pickup');
 }
 updateHUD();
}
function telegraphBoss(){
 const opts=['fan','ring','line','charge'].filter(p=>p!==boss.lastPattern);boss.pattern=opts[Math.floor(Math.random()*opts.length)];boss.lastPattern=boss.pattern;boss.cycle++;
 boss.mode='windup';boss.phaseTime=boss.pattern==='charge'?.8:.95;
 boss.targetAngle=Math.atan2(player.x-boss.x,player.z-boss.z);play(boss,'Windup',boss.phaseTime);
 if(boss.pattern==='fan'){boss.fanCount=7+Math.floor(Math.random()*5);boss.fanSpread=1.3+Math.random()*.7;}
 if(boss.pattern==='ring'){boss.ringCount=16+Math.floor(Math.random()*9);boss.ringGap=.4+Math.random()*.3;}
 if(boss.pattern==='line')boss.lineCount=4+Math.floor(Math.random()*4);
 const g=new THREE.Group();world.add(g);g.position.set(boss.x,.045,boss.z);
 const dot=(a,r,s=.037)=>{const d=new THREE.Mesh(new THREE.CircleGeometry(s,6),new THREE.MeshBasicMaterial({color:'#e2b670',transparent:true,opacity:.72,side:THREE.DoubleSide}));d.rotation.x=-Math.PI/2;d.position.set(Math.sin(a)*r,0,Math.cos(a)*r);g.add(d);};
 if(boss.pattern==='line'){
  for(let r=1.15;r<=3.55;r+=.45)dot(boss.targetAngle,r);
 }else if(boss.pattern==='charge'){
  for(let r=.9;r<=4.4;r+=.4)dot(boss.targetAngle,r,.06);
 }else if(boss.pattern==='fan'){
  for(let i=0;i<boss.fanCount;i++){const a=boss.targetAngle-boss.fanSpread/2+i*boss.fanSpread/(boss.fanCount-1);for(let r=1.25;r<2.5;r+=.5)dot(a,r);}
 }else{
  for(let i=0;i<boss.ringCount;i++){const a=i*TAU/boss.ringCount;if(Math.abs(Math.atan2(Math.sin(a-boss.targetAngle),Math.cos(a-boss.targetAngle)))<boss.ringGap)continue;for(let r=1.25;r<2.5;r+=.5)dot(a,r);}
 }
 telegraphs.push({object:g,time:boss.phaseTime});
 toast(boss.pattern==='fan'?'전조 · 부채꼴의 옆으로':boss.pattern==='ring'?'전조 · 점선이 없는 틈을 찾으세요':boss.pattern==='line'?'전조 · 일직선에서 벗어나세요':'전조 · 돌진 경로에서 벗어나세요',1.5);
 log('boss_telegraph',{pattern:boss.pattern,damage:false});
}
function fireBoss(){
 const speed=boss.hp<boss.maxHp*.5?2.5:2.15;
 if(boss.pattern==='fan'){
  for(let i=0;i<boss.fanCount;i++)enemyBullet(boss.x,boss.z,boss.targetAngle-boss.fanSpread/2+i*boss.fanSpread/(boss.fanCount-1),speed,'boss_fan');
  boss.attackRemaining=1;
 }else if(boss.pattern==='ring'){
  for(let i=0;i<boss.ringCount;i++){const a=i*TAU/boss.ringCount;if(Math.abs(Math.atan2(Math.sin(a-boss.targetAngle),Math.cos(a-boss.targetAngle)))<boss.ringGap)continue;enemyBullet(boss.x,boss.z,a,speed*.88,'boss_ring');}
  boss.attackRemaining=0;
 }else if(boss.pattern==='line'){
  boss.burst=boss.lineCount-1;boss.burstTimer=.10;boss.burstAngle=boss.targetAngle;boss.burstSpeed=speed*1.2;enemyBullet(boss.x,boss.z,boss.targetAngle,boss.burstSpeed,'boss_line');boss.attackRemaining=0;
 }else{
  boss.chargeX=clamp(player.x,-4.6,4.6);boss.chargeZ=clamp(player.z,-2.7,2.7);boss.attackRemaining=0;
 }
 play(boss,'FanAttack',.667);boss.mode=boss.pattern==='charge'?'charge':'attack';boss.phaseTime=boss.pattern==='charge'?1.15:(boss.pattern==='line'?.85:.70);boss.secondTime=.38;sound('boss');log('boss_attack',{pattern:boss.pattern});
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
  if(boss.burst>0){boss.burstTimer-=dt;if(boss.burstTimer<=0){enemyBullet(boss.x,boss.z,boss.burstAngle,boss.burstSpeed,'boss_line');boss.burst--;boss.burstTimer=.10;log('boss_line_shot',{x:+boss.x.toFixed(2),z:+boss.z.toFixed(2)});}}
  if(boss.attackRemaining&&boss.secondTime<=0){for(let i=0;i<8;i++)enemyBullet(boss.x,boss.z,boss.targetAngle-.74+i*1.48/7,1.95,'boss_fan_second');boss.attackRemaining=0;}
  if(boss.phaseTime<=0){boss.mode='rest';boss.phaseTime=boss.hp<boss.maxHp*.5?1.45:1.9;}
 }
 else if(boss.mode==='charge'){
  const dx=boss.chargeX-boss.x,dz=boss.chargeZ-boss.z,d=length(dx,dz);
  if(d<.18||boss.phaseTime<=0){boss.mode='rest';boss.phaseTime=boss.hp<boss.maxHp*.5?1.2:1.6;}
  else{const step=Math.min(d,7.2*dt);boss.x+=dx/d*step;boss.z+=dz/d*step;boss.object.rotation.y=Math.atan2(dx,dz);}
 }
 if(length(player.x-boss.x,player.z-boss.z)<boss.radius+player.radius)takeDamage('boss_contact');
}
function updateEnemy(e,dt){
 if(e.dead)return;const d=norm(player.x-e.x,player.z-e.z),dist=length(player.x-e.x,player.z-e.z);
 let vx=0,vz=0;if(dist>2.3){vx=d.x*.53;vz=d.z*.53;}else if(dist<1.5){vx=-d.x*.28;vz=-d.z*.28;}
 vx+=Math.sin(run.time*1.5+e.x)*.12;
 e.x=clamp(e.x+vx*dt,-5,5);e.z=clamp(e.z+vz*dt,-2.85,2.85);e.object.rotation.y=Math.atan2(d.x,d.z);
 e.cooldown-=dt;
 if(e.burst>0){e.burstTimer-=dt;if(e.burstTimer<=0){enemyBullet(e.x,e.z,e.burstAngle,e.burstSpeed,'enemy_line');e.burst--;e.burstTimer=.11;log('enemy_line_shot',{x:+e.x.toFixed(2),z:+e.z.toFixed(2)});}}
 if(e.cooldown<=.35&&e.cooldown>0&&e.animUntil<=0)play(e,'Attack',.35);
 if(e.cooldown<=0&&e.burst===0){
  const angle=Math.atan2(d.x,d.z),pool=['spread','line','ring'].filter(s=>s!==e.attackStyle);e.attackStyle=pool[Math.floor(Math.random()*pool.length)];
  if(e.attackStyle==='line'){e.burst=3;e.burstTimer=0;e.burstAngle=angle;e.burstSpeed=(e.shotSpeed||1.7)*1.5;play(e,'Attack',.35);log('enemy_line',{x:+e.x.toFixed(2),z:+e.z.toFixed(2)});}
  else if(e.attackStyle==='ring'){for(let i=0;i<6;i++)enemyBullet(e.x,e.z,i*TAU/6,1.45,'enemy_ring');play(e,'Attack',.35);log('enemy_ring',{x:+e.x.toFixed(2),z:+e.z.toFixed(2)});}
  else{for(const a of [-.19,0,.19])enemyBullet(e.x,e.z,angle+a,e.shotSpeed||1.7,'enemy');log('enemy_shot',{x:e.x,z:e.z});}
  e.cooldown=2.0+rnd(0,.5);
 }
 if(e.animUntil<=0)play(e,length(vx,vz)>.2?'Move':'Idle');
 if(dist<e.radius+player.radius)takeDamage('enemy_contact');
}
function updatePlayer(dt){
 player.invulnerable=Math.max(0,player.invulnerable-dt);
 const moving=norm((input.keys.has('KeyD')?1:0)-(input.keys.has('KeyA')?1:0),(input.keys.has('KeyS')?1:0)-(input.keys.has('KeyW')?1:0));
 const speed=run.speed||stats.speed,room=floor.rooms.get(run.roomKey);
 let xMin=-5.45,xMax=5.45,zMin=-3.45,zMax=3.3;
 if(run.doorOpen){
  if(room.doors.N&&!doorLocked(room,'N')&&Math.abs(player.x)<.75)zMin=-4.5;
  if(room.doors.S&&!doorLocked(room,'S')&&Math.abs(player.x)<.75)zMax=4.2;
  if(room.doors.E&&!doorLocked(room,'E')&&Math.abs(player.z)<.75)xMax=6.3;
  if(room.doors.W&&!doorLocked(room,'W')&&Math.abs(player.z)<.75)xMin=-6.3;
 }
 if(room.type==='boss'&&run.portalReady&&Math.abs(player.x)<.75)zMin=-4.5;
 player.x=clamp(player.x+moving.x*dt*speed,xMin,xMax);player.z=clamp(player.z+moving.z*dt*speed,zMin,zMax);
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
  const it=nearInteraction(),locked=run.doorOpen?nearLockedDoor(room):null;
  ui.prompt.hidden=!it&&!locked;
  if(it){
   if(it.kind==='shop'){const si=SHOP_ITEMS.find(v=>v.id===it.item)||SHOP_ITEMS[0];ui.prompt.textContent='E · '+si.name+' · '+si.desc+' ('+si.price+' 코인)';}
   else ui.prompt.textContent='E · '+((PASSIVES.find(v=>v.id===it.passive)||PASSIVES[0]).name)+' 획득';
  }
   else if(locked){const label=neighborRoom(room,locked).type==='golden'?'황금의 문':'상점 문';ui.prompt.textContent=run.keys>0?'E · 열쇠 1개로 '+label+' 열기':label+' · 열쇠 1개 필요';}
   if(transitionLock<=0){
    if(room.type==='boss'&&run.portalReady&&player.z<-3.9&&Math.abs(player.x)<.75)win();
    else if(run.doorOpen){
     let dir=null;
     if(room.doors.N&&player.z<-3.9&&Math.abs(player.x)<.75)dir='N';
     else if(room.doors.S&&player.z>3.75&&Math.abs(player.x)<.75)dir='S';
     else if(room.doors.E&&player.x>5.8&&Math.abs(player.z)<.75)dir='E';
     else if(room.doors.W&&player.x<-5.8&&Math.abs(player.z)<.75)dir='W';
     if(dir){const d=DIRS[dir],next=floor.rooms.get((room.gx+d.dx)+','+(room.gy+d.dy));if(next)enterRoom(next.key,d.opp);}
    }
   }
}
function win(){
 if(!run.portalReady||run.hp<=0)return;run.phase='won';log('exit_crossed',{hp:run.hp});
 sound('pickup');setOverlay('ESCAPED','지하실 밖으로','문지기를 쓰러뜨리고 빛이 쏟아지는 탈출구로 빠져나왔습니다.','다시 도전',true);updateHUD();
}
function updateHUD(){
 if(!run)return;
 ui.hearts.innerHTML=Array.from({length:stats.maxHp},(_,i)=>'<span class="heart '+(i<run.hp?'':'empty')+'">♥</span>').join('');
 ui.hearts.setAttribute('aria-label','체력 '+run.hp+' / '+stats.maxHp);
 ui.coins.textContent=String(run.coins).padStart(2,'0');ui.keys.textContent=String(run.keys).padStart(2,'0');ui.damage.textContent=run.damage.toFixed(1);ui.rate.textContent=run.rate.toFixed(1)+'/s';
 ui.objective.textContent=objective();ui.timer.textContent=formatTime(run.time);
 ui.bossHud.hidden=!(boss&&!boss.dead);
 if(boss&&!boss.dead){ui.bossFill.style.width=(boss.hp/boss.maxHp*100)+'%';ui.bossHealth.textContent=Math.ceil(boss.hp)+' / '+boss.maxHp;ui.bossName.textContent='문지기';}
 document.body.dataset.phase=run.phase;document.body.dataset.room=String(run.roomKey);
}
function update(dt){
 if(!run)return;
 if(mapZoom&&run.phase!=='playing')setMapZoom(false);
 if(run.phase==='dying'){
   updateActor(player,dt);if(player.deathTime>1.25){run.phase='dead';setOverlay('LOST IN THE BASEMENT','다시, 숨을 고르고','이동은 WASD, 사격은 방향키. 쏘는 방향을 유지한 채 옆으로 피할 수 있어요.','처음부터 다시',true);updateHUD();}
   return;
 }
 if(run.phase!=='playing')return;
 run.time+=dt;transitionLock=Math.max(0,transitionLock-dt);
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
  for(let i=actors.length-1;i>=0;i--){const a=actors[i];if(a===player||!a.dead)continue;if(a.kind==='boss'){if(a.deathTime>1.6&&!run.portalReady){run.portalReady=true;if(exitLight)exitLight.object.visible=true;setDoors(true);renderMap();toast('북쪽 문에서 빛이 쏟아집니다 · 빛 속으로 걸어가세요',5);log('portal_open',{room:run.roomKey});}}else if(a.deathTime>1.15){remove(a.object);actors.splice(i,1);}}
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.time-=dt;e.object.scale.multiplyScalar(1+dt*3);if(e.time<=0){remove(e.object);effects.splice(i,1);}}
 for(let i=telegraphs.length-1;i>=0;i--){telegraphs[i].time-=dt;if(telegraphs[i].time<=0){remove(telegraphs[i].object);telegraphs.splice(i,1);}}
 for(const p of pickups){p.age+=dt;p.object.position.y=p.base+Math.sin(p.age*3)*.04;}
 for(const it of interactables)if(it.gem&&!it.used)it.gem.rotation.y+=dt*.65;
 const room=floor.rooms.get(run.roomKey);
 if(room.type==='combat'&&!room.cleared&&!actors.some(a=>a.kind==='enemy'&&!a.dead)){
  run.clearWait+=dt;if(run.clearWait>0.9){run.clearWait=0;room.cleared=true;setDoors(true);renderMap();toast('방을 정리했습니다 · 문이 열렸습니다',3);log('room_cleared',{room:room.key});}
 }else run.clearWait=0;
 for(const side in gates){const g=gates[side];g.position.y+=(g.userData.originalY+g.userData.targetY-g.position.y)*Math.min(1,dt*3.5);}
 if(exitLight&&exitLight.object.visible){const g=exitLight,pulse=.5+Math.sin(run.time*3)*.5;g.shaft.rotation.y+=dt*.5;g.core.rotation.y-=dt*.8;g.ring.material.opacity=.2+pulse*.28;g.beam.material.opacity=.08+pulse*.08;g.shaft.material.opacity=.12+pulse*.08;g.core.material.opacity=.2+pulse*.14;g.light.intensity=20+pulse*14;g.spot.intensity=110+pulse*60;}
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
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape','KeyW','KeyA','KeyS','KeyD','KeyE','Tab'].includes(e.code))e.preventDefault();
 if(e.code==='Tab'){if(!e.repeat)setMapZoom(true);return;}
 if(e.code==='Escape'&&!e.repeat){pause();return;}if(!run||run.phase!=='playing')return;
 input.keys.add(e.code);if(e.code.startsWith('Arrow')){input.lastArrow=e.code;input.mouseActive=false;}
 if(e.code==='KeyE'&&!e.repeat)interact();
});
window.addEventListener('keyup',e=>{if(e.code==='Tab'){setMapZoom(false);return;}input.keys.delete(e.code);});
window.addEventListener('blur',()=>{input.keys.clear();input.mouseDown=false;setMapZoom(false);if(run?.phase==='playing')pause();});
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
 setOverlay('ESCAPE BASEMENT','지하실을 빠져나가세요','방을 하나씩 정리하며 지도를 탐험하세요. 문지기를 쓰러뜨린 뒤, 열리는 균열로 탈출하세요.','지하실 들어가기');
 // Intro displays the actual room and hero, never a substituted poster.
 reset();run.phase='intro';setOverlay('ESCAPE BASEMENT','지하실을 빠져나가세요','방을 하나씩 정리하며 지도를 탐험하세요. 문지기를 쓰러뜨린 뒤, 열리는 균열로 탈출하세요.','지하실 들어가기');updateHUD();
 requestAnimationFrame(frame);
}catch(error){console.error(error);ui.loading.hidden=true;ui.errorBanner.hidden=false;ui.errorBanner.textContent='자산을 불러오지 못했습니다: '+error.message;ui.startButton.disabled=true;}
})();
