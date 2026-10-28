/**
 * The two HTML pages of a card top-up, served from our own origin (the one whitelisted with
 * GoFreshPay as `microform_allowed_origins`):
 *
 * - the checkout page, opened by the app in an in-app browser. Card number and CVV live in
 *   CyberSource iframes; this page only ever sees the transient token they produce. It runs the
 *   3DS steps (device data collection, then the issuer's OTP frame when asked) and hands control
 *   back to the app through its deep link;
 * - the 3DS return page, which the issuer's frame posts to after a challenge. It only tells its
 *   parent (the checkout page, same origin) that the challenge is over.
 *
 * The checkout token comes in the URL fragment (`#t=…`), which browsers never send to a server,
 * and is moved to sessionStorage then wiped from the address bar on load.
 */

const STYLES = `
  :root { --blue:#0B2A6F; --ink:#14181F; --muted:#5A6072; --line:#DCE0E8; --bg:#F5F7FB; --danger:#C7182B; --ok:#1F7D47; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--ink); }
  main { max-width:460px; margin:0 auto; padding:20px 16px 40px; }
  h1 { font-size:20px; margin:8px 0 4px; }
  .amount { font-size:30px; font-weight:700; color:var(--blue); margin:4px 0 20px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px; margin-bottom:14px; }
  label { display:block; font-size:13px; color:var(--muted); margin:12px 0 6px; font-weight:600; }
  label:first-child { margin-top:0; }
  .field, input, select { width:100%; height:46px; border:1px solid var(--line); border-radius:10px; padding:0 12px; font-size:16px; background:#fff; color:var(--ink); }
  .field { padding:12px; }
  .row { display:flex; gap:10px; } .row > div { flex:1; }
  button { width:100%; height:52px; border:0; border-radius:999px; background:var(--blue); color:#fff; font-size:16px; font-weight:700; margin-top:6px; }
  button:disabled { opacity:.55; }
  .hint { font-size:13px; color:var(--muted); line-height:1.45; }
  .error { color:var(--danger); font-size:14px; margin:10px 0 0; min-height:1em; }
  .status { text-align:center; padding:40px 8px; }
  .status h2 { margin:12px 0 6px; } .ok { color:var(--ok); } .ko { color:var(--danger); }
  #stepup { position:fixed; inset:0; background:rgba(10,15,30,.55); display:none; align-items:center; justify-content:center; padding:12px; }
  #stepup .sheet { background:#fff; border-radius:16px; width:100%; max-width:440px; overflow:hidden; }
  #stepup iframe { width:100%; height:500px; border:0; }
  .hidden { display:none !important; }
`

const SCRIPT = String.raw`
(() => {
  const sessionId = document.body.dataset.session;
  const returnUrl = document.body.dataset.return;
  const storeKey = 'card-checkout-' + sessionId;
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('t');
  if (fromHash) { try { sessionStorage.setItem(storeKey, fromHash); } catch (e) {} history.replaceState(null, '', location.pathname); }
  let token = fromHash;
  if (!token) { try { token = sessionStorage.getItem(storeKey); } catch (e) {} }

  const $ = (id) => document.getElementById(id);
  const show = (id) => { for (const s of ['loading', 'form', 'result']) $(s).classList.toggle('hidden', s !== id); };
  const fail = (message) => { $('error').textContent = message || 'Une erreur est survenue. Réessayez.'; $('pay').disabled = false; $('pay').textContent = 'Payer'; };

  async function api(path, body) {
    const res = await fetch('/api/v1/card-checkout/' + sessionId + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Checkout-Token': token || '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Erreur ' + res.status);
    return json.data;
  }

  function backToApp(status) {
    location.href = returnUrl + (returnUrl.includes('?') ? '&' : '?') + 'session=' + encodeURIComponent(sessionId) + '&status=' + encodeURIComponent(status);
  }

  let polls = 0;
  function result(data) {
    show('result');
    const done = data.status === 'completed', failed = data.status === 'failed' || data.status === 'expired';
    $('result-title').textContent = done ? 'Recharge réussie' : failed ? 'Paiement non abouti' : 'Paiement en cours de confirmation';
    $('result-title').className = done ? 'ok' : failed ? 'ko' : '';
    $('result-text').textContent = done ? 'Votre compte va être crédité dans un instant.'
      : failed ? (data.failure_message || 'Votre carte n\'a pas été débitée.')
      : 'Nous attendons la confirmation de votre banque. Vous serez notifié dans l\'application.';
    $('back').onclick = () => backToApp(data.status);
    // About two minutes of polling; past that the app's notification takes over.
    if (!done && !failed && polls++ < 30) setTimeout(async () => { try { result(await api('')); } catch (e) {} }, 4000);
    else setTimeout(() => backToApp(data.status), 2500);
  }

  // Cardinal fingerprint: hidden form posted into a hidden frame, done on "profile.completed".
  function collectDeviceData(url, jwt) {
    return new Promise((resolve) => {
      const frame = document.createElement('iframe'); frame.name = 'cs-ddc-frame'; frame.style.display = 'none';
      const form = document.createElement('form'); form.method = 'POST'; form.action = url; form.target = 'cs-ddc-frame'; form.style.display = 'none';
      const input = document.createElement('input'); input.type = 'hidden'; input.name = 'JWT'; input.value = jwt; form.appendChild(input);
      let finished = false;
      const finish = () => { if (finished) return; finished = true; window.removeEventListener('message', onMessage); frame.remove(); form.remove(); resolve(); };
      const onMessage = (event) => {
        if (!String(event.origin).includes('cardinalcommerce.com')) return;
        try { const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; if (data && data.MessageType === 'profile.completed') finish(); } catch (e) {}
      };
      window.addEventListener('message', onMessage);
      document.body.appendChild(frame); document.body.appendChild(form); form.submit();
      setTimeout(finish, 8000);
    });
  }

  // Issuer OTP frame; the 3DS return page (same origin) posts "3ds-complete" when it is over.
  function challenge(url, jwt) {
    return new Promise((resolve, reject) => {
      $('stepup').style.display = 'flex';
      const form = document.createElement('form'); form.method = 'POST'; form.action = url; form.target = 'cs-stepup-frame'; form.style.display = 'none';
      const input = document.createElement('input'); input.type = 'hidden'; input.name = 'JWT'; input.value = jwt; form.appendChild(input);
      document.body.appendChild(form);
      const close = () => { window.removeEventListener('message', onMessage); clearTimeout(timer); form.remove(); $('stepup').style.display = 'none'; };
      const onMessage = (event) => { if (event.origin === location.origin && event.data && event.data.type === '3ds-complete') { close(); resolve(); } };
      const timer = setTimeout(() => { close(); reject(new Error('Le délai de validation par votre banque est dépassé.')); }, 5 * 60 * 1000);
      window.addEventListener('message', onMessage);
      form.submit();
    });
  }

  /** CyberSource puts the SDK URL and its integrity hash in the capture context JWT. */
  function clientLibraryOf(jwt) {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(part + '='.repeat((4 - part.length % 4) % 4)))));
    let found = null;
    (function walk(node) { if (!node || typeof node !== 'object' || found) return; if (node.clientLibrary) { found = node; return; } Object.values(node).forEach(walk); })(payload);
    if (!found) throw new Error('Contexte de paiement invalide.');
    return { src: found.clientLibrary, integrity: found.clientLibraryIntegrity };
  }

  function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
      s.onload = resolve; s.onerror = () => reject(new Error('Impossible de charger le formulaire de carte.')); document.head.appendChild(s);
    });
  }

  async function start() {
    if (!token) { show('result'); $('result-title').textContent = 'Lien expiré'; $('result-text').textContent = 'Relancez la recharge depuis l\'application.'; $('back').onclick = () => backToApp('expired'); return; }
    let ctx;
    try { ctx = await api(''); } catch (e) { show('result'); $('result-title').textContent = 'Lien expiré'; $('result-text').textContent = 'Relancez la recharge depuis l\'application.'; $('back').onclick = () => backToApp('expired'); return; }
    if (!['created', 'authenticating', 'challenge'].includes(ctx.status)) return result(ctx);

    $('amount').textContent = ctx.amount_label;
    $('phone').value = ctx.billing.phone_number || '';
    $('country').value = ctx.billing.address_country || 'CD';
    const years = $('exp-year'); const now = new Date().getFullYear();
    for (let y = now; y <= now + 15; y++) years.add(new Option(String(y), String(y)));

    const lib = clientLibraryOf(ctx.capture_context);
    await loadScript(lib.src, lib.integrity);
    const flex = new Flex(ctx.capture_context);
    const microform = flex.microform({ styles: { input: { 'font-size': '16px', color: '#14181F' }, ':focus': { color: '#0B2A6F' }, invalid: { color: '#C7182B' } } });
    microform.createField('number', { placeholder: '1234 5678 9012 3456' }).load('#cs-number');
    microform.createField('securityCode', { placeholder: '•••' }).load('#cs-cvv');
    show('form');

    $('form').addEventListener('submit', (event) => {
      event.preventDefault();
      $('error').textContent = '';
      $('pay').disabled = true; $('pay').textContent = 'Vérification…';
      microform.createToken({ expirationMonth: $('exp-month').value, expirationYear: $('exp-year').value }, async (err, transientToken) => {
        if (err) return fail(err.message || 'Vérifiez le numéro, la date et le code de la carte.');
        try {
          const setup = await api('/setup', { transient_token: transientToken });
          await collectDeviceData(setup.device_data_collection_url, setup.access_token);
          const enrolled = await api('/enroll', {
            transient_token: transientToken,
            reference_id: setup.reference_id,
            address_line1: $('address').value,
            address_city: $('city').value,
            address_country: $('country').value,
            phone_number: $('phone').value,
          });
          if (enrolled.next === 'challenge') {
            $('pay').textContent = 'Validation par votre banque…';
            await challenge(enrolled.step_up_url, enrolled.access_token);
            $('pay').textContent = 'Paiement…';
            return result(await api('/charge', { transient_token: transientToken }));
          }
          result(enrolled.session);
        } catch (e) { fail(e.message); }
      });
    });
  }

  start().catch((e) => { show('form'); fail(e.message); });
})();
`

const COUNTRIES: Array<[string, string]> = [
  ['CD', 'RD Congo'],
  ['BI', 'Burundi'],
  ['RW', 'Rwanda'],
  ['UG', 'Ouganda'],
  ['KE', 'Kenya'],
  ['TZ', 'Tanzanie'],
  ['CG', 'Congo'],
  ['ZA', 'Afrique du Sud'],
  ['BE', 'Belgique'],
  ['FR', 'France'],
  ['US', 'États-Unis'],
]

export function renderCheckoutPage(params: { sessionId: string; returnUrl: string }): string {
  const attr = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `<option value="${m}">${m}</option>`
  }).join('')
  const countries = COUNTRIES.map(
    ([code, name]) => `<option value="${code}">${name}</option>`
  ).join('')

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Recharge par carte — Reemite</title>
<style>${STYLES}</style>
</head>
<body data-session="${attr(params.sessionId)}" data-return="${attr(params.returnUrl)}">
<main>
  <h1>Recharge par carte</h1>
  <div class="amount" id="amount">…</div>

  <div id="loading" class="hint">Chargement du formulaire sécurisé…</div>

  <form id="form" class="hidden" autocomplete="on">
    <div class="card">
      <label>Numéro de carte</label>
      <div id="cs-number" class="field"></div>
      <div class="row">
        <div><label for="exp-month">Mois</label><select id="exp-month">${months}</select></div>
        <div><label for="exp-year">Année</label><select id="exp-year"></select></div>
        <div><label>CVV</label><div id="cs-cvv" class="field"></div></div>
      </div>
    </div>
    <div class="card">
      <label for="address">Adresse de facturation</label>
      <input id="address" required minlength="3" maxlength="120" autocomplete="address-line1" placeholder="Av. Kasa-Vubu 42">
      <div class="row">
        <div><label for="city">Ville</label><input id="city" required minlength="2" maxlength="60" autocomplete="address-level2" placeholder="Kinshasa"></div>
        <div><label for="country">Pays</label><select id="country">${countries}</select></div>
      </div>
      <label for="phone">Téléphone</label>
      <input id="phone" required inputmode="tel" autocomplete="tel" placeholder="+243 81 234 5001">
    </div>
    <p class="hint">Les données de votre carte sont saisies dans un champ sécurisé de notre prestataire et ne passent jamais par Reemite. Votre banque peut vous demander un code de confirmation.</p>
    <button id="pay" type="submit">Payer</button>
    <p class="error" id="error" role="alert"></p>
  </form>

  <section id="result" class="status hidden">
    <h2 id="result-title"></h2>
    <p class="hint" id="result-text"></p>
    <button id="back" type="button">Retour à l'application</button>
  </section>
</main>
<div id="stepup" role="dialog" aria-label="Validation par votre banque"><div class="sheet"><iframe name="cs-stepup-frame" title="Validation 3D Secure"></iframe></div></div>
<script>${SCRIPT}</script>
</body>
</html>`
}

export function renderThreeDsReturnPage(): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>3D Secure</title></head>
<body><script>
  if (window.parent !== window) window.parent.postMessage({ type: '3ds-complete' }, window.location.origin);
</script></body></html>`
}
