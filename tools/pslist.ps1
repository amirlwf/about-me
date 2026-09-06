Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match 'node|chrome' } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine |
  Format-Table -AutoSize -Wrap
