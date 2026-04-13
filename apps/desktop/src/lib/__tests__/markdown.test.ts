import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  describe("headings", () => {
    it("converts # to h1", () => {
      const result = renderMarkdown("# Hello World");
      expect(result).toContain("<h1");
      expect(result).toContain("Hello World");
    });

    it("converts ## to h2", () => {
      const result = renderMarkdown("## Section");
      expect(result).toContain("<h2");
      expect(result).toContain("Section");
    });

    it("converts ### to h3", () => {
      const result = renderMarkdown("### Subsection");
      expect(result).toContain("<h3");
      expect(result).toContain("Subsection");
    });

    it("converts #### to h4", () => {
      const result = renderMarkdown("#### Detail");
      expect(result).toContain("<h4");
      expect(result).toContain("Detail");
    });
  });

  describe("inline formatting", () => {
    it("converts **text** to strong", () => {
      const result = renderMarkdown("Some **bold** text");
      expect(result).toContain("<strong>bold</strong>");
    });

    it("converts backtick-wrapped text to code", () => {
      const result = renderMarkdown("Run `npm install`");
      expect(result).toContain("<code");
      expect(result).toContain("npm install");
    });

    it("converts [text](url) to anchor", () => {
      const result = renderMarkdown("[Click here](https://example.com)");
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain("Click here");
    });

    it("sets target=_blank and rel=noopener on links", () => {
      const result = renderMarkdown("[Link](https://example.com)");
      expect(result).toContain('target="_blank"');
      expect(result).toContain("noopener noreferrer");
    });
  });

  describe("blocks", () => {
    it("converts - list items to li elements", () => {
      const result = renderMarkdown("- First item\n- Second item");
      const matches = result.match(/<li/g);
      expect(matches).toHaveLength(2);
      expect(result).toContain("First item");
      expect(result).toContain("Second item");
    });

    it("converts fenced code blocks to pre/code", () => {
      const result = renderMarkdown("```bash\nnpm install\n```");
      expect(result).toContain("<pre");
      expect(result).toContain("<code>");
      expect(result).toContain("npm install");
    });

    it("wraps plain text lines in p tags", () => {
      const result = renderMarkdown("Just a paragraph.");
      expect(result).toContain("<p");
      expect(result).toContain("Just a paragraph.");
    });

    it("does not double-wrap heading lines in p tags", () => {
      const result = renderMarkdown("# Heading");
      const pMatches = result.match(/<p/g);
      expect(pMatches).toBeNull();
    });

    it("does not double-wrap list items in p tags", () => {
      const result = renderMarkdown("- List item");
      expect(result).not.toMatch(/<p[^>]*>.*<li/s);
    });
  });

  describe("security", () => {
    it("strips script tags", () => {
      const result = renderMarkdown("<script>alert('xss')</script>");
      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert(");
    });

    it("strips onerror attributes", () => {
      const result = renderMarkdown("[x](javascript:alert(1))");
      expect(result).not.toContain("javascript:");
    });

    it("strips data attributes", () => {
      const result = renderMarkdown("Some text with <span data-x='y'>span</span>");
      expect(result).not.toContain("data-x");
    });

    it("preserves safe inline styles on known tags", () => {
      const result = renderMarkdown("# Safe Heading");
      expect(result).toContain("style=");
    });
  });

  describe("multiline documents", () => {
    it("renders a full document with mixed elements", () => {
      const md = `# Title\n\nSome paragraph text.\n\n## Section\n\n- Item one\n- Item two\n\n\`\`\`bash\necho hello\n\`\`\``;
      const result = renderMarkdown(md);
      expect(result).toContain("<h1");
      expect(result).toContain("<h2");
      expect(result).toContain("<p");
      expect(result).toContain("<li");
      expect(result).toContain("<pre");
      expect(result).toContain("echo hello");
    });
  });
});
