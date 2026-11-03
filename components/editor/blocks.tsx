"use client";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";

/** Callout com emoji clicável (alterna entre alguns emojis ao clicar). */
const EMOJIS = ["💡", "⚠️", "✅", "📌", "❗", "🔥"];

export const Callout = createReactBlockSpec(
  {
    type: "callout",
    propSchema: { emoji: { default: "💡" } },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div className="my-1 flex w-full items-start gap-2 rounded-md bg-[var(--n-callout)] p-4">
        <button
          type="button"
          contentEditable={false}
          aria-label="Trocar emoji"
          className="select-none text-2xl leading-none"
          onClick={() => {
            const i = EMOJIS.indexOf(block.props.emoji);
            editor.updateBlock(block, { props: { emoji: EMOJIS[(i + 1) % EMOJIS.length] } });
          }}
        >
          {block.props.emoji}
        </button>
        <div className="min-w-0 flex-1" ref={contentRef} />
      </div>
    ),
  }
);

export const Divider = createReactBlockSpec(
  { type: "divider", propSchema: {}, content: "none" },
  { render: () => <hr className="my-3 w-full border-t border-[var(--n-border)]" /> }
);

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: Callout, divider: Divider },
});
