type Item =
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

type Section = {
  title: string | null;
  items: Item[];
  finePrint: boolean;
};

function isFinePrint(line: string) {
  return line.startsWith("*") || /equal-opportunity|personal data/i.test(line);
}

function parse(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { title: null, items: [], finePrint: false };

  function open(title: string | null, finePrint = false) {
    if (current.title || current.items.length) sections.push(current);
    current = { title, items: [], finePrint };
  }

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      open(line.slice(3).trim());
      continue;
    }
    if (isFinePrint(line)) {
      if (!current.finePrint) open(null, true);
      current.items.push({ type: "p", text: line.replace(/^\*\s*/, "") });
      continue;
    }
    if (line.startsWith("### ")) {
      current.items.push({ type: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("- ")) {
      const last = current.items[current.items.length - 1];
      if (last?.type === "ul") last.items.push(line.slice(2).trim());
      else current.items.push({ type: "ul", items: [line.slice(2).trim()] });
      continue;
    }
    current.items.push({ type: "p", text: line });
  }
  if (current.title || current.items.length) sections.push(current);
  return sections;
}

function ItemView({ item }: { item: Item }) {
  switch (item.type) {
    case "h3":
      return <h3 className="pt-3 font-display text-[15px] font-semibold text-ink first:pt-0">{item.text}</h3>;
    case "p":
      return <p className="text-[15px] leading-relaxed text-ink-2">{item.text}</p>;
    case "ul":
      return (
        <ul className="space-y-2.5">
          {item.items.map((entry) => (
            <li key={entry} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      );
    default: {
      const unexpected: never = item;
      return unexpected;
    }
  }
}

export function JobDescription({ text }: { text: string }) {
  const sections = parse(text);
  if (!sections.length) return null;

  return (
    <article className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
      {sections.map((section, index) => (
        <section
          key={section.title ?? `section-${index}`}
          className={
            section.finePrint
              ? "space-y-2 border-t border-line px-6 py-5 text-[13px] leading-relaxed text-ink-3"
              : "space-y-3 border-t border-line px-6 py-6 first:border-t-0"
          }
        >
          {section.title && <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{section.title}</h2>}
          {section.finePrint
            ? section.items.map((item) =>
                item.type === "p" ? <p key={item.text}>{item.text}</p> : <ItemView key={item.type} item={item} />,
              )
            : section.items.map((item) => <ItemView key={item.type === "p" || item.type === "h3" ? item.text : item.items[0]} item={item} />)}
        </section>
      ))}
    </article>
  );
}
