import { readFileSync, writeFileSync } from 'node:fs';
const map=JSON.parse(readFileSync('_mapping.json','utf8'));
const db=JSON.parse(readFileSync('_db.json','utf8'));
const byId=Object.fromEntries(db.map(d=>[d.id,d]));
// Corrections manuelles (matchs auto erronés)
const OVERRIDE={
  ex_band_curl:'Dumbbell_Bicep_Curl',
  ex_band_pushdown:'Triceps_Pushdown',
  ex_dips_assisted:'Dips_-_Chest_Version',
  ex_bench_barbell:'Barbell_Bench_Press_-_Medium_Grip',
};
const BASE='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const tsMap={};
let ok=0,fail=0;
for(const [ourId,m] of Object.entries(map)){
  const dbId=OVERRIDE[ourId]||m.db;
  const img=byId[dbId].images[0];
  const url=BASE+img;
  try{
    const r=await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status);
    const buf=Buffer.from(await r.arrayBuffer());
    writeFileSync(`public/exercises/${ourId}.jpg`, buf);
    tsMap[ourId]=`/exercises/${ourId}.jpg`;
    ok++;
  }catch(e){console.error('FAIL',ourId,e.message);fail++;}
}
const ts=`// Généré : illustrations d'exercices (free-exercise-db, domaine public / Unlicense).\n`+
`// Mappées sur nos exos ; bundlées dans public/exercises/. Voir scripts de génération.\n`+
`export const EXERCISE_IMAGES: Record<string, string> = ${JSON.stringify(tsMap,null,2)};\n\n`+
`export function exerciseImage(id: string): string | undefined {\n  return EXERCISE_IMAGES[id];\n}\n`;
writeFileSync('src/data/exerciseImages.ts', ts);
console.log(`\nTéléchargées: ${ok} | échecs: ${fail} | map → src/data/exerciseImages.ts`);
