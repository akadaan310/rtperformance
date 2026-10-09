"""Generates supabase/migrations/20261009000700_exercise_library.sql from the curated starter list.
Run: python3 scripts/generate-exercise-library.py"""
import json, pathlib

# name, category, difficulty, muscles, equipment, measurement, sets, reps, rest, tempo, description, cues, subs
E = [
 ("Back Squat","squat","intermediate",["quadriceps","glutes","adductors","core"],["barbell","rack"],"reps_weight",4,"5",180,"3010","Barbell high-bar or low-bar squat to a depth the athlete controls.",["Brace before you descend","Knees track over toes","Drive the floor away"],["Goblet Squat","Front Squat","Leg Press"]),
 ("Front Squat","squat","advanced",["quadriceps","glutes","upper back"],["barbell","rack"],"reps_weight",4,"5",180,"3010","Front-rack squat emphasising an upright torso.",["Elbows high","Stay tall through the bottom","Full foot pressure"],["Goblet Squat","Back Squat"]),
 ("Goblet Squat","squat","beginner",["quadriceps","glutes","core"],["dumbbell","kettlebell"],"reps_weight",3,"8-10",90,"3010","Squat holding one bell at the chest; the default squat pattern teacher.",["Bell close to the sternum","Sit between the hips","Exhale at the top"],["Box Squat","Leg Press"]),
 ("Box Squat","squat","beginner",["quadriceps","glutes"],["box","bodyweight"],"reps_weight",3,"10",75,"2111","Squat to a box to standardise depth.",["Reach the hips back","Touch, don't crash","Stand tall"],["Goblet Squat"]),
 ("Leg Press","squat","beginner",["quadriceps","glutes"],["machine"],"reps_weight",3,"10-12",90,"2010","Machine squat pattern with a fixed path.",["Low back stays on the pad","Controlled depth","Don't lock out hard"],["Goblet Squat","Back Squat"]),
 ("Bulgarian Split Squat","lunge","intermediate",["quadriceps","glutes","adductors"],["dumbbell","bench"],"reps_weight",3,"8 each",90,"3010","Rear-foot-elevated split squat.",["Front foot flat","Hips square","Slight forward lean"],["Reverse Lunge","Step-Up"]),
 ("Reverse Lunge","lunge","beginner",["quadriceps","glutes"],["dumbbell","bodyweight"],"reps_weight",3,"10 each",75,"2010","Step back into a lunge and return to standing.",["Long step back","Front knee stable","Push through the front heel"],["Step-Up","Bulgarian Split Squat"]),
 ("Walking Lunge","lunge","intermediate",["quadriceps","glutes"],["dumbbell","bodyweight"],"reps_weight",3,"12 each",90,None,"Continuous alternating forward lunges.",["Tall torso","Controlled knee touch","Rhythmic breathing"],["Reverse Lunge"]),
 ("Step-Up","lunge","beginner",["quadriceps","glutes"],["box","dumbbell"],"reps_weight",3,"10 each",75,"2010","Step onto a box driving through the working leg.",["Whole foot on the box","Minimise push from trail leg","Control the descent"],["Reverse Lunge"]),
 ("Conventional Deadlift","hinge","intermediate",["hamstrings","glutes","back","grip"],["barbell"],"reps_weight",4,"3-5",180,None,"Barbell pull from the floor with a conventional stance.",["Bar over midfoot","Pull the slack out","Push the floor, hips and shoulders rise together"],["Trap Bar Deadlift","Romanian Deadlift"]),
 ("Trap Bar Deadlift","hinge","beginner",["quadriceps","hamstrings","glutes","grip"],["trap bar"],"reps_weight",4,"5",150,None,"Hex-bar deadlift; a forgiving hinge for most athletes.",["Centered in the handles","Chest proud","Stand up fast"],["Kettlebell Deadlift","Conventional Deadlift"]),
 ("Romanian Deadlift","hinge","intermediate",["hamstrings","glutes"],["barbell","dumbbell"],"reps_weight",3,"8",120,"3010","Hip hinge from the top with soft knees.",["Hips back, not down","Bar stays close","Stop when hips stop"],["Kettlebell Deadlift","Hip Thrust"]),
 ("Kettlebell Deadlift","hinge","beginner",["hamstrings","glutes"],["kettlebell"],"reps_weight",3,"10",75,"2010","Hinge pattern teacher with a bell between the feet.",["Flat back","Lats engaged","Squeeze glutes at the top"],["Romanian Deadlift"]),
 ("Hip Thrust","hinge","beginner",["glutes","hamstrings"],["barbell","bench"],"reps_weight",3,"10",90,"2011","Shoulder-elevated hip extension.",["Chin tucked","Ribs down","Pause at full extension"],["Glute Bridge"]),
 ("Glute Bridge","hinge","beginner",["glutes"],["bodyweight","mat"],"reps",3,"12-15",60,"2011","Floor-based hip extension.",["Feet under knees","Push through heels","Hold the top"],["Hip Thrust"]),
 ("Kettlebell Swing","power","intermediate",["glutes","hamstrings","core"],["kettlebell"],"reps_weight",5,"15",60,None,"Ballistic two-hand hip hinge.",["Hike the bell back","Snap the hips","Float, don't lift with the arms"],["Kettlebell Deadlift"]),
 ("Bench Press","push","intermediate",["chest","triceps","shoulders"],["barbell","bench","rack"],"reps_weight",4,"5-8",150,"3010","Barbell press from the chest.",["Shoulder blades set","Feet planted","Touch and drive back over the shoulders"],["Dumbbell Bench Press","Push-Up"]),
 ("Dumbbell Bench Press","push","beginner",["chest","triceps","shoulders"],["dumbbell","bench"],"reps_weight",3,"8-10",90,"3010","Flat bench press with dumbbells.",["Elbows ~45°","Control the stretch","Press together"],["Push-Up","Bench Press"]),
 ("Incline Dumbbell Press","push","beginner",["upper chest","shoulders","triceps"],["dumbbell","bench"],"reps_weight",3,"10",90,"3010","Pressing on a 30° incline bench.",["Low incline","Wrists stacked","Full range"],["Push-Up"]),
 ("Push-Up","push","beginner",["chest","triceps","core"],["bodyweight"],"reps",3,"AMRAP",60,"2010","Bodyweight horizontal press.",["Rigid plank","Hands under shoulders","Chest to fist height"],["Incline Push-Up"]),
 ("Incline Push-Up","push","beginner",["chest","triceps"],["bodyweight","bench"],"reps",3,"10-12",60,"2010","Push-up with hands elevated to reduce load.",["Body in one line","Lower under control"],["Push-Up"]),
 ("Overhead Press","push","intermediate",["shoulders","triceps","upper back"],["barbell","rack"],"reps_weight",4,"5",150,"2010","Standing strict barbell press.",["Squeeze glutes","Head through at the top","Bar path straight"],["Seated Dumbbell Shoulder Press","Landmine Press"]),
 ("Seated Dumbbell Shoulder Press","push","beginner",["shoulders","triceps"],["dumbbell","bench"],"reps_weight",3,"8-10",90,"2010","Seated vertical press.",["Back against the pad","Elbows slightly forward"],["Landmine Press"]),
 ("Landmine Press","push","beginner",["shoulders","chest","core"],["barbell","landmine"],"reps_weight",3,"8 each",75,None,"Angled single-arm press; shoulder-friendly.",["Staggered stance","Reach long at the top"],["Seated Dumbbell Shoulder Press"]),
 ("Dip","push","advanced",["chest","triceps"],["dip bars"],"reps",3,"6-10",90,"2010","Bodyweight dip on parallel bars.",["Shoulders down","Controlled depth"],["Push-Up"]),
 ("Pull-Up","pull","advanced",["lats","biceps","upper back"],["pull-up bar"],"reps",4,"AMRAP",120,"2010","Strict overhand vertical pull.",["Start from a dead hang","Drive elbows down","Chest to the bar"],["Lat Pulldown","Assisted Pull-Up"]),
 ("Assisted Pull-Up","pull","beginner",["lats","biceps"],["band","pull-up bar","machine"],"reps",3,"6-8",90,"2010","Pull-up with band or machine assistance.",["Full hang","Controlled lowering"],["Lat Pulldown"]),
 ("Lat Pulldown","pull","beginner",["lats","biceps"],["cable","machine"],"reps_weight",3,"10-12",75,"2010","Cable vertical pull.",["Slight lean back","Pull to upper chest","Control the return"],["Assisted Pull-Up"]),
 ("Barbell Row","pull","intermediate",["upper back","lats","biceps"],["barbell"],"reps_weight",4,"6-8",120,"2010","Bent-over barbell row.",["Hinge to ~45°","Pull to the lower ribs","No torso swing"],["One-Arm Dumbbell Row","Chest-Supported Row"]),
 ("One-Arm Dumbbell Row","pull","beginner",["lats","upper back"],["dumbbell","bench"],"reps_weight",3,"10 each",60,"2011","Supported single-arm row.",["Flat back","Elbow to the hip","Pause at the top"],["Chest-Supported Row"]),
 ("Chest-Supported Row","pull","beginner",["upper back","lats"],["dumbbell","bench"],"reps_weight",3,"10-12",75,"2011","Prone row on an incline bench.",["Chest stays on the pad","Squeeze the shoulder blades"],["One-Arm Dumbbell Row"]),
 ("Seated Cable Row","pull","beginner",["upper back","lats"],["cable"],"reps_weight",3,"10-12",75,"2011","Horizontal cable pull.",["Tall seated posture","Lead with the elbows"],["Chest-Supported Row"]),
 ("Face Pull","pull","beginner",["rear delts","upper back"],["cable","band"],"reps_weight",3,"15",60,"2011","High cable pull to the face for shoulder health.",["Thumbs back","Elbows high","Pause"],["Band Pull-Apart"]),
 ("Band Pull-Apart","pull","beginner",["rear delts","upper back"],["band"],"reps",3,"20",45,None,"Horizontal band abduction.",["Straight arms","Squeeze between the shoulder blades"],["Face Pull"]),
 ("Dumbbell Curl","accessory","beginner",["biceps"],["dumbbell"],"reps_weight",3,"10-12",60,"2010","Standing biceps curl.",["Elbows pinned","No swing"],[]),
 ("Triceps Rope Pressdown","accessory","beginner",["triceps"],["cable"],"reps_weight",3,"12-15",60,"2010","Cable elbow extension.",["Elbows by the ribs","Spread the rope at the bottom"],[]),
 ("Lateral Raise","accessory","beginner",["shoulders"],["dumbbell"],"reps_weight",3,"12-15",60,"2010","Shoulder abduction for the lateral deltoid.",["Lead with the elbows","Stop at shoulder height"],[]),
 ("Standing Calf Raise","accessory","beginner",["calves"],["machine","bodyweight"],"reps_weight",3,"12-15",60,"2111","Ankle plantar flexion.",["Full stretch","Pause at the top"],[]),
 ("Plank","core","beginner",["core"],["bodyweight","mat"],"time",3,"30-45s",45,None,"Isometric anterior core hold.",["Squeeze glutes","Ribs down","Breathe"],["Dead Bug"]),
 ("Side Plank","core","beginner",["obliques","core"],["bodyweight","mat"],"time",3,"20-30s each",45,None,"Lateral core hold.",["Stack hips","Straight line head to heel"],["Pallof Press"]),
 ("Dead Bug","core","beginner",["core"],["bodyweight","mat"],"reps",3,"8 each",45,None,"Anti-extension core pattern.",["Low back to the floor","Slow, opposite arm and leg"],["Plank"]),
 ("Pallof Press","core","beginner",["core","obliques"],["cable","band"],"reps",3,"10 each",45,"2121","Anti-rotation press.",["Square to the front","Press and hold"],["Side Plank"]),
 ("Hanging Knee Raise","core","intermediate",["core","hip flexors"],["pull-up bar"],"reps",3,"10-12",60,None,"Hanging hip and knee flexion.",["No swing","Curl the pelvis"],["Dead Bug"]),
 ("Farmer's Carry","carry","beginner",["grip","core","traps"],["dumbbell","kettlebell"],"distance",4,"40 m",90,None,"Loaded walk with weights at the sides.",["Tall posture","Short quick steps","Crush the handles"],["Suitcase Carry"]),
 ("Suitcase Carry","carry","beginner",["obliques","grip"],["dumbbell","kettlebell"],"distance",3,"30 m each",75,None,"Single-side loaded walk.",["Don't lean","Shoulders level"],["Farmer's Carry"]),
 ("Rower Intervals","conditioning","beginner",["full body"],["rower"],"time",6,"60s",60,None,"Rowing ergometer intervals.",["Legs, body, arms","Arms, body, legs on the return"],["Bike Intervals"]),
 ("Bike Intervals","conditioning","beginner",["legs"],["bike"],"time",6,"45s",75,None,"Air or spin bike intervals.",["Settle the breathing between efforts"],["Rower Intervals"]),
 ("Sled Push","conditioning","intermediate",["quadriceps","glutes","full body"],["sled"],"distance",5,"20 m",90,None,"Heavy sled drive.",["Low angle","Drive through the balls of the feet"],["Bike Intervals"]),
 ("Box Jump","power","intermediate",["legs"],["box"],"reps",4,"5",90,None,"Explosive jump onto a box.",["Land soft","Step down, don't jump down"],["Kettlebell Swing"]),
 ("Medicine Ball Slam","power","beginner",["full body","core"],["medicine ball"],"reps",4,"8",60,None,"Overhead slam for power.",["Reach tall","Slam through the floor"],["Kettlebell Swing"]),
 ("World's Greatest Stretch","mobility","beginner",["hips","thoracic spine"],["bodyweight"],"reps",2,"5 each",30,None,"Lunge with thoracic rotation.",["Elbow to instep","Rotate and reach"],[]),
 ("90/90 Hip Switch","mobility","beginner",["hips"],["bodyweight","mat"],"reps",2,"8 each",30,None,"Seated hip internal/external rotation drill.",["Tall chest","Move from the hips"],[]),
]

def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"
def arr(a):
    return "array[" + ",".join(q(x) for x in a) + "]::text[]" if a else "'{}'::text[]"

lines = ["-- RT Performance · Starter exercise library (org_id null = shared, read-only reference library).",
         "-- Generated by scripts/generate-exercise-library.py. These are movement definitions, not client prescriptions.",
         "insert into public.exercises (org_id, name, category, difficulty, muscle_groups, equipment, measurement,",
         "  default_sets, default_reps, default_rest_seconds, default_tempo, description, cues) values"]
rows = []
for (n,c,d,m,eq,meas,s,r,rest,t,desc,cues,_subs) in E:
    rows.append(f"  (null, {q(n)}, {q(c)}, {q(d)}, {arr(m)}, {arr(eq)}, {q(meas)}, {s}, {q(r)}, {rest}, {q(t)}, {q(desc)}, {arr(cues)})")
lines.append(",\n".join(rows))
lines.append("on conflict do nothing;\n")
lines.append("insert into public.exercise_substitutions (org_id, exercise_id, substitute_id)")
lines.append("select null, a.id, b.id from (values")
pairs = []
for e in E:
    for sub in e[12]:
        pairs.append(f"  ({q(e[0])}, {q(sub)})")
lines.append(",\n".join(pairs))
lines.append(") as p(ex, sub)")
lines.append("join public.exercises a on a.org_id is null and a.name = p.ex")
lines.append("join public.exercises b on b.org_id is null and b.name = p.sub")
lines.append("on conflict do nothing;\n")
names = {e[0] for e in E}
for e in E:
    for sub in e[12]:
        assert sub in names, (e[0], sub)
out = pathlib.Path(__file__).resolve().parent.parent / "supabase/migrations/20261009000700_exercise_library.sql"
out.write_text("\n".join(lines))
print(f"wrote {len(E)} exercises, {len(pairs)} substitutions")
