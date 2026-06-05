export function JsonLd({ data }: { data: object }) {
  // Escape <, >, & inside the serialized JSON so a string containing
  // "</script>" (pick text is LLM-generated) can't break out of the tag.
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
