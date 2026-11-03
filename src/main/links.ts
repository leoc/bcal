/** argv for the `openLink` command: the URL replaces `{url}`, else it is appended. */
export function linkCommand(command: string[], url: string): string[] {
  return command.some((arg) => arg.includes('{url}'))
    ? command.map((arg) => arg.replaceAll('{url}', url))
    : [...command, url]
}
