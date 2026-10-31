import { assertEquals } from "jsr:@std/assert@1";
import { jersey, SpeechChunker, speakable } from "./speech.ts";

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
