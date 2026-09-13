import * as THREE from './three.module.js';
const $=id=>document.getElementById(id),TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mod=(x,n)=>((x%n)+n)%n,lerp=(a,b,t)=>a+(b-a)*t;
const palette=[0xff7946,0x6af0c0,0xbd9bff,0xffe373,0x65b9ff,0xff8ab6,0xf4f6f5,0xea6157];
const colorNames=['TANGERINE','MINT','LILAC','SUNSHINE'];
const names=['YOU','NOVA','MILO','LUNA','RIO','PIP','SKYE','BEAU'];
const courses=[
{name:'Coral Coast',jp:'コーラル・コースト',sky:0x89cfdd,fog:0x9cd9de,ground:0x6cbb7e,road:0x394e60,edge:0xfff0cf,water:0x319db7,accent:0xff8862,points:[[0,0,0],[110,6,15],[225,10,-85],[245,6,-230],[135,2,-310],[5,9,-260],[-100,18,-310],[-245,8,-230],[-255,2,-80],[-145,0,30]]},
{name:'Sunset Mesa',jp:'サンセット・メサ',sky:0xf2bda2,fog:0xf2c6ac,ground:0xcc855f,road:0x654f58,edge:0xffda8b,water:0xc87971,accent:0xffd376,points:[[0,0,0],[120,9,-25],[225,30,-120],[160,40,-210],[230,21,-320],[90,7,-380],[-70,16,-290],[-190,32,-340],[-270,12,-200],[-160,3,-100],[-170,0,15]]},
{name:'Starlight Pass',jp:'スターライト・パス',sky:0x13234c,fog:0x293557,ground:0x444977,road:0x303858,edge:0x90bfff,water:0x263966,accent:0xc29fff,points:[[0,12,0],[135,28,-5],[245,38,-105],[135,26,-185],[210,44,-300],[50,38,-365],[-80,20,-245],[-240,35,-325],[-285,27,-160],[-175,10,-115],[-210,8,15],[-85,14,65]]}
];
let renderer,scene,camera,world,curve,length=1,frames=[],racers=[],boxes=[],coins=[],pads=[],ramps=[],hazards=[],particles=[],projectiles=[];
let mode='menu',selectedTrack=0,selectedColor=0,time=0,count=0,lastCount='',elapsed=0,toastTime=0,aiDifficulty=1,boost=0,drift=0,drifting=false,steer=0,heldItem=null,roulette=0,shield=0,stun=0,air=0,airV=0,lapStart=0,lastLap=1,finishTime=0;
let keys={},audioContext,motor,motorGain,soundOn=false,menuAngle=0,last=0,camPos=new THREE.Vector3(),camLook=new THREE.Vector3(),finishOrder=[],lastNote=0;
const clock=new THREE.Clock(),mapCtx=$('map').getContext('2d'),touch=matchMedia('(pointer:coarse)').matches;
if(touch)document.body.classList.add('touch-device');

const kartTypes=[
 {name:'SPRINT',role:'バランス型',class:'ALL-ROUNDER',description:'素直なハンドリング。どのコースでも頼れる相棒。',speed:102,accel:44,handling:13,charge:1,stats:[75,75,75]},
 {name:'COMET',role:'最高速重視',class:'SPEED SPECIALIST',description:'直線を支配する最高速。立ち上がりが勝負を分ける。',speed:109,accel:35,handling:11,charge:.92,stats:[96,55,60]},
 {name:'MISTRAL',role:'ドリフト重視',class:'CORNER ARTIST',description:'軽快な旋回と鋭い加速。ドリフトでコーナーを制する。',speed:97,accel:54,handling:15,charge:1.22,stats:[60,95,96]}
];
let selectedKart=0,gameMode='single',autoGas=false,quality='auto',viewMode=0,lateralSpeed=0,hop=0,hopV=0;
let gpRound=0,gpPoints=Array(8).fill(0),gpWins=Array(8).fill(0),gpFinished=false,finalOrder=[];
let lapTimes=[],driftCount=0,trickCount=0,coinTotal=0,comboCount=0,comboTimer=0,draftCharge=0,draftCooldown=0,trickDone=false,trickSpin=0,invulnerable=0,hitFlash=0,shake=0;
let trialBoosts=3,ghostModel=null,ghostRecord=null,ghostSamples=[],ghostClock=0,ghostIndex=0,ghostDistanceIndex=0,bestBefore=null,resultDelay=0,rankPrevious=8,rankFlash=0,accumulator=0,hudClock=0;
let atmosphere=null,skyMaterial=null,waterMaterial=null,auroraMaterial=null,ambientLight=null,sunLight=null,animatedObjects=[],shadowDiscs=[],skidSegments=[],garageScene=null,garageCamera=null,garageModel=null,garageFloor=null;
let padKeys={},gamepadPrevious={},fxWidth=0,fxHeight=0,reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
let fxContext=$('fx').getContext('2d'),mapBounds=null,bannerTime=0,helpPaused=false,frameAverage=1/60,autoLow=false;
const pointsTable=[15,12,10,8,6,4,2,1];
function pressed(k){return !!(keys[k]||padKeys[k])}
function rand(i){return mod(Math.sin(i*127.1+selectedTrack*311.7)*43758.5453,1)}

const materialCache=new Map();
function mat(color,emissive=false){let key=color+':'+emissive;if(!materialCache.has(key))materialCache.set(key,new THREE.MeshStandardMaterial({color,roughness:.7,metalness:.08,emissive:emissive?color:0,emissiveIntensity:emissive?.55:0}));return materialCache.get(key)}
const unitBox=new THREE.BoxGeometry(1,1,1),ball=new THREE.SphereGeometry(1,12,8),cylinder=new THREE.CylinderGeometry(1,1,1,10),cone=new THREE.ConeGeometry(1,1,7);
function mesh(g,c,parent,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(g,mat(c));m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m}
function box(c,parent,x,y,z,sx,sy,sz){return mesh(unitBox,c,parent,x,y,z,sx,sy,sz)}
function sphere(c,parent,x,y,z,sx,sy=sx,sz=sx){return mesh(ball,c,parent,x,y,z,sx,sy,sz)}
function sample(distance,lane=0){const v=mod(distance,length)/length*frames.length,idx=Math.floor(v),a=frames[idx],b=frames[(idx+1)%frames.length],f=v-idx;const tangent=a.t.clone().lerp(b.t,f).normalize();const normal=new THREE.Vector3(tangent.z,0,-tangent.x).normalize();return{p:a.p.clone().lerp(b.p,f).addScaledVector(normal,lane),t:tangent,n:normal,yaw:Math.atan2(tangent.x,tangent.z)}}
const tireGeometry=new THREE.CylinderGeometry(1,1,1,16),torusGeometry=new THREE.TorusGeometry(1,.12,6,18);
const roundedShape=new THREE.Shape();roundedShape.moveTo(-.4,-.5);roundedShape.lineTo(.4,-.5);roundedShape.quadraticCurveTo(.5,-.5,.5,-.4);roundedShape.lineTo(.5,.4);roundedShape.quadraticCurveTo(.5,.5,.4,.5);roundedShape.lineTo(-.4,.5);roundedShape.quadraticCurveTo(-.5,.5,-.5,.4);roundedShape.lineTo(-.5,-.4);roundedShape.quadraticCurveTo(-.5,-.5,-.4,-.5);
const roundedGeometry=new THREE.ExtrudeGeometry(roundedShape,{depth:.84,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.08,bevelThickness:.08,curveSegments:3});roundedGeometry.translate(0,0,-.42);
function rounded(c,g,x,y,z,sx,sy,sz){return mesh(roundedGeometry,c,g,x,y,z,sx,sy,sz)}
function kart(color,type=selectedKart){
 const group=new THREE.Group(),body=new THREE.Group(),driver=new THREE.Group(),wheels=[];group.add(body);body.add(driver);
 const paint=mat(color);paint.roughness=.28;paint.metalness=.26;
 rounded(0x122335,body,0,.72,0,3.15,.45,4.35);
 rounded(color,body,0,1.12,.28,2.65,.8,3.5);
 sphere(color,body,0,1.02,1.53,1.38,.42,1.25);
 rounded(0xf0eee7,body,0,1.51,1.12,.24,.045,2.1);
 rounded(0x182b3d,body,0,1.21,2.38,2.7,.32,.38);
 for(const side of[-1,1]){
  rounded(color,body,side*1.38,1.15,-.15,.42,.55,2.5);
  rounded(0xf6fbdf,body,side*.82,1.25,2.36,.5,.18,.1).material=mat(0xffffd6,true);
  rounded(0x99bed0,body,side*1.21,.8,-2.04,.22,.23,.47);
  const exhaust=mesh(tireGeometry,0x4e6678,body,side*.65,.89,-2.22,.22,.5,.22);exhaust.rotation.x=Math.PI/2;
  rounded(0xdde4de,body,side*1.45,1.47,-.3,.04,.08,.9);
 }
 rounded(0x122435,body,0,1.68,-.8,1.35,1.02,.43);
 rounded(color,body,0,1.94,-2.07,3.65,.22,.75);
 for(const side of[-1,1]){rounded(0x213647,body,side*1.1,1.36,-2.03,.17,1,.18);rounded(color,body,side*1.88,2.02,-2.06,.16,.43,.9)}
 for(const x of[-1.7,1.7])for(const z of[-1.3,1.35]){
  const pivot=new THREE.Group(),spin=new THREE.Group();pivot.position.set(x,.71,z);pivot.add(spin);group.add(pivot);
  const tire=mesh(tireGeometry,0x101a25,spin,0,0,0,.7,.55,.7);tire.rotation.z=Math.PI/2;
  const rim=mesh(tireGeometry,0xa9bdc8,spin,Math.sign(x)*.3,0,0,.43,.05,.43);rim.rotation.z=Math.PI/2;
  const hub=mesh(tireGeometry,color,spin,Math.sign(x)*.34,0,0,.2,.05,.2);hub.rotation.z=Math.PI/2;
  for(let j=0;j<5;j++){const a=j*TAU/5;const spoke=box(0x1d3447,spin,Math.sign(x)*.335,Math.cos(a)*.25,Math.sin(a)*.25,.035,.28,.065);spoke.rotation.x=a}
  wheels.push({pivot,spin,front:z>0});
 }
 rounded(color,driver,0,1.94,-.07,1.19,1.0,.83);
 for(const x of[-.55,.55]){let arm=sphere(color,driver,x,2.03,.46,.31,.3,.58);arm.rotation.x=-.27;sphere(0xf5f0df,driver,x,2.15,.94,.24)}
 sphere(0xf4e6c9,driver,0,2.92,-.08,.83,.86,.81);
 sphere(color,driver,0,3.16,-.15,.87,.63,.86);
 sphere(0x173d55,driver,0,3.03,.6,.73,.36,.2);
 sphere(0x75d5e5,driver,-.19,3.13,.77,.3,.08,.023);
 rounded(0xf1f6ed,driver,0,3.64,-.05,.23,.035,.88);
 for(const side of[-1,1]){sphere(0x243f52,driver,side*.79,3,-.07,.12,.2,.22);sphere(0xdef48e,driver,side*.9,3,-.07,.025,.09,.1)}
 let steering=new THREE.Mesh(torusGeometry,mat(0x192d3c));steering.scale.setScalar(.48);steering.position.set(0,2.09,.94);steering.rotation.x=-.8;body.add(steering);
 const flame=new THREE.Group();for(const x of[-.65,.65]){let f=sphere(0x9ff8ff,flame,x,.9,-2.85,.27,.28,.85);f.material=mat(0x96eaff,true);let core=sphere(0xffffff,flame,x,.9,-2.45,.15,.17,.35);core.material=mat(0xffffff,true)}flame.visible=false;body.add(flame);
 const shieldMesh=new THREE.Mesh(ball,new THREE.MeshBasicMaterial({color:0x9adfff,transparent:true,opacity:.13,wireframe:true,depthWrite:false}));shieldMesh.position.set(0,1.7,0);shieldMesh.scale.set(2.65,2.7,3.4);shieldMesh.visible=false;group.add(shieldMesh);
 if(type===1){body.scale.z=1.14;rounded(0x142b3e,body,0,1.4,-1.49,.72,.55,.68);rounded(color,body,0,2.2,-2.15,4.1,.15,.7)}
 if(type===2){body.scale.set(.94,.96,.94);for(const x of[-1,1])rounded(0xecf4e0,body,x,1.53,-1.3,.48,.25,.55)}
 group.traverse(o=>{if(o.isMesh){o.castShadow=!o.material.transparent;o.receiveShadow=true}});
 group.userData={flame,body,driver,wheels,shieldMesh,steering};return group;
}
function ribbon(offset1,offset2,color,lift=0){const pos=[],norm=[],uv=[],N=frames.length;for(let i=0;i<N;i++){let a=sample(i/N*length,offset1).p,b=sample(i/N*length,offset2).p,c=sample((i+1)/N*length,offset1).p,d=sample((i+1)/N*length,offset2).p;for(const p of[a,c,b,b,c,d]){pos.push(p.x,p.y+lift,p.z);norm.push(0,1,0);uv.push(0,0)}}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));let m=new THREE.Mesh(g,mat(color));m.material.side=THREE.DoubleSide;world.add(m)}
function roadside(distance,lane){const f=sample(distance,lane);if(Math.abs(lane)>18)f.p.y=terrainHeight(f.p.x,f.p.z);return f.p}
function tree(p,i){let group=new THREE.Group();group.position.copy(p);if(selectedTrack===1){mesh(cylinder,0x477768,group,0,5,0,1.1,10,1.1);for(let side of[-1,1]){box(0x477768,group,side*1.8,5,0,3.2,1.2,1.2);mesh(cylinder,0x477768,group,side*3,6.5,0,.7,4,.7)}}else if(selectedTrack===0){let trunk=mesh(cylinder,0x9b7660,group,0,5,0,.6,10,.6);trunk.rotation.z=.15;for(let j=0;j<6;j++){const leaf=mesh(cone,0x318d68,group,0,10,0,2.7,8,1);leaf.rotation.z=1.18;leaf.rotation.y=j*TAU/6;}}else{mesh(cylinder,0x66557d,group,0,3,0,.6,6,.6);for(let j=0;j<3;j++)mesh(cone,j%2?0x517d9a:0x477689,group,0,5+j*2.7,0,4-j*.8,7,4-j*.8)}group.rotation.y=i*2.4;world.add(group)}
function labelTexture(text,bg,fg){const c=document.createElement('canvas');c.width=1024;c.height=192;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,192);ctx.font='900 94px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fg;ctx.fillText(text,512,99);return new THREE.CanvasTexture(c)}
function mergeWorld(){world.updateMatrixWorld(true);const buckets=new Map(),remove=[];world.traverse(o=>{if(o.isMesh&&!o.userData.keep&&!o.material.map&&!o.material.isShaderMaterial){const k=o.material.uuid;if(!buckets.has(k))buckets.set(k,{material:o.material,positions:[],normals:[]});const b=buckets.get(k),g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);b.positions.push(...g.attributes.position.array);b.normals.push(...g.attributes.normal.array);g.dispose();remove.push(o)}});for(const o of remove){o.removeFromParent();if(!sharedGeometries.has(o.geometry))o.geometry.dispose()}for(const b of buckets.values()){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));const merged=new THREE.Mesh(g,b.material);merged.receiveShadow=true;merged.castShadow=true;world.add(merged)}}
function buildCourse(){clearAtmosphere();if(world){scene.remove(world);world.traverse(o=>{if(o.geometry&&!sharedGeometries.has(o.geometry))o.geometry.dispose();if(o.material&&!Array.from(materialCache.values()).includes(o.material)){if(o.material.map&&o.material.map!==glowTexture)o.material.map.dispose();o.material.dispose()}})}for(let r of racers){scene.remove(r.model);r.model.userData.shieldMesh?.material.dispose()}for(let o of [...boxes,...coins,...hazards,...particles,...projectiles])if(o.mesh){scene.remove(o.mesh);disposeUnique(o.mesh)}boxes=[];coins=[];hazards=[];particles=[];projectiles=[];pads=[];ramps=[];racers=[];world=new THREE.Group();scene.add(world);const cfg=courses[selectedTrack];scene.background=new THREE.Color(cfg.sky);scene.fog=new THREE.Fog(cfg.fog,220,850);curve=new THREE.CatmullRomCurve3(cfg.points.map(p=>new THREE.Vector3(...p)),true,'catmullrom',.3);length=curve.getLength();frames=Array.from({length:720},(_,i)=>({p:curve.getPointAt(i/720),t:curve.getTangentAt(i/720)}));
// Water is rendered by the animated environment shader.
world.add(createTerrain());
ribbon(-17,17,cfg.ground,-.3);ribbon(-13.5,13.5,cfg.edge,.05);ribbon(-12,12,cfg.road,.1);
for(let i=0;i<Math.floor(length/6);i++){let d=i*6;for(let side of[-1,1]){const f=sample(d,side*12.65);let strip=box(i%2===0?cfg.accent:cfg.edge,world,f.p.x,f.p.y+.18,f.p.z,1.25,.18,5.95);strip.rotation.y=f.yaw}if(i%3===0){let f=sample(d,0);let line=box(0xecedf0,world,f.p.x,f.p.y+.18,f.p.z,.16,.06,3.3);line.rotation.y=f.yaw}}
for(let i=0;i<9;i++)for(let j=0;j<3;j++){let f=sample(j*1.35,(i-4)*2.65);const check=box((i+j)%2?0xeef1ef:0x182b3d,world,f.p.x,f.p.y+.2,f.p.z,2.65,.08,1.35);check.rotation.y=f.yaw}
const gate=new THREE.Group(),f=sample(0);gate.position.copy(f.p);gate.rotation.y=f.yaw;box(0x24445b,gate,-14,6,0,1.6,12,1.6);box(0x24445b,gate,14,6,0,1.6,12,1.6);box(cfg.accent,gate,0,12,0,30,3.6,1.3);const sign=new THREE.Mesh(new THREE.PlaneGeometry(26,3.2),new THREE.MeshBasicMaterial({map:labelTexture('AURORA  /  KART','#1e374a','#e2ff8a'),side:THREE.DoubleSide}));sign.position.set(0,12,.69);gate.add(sign);world.add(gate);
for(let i=0;i<78;i++){const d=i/78*length;const side=i%2?1:-1;const p=roadside(d,side*(25+(Math.sin(i*42)*.5+.5)*35));tree(p,i);if(i%4===0){sphere(selectedTrack===1?0xb36b56:0x73949d,world,p.x+7,p.y+2,p.z+7,5,3,4)}}
for(let i=0;i<25;i++){const a=i/25*TAU;let px=Math.sin(a)*520,pz=-150+Math.cos(a)*530;mesh(cone,selectedTrack===1?0xbf765e:selectedTrack===2?0x394366:0x78a8a2,world,px,20,pz,65,110+Math.sin(i*4)*40,65)}
for(let i=0;i<18;i++){const a=i*2.4;let p=new THREE.Vector3(Math.sin(a)*500,105+i%4*18,-150+Math.cos(a)*500);for(let j=0;j<3;j++)sphere(selectedTrack===2?0x657197:0xf5f0e9,world,p.x+j*17,p.y,p.z,24,10+j*2,11)}
// Barrier posts and colorful race flags.
for(let i=0;i<96;i++){const f=sample(i/96*length,(i%2?1:-1)*16);box(0xe9e6d9,world,f.p.x,f.p.y+1.7,f.p.z,.4,3.4,.4);if(i%8===0){let flag=box(cfg.accent,world,f.p.x+1.7,f.p.y+5.2,f.p.z,3.4,2,.15);flag.rotation.y=f.yaw;box(0xe9e6d9,world,f.p.x,f.p.y+3,f.p.z,.24,6,.24)}}
// Distinct landmarks beside the coast.
if(selectedTrack===0){const p=roadside(length*.36,-47);mesh(cylinder,0xfff4de,world,p.x,p.y+17,p.z,5,34,5);mesh(cylinder,0xff8461,world,p.x,p.y+22,p.z,5.15,5,5.15);mesh(cylinder,0x28485c,world,p.x,p.y+36,p.z,6.5,3,6.5);mesh(cone,0xff8461,world,p.x,p.y+41,p.z,7.5,7,7.5);for(let i=0;i<8;i++){const p=roadside(length*(.62+i*.014),-26);let g=new THREE.Group();g.position.copy(p);box(i%2?0xffb16a:0xffd889,g,0,3,0,8,6,7);let roof=mesh(cone,0xd66b56,g,0,8,0,7,5,7);roof.rotation.y=Math.PI/4;box(0x29556c,g,0,3,3.55,2.5,3,.2);world.add(g)}}
for(let q of [.13,.37,.62,.84]){for(let lane of[-8,0,8]){const f=sample(q*length,lane);const m=new THREE.Mesh(new THREE.BoxGeometry(2.7,2.7,2.7),new THREE.MeshStandardMaterial({color:0x95fff2,emissive:0x30a8bd,emissiveIntensity:.45,roughness:.25,metalness:.35}));m.position.copy(f.p).y+=3;scene.add(m);let inner=box(0xffffff,m,0,0,1.37,.4,1.5,.08);boxes.push({d:q*length,lane,mesh:m,cool:0,base:f.p.y+3})}}
for(let q of [.08,.24,.44,.56,.73,.92])for(let j=0;j<5;j++){const lane=q<.5?-5:5,d=(q*length+j*6)%length;const f=sample(d,lane);let m=mesh(cylinder,0xffdc64,scene,f.p.x,f.p.y+2,f.p.z,.78,.24,.78);m.rotation.z=Math.PI/2;coins.push({d,lane,mesh:m,cool:0,base:f.p.y+2})}
for(let q of [.21,.53,.79]){const d=q*length,lane=q===.53?-6:6;pads.push({d,lane,cool:0});for(let i=0;i<5;i++){let f=sample(d-4+i*2,lane);let m=box(0xdfff87,world,f.p.x,f.p.y+.24,f.p.z,5,.12,.9);m.rotation.y=f.yaw}}
for(let q of [.3,.68]){const d=q*length,lane=q===.3?6:-6;ramps.push({d,lane,cool:0});const f=sample(d,lane);let ramp=box(cfg.accent,world,f.p.x,f.p.y+.5,f.p.z,7,.8,9);ramp.rotation.set(-.1,f.yaw,0);for(let j=0;j<3;j++){let ff=sample(d-3+j*2,lane);let m=box(cfg.edge,world,ff.p.x,ff.p.y+1+j*.12,ff.p.z,5,.12,.5);m.rotation.y=ff.yaw}}
enhanceWorld();mergeWorld();for(let i=0;i<(gameMode==='trial'?1:8);i++){const model=kart(i===0?palette[selectedColor]:palette[(i+selectedColor)%8],i===0?selectedKart:i%3);scene.add(model);const r={name:names[i],d:i===0?(gameMode==='trial'?-5:-25):-5-Math.floor((i-1)/2)*7,lane:i===0?(gameMode==='trial'?0:-4):(i%2?4:-4),speed:0,base:88+(i*7%17),model,stun:0,boost:0,coins:0,finish:null,itemCooldown:8+i*2};racers.push(r);placeKart(r,0)}
$('courseTag').querySelector('b').textContent=cfg.name;$('courseTag').querySelector('span').textContent=['THE FIRST CIRCUIT','THE GOLDEN CIRCUIT','THE MIDNIGHT CIRCUIT'][selectedTrack];$('courseTag').querySelector('small').textContent=['海へ飛び出す、最初の一周。','夕陽を抜けて、頂点へ。','星のあいだを駆け抜ける。'][selectedTrack];finishWorldSetup();readBest();}
function placeKart(r,dt){
 const f=sample(r.d,r.lane),you=r===racers[0],u=r.model.userData; r.model.position.copy(f.p);r.model.position.y+=.36+(you?air+hop:Math.abs(Math.sin(r.d*.27))*.035);
 const yawOffset=you?steer*(drifting?.32:.085)+(drifting?driftDirection*.15:0):Math.sin(r.d*.025)*.05;
 const spin=you&&trickDone&&air>0?trickSpin:0;r.model.rotation.set(-Math.asin(f.t.y),f.yaw+yawOffset+spin+(r.stun>0?(you?time*10:Math.sin(time*14)*.45):0),you?-steer*(drifting?.1:.045):0);
 u.body.position.y=(you&&air>0?0:Math.sin(r.d*1.1)*.023)*Math.min(1,r.speed/40);u.driver.rotation.z=you?-steer*.1:0;u.driver.rotation.y=you?-yawOffset*.3:0;u.steering.rotation.z=you?-steer*.6:Math.sin(r.d*.02)*.15;
 for(const wheel of u.wheels){wheel.spin.rotation.x+=r.speed*dt/0.7;if(wheel.front)wheel.pivot.rotation.y=you?steer*.32:Math.sin(r.d*.02)*.06}
 u.flame.visible=you?boost>0:r.boost>0;u.flame.scale.z=1+Math.sin(time*55)*.18;u.shieldMesh.visible=you&&shield>0;u.shieldMesh.rotation.y=time*.6;
}
function toast(message){$('toast').textContent=message;toastTime=2;$('toast').style.opacity=1}
function banner(title,subtitle=''){const el=$('raceBanner');el.innerHTML=`<b>${title}</b><small>${subtitle}</small>`;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');bannerTime=2.6;}
function playTone(freq,duration=.1,type='sine',volume=.08){if(!soundOn||!audioContext)return;const osc=audioContext.createOscillator(),g=audioContext.createGain();osc.type=type;osc.frequency.value=freq;g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(g);g.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration)}
function enableAudio(){soundOn=!soundOn;try{if(soundOn&&!audioContext){audioContext=new(window.AudioContext||window.webkitAudioContext)();motor=audioContext.createOscillator();motor.type='sawtooth';motorGain=audioContext.createGain();motorGain.gain.value=0;let filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=390;motor.connect(filter);filter.connect(motorGain);motorGain.connect(audioContext.destination);motor.start()}if(soundOn){audioContext.resume();playTone(660,.12)}if(motorGain)motorGain.gain.value=0;}catch{soundOn=false;toast('このブラウザでは音声を開始できませんでした')}$('sound').textContent=soundOn?'音声 ON':'音声 OFF';$('sound').setAttribute('aria-label',soundOn?'音声をオフにする':'音声をオンにする')}
const itemData={boost:['⚡','ターボ'],orb:['◉','ホーミングオーブ'],trap:['▲','スリップトラップ'],shield:['◇','シールド'],storm:['ϟ','サンダーパルス']};
function updateItem(){const info=heldItem?itemData[heldItem]:['?','アイテムなし'];$('itemIcon').textContent=info[0];$('itemName').textContent=info[1];$('item').classList.toggle('ready',!!heldItem);$('itemHint').textContent=gameMode==='trial'?`残り ${trialBoosts} 回`:'SPACE / タップ'}
function gainItem(){if(heldItem||roulette>0||gameMode==='trial')return;roulette=1.05;playTone(900,.08);spark(racers[0],0x8ef5ff,10)}
function activateBoost(duration,message){boost=Math.max(boost,duration);if(message)toast(message);shake=Math.max(shake,.12);playTone(540,.16,'triangle',.045)}
function releaseItem(){
 if(mode!=='race'||!heldItem)return;const r=racers[0],type=heldItem;heldItem=null;if(gameMode==='trial'){trialBoosts=Math.max(0,trialBoosts-1);if(trialBoosts>0)heldItem='boost'}updateItem();playTone(350,.17,'square',.022);
 if(type==='boost')activateBoost(2.8,'ターボ！');
 if(type==='shield'){shield=7;toast('シールド展開！');spark(r,0xc4abff,18)}
 if(type==='storm'){for(let a of racers.slice(1))hit(a);hitFlash=.25;toast('サンダーパルス！');spark(r,0xc5d0ff,22)}
 if(type==='trap'){const f=sample(r.d-7,r.lane),m=mesh(cone,0xffc55e,scene,f.p.x,f.p.y+1,f.p.z,1.35,2,1.35);hazards.push({d:mod(r.d-7,length),lane:r.lane,mesh:m,life:30,owner:0});toast('トラップ設置！')}
 if(type==='orb'){const target=racers.filter(a=>a!==r&&!a.finish&&a.d>r.d).sort((a,b)=>a.d-b.d)[0];if(target){spawnOrb(r,target);toast('ホーミングオーブ発射！')}else activateBoost(1.5,'前方クリア！ ターボに変換')}
}
function spawnOrb(owner,target){let m=sphere(0xa8edff,scene,0,0,0,.85);m.material=mat(0x8cdbff,true);addGlow(m,0,0,0,0x91e9ff,4);projectiles.push({d:owner.d+5,lane:owner.lane,target,mesh:m,life:7,owner})}
function hit(r){
 if(r===racers[0]&&(shield>0||invulnerable>0)){if(shield>0){toast('シールドでガード！');playTone(1200,.15)}return}if(r.stun>.3)return;
 r.stun=1.5;r.speed*=.42;spark(r,0xffdd8c,15);
 if(r===racers[0]){stun=1.5;invulnerable=2.4;drift=0;drifting=false;comboCount=0;comboTimer=0;r.coins=Math.max(0,r.coins-3);shake=.5;hitFlash=.4;toast('スピン！');playTone(110,.3,'sawtooth',.04)}
}
function spark(r,color,amount=1){if(particles.length>140)return;const f=sample(r.d-1.8,r.lane);for(let i=0;i<amount;i++){const side=i%2?1:-1;let m=sphere(color,scene,f.p.x+f.n.x*side*1.7,f.p.y+.55+air*.6,f.p.z+f.n.z*side*1.7,.13+Math.random()*.13);m.material=mat(color,true);particles.push({mesh:m,life:.35+Math.random()*.3,v:f.t.clone().multiplyScalar(-8-Math.random()*12).addScaledVector(f.n,(Math.random()-.5)*10).add(new THREE.Vector3(0,Math.random()*5,0))})}}
function addCombo(){comboCount=comboTimer>0?comboCount+1:1;comboTimer=4.5;}
let driftDirection=0,driftStage=0,wallCooldown=0,skidClock=0,trickPressed=false;
function doTrick(){if(mode==='race'&&air>1&&!trickDone){trickDone=true;trickCount++;trickSpin=0;toast('トリック成功！ 着地でブースト');playTone(950,.15);spark(racers[0],0xffe3a0,14)}}
function beginSession(){gpRound=0;gpPoints=Array(8).fill(0);gpWins=Array(8).fill(0);gpFinished=false;if(gameMode==='grandprix')selectedTrack=0;startRace()}
function startRace(){
 keys={};padKeys={};elapsed=0;count=3.5;lastCount='';boost=0;drift=0;drifting=false;driftDirection=0;driftStage=0;heldItem=null;roulette=0;shield=0;stun=0;air=0;airV=0;hop=0;hopV=0;finishTime=0;finishOrder=[];finalOrder=[];lastLap=1;lapStart=0;steer=0;lateralSpeed=0;lapTimes=[];driftCount=0;trickCount=0;coinTotal=0;comboCount=0;comboTimer=0;draftCharge=0;draftCooldown=0;trickDone=false;trickSpin=0;invulnerable=0;hitFlash=0;shake=0;wallCooldown=0;resultDelay=0;accumulator=0;hudClock=0;rankPrevious=8;trialBoosts=3;ghostSamples=[];ghostClock=0;ghostIndex=0;ghostDistanceIndex=0;ghostRecord=null;bestBefore=null;
 aiDifficulty=Number($('difficulty').value);buildCourse();mode='countdown';document.body.classList.add('racing');document.body.classList.remove('airborne');$('menu').hidden=true;$('courseTag').hidden=true;$('hud').hidden=false;$('pause').hidden=false;$('pausePanel').hidden=true;$('results').hidden=true;$('helpPanel').hidden=true;$('touch').hidden=!touch;$('ghostDelta').textContent='';$('combo').innerHTML='';$('lapSplits').innerHTML='';$('nextRace').hidden=true;
 $('raceTip').textContent='↑ / W 加速　↓ / S ブレーキ　← → ハンドル　E トリック　C 視点　R 後方';
 if(gameMode==='trial'){heldItem='boost';loadGhost()}updateItem();const f=sample(racers[0].d-20,racers[0].lane);camPos.copy(f.p).y+=12;camLook.copy(racers[0].model.position).y+=2;banner(courses[selectedTrack].name.toUpperCase(),gameMode==='grandprix'?`AURORA CUP · ROUND ${gpRound+1} / 3`:gameMode==='trial'?'TIME ATTACK · 3 LAPS':'SINGLE RACE · 3 LAPS');updateHUD();
}
function nextGrandPrix(){if(gameMode!=='grandprix'||gpRound>=2)return;gpRound++;selectedTrack=gpRound;startRace()}
function backMenu(){mode='menu';keys={};padKeys={};document.body.classList.remove('racing','airborne');$('menu').hidden=false;$('courseTag').hidden=false;$('hud').hidden=true;$('pause').hidden=true;$('pausePanel').hidden=true;$('results').hidden=true;$('touch').hidden=true;$('countdown').textContent='';$('toast').style.opacity=0;$('raceBanner').classList.remove('show');boost=0;selectedTrack=gameMode==='grandprix'?0:selectedTrack;refreshSelections();buildCourse()}
let beforePause='race';function pauseGame(){if(mode==='race'||mode==='countdown'){beforePause=mode;mode='paused';$('pausePanel').hidden=false;keys={};padKeys={}}else if(mode==='paused'){mode=beforePause;$('pausePanel').hidden=true;accumulator=0;clock.getDelta()}}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}.${String(Math.floor(t*1000%1000)).padStart(3,'0')}`}
function storageKey(){return `aurora-v2-${gameMode==='trial'?'trial':'race'}-${selectedTrack}-${selectedKart}-${gameMode==='trial'?'fixed':$('difficulty').value}`}
function readBest(){try{const v=Number(localStorage.getItem(storageKey()));$('best').textContent=v>0?`自己ベスト  ${formatTime(v)}${gameMode==='trial'?' · ゴーストと勝負':''}`:gameMode==='trial'?'3回のターボを、どこで使う？ 自己ベストを記録しよう。':''}catch{}}
function loadGhost(){try{bestBefore=Number(localStorage.getItem(storageKey()))||null;const data=JSON.parse(localStorage.getItem(storageKey()+'-ghost')||'null');if(data&&data.version===2&&Array.isArray(data.samples)&&data.samples.length>2&&data.samples.length<15000&&data.samples.every(a=>Array.isArray(a)&&a.length===4&&a.every(Number.isFinite))){ghostRecord=data;ghostModel=kart(0x8fe9ff,selectedKart);ghostModel.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.22;o.material.depthWrite=false;o.castShadow=false}});ghostModel.userData.shieldMesh.visible=false;scene.add(ghostModel)}}catch{ghostRecord=null}}
function updateGhost(dt){if(gameMode!=='trial')return;ghostClock+=dt;if(ghostClock>=.1){ghostClock-=.1;const r=racers[0];ghostSamples.push([Number(elapsed.toFixed(3)),Number(r.d.toFixed(3)),Number(r.lane.toFixed(3)),Number(air.toFixed(3))])}if(!ghostRecord||!ghostModel)return;const data=ghostRecord.samples;while(ghostIndex<data.length-2&&data[ghostIndex+1][0]<elapsed)ghostIndex++;const a=data[ghostIndex],b=data[Math.min(ghostIndex+1,data.length-1)],f=clamp((elapsed-a[0])/(b[0]-a[0]||.1),0,1);const d=lerp(a[1],b[1],f),lane=lerp(a[2],b[2],f),p=sample(d,lane);ghostModel.position.copy(p.p).y+=.36+lerp(a[3],b[3],f);ghostModel.rotation.set(-Math.asin(p.t.y),p.yaw,0);ghostModel.visible=elapsed<=data[data.length-1][0];while(ghostDistanceIndex<data.length-2&&data[ghostDistanceIndex+1][1]<racers[0].d)ghostDistanceIndex++;const ga=data[ghostDistanceIndex],gb=data[Math.min(ghostDistanceIndex+1,data.length-1)],gf=clamp((racers[0].d-ga[1])/(gb[1]-ga[1]||1),0,1),difference=lerp(ga[0],gb[0],gf)-elapsed;$('ghostDelta').textContent=(difference>=0?'−':'+')+Math.abs(difference).toFixed(2)+'s  GHOST';$('ghostDelta').style.color=difference>=0?'#b4fcda':'#ffbfa8'}
function finishRace(){
 const r=racers[0];if(r.finish!==null)return;r.finish=elapsed;finishTime=elapsed;finishOrder.push(r);mode='finished';resultDelay=1.8;$('pause').hidden=true;$('touch').hidden=true;$('countdown').textContent='FINISH!';$('raceBanner').classList.remove('show');keys={};padKeys={};lapTimes.push(elapsed-lapStart);finalOrder=[...finishOrder,...racers.filter(a=>!finishOrder.includes(a)).sort((a,b)=>b.d-a.d)];
 for(const a of finalOrder)a.resultRemaining=Math.max(0,Math.round(length*3-a.d));
 if(gameMode==='grandprix'){for(let i=0;i<finalOrder.length;i++){const idx=names.indexOf(finalOrder[i].name);gpPoints[idx]+=pointsTable[i];if(i===0)gpWins[idx]++}gpFinished=gpRound===2;}
 playTone(523,.2);try{const prev=Number(localStorage.getItem(storageKey()));bestBefore=prev||null;if(!prev||finishTime<prev){localStorage.setItem(storageKey(),String(finishTime));if(gameMode==='trial'){ghostSamples.push([finishTime,r.d,r.lane,air]);localStorage.setItem(storageKey()+'-ghost',JSON.stringify({version:2,time:finishTime,samples:ghostSamples}))}}}catch{}
}
function cupOrder(){return names.map((name,i)=>({name,idx:i,points:gpPoints[i],wins:gpWins[i]})).sort((a,b)=>b.points-a.points||b.wins-a.wins||finalOrder.findIndex(r=>r.name===a.name)-finalOrder.findIndex(r=>r.name===b.name))}
function showResults(){
 $('countdown').textContent='';$('results').hidden=false;const r=racers[0],rank=finalOrder.indexOf(r)+1,newBest=!bestBefore||finishTime<bestBefore;$('resultEyebrow').textContent=gameMode==='grandprix'?(gpFinished?'AURORA CUP / FINAL STANDINGS':`AURORA CUP / ROUND ${gpRound+1} OF 3`):gameMode==='trial'?'TIME ATTACK':'FINISH LINE';
 $('resultTitle').textContent=gameMode==='trial'?(newBest?'NEW RECORD!':'TIME ATTACK'):gpFinished?(cupOrder()[0].name==='YOU'?'CHAMPION!':'CUP COMPLETE'):rank===1?'VICTORY!':'NICE RACE!';
 $('resultRank').textContent=gpFinished?`${cupOrder().findIndex(a=>a.name==='YOU')+1} 位 / 総合`:gameMode==='trial'?'3 LAPS':`${rank} 位 / ${racers.length}`;
 $('resultTime').textContent=formatTime(finishTime)+(newBest?' ★':'');$('raceStats').innerHTML=[['ベストラップ',formatTime(Math.min(...lapTimes))],['ドリフト',driftCount],['トリック',trickCount]].map(([label,value])=>`<div><b>${value}</b><span>${label}</span></div>`).join('');
 if(gameMode==='trial')$('standings').innerHTML=lapTimes.map((t,i)=>`<div class="standing"><b>LAP ${i+1}</b><span>${formatTime(t)}</span></div>`).join('');
 else if(gameMode==='grandprix')$('standings').innerHTML=cupOrder().map((a,i)=>`<div class="standing ${a.name==='YOU'?'you':''}"><b>${String(i+1).padStart(2,'0')}</b><span>${a.name}</span><span>${a.points} PTS</span></div>`).join('');
 else $('standings').innerHTML=finalOrder.map((a,i)=>`<div class="standing ${a===r?'you':''}"><b>${String(i+1).padStart(2,'0')}</b><span>${a.name}</span><span>${a.finish?formatTime(a.finish):'残り '+a.resultRemaining+' m'}</span></div>`).join('');
 $('nextRace').hidden=gameMode!=='grandprix'||gpFinished;$('again').hidden=gameMode==='grandprix'&&!gpFinished;$('again').textContent=gameMode==='grandprix'?'もう一度グランプリ →':'もう一度レース →';
}
function raceStep(dt){
 const r=racers[0],cfg=kartTypes[selectedKart];elapsed+=dt;boost=Math.max(0,boost-dt);shield=Math.max(0,shield-dt);stun=Math.max(0,stun-dt);invulnerable=Math.max(0,invulnerable-dt);wallCooldown=Math.max(0,wallCooldown-dt);draftCooldown=Math.max(0,draftCooldown-dt);comboTimer=Math.max(0,comboTimer-dt);r.stun=stun;
 const input=(pressed('ArrowLeft')||pressed('KeyA')?-1:0)+(pressed('ArrowRight')||pressed('KeyD')?1:0),gas=autoGas||pressed('ArrowUp')||pressed('KeyW'),brake=pressed('ArrowDown')||pressed('KeyS'),shift=pressed('ShiftLeft')||pressed('ShiftRight');
 steer=lerp(steer,input,1-Math.exp(-dt*10));const offroad=Math.abs(r.lane)>11.5,max=(boost>0?cfg.speed+38:cfg.speed+r.coins*.65)*(offroad&&boost<=0?.7:1)*(stun>0?.43:1);
 if(gas&&!brake&&r.speed<max)r.speed=Math.min(max,r.speed+dt*(boost>0?88:cfg.accel));else if(!gas||brake)r.speed=Math.max(0,r.speed-dt*(brake?96:17));if(r.speed>max)r.speed=Math.max(max,r.speed-dt*75);
 if(shift&&!drifting&&Math.abs(input)>.4&&r.speed>38&&air<.1&&stun<=0){drifting=true;driftDirection=Math.sign(input);drift=0;driftStage=0;hopV=3.5;hop=.01}
 if(drifting){if(shift&&r.speed>32&&stun<=0&&air<.1){drift=Math.min(3.5,drift+dt*cfg.charge);const stage=drift>2.5?3:drift>1.3?2:drift>.65?1:0;if(stage>driftStage){driftStage=stage;playTone(430+stage*180,.09,'triangle',.035)}if(Math.random()<dt*38)spark(r,stage===3?0xcba2ff:stage===2?0xffb568:0x7eeaff,2);skidClock+=dt;if(skidClock>.06){skidClock=0;leaveSkid(r)}}else{if(drift>.65&&stun<=0){const duration=drift>2.5?2.6:drift>1.3?1.6:.8;activateBoost(duration,drift>2.5?'ウルトラ・ドリフト！':drift>1.3?'スーパー・ドリフト！':'ミニターボ！');driftCount++;addCombo()}drifting=false;drift=0;driftDirection=0;}}
 const f0=sample(r.d),f1=sample(r.d+10),angle=Math.atan2(Math.sin(f1.yaw-f0.yaw),Math.cos(f1.yaw-f0.yaw));
 const lateralTarget=(steer*cfg.handling*(drifting?.5:1)+(drifting?driftDirection*2.5:0))*Math.min(1,r.speed/28)-angle*r.speed*.47;
 lateralSpeed=lerp(lateralSpeed,lateralTarget,1-Math.exp(-dt*(drifting?3.5:8)));r.lane+=lateralSpeed*dt;
 if(Math.abs(r.lane)>12.1){r.lane=clamp(r.lane,-12.1,12.1);lateralSpeed*=-.35;if(wallCooldown<=0&&r.speed>20){r.speed*=.82;wallCooldown=.7;shake=.18;playTone(85,.08,'triangle',.04);spark(r,0xffdf8a,5)}}
 r.d+=r.speed*dt;const wasAir=air;airV-=dt*29;air=Math.max(0,air+airV*dt);hopV-=dt*35;hop=Math.max(0,hop+hopV*dt);if(hop===0)hopV=0;
 if(air>0){if(pressed('KeyE')&&!trickPressed)doTrick();trickPressed=pressed('KeyE');if(trickDone)trickSpin=Math.min(TAU,trickSpin+dt*TAU*1.6);}if(air===0){airV=0;if(wasAir>0){shake=.2;if(trickDone){activateBoost(1.8,'トリック・ブースト！');addCombo();spark(r,0xffd27d,16)}trickDone=false;trickSpin=0}}
 if(racers.length>1&&r.speed>55&&boost<=0&&draftCooldown<=0){const following=racers.slice(1).some(a=>a.d-r.d>7&&a.d-r.d<32&&Math.abs(a.lane-r.lane)<2.3);draftCharge=clamp(draftCharge+dt*(following?1:-1.4),0,1.6);if(draftCharge>=1.6){activateBoost(1.7,'スリップストリーム！');draftCharge=0;draftCooldown=4;addCombo()}}else draftCharge=Math.max(0,draftCharge-dt);
 aiStep(dt,true);
 for(const b of boxes){b.cool=Math.max(0,b.cool-dt);b.mesh.visible=b.cool<=0&&gameMode!=='trial';b.mesh.rotation.x=time*.6;b.mesh.rotation.y=time*1.6;b.mesh.position.y=b.base+Math.sin(time*3+b.d)*.35;if(gameMode!=='trial'&&b.cool<=0&&nearDistance(r.d,b.d)<4&&Math.abs(r.lane-b.lane)<3&&!heldItem&&roulette<=0){b.cool=5;gainItem()}}
 for(const c of coins){c.cool=Math.max(0,c.cool-dt);c.mesh.visible=c.cool<=0;c.mesh.rotation.y=time*3;c.mesh.position.y=c.base+Math.sin(time*3+c.d)*.2;if(c.cool<=0&&nearDistance(r.d,c.d)<3&&Math.abs(r.lane-c.lane)<2.4&&air<3){c.cool=15;r.coins=Math.min(10,r.coins+1);coinTotal++;playTone(1100+r.coins*35,.08,'sine',.035);spark(r,0xffe274,3)}}
 for(const p of pads){p.cool=Math.max(0,p.cool-dt);if(p.cool===0&&nearDistance(r.d,p.d)<5&&Math.abs(r.lane-p.lane)<3.6&&air<1){p.cool=2;activateBoost(1.35,'ダッシュプレート！');addCombo()}}
 for(const p of ramps){p.cool=Math.max(0,p.cool-dt);if(p.cool===0&&nearDistance(r.d,p.d)<4&&Math.abs(r.lane-p.lane)<4&&r.speed>40&&air===0){p.cool=2;airV=15.5;air=.3;trickDone=false;trickPressed=false;activateBoost(.7);toast(touch?'TRICKで空中トリック！':'Eで空中トリック！');playTone(840,.15)}}
 for(let i=hazards.length-1;i>=0;i--){let h=hazards[i];h.life-=dt;for(let j=0;j<racers.length;j++){let a=racers[j];if((j!==h.owner||h.life<27)&&nearDistance(a.d,h.d)<3&&Math.abs(a.lane-h.lane)<2.5&&(j!==0||air<2)){hit(a);h.life=0;break}}if(h.life<=0){scene.remove(h.mesh);hazards.splice(i,1)}}
 for(let i=projectiles.length-1;i>=0;i--){let p=projectiles[i];p.life-=dt;p.d+=155*dt;p.lane=lerp(p.lane,p.target.lane,dt*7);p.mesh.position.copy(sample(p.d,p.lane).p).y+=2;if(p.target===r&&p.target.d-p.d<30&&p.target.d-p.d>0){$('itemHint').textContent='オーブ接近！';}if(p.d>=p.target.d-2){hit(p.target);p.life=0}if(p.life<=0){scene.remove(p.mesh);p.mesh.children.forEach(x=>x.material?.dispose());projectiles.splice(i,1);updateItem()}}
 if(roulette>0){roulette-=dt;const k=Object.keys(itemData);$('itemIcon').textContent=itemData[k[Math.floor(time*18)%k.length]][0];$('itemName').textContent='SELECTING';if(roulette<=0){const rank=getRank(),pool=rank<=2?['trap','shield','boost']:rank>=6?['boost','boost','orb','storm']:['boost','orb','shield','trap'];heldItem=pool[Math.floor(Math.random()*pool.length)];updateItem();playTone(1400,.12)}}
 const lap=Math.max(1,Math.floor(r.d/length)+1);if(lap>lastLap&&lap<=3){lapTimes.push(elapsed-lapStart);lapStart=elapsed;lastLap=lap;banner(lap===3?'FINAL LAP':'LAP 2 / 3',formatTime(lapTimes[lapTimes.length-1]));playTone(880,.25)}
 if(boost>0&&Math.random()<dt*25)spark(r,0x99f3ff,2);placeKart(r,dt);updateGhost(dt);if(r.d>=length*3)finishRace();
}
function nearDistance(a,b){return Math.abs(mod(a-b+length/2,length)-length/2)}
function aiStep(dt,interactions){
 const r=racers[0];for(let i=1;i<racers.length;i++){const a=racers[i];a.stun=Math.max(0,a.stun-dt);a.boost=Math.max(0,a.boost-dt);a.itemCooldown-=dt;
 const f=sample(a.d),future=sample(a.d+16),bend=Math.abs(Math.atan2(Math.sin(future.yaw-f.yaw),Math.cos(future.yaw-f.yaw))),rubber=clamp((r.d-a.d)*.018,-5,7);
 const max=(a.base*aiDifficulty+rubber+(a.boost>0?26:0))*clamp(1-bend*.22,.82,1)*(a.stun>0?.4:1);a.speed=lerp(a.speed,max,1-Math.exp(-dt*.68));a.d+=a.speed*dt;
 let targetLane=Math.sin(a.d*.009+i*2)*6.5;for(const h of hazards)if(mod(h.d-a.d,length)<27&&Math.abs(h.lane-targetLane)<3)targetLane=h.lane>0?-7:7;
 if(a.itemCooldown<2){const next=boxes.filter(b=>mod(b.d-a.d,length)<35).sort((b,c)=>mod(b.d-a.d,length)-mod(c.d-a.d,length))[0];if(next)targetLane=next.lane}
 a.lane=lerp(a.lane,targetLane,1-Math.exp(-dt*1.9));
 if(interactions&&a.itemCooldown<0){a.itemCooldown=10+Math.random()*10;if(Math.random()<.65)a.boost=1.8;else if(r.d-a.d>8&&r.d-a.d<55&&!projectiles.some(p=>p.target===r))spawnOrb(a,r)}
 if(interactions&&Math.abs(a.d-r.d)<4&&Math.abs(a.lane-r.lane)<2.8&&air<2){const sign=r.lane>a.lane?1:-1;lateralSpeed+=sign*dt*20;r.speed=Math.max(0,r.speed-dt*15)}
 if(a.d>=length*3&&a.finish===null){a.finish=elapsed;finishOrder.push(a)}placeKart(a,dt);
 }
}
function getRank(){const r=racers[0];return r.finish!==null?finishOrder.indexOf(r)+1:1+racers.filter(a=>a!==r&&(a.finish!==null||a.d>r.d)).length}
function updateHUD(){
 const r=racers[0],rank=getRank();$('rank').textContent=gameMode==='trial'?'TT':rank;$('rankSuffix').innerHTML=gameMode==='trial'?'':'位 <small>/ 8</small>';$('cupStatus').textContent=gameMode==='grandprix'?`AURORA CUP / ${gpRound+1} OF 3`:gameMode==='trial'?'TIME ATTACK':'';
 $('lap').innerHTML=Math.min(3,Math.max(1,Math.floor(r.d/length)+1))+' <i>/ 3</i>';$('timer').textContent=formatTime(elapsed);$('coin').textContent=String(r.coins).padStart(2,'0');$('speed').textContent=Math.round(r.speed*1.45);
 $('boostBar').style.width=boost>0?'100%':drift/3.5*100+'%';$('boostBar').style.background=boost>0?'#dcff7e':drift>2.5?'#c295ff':drift>1.3?'#ffb45f':'#6ce7ff';$('driftLabel').textContent=boost>0?'TURBO BOOST':shield>0?'SHIELD '+shield.toFixed(1)+'s':drifting?['DRIFT CHARGING','MINI TURBO','SUPER TURBO','ULTRA TURBO'][driftStage]:draftCharge>.2?'SLIPSTREAM':autoGas?'AUTO ACCELERATE':'SHIFT + ← → DRIFT';
 $('draftMeter').querySelector('span').style.width=draftCharge/1.6*100+'%';$('combo').innerHTML=comboTimer>0&&comboCount>1?`${comboCount}×<small>BOOST CHAIN</small>`:'';
 $('lapSplits').innerHTML=lapTimes.map((t,i)=>`<div><span>LAP ${i+1}</span><b>${formatTime(t)}</b></div>`).join('');
 if(gameMode!=='trial'){let order=[...racers].sort((a,b)=>b.d-a.d),shown=order.slice(0,3);if(!shown.includes(r))shown.push(r);$('leaderboard').innerHTML=shown.map(a=>`<div class="live-row ${a===r?'you':''}"><b>${order.indexOf(a)+1}</b><i style="--rc:#${palette[(names.indexOf(a.name)+selectedColor)%8].toString(16).padStart(6,'0')}"></i><span>${a.name}</span><small>${a===r?'YOU':(a.d>r.d?'+':'−')+(Math.abs(a.d-r.d)/Math.max(50,r.speed)).toFixed(1)+'s'}</small></div>`).join('')}else $('leaderboard').innerHTML='';
 document.body.classList.toggle('airborne',air>1);if(rank<rankPrevious&&elapsed>4){rankFlash=.35;playTone(720,.06,'triangle',.02)}rankPrevious=rank;drawMap();
}
function drawMap(){const ctx=mapCtx,w=220,h=180;ctx.clearRect(0,0,w,h);const b=mapBounds,s=Math.min((w-30)/(b.maxX-b.minX),(h-25)/(b.maxZ-b.minZ)),map=p=>({x:(p.x-(b.maxX+b.minX)/2)*s+w/2,y:(p.z-(b.maxZ+b.minZ)/2)*s+h/2});ctx.lineWidth=9;ctx.strokeStyle='#0c253c9c';ctx.lineJoin='round';ctx.beginPath();frames.forEach((f,i)=>{const p=map(f.p);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='#dcecf2b0';ctx.stroke();const start=map(frames[0].p);ctx.fillStyle='#dcff7e';ctx.fillRect(start.x-3,start.y-3,6,6);for(const r of[...racers.slice(1),racers[0]]){const p=map(sample(r.d).p);ctx.beginPath();ctx.arc(p.x,p.y,r===racers[0]?5:3,0,TAU);ctx.fillStyle=r===racers[0]?'#dcff7e':'#ffffff';ctx.fill();if(r===racers[0]){ctx.strokeStyle='#172739';ctx.lineWidth=2;ctx.stroke()}}if(ghostModel?.visible){const p=map(ghostModel.position);ctx.beginPath();ctx.arc(p.x,p.y,3,0,TAU);ctx.fillStyle='#8fdfff';ctx.fill()}}
function updateCamera(dt){
 const r=racers[0];if(mode==='menu'){menuAngle+=dt*.018;const focus=sample(length*.035).p;camera.position.set(focus.x+Math.sin(.3+menuAngle)*105,focus.y+68,focus.z+Math.cos(.3+menuAngle)*105);camera.lookAt(focus.x-20,focus.y+2,focus.z-25);camera.fov=60;camera.updateProjectionMatrix();return}
 const lookBack=pressed('KeyR'),dist=[15.5,23,10.5][viewMode],height=[6.8,10.5,4.7][viewMode];let behind=sample(r.d+(lookBack?10:-dist),r.lane*.9).p;behind.y+=height+air*.55;let ahead=sample(r.d+(lookBack?-25:22),r.lane*.65).p;ahead.y+=2.4+air*.3;
 if(mode==='finished'&&resultDelay>0){const f=sample(r.d);behind=r.model.position.clone().addScaledVector(f.n,10).addScaledVector(f.t,9);behind.y+=5;ahead=r.model.position.clone();ahead.y+=1.8;}
 camPos.lerp(behind,1-Math.exp(-dt*(lookBack?12:6.5)));camLook.lerp(ahead,1-Math.exp(-dt*8));camera.position.copy(camPos);if(!reducedMotion&&shake>0){camera.position.x+=Math.sin(time*77)*shake*.17;camera.position.y+=Math.sin(time*91)*shake*.13}camera.lookAt(camLook);if(!reducedMotion)camera.rotateZ(-steer*(drifting?.012:.004));const target=boost>0&&!reducedMotion?76:viewMode===2?68:64;camera.fov=lerp(camera.fov,target,Math.min(1,dt*5));camera.updateProjectionMatrix();
}
function drawEffects(dt){
 const ctx=fxContext,w=fxWidth,h=fxHeight;ctx.clearRect(0,0,w,h);if(mode==='menu'||mode==='paused')return;
 if(!reducedMotion&&boost>0){const cx=w*.5,cy=h*.45;ctx.lineWidth=1.5;for(let i=0;i<32;i++){const angle=i*2.39996,phase=mod(time*(.8+i%3*.12)+i*.137,1),start=.3+phase*.6,end=start+.035+phase*.045,dx=Math.cos(angle)*w*.68,dy=Math.sin(angle)*h*.85;ctx.strokeStyle=`rgba(204,244,255,${.08+phase*.22})`;ctx.beginPath();ctx.moveTo(cx+dx*start,cy+dy*start);ctx.lineTo(cx+dx*end,cy+dy*end);ctx.stroke()}}
 if(hitFlash>0){ctx.fillStyle=`rgba(223,228,255,${Math.min(.13,hitFlash*.15)})`;ctx.fillRect(0,0,w,h)}
 if(mode==='finished'&&(!reducedMotion)){for(let i=0;i<64;i++){const x=mod(i*139.3+Math.sin(time+i)*40,w),y=mod(time*75+i*31,h);ctx.save();ctx.translate(x,y);ctx.rotate(time+i);ctx.fillStyle=['#dcff7e','#ffaf77','#9ce8ee','#d2aeff'][i%4];ctx.fillRect(-2,-4,4,8);ctx.restore()}}
}
function pollGamepad(){padKeys={};const pad=navigator.getGamepads?.()[0];if(!pad||pad.mapping!=='standard')return;const value=pad.axes[0]||0;padKeys.ArrowLeft=value<-.2||pad.buttons[14]?.pressed;padKeys.ArrowRight=value>.2||pad.buttons[15]?.pressed;padKeys.ArrowUp=pad.buttons[7]?.pressed||pad.buttons[0]?.pressed;padKeys.ArrowDown=pad.buttons[6]?.pressed||pad.buttons[1]?.pressed;padKeys.ShiftLeft=pad.buttons[5]?.pressed;padKeys.KeyR=pad.buttons[3]?.pressed;padKeys.KeyE=pad.buttons[4]?.pressed;if(pad.buttons[2]?.pressed&&!gamepadPrevious.item)releaseItem();if(pad.buttons[9]?.pressed&&!gamepadPrevious.pause)pauseGame();gamepadPrevious={item:pad.buttons[2]?.pressed,pause:pad.buttons[9]?.pressed}}
function frame(){
 requestAnimationFrame(frame);const raw=clock.getDelta(),dt=Math.min(raw,.1);pollGamepad();frameAverage=lerp(frameAverage,Math.min(raw,.1),.015);if(quality==='auto'&&!autoLow&&time>12&&frameAverage>.035){autoLow=true;applyQuality()}
 if(mode==='paused'){if(motorGain)motorGain.gain.value=0;renderer.render(scene,camera);return}time+=dt;
 if(mode==='countdown'){count-=dt;const txt=count>.5?String(Math.ceil(count-.5)):'GO!';if(txt!==lastCount){$('countdown').textContent=txt;$('countdown').classList.remove('pop');void $('countdown').offsetWidth;$('countdown').classList.add('pop');lastCount=txt;playTone(txt==='GO!'?880:440,.16,'square',.03)}if(count<=0){mode='race';$('countdown').textContent='';if(autoGas||pressed('ArrowUp')||pressed('KeyW'))activateBoost(.75,'スタートダッシュ！');else toast(touch?'GOを押して加速！':'↑ または W を押して加速！');}}
 else if(mode==='race'){accumulator+=Math.min(raw,.15);let loops=0;while(accumulator>=1/60&&mode==='race'&&loops<9){raceStep(1/60);accumulator-=1/60;loops++}hudClock+=dt;if(hudClock>.05){updateHUD();hudClock=0}}
 else if(mode==='finished'){if(resultDelay>0){resultDelay-=dt;if(resultDelay<=0)showResults()}for(const r of racers){r.speed=Math.max(0,r.speed-dt*24);r.d+=r.speed*dt;placeKart(r,dt)}}
 else if(mode==='menu'){for(const b of boxes){b.mesh.rotation.x=time*.4;b.mesh.rotation.y=time;b.mesh.position.y=b.base+Math.sin(time*2)*.4}for(const c of coins)c.mesh.rotation.y=time*2}
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.scale.multiplyScalar(Math.max(0,1-dt*2));if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1)}}
 if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').style.opacity=0}if(bannerTime>0){bannerTime-=dt;if(bannerTime<=0)$('raceBanner').classList.remove('show')}shake=Math.max(0,shake-dt);hitFlash=Math.max(0,hitFlash-dt);rankFlash=Math.max(0,rankFlash-dt);
 updateCamera(dt);animateEnvironment(dt);drawEffects(dt);if(motorGain){motorGain.gain.setTargetAtTime(soundOn&&mode==='race'?.017:0,audioContext.currentTime,.1);motor.frequency.setTargetAtTime(43+(racers[0]?.speed||0)*1.45+(drifting?15:0),audioContext.currentTime,.1)}if(soundOn&&mode==='race'&&time-lastNote>.24){lastNote=time;const notes=[261.63,0,329.63,392,0,523.25,440,392,261.63,0,329.63,293.66,392,329.63,293.66,0],n=notes[Math.floor(time/.24)%notes.length];if(n)playTone(n,.14,'triangle',.017)}
 renderer.render(scene,camera);renderGarage();
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();fxWidth=$('fx').width=innerWidth;fxHeight=$('fx').height=innerHeight;applyQuality()}
function savePreferences(){try{localStorage.setItem('aurora-preferences',JSON.stringify({autoGas,quality,selectedColor,selectedKart,viewMode}))}catch{}}
function loadPreferences(){try{const p=JSON.parse(localStorage.getItem('aurora-preferences')||'null');if(p){autoGas=!!p.autoGas;if(['auto','high','low'].includes(p.quality))quality=p.quality;if(Number.isInteger(p.selectedColor)&&p.selectedColor>=0&&p.selectedColor<4)selectedColor=p.selectedColor;if(Number.isInteger(p.selectedKart)&&p.selectedKart>=0&&p.selectedKart<3)selectedKart=p.selectedKart;if([0,1,2].includes(p.viewMode))viewMode=p.viewMode}}catch{}$('autoGas').setAttribute('aria-checked',String(autoGas));$('quality').value=quality}
function refreshSelections(){for(const key of['track','color','kart','mode'])document.querySelectorAll('[data-'+key+']').forEach(b=>{const value={track:selectedTrack,color:selectedColor,kart:selectedKart,mode:gameMode}[key],active=String(value)===b.dataset[key];b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});$('colorName').textContent=colorNames[selectedColor];$('difficulty').disabled=gameMode==='trial';$('courseMeta').textContent=gameMode==='grandprix'?'3 RACES · AURORA CUP':gameMode==='trial'?'3 LAPS · GHOST':'3 LAPS · 8 RACERS';$('modeDescription').textContent=gameMode==='grandprix'?'3コースの合計ポイントで、カップ王者を決める。':gameMode==='trial'?'ライバルは自己ベスト。ゴーストと最速の3周へ。':'8台で競う、3周の真剣勝負。';$('start').innerHTML=gameMode==='grandprix'?'グランプリに挑む <span>↗</span>':gameMode==='trial'?'タイムアタック <span>↗</span>':'レースをはじめる <span>↗</span>';readBest()}
function openHelp(){helpPaused=false;if(mode==='race'||mode==='countdown'){pauseGame();helpPaused=true;$('pausePanel').hidden=true}$('helpPanel').hidden=false}
function closeHelp(){$('helpPanel').hidden=true;if(helpPaused&&mode==='paused')pauseGame();helpPaused=false}
function bind(){
 window.addEventListener('resize',resize);window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)&&mode!=='menu')e.preventDefault();if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){if(!$('helpPanel').hidden)closeHelp();else pauseGame()}if(e.code==='Space'&&!e.repeat)releaseItem();if(e.code==='KeyE'&&!e.repeat)doTrick();if(e.code==='KeyC'&&!e.repeat){viewMode=(viewMode+1)%3;savePreferences();if(mode==='race')toast(['チェイスカメラ','ワイドカメラ','ローカメラ'][viewMode])}if(e.code==='Enter'&&mode==='menu'&&!['SELECT','BUTTON'].includes(document.activeElement.tagName)&&$('helpPanel').hidden)beginSession();keys[e.code]=true});window.addEventListener('keyup',e=>{keys[e.code]=false});window.addEventListener('blur',()=>{keys={};padKeys={};if(mode==='race'||mode==='countdown')pauseGame()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='race'||mode==='countdown'))pauseGame()});
 $('start').onclick=beginSession;$('again').onclick=beginSession;$('restart').onclick=startRace;$('nextRace').onclick=nextGrandPrix;$('back').onclick=backMenu;$('selectTrack').onclick=backMenu;$('pause').onclick=pauseGame;$('resume').onclick=pauseGame;$('sound').onclick=enableAudio;$('item').onclick=releaseItem;$('help').onclick=openHelp;$('closeHelp').onclick=closeHelp;$('difficulty').onchange=readBest;
 $('autoGas').onclick=()=>{autoGas=!autoGas;$('autoGas').setAttribute('aria-checked',String(autoGas));savePreferences()};$('quality').onchange=()=>{quality=$('quality').value;applyQuality()};
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{gameMode=b.dataset.mode;if(gameMode==='grandprix')selectedTrack=0;refreshSelections();buildCourse()});document.querySelectorAll('[data-track]').forEach(b=>b.onclick=()=>{if(gameMode==='grandprix'){selectedTrack=Number(b.dataset.track);toast('グランプリは01 → 02 → 03の順に走ります')}else selectedTrack=Number(b.dataset.track);menuAngle=0;refreshSelections();buildCourse()});
 document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{selectedColor=Number(b.dataset.color);refreshSelections();savePreferences();buildCourse()});document.querySelectorAll('[data-kart]').forEach(b=>b.onclick=()=>{selectedKart=Number(b.dataset.kart);refreshSelections();savePreferences();buildCourse()});
 document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys[b.dataset.key]=true;b.style.background='#dcff7e99';if(b.dataset.key==='KeyE')doTrick()});for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{keys[b.dataset.key]=false;b.style.background=''})});refreshSelections();
}

const sharedGeometries=new Set([unitBox,ball,cylinder,cone,tireGeometry,torusGeometry,roundedGeometry]);
function disposeUnique(root){root.traverse(o=>{if(o.geometry&&!sharedGeometries.has(o.geometry))o.geometry.dispose();if(o.material&&!Array.from(materialCache.values()).includes(o.material)){if(o.material.map&&o.material.map!==glowTexture)o.material.map.dispose();o.material.dispose()}})}
function clearAtmosphere(){if(atmosphere){scene.remove(atmosphere);disposeUnique(atmosphere)}if(ghostModel){scene.remove(ghostModel);ghostModel.traverse(o=>{if(o.isMesh)o.material.dispose()});ghostModel=null}for(const s of shadowDiscs){scene.remove(s);s.material.dispose()}for(const s of skidSegments){scene.remove(s.mesh);s.mesh.material.dispose()}shadowDiscs=[];skidSegments=[];animatedObjects=[];skyMaterial=null;waterMaterial=null;auroraMaterial=null;atmosphere=null;}
function addGlow(parent,x,y,z,color,size){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.position.set(x,y,z);sprite.scale.setScalar(size);parent.add(sprite);return sprite}
function radialTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.17,'rgba(255,255,255,.65)');g.addColorStop(.45,'rgba(255,255,255,.13)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)}
const glowTexture=radialTexture();

function terrainHeight(x,z){
 let nearest=Infinity,height=0;for(let i=0;i<frames.length;i+=5){const p=frames[i].p,d=(p.x-x)**2+(p.z-z)**2;if(d<nearest){nearest=d;height=p.y}}
 const dist=Math.sqrt(nearest),radius=Math.sqrt(x*x+((z+150)/1.07)**2),coast=clamp((radius-345)/75,0,1);
 const land=Math.max(-3.4,height-.55-Math.max(0,dist-15)*.42);
 return lerp(land,-12,coast*coast*(3-2*coast));
}
function createTerrain(){
 const rings=38,sides=104,pos=[0,terrainHeight(0,-150),-150],colors=[],index=[],cfg=courses[selectedTrack];
 const grass=new THREE.Color(cfg.ground),sand=new THREE.Color(selectedTrack===2?0x667fa8:cfg.edge);
 function colorAt(x,y,z){const c=grass.clone().lerp(sand,clamp((-y-1)/4,0,.85));c.multiplyScalar(.94+(Math.sin(x*.39+z*.73)*.5+.5)*.1);colors.push(c.r,c.g,c.b)}colorAt(0,pos[1],-150);
 for(let r=1;r<=rings;r++)for(let i=0;i<sides;i++){const angle=i/sides*TAU,rad=r/rings*425,x=Math.cos(angle)*rad,z=-150+Math.sin(angle)*rad*1.07,y=terrainHeight(x,z);pos.push(x,y,z);colorAt(x,y,z)}
 for(let i=0;i<sides;i++)index.push(0,1+(i+1)%sides,1+i);
 for(let r=1;r<rings;r++)for(let i=0;i<sides;i++){const a=1+(r-1)*sides+i,b=1+(r-1)*sides+(i+1)%sides,c=1+r*sides+i,d=1+r*sides+(i+1)%sides;index.push(a,b,c,b,d,c)}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(index);geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));m.receiveShadow=true;m.userData.keep=true;return m;
}

function enhanceWorld(){
 const cfg=courses[selectedTrack],night=selectedTrack===2;atmosphere=new THREE.Group();scene.add(atmosphere);
 const road=mat(cfg.road);road.roughness=night?.42:.82;road.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadWorld=(modelMatrix*vec4(position,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadWorld;').replace('#include <color_fragment>','#include <color_fragment>\nfloat roadGrain=fract(sin(dot(vRoadWorld.xz,vec2(127.1,311.7)))*43758.5453);diffuseColor.rgb*=.92+roadGrain*.16;');
 };road.customProgramCacheKey=()=> 'aurora-road-grain-v2';road.needsUpdate=true;mat(0xdfff87).emissive.set(0x7ea738);mat(0xdfff87).emissiveIntensity=.35;

 skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{topColor:{value:new THREE.Color(night?0x080d29:selectedTrack===1?0x8066a3:0x2b85be)},bottomColor:{value:new THREE.Color(cfg.fog)},sunColor:{value:new THREE.Color(night?0x89a8d6:0xffe6bd)},sunDir:{value:new THREE.Vector3(-.55,.23,-.65).normalize()}},vertexShader:`varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDir;uniform vec3 topColor,bottomColor,sunColor,sunDir;void main(){vec3 d=normalize(vDir);float h=clamp(d.y*1.5,0.,1.);vec3 col=mix(bottomColor,topColor,pow(h,.7));float s=max(0.,dot(d,sunDir));col+=sunColor*pow(s,400.)*.75+sunColor*pow(s,15.)*.18;gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(1200,32,16),skyMaterial);sky.renderOrder=-10;sky.userData.sky=true;atmosphere.add(sky);
 waterMaterial=new THREE.ShaderMaterial({transparent:false,uniforms:{uTime:{value:0},waterColor:{value:new THREE.Color(cfg.water)},highlight:{value:new THREE.Color(night?0x689cd1:0xb6f0e6)}},vertexShader:`varying vec3 vWorld;void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,fragmentShader:`varying vec3 vWorld;uniform float uTime;uniform vec3 waterColor,highlight;void main(){float a=sin(vWorld.x*.09+vWorld.z*.08+uTime*.7);float b=sin(vWorld.x*.045-vWorld.z*.19-uTime*.9);float sparkle=pow(max(0.,a*b),12.);float waves=sin(vWorld.z*.3+sin(vWorld.x*.09+uTime)*1.6+uTime*1.1);vec3 col=waterColor*(.8+.12*waves)+highlight*sparkle*.42;float dist=length(vWorld.xz-cameraPosition.xz);col=mix(col,waterColor,clamp(dist/1500.,0.,.7));gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const water=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),waterMaterial);water.rotation.x=-Math.PI/2;water.position.set(0,-7,-150);atmosphere.add(water);
 if(night){const vertices=[];for(let i=0;i<900;i++){const a=rand(i+3)*TAU,h=.12+rand(i+19)*.88,r=Math.sqrt(1-h*h)*950;vertices.push(Math.cos(a)*r,h*950,Math.sin(a)*r-150)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));atmosphere.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xd9eaff,size:1.4,transparent:true,opacity:.85,depthWrite:false})));
 auroraMaterial=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform float uTime;void main(){float wave=.3+.16*sin(vUv.x*9.+uTime*.13)+.07*sin(vUv.x*21.-uTime*.2);float band=exp(-pow((vUv.y-wave)*10.,2.));float curtain=.55+.45*sin(vUv.x*170.+sin(vUv.x*15.+uTime*.2)*4.);float fade=sin(vUv.x*3.14159);vec3 color=mix(vec3(.16,.85,.65),vec3(.42,.25,.88),vUv.x);gl_FragColor=vec4(color,band*curtain*fade*.48);
#include <colorspace_fragment>
}`});let aurora=new THREE.Mesh(new THREE.PlaneGeometry(1300,420),auroraMaterial);aurora.position.set(0,230,-780);atmosphere.add(aurora);
 }
 // Banks connect elevated road surfaces to the terrain.
 for(const side of[-1,1]){const pos=[];for(let i=0;i<frames.length;i++){const a=sample(i/frames.length*length,side*16.9).p,b=sample((i+1)/frames.length*length,side*16.9).p;for(const p of[a,new THREE.Vector3(a.x,-5,a.z),b,b,new THREE.Vector3(a.x,-5,a.z),new THREE.Vector3(b.x,-5,b.z)])pos.push(p.x,p.y,p.z)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat(selectedTrack===1?0xa75f48:night?0x414b72:0xc9b890));m.material.side=THREE.DoubleSide;world.add(m)}
 // Reflective safety barriers, panels and road studs.
 for(let i=0;i<Math.floor(length/12);i++){const d=i*12;for(let side of[-1,1]){const f=sample(d,side*14.1),g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.yaw;box(night?0x3b466b:0xf0ede3,g,0,1.15,0,.65,1.5,11.7);box(cfg.accent,g,0,1.95,0,.78,.18,11.8);box(night?0xaab8ff:0x304e64,g,-side*.34,1.32,0,.04,.5,3.2);world.add(g);if(night&&i%4===0){const glow=addGlow(atmosphere,f.p.x,f.p.y+2.1,f.p.z,0x8cbcff,3);glow.material.opacity=.4}}}
 // Direction chevrons anticipate the next curve.
 for(let i=0;i<20;i++){const d=(i+.5)/20*length,f=sample(d),next=sample(d+20),turn=Math.atan2(Math.sin(next.yaw-f.yaw),Math.cos(next.yaw-f.yaw));if(Math.abs(turn)<.07)continue;const side=turn>0?-1:1,loc=sample(d,side*18);const group=new THREE.Group();group.position.copy(loc.p);group.rotation.y=loc.yaw;box(0x223c50,group,0,4.3,0,5,2.4,.35);for(let j=0;j<2;j++){let bar=box(0xe5ff93,group,side*(j?-.25:.25),4.3+(j?-.4:.4),.21,1.8,.3,.07);bar.rotation.z=side*(j?-.55:.55)}box(0xb5c7ce,group,0,2,0,.25,4,.25);world.add(group)}
 // Stadium seating at the start, with an animated audience.
 for(let side of[-1,1])for(let row=0;row<3;row++){const f=sample(length-25,side*(23+row*3));const g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.yaw;box(0x3c5868,g,0,1+row*1.5,0,2.8,2+row*3,31);for(let j=0;j<12;j++){const col=[0xffb85e,0xa7eadc,0xfb8f9e,0xcee0f7][(row+j)%4];sphere(col,g,0,3+row*2,j*2.4-13,.49,.75,.49);sphere(0xf4d9b4,g,0,4+row*2,j*2.4-13,.42)}world.add(g)}
 // Course-specific large landmarks.
 if(selectedTrack===0){
  for(let k=0;k<4;k++){const a=k/4*TAU+.6,p=new THREE.Vector3(Math.cos(a)*430,-5.6,-150+Math.sin(a)*450);const boat=new THREE.Group();boat.position.copy(p);boat.position.y=-5.6;rounded(0xf8edcf,boat,0,0,0,5,2,12);box(0x996850,boat,0,7,0,.25,14,.25);const sail=new THREE.Mesh(new THREE.ConeGeometry(5,11,3),mat(k%2?0xffa778:0xe8f0d1));sail.scale.z=.12;sail.position.set(1.5,8,0);boat.add(sail);boat.rotation.y=k;atmosphere.add(boat);animatedObjects.push({mesh:boat,type:'boat',base:boat.position.y,phase:k})}
  for(let k=0;k<12;k++){const p=roadside(length*(.42+k*.008),-36);let g=new THREE.Group();g.position.copy(p);mesh(cone,k%2?0xff936f:0xffe68c,g,0,4,0,3.8,2,3.8);box(0xf1d6a4,g,0,2,0,.18,4,.18);box(0xe5f0e8,g,1.1,.6,0,1.6,.3,3.4);world.add(g)}
 }else if(selectedTrack===1){
  for(const q of[.28,.72]){const f=sample(length*q),arch=new THREE.Group();arch.position.copy(f.p);arch.rotation.y=f.yaw;for(let side of[-1,1]){mesh(cylinder,0xb4694c,arch,side*25,15,0,9,30,11);sphere(0xbe7757,arch,side*18,29,0,12,7,9)}box(0xb66e4e,arch,0,32,0,40,8,15);world.add(arch)}
  for(let k=0;k<22;k++){const p=roadside(length*(.46+k*.006),k%2?-40:40);const stack=new THREE.Group();stack.position.copy(p);for(let j=0;j<4;j++)mesh(cylinder,j%2?0xb66d51:0xd79064,stack,0,j*6+3,0,6-j*.6,6,6-j*.6);world.add(stack)}
  for(let i=0;i<3;i++){const balloon=new THREE.Group();let p=sample(length*(.25+i*.27),-130).p;balloon.position.copy(p);balloon.position.y+=85;sphere([0xf2bb68,0xffaa9b,0x9ad6cc][i],balloon,0,0,0,11,15,11);rounded(0x815c4c,balloon,0,-21,0,5,3,4);for(const x of[-2,2])box(0xe7d3b0,balloon,x,-16,0,.12,9,.12);atmosphere.add(balloon);animatedObjects.push({mesh:balloon,type:'balloon',base:balloon.position.y,phase:i})}
 }else{
  // A neon arcade tunnel, with a clear road through its center.
  for(let i=0;i<12;i++){const f=sample(length*.5+i*6),g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.yaw;box(0x223551,g,-15,6,0,1,12,1);box(0x223551,g,15,6,0,1,12,1);box(0x223551,g,0,12,0,31,1,1);for(const side of[-1,1])box(i%2?0x9b88e6:0x68bac6,g,side*14.45,6,0,.12,11,.4).material=mat(i%2?0xa98dff:0x7aede2,true);box(0x9d8eff,g,0,11.45,0,28,.1,.4).material=mat(0xb89fff,true);world.add(g)}
  for(let i=0;i<26;i++){const f=sample(i/26*length,(i%2?1:-1)*25),g=new THREE.Group();g.position.copy(f.p);mesh(cone,i%2?0x678bbc:0x9977c1,g,0,4,0,2,8,2);world.add(g);addGlow(atmosphere,f.p.x,f.p.y+3,f.p.z,i%2?0x74d8ff:0xbc92ff,10)}
 }
 for(const b of boxes){b.mesh.material.roughness=.15;const edges=new THREE.LineSegments(new THREE.EdgesGeometry(b.mesh.geometry),new THREE.LineBasicMaterial({color:0xd2fff6,transparent:true,opacity:.85}));b.mesh.add(edges);addGlow(b.mesh,0,0,0,0x66e8ff,6);}
 if(ambientLight){ambientLight.intensity=night?1.45:2.0;ambientLight.color.set(night?0xa3b5ff:0xe0f5ff);ambientLight.groundColor.set(night?0x373452:0xa69178)}
 if(sunLight){sunLight.intensity=night?1.2:3.0;sunLight.color.set(selectedTrack===1?0xffc394:night?0xc8cfff:0xfff0d4)}
}
function finishWorldSetup(){
 const xs=frames.map(f=>f.p.x),zs=frames.map(f=>f.p.z);mapBounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 for(const r of racers){const disc=new THREE.Mesh(new THREE.PlaneGeometry(6,7),new THREE.MeshBasicMaterial({map:glowTexture,color:0x071421,transparent:true,opacity:.44,depthWrite:false}));disc.rotation.x=-Math.PI/2;scene.add(disc);shadowDiscs.push(disc)}
 if(gameMode==='trial')for(const b of boxes)b.mesh.visible=false;
 updateGarage();
}
function updateGarage(){
 if(!garageScene){garageScene=new THREE.Scene();garageCamera=new THREE.PerspectiveCamera(36,1,.1,100);garageCamera.position.set(7.9,4.8,8.8);garageCamera.lookAt(0,1.6,0);garageScene.add(new THREE.HemisphereLight(0xecfaff,0x254252,3));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(3,8,5);garageScene.add(key);const rim=new THREE.DirectionalLight(0x75d9ff,3);rim.position.set(-5,4,-4);garageScene.add(rim);garageFloor=new THREE.Mesh(new THREE.CircleGeometry(4.5,64),new THREE.MeshBasicMaterial({color:0xb1edee,transparent:true,opacity:.08,depthWrite:false}));garageFloor.rotation.x=-Math.PI/2;garageFloor.position.y=-.07;garageScene.add(garageFloor);const ring=new THREE.Mesh(new THREE.TorusGeometry(4.4,.025,4,80),mat(0xa1eff1,true));ring.rotation.x=-Math.PI/2;garageScene.add(ring)}
 if(garageModel){garageScene.remove(garageModel);garageModel.userData.shieldMesh.material.dispose()}
 garageModel=kart(palette[selectedColor],selectedKart);garageScene.add(garageModel);garageModel.rotation.y=-.32;
 const cfg=kartTypes[selectedKart];$('garageName').textContent=cfg.name;$('garageDescription').textContent=cfg.description;$('garageClass').textContent=cfg.class;$('garageNumber').textContent=`0${selectedKart+1} / 03`;$('kartRole').textContent=cfg.role;$('kartStats').innerHTML=['最高速','加速','旋回'].map((label,i)=>`<div class="kart-stat"><span>${label}</span><b><i style="width:${cfg.stats[i]}%"></i></b></div>`).join('');
}
function renderGarage(){if(mode!=='menu'||innerWidth<=850||!garageScene)return;const x=innerWidth*.51,y=innerHeight*.3,w=innerWidth*.45,h=innerHeight*.48;garageCamera.aspect=w/h;garageCamera.updateProjectionMatrix();garageModel.rotation.y=-.35+Math.sin(time*.28)*.38;garageModel.userData.driver.rotation.y=Math.sin(time*.4)*.08;renderer.autoClear=false;renderer.clearDepth();renderer.setScissorTest(true);renderer.setScissor(x,y,w,h);renderer.setViewport(x,y,w,h);renderer.render(garageScene,garageCamera);renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.autoClear=true;}
function animateEnvironment(dt){
 if(waterMaterial)waterMaterial.uniforms.uTime.value=time;if(auroraMaterial)auroraMaterial.uniforms.uTime.value=time;
 if(atmosphere){const sky=atmosphere.children.find(x=>x.userData.sky);if(sky)sky.position.copy(camera.position)}
 for(const o of animatedObjects){o.mesh.position.y=o.base+Math.sin(time*.7+o.phase)*(o.type==='boat'?.4:2);o.mesh.rotation.z=Math.sin(time*.55+o.phase)*.025}
 for(let i=0;i<shadowDiscs.length;i++){const r=racers[i],p=sample(r.d,r.lane);shadowDiscs[i].position.copy(p.p).y+=.23;shadowDiscs[i].rotation.z=-p.yaw;shadowDiscs[i].material.opacity=.45-(r===racers[0]?Math.min(air,.9)*.12:0)}
 if(sunLight&&racers[0]){const p=racers[0].model.position;sunLight.position.set(p.x-40,p.y+65,p.z+30);sunLight.target.position.copy(p);sunLight.target.updateMatrixWorld()}
 for(let i=skidSegments.length-1;i>=0;i--){const s=skidSegments[i];s.life-=dt;s.mesh.material.opacity=Math.min(.32,s.life*.1);if(s.life<=0){scene.remove(s.mesh);s.mesh.material.dispose();skidSegments.splice(i,1)}}
}
function leaveSkid(r){if(skidSegments.length>160)return;for(const side of[-1,1]){const f=sample(r.d-1.3,r.lane+side*1.7),m=new THREE.Mesh(unitBox,new THREE.MeshBasicMaterial({color:0x0a1721,transparent:true,opacity:.3,depthWrite:false}));m.position.copy(f.p).y+=.24;m.scale.set(.37,.01,2.0);m.rotation.y=f.yaw;scene.add(m);skidSegments.push({mesh:m,life:6})}}
function applyQuality(){const lightweight=quality==='low'||(quality==='auto'&&(touch||autoLow));renderer.setPixelRatio(Math.min(devicePixelRatio,lightweight?1:quality==='high'?2:1.6));renderer.shadowMap.enabled=!lightweight;renderer.shadowMap.type=THREE.PCFSoftShadowMap;if(sunLight){sunLight.castShadow=!lightweight;sunLight.shadow.mapSize.set(1024,1024);sunLight.shadow.camera.left=-50;sunLight.shadow.camera.right=50;sunLight.shadow.camera.top=50;sunLight.shadow.camera.bottom=-50;sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=170;sunLight.shadow.bias=-.0006;sunLight.shadow.normalBias=.1;sunLight.shadow.camera.updateProjectionMatrix()}savePreferences()}

try{
 renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.2,2200);
 ambientLight=new THREE.HemisphereLight(0xe0f5ff,0xa69178,2);scene.add(ambientLight);sunLight=new THREE.DirectionalLight(0xfff0d4,3);sunLight.position.set(-40,65,30);scene.add(sunLight);scene.add(sunLight.target);
 loadPreferences();resize();buildCourse();bind();frame();
 $('game').addEventListener('webglcontextlost',event=>{event.preventDefault();if(mode==='race'||mode==='countdown')pauseGame();$('error').hidden=false});
}catch(error){console.error(error);$('error').hidden=false}
