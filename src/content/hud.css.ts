export const HUD_CSS = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }

.toast, .bar, .help {
  --ink: #fff7ef;
  --ink-2: rgb(255 247 239 / 0.72);
  --amber: #ffb547;
  --rose: #ff4f7b;
  --heat: linear-gradient(90deg, var(--amber), var(--rose));
  font: 500 13px/1.3 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

/* Toast ----------------------------------------------------------------- */

.toast {
  position: fixed;
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 10px 18px;
  border-radius: 16px;
  background: rgb(14 12 12 / 0.78);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.08);
  transform: translate(-50%, -50%) scale(0.92);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.toast.show {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.toast-main {
  font: 700 26px/1.1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.toast-detail {
  color: var(--ink-2);
  font: 500 11.5px/1.2 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

/* Control bar ------------------------------------------------------------- */

.bar {
  position: fixed;
  top: 0;
  left: 0;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: linear-gradient(to top, rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.38) 70%, transparent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.bar.show {
  opacity: 1;
  pointer-events: auto;
}

.b {
  all: unset;
  flex: none;
  display: grid;
  place-items: center;
  height: 30px;
  min-width: 30px;
  border-radius: 8px;
  color: var(--ink);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}
.b:hover { background: rgb(255 255 255 / 0.14); }
.b:active { transform: scale(0.94); }
.b svg { width: 20px; height: 20px; fill: currentColor; }

.time {
  flex: none;
  padding: 0 4px;
  color: var(--ink-2);
  font: 500 11.5px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.track {
  position: relative;
  flex: 1;
  min-width: 40px;
  height: 22px;
  cursor: pointer;
  touch-action: none;
}
.track::before, .buffered, .fill {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  margin-top: -2px;
  border-radius: 4px;
  transform-origin: left center;
  transition: height 0.12s ease, margin-top 0.12s ease;
}
.track::before { background: rgb(255 255 255 / 0.22); }
.buffered { background: rgb(255 255 255 / 0.32); transform: scaleX(0); }
.fill { background: var(--heat); transform: scaleX(0); }
.track:hover::before, .track:hover .buffered, .track:hover .fill,
.track.dragging::before, .track.dragging .buffered, .track.dragging .fill {
  height: 6px;
  margin-top: -3px;
}
.thumb {
  position: absolute;
  top: 50%;
  width: 13px;
  height: 13px;
  margin: -6.5px 0 0 -6.5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 3px rgb(255 79 123 / 0.35), 0 1px 4px rgb(0 0 0 / 0.4);
  transform: scale(0);
  transition: transform 0.15s ease;
}
.track:hover .thumb, .track.dragging .thumb { transform: scale(1); }
.tip {
  position: absolute;
  bottom: 22px;
  padding: 3px 6px;
  border-radius: 6px;
  background: rgb(14 12 12 / 0.9);
  font: 600 11px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.track:hover .tip, .track.dragging .tip { opacity: 1; }

.speed-wrap { position: relative; flex: none; }
.speed {
  padding: 0 8px;
  font: 700 12.5px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.speed.changed {
  color: #1a0d05;
  background: var(--heat);
}
.speed.changed:hover { filter: brightness(1.08); background: var(--heat); }
.menu {
  position: absolute;
  right: 0;
  bottom: 36px;
  display: none;
  min-width: 76px;
  padding: 5px;
  border-radius: 12px;
  background: rgb(18 15 15 / 0.94);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 30px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(255 255 255 / 0.08);
}
.speed-wrap.open .menu { display: grid; gap: 1px; }
.menu-item {
  justify-content: end;
  height: 26px;
  padding: 0 10px;
  font: 600 12px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--ink-2);
}
.menu-item.active { color: var(--amber); }
.menu-item.active::before { content: '●'; margin-right: auto; padding-right: 8px; font-size: 7px; }

.vol { display: flex; align-items: center; flex: none; }
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 0;
  height: 22px;
  margin: 0;
  background: transparent;
  opacity: 0;
  cursor: pointer;
  transition: width 0.2s ease, opacity 0.2s ease, margin 0.2s ease;
}
.vol:hover .slider, .slider:active { width: 72px; opacity: 1; margin: 0 4px 0 6px; }
.slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(90deg, #fff var(--level, 0%), rgb(255 255 255 / 0.25) var(--level, 0%));
}
.slider::-moz-range-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(90deg, #fff var(--level, 0%), rgb(255 255 255 / 0.25) var(--level, 0%));
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border: 0;
  border-radius: 50%;
  background: #fff;
}
.slider::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff; }

.bar.narrow .time, .bar.narrow .pip { display: none; }
.bar.tiny .fs, .bar.tiny .vol .slider { display: none; }

/* Shortcut overlay ------------------------------------------------------------ */

.help {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(8 6 6 / 0.62);
  backdrop-filter: blur(6px);
  pointer-events: auto;
  animation: fade 0.18s ease;
}
.help-card {
  width: min(760px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 22px 24px 18px;
  border-radius: 20px;
  background:
    radial-gradient(120% 80% at 100% 0%, rgb(255 79 123 / 0.14), transparent 50%),
    radial-gradient(90% 70% at 0% 100%, rgb(255 181 71 / 0.1), transparent 55%),
    #151112;
  box-shadow: 0 30px 80px rgb(0 0 0 / 0.55), inset 0 0 0 1px rgb(255 255 255 / 0.07);
  animation: rise 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.help-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.help-head h2 { margin: 0; font-size: 20px; font-weight: 750; letter-spacing: -0.02em; }
.help-sub {
  font: 700 11px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background: var(--heat);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.help-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 6px 28px; }
.help h3 {
  margin: 12px 0 6px;
  color: var(--ink-2);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.help-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  border-bottom: 1px dashed rgb(255 255 255 / 0.07);
}
.label { color: var(--ink); font-size: 13px; }
.caps { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: end; }
.or { color: rgb(255 247 239 / 0.4); font-size: 11px; padding: 0 2px; }
.unbound { color: rgb(255 247 239 / 0.4); font-size: 12px; font-style: italic; }
kbd {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 6px;
  background: linear-gradient(#2c2526, #1f1a1b);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.12), 0 2px 0 #0b0909, 0 3px 6px rgb(0 0 0 / 0.35);
  color: var(--ink);
  font: 600 12px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.help-foot {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgb(255 255 255 / 0.08);
}
.help-foot p { flex: 1; margin: 0; color: var(--ink-2); font-size: 12px; line-height: 1.45; }
.help-btn {
  all: unset;
  flex: none;
  padding: 9px 14px;
  border-radius: 10px;
  background: var(--heat);
  color: #1a0d05;
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
}
.help-btn:hover { filter: brightness(1.08); }

@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(10px) scale(0.98); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
