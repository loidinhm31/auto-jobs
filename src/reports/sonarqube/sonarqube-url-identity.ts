export function exactQueryValue(url: URL, key: string): string | undefined {
  const values = url.searchParams.getAll(key);
  if (values.length !== 1) return undefined;
  const value = values[0]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export function hasCredentialFreeAuthority(url: URL): boolean {
  return url.username.length === 0 && url.password.length === 0;
}

export function isArchivedSonarqubeSnapshot(url: URL): boolean {
  return isArchivedSonarqubeArtifact(url) && /\/sonarqube\/index\.html$/iu.test(url.pathname);
}

export function isArchivedSonarqubeArtifact(url: URL): boolean {
  return /\/artifact\/(?:[^/]+\/)*sonarqube\/(?:index|overall|issues)\.html$/iu.test(url.pathname);
}
