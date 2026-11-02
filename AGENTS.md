<!-- UX_UI_AGENT_SKILLS_START -->
## UX/UI Agent Skills (XIAS)

For UI design, implementation, or review, read the installed kit doctrine at
`/Users/and1092/.local/share/ux-ui-agent-skills/source/AGENTS.md`.
The complete kit root is `/Users/and1092/.local/share/ux-ui-agent-skills/source`.
Resolve its relative `scripts/`, `tokens/`, `components/`, `taste/`, and
`design-systems/` paths against that root, not this application's root.
Run the relevant gates against this application's actual files using absolute
paths. The kit's `accuracy_report.mjs` tests the kit itself, not this application.

All 26 skills are registered in this project's `.agents/skills/`. Their
Claude-specific skill-directory placeholders are resolved at installation.
The `ux-ui-gates` MCP server exposes the kit's six gate and reference tools.
Claude Code hooks and its forked critic are not native Codex enforcement.
Existing project instructions and explicit user decisions take precedence.
<!-- UX_UI_AGENT_SKILLS_END -->

## Perintah data SAPA berdasarkan permintaan

Exact messages `update poli`, `update antrol` and `status update` invoke the fixed
workflow router in `.agents/skills/sapa-update-poli/SKILL.md`. They are approved
data operations, not requests to implement code. `update poli` updates Nama Poli;
`update antrol` updates antrean online per RS/FKRTL. Do not launch a 3D office,
create scheduled work, or run both workflows for one command. Use the browser embedded in this chat application and connected Google Sheets.
Do not use removed Poli/Aan agents, companion or browser runtime. Preserve write
deduplication, historical values, evidence and native spreadsheet verification.

## Karyawan AI: Penjaga Privasi & Keamanan

Pesan `patroli keamanan`, `perbaiki temuan <id>` dan `deploy perbaikan <PR>` memanggil
`.agents/skills/sapa-security-agent/SKILL.md`. Agen boleh membuat branch dan PR
perbaikan, tetapi deploy ke produksi hanya setelah CEO (pemilik repositori, di chat)
menyetujui PR tersebut secara eksplisit. Laporan di `automation/security_agent/reports/`
tidak di-commit karena repositori ini publik.
