/**
 * Cash Rail celebrations (Oct 29 2026): when a big bet cashes, Gary celebrates
 * it ESPN-style, in the scorer's number and his team's colors, doing one of ten
 * end-zone dances. This module decides which plays qualify, which dance, and
 * the art prompts; scripts/cash-rail-celebrate.js generates and stores the art.
 */

/** Uniform and backdrop per NFL team: colors only, never a logo. */
export const TEAM_LOOKS = {
  ARI: { uniform: 'a cardinal red jersey with white numerals, white pants, red socks', bg: 'deep cardinal red' },
  ATL: { uniform: 'a black jersey with red numerals outlined in white, black pants, red and black socks', bg: 'dark red' },
  BAL: { uniform: 'a purple jersey with white numerals outlined in black and gold, black pants, purple socks', bg: 'deep purple' },
  BUF: { uniform: 'a royal blue jersey with white numerals outlined in red, white pants, blue and red socks', bg: 'royal blue' },
  CAR: { uniform: 'a black jersey with bright Carolina blue numerals outlined in white, silver pants, black and blue socks', bg: 'Carolina blue' },
  CHI: { uniform: 'a navy blue jersey with white numerals outlined in orange, white pants, navy and orange socks', bg: 'navy blue' },
  CIN: { uniform: 'a black jersey with orange numerals outlined in white, white pants with orange and black stripes, orange socks', bg: 'burnt orange' },
  CLE: { uniform: 'a brown jersey with orange numerals outlined in white, white pants, brown and orange socks', bg: 'dark brown' },
  DAL: { uniform: 'a navy blue jersey with white numerals outlined in silver, metallic silver pants, navy socks', bg: 'navy blue' },
  DEN: { uniform: 'an orange jersey with navy numerals outlined in white, white pants, navy and orange socks', bg: 'dark orange' },
  DET: { uniform: 'a Honolulu blue jersey with white numerals, silver pants, blue socks', bg: 'Honolulu blue' },
  GB: { uniform: 'a dark green jersey with gold numerals outlined in white, gold pants, green and gold striped socks', bg: 'dark green' },
  HOU: { uniform: 'a deep steel blue jersey with white numerals outlined in red, white pants, navy and red socks', bg: 'deep steel blue' },
  IND: { uniform: 'a royal blue jersey with white numerals, white pants, blue socks', bg: 'royal blue' },
  JAX: { uniform: 'a teal jersey with white numerals outlined in gold and black, white pants, teal socks', bg: 'teal' },
  KC: { uniform: 'a red jersey with white numerals outlined in gold, white pants, red socks', bg: 'red' },
  LV: { uniform: 'a black jersey with silver numerals outlined in white, silver pants, black socks', bg: 'charcoal black' },
  LAC: { uniform: 'a powder blue jersey with white numerals outlined in gold, white pants, powder blue socks', bg: 'powder blue' },
  LAR: { uniform: 'a royal blue jersey with yellow-gold numerals, yellow-gold pants, blue socks', bg: 'royal blue' },
  MIA: { uniform: 'an aqua jersey with white numerals outlined in orange, white pants, aqua socks', bg: 'aqua' },
  MIN: { uniform: 'a purple jersey with white numerals outlined in gold, white pants, purple socks', bg: 'deep purple' },
  NE: { uniform: 'a navy blue jersey with white numerals outlined in red, silver pants, navy socks', bg: 'navy blue' },
  NO: { uniform: 'a black jersey with old gold numerals outlined in white, old gold pants, black socks', bg: 'charcoal black' },
  NYG: { uniform: 'a royal blue jersey with white numerals outlined in red, grey pants, blue and red socks', bg: 'royal blue' },
  NYJ: { uniform: 'a kelly green jersey with white numerals, white pants, green socks', bg: 'kelly green' },
  PHI: { uniform: 'a midnight green jersey with white numerals outlined in silver and black, white pants, green socks', bg: 'midnight green' },
  PIT: { uniform: 'a black jersey with gold numerals, gold pants, black and gold striped socks', bg: 'charcoal black' },
  SF: { uniform: 'a scarlet red jersey with white numerals outlined in black and gold, gold pants, red socks', bg: 'scarlet red' },
  SEA: { uniform: 'a navy blue jersey with white numerals outlined in lime green, navy pants, navy socks', bg: 'navy blue' },
  TB: { uniform: 'a red jersey with white numerals outlined in pewter and orange, pewter pants, red socks', bg: 'red' },
  TEN: { uniform: 'a navy blue jersey with light blue numerals outlined in white, white pants, navy socks', bg: 'navy blue' },
  WAS: { uniform: 'a burgundy jersey with gold numerals outlined in white, gold pants, burgundy socks', bg: 'burgundy' },
};

/** Sixteen celebrations: each a routine of [frame, hold ms, move] over a few drawn poses.
 * `scoring` ones carry the football (a touchdown only); `prop` adds a drawn
 * piece of the field behind Gary (the goalpost for the dunk). */
export const DANCES = [
  { id: 'griddy', name: 'THE GRIDDY', poses: {
      g4: 'the Griddy, heel tap: hopping on his LEFT foot with his RIGHT heel tapping the ground out in front of him toes up, right arm swung forward and left arm swung back, elbows bent.',
      g5: 'the Griddy, heel tap: hopping on his RIGHT foot with his LEFT heel tapping the ground out in front of him toes up, left arm swung forward and right arm swung back, elbows bent.',
      g6: 'the Griddy, mid-skip: both feet just off the ground switching feet, knees bent, arms passing down by his sides, head bobbing.',
      g3: 'the Griddy finish: feet wide apart, both paws raised up to his face making OK-sign circles around his sunglasses like goggles, elbows pointing out wide.' },
    seq: [['g4', 230, 'hop'], ['g6', 140, ''], ['g5', 230, 'hop'], ['g6', 140, ''], ['g4', 230, 'hop'], ['g6', 140, ''], ['g5', 230, 'hop'], ['g6', 140, ''], ['g3', 2200, 'pop']] },
  { id: 'boom', name: 'BRING THE BOOM', poses: {
      b3: 'starting a flex: standing square to the viewer, chest out, both fists down at his sides, staring hard at the viewer, jaw set.',
      b4: 'mid-flex: both arms rising, fists at shoulder height and elbows out, starting to curl into a double-biceps flex, teeth clenched.',
      b1: 'Bring the Boom: standing tall facing the viewer, BOTH arms raised high and bent in a huge double-biceps flex, chest puffed out, chin up, mouth open roaring.',
      b2: 'the Bring the Boom crab flex: knees deeply bent, torso leaning forward, both arms flexed DOWN in front of his belly in a most-muscular bodybuilder pose, roaring with his mouth wide open.',
      b5: 'pointing one paw straight up at the sky with his arm fully extended, other fist pounding his chest, chin up.' },
    seq: [['b3', 380, ''], ['b4', 220, 'rise'], ['b1', 480, 'shake'], ['b2', 480, 'shake'], ['b1', 420, 'pop'], ['b5', 2000, 'pop']] },
  { id: 'leap', name: 'THE LEAP', scoring: true, poses: {
      l4: 'running hard toward the viewer with the football tucked under his right arm, left arm pumping, leaning forward, one foot off the ground.',
      l1: 'loading for a jump: crouched very low like a coiled spring, knees deeply bent, both arms swung back behind him, football tucked under one arm.',
      l5: 'taking off for a jump: right foot leaving the ground, left knee driving up, both arms swinging up high, football in one paw.',
      l2: 'AIRBORNE in a huge leap: both feet off the ground, knees tucked up toward his chest, both arms flung wide and high above his head, football in one paw, ecstatic.',
      l3: 'just landed from a big leap: standing with BOTH arms raised straight up overhead in triumph, the football held high in one paw, mouth open shouting.' },
    seq: [['l4', 320, 'run'], ['l1', 380, 'drop'], ['l5', 200, 'rise'], ['l2', 700, 'air'], ['l3', 2000, 'land']] },
  { id: 'ickey', name: 'THE ICKEY SHUFFLE', poses: {
      i1: 'the Ickey Shuffle: side-stepping to HIS LEFT with his weight on his left foot, holding the football out at arm\'s length to his left side, other arm bent, knees bouncy, playful grin.',
      i5: 'a mid-air hop between shuffle steps: both feet off the ground, knees together, holding the football out to the side at arm\'s length.',
      i2: 'the Ickey Shuffle: side-stepping to HIS RIGHT with his weight on his right foot, holding the football out at arm\'s length to his right side, other arm bent, knees bouncy.',
      i3: 'spiking the football: right arm whipping straight DOWN with the football leaving his paw toward the ground, left fist raised high, one knee lifted, explosive motion.',
      i4: 'after a spike: twirling his right index finger high in the air, left paw on his hip, chest out, cocky grin.' },
    seq: [['i1', 260, 'left'], ['i5', 150, 'hop'], ['i2', 260, 'right'], ['i5', 150, 'hop'], ['i1', 260, 'left'], ['i5', 150, 'hop'], ['i2', 260, 'right'], ['i3', 340, 'shake'], ['i4', 1900, 'pop']] },
  { id: 'dab', name: 'THE DAB', poses: {
      d1: 'bouncing on the beat: knees slightly bent, both arms relaxed and slightly bent, head bobbing, ready to dance.',
      d2: 'wind-up for a dab: both forearms crossing in front of his chest, leaning slightly forward.',
      d3: 'THE DAB to his right: his head buried down into the crook of his bent RIGHT elbow, his LEFT arm extended fully straight up and out to the side on a diagonal, body leaning.',
      d4: 'between dabs: arms crossing back in front of his chest, standing upright, quick look to the side.',
      d5: 'THE DAB to his left: his head buried down into the crook of his bent LEFT elbow, his RIGHT arm extended fully straight up and out to the side on a diagonal, body leaning the other way.' },
    seq: [['d1', 260, 'hop'], ['d2', 200, ''], ['d3', 560, 'hit'], ['d4', 200, ''], ['d5', 560, 'hit'], ['d4', 200, ''], ['d3', 1900, 'hit']] },
  { id: 'woah', name: 'HIT THE WOAH', poses: {
      w1: 'bouncing to the beat: knees bent, arms loose and bent at his sides, shoulders hunched, head nodding.',
      w2: 'HIT THE WOAH freeze: his RIGHT forearm pulled sharply across his chest with the fist clenched, LEFT arm straight down by his side, torso leaning back as if he just hit an invisible wall, chin up.',
      w3: 'bouncing down: knees deeply bent, both arms dropping low and loose, head down.',
      w4: 'HIT THE WOAH freeze the other way: his LEFT forearm pulled sharply across his chest with the fist clenched, RIGHT arm straight down, torso leaning back, chin up.',
      w5: 'a big final woah: leaning way back, both fists clenched, one forearm across his chest, smirking at the viewer.' },
    seq: [['w1', 240, 'hop'], ['w2', 460, 'freeze'], ['w3', 240, 'drop'], ['w4', 460, 'freeze'], ['w1', 240, 'hop'], ['w5', 1900, 'freeze']] },
  { id: 'shoot', name: 'THE SHOOT', poses: {
      s1: 'bouncing on the beat: knees bent, arms bent with fists loose at chest height, rocking his head.',
      s2: 'THE SHOOT: his RIGHT knee lifted high in a kick, his RIGHT arm pounding straight down toward the knee, LEFT arm swung back, standing on his left foot.',
      s3: 'back down to a bounce: both feet on the ground, knees bent, arms pulling back up to chest height.',
      s4: 'THE SHOOT the other way: his LEFT knee lifted high, his LEFT arm pounding straight down toward the knee, RIGHT arm swung back, standing on his right foot.',
      s5: 'a hopping shoot: both feet off the ground, RIGHT knee kicked up high, RIGHT arm pounding down, huge energy.' },
    seq: [['s1', 220, 'hop'], ['s2', 280, 'hit'], ['s3', 200, ''], ['s4', 280, 'hit'], ['s3', 200, ''], ['s2', 280, 'hit'], ['s1', 200, ''], ['s5', 1900, 'air']] },
  { id: 'milly', name: 'THE MILLY ROCK', poses: {
      m1: 'THE MILLY ROCK: stepping out to his right, both forearms rolling over each other in front of his chest, shoulders loose.',
      m2: 'THE MILLY ROCK swipe: his left foot coming in to meet his right, his RIGHT arm swiping across his body down and to the left, smooth.',
      m3: 'THE MILLY ROCK: stepping out to his left, both forearms rolling over each other in front of his chest.',
      m4: 'THE MILLY ROCK swipe the other way: his right foot meeting his left, his LEFT arm swiping across his body down and to the right.',
      m5: 'rolling his forearms in front of him with a head bob and a cool smirk, knees bent, feet together.' },
    seq: [['m1', 320, 'right'], ['m2', 320, ''], ['m3', 320, 'left'], ['m4', 320, ''], ['m1', 320, 'right'], ['m2', 320, ''], ['m5', 1900, 'hop']] },
  { id: 'bird', name: 'THE DIRTY BIRD', poses: {
      db1: 'THE DIRTY BIRD start: his right arm bent sharply across his chest, left paw on his hip, head turned to the side, swagger.',
      db2: 'THE DIRTY BIRD: both arms spread wide like wings with elbows bent, flapping UP, chest out.',
      db3: 'THE DIRTY BIRD: wings flapped DOWN to his sides, knees bent low.',
      db4: 'THE DIRTY BIRD: wings flapping up high, one leg kicked out to the side, head bobbing forward like a bird.',
      db5: 'THE DIRTY BIRD: a hop with the wings flapped down, both feet just off the ground, head pecking forward.' },
    seq: [['db1', 420, ''], ['db2', 230, 'rise'], ['db3', 230, 'drop'], ['db2', 230, 'rise'], ['db4', 280, 'hop'], ['db3', 230, 'drop'], ['db5', 1900, 'air']] },
  { id: 'floss', name: 'THE FLOSS', poses: {
      f1: 'THE FLOSS: hips pushed out to his RIGHT, both arms held straight and swung to his LEFT behind his hips.',
      f2: 'THE FLOSS: hips centered, both straight arms swung across the FRONT of his body.',
      f3: 'THE FLOSS: hips pushed out to his LEFT, both arms held straight and swung to his RIGHT behind his hips.',
      f4: 'THE FLOSS: hips centered, both straight arms swung across the front of his body the other way, smirking.',
      f5: 'THE FLOSS: fast, hips out to his right, arms behind to his left, big grin, mid-motion.' },
    seq: [['f1', 170, 'right'], ['f2', 130, ''], ['f3', 170, 'left'], ['f4', 130, ''], ['f1', 170, 'right'], ['f2', 130, ''], ['f3', 170, 'left'], ['f4', 130, ''], ['f5', 1900, 'pop']] },
  // The classic touchdown celebrations (founder, Oct 30 2026: "the normal TD
  // celebrations ... like Spike and dunking on the goal post").
  { id: 'spike', name: 'THE SPIKE', scoring: true, poses: {
      sp1: 'running hard toward the viewer holding a brown football high over his head in his right paw, mouth open shouting.',
      sp2: 'winding up a spike: the football raised far back behind his head with his right arm cocked, left arm out for balance, leaning back.',
      sp3: 'spiking the football: right arm whipped all the way down, the brown football bouncing off the ground at his feet, body bent forward, mouth open yelling.',
      sp4: 'after the spike: standing tall, both arms spread wide with palms up to the crowd, chin up, big grin.' },
    seq: [['sp1', 320, 'run'], ['sp2', 300, 'rise'], ['sp3', 260, 'land'], ['sp4', 1900, 'pop']] },
  { id: 'dunk', name: 'THE GOALPOST DUNK', scoring: true, prop: 'goalpost', poses: {
      gd1: 'running hard toward the viewer with a brown football in his right paw, crouching low to jump.',
      gd2: 'launching off both feet, body stretched upward, right arm holding the brown football reaching straight up above his head.',
      gd3: 'at the top of a huge leap, both feet high off the ground, right arm slamming the brown football down over his head like a basketball dunk, left arm raised.',
      gd4: 'landing in a deep crouch with knees bent, both fists pulled down to his hips, roaring.',
      gd5: 'standing tall, pointing his right index finger straight up at the sky, left paw on his chest.' },
    seq: [['gd1', 300, 'run'], ['gd2', 220, 'rise'], ['gd3', 520, 'air'], ['gd4', 360, 'land'], ['gd5', 1800, 'pop']] },
  { id: 'heisman', name: 'THE HEISMAN', scoring: true, poses: {
      hs1: 'running toward the viewer with a brown football tucked under his left arm, right arm pumping.',
      hs3: 'planting his left foot, right knee starting to lift, right arm pulling back, brown football tucked under his left arm.',
      hs2: 'the Heisman Trophy pose: body turned sideways, right knee raised high, right arm stretched straight out in a stiff-arm with the paw flat and facing forward, brown football tucked under his left arm, serious face.' },
    seq: [['hs1', 300, 'run'], ['hs3', 260, 'drop'], ['hs2', 2000, 'freeze']] },
  { id: 'salute', name: 'THE SALUTE', poses: {
      sa1: 'standing at attention facing the viewer, heels together, arms straight down at his sides, chest out, chin up.',
      sa2: 'a crisp military salute: right paw with fingers together at the edge of his sunglasses, elbow out to the side, left arm straight down, serious face.',
      sa3: 'holding the military salute with a proud small smile, chin up.',
      sa4: 'pumping his right fist up toward the sky, mouth open cheering, left fist at his side.' },
    seq: [['sa1', 380, ''], ['sa2', 600, 'hit'], ['sa3', 400, ''], ['sa4', 1800, 'pop']] },
  { id: 'spin', name: 'THE BALL SPIN', scoring: true, poses: {
      bs1: 'crouched on one knee, right paw resting on top of a brown football standing on its tip on the ground in front of him.',
      bs2: 'crouched on one knee, flicking his paw away as the brown football spins on its tip on the ground in front of him, motion swirl lines around the ball, looking down at it.',
      bs3: 'still crouched on one knee, both paws held open beside the spinning brown football like a magician revealing a trick, grinning at the viewer.',
      bs4: 'standing up with his arms crossed over his chest, cool smirk, the brown football spinning on the ground by his feet.' },
    seq: [['bs1', 360, 'drop'], ['bs2', 320, 'hit'], ['bs3', 380, 'pop'], ['bs4', 1800, 'rise']] },
  { id: 'bow', name: 'TAKE A BOW', poses: {
      bw1: 'standing tall facing the viewer, both arms spread wide to the crowd, chin up, smiling.',
      bw2: 'a deep theatrical bow: bent forward at the waist, right paw across his belly, left arm swept out wide to the side.',
      bw3: 'coming up from the bow, right paw tipping an imaginary hat, grinning.',
      bw4: 'both arms raised high over his head in a V, mouth open cheering.' },
    seq: [['bw1', 420, 'rise'], ['bw2', 620, 'drop'], ['bw3', 360, 'hop'], ['bw4', 1800, 'pop']] },
];

const TD_KEY = /\|(first_td|anytime_td)/;
const BIG = 800;

/**
 * Plays worth a celebration: any touchdown scorer bet, or any player bet that
 * cashed at +800 or longer. One per play (player + moment), carrying the best
 * price that play cashed. Game lines never celebrate.
 * @returns {Array<{playKey:string, playerId:string, kind:'td'|'big', hit:object}>}
 */
export function celebrationPlays(hits = []) {
  const plays = new Map();
  for (const h of hits) {
    if (!h?.key || h.key.startsWith('game|')) continue;
    const td = TD_KEY.test(h.key);
    if (!td && !(h.price >= BIG)) continue;
    const playerId = h.key.split('|')[0];
    const playKey = `${playerId}@${h.elapsed}`;
    const cur = plays.get(playKey);
    if (!cur) plays.set(playKey, { playKey, playerId, kind: td ? 'td' : 'big', hit: h });
    else {
      if (td) cur.kind = 'td';
      if (h.price > cur.hit.price) cur.hit = h;
    }
  }
  return [...plays.values()].sort((a, b) => a.hit.elapsed - b.hit.elapsed);
}

/** The same play always gets the same dance. */
export function pickDance(playKey, kind = 'td') {
  let h = 2166136261;
  for (const c of String(playKey)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  // Spiking or dunking the ball belongs to a touchdown, not a 7th catch.
  const pool = kind === 'td' ? DANCES : DANCES.filter(d => !d.scoring);
  return pool[h % pool.length].id;
}

/** Each distinct pose a routine uses, once. */
export function danceUniqueFrames(dance) {
  const seen = new Set();
  return dance.seq.map(([slug]) => slug).filter(s => !seen.has(s) && seen.add(s)).map(slug => ({ slug, pose: dance.poses[slug] }));
}

/** The image prompt for one pose of Gary in a player's number and team colors. */
export function posePrompt(pose, look, number) {
  return `NEW POSE (this is the most important instruction, do not copy the pose from the reference image): ${pose}
Character: the golden bear from the reference image drawn FULL BODY as a polished 3D-animated character (Pixar-quality render, muscular cartoon build), same face, same dark sunglasses reading GARY A.I., same curled mustache and cigar, wearing ${look.uniform}, with the number ${number} on the chest and both shoulders, and black football cleats on both feet. No logos, no names, no other text. Family-friendly: no rude or obscene gestures, never a raised middle finger; his hands are fists, open paws, or a pointing index finger only when the pose asks for it. Full body, whole figure in frame, on a fully transparent background, no ground, no shadow, no scenery.`;
}

const WORDS = { td: ['TOUCH', 'DOWN!', 'TOUCHDOWN!'], int: ['PICKED', 'OFF!', 'PICKED OFF!'], big: ['CASH', 'ED!', 'CASHED!'] };

/** The backdrop behind the dance: the word, in the team's color, cached per team and kind. */
export function bgSpec(kind, team) {
  const [a, b, word] = WORDS[kind] ?? WORDS.big;
  const look = TEAM_LOOKS[team] ?? TEAM_LOOKS.GB;
  return {
    key: `bg/${team}-${kind}`,
    word,
    prompt: `Premium sports-app celebration backdrop, vertical. Giant bold comic-book graffiti lettering, "${a}" on the first line and "${b}" on the second, white letters with thick dark outlines and a gold outer outline, halftone dot shading, gold burst spikes, slightly tilted, centered in the upper two thirds, soft gray smoke clouds behind the lettering. Flat solid ${look.bg} background. Empty lower third. No characters, no football, no other text, no logos.`,
  };
}
