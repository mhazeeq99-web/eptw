# Landing-page footer geometry, measured through Chrome DevTools Protocol so the
# check never depends on reading a screenshot.
#
# Expected design: a full-width translucent glass bar pinned to the very bottom
# of the viewport (so the background photo cannot swallow the wording), holding
# the centred copyright line with one thin rule on either side.
#
# Notes for future edits:
#  * keep this file pure ASCII -- Windows PowerShell 5.1 reads a BOM-less script
#    as ANSI, so an inline copyright-glyph literal would be mangled; the glyph is
#    built from its code point instead.
#  * Tailwind v4 + modern Chromium serialise computed colours as oklab()/lab(),
#    so the page itself converts every colour to sRGB through a canvas before we
#    compare channel values.
$ErrorActionPreference = 'Stop'

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$url = if ($env:EPTW_BASE_URL) { $env:EPTW_BASE_URL } else { 'http://127.0.0.1:3457' }
# A fresh port per run: a leftover headless browser from an earlier run would
# otherwise answer /json/list with its own (stale) page and poison the results.
$port = Get-Random -Minimum 9400 -Maximum 9899
$profileDir = Join-Path $env:TEMP ('eptw-cdp-' + [guid]::NewGuid().ToString('N'))
$copyright = [string][char]0x00A9

$proc = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  "--remote-debugging-port=$port", "--user-data-dir=$profileDir",
  '--window-size=1440,900', ($url + '/')
)

function Invoke-Cdp([string]$wsUrl, [string]$json) {
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).Wait()
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $bytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()

  $buffer = New-Object byte[] 262144
  $sb = New-Object Text.StringBuilder
  do {
    $recvSeg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $buffer)
    $res = $ws.ReceiveAsync($recvSeg, [Threading.CancellationToken]::None).Result
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $res.Count))
  } while (-not $res.EndOfMessage)
  $ws.Dispose()
  return $sb.ToString()
}

$passed = 0
$failed = 0
function Get-Probe([string]$wsUrl, [string]$payload) {
  # Poll the page until the footer is really in the DOM (a target can exist while
  # the document is still parsing).
  for ($i = 0; $i -lt 30; $i++) {
    $raw = Invoke-Cdp -wsUrl $wsUrl -json $payload
    $outer = $raw | ConvertFrom-Json
    if (-not $outer.result.result.value) { throw "unexpected CDP reply: $raw" }
    $probe = $outer.result.result.value | ConvertFrom-Json
    if ($probe.footer -and $probe.text -and $probe.spans -and $probe.spans.Count -eq 2) { return $probe }
    Start-Sleep -Milliseconds 400
  }
  throw "footer probe never saw a landing page with the footer and its two rules"
}
function Check([string]$name, [bool]$ok, [string]$detail) {
  if ($ok) { $script:passed++; Write-Host "PASS | $name" -ForegroundColor Green }
  else { $script:failed++; Write-Host "FAIL | $name -- $detail" -ForegroundColor Red }
}
function Channel([object]$rgb) { return @([int]$rgb[0], [int]$rgb[1], [int]$rgb[2]) }
function RelativeLuminance([object]$rgb) {
  $lin = @()
  foreach ($c in (Channel $rgb)) {
    $s = $c / 255.0
    if ($s -le 0.03928) { $lin += ($s / 12.92) } else { $lin += [Math]::Pow((($s + 0.055) / 1.055), 2.4) }
  }
  return 0.2126 * $lin[0] + 0.7152 * $lin[1] + 0.0722 * $lin[2]
}
function ContrastRatio([object]$fg, [object]$bg) {
  $a = RelativeLuminance $fg
  $b = RelativeLuminance $bg
  $hi = [Math]::Max($a, $b); $lo = [Math]::Min($a, $b)
  return ($hi + 0.05) / ($lo + 0.05)
}
function Near([object]$rgb, [int]$r, [int]$g, [int]$b, [int]$tol) {
  $c = Channel $rgb
  return ([Math]::Abs($c[0] - $r) -le $tol) -and ([Math]::Abs($c[1] - $g) -le $tol) -and ([Math]::Abs($c[2] - $b) -le $tol)
}

try {
  $target = $null
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $list = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 3
      $target = $list | Where-Object { $_.type -eq 'page' -and $_.url -like "$url*" } | Select-Object -First 1
      if ($target) { break }
    } catch { }
  }
  if (-not $target) { throw "no CDP page target for $url on port $port" }

  # The probe converts every computed colour to sRGB through a 1x1 canvas, so the
  # assertions below compare plain 0-255 channels instead of oklab()/lab() text.
  $js = @'
(() => {
  const toRgb = (css) => {
    const cv = document.createElement('canvas');
    cv.width = 1; cv.height = 1;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], Math.round((d[3] / 255) * 100) / 100];
  };
  const f = document.querySelector('footer');
  if (!f) return JSON.stringify({ error: 'no footer element' });
  const r = f.getBoundingClientRect();
  const p = f.querySelector('p');
  const pr = p ? p.getBoundingClientRect() : null;
  const fcs = getComputedStyle(f);
  const pcs = p ? getComputedStyle(p) : null;
  const spans = [...f.querySelectorAll('span')].map((s) => {
    const b = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), rgba: toRgb(cs.backgroundColor) };
  });
  return JSON.stringify({
    footer: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) },
    text: p ? {
      value: p.textContent.replace(/\s+/g, ' ').trim(),
      x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), cx: Math.round(pr.x + pr.width / 2),
      rgba: toRgb(pcs.color), fontSize: pcs.fontSize, fontWeight: pcs.fontWeight,
    } : null,
    inMain: f.parentElement ? f.parentElement.tagName : null,
    bar: {
      rgba: toRgb(fcs.backgroundColor),
      backdrop: fcs.backdropFilter || fcs.webkitBackdropFilter,
      borderTopWidth: fcs.borderTopWidth,
      borderTopStyle: fcs.borderTopStyle,
      radius: fcs.borderRadius,
      position: fcs.position,
    },
    spans,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    docH: document.documentElement.scrollHeight,
  });
})()
'@

  $payload = @{
    id     = 1
    method = 'Runtime.evaluate'
    params = @{ expression = $js; returnByValue = $true; awaitPromise = $false }
  } | ConvertTo-Json -Compress -Depth 6

  # The page may still be parsing when the target first appears, so poll until the
  # probe actually finds the footer instead of asserting against a half-loaded DOM.
  $d = Get-Probe -wsUrl $target.webSocketDebuggerUrl -payload $payload

  Write-Host '--- landing page footer geometry ---'
  Write-Host ("footer   x={0} y={1} w={2} h={3} bottom={4}" -f $d.footer.x, $d.footer.y, $d.footer.w, $d.footer.h, $d.footer.bottom)
  Write-Host ("text     cx={0} w={1} rgba={2} size={3} weight={4}" -f $d.text.cx, $d.text.w, ($d.text.rgba -join ','), $d.text.fontSize, $d.text.fontWeight)
  Write-Host ("bar      rgba={0} backdrop={1} top={2} {3} radius={4}" -f ($d.bar.rgba -join ','), $d.bar.backdrop, $d.bar.borderTopWidth, $d.bar.borderTopStyle, $d.bar.radius)
  Write-Host ("viewport w={0} h={1} docH={2}" -f $d.viewport.w, $d.viewport.h, $d.docH)
  foreach ($s in $d.spans) { Write-Host ("rule     x={0} w={1} h={2} rgba={3}" -f $s.x, $s.w, $s.h, ($s.rgba -join ',')) }

  Check 'footer element present' ($null -ne $d.footer) 'footer missing'
  Check 'footer lives inside <main>' ($d.inMain -eq 'MAIN') "parent=$($d.inMain)"
  Check 'footer text is the registered copyright line' ($d.text.value -eq ($copyright + ' 2026 Movique Services (003812531-W). All Rights Reserved.')) "text=$($d.text.value)"
  Check 'footer sits flush with the bottom of the viewport' ([Math]::Abs($d.footer.bottom - $d.viewport.h) -le 2) "bottom=$($d.footer.bottom) viewport=$($d.viewport.h)"
  Check 'footer text is horizontally centred' ([Math]::Abs($d.text.cx - ($d.viewport.w / 2)) -le 4) "cx=$($d.text.cx) half=$($d.viewport.w / 2)"
  Check 'exactly two rules flank the text' ($d.spans.Count -eq 2) "count=$($d.spans.Count)"
  if ($d.spans.Count -eq 2) {
    $left = $d.spans[0]
    $right = $d.spans[1]
    Check 'left rule ends before the text starts' (($left.x + $left.w) -le ($d.text.x + 1)) "ruleEnd=$($left.x + $left.w) textStart=$($d.text.x)"
    Check 'right rule starts after the text ends' ($right.x -ge (($d.text.x + $d.text.w) - 1)) "ruleStart=$($right.x) textEnd=$($d.text.x + $d.text.w)"
    Check 'left rule has real width' ($left.w -ge 40) "w=$($left.w)"
    Check 'right rule has real width' ($right.w -ge 40) "w=$($right.w)"
    Check 'rules are 1px hairlines' (($left.h -le 2) -and ($right.h -le 2)) "heights=$($left.h),$($right.h)"
    Check 'left and right rules are the same length' ([Math]::Abs($left.w - $right.w) -le 1) "left=$($left.w) right=$($right.w)"
    Check 'rules are grey hairlines' ((Near $left.rgba 156 163 175 12) -and (Near $right.rgba 156 163 175 12)) "left=$($left.rgba -join ',') right=$($right.rgba -join ',')"
    Check 'rules are clearly visible, not washed out' (([double]$left.rgba[3] -ge 0.7) -and ([double]$right.rgba[3] -ge 0.7)) "alpha=$($left.rgba[3])/$($right.rgba[3])"
  }

  # --- the full-width bar that highlights the wording over the photo ---------
  Check 'footer is a full-width bar' ([Math]::Abs($d.footer.w - $d.viewport.w) -le 2) "w=$($d.footer.w) viewport=$($d.viewport.w)"
  Check 'bar is absolutely positioned at the bottom edge' ($d.bar.position -eq 'absolute') "position=$($d.bar.position)"
  Check 'bar has vertical padding (text not flush to the edge)' ($d.footer.h -ge 30) "h=$($d.footer.h)"
  Check 'bar is a light glass overlay in light mode' ((Near $d.bar.rgba 255 255 255 6) -and ([double]$d.bar.rgba[3] -ge 0.6) -and ([double]$d.bar.rgba[3] -le 0.95)) "rgba=$($d.bar.rgba -join ',')"
  Check 'bar blurs the photo behind it' ($d.bar.backdrop -match 'blur') "backdrop=$($d.bar.backdrop)"
  Check 'bar has a 1px hairline on top' (($d.bar.borderTopWidth -eq '1px') -and ($d.bar.borderTopStyle -eq 'solid')) "top=$($d.bar.borderTopWidth) $($d.bar.borderTopStyle)"
  Check 'bar is square-edged (not a pill)' ($d.bar.radius -eq '0px') "radius=$($d.bar.radius)"

  # --- readability of the wording on that bar -------------------------------
  $textRgb = $d.text.rgba
  Check 'footer text is dark grey (Tailwind gray-700 #364153)' (Near $textRgb 54 65 83 10) "rgba=$($textRgb -join ',')"
  Check 'footer text size is xs (12px)' ($d.text.fontSize -eq '12px') "size=$($d.text.fontSize)"
  Check 'footer text is medium weight for legibility' ([int]$d.text.fontWeight -ge 500) "weight=$($d.text.fontWeight)"
  # Worst case composite: the glass bar over a fully black photo. Anything better
  # than this in the real photo only raises the ratio.
  $alpha = [double]$d.bar.rgba[3]
  $worstBg = @(
    [int][Math]::Round(255 * $alpha),
    [int][Math]::Round(255 * $alpha),
    [int][Math]::Round(255 * $alpha)
  )
  $ratio = ContrastRatio $textRgb $worstBg
  Check ("footer wording keeps >=4.5:1 contrast over the darkest photo (worst case {0:N2}:1)" -f $ratio) ($ratio -ge 4.5) ("ratio={0:N2}" -f $ratio)
  Check 'footer text sits inside the bar' (($d.text.y -ge $d.footer.y) -and (($d.text.y + 20) -le $d.footer.bottom)) "textY=$($d.text.y) bar=$($d.footer.y)..$($d.footer.bottom)"
  Check 'footer does not overlap page content vertically' ($d.footer.y -ge 0) "y=$($d.footer.y)"

  # --- dark mode: same bar, dark glass over the gradient --------------------
  $darkPayload = @{
    id     = 2
    method = 'Runtime.evaluate'
    params = @{
      expression   = "document.documentElement.classList.add('dark'); 'ok'"
      returnByValue = $true
    }
  } | ConvertTo-Json -Compress -Depth 6
  [void](Invoke-Cdp -wsUrl $target.webSocketDebuggerUrl -json $darkPayload)
  Start-Sleep -Milliseconds 400
  $dark = Get-Probe -wsUrl $target.webSocketDebuggerUrl -payload $payload

  Write-Host ("dark bar rgba={0} backdrop={1}" -f ($dark.bar.rgba -join ','), $dark.bar.backdrop)
  Write-Host ("dark text rgba={0}" -f ($dark.text.rgba -join ','))

  Check 'dark mode: bar keeps its translucent glass' (([double]$dark.bar.rgba[3] -ge 0.4) -and ([double]$dark.bar.rgba[3] -le 0.95)) "rgba=$($dark.bar.rgba -join ',')"
  Check 'dark mode: bar glass is dark, not white' (($dark.bar.rgba[0] -le 60) -and ($dark.bar.rgba[1] -le 60) -and ($dark.bar.rgba[2] -le 70)) "rgba=$($dark.bar.rgba -join ',')"
  Check 'dark mode: wording switches to a light grey' (($dark.text.rgba[0] -ge 180) -and ($dark.text.rgba[1] -ge 180) -and ($dark.text.rgba[2] -ge 180)) "rgba=$($dark.text.rgba -join ',')"
  Check 'dark mode: rules switch to a lighter grey' ([double]$dark.spans[0].rgba[0] -ge 100) "rgba=$($dark.spans[0].rgba -join ',')"
  $darkRatio = ContrastRatio $dark.text.rgba @(16, 24, 40)
  Check ("dark mode: wording keeps >=4.5:1 contrast on the dark bar ({0:N2}:1)" -f $darkRatio) ($darkRatio -ge 4.5) ("ratio={0:N2}" -f $darkRatio)

  # --- small screen: the bar must still show both hairlines ----------------
  $mobile = @{
    id     = 3
    method = 'Emulation.setDeviceMetricsOverride'
    params = @{ width = 390; height = 844; deviceScaleFactor = 2; mobile = $true }
  } | ConvertTo-Json -Compress -Depth 6
  [void](Invoke-Cdp -wsUrl $target.webSocketDebuggerUrl -json $mobile)
  Start-Sleep -Milliseconds 600
  $m = Get-Probe -wsUrl $target.webSocketDebuggerUrl -payload $payload

  Write-Host ("mobile   viewport={0}x{1} bar h={2} text w={3} cx={4}" -f $m.viewport.w, $m.viewport.h, $m.footer.h, $m.text.w, $m.text.cx)
  foreach ($s in $m.spans) { Write-Host ("mobile   rule x={0} w={1}" -f $s.x, $s.w) }

  Check 'mobile: bar spans the screen' ([Math]::Abs($m.footer.w - $m.viewport.w) -le 2) "w=$($m.footer.w) viewport=$($m.viewport.w)"
  Check 'mobile: bar stays flush with the bottom edge' ([Math]::Abs($m.footer.bottom - $m.viewport.h) -le 2) "bottom=$($m.footer.bottom) viewport=$($m.viewport.h)"
  Check 'mobile: wording is still centred' ([Math]::Abs($m.text.cx - ($m.viewport.w / 2)) -le 4) "cx=$($m.text.cx)"
  Check 'mobile: wording is not clipped by the screen edge' (($m.text.x -ge 0) -and (($m.text.x + $m.text.w) -le $m.viewport.w)) "textX=$($m.text.x) textW=$($m.text.w)"
  Check 'mobile: both hairlines keep visible width' (($m.spans.Count -eq 2) -and ($m.spans[0].w -ge 8) -and ($m.spans[1].w -ge 8)) "widths=$(($m.spans | ForEach-Object { $_.w }) -join ',')"
}
finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $edge } | ForEach-Object {
    try { if ($_.StartTime -ge $proc.StartTime) { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } } catch { }
  }
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host ("PASSED={0} FAILED={1}" -f $passed, $failed)
if ($failed -gt 0) { exit 1 }
