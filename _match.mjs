import { readFileSync } from 'node:fs';
const db=JSON.parse(readFileSync('_db.json','utf8'));
const ours=JSON.parse(readFileSync('_ours.json','utf8'));
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const eqMap={barre:'barbell',halteres:'dumbbell',machine:'machine',poulie:'cable',kettlebell:'kettlebell','élastique':'bands',poids_du_corps:'body only'};
const HINTS={
 ex_band_curl:['bands','curl'],ex_band_pull_apart:['band','pull','apart'],ex_band_pushdown:['band','pushdown','pressdown'],ex_band_row:['band','row'],ex_band_squat:['band','squat'],
 ex_bench_barbell:['barbell','bench','press'],ex_bench_dumbbell:['dumbbell','bench','press'],ex_bw_lunge:['bodyweight','lunge'],ex_bw_squat:['bodyweight','squat'],
 ex_calf_raise:['standing','calf','raises'],ex_calf_raise_bw:['calf','raises'],ex_chest_fly_cable:['cable','crossover'],ex_curl_barbell:['barbell','curl'],ex_curl_dumbbell:['dumbbell','bicep','curl'],
 ex_diamond_pushup:['push','ups','close','triceps'],ex_dips:['dips','chest'],ex_dips_assisted:['dips'],ex_face_pull:['face','pull'],ex_glute_bridge:['butt','lift','bridge'],
 ex_hanging_leg_raise:['hanging','leg','raise'],ex_incline_dumbbell:['incline','dumbbell','press'],ex_incline_machine:['leverage','incline','chest','press'],ex_kb_goblet_squat:['goblet','squat'],
 ex_kb_press:['kettlebell','press'],ex_kb_row:['kettlebell','row'],ex_kb_swing:['kettlebell','swing'],ex_lat_pulldown:['wide','grip','lat','pulldown'],ex_lateral_raise:['side','lateral','raise'],
 ex_leg_curl:['lying','leg','curls'],ex_leg_extension:['leg','extensions'],ex_leg_press:['leg','press'],ex_ohp_barbell:['standing','military','press'],ex_pec_deck:['butterfly'],
 ex_pike_pushup:['pike','push'],ex_plank:['plank'],ex_pullup:['pullups'],ex_pullup_assisted:['pullups'],ex_pushup:['pushups'],ex_romanian_deadlift:['romanian','deadlift'],
 ex_row_barbell:['bent','over','barbell','row'],ex_row_dumbbell:['one','arm','dumbbell','row'],ex_seated_row:['seated','cable','rows'],ex_shoulder_press_db:['dumbbell','shoulder','press'],
 ex_skullcrusher:['lying','triceps','press'],ex_squat_barbell:['barbell','full','squat'],ex_superman:['superman'],ex_triceps_pushdown:['triceps','pushdown'],
};
const out={};
for(const o of ours){
  const hints=HINTS[o.id]||norm(o.name).split(' ');
  const wantEq=eqMap[o.equipment];
  let best=null,bs=-1;
  for(const d of db){
    if(!d.images?.length) continue;
    const dn=' '+norm(d.name)+' ';
    let sc=0; for(const h of hints) if(dn.includes(' '+h+' ')||dn.includes(h)) sc+=2;
    if(wantEq&&d.equipment===wantEq) sc+=1.5;
    sc-= norm(d.name).length*0.002;
    if(sc>bs){bs=sc;best=d;}
  }
  out[o.id]={db:best.id,name:best.name,img:best.images[0],eq:best.equipment,score:+bs.toFixed(1)};
  console.log(`${o.id.padEnd(22)} ${(o.name).padEnd(32)} -> ${best.name}  [${best.equipment}] (${bs.toFixed(1)})`);
}
import('node:fs').then(fs=>fs.writeFileSync('_mapping.json',JSON.stringify(out,null,2)));
