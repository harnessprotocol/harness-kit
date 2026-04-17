'use client';

import { useState } from 'react';

const NPX_COMMAND =
  'npx skills add https://github.com/harnessprotocol/harness-kit --skill harness-docs';

export function AgentSkillBanner() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(NPX_COMMAND).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="agent-skill-banner" aria-label="Install docs as a skill">
      <div className="asb-header">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="asb-icon"
        >
          <path
            fillRule="evenodd"
            d="M3.25 3A2.25 2.25 0 0 0 1 5.25v9.5A2.25 2.25 0 0 0 3.25 17h13.5A2.25 2.25 0 0 0 19 14.75v-9.5A2.25 2.25 0 0 0 16.75 3H3.25Zm.943 8.752a.75.75 0 0 1-.25-1.43l4.5-1.5a.75.75 0 0 1 .5 0l4.5 1.5a.75.75 0 0 1-.5 1.43l-4.25-1.416-4.25 1.416a.75.75 0 0 1-.25.014ZM6 9.5a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 6 9.5Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="asb-label">
          Using a coding agent? Install the Harness Kit docs as a skill:
        </span>
      </div>
      <div className="asb-command-row">
        <code className="asb-command">{NPX_COMMAND}</code>
        <button
          className="asb-copy-btn"
          onClick={handleCopy}
          aria-label={copied ? 'Copied!' : 'Copy command'}
          title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
          {copied ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
              className="asb-copy-icon"
            >
              <path
                fillRule="evenodd"
                d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
              className="asb-copy-icon"
            >
              <path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14h6a1.5 1.5 0 0 0 1.5-1.5v-7L8.5 2H3.5Z" />
              <path d="M9 3.25a.25.25 0 0 0-.25-.25H8v2.5a.75.75 0 0 0 .75.75H11v-.25A2.75 2.75 0 0 0 9 3.25Z" />
              <path d="M8.5 2v2A.5.5 0 0 0 9 4.5H11.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
