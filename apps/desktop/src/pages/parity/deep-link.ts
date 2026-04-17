import type { TargetPlatform } from "@harness-kit/core";

/**
 * Returns the deepest available link to the changelog entry for the given
 * harness at the given installed version.
 *
 * Where the harness publishes per-version anchors or pages, we construct the
 * exact URL. Where it does not (Windsurf, Junie), we fall back to the
 * top-level changelog / releases index.
 */
export function deepLinkForVersion(
  targetId: TargetPlatform,
  version: string,
): string {
  // Strip a leading "v" for targets whose URL formats don't include it
  const bare = version.replace(/^v/, "");

  switch (targetId) {
    case "claude-code": {
      // CHANGELOG.md uses headings like "## 2.1.112"
      // GitHub slugifies by lowercasing and replacing non-alphanumeric with "-"
      const anchor = bare.replace(/\./g, "-");
      return `https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#${anchor}`;
    }

    case "cursor": {
      // cursor.com/changelog/3-1  (dots → dashes)
      const slug = bare.replace(/\./g, "-");
      return `https://cursor.com/changelog/${slug}`;
    }

    case "copilot": {
      // No stable per-version URL format. Link to the labeled archive page so
      // the user can find the closest release post.
      return "https://github.blog/changelog/label/copilot/";
    }

    case "codex": {
      // Releases are tagged as "rust-v{version}"
      return `https://github.com/openai/codex/releases/tag/rust-v${bare}`;
    }

    case "opencode": {
      return `https://github.com/sst/opencode/releases/tag/v${bare}`;
    }

    case "windsurf": {
      // Windsurf changelog page has no per-version anchor format today.
      return "https://windsurf.com/changelog";
    }

    case "gemini": {
      return `https://github.com/google-gemini/gemini-cli/releases/tag/v${bare}`;
    }

    case "junie": {
      // JetBrains Junie publishes releases on GitHub; no stable per-version
      // URL pattern exists yet.
      return "https://github.com/JetBrains/junie/releases";
    }
  }
}
