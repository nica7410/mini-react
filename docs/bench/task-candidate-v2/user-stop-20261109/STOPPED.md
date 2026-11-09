# E4 automatic follow-ups stopped

The user requested stopping the running 10,000-row benchmark and all automatic follow-ups on 2026-11-09. No benchmark or driver process remained at verification.

The 10,000-row run is incomplete: session 1, first E1/A1 move condition, 95 measured samples out of 180. Its 102 JSONL rows and original environment are preserved. Do not use this partial run as a policy PASS.

The 100-row and separately completed 10-row supplements are preserved with their existing analyses. Their completion is historical, not permission to continue measuring.

The original driver and logs are archived here. The local driver checks a cancellation marker before launching anything. See preservation-manifest.json for byte-exact hashes. Resume with saved-result review and a final policy decision in Claude Code; do not automatically restart the cancelled queue.
