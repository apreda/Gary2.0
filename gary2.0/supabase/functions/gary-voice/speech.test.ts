import { assertEquals } from "jsr:@std/assert@1";
import { accentFor, CaptionFilter, jersey, longIsland, SpeechChunker, speakable, withoutDelivery } from "./speech.ts";

Deno.test("his chuckle reaches the voice; anything else in brackets doesn't", () => {
  assertEquals(speakable("[Chuckles] Listen, [winks] I took Miami] and a stray [ mark"), "[chuckles] Listen, I took Miami and a stray mark");
  assertEquals(longIsland("[chuckles] Over"), "[chuckles] Ovah");
});

Deno.test("the captions never show how he says it, even when a tag comes in two pieces", () => {
  const c = new CaptionFilter();
  const shown = [c.push("[chuck"), c.push("les] You kidding me? "), c.push("I took "), c.push("[sighs]"), c.push(" Miami."), c.flush()].join("");
  assertEquals(shown.trim().split(/\s+/), ["You", "kidding", "me?", "I", "took", "Miami."]);
  assertEquals(withoutDelivery("[sighs] It lost. [laughs] What are you gonna do."), "It lost. What are you gonna do.");
});

Deno.test("pieces end at sentences, never inside a line or a price", () => {
  const c = new SpeechChunker();
  const out = [...c.push("I took Charlotte plus 1.5 at -120. "), ...c.push("Miller dropped 39 on them. A.J. Green"), ...c.push(" sat.")];
  assertEquals(out, ["I took Charlotte plus 1.5 at -120. ", "Miller dropped 39 on them. "]);
  assertEquals(c.flush(), "A.J. Green sat.");
});

Deno.test("a long run without a sentence end breaks at a comma", () => {
  const c = new SpeechChunker();
  const text = "Charlotte grabbed twenty offensive boards, Washington doesn't force turnovers, which is how the Hornets lose, and Miller is hot right now going into tonight";
  const out = c.push(text);
  assertEquals(out.length, 1);
  assertEquals(out[0].endsWith(", "), true);
});

Deno.test("screen-only marks are taken out before the voice", () => {
  assertEquals(speakable("**Hornets** +1.5 — a lean"), "Hornets +1.5, a lean");
});

Deno.test("his accent swaps word for word, so the captions stay in step", () => {
  const plain = "They're not even sweating it. You wanna take the over with this team? I'll see you at the window, crying. Nothing doing. THE pick: Bears -3.5 at -110, you're welcome, King. Manning is betting.";
  const said = jersey(plain);
  assertEquals(said, "Dey're not even sweatin' it. Ya wanna take da over wit dis team? I'll see ya at da window, cryin'. Nothin' doin'. DA pick: Bears -3.5 at -110, you're welcome, King. Manning is bettin'.");
  assertEquals(said.split(/\s+/).length, plain.split(/\s+/).length);
  assertEquals(jersey("a thing on a string in spring"), "a thing on a string in spring");
});

Deno.test("Long Island drops the r and draws out the aw, word for word", () => {
  const plain = "You want the over? Never. I'm talking coffee, they cover under the number, and Miller is better than the Packers. You're welcome, beer and career.";
  const said = longIsland(plain);
  assertEquals(said, "Ya want the ovah? Nevah. I'm tawkin' cawfee, they covah undah the numbah, and Miller is bettah than the Packers. You're welcome, beer and career.");
  assertEquals(said.split(/\s+/).length, plain.split(/\s+/).length);
});

Deno.test("the live voice is cued for the accent and says the words as written, as it was picked", () => {
  assertEquals(accentFor("n6z5BP3f6BLdUmqfxvaY")!("Never talking coffee."), "[strong Long Island accent] Never talking coffee.");
});
