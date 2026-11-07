param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArguments)

$ErrorActionPreference = 'Stop'
$taskPnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($taskPnpmCommand) {
  & $taskPnpmCommand.Source @PnpmArguments
  exit $LASTEXITCODE
}

# 이 Windows 환경은 node만 PATH에 있으므로 설치된 Codex runtime의 pnpm을 사용한다.
# 프로젝트 런타임이나 배포 산출물은 이 경로에 의존하지 않는다.
$taskPnpmEntry = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs'
if (-not (Test-Path -LiteralPath $taskPnpmEntry)) {
  throw 'pnpm 11.25.0을 설치한 뒤 pnpm 명령으로 실행하세요.'
}
& node $taskPnpmEntry @PnpmArguments
exit $LASTEXITCODE
