// The aquarium owns an immersive dark surface inside the DSH page; all controls
// remain legible when the host does not define its optional CSS tokens.
export const cinematicStyle = `
.dsw-fish-page{--tank-ink:#edf7ef;--tank-muted:#a5bcb4;--tank-line:rgba(187,221,199,.15);--tank-accent:#b7e5c4;display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;background:radial-gradient(ellipse at 52% -28%,#254b3c 0,transparent 48%),#0c1918;color:var(--tank-ink);font-family:inherit;font-size:14px;line-height:1.5}
.dsw-fish-page *{box-sizing:border-box}
.dsw-fish-inner{display:flex;flex:1;flex-direction:column;gap:16px;width:100%;max-width:1510px;min-height:0;margin:0 auto;padding:26px clamp(20px,3.8vw,54px) 24px}
.dsw-fish-heading{display:flex;align-items:end;justify-content:space-between;gap:18px}
.dsw-fish-heading-text{min-width:0}
.dsw-fish-eyebrow{display:flex;align-items:center;gap:8px;margin:0 0 7px;color:#9fc8ad;font-size:10px;font-weight:700;letter-spacing:.19em;text-transform:uppercase}
.dsw-fish-eyebrow::before{content:'';width:6px;height:6px;border-radius:50%;background:#b8efb3;box-shadow:0 0 12px #b8efb3}
.dsw-fish-heading h1{margin:0;font-size:clamp(25px,2.5vw,34px);line-height:1.2;font-weight:600;letter-spacing:.04em;color:#f0f8ee}
.dsw-fish-subtitle{margin:6px 0 0;max-width:72ch;color:var(--tank-muted);font-size:12px;line-height:1.6}
.dsw-fish-feed{display:inline-flex;flex:none;align-items:center;justify-content:center;gap:9px;min-height:43px;padding:0 19px;border:1px solid rgba(211,255,220,.38);border-radius:12px;background:linear-gradient(145deg,#d5edc9,#a9d9b9);color:#17342a;font-family:inherit;font-size:13px;font-weight:600;line-height:1;letter-spacing:.02em;cursor:pointer;box-shadow:0 9px 24px rgba(0,0,0,.18),inset 0 1px rgba(255,255,255,.45);transition:transform .18s ease,filter .18s ease}
@media (hover:hover){.dsw-fish-feed:hover{filter:brightness(1.08);transform:translateY(-1px)}}
.dsw-fish-feed:active{transform:translateY(0)}
.dsw-fish-feed:focus-visible,.dsw-fish-tank:focus-visible{outline:2px solid #d6f5cd;outline-offset:3px}
.dsw-fish-feed:disabled{opacity:.44;cursor:not-allowed;transform:none}
.dsw-fish-tank{position:relative;flex:1;min-height:320px;overflow:hidden;border:1px solid rgba(196,231,201,.19);border-radius:19px;background:#103628;box-shadow:0 22px 65px rgba(0,0,0,.35),inset 0 0 0 1px rgba(244,255,238,.08)}
.dsw-fish-tank::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 1px 2px rgba(255,255,255,.24),inset 0 0 45px rgba(2,17,15,.33)}
.dsw-fish-canvas{display:block;width:100%;height:100%}
.dsw-fish-tank-label{position:absolute;top:17px;left:18px;display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid rgba(233,255,229,.15);border-radius:8px;background:rgba(9,31,24,.40);color:rgba(237,255,235,.88);font-size:10px;font-weight:600;letter-spacing:.14em;pointer-events:none;backdrop-filter:blur(10px)}
.dsw-fish-tank-label::before{content:'';width:5px;height:5px;border-radius:50%;background:#b4edba}
.dsw-fish-caption{position:absolute;left:50%;bottom:17px;max-width:calc(100% - 24px);padding:7px 13px;overflow:hidden;border:1px solid rgba(232,255,232,.18);border-radius:999px;background:rgba(6,25,21,.56);color:#e8f5e9;font-size:11px;line-height:16px;white-space:nowrap;text-overflow:ellipsis;transform:translateX(-50%);pointer-events:none;backdrop-filter:blur(10px)}
.dsw-fish-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;background:rgba(4,20,17,.67);color:#eaf6eb;backdrop-filter:blur(7px)}
.dsw-fish-empty-title{margin:0;font-size:19px;font-weight:600}
.dsw-fish-empty-body{max-width:34ch;margin:0 0 6px;color:#c0d3c7;font-size:12px;line-height:1.7}
.dsw-fish-notice{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0;font-size:12px;line-height:18px}
.dsw-fish-notice-died{color:#ffc3af}.dsw-fish-notice-born{color:#b9e7bd}
.dsw-fish-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.dsw-fish-stat{display:flex;flex-direction:column;gap:5px;min-width:0;padding:12px 16px;border:1px solid var(--tank-line);border-radius:12px;background:linear-gradient(155deg,rgba(219,255,220,.065),rgba(196,243,210,.018));box-shadow:inset 0 1px rgba(255,255,255,.025)}
.dsw-fish-stat-label{color:#91a99d;font-size:10px;font-weight:600;letter-spacing:.08em}
.dsw-fish-stat-value{overflow:hidden;color:#e7f3e9;font-size:14px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.dsw-fish-hungry{color:#f2ce99}
.dsw-fish-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 16px;margin:0}
.dsw-fish-rule{margin:0;color:#819b8f;font-size:11px;line-height:18px}
.dsw-fish-error{margin:0;padding:8px 12px;border:1px solid rgba(255,169,151,.4);border-radius:9px;color:#ffc8b8;background:rgba(99,38,30,.3);font-size:12px}
[data-platform='darwin'] .dsw-fish-inner{padding-top:calc(26px + var(--dsh-frame-top-clearance,0px))}
@media(max-width:720px){.dsw-fish-inner{padding:18px 16px;gap:12px}.dsw-fish-heading{align-items:center}.dsw-fish-subtitle{max-width:40ch}.dsw-fish-tank{flex:0 0 auto;height:clamp(310px,92vw,420px);min-height:0;border-radius:14px}.dsw-fish-stat{padding:10px}.dsw-fish-stat-value{font-size:12px}.dsw-fish-tank-label{top:12px;left:12px}}
@media(max-width:420px){.dsw-fish-feed{min-height:40px;padding:0 12px}.dsw-fish-subtitle{font-size:11px}.dsw-fish-stat-label{font-size:9px}.dsw-fish-meta{display:block}.dsw-fish-tank{min-height:0}}
/* The host's light-theme secondary ink is too dark on the aquarium surface. */
.dsw-fish-stats{display:flex;flex-wrap:wrap;gap:4px 10px;color:#c1d5c9}
.dsw-fish-game-card h2,.dsw-fish-game-description,.dsw-fish-game-small,.dsw-fish-journal,.dsw-fish-rule,.dsw-fish-sync,.dsw-fish-species small,.dsw-fish-resident small,.dsw-fish-game-rules p{color:#b5c9bc}
.dsw-fish-game-value,.dsw-fish-collection,.dsw-fish-game-rules,.dsw-fish-resident,.dsw-fish-hunt-toggle{color:#e6f2e8}
.dsw-fish-small-button{color:#dcefe1;border-color:rgba(199,228,207,.32)}
.dsw-fish-game-grid{border-color:rgba(199,228,207,.18)}
.dsw-fish-game-card{border-color:rgba(199,228,207,.18)}
.dsw-fish-collection>summary:focus-visible,.dsw-fish-game-rules>summary:focus-visible,.dsw-fish-info-button:focus-visible{outline:2px solid #d6f5cd;outline-offset:3px}
@media(prefers-reduced-motion:reduce){.dsw-fish-feed{transition:none}.dsw-fish-feed:hover{transform:none}}
`
