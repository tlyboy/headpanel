// Windows PowerShell 5.1 and older only offer TLS 1.0/1.1 by default, which the panel's HTTPS refuses; 3072 is TLS 1.2.
// -UseBasicParsing keeps iwr off the Internet Explorer engine, which older servers lack or never initialized.
export function psDownloadAndRun(url: string, file: string, args?: string): string {
  const path = `$env:TEMP\\${file}`
  return `[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iwr ${url} -UseBasicParsing -OutFile ${path}; & ${path}${args ? ` ${args}` : ''}`
}
