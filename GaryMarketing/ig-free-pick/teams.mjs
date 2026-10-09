// Official club colors for the Instagram posters: [primary, secondary, words for the painting prompt].
// These are the printed team colors, not the app's TeamColors (which are brightened for a dark screen).
// Keyed by nickname, matched by containment; NFL and MLB are kept apart because nicknames repeat.

export const NFL = {
  "Cardinals": ["#97233F", "#000000", "cardinal red and black"],
  "Falcons": ["#A71930", "#000000", "red and black"],
  "Ravens": ["#241773", "#000000", "purple and black"],
  "Bills": ["#00338D", "#C60C30", "royal blue and red"],
  "Panthers": ["#0085CA", "#101820", "process blue and black"],
  "Bears": ["#0B162A", "#C83803", "navy and orange"],
  "Bengals": ["#FB4F14", "#000000", "orange and black"],
  "Browns": ["#311D00", "#FF3C00", "brown and orange"],
  "Cowboys": ["#041E42", "#869397", "navy and silver"],
  "Broncos": ["#FB4F14", "#002244", "orange and navy"],
  "Lions": ["#0076B6", "#B0B7BC", "Honolulu blue and silver"],
  "Packers": ["#203731", "#FFB612", "dark green and gold"],
  "Texans": ["#03202F", "#A71930", "deep steel blue and red"],
  "Colts": ["#002C5F", "#A2AAAD", "blue and silver"],
  "Jaguars": ["#006778", "#D7A22A", "teal and gold"],
  "Chiefs": ["#E31837", "#FFB81C", "red and gold"],
  "Raiders": ["#000000", "#A5ACAF", "black and silver"],
  "Chargers": ["#0080C6", "#FFC20E", "powder blue and gold"],
  "Rams": ["#003594", "#FFA300", "royal blue and gold"],
  "Dolphins": ["#008E97", "#FC4C02", "aqua and orange"],
  "Vikings": ["#4F2683", "#FFC62F", "purple and gold"],
  "Patriots": ["#002244", "#C60C30", "navy and red"],
  "Saints": ["#101820", "#D3BC8D", "black and old gold"],
  "Giants": ["#0B2265", "#A71930", "dark blue and red"],
  "Jets": ["#125740", "#000000", "green and black"],
  "Eagles": ["#004C54", "#A5ACAF", "midnight green and silver"],
  "Steelers": ["#101820", "#FFB612", "black and gold"],
  "49ers": ["#AA0000", "#B3995D", "red and gold"],
  "Seahawks": ["#002244", "#69BE28", "navy and action green"],
  "Buccaneers": ["#D50A0A", "#34302B", "red and pewter"],
  "Titans": ["#0C2340", "#4B92DB", "navy and light blue"],
  "Commanders": ["#5A1414", "#FFB612", "burgundy and gold"],
};

export const MLB = {
  "Diamondbacks": ["#A71930", "#E3D4AD", "Sedona red and sand"],
  "Braves": ["#CE1141", "#13274F", "red and navy"],
  "Orioles": ["#DF4601", "#000000", "orange and black"],
  "Red Sox": ["#BD3039", "#0C2340", "red and navy"],
  "Cubs": ["#0E3386", "#CC3433", "blue and red"],
  "White Sox": ["#27251F", "#C4CED4", "black and silver"],
  "Reds": ["#C6011F", "#000000", "red and black"],
  "Guardians": ["#E31937", "#0C2340", "red and navy"],
  "Rockies": ["#333366", "#C4CED4", "purple and silver"],
  "Tigers": ["#0C2340", "#FA4616", "navy and orange"],
  "Astros": ["#002D62", "#EB6E1F", "navy and orange"],
  "Royals": ["#004687", "#BD9B60", "royal blue and gold"],
  "Angels": ["#BA0021", "#003263", "red and navy"],
  "Dodgers": ["#005A9C", "#EF3E42", "Dodger blue and red"],
  "Marlins": ["#00A3E0", "#EF3340", "Miami blue and red"],
  "Brewers": ["#12284B", "#FFC52F", "navy and gold"],
  "Twins": ["#002B5C", "#D31145", "navy and red"],
  "Mets": ["#002D72", "#FF5910", "blue and orange"],
  "Yankees": ["#0C2340", "#C4CED3", "navy and gray"],
  "Athletics": ["#003831", "#EFB21E", "green and gold"],
  "Phillies": ["#E81828", "#002D72", "red and blue"],
  "Pirates": ["#27251F", "#FDB827", "black and gold"],
  "Padres": ["#2F241D", "#FFC425", "brown and gold"],
  "Giants": ["#FD5A1E", "#27251F", "orange and black"],
  "Mariners": ["#0C2C56", "#005C5C", "navy and teal"],
  "Cardinals": ["#C41E3A", "#0C2340", "red and navy"],
  "Rays": ["#092C5C", "#8FBCE6", "navy and light blue"],
  "Rangers": ["#003278", "#C0111F", "blue and red"],
  "Blue Jays": ["#134A8E", "#1D2D5C", "blue and navy"],
  "Nationals": ["#AB0003", "#14225A", "red and navy"],
};

// Teams without a table entry (most of college football) print in Gary's brass and a deep navy.
const FALLBACK = [["#9C7A1C", "#2B2620", "gold and charcoal"], ["#14243F", "#8A93A0", "navy and slate"]];

const SHORT = { "Buccaneers": "Bucs" };

/** The nickname a name ends in ("Tampa Bay Buccaneers" → "Buccaneers"), or the name itself. */
export function nickname(name, league) {
  const table = league === "NFL" ? NFL : league === "MLB" ? MLB : {};
  for (const key of ["Red Sox", "White Sox", "Blue Jays"]) if (table[key] && name.includes(key)) return key;
  return Object.keys(table).find((k) => name.includes(k)) || name;
}

/** What a fan calls the club on a poster ("Bucs"). */
export const shortName = (name, league) => SHORT[nickname(name, league)] || nickname(name, league);

export function colors(name, league, side = 0) {
  const table = league === "NFL" ? NFL : league === "MLB" ? MLB : {};
  const hit = table[nickname(name, league)];
  const [primary, secondary, words] = hit || FALLBACK[side];
  return { primary, secondary, words, known: Boolean(hit) };
}

/** Relative luminance 0..1 of a #RRGGBB color. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
