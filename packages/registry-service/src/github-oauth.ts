export interface GitHubIdentity {
  userId: string;
  login: string;
  avatarUrl?: string;
}

export interface GitHubOAuthProvider {
  authorizationUrl(state: string): string;
  exchange(code: string): Promise<GitHubIdentity>;
}

export class LiveGitHubOAuthProvider implements GitHubOAuthProvider {
  constructor(
    private clientId: string,
    private clientSecret: string,
    private callbackUrl: string,
  ) {}

  authorizationUrl(state: string): string {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "read:user user:email");
    return url.toString();
  }

  async exchange(code: string): Promise<GitHubIdentity> {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl,
      }),
    });
    if (!tokenResponse.ok) throw new Error(`GitHub token exchange failed (${tokenResponse.status})`);
    const tokenBody = await tokenResponse.json() as { access_token?: string; error_description?: string };
    if (!tokenBody.access_token) throw new Error(tokenBody.error_description ?? "GitHub did not return an access token");
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenBody.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!userResponse.ok) throw new Error(`GitHub user lookup failed (${userResponse.status})`);
    const user = await userResponse.json() as { id: number; login: string; avatar_url?: string };
    return {
      userId: `github:${user.id}`,
      login: user.login,
      ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
    };
  }
}
