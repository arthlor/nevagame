import { expect, test, type Page } from "@playwright/test";

// Temporary Phase-1 readability audit probe. Deleted after use.
const AUDIT_JS = `(() => {
  const out = { texts: [], targets: [], overlaps: [], uiScale: null, dataMobile: null, sweep: [] };
  const ui = document.querySelector('#ui-container');
  out.uiScale = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim();
  out.dataMobile = ui?.getAttribute('data-mobile-device');
  const zoomOf = (el) => {
    let z = 1;
    for (let n = el; n; n = n.parentElement) {
      const raw = getComputedStyle(n).getPropertyValue('zoom');
      const v = raw === 'normal' || raw === '' ? 1 : Number(raw);
      if (Number.isFinite(v) && v > 0) z *= v;
    }
    return z;
  };
  const visible = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const TEXT_SELS = [
    '.quest-title', '.quest-objective-text', '.hud-clock-time', '.hud-clock-season',
    '.guild-gold', '.hud-weather-badge', '.hud-vitals-readout', '.guild-tool-count',
    '.guild-capacity', '.banner-text', '.hud-toast-pill', '.guild-purse',
    '.fishing-target-name', '.fishing-energy-value', '.fishing-decision-copy',
    '.fishing-tension-word', '.fishing-telemetry-run-head', '.boat-panel-name',
    '.hud-context-note', '.modal-body', '.dialogue-text', '.market-ticket-price',
    '.inventory-capacity-pill', '.journal-section-title', '.map-subtitle'
  ];
  for (const sel of TEXT_SELS) {
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const cssPx = Number.parseFloat(cs.fontSize);
      const phys = cssPx * zoomOf(el);
      const r = el.getBoundingClientRect();
      out.texts.push({ sel, cssPx: +cssPx.toFixed(1), physPx: +phys.toFixed(1), w: +r.width.toFixed(0), h: +r.height.toFixed(0), text: (el.textContent || '').trim().slice(0, 42) });
    }
  }
  for (const el of document.querySelectorAll('#ui-container button, #ui-container [role="button"], #ui-container input, #ui-container select, #ui-container summary')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inView = cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight;
    const hit = inView ? document.elementFromPoint(cx, cy) : null;
    out.targets.push({
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
      cls: String(el.className || '').split(' ').slice(0, 3).join('.'),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      hit: !inView ? 'scrolled' : (hit === el || (hit instanceof Node && el.contains(hit)))
    });
  }
  const anchors = [...document.querySelectorAll('.hud-cluster, .mobile-action-cluster, .mobile-steer-cluster, .mobile-joystick, .fishing-hud-container, .guild-fish-target, .planting-dock, .modal-content, .dialogue-card, .forecast-popover, .hud-toast-container')]
    .filter(a => visible(a))
    .map(a => { const r = a.getBoundingClientRect(); return { name: a.getAttribute('edge') || a.getAttribute('aria-label') || a.dataset.testid || a.className.toString().split(' ').slice(0,2).join('.'), l: +r.left.toFixed(0), t: +r.top.toFixed(0), r: +r.right.toFixed(0), b: +r.bottom.toFixed(0) }; });
  for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) {
    const a = anchors[i], b = anchors[j];
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (w > 1 && h > 1) {
      out.overlaps.push({ a: a.name, b: b.name, area: Math.round(w * h) });
    }
  }
  const sweepRoots = document.querySelectorAll('.guildcraft-hud .guild-status-anchor, .guildcraft-hud .guild-objectives, .guildcraft-hud .guild-almanac-anchor, .guildcraft-hud .guild-utilities-anchor, .guildcraft-hud .guild-play-anchor, .guildcraft-hud .guild-notes-anchor');
  const seen = new Set();
  for (const root of sweepRoots) {
    for (const el of root.querySelectorAll('*')) {
      const text = ([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('') || '').trim();
      if (!text || text.length < 2) continue;
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const cssPx = Number.parseFloat(cs.fontSize);
      const phys = cssPx * zoomOf(el);
      const key = (typeof el.className === 'string' ? el.className : el.tagName).split(' ').sort().join('.');
      if (seen.has(key + text.slice(0, 12))) continue;
      seen.add(key + text.slice(0, 12));
      const r = el.getBoundingClientRect();
      out.sweep.push({ cls: key.slice(0, 80), cssPx: +cssPx.toFixed(1), physPx: +phys.toFixed(1), w: +r.width.toFixed(0), h: +r.height.toFixed(0), text: text.slice(0, 36) });
    }
  }
  out.sweep.sort((a, b) => a.physPx - b.physPx);
  return out;
})()`;

async function audit(page: Page, tag: string) {
  await page.evaluate(() => (document as any).fonts.ready);
  const data: any = await page.evaluate(`(${AUDIT_JS})`);
  // eslint-disable-next-line no-console
  console.log(`AUDIT[${tag}] ` + JSON.stringify({ ...data, sweep: undefined }));
  // eslint-disable-next-line no-console
  console.log(`SWEEP[${tag}] ` + JSON.stringify(data.sweep));
  await page.screenshot({ path: `output/readability/${tag}.png` });
}

async function boot(page: Page, scenario: string) {
  await page.goto(`/?debug=1&debugStart=${scenario}&worldAcceptance=1`);
  await expect(page.locator('#game-canvas')).toBeVisible();
  const diagnostics = page.getByTestId('diagnostics');
  await expect(diagnostics).toBeVisible({ timeout: 150_000 });
  await expect(diagnostics).toHaveAttribute('data-boot-ready', 'true', { timeout: 150_000 });
  return diagnostics;
}

test('probeA: farm HUD + modals at 844x390', async ({ browser }) => {
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto('/?debug=1&debugStart=farm&worldAcceptance=1');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'output/readability/boot-startscreen.png' });
    await expect(page.locator('#game-canvas')).toBeVisible();
    const diagnostics = page.getByTestId('diagnostics');
    await expect(diagnostics).toBeVisible({ timeout: 150_000 });
    await expect(diagnostics).toHaveAttribute('data-boot-ready', 'true', { timeout: 150_000 });
    await audit(page, 'A-hud-onfoot');
    for (const [btn, dlg, tag] of [
      ['micro-btn-satchel', 'Satchel', 'A-modal-satchel'],
      ['micro-btn-journal', 'Field Journal', 'A-modal-journal'],
      ['micro-btn-map', 'Nautical Chart of the Neva Archipelago', 'A-modal-map'],
      ['micro-btn-menu', 'Paused', 'A-modal-pause']
    ] as const) {
      await page.getByTestId(btn).tap();
      await expect(page.getByRole('dialog', { name: dlg, exact: true })).toBeVisible({ timeout: 15_000 });
      await audit(page, tag);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Open current conditions and farm forecast', exact: true }).tap();
    await expect(page.locator('.forecast-popover')).toBeVisible();
    await audit(page, 'A-forecast');
    await page.keyboard.press('Escape');
  } finally {
    await context.close();
  }
});

test('probeB: sport fight at 844x390', async ({ browser }) => {
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await boot(page, 'sport-fishing');
    await expect(page.getByTestId('sport-fishing-hud')).toBeVisible();
    await expect(page.getByTestId('mobile-sport-controls')).toBeVisible();
    await audit(page, 'B-sport');
  } finally {
    await context.close();
  }
});

test('probeE: closer diagnostics', async ({ browser }) => {
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await boot(page, 'farm');
    const dump = (sel: string) => page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return { sel: s, missing: true };
      const chain: string[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        chain.push(`${n.tagName}.${(n.className && typeof n.className === 'string' ? n.className : '').split(' ').slice(0, 2).join('.')}[zoom=${getComputedStyle(n).getPropertyValue('zoom')}]`);
      }
      const hits: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of rules) {
          if (rule instanceof CSSMediaRule || rule instanceof CSSLayerBlockRule) { walk(rule.cssRules); continue; }
          if (rule instanceof CSSStyleRule) {
            try {
              if ((el as Element).matches(rule.selectorText) && (rule.style.getPropertyValue('min-height') || rule.style.getPropertyValue('min-width') || rule.style.getPropertyValue('height') || rule.style.getPropertyValue('width'))) {
                hits.push(`${rule.selectorText} => h:${rule.style.getPropertyValue('height')}${rule.style.getPropertyPriority('height') ? '!' : ''} mh:${rule.style.getPropertyValue('min-height')}${rule.style.getPropertyPriority('min-height') ? '!' : ''} w:${rule.style.getPropertyValue('width')}${rule.style.getPropertyPriority('width') ? '!' : ''} mw:${rule.style.getPropertyValue('min-width')}${rule.style.getPropertyPriority('min-width') ? '!' : ''}`);
              }
            } catch { /* invalid selector for matches */ }
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try { if (sheet.cssRules) walk(sheet.cssRules); } catch { /* x-origin */ }
      }
      const r = (el as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { sel: s, rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, computedMinH: cs.minHeight, computedH: cs.height, chain, hits };
    }, sel);
    await page.getByTestId('micro-btn-journal').tap();
    await expect(page.getByRole('dialog', { name: 'Field Journal', exact: true })).toBeVisible({ timeout: 15_000 });
    // eslint-disable-next-line no-console
    console.log('CLOSER[journal-close] ' + JSON.stringify(await dump('.journal-footer .neva-button')));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open current conditions and farm forecast', exact: true }).tap();
    await expect(page.locator('.forecast-popover')).toBeVisible();
    // eslint-disable-next-line no-console
    console.log('CLOSER[forecast-close] ' + JSON.stringify(await dump('.forecast-close-btn')));
    // eslint-disable-next-line no-console
    console.log('CLOSER[calendar] ' + JSON.stringify(await dump('.guild-calendar')));
    await page.keyboard.press('Escape');
  } finally {
    await context.close();
  }
});

test('probeF: ready title screen at 844x390', async ({ browser }) => {
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('#game-canvas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Neva Land' })).toBeVisible({ timeout: 150_000 });
    const later = page.getByRole('button', { name: 'Maybe Later' });
    if (await later.isVisible({ timeout: 10_000 }).catch(() => false)) await later.tap();
    await audit(page, 'F-title');
  } finally {
    await context.close();
  }
});

test('probeC: boat HUD at 844x390', async ({ browser }) => {
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await boot(page, 'boat-driving');
    await audit(page, 'C-boat');
  } finally {
    await context.close();
  }
});

test('probeD: farm HUD at 740x360', async ({ browser }) => {
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await boot(page, 'farm');
    await audit(page, 'D-hud-small');
    await page.getByTestId('micro-btn-satchel').tap();
    await expect(page.getByRole('dialog', { name: 'Satchel', exact: true })).toBeVisible({ timeout: 15_000 });
    await audit(page, 'D-modal-satchel-small');
    await page.keyboard.press('Escape');
  } finally {
    await context.close();
  }
});
