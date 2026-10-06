/**
 * Station names as the design sets them: the MTA's hyphen between two names becomes an
 * en dash ("Times Sq–42 St"), as on the platform signs and the Deck page.
 */
export function displayName(name: string): string {
  return name.replace(/\s*-\s*/g, "–");
}
